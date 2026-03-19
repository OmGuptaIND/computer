/**
 * Agent brain — powered by pi SDK (the engine inside OpenClaw).
 *
 * pi gives us:
 * - Agentic tool-calling loop (message → LLM → tools → execute → repeat)
 * - Context management (transformContext hook for windowing)
 * - Multi-model (Claude, GPT, Gemini, Ollama, Bedrock — user picks in config)
 * - Real-time streaming via subscribe()
 * - Error recovery, retries, parallel tool calls
 * - AbortSignal for cancellation
 *
 * We add:
 * - Our custom tools (shell, filesystem, browser, process, network)
 * - Skills system (YAML-based personas, 24/7 scheduler)
 * - Desktop confirmation flow (dangerous commands need approval)
 * - WebSocket pipe to desktop app
 */

import { Agent as PiAgent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { Type } from "@mariozechner/pi-ai";
import type { AgentEvent as PiAgentEvent, AgentTool } from "@mariozechner/pi-agent-core";
import type { TextContent } from "@mariozechner/pi-ai";
import type { AgentConfig } from "./config.js";
import { executeShell, needsConfirmation } from "./tools/shell.js";
import { executeFilesystem } from "./tools/filesystem.js";
import { executeBrowser } from "./tools/browser.js";
import { executeProcess } from "./tools/process.js";
import { executeNetwork } from "./tools/network.js";

// Event types we emit to the desktop app via WebSocket
export type AgentEvent =
  | { type: "thinking"; text: string }
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; output: string; isError?: boolean }
  | { type: "confirm"; id: string; command: string; reason: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type ConfirmHandler = (command: string, reason: string) => Promise<boolean>;

const SYSTEM_PROMPT = `You are an AI agent running on a remote server. You are not a chatbot — you are a worker.

Your job is to COMPLETE TASKS, not just discuss them. When the user asks you to do something, DO IT using the tools available to you.

You have full access to this server's filesystem, shell, network, and processes. You can:
- Install software, deploy applications, manage services
- Read, write, and organize files
- Run any shell command
- Make HTTP requests, check ports, test connectivity
- Monitor and manage processes

When given a task:
1. Break it into steps
2. Execute each step using tools
3. Verify the result
4. Report what you did

Be efficient. Don't ask permission for obvious steps. Only ask for confirmation when doing something destructive or irreversible.

If you encounter an error, try to fix it yourself before reporting it.`;

/**
 * Wrap a string result into the AgentToolResult format pi SDK expects.
 */
function toolResult(output: string, isError = false) {
  const content: TextContent[] = [{ type: "text", text: output }];
  return { content, details: { raw: output, isError } };
}

export class Agent {
  private config: AgentConfig;
  private confirmHandler?: ConfirmHandler;
  private piAgent: PiAgent;

  constructor(config: AgentConfig) {
    this.config = config;

    // Resolve the model via pi-ai — works with any provider
    const model = getModel(
      config.ai.provider as any,      // "anthropic", "openai", "ollama", etc.
      config.ai.model as any,         // "claude-sonnet-4-6", "gpt-4o", etc.
    );

    // Create pi agent with our custom tools
    this.piAgent = new PiAgent({
      initialState: {
        model,
        systemPrompt: this.getSystemPrompt(),
        tools: this.buildTools(),
        messages: [],
        thinkingLevel: "off",
      },
      beforeToolCall: async (ctx) => {
        // Check if shell command needs confirmation
        if (ctx.toolCall.name === "shell") {
          const args = ctx.args as { command: string };
          if (needsConfirmation(args.command, config.security.confirmPatterns)) {
            if (this.confirmHandler) {
              const approved = await this.confirmHandler(args.command, "Command matches a dangerous pattern");
              if (!approved) {
                return { block: true, reason: "Command denied by user." };
              }
            } else {
              return { block: true, reason: "Command requires confirmation but no handler available." };
            }
          }
        }
        return undefined;
      },
    });
  }

  setConfirmHandler(handler: ConfirmHandler) {
    this.confirmHandler = handler;
  }

  /**
   * Process a user message and stream events back.
   * Uses pi SDK's agentic loop — it handles the entire tool-calling cycle.
   */
  async *processMessage(
    userMessage: string,
    _sessionId: string = "default"
  ): AsyncGenerator<AgentEvent> {
    const events: AgentEvent[] = [];
    let resolveNext: (() => void) | null = null;
    let done = false;

    // Subscribe to pi agent events and translate to our format
    const unsub = this.piAgent.subscribe((event: PiAgentEvent) => {
      const translated = this.translateEvent(event);
      if (translated) {
        events.push(translated);
        resolveNext?.();
      }
    });

    try {
      // Run the agent — pi handles the entire agentic loop
      const promptPromise = this.piAgent.prompt(userMessage).then(() => {
        done = true;
        resolveNext?.();
      }).catch((err: any) => {
        events.push({ type: "error", message: err.message });
        done = true;
        resolveNext?.();
      });

      // Yield events as they come in
      while (!done || events.length > 0) {
        if (events.length > 0) {
          yield events.shift()!;
        } else if (!done) {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }
      }
    } finally {
      unsub();
    }

    yield { type: "done" };
  }

  /**
   * Cancel the currently running task.
   */
  cancel() {
    // pi Agent handles abort internally
  }

  /**
   * Build custom tools in pi SDK's AgentTool format.
   * Uses TypeBox schemas as pi requires.
   */
  private buildTools(): AgentTool<any>[] {
    const config = this.config;

    return [
      {
        name: "shell",
        label: "Shell",
        description:
          "Execute a shell command on the server. Returns stdout/stderr. " +
          "Use for running programs, installing packages, deploying code.",
        parameters: Type.Object({
          command: Type.String({ description: "Shell command to execute" }),
          timeout_seconds: Type.Optional(Type.Number({ description: "Max time in seconds (default: 30)" })),
          working_directory: Type.Optional(Type.String({ description: "Working directory" })),
        }),
        async execute(_toolCallId, params) {
          const output = await executeShell(params, config);
          return toolResult(output);
        },
      },
      {
        name: "filesystem",
        label: "Filesystem",
        description:
          "Read, write, list, search, or tree files. " +
          "Operations: read, write, list, search, tree.",
        parameters: Type.Object({
          operation: Type.Union([
            Type.Literal("read"),
            Type.Literal("write"),
            Type.Literal("list"),
            Type.Literal("search"),
            Type.Literal("tree"),
          ], { description: "Operation to perform" }),
          path: Type.String({ description: "File or directory path" }),
          content: Type.Optional(Type.String({ description: "Content for write" })),
          pattern: Type.Optional(Type.String({ description: "Pattern for search" })),
          maxDepth: Type.Optional(Type.Number({ description: "Depth for tree/search" })),
        }),
        async execute(_toolCallId, params) {
          const output = executeFilesystem(params);
          return toolResult(output);
        },
      },
      {
        name: "browser",
        label: "Browser",
        description: "Fetch web pages or extract content. Operations: fetch, extract, screenshot.",
        parameters: Type.Object({
          operation: Type.Union([
            Type.Literal("fetch"),
            Type.Literal("screenshot"),
            Type.Literal("extract"),
          ], { description: "Operation to perform" }),
          url: Type.String({ description: "URL to fetch" }),
          selector: Type.Optional(Type.String({ description: "CSS selector for extract" })),
        }),
        async execute(_toolCallId, params) {
          const output = executeBrowser(params);
          return toolResult(output);
        },
      },
      {
        name: "process",
        label: "Process",
        description: "List, inspect, or kill processes. Operations: list, info, kill.",
        parameters: Type.Object({
          operation: Type.Union([
            Type.Literal("list"),
            Type.Literal("kill"),
            Type.Literal("info"),
          ], { description: "Operation to perform" }),
          pid: Type.Optional(Type.Number({ description: "Process ID" })),
          name: Type.Optional(Type.String({ description: "Filter by name" })),
        }),
        async execute(_toolCallId, params) {
          const output = executeProcess(params);
          return toolResult(output);
        },
      },
      {
        name: "network",
        label: "Network",
        description: "Network ops: scan ports, HTTP requests, DNS, ping. Operations: ports, curl, dns, ping.",
        parameters: Type.Object({
          operation: Type.Union([
            Type.Literal("ports"),
            Type.Literal("curl"),
            Type.Literal("dns"),
            Type.Literal("ping"),
          ], { description: "Operation to perform" }),
          url: Type.Optional(Type.String({ description: "URL for curl" })),
          host: Type.Optional(Type.String({ description: "Host for dns/ping" })),
          method: Type.Optional(Type.String({ description: "HTTP method" })),
          headers: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "HTTP headers" })),
          body: Type.Optional(Type.String({ description: "Request body" })),
        }),
        async execute(_toolCallId, params) {
          const output = executeNetwork(params);
          return toolResult(output);
        },
      },
    ];
  }

  /**
   * Translate pi SDK events into our AgentEvent format.
   * pi emits lifecycle events — we normalize them for the WebSocket protocol.
   */
  private translateEvent(piEvent: PiAgentEvent): AgentEvent | null {
    switch (piEvent.type) {
      case "message_update": {
        // Extract text content from the assistant message
        const msg = piEvent.message;
        if (msg.role === "assistant") {
          const textParts = msg.content.filter((c: any) => c.type === "text");
          if (textParts.length > 0) {
            const text = textParts.map((c: any) => c.text).join("");
            if (text) return { type: "text", content: text };
          }
        }
        return null;
      }

      case "tool_execution_start":
        return {
          type: "tool_call",
          id: piEvent.toolCallId,
          name: piEvent.toolName,
          input: piEvent.args || {},
        };

      case "tool_execution_end":
        return {
          type: "tool_result",
          id: piEvent.toolCallId,
          output: piEvent.result?.content
            ?.filter((c: any) => c.type === "text")
            ?.map((c: any) => c.text)
            ?.join("\n") ?? "",
          isError: piEvent.isError,
        };

      case "agent_end":
        // Don't emit done here — we emit it in processMessage
        return null;

      default:
        return null;
    }
  }

  private getSystemPrompt(): string {
    let prompt = SYSTEM_PROMPT;

    if (this.config.skills.length > 0) {
      prompt += "\n\n## Active Skills\n";
      for (const skill of this.config.skills) {
        prompt += `\n### ${skill.name}\n${skill.description}\n${skill.prompt}\n`;
      }
    }

    return prompt;
  }

  /** Reset — cancel any running work. */
  reset() {
    this.cancel();
  }
}
