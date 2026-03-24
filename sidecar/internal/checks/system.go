package checks

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var startTime = time.Now()

// SystemStatus contains basic system metrics.
type SystemStatus struct {
	CPUPercent    float64 `json:"cpuPercent"`
	MemUsedMB    uint64  `json:"memUsedMB"`
	MemTotalMB   uint64  `json:"memTotalMB"`
	DiskUsedGB   float64 `json:"diskUsedGB"`
	DiskTotalGB  float64 `json:"diskTotalGB"`
	UptimeSeconds int64  `json:"uptimeSeconds"`
}

// CheckSystem gathers basic system metrics without external dependencies.
func CheckSystem() SystemStatus {
	s := SystemStatus{
		UptimeSeconds: int64(time.Since(startTime).Seconds()),
	}

	// Memory from /proc/meminfo (Linux).
	if data, err := os.ReadFile("/proc/meminfo"); err == nil {
		lines := strings.Split(string(data), "\n")
		var total, available uint64
		for _, line := range lines {
			fields := strings.Fields(line)
			if len(fields) < 2 {
				continue
			}
			val, _ := strconv.ParseUint(fields[1], 10, 64)
			switch fields[0] {
			case "MemTotal:":
				total = val
			case "MemAvailable:":
				available = val
			}
		}
		s.MemTotalMB = total / 1024
		if total > available {
			s.MemUsedMB = (total - available) / 1024
		}
	}

	// Disk usage for root filesystem.
	var stat syscall.Statfs_t
	if err := syscall.Statfs("/", &stat); err == nil {
		totalBytes := stat.Blocks * uint64(stat.Bsize)
		freeBytes := stat.Bfree * uint64(stat.Bsize)
		s.DiskTotalGB = float64(totalBytes) / (1024 * 1024 * 1024)
		s.DiskUsedGB = float64(totalBytes-freeBytes) / (1024 * 1024 * 1024)
		// Round to 1 decimal.
		s.DiskTotalGB = float64(int(s.DiskTotalGB*10)) / 10
		s.DiskUsedGB = float64(int(s.DiskUsedGB*10)) / 10
	}

	// Simple CPU approximation: number of goroutines / num CPUs (very rough).
	// For a proper CPU%, we'd need to sample /proc/stat over time.
	// For now, just report the number of CPUs.
	s.CPUPercent = 0 // Placeholder — can be enhanced with /proc/stat sampling.
	_ = runtime.NumCPU()

	return s
}
