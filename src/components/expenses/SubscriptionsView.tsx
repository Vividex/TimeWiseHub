'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type Subscription = {
  id: string
  description: string | null
  amount: number
  currency: string
  recurrence_interval: string
  next_billing_date: string
  expense_categories: { name: string } | null
}

function monthlyEquivalent(amount: number, interval: string): number {
  switch (interval) {
    case 'weekly':      return (amount * 52) / 12
    case 'fortnightly': return (amount * 26) / 12
    case 'monthly':     return amount
    case 'annually':    return amount / 12
    default:            return amount
  }
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default function SubscriptionsView({ userId }: { userId: string }) {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('expenses')
        .select('id, description, amount, currency, recurrence_interval, next_billing_date, expense_categories(name)')
        .eq('user_id', userId)
        .eq('is_recurring', true)
        .order('next_billing_date', { ascending: true })

      setSubs((data ?? []) as unknown as Subscription[])
      setLoading(false)
    }
    load()
  }, [userId])

  const totalMonthly = subs.reduce((sum, s) => sum + monthlyEquivalent(s.amount, s.recurrence_interval), 0)

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Subscriptions</h2>
        {subs.length > 0 && (
          <span className="text-sm text-gray-500">
            ~<strong className="text-gray-900">AUD {totalMonthly.toFixed(2)}</strong>/mo
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : subs.length === 0 ? (
        <p className="text-sm text-gray-400">No recurring expenses yet. Toggle "Recurring" when adding an expense.</p>
      ) : (
        <ul className="space-y-3">
          {subs.map(sub => {
            const days = daysUntil(sub.next_billing_date)
            const urgency = days <= 3 ? 'text-red-600' : days <= 7 ? 'text-yellow-600' : 'text-gray-400'
            return (
              <li key={sub.id} className="flex items-center justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {sub.description || 'Unnamed subscription'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {sub.expense_categories?.name ?? 'Uncategorised'} · {sub.recurrence_interval}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {sub.currency} {sub.amount.toFixed(2)}
                  </p>
                  <p className={`text-xs ${urgency}`}>
                    {days === 0 ? 'Due today' : days < 0 ? 'Overdue' : `Due in ${days}d`}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
