/**
 * Skill scheduler — runs skills on cron schedules.
 * This is what makes the agent a 24/7 worker, not just an on-demand chatbot.
 */

import type { SkillConfig } from "./config.js";
import { Agent } from "./agent.js";
import { buildSkillPrompt } from "./skills.js";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { getAntonDir } from "./config.js";

interface ScheduledJob {
  skill: SkillConfig;
  nextRun: Date;
  intervalMs: number;
}

export class Scheduler {
  private jobs: ScheduledJob[] = [];
  private agent: Agent;
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(agent: Agent) {
    this.agent = agent;
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

      this.jobs.push({
        skill,
        nextRun: new Date(Date.now() + intervalMs),
        intervalMs,
      });

      console.log(
        `  Scheduled: ${skill.name} (every ${formatMs(intervalMs)}, ` +
          `next: ${new Date(Date.now() + intervalMs).toLocaleTimeString()})`
      );
    }
  }

  /**
   * Start the scheduler loop.
   */
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

    // Check every 30 seconds
    this.timer = setTimeout(() => this.tick(), 30_000);
  }

  private async runJob(job: ScheduledJob) {
    const logFile = join(getAntonDir(), "scheduler.log");
    const timestamp = new Date().toISOString();

    appendFileSync(logFile, `\n[${timestamp}] Running skill: ${job.skill.name}\n`);
    console.log(`[Scheduler] Running: ${job.skill.name}`);

    const prompt = buildSkillPrompt(job.skill);
    // Each skill gets its own session — pi SDK persists these to disk
    const sessionId = `skill-${job.skill.name.toLowerCase().replace(/\s+/g, "-")}`;

    for await (const event of this.agent.processMessage(prompt, sessionId)) {
      // Log events
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

/**
 * Parse simple cron expressions to milliseconds.
 * Supports hourly, every-N-hours, every-N-minutes, and daily cron expressions.
 * For v0.1, we use a simplified parser. Full cron in v0.2.
 */
function parseCronToMs(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return 0;

  const [min, hour] = parts;

  // Every N hours
  const hourMatch = hour.match(/^\*\/(\d+)$/);
  if (hourMatch) {
    return parseInt(hourMatch[1]) * 60 * 60 * 1000;
  }

  // Every N minutes
  const minMatch = min.match(/^\*\/(\d+)$/);
  if (minMatch) {
    return parseInt(minMatch[1]) * 60 * 1000;
  }

  // Every hour (0 * * * *)
  if (min !== "*" && hour === "*") {
    return 60 * 60 * 1000;
  }

  // Daily (specific hour)
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
