# Tutoring: Year Group / Subject / Topic Structure (fourth deep-dive feature for the Tutoring workspace profile)

## Background

The subject-tagging phase just shipped (free-text `students.subjects` / `sessions.subject`) solved
persistence but not reuse-without-retyping in the way the user actually wanted, and separately the
user raised a bigger idea modeled on IXL: a year-group → subject → topic hierarchy, with course
material uploads per topic, built on a comprehensive K-12 Australian curriculum library.

That last part — sourcing real curriculum content for every year level and subject — is a content
curation project, not a coding task (no ACARA API exists; it would mean manually entering
curriculum text for every year/subject combination). Flagged directly; the user chose to scope this
phase to the **structure only**: fixed year groups, a seeded-but-extensible subject list, and
tutor-created topics — no pre-loaded curriculum content. File upload per topic is also out of scope
this phase (a separate subsystem, doesn't block the structure being useful) — its own future phase.

This phase **replaces** the just-shipped free-text tags entirely (confirmed explicitly) rather than
running both models side by side.

## Scope for this phase

- **Year groups**: a fixed, non-customizable list in code (`Foundation` through `Year 12`, ACARA's
  standard terms) — never stored as a table, since nothing about it varies per org or changes over
  time.
- **Subjects** (`subjects` table): seeded with 8 common learning areas the first time a tutoring
  org/solo-pro needs them (lazy seed, not a wizard step). Tutors can add more anytime — the seed
  list is a starting point, not a ceiling.
- **Topics** (`topics` table): scoped to a specific `(subject_id, year_group)` pair. Starts
  completely empty — no seed content. Created ad hoc by any tutor while booking a session, and once
  created is shared org-wide for that subject+year-group, available to any student.
- **Sessions**: `year_group` (text), `subject_id` (FK), `topic_id` (FK) replace the single
  `sessions.subject` text column from the prior phase. All three independently optional, matching
  how `student_id` already works — a session can have none, some, or all three set.
- **Students no longer carry their own subject list at all.** Since subjects/topics are now
  shared, org-wide structured data (not a personal tag list), the Students page instead **derives**
  a display (e.g. "Year 8 Maths, Year 5 English") from that student's own most recent sessions per
  subject — computed at read time, not stored.
- Booking a session pre-fills Year group + Subject from that student's own most recently booked
  session (convenience default, not a hard constraint — can always be changed).

## Out of scope (explicitly deferred)

- **Course material / file uploads per topic** — a separate subsystem (storage, file-handling),
  doesn't block the structure being useful on its own. Future phase once the structure is in real
  use.
- **A comprehensive Australian curriculum content library** — a content-sourcing project, not
  something buildable in a code phase. What ships here is empty structure (seeded year groups +
  common subject names only); topics and any real curriculum content are entirely tutor-populated
  going forward.
- **Restricting who can add subjects/topics** — any org member can add either while booking a
  session (mirrors the existing `sessions` table's own "creator can manage their own" + "org admins
  manage everything" + "org members can view everything" RLS shape) — not admin-gated.
- **Retroactively mapping old free-text subject data** — sessions/students that already carried a
  free-text subject (e.g. "year 5", "Trial topic" from the just-shipped phase) cannot be reliably
  mapped into the new structured subject/topic FKs. This data is dropped on migration. Confirmed
  acceptable given it's still test data, not real customer data — flagged plainly regardless since
  it is a real, if small, data loss.

## Architecture

### Constants (`src/lib/tutoring/constants.ts`, new)

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

### Schema (`supabase/schema-087-tutoring-year-subject-topic.sql`)

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

A solo Pro's own subjects/topics have `org_id = null`; the "Creator can manage own" policy alone
gives them full CRUD forever, matching how solo Pro data works elsewhere in this app (e.g.
`clients.owner_id`). An org's subjects/topics are visible to every org member (select policy),
manageable in full by owner/admin, and manageable by whoever created them regardless of role
(mirrors the existing `sessions` table's exact "Creator can manage own sessions" pattern — a
regular tutor can add/edit their own subject/topic without needing admin rights).

### Seeding (`src/lib/tutoring/ensure-seed-subjects.ts`, new)

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

Called at the top of the sessions page's data loading (server-side, before fetching subjects for
the picker) — a plain count-then-seed check, not a wizard step or migration-time seed. This means
any org/solo-pro that's already in the tutoring profile gets seeded the first time they visit
Sessions after this ships; any org/solo-pro that switches to tutoring later gets seeded the first
time *they* visit Sessions too — one code path handles both cases, nothing needs to hook into the
`/setup` wizard or Settings' industry switch.

### Booking flow (`src/components/clients/NewSessionModal.tsx`, full rewrite)

New props: `subjects: { id: string; name: string }[]` (org-scoped, non-archived, passed from the
sessions page). `students` prop simplifies back to `{ id: string; name: string }[]` (no more
`subjects` field — students no longer carry their own list).

New state: `yearGroup` (from `YEAR_GROUPS`, defaults `''`), `subjectChoice` (existing subject id, or
the sentinel `'__new_subject__'`, or `''`), `newSubjectName`, `topicChoice` (existing topic id, the
sentinel `'__new_topic__'`, or `''`), `newTopicName`.

When `studentId` changes, fetch that student's single most recent session
(`.from('sessions').select('year_group, subject_id').eq('student_id', studentId).order('scheduled_at', { ascending: false }).limit(1)`)
and prefill `yearGroup`/`subjectChoice` if found (pure convenience default — user can change either
freely afterward).

Topic options are fetched client-side (`useEffect` keyed on `[subjectChoice, yearGroup]`) via
`.from('topics').select('id, name').eq('subject_id', subjectChoice).eq('year_group', yearGroup).eq('archived', false).order('name')`
— **only** when `subjectChoice` is a real existing subject id (not the "add new" sentinel) and
`yearGroup` is set. If the subject itself is being newly created this same submit, there cannot be
any existing topics for it yet, so the topic field becomes a plain free-text input in that case
(no dropdown, no "existing topics" to show).

On submit, resolve in order (each step only runs if needed):
1. If `subjectChoice === '__new_subject__'` and `newSubjectName.trim()`: insert a new `subjects` row
   (`org_id: orgId, created_by: user.id, name: newSubjectName.trim()`), use its returned `id` as
   `resolvedSubjectId`. Otherwise `resolvedSubjectId = subjectChoice || null`.
2. If a topic name was typed (either because `topicChoice === '__new_topic__'` and `newTopicName`
   was entered, or because the subject itself was just newly created so the topic field was a
   plain text input) and `resolvedSubjectId` and `yearGroup` are both set: insert a new `topics` row
   (`subject_id: resolvedSubjectId, year_group: yearGroup, created_by: user.id, name: <typed value>`),
   use its `id` as `resolvedTopicId`. Otherwise `resolvedTopicId = topicChoice || null` (only valid
   when `topicChoice` is a real existing id, never the sentinel with no typed name).
3. Insert the session with `year_group: yearGroup || null, subject_id: resolvedSubjectId,
   topic_id: resolvedTopicId` in place of the old single `subject` field.

Recurring sessions: same as the prior phase's decision — `year_group`/`subjectId`/`topicId` are
still passed in the `/api/clients/[id]/sessions/series` request body for consistency, but that
route does not persist them (confirmed unmodified, matching the existing unused `studentId` passthrough).

### Sessions page (`src/app/dashboard/clients/[id]/sessions/page.tsx`)

Calls `ensureSeedSubjects(supabase, user.id, orgId)` once, before fetching subjects. Fetches
`subjects` (`.eq('archived', false)`, scoped the same way as the seeding check: `org_id` match if
org, else `created_by` match) for the `NewSessionModal` prop. `students` query drops `subjects`
from its select entirely (back to `id, name`). Main `sessions` query and `billableSessions` query
both select `year_group, subject_id, topic_id, subjects(name), topics(name)` in place of `subject`.
Per this codebase's standing Supabase FK-join gotcha (CLAUDE.md: single-valued joins infer as
arrays in TS), both `s.subjects` and `s.topics` need the `as unknown as { name: string } | null`
intermediate cast, not a direct `as { name: string }`. `items`/`billableItems` mappings resolve a
single display string, e.g.
`[s.year_group, (s.subjects as unknown as {name:string}|null)?.name, (s.topics as unknown as {name:string}|null)?.name].filter(Boolean).join(' · ')`,
and the `Tile` `meta`/`BillableSessionsPanel` title line append that string instead of the old
`s.subject` append (same conditional-append style: empty string when nothing is set).

### Students page (`src/app/dashboard/clients/[id]/students/page.tsx`)

Query changes: drop `subjects` from the `students` select entirely (back to `id, name, notes`).
Add a second query: `.from('sessions').select('student_id, subject_id, year_group, scheduled_at, subjects(name)').in('student_id', <student ids>).not('subject_id', 'is', null).order('scheduled_at', { ascending: false })`.
Reduce in JS to one entry per `(student_id, subject_id)` pair, keeping only the first (most recent,
since already ordered) occurrence — small in-memory dedup, no Postgres `distinct on`/view needed
given realistic session volumes per client. Render as pills per student:
`{year_group} {subjectName}` (e.g. "Year 8 Maths"), same pill styling as the prior phase, empty
when a student has no subject-tagged sessions yet.

### Student CRUD (`StudentForm.tsx`, `EditStudentModal.tsx`, `EditStudentButton.tsx`, `/api/students/[id]/route.ts`)

All four revert to their pre-subject-tagging shape: just `name` and `notes`, no subject field of any
kind. This fully undoes the prior phase's CRUD changes to these four files (not a partial rollback —
the subject concept has moved entirely to the session level).

## Verification

No test runner in this project — verification is `pnpm run build` plus manual testing:
1. SQL check post-migration: `subjects`/`topics` tables exist with the RLS policies above;
   `sessions.subject` is gone, `sessions.year_group`/`subject_id`/`topic_id` exist (nullable);
   `students.subjects` is gone.
2. Visit the Sessions page for a tutoring client for the first time after this ships — confirm the
   default 8 subjects appear in the picker (seeded automatically, no manual step).
3. Book a session: pick a year group, an existing subject, confirm the topic dropdown is empty
   (nothing seeded); type a new topic, submit, confirm the session shows "Year X · Subject ·
   Topic" in its tile.
4. Book a second session for the same student: confirm year group + subject are pre-filled from the
   first session; confirm the just-created topic now appears as a pickable option in the topic
   dropdown (shared org-wide).
5. Book a session choosing "add new subject", type a brand-new name and a brand-new topic in the
   same submit: confirm both are created and the session references them correctly.
6. Visit the Students page: confirm each student with subject-tagged sessions shows a derived pill
   (e.g. "Year 8 Maths"); a student with no subject-tagged sessions shows no pills.
7. Confirm the Add/Edit Student forms no longer show any subject field at all.
8. Confirm a second org member (non-admin) can also add a new subject/topic while booking, not just
   the org owner/admin.
