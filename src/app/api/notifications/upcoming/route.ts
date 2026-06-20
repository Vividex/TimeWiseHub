import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendPushToUser } from '@/lib/push'
import { sendEmail } from '@/lib/email-notifications'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  // If no secret is configured, trust Vercel's infrastructure-level cron protection
  if (!secret) return true
  const auth = req.headers.get('authorization')
  const cronSecret = req.headers.get('x-cron-secret')
  return auth === `Bearer ${secret}` || cronSecret === secret
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney',
  })
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()
  const now = new Date()
  const windowStart = new Date(now.getTime() + 25 * 60 * 1000).toISOString()
  const windowEnd   = new Date(now.getTime() + 35 * 60 * 1000).toISOString()

  let pushed = 0
  let emailed = 0

  // ── Calendar events ──────────────────────────────────────────────────────
  const { data: events } = await service
    .from('calendar_events')
    .select('id, title, start_at, created_by')
    .eq('all_day', false)
    .eq('reminder_sent', false)
    .gte('start_at', windowStart)
    .lte('start_at', windowEnd)

  for (const event of (events ?? []) as { id: string; title: string; start_at: string; created_by: string }[]) {
    await sendPushToUser(event.created_by, {
      title: '30-minute reminder',
      body: `${event.title} starts at ${formatTime(event.start_at)}`,
      url: '/dashboard/calendar',
      tag: `event-reminder:${event.id}`,
    })
    await service.from('calendar_events').update({ reminder_sent: true }).eq('id', event.id)
    pushed++
  }

  // ── Scheduled calls ───────────────────────────────────────────────────────
  const { data: calls } = await service
    .from('scheduled_calls')
    .select('id, title, starts_at, daily_room_name')
    .eq('reminder_sent', false)
    .gte('starts_at', windowStart)
    .lte('starts_at', windowEnd)

  for (const call of (calls ?? []) as { id: string; title: string; starts_at: string; daily_room_name: string | null }[]) {
    const { data: invitees } = await service
      .from('call_invitees')
      .select('email, display_name, user_id, guest_token')
      .eq('call_id', call.id)

    for (const inv of (invitees ?? []) as { email: string; display_name: string | null; user_id: string | null; guest_token: string }[]) {
      if (inv.user_id) {
        await sendPushToUser(inv.user_id, {
          title: '30-minute reminder',
          body: `${call.title} starts at ${formatTime(call.starts_at)}`,
          url: `/dashboard/video/${call.id}`,
          tag: `call-reminder:${call.id}`,
        })
        pushed++
      } else {
        // External guest — email only
        const joinUrl = `${APP_URL}/join/${inv.guest_token}`
        await sendEmail({
          to: inv.email,
          subject: `Starting soon: ${call.title}`,
          text: `${call.title} starts in ~30 minutes.\nJoin: ${joinUrl}`,
          html: `<p>Hi ${inv.display_name ?? inv.email},</p>
<p>Your call <strong>${call.title}</strong> starts in about 30 minutes at ${formatTime(call.starts_at)}.</p>
<p><a href="${joinUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">Join now</a></p>`,
        })
        emailed++
      }
    }

    await service.from('scheduled_calls').update({ reminder_sent: true }).eq('id', call.id)
  }

  return NextResponse.json({ ok: true, pushed, emailed })
}
