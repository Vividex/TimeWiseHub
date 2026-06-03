'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type Expense = {
  id: string
  amount: number
  currency: string
  description: string | null
  expense_date: string
  receipt_path: string | null
  status: string
  profiles: { email: string }
  expense_categories: { name: string } | null
}

export default function ManagerExpenseView({ orgId }: { orgId: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
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
      .select('*, profiles(email), expense_categories(name)')
      .in('user_id', userIds)
      .eq('status', 'submitted')
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

    await supabase.from('expenses').update({
      status: action,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
    }).eq('id', id)

    setExpenses(prev => prev.filter(e => e.id !== id))
    setReviewing(null)
    setNote('')
  }

  async function viewReceipt(path: string) {
    const supabase = createClient()
    const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold text-gray-900">Pending approvals</h2>

      {loading ? (
        <p className="text-sm font-semibold text-gray-500">Loading...</p>
      ) : expenses.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">No expenses pending review.</p>
      ) : (
        <ul className="space-y-4">
          {expenses.map(expense => (
            <li key={expense.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">
                    {expense.currency} {expense.amount.toFixed(2)}
                    {expense.expense_categories && <span className="ml-2 text-xs font-semibold text-gray-500">{expense.expense_categories.name}</span>}
                  </p>
                  <p className="text-xs font-semibold text-gray-500">{expense.profiles?.email} · {new Date(expense.expense_date).toLocaleDateString()}</p>
                  {expense.description && <p className="mt-1 text-sm font-medium text-gray-500">{expense.description}</p>}
                  {expense.receipt_path && (
                    <button onClick={() => viewReceipt(expense.receipt_path!)} className="mt-1 text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700">View receipt</button>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setReviewing(reviewing === expense.id ? null : expense.id)}
                    className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700">
                    Review
                  </button>
                </div>
              </div>

              {reviewing === expense.id && (
                <div className="mt-3 space-y-2">
                  <input type="text" placeholder="Add a note (optional)" value={note} onChange={e => setNote(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
