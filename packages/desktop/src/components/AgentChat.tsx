import React, { useCallback, useEffect, useState } from "react";
import { useStore } from "../lib/store.js";
import { connection } from "../lib/connection.js";
import { MessageList } from "./chat/MessageList.js";
import { ChatInput } from "./chat/ChatInput.js";
import { EmptyState } from "./chat/EmptyState.js";
import { ConfirmDialog } from "./chat/ConfirmDialog.js";
import { SkillDialog } from "./skills/SkillDialog.js";
import type { Skill } from "../lib/skills.js";

export function AgentChat() {
  const activeConv = useStore((s) => s.getActiveConversation());
  const addMessage = useStore((s) => s.addMessage);
  const newConversation = useStore((s) => s.newConversation);
  const pendingConfirm = useStore((s) => s.pendingConfirm);
  const setPendingConfirm = useStore((s) => s.setPendingConfirm);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  // Auto-create a conversation if none active
  useEffect(() => {
    if (!activeConv) {
      newConversation();
    }
  }, [activeConv, newConversation]);

  const handleSend = useCallback(
    (text: string) => {
      if (!useStore.getState().activeConversationId) {
        newConversation();
      }
      addMessage({
        id: `user_${Date.now()}`,
        role: "user",
        content: text,
        timestamp: Date.now(),
      });
      connection.sendAiMessage(text);
    },
    [addMessage, newConversation]
  );

  const handleConfirm = useCallback(
    (approved: boolean) => {
      if (!pendingConfirm) return;
      connection.sendConfirmResponse(pendingConfirm.id, approved);
      addMessage({
        id: `confirm_${Date.now()}`,
        role: "system",
        content: approved
          ? `Approved: ${pendingConfirm.command}`
          : `Denied: ${pendingConfirm.command}`,
        timestamp: Date.now(),
      });
      setPendingConfirm(null);
    },
    [pendingConfirm, addMessage, setPendingConfirm]
  );

  const messages = activeConv?.messages || [];

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {messages.length === 0 ? (
        <EmptyState
          onSelectExample={(text) => {
            handleSend(text);
          }}
        />
      ) : (
        <MessageList messages={messages} />
      )}

      {pendingConfirm && (
        <div className="px-4">
          <ConfirmDialog
            command={pendingConfirm.command}
            reason={pendingConfirm.reason}
            onApprove={() => handleConfirm(true)}
            onDeny={() => handleConfirm(false)}
          />
        </div>
      )}

      <ChatInput onSend={handleSend} onSkillSelect={setSelectedSkill} />

      <SkillDialog
        skill={selectedSkill}
        onClose={() => setSelectedSkill(null)}
      />
    </div>
  );
}
