# Video call whiteboard

## Goal
Add a freeform collaborative whiteboard to tutoring video calls — a
session-scoped blank canvas with pen (colours + thickness), true
drag-to-erase, text boxes, and stickers. Visible to everyone on a tutoring
call, but locked behind Pro/Team plans (Free sees an upgrade prompt instead
of the canvas).

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-15-video-call-whiteboard-design.md`
- Source plan: `docs/superpowers/plans/2026-07-15-video-call-whiteboard.md`
- Tutoring only, alongside the existing Worksheet Annotation feature — not a
  general-purpose tool for every video call across the app.
- Scoped by `session_id`, not `(topic_asset_id, student_id)` like worksheets
  — one whiteboard per session, persists on reopen, no student
  disambiguation needed.
- Reuses Worksheet Annotation's proven architecture almost entirely
  (discrete text_box/stroke/sticker rows, Broadcast-for-live/table-for-
  persistence, `perfect-freehand`) — no new dependency.
- The one genuinely new piece: true drag-to-erase. Splits a stroke's points
  into contiguous surviving runs on release, replacing the original row with
  zero, one, or several new rows (handles more than two runs generally, not
  just the spec's illustrative two-run case). Only erases strokes — text
  boxes/stickers keep the existing select-and-× delete.
- Two existing components get small, backward-compatible generalizations so
  both features share them: `StickerPalette` (bucket/path props instead of
  hardcoded topicAssetId/studentId) and `WorksheetFullScreen` (adds a
  required `title` prop instead of a hardcoded "Worksheet" label).
- Plan gating resolved from the **session owner's** subscription
  (`sessions.created_by → getSubscription → isPaidPlan`), not the current
  viewer's — a guest student has no subscription of their own. UI-layer gate
  only, not RLS, same documented limitation as the account-deactivation gate.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) —
  the conductor handles those.
- Read every target file first — several tasks modify files that already
  exist in the shipped app (`CallRoom.tsx`, `WorksheetAnnotator.tsx`,
  `WorksheetFullScreen.tsx`, `StickerPalette.tsx`,
  `dashboard/video/[roomId]/page.tsx`, `join/[guestToken]/page.tsx`,
  `GuestJoinClient.tsx`).
- After each turn, list the files changed/created.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box
  and committing.
- C-1 is conductor-only (pure SQL) — apply via Supabase MCP `apply_migration`,
  no Codex dispatch for that item.
- C-3 is a pure refactor of existing worksheet code (StickerPalette +
  WorksheetFullScreen) — verify worksheets still work identically after it,
  not just that the build passes.
- Commit each verified item separately.

---

## C-1 — Database migration

*Conductor (no Codex turn — pure SQL):*
- [ ] Write `supabase/schema-103-whiteboard.sql` (plan Task 1, Step 1 — exact
  SQL in the plan doc)
- [ ] Apply via Supabase MCP `apply_migration` (name: `whiteboard`)
- [ ] Verify via the sanity-check queries in the plan (Step 3)
- [ ] Commit: `git add supabase/schema-103-whiteboard.sql && git commit -m "handover: C-1 whiteboard schema + RLS + storage bucket"`

---

## C-2 — Types and data access lib

*Codex edits:*
- [ ] Create `src/types/whiteboard.ts` (plan Task 2, Step 1)
- [ ] Create `src/lib/whiteboard/objects.ts` (plan Task 3, Step 1)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/types/whiteboard.ts src/lib/whiteboard/objects.ts && git commit -m "handover: C-2 whiteboard types and data access lib"`

---

## C-3 — Generalize StickerPalette and WorksheetFullScreen

*Codex edits:*
- [ ] Modify `src/components/worksheets/StickerPalette.tsx` (plan Task 4,
  Step 1 — replace `topicAssetId`/`studentId` props with `bucket`/
  `buildUploadPath`)
- [ ] Modify `src/components/worksheets/WorksheetAnnotator.tsx` (plan Task 4,
  Step 2 — update its one `StickerPalette` call site to match)
- [ ] Modify `src/components/video/WorksheetFullScreen.tsx` (plan Task 4,
  Step 3 — add a required `title` prop)
- [ ] Modify `src/components/video/CallRoom.tsx` (plan Task 4, Step 4 — pass
  `title="Worksheet"` at both existing `WorksheetFullScreen` call sites; do
  NOT add the Whiteboard button/overlay yet, that's C-6)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual: open an existing worksheet (via a call's Worksheet button or
  `/dashboard/subjects`'s Annotate action), confirm the header still says
  "Worksheet" and custom sticker upload still works at the same path.
- [ ] Commit: `git add src/components/worksheets/StickerPalette.tsx src/components/worksheets/WorksheetAnnotator.tsx src/components/video/WorksheetFullScreen.tsx src/components/video/CallRoom.tsx && git commit -m "handover: C-3 generalize StickerPalette and WorksheetFullScreen for reuse"`

---

## C-4 — WhiteboardCanvas component

*Codex edits:*
- [ ] Create `src/components/whiteboard/WhiteboardCanvas.tsx` (plan Task 5,
  Step 1 — exact code in the plan doc, including the eraser's
  `contiguousSurvivingRuns`/`runToNewStroke`/`completeErase` logic)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/whiteboard/WhiteboardCanvas.tsx && git commit -m "handover: C-4 WhiteboardCanvas with pen/eraser/text/sticker tools"`

---

## C-5 — Plan-gate notice component

*Codex edits:*
- [ ] Create `src/components/whiteboard/WhiteboardGateNotice.tsx` (plan Task
  6, Step 1)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/whiteboard/WhiteboardGateNotice.tsx && git commit -m "handover: C-5 whiteboard plan-gate notice"`

---

## C-6 — Wire into CallRoom

*Codex edits:*
- [ ] Modify `src/components/video/CallRoom.tsx` (plan Task 7 — new
  `sessionId`/`whiteboardAllowed` props, `canUseWhiteboard`, the "Whiteboard"
  button, and the full-screen overlay rendering `WhiteboardCanvas` or
  `WhiteboardGateNotice`; exact code in the plan doc)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/video/CallRoom.tsx && git commit -m "handover: C-6 wire Whiteboard button and overlay into CallRoom"`

---

## C-7 — Wire into the authenticated video call page

*Codex edits:*
- [ ] Modify `src/app/dashboard/video/[roomId]/page.tsx` (plan Task 8 —
  resolve `whiteboardAllowed` from the session owner's subscription, pass
  `sessionId`/`whiteboardAllowed` to `CallRoom`; exact code in the plan doc)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/app/dashboard/video/[roomId]/page.tsx && git commit -m "handover: C-7 resolve whiteboard plan-gating from the session owner's subscription"`

---

## C-8 — Wire into the guest join path

*Codex edits:*
- [ ] Modify `src/app/join/[guestToken]/page.tsx` (plan Task 9, Step 1-2 —
  fetch `session_id`, resolve `whiteboardAllowed`, pass to
  `GuestJoinClient`)
- [ ] Modify `src/components/video/GuestJoinClient.tsx` (plan Task 9, Step 3
  — thread `sessionId`/`whiteboardAllowed` through to `CallRoom`)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/app/join/[guestToken]/page.tsx src/components/video/GuestJoinClient.tsx && git commit -m "handover: C-8 wire whiteboard sessionId and plan-gating into the guest join path"`

---

## Acceptance checklist
- [ ] C-1: `whiteboard_objects` table + RLS + `whiteboard-stickers` bucket
  apply cleanly.
- [ ] C-2: types/lib compile.
- [ ] C-3: worksheets unaffected — same header text, same sticker upload
  path.
- [ ] C-4/C-5: components compile in isolation.
- [ ] C-6: Whiteboard button appears next to Worksheet on a tutoring call
  with a linked session.
- [ ] C-7/C-8: Pro/Team tutor and Pro/Team-tutor's guest both see a working
  canvas; Free tutor and that tutor's guest both see the button but get the
  locked notice (with/without the Billing link respectively) when they open
  it.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke test (two-browser live sync for pen/text/sticker, the
  drag-to-erase split behaviour specifically, persistence across
  leave/rejoin, a fresh board on a different session) — requires the user's
  own authenticated + guest sessions. **User follow-up, not the conductor's
  to complete.**

## Verification
No test runner in this project — verification is `pnpm run build` (tsc +
eslint) after every turn, full clean build after C-8, plus the "Verification"
checklist in `docs/superpowers/plans/2026-07-15-video-call-whiteboard.md`.
