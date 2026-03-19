import { connection } from "./connection.js";
import { useStore } from "./store.js";

export interface SkillParameter {
  name: string;
  label: string;
  type: "text" | "select" | "boolean";
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  command: string;
  prompt: string;
  category: string;
  parameters?: SkillParameter[];
}

export const builtinSkills: Skill[] = [
  {
    id: "deploy-git",
    name: "Deploy from Git",
    description: "Clone a repo, install dependencies, and start the app with zero-downtime deployment",
    icon: "rocket",
    command: "/deploy",
    category: "DevOps",
    prompt: "Deploy the application from the git repository: {repo}. Branch: {branch}. Follow zero-downtime deployment practices.",
    parameters: [
      { name: "repo", label: "Repository URL", type: "text", placeholder: "github.com/user/repo", required: true },
      { name: "branch", label: "Branch", type: "text", placeholder: "main" },
    ],
  },
  {
    id: "system-health",
    name: "System Health Check",
    description: "Check CPU, memory, disk usage, running services, and overall system health",
    icon: "activity",
    command: "/health",
    category: "DevOps",
    prompt: "Run a comprehensive system health check. Report on CPU usage, memory usage, disk space, load average, running services, and any potential issues. Flag anything that needs attention.",
  },
  {
    id: "setup-nginx",
    name: "Setup Nginx",
    description: "Install and configure Nginx as a reverse proxy with SSL",
    icon: "globe",
    command: "/nginx",
    category: "DevOps",
    prompt: "Install nginx and set up a reverse proxy for the application running on port {port}. Domain: {domain}. Set up proper security headers.",
    parameters: [
      { name: "domain", label: "Domain", type: "text", placeholder: "example.com", required: true },
      { name: "port", label: "App Port", type: "text", placeholder: "3000", required: true },
    ],
  },
  {
    id: "docker-manage",
    name: "Docker Containers",
    description: "List, start, stop, and manage Docker containers and images",
    icon: "box",
    command: "/docker",
    category: "DevOps",
    prompt: "List all Docker containers (running and stopped) and images. Show resource usage for running containers. {action}",
    parameters: [
      { name: "action", label: "Action", type: "select", options: ["Show status", "Clean up unused", "Restart all"] },
    ],
  },
  {
    id: "analyze-logs",
    name: "Analyze Logs",
    description: "Find and analyze log files for errors, warnings, and patterns",
    icon: "file-text",
    command: "/logs",
    category: "Analysis",
    prompt: "Find and analyze log files in {path}. Look for errors, warnings, and unusual patterns. Summarize findings and suggest fixes.",
    parameters: [
      { name: "path", label: "Log path", type: "text", placeholder: "/var/log" },
    ],
  },
  {
    id: "setup-firewall",
    name: "Configure Firewall",
    description: "Set up UFW firewall rules for secure server access",
    icon: "shield",
    command: "/firewall",
    category: "Security",
    prompt: "Configure UFW firewall. Allow SSH (22), HTTP (80), HTTPS (443), and port {extra_port} if specified. Deny all other incoming. Enable the firewall.",
    parameters: [
      { name: "extra_port", label: "Extra port to allow", type: "text", placeholder: "Optional" },
    ],
  },
  {
    id: "db-backup",
    name: "Database Backup",
    description: "Create a compressed backup of a PostgreSQL or MySQL database",
    icon: "database",
    command: "/backup",
    category: "Data",
    prompt: "Create a compressed backup of the {db_type} database named {db_name}. Store the backup in /backups/ with a timestamp.",
    parameters: [
      { name: "db_type", label: "Database type", type: "select", options: ["PostgreSQL", "MySQL", "SQLite"], required: true },
      { name: "db_name", label: "Database name", type: "text", placeholder: "mydb", required: true },
    ],
  },
  {
    id: "cron-manager",
    name: "Cron Job Manager",
    description: "List, create, and manage scheduled cron jobs",
    icon: "clock",
    command: "/cron",
    category: "System",
    prompt: "List all current cron jobs for all users. {action}",
    parameters: [
      { name: "action", label: "Action", type: "select", options: ["List all jobs", "Add a new job", "Remove a job"] },
    ],
  },
];

export function getSkills(): Skill[] {
  return builtinSkills;
}

export function findSkillByCommand(command: string): Skill | undefined {
  return builtinSkills.find((s) => s.command === command);
}

export function executeSkill(skill: Skill, params: Record<string, string> = {}) {
  let prompt = skill.prompt;
  for (const [key, value] of Object.entries(params)) {
    prompt = prompt.replace(`{${key}}`, value || "");
  }
  // Clean up unfilled placeholders
  prompt = prompt.replace(/\{[^}]+\}/g, "").replace(/\s{2,}/g, " ").trim();

  const store = useStore.getState();
  const convId = store.newConversation(skill.name);

  store.addMessage({
    id: `user_${Date.now()}`,
    role: "user",
    content: prompt,
    timestamp: Date.now(),
  });

  connection.sendAiMessage(prompt);
  return convId;
}
