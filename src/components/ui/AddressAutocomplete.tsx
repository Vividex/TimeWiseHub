'use client'

import { useEffect, useRef, useState } from 'react'

type Suggestion = { id: string; address: string }

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  required,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  className?: string
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const sessionToken = useRef(crypto.randomUUID())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleChange(text: string) {
    onChange(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (text.trim().length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/address-lookup?q=${encodeURIComponent(text)}&session=${sessionToken.current}`)
      if (!res.ok) { setSuggestions([]); return }
      const data = await res.json().catch(() => null) as { suggestions?: Suggestion[] } | null
      setSuggestions(data?.suggestions ?? [])
      setOpen(true)
    }, 300)
  }

  function selectSuggestion(address: string) {
    onChange(address)
    setSuggestions([])
    setOpen(false)
    sessionToken.current = crypto.randomUUID()
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        placeholder={placeholder}
        required={required}
        className={className}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {suggestions.map(s => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => selectSuggestion(s.address)}
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-cyan-50 dark:text-slate-200 dark:hover:bg-cyan-500/10"
              >
                {s.address}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
