package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/anthropics/antoncomputer/server/pkg/broker"
)

var (
	version = "0.1.0-dev"
	port    = flag.Int("port", 8765, "broker listen port")
)

func main() {
	flag.Parse()

	fmt.Printf("antonbroker v%s starting on port %d\n", version, *port)

	relay := broker.NewRelay()

	mux := http.NewServeMux()
	mux.HandleFunc("/ws/agent", relay.HandleAgent)   // Agent connects here
	mux.HandleFunc("/ws/client", relay.HandleClient)  // Desktop app connects here
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	server := &http.Server{
		Addr:    fmt.Sprintf(":%d", *port),
		Handler: mux,
	}

	go func() {
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	log.Println("shutting down broker")
	server.Close()
}
