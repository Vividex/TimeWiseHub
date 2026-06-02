'use client'

import { useState } from 'react'
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
  submitted: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
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
    <div className="bg-white rounded-2xl shadow p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-base font-semibold text-gray-900">My expenses</h2>
        <div className="flex items-center gap-3">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
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
        <p className="text-sm text-gray-400">No expenses found.</p>
      ) : (
        <>
          <ul className="space-y-3">
            {filtered.map(expense => (
              <li key={expense.id} className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {expense.currency} {expense.amount.toFixed(2)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOURS[expense.status]}`}>
                      {expense.status}
                    </span>
                    {expense.expense_categories && (
                      <span className="text-xs text-gray-400">{expense.expense_categories.name}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{expense.description || <span className="italic text-gray-400">No description</span>}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(expense.expense_date).toLocaleDateString()}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {expense.receipt_path && (
                    <button onClick={() => viewReceipt(expense.receipt_path!)} className="text-xs text-blue-500 hover:underline">View receipt</button>
                  )}
                  {expense.status === 'draft' && (
                    <button onClick={() => handleSubmit(expense.id)} disabled={loading === expense.id}
                      className="text-xs text-blue-600 hover:underline disabled:opacity-50">
                      Submit
                    </button>
                  )}
                  {expense.status === 'draft' && (
                    <button onClick={() => handleDelete(expense.id, expense.receipt_path)} disabled={loading === expense.id}
                      className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50">
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-sm">
            <span className="text-gray-500">Total ({filtered.length} {filtered.length === 1 ? 'entry' : 'entries'})</span>
            <span className="font-semibold text-gray-900">{total.toFixed(2)}</span>
          </div>
        </>
      )}
    </div>
  )
}
