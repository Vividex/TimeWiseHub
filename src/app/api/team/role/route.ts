import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

const ASSIGNABLE_ROLES = ['admin', 'manager', 'employee'] as const

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { target_user_id, org_id, new_role } = await req.json() as {
    target_user_id?: string; org_id?: string; new_role?: string
  }

  if (!target_user_id || !org_id || !new_role) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(new_role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  if (target_user_id === user.id) {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
  }

  const { data: callerMembership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).eq('org_id', org_id).maybeSingle()

  if (callerMembership?.role !== 'owner') {
    return NextResponse.json({ error: 'Only the org owner can change roles' }, { status: 403 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('organisation_members')
    .update({ role: new_role })
    .eq('user_id', target_user_id)
    .eq('org_id', org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
