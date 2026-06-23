// ---------- Init ----------
function setTab(tab){
  currentTab = tab;
  document.querySelectorAll('nav.tabs button').forEach(b=> b.classList.toggle('active', b.dataset.tab===tab));
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
    renderMain();
  }
});
document.getElementById('fab').addEventListener('click', ()=>{
  if(currentTab==='habits') openAddHabitModal();
  if(currentTab==='tasks') openAddTaskModal();
});

(async function init(){
  fmtDateLabel();
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
