# Jobs System — Spec

## Overview

Jobs are managed processes that Anton can create, run, schedule, and monitor. A job is a shell command or script that Anton spawns, captures output from, and manages the lifecycle of. Jobs enable automation like LinkedIn outreach, data pipelines, monitoring bots, and scheduled tasks — replacing $300/seat tools like Starnas.

## Architecture

```
JobRunner (interface)          ← extensibility point
  └── LocalJobRunner           ← spawns child processes (current)
  └── ModalJobRunner           ← future: Modal sandboxes
  └── DaytonaJobRunner         ← future: Daytona sandboxes

JobManager                     ← CRUD, lifecycle, cron scheduling, log capture
  ├── uses JobRunner to start/stop processes
  ├── persists jobs to ~/.anton/projects/{id}/jobs/
  ├── captures stdout/stderr to per-run log files
  ├── emits events (started/completed/failed/crashed)
  └── manages cron tick loop (30s interval)

Agent "job" tool               ← lets the AI create/manage jobs via chat
Protocol messages              ← desktop UI ↔ server communication
Desktop UI                     ← job list, start/stop, log viewer
```

## Job Types

### Task Job (`kind: 'task'`)
Run once, produce output, exit. Re-runnable. Resets to `idle` after completion.
- Example: "Send today's batch of 40 LinkedIn connection requests"
- Example: "Run the data export script"

### Long-Running Job (`kind: 'long-running'`)
Start and keep running. Has restart policy for crash recovery.
- Example: "Monitor Polymarket odds via WebSocket"
- Example: "Watch for new leads in the CRM"

## Job Lifecycle

```
                  create
                    │
                    ▼
    ┌──────────── idle ◄────────────┐
    │               │               │
    │            start              │
    │               │          (task completes
    │               ▼           successfully)
    │           running ─────────►──┘
    │            │    │
    │          stop   crash/fail
    │            │    │
    │            ▼    ▼
    │          idle  error
    │                 │
    │           (if restart policy)
    │                 │
    │                 ▼
    │             running (restart)
    │
    └──── delete (from any state)
```

### Restart Policy (long-running jobs only)
- `never` — don't restart on crash (default for task jobs)
- `on-failure` — restart if exit code != 0 (default for long-running jobs)
- `always` — always restart on exit

Max restarts: configurable, default 3. After exceeding, job stays in `error`.

## Scheduling

Jobs with `trigger: { type: 'cron', schedule: '...' }` are scheduled via a 5-field cron expression (minute hour day-of-month month day-of-week). The JobManager checks every 30 seconds for due jobs.

Cron supports: `*`, `*/N` (step), `N-M` (range), `N,M,O` (list).

## Storage

```
~/.anton/projects/{projectId}/jobs/{jobId}/
├── job.json              # Job definition and current state
└── runs/
    ├── {runId}.log       # stdout/stderr log (append-only)
    └── {runId}.json      # Run metadata (start, end, exit code)
```

Notifications: `~/.anton/projects/{projectId}/notifications/feed.jsonl`

## Job Definition (job.json)

```typescript
interface Job {
  id: string              // "job_lxyz_abc123"
  projectId: string
  name: string
  description: string
  kind: 'task' | 'long-running'
  status: 'idle' | 'running' | 'paused' | 'error' | 'completed'
  trigger: { type: 'cron'; schedule: string } | { type: 'manual' } | { type: 'event'; event: string }

  command: string         // shell command to execute
  args: string[]
  workingDirectory?: string  // defaults to project workspace
  env: Record<string, string>
  timeout: number         // seconds, 0 = no limit

  restartPolicy: 'never' | 'on-failure' | 'always'
  maxRestarts: number

  runner: string          // 'local' (extensible to 'modal', 'daytona')

  lastRun: JobRunRecord | null
  nextRun: number | null  // timestamp for cron jobs
  runCount: number

  createdAt: number
  updatedAt: number
}
```

## Protocol Messages

### Client → Server (AI Channel)
| Message | Purpose |
|---------|---------|
| `job_create` | Create a new job |
| `jobs_list` | List all jobs for a project |
| `job_action` | Start, stop, or delete a job |
| `job_logs` | Get log lines for a job run |

### Server → Client (AI Channel)
| Message | Purpose |
|---------|---------|
| `job_created` | Job was created |
| `jobs_list_response` | List of jobs |
| `job_updated` | Job state changed |
| `job_deleted` | Job was removed |
| `job_logs_response` | Log lines |

### Server → Client (Events Channel)
| Message | Purpose |
|---------|---------|
| `job_event` | Real-time: started, completed, failed, crashed, stopped |
| `notification` | Notification: job lifecycle events persisted to JSONL |

## Agent Tool

The `job` tool is available in project-scoped sessions. Operations:

| Operation | Description |
|-----------|-------------|
| `create` | Create a new job (requires name, command, kind) |
| `list` | Show all jobs in the project |
| `start` | Start a job by ID |
| `stop` | Stop a running job |
| `delete` | Remove a job |
| `logs` | View recent log output |
| `status` | Check detailed status of a job |

## Runner Extensibility

The `JobRunner` interface is the extensibility point:

```typescript
interface JobRunner {
  readonly name: string  // 'local' | 'modal' | 'daytona'
  start(options: JobRunnerOptions): JobRunHandle
  isAvailable(): Promise<boolean>
}
```

To add a new runner:
1. Implement `JobRunner` (e.g. `ModalJobRunner`)
2. Register: `jobManager.registerRunner(new ModalJobRunner())`
3. Jobs specify `runner: 'modal'` — no other changes needed

## Future Considerations

- **Job manifests** — Declare inputs/outputs/notifications schema upfront so the agent knows the job's interface before running it
- **Listener jobs** — Long-running jobs that push events to the agent (e.g. Polymarket monitor). Simple HTTP POST to Anton's API.
- **Remote jobs** — Jobs running on Modal/Daytona. HTTP replaces stdio as the communication channel.
- **Live log streaming** — WebSocket push instead of polling for real-time log viewing
- **Job templates** — Pre-built job definitions for common tasks (LinkedIn bot, Reddit poster, data sync)
- **Job groups** — Multiple related jobs managed as a unit (e.g. "LinkedIn campaign" = send + monitor + report)

## Files

### New
- `packages/agent-server/src/jobs/cron.ts` — Shared cron parser
- `packages/agent-server/src/jobs/runner.ts` — JobRunner interface
- `packages/agent-server/src/jobs/local-runner.ts` — Local process runner
- `packages/agent-server/src/jobs/manager.ts` — JobManager class
- `packages/agent-server/src/jobs/notifications.ts` — JSONL notification persistence
- `packages/agent-server/src/jobs/index.ts` — Barrel export
- `packages/agent-core/src/tools/job.ts` — Agent job tool

### Modified
- `packages/protocol/src/projects.ts` — Extended Job type
- `packages/protocol/src/messages.ts` — Job + notification messages
- `packages/agent-server/src/scheduler.ts` — Imports shared cron
- `packages/agent-server/src/server.ts` — Job handlers + wiring
- `packages/agent-server/src/index.ts` — JobManager init
- `packages/agent-core/src/agent.ts` — Job tool registration
- `packages/agent-core/src/session.ts` — onJobAction callback passthrough
- `packages/desktop/src/lib/store.ts` — Job state + message handlers
- `packages/desktop/src/lib/connection.ts` — Job sender methods
- `packages/desktop/src/components/projects/ProjectJobs.tsx` — Job list UI
- `packages/desktop/src/components/projects/ProjectConfigPanel.tsx` — Integrated jobs section
- `packages/desktop/src/index.css` — Job card + log viewer styles
