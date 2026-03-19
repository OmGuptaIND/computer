import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, SquarePen, MessageSquareText, Search, LibraryBig, Monitor, SlidersHorizontal, LogOut, ChevronRight,
} from "lucide-react";
import { useStore, useConnectionStatus } from "../lib/store.js";
import { SearchInput } from "./ui/SearchInput.js";
import { SkillsPanel } from "./skills/SkillsPanel.js";

interface Props {
  onDisconnect: () => void;
}

export function Sidebar({ onDisconnect }: Props) {
  useConnectionStatus();
  const sidebarTab = useStore((s) => s.sidebarTab);
  const setSidebarTab = useStore((s) => s.setSidebarTab);
  const conversations = useStore((s) => s.conversations);
  const activeId = useStore((s) => s.activeConversationId);
  const switchConversation = useStore((s) => s.switchConversation);
  const newConversation = useStore((s) => s.newConversation);
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  return (
    <aside className="sidebar" data-tauri-drag-region>
      <div className="sidebar__top" data-tauri-drag-region>
        <div className="sidebar__brandRow">
          <div className="sidebar__brand">
            <Sparkles className="sidebar__brandIcon" />
            <span className="sidebar__brandText">computer</span>
          </div>
          <button className="sidebar__brandAction" aria-label="Sidebar options">
            <LibraryBig className="sidebar__brandActionIcon" />
          </button>
        </div>

        <button
          onClick={() => newConversation()}
          className="sidebar__newTask"
        >
          <SquarePen className="sidebar__newTaskIcon" />
          <span>New task</span>
        </button>

        <div className="sidebar__tabs">
          <SidebarTabButton
            active={sidebarTab === "history"}
            onClick={() => setSidebarTab("history")}
            icon={<MessageSquareText className="sidebar__tabIcon" />}
            label="All tasks"
          />
          <SidebarTabButton
            active={sidebarTab === "skills"}
            onClick={() => setSidebarTab("skills")}
            icon={<Sparkles className="sidebar__tabIcon" />}
            label="Skills"
          />
          <SidebarTabButton
            active={false}
            onClick={() => {}}
            icon={<Monitor className="sidebar__tabIcon" />}
            label="Terminal"
            muted
          />
        </div>
      </div>

      <div className="sidebar__sectionHeader">
        <p className="sidebar__sectionTitle">{sidebarTab === "history" ? "All tasks" : "Library"}</p>
        <button className="sidebar__sectionAction" aria-label="Filter">
          <SlidersHorizontal className="sidebar__sectionActionIcon" />
        </button>
      </div>

      <div className="sidebar__body">
        <AnimatePresence mode="wait">
          {sidebarTab === "history" ? (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="sidebar__panel"
            >
              <div className="sidebar__searchWrap">
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search"
                />
              </div>
              <div className="sidebar__conversationList">
                {filteredConversations.length === 0 && (
                  <div className="sidebar__emptyState">
                    <MessageSquareText className="sidebar__emptyStateIcon" />
                    <p className="sidebar__emptyStateTitle">
                      {conversations.length === 0 ? "No conversations yet" : "No matches"}
                    </p>
                    <p className="sidebar__emptyStateCopy">
                      {conversations.length === 0
                        ? "Create a task to start building history."
                        : "Try a different word or clear the filter."}
                    </p>
                  </div>
                )}

                {filteredConversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => switchConversation(conv.id)}
                    className={conv.id === activeId
                      ? "conversation-item conversation-item--active"
                      : "conversation-item"}
                  >
                    <MessageSquareText className="conversation-item__iconGlyph" />
                    <div className="conversation-item__content">
                      <span className="conversation-item__title">{conv.title}</span>
                      <span className="conversation-item__time">{formatTime(conv.updatedAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="skills"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="sidebar__panel sidebar__panel--skills"
            >
              <SkillsPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="sidebar__footer">
        <div className="sidebar__footerRow">
          <button className="sidebar__footerIconButton" aria-label="Search">
            <Search className="sidebar__footerIcon" />
          </button>
          <button className="sidebar__footerIconButton" aria-label="Library">
            <LibraryBig className="sidebar__footerIcon" />
          </button>
          <button
            onClick={onDisconnect}
            className="sidebar__footerIconButton"
            aria-label="Disconnect"
          >
            <LogOut className="sidebar__footerIcon" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarTabButton({
  active,
  onClick,
  icon,
  label,
  muted = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "sidebar-tab sidebar-tab--active"
          : muted
            ? "sidebar-tab sidebar-tab--muted"
            : "sidebar-tab"
      }
    >
      <span className="sidebar-tab__iconWrap">{icon}</span>
      <span className="sidebar-tab__label">{label}</span>
      {!muted && <ChevronRight className="sidebar-tab__chevron" />}
    </button>
  );
}

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
