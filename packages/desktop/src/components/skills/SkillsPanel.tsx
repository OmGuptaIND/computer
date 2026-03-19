import { Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { type Skill, getSkills } from '../../lib/skills.js'
import { SearchInput } from '../ui/SearchInput.js'
import { SkillCard } from './SkillCard.js'
import { SkillDialog } from './SkillDialog.js'

export function SkillsPanel() {
  const [search, setSearch] = useState('')
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)

  const skills = useMemo(() => {
    const all = getSkills()
    if (!search) return all
    const q = search.toLowerCase()
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.command.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    )
  }, [search])

  const categories = useMemo(() => {
    const cats = new Map<string, Skill[]>()
    for (const skill of skills) {
      const list = cats.get(skill.category) || []
      list.push(skill)
      cats.set(skill.category, list)
    }
    return cats
  }, [skills])

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-1 pb-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Find a skill" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {skills.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/6 bg-white/[0.02] py-14 text-center">
            <Zap className="mb-4 h-9 w-9 text-zinc-700" />
            <p className="text-sm font-medium text-zinc-200">No matching skills</p>
            <p className="mt-1 text-xs text-zinc-500">
              Try a command name, category, or capability.
            </p>
          </div>
        )}

        {Array.from(categories.entries()).map(([cat, catSkills]) => (
          <div key={cat} className="mb-5">
            <div className="mb-2 flex items-center gap-3 px-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                {cat}
              </p>
              <div className="h-px flex-1 bg-white/6" />
            </div>
            <div className="space-y-2">
              {catSkills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} onClick={() => setSelectedSkill(skill)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <SkillDialog skill={selectedSkill} onClose={() => setSelectedSkill(null)} />
    </div>
  )
}
