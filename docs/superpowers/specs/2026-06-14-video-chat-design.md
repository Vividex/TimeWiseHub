# Video Chat — Design Spec

**Goal:** In-app video calling for TimeWiseHub org members. Any member can start an instant call
from a group/channel they belong to. Admins and managers can schedule calls and invite any org
member or external guest regardless of group membership. External guests join via a public link
with no account required. Invites and reminders are sent via Resend email.

---

## Dependencies

- **New npm package:** `@daily-co/daily-js` (Daily.co browser SDK)
- **New env var:** `DAILY_API_KEY` — add to Vercel env vars and `.env.local`

Daily.co free tier: 10,000 minutes/month. Rooms are created via their REST API; the browser SDK
handles WebRTC entirely.

---

## Database — `schema-055-video-calls.sql`

### `scheduled_calls`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | `gen_random_uuid()` |
| `org_id` | `uuid FK organisations` | NOT NULL |
| `title` | `text` | NOT NULL |
| `starts_at` | `timestamptz` | NULL for instant calls |
| `ends_at` | `timestamptz` | NULL for instant calls |
| `created_by` | `uuid FK auth.users` | NOT NULL |
| `daily_room_name` | `text` | Daily.co room identifier |
| `room_url` | `text` | Full Daily.co room URL |
| `reminder_sent` | `boolean` | Default false |
| `created_at` | `timestamptz` | Default now() |

**RLS:** Org members (via `organisation_members`) can SELECT. Owner/admin/manager can
INSERT/UPDATE/DELETE.

### `call_invitees`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | `gen_random_uuid()` |
| `call_id` | `uuid FK scheduled_calls` | ON DELETE CASCADE |
| `user_id` | `uuid nullable FK auth.users` | NULL for external guests |
| `email` | `text` | NOT NULL |
| `display_name` | `text` | |
| `status` | `text` | Default `'pending'` (pending/accepted/declined) |
| `guest_token` | `uuid` | Default `gen_random_uuid()` — used in public join URL |

**RLS:** Users can SELECT/UPDATE rows where `user_id = auth.uid()`. Call creator can SELECT all
invitees for their own calls.

---

## API Routes

### `POST /api/video/rooms`
Instant call starter. Authenticated org members only. Calls Daily.co REST API to create a room
(4-hour expiry), inserts a row in `scheduled_calls` (no `starts_at`/`ends_at`), generates a
Daily.co meeting token for the caller, returns `{ roomUrl, token, roomId }`.

### `POST /api/video/schedule`
Creates a scheduled call. Admin/manager only. Creates the Daily.co room in advance (expiry = 1
hour after `ends_at`), inserts into `scheduled_calls` and `call_invitees`, sends Resend invite
emails to all invitees. Org members receive a `/dashboard/video/[roomId]` link. External guests
receive a `/join/[guestToken]` link.

### `GET /api/video/token?room=[dailyRoomName]&guestToken=[uuid]`
Issues a Daily.co meeting token. Two auth paths:
- **Org member** (authenticated, no `guestToken`): verifies Supabase session + org membership,
  issues a full-permission token.
- **External guest** (`guestToken` present, no session): looks up `guest_token` in
  `call_invitees`, verifies it matches the requested room, issues a guest-permission token
  (camera/mic only, no recording control).
Returns `{ token }`.

### `DELETE /api/video/rooms/[name]`
Called when the call creator ends the call. Deletes the Daily.co room via their API and updates
the `scheduled_calls` row (sets `ends_at = now()` if null).

---

## Pages

### `src/app/dashboard/video/page.tsx`
Server component. The Video hub. Loads upcoming `scheduled_calls` for the org. Renders
`VideoCalendar` with the data. Shows "Start instant call" button for all members. Shows "Schedule
a call" button for owner/admin/manager only.

### `src/app/dashboard/video/[roomId]/page.tsx`
Server component shell. Fetches the `scheduled_calls` row, calls `GET /api/video/token` to
generate a meeting token, passes `{ roomUrl, token }` to `CallRoom` as props.

### `src/app/join/[guestToken]/page.tsx`
**Public route — no authentication required.** Looks up `guest_token` in `call_invitees`, finds
the associated `scheduled_calls` row. Displays call title and organiser name. Renders a display
name input and a "Join call" button. On submit, the client calls `GET /api/video/token` (with the
guest token for auth), then mounts `CallRoom`.

---

## Components — `src/components/video/`

### `CallRoom.tsx` (`'use client'`)
Mounts `@daily-co/daily-js`. Joins the room using the pre-fetched meeting token. Renders the video
grid (Daily.co handles layout). Shows a "Leave call" button — if the current user is the call
creator, it calls `DELETE /api/video/rooms/[name]` before navigating back; otherwise just leaves.

### `VideoCalendar.tsx` (`'use client'`)
Weekly/monthly toggle. Renders `scheduled_calls` as clickable blocks on the calendar. Clicking a
future call shows its details (title, time, invitees). Clicking a call that is currently live
navigates to `/dashboard/video/[roomId]`.

### `ScheduleCallDialog.tsx` (`'use client'`)
Modal form. Fields: title, date, start time, duration (drives `ends_at`), org member multi-select,
free-text email + name fields for external guests. Submit calls `POST /api/video/schedule`.

### `StartCallButton.tsx`
Small button rendered in `ChatClient.tsx`'s header for groups and channels only (not DMs — DM
video calling is out of scope for this spec). On click: calls `POST /api/video/rooms`, then
navigates to `/dashboard/video/[roomId]`.

---

## Sidebar Navigation

Add a "Video" item to `src/components/nav/SidebarNav.tsx` with a camera icon, positioned after
Chat in the nav order.

---

## Email (Resend)

### Invite email
Sent from `POST /api/video/schedule` for every invitee.
- Subject: `"[OrganiserName] invited you to a call: [title]"`
- Body: title, date/time, organiser name, one-click join button
- Org members: button → `/dashboard/video/[roomId]`
- External guests: button → `/join/[guestToken]`

### Reminder email
Sent 15 minutes before `starts_at` by a pg_cron job (using existing cron infrastructure from
schema-053). The job fires every 5 minutes, queries for calls where `starts_at` is between
`now() + 10 min` and `now() + 20 min` and `reminder_sent = false`, sends the reminder email to
all invitees, sets `reminder_sent = true`. Same link format as the invite email.

---

## External Guest Flow

1. Organiser adds external email + name in `ScheduleCallDialog`
2. `call_invitees` row inserted with `user_id = null`, `guest_token` auto-generated
3. Resend invite email sent with `/join/[guestToken]` link
4. Guest visits the link, enters their display name, clicks Join
5. Server verifies `guest_token` exists in `call_invitees`, issues a Daily.co meeting token with
   guest permissions (camera/mic, no recording control)
6. `CallRoom` mounts and guest joins

---

## Call Permissions Summary

| Action | Who |
|---|---|
| Start instant call from chat | Any org member (from their own groups/channels) |
| Schedule a call | Owner, admin, manager |
| Invite external guests | Owner, admin, manager |
| Join a call | Any invitee (org member or external guest) |
| End a call (delete room) | Call creator only |
