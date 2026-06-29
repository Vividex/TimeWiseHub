import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

function shiftSeconds(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) * 60)
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ timesheetId: string }> }
) {
  const { timesheetId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: tsData } = await service
    .from('timesheets')
    .select('id, user_id, org_id, week_start, total_seconds, status')
    .eq('id', timesheetId)
    .maybeSingle()

  if (!tsData) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ts = tsData as unknown as {
    id: string; user_id: string; org_id: string
    week_start: string; total_seconds: number; status: string
  }

  // Caller must be a manager/admin/owner in the same org
  const { data: membershipData } = await service
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', ts.org_id)
    .maybeSingle()

  const role = (membershipData as unknown as { role: string } | null)?.role
  if (!role || !['owner', 'admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Employee profile
  const { data: profileData } = await service
    .from('profiles')
    .select('full_name, email')
    .eq('id', ts.user_id)
    .maybeSingle()

  const profile = profileData as unknown as { full_name: string | null; email: string } | null

  // Compute week end date (7 days after week_start)
  const weekEndDate = new Date(ts.week_start + 'T12:00:00Z')
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7)
  const weekEnd = weekEndDate.toISOString().slice(0, 10)

  // Published roster shifts for the week
  const { data: shiftsData } = await service
    .from('roster_shifts')
    .select('date, start_time, end_time')
    .eq('user_id', ts.user_id)
    .eq('published', true)
    .is('deleted_at', null)
    .gte('date', ts.week_start)
    .lt('date', weekEnd)
    .order('date')

  const rosterShifts = (shiftsData ?? []).map(s => {
    const sh = s as unknown as { date: string; start_time: string; end_time: string }
    return {
      date: sh.date,
      start_time: sh.start_time,
      end_time: sh.end_time,
      duration_seconds: shiftSeconds(sh.start_time, sh.end_time),
    }
  })

  const rosteredSeconds = rosterShifts.reduce((sum, s) => sum + s.duration_seconds, 0)

  // Completed time entries for the week
  const { data: entriesData } = await service
    .from('time_entries')
    .select('id, started_at, ended_at, duration_seconds, description, project_id, projects(name)')
    .eq('user_id', ts.user_id)
    .gte('started_at', `${ts.week_start}T00:00:00`)
    .lt('started_at', `${weekEnd}T00:00:00`)
    .not('ended_at', 'is', null)
    .order('started_at')

  const additionalEntries = (entriesData ?? []).map(e => {
    const en = e as unknown as {
      id: string; started_at: string; ended_at: string
      duration_seconds: number; description: string | null
      project_id: string | null; projects: { name: string } | null
    }
    return {
      id: en.id,
      started_at: en.started_at,
      ended_at: en.ended_at,
      duration_seconds: en.duration_seconds ?? 0,
      project_name: en.projects?.name ?? null,
      description: en.description,
    }
  })

  const additionalSeconds = additionalEntries.reduce((sum, e) => sum + e.duration_seconds, 0)
  const totalSeconds = rosteredSeconds + additionalSeconds
  const overtimeSeconds = Math.max(0, totalSeconds - 136800) // 38h

  return NextResponse.json({
    timesheet: {
      id: ts.id,
      user_id: ts.user_id,
      week_start: ts.week_start,
      total_seconds: ts.total_seconds,
      status: ts.status,
    },
    profile: { full_name: profile?.full_name ?? null, email: profile?.email ?? '' },
    roster_shifts: rosterShifts,
    additional_entries: additionalEntries,
    rostered_seconds: rosteredSeconds,
    additional_seconds: additionalSeconds,
    overtime_seconds: overtimeSeconds,
  })
}
