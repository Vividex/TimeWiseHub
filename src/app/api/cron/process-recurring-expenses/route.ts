import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { markExpenseCyclePaid, type RecurringExpenseTemplate } from '@/lib/expenses'

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const todayStr = new Date().toISOString().slice(0, 10)

  // Only already-approved recurring expenses generate occurrences automatically — a still-pending
  // or rejected template must never silently start producing spend records. Each occurrence
  // inherits that one-time approval (status: 'approved' inside markExpenseCyclePaid) rather than
  // needing to be re-approved every cycle.
  const { data: due, error: fetchErr } = await service
    .from('expenses')
    .select('id, org_id, user_id, amount, currency, category_id, description, recurrence_interval, next_billing_date, is_business')
    .eq('is_recurring', true)
    .eq('status', 'approved')
    .lte('next_billing_date', todayStr)

  if (fetchErr) {
    console.error('Recurring expense fetch error:', fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  let processed = 0

  for (const row of (due ?? []) as RecurringExpenseTemplate[]) {
    try {
      const { error } = await markExpenseCyclePaid(service, row, row.user_id)
      if (error) { console.error('Error processing recurring expense', row.id, error); continue }
      processed++
    } catch (err) {
      console.error('Error processing recurring expense', row.id, err)
    }
  }

  return NextResponse.json({ ok: true, processed, date: todayStr })
}
