# Program–Subjects Content Linking

## Origin

Raised mid-testing of the Collaborative Worksheet Annotation feature: TimeWiseHub has two
separate, parallel content systems — **Programs** (`programs`/`program_categories`/
`program_assets`, generic org-wide learning-plan content) and **Subjects/Topics**
(`subjects`/`topics`/`topic_assets`, tutoring-specific curriculum structure, the subject of the
worksheet-annotation work). The user found it genuinely confusing to work out how the two relate
— "even for me, which means it definitely will be for customers" — and specifically asked: when
adding content to a Program, can they also search and pull in Subjects content, rather than only
being able to upload a brand-new file.

## Confirmed requirements

- **Reference, not copy.** A Program shows the *same* underlying `topic_assets` file — no
  duplication, no separate storage. Confirmed directly: annotations must never modify or fork the
  original document (they already don't — `worksheet_annotations` is a fully separate table keyed
  by `(topic_asset_id, student_id)`, so referencing instead of copying keeps that model intact:
  one real file, one annotation set, regardless of which entry point (Program or Subjects) it's
  reached from.
- If the original Subjects file is deleted, the Program's reference to it should go with it
  (cascade), not remain as a dangling broken link.
- **Annotate-from-Program is in scope this pass**, not deferred — a referenced worksheet should be
  annotatable directly from a Program's in-call reference panel, not only from Subjects.
- One direction only: Programs can reference Subjects content. Subjects does not gain any
  reciprocal ability to reference/search Program content — not requested, not designed here.

## Data model

One new nullable column: `program_assets.linked_topic_asset_id uuid references
public.topic_assets(id) on delete cascade`.

When set:
- The program asset has no `storage_path`/`external_url`/`note_content` of its own — those fields
  stay null; the row exists purely to place a topic asset inside a program's category structure
  with its own `sort_order`.
- `name` and `asset_type` are copied from the topic asset at link time (mirrors how every other
  `program_assets` row already carries its own `name`/`asset_type`, so no rendering code needs to
  branch on "is this a reference" to know what icon/label to show).
- `ai_status` is set to `'skipped'` — AI summarisation (Programs Phase 2) only applies to assets
  with real file content in the `program-assets` bucket; a reference has none to summarise.

## Resolving the file (one shared helper, two existing call sites)

Both `/dashboard/programs/[id]/page.tsx` and the video call's `fetchLinkedProgram()` (in
`src/app/dashboard/video/[roomId]/page.tsx`) already independently attach a `signed_url` to each
asset via `createProgramAssetSignedUrl(asset.storage_path)` — today, always resolving the
program's own storage. A new shared function, `resolveProgramAssetSignedUrl(asset)`
(`src/lib/program-storage.ts`), replaces both call sites:

- If `linked_topic_asset_id` is set: look up that `topic_assets` row's `storage_path`, sign it via
  the existing `createTopicAssetSignedUrl` (`src/lib/tutoring/topic-storage.ts`).
- Otherwise: unchanged, signs the program asset's own `storage_path` via
  `createProgramAssetSignedUrl` exactly as today.

This is the only place that needs to know about the two different storage buckets — every other
piece of rendering code (`AssetCard.tsx`, `ProgramReferencePanel.tsx`) just consumes
`asset.signed_url` as it already does today, unchanged.

## Add-content flow

`AssetUploadZone.tsx` (the existing "Add content" modal, reached from `AssetGrid.tsx`) gains a
4th tab, **"From Subjects,"** alongside the existing File/Note/Link tabs. It reuses the same
search UI/endpoint built for the Subjects page (`/api/topics/search`) — type a name, see matching
topic assets with their breadcrumb (Year Group · Subject · Topic), click one to link it in.

`POST /api/programs/[id]/assets` gains a new request shape: `{ link_topic_asset_id: string,
category_id?: string }`. The route looks up the topic asset's `name`/`asset_type`, and inserts a
`program_assets` row with `linked_topic_asset_id` set — no file upload, no storage write. Existing
request shapes (multipart file upload, JSON note/link) are unchanged.

Since Subjects/Topics is a tutoring-specific structure, a non-tutoring org's search here will
simply return no results (same as the underlying `/api/topics/search` behaves for an org with no
subjects) — not an error, just an empty state.

## Annotate from a Program

Both surfaces get the same "Annotate" action `TopicAssetsPanel` already has, shown only when
`asset.linked_topic_asset_id` is set and the asset is `pdf`/`image`:

- **`AssetCard.tsx`** (standalone `/dashboard/programs/[id]` page): opens
  `WorksheetAnnotatorModal` — including its own built-in student picker, unchanged, since a
  Program isn't tied to one client/student the way a Subjects topic conversation is.
- **`ProgramReferencePanel.tsx`** (in-call): opens `WorksheetAnnotator` directly (not the modal
  wrapper) using the call's already-known `sessionStudentId` — no picker needed, since the
  in-call context already resolved which student this session is for (from the C-6 work).

Both paths render the identical `WorksheetAnnotator` component and read/write the same
`worksheet_annotations` table — annotating a worksheet is the same experience regardless of
whether you opened it via Subjects or via a Program.

## Non-goals (explicit)

- No reciprocal direction — Subjects does not gain search/reference into Program content.
- No copy/duplicate option for pulling Subjects content into a Program — reference only, per the
  confirmed decision above.
- No renaming/editing a referenced asset's name independently from within a Program — it always
  shows the name it had at link time; renaming the source in Subjects does not currently
  retroactively update the copy stored in `program_assets.name` (this is an acceptable, minor
  staleness — flagged here rather than silently accepted, but not fixed this pass, since `name` is
  a display convenience, not the file's identity).
- No support for the earlier "folder system" idea, org-wide asset library outside curriculum, or
  drag-and-drop — separate, already-deferred ideas from the Subjects folder-navigation work.

## Verification

- `pnpm run build` must pass clean (this project's only gate — no test runner).
- Manual smoke: from a Program's "Add content" modal, search for and link an existing Subjects
  PDF; confirm it appears in the Program's asset grid with the correct name/type and opens
  correctly (same file as in Subjects). Confirm the Annotate action appears only for pdf/image
  referenced assets, and that annotating from the Program (both the standalone page and in-call)
  shows/edits the exact same annotations as annotating the same worksheet from Subjects directly
  for the same student. Delete the original file from Subjects and confirm the Program's reference
  to it disappears (cascade), not a broken link. Confirm a non-tutoring org's "From Subjects" tab
  shows an empty state, not an error.
