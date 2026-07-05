// ---------- Notification storage (IndexedDB) ----------
// This file is intentionally dependency-free — no `document`, no `state`, nothing page-specific
// — because it's loaded in TWO different places: as a normal <script> in index.html, AND via
// importScripts() inside service-worker.js. Service workers can't see localStorage, so this is
// what lets a push notification received while the app is closed still show up in the in-app
// bell list next time you open it.
//
// A notification here is: { id (auto), title, body, receivedAt (ms timestamp), read (bool) }
// Category 2 (local, condition-triggered) entries add a few more fields — see
// ARCHITECTURE.md "Push Notification Architecture" / app-notif-triggers.js:
//   category          'congrats' | 'warning' | 'info' — picks the 🏆/❗/❕ icon, never shown as text
//   key               stable source signature (e.g. "ms:<routineId>:<date>") used to find/remove/
//                     re-add the exact entry a condition caused, so undo/redo stays reactive
//                     without ever matching on message text
//   hiddenFromPopover set when the user taps "x" in the bell popover — hides it from that short
//                     list only; it still lives in history until it 30-day-prunes or is trashed
//                     from the full Notifications page

const NOTIF_DB_NAME = 'lifescore-notifications';
const NOTIF_STORE = 'notifications';
const NOTIF_META_STORE = 'meta';

function notifDbOpen(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(NOTIF_DB_NAME, 2);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if(!db.objectStoreNames.contains(NOTIF_STORE)){
        db.createObjectStore(NOTIF_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if(!db.objectStoreNames.contains(NOTIF_META_STORE)){
        db.createObjectStore(NOTIF_META_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}

// ---------- Small cross-context key/value store ----------
// Used to share a handful of values (currently just deviceId) between the main page and the
// service worker — service workers can't see localStorage, so this is the only place both
// contexts can reliably read/write the same value. See service-worker.js's
// pushsubscriptionchange handler for why this matters.
async function notifMetaGet(key){
  const db = await notifDbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(NOTIF_META_STORE, 'readonly');
    const req = tx.objectStore(NOTIF_META_STORE).get(key);
    req.onsuccess = ()=> resolve(req.result ? req.result.value : null);
    req.onerror = ()=> reject(req.error);
  });
}

async function notifMetaSet(key, value){
  const db = await notifDbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(NOTIF_META_STORE, 'readwrite');
    tx.objectStore(NOTIF_META_STORE).put({ key, value });
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
  });
}

async function notifDbAdd(notif){
  const db = await notifDbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(NOTIF_STORE, 'readwrite');
    tx.objectStore(NOTIF_STORE).add({ read: false, ...notif });
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
  });
}

async function notifDbGetAll(){
  const db = await notifDbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(NOTIF_STORE, 'readonly');
    const req = tx.objectStore(NOTIF_STORE).getAll();
    req.onsuccess = ()=> resolve((req.result || []).sort((a,b)=> b.receivedAt - a.receivedAt));
    req.onerror = ()=> reject(req.error);
  });
}

async function notifDbMarkAllRead(){
  const db = await notifDbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(NOTIF_STORE, 'readwrite');
    const store = tx.objectStore(NOTIF_STORE);
    const req = store.openCursor();
    req.onsuccess = ()=>{
      const cursor = req.result;
      if(cursor){
        if(!cursor.value.read){
          const updated = { ...cursor.value, read: true };
          cursor.update(updated);
        }
        cursor.continue();
      }
    };
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
  });
}

async function notifDbUnreadCount(){
  const all = await notifDbGetAll();
  return all.filter(n=> !n.read).length;
}

// ---------- Category 2 helpers (key-based lookup, popover-hide, real delete) ----------
// Small dataset (single user, 30-day retention) — plain getAll()+filter is plenty, no need for
// a dedicated IDB index on `key`.
async function notifDbFindByKey(key){
  const all = await notifDbGetAll();
  return all.find(n=> n.key===key) || null;
}

async function notifDbDeleteByKey(key){
  const db = await notifDbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(NOTIF_STORE, 'readwrite');
    const store = tx.objectStore(NOTIF_STORE);
    const req = store.openCursor();
    req.onsuccess = ()=>{
      const cursor = req.result;
      if(cursor){
        if(cursor.value.key===key) cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
  });
}

// Bell popover "x" — hides from that short list only, and counts as read. The entry stays in
// history (full Notifications page) until it 30-day-prunes or is explicitly trashed there.
async function notifDbDismissFromPopover(id){
  const db = await notifDbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(NOTIF_STORE, 'readwrite');
    const store = tx.objectStore(NOTIF_STORE);
    const req = store.get(id);
    req.onsuccess = ()=>{
      const val = req.result;
      if(val) store.put({ ...val, read: true, hiddenFromPopover: true });
    };
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
  });
}

// Full Notifications page trash icon — a real, permanent delete (unlike the popover's "x").
async function notifDbDeleteOne(id){
  const db = await notifDbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(NOTIF_STORE, 'readwrite');
    tx.objectStore(NOTIF_STORE).delete(id);
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
  });
}

// Keeps the store from growing forever on a device that's never opened the notifications
// panel — trims anything older than 30 days whenever a new one arrives.
async function notifDbPruneOld(){
  const cutoff = Date.now() - 30*24*60*60*1000;
  const db = await notifDbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(NOTIF_STORE, 'readwrite');
    const store = tx.objectStore(NOTIF_STORE);
    const req = store.openCursor();
    req.onsuccess = ()=>{
      const cursor = req.result;
      if(cursor){
        if(cursor.value.receivedAt < cutoff) cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
  });
}
