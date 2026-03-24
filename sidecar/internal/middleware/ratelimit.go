package middleware

import (
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

type bucket struct {
	tokens    float64
	lastCheck time.Time
}

// RateLimit returns Fiber middleware that limits requests per IP using a token bucket.
// maxPerMin is the maximum requests allowed per minute per IP.
func RateLimit(maxPerMin int) fiber.Handler {
	var mu sync.Mutex
	buckets := make(map[string]*bucket)
	rate := float64(maxPerMin) / 60.0

	// Cleanup stale entries every 5 minutes.
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			mu.Lock()
			now := time.Now()
			for ip, b := range buckets {
				if now.Sub(b.lastCheck) > 10*time.Minute {
					delete(buckets, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return func(c *fiber.Ctx) error {
		ip := c.Get("X-Forwarded-For")
		if ip == "" {
			ip = c.IP()
		}

		mu.Lock()
		b, ok := buckets[ip]
		if !ok {
			b = &bucket{tokens: float64(maxPerMin), lastCheck: time.Now()}
			buckets[ip] = b
		}

		now := time.Now()
		elapsed := now.Sub(b.lastCheck).Seconds()
		b.tokens += elapsed * rate
		if b.tokens > float64(maxPerMin) {
			b.tokens = float64(maxPerMin)
		}
		b.lastCheck = now

		if b.tokens < 1 {
			mu.Unlock()
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "rate limit exceeded"})
		}
		b.tokens--
		mu.Unlock()

		return c.Next()
	}
}
