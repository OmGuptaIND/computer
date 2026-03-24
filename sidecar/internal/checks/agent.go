package checks

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// AgentStatus is the result of checking the anton agent health endpoint.
type AgentStatus struct {
	Healthy bool `json:"healthy"`
}

// CheckAgent pings the agent's /health endpoint on localhost.
func CheckAgent(agentPort int) AgentStatus {
	client := &http.Client{Timeout: 3 * time.Second}
	url := fmt.Sprintf("http://127.0.0.1:%d/health", agentPort)

	resp, err := client.Get(url)
	if err != nil {
		return AgentStatus{Healthy: false}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return AgentStatus{Healthy: false}
	}

	// Try to parse response for extra info, but healthy is the main signal.
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err == nil {
		if status, ok := body["status"].(string); ok && status == "ok" {
			return AgentStatus{Healthy: true}
		}
	}

	// If we got a 200, consider it healthy even if body parse fails.
	return AgentStatus{Healthy: true}
}
