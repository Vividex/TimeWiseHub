import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { canExportReports, getSubscription } from '@/lib/subscription'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subscription = await getSubscription(user.id)
  if (!canExportReports(subscription)) {
    return NextResponse.json({ error: 'Upgrade to Pro or Team to export data' }, { status: 402 })
  }

  const [
    { data: profile },
    { data: timeEntries },
    { data: expenses },
    { data: projects },
    { data: tasks },
    { data: activityLog },
  ] = await Promise.all([
    supabase.from('profiles').select('email, full_name, timezone, created_at').eq('id', user.id).single(),
    supabase.from('time_entries').select('started_at, ended_at, duration_seconds, description, created_at').eq('user_id', user.id).order('started_at', { ascending: false }),
    supabase.from('expenses').select('amount, currency, description, expense_date, status, created_at').eq('user_id', user.id).order('expense_date', { ascending: false }),
    supabase.from('projects').select('name, description, status, due_date, created_at').eq('owner_id', user.id).order('created_at', { ascending: false }),
    supabase.from('tasks').select('title, status, priority, due_date, notes, created_at').eq('assignee_id', user.id).order('created_at', { ascending: false }),
    supabase.from('activity_log').select('event_type, entity_type, metadata, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
  ])

  const exportData = {
    exported_at: new Date().toISOString(),
    user_id: user.id,
    profile,
    time_entries: timeEntries ?? [],
    expenses: expenses ?? [],
    projects: projects ?? [],
    tasks: tasks ?? [],
    activity_log: activityLog ?? [],
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="timewisehub-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
