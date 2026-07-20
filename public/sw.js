const CACHE = 'timewisehub-v3'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Network-first with cache fallback -- same-origin only. Cross-origin GETs (e.g. signed
// Supabase Storage URLs for images/PDFs) are left to the browser's own handling: this SW's
// caching adds no benefit for third-party resources, and intercepting a no-cors image
// request as an opaque response is a real, hard-to-diagnose way for that image to silently
// fail to render if the intercepted fetch itself has any hiccup.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  if (new URL(event.request.url).origin !== self.location.origin) return
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone()
        caches.open(CACHE).then(cache => cache.put(event.request, clone))
        return response
      })
      .catch(() => caches.match(event.request))
  )
})

// Push notifications
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  const targetUrl = data.url ?? '/dashboard'
  const isChat = typeof data.tag === 'string' && data.tag.startsWith('chat:')

  event.waitUntil((async () => {
    // For chat, skip the notification if a focused window is already on that
    // conversation — the user is actively viewing it and saw it live.
    if (isChat) {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const focusedOnConversation = wins.some(c => c.focused && c.url.includes(targetUrl))
      if (focusedOnConversation) return
    }

    await self.registration.showNotification(data.title ?? 'TimeWiseHub', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag ?? 'timewisehub',
      data: { url: targetUrl },
    })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const targetUrl = event.notification.data?.url ?? '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(targetUrl))
      if (existing) return existing.focus()
      return self.clients.openWindow(targetUrl)
    })
  )
})
