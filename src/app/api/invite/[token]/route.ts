import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'

type InvitationRow = {
  id: string
  org_id: string
  email: string
  role: string
  expires_at: string
  organisations: { name: string } | null
}

type InvitationCore = {
  id: string
  org_id: string
  email: string
  role: string
  expires_at: string
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { password, fullName } = await req.json() as { password?: string; fullName?: string }
  if (!password) return NextResponse.json({ error: 'Password is required' }, { status: 400 })

  const service = createServiceClient()

  const { data: inv } = await service
    .from('invitations')
    .select('id, org_id, email, role, expires_at')
    .eq('token', token)
    .is('accepted_at', null)
    .maybeSingle<InvitationCore>()

  if (!inv) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  if (new Date(inv.expires_at) < new Date()) return NextResponse.json({ error: 'Invitation expired' }, { status: 410 })

  // Create the account server-side — email_confirm:true bypasses the confirmation email
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: inv.email,
    password,
    email_confirm: true,
    user_metadata: { account_type: 'personal' },
  })

  if (createError) return NextResponse.json({ error: createError.message }, { status: 400 })

  if (fullName?.trim()) {
    await service
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', created.user.id)
  }

  const { error: memberError } = await service
    .from('organisation_members')
    .insert({ org_id: inv.org_id, user_id: created.user.id, role: inv.role })

  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 400 })

  await service
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', inv.id)

  return NextResponse.json({ email: inv.email })
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  if (!token) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  }

  const service = createServiceClient()

  const { data, error } = await service
    .from('invitations')
    .select('id, org_id, email, role, expires_at, organisations(name)')
    .eq('token', token)
    .is('accepted_at', null)
    .maybeSingle<InvitationRow>()

  if (error) {
    console.error(error)
    return NextResponse.json({ error: 'Invitation lookup failed' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Invitation expired' }, { status: 410 })
  }

  return NextResponse.json({
    id: data.id,
    org_id: data.org_id,
    email: data.email,
    role: data.role,
    expires_at: data.expires_at,
    org_name: data.organisations?.name ?? 'Organisation',
  })
}
