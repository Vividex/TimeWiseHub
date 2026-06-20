'use client'

import { useEffect } from 'react'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// Silently prompts the browser push permission on first dashboard visit.
// If the user allows, subscribes immediately. Renders nothing.
export default function PushAutoPrompt() {
  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) return
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    if (Notification.permission !== 'default') return

    async function trySubscribe() {
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
