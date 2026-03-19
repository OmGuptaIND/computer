// Package filesync provides bidirectional file synchronization.
package filesync

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/fsnotify/fsnotify"
)

// ChangeType represents what happened to a file.
type ChangeType string

const (
	ChangeCreated  ChangeType = "created"
	ChangeModified ChangeType = "modified"
	ChangeDeleted  ChangeType = "deleted"
	ChangeRenamed  ChangeType = "renamed"
)

// FileChange represents a single file system change.
type FileChange struct {
	Type     ChangeType `json:"type"`
	Path     string     `json:"path"`
	RelPath  string     `json:"rel_path"` // relative to watch root
	Size     int64      `json:"size"`
	IsDir    bool       `json:"is_dir"`
}

// Watcher monitors file system changes and emits FileChange events.
type Watcher struct {
	watcher    *fsnotify.Watcher
	watchPaths []string
	ignore     []string
	changes    chan FileChange
	done       chan struct{}
}

func NewWatcher(paths []string, ignore []string) (*Watcher, error) {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	return &Watcher{
		watcher:    w,
		watchPaths: paths,
		ignore:     ignore,
		changes:    make(chan FileChange, 100),
		done:       make(chan struct{}),
	}, nil
}

// Changes returns the channel of file change events.
func (w *Watcher) Changes() <-chan FileChange {
	return w.changes
}

// Start begins watching all configured paths.
func (w *Watcher) Start() error {
	for _, p := range w.watchPaths {
		expanded := expandHome(p)
		if err := w.addRecursive(expanded); err != nil {
			log.Printf("warning: could not watch %s: %v", p, err)
		}
	}

	go w.loop()
	return nil
}

// Stop ends the watcher.
func (w *Watcher) Stop() {
	close(w.done)
	w.watcher.Close()
}

func (w *Watcher) loop() {
	for {
		select {
		case <-w.done:
			return
		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}
			if w.shouldIgnore(event.Name) {
				continue
			}

			var ct ChangeType
			switch {
			case event.Has(fsnotify.Create):
				ct = ChangeCreated
			case event.Has(fsnotify.Write):
				ct = ChangeModified
			case event.Has(fsnotify.Remove):
				ct = ChangeDeleted
			case event.Has(fsnotify.Rename):
				ct = ChangeRenamed
			default:
				continue
			}

			info, _ := os.Stat(event.Name)
			change := FileChange{
				Type:    ct,
				Path:    event.Name,
				RelPath: event.Name, // TODO: make relative
			}
			if info != nil {
				change.Size = info.Size()
				change.IsDir = info.IsDir()
			}

			w.changes <- change

		case err, ok := <-w.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("watcher error: %v", err)
		}
	}
}

func (w *Watcher) addRecursive(path string) error {
	return filepath.Walk(path, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if w.shouldIgnore(p) {
				return filepath.SkipDir
			}
			return w.watcher.Add(p)
		}
		return nil
	})
}

func (w *Watcher) shouldIgnore(path string) bool {
	for _, pattern := range w.ignore {
		base := filepath.Base(path)
		if matched, _ := filepath.Match(pattern, base); matched {
			return true
		}
		if strings.Contains(path, "/"+pattern+"/") {
			return true
		}
	}
	return false
}

func expandHome(path string) string {
	if strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return path
		}
		return filepath.Join(home, path[2:])
	}
	return path
}
