# Video Call UX Improvements — Design Spec

**Goal:** Three connected improvements to the existing video call system:
1. **Shareable room links** — a single `/join/s/[shareToken]` URL per call that anyone can use to enter their name and join, without a TimeWiseHub account (Google Meet-style)
2. **Invitation-gated access** — org members who were not explicitly invited cannot stumble into a call from the video dashboard; the share link is the only entry point for uninvited parties
3. **Calendar invites (.ics)** — attach an iCalendar file to scheduled call invite emails so the meeting lands in employees' real calendar apps (Google Calendar, Outlook, Apple Calendar) with a one-click join link

Builds on: `docs/superpowers/specs/2026-06-14-video-chat-design.md`

---

## What changes and what stays the same

**Stays the same:**
- `call_invitees` table and per-person `guest_token` — kept for tracking who was invited; existing sent links remain valid
- `ScheduleCallDialog` form fields (title, date, time, member picker, external guests)
- 15-minute reminder emails via cron
- `CallRoom.tsx` video frame behaviour
- Leave / End for everyone buttons (already fixed in a prior session)

**Changes:**
- `scheduled_calls` gets a new `share_token` column
- Daily.co rooms are created with `privacy: 'private'`
- Token endpoint restricts org-member access to invited members + creator only
- Instant call button gets a naming dialog
- Call room gets a "Copy invite link" button
- Video dashboard gets an "Active now" section (creator + invitees only)
- Invite emails use share link instead of split org/guest URLs
- Invite emails gain a `.ics` attachment
- `sendEmail` helper gains optional `attachments` support

---

## Database — `schema-056-video-share-token.sql`

```sql
ALTER TABLE scheduled_calls
  ADD COLUMN share_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX scheduled_calls_share_token_idx ON scheduled_calls (share_token);
```

No RLS change needed — `share_token` is read by the service client on the public join page (bypasses RLS). The existing RLS policies on `scheduled_calls` are unchanged.

---

## Security model

Daily.co rooms must be created with `privacy: 'private'` (add `properties.privacy: 'private'` to the room creation body in both `POST /api/video/rooms` and `POST /api/video/schedule`). This means Daily.co itself rejects any join attempt that lacks a valid server-issued meeting token — the share_token gate is backed by two layers.

### Token endpoint — updated access table

`GET /api/video/token` gains a third auth path (`shareToken`):

| Caller | Proof accepted | Token issued |
|---|---|---|
| Call creator (org member) | Supabase session + `created_by = user.id` | Owner token |
| Invited org member | Supabase session + row in `call_invitees` where `user_id = user.id` | Non-owner token |
| Uninvited org member | Supabase session only | **403 — not invited** |
| Anyone with share link | `?shareToken=[uuid]` matching `scheduled_calls.share_token` | Non-owner token |
| Old per-person guest link | `?guestToken=[uuid]` matching `call_invitees.guest_token` | Non-owner token (unchanged) |

The `guestToken` path is kept unchanged for backwards compatibility.

---

## New page — `src/app/join/s/[shareToken]/page.tsx`

Public route, no authentication required. Uses the service client to look up `scheduled_calls` by `share_token`. If not found or `ends_at` is set (call has ended), renders an error message. Otherwise renders `GuestJoinClient` with `callTitle`, `roomUrl`, `dailyRoomName`, and an empty `defaultName`. The `guestToken` prop is replaced by a `shareToken` prop so the token fetch call passes `?shareToken=` instead of `?guestToken=`.

`GuestJoinClient` needs a minor prop update. Change the props type to:
```ts
type Props = {
  callTitle: string
  roomUrl: string
  dailyRoomName: string
  defaultName: string
  guestToken?: string    // set by /join/[guestToken] page
  shareToken?: string    // set by /join/s/[shareToken] page
}
```
The token fetch URL becomes: `?room=...&guestToken=...` or `?room=...&shareToken=...` depending on which prop is present. Exactly one will always be set.

---

## Instant call UX changes

### Naming dialog — `VideoPageClient.tsx`

Replace the direct `startInstantCall()` call with a two-step flow:

1. Clicking "Start instant call" opens a small inline modal (same style as `ScheduleCallDialog` but minimal):
   - One text input: "What's this meeting about?" — placeholder "e.g. Quick standup", not required
   - "Start" button (disabled while loading)
2. On submit, `POST /api/video/rooms` is called with `{ org_id, title }` where `title` defaults to `'Instant call'` if left blank
3. On success, navigate to `/dashboard/video/[roomId]` as before

`POST /api/video/rooms` must accept an optional `title` field in the request body and use it instead of the hardcoded `'Instant call'`.

### Copy invite link — `CallRoom.tsx`

`CallRoom` receives a new optional prop: `shareUrl: string`. When present, a "Copy invite link" button is rendered in the button row alongside Leave / End for everyone. Clicking it runs `navigator.clipboard.writeText(shareUrl)` and briefly shows "Copied!" as button text.

`src/app/dashboard/video/[roomId]/page.tsx` must query `share_token` from `scheduled_calls` and pass `${APP_URL}/join/s/${shareToken}` as `shareUrl` to `CallRoom`.

---

## Active Now section — `src/components/video/ActiveCallsSection.tsx`

Server component. Rendered above `VideoCalendar` on the video dashboard page.

**Query logic** (run in `src/app/dashboard/video/page.tsx`, passed as props):

```
SELECT sc.id, sc.title, sc.share_token, sc.created_by, p.full_name AS creator_name
FROM scheduled_calls sc
JOIN profiles p ON p.id = sc.created_by
WHERE sc.org_id = [orgId]
  AND sc.starts_at IS NULL
  AND sc.ends_at IS NULL
  AND (
    sc.created_by = [userId]
    OR EXISTS (
      SELECT 1 FROM call_invitees ci
      WHERE ci.call_id = sc.id AND ci.user_id = [userId]
    )
  )
```

**Rendered output:** If no active calls, renders nothing (no empty state — just invisible). If there are active calls, renders a section above the calendar:

```
● Active now
[Card] Q2 Review  •  Started by Abbot  [Join]  [Copy link]
```

- "Join" links to `/dashboard/video/[call.id]`
- "Copy link" copies `APP_URL/join/s/[share_token]` to clipboard (client interaction — `ActiveCallsSection` can pass the share URL to a thin `'use client'` child `CopyLinkButton` component)
- Green pulsing dot indicator to make it visually distinct from the calendar

---

## Calendar invite (.ics)

### New utility — `src/lib/ics.ts`

Pure function, no npm dependency. Generates RFC 5545 iCalendar text:

```ts
export function generateIcs(params: {
  uid: string           // call id — ensures idempotent calendar entries
  title: string
  startsAt: string      // ISO string
  endsAt: string        // ISO string
  organiserName: string
  organiserEmail: string
  joinUrl: string
}): string
```

The output wraps a single `VEVENT` inside a `VCALENDAR`. Required fields:
- `PRODID` — `-//TimeWiseHub//TimeWiseHub//EN`
- `VERSION` — `2.0`
- `DTSTART` / `DTEND` — ISO string converted to `YYYYMMDDTHHmmssZ` (UTC, Z suffix)
- `SUMMARY` — call title
- `LOCATION` — join URL (Google Calendar renders this as a "Join" button; Outlook shows it as a hyperlink)
- `DESCRIPTION` — `Join at: [joinUrl]`
- `ORGANIZER` — `CN=[organiserName]:mailto:[organiserEmail]`
- `UID` — `[callId]@timewisehub.com` (stable across reminder emails so calendars don't create duplicate events)

### `sendEmail` — attachments support

`src/lib/email-notifications.ts` gains an optional `attachments` parameter:

```ts
type Attachment = { filename: string; content: string } // content = base64
```

Passed through to Resend's `attachments` field. Existing callers are unaffected (parameter is optional).

### Schedule route changes — `POST /api/video/schedule`

After creating the call, before sending emails:
1. Generate the `.ics` content via `generateIcs`
2. Base64-encode it: `Buffer.from(icsContent).toString('base64')`
3. Pass as `attachments: [{ filename: 'invite.ics', content: base64 }]` to `sendEmail`

The join URL in the email body and in the `.ics` LOCATION field is **always the share link**:
`${APP_URL}/join/s/${call.share_token}`

This replaces the previous split where org members got `/dashboard/video/[roomId]` and external guests got `/join/[guestToken]`. The share link works for everyone; org members who prefer to use their dashboard can still navigate there directly.

---

## File change summary

| File | Change |
|---|---|
| `supabase/schema-056-video-share-token.sql` | New — adds `share_token` column |
| `src/app/join/s/[shareToken]/page.tsx` | New — public share link landing page |
| `src/lib/ics.ts` | New — iCalendar generator |
| `src/components/video/ActiveCallsSection.tsx` | New — active calls server component |
| `src/components/video/CopyLinkButton.tsx` | New — thin client wrapper for clipboard |
| `src/app/api/video/rooms/route.ts` | Accept `title`, set `privacy: 'private'`, return `shareToken` |
| `src/app/api/video/schedule/route.ts` | Set `privacy: 'private'`, use share URL, attach `.ics` |
| `src/app/api/video/token/route.ts` | Add `shareToken` path; restrict org-member path to creator + invitees |
| `src/components/video/GuestJoinClient.tsx` | Accept `shareToken` prop alongside `guestToken` |
| `src/components/video/VideoPageClient.tsx` | Add naming dialog before creating instant call |
| `src/components/video/CallRoom.tsx` | Add `shareUrl` prop + "Copy invite link" button |
| `src/app/dashboard/video/[roomId]/page.tsx` | Query + pass `shareUrl` to `CallRoom` |
| `src/app/dashboard/video/page.tsx` | Query active calls, render `ActiveCallsSection` |
| `src/lib/email-notifications.ts` | Add optional `attachments` param |

---

## Out of scope

- RSVP tracking (accept/decline on invites) — `call_invitees.status` column exists but is not surfaced in UI
- Real-time Active Now updates (Supabase realtime / polling) — page-load state is sufficient for v1
- Reminder email `.ics` attachment — the event is already in their calendar from the invite; redundant
- `StartCallButton.tsx` (the chat sidebar button) — does not get the naming dialog; instant calls from chat are always unnamed
