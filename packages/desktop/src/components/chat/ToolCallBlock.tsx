import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import type { ChatMessage } from "../../lib/store.js";

interface Props {
  message: ChatMessage;
}

export function ToolCallBlock({ message }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isResult = !message.toolName;
  const isError = message.isError;

  if (isResult) {
    return (
      <div
        className={`rounded-lg border overflow-hidden ${
          isError
            ? "border-red-900/50 bg-red-950/30"
            : "border-zinc-800 bg-zinc-950"
        }`}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-zinc-800/30 transition-colors"
        >
          {isError && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
          <span className={`text-xs font-mono truncate ${isError ? "text-red-400" : "text-zinc-500"}`}>
            {message.content.slice(0, 80)}
            {message.content.length > 80 ? "..." : ""}
          </span>
          <span className="ml-auto shrink-0 text-zinc-600">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </span>
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <pre className="px-3 pb-3 text-xs font-mono text-zinc-400 whitespace-pre-wrap max-h-64 overflow-auto">
                {message.content}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800">
      <Wrench className="w-3 h-3 text-yellow-500 shrink-0" />
      <span className="text-xs font-semibold text-yellow-500">{message.toolName}</span>
      {message.toolInput && (
        <span className="text-xs font-mono text-zinc-500 truncate">
          {message.toolName === "shell"
            ? (message.toolInput as any).command
            : JSON.stringify(message.toolInput).slice(0, 80)}
        </span>
      )}
    </div>
  );
}
