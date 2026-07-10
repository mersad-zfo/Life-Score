// ---------- Progression view ----------
// Drill-down: Year → Month → Week → Day
// Navigation state is local to this module.

let progYear  = new Date().getFullYear();
let progView  = 'year';   // 'year' | 'month' | 'week' | 'day'
let progMonth = null;     // 1–12
let progWeekRange = null; // { from: dateStr, to: dateStr, label: string }
let progDay   = null;     // dateStr

// ---- Date helpers ----
function progDaysInMonth(year, month){ return new Date(year, month, 0).getDate(); }
function progMonthStart(year, month){ return `${year}-${String(month).padStart(2,'0')}-01`; }
function progMonthEnd(year, month){
  return `${year}-${String(month).padStart(2,'0')}-${String(progDaysInMonth(year, month)).padStart(2,'0')}`;
}
function progDateStr(year, month, day){
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

// Custom month-week splits per spec:
// 31 days → 8,8,8,7 | 30 days → 8,8,7,7 | 29 days → 8,7,7,7 | 28 days → 7,7,7,7
function getMonthWeekRanges(year, month){
  const days = progDaysInMonth(year, month);
  let splits;
  if(days===31)      splits=[8,8,8,7];
  else if(days===30) splits=[8,8,7,7];
  else if(days===29) splits=[8,7,7,7];
  else               splits=[7,7,7,7];
  const ranges=[];
  let d=1;
  const mn = String(month).padStart(2,'0');
  for(const len of splits){
    const from = progDateStr(year, month, d);
    const to   = progDateStr(year, month, d+len-1);
    const fmtD = n => new Date(`${year}-${mn}-${String(n).padStart(2,'0')}T00:00:00`)
      .toLocaleDateString(localeForLang(), {month:'short', day:'numeric'});
    ranges.push({from, to, label:`${fmtD(d)} – ${fmtD(d+len-1)}`});
    d += len;
  }
  return ranges;
}

// ---- Rating helpers ----
function getRatingForRange(from, to){
  const {base, received, npCount, days} = aggregatePeriod(from, to);
  const totalDays = to>=todayStr() ? days : days; // all elapsed days
  const npLimited = npCount >= Math.ceil(days * (days<=7 ? 4/7 : (days<=31 ? 18/31 : 0.6)));
  // For custom ranges use a proportional NP threshold:
  // daily (<2 days): 1 np = limited; weekly-ish (≤8 days): 4/7 proportion; monthly: 18/31; else 60%
  let limited;
  if(days<=1)       limited = npCount>=1;
  else if(days<=8)  limited = npCount >= Math.round(days * (4/7));
  else if(days<=31) limited = npCount >= Math.round(days * (18/31));
  else              limited = npCount/days > 0.6;
  return { rating: applyRatingCap(calcRating(Math.max(0,received), base), limited), base, received };
}

function getDayRating(dateStr){
  const base = getDailyBasePoints(dateStr);
  const received = Math.max(0, getDailyLogPoints(dateStr));
  const notProd = isNotProductiveDay(dateStr);
  return { rating: applyRatingCap(calcRating(received, base), notProd), base, received };
}

// ---- Shared UI pieces ----
const MONTH_NAMES_EN  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES_FA  = ['ژانویه','فوریه','مارس','آوریل','مه','ژوئن','ژوئیه','اوت','سپتامبر','اکتبر','نوامبر','دسامبر'];
function monthShortName(m){ return curLang()==='fa' ? MONTH_NAMES_FA[m-1] : MONTH_NAMES_EN[m-1]; }

function progHeroHtml(label, received, base){
  return `
    <div class="score-hero">
      <div class="label">${label}</div>
      <div class="score-hero-fraction">
        ${scoreFractionHtml(received, base)}
      </div>
    </div>`;
}

function progTileHtml(topLabel, rating, received, base, clickAttr){
  const cls = tileRatingClass(rating);
  const hasData = base > 0 || received !== 0;
  const interactive = hasData && clickAttr ? `style="cursor:pointer;" ${clickAttr}` : '';
  let inner = '';
  if(hasData){
    const rLabel = rating ? tr(rating) : tr('no rating yet');
    inner = `<div class="t-rating-label" style="font-size:16px;">${rLabel}</div>
             <div class="t-fraction" style="font-size:18px;">${scoreFractionHtml(received, base)}</div>`;
  }
  return `
    <div class="score-tile ${hasData ? cls : 'rating-empty'}" ${interactive}>
      <div class="t-label">${topLabel}</div>
      ${inner}
    </div>`;
}

function progBackBtn(label){
  return `<div class="back-row" style="margin-bottom:4px;">
    <button id="progBack">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      ${label}
    </button>
  </div>`;
}

// ---- Year bounds ----
function progMinYear(){
  const s = state.settings.ratingStartDate;
  return s ? parseInt(s.slice(0,4)) : new Date().getFullYear();
}
function progMaxYear(){ return new Date().getFullYear(); }

// ---- Month has any data (between ratingStart and today, inclusive) ----
function monthHasData(year, month){
  const start = state.settings.ratingStartDate;
  if(!start) return false;
  const mStart = progMonthStart(year, month);
  const mEnd   = progMonthEnd(year, month);
  const today  = todayStr();
  return mEnd >= start && mStart <= today;
}

// ============================================================
// VIEWS
// ============================================================

// ---- Year view: year navigator + 12 month tiles ----
function renderProgYearView(container){
  const minY = progMinYear(), maxY = progMaxYear();
  const canPrev = progYear > minY, canNext = progYear < maxY;

  let tilesHtml = '';
  for(let m=1; m<=12; m++){
    const hasData = monthHasData(progYear, m);
    let rating=null, base=0, received=0;
    if(hasData){
      const r = getRatingForRange(progMonthStart(progYear,m), progMonthEnd(progYear,m));
      rating=r.rating; base=r.base; received=r.received;
    }
    const clickAttr = hasData ? `data-prog-month="${m}"` : '';
    tilesHtml += progTileHtml(monthShortName(m), rating, received, base, clickAttr);
  }

  container.innerHTML = `
    <div class="prog-year-nav">
      <button class="prog-arrow" id="progPrev" ${canPrev?'':'disabled'}>&#8249;</button>
      <span class="prog-year-label">${progYear}</span>
      <button class="prog-arrow" id="progNext" ${canNext?'':'disabled'}>&#8250;</button>
    </div>
    <div class="score-grid" style="margin-top:12px;">${tilesHtml}</div>
  `;

  container.querySelector('#progPrev').addEventListener('click', ()=>{ if(canPrev){ progYear--; renderProgYearView(container); }});
  container.querySelector('#progNext').addEventListener('click', ()=>{ if(canNext){ progYear++; renderProgYearView(container); }});
  container.querySelectorAll('[data-prog-month]').forEach(el=>{
    el.addEventListener('click', ()=>{
      openProgressionPopover(parseInt(el.dataset.progMonth));
    });
  });
}

// ---- Full-screen popover (month → week → day drill-down) ----
// Year view above always stays inline in the Score tab. Tapping a month opens this popover, and
// week/day navigation happens INSIDE it (renderProgWeekView/renderProgDayView below re-render into
// the same popover body via their own back-button handlers) — never a second popover. Month view
// (the popover's entry point) has no in-popover back step of its own — only the X closes it.
function openProgressionPopover(month){
  progMonth = month;
  progView = 'month';
  progWeekRange = null;
  progDay = null;

  const scrim = document.createElement('div');
  scrim.className = 'prog-pop-scrim';
  const card = document.createElement('div');
  card.className = 'prog-pop-card';
  card.innerHTML = `
    <div class="prog-pop-head">
      <h3>${tr('Progression')}</h3>
      <button class="notif-popover-close" id="progPopClose">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="prog-pop-body" id="progPopBody"></div>
  `;
  document.body.appendChild(scrim);
  document.body.appendChild(card);

  const close = ()=>{ scrim.remove(); card.remove(); };
  scrim.addEventListener('click', close);
  card.querySelector('#progPopClose').addEventListener('click', close);

  renderProgression(card.querySelector('#progPopBody'));
}

// ---- Month view: monthly hero + 4 custom-week tiles ----
function renderProgMonthView(container){
  const year=progYear, month=progMonth;
  const mStart = progMonthStart(year, month);
  const mEnd   = progMonthEnd(year, month);
  const {base, received} = getRatingForRange(mStart, mEnd);
  const heroLabel = `${monthShortName(month)} ${year}`;
  const weekRanges = getMonthWeekRanges(year, month);

  let tilesHtml = '';
  weekRanges.forEach((wr)=>{
    const r = getRatingForRange(wr.from, wr.to);
    tilesHtml += progTileHtml(wr.label, r.rating, r.received, r.base, `data-prog-week='${JSON.stringify(wr)}'`);
  });

  container.innerHTML = `
    ${progHeroHtml(heroLabel, received, base)}
    <div class="score-grid" style="margin-top:12px;">${tilesHtml}</div>
  `;

  container.querySelectorAll('[data-prog-week]').forEach(el=>{
    el.addEventListener('click', ()=>{
      progWeekRange = JSON.parse(el.dataset.progWeek);
      progView = 'week';
      renderProgression(container);
    });
  });
}

// ---- Week view: weekly hero + day tiles ----
function renderProgWeekView(container){
  const wr = progWeekRange;
  const {base, received} = getRatingForRange(wr.from, wr.to);
  const today = todayStr();

  let tilesHtml = '';
  let d = wr.from;
  while(d <= wr.to && d <= today){
    const dr = getDayRating(d);
    const dateObj = new Date(d+'T00:00:00');
    const dayLabel = dateObj.toLocaleDateString(localeForLang(), {month:'short', day:'numeric'});
    tilesHtml += progTileHtml(dayLabel, dr.rating, dr.received, dr.base, `data-prog-day="${d}"`);
    d = addDays(d, 1);
  }

  const backLabel = `${monthShortName(progMonth)} ${progYear}`;
  container.innerHTML = `
    ${progBackBtn(backLabel)}
    ${progHeroHtml(wr.label, received, base)}
    <div class="score-grid" style="margin-top:12px;">${tilesHtml}</div>
  `;

  container.querySelector('#progBack').addEventListener('click', ()=>{
    progView='month'; renderProgression(container);
  });
  container.querySelectorAll('[data-prog-day]').forEach(el=>{
    el.addEventListener('click', ()=>{
      progDay = el.dataset.progDay;
      progView = 'day';
      renderProgression(container);
    });
  });
}

// ---- Day view: daily hero + routine/task checklist ----
function renderProgDayView(container){
  const d = progDay;
  const dr = getDayRating(d);
  const dateObj = new Date(d+'T00:00:00');
  const heroLabel = dateObj.toLocaleDateString(localeForLang(), {weekday:'long', month:'long', day:'numeric'});

  // Routines due that day (wasRoutineDueOn respects deletion cutoff + versioned schedule history —
  // a routine deleted or rescheduled since this day still shows exactly as it did back then).
  const dueRoutines = state.routines.filter(r => wasRoutineDueOn(r, d));
  // Tasks active that day: due on or before d (not shown before their due date), not yet completed
  // OR completed on/after d, and not deleted before d (taskWasActiveOn covers all of this).
  const availTasks = state.tasks.filter(t => taskWasActiveOn(t, d));

  // Was a routine completed on that specific day? Check log entries.
  function routineCompletedOn(r){
    return state.log.some(e => e.kind==='routine' && e.refId===r.id && e.date===d);
  }
  // Was task completed on that day?
  function taskCompletedOn(t){
    return t.completedDate === d;
  }

  const check = `<span style="color:#16a34a; font-size:16px; font-weight:700;">✓</span>`;
  const cross = `<span style="color:#dc2626; font-size:16px; font-weight:700;">✗</span>`;

  let listHtml = '';
  dueRoutines.forEach(r=>{
    const done = routineCompletedOn(r);
    listHtml += `
      <div class="prog-day-item">
        <span class="prog-day-emoji">${r.emoji || ROUTINE_FALLBACK_EMOJI}</span>
        <span class="prog-day-name">${escapeHtml(r.name)}</span>
        ${done ? check : cross}
      </div>`;
  });
  availTasks.forEach(t=>{
    const done = taskCompletedOn(t);
    listHtml += `
      <div class="prog-day-item">
        <span class="prog-day-emoji">${t.emoji || TASK_DEFAULT_EMOJI}</span>
        <span class="prog-day-name">${escapeHtml(t.name)}</span>
        ${done ? check : cross}
      </div>`;
  });

  if(!listHtml) listHtml = `<div class="prog-day-empty" style="color:var(--ink-soft); text-align:center; padding:20px 0; font-size:14px;">—</div>`;

  const backLabel = progWeekRange ? progWeekRange.label : '';
  container.innerHTML = `
    ${progBackBtn(backLabel)}
    ${progHeroHtml(heroLabel, dr.received, dr.base)}
    <div class="prog-day-list">${listHtml}</div>
  `;

  container.querySelector('#progBack').addEventListener('click', ()=>{
    progView='week'; renderProgression(container);
  });
}

// ---- Main dispatcher ----
function renderProgression(container){
  if(progView==='year')  return renderProgYearView(container);
  if(progView==='month') return renderProgMonthView(container);
  if(progView==='week')  return renderProgWeekView(container);
  if(progView==='day')   return renderProgDayView(container);
}

// Reset progression state when Score tab is first opened
function resetProgression(){
  progYear = new Date().getFullYear();
  progView = 'year';
  progMonth = null;
  progWeekRange = null;
  progDay = null;
}
