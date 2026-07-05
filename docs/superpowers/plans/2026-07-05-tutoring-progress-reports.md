# Tutoring Progress Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **TimeWiseHub-specific note:** this project's actual convention is the `handover-loop` skill (Claude conducts, Codex does text edits, conductor runs all shell/DB commands) — see `CLAUDE.md`. Translate these tasks into `.handover/spec.md` C-N items rather than generic subagent dispatch, unless told otherwise.

**Goal:** Let a tutor tag progress notes to a specific student, select several unsent notes, and
email them to the parent as a "progress update" — appropriating the existing `progress_notes`
feature rather than building a new report entity.

**Architecture:** `progress_notes` gains `student_id` (auto-populated from a session's own
`student_id` when a note is promoted from a session) and `sent_to_parent_at`. The existing
`/api/clients/[id]/messages` route gains two optional fields (`subject`, `noteIds`) so it can both
customize the email subject and mark the sent notes — using its existing service-role client, since
`progress_notes` UPDATE is RLS-restricted to a note's own creator or an org admin, but "send to
parent" is meant to work for any org member regardless of who wrote the note.

**Tech Stack:** Next.js 16 / TypeScript strict / Supabase (`@supabase/ssr`) — no new dependencies.

## Global Constraints

- No test runner in this project — verification is `pnpm run build` plus manual browser testing.
- Existing notes are not retroactively tagged — they stay `student_id = null` (shown under "All
  students," still sendable, just not filterable to one child). Confirmed acceptable.
- The send-to-parent capability itself is not gated to the tutoring profile — generally useful
  regardless of industry (naturally inert for clients with zero students).
- Marking a note `sent_to_parent_at` must happen via the service-role client inside the messages
  API route, not a client-side `progress_notes` update — the existing RLS only allows a note's
  creator or an org admin to UPDATE it, but any org member should be able to send an existing note.
- Source spec: `docs/superpowers/specs/2026-07-05-tutoring-progress-reports-design.md`.

---

### Task 1: Database migration — progress_notes student_id and sent_to_parent_at

**Files:**
- Create: `supabase/schema-090-tutoring-progress-report-notes.sql`

**Interfaces:**
- Produces: `public.progress_notes.student_id` (nullable FK to `students`),
  `public.progress_notes.sent_to_parent_at` (nullable timestamptz). Every later task depends on
  these exact column names.

This task is **conductor-only** (DB migrations always are in this project).

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 090: Tutoring progress report notes
-- Sixth deep-dive feature for the Tutoring workspace profile.
-- Appropriates the existing progress_notes feature (rather than a
-- new table) by adding student_id (for multi-child families) and
-- sent_to_parent_at (send-to-parent tracking). Run via Supabase MCP
-- apply_migration (name: tutoring_progress_report_notes)
-- ============================================================

alter table public.progress_notes add column student_id uuid references public.students on delete set null;
alter table public.progress_notes add column sent_to_parent_at timestamptz;

create index progress_notes_student on public.progress_notes (student_id) where student_id is not null;
```

- [ ] **Step 2: Apply via Supabase MCP `apply_migration`**

Name: `tutoring_progress_report_notes`, project id `sdwwlnnsijcadkdwsvud`.

- [ ] **Step 3: Verify via MCP `execute_sql`**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'progress_notes' and column_name in ('student_id', 'sent_to_parent_at');
```
Expected: 2 rows — `student_id` (uuid, nullable), `sent_to_parent_at` (timestamp with time zone,
nullable).

```sql
select indexname from pg_indexes where schemaname = 'public' and tablename = 'progress_notes' and indexname = 'progress_notes_student';
```
Expected: 1 row.

```sql
select count(*) from public.progress_notes where student_id is not null or sent_to_parent_at is not null;
```
Expected: 0 (existing rows untouched, both columns null).

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-090-tutoring-progress-report-notes.sql
git commit -m "feat: tutoring progress reports — database migration"
```

---

### Task 2: Session detail — thread student_id into promoted progress notes

**Files:**
- Modify: `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx`
- Modify: `src/components/clients/SessionDetailClient.tsx`

**Interfaces:**
- Consumes: `public.sessions.student_id` (already exists, from an earlier phase),
  `public.progress_notes.student_id` (Task 1).
- Produces: nothing for later tasks. **Combined into one task** because the `session` prop's type
  (`studentId` field) changes in `SessionDetailClient` and the page that constructs that prop must
  change together to keep the build green.

- [ ] **Step 1: Edit `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx`**

Change:
```typescript
    supabase
      .from('sessions')
      .select('id, title, scheduled_at, duration_minutes, notes, status, org_id, program_id, series_id, session_todos(id, title, completed, position)')
      .eq('id', sessionId)
      .maybeSingle(),
```
to:
```typescript
    supabase
      .from('sessions')
      .select('id, title, scheduled_at, duration_minutes, notes, status, org_id, program_id, series_id, student_id, session_todos(id, title, completed, position)')
      .eq('id', sessionId)
      .maybeSingle(),
```

Change:
```typescript
      session={{
        id: session.id,
        title: session.title,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
        notes: session.notes ?? '',
        status: session.status as 'scheduled' | 'in_progress' | 'completed',
      }}
```
to:
```typescript
      session={{
        id: session.id,
        title: session.title,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
        notes: session.notes ?? '',
        status: session.status as 'scheduled' | 'in_progress' | 'completed',
        studentId: session.student_id,
      }}
```

- [ ] **Step 2: Edit `src/components/clients/SessionDetailClient.tsx`**

Change the `session` prop type:
```typescript
  session: { id: string; title: string; scheduledAt: string; durationMinutes: number; notes: string; status: Status }
```
to:
```typescript
  session: { id: string; title: string; scheduledAt: string; durationMinutes: number; notes: string; status: Status; studentId: string | null }
```

Change the `progress_notes` insert inside `addSessionNotesToProgressNotes`:
```typescript
    const { error } = await supabase.from('progress_notes').insert({
      client_id: clientId,
      org_id: orgId,
      created_by: user.id,
      body,
    })
```
to:
```typescript
    const { error } = await supabase.from('progress_notes').insert({
      client_id: clientId,
      org_id: orgId,
      created_by: user.id,
      body,
      student_id: initial.studentId,
    })
```

Change the `progress_notes` insert inside `addCallSummaryToProgressNotes`:
```typescript
    await supabase.from('progress_notes').insert({
      client_id: clientId,
      org_id: orgId,
      created_by: user.id,
      body,
    })
```
to:
```typescript
    await supabase.from('progress_notes').insert({
      client_id: clientId,
      org_id: orgId,
      created_by: user.id,
      body,
      student_id: initial.studentId,
    })
```

- [ ] **Step 3: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 4: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx" src/components/clients/SessionDetailClient.tsx
git commit -m "feat: tutoring progress reports — thread student_id from sessions into promoted notes"
```

---

### Task 3: Extend the client-messages API route (subject + noteIds)

**Files:**
- Modify: `src/app/api/clients/[id]/messages/route.ts`

**Interfaces:**
- Consumes: `public.progress_notes.sent_to_parent_at` (Task 1).
- Produces: `POST /api/clients/[id]/messages` now accepts optional `subject` (overrides the email
  subject) and `noteIds: string[]` (marks those notes' `sent_to_parent_at` after a successful
  send) — Task 4's `ProgressNotesList` depends on this exact shape. Fully backward compatible:
  existing callers passing only `{ body }` are unaffected.

- [ ] **Step 1: Read `src/app/api/clients/[id]/messages/route.ts`, then:**

  1. Change:
     ```typescript
     const { body } = await req.json() as { body?: string }
     ```
     to:
     ```typescript
     const { body, subject, noteIds } = await req.json() as { body?: string; subject?: string; noteIds?: string[] }
     ```

  2. Change:
     ```typescript
     const subject = `Message from ${senderName}`
     ```
     to:
     ```typescript
     const emailSubject = subject?.trim() || `Message from ${senderName}`
     ```

  3. Change:
     ```typescript
     try {
       await sendEmail({
         to: client.email,
         subject,
         text,
         html,
         fromName: senderName,
         fromEmail: process.env.RESEND_MESSAGING_FROM_EMAIL,
         replyTo: buildReplyToAddress(client.id, senderName),
       })
     } catch (err) {
       return NextResponse.json({ error: `Failed to send: ${(err as Error).message}` }, { status: 502 })
     }
     ```
     to:
     ```typescript
     try {
       await sendEmail({
         to: client.email,
         subject: emailSubject,
         text,
         html,
         fromName: senderName,
         fromEmail: process.env.RESEND_MESSAGING_FROM_EMAIL,
         replyTo: buildReplyToAddress(client.id, senderName),
       })
     } catch (err) {
       return NextResponse.json({ error: `Failed to send: ${(err as Error).message}` }, { status: 502 })
     }
     ```

  4. Change:
     ```typescript
     const { data: inserted, error } = await supabase
       .from('client_messages')
       .insert({ client_id: client.id, org_id: client.org_id, direction: 'outbound', body, sender_user_id: user.id })
       .select('id')
       .single()

     if (error) return NextResponse.json({ error: error.message }, { status: 500 })

     return NextResponse.json({ ok: true, id: inserted.id })
     ```
     to:
     ```typescript
     const { data: inserted, error } = await supabase
       .from('client_messages')
       .insert({ client_id: client.id, org_id: client.org_id, direction: 'outbound', body, sender_user_id: user.id })
       .select('id')
       .single()

     if (error) return NextResponse.json({ error: error.message }, { status: 500 })

     if (noteIds && noteIds.length > 0) {
       await service.from('progress_notes')
         .update({ sent_to_parent_at: new Date().toISOString() })
         .eq('client_id', client.id)
         .in('id', noteIds)
     }

     return NextResponse.json({ ok: true, id: inserted.id })
     ```

- [ ] **Step 2: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 3: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/clients/[id]/messages/route.ts"
git commit -m "feat: tutoring progress reports — messages API subject and noteIds support"
```

---

### Task 4: Notes page — student tagging, filter, and send-to-parent UI

**Files:**
- Modify: `src/components/clients/AddProgressNote.tsx`
- Modify: `src/components/clients/ProgressNotesList.tsx`
- Modify: `src/app/dashboard/clients/[id]/notes/page.tsx`

**Interfaces:**
- Consumes: `public.progress_notes.student_id`/`sent_to_parent_at` (Task 1),
  `POST /api/clients/[id]/messages` with `{ body, subject, noteIds }` (Task 3).
- Produces: nothing for later tasks — this is the last task in the plan. **All 3 files are one
  task** because the Notes page supplies the `students` prop that both `AddProgressNote` and
  `ProgressNotesList` now require, and `ProgressNotesList`'s exported `ProgressNoteRow` type change
  must match what the page maps into it.

- [ ] **Step 1: Rewrite `src/components/clients/AddProgressNote.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function AddProgressNote({
  clientId,
  orgId,
  students,
}: {
  clientId: string
  orgId: string | null
  students: { id: string; name: string }[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [body, setBody] = useState('')
  const [studentId, setStudentId] = useState('')
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
      student_id: studentId || null,
    })

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    setBody('')
    setStudentId('')
    router.refresh()
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      {students.length > 0 && (
        <select
          value={studentId}
          onChange={e => setStudentId(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
        >
          <option value="">— General note —</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
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

- [ ] **Step 2: Rewrite `src/components/clients/ProgressNotesList.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export type ProgressNoteRow = {
  id: string
  body: string
  created_at: string
  created_by: string
  author: string
  student_id: string | null
  sent_to_parent_at: string | null
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ProgressNotesList({
  notes,
  currentUserId,
  canManage,
  students,
  clientId,
}: {
  notes: ProgressNoteRow[]
  currentUserId: string
  canManage: boolean
  students: { id: string; name: string }[]
  clientId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [studentFilter, setStudentFilter] = useState('')
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')

  function startEdit(note: ProgressNoteRow) {
    setEditingId(note.id)
    setDraft(note.body)
    setError('')
  }

  async function saveEdit(id: string) {
    const trimmed = draft.trim()
    if (!trimmed) {
      setError('Progress note cannot be empty.')
      return
    }

    setSavingId(id)
    setError('')
    const { error: err } = await supabase.from('progress_notes').update({ body: trimmed }).eq('id', id)
    setSavingId(null)

    if (err) {
      setError(err.message)
      return
    }

    setEditingId(null)
    setDraft('')
    router.refresh()
  }

  function toggleSelected(id: string) {
    setSelectedNoteIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSendToParent() {
    const selected = notes.filter(n => selectedNoteIds.has(n.id))
    if (selected.length === 0) return
    setSending(true)
    setSendError('')

    const body = selected.map(n => n.body).join('\n\n')
    const studentIds = new Set(selected.map(n => n.student_id).filter(Boolean))
    const onlyStudentId = studentIds.size === 1 ? [...studentIds][0] : null
    const subject = onlyStudentId
      ? `Progress update for ${students.find(s => s.id === onlyStudentId)?.name ?? ''}`.trim()
      : 'Progress update'

    const res = await fetch(`/api/clients/${clientId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, subject, noteIds: [...selectedNoteIds] }),
    })

    setSending(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setSendError(data.error ?? 'Failed to send')
      return
    }

    setSelectedNoteIds(new Set())
    router.refresh()
  }

  if (notes.length === 0) {
    return <p className="text-sm font-semibold text-gray-400">No notes yet.</p>
  }

  const filteredNotes = studentFilter ? notes.filter(n => n.student_id === studentFilter) : notes

  return (
    <div className="space-y-3">
      {students.length > 0 && (
        <select
          value={studentFilter}
          onChange={e => setStudentFilter(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">— All students —</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}

      {selectedNoteIds.size > 0 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSendToParent}
            disabled={sending}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-600 disabled:opacity-40"
          >
            {sending ? 'Sending…' : `Send ${selectedNoteIds.size} selected to parent`}
          </button>
          {sendError && <p className="text-xs font-semibold text-red-600">{sendError}</p>}
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

      {filteredNotes.length === 0 && (
        <p className="text-sm font-semibold text-gray-400">No notes for this student yet.</p>
      )}

      {filteredNotes.map(note => {
        const canEdit = canManage || note.created_by === currentUserId
        const editing = editingId === note.id

        return (
          <div key={note.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                {note.sent_to_parent_at ? (
                  <span className="text-xs font-semibold text-green-600">Sent to parent on {fmtDateTime(note.sent_to_parent_at)}</span>
                ) : (
                  <input
                    type="checkbox"
                    checked={selectedNoteIds.has(note.id)}
                    onChange={() => toggleSelected(note.id)}
                    className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-400"
                  />
                )}
                <span className="text-xs font-bold text-gray-500">{note.author}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{fmtDateTime(note.created_at)}</span>
                {canEdit && !editing && (
                  <button
                    type="button"
                    onClick={() => startEdit(note)}
                    className="text-xs font-bold text-cyan-600 hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={5}
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveEdit(note.id)}
                    disabled={savingId === note.id || !draft.trim()}
                    className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-600 disabled:opacity-40"
                  >
                    {savingId === note.id ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setDraft(''); setError('') }}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-slate-300">{note.body}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Rewrite `src/app/dashboard/clients/[id]/notes/page.tsx`**

```typescript
// src/app/dashboard/clients/[id]/notes/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import AddProgressNote from '@/components/clients/AddProgressNote'
import ProgressNotesList, { type ProgressNoteRow } from '@/components/clients/ProgressNotesList'

export default async function ClientNotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null
  const canManageNotes = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')

  const { data: client } = await supabase.from('clients').select('id, name').eq('id', id).maybeSingle()
  if (!client) notFound()

  const { data: students } = await supabase
    .from('students')
    .select('id, name')
    .eq('client_id', id)
    .eq('archived', false)
    .order('name')

  const { data: notes } = await supabase
    .from('progress_notes')
    .select('id, body, created_at, created_by, student_id, sent_to_parent_at, profiles!progress_notes_created_by_fkey(full_name)')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  const notesData: ProgressNoteRow[] = (notes ?? []).map(note => ({
    id: note.id,
    body: note.body,
    created_at: note.created_at,
    created_by: note.created_by,
    student_id: note.student_id,
    sent_to_parent_at: note.sent_to_parent_at,
    author: (note.profiles as unknown as { full_name: string | null } | null)?.full_name ?? 'Unknown',
  }))

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Progress notes</h1>

        <AddProgressNote clientId={id} orgId={orgId} students={students ?? []} />

        <ProgressNotesList notes={notesData} currentUserId={user.id} canManage={canManageNotes} students={students ?? []} clientId={id} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 5: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 6: Manual smoke test**

1. On a session with a student set, use "Add to progress notes" (session notes or call summary) —
   confirm the resulting note has the correct `student_id` (check via the student filter, or SQL).
2. On the client's Notes page, confirm the student filter appears, filtering to that student shows
   the note, filtering to a different student hides it, "All students" shows everything.
3. Add a manual note with "— General note —" selected — confirm it shows under "All" but not under
   any specific student filter.
4. Select 2 unsent notes for the same student, click "Send N selected to parent" — confirm the
   client receives one email with both bodies concatenated and subject "Progress update for
   {name}"; confirm both notes now show "Sent to parent on {date}" instead of a checkbox and are no
   longer selectable.
5. Select notes for two different students in one batch, send, confirm the subject falls back to
   the generic "Progress update" (not blocked).
6. Confirm the client's own message thread (`/dashboard/clients/[id]/messages`) shows the sent
   progress-report email like any other outbound message.
7. Send a regular (non-progress-report) client message via the existing message composer — confirm
   it still works unchanged, with the original default subject line (`Message from {senderName}`).
8. If a second, non-admin org member account is available: have them select and send a note that a
   different user created — confirm the send succeeds and the note is correctly marked sent
   (this is the scenario Task 3's service-role update specifically fixes).

- [ ] **Step 7: Commit**

```bash
git add src/components/clients/AddProgressNote.tsx src/components/clients/ProgressNotesList.tsx "src/app/dashboard/clients/[id]/notes/page.tsx"
git commit -m "feat: tutoring progress reports — notes page student tagging, filter, and send-to-parent"
```

---

## Self-Review Notes

- **Spec coverage:** schema (Task 1), session-detail threading (Task 2), messages API extension
  (Task 3), notes page UI (Task 4) all match the spec's Architecture section exactly. The spec's
  "out of scope" list (retroactive tagging, parent portal, blocking mixed-student batches) has no
  task, correctly.
- **Placeholder scan:** none — every step has complete code or an exact before/after edit.
- **Type consistency:** `ProgressNoteRow`'s `student_id`/`sent_to_parent_at` fields (Task 4, Step 2)
  match exactly what the Notes page's query mapping produces (Task 4, Step 3). `SessionDetailClient`'s
  `studentId` field (Task 2, Step 2) matches what the session detail page passes (Task 2, Step 1).
  The messages route's `{ body, subject, noteIds }` shape (Task 3) matches exactly what
  `ProgressNotesList.handleSendToParent` sends (Task 4, Step 2).
- **Build-green guarantee:** Task 2 bundles both files whose shared `session`/`studentId` contract
  changes; Task 4 bundles all three files whose shared `students`/`ProgressNoteRow` contracts
  change. Task 3 is backward-compatible on its own (new fields are optional, existing callers
  passing only `{ body }` are unaffected) — no task leaves an intermediate red build.
- **RLS correctness check (from spec self-review):** confirmed the "mark sent" write goes through
  Task 3's service-role route, not a client-side `progress_notes` update — the existing
  creator-or-admin-only UPDATE policy (schema-042) would otherwise silently block a non-admin
  sending a colleague's note.
