'use client'

import { useState } from 'react'
import type { ProgramCategory } from '@/types/programs'

export default function CategoryForm({
  programId,
  parentId,
  onSaved,
  onClose,
}: {
  programId: string
  parentId: string | null
  onSaved: (cat: ProgramCategory) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name required'); return }
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/programs/${programId}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent_id: parentId }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed'); return }
    onSaved(json)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-1.5">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Category name…"
        className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      <button type="submit" disabled={saving}
        className="rounded-lg bg-gradient-to-b from-cyan-500 to-cyan-600 px-2 py-1 text-xs font-semibold text-white shadow-sm shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 active:scale-[0.95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:opacity-50 disabled:pointer-events-none">
        {saving ? '…' : 'Add'}
      </button>
      <button type="button" onClick={onClose}
        className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:text-gray-900 dark:text-slate-400">
        ✕
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </form>
  )
}
