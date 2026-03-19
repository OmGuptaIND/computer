#!/usr/bin/env bash
#
# One-command deploy: build locally, sync to VPS, restart agent.
#
# Usage:
#   pnpm deploy                              # uses defaults
#   ./deploy/sync.sh user@host               # custom SSH target
#   ANTON_SSH=ubuntu@my-vps ./deploy/sync.sh # env var
#
set -euo pipefail

SSH_TARGET="${1:-${ANTON_SSH:-ubuntu@148.113.4.94}}"
REMOTE_DIR="/home/anton/.anton/agent"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Building locally..."
cd "$ROOT_DIR"
pnpm protocol:build
pnpm agent:build

echo "==> Syncing to $SSH_TARGET:$REMOTE_DIR ..."
rsync -avz --delete \
  -e ssh \
  --rsync-path="sudo rsync" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='packages/desktop' \
  --exclude='packages/cli' \
  --exclude='deploy' \
  --exclude='docs' \
  --exclude='biome.json' \
  --exclude='*.md' \
  "$ROOT_DIR/" "$SSH_TARGET:$REMOTE_DIR/"

echo "==> Installing deps on remote..."
ssh "$SSH_TARGET" "sudo -u anton bash -c 'cd $REMOTE_DIR && pnpm install --frozen-lockfile 2>&1 || npm install 2>&1'" || true

echo "==> Restarting agent..."
# Kill existing agent process, then start fresh
ssh "$SSH_TARGET" "sudo pkill -u anton -f 'node.*index.js' 2>/dev/null || true; sleep 1; sudo -u anton bash -c 'cd $REMOTE_DIR && nohup /usr/bin/node packages/agent/dist/index.js > /tmp/anton-agent.log 2>&1 &'; sleep 1"

echo "==> Verifying..."
ssh "$SSH_TARGET" "ps aux | grep 'node.*index.js' | grep -v grep && echo '' && echo 'Agent is running!' || echo 'ERROR: Agent failed to start. Check: ssh $SSH_TARGET \"cat /tmp/anton-agent.log\"'"

echo ""
echo "==> Deploy complete!"
