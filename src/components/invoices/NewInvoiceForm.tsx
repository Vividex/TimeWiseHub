'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Client = { id: string; name: string; default_rate: number | null; currency: string }
type LineItem = { key: string; description: string; quantity: number; unit_price: number; entry_ids: string[] }

function today() { return new Date().toISOString().slice(0, 10) }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

export default function NewInvoiceForm({
  orgId,
  userId,
  initialClientId,
  isQuote = false,
  clientLabel,
}: {
  orgId: string | null
  userId: string
  initialClientId?: string
  isQuote?: boolean
  clientLabel: { singular: string; plural: string }
}) {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState('')
  const [dateFrom, setDateFrom] = useState(monthStart)
  const [dateTo, setDateTo] = useState(today)
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [currency, setCurrency] = useState('AUD')
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const q = orgId
      ? supabase.from('clients').select('id, name, default_rate, currency').or(`owner_id.eq.${userId},org_id.eq.${orgId}`).eq('archived', false).order('name')
      : supabase.from('clients').select('id, name, default_rate, currency').eq('owner_id', userId).eq('archived', false).order('name')
    q.then(({ data }) => {
      setClients(data ?? [])
      // For quotes, don't auto-select a client — they can be client-free
      if (!isQuote) {
        const selected = data?.find(c => c.id === initialClientId) ?? data?.[0]
        if (selected) { setClientId(selected.id); setCurrency(selected.currency) }
      } else if (initialClientId) {
        const selected = data?.find(c => c.id === initialClientId)
        if (selected) { setClientId(selected.id); setCurrency(selected.currency) }
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, userId, initialClientId, isQuote])

  async function loadEntries() {
    if (!clientId) return
    setLoadingEntries(true)
    setError(null)

    // Get client's projects
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name')
      .eq('client_id', clientId)

    const projectIds = (projects ?? []).map(p => p.id)
    const projectMap = Object.fromEntries((projects ?? []).map(p => [p.id, p.name]))

    if (!projectIds.length) {
      setError('This client has no projects. Assign projects to this client first.')
      setLoadingEntries(false)
      return
    }

    // Get tasks in those projects
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, project_id')
      .in('project_id', projectIds)

    const taskIds = (tasks ?? []).map(t => t.id)
    const taskProjectMap = Object.fromEntries((tasks ?? []).map(t => [t.id, t.project_id]))

    // Get uninvoiced billable entries — matched via task_id OR directly via project_id
    const baseQuery = supabase
      .from('time_entries')
      .select('id, started_at, duration_seconds, billable_rate, description, task_id, project_id')
      .eq('billable', true)
      .is('invoice_id', null)
      .not('ended_at', 'is', null)
      .gte('started_at', dateFrom + 'T00:00:00')
      .lte('started_at', dateTo + 'T23:59:59')

    const orParts: string[] = []
    if (taskIds.length)   orParts.push(`task_id.in.(${taskIds.join(',')})`)
    if (projectIds.length) orParts.push(`project_id.in.(${projectIds.join(',')})`)

    const { data: entries } = orParts.length
      ? await baseQuery.or(orParts.join(','))
      : { data: [] }

    const client = clients.find(c => c.id === clientId)
    const defaultRate = client?.default_rate ?? 0

    // Group by project
    const byProject: Record<string, { name: string; hours: number; rate: number; ids: string[] }> = {}
    ;(entries ?? []).forEach(e => {
      const projectId = e.task_id ? taskProjectMap[e.task_id] : (e.project_id ?? null)
      if (!projectId || !projectMap[projectId]) return
      const key = projectId
      if (!byProject[key]) byProject[key] = { name: projectMap[projectId] ?? 'Unknown project', hours: 0, rate: e.billable_rate ?? defaultRate, ids: [] }
      byProject[key].hours += (e.duration_seconds ?? 0) / 3600
      byProject[key].ids.push(e.id)
    })

    const items: LineItem[] = Object.entries(byProject).map(([, v]) => ({
      key: Math.random().toString(36).slice(2),
      description: v.name,
      quantity: Math.round(v.hours * 100) / 100,
      unit_price: v.rate,
      entry_ids: v.ids,
    }))

    if (!items.length) {
      setError('No uninvoiced billable time entries found for this client in the selected period.')
    }

    setLineItems(items)
    setLoadingEntries(false)
  }

  function addManualItem() {
    setLineItems(prev => [...prev, { key: Math.random().toString(36).slice(2), description: '', quantity: 1, unit_price: 0, entry_ids: [] }])
  }

  function removeItem(key: string) {
    setLineItems(prev => prev.filter(i => i.key !== key))
  }

  function updateItem(key: string, field: keyof LineItem, value: string | number) {
    setLineItems(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i))
  }

  const subtotal = lineItems.reduce((s, i) => s + (i.quantity * i.unit_price), 0)
  const allEntryIds = lineItems.flatMap(i => i.entry_ids)

  async function handleSubmit() {
    if (!lineItems.length) { setError('Add at least one line item.'); return }
    setSubmitting(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()

    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: clientId || null,
        orgId,
        userId: user?.id,
        currency,
        issueDate: today(),
        dueDate: dueDate || null,
        notes: notes || null,
        items: lineItems.map(i => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price })),
        invoicedEntryIds: allEntryIds,
        isQuote,
      }),
    })

    const result = await res.json()
    if (!res.ok) { setError(result.error); setSubmitting(false); return }
    router.push(`/dashboard/invoices/${result.id}`)
  }

  return (
    <div className="space-y-6">
      {/* Client + date range */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">{clientLabel.singular} &amp; period</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-semibold text-gray-500">
              {clientLabel.singular}{isQuote && <span className="ml-1 font-normal text-gray-400">(optional)</span>}
            </label>
            <select value={clientId} onChange={e => { setClientId(e.target.value); const c = clients.find(x => x.id === e.target.value); if (c) setCurrency(c.currency) }}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="">— Select {clientLabel.singular.toLowerCase()} —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
        </div>

        <button onClick={loadEntries} disabled={!clientId || loadingEntries}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-700 disabled:opacity-50">
          {loadingEntries ? 'Loading…' : 'Load billable entries'}
        </button>
      </div>

      {/* Line items */}
      {(lineItems.length > 0 || error || isQuote) && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Line items</h2>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          {lineItems.length > 0 && (
            <div className="space-y-2">
              <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-bold uppercase tracking-wide text-gray-400 px-1">
                <div className="col-span-6">Description</div>
                <div className="col-span-2 text-right">Qty / hrs</div>
                <div className="col-span-2 text-right">Unit price</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-1" />
              </div>
              {lineItems.map(item => (
                <div key={item.key} className="grid grid-cols-12 gap-2 items-center">
                  <input value={item.description} onChange={e => updateItem(item.key, 'description', e.target.value)}
                    placeholder="Description" className="col-span-12 sm:col-span-6 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                  <input type="number" min="0" step="0.25" value={item.quantity} onChange={e => updateItem(item.key, 'quantity', Number(e.target.value))}
                    className="col-span-5 sm:col-span-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-right text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                  <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(item.key, 'unit_price', Number(e.target.value))}
                    className="col-span-5 sm:col-span-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-right text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                  <div className="col-span-1 text-right text-sm font-bold text-gray-900 hidden sm:block">
                    {(item.quantity * item.unit_price).toFixed(2)}
                  </div>
                  <button onClick={() => removeItem(item.key)} className="col-span-2 sm:col-span-1 text-xs font-semibold text-red-500 hover:text-red-700 text-right">✕</button>
                </div>
              ))}
            </div>
          )}

          <button onClick={addManualItem} className="text-sm font-semibold text-cyan-600 hover:underline">+ Add line item</button>

          <div className="border-t border-gray-100 pt-4 text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-bold">Subtotal</p>
            <p className="text-3xl font-black text-gray-900">{currency} {subtotal.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Details + submit */}
      {lineItems.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Details</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Due date (optional)</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Currency</label>
              <input type="text" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Payment terms, bank details, thank you note…"
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <button onClick={handleSubmit} disabled={submitting}
            className="w-full rounded-xl bg-cyan-500 py-3 text-sm font-bold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {submitting ? (isQuote ? 'Creating quote…' : 'Creating invoice…') : (isQuote ? 'Create quote' : 'Create invoice')}
          </button>
        </div>
      )}
    </div>
  )
}
