'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export default function ExportExpensesButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    const supabase = createClient()

    const from = new Date()
    from.setDate(from.getDate() - 90)

    const { data } = await supabase
      .from('expenses')
      .select('expense_date, amount, currency, description, status, expense_categories(name)')
      .eq('user_id', userId)
      .gte('expense_date', from.toISOString().slice(0, 10))
      .order('expense_date', { ascending: false })

    if (!data) { setLoading(false); return }

    const rows = [
      ['Date', 'Amount', 'Currency', 'Category', 'Description', 'Status'],
      ...data.map(e => [
        e.expense_date,
        e.amount.toFixed(2),
        e.currency,
        (e.expense_categories as unknown as { name: string } | null)?.name ?? '',
        e.description ?? '',
        e.status,
      ]),
    ]

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setLoading(false)
  }

  return (
    <button onClick={handleExport} disabled={loading}
      className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
      {loading ? 'Exporting...' : 'Export CSV (90 days)'}
    </button>
  )
}
