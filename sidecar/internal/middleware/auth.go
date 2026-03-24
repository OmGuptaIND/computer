package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

// BearerAuth returns Fiber middleware that validates the Authorization header
// against the provided token. Used for protected endpoints only.
func BearerAuth(token string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		auth := c.Get("Authorization")
		if auth == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing authorization header"})
		}

		parts := strings.SplitN(auth, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") || parts[1] != token {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid token"})
		}

		return c.Next()
	}
}
