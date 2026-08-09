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
    'Missing a routine costs points': 'ازدست‌دادن یک روتین امتیاز کم می‌کند',
    'more': 'بیشتر', 'less': 'کمتر',
    'None yet.': 'هنوز چیزی نیست.',
    'Nothing here yet.': 'هنوز چیزی اینجا نیست.',
    'Tap + to add your first routine.': 'برای افزودن اولین روتین، + را لمس کنید.',
    'Remove': 'حذف', 'Edit': 'ویرایش',
    'Streak': 'رکورد', 'Neglect': 'غفلت', 'Neutral': 'خنثی',
    'Not due yet': 'هنوز موعدش نرسیده',
    // Tasks tab
    'Missing a task will decay its points': 'ازدست‌دادن یک کار امتیازش را کم‌کم می‌کاهد',
    'points per missed day': 'امتیاز در روز جامانده',
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
    'Sleep cycle': 'چرخه خواب',
    'Night owl mode': 'حالت شب زنده داری',
    'Day ends at 5:00am instead of midnight': 'روز به‌جای نیمه‌شب، ساعت ۵ صبح تمام می‌شود',
    'Grace period applied': 'دوره مهلت اعمال شد',
    "Added late, so today won't count — it starts fresh tomorrow.": 'دیر اضافه شد، پس امروز حساب نمی‌شود — از فردا از نو شروع می‌شود.',
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
    'Saved to your Downloads folder with the name "lifyar-backup"': 'با نام «lifyar-backup» در پوشه دانلودهای شما ذخیره شد',
    'Look for "lifyar-backup.json" in your Downloads folder': '«lifyar-backup.json» را در پوشه دانلودهای خود پیدا کنید',
    // Difficulty
    'Difficulty': 'سختی', 'Easy': 'آسان', 'Normal': 'متوسط', 'Hard': 'سخت',
    // Ratings
    'NOT GOOD': 'خوب نیست', 'GOOD': 'خوب', 'GREAT!': 'عالی!', 'AWESOME!!!': 'فوق‌العاده!!!',
    'no rating yet': 'هنوز رتبه‌ای نیست', 'Edit routine': 'ویرایش روتین',
    'Name & emoji': 'نام و ایموجی',
    'e.g. Brush teeth': 'مثلاً مسواک زدن',
    '+ Add details': '+ افزودن جزئیات',
    '+ Add time & details': '+ افزودن زمان و جزئیات',
    '- Hide time & details': '- پنهان کردن زمان و جزئیات',
    '- Hide steps': '- پنهان کردن مراحل',
    '+ Add steps': '+ افزودن مراحل',
    '+ Add another step': '+ افزودن یک مرحله دیگر',
    'Steps': 'مراحل',
    'Step name': 'نام مرحله',
    '– Hide time & details': '– پنهان کردن زمان و جزئیات',
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
    "That file doesn't look like a Lifyar backup": 'این فایل شبیه پشتیبان Lifyar نیست',
    'Could not read that file': 'این فایل خوانده نشد',
    'Data restored': 'اطلاعات بازگردانی شد',
    'Logged out': 'از حساب خارج شدید',
    'Account deleted': 'حساب حذف شد',
    'Give it a name': 'یک نام برایش بگذارید',
    'Pick at least one day': 'حداقل یک روز انتخاب کنید',
    'Routine updated': 'روتین به‌روزرسانی شد',
    'Task updated': 'کار به‌روزرسانی شد',
    'Everything reset': 'همه‌چیز بازنشانی شد',
    "Can't change this between midnight and 5am": 'این گزینه را نمی‌توان بین نیمه‌شب و ۵ صبح تغییر داد',
    'Could not save — try again': 'ذخیره نشد — دوباره تلاش کنید',
    'Something went wrong loading your data': 'مشکلی در بارگذاری اطلاعات شما پیش آمد',
    // Confirm dialogs
    'Remove this routine? It will disappear from your active lists, but its past history stays exactly as it was.': 'این روتین حذف شود؟ از فهرست‌های فعال شما حذف می‌شود، اما تاریخچه گذشته آن دقیقاً همان‌طور که بوده باقی می‌ماند.',
    'Remove this task without earning or losing points for it?': 'این کار بدون کسب یا از دست دادن امتیاز حذف شود؟',
    "This task isn't due yet — mark it as done early?": 'موعد این کار هنوز نرسیده — می‌خواهید زودتر آن را انجام‌شده علامت بزنید؟',
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
    // Onboarding
    'Welcome to Lifyar!': 'به Lifyar خوش آمدید!',
    'Lifyar helps you reflect how well you lived today, not just what you completed.': 'Lifyar کمکتان می‌کند ببینید امروز را چقدر خوب زندگی کرده‌اید، نه فقط چه کارهایی را انجام داده‌اید.',
    'Get started': 'شروع کنید',
    'Step 1 of 3': 'مرحله ۱ از ۳',
    'Step 2 of 3': 'مرحله ۲ از ۳',
    'Step 3 of 3': 'مرحله ۳ از ۳',
    'A couple quick preferences': 'چند تنظیم سریع',
    'All of this lives in Settings too — change any of it anytime.': 'همه این‌ها در تنظیمات هم هست — هر زمان می‌توانید تغییرشان دهید.',
    'Log in to restore your data to this device.': 'برای بازگرداندن اطلاعاتتان به این دستگاه وارد شوید.',
    'Skip setup': 'رد شدن از راه‌اندازی',
    'Skip setup?': 'از راه‌اندازی صرف‌نظر شود؟',
    "This clears any routines or tasks you've already picked, and takes you straight to the end.": 'این کار هر روتین یا کاری که تا الان انتخاب کرده‌اید را پاک می‌کند و مستقیم شما را به پایان می‌برد.',
    'Continue': 'ادامه',
    'Choose your routines': 'روتین‌های خود را انتخاب کنید',
    "Pick the activities that are already part of your life, plus anything you'd like to make part of it.": 'فعالیت‌هایی که همین الان بخشی از زندگیتان هستند را انتخاب کنید، به‌علاوه هر چیزی که دوست دارید بخشی از آن شود.',
    '+ Add yours': '+ مورد خودتان را اضافه کنید',
    'Type your own…': 'مورد خودتان را بنویسید…',
    'Routines repeat automatically. Tasks are one-time activities — unlike routines, tasks disappear after completion.': 'روتین‌ها به‌طور خودکار تکرار می‌شوند. کارها فعالیت‌های یک‌بار مصرف هستند — برخلاف روتین‌ها، کارها بعد از انجام شدن ناپدید می‌شوند.',
    '<b>Routines</b> repeat automatically. <b>Tasks</b> are one-time activities — unlike routines, tasks disappear after completion.': '<b>روتین‌ها</b> به‌طور خودکار تکرار می‌شوند. <b>کارها</b> فعالیت‌های یک‌بار مصرف هستند — برخلاف روتین‌ها، کارها بعد از انجام شدن ناپدید می‌شوند.',
    '<b>Try to have at least 4 Routines</b> in each day. For most people, having 4-6 routines is the sweet spot.': 'سعی کنید هر روز حداقل <b>۴ روتین</b> داشته باشید. برای بیشتر افراد، داشتن ۴ تا ۶ روتین نقطه ایده‌آل است.',
    'Pick due days for each weekly routine before continuing': 'قبل از ادامه، برای هر روتین هفتگی روزهای موعد را انتخاب کنید',
    'Due': 'موعد',
    'Confirm': 'تأیید',
    'Select days': 'انتخاب روزها',
    "One task you've been putting off?": 'کاری که مدام به تعویق انداخته‌اید؟',
    'Optional — e.g. Renew car insurance': 'اختیاری — مثلاً تمدید بیمه ماشین',
    'How difficult is each activity for you?': 'هر فعالیت چقدر برایتان سخت است؟',
    "Choose how demanding each activity usually is for you. If you're unsure, leave everything at Normal.": 'انتخاب کنید هر فعالیت معمولاً چقدر برایتان طاقت‌فرساست. اگر مطمئن نیستید، همه را روی «متوسط» بگذارید.',
    'Task': 'کار',
    'Nothing to set up yet': 'هنوز چیزی برای راه‌اندازی نیست',
    'You can add routines and tasks anytime from the Home tab.': 'هر زمان می‌توانید از تب خانه روتین و کار اضافه کنید.',
    'Finish setup': 'پایان راه‌اندازی',
    "You're all set": 'همه‌چیز آماده است',
    'Your Lifyar is ready. Everything here can still be edited, renamed, or removed anytime.': 'Lifyar شما آماده است. همه این‌ها را می‌توانید هر زمان ویرایش، تغییر نام یا حذف کنید.',
    'Your data has been restored to this device.': 'اطلاعات شما به این دستگاه بازگردانده شد.',
    'Starting from a blank slate': 'شروع از صفحه‌ای خالی',
    "One more thing — allow notifications if you'd like daily reminders to check your list.": 'یک نکته دیگر — اگر یادآوری‌های روزانه برای بررسی لیستتان می‌خواهید، اعلان‌ها را فعال کنید.',
    "<b>One more thing</b> — allow notifications if you'd like daily reminders to check your list.": '<b>یک نکته دیگر</b> — اگر یادآوری‌های روزانه برای بررسی لیستتان می‌خواهید، اعلان‌ها را فعال کنید.',
    'Enter Lifyar': 'ورود به Lifyar',
    // Header greeting pool (Today tab, time-of-day based)
    'Morning': 'صبح بخیر',
    'Morning, {name}': 'صبح بخیر، {name}',
    'Good morning': 'صبح بخیر',
    'Good morning, {name}': 'صبح بخیر، {name}',
    'Rise and shine': 'وقت بیدار شدنه',
    'Rise and shine, {name}': 'وقت بیدار شدنه، {name}',
    'Good afternoon': 'عصر بخیر',
    'Good afternoon, {name}': 'عصر بخیر، {name}',
    'Afternoon': 'عصر بخیر',
    'Afternoon, {name}': 'عصر بخیر، {name}',
    'Nice afternoon': 'عصر خوبی باشه',
    'Nice afternoon, {name}': 'عصر خوبی باشه، {name}',
    'Good evening': 'شب بخیر',
    'Good evening, {name}': 'شب بخیر، {name}',
    'Evening': 'عصر بخیر',
    'Evening, {name}': 'عصر بخیر، {name}',
    'Hey there': 'سلام',
    'Hey there, {name}': 'سلام، {name}',
    'Nice night': 'شب خوبی باشه',
    'Nice night, {name}': 'شب خوبی باشه، {name}',
    'Time to relax': 'وقت استراحته',
    'Time to relax, {name}': 'وقت استراحته، {name}',
    'Still up?': 'هنوز بیداری؟',
    'Still up, {name}?': 'هنوز بیداری، {name}؟',
    'Hello, night owl': 'سلام، جغد شب‌زنده‌دار',
    'Up late huh?': 'شب دیر وقته، نه؟',
    // Onboarding: step-1 welcome animation's own decorative labels (independent of the routine/task picker below — do not rename these to match the picker's gerund-form labels)
    'Brush Teeth': 'مسواک زدن',
    'Work': 'کار',
    'Cook': 'آشپزی',
    'Read': 'مطالعه',
    'Exercise': 'ورزش',
    // Onboarding: curated routine/task names (also used as the saved item name when picked)
    'Brushing Teeth': 'مسواک زدن',
    'Working': 'کار کردن',
    'Cooking': 'آشپزی کردن',
    'Showering': 'دوش گرفتن',
    'Tidy Up': 'مرتب کردن خانه',
    'Reading': 'مطالعه کردن',
    'Eating right': 'تغذیه درست',
    'Exercising': 'ورزش کردن',
    'Taking Meds': 'مصرف دارو',
    'Study/Homework': 'مطالعه/تکالیف',
    'Washing Dishes': 'شستن ظرف‌ها',
    'Journaling': 'یادداشت‌نویسی',
    'Gym': 'باشگاه',
    'Laundry': 'لباسشویی',
    'House cleaning': 'نظافت خانه',
    'Grocery Shopping': 'خرید مایحتاج',
    'Meal Prep': 'آماده‌سازی غذا',
    'Calling Family': 'تماس با خانواده',
    // Account & Auth (account card, sign-up/log-in modal, manage account, change password)
    'Sign up or log in': 'ثبت‌نام یا ورود',
    'Sign out': 'خروج از حساب',
    'Signed out': 'از حساب خارج شدید',
    'Sign out? Your data stays saved on this device — you can log back in anytime.':
      'از حساب خارج شوید؟ اطلاعات شما روی این دستگاه ذخیره می‌ماند — هر وقت خواستید می‌توانید دوباره وارد شوید.',
    'Create an account to back up your data and pick up right where you left off on any device.':
      'یک حساب بسازید تا اطلاعاتتان پشتیبان‌گیری شود و بتوانید از هر دستگاهی از همان‌جا ادامه دهید.',
    'Sign in to back up your data to the cloud, or restore it on another device.':
      'وارد شوید تا اطلاعاتتان در فضای ابری پشتیبان‌گیری شود، یا آن را روی دستگاه دیگری بازگردانید.',
    'Back up now': 'همین حالا پشتیبان‌گیری کن',
    'Restore from cloud': 'بازگردانی از فضای ابری',
    'Manage account': 'مدیریت حساب',
    'Verified': 'تأییدشده',
    'Unverified': 'تأییدنشده',
    'Signed in with': 'وارد شده با',
    'Google': 'گوگل',
    'Apple': 'اپل',
    'Verify your email to enable cloud backup.': 'برای فعال‌سازی پشتیبان‌گیری ابری، ایمیلتان را تأیید کنید.',
    'Resend': 'ارسال دوباره',
    'Email verification isn\'t connected yet': 'تأیید ایمیل هنوز فعال نشده',
    'Restored your data from the cloud': 'اطلاعات شما از فضای ابری بازگردانی شد',
    // Auth modal
    'Create an account to keep your data backed up and synced across devices.':
      'یک حساب بسازید تا اطلاعاتتان پشتیبان‌گیری و بین دستگاه‌ها همگام‌سازی شود.',
    'Continue with Google': 'ادامه با گوگل',
    'Continue with Apple — coming soon': 'ادامه با اپل — به‌زودی',
    'Apple sign-in is coming soon': 'ورود با اپل به‌زودی فعال می‌شود',
    'or continue with email': 'یا با ایمیل ادامه دهید',
    'Continue with email': 'ادامه با ایمیل',
    'Enter your email to sign up or log in.': 'برای ثبت‌نام یا ورود، ایمیل خود را وارد کنید.',
    'Enter a valid email address': 'یک ایمیل معتبر وارد کنید',
    'Next': 'بعدی',
    'Back to log in': 'بازگشت به ورود',
    'Create your account': 'ساخت حساب شما',
    'This account backs up your routines, tasks, and score — nothing is shared publicly.':
      'این حساب روتین‌ها، کارها و امتیاز شما را پشتیبان‌گیری می‌کند — چیزی به‌صورت عمومی به اشتراک گذاشته نمی‌شود.',
    'At least 6 characters': 'حداقل ۶ نویسه',
    'Use 6+ characters with a mix of letters and numbers.': 'حداقل ۶ نویسه شامل ترکیبی از حروف و اعداد استفاده کنید.',
    'I agree to the Terms and Privacy Policy.': 'با شرایط استفاده و حریم خصوصی موافقم.',
    'Create account': 'ساخت حساب',
    'Already have an account?': 'قبلاً حساب دارید؟',
    'Welcome back.': 'خوش برگشتید.',
    'Your password': 'رمز عبور شما',
    'That email and password don\'t match.': 'این ایمیل و رمز عبور با هم مطابقت ندارند.',
    'Forgot password?': 'رمز عبور را فراموش کرده‌اید؟',
    'New here?': 'تازه‌واردید؟',
    'Create an account': 'ساخت حساب',
    'Reset your password': 'بازنشانی رمز عبور',
    'Enter your email and we\'ll send a link to reset your password.': 'ایمیل خود را وارد کنید تا لینک بازنشانی رمز عبور برایتان ارسال شود.',
    'Send reset link': 'ارسال لینک بازنشانی',
    'Password reset isn\'t connected yet': 'بازنشانی رمز عبور هنوز فعال نشده',
    'Check your email': 'ایمیل خود را بررسی کنید',
    'We sent a password reset link to your inbox. Follow the link to choose a new password.':
      'لینک بازنشانی رمز عبور به ایمیل شما ارسال شد. با دنبال‌کردن آن لینک، رمز عبور جدیدی انتخاب کنید.',
    'Done': 'انجام شد',
    'Cloud backup is unavailable right now': 'پشتیبان‌گیری ابری در حال حاضر در دسترس نیست',
    'Connecting to Google…': 'در حال اتصال به گوگل…',
    'Creating account…': 'در حال ساخت حساب…',
    'Logging in…': 'در حال ورود…',
    'Password': 'رمز عبور',
    'Please agree to the Terms to continue': 'برای ادامه باید با شرایط استفاده موافقت کنید',
    'An account with that email already exists': 'حسابی با این ایمیل از قبل وجود دارد',
    // Manage account / change password modals
    'Sign-in method': 'روش ورود',
    'Email & password': 'ایمیل و رمز عبور',
    'Password sign-in is not set up for this account. Add a password so you can also sign in without':
      'ورود با رمز عبور برای این حساب تنظیم نشده. یک رمز عبور اضافه کنید تا بدون',
    'Add a password': 'افزودن رمز عبور',
    'Change password': 'تغییر رمز عبور',
    'Permanently delete this account? This removes your cloud backup — routines, tasks, and scores stored on this device are not affected.':
      'این حساب برای همیشه حذف شود؟ پشتیبان ابری شما حذف می‌شود — روتین‌ها، کارها و امتیازهای ذخیره‌شده روی این دستگاه تغییری نمی‌کنند.',
    'Account deletion isn\'t connected yet': 'حذف حساب هنوز فعال نشده',
    'Your routines, tasks, and score stay on this device — only the account and cloud backup are removed.':
      'روتین‌ها، کارها و امتیاز شما روی این دستگاه می‌مانند — فقط حساب و پشتیبان ابری حذف می‌شوند.',
    'Set a password so you can sign in without Google or Apple.': 'یک رمز عبور تنظیم کنید تا بتوانید بدون گوگل یا اپل وارد شوید.',
    'Enter your current password, then choose a new one.': 'رمز عبور فعلی خود را وارد کنید، سپس رمز جدیدی انتخاب کنید.',
    'Current password': 'رمز عبور فعلی',
    'New password': 'رمز عبور جدید',
    'Add password': 'افزودن رمز عبور',
    'Update password': 'به‌روزرسانی رمز عبور',
    'Adding a password isn\'t connected yet': 'افزودن رمز عبور هنوز فعال نشده',
    'Changing your password isn\'t connected yet': 'تغییر رمز عبور هنوز فعال نشده',
    // Auth error messages
    'Incorrect password': 'رمز عبور اشتباه است',
    'Incorrect email or password': 'ایمیل یا رمز عبور اشتباه است',
    'No account found with that email': 'حسابی با این ایمیل پیدا نشد',
    'Password should be at least 6 characters': 'رمز عبور باید حداقل ۶ نویسه باشد',
    'No internet connection — try again': 'اتصال اینترنت برقرار نیست — دوباره تلاش کنید',
    'Something went wrong — try again': 'مشکلی پیش آمد — دوباره تلاش کنید',
    'Enter your name': 'نام خود را وارد کنید',
    'Connect your Google account': 'اتصال حساب گوگل شما',
    'An account with this email already exists. Enter its password to connect your Google account to it — after that, either one signs you in.':
      'حسابی با این ایمیل از قبل وجود دارد. رمز عبور آن را وارد کنید تا حساب گوگل شما به آن متصل شود — پس از آن، هر کدام برای ورود کافی است.',
    'Connect account': 'اتصال حساب',
    'Connecting…': 'در حال اتصال…',
    'Verify your email': 'ایمیل خود را تأیید کنید',
    'Check your inbox to finish signing up.': 'برای تکمیل ثبت‌نام، صندوق ورودی خود را بررسی کنید.',
    "We sent a link to": 'لینکی برای شما ارسال شد به',
    'Click it, then come back here to finish signing up.': 'روی آن کلیک کنید، سپس برای تکمیل ثبت‌نام به اینجا برگردید.',
    "I've verified — continue": 'تأیید کردم — ادامه',
    'Resend email': 'ارسال دوباره ایمیل',
    'Use a different email': 'استفاده از ایمیل دیگر',
    'Checking…': 'در حال بررسی…',
    'Verification email sent': 'ایمیل تأیید ارسال شد',
    "Not verified yet — check your inbox and tap the link.": 'هنوز تأیید نشده — صندوق ورودی خود را بررسی کرده و روی لینک ضربه بزنید.',
    'Try Google': 'امتحان با گوگل',
    'Something went wrong. Try Google.': 'مشکلی پیش آمد. گوگل را امتحان کنید.',
    'Something went wrong.': 'مشکلی پیش آمد.',
    'Profile': 'پروفایل',
    'Change name': 'تغییر نام',
    'Name updated': 'نام به‌روزرسانی شد',
    'Password updated': 'رمز عبور به‌روزرسانی شد',
    'Permanently delete account': 'حذف دائمی حساب',
    'Deleting…': 'در حال حذف…',
    'Saving…': 'در حال ذخیره…',
    'Sending…': 'در حال ارسال…',
    'Enter your current password': 'رمز عبور فعلی خود را وارد کنید',
    "Re-authenticate with Google to confirm.": 'برای تأیید، دوباره با گوگل وارد شوید.',
    'Please re-enter your password to confirm — this needs a fresh sign-in':
      'برای تأیید، دوباره رمز عبور خود را وارد کنید — این کار به یک ورود تازه نیاز دارد',
    'Too many attempts — try again in a bit': 'تلاش‌های زیاد — کمی بعد دوباره امتحان کنید',
    'One more thing': 'یک نکته دیگر',
    "What's your name?": 'نام شما چیست؟',
    "That didn't match. If you originally signed up with Google, try Continue with Google instead.":
      'مطابقت نداشت. اگر ابتدا با گوگل ثبت‌نام کرده‌اید، به‌جای آن «ادامه با گوگل» را امتحان کنید.',
    'Password added — you can now log in with email too': 'رمز عبور اضافه شد — اکنون می‌توانید با ایمیل هم وارد شوید',
    'Enter your password': 'رمز عبور خود را وارد کنید',
  }
};
function tr(key){
  const lang = (state.settings && state.settings.language) || 'en';
  if(lang!=='en' && LANG_DICT[lang] && LANG_DICT[lang][key]) return LANG_DICT[lang][key];
  return key;
}
function trSelectedCount(n){
  return curLang()==='fa' ? `${n} مورد انتخاب شده` : `${n} selected`;
}
function trAllSetWithName(name){
  return curLang()==='fa' ? `همه‌چیز آماده است، ${name}` : `You're all set, ${name}`;
}
function trPickPart(n, kind){
  const words = {
    daily:  curLang()==='fa' ? 'روزانه' : 'daily',
    weekly: curLang()==='fa' ? 'هفتگی' : 'weekly',
    task:   curLang()==='fa' ? 'کار'   : 'task'
  };
  return `${n} ${words[kind]}`;
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
// ---- Task due-date states (Not due yet / Due / Overdue) ----
function trTaskDueDateLine(dateStr){
  const label = formatDueLabel(dateStr, 'monthly'); // month/day format, locale-aware
  return curLang()==='fa' ? `موعد: ${label}` : `Due ${label}`;
}
function trTaskCurrentDecayLine(amount){
  return curLang()==='fa' ? `کاهش فعلی: -${numFa(Math.abs(amount))}` : `Current decay: -${Math.abs(amount)}`;
}
function trTaskDueTodayShort(){
  return curLang()==='fa' ? 'امروز موعد است' : 'Due Today';
}
function trTaskOverdueShort(){
  return curLang()==='fa' ? '⚠️ ازدست‌رفته' : '⚠️ Overdue';
}
function trUpcomingSectionLabel(){
  return curLang()==='fa' ? 'پیش‌رو' : 'Upcoming';
}
function trTaskDueDateFieldLabel(){
  return curLang()==='fa' ? 'موعد انجام' : 'Due date';
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
  if(curLang()==='fa') return `رتبه فعلی شما به «خوب» و «خوب نیست» محدود شده. برای باز شدن «عالی!» و «فوق‌العاده!!!» حداقل ۴ روتین در لیست روزانه‌تان داشته باشید.`;
  return `Your current rating is limited to "GOOD" and "NOT GOOD". Have at least 4 routines in your daily list to unlock "GREAT!" and "AWESOME!!!".`;
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
function trWelcomeNotifBody(graceApplied){
  if(curLang()==='fa'){
    return graceApplied
      ? `چون کمی دیر شروع کردی، امروز حساب نمی‌شه — از فردا امتیازگیری واقعی آغاز می‌شه.`
      : `از همین امروز امتیازگیری شروع می‌شه. بریم که شروع کنیم!`;
  }
  return graceApplied
    ? "You got started a bit late today, so it won't count — scoring starts fresh tomorrow."
    : "Your Lifyar starts counting today. Let's get going!";
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
