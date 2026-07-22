// ---------- State, storage, dates, misc core utilities ----------
// This is the first file loaded — the state object, localStorage load/save, date-string
// helpers, and small cross-cutting utilities other files rely on. Kept deliberately small.
// (Split out of the former monolithic app-state.js — see ARCHITECTURE.md.)
const STORE_KEY = 'lifescore_state_v1';
let state = { routines: [], tasks: [], log: [], profile: null, settings: { theme: 'system', sound: true, language: 'en', ratingStartDate: null, notificationsEnabled: false, deviceId: null, notifLastSync: null, nightOwlMode: false, onboardingComplete: false }, session: { loggedIn: false } };
let currentTab = 'today';
let previousTab = 'today';
let storageReady = false;
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
  if(!state.settings) state.settings = { theme: 'system', sound: true, language: 'en' };
  if(state.settings.theme===undefined) state.settings.theme = 'system';
  if(state.settings.sound===undefined) state.settings.sound = true;
  if(state.settings.language===undefined) state.settings.language = 'en';
  if(!state.settings.ratingStartDate) state.settings.ratingStartDate = todayStr();
  if(state.settings.notificationsEnabled===undefined) state.settings.notificationsEnabled = false;
  if(state.settings.deviceId===undefined) state.settings.deviceId = null;
  if(state.settings.notifLastSync===undefined) state.settings.notifLastSync = null;
  if(state.settings.nightOwlMode===undefined) state.settings.nightOwlMode = false;
  if(state.settings.onboardingComplete===undefined) state.settings.onboardingComplete = true; // pre-existing install — never show onboarding retroactively
  // Category 2 "once per calendar day per condition" banner suppression — see app-notif-triggers.js.
  if(state.settings.notifBannerLedger===undefined) state.settings.notifBannerLedger = { date: todayStr(), keys: [] };
  // Migrate pre-difficulty items: tag them 'normal' so the UI shows a sensible default.
  // Stored numeric fields (basePoints etc.) are left untouched so existing scores don't shift.
  state.routines.forEach(r=>{ if(!r.difficulty) r.difficulty = 'normal'; });
  state.tasks.forEach(t=>{ if(!t.difficulty) t.difficulty = 'normal'; });
  // Migration: tasks created before the due-date feature have no dueDate — default it to
  // createdDate so they behave exactly as before (immediately due, decay starts right away).
  state.tasks.forEach(t=>{ if(!t.dueDate) t.dueDate = t.createdDate; });
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

function nightOwlEffectiveDate(){
  // Night Owl mode: day boundary is 5:00am instead of midnight. Between 12:00am-4:59am
  // it's still counted as the previous calendar day for streaks/neglects/due dates.
  const now = new Date();
  if(state.settings && state.settings.nightOwlMode && now.getHours() < 5){
    now.setDate(now.getDate()-1);
  }
  return now;
}
function hoursUntilDayEnd(){
  const now = new Date();
  const h = now.getHours() + now.getMinutes()/60;
  if(state.settings && state.settings.nightOwlMode){
    return h < 5 ? (5 - h) : (29 - h); // day ends at 5am, possibly the next calendar day
  }
  return 24 - h; // day ends at midnight
}
function shouldGraceToday(){
  return hoursUntilDayEnd() <= 9; // created within the last 9 hours of the day — today doesn't count
}
function todayStr(d=nightOwlEffectiveDate()){
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
  document.getElementById('todayLabel').textContent = new Date().toLocaleDateString(localeForLang(), opts);
}
function uid(){ return Math.random().toString(36).slice(2,9); }

async function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){ state = JSON.parse(raw); }
  }catch(e){ /* no existing data yet, or storage unavailable */ }
  ensureStateShape();
  migrateRecurringTasksToRoutines();
  applyRoutineCatchUp();
  applyTheme();
  storageReady = true;
}
async function saveState(){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }catch(e){
    console.error('Save failed', e);
    showToast(tr('Could not save — try again'));
  }
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=> t.classList.remove('show'), 1800);
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
