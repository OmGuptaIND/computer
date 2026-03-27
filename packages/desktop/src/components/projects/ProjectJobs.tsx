import type { Job } from '@anton/protocol'
import { Circle, Clock, Play, Square, Terminal, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { connection } from '../../lib/connection.js'
import { useStore } from '../../lib/store.js'

const STATUS_COLORS: Record<string, string> = {
  idle: 'var(--text-tertiary)',
  running: 'var(--accent)',
  paused: 'var(--text-secondary)',
  error: 'var(--red)',
  completed: 'var(--green)',
}

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || 'var(--text-tertiary)'
  const pulse = status === 'running'
  return <Circle size={8} fill={color} stroke="none" className={pulse ? 'pulse-dot' : ''} />
}

function formatTime(ts: number | null): string {
  if (!ts) return 'Never'
  const d = new Date(ts)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return d.toLocaleDateString()
}

function JobCard({
  job,
  projectId,
  onViewLogs,
}: { job: Job; projectId: string; onViewLogs: (jobId: string) => void }) {
  const isRunning = job.status === 'running'

  return (
    <div className="job-card">
      <div className="job-card__header">
        <StatusDot status={job.status} />
        <span className="job-card__name">{job.name}</span>
        <span className="job-card__kind">{job.kind}</span>
      </div>
      {job.description && <p className="job-card__desc">{job.description}</p>}
      <div className="job-card__meta">
        {job.trigger.type === 'cron' && (
          <span className="job-card__schedule">
            <Clock size={11} strokeWidth={1.5} />
            {job.trigger.schedule}
          </span>
        )}
        <span className="job-card__last-run">
          {job.lastRun
            ? `Last: ${job.lastRun.status === 'success' ? 'OK' : job.lastRun.status} ${formatTime(job.lastRun.startedAt)}`
            : 'Never run'}
        </span>
      </div>
      <div className="job-card__actions">
        {isRunning ? (
          <button
            type="button"
            className="job-card__btn job-card__btn--stop"
            onClick={() => connection.sendJobAction(projectId, job.id, 'stop')}
            title="Stop"
          >
            <Square size={12} strokeWidth={1.5} />
          </button>
        ) : (
          <button
            type="button"
            className="job-card__btn job-card__btn--start"
            onClick={() => connection.sendJobAction(projectId, job.id, 'start')}
            title="Start"
          >
            <Play size={12} strokeWidth={1.5} />
          </button>
        )}
        <button
          type="button"
          className="job-card__btn"
          onClick={() => onViewLogs(job.id)}
          title="View logs"
        >
          <Terminal size={12} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="job-card__btn job-card__btn--delete"
          onClick={() => connection.sendJobAction(projectId, job.id, 'delete')}
          title="Delete"
        >
          <Trash2 size={12} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

function JobLogViewer({
  jobId,
  projectId,
  onClose,
}: { jobId: string; projectId: string; onClose: () => void }) {
  const jobLogs = useStore((s) => s.jobLogs)
  const jobs = useStore((s) => s.projectJobs)
  const job = jobs.find((j) => j.id === jobId)

  useEffect(() => {
    connection.sendJobLogs(projectId, jobId, 200)
    const interval = setInterval(() => {
      connection.sendJobLogs(projectId, jobId, 200)
    }, 3000) // poll every 3s for live logs
    return () => clearInterval(interval)
  }, [projectId, jobId])

  return (
    <div className="job-logs">
      <div className="job-logs__header">
        <Terminal size={14} strokeWidth={1.5} />
        <span>Logs: {job?.name || jobId}</span>
        <button type="button" className="job-logs__close" onClick={onClose}>
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
      <div className="job-logs__content">
        {jobLogs.length > 0 ? (
          <pre className="job-logs__pre">{jobLogs.join('\n')}</pre>
        ) : (
          <p className="job-logs__empty">No logs yet.</p>
        )}
      </div>
    </div>
  )
}

interface Props {
  projectId: string
}

export function ProjectJobs({ projectId }: Props) {
  const jobs = useStore((s) => s.projectJobs)
  const [viewingLogsFor, setViewingLogsFor] = useState<string | null>(null)

  useEffect(() => {
    connection.sendJobsList(projectId)
  }, [projectId])

  if (viewingLogsFor) {
    return (
      <JobLogViewer
        jobId={viewingLogsFor}
        projectId={projectId}
        onClose={() => setViewingLogsFor(null)}
      />
    )
  }

  return (
    <div className="project-jobs">
      {jobs.length > 0 ? (
        <div className="project-jobs__list">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} projectId={projectId} onViewLogs={setViewingLogsFor} />
          ))}
        </div>
      ) : (
        <p className="config-section__hint">
          No jobs yet. Use the agent to create jobs, e.g. "Create a job that runs my Python script
          every day at 9am."
        </p>
      )}
    </div>
  )
}
