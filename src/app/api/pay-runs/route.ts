import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveRole } from '@/lib/auth/resolve-role'
import { derivePayPeriod, type PayCadence } from '@/lib/payroll/period'
import { computeGross, computeSuper } from '@/lib/payroll/compute'

export async function POST(request: Request) {
  const ctx = await resolveRole()
  if (!ctx || !ctx.isFinancial || !ctx.orgId) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const anchor = body?.anchorDate
  const notes = typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
  if (typeof anchor !== 'string' || !anchor) {
    return NextResponse.json({ error: 'anchorDate required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organisations')
    .select('pay_cadence, super_rate')
    .eq('id', ctx.orgId)
    .single()
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })

  const cadence = org.pay_cadence as PayCadence
  const superRate = Number(org.super_rate)
  const { periodStart, periodEnd } = derivePayPeriod(cadence, anchor)

  const { data: sheets } = await supabase
    .from('timesheets')
    .select('user_id, total_seconds')
    .eq('org_id', ctx.orgId)
    .eq('status', 'approved')
    .gte('week_start', periodStart)
    .lte('week_start', periodEnd)

  const rows = (sheets ?? []) as { user_id: string; total_seconds: number }[]
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No approved hours found for this period.' }, { status: 422 })
  }

  const secondsByUser = new Map<string, number>()
  for (const r of rows) {
    secondsByUser.set(r.user_id, (secondsByUser.get(r.user_id) ?? 0) + (r.total_seconds ?? 0))
  }

  const userIds = [...secondsByUser.keys()]
  const { data: membersData } = await supabase
    .from('organisation_members')
    .select('user_id, hourly_rate, profiles(full_name, email)')
    .eq('org_id', ctx.orgId)
    .in('user_id', userIds)

  const members = (membersData ?? []) as unknown as {
    user_id: string
    hourly_rate: number | null
    profiles: { full_name: string | null; email: string } | null
  }[]
  const memberByUser = new Map(members.map(m => [m.user_id, m]))

  const { data: run, error: runError } = await supabase
    .from('pay_runs')
    .insert({ org_id: ctx.orgId, period_start: periodStart, period_end: periodEnd, created_by: ctx.userId })
    .select('id')
    .single()

  if (runError || !run) {
    const dup = runError?.code === '23505'
    return NextResponse.json(
      { error: dup ? 'A pay run already exists for this period. Delete it to re-run.' : (runError?.message ?? 'Failed to create pay run') },
      { status: dup ? 409 : 500 },
    )
  }

  const statements: Record<string, unknown>[] = []
  const skipped: { name: string; reason: string }[] = []

  for (const [userId, seconds] of secondsByUser) {
    const m = memberByUser.get(userId)
    const name = m?.profiles?.full_name ?? m?.profiles?.email ?? 'Unknown'
    if (m?.hourly_rate == null) {
      skipped.push({ name, reason: 'no rate set' })
      continue
    }
    const rate = Number(m.hourly_rate)
    const gross = computeGross(seconds, rate)
    statements.push({
      pay_run_id: run.id,
      org_id: ctx.orgId,
      user_id: userId,
      period_start: periodStart,
      period_end: periodEnd,
      approved_seconds: seconds,
      hourly_rate: rate,
      gross,
      super_rate: superRate,
      super_amount: computeSuper(gross, superRate),
      notes,
    })
  }

  if (statements.length === 0) {
    await supabase.from('pay_runs').delete().eq('id', run.id)
    return NextResponse.json(
      { error: 'No statements created — no contributing member had an hourly rate set.', skipped },
      { status: 422 },
    )
  }

  const { error: stmtError } = await supabase.from('pay_statements').insert(statements)
  if (stmtError) {
    await supabase.from('pay_runs').delete().eq('id', run.id)
    return NextResponse.json({ error: stmtError.message }, { status: 500 })
  }

  return NextResponse.json({ created: statements.length, skipped, periodStart, periodEnd })
}
