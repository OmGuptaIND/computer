/**
 * Session — one pi SDK Agent instance per session.
 *
 * Each session has its own:
 * - Model/provider (can differ from defaults)
 * - Message history (persisted to ~/.anton/sessions/)
 * - Context window management (transformContext hook)
 *
 * pi SDK does the heavy lifting — we just manage lifecycle and persistence.
 */

import { Agent as PiAgent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import type { AgentEvent as PiAgentEvent, AgentTool } from "@mariozechner/pi-agent-core";
import type { TextContent } from "@mariozechner/pi-ai";
import type { AgentConfig, PersistedSession } from "./config.js";
import { saveSession, loadSession } from "./config.js";
import { buildTools, SYSTEM_PROMPT } from "./agent.js";

export type ConfirmHandler = (command: string, reason: string) => Promise<boolean>;

export type SessionEvent =
  | { type: "thinking"; text: string }
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; output: string; isError?: boolean }
  | { type: "confirm"; id: string; command: string; reason: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface SessionInfo {
  id: string;
  provider: string;
  model: string;
  title: string;
  messageCount: number;
  createdAt: number;
  lastActiveAt: number;
}

/**
 * Maximum messages before we start pruning old ones.
 * Keep system prompt + last N turns to stay within context limits.
 */
const MAX_MESSAGES = 100;

export class Session {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly createdAt: number;

  private piAgent: PiAgent;
  private config: AgentConfig;
  private confirmHandler?: ConfirmHandler;
  private title: string = "";
  private lastActiveAt: number;
  private clientApiKey?: string;  // client-provided, never persisted
  private lastEmittedTextLength: number = 0;  // track delta for streaming

  constructor(opts: {
    id: string;
    provider: string;
    model: string;
    config: AgentConfig;
    tools: AgentTool<any>[];
    apiKey?: string;             // client override
    existingMessages?: unknown[];  // for session resume
    title?: string;
    createdAt?: number;
  }) {
    this.id = opts.id;
    this.provider = opts.provider;
    this.model = opts.model;
    this.config = opts.config;
    this.clientApiKey = opts.apiKey;
    this.title = opts.title || "";
    this.createdAt = opts.createdAt || Date.now();
    this.lastActiveAt = Date.now();

    const model = getModel(
      opts.provider as any,
      opts.model as any,
    );

    if (!model) {
      throw new Error(
        `Unknown model "${opts.model}" for provider "${opts.provider}". ` +
        `Model IDs must exactly match pi SDK's registry. ` +
        `For openrouter, use format like "anthropic/claude-sonnet-4.6" or "MiniMaxAI/MiniMax-M2.5".`
      );
    }

    this.piAgent = new PiAgent({
      initialState: {
        model,
        systemPrompt: this.getSystemPrompt(),
        tools: opts.tools,
        messages: (opts.existingMessages || []) as any[],
        thinkingLevel: "off",
      },
      // Dynamic API key resolution — called on every LLM call
      getApiKey: async (provider: string) => {
        return this.resolveApiKey(provider, this.clientApiKey, this.config);
      },
      transformContext: async (messages) => {
        // Simple sliding window: keep the last MAX_MESSAGES messages
        if (messages.length > MAX_MESSAGES) {
          return messages.slice(messages.length - MAX_MESSAGES);
        }
        return messages;
      },
      beforeToolCall: async (ctx) => {
        if (ctx.toolCall.name === "shell") {
          const args = ctx.args as { command: string };
          const { needsConfirmation } = await import("./tools/shell.js");
          if (needsConfirmation(args.command, this.config.security.confirmPatterns)) {
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
   * Process a user message. Streams events back via async generator.
   * Persists session state after completion.
   */
  async *processMessage(userMessage: string): AsyncGenerator<SessionEvent> {
    this.lastActiveAt = Date.now();
    this.lastEmittedTextLength = 0;  // reset delta tracking for new turn

    // Auto-generate title from first message
    if (!this.title) {
      this.title = userMessage.slice(0, 80).replace(/\n/g, " ");
    }

    const events: SessionEvent[] = [];
    let resolveNext: (() => void) | null = null;
    let done = false;

    const unsub = this.piAgent.subscribe((event: PiAgentEvent) => {
      const translated = this.translateEvent(event);
      if (translated) {
        events.push(translated);
        resolveNext?.();
      }
    });

    try {
      this.piAgent.prompt(userMessage).then(() => {
        done = true;
        resolveNext?.();
      }).catch((err: any) => {
        events.push({ type: "error", message: err.message });
        done = true;
        resolveNext?.();
      });

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

    // Persist after each turn
    this.persist();

    yield { type: "done" };
  }

  /**
   * Switch model mid-session. pi SDK handles this gracefully —
   * keeps all messages, next LLM call uses the new model.
   */
  switchModel(provider: string, model: string): void {
    const newModel = getModel(provider as any, model as any);
    this.piAgent.setModel(newModel);
    // Note: we don't update this.provider/this.model since they're readonly
    // The persisted session will track the latest model used
    this.persist();
  }

  /** Cancel any running work. */
  cancel() {
    // pi Agent handles abort internally
  }

  /** Get session info for listing. */
  getInfo(): SessionInfo {
    return {
      id: this.id,
      provider: this.provider,
      model: this.model,
      title: this.title,
      messageCount: this.piAgent.state.messages.length,
      createdAt: this.createdAt,
      lastActiveAt: this.lastActiveAt,
    };
  }

  /** Persist session state to disk. */
  private persist(): void {
    const persisted: PersistedSession = {
      id: this.id,
      provider: this.provider,
      model: this.model,
      messages: this.piAgent.state.messages as unknown[],
      createdAt: this.createdAt,
      lastActiveAt: this.lastActiveAt,
      title: this.title,
    };
    saveSession(persisted);
  }

  private translateEvent(piEvent: PiAgentEvent): SessionEvent | null {
    switch (piEvent.type) {
      case "message_update": {
        const msg = piEvent.message;
        if (msg.role === "assistant") {
          const textParts = msg.content.filter((c: any) => c.type === "text");
          if (textParts.length > 0) {
            const fullText = textParts.map((c: any) => c.text).join("");
            // pi SDK sends full accumulated text on each update.
            // We emit only the delta (new chars since last emit).
            if (fullText.length > this.lastEmittedTextLength) {
              const delta = fullText.slice(this.lastEmittedTextLength);
              this.lastEmittedTextLength = fullText.length;
              return { type: "text", content: delta };
            }
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
        return null;

      default:
        return null;
    }
  }

  /**
   * Resolve API key with priority: client override > config > env var.
   */
  private resolveApiKey(provider: string, clientKey?: string, config?: AgentConfig): string | undefined {
    // 1. Client-provided key (highest priority)
    if (clientKey) return clientKey;

    // 2. Config file key
    const providerConfig = config?.providers?.[provider];
    if (providerConfig?.apiKey) return providerConfig.apiKey;

    // 3. Environment variable fallback
    const envMap: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_API_KEY",
      groq: "GROQ_API_KEY",
      together: "TOGETHER_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
      mistral: "MISTRAL_API_KEY",
    };
    const envVar = envMap[provider];
    if (envVar && process.env[envVar]) return process.env[envVar];

    return undefined;
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
}

/**
 * Create a new session from scratch.
 */
export function createSession(
  id: string,
  config: AgentConfig,
  opts?: { provider?: string; model?: string; apiKey?: string }
): Session {
  const provider = opts?.provider || config.defaults.provider;
  const model = opts?.model || config.defaults.model;

  return new Session({
    id,
    provider,
    model,
    config,
    tools: buildTools(config),
    apiKey: opts?.apiKey,
  });
}

/**
 * Resume a persisted session from disk.
 * Returns null if session doesn't exist.
 */
export function resumeSession(id: string, config: AgentConfig): Session | null {
  const persisted = loadSession(id);
  if (!persisted) return null;

  return new Session({
    id: persisted.id,
    provider: persisted.provider,
    model: persisted.model,
    config,
    tools: buildTools(config),
    existingMessages: persisted.messages,
    title: persisted.title,
    createdAt: persisted.createdAt,
  });
}
