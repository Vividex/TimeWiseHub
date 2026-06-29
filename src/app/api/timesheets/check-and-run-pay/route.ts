import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { computeGross, computeSuper } from '@/lib/payroll/compute'
import { generateAndStorePayslip } from '@/lib/payroll/generatePayslip'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const orgId = body?.orgId as string | undefined
  const weekStart = body?.weekStart as string | undefined
  if (!orgId || !weekStart) return NextResponse.json({ error: 'orgId and weekStart required' }, { status: 400 })

  const service = createServiceClient()

  // Auth: caller must be org member with owner/admin/manager role
  const { data: membership } = await service
    .from('organisation_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership || !(['owner', 'admin', 'manager'] as string[]).includes(membership.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check if any timesheets for this org+week are still pending
  const { count: remaining } = await service
    .from('timesheets')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('week_start', weekStart)
    .eq('status', 'submitted')

  if ((remaining ?? 0) > 0) {
    return NextResponse.json({ triggered: false, remaining })
  }

  // All approved — fetch them
  const { data: sheets } = await service
    .from('timesheets')
    .select('user_id, total_seconds')
    .eq('org_id', orgId)
    .eq('week_start', weekStart)
    .eq('status', 'approved')

  if (!sheets?.length) return NextResponse.json({ triggered: false, remaining: 0 })

  // Derive period (week_start to week_start + 6 days inclusive)
  const periodStart = weekStart
  const endDate = new Date(weekStart + 'T00:00:00Z')
  endDate.setUTCDate(endDate.getUTCDate() + 6)
  const periodEnd = endDate.toISOString().slice(0, 10)

  // Fetch org
  const { data: org } = await service
    .from('organisations')
    .select('name, super_rate')
    .eq('id', orgId)
    .single()

  // Find org owner for uploaded_by
  const { data: ownerRow } = await service
    .from('organisation_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()
  const uploadedBy = (ownerRow?.user_id ?? sheets[0].user_id) as string

  // Create pay_run
  const { data: run, error: runErr } = await service
    .from('pay_runs')
    .insert({ org_id: orgId, period_start: periodStart, period_end: periodEnd, created_by: uploadedBy })
    .select('id')
    .single()

  if (runErr?.code === '23505') return NextResponse.json({ triggered: false, reason: 'already_ran' })
  if (runErr || !run) return NextResponse.json({ error: runErr?.message ?? 'Failed to create pay run' }, { status: 500 })

  const superRate = Number(org?.super_rate ?? 0.115)
  const orgName = org?.name ?? 'Organisation'

  // Fetch member hourly rates + profiles
  const userIds = sheets.map(s => s.user_id)
  const { data: members } = await service
    .from('organisation_members')
    .select('user_id, hourly_rate, profiles!organisation_members_user_id_fkey(full_name, email)')
    .eq('org_id', orgId)
    .in('user_id', userIds)

  const membersMap = new Map(
    ((members ?? []) as unknown as {
      user_id: string
      hourly_rate: number | null
      profiles: { full_name: string | null; email: string } | null
    }[]).map(m => [m.user_id, m])
  )

  let statementsCreated = 0
  let skipped = 0

  for (const sheet of sheets) {
    const m = membersMap.get(sheet.user_id as string)
    if (!m?.hourly_rate) { skipped++; continue }

    const rate = Number(m.hourly_rate)
    const seconds = Number(sheet.total_seconds)
    const gross = computeGross(seconds, rate)
    const superAmount = computeSuper(gross, superRate)
    const employeeName = m.profiles?.full_name || m.profiles?.email || 'Employee'

    const { data: stmt, error: stmtErr } = await service
      .from('pay_statements')
      .insert({
        pay_run_id: run.id,
        org_id: orgId,
        user_id: sheet.user_id,
        period_start: periodStart,
        period_end: periodEnd,
        approved_seconds: seconds,
        hourly_rate: rate,
        gross,
        super_rate: superRate,
        super_amount: superAmount,
      })
      .select('id')
      .single()

    if (stmtErr || !stmt) { skipped++; continue }

    await generateAndStorePayslip({
      supabase: service,
      payRunId: run.id as string,
      userId: sheet.user_id as string,
      orgId,
      orgName,
      employeeName,
      periodStart,
      periodEnd,
      approvedSeconds: seconds,
      hourlyRate: rate,
      gross,
      superRate,
      superAmount,
      uploadedBy,
    })

    statementsCreated++
  }

  return NextResponse.json({ triggered: true, statementsCreated, skipped })
}
