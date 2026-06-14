import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendEmail } from '@/lib/email-notifications'

const DAILY_API = 'https://api.daily.co/v1'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

type Invitee = {
  userId?: string | null
  email: string
  displayName?: string
}

type SchedulePayload = {
  org_id?: string
  title?: string
  starts_at?: string
  ends_at?: string
  invitees?: Invitee[]
}

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

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { org_id: orgId, title, starts_at: startsAt, ends_at: endsAt, invitees = [] } =
    (await req.json()) as SchedulePayload

  if (!orgId || !title || !startsAt || !endsAt) {
    return NextResponse.json({ error: 'org_id, title, starts_at, ends_at required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: membership } = await service
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner/admin/manager only' }, { status: 403 })
  }

  const { data: profile } = await service
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const organiserName = (profile as unknown as { full_name: string | null } | null)?.full_name ?? 'A team member'

  const endsAtMs = new Date(endsAt).getTime()
  const exp = Math.floor(endsAtMs / 1000) + 60 * 60 // 1h after ends_at

  const roomRes = await fetch(`${DAILY_API}/rooms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties: { exp } }),
  })
  if (!roomRes.ok) {
    const text = await roomRes.text()
    return NextResponse.json({ error: `Daily.co room creation failed: ${text}` }, { status: 502 })
  }
  const room = (await roomRes.json()) as { name: string; url: string }

  const { data: call, error: callError } = await service
    .from('scheduled_calls')
    .insert({
      org_id: orgId,
      title,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by: user.id,
      daily_room_name: room.name,
      room_url: room.url,
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

  const timeLabel = formatCallTime(startsAt)

  await Promise.all(
    invitees.map(async (inv) => {
      const { data: inviteeRow } = await service
        .from('call_invitees')
        .insert({
          call_id: call.id,
          user_id: inv.userId ?? null,
          email: inv.email,
          display_name: inv.displayName ?? null,
        })
        .select('guest_token')
        .single()

      const guestToken = (inviteeRow as unknown as { guest_token: string } | null)?.guest_token
      const isExternal = !inv.userId
      const joinUrl = isExternal
        ? `${APP_URL}/join/${guestToken}`
        : `${APP_URL}/dashboard/video/${call.id}`

      const subject = `${organiserName} invited you to a call: ${title}`
      const html = `
        <p>Hi ${inv.displayName ?? inv.email},</p>
        <p><strong>${organiserName}</strong> has scheduled a video call: <strong>${title}</strong></p>
        <p>When: ${timeLabel}</p>
        <p><a href="${joinUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">Join call</a></p>
        <p style="color:#888;font-size:12px">Or paste this link: ${joinUrl}</p>
      `
      const text = `${organiserName} invited you to a call: ${title}\nWhen: ${timeLabel}\nJoin: ${joinUrl}`

      await sendEmail({ to: inv.email, subject, text, html })
    })
  )

  return NextResponse.json({ callId: call.id, roomUrl: room.url })
}
