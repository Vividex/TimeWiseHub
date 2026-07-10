'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { REVIEW_STATUS_LABEL, REVIEW_STATUS_COLOUR, type ReviewStatus } from '@/lib/expenses'

type Expense = {
  id: string
  amount: number
  currency: string
  description: string | null
  expense_date: string
  receipt_path: string | null
  status: ReviewStatus
  is_recurring: boolean
  recurrence_interval: string | null
  profiles: { email: string }
  expense_categories: { name: string } | null
}

type Filter = 'all' | 'pending'

function notifyApprovedExpense(id: string) {
  fetch('/api/notifications/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'expense', id }),
  }).catch(error => console.error('Expense notification failed', error))
}

export default function ManagerExpenseView({ orgId }: { orgId: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const loadExpenses = useCallback(async function loadExpenses() {
    const supabase = createClient()
    const { data: members } = await supabase
      .from('organisation_members')
      .select('user_id')
      .eq('org_id', orgId)

    if (!members) { setLoading(false); return }

    const userIds = members.map(m => m.user_id)
    const { data } = await supabase
      .from('expenses')
      .select('*, profiles!expenses_user_id_fkey(email), expense_categories(name)')
      .in('user_id', userIds)
      .in('status', ['submitted', 'approved', 'rejected'])
      .order('created_at', { ascending: false })

    setExpenses((data ?? []) as unknown as Expense[])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadExpenses()
  }, [loadExpenses])

  async function handleReview(id: string, action: 'approved' | 'rejected') {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('expenses').update({
      status: action,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    }).eq('id', id)

    if (!error) {
      if (action === 'approved') notifyApprovedExpense(id)
      setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: action } : e))
      setReviewing(null)
      setNote('')
    }
  }

  async function viewReceipt(path: string) {
    const supabase = createClient()
    const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const pendingCount = expenses.filter(e => e.status === 'submitted').length
  const visibleExpenses = filter === 'pending' ? expenses.filter(e => e.status === 'submitted') : expenses

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-900">Team expenses</h2>
        <div className="flex gap-2">
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
        </div>
      </div>

      {loading ? (
        <p className="text-sm font-semibold text-gray-500">Loading...</p>
      ) : visibleExpenses.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">
          {filter === 'pending' ? 'No expenses pending review.' : 'No team expenses yet.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {visibleExpenses.map(expense => (
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
                  <p className="text-xs font-semibold text-gray-500">{expense.profiles?.email} · {new Date(expense.expense_date).toLocaleDateString()}</p>
                  {expense.description && <p className="mt-1 text-sm font-medium text-gray-500">{expense.description}</p>}
                  {expense.receipt_path && (
                    <button onClick={() => viewReceipt(expense.receipt_path!)} className="mt-1 text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700">View receipt</button>
                  )}
                </div>
                {expense.status === 'submitted' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setReviewing(reviewing === expense.id ? null : expense.id)}
                      className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-600">
                      Review
                    </button>
                  </div>
                )}
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
          ))}
        </ul>
      )}
    </div>
  )
}
