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
      <div className={isError ? "tool-result tool-result--error" : "tool-result"}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="tool-result__summary"
        >
          {isError && <AlertTriangle className="tool-result__alert" />}
          <span className={isError ? "tool-result__preview tool-result__preview--error" : "tool-result__preview"}>
            {message.content.slice(0, 80)}
            {message.content.length > 80 ? "..." : ""}
          </span>
          <span className="tool-result__chevron">
            {expanded ? <ChevronUp className="tool-result__chevronIcon" /> : <ChevronDown className="tool-result__chevronIcon" />}
          </span>
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              transition={{ duration: 0.15 }}
              className="tool-result__body"
            >
              <pre className="tool-result__content">
                {message.content}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="tool-call">
      <Wrench className="tool-call__icon" />
      <span className="tool-call__name">{message.toolName}</span>
      {message.toolInput && (
        <span className="tool-call__input">
          {message.toolName === "shell"
            ? (message.toolInput as any).command
            : JSON.stringify(message.toolInput).slice(0, 80)}
        </span>
      )}
    </div>
  );
}
