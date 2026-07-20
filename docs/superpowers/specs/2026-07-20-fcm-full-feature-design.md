# FCM / Native Push Full Feature — Design Spec

## Problem

Push notifications work in browser tabs (standard Web Push via VAPID, `src/lib/push.ts`) but are
completely disabled in the Tauri app on both Android and desktop. The validation spike
(`docs/superpowers/specs/2026-07-20-fcm-push-spike-design.md`) confirmed on real devices:

- Desktop Tauri's WebView2 genuinely lacks `Notification`/`navigator.serviceWorker` — standard
  web push cannot work there at all, not just Android.
- `tauri-plugin-notifications` (Choochmeque) delivers correctly in all three Android app states
  (foreground/background/fully closed) and supports real tap-to-deep-link from a cold start via
  `onNotificationClicked`, carrying the notification's custom data payload intact.

This phase turns that validated plugin choice into a real, shipped feature.

## Architecture

All 7 files that currently trigger a push notification (`swms-notifications.ts`,
`chat/notify.ts`, `invoice-notifications.ts`, `task-notifications.ts`,
`api/notifications/upcoming/route.ts`, `api/webhooks/resend-inbound/route.ts`) call one shared
function, `sendPushToUser(userId, payload)` in `src/lib/push.ts`, with a consistent
`{ title, body, url?, tag? }` payload. None of those 7 call sites need to change — `sendPushToUser`
becomes the single place that fans out to both delivery mechanisms:

- **Web push** (unchanged): queries `push_subscriptions`, sends via the existing `web-push`
  package.
- **Native push** (new): queries a new `push_device_tokens` table, sends via Firebase Admin SDK to
  each registered FCM token.

A user gets a notification on every device/surface they've registered — a phone with the Android
app open in the background AND a browser tab both signed up for push both fire, same as a user
today with two browser tabs subscribed already gets two notifications. No de-duplication needed;
this matches existing multi-subscription behavior.

## Schema

New table, not a widened `push_subscriptions` — that table's `p256dh`/`auth` columns are
meaningless for FCM's single-token model, and forcing both shapes into one table means nullable
columns whose meaning depends on a discriminator, messier than two small dedicated tables:

```sql
create table push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null, -- 'android' | 'windows' | 'macos' | 'linux', from @tauri-apps/plugin-os
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table push_device_tokens enable row level security;

create policy "Users can manage their own push device tokens"
  on push_device_tokens for all
  using (auth.uid() = user_id);
```

Mirrors `push_subscriptions`' existing RLS pattern exactly (single `ALL`-command, own-row policy —
confirmed via the live table's actual policy before writing this). `platform` is stored for future
debugging/analytics ("why isn't push working for this user") — sending doesn't need to branch on
it, Firebase Admin SDK's `send()` call is identical regardless of platform.

## Client-side registration

The spike's P-1 finding changes the branching logic from what Task 1 shipped: since standard web
push doesn't work in **any** Tauri context (not just Android/iOS), `PushPermission.tsx` and
`PushAutoPrompt.tsx`'s gate goes back to treating all Tauri as unsupported *for web push*
specifically — but now with a second, parallel path that activates for exactly that case:

- **Browser**: existing flow, completely unchanged.
- **Tauri (any platform)**: new flow — call `registerForPushNotifications()` from
  `@choochmeque/tauri-plugin-notifications-api`, get the FCM token, `POST` it to a new
  `/api/push/fcm-subscribe` route (mirrors the existing `/api/push/subscribe` route's shape:
  service-role upsert scoped to the authenticated user, `onConflict: 'user_id, token'`).

Same visible "Browser push" toggle UI in Settings — it's still one control, just switches
mechanism internally based on `'__TAURI_INTERNALS__' in window`. `PushAutoPrompt.tsx` gets the same
treatment for its silent first-visit auto-subscribe behavior.

## Deep-linking

A new always-mounted component (alongside `PushAutoPrompt` in `src/app/dashboard/layout.tsx`)
registers `onNotificationClicked` once, for the lifetime of the app, and calls `router.push(data.
url)` when it fires — reusing the exact `url` field every existing payload already carries (the
same field `sw.js`'s web-push `notificationclick` handler already uses), so no call site needs a
new field. FCM's data payload only supports string values, which matches `NotificationClickedData.
data?: Record<string, string>` — the server sends `url` as a plain string in the FCM message's data
payload, same as it already does implicitly via the payload's JSON body for web push.

## Server-side sending

`sendPushToUser` gains a second branch using Firebase Admin SDK (`firebase-admin` npm package, new
dependency, free/open-source). Credential handling, per discussion: the downloaded Firebase service
account JSON gets base64-encoded once and stored as `FIREBASE_SERVICE_ACCOUNT_B64` in Vercel env
vars — chosen over storing it raw specifically because the credential contains a multi-line RSA
private key, a well-documented class of secret prone to newline corruption on re-paste/rotation;
base64 removes that failure mode permanently. Decoded once at module load, matching the existing
`webpush.setVapidDetails()` top-of-file initialization pattern already in `push.ts`.

Stale-token handling mirrors the existing web-push 410-Gone cleanup: Firebase Admin SDK's `send()`
throws a recognizable error code (`messaging/registration-token-not-registered`) for tokens that no
longer exist — caught the same way the existing `statusCode === 410` check is, deleting the stale
row from `push_device_tokens`.

## Real gap carried forward from the spike, needs testing in this phase

The spike only validated the native plugin on **Android**. Desktop was tested for *standard web
push* (negative result) — whether `tauri-plugin-notifications` itself works for desktop push
delivery is unverified. This phase's implementation plan needs an explicit real-device desktop
test (same rigor as the Android spike: real build, real Firebase test message, check delivery)
before desktop is considered done, not an assumption carried from the plugin's own multi-platform
claims.

## Cleanup

`src/components/debug/FcmTokenDebug.tsx` and its call site in `src/app/settings/page.tsx` are
removed — its `registerForPushNotifications()` call moves into the permanent auto-prompt flow
described above; its event-log UI was spike-only scaffolding, not needed once the plugin's behavior
is already confirmed and shipped.

## Non-goals

- No changes to the 7 existing notification-triggering call sites — they're unaffected by this
  phase's changes, `sendPushToUser`'s signature doesn't change.
- No changes to browser web push at all.
- No per-notification-type custom deep-link routing beyond what the existing `url` field already
  provides — if a specific notification type needs smarter navigation later, that's separate scope.
- No notification preference granularity (e.g. "mute chat but not SWMS reminders") — out of scope,
  same on/off toggle as today.

## Testing / verification

No test runner in this repo — verification is `pnpm run build` for code, plus real-device manual
testing for both platforms (per the standing project rule that dev mode can't catch capability/
native-build issues): send a real production-triggered notification (not just a Firebase Console
test message) to a real Android build and a real desktop build, confirm delivery and that tapping
it navigates to the right in-app page via the `url` field, for at least one notification type
(e.g. a SWMS document awaiting signature).
