# Client Email Messaging

## Goal
Let staff send and receive email with a client from inside a client's record — one running
thread, no client account required — by routing replies through a per-client address on a new
Resend receiving domain.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-04-client-email-messaging-design.md`
- Source plan: `docs/superpowers/plans/2026-07-04-client-email-messaging.md`
- Email only this phase — no SMS (needs a new paid Twilio account, deferred to its own phase).
- One thread per client. New ad-hoc messages only — existing automated emails (invoices,
  reminders, invites) are NOT retrofitted into this thread in this phase.
- No attachments — text only.
- New `client_messages` table — deliberately not reusing the room-chat `chat_*` infrastructure,
  which requires an authenticated participant; a client here never touches the app at all.
- Reply routing: `"{senderName}" <client-<clientId>@<RESEND_INBOUND_DOMAIN>>` as the `replyTo` on
  outbound sends — display-name-wrapped and quoted (RFC 5322) so a client inspecting the address
  sees a business name, not a cryptic string. Resend's `email.received` webhook is metadata-only —
  the real body needs a separate call to Resend's receiving-email API using the webhook's `email_id`.
- Webhook signature verification via Node's built-in `crypto` (Standard Webhooks spec) — no new
  npm dependency.
- **Business identity is the "hero," TimeWiseHub branding is minimized**: sender name, email
  subject, reply-to display name, and logo all resolve via the *existing*
  `invoiceLetterhead()`/`invoiceLogo()` helpers (`src/lib/invoice-letterhead.ts`) — Team plan → org
  name/logo, solo Pro → the individual's own name/logo, Free → falls back to literal
  "TimeWiseHub". That fallback is exactly why this feature is **gated to paid plans** (mirrors the
  existing invoice-emailing gate) — a Free user should never be able to trigger it.
- `clients.org_id` is nullable (solo Pro users have clients with no org) — `client_messages`
  mirrors that nullability and reuses the same dual org-member-or-owner RLS/access pattern already
  used on `clients` and `sessions`, rather than assuming every client belongs to an org.
- No schema changes needed beyond the one new table.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.
- All Tailwind classes must include `dark:` variants.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1 is conductor-only (DB migration via Supabase MCP).
- C-7 is mostly the user's own manual setup (Resend dashboard + DNS) — can proceed in parallel
  with C-1..C-6, doesn't block them.
- C-8 needs a real send→reply round trip and can't be verified until C-7 is fully done and
  deployed (webhooks need a public HTTPS URL, not localhost).

---

## C-1 — Database migration

*Conductor only (no Codex dispatch):*

`org_id` is nullable — `clients.org_id` is nullable too (solo Pro users have clients with no
org) — so the policies below mirror the existing dual org-member-or-owner pattern already used on
the `clients` and `sessions` tables, not a single org-only policy.

- [x] Create `supabase/schema-081-client-messages.sql`:
  ```sql
  create table public.client_messages (
    id             uuid primary key default gen_random_uuid(),
    client_id      uuid not null references public.clients on delete cascade,
    org_id         uuid references public.organisations on delete cascade,
    direction      text not null check (direction in ('outbound', 'inbound')),
    body           text not null,
    sender_user_id uuid references public.profiles on delete set null,
    created_at     timestamptz not null default now()
  );

  create index client_messages_client on public.client_messages (client_id, created_at);

  alter table public.client_messages enable row level security;

  create policy "client_messages: org members view"
    on public.client_messages for select
    using (
      org_id is not null and exists (
        select 1 from public.organisation_members om
        where om.org_id = client_messages.org_id and om.user_id = auth.uid()
      )
    );

  create policy "client_messages: org members insert"
    on public.client_messages for insert
    with check (
      org_id is not null and exists (
        select 1 from public.organisation_members om
        where om.org_id = client_messages.org_id and om.user_id = auth.uid()
      )
      and sender_user_id = auth.uid()
    );

  create policy "client_messages: owner view"
    on public.client_messages for select
    using (
      org_id is null and exists (
        select 1 from public.clients c
        where c.id = client_messages.client_id and c.owner_id = auth.uid()
      )
    );

  create policy "client_messages: owner insert"
    on public.client_messages for insert
    with check (
      org_id is null and exists (
        select 1 from public.clients c
        where c.id = client_messages.client_id and c.owner_id = auth.uid()
      )
      and sender_user_id = auth.uid()
    );
  ```
- [x] Apply via Supabase MCP `apply_migration` (name: `client_messages`).
- [x] Verify via MCP `execute_sql`:
  ```sql
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'client_messages'
  order by ordinal_position;
  ```
  Expected: 6 rows. Result: 7 columns returned (id, client_id, org_id, direction, body,
  sender_user_id, created_at) — `org_id` confirmed nullable as intended.
- [ ] Commit: `git add supabase/schema-081-client-messages.sql && git commit -m "feat: client email messaging — database migration"`

---

## C-2 — Reply-to address helpers

*Codex edits:*
- [x] Create `src/lib/client-messages.ts`:
  ```typescript
  const CLIENT_MESSAGE_ADDRESS_RE = /client-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i

  function inboundDomain(): string {
    const domain = process.env.RESEND_INBOUND_DOMAIN
    if (!domain) throw new Error('RESEND_INBOUND_DOMAIN is not configured')
    return domain
  }

  /**
   * The business-branded, per-client address a client's replies get routed back through.
   * Display-name-wrapped so a client inspecting the address sees the business's name (org or
   * individual), not a cryptic string — that identity is the "hero" here, TimeWiseHub's
   * own domain is an invisible-as-possible implementation detail underneath it.
   */
  export function buildReplyToAddress(clientId: string, senderName: string): string {
    return `"${senderName.replace(/"/g, '')}" <client-${clientId}@${inboundDomain()}>`
  }

  /**
   * Extracts the client UUID from a `client-<uuid>@...` address. Not anchored to the start
   * of the string — inbound webhook `to` values are documented as bare addresses, but this
   * stays robust if a display-name-wrapped form ever shows up instead.
   */
  export function parseClientIdFromAddress(address: string): string | null {
    const match = address.match(CLIENT_MESSAGE_ADDRESS_RE)
    return match ? match[1] : null
  }
  ```

*Conductor:*
- [x] `pnpm run build` — must pass clean. Nothing imports this yet.
- [x] Commit: `git add src/lib/client-messages.ts && git commit -m "feat: client email messaging — reply-to address helpers"`

---

## C-3 — Webhook signature verification

*Codex edits:*
- [x] Create `src/lib/resend-webhook.ts`:
  ```typescript
  import { createHmac, timingSafeEqual } from 'crypto'

  export function verifyResendWebhookSignature(opts: {
    id: string
    timestamp: string
    signatureHeader: string
    rawBody: string
    secret: string
  }): boolean {
    const { id, timestamp, signatureHeader, rawBody, secret } = opts

    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
    const signedContent = `${id}.${timestamp}.${rawBody}`
    const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64')
    const expectedBuf = Buffer.from(expected, 'base64')

    for (const candidate of signatureHeader.split(' ')) {
      const [version, sig] = candidate.split(',')
      if (version !== 'v1' || !sig) continue
      const sigBuf = Buffer.from(sig, 'base64')
      if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
        return true
      }
    }
    return false
  }
  ```

*Conductor:*
- [x] `pnpm run build` — must pass clean. Nothing imports this yet.
- [x] Commit: `git add src/lib/resend-webhook.ts && git commit -m "feat: client email messaging — Resend webhook signature verification"`

---

## C-4 — Outbound send route

*Codex edits:*

Business identity (sender name + logo) reuses the exact resolution already established for
invoice emails (`src/lib/invoice-letterhead.ts`) rather than inventing a parallel "org name"
concept: Team plan → org's name/logo, Pro (solo, no org) → the individual's own name/logo, Free →
falls back to "TimeWiseHub" — which is why this route gates on `isPaidPlan`, mirroring
`src/app/api/invoices/[id]/send/route.ts`'s own gate exactly. Resolved from `client.owner_id` (the
client's actual owner), not the acting staff member — same as the invoice route resolves from
`invoice.owner_id`. Access control has two branches because `clients.org_id` is nullable: org
members if the client belongs to an org, or the client's own owner if it doesn't.

- [x] Create `src/app/api/clients/[id]/messages/route.ts`:
  ```typescript
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
  ```
  Note: the message is only logged after `sendEmail` succeeds — never record a message as sent
  when it wasn't.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add "src/app/api/clients/[id]/messages/route.ts" && git commit -m "feat: client email messaging — outbound send route"`

---

## C-5 — Inbound webhook route

*Codex edits:*
- [x] Create `src/app/api/webhooks/resend-inbound/route.ts`:
  ```typescript
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
  ```
  `PushPayload` (`src/lib/push.ts:10-15`) is `{ title: string; body: string; url?: string; tag?: string }`
  — already matched exactly by the call above, no adjustment needed.
  `req.text()` (not `req.json()`) is deliberate — signature verification needs the exact raw bytes.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add "src/app/api/webhooks/resend-inbound/route.ts" && git commit -m "feat: client email messaging — inbound webhook route"`

---

## C-6 — UI: messages page and client overview tile

*Codex edits:*
- [x] Read `src/app/dashboard/clients/[id]/page.tsx` and
  `src/app/dashboard/clients/[id]/sessions/page.tsx` first (for the Tile grid pattern and the
  server-fetches-then-passes-to-client-component convention), then:
- [x] Create `src/components/clients/ClientMessagesThread.tsx`:
  ```typescript
  'use client'

  import { useState } from 'react'
  import { Send } from 'lucide-react'

  export type ClientMessage = {
    id: string
    direction: 'outbound' | 'inbound'
    body: string
    created_at: string
    sender_name: string | null
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
  }

  export default function ClientMessagesThread({
    clientId,
    initialMessages,
    hasEmail,
  }: {
    clientId: string
    initialMessages: ClientMessage[]
    hasEmail: boolean
  }) {
    const [messages, setMessages] = useState(initialMessages)
    const [body, setBody] = useState('')
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSend() {
      if (!body.trim() || sending) return
      setSending(true)
      setError(null)
      const res = await fetch(`/api/clients/${clientId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const data = await res.json() as { ok?: boolean; id?: string; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Failed to send')
        setSending(false)
        return
      }
      setMessages(prev => [...prev, {
        id: data.id!, direction: 'outbound', body, created_at: new Date().toISOString(), sender_name: 'You',
      }])
      setBody('')
      setSending(false)
    }

    if (!hasEmail) {
      return (
        <p className="text-sm text-gray-500 dark:text-slate-400">
          Add an email address to this client before sending messages.
        </p>
      )
    }

    return (
      <div className="space-y-4">
        <div className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {messages.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500">No messages yet.</p>
          ) : (
            messages.map(m => (
              <div key={m.id} className={`flex flex-col ${m.direction === 'outbound' ? 'items-end' : 'items-start'}`}>
                <span className="mb-0.5 px-1 text-[10px] font-semibold text-gray-400 dark:text-slate-500">
                  {m.direction === 'outbound' ? (m.sender_name ?? 'You') : 'Client'} — {fmtTime(m.created_at)}
                </span>
                <div className={`max-w-md whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${
                  m.direction === 'outbound'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-200'
                }`}>
                  {m.body}
                </div>
              </div>
            ))
          )}
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={2}
            placeholder="Type a message…"
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            onClick={handleSend}
            disabled={sending || !body.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    )
  }
  ```
- [x] Create `src/app/dashboard/clients/[id]/messages/page.tsx`:
  ```typescript
  import { redirect, notFound } from 'next/navigation'
  import Link from 'next/link'
  import { createClient } from '@/lib/supabase-server'
  import { getSubscription, isPaidPlan } from '@/lib/subscription'
  import ClientMessagesThread from '@/components/clients/ClientMessagesThread'
  import type { ClientMessage } from '@/components/clients/ClientMessagesThread'

  export default async function ClientMessagesPage({
    params,
  }: {
    params: Promise<{ id: string }>
  }) {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: client } = await supabase
      .from('clients').select('id, name, email, owner_id').eq('id', id).maybeSingle()
    if (!client) notFound()

    const subscription = await getSubscription(client.owner_id)
    if (!isPaidPlan(subscription)) {
      return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] px-6 text-center">
          <div className="text-4xl mb-4">💬</div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Client messaging is a Pro feature</h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-6">
            Send and receive email with clients right from their record, branded as your business,
            with no client login required. Upgrade to Pro to unlock it.
          </p>
          <Link href="/dashboard/billing" className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-bold text-white hover:bg-cyan-600 transition-colors">
            Upgrade to Pro
          </Link>
        </div>
      )
    }

    const { data: rows } = await supabase
      .from('client_messages')
      .select('id, direction, body, created_at, sender_user_id, profiles(full_name, email)')
      .eq('client_id', id)
      .order('created_at', { ascending: true })

    const messages: ClientMessage[] = (rows ?? []).map(r => {
      const senderProfile = r.profiles as unknown as { full_name: string | null; email: string } | null
      return {
        id: r.id,
        direction: r.direction as 'outbound' | 'inbound',
        body: r.body,
        created_at: r.created_at,
        sender_name: senderProfile?.full_name || senderProfile?.email || null,
      }
    })

    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Messages</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">{client.name}</p>
        </div>
        <ClientMessagesThread clientId={id} initialMessages={messages} hasEmail={!!client.email} />
      </div>
    )
  }
  ```
- [x] In `src/app/dashboard/clients/[id]/page.tsx`, add `Mail` to the existing `lucide-react`
  import, and add one more tile to the `TileGrid` containing Projects/Sessions/Progress notes:
  ```typescript
  <Tile title="Messages" icon={Mail} accent="#0d9488" href={`/dashboard/clients/${id}/messages`} />
  ```
  No `stat` count prop for this tile — omit it rather than adding a count query just to fill it in.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add "src/app/dashboard/clients/[id]/messages" src/components/clients/ClientMessagesThread.tsx "src/app/dashboard/clients/[id]/page.tsx" && git commit -m "feat: client email messaging — messages page and client overview tile"`

---

## C-7 — Manual setup (Resend domain, webhook, env vars)

*Codex edits:*
- [ ] Add to `.env.example`, in its own section:
  ```
  # --- Client email messaging (Resend) ---
  RESEND_INBOUND_DOMAIN=       # e.g. inbound.timewisehub.com.au — set up as a receiving domain in Resend
  RESEND_WEBHOOK_SECRET=       # from the webhook's signing secret in the Resend dashboard (starts with whsec_)
  ```

*Conductor + user (in parallel with C-1..C-6, not blocking them):*
- [ ] User sets up a Resend receiving domain (e.g. `inbound.timewisehub.com.au`), adds the DNS
  records Resend provides, waits for verification.
- [ ] User creates a webhook in Resend for the `email.received` event, pointing to
  `https://www.timewisehub.com.au/api/webhooks/resend-inbound`, copies the signing secret.
- [ ] Once C-5 is deployed: add `RESEND_INBOUND_DOMAIN` and `RESEND_WEBHOOK_SECRET` to
  `.env.local` and via `vercel env add ... production`.
- [ ] Commit: `git add .env.example && git commit -m "docs: document client email messaging env vars"`

---

## C-8 — Manual end-to-end verification

*Conductor + user:*
- [ ] `pnpm run build` — final clean check after C-1..C-6.
- [ ] Confirm the paid-plan gate: a Free-plan client sees "Upgrade to Pro" instead of the compose
  box, and the send route itself rejects with 403 if called directly.
- [ ] Send a test message from a client's Messages page (Pro/Team test account, client has your
  own email on file) — confirm it appears in the thread, arrives with the `From` display name
  showing the org's name (Team) or individual's name (solo Pro) — never "TimeWiseHub" — the logo
  renders if one is configured, and the reassurance line about replying is present.
- [ ] Reply to that email (only works once C-7 is fully done and deployed) — confirm the reply
  shows up in the thread and a push notification fires (org admin/owner/manager for a Team client,
  the solo owner directly for a client with no org).
- [ ] Confirm a client with no email on file sees the "add an email" prompt, no compose box.
- [ ] Repeat the send/reply/notify checks for a client belonging to a solo Pro user with no
  organisation at all — confirms the nullable-`org_id` fix in C-1 actually works end to end.
- [ ] Report pass/fail; fix inline if something's off before finishing.

---

## Acceptance checklist
- [ ] C-1: `client_messages` table (nullable `org_id`) + dual org/owner RLS applied and verified
- [ ] C-2: reply-to address helpers compile clean, display-name-wrapped and quoted
- [ ] C-3: webhook signature verification compiles clean
- [ ] C-4: outbound send route — gates on paid plan, resolves identity via
  `invoiceLetterhead()`/`invoiceLogo()`, sends via `sendEmail()`, logs only on success
- [ ] C-5: inbound webhook route — verifies signature, fetches body via Resend's receiving-email
  API, logs, notifies (org managers or solo owner depending on the client)
- [ ] C-6: Messages page + tile + upgrade prompt for non-paid plans
- [ ] C-7: env vars documented; user's Resend domain/webhook setup done
- [ ] C-8: full manual smoke test passes, including a real send→reply round trip, logo rendering,
  and the free-plan upgrade prompt

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser +
email round trip required for C-8 (no test runner in this project).
