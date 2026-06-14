# Phase 21 — Group Chat

## Goal
Add named group conversations (multi-member, dynamic membership) as a third chat
type alongside existing channels and DMs. Any org member can create a group,
invite others, add/remove members, rename the group, or leave it.

## Source plan
`docs/superpowers/plans/2026-06-14-group-chat.md`
Each checklist item maps to a Task there — implement the code VERBATIM from the plan.

## Source spec
`docs/superpowers/specs/2026-06-14-group-chat.md`

## Division of labor
- **Codex**: all text file creation/edits (.ts/.tsx/.sql).
- **Conductor**: runs Supabase MCP apply_migration; runs `pnpm run build`;
  commits; any shell commands.

## Acceptance checklist

### Task 1 — DB Migration
- [x] C1-1: Create `supabase/schema-054-group-chat.sql` (exact SQL in plan Task 1 Step 1)
- [x] C1-2: [CONDUCTOR] Apply migration via Supabase MCP
- [x] C1-3: [CONDUCTOR] Commit

### Task 2 — TypeScript Types + Context
- [x] C2-1: Edit `src/lib/chat/types.ts` — extend ChatConversationType to include 'group'; add `created_by: string | null` to ChatConversation (exact edit in plan Task 2 Step 1)
- [x] C2-2: Edit `src/components/chat/ChatRealtimeProvider.tsx` — add `orgId: string` to ChatContextValue; add `created_by` to select string; add `orgId` to value object (exact edit in plan Task 2 Step 2)
- [x] C2-3: [CONDUCTOR] `pnpm run build` — must pass clean
- [x] C2-4: [CONDUCTOR] Commit

### Task 3 — NewGroupDialog Component
- [x] C3-1: Create `src/components/chat/NewGroupDialog.tsx` (exact code in plan Task 3 Step 1)
- [x] C3-2: [CONDUCTOR] Commit

### Task 4 — Update ConversationList
- [ ] C4-1: Replace `src/components/chat/ConversationList.tsx` (exact code in plan Task 4 Step 1)
- [ ] C4-2: [CONDUCTOR] Commit

### Task 5 — GroupSettingsPanel Component
- [ ] C5-1: Create `src/components/chat/GroupSettingsPanel.tsx` (exact code in plan Task 5 Step 1)
- [ ] C5-2: [CONDUCTOR] Commit

### Task 6 — Wire into ChatClient
- [ ] C6-1: Replace `src/components/chat/ChatClient.tsx` (exact code in plan Task 6 Step 1)
- [ ] C6-2: [CONDUCTOR] `pnpm run build` — must pass clean
- [ ] C6-3: [CONDUCTOR] Commit

### Task 7 — Final Verification
- [ ] C7-1: [CONDUCTOR] `pnpm run build` — final gate
- [ ] C7-2: [CONDUCTOR] Manual smoke (see Verification section below)

## Verification
`pnpm run build` must pass clean after Task 2 and again after Task 6.

Manual smoke after C7-2:
- Sidebar: Groups section between Channels and DMs, with `+` button
- Create group: dialog opens with name input + multi-select member list; create button disabled until name + ≥1 member selected
- Group thread: messages work; Settings gear icon in header (not visible on channels/DMs)
- Group settings panel: rename saves; Add shows non-members; × removes (creator only); Leave removes user and clears active conversation
- DMs and channels: unchanged
