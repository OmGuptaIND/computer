// Package ai defines the pluggable AI runtime interface.
package ai

import "context"

// Message represents a chat message.
type Message struct {
	Role    string `json:"role"`    // "user", "assistant", "system", "tool"
	Content string `json:"content"`
}

// ToolCall represents an AI-requested tool invocation.
type ToolCall struct {
	ID    string         `json:"id"`
	Name  string         `json:"name"`
	Input map[string]any `json:"input"`
}

// ToolResult is the output of a tool execution.
type ToolResult struct {
	CallID  string `json:"call_id"`
	Content string `json:"content"`
	IsError bool   `json:"is_error"`
}

// StreamChunk is a piece of streamed AI response.
type StreamChunk struct {
	Type      string     `json:"type"` // "text", "tool_call", "done", "error"
	Text      string     `json:"text,omitempty"`
	ToolCalls []ToolCall `json:"tool_calls,omitempty"`
	Error     string     `json:"error,omitempty"`
}

// Engine is the interface all AI backends must implement.
type Engine interface {
	// Chat sends messages and streams responses.
	Chat(ctx context.Context, messages []Message, tools []ToolDef) (<-chan StreamChunk, error)

	// Name returns the engine identifier.
	Name() string
}

// ToolDef defines a tool the AI can call.
type ToolDef struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"` // JSON Schema
}
