# Tutoring: Student Entity (first deep-dive feature for the Tutoring workspace profile)

## Background

Research into real tutoring practice-management software (TutorCruncher, TutorBird, Teachworks,
My Music Staff — see agent research findings, 2026-07-05) confirmed that tutoring businesses model
the paying parent/guardian ("Client") and the learner ("Student") as **two separate, linked
entities** — not one entity with a relabeled term, which is what TimeWiseHub's current
Workspace-Profile terminology work (Phase 3) does. Confirmed by direct user knowledge: multiple
children per paying family booking lessons is common in this market, not an edge case — meaning
the current one-entity model would force a tutor to create duplicate parent-contact records per
child with no way to see a family's combined billing.

This is the first of several tutoring-specific deep-dive features (see also, deferred: lesson
packages/credits, subject tagging, progress reports to parents — each its own future
brainstorm/spec/plan cycle). Scoped narrowly per brainstorming (2026-07-05): only `students` +
`sessions` change in this pass. `progress_notes`, `client_messages`, `projects`, and invoicing all
stay exactly as they are, keyed to the client (parent) — revisited later once this foundation is
proven.

**Schema audit before starting:** confirmed via grep that 25 files reference `.from('clients')`
directly and 9 schema files have `client_id` foreign keys — this is why the pass is scoped to just
`sessions`, not every client-referencing table at once.

## Scope for this phase

- New `students` table, linked to `clients` (the client becomes explicitly "the paying parent").
- `sessions.student_id`, nullable, additive — every non-tutoring session (and every session
  created before this ships) keeps `student_id = null` and behaves identically to today.
  `sessions.client_id` stays `not null`, auto-derived from the chosen student's `client_id` — every
  existing consumer of `sessions.client_id` (billing, time entries) is unaffected.
- Student CRUD UI (`clients/[id]/students` page + form/modal components), mirroring the existing
  Client CRUD pattern exactly.
- A "Students" tile on the client detail page, shown **only** when the resolved profile's
  `key === 'tutoring'` — checked directly, not a new generic registry capability every profile
  gets, since this is genuinely tutoring-only functionality right now.
- `NewSessionModal` gains an optional student picker when the client has students.
- The client's sessions list page shows which student each session belongs to, so two siblings'
  lessons remain distinguishable in one shared list — without this, the whole feature loses most
  of its value.

## Out of scope (explicitly deferred)

- `progress_notes`, `client_messages`, `projects` staying keyed to `client_id`, not `student_id` —
  revisited in a later pass once this foundation is proven, not guessed at now.
- `client_session_templates` (the checklist-template feature already in `NewSessionModal`) stays
  per-client, not split per-student — reusable "this family's lesson checklist" is a reasonable
  simplification for now.
- Lesson packages/credits, subject tagging, progress reports to parents — each a separate future
  brainstorm/spec/plan cycle per the tutoring deep-dive decomposition.
- Any change to `clients`' own schema or RLS policies — untouched.
- Any change to non-tutoring profiles' behaviour — generic and personal-training sessions are
  unaffected; `student_id` stays null for them permanently unless a future phase deliberately
  extends this to another profile.

## Architecture

### Schema (`supabase/schema-084-tutoring-students.sql`)

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

RLS mirrors `clients`' exact three-policy shape (owner-manages-own, org-members-view,
org-admins-manage), joined through `client_id` to check the parent client's `owner_id`/`org_id` —
same pattern already used elsewhere in this codebase for tables scoped through a parent record
(e.g. `client_messages`).

### UI

**New: `src/app/dashboard/clients/[id]/students/page.tsx`** — server component, same shape as
`clients/[id]/sessions/page.tsx`: resolves the client, lists its students, renders an "add
student" form and a `TileGrid` of existing students.

**New: `src/components/students/StudentForm.tsx`, `EditStudentModal.tsx`, `EditStudentButton.tsx`,
`DeleteStudentButton.tsx`** — structurally identical to the existing `ClientForm.tsx`/
`EditClientModal.tsx`/`EditClientButton.tsx`/`DeleteClientButton.tsx`, fields reduced to
`name`/`subject`/`notes` (no email/phone/address/rate/currency — those stay on the client/parent).

**Modify: `src/app/dashboard/clients/[id]/page.tsx`** — after resolving
`getWorkspaceProfileForUser`, add a "Students" `Tile` to the existing `TileGrid`, rendered only
when `profile.key === 'tutoring'`.

**Modify: `src/app/dashboard/clients/[id]/sessions/page.tsx`** — fetch each session's
`student_id` and join the student's `name`; when present, show it in the `Tile`'s `meta` (e.g.
appended to the existing date/duration string) so sessions for different siblings are visually
distinguishable in the shared list. Also fetch the client's own `students` list (id, name) and pass
it to `NewSessionModal` as the new `students` prop (below) — this is the one place in the app that
needs both pieces of data together.

**Modify: `src/components/clients/NewSessionModal.tsx`** — gains an optional `students: { id:
string; name: string }[]` prop. When non-empty, renders a "Student" `<select>` above the existing
fields; selecting one sets `student_id` on insert. When empty (every non-tutoring client, and any
tutoring client with zero students created yet), the modal behaves exactly as it does today — no
picker shown, `student_id` stays null.

## Verification

No test runner in this project — verification is `pnpm run build` plus manual testing:
1. SQL check post-migration: `students` table exists with correct RLS, `sessions.student_id`
   exists, nullable, no default.
2. As the real account (currently `builder_construction`, non-tutoring): confirm the client detail
   page shows no "Students" tile, and `NewSessionModal` shows no student picker — zero visible
   change.
3. Temporarily switch to "Tutoring & Education" via Settings: create a client, add two students
   under them, create a session for each student from the sessions page, confirm the sessions list
   distinguishes which student each session belongs to. Switch back afterward, same discipline as
   every prior phase's manual testing.
