'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import ExportExpensesButton from './ExportExpensesButton'

type Category = { id: string; name: string }
type Expense = {
  id: string
  amount: number
  currency: string
  description: string | null
  expense_date: string
  status: string
  receipt_path: string | null
  expense_categories: { name: string } | null
}

const STATUS_COLOURS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  submitted: 'bg-orange-50 text-orange-600',
  approved: 'bg-green-50 text-green-600',
  rejected: 'bg-red-50 text-red-600',
}

export default function ExpenseList({
  initialExpenses,
  categories,
  userId,
}: {
  initialExpenses: Expense[]
  categories: Category[]
  userId: string
}) {
  const router = useRouter()
  const [expenses, setExpenses] = useState(initialExpenses)
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpenses(initialExpenses)
  }, [initialExpenses])
  const [loading, setLoading] = useState<string | null>(null)

  const filtered = statusFilter === 'all' ? expenses : expenses.filter(e => e.status === statusFilter)
  const total = filtered.reduce((sum, e) => sum + e.amount, 0)

  async function handleSubmit(id: string) {
    setLoading(id)
    const supabase = createClient()
    await supabase.from('expenses').update({ status: 'submitted' }).eq('id', id)
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, status: 'submitted' } : e))
    setLoading(null)
    router.refresh()
  }

  async function handleDelete(id: string, receiptPath: string | null) {
    setLoading(id)
    const supabase = createClient()
    if (receiptPath) await supabase.storage.from('receipts').remove([receiptPath])
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses(prev => prev.filter(e => e.id !== id))
    setLoading(null)
  }

  async function viewReceipt(path: string) {
    const supabase = createClient()
    const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-900">My expenses</h2>
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <ExportExpensesButton userId={userId} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">No expenses found.</p>
      ) : (
        <>
          <ul className="space-y-3">
            {filtered.map(expense => (
              <li key={expense.id} className="flex items-start justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-gray-900">
                      {expense.currency} {expense.amount.toFixed(2)}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_COLOURS[expense.status]}`}>
                      {expense.status}
                    </span>
                    {expense.expense_categories && (
                      <span className="text-xs font-semibold text-gray-500">{expense.expense_categories.name}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-gray-500">{expense.description || <span className="italic text-gray-500">No description</span>}</p>
                  <p className="mt-1 text-xs font-semibold text-gray-500">{new Date(expense.expense_date).toLocaleDateString()}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {expense.receipt_path && (
                    <button onClick={() => viewReceipt(expense.receipt_path!)} className="text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700">View receipt</button>
                  )}
                  {expense.status === 'draft' && (
                    <button onClick={() => handleSubmit(expense.id)} disabled={loading === expense.id}
                      className="text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700 disabled:opacity-50">
                      Submit
                    </button>
                  )}
                  {expense.status === 'draft' && (
                    <button onClick={() => handleDelete(expense.id, expense.receipt_path)} disabled={loading === expense.id}
                      className="text-xs font-semibold text-red-600 transition-colors hover:text-red-700 disabled:opacity-50">
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between border-t border-gray-100 pt-4 text-sm">
            <span className="font-semibold text-gray-500">Total ({filtered.length} {filtered.length === 1 ? 'entry' : 'entries'})</span>
            <span className="font-semibold text-gray-900">{total.toFixed(2)}</span>
          </div>
        </>
      )}
    </div>
  )
}
