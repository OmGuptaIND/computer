import { Search, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchInput({ value, onChange, placeholder = 'Search...' }: Props) {
  return (
    <div className="search-input">
      <Search className="search-input__icon" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="search-input__field"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} className="search-input__clear">
          <X className="search-input__clearIcon" />
        </button>
      )}
    </div>
  )
}
