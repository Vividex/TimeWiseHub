import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import { sendEmail } from '@/lib/email-notifications'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

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

  const [{ data: membership }, { data: orgRow }, { data: inviterProfile }] = await Promise.all([
    service.from('organisation_members').select('role').eq('user_id', user.id).eq('org_id', orgId).maybeSingle(),
    service.from('organisations').select('name').eq('id', orgId).maybeSingle(),
    service.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
  ])

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only owners and admins can invite members' }, { status: 403 })
  }

  const token = randomUUID()

  const { error } = await service
    .from('invitations')
    .upsert(
      {
        org_id: orgId,
        email,
        role,
        invited_by: user.id,
        token,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
      },
      { onConflict: 'org_id,email' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const inviteLink = `${APP_URL}/invite/${token}`
  const orgName = orgRow?.name ?? 'an organisation'
  const inviterName = (inviterProfile?.full_name as string | null)?.trim() || user.email || 'Your admin'

  const lines = [
    `Hi there,`,
    `${inviterName} has invited you to join ${orgName} on TimeWiseHub as ${role}.`,
    `Click the link below to accept your invitation and set up your account. The link expires in 7 days.`,
    inviteLink,
    `If you weren't expecting this invitation, you can safely ignore this email.`,
  ]

  const htmlLines = [
    `<p>Hi there,</p>`,
    `<p>${escapeHtml(inviterName)} has invited you to join <strong>${escapeHtml(orgName)}</strong> on TimeWiseHub as <strong>${escapeHtml(role)}</strong>.</p>`,
    `<p>Click the link below to accept your invitation and set up your account. The link expires in 7 days.</p>`,
    `<p><a href="${inviteLink}" style="display:inline-block;background:#06b6d4;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Accept invitation</a></p>`,
    `<p style="color:#6b7280;font-size:12px;">Or copy this link: ${inviteLink}</p>`,
    `<p style="color:#6b7280;font-size:12px;">If you weren&apos;t expecting this invitation, you can safely ignore this email.</p>`,
  ]

  const emailResult = await sendEmail({
    to: email,
    subject: `You've been invited to join ${orgName} on TimeWiseHub`,
    text: lines.join('\n\n'),
    html: htmlLines.join(''),
  })

  return NextResponse.json({ token, emailSent: !('skipped' in emailResult) })
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
