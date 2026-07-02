import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import TimeSection from '@/components/time/TimeSection'
import TimeSummary from '@/components/time/TimeSummary'
import ManagerTimeView from '@/components/time/ManagerTimeView'
import TimesheetSection from '@/components/time/TimesheetSection'
import ManagerTimesheetView from '@/components/time/ManagerTimesheetView'
import { getSubscription, isTeamPlan } from '@/lib/subscription'

function tzSuffix(timezone: string, at: Date = new Date()): string {
  const raw = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' })
    .formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+0'
  const sign = raw.includes('-') ? '-' : '+'
  const [h = '0', m = '0'] = raw.replace('GMT', '').replace('+', '').replace('-', '').split(':')
  return `${sign}${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

function localMidnight(timezone: string, offsetDays = 0): string {
  const now = new Date()
  const date = new Date(now.toLocaleDateString('en-CA', { timeZone: timezone }))
  date.setDate(date.getDate() + offsetDays)
  const dateStr = date.toISOString().slice(0, 10)
  return new Date(`${dateStr}T00:00:00${tzSuffix(timezone)}`).toISOString()
}

function getWeekStartStr(timezone: string, weekStartDay: number): string {
  const now = new Date()
  const localDate = now.toLocaleDateString('en-CA', { timeZone: timezone })
  const d = new Date(localDate + 'T12:00:00Z')
  const day = d.getUTCDay() // 0=Sun … 6=Sat
  const diff = (day - weekStartDay + 7) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}

export default async function TimePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('timezone').eq('id', user.id).maybeSingle()
  const timezone = profile?.timezone ?? 'UTC'

  const todayStart = localMidnight(timezone)
  const tz = tzSuffix(timezone)

  const { data: membership } = await supabase
    .from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle()

  const orgId = membership?.org_id ?? null
  let weekStartDay = 1
  if (orgId) {
    const { data: orgSettings } = await supabase
      .from('organisations').select('pay_week_start_day').eq('id', orgId).maybeSingle()
    weekStartDay = orgSettings?.pay_week_start_day ?? 1
  }

  const weekStartDayStr = getWeekStartStr(timezone, weekStartDay)
  const weekEndDay = new Date(weekStartDayStr + 'T12:00:00Z')
  weekEndDay.setUTCDate(weekEndDay.getUTCDate() + 7)
  const weekStart = new Date(`${weekStartDayStr}T00:00:00${tz}`).toISOString()
  const weekEnd = new Date(`${weekEndDay.toISOString().slice(0, 10)}T00:00:00${tz}`).toISOString()
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone })

  function shiftSeconds(startTime: string, endTime: string): number {
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) * 60)
  }

  const [
    { data: todayEntries },
    { data: weekEntries },
    { data: activeEntry },
    { data: timesheet },
    subscription,
    { data: todayRosterShifts },
    { data: weekRosterShifts },
  ] = await Promise.all([
    supabase.from('time_entries').select('*, tasks(title)').eq('user_id', user.id).gte('started_at', todayStart).order('started_at', { ascending: false }),
    supabase.from('time_entries').select('duration_seconds').eq('user_id', user.id).gte('started_at', weekStart).lt('started_at', weekEnd).not('ended_at', 'is', null),
    supabase.from('time_entries').select('*, tasks(title)').eq('user_id', user.id).is('ended_at', null).maybeSingle(),
    supabase.from('timesheets').select('id, status, total_seconds, review_note').eq('user_id', user.id).eq('week_start', weekStartDayStr).maybeSingle(),
    getSubscription(user.id),
    supabase.from('roster_shifts').select('start_time, end_time').eq('user_id', user.id).eq('date', todayStr).eq('published', true).is('deleted_at', null),
    supabase.from('roster_shifts').select('start_time, end_time').eq('user_id', user.id).gte('date', weekStartDayStr).lte('date', todayStr).eq('published', true).is('deleted_at', null),
  ])

  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)
  const rosterManaged = isTeamPlan(subscription) && !!orgId

  const entryTodaySeconds = (todayEntries ?? []).filter(e => e.duration_seconds).reduce((sum: number, e: { duration_seconds: number }) => sum + e.duration_seconds, 0)
  const entryWeekSeconds = (weekEntries ?? []).reduce((sum: number, e: { duration_seconds: number | null }) => sum + (e.duration_seconds ?? 0), 0)
  const rosterTodaySeconds = (todayRosterShifts ?? []).reduce((sum, s) => sum + shiftSeconds(s.start_time, s.end_time), 0)
  const rosterWeekSeconds = (weekRosterShifts ?? []).reduce((sum, s) => sum + shiftSeconds(s.start_time, s.end_time), 0)

  const todaySeconds = rosterManaged ? rosterTodaySeconds + entryTodaySeconds : entryTodaySeconds
  const weekSeconds = rosterManaged ? rosterWeekSeconds + entryWeekSeconds : entryWeekSeconds

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <TimeSummary todaySeconds={todaySeconds} weekSeconds={weekSeconds} />
        <TimeSection activeEntry={activeEntry} initialEntries={todayEntries ?? []} userId={user.id} rosterManaged={rosterManaged} />
        <TimesheetSection
          userId={user.id}
          orgId={orgId}
          weekStart={weekStartDayStr}
          totalSeconds={weekSeconds}
          initialTimesheet={timesheet ?? null}
          rosterManaged={rosterManaged}
        />
        {isManager && orgId && (
          <>
            <ManagerTimeView orgId={orgId} />
            <ManagerTimesheetView orgId={orgId} />
          </>
        )}
      </div>
    </div>
  )
}
