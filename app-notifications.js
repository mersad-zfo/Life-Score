// ---------- Push notifications (client side) ----------
// Talks to the Cloudflare Worker (worker.js — see /worker in the project). Handles: subscribing
// this device, keeping the Worker's copy of this device honest (reliability batch: detecting a
// silently revoked permission, reconfirming after subscription rotation, deduping writes so we
// don't burn the free-tier write budget), and the in-app bell badge.
//
// Push itself is deliberately simple now — just two fixed daily messages (see worker.js) — so
// there's no rule syncing here anymore. Richer, condition-based notifications live entirely in
// the local in-app inbox (app-notif-db.js) and never need to reach this Worker at all.

const NOTIF_STORE_TAG = null; // (placeholder removed — kept file diff minimal, safe to ignore)

function currentTimezone(){
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function todayLocalDateStr(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

// deviceId lives in two places on purpose: state.settings.deviceId (synchronous, for normal app
// code) and IndexedDB (async, so the service worker can read it too — see service-worker.js's
// pushsubscriptionchange handler, which runs in the background with no access to localStorage).
async function notifDeviceId(){
  if(!state.settings.deviceId){
    state.settings.deviceId = uid() + uid();
    saveState();
  }
  try{
    const metaId = await notifMetaGet('deviceId');
    if(metaId !== state.settings.deviceId) await notifMetaSet('deviceId', state.settings.deviceId);
  }catch(e){ /* IndexedDB unavailable — service worker resubscribe just won't be able to run, non-fatal */ }
  return state.settings.deviceId;
}

function notifPlatform(){
  const ua = navigator.userAgent || '';
  if(/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if(/android/i.test(ua)) return 'android';
  return 'other';
}

function saveNotifSyncSnapshot(endpoint, timezone, enabled){
  state.settings.notifLastSync = { endpoint, timezone, enabled, dateStr: todayLocalDateStr() };
  saveState();
}

async function enablePushNotifications(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){
    showToast(tr("Notifications aren't supported on this browser"));
    return false;
  }
  try{
    const permission = await Notification.requestPermission();
    if(permission !== 'granted'){
      state.settings.notificationsEnabled = false;
      saveState();
      showToast(tr('Notification permission was not granted'));
      return false;
    }
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if(!subscription){
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(NOTIF_VAPID_PUBLIC_KEY),
      });
    }
    const deviceId = await notifDeviceId();
    const timezone = currentTimezone();
    await notifPostToWorker('/api/device', {
      deviceId, subscription: subscription.toJSON(), platform: notifPlatform(), timezone, enabled: true,
    });
    saveNotifSyncSnapshot(subscription.endpoint, timezone, true);
    state.settings.notificationsEnabled = true;
    saveState();
    showToast(tr('Notifications enabled'));
    return true;
  }catch(e){
    console.error('enablePushNotifications failed', e);
    showToast(tr('Could not enable notifications — try again'));
    return false;
  }
}

async function disablePushNotifications(){
  const timezone = currentTimezone();
  try{
    const deviceId = await notifDeviceId();
    await notifPostToWorker('/api/device', { deviceId, timezone, enabled: false });
    saveNotifSyncSnapshot(null, timezone, false);
  }catch(e){ console.error('disablePushNotifications: Worker update failed', e); }
  state.settings.notificationsEnabled = false;
  saveState();
  showToast(tr('Notifications turned off'));
}

// ---------- Reliability: catch a silently revoked OS/browser permission ----------
// If someone turns notifications off at the phone's system level (not in-app), the app has no
// way to know unless it checks. Called on app init and whenever Settings renders, so the toggle
// never quietly lies about its real state.
async function checkNotificationPermissionState(){
  if(!state.settings.notificationsEnabled) return false;
  if(!('Notification' in window)){ return false; }

  let stillValid = Notification.permission === 'granted';
  if(stillValid && 'serviceWorker' in navigator){
    try{
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if(!sub) stillValid = false;
    }catch(e){ /* ignore — treat as still valid, next reconfirm pass will sort it out */ }
  }

  if(!stillValid){
    state.settings.notificationsEnabled = false;
    saveState();
    try{
      const deviceId = await notifDeviceId();
      await notifPostToWorker('/api/device', { deviceId, timezone: currentTimezone(), enabled: false });
    }catch(e){ /* best effort — local state is already correct either way */ }
    return true;
  }
  return false;
}

// ---------- Reliability: keep the Worker's copy of this device honest ----------
// Handles both "the subscription/timezone silently changed" and "just confirm you're still
// alive" (the lastSeen touch that lets the Worker clean up truly abandoned devices later).
// Deliberately only writes when something is actually different, or once per calendar day
// otherwise — see the write-budget discussion this was designed around.
async function reconfirmDeviceIfNeeded(){
  if(!state.settings.notificationsEnabled) return;
  if(!('serviceWorker' in navigator)) return;
  try{
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if(!subscription) return; // no valid subscription — checkNotificationPermissionState handles this case

    const timezone = currentTimezone();
    const today = todayLocalDateStr();
    const last = state.settings.notifLastSync;
    const unchanged = last && last.endpoint===subscription.endpoint && last.timezone===timezone
      && last.enabled===true && last.dateStr===today;
    if(unchanged) return;

    const deviceId = await notifDeviceId();
    await notifPostToWorker('/api/device', {
      deviceId, subscription: subscription.toJSON(), platform: notifPlatform(), timezone, enabled: true,
    });
    saveNotifSyncSnapshot(subscription.endpoint, timezone, true);
  }catch(e){ console.error('reconfirmDeviceIfNeeded failed', e); }
}

// ---------- Bell badge ----------
async function refreshBellBadge(){
  const badge = document.getElementById('bellBadge');
  if(!badge) return;
  try{
    const count = await notifDbUnreadCount();
    if(count > 0){
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }catch(e){ /* IndexedDB unavailable — badge just stays hidden */ }
}

if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', (event)=>{
    if(event.data && event.data.type === 'life-score-push-received'){
      refreshBellBadge();
    }
  });
}
