# Tutoring Student Entity

## Goal
Add a `students` entity linked to `clients` (the client becomes explicitly "the paying parent"),
with `sessions.student_id` as an additive, nullable link — zero behaviour change for non-tutoring
profiles, real multi-child support for tutoring. First deep-dive feature for the Tutoring
workspace profile.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-05-tutoring-student-entity-design.md`
- Source plan: `docs/superpowers/plans/2026-07-05-tutoring-student-entity.md`
- Informed by real research (agent research into TutorCruncher/TutorBird/Teachworks/My Music
  Staff, 2026-07-05) plus direct user knowledge that multiple children per paying family is common
  in this market, not an edge case.
- `sessions.client_id` stays `not null`; `student_id` is nullable and additive. Every existing
  session (and every non-tutoring session going forward) keeps `student_id = null` and behaves
  exactly as today.
- `progress_notes`, `client_messages`, `projects`, and invoicing all stay keyed to `client_id` —
  explicitly deferred to later passes, not guessed at now. `client_session_templates` stays
  per-client, not split per-student.
- Students CRUD and the "Students" tile are gated to `profile.key === 'tutoring'` — genuinely
  tutoring-only functionality right now, not a generic capability.
- Archived students are not shown or restorable this pass (no `RestoreStudentButton`).
- Deliberate deviation from a literal mirror of the Client API route: `/api/students/[id]` uses
  `isOwner || isAdmin` for both `PATCH` and `DELETE` (the existing client `DELETE` route is
  admin-only with no owner exception, which would incorrectly block a solo Pro tutor with no org).
- Recurring (repeating) sessions do NOT get `student_id` wired up this pass — only single sessions
  do. The recurring-series API route isn't touched. Flag this honestly during manual testing.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1 is conductor-only (DB migration via Supabase MCP).
- C-4's manual smoke test requires temporarily switching the real org's Industry to "Tutoring &
  Education" via Settings, then switching it back afterward.

---

## C-1 — Database migration: students table and sessions.student_id

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-084-tutoring-students.sql`:
  ```sql
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
- [x] Apply via Supabase MCP `apply_migration` (name: `tutoring_students`).
- [x] Verify via MCP `execute_sql`:
  ```sql
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'students'
  order by ordinal_position;
  ```
  Expected: 7 rows (`id`, `client_id`, `name`, `subject`, `notes`, `archived`, `created_at`).
  ```sql
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sessions' and column_name = 'student_id';
  ```
  Expected: 1 row, `uuid`, nullable.
  ```sql
  select count(*) from pg_policies where schemaname = 'public' and tablename = 'students';
  ```
  Expected: `3`.
- [x] Commit: `git add supabase/schema-084-tutoring-students.sql && git commit -m "feat: tutoring student entity — database migration"`

---

## C-2 — Student CRUD components and API route

*Codex edits:*
- [x] Create `src/components/students/StudentForm.tsx`:
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
- [x] Create `src/components/students/EditStudentModal.tsx`:
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
- [x] Create `src/components/students/EditStudentButton.tsx`:
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
- [x] Create `src/components/students/DeleteStudentButton.tsx`:
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
- [x] Create `src/app/api/students/[id]/route.ts`:
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
- [x] Create `src/app/dashboard/clients/[id]/students/page.tsx`:
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
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/components/students/StudentForm.tsx src/components/students/EditStudentModal.tsx src/components/students/EditStudentButton.tsx src/components/students/DeleteStudentButton.tsx src/app/api/students/[id]/route.ts src/app/dashboard/clients/[id]/students/page.tsx && git commit -m "feat: tutoring student entity — student CRUD"`

---

## C-3 — Students tile on client detail page

*Codex edits:*
- [x] Read `src/app/dashboard/clients/[id]/page.tsx`, then:
  1. Add `GraduationCap` to the existing lucide-react import.
  2. Change `const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)` to
     `const { terminology, key: profileKey } = await getWorkspaceProfileForUser(supabase, user.id)`.
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
  4. In the "Activity" `TileGrid`, add a new tile right after the "Progress notes" `Tile` and
     before the "Messages" `Tile`:
     ```typescript
             {profileKey === 'tutoring' && (
               <Tile title="Students" icon={GraduationCap} accent="#16a34a" stat={studentCount} href={`/dashboard/clients/${id}/students`} />
             )}
     ```
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add "src/app/dashboard/clients/[id]/page.tsx" && git commit -m "feat: tutoring student entity — Students tile on client detail page"`

---

## C-4 — Student picker in session creation, student shown per session

*Codex edits:*
- [ ] Read `src/components/clients/NewSessionModal.tsx`, then:
  1. Change the props signature to add `students: { id: string; name: string }[]` alongside the
     existing `clientId`/`orgId`/`clientLabel`.
  2. Add `const [studentId, setStudentId] = useState('')` alongside the other `useState` calls.
  3. Add `studentId: studentId || null,` to the recurring-series `fetch` body's JSON payload.
  4. Add `student_id: studentId || null,` to the plain `supabase.from('sessions').insert({ ... })`
     call's object.
  5. Add a "Student" `<select>` right after the "Title" field and before "Date & time", only when
     `students.length > 0`:
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
  Note: the recurring-series API route is NOT modified this task — recurring sessions won't get
  `student_id` set until a future pass touches that route. Only single (non-repeating) sessions
  get it wired up here.
- [ ] Read `src/app/dashboard/clients/[id]/sessions/page.tsx`, then:
  1. Change the `sessions` query's `.select(...)` to:
     ```typescript
     const { data: sessions } = await supabase
       .from('sessions')
       .select('id, title, scheduled_at, duration_minutes, status, student_id, students(name), session_todos(id, completed)')
       .eq('client_id', id)
       .order('scheduled_at', { ascending: true })
     ```
  2. Change the `items` mapping to:
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
  3. Add a students query right after the existing `sessions` query:
     ```typescript
     const { data: students } = await supabase
       .from('students')
       .select('id, name')
       .eq('client_id', id)
       .eq('archived', false)
       .order('name')
     ```
  4. Change `<NewSessionModal clientId={id} orgId={orgId} clientLabel={terminology.client} />` to
     `<NewSessionModal clientId={id} orgId={orgId} clientLabel={terminology.client} students={students ?? []} />`.
  5. Change the `Tile`'s `meta` to:
     ```typescript
     meta={`${new Date(s.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} · ${s.duration} min${s.studentName ? ` · ${s.studentName}` : ''}`}
     ```
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual smoke test: temporarily switch Industry to "Tutoring & Education" via Settings.
  Create a client, confirm the Students tile appears; add two students; confirm
  `NewSessionModal`'s Student dropdown lists both; create one session per student; confirm the
  sessions list shows each session's student name; edit and archive a student, confirm it
  disappears from the list and picker. Switch Industry back afterward, confirm via SQL.
- [ ] Commit: `git add src/components/clients/NewSessionModal.tsx "src/app/dashboard/clients/[id]/sessions/page.tsx" && git commit -m "feat: tutoring student entity — student picker in session creation and session list"`

---

## Acceptance checklist
- [x] C-1: `students` table + RLS + `sessions.student_id` applied and verified
- [x] C-2: Student CRUD components + API route + students page created, build passes
- [x] C-3: Students tile shown only for tutoring profile, build passes
- [ ] C-4: student picker wired into session creation, student shown per session, manual smoke
  confirms the full flow and real account industry is restored afterward

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. No test runner in
this project — manual browser + SQL smoke required for C-1 and C-4.
