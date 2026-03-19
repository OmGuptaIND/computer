// Package events provides a pubsub event bus for agent → client notifications.
package events

import (
	"sync"
	"time"
)

// Event types
const (
	EventFileChanged   = "file.changed"
	EventPortOpened    = "port.opened"
	EventPortClosed    = "port.closed"
	EventAgentAction   = "agent.action"
	EventAgentError    = "agent.error"
	EventCronCompleted = "cron.completed"
	EventSystemAlert   = "system.alert"
)

// Event is emitted by the agent and sent to the desktop app.
type Event struct {
	Type      string         `json:"type"`
	Timestamp time.Time      `json:"timestamp"`
	Data      map[string]any `json:"data,omitempty"`
	Message   string         `json:"message,omitempty"`
}

// Handler is a function that handles an event.
type Handler func(Event)

// Bus manages event subscriptions and dispatch.
type Bus struct {
	mu       sync.RWMutex
	handlers map[string][]Handler
	global   []Handler // receive all events
}

func NewBus() *Bus {
	return &Bus{
		handlers: make(map[string][]Handler),
	}
}

// On subscribes to events of a specific type.
func (b *Bus) On(eventType string, handler Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[eventType] = append(b.handlers[eventType], handler)
}

// OnAll subscribes to all events.
func (b *Bus) OnAll(handler Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.global = append(b.global, handler)
}

// Emit dispatches an event to all matching handlers.
func (b *Bus) Emit(e Event) {
	if e.Timestamp.IsZero() {
		e.Timestamp = time.Now()
	}

	b.mu.RLock()
	defer b.mu.RUnlock()

	for _, h := range b.handlers[e.Type] {
		go h(e)
	}
	for _, h := range b.global {
		go h(e)
	}
}
