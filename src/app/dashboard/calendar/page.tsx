import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import CalendarView from '@/components/calendar/CalendarView'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  // Fetch all data sources for the calendar
  const [{ data: events }, { data: projects }, { data: tasks }] = await Promise.all([
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
  ])

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <CalendarView
          userId={user.id}
          orgId={membership?.org_id ?? null}
          initialEvents={events ?? []}
          projects={projects ?? []}
          tasks={tasks ?? []}
        />
      </div>
    </div>
  )
}
