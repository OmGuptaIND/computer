import React from "react";
import {
  Rocket, Activity, Globe, Box, FileText, Shield, Database, Clock,
} from "lucide-react";
import type { Skill } from "../../lib/skills.js";

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
  skill: Skill;
  onClick: () => void;
}

export function SkillCard({ skill, onClick }: Props) {
  const Icon = iconMap[skill.icon] || Activity;

  return (
    <button
      onClick={onClick}
      className="group flex items-start gap-3 w-full p-3 rounded-lg text-left hover:bg-zinc-800/60 transition-colors"
    >
      <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 group-hover:border-zinc-600 transition-colors">
        <Icon className="w-4 h-4 text-zinc-400" />
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="text-xs font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors">
          {skill.name}
        </p>
        <p className="text-[11px] text-zinc-500 truncate mt-0.5">
          {skill.description}
        </p>
      </div>
    </button>
  );
}
