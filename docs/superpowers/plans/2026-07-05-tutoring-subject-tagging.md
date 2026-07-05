# Tutoring Subject Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **TimeWiseHub-specific note:** this project's actual convention is the `handover-loop` skill (Claude conducts, Codex does text edits, conductor runs all shell/DB commands) — see `CLAUDE.md`. Translate these tasks into `.handover/spec.md` C-N items rather than generic subagent dispatch, unless told otherwise.

**Goal:** Let a student carry multiple subject tags (not just one), and let each session record which
subject it covered, with new subjects typed on a session feeding back into that student's tag list.

**Architecture:** `students.subject` (single text) is replaced by `students.subjects` (`text[]`).
`sessions` gains a nullable `subject text` column. `NewSessionModal` gets a subject picker scoped to
the selected student's tags plus a free-text "Other…" fallback that both tags the session and grows
the student's tag list. Student CRUD (`StudentForm`/`EditStudentModal`) and the students list page
switch from a single text field to a pill-based tag list.

**Tech Stack:** Next.js 16 / TypeScript strict / Supabase (`@supabase/ssr`) — no new dependencies.

## Global Constraints

- No test runner in this project — verification is `pnpm run build` plus manual browser testing.
- Recurring session series (`/api/clients/[id]/sessions/series`) is not modified — it already
  doesn't persist `studentId` (confirmed by reading the route), and won't persist `subject` either.
  Only single (non-repeating) sessions get a subject and trigger the student-tag-list update.
- No subject-based filtering/reporting UI — data capture and display only.
- No org-wide/shared subject vocabulary — free-text tags per student, exact-string dedup only (no
  case-normalization).
- A session's subject is always optional, same as `student_id` today.
- Source spec: `docs/superpowers/specs/2026-07-05-tutoring-subject-tagging-design.md`.

---

### Task 1: Database migration — students.subjects and sessions.subject

**Files:**
- Create: `supabase/schema-086-tutoring-subjects.sql`

**Interfaces:**
- Produces: `public.students.subjects` (`text[] not null default '{}'`, replacing the dropped
  `public.students.subject` column), `public.sessions.subject` (nullable `text`). Task 2 and Task 3
  both depend on these exact column names and types.

This task is **conductor-only** (DB migrations always are in this project).

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 086: Tutoring subject tagging
-- Third deep-dive feature for the Tutoring workspace profile.
-- Replaces students.subject (single text) with students.subjects
-- (text[]), backfilled from existing values. Adds sessions.subject
-- (nullable text). Run via Supabase MCP apply_migration
-- (name: tutoring_subject_tagging)
-- ============================================================

alter table public.students add column subjects text[] not null default '{}';

update public.students
set subjects = array[subject]
where subject is not null and subject <> '';

alter table public.students drop column subject;

alter table public.sessions add column subject text;
```

- [ ] **Step 2: Apply via Supabase MCP `apply_migration`**

Name: `tutoring_subject_tagging`, project id `sdwwlnnsijcadkdwsvud`.

- [ ] **Step 3: Verify via MCP `execute_sql`**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'students' and column_name in ('subject', 'subjects');
```

Expected: 1 row — `subjects`, `ARRAY`, `NO` (not nullable, has a default). No `subject` row (column
dropped).

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'sessions' and column_name = 'subject';
```

Expected: 1 row, `text`, nullable (`YES`).

```sql
select id, name, subjects from public.students limit 5;
```

Expected: any pre-existing students with a subject now show a one-element array (e.g.
`{"Year 10 Maths"}`); students that had no subject show `{}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-086-tutoring-subjects.sql
git commit -m "feat: tutoring subject tagging — database migration"
```

---

### Task 2: Student subject tags — CRUD and display

**Files:**
- Modify: `src/components/students/StudentForm.tsx`
- Modify: `src/components/students/EditStudentModal.tsx`
- Modify: `src/components/students/EditStudentButton.tsx`
- Modify: `src/app/api/students/[id]/route.ts`
- Modify: `src/app/dashboard/clients/[id]/students/page.tsx`

**Interfaces:**
- Consumes: `public.students.subjects` (Task 1).
- Produces: `EditStudentButton`'s `Student` type now has `subjects: string[]` (not `subject: string
  | null`) — Task 3 does not consume this type, but keep it in mind if any future task touches
  student props.

- [ ] **Step 1: Rewrite `src/components/students/StudentForm.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function StudentForm({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])
  const [newSubject, setNewSubject] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addSubject() {
    const trimmed = newSubject.trim()
    if (!trimmed || subjects.includes(trimmed)) return
    setSubjects(prev => [...prev, trimmed])
    setNewSubject('')
  }

  function removeSubject(subject: string) {
    setSubjects(prev => prev.filter(s => s !== subject))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: insertError } = await supabase.from('students').insert({
      client_id: clientId,
      name,
      subjects,
      notes: notes || null,
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      setOpen(false)
      setName(''); setSubjects([]); setNewSubject(''); setNotes('')
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
            <label className="mb-1 block text-xs font-semibold text-gray-500">Subjects</label>
            {subjects.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {subjects.map(s => (
                  <span key={s} className="flex items-center gap-1 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
                    {s}
                    <button type="button" onClick={() => removeSubject(s)} className="text-cyan-400 hover:text-cyan-700">✕</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubject() } }}
                placeholder="e.g. Year 10 Maths"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              <button type="button" onClick={addSubject}
                className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50">
                Add
              </button>
            </div>
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

- [ ] **Step 2: Rewrite `src/components/students/EditStudentModal.tsx`**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Student = {
  id: string
  name: string
  subjects: string[]
  notes: string | null
}

export default function EditStudentModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(student.name)
  const [subjects, setSubjects] = useState<string[]>(student.subjects)
  const [newSubject, setNewSubject] = useState('')
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

  function addSubject() {
    const trimmed = newSubject.trim()
    if (!trimmed || subjects.includes(trimmed)) return
    setSubjects(prev => [...prev, trimmed])
    setNewSubject('')
  }

  function removeSubject(subject: string) {
    setSubjects(prev => prev.filter(s => s !== subject))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/students/${student.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, subjects, notes: notes || null }),
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
            <label className="mb-1 block text-xs font-semibold text-gray-500">Subjects</label>
            {subjects.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {subjects.map(s => (
                  <span key={s} className="flex items-center gap-1 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                    {s}
                    <button type="button" onClick={() => removeSubject(s)} className="text-cyan-400 hover:text-cyan-700">✕</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubject() } }}
                className={inputCls} />
              <button type="button" onClick={addSubject}
                className="shrink-0 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400">
                Add
              </button>
            </div>
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

- [ ] **Step 3: Edit `src/components/students/EditStudentButton.tsx`**

Change:
```typescript
type Student = {
  id: string
  name: string
  subject: string | null
  notes: string | null
}
```
to:
```typescript
type Student = {
  id: string
  name: string
  subjects: string[]
  notes: string | null
}
```

- [ ] **Step 4: Edit `src/app/api/students/[id]/route.ts`**

In the `PATCH` handler, change:
```typescript
  const body = await req.json().catch(() => ({}))
  const { name, subject, notes } = body as { name: string; subject?: string | null; notes?: string | null }
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { error } = await supabase.from('students').update({
    name: name.trim(),
    subject: subject || null,
    notes: notes || null,
  }).eq('id', id)
```
to:
```typescript
  const body = await req.json().catch(() => ({}))
  const { name, subjects, notes } = body as { name: string; subjects?: string[]; notes?: string | null }
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { error } = await supabase.from('students').update({
    name: name.trim(),
    subjects: subjects ?? [],
    notes: notes || null,
  }).eq('id', id)
```

- [ ] **Step 5: Edit `src/app/dashboard/clients/[id]/students/page.tsx`**

Change:
```typescript
  const { data: students } = await supabase
    .from('students')
    .select('id, name, subject, notes')
    .eq('client_id', id)
    .eq('archived', false)
    .order('name')
```
to:
```typescript
  const { data: students } = await supabase
    .from('students')
    .select('id, name, subjects, notes')
    .eq('client_id', id)
    .eq('archived', false)
    .order('name')
```

Change:
```typescript
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{s.name}</p>
                    {s.subject && <p className="text-xs text-gray-400">{s.subject}</p>}
                  </div>
```
to:
```typescript
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{s.name}</p>
                    {s.subjects.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {s.subjects.map((subj: string) => (
                          <span key={subj} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-slate-800 dark:text-slate-400">
                            {subj}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
```

- [ ] **Step 6: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 7: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 8: Manual smoke test**

1. Open a tutoring client's Students page. Confirm an existing student (migrated from Task 1) shows
   their prior subject as one pill.
2. Add a new student with two subjects typed one at a time (press Add or Enter between each).
   Confirm both pills render after saving.
3. Edit that student: remove one pill, add a different one, save. Reload the page and confirm the
   change persisted.
4. Confirm typing a duplicate subject (exact match to an existing pill) does not add a second pill.

- [ ] **Step 9: Commit**

```bash
git add src/components/students/StudentForm.tsx src/components/students/EditStudentModal.tsx src/components/students/EditStudentButton.tsx "src/app/api/students/[id]/route.ts" "src/app/dashboard/clients/[id]/students/page.tsx"
git commit -m "feat: tutoring subject tagging — student CRUD and display"
```

---

### Task 3: Session subject tagging — booking flow, sessions page, billable panel

**Files:**
- Modify: `src/components/clients/NewSessionModal.tsx`
- Modify: `src/app/dashboard/clients/[id]/sessions/page.tsx`
- Modify: `src/components/clients/BillableSessionsPanel.tsx`

**Interfaces:**
- Consumes: `public.students.subjects`, `public.sessions.subject` (Task 1).
- Produces: nothing for later tasks — this is the last task in the plan.

- [ ] **Step 1: Rewrite `src/components/clients/NewSessionModal.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Template = { id: string; title: string; position: number }
type Repeat = 'none' | 'weekly' | 'fortnightly' | 'monthly'
type StudentOption = { id: string; name: string; subjects: string[] }

const OTHER_SUBJECT = '__other__'

export default function NewSessionModal({
  clientId,
  orgId,
  clientLabel,
  students,
}: {
  clientId: string
  orgId: string | null
  clientLabel: { singular: string; plural: string }
  students: StudentOption[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [studentId, setStudentId] = useState('')
  const [subjectChoice, setSubjectChoice] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [duration, setDuration] = useState(60)
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [templates, setTemplates] = useState<Template[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedStudent = students.find(s => s.id === studentId) ?? null

  useEffect(() => {
    setSubjectChoice('')
    setNewSubject('')
  }, [studentId])

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

    const resolvedSubject = subjectChoice === OTHER_SUBJECT
      ? (newSubject.trim() || null)
      : (subjectChoice || null)

    if (repeat !== 'none') {
      const res = await fetch(`/api/clients/${clientId}/sessions/series`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          scheduledAt,
          durationMinutes: duration,
          recurrenceInterval: repeat,
          studentId: studentId || null,
          subject: resolvedSubject,
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
        student_id: studentId || null,
        subject: resolvedSubject,
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

    if (
      selectedStudent &&
      subjectChoice === OTHER_SUBJECT &&
      resolvedSubject &&
      !selectedStudent.subjects.includes(resolvedSubject)
    ) {
      await supabase
        .from('students')
        .update({ subjects: [...selectedStudent.subjects, resolvedSubject] })
        .eq('id', selectedStudent.id)
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
          {selectedStudent && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Subject</label>
              <select
                value={subjectChoice}
                onChange={e => setSubjectChoice(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
              >
                <option value="">— None —</option>
                {selectedStudent.subjects.map(subj => <option key={subj} value={subj}>{subj}</option>)}
                <option value={OTHER_SUBJECT}>Other…</option>
              </select>
              {subjectChoice === OTHER_SUBJECT && (
                <input
                  value={newSubject}
                  onChange={e => setNewSubject(e.target.value)}
                  placeholder="e.g. Year 10 Maths"
                  className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                />
              )}
            </div>
          )}
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
              Checklist will be pre-filled from this {clientLabel.singular.toLowerCase()}&apos;s saved template ({templates.length} items).
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

- [ ] **Step 2: Edit `src/app/dashboard/clients/[id]/sessions/page.tsx`**

Change:
```typescript
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, title, scheduled_at, duration_minutes, status, student_id, students(name), session_todos(id, completed)')
    .eq('client_id', id)
    .order('scheduled_at', { ascending: true })

  const { data: students } = await supabase
    .from('students')
    .select('id, name')
    .eq('client_id', id)
    .eq('archived', false)
    .order('name')

  const { data: billableSessions } = await supabase
    .from('sessions')
    .select('id, title, scheduled_at, duration_minutes, students(name)')
    .eq('client_id', id)
    .eq('status', 'completed')
    .is('invoice_id', null)
    .order('scheduled_at', { ascending: true })

  const billableItems = (billableSessions ?? []).map(s => {
    const student = (s.students as unknown as { name: string } | null)
    return {
      id: s.id,
      title: s.title as string,
      scheduled_at: s.scheduled_at as string,
      duration_minutes: s.duration_minutes as number,
      studentName: student?.name ?? null,
    }
  })
```
to:
```typescript
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, title, scheduled_at, duration_minutes, status, student_id, subject, students(name), session_todos(id, completed)')
    .eq('client_id', id)
    .order('scheduled_at', { ascending: true })

  const { data: students } = await supabase
    .from('students')
    .select('id, name, subjects')
    .eq('client_id', id)
    .eq('archived', false)
    .order('name')

  const { data: billableSessions } = await supabase
    .from('sessions')
    .select('id, title, scheduled_at, duration_minutes, subject, students(name)')
    .eq('client_id', id)
    .eq('status', 'completed')
    .is('invoice_id', null)
    .order('scheduled_at', { ascending: true })

  const billableItems = (billableSessions ?? []).map(s => {
    const student = (s.students as unknown as { name: string } | null)
    return {
      id: s.id,
      title: s.title as string,
      scheduled_at: s.scheduled_at as string,
      duration_minutes: s.duration_minutes as number,
      studentName: student?.name ?? null,
      subject: s.subject as string | null,
    }
  })
```

Change:
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
to:
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
      subject: s.subject as string | null,
      done: todos.filter(t => t.completed).length,
      total: todos.length,
    }
  })
```

Change the `Tile` `meta` prop:
```typescript
              meta={`${new Date(s.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} · ${s.duration} min${s.studentName ? ` · ${s.studentName}` : ''}`}
```
to:
```typescript
              meta={`${new Date(s.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} · ${s.duration} min${s.studentName ? ` · ${s.studentName}` : ''}${s.subject ? ` · ${s.subject}` : ''}`}
```

- [ ] **Step 3: Edit `src/components/clients/BillableSessionsPanel.tsx`**

Change:
```typescript
type BillableSession = {
  id: string
  title: string
  scheduled_at: string
  duration_minutes: number
  studentName: string | null
}
```
to:
```typescript
type BillableSession = {
  id: string
  title: string
  scheduled_at: string
  duration_minutes: number
  studentName: string | null
  subject: string | null
}
```

Change:
```typescript
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                {s.title}{s.studentName ? ` · ${s.studentName}` : ''}
              </p>
```
to:
```typescript
              <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                {s.title}{s.studentName ? ` · ${s.studentName}` : ''}{s.subject ? ` · ${s.subject}` : ''}
              </p>
```

- [ ] **Step 4: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 5: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 6: Manual smoke test**

1. On a tutoring client's Sessions page, book a new session for a student that has 2+ subject tags
   (from Task 2's smoke test). Confirm the Subject dropdown lists exactly those tags plus "Other…",
   with no dropdown shown at all before a student is picked.
2. Select an existing tag, save. Confirm the session's tile meta line shows `· {subject}` after the
   student name.
3. Book a second session for the same student, choose "Other…", type a brand-new subject (e.g.
   "Trial topic"), save. Confirm the new session shows that subject.
4. Open that student's Edit modal (or check via SQL: `select subjects from students where id =
   '<id>'`) and confirm the new subject was appended to their tag list.
5. Book a session with no student selected at all. Confirm no subject picker renders, and the
   session saves with `subject = null` (no `· {subject}` in its meta line).
6. If a completed, uninvoiced session with a subject exists, confirm the "Billable lessons" panel
   also shows `· {subject}` after the student name for that row.

- [ ] **Step 7: Commit**

```bash
git add src/components/clients/NewSessionModal.tsx "src/app/dashboard/clients/[id]/sessions/page.tsx" src/components/clients/BillableSessionsPanel.tsx
git commit -m "feat: tutoring subject tagging — booking flow, sessions page, billable panel"
```

---

## Self-Review Notes

- **Spec coverage:** schema (Task 1), student CRUD + display (Task 2), booking flow + sessions page
  + billable panel display (Task 3) all match the spec's Architecture section exactly. The spec's
  "out of scope" list (recurring series persistence, filtering/reporting UI, shared subject
  vocabulary, fuzzy dedup) has no task, correctly.
- **Placeholder scan:** none — every step has complete code or an exact line-level before/after
  edit.
- **Type consistency:** `StudentOption` (Task 3, `{ id, name, subjects: string[] }`) matches the
  `students` query's `select('id, name, subjects')` in the same task. `BillableSession`'s `subject:
  string | null` (Task 3) matches `billableItems`'s `subject: s.subject as string | null` mapping in
  the same task. `EditStudentModal`'s `Student` type (`subjects: string[]`, Task 2) matches
  `EditStudentButton`'s updated `Student` type in the same task, and both match the `students` page
  query's `select('id, name, subjects, notes')`.
