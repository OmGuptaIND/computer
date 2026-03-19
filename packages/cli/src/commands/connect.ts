/**
 * `anton connect <host>` — test connection and save machine.
 */

import { createInterface } from "node:readline";
import chalk from "chalk";
import { Connection } from "../lib/connection.js";
import { saveMachine, loadMachines } from "../lib/machines.js";
import { theme, ICONS } from "../lib/theme.js";

interface ConnectArgs {
  host: string;
  port: number;
  token?: string;
  name?: string;
  tls: boolean;
}

export async function connectCommand(args: ConnectArgs): Promise<void> {
  let { host, port, token, name, tls } = args;

  // Prompt for token if not provided
  if (!token) {
    token = await promptInput("Token: ");
    if (!token) {
      console.log(theme.error("Token is required."));
      process.exit(1);
    }
  }

  // Prompt for name if not provided
  if (!name) {
    name = await promptInput(`Name (default: ${host}): `);
    if (!name) name = host;
  }

  console.log(`\n  ${ICONS.connecting} Connecting to ${host}:${port}...`);

  const conn = new Connection();

  try {
    await conn.connect({ host, port, token, useTLS: tls });

    console.log(`  ${ICONS.connected} ${theme.success("Connected!")} Agent: ${conn.agentId} (v${conn.agentVersion})`);

    // Save machine
    const isFirst = loadMachines().length === 0;
    saveMachine({
      name: name!,
      host,
      port,
      token,
      useTLS: tls,
      default: isFirst, // first machine becomes default
    });

    console.log(`  ${ICONS.toolDone} Saved as "${name}" ${isFirst ? "(default)" : ""}`);
    console.log(`\n  Run ${theme.bold("anton")} to start chatting.\n`);

    conn.disconnect();
  } catch (err: any) {
    console.log(`  ${ICONS.disconnected} ${theme.error("Failed:")} ${err.message}\n`);
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
