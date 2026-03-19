package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
)

var (
	version = "0.1.0-dev"
	port    = flag.Int("port", 9876, "agent listen port")
	config  = flag.String("config", "", "config file path (default: ~/.antoncomputer/config.yaml)")
)

func main() {
	flag.Parse()

	fmt.Printf("antonagent v%s starting on port %d\n", version, *port)

	// TODO: Load config
	// TODO: Initialize pipe server (WebSocket)
	// TODO: Register PTY handler
	// TODO: Register FileSync handler
	// TODO: Register PortFwd handler
	// TODO: Register AI engine
	// TODO: Register event bus
	// TODO: Start health check

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigCh
	log.Printf("received %s, shutting down", sig)
}
