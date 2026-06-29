import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

function calcNextBillingDate(from: string, interval: string): string {
  const d = new Date(from)
  switch (interval) {
    case 'weekly':      d.setDate(d.getDate() + 7); break
    case 'fortnightly': d.setDate(d.getDate() + 14); break
    case 'monthly':     d.setMonth(d.getMonth() + 1); break
    case 'annually':    d.setFullYear(d.getFullYear() + 1); break
  }
  return d.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const todayStr = new Date().toISOString().slice(0, 10)

  const { data: due, error: fetchErr } = await service
    .from('expenses')
    .select('id, org_id, user_id, amount, currency, category_id, description, recurrence_interval, next_billing_date')
    .eq('is_recurring', true)
    .lte('next_billing_date', todayStr)

  if (fetchErr) {
    console.error('Recurring expense fetch error:', fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  let processed = 0

  for (const row of due ?? []) {
    try {
      const { error: insertErr } = await service.from('expenses').insert({
        org_id: row.org_id,
        user_id: row.user_id,
        amount: row.amount,
        currency: row.currency,
        category_id: row.category_id,
        description: row.description,
        expense_date: row.next_billing_date,
        receipt_path: null,
        status: 'draft',
        is_recurring: false,
        recurrence_interval: null,
        next_billing_date: null,
      })

      if (insertErr) { console.error('Insert error for expense', row.id, insertErr); continue }

      const nextDate = calcNextBillingDate(row.next_billing_date as string, row.recurrence_interval as string)
      await service.from('expenses').update({ next_billing_date: nextDate }).eq('id', row.id)

      processed++
    } catch (err) {
      console.error('Error processing recurring expense', row.id, err)
    }
  }

  return NextResponse.json({ ok: true, processed, date: todayStr })
}
