import { create } from "zustand";
import { connection, type ConnectionStatus } from "./connection.js";
import { Channel } from "@anton/protocol";
import {
  type Conversation,
  loadConversations,
  saveConversations,
  createConversation,
  autoTitle,
} from "./conversations.js";

// ── Types ───────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  timestamp: number;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  isError?: boolean;
}

export interface SavedMachine {
  id: string;
  name: string;
  host: string;
  port: number;
  token: string;
  useTLS: boolean;
}

export type AgentStatus = "idle" | "working" | "error" | "unknown";
export type SidebarTab = "history" | "skills";

// ── Saved machines (localStorage) ───────────────────────────────────

const MACHINES_KEY = "anton.machines";

export function loadMachines(): SavedMachine[] {
  try {
    const raw = localStorage.getItem(MACHINES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMachines(machines: SavedMachine[]) {
  localStorage.setItem(MACHINES_KEY, JSON.stringify(machines));
}

// ── Store ───────────────────────────────────────────────────────────

interface AppState {
  // Connection
  connectionStatus: ConnectionStatus;
  agentStatus: AgentStatus;

  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;

  // UI
  sidebarTab: SidebarTab;
  searchQuery: string;

  // Pending confirmation
  pendingConfirm: { id: string; command: string; reason: string } | null;

  // Actions
  setConnectionStatus: (status: ConnectionStatus) => void;
  setAgentStatus: (status: AgentStatus) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setSearchQuery: (query: string) => void;

  // Conversation actions
  newConversation: (title?: string) => string;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  addMessage: (msg: ChatMessage) => void;
  getActiveConversation: () => Conversation | null;

  // Confirm actions
  setPendingConfirm: (confirm: { id: string; command: string; reason: string } | null) => void;
}

export const useStore = create<AppState>((set, get) => {
  // Load persisted conversations
  const persisted = loadConversations();

  return {
    connectionStatus: "disconnected",
    agentStatus: "unknown",
    conversations: persisted,
    activeConversationId: null,
    sidebarTab: "history",
    searchQuery: "",
    pendingConfirm: null,

    setConnectionStatus: (status) => set({ connectionStatus: status }),
    setAgentStatus: (status) => set({ agentStatus: status }),
    setSidebarTab: (tab) => set({ sidebarTab: tab }),
    setSearchQuery: (query) => set({ searchQuery: query }),

    newConversation: (title) => {
      const conv = createConversation(title);
      set((state) => {
        const conversations = [conv, ...state.conversations];
        saveConversations(conversations);
        return { conversations, activeConversationId: conv.id };
      });
      return conv.id;
    },

    switchConversation: (id) => set({ activeConversationId: id }),

    deleteConversation: (id) => {
      set((state) => {
        const conversations = state.conversations.filter((c) => c.id !== id);
        saveConversations(conversations);
        const activeConversationId =
          state.activeConversationId === id
            ? conversations[0]?.id || null
            : state.activeConversationId;
        return { conversations, activeConversationId };
      });
    },

    addMessage: (msg) => {
      set((state) => {
        const activeId = state.activeConversationId;
        if (!activeId) return state;

        const conversations = state.conversations.map((c) => {
          if (c.id !== activeId) return c;
          const messages = [...c.messages, msg];
          const title = c.messages.length === 0 && msg.role === "user"
            ? autoTitle(messages)
            : c.title;
          return { ...c, messages, title, updatedAt: Date.now() };
        });

        saveConversations(conversations);
        return { conversations };
      });
    },

    getActiveConversation: () => {
      const { conversations, activeConversationId } = get();
      return conversations.find((c) => c.id === activeConversationId) || null;
    },

    setPendingConfirm: (confirm) => set({ pendingConfirm: confirm }),
  };
});

// ── Wire connection events to store ─────────────────────────────────

connection.onStatusChange((status) => {
  useStore.getState().setConnectionStatus(status);
});

connection.onMessage((channel, msg) => {
  const store = useStore.getState();

  if (channel === Channel.EVENTS && msg.type === "agent_status") {
    store.setAgentStatus(msg.status);
    return;
  }

  if (channel !== Channel.AI) return;

  switch (msg.type) {
    case "text":
      store.addMessage({
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: msg.content,
        timestamp: Date.now(),
      });
      store.setAgentStatus("idle");
      break;

    case "thinking":
      store.addMessage({
        id: `think_${Date.now()}`,
        role: "system",
        content: msg.text,
        timestamp: Date.now(),
      });
      store.setAgentStatus("working");
      break;

    case "tool_call":
      store.addMessage({
        id: `tc_${msg.id}`,
        role: "tool",
        content: `Running: ${msg.name}`,
        toolName: msg.name,
        toolInput: msg.input,
        timestamp: Date.now(),
      });
      store.setAgentStatus("working");
      break;

    case "tool_result":
      store.addMessage({
        id: `tr_${msg.id}`,
        role: "tool",
        content: msg.output,
        isError: msg.isError,
        timestamp: Date.now(),
      });
      break;

    case "confirm":
      store.setPendingConfirm({
        id: msg.id,
        command: msg.command,
        reason: msg.reason,
      });
      break;

    case "error":
      store.addMessage({
        id: `err_${Date.now()}`,
        role: "system",
        content: msg.message,
        isError: true,
        timestamp: Date.now(),
      });
      store.setAgentStatus("error");
      break;

    case "done":
      store.setAgentStatus("idle");
      break;
  }
});

// ── Convenience hooks ───────────────────────────────────────────────

export function useConnectionStatus(): ConnectionStatus {
  return useStore((s) => s.connectionStatus);
}

export function useAgentStatus(): AgentStatus {
  return useStore((s) => s.agentStatus);
}
