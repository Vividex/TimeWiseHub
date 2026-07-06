# Collaborative Worksheet Annotation

## Origin

Raised directly from the video-call PiP work: a prospective tutoring customer (currently on
Google Meet, not yet a TimeWiseHub user — see memory `project-video-pip-tutor-prospect`) uses a
whiteboard tool with young clients. The user asked whether TimeWiseHub could let a tutor and
student **collaboratively annotate a fixed-layout worksheet at the same time** during a video
call — student typing/writing answers, tutor marking/circling/noting on the same page live —
reusing the existing tutor-uploaded worksheet library (`topic_assets`) rather than a separate
authoring system.

## Confirmed requirements

- Worksheets are **fixed-layout documents** (PDF or scanned image), not reflowable text — editing
  means placing objects on top of a fixed page, not word-processing.
- Must work **both live during a video call and asynchronously afterward** (student completes it
  alone, tutor marks it later without a live call) — state must persist in the database, not just
  live-sync over an ephemeral channel.
- Reuses worksheets already uploaded under Topics/Subjects (`topic_assets` where
  `asset_type in ('pdf', 'image')` — docx/xlsx/link/note asset types are out of scope, they aren't
  fixed-layout pages).
- Objects placed on the page: **typed text** (answers), **freehand strokes** (writing/circling/
  marking), and **stickers** — both a fixed curated set (star, check, cross, smiley, etc.) and ad
  hoc uploaded images.
- Real-time feel matters — both people should see each other's changes appear live, not on a
  refresh.

## Research summary (informs the architecture below)

- No existing open-source PDF annotation tool (react-pdf-highlighter, pdf-annotate.js) ships
  multi-user collaboration — it would be built regardless of library choice.
- A CRDT (Yjs etc.) is unnecessary here: that machinery solves concurrent *character-level* text
  merge conflicts, which doesn't apply to discrete, independently-owned objects like a specific
  answer box or a specific sticker. Plain database rows are a normal, sufficient architecture for
  this shape of problem (corroborated by how Figma models shape properties).
- Supabase's own guidance is explicit that `postgres_changes` (used by this codebase's existing
  chat feature) is too slow/DB-heavy for high-frequency events like in-progress pen strokes —
  Supabase **Broadcast** is the documented fit for that instead.
- `react-pdf`/`pdfjs-dist` is the standard client-side PDF renderer for React; requires a
  client-only import and a version-matched web worker (a known, solvable Next.js App Router
  gotcha). `perfect-freehand` is a small, focused library for turning pointer input into
  pressure-sensitive stroke shapes, lighter than a full canvas framework like Fabric.js/Konva.

## Data model

New table `worksheet_annotations`:

- `id` uuid pk
- `topic_asset_id` uuid references `topic_assets` — the worksheet file
- `student_id` uuid references `students` — whose attempt this is (required; scopes annotations
  per student so siblings sharing a worksheet template never see each other's work)
- `org_id` uuid — matches the owning topic's org, for RLS
- `page_number` int — 1 for image-type assets, the PDF page index for pdf-type assets
- `object_type` enum: `'text_box' | 'stroke' | 'sticker'`
- `x`, `y`, `width`, `height` numeric — fractions of the page (0–1), not pixels, so position is
  resolution/zoom-independent
- `content` jsonb — shape depends on `object_type`:
  - `text_box`: `{ text: string }`
  - `stroke`: `{ points: [number, number][], color: string, strokeWidth: number }` (from
    `perfect-freehand`)
  - `sticker`: `{ kind: 'builtin', id: string }` for the curated set, or
    `{ kind: 'custom', storage_path: string }` for an ad hoc upload (new private storage bucket
    `worksheet-stickers`, same pattern as the existing `topic-assets` bucket)
- `created_by` uuid references `profiles`
- `created_at`, `updated_at` timestamptz

Objects render in `created_at` ascending order (later objects drawn on top) — no separate z-index
column; sufficient given objects are added incrementally during a session, not reordered.

## Real-time sync

One Supabase Realtime **Broadcast** channel per worksheet attempt, named
`worksheet:{topicAssetId}:{studentId}`:

- While a live session is open, every add/move/stroke-in-progress/keystroke is broadcast instantly
  to the other participant and applied optimistically to local render state.
- Persistence to `worksheet_annotations` happens separately (debounced — on stroke completion, on
  text blur/pause, immediately for sticker placement), not per broadcast event.
- Opening a worksheet — live or async — always starts by loading existing rows for
  `(topic_asset_id, student_id)` from the table. If it's a live session, the client then also joins
  the Broadcast channel for anything the other participant does next.
- No `postgres_changes` subscription is used for this feature — Broadcast is the sole live-sync
  path; the table is read-on-open only, deliberately decoupled from live delivery.
- No CRDT, no conflict resolution beyond last-write-wins per object — acceptable given these are
  small, independently-owned objects, not shared mutable text.

## Access control

Reuses the existing guest-identity pattern from session chat (`can_post_chat()`,
`clients.guest_chat_user_id`) rather than inventing a new one. New security-definer function
`can_edit_worksheet(p_topic_asset_id uuid, p_student_id uuid)`:

- Returns true for any org member with access to that student's org (mirrors the existing
  `topics`/`subjects` "creator manages own, org members view/use all" shape).
- Returns true for the specific guest identity tied to the client who owns that student
  (`clients.guest_chat_user_id = auth.uid()`, checked directly — **not** via
  `organisation_members`, since a guest has zero org-membership rows by design). This is what lets
  a child, via the family's shared guest login, place objects during a live call.

`worksheet_annotations` RLS: SELECT and INSERT/UPDATE/DELETE both gated through
`can_edit_worksheet(topic_asset_id, student_id)`.

## UI integration

- **Live (in-call):** a new "Worksheet" tab in the existing `CallPanel` component (alongside the
  current Transcript/Program/Chat tabs, `src/components/video/CallRoom.tsx` /
  `CallPanel.tsx`), letting the tutor pick a `pdf`/`image` topic asset from the session's linked
  subject/topic and open it for both participants to annotate.
- **Async:** a new "Annotate" action on the existing `/dashboard/subjects` page, alongside the
  current open/download actions on each topic asset — prompts which student's attempt to view or
  start if the topic has sessions tagged to more than one student.
- Both entry points render the same annotation surface component and read/write the same table —
  there is exactly one annotation experience, not two.

## New dependencies

- `react-pdf` (PDF rendering) and `perfect-freehand` (stroke rendering) — both free/open-source,
  no ongoing cost, adds to client bundle size and maintenance surface. Flagged per this project's
  new-dependency rule; no further cost/approval needed beyond this note (confirmed free, no paid
  service involved).

## Non-goals (explicit)

- No live cursor/presence indicators (nice-to-have, not requested this phase).
- No per-character concurrent merge within a single text box — last-write-wins is accepted.
- No offline support.
- No annotation support for `docx`/`xlsx`/`link`/`note` topic asset types — fixed-layout
  (`pdf`/`image`) only.
- No change to the existing read-only "open in new tab" behavior for non-annotation contexts
  (e.g., sharing a worksheet to session chat) — this is a new, additional capability, not a
  replacement of the existing topic-asset viewing flow.

## Verification

- `pnpm run build` must pass clean (this project's only gate — no test runner).
- Manual smoke, live: two browser sessions (tutor + a guest/second account) open the same worksheet
  from a live call's Worksheet tab; confirm a text box typed in one appears live in the other,
  confirm a freehand stroke appears live, confirm a sticker (both a builtin and an uploaded custom
  one) placed in one appears in the other; leave the call and reopen via `/dashboard/subjects`'s
  Annotate action and confirm everything persisted.
- Manual smoke, async-only: a student's attempt is annotated entirely outside a call (no live
  session ever opened) and still persists/reopens correctly.
- Confirm a second child in the same family (different `student_id`, same `topic_asset_id`) sees a
  blank worksheet, not the sibling's annotations.
- Confirm the guest identity can add/edit objects without any `organisation_members` row existing
  for it.
