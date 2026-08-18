// ---------- State, storage, dates, misc core utilities ----------
// This is the first file loaded — the state object, localStorage load/save, date-string
// helpers, and small cross-cutting utilities other files rely on. Kept deliberately small.
// (Split out of the former monolithic app-state.js — see ARCHITECTURE.md.)
// NOTE (app rebrand, Life Score → Lifyar, permanent): this key is intentionally never renamed.
// It's the localStorage key holding every existing user's entire state (routines/tasks/log/
// settings). Renaming it would make the app find nothing on load for every already-installed
// user — indistinguishable from a silent full reset. Everything user-visible is "Lifyar" now;
// this internal key just quietly keeps its original name forever.
const STORE_KEY = 'lifescore_state_v1';
let state = { routines: [], tasks: [], log: [], rewards: [], profile: null, settings: { theme: 'system', colorTheme: 'green', sound: true, language: 'en', ratingStartDate: null, notificationsEnabled: false, deviceId: null, notifLastSync: null, sleepCycle: 'normal', onboardingComplete: false, rewardsEnabled: true }, session: { loggedIn: false } };
let currentTab = 'today';
let previousTab = 'today';
// Whether the Routines/Tasks tab's "missing X costs points" info card is expanded. Deliberately
// NOT persisted to state/localStorage — this is a per-visit UI toggle, not a saved preference.
// Reset to collapsed whenever the user actually leaves that tab (see setTab()/gearBtn handler in
// app-main.js), so it always starts collapsed again on the next visit, but survives re-renders
// that happen while staying on the same tab (completing a routine/task, etc.).
let routinesPenaltyInfoOpen = false;
let tasksPenaltyInfoOpen = false;
let storageReady = false;

// Cloud-sync bookkeeping — deliberately kept OUT of `state` itself and its own separate
// localStorage key. This is plumbing for the Firebase backup layer (app-firebase.js), not app
// data, so it never goes through ensureStateShape()/migrations or touches the historically-
// sensitive data model at all.
const SYNC_META_KEY = 'lifyar_sync_meta_v1';
function getSyncMeta(){
  try{
    const raw = localStorage.getItem(SYNC_META_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){ /* fall through to default */ }
  return { lastModified: 0 };
}
function setSyncMeta(lastModified){
  try{ localStorage.setItem(SYNC_META_KEY, JSON.stringify({ lastModified })); }catch(e){ /* best effort */ }
}
// app-firebase.js loads as a <script type="module">, which — unlike every other classic script
// here — is deferred, so it finishes AFTER app-main.js's init() has already started (see the long
// comment at the top of app-firebase.js). This lets init() wait for it instead of assuming
// window.LifyarCloud already exists. Gives up gracefully after timeoutMs (e.g. the module failed
// to load at all — no network, or a script blocker) — the app carries on fully local-only either
// way, same as it does today.
function waitForLifyarCloud(timeoutMs){
  return new Promise((resolve)=>{
    const start = Date.now();
    (function poll(){
      if(window.LifyarCloud) return resolve(window.LifyarCloud);
      if(Date.now()-start > timeoutMs) return resolve(null);
      setTimeout(poll, 50);
    })();
  });
}
// Compares local vs. cloud data and applies whichever is newer — "newest wins" wholesale, no
// field-level merging (see app-firebase.js for why). Called both at boot (app-main.js) and right
// after a successful login (app-render-settings.js / app-onboarding.js's completeCloudSignIn) —
// a returning user's data needs to show up the moment they sign in, not on the next page load.
// Returns true if remote data was pulled down and replaced local state, false otherwise (nothing
// to pull yet, or local was already newer — in which case local gets pushed up instead).
async function reconcileWithCloud(){
  const cloud = window.LifyarCloud;
  if(!cloud) return false;
  await cloud.ready;
  const remote = await cloud.pullState();
  const localMeta = getSyncMeta();
  // A brand-new / still-mid-onboarding local session (no routines, tasks, or history yet) has
  // nothing worth protecting — its lastModified only reflects trivial preference toggles (theme,
  // language, etc.) made moments ago, which would otherwise look "newer" than a real returning
  // user's cloud data and wrongly win a plain timestamp race. Prefer the cloud copy outright
  // whenever local is genuinely empty like this, rather than only when it's provably older.
  const localIsEmpty = (!state.routines || !state.routines.length) && (!state.tasks || !state.tasks.length) && (!state.log || !state.log.length);
  if(remote && remote.state && (localIsEmpty || remote.lastModified > localMeta.lastModified)){
    state = remote.state;
    ensureStateShape();
    migrateRecurringTasksToRoutines();
    applyRoutineCatchUp();
    applyTheme();
    setSyncMeta(remote.lastModified);
    return true;
  }
  cloud.scheduleSync(()=>state, ()=>localMeta.lastModified || Date.now());
  return false;
}

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
  // Rewards (this session): user-defined daily point targets, e.g. "200 pts -> Gaming". Hard-
  // deleted (no soft-delete/configHistory) — unlike Routines/Tasks, a reward never appears in any
  // historical view (Progression, log entries), so there's no past-day recomputation to protect.
  // Achieved-state is never persisted either — it's derived live each render from today's real
  // received score vs. pointsNeeded, which is what makes the daily reset automatic (see
  // app-rewards.js).
  if(!state.rewards) state.rewards = [];
  if(state.log){
    state.log.forEach(l=>{ if(l.kind==='habit') l.kind = 'routine'; });
  }
  if(!state.profile) state.profile = null;
  if(!state.settings) state.settings = { theme: 'system', sound: true, language: 'en' };
  if(state.settings.theme===undefined) state.settings.theme = 'system';
  if(state.settings.colorTheme===undefined) state.settings.colorTheme = 'green';
  if(state.settings.sound===undefined) state.settings.sound = true;
  if(state.settings.language===undefined) state.settings.language = 'en';
  if(!state.settings.ratingStartDate) state.settings.ratingStartDate = todayStr();
  if(state.settings.notificationsEnabled===undefined) state.settings.notificationsEnabled = false;
  if(state.settings.deviceId===undefined) state.settings.deviceId = null;
  if(state.settings.notifLastSync===undefined) state.settings.notifLastSync = null;
  if(state.settings.sleepCycle===undefined){
    // Migrate the old boolean (Normal / Night Owl only) to the new 3-way setting — Vampire never
    // existed before, so there's nothing to migrate it from.
    state.settings.sleepCycle = state.settings.nightOwlMode ? 'nightOwl' : 'normal';
  }
  delete state.settings.nightOwlMode;
  if(state.settings.onboardingComplete===undefined) state.settings.onboardingComplete = true; // pre-existing install — never show onboarding retroactively
  if(state.settings.rewardsEnabled===undefined) state.settings.rewardsEnabled = true;
  // Category 2 "once per calendar day per condition" banner suppression — see app-notif-triggers.js.
  if(state.settings.notifBannerLedger===undefined) state.settings.notifBannerLedger = { date: todayStr(), keys: [] };
  // Migrate pre-difficulty items: tag them 'normal' so the UI shows a sensible default.
  // Stored numeric fields (basePoints etc.) are left untouched so existing scores don't shift.
  state.routines.forEach(r=>{ if(!r.difficulty) r.difficulty = 'normal'; });
  state.tasks.forEach(t=>{ if(!t.difficulty) t.difficulty = 'normal'; });
  // Migration: tasks created before the due-date feature have no dueDate — default it to
  // createdDate so they behave exactly as before (immediately due, decay starts right away).
  state.tasks.forEach(t=>{ if(!t.dueDate) t.dueDate = t.createdDate; });
  // Migration: tasks created before Steps (this session) have no steps field yet.
  state.tasks.forEach(t=>{ if(t.steps===undefined) t.steps = null; });
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
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  // Color theme (green/blue/pink) is a second, independent dimension layered on top of light/dark
  // — see base.css's body.color-blue / body.color-pink blocks. Green is the default and has no
  // class of its own (it's just the base variables), so clearing both classes covers it.
  const colorTheme = state.settings.colorTheme || 'green';
  document.body.classList.toggle('color-blue', colorTheme==='blue');
  document.body.classList.toggle('color-pink', colorTheme==='pink');
  // Keep the OS status bar / browser chrome color in sync with the active theme — otherwise it
  // stays stuck on index.html's hardcoded light value even while the app itself is dark.
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if(themeColorMeta) themeColorMeta.setAttribute('content', dark ? '#10140F' : '#FAFAF7');
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

const SLEEP_CYCLE_END_HOUR = { normal: 0, nightOwl: 6, vampire: 12 };
function sleepCycleEndHour(){
  const cycle = (state.settings && state.settings.sleepCycle) || 'normal';
  return SLEEP_CYCLE_END_HOUR[cycle] || 0;
}
// Locked between midnight and noon (real wall-clock time, not the shifted "effective" day below) —
// changing which hour the day ends at mid-way through the day would retroactively rewrite what
// "today" even means for whatever's already happened since midnight.
function sleepCycleChangeLocked(){
  return new Date().getHours() < 12;
}
function sleepCycleEffectiveDate(){
  // Day boundary can be pushed later than midnight — Night Owl: 6am, Vampire: noon. Until that
  // hour, it's still counted as the previous calendar day for streaks/neglects/due dates. Normal's
  // end hour is 0 (midnight), which this never shifts for — there's no "day before midnight" case.
  const endHour = sleepCycleEndHour();
  const now = new Date();
  if(endHour > 0 && now.getHours() < endHour){
    now.setDate(now.getDate()-1);
  }
  return now;
}
function hoursUntilDayEnd(){
  const endHour = sleepCycleEndHour();
  const now = new Date();
  const h = now.getHours() + now.getMinutes()/60;
  if(endHour > 0){
    return h < endHour ? (endHour - h) : (24 + endHour - h); // possibly the next calendar day
  }
  return 24 - h; // Normal — day ends at midnight
}
function shouldGraceToday(){
  return hoursUntilDayEnd() <= 9; // created within the last 9 hours of the day — today doesn't count
}
function todayStr(d=sleepCycleEffectiveDate()){
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
    const lastModified = Date.now();
    setSyncMeta(lastModified);
    // Cloud backup is additive only — the local save above already succeeded and remains the
    // real source of truth. If the Firebase module hasn't finished loading yet (see
    // waitForLifyarCloud), or a push fails/is offline, this call is simply skipped this time —
    // the next saveState() (or the next app launch's reconciliation) tries again.
    if(window.LifyarCloud) window.LifyarCloud.scheduleSync(()=>state, ()=>lastModified);
  }catch(e){
    console.error('Save failed', e);
    showToast(tr('Could not save — try again'));
  }
}

function showToast(msg, durationMs){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=> t.classList.remove('show'), durationMs || 1800);
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
