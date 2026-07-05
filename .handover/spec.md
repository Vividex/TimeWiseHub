# Tutoring Subject Tagging

## Goal
Let a student carry multiple subject tags (not just one), and let each session record which
subject it covered, with new subjects typed on a session feeding back into that student's tag
list. Third deep-dive feature for the Tutoring workspace profile.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-05-tutoring-subject-tagging-design.md`
- Source plan: `docs/superpowers/plans/2026-07-05-tutoring-subject-tagging.md`
- `students.subject` (single text) is replaced by `students.subjects` (`text[]`), backfilled from
  existing values, old column dropped.
- `sessions.subject` (nullable text) — new, no backfill needed.
- Free-text tags per student, no shared/org-wide subject vocabulary. Exact-string dedup only (no
  case-normalization).
- Booking a session: subject `<select>` scoped to the selected student's tags, plus an "Other…"
  free-text fallback. A new value both tags the session and appends to that student's `subjects`
  array.
- Always optional — a session can have no student and/or no subject, same as today.
- Recurring session series (`/api/clients/[id]/sessions/series`) is explicitly NOT modified — it
  already doesn't persist `studentId` (confirmed by reading it), and won't persist `subject`
  either. Only single (non-repeating) sessions get a subject and trigger the student-tag update.
- No filtering/reporting UI — data capture and display only, this pass.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1 is conductor-only (DB migration via Supabase MCP).

---

## C-1 — Database migration: students.subjects and sessions.subject

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-086-tutoring-subjects.sql`:
  ```sql
  alter table public.students add column subjects text[] not null default '{}';

  update public.students
  set subjects = array[subject]
  where subject is not null and subject <> '';

  alter table public.students drop column subject;

  alter table public.sessions add column subject text;
  ```
- [x] Apply via Supabase MCP `apply_migration` (name: `tutoring_subject_tagging`).
- [x] Verify via MCP `execute_sql`:
  ```sql
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'students' and column_name in ('subject', 'subjects');
  ```
  Expected: 1 row — `subjects`, `ARRAY`, `NO`. No `subject` row.
  ```sql
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sessions' and column_name = 'subject';
  ```
  Expected: 1 row, `text`, nullable.
  ```sql
  select id, name, subjects from public.students limit 5;
  ```
  Expected: prior subject values now show as one-element arrays; students with no subject show `{}`.
- [x] Commit: `git add supabase/schema-086-tutoring-subjects.sql && git commit -m "feat: tutoring subject tagging — database migration"`

---

## C-2 — Student subject tags: CRUD and display

*Codex edits:*
- [ ] Rewrite `src/components/students/StudentForm.tsx`:
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
- [ ] Rewrite `src/components/students/EditStudentModal.tsx`:
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
- [ ] Edit `src/components/students/EditStudentButton.tsx` — change:
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
- [ ] Edit `src/app/api/students/[id]/route.ts` — in `PATCH`, change:
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
- [ ] Edit `src/app/dashboard/clients/[id]/students/page.tsx` — change:
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
  and change:
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
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Manual smoke test: existing student's migrated subject shows as one pill; add a new student
  with two subjects; edit a student (remove one pill, add a different one), confirm persistence on
  reload; confirm duplicate subject text does not add a second pill.
- [x] Commit: `git add src/components/students/StudentForm.tsx src/components/students/EditStudentModal.tsx src/components/students/EditStudentButton.tsx "src/app/api/students/[id]/route.ts" "src/app/dashboard/clients/[id]/students/page.tsx" && git commit -m "feat: tutoring subject tagging — student CRUD and display"`

---

## C-3 — Session subject tagging: booking flow, sessions page, billable panel

*Codex edits:*
- [ ] Rewrite `src/components/clients/NewSessionModal.tsx`:
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
- [ ] Edit `src/app/dashboard/clients/[id]/sessions/page.tsx` — change:
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
  and change:
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
  and change the `Tile` `meta` prop:
  ```typescript
                meta={`${new Date(s.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} · ${s.duration} min${s.studentName ? ` · ${s.studentName}` : ''}`}
  ```
  to:
  ```typescript
                meta={`${new Date(s.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} · ${s.duration} min${s.studentName ? ` · ${s.studentName}` : ''}${s.subject ? ` · ${s.subject}` : ''}`}
  ```
- [ ] Edit `src/components/clients/BillableSessionsPanel.tsx` — change:
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
  and change:
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
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Manual smoke test: book a session for a student with 2+ tags, confirm the dropdown shows
  exactly those tags plus "Other…" (and no dropdown before a student is picked); select an existing
  tag, confirm it saves and displays in the session's meta line; book a second session for the same
  student choosing "Other…" with a brand-new value, confirm it saves AND gets appended to the
  student's tag list (check via Edit modal or SQL); book a session with no student, confirm no
  subject picker and no `· subject` in the meta line; if a completed uninvoiced session with a
  subject exists, confirm the Billable lessons panel also shows it.
- [x] Commit: `git add src/components/clients/NewSessionModal.tsx "src/app/dashboard/clients/[id]/sessions/page.tsx" src/components/clients/BillableSessionsPanel.tsx && git commit -m "feat: tutoring subject tagging — booking flow, sessions page, billable panel"`

---

## Acceptance checklist
- [x] C-1: `students.subjects` + `sessions.subject` migration applied and verified
- [x] C-2: student subject-tag CRUD/display shipped, build passes, manual smoke confirms
- [x] C-3: session booking flow + display shipped, build passes, manual smoke confirms full flow

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. No test runner in
this project — manual browser + SQL smoke required for C-2 and C-3.
