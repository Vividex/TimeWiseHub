'use client'

import { useState, useEffect } from 'react'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function PushPermission() {
  const [state, setState] = useState<'unknown' | 'subscribed' | 'denied' | 'unsupported'>('unknown')
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('push_prompt_dismissed')) { setDismissed(true) }
    // Web push is not available inside the Tauri native app shell
    if ('__TAURI_INTERNALS__' in window) {
      setState('unsupported')
      return
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') { setState('denied'); return }
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => {
        setState(sub ? 'subscribed' : 'unknown')
      })
    )
  }, [])

  async function enable() {
    setLoading(true)
    try {
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
    try {
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

  if (state === 'unsupported' || dismissed) return null

  if (state === 'subscribed') {
    return (
      <button onClick={disable} disabled={loading}
        className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50">
        🔔 Notifications on
      </button>
    )
  }

  if (state === 'denied') {
    return (
      <span className="text-xs font-semibold text-gray-400">Notifications blocked in browser settings</span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={enable} disabled={loading}
        className="flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-600 transition-colors hover:bg-cyan-100 disabled:opacity-50">
        🔔 {loading ? 'Enabling...' : 'Enable notifications'}
      </button>
      <button
        onClick={() => { localStorage.setItem('push_prompt_dismissed', '1'); setDismissed(true) }}
        className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
      >
        Not now
      </button>
    </div>
  )
}

