# Client Sessions & Progress Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build sessions, session to-do lists, client templates, and progress notes under the client portal, with calendar integration and AI assistant control.

**Architecture:** Four new Supabase tables (`sessions`, `session_todos`, `client_session_templates`, `progress_notes`) following the existing RLS pattern from schema-018. The client detail page is reorganised around sessions with financials collapsed to the bottom. Sessions appear on the calendar as a new `'session'` CalendarItem type. Seven new AI assistant tools (2 read, 5 write).

**Tech Stack:** Next.js App Router (server + client components), Supabase (PostgreSQL + RLS), existing CalendarItem pattern, Anthropic tool use.

---

## File map

| Task | Action | Path |
|------|--------|------|
| C1 | Create | `supabase/schema-039-client-sessions.sql` |
| C2 | Modify | `src/app/dashboard/clients/[id]/page.tsx` |
| C2 | Create | `src/components/clients/NewSessionModal.tsx` |
| C2 | Create | `src/components/clients/AddProgressNote.tsx` |
| C3 | Create | `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx` |
| C3 | Create | `src/components/clients/SessionDetailClient.tsx` |
| C4 | Modify | `src/app/dashboard/calendar/page.tsx` |
| C4 | Modify | `src/components/calendar/CalendarView.tsx` |
| C4 | Modify | `src/components/calendar/DayPanel.tsx` |
| C5 | Modify | `src/lib/assistant/tools.ts` |
| C5 | Modify | `src/lib/assistant/write-executors.ts` |
| C5 | Modify | `src/components/assistant/ActionCard.tsx` |

---

## Task C1: DB Migration

**Files:**
- Create: `supabase/schema-039-client-sessions.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/schema-039-client-sessions.sql
-- Phase 14: Client sessions, to-do lists, per-client templates, progress notes

-- ── session_status enum ───────────────────────────────────────
create type public.session_status as enum ('scheduled', 'in_progress', 'completed');

-- ── sessions ─────────────────────────────────────────────────
create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients on delete cascade,
  org_id           uuid references public.organisations on delete cascade,
  created_by       uuid not null references public.profiles on delete cascade,
  title            text not null,
  scheduled_at     timestamptz not null,
  duration_minutes integer not null default 60,
  notes            text,
  status           public.session_status not null default 'scheduled',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "Org members can view sessions"
  on public.sessions for select
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = sessions.org_id and om.user_id = auth.uid()
    )
  );

create policy "Org admins can manage sessions"
  on public.sessions for all
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = sessions.org_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "Creator can manage own sessions"
  on public.sessions for all
  using (created_by = auth.uid());

create index sessions_client on public.sessions (client_id, scheduled_at);
create index sessions_org    on public.sessions (org_id, scheduled_at);

create or replace function public.touch_session()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger session_updated
  before update on public.sessions
  for each row execute function public.touch_session();

-- ── session_todos ─────────────────────────────────────────────
create table public.session_todos (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  title      text not null,
  completed  boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.session_todos enable row level security;

create policy "session_todos: org members can select"
  on public.session_todos for select
  using (
    exists (
      select 1 from public.sessions s
      join public.organisation_members om on om.org_id = s.org_id
      where s.id = session_todos.session_id and om.user_id = auth.uid()
    )
  );

create policy "session_todos: org admins can manage"
  on public.session_todos for all
  using (
    exists (
      select 1 from public.sessions s
      join public.organisation_members om on om.org_id = s.org_id
      where s.id = session_todos.session_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "session_todos: creator can manage"
  on public.session_todos for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_todos.session_id and s.created_by = auth.uid()
    )
  );

create index session_todos_session on public.session_todos (session_id, position);

-- ── client_session_templates ──────────────────────────────────
create table public.client_session_templates (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients on delete cascade,
  title      text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.client_session_templates enable row level security;

create policy "templates: org members can select"
  on public.client_session_templates for select
  using (
    exists (
      select 1 from public.clients c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = client_session_templates.client_id and om.user_id = auth.uid()
    )
  );

create policy "templates: org admins can manage"
  on public.client_session_templates for all
  using (
    exists (
      select 1 from public.clients c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = client_session_templates.client_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "templates: client owner can manage"
  on public.client_session_templates for all
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_session_templates.client_id and c.owner_id = auth.uid()
    )
  );

create index templates_client on public.client_session_templates (client_id, position);

-- ── progress_notes (append-only) ─────────────────────────────
create table public.progress_notes (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients on delete cascade,
  org_id     uuid references public.organisations on delete cascade,
  created_by uuid not null references public.profiles on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

alter table public.progress_notes enable row level security;

create policy "Org members can view progress notes"
  on public.progress_notes for select
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = progress_notes.org_id and om.user_id = auth.uid()
    )
  );

create policy "Org admins can insert progress notes"
  on public.progress_notes for insert
  with check (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = progress_notes.org_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "Creator can insert own notes"
  on public.progress_notes for insert
  with check (created_by = auth.uid());

create index progress_notes_client on public.progress_notes (client_id, created_at desc);
create index progress_notes_org    on public.progress_notes (org_id);
```

- [ ] **Step 2: Apply the migration in Supabase**

Open the Supabase dashboard → SQL Editor → paste the migration → Run.
Or via Supabase CLI: `supabase db push` (if local dev is configured).

Expected: no errors; tables `sessions`, `session_todos`, `client_session_templates`, `progress_notes` appear in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema-039-client-sessions.sql
git commit -m "handover: C1 schema-039 client sessions tables + RLS"
```

---

## Task C2: Client Detail Page Redesign

**Files:**
- Modify: `src/app/dashboard/clients/[id]/page.tsx`
- Create: `src/components/clients/NewSessionModal.tsx`
- Create: `src/components/clients/AddProgressNote.tsx`

### Step 2a — NewSessionModal

- [ ] **Step 1: Create `src/components/clients/NewSessionModal.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Template = { id: string; title: string; position: number }

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

### Step 2b — AddProgressNote

- [ ] **Step 2: Create `src/components/clients/AddProgressNote.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function AddProgressNote({
  clientId,
  orgId,
}: {
  clientId: string
  orgId: string | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!body.trim()) return
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in.'); setSaving(false); return }

    const { error: err } = await supabase.from('progress_notes').insert({
      client_id: clientId,
      org_id: orgId,
      created_by: user.id,
      body: body.trim(),
    })

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    setBody('')
    router.refresh()
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Add a progress note…"
        rows={3}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none resize-none"
      />
      <button
        onClick={handleSave}
        disabled={saving || !body.trim()}
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save note'}
      </button>
    </div>
  )
}
```

### Step 2c — Client detail page

- [ ] **Step 3: Replace `src/app/dashboard/clients/[id]/page.tsx`**

```tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import NewSessionModal from '@/components/clients/NewSessionModal'
import AddProgressNote from '@/components/clients/AddProgressNote'

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-cyan-100 text-cyan-700',
  paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
}
const SESSION_STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
}
const SESSION_STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed',
}
const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { dateStyle: 'medium' })
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role, org_id').eq('user_id', user.id).maybeSingle()
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')
  const orgId = membership?.org_id ?? null

  const { data: client } = await supabase
    .from('clients').select('id, name, email, phone, address').eq('id', id).maybeSingle()
  if (!client) notFound()

  const [{ data: sessions }, { data: notes }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, title, scheduled_at, duration_minutes, status, session_todos(id, completed)')
      .eq('client_id', id)
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('progress_notes')
      .select('id, body, created_at, profiles!progress_notes_created_by_fkey(full_name)')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
  ])

  const allSessions = sessions ?? []
  const upcoming = allSessions.filter(s => s.status !== 'completed')
  const past = allSessions.filter(s => s.status === 'completed')
  const lastCompleted = past[0]
  const notesData = notes ?? []

  let invoices: { id: string; invoice_number: string; status: string; issue_date: string; subtotal: number }[] = []
  let sales: { id: string; date: string; amount: number; description: string | null; source_type: string }[] = []
  let outstanding = 0
  let paid = 0
  if (isAdmin) {
    const [{ data: inv }, { data: inc }] = await Promise.all([
      supabase.from('invoices').select('id, invoice_number, status, issue_date, subtotal').eq('client_id', id).order('issue_date', { ascending: false }),
      supabase.from('income_entries').select('id, date, amount, description, source_type').eq('client_id', id).order('date', { ascending: false }),
    ])
    invoices = (inv ?? []) as typeof invoices
    sales = (inc ?? []) as typeof sales
    outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + Number(i.subtotal), 0)
    paid = sales.reduce((s, r) => s + Number(r.amount), 0)
  }

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">← Clients</Link>

        {/* Header */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-black text-gray-900">{client.name}</h1>
          {client.email && <p className="mt-1 text-sm text-gray-500">{client.email}</p>}
          {client.phone && <p className="text-sm text-gray-500">{client.phone}</p>}
          {client.address && <p className="mt-1 text-xs text-gray-400">{client.address}</p>}
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Upcoming</p>
            <p className="mt-1 text-2xl font-black text-cyan-600">{upcoming.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Total sessions</p>
            <p className="mt-1 text-2xl font-black text-gray-900">{allSessions.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Last session</p>
            <p className="mt-1 text-sm font-black text-gray-900">
              {lastCompleted ? fmtDate(lastCompleted.scheduled_at) : '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Progress notes</p>
            <p className="mt-1 text-2xl font-black text-gray-900">{notesData.length}</p>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Sessions — wider */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Sessions</h2>
              <NewSessionModal clientId={client.id} orgId={orgId} />
            </div>

            {upcoming.length === 0 && past.length === 0 && (
              <p className="rounded-2xl border border-dashed border-gray-200 px-6 py-8 text-center text-sm font-semibold text-gray-400">
                No sessions yet. Create the first one.
              </p>
            )}

            {upcoming.map(s => {
              const total = (s.session_todos as { completed: boolean }[]).length
              const done = (s.session_todos as { completed: boolean }[]).filter(t => t.completed).length
              return (
                <Link key={s.id} href={`/dashboard/clients/${id}/sessions/${s.id}`}
                  className="block rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-900">{s.title}</p>
                      <p className="mt-0.5 text-sm text-gray-500">{fmtDateTime(s.scheduled_at)} · {s.duration_minutes} min</p>
                      {total > 0 && <p className="mt-1 text-xs font-semibold text-gray-400">{done}/{total} done</p>}
                    </div>
                    <span className={`shrink-0 rounded-xl px-2 py-0.5 text-xs font-bold ${SESSION_STATUS_STYLE[s.status]}`}>
                      {SESSION_STATUS_LABEL[s.status]}
                    </span>
                  </div>
                </Link>
              )
            })}

            {past.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400 pt-2">Past sessions</p>
                {past.map(s => {
                  const total = (s.session_todos as { completed: boolean }[]).length
                  const done = (s.session_todos as { completed: boolean }[]).filter(t => t.completed).length
                  return (
                    <Link key={s.id} href={`/dashboard/clients/${id}/sessions/${s.id}`}
                      className="block rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-gray-200 hover:bg-gray-50">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-gray-700">{s.title}</p>
                          <p className="mt-0.5 text-sm text-gray-400">{fmtDateTime(s.scheduled_at)} · {s.duration_minutes} min</p>
                          {total > 0 && <p className="mt-1 text-xs font-semibold text-gray-400">{done}/{total} done</p>}
                        </div>
                        <span className={`shrink-0 rounded-xl px-2 py-0.5 text-xs font-bold ${SESSION_STATUS_STYLE[s.status]}`}>
                          {SESSION_STATUS_LABEL[s.status]}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </>
            )}
          </div>

          {/* Progress notes — narrower */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Progress notes</h2>
            <AddProgressNote clientId={client.id} orgId={orgId} />

            <div className="space-y-3">
              {notesData.map(n => {
                const author = (n.profiles as { full_name: string | null } | null)?.full_name ?? 'Unknown'
                return (
                  <div key={n.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-500">{author}</span>
                      <span className="text-xs text-gray-400">{fmtDateTime(n.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{n.body}</p>
                  </div>
                )
              })}

              {notesData.length === 0 && (
                <p className="text-sm font-semibold text-gray-400">No notes yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Financials — collapsible, admin only */}
        {isAdmin && (
          <details className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <summary className="cursor-pointer px-6 py-4 text-sm font-bold uppercase tracking-wide text-gray-500 select-none">
              Financial details
            </summary>
            <div className="px-6 pb-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Outstanding</p>
                  <p className="mt-1 text-xl font-black text-amber-600">{fmt(outstanding)}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Paid</p>
                  <p className="mt-1 text-xl font-black text-green-600">{fmt(paid)}</p>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Invoices</h3>
                {invoices.length === 0 ? <p className="text-sm font-semibold text-gray-400">No invoices.</p> : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50">
                      {invoices.map(i => (
                        <tr key={i.id}>
                          <td className="py-2"><Link href={`/dashboard/invoices/${i.id}`} className="font-bold text-slate-900 hover:text-cyan-600">{i.invoice_number}</Link></td>
                          <td className="py-2 text-gray-500">{i.issue_date}</td>
                          <td className="py-2 text-right font-bold">{fmt(Number(i.subtotal))}</td>
                          <td className="py-2 text-center"><span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[i.status]}`}>{i.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Sales &amp; payments</h3>
                {sales.length === 0 ? <p className="text-sm font-semibold text-gray-400">No recorded sales.</p> : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50">
                      {sales.map(r => (
                        <tr key={r.id}>
                          <td className="py-2 text-gray-500">{r.date}</td>
                          <td className="py-2 text-gray-600">{r.description ?? (r.source_type === 'sale' ? 'Walk-in sale' : r.source_type)}</td>
                          <td className="py-2 text-right font-bold text-green-600">{fmt(Number(r.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Build check**

```bash
pnpm run build
```

Expected: no TypeScript errors. Warning about unused `id` import etc. is fine; errors are not.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/clients/[id]/page.tsx src/components/clients/NewSessionModal.tsx src/components/clients/AddProgressNote.tsx
git commit -m "handover: C2 client detail page redesign with sessions + progress notes"
```

---

## Task C3: Session Detail Page

**Files:**
- Create: `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx`
- Create: `src/components/clients/SessionDetailClient.tsx`

- [ ] **Step 1: Create `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx`**

```tsx
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import SessionDetailClient from '@/components/clients/SessionDetailClient'

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>
}) {
  const { id, sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: session }, { data: client }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, title, scheduled_at, duration_minutes, notes, status, session_todos(id, title, completed, position)')
      .eq('id', sessionId)
      .maybeSingle(),
    supabase
      .from('clients')
      .select('id, name')
      .eq('id', id)
      .maybeSingle(),
  ])

  if (!session || !client) notFound()

  const todos = (session.session_todos as { id: string; title: string; completed: boolean; position: number }[])
    .slice()
    .sort((a, b) => a.position - b.position)

  return (
    <SessionDetailClient
      session={{
        id: session.id,
        title: session.title,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
        notes: session.notes ?? '',
        status: session.status as 'scheduled' | 'in_progress' | 'completed',
      }}
      todos={todos}
      clientId={id}
      clientName={client.name}
    />
  )
}
```

- [ ] **Step 2: Create `src/components/clients/SessionDetailClient.tsx`**

```tsx
'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Todo = { id: string; title: string; completed: boolean; position: number }
type Status = 'scheduled' | 'in_progress' | 'completed'

const STATUS_NEXT: Record<Status, Status | null> = {
  scheduled: 'in_progress',
  in_progress: 'completed',
  completed: null,
}
const STATUS_LABEL: Record<Status, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
}
const STATUS_STYLE: Record<Status, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function SessionDetailClient({
  session: initial,
  todos: initialTodos,
  clientId,
  clientName,
}: {
  session: { id: string; title: string; scheduledAt: string; durationMinutes: number; notes: string; status: Status }
  todos: Todo[]
  clientId: string
  clientName: string
}) {
  const router = useRouter()
  const supabase = createClient()

  const [title, setTitle] = useState(initial.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const [scheduledAt, setScheduledAt] = useState(initial.scheduledAt.slice(0, 16))
  const [duration, setDuration] = useState(initial.durationMinutes)
  const [status, setStatus] = useState<Status>(initial.status)
  const [notes, setNotes] = useState(initial.notes)
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const [newTodo, setNewTodo] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Debounced notes save ──────────────────────────────────────
  const saveNotes = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      await supabase.from('sessions').update({ notes: value }).eq('id', initial.id)
    }, 800)
  }, [supabase, initial.id])

  function handleNotesChange(value: string) {
    setNotes(value)
    saveNotes(value)
  }

  // ── Title save ───────────────────────────────────────────────
  async function saveTitle() {
    setEditingTitle(false)
    const trimmed = title.trim()
    if (!trimmed || trimmed === initial.title) return
    await supabase.from('sessions').update({ title: trimmed }).eq('id', initial.id)
  }

  // ── DateTime / duration save ─────────────────────────────────
  async function saveSchedule(newAt: string, newDur: number) {
    await supabase.from('sessions').update({
      scheduled_at: new Date(newAt).toISOString(),
      duration_minutes: newDur,
    }).eq('id', initial.id)
  }

  // ── Status advance ───────────────────────────────────────────
  async function advanceStatus() {
    const next = STATUS_NEXT[status]
    if (!next) return
    const { error } = await supabase.from('sessions').update({ status: next }).eq('id', initial.id)
    if (!error) setStatus(next)
  }

  // ── Todo operations ──────────────────────────────────────────
  async function toggleTodo(todo: Todo) {
    const newCompleted = !todo.completed
    await supabase.from('session_todos').update({ completed: newCompleted }).eq('id', todo.id)
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, completed: newCompleted } : t))
  }

  async function addTodo() {
    const trimmed = newTodo.trim()
    if (!trimmed) return
    const position = todos.length > 0 ? Math.max(...todos.map(t => t.position)) + 1 : 0
    const { data } = await supabase
      .from('session_todos')
      .insert({ session_id: initial.id, title: trimmed, completed: false, position })
      .select('id, title, completed, position')
      .single()
    if (data) {
      setTodos(prev => [...prev, data])
      setNewTodo('')
    }
  }

  async function deleteTodo(id: string) {
    await supabase.from('session_todos').delete().eq('id', id)
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  async function moveTodo(id: string, dir: -1 | 1) {
    const idx = todos.findIndex(t => t.id === id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= todos.length) return
    const updated = [...todos]
    const aPos = updated[idx].position
    const bPos = updated[swapIdx].position
    updated[idx] = { ...updated[idx], position: bPos }
    updated[swapIdx] = { ...updated[swapIdx], position: aPos }
    updated.sort((a, b) => a.position - b.position)
    setTodos(updated)
    await Promise.all([
      supabase.from('session_todos').update({ position: bPos }).eq('id', updated[swapIdx].id),
      supabase.from('session_todos').update({ position: aPos }).eq('id', updated[idx].id),
    ])
  }

  // ── Save as template ─────────────────────────────────────────
  async function saveAsTemplate() {
    setSavingTemplate(true)
    await supabase.from('client_session_templates').delete().eq('client_id', clientId)
    if (todos.length > 0) {
      await supabase.from('client_session_templates').insert(
        todos.map(t => ({ client_id: clientId, title: t.title, position: t.position }))
      )
    }
    setSavingTemplate(false)
    setTemplateSaved(true)
    setTimeout(() => setTemplateSaved(false), 2000)
  }

  const allDone = todos.length > 0 && todos.every(t => t.completed)

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Back link */}
        <Link href={`/dashboard/clients/${clientId}`} className="text-sm font-semibold text-cyan-600 hover:underline">
          ← {clientName}
        </Link>

        {/* Header */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div className="flex-1 min-w-0">
              {editingTitle ? (
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={e => e.key === 'Enter' && saveTitle()}
                  autoFocus
                  className="text-2xl font-black text-gray-900 w-full border-b-2 border-cyan-400 focus:outline-none bg-transparent"
                />
              ) : (
                <h1
                  onClick={() => setEditingTitle(true)}
                  className="text-2xl font-black text-gray-900 cursor-pointer hover:text-cyan-600 transition-colors"
                  title="Click to edit"
                >
                  {title}
                </h1>
              )}
              <div className="mt-2 flex flex-wrap gap-4 items-center text-sm text-gray-500">
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => { setScheduledAt(e.target.value); saveSchedule(e.target.value, duration) }}
                  className="border-b border-gray-200 bg-transparent text-sm focus:border-cyan-400 focus:outline-none"
                />
                <label className="flex items-center gap-1">
                  <span className="text-gray-400">Duration</span>
                  <input
                    type="number"
                    value={duration}
                    onChange={e => { setDuration(Number(e.target.value)); saveSchedule(scheduledAt, Number(e.target.value)) }}
                    min={5}
                    max={480}
                    className="w-16 border-b border-gray-200 bg-transparent text-center text-sm focus:border-cyan-400 focus:outline-none"
                  />
                  <span className="text-gray-400">min</span>
                </label>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-xl px-3 py-1 text-xs font-bold ${STATUS_STYLE[status]}`}>
                {STATUS_LABEL[status]}
              </span>
              {STATUS_NEXT[status] && (
                <button
                  onClick={advanceStatus}
                  className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Mark as {STATUS_LABEL[STATUS_NEXT[status]!]}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Two columns: todos | notes */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* To-do list */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Checklist</h2>
              <button
                onClick={saveAsTemplate}
                disabled={savingTemplate || todos.length === 0}
                className="text-xs font-semibold text-cyan-600 hover:underline disabled:opacity-40"
              >
                {templateSaved ? 'Saved!' : savingTemplate ? 'Saving…' : 'Save as template'}
              </button>
            </div>

            {allDone && status !== 'completed' && (
              <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
                All items done! Ready to mark this session as Completed.
              </div>
            )}

            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50">
              {todos.map((todo, i) => (
                <div key={todo.id} className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => toggleTodo(todo)}
                    className="h-4 w-4 rounded accent-cyan-500"
                  />
                  <span className={`flex-1 text-sm ${todo.completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                    {todo.title}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => moveTodo(todo.id, -1)} disabled={i === 0}
                      className="rounded px-1 text-gray-400 hover:text-gray-700 disabled:opacity-20">↑</button>
                    <button onClick={() => moveTodo(todo.id, 1)} disabled={i === todos.length - 1}
                      className="rounded px-1 text-gray-400 hover:text-gray-700 disabled:opacity-20">↓</button>
                    <button onClick={() => deleteTodo(todo.id)}
                      className="rounded px-1 text-red-400 hover:text-red-600">✕</button>
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2 px-4 py-3">
                <input
                  value={newTodo}
                  onChange={e => setNewTodo(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTodo()}
                  placeholder="Add item…"
                  className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
                />
                <button onClick={addTodo} disabled={!newTodo.trim()}
                  className="text-sm font-semibold text-cyan-600 hover:underline disabled:opacity-40">
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Session notes */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Notes</h2>
            <textarea
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              placeholder="Session notes…"
              rows={14}
              className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-700 shadow-sm focus:border-cyan-400 focus:outline-none resize-none"
            />
            <p className="text-xs text-gray-400">Auto-saved as you type.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build check**

```bash
pnpm run build
```

Expected: clean build; no TypeScript errors on the two new files.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx src/components/clients/SessionDetailClient.tsx
git commit -m "handover: C3 session detail page with todos + notes"
```

---

## Task C4: Calendar Integration

**Files:**
- Modify: `src/app/dashboard/calendar/page.tsx`
- Modify: `src/components/calendar/CalendarView.tsx`
- Modify: `src/components/calendar/DayPanel.tsx`

- [ ] **Step 1: Add sessions to the CalendarItem type and buildItems in `src/components/calendar/CalendarView.tsx`**

Find the existing `CalendarItem` type definition (line ~12–24) and replace it plus the `buildItems` function signature and body. The full updated `CalendarItem` type and related changes:

In `CalendarView.tsx`, make these four edits:

**Edit 1** — Add `Session` type after `LeaveRequest`:
```typescript
type Session = { id: string; title: string; scheduled_at: string; status: string; client_id: string }
```

**Edit 2** — Add `'session'` to the `CalendarItem.type` union and add `clientId` field:
```typescript
export type CalendarItem = {
  key: string
  date: string
  label: string
  type: 'event' | 'project' | 'task' | 'leave' | 'session'
  colour: string
  priority?: string
  id: string
  description?: string | null
  startTime?: string | null
  endTime?: string | null
  allDay?: boolean
  clientId?: string
}
```

**Edit 3** — Add `sessions` parameter to `buildItems` and push session items:
Replace the `buildItems` function signature from:
```typescript
function buildItems(events: CalEvent[], projects: Project[], tasks: Task[], leaveRequests: LeaveRequest[]): CalendarItem[] {
```
to:
```typescript
function buildItems(events: CalEvent[], projects: Project[], tasks: Task[], leaveRequests: LeaveRequest[], sessions: Session[] = []): CalendarItem[] {
```
And inside, after the `leaveRequests.forEach` block (before `return items`), add:
```typescript
  sessions.forEach(s => items.push({
    key: `s-${s.id}`,
    date: s.scheduled_at.slice(0, 10),
    label: s.title,
    type: 'session',
    colour: '#0891b2',
    id: s.id,
    clientId: s.client_id,
    startTime: s.scheduled_at,
  }))
```

**Edit 4** — Add `sessions` prop to component signature and pass to `buildItems`:
Replace:
```typescript
export default function CalendarView({ userId, orgId, initialEvents, projects, tasks, leaveRequests = [] }: {
  userId: string
  orgId: string | null
  initialEvents: CalEvent[]
  projects: Project[]
  tasks: Task[]
  leaveRequests?: LeaveRequest[]
})
```
with:
```typescript
export default function CalendarView({ userId, orgId, initialEvents, projects, tasks, leaveRequests = [], sessions = [] }: {
  userId: string
  orgId: string | null
  initialEvents: CalEvent[]
  projects: Project[]
  tasks: Task[]
  leaveRequests?: LeaveRequest[]
  sessions?: Session[]
})
```
And change:
```typescript
const items = buildItems(events, projects, tasks, leaveRequests)
```
to:
```typescript
const items = buildItems(events, projects, tasks, leaveRequests, sessions)
```

- [ ] **Step 2: Add session navigation to `src/components/calendar/DayPanel.tsx`**

Add `'use client'` is already present. Add `import Link from 'next/link'` at the top.

Add `session: 'Session'` to the `TYPE_LABELS` record:
```typescript
const TYPE_LABELS: Record<string, string> = { event: 'Event', project: 'Project deadline', task: 'Task due', leave: 'Approved leave', session: 'Session' }
```

In the items list, wrap session items in a link. Replace the list item render:
```tsx
{items.map(item => (
  <li key={item.key} className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
    <div className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.colour }} />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-gray-900">{item.label}</p>
      {/* ... existing time/type rows ... */}
    </div>
  </li>
))}
```
with:
```tsx
{items.map(item => {
  const inner = (
    <>
      <div className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.colour }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900">{item.label}</p>
        {item.allDay && (
          <p className="mt-0.5 text-xs font-semibold text-gray-500">All day</p>
        )}
        {!item.allDay && item.startTime && (
          <p className="mt-0.5 text-xs font-semibold text-gray-500">
            {fmtTime(item.startTime)}{item.endTime ? ` – ${fmtTime(item.endTime)}` : ''}
          </p>
        )}
        <p className="mt-0.5 text-xs font-medium text-gray-400">
          {TYPE_LABELS[item.type]}{item.priority ? ` · ${item.priority}` : ''}
        </p>
        {item.description && (
          <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.description}</p>
        )}
      </div>
    </>
  )

  if (item.type === 'session' && item.clientId) {
    return (
      <li key={item.key}>
        <Link
          href={`/dashboard/clients/${item.clientId}/sessions/${item.id}`}
          className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 transition-colors hover:bg-cyan-50"
        >
          {inner}
        </Link>
      </li>
    )
  }

  return (
    <li key={item.key} className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
      {inner}
    </li>
  )
})}
```

- [ ] **Step 3: Add sessions query to `src/app/dashboard/calendar/page.tsx`**

Add a sessions query to the existing `Promise.all` block. Insert after the `{ data: profile }` line inside the array:

```typescript
// Add this destructured item to the Promise.all:
{ data: sessions }
```

Add to `Promise.all`:
```typescript
supabase.from('sessions')
  .select('id, title, scheduled_at, status, client_id')
  .or(`created_by.eq.${user.id}${membership?.org_id ? `,org_id.eq.${membership.org_id}` : ''}`)
  .neq('status', 'completed'),
```

Pass to `<CalendarView>`:
```tsx
<CalendarView
  userId={user.id}
  orgId={membership?.org_id ?? null}
  initialEvents={events ?? []}
  projects={projects ?? []}
  tasks={tasks ?? []}
  leaveRequests={[...(leave ?? []), ...holidays]}
  sessions={sessions ?? []}
/>
```

- [ ] **Step 4: Build check**

```bash
pnpm run build
```

Expected: clean build. Sessions now appear as teal items on the calendar.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/calendar/page.tsx src/components/calendar/CalendarView.tsx src/components/calendar/DayPanel.tsx
git commit -m "handover: C4 calendar integration for sessions"
```

---

## Task C5: AI Assistant Tools

**Files:**
- Modify: `src/lib/assistant/tools.ts`
- Modify: `src/lib/assistant/write-executors.ts`
- Modify: `src/components/assistant/ActionCard.tsx`

- [ ] **Step 1: Update `src/lib/assistant/tools.ts` — add to READ_TOOLS and WRITE_TOOLS sets**

Change:
```typescript
export const READ_TOOLS = new Set([
  'get_tasks', 'get_projects', 'get_clients', 'get_time_entries',
  'get_expenses', 'get_team_members', 'get_leave_requests',
  'get_calendar_events', 'get_summary',
])

export const WRITE_TOOLS = new Set([
  'create_task', 'update_task', 'create_project', 'update_project',
  'create_client', 'update_client', 'create_time_entry', 'start_timer',
  'stop_timer', 'create_expense', 'create_calendar_event', 'create_leave_request',
])
```
to:
```typescript
export const READ_TOOLS = new Set([
  'get_tasks', 'get_projects', 'get_clients', 'get_time_entries',
  'get_expenses', 'get_team_members', 'get_leave_requests',
  'get_calendar_events', 'get_summary',
  'get_sessions', 'get_progress_notes',
])

export const WRITE_TOOLS = new Set([
  'create_task', 'update_task', 'create_project', 'update_project',
  'create_client', 'update_client', 'create_time_entry', 'start_timer',
  'stop_timer', 'create_expense', 'create_calendar_event', 'create_leave_request',
  'create_session', 'update_session', 'add_session_todo', 'check_session_todo', 'add_progress_note',
])
```

- [ ] **Step 2: Add 7 tool schemas to `TOOL_SCHEMAS` in `src/lib/assistant/tools.ts`**

Append these entries to the `TOOL_SCHEMAS` array, before the closing `]`:

```typescript
  // ── Session read tools ───────────────────────────────────────
  {
    name: 'get_sessions',
    description: 'Fetch sessions for a client. Filter by upcoming, past, or all.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client UUID (required)' },
        filter: { type: 'string', enum: ['upcoming', 'past', 'all'], description: 'Default: upcoming' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'get_progress_notes',
    description: 'Fetch all progress notes for a client, newest first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client UUID (required)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['client_id'],
    },
  },

  // ── Session write tools (require confirmation) ───────────────
  {
    name: 'create_session',
    description: 'Propose creating a session for a client. Pre-populates the to-do list from the client\'s saved template if one exists. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
        title: { type: 'string', description: 'Session title e.g. Weekly check-in' },
        scheduled_at: { type: 'string', description: 'ISO datetime e.g. 2026-06-15T10:00:00' },
        duration_minutes: { type: 'number', description: 'Duration in minutes (default 60)' },
      },
      required: ['client_id', 'title', 'scheduled_at'],
    },
  },
  {
    name: 'update_session',
    description: 'Propose updating a session (title, time, duration, or status). Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session UUID' },
        title: { type: 'string' },
        scheduled_at: { type: 'string', description: 'ISO datetime' },
        duration_minutes: { type: 'number' },
        status: { type: 'string', enum: ['scheduled', 'in_progress', 'completed'] },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'add_session_todo',
    description: 'Propose adding a to-do item to a session checklist. Appended to the end. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        session_id: { type: 'string', description: 'Session UUID' },
        title: { type: 'string', description: 'To-do item text' },
      },
      required: ['session_id', 'title'],
    },
  },
  {
    name: 'check_session_todo',
    description: 'Propose checking or unchecking a to-do item in a session. Will show a confirmation card.',
    input_schema: {
      type: 'object' as const,
      properties: {
        todo_id: { type: 'string', description: 'session_todos UUID' },
        completed: { type: 'boolean', description: 'true to check, false to uncheck' },
      },
      required: ['todo_id', 'completed'],
    },
  },
  {
    name: 'add_progress_note',
    description: "Propose adding a timestamped progress note to a client's record. Will show a confirmation card.",
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client UUID' },
        body: { type: 'string', description: 'Note text' },
      },
      required: ['client_id', 'body'],
    },
  },
```

- [ ] **Step 3: Add read executors to `executeReadTool` in `src/lib/assistant/tools.ts`**

In the `executeReadTool` switch, add these cases before the `default:` (or before the closing `}`):

```typescript
    case 'get_sessions': {
      const clientId = input.client_id as string
      const filter = (input.filter as string) ?? 'upcoming'
      let q = supabase
        .from('sessions')
        .select('id, title, scheduled_at, duration_minutes, status, client_id, clients(name), session_todos(id, title, completed, position)')
        .eq('client_id', clientId)
        .order('scheduled_at', { ascending: filter !== 'past' })
        .limit(20)
      if (filter === 'upcoming') q = q.neq('status', 'completed')
      if (filter === 'past') q = q.eq('status', 'completed')
      const { data } = await q
      return data ?? []
    }

    case 'get_progress_notes': {
      const clientId = input.client_id as string
      const { data } = await supabase
        .from('progress_notes')
        .select('id, body, created_at, profiles!progress_notes_created_by_fkey(full_name)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(Number(input.limit ?? 20))
      return data ?? []
    }
```

Also add the fallback at end of switch if not already there:
```typescript
    default:
      return null
```

- [ ] **Step 4: Add write executors to `src/lib/assistant/write-executors.ts`**

Add these cases to the `switch (name)` block, before the `default:`:

```typescript
      case 'create_session': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const { data: session, error: sessErr } = await supabase
          .from('sessions')
          .insert({
            client_id: input.client_id as string,
            org_id: membership?.org_id ?? null,
            created_by: userId,
            title: input.title as string,
            scheduled_at: input.scheduled_at as string,
            duration_minutes: Number(input.duration_minutes ?? 60),
            status: 'scheduled',
          })
          .select('id, title, scheduled_at')
          .single()
        if (sessErr || !session) return { ok: false, error: sessErr?.message ?? 'Failed to create session.' }
        // Pre-populate todos from template if one exists
        const { data: templates } = await supabase
          .from('client_session_templates')
          .select('title, position')
          .eq('client_id', input.client_id as string)
          .order('position')
        if (templates && templates.length > 0) {
          await supabase.from('session_todos').insert(
            templates.map(t => ({ session_id: session.id, title: t.title, completed: false, position: t.position }))
          )
        }
        return { ok: true, result: session }
      }

      case 'update_session': {
        const { session_id, ...fields } = input
        const { data, error } = await supabase
          .from('sessions')
          .update(fields)
          .eq('id', session_id as string)
          .select('id, title, status')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'add_session_todo': {
        const { data: existing } = await supabase
          .from('session_todos')
          .select('position')
          .eq('session_id', input.session_id as string)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle()
        const position = existing ? existing.position + 1 : 0
        const { data, error } = await supabase
          .from('session_todos')
          .insert({ session_id: input.session_id as string, title: input.title as string, completed: false, position })
          .select('id, title')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'check_session_todo': {
        const { data, error } = await supabase
          .from('session_todos')
          .update({ completed: input.completed as boolean })
          .eq('id', input.todo_id as string)
          .select('id, title, completed')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'add_progress_note': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const { data, error } = await supabase
          .from('progress_notes')
          .insert({
            client_id: input.client_id as string,
            org_id: membership?.org_id ?? null,
            created_by: userId,
            body: input.body as string,
          })
          .select('id, created_at')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }
```

- [ ] **Step 5: Add TOOL_LABELS to `src/components/assistant/ActionCard.tsx`**

Add to the `TOOL_LABELS` record:
```typescript
const TOOL_LABELS: Record<string, string> = {
  create_task: 'Create task',
  update_task: 'Update task',
  create_project: 'Create project',
  update_project: 'Update project',
  create_client: 'Create client',
  update_client: 'Update client',
  create_time_entry: 'Log time',
  start_timer: 'Start timer',
  stop_timer: 'Stop timer',
  create_expense: 'Log expense',
  create_calendar_event: 'Create event',
  create_leave_request: 'Submit leave',
  create_session: 'Book session',
  update_session: 'Update session',
  add_session_todo: 'Add to checklist',
  check_session_todo: 'Check item',
  add_progress_note: 'Add progress note',
}
```

- [ ] **Step 6: Build check**

```bash
pnpm run build
```

Expected: clean build. The AI assistant can now call all 7 new tools.

- [ ] **Step 7: Commit**

```bash
git add src/lib/assistant/tools.ts src/lib/assistant/write-executors.ts src/components/assistant/ActionCard.tsx
git commit -m "handover: C5 AI assistant tools for sessions and progress notes"
```

---

## Smoke test (manual, after all tasks)

1. Create a client (or use an existing one) → navigate to their detail page
2. Verify the 4 stat tiles render (Upcoming, Total sessions, Last session, Progress notes)
3. Click **+ New session** → fill in title, date/time, duration → confirm → should navigate to session detail
4. On session detail: click the title to edit inline → blur → title saves
5. Add 3 to-do items → check one → reorder using ↑↓ → delete one
6. Click **Save as template**
7. Go back to client → create another session → confirm template items are pre-filled
8. Type in notes area → navigate away → come back → notes should persist
9. Add a progress note on client detail → verify it appears in the feed
10. Check the calendar → confirm the session appears as a teal item on the correct date
11. Click the session in the calendar day panel → navigates to session detail
12. In AI assistant: *"What sessions does [client name] have coming up?"* → `get_sessions` returns data
13. *"Book [client name] in for a session next Tuesday at 10am"* → confirmation card → confirm → session created
