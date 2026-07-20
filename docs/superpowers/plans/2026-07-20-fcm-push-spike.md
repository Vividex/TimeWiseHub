# FCM / Native Push Validation Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer, on real devices, whether desktop Tauri already supports standard web push and whether the leading Android native-push plugin (`tauri-plugin-notifications` by Choochmeque) can deliver a notification to a fully-closed app and give the app enough information on tap to eventually deep-link — before designing the full FCM feature.

**Architecture:** Two independent, sequential tasks. Task 1 relaxes the existing "Tauri = no push" gate to let desktop through to the already-working web-push system, tested on a real desktop build. Task 2 swaps the unused official `tauri-plugin-notification` for the community `tauri-plugin-notifications` (adds FCM), adds a temporary on-screen debug token display, and walks through real Firebase Console + real Android device testing. No server-side send logic or schema changes — this plan produces scaffolding and a recorded observation, not a shipped feature.

**Tech Stack:** Tauri v2 (Rust + Android/Gradle), `@tauri-apps/plugin-os`, `@choochmeque/tauri-plugin-notifications-api`, Firebase Cloud Messaging (Console-only for this spike, no Admin SDK yet).

## Global Constraints

- No test runner in this repo — verification gate is `pnpm run build` (tsc + eslint) for code changes, plus manual device testing for anything requiring a real Tauri build (per this project's standing rule: `tauri dev` cannot catch capability/native bugs that only show up in the real installed app).
- Windows dev environment — use the Write/Edit tools for files containing single quotes, not bash heredocs.
- No database migration in this plan.
- No production notification call sites are touched in this plan.
- The debug token UI added in Task 2 is temporary scaffolding, not a shipped feature — flagged as such in its own code and removed or hard-gated once the spike concludes.

---

## Task 1: Desktop webview push test (platform-aware gate)

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `package.json`
- Modify: `src/components/PushPermission.tsx`
- Modify: `src/components/PushAutoPrompt.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by Task 2 — these two tasks are independent and could be done in either order, but Task 1 is listed first since it might make Task 2's desktop-related work unnecessary.

### Step 1: Add the OS-detection plugin (Rust side)

Find in `src-tauri/Cargo.toml`:
```toml
[dependencies]
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
log = "0.4"
tauri = { version = "2.11.2", features = [] }
tauri-plugin-log = "2"
tauri-plugin-notification = "2"
```

Replace with:
```toml
[dependencies]
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
log = "0.4"
tauri = { version = "2.11.2", features = [] }
tauri-plugin-log = "2"
tauri-plugin-notification = "2"
tauri-plugin-os = "2"
```

### Step 2: Register the plugin

Find in `src-tauri/src/lib.rs`:
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    .setup(|app| {
```

Replace with:
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_os::init())
    .setup(|app| {
```

### Step 3: Add the capability permission

Find in `src-tauri/capabilities/default.json`:
```json
  "permissions": [
    "core:default",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-close"
  ]
```

Replace with:
```json
  "permissions": [
    "core:default",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-close",
    "os:default"
  ]
```

### Step 4: Add the JS package

Find in `package.json`'s `dependencies` section the line:
```json
    "@tauri-apps/api": "^2.11.0",
```

Replace with:
```json
    "@tauri-apps/api": "^2.11.0",
    "@tauri-apps/plugin-os": "^2.0.0",
```

Run: `pnpm install`
Expected: lockfile updates, no errors.

### Step 5: Relax the gate in `PushPermission.tsx`

Find in `src/components/PushPermission.tsx`:
```typescript
'use client'

import { useState, useEffect } from 'react'

function urlBase64ToUint8Array(base64String: string) {
```

Replace with:
```typescript
'use client'

import { useState, useEffect } from 'react'
import { type as osType } from '@tauri-apps/plugin-os'

function urlBase64ToUint8Array(base64String: string) {
```

Find:
```typescript
  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) { setState('unsupported'); return }
    if (!('Notification' in window) || !('serviceWorker' in navigator)) { setState('unsupported'); return }
    if (Notification.permission === 'denied') { setState('denied'); return }
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => {
        setState(sub ? 'subscribed' : 'unknown')
      })
    )
  }, [])
```

Replace with:
```typescript
  useEffect(() => {
    // SPIKE: only Android/iOS are known-unsupported for standard web push. Desktop Tauri's
    // embedded WebView2/WKWebView may already support it -- this spike is testing that
    // assumption instead of blocking all Tauri uniformly like before.
    if ('__TAURI_INTERNALS__' in window && ['android', 'ios'].includes(osType())) {
      setState('unsupported')
      return
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator)) { setState('unsupported'); return }
    if (Notification.permission === 'denied') { setState('denied'); return }
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => {
        setState(sub ? 'subscribed' : 'unknown')
      })
    )
  }, [])
```

### Step 6: Relax the gate in `PushAutoPrompt.tsx`

Find in `src/components/PushAutoPrompt.tsx`:
```typescript
'use client'

import { useEffect } from 'react'

function urlBase64ToUint8Array(base64String: string) {
```

Replace with:
```typescript
'use client'

import { useEffect } from 'react'
import { type as osType } from '@tauri-apps/plugin-os'

function urlBase64ToUint8Array(base64String: string) {
```

Find:
```typescript
  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) return
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    if (Notification.permission !== 'default') return
```

Replace with:
```typescript
  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window && ['android', 'ios'].includes(osType())) return
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    if (Notification.permission !== 'default') return
```

### Step 7: Verify the build

Run: `pnpm run build`
Expected: passes clean, no type errors.

### Step 8: Real desktop build + manual test

This step cannot be automated — it needs your own machine and the actual Tauri desktop build.

1. Build and run the actual desktop app (not `tauri dev` — a real build, per this project's
   standing rule that dev mode misses capability bugs the real installer hits):
   ```
   pnpm tauri build
   ```
   Then run the built executable from `src-tauri/target/release/`.
2. Open Settings in the running desktop app. You should see the "Browser push" toggle (previously
   hidden entirely in Tauri) now visible.
3. Turn it on, grant the OS permission prompt if one appears.
4. Trigger a real push while the desktop app window is minimized. The simplest way: use any
   action in the app that already calls `sendPushToUser()` (e.g. acknowledging a SWMS/JSA
   document sends one via `notifySwmsAwaitingSignature`, if you have a document awaiting your own
   signature) — or ask the conductor to trigger one directly via Supabase MCP by calling the
   existing send logic for your own user ID during this session.
5. Observe: does a native OS notification appear while the window is minimized?

**Record the result** (in the commit message per Step 9) — this determines whether desktop needs
any of Task 2's work at all.

### Step 9: Commit

If the desktop test in Step 8 succeeded, keep the change and commit it as the permanent fix:
```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json package.json pnpm-lock.yaml src/components/PushPermission.tsx src/components/PushAutoPrompt.tsx
git commit -m "fix: desktop Tauri push notifications work via existing web push -- only Android/iOS need native FCM

Confirmed via real desktop build test: WebView2 supports the standard
Push API and Service Workers, so desktop doesn't need the native
plugin work Android does. Relaxes the blanket Tauri exclusion in
PushPermission/PushAutoPrompt to only apply to android/ios."
```

If the desktop test in Step 8 failed (no notification while minimized), still commit the code
(it's a harmless, verified-safe change that at minimum makes the toggle correctly available where
it should be) but note the negative result plainly:
```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json package.json pnpm-lock.yaml src/components/PushPermission.tsx src/components/PushAutoPrompt.tsx
git commit -m "spike: desktop webview push test -- result negative, needs native plugin like Android

Real desktop build test showed no notification delivery while
minimized despite a successful subscribe. Desktop goes into the same
bucket as Android for the follow-up full-feature work. Code kept since
it correctly narrows the unsupported gate to android/ios regardless."
```

---

## Task 2: Android FCM scaffold + device validation

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/android.json`
- Modify: `package.json`
- Create: `src/components/debug/FcmTokenDebug.tsx`
- Modify: `src/app/settings/page.tsx`
- Manual: `src-tauri/gen/android/app/google-services.json` (you place this file — see Step 1)
- Manual: `src-tauri/gen/android/build.gradle.kts` (you or the conductor edits this generated file — see Step 5)
- Manual: `src-tauri/gen/android/app/build.gradle.kts` (see Step 5)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: a recorded observation (foreground/background/closed delivery result; cold-start tap
  payload-access result) that determines the shape of the follow-up full-feature spec.

### Step 1: Create the Firebase project (you do this)

1. Go to `console.firebase.google.com`, sign in with your Google account.
2. Click "Add project", name it (e.g. "TimeWiseHub"), skip Google Analytics (not needed).
3. Inside the project, click the Android icon ("Add app") to register an Android app.
4. For the package name, enter exactly: `com.vividex.timewisehub` (must match
   `src-tauri/tauri.conf.json`'s `identifier` field exactly, or the token registration will fail
   silently on the device).
5. Download the generated `google-services.json` when prompted.
6. Place it at `src-tauri/gen/android/app/google-services.json` in this repo (this directory only
   exists after the Android project has been generated at least once via
   `pnpm tauri android init` / a prior Android build — if it doesn't exist yet, generate it first).

### Step 2: Swap the notification plugin (Rust side)

The official `tauri-plugin-notification` is currently registered but unused from JS anywhere in
this codebase (confirmed via grep before writing this plan) — safe to fully replace rather than
run two overlapping native notification plugins side by side.

Find in `src-tauri/Cargo.toml` (after Task 1's edit, if done first):
```toml
tauri-plugin-notification = "2"
```

Replace with:
```toml
tauri-plugin-notifications = { version = "0.4", features = ["push-notifications"] }
```

Find in `src-tauri/src/lib.rs`:
```rust
    .plugin(tauri_plugin_notification::init())
```

Replace with:
```rust
    .plugin(tauri_plugin_notifications::init())
```

### Step 3: Swap the capability permissions

Find `src-tauri/capabilities/android.json` (full current content):
```json
{
  "$schema": "../gen/schemas/android-schema.json",
  "identifier": "android",
  "description": "Android-specific plugin permissions",
  "platforms": ["android"],
  "windows": ["main"],
  "permissions": [
    "core:default",
    "notification:default",
    "notification:allow-is-permission-granted",
    "notification:allow-request-permission",
    "notification:allow-notify"
  ]
}
```

Replace the whole file with:
```json
{
  "$schema": "../gen/schemas/android-schema.json",
  "identifier": "android",
  "description": "Android-specific plugin permissions",
  "platforms": ["android"],
  "windows": ["main"],
  "remote": {
    "urls": [
      "https://timewisehub.com.au",
      "https://www.timewisehub.com.au"
    ]
  },
  "permissions": [
    "core:default",
    "notifications:default"
  ]
}
```

**Real finding during real-device testing, not caught by build verification:** the first version of
this file (without the `remote` block above) built and deployed fine, but every plugin command
failed at runtime with `Command plugin:notifications|is_permission_granted not allowed by ACL`.
Tauri capabilities without a `remote` block only apply to bundled/local content — since this app's
window loads the remote `https://timewisehub.com.au` URL (`src-tauri/tauri.conf.json`'s
`windows[0].url`), a capability needs its own explicit `remote` block to apply to that window's
content at all. `default.json` already had one (why Task 1's `os:default` permission worked
without issue); `android.json` didn't. `pnpm run build` can't catch this — it's a runtime-only ACL
check on the real device.

### Step 4: Add the JS package

Find in `package.json`'s `dependencies` section the line:
```json
    "@tauri-apps/api": "^2.11.0",
```

Replace with (if Task 1 already added the `plugin-os` line, add this one below it instead):
```json
    "@tauri-apps/api": "^2.11.0",
    "@choochmeque/tauri-plugin-notifications-api": "^0.4.0",
```

Run: `pnpm install`
Expected: lockfile updates, no errors.

### Step 5: Android Gradle setup (generated files — you or the conductor edits these directly)

These files live under `src-tauri/gen/android/`, which is generated output (not hand-authored
from scratch), so there's no Find/Replace template here — read the current file and add these
exact pieces.

In `src-tauri/gen/android/build.gradle.kts`, inside the top-level `buildscript { dependencies { ... } }`
block, add:
```kotlin
classpath("com.google.gms:google-services:4.4.2")
```

At the very bottom of `src-tauri/gen/android/app/build.gradle.kts`, add:
```kotlin
apply(plugin = "com.google.gms.google-services")
```

### Step 6: Temporary debug token display

Create `src/components/debug/FcmTokenDebug.tsx`:
```tsx
'use client'

import { useEffect, useState } from 'react'
import {
  isPermissionGranted,
  requestPermission,
  registerForPushNotifications,
  onNotificationReceived,
  onAction,
  onNotificationClicked,
} from '@choochmeque/tauri-plugin-notifications-api'

// SPIKE-ONLY: temporary scaffolding to read out a real FCM device token on-screen so it can be
// copied and used to send a test push from the Firebase Console, and to observe whatever event
// data the plugin actually surfaces when a notification arrives or is tapped -- the whole point
// of Task 2 Step 8's device test. Not a shipped feature -- remove this file and its one call site
// in src/app/settings/page.tsx once the spike concludes.
export default function FcmTokenDebug() {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [events, setEvents] = useState<string[]>([])

  useEffect(() => {
    // Log whatever shape each event actually carries -- the plugin's docs don't pin this down,
    // so this dumps the full event as JSON rather than assuming a specific payload shape.
    const receivedPromise = onNotificationReceived(event => {
      setEvents(prev => [`onNotificationReceived: ${JSON.stringify(event)}`, ...prev])
    })
    const actionPromise = onAction(event => {
      setEvents(prev => [`onAction: ${JSON.stringify(event)}`, ...prev])
    })
    // This is the one that answers the spike's central question: does tapping a notification
    // (including from a cold start) give the app the custom data payload needed to deep-link.
    const clickedPromise = onNotificationClicked(data => {
      setEvents(prev => [`onNotificationClicked: ${JSON.stringify(data)}`, ...prev])
    })
    return () => {
      receivedPromise.then(listener => listener.unregister())
      actionPromise.then(listener => listener.unregister())
      clickedPromise.then(listener => listener.unregister())
    }
  }, [])

  async function handleGetToken() {
    setLoading(true)
    setError(null)
    try {
      let granted = await isPermissionGranted()
      if (!granted) {
        const permission = await requestPermission()
        granted = permission === 'granted'
      }
      if (!granted) { setError('Permission not granted.'); return }
      const t = await registerForPushNotifications()
      setToken(t)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
      <p className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">Spike debug -- FCM token</p>
      <button
        type="button"
        onClick={handleGetToken}
        disabled={loading}
        className="mt-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        {loading ? 'Getting token…' : 'Get FCM token'}
      </button>
      {token && (
        <p className="mt-2 select-all break-all rounded-lg bg-white p-2 text-xs text-slate-900 dark:bg-slate-900 dark:text-slate-100">
          {token}
        </p>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
      {events.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Events seen this session (newest first):</p>
          {events.map((e, i) => (
            <p key={i} className="select-all break-all rounded-lg bg-white p-2 text-xs text-slate-900 dark:bg-slate-900 dark:text-slate-100">{e}</p>
          ))}
        </div>
      )}
    </div>
  )
}
```

Note: this component's on-screen event log only captures events that fire *while the component is
mounted* (app open, on the Settings screen) — it cannot show what happened during a cold start
from a fully-closed tap, since nothing was mounted yet to listen. For Step 8's cold-start test,
check whether the app navigates anywhere on its own after that kind of launch, and separately
check for any launch-time API this plugin exposes for reading the notification that triggered a
cold start (search its README for something like "get launch notification" or check its exported
function list again at implementation time) — the events log here is for the foreground/background
cases and for confirming the listener API shape itself, not a full answer to the cold-start
question by itself.

**Real finding during Task 2's build verification, not caught by the design-stage README research:**
the plugin's actual shipped TypeScript API (`node_modules/.pnpm/@choochmeque+tauri-plugin-notifications-api@0.4.6/.../dist-js/index.d.ts`)
exports a third listener the fetched README summary never surfaced —
`onNotificationClicked(cb: (data: NotificationClickedData) => void)`, where
`NotificationClickedData = { id: number; data?: Record<string, string> }`. This is exactly the
"tap the notification body, get its custom payload" event the spec's whole risk section was about
— the AI-summarized README research said no such event was documented; the real `.d.ts` says
otherwise. Added it to the component above. Also: the correct cleanup method on `PluginListener`
(from `@tauri-apps/api/core`) is `.unregister()`, not `.unlisten()` as originally drafted — a real
type error caught by `pnpm run build`, not a Codex transcription error.

Find in `src/app/settings/page.tsx`:
```typescript
import PushPermission from '@/components/PushPermission'
```

Replace with:
```typescript
import PushPermission from '@/components/PushPermission'
import FcmTokenDebug from '@/components/debug/FcmTokenDebug'
```

Find:
```typescript
        <div className="mt-4"><PushPermission /></div>
```

Replace with:
```typescript
        <div className="mt-4"><PushPermission /></div>
        <div className="mt-4"><FcmTokenDebug /></div>
```

### Step 7: Verify the build

Run: `pnpm run build`
Expected: passes clean, no type errors. (This verifies the JS/TS side only -- the Rust/Android
side can only be verified by actually building the Android app in Step 8.)

### Step 8: Real Android build + device validation (you do this)

This cannot be automated — it needs a real Android build and a real device.

1. Build the Android app for real (per this project's standing rule against trusting dev mode for
   capability bugs):
   ```
   pnpm tauri android build
   ```
   (Set `JAVA_HOME` and signing env vars first per this project's established Android build
   requirement.) Install the resulting APK on your test device.
2. Open Settings in the app, tap "Get FCM token" under the amber "Spike debug" box.
3. Grant the notification permission prompt if one appears.
4. Copy the displayed token off the device (long-press to select, or note it down).
5. In the Firebase Console, go to your project → Cloud Messaging → "Send test message" (or
   "Send your first message" → "Send test message" from a draft campaign).
6. Paste the token as the target. Fill in a title/body. Under "Additional options" → custom data,
   add a key `testRoute` with value `/dashboard` (or any test string).
7. Send it. Test three app states one at a time, sending a fresh test message for each:
   - **Foregrounded**: app open and on screen. Does anything appear/log?
   - **Backgrounded**: app open, home button pressed (not swiped away). Does a system notification
     appear?
   - **Fully closed**: app swiped away from recent apps entirely. Does a system notification still
     appear?
8. Repeat for the **foregrounded** and **backgrounded** states specifically: after tapping/
   receiving those, reopen Settings and check `FcmTokenDebug.tsx`'s on-screen "Events seen this
   session" log -- specifically look for `onNotificationClicked` (the listener that answers the
   deep-link question -- it exists in the plugin's real shipped API, found during this plan's own
   build verification, and carries `{ id, data }` where `data` should contain the `testRoute`
   value you set). `onNotificationReceived`/`onAction` firing too is fine, just not the deciding
   signal.
9. From the **fully-closed** state specifically: tap the notification. Does the app launch? Once
   it's open, check the same events log -- did `onNotificationClicked` fire with the `testRoute`
   data, even from that cold start? (It may be empty if the listener wasn't registered in time --
   that itself is a real, useful finding, not a test failure, and would mean the follow-up spec
   needs a different mechanism for the cold-start case specifically, e.g. checking whether the
   plugin or `@tauri-apps/plugin-deep-link` exposes a way to read "the notification/URL that
   launched the app" at startup, separate from the live-listener API.)

**Record what you observe** for all of step 7's three states and steps 8-9's tap/event behavior —
this is the actual deliverable of this task.

### Step 9: Commit

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/android.json package.json pnpm-lock.yaml src/components/debug/FcmTokenDebug.tsx src/app/settings/page.tsx .gitignore
git commit -m "spike: Android FCM scaffold + device validation

Swapped the unused official tauri-plugin-notification for
tauri-plugin-notifications (Choochmeque, adds FCM). Added a temporary
debug token display in Settings. Real-device results: <fill in what
was actually observed for foreground/background/closed delivery and
cold-start tap payload access>."
```

Do not commit `src-tauri/gen/android/app/google-services.json` — it's a per-Firebase-project
credential file. `.gitignore` (line 41-42) confirms `src-tauri/gen/` is intentionally committed as
a whole (the Android project living there has custom edits already tracked), so this file won't
be excluded automatically. Before Step 9's commit, add this one line to `.gitignore`:
```
src-tauri/gen/android/app/google-services.json
```
and include that `.gitignore` change in the same commit.

---

## After both tasks: report back

Once both tasks are done (or Task 1's result makes Task 2 partially moot for desktop), summarize
for the user:
- Desktop: does it need native push, or was the two-line gate fix sufficient?
- Android: did FCM deliver in all three app states?
- Android: could a cold-start tap be correlated with its notification payload?

This determines whether the next spec designs the full feature around this plugin as-is, evaluates
`tauri-plugin-mobile-push` as a fallback for tap-to-deep-link specifically, or proceeds with a
simpler "tap opens the Dashboard, no deep-link" v1.
