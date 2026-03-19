import { Activity, Box, Clock, Database, FileText, Globe, Rocket, Shield } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { type Skill, executeSkill } from '../../lib/skills.js'
import { Modal } from '../ui/Modal.js'

const iconMap: Record<string, React.ElementType> = {
  rocket: Rocket,
  activity: Activity,
  globe: Globe,
  box: Box,
  'file-text': FileText,
  shield: Shield,
  database: Database,
  clock: Clock,
}

interface Props {
  skill: Skill | null
  onClose: () => void
}

export function SkillDialog({ skill, onClose }: Props) {
  const [params, setParams] = useState<Record<string, string>>({})

  if (!skill) return null

  const Icon = iconMap[skill.icon] || Activity
  const hasParams = skill.parameters && skill.parameters.length > 0

  const handleRun = () => {
    executeSkill(skill, params)
    setParams({})
    onClose()
  }

  const canRun = !skill.parameters?.some((p) => p.required && !params[p.name]?.trim())

  return (
    <Modal open={!!skill} onClose={onClose} title={skill.name}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          <Icon className="w-5 h-5 text-zinc-400" />
        </div>
        <div>
          <p className="text-sm text-zinc-300 leading-relaxed">{skill.description}</p>
          <p className="text-[11px] text-zinc-500 font-mono mt-1">{skill.command}</p>
        </div>
      </div>

      {hasParams && (
        <div className="space-y-3 mb-5">
          {skill.parameters!.map((param) => (
            <div key={param.name}>
              <span className="block text-xs text-zinc-400 mb-1 font-medium">
                {param.label}
                {param.required && <span className="text-red-400 ml-0.5">*</span>}
              </span>
              {param.type === 'select' ? (
                <select
                  value={params[param.name] || ''}
                  onChange={(e) => setParams((p) => ({ ...p, [param.name]: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-200 outline-none focus:border-zinc-600 transition-colors"
                >
                  <option value="">Select...</option>
                  {param.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={params[param.name] || ''}
                  onChange={(e) => setParams((p) => ({ ...p, [param.name]: e.target.value }))}
                  placeholder={param.placeholder}
                  className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-200 font-mono placeholder-zinc-600 outline-none focus:border-zinc-600 transition-colors"
                />
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleRun}
        disabled={!canRun}
        className="w-full py-2.5 bg-zinc-100 rounded-xl text-sm font-semibold text-zinc-900 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors"
      >
        Run skill
      </button>
    </Modal>
  )
}
