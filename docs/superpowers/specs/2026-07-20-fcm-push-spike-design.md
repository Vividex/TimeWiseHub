# FCM / Native Push Validation Spike — Design Spec

## Problem

Push notifications are completely disabled in both Tauri builds today. `PushPermission.tsx` and
`PushAutoPrompt.tsx` both gate out *any* Tauri environment (`'__TAURI_INTERNALS__' in window`),
falling back to "open in browser" messaging — not just Android, desktop too. The existing system
(`src/lib/push.ts`, standard Web Push via VAPID, `push_subscriptions` table) only reaches
browser tabs.

This is queued backlog: "web push won't work in Tauri Android WebView; FCM needed for
background/closed-app notifications."

## Why a spike, not the full feature, first

Real research (not assumption) surfaced a genuine unresolved risk before any full design could be
trusted: the most actively-maintained candidate plugin for native push
(`Choochmeque/tauri-plugin-notifications`, 72 stars, v0.4.6, active) has a documented API of only
`onNotificationReceived` (fires while the app is already running) and `onAction` (action *button*
taps) — no confirmed event for "the user tapped the notification body itself, here's its payload,
including from a cold start while the app was fully closed." That's the entire point of this
feature (matching what web push's `notificationclick` already does today: tap → land on the right
document/chat). A less-mature alternative (`yanqianglu/tauri-plugin-mobile-push`, 8 stars, no
releases) explicitly advertises this exact capability for Android but is far less proven overall.

Every candidate plugin in this space is small and young. Rather than design a full
schema/send-logic/UI architecture on an unverified assumption — the exact failure pattern this
project has hit before with Tauri (dev-tested ≠ real-device-true) — this spike exists purely to
answer, on the real Android app and the real desktop app, before the full feature is designed:

1. Does desktop Tauri's embedded WebView2 already support standard web push, making native push
   work unnecessary there entirely?
2. Does the leading Android plugin actually deliver a notification while the app is fully closed?
3. Does tapping that notification from a cold start give the app enough information to know which
   notification was tapped (so a future version can deep-link to a specific document/chat)?

## Scope

This spike produces: a small amount of scaffolding code (a debug token-display UI, a possible
platform-check relaxation for desktop), and a written record of what was actually observed on real
devices. It does **not** produce: server-side FCM sending logic, a new device-token schema, or
integration with the app's existing notification call sites (`notifySwmsAwaitingSignature`, chat,
etc.). Those are explicitly deferred to a follow-up spec, whose shape depends on what this spike
finds.

## Part 1 — Desktop webview check

Modify `src/components/PushPermission.tsx` and `src/components/PushAutoPrompt.tsx`'s Tauri
detection to distinguish desktop from Android, rather than excluding all Tauri uniformly. Tauri
exposes platform info via `@tauri-apps/plugin-os` (`type()` returns `'windows' | 'macos' | 'linux'
| 'android' | 'ios'`) — already installable without any native/Gradle/Firebase setup, pure JS
detection.

**Procedure:**
1. Add `@tauri-apps/plugin-os` (JS-only check needed for this test; if the desktop path turns out
   to work, this becomes the permanent fix — if not, it gets removed).
2. Temporarily change the gate from `'__TAURI_INTERNALS__' in window` to only trigger the
   "unsupported" state when the resolved platform is `android` (or `ios`), letting `windows` /
   `macos` / `linux` through to the existing web-push flow unchanged.
3. Build and run the actual desktop Tauri app (`pnpm tauri build` or the existing dev flow — per
   this project's standing note, a real build, not just `tauri dev`, since that's what previously
   missed a remote-content capability bug).
4. Enable push from within the running desktop app (same toggle UI that already exists).
5. Trigger one real push via the already-working `sendPushToUser()` (e.g. by using any existing
   notification-producing action, or a one-off manual call) while the desktop app window is
   minimized/backgrounded.
6. Observe: does a native OS notification appear?

**If yes:** desktop needs no native plugin work at all. The permanent fix is exactly the platform
check from step 2, kept in the codebase. Desktop is done.

**If no:** desktop goes into the same bucket as Android for the follow-up full-feature spec
(evaluate whether the same native plugin covers desktop, since `tauri-plugin-notifications`
advertises desktop support too).

## Part 2 — Android FCM validation

**Procedure:**
1. **Create a Firebase project** (manual, in the Firebase Console, using your Google account —
   free tier, no cost for this volume). Steps:
   - Go to console.firebase.google.com → "Add project" → name it (e.g. "TimeWiseHub") → accept
     defaults (Google Analytics can be skipped, not needed here).
   - Inside the project, click the Android icon to register an app. Package name must exactly
     match `com.vividex.timewisehub` (from `src-tauri/tauri.conf.json`'s `identifier`).
   - Download the generated `google-services.json`.
2. **Install the plugin.** Add to `src-tauri/Cargo.toml`:
   `tauri-plugin-notifications = { version = "0.4", features = ["push-notifications"] }`
   (exact version/feature-flag name to be confirmed against the plugin's current README at
   implementation time — it may have moved since this spec was written).
   Add the corresponding npm package (`tauri-plugin-notifications-api` or as named in its own
   docs) to `package.json`.
   Place `google-services.json` at `src-tauri/gen/android/app/google-services.json`.
   Add the Google Services Gradle plugin per the plugin's Android setup instructions.
   Add the plugin's required permissions to `src-tauri/capabilities/android.json` (alongside the
   existing `notification:*` permissions already there).
3. **Add a temporary debug token display.** A small addition to `src/app/settings/page.tsx` (or a
   standalone debug-only block), visible only to you: a button that calls
   `registerForPushNotifications()` and renders the returned token as selectable text on-screen,
   so it can be copied off the device.
4. **Build the real Android app** (per this project's standing rule: a real installed build, not
   `tauri dev` — this environment's actual failure mode is dev-testing missing capability bugs
   that only show up in the real installer).
5. **Get the token** from the debug UI, copy it.
6. **Send one test push** via the Firebase Console's Cloud Messaging → "Send test message" tool,
   targeting that token directly (no server code needed for this). Include a custom data field
   (e.g. `{"testRoute": "/dashboard"}`) to check payload access later.
7. **Test three app states:**
   - Foregrounded (app open, on screen)
   - Backgrounded (app open but not focused — home button, not swiped away)
   - Fully closed (swiped away from recent apps)
   For each, confirm whether a system notification appears.
8. **Test tapping the notification** from the fully-closed state specifically. Confirm: does the
   app launch? Does any available plugin event (`onNotificationReceived`, `onAction`, or anything
   else surfaced by the plugin) fire with the custom data (`testRoute`) accessible in JS? If
   nothing fires, check whether the plugin exposes the payload any other way (e.g. a "get launch
   notification" query on startup, common in other mobile push libraries for exactly this cold-start
   case).

## Success criteria / what this spike answers

| Question | How we'll know |
|---|---|
| Does desktop need native push at all? | Part 1's observed result |
| Does the plugin deliver while fully closed? | Part 2 step 7's fully-closed result |
| Can a cold-start tap be deep-linked? | Part 2 step 8's payload-access result |

## After the spike

Write a follow-up spec for the full feature, shaped by what was actually found:
- If tap-to-deep-link works: design the full schema (new token table or widened
  `push_subscriptions`), server-side dual-send logic (web push + FCM depending on registered
  device type), and wiring into every existing notification call site.
- If it doesn't work with this plugin: evaluate `tauri-plugin-mobile-push` specifically for its
  advertised `onNotificationTapped`, or decide with the user whether a v1 without deep-linking
  (tap opens the app to the Dashboard) is an acceptable starting point.
- If desktop's webview test passed: fold the two-line platform-check fix into that same follow-up
  work (or ship it immediately as its own tiny, separate fix, since it's fully decoupled from the
  Android plugin work).

## Non-goals (this spike only)

- No production notification types are wired to FCM yet — this is scaffolding + observation only.
- No new database schema.
- No changes to `src/lib/push.ts`'s existing send logic.
- The debug token-display UI is temporary and gets removed (or hidden behind a real dev-only
  gate) once the spike concludes — it is not a shipped feature.

## Testing / verification

No test runner in this repo. Verification is `pnpm run build` for the scaffolding code, plus the
manual device-testing procedure above — inherently manual, since "does a physical Android device
receive and correctly handle a push notification" isn't something a build or lint step can confirm.
