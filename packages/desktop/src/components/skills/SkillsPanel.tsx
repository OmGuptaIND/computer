import React, { useState, useMemo } from "react";
import { Zap } from "lucide-react";
import { SearchInput } from "../ui/SearchInput.js";
import { SkillCard } from "./SkillCard.js";
import { SkillDialog } from "./SkillDialog.js";
import { getSkills, type Skill } from "../../lib/skills.js";

export function SkillsPanel() {
  const [search, setSearch] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  const skills = useMemo(() => {
    const all = getSkills();
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.command.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [search]);

  const categories = useMemo(() => {
    const cats = new Map<string, Skill[]>();
    for (const skill of skills) {
      const list = cats.get(skill.category) || [];
      list.push(skill);
      cats.set(skill.category, list);
    }
    return cats;
  }, [skills]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-1 pb-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search skills..." />
      </div>

      <div className="flex-1 overflow-y-auto px-1">
        {skills.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="w-8 h-8 text-zinc-700 mb-3" />
            <p className="text-xs text-zinc-500">No skills found</p>
          </div>
        )}

        {Array.from(categories.entries()).map(([cat, catSkills]) => (
          <div key={cat} className="mb-3">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-3 mb-1">
              {cat}
            </p>
            {catSkills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                onClick={() => setSelectedSkill(skill)}
              />
            ))}
          </div>
        ))}
      </div>

      <SkillDialog
        skill={selectedSkill}
        onClose={() => setSelectedSkill(null)}
      />
    </div>
  );
}
