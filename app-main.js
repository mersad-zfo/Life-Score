// ---------- Init ----------
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
  const day = todayStr(); // app's own day boundary (5am cutoff / night-owl aware), not raw calendar midnight
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
  setTab(previousTab);
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
    previousTab = currentTab;
    routinesPenaltyInfoOpen = false;
    tasksPenaltyInfoOpen = false;
    const pageIds = { today:'pageToday', routines:'pageRoutines', tasks:'pageTasks', score:'pageScore' };
    const leavingPageId = pageIds[currentTab];
    if(leavingPageId){
      const leavingEl = document.getElementById(leavingPageId);
      if(leavingEl) leavingEl.scrollTop = 0;
    }
    currentTab = 'settings';
    document.querySelectorAll('nav.tabs button').forEach(b=> b.classList.remove('active'));
    updateHeaderAnimated();
    renderMain();
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
    if(!cloud){ console.log('[Lifyar debug] waitForLifyarCloud timed out — Firebase module never loaded'); return; }
    await cloud.ready;
    // Our own marker (set immediately before navigating to Google — see app-account.js) is a
    // more reliable signal that this page load is a Google-redirect return than Firebase's own
    // getRedirectResult(), which has not reliably flagged the return in testing here — see
    // handlePendingGoogleRedirect() in app-onboarding.js for details. Trust either signal.
    let hadPendingGoogle = false;
    try{ hadPendingGoogle = !!localStorage.getItem(PENDING_GOOGLE_KEY); }catch(e){ /* best effort */ }
    const redirectResult = await cloud.redirectResult;
    const user = cloud.getUser();
    console.log('[Lifyar debug] boot cloud check:', {
      hadPendingGoogle, redirectResult,
      user: user && { uid: user.uid, isAnonymous: user.isAnonymous, email: user.email, displayName: user.displayName }
    });
    if(hadPendingGoogle || (redirectResult && !redirectResult.notARedirect)){
      console.log('[Lifyar debug] -> taking Google-redirect-finish path (handlePendingGoogleRedirect)');
      await handlePendingGoogleRedirect();
      return;
    }
    console.log('[Lifyar debug] -> taking plain background-reconcile path (NOT treated as a Google sign-in return)');
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
