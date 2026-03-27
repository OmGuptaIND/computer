# Jobs & Notifications — Architecture Spec

> Anton can create, run, schedule, and monitor jobs. A job is any process — a Python script, a shell command, a Node service — that Anton manages.

## What We're Building

Three kinds of jobs:

1. **Task job** — Run once, produce output, exit. "python analyze.py"
2. **Scheduled job** — Run on a cron schedule. "Every weekday at 9am, run this."
3. **Long-running job** — Start and keep running. "python polymarket_watcher.py"

Anton manages the full lifecycle: create the job definition, start it, capture its output, restart it if it crashes, stop it when told to. The agent can create jobs, read their output, and make decisions based on results.

## How It Works

### Task Job

```
Agent creates job → Agent starts job → Process runs → Process exits → Agent reads output
```

The agent decides what to run, provides inputs via environment variables or command args, reads stdout when done, and decides what to do next.

```
User: "Analyze the leads spreadsheet and tell me the top 50 prospects"

Agent:
  1. Writes a Python script to ~/Anton/linkedin-campaign/scripts/analyze.py
  2. Creates a task job: python analyze.py --input leads.xlsx --top 50
  3. Starts the job
  4. Job runs, prints results to stdout, exits
  5. Agent reads output, presents to user
```

### Scheduled Job

```
Cron fires → Agent starts job → Process runs → Process exits → Agent reads output → Repeat
```

Same as a task job, but on a timer. The agent can also check previous run results and adapt.

```
User: "Every weekday at 9am, send LinkedIn connections to the next batch of 40 leads"

Agent:
  1. Creates the send-connections script
  2. Creates a scheduled job: cron "0 9 * * 1-5", command: python send_connections.py
  3. Every weekday at 9am:
     - Agent checks leads.xlsx for who hasn't been contacted
     - Updates the script's config/args with the next batch
     - Job runs, sends requests, outputs results
     - Agent reads output, updates leads.xlsx
```

### Long-Running Job

```
Agent starts job → Process runs indefinitely → Anton monitors health → Agent reads logs on demand
```

The process stays alive. Anton watches it (is it still running? has it crashed?). The agent can check its logs, restart it, or kill it.

```
User: "Run the Polymarket watcher that monitors odds and trades autonomously"

Agent:
  1. Writes polymarket_watcher.py (includes its own LLM calls for decisions)
  2. Creates a long-running job: python polymarket_watcher.py
  3. Starts the job — process stays alive
  4. Anton monitors: process health, stdout capture
  5. If it crashes → restart (based on restart policy)
  6. Agent can check logs anytime: "How's the Polymarket bot doing?"
  7. User can stop it: "Kill the Polymarket watcher"
```

## Job Definition

```typescript
interface Job {
  id: string
  projectId: string
  name: string
  description: string

  // What to run
  command: string                    // "python send_connections.py"
  args: string[]                     // ["--batch-size", "40"]
  cwd: string                        // defaults to project workspace
  env: Record<string, string>        // environment variables

  // Schedule (null = manual only)
  schedule: string | null            // cron expression: "0 9 * * 1-5"

  // Lifecycle
  type: 'task' | 'long-running'
  restartPolicy: 'never' | 'on-failure' | 'always'   // for long-running
  maxRestarts: number                                  // default 3
  timeout: number                                      // seconds, 0 = no limit

  // Current state
  status: 'created' | 'active' | 'paused'
  runtime: JobRuntime | null

  // History
  lastRun: RunResult | null
  runCount: number

  createdAt: number
  updatedAt: number
}

interface JobRuntime {
  runId: string
  pid: number
  state: 'starting' | 'running' | 'stopping'
  startedAt: number
  exitCode: number | null
}

interface RunResult {
  runId: string
  startedAt: number
  completedAt: number
  exitCode: number
  state: 'done' | 'failed' | 'stopped' | 'crashed' | 'timeout'
  stdout: string                     // last N lines of stdout
  stderr: string                     // last N lines of stderr
  logFile: string                    // path to full log
}
```

## Job Manager

The `JobManager` class handles everything:

```typescript
class JobManager {
  // CRUD
  createJob(projectId: string, opts: CreateJobOpts): Job
  updateJob(jobId: string, updates: Partial<Job>): Job
  deleteJob(jobId: string): void
  getJob(jobId: string): Job
  listJobs(projectId: string): Job[]

  // Lifecycle
  startJob(jobId: string): void        // spawn the process
  stopJob(jobId: string): void         // SIGTERM → SIGKILL after 10s
  restartJob(jobId: string): void      // stop + start

  // Monitoring
  getJobLogs(jobId: string, lines?: number): string[]
  getJobStatus(jobId: string): JobRuntime | null

  // Scheduling
  start(): void                        // start the cron tick loop
  stop(): void                         // stop the cron tick loop
}
```

### Process Management

When a job starts:

```
1. Resolve command, args, cwd, env
2. child_process.spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
3. Pipe stdout → log file (append)
4. Pipe stderr → log file (append, prefixed with [stderr])
5. Track PID in runtime state
6. On exit → record RunResult, update state
7. If long-running + restartPolicy matches → restart
```

**stdout/stderr handling:**
- Everything goes to a log file: `~/.anton/projects/{projectId}/jobs/{jobId}/logs/{runId}.log`
- Last N lines are kept in memory for quick access via `getJobLogs()`
- No protocol parsing — just raw output capture
- The agent reads logs via the `job` tool and interprets them with its own intelligence

**Health monitoring for long-running jobs:**
- Simple: is the process still alive? Check `pid` exists.
- If process exits unexpectedly → state = `crashed`
- If `restartPolicy` is `on-failure` or `always` → restart up to `maxRestarts`
- Notification emitted on crash/restart

### Cron Scheduling

Reuse the existing cron parser from `packages/agent-server/src/scheduler.ts`:

```
Every 30 seconds:
  For each job where status = 'active' AND schedule != null:
    If cron matches current time AND job is not already running:
      startJob(jobId)
```

For scheduled task jobs, each run is independent. For long-running jobs, cron doesn't apply (they start once and stay alive).

## Agent Tool

The agent gets a `job` tool when working in a project context:

```typescript
{
  name: 'job',
  description: 'Create, run, and manage jobs in the current project',
  parameters: Type.Object({
    operation: Type.Union([
      Type.Literal('create'),
      Type.Literal('list'),
      Type.Literal('start'),
      Type.Literal('stop'),
      Type.Literal('restart'),
      Type.Literal('status'),
      Type.Literal('logs'),
      Type.Literal('delete'),
    ]),
    // For create:
    name: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    command: Type.Optional(Type.String()),
    args: Type.Optional(Type.Array(Type.String())),
    cwd: Type.Optional(Type.String()),
    env: Type.Optional(Type.Record(Type.String(), Type.String())),
    schedule: Type.Optional(Type.String()),       // cron expression
    type: Type.Optional(Type.Union([Type.Literal('task'), Type.Literal('long-running')])),
    restartPolicy: Type.Optional(Type.String()),
    timeout: Type.Optional(Type.Number()),
    // For start/stop/restart/status/logs/delete:
    jobId: Type.Optional(Type.String()),
    // For logs:
    lines: Type.Optional(Type.Number()),          // default 50
  })
}
```

**Example agent interactions:**

```
Agent: job.create({
  name: "send-connections",
  description: "Send LinkedIn connection requests",
  command: "python",
  args: ["scripts/send_connections.py", "--batch-size", "40"],
  schedule: "0 9 * * 1-5",
  type: "task",
  timeout: 600
})

Agent: job.start({ jobId: "send-connections" })

Agent: job.logs({ jobId: "send-connections", lines: 20 })
// Returns last 20 lines of stdout/stderr

Agent: job.list({})
// Returns all jobs with their current status

Agent: job.create({
  name: "polymarket-watcher",
  description: "Monitor Polymarket for trading opportunities",
  command: "python",
  args: ["scripts/polymarket_watcher.py"],
  type: "long-running",
  restartPolicy: "on-failure",
  maxRestarts: 5
})
```

## Notifications

Simple notification system — jobs produce notifications on key events:

| Event | Notification |
|-------|-------------|
| Task job completes (exit 0) | "Job 'send-connections' completed successfully" |
| Job fails (exit non-zero) | "Job 'send-connections' failed (exit code 1)" |
| Long-running job crashes | "Job 'polymarket-watcher' crashed, restarting (2/5)" |
| Max restarts exceeded | "Job 'polymarket-watcher' stopped after 5 crashes" |
| Scheduled job triggered | "Starting scheduled job 'send-connections'" |
| Job timeout | "Job 'send-connections' killed after 600s timeout" |

### Storage

```
~/.anton/projects/{projectId}/notifications/
└── 2026-03-27.jsonl
```

Each line:
```json
{"id":"n_1","jobId":"send-connections","severity":"success","title":"Job completed","body":"38 sent, 2 failed","createdAt":1711500000,"read":false}
```

### Delivery

1. **Persist** to JSONL file
2. **Push** to desktop client via EVENTS WebSocket channel
3. **OS notification** via osascript/notify-send (existing notification tool)

## Protocol Messages

### AI Channel (Client ↔ Server)

```typescript
// Client → Server
interface JobCreate { type: 'job_create'; projectId: string; job: CreateJobOpts }
interface JobUpdate { type: 'job_update'; projectId: string; jobId: string; updates: Partial<Job> }
interface JobDelete { type: 'job_delete'; projectId: string; jobId: string }
interface JobAction { type: 'job_action'; projectId: string; jobId: string; action: 'start' | 'stop' | 'restart' }
interface JobsList { type: 'jobs_list'; projectId: string }
interface JobLogs { type: 'job_logs'; projectId: string; jobId: string; lines?: number }

// Server → Client
interface JobsListResponse { type: 'jobs_list_response'; projectId: string; jobs: Job[] }
interface JobLogsResponse { type: 'job_logs_response'; projectId: string; jobId: string; logs: string[] }
interface JobCreated { type: 'job_created'; projectId: string; job: Job }
interface JobUpdated { type: 'job_updated'; projectId: string; job: Job }
```

### EVENTS Channel (Server → Client)

```typescript
interface JobStateChanged {
  type: 'job_state_changed'
  projectId: string
  jobId: string
  jobName: string
  state: 'starting' | 'running' | 'done' | 'failed' | 'stopped' | 'crashed'
  exitCode?: number
}

interface NotificationEvent {
  type: 'notification'
  projectId: string
  notification: {
    id: string
    jobId?: string
    severity: 'info' | 'success' | 'warning' | 'error'
    title: string
    body?: string
    createdAt: number
  }
}
```

## File Structure

```
~/.anton/
├── projects/
│   └── {projectId}/
│       ├── project.json
│       ├── workspace/                        # project files
│       │   ├── leads.xlsx
│       │   └── scripts/
│       │       ├── send_connections.py
│       │       └── polymarket_watcher.py
│       ├── jobs/
│       │   └── {jobId}/
│       │       ├── job.json                  # job definition
│       │       └── logs/
│       │           ├── {runId}.log           # full stdout+stderr per run
│       │           └── latest.log            # symlink to current/last
│       └── notifications/
│           └── 2026-03-27.jsonl
```

## Integration with Existing Code

### Scheduler Evolution

The existing `Scheduler` class in `packages/agent-server/src/scheduler.ts` already does:
- Cron expression parsing
- 30-second tick loop
- Session-per-skill execution

The `JobManager` replaces it:
- Same cron logic, applied to jobs instead of skills
- Skills with cron → migrate to scheduled jobs with `execution.type: 'agent'`
- Skills without cron → remain as on-demand skills

### Server Integration

`JobManager` lives in `AgentServer`:

```typescript
// packages/agent-server/src/server.ts
class AgentServer {
  private jobManager: JobManager

  constructor(config) {
    this.jobManager = new JobManager(config)
  }

  async start() {
    // ... existing startup ...
    this.jobManager.start()    // start cron loop
  }

  // Wire job protocol messages in handleAi()
  handleAi(payload) {
    switch (payload.type) {
      case 'job_create': ...
      case 'job_action': ...
      case 'jobs_list': ...
      case 'job_logs': ...
    }
  }
}
```

### Agent Tool Registration

Add the `job` tool to the agent's tool list when a session is associated with a project:

```typescript
// packages/agent-core/src/agent.ts
function buildTools(config, options) {
  const tools = [shell, filesystem, ...]

  if (options.projectId) {
    tools.push(jobTool)     // job management tool
  }

  return tools
}
```

## Implementation Plan

### Phase 1: JobManager Core
**Files to create:**
- `packages/agent-core/src/jobs/job-manager.ts` — CRUD, process spawning, monitoring
- `packages/agent-core/src/jobs/types.ts` — Job, RunResult, JobRuntime interfaces

**Files to modify:**
- `packages/protocol/src/messages.ts` — add job protocol messages
- `packages/protocol/src/projects.ts` — update Job types

**What it does:**
- Create/update/delete jobs (persisted to `jobs/{id}/job.json`)
- Start a job (spawn child process, capture stdout/stderr to log file)
- Stop a job (SIGTERM, then SIGKILL after 10s)
- Track process state (PID, running/stopped, exit code)
- Log management (write to file, tail last N lines)
- Restart on crash (for long-running jobs with restart policy)

### Phase 2: Scheduling
**Files to modify:**
- `packages/agent-core/src/jobs/job-manager.ts` — add cron loop

**What it does:**
- Tick every 30s, evaluate cron expressions for active jobs
- Start jobs when cron matches
- Skip if job is already running (for task jobs) or if long-running is alive
- Reuse cron parsing from existing scheduler.ts

### Phase 3: Agent Tool + Server Wiring
**Files to create:**
- `packages/agent-core/src/tools/job.ts` — the job tool

**Files to modify:**
- `packages/agent-core/src/agent.ts` — register job tool for project sessions
- `packages/agent-server/src/server.ts` — wire JobManager, handle protocol messages
- `packages/agent-server/src/index.ts` — initialize JobManager on startup

**What it does:**
- Agent can create, start, stop, list, and read logs of jobs
- Server routes job protocol messages to JobManager
- Job state changes emit events to desktop client

### Phase 4: Notifications + Desktop UI
**Files to create:**
- `packages/agent-core/src/jobs/notifications.ts` — notification router
- `packages/desktop/src/components/projects/ProjectJobs.tsx` — job list UI
- `packages/desktop/src/components/projects/JobLogs.tsx` — log viewer
- `packages/desktop/src/components/notifications/NotificationDrawer.tsx`

**What it does:**
- Job events → notifications (persist + push + OS)
- Desktop: job list with status indicators
- Desktop: log viewer (tail -f style)
- Desktop: notification badge + drawer

## Example: Full LinkedIn Workflow

```
1. User: "I want to automate LinkedIn outreach for these 500 leads"
   (uploads leads.xlsx to project)

2. Agent:
   - Reads leads.xlsx, understands the columns
   - Writes scripts/send_connections.py (simple Python: read profiles from args, send requests, print results)
   - Creates a scheduled task job:
     job.create({
       name: "linkedin-outreach",
       command: "python",
       args: ["scripts/send_connections.py"],
       schedule: "0 9 * * 1-5",
       type: "task",
       timeout: 600
     })

3. Every weekday at 9am, JobManager triggers the job:
   - Agent prepares: reads leads.xlsx, picks next 40 uncontacted profiles
   - Updates the script's input file or args
   - Job runs: sends connection requests, prints JSON results to stdout
   - Job exits

4. Agent reads the output:
   - Parses stdout (JSON with results per profile)
   - Updates leads.xlsx with send status
   - Checks acceptance rate from previous batches
   - Adjusts strategy if needed (fewer per day, different message)
   - Notification: "Day 3: 35 sent, acceptance rate 15%"

5. User can check anytime:
   - "How's the LinkedIn campaign going?" → Agent reads job history + leads.xlsx
   - "Pause the campaign" → Agent: job.stop("linkedin-outreach"), set status to paused
   - "Change the message template" → Agent updates the script
```

## Example: Polymarket Watcher

```
1. User: "Build a bot that watches Polymarket and trades when it finds opportunities"

2. Agent:
   - Writes scripts/polymarket_watcher.py
     (WebSocket listener, has its own LLM calls via AI SDK,
      makes trading decisions autonomously, logs everything to stdout)
   - Creates a long-running job:
     job.create({
       name: "polymarket-watcher",
       command: "python",
       args: ["scripts/polymarket_watcher.py"],
       type: "long-running",
       restartPolicy: "on-failure",
       maxRestarts: 5,
       env: { POLYMARKET_API_KEY: "...", ANTHROPIC_API_KEY: "..." }
     })

3. Agent starts the job. Process runs indefinitely.

4. Anton monitors:
   - Is the process alive? (check PID)
   - If it crashes → restart (up to 5 times)
   - Notification on crash: "polymarket-watcher crashed, restarting (2/5)"

5. User can check anytime:
   - "How's the Polymarket bot?" → Agent: job.logs("polymarket-watcher", 50)
   - Reads last 50 lines of stdout, summarizes: "3 trades today, +$45"
   - "Stop the bot" → Agent: job.stop("polymarket-watcher")
```
