# Username & Nickname — Design Spec
**Date:** 2026-06-13
**Status:** Approved

## Problem

Two issues with the current identity model:

1. Chat messages and task assignments show the sender's **email address** because `full_name` is never collected at registration and the display falls back to `profiles.email`.
2. The app assumes a user is always in **exactly one org**. There is no UI to choose between orgs, which means a user invited to a second org would see scrambled data with no way to switch.

## Goals

1. Every user has a **username** (stable, unique handle) and an optional **nickname** (freely-editable display name). Chat and task assignment show `nickname ?? username` — email is never shown to peers.
2. Users in **multiple orgs** can select which org to enter at login. The active org is stored in a cookie and used to scope the chat provider.

## Out of Scope

- Sign-in via username (login remains email + password).
- Full org-scoped audit of all dashboard pages (time, expenses, etc.) — deferred to a future spec.
- @ mention system.

---

## Data Model

### New columns on `public.profiles`

| Column     | Type   | Constraints        | Purpose                                              |
|------------|--------|--------------------|------------------------------------------------------|
| `username` | `text` | `unique`, nullable | Stable handle set once at registration               |
| `nickname` | `text` | nullable           | Display name shown to peers; changeable in settings  |

`username` is nullable in the DB to support the migration gate (existing users fill it in on next login). Once set via the app it is never null again.

`full_name` is **unchanged** — it is used for payroll and invoices (legal name context). `username`/`nickname` are the social identity layer.

### Display resolution order (everywhere a user's name is shown to peers)

```
nickname ?? username
```

Never fall back to email for peer-facing display.

### Migration backfill

The migration SQL assigns usernames to the two demo accounts:

```sql
UPDATE public.profiles SET username = 'sam_rivers',   nickname = 'Sam Rivers'
  WHERE email = 'demo.manager@vividex.au';

UPDATE public.profiles SET username = 'jordan_avery', nickname = 'Jordan Avery'
  WHERE email = 'demo.employee@vividex.au';
```

All other existing users (`username IS NULL`) are routed through the `/setup-username` gate on their next login.

---

## Registration Flow (`/register`)

- Add a required **Username** field to the registration form (below email, above password).
- Client-side uniqueness check: query `profiles` for the typed username **on blur** (when the user leaves the field); show an inline "username taken" error immediately, before the submit attempt.
- Pass username via `options.data.username` to `supabase.auth.signUp()`.
- Update the `handle_new_user()` trigger to read `new.raw_user_meta_data->>'username'` and write it to `profiles.username`.
- The DB unique constraint on `username` is the final guard against races.

---

## Login Flow (`/login`)

After `signInWithPassword` succeeds, instead of immediately redirecting to `/dashboard`:

1. Query `profiles` for the current user — check `username IS NULL`.
2. If null → redirect to `/setup-username`.
3. If set → query `organisation_members` for the user's orgs.
   - 0 orgs → `/onboarding` (unchanged)
   - 1 org → set `active_org_id` cookie → `/dashboard`
   - 2+ orgs → `/select-org`

### `/setup-username` (new page)

- One field: Username (required, unique, same validation as registration).
- On submit: `UPDATE profiles SET username = $1 WHERE id = auth.uid()`.
- On success: continue to the org-count check above.
- Never shown again once username is set.

### `/select-org` (new page)

- Lists the user's orgs: name + their role in each.
- User clicks one → set `active_org_id` cookie → `/dashboard`.

---

## Active Org Cookie

- Name: `active_org_id`
- Set as an `HttpOnly` cookie via a Next.js Route Handler (not client-side `document.cookie`) after org selection, or auto-set in the login redirect for single-org users.
- Read in `DashboardLayout` via Next.js `cookies()`.
- Fallback: if cookie is missing or the user is no longer a member of that org, resolve to the user's first org and reset the cookie.

### What the cookie scopes

`DashboardLayout` reads the cookie and passes `orgId` as an explicit prop to:
- `ChatRealtimeProvider` — replaces the current `.maybeSingle()` with an explicit `org_id` filter.
- `DashboardShell` — can display the active org name in the nav.
- `FloatingWidgets` — assistant widget is scoped to the active org.

Individual dashboard pages (time, expenses, leave, etc.) are **not** changed in this spec — they continue to query by `auth.uid()`. This is safe for current users (all single-org). Multi-org scoping of those pages is a future spec.

---

## Chat Display Changes

### `ChatMember` type (`src/lib/chat/types.ts`)

Add `username: string` and `nickname: string | null`.

### `loadMembers()` in `ChatRealtimeProvider.tsx`

- Accept explicit `orgId` prop instead of calling `.maybeSingle()`.
- Add `username, nickname` to the `profiles` select.
- Build the member map with the new fields.

### `senderName()` in `MessageThread.tsx`

```ts
function senderName(members: ..., id: string): string {
  const m = members[id]
  return m?.nickname ?? m?.username ?? 'Unknown'
}
```

### Other chat components updated

- `ConversationList.tsx` — `label()` for DM rows
- `ChatRealtimeProvider.tsx` — `showInAppNotification()` title
- `NewDmDialog.tsx` — member list display
- Typing indicator in `MessageThread.tsx`

---

## Profile Settings

A new **Profile** card added to the existing `/settings` page (`src/app/settings/page.tsx`), inserted above `AccountSettingsForm`. The page already selects from `profiles` — add `username, nickname` to that select:

- **Username** — displayed read-only (stable handle).
- **Nickname** — editable text field; save button hits `UPDATE profiles SET nickname = $1 WHERE id = auth.uid()`. The existing RLS policy "Users can update their own profile" already covers this.
- Clearing nickname is allowed (display falls back to username).

---

## Existing Users Summary

| User | Email | Action |
|------|-------|--------|
| Demo manager | `demo.manager@vividex.au` | Migration sets `username = 'sam_rivers'`, `nickname = 'Sam Rivers'` |
| Demo employee | `demo.employee@vividex.au` | Migration sets `username = 'jordan_avery'`, `nickname = 'Jordan Avery'` |
| Admin | `admin@vividex.au` | Prompted via `/setup-username` on next login |
| Scott | `scott@sg1consulting.com.au` | Prompted via `/setup-username` on next login |

---

---

## Avatar

Users can set a profile picture in two ways, both accessible from a new **Avatar** card in `/settings`:

### Option A — Photo upload
Upload a real photo → stored in Supabase Storage bucket `avatars` (public, path `{userId}/avatar`) → URL saved to `profiles.avatar_url`.

### Option B — Avatar builder
Select from visual pickers for hair style, hair colour, skin tone, accessories (glasses), and facial hair. Configuration stored as `avatar_config jsonb` on `profiles`. The avatar is rendered client-side from this config using the **DiceBear** library (`@dicebear/core` + `@dicebear/collection`, MIT licensed, no external API calls). Setting an avatar config clears `avatar_url`, and vice versa.

### Display priority (everywhere a user's face appears)
```
avatar_url (photo) → avatar_config (DiceBear SVG) → initials fallback
```

### `UserAvatar` component
Reusable `src/components/UserAvatar.tsx` — accepts `avatarUrl`, `avatarConfig`, `name`, and `size` props. Used in: chat message thread, conversation list, new DM dialog, and the settings page preview.

### New DB additions (added to schema-044)
| Column | Type | Purpose |
|--------|------|---------|
| `avatar_config` | `jsonb` | Stored DiceBear option selections |

Plus: create `avatars` storage bucket (public) with upload/delete policies scoped to `auth.uid()`.

### AvatarConfig shape stored in DB
```json
{
  "top": "bigHair",
  "hairColor": "brown",
  "skin": "light",
  "accessories": "blank",
  "facialHair": "blank"
}
```

### `ChatMember` additions
Add `avatar_url: string | null` and `avatar_config: Record<string, string> | null` — fetched in `loadMembers()` and used by `UserAvatar` in chat.

---

## Verification

- `pnpm run build` passes clean.
- Register a new account → username field present, uniqueness error shown on duplicate.
- Log in as existing user with null username → redirected to `/setup-username`, then to dashboard.
- Log in as a single-org user → goes straight to dashboard, no org picker.
- (Future) Log in as a multi-org user → `/select-org` shown.
- Chat messages show `nickname` (or `username` if no nickname) — never email.
- Change nickname in settings → chat immediately reflects new name on next load.
- Demo accounts show correct names in chat without setup prompt.
