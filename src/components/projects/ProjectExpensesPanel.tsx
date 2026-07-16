'use client'

import { FormEvent, useState } from 'react'
import { Trash2 } from 'lucide-react'

export type ProjectExpense = {
  id: string
  description: string
  amount: number
  expense_date: string
  category: string | null
  created_by: string
}

const CATEGORY_LABELS: Record<string, string> = {
  materials: 'Materials',
  equipment: 'Equipment',
  subcontractor: 'Subcontractor',
  other: 'Other',
}

const CATEGORY_COLOURS: Record<string, string> = {
  materials: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  equipment: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  subcontractor: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400',
  other: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400',
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

export default function ProjectExpensesPanel({
  projectId,
  initialExpenses,
  userId,
  canDeleteAny,
}: {
  projectId: string
  initialExpenses: ProjectExpense[]
  userId: string
  canDeleteAny: boolean
}) {
  const [expenses, setExpenses] = useState<ProjectExpense[]>(initialExpenses)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!description.trim() || !amount) return
    setAdding(true)
    const res = await fetch('/api/project-expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        description: description.trim(),
        amount: parseFloat(amount),
        expenseDate,
        category: category || null,
      }),
    })
    const data = await res.json()
    if (res.ok && data.expense) {
      setExpenses(prev => [data.expense, ...prev])
      setDescription('')
      setAmount('')
      setExpenseDate(new Date().toISOString().slice(0, 10))
      setCategory('')
    }
    setAdding(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await fetch(`/api/project-expenses/${id}`, { method: 'DELETE' })
    setExpenses(prev => prev.filter(e => e.id !== id))
    setDeletingId(null)
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description"
          required
          className="min-w-48 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="Amount"
          required
          className="w-28 rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <input
          type="date"
          value={expenseDate}
          onChange={e => setExpenseDate(e.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Category (optional)</option>
          <option value="materials">Materials</option>
          <option value="equipment">Equipment</option>
          <option value="subcontractor">Subcontractor</option>
          <option value="other">Other</option>
        </select>
        <button
          type="submit"
          disabled={adding}
          className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {adding ? 'Adding…' : '+ Add'}
        </button>
      </form>

      {expenses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 px-6 py-8 text-center text-sm font-semibold text-gray-400 dark:border-slate-700">
          No expenses logged yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-800">
          {expenses.map((exp, i) => (
            <div
              key={exp.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                i > 0 ? 'border-t border-gray-100 dark:border-slate-800' : ''
              }`}
            >
              {exp.category && (
                <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold ${CATEGORY_COLOURS[exp.category] ?? CATEGORY_COLOURS.other}`}>
                  {CATEGORY_LABELS[exp.category] ?? exp.category}
                </span>
              )}
              <span className="min-w-0 flex-1 text-sm text-slate-900 dark:text-slate-100">
                {exp.description}
              </span>
              <span className="shrink-0 text-xs text-gray-400">{fmtDate(exp.expense_date)}</span>
              <span className="w-24 shrink-0 text-right text-sm font-bold text-gray-900 dark:text-slate-100">
                {fmtCurrency(Number(exp.amount))}
              </span>
              {(exp.created_by === userId || canDeleteAny) && (
                <button
                  onClick={() => handleDelete(exp.id)}
                  disabled={deletingId === exp.id}
                  className="shrink-0 rounded-lg p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:text-slate-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          {/* Total row */}
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Total expenses</span>
            <span className="text-sm font-black text-gray-900 dark:text-slate-100">{fmtCurrency(total)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
