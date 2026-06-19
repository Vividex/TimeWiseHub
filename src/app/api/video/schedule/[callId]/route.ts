import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendEmail } from '@/lib/email-notifications'

const DAILY_API = 'https://api.daily.co/v1'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function formatCallTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney',
  })
}

async function resolveUser(callId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, call: null, membership: null }

  const service = createServiceClient()
  const { data: call } = await service
    .from('scheduled_calls')
    .select('id, title, starts_at, ends_at, daily_room_name, org_id, created_by')
    .eq('id', callId)
    .maybeSingle()

  if (!call) return { user, call: null, membership: null }

  const { data: membership } = await service
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', (call as unknown as { org_id: string }).org_id)
    .maybeSingle()

  return { user, call, membership }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params
  const { user, call, membership } = await resolveUser(callId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!call || !membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const service = createServiceClient()
  const { data: invitees } = await service
    .from('call_invitees')
    .select('email, display_name')
    .eq('call_id', callId)

  return NextResponse.json({
    call,
    invitees: (invitees ?? []) as { email: string; display_name: string | null }[],
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params
  const { user, call, membership } = await resolveUser(callId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  const c = call as unknown as {
    id: string; title: string; starts_at: string | null; org_id: string; created_by: string
  }

  const canInvite = c.created_by === user.id ||
    ['owner', 'admin', 'manager'].includes((membership as { role: string } | null)?.role ?? '')
  if (!canInvite) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const { email, displayName } = await req.json() as { email: string; displayName?: string }
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const service = createServiceClient()

  // Check if already invited
  const { data: existing } = await service
    .from('call_invitees').select('id').eq('call_id', callId).eq('email', email).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Already invited' }, { status: 409 })

  // Look up if they're an org member so we can set user_id and use the dashboard join link
  const { data: memberProfile } = await service
    .from('profiles').select('id').eq('email', email).maybeSingle()
  const userId = (memberProfile as unknown as { id: string } | null)?.id ?? null

  const { data: inviteeRow } = await service
    .from('call_invitees')
    .insert({ call_id: callId, user_id: userId, email, display_name: displayName ?? null })
    .select('guest_token')
    .single()

  const guestToken = (inviteeRow as unknown as { guest_token: string } | null)?.guest_token
  const joinUrl = userId
    ? `${APP_URL}/dashboard/video/${callId}`
    : `${APP_URL}/join/${guestToken}`

  const { data: organiserProfile } = await service
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const organiserName = (organiserProfile as unknown as { full_name: string | null } | null)?.full_name ?? 'A team member'

  const timeLabel = c.starts_at ? formatCallTime(c.starts_at) : 'TBD'
  const subject = `${organiserName} invited you to a call: ${c.title}`
  const html = `
    <p>Hi ${displayName ?? email},</p>
    <p><strong>${organiserName}</strong> has invited you to a video call: <strong>${c.title}</strong></p>
    <p>When: ${timeLabel}</p>
    <p><a href="${joinUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">Join call</a></p>
    <p style="color:#888;font-size:12px">Or paste this link: ${joinUrl}</p>
  `
  const text = `${organiserName} invited you to: ${c.title}\nWhen: ${timeLabel}\nJoin: ${joinUrl}`

  await sendEmail({ to: email, subject, text, html })

  return NextResponse.json({ email, display_name: displayName ?? null })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params
  const { user, call, membership } = await resolveUser(callId)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  const c = call as unknown as {
    id: string; title: string; starts_at: string | null
    daily_room_name: string | null; org_id: string; created_by: string
  }

  const canCancel = c.created_by === user.id ||
    ['owner', 'admin', 'manager'].includes((membership as { role: string } | null)?.role ?? '')
  if (!canCancel) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const service = createServiceClient()

  const { data: organiserProfile } = await service
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const organiserName = (organiserProfile as unknown as { full_name: string | null } | null)?.full_name ?? 'The organiser'

  const { data: invitees } = await service
    .from('call_invitees').select('email, display_name').eq('call_id', callId)

  const timeLabel = c.starts_at ? formatCallTime(c.starts_at) : 'TBD'

  await Promise.allSettled(
    (invitees ?? []).map((inv: { email: string; display_name: string | null }) => {
      const subject = `Cancelled: ${c.title}`
      const html = `
        <p>Hi ${inv.display_name ?? inv.email},</p>
        <p>The following call has been cancelled by <strong>${organiserName}</strong>:</p>
        <p><strong>${c.title}</strong><br/>Originally scheduled: ${timeLabel}</p>
        <p style="color:#888;font-size:12px">You do not need to take any action.</p>
      `
      const text = `Cancelled: ${c.title}\nOriginally scheduled: ${timeLabel}\nCancelled by: ${organiserName}`
      return sendEmail({ to: inv.email, subject, text, html })
    })
  )

  if (c.daily_room_name) {
    await fetch(`${DAILY_API}/rooms/${c.daily_room_name}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}` },
    }).catch(() => {})
  }

  await service.from('scheduled_calls').delete().eq('id', callId)

  return NextResponse.json({ ok: true })
}
