# Video Chat in Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client Session have a video call attached to it — auto-scheduled from the session's own time, the client gets an email invite immediately and a reminder 1 hour before, and once the call ends its AI summary shows on the session page.

**Architecture:** One new nullable FK (`scheduled_calls.session_id`) links the two previously-separate features. A new API route composes the existing Daily.co room-creation and invite-email logic (copied from `POST /api/video/schedule`) around a single guaranteed invitee — the client. The existing `/api/notifications/upcoming` cron gains a third reminder tier reusing its established pattern. A new `SessionVideoCall` component follows the same pattern as this session's `SessionRecurrence`/`SessionProgramLink`.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript strict, Tailwind v4, Supabase (service client), Daily.co REST API, Resend (via `sendEmail`), Lucide React icons. No new npm dependencies.

## Global Constraints

- Shell is PowerShell on Windows; Bash available for POSIX scripts.
- No test runner. Verification gate is `pnpm run build` (tsc + eslint) after each task.
- No new npm packages.
- All Tailwind classes must include `dark:` variants.
- Video calls are a Business-plan feature — the new creation route must include the same
  `isTeamPlan(sub)` gate already used by `POST /api/video/schedule`.
- A session links to at most one call. No cancel/reschedule from the session page this phase (use
  the existing Video page for that).
- Migration file saved as `supabase/schema-NNN-name.sql`. Next available: `076`. Applied via
  Supabase MCP `apply_migration`.
- Supabase project ID: `sdwwlnnsijcadkdwsvud`.

---

## File Map

**New files:**
```
supabase/schema-076-video-chat-sessions.sql
src/app/api/clients/[id]/sessions/[sessionId]/video-call/route.ts
src/components/clients/SessionVideoCall.tsx
```

**Modified files:**
```
src/app/api/notifications/upcoming/route.ts                     — 1-hour reminder block
src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx     — fetch client email + linked call
src/components/clients/SessionDetailClient.tsx                  — render SessionVideoCall
```

---

## Task 1: Database migration

**Files:**
- Create: `supabase/schema-076-video-chat-sessions.sql`
- [CONDUCTOR] Apply via Supabase MCP

**Interfaces:**
- Produces: `scheduled_calls.session_id` (nullable FK), `scheduled_calls.reminder_1hour_sent`

- [ ] **Step 1: Write migration file**

```sql
-- supabase/schema-076-video-chat-sessions.sql
-- Video chat in Sessions: link scheduled_calls to a client session, add 1-hour reminder flag

alter table public.scheduled_calls
  add column session_id uuid references public.sessions(id) on delete set null,
  add column reminder_1hour_sent boolean not null default false;

create index scheduled_calls_session on public.scheduled_calls (session_id) where session_id is not null;
```

- [ ] **Step 2: Apply migration [CONDUCTOR — run via Supabase MCP apply_migration]**

  Name: `video_chat_sessions`
  SQL: the content of `supabase/schema-076-video-chat-sessions.sql`

- [ ] **Step 3: Verify [CONDUCTOR]**

  Run via MCP `execute_sql`:
  ```sql
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'scheduled_calls'
    and column_name in ('session_id', 'reminder_1hour_sent');
  ```
  Expected: 2 rows — `session_id` (uuid, nullable), `reminder_1hour_sent` (boolean, default false).

- [ ] **Step 4: Commit**

  ```bash
  git add supabase/schema-076-video-chat-sessions.sql
  git commit -m "feat: video chat in sessions — session_id link + reminder flag (DB migration)"
  ```

---

## Task 2: Video call creation API route

**Files:**
- Create: `src/app/api/clients/[id]/sessions/[sessionId]/video-call/route.ts`

**Interfaces:**
- Produces: `POST /api/clients/[id]/sessions/[sessionId]/video-call` → `{ callId, roomUrl }` or
  an error `{ error: string }`

- [ ] **Step 1: Write the route**

Create `src/app/api/clients/[id]/sessions/[sessionId]/video-call/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendEmail } from '@/lib/email-notifications'
import { getSubscription, isTeamPlan } from '@/lib/subscription'

const DAILY_API = 'https://api.daily.co/v1'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function formatCallTime(iso: string) {
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

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id, sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sub = await getSubscription(user.id)
  if (!isTeamPlan(sub)) return NextResponse.json({ error: 'Upgrade to Business to use video calls.' }, { status: 403 })

  const service = createServiceClient()

  const [{ data: session }, { data: client }] = await Promise.all([
    service.from('sessions').select('id, title, scheduled_at, duration_minutes, org_id, client_id')
      .eq('id', sessionId).eq('client_id', id).maybeSingle(),
    service.from('clients').select('id, name, email').eq('id', id).maybeSingle(),
  ])

  if (!session || !client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', session.org_id ?? '').maybeSingle()
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!client.email) {
    return NextResponse.json(
      { error: 'Add an email address to this client before scheduling a video call.' },
      { status: 400 },
    )
  }

  const { data: profile } = await service
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const organiserName = (profile as unknown as { full_name: string | null } | null)?.full_name ?? 'A team member'

  const startsAt = session.scheduled_at
  const endsAt = new Date(new Date(startsAt).getTime() + session.duration_minutes * 60 * 1000).toISOString()
  const endsAtMs = new Date(endsAt).getTime()
  const exp = Math.floor(endsAtMs / 1000) + 60 * 60 // 1h after ends_at

  const roomRes = await fetch(`${DAILY_API}/rooms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties: { exp, enable_transcription: true } }),
  })
  if (!roomRes.ok) {
    const text = await roomRes.text()
    return NextResponse.json({ error: `Daily.co room creation failed: ${text}` }, { status: 502 })
  }
  const room = (await roomRes.json()) as { name: string; url: string }

  const { data: call, error: callError } = await service
    .from('scheduled_calls')
    .insert({
      org_id: session.org_id,
      title: session.title,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by: user.id,
      daily_room_name: room.name,
      room_url: room.url,
      session_id: sessionId,
    })
    .select('id')
    .single()

  if (callError || !call) {
    await fetch(`${DAILY_API}/rooms/${room.name}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}` },
    })
    return NextResponse.json({ error: 'Failed to save call' }, { status: 500 })
  }

  const { data: inviteeRow } = await service
    .from('call_invitees')
    .insert({ call_id: call.id, user_id: null, email: client.email, display_name: client.name })
    .select('guest_token')
    .single()

  const guestToken = (inviteeRow as unknown as { guest_token: string } | null)?.guest_token
  const joinUrl = `${APP_URL}/join/${guestToken}`
  const timeLabel = formatCallTime(startsAt)

  const subject = `${organiserName} invited you to a call: ${session.title}`
  const html = `
    <p>Hi ${client.name},</p>
    <p><strong>${organiserName}</strong> has scheduled a video call: <strong>${session.title}</strong></p>
    <p>When: ${timeLabel}</p>
    <p><a href="${joinUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">Join call</a></p>
    <p style="color:#888;font-size:12px">Or paste this link: ${joinUrl}</p>
  `
  const text = `${organiserName} invited you to a call: ${session.title}\nWhen: ${timeLabel}\nJoin: ${joinUrl}`

  await sendEmail({ to: client.email, subject, text, html })

  return NextResponse.json({ callId: call.id, roomUrl: room.url })
}
```

This mirrors `src/app/api/video/schedule/route.ts` almost exactly (same Daily.co call, same
invite-email template/sender), the only differences being: `starts_at`/`ends_at`/`title` are
computed from the session instead of a request body, there's exactly one invitee (the client, not
an arbitrary list), and the new row gets `session_id` set instead of `project_id`.

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add "src/app/api/clients/[id]/sessions/[sessionId]/video-call/route.ts"
  git commit -m "feat: video chat in sessions — video call creation API route"
  ```

---

## Task 3: 1-hour reminder in the notifications cron

**Files:**
- Modify: `src/app/api/notifications/upcoming/route.ts`

**Interfaces:**
- No new exports — extends the existing `GET` handler

- [ ] **Step 1: Add the 1-hour window and the new reminder block**

Read `src/app/api/notifications/upcoming/route.ts` first. Add the window computation right after
the existing `w5Start`/`w5End` lines:

```typescript
  // 1-hour window: 55–65 min ahead (scheduled_calls only)
  const w60Start = new Date(now.getTime() + 55 * 60 * 1000).toISOString()
  const w60End   = new Date(now.getTime() + 65 * 60 * 1000).toISOString()
```

Then insert this entire new block immediately before the existing
`// ── Scheduled calls — 30-min reminder ────` comment (i.e. right after the calendar-events
5-min block, before the calls-30 block):

```typescript
  // ── Scheduled calls — 1-hour reminder ────────────────────────────────────
  const { data: calls60 } = await service
    .from('scheduled_calls')
    .select('id, title, starts_at, daily_room_name')
    .eq('reminder_1hour_sent', false)
    .gte('starts_at', w60Start)
    .lte('starts_at', w60End)

  for (const call of (calls60 ?? []) as { id: string; title: string; starts_at: string; daily_room_name: string | null }[]) {
    const { data: invitees } = await service
      .from('call_invitees')
      .select('email, display_name, user_id, guest_token')
      .eq('call_id', call.id)

    for (const inv of (invitees ?? []) as { email: string; display_name: string | null; user_id: string | null; guest_token: string }[]) {
      if (inv.user_id) {
        await sendPushToUser(inv.user_id, {
          title: '1-hour reminder',
          body: `${call.title} starts at ${formatTime(call.starts_at)}`,
          url: `/dashboard/video/${call.id}`,
          tag: `call-reminder-60:${call.id}`,
        })
        pushed++
      } else {
        const joinUrl = `${APP_URL}/join/${inv.guest_token}`
        await sendEmail({
          to: inv.email,
          subject: `Starting soon: ${call.title}`,
          text: `${call.title} starts in about 1 hour.\nJoin: ${joinUrl}`,
          html: `<p>Hi ${inv.display_name ?? inv.email},</p>
<p>Your call <strong>${call.title}</strong> starts in about 1 hour at ${formatTime(call.starts_at)}.</p>
<p><a href="${joinUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">Join now</a></p>`,
        })
        emailed++
      }
    }

    await service.from('scheduled_calls').update({ reminder_1hour_sent: true }).eq('id', call.id)
  }

```

Do not change the existing calendar-events blocks or the existing calls-30/calls-5 blocks —
this is a pure insertion mirroring their exact shape with a new time window and flag column.

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/notifications/upcoming/route.ts
  git commit -m "feat: video chat in sessions — 1-hour call reminder"
  ```

---

## Task 4: SessionVideoCall component

**Files:**
- Create: `src/components/clients/SessionVideoCall.tsx`

**Interfaces:**
- Consumes: `POST /api/clients/[id]/sessions/[sessionId]/video-call` (Task 2)
- Produces: `SessionVideoCall` component, consumed by Task 5

- [ ] **Step 1: Write the component**

Create `src/components/clients/SessionVideoCall.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Video, X } from 'lucide-react'

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function SessionVideoCall({
  clientId,
  sessionId,
  clientEmail,
  call,
}: {
  clientId: string
  sessionId: string
  clientEmail: string | null
  call: { id: string; startsAt: string; summary: string | null } | null
}) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function scheduleCall() {
    setScheduling(true)
    setError(null)
    const res = await fetch(`/api/clients/${clientId}/sessions/${sessionId}/video-call`, { method: 'POST' })
    const json = await res.json()
    setScheduling(false)
    if (!res.ok) { setError(json.error ?? 'Failed to schedule call'); return }
    setShowConfirm(false)
    router.refresh()
  }

  if (call) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={`/dashboard/video/${call.id}`}
          className="flex items-center gap-1.5 rounded-xl bg-violet-500 px-3 py-1 text-xs font-bold text-white hover:bg-violet-600"
        >
          <Video size={12} />
          Join call
        </a>
        <span className="text-xs text-gray-400 dark:text-slate-500">{fmtDateTime(call.startsAt)}</span>
        {call.summary && (
          <button
            type="button"
            onClick={() => setShowSummary(true)}
            className="text-xs font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
          >
            View summary
          </button>
        )}

        {showSummary && call.summary && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowSummary(false)}
          >
            <div
              className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Call summary</h3>
                <button
                  type="button"
                  onClick={() => setShowSummary(false)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="whitespace-pre-line text-sm text-gray-700 dark:text-slate-300">{call.summary}</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <Video size={12} />
        Schedule video call
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Schedule video call</h2>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            {clientEmail ? (
              <p className="text-sm text-gray-600 dark:text-slate-400">
                This will email <span className="font-semibold text-gray-900 dark:text-slate-100">{clientEmail}</span> a
                join link for this session&apos;s scheduled time.
              </p>
            ) : (
              <p className="text-sm text-red-600 dark:text-red-400">
                This client has no email on file. Add one to their client record before scheduling a video call.
              </p>
            )}
            {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowConfirm(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300">
                Cancel
              </button>
              <button
                type="button"
                onClick={scheduleCall}
                disabled={scheduling || !clientEmail}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
              >
                {scheduling ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully. `SessionVideoCall` isn't imported anywhere yet, so this only
  checks it compiles standalone.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/clients/SessionVideoCall.tsx
  git commit -m "feat: video chat in sessions — SessionVideoCall component"
  ```

---

## Task 5: Wire into the session detail page

**Files:**
- Modify: `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx`
- Modify: `src/components/clients/SessionDetailClient.tsx`

**Interfaces:**
- Consumes: `SessionVideoCall` (Task 4)

- [ ] **Step 1: Fetch client email and linked call on the server page**

Read `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx` first. Make these changes:

1. Change the `clients` select to also fetch `email`:
```typescript
    supabase
      .from('clients')
      .select('id, name, email')
      .eq('id', id)
      .maybeSingle(),
```

2. After the existing `series` block (before the final `return`), add:
```typescript
  let call: { id: string; startsAt: string; summary: string | null } | null = null
  const { data: callRow } = await supabase
    .from('scheduled_calls')
    .select('id, starts_at, summary')
    .eq('session_id', sessionId)
    .maybeSingle()
  if (callRow) {
    call = { id: callRow.id, startsAt: callRow.starts_at, summary: callRow.summary }
  }
```

3. Pass the new props into `<SessionDetailClient ... />`, alongside the existing `series={series}`:
```typescript
      clientEmail={client.email}
      call={call}
```

- [ ] **Step 2: Render SessionVideoCall in SessionDetailClient**

Read `src/components/clients/SessionDetailClient.tsx` first. Make these changes:

1. Add the import:
```typescript
import SessionVideoCall from '@/components/clients/SessionVideoCall'
```

2. Add `clientEmail` and `call` to the destructured props and type signature (alongside the
   existing `series`):
```typescript
  linkedProgram,
  series,
  clientEmail,
  call,
}: {
  session: { id: string; title: string; scheduledAt: string; durationMinutes: number; notes: string; status: Status }
  todos: Todo[]
  clientId: string
  clientName: string
  orgId: string | null
  linkedProgram: LinkedProgramBundle | null
  series: SessionSeriesInfo | null
  clientEmail: string | null
  call: { id: string; startsAt: string; summary: string | null } | null
}) {
```

3. In the header's `<div className="flex flex-wrap items-center gap-2">` block, insert
   `<SessionVideoCall clientId={clientId} sessionId={initial.id} clientEmail={clientEmail} call={call} />`
   directly after the existing `<SessionRecurrence ... />` line and before the status badge span:
```typescript
              <SessionProgramLink sessionId={initial.id} orgId={orgId} linkedProgram={linkedProgram} />
              <SessionRecurrence sessionId={initial.id} series={series} clientId={clientId} />
              <SessionVideoCall clientId={clientId} sessionId={initial.id} clientEmail={clientEmail} call={call} />
              <span className={`rounded-xl px-3 py-1 text-xs font-bold ${STATUS_STYLE[status]}`}>
```

- [ ] **Step 3: Verify build passes**

  ```
  pnpm run build
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add "src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx" src/components/clients/SessionDetailClient.tsx
  git commit -m "feat: video chat in sessions — SessionVideoCall wired into session detail page"
  ```

---

## Task 6: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: `pnpm run build`** — final clean check after all tasks.

- [ ] **Step 2: Manual browser smoke test** (no test runner in this project). **This step sends a
  real email and creates a real Daily.co room — small real cost, already an accepted pattern for
  this org's existing video feature**:
  1. Open a session for a client that has an email on file. Click "Schedule video call", confirm
     the modal shows the client's actual email, click "Send invite".
  2. Confirm the page updates to show "Join call" + the session's date/time, and that the test
     client's inbox actually received the invite email with a working join link.
  3. Open a session for a client with **no** email on file. Click "Schedule video call" — confirm
     the modal shows the "no email" message and "Send invite" is disabled.
  4. Click "Join call" — confirm it opens the Daily.co room exactly like joining from the Video
     page does today.
  5. If practical, actually join and leave the call to let the existing transcript/summary
     pipeline run, then refresh the session page and confirm "View summary" appears and shows the
     AI summary text.
  6. Confirm the org's existing Video page (`/dashboard/video`) still shows this call in its list
     like any other call — nothing about the session link should hide it from the normal view.

- [ ] **Step 3:** Report pass/fail; fix inline if something's off before finishing.

---

## Acceptance checklist
- [ ] Task 1: `scheduled_calls.session_id` + `reminder_1hour_sent` exist, migration committed
- [ ] Task 2: video call creation route works, mirrors the existing schedule route's Daily.co/email logic
- [ ] Task 3: 1-hour reminder fires via the existing cron, reuses its exact patterns
- [ ] Task 4: `SessionVideoCall` compiles clean, all three states implemented
- [ ] Task 5: wired into the session detail page correctly
- [ ] Task 6: full manual smoke test passes (real email + real Daily.co room)

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser
smoke test required for Task 6 (no test runner in this project) — this is the step with real
external side effects (email send, Daily.co room creation).
