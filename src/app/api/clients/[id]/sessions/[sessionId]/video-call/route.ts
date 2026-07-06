import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendEmail } from '@/lib/email-notifications'
import { getSubscription, isTeamPlan } from '@/lib/subscription'

const DAILY_API = 'https://api.daily.co/v1'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function formatCallTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Australia/Sydney',
  })
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id, sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sub = await getSubscription(user.id)
  if (!isTeamPlan(sub)) return NextResponse.json({ error: 'Upgrade to Business to use video calls.' }, { status: 403 })

  const service = createServiceClient()

  const [{ data: session }, { data: client }] = await Promise.all([
    service.from('sessions').select('id, title, scheduled_at, duration_minutes, org_id, client_id')
      .eq('id', sessionId).eq('client_id', id).maybeSingle(),
    service.from('clients').select('id, name, email').eq('id', id).maybeSingle(),
  ])

  if (!session || !client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', session.org_id ?? '').maybeSingle()
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!client.email) {
    return NextResponse.json(
      { error: 'Add an email address to this client before scheduling a video call.' },
      { status: 400 },
    )
  }

  const { data: profile } = await service
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const organiserName = (profile as unknown as { full_name: string | null } | null)?.full_name ?? 'A team member'

  const startsAt = session.scheduled_at
  const endsAt = new Date(new Date(startsAt).getTime() + session.duration_minutes * 60 * 1000).toISOString()
  const endsAtMs = new Date(endsAt).getTime()
  const exp = Math.floor(endsAtMs / 1000) + 60 * 60 // 1h after ends_at

  const roomRes = await fetch(`${DAILY_API}/rooms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties: { exp, enable_transcription: true, enable_pip_ui: true } }),
  })
  if (!roomRes.ok) {
    const text = await roomRes.text()
    return NextResponse.json({ error: `Daily.co room creation failed: ${text}` }, { status: 502 })
  }
  const room = (await roomRes.json()) as { name: string; url: string }

  const { data: call, error: callError } = await service
    .from('scheduled_calls')
    .insert({
      org_id: session.org_id,
      title: session.title,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by: user.id,
      daily_room_name: room.name,
      room_url: room.url,
      session_id: sessionId,
    })
    .select('id')
    .single()

  if (callError || !call) {
    await fetch(`${DAILY_API}/rooms/${room.name}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}` },
    })
    return NextResponse.json({ error: 'Failed to save call' }, { status: 500 })
  }

  const { data: inviteeRow } = await service
    .from('call_invitees')
    .insert({ call_id: call.id, user_id: null, email: client.email, display_name: client.name })
    .select('guest_token')
    .single()

  const guestToken = (inviteeRow as unknown as { guest_token: string } | null)?.guest_token
  const joinUrl = `${APP_URL}/join/${guestToken}`
  const timeLabel = formatCallTime(startsAt)

  const subject = `${organiserName} invited you to a call: ${session.title}`
  const html = `
    <p>Hi ${client.name},</p>
    <p><strong>${organiserName}</strong> has scheduled a video call: <strong>${session.title}</strong></p>
    <p>When: ${timeLabel}</p>
    <p><a href="${joinUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">Join call</a></p>
    <p style="color:#888;font-size:12px">Or paste this link: ${joinUrl}</p>
  `
  const text = `${organiserName} invited you to a call: ${session.title}\nWhen: ${timeLabel}\nJoin: ${joinUrl}`

  await sendEmail({ to: client.email, subject, text, html })

  return NextResponse.json({ callId: call.id, roomUrl: room.url })
}
