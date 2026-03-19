/**
 * `anton shell` — interactive remote shell via PTY channel.
 */

import { randomBytes } from "node:crypto";
import { Connection } from "../lib/connection.js";
import { getDefaultMachine } from "../lib/machines.js";
import { Channel } from "@anton/protocol";
import type { TerminalMessage } from "@anton/protocol";
import { theme, ICONS } from "../lib/theme.js";

export async function shellCommand(): Promise<void> {
  const machine = getDefaultMachine();

  if (!machine) {
    console.error(`No machine configured. Run ${theme.bold("anton connect <host>")} first.`);
    process.exit(1);
  }

  const conn = new Connection();

  try {
    await conn.connect({
      host: machine.host,
      port: machine.port,
      token: machine.token,
      useTLS: machine.useTLS,
    });
  } catch (err: any) {
    console.error(`${theme.error("Connection failed:")} ${err.message}`);
    process.exit(1);
  }

  const sessionId = `pty_${randomBytes(4).toString("hex")}`;
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  console.log(`${ICONS.connected} Remote shell on ${machine.name} (${machine.host})`);
  console.log(theme.dim("Press Ctrl+] to disconnect.\n"));

  // Enter raw mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  // Receive PTY data
  conn.onMessage((channel, payload) => {
    if (channel === Channel.TERMINAL) {
      const msg = payload as TerminalMessage;
      if (msg.type === "pty_data" && msg.id === sessionId) {
        // Data is base64 encoded
        const buf = Buffer.from(msg.data, "base64");
        process.stdout.write(buf);
      }
    }
  });

  // Send stdin to remote
  process.stdin.on("data", (data: Buffer) => {
    // Ctrl+] to disconnect
    if (data.length === 1 && data[0] === 0x1d) {
      cleanup();
      return;
    }

    conn.sendTerminalData(sessionId, data.toString("base64"));
  });

  // Handle terminal resize
  process.stdout.on("resize", () => {
    conn.sendTerminalResize(sessionId, process.stdout.columns, process.stdout.rows);
  });

  // Spawn remote PTY
  conn.sendTerminalSpawn(sessionId, cols, rows);

  // Handle disconnect
  conn.onStatusChange((status) => {
    if (status === "disconnected" || status === "error") {
      cleanup();
    }
  });

  function cleanup() {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    conn.disconnect();
    console.log(`\n${ICONS.disconnected} Disconnected.`);
    process.exit(0);
  }
}
