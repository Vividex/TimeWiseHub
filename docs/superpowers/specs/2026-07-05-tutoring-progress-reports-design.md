# Tutoring: Progress Reports to Parents (sixth deep-dive feature for the Tutoring workspace profile)

## Background

The app already has a working staff-facing progress notes feature: `progress_notes` (client-scoped,
append-only), a Notes page/tile per client, manual entry (`AddProgressNote`), and two "promote to
progress note" actions on a session's detail page (session notes, call-summary notes). None of it
is exposed to parents today, and none of it is aware of the Student entity introduced in an earlier
phase.

Rather than building a new "progress report" concept from scratch, this phase **appropriates the
existing progress_notes feature** by closing two real gaps: notes have no `student_id` (so a client
with two children gets both kids' notes mixed into one undifferentiated list), and there is no
"send to parent" capability or sent-state at all. The existing send infrastructure
(`/api/clients/[id]/messages` — sender-identity resolution, plan-gating, reply-to building,
`client_messages` insert) is reused, not duplicated.

## Scope for this phase

- `progress_notes` gains `student_id` (nullable FK to `students`) and `sent_to_parent_at` (nullable
  timestamptz).
- Notes created from a session (`SessionDetailClient`'s "Add to progress notes" for session notes
  and call-summary notes) auto-populate `student_id` from that session's own `student_id` when
  present.
- Manual notes (`AddProgressNote`) gain an optional student picker — shown only when the client has
  students — so hand-typed notes can be tagged too.
- The Notes page gains a student filter (defaults to "All students," only rendered when the client
  has students) and, per unsent note, a checkbox. Selecting one or more unsent notes and clicking
  "Send to parent" concatenates their bodies into one email, sends it via a small extension to the
  existing messages route, and marks every selected note's `sent_to_parent_at`. Already-sent notes
  show their sent date instead of a checkbox.
- `/api/clients/[id]/messages` gains one small addition: an optional `subject` field in the request
  body (falls back to the existing default `Message from ${senderName}` when omitted) — everything
  else about the route (sender identity, plan gating, reply-to, `client_messages` insert) is
  unchanged.
- The send-to-parent capability itself is **not gated to the tutoring profile** — "select some
  notes and email them to the client" is generally useful regardless of industry, matching how
  per-lesson billing was also left ungated. The *student filter* and *per-note student tag* are the
  only genuinely tutoring-specific pieces (naturally inert for clients with zero students).

## Out of scope (explicitly deferred)

- Any change to the existing session-notes/call-summary UI beyond passing `student_id` through —
  the "Add to progress notes" buttons behave exactly as before, just with better tagging.
- Retroactively tagging existing progress_notes with a student — they stay `student_id = null`
  (shown under "All students," sendable, just not filterable to one child). Confirmed acceptable;
  this app has no real customer data yet.
- A parent-facing portal/login to view reports themselves — explicitly declined in favor of email
  delivery through the already-built two-way messaging system.
- Any restriction on which existing notes can be batched into one send (e.g. requiring they're all
  for the same student) — if a mixed batch is selected, the email subject falls back to a generic
  "Progress update" rather than blocking the send.

## Architecture

### Schema (`supabase/schema-090-tutoring-progress-report-notes.sql`)

```sql
alter table public.progress_notes add column student_id uuid references public.students on delete set null;
alter table public.progress_notes add column sent_to_parent_at timestamptz;

create index progress_notes_student on public.progress_notes (student_id) where student_id is not null;
```

No RLS changes — the existing three policies (`org members view`, `org admins insert`, `creator
insert own`) already cover select/insert; `sent_to_parent_at`/`student_id` updates go through the
same `for select`/existing update path already used by `ProgressNotesList`'s edit action (no
separate UPDATE policy exists today for non-admins editing their own note's body — confirmed this
phase doesn't change that; the "mark sent" update happens as part of the same client-side call
already permitted).

### Session detail page threading (`SessionDetailClient.tsx`, `sessions/[sessionId]/page.tsx`)

The page's `sessions` select gains `student_id`; the `session` prop type gains `studentId: string |
null`; both `addSessionNotesToProgressNotes()` and `addCallSummaryToProgressNotes()`'s
`progress_notes` inserts gain `student_id: initial.studentId`.

### Manual notes (`AddProgressNote.tsx`)

Gains a `students: { id: string; name: string }[]` prop (passed from the Notes page, empty array
for non-tutoring/no-students clients). When non-empty, renders a student `<select>` above the
textarea (`— General note — ` as the empty/default option); the insert gains
`student_id: selectedStudentId || null`.

### Notes page (`src/app/dashboard/clients/[id]/notes/page.tsx`)

Fetches the client's `students` (`id, name`, non-archived) alongside the existing notes query,
which itself gains `student_id, sent_to_parent_at` in its `select(...)`. Passes `students` to both
`AddProgressNote` and `ProgressNotesList`.

### Notes list + send (`ProgressNotesList.tsx`)

New props: `students: { id: string; name: string }[]`, `clientId: string`. New local state:
`studentFilter` (student id or `''` for all), `selectedNoteIds: Set<string>`, `sending: boolean`,
`sendError: string`.

- A student filter `<select>` renders above the list when `students.length > 0` (`— All students
  —` plus one option per student); filters the rendered notes by `note.student_id === studentFilter`
  when set, otherwise shows everything.
- Each note row gains: if `sent_to_parent_at` is set, a small `Sent to parent on {date}` label; if
  not, a checkbox bound to `selectedNoteIds`.
- A "Send N selected to parent" button (disabled when `selectedNoteIds.size === 0` or `sending`)
  appears above the list. On click:
  1. Build the email body: join the selected notes' `body` fields with a blank line between each
     (already-newest-first order, matching the list's own sort).
  2. Resolve the subject: if every selected note shares the same non-null `student_id`, use
     `Progress update for ${studentName}`; otherwise `Progress update`.
  3. `POST /api/clients/${clientId}/messages` with `{ body, subject, noteIds: [...selectedNoteIds] }`.
  4. On success, clear the selection, `router.refresh()` (the route itself marks the notes sent —
     see below, not a separate client-side update).
  5. On failure, show `sendError`, leave the selection intact so the tutor can retry without
     re-selecting.

**Why marking-sent happens server-side, not via a client-side `progress_notes` update:** the
existing `schema-042` RLS only allows a note's own creator, or an org admin/manager, to `UPDATE` it
— but this phase's decision is that *any* org member can send a progress report, including one
built from a colleague's note. A direct client-side `supabase.from('progress_notes').update(...)`
would silently fail (RLS-blocked) for a non-admin sending someone else's note, even though the
email itself sent fine (that part isn't RLS-gated — it goes through the service-role route below).
Routing the "mark sent" write through the same authenticated server route that already sends the
email — using its service-role client, scoped by `client_id` — sidesteps the mismatch entirely and
keeps "who can send" and "who can mark sent" the same permission, matching the org-member-wide
scope this phase intends.

### API route extension (`src/app/api/clients/[id]/messages/route.ts`)

The `POST` handler's destructure gains two optional fields:
```typescript
const { body, subject, noteIds } = await req.json() as { body?: string; subject?: string; noteIds?: string[] }
```
The existing `const subject = \`Message from ${senderName}\`` line is renamed to `emailSubject`
(`subject?.trim() || \`Message from ${senderName}\``) to avoid shadowing the destructured `subject`,
and used everywhere the old `subject` local was used (the `sendEmail` call's `subject` field). No
other existing behavior changes — plan-gating, sender-identity resolution, reply-to address, and
the `client_messages` insert (still storing just `body`) are unchanged.

After the existing `client_messages` insert succeeds, if `noteIds` is a non-empty array:
```typescript
if (noteIds && noteIds.length > 0) {
  await service.from('progress_notes')
    .update({ sent_to_parent_at: new Date().toISOString() })
    .eq('client_id', client.id)
    .in('id', noteIds)
}
```
The `.eq('client_id', client.id)` guard prevents marking notes belonging to a different client (the
route's existing access check already established the caller may act on *this* client; scoping the
update the same way is a one-line defense against a caller passing unrelated IDs, at negligible
cost).

## Verification

No test runner in this project — verification is `pnpm run build` plus manual testing:
1. SQL check post-migration: `progress_notes.student_id` (nullable, FK to students) and
   `sent_to_parent_at` (nullable timestamptz) exist; existing rows have both `null`.
2. On a session with a student set, use "Add to progress notes" — confirm the resulting note (SQL
   check) has the correct `student_id`.
3. On the Notes page for that client, confirm the student filter appears, filtering to that student
   shows the note, filtering to a different student hides it, "All students" shows everything.
4. Add a manual note with no student selected ("General note") — confirm it shows under "All" but
   not under any specific student filter.
5. Select 2 unsent notes for the same student, click "Send to parent" — confirm the client receives
   one email with both bodies concatenated and the subject "Progress update for {name}"; confirm
   both notes now show "Sent to parent on {date}" instead of a checkbox, and are no longer
   selectable.
6. Select notes for two different students in one batch, send, confirm the subject falls back to
   the generic "Progress update" (not blocked).
7. Confirm the client's own message thread (`/dashboard/clients/[id]/messages`) shows the sent
   progress-report email like any other outbound message.
8. Confirm a regular (non-progress-report) client message sent via the existing message-composer
   UI still works unchanged, with the original default subject line.
