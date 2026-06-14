import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  const cronSecret = req.headers.get('x-cron-secret')
  return auth === `Bearer ${secret}` || cronSecret === secret
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function shiftSeconds(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) * 60)
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const todayISO = new Date().toISOString().slice(0, 10)
  const yesterdayISO = addDays(todayISO, -1)
  const yesterdayDow = new Date(yesterdayISO + 'T12:00:00Z').getUTCDay()

  // Week ends on the day before the week start day.
  // e.g. Mon-start (1): week ends Sun (0) → (0+1)%7=1 ✓
  // e.g. Thu-start (4): week ends Wed (3) → (3+1)%7=4 ✓
  const weekStartDayFilter = (yesterdayDow + 1) % 7

  const { data: orgs } = await service
    .from('organisations')
    .select('id, pay_week_start_day')
    .eq('pay_week_start_day', weekStartDayFilter)

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ ok: true, orgsProcessed: 0, timesheetsCreated: 0, timesheetsSkipped: 0 })
  }

  let orgsProcessed = 0
  let timesheetsCreated = 0
  let timesheetsSkipped = 0

  for (const org of orgs) {
    const weekStart = addDays(yesterdayISO, -6) // 7-day week; yesterday is day 7

    const { data: shifts } = await service
      .from('roster_shifts')
      .select('user_id, start_time, end_time')
      .eq('org_id', org.id)
      .eq('published', true)
      .is('deleted_at', null)
      .gte('date', weekStart)
      .lte('date', yesterdayISO)

    if (!shifts || shifts.length === 0) continue

    const secondsByUser = new Map<string, number>()
    for (const s of shifts) {
      const secs = shiftSeconds(s.start_time, s.end_time)
      if (secs > 0) {
        secondsByUser.set(s.user_id, (secondsByUser.get(s.user_id) ?? 0) + secs)
      }
    }

    for (const [userId, totalSeconds] of secondsByUser) {
      const { data: existing } = await service
        .from('timesheets')
        .select('id, status')
        .eq('user_id', userId)
        .eq('week_start', weekStart)
        .maybeSingle()

      if (existing?.status === 'approved') {
        timesheetsSkipped++
        continue
      }

      const { error } = await service.from('timesheets').upsert({
        user_id: userId,
        org_id: org.id,
        week_start: weekStart,
        status: 'submitted',
        total_seconds: totalSeconds,
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
      }, { onConflict: 'user_id,week_start' })

      if (!error) timesheetsCreated++
    }

    orgsProcessed++
  }

  return NextResponse.json({ ok: true, orgsProcessed, timesheetsCreated, timesheetsSkipped })
}
