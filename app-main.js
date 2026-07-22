// ---------- Init ----------
const TAB_PAGE_TITLES = { routines: 'Your routines', tasks: 'Your tasks', score: 'Your score', settings: 'Settings', notifications: 'Notifications' };
function headerBackAction(){
  if(currentTab==='settings'){ backupTapped = false; restoreTapped = false; }
  setTab(previousTab);
}
function updateHeader(){
  const el = document.getElementById('headerInfo');
  document.getElementById('bellBtn').style.display = (currentTab==='settings' || currentTab==='notifications') ? 'none' : '';
  if(currentTab==='today'){
    el.innerHTML = `<div class="wordmark">Life Score</div><div class="date" id="todayLabel"></div>`;
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
function setTab(tab){
  currentTab = tab;
  document.querySelectorAll('nav.tabs button').forEach(b=> b.classList.toggle('active', b.dataset.tab===tab));
  updateHeader();
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
    currentTab = 'settings';
    backupTapped = false;
    restoreTapped = false;
    document.querySelectorAll('nav.tabs button').forEach(b=> b.classList.remove('active'));
    updateHeader();
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
