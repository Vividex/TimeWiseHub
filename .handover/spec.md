# Task: Phase 12 — Team Chat

## Context
First in-app messaging for TimeWiseHub: open 1:1 DMs + one read-only-for-employees
org Announcements channel, live via Supabase Realtime, with file attachments,
unread badges, and web push gated by quiet hours + leave + public holidays.
First feature in the codebase to use Supabase Realtime.

Full design: `docs/superpowers/specs/2026-06-08-team-chat-design.md`
Full step plan (exact code per task): `docs/superpowers/plans/2026-06-08-team-chat.md`

## Key files (read before touching)
- `docs/superpowers/plans/2026-06-08-team-chat.md` — THE source of exact code; each
  checklist item below maps to a numbered Task in this plan. Implement that task's code verbatim.
- `supabase/schema-001-auth.sql` — org/member/role model + RLS conventions (reference)
- `src/lib/supabase-browser.ts` / `-server.ts` / `-service.ts` — clients (reference)
- `src/components/DashboardShell.tsx`, `src/app/dashboard/layout.tsx` — nav + layout (modified)
- `public/sw.js`, `src/lib/push.ts` — push handler + helper (modified/reference)
- `src/components/AccountSettingsForm.tsx` — notification prefs form (modified)

## Division of labor
- **Codex**: all text file creation/edits (SQL files, .ts/.tsx, sw.js).
- **Conductor**: applies SQL migrations via Supabase MCP `apply_migration`; runs all
  shell (`pnpm run build`, `git`); verifies diffs + SQL structure; ticks boxes; commits.

## Acceptance checklist

- [x] **C1: Chat core migration** — create `supabase/schema-036-chat.sql` exactly per
  plan **Task 1** (enums; `chat_conversations`/`chat_participants`/`chat_messages`/
  `chat_attachments`; indexes; `is_chat_participant`/`can_post_chat` helpers; all RLS;
  soft-delete guard trigger; `ensure_announcements_channel` + membership-sync trigger;
  `start_dm`; `send_chat_message`; `get_chat_unread`; add `chat_messages` to
  `supabase_realtime`; backfill). Conductor applies via MCP `apply_migration`
  (name: `chat_core`) and verifies with plan Task 1 Step 3 queries.

- [x] **C2: Chat storage migration** — create `supabase/schema-037-chat-storage.sql`
  exactly per plan **Task 2** (`chat-attachments` private bucket + 3 storage policies).
  Conductor applies via MCP `apply_migration` (name: `chat_storage`) and verifies.

- [x] **C3: Shared types + pure availability** — create `src/lib/chat/types.ts` and
  `src/lib/chat/availability.ts` exactly per plan **Task 3**.

- [x] **C4: Server presence resolver** — create `src/lib/chat/presence.ts` per plan **Task 4**.

- [x] **C5: Push notify module** — create `src/lib/chat/notify.ts` per plan **Task 5**.

- [x] **C6: Send API route** — create `src/app/api/chat/send/route.ts` per plan **Task 6**.

- [x] **C7: Availability API route** — create `src/app/api/chat/availability/route.ts` per plan **Task 7**.

- [ ] **C8: ChatRealtimeProvider** — create `src/components/chat/ChatRealtimeProvider.tsx` per plan **Task 8**.

- [ ] **C9: AttachmentChip** — create `src/components/chat/AttachmentChip.tsx` per plan **Task 9**.

- [ ] **C10: MessageThread** — create `src/components/chat/MessageThread.tsx` per plan **Task 10**.

- [ ] **C11: MessageComposer** — create `src/components/chat/MessageComposer.tsx` per plan **Task 11**.

- [ ] **C12: NewDmDialog** — create `src/components/chat/NewDmDialog.tsx` per plan **Task 12**.

- [ ] **C13: ConversationList** — create `src/components/chat/ConversationList.tsx` per plan **Task 13**.

- [ ] **C14: ChatClient** — create `src/components/chat/ChatClient.tsx` per plan **Task 14**.

- [ ] **C15: Chat page + layout provider + nav badge** — create `src/app/dashboard/chat/page.tsx`;
  modify `src/app/dashboard/layout.tsx` and `src/components/DashboardShell.tsx` per plan **Task 15**.

- [ ] **C16: Service worker** — modify `public/sw.js` per plan **Task 16** (suppress chat
  push when conversation focused; fix notificationclick navigation; bump cache to v3).

- [ ] **C17: Quiet-hours settings UI** — create `src/components/chat/QuietHoursSettings.tsx`;
  modify `src/components/AccountSettingsForm.tsx` per plan **Task 17**.

- [ ] **C18: GOALS update** — mark Phase 12 items 12.1–12.6 complete in `GOALS.md` per plan **Task 18 Step 3**.

## Verification
- Conductor runs after each code item: `pnpm run build` (the repo's gate — runs tsc +
  eslint; must be clean). Note: C8 references the `send_chat_message`/`get_chat_unread`/
  `start_dm` RPCs and chat tables — build is a pure type-check and does not hit the DB,
  so ordering only matters for the final smoke.
- C1: conductor confirms via MCP `execute_sql` (plan Task 1 Step 3): one channel per org,
  all six functions present, `chat_messages` in the `supabase_realtime` publication.
- C2: conductor confirms bucket exists with `public=false` and 3 storage policies.
- Final (after C18): two-account manual smoke per plan **Task 18 Step 2** — realtime DM,
  unread badge, announcements read-only for employees, attachments, soft-delete, push +
  focus suppression, and quiet-hours/leave push suppression. The RLS/realtime privacy
  check (a subscriber must NOT receive messages from conversations they're not in) is the
  highest-priority smoke item.

## Out of scope
- Group DMs, multiple/custom channels, message editing, threaded replies, reactions,
  typing indicators, chat email digests, message pagination beyond 200 — all parked.
- No new npm dependencies (`lucide-react`, `web-push`, `@supabase/*` already installed).
- No billing/Stripe/auth changes.
