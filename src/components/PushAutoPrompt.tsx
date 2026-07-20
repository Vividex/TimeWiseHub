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
