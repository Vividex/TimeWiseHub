# Tutoring Year Group / Subject / Topic Structure

## Goal
Replace the just-shipped free-text subject tags with a structured year-group → subject → topic
hierarchy: fixed year groups, a seeded-but-extensible org-wide subject list, and topics scoped per
subject+year-group that any tutor can create on the fly while booking a session. Fourth deep-dive
feature for the Tutoring workspace profile.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-05-tutoring-year-subject-topic-design.md`
- Source plan: `docs/superpowers/plans/2026-07-05-tutoring-year-subject-topic.md`
- This is a **replace**, not an addition — the prior phase's `students.subjects`/`sessions.subject`
  are dropped, not kept alongside. Confirmed acceptable data loss (still test data).
- Year groups are a fixed code constant (`Foundation`–`Year 12`), never a DB table — nothing about
  it varies per org or changes over time.
- `subjects` (new table): seeded with 8 common learning areas the first time a tutoring org/solo-pro
  needs them (lazy seed on first Sessions page visit, no wizard/migration-time hook). Tutors can add
  more anytime.
- `topics` (new table): scoped to a specific `(subject_id, year_group)` pair, starts empty, created
  ad hoc while booking, shared org-wide once created.
- Any org member (not just owner/admin) can create a subject/topic — mirrors the existing `sessions`
  table's own "Creator can manage own sessions" RLS pattern exactly.
- Students no longer carry their own subject list — the Students page instead derives a display
  (e.g. "Year 8 Maths") from that student's own most recent sessions per subject.
- Course material/file uploads per topic and a real Australian curriculum content library are BOTH
  explicitly out of scope — the first is a separate future phase, the second is a content-sourcing
  project (no ACARA API exists), not a coding task. Flagged directly to the user before starting.
- Recurring session series (`/api/clients/[id]/sessions/series`) is passed `yearGroup`/`subjectId`/
  `topicId` for consistency but does not persist them — same pre-existing gap as `studentId`.
- **Every task must leave the build green.** File groups that reference each other's changed shape
  are combined into one task rather than split across turns — this codebase's Supabase queries
  aren't strictly schema-typed, so a partial cutover can't be guaranteed to fail loudly rather than
  silently type-checking through with stale data.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1 is conductor-only (DB migration via Supabase MCP).
- C-3 is a large single turn (8 files) — deliberate, not a mistake. Do not split it further.

---

## C-1 — Database migration: subjects, topics, sessions/students columns

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-087-tutoring-year-subject-topic.sql`:
  ```sql
  create table public.subjects (
    id uuid primary key default gen_random_uuid(),
    org_id uuid references public.organisations on delete cascade,
    created_by uuid not null references public.profiles on delete cascade,
    name text not null,
    archived boolean not null default false,
    created_at timestamptz not null default now()
  );

  alter table public.subjects enable row level security;

  create policy "Org members can view subjects" on public.subjects for select
    using (org_id is not null and exists (
      select 1 from public.organisation_members om
      where om.org_id = subjects.org_id and om.user_id = auth.uid()
    ));

  create policy "Org admins can manage subjects" on public.subjects for all
    using (org_id is not null and exists (
      select 1 from public.organisation_members om
      where om.org_id = subjects.org_id and om.user_id = auth.uid() and om.role in ('owner','admin')
    ));

  create policy "Creator can manage own subjects" on public.subjects for all
    using (created_by = auth.uid());

  create table public.topics (
    id uuid primary key default gen_random_uuid(),
    subject_id uuid not null references public.subjects on delete cascade,
    year_group text not null,
    created_by uuid not null references public.profiles on delete cascade,
    name text not null,
    archived boolean not null default false,
    created_at timestamptz not null default now()
  );

  alter table public.topics enable row level security;

  create policy "Org members can view topics" on public.topics for select
    using (exists (
      select 1 from public.subjects s
      join public.organisation_members om on om.org_id = s.org_id
      where s.id = topics.subject_id and om.user_id = auth.uid()
    ));

  create policy "Org admins can manage topics" on public.topics for all
    using (exists (
      select 1 from public.subjects s
      join public.organisation_members om on om.org_id = s.org_id
      where s.id = topics.subject_id and om.user_id = auth.uid() and om.role in ('owner','admin')
    ));

  create policy "Creator can manage own topics" on public.topics for all
    using (created_by = auth.uid());

  create index topics_subject_year on public.topics (subject_id, year_group);

  alter table public.sessions drop column subject;
  alter table public.sessions add column year_group text;
  alter table public.sessions add column subject_id uuid references public.subjects on delete set null;
  alter table public.sessions add column topic_id uuid references public.topics on delete set null;

  alter table public.students drop column subjects;
  ```
- [x] Apply via Supabase MCP `apply_migration` (name: `tutoring_year_subject_topic`).
- [x] Verify via MCP `execute_sql`:
  ```sql
  select table_name from information_schema.tables where table_schema = 'public' and table_name in ('subjects', 'topics');
  ```
  Expected: 2 rows.
  ```sql
  select policyname from pg_policies where schemaname = 'public' and tablename in ('subjects', 'topics') order by tablename, policyname;
  ```
  Expected: 6 rows (3 per table).
  ```sql
  select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sessions' and column_name in ('subject', 'year_group', 'subject_id', 'topic_id');
  ```
  Expected: no `subject` row; `year_group` (text, nullable), `subject_id`/`topic_id` (uuid, nullable) present.
  ```sql
  select column_name from information_schema.columns where table_schema = 'public' and table_name = 'students' and column_name = 'subjects';
  ```
  Expected: 0 rows.
- [x] Commit: `git add supabase/schema-087-tutoring-year-subject-topic.sql && git commit -m "feat: tutoring year/subject/topic structure — database migration"`

---

## C-2 — Constants and seeding helper

*Codex edits:*
- [x] Write `src/lib/tutoring/constants.ts`:
  ```typescript
  export const YEAR_GROUPS = [
    'Foundation', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6',
    'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12',
  ] as const

  export const DEFAULT_SUBJECTS = [
    'English', 'Mathematics', 'Science', 'Humanities & Social Sciences',
    'Languages', 'The Arts', 'Health & Physical Education', 'Technologies',
  ] as const
  ```
- [x] Write `src/lib/tutoring/ensure-seed-subjects.ts`:
  ```typescript
  import { DEFAULT_SUBJECTS } from './constants'
  import type { createClient } from '@/lib/supabase-server'

  export async function ensureSeedSubjects(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    orgId: string | null
  ) {
    const scoped = orgId
      ? supabase.from('subjects').select('id').eq('org_id', orgId).limit(1)
      : supabase.from('subjects').select('id').is('org_id', null).eq('created_by', userId).limit(1)

    const { data: existing } = await scoped
    if (existing && existing.length > 0) return

    await supabase.from('subjects').insert(
      DEFAULT_SUBJECTS.map(name => ({ name, org_id: orgId, created_by: userId }))
    )
  }
  ```
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean (files not imported anywhere yet).
- [x] Commit: `git add src/lib/tutoring/constants.ts src/lib/tutoring/ensure-seed-subjects.ts && git commit -m "feat: tutoring year/subject/topic structure — constants and seeding helper"`

---

## C-3 — Booking flow, sessions page, billable panel, student CRUD revert, students page

*Codex edits (all 8 files in one turn — deliberate, keeps the build green):*

- [ ] Rewrite `src/components/clients/NewSessionModal.tsx`:
  ```typescript
  'use client'

  import { useState, useEffect } from 'react'
  import { useRouter } from 'next/navigation'
  import { createClient } from '@/lib/supabase-browser'
  import { YEAR_GROUPS } from '@/lib/tutoring/constants'

  type Template = { id: string; title: string; position: number }
  type Repeat = 'none' | 'weekly' | 'fortnightly' | 'monthly'
  type StudentOption = { id: string; name: string }
  type SubjectOption = { id: string; name: string }
  type TopicOption = { id: string; name: string }

  const NEW_SUBJECT = '__new_subject__'
  const NEW_TOPIC = '__new_topic__'

  export default function NewSessionModal({
    clientId,
    orgId,
    clientLabel,
    students,
    subjects,
  }: {
    clientId: string
    orgId: string | null
    clientLabel: { singular: string; plural: string }
    students: StudentOption[]
    subjects: SubjectOption[]
  }) {
    const router = useRouter()
    const supabase = createClient()
    const [open, setOpen] = useState(false)
    const [title, setTitle] = useState('')
    const [studentId, setStudentId] = useState('')
    const [yearGroup, setYearGroup] = useState('')
    const [subjectChoice, setSubjectChoice] = useState('')
    const [newSubjectName, setNewSubjectName] = useState('')
    const [topicChoice, setTopicChoice] = useState('')
    const [newTopicName, setNewTopicName] = useState('')
    const [topicOptions, setTopicOptions] = useState<TopicOption[]>([])
    const [scheduledAt, setScheduledAt] = useState('')
    const [duration, setDuration] = useState(60)
    const [repeat, setRepeat] = useState<Repeat>('none')
    const [templates, setTemplates] = useState<Template[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const isNewSubject = subjectChoice === NEW_SUBJECT

    useEffect(() => {
      setYearGroup('')
      setSubjectChoice('')
      setNewSubjectName('')
      setTopicChoice('')
      setNewTopicName('')
      if (!studentId) return
      supabase
        .from('sessions')
        .select('year_group, subject_id')
        .eq('student_id', studentId)
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .then(({ data }) => {
          const last = data?.[0]
          if (last?.year_group) setYearGroup(last.year_group as string)
          if (last?.subject_id) setSubjectChoice(last.subject_id as string)
        })
    }, [studentId])

    useEffect(() => {
      setTopicChoice('')
      setNewTopicName('')
      if (!subjectChoice || isNewSubject || !yearGroup) { setTopicOptions([]); return }
      supabase
        .from('topics')
        .select('id, name')
        .eq('subject_id', subjectChoice)
        .eq('year_group', yearGroup)
        .eq('archived', false)
        .order('name')
        .then(({ data }) => setTopicOptions(data ?? []))
    }, [subjectChoice, yearGroup, isNewSubject])

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

      let resolvedSubjectId: string | null = subjectChoice && !isNewSubject ? subjectChoice : null
      if (isNewSubject && newSubjectName.trim()) {
        const { data: newSubject, error: subjErr } = await supabase
          .from('subjects')
          .insert({ org_id: orgId, created_by: user.id, name: newSubjectName.trim() })
          .select('id')
          .single()
        if (subjErr || !newSubject) {
          setError(subjErr?.message ?? 'Failed to create subject.')
          setSaving(false)
          return
        }
        resolvedSubjectId = newSubject.id
      }

      let resolvedTopicId: string | null = topicChoice && topicChoice !== NEW_TOPIC ? topicChoice : null
      const topicNameToCreate = isNewSubject ? newTopicName.trim() : (topicChoice === NEW_TOPIC ? newTopicName.trim() : '')
      if (topicNameToCreate && resolvedSubjectId && yearGroup) {
        const { data: newTopic, error: topicErr } = await supabase
          .from('topics')
          .insert({ subject_id: resolvedSubjectId, year_group: yearGroup, created_by: user.id, name: topicNameToCreate })
          .select('id')
          .single()
        if (topicErr || !newTopic) {
          setError(topicErr?.message ?? 'Failed to create topic.')
          setSaving(false)
          return
        }
        resolvedTopicId = newTopic.id
      }

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
            yearGroup: yearGroup || null,
            subjectId: resolvedSubjectId,
            topicId: resolvedTopicId,
          }),
        })
        const json = await res.json()
        setSaving(false)
        if (!res.ok) { setError(json.error ?? 'Failed to create recurring session.'); return }
        router.push(`/dashboard/clients/${clientId}/sessions/${json.firstSessionId}`)
        return
      }

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
          year_group: yearGroup || null,
          subject_id: resolvedSubjectId,
          topic_id: resolvedTopicId,
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
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Year group</label>
              <select
                value={yearGroup}
                onChange={e => setYearGroup(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
              >
                <option value="">— None —</option>
                {YEAR_GROUPS.map(yg => <option key={yg} value={yg}>{yg}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Subject</label>
              <select
                value={subjectChoice}
                onChange={e => setSubjectChoice(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
              >
                <option value="">— None —</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value={NEW_SUBJECT}>+ Add new subject…</option>
              </select>
              {isNewSubject && (
                <input
                  value={newSubjectName}
                  onChange={e => setNewSubjectName(e.target.value)}
                  placeholder="e.g. Music"
                  className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                />
              )}
            </div>
            {subjectChoice && (
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Topic</label>
                {isNewSubject ? (
                  <input
                    value={newTopicName}
                    onChange={e => setNewTopicName(e.target.value)}
                    placeholder="e.g. Algebra"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                  />
                ) : (
                  <>
                    <select
                      value={topicChoice}
                      onChange={e => setTopicChoice(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="">— None —</option>
                      {topicOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      <option value={NEW_TOPIC}>+ Add new topic…</option>
                    </select>
                    {topicChoice === NEW_TOPIC && (
                      <input
                        value={newTopicName}
                        onChange={e => setNewTopicName(e.target.value)}
                        placeholder="e.g. Algebra"
                        className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                      />
                    )}
                  </>
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

- [ ] Rewrite `src/app/dashboard/clients/[id]/sessions/page.tsx`:
  ```typescript
  // src/app/dashboard/clients/[id]/sessions/page.tsx
  import { redirect, notFound } from 'next/navigation'
  import Link from 'next/link'
  import { createClient } from '@/lib/supabase-server'
  import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
  import { Tile, TileGrid } from '@/components/ui/Tile'
  import NewSessionModal from '@/components/clients/NewSessionModal'
  import BillableSessionsPanel from '@/components/clients/BillableSessionsPanel'
  import { ensureSeedSubjects } from '@/lib/tutoring/ensure-seed-subjects'

  const STATUS_TONE: Record<string, 'blue' | 'amber' | 'green'> = {
    scheduled: 'blue', in_progress: 'amber', completed: 'green',
  }
  const STATUS_LABEL: Record<string, string> = {
    scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed',
  }

  function sessionLabel(yearGroup: string | null, subjectName: string | null, topicName: string | null) {
    return [yearGroup, subjectName, topicName].filter(Boolean).join(' · ')
  }

  export default async function ClientSessionsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
    const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)

    const { data: membership } = await supabase
      .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
    const orgId = membership?.org_id ?? null

    await ensureSeedSubjects(supabase, user.id, orgId)

    const { data: client } = await supabase.from('clients').select('id, name, default_rate, currency').eq('id', id).maybeSingle()
    if (!client) notFound()

    const subjectsQuery = orgId
      ? supabase.from('subjects').select('id, name').eq('org_id', orgId).eq('archived', false).order('name')
      : supabase.from('subjects').select('id, name').is('org_id', null).eq('created_by', user.id).eq('archived', false).order('name')
    const { data: subjects } = await subjectsQuery

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, title, scheduled_at, duration_minutes, status, student_id, year_group, subject_id, topic_id, students(name), subjects(name), topics(name), session_todos(id, completed)')
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
      .select('id, title, scheduled_at, duration_minutes, year_group, subjects(name), topics(name), students(name)')
      .eq('client_id', id)
      .eq('status', 'completed')
      .is('invoice_id', null)
      .order('scheduled_at', { ascending: true })

    const billableItems = (billableSessions ?? []).map(s => {
      const student = (s.students as unknown as { name: string } | null)
      const subject = (s.subjects as unknown as { name: string } | null)
      const topic = (s.topics as unknown as { name: string } | null)
      return {
        id: s.id,
        title: s.title as string,
        scheduled_at: s.scheduled_at as string,
        duration_minutes: s.duration_minutes as number,
        studentName: student?.name ?? null,
        subjectLabel: sessionLabel(s.year_group as string | null, subject?.name ?? null, topic?.name ?? null),
      }
    })

    const items = (sessions ?? []).map(s => {
      const todos = (s.session_todos as { completed: boolean }[]) ?? []
      const student = (s.students as unknown as { name: string } | null)
      const subject = (s.subjects as unknown as { name: string } | null)
      const topic = (s.topics as unknown as { name: string } | null)
      return {
        id: s.id,
        title: s.title as string,
        scheduled_at: s.scheduled_at as string,
        duration: s.duration_minutes as number,
        status: s.status as string,
        studentName: student?.name ?? null,
        subjectLabel: sessionLabel(s.year_group as string | null, subject?.name ?? null, topic?.name ?? null),
        done: todos.filter(t => t.completed).length,
        total: todos.length,
      }
    })

    return (
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Sessions</h1>
            <NewSessionModal clientId={id} orgId={orgId} clientLabel={terminology.client} students={students ?? []} subjects={subjects ?? []} />
          </div>

          <BillableSessionsPanel
            clientId={id}
            orgId={orgId}
            defaultRate={client.default_rate ?? 0}
            currency={client.currency}
            sessions={billableItems}
          />

          <TileGrid empty="No sessions yet.">
            {items.map(s => (
              <Tile
                key={s.id}
                title={s.title}
                meta={`${new Date(s.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} · ${s.duration} min${s.studentName ? ` · ${s.studentName}` : ''}${s.subjectLabel ? ` · ${s.subjectLabel}` : ''}`}
                badge={{ label: STATUS_LABEL[s.status], tone: STATUS_TONE[s.status] }}
                progress={s.total > 0 ? { done: s.done, total: s.total } : undefined}
                href={`/dashboard/clients/${id}/sessions/${s.id}`}
              />
            ))}
          </TileGrid>
        </div>
      </div>
    )
  }
  ```

- [ ] Edit `src/components/clients/BillableSessionsPanel.tsx` — change:
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
  to:
  ```typescript
  type BillableSession = {
    id: string
    title: string
    scheduled_at: string
    duration_minutes: number
    studentName: string | null
    subjectLabel: string
  }
  ```
  and change:
  ```typescript
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {s.title}{s.studentName ? ` · ${s.studentName}` : ''}{s.subject ? ` · ${s.subject}` : ''}
                </p>
  ```
  to:
  ```typescript
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {s.title}{s.studentName ? ` · ${s.studentName}` : ''}{s.subjectLabel ? ` · ${s.subjectLabel}` : ''}
                </p>
  ```

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
        notes: notes || null,
      })

      if (insertError) {
        setError(insertError.message)
      } else {
        setOpen(false)
        setName(''); setNotes('')
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
    notes: string | null
  }

  export default function EditStudentModal({ student, onClose }: { student: Student; onClose: () => void }) {
    const router = useRouter()
    const [name, setName] = useState(student.name)
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
        body: JSON.stringify({ name, notes: notes || null }),
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
    subjects: string[]
    notes: string | null
  }
  ```
  to:
  ```typescript
  type Student = {
    id: string
    name: string
    notes: string | null
  }
  ```

- [ ] Edit `src/app/api/students/[id]/route.ts` — in `PATCH`, change:
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
  to:
  ```typescript
    const body = await req.json().catch(() => ({}))
    const { name, notes } = body as { name: string; notes?: string | null }
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const { error } = await supabase.from('students').update({
      name: name.trim(),
      notes: notes || null,
    }).eq('id', id)
  ```

- [ ] Rewrite `src/app/dashboard/clients/[id]/students/page.tsx`:
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
      .select('id, name, notes')
      .eq('client_id', id)
      .eq('archived', false)
      .order('name')

    const studentIds = (students ?? []).map(s => s.id)
    const subjectPills = new Map<string, string[]>()

    if (studentIds.length > 0) {
      const { data: taggedSessions } = await supabase
        .from('sessions')
        .select('student_id, subject_id, year_group, scheduled_at, subjects(name)')
        .in('student_id', studentIds)
        .not('subject_id', 'is', null)
        .order('scheduled_at', { ascending: false })

      const seen = new Set<string>()
      for (const s of taggedSessions ?? []) {
        const sid = s.student_id as string
        const subjectId = s.subject_id as string
        const key = `${sid}:${subjectId}`
        if (seen.has(key)) continue
        seen.add(key)
        const subject = (s.subjects as unknown as { name: string } | null)
        const label = [s.year_group as string | null, subject?.name ?? null].filter(Boolean).join(' ')
        if (!label) continue
        const existing = subjectPills.get(sid) ?? []
        subjectPills.set(sid, [...existing, label])
      }
    }

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
                      {(subjectPills.get(s.id) ?? []).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(subjectPills.get(s.id) ?? []).map(label => (
                            <span key={label} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-slate-800 dark:text-slate-400">
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
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

- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual smoke test: default 8 subjects appear in the picker on first visit; book a session
  picking a year group + existing subject + new topic, confirm the tile shows "Year X · Subject ·
  Topic"; book a second session for the same student, confirm year group/subject pre-fill and the
  new topic is now pickable; book a session choosing "+ Add new subject…" with a new topic in the
  same submit, confirm both are created correctly; Students page shows derived pills per student;
  Add/Edit Student forms show no subject field at all; a second non-admin org member can also add a
  new subject/topic while booking.
- [ ] Commit: `git add src/components/clients/NewSessionModal.tsx "src/app/dashboard/clients/[id]/sessions/page.tsx" src/components/clients/BillableSessionsPanel.tsx src/components/students/StudentForm.tsx src/components/students/EditStudentModal.tsx src/components/students/EditStudentButton.tsx "src/app/api/students/[id]/route.ts" "src/app/dashboard/clients/[id]/students/page.tsx" && git commit -m "feat: tutoring year/subject/topic structure — booking flow, sessions/students pages, student CRUD revert"`

---

## Acceptance checklist
- [ ] C-1: `subjects`/`topics` tables + `sessions`/`students` column changes applied and verified
- [ ] C-2: constants + seeding helper shipped, build passes
- [ ] C-3: booking flow + sessions/students pages + student CRUD revert shipped, build passes,
  manual smoke confirms full flow

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. No test runner in
this project — manual browser + SQL smoke required for C-3.
