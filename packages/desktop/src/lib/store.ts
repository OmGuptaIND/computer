/**
 * Simple reactive store for app state.
 * No Redux, no Zustand — just useState + context for MVP.
 */

import { useState, useCallback, useEffect, useSyncExternalStore } from "react";
import { connection, type ConnectionStatus, type ConnectionConfig } from "./connection.js";
import { Channel } from "@anton/protocol";

// ── Saved machines ──────────────────────────────────────────────────

export interface SavedMachine {
  id: string;
  name: string;
  host: string;
  port: number;
  token: string;
  useTLS: boolean;
}

const STORAGE_KEY = "anton.machines";

export function loadMachines(): SavedMachine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMachines(machines: SavedMachine[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(machines));
}

// ── AI Chat messages ────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  timestamp: number;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  isError?: boolean;
}

// ── Connection status hook ──────────────────────────────────────────

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(connection.status);

  useEffect(() => {
    return connection.onStatusChange((s) => setStatus(s));
  }, []);

  return status;
}

// ── Agent status hook ───────────────────────────────────────────────

export type AgentStatus = "idle" | "working" | "error" | "unknown";

export function useAgentStatus(): AgentStatus {
  const [status, setStatus] = useState<AgentStatus>("unknown");

  useEffect(() => {
    return connection.onMessage((channel, msg) => {
      if (channel === Channel.EVENTS && msg.type === "agent_status") {
        setStatus(msg.status);
      }
    });
  }, []);

  return status;
}
