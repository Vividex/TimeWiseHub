import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendTimesheetSubmissionAlert } from '@/lib/email-notifications'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { timesheetId?: string } | null
  if (!body?.timesheetId) return NextResponse.json({ error: 'Missing timesheetId' }, { status: 400 })

  const service = createServiceClient()
  const { data: ts, error } = await service
    .from('timesheets')
    .select('id, org_id, week_start, total_seconds, profiles!timesheets_user_id_fkey(full_name, email)')
    .eq('id', body.timesheetId)
    .eq('user_id', user.id)
    .single()

  if (error || !ts) return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
  if (!ts.org_id) return NextResponse.json({ ok: true, skipped: true })

  const profile = ts.profiles as unknown as { full_name: string | null; email: string } | null
  const employeeName = profile?.full_name || profile?.email || 'An employee'

  try {
    await sendTimesheetSubmissionAlert(service, ts.org_id, employeeName, ts.week_start, ts.total_seconds)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Notification failed' }, { status: 500 })
  }
}
