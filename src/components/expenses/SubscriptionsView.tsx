'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'

type Category = { id: string; name: string }
type RecurrenceInterval = 'weekly' | 'fortnightly' | 'monthly' | 'annually'

type Subscription = {
  id: string
  category_id: string | null
  description: string | null
  amount: number
  currency: string
  recurrence_interval: RecurrenceInterval
  next_billing_date: string
  expense_categories: { name: string } | null
}

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'CAD', 'SGD']
const INTERVALS: { value: RecurrenceInterval; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
]

function monthlyEquivalent(amount: number, interval: RecurrenceInterval): number {
  switch (interval) {
    case 'weekly': return (amount * 52) / 12
    case 'fortnightly': return (amount * 26) / 12
    case 'monthly': return amount
    case 'annually': return amount / 12
  }
}

function addInterval(dateStr: string, interval: RecurrenceInterval): string {
  const date = new Date(`${dateStr}T00:00:00`)
  switch (interval) {
    case 'weekly': date.setDate(date.getDate() + 7); break
    case 'fortnightly': date.setDate(date.getDate() + 14); break
    case 'monthly': date.setMonth(date.getMonth() + 1); break
    case 'annually': date.setFullYear(date.getFullYear() + 1); break
  }
  return date.toISOString().slice(0, 10)
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${dateStr}T00:00:00`)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function SubscriptionsView({
  userId,
  orgId,
  categories,
}: {
  userId: string
  orgId: string | null
  categories: Category[]
}) {
  const router = useRouter()
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [pendingMarkPaid, setPendingMarkPaid] = useState<Subscription | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('AUD')
  const [categoryId, setCategoryId] = useState('')
  const [interval, setInterval] = useState<RecurrenceInterval>('monthly')
  const [nextBillingDate, setNextBillingDate] = useState(today())

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('expenses')
      .select('id, category_id, description, amount, currency, recurrence_interval, next_billing_date, expense_categories(name)')
      .eq('user_id', userId)
      .eq('is_recurring', true)
      .order('next_billing_date', { ascending: true })

    setSubs((data ?? []) as unknown as Subscription[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  function resetForm() {
    setEditingId(null)
    setDescription('')
    setAmount('')
    setCurrency('AUD')
    setCategoryId('')
    setInterval('monthly')
    setNextBillingDate(today())
    setError(null)
  }

  function startCreate() {
    resetForm()
    setOpen(value => !value)
  }

  function startEdit(sub: Subscription) {
    setOpen(true)
    setEditingId(sub.id)
    setDescription(sub.description ?? '')
    setAmount(String(sub.amount))
    setCurrency(sub.currency)
    setCategoryId(sub.category_id ?? '')
    setInterval(sub.recurrence_interval)
    setNextBillingDate(sub.next_billing_date)
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      user_id: userId,
      org_id: orgId,
      category_id: categoryId || null,
      amount: parseFloat(amount),
      currency,
      description: description || null,
      expense_date: nextBillingDate,
      status: 'draft',
      is_recurring: true,
      recurrence_interval: interval,
      next_billing_date: nextBillingDate,
    }

    const supabase = createClient()
    const result = editingId
      ? await supabase.from('expenses').update(payload).eq('id', editingId)
      : await supabase.from('expenses').insert(payload)

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    await load()
    resetForm()
    setOpen(false)
    setSaving(false)
    router.refresh()
  }

  async function deleteTemplate(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (!error) {
      setSubs(current => current.filter(sub => sub.id !== id))
      setPendingDelete(null)
      router.refresh()
    }
  }

  async function advanceBilling(sub: Subscription) {
    const nextDate = addInterval(sub.next_billing_date, sub.recurrence_interval)
    const supabase = createClient()
    const { error } = await supabase
      .from('expenses')
      .update({ next_billing_date: nextDate, expense_date: nextDate })
      .eq('id', sub.id)

    if (!error) {
      setSubs(current => current.map(item => item.id === sub.id ? { ...item, next_billing_date: nextDate } : item))
      router.refresh()
    }
  }

  const totalMonthly = subs.reduce((sum, sub) => sum + monthlyEquivalent(sub.amount, sub.recurrence_interval), 0)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Recurring expenses</h2>
          <p className="mt-1 text-sm font-medium text-gray-500">Create and manage subscription-style expense templates.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {subs.length > 0 && (
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-sm font-semibold text-gray-500">
              ~<strong className="text-gray-900">AUD {totalMonthly.toFixed(2)}</strong>/mo
            </span>
          )}
          <button onClick={startCreate} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600">
            {open && !editingId ? 'Cancel' : '+ Add recurring'}
          </button>
        </div>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="mb-5 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Name</label>
              <input value={description} onChange={event => setDescription(event.target.value)} placeholder="Software subscription"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Category</label>
              <select value={categoryId} onChange={event => setCategoryId(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <option value="">Uncategorised</option>
                {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Amount</label>
              <input type="number" required min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Currency</label>
              <select value={currency} onChange={event => setCurrency(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                {CURRENCIES.map(option => <option key={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Frequency</label>
              <select value={interval} onChange={event => setInterval(event.target.value as RecurrenceInterval)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                {INTERVALS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Next billing</label>
              <input type="date" required value={nextBillingDate} onChange={event => setNextBillingDate(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create template'}
            </button>
            {editingId && (
              <button type="button" onClick={() => { resetForm(); setOpen(false) }} className="px-4 py-2 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm font-semibold text-gray-500">Loading...</p>
      ) : subs.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">No recurring expense templates yet.</p>
      ) : (
        <ul className="space-y-3">
          {subs.map(sub => {
            const days = daysUntil(sub.next_billing_date)
            const urgency = days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-gray-500'
            return (
              <li key={sub.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900">{sub.description || 'Unnamed recurring expense'}</p>
                    <p className="text-xs font-semibold text-gray-500">
                      {sub.expense_categories?.name ?? 'Uncategorised'} · {sub.recurrence_interval}
                    </p>
                    <p className={`mt-1 text-xs font-bold ${urgency}`}>
                      {days === 0 ? 'Due today' : days < 0 ? 'Overdue' : `Due in ${days}d`}
                    </p>
                  </div>
                  <div className="shrink-0 sm:text-right">
                    <p className="text-sm font-bold text-gray-900">{sub.currency} {sub.amount.toFixed(2)}</p>
                    <p className="text-xs font-medium text-gray-500">Next: {sub.next_billing_date}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button onClick={() => setPendingMarkPaid(sub)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800">
                      Mark paid
                    </button>
                    <button onClick={() => startEdit(sub)} className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-600">
                      Edit
                    </button>
                    <button onClick={() => setPendingDelete(sub.id)} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700">
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingMarkPaid}
        title="Mark as paid"
        message={pendingMarkPaid
          ? `This will record the payment and advance the next billing date to ${addInterval(pendingMarkPaid.next_billing_date, pendingMarkPaid.recurrence_interval)}. The billing cycle will continue from that date.`
          : ''}
        confirmLabel="Mark as paid"
        onConfirm={() => {
          if (pendingMarkPaid) { advanceBilling(pendingMarkPaid); setPendingMarkPaid(null) }
        }}
        onCancel={() => setPendingMarkPaid(null)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete subscription"
        message="This recurring subscription template will be permanently deleted and cannot be recovered."
        onConfirm={() => pendingDelete && deleteTemplate(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
