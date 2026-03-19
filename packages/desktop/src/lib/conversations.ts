import type { ChatMessage } from "./store.js";

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "anton.conversations";

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export function createConversation(title?: string): Conversation {
  return {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: title || "New conversation",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function autoTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  const text = firstUser.content.trim();
  return text.length > 50 ? text.slice(0, 50) + "..." : text;
}
