# Video Chat in Sessions

## Goal
Let a client Session have a video call attached to it — auto-scheduled from the session's own
time, the client gets an email invite immediately and a reminder 1 hour before, and once the call
ends its AI summary shows on the session page.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-02-video-chat-in-sessions-design.md`
- Source plan: `docs/superpowers/plans/2026-07-02-video-chat-in-sessions.md`
- One new nullable FK `scheduled_calls.session_id` (on delete set null) + `reminder_1hour_sent`
  boolean. No RLS changes.
- New creation route mirrors `POST /api/video/schedule` almost exactly (same Daily.co room
  creation, same invite-email template/sender) but auto-fills from the session and always has
  exactly one invitee: the client. Same `isTeamPlan(sub)` Business-plan gate as the existing route.
- If the client has no email on file, scheduling is blocked with a clear message — no call created.
- 1-hour reminder is a third block bolted onto the existing `/api/notifications/upcoming` cron
  (55–65 min window, same push/email branching as the existing 30-min/5-min blocks). No new cron.
- Out of scope: cancel/reschedule from the session page (use the Video page), multiple calls per
  session, keeping the call's time in sync if the session's time changes later.
- Spend: real (small) cost during C-6 manual testing only — one Daily.co room + one Resend email.
  User approved 2026-07-02, same accepted pattern as the existing video feature.
- Codex handles text edits only; conductor (Claude) runs all shell/build/git and the DB migration
  via Supabase MCP (Windows: Codex's workspace-write sandbox cannot spawn subprocesses).
- Verification gate: `pnpm run build` (tsc + eslint) after every turn. No test runner.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node).
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.
- All Tailwind classes must include `dark:` variants.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1 is conductor-only (no Codex dispatch needed) — DB migration via Supabase MCP.
- C-6 needs a manual browser smoke test (no test runner) before ticking it done — real email +
  real Daily.co room created here.

---

## C-1 — Database migration

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-076-video-chat-sessions.sql`:
  ```sql
  alter table public.scheduled_calls
    add column session_id uuid references public.sessions(id) on delete set null,
    add column reminder_1hour_sent boolean not null default false;

  create index scheduled_calls_session on public.scheduled_calls (session_id) where session_id is not null;
  ```
- [x] Apply via Supabase MCP `apply_migration` (name: `video_chat_sessions`)
- [x] Verify via MCP `execute_sql`:
  ```sql
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'scheduled_calls'
    and column_name in ('session_id', 'reminder_1hour_sent');
  ```
  Expected: 2 rows — `session_id` (uuid, nullable), `reminder_1hour_sent` (boolean, default false).
- [x] Commit: `git add supabase/schema-076-video-chat-sessions.sql && git commit -m "feat: video chat in sessions — session_id link + reminder flag (DB migration)"`

---

## C-2 — Video call creation API route

*Codex edits:*
- [x] Create `src/app/api/clients/[id]/sessions/[sessionId]/video-call/route.ts`:
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
  (Mirrors `src/app/api/video/schedule/route.ts` almost exactly — same Daily.co call, same
  invite-email template/sender — but times/title come from the session and there's exactly one
  invitee: the client.)

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add "src/app/api/clients/[id]/sessions/[sessionId]/video-call/route.ts" && git commit -m "feat: video chat in sessions — video call creation API route"`

---

## C-3 — 1-hour reminder in the notifications cron

*Codex edits:*
- [x] Read `src/app/api/notifications/upcoming/route.ts` first, then:
  - Add this window computation right after the existing `w5Start`/`w5End` lines:
    ```typescript
    // 1-hour window: 55–65 min ahead (scheduled_calls only)
    const w60Start = new Date(now.getTime() + 55 * 60 * 1000).toISOString()
    const w60End   = new Date(now.getTime() + 65 * 60 * 1000).toISOString()
    ```
  - Insert this entire new block immediately before the existing
    `// ── Scheduled calls — 30-min reminder ────` comment:
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
  - Do not change the existing calendar-events blocks or the existing calls-30/calls-5 blocks.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/app/api/notifications/upcoming/route.ts && git commit -m "feat: video chat in sessions — 1-hour call reminder"`

---

## C-4 — SessionVideoCall component

*Codex edits:*
- [ ] Create `src/components/clients/SessionVideoCall.tsx`:
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

*Conductor:*
- [ ] `pnpm run build` — must pass clean. Nothing imports this yet — checks it compiles standalone.
- [ ] Commit: `git add src/components/clients/SessionVideoCall.tsx && git commit -m "feat: video chat in sessions — SessionVideoCall component"`

---

## C-5 — Wire into the session detail page

*Codex edits:*
- [ ] Read `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx` first, then:
  - Change the `clients` select to `.select('id, name, email')`.
  - After the existing `series` block (before the final `return`), add:
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
  - Pass `clientEmail={client.email}` and `call={call}` into `<SessionDetailClient ... />`,
    alongside the existing `series={series}`.
- [ ] Read `src/components/clients/SessionDetailClient.tsx` first, then:
  - Add `import SessionVideoCall from '@/components/clients/SessionVideoCall'`.
  - Add `clientEmail` and `call` to the destructured props and type signature (alongside the
    existing `series`): `clientEmail: string | null` and
    `call: { id: string; startsAt: string; summary: string | null } | null`.
  - In the header's `<div className="flex flex-wrap items-center gap-2">` block, insert
    `<SessionVideoCall clientId={clientId} sessionId={initial.id} clientEmail={clientEmail} call={call} />`
    directly after the existing `<SessionRecurrence ... />` line and before the status badge span.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add "src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx" src/components/clients/SessionDetailClient.tsx && git commit -m "feat: video chat in sessions — SessionVideoCall wired into session detail page"`

---

## C-6 — Manual end-to-end verification

*Conductor + user:*
- [ ] `pnpm run build` — final clean check after all tasks.
- [ ] Manual browser smoke test (no test runner) — **real email + real Daily.co room created
  here**:
  1. Session for a client with an email on file → "Schedule video call" → confirm modal shows
     the real email → "Send invite" → confirm the page updates to "Join call" + date/time and the
     invite email actually arrives with a working join link.
  2. Session for a client with no email on file → confirm the modal shows the "no email" message
     and "Send invite" is disabled.
  3. "Join call" opens the Daily.co room exactly like joining from the Video page does today.
  4. If practical, join/leave the call to let the transcript/summary pipeline run, then refresh
     and confirm "View summary" shows the AI summary text.
  5. Confirm the call still shows normally on `/dashboard/video` — the session link doesn't hide
     it from the existing Video page.
- [ ] Report pass/fail; fix inline if something's off before finishing.

---

## Acceptance checklist
- [x] C-1: `scheduled_calls.session_id` + `reminder_1hour_sent` exist, migration committed
- [x] C-2: video call creation route works, mirrors the existing schedule route's Daily.co/email logic
- [x] C-3: 1-hour reminder fires via the existing cron, reuses its exact patterns
- [ ] C-4: `SessionVideoCall` compiles clean, all three states implemented
- [ ] C-5: wired into the session detail page correctly
- [ ] C-6: full manual smoke test passes (real email + real Daily.co room)

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser
smoke test required for C-6 (no test runner in this project) — this is the step with real
external side effects (email send, Daily.co room creation).
