# Recurring Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a session be marked recurring (weekly/fortnightly/monthly) so future occurrences are generated automatically and stay visible on the calendar in advance, instead of being created one at a time.

**Architecture:** One new table (`session_series`) holds the recurring definition; `sessions.series_id` links generated occurrences back to it. A shared generation module (`src/lib/sessions/series.ts`) is used by both the API routes that start a series and a new daily cron that tops the buffer back up to 8 upcoming occurrences. Plain one-off session creation is untouched — it still inserts directly from the browser exactly as today.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript strict, Tailwind v4, Supabase (`@supabase/ssr` + service client + browser client), Lucide React icons. No new npm dependencies.

## Global Constraints

- Shell is PowerShell on Windows; Bash available for POSIX scripts.
- No test runner. Verification gate is `pnpm run build` (tsc + eslint) after each task.
- No new npm packages.
- Migration file saved as `supabase/schema-NNN-name.sql`. Next available: `075`. Applied via Supabase MCP `apply_migration`.
- Supabase project ID: `sdwwlnnsijcadkdwsvud`.
- All Tailwind classes must include `dark:` variants.
- Buffer size is fixed at 8 upcoming occurrences per active series — not user-configurable.
- Only `weekly`/`fortnightly`/`monthly` intervals — no daily, no custom end dates/counts.
- Cancelling a series sets `is_active = false` and deletes every `sessions` row in that series
  where `status = 'scheduled'` — completed sessions are never touched.
- A session can only ever start (or belong to) one series in its lifetime — once `series_id` is
  set, "Make recurring" never shows again for that session, even if the series was cancelled.
- Cron auth follows the existing `CRON_SECRET` Bearer pattern (see
  `src/app/api/cron/process-recurring-expenses/route.ts`).

---

## File Map

**New files:**
```
supabase/schema-075-recurring-sessions.sql
src/lib/sessions/series.ts
src/app/api/clients/[id]/sessions/series/route.ts
src/app/api/sessions/[id]/series/route.ts
src/app/api/sessions/series/[seriesId]/cancel/route.ts
src/app/api/cron/process-recurring-sessions/route.ts
src/components/clients/SessionRecurrence.tsx
```

**Modified files:**
```
vercel.json                                                     — add the new cron entry
src/components/clients/NewSessionModal.tsx                      — Repeat dropdown
src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx     — fetch linked series info
src/components/clients/SessionDetailClient.tsx                  — render SessionRecurrence
```

---

## Task 1: Database migration

**Files:**
- Create: `supabase/schema-075-recurring-sessions.sql`
- [CONDUCTOR] Apply via Supabase MCP

**Interfaces:**
- Produces: `session_series` table, `session_recurrence_interval` enum, `sessions.series_id` column

- [ ] **Step 1: Write migration file**

```sql
-- supabase/schema-075-recurring-sessions.sql
-- Recurring sessions: session_series definition + sessions.series_id link

create type public.session_recurrence_interval as enum ('weekly', 'fortnightly', 'monthly');

create table public.session_series (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references public.clients on delete cascade,
  org_id              uuid references public.organisations on delete cascade,
  created_by          uuid not null references public.profiles on delete cascade,
  title               text not null,
  duration_minutes    integer not null default 60,
  recurrence_interval public.session_recurrence_interval not null,
  next_scheduled_at   timestamptz not null,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

alter table public.session_series enable row level security;

create policy "Org members can view session series"
  on public.session_series for select
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = session_series.org_id and om.user_id = auth.uid()
    )
  );

create policy "Org admins can manage session series"
  on public.session_series for all
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = session_series.org_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "Creator can manage own session series"
  on public.session_series for all
  using (created_by = auth.uid());

create index session_series_client on public.session_series (client_id);
create index session_series_active on public.session_series (is_active) where is_active = true;

alter table public.sessions
  add column series_id uuid references public.session_series(id) on delete set null;

create index sessions_series on public.sessions (series_id) where series_id is not null;
```

- [ ] **Step 2: Apply migration [CONDUCTOR — run via Supabase MCP apply_migration]**

  Name: `recurring_sessions`
  SQL: the content of `supabase/schema-075-recurring-sessions.sql`

- [ ] **Step 3: Verify [CONDUCTOR]**

  Run via MCP `execute_sql`:
  ```sql
  select table_name from information_schema.tables
  where table_schema = 'public' and table_name = 'session_series';

  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sessions' and column_name = 'series_id';
  ```
  Expected: `session_series` table exists; `sessions.series_id` is `uuid`, nullable.

- [ ] **Step 4: Commit**

  ```bash
  git add supabase/schema-075-recurring-sessions.sql
  git commit -m "feat: recurring sessions — session_series table (DB migration)"
  ```

---

## Task 2: Shared generation module

**Files:**
- Create: `src/lib/sessions/series.ts`

**Interfaces:**
- Produces: `SessionSeriesInterval`, `SessionSeriesInfo` types; `advanceDate(from, interval)`;
  `generateNextOccurrence(service, series)`; `topUpSeries(service, seriesId, target?)`
- Consumed by: Task 3 (API routes), Task 4 (cron), Task 6 (`SessionRecurrence` component + page)

- [ ] **Step 1: Write the module**

Create `src/lib/sessions/series.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export type SessionSeriesInterval = 'weekly' | 'fortnightly' | 'monthly'

export type SessionSeriesInfo = {
  id: string
  recurrence_interval: SessionSeriesInterval
  is_active: boolean
}

type SessionSeriesRow = {
  id: string
  client_id: string
  org_id: string | null
  created_by: string
  title: string
  duration_minutes: number
  recurrence_interval: SessionSeriesInterval
  next_scheduled_at: string
  is_active: boolean
}

export function advanceDate(from: string, interval: SessionSeriesInterval): string {
  const d = new Date(from)
  switch (interval) {
    case 'weekly':      d.setDate(d.getDate() + 7); break
    case 'fortnightly': d.setDate(d.getDate() + 14); break
    case 'monthly':     d.setMonth(d.getMonth() + 1); break
  }
  return d.toISOString()
}

export async function generateNextOccurrence(
  service: SupabaseClient,
  series: SessionSeriesRow,
): Promise<{ id: string } | null> {
  const { data: session, error } = await service
    .from('sessions')
    .insert({
      client_id: series.client_id,
      org_id: series.org_id,
      created_by: series.created_by,
      title: series.title,
      scheduled_at: series.next_scheduled_at,
      duration_minutes: series.duration_minutes,
      status: 'scheduled',
      series_id: series.id,
    })
    .select('id')
    .single()

  if (error || !session) return null

  const { data: templates } = await service
    .from('client_session_templates')
    .select('title, position')
    .eq('client_id', series.client_id)
    .order('position')

  if (templates && templates.length > 0) {
    await service.from('session_todos').insert(
      templates.map(t => ({
        session_id: session.id,
        title: t.title,
        completed: false,
        position: t.position,
      })),
    )
  }

  const nextDate = advanceDate(series.next_scheduled_at, series.recurrence_interval)
  await service.from('session_series').update({ next_scheduled_at: nextDate }).eq('id', series.id)
  series.next_scheduled_at = nextDate

  return session
}

export async function topUpSeries(
  service: SupabaseClient,
  seriesId: string,
  target = 8,
): Promise<number> {
  const { data: seriesRow } = await service
    .from('session_series')
    .select('*')
    .eq('id', seriesId)
    .single()

  if (!seriesRow) return 0

  const series = seriesRow as SessionSeriesRow
  const nowIso = new Date().toISOString()
  const { count } = await service
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('series_id', seriesId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', nowIso)

  let generated = 0
  let remaining = target - (count ?? 0)

  while (remaining > 0) {
    const result = await generateNextOccurrence(service, series)
    if (!result) break
    generated++
    remaining--
  }

  return generated
}
```

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully, 0 TypeScript errors. Nothing imports this module yet, so this
  only checks it compiles standalone.

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/sessions/series.ts
  git commit -m "feat: recurring sessions — shared generation module"
  ```

---

## Task 3: Create-series API routes

**Files:**
- Create: `src/app/api/clients/[id]/sessions/series/route.ts`
- Create: `src/app/api/sessions/[id]/series/route.ts`

**Interfaces:**
- Consumes: `topUpSeries`, `advanceDate` (Task 2)
- Produces: `POST /api/clients/[id]/sessions/series` → `{ seriesId, firstSessionId }`;
  `POST /api/sessions/[id]/series` → the new `session_series` row

- [ ] **Step 1: New-series route (used by the New Session modal's Repeat option)**

Create `src/app/api/clients/[id]/sessions/series/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { topUpSeries } from '@/lib/sessions/series'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, scheduledAt, durationMinutes, recurrenceInterval } = await req.json()
  if (!title?.trim() || !scheduledAt || !recurrenceInterval) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: client } = await service.from('clients').select('id, org_id').eq('id', id).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', client.org_id ?? '').maybeSingle()
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: series, error } = await service.from('session_series').insert({
    client_id: id,
    org_id: client.org_id,
    created_by: user.id,
    title: title.trim(),
    duration_minutes: durationMinutes || 60,
    recurrence_interval: recurrenceInterval,
    next_scheduled_at: new Date(scheduledAt).toISOString(),
  }).select().single()

  if (error || !series) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create series' }, { status: 500 })
  }

  await topUpSeries(service, series.id, 8)

  const { data: firstSession } = await service
    .from('sessions').select('id')
    .eq('series_id', series.id)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ seriesId: series.id, firstSessionId: firstSession?.id ?? null })
}
```

- [ ] **Step 2: Convert-existing-session route (used by "Make recurring" on the session detail page)**

Create `src/app/api/sessions/[id]/series/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { advanceDate, topUpSeries } from '@/lib/sessions/series'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { recurrenceInterval } = await req.json()
  if (!recurrenceInterval) return NextResponse.json({ error: 'recurrenceInterval is required' }, { status: 400 })

  const service = createServiceClient()
  const { data: session } = await service.from('sessions').select('*').eq('id', id).maybeSingle()
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.series_id) return NextResponse.json({ error: 'Session already belongs to a series' }, { status: 409 })

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', session.org_id ?? '').maybeSingle()
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: series, error } = await service.from('session_series').insert({
    client_id: session.client_id,
    org_id: session.org_id,
    created_by: user.id,
    title: session.title,
    duration_minutes: session.duration_minutes,
    recurrence_interval: recurrenceInterval,
    next_scheduled_at: advanceDate(session.scheduled_at, recurrenceInterval),
  }).select().single()

  if (error || !series) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create series' }, { status: 500 })
  }

  await service.from('sessions').update({ series_id: series.id }).eq('id', id)
  await topUpSeries(service, series.id, 8)

  return NextResponse.json(series)
}
```

- [ ] **Step 3: Verify build passes**

  ```
  pnpm run build
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add "src/app/api/clients/[id]/sessions/series/route.ts" "src/app/api/sessions/[id]/series/route.ts"
  git commit -m "feat: recurring sessions — create-series API routes"
  ```

---

## Task 4: Cancel route, cron, vercel.json

**Files:**
- Create: `src/app/api/sessions/series/[seriesId]/cancel/route.ts`
- Create: `src/app/api/cron/process-recurring-sessions/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `topUpSeries` (Task 2)
- Produces: `POST /api/sessions/series/[seriesId]/cancel` → `{ ok: true }`;
  `GET /api/cron/process-recurring-sessions` → `{ ok: true, seriesChecked, totalGenerated }`

- [ ] **Step 1: Cancel route**

Create `src/app/api/sessions/series/[seriesId]/cancel/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function POST(_req: Request, { params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: series } = await service.from('session_series').select('*').eq('id', seriesId).maybeSingle()
  if (!series) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', series.org_id ?? '').maybeSingle()
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await service.from('session_series').update({ is_active: false }).eq('id', seriesId)
  await service.from('sessions').delete().eq('series_id', seriesId).eq('status', 'scheduled')

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Cron route**

Create `src/app/api/cron/process-recurring-sessions/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { topUpSeries } from '@/lib/sessions/series'

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production'
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: activeSeries, error } = await service
    .from('session_series').select('id').eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let totalGenerated = 0
  for (const series of activeSeries ?? []) {
    totalGenerated += await topUpSeries(service, series.id, 8)
  }

  return NextResponse.json({ ok: true, seriesChecked: (activeSeries ?? []).length, totalGenerated })
}
```

- [ ] **Step 3: Add the cron to `vercel.json`**

Read the current file first. Add ONE new entry to the `"crons"` array (it currently has 4
entries — this becomes the 5th), keeping every existing entry unchanged:

```json
{
  "path": "/api/cron/process-recurring-sessions",
  "schedule": "0 2 * * *"
}
```

Full expected result:

```json
{
  "crons": [
    {
      "path": "/api/notifications/upcoming",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/notifications/daily",
      "schedule": "0 22 * * *"
    },
    {
      "path": "/api/cron/timesheet-autosubmit",
      "schedule": "5 0 * * *"
    },
    {
      "path": "/api/cron/process-recurring-expenses",
      "schedule": "0 1 * * *"
    },
    {
      "path": "/api/cron/process-recurring-sessions",
      "schedule": "0 2 * * *"
    }
  ]
}
```

- [ ] **Step 4: Verify build passes**

  ```
  pnpm run build
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add "src/app/api/sessions/series/[seriesId]/cancel/route.ts" src/app/api/cron/process-recurring-sessions/route.ts vercel.json
  git commit -m "feat: recurring sessions — cancel route, daily top-up cron"
  ```

---

## Task 5: NewSessionModal — Repeat dropdown

**Files:**
- Modify: `src/components/clients/NewSessionModal.tsx`

**Interfaces:**
- Consumes: `POST /api/clients/[id]/sessions/series` (Task 3)

- [ ] **Step 1: Add the Repeat dropdown and conditional submit path**

Replace the full contents of `src/components/clients/NewSessionModal.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Template = { id: string; title: string; position: number }
type Repeat = 'none' | 'weekly' | 'fortnightly' | 'monthly'

export default function NewSessionModal({
  clientId,
  orgId,
}: {
  clientId: string
  orgId: string | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [duration, setDuration] = useState(60)
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [templates, setTemplates] = useState<Template[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    supabase
      .from('client_session_templates')
      .select('id, title, position')
      .eq('client_id', clientId)
      .order('position')
      .then(({ data }) => setTemplates(data ?? []))
  }, [open, clientId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !scheduledAt) return
    setSaving(true)
    setError('')

    if (repeat !== 'none') {
      const res = await fetch(`/api/clients/${clientId}/sessions/series`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          scheduledAt,
          durationMinutes: duration,
          recurrenceInterval: repeat,
        }),
      })
      const json = await res.json()
      setSaving(false)
      if (!res.ok) { setError(json.error ?? 'Failed to create recurring session.'); return }
      router.push(`/dashboard/clients/${clientId}/sessions/${json.firstSessionId}`)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in.'); setSaving(false); return }

    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .insert({
        client_id: clientId,
        org_id: orgId,
        created_by: user.id,
        title: title.trim(),
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: duration,
        status: 'scheduled',
      })
      .select('id')
      .single()

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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
      >
        + New session
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-black text-gray-900">New session</h2>
        {error && <p className="mb-3 text-sm font-semibold text-red-600">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Weekly check-in"
              required
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Date &amp; time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Duration (minutes)</label>
            <input
              type="number"
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              min={5}
              max={480}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Repeat</label>
            <select
              value={repeat}
              onChange={e => setRepeat(e.target.value as Repeat)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            >
              <option value="none">Does not repeat</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
            {repeat !== 'none' && (
              <p className="mt-1 text-xs text-gray-400">
                Creates this session plus 7 upcoming occurrences, kept topped up automatically.
              </p>
            )}
          </div>
          {templates.length > 0 && (
            <p className="rounded-xl bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700">
              Checklist will be pre-filled from this client&apos;s saved template ({templates.length} items).
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully. Selecting "Does not repeat" (the default) exercises the exact
  same code path as before this change — no regression to plain session creation.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/clients/NewSessionModal.tsx
  git commit -m "feat: recurring sessions — Repeat dropdown in New Session modal"
  ```

---

## Task 6: SessionRecurrence component + session detail wiring

**Files:**
- Create: `src/components/clients/SessionRecurrence.tsx`
- Modify: `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx`
- Modify: `src/components/clients/SessionDetailClient.tsx`

**Interfaces:**
- Consumes: `SessionSeriesInterval`, `SessionSeriesInfo` (Task 2);
  `POST /api/sessions/[id]/series`, `POST /api/sessions/series/[seriesId]/cancel` (Tasks 3, 4)
- Produces: `SessionRecurrence` rendered in the session detail header

- [ ] **Step 1: Write the SessionRecurrence component**

Create `src/components/clients/SessionRecurrence.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Repeat as RepeatIcon, X } from 'lucide-react'
import type { SessionSeriesInfo, SessionSeriesInterval } from '@/lib/sessions/series'

const INTERVAL_LABEL: Record<SessionSeriesInterval, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
}

export default function SessionRecurrence({
  sessionId,
  series,
}: {
  sessionId: string
  series: SessionSeriesInfo | null
}) {
  const router = useRouter()
  const [showPicker, setShowPicker] = useState(false)
  const [selectedInterval, setSelectedInterval] = useState<SessionSeriesInterval>('weekly')
  const [saving, setSaving] = useState(false)
  const [stopping, setStopping] = useState(false)

  async function makeRecurring() {
    setSaving(true)
    const res = await fetch(`/api/sessions/${sessionId}/series`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recurrenceInterval: selectedInterval }),
    })
    setSaving(false)
    if (!res.ok) return
    setShowPicker(false)
    router.refresh()
  }

  async function stopRecurring() {
    if (!series) return
    setStopping(true)
    await fetch(`/api/sessions/series/${series.id}/cancel`, { method: 'POST' })
    setStopping(false)
    router.refresh()
  }

  if (series?.is_active) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 dark:border-slate-700 dark:text-slate-300">
          <RepeatIcon size={12} />
          Recurring: {INTERVAL_LABEL[series.recurrence_interval]}
        </span>
        <button
          type="button"
          onClick={stopRecurring}
          disabled={stopping}
          className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-50"
        >
          {stopping ? 'Stopping…' : 'Stop recurring'}
        </button>
      </div>
    )
  }

  if (series && !series.is_active) {
    return null
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <RepeatIcon size={12} />
        Make recurring
      </button>

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Make recurring</h2>
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Repeat</label>
            <select
              value={selectedInterval}
              onChange={e => setSelectedInterval(e.target.value as SessionSeriesInterval)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
            <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
              Generates 7 upcoming occurrences on top of this session, kept topped up automatically.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowPicker(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300">
                Cancel
              </button>
              <button
                type="button"
                onClick={makeRecurring}
                disabled={saving}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Make recurring'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Fetch linked series info on the session detail server page**

Read `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx` first. Make these two changes:

1. Add `series_id` to the `sessions` select string:
```typescript
      .select('id, title, scheduled_at, duration_minutes, notes, status, org_id, program_id, series_id, session_todos(id, title, completed, position)')
```

2. After the existing `linkedProgram` block (before the final `return`), add:
```typescript
  let series: SessionSeriesInfo | null = null
  if (session.series_id) {
    const { data: seriesRow } = await supabase
      .from('session_series')
      .select('id, recurrence_interval, is_active')
      .eq('id', session.series_id)
      .maybeSingle()
    series = seriesRow as SessionSeriesInfo | null
  }
```

3. Add the import:
```typescript
import type { SessionSeriesInfo } from '@/lib/sessions/series'
```

4. Pass it down to `SessionDetailClient`:
```typescript
      series={series}
```
(add this line inside the `<SessionDetailClient ... />` props, alongside `linkedProgram={linkedProgram}`)

- [ ] **Step 3: Render SessionRecurrence in SessionDetailClient**

Read `src/components/clients/SessionDetailClient.tsx` first. Make these changes:

1. Add the imports:
```typescript
import SessionRecurrence from '@/components/clients/SessionRecurrence'
import type { SessionSeriesInfo } from '@/lib/sessions/series'
```

2. Add `series` to the destructured props and type signature (alongside `linkedProgram`):
```typescript
  linkedProgram,
  series,
}: {
  session: { id: string; title: string; scheduledAt: string; durationMinutes: number; notes: string; status: Status }
  todos: Todo[]
  clientId: string
  clientName: string
  orgId: string | null
  linkedProgram: LinkedProgramBundle | null
  series: SessionSeriesInfo | null
}) {
```

3. In the header's `<div className="flex flex-wrap items-center gap-2">` block, insert
   `<SessionRecurrence sessionId={initial.id} series={series} />` directly after the existing
   `<SessionProgramLink ... />` line and before the status badge span:
```typescript
              <SessionProgramLink sessionId={initial.id} orgId={orgId} linkedProgram={linkedProgram} />
              <SessionRecurrence sessionId={initial.id} series={series} />
              <span className={`rounded-xl px-3 py-1 text-xs font-bold ${STATUS_STYLE[status]}`}>
```

- [ ] **Step 4: Verify build passes**

  ```
  pnpm run build
  ```
  Expected: Compiled successfully.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/clients/SessionRecurrence.tsx "src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx" src/components/clients/SessionDetailClient.tsx
  git commit -m "feat: recurring sessions — SessionRecurrence control on session detail page"
  ```

---

## Task 7: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: `pnpm run build`** — final clean check after all tasks.

- [ ] **Step 2: Manual browser smoke test** (no test runner in this project):
  1. Open a client's Sessions page, click "+ New session", pick a Repeat value (e.g. Weekly),
     fill in title/date/duration, submit.
  2. Confirm you land on the new session's detail page, and it shows a "Recurring: Weekly" badge
     + "Stop recurring" button (not "Make recurring").
  3. Go back to the client's Sessions list — confirm 8 occurrences now exist, spaced a week apart,
     starting from the date you picked.
  4. Open a plain (non-recurring) existing session, click "Make recurring", pick Fortnightly,
     confirm. Confirm the badge appears and 7 more future occurrences now exist for that client,
     spaced two weeks apart from this session's date.
  5. Click "Stop recurring" on one of the two series. Confirm the badge disappears, and all
     not-yet-happened occurrences for that series are gone from the Sessions list (the session you
     stopped it from should still exist — it's not itself deleted, only *future* ones are).
  6. Confirm a completed session (if any exist) is never deleted by a cancel action.
  7. If a client checklist template exists, confirm newly generated recurring occurrences have it
     pre-filled (matches manual "New Session" behaviour).

- [ ] **Step 3:** Report pass/fail; fix inline if something's off before finishing.

---

## Acceptance checklist
- [ ] Task 1: `session_series` table + `sessions.series_id` exist, migration committed
- [ ] Task 2: shared generation module compiles clean, exports match all consumers
- [ ] Task 3: both create-series routes work (new session, and converting an existing one)
- [ ] Task 4: cancel route + cron + vercel.json entry all in place
- [ ] Task 5: Repeat dropdown in New Session modal, "Does not repeat" path unchanged
- [ ] Task 6: SessionRecurrence renders correctly in all three states (none/active/cancelled)
- [ ] Task 7: full manual smoke test passes

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser
smoke test required for Task 7 (no test runner in this project).
