// sw.js — the office's service worker. It does one thing: show the buzz the
// office pushes when a session asks the owner a question, and open the
// Questions panel when they tap it. No caching - a wall that can show an old
// screen offline would be lying about who is at work.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = {}; }
  event.waitUntil(self.registration.showNotification(d.title || 'WorkSpace', {
    body: d.body || 'A session has a question for you.',
    tag: d.tag || 'workspace-questions',
    renotify: true,
    icon: '/icon-192.png',
    data: { url: d.url || '/?questions' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/?questions', self.location.origin).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of open) {
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
        c.postMessage({ type: 'open-questions' });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
