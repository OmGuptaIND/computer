package ai

import (
	"context"
	"fmt"
)

// BuiltinEngine is a thin tool-calling loop that talks directly to LLM APIs.
// This is the default engine for v0.1 — simple, no dependencies.
type BuiltinEngine struct {
	provider string // "claude", "openai", "ollama"
	apiKey   string
	baseURL  string
	model    string
}

// NewBuiltinEngine creates the default AI engine.
func NewBuiltinEngine(provider, apiKey, model string) *BuiltinEngine {
	e := &BuiltinEngine{
		provider: provider,
		apiKey:   apiKey,
		model:    model,
	}

	switch provider {
	case "claude":
		e.baseURL = "https://api.anthropic.com"
		if model == "" {
			e.model = "claude-sonnet-4-6"
		}
	case "openai":
		e.baseURL = "https://api.openai.com"
		if model == "" {
			e.model = "gpt-4o"
		}
	case "ollama":
		e.baseURL = "http://localhost:11434"
		if model == "" {
			e.model = "llama3"
		}
	}

	return e
}

func (e *BuiltinEngine) Name() string {
	return fmt.Sprintf("builtin/%s", e.provider)
}

func (e *BuiltinEngine) Chat(ctx context.Context, messages []Message, tools []ToolDef) (<-chan StreamChunk, error) {
	ch := make(chan StreamChunk, 10)

	go func() {
		defer close(ch)

		// TODO: Implement the tool-calling loop:
		// 1. Send messages + tool definitions to LLM API
		// 2. Stream response chunks
		// 3. If tool_call received, emit it on channel
		// 4. Caller executes tool, appends result to messages, calls Chat again
		// 5. If text received, emit it on channel
		// 6. On "done", emit done chunk

		ch <- StreamChunk{
			Type: "text",
			Text: "AI engine not yet implemented",
		}
		ch <- StreamChunk{Type: "done"}
	}()

	return ch, nil
}
