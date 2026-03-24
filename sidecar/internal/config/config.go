package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds sidecar runtime configuration, loaded from environment variables.
type Config struct {
	// Port the sidecar HTTP server listens on (localhost only).
	Port int

	// AgentPort is the port the anton agent listens on (for health checks).
	AgentPort int

	// Token is the ANTON_TOKEN used to authenticate protected endpoints.
	Token string

	// Version is the build version, injected via -ldflags.
	Version string
}

// Load reads configuration from environment variables and CLI-style defaults.
func Load(version string) (*Config, error) {
	cfg := &Config{
		Port:      9878,
		AgentPort: 9876,
		Version:   version,
	}

	if v := os.Getenv("SIDECAR_PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("invalid SIDECAR_PORT: %w", err)
		}
		cfg.Port = p
	}

	if v := os.Getenv("AGENT_PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("invalid AGENT_PORT: %w", err)
		}
		cfg.AgentPort = p
	}

	cfg.Token = strings.TrimSpace(os.Getenv("ANTON_TOKEN"))

	if cfg.Token == "" {
		return nil, fmt.Errorf("ANTON_TOKEN is required")
	}

	return cfg, nil
}
