package checks

import (
	"os/exec"
	"strings"
)

// CaddyStatus is the result of checking the Caddy reverse proxy.
type CaddyStatus struct {
	Running bool `json:"running"`
}

// CheckCaddy checks if the caddy systemd service is active.
func CheckCaddy() CaddyStatus {
	out, err := exec.Command("systemctl", "is-active", "caddy").Output()
	if err != nil {
		return CaddyStatus{Running: false}
	}
	return CaddyStatus{Running: strings.TrimSpace(string(out)) == "active"}
}
