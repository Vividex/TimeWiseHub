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
    <div className="bg-white rounded-2xl shadow p-6">
      <button onClick={() => setOpen(o => !o)} className="text-sm font-semibold text-blue-600 hover:underline">
        {open ? 'Cancel' : '+ Add expense'}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
              <input type="number" required min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What was this expense for?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center justify-between py-2 border-t border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">Recurring / subscription</p>
              <p className="text-xs text-gray-400">Repeats on a fixed schedule</p>
            </div>
            <button type="button" onClick={() => setIsRecurring(r => !r)}
              className={`relative inline-flex h-6 w-11 rounded-full transition-colors focus:outline-none ${isRecurring ? 'bg-blue-600' : 'bg-gray-200'}`}>
              <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${isRecurring ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {isRecurring && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Billing frequency</label>
              <select value={recurrenceInterval} onChange={e => setRecurrenceInterval(e.target.value as RecurrenceInterval)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
                <option value="annually">Annually</option>
              </select>
              {date && (
                <p className="text-xs text-gray-400 mt-1">
                  Next billing: {calcNextBillingDate(date, recurrenceInterval)}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Receipt (optional)</label>
            <input type="file" accept="image/*,.pdf" onChange={e => setReceipt(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading}
            className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Saving...' : 'Save expense'}
          </button>
        </form>
      )}
    </div>
  )
}
