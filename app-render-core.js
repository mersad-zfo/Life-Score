// ---------- Rendering dispatcher + shared utils ----------
function renderMain(){
  if(onboardingActive){ renderOnboarding(); return; }
  const main = document.getElementById('main');
  document.getElementById('fab').style.display = (currentTab==='routines'||currentTab==='tasks') ? 'flex' : 'none';
  if(currentTab==='today') return renderToday(main);
  if(currentTab==='routines') return renderRoutines(main);
  if(currentTab==='tasks') return renderTasks(main);
  if(currentTab==='score') return renderScore(main);
  if(currentTab==='settings') return renderSettings(main);
  if(currentTab==='notifications') return renderNotificationsPage(main);
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
