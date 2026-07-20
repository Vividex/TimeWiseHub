# FCM / Native Push Full Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make push notifications actually work in the Tauri app (Android and desktop) by adding a
second delivery mechanism (FCM via `tauri-plugin-notifications`) alongside the existing, unchanged
browser web-push system, sharing the same `sendPushToUser()` call sites and the same `url`
deep-link field.

**Architecture:** `sendPushToUser()` in `src/lib/push.ts` gains a second branch that sends via
Firebase Admin SDK to tokens stored in a new `push_device_tokens` table, alongside its existing
web-push branch — none of the 7 existing call sites change. Client-side, `PushPermission.tsx`/
`PushAutoPrompt.tsx` branch on Tauri-or-not to register through the native plugin instead of the
browser Push API. A new always-mounted component handles `onNotificationClicked` for deep-linking.

**Tech Stack:** `firebase-admin` (new), `tauri-plugin-notifications`/`@choochmeque/tauri-plugin-notifications-api` (already installed from the spike), Supabase, Next.js API routes.

## Global Constraints

- No test runner in this repo — verification is `pnpm run build` (tsc + eslint) plus real-device
  manual testing for anything Tauri-native, per this project's standing rule that dev mode misses
  capability/native-build bugs the real installer hits.
- Windows dev environment — use Write/Edit for files with single quotes in JSX, not bash heredocs.
- The Firebase service account credential is stored as `FIREBASE_SERVICE_ACCOUNT_B64` in Vercel —
  base64-encoded (not raw JSON), decided specifically because it contains a multi-line RSA private
  key prone to newline corruption on re-paste.
- FCM sending must degrade gracefully if `FIREBASE_SERVICE_ACCOUNT_B64` isn't set (e.g. before the
  user has configured it) — existing web push must keep working unaffected, never a hard crash.
- No changes to any of the 7 existing notification call sites (`swms-notifications.ts`,
  `chat/notify.ts`, `invoice-notifications.ts`, `task-notifications.ts`,
  `api/notifications/upcoming/route.ts`, `api/webhooks/resend-inbound/route.ts`) — confirmed via
  grep before writing this plan, all use the same `{ title, body, url?, tag? }` payload shape.

---

## Task 1: Database migration — `push_device_tokens` table

**Files:**
- Create: `supabase/schema-113-push-device-tokens.sql`
- Apply: via Supabase MCP `apply_migration` (project id `sdwwlnnsijcadkdwsvud`)

**Interfaces:**
- Produces: table `push_device_tokens(id uuid, user_id uuid, token text, platform text, created_at
  timestamptz)`, unique on `(user_id, token)`, RLS: `auth.uid() = user_id` for all commands
  (mirrors `push_subscriptions`' existing policy exactly — confirmed via `pg_policies` before
  writing this plan).

- [ ] **Step 1: Write the migration file**

Create `supabase/schema-113-push-device-tokens.sql`:
```sql
-- FCM/native push device tokens, separate from push_subscriptions (which is shaped for standard
-- web push -- endpoint/p256dh/auth -- meaningless for FCM's single-token model).
create table push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table push_device_tokens enable row level security;

create policy "Users can manage their own push device tokens"
  on push_device_tokens for all
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply this exact SQL via `apply_migration` with `project_id: sdwwlnnsijcadkdwsvud` and
`name: push_device_tokens`.

- [ ] **Step 3: Verify**

Run (via Supabase MCP `execute_sql`):
```sql
select policyname, cmd, qual from pg_policies where tablename = 'push_device_tokens';
```
Expected: one row, `policyname = 'Users can manage their own push device tokens'`, `cmd = 'ALL'`,
`qual = '(auth.uid() = user_id)'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-113-push-device-tokens.sql
git commit -m "feat: add push_device_tokens table for FCM/native push"
```

---

## Task 2: Server-side FCM sending + registration endpoint

**Files:**
- Modify: `package.json`
- Modify: `src/lib/push.ts` (full-file replacement)
- Create: `src/app/api/push/fcm-subscribe/route.ts`

**Interfaces:**
- Consumes: `push_device_tokens` table from Task 1.
- Produces: `sendPushToUser(userId: string, payload: PushPayload)` — same exported name/signature
  as before, now sends to both mechanisms. `POST /api/push/fcm-subscribe` (body
  `{ token: string, platform: string }`) and `DELETE /api/push/fcm-subscribe` (no body — removes
  all of the authenticated user's native tokens) — consumed by Task 3's client components.

### Step 1: Add the dependency

Find in `package.json`'s `dependencies` section the line:
```json
    "@fontsource/poppins": "^5.2.7",
```

Replace with:
```json
    "@fontsource/poppins": "^5.2.7",
    "firebase-admin": "^13.0.0",
```

Run: `pnpm install`
Expected: lockfile updates, no errors.

### Step 2: Rewrite `push.ts` for dual-send

Replace the full contents of `src/lib/push.ts`:
```typescript
import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase-service'
import type { Messaging } from 'firebase-admin/messaging'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
}

// Lazily initialized -- if FIREBASE_SERVICE_ACCOUNT_B64 isn't set (e.g. before it's been
// configured in Vercel), this stays null and native sends are silently skipped. Web push must
// keep working unaffected either way, never a hard crash over an optional second channel.
let messagingPromise: Promise<Messaging | null> | null = null

async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_B64) return null
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const { initializeApp, cert, getApps } = await import('firebase-admin/app')
      const { getMessaging } = await import('firebase-admin/messaging')
      const serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64!, 'base64').toString('utf-8')
      )
      const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) })
      return getMessaging(app)
    })()
  }
  return messagingPromise
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const service = createServiceClient()
  const [{ data: subs }, { data: tokens }] = await Promise.all([
    service.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId),
    service.from('push_device_tokens').select('token').eq('user_id', userId),
  ])

  const staleEndpoints: string[] = []
  const staleTokens: string[] = []

  const webPushSends = (subs ?? []).map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
    } catch (err: unknown) {
      // 410 Gone = subscription expired
      if ((err as { statusCode?: number }).statusCode === 410) staleEndpoints.push(sub.endpoint)
    }
  })

  const nativeSend = (async () => {
    if (!tokens || tokens.length === 0) return
    const messaging = await getFirebaseMessaging()
    if (!messaging) return
    await Promise.allSettled(tokens.map(async row => {
      try {
        await messaging.send({
          token: row.token,
          notification: { title: payload.title, body: payload.body },
          data: payload.url ? { url: payload.url } : undefined,
        })
      } catch (err: unknown) {
        if ((err as { code?: string }).code === 'messaging/registration-token-not-registered') {
          staleTokens.push(row.token)
        }
      }
    }))
  })()

  await Promise.allSettled([...webPushSends, nativeSend])

  if (staleEndpoints.length > 0) {
    await service.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }
  if (staleTokens.length > 0) {
    await service.from('push_device_tokens').delete().in('token', staleTokens)
  }
}
```

### Step 3: Create the FCM subscribe route

Create `src/app/api/push/fcm-subscribe/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token, platform } = await req.json()
  if (!token || !platform) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const service = createServiceClient()
  await service.from('push_device_tokens').upsert({
    user_id: user.id,
    token,
    platform,
  }, { onConflict: 'user_id, token' })

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  await service.from('push_device_tokens').delete().eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
```

### Step 4: Verify

Run: `pnpm run build`
Expected: passes clean. Confirm `/api/push/fcm-subscribe` appears in the build's route table.

### Step 5: Commit

```bash
git add package.json pnpm-lock.yaml src/lib/push.ts src/app/api/push/fcm-subscribe/route.ts
git commit -m "feat: dual-send push notifications via FCM alongside existing web push"
```

---

## Task 3: Client-side native registration, deep-linking, and debug scaffolding cleanup

**Files:**
- Modify: `src/components/PushPermission.tsx` (full-file replacement)
- Modify: `src/components/PushAutoPrompt.tsx` (full-file replacement)
- Create: `src/components/PushNotificationTapHandler.tsx`
- Modify: `src/app/dashboard/layout.tsx`
- Delete: `src/components/debug/FcmTokenDebug.tsx`
- Modify: `src/app/settings/page.tsx` (remove the debug component's import and call site)

**Interfaces:**
- Consumes: `POST`/`DELETE /api/push/fcm-subscribe` from Task 2.
- Produces: nothing consumed by a later task — this is the last code task.

### Step 1: Rewrite `PushPermission.tsx`

Replace the full contents of `src/components/PushPermission.tsx`:
```tsx
'use client'

import { useState, useEffect } from 'react'
import { type as osType } from '@tauri-apps/plugin-os'
import {
  isPermissionGranted as isNativePermissionGranted,
  requestPermission as requestNativePermission,
  registerForPushNotifications,
  unregisterForPushNotifications,
} from '@choochmeque/tauri-plugin-notifications-api'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

const isNative = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export default function PushPermission() {
  const [state, setState] = useState<'unknown' | 'subscribed' | 'denied' | 'unsupported'>('unknown')
  const [loading, setLoading] = useState(false)
  const [deniedHint, setDeniedHint] = useState(false)

  useEffect(() => {
    if (isNative) {
      // Standard web push doesn't work in any Tauri context (confirmed via real desktop and
      // Android device testing during the validation spike) -- native push via FCM is the only
      // path here, for both platforms.
      isNativePermissionGranted().then(granted => setState(granted ? 'subscribed' : 'unknown'))
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

  async function enable() {
    setLoading(true)
    setDeniedHint(false)
    try {
      if (isNative) {
        let granted = await isNativePermissionGranted()
        if (!granted) {
          const permission = await requestNativePermission()
          granted = permission === 'granted'
        }
        if (!granted) { setState('denied'); return }
        const token = await registerForPushNotifications()
        await fetch('/api/push/fcm-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform: osType() }),
        })
        setState('subscribed')
        return
      }

      if (Notification.permission === 'denied') {
        setDeniedHint(true)
        return
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setState('denied'); return }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      setState('subscribed')
    } finally {
      setLoading(false)
    }
  }

  async function disable() {
    setLoading(true)
    setDeniedHint(false)
    try {
      if (isNative) {
        await unregisterForPushNotifications()
        await fetch('/api/push/fcm-subscribe', { method: 'DELETE' })
        setState('unknown')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setState('unknown')
    } finally {
      setLoading(false)
    }
  }

  if (state === 'unsupported') {
    return (
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Browser push</p>
        <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
          Push notifications aren&apos;t available in this environment. Open TimeWiseHub in a browser to enable them.
        </p>
      </div>
    )
  }

  const isOn = state === 'subscribed'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Browser push</p>
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
            {isOn ? 'Notifications are on' : 'Get notified even when the tab is closed'}
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={isOn ? disable : enable}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
            isOn ? 'bg-cyan-500' : 'bg-gray-200 dark:bg-slate-600'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transform transition-transform ${
              isOn ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {deniedHint && (
        <p className="px-1 text-xs text-amber-500">
          Notifications are blocked in your browser. Click the padlock icon in the address bar, set Notifications to &quot;Allow&quot;, then try again.
        </p>
      )}
    </div>
  )
}
```

### Step 2: Rewrite `PushAutoPrompt.tsx`

Replace the full contents of `src/components/PushAutoPrompt.tsx`:
```tsx
'use client'

import { useEffect } from 'react'
import { type as osType } from '@tauri-apps/plugin-os'
import {
  isPermissionGranted as isNativePermissionGranted,
  requestPermission as requestNativePermission,
  registerForPushNotifications,
} from '@choochmeque/tauri-plugin-notifications-api'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// Silently prompts the push permission on first dashboard visit. If the user allows, subscribes
// immediately. Renders nothing.
export default function PushAutoPrompt() {
  useEffect(() => {
    async function registerNative() {
      const token = await registerForPushNotifications()
      await fetch('/api/push/fcm-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, platform: osType() }),
      })
    }

    async function trySubscribe() {
      if ('__TAURI_INTERNALS__' in window) {
        // Standard web push doesn't work in any Tauri context (confirmed via real desktop and
        // Android device testing during the validation spike) -- native push via FCM is the only
        // path here, for both platforms.
        const granted = await isNativePermissionGranted()
        if (granted) { await registerNative(); return }

        // Only auto-prompt once per install -- the plugin has no way to distinguish "never
        // asked" from "explicitly denied," so without this guard a denied user would get asked
        // again on every dashboard visit.
        if (localStorage.getItem('fcmAutoPrompted')) return
        localStorage.setItem('fcmAutoPrompted', '1')

        const permission = await requestNativePermission()
        if (permission !== 'granted') return
        await registerNative()
        return
      }

      if (!('Notification' in window) || !('serviceWorker' in navigator)) return
      if (Notification.permission !== 'default') return

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return

      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) return

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      })

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
    }

    trySubscribe().catch(console.error)
  }, [])

  return null
}
```

### Step 3: Create the deep-link tap handler

Create `src/components/PushNotificationTapHandler.tsx`:
```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { onNotificationClicked } from '@choochmeque/tauri-plugin-notifications-api'

// Mounted once, app-wide, for the lifetime of the Tauri app. Navigates to whatever `url` the
// server attached to the notification's data payload when it was sent (src/lib/push.ts) --
// the same field sw.js's web-push notificationclick handler already uses for browser tabs.
export default function PushNotificationTapHandler() {
  const router = useRouter()

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    const listenerPromise = onNotificationClicked(data => {
      const url = data.data?.url
      if (url) router.push(url)
    })
    return () => {
      listenerPromise.then(listener => listener.unregister())
    }
  }, [router])

  return null
}
```

### Step 4: Mount it in the dashboard layout

Find in `src/app/dashboard/layout.tsx`:
```typescript
import PushAutoPrompt from '@/components/PushAutoPrompt'
```

Replace with:
```typescript
import PushAutoPrompt from '@/components/PushAutoPrompt'
import PushNotificationTapHandler from '@/components/PushNotificationTapHandler'
```

Find:
```typescript
      <WelcomeModal />
      <TutorialTracker />
      <TutorialComplete />
      <PushAutoPrompt />
    </TutorialProvider>
```

Replace with:
```typescript
      <WelcomeModal />
      <TutorialTracker />
      <TutorialComplete />
      <PushAutoPrompt />
      <PushNotificationTapHandler />
    </TutorialProvider>
```

### Step 5: Remove the spike's debug scaffolding

Delete the file `src/components/debug/FcmTokenDebug.tsx` entirely.

Find in `src/app/settings/page.tsx`:
```typescript
import PushPermission from '@/components/PushPermission'
import FcmTokenDebug from '@/components/debug/FcmTokenDebug'
```

Replace with:
```typescript
import PushPermission from '@/components/PushPermission'
```

Find:
```typescript
        <div className="mt-4"><PushPermission /></div>
        <div className="mt-4"><FcmTokenDebug /></div>
      </div>
```

Replace with:
```typescript
        <div className="mt-4"><PushPermission /></div>
      </div>
```

### Step 6: Verify

Run: `pnpm run build`
Expected: passes clean, no unused-import warnings, no reference to the deleted
`src/components/debug/FcmTokenDebug.tsx` remaining anywhere.

### Step 7: Commit

```bash
git add src/components/PushPermission.tsx src/components/PushAutoPrompt.tsx src/components/PushNotificationTapHandler.tsx src/app/dashboard/layout.tsx src/app/settings/page.tsx
git rm src/components/debug/FcmTokenDebug.tsx
git commit -m "feat: wire native push registration and tap-to-deep-link into the app"
```

---

## Manual setup + verification (user-only, gates the phase)

Neither Codex nor the conductor can do any of this — it needs your Firebase account and real
device builds, same as the validation spike.

1. **Set the Firebase credential in Vercel.** In the Firebase Console for the project already
   created during the spike: Project settings → Service accounts → "Generate new private key" —
   downloads a JSON file. Base64-encode it (PowerShell:
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("path\to\the-downloaded-file.json")) |
   Set-Clipboard` copies the result straight to your clipboard), then set it as a Vercel env var:
   `vercel env add FIREBASE_SERVICE_ACCOUNT_B64 production` and paste the base64 value when
   prompted. Also add it to `preview`/`development` if you want FCM sending to work in those
   environments too.
2. Push this phase's code to master (only once you tell me to, per usual) and confirm the
   deployment is `READY`.
3. **Real Android test**: rebuild the Android app (`pnpm tauri android build`, same process as the
   spike), install it, open Settings, toggle "Browser push" on (this now goes through the real
   registration flow instead of the debug button), trigger a real notification (e.g. have a SWMS
   document awaiting your signature, or ask the conductor to trigger one via Supabase directly),
   confirm it arrives with the app closed and that tapping it navigates to the right page.
4. **Real desktop test**: same as above but with `pnpm tauri:build` and the desktop app — this is
   the one genuinely unverified path carried forward from the spike (the plugin's own Android
   behavior was proven, desktop wasn't). If desktop's native push doesn't work the same way,
   that's a real finding to report back, not an assumption to paper over.
5. **Browser regression check**: confirm existing web push in a normal browser tab still works
   unaffected — toggle it on, trigger a notification, confirm delivery. This validates the
   "graceful degradation" constraint actually held.
