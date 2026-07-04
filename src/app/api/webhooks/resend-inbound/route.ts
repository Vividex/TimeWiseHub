import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { verifyResendWebhookSignature } from '@/lib/resend-webhook'
import { parseClientIdFromAddress } from '@/lib/client-messages'
import { sendPushToUser } from '@/lib/push'

const FIVE_MINUTES_SECONDS = 5 * 60

export async function POST(req: Request) {
  const rawBody = await req.text()
  const id = req.headers.get('svix-id')
  const timestamp = req.headers.get('svix-timestamp')
  const signatureHeader = req.headers.get('svix-signature')
  const secret = process.env.RESEND_WEBHOOK_SECRET

  if (!id || !timestamp || !signatureHeader || !secret) {
    return NextResponse.json({ error: 'Missing signature headers or secret' }, { status: 400 })
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(ageSeconds) || ageSeconds > FIVE_MINUTES_SECONDS) {
    return NextResponse.json({ error: 'Timestamp out of tolerance' }, { status: 400 })
  }

  const valid = verifyResendWebhookSignature({ id, timestamp, signatureHeader, rawBody, secret })
  if (!valid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  const payload = JSON.parse(rawBody) as {
    type: string
    data: { email_id: string; to: string[]; from: string }
  }

  if (payload.type !== 'email.received') return NextResponse.json({ ok: true })

  const toAddress = payload.data.to.find(addr => parseClientIdFromAddress(addr))
  const clientId = toAddress ? parseClientIdFromAddress(toAddress) : null
  if (!clientId) return NextResponse.json({ ok: true })

  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })

  const emailRes = await fetch(`https://api.resend.com/emails/receiving/${payload.data.email_id}`, {
    headers: { Authorization: `Bearer ${resendApiKey}` },
  })
  if (!emailRes.ok) return NextResponse.json({ error: 'Failed to fetch received email' }, { status: 502 })
  const email = await emailRes.json() as { text: string | null; html: string | null }
  const body = email.text?.trim() || email.html?.trim() || '(empty message)'

  const service = createServiceClient()
  const { data: client } = await service
    .from('clients').select('id, org_id, owner_id, name').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ ok: true })

  await service
    .from('client_messages')
    .insert({ client_id: client.id, org_id: client.org_id, direction: 'inbound', body, sender_user_id: null })

  // Notification recipients: org managers/admins/owner for an org-owned client, or just the
  // client's own owner for a solo Pro user (clients.org_id is nullable).
  let recipientIds: string[]
  if (client.org_id) {
    const { data: recipients } = await service
      .from('organisation_members').select('user_id')
      .eq('org_id', client.org_id).in('role', ['owner', 'admin', 'manager'])
    recipientIds = (recipients ?? []).map(r => r.user_id)
  } else {
    recipientIds = [client.owner_id]
  }

  for (const userId of recipientIds) {
    sendPushToUser(userId, {
      title: `New reply from ${client.name}`,
      body: body.slice(0, 120),
      url: `/dashboard/clients/${client.id}/messages`,
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
