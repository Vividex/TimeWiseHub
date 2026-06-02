'use client'

import { useEffect, useState } from 'react'
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

  useEffect(() => { loadExpenses() }, [orgId])

  async function loadExpenses() {
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
  }

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
    <div className="bg-white rounded-2xl shadow p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Pending approvals</h2>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : expenses.length === 0 ? (
        <p className="text-sm text-gray-400">No expenses pending review.</p>
      ) : (
        <ul className="space-y-4">
          {expenses.map(expense => (
            <li key={expense.id} className="border border-gray-100 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {expense.currency} {expense.amount.toFixed(2)}
                    {expense.expense_categories && <span className="ml-2 text-xs font-normal text-gray-400">{expense.expense_categories.name}</span>}
                  </p>
                  <p className="text-xs text-gray-500">{expense.profiles?.email} · {new Date(expense.expense_date).toLocaleDateString()}</p>
                  {expense.description && <p className="text-sm text-gray-600 mt-1">{expense.description}</p>}
                  {expense.receipt_path && (
                    <button onClick={() => viewReceipt(expense.receipt_path!)} className="text-xs text-blue-500 hover:underline mt-1">View receipt</button>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setReviewing(reviewing === expense.id ? null : expense.id)}
                    className="text-xs text-gray-500 hover:text-gray-800 underline">
                    Review
                  </button>
                </div>
              </div>

              {reviewing === expense.id && (
                <div className="mt-3 space-y-2">
                  <input type="text" placeholder="Add a note (optional)" value={note} onChange={e => setNote(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="flex gap-2">
                    <button onClick={() => handleReview(expense.id, 'approved')}
                      className="bg-green-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-green-700">
                      Approve
                    </button>
                    <button onClick={() => handleReview(expense.id, 'rejected')}
                      className="bg-red-500 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-red-600">
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
