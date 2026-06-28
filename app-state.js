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
  if(!state.tasks) state.tasks = [];
  if(!state.log) state.log = [];
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
  migrateRecurringTasksToRoutines();
  pruneStaleCompletedTasks();
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

// ---------- Routine logic (Routine Consistency System — unified across daily/weekly/monthly) ----------
// A routine is always in exactly one state: Streak (streak>0), Neglect (neglect>0), or Neutral (both 0).
// "Occurrence" = a day that counts for consistency purposes: every day for daily routines, only
// scheduled days for weekly/monthly routines. Misses/completions are always evaluated per occurrence,
// never per raw calendar day waited.

// Daily routines: one shared array governs safety nets, reward/neglect scaling, AND confetti.
const CONSISTENCY_MILESTONES = [7, 14, 30, 60, 90, 180, 270, 365];
// Weekly/monthly routines: milestones are evenly spaced and generated from a step instead of a
// fixed array, since occurrence counts are unbounded (a weekly routine can run for years).
const WEEKLY_MILESTONE_STEP = 10;
const MONTHLY_MILESTONE_STEP = 5;

// Purely cosmetic emoji-rank thresholds — deliberately a SEPARATE list from the consistency
// milestones above for daily routines (starts at 1, not 7) so a routine feels "alive" right after
// the first completion, while the real safety net/reward milestone stays a full week out.
const EMOJI_MILESTONES = [1, 14, 30, 60, 90, 180, 270, 365];
const STREAK_RANK_EMOJIS  = ['👏','⭐','💯','🥇','🏆','🔥','👑','👑👑'];
const NEGLECT_RANK_EMOJIS = ['⚠️','⛔','🚨','🤕','💔','☠️','☠️','☠️☠️'];

// Milestone definition used for safety nets / reward scaling / confetti — NOT the cosmetic
// emoji-rank thresholds (see routineRankDef below for those).
function routineMilestoneDef(r){
  if(r.recurrence==='weekly') return { type:'step', step: WEEKLY_MILESTONE_STEP };
  if(r.recurrence==='monthly') return { type:'step', step: MONTHLY_MILESTONE_STEP };
  return { type:'array', values: CONSISTENCY_MILESTONES }; // daily (default)
}
// Cosmetic emoji-rank thresholds. Daily gets its own "starts at 1" array; weekly/monthly get the
// same "starts at 1, then real milestones" relationship via the 'step1' type below, so a routine
// of any recurrence type feels alive immediately, consistent with daily.
function routineRankDef(r){
  if(r.recurrence==='weekly') return { type:'step1', step: WEEKLY_MILESTONE_STEP };
  if(r.recurrence==='monthly') return { type:'step1', step: MONTHLY_MILESTONE_STEP };
  return { type:'array', values: EMOJI_MILESTONES };
}
// How many milestones (from the given definition) `value` has passed.
function milestonesPassed(value, def){
  if(def.type==='array') return def.values.filter(v=>value>=v).length;
  if(def.type==='step1') return value<1 ? 0 : 1 + Math.floor(value/def.step);
  return Math.floor(value / def.step); // plain 'step' — used for safety nets / reward scaling, no first-day exception
}
// The nearest lower milestone strictly below `value` — used to drop a streak on a missed occurrence.
function nearestLowerMilestone(value, def){
  if(def.type==='array'){
    let best = 0;
    for(const v of def.values){ if(v < value && v > best) best = v; }
    return best;
  }
  return Math.floor((value-1) / def.step) * def.step;
}
function streakEmoji(r){
  const count = milestonesPassed(r.streak, routineRankDef(r));
  if(count<=0) return '';
  return STREAK_RANK_EMOJIS[Math.min(count-1, STREAK_RANK_EMOJIS.length-1)];
}
function neglectEmoji(r){
  const count = milestonesPassed(r.neglect, routineRankDef(r));
  if(count<=0) return '';
  return NEGLECT_RANK_EMOJIS[Math.min(count-1, NEGLECT_RANK_EMOJIS.length-1)];
}

function ensureRoutineShape(r){
  if(!r.recurrence) r.recurrence = 'daily';
  if(r.recurrence!=='daily' && !r.schedule) r.schedule = [];
  if(!r.createdDate) r.createdDate = r.lastCompletedDate || todayStr();
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
function routineIncrement(value){
  return Math.max(1, Math.round(value*0.1));
}
// Daily reward: streak milestones add, neglect milestones subtract, floored at 0.
// Weekly/monthly reward: fixed rewardValue, only ever scaled UP by streak milestones (no decay).
function routineReward(r){
  const def = routineMilestoneDef(r);
  if(r.recurrence==='daily'){
    const inc = routineIncrement(r.basePoints);
    const streakCount = milestonesPassed(r.streak, def);
    const neglectCount = milestonesPassed(r.neglect, def);
    return Math.max(0, r.basePoints + streakCount*inc - neglectCount*inc);
  }
  const inc = routineIncrement(r.rewardValue);
  const streakCount = milestonesPassed(r.streak, def);
  return r.rewardValue + streakCount*inc;
}
// Weekly/monthly only: the penalty for one missed occurrence, scaled by neglect milestones —
// mirrors how streak scales reward. Computed from r's CURRENT neglect value (caller decides
// whether that's the pre-miss or post-miss value, depending on whether this is a live preview
// or an actual logged miss).
function routinePenalty(r){
  const def = routineMilestoneDef(r);
  const inc = routineIncrement(r.penaltyValue);
  const neglectCount = milestonesPassed(r.neglect, def);
  return r.penaltyValue + neglectCount*inc;
}
// Pure function: what streak/neglect/recoveryChain would result from completing TODAY, without mutating.
function routineNextStateOnComplete(r){
  if(r.streak > 0){
    return { streak: r.streak + 1, neglect: 0, recoveryChain: false };
  }
  if(r.neglect > 0){
    const newNeglect = Math.floor(r.neglect / 2);
    return { streak: 0, neglect: newNeglect, recoveryChain: newNeglect > 0 };
  }
  return { streak: 1, neglect: 0, recoveryChain: false }; // Neutral
}
// Pure function: what streak/neglect/recoveryChain would result from MISSING today's occurrence,
// without mutating. Mirrors routineNextStateOnComplete — same transition rules used by both the
// real catch-up miss and the live "what would I lose" preview shown while a routine is due.
function routineNextStateOnMiss(r){
  const def = routineMilestoneDef(r);
  if(r.streak > 0){
    return { streak: nearestLowerMilestone(r.streak, def), neglect: 0, recoveryChain: false };
  }
  if(r.neglect > 0){
    if(r.recoveryChain){
      return { streak: 0, neglect: Math.round(r.neglect * 1.5), recoveryChain: false };
    }
    return { streak: 0, neglect: r.neglect + 1, recoveryChain: false };
  }
  return { streak: 0, neglect: 1, recoveryChain: false };
}
// Preview-only: the reward the user would get if they tapped complete right now (does not mutate).
function routinePreviewReward(r){
  const next = routineNextStateOnComplete(r);
  return routineReward(Object.assign({}, r, next));
}
// Preview-only (weekly/monthly): the penalty the user would lose TODAY if they miss this due
// occurrence — i.e. using the neglect value as it would stand AFTER today's miss, since that's
// the number that's actually about to be charged, not the number sitting there right now.
function routinePreviewPenalty(r){
  const next = routineNextStateOnMiss(r);
  return routinePenalty(Object.assign({}, r, next));
}
function routineDoneToday(r){
  return r.lastCompletedDate === todayStr();
}
// Does `dateStr` count as an occurrence for this routine? Every day for daily; only scheduled
// days for weekly/monthly (reuses the relocated recurring-schedule engine below).
function isRoutineOccurrenceDay(r, dateStr){
  if(r.recurrence==='daily') return true;
  return isScheduledOn(r, dateStr);
}
// Is today a scheduled occurrence for this routine? Always true for daily. For weekly/monthly,
// "due" is strictly today's exact calendar match — there is no backward-looking carryover. Miss
// today's occurrence and it's gone; the routine simply goes quiet until its next scheduled day.
function routineIsDueToday(r){
  return isRoutineOccurrenceDay(r, todayStr());
}
// Apply exactly one missed-OCCURRENCE transition in place (only ever called for an actual
// occurrence day, never a non-scheduled day for weekly/monthly, and never for today while it's
// still in progress — only once a later day confirms it was truly missed). Daily never logs
// points, only shrinks future reward. Weekly/monthly ALSO logs a real negative score entry for
// that missed day, scaled by neglect milestones reached after this miss.
function applyRoutineMiss(r, missedDate){
  const next = routineNextStateOnMiss(r);
  r.streak = next.streak;
  r.neglect = next.neglect;
  r.recoveryChain = next.recoveryChain;
  if(r.recurrence!=='daily'){
    const penalty = routinePenalty(r); // uses neglect AFTER this miss, consistent with the "after" convention used everywhere else
    state.log.push({id: uid(), kind:'routine_penalty', refId: r.id, name: r.name, points: -Math.abs(penalty), date: missedDate});
  }
}
// Replays every missed OCCURRENCE between a routine's last-evaluated date and yesterday, in order —
// so the once-per-chain relapse rule and milestone-drop sequencing stay correct regardless of how
// many days the app was closed. Today itself is never evaluated while still in progress.
function applyRoutineCatchUp(){
  const t = todayStr();
  state.routines.forEach(r=>{
    ensureRoutineShape(r);
    let d = addDays(r.lastEvaluatedDate, 1);
    while(d < t){
      if(isRoutineOccurrenceDay(r, d)) applyRoutineMiss(r, d);
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
  // halving/milestone-drops aren't cleanly reversible by un-doing math, so we just restore the snapshot.
  r.previousSnapshot = {
    streak: r.streak,
    neglect: r.neglect,
    recoveryChain: r.recoveryChain,
    lastCompletedDate: r.lastCompletedDate,
    lastEvaluatedDate: r.lastEvaluatedDate
  };

  const def = routineMilestoneDef(r);
  const oldStreakCount = milestonesPassed(r.streak, def);
  const next = routineNextStateOnComplete(r);
  r.streak = next.streak;
  r.neglect = next.neglect;
  r.recoveryChain = next.recoveryChain;
  r.lastCompletedDate = t;
  r.lastEvaluatedDate = t;
  const crossedStreakMilestone = milestonesPassed(r.streak, def) > oldStreakCount;

  const pts = routineReward(r);
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
  if(crossedStreakMilestone) triggerConfetti(`[data-card-routine="${id}"]`);
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
// Bigger celebration than shine/sound/haptic — fires only when a routine crosses upward into
// a new streak milestone (never on neglect, never on a plain daily completion).
function triggerConfetti(selector){
  requestAnimationFrame(()=>{
    const el = document.querySelector(selector);
    if(!el) return;
    const rect = el.getBoundingClientRect();
    const colors = ['#2F7A5C','#C8553D','#E8B23A','#3B6FA0','#8A4FA0'];
    const originX = rect.left + rect.width/2;
    const originY = rect.top + rect.height/2;
    for(let i=0;i<18;i++){
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = originX + 'px';
      piece.style.top = originY + 'px';
      piece.style.background = colors[Math.floor(Math.random()*colors.length)];
      piece.style.setProperty('--dx', Math.round((Math.random()-0.5)*180)+'px');
      piece.style.setProperty('--dy', Math.round(110 + Math.random()*130)+'px');
      piece.style.setProperty('--rot', Math.round(Math.random()*720-360)+'deg');
      document.body.appendChild(piece);
      setTimeout(()=> piece.remove(), 950);
    }
  });
}
function deleteRoutine(id){
  state.routines = state.routines.filter(h=>h.id!==id);
  state.log = state.log.filter(l=> !((l.kind==='routine'||l.kind==='routine_penalty') && l.refId===id));
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

// ---------- Recurring schedule engine (shared by weekly/monthly routines) ----------
function daysInMonth(year, monthIndex){
  return new Date(year, monthIndex+1, 0).getDate();
}
function isScheduledOn(r, dateStr){
  const d = new Date(dateStr+'T00:00:00');
  if(r.recurrence==='weekly') return (r.schedule||[]).includes(d.getDay());
  if(r.recurrence==='monthly'){
    const lastDay = daysInMonth(d.getFullYear(), d.getMonth());
    const dom = d.getDate();
    if((r.schedule||[]).includes(dom)) return true;
    // if today is the last day of a short month, any selected day beyond it rolls over to today
    if(dom===lastDay && (r.schedule||[]).some(s=>s>lastDay)) return true;
    return false;
  }
  return false;
}
function nextScheduledDate(r, afterDateStr){
  const lookahead = r.recurrence==='monthly' ? 35 : 8;
  let d = addDays(afterDateStr, 1);
  for(let i=0; i<=lookahead; i++){
    if(isScheduledOn(r, d)) return d;
    d = addDays(d, 1);
  }
  return null;
}
function formatDueLabel(dateStr, recurrence){
  const d = new Date(dateStr+'T00:00:00');
  if(recurrence==='weekly') return d.toLocaleDateString('en-US', {weekday:'long'});
  return d.toLocaleDateString('en-US', {month:'short', day:'numeric'});
}
// Only weekly/monthly inherit the numeric-value/recurrence-type edit-lock (mirrors the old
// recurring-task rule, which existed to prevent decay/penalty dodging). Daily routines have no
// decay to dodge and stay freely editable, same as the original Habit behavior.
function routineEditable(r){
  if(r.recurrence==='daily') return true;
  return r.createdDate === todayStr();
}
// Routines due/relevant on the Home tab today: all daily routines, plus weekly/monthly routines
// that are due today (schedule match). Note this doesn't need a separate "done today" check —
// today's schedule match doesn't change just because it's already been completed today.
function routinesForToday(){
  return state.routines.filter(r=> routineIsDueToday(r));
}
// Converts every pre-existing weekly/monthly TASK into a Routine, preserving id (so log history
// stays linked), schedule, and reward/penalty. Seeded neutral (streak/neglect 0) — this app has
// one user and no public install base, so there's no need for elaborate status reconstruction here.
function migrateRecurringTasksToRoutines(){
  const toMigrate = state.tasks.filter(t=> t.recurrence==='weekly' || t.recurrence==='monthly');
  if(toMigrate.length===0) return;
  toMigrate.forEach(t=>{
    state.routines.push({
      id: t.id, name: t.name, emoji: t.emoji, description: t.description,
      recurrence: t.recurrence, schedule: t.schedule,
      rewardValue: t.rewardValue, penaltyValue: t.penaltyValue || 5,
      createdDate: t.createdDate,
      streak: 0, neglect: 0, recoveryChain: false,
      lastCompletedDate: t.lastCompletedDate || null,
      lastEvaluatedDate: t.lastCompletedDate || addDays(todayStr(), -1),
      awardedPoints: t.awardedPoints || null
    });
  });
  const migratedIds = new Set(toMigrate.map(t=>t.id));
  state.log.forEach(l=>{
    if(migratedIds.has(l.refId)){
      if(l.kind==='task') l.kind = 'routine';
      if(l.kind==='task_penalty') l.kind = 'routine_penalty';
    }
  });
  state.tasks = state.tasks.filter(t=> !migratedIds.has(t.id));
}

// ---------- Task logic (one-time only — recurring tasks now live as Routines) ----------
function taskCurrentValue(task){
  // linear decay from creation, can go negative with no floor
  const days = daysBetween(task.createdDate, todayStr());
  return Math.round(task.startValue - task.decayRate*days);
}
function taskDoneToday(task){
  return task.completedDate === todayStr();
}
function taskEditable(task){
  return task.createdDate === todayStr();
}
function taskDisplayValue(task){
  return taskCurrentValue(task);
}
function completeTask(id){
  const task = state.tasks.find(x=>x.id===id);
  if(!task || taskDoneToday(task)) return;
  const t = todayStr();
  const val = taskCurrentValue(task);
  task.completedDate = t;
  task.awardedPoints = val;
  state.log.push({id: uid(), kind:'task', refId: task.id, name: task.name, points: val, date: t});
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
  task.completedDate = null;
  task.awardedPoints = null;
  saveState();
  renderMain();
}
function pruneStaleCompletedTasks(){
  const t = todayStr();
  state.tasks = state.tasks.filter(task=> !(task.completedDate && task.completedDate !== t));
}
function deleteTask(id){
  state.tasks = state.tasks.filter(t=>t.id!==id);
  saveState();
  renderMain();
}
function reorderTask(id, dir){
  const i = state.tasks.findIndex(t=>t.id===id);
  const j = i + dir;
  if(i<0 || j<0 || j>=state.tasks.length) return;
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
