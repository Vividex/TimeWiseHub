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
type Site = { id: string; address: string }

export default function ProjectForm({
  userId,
  orgId,
  activeProjectCount,
  activeProjectLimit,
  supportsMultiSite,
}: {
  userId: string
  orgId: string | null
  activeProjectCount: number
  activeProjectLimit: number | null
  supportsMultiSite: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [colour, setColour] = useState('#2563eb')
  const [dueDate, setDueDate] = useState('')
  const [clientId, setClientId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [budgetHours, setBudgetHours] = useState('')
  const [budgetDollars, setBudgetDollars] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [scope, setScope] = useState<'personal' | 'org'>('org')
  const atProjectLimit = activeProjectLimit !== null && activeProjectCount >= activeProjectLimit
  const blocked = atProjectLimit

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    const q = orgId
      ? supabase.from('clients').select('id, name, default_rate, currency').or(`owner_id.eq.${userId},org_id.eq.${orgId}`).eq('archived', false).order('name')
      : supabase.from('clients').select('id, name, default_rate, currency').eq('owner_id', userId).eq('archived', false).order('name')
    q.then(({ data }) => setClients(data ?? []))
  }, [open, orgId, userId])

  useEffect(() => {
    setSiteId('')
    if (!open || !clientId || !supportsMultiSite) { setSites([]); return }
    const supabase = createClient()
    supabase.from('client_sites').select('id, address').eq('client_id', clientId).eq('is_archived', false).order('address')
      .then(({ data }) => setSites(data ?? []))
  }, [open, clientId, supportsMultiSite])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (blocked) {
      setError(`Free plan is limited to ${activeProjectLimit} active projects.`)
      setLoading(false)
      return
    }

    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: orgId && scope === 'org' ? orgId : null,
      name,
      description: description || null,
      colour,
      due_date: dueDate || null,
      client_id: clientId || null,
      site_id: siteId || null,
      budget_hours: budgetHours ? Number(budgetHours) : null,
      budget_dollars: budgetDollars ? Number(budgetDollars) : null,
      }),
    })
    const result = await res.json() as { error?: string }

    if (!res.ok) { setError(result.error ?? 'Could not create project'); setLoading(false); return }

    setName(''); setDescription(''); setDueDate('')
    setClientId(''); setSiteId(''); setBudgetHours(''); setBudgetDollars('')
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <button onClick={() => setOpen(o => !o)} disabled={blocked} className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
        {open ? 'Cancel' : '+ New project'}
      </button>
      {atProjectLimit && (
        <p className="mt-3 text-sm font-semibold text-amber-600">
          Free plan limit reached: {activeProjectLimit} active projects. Archive a project or upgrade to Pro.
        </p>
      )}

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {orgId && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Scope</label>
              <div className="flex gap-2">
                {(['org', 'personal'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      scope === s
                        ? 'bg-cyan-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {s === 'org' ? 'Organisation' : 'Personal'}
                  </button>
                ))}
              </div>
            </div>
          )}

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

          {supportsMultiSite && sites.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Site (optional)</label>
              <select value={siteId} onChange={e => setSiteId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <option value="">— No site —</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.address}</option>)}
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
            className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {loading ? 'Creating…' : 'Create project'}
          </button>
        </form>
      )}
    </div>
  )
}
