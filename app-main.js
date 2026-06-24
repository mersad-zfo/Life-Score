// ---------- Init ----------
function updateHeader(){
  const el = document.getElementById('headerInfo');
  if(currentTab==='settings'){
    el.innerHTML = `<div class="wordmark page-title">Settings</div>`;
  } else {
    el.innerHTML = `<div class="wordmark">Life Score</div><div class="date" id="todayLabel"></div>`;
    fmtDateLabel();
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
  if(currentTab==='habits') openAddHabitModal();
  if(currentTab==='tasks') openAddTaskModal();
});

(async function init(){
  const splashStart = Date.now();
  await loadState();
  setTab('today');
  if('serviceWorker' in navigator){
    try{
      await navigator.serviceWorker.register('./service-worker.js');
    }catch(e){
      console.warn('Service worker registration failed', e);
    }
  }
  const elapsed = Date.now() - splashStart;
  const minSplash = 900;
  setTimeout(()=>{
    document.getElementById('splash').classList.add('hide');
  }, Math.max(0, minSplash - elapsed));
})();
