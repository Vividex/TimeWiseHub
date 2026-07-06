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
- [ ] Create `supabase/schema-092-worksheet-annotations.sql` (full SQL in plan Task 1, Step 1).
- [ ] Apply via Supabase MCP `apply_migration` (name: `worksheet_annotations`).
- [ ] Verify via MCP `execute_sql` (three checks in plan Task 1, Step 3).
- [ ] Commit: `git add supabase/schema-092-worksheet-annotations.sql && git commit -m "feat: worksheet annotation — database migration"`

---

## C-2 — Dependencies, shared types, and lib helpers

*Conductor (shell/binary ops):*
- [ ] `pnpm add react-pdf perfect-freehand`
- [ ] `cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs`

*Codex edits:*
- [ ] Create `src/types/worksheets.ts` (plan Task 2, Step 3)
- [ ] Create `src/lib/worksheets/annotations.ts` (plan Task 2, Step 4)
- [ ] Create `src/lib/worksheets/stickers.ts` (plan Task 2, Step 5)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add package.json pnpm-lock.yaml public/pdf.worker.min.mjs src/types/worksheets.ts src/lib/worksheets/annotations.ts src/lib/worksheets/stickers.ts && git commit -m "feat: worksheet annotation — dependencies, types, and data helpers"`

---

## C-3 — WorksheetAnnotator core component

*Codex edits:*
- [ ] Create `src/components/worksheets/StickerPalette.tsx` (plan Task 3, Step 1 — builtin-only version; Step upgraded further in C-5)
- [ ] Create `src/components/worksheets/WorksheetAnnotator.tsx` (plan Task 3, Step 2 — includes the delete-object fix added during plan self-review)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/worksheets/WorksheetAnnotator.tsx src/components/worksheets/StickerPalette.tsx && git commit -m "feat: worksheet annotation — core annotator component"`

---

## C-4 — Async entry point: Subjects page "Annotate" action

*Codex edits:*
- [ ] Create `src/components/worksheets/WorksheetAnnotatorModal.tsx` (plan Task 4, Step 1)
- [ ] Modify `src/components/topics/TopicAssetsPanel.tsx` (plan Task 4, Step 2 — adds Annotate button, student-picker loader, modal render)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual smoke test (plan Task 4, Step 4): open a worksheet from `/dashboard/subjects`, add
  text/stroke/sticker, delete an object via hover-X, reload and confirm persistence, confirm a
  different student sees a blank worksheet.
- [ ] Commit: `git add src/components/worksheets/WorksheetAnnotatorModal.tsx src/components/topics/TopicAssetsPanel.tsx && git commit -m "feat: worksheet annotation — async entry point from Subjects page"`

---

## C-5 — Custom sticker upload

*Codex edits:*
- [ ] Modify `src/components/worksheets/StickerPalette.tsx` (plan Task 5, Step 1 — adds upload UI)
- [ ] Modify `src/components/worksheets/WorksheetAnnotator.tsx` (plan Task 5, Step 2 — new
  `customStickerUrls` state/effect, `pendingCustomSticker` state, sticker content branch, signed-URL rendering)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual smoke test (plan Task 5, Step 4): upload a JPEG sticker, place it, reload and confirm it still renders.
- [ ] Commit: `git add src/components/worksheets/StickerPalette.tsx src/components/worksheets/WorksheetAnnotator.tsx && git commit -m "feat: worksheet annotation — custom sticker upload"`

---

## C-6 — In-call integration (tutor + guest)

*Codex edits (all 5 files in one turn — deliberate, keeps the guest/tutor wiring internally consistent):*
- [ ] Modify `src/components/video/CallPanel.tsx` (plan Task 6, Step 1 — add `'worksheet'` tab id)
- [ ] Create `src/components/video/WorksheetTab.tsx` (plan Task 6, Step 2 — dual tutor/guest role component with `canPick` prop and broadcast-follow, per the plan's self-review fix)
- [ ] Modify `src/components/video/CallRoom.tsx` (plan Task 6, Step 3 — `canUseWorksheet` gating, optional `currentUserId`)
- [ ] Modify `src/app/dashboard/video/[roomId]/page.tsx` (plan Task 6, Step 4 — `fetchLinkedTopicAssets`)
- [ ] Modify `src/app/join/[guestToken]/page.tsx` and `src/components/video/GuestJoinClient.tsx` (plan Task 6, Step 5 — thread `callId` + guest `currentUserId`)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual smoke test (plan Task 6, Step 7): tutor opens a worksheet in-call; a guest (with a
  client email on file, so `sessionChat` resolves) joins the same call and confirms the worksheet
  auto-appears with a "Waiting…" message beforehand; confirm live co-editing both directions;
  confirm a guest with no email on file gets no Worksheet tab; confirm persistence reachable
  afterward via `/dashboard/subjects`.
- [ ] Commit: `git add src/components/video/CallPanel.tsx src/components/video/WorksheetTab.tsx src/components/video/CallRoom.tsx "src/app/dashboard/video/[roomId]/page.tsx" src/components/video/GuestJoinClient.tsx "src/app/join/[guestToken]/page.tsx" && git commit -m "feat: worksheet annotation — in-call worksheet tab, tutor + guest"`

---

## Acceptance checklist
- [ ] C-1: `worksheet_annotations` table, `can_edit_worksheet()`, `worksheet-stickers` bucket applied and verified
- [ ] C-2: dependencies installed, worker self-hosted, shared types/lib compile
- [ ] C-3: core annotator renders + supports text/stroke/builtin-sticker with live broadcast + persistence + delete
- [ ] C-4: async entry point works end to end, cross-student isolation confirmed
- [ ] C-5: custom sticker upload works and persists
- [ ] C-6: in-call tab works for both tutor and guest, confirmed live between two participants

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. No test runner in
this project — manual browser smoke required for C-4, C-5, and C-6 (ideally two simultaneous
browser sessions for the live-sync checks).
