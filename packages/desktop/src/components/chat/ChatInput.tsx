import React, { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { useStore, useAgentStatus } from "../../lib/store.js";
import { SlashCommandMenu } from "./SlashCommandMenu.js";
import { type Skill } from "../../lib/skills.js";

interface Props {
  onSend: (text: string) => void;
  onSkillSelect: (skill: Skill) => void;
}

export function ChatInput({ onSend, onSkillSelect }: Props) {
  const [input, setInput] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const agentStatus = useAgentStatus();

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // Slash command detection
    if (val.startsWith("/")) {
      setShowSlashMenu(true);
      setSlashFilter(val.slice(1));
    } else {
      setShowSlashMenu(false);
    }
  };

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || agentStatus === "working") return;
    onSend(text);
    setInput("");
    setShowSlashMenu(false);
    textareaRef.current?.focus();
  }, [input, agentStatus, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu) return; // Let slash menu handle keys
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSkillSelect = (skill: Skill) => {
    setInput("");
    setShowSlashMenu(false);
    onSkillSelect(skill);
  };

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/80 backdrop-blur-sm px-4 pb-4 pt-3">
      <div className="max-w-3xl mx-auto">
        {/* Status pill */}
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              agentStatus === "working"
                ? "bg-yellow-500 animate-pulse"
                : agentStatus === "error"
                  ? "bg-red-500"
                  : "bg-green-500"
            }`}
          />
          <span className="text-[11px] text-zinc-500">
            {agentStatus === "working"
              ? "Agent working..."
              : agentStatus === "error"
                ? "Error"
                : "Ready"}
          </span>
        </div>

        {/* Input row */}
        <div className="relative flex items-end gap-2">
          <SlashCommandMenu
            filter={slashFilter}
            onSelect={handleSkillSelect}
            onClose={() => setShowSlashMenu(false)}
            visible={showSlashMenu}
          />

          <div className="flex-1 relative bg-zinc-900 border border-zinc-800 rounded-xl focus-within:border-zinc-600 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Message your agent..."
              rows={1}
              className="w-full px-4 py-3 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 outline-none resize-none font-sans"
              style={{ minHeight: 44, maxHeight: 160 }}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!input.trim() || agentStatus === "working"}
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-green-600 text-white hover:bg-green-500 disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors"
          >
            {agentStatus === "working" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </div>

        <p className="text-[10px] text-zinc-600 mt-1.5 px-1">
          Enter to send · Shift+Enter for newline · Type / for skills
        </p>
      </div>
    </div>
  );
}
