// src/components/projects/NewClientProjectButton.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const COLOURS = [
  { label: 'Blue',   value: '#2563eb' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Green',  value: '#16a34a' },
  { label: 'Red',    value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Teal',   value: '#0d9488' },
]

export default function NewClientProjectButton({
  clientId,
  orgId,
  projectLabel,
}: {
  clientId: string
  orgId: string | null
  projectLabel: { singular: string; plural: string }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [colour, setColour] = useState('#2563eb')
  const [dueDate, setDueDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        colour,
        due_date: dueDate || null,
        client_id: clientId,
        org_id: orgId,
      }),
    })
    const result = await res.json() as { error?: string }
    setLoading(false)
    if (!res.ok) { setError(result.error ?? `Could not create ${projectLabel.singular.toLowerCase()}`); return }
    setName(''); setColour('#2563eb'); setDueDate('')
    setOpen(false)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold"
      >
        {open ? 'Cancel' : `+ New ${projectLabel.singular.toLowerCase()}`}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">{projectLabel.singular} name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Website Redesign"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Due date (optional)</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-500">Colour</label>
            <div className="flex gap-2 flex-wrap">
              {COLOURS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColour(c.value)}
                  title={c.label}
                  style={{ backgroundColor: c.value }}
                  className={`h-7 w-7 rounded-full transition-transform ${colour === c.value ? 'scale-110 ring-2 ring-gray-900 ring-offset-2' : ''}`}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? 'Creating…' : `Create ${projectLabel.singular.toLowerCase()}`}
          </button>
        </form>
      )}
    </div>
  )
}
