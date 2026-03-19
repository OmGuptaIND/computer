import { ArrowUp, Loader2, Mic, Plus, Sparkles } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Skill } from '../../lib/skills.js'
import { useAgentStatus } from '../../lib/store.js'
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
    <div
      className={isHero ? 'chat-composer-shell chat-composer-shell--hero' : 'chat-composer-shell'}
    >
      <div className="chat-composer-frame">
        <div className="chat-composer__anchor">
          <SlashCommandMenu
            filter={slashFilter}
            onSelect={handleSkillSelect}
            onClose={() => setShowSlashMenu(false)}
            visible={showSlashMenu}
          />

          <div className={isHero ? 'chat-composer chat-composer--hero' : 'chat-composer'}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="What should we work on next?"
              rows={1}
              className={
                isHero ? 'chat-composer__input chat-composer__input--hero' : 'chat-composer__input'
              }
              style={{ minHeight: isHero ? 84 : 88, maxHeight: 220 }}
            />

            <div className="chat-composer__footer">
              <div className="chat-composer__controls">
                <button type="button" className="chat-composer__iconButton" aria-label="Add">
                  <Plus className="chat-composer__icon" />
                </button>
                <div className="chat-composer__model">
                  <Sparkles className="chat-composer__modelIcon" />
                  Claude Sonnet 4.6
                </div>
              </div>

              <div className="chat-composer__actions">
                <button type="button" className="chat-composer__micButton" aria-label="Voice input">
                  <Mic className="chat-composer__icon" />
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || agentStatus === 'working'}
                  className="chat-composer__sendButton"
                  aria-label="Send"
                >
                  {agentStatus === 'working' ? (
                    <Loader2 className="chat-composer__icon chat-composer__icon--spinning" />
                  ) : (
                    <ArrowUp className="chat-composer__icon" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          className={
            isHero ? 'chat-composer__meta chat-composer__meta--hidden' : 'chat-composer__meta'
          }
        >
          <span className="chat-composer__metaItem">
            {agentStatus === 'working'
              ? 'Assistant is working...'
              : agentStatus === 'error'
                ? 'Something needs attention'
                : 'Ready for your next task'}
          </span>
          <span className="chat-composer__metaItem">
            Press Enter to send, Shift+Enter for a new line, or type / for skills.
          </span>
        </div>
      </div>
    </div>
  )
}
