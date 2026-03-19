package tools

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/anthropics/antoncomputer/agent/pkg/ai"
)

// ShellTool executes shell commands on the VM.
type ShellTool struct{}

func (s *ShellTool) Definition() ai.ToolDef {
	return ai.ToolDef{
		Name:        "shell",
		Description: "Execute a shell command and return stdout/stderr. Use for running programs, installing packages, checking system state.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"command": map[string]any{
					"type":        "string",
					"description": "The shell command to execute",
				},
				"timeout_seconds": map[string]any{
					"type":        "integer",
					"description": "Max execution time in seconds (default: 30)",
				},
			},
			"required": []string{"command"},
		},
	}
}

func (s *ShellTool) Execute(ctx context.Context, input map[string]any) (string, error) {
	command, ok := input["command"].(string)
	if !ok {
		return "", fmt.Errorf("command must be a string")
	}

	timeout := 30
	if t, ok := input["timeout_seconds"].(float64); ok {
		timeout = int(t)
	}

	ctx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", command)

	var out strings.Builder
	cmd.Stdout = &out
	cmd.Stderr = &out

	err := cmd.Run()
	output := out.String()

	if err != nil {
		return fmt.Sprintf("exit code: %s\n%s", err, output), nil
	}

	return output, nil
}
