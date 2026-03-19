// Package tools provides the tool registry for AI agent execution.
package tools

import (
	"context"
	"fmt"

	"github.com/anthropics/antoncomputer/agent/pkg/ai"
)

// Tool is something the AI can invoke.
type Tool interface {
	Definition() ai.ToolDef
	Execute(ctx context.Context, input map[string]any) (string, error)
}

// Registry holds all available tools.
type Registry struct {
	tools map[string]Tool
}

func NewRegistry() *Registry {
	r := &Registry{tools: make(map[string]Tool)}

	// Register built-in tools
	r.Register(&ShellTool{})
	r.Register(&FileSystemTool{})

	return r
}

// Register adds a tool to the registry.
func (r *Registry) Register(t Tool) {
	def := t.Definition()
	r.tools[def.Name] = t
}

// Definitions returns all tool definitions for the AI.
func (r *Registry) Definitions() []ai.ToolDef {
	defs := make([]ai.ToolDef, 0, len(r.tools))
	for _, t := range r.tools {
		defs = append(defs, t.Definition())
	}
	return defs
}

// Execute runs a tool by name.
func (r *Registry) Execute(ctx context.Context, name string, input map[string]any) (string, error) {
	t, ok := r.tools[name]
	if !ok {
		return "", fmt.Errorf("unknown tool: %s", name)
	}
	return t.Execute(ctx, input)
}
