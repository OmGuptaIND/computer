import { ArrowUp, Mic, Plus, Square } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Skill } from '../../lib/skills.js'
import { useAgentStatus } from '../../lib/store.js'
import { ModelSelector } from './ModelSelector.js'
import { SlashCommandMenu } from './SlashCommandMenu.js'

interface Props {
  onSend: (text: string) => void
  onSkillSelect: (skill: Skill) => void
  variant?: 'docked' | 'hero'
}

export function ChatInput({ onSend, onSkillSelect, variant = 'docked' }: Props) {
  const [input, setInput] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashFilter, setSlashFilter] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const agentStatus = useAgentStatus()
  const isHero = variant === 'hero'

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`
  }, [input])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    if (val.startsWith('/')) {
      setShowSlashMenu(true)
      setSlashFilter(val.slice(1))
    } else {
      setShowSlashMenu(false)
    }
  }

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || agentStatus === 'working') return
    onSend(text)
    setInput('')
    setShowSlashMenu(false)
    textareaRef.current?.focus()
  }, [input, agentStatus, onSend])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSkillSelect = (skill: Skill) => {
    setInput('')
    setShowSlashMenu(false)
    onSkillSelect(skill)
  }

  return (
    <div className={`composer${isHero ? ' composer--hero' : ''}`}>
      <div className="composer__anchor">
        <SlashCommandMenu
          filter={slashFilter}
          onSelect={handleSkillSelect}
          onClose={() => setShowSlashMenu(false)}
          visible={showSlashMenu}
        />

        <div className="composer__box">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={isHero ? 'What should we work on next?' : 'Ask a follow-up'}
            rows={1}
            className="composer__textarea"
          />
          <div className="composer__toolbar">
            <div className="composer__toolbar-left">
              <button type="button" className="composer__btn" aria-label="Attach">
                <Plus />
              </button>
              <ModelSelector />
            </div>
            <div className="composer__toolbar-right">
              {isHero && (
                <button type="button" className="composer__btn" aria-label="Voice input">
                  <Mic />
                </button>
              )}
              {agentStatus === 'working' ? (
                <button
                  type="button"
                  className="composer__btn composer__btn--stop"
                  aria-label="Stop"
                >
                  <Square />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="composer__btn composer__btn--send"
                  aria-label="Send"
                >
                  <ArrowUp />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
