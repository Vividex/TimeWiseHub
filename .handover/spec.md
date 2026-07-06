# Collaborative Worksheet Annotation

## Goal
Let a tutor and student place text answers, freehand strokes, and stickers on a shared
fixed-layout worksheet (PDF/image) from the existing Topics/Subjects library — live during a
video call or asynchronously afterward — with real-time sync between participants.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-06-collaborative-worksheet-annotation-design.md`
- Source plan: `docs/superpowers/plans/2026-07-06-collaborative-worksheet-annotation.md`
  (the plan has the full exact code for every step below — read it before writing each turn's
  instruction to `inbox/to-codex.md`, don't re-derive code from scratch).
- One new table `worksheet_annotations` (discrete objects: text_box/stroke/sticker, no CRDT).
  Real-time via Supabase Realtime **Broadcast** (not `postgres_changes` — too slow for
  high-frequency events like pen strokes), persisted separately via debounced writes.
- Access control reuses the existing guest-identity pattern (`clients.guest_chat_user_id`,
  `can_post_chat()`-style function) rather than inventing a new one — new
  `can_edit_worksheet(topic_asset_id, student_id)` Postgres function backs both table RLS and
  `worksheet-stickers` storage bucket policies.
- One reusable `WorksheetAnnotator` component, two entry points: an in-call `CallPanel` tab, and a
  modal from the existing `/dashboard/subjects` page.
- **In-call guest (student) side:** guests never get their own worksheet picker (matching the
  existing precedent that guests don't get the Program reference panel either) — they auto-follow
  whatever worksheet the tutor opens, via a call-scoped broadcast channel, using their existing
  chat identity (`sessionChat.userId`) to co-edit. This was a real gap caught during the plan's own
  self-review (first draft only wired up the tutor side) — see Task 6 in the plan for the full
  fix, including changes to `GuestJoinClient.tsx` and `join/[guestToken]/page.tsx`.
- New deps: `react-pdf`, `perfect-freehand` (both free/open-source, no ongoing cost, confirmed).
- Builtin stickers render as colored lucide-react icons (no bundled image assets needed); custom
  stickers are real uploaded images in a private `worksheet-stickers` bucket.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.
- Copy code exactly from the plan file (`docs/superpowers/plans/2026-07-06-collaborative-worksheet-annotation.md`) — it has complete, working code for every step, not placeholders.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- C-1 is conductor-only (DB migration via Supabase MCP).
- C-2's `pnpm add` and worker-file copy are conductor-only (shell/binary ops).

---

## C-1 — Database migration: worksheet_annotations, can_edit_worksheet(), worksheet-stickers bucket

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-092-worksheet-annotations.sql` (full SQL in plan Task 1, Step 1).
- [x] Apply via Supabase MCP `apply_migration` (name: `worksheet_annotations`).
- [x] Verify via MCP `execute_sql` (three checks in plan Task 1, Step 3).
- [x] Commit: `git add supabase/schema-092-worksheet-annotations.sql && git commit -m "feat: worksheet annotation — database migration"`

---

## C-2 — Dependencies, shared types, and lib helpers

*Conductor (shell/binary ops):*
- [x] `pnpm add react-pdf perfect-freehand`
- [x] Copy the pdf.js worker to `public/pdf.worker.min.mjs` (pnpm nests pdfjs-dist under
  `node_modules/.pnpm/pdfjs-dist@5.4.296/node_modules/pdfjs-dist/build/pdf.worker.min.mjs`, not a
  top-level `node_modules/pdfjs-dist` path, since it's a transitive dep of react-pdf).

*Codex edits:*
- [x] Create `src/types/worksheets.ts` (plan Task 2, Step 3)
- [x] Create `src/lib/worksheets/annotations.ts` (plan Task 2, Step 4)
- [x] Create `src/lib/worksheets/stickers.ts` (plan Task 2, Step 5)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add package.json pnpm-lock.yaml public/pdf.worker.min.mjs src/types/worksheets.ts src/lib/worksheets/annotations.ts src/lib/worksheets/stickers.ts && git commit -m "feat: worksheet annotation — dependencies, types, and data helpers"`

---

## C-3 — WorksheetAnnotator core component

*Codex edits:*
- [x] Create `src/components/worksheets/StickerPalette.tsx` (plan Task 3, Step 1 — builtin-only version; Step upgraded further in C-5)
- [x] Create `src/components/worksheets/WorksheetAnnotator.tsx` (plan Task 3, Step 2 — includes the delete-object fix added during plan self-review)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/components/worksheets/WorksheetAnnotator.tsx src/components/worksheets/StickerPalette.tsx && git commit -m "feat: worksheet annotation — core annotator component"`

---

## C-4 — Async entry point: Subjects page "Annotate" action

*Codex edits:*
- [x] Create `src/components/worksheets/WorksheetAnnotatorModal.tsx` (plan Task 4, Step 1)
- [x] Modify `src/components/topics/TopicAssetsPanel.tsx` (plan Task 4, Step 2 — adds Annotate button, student-picker loader, modal render)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Manual smoke test (plan Task 4, Step 4): confirmed live on production after a hard refresh
  (stale JS bundle in an already-open tab was the initial "no Annotate button" report). Found +
  fixed one real bug during this test: the text box rendered as an opaque dark box, not
  transparent/white, because a global `html.dark textarea {...}` rule in globals.css overrode the
  component's own `bg-white/90` in dark mode (this app's default theme) — fixed with
  `!important`-prefixed utilities, committed 8ab9b1e, pushed.
- [x] Commit: `git add src/components/worksheets/WorksheetAnnotatorModal.tsx src/components/topics/TopicAssetsPanel.tsx && git commit -m "feat: worksheet annotation — async entry point from Subjects page"`

---

## C-4.5 — Subjects page folder navigation + search (inserted mid-loop)

Raised by the user directly after C-4's smoke test: the year-group/subject/topic dropdown
drill-down is clumsy for finding one document among potentially thousands. Scoped and approved via
its own brainstorm/spec/plan cycle — **not part of the original Collaborative Worksheet Annotation
plan**, but blocking further comfortable use of it, so inserted here before C-5/C-6 per the user's
explicit request ("fix it now... before we get too far down the track").

- Source spec: `docs/superpowers/specs/2026-07-06-subjects-folder-navigation-and-search-design.md`
- Source plan: `docs/superpowers/plans/2026-07-06-subjects-folder-navigation-and-search.md`
  (single task, full exact code for every step — read it before writing this turn's
  `inbox/to-codex.md`, don't re-derive code from scratch)

*Codex edits (all files in one turn — deliberate, see plan's own note on why splitting is risky):*
- [x] Create `src/components/topics/FolderTile.tsx` (plan Step 1)
- [x] Create `src/app/api/topics/search/route.ts` (plan Step 2)
- [x] Create `src/components/topics/SubjectsSearch.tsx` (plan Step 3)
- [x] Create `src/app/dashboard/subjects/layout.tsx` (plan Step 4)
- [x] Rewrite `src/app/dashboard/subjects/page.tsx` (plan Step 5)
- [x] Create `src/app/dashboard/subjects/[yearGroup]/page.tsx` (plan Step 6)
- [x] Create `src/app/dashboard/subjects/[yearGroup]/[subjectId]/page.tsx` (plan Step 7)
- [x] Create `src/app/dashboard/subjects/[yearGroup]/[subjectId]/[topicId]/page.tsx` (plan Step 8)
- [x] Delete `src/components/topics/SubjectsBrowser.tsx` (plan Step 9 — no longer referenced)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean. All 4 new route levels registered in build output.
- [x] Manual smoke test (plan Step 11): confirmed live on production — user reports "that's
  better."
- [x] Commit: `git add src/components/topics/FolderTile.tsx src/components/topics/SubjectsSearch.tsx src/app/api/topics/search/route.ts src/app/dashboard/subjects/layout.tsx src/app/dashboard/subjects/page.tsx "src/app/dashboard/subjects/[yearGroup]" src/components/topics/SubjectsBrowser.tsx && git commit -m "feat: subjects page — folder navigation and org-wide search"`

---

## C-5 — Custom sticker upload

*Codex edits:*
- [x] Modify `src/components/worksheets/StickerPalette.tsx` (plan Task 5, Step 1 — adds upload UI)
- [x] Modify `src/components/worksheets/WorksheetAnnotator.tsx` (plan Task 5, Step 2 — new
  `customStickerUrls` state/effect, `pendingCustomSticker` state, sticker content branch, signed-URL rendering)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Manual smoke test (plan Task 5, Step 4): confirmed live — initial "nothing appears" report
  was a UX gap, not a bug (armed-tool state had no visual feedback beyond a crosshair cursor);
  fixed directly with a hint banner ("Click the worksheet to place it" / pen equivalent) shown
  while a tool is armed.
- [x] Commit: `git add src/components/worksheets/StickerPalette.tsx src/components/worksheets/WorksheetAnnotator.tsx && git commit -m "feat: worksheet annotation — custom sticker upload"`

---

## C-6 — In-call integration (tutor + guest)

*Codex edits (all 5 files in one turn — deliberate, keeps the guest/tutor wiring internally consistent):*
- [x] Modify `src/components/video/CallPanel.tsx` (plan Task 6, Step 1 — add `'worksheet'` tab id)
- [x] Create `src/components/video/WorksheetTab.tsx` (plan Task 6, Step 2 — dual tutor/guest role component with `canPick` prop and broadcast-follow, per the plan's self-review fix)
- [x] Modify `src/components/video/CallRoom.tsx` (plan Task 6, Step 3 — `canUseWorksheet` gating, optional `currentUserId`)
- [x] Modify `src/app/dashboard/video/[roomId]/page.tsx` (plan Task 6, Step 4 — `fetchLinkedTopicAssets`)
- [x] Modify `src/app/join/[guestToken]/page.tsx` and `src/components/video/GuestJoinClient.tsx` (plan Task 6, Step 5 — thread `callId` + guest `currentUserId`)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean. All 6 files verified against plan diff-by-diff, exact match.
- [ ] Manual smoke test (plan Task 6, Step 7): tutor opens a worksheet in-call; a guest (with a
  client email on file, so `sessionChat` resolves) joins the same call and confirms the worksheet
  auto-appears with a "Waiting…" message beforehand; confirm live co-editing both directions;
  confirm a guest with no email on file gets no Worksheet tab; confirm persistence reachable
  afterward via `/dashboard/subjects`. **Deferred to production** — same as C-4/C-4.5/C-5.
- [x] Commit: `git add src/components/video/CallPanel.tsx src/components/video/WorksheetTab.tsx src/components/video/CallRoom.tsx "src/app/dashboard/video/[roomId]/page.tsx" src/components/video/GuestJoinClient.tsx "src/app/join/[guestToken]/page.tsx" && git commit -m "feat: worksheet annotation — in-call worksheet tab, tutor + guest"`

---

## C-7 through C-11 — Program-Subjects Content Linking (inserted mid-loop)

Raised by the user directly after C-6 shipped, before its smoke test was confirmed: Programs and
Subjects/Topics are two parallel content systems with no bridge, which was genuinely confusing to
work out even for the user. Scoped and approved via its own brainstorm/spec/plan cycle. C-6's
smoke test remains open/pending in parallel — these items touch entirely different files (Programs
vs. video-call files) so there's no reason to block one on the other.

- Source spec: `docs/superpowers/specs/2026-07-06-program-subjects-content-linking-design.md`
- Source plan: `docs/superpowers/plans/2026-07-06-program-subjects-content-linking.md`
  (full exact code for every step — read it before writing each turn's `inbox/to-codex.md`)

### C-7 — Database migration

*Conductor only (no Codex dispatch):*
- [x] Create `supabase/schema-093-program-topic-asset-link.sql` (plan Task 1, Step 1)
- [x] Apply via Supabase MCP `apply_migration` (name: `program_topic_asset_link`)
- [x] Verify via MCP `execute_sql` (plan Task 1, Step 3)
- [x] Commit: `git add supabase/schema-093-program-topic-asset-link.sql && git commit -m "feat: program-subjects linking — database migration"`

### C-8 — Shared signed-URL resolver

*Codex edits:*
- [ ] Modify `src/types/programs.ts` (plan Task 2, Step 1 — add `linked_topic_asset_id`)
- [ ] Modify `src/lib/program-storage.ts` (plan Task 2, Step 2 — add `resolveProgramAssetSignedUrl`)
- [ ] Modify `src/app/dashboard/programs/[id]/page.tsx` (plan Task 2, Step 3)
- [ ] Modify `src/app/dashboard/video/[roomId]/page.tsx` (plan Task 2, Step 4)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/types/programs.ts src/lib/program-storage.ts "src/app/dashboard/programs/[id]/page.tsx" "src/app/dashboard/video/[roomId]/page.tsx" && git commit -m "feat: program-subjects linking — shared signed-URL resolver"`

### C-9 — Add-content "From Subjects" tab

*Codex edits:*
- [ ] Modify `src/app/api/programs/[id]/assets/route.ts` (plan Task 3, Step 1 — includes a
  source-asset authorization check via `getTopicAccess`, not just the destination-program check)
- [ ] Modify `src/components/programs/AssetUploadZone.tsx` (plan Task 3, Step 2)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual smoke test (plan Task 3, Step 4): search and link an existing worksheet from a
  Program's Add Content modal, confirm it appears and opens the same file as Subjects.
- [ ] Commit: `git add "src/app/api/programs/[id]/assets/route.ts" src/components/programs/AssetUploadZone.tsx && git commit -m "feat: program-subjects linking — search and link from Add content"`

### C-10 — Annotate from the standalone Program page

*Codex edits:*
- [ ] Modify `src/components/programs/AssetCard.tsx` (plan Task 4, Step 1)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual smoke test (plan Task 4, Step 3): Annotate button appears only for linked pdf/image
  assets; opening it shows the same worksheet/annotations as via Subjects for the same student.
- [ ] Commit: `git add src/components/programs/AssetCard.tsx && git commit -m "feat: program-subjects linking — annotate from the standalone Program page"`

### C-11 — Annotate from the in-call Program panel

*Codex edits:*
- [ ] Modify `src/components/video/ProgramReferencePanel.tsx` (plan Task 5, Step 1)
- [ ] Modify `src/components/video/CallRoom.tsx` (plan Task 5, Step 2)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual smoke test (plan Task 5, Step 4): in a live call, Annotate on a linked worksheet opens
  directly to that session's student (no picker), consistent with Subjects/standalone-page
  annotations for the same student.
- [ ] Commit: `git add src/components/video/ProgramReferencePanel.tsx src/components/video/CallRoom.tsx && git commit -m "feat: program-subjects linking — annotate from the in-call Program panel"`

---

## Acceptance checklist
- [x] C-1: `worksheet_annotations` table, `can_edit_worksheet()`, `worksheet-stickers` bucket applied and verified
- [x] C-2: dependencies installed, worker self-hosted, shared types/lib compile
- [x] C-3: core annotator renders + supports text/stroke/builtin-sticker with live broadcast + persistence + delete
- [x] C-4: async entry point works end to end, confirmed live (one bug found + fixed: dark textarea)
- [x] C-4.5: Subjects page folder navigation + search (inserted mid-loop, own spec/plan), confirmed live
- [x] C-5: custom sticker upload works and persists, confirmed live
- [ ] C-6: in-call tab works for both tutor and guest, confirmed live between two participants (pending user's smoke test)
- [ ] C-7: `program_assets.linked_topic_asset_id` migration applied and verified
- [ ] C-8: shared signed-URL resolver in place, both call sites use it
- [ ] C-9: "From Subjects" search-and-link works end to end
- [ ] C-10: annotate works from the standalone Program page
- [ ] C-11: annotate works from the in-call Program panel

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. No test runner in
this project — manual browser smoke required for C-4, C-5, and C-6 (ideally two simultaneous
browser sessions for the live-sync checks).
