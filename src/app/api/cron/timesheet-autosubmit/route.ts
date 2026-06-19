import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendTimesheetSubmissionAlert } from '@/lib/email-notifications'

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

// Returns the Monday of the week containing `date` (UTC), offset by `weekStartDay`.
// weekStartDay: 0=Sun, 1=Mon, 2=Tue … 6=Sat
function getWeekStart(date: Date, weekStartDay: number): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  const dayOfWeek = d.getUTCDay() // 0=Sun
  const diff = (dayOfWeek - weekStartDay + 7) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return d
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const now = new Date()
  const todayUtcDay = now.getUTCDay() // 0=Sun, 1=Mon…

  // Load all orgs and their pay week start day
  const { data: orgs } = await service
    .from('organisations')
    .select('id, pay_week_start_day')

  let submitted = 0
  let skipped = 0
  let failed = 0

  for (const org of orgs ?? []) {
    const weekStartDay: number = org.pay_week_start_day ?? 1

    // Only act on orgs whose new pay week starts today (i.e. the previous week just ended)
    if (todayUtcDay !== weekStartDay) {
      skipped++
      continue
    }

    // Previous pay week: from (today - 7 days) to (today - 1 day)
    const prevWeekStart = getWeekStart(now, weekStartDay)
    prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7)
    const prevWeekEnd = new Date(prevWeekStart)
    prevWeekEnd.setUTCDate(prevWeekEnd.getUTCDate() + 7)
    const weekStartStr = toDateStr(prevWeekStart)
    const weekEndStr = toDateStr(prevWeekEnd)

    // Get all org members
    const { data: members } = await service
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', org.id)

    for (const member of members ?? []) {
      try {
        const userId = member.user_id as string

        // Skip if already submitted or approved
        const { data: existing } = await service
          .from('timesheets')
          .select('id, status')
          .eq('user_id', userId)
          .eq('week_start', weekStartStr)
          .in('status', ['submitted', 'approved'])
          .maybeSingle()

        if (existing) { skipped++; continue }

        // Calculate total seconds from time_entries
        const { data: entries } = await service
          .from('time_entries')
          .select('duration_seconds')
          .eq('user_id', userId)
          .gte('started_at', `${weekStartStr}T00:00:00`)
          .lt('started_at', `${weekEndStr}T00:00:00`)
          .not('ended_at', 'is', null)

        // Also include completed roster shifts for the week
        const { data: shifts } = await service
          .from('roster_shifts')
          .select('start_time, end_time')
          .eq('user_id', userId)
          .eq('org_id', org.id)
          .eq('published', true)
          .is('deleted_at', null)
          .gte('date', weekStartStr)
          .lt('date', weekEndStr)

        const entrySeconds = (entries ?? []).reduce((s, e) => s + (e.duration_seconds ?? 0), 0)
        const rosterSeconds = (shifts ?? []).reduce((s, shift) => {
          const [sh, sm] = (shift.start_time as string).split(':').map(Number)
          const [eh, em] = (shift.end_time as string).split(':').map(Number)
          const dur = (eh * 3600 + em * 60) - (sh * 3600 + sm * 60)
          return s + (dur > 0 ? dur : 0)
        }, 0)
        const totalSeconds = entrySeconds + rosterSeconds

        // Skip members with no hours (not active that week)
        if (totalSeconds === 0) { skipped++; continue }

        // Upsert timesheet as submitted
        const { data: ts, error: tsErr } = await service
          .from('timesheets')
          .upsert({
            user_id: userId,
            org_id: org.id,
            week_start: weekStartStr,
            status: 'submitted',
            total_seconds: totalSeconds,
            reviewed_by: null,
            reviewed_at: null,
            review_note: null,
          }, { onConflict: 'user_id,week_start' })
          .select('id')
          .single()

        if (tsErr || !ts) { failed++; console.error(tsErr); continue }

        // Notify org managers
        const profile = member.profiles as unknown as { full_name: string | null; email: string } | null
        const employeeName = profile?.full_name || profile?.email || 'An employee'
        await sendTimesheetSubmissionAlert(service, org.id, employeeName, weekStartStr, totalSeconds)
        submitted++
      } catch (err) {
        failed++
        console.error(err)
      }
    }
  }

  return NextResponse.json({ ok: true, submitted, skipped, failed, date: toDateStr(now) })
}
