import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import TimerWidget from '@/components/time/TimerWidget'
import ManualEntryForm from '@/components/time/ManualEntryForm'
import TimeEntryList from '@/components/time/TimeEntryList'
import TimeSummary from '@/components/time/TimeSummary'
import ManagerTimeView from '@/components/time/ManagerTimeView'
import TimesheetSection from '@/components/time/TimesheetSection'
import ManagerTimesheetView from '@/components/time/ManagerTimesheetView'

function getMonday(date: Date) {
  const monday = new Date(date)
  monday.setHours(0, 0, 0, 0)
  const day = monday.getDay()
  const diff = day === 0 ? -6 : 1 - day
  monday.setDate(monday.getDate() + diff)
  return monday
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

export default async function TimePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekStartDate = getMonday(now)
  const weekEndDate = new Date(weekStartDate)
  weekEndDate.setDate(weekStartDate.getDate() + 7)
  const weekStart = weekStartDate.toISOString()
  const weekEnd = weekEndDate.toISOString()
  const weekStartDay = toDateString(weekStartDate)

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
        <TimerWidget activeEntry={activeEntry} />
        <ManualEntryForm />
        <TimeEntryList initialEntries={todayEntries ?? []} userId={user.id} />
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
