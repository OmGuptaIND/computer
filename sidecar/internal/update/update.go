// Package update handles agent self-update orchestration.
// The sidecar (a stable Go binary) manages the update lifecycle externally,
// so the agent never updates its own running code.
package update

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

const (
	manifestURL = "https://raw.githubusercontent.com/OmGuptaIND/computer/main/manifest.json"
	repoDir     = "/opt/anton"
	agentSvc    = "anton-agent"
)

// Stage represents a step in the update process.
type Stage string

const (
	StageChecking   Stage = "checking"
	StageStopping   Stage = "stopping"
	StageDownloading Stage = "downloading"
	StageInstalling Stage = "installing"
	StageBuilding   Stage = "building"
	StageStarting   Stage = "starting"
	StageVerifying  Stage = "verifying"
	StageDone       Stage = "done"
	StageError      Stage = "error"
)

// Progress represents a single progress event streamed to the client.
type Progress struct {
	Stage   Stage  `json:"stage"`
	Message string `json:"message"`
}

// Manifest is the remote release manifest.
type Manifest struct {
	Version     string `json:"version"`
	GitHash     string `json:"gitHash"`
	Changelog   string `json:"changelog"`
	ReleaseURL  string `json:"releaseUrl"`
}

// CheckResult holds the result of an update check.
type CheckResult struct {
	UpdateAvailable bool   `json:"updateAvailable"`
	CurrentVersion  string `json:"currentVersion"`
	LatestVersion   string `json:"latestVersion,omitempty"`
	Changelog       string `json:"changelog,omitempty"`
	ReleaseURL      string `json:"releaseUrl,omitempty"`
}

// shellEnv returns environment for child processes with a proper PATH.
func shellEnv() []string {
	return []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/bin",
		"HOME=/home/anton",
		"CI=true",
	}
}

// fetchManifest downloads and parses the remote manifest.
func fetchManifest() (*Manifest, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(manifestURL)
	if err != nil {
		return nil, fmt.Errorf("fetch manifest: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("manifest returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}

	var m Manifest
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, fmt.Errorf("parse manifest: %w", err)
	}
	return &m, nil
}

// getAgentVersion reads the current agent version from its /health endpoint.
func getAgentVersion(agentPort int) string {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/health", agentPort))
	if err != nil {
		return "unknown"
	}
	defer resp.Body.Close()

	var health struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		return "unknown"
	}
	return health.Version
}

// Check compares the running agent version against the remote manifest.
func Check(agentPort int) (*CheckResult, error) {
	manifest, err := fetchManifest()
	if err != nil {
		return nil, err
	}

	current := getAgentVersion(agentPort)
	available := semverGt(manifest.Version, current)

	return &CheckResult{
		UpdateAvailable: available,
		CurrentVersion:  current,
		LatestVersion:   manifest.Version,
		Changelog:       manifest.Changelog,
		ReleaseURL:      manifest.ReleaseURL,
	}, nil
}

// Execute runs the full update lifecycle, calling onProgress for each step.
// The sidecar orchestrates: stop agent → pull → install → build → start → verify.
func Execute(agentPort int, onProgress func(Progress)) {
	emit := func(stage Stage, msg string) {
		onProgress(Progress{Stage: stage, Message: msg})
	}

	// 1. Check for update
	emit(StageChecking, "Checking for updates...")
	manifest, err := fetchManifest()
	if err != nil {
		emit(StageError, fmt.Sprintf("Failed to fetch manifest: %v", err))
		return
	}

	current := getAgentVersion(agentPort)
	if !semverGt(manifest.Version, current) {
		emit(StageDone, fmt.Sprintf("Already up to date (v%s)", current))
		return
	}

	emit(StageChecking, fmt.Sprintf("Update available: v%s → v%s", current, manifest.Version))

	// 2. Stop agent
	emit(StageStopping, "Stopping agent...")
	if err := runCmd("sudo", "systemctl", "stop", agentSvc); err != nil {
		emit(StageError, fmt.Sprintf("Failed to stop agent: %v", err))
		return
	}

	// From here, if anything fails we try to restart the agent with existing code
	rollback := func(reason string) {
		emit(StageStarting, "Rolling back — restarting agent with previous code...")
		_ = runCmd("sudo", "systemctl", "start", agentSvc)
		emit(StageError, reason)
	}

	// 3. Git pull
	emit(StageDownloading, fmt.Sprintf("Pulling v%s...", manifest.Version))
	if err := runCmd("git", "-C", repoDir, "fetch", "origin"); err != nil {
		rollback(fmt.Sprintf("Git fetch failed: %v", err))
		return
	}
	if err := runCmd("git", "-C", repoDir, "reset", "--hard", "origin/main"); err != nil {
		rollback(fmt.Sprintf("Git reset failed: %v", err))
		return
	}

	// 4. Install dependencies
	emit(StageInstalling, "Installing dependencies...")
	if err := runCmdInDir(repoDir, "pnpm", "install"); err != nil {
		rollback(fmt.Sprintf("pnpm install failed: %v", err))
		return
	}

	// 5. Build
	emit(StageBuilding, "Building...")
	if err := runCmdInDir(repoDir, "pnpm", "-r", "build"); err != nil {
		rollback(fmt.Sprintf("Build failed: %v", err))
		return
	}

	// 6. Start agent
	emit(StageStarting, "Starting agent...")
	if err := runCmd("sudo", "systemctl", "start", agentSvc); err != nil {
		emit(StageError, fmt.Sprintf("Failed to start agent: %v", err))
		return
	}

	// 7. Verify health
	emit(StageVerifying, "Verifying agent health...")
	if err := waitForHealth(agentPort, 30*time.Second); err != nil {
		emit(StageError, fmt.Sprintf("Agent failed health check after update: %v", err))
		return
	}

	newVersion := getAgentVersion(agentPort)
	emit(StageDone, fmt.Sprintf("Updated to v%s", newVersion))
}

// runCmd executes a command with the shell environment.
func runCmd(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Env = shellEnv()
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// runCmdInDir executes a command in a specific directory.
func runCmdInDir(dir string, name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Dir = dir
	cmd.Env = shellEnv()
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// waitForHealth polls the agent health endpoint until it responds OK.
func waitForHealth(agentPort int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	url := fmt.Sprintf("http://127.0.0.1:%d/health", agentPort)
	client := &http.Client{Timeout: 2 * time.Second}

	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
		}
		time.Sleep(1 * time.Second)
	}
	return fmt.Errorf("agent did not become healthy within %s", timeout)
}

// semverGt returns true if a > b (simple semver comparison).
func semverGt(a, b string) bool {
	a = strings.TrimPrefix(a, "v")
	b = strings.TrimPrefix(b, "v")

	partsA := strings.Split(a, ".")
	partsB := strings.Split(b, ".")

	for i := 0; i < 3; i++ {
		var va, vb int
		if i < len(partsA) {
			fmt.Sscanf(partsA[i], "%d", &va)
		}
		if i < len(partsB) {
			fmt.Sscanf(partsB[i], "%d", &vb)
		}
		if va > vb {
			return true
		}
		if va < vb {
			return false
		}
	}
	return false
}
