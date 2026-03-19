#!/bin/bash
# Install AntonComputer agent on any Linux machine
# Usage: curl -fsSL https://get.antoncomputer.dev | bash

set -euo pipefail

INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="$HOME/.antoncomputer"
VERSION="${ANTON_VERSION:-latest}"
ARCH=$(uname -m)

case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  arm64)   ARCH="arm64" ;;
  *)       echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

OS=$(uname -s | tr '[:upper:]' '[:lower:]')

echo "==> Installing AntonComputer Agent (${OS}/${ARCH})"

# TODO: Download binary from GitHub Releases
# DOWNLOAD_URL="https://github.com/anthropics/antoncomputer/releases/${VERSION}/download/antonagent-${OS}-${ARCH}"
# curl -fsSL "$DOWNLOAD_URL" -o /tmp/antonagent
# chmod +x /tmp/antonagent
# sudo mv /tmp/antonagent "$INSTALL_DIR/antonagent"

# Create config directory
mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_DIR/config.yaml" ]; then
  # Generate agent ID and secret
  AGENT_ID=$(openssl rand -hex 8)
  AGENT_SECRET=$(openssl rand -hex 32)

  cat > "$CONFIG_DIR/config.yaml" << EOF
agent_id: "${AGENT_ID}"
agent_secret: "${AGENT_SECRET}"
listen_port: 9876

ai:
  engine: builtin
  provider: claude
EOF

  echo "==> Config created at $CONFIG_DIR/config.yaml"
  echo "==> Agent ID: $AGENT_ID"
  echo "==> Agent Secret: $AGENT_SECRET"
  echo ""
  echo "    Save this secret — you'll need it to connect from the desktop app."
else
  echo "==> Config already exists at $CONFIG_DIR/config.yaml"
fi

# Install systemd service
if command -v systemctl &> /dev/null; then
  sudo tee /etc/systemd/system/antonagent.service > /dev/null << EOF
[Unit]
Description=AntonComputer Agent
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=$INSTALL_DIR/antonagent --config $CONFIG_DIR/config.yaml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable antonagent
  sudo systemctl start antonagent

  echo "==> Agent installed and running as systemd service"
  echo "    Status: sudo systemctl status antonagent"
  echo "    Logs:   sudo journalctl -u antonagent -f"
else
  echo "==> No systemd found. Run manually: antonagent --config $CONFIG_DIR/config.yaml"
fi

echo ""
echo "==> AntonComputer Agent is ready!"
echo "    Connect from the desktop app using:"
echo "    Host: $(hostname -I 2>/dev/null | awk '{print $1}' || echo 'your-server-ip'):9876"
