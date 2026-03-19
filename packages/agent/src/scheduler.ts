/**
 * Skill scheduler — runs skills on cron schedules.
 * This is what makes the agent a 24/7 worker, not just an on-demand chatbot.
 *
 * Each skill gets its own Session (pi SDK agent instance) so skills
 * don't pollute each other's context.
 */

import type { AgentConfig, SkillConfig } from "./config.js";
import { createSession, resumeSession } from "./session.js";
import type { Session } from "./session.js";
import { buildSkillPrompt } from "./skills.js";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { getAntonDir } from "./config.js";

interface ScheduledJob {
  skill: SkillConfig;
  nextRun: Date;
  intervalMs: number;
  sessionId: string;
}

export class Scheduler {
  private jobs: ScheduledJob[] = [];
  private config: AgentConfig;
  private sessions: Map<string, Session> = new Map();
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Register skills that have cron schedules.
   */
  addSkills(skills: SkillConfig[]) {
    for (const skill of skills) {
      if (!skill.schedule) continue;

      const intervalMs = parseCronToMs(skill.schedule);
      if (intervalMs <= 0) {
        console.warn(`Invalid schedule for skill "${skill.name}": ${skill.schedule}`);
        continue;
      }

      const sessionId = `skill-${skill.name.toLowerCase().replace(/\s+/g, "-")}`;

      this.jobs.push({
        skill,
        nextRun: new Date(Date.now() + intervalMs),
        intervalMs,
        sessionId,
      });

      console.log(
        `  Scheduled: ${skill.name} (every ${formatMs(intervalMs)}, ` +
          `next: ${new Date(Date.now() + intervalMs).toLocaleTimeString()})`
      );
    }
  }

  start() {
    if (this.jobs.length === 0) return;

    this.running = true;
    console.log(`\n  Scheduler started with ${this.jobs.length} job(s)`);

    this.tick();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private tick() {
    if (!this.running) return;

    const now = Date.now();

    for (const job of this.jobs) {
      if (now >= job.nextRun.getTime()) {
        this.runJob(job).catch((err) => {
          console.error(`Scheduler error for "${job.skill.name}":`, err);
        });
        job.nextRun = new Date(now + job.intervalMs);
      }
    }

    this.timer = setTimeout(() => this.tick(), 30_000);
  }

  private getOrCreateSession(job: ScheduledJob): Session {
    let session = this.sessions.get(job.sessionId);
    if (session) return session;

    // Try to resume from disk
    session = resumeSession(job.sessionId, this.config) ?? undefined;
    if (!session) {
      session = createSession(job.sessionId, this.config);
    }

    this.sessions.set(job.sessionId, session);
    return session;
  }

  private async runJob(job: ScheduledJob) {
    const logFile = join(getAntonDir(), "scheduler.log");
    const timestamp = new Date().toISOString();

    appendFileSync(logFile, `\n[${timestamp}] Running skill: ${job.skill.name}\n`);
    console.log(`[Scheduler] Running: ${job.skill.name}`);

    const session = this.getOrCreateSession(job);
    const prompt = buildSkillPrompt(job.skill);

    for await (const event of session.processMessage(prompt)) {
      if (event.type === "text") {
        appendFileSync(logFile, `  ${event.content}\n`);
      } else if (event.type === "tool_call") {
        appendFileSync(logFile, `  [tool] ${event.name}: ${JSON.stringify(event.input)}\n`);
      } else if (event.type === "error") {
        appendFileSync(logFile, `  [ERROR] ${event.message}\n`);
      }
    }

    appendFileSync(logFile, `[${new Date().toISOString()}] Completed: ${job.skill.name}\n`);
  }
}

function parseCronToMs(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return 0;

  const [min, hour] = parts;

  const hourMatch = hour.match(/^\*\/(\d+)$/);
  if (hourMatch) {
    return parseInt(hourMatch[1]) * 60 * 60 * 1000;
  }

  const minMatch = min.match(/^\*\/(\d+)$/);
  if (minMatch) {
    return parseInt(minMatch[1]) * 60 * 1000;
  }

  if (min !== "*" && hour === "*") {
    return 60 * 60 * 1000;
  }

  if (min !== "*" && hour !== "*" && !hour.includes("/")) {
    return 24 * 60 * 60 * 1000;
  }

  return 0;
}

function formatMs(ms: number): string {
  if (ms < 60_000) return `${ms / 1000}s`;
  if (ms < 3_600_000) return `${ms / 60_000}m`;
  if (ms < 86_400_000) return `${ms / 3_600_000}h`;
  return `${ms / 86_400_000}d`;
}
