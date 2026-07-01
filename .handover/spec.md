# Recurring Sessions

## Goal
Let a session be marked recurring (weekly/fortnightly/monthly) so future occurrences are
generated automatically and stay visible on the calendar in advance, instead of being created one
at a time.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-01-recurring-sessions-design.md`
- Source plan: `docs/superpowers/plans/2026-07-01-recurring-sessions.md`
- One new table `session_series` (definition) + `sessions.series_id` (nullable FK, mirrors the
  `program_id` pattern). No new tables beyond that.
- Buffer size fixed at 8 upcoming occurrences per active series. Intervals: weekly/fortnightly/
  monthly only. Series run indefinitely until explicitly cancelled.
- Cancelling sets `is_active = false` and deletes every `sessions` row in that series where
  `status = 'scheduled'` — completed sessions are never touched.
- A session only ever starts/belongs to one series in its lifetime — "Make recurring" never
  shows again once `series_id` is set, even after cancellation.
- Deliberate architecture exception: plain one-off session creation stays exactly as today
  (direct browser Supabase insert in NewSessionModal.tsx, unchanged). Recurring-series operations
  go through new server-side API routes (using the service client) because the daily cron needs
  the exact same generation logic server-side — duplicating it in a client component and a cron
  would be a maintenance hazard. This is scoped narrowly to series operations only.
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
- C-7 needs a manual browser smoke test (no test runner) before ticking it done.

---

## C-1 — Database migration

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-075-recurring-sessions.sql`:
  ```sql
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
- [x] Apply via Supabase MCP `apply_migration` (name: `recurring_sessions`)
- [x] Verify via MCP `execute_sql`:
  ```sql
  select table_name from information_schema.tables
  where table_schema = 'public' and table_name = 'session_series';

  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sessions' and column_name = 'series_id';
  ```
  Expected: `session_series` table exists; `sessions.series_id` is `uuid`, nullable.
- [x] Commit: `git add supabase/schema-075-recurring-sessions.sql && git commit -m "feat: recurring sessions — session_series table (DB migration)"`

---

## C-2 — Shared generation module

*Codex edits:*
- [ ] Create `src/lib/sessions/series.ts`:
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

*Conductor:*
- [ ] `pnpm run build` — must pass clean. Nothing imports this yet — checks it compiles standalone.
- [ ] Commit: `git add src/lib/sessions/series.ts && git commit -m "feat: recurring sessions — shared generation module"`

---

## C-3 — Create-series API routes

*Codex edits:*
- [ ] Create `src/app/api/clients/[id]/sessions/series/route.ts`:
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
- [ ] Create `src/app/api/sessions/[id]/series/route.ts`:
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

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add "src/app/api/clients/[id]/sessions/series/route.ts" "src/app/api/sessions/[id]/series/route.ts" && git commit -m "feat: recurring sessions — create-series API routes"`

---

## C-4 — Cancel route, cron, vercel.json

*Codex edits:*
- [ ] Create `src/app/api/sessions/series/[seriesId]/cancel/route.ts`:
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
- [ ] Create `src/app/api/cron/process-recurring-sessions/route.ts`:
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
- [ ] Edit `vercel.json` — read it first, then add ONE new entry to the `"crons"` array (currently
  4 entries, becomes 5), keeping every existing entry unchanged:
  ```json
  { "path": "/api/cron/process-recurring-sessions", "schedule": "0 2 * * *" }
  ```

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add "src/app/api/sessions/series/[seriesId]/cancel/route.ts" src/app/api/cron/process-recurring-sessions/route.ts vercel.json && git commit -m "feat: recurring sessions — cancel route, daily top-up cron"`

---

## C-5 — NewSessionModal Repeat dropdown

*Codex edits:*
- [ ] Replace `src/components/clients/NewSessionModal.tsx` in full:
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

*Conductor:*
- [ ] `pnpm run build` — must pass clean. "Does not repeat" (default) exercises the exact same
  code path as before this change.
- [ ] Commit: `git add src/components/clients/NewSessionModal.tsx && git commit -m "feat: recurring sessions — Repeat dropdown in New Session modal"`

---

## C-6 — SessionRecurrence component + session detail wiring

*Codex edits:*
- [ ] Create `src/components/clients/SessionRecurrence.tsx`:
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
- [ ] Edit `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx` — read it first, then:
  1. Add `series_id` to the `sessions` select string (right after `program_id`):
     `.select('id, title, scheduled_at, duration_minutes, notes, status, org_id, program_id, series_id, session_todos(id, title, completed, position)')`
  2. Add the import: `import type { SessionSeriesInfo } from '@/lib/sessions/series'`
  3. After the existing `linkedProgram` block (before the final `return`), add:
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
  4. Pass it down: add `series={series}` inside the `<SessionDetailClient ... />` props,
     alongside `linkedProgram={linkedProgram}`.
- [ ] Edit `src/components/clients/SessionDetailClient.tsx` — read it first, then:
  1. Add the imports:
     ```typescript
     import SessionRecurrence from '@/components/clients/SessionRecurrence'
     import type { SessionSeriesInfo } from '@/lib/sessions/series'
     ```
  2. Add `series` to the destructured props and type signature (alongside `linkedProgram`):
     `linkedProgram: LinkedProgramBundle | null` becomes followed by
     `series: SessionSeriesInfo | null`, and add `series,` to the destructured parameter list.
  3. In the header's `<div className="flex flex-wrap items-center gap-2">` block, insert
     `<SessionRecurrence sessionId={initial.id} series={series} />` directly after the existing
     `<SessionProgramLink ... />` line and before the status badge span.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/clients/SessionRecurrence.tsx "src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx" src/components/clients/SessionDetailClient.tsx && git commit -m "feat: recurring sessions — SessionRecurrence control on session detail page"`

---

## C-7 — Manual end-to-end verification

*Conductor + user:*
- [ ] `pnpm run build` — final clean check after all tasks.
- [ ] Manual browser smoke test (no test runner):
  1. New session with Repeat=Weekly → lands on new session's detail page showing
     "Recurring: Weekly" + "Stop recurring" (not "Make recurring").
  2. Client's Sessions list shows 8 occurrences, a week apart, starting from the chosen date.
  3. Open a plain existing session, "Make recurring" → Fortnightly → confirm badge + 7 more
     future occurrences two weeks apart.
  4. "Stop recurring" on one series → badge disappears, not-yet-happened occurrences for that
     series are gone from the Sessions list; the session it was stopped from still exists.
  5. A completed session is never deleted by a cancel action.
  6. If a client checklist template exists, new recurring occurrences have it pre-filled.
- [ ] Report pass/fail; fix inline if something's off before finishing.

---

## Acceptance checklist
- [x] C-1: `session_series` table + `sessions.series_id` exist, migration committed
- [ ] C-2: shared generation module compiles clean
- [ ] C-3: both create-series routes work (new session, and converting an existing one)
- [ ] C-4: cancel route + cron + vercel.json entry all in place
- [ ] C-5: Repeat dropdown in New Session modal, "Does not repeat" path unchanged
- [ ] C-6: SessionRecurrence renders correctly in all three states (none/active/cancelled)
- [ ] C-7: full manual smoke test passes

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser
smoke test required for C-7 (no test runner in this project).
