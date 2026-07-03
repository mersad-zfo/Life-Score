// ---------- Shared push notification constants/helpers ----------
// Like app-notif-db.js, this file is loaded in TWO places: as a normal <script> in index.html,
// and via importScripts() inside service-worker.js. That's why it only contains constants and
// small pure functions — nothing that touches `document`, `state`, or anything page-only.
// The service worker needs these for its pushsubscriptionchange handler (see service-worker.js);
// the page needs them for the initial subscribe flow (see app-notifications.js).

const NOTIF_WORKER_URL = 'https://life-score-notifications.mersad-ziro.workers.dev';
const NOTIF_VAPID_PUBLIC_KEY = 'BIP4cJsjOHltYCVwOoPHxPRqoYXT3QdsN4hl_keNtr9p2DsrRU1JhsIz9z7ECh1K3fC0S29_36GUrBdDFxIXfC4';
const NOTIF_API_SECRET = 'dYVG3z0T0gtLAVcU-sPta8sKAH9GQ8ab7ivPk91Fsxk';

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function notifPostToWorker(path, body){
  const res = await fetch(NOTIF_WORKER_URL + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + NOTIF_API_SECRET,
    },
    body: JSON.stringify(body),
  });
  if(!res.ok) throw new Error('Worker request failed: ' + res.status);
  return res.json();
}
