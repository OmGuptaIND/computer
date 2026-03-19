import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { type ProviderInfo, useStore } from '../../lib/store.js'

export function ModelSelector() {
  const currentProvider = useStore((s) => s.currentProvider)
  const currentModel = useStore((s) => s.currentModel)
  const providers = useStore((s) => s.providers)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = (provider: string, model: string) => {
    useStore
      .getState()
      .setCurrentSession(useStore.getState().currentSessionId || '', provider, model)
    setOpen(false)
  }

  // Short model display name
  const displayModel = currentModel.split('/').pop() || currentModel

  return (
    <div className="model-selector" ref={ref}>
      <button type="button" className="model-selector__trigger" onClick={() => setOpen(!open)}>
        <span className="model-selector__label">{displayModel}</span>
        <ChevronDown className="model-selector__chevron" />
      </button>

      {open && (
        <div className="model-selector__dropdown">
          {providers
            .filter((p: ProviderInfo) => p.hasApiKey)
            .map((provider: ProviderInfo) => (
              <div key={provider.name} className="model-selector__group">
                <div className="model-selector__group-label">{provider.name}</div>
                {provider.models.map((model: string) => (
                  <button
                    type="button"
                    key={`${provider.name}/${model}`}
                    className={`model-selector__option ${
                      currentProvider === provider.name && currentModel === model
                        ? 'model-selector__option--active'
                        : ''
                    }`}
                    onClick={() => handleSelect(provider.name, model)}
                  >
                    <span>{model}</span>
                    {currentProvider === provider.name && currentModel === model && (
                      <Check className="model-selector__check" />
                    )}
                  </button>
                ))}
              </div>
            ))}
          {providers.filter((p: ProviderInfo) => p.hasApiKey).length === 0 && (
            <div className="model-selector__empty">
              No providers configured. Add API keys in settings.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
