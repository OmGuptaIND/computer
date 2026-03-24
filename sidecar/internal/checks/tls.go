package checks

import (
	"crypto/tls"
	"fmt"
	"net"
	"time"
)

// TLSStatus is the result of checking TLS certificate validity.
type TLSStatus struct {
	Valid bool `json:"valid"`
}

// CheckTLS attempts a TLS handshake with the domain on port 443.
func CheckTLS(domain string) TLSStatus {
	if domain == "" {
		return TLSStatus{Valid: false}
	}

	conn, err := tls.DialWithDialer(
		&net.Dialer{Timeout: 3 * time.Second},
		"tcp",
		fmt.Sprintf("%s:443", domain),
		&tls.Config{ServerName: domain},
	)
	if err != nil {
		return TLSStatus{Valid: false}
	}
	conn.Close()
	return TLSStatus{Valid: true}
}
