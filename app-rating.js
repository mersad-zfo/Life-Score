// ---------- Difficulty system, Rating system, Scores ----------
// Difficulty point tables, the entire rating/NP-cap/overlook-advantage engine, and the
// score-aggregation helpers used by the Score tab tiles. Grouped together because scores
// and ratings share getWeekStart()/monthEndStr()/aggregatePeriod().
// (Split out of the former monolithic app-state.js — see ARCHITECTURE.md.)

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
// Is this day "not-productive"? (fewer than 5 routines due — tasks no longer count toward this,
// see DECISIONS.md: tasks-only setups were exploiting the old combined threshold for pure bonus points)
function isNotProductiveDay(dateStr){
  const start = state.settings.ratingStartDate;
  if(start && dateStr < start) return true;
  const dueRoutines = state.routines.filter(r=>wasRoutineDueOn(r, dateStr)).length;
  return dueRoutines < 5;
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
