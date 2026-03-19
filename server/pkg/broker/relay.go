// Package broker implements the WebSocket relay between desktop clients and agents.
package broker

import (
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // TODO: restrict in production
}

// Relay brokers WebSocket connections between agents and desktop clients.
type Relay struct {
	mu     sync.RWMutex
	agents map[string]*websocket.Conn  // agentID → conn
	clients map[string]*websocket.Conn // agentID → client conn (1:1 for now)
}

func NewRelay() *Relay {
	return &Relay{
		agents:  make(map[string]*websocket.Conn),
		clients: make(map[string]*websocket.Conn),
	}
}

// HandleAgent handles incoming agent WebSocket connections.
// Agent sends its ID on connect, then relay forwards all messages to/from the matched client.
func (r *Relay) HandleAgent(w http.ResponseWriter, req *http.Request) {
	agentID := req.URL.Query().Get("id")
	token := req.URL.Query().Get("token")

	if agentID == "" || token == "" {
		http.Error(w, "missing id or token", http.StatusBadRequest)
		return
	}

	// TODO: Validate token

	conn, err := upgrader.Upgrade(w, req, nil)
	if err != nil {
		log.Printf("agent upgrade error: %v", err)
		return
	}

	r.mu.Lock()
	r.agents[agentID] = conn
	r.mu.Unlock()

	log.Printf("agent %s connected", agentID)

	defer func() {
		r.mu.Lock()
		delete(r.agents, agentID)
		r.mu.Unlock()
		conn.Close()
		log.Printf("agent %s disconnected", agentID)
	}()

	// Relay messages from agent → client
	for {
		msgType, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}

		r.mu.RLock()
		clientConn, ok := r.clients[agentID]
		r.mu.RUnlock()

		if ok {
			clientConn.WriteMessage(msgType, msg)
		}
	}
}

// HandleClient handles incoming desktop client WebSocket connections.
func (r *Relay) HandleClient(w http.ResponseWriter, req *http.Request) {
	agentID := req.URL.Query().Get("agent_id")
	token := req.URL.Query().Get("token")

	if agentID == "" || token == "" {
		http.Error(w, "missing agent_id or token", http.StatusBadRequest)
		return
	}

	// TODO: Validate token

	conn, err := upgrader.Upgrade(w, req, nil)
	if err != nil {
		log.Printf("client upgrade error: %v", err)
		return
	}

	r.mu.Lock()
	r.clients[agentID] = conn
	r.mu.Unlock()

	log.Printf("client connected to agent %s", agentID)

	defer func() {
		r.mu.Lock()
		delete(r.clients, agentID)
		r.mu.Unlock()
		conn.Close()
	}()

	// Relay messages from client → agent
	for {
		msgType, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}

		r.mu.RLock()
		agentConn, ok := r.agents[agentID]
		r.mu.RUnlock()

		if ok {
			agentConn.WriteMessage(msgType, msg)
		}
	}
}
