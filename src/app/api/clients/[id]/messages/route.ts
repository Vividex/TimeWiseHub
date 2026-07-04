import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendEmail } from '@/lib/email-notifications'
import { buildReplyToAddress } from '@/lib/client-messages'
import { invoiceLetterhead, invoiceLogo } from '@/lib/invoice-letterhead'
import { getSubscription, isPaidPlan } from '@/lib/subscription'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { body } = await req.json() as { body?: string }
  if (!body?.trim()) return NextResponse.json({ error: 'Message is empty' }, { status: 400 })

  const service = createServiceClient()
  const { data: client } = await service
    .from('clients').select('id, org_id, owner_id, name, email').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  if (!client.email) {
    return NextResponse.json({ error: 'Add an email address to this client first.' }, { status: 400 })
  }

  // Access: org member (org-owned client) or the client's own owner (solo Pro, no org).
  if (client.org_id) {
    const { data: membership } = await supabase
      .from('organisation_members').select('role')
      .eq('user_id', user.id).eq('org_id', client.org_id).maybeSingle()
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } else if (client.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const subscription = await getSubscription(client.owner_id)
  if (!isPaidPlan(subscription)) {
    return NextResponse.json({ error: 'Upgrade to Pro to message clients.' }, { status: 403 })
  }

  const [{ data: profile }, { data: organisation }] = await Promise.all([
    service.from('profiles').select('full_name, email, invoice_letterhead, logo_url').eq('id', client.owner_id).maybeSingle(),
    client.org_id
      ? service.from('organisations').select('name, invoice_letterhead, logo_url').eq('id', client.org_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // Business identity is the "hero" of every client-facing surface here (From name, subject,
  // reply-to display name, logo) — TimeWiseHub's own domain/branding is kept to the invisible
  // minimum needed to actually deliver the email, per explicit product decision.
  const senderName = invoiceLetterhead({ profile, organisation, subscription })
  const logoUrl = invoiceLogo({ profile, organisation, subscription })

  const subject = `Message from ${senderName}`
  const reassurance = `You can reply directly to this email — it'll come straight to ${senderName}.`
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="" style="max-height:60px;max-width:200px;object-fit:contain;display:block;margin-bottom:16px;" />`
    : ''
  const html = `${logoHtml}<p>${body.replace(/\n/g, '<br>')}</p><p style="color:#888;font-size:12px">${reassurance}</p>`
  const text = `${body}\n\n${reassurance}`

  try {
    await sendEmail({
      to: client.email,
      subject,
      text,
      html,
      fromName: senderName,
      replyTo: buildReplyToAddress(client.id, senderName),
    })
  } catch (err) {
    return NextResponse.json({ error: `Failed to send: ${(err as Error).message}` }, { status: 502 })
  }

  const { data: inserted, error } = await supabase
    .from('client_messages')
    .insert({ client_id: client.id, org_id: client.org_id, direction: 'outbound', body, sender_user_id: user.id })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: inserted.id })
}
