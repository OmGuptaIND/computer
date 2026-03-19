package ai

import (
	"context"
	"fmt"
	"os/exec"
)

// OpenClawEngine wraps an OpenClaw instance as a subprocess.
// OpenClaw handles its own tool calling, memory, and integrations.
// We just manage its lifecycle and pipe messages through.
type OpenClawEngine struct {
	binaryPath string // path to openclaw binary
	configPath string // openclaw config directory
	cmd        *exec.Cmd
	running    bool
}

// NewOpenClawEngine creates an engine that delegates to OpenClaw.
func NewOpenClawEngine(binaryPath, configPath string) *OpenClawEngine {
	if binaryPath == "" {
		binaryPath = "openclaw" // assume it's in PATH
	}
	return &OpenClawEngine{
		binaryPath: binaryPath,
		configPath: configPath,
	}
}

func (e *OpenClawEngine) Name() string {
	return "openclaw"
}

func (e *OpenClawEngine) Chat(ctx context.Context, messages []Message, tools []ToolDef) (<-chan StreamChunk, error) {
	ch := make(chan StreamChunk, 10)

	// Check if OpenClaw is available
	_, err := exec.LookPath(e.binaryPath)
	if err != nil {
		ch <- StreamChunk{
			Type:  "error",
			Error: fmt.Sprintf("OpenClaw not found at %s. Install it or switch to builtin engine.", e.binaryPath),
		}
		close(ch)
		return ch, nil
	}

	go func() {
		defer close(ch)

		// TODO: Implement OpenClaw integration
		// Options:
		// 1. Use OpenClaw's HTTP API if running as a server
		// 2. Use OpenClaw's SDK/library if importable
		// 3. Shell out to `openclaw chat` with piped stdin/stdout
		//
		// For v0.1, we'll use approach 3 (simplest):
		// - Start `openclaw` as subprocess with JSON mode
		// - Pipe messages in via stdin
		// - Read streamed responses from stdout
		// - OpenClaw handles its own tool execution internally

		ch <- StreamChunk{
			Type: "text",
			Text: "OpenClaw engine not yet implemented. Switch to builtin engine in config.",
		}
		ch <- StreamChunk{Type: "done"}
	}()

	return ch, nil
}

// Start launches the OpenClaw subprocess.
func (e *OpenClawEngine) Start() error {
	// TODO: Start OpenClaw as a background process/server
	return nil
}

// Stop terminates the OpenClaw subprocess.
func (e *OpenClawEngine) Stop() error {
	if e.cmd != nil && e.cmd.Process != nil {
		return e.cmd.Process.Kill()
	}
	return nil
}
