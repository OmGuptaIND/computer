package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/gofiber/fiber/v2"

	"github.com/OmGuptaIND/anton.computer/sidecar/internal/config"
	"github.com/OmGuptaIND/anton.computer/sidecar/internal/update"
)

var updateMu sync.Mutex
var updateRunning bool

// NewUpdateCheckHandler returns a handler that checks for available updates.
func NewUpdateCheckHandler(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		result, err := update.Check(cfg.AgentPort)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": err.Error(),
			})
		}
		return c.JSON(result)
	}
}

// NewUpdateStartHandler returns a handler that executes the update,
// streaming newline-delimited JSON progress events.
func NewUpdateStartHandler(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Prevent concurrent updates
		updateMu.Lock()
		if updateRunning {
			updateMu.Unlock()
			return c.Status(fiber.StatusConflict).JSON(fiber.Map{
				"error": "update already in progress",
			})
		}
		updateRunning = true
		updateMu.Unlock()

		defer func() {
			updateMu.Lock()
			updateRunning = false
			updateMu.Unlock()
		}()

		// Set up streaming response
		c.Set("Content-Type", "application/x-ndjson")
		c.Set("Cache-Control", "no-cache")

		c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
			update.Execute(cfg.AgentPort, func(p update.Progress) {
				data, err := json.Marshal(p)
				if err != nil {
					return
				}
				fmt.Fprintf(w, "%s\n", data)
				w.Flush()
			})
		})

		return nil
	}
}
