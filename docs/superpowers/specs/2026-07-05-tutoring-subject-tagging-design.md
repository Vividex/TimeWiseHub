# Tutoring: Subject Tagging (third deep-dive feature for the Tutoring workspace profile)

## Background

Students already carry a single free-text `subject` column (e.g. "Year 10 Maths"), set once when
the student is added. Two gaps surfaced when scoping this feature: a student who sees the same
tutor for more than one subject (e.g. Maths and English) can't represent that — the field only
holds one value — and individual sessions aren't tagged at all, so there's no record of which
subject a given lesson actually covered when a student has more than one.

The user confirmed both gaps matter ("Both") and chose the simplest data model available: free-text
tags per student, no shared/org-wide subject vocabulary. Booking a session should offer a dropdown
scoped to that student's existing tags, with a free-text fallback for one-off/improvised topics —
and typing a new one on a session should feed back into the student's tag list, keeping it
self-maintaining. Sessions stay fully optional on subject, matching the existing optional
`student_id` pattern.

## Scope for this phase

- `students.subject` (single `text`) is replaced by `students.subjects` (`text[]`), backfilled from
  existing values.
- `sessions.subject text` — new, nullable column. No relationship to `students.subjects` beyond the
  UI's dropdown-from-that-student's-list convenience; nothing enforces the session's subject is a
  member of the student's array.
- `NewSessionModal.tsx`: once a student is selected, a subject `<select>` appears with that
  student's tags as options, plus an "Other…" option that reveals a free-text input. Submitting
  with a new value both tags the session and appends the value to that student's `subjects` array
  (exact-string dedup — no case-normalization).
- `StudentForm.tsx` / `EditStudentModal.tsx`: the single subject text input becomes a tag list —
  existing pills with a remove (✕) control, plus an "add tag" input.
- `src/app/dashboard/clients/[id]/students/page.tsx`: subject display changes from one line of text
  to a row of pills.
- Sessions list/tile meta line (`src/app/dashboard/clients/[id]/sessions/page.tsx` and any other
  spot rendering the existing `studentName` append) gains `· {subject}` after the student name,
  using the same conditional-append pattern already in place for `studentName`.
- Always optional: a session can be created with no student, or with a student but no subject, same
  as today.

## Out of scope (explicitly deferred)

- Recurring session series (`/api/clients/[id]/sessions/series`) — this route does not wire
  `student_id` today (confirmed by reading it — no reference at all) and will not wire `subject`
  either. This is a pre-existing gap, not introduced or worsened by this feature; only single
  (non-repeating) sessions get a subject in this pass.
- Any subject-based filtering, search, or reporting UI (e.g. "show all Maths sessions this month")
  — that overlaps the separate, not-yet-designed "progress reports to parents" feature.
  Subject tagging here is data capture and display only.
- Org-wide/shared subject vocabulary (a `subjects` lookup table, autocomplete across students) —
  explicitly rejected in favor of free-text per-student tags; revisit only if inconsistent naming
  across students becomes a real reporting problem later.
- Case-insensitive or fuzzy dedup ("Maths" vs "maths") when appending a new tag — exact-string match
  only. Low-stakes given free-text tags were the chosen model; a tutor typing a near-duplicate just
  gets a second, slightly different-looking tag.

## Architecture

### Schema (`supabase/schema-086-tutoring-subjects.sql`)

```sql
alter table public.students add column subjects text[] not null default '{}';

update public.students
set subjects = array[subject]
where subject is not null and subject <> '';

alter table public.students drop column subject;

alter table public.sessions add column subject text;
```

### Student CRUD (`src/components/students/StudentForm.tsx`, `EditStudentModal.tsx`)

Both replace the single `subject` string state with a `subjects: string[]` state plus a
`newSubject` input string. Render existing tags as pills (label + ✕ button removing that entry from
the array), and an "add tag" text input + button appending a trimmed, non-empty, non-duplicate
value to the array. Insert/update payloads send `subjects` (array) instead of `subject`.

`src/app/api/students/[id]/route.ts` PATCH: accepts `subjects: string[]` in place of `subject`,
same `isOwner || isAdmin` authorization already in place — no change to the auth check.

`src/components/students/EditStudentButton.tsx` declares its own local `Student` type
(`{ id, name, subject: string | null, notes }`) passed through to `EditStudentModal` — this type's
`subject: string | null` field changes to `subjects: string[]` to match.

### Student list display (`src/app/dashboard/clients/[id]/students/page.tsx`)

Query changes `select('id, name, subject, notes')` to `select('id, name, subjects, notes')`. Render
changes from `{s.subject && <p>...}` to a flex-wrapped row of small pill spans, one per entry in
`s.subjects`, omitted entirely when the array is empty.

### Booking flow (`src/components/clients/NewSessionModal.tsx`)

New state: `subjectId` (holds either an existing tag string, the sentinel `'__other__'`, or `''`
for none) and `newSubject` (free-text, only rendered/used when `subjectId === '__other__'`). The
`students` prop type gains `subjects: string[]` per student (fetched by the sessions page).

Rendering: the subject `<select>` only appears when `studentId` is non-empty. Options are that
student's `subjects` array, plus a trailing `Other…` option. Selecting `Other…` reveals the
free-text input beneath it.

On submit, resolve the actual subject value:
```typescript
const resolvedSubject = subjectId === '__other__' ? newSubject.trim() || null
  : subjectId || null
```
Pass `resolvedSubject` as `subject` in both the plain-session insert and the recurring-series fetch
body (the series route itself is not modified per the "out of scope" note — it will silently ignore
an unrecognized field, consistent with how `studentId` is already passed to that endpoint today but
also not actually persisted).

If `subjectId === '__other__'` and `resolvedSubject` is a new, non-empty value not already present
in the selected student's `subjects`, issue a follow-up update after the session insert succeeds:
```typescript
await supabase
  .from('students')
  .update({ subjects: [...selectedStudent.subjects, resolvedSubject] })
  .eq('id', studentId)
```
This only runs for single (non-recurring) sessions, matching where `subject` is actually persisted.

### Sessions page (`src/app/dashboard/clients/[id]/sessions/page.tsx`)

The main sessions query and the billable-sessions query both add `subject` to their `select(...)`
lists. The `students` query (already fetched for the picker) adds `subjects` to its `select(...)`.
Both places currently building a `meta`/display string with `s.studentName ? \` · ${s.studentName}\`
: ''` gain an equivalent `s.subject ? \` · ${s.subject}\` : ''` appended after it.

## Verification

No test runner in this project — verification is `pnpm run build` plus manual testing:
1. SQL check post-migration: `students.subjects` exists as `text[]` with prior values correctly
   migrated into single-element arrays; `students.subject` column is gone; `sessions.subject`
   exists and is nullable.
2. Edit an existing student, confirm their migrated subject shows as one pill; add a second tag,
   remove one, confirm both persist correctly on reload.
3. Book a new session for a student with 2+ tags: confirm the dropdown lists exactly those tags
   plus "Other…", select an existing tag, confirm it saves and displays on the session.
4. Book a second session for the same student, choose "Other…", type a brand-new subject: confirm
   the session saves with that subject AND the student's tag list (checked via the edit modal or
   SQL) now includes it.
5. Confirm a session created with no student selected has no subject picker shown at all, and saves
   with `subject = null`.
6. Confirm the sessions list/tile meta line shows `· {subject}` correctly appended after the student
   name, and is simply omitted when no subject is set.
