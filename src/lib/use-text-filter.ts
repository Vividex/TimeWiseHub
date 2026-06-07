'use client'

import { useMemo, useState } from 'react'

export function useTextFilter<T>(items: T[], toText: (item: T) => string) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(item => toText(item).toLowerCase().includes(q))
  }, [items, query, toText])
  return { query, setQuery, filtered }
}
