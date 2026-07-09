# Session-scheduled client email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically send a business-branded confirmation email to a client when staff
schedule a Programs-in-Sessions session for them — one email per one-off booking, one email per
recurring series (not per generated occurrence).

**Architecture:** A new `src/lib/session-email.ts` exposes two best-effort, never-throwing
functions — `sendSessionScheduledEmail(sessionId)` and `sendSeriesScheduledEmail(seriesId)` —
that resolve the client, gate on paid plan + client having an email, build a branded/reply-to
email using the same helpers `src/app/api/clients/[id]/messages/route.ts` already uses, and send
via the existing `sendEmail()`. A new API route lets the browser-side single-session booking flow
trigger the email after its insert; the server-side recurring-series route calls the series
function directly.

**Tech Stack:** Next.js 16 App Router (Route Handlers), TypeScript strict, Supabase
(`@supabase/supabase-js` service-role client for cross-tenant reads), Resend (via existing
`sendEmail()` wrapper). No test framework — verification is `pnpm run build` plus manual smoke.

## Global Constraints

- No test runner / Jest / Vitest — verify with `pnpm run build` (tsc + eslint) and manual smoke
  in the browser, per project convention.
- Session-scheduled emails require the client's business to be on a paid plan
  (`isPaidPlan(subscription)`), matching the existing Client Email Messaging gate.
- Email sending must never block or fail session/series creation — always best-effort, errors
  logged via `console.error` and swallowed.
- Recurring series get exactly **one** email at series-creation time, never one per generated
  occurrence.
- Dates/times are formatted `en-AU` / `Australia/Sydney`, matching existing scheduling emails.
- Package manager is `pnpm`. Shell is PowerShell on this machine.

---

### Task 1: `session-email.ts` — the two email-sending functions

**Files:**
- Modify: `src/lib/email-notifications.ts:48-50` (export the existing `paragraph` helper so it
  can be reused instead of duplicated)
- Create: `src/lib/session-email.ts`

**Interfaces:**
- Consumes: `createServiceClient` (`@/lib/supabase-service`), `getSubscription`/`isPaidPlan`
  (`@/lib/subscription`), `invoiceLetterhead`/`invoiceLogo` (`@/lib/invoice-letterhead`),
  `buildReplyToAddress` (`@/lib/client-messages`), `sendEmail`/`paragraph`
  (`@/lib/email-notifications`), `SessionSeriesInterval` type (`@/lib/sessions/series`).
- Produces: `sendSessionScheduledEmail(sessionId: string): Promise<void>` and
  `sendSeriesScheduledEmail(seriesId: string): Promise<void>` — both exported from
  `@/lib/session-email`, both never throw.

- [ ] **Step 1: Export `paragraph` from `email-notifications.ts`**

In `src/lib/email-notifications.ts`, change line 48 from:

```ts
function paragraph(lines: string[]) {
```

to:

```ts
export function paragraph(lines: string[]) {
```

- [ ] **Step 2: Create `src/lib/session-email.ts`**

```ts
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
```

- [ ] **Step 3: Type-check and lint**

Run: `pnpm run build`
Expected: builds clean, no TypeScript or ESLint errors. If `SessionSeriesInterval` isn't already
exported from `src/lib/sessions/series.ts`, this step will fail with a TS import error — it is
exported today (`export type SessionSeriesInterval = 'weekly' | 'fortnightly' | 'monthly'`), so
no action should be needed, but confirm before moving on.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email-notifications.ts src/lib/session-email.ts
git commit -m "feat: add session-scheduled client email helpers"
```

---

### Task 2: API route for the one-off booking flow

**Files:**
- Create: `src/app/api/clients/[id]/sessions/[sessionId]/notify-scheduled/route.ts`

**Interfaces:**
- Consumes: `sendSessionScheduledEmail(sessionId: string): Promise<void>` from Task 1
  (`@/lib/session-email`), `createClient` (`@/lib/supabase-server`).
- Produces: `POST /api/clients/[id]/sessions/[sessionId]/notify-scheduled` — always responds
  `{ ok: true }` on success; `401` if unauthenticated; `404` if the session isn't visible to the
  caller (relies on the `sessions` table's existing RLS policy — no extra authorization logic
  needed here, since a plain `select` through the user-scoped client already enforces org/owner
  access the same way the browser-side insert in `NewSessionModal.tsx` does).

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { sendSessionScheduledEmail } from '@/lib/session-email'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await sendSessionScheduledEmail(sessionId)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Type-check and lint**

Run: `pnpm run build`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clients/[id]/sessions/[sessionId]/notify-scheduled/route.ts
git commit -m "feat: add notify-scheduled route for one-off session bookings"
```

---

### Task 3: Wire the one-off booking modal to call the new route

**Files:**
- Modify: `src/components/clients/NewSessionModal.tsx:176-193`

**Interfaces:**
- Consumes: `POST /api/clients/[id]/sessions/[sessionId]/notify-scheduled` from Task 2.

- [ ] **Step 1: Fire the notification request after the session insert succeeds**

In `src/components/clients/NewSessionModal.tsx`, the existing code around lines 176-193 reads:

```ts
    if (sessErr || !session) {
      setError(sessErr?.message ?? 'Failed to create session.')
      setSaving(false)
      return
    }

    if (templates.length > 0) {
      await supabase.from('session_todos').insert(
        templates.map(t => ({
          session_id: session.id,
          title: t.title,
          completed: false,
          position: t.position,
        }))
      )
    }

    router.push(`/dashboard/clients/${clientId}/sessions/${session.id}`)
  }
```

Change it to:

```ts
    if (sessErr || !session) {
      setError(sessErr?.message ?? 'Failed to create session.')
      setSaving(false)
      return
    }

    if (templates.length > 0) {
      await supabase.from('session_todos').insert(
        templates.map(t => ({
          session_id: session.id,
          title: t.title,
          completed: false,
          position: t.position,
        }))
      )
    }

    fetch(`/api/clients/${clientId}/sessions/${session.id}/notify-scheduled`, { method: 'POST' }).catch(() => {})

    router.push(`/dashboard/clients/${clientId}/sessions/${session.id}`)
  }
```

The `fetch` call is intentionally not `await`ed — sending the confirmation email must never delay
navigation or be treated as a booking failure, so the request fires and any network-level error
is swallowed at the call site (the route itself never errors on a failed send either, since
`sendSessionScheduledEmail` never throws).

- [ ] **Step 2: Type-check and lint**

Run: `pnpm run build`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/clients/NewSessionModal.tsx
git commit -m "feat: email client when a one-off session is booked"
```

---

### Task 4: Wire the recurring-series route to send one confirmation email

**Files:**
- Modify: `src/app/api/clients/[id]/sessions/series/route.ts`

**Interfaces:**
- Consumes: `sendSeriesScheduledEmail(seriesId: string): Promise<void>` from Task 1
  (`@/lib/session-email`).

- [ ] **Step 1: Import the helper and call it after `topUpSeries`**

In `src/app/api/clients/[id]/sessions/series/route.ts`, add the import alongside the existing
ones at the top:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { topUpSeries } from '@/lib/sessions/series'
import { sendSeriesScheduledEmail } from '@/lib/session-email'
```

Then change:

```ts
  await topUpSeries(service, series.id, 8)

  const { data: firstSession } = await service
```

to:

```ts
  await topUpSeries(service, series.id, 8)

  await sendSeriesScheduledEmail(series.id)

  const { data: firstSession } = await service
```

`sendSeriesScheduledEmail` never throws (Task 1), so no try/catch is needed at this call site —
a send failure is logged internally and the route continues to build and return its normal
response.

- [ ] **Step 2: Type-check and lint**

Run: `pnpm run build`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clients/[id]/sessions/series/route.ts
git commit -m "feat: email client once when a recurring session series is booked"
```

---

### Task 5: Manual end-to-end verification

**Files:** none (no code changes — this is the manual smoke pass called for by the project's
"no test runner" verification gate).

**Interfaces:** none.

- [ ] **Step 1: Confirm the paid-plan gate**

Using a test client belonging to a **paid-plan** business/org, with an email address on file,
book a one-off session via the "+ New session" button in the client's page. Confirm:
- The booking succeeds and navigates to the session page as before (no visible change in UX,
  no added delay).
- An email arrives at the client's address: sender name matches the business's letterhead name,
  logo (if configured) renders, subject/body show the correct title/date/time/duration/subject.
- Replying to that email lands in the client's message thread (same inbound routing as existing
  Client Email Messaging — check `/dashboard/clients/<id>` messages tab, or the
  `client_messages` table via SQL).

- [ ] **Step 2: Confirm recurring series sends exactly one email**

For the same test client, book a **weekly** recurring session. Confirm:
- Exactly one email arrives (not eight) — check inbox count.
- The email describes the cadence correctly ("starting <date>, then every week").
- Repeat quickly for `fortnightly` and `monthly` to confirm the cadence label reads correctly for
  each (`every 2 weeks`, `every month`).

- [ ] **Step 3: Confirm silent no-ops**

- Book a one-off session for a client **with no email on file** — confirm the booking still
  succeeds with no error shown, and no email is attempted (check server logs for the absence of
  a `sendSessionScheduledEmail failed` error — there should be nothing logged since it returns
  early, not throws).
- If a free-plan test account is available, book a session for one of its clients (with an email
  on file) — confirm no email is sent. If a free-plan account isn't readily available to test
  live, instead re-read `resolveSender` in `src/lib/session-email.ts` and confirm
  `isPaidPlan(subscription)` gates the send before any composition happens (code inspection is an
  acceptable substitute here, per the spec's Testing section).

- [ ] **Step 4: Final build check**

Run: `pnpm run build`
Expected: clean build, confirming nothing from Tasks 1-4 regressed.
