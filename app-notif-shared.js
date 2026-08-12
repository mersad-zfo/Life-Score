// ---------- Shared push notification constants/helpers ----------
// Like app-notif-db.js, this file is loaded in TWO places: as a normal <script> in index.html,
// and via importScripts() inside service-worker.js. That's why it only contains constants and
// small pure functions — nothing that touches `document`, `state`, or anything page-only.
// The service worker needs these for its pushsubscriptionchange handler (see service-worker.js);
// the page needs them for the initial subscribe flow (see app-notifications.js).

// NOTE (app rebrand, Life Score → Lifyar): this URL intentionally still says "life-score" —
// it's the actual deployed Cloudflare Worker's URL, not just a name. Renaming it here without
// also renaming the real Worker on Cloudflare (and its KV binding, see Worker/worker.js) would
// break push notifications entirely. Tracked in BACKLOG.md — update both together when that's done.
const NOTIF_WORKER_URL = 'https://life-score-notifications.mersad-ziro.workers.dev';
const NOTIF_VAPID_PUBLIC_KEY = 'BIP4cJsjOHltYCVwOoPHxPRqoYXT3QdsN4hl_keNtr9p2DsrRU1JhsIz9z7ECh1K3fC0S29_36GUrBdDFxIXfC4';

// REMOVED: NOTIF_API_SECRET. This file ships in the client bundle, so a constant here is never
// actually secret — anyone who opens the app's JS can read it. The old constant was also the
// Worker's *only* access control, which meant that value alone let anyone force-send a push to
// every registered device (via /api/test-push) or register arbitrary device records. See
// Worker/worker.js's "---------- Auth ----------" section for the fix: /api/device is now
// authorized per-call, using whichever credential notifAuthHeader() below can produce; a
// separate secret that's never shipped anywhere guards /api/test-push instead.

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Produces the Authorization header value for a Worker call. Two contexts call this file, and
// each gets a different credential:
//  - The page (app-notifications.js): a live Firebase session always exists here (even before
//    sign-up — the app signs in anonymously on first launch, see app-firebase.js), so this
//    prefers a fresh Firebase ID token. waitForLifyarCloud() (app-state-core.js) is reused for
//    the same startup-ordering reason it exists there — it's a classic script global, not
//    defined in the service worker context, hence the typeof guard below.
//  - The service worker (service-worker.js's pushsubscriptionchange handler): can run with no
//    page open at all, so there's no live Firebase session to ask. Falls back to the per-device
//    secret the Worker minted and handed back the last time this exact device authenticated with
//    a real Firebase token — cached in the shared IndexedDB meta store (app-notif-db.js) so both
//    contexts can read it.
async function notifAuthHeader(){
  if(typeof window !== 'undefined'){
    try{
      const cloud = (typeof waitForLifyarCloud === 'function') ? await waitForLifyarCloud(5000) : window.LifyarCloud;
      if(cloud && cloud.getIdToken){
        const token = await cloud.getIdToken();
        if(token) return 'Bearer ' + token;
      }
    }catch(e){ /* fall through to the cached device secret below */ }
  }
  try{
    const deviceId = await notifMetaGet('deviceId');
    const secret = await notifMetaGet('deviceSecret');
    if(deviceId && secret) return 'Device ' + deviceId + ':' + secret;
  }catch(e){ /* no stored secret yet — the request below will get a 401, which is correct */ }
  return null;
}

async function notifPostToWorker(path, body){
  const authHeader = await notifAuthHeader();
  const headers = { 'Content-Type': 'application/json' };
  if(authHeader) headers['Authorization'] = authHeader;

  const res = await fetch(NOTIF_WORKER_URL + path, { method: 'POST', headers, body: JSON.stringify(body) });
  if(!res.ok) throw new Error('Worker request failed: ' + res.status);
  const data = await res.json();

  // The Worker hands back the device's current secret on every successful /api/device call —
  // cache it so a later call from a context with no live Firebase session (the service worker)
  // can still authenticate. Harmless no-op for any other route that doesn't return this.
  if(data && data.deviceSecret){
    try{ await notifMetaSet('deviceSecret', data.deviceSecret); }catch(e){ /* best effort */ }
  }
  return data;
}
