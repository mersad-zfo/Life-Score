// ---------- Auto emoji picker ----------
// Keyword pools, the EMOJI_VARIETY/EMOJI_SINGLE dictionaries, and whole-word matching used to
// auto-suggest an emoji from a routine's name. Currently Routines-only (see BACKLOG.md #2/#3
// for extending this to Tasks and adding a Farsi dictionary).
// (Split out of the former monolithic app-state.js — see ARCHITECTURE.md.)
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
