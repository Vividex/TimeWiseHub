# Unread Client Messages — Design

## Goal
Make an incoming client reply impossible to miss without relying solely on push notifications —
surface unread client messages on the main dashboard and on the client's own page, so staff don't
have to remember to check a specific client's Messages tab to discover a reply exists.

## Out of scope
- Per-staff-member read state — read status is shared across the whole org (whoever views a
  client's Messages page marks it read for everyone), not tracked per individual user. Confirmed
  during brainstorming: this is a shared-inbox feature, not per-person email.
- An unread indicator on the client list (`/dashboard/clients`) — the dashboard entry already
  covers "don't make me go looking"; adding per-row indicators to the client list is a separate,
  smaller enhancement if ever wanted later.
- Any change to how messages are sent/received, notification content, or the underlying
  `client_messages`/webhook mechanics built in the "Client Email Messaging" phase — this is purely
  a visibility layer on top of that already-working feature.

## Design

### 1. Data model — `clients.messages_last_viewed_at`
One new nullable `timestamptz` column on the existing `clients` table. `null` means "never viewed"
(so any inbound message counts as unread). No new table — this is a single per-client marker,
matching the "shared across org" decision (not per-user, so no `(client, user)` join table needed).

### 2. Marking read
Opening a client's Messages page (`/dashboard/clients/[id]/messages`) updates
`messages_last_viewed_at` to the current time. No separate "mark as read" button — viewing the
thread is the read signal, consistent with how the page already behaves today.

**RLS note:** `clients`' existing UPDATE policy only covers `owner`/`admin` roles (a manager or
employee can already *view* a client via a separate, broader SELECT policy, but can't update the
row directly). Since viewing the Messages page is already gated correctly (the page's existing
RLS-respecting SELECT succeeds only for legitimate org members), the write to
`messages_last_viewed_at` after that point uses the service-role client — the same
select-then-service-role-write pattern already used elsewhere in this codebase (e.g. the chat
attachment signed-URL route) — rather than broadening the general `clients` UPDATE policy, which
would let managers/employees edit any client field, not just this one column.

### 3. Determining "unread"
A client has unread messages if at least one `client_messages` row exists with
`direction = 'inbound'` and `created_at > coalesce(clients.messages_last_viewed_at, '-infinity')`.
No stored unread count or flag — computed at query time from data that already exists.

### 4. Surfacing — dashboard "Today" agenda
A new block in `DashboardUpcoming.tsx`, following the exact same visual/data pattern already used
for the pending-approvals block added in the "Dashboard Today Section" phase: client name, a short
preview of the latest unread message, and a link straight to that client's Messages page. Query
runs org-wide (matching how approvals/sessions/meetings are already fetched in
`dashboard/page.tsx`), scoped the same dual org-member-or-solo-owner way `client_messages` itself
already is.

### 5. Surfacing — client's own Messages tile
On the client overview page (`/dashboard/clients/[id]/page.tsx`), the existing "Messages" tile
gets a small unread dot when that specific client has unread messages — cheap, and useful for
someone already on a client's page for an unrelated reason.

## Testing
No test runner in this project. Manual verification:
- Send a message, reply to it (already proven working end-to-end in the prior phase) — confirm
  the client shows up as unread in both the dashboard block and the tile dot.
- Open that client's Messages page — confirm both indicators clear (dashboard block no longer
  lists it, tile dot disappears) without needing a page reload of the dashboard itself (next visit
  is fine — this doesn't need to be realtime).
- Confirm a client with no messages at all, and a client with only outbound messages (staff sent,
  no reply yet), never show as unread.
