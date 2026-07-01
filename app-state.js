const STORE_KEY = 'lifescore_state_v1';
let state = { routines: [], tasks: [], log: [], profile: null, settings: { theme: 'system', sound: true, language: 'en', ratingStartDate: null }, session: { loggedIn: false } };
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
  if(!state.settings) state.settings = { theme: 'system', sound: true, language: 'en' };
  if(state.settings.theme===undefined) state.settings.theme = 'system';
  if(state.settings.sound===undefined) state.settings.sound = true;
  if(state.settings.language===undefined) state.settings.language = 'en';
  if(!state.settings.ratingStartDate) state.settings.ratingStartDate = todayStr();
  // Migrate pre-difficulty items: tag them 'normal' so the UI shows a sensible default.
  // Stored numeric fields (basePoints etc.) are left untouched so existing scores don't shift.
  state.routines.forEach(r=>{ if(!r.difficulty) r.difficulty = 'normal'; });
  state.tasks.forEach(t=>{ if(!t.difficulty) t.difficulty = 'normal'; });
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
  document.getElementById('todayLabel').textContent = new Date().toLocaleDateString(localeForLang(), opts);
}
function uid(){ return Math.random().toString(36).slice(2,9); }

// ---------- i18n (rough Farsi pass — not RTL, just translated text) ----------
// tr(key) looks up `key` (the original English string) in the current language's
// dictionary and returns the translation, or falls back to the English key itself
// if nothing's there yet. This means nothing breaks if a string is missing —
// it just silently shows English until someone adds it to LANG_DICT.fa.
const LANG_DICT = {
  fa: {
    // Today / nav / page titles
    'Home': 'خانه', 'Routines': 'روتین‌ها', 'Tasks': 'کارها', 'Score': 'امتیاز', 'Settings': 'تنظیمات',
    'Your routines': 'روتین‌های شما', 'Your tasks': 'کارهای شما', 'Your score': 'امتیاز شما',
    'Loading your data…': 'در حال بارگذاری اطلاعات…',
    "Today's score": 'امتیاز امروز',
    'Open tasks': 'کارهای باز',
    'Completed today': 'تکمیل‌شده امروز',
    'No routines due today.': 'امروز روتینی موعد ندارد.',
    'No open tasks. Nice.': 'کار بازی نیست. عالیه.',
    'No open tasks.': 'کار بازی نیست.',
    'Undo': 'بازگردانی',
    'All clear today': 'امروز همه‌چیز تمام شد',
    'Tap anywhere to keep going': 'برای ادامه هرجا را لمس کنید',
    // Routines tab
    'Daily': 'روزانه', 'Weekly': 'هفتگی', 'Monthly': 'ماهانه',
    'None yet.': 'هنوز چیزی نیست.',
    'Nothing here yet.': 'هنوز چیزی اینجا نیست.',
    'Tap + to add your first routine.': 'برای افزودن اولین روتین، + را لمس کنید.',
    'Remove': 'حذف', 'Edit': 'ویرایش',
    'Streak': 'رکورد', 'Neglect': 'غفلت', 'Neutral': 'خنثی',
    'Not due yet': 'هنوز موعدش نرسیده',
    // Tasks tab
    'Nothing pending.': 'کاری در انتظار نیست.',
    'Tap + to add a task.': 'برای افزودن یک کار، + را لمس کنید.',
    'Mark done': 'انجام شد',
    'added today': 'امروز اضافه شد',
    // Score tab
    'All-time score': 'امتیاز کل',
    'All-time rating': 'رتبه کل',
    'Today': 'امروز', 'This week': 'این هفته', 'This month': 'این ماه',
    'Routines tracked': 'روتین‌های ثبت‌شده',
    // Settings
    'Back': 'بازگشت',
    'Account': 'حساب کاربری',
    'Backup': 'پشتیبان‌گیری', 'Restore': 'بازگردانی اطلاعات', 'Log out': 'خروج از حساب',
    'Log in to back up your data to this device, or restore it on another.': 'برای پشتیبان‌گیری از اطلاعات روی این دستگاه یا بازگردانی آن روی دستگاه دیگر، وارد شوید.',
    'Log back in': 'دوباره وارد شوید', 'Sign up / Log in': 'ثبت‌نام / ورود',
    'Appearance': 'ظاهر برنامه',
    'System': 'سیستم', 'Light': 'روشن', 'Dark': 'تیره',
    'Sound': 'صدا', 'Sound on completion': 'صدا هنگام تکمیل',
    'Language': 'زبان', 'English': 'English', 'Farsi': 'فارسی',
    'Danger zone': 'منطقه خطر',
    'Reset everything': 'بازنشانی همه‌چیز', 'Delete account': 'حذف حساب',
    'Saved to your Downloads folder with the name "life-score-backup"': 'با نام «life-score-backup» در پوشه دانلودهای شما ذخیره شد',
    'Look for "life-score-backup.json" in your Downloads folder': '«life-score-backup.json» را در پوشه دانلودهای خود پیدا کنید',
    // Difficulty
    'Difficulty': 'سختی', 'Easy': 'آسان', 'Normal': 'متوسط', 'Hard': 'سخت',
    // Ratings
    'NOT GOOD': 'خوب نیست', 'GOOD': 'خوب', 'GREAT!': 'عالی!', 'AWESOME!!!': 'فوق‌العاده!!!',
    'no rating yet': 'هنوز رتبه‌ای نیست', 'Edit routine': 'ویرایش روتین',
    'Name & emoji': 'نام و ایموجی',
    'e.g. Brush teeth': 'مثلاً مسواک زدن',
    '+ Add details': '+ افزودن جزئیات',
    'Description (optional)': 'توضیحات (اختیاری)',
    'Add extra detail': 'جزئیات بیشتر اضافه کنید',
    'Repeats': 'تکرار',
    'Which day(s) of the week': 'کدام روز(های) هفته',
    'Which day(s) of the month': 'کدام روز(های) ماه',
    'Reward value (fixed)': 'مقدار پاداش (ثابت)',
    'Penalty if missed': 'جزای از دست دادن',
    'Base points (difficulty)': 'امتیاز پایه (سختی)',
    'Cancel': 'انصراف', 'Add routine': 'افزودن روتین',
    'Locked after the first day': 'بعد از روز اول قفل می‌شود',
    "Repeat type can't be changed after creation": 'نوع تکرار بعد از ساخت قابل تغییر نیست',
    'Save changes': 'ذخیره تغییرات',
    // Modals: task
    'New task': 'کار جدید', 'Edit task': 'ویرایش کار',
    'e.g. Call dentist': 'مثلاً تماس با دندان‌پزشک',
    'Add extra detail, e.g. a phone number': 'جزئیات بیشتر، مثلاً یک شماره تلفن',
    'Starting value': 'مقدار شروع',
    'Decay per day': 'کاهش در روز',
    'Add task': 'افزودن کار',
    // Modals: reset / login
    'Reset everything?': 'همه‌چیز بازنشانی شود؟',
    "This permanently deletes all routines, tasks, and score history. This can't be undone.": 'این کار همه روتین‌ها، کارها و تاریخچه امتیاز را برای همیشه حذف می‌کند. این عمل قابل بازگشت نیست.',
    'Name': 'نام', 'Your name': 'نام شما', 'Email': 'ایمیل', 'Save': 'ذخیره', 'Log in': 'ورود',
    "This just creates a local profile on this device for now — no account is created on a server, and nothing is verified. It's here so your name can be used in the app, and so it's ready for real accounts in a future version.":
      'این فقط یک پروفایل محلی روی همین دستگاه می‌سازد — هیچ حسابی روی سرور ساخته نمی‌شود و چیزی تأیید نمی‌شود. این بخش برای این است که نام شما در برنامه استفاده شود و برای حساب‌های واقعی در نسخه‌های آینده آماده باشد.',
    // Toasts
    "That email doesn't look right": 'این ایمیل درست به نظر نمی‌رسد',
    'Enter a name': 'یک نام وارد کنید',
    'Backup failed — try again': 'پشتیبان‌گیری ناموفق بود — دوباره تلاش کنید',
    "That file doesn't look like a Life Score backup": 'این فایل شبیه پشتیبان Life Score نیست',
    'Could not read that file': 'این فایل خوانده نشد',
    'Data restored': 'اطلاعات بازگردانی شد',
    'Logged out': 'از حساب خارج شدید',
    'Account deleted': 'حساب حذف شد',
    'Give it a name': 'یک نام برایش بگذارید',
    'Pick at least one day': 'حداقل یک روز انتخاب کنید',
    'Routine updated': 'روتین به‌روزرسانی شد',
    'Task updated': 'کار به‌روزرسانی شد',
    'Everything reset': 'همه‌چیز بازنشانی شد',
    'Could not save — try again': 'ذخیره نشد — دوباره تلاش کنید',
    'Something went wrong loading your data': 'مشکلی در بارگذاری اطلاعات شما پیش آمد',
    // Confirm dialogs
    'Remove this routine? Its consistency history will be lost.': 'این روتین حذف شود؟ تاریخچه پیوستگی آن از بین می‌رود.',
    'Remove this task without earning or losing points for it?': 'این کار بدون کسب یا از دست دادن امتیاز حذف شود؟',
    'Log out? Your profile stays saved on this device — you can log back in anytime. Your routines, tasks, and scores are unaffected either way.':
      'از حساب خارج شوید؟ پروفایل شما روی این دستگاه ذخیره می‌ماند — هر وقت بخواهید می‌توانید دوباره وارد شوید. روتین‌ها، کارها و امتیازهای شما در هر صورت تغییری نمی‌کنند.',
    'Permanently delete this profile (name and email) from this device? Your routines, tasks, and scores are not affected — only the account itself is removed.':
      'این پروفایل (نام و ایمیل) برای همیشه از این دستگاه حذف شود؟ روتین‌ها، کارها و امتیازهای شما تغییری نمی‌کنند — فقط خود حساب حذف می‌شود.',
  }
};
function tr(key){
  const lang = (state.settings && state.settings.language) || 'en';
  if(lang!=='en' && LANG_DICT[lang] && LANG_DICT[lang][key]) return LANG_DICT[lang][key];
  return key;
}
function curLang(){ return (state.settings && state.settings.language) || 'en'; }
// Locale used for built-in date formatting. fa-IR-u-ca-gregory gives Farsi weekday/month
// names while keeping the Gregorian calendar (no date-math side effects elsewhere).
function localeForLang(){ return curLang()==='fa' ? 'fa-IR-u-ca-gregory' : 'en-US'; }
// Week starts Saturday. Day indices in display order: Sat(6),Sun(0),Mon(1),Tue(2),Wed(3),Thu(4),Fri(5)
const WEEK_DAY_ORDER = [6,0,1,2,3,4,5];
function weekdayShortNames(){
  return curLang()==='fa'
    ? ['شنبه','۱شنبه','۲شنبه','۳شنبه','۴شنبه','۵شنبه','جمعه']
    : ['Sat','Sun','Mon','Tue','Wed','Thu','Fri'];
}
// Converts Western digits to Eastern Arabic (Persian) numerals for Farsi mode.
function numFa(n){
  return String(n).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}
// ---- Dynamic-phrase helpers (sentences with a variable in them can't be a flat dict lookup) ----
function trTallyLine(done,total){
  if(curLang()==='fa') return `${numFa(done)} از ${numFa(total)} امروز انجام شد`;
  return `${done} of ${total} done today`;
}
function trAddedLabel(days){
  if(curLang()==='fa') return days===0 ? 'امروز اضافه شد' : `${numFa(days)} روز پیش اضافه شد`;
  return days===0 ? 'added today' : `added ${days} day${days===1?'':'s'} ago`;
}
function trDecaysPerDay(rate){
  return curLang()==='fa' ? `کاهش ${numFa(rate)}/روز` : `decays ${rate}/day`;
}
function trEarned(points){
  const sign = points>=0 ? '+' : '';
  return curLang()==='fa' ? `${sign}${numFa(Math.abs(points))} کسب شد` : `${sign}${points} earned`;
}
function trNextDue(label){
  return curLang()==='fa' ? `موعد بعدی: ${label}` : `Next due: ${label}`;
}
function trPenaltyIfMissed(val){
  return curLang()==='fa' ? `-${numFa(Math.abs(val))} جزا (در صورت ازدست‌دادن)` : `-${Math.abs(val)} Penalty (If missed)`;
}
function trDueDates(text){
  return curLang()==='fa' ? `روزهای موعد: ${text}` : `Due dates: ${text}`;
}
function trWelcome(name){
  return curLang()==='fa' ? `خوش آمدی، ${name}` : `Welcome, ${name}`;
}
function trTaskDoneToast(val, name){
  const sign = val>=0 ? '+' : '';
  return curLang()==='fa' ? `${sign}${numFa(Math.abs(val))} · ${name} انجام شد` : `${sign}${val} · ${name} done`;
}
// Updates the bits of static markup in index.html that live outside any render*() function
// (nav tab labels) — used on init, and as part of applyLanguage() below.
function applyNavLabels(){
  // Toggle RTL body class — CSS handles all text-direction changes from here
  document.body.classList.toggle('lang-fa', curLang()==='fa');
  const navKeys = { today:'Home', routines:'Routines', tasks:'Tasks', score:'Score' };
  document.querySelectorAll('nav.tabs button').forEach(btn=>{
    const key = navKeys[btn.dataset.tab];
    if(!key) return;
    const svg = btn.querySelector('svg');
    btn.innerHTML = '';
    if(svg) btn.appendChild(svg);
    btn.appendChild(document.createTextNode(' ' + tr(key)));
  });
}
function applyLanguage(){
  applyNavLabels();
  updateHeader();
  renderMain();
}

// ---------- Difficulty system ----------
const DIFFICULTY_POINTS = {
  daily:   { easy: 20, normal: 40, hard: 60  },
  weekly:  { easy: 40, normal: 60, hard: 80  },
  monthly: { easy: 60, normal: 80, hard: 100 },
  task:    { easy: 20, normal: 60, hard: 100 },
};
const WEEKLY_MONTHLY_PENALTY = 30;
const TASK_DECAY_RATE = 10;
function difficultyPointsFor(recurrence, diff){
  const key = recurrence === 'once' ? 'task' : recurrence;
  return (DIFFICULTY_POINTS[key] || DIFFICULTY_POINTS.task)[diff || 'normal'];
}

// ---------- Rating system ----------

// Was routine r due on the given date?
function wasRoutineDueOn(r, dateStr){
  if(r.createdDate > dateStr) return false;
  if(r.recurrence==='daily') return true;
  const d = new Date(dateStr+'T00:00:00');
  if(r.recurrence==='weekly') return (r.schedule||[]).includes(d.getDay());
  if(r.recurrence==='monthly') return (r.schedule||[]).includes(d.getDate());
  return false;
}
// Total possible BASE points from routines on a given date (no streak/neglect modifier).
function getDailyBasePoints(dateStr){
  return state.routines.reduce((sum, r)=>{
    if(!wasRoutineDueOn(r, dateStr)) return sum;
    return sum + (r.recurrence==='daily' ? r.basePoints : r.rewardValue);
  }, 0);
}
// Total points actually logged on a given date (can be negative; includes tasks + penalties).
function getDailyLogPoints(dateStr){
  const start = state.settings.ratingStartDate;
  if(start && dateStr < start) return 0;
  return state.log.filter(e=>e.date===dateStr).reduce((sum,e)=>sum+(e.points||0), 0);
}
// Is this day "not-productive"? (fewer than 5 routines-due + tasks-in-play)
function isNotProductiveDay(dateStr){
  const start = state.settings.ratingStartDate;
  if(start && dateStr < start) return true;
  const dueRoutines = state.routines.filter(r=>wasRoutineDueOn(r, dateStr)).length;
  const activeTasks = state.tasks.filter(t=>
    t.createdDate<=dateStr && (t.completedDate===null || t.completedDate>=dateStr)
  ).length;
  return (dueRoutines + activeTasks) < 5;
}
// Apply NP cap: clamps GREAT!/AWESOME!!! to GOOD when limited.
function applyRatingCap(rating, limited){
  if(!limited || rating===null) return rating;
  if(rating==='GREAT!' || rating==='AWESOME!!!') return 'GOOD';
  return rating;
}
// Core bucket: received/base → rating tier. No cap applied here.
function calcRating(received, base){
  if(base===0) return null;
  const pct = received/base;
  if(pct>1.0) return 'AWESOME!!!';
  if(pct>=0.8) return 'GREAT!';
  if(pct>=0.5) return 'GOOD';
  return 'NOT GOOD';
}
// Saturday–Friday week: the Saturday on or before dateStr.
function getWeekStart(dateStr){
  const day = new Date(dateStr+'T00:00:00').getDay(); // 0=Sun…6=Sat
  return addDays(dateStr, day===6 ? 0 : -(day+1));
}
// Last date of a 'YYYY-MM' month string.
function monthEndStr(monthStr){
  const [y, m] = monthStr.split('-').map(Number);
  return todayStr(new Date(y, m, 0));
}
// Aggregate base pts + received pts + NP count over [from, to] (clamped to ratingStartDate/today).
function aggregatePeriod(from, to){
  const start = state.settings.ratingStartDate;
  const today = todayStr();
  const iterFrom = (start && from<start) ? start : from;
  const iterTo   = to>today ? today : to;
  let base=0, received=0, npCount=0, days=0;
  let d = iterFrom;
  while(d<=iterTo){
    base     += getDailyBasePoints(d);
    received += getDailyLogPoints(d);
    if(isNotProductiveDay(d)) npCount++;
    days++;
    d = addDays(d, 1);
  }
  return {base, received, npCount, days};
}

// ---- Public rating getters ----
function getTodayRating(){
  if(!state.settings.ratingStartDate) return null;
  const today = todayStr();
  const base = getDailyBasePoints(today);
  const received = Math.max(0, getDailyLogPoints(today));
  const notProd = isNotProductiveDay(today);
  let rating = applyRatingCap(calcRating(received, base), notProd);
  // Before noon: suppress NOT GOOD — too early to pass judgment
  if(new Date().getHours()<12 && rating==='NOT GOOD') return null;
  return rating;
}
function getWeekRating(){
  if(!state.settings.ratingStartDate) return null;
  const {base, received, npCount} = aggregatePeriod(getWeekStart(todayStr()), todayStr());
  return applyRatingCap(calcRating(Math.max(0,received), base), npCount>=4);
}
function getMonthRatingFor(monthStr){
  if(!state.settings.ratingStartDate) return null;
  const {base, received, npCount} = aggregatePeriod(monthStr+'-01', monthEndStr(monthStr));
  return applyRatingCap(calcRating(Math.max(0,received), base), npCount>=18);
}
function getCurrentMonthRating(){ return getMonthRatingFor(todayStr().slice(0,7)); }
// Walks completed months to track overlook advantage:
// earned by a GREAT!/AWESOME!!! month, revoked by a month with ≥18 NP days.
function computeOverlookActive(){
  const start = state.settings.ratingStartDate;
  if(!start) return false;
  const today = todayStr();
  let overlookActive = false;
  let sy=parseInt(start.slice(0,4)), sm=parseInt(start.slice(5,7));
  const ty=parseInt(today.slice(0,4)), tm=parseInt(today.slice(5,7));
  while(sy<ty || (sy===ty && sm<tm)){
    const monthStr = `${sy}-${String(sm).padStart(2,'0')}`;
    const {base, received, npCount} = aggregatePeriod(monthStr+'-01', monthEndStr(monthStr));
    const isNpMonth = npCount>=18;
    const rating = applyRatingCap(calcRating(Math.max(0,received), base), isNpMonth);
    if(rating==='GREAT!' || rating==='AWESOME!!!') overlookActive = true;
    else if(isNpMonth && overlookActive) overlookActive = false;
    sm++; if(sm>12){ sm=1; sy++; }
  }
  return overlookActive;
}
function getAllTimeRating(){
  const start = state.settings.ratingStartDate;
  if(!start) return null;
  const {base, received, npCount, days} = aggregatePeriod(start, todayStr());
  const isLimited = !computeOverlookActive() && days>0 && (npCount/days)>0.6;
  return applyRatingCap(calcRating(Math.max(0,received), base), isLimited);
}


const ROUTINE_FALLBACK_EMOJI = '🎯';
const TASK_DEFAULT_EMOJI = '📋';

// Shared pools (reused across related keywords so matches feel varied but consistent)
const P_SLEEP = ['😴','💤','🛏️','🌙'];
const P_MEALS = ['🍕','🍔','🍟','🌭','🌮','🌯','🥪','🥙','🥘','🍗','🍖','🥩','🍤','🍙'];
const P_WATER = ['💧','🚰'];
const P_COOKING = ['👨‍🍳','👩‍🍳','🧑‍🍳','🍳','🥘'];
const P_NUTRITION = ['🥗','🥬','🥦','🥕','🍎','🍌','🫐','🍇','🍓','🥝','🍍'];
const P_BATHING = ['🚿','🛁','🧼'];
const P_GROOM_TOUCH = ['💆','💆‍♀️'];
const P_HEALTH = ['⚕️','🩺'];
const P_SAUNA = ['🧖','🧖‍♀️'];
const P_WALK = ['🚶','🚶‍♀️','🚶‍♂️'];
const P_RUN = ['🏃','🏃‍♀️','🏃‍♂️'];
const P_BIKE = ['🚴','🚴‍♀️','🚴‍♂️'];
const P_SWIM = ['🏊','🏊‍♀️','🏊‍♂️'];
const P_GYM = ['🏋️','🏋️‍♀️','🏋️‍♂️','💪'];
const P_STRETCH = ['🤸','🤸‍♀️','🤸‍♂️'];
const P_YOGA = ['🧘','🧘‍♀️','🧘‍♂️'];
const P_MINDFUL = ['🧘','🙏','🪷','🌿','☀️'];
const P_READ = ['📚','📖','📕','📗','📘','📙','📓','🎓','📝','✏️','🖋️'];
const P_WRITE = ['✍️','📝','📓','📒','📔','📖','🖊️','🖋️','✒️','✏️'];
const P_MUSIC = ['🎵','🎶','🎼','🎤','🎧','🎺','🎷','🪕','🪘','🥁','🎻'];
const P_PHOTO = ['📷','📸'];
const P_VIDEO = ['🎥','🎬','🎞️'];
const P_OFFICE = ['💼','🖥️','💻','📊','📈','📉','📅','🗓️','📋'];
const P_CALL = ['☎️','📞'];
const P_CAREER = ['💼','👔','🎯'];
const P_FOCUS = ['🎯','🧠','⌛'];
const P_PLANNING = ['📋','✅','✔️','☑️','📝','📌'];
const P_CALENDAR = ['📅','🗓️'];
const P_CLEAN = ['🧹','🪣','🧽'];
const P_LAUNDRY = ['👕','👚'];
const P_ORGANIZE = ['📦','📁','📂','🗂️','🗃️','🏷️'];
const P_DIY = ['🧰','🔨','🪛','🪚'];
const P_SOCIAL = ['👥','🫂','💬'];
const P_ENTERTAIN = ['📺','🎬','🍿','🎮','🕹️','🎲','🎭','🎪'];
const P_OUTDOOR = ['🏕️','🌄','🌅','🌞','🌳','🌲','🛶','⛰️'];
const P_TRAVEL = ['✈️','🗺️','🧭'];
const P_DRIVE = ['🚗','🚕','🚙'];
const P_BUS = ['🚌','🚎'];
const P_TRAIN = ['🚆','🚄','🚅'];
const P_SHOP = ['🛒','🛍️'];
const P_MONEY = ['💰','💵','💴','💶','💷','💳','🏦'];
const P_INBOX = ['📤','📥'];
const P_DIGITAL = ['💻','🖥️','📱','⌨️','🖱️','🌐','☁️','📡','🔋','🔌','💾'];
const P_PRAY = ['🙏','🛐'];
const P_CELEBRATE = ['🎉','🎊'];
const P_BIRTHDAY = ['🎂','🎁','🎈'];
const P_HAPPY = ['😊','😄'];
const P_KIND = ['😊','❤️'];
const P_MISC = ['✨','🌟'];

const EMOJI_VARIETY = {
  // Sleep
  'sleep': P_SLEEP, 'sleeping': P_SLEEP, 'slept': P_SLEEP, 'nap': P_SLEEP, 'napping': P_SLEEP,
  // Meals
  'lunch': P_MEALS, 'dinner': P_MEALS, 'snack': P_MEALS, 'snacking': P_MEALS, 'dessert': P_MEALS,
  'food': P_MEALS, 'diet': P_MEALS, 'dieting': P_MEALS, 'eat': P_MEALS, 'eating': P_MEALS, 'ate': P_MEALS,
  'meal': P_MEALS, 'meals': P_MEALS,
  // Water
  'water': P_WATER, 'watering': P_WATER, 'hydration': P_WATER, 'hydrate': P_WATER, 'hydrating': P_WATER,
  // Cooking
  'cook': P_COOKING, 'cooking': P_COOKING, 'cooked': P_COOKING, 'bake': P_COOKING, 'baking': P_COOKING, 'baked': P_COOKING,
  // Nutrition
  'fruit': P_NUTRITION, 'fruits': P_NUTRITION, 'vegetable': P_NUTRITION, 'vegetables': P_NUTRITION,
  'veggie': P_NUTRITION, 'veggies': P_NUTRITION, 'protein': P_NUTRITION, 'calorie': P_NUTRITION,
  'calories': P_NUTRITION, 'nutrition': P_NUTRITION,
  // Bathing
  'shower': P_BATHING, 'showering': P_BATHING, 'bath': P_BATHING, 'bathing': P_BATHING,
  'wash face': P_BATHING, 'washing face': P_BATHING,
  // Grooming / Recovery (touch-based)
  'haircare': P_GROOM_TOUCH, 'hair care': P_GROOM_TOUCH, 'massage': P_GROOM_TOUCH,
  'self care': P_GROOM_TOUCH, 'selfcare': P_GROOM_TOUCH,
  'sauna': P_SAUNA,
  // Health
  'health': P_HEALTH, 'checkup': P_HEALTH, 'check up': P_HEALTH,
  // Walking & Running
  'walk': P_WALK, 'walking': P_WALK, 'walked': P_WALK,
  'run': P_RUN, 'running': P_RUN, 'ran': P_RUN, 'jog': P_RUN, 'jogging': P_RUN, 'jogged': P_RUN,
  'hike': P_RUN, 'hiking': P_RUN, 'hiked': P_RUN,
  // Cycling & Swimming
  'bike': P_BIKE, 'biking': P_BIKE, 'cycle': P_BIKE, 'cycling': P_BIKE,
  'swim': P_SWIM, 'swimming': P_SWIM, 'swam': P_SWIM,
  // Gym
  'gym': P_GYM, 'workout': P_GYM, 'working out': P_GYM, 'worked out': P_GYM,
  'cardio': P_GYM, 'strength training': P_GYM, 'strength': P_GYM,
  // Flexibility
  'stretch': P_STRETCH, 'stretching': P_STRETCH,
  'yoga': P_YOGA,
  // Mindfulness
  'meditate': P_MINDFUL, 'meditation': P_MINDFUL, 'meditating': P_MINDFUL,
  'breathing': P_MINDFUL, 'breathe': P_MINDFUL, 'gratitude': P_MINDFUL,
  'reflection': P_MINDFUL, 'reflecting': P_MINDFUL,
  // Reading & Learning
  'read': P_READ, 'reading': P_READ, 'study': P_READ, 'studying': P_READ, 'homework': P_READ,
  'learn': P_READ, 'learning': P_READ, 'practice': P_READ, 'practicing': P_READ,
  'research': P_READ, 'researching': P_READ, 'flashcards': P_READ, 'notes': P_READ,
  'audiobook': P_READ, 'audiobooks': P_READ, 'podcast': P_READ, 'podcasts': P_READ,
  // Writing
  'write': P_WRITE, 'writing': P_WRITE, 'wrote': P_WRITE, 'journal': P_WRITE,
  'journaling': P_WRITE, 'blog': P_WRITE, 'blogging': P_WRITE,
  // Music
  'music': P_MUSIC, 'sing': P_MUSIC, 'singing': P_MUSIC, 'listen to music': P_MUSIC, 'listening to music': P_MUSIC,
  // Photography & Media
  'photography': P_PHOTO, 'photo': P_PHOTO, 'photos': P_PHOTO,
  'photo editing': P_PHOTO, 'editing photos': P_PHOTO,
  'video editing': P_VIDEO, 'editing video': P_VIDEO,
  // Office Work
  'work': P_OFFICE, 'working': P_OFFICE, 'meeting': P_OFFICE, 'meetings': P_OFFICE, 'presentation': P_OFFICE,
  'call': P_CALL, 'calling': P_CALL,
  // Career
  'interview': P_CAREER, 'interviewing': P_CAREER, 'job search': P_CAREER, 'job hunting': P_CAREER,
  'resume': P_CAREER, 'networking': P_CAREER,
  // Focus
  'deep work': P_FOCUS, 'focus': P_FOCUS, 'focusing': P_FOCUS, 'pomodoro': P_FOCUS,
  // Planning
  'calendar': P_CALENDAR, 'to-do list': P_PLANNING, 'to do list': P_PLANNING, 'todo list': P_PLANNING,
  'planning': P_PLANNING, 'goal review': P_PLANNING, 'goal setting': P_PLANNING, 'habit review': P_PLANNING,
  // Home Cleaning
  'clean': P_CLEAN, 'cleaning': P_CLEAN, 'cleaned': P_CLEAN, 'clean room': P_CLEAN, 'cleaning room': P_CLEAN,
  'vacuum': P_CLEAN, 'vacuuming': P_CLEAN, 'mop': P_CLEAN, 'mopping': P_CLEAN,
  'laundry': P_LAUNDRY, 'ironing': P_LAUNDRY, 'iron clothes': P_LAUNDRY,
  // Organization
  'organize': P_ORGANIZE, 'organizing': P_ORGANIZE, 'organized': P_ORGANIZE,
  'declutter': P_ORGANIZE, 'decluttering': P_ORGANIZE, 'declutter desktop': P_ORGANIZE,
  'file documents': P_ORGANIZE, 'filing documents': P_ORGANIZE,
  // Home Care
  'diy': P_DIY, 'repairs': P_DIY, 'repairing': P_DIY, 'fix': P_DIY, 'fixing': P_DIY,
  // Social
  'friends': P_SOCIAL, 'friend': P_SOCIAL, 'socialize': P_SOCIAL, 'socializing': P_SOCIAL, 'date': P_SOCIAL, 'dating': P_SOCIAL,
  // Entertainment
  'watch tv': P_ENTERTAIN, 'watching tv': P_ENTERTAIN, 'movie': P_ENTERTAIN, 'movies': P_ENTERTAIN,
  'anime': P_ENTERTAIN, 'youtube': P_ENTERTAIN, 'netflix': P_ENTERTAIN,
  'gaming': P_ENTERTAIN, 'game': P_ENTERTAIN, 'games': P_ENTERTAIN, 'playing games': P_ENTERTAIN,
  'puzzle': P_ENTERTAIN, 'puzzles': P_ENTERTAIN,
  // Outdoor
  'picnic': P_OUTDOOR, 'camping': P_OUTDOOR, 'camp': P_OUTDOOR, 'barbecue': P_OUTDOOR, 'bbq': P_OUTDOOR,
  'birdwatching': P_OUTDOOR, 'bird watching': P_OUTDOOR, 'explore': P_OUTDOOR, 'exploring': P_OUTDOOR, 'adventure': P_OUTDOOR,
  // Travel
  'drive': P_DRIVE, 'driving': P_DRIVE, 'bus': P_BUS, 'train': P_TRAIN,
  'travel': P_TRAVEL, 'traveling': P_TRAVEL, 'travelling': P_TRAVEL,
  'pack': P_TRAVEL, 'packing': P_TRAVEL, 'unpack': P_TRAVEL, 'unpacking': P_TRAVEL, 'moving': P_TRAVEL,
  // Shopping
  'shop': P_SHOP, 'shopping': P_SHOP, 'shopping list': P_SHOP, 'errands': P_SHOP,
  // Money
  'bank': P_MONEY, 'banking': P_MONEY, 'budget': P_MONEY, 'budgeting': P_MONEY, 'budget review': P_MONEY,
  'expense tracking': P_MONEY, 'tracking expenses': P_MONEY, 'pay bills': P_MONEY, 'paying bills': P_MONEY,
  'save money': P_MONEY, 'saving money': P_MONEY,
  // Digital
  'email inbox': P_INBOX, 'inbox': P_INBOX, 'inbox zero': P_INBOX, 'cleaning inbox': P_INBOX,
  'backup': P_DIGITAL, 'backing up': P_DIGITAL, 'upload': P_DIGITAL, 'uploading': P_DIGITAL,
  'download': P_DIGITAL, 'downloading': P_DIGITAL, 'print': P_DIGITAL, 'printing': P_DIGITAL,
  'scan documents': P_DIGITAL, 'scanning documents': P_DIGITAL, 'charge devices': P_DIGITAL,
  'charging devices': P_DIGITAL, 'update apps': P_DIGITAL, 'updating apps': P_DIGITAL,
  'screen time': P_DIGITAL, 'digital detox': P_DIGITAL, 'weather check': P_DIGITAL,
  // Spiritual
  'pray': P_PRAY, 'praying': P_PRAY,
  // Misc
  'celebrate': P_CELEBRATE, 'celebrating': P_CELEBRATE, 'celebration': P_CELEBRATE,
  'birthday': P_BIRTHDAY, 'holiday': P_CELEBRATE, 'holidays': P_CELEBRATE,
  'happiness': P_HAPPY, 'happy': P_HAPPY, 'kindness': P_KIND, 'kind': P_KIND,
  'random act of kindness': P_KIND,
  'appointment': P_MISC, 'appointments': P_MISC, 'relax': P_MISC, 'relaxing': P_MISC,
  'rest': P_MISC, 'resting': P_MISC, 'recharge': P_MISC, 'recharging': P_MISC,
};

const EMOJI_SINGLE = {
  // Sleep
  'wake up': '🌅', 'waking up': '🌅', 'woke up': '🌅',
  // Meals
  'breakfast': '🍳',
  // Oral care
  'brush teeth': '🪥', 'brushing teeth': '🪥', 'teeth': '🦷', 'floss': '🪥', 'flossing': '🪥',
  // Grooming
  'shave': '🪒', 'shaving': '🪒', 'makeup': '💄', 'skincare': '🧴', 'sunscreen': '🧴',
  // Health
  'vitamins': '💊', 'vitamin': '💊', 'medication': '💊', 'medicine': '💊', 'meds': '💊',
  'weigh': '🫀', 'weighing': '🫀', 'weight': '🫀', 'doctor': '🩺', 'dentist': '🩺', 'therapy': '🩺',
  // Recovery
  'ice bath': '🧊',
  // Flexibility
  'pilates': '🤾',
  // Art
  'draw': '🎨', 'drawing': '🎨', 'paint': '🎨', 'painting': '🎨',
  'craft': '🖼️', 'crafting': '🖼️', 'knit': '🪡', 'knitting': '🪡', 'crochet': '🧶', 'crocheting': '🧶',
  'design': '🖼️', 'designing': '🖼️',
  // Music
  'piano': '🎹', 'guitar': '🎸', 'dance': '💃', 'dancing': '💃',
  // Photography & Media
  'content creation': '📱', 'streaming': '📹',
  // Office / Software
  'email': '📧', 'coding': '💻', 'code': '💻', 'side project': '💻', 'freelance': '💻', 'freelancing': '💻',
  // Home cleaning
  'dishes': '🧽', 'trash': '🗑️', 'garbage': '🗑️',
  // Home care
  'bed': '🛏️', 'making bed': '🛏️', 'windows': '🪟',
  // Gardening
  'garden': '🪴', 'gardening': '🪴', 'plants': '🪴',
  // Pets
  'pet care': '🐾', 'pet': '🐾', 'feed pet': '🐾', 'feeding pet': '🐾',
  'walk dog': '🐕', 'walking dog': '🐕', 'play with pet': '🐾', 'playing with pet': '🐾',
  // Family
  'family time': '🏡', 'childcare': '🏡', 'feed baby': '🏡', 'feeding baby': '🏡',
  'call parents': '🏡', 'calling parents': '🏡', 'call family': '🏡', 'calling family': '🏡',
  // Social
  'text': '💬', 'texting': '💬',
  // Outdoor
  'beach': '🏖️', 'fishing': '🎣', 'fish': '🎣', 'stargazing': '🔭',
  // Money
  'invest': '📈', 'investing': '📈',
  // Vehicle
  'car wash': '🚗', 'refuel': '⛽', 'refueling': '⛽', 'maintenance': '🔧',
  // Spiritual
  'church': '🛐', 'mosque': '🛐', 'temple': '🛐',
  // Misc
  'morning routine': '🌅', 'evening routine': '🌇', 'night routine': '🌙',
};

// Whole-word/phrase matching: avoids false positives like "eat" matching inside
// "heating" or "treat". Multi-word keys (e.g. "side project") match as a phrase.
function wholeWordMatch(text, key){
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}
function pickRoutineEmoji(name){
  const n = name || '';
  for(const key in EMOJI_VARIETY){
    if(wholeWordMatch(n, key)){
      const pool = EMOJI_VARIETY[key];
      return pool[Math.floor(Math.random()*pool.length)];
    }
  }
  for(const key in EMOJI_SINGLE){
    if(wholeWordMatch(n, key)) return EMOJI_SINGLE[key];
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
  if(recurrence==='weekly') return d.toLocaleDateString(localeForLang(), {weekday:'long'});
  return d.toLocaleDateString(localeForLang(), {month:'short', day:'numeric'});
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
  showToast(trTaskDoneToast(val, task.name));
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

// Returns { received, base } for a date range — used by the Score tab tiles.
// received = all log points (routines + tasks, floored at 0 for display).
// base = routine base points only (no tasks, no streak/neglect).
function getPeriodData(from, to){
  const {base, received} = aggregatePeriod(from, to);
  return {base, received};
}

function getScores(){
  const t = todayStr();
  const weekStart = getWeekStart(t);   // Saturday-based (matches rating system)
  const monthStart = t.slice(0,7)+'-01';
  const monthEnd = monthEndStr(t.slice(0,7));
  return {
    daily:   getPeriodData(t, t),
    weekly:  getPeriodData(weekStart, t),
    monthly: getPeriodData(monthStart, monthEnd),
    allTime: getPeriodData(state.settings.ratingStartDate || t, t),
  };
}
