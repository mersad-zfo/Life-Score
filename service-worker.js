importScripts('./app-notif-db.js');
importScripts('./app-notif-shared.js');

const CACHE_NAME = 'lifyar-v92';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './welcome-icon.png',
  './base.css',
  './app.css',
  './ring.css',
  './onboarding.css',
  './app-state-core.js',
  './app-firebase.js',
  './app-i18n.js',
  './app-rating.js',
  './app-consistency.js',
  './app-steps.js',
  './app-emoji.js',
  './app-notif-db.js',
  './app-notif-triggers.js',
  './app-notif-shared.js',
  './app-notifications.js',
  './app-drag.js',
  './app-render-core.js',
  './app-render-today.js',
  './app-render-routines.js',
  './app-render-tasks.js',
  './app-render-progression.js',
  './app-render-score.js',
  './app-render-settings.js',
  './app-render-notifications.js',
  './app-modals.js',
  './app-account.js',
  './app-onboarding.js',
  './app-main.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const isSameOrigin = event.request.url.startsWith(self.location.origin);
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache same-origin GET requests for offline use. A cross-origin request — like the
        // Firebase SDK's own CDN imports in app-firebase.js — can hit a browser quirk where
        // cache.put() throws "Entry was not found" for certain fetch types (module imports in
        // particular), and there's no reason to cache those here anyway: the CDN serves its own
        // cache headers, we were never trying to intermediate that.
        if (isSameOrigin && event.request.method === 'GET' && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(()=>{});
        }
        return response;
      }).catch(() => cached);
    })
  );
});

// ---------- Push notifications ----------
// These two fixed daily pushes are deliberately NOT added to the in-app bell inbox — that inbox
// is reserved for richer, condition-based notifications (streaks, milestones, etc.) that will be
// generated entirely client-side later. Push and in-app are two separate, decoupled categories.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) { /* non-JSON payload, ignore */ }
  const title = data.title || 'Lifyar';
  const body = data.body || '';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './icon-192.png',
      badge: './icon-192.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async ()=>{
    const clientsList = await self.clients.matchAll({ type: 'window' });
    if(clientsList.length > 0){
      clientsList[0].focus();
      clientsList[0].postMessage({ type: 'lifyar-notification-clicked' });
    } else {
      await self.clients.openWindow('./index.html');
    }
  })());
});

// ---------- Reliability: subscription rotation ----------
// Browsers occasionally invalidate and silently replace a push subscription behind the scenes
// (key rotation, browser-side cleanup, etc.) and fire this event when they do. Without handling
// it, notifications would just quietly stop working until someone happened to toggle the
// Settings switch off and back on. This runs even if the app is closed, which is exactly why the
// deviceId has to be readable from IndexedDB (app-notif-db.js) rather than localStorage.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async ()=>{
    try{
      const deviceId = await notifMetaGet('deviceId');
      if(!deviceId) return; // never subscribed from this browser profile — nothing to reconnect

      const newSubscription = event.newSubscription || await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(NOTIF_VAPID_PUBLIC_KEY),
      });

      await notifPostToWorker('/api/device', {
        deviceId,
        subscription: newSubscription.toJSON(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        enabled: true,
      });
    }catch(e){
      // Best effort — if this fails, the next time the app is opened, reconfirmDeviceIfNeeded()
      // in app-notifications.js will notice the subscription changed and fix it then.
      console.warn('pushsubscriptionchange: resubscribe failed', e);
    }
  })());
});
