import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { getSubscription, isTeamPlan } from '@/lib/subscription'

type InvitePayload = {
  org_id?: string
  email?: string
  role?: 'admin' | 'manager' | 'employee'
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subscription = await getSubscription(user.id)
  if (!isTeamPlan(subscription)) {
    return NextResponse.json({ error: 'Team plan required to invite members' }, { status: 402 })
  }

  const { org_id: orgId, email, role = 'employee' } = (await req.json()) as InvitePayload
  if (!orgId || !email) return NextResponse.json({ error: 'Organisation and email are required' }, { status: 400 })
  if (!['admin', 'manager', 'employee'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: membership } = await service
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only owners and admins can invite members' }, { status: 403 })
  }

  const { data, error } = await service
    .from('invitations')
    .insert({
      org_id: orgId,
      email,
      role,
      invited_by: user.id,
      token: randomUUID(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('token')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ token: data.token })
}
