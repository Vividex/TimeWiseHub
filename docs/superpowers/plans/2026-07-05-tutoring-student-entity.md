# Tutoring Student Entity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **TimeWiseHub-specific note:** this project's actual convention is the `handover-loop` skill (Claude conducts, Codex does text edits, conductor runs all shell/DB commands) — see `CLAUDE.md`. Translate these tasks into `.handover/spec.md` C-N items rather than generic subagent dispatch, unless told otherwise.

**Goal:** Add a `students` entity linked to `clients` (the client becomes explicitly "the paying
parent"), with `sessions.student_id` as an additive, nullable link — zero behaviour change for
non-tutoring profiles, real multi-child support for tutoring.

**Architecture:** New `students` table with RLS mirroring `clients`' exact three-policy shape.
Student CRUD UI mirrors the existing Client CRUD components structurally (`StudentForm`,
`EditStudentModal`, `EditStudentButton`, `DeleteStudentButton`, a matching API route). The client
detail page's "Students" tile and `NewSessionModal`'s student picker are both gated to
`profile.key === 'tutoring'` — this is genuinely tutoring-only functionality right now.

**Tech Stack:** Next.js 16 / TypeScript strict / Supabase (`@supabase/ssr`) — no new dependencies.

## Global Constraints

- No test runner in this project — verification is `pnpm run build` plus manual browser testing.
- `sessions.client_id` stays `not null`; `student_id` is nullable and additive. Every existing
  session (and every non-tutoring session going forward) keeps `student_id = null`.
- `progress_notes`, `client_messages`, `projects`, and invoicing all stay keyed to `client_id` —
  explicitly out of scope this pass.
- `client_session_templates` stays per-client, not split per-student.
- Archived students are not shown or restorable in this pass (no `RestoreStudentButton`) — matches
  the spec's stated scope; add later if actually needed, mirroring `RestoreClientButton`.
- One deliberate deviation from a literal mirror of the Client API route: the existing
  `/api/clients/[id]` `DELETE` handler requires admin role only (no owner exception), which would
  incorrectly block a solo Pro tutor with no org from archiving their own students. The new
  `/api/students/[id]` route uses `isOwner || isAdmin` for **both** `PATCH` and `DELETE`, matching
  the RLS policies below (which correctly grant a solo owner full control over their own clients'
  students) and matching `PATCH`'s own already-correct check on the clients route.
- Source spec: `docs/superpowers/specs/2026-07-05-tutoring-student-entity-design.md`.

---

### Task 1: Database migration — students table and sessions.student_id

**Files:**
- Create: `supabase/schema-084-tutoring-students.sql`

**Interfaces:**
- Produces: `public.students` (`id, client_id, name, subject, notes, archived, created_at`),
  `public.sessions.student_id` (nullable FK to `students`). Task 2's API route and UI components,
  and Task 4's `NewSessionModal`/sessions page, all depend on this exact column set.

This task is **conductor-only** (DB migrations always are in this project).

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 084: Tutoring Student entity
-- First deep-dive feature for the Tutoring workspace profile. Students
-- are learners linked to a Client (the paying parent). sessions.student_id
-- is nullable and additive -- every non-tutoring session keeps it null and
-- behaves exactly as before. Run via Supabase MCP apply_migration
-- (name: tutoring_students)
-- ============================================================

create table public.students (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients on delete cascade,
  name        text not null,
  subject     text,
  notes       text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.students enable row level security;

create policy "Owners can manage students of their own clients"
  on public.students for all
  using (
    exists (
      select 1 from public.clients c
      where c.id = students.client_id and c.owner_id = auth.uid()
    )
  );

create policy "Org members can view students of org clients"
  on public.students for select
  using (
    exists (
      select 1 from public.clients c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = students.client_id and om.user_id = auth.uid()
    )
  );

create policy "Org admins can manage students of org clients"
  on public.students for all
  using (
    exists (
      select 1 from public.clients c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = students.client_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

alter table public.sessions
  add column student_id uuid references public.students on delete set null;
```

- [ ] **Step 2: Apply via Supabase MCP `apply_migration`**

Name: `tutoring_students`, project id `sdwwlnnsijcadkdwsvud`.

- [ ] **Step 3: Verify via MCP `execute_sql`**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'students'
order by ordinal_position;
```

Expected: 7 rows (`id`, `client_id`, `name`, `subject`, `notes`, `archived`, `created_at`)
matching the `create table` statement above.

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'sessions' and column_name = 'student_id';
```

Expected: 1 row, `uuid`, nullable.

```sql
select count(*) from pg_policies where schemaname = 'public' and tablename = 'students';
```

Expected: `3` (the three policies above).

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-084-tutoring-students.sql
git commit -m "feat: tutoring student entity — database migration"
```

---

### Task 2: Student CRUD components and API route

**Files:**
- Create: `src/components/students/StudentForm.tsx`
- Create: `src/components/students/EditStudentModal.tsx`
- Create: `src/components/students/EditStudentButton.tsx`
- Create: `src/components/students/DeleteStudentButton.tsx`
- Create: `src/app/api/students/[id]/route.ts`
- Create: `src/app/dashboard/clients/[id]/students/page.tsx`

**Interfaces:**
- Consumes: Task 1's `students` table (columns `id, client_id, name, subject, notes, archived`).
- Produces: `StudentForm({ clientId: string })`, `EditStudentButton({ student: { id, name,
  subject: string | null, notes: string | null } })`, `DeleteStudentButton({ studentId: string,
  studentName: string })` — Task 3 does not consume these directly (only the students page does),
  Task 4 does not consume these either (only `NewSessionModal`/sessions page fetch raw `students`
  rows themselves).

- [ ] **Step 1: Write `src/components/students/StudentForm.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function StudentForm({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: insertError } = await supabase.from('students').insert({
      client_id: clientId,
      name,
      subject: subject || null,
      notes: notes || null,
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      setOpen(false)
      setName(''); setSubject(''); setNotes('')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button onClick={() => setOpen(o => !o)}
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600">
        {open ? 'Cancel' : '+ Add student'}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Student name *</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Emma"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Subject</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Year 10 Maths"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button type="submit" disabled={loading}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {loading ? 'Saving…' : 'Save student'}
          </button>
        </form>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write `src/components/students/EditStudentModal.tsx`**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Student = {
  id: string
  name: string
  subject: string | null
  notes: string | null
}

export default function EditStudentModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(student.name)
  const [subject, setSubject] = useState(student.subject ?? '')
  const [notes, setNotes] = useState(student.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/students/${student.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, subject: subject || null, notes: notes || null }),
    })
    if (res.ok) {
      onClose()
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError((data as { error?: string }).error ?? 'Failed to save')
    }
    setLoading(false)
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <h2 className="font-['Poppins'] text-lg font-black text-slate-900 dark:text-slate-100">Edit student</h2>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Student name *</label>
            <input ref={firstRef} required type="text" value={name} onChange={e => setName(e.target.value)}
              className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Subject</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className={`resize-none ${inputCls}`} />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write `src/components/students/EditStudentButton.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import EditStudentModal from './EditStudentModal'

type Student = {
  id: string
  name: string
  subject: string | null
  notes: string | null
}

export default function EditStudentButton({ student }: { student: Student }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-400"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>
      {open && <EditStudentModal student={student} onClose={() => setOpen(false)} />}
    </>
  )
}
```

- [ ] **Step 4: Write `src/components/students/DeleteStudentButton.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function DeleteStudentButton({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleArchive() {
    setLoading(true)
    const res = await fetch(`/api/students/${studentId}`, { method: 'DELETE' })
    setOpen(false)
    if (res.ok) {
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Archive
      </button>

      <ConfirmDialog
        open={open}
        title={`Archive ${studentName}?`}
        message={`${studentName} will be removed from the active student list. Existing sessions are preserved.`}
        confirmLabel="Archive student"
        onConfirm={handleArchive}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
```

- [ ] **Step 5: Write `src/app/api/students/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', userId).maybeSingle()
  return ['owner', 'admin'].includes(membership?.role ?? '')
}

async function getOwnerIdForStudent(supabase: Awaited<ReturnType<typeof createClient>>, studentId: string) {
  const { data } = await supabase
    .from('students')
    .select('id, clients(owner_id)')
    .eq('id', studentId)
    .maybeSingle()
  const client = (data?.clients as unknown as { owner_id: string } | null)
  return { exists: !!data, ownerId: client?.owner_id ?? null }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { exists, ownerId } = await getOwnerIdForStudent(supabase, id)
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = ownerId === user.id
  const isAdmin = await requireAdmin(supabase, user.id)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { name, subject, notes } = body as { name: string; subject?: string | null; notes?: string | null }
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { error } = await supabase.from('students').update({
    name: name.trim(),
    subject: subject || null,
    notes: notes || null,
  }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { exists, ownerId } = await getOwnerIdForStudent(supabase, id)
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = ownerId === user.id
  const isAdmin = await requireAdmin(supabase, user.id)
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase.from('students').update({ archived: true }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Write `src/app/dashboard/clients/[id]/students/page.tsx`**

```typescript
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import StudentForm from '@/components/students/StudentForm'
import EditStudentButton from '@/components/students/EditStudentButton'
import DeleteStudentButton from '@/components/students/DeleteStudentButton'

export default async function ClientStudentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')

  const { data: client } = await supabase.from('clients').select('id, name, owner_id').eq('id', id).maybeSingle()
  if (!client) notFound()
  const canEdit = isAdmin || client.owner_id === user.id

  const { data: students } = await supabase
    .from('students')
    .select('id, name, subject, notes')
    .eq('client_id', id)
    .eq('archived', false)
    .order('name')

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Students</h1>

        {canEdit && <StudentForm clientId={id} />}

        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {(students ?? []).length === 0 ? (
            <p className="p-6 text-sm text-gray-400 dark:text-slate-500">No students yet. Add your first.</p>
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-slate-800">
              {(students ?? []).map(s => (
                <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{s.name}</p>
                    {s.subject && <p className="text-xs text-gray-400">{s.subject}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-2">
                      <EditStudentButton student={s} />
                      <DeleteStudentButton studentId={s.id} studentName={s.name} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 8: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 9: Commit**

```bash
git add src/components/students/StudentForm.tsx src/components/students/EditStudentModal.tsx src/components/students/EditStudentButton.tsx src/components/students/DeleteStudentButton.tsx src/app/api/students/[id]/route.ts src/app/dashboard/clients/[id]/students/page.tsx
git commit -m "feat: tutoring student entity — student CRUD"
```

---

### Task 3: Students tile on client detail page

**Files:**
- Modify: `src/app/dashboard/clients/[id]/page.tsx`

**Interfaces:**
- Consumes: `getWorkspaceProfileForUser` (Phase 1) — this task additionally destructures `key`
  (already returned, just not previously used by this file) alongside the existing `terminology`.
  `public.students` table (Task 1).
- Produces: nothing for later tasks.

- [ ] **Step 1: Read `src/app/dashboard/clients/[id]/page.tsx`, then:**
  1. Add `GraduationCap` to the existing lucide-react import (alongside `FolderKanban,
     CalendarClock, ...`).
  2. Change:
     ```typescript
     const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)
     ```
     to:
     ```typescript
     const { terminology, key: profileKey } = await getWorkspaceProfileForUser(supabase, user.id)
     ```
  3. After the existing `Promise.all` fetching `projectCount`/`sessionCount`/`noteCount` (before
     `const { data: latestInboundMessage } = ...`), add:
     ```typescript
       let studentCount = 0
       if (profileKey === 'tutoring') {
         const { count } = await supabase
           .from('students').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('archived', false)
         studentCount = count ?? 0
       }
     ```
  4. In the "Activity" `TileGrid` (the one currently containing Projects/Sessions/Progress
     notes/Messages tiles), add a new tile right after the "Progress notes" `Tile` and before the
     "Messages" `Tile`:
     ```typescript
             {profileKey === 'tutoring' && (
               <Tile title="Students" icon={GraduationCap} accent="#16a34a" stat={studentCount} href={`/dashboard/clients/${id}/students`} />
             )}
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
git add src/app/dashboard/clients/[id]/page.tsx
git commit -m "feat: tutoring student entity — Students tile on client detail page"
```

---

### Task 4: Student picker in session creation, student shown per session

**Files:**
- Modify: `src/components/clients/NewSessionModal.tsx`
- Modify: `src/app/dashboard/clients/[id]/sessions/page.tsx`

**Interfaces:**
- Consumes: `public.students` table (Task 1).
- Produces: nothing for later tasks — this is the last task in the plan.

- [ ] **Step 1: Read `src/components/clients/NewSessionModal.tsx`, then:**
  1. Change the props signature from:
     ```typescript
     export default function NewSessionModal({
       clientId,
       orgId,
       clientLabel,
     }: {
       clientId: string
       orgId: string | null
       clientLabel: { singular: string; plural: string }
     }) {
     ```
     to:
     ```typescript
     export default function NewSessionModal({
       clientId,
       orgId,
       clientLabel,
       students,
     }: {
       clientId: string
       orgId: string | null
       clientLabel: { singular: string; plural: string }
       students: { id: string; name: string }[]
     }) {
     ```
  2. Add a new piece of state alongside the existing ones (`const [studentId, setStudentId] =
     useState('')`).
  3. In `handleSubmit`, add `student_id: studentId || null,` to **both** insert payloads — the
     recurring-series `fetch` body (add `studentId: studentId || null,` there, since that request
     body is JSON not a direct Supabase insert) and the plain `supabase.from('sessions').insert({
     ... })` call (add `student_id: studentId || null,` there):
     ```typescript
     const res = await fetch(`/api/clients/${clientId}/sessions/series`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         title: title.trim(),
         scheduledAt,
         durationMinutes: duration,
         recurrenceInterval: repeat,
         studentId: studentId || null,
       }),
     })
     ```
     ```typescript
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
         student_id: studentId || null,
       })
       .select('id')
       .single()
     ```
     Note: the recurring-series API route (`/api/clients/[id]/sessions/series/route.ts`) is **not**
     modified in this task — it will simply ignore the new `studentId` field in its request body
     since it doesn't read that key yet. This means recurring tutoring sessions won't get a
     `student_id` set until that route is updated in a future pass; only single (non-repeating)
     sessions get `student_id` wired up in this task. This is a deliberate, narrow scope — flag it
     honestly during manual testing rather than silently over-promising.
  4. Add the student picker to the form, right after the "Title" field and before "Date & time",
     only when `students.length > 0`:
     ```typescript
           {students.length > 0 && (
             <div>
               <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Student</label>
               <select
                 value={studentId}
                 onChange={e => setStudentId(e.target.value)}
                 className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
               >
                 <option value="">— Select student —</option>
                 {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
               </select>
             </div>
           )}
     ```

- [ ] **Step 2: Read `src/app/dashboard/clients/[id]/sessions/page.tsx`, then:**
  1. Change the `sessions` query's `.select(...)` to also fetch `student_id` and join the
     student's name:
     ```typescript
     const { data: sessions } = await supabase
       .from('sessions')
       .select('id, title, scheduled_at, duration_minutes, status, student_id, students(name), session_todos(id, completed)')
       .eq('client_id', id)
       .order('scheduled_at', { ascending: true })
     ```
  2. Change the `items` mapping to carry the student name through:
     ```typescript
     const items = (sessions ?? []).map(s => {
       const todos = (s.session_todos as { completed: boolean }[]) ?? []
       const student = (s.students as unknown as { name: string } | null)
       return {
         id: s.id,
         title: s.title as string,
         scheduled_at: s.scheduled_at as string,
         duration: s.duration_minutes as number,
         status: s.status as string,
         studentName: student?.name ?? null,
         done: todos.filter(t => t.completed).length,
         total: todos.length,
       }
     })
     ```
  3. Fetch the client's own students list (for the picker) alongside the existing `sessions`
     query — add this as a new query, e.g. right after the existing `sessions` query:
     ```typescript
     const { data: students } = await supabase
       .from('students')
       .select('id, name')
       .eq('client_id', id)
       .eq('archived', false)
       .order('name')
     ```
  4. Pass the fetched list to `NewSessionModal`:
     ```typescript
     <NewSessionModal clientId={id} orgId={orgId} clientLabel={terminology.client} students={students ?? []} />
     ```
  5. Update the `Tile`'s `meta` to include the student name when present:
     ```typescript
     meta={`${new Date(s.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} · ${s.duration} min${s.studentName ? ` · ${s.studentName}` : ''}`}
     ```

- [ ] **Step 3: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 4: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 5: Manual smoke test**

As the Vividex owner, temporarily switch Industry to "Tutoring & Education" via Settings:
1. Create a test client, confirm the "Students" tile appears on their detail page (and does not
   appear when switched back to a non-tutoring profile).
2. Add two students under that client.
3. From the client's Sessions page, confirm `NewSessionModal` now shows a "Student" dropdown
   listing both students, and confirm no dropdown appears for a client with zero students.
4. Create one (non-repeating) session for each student; confirm the sessions list shows each
   session's student name in its `meta` line, so the two are visually distinguishable.
5. Edit and archive a student via the Students page; confirm the archived student disappears from
   the list and from `NewSessionModal`'s picker on next load.
6. Switch Industry back to Builder & Construction afterward — same discipline as every prior
   phase, confirm via SQL that the real account is restored.

- [ ] **Step 6: Commit**

```bash
git add src/components/clients/NewSessionModal.tsx src/app/dashboard/clients/[id]/sessions/page.tsx
git commit -m "feat: tutoring student entity — student picker in session creation and session list"
```

---

## Self-Review Notes

- **Spec coverage:** schema (Task 1), Student CRUD UI + API route (Task 2), Students tile gated to
  tutoring (Task 3), session creation/list student wiring (Task 4) — all match the spec's
  Architecture section. The spec's "out of scope" list (progress_notes, client_messages, projects,
  invoicing, `client_session_templates`, lesson packages/credits, subject tagging, progress
  reports) has no task, correctly.
- **Placeholder scan:** none — every step has complete code or an exact line-level edit
  instruction. The one honest caveat (recurring sessions don't get `student_id` this pass) is
  called out explicitly in Task 4 rather than silently glossed over.
- **Type consistency:** `Student` type (`{ id, name, subject: string | null, notes: string | null
  }`) is used identically across `EditStudentModal.tsx` and `EditStudentButton.tsx`. The
  `students: { id: string; name: string }[]` prop shape passed into `NewSessionModal` (Task 4)
  matches exactly what `clients/[id]/sessions/page.tsx`'s new `students` query produces (Task 4)
  and doesn't need the `subject`/`notes` fields Task 2's fuller `Student` type carries — a
  deliberately narrower shape for just what the picker needs.
