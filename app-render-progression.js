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
  const {base, received, npCount} = aggregatePeriod(from, to);
  // Bucket by the range's nominal length (to−from), NOT by days actually elapsed since
  // ratingStartDate (aggregatePeriod's own `days`, clamped to real history). Bucketing by
  // elapsed days meant a whole-month query made in someone's first day or two of ever using
  // the app got judged as if it were a 1-2 day mini-range — round(2*4/7)=1, so a single NP
  // day permanently capped the entire month. Using the nominal span keeps the threshold an
  // absolute NP-day count sized to the *real* period (18 for a month-length range, 4 for a
  // week-length one) — same principle as the Score tab's fixed npCount>=18/>=4, generalized
  // to arbitrary ranges. A period that's barely begun simply can't reach it yet.
  const nominalDays = daysBetween(from, to) + 1;
  let limited;
  if(nominalDays<=1)       limited = npCount>=1;
  else if(nominalDays<=8)  limited = npCount >= Math.round(nominalDays * (4/7));
  else if(nominalDays<=31) limited = npCount >= Math.round(nominalDays * (18/31));
  else                     limited = npCount/nominalDays > 0.6;
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

// ---- Hero ring (this session) ----
// Same visual system as Home's ring (app-render-today.js: same CSS classes/gradients, same
// comet-trail sweep while filling, same breathing halo once complete) but built fresh for each
// Month/Week/Day view rather than being a persistent, in-place-updated singleton the way Home's
// is — these views get a brand new element every time you navigate here, so each ring gets its
// own scoped comet loop that just stops itself the moment it notices its element is no longer in
// the DOM, rather than sharing Home's one perpetual loop tied to fixed element IDs.
const PROG_RING_R = 98, PROG_RING_C = 2 * Math.PI * PROG_RING_R;
const PROG_COMET_STEPS = 6;

function progRingHeroHtml(uid, label, rating, received, base){
  const rc = ratingPillClass(rating);
  const rLabel = rating ? tr(rating) : tr('no rating yet');
  return `
    <div class="ring-wrap prog-ring-wrap" id="${uid}">
      <svg viewBox="0 0 230 230">
        <g transform="rotate(-90 115 115)">
          <circle class="ring-track" cx="115" cy="115" r="${PROG_RING_R}"></circle>
          <circle class="ring-progress prog-ring-progress" cx="115" cy="115" r="${PROG_RING_R}"></circle>
          <g class="comet-trail prog-comet-trail"></g>
        </g>
      </svg>
      <div class="ring-center">
        <div class="ring-mini-label">${label}</div>
        <div class="score-hero-fraction">${scoreFractionHtml(received, base)}</div>
        <div class="rating-pill ${rc}">${rLabel}</div>
      </div>
    </div>`;
}
// Call once right after the hero's HTML has actually been inserted into the DOM (querying by the
// uid handed to progRingHeroHtml above) — fills the ring in from empty, same easing as Home, and
// starts the comet loop only while genuinely mid-fill (0% < fill < 100%), matching updateHomeRing().
function animateProgRingHero(uid, received, base, isAwesome){
  const wrap = document.getElementById(uid);
  if(!wrap) return;
  const progressEl = wrap.querySelector('.prog-ring-progress');
  const cometG = wrap.querySelector('.prog-comet-trail');
  if(!progressEl) return;
  const clamped = Math.max(0, Math.min(1, base>0 ? received/base : 0));

  if(cometG && !cometG.children.length){
    for(let i=0;i<PROG_COMET_STEPS;i++){
      const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('cx', PROG_RING_R+17); c.setAttribute('cy', PROG_RING_R+17); c.setAttribute('r', PROG_RING_R);
      c.setAttribute('stroke-width', (13 - i*0.9).toFixed(1));
      c.classList.add('comet-seg');
      cometG.appendChild(c);
    }
  }

  progressEl.style.transition = 'none';
  progressEl.style.strokeDasharray = PROG_RING_C;
  progressEl.style.strokeDashoffset = PROG_RING_C;
  progressEl.getBoundingClientRect(); // force reflow so the fill-in below actually animates
  progressEl.style.transition = 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)';
  const target = PROG_RING_C * (1 - clamped);
  requestAnimationFrame(()=>{ progressEl.style.strokeDashoffset = target; });

  const isComplete = clamped >= 1;
  const isFilling = clamped > 0 && clamped < 1;
  progressEl.classList.toggle('pulse-halo', isComplete);
  progressEl.classList.toggle('awesome', !!isAwesome);
  if(cometG) cometG.classList.toggle('active', isFilling);
  if(!isFilling) return;

  const fillLen = PROG_RING_C * clamped;
  function tick(now){
    const w = document.getElementById(uid);
    if(!w || !w.isConnected) return; // this view moved on — let the loop end for good
    const g = w.querySelector('.prog-comet-trail');
    if(g){
      const period = 2600;
      const t = (now % period) / period;
      const travel = Math.max(0, fillLen - 18);
      const eased = t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
      const headPos = eased * travel;
      const fadeOpacity = t<0.08 ? t/0.08 : (t>0.92 ? (1-t)/0.08 : 1);
      Array.from(g.children).forEach((c,i)=>{
        const len = 18 - i*2.6;
        c.setAttribute('stroke-dasharray', `${Math.max(len,1)} 9999`);
        c.setAttribute('stroke-dashoffset', -(headPos - i*4));
        c.style.opacity = ((0.55 - i*0.08) * fadeOpacity).toFixed(2);
      });
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
let progRingUidCounter = 0;
function nextProgRingUid(){ return 'progRing' + (++progRingUidCounter); }

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

  pushBackLayer(()=>{ scrim.remove(); card.remove(); });
  scrim.addEventListener('click', ()=> closeBackLayer());
  card.querySelector('#progPopClose').addEventListener('click', ()=> closeBackLayer());

  renderProgression(card.querySelector('#progPopBody'));
}

// ---- Month view: monthly hero + 4 custom-week tiles ----
function renderProgMonthView(container){
  const year=progYear, month=progMonth;
  const mStart = progMonthStart(year, month);
  const mEnd   = progMonthEnd(year, month);
  const {rating, base, received} = getRatingForRange(mStart, mEnd);
  const heroLabel = `${monthShortName(month)} ${year}`;
  const weekRanges = getMonthWeekRanges(year, month);

  let tilesHtml = '';
  weekRanges.forEach((wr)=>{
    const r = getRatingForRange(wr.from, wr.to);
    tilesHtml += progTileHtml(wr.label, r.rating, r.received, r.base, `data-prog-week='${JSON.stringify(wr)}'`);
  });

  const ringUid = nextProgRingUid();
  container.innerHTML = `
    ${progRingHeroHtml(ringUid, heroLabel, rating, received, base)}
    <div class="score-grid" style="margin-top:12px;">${tilesHtml}</div>
  `;
  animateProgRingHero(ringUid, received, base, rating==='AWESOME!!!');

  container.querySelectorAll('[data-prog-week]').forEach(el=>{
    el.addEventListener('click', ()=>{
      progWeekRange = JSON.parse(el.dataset.progWeek);
      progView = 'week';
      renderProgression(container);
      pushBackLayer(()=>{ progView='month'; renderProgression(container); });
    });
  });
}

// ---- Week view: weekly hero + day tiles ----
function renderProgWeekView(container){
  const wr = progWeekRange;
  const {rating, base, received} = getRatingForRange(wr.from, wr.to);
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
  const ringUid = nextProgRingUid();
  container.innerHTML = `
    ${progBackBtn(backLabel)}
    ${progRingHeroHtml(ringUid, wr.label, rating, received, base)}
    <div class="score-grid" style="margin-top:12px;">${tilesHtml}</div>
  `;
  animateProgRingHero(ringUid, received, base, rating==='AWESOME!!!');

  container.querySelector('#progBack').addEventListener('click', ()=> closeBackLayer());
  container.querySelectorAll('[data-prog-day]').forEach(el=>{
    el.addEventListener('click', ()=>{
      progDay = el.dataset.progDay;
      progView = 'day';
      renderProgression(container);
      pushBackLayer(()=>{ progView='week'; renderProgression(container); });
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

  // Points/penalty actually logged for this item on this day, if any (routines log both a
  // completion entry and, separately, a missed-day penalty entry; tasks currently only log a
  // completion entry — there's no per-day penalty log for ongoing task decay, so we simply don't
  // show a number for a not-yet-completed task rather than guessing one). A stepped item splits
  // its points across per-step log entries instead of one lump entry — routine_step/task_step —
  // including those must be counted too, or a stepped item (fully done or only partially checked)
  // would silently show no points at all.
  function loggedPointsFor(refKind, refId){
    const kinds = refKind==='routine' ? ['routine','routine_penalty','routine_step'] : ['task','task_step'];
    const entries = state.log.filter(e => e.date===d && e.refId===refId && kinds.includes(e.kind));
    if(entries.length===0) return null;
    return entries.reduce((sum,e)=> sum + (e.points||0), 0);
  }
  function pointsBadgeHtml(pts){
    if(pts===null) return '';
    const sign = pts>=0 ? '+' : '';
    return `<span class="prog-day-points ${pts>=0?'positive':'negative'}">${sign}${pts}</span>`;
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
        ${pointsBadgeHtml(loggedPointsFor('routine', r.id))}
        ${done ? check : cross}
      </div>`;
  });
  availTasks.forEach(t=>{
    const done = taskCompletedOn(t);
    listHtml += `
      <div class="prog-day-item">
        <span class="prog-day-emoji">${t.emoji || TASK_DEFAULT_EMOJI}</span>
        <span class="prog-day-name">${escapeHtml(t.name)}</span>
        ${pointsBadgeHtml(loggedPointsFor('task', t.id))}
        ${done ? check : cross}
      </div>`;
  });

  if(!listHtml) listHtml = `<div class="prog-day-empty" style="color:var(--ink-soft); text-align:center; padding:20px 0; font-size:14px;">-</div>`;

  const backLabel = progWeekRange ? progWeekRange.label : '';
  const ringUid = nextProgRingUid();
  container.innerHTML = `
    ${progBackBtn(backLabel)}
    ${progRingHeroHtml(ringUid, heroLabel, dr.rating, dr.received, dr.base)}
    <div class="prog-day-list">${listHtml}</div>
  `;
  animateProgRingHero(ringUid, dr.received, dr.base, dr.rating==='AWESOME!!!');

  container.querySelector('#progBack').addEventListener('click', ()=> closeBackLayer());
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
