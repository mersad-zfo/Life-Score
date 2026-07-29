// tests/logic.test.js
//
// Lightweight regression tests for the mechanically dense parts of Lifyar: rating tier
// boundaries, streak/neglect halving+floor math, milestone-passed increments, week/month date
// helpers, and NP-day cap thresholds at every level (day/week/month/all-time).
//
// Zero-dependency by design (matches the app itself) — plain Node, no test framework. Loads the
// real app-*.js files into a sandboxed context with minimal browser stubs, so these tests always
// run against the actual shipped logic, not a reimplementation of it.
//
// Run with:  node tests/logic.test.js
// Exits 0 on all-pass, 1 on any failure (CI-friendly).

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const APP_FILES = [
  'app-state-core.js',
  'app-i18n.js',
  'app-rating.js',
  'app-consistency.js',
  'app-steps.js',
  'app-emoji.js',
  'app-render-progression.js',
];

function loadApp(){
  const store = {};
  const sandbox = {
    console,
    window: { matchMedia: () => ({ matches: false, addEventListener: () => {} }) },
    document: {
      body: { classList: { toggle(){}, add(){}, remove(){} } },
      getElementById: () => ({ textContent: '', classList: { add(){}, remove(){} } }),
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => ({ style: { setProperty(){} }, classList: { add(){}, remove(){} } }),
      addEventListener(){},
    },
    navigator: { vibrate(){} },
    localStorage: {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = v; },
    },
    requestAnimationFrame: (fn) => fn(),
    setTimeout, clearTimeout,
    renderMain(){}, updateHeader(){},
    // applyRoutineMiss() calls this Category-2 notification hook (app-notif-triggers.js, not
    // loaded here — it needs IndexedDB) whenever a miss crosses a neglect milestone. Stubbed so
    // the pure rating/consistency/steps math under test can run standalone.
    notifyNeglectMilestoneIfCrossed(){},
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  for (const file of APP_FILES) {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }
  // `state` is declared with `let` at the top level, so it's not a property of the sandbox
  // object the way function declarations are — fetch a live reference to it explicitly.
  sandbox.state = vm.runInContext('state', sandbox);
  return sandbox;
}

// ---------- tiny test runner ----------
let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    failures.push({ name, error: e });
  }
}
function section(title) {
  console.log(`\n${title}`);
}

const app = loadApp();

// Objects returned from inside the vm sandbox belong to a different realm than this file's, so
// their prototypes differ from Node's native Object.prototype even when the shape is identical.
// assert.deepStrictEqual checks prototype identity and would false-positive-fail on that alone,
// so plain-object return values get compared structurally via JSON instead.
function assertShapeEqual(actual, expected, message) {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), message);
}

// getWeekRating()/getTodayRating()/getCurrentMonthRating()/getAllTimeRating() take no arguments
// and internally call todayStr() (which defaults to the real system clock) to know "now". Any
// test asserting on one of these needs "today" pinned to the date its fixture data was built
// around, or the assertion silently depends on what day the suite happens to run on. `todayStr`
// is a plain global function in the sandbox (the vm context's global object), so reassigning it
// here really does redirect every internal no-arg call to it for the duration of `fn`.
function withFixedToday(dateStr, fn) {
  const real = app.todayStr;
  app.todayStr = (d) => (d === undefined ? dateStr : real(d));
  try { return fn(); } finally { app.todayStr = real; }
}

// =====================================================================================
section('calcRating — tier boundaries');
// =====================================================================================
test('base=0 -> null (no data)', () => assert.strictEqual(app.calcRating(0, 0), null));
test('0% -> NOT GOOD', () => assert.strictEqual(app.calcRating(0, 100), 'NOT GOOD'));
test('49% -> NOT GOOD', () => assert.strictEqual(app.calcRating(49, 100), 'NOT GOOD'));
test('50% -> GOOD (lower bound inclusive)', () => assert.strictEqual(app.calcRating(50, 100), 'GOOD'));
test('79% -> GOOD', () => assert.strictEqual(app.calcRating(79, 100), 'GOOD'));
test('80% -> GREAT! (lower bound inclusive)', () => assert.strictEqual(app.calcRating(80, 100), 'GREAT!'));
test('100% -> GREAT! (upper bound inclusive)', () => assert.strictEqual(app.calcRating(100, 100), 'GREAT!'));
test('101% -> AWESOME!!! (strictly over 100%)', () => assert.strictEqual(app.calcRating(101, 100), 'AWESOME!!!'));

test('applyRatingCap: GREAT! capped to GOOD when limited', () =>
  assert.strictEqual(app.applyRatingCap('GREAT!', true), 'GOOD'));
test('applyRatingCap: AWESOME!!! capped to GOOD when limited', () =>
  assert.strictEqual(app.applyRatingCap('AWESOME!!!', true), 'GOOD'));
test('applyRatingCap: GOOD stays GOOD when limited (no double-penalty)', () =>
  assert.strictEqual(app.applyRatingCap('GOOD', true), 'GOOD'));
test('applyRatingCap: NOT GOOD stays NOT GOOD when limited', () =>
  assert.strictEqual(app.applyRatingCap('NOT GOOD', true), 'NOT GOOD'));
test('applyRatingCap: rating unchanged when not limited', () =>
  assert.strictEqual(app.applyRatingCap('AWESOME!!!', false), 'AWESOME!!!'));
test('applyRatingCap: null rating passes through', () =>
  assert.strictEqual(app.applyRatingCap(null, true), null));

// =====================================================================================
section('Streak/neglect transitions — halving and floor behavior');
// =====================================================================================
test('complete from neutral -> streak 1', () => {
  const r = app.routineNextStateOnComplete({ streak: 0, neglect: 0, recoveryChain: false });
  assertShapeEqual(r, { streak: 1, neglect: 0, recoveryChain: false });
});
test('complete while in streak -> streak+1, neglect reset', () => {
  const r = app.routineNextStateOnComplete({ streak: 9, neglect: 0, recoveryChain: false });
  assertShapeEqual(r, { streak: 10, neglect: 0, recoveryChain: false });
});
test('complete while in neglect -> floors neglect/2, sets recoveryChain if >0', () => {
  const r = app.routineNextStateOnComplete({ streak: 0, neglect: 7, recoveryChain: false });
  assertShapeEqual(r, { streak: 0, neglect: 3, recoveryChain: true }); // floor(7/2)=3
});
test('complete while in neglect: floor(1/2)=0 clears recoveryChain', () => {
  const r = app.routineNextStateOnComplete({ streak: 0, neglect: 1, recoveryChain: false });
  assertShapeEqual(r, { streak: 0, neglect: 0, recoveryChain: false });
});
test('complete while in neglect: even halving, e.g. floor(10/2)=5', () => {
  const r = app.routineNextStateOnComplete({ streak: 0, neglect: 10, recoveryChain: false });
  assertShapeEqual(r, { streak: 0, neglect: 5, recoveryChain: true });
});
test('miss while in streak -> drops to nearest lower milestone', () => {
  const def = { type: 'array', values: [7, 14, 30, 60, 90, 180, 270, 365] };
  const r = app.routineNextStateOnMiss({ recurrence: 'daily', streak: 20, neglect: 0, recoveryChain: false });
  assert.strictEqual(r.streak, app.nearestLowerMilestone(20, def));
  assert.strictEqual(r.neglect, 0);
});
test('miss while in neglect, no recoveryChain -> neglect+1', () => {
  const r = app.routineNextStateOnMiss({ recurrence: 'daily', streak: 0, neglect: 4, recoveryChain: false });
  assertShapeEqual(r, { streak: 0, neglect: 5, recoveryChain: false });
});
test('miss while in neglect WITH recoveryChain -> relapse: round(neglect*1.5), chain clears', () => {
  const r = app.routineNextStateOnMiss({ recurrence: 'daily', streak: 0, neglect: 7, recoveryChain: true });
  assertShapeEqual(r, { streak: 0, neglect: 11, recoveryChain: false }); // round(7*1.5)=11
});
test('miss from neutral -> neglect 1', () => {
  const r = app.routineNextStateOnMiss({ recurrence: 'daily', streak: 0, neglect: 0, recoveryChain: false });
  assertShapeEqual(r, { streak: 0, neglect: 1, recoveryChain: false });
});

// =====================================================================================
section('milestonesPassed — array / step / step1 definitions');
// =====================================================================================
const arrayDef = { type: 'array', values: [7, 14, 30, 60, 90, 180, 270, 365] };
test('array: below first milestone -> 0', () => assert.strictEqual(app.milestonesPassed(6, arrayDef), 0));
test('array: exactly at first milestone -> 1', () => assert.strictEqual(app.milestonesPassed(7, arrayDef), 1));
test('array: between milestones -> counts passed only', () => assert.strictEqual(app.milestonesPassed(29, arrayDef), 2));
test('array: at final milestone -> full count', () => assert.strictEqual(app.milestonesPassed(365, arrayDef), 8));
test('array: beyond final milestone -> caps at full count', () => assert.strictEqual(app.milestonesPassed(9999, arrayDef), 8));

const stepDef = { type: 'step', step: 10 };
test('step: below step -> 0', () => assert.strictEqual(app.milestonesPassed(9, stepDef), 0));
test('step: at step -> 1', () => assert.strictEqual(app.milestonesPassed(10, stepDef), 1));
test('step: 5.5x step floors down', () => assert.strictEqual(app.milestonesPassed(55, stepDef), 5));

const step1Def = { type: 'step1', step: 10 };
test('step1: 0 -> 0 (no rank yet)', () => assert.strictEqual(app.milestonesPassed(0, step1Def), 0));
test('step1: value=1 -> 1 (feels alive immediately)', () => assert.strictEqual(app.milestonesPassed(1, step1Def), 1));
test('step1: value=9 (still under first real step) -> stays at 1', () => assert.strictEqual(app.milestonesPassed(9, step1Def), 1));
test('step1: value=10 -> 2', () => assert.strictEqual(app.milestonesPassed(10, step1Def), 2));

test('nearestLowerMilestone (array): strictly below value', () => assert.strictEqual(app.nearestLowerMilestone(30, arrayDef), 14));
test('nearestLowerMilestone (array): below smallest -> 0', () => assert.strictEqual(app.nearestLowerMilestone(5, arrayDef), 0));
test('nearestLowerMilestone (step): floors to previous step boundary', () => assert.strictEqual(app.nearestLowerMilestone(25, stepDef), 20));

// =====================================================================================
section('Universal routine penalty system — neglect scale-up / streak-protection scale-down');
// =====================================================================================
test('routineBasePenalty: daily=10, weekly=20, monthly=30', () => {
  assert.strictEqual(app.routineBasePenalty({ recurrence: 'daily' }), 10);
  assert.strictEqual(app.routineBasePenalty({ recurrence: 'weekly' }), 20);
  assert.strictEqual(app.routineBasePenalty({ recurrence: 'monthly' }), 30);
});

test('routinePenalty: neutral/neglect state scales UP with post-miss neglect (daily)', () => {
  // preMissStreak=0 (no streak to protect) -> uses the post-miss neglect value on r.
  assert.strictEqual(app.routinePenalty({ recurrence: 'daily', neglect: 0 }, 0), 10); // no neglect yet -> flat base
  assert.strictEqual(app.routinePenalty({ recurrence: 'daily', neglect: 7 }, 0), 11); // 1 milestone passed (7) * inc(1)
  assert.strictEqual(app.routinePenalty({ recurrence: 'daily', neglect: 30 }, 0), 13); // 3 milestones (7,14,30) * inc(1)
});

test('routinePenalty: neutral/neglect state scales UP with post-miss neglect (weekly/monthly)', () => {
  assert.strictEqual(app.routinePenalty({ recurrence: 'weekly', neglect: 20 }, 0), 24); // floor(20/10)=2 * inc(2)
  assert.strictEqual(app.routinePenalty({ recurrence: 'monthly', neglect: 15 }, 0), 39); // floor(15/5)=3 * inc(3)
});

test('routinePenalty: breaking an active streak DISCOUNTS the penalty instead (daily)', () => {
  // preMissStreak>0 -> uses the streak-count-based discount, ignoring r.neglect entirely.
  assert.strictEqual(app.routinePenalty({ recurrence: 'daily', neglect: 0 }, 7), 8);   // 1 milestone * discountInc(2) = 10-2
  assert.strictEqual(app.routinePenalty({ recurrence: 'daily', neglect: 0 }, 60), 2);  // 4 milestones * 2 = 8 -> 10-8=2
});

test('routinePenalty: a long enough daily streak fully cancels the penalty (floor 0, never negative)', () => {
  assert.strictEqual(app.routinePenalty({ recurrence: 'daily', neglect: 0 }, 90), 0);   // 5 milestones * discountInc(2) = 10 -> exactly 0
  assert.strictEqual(app.routinePenalty({ recurrence: 'daily', neglect: 0 }, 365), 0);  // maxed out -> still 0, never negative
});

test('routinePenalty: weekly/monthly streak-protection also reaches a true floor of 0 eventually', () => {
  assert.strictEqual(app.routinePenalty({ recurrence: 'weekly', neglect: 0 }, 100), 0);   // floor(100/10)=10 * inc(2) = 20 = base
  assert.strictEqual(app.routinePenalty({ recurrence: 'monthly', neglect: 0 }, 50), 0);   // floor(50/5)=10 * inc(3) = 30 = base
});

test('routineReward: unified across all types — streak scales up, neglect no longer reduces it', () => {
  // Old system reduced daily reward by neglect; new system never does, for any recurrence.
  assert.strictEqual(app.routineReward({ recurrence: 'daily', basePoints: 40, streak: 0, neglect: 30 }), 40);
  assert.strictEqual(app.routineReward({ recurrence: 'daily', basePoints: 40, streak: 30, neglect: 0 }), 52); // +3 milestones (7,14,30) * inc(4)
  assert.strictEqual(app.routineReward({ recurrence: 'weekly', rewardValue: 60, streak: 20, neglect: 999 }), 72); // neglect ignored; +2 milestones * inc(6)
});

// =====================================================================================
section('Date helpers — getWeekStart (Saturday-first) / monthEndStr');
// =====================================================================================
test('getWeekStart: a Saturday returns itself', () => assert.strictEqual(app.getWeekStart('2026-07-04'), '2026-07-04'));
test('getWeekStart: a Friday returns the preceding Saturday', () => assert.strictEqual(app.getWeekStart('2026-07-03'), '2026-06-27'));
test('getWeekStart: a Sunday returns the preceding Saturday', () => assert.strictEqual(app.getWeekStart('2026-07-05'), '2026-07-04'));
test('getWeekStart: across a year boundary', () => assert.strictEqual(app.getWeekStart('2026-01-01'), '2025-12-27'));

test('monthEndStr: 31-day month', () => assert.strictEqual(app.monthEndStr('2026-07'), '2026-07-31'));
test('monthEndStr: 30-day month', () => assert.strictEqual(app.monthEndStr('2026-04'), '2026-04-30'));
test('monthEndStr: February, non-leap year', () => assert.strictEqual(app.monthEndStr('2026-02'), '2026-02-28'));
test('monthEndStr: February, leap year', () => assert.strictEqual(app.monthEndStr('2024-02'), '2024-02-29'));

// =====================================================================================
section('NP-day cap thresholds — day / week / month / all-time');
// =====================================================================================
// Build a controlled state: ratingStartDate far in the past, no routines/tasks at all, so every
// day is NP by definition (0 due + 0 active < 5). This isolates cap-threshold behavior from the
// rating-percentage math already covered above.
function resetState(ratingStartDate) {
  app.state.routines = [];
  app.state.tasks = [];
  app.state.log = [];
  app.state.settings.ratingStartDate = ratingStartDate;
}

test('isNotProductiveDay: fewer than 4 due+active -> true', () => {
  resetState('2020-01-01');
  assert.strictEqual(app.isNotProductiveDay('2026-07-02'), true);
});
test('isNotProductiveDay: before ratingStartDate -> true regardless', () => {
  resetState('2026-07-10');
  assert.strictEqual(app.isNotProductiveDay('2026-07-01'), true);
});
test('isNotProductiveDay: >=4 due routines -> false', () => {
  resetState('2020-01-01');
  for (let i = 0; i < 4; i++) {
    app.state.routines.push({ id: 'r' + i, recurrence: 'daily', createdDate: '2020-01-01', basePoints: 40 });
  }
  assert.strictEqual(app.isNotProductiveDay('2026-07-02'), false);
});

test('getWeekRating: caps at GOOD when >=4 NP days in the week (all-NP state)', () => {
  // No routines/tasks at all -> every day is NP -> week has 7 NP days (>=4 threshold).
  // With base=0 for every day, calcRating returns null before the cap is even relevant, so add
  // one small routine to produce a nonzero base while still keeping every day NP (needs 5+ to
  // avoid NP, so a single routine keeps days NP while giving base>0 to reach the cap check).
  resetState('2026-06-01');
  app.state.routines.push({ id: 'r1', recurrence: 'daily', createdDate: '2026-06-01', basePoints: 40, streak: 0, neglect: 0 });
  // Simulate every day fully completed at full reward by pushing matching log entries.
  const today = '2026-07-02';
  const weekStart = app.getWeekStart(today);
  let d = weekStart;
  while (d <= today) {
    app.state.log.push({ id: 'l' + d, kind: 'routine', refId: 'r1', name: 'r1', points: 40, date: d });
    d = app.addDays(d, 1);
  }
  const rating = withFixedToday(today, () => app.getWeekRating());
  // received==base (100%) would normally be GREAT!, but every day is NP (only 1 routine due,
  // <5 threshold) so the week-level NP cap (>=4 NP days) must clamp it to GOOD.
  assert.strictEqual(rating, 'GOOD');
});

test('getMonthRatingFor: caps at GOOD when >=18 NP days in the month', () => {
  resetState('2026-06-01');
  app.state.routines.push({ id: 'r1', recurrence: 'daily', createdDate: '2026-06-01', basePoints: 40, streak: 0, neglect: 0 });
  const monthStr = '2026-06';
  const end = app.monthEndStr(monthStr);
  let d = monthStr + '-01';
  while (d <= end) {
    app.state.log.push({ id: 'l' + d, kind: 'routine', refId: 'r1', name: 'r1', points: 40, date: d });
    d = app.addDays(d, 1);
  }
  const rating = app.getMonthRatingFor(monthStr);
  assert.strictEqual(rating, 'GOOD'); // 30 NP days in June, well over the 18-day threshold
});

test('getAllTimeRating: caps at GOOD when >60% of all-time days are NP (no overlook)', () => {
  resetState('2026-05-01');
  app.state.routines.push({ id: 'r1', recurrence: 'daily', createdDate: '2026-05-01', basePoints: 40, streak: 0, neglect: 0 });
  let d = '2026-05-01';
  const today = '2026-07-02';
  while (d <= today) {
    app.state.log.push({ id: 'l' + d, kind: 'routine', refId: 'r1', name: 'r1', points: 40, date: d });
    d = app.addDays(d, 1);
  }
  const rating = withFixedToday(today, () => app.getAllTimeRating());
  assert.strictEqual(rating, 'GOOD'); // every day NP (only 1 routine due) -> 100% NP, no overlook earned
});

test('getTodayRating: before-noon rule suppresses NOT GOOD (returns null)', () => {
  resetState('2020-01-01');
  app.state.routines.push({ id: 'r1', recurrence: 'daily', createdDate: '2020-01-01', basePoints: 40, streak: 0, neglect: 0 });
  for (let i = 0; i < 4; i++) {
    app.state.tasks.push({ id: 't' + i, createdDate: '2026-07-01', startValue: 20, decayRate: 10, completedDate: null });
  }
  // No log entries today -> received=0, base=40 -> 0% -> NOT GOOD -> before-noon rule should
  // suppress it to null. This only matters if it's actually before noon in the test environment,
  // so we assert the *logic branch* directly rather than depending on wall-clock time.
  const base = app.getDailyBasePoints('2026-07-02');
  const received = Math.max(0, app.getDailyLogPoints('2026-07-02'));
  const notProd = app.isNotProductiveDay('2026-07-02');
  const rating = app.applyRatingCap(app.calcRating(received, base), notProd);
  assert.strictEqual(rating, 'NOT GOOD'); // confirms the underlying calculation the before-noon rule gates
});

// =====================================================================================
section('getRatingForRange — proportional NP threshold uses nominal range length');
// =====================================================================================
// Regression for a real reported bug: a user who first opens the app late in a month (e.g. the
// 4th week) had that month's Progression tile permanently NP-capped at GOOD for the rest of the
// month. Root cause: the proportional threshold was bucketed by aggregatePeriod's elapsed-days
// count (which shrinks to almost nothing right after ratingStartDate), not by the nominal length
// of the (from, to) range being asked about — so a whole-month query 1-2 days into using the app
// got judged as if it were a 1-2 day mini-range (round(2*4/7)=1, tripped by a single NP day).
test('getRatingForRange: whole-month query on day 1 of use is NOT capped by a single NP day', () => {
  resetState('2026-07-22'); // started on day 22 of a 31-day month
  app.state.routines.push({ id: 'r1', recurrence: 'daily', createdDate: '2026-07-22', basePoints: 20 });
  app.state.routines.push({ id: 'r2', recurrence: 'daily', createdDate: '2026-07-22', basePoints: 20 });
  // Fully complete both routines on the one elapsed day -> 100% received/base, but still NP
  // (only 2 routines due, <5 threshold) -> old bucketing capped the whole month at GOOD.
  app.state.log.push({ id: 'l1', kind: 'routine', refId: 'r1', name: 'r1', points: 20, date: '2026-07-22' });
  app.state.log.push({ id: 'l2', kind: 'routine', refId: 'r2', name: 'r2', points: 20, date: '2026-07-22' });
  const { rating } = withFixedToday('2026-07-22', () => app.getRatingForRange('2026-07-01', '2026-07-31'));
  assert.strictEqual(rating, 'GREAT!'); // 100% and NOT capped -- only 1 of 31 nominal days is NP
});
test('getRatingForRange: still stays uncapped through the rest of the partial first month', () => {
  resetState('2026-07-22');
  app.state.routines.push({ id: 'r1', recurrence: 'daily', createdDate: '2026-07-22', basePoints: 20 });
  app.state.routines.push({ id: 'r2', recurrence: 'daily', createdDate: '2026-07-22', basePoints: 20 });
  let d = '2026-07-22';
  while (d <= '2026-07-31') {
    app.state.log.push({ id: 'l' + d, kind: 'routine', refId: 'r1', name: 'r1', points: 20, date: d });
    app.state.log.push({ id: 'l2' + d, kind: 'routine', refId: 'r2', name: 'r2', points: 20, date: d });
    d = app.addDays(d, 1);
  }
  // 10 elapsed days, all NP (only 2 routines due) -- old code: round(10*18/31)=6, 10>=6 -> capped.
  // Fixed code: nominal month length is 31 -> threshold is 18, 10 NP days < 18 -> not capped.
  const { rating } = withFixedToday('2026-07-31', () => app.getRatingForRange('2026-07-01', '2026-07-31'));
  assert.strictEqual(rating, 'GREAT!');
});
test('getRatingForRange: a genuinely bad full month still caps correctly (>=18 real NP days)', () => {
  resetState('2026-06-01');
  // Only 1 routine due (<5) -> every day is NP, but base>0 so the cap actually matters.
  app.state.routines.push({ id: 'r1', recurrence: 'daily', createdDate: '2026-06-01', basePoints: 40 });
  let d = '2026-06-01';
  while (d <= '2026-06-30') {
    app.state.log.push({ id: 'l' + d, kind: 'routine', refId: 'r1', name: 'r1', points: 40, date: d });
    d = app.addDays(d, 1);
  }
  const { rating } = withFixedToday('2026-06-30', () => app.getRatingForRange('2026-06-01', '2026-06-30'));
  assert.strictEqual(rating, 'GOOD'); // 30 NP days out of a 30-day month, well over the 18-day bar
});
test('getRatingForRange: a genuine short custom range still uses a week-scale threshold', () => {
  resetState('2020-01-01');
  app.state.routines.push({ id: 'r1', recurrence: 'daily', createdDate: '2020-01-01', basePoints: 40 });
  let d = '2026-07-01';
  while (d <= '2026-07-07') {
    app.state.log.push({ id: 'l' + d, kind: 'routine', refId: 'r1', name: 'r1', points: 40, date: d });
    d = app.addDays(d, 1);
  }
  // 7-day range, every day NP (only 1 routine due, <5) -> nominal length 7 -> threshold
  // round(7*4/7)=4 -> 7>=4 -> capped, same as the Score tab's week-level behavior.
  const { rating } = withFixedToday('2026-07-07', () => app.getRatingForRange('2026-07-01', '2026-07-07'));
  assert.strictEqual(rating, 'GOOD');
});

// =====================================================================================
section('Steps — point splitting');
// =====================================================================================
test('splitPointsEvenly: remainder folds into the LAST step, sum always exact', () => {
  assertShapeEqual(app.splitPointsEvenly(20, 3), [7, 7, 6]); // not [7,7,7]=21
  assertShapeEqual(app.splitPointsEvenly(20, 4), [5, 5, 5, 5]);
  assertShapeEqual(app.splitPointsEvenly(10, 1), [10]);
});
test('splitPointsEvenly: n<=0 -> empty list', () => {
  assertShapeEqual(app.splitPointsEvenly(20, 0), []);
});

// =====================================================================================
section('Steps — miss-day rule (proportional penalty, frozen streak/neglect on a partial day)');
// =====================================================================================
// v1 rule (owner-flagged for further refinement — see DECISIONS.md): a day with SOME but not all
// steps checked logs a penalty proportional to what's left undone, and leaves streak/neglect
// exactly where they were — only a 0% day (nothing checked at all) behaves like a normal miss.
function stepRoutineFixture(id, streak, steps) {
  return {
    id, recurrence: 'daily', createdDate: '2026-01-01', basePoints: 40, difficulty: 'normal',
    streak, neglect: 0, recoveryChain: false, neglectMilestoneHit: false,
    lastCompletedDate: '2026-01-03', lastEvaluatedDate: '2026-01-03',
    graceAppliedDate: null, awardedPoints: null,
    steps,
    configHistory: [{ from: '2026-01-01', basePoints: 40, steps }],
  };
}
test('2/4 steps done -> penalty is exactly half the base (10 -> 5), streak/neglect frozen (not reset)', () => {
  resetState('2026-01-01');
  const steps = [{ id: 's1', name: 'a' }, { id: 's2', name: 'b' }, { id: 's3', name: 'c' }, { id: 's4', name: 'd' }];
  app.state.routines.push(stepRoutineFixture('r1', 3, steps)); // pre-existing 3-day streak
  app.state.log.push({ id: 'l1', kind: 'routine_step', refId: 'r1', stepId: 's1', name: 'a', points: 10, date: '2026-01-04' });
  app.state.log.push({ id: 'l2', kind: 'routine_step', refId: 'r1', stepId: 's2', name: 'b', points: 10, date: '2026-01-04' });
  withFixedToday('2026-01-05', () => app.applyRoutineCatchUp());
  const r = app.state.routines.find(x => x.id === 'r1');
  assert.strictEqual(r.streak, 3, 'streak stays frozen on a partial day, never resets');
  assert.strictEqual(r.neglect, 0, 'neglect stays frozen on a partial day');
  const penalty = app.state.log.find(l => l.kind === 'routine_penalty' && l.refId === 'r1' && l.date === '2026-01-04');
  assert.ok(penalty, 'a partial day still logs a penalty entry');
  assert.strictEqual(penalty.points, -5); // round(10 * (1 - 2/4))
});
test('3/4 steps done -> smaller proportional penalty (10 * 1/4 = 2.5 -> rounds to 3)', () => {
  resetState('2026-01-01');
  const steps = [{ id: 's1', name: 'a' }, { id: 's2', name: 'b' }, { id: 's3', name: 'c' }, { id: 's4', name: 'd' }];
  app.state.routines.push(stepRoutineFixture('r1', 0, steps));
  ['s1', 's2', 's3'].forEach((sid, i) => {
    app.state.log.push({ id: 'l' + i, kind: 'routine_step', refId: 'r1', stepId: sid, name: sid, points: 10, date: '2026-01-04' });
  });
  withFixedToday('2026-01-05', () => app.applyRoutineCatchUp());
  const penalty = app.state.log.find(l => l.kind === 'routine_penalty' && l.refId === 'r1' && l.date === '2026-01-04');
  assert.strictEqual(penalty.points, -3); // round(10 * (1 - 3/4)) = round(2.5) = 3
});
test('0/4 steps done -> falls through to a normal miss (streak actually resets)', () => {
  resetState('2026-01-01');
  const steps = [{ id: 's1', name: 'a' }, { id: 's2', name: 'b' }];
  app.state.routines.push(stepRoutineFixture('r2', 3, steps)); // pre-existing streak, nothing logged this day
  withFixedToday('2026-01-05', () => app.applyRoutineCatchUp());
  const r = app.state.routines.find(x => x.id === 'r2');
  assert.strictEqual(r.streak, 0, 'a genuine 0% day breaks the streak exactly like a non-stepped routine');
  const penalty = app.state.log.find(l => l.kind === 'routine_penalty' && l.refId === 'r2' && l.date === '2026-01-04');
  assert.strictEqual(penalty.points, -10); // full base penalty, same as round(10 * (1-0))
});

// =====================================================================================
console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const { name, error } of failures) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
  }
}
process.exit(fail === 0 ? 0 : 1);
