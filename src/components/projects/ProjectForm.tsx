'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

const COLOURS = [
  { label: 'Blue',   value: '#2563eb' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Green',  value: '#16a34a' },
  { label: 'Red',    value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Pink',   value: '#db2777' },
  { label: 'Teal',   value: '#0d9488' },
  { label: 'Gray',   value: '#6b7280' },
]

type Client = { id: string; name: string; default_rate: number | null; currency: string }

export default function ProjectForm({ userId, orgId }: { userId: string; orgId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [colour, setColour] = useState('#2563eb')
  const [dueDate, setDueDate] = useState('')
  const [clientId, setClientId] = useState('')
  const [budgetHours, setBudgetHours] = useState('')
  const [budgetDollars, setBudgetDollars] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    const q = orgId
      ? supabase.from('clients').select('id, name, default_rate, currency').or(`owner_id.eq.${userId},org_id.eq.${orgId}`).eq('archived', false).order('name')
      : supabase.from('clients').select('id, name, default_rate, currency').eq('owner_id', userId).eq('archived', false).order('name')
    q.then(({ data }) => setClients(data ?? []))
  }, [open, orgId, userId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.from('projects').insert({
      owner_id: userId,
      org_id: orgId,
      name,
      description: description || null,
      colour,
      due_date: dueDate || null,
      client_id: clientId || null,
      budget_hours: budgetHours ? Number(budgetHours) : null,
      budget_dollars: budgetDollars ? Number(budgetDollars) : null,
    })

    if (error) { setError(error.message); setLoading(false); return }

    setName(''); setDescription(''); setDueDate('')
    setClientId(''); setBudgetHours(''); setBudgetDollars('')
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <button onClick={() => setOpen(o => !o)} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600">
        {open ? 'Cancel' : '+ New project'}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Project name</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Website Redesign"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Description (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder="What is this project about?"
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          {clients.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Client (optional)</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <option value="">— No client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.default_rate ? ` (${c.currency} ${Number(c.default_rate).toFixed(0)}/hr)` : ''}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Budget — hours</label>
              <input type="number" min="0" step="0.5" value={budgetHours} onChange={e => setBudgetHours(e.target.value)}
                placeholder="e.g. 40"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Budget — dollars</label>
              <input type="number" min="0" step="0.01" value={budgetDollars} onChange={e => setBudgetDollars(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Due date (optional)</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-500">Colour</label>
              <div className="flex gap-2 flex-wrap">
                {COLOURS.map(c => (
                  <button key={c.value} type="button" onClick={() => setColour(c.value)}
                    title={c.label}
                    style={{ backgroundColor: c.value }}
                    className={`h-7 w-7 rounded-full transition-transform ${colour === c.value ? 'scale-110 ring-2 ring-gray-900 ring-offset-2' : ''}`} />
                ))}
              </div>
            </div>
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button type="submit" disabled={loading}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {loading ? 'Creating…' : 'Create project'}
          </button>
        </form>
      )}
    </div>
  )
}
