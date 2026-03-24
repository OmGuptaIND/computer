VERSION ?= $(shell cat ../manifest.json 2>/dev/null | grep '"version"' | head -1 | sed 's/.*: "//;s/".*//')
LDFLAGS = -s -w -X main.version=$(VERSION)
BINARY = anton-sidecar

.PHONY: build build-arm64 build-amd64 clean

build:
	go build -ldflags "$(LDFLAGS)" -o $(BINARY) .

build-arm64:
	GOOS=linux GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o $(BINARY)-linux-arm64 .

build-amd64:
	GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $(BINARY)-linux-amd64 .

all: build-arm64 build-amd64

clean:
	rm -f $(BINARY) $(BINARY)-linux-*
