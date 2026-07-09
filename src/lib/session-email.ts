import { createServiceClient } from '@/lib/supabase-service'
import { getSubscription, isPaidPlan } from '@/lib/subscription'
import { invoiceLetterhead, invoiceLogo } from '@/lib/invoice-letterhead'
import { buildReplyToAddress } from '@/lib/client-messages'
import { sendEmail, paragraph } from '@/lib/email-notifications'
import type { SessionSeriesInterval } from '@/lib/sessions/series'
import type { SupabaseClient } from '@supabase/supabase-js'

const CADENCE_LABEL: Record<SessionSeriesInterval, string> = {
  weekly: 'every week',
  fortnightly: 'every 2 weeks',
  monthly: 'every month',
}

function formatSessionTime(iso: string) {
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

type ClientRow = { id: string; org_id: string | null; owner_id: string; email: string | null }

async function resolveClient(service: SupabaseClient, clientId: string): Promise<ClientRow | null> {
  const { data } = await service
    .from('clients')
    .select('id, org_id, owner_id, email')
    .eq('id', clientId)
    .maybeSingle()
  return (data as ClientRow | null) ?? null
}

async function resolveSender(
  service: SupabaseClient,
  ownerId: string,
  orgId: string | null,
): Promise<{ senderName: string; logoUrl: string | null } | null> {
  const [{ data: profile }, { data: organisation }, subscription] = await Promise.all([
    service.from('profiles').select('full_name, email, invoice_letterhead, logo_url').eq('id', ownerId).maybeSingle(),
    orgId
      ? service.from('organisations').select('name, invoice_letterhead, logo_url').eq('id', orgId).maybeSingle()
      : Promise.resolve({ data: null }),
    getSubscription(ownerId),
  ])

  if (!isPaidPlan(subscription)) return null

  return {
    senderName: invoiceLetterhead({ profile, organisation, subscription }),
    logoUrl: invoiceLogo({ profile, organisation, subscription }),
  }
}

function buildEmail({
  senderName,
  logoUrl,
  lines,
}: {
  senderName: string
  logoUrl: string | null
  lines: string[]
}) {
  const reassurance = `You can reply directly to this email — it'll come straight to ${senderName}.`
  const allLines = [...lines, reassurance]
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="" style="max-height:60px;max-width:200px;object-fit:contain;display:block;margin-bottom:16px;" />`
    : ''
  return {
    text: allLines.join('\n\n'),
    html: `${logoHtml}${paragraph(allLines)}`,
  }
}

/** Best-effort, business-branded confirmation email for a single one-off session booking. */
export async function sendSessionScheduledEmail(sessionId: string): Promise<void> {
  try {
    const service = createServiceClient()

    const { data: session } = await service
      .from('sessions')
      .select('id, title, scheduled_at, duration_minutes, subject_id, client_id')
      .eq('id', sessionId)
      .maybeSingle()
    if (!session) return

    const client = await resolveClient(service, session.client_id)
    if (!client?.email) return

    const sender = await resolveSender(service, client.owner_id, client.org_id)
    if (!sender) return

    let subjectName: string | null = null
    if (session.subject_id) {
      const { data: subject } = await service
        .from('subjects')
        .select('name')
        .eq('id', session.subject_id)
        .maybeSingle()
      subjectName = subject?.name ?? null
    }

    const when = formatSessionTime(session.scheduled_at)
    const { text, html } = buildEmail({
      senderName: sender.senderName,
      logoUrl: sender.logoUrl,
      lines: [
        `Your session "${session.title}" is confirmed for ${when}.`,
        `Duration: ${session.duration_minutes} minutes.`,
        subjectName ? `Subject: ${subjectName}.` : '',
      ].filter(Boolean),
    })

    await sendEmail({
      to: client.email,
      subject: `Session confirmed — ${when}`,
      text,
      html,
      fromName: sender.senderName,
      fromEmail: process.env.RESEND_MESSAGING_FROM_EMAIL,
      replyTo: buildReplyToAddress(client.id, sender.senderName),
    })
  } catch (err) {
    console.error('sendSessionScheduledEmail failed:', err)
  }
}

/** Best-effort, business-branded confirmation email sent once when a recurring series is created. */
export async function sendSeriesScheduledEmail(seriesId: string): Promise<void> {
  try {
    const service = createServiceClient()

    const { data: series } = await service
      .from('session_series')
      .select('id, client_id, title, duration_minutes, recurrence_interval')
      .eq('id', seriesId)
      .maybeSingle()
    if (!series) return

    const { data: firstSession } = await service
      .from('sessions')
      .select('scheduled_at')
      .eq('series_id', seriesId)
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!firstSession) return

    const client = await resolveClient(service, series.client_id)
    if (!client?.email) return

    const sender = await resolveSender(service, client.owner_id, client.org_id)
    if (!sender) return

    const when = formatSessionTime(firstSession.scheduled_at)
    const cadence = CADENCE_LABEL[series.recurrence_interval as SessionSeriesInterval] ?? 'on a recurring basis'
    const { text, html } = buildEmail({
      senderName: sender.senderName,
      logoUrl: sender.logoUrl,
      lines: [
        `Your recurring session "${series.title}" is confirmed, starting ${when}, then ${cadence}.`,
        `Duration: ${series.duration_minutes} minutes.`,
      ],
    })

    await sendEmail({
      to: client.email,
      subject: 'Your recurring session is confirmed',
      text,
      html,
      fromName: sender.senderName,
      fromEmail: process.env.RESEND_MESSAGING_FROM_EMAIL,
      replyTo: buildReplyToAddress(client.id, sender.senderName),
    })
  } catch (err) {
    console.error('sendSeriesScheduledEmail failed:', err)
  }
}
