/**
 * `anton skills` — list and run skills on remote agent.
 */

import { Connection } from "../lib/connection.js";
import { getDefaultMachine } from "../lib/machines.js";
import { theme, ICONS } from "../lib/theme.js";

export async function skillsCommand(action: "list" | "run", skillName?: string): Promise<void> {
  const machine = getDefaultMachine();

  if (!machine) {
    console.error(`No machine configured. Run ${theme.bold("anton connect <host>")} first.`);
    process.exit(1);
  }

  // For now, skills interact through the AI channel as commands
  if (action === "list") {
    console.log(`\n  ${theme.bold("Skills")} on ${machine.name}\n`);
    console.log(`  ${theme.dim("Skills are loaded from ~/.anton/skills/ on the agent.")}`);
    console.log(`  ${theme.dim("Use")} ${theme.bold("anton chat 'list your skills'")} ${theme.dim("to see active skills.")}\n`);
    return;
  }

  if (action === "run" && skillName) {
    console.log(`\n  ${ICONS.thinking} Running skill "${skillName}" on ${machine.name}...`);
    console.log(`  ${theme.dim("Use")} ${theme.bold(`anton chat 'run skill: ${skillName}'`)} ${theme.dim("for now.")}\n`);
    return;
  }

  console.log(`\n  Usage: anton skills list`);
  console.log(`         anton skills run <name>\n`);
}
