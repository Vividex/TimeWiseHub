import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import TimerWidget from '@/components/time/TimerWidget'
import ManualEntryForm from '@/components/time/ManualEntryForm'
import TimeEntryList from '@/components/time/TimeEntryList'
import TimeSummary from '@/components/time/TimeSummary'
import ManagerTimeView from '@/components/time/ManagerTimeView'

export default async function TimePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString()

  const [{ data: todayEntries }, { data: weekEntries }, { data: activeEntry }, { data: membership }] = await Promise.all([
    supabase.from('time_entries').select('*').eq('user_id', user.id).gte('started_at', todayStart).order('started_at', { ascending: false }),
    supabase.from('time_entries').select('duration_seconds').eq('user_id', user.id).gte('started_at', weekStart).not('ended_at', 'is', null),
    supabase.from('time_entries').select('*').eq('user_id', user.id).is('ended_at', null).maybeSingle(),
    supabase.from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle(),
  ])

  const todaySeconds = (todayEntries ?? []).filter(e => e.duration_seconds).reduce((sum: number, e: { duration_seconds: number }) => sum + e.duration_seconds, 0)
  const weekSeconds = (weekEntries ?? []).reduce((sum: number, e: { duration_seconds: number }) => sum + (e.duration_seconds ?? 0), 0)
  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Time tracking</h1>
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">Back to dashboard</a>
        </div>

        <TimeSummary todaySeconds={todaySeconds} weekSeconds={weekSeconds} />
        <TimerWidget activeEntry={activeEntry} />
        <ManualEntryForm />
        <TimeEntryList initialEntries={todayEntries ?? []} userId={user.id} />
        {isManager && membership?.org_id && <ManagerTimeView orgId={membership.org_id} />}

      </div>
    </div>
  )
}
