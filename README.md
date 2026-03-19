# anton.computer

**Your personal cloud computer. An AI agent that runs on your server, 24/7, and actually does the work.**

> Not a chatbot. Not a wrapper. A real agent with shell access, file management, and autonomous skills — running on YOUR infrastructure.

---

## What is this?

Install an agent on any VPS. Connect from a native desktop app. Give it tasks. It executes them.

```
You: "Deploy nginx, configure SSL for example.com, and set up a cron to renew certs"

Agent: [installs nginx] → [generates certbot config] → [runs certbot] → [adds cron] → "Done.
       Site is live at https://example.com, cert auto-renews monthly."
```

The agent has full access to your server — filesystem, shell, network, processes. It breaks tasks into steps, executes each one, verifies the result, and reports back. If something fails, it tries to fix it before asking you.

## Why?

**Claude Projects is amazing. But it can't DO anything.** It chats. anton.computer acts.

| | Claude Projects | anton.computer |
|---|---|---|
| Execute commands | No | Yes — full shell access |
| Manage files | No | Yes — read, write, search |
| Run 24/7 | No — close the tab, it stops | Yes — scheduled skills run autonomously |
| Your data stays yours | On Anthropic's servers | On YOUR server |
| Add custom skills | System prompts only | Drop a YAML, get a new AI worker |
| Share with team | Can't | Open source, self-host |
| Cost | $20/mo subscription | Your VPS cost (~$5/mo) + API usage |

## Quick Start

### 1. Install the agent on your server

```bash
# On any Ubuntu/Debian VPS (Hetzner, DigitalOcean, AWS, OrbStack, anything)
curl -fsSL https://get.anton.computer | bash
```

This installs Node 22, the agent, generates a config and auth token, and optionally sets up a systemd service.

### 2. Set your AI API key

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # Claude (default)
# or
export OPENAI_API_KEY=sk-...          # GPT
# or configure Ollama for local models
```

### 3. Start the agent

```bash
anton-agent
```

```
┌─────────────────────────────────────┐
│  anton.computer agent v0.1.0        │
│  Your personal cloud computer.      │
└─────────────────────────────────────┘

  Loaded 3 skill(s):
    - AI Content Writer: Writes blog posts, social media content, and newsletters
    - Server Monitor: Monitors server health and alerts on issues
    - AI Deployer: Deploys code from git repos with zero-downtime

  anton.computer agent running on wss://0.0.0.0:9876
  Agent ID: anton-myserver-a1b2c3d4
  Token: ak_7f3a2b...

  Scheduler started with 1 job(s)
    Scheduled: Server Monitor (every 6h, next: 15:00:00)
```

### 4. Connect from the desktop app

Open the anton.computer desktop app → enter your server IP + token → connected.

You get:
- **Agent tab** — give tasks, watch them execute in real-time
- **Terminal tab** — direct shell access when you need it

## Skills — AI Workers in a YAML File

Skills turn the agent into specialized workers. Drop a file in `~/.anton/skills/`:

```yaml
# ~/.anton/skills/content-writer.yaml
name: AI Content Writer
description: Writes blog posts and social media content
schedule: "0 9 * * 1"   # Every Monday at 9am

prompt: |
  You are a content writer. When activated:
  1. Check ~/content/briefs/ for content briefs
  2. Research the topic using the browser
  3. Write in markdown, save to ~/content/published/
  4. Report what you wrote

tools:
  - shell
  - filesystem
  - browser
```

That's it. The agent now writes content every Monday morning, autonomously, on your server.

**More examples:**

```yaml
# AI CMO — monitors social, drafts campaigns
name: AI CMO
schedule: "0 8 * * *"   # Daily at 8am
prompt: |
  Check analytics, draft social posts, update campaign tracker...

# AI DevOps — watches servers, handles incidents
name: Server Monitor
schedule: "0 */6 * * *"  # Every 6 hours
prompt: |
  Check disk, memory, CPU, failed services, error logs...

# AI Researcher — daily industry scan
name: AI Researcher
schedule: "0 7 * * 1-5"  # Weekdays at 7am
prompt: |
  Search for industry news, summarize findings, save report...
```

## Architecture

```
YOUR DESKTOP                              YOUR VPS
┌──────────────────┐    WebSocket (TLS)    ┌──────────────────────┐
│  Desktop App     │◄────────────────────►│  Agent Daemon        │
│  (Tauri v2)      │    Single conn,      │  (Node.js)           │
│                  │    multiplexed       │                      │
│  - Agent chat    │    channels          │  - pi SDK engine     │
│  - Terminal      │                      │  - 5 built-in tools  │
│  - Notifications │                      │  - Skills + scheduler│
└──────────────────┘                      │  - Session persist.  │
                                          └──────────────────────┘
```

**Agent brain:** [pi SDK](https://github.com/mariozechner/pi) — the engine inside OpenClaw (250k+ stars). Gives us the agentic tool-calling loop, context management, multi-model support, session persistence. We don't reinvent the wheel.

**Desktop app:** Tauri v2 (Rust + React). Native, fast, cross-platform.

**Protocol:** Single WebSocket, 4 multiplexed channels (control, terminal, AI, events). Binary framing.

## Built-in Tools

| Tool | What it does |
|------|-------------|
| `shell` | Execute any command. Timeout, streaming output. Dangerous patterns need desktop approval. |
| `filesystem` | Read, write, search, list, tree files. |
| `browser` | Fetch web pages, extract content. (Playwright for full automation in v0.2) |
| `process` | List, inspect, kill processes. |
| `network` | Scan ports, HTTP requests, DNS lookup, ping. |

## Local Development (OrbStack)

Test everything locally without a real VPS:

```bash
# 1. Create Ubuntu VM
orb create ubuntu anton-test

# 2. Install agent in VM
orb shell anton-test
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
# ... clone, build, run

# 3. Connect desktop app
cd packages/desktop && pnpm dev
# Enter: anton-test.orb.local:9876 + token
```

## Project Structure

```
anton.computer/
├── packages/
│   ├── agent/          # Node.js daemon (runs on VPS)
│   │   ├── src/
│   │   │   ├── agent.ts       # pi SDK integration
│   │   │   ├── server.ts      # WebSocket server
│   │   │   ├── skills.ts      # YAML skill loader
│   │   │   ├── scheduler.ts   # 24/7 cron runner
│   │   │   └── tools/         # shell, fs, browser, process, network
│   ├── desktop/        # Tauri v2 native app
│   │   ├── src/
│   │   │   ├── components/    # Connect, AgentChat, Terminal
│   │   │   └── lib/           # WebSocket client, state
│   │   └── src-tauri/         # Rust backend
│   └── protocol/       # Shared types & codec
├── deploy/             # Dockerfile, install script, docker-compose
├── SHIPPING.md         # Task tracker
├── ARCHITECTURE.md     # System design
└── GOALS.md            # Product vision & roadmap
```

## Configuration

Agent config lives at `~/.anton/config.yaml`:

```yaml
agent_id: anton-myserver-a1b2c3d4
token: ak_7f3a2b...
port: 9876

ai:
  provider: claude       # claude | openai | ollama
  model: claude-sonnet-4-6
  # api_key set via env var

security:
  confirm_patterns:      # Commands that need desktop approval
    - rm -rf
    - sudo
    - shutdown
    - reboot
  forbidden_paths:       # AI can't read these
    - /etc/shadow
    - ~/.ssh/id_*
```

## Security

- **Token auth** — agent generates a random token on install. Desktop must present it to connect.
- **TLS** — self-signed cert generated on first run. Desktop pins the fingerprint.
- **Dangerous command approval** — patterns like `rm -rf`, `sudo` trigger a confirmation dialog in the desktop app.
- **Audit log** — every AI action logged to `~/.anton/audit.log`.
- **No root by default** — agent runs as your user.

## Roadmap

See [GOALS.md](./GOALS.md) for the full product vision and milestone roadmap.

**Now:** v0.1 — agent + desktop app + skills, works end-to-end on any VPS.
**Next:** v0.2 — 10+ pre-built skills, file browser, port forwarding, Ollama.
**Then:** v1.0 — polished open source release, plugin SDK, skill marketplace.
**Vision:** Every professional has an AI team running on their own server.

## Contributing

This is early. Very early. But if you want to help:

1. Try it on your VPS and report what breaks
2. Write a skill YAML for your use case
3. Build a custom tool
4. Open issues for what you'd want this to do

## License

Apache 2.0
