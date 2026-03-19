import React, { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { ArrowDown } from "lucide-react";
import type { ChatMessage } from "../../lib/store.js";
import { MessageBubble } from "./MessageBubble.js";

interface Props {
  messages: ChatMessage[];
}

export function MessageList({ messages }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    if (isNearBottom) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  // Show/hide scroll button
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      const distFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollBtn(distFromBottom > 200);
    };

    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
      <div className="max-w-3xl mx-auto flex flex-col gap-2">
        <AnimatePresence mode="popLayout">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 rounded-full p-2 shadow-lg hover:bg-zinc-700 transition-colors z-10"
        >
          <ArrowDown className="w-4 h-4 text-zinc-300" />
        </button>
      )}
    </div>
  );
}
