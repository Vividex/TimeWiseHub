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
