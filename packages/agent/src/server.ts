/**
 * WebSocket server — the pipe between desktop app and agent.
 * Handles auth, multiplexed channels, and message routing.
 */

import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "node:https";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { AgentConfig } from "./config.js";
import { getAntonDir } from "./config.js";
import { Agent } from "./agent.js";
import { Channel, encodeFrame, decodeFrame, parseJsonPayload } from "@anton/protocol";
import type {
  ControlMessage,
  AiMessage,
  TerminalMessage,
  EventMessage,
} from "@anton/protocol";

export class AgentServer {
  private wss: WebSocketServer | null = null;
  private config: AgentConfig;
  private agent: Agent;
  private activeClient: WebSocket | null = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.agent = new Agent(config);

    // Wire up confirmation handler — asks desktop app for approval
    this.agent.setConfirmHandler(async (command, reason) => {
      if (!this.activeClient) return false;

      return new Promise((resolve) => {
        const confirmId = `c_${Date.now()}`;

        // Send confirm request to desktop
        this.sendToClient(Channel.AI, {
          type: "confirm",
          id: confirmId,
          command,
          reason,
        });

        // Wait for response (with timeout)
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

  async start(): Promise<void> {
    const { port } = this.config;
    const certDir = join(getAntonDir(), "certs");

    // Generate self-signed cert if none exists
    ensureCerts(certDir);

    const server = createServer({
      cert: readFileSync(join(certDir, "cert.pem")),
      key: readFileSync(join(certDir, "key.pem")),
    });

    this.wss = new WebSocketServer({ server });

    this.wss.on("connection", (ws) => {
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

          // Must authenticate first
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
                  version: "0.1.0",
                });
                console.log("Client authenticated");

                // Send initial status
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

          // Route by channel
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
    });

    server.listen(port, () => {
      console.log(`\n  anton.computer agent running on wss://0.0.0.0:${port}`);
      console.log(`  Agent ID: ${this.config.agentId}`);
      console.log(`  Token: ${this.config.token}\n`);
    });
  }

  private async handleMessage(channel: number, payload: Uint8Array) {
    switch (channel) {
      case Channel.CONTROL: {
        const msg = parseJsonPayload<ControlMessage>(payload);
        if (msg.type === "ping") {
          this.sendToClient(Channel.CONTROL, { type: "pong" });
        }
        break;
      }

      case Channel.AI: {
        const msg = parseJsonPayload<AiMessage>(payload);
        if (msg.type === "message") {
          // Status: working
          this.sendToClient(Channel.EVENTS, {
            type: "agent_status",
            status: "working",
            detail: "Processing your request...",
          });

          // Process through pi SDK agent loop
          // pi handles: tool calling cycle, context windowing, streaming, error recovery
          for await (const event of this.agent.processMessage(msg.content, "desktop")) {
            this.sendToClient(Channel.AI, event);
          }

          // Status: idle
          this.sendToClient(Channel.EVENTS, {
            type: "agent_status",
            status: "idle",
          });
        }
        break;
      }

      case Channel.TERMINAL: {
        const msg = parseJsonPayload<TerminalMessage>(payload);
        // TODO: Route to PTY manager
        console.log("Terminal message:", msg.type);
        break;
      }

      default:
        console.log(`Unknown channel: ${channel}`);
    }
  }

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
    console.error("TLS will not be available. Generate certs manually.");
  }
}
