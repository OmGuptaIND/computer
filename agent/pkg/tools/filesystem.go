package tools

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/anthropics/antoncomputer/agent/pkg/ai"
)

// FileSystemTool provides file read/write/search operations.
type FileSystemTool struct{}

func (f *FileSystemTool) Definition() ai.ToolDef {
	return ai.ToolDef{
		Name:        "filesystem",
		Description: "Read, write, or search files on the system. Operations: read, write, list, search.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"operation": map[string]any{
					"type": "string",
					"enum": []string{"read", "write", "list", "search"},
				},
				"path": map[string]any{
					"type":        "string",
					"description": "File or directory path",
				},
				"content": map[string]any{
					"type":        "string",
					"description": "Content to write (for write operation)",
				},
				"pattern": map[string]any{
					"type":        "string",
					"description": "Search pattern (for search operation)",
				},
			},
			"required": []string{"operation", "path"},
		},
	}
}

func (f *FileSystemTool) Execute(ctx context.Context, input map[string]any) (string, error) {
	op, _ := input["operation"].(string)
	path, _ := input["path"].(string)

	switch op {
	case "read":
		data, err := os.ReadFile(path)
		if err != nil {
			return "", fmt.Errorf("read %s: %w", path, err)
		}
		return string(data), nil

	case "write":
		content, _ := input["content"].(string)
		dir := filepath.Dir(path)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return "", fmt.Errorf("mkdir %s: %w", dir, err)
		}
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			return "", fmt.Errorf("write %s: %w", path, err)
		}
		return fmt.Sprintf("wrote %d bytes to %s", len(content), path), nil

	case "list":
		entries, err := os.ReadDir(path)
		if err != nil {
			return "", fmt.Errorf("list %s: %w", path, err)
		}
		var lines []string
		for _, e := range entries {
			info, _ := e.Info()
			if info != nil {
				lines = append(lines, fmt.Sprintf("%s\t%d\t%s", e.Name(), info.Size(), info.ModTime().Format("2006-01-02 15:04")))
			}
		}
		return strings.Join(lines, "\n"), nil

	case "search":
		pattern, _ := input["pattern"].(string)
		var matches []string
		filepath.Walk(path, func(p string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if matched, _ := filepath.Match(pattern, info.Name()); matched {
				matches = append(matches, p)
			}
			return nil
		})
		return strings.Join(matches, "\n"), nil

	default:
		return "", fmt.Errorf("unknown operation: %s", op)
	}
}
