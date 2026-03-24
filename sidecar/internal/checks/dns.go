package checks

import "net"

// DNSStatus is the result of checking DNS resolution for the domain.
type DNSStatus struct {
	Resolved bool   `json:"resolved"`
	IP       string `json:"ip,omitempty"`
}

// CheckDNS resolves the domain and returns the first IP found.
func CheckDNS(domain string) DNSStatus {
	if domain == "" {
		return DNSStatus{Resolved: false}
	}

	ips, err := net.LookupHost(domain)
	if err != nil || len(ips) == 0 {
		return DNSStatus{Resolved: false}
	}

	return DNSStatus{Resolved: true, IP: ips[0]}
}
