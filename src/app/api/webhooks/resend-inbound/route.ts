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
    console.error('[resend-inbound] missing signature material', {
      hasId: !!id, hasTimestamp: !!timestamp, hasSignature: !!signatureHeader, hasSecret: !!secret,
    })
    return NextResponse.json({ error: 'Missing signature headers or secret' }, { status: 400 })
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(ageSeconds) || ageSeconds > FIVE_MINUTES_SECONDS) {
    console.error('[resend-inbound] timestamp out of tolerance', { timestamp, ageSeconds })
    return NextResponse.json({ error: 'Timestamp out of tolerance' }, { status: 400 })
  }

  const valid = verifyResendWebhookSignature({ id, timestamp, signatureHeader, rawBody, secret })
  if (!valid) {
    console.error('[resend-inbound] invalid signature', { id, timestamp })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody) as {
    type: string
    data: { email_id: string; to: string[]; from: string }
  }

  if (payload.type !== 'email.received') {
    console.info('[resend-inbound] ignoring non-email.received event', { type: payload.type })
    return NextResponse.json({ ok: true })
  }

  const toAddress = payload.data.to.find(addr => parseClientIdFromAddress(addr))
  const clientId = toAddress ? parseClientIdFromAddress(toAddress) : null
  if (!clientId) {
    console.error('[resend-inbound] no client id found in "to" addresses', { to: payload.data.to })
    return NextResponse.json({ ok: true })
  }

  // The main RESEND_API_KEY is a "sending_access"-only restricted key (used everywhere else in
  // this app) — reading a received email is a different permission scope and needs its own
  // full_access key, kept separate rather than widening the send key's permissions app-wide.
  const resendReceivingApiKey = process.env.RESEND_RECEIVING_API_KEY
  if (!resendReceivingApiKey) return NextResponse.json({ error: 'RESEND_RECEIVING_API_KEY not configured' }, { status: 500 })

  const emailRes = await fetch(`https://api.resend.com/emails/receiving/${payload.data.email_id}`, {
    headers: { Authorization: `Bearer ${resendReceivingApiKey}` },
  })
  if (!emailRes.ok) {
    console.error('[resend-inbound] failed to fetch received email body', { status: emailRes.status, emailId: payload.data.email_id })
    return NextResponse.json({ error: 'Failed to fetch received email' }, { status: 502 })
  }
  const email = await emailRes.json() as { text: string | null; html: string | null }
  const body = email.text?.trim() || email.html?.trim() || '(empty message)'

  const service = createServiceClient()
  const { data: client } = await service
    .from('clients').select('id, org_id, owner_id, name').eq('id', clientId).maybeSingle()
  if (!client) {
    console.error('[resend-inbound] no client found for parsed id', { clientId })
    return NextResponse.json({ ok: true })
  }

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
