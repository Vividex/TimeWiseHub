'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Category = { id: string; name: string }
type RecurrenceInterval = 'weekly' | 'fortnightly' | 'monthly' | 'annually'

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'CAD', 'SGD']

function calcNextBillingDate(from: string, interval: RecurrenceInterval): string {
  const d = new Date(from)
  switch (interval) {
    case 'weekly':      d.setDate(d.getDate() + 7); break
    case 'fortnightly': d.setDate(d.getDate() + 14); break
    case 'monthly':     d.setMonth(d.getMonth() + 1); break
    case 'annually':    d.setFullYear(d.getFullYear() + 1); break
  }
  return d.toISOString().slice(0, 10)
}

export default function ExpenseForm({
  categories,
  userId,
  orgId,
}: {
  categories: Category[]
  userId: string
  orgId: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('AUD')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [receipt, setReceipt] = useState<File | null>(null)
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceInterval, setRecurrenceInterval] = useState<RecurrenceInterval>('monthly')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    let receiptPath: string | null = null

    if (receipt) {
      const ext = receipt.name.split('.').pop()
      const path = `${userId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('receipts').upload(path, receipt)
      if (uploadError) { setError(uploadError.message); setLoading(false); return }
      receiptPath = path
    }

    const { error } = await supabase.from('expenses').insert({
      user_id: userId,
      org_id: orgId,
      category_id: categoryId || null,
      amount: parseFloat(amount),
      currency,
      description: description || null,
      expense_date: date,
      receipt_path: receiptPath,
      status: 'draft',
      is_recurring: isRecurring,
      recurrence_interval: isRecurring ? recurrenceInterval : null,
      next_billing_date: isRecurring ? calcNextBillingDate(date, recurrenceInterval) : null,
    })

    if (error) { setError(error.message); setLoading(false); return }

    setAmount('')
    setCategoryId('')
    setDescription('')
    setReceipt(null)
    setIsRecurring(false)
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <button onClick={() => setOpen(o => !o)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700">
        {open ? 'Cancel' : '+ Add expense'}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Amount</label>
              <input type="number" required min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Date</label>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What was this expense for?"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div>
              <p className="text-sm font-bold text-gray-900">Recurring / subscription</p>
              <p className="text-xs font-medium text-gray-500">Repeats on a fixed schedule</p>
            </div>
            <button type="button" onClick={() => setIsRecurring(r => !r)}
              className={`relative inline-flex h-6 w-11 rounded-full transition-colors focus:outline-none ${isRecurring ? 'bg-blue-600' : 'bg-gray-200'}`}>
              <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${isRecurring ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {isRecurring && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Billing frequency</label>
              <select value={recurrenceInterval} onChange={e => setRecurrenceInterval(e.target.value as RecurrenceInterval)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
                <option value="annually">Annually</option>
              </select>
              {date && (
                <p className="mt-1 text-xs font-semibold text-gray-500">
                  Next billing: {calcNextBillingDate(date, recurrenceInterval)}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Receipt (optional)</label>
            <input type="file" accept="image/*,.pdf" onChange={e => setReceipt(e.target.files?.[0] ?? null)}
              className="w-full text-sm font-medium text-gray-500 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-600 hover:file:bg-blue-100" />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button type="submit" disabled={loading}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Saving...' : 'Save expense'}
          </button>
        </form>
      )}
    </div>
  )
}
