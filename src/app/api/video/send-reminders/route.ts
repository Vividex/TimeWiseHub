import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendEmail } from '@/lib/email-notifications'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const CRON_SECRET = '484975b6-1f16-484a-a991-5f51b963a32f'

function formatCallTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Australia/Sydney',
  })
}

export async function GET(req: Request) {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const now = new Date()
  const tenMin = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
  const twentyMin = new Date(now.getTime() + 20 * 60 * 1000).toISOString()

  const { data: calls } = await service
    .from('scheduled_calls')
    .select('id, title, starts_at, daily_room_name')
    .gte('starts_at', tenMin)
    .lte('starts_at', twentyMin)
    .eq('reminder_sent', false)

  if (!calls?.length) return NextResponse.json({ sent: 0 })

  let sent = 0
  for (const call of calls) {
    const { data: invitees } = await service
      .from('call_invitees')
      .select('email, display_name, user_id, guest_token')
      .eq('call_id', call.id)

    const timeLabel = formatCallTime(call.starts_at as string)

    await Promise.all(
      (invitees ?? []).map(async (inv: {
        email: string
        display_name: string | null
        user_id: string | null
        guest_token: string
      }) => {
        const isExternal = !inv.user_id
        const joinUrl = isExternal
          ? `${APP_URL}/join/${inv.guest_token}`
          : `${APP_URL}/dashboard/video/${call.id}`
        const subject = `Starting soon: ${call.title}`
        const html = `
          <p>Hi ${inv.display_name ?? inv.email},</p>
          <p>Your call <strong>${call.title}</strong> starts in about 15 minutes.</p>
          <p>When: ${timeLabel}</p>
          <p><a href="${joinUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">Join now</a></p>
        `
        const text = `${call.title} starts in ~15 minutes.\nJoin: ${joinUrl}`
        await sendEmail({ to: inv.email, subject, text, html })
      })
    )

    await service
      .from('scheduled_calls')
      .update({ reminder_sent: true })
      .eq('id', call.id)

    sent++
  }

  return NextResponse.json({ sent })
}
