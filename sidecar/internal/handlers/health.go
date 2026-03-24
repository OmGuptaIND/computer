package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
)

var startTime = time.Now()

// Health is a lightweight liveness probe. Always returns 200 if the sidecar is running.
func Health(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status": "ok",
		"uptime": int64(time.Since(startTime).Seconds()),
	})
}
