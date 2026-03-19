/**
 * `anton connect [host]` — connect to an agent and launch the TUI.
 *
 * Behavior:
 *   - No args + saved machine exists → reconnect to default, straight to TUI
 *   - No args + no saved machine     → interactive setup (host, token, name)
 *   - With host arg                  → connect to that host (prompts for token if needed)
 *
 * Connection spec: see /SPEC.md
 *   Port 9876 → plain ws:// (default)
 *   Port 9877 → wss:// (with --tls)
 */

import React from "react";
import { render } from "ink";
import { createInterface } from "node:readline";
import { Connection } from "../lib/connection.js";
import { saveMachine, loadMachines, getDefaultMachine } from "../lib/machines.js";
import { theme, ICONS } from "../lib/theme.js";
import { App } from "../ui/App.js";

const PORT_PLAIN = 9876;
const PORT_TLS = 9877;

interface ConnectArgs {
  host?: string;
  token?: string;
  name?: string;
  tls: boolean;
}

export async function connectCommand(args: ConnectArgs): Promise<void> {
  let { host, token, name, tls } = args;

  // ── Fast path: no args + saved machine → straight to TUI ──
  if (!host && !token) {
    const saved = getDefaultMachine();
    if (saved) {
      await quickConnect(saved);
      return;
    }
  }

  // ── First-time setup: prompt for connection details ──
  console.log();
  console.log(`  ${theme.brandBold("anton.computer")} ${theme.dim("— connect to your agent")}`);
  console.log();

  if (!host) {
    host = await promptInput(`  ${theme.label("Host")} ${theme.dim("(IP or domain)")}: `);
    if (!host) {
      console.log(`  ${ICONS.toolError} ${theme.error("Host is required.")}`);
      process.exit(1);
    }
  } else {
    console.log(`  ${theme.label("Host")}:  ${host}`);
  }

  // Check if we already have this host saved
  const machines = loadMachines();
  const existing = machines.find(m => m.host === host);
  if (existing && !token) {
    // Already saved — just reconnect
    await quickConnect(existing);
    return;
  }

  if (!token) {
    token = await promptInput(`  ${theme.label("Token")}: `);
    if (!token) {
      console.log(`  ${ICONS.toolError} ${theme.error("Token is required.")}`);
      process.exit(1);
    }
  }

  if (!name) {
    name = await promptInput(`  ${theme.label("Name")} ${theme.dim(`(default: ${host})`)}: `);
    if (!name) name = host;
  }

  const port = tls ? PORT_TLS : PORT_PLAIN;
  await connectAndLaunch({ name: name!, host, port, token, useTLS: tls });
}

/**
 * Quick reconnect — no prompts, straight to TUI.
 */
async function quickConnect(machine: { name: string; host: string; port: number; token: string; useTLS: boolean }) {
  const proto = machine.useTLS ? "wss" : "ws";
  console.log();
  console.log(`  ${ICONS.connecting} ${theme.dim(`${machine.name}`)} ${theme.dim(`(${proto}://${machine.host}:${machine.port})`)}`);

  const conn = new Connection();
  try {
    await conn.connect({
      host: machine.host,
      port: machine.port,
      token: machine.token,
      useTLS: machine.useTLS,
    });
    console.log(`  ${ICONS.connected} ${theme.success("Connected")}`);
    conn.disconnect();

    console.log();
    const appMachine = { id: machine.name, ...machine };
    const { waitUntilExit } = render(React.createElement(App, { machine: appMachine }));
    await waitUntilExit();
  } catch (err: any) {
    console.log(`  ${ICONS.disconnected} ${theme.error("Connection failed:")} ${theme.dim(err.message)}`);
    console.log(`  ${theme.dim("Run")} ${theme.bold("anton connect <host> --token <token>")} ${theme.dim("to reconfigure.")}`);
    console.log();
    process.exit(1);
  }
}

/**
 * First-time connect — test, save, launch TUI.
 */
async function connectAndLaunch(machine: { name: string; host: string; port: number; token: string; useTLS: boolean }) {
  const proto = machine.useTLS ? "wss" : "ws";
  console.log();
  console.log(`  ${ICONS.connecting} Connecting to ${theme.bold(`${proto}://${machine.host}:${machine.port}`)}...`);

  const conn = new Connection();
  try {
    await conn.connect({
      host: machine.host,
      port: machine.port,
      token: machine.token,
      useTLS: machine.useTLS,
    });

    console.log(`  ${ICONS.connected} ${theme.success("Connected!")}`);
    console.log(`  ${theme.dim("Agent ID")}:  ${conn.agentId}`);
    console.log(`  ${theme.dim("Version")}:   v${conn.agentVersion}`);

    // Save machine
    const isFirst = loadMachines().length === 0;
    saveMachine({
      ...machine,
      default: isFirst || loadMachines().length === 0,
    });

    console.log(`  ${ICONS.toolDone} Saved as ${theme.bold(`"${machine.name}"`)}${isFirst ? theme.dim(" (default)") : ""}`);
    conn.disconnect();

    console.log();
    const appMachine = { id: machine.name, ...machine };
    const { waitUntilExit } = render(React.createElement(App, { machine: appMachine }));
    await waitUntilExit();
  } catch (err: any) {
    console.log(`  ${ICONS.disconnected} ${theme.error("Connection failed")}`);
    console.log(`  ${theme.dim(err.message)}`);
    console.log();
    console.log(`  ${theme.dim("Troubleshooting:")}`);
    console.log(`    ${theme.dim("• Is the agent running?")} ${theme.muted("ssh into your VPS and check")}`);
    console.log(`    ${theme.dim("• Is port")} ${theme.bold(String(machine.port))} ${theme.dim("open in your firewall/security group?")}`);
    if (!machine.useTLS) {
      console.log(`    ${theme.dim("• Try with TLS:")} ${theme.bold("anton connect --tls")}`);
    }
    console.log();
    process.exit(1);
  }
}

function promptInput(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
