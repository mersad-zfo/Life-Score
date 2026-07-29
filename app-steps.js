// ---------- Steps (this session) ----------
// Optional checklist of sub-items on a Routine or Task, added behind a "+ Add Steps" toggle in
// the creator/edit modals (see app-modals.js), positioned directly above the Difficulty picker.
// Steps split the item's points evenly and award them LIVE — one step's share the moment it's
// checked — via ordinary state.log entries, so Score/Progression need zero extra plumbing
// (getDailyLogPoints()/aggregatePeriod() already sum state.log by date regardless of `kind`).
// See POINT_SYSTEM.md "Steps" for the full rule. The miss-day rule below is explicitly a v1,
// owner-flagged for further refinement later — see DECISIONS.md.

// Splits `base` evenly across `n` steps, folding any rounding remainder into the LAST step so the
// sum always exactly equals `base` (e.g. 20 across 3 steps -> [7,7,6], never 21 or 18 total).
function splitPointsEvenly(base, n){
  if(!n || n<=0) return [];
  const each = Math.round(base/n);
  const list = new Array(n-1).fill(each);
  list.push(base - each*(n-1));
  return list;
}

// ================= Routine steps =================
// Routines keep the full streak/neglect machinery, so their steps interact with it — see
// applyRoutineStepMiss() below and the miss-day table in POINT_SYSTEM.md.

function routineHasSteps(r){ return !!(r.steps && r.steps.length>0); }
function routineStepsBaseAmount(r, cfg){
  const c = cfg || r;
  return r.recurrence==='daily' ? c.basePoints : c.rewardValue;
}
// Live (today's) per-step point values, in step order.
function routineStepPoints(r){
  if(!routineHasSteps(r)) return [];
  return splitPointsEvenly(routineStepsBaseAmount(r), r.steps.length);
}
function routineStepDoneToday(r, stepId){
  const t = todayStr();
  return state.log.some(l=> l.kind==='routine_step' && l.refId===r.id && l.stepId===stepId && l.date===t);
}
function routineStepsDoneCountOn(routineId, dateStr){
  return state.log.filter(l=> l.kind==='routine_step' && l.refId===routineId && l.date===dateStr).length;
}

// Checking the LAST remaining step folds into the routine's normal completion path — streak
// bump, milestones, notifications, same as completeRoutine() (app-consistency.js) — but only
// logs the streak-milestone BONUS on top, since the base points were already logged one-by-one
// as each step was checked (routineReward() = base + bonus; the step entries already cover the
// base half of that sum, so logging the full reward again here would double-count it).
function completeRoutineViaSteps(r){
  const t = todayStr();
  r.previousSnapshot = {
    streak: r.streak, neglect: r.neglect, recoveryChain: r.recoveryChain,
    neglectMilestoneHit: r.neglectMilestoneHit,
    lastCompletedDate: r.lastCompletedDate, lastEvaluatedDate: r.lastEvaluatedDate
  };
  const def = routineMilestoneDef(r);
  const oldStreakCount = milestonesPassed(r.streak, def);
  const wasNeglected = r.neglect > 0;
  const hadNeglectMilestone = !!r.neglectMilestoneHit;
  const next = routineNextStateOnComplete(r);
  r.streak = next.streak; r.neglect = next.neglect; r.recoveryChain = next.recoveryChain;
  r.lastCompletedDate = t; r.lastEvaluatedDate = t;
  const crossedStreakMilestone = milestonesPassed(r.streak, def) > oldStreakCount;
  const recoveredFromNeglect = wasNeglected && r.neglect===0 && hadNeglectMilestone;
  if(r.neglect===0) r.neglectMilestoneHit = false;

  const fullReward = routineReward(r);
  const base = routineStepsBaseAmount(r);
  const bonus = fullReward - base; // 0 if there's no active streak bonus this time
  r.awardedPoints = fullReward;
  state.log.push({id: uid(), kind:'routine', refId: r.id, name: r.name, points: bonus, date: t});
  saveState();
  renderMain();
  if(navigator.vibrate) navigator.vibrate(15);
  triggerBump(`[data-routine="${r.id}"]`);
  triggerPop(`[data-streak="${r.id}"]`);
  triggerPop(`[data-neglect="${r.id}"]`);
  triggerShine(`[data-card-routine="${r.id}"]`);
  playSparkle();
  if(crossedStreakMilestone) triggerConfetti(`[data-card-routine="${r.id}"]`);
  showToast(`+${fullReward} · ${r.name}`);
  evaluateRoutineCompletionNotifications(r, t, { crossedStreakMilestone, recoveredFromNeglect });
  evaluateLiveDailyNotifications();
}
function completeRoutineStep(routineId, stepId){
  const r = state.routines.find(x=>x.id===routineId);
  if(!r || !routineHasSteps(r)) return;
  const t = todayStr();
  if(routineStepDoneToday(r, stepId)) return;
  const idx = r.steps.findIndex(s=>s.id===stepId);
  if(idx<0) return;
  const pts = routineStepPoints(r)[idx];
  const step = r.steps[idx];
  state.log.push({id: uid(), kind:'routine_step', refId: r.id, stepId, name: step.name, points: pts, date: t});
  if(routineStepsDoneCountOn(r.id, t) === r.steps.length){
    completeRoutineViaSteps(r);
  } else {
    saveState();
    renderMain();
    if(navigator.vibrate) navigator.vibrate(10);
    showToast(`+${pts} · ${step.name}`);
  }
}
function uncompleteRoutineStep(routineId, stepId){
  const r = state.routines.find(x=>x.id===routineId);
  if(!r) return;
  const t = todayStr();
  const wasFullyDone = routineDoneToday(r);
  const idx = state.log.findIndex(l=> l.kind==='routine_step' && l.refId===routineId && l.stepId===stepId && l.date===t);
  if(idx<0) return;
  state.log.splice(idx,1);
  if(wasFullyDone){
    // Was already fully complete — unchecking any one step undoes the whole thing, same as the
    // main circle: pulls the streak-bonus entry back out and restores the pre-completion snapshot.
    uncompleteRoutine(routineId);
  } else {
    saveState();
    renderMain();
  }
}
// The main done-circle, for a stepped routine, is a shortcut that checks/unchecks every step at
// once — matches the prototype's completeAll().
function toggleAllRoutineSteps(routineId){
  const r = state.routines.find(x=>x.id===routineId);
  if(!r || !routineHasSteps(r)) return;
  const t = todayStr();
  const allDone = r.steps.every(s=> routineStepDoneToday(r, s.id));
  if(allDone){
    state.log = state.log.filter(l=> !((l.kind==='routine_step'||l.kind==='routine') && l.refId===routineId && l.date===t));
    if(r.previousSnapshot){
      r.streak = r.previousSnapshot.streak; r.neglect = r.previousSnapshot.neglect;
      r.recoveryChain = r.previousSnapshot.recoveryChain; r.neglectMilestoneHit = r.previousSnapshot.neglectMilestoneHit;
      r.lastCompletedDate = r.previousSnapshot.lastCompletedDate; r.lastEvaluatedDate = r.previousSnapshot.lastEvaluatedDate;
      delete r.previousSnapshot;
    }
    r.awardedPoints = null;
    saveState();
    renderMain();
    clearRoutineCompletionNotifications(routineId, t);
    evaluateLiveDailyNotifications();
  } else {
    r.steps.forEach(s=>{ if(!routineStepDoneToday(r, s.id)) completeRoutineStep(routineId, s.id); });
  }
}

// Stepped-routine variant of applyRoutineMiss(), invoked from applyRoutineCatchUp()
// (app-consistency.js) for a past day that had steps in effect (per the VERSIONED config `cfg`,
// never the live routine — same historical-integrity rule as everything else). Points/penalty
// always scale proportionally to the fraction of that day's steps actually checked. Streak/neglect
// only ever move at the two extremes: 0% (falls through to a normal full miss, identical to a
// non-stepped routine) or 100% (never reached here — a 100% day already advanced
// lastEvaluatedDate live, via completeRoutineViaSteps, so catch-up never revisits it). Anything in
// between leaves streak/neglect exactly where they were.
function applyRoutineStepMiss(r, missedDate, cfg){
  const total = cfg.steps.length;
  const doneCount = routineStepsDoneCountOn(r.id, missedDate);
  const fraction = total>0 ? doneCount/total : 0;
  if(fraction<=0){
    applyRoutineMiss(r, missedDate);
    return;
  }
  if(fraction>=1) return; // defensive only — see note above, shouldn't actually occur
  const basePenalty = ROUTINE_PENALTY[r.recurrence] || ROUTINE_PENALTY.daily;
  const penalty = Math.round(basePenalty * (1 - fraction));
  if(penalty > 0){
    state.log.push({id: uid(), kind:'routine_penalty', refId: r.id, name: r.name, points: -Math.abs(penalty), date: missedDate});
  }
  // streak/neglect deliberately untouched here — frozen for any partial day.
}

// ================= Task steps =================
// Tasks have no streak/neglect — steps here are a live-progress checklist over the task's CURRENT
// value (taskCurrentValue(), already decay-aware). Already-checked steps keep the value they were
// logged at (locked in, like any log entry); each still-unchecked step's displayed value is the
// task's remaining current value split across the remaining steps, recomputed live — so checking
// steps can never be used to bank pre-decay points and dodge overdue decay (a step checked later,
// after more decay, simply logs a smaller share, same as completing the whole task later already
// does today). A step, once checked, follows the same same-day-undo rule as everything else —
// checked on an earlier day, it's locked; checked today, tapping it again undoes it.

function taskHasSteps(task){ return !!(task.steps && task.steps.length>0); }
function taskStepDone(task, stepId){
  return state.log.some(l=> l.kind==='task_step' && l.refId===task.id && l.stepId===stepId);
}
function taskStepDoneToday(task, stepId){
  const t = todayStr();
  return state.log.some(l=> l.kind==='task_step' && l.refId===task.id && l.stepId===stepId && l.date===t);
}
function taskStepsAllDone(task){
  return taskHasSteps(task) && task.steps.every(s=> taskStepDone(task, s.id));
}
// Per-step point values in step order — locked/logged value for a done step, a live even split of
// the remaining current value for everything still unchecked.
function taskStepPoints(task){
  if(!taskHasSteps(task)) return [];
  const stepLog = state.log.filter(l=> l.kind==='task_step' && l.refId===task.id);
  const doneIds = new Set(stepLog.map(l=>l.stepId));
  const doneSum = stepLog.reduce((s,l)=>s+l.points, 0);
  const remainingCount = task.steps.filter(s=>!doneIds.has(s.id)).length;
  const remainingSplit = splitPointsEvenly(taskCurrentValue(task) - doneSum, remainingCount);
  let ri = 0;
  return task.steps.map(s=>{
    if(doneIds.has(s.id)){
      const entry = stepLog.find(l=>l.stepId===s.id);
      return entry ? entry.points : 0;
    }
    return remainingSplit[ri++];
  });
}
function completeTaskStep(taskId, stepId){
  const task = state.tasks.find(x=>x.id===taskId);
  if(!task || !taskHasSteps(task) || task.completedDate) return;
  if(taskStepDone(task, stepId)) return;
  const idx = task.steps.findIndex(s=>s.id===stepId);
  if(idx<0) return;
  const pts = taskStepPoints(task)[idx]; // computed BEFORE logging this step
  const step = task.steps[idx];
  const t = todayStr();
  state.log.push({id: uid(), kind:'task_step', refId: task.id, stepId, name: step.name, points: pts, date: t});
  if(taskStepsAllDone(task)){
    // Every step checked: the step entries already sum to the task's current value (by
    // construction above), so this just marks the task done — no separate completion entry.
    task.completedDate = t;
    task.awardedPoints = state.log.filter(l=>l.kind==='task_step' && l.refId===taskId).reduce((s,l)=>s+l.points, 0);
    saveState();
    renderMain();
    if(navigator.vibrate) navigator.vibrate(15);
    triggerShine(`[data-card-task="${taskId}"]`);
    playSparkle();
    showToast(trTaskDoneToast(task.awardedPoints, task.name));
    evaluateLiveDailyNotifications();
  } else {
    saveState();
    renderMain();
    if(navigator.vibrate) navigator.vibrate(10);
    showToast(`+${pts} · ${step.name}`);
  }
}
function uncompleteTaskStep(taskId, stepId){
  const task = state.tasks.find(x=>x.id===taskId);
  if(!task) return;
  if(!taskStepDoneToday(task, stepId)) return; // same-day-undo only, matches the rest of the app
  const wasFullyDone = !!task.completedDate;
  const t = todayStr();
  const idx = state.log.findIndex(l=> l.kind==='task_step' && l.refId===taskId && l.stepId===stepId && l.date===t);
  if(idx<0) return;
  state.log.splice(idx,1);
  if(wasFullyDone){
    task.completedDate = null;
    task.awardedPoints = null;
  }
  saveState();
  renderMain();
  evaluateLiveDailyNotifications();
}
// Main done-square shortcut for a stepped task: checks every remaining step, or undoes every step
// that was checked TODAY (earlier-day steps stay locked in, same as the rest of this feature).
function toggleAllTaskSteps(taskId){
  const task = state.tasks.find(x=>x.id===taskId);
  if(!task || !taskHasSteps(task)) return;
  if(taskStepsAllDone(task)){
    task.steps.forEach(s=>{ if(taskStepDoneToday(task, s.id)) uncompleteTaskStep(taskId, s.id); });
  } else {
    task.steps.forEach(s=>{ if(!taskStepDone(task, s.id)) completeTaskStep(taskId, s.id); });
  }
}

// ================= Shared card render helpers =================
// Used by app-render-today.js / app-render-routines.js / app-render-tasks.js so the steps UI
// (emoji badge, toggle row, collapsible step list) is built and wired identically everywhere a
// stepped item's card can appear.

// Session-only (never persisted) — which cards currently have their Steps list expanded. A plain
// module-level Set is enough: it survives the innerHTML rewrites that every check/uncheck
// triggers (so the toggle stays open across those), and naturally resets on reload, matching
// "stays open until manually closed or until the user leaves the tab".
const openStepsCards = new Set();

function stepsDoneCountLive(kind, item){
  if(kind==='routine') return item.steps.filter(s=> routineStepDoneToday(item, s.id)).length;
  return item.steps.filter(s=> taskStepDone(item, s.id)).length;
}
// The pill, for a stepped item that isn't fully done yet, shows what's still left to earn — not
// the fixed total — so it visibly shrinks as steps get checked and (via the normal done-hides-
// the-pill logic already in each render file) disappears entirely once the last one is checked.
function routineStepsRemainingPoints(r){
  const points = routineStepPoints(r);
  return r.steps.reduce((sum,s,i)=> sum + (routineStepDoneToday(r, s.id) ? 0 : points[i]), 0);
}
function taskStepsRemainingPoints(task){
  const points = taskStepPoints(task);
  return task.steps.reduce((sum,s,i)=> sum + (taskStepDone(task, s.id) ? 0 : points[i]), 0);
}
// Wraps an emoji span with the small "done/total" badge overlay, only when the item has steps.
function emojiWithStepsBadgeHtml(emojiClass, emoji, item, kind){
  if(!item.steps || item.steps.length===0) return `<span class="${emojiClass}">${emoji}</span>`;
  const doneCount = stepsDoneCountLive(kind, item);
  const n = (v)=> curLang()==='fa' ? numFa(v) : v;
  return `<span class="emoji-badge-wrap">
    <span class="${emojiClass}">${emoji}</span>
    <span class="emoji-badge${doneCount>0?' show':''}">${n(doneCount)}/${n(item.steps.length)}</span>
  </span>`;
}
// The "Steps" toggle row — chevron, then the label, then the progress dots — meant to sit as one
// of a card's item-sub lines.
function stepsToggleRowHtml(kind, item){
  if(!item.steps || item.steps.length===0) return '';
  const isOpen = openStepsCards.has(item.id);
  const dots = item.steps.map(s=>{
    const done = kind==='routine' ? routineStepDoneToday(item, s.id) : taskStepDone(item, s.id);
    return `<span class="dot${done?' done':''}"></span>`;
  }).join('');
  return `<div class="item-sub">
    <span class="steps-toggle${isOpen?' open':''}" data-steps-toggle="${item.id}">
      <span class="chev">▸</span> ${tr('Steps')} <span class="dot-stack">${dots}</span>
    </span>
  </div>`;
}
// The collapsible step-list body — sits below a card's main .row, full width. Numbered like the
// modal's step editor. No point value shows until a step is checked — then its earned share
// appears in green, "+N".
function stepsBodyHtml(kind, item){
  if(!item.steps || item.steps.length===0) return '';
  const isOpen = openStepsCards.has(item.id);
  const points = kind==='routine' ? routineStepPoints(item) : taskStepPoints(item);
  const n = (v)=> curLang()==='fa' ? numFa(v) : v;
  const lines = item.steps.map((s,i)=>{
    const done = kind==='routine' ? routineStepDoneToday(item, s.id) : taskStepDone(item, s.id);
    const lockedPast = kind==='task' && done && !taskStepDoneToday(item, s.id);
    const ptsHtml = done ? `<div class="step-pts done">+${n(points[i])}</div>` : `<div class="step-pts"></div>`;
    return `
    <div class="step-line">
      <span class="step-line-num">${i+1}.</span>
      <div class="step-check${done?' done':''}${lockedPast?' step-locked':''}" data-step-check="${item.id}:${s.id}">${done?'✓':''}</div>
      <div class="step-name${done?' done':''}">${escapeHtml(s.name)}</div>
      ${ptsHtml}
    </div>`;
  }).join('');
  return `<div class="steps-body${isOpen?' open':''}" data-steps-body="${item.id}"><div class="steps-body-inner">${lines}</div></div>`;
}
// Wires the toggle row + individual step checkboxes for one card. Call once per card after
// inserting its HTML into the DOM (main.innerHTML = ... already does this for the whole list).
// Also spawns the same floating "+N" pill animation the Home tab already uses for a normal (non-
// stepped) completion — one per step checked, using that step's own share of the points — but
// only where a pill anchor actually exists for this item (data-pill-routine/data-pill-task are
// Home-tab-only, so this quietly no-ops on the Routines/Tasks tabs, exactly like it always has for
// non-stepped items there).
function wireStepsUi(container, kind, item){
  if(!item.steps || item.steps.length===0) return;
  const toggle = container.querySelector(`[data-steps-toggle="${item.id}"]`);
  const body = container.querySelector(`[data-steps-body="${item.id}"]`);
  if(toggle && body){
    toggle.addEventListener('click', (e)=>{
      e.stopPropagation();
      const opening = !toggle.classList.contains('open');
      toggle.classList.toggle('open', opening);
      body.classList.toggle('open', opening);
      if(opening) openStepsCards.add(item.id); else openStepsCards.delete(item.id);
    });
  }
  container.querySelectorAll(`[data-step-check^="${item.id}:"]`).forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      if(el.classList.contains('step-locked')) return; // an earlier-day task step — locked in
      const stepId = el.dataset.stepCheck.split(':').slice(1).join(':');
      const done = el.classList.contains('done');
      if(!done){
        const pillSel = kind==='routine' ? `[data-pill-routine="${item.id}"]` : `[data-pill-task="${item.id}"]`;
        const pillEl = container.querySelector(pillSel);
        if(pillEl){
          const idx = item.steps.findIndex(s=>s.id===stepId);
          const pts = (kind==='routine' ? routineStepPoints(item) : taskStepPoints(item))[idx];
          spawnFloatingPoints(pillEl, (pts>=0?'+':'') + pts, pts<0);
        }
      }
      if(kind==='routine'){
        if(done) uncompleteRoutineStep(item.id, stepId); else completeRoutineStep(item.id, stepId);
      } else {
        if(done) uncompleteTaskStep(item.id, stepId); else completeTaskStep(item.id, stepId);
      }
    });
  });
}
