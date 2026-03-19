import React, { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { connection } from "../lib/connection.js";
import { Channel } from "@anton/protocol";
import "@xterm/xterm/css/xterm.css";

const TERMINAL_ID = "t1";

export function Terminal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal
    const term = new XTerm({
      theme: {
        background: "#09090b",
        foreground: "#e4e4e7",
        cursor: "#22c55e",
        cursorAccent: "#09090b",
        selectionBackground: "#27272a",
        black: "#09090b",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e4e4e7",
        brightBlack: "#52525b",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#c084fc",
        brightCyan: "#22d3ee",
        brightWhite: "#fafafa",
      },
      fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    // Spawn PTY on agent
    const { cols, rows } = term;
    connection.sendTerminalSpawn(TERMINAL_ID, cols, rows);

    // Send input to agent
    term.onData((data) => {
      connection.sendTerminalData(TERMINAL_ID, btoa(data));
    });

    // Receive output from agent
    const unsub = connection.onMessage((channel, msg) => {
      if (channel === Channel.TERMINAL && msg.type === "pty_data" && msg.id === TERMINAL_ID) {
        try {
          term.write(atob(msg.data));
        } catch {
          term.write(msg.data);
        }
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      connection.sendTerminalResize(TERMINAL_ID, term.cols, term.rows);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      unsub();
      resizeObserver.disconnect();
      term.dispose();
    };
  }, []);

  return (
    <div style={styles.container}>
      <div ref={containerRef} style={styles.terminal} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: "100%",
    background: "#09090b",
    padding: 4,
  },
  terminal: {
    height: "100%",
    width: "100%",
  },
};
