import { motion } from 'framer-motion'
import { BriefcaseBusiness, Code2, HeartPulse, ListChecks } from 'lucide-react'
import type { Skill } from '../../lib/skills.js'
import { ChatInput } from './ChatInput.js'

interface Props {
  onSelectExample: (text: string) => void
  onSend: (text: string) => void
  onSkillSelect: (skill: Skill) => void
}

const examples = [
  {
    title: 'Build a business',
    prompt:
      'Build a 2026 founder operating system with lender-ready financials and B Corp analysis',
    icon: BriefcaseBusiness,
  },
  {
    title: 'Create a prototype',
    prompt: 'Create an interactive market-map filtering site for the YC W26 batch',
    icon: Code2,
  },
  {
    title: 'Organize my life',
    prompt: 'Build a weekly operating plan that balances work, health, and admin',
    icon: ListChecks,
  },
  {
    title: 'Plan recovery',
    prompt:
      'Create an evidence-based rehab planner for ACL, stroke, rotator cuff, and back injuries',
    icon: HeartPulse,
  },
]

export function EmptyState({ onSelectExample, onSend, onSkillSelect }: Props) {
  return (
    <div className="empty-state">
      <motion.div
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="empty-state__inner"
      >
        <div className="empty-state__status">
          <span className="empty-state__statusDot" />
          <span>Connected to computer</span>
        </div>

        <h2 className="empty-state__title">What can I do for you?</h2>

        <div className="empty-state__composer">
          <ChatInput onSend={onSend} onSkillSelect={onSkillSelect} variant="hero" />
        </div>

        <div className="empty-state__chips">
          {examples.map((example) => (
            <button
              type="button"
              key={example.title}
              onClick={() => onSelectExample(example.prompt)}
              className="empty-chip"
            >
              <example.icon className="empty-chip__icon" />
              <span className="empty-chip__label">{example.title}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
