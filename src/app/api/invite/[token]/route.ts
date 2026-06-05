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
