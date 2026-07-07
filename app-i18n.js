// ---------- i18n ----------
// Language dictionary, tr() lookup, locale/weekday helpers, dynamic-phrase translators,
// and the two functions that apply language changes to the DOM. English strings are the
// dictionary keys, so nothing breaks if a translation is missing — it just falls back to English.
// (Split out of the former monolithic app-state.js — see ARCHITECTURE.md.)
// rough Farsi pass — not RTL, just translated text
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
    'Progression': 'پیشرفت',
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
    'Notifications': 'اعلان‌ها', 'Remind me if nothing is checked off': 'اگر چیزی انجام نشده یادآوری کن',
    'A nudge at noon if no routine or task has been done yet that day.': 'اگر تا ظهر هیچ روتین یا کاری انجام نشده باشد، یادآوری می‌شود.',
    'No notifications yet': 'هنوز اعلانی وجود ندارد', 'Close': 'بستن',
    "Notifications aren't supported on this browser": 'این مرورگر از اعلان‌ها پشتیبانی نمی‌کند',
    'Notification permission was not granted': 'اجازه اعلان داده نشد',
    'Notifications enabled': 'اعلان‌ها فعال شد', 'Notifications turned off': 'اعلان‌ها خاموش شد',
    'Could not enable notifications — try again': 'فعال‌سازی اعلان‌ها ممکن نشد — دوباره تلاش کنید',
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
    '+ Add time & details': '+ افزودن زمان و جزئیات',
    'Time': 'زمان',
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
    // Category 2 notifications
    'New Milestone!': 'نقطه عطف جدید!',
    'You made it back!!': 'برگشتی!!',
    'Be careful!': 'مراقب باش!',
    'Daily Rating limit.': 'محدودیت رتبه روزانه.',
    'Weekly Rating limit.': 'محدودیت رتبه هفتگی.',
    'Monthly Rating limit.': 'محدودیت رتبه ماهانه.',
    'Show more': 'مشاهده بیشتر',
    'Delete this notification from your history?': 'این اعلان برای همیشه از تاریخچه حذف شود؟',
    'Delete': 'حذف',
    "This can't be undone.": 'این کار قابل بازگشت نیست.',
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

// Formats a "HH:MM" (24h, from <input type="time">) into a locale-appropriate display string.
function formatTimeLabel(timeStr){
  if(!timeStr) return '';
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10), mnt = parseInt(parts[1], 10);
  if(isNaN(h) || isNaN(mnt)) return '';
  return new Date(2000,0,1,h,mnt).toLocaleTimeString(localeForLang(), {hour:'2-digit', minute:'2-digit', hour12:false});
}
function timeChipHtml(timeStr){
  if(!timeStr) return '';
  return `<span class="item-time">🕐 ${formatTimeLabel(timeStr)}</span>`;
}
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

// ---- Category 2 notification message builders ----
// Kept together and separate from the trigger-detection logic in app-notif-triggers.js —
// this file owns *text*, that file owns *when*. Wording here is a first pass; the
// occurrences/triggers are the stable part, not this exact phrasing (see DECISIONS.md).
function trMilestoneNotifBody(emoji, streakCount, routineName){
  if(curLang()==='fa'){
    return `تبریک! به نقطه عطف «${emoji}×${numFa(streakCount)} رکورد» در «${routineName}» رسیدی! این از این به بعد یکی از تور ایمنی‌های تو خواهد بود.`;
  }
  return `Congratulations — you just reached the "${emoji}×${streakCount} Streak" milestone on "${routineName}"! This will be one of your safety-nets moving forward.`;
}
function trRecoveryNotifBody(routineName){
  if(curLang()==='fa'){
    return `با روتین «${routineName}» که قبلاً مورد غفلت واقع شده بود، دوباره به مسیر برگشتی! به‌خاطر پشتکارت بهت افتخار می‌کنم.`;
  }
  return `You're back on track with "${routineName}", a routine that was neglected before. I'm proud of your determination.`;
}
function trNeglectNotifBody(emoji, neglectCount, routineName){
  if(curLang()==='fa'){
    return `به «${emoji}×${numFa(neglectCount)} غفلت» در «${routineName}» رسیدی. هیچ‌وقت برای برگشتن دیر نیست — برنامه کمکت می‌کنه سریع‌تر از چیزی که فکرش رو بکنی این عدد رو کم کنی!`;
  }
  return `You just reached "${emoji}×${neglectCount} neglect" on "${routineName}". It's never too late to get back on track — the app will help you shrink that counter faster than you think!`;
}
// period: 'weekly' | 'monthly'. rating: 'NOT GOOD' | 'GOOD' | 'GREAT!' | 'AWESOME!!!'
function trRatingNotifTitle(period, rating){
  const ratingLabel = tr(rating);
  if(curLang()==='fa'){
    const periodWord = period==='weekly' ? 'هفتگی' : 'ماهانه';
    return `رتبه ${periodWord} «${ratingLabel}»${rating==='NOT GOOD' ? '.' : '!'}`;
  }
  const periodWord = period==='weekly' ? 'weekly' : 'monthly';
  return rating==='NOT GOOD' ? `"${ratingLabel}" ${periodWord} rating.` : `"${ratingLabel}" ${periodWord} rating!`;
}
function trRatingNotifBody(period, rating){
  const pEn = period==='weekly' ? 'week' : 'month';
  if(curLang()==='fa'){
    const pFa = period==='weekly' ? 'هفتگی' : 'ماهانه';
    const pFaNoun = period==='weekly' ? 'هفته' : 'ماه';
    if(rating==='AWESOME!!!') return `رتبه ${pFa} شما «فوق‌العاده!!!» شد — یعنی از سقف انتظار هم فراتر رفتی. همینطور ادامه بده!`;
    if(rating==='GREAT!')     return `رتبه ${pFa} شما «عالی!» شد. کارت واقعاً خوب بود!`;
    if(rating==='GOOD')       return `رتبه این ${pFaNoun} شما «خوب» شد! بد نیست، و مطمئنم دفعه بعد پتانسیل رسیدن به رتبه‌های بالاتر رو داری.`;
    return `رتبه این ${pFaNoun} شما «خوب نیست» شد. اشکالی نداره — مطمئنم با کمی تلاش، ${pFaNoun}‌های بعدی جبران می‌کنی و رتبه کلی‌ات رو نجات می‌دی.`;
  }
  if(rating==='AWESOME!!!') return `Your ${pEn}ly rating was AWESOME!!! You blew right past the top of the scale — keep this up.`;
  if(rating==='GREAT!')     return `Your ${pEn}ly rating was GREAT! That's some seriously solid work.`;
  if(rating==='GOOD')       return `Your rating for this ${pEn} was GOOD! That's pretty good, and I'm sure you have the potential to get higher ratings next time.`;
  return `Your rating for this ${pEn} was NOT GOOD. That's ok — I'm sure with a bit of effort you'll make up for it in the upcoming ${pEn}s to save your overall rating!`;
}
function trDailyNpCapBody(){
  if(curLang()==='fa') return `رتبه فعلی شما به «خوب» و «خوب نیست» محدود شده. برای باز شدن «عالی!» و «فوق‌العاده!!!» حداقل ۵ مورد در لیست روزانه‌تان داشته باشید.`;
  return `Your current rating is limited to "GOOD" and "NOT GOOD". Have at least 5 items in your daily list to unlock "GREAT!" and "AWESOME!!!".`;
}
function trWeeklyNpCapBody(count){
  if(curLang()==='fa') return `این هفته، ${numFa(count)} روز با محدودیت رتبه روزانه داشتید. یک روز دیگر مثل این و رتبه هفتگی‌تان هم محدود می‌شود. سعی کنید موارد بیشتری به لیست روزانه‌تان اضافه کنید.`;
  return `This week, you had ${count} days with daily rating limit. Another day like that and your weekly rating will be limited too. Try to add more items to your daily list.`;
}
function trMonthlyNpCapBody(count){
  if(curLang()==='fa') return `این ماه، ${numFa(count)} روز با محدودیت رتبه روزانه داشتید. یک روز دیگر مثل این و رتبه ماهانه‌تان هم محدود می‌شود. سعی کنید موارد بیشتری به لیست روزانه‌تان اضافه کنید.`;
  return `This month, you had ${count} days with daily rating limit. Another day like that and your monthly rating will be limited too. Try to add more items to your daily list.`;
}
function trAllClearBody(){
  if(curLang()==='fa') return `همه روتین‌ها و کارهای امروز انجام شد. بقیه روز رو راحت باش — جاش رو داری.`;
  return `Every routine and task on today's list is checked off. Take the rest of the day easy — you've earned it.`;
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
