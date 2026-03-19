// Package pty manages PTY sessions for terminal access over pipes.
package pty

// Session represents a single terminal session.
type Session struct {
	ID   string
	Cols uint16
	Rows uint16
	// TODO: pty file descriptor, process handle
}

// Manager handles multiple PTY sessions.
type Manager struct {
	sessions map[string]*Session
}

func NewManager() *Manager {
	return &Manager{sessions: make(map[string]*Session)}
}

// Create spawns a new PTY session with the user's default shell.
func (m *Manager) Create(id string, cols, rows uint16) (*Session, error) {
	// TODO: Use creack/pty to spawn shell
	// TODO: Return session that can be read/written via pipe
	return nil, nil
}

// Resize changes the terminal dimensions for a session.
func (m *Manager) Resize(id string, cols, rows uint16) error {
	return nil
}

// Close terminates a PTY session.
func (m *Manager) Close(id string) error {
	return nil
}
