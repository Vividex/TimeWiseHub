# Phase 16 — Username & Nickname

## Goal
Add `username` (stable unique handle, set at registration) and `nickname`
(freely-editable display name) to every user profile. Show `nickname ?? username`
everywhere a peer's name appears (chat messages, DM list, task assignment, notifications).
Add a post-login org-selection flow so multi-org users can choose which org to enter.

## Source plan
`docs/superpowers/plans/2026-06-13-username-nickname.md`
Each checklist item maps to a Task there — implement the code VERBATIM from the plan.

## Source spec
`docs/superpowers/specs/2026-06-13-username-nickname-design.md`

## Division of labor
- **Codex**: all text file creation/edits (.ts/.tsx/.sql).
- **Conductor**: applies DB migration via Supabase MCP; runs all shell (`pnpm run build`, `git`); verifies diffs; ticks boxes; commits.

## Acceptance checklist

### Task 1 — DB Migration SQL
- [x] C1-1: Create `supabase/schema-044-username-nickname.sql` per plan Task 1
- [x] C1-2: [CONDUCTOR] Apply migration via Supabase MCP
- [x] C1-3: [CONDUCTOR] Commit

### Task 2 — ChatMember type + displayName helper
- [x] C2-1: Replace `src/lib/chat/types.ts` per plan Task 2
- [x] C2-2: [CONDUCTOR] Build check
- [x] C2-3: [CONDUCTOR] Commit

### Task 3 — isUsernameTaken utility
- [x] C3-1: Create `src/lib/username.ts` per plan Task 3
- [x] C3-2: [CONDUCTOR] Commit

### Task 4 — set-active-org route handler
- [x] C4-1: Create `src/app/api/set-active-org/route.ts` per plan Task 4
- [x] C4-2: [CONDUCTOR] Build check
- [x] C4-3: [CONDUCTOR] Commit

### Task 5 — Registration page username field
- [x] C5-1: Replace `src/app/(auth)/register/page.tsx` per plan Task 5
- [x] C5-2: [CONDUCTOR] Build check
- [x] C5-3: [CONDUCTOR] Commit

### Task 6 — Login page post-auth routing
- [x] C6-1: Replace `src/app/(auth)/login/page.tsx` per plan Task 6
- [x] C6-2: [CONDUCTOR] Build check
- [x] C6-3: [CONDUCTOR] Commit

### Task 7 — /setup-username page
- [ ] C7-1: Create `src/app/setup-username/page.tsx` per plan Task 7
- [ ] C7-2: [CONDUCTOR] Build check
- [ ] C7-3: [CONDUCTOR] Commit

### Task 8 — /select-org page
- [ ] C8-1: Create `src/app/select-org/page.tsx` per plan Task 8
- [ ] C8-2: [CONDUCTOR] Build check
- [ ] C8-3: [CONDUCTOR] Commit

### Task 9 — Dashboard layout org cookie
- [ ] C9-1: Replace `src/app/dashboard/layout.tsx` per plan Task 9
- [ ] C9-2: [CONDUCTOR] Commit (build expected to fail until Task 10)

### Task 10 — ChatRealtimeProvider orgId + loadMembers
- [ ] C10-1: Update `src/components/chat/ChatRealtimeProvider.tsx` per plan Task 10 (3 edits)
- [ ] C10-2: [CONDUCTOR] Build check (must pass clean)
- [ ] C10-3: [CONDUCTOR] Commit

### Task 11 — Chat display (MessageThread + ConversationList)
- [ ] C11-1: Update `src/components/chat/MessageThread.tsx` per plan Task 11
- [ ] C11-2: Update `src/components/chat/ConversationList.tsx` per plan Task 11
- [ ] C11-3: [CONDUCTOR] Build check
- [ ] C11-4: [CONDUCTOR] Commit

### Task 12 — NewDmDialog display names
- [ ] C12-1: Update `src/components/chat/NewDmDialog.tsx` per plan Task 12
- [ ] C12-2: [CONDUCTOR] Build check
- [ ] C12-3: [CONDUCTOR] Commit

### Task 13 — NicknameForm + Settings page
- [ ] C13-1: Create `src/components/NicknameForm.tsx` per plan Task 13
- [ ] C13-2: Update `src/app/settings/page.tsx` per plan Task 13
- [ ] C13-3: [CONDUCTOR] Build check (final clean build)
- [ ] C13-4: [CONDUCTOR] Commit

### Task 14 — Install DiceBear packages
- [ ] C14-1: [CONDUCTOR] `pnpm add @dicebear/core @dicebear/collection`
- [ ] C14-2: [CONDUCTOR] Build check
- [ ] C14-3: [CONDUCTOR] Commit `package.json` + `pnpm-lock.yaml`

### Task 15 — UserAvatar display component
- [ ] C15-1: Create `src/components/UserAvatar.tsx` per plan Task 15
- [ ] C15-2: [CONDUCTOR] Build check
- [ ] C15-3: [CONDUCTOR] Commit

### Task 16 — AvatarBuilder component
- [ ] C16-1: Create `src/components/AvatarBuilder.tsx` per plan Task 16
- [ ] C16-2: [CONDUCTOR] Build check
- [ ] C16-3: [CONDUCTOR] Commit

### Task 17 — AvatarPicker (tabbed Build / Upload)
- [ ] C17-1: Create `src/components/AvatarPicker.tsx` per plan Task 17
- [ ] C17-2: [CONDUCTOR] Build check
- [ ] C17-3: [CONDUCTOR] Commit

### Task 18 — Wire avatars into settings and chat
- [ ] C18-1: Update `src/app/settings/page.tsx` per plan Task 18 step 18.1
- [ ] C18-2: Update `src/components/chat/ConversationList.tsx` per plan Task 18 step 18.2
- [ ] C18-3: Update `src/components/chat/NewDmDialog.tsx` per plan Task 18 step 18.3
- [ ] C18-4: Update `src/components/chat/MessageThread.tsx` per plan Task 18 step 18.4
- [ ] C18-5: [CONDUCTOR] Final build check
- [ ] C18-6: [CONDUCTOR] Commit

## Verification
`pnpm run build` must pass clean after every [CONDUCTOR] build check step.
No test runner — manual smoke after final commit:
- Register a new account → username field present, inline "taken" error on blur for duplicate
- Login as `admin@vividex.au` → redirected to /setup-username
- Chat messages show nickname/username, never email
- Settings page shows Profile card with read-only username and editable nickname
