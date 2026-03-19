/**
 * WebSocket server — the pipe between clients and agent sessions.
 *
 * Handles auth, multiplexed channels, session lifecycle, and provider management.
 * Each session is an independent pi SDK agent instance.
 *
 * Connection spec: see /SPEC.md
 *   Port 9876 (config.port)     → plain ws:// (primary, default)
 *   Port 9877 (config.port + 1) → wss:// with self-signed TLS
 */

import { WebSocketServer, WebSocket } from "ws";
import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { AgentConfig } from "./config.js";
import {
  getAntonDir,
  saveConfig,
  setProviderKey,
  setDefault,
  getProvidersList,
  listSessionMetas,
  deleteSession as deletePersistedSession,
  cleanExpiredSessions,
} from "./config.js";
import { Session, createSession, resumeSession } from "./session.js";
import type { SessionEvent } from "./session.js";
import { VERSION, GIT_HASH, SPEC_VERSION } from "./version.js";
import { Channel, encodeFrame, decodeFrame, parseJsonPayload } from "@anton/protocol";
import type {
  ControlMessage,
  AiMessage,
  TerminalMessage,
} from "@anton/protocol";

const DEFAULT_SESSION_ID = "default";

export class AgentServer {
  private wss: WebSocketServer | null = null;
  private config: AgentConfig;
  private sessions: Map<string, Session> = new Map();
  private activeClient: WebSocket | null = null;

  constructor(config: AgentConfig) {
    this.config = config;

    // Clean expired sessions on startup
    const ttl = config.sessions?.ttlDays ?? 7;
    const cleaned = cleanExpiredSessions(ttl);
    if (cleaned > 0) {
      console.log(`  Cleaned ${cleaned} expired session(s).`);
    }
  }

  async start(): Promise<void> {
    const { port } = this.config;
    const tlsPort = port + 1;

    // ── Primary: plain WS on config.port (default 9876) ──
    const plainServer = createHttpServer();
    const plainWss = new WebSocketServer({ server: plainServer });
    plainWss.on("connection", (ws) => this.handleConnection(ws));

    plainServer.listen(port, () => {
      console.log(`  ws://0.0.0.0:${port}  (primary, plain)`);
    });

    this.wss = plainWss;

    // ── Secondary: TLS on config.port + 1 (default 9877) ──
    const certDir = join(getAntonDir(), "certs");
    ensureCerts(certDir);

    const certPath = join(certDir, "cert.pem");
    const keyPath = join(certDir, "key.pem");

    if (existsSync(certPath) && existsSync(keyPath)) {
      try {
        const tlsServer = createHttpsServer({
          cert: readFileSync(certPath),
          key: readFileSync(keyPath),
        });
        const tlsWss = new WebSocketServer({ server: tlsServer });
        tlsWss.on("connection", (ws) => this.handleConnection(ws));

        tlsServer.listen(tlsPort, () => {
          console.log(`  wss://0.0.0.0:${tlsPort} (TLS, self-signed)`);
        });
      } catch (err: any) {
        console.error(`  TLS server failed to start: ${err.message}`);
      }
    }

    console.log(`\n  Agent ID: ${this.config.agentId}`);
    console.log(`  Token:    ${this.config.token}\n`);
  }

  // ── Connection handling ─────────────────────────────────────────

  private handleConnection(ws: WebSocket) {
    console.log("Client connected, waiting for auth...");

    let authenticated = false;
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.close(4001, "Auth timeout");
      }
    }, 10_000);

    ws.on("message", async (data: Buffer) => {
      try {
        const frame = decodeFrame(new Uint8Array(data));

        if (!authenticated) {
          if (frame.channel === Channel.CONTROL) {
            const msg = parseJsonPayload<ControlMessage>(frame.payload);
            if (msg.type === "auth" && msg.token === this.config.token) {
              authenticated = true;
              clearTimeout(authTimeout);
              this.activeClient = ws;
              this.sendToClient(Channel.CONTROL, {
                type: "auth_ok",
                agentId: this.config.agentId,
                version: VERSION,
                gitHash: GIT_HASH,
                specVersion: SPEC_VERSION,
              });
              console.log("Client authenticated");

              this.sendToClient(Channel.EVENTS, {
                type: "agent_status",
                status: "idle",
              });
            } else {
              ws.send(
                encodeFrame(Channel.CONTROL, {
                  type: "auth_error",
                  reason: "Invalid token",
                })
              );
              ws.close(4003, "Auth failed");
            }
          }
          return;
        }

        await this.handleMessage(frame.channel as any, frame.payload);
      } catch (err: any) {
        console.error("Message error:", err.message);
      }
    });

    ws.on("close", () => {
      if (ws === this.activeClient) {
        this.activeClient = null;
        console.log("Client disconnected");
      }
    });
  }

  // ── Message routing ─────────────────────────────────────────────

  private async handleMessage(channel: number, payload: Uint8Array) {
    switch (channel) {
      case Channel.CONTROL:
        await this.handleControl(payload);
        break;

      case Channel.AI:
        await this.handleAi(payload);
        break;

      case Channel.TERMINAL: {
        const msg = parseJsonPayload<TerminalMessage>(payload);
        console.log("Terminal message:", msg.type);
        break;
      }

      default:
        console.log(`Unknown channel: ${channel}`);
    }
  }

  // ── Control channel ─────────────────────────────────────────────

  private async handleControl(payload: Uint8Array) {
    const msg = parseJsonPayload<ControlMessage>(payload);

    switch (msg.type) {
      case "ping":
        this.sendToClient(Channel.CONTROL, { type: "pong" });
        break;

      case "config_query":
        this.handleConfigQuery(msg.key);
        break;

      case "config_update":
        this.handleConfigUpdate(msg.key, msg.value);
        break;
    }
  }

  private handleConfigQuery(key: string) {
    let value: unknown;
    switch (key) {
      case "providers":
        value = getProvidersList(this.config);
        break;
      case "defaults":
        value = this.config.defaults;
        break;
      case "security":
        value = this.config.security;
        break;
      default:
        value = null;
    }
    this.sendToClient(Channel.CONTROL, {
      type: "config_query_response",
      key,
      value,
    });
  }

  private handleConfigUpdate(key: string, value: unknown) {
    try {
      switch (key) {
        case "defaults": {
          const { provider, model } = value as { provider: string; model: string };
          setDefault(this.config, provider, model);
          break;
        }
        case "security":
          this.config.security = value as typeof this.config.security;
          saveConfig(this.config);
          break;
        default:
          throw new Error(`Unknown config key: ${key}`);
      }
      this.sendToClient(Channel.CONTROL, {
        type: "config_update_response",
        success: true,
      });
    } catch (err: any) {
      this.sendToClient(Channel.CONTROL, {
        type: "config_update_response",
        success: false,
        error: err.message,
      });
    }
  }

  // ── AI channel ──────────────────────────────────────────────────

  private async handleAi(payload: Uint8Array) {
    const msg = parseJsonPayload<AiMessage>(payload);

    switch (msg.type) {
      // ── Session lifecycle ──
      case "session_create":
        this.handleSessionCreate(msg);
        break;

      case "session_resume":
        this.handleSessionResume(msg);
        break;

      case "sessions_list":
        this.handleSessionsList();
        break;

      case "session_destroy":
        this.handleSessionDestroy(msg);
        break;

      // ── Provider management ──
      case "providers_list":
        this.handleProvidersList();
        break;

      case "provider_set_key":
        this.handleProviderSetKey(msg);
        break;

      case "provider_set_default":
        this.handleProviderSetDefault(msg);
        break;

      // ── Chat messages ──
      case "message":
        await this.handleChatMessage(msg);
        break;

      // ── Confirm response (forwarded to active session) ──
      case "confirm_response":
        // Handled inline by the confirm handler Promise in session
        break;
    }
  }

  // ── Session handlers ────────────────────────────────────────────

  private handleSessionCreate(msg: { id: string; provider?: string; model?: string; apiKey?: string }) {
    try {
      const session = createSession(msg.id, this.config, {
        provider: msg.provider,
        model: msg.model,
        apiKey: msg.apiKey,
      });

      this.wireSessionConfirmHandler(session);
      this.sessions.set(msg.id, session);

      this.sendToClient(Channel.AI, {
        type: "session_created",
        id: msg.id,
        provider: session.provider,
        model: session.model,
      });

      console.log(`Session created: ${msg.id} (${session.provider}/${session.model})`);
    } catch (err: any) {
      this.sendToClient(Channel.AI, {
        type: "error",
        message: `Failed to create session: ${err.message}`,
        sessionId: msg.id,
      });
    }
  }

  private handleSessionResume(msg: { id: string }) {
    try {
      // Check if already in memory
      let session = this.sessions.get(msg.id);

      if (!session) {
        // Try loading from disk
        session = resumeSession(msg.id, this.config) ?? undefined;
        if (!session) {
          this.sendToClient(Channel.AI, {
            type: "error",
            message: `Session not found: ${msg.id}`,
          });
          return;
        }
        this.wireSessionConfirmHandler(session);
        this.sessions.set(msg.id, session);
      }

      const info = session.getInfo();
      this.sendToClient(Channel.AI, {
        type: "session_resumed",
        id: info.id,
        provider: info.provider,
        model: info.model,
        messageCount: info.messageCount,
        title: info.title,
      });

      console.log(`Session resumed: ${msg.id} (${info.messageCount} messages)`);
    } catch (err: any) {
      this.sendToClient(Channel.AI, {
        type: "error",
        message: `Failed to resume session: ${err.message}`,
      });
    }
  }

  private handleSessionsList() {
    // Fast listing from index.json (no message loading)
    const metas = listSessionMetas();

    const sessions = metas.map((m) => ({
      id: m.id,
      title: m.title,
      provider: m.provider,
      model: m.model,
      messageCount: m.messageCount,
      createdAt: m.createdAt,
      lastActiveAt: m.lastActiveAt,
    }));

    // Add in-memory sessions that aren't persisted yet
    for (const [id, session] of this.sessions) {
      if (!metas.some((m) => m.id === id)) {
        const info = session.getInfo();
        sessions.push({
          id: info.id,
          title: info.title,
          provider: info.provider,
          model: info.model,
          messageCount: info.messageCount,
          createdAt: info.createdAt,
          lastActiveAt: info.lastActiveAt,
        });
      }
    }

    sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt);

    this.sendToClient(Channel.AI, {
      type: "sessions_list_response",
      sessions,
    });
  }

  private handleSessionDestroy(msg: { id: string }) {
    this.sessions.delete(msg.id);
    deletePersistedSession(msg.id);

    this.sendToClient(Channel.AI, {
      type: "session_destroyed",
      id: msg.id,
    });

    console.log(`Session destroyed: ${msg.id}`);
  }

  // ── Provider handlers ───────────────────────────────────────────

  private handleProvidersList() {
    this.sendToClient(Channel.AI, {
      type: "providers_list_response",
      providers: getProvidersList(this.config),
      defaults: this.config.defaults,
    });
  }

  private handleProviderSetKey(msg: { provider: string; apiKey: string }) {
    try {
      setProviderKey(this.config, msg.provider, msg.apiKey);
      this.sendToClient(Channel.AI, {
        type: "provider_set_key_response",
        success: true,
        provider: msg.provider,
      });
      console.log(`API key updated for provider: ${msg.provider}`);
    } catch (err: any) {
      this.sendToClient(Channel.AI, {
        type: "provider_set_key_response",
        success: false,
        provider: msg.provider,
      });
    }
  }

  private handleProviderSetDefault(msg: { provider: string; model: string }) {
    try {
      setDefault(this.config, msg.provider, msg.model);
      this.sendToClient(Channel.AI, {
        type: "provider_set_default_response",
        success: true,
        provider: msg.provider,
        model: msg.model,
      });
      console.log(`Default set to: ${msg.provider}/${msg.model}`);
    } catch (err: any) {
      this.sendToClient(Channel.AI, {
        type: "provider_set_default_response",
        success: false,
        provider: msg.provider,
        model: msg.model,
      });
    }
  }

  // ── Chat message handler ────────────────────────────────────────

  private async handleChatMessage(msg: { content: string; sessionId?: string }) {
    const sessionId = msg.sessionId || DEFAULT_SESSION_ID;

    // Auto-create default session if it doesn't exist
    let session = this.sessions.get(sessionId);
    if (!session) {
      if (sessionId === DEFAULT_SESSION_ID) {
        session = createSession(DEFAULT_SESSION_ID, this.config);
        this.wireSessionConfirmHandler(session);
        this.sessions.set(DEFAULT_SESSION_ID, session);
      } else {
        // Try to resume from disk automatically
        session = resumeSession(sessionId, this.config) ?? undefined;
        if (session) {
          this.wireSessionConfirmHandler(session);
          this.sessions.set(sessionId, session);
          console.log(`Auto-resumed session from disk: ${sessionId}`);
        } else {
          this.sendToClient(Channel.AI, {
            type: "error",
            message: `Session not found: ${sessionId}. Create it first with session_create.`,
            sessionId,
          });
          return;
        }
      }
    }

    this.sendToClient(Channel.EVENTS, {
      type: "agent_status",
      status: "working",
      detail: "Processing your request...",
    });

    console.log(`[${sessionId}] Processing: "${msg.content.slice(0, 50)}"`);

    try {
      let eventCount = 0;
      for await (const event of session.processMessage(msg.content)) {
        eventCount++;
        this.sendToClient(Channel.AI, { ...event, sessionId } as any);
      }
      console.log(`[${sessionId}] Done (${eventCount} events)`);
    } catch (err: any) {
      console.error(`[${sessionId}] Error:`, err.message);
      this.sendToClient(Channel.AI, {
        type: "error",
        message: err.message,
        sessionId,
      });
    }

    this.sendToClient(Channel.EVENTS, {
      type: "agent_status",
      status: "idle",
    });
  }

  // ── Confirmation wiring ─────────────────────────────────────────

  private wireSessionConfirmHandler(session: Session) {
    session.setConfirmHandler(async (command, reason) => {
      if (!this.activeClient) return false;

      return new Promise((resolve) => {
        const confirmId = `c_${Date.now()}`;

        this.sendToClient(Channel.AI, {
          type: "confirm",
          id: confirmId,
          command,
          reason,
          sessionId: session.id,
        });

        const timeout = setTimeout(() => resolve(false), 60_000);

        const handler = (data: Buffer) => {
          try {
            const frame = decodeFrame(new Uint8Array(data));
            if (frame.channel === Channel.AI) {
              const msg = parseJsonPayload<AiMessage>(frame.payload);
              if (msg.type === "confirm_response" && msg.id === confirmId) {
                clearTimeout(timeout);
                this.activeClient?.off("message", handler);
                resolve(msg.approved);
              }
            }
          } catch {}
        };

        this.activeClient?.on("message", handler);
      });
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private sendToClient(channel: number, message: object) {
    if (this.activeClient && this.activeClient.readyState === WebSocket.OPEN) {
      this.activeClient.send(encodeFrame(channel as any, message));
    }
  }
}

function ensureCerts(certDir: string) {
  const certPath = join(certDir, "cert.pem");
  const keyPath = join(certDir, "key.pem");

  if (existsSync(certPath) && existsSync(keyPath)) return;

  console.log("Generating self-signed TLS certificate...");

  try {
    execSync(`mkdir -p "${certDir}"`);
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" ` +
        `-days 365 -nodes -subj "/CN=anton.computer"`,
      { stdio: "pipe" }
    );
  } catch (err: any) {
    console.error("Failed to generate certs:", err.message);
  }
}
