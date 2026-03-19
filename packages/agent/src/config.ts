import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir, hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { fileURLToPath } from "node:url";

// ── Provider types ──────────────────────────────────────────────────

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  models: string[];
}

export type ProvidersMap = Record<string, ProviderConfig>;

// ── Session persistence ─────────────────────────────────────────────

export interface PersistedSession {
  id: string;
  provider: string;
  model: string;
  messages: unknown[];  // pi SDK message format
  createdAt: number;
  lastActiveAt: number;
  title: string;
}

// ── Main config ─────────────────────────────────────────────────────

export interface AgentConfig {
  agentId: string;
  token: string;
  port: number;

  providers: ProvidersMap;

  defaults: {
    provider: string;
    model: string;
  };

  security: {
    confirmPatterns: string[];
    forbiddenPaths: string[];
    networkAllowlist: string[];
  };

  skills: SkillConfig[];

  sessions?: {
    ttlDays: number;  // auto-cleanup after N days, default 7
  };
}

export interface SkillConfig {
  name: string;
  description: string;
  prompt: string;
  schedule?: string;
  tools?: string[];
}

// ── Legacy config (for migration) ───────────────────────────────────

interface LegacyConfig {
  agentId: string;
  token: string;
  port: number;
  ai: {
    provider: string;
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

// ── Paths ───────────────────────────────────────────────────────────

const ANTON_DIR = join(homedir(), ".anton");
const CONFIG_PATH = join(ANTON_DIR, "config.yaml");
const SESSIONS_DIR = join(ANTON_DIR, "sessions");
const PROMPTS_DIR = join(ANTON_DIR, "prompts");
const SYSTEM_PROMPT_PATH = join(PROMPTS_DIR, "system.md");

// Path to bundled default prompt shipped with the package
const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_PROMPT_PATH = join(__dirname, "..", "prompts", "system.md");

// ── Default providers ───────────────────────────────────────────────

/**
 * Default providers with model IDs that match pi SDK's registry.
 * IMPORTANT: Model IDs must exactly match what pi SDK's getModel() expects.
 * Run `getModel(provider, modelId)` to verify — it throws on unknown IDs.
 */
const DEFAULT_PROVIDERS: ProvidersMap = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    models: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"],
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    models: ["gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
  },
  google: {
    apiKey: process.env.GOOGLE_API_KEY || "",
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    models: ["llama-3.3-70b-versatile", "llama3-70b-8192"],
  },
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      "anthropic/claude-sonnet-4.6",
      "anthropic/claude-opus-4.6",
      "openai/gpt-4o",
      "google/gemini-2.5-pro-preview",
      "minimax/minimax-m2.5",
      "meta-llama/llama-4-maverick",
    ],
  },
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY || "",
    models: ["mistral-large-latest", "mistral-medium-latest"],
  },
};

// ── Load / Save / Migrate ───────────────────────────────────────────

export function loadConfig(): AgentConfig {
  mkdirSync(ANTON_DIR, { recursive: true });
  mkdirSync(SESSIONS_DIR, { recursive: true });
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
  const parsed = parseYaml(raw) as any;

  // Migrate legacy single-provider config
  if (parsed.ai && !parsed.providers) {
    const migrated = migrateLegacyConfig(parsed as LegacyConfig);
    saveConfig(migrated);
    console.log("  Config migrated to multi-provider format.");
    return migrated;
  }

  return parsed as AgentConfig;
}

export function saveConfig(config: AgentConfig): void {
  writeFileSync(CONFIG_PATH, stringifyYaml(config), "utf-8");
}

function migrateLegacyConfig(legacy: LegacyConfig): AgentConfig {
  const providers: ProvidersMap = { ...DEFAULT_PROVIDERS };

  // Preserve the user's existing key in the right provider
  const providerName = legacy.ai.provider || "anthropic";
  if (providers[providerName]) {
    providers[providerName].apiKey = legacy.ai.apiKey || providers[providerName].apiKey;
    if (legacy.ai.baseUrl) {
      providers[providerName].baseUrl = legacy.ai.baseUrl;
    }
  } else {
    providers[providerName] = {
      apiKey: legacy.ai.apiKey,
      baseUrl: legacy.ai.baseUrl,
      models: [legacy.ai.model],
    };
  }

  return {
    agentId: legacy.agentId,
    token: legacy.token,
    port: legacy.port,
    providers,
    defaults: {
      provider: legacy.ai.provider || "anthropic",
      model: legacy.ai.model || "claude-sonnet-4-6",
    },
    security: legacy.security,
    skills: legacy.skills,
    sessions: { ttlDays: 7 },
  };
}

function createDefaultConfig(): AgentConfig {
  return {
    agentId: `anton-${hostname()}-${randomBytes(4).toString("hex")}`,
    token: `ak_${randomBytes(24).toString("hex")}`,
    port: 9876,
    providers: DEFAULT_PROVIDERS,
    defaults: {
      provider: "anthropic",
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
        "~/.anton/config.yaml",
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
    sessions: { ttlDays: 7 },
  };
}

// ── Provider management ─────────────────────────────────────────────

export function setProviderKey(config: AgentConfig, provider: string, apiKey: string): void {
  if (!config.providers[provider]) {
    config.providers[provider] = { apiKey, models: [] };
  } else {
    config.providers[provider].apiKey = apiKey;
  }
  saveConfig(config);
}

export function setDefault(config: AgentConfig, provider: string, model: string): void {
  config.defaults = { provider, model };
  saveConfig(config);
}

export function getProvidersList(config: AgentConfig) {
  return Object.entries(config.providers).map(([name, p]) => ({
    name,
    models: p.models,
    hasApiKey: !!(p.apiKey && p.apiKey.length > 0),
    baseUrl: p.baseUrl,
  }));
}

// ── Session persistence ─────────────────────────────────────────────

export function saveSession(session: PersistedSession): void {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  const path = join(SESSIONS_DIR, `${session.id}.json`);
  writeFileSync(path, JSON.stringify(session, null, 2), "utf-8");
}

export function loadSession(id: string): PersistedSession | null {
  const path = join(SESSIONS_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as PersistedSession;
}

export function listSessions(): PersistedSession[] {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".json"));
  return files.map(f => {
    const raw = readFileSync(join(SESSIONS_DIR, f), "utf-8");
    return JSON.parse(raw) as PersistedSession;
  }).sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

export function deleteSession(id: string): boolean {
  const path = join(SESSIONS_DIR, `${id}.json`);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

export function cleanExpiredSessions(ttlDays: number = 7): number {
  const cutoff = Date.now() - (ttlDays * 24 * 60 * 60 * 1000);
  const sessions = listSessions();
  let cleaned = 0;
  for (const session of sessions) {
    if (session.lastActiveAt < cutoff) {
      deleteSession(session.id);
      cleaned++;
    }
  }
  return cleaned;
}

// ── Exports ─────────────────────────────────────────────────────────

export function getAntonDir(): string {
  return ANTON_DIR;
}

export function getSessionsDir(): string {
  return SESSIONS_DIR;
}

// ── System prompt loading ───────────────────────────────────────────

/**
 * Load the system prompt from ~/.anton/prompts/system.md.
 * If it doesn't exist, copies the bundled default there first.
 *
 * Prompt layering (highest priority wins):
 *   1. ~/.anton/prompts/system.md      (user-editable, persists across updates)
 *   2. Bundled prompts/system.md       (shipped with package, used as seed)
 *   3. Hardcoded fallback              (last resort)
 *
 * Users can also place additional context in:
 *   ~/.anton/prompts/append.md         (appended after system prompt)
 *   ~/.anton/prompts/rules/*.md        (project rules, appended as sections)
 */
export function loadSystemPrompt(): string {
  mkdirSync(PROMPTS_DIR, { recursive: true });

  // Seed from bundled default if user hasn't customized yet
  if (!existsSync(SYSTEM_PROMPT_PATH)) {
    if (existsSync(BUNDLED_PROMPT_PATH)) {
      copyFileSync(BUNDLED_PROMPT_PATH, SYSTEM_PROMPT_PATH);
      console.log(`  System prompt created: ${SYSTEM_PROMPT_PATH}`);
    } else {
      // Hardcoded fallback if bundled file is missing
      return FALLBACK_SYSTEM_PROMPT;
    }
  }

  let prompt = readFileSync(SYSTEM_PROMPT_PATH, "utf-8");

  // Append extra context if present
  const appendPath = join(PROMPTS_DIR, "append.md");
  if (existsSync(appendPath)) {
    prompt += "\n\n" + readFileSync(appendPath, "utf-8");
  }

  // Append rules
  const rulesDir = join(PROMPTS_DIR, "rules");
  if (existsSync(rulesDir)) {
    const ruleFiles = readdirSync(rulesDir).filter(f => f.endsWith(".md")).sort();
    for (const file of ruleFiles) {
      const content = readFileSync(join(rulesDir, file), "utf-8");
      prompt += `\n\n## ${file.replace(".md", "")}\n\n${content}`;
    }
  }

  return prompt;
}

const FALLBACK_SYSTEM_PROMPT = `You are anton, an AI agent running on this machine. You are a doer, not a describer. When the user asks you to do something, use your tools and do it. Be concise.`;
