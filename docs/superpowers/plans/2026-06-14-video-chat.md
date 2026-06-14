# Video Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app video calling — instant calls from group/channel chat, scheduled calls with org member and external guest invites, Resend email notifications, and a Video hub page with a weekly/monthly calendar.

**Architecture:** Daily.co handles all WebRTC via their REST API (server-side room/token creation) and browser SDK (client-side call rendering). Supabase stores call metadata in two new tables. Four Next.js API routes cover room lifecycle and token issuance. A pg_cron job fires every 5 minutes to send Resend reminder emails 15 minutes before scheduled calls.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase (RLS + pg_cron), `@daily-co/daily-js` (browser SDK), Resend (existing `sendEmail` helper), Daily.co REST API (plain `fetch`).

**Division of labour (handover loop):**
- **Codex** — all `.ts`/`.tsx`/`.sql` file creation and edits.
- **Conductor** — `pnpm run build`, `pnpm add`, Supabase MCP `apply_migration`, commits. Steps marked `[CONDUCTOR]` must NOT be executed by Codex.

---

## File Map

| File | Action |
|------|--------|
| `supabase/schema-055-video-calls.sql` | Create — tables + RLS + pg_cron reminder job |
| `src/app/api/video/rooms/route.ts` | Create — POST: instant call |
| `src/app/api/video/rooms/[name]/route.ts` | Create — DELETE: end call |
| `src/app/api/video/schedule/route.ts` | Create — POST: scheduled call + invites |
| `src/app/api/video/token/route.ts` | Create — GET: issue meeting token |
| `src/app/api/video/send-reminders/route.ts` | Create — GET: cron target, send reminder emails |
| `src/components/video/CallRoom.tsx` | Create — `'use client'`, mounts Daily.co iframe |
| `src/components/video/VideoCalendar.tsx` | Create — `'use client'`, weekly/monthly calendar |
| `src/components/video/ScheduleCallDialog.tsx` | Create — `'use client'`, schedule call modal |
| `src/components/video/StartCallButton.tsx` | Create — instant call button for chat header |
| `src/components/video/VideoPageClient.tsx` | Create — `'use client'` controls for Video hub |
| `src/components/video/GuestJoinClient.tsx` | Create — `'use client'` guest name entry + CallRoom mount |
| `src/app/dashboard/video/page.tsx` | Create — Video hub |
| `src/app/dashboard/video/[roomId]/page.tsx` | Create — full-page call view |
| `src/app/join/[guestToken]/page.tsx` | Create — public guest join page |
| `src/components/nav/SidebarNav.tsx` | Modify — add Video nav item |
| `src/components/chat/ChatClient.tsx` | Modify — add StartCallButton in chat header |

---

## Task 1 — Database migration

**Files:**
- Create: `supabase/schema-055-video-calls.sql`

- [ ] **Step C1-1 (Codex): Create `supabase/schema-055-video-calls.sql`**

```sql
-- ============================================================
-- TimeWiseHub — Schema 055: Video calls
-- ============================================================

create table if not exists scheduled_calls (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid references organisations on delete cascade not null,
  title            text not null,
  starts_at        timestamptz,
  ends_at          timestamptz,
  created_by       uuid references auth.users on delete cascade not null,
  daily_room_name  text,
  room_url         text,
  reminder_sent    boolean not null default false,
  created_at       timestamptz not null default now()
);

alter table scheduled_calls enable row level security;

-- Org members can view calls for their org
create policy "org members can view calls"
  on scheduled_calls for select
  using (
    exists (
      select 1 from organisation_members
      where organisation_members.org_id = scheduled_calls.org_id
        and organisation_members.user_id = auth.uid()
    )
  );

-- Owner/admin/manager can create/update/delete
create policy "managers can manage calls"
  on scheduled_calls for all
  using (
    exists (
      select 1 from organisation_members
      where organisation_members.org_id = scheduled_calls.org_id
        and organisation_members.user_id = auth.uid()
        and organisation_members.role in ('owner', 'admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from organisation_members
      where organisation_members.org_id = scheduled_calls.org_id
        and organisation_members.user_id = auth.uid()
        and organisation_members.role in ('owner', 'admin', 'manager')
    )
  );

-- Allow all org members to insert instant calls (any member can start)
create policy "org members can start instant calls"
  on scheduled_calls for insert
  with check (
    exists (
      select 1 from organisation_members
      where organisation_members.org_id = scheduled_calls.org_id
        and organisation_members.user_id = auth.uid()
    )
  );

create table if not exists call_invitees (
  id            uuid primary key default gen_random_uuid(),
  call_id       uuid references scheduled_calls on delete cascade not null,
  user_id       uuid references auth.users on delete cascade,
  email         text not null,
  display_name  text,
  status        text not null default 'pending',
  guest_token   uuid not null default gen_random_uuid()
);

alter table call_invitees enable row level security;

-- Users can read/update their own invitee rows
create policy "users manage own invitee rows"
  on call_invitees for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Call creator can read all invitees for their calls
create policy "call creator can read invitees"
  on call_invitees for select
  using (
    exists (
      select 1 from scheduled_calls
      where scheduled_calls.id = call_invitees.call_id
        and scheduled_calls.created_by = auth.uid()
    )
  );

-- Managers can insert invitees (when scheduling a call)
create policy "managers can insert invitees"
  on call_invitees for insert
  with check (
    exists (
      select 1 from scheduled_calls
      join organisation_members
        on organisation_members.org_id = scheduled_calls.org_id
      where scheduled_calls.id = call_invitees.call_id
        and organisation_members.user_id = auth.uid()
        and organisation_members.role in ('owner', 'admin', 'manager')
    )
  );

-- pg_cron: send call reminders every 5 minutes
select cron.schedule(
  'video-call-reminders',
  '*/5 * * * *',
  $$
  select net.http_get(
    url     := 'https://timewisehub.vercel.app/api/video/send-reminders',
    headers := '{"Content-Type":"application/json","x-cron-secret":"484975b6-1f16-484a-a991-5f51b963a32f"}'::jsonb
  )
  $$
);
```

- [ ] **Step C1-2 [CONDUCTOR]: Apply migration via Supabase MCP**

```
apply_migration(name: "schema-055-video-calls", query: <contents of the file above>)
```

- [ ] **Step C1-3 [CONDUCTOR]: Commit**

```bash
git add supabase/schema-055-video-calls.sql
git commit -m "feat: add video calls schema (scheduled_calls, call_invitees, reminder cron)"
```

---

## Task 2 — Install Daily.co browser SDK

**Files:** none (package install only)

- [ ] **Step C2-1 [CONDUCTOR]: Install package**

```bash
pnpm add @daily-co/daily-js
```

- [ ] **Step C2-2 [CONDUCTOR]: Commit**

```bash
git add pnpm-lock.yaml package.json
git commit -m "feat: add @daily-co/daily-js browser SDK"
```

---

## Task 3 — API: POST /api/video/rooms (instant call)

**Files:**
- Create: `src/app/api/video/rooms/route.ts`

- [ ] **Step C3-1 (Codex): Create `src/app/api/video/rooms/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const DAILY_API = 'https://api.daily.co/v1'

async function dailyFetch(path: string, method: string, body?: unknown) {
  const res = await fetch(`${DAILY_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Daily.co ${method} ${path} failed: ${res.status} ${text}`)
  }
  return res.json()
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { org_id: orgId } = await req.json() as { org_id?: string }
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not an org member' }, { status: 403 })

  const exp = Math.floor(Date.now() / 1000) + 4 * 60 * 60 // 4 hours

  const room = await dailyFetch('/rooms', 'POST', {
    properties: { exp },
  }) as { name: string; url: string }

  const { data: call, error } = await supabase
    .from('scheduled_calls')
    .insert({
      org_id: orgId,
      title: 'Instant call',
      created_by: user.id,
      daily_room_name: room.name,
      room_url: room.url,
    })
    .select('id')
    .single()

  if (error || !call) {
    await dailyFetch(`/rooms/${room.name}`, 'DELETE')
    return NextResponse.json({ error: 'Failed to save call' }, { status: 500 })
  }

  const tokenData = await dailyFetch('/meeting-tokens', 'POST', {
    properties: {
      room_name: room.name,
      is_owner: true,
      exp,
    },
  }) as { token: string }

  return NextResponse.json({ roomId: call.id, roomUrl: room.url, token: tokenData.token })
}
```

- [ ] **Step C3-2 [CONDUCTOR]: Commit**

```bash
git add src/app/api/video/rooms/route.ts
git commit -m "feat: add POST /api/video/rooms instant call route"
```

---

## Task 4 — API: DELETE /api/video/rooms/[name] (end call)

**Files:**
- Create: `src/app/api/video/rooms/[name]/route.ts`

- [ ] **Step C4-1 (Codex): Create `src/app/api/video/rooms/[name]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const DAILY_API = 'https://api.daily.co/v1'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: call } = await supabase
    .from('scheduled_calls')
    .select('id, created_by')
    .eq('daily_room_name', name)
    .maybeSingle()

  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  if (call.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the call creator can end the call' }, { status: 403 })
  }

  await fetch(`${DAILY_API}/rooms/${name}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}` },
  })

  await supabase
    .from('scheduled_calls')
    .update({ ends_at: new Date().toISOString() })
    .eq('id', call.id)
    .is('ends_at', null)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step C4-2 [CONDUCTOR]: Commit**

```bash
git add "src/app/api/video/rooms/[name]/route.ts"
git commit -m "feat: add DELETE /api/video/rooms/[name] end call route"
```

---

## Task 5 — API: GET /api/video/token (issue meeting token)

**Files:**
- Create: `src/app/api/video/token/route.ts`

- [ ] **Step C5-1 (Codex): Create `src/app/api/video/token/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

const DAILY_API = 'https://api.daily.co/v1'

async function issueToken(roomName: string, isOwner: boolean, displayName?: string) {
  const exp = Math.floor(Date.now() / 1000) + 4 * 60 * 60
  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        is_owner: isOwner,
        exp,
        ...(displayName ? { user_name: displayName } : {}),
      },
    }),
  })
  if (!res.ok) throw new Error(`Token issue failed: ${res.status}`)
  const data = await res.json() as { token: string }
  return data.token
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const room = searchParams.get('room')
  const guestToken = searchParams.get('guestToken')
  const displayName = searchParams.get('displayName') ?? undefined

  if (!room) return NextResponse.json({ error: 'room required' }, { status: 400 })

  // External guest path
  if (guestToken) {
    const service = createServiceClient()
    const { data: invitee } = await service
      .from('call_invitees')
      .select('id, call_id, scheduled_calls(daily_room_name)')
      .eq('guest_token', guestToken)
      .maybeSingle()

    if (!invitee) return NextResponse.json({ error: 'Invalid guest token' }, { status: 403 })

    const roomName = (invitee.scheduled_calls as unknown as { daily_room_name: string } | null)
      ?.daily_room_name
    if (roomName !== room) return NextResponse.json({ error: 'Token/room mismatch' }, { status: 403 })

    const token = await issueToken(room, false, displayName)
    return NextResponse.json({ token })
  }

  // Org member path
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: call } = await supabase
    .from('scheduled_calls')
    .select('id, created_by, org_id')
    .eq('daily_room_name', room)
    .maybeSingle()

  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', call.org_id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not an org member' }, { status: 403 })

  const token = await issueToken(room, call.created_by === user.id, displayName)
  return NextResponse.json({ token })
}
```

- [ ] **Step C5-2 [CONDUCTOR]: Commit**

```bash
git add src/app/api/video/token/route.ts
git commit -m "feat: add GET /api/video/token meeting token route"
```

---

## Task 6 — API: POST /api/video/schedule (scheduled call + invites)

**Files:**
- Create: `src/app/api/video/schedule/route.ts`

- [ ] **Step C6-1 (Codex): Create `src/app/api/video/schedule/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { sendEmail } from '@/lib/email-notifications'

const DAILY_API = 'https://api.daily.co/v1'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

type Invitee = {
  userId?: string | null
  email: string
  displayName?: string
}

type SchedulePayload = {
  org_id?: string
  title?: string
  starts_at?: string
  ends_at?: string
  invitees?: Invitee[]
}

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

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { org_id: orgId, title, starts_at: startsAt, ends_at: endsAt, invitees = [] } =
    (await req.json()) as SchedulePayload

  if (!orgId || !title || !startsAt || !endsAt) {
    return NextResponse.json({ error: 'org_id, title, starts_at, ends_at required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: membership } = await service
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner/admin/manager only' }, { status: 403 })
  }

  const { data: profile } = await service
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const organiserName = (profile as unknown as { full_name: string | null } | null)?.full_name ?? 'A team member'

  const endsAtMs = new Date(endsAt).getTime()
  const exp = Math.floor(endsAtMs / 1000) + 60 * 60 // 1h after ends_at

  const roomRes = await fetch(`${DAILY_API}/rooms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties: { exp } }),
  })
  if (!roomRes.ok) {
    const text = await roomRes.text()
    return NextResponse.json({ error: `Daily.co room creation failed: ${text}` }, { status: 502 })
  }
  const room = (await roomRes.json()) as { name: string; url: string }

  const { data: call, error: callError } = await service
    .from('scheduled_calls')
    .insert({
      org_id: orgId,
      title,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by: user.id,
      daily_room_name: room.name,
      room_url: room.url,
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

  const timeLabel = formatCallTime(startsAt)

  await Promise.all(
    invitees.map(async (inv) => {
      const { data: inviteeRow } = await service
        .from('call_invitees')
        .insert({
          call_id: call.id,
          user_id: inv.userId ?? null,
          email: inv.email,
          display_name: inv.displayName ?? null,
        })
        .select('guest_token')
        .single()

      const guestToken = (inviteeRow as unknown as { guest_token: string } | null)?.guest_token
      const isExternal = !inv.userId
      const joinUrl = isExternal
        ? `${APP_URL}/join/${guestToken}`
        : `${APP_URL}/dashboard/video/${call.id}`

      const subject = `${organiserName} invited you to a call: ${title}`
      const html = `
        <p>Hi ${inv.displayName ?? inv.email},</p>
        <p><strong>${organiserName}</strong> has scheduled a video call: <strong>${title}</strong></p>
        <p>When: ${timeLabel}</p>
        <p><a href="${joinUrl}" style="display:inline-block;padding:10px 20px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none">Join call</a></p>
        <p style="color:#888;font-size:12px">Or paste this link: ${joinUrl}</p>
      `
      const text = `${organiserName} invited you to a call: ${title}\nWhen: ${timeLabel}\nJoin: ${joinUrl}`

      await sendEmail({ to: inv.email, subject, text, html })
    })
  )

  return NextResponse.json({ callId: call.id, roomUrl: room.url })
}
```

- [ ] **Step C6-2 [CONDUCTOR]: Commit**

```bash
git add src/app/api/video/schedule/route.ts
git commit -m "feat: add POST /api/video/schedule route with Resend invites"
```

---

## Task 7 — API: GET /api/video/send-reminders (cron target)

**Files:**
- Create: `src/app/api/video/send-reminders/route.ts`

- [ ] **Step C7-1 (Codex): Create `src/app/api/video/send-reminders/route.ts`**

```ts
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
```

- [ ] **Step C7-2 [CONDUCTOR]: Commit**

```bash
git add src/app/api/video/send-reminders/route.ts
git commit -m "feat: add GET /api/video/send-reminders cron target"
```

---

## Task 8 — CallRoom component

**Files:**
- Create: `src/components/video/CallRoom.tsx`

- [ ] **Step C8-1 (Codex): Create `src/components/video/CallRoom.tsx`**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import DailyIframe from '@daily-co/daily-js'

type Props = {
  roomUrl: string
  token: string
  dailyRoomName: string
  isCreator: boolean
}

export default function CallRoom({ roomUrl, token, dailyRoomName, isCreator }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<ReturnType<typeof DailyIframe.createFrame> | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!containerRef.current) return

    const frame = DailyIframe.createFrame(containerRef.current, {
      showLeaveButton: false,
      showFullscreenButton: true,
      iframeStyle: {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        border: 'none',
      },
    })

    frame.join({ url: roomUrl, token })
    frameRef.current = frame

    frame.on('left-meeting', () => {
      router.push('/dashboard/video')
    })

    return () => {
      frame.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLeave() {
    if (isCreator) {
      await fetch(`/api/video/rooms/${dailyRoomName}`, { method: 'DELETE' })
    }
    frameRef.current?.leave()
  }

  return (
    <div className="relative flex flex-col h-screen bg-slate-950">
      {/* Video frame fills the screen */}
      <div ref={containerRef} className="relative flex-1" />

      {/* Leave button overlay */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
        <button
          onClick={handleLeave}
          className="px-6 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors shadow-xl"
        >
          {isCreator ? 'End call for everyone' : 'Leave call'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step C8-2 [CONDUCTOR]: Commit**

```bash
git add src/components/video/CallRoom.tsx
git commit -m "feat: add CallRoom client component using Daily.co SDK"
```

---

## Task 9 — VideoCalendar component

**Files:**
- Create: `src/components/video/VideoCalendar.tsx`

- [ ] **Step C9-1 (Codex): Create `src/components/video/VideoCalendar.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type ScheduledCall = {
  id: string
  title: string
  starts_at: string | null
  ends_at: string | null
  daily_room_name: string | null
}

type Props = {
  calls: ScheduledCall[]
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function VideoCalendar({ calls }: Props) {
  const [view, setView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const router = useRouter()

  const now = new Date()

  function callsForDay(day: Date): ScheduledCall[] {
    return calls.filter(c => {
      if (!c.starts_at) return false
      return sameDay(new Date(c.starts_at), day)
    })
  }

  function isLive(call: ScheduledCall): boolean {
    if (!call.starts_at) return false
    const start = new Date(call.starts_at)
    const end = call.ends_at ? new Date(call.ends_at) : addDays(start, 0)
    return now >= start && now <= end
  }

  function handleCallClick(call: ScheduledCall) {
    router.push(`/dashboard/video/${call.id}`)
  }

  if (view === 'week') {
    const weekStart = startOfWeek(anchor)
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const weekLabel = `${days[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setAnchor(a => addDays(a, -7))} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={18} /></button>
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{weekLabel}</span>
            <button onClick={() => setAnchor(a => addDays(a, 7))} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight size={18} /></button>
          </div>
          <button onClick={() => setView('month')} className="text-xs text-violet-600 hover:underline">Month view</button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-xs font-semibold text-slate-500 py-1">{d}</div>
          ))}
          {days.map((day, i) => {
            const dayCalls = callsForDay(day)
            const isToday = sameDay(day, now)
            return (
              <div key={i} className={`min-h-24 rounded-lg p-1.5 border ${isToday ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
                <p className={`text-xs font-semibold mb-1 ${isToday ? 'text-violet-600' : 'text-slate-400'}`}>{day.getDate()}</p>
                {dayCalls.map(call => (
                  <button
                    key={call.id}
                    onClick={() => handleCallClick(call)}
                    className={`w-full text-left text-xs rounded px-1.5 py-1 mb-1 truncate font-medium transition-colors ${
                      isLive(call)
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                        : 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900'
                    }`}
                  >
                    {call.starts_at && formatTime(call.starts_at)} {call.title}
                    {isLive(call) && ' • LIVE'}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Month view
  const monthStart = startOfMonth(anchor)
  const firstDayOfWeek = ((monthStart.getDay() + 6) % 7) // 0=Mon
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(anchor.getFullYear(), anchor.getMonth(), i + 1)),
  ]
  const monthLabel = `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(a => new Date(a.getFullYear(), a.getMonth() - 1, 1))} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={18} /></button>
          <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{monthLabel}</span>
          <button onClick={() => setAnchor(a => new Date(a.getFullYear(), a.getMonth() + 1, 1))} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight size={18} /></button>
        </div>
        <button onClick={() => setView('week')} className="text-xs text-violet-600 hover:underline">Week view</button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-slate-500 py-1">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />
          const dayCalls = callsForDay(day)
          const isToday = sameDay(day, now)
          return (
            <div key={i} className={`min-h-16 rounded-lg p-1.5 border ${isToday ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
              <p className={`text-xs font-semibold mb-1 ${isToday ? 'text-violet-600' : 'text-slate-400'}`}>{day.getDate()}</p>
              {dayCalls.slice(0, 2).map(call => (
                <button
                  key={call.id}
                  onClick={() => handleCallClick(call)}
                  className={`w-full text-left text-xs rounded px-1 py-0.5 mb-0.5 truncate ${
                    isLive(call) ? 'bg-emerald-500 text-white' : 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300'
                  }`}
                >
                  {call.title}
                </button>
              ))}
              {dayCalls.length > 2 && (
                <p className="text-xs text-slate-400">+{dayCalls.length - 2} more</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step C9-2 [CONDUCTOR]: Commit**

```bash
git add src/components/video/VideoCalendar.tsx
git commit -m "feat: add VideoCalendar component with week/month toggle"
```

---

## Task 10 — ScheduleCallDialog component

**Files:**
- Create: `src/components/video/ScheduleCallDialog.tsx`

- [ ] **Step C10-1 (Codex): Create `src/components/video/ScheduleCallDialog.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, Trash2 } from 'lucide-react'

type OrgMember = {
  userId: string
  email: string
  fullName: string | null
}

type Props = {
  orgId: string
  members: OrgMember[]
  onClose: () => void
}

type ExternalGuest = { email: string; displayName: string }

export default function ScheduleCallDialog({ orgId, members, onClose }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [durationMins, setDurationMins] = useState('60')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [externalGuests, setExternalGuests] = useState<ExternalGuest[]>([])
  const [guestEmail, setGuestEmail] = useState('')
  const [guestName, setGuestName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleMember(userId: string) {
    setSelectedMemberIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  function addGuest() {
    if (!guestEmail.trim()) return
    setExternalGuests(prev => [...prev, { email: guestEmail.trim(), displayName: guestName.trim() }])
    setGuestEmail('')
    setGuestName('')
  }

  function removeGuest(i: number) {
    setExternalGuests(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title || !date || !startTime) return
    setSaving(true)
    setError(null)

    const startsAt = new Date(`${date}T${startTime}`).toISOString()
    const endsAt = new Date(new Date(startsAt).getTime() + Number(durationMins) * 60 * 1000).toISOString()

    const invitees = [
      ...selectedMemberIds.map(userId => {
        const m = members.find(m => m.userId === userId)
        return { userId, email: m?.email ?? '', displayName: m?.fullName ?? undefined }
      }),
      ...externalGuests.map(g => ({ userId: null, email: g.email, displayName: g.displayName || undefined })),
    ]

    const res = await fetch('/api/video/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, title, starts_at: startsAt, ends_at: endsAt, invitees }),
    })

    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Failed to schedule call')
      setSaving(false)
      return
    }

    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Schedule a call</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              placeholder="Weekly team standup"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start time</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Duration</label>
            <select
              value={durationMins}
              onChange={e => setDurationMins(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {[30, 45, 60, 90, 120].map(m => (
                <option key={m} value={m}>{m < 60 ? `${m}m` : `${m / 60}h`}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Invite team members</label>
            <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg border border-slate-200 dark:border-slate-700 p-2">
              {members.map(m => (
                <label key={m.userId} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                  <input
                    type="checkbox"
                    checked={selectedMemberIds.includes(m.userId)}
                    onChange={() => toggleMember(m.userId)}
                    className="rounded accent-violet-600"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{m.fullName ?? m.email}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">External guests</label>
            {externalGuests.map((g, i) => (
              <div key={i} className="flex items-center gap-2 mb-1">
                <span className="text-sm text-slate-600 dark:text-slate-400 flex-1 truncate">{g.displayName ? `${g.displayName} (${g.email})` : g.email}</span>
                <button type="button" onClick={() => removeGuest(i)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input
                type="email"
                value={guestEmail}
                onChange={e => setGuestEmail(e.target.value)}
                placeholder="guest@example.com"
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <input
                type="text"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                placeholder="Name (optional)"
                className="w-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button
                type="button"
                onClick={addGuest}
                className="p-2 rounded-lg bg-violet-100 text-violet-600 hover:bg-violet-200 dark:bg-violet-900/50 dark:text-violet-300"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">Cancel</button>
            <button
              type="submit"
              disabled={saving || !title || !date || !startTime}
              className="px-5 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Scheduling…' : 'Schedule call'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step C10-2 [CONDUCTOR]: Commit**

```bash
git add src/components/video/ScheduleCallDialog.tsx
git commit -m "feat: add ScheduleCallDialog component"
```

---

## Task 11 — StartCallButton component

**Files:**
- Create: `src/components/video/StartCallButton.tsx`

- [ ] **Step C11-1 (Codex): Create `src/components/video/StartCallButton.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Video } from 'lucide-react'

type Props = {
  orgId: string
}

export default function StartCallButton({ orgId }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleClick() {
    setLoading(true)
    const res = await fetch('/api/video/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId }),
    })
    if (res.ok) {
      const { roomId } = await res.json() as { roomId: string }
      router.push(`/dashboard/video/${roomId}`)
    } else {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title="Start video call"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50"
    >
      <Video size={16} />
    </button>
  )
}
```

- [ ] **Step C11-2 [CONDUCTOR]: Commit**

```bash
git add src/components/video/StartCallButton.tsx
git commit -m "feat: add StartCallButton component"
```

---

## Task 12 — Dashboard video hub page

**Files:**
- Create: `src/app/dashboard/video/page.tsx`

- [ ] **Step C12-1 (Codex): Create `src/app/dashboard/video/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import VideoCalendar from '@/components/video/VideoCalendar'
import ScheduleCallDialog from '@/components/video/ScheduleCallDialog'
import StartCallButton from '@/components/video/StartCallButton'

type OrgMember = {
  userId: string
  email: string
  fullName: string | null
}

type ScheduledCall = {
  id: string
  title: string
  starts_at: string | null
  ends_at: string | null
  daily_room_name: string | null
}

export default async function VideoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) redirect('/dashboard')

  const orgId = membership.org_id
  const canSchedule = ['owner', 'admin', 'manager'].includes(membership.role)

  // Load upcoming calls (next 60 days)
  const until = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
  const { data: calls } = await supabase
    .from('scheduled_calls')
    .select('id, title, starts_at, ends_at, daily_room_name')
    .eq('org_id', orgId)
    .or(`starts_at.is.null,starts_at.lte.${until}`)
    .order('starts_at', { ascending: true })

  // Load org members for ScheduleCallDialog
  const { data: rawMembers } = await supabase
    .from('organisation_members')
    .select('user_id, profiles(email, full_name)')
    .eq('org_id', orgId)

  const members: OrgMember[] = (rawMembers ?? [])
    .filter(m => m.user_id !== user.id)
    .map(m => ({
      userId: m.user_id,
      email: (m.profiles as unknown as { email: string; full_name: string | null } | null)?.email ?? '',
      fullName: (m.profiles as unknown as { email: string; full_name: string | null } | null)?.full_name ?? null,
    }))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Video</h1>
          <p className="text-sm text-slate-500 mt-1">Start or schedule team video calls</p>
        </div>
        <div className="flex items-center gap-3">
          <StartCallButton orgId={orgId} />
          {canSchedule && (
            <ScheduleCallDialog orgId={orgId} members={members} onClose={() => {}} />
          )}
        </div>
      </div>

      <VideoCalendar calls={(calls ?? []) as ScheduledCall[]} />
    </div>
  )
}
```

**Note:** The `ScheduleCallDialog` above is used inline (its `onClose` prop is a stub in the server render). To make it openable, update the page to render a client wrapper that controls the open state:

Replace the above with this version that uses a thin client wrapper:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import VideoCalendar from '@/components/video/VideoCalendar'
import VideoPageClient from '@/components/video/VideoPageClient'

type OrgMember = {
  userId: string
  email: string
  fullName: string | null
}

type ScheduledCall = {
  id: string
  title: string
  starts_at: string | null
  ends_at: string | null
  daily_room_name: string | null
}

export default async function VideoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) redirect('/dashboard')

  const orgId = membership.org_id
  const canSchedule = ['owner', 'admin', 'manager'].includes(membership.role)

  const until = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
  const { data: calls } = await supabase
    .from('scheduled_calls')
    .select('id, title, starts_at, ends_at, daily_room_name')
    .eq('org_id', orgId)
    .or(`starts_at.is.null,starts_at.lte.${until}`)
    .order('starts_at', { ascending: true })

  const { data: rawMembers } = await supabase
    .from('organisation_members')
    .select('user_id, profiles(email, full_name)')
    .eq('org_id', orgId)

  const members: OrgMember[] = (rawMembers ?? [])
    .filter(m => m.user_id !== user.id)
    .map(m => ({
      userId: m.user_id,
      email: (m.profiles as unknown as { email: string; full_name: string | null } | null)?.email ?? '',
      fullName: (m.profiles as unknown as { email: string; full_name: string | null } | null)?.full_name ?? null,
    }))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Video</h1>
          <p className="text-sm text-slate-500 mt-1">Start or schedule team video calls</p>
        </div>
        <VideoPageClient orgId={orgId} members={members} canSchedule={canSchedule} />
      </div>
      <VideoCalendar calls={(calls ?? []) as ScheduledCall[]} />
    </div>
  )
}
```

Also create `src/components/video/VideoPageClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Video, CalendarPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import ScheduleCallDialog from './ScheduleCallDialog'

type OrgMember = {
  userId: string
  email: string
  fullName: string | null
}

type Props = {
  orgId: string
  members: OrgMember[]
  canSchedule: boolean
}

export default function VideoPageClient({ orgId, members, canSchedule }: Props) {
  const [showSchedule, setShowSchedule] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function startInstantCall() {
    setLoading(true)
    const res = await fetch('/api/video/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId }),
    })
    if (res.ok) {
      const { roomId } = await res.json() as { roomId: string }
      router.push(`/dashboard/video/${roomId}`)
    } else {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={startInstantCall}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          <Video size={16} />
          {loading ? 'Starting…' : 'Start instant call'}
        </button>
        {canSchedule && (
          <button
            onClick={() => setShowSchedule(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
          >
            <CalendarPlus size={16} />
            Schedule a call
          </button>
        )}
      </div>
      {showSchedule && (
        <ScheduleCallDialog
          orgId={orgId}
          members={members}
          onClose={() => setShowSchedule(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step C12-2 [CONDUCTOR]: Commit**

```bash
git add src/app/dashboard/video/page.tsx src/components/video/VideoPageClient.tsx
git commit -m "feat: add Video hub page and VideoPageClient"
```

---

## Task 13 — Call room page

**Files:**
- Create: `src/app/dashboard/video/[roomId]/page.tsx`

- [ ] **Step C13-1 (Codex): Create `src/app/dashboard/video/[roomId]/page.tsx`**

Token generation is inlined here (no self-fetch round-trip needed):

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import CallRoom from '@/components/video/CallRoom'

const DAILY_API = 'https://api.daily.co/v1'

async function issueOrgMemberToken(roomName: string, isOwner: boolean): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 4 * 60 * 60
  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { room_name: roomName, is_owner: isOwner, exp },
    }),
  })
  if (!res.ok) throw new Error(`Token issue failed: ${res.status}`)
  const data = await res.json() as { token: string }
  return data.token
}

export default async function CallRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: call } = await supabase
    .from('scheduled_calls')
    .select('id, daily_room_name, room_url, created_by, org_id')
    .eq('id', roomId)
    .maybeSingle()

  if (!call?.daily_room_name || !call?.room_url) redirect('/dashboard/video')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', call.org_id)
    .maybeSingle()

  if (!membership) redirect('/dashboard/video')

  let token: string
  try {
    token = await issueOrgMemberToken(call.daily_room_name, call.created_by === user.id)
  } catch {
    redirect('/dashboard/video')
  }

  return (
    <CallRoom
      roomUrl={call.room_url}
      token={token!}
      dailyRoomName={call.daily_room_name}
      isCreator={call.created_by === user.id}
    />
  )
}
```

- [ ] **Step C13-2 [CONDUCTOR]: Commit**

```bash
git add "src/app/dashboard/video/[roomId]/page.tsx"
git commit -m "feat: add call room page"
```

---

## Task 14 — Guest join page (public)

**Files:**
- Create: `src/app/join/[guestToken]/page.tsx`

- [ ] **Step C14-1 (Codex): Create `src/app/join/[guestToken]/page.tsx`**

```tsx
import { createServiceClient } from '@/lib/supabase-service'
import GuestJoinClient from '@/components/video/GuestJoinClient'

export default async function GuestJoinPage({
  params,
}: {
  params: Promise<{ guestToken: string }>
}) {
  const { guestToken } = await params
  const service = createServiceClient()

  const { data: invitee } = await service
    .from('call_invitees')
    .select('id, display_name, scheduled_calls(id, title, starts_at, daily_room_name, room_url)')
    .eq('guest_token', guestToken)
    .maybeSingle()

  const call = (invitee?.scheduled_calls as unknown as {
    id: string
    title: string
    starts_at: string | null
    daily_room_name: string
    room_url: string
  } | null)

  if (!call?.daily_room_name || !call?.room_url) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <p className="text-lg">This invite link is not valid or has expired.</p>
      </div>
    )
  }

  return (
    <GuestJoinClient
      callTitle={call.title}
      roomUrl={call.room_url}
      dailyRoomName={call.daily_room_name}
      guestToken={guestToken}
      defaultName={invitee?.display_name ?? ''}
    />
  )
}
```

Also create `src/components/video/GuestJoinClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import CallRoom from './CallRoom'

type Props = {
  callTitle: string
  roomUrl: string
  dailyRoomName: string
  guestToken: string
  defaultName: string
}

export default function GuestJoinClient({ callTitle, roomUrl, dailyRoomName, guestToken, defaultName }: Props) {
  const [name, setName] = useState(defaultName)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)

    const res = await fetch(
      `/api/video/token?room=${encodeURIComponent(dailyRoomName)}&guestToken=${encodeURIComponent(guestToken)}&displayName=${encodeURIComponent(name.trim())}`,
    )

    if (!res.ok) {
      setError('Unable to join — this link may have expired.')
      setLoading(false)
      return
    }

    const { token: t } = await res.json() as { token: string }
    setToken(t)
  }

  if (token) {
    return (
      <CallRoom
        roomUrl={roomUrl}
        token={token}
        dailyRoomName={dailyRoomName}
        isCreator={false}
      />
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-1">You&apos;re invited</h1>
        <p className="text-slate-400 text-sm mb-6">{callTitle}</p>
        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Your name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Enter your name"
              className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Joining…' : 'Join call'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step C14-2 [CONDUCTOR]: Commit**

```bash
git add "src/app/join/[guestToken]/page.tsx" src/components/video/GuestJoinClient.tsx
git commit -m "feat: add public guest join page and GuestJoinClient"
```

---

## Task 15 — Update SidebarNav (add Video)

**Files:**
- Modify: `src/components/nav/SidebarNav.tsx`

- [ ] **Step C15-1 (Codex): Edit `src/components/nav/SidebarNav.tsx`**

Add `Video` to the lucide-react import line:

```ts
import {
  LayoutDashboard, Clock, CalendarDays, Palmtree, Receipt, Users, FileText,
  TrendingUp, BarChart3, CreditCard, Download, HelpCircle, Settings,
  MessageSquare, Sparkles, CalendarRange, Users2, Video, type LucideIcon,
} from 'lucide-react'
```

In the `NAV_GROUPS` array, in the `Communication` group, add the Video item after Chat:

```ts
  { title: 'Communication', items: [
    { label: 'Chat', href: '/dashboard/chat', icon: MessageSquare },
    { label: 'Video', href: '/dashboard/video', icon: Video },
    { label: 'Assistant', href: '/dashboard/assistant', icon: Sparkles },
  ] },
```

- [ ] **Step C15-2 [CONDUCTOR]: Commit**

```bash
git add src/components/nav/SidebarNav.tsx
git commit -m "feat: add Video nav item to SidebarNav"
```

---

## Task 16 — Add StartCallButton to ChatClient header

**Files:**
- Modify: `src/components/chat/ChatClient.tsx`

- [ ] **Step C16-1 (Codex): Edit `src/components/chat/ChatClient.tsx`**

Add the import at the top with the other imports:

```ts
import StartCallButton from '@/components/video/StartCallButton'
```

Also add `orgId` to the `useChat()` destructure:

```ts
const { userId, orgId, conversations, members, activeConversationId, setActiveConversation, loading } = useChat()
```

In the chat header section (inside the `{active ? (` block), add the `StartCallButton` next to the existing Settings gear button. The header currently reads:

```tsx
<div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-slate-800">
  <button
    onClick={() => setActiveConversation(null)}
    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 md:hidden"
    aria-label="Back to conversations"
  >
    <ArrowLeft size={18} />
  </button>
  <div className="min-w-0 flex-1">
    <h3 className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{title}</h3>
    {isChannel && (
      <p className="text-xs font-medium text-gray-400">Org-wide · managers can post</p>
    )}
  </div>
  {isGroup && (
    <button
      onClick={() => setShowGroupSettings(v => !v)}
      ...
    >
      <Settings size={16} />
    </button>
  )}
</div>
```

Replace the header `<div>` with this (adds StartCallButton for groups and channels, not DMs):

```tsx
<div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-slate-800">
  <button
    onClick={() => setActiveConversation(null)}
    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 md:hidden"
    aria-label="Back to conversations"
  >
    <ArrowLeft size={18} />
  </button>
  <div className="min-w-0 flex-1">
    <h3 className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{title}</h3>
    {isChannel && (
      <p className="text-xs font-medium text-gray-400">Org-wide · managers can post</p>
    )}
  </div>
  {(isChannel || isGroup) && orgId && (
    <StartCallButton orgId={orgId} />
  )}
  {isGroup && (
    <button
      onClick={() => setShowGroupSettings(v => !v)}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
        showGroupSettings
          ? 'bg-cyan-50 text-cyan-500 dark:bg-slate-700'
          : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
      }`}
      title="Group settings"
    >
      <Settings size={16} />
    </button>
  )}
</div>
```

**Note:** This step requires `orgId` to be exposed from `useChat()` / `ChatRealtimeProvider`. Check `src/components/chat/ChatRealtimeProvider.tsx` — if `orgId` is already in the context value (it was added in Phase 21 C2-2), the destructure above will work. If not, add it to `ChatContextValue` and the `value` object in the provider, reading it from the org query that already runs there.

- [ ] **Step C16-2 [CONDUCTOR]: `pnpm run build` — must pass clean**

- [ ] **Step C16-3 [CONDUCTOR]: Commit**

```bash
git add src/components/chat/ChatClient.tsx
git commit -m "feat: add StartCallButton to chat header for groups and channels"
```

---

## Verification

`pnpm run build` must pass clean after Task 16.

Manual smoke:
- Sidebar: "Video" item appears in Communication group between Chat and Assistant
- Video hub (`/dashboard/video`): calendar renders, "Start instant call" and (if admin/manager) "Schedule a call" buttons visible
- Instant call: clicking "Start instant call" or the camera icon in a chat group header navigates to `/dashboard/video/[roomId]` and the Daily.co video UI loads
- Scheduled call: admin fills in ScheduleCallDialog, submit sends invite emails and call appears on calendar
- Guest join: visiting `/join/[guestToken]` shows "You're invited" screen, entering name loads CallRoom
- "End call for everyone" (creator) deletes the Daily.co room; "Leave call" (non-creator) just exits
- Reminder emails: manual test — create a call starting in 11 minutes, wait for pg_cron to fire, check that reminder arrives
