# Client Email Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff send and receive email with a client from inside a client's record — one
running thread, no client account required — by routing replies through a per-client address on
a new Resend receiving domain.

**Architecture:** One new table (`client_messages`), two new API routes (send + inbound webhook),
one new page, and two small shared-logic files (reply-to address encode/decode, and Standard
Webhooks signature verification via Node's built-in `crypto` — no new npm dependency). Reuses the
existing `sendEmail()` helper and `sendPushToUser()` notification mechanism unmodified.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript strict, Tailwind v4, Supabase,
Resend (existing account, new receiving domain). No new npm dependencies — webhook signature
verification uses Node's built-in `crypto` module (the Standard Webhooks spec Resend's webhooks
implement is a documented HMAC-SHA256 scheme, not something requiring the `svix`/`resend` SDKs).

## Global Constraints

- No new npm dependencies.
- No SMS in this phase — email only (see spec's "Out of scope").
- No retrofitting of existing automated emails (invoice sends, reminders, invites) into this
  thread — only new messages composed through the new page.
- No attachments — text only.
- One thread per client (not per session/invoice/context).
- Requires a paid plan (Pro or Team) — mirrors the existing invoice-emailing gate exactly, since
  both features resolve business identity via `invoiceLetterhead()`/`invoiceLogo()`, which falls
  back to literal "TimeWiseHub" branding on the Free plan. Gating avoids ever surfacing that
  fallback to a client, consistent with the "org is the hero" product decision.
- Business identity (sender name, logo) reuses `src/lib/invoice-letterhead.ts` unmodified — no
  parallel branding concept invented for this feature.
- `clients.org_id` is nullable (solo Pro users have clients with no org) — `client_messages`
  mirrors that nullability and the same dual org-member-or-owner RLS/access pattern already used
  on `clients` and `sessions`, rather than assuming every client belongs to an org.
- Verification gate: `pnpm run build` (tsc + eslint) after every task. No test runner.
- All Tailwind classes must include `dark:` variants (this UI is not hard-coded dark).
- Real, one-time manual setup outside this codebase is required before inbound replies work: a
  Resend receiving domain + DNS records, and a webhook configured in the Resend dashboard with its
  signing secret copied into env vars. This does not block writing/testing the outbound half.

---

## Task 1: Database migration — `client_messages`

**Files:**
- Create: `supabase/schema-081-client-messages.sql`

**Interfaces:**
- Produces: `client_messages` table (`id`, `client_id`, `org_id` nullable, `direction`
  ('outbound'|'inbound'), `body`, `sender_user_id` nullable, `created_at`), readable/insertable by
  org members of `org_id` (org-owned clients) or the client's own `owner_id` (solo Pro users, whose
  clients have no org at all). Consumed by Tasks 4, 5, 6.

*Conductor only — matches this project's established convention for migrations (Codex cannot run
the Supabase MCP).*

- [ ] **Step 1: Write the migration**

`org_id` is nullable — `clients.org_id` is nullable too (solo Pro users have clients with no org),
so this mirrors that exactly, and the RLS policies below mirror the existing dual
org-member-or-owner pattern already used on the `clients` and `sessions` tables rather than
inventing a new one.

`supabase/schema-081-client-messages.sql`:
```sql
-- ============================================================
-- TimeWiseHub — Schema 081: Client email messaging
-- One running email thread per client, no client account needed — outbound
-- messages are logged when sent; inbound replies are logged by a webhook
-- using the service role (bypasses RLS, matching how other service-role-only
-- inbound integrations already work in this codebase).
-- Run via Supabase MCP apply_migration (name: client_messages)
-- ============================================================

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

Note: the insert policies only ever gate the outbound path (Task 4, using the caller's own
authenticated session). The inbound webhook (Task 5) uses the service-role client, which bypasses
RLS entirely — these policies never apply to it, by design.

- [ ] **Step 2: Apply via Supabase MCP**

Use `apply_migration` (name: `client_messages`).

- [ ] **Step 3: Verify via MCP `execute_sql`**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'client_messages'
order by ordinal_position;
```
Expected: 6 rows matching the columns above.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-081-client-messages.sql
git commit -m "feat: client email messaging — database migration"
```

---

## Task 2: Reply-to address helpers

**Files:**
- Create: `src/lib/client-messages.ts`

**Interfaces:**
- Produces:
  - `buildReplyToAddress(clientId: string, senderName: string): string`
  - `parseClientIdFromAddress(address: string): string | null`
  Consumed by Task 4 (build) and Task 5 (parse).

- [ ] **Step 1: Write the helper file**

Create `src/lib/client-messages.ts`:
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

- [ ] **Step 2: Build check**

Run: `pnpm run build`
Expected: passes clean. Nothing imports this yet.

- [ ] **Step 3: Commit**

```bash
git add src/lib/client-messages.ts
git commit -m "feat: client email messaging — reply-to address helpers"
```

---

## Task 3: Webhook signature verification

**Files:**
- Create: `src/lib/resend-webhook.ts`

**Interfaces:**
- Produces: `verifyResendWebhookSignature(opts: { id: string; timestamp: string; signatureHeader: string; rawBody: string; secret: string }): boolean`
  Consumed by Task 5.

Resend's webhooks implement the [Standard Webhooks](https://www.standardwebhooks.com/) spec (the
same one Svix is built on): the signed content is `${id}.${timestamp}.${rawBody}` (period-joined),
the secret has a `whsec_` prefix stripped then is base64-decoded to raw bytes, the expected
signature is `HMAC-SHA256(secretBytes, signedContent)` base64-encoded, and the header contains
one or more space-separated `v1,<base64>` candidates to check against (constant-time compare).

- [ ] **Step 1: Write the helper file**

Create `src/lib/resend-webhook.ts`:
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

- [ ] **Step 2: Build check**

Run: `pnpm run build`
Expected: passes clean. Nothing imports this yet.

- [ ] **Step 3: Commit**

```bash
git add src/lib/resend-webhook.ts
git commit -m "feat: client email messaging — Resend webhook signature verification"
```

---

## Task 4: Outbound send route

**Files:**
- Create: `src/app/api/clients/[id]/messages/route.ts`

**Interfaces:**
- Consumes: `sendEmail` (`@/lib/email-notifications`), `buildReplyToAddress` (`@/lib/client-messages`, Task 2), `invoiceLetterhead`/`invoiceLogo` (`@/lib/invoice-letterhead`, pre-existing), `getSubscription`/`isPaidPlan` (`@/lib/subscription`, pre-existing)
- Produces: `POST` handler — request body `{ body: string }`, response `{ ok: true, id: string }` or `{ error: string }`.

Business identity (sender name + logo) reuses the exact resolution already established for
invoice emails (`src/lib/invoice-letterhead.ts`) rather than inventing a parallel "org name"
concept: Team plan → org's name/logo, Pro (solo, no org) → the individual's own name/logo, Free →
falls back to "TimeWiseHub" — which is exactly why this route gates on `isPaidPlan`, mirroring
`src/app/api/invoices/[id]/send/route.ts`'s own gate. Resolved from `client.owner_id` (the
client's actual owner), not the acting staff member — same as the invoice route resolves from
`invoice.owner_id`, since the identity represents the business, not whichever staff member happens
to be sending.

Access control has two branches because `clients.org_id` is nullable (solo Pro users have clients
with no org): org members if the client belongs to an org, or the client's own owner if it
doesn't — mirroring the same dual pattern as the RLS policies from Task 1.

- [ ] **Step 1: Write the route**

Create `src/app/api/clients/[id]/messages/route.ts`:
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
  // minimum needed to actually deliver the email, per explicit product decision. Reuses the
  // exact same resolution invoice emails already use, not a parallel concept.
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

Note the message is only logged (last step) after `sendEmail` succeeds without throwing — matching
the spec's "never record a message as sent when it wasn't."

- [ ] **Step 2: Build check**

Run: `pnpm run build`
Expected: passes clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/clients/[id]/messages/route.ts"
git commit -m "feat: client email messaging — outbound send route"
```

---

## Task 5: Inbound webhook route

**Files:**
- Create: `src/app/api/webhooks/resend-inbound/route.ts`

**Interfaces:**
- Consumes: `verifyResendWebhookSignature` (`@/lib/resend-webhook`, Task 3), `parseClientIdFromAddress` (`@/lib/client-messages`, Task 2), `sendPushToUser` (`@/lib/push`)
- Produces: `POST` handler for Resend's `email.received` webhook.

- [ ] **Step 1: Write the route**

Create `src/app/api/webhooks/resend-inbound/route.ts`:
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
  if (!clientId) return NextResponse.json({ ok: true }) // not addressed to a known client alias

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
  if (!client) return NextResponse.json({ ok: true }) // stale/unknown client id, drop silently

  await service
    .from('client_messages')
    .insert({ client_id: client.id, org_id: client.org_id, direction: 'inbound', body, sender_user_id: null })

  // Notification recipients: org managers/admins/owner for an org-owned client, or just the
  // client's own owner for a solo Pro user (clients.org_id is nullable — mirrors the same
  // dual-mode handling used throughout this feature).
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

Note: `req.text()` (not `req.json()`) is used deliberately for the raw body — the signature is
sensitive to the exact bytes, so it must be verified against the raw string before any parsing.

- [ ] **Step 2: Build check**

Run: `pnpm run build`
Expected: passes clean. (`sendPushToUser`'s `PushPayload` type — `src/lib/push.ts:10-15` — is
`{ title: string; body: string; url?: string; tag?: string }`, already matched exactly by the
`{ title, body, url }` call above.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/webhooks/resend-inbound/route.ts"
git commit -m "feat: client email messaging — inbound webhook route"
```

---

## Task 6: UI — messages page and client overview tile

**Files:**
- Create: `src/app/dashboard/clients/[id]/messages/page.tsx`
- Create: `src/components/clients/ClientMessagesThread.tsx`
- Modify: `src/app/dashboard/clients/[id]/page.tsx`

**Interfaces:**
- Consumes: nothing new from earlier tasks except the route created in Task 4 (`POST /api/clients/[id]/messages`).
- Produces: the new page and component; no exports consumed elsewhere.

- [ ] **Step 1: Read the client overview page and an existing sub-page for conventions**

Read `src/app/dashboard/clients/[id]/page.tsx` (for the Tile grid pattern and how `id`/access
checks work) and `src/app/dashboard/clients/[id]/sessions/page.tsx` (for the general
server-component-fetches-then-passes-to-client-component pattern used by every other client
sub-page) before writing the new files.

- [ ] **Step 2: Create the client component**

Create `src/components/clients/ClientMessagesThread.tsx`:
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

- [ ] **Step 3: Create the page**

Create `src/app/dashboard/clients/[id]/messages/page.tsx`:
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

- [ ] **Step 4: Add the tile to the client overview page**

Read `src/app/dashboard/clients/[id]/page.tsx`, find the `TileGrid` containing the Projects/
Sessions/Progress notes tiles (around the `Tile title="Projects"` line), and add one more tile
after them in the same `TileGrid`:
```typescript
<Tile title="Messages" icon={Mail} accent="#0d9488" href={`/dashboard/clients/${id}/messages`} />
```
Add `Mail` to the existing `lucide-react` import at the top of the file (alongside whatever icons
are already imported there). This tile has no `stat` count prop (the other tiles show a count;
messages doesn't need one for this phase — omit the prop rather than fetching a count query just
to fill it in).

- [ ] **Step 5: Build check**

Run: `pnpm run build`
Expected: passes clean.

- [ ] **Step 6: Commit**

```bash
git add "src/app/dashboard/clients/[id]/messages" src/components/clients/ClientMessagesThread.tsx "src/app/dashboard/clients/[id]/page.tsx"
git commit -m "feat: client email messaging — messages page and client overview tile"
```

---

## Task 7: Manual setup (Resend receiving domain, webhook, env vars)

**Files:**
- Modify: `.env.example`
- Modify: `.env.local` (not committed — local secret)

*Conductor + user — this task is mostly things only the account/domain owner can do.*

- [ ] **Step 1: Add env var names to `.env.example`**

Add to `.env.example`, alongside the existing `# --- Video calls (Daily.co) ---` section style:
```
# --- Client email messaging (Resend) ---
RESEND_INBOUND_DOMAIN=       # e.g. inbound.timewisehub.com.au — set up as a receiving domain in Resend
RESEND_WEBHOOK_SECRET=       # from the webhook's signing secret in the Resend dashboard (starts with whsec_)
```

- [ ] **Step 2: User sets up the Resend receiving domain**

In the Resend dashboard: add a new domain for receiving (e.g. `inbound.timewisehub.com.au`), add
the DNS records Resend provides at wherever `timewisehub.com.au` is registered, wait for
verification.

- [ ] **Step 3: User creates the webhook**

In the Resend dashboard, create a webhook subscribed to the `email.received` event, pointing to
`https://www.timewisehub.com.au/api/webhooks/resend-inbound` (production URL — webhooks need a
publicly reachable HTTPS endpoint, so this can't be tested against localhost without a tunnel).
Copy the signing secret it generates.

- [ ] **Step 4: Add the env vars**

`RESEND_INBOUND_DOMAIN` (the domain from Step 2) and `RESEND_WEBHOOK_SECRET` (the secret from
Step 3) go into `.env.local` for local dev, and via `vercel env add RESEND_INBOUND_DOMAIN
production` / `vercel env add RESEND_WEBHOOK_SECRET production` for the deployed site (matching
this project's established env var convention).

- [ ] **Step 5: Commit the `.env.example` change**

```bash
git add .env.example
git commit -m "docs: document client email messaging env vars"
```

---

## Task 8: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: `pnpm run build`**

Final clean check after all prior tasks.

- [ ] **Step 2: Confirm the paid-plan gate**

Open Messages for a client belonging to a Free-plan account (or temporarily downgrade a test
account) — confirm the "Upgrade to Pro" prompt shows instead of the compose box, and the send
route itself also rejects with 403 if called directly.

- [ ] **Step 3: Send a message**

Pick a test client (on a Pro or Team test account) with your own email address on file. Open their
Messages page, send a test message. Confirm:
- It appears in the thread immediately.
- It actually arrives in that inbox, with the `From` display name showing the org's name (Team
  plan) or the individual's own name (solo Pro) — not "TimeWiseHub".
- If a logo is configured (org or personal, matching the invoice-email logo setting), it renders
  above the message body.
- The reassurance line about replying is present.

- [ ] **Step 4: Reply and confirm the round trip**

Reply to that email from the test inbox (this only works once Task 7 is fully done and deployed —
webhooks need a public URL). Confirm:
- The reply shows up in the client's Messages thread within a few seconds.
- A push notification fires (org admin/owner/manager for a Team client, or the solo owner
  directly for a client with no org).

- [ ] **Step 5: Confirm the no-email gate**

Open Messages for a client with no email on file — confirm the compose box is replaced with the
"add an email first" message, and no send is attempted.

- [ ] **Step 6: Confirm solo (no-org) clients work end to end**

Repeat steps 3-4 for a client that belongs to a solo Pro user with no organisation at all — confirm
sending, receiving, and notifications all work identically to the org case (this is the scenario
the nullable-`org_id` fix in Task 1 exists for).

- [ ] **Step 7: Report pass/fail**

Fix inline if something's off before finishing. This is the second feature (after guest video
chat) depending on live external infrastructure rather than pure internal Supabase reads — treat
this pass as seriously as that one.

---

## Acceptance checklist
- [ ] Task 1: `client_messages` table (nullable `org_id`) + dual org/owner RLS applied and verified
- [ ] Task 2: reply-to address encode/decode helpers compile clean, display-name-wrapped and quoted
- [ ] Task 3: webhook signature verification compiles clean (algorithm matches Standard Webhooks
  spec — verified for real against a live webhook in Task 8, not just by code inspection)
- [ ] Task 4: outbound send route — gates on paid plan, resolves business identity via
  `invoiceLetterhead()`/`invoiceLogo()` (org for Team, individual for solo Pro), sends via existing
  `sendEmail()`, logs only on success
- [ ] Task 5: inbound webhook route — verifies signature, fetches body via Resend's receiving-email
  API (not the webhook payload itself, which is metadata-only), logs, notifies (org managers or
  the solo owner depending on whether the client has an org)
- [ ] Task 6: Messages page + tile, upgrade prompt for non-paid plans, matches existing client
  sub-page conventions
- [ ] Task 7: env vars documented, Resend receiving domain + webhook set up by the user
- [ ] Task 8: full manual smoke test passes, including a real send→reply round trip, the org logo
  rendering correctly, and the free-plan upgrade prompt showing for a non-paid test account
