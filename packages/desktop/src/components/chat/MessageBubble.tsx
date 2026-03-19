import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import type { ChatMessage } from "../../lib/store.js";
import { MarkdownRenderer } from "./MarkdownRenderer.js";
import { ToolCallBlock } from "./ToolCallBlock.js";

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={getContainerClass(message)}
    >
      {message.role === "user" && (
        <div className="text-sm text-blue-200 whitespace-pre-wrap">{message.content}</div>
      )}

      {message.role === "assistant" && (
        <div className="text-sm text-zinc-300 leading-relaxed">
          <MarkdownRenderer content={message.content} />
        </div>
      )}

      {message.role === "tool" && <ToolCallBlock message={message} />}

      {message.role === "system" && (
        <div className="flex items-start gap-1.5 text-xs">
          {message.isError && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />}
          <span
            className={`italic ${message.isError ? "text-red-400" : "text-zinc-500"}`}
          >
            {message.content}
          </span>
        </div>
      )}
    </motion.div>
  );
}

function getContainerClass(msg: ChatMessage): string {
  const base = "max-w-full";

  switch (msg.role) {
    case "user":
      return `${base} self-end bg-blue-950/60 border border-blue-900/30 px-4 py-2.5 rounded-2xl rounded-br-md`;
    case "assistant":
      return `${base} px-1`;
    case "tool":
      return `${base}`;
    case "system":
      return `${base} px-2 py-1`;
    default:
      return base;
  }
}
