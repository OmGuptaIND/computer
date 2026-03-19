import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir, hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface AgentConfig {
  agentId: string;
  token: string;
  port: number;

  ai: {
    provider: string;  // "anthropic", "openai", "ollama", "google", "bedrock", etc.
    apiKey: string;
    model: string;
    baseUrl?: string;
  };

  security: {
    confirmPatterns: string[];
    forbiddenPaths: string[];
    networkAllowlist: string[];
  };

  skills: SkillConfig[];
}

export interface SkillConfig {
  name: string;
  description: string;
  prompt: string;          // System prompt for this skill
  schedule?: string;       // Cron expression for 24/7 autonomous work
  tools?: string[];        // Which tools this skill can use
}

const ANTON_DIR = join(homedir(), ".anton");
const CONFIG_PATH = join(ANTON_DIR, "config.yaml");

export function loadConfig(): AgentConfig {
  mkdirSync(ANTON_DIR, { recursive: true });
  mkdirSync(join(ANTON_DIR, "sessions"), { recursive: true });
  mkdirSync(join(ANTON_DIR, "skills"), { recursive: true });

  if (!existsSync(CONFIG_PATH)) {
    const defaultConfig = createDefaultConfig();
    writeFileSync(CONFIG_PATH, stringifyYaml(defaultConfig), "utf-8");
    console.log(`\n  Config created: ${CONFIG_PATH}`);
    console.log(`  Token: ${defaultConfig.token}`);
    console.log(`  Save this token — you need it to connect from the desktop app.\n`);
    return defaultConfig;
  }

  const raw = readFileSync(CONFIG_PATH, "utf-8");
  return parseYaml(raw) as AgentConfig;
}

function createDefaultConfig(): AgentConfig {
  return {
    agentId: `anton-${hostname()}-${randomBytes(4).toString("hex")}`,
    token: `ak_${randomBytes(24).toString("hex")}`,
    port: 9876,

    ai: {
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      model: "claude-sonnet-4-6",
    },

    security: {
      confirmPatterns: [
        "rm -rf",
        "sudo",
        "shutdown",
        "reboot",
        "mkfs",
        "dd if=",
        ":(){ :|:& };:",
      ],
      forbiddenPaths: [
        "/etc/shadow",
        "~/.ssh/id_*",
        "~/.anton/config.yaml", // don't let AI read its own token
      ],
      networkAllowlist: [
        "github.com",
        "npmjs.org",
        "pypi.org",
        "registry.npmjs.org",
        "api.anthropic.com",
        "api.openai.com",
      ],
    },

    skills: [],
  };
}

export function getAntonDir(): string {
  return ANTON_DIR;
}
