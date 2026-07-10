'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { addInterval, daysUntil, markExpenseCyclePaid, REVIEW_STATUS_LABEL, REVIEW_STATUS_COLOUR, type RecurrenceInterval, type ReviewStatus } from '@/lib/expenses'

type Category = { id: string; name: string }
type Filter = 'all' | 'pending'

type BusinessExpense = {
  id: string
  org_id: string
  user_id: string
  description: string | null
  amount: number
  currency: string
  category_id: string | null
  is_recurring: boolean
  recurrence_interval: RecurrenceInterval | null
  next_billing_date: string | null
  expense_date: string
  status: ReviewStatus
  profiles: { email: string } | null
  expense_categories: { name: string } | null
}

const CURRENCIES = ['AUD', 'USD', 'GBP', 'EUR', 'NZD', 'CAD', 'SGD']
const INTERVALS: { value: RecurrenceInterval; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function notifyApprovedExpense(id: string) {
  fetch('/api/notifications/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'expense', id }),
  }).catch(error => console.error('Expense notification failed', error))
}

export default function BusinessExpensesView({
  userId,
  orgId,
  categories,
  canApprove,
}: {
  userId: string
  orgId: string
  categories: Category[]
  canApprove: boolean
}) {
  const [expenses, setExpenses] = useState<BusinessExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [payingId, setPayingId] = useState<string | null>(null)

  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('AUD')
  const [recurring, setRecurring] = useState(false)
  const [interval, setInterval] = useState<RecurrenceInterval>('monthly')
  const [nextBillingDate, setNextBillingDate] = useState(today())

  const loadExpenses = useCallback(async function loadExpenses() {
    const supabase = createClient()
    const { data } = await supabase
      .from('expenses')
      .select('id, org_id, user_id, description, amount, currency, category_id, is_recurring, recurrence_interval, next_billing_date, expense_date, status, profiles!expenses_user_id_fkey(email), expense_categories(name)')
      .eq('org_id', orgId)
      .eq('is_business', true)
      .order('created_at', { ascending: false })

    setExpenses((data ?? []) as unknown as BusinessExpense[])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadExpenses()
  }, [loadExpenses])

  function resetForm() {
    setDescription('')
    setCategoryId('')
    setAmount('')
    setCurrency('AUD')
    setRecurring(false)
    setInterval('monthly')
    setNextBillingDate(today())
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      user_id: userId,
      org_id: orgId,
      is_business: true,
      category_id: categoryId || null,
      amount: parseFloat(amount),
      currency,
      description: description || null,
      status: 'submitted',
      is_recurring: recurring,
      recurrence_interval: recurring ? interval : null,
      next_billing_date: recurring ? nextBillingDate : null,
      expense_date: recurring ? nextBillingDate : today(),
    }

    const supabase = createClient()
    const { error: submitError } = await supabase.from('expenses').insert(payload)

    if (submitError) {
      setError(submitError.message)
      setSaving(false)
      return
    }

    await loadExpenses()
    resetForm()
    setOpen(false)
    setSaving(false)
  }

  async function handleReview(id: string, action: 'approved' | 'rejected') {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: reviewError } = await supabase.from('expenses').update({
      status: action,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    }).eq('id', id)

    if (!reviewError) {
      if (action === 'approved') notifyApprovedExpense(id)
      setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: action } : e))
      setReviewing(null)
      setNote('')
    }
  }

  async function markPaid(expense: BusinessExpense) {
    if (!expense.next_billing_date || !expense.recurrence_interval) return
    setPayingId(expense.id)
    const supabase = createClient()
    const { error: payError } = await markExpenseCyclePaid(
      supabase,
      { ...expense, next_billing_date: expense.next_billing_date, recurrence_interval: expense.recurrence_interval, is_business: true },
      userId,
    )
    setPayingId(null)
    if (!payError) {
      const nextDate = addInterval(expense.next_billing_date, expense.recurrence_interval)
      setExpenses(prev => prev.map(e => e.id === expense.id ? { ...e, next_billing_date: nextDate } : e))
    }
  }

  const pendingCount = expenses.filter(e => e.status === 'submitted').length
  const visibleExpenses = filter === 'pending' ? expenses.filter(e => e.status === 'submitted') : expenses

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Business expenses</h2>
          <p className="mt-1 text-sm font-medium text-gray-500">Company costs, not tied to an individual's reimbursement.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${filter === 'all' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${filter === 'pending' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Pending approval{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
          <button onClick={() => setOpen(v => !v)} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600">
            {open ? 'Cancel' : '+ Add business expense'}
          </button>
        </div>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="mb-5 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Office rent"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <option value="">Uncategorised</option>
                {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Amount</label>
              <input type="number" required min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                {CURRENCIES.map(option => <option key={option}>{option}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} className="h-4 w-4 rounded accent-cyan-500" />
            This is a recurring expense
          </label>

          {recurring && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Frequency</label>
                <select value={interval} onChange={e => setInterval(e.target.value as RecurrenceInterval)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                  {INTERVALS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Next billing</label>
                <input type="date" required value={nextBillingDate} onChange={e => setNextBillingDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              </div>
            </div>
          )}

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button type="submit" disabled={saving} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {saving ? 'Saving...' : 'Submit for approval'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm font-semibold text-gray-500">Loading...</p>
      ) : visibleExpenses.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">
          {filter === 'pending' ? 'No business expenses pending review.' : 'No business expenses yet.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {visibleExpenses.map(expense => {
            const due = expense.is_recurring && expense.next_billing_date ? daysUntil(expense.next_billing_date) : null
            return (
              <li key={expense.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-900">
                      {expense.currency} {expense.amount.toFixed(2)}
                      {expense.expense_categories && <span className="text-xs font-semibold text-gray-500">{expense.expense_categories.name}</span>}
                      {expense.is_recurring && (
                        <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-bold text-cyan-600">
                          Recurring — {expense.recurrence_interval}
                        </span>
                      )}
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${REVIEW_STATUS_COLOUR[expense.status]}`}>
                        {REVIEW_STATUS_LABEL[expense.status]}
                      </span>
                    </p>
                    <p className="text-xs font-semibold text-gray-500">
                      Logged by {expense.profiles?.email ?? 'Unknown'} · {new Date(expense.expense_date).toLocaleDateString()}
                    </p>
                    {expense.description && <p className="mt-1 text-sm font-medium text-gray-500">{expense.description}</p>}
                    {expense.status === 'approved' && due !== null && (
                      <p className={`mt-1 text-xs font-bold ${due <= 3 ? 'text-red-600' : due <= 7 ? 'text-amber-600' : 'text-gray-500'}`}>
                        {due === 0 ? 'Due today' : due < 0 ? 'Overdue' : `Due in ${due}d`} · Next: {expense.next_billing_date}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {canApprove && expense.status === 'submitted' && (
                      <button onClick={() => setReviewing(reviewing === expense.id ? null : expense.id)}
                        className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-600">
                        Review
                      </button>
                    )}
                    {canApprove && expense.status === 'approved' && expense.is_recurring && (
                      <button onClick={() => markPaid(expense)} disabled={payingId === expense.id}
                        className="rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50">
                        {payingId === expense.id ? 'Saving…' : 'Mark paid'}
                      </button>
                    )}
                  </div>
                </div>

                {reviewing === expense.id && (
                  <div className="mt-3 space-y-2">
                    <input type="text" placeholder="Add a note (optional)" value={note} onChange={e => setNote(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                    <div className="flex gap-2">
                      <button onClick={() => handleReview(expense.id, 'approved')}
                        className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700">
                        Approve
                      </button>
                      <button onClick={() => handleReview(expense.id, 'rejected')}
                        className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700">
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
