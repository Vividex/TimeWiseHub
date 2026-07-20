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
