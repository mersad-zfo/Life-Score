// ---------- Init ----------
// ---------- Hardware back button (Android) / edge-swipe-back (Android & iOS) ----------
// The app never used the History API before this — by default, pressing a phone's back button
// (or swiping from the screen edge) while a modal or the Settings/Notifications page was open just
// exited the app, since there was no browser history entry to go back to. The fix: push one history
// entry every time something "back-able" opens, and make that entry's ONLY purpose be to get
// consumed — either by a real hardware-back press, or by the layer's own close control (X, Cancel,
// backdrop tap, "< Back") calling closeBackLayer() instead of closing itself directly. Both paths
// converge on the single popstate handler below, which is the ONLY place that ever actually runs a
// layer's close logic — this is what keeps the browser's real history stack and this JS-side stack
// from ever drifting out of sync with each other, regardless of which path triggered the close.
//
// Scope (deliberate): every modal (openModal() in app-modals.js covers routine/task/reset and,
// via openAccountModal, every account modal too — plus onboarding's own Skip Setup modal, which
// calls openModal() directly), the bell notifications popover, the progression popover (including
// its own internal month→week→day drill-down — each level is its own layer, so back steps through
// them one at a time before closing the popover, same as tapping that level's own "< back"), the
// Settings/Notifications full-page overlays (not modals — just `currentTab` states with their own
// "< Back"), and onboarding's own step-by-step "< Back" (steps 1-5). It does NOT cover ordinary
// bottom-nav tab switching (Today/Routines/Tasks/Score) — pressing back on a bare tab with none of
// the above open still exits the app today, as before.
const backLayerStack = [];
// Set by closeBackLayers() right before it calls history.go(-n) — history.go coalesces a multi-step
// jump into exactly ONE popstate event on arrival, so the popstate handler needs to know how many
// layers that single event actually accounts for. Reset to 0 (meaning "exactly 1") the moment it's
// consumed, so an ordinary hardware-back press — which never touches this — always closes just one.
let pendingBackPops = 0;
function pushBackLayer(onPop){
  history.pushState({ lifyarLayer: true }, '', location.href);
  backLayerStack.push(onPop);
}
// What every layer's own close control (X / Cancel / backdrop tap / "< Back") should call instead
// of closing itself directly.
function closeBackLayer(){
  closeBackLayers(1);
}
// For the rare action that closes more than one layer in a single step (e.g. deleting the account
// closes both the confirm modal and the Manage Account modal beneath it).
function closeBackLayers(n){
  if(n<=0 || !backLayerStack.length) return;
  pendingBackPops = Math.min(n, backLayerStack.length);
  history.go(-pendingBackPops);
}
window.addEventListener('popstate', ()=>{
  const n = pendingBackPops || 1;
  pendingBackPops = 0;
  for(let i=0; i<n; i++){
    const onPop = backLayerStack.pop();
    if(onPop) onPop();
  }
});
// For a full teardown (Reset Everything) — clears every pending layer at once. Whatever they'd
// have restored to (e.g. a Settings-tab layer beneath the Reset modal) no longer applies once the
// app has been torn down into onboarding, so this deliberately does NOT run each layer's own onPop
// — the caller is expected to handle its own immediate cleanup (e.g. removing its modal) directly.
function clearBackLayers(){
  const n = backLayerStack.length;
  if(!n) return;
  backLayerStack.length = 0;
  pendingBackPops = 0;
  history.go(-n);
}

// ---------- Example-text placeholders: clear on focus, restore on blur ----------
// A native <input>/<textarea> placeholder is only hidden by the browser once you actually type a
// character — focusing an empty field does NOT hide it (that's the HTML spec's behavior, not a
// bug), which reads as sluggish/broken for "e.g. ..." example text throughout the app. This makes
// it behave the way people expect: gone the instant the field is focused, back if left empty.
// Delegated on the document (focusin/focusout bubble, unlike focus/blur) so it covers every
// current and future placeholder-bearing field without wiring each one individually. No need to
// separately check the field is still empty on blur — the browser itself only ever displays
// placeholder text on an empty field, restoring the attribute is a no-op if there's now a value.
document.addEventListener('focusin', (e)=>{
  const el = e.target;
  if((el.tagName==='INPUT' || el.tagName==='TEXTAREA') && el.placeholder){
    el.dataset.placeholderStash = el.placeholder;
    el.placeholder = '';
  }
});
document.addEventListener('focusout', (e)=>{
  const el = e.target;
  if(el.dataset && el.dataset.placeholderStash){
    el.placeholder = el.dataset.placeholderStash;
    delete el.dataset.placeholderStash;
  }
});

// ---------- Header greeting (Today tab) ----------
// Five time-of-day buckets, each with 3 short (max 4-word) greetings to pick from at random.
// Each entry is [plain, withName] — withName uses "{name}" as a placeholder and is only used when
// state.profile.name is set AND the phrase actually reads naturally with a name attached (e.g. "Hello,
// night owl" doesn't get one). Both plain and withName are run through tr() for translation.
const GREETINGS = {
  morning: [ // 5–12
    ['Morning', 'Morning, {name}'],
    ['Good morning', 'Good morning, {name}'],
    ['Rise and shine', 'Rise and shine, {name}'],
  ],
  afternoon: [ // 12–17
    ['Good afternoon', 'Good afternoon, {name}'],
    ['Afternoon', 'Afternoon, {name}'],
    ['Nice afternoon', 'Nice afternoon, {name}'],
  ],
  evening: [ // 17–19
    ['Good evening', 'Good evening, {name}'],
    ['Evening', 'Evening, {name}'],
    ['Hey there', 'Hey there, {name}'],
  ],
  night: [ // 19–24
    ['Hey there', 'Hey there, {name}'],
    ['Nice night', 'Nice night, {name}'],
    ['Time to relax', 'Time to relax, {name}'],
  ],
  midnight: [ // 0–5
    ['Still up?', 'Still up, {name}?'],
    ['Hello, night owl', null], // reads oddly with a name tacked on — always plain
    ['Up late huh?', null],     // same — stays plain regardless of name
  ],
};
function greetingBucketForHour(h){
  if(h>=5 && h<12) return 'morning';
  if(h>=12 && h<17) return 'afternoon';
  if(h>=17 && h<19) return 'evening';
  if(h>=19 && h<24) return 'night';
  return 'midnight'; // 0–4
}
// The specific phrase is only re-rolled when the (day, bucket) pair changes — otherwise every
// return to the Today tab would re-randomize it mid-day, which feels twitchy. Persisted in its own
// localStorage slot (not part of the main state blob) so it also survives a full app reload.
const GREETING_PICK_KEY = 'lifyar_header_greeting_v1';
function getHeaderGreeting(){
  const day = todayStr(); // app's own day boundary (sleep-cycle aware — midnight/6am/noon), not raw calendar midnight
  const bucket = greetingBucketForHour(new Date().getHours());
  let pick = null;
  try{
    const raw = localStorage.getItem(GREETING_PICK_KEY);
    if(raw) pick = JSON.parse(raw);
  }catch(e){ pick = null; }
  if(!pick || pick.day !== day || pick.bucket !== bucket){
    pick = { day, bucket, index: Math.floor(Math.random() * GREETINGS[bucket].length) };
    try{ localStorage.setItem(GREETING_PICK_KEY, JSON.stringify(pick)); }catch(e){ /* best effort */ }
  }
  const list = GREETINGS[bucket];
  const [plain, withName] = list[Math.min(pick.index, list.length - 1)];
  const firstName = state.profile && state.profile.name ? state.profile.name.trim().split(' ')[0] : '';
  if(firstName && withName) return tr(withName).replace('{name}', firstName);
  return tr(plain);
}

const TAB_PAGE_TITLES = { routines: 'Your routines', tasks: 'Your tasks', score: 'Your score', settings: 'Settings', notifications: 'Notifications' };
function headerBackAction(){
  closeBackLayer();
}
function updateHeader(){
  const el = document.getElementById('headerInfo');
  document.getElementById('bellBtn').style.display = (currentTab==='settings' || currentTab==='notifications') ? 'none' : '';
  if(currentTab==='today'){
    el.innerHTML = `<div class="wordmark">${escapeHtml(getHeaderGreeting())}</div><div class="date" id="todayLabel"></div>`;
    fmtDateLabel();
  } else if(currentTab==='settings' || currentTab==='notifications'){
    // Page-level back lives right under the title here, not inline in the page content.
    el.innerHTML = `
      <div class="wordmark page-title page-title-with-back">${tr(TAB_PAGE_TITLES[currentTab])}</div>
      <button class="header-back-btn" id="headerBackBtn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        ${tr('Back')}
      </button>
    `;
    document.getElementById('headerBackBtn').addEventListener('click', headerBackAction);
  } else {
    el.innerHTML = `<div class="wordmark page-title">${tr(TAB_PAGE_TITLES[currentTab])}</div>`;
  }
}
// Fades the header title/date out, swaps their content, fades back in — same visual
// language as the tab-slide itself. Skipped on the very first call (nothing to fade from).
let headerEverRendered = false;
function updateHeaderAnimated(){
  const el = document.getElementById('headerInfo');
  if(!headerEverRendered){ headerEverRendered = true; updateHeader(); return; }
  el.style.opacity = 0;
  setTimeout(()=>{
    updateHeader();
    el.style.opacity = 1;
  }, 120);
}
function setTab(tab){
  if(tab !== currentTab){
    if(typeof closeRewardsPanelIfOpen==='function') closeRewardsPanelIfOpen();
    routinesPenaltyInfoOpen = false;
    tasksPenaltyInfoOpen = false;
    // Scroll each main tab page back to the top when leaving it, so returning to it later
    // always shows it fresh from the top instead of wherever it was last scrolled to.
    const pageIds = { today:'pageToday', routines:'pageRoutines', tasks:'pageTasks', score:'pageScore', settings:'overlayContent', notifications:'overlayContent' };
    const leavingPageId = pageIds[currentTab];
    if(leavingPageId){
      const leavingEl = document.getElementById(leavingPageId);
      if(leavingEl) leavingEl.scrollTop = 0;
    }
  }
  if(tab==='today' && currentTab!=='today') onNextTodayRenderAnimateRing = true;
  currentTab = tab;
  document.querySelectorAll('nav.tabs button').forEach(b=> b.classList.toggle('active', b.dataset.tab===tab));
  updateHeaderAnimated();
  renderMain();
}
document.querySelectorAll('nav.tabs button').forEach(b=>{
  b.addEventListener('click', ()=> setTab(b.dataset.tab));
});
document.getElementById('bellBtn').addEventListener('click', ()=>{
  openNotificationsModal();
});
document.getElementById('gearBtn').addEventListener('click', ()=>{
  if(currentTab!=='settings'){
    if(typeof closeRewardsPanelIfOpen==='function') closeRewardsPanelIfOpen();
    previousTab = currentTab;
    routinesPenaltyInfoOpen = false;
    tasksPenaltyInfoOpen = false;
    const pageIds = { today:'pageToday', routines:'pageRoutines', tasks:'pageTasks', score:'pageScore' };
    const leavingPageId = pageIds[currentTab];
    if(leavingPageId){
      const leavingEl = document.getElementById(leavingPageId);
      if(leavingEl) leavingEl.scrollTop = 0;
    }
    const returnTo = previousTab;
    currentTab = 'settings';
    document.querySelectorAll('nav.tabs button').forEach(b=> b.classList.remove('active'));
    updateHeaderAnimated();
    renderMain();
    pushBackLayer(()=> setTab(returnTo));
  }
});
document.getElementById('fab').addEventListener('click', ()=>{
  if(currentTab==='routines') openAddRoutineModal();
  if(currentTab==='tasks') openAddTaskModal();
});

(async function init(){
  const splashStart = Date.now();
  try{
    await loadState();
    applyNavLabels(); // static nav-tab text isn't covered by any render*() function
    initOnboarding();
    if(!onboardingActive) setTab('today');
    runSilentNotificationCatchUp(); // Category 2: weekly/monthly rating finalized — never a banner
  }catch(e){
    console.error('Failed to load saved data', e);
    showToast(tr('Something went wrong loading your data'));
  }
  // Cloud reconciliation happens in the background, after the local-first load/render above —
  // it never blocks startup or the splash screen. Whichever copy (local vs. cloud) has the newer
  // lastModified wins wholesale — see app-firebase.js for why a simple whole-blob "newest wins"
  // was chosen over field-level merging. If the Firebase module never loads (offline, blocked,
  // etc.), waitForLifyarCloud() just gives up after 5s and the app stays fully local-only, same
  // as it behaves today.
  waitForLifyarCloud(5000).then(async (cloud)=>{
    if(!cloud) return;
    await cloud.ready;
    // If they verified their email on another device/tab since we last saw them, this finishes
    // the sign-in right now (and does its own reconcile + render + toast) — see
    // tryCompletePendingVerification in app-account.js.
    const justCompleted = await tryCompletePendingVerification(onboardingActive ? 'onboarding' : 'settings', true);
    if(justCompleted) return;
    const user = cloud.getUser();
    // Anonymous sessions and not-yet-verified accounts are never backed up (see pushState/
    // pullState in app-firebase.js) — skip the read entirely rather than asking Firestore for a
    // document that, by that same policy, was never written for them.
    if(!user || user.isAnonymous || !user.emailVerified) return;
    const pulled = await reconcileWithCloud();
    if(pulled){
      renderMain();
      showToast(tr('Restored your data from the cloud'));
    }
  }).catch((e)=> console.error('Cloud sync check failed', e));
  if('serviceWorker' in navigator){
    try{
      await navigator.serviceWorker.register('./service-worker.js');
    }catch(e){
      console.warn('Service worker registration failed', e);
    }
  }
  refreshBellBadge();
  checkNotificationPermissionState().then(()=> reconfirmDeviceIfNeeded());
  if(!onboardingActive) promptForNotificationsIfFirstLaunch(); // onboarding's own last step handles this instead
  const elapsed = Date.now() - splashStart;
  const minSplash = 900;
  setTimeout(()=>{
    document.getElementById('splash').classList.add('hide');
  }, Math.max(0, minSplash - elapsed));
})();
