'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Client = { id: string; name: string }
type LineItem = { key: string; description: string; quantity: number; unit_price: number }

export default function EditInvoiceForm({
  invoiceId,
  isQuote,
  clients,
  initialClientId,
  initialItems,
  initialDueDate,
  initialIssueDate,
  initialNotes,
  initialCurrency,
  isEmployee,
}: {
  invoiceId: string
  isQuote: boolean
  clients: Client[]
  initialClientId: string | null
  initialItems: { description: string; quantity: number; unit_price: number }[]
  initialDueDate: string | null
  initialIssueDate: string
  initialNotes: string | null
  initialCurrency: string
  isEmployee: boolean
}) {
  const router = useRouter()
  const [clientId, setClientId] = useState(initialClientId ?? '')
  const [issueDate, setIssueDate] = useState(initialIssueDate)
  const [dueDate, setDueDate] = useState(initialDueDate ?? '')
  const [currency, setCurrency] = useState(initialCurrency)
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [lineItems, setLineItems] = useState<LineItem[]>(
    initialItems.map((i, idx) => ({ key: String(idx), ...i }))
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addItem() {
    setLineItems(prev => [...prev, { key: Math.random().toString(36).slice(2), description: '', quantity: 1, unit_price: 0 }])
  }
  function removeItem(key: string) {
    setLineItems(prev => prev.filter(i => i.key !== key))
  }
  function updateItem(key: string, field: keyof Omit<LineItem, 'key'>, value: string | number) {
    setLineItems(prev => prev.map(i => i.key === key ? { ...i, [field]: value } : i))
  }

  const subtotal = lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)

  async function handleSave() {
    if (!lineItems.length) { setError('At least one line item required.'); return }
    setSubmitting(true)
    setError(null)

    const res = await fetch(`/api/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: clientId || null,
        issueDate,
        dueDate: dueDate || null,
        currency,
        notes: notes || null,
        items: lineItems.map(i => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price })),
      }),
    })

    const result = await res.json()
    if (!res.ok) { setError(result.error); setSubmitting(false); return }
    router.push(`/dashboard/invoices/${invoiceId}`)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {isEmployee && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          Your changes will be submitted for manager approval before this {isQuote ? 'quote' : 'invoice'} is active again.
        </div>
      )}

      {/* Client + dates */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Details</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-500">
              Client{isQuote && <span className="ml-1 font-normal text-gray-400">(optional)</span>}
            </label>
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <option value="">— No client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Issue date</label>
            <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">
              {isQuote ? 'Valid until (optional)' : 'Due date (optional)'}
            </label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Currency</label>
            <input type="text" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Line items</h2>
        {lineItems.length > 0 && (
          <div className="space-y-2">
            <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-bold uppercase tracking-wide text-gray-400 px-1">
              <div className="col-span-6">Description</div>
              <div className="col-span-2 text-right">Qty</div>
              <div className="col-span-2 text-right">Unit price</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1" />
            </div>
            {lineItems.map(item => (
              <div key={item.key} className="grid grid-cols-12 gap-2 items-center">
                <input value={item.description} onChange={e => updateItem(item.key, 'description', e.target.value)}
                  placeholder="Description"
                  className="col-span-12 sm:col-span-6 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
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
        <button onClick={addItem} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 shadow-sm transition-all hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 active:scale-[0.965] dark:border-slate-700 dark:text-slate-300 dark:hover:border-cyan-400/40 dark:hover:bg-cyan-500/10">+ Add line item</button>
        <div className="border-t border-gray-100 pt-4 text-right">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-bold">Subtotal</p>
          <p className="text-3xl font-black text-gray-900">{currency} {subtotal.toFixed(2)}</p>
        </div>
      </div>

      {/* Notes + save */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-500">Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Payment terms, scope notes…"
            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
        <button onClick={handleSave} disabled={submitting}
          className="w-full rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 py-3 text-sm font-bold text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:opacity-50 disabled:pointer-events-none">
          {submitting ? 'Saving…' : isEmployee ? 'Save & submit for approval' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
