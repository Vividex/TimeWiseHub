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
  const [error, setError] = useState<string | null>(null)

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
    setError(null)
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
    } catch (err) {
      // A silent failure here (e.g. a Tauri capability/ACL error) previously looked identical
      // to the toggle doing nothing at all -- surface whatever actually went wrong instead.
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function disable() {
    setLoading(true)
    setDeniedHint(false)
    setError(null)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
      {error && <p className="px-1 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  )
}
