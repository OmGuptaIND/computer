// Package portfwd handles port scanning and TCP forwarding.
package portfwd

import (
	"fmt"
	"net"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// ListeningPort represents a port with an active listener on the VM.
type ListeningPort struct {
	Port    int    `json:"port"`
	Proto   string `json:"proto"` // "tcp" or "udp"
	Process string `json:"process,omitempty"`
	PID     int    `json:"pid,omitempty"`
}

// ScanListeningPorts finds all ports with active listeners.
func ScanListeningPorts() ([]ListeningPort, error) {
	switch runtime.GOOS {
	case "linux":
		return scanLinux()
	case "darwin":
		return scanDarwin()
	default:
		return scanFallback()
	}
}

func scanLinux() ([]ListeningPort, error) {
	out, err := exec.Command("ss", "-tlnp").Output()
	if err != nil {
		return scanFallback()
	}

	var ports []ListeningPort
	for _, line := range strings.Split(string(out), "\n")[1:] {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		addr := fields[3]
		parts := strings.Split(addr, ":")
		if len(parts) < 2 {
			continue
		}
		port, err := strconv.Atoi(parts[len(parts)-1])
		if err != nil {
			continue
		}
		lp := ListeningPort{Port: port, Proto: "tcp"}
		// Extract process name from the last field
		if len(fields) >= 6 {
			lp.Process = fields[5]
		}
		ports = append(ports, lp)
	}
	return ports, nil
}

func scanDarwin() ([]ListeningPort, error) {
	out, err := exec.Command("lsof", "-iTCP", "-sTCP:LISTEN", "-n", "-P").Output()
	if err != nil {
		return scanFallback()
	}

	var ports []ListeningPort
	for _, line := range strings.Split(string(out), "\n")[1:] {
		fields := strings.Fields(line)
		if len(fields) < 9 {
			continue
		}
		addr := fields[8]
		parts := strings.Split(addr, ":")
		if len(parts) < 2 {
			continue
		}
		port, err := strconv.Atoi(parts[len(parts)-1])
		if err != nil {
			continue
		}
		ports = append(ports, ListeningPort{
			Port:    port,
			Proto:   "tcp",
			Process: fields[0],
		})
	}
	return ports, nil
}

func scanFallback() ([]ListeningPort, error) {
	commonPorts := []int{80, 443, 3000, 3001, 4000, 5000, 5173, 8000, 8080, 8443, 8888, 9000}
	var ports []ListeningPort

	for _, port := range commonPorts {
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("localhost:%d", port), 100*time.Millisecond)
		if err == nil {
			conn.Close()
			ports = append(ports, ListeningPort{Port: port, Proto: "tcp"})
		}
	}
	return ports, nil
}
