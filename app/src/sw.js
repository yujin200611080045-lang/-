import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() } catch {}
  const title = data.title || '小克找你'
  const body = data.body || ''
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'xiaoke',
        renotify: true,
        data: { title, body },
      }),
      // Store in cache so app can read it when it opens (iOS URL params unreliable)
      caches.open('xk-push').then(c =>
        c.put('/pending', new Response(JSON.stringify({ title, body, ts: Date.now() })))
      ),
      // Also deliver instantly if app is already open
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        for (const c of list) {
          if (c.url.includes('/companion')) c.postMessage({ type: 'xk-push', title, body })
        }
      }),
    ])
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('/companion') && 'focus' in c) return c.focus()
      }
      return clients.openWindow('/companion')
    })
  )
})
