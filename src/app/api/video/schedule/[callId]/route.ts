import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendEmail } from '@/lib/email-notifications'

const DAILY_API = 'https://api.daily.co/v1'

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
