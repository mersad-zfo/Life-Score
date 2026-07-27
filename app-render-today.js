// ---------- Home tab ----------
// The ring hero (SVG ring + fraction + rating pill + tally) is a *persistent* element — it's
// never innerHTML-replaced, only updated in place, so its fill animation and glow comet can run
// smoothly across renders instead of snapping. renderToday() below only ever rebuilds the
// routine/task card lists underneath it (#homeLists).
let lastKnownTodayRating = undefined;
let lastKnownTodayReceived = undefined;
let lastKnownTodayBase = undefined;
function ratingPillClass(rating){
  const classMap = {
    'NOT GOOD':  'rating-notgood',
    'GOOD':      'rating-good',
    'GREAT!':    'rating-great',
    'AWESOME!!!':'rating-awesome',
  };
  return classMap[rating] || 'rating-none';
}


// ---- Ring: fill % reflects earned points vs base points (received/base), NOT task-done-count.
// While the ring is actively filling (0% < fill < 100%) a soft comet trail sweeps the filled arc.
// Once it reaches a full circle (100%+), the comet is swapped for a gentle breathing halo instead.
const HOME_RING_R = 98, HOME_RING_C = 2 * Math.PI * HOME_RING_R;
const HOME_COMET_STEPS = 6;
let homeCometFillLen = 0;
let homeCometActive = false;
let homeCometRAFStarted = false;

function ensureHomeCometBuilt(){
  const g = document.getElementById('cometTrail');
  if(!g || g.children.length) return;
  for(let i=0;i<HOME_COMET_STEPS;i++){
    const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx', HOME_RING_R+17); c.setAttribute('cy', HOME_RING_R+17); c.setAttribute('r', HOME_RING_R);
    c.setAttribute('stroke-width', (13 - i*0.9).toFixed(1));
    c.classList.add('comet-seg');
    g.appendChild(c);
  }
}
function tickHomeComet(now){
  const g = document.getElementById('cometTrail');
  if(g && homeCometActive){
    const period = 2600;
    const t = (now % period) / period; // 0..1
    const travel = Math.max(0, homeCometFillLen - 18);
    // ease in/out of the sweep + fade at both ends so the loop reset is invisible
    const eased = t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
    const headPos = eased * travel;
    const fadeOpacity = t<0.08 ? t/0.08 : (t>0.92 ? (1-t)/0.08 : 1);
    Array.from(g.children).forEach((c,i)=>{
      const len = 18 - i*2.6;
      c.setAttribute('stroke-dasharray', `${Math.max(len,1)} 9999`);
      c.setAttribute('stroke-dashoffset', -(headPos - i*4));
      c.style.opacity = ((0.55 - i*0.08) * fadeOpacity).toFixed(2);
    });
  }
  requestAnimationFrame(tickHomeComet);
}
function startHomeCometLoop(){
  if(homeCometRAFStarted) return;
  homeCometRAFStarted = true;
  requestAnimationFrame(tickHomeComet);
}

function updateHomeRing(pct, animateFromZero, isAwesome){
  const progressEl = document.getElementById('ringProgress');
  if(!progressEl) return;
  const clamped = Math.max(0, Math.min(1, pct));
  if(progressEl.style.strokeDasharray !== String(HOME_RING_C)){
    progressEl.style.strokeDasharray = HOME_RING_C;
    progressEl.style.strokeDashoffset = HOME_RING_C;
  }
  const target = HOME_RING_C * (1 - clamped);
  if(animateFromZero){
    progressEl.style.transition = 'none';
    progressEl.style.strokeDashoffset = HOME_RING_C;
    progressEl.getBoundingClientRect(); // force reflow once
    progressEl.style.transition = 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)';
    requestAnimationFrame(()=>{ progressEl.style.strokeDashoffset = target; });
  } else {
    progressEl.style.transition = 'stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)';
    progressEl.style.strokeDashoffset = target;
  }

  const isComplete = clamped >= 1;
  const isFilling = clamped > 0 && clamped < 1;
  progressEl.classList.toggle('pulse-halo', isComplete);
  progressEl.classList.toggle('awesome', !!isAwesome);
  ensureHomeCometBuilt();
  const cometG = document.getElementById('cometTrail');
  if(cometG) cometG.classList.toggle('active', isFilling);
  homeCometFillLen = HOME_RING_C * clamped;
  homeCometActive = isFilling;
  startHomeCometLoop();
}

function updateHomeHero(received, base, rating, doneCount, totalCount, animateRing){
  const pct = base>0 ? received/base : 0;
  updateHomeRing(pct, animateRing, rating==='AWESOME!!!');

  const labelEl = document.getElementById('ringMiniLabel');
  if(labelEl) labelEl.textContent = tr("Today's score");

  const receivedEl = document.getElementById('sfReceived');
  const baseEl = document.getElementById('sfBase');
  const newReceived = Math.max(0, Math.round(received));
  const newBase = Math.round(base);
  if(receivedEl){
    if(animateRing){
      receivedEl.textContent = newReceived;
    } else if(lastKnownTodayReceived !== undefined && lastKnownTodayReceived !== newReceived){
      animateNumberCount(receivedEl, lastKnownTodayReceived, newReceived, 500);
    } else if(lastKnownTodayReceived === undefined){
      receivedEl.textContent = newReceived;
    }
  }
  if(baseEl) baseEl.textContent = newBase;
  lastKnownTodayReceived = newReceived;
  lastKnownTodayBase = newBase;

  const pillEl = document.getElementById('ratingPill');
  if(pillEl){
    const rc = ratingPillClass(rating);
    pillEl.className = 'rating-pill ' + rc;
    pillEl.textContent = rating ? tr(rating) : tr('no rating yet');
    if(!animateRing && lastKnownTodayRating !== undefined && rating !== lastKnownTodayRating){
      const glowClass = {'NOT GOOD':'glow-notgood', 'GOOD':'glow-good', 'GREAT!':'glow-great', 'AWESOME!!!':'glow-awesome'}[rating];
      if(glowClass){
        pillEl.classList.add(glowClass);
        setTimeout(()=> pillEl.classList.remove(glowClass), 800);
      }
    }
  }
  lastKnownTodayRating = rating;

  const tallyEl = document.getElementById('dailyTally');
  if(tallyEl) tallyEl.innerHTML = totalCount>0 ? trTallyLine(doneCount, totalCount) : '';
}

function renderToday(listsEl, animateRing){
  const t = todayStr();
  // Routines due today: all daily routines + weekly/monthly routines that are due/overdue/done-today.
  const dueRoutines = routinesForToday();
  // Upcoming (not-due-yet) tasks are hidden from Home entirely, so they shouldn't pad the tally
  // denominator either — unless completed early, in which case they're a real "done today" win.
  // A task completed on some earlier day must NOT count here at all (taskState() is computed from
  // dueDate alone, so it says nothing about completion — without the !completedDate guard, an old
  // completed task would keep inflating today's denominator forever).
  const tasksForTally = state.tasks.filter(task=> !task.deleted &&
    ((!task.completedDate && taskState(task)!=='upcoming') || taskDoneToday(task)));
  const tallyDone = dueRoutines.filter(h=>routineDoneToday(h)).length + tasksForTally.filter(task=>taskDoneToday(task)).length;
  const tallyTotal = dueRoutines.length + tasksForTally.length;
  const todayRating = getTodayRating();
  const todayScore = getScores().daily;

  updateHomeHero(todayScore.received, todayScore.base, todayRating, tallyDone, tallyTotal, !!animateRing);

  const main = listsEl;
  let html = `<div class="section-label">${tr('Routines')}</div>`;
  if(dueRoutines.length===0){
    html += `<div class="card" style="text-align:center; color:var(--ink-soft); font-size:13px;">${tr('No routines due today.')}</div>`;
  } else {
    html += `<div id="todayRoutinesList">`;
    dueRoutines.forEach(h=>{
      const done = routineDoneToday(h);
      const pointsPreview = done ? h.awardedPoints : routinePreviewReward(h);
      const rState = routineState(h);
      const lines = [];
      if(rState==='streak'){
        lines.push(`<div class="item-sub"><span class="streak-chip" data-streak="${h.id}">${streakEmoji(h)} ×${h.streak}</span></div>`);
      } else if(rState==='neglect'){
        lines.push(`<div class="item-sub"><span class="neglect-chip" data-neglect="${h.id}">${neglectEmoji(h)} ×${h.neglect}</span></div>`);
      }
      if(h.time) lines.push(`<div class="item-sub">${timeChipHtml(h.time)}</div>`);
      if(h.description) lines.push(`<div class="item-sub">${escapeHtml(h.description)}</div>`);
      const subtitleHtml = lines.join('');
      html += `
      <div class="card row" data-card-routine="${h.id}">
        <span class="emoji-today">${h.emoji||ROUTINE_FALLBACK_EMOJI}</span>
        <div style="flex:1;">
          <div class="item-name">${escapeHtml(h.name)}</div>
          ${subtitleHtml}
        </div>
        ${done ? '' : `<span class="pill ${pointsPreview<0?'negative':''}" data-pill-routine="${h.id}">${pointsPreview}</span>`}
        <button class="btn-done ${done?'done':''}" data-routine="${h.id}">${done? '✓' : ''}</button>
      </div>`;
    });
    html += `</div>`;
  }
  // Upcoming (not-due-yet) tasks never appear on Home — only Due/Overdue are "active today".
  const openTasks = state.tasks.filter(task=>!task.deleted && !task.completedDate && taskState(task)!=='upcoming');
  const doneTasks = state.tasks.filter(task=>!task.deleted && taskDoneToday(task));
  html += `<div class="section-label">${tr('Open tasks')}</div>`;
  if(openTasks.length===0){
    html += `<div class="card" style="text-align:center; color:var(--ink-soft); font-size:13px;">${tr('No open tasks. Nice.')}</div>`;
  } else {
    html += `<div id="todayTasksList">`;
    openTasks.forEach(task=>{
      const val = taskDisplayValue(task);
      const st = taskState(task);
      const taskLines = [];
      if(task.time) taskLines.push(`<div class="item-sub">${timeChipHtml(task.time)}</div>`);
      if(task.description) taskLines.push(`<div class="item-sub">${escapeHtml(task.description)}</div>`);
      taskLines.push(`<div class="item-sub">${st==='overdue' ? trTaskOverdueShort() : trTaskDueTodayShort()}</div>`);
      html += `
      <div class="card row" data-card-task="${task.id}">
        <span class="emoji-today">${task.emoji||TASK_DEFAULT_EMOJI}</span>
        <div style="flex:1;">
          <div class="item-name">${escapeHtml(task.name)}</div>
          ${taskLines.join('')}
        </div>
        <span class="pill ${val<0?'negative':''}" data-pill-task="${task.id}">${val}</span>
        <button class="btn-done-square" data-complete-task-today="${task.id}">✓</button>
      </div>`;
    });
    html += `</div>`;
  }
  if(doneTasks.length>0){
    html += `<div class="section-label">${tr('Completed today')}</div>`;
    doneTasks.forEach(task=>{
      html += `
      <div class="card row task-row-done" data-card-task="${task.id}">
        <span class="emoji-today">${task.emoji||TASK_DEFAULT_EMOJI}</span>
        <div style="flex:1;">
          <div class="item-name">${escapeHtml(task.name)}</div>
        </div>
        <button class="btn-undo" data-undo-task="${task.id}">${tr('Undo')}</button>
      </div>`;
    });
  }
  main.innerHTML = html;

  main.querySelectorAll('[data-routine]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.routine;
      const h = state.routines.find(x=>x.id===id);
      if(routineDoneToday(h)){
        uncompleteRoutine(id);
      } else {
        const pillEl = main.querySelector(`[data-pill-routine="${id}"]`);
        if(pillEl){
          const num = Math.round(parseFloat(pillEl.textContent));
          spawnFloatingPoints(pillEl, (num>=0?'+':'') + num, num<0);
        }
        completeRoutine(id);
      }
    });
  });
  main.querySelectorAll('[data-undo-task]').forEach(btn=>{
    btn.addEventListener('click', ()=> uncompleteTask(btn.dataset.undoTask));
  });
  main.querySelectorAll('[data-complete-task-today]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.completeTaskToday;
      const pillEl = main.querySelector(`[data-pill-task="${id}"]`);
      if(pillEl){
        const num = Math.round(parseFloat(pillEl.textContent));
        spawnFloatingPoints(pillEl, (num>=0?'+':'') + num, num<0);
      }
      completeTask(id);
    });
  });
}
