import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import TimeSection from '@/components/time/TimeSection'
import TimeSummary from '@/components/time/TimeSummary'
import ManagerTimeView from '@/components/time/ManagerTimeView'
import TimesheetSection from '@/components/time/TimesheetSection'
import ManagerTimesheetView from '@/components/time/ManagerTimesheetView'

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

function getMondayDateStr(timezone: string): string {
  const now = new Date()
  const localDate = now.toLocaleDateString('en-CA', { timeZone: timezone }) // YYYY-MM-DD
  // Use noon UTC to safely manipulate the date without DST edge cases
  const d = new Date(localDate + 'T12:00:00Z')
  const day = d.getUTCDay() // 0=Sun, 1=Mon … 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

export default async function TimePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('timezone').eq('id', user.id).maybeSingle()
  const timezone = profile?.timezone ?? 'UTC'

  const todayStart = localMidnight(timezone)
  const weekStartDay = getMondayDateStr(timezone)
  const tz = tzSuffix(timezone)
  const weekStart = new Date(`${weekStartDay}T00:00:00${tz}`).toISOString()
  const weekEndDay = new Date(weekStartDay + 'T12:00:00Z')
  weekEndDay.setUTCDate(weekEndDay.getUTCDate() + 7)
  const weekEnd = new Date(`${weekEndDay.toISOString().slice(0, 10)}T00:00:00${tz}`).toISOString()

  const [
    { data: todayEntries },
    { data: weekEntries },
    { data: activeEntry },
    { data: membership },
    { data: timesheet },
  ] = await Promise.all([
    supabase.from('time_entries').select('*, tasks(title)').eq('user_id', user.id).gte('started_at', todayStart).order('started_at', { ascending: false }),
    supabase.from('time_entries').select('duration_seconds').eq('user_id', user.id).gte('started_at', weekStart).lt('started_at', weekEnd).not('ended_at', 'is', null),
    supabase.from('time_entries').select('*, tasks(title)').eq('user_id', user.id).is('ended_at', null).maybeSingle(),
    supabase.from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('timesheets').select('id, status, total_seconds, review_note').eq('user_id', user.id).eq('week_start', weekStartDay).maybeSingle(),
  ])

  const todaySeconds = (todayEntries ?? []).filter(e => e.duration_seconds).reduce((sum: number, e: { duration_seconds: number }) => sum + e.duration_seconds, 0)
  const weekSeconds = (weekEntries ?? []).reduce((sum: number, e: { duration_seconds: number | null }) => sum + (e.duration_seconds ?? 0), 0)
  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <TimeSummary todaySeconds={todaySeconds} weekSeconds={weekSeconds} />
        <TimeSection activeEntry={activeEntry} initialEntries={todayEntries ?? []} userId={user.id} />
        <TimesheetSection
          userId={user.id}
          orgId={membership?.org_id ?? null}
          weekStart={weekStartDay}
          totalSeconds={weekSeconds}
          initialTimesheet={timesheet ?? null}
        />
        {isManager && membership?.org_id && (
          <>
            <ManagerTimeView orgId={membership.org_id} />
            <ManagerTimesheetView orgId={membership.org_id} />
          </>
        )}
      </div>
    </div>
  )
}
