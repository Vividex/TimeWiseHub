# Phase 19 — Avatar Removal + Legal Pages

## Goal
Remove the DiceBear cartoon avatar builder entirely (keep photo uploads + initials fallback), drop the `avatar_config` DB column, then rewrite the Terms of Service page and create a new Privacy Policy page at `/privacy`.

## Source plan
`docs/superpowers/plans/2026-06-14-avatar-removal-and-legal-pages.md`
Each checklist item maps to a Task there — implement the code VERBATIM from the plan.

## Source spec
`docs/superpowers/specs/2026-06-14-avatar-removal-and-legal-pages.md`

## Division of labor
- **Codex**: all text file creation/edits (.ts/.tsx/.sql).
- **Conductor**: runs Supabase MCP apply_migration; runs `pnpm remove` and `pnpm run build`; commits; deletes AvatarBuilder.tsx (git rm).

## Acceptance checklist

### Task 1 — DB Migration: Drop avatar_config Column
- [x] C1-1: Create `supabase/schema-050-drop-avatar-config.sql` with `ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_config;`
- [x] C1-2: [CONDUCTOR] Apply migration via Supabase MCP `apply_migration`
- [x] C1-3: [CONDUCTOR] Commit migration file

### Task 2 — Simplify UserAvatar Component
- [x] C2-1: Replace `src/components/UserAvatar.tsx` — remove all DiceBear imports and SVG branch; keep avatarUrl photo branch and initials fallback only (exact code in plan Task 2 Step 1)
- [x] C2-2: [CONDUCTOR] Commit

### Task 3 — Simplify AvatarPicker + Delete AvatarBuilder
- [x] C3-1: Replace `src/components/AvatarPicker.tsx` — upload-only component, no tabs, no AvatarBuilder import (exact code in plan Task 3 Step 1)
- [x] C3-2: [CONDUCTOR] `git rm src/components/AvatarBuilder.tsx` and commit

### Task 4 — Remove AvatarConfig Type from chat/types.ts
- [x] C4-1: Edit `src/lib/chat/types.ts` — delete AvatarConfig type block; remove `avatar_config: AvatarConfig | null` from ChatMember (exact edit in plan Task 4)
- [x] C4-2: [CONDUCTOR] Commit

### Task 5 — Clean Up Settings Page
- [x] C5-1: Edit `src/app/settings/page.tsx` — remove `import type { AvatarConfig }` line; remove `avatar_config` from Supabase select string; replace Avatar section block with Profile photo section (exact edit in plan Task 5)
- [x] C5-2: [CONDUCTOR] Commit

### Task 6 — Clean Up ChatRealtimeProvider
- [x] C6-1: Edit `src/components/chat/ChatRealtimeProvider.tsx` — remove AvatarConfig from import; remove `avatar_config` from select string; remove from inline row type; remove from member map (exact edit in plan Task 6)
- [x] C6-2: [CONDUCTOR] Commit

### Task 7 — Clean Up Chat Display Components
- [x] C7-1: Edit `src/components/chat/MessageThread.tsx` — remove `avatarConfig` prop from UserAvatar (exact edit in plan Task 7 Step 1)
- [x] C7-2: Edit `src/components/chat/ConversationList.tsx` — remove `avatarConfig` prop from UserAvatar (exact edit in plan Task 7 Step 2)
- [x] C7-3: Edit `src/components/chat/NewDmDialog.tsx` — remove `avatarConfig` prop from UserAvatar (exact edit in plan Task 7 Step 3)
- [x] C7-4: [CONDUCTOR] Commit

### Task 8 — Remove @dicebear Packages + Build
- [x] C8-1: [CONDUCTOR] `pnpm remove @dicebear/core @dicebear/collection`
- [x] C8-2: [CONDUCTOR] `pnpm run build` — must pass clean
- [x] C8-3: [CONDUCTOR] Commit package.json + pnpm-lock.yaml

### Task 9 — Rewrite Terms of Service Page
- [x] C9-1: Replace `src/app/terms/page.tsx` — full rewrite (exact code in plan Task 9 Step 1)
- [x] C9-2: [CONDUCTOR] Commit

### Task 10 — Create Privacy Policy Page
- [ ] C10-1: Create `src/app/privacy/page.tsx` (exact code in plan Task 10 Step 1)
- [ ] C10-2: [CONDUCTOR] Commit

### Task 11 — Final Build Verification
- [ ] C11-1: [CONDUCTOR] `pnpm run build` — must pass clean
- [ ] C11-2: [CONDUCTOR] Manual smoke: settings page, /terms, /privacy, register links, chat avatars

## Verification
`pnpm run build` must pass clean after Task 8 and again after Task 10.
Manual smoke after C11-2:
- Settings: section heading says "Profile photo", single upload button, no tabs, no avatar builder
- `/terms`: 15 sections render, governing law says New South Wales, contact shows admin@vividex.au
- `/privacy`: page renders with processor table and 9 sections, contact shows admin@vividex.au
- Register page: both /terms and /privacy links resolve correctly
- Chat: UserAvatar shows photo or initials circle — no broken images, no TypeScript errors
