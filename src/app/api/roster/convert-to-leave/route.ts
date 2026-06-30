import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { shiftId, leaveType, halfDay } = await req.json()
  if (!shiftId || !leaveType) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const service = createServiceClient()

  const { data: shift, error: shiftErr } = await service
    .from('roster_shifts')
    .select('id, org_id, user_id, date')
    .eq('id', shiftId)
    .single()

  if (shiftErr || !shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

  const { data: membership } = await service
    .from('organisation_members')
    .select('role')
    .eq('org_id', shift.org_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: leave, error: leaveErr } = await service
    .from('leave_requests')
    .insert({
      user_id: shift.user_id,
      org_id: shift.org_id,
      leave_type: leaveType,
      start_date: shift.date,
      end_date: shift.date,
      half_day: halfDay ?? false,
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      notes: 'Converted from roster shift',
    })
    .select()
    .single()

  if (leaveErr) return NextResponse.json({ error: leaveErr.message }, { status: 500 })

  const { error: deleteErr } = await service
    .from('roster_shifts')
    .delete()
    .eq('id', shiftId)

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  return NextResponse.json(leave)
}
