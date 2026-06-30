import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leaveId } = await req.json()
  if (!leaveId) return NextResponse.json({ error: 'Missing leaveId' }, { status: 400 })

  const service = createServiceClient()

  const { data: leave, error: fetchErr } = await service
    .from('leave_requests')
    .select('id, org_id')
    .eq('id', leaveId)
    .single()

  if (fetchErr || !leave) return NextResponse.json({ error: 'Leave record not found' }, { status: 404 })

  const { data: membership } = await service
    .from('organisation_members')
    .select('role')
    .eq('org_id', leave.org_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: deleteErr } = await service
    .from('leave_requests')
    .delete()
    .eq('id', leaveId)

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
