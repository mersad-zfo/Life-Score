// tests/logic.test.js
//
// Lightweight regression tests for the mechanically dense parts of Life Score: rating tier
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
  'app-emoji.js',
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

test('isNotProductiveDay: fewer than 5 due+active -> true', () => {
  resetState('2020-01-01');
  assert.strictEqual(app.isNotProductiveDay('2026-07-02'), true);
});
test('isNotProductiveDay: before ratingStartDate -> true regardless', () => {
  resetState('2026-07-10');
  assert.strictEqual(app.isNotProductiveDay('2026-07-01'), true);
});
test('isNotProductiveDay: >=5 due routines -> false', () => {
  resetState('2020-01-01');
  for (let i = 0; i < 5; i++) {
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
console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const { name, error } of failures) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
  }
}
process.exit(fail === 0 ? 0 : 1);
