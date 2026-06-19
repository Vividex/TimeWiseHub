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

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const todayISO = new Date().toISOString().slice(0, 10)
  const tomorrowISO = addDays(todayISO, 1)
  const tomorrowDow = new Date(tomorrowISO + 'T12:00:00Z').getUTCDay() // 0=Sun…6=Sat

  const { data: orgs } = await service
    .from('organisations')
    .select('id, pay_week_start_day')
    .eq('pay_week_start_day', tomorrowDow)

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ ok: true, orgsProcessed: 0, shiftsCreated: 0 })
  }

  let orgsProcessed = 0
  let shiftsCreated = 0

  for (const org of orgs) {
    const { data: templates } = await service
      .from('roster_shift_templates')
      .select('user_id, day_of_week, start_time, end_time, notes')
      .eq('org_id', org.id)

    if (!templates || templates.length === 0) continue

    for (const tmpl of templates) {
      const daysOffset = (tmpl.day_of_week - tomorrowDow + 7) % 7
      const shiftDate = addDays(tomorrowISO, daysOffset)

      const { count: existingCount } = await service
        .from('roster_shifts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('user_id', tmpl.user_id)
        .eq('date', shiftDate)
        .eq('start_time', tmpl.start_time)
        .is('deleted_at', null)

      if ((existingCount ?? 0) > 0) continue

      const { error } = await service.from('roster_shifts').insert({
        org_id: org.id,
        user_id: tmpl.user_id,
        date: shiftDate,
        start_time: tmpl.start_time,
        end_time: tmpl.end_time,
        notes: tmpl.notes ?? null,
        published: true,
      })
      if (!error) shiftsCreated++
    }

    orgsProcessed++
  }

  return NextResponse.json({ ok: true, orgsProcessed, shiftsCreated })
}
