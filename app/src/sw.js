import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || '小克找你', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'xiaoke',
      renotify: true,
    })
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
