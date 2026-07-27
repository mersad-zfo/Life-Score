// ---------- Rendering dispatcher + shared utils ----------
// The four main tabs (today/routines/tasks/score) live as persistent DOM pages inside a
// horizontally-sliding track (#pageTrack), matching the bg-track blob layer behind them.
// Settings/Notifications are not part of that slide — they render into #overlayMain, a
// full-screen layer that fades/slides in on top, independent of tab index.
const TAB_SLIDE_INDEX = { today:0, routines:1, tasks:2, score:3 };
let onNextTodayRenderAnimateRing = true; // true on first load and whenever we slide *into* Home

function slideToTab(tab){
  const i = TAB_SLIDE_INDEX[tab];
  if(i===undefined) return; // settings/notifications aren't part of the slide
  const pct = -(i*25);
  const bgTrack = document.getElementById('bgTrack');
  const pageTrack = document.getElementById('pageTrack');
  if(bgTrack) bgTrack.style.transform = `translateX(${pct}%)`;
  if(pageTrack) pageTrack.style.transform = `translateX(${pct}%)`;
}

function renderMain(){
  if(onboardingActive){ renderOnboarding(); return; }
  const fab = document.getElementById('fab');
  fab.classList.toggle('show', currentTab==='routines' || currentTab==='tasks');

  const overlay = document.getElementById('overlayMain');
  const isOverlayTab = (currentTab==='settings' || currentTab==='notifications');
  overlay.classList.toggle('show', isOverlayTab);

  if(!isOverlayTab) slideToTab(currentTab);

  if(currentTab==='today'){
    const animate = onNextTodayRenderAnimateRing;
    onNextTodayRenderAnimateRing = false;
    return renderToday(document.getElementById('homeLists'), animate);
  }
  if(currentTab==='routines') return renderRoutines(document.getElementById('pageRoutines'));
  if(currentTab==='tasks') return renderTasks(document.getElementById('pageTasks'));
  if(currentTab==='score') return renderScore(document.getElementById('pageScore'));
  if(currentTab==='settings') return renderSettings(document.getElementById('overlayContent'));
  if(currentTab==='notifications') return renderNotificationsPage(document.getElementById('overlayContent'));
}

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// Tweens an element's text content from one integer to another (e.g. Today's score updating).
function animateNumberCount(el, from, to, duration){
  if(!el || from===to) return;
  const start = performance.now();
  function tick(now){
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if(t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Spawns a "+40"-style label that floats up and fades over the given element, then removes itself.
function spawnFloatingPoints(anchorEl, text, negative){
  if(!anchorEl) return;
  const rect = anchorEl.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'floating-points' + (negative ? ' negative' : '');
  el.textContent = text;
  el.style.left = (rect.left + rect.width/2) + 'px';
  el.style.top = rect.top + 'px';
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 1000);
}
