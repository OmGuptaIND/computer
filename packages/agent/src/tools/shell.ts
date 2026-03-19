import { execFile } from "node:child_process";
import type { AgentConfig } from "../config.js";

export interface ShellToolInput {
  command: string;
  timeout_seconds?: number;
  working_directory?: string;
}

/**
 * Check if a command matches any dangerous patterns that need confirmation.
 */
export function needsConfirmation(command: string, patterns: string[]): boolean {
  const lower = command.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * Execute a shell command with timeout.
 */
export async function executeShell(
  input: ShellToolInput,
  config: AgentConfig,
): Promise<string> {
  const { command, timeout_seconds = 30, working_directory } = input;
  const timeout = Math.min(timeout_seconds, 300) * 1000;

  return new Promise((resolve) => {
    execFile(
      "/bin/sh",
      ["-c", command],
      {
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        cwd: working_directory || process.env.HOME,
      },
      (error, stdout, stderr) => {
        let output = "";
        if (stdout) output += stdout;
        if (stderr) output += (output ? "\n" : "") + stderr;
        if (error && !output) {
          output = `Error: ${error.message}`;
        }
        resolve(output || "(no output)");
      }
    );
  });
}
