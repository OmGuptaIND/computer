import { motion } from 'framer-motion'
import { BriefcaseBusiness, Code2, ListChecks, Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { Skill } from '../../lib/skills.js'
import { AntonLogo } from '../AntonLogo.js'
import { ChatInput } from './ChatInput.js'

interface Props {
  onSelectExample: (text: string) => void
  onSend: (text: string) => void
  onSkillSelect: (skill: Skill) => void
}

type Category = 'for-you' | 'business' | 'prototype' | 'organize'

const categories: { id: Category; label: string; Icon?: typeof Sparkles }[] = [
  { id: 'for-you', label: 'For you', Icon: Sparkles },
  { id: 'business', label: 'Build a business', Icon: BriefcaseBusiness },
  { id: 'prototype', label: 'Create a prototype', Icon: Code2 },
  { id: 'organize', label: 'Organize my life', Icon: ListChecks },
]

const suggestions: Record<Category, string[]> = {
  'for-you': [
    'Build a 2026 founder operating system with lender-ready financials and B Corp analysis',
    'Track GitHub, Coolify, and Vercel deployment failures daily',
    'Analyze YC W26 batch with interactive market-map filtering site',
    'Create an evidence-based rehab planner for ACL, stroke, rotator cuff, and back injuries',
    'Analyze March 2026 K-drama slate with breakout predictions and mood-based recommendation quiz',
  ],
  business: [
    'Build a 2026 founder operating system with lender-ready financials and B Corp analysis',
    'Create a competitive analysis dashboard for my market',
    'Build a financial model with revenue projections and burn rate tracking',
  ],
  prototype: [
    'Create an interactive market-map filtering site for the YC W26 batch',
    'Build a real-time dashboard with WebSocket data streaming',
    'Create a drag-and-drop kanban board with persistence',
  ],
  organize: [
    'Build a weekly operating plan that balances work, health, and admin',
    'Set up automated daily reports for my projects',
    'Create a personal CRM to track relationships and follow-ups',
  ],
}

export function EmptyState({ onSelectExample, onSend, onSkillSelect }: Props) {
  const [activeCategory, setActiveCategory] = useState<Category>('for-you')



  return (
    <div className="empty-state">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="empty-state__inner"
      >
        <h1 className="empty-state__heading">
          <AntonLogo size={28} className="empty-state__heading-logo" />
          <span>anton.computer</span>
        </h1>

        <div className="empty-state__input-wrap">
          <ChatInput onSend={onSend} onSkillSelect={onSkillSelect} variant="hero" />
        </div>

        <div className="empty-state__tabs">
          {categories.map((cat) => (
            <button
              type="button"
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`empty-state__tab${activeCategory === cat.id ? ' empty-state__tab--active' : ''}`}
            >
              {cat.Icon && <cat.Icon className="empty-state__tab-icon" />}
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        <div className="empty-state__suggestions">
          {suggestions[activeCategory].map((text) => (
            <button
              type="button"
              key={text}
              onClick={() => onSelectExample(text)}
              className="empty-state__suggestion"
            >
              {text}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
