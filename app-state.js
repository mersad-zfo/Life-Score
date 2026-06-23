const STORE_KEY = 'lifescore_state_v1';
let state = { habits: [], tasks: [], log: [], profile: null, settings: { theme: 'system', sound: true }, session: { loggedIn: false } };
let currentTab = 'today';
let previousTab = 'today';
let storageReady = false;
let allClearDismissed = false;
let backupTapped = false;
let restoreTapped = false;

function ensureStateShape(){
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
const HABIT_FALLBACK_EMOJI = '🎯';
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
function pickHabitEmoji(name){
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
  return HABIT_FALLBACK_EMOJI;
}

async function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){ state = JSON.parse(raw); }
  }catch(e){ /* no existing data yet, or storage unavailable */ }
  ensureStateShape();
  pruneStaleCompletedTasks();
  applyDuePenalties();
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

// ---------- Habit logic ----------
function habitDisplayStreak(h){
  const t = todayStr();
  if(!h.lastCompletedDate) return 0;
  const gap = daysBetween(h.lastCompletedDate, t);
  if(gap === 0) return h.streak;
  if(gap === 1) return h.streak;
  return 0;
}
function habitDoneToday(h){
  return h.lastCompletedDate === todayStr();
}
function habitReward(streakAfter, base){
  const bonus = Math.floor(streakAfter/5)*Math.max(1, Math.round(base*0.1));
  return base + bonus;
}
function completeHabit(id){
  const h = state.habits.find(x=>x.id===id);
  if(!h || habitDoneToday(h)) return;
  const t = todayStr();
  let newStreak;
  if(h.lastCompletedDate === addDays(t,-1)){
    newStreak = h.streak + 1;
  } else {
    newStreak = 1;
  }
  h.streak = newStreak;
  h.lastCompletedDate = t;
  const pts = habitReward(newStreak, h.basePoints);
  state.log.push({id: uid(), kind:'habit', refId: h.id, name: h.name, points: pts, date: t});
  saveState();
  renderMain();
  if(navigator.vibrate) navigator.vibrate(15);
  triggerBump(`[data-habit="${id}"]`);
  triggerPop(`[data-streak="${id}"]`);
  triggerShine(`[data-card-habit="${id}"]`);
  playSparkle();
  showToast(`+${pts} · ${h.name}`);
}
function uncompleteHabit(id){
  const h = state.habits.find(x=>x.id===id);
  if(!h || !habitDoneToday(h)) return;
  const t = todayStr();
  // remove today's log entry, roll back streak
  const idx = state.log.findIndex(l=> l.kind==='habit' && l.refId===id && l.date===t);
  if(idx>-1) state.log.splice(idx,1);
  h.streak = Math.max(0, h.streak - 1);
  h.lastCompletedDate = h.streak > 0 ? addDays(t,-1) : null;
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
function isScheduledOn(task, dateStr){
  const d = new Date(dateStr+'T00:00:00');
  if(task.recurrence==='weekly') return task.schedule.includes(d.getDay());
  if(task.recurrence==='monthly') return task.schedule.includes(d.getDate());
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
    if(cycleStart === t) return; // due today, not yet overdue — no penalty
    let d = addDays(cycleStart, 1);
    while(d <= t){
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
    // if it's now overdue again today, resume today's penalty
    const cycleStart = cycleStartDate(task);
    if(cycleStart && cycleStart !== t){
      const exists = state.log.some(l=> l.kind==='task_penalty' && l.refId===task.id && l.date===t);
      if(!exists){
        state.log.push({id: uid(), kind:'task_penalty', refId: task.id, name: task.name, points: -Math.abs(task.penaltyValue||0), date: t});
      }
    }
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
function deleteHabit(id){
  state.habits = state.habits.filter(h=>h.id!==id);
  state.log = state.log.filter(l=> !(l.kind==='habit' && l.refId===id));
  saveState();
  renderMain();
}
function reorderHabit(id, dir){
  const i = state.habits.findIndex(h=>h.id===id);
  const j = i + dir;
  if(i<0 || j<0 || j>=state.habits.length) return;
  [state.habits[i], state.habits[j]] = [state.habits[j], state.habits[i]];
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
