import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import CalendarView from '@/components/calendar/CalendarView'
import NudgeBanner from '@/components/NudgeBanner'
import { getAustralianPublicHolidays, type AustralianState } from '@/lib/australian-public-holidays'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const year = new Date().getFullYear()

  const [{ data: events }, { data: projects }, { data: tasks }, { data: leave }, { data: profile }, { data: sessions }] = await Promise.all([
    supabase.from('calendar_events')
      .select('*')
      .or(`created_by.eq.${user.id}${membership?.org_id ? `,org_id.eq.${membership.org_id}` : ''}`)
      .order('start_at'),
    supabase.from('projects')
      .select('id, name, colour, due_date')
      .not('due_date', 'is', null)
      .or(`owner_id.eq.${user.id}${membership?.org_id ? `,org_id.eq.${membership.org_id}` : ''}`),
    supabase.from('tasks')
      .select('id, title, due_date, priority, status, project_id')
      .eq('assignee_id', user.id)
      .not('due_date', 'is', null)
      .neq('status', 'done'),
    supabase.from('leave_requests')
      .select('id, leave_type, start_date, end_date, half_day, user_id')
      .eq('user_id', user.id)
      .eq('status', 'approved'),
    supabase.from('profiles')
      .select('au_state')
      .eq('id', user.id)
      .single(),
    supabase.from('sessions')
      .select('id, title, scheduled_at, status, client_id')
      .or(`created_by.eq.${user.id}${membership?.org_id ? `,org_id.eq.${membership.org_id}` : ''}`)
      .neq('status', 'completed'),
  ])

  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)

  const holidays = profile?.au_state
    ? [year - 1, year, year + 1].flatMap(holidayYear =>
      getAustralianPublicHolidays(holidayYear, profile.au_state as AustralianState).map(holiday => ({
        id: `public-holiday-${holiday.state}-${holiday.date}`,
        leave_type: 'public_holiday',
        start_date: holiday.date,
        end_date: holiday.date,
        half_day: false,
        user_id: user.id,
        holiday_name: holiday.name,
      })),
    )
    : []

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <NudgeBanner userId={user.id} />
        <CalendarView
          userId={user.id}
          orgId={membership?.org_id ?? null}
          initialEvents={events ?? []}
          projects={projects ?? []}
          tasks={tasks ?? []}
          leaveRequests={[...(leave ?? []), ...holidays]}
          sessions={sessions ?? []}
          projectLabel={terminology.project}
        />
      </div>
    </div>
  )
}
