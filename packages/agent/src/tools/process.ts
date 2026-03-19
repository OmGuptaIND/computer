import { execSync } from "node:child_process";

export interface ProcessToolInput {
  operation: "list" | "kill" | "info";
  pid?: number;
  name?: string;
}

export const processToolDefinition = {
  name: "process",
  description:
    "List running processes, get process info, or kill processes. " +
    "Use 'list' to see all running processes, 'info' to get details about a specific PID, " +
    "'kill' to terminate a process by PID.",
  parameters: {
    type: "object" as const,
    properties: {
      operation: {
        type: "string",
        enum: ["list", "kill", "info"],
      },
      pid: {
        type: "number",
        description: "Process ID (for kill/info operations)",
      },
      name: {
        type: "string",
        description: "Filter processes by name (for list operation)",
      },
    },
    required: ["operation"],
  },
};

export function executeProcess(input: ProcessToolInput): string {
  const { operation, pid, name } = input;

  try {
    switch (operation) {
      case "list": {
        const filter = name ? `| grep -i "${name}"` : "";
        const result = execSync(
          `ps aux --sort=-%mem ${filter} | head -30`,
          { encoding: "utf-8", timeout: 5_000 }
        );
        return result;
      }

      case "info": {
        if (!pid) return "Error: pid is required for info operation";
        const result = execSync(
          `ps -p ${pid} -o pid,ppid,user,%cpu,%mem,vsz,rss,stat,start,time,command`,
          { encoding: "utf-8", timeout: 5_000 }
        );
        return result;
      }

      case "kill": {
        if (!pid) return "Error: pid is required for kill operation";
        execSync(`kill ${pid}`, { timeout: 5_000 });
        return `Sent SIGTERM to process ${pid}`;
      }

      default:
        return `Unknown operation: ${operation}`;
    }
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}
