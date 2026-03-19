import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rocket, Activity, Globe, Box, FileText, Shield, Database, Clock,
} from "lucide-react";
import { getSkills, type Skill } from "../../lib/skills.js";

const iconMap: Record<string, React.ElementType> = {
  rocket: Rocket,
  activity: Activity,
  globe: Globe,
  box: Box,
  "file-text": FileText,
  shield: Shield,
  database: Database,
  clock: Clock,
};

interface Props {
  filter: string;
  onSelect: (skill: Skill) => void;
  onClose: () => void;
  visible: boolean;
}

export function SlashCommandMenu({ filter, onSelect, onClose, visible }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const skills = getSkills().filter(
    (s) =>
      s.command.toLowerCase().includes(filter.toLowerCase()) ||
      s.name.toLowerCase().includes(filter.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visible) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, skills.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && skills[selectedIndex]) {
        e.preventDefault();
        onSelect(skills[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, skills, selectedIndex, onSelect, onClose]);

  if (!visible || skills.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.1 }}
      className="absolute bottom-full left-0 right-0 mb-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto"
    >
      <div className="px-3 py-2 border-b border-zinc-800">
        <span className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">Skills</span>
      </div>
      {skills.map((skill, i) => {
        const Icon = iconMap[skill.icon] || Activity;
        return (
          <button
            key={skill.id}
            onClick={() => onSelect(skill)}
            className={`flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors ${
              i === selectedIndex
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0 text-zinc-500" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{skill.name}</span>
                <span className="text-[11px] text-zinc-600 font-mono">{skill.command}</span>
              </div>
              <p className="text-[11px] text-zinc-500 truncate">{skill.description}</p>
            </div>
          </button>
        );
      })}
    </motion.div>
  );
}
