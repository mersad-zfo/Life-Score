const STORE_KEY = 'lifescore_state_v1';
let state = { routines: [], tasks: [], log: [], profile: null, settings: { theme: 'system', sound: true }, session: { loggedIn: false } };
let currentTab = 'today';
let previousTab = 'today';
let storageReady = false;
let allClearDismissed = false;
let backupTapped = false;
let restoreTapped = false;

function ensureStateShape(){
  // Migration: older saved data used "habits" (state.habits, log kind 'habit') before the
  // Habit -> Routine rename. Without this, state.routines would be undefined on real devices
  // with existing data, crashing the routine catch-up loop at load.
  if(!state.routines && state.habits){
    state.routines = state.habits;
    delete state.habits;
  }
  if(!state.routines) state.routines = [];
  if(state.log){
    state.log.forEach(l=>{ if(l.kind==='habit') l.kind = 'routine'; });
  }
  if(!state.profile) state.profile = null;
  if(!state.settings) state.settings = { theme: 'system', sound: true };
  if(state.settings.theme===undefined) state.settings.theme = 'system';
  if(state.settings.sound===undefined) state.settings.sound = true;
  if(!state.session) state.session = { loggedIn: !!state.profile };
  if(state.session.loggedIn===undefined) state.session.loggedIn = !!state.profile;
}

function applyTheme(){
  const t = state.settings.theme;
  let dark;
  if(t==='dark') dark = true;
  else if(t==='light') dark = false;
  else dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.classList.toggle('dark-theme', dark);
}
if(window.matchMedia){
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{
    if(state.settings.theme==='system') applyTheme();
  });
}

function playSparkle(){
  if(!state.settings.sound) return;
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [1400, 1800, 2200];
    notes.forEach((freq, i)=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.07;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime + i*0.07;
      osc.start(start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.stop(start + 0.26);
    });
    setTimeout(()=> ctx.close(), 600);
  }catch(e){ /* audio unavailable, fail silently */ }
}

function todayStr(d=new Date()){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function daysBetween(a,b){
  const A = new Date(a+'T00:00:00'), B = new Date(b+'T00:00:00');
  return Math.round((B-A)/86400000);
}
function addDays(dateStr, n){
  const d = new Date(dateStr+'T00:00:00');
  d.setDate(d.getDate()+n);
  return todayStr(d);
}
function fmtDateLabel(){
  const opts = {weekday:'long', month:'long', day:'numeric'};
  document.getElementById('todayLabel').textContent = new Date().toLocaleDateString(undefined, opts);
}
function uid(){ return Math.random().toString(36).slice(2,9); }

// ---------- Emoji auto-pick ----------
const ROUTINE_FALLBACK_EMOJI = '🎯';
const TASK_DEFAULT_EMOJI = '📋';
const EMOJI_VARIETY = {
  food: ['🍳','🍽️','🥗','🍕'],
  eat: ['🍳','🍽️','🥗'],
  cook: ['🍳','🍲','👨‍🍳'],
  meal: ['🍽️','🍲','🥗'],
  exercise: ['🏋️','🏃','🤸'],
  sport: ['⚽','🏀','🎾'],
};
const EMOJI_SINGLE = {
  brush: '🦷', teeth: '🦷',
  shower: '🚿', bath: '🚿',
  workout: '🏋️', gym: '🏋️',
  walk: '🏃', run: '🏃', jog: '🏃',
  sleep: '😴', bed: '😴', nap: '😴',
  water: '💧', drink: '💧', hydrate: '💧',
  read: '📖', book: '📖',
  clean: '🧹', tidy: '🧹', dishes: '🧹',
  study: '📚', homework: '📚',
  meditate: '🧘', yoga: '🧘',
  journal: '📝', write: '📝',
  stretch: '🤸',
  vitamin: '💊', medication: '💊', medicine: '💊',
  skincare: '🧴', skin: '🧴',
  laundry: '🧺',
  pray: '🙏',
  walk_dog: '🐕', dog: '🐕', pet: '🐾',
  call: '📞', dentist: '🦷', doctor: '🩺',
};
function pickRoutineEmoji(name){
  const n = (name||'').toLowerCase();
  for(const key in EMOJI_VARIETY){
    if(n.includes(key)){
      const pool = EMOJI_VARIETY[key];
      return pool[Math.floor(Math.random()*pool.length)];
    }
  }
  for(const key in EMOJI_SINGLE){
    if(n.includes(key)) return EMOJI_SINGLE[key];
  }
  return ROUTINE_FALLBACK_EMOJI;
}

async function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){ state = JSON.parse(raw); }
  }catch(e){ /* no existing data yet, or storage unavailable */ }
  ensureStateShape();
  pruneStaleCompletedTasks();
  applyDuePenalties();
  applyRoutineCatchUp();
  applyTheme();
  storageReady = true;
}
async function saveState(){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }catch(e){
    console.error('Save failed', e);
    showToast('Could not save — try again');
  }
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=> t.classList.remove('show'), 1800);
}

// ---------- Routine logic (Routine Consistency System) ----------
// A routine is always in exactly one state: Streak (streak>0), Neglect (neglect>0), or Neutral (both 0).
// Configurable safety-net thresholds for streak drops on a missed day — edit this array to retune long-term values.
const ROUTINE_SAFETY_NETS = [7, 14, 30, 60, 90, 180, 270, 365];

function ensureRoutineShape(r){
  if(r.neglect===undefined) r.neglect = 0;
  if(r.recoveryChain===undefined) r.recoveryChain = false;
  if(r.lastEvaluatedDate===undefined){
    // Migrating older data, or a brand-new routine: don't invent retroactive misses —
    // just start tracking from "as of yesterday" so today's catch-up loop has nothing to replay.
    r.lastEvaluatedDate = r.lastCompletedDate || addDays(todayStr(), -1);
  }
}
function routineState(r){
  if(r.streak > 0) return 'streak';
  if(r.neglect > 0) return 'neglect';
  return 'neutral';
}
// Largest safety-net value strictly less than `value`; 0 if none (i.e. drop all the way to Neutral).
function nearestLowerNet(value, nets){
  let best = 0;
  for(const n of nets){ if(n < value && n > best) best = n; }
  return best;
}
function routineIncrement(basePoints){
  return Math.max(1, Math.round(basePoints*0.1));
}
// reward formula: streak and neglect are perfect mirrors around basePoints, floored at 0.
function routineReward(streakAfter, neglectAfter, basePoints){
  const inc = routineIncrement(basePoints);
  const reward = basePoints + Math.floor(streakAfter/5)*inc - Math.floor(neglectAfter/5)*inc;
  return Math.max(0, reward);
}
// Pure function: what streak/neglect/recoveryChain would result from completing TODAY, without mutating.
function routineNextStateOnComplete(r){
  if(r.streak > 0){
    return { streak: r.streak + 1, neglect: 0, recoveryChain: false };
  }
  if(r.neglect > 0){
    const newNeglect = Math.round(r.neglect / 2);
    return { streak: 0, neglect: newNeglect, recoveryChain: newNeglect > 0 };
  }
  return { streak: 1, neglect: 0, recoveryChain: false }; // Neutral
}
// Preview-only: the reward the user would get if they tapped complete right now (does not mutate).
function routinePreviewReward(r){
  const next = routineNextStateOnComplete(r);
  return routineReward(next.streak, next.neglect, r.basePoints);
}
function routineDoneToday(r){
  return r.lastCompletedDate === todayStr();
}
// Apply exactly one missed-day transition in place. Mirrors the completion rules:
// Streak misses drop to the nearest lower safety net (0 = Neutral).
// Neglect misses: +1 normally, but a ONE-TIME ×1.5 relapse if this is the first miss right after a recovery completion.
// Neutral misses: neglect becomes 1.
function applyRoutineMiss(r){
  if(r.streak > 0){
    r.streak = nearestLowerNet(r.streak, ROUTINE_SAFETY_NETS);
    r.recoveryChain = false;
  } else if(r.neglect > 0){
    if(r.recoveryChain){
      r.neglect = Math.round(r.neglect * 1.5);
      r.recoveryChain = false; // the relapse multiplier fires once per recovery chain, then it's gone
    } else {
      r.neglect += 1;
    }
  } else {
    r.neglect = 1;
  }
}
// Replays every missed day between a routine's last-evaluated date and yesterday, in order —
// so the once-per-chain relapse rule and net-drop sequencing stay correct regardless of how
// many days the app was closed. Today itself is never evaluated as a miss while still in progress
// (same fairness rule used for recurring task penalties).
function applyRoutineCatchUp(){
  const t = todayStr();
  state.routines.forEach(r=>{
    ensureRoutineShape(r);
    let d = addDays(r.lastEvaluatedDate, 1);
    while(d < t){
      applyRoutineMiss(r);
      r.lastEvaluatedDate = d;
      d = addDays(d, 1);
    }
  });
}
function completeRoutine(id){
  const r = state.routines.find(x=>x.id===id);
  if(!r || routineDoneToday(r)) return;
  ensureRoutineShape(r);
  const t = todayStr();

  // Snapshot the full pre-completion state so same-day undo can restore it exactly —
  // halving/net-drops aren't cleanly reversible by un-doing math, so we just restore the snapshot.
  r.previousSnapshot = {
    streak: r.streak,
    neglect: r.neglect,
    recoveryChain: r.recoveryChain,
    lastCompletedDate: r.lastCompletedDate,
    lastEvaluatedDate: r.lastEvaluatedDate
  };

  const next = routineNextStateOnComplete(r);
  r.streak = next.streak;
  r.neglect = next.neglect;
  r.recoveryChain = next.recoveryChain;
  r.lastCompletedDate = t;
  r.lastEvaluatedDate = t;

  const pts = routineReward(r.streak, r.neglect, r.basePoints);
  r.awardedPoints = pts;
  state.log.push({id: uid(), kind:'routine', refId: r.id, name: r.name, points: pts, date: t});
  saveState();
  renderMain();
  if(navigator.vibrate) navigator.vibrate(15);
  triggerBump(`[data-routine="${id}"]`);
  triggerPop(`[data-streak="${id}"]`);
  triggerPop(`[data-neglect="${id}"]`);
  triggerShine(`[data-card-routine="${id}"]`);
  playSparkle();
  showToast(`+${pts} · ${r.name}`);
}
function uncompleteRoutine(id){
  const r = state.routines.find(x=>x.id===id);
  if(!r || !routineDoneToday(r)) return;
  const t = todayStr();
  const idx = state.log.findIndex(l=> l.kind==='routine' && l.refId===id && l.date===t);
  if(idx>-1) state.log.splice(idx,1);
  if(r.previousSnapshot){
    r.streak = r.previousSnapshot.streak;
    r.neglect = r.previousSnapshot.neglect;
    r.recoveryChain = r.previousSnapshot.recoveryChain;
    r.lastCompletedDate = r.previousSnapshot.lastCompletedDate;
    r.lastEvaluatedDate = r.previousSnapshot.lastEvaluatedDate;
    delete r.previousSnapshot;
  }
  r.awardedPoints = null;
  saveState();
  renderMain();
}
function triggerBump(selector){
  requestAnimationFrame(()=>{
    const el = document.querySelector(selector);
    if(!el) return;
    el.classList.remove('bump');
    requestAnimationFrame(()=> el.classList.add('bump'));
  });
}
function triggerPop(selector){
  requestAnimationFrame(()=>{
    const el = document.querySelector(selector);
    if(!el) return;
    el.classList.remove('pop');
    requestAnimationFrame(()=> el.classList.add('pop'));
  });
}
function triggerShine(selector){
  requestAnimationFrame(()=>{
    const el = document.querySelector(selector);
    if(!el) return;
    el.classList.remove('shine');
    requestAnimationFrame(()=> el.classList.add('shine'));
    setTimeout(()=> el.classList.remove('shine'), 800);
  });
}

// ---------- Task logic ----------
function isRecurring(task){
  return task.recurrence==='weekly' || task.recurrence==='monthly';
}
function taskCurrentValue(task){
  // one-time tasks only: linear decay from creation
  const days = daysBetween(task.createdDate, todayStr());
  return Math.round(task.startValue - task.decayRate*days);
}
function taskDoneToday(task){
  if(isRecurring(task)) return task.lastCompletedDate === todayStr();
  return task.completedDate === todayStr();
}
function taskEditable(task){
  return task.createdDate === todayStr();
}
function taskDisplayValue(task){
  return isRecurring(task) ? task.rewardValue : taskCurrentValue(task);
}
function daysInMonth(year, monthIndex){
  return new Date(year, monthIndex+1, 0).getDate();
}
function isScheduledOn(task, dateStr){
  const d = new Date(dateStr+'T00:00:00');
  if(task.recurrence==='weekly') return task.schedule.includes(d.getDay());
  if(task.recurrence==='monthly'){
    const lastDay = daysInMonth(d.getFullYear(), d.getMonth());
    const dom = d.getDate();
    if(task.schedule.includes(dom)) return true;
    // if today is the last day of a short month, any selected day beyond it rolls over to today
    if(dom===lastDay && task.schedule.some(s=>s>lastDay)) return true;
    return false;
  }
  return false;
}
// Most recent scheduled date on/before today, not earlier than the task's creation date. Null if none yet.
function cycleStartDate(task){
  const t = todayStr();
  const lookback = task.recurrence==='monthly' ? 31 : 7;
  for(let i=0;i<=lookback;i++){
    const d = addDays(t, -i);
    if(d < task.createdDate) return null;
    if(isScheduledOn(task, d)) return d;
  }
  return null;
}
function nextScheduledDate(task, afterDateStr){
  const lookahead = task.recurrence==='monthly' ? 35 : 8;
  let d = addDays(afterDateStr, 1);
  for(let i=0; i<=lookahead; i++){
    if(isScheduledOn(task, d)) return d;
    d = addDays(d, 1);
  }
  return null;
}
function formatDueLabel(dateStr, recurrence){
  const d = new Date(dateStr+'T00:00:00');
  if(recurrence==='weekly') return d.toLocaleDateString('en-US', {weekday:'long'});
  return d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
}
function recurringStatus(task){
  // returns 'not_due' | 'due' | 'overdue' | 'done_this_cycle'
  const cycleStart = cycleStartDate(task);
  if(!cycleStart) return 'not_due';
  if(task.lastCompletedDate && task.lastCompletedDate >= cycleStart) return 'done_this_cycle';
  const t = todayStr();
  return cycleStart === t ? 'due' : 'overdue';
}
function taskIsActionableToday(task){
  if(!isRecurring(task)) return true; // one-time tasks are always actionable until completed
  const status = recurringStatus(task);
  return status==='due' || status==='overdue';
}
function applyDuePenalties(){
  const t = todayStr();
  state.tasks.forEach(task=>{
    if(!isRecurring(task)) return;
    const cycleStart = cycleStartDate(task);
    if(!cycleStart) return;
    if(task.lastCompletedDate && task.lastCompletedDate >= cycleStart) return; // already done this cycle
    let d = cycleStart;
    while(d < t){ // today is still in progress — never penalize it yet, only days that have fully passed
      const exists = state.log.some(l=> l.kind==='task_penalty' && l.refId===task.id && l.date===d);
      if(!exists){
        state.log.push({id: uid(), kind:'task_penalty', refId: task.id, name: task.name, points: -Math.abs(task.penaltyValue||0), date: d});
      }
      d = addDays(d, 1);
    }
  });
}
function completeTask(id){
  const task = state.tasks.find(x=>x.id===id);
  if(!task || taskDoneToday(task)) return;
  const t = todayStr();
  if(isRecurring(task)){
    task.previousCompletedDate = task.lastCompletedDate || null;
    task.lastCompletedDate = t;
    task.awardedPoints = task.rewardValue;
    // refund today's penalty if one was already charged before completing
    const pIdx = state.log.findIndex(l=> l.kind==='task_penalty' && l.refId===id && l.date===t);
    if(pIdx>-1) state.log.splice(pIdx,1);
    state.log.push({id: uid(), kind:'task', refId: task.id, name: task.name, points: task.rewardValue, date: t});
    var val = task.rewardValue;
  } else {
    val = taskCurrentValue(task);
    task.completedDate = t;
    task.awardedPoints = val;
    state.log.push({id: uid(), kind:'task', refId: task.id, name: task.name, points: val, date: t});
  }
  saveState();
  renderMain();
  if(navigator.vibrate) navigator.vibrate(15);
  triggerShine(`[data-card-task="${id}"]`);
  playSparkle();
  showToast(`${val>=0?'+':''}${val} · ${task.name} done`);
}
function uncompleteTask(id){
  const task = state.tasks.find(x=>x.id===id);
  if(!task || !taskDoneToday(task)) return;
  const t = todayStr();
  const idx = state.log.findIndex(l=> l.kind==='task' && l.refId===id && l.date===t);
  if(idx>-1) state.log.splice(idx,1);
  if(isRecurring(task)){
    task.lastCompletedDate = task.previousCompletedDate || null;
    task.awardedPoints = null;
    // No penalty is added here — today is still in progress. If this task remains
    // undone, applyDuePenalties() will catch it up (dated to today) the next time
    // the app is opened on a later day.
  } else {
    task.completedDate = null;
    task.awardedPoints = null;
  }
  saveState();
  renderMain();
}
function pruneStaleCompletedTasks(){
  const t = todayStr();
  state.tasks = state.tasks.filter(task=>{
    if(isRecurring(task)) return true; // recurring tasks never auto-disappear
    return !(task.completedDate && task.completedDate !== t);
  });
}
function deleteTask(id){
  state.tasks = state.tasks.filter(t=>t.id!==id);
  saveState();
  renderMain();
}
function deleteRoutine(id){
  state.routines = state.routines.filter(h=>h.id!==id);
  state.log = state.log.filter(l=> !(l.kind==='routine' && l.refId===id));
  saveState();
  renderMain();
}
function reorderRoutine(id, dir){
  const i = state.routines.findIndex(h=>h.id===id);
  const j = i + dir;
  if(i<0 || j<0 || j>=state.routines.length) return;
  [state.routines[i], state.routines[j]] = [state.routines[j], state.routines[i]];
  saveState();
  renderMain();
}
function taskRecurrenceType(task){
  return task.recurrence || 'once';
}
function reorderTask(id, dir){
  const i = state.tasks.findIndex(t=>t.id===id);
  if(i<0) return;
  const type = taskRecurrenceType(state.tasks[i]);
  const groupIndices = [];
  state.tasks.forEach((t, idx)=>{ if(taskRecurrenceType(t)===type) groupIndices.push(idx); });
  const posInGroup = groupIndices.indexOf(i);
  const neighborPos = posInGroup + dir;
  if(neighborPos<0 || neighborPos>=groupIndices.length) return;
  const j = groupIndices[neighborPos];
  [state.tasks[i], state.tasks[j]] = [state.tasks[j], state.tasks[i]];
  saveState();
  renderMain();
}

function reorderMasterByVisibleOrder(masterArray, visibleIdsInNewOrder){
  const visibleSet = new Set(visibleIdsInNewOrder);
  const result = [];
  let inserted = false;
  for(const item of masterArray){
    if(visibleSet.has(item.id)){
      if(!inserted){
        visibleIdsInNewOrder.forEach(id=>{
          const found = masterArray.find(x=>x.id===id);
          if(found) result.push(found);
        });
        inserted = true;
      }
      // skip — already inserted as a block above
    } else {
      result.push(item);
    }
  }
  return result;
}

// ---------- Scores ----------
function startOfWeek(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const day = d.getDay(); // 0 Sun
  const diff = (day===0?-6:1-day); // Monday start
  d.setDate(d.getDate()+diff);
  return todayStr(d);
}
function scoreForRange(filterFn){
  return state.log.filter(filterFn).reduce((sum,l)=>sum+l.points,0);
}
function getScores(){
  const t = todayStr();
  const weekStart = startOfWeek(t);
  const monthPrefix = t.slice(0,7);
  const daily = scoreForRange(l=>l.date===t);
  const weekly = scoreForRange(l=> l.date>=weekStart && l.date<=t);
  const monthly = scoreForRange(l=> l.date.slice(0,7)===monthPrefix);
  const allTime = scoreForRange(()=>true);
  return {daily, weekly, monthly, allTime};
}
