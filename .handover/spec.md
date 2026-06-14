# Phase 23 — Video Chat

## Goal
Add in-app video calling: instant calls from group/channel chat, scheduled calls
with org member and external guest invites, Resend email notifications, and a
Video hub page with a weekly/monthly calendar.

## Source plan
`docs/superpowers/plans/2026-06-14-video-chat.md`
Each checklist item maps to a Task there — implement the code VERBATIM from the plan.

## Source spec
`docs/superpowers/specs/2026-06-14-video-chat-design.md`

## Division of labor
- **Codex**: all text file creation/edits (.ts/.tsx/.sql).
- **Conductor**: `pnpm run build`, `pnpm add`, Supabase MCP `apply_migration`, commits.
  Steps marked `[CONDUCTOR]` must NOT be executed by Codex.

## Acceptance checklist

### Task 1 — Database migration
- [x] C1-1: Create `supabase/schema-055-video-calls.sql` (exact code in plan Task 1 Step C1-1)
- [x] C1-2: [CONDUCTOR] Apply migration via Supabase MCP
- [x] C1-3: [CONDUCTOR] Commit

### Task 2 — Install Daily.co browser SDK
- [x] C2-1: [CONDUCTOR] `pnpm add @daily-co/daily-js`
- [x] C2-2: [CONDUCTOR] Commit

### Task 3 — API: POST /api/video/rooms (instant call)
- [x] C3-1: Create `src/app/api/video/rooms/route.ts` (exact code in plan Task 3 Step C3-1)
- [x] C3-2: [CONDUCTOR] Commit

### Task 4 — API: DELETE /api/video/rooms/[name] (end call)
- [x] C4-1: Create `src/app/api/video/rooms/[name]/route.ts` (exact code in plan Task 4 Step C4-1)
- [x] C4-2: [CONDUCTOR] Commit

### Task 5 — API: GET /api/video/token
- [x] C5-1: Create `src/app/api/video/token/route.ts` (exact code in plan Task 5 Step C5-1)
- [x] C5-2: [CONDUCTOR] Commit

### Task 6 — API: POST /api/video/schedule
- [ ] C6-1: Create `src/app/api/video/schedule/route.ts` (exact code in plan Task 6 Step C6-1)
- [ ] C6-2: [CONDUCTOR] Commit

### Task 7 — API: GET /api/video/send-reminders (cron target)
- [ ] C7-1: Create `src/app/api/video/send-reminders/route.ts` (exact code in plan Task 7 Step C7-1)
- [ ] C7-2: [CONDUCTOR] Commit

### Task 8 — CallRoom component
- [ ] C8-1: Create `src/components/video/CallRoom.tsx` (exact code in plan Task 8 Step C8-1)
- [ ] C8-2: [CONDUCTOR] Commit

### Task 9 — VideoCalendar component
- [ ] C9-1: Create `src/components/video/VideoCalendar.tsx` (exact code in plan Task 9 Step C9-1)
- [ ] C9-2: [CONDUCTOR] Commit

### Task 10 — ScheduleCallDialog component
- [ ] C10-1: Create `src/components/video/ScheduleCallDialog.tsx` (exact code in plan Task 10 Step C10-1)
- [ ] C10-2: [CONDUCTOR] Commit

### Task 11 — StartCallButton component
- [ ] C11-1: Create `src/components/video/StartCallButton.tsx` (exact code in plan Task 11 Step C11-1)
- [ ] C11-2: [CONDUCTOR] Commit

### Task 12 — Dashboard video hub page
- [ ] C12-1: Create `src/app/dashboard/video/page.tsx` AND `src/components/video/VideoPageClient.tsx` (exact code in plan Task 12 Step C12-1 — use the SECOND version with VideoPageClient)
- [ ] C12-2: [CONDUCTOR] Commit

### Task 13 — Call room page
- [ ] C13-1: Create `src/app/dashboard/video/[roomId]/page.tsx` (exact code in plan Task 13 Step C13-1)
- [ ] C13-2: [CONDUCTOR] Commit

### Task 14 — Guest join page
- [ ] C14-1: Create `src/app/join/[guestToken]/page.tsx` AND `src/components/video/GuestJoinClient.tsx` (exact code in plan Task 14 Step C14-1)
- [ ] C14-2: [CONDUCTOR] Commit

### Task 15 — Update SidebarNav
- [ ] C15-1: Edit `src/components/nav/SidebarNav.tsx` (exact edit in plan Task 15 Step C15-1)
- [ ] C15-2: [CONDUCTOR] Commit

### Task 16 — Add StartCallButton to ChatClient header
- [ ] C16-1: Edit `src/components/chat/ChatClient.tsx` (exact edit in plan Task 16 Step C16-1)
- [ ] C16-2: [CONDUCTOR] `pnpm run build` — must pass clean
- [ ] C16-3: [CONDUCTOR] Commit

## Verification
`pnpm run build` must pass clean after Task 16.

Manual smoke:
- Sidebar: "Video" appears in Communication group between Chat and Assistant
- Video hub `/dashboard/video`: calendar renders, "Start instant call" and (admin/manager) "Schedule a call" buttons visible
- Instant call: clicking "Start instant call" navigates to `/dashboard/video/[roomId]` and Daily.co UI loads
- Chat header: camera icon visible on groups/channels, clicking starts a call
- Scheduled call: ScheduleCallDialog form submits, invite emails sent, call appears on calendar
- Guest join: `/join/[guestToken]` shows "You're invited" screen, entering name loads CallRoom
- "End call for everyone" (creator) deletes the room; "Leave call" exits without deleting
