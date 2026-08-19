// ---------- Category 2 notifications: trigger engine + slide-down banner ----------
// See ARCHITECTURE.md "Push Notification Architecture" for the Category 1 / Category 2 split.
// This file decides WHEN a local, condition-based notification fires and writes it into the
// shared IndexedDB inbox (app-notif-db.js). app-i18n.js owns the actual message text.
//
// Every notification carries a stable `key` (source signature — which routine/period/day and
// which condition) instead of ever being matched by its text. That's what lets undo/redo stay
// reactive: completing a routine can ADD an entry for a key; un-completing it REMOVES that exact
// entry; re-completing the same day ADDS it back fresh (new timestamp) without re-showing a
// banner, because the banner ledger (below) is keyed separately and never cleared by deletion —
// only by the calendar day rolling over.
//
// Two kinds of triggers:
//  - LIVE:   run synchronously right after a user action (complete/uncomplete a routine or task,
//            add/edit/delete a routine or task) and are eligible for a slide-down banner, at most
//            once per key per calendar day.
//  - SILENT: run once during app load, for anything that can only really be "detected" after the
//            fact (a missed occurrence, a week/month ending) — these never show a banner, so
//            something that happened while the app was closed just quietly lands in history.

const NOTIF_ICONS = { congrats: '🏆', warning: '❗', info: '❕', celebration: '🌟' };
const NOTIF_BANNER_MS = 4500;

// ---------- Banner ledger — once-per-calendar-day-per-key ----------
function bannerLedgerToday(){
  const t = todayStr();
  if(!state.settings.notifBannerLedger || state.settings.notifBannerLedger.date !== t){
    state.settings.notifBannerLedger = { date: t, keys: [] };
  }
  return state.settings.notifBannerLedger;
}
function bannerAlreadyUsedToday(key){
  return bannerLedgerToday().keys.includes(key);
}
function markBannerUsed(key){
  const ledger = bannerLedgerToday();
  if(!ledger.keys.includes(key)) ledger.keys.push(key);
  saveState();
}

// ---------- Generic condition → notification-entry setter ----------
// isTrueNow: is the condition true right now? buildMessage(): () => {title, body}, only called
// when actually needed. banner: is this key eligible for a slide-down banner at all?
async function notifSetCondition(key, isTrueNow, category, buildMessage, banner){
  let shouldBanner = false;
  let msg = null;
  try{
    const existing = await notifDbFindByKey(key);
    if(isTrueNow){
      if(existing) return; // already showing — no duplicate, no timestamp bump
      msg = buildMessage();
      await notifDbAdd({ key, category, title: msg.title, body: msg.body, receivedAt: Date.now() });
      await notifDbPruneOld();
      refreshBellBadge();
      if(banner && !bannerAlreadyUsedToday(key)){
        markBannerUsed(key);
        shouldBanner = true;
      }
    } else if(existing){
      await notifDbDeleteByKey(key);
      refreshBellBadge();
    }
  }catch(e){
    console.error('Category 2 notification (IndexedDB):', e);
    return;
  }
  // Deliberately outside the try/catch above — a bug here shouldn't look like a silent no-op.
  if(shouldBanner){
    // msg.overlayBody is optional — only 'celebration' buildMessage()s set it (a bold-HTML variant
    // for the full-screen overlay; see trRewardUnlockedOverlayBody()/trMilestoneOverlayBody() in
    // app-i18n.js). msg.body (plain text, what's actually stored in the DB above) is what every
    // other category always uses, and what 'celebration' falls back to if a caller doesn't bother
    // supplying an overlayBody.
    try{ showNotifBanner({ category, title: msg.title, body: msg.body, overlayBody: msg.overlayBody }); }
    catch(e){ console.error('Category 2 notification (banner):', e); }
  }
}

// ---------- LIVE: streak milestone + neglect-recovery ----------
// Called directly from completeRoutine()/uncompleteRoutine() in app-consistency.js, which already
// compute the before/after streak & neglect values needed to know whether either just happened.
function evaluateRoutineCompletionNotifications(r, t, flags){
  notifSetCondition(`ms:${r.id}:${t}`, !!flags.crossedStreakMilestone, 'celebration',
    ()=>({
      title: tr('New Milestone!'),
      body: trMilestoneNotifBody(streakEmoji(r), r.streak, r.name),
      overlayBody: trMilestoneOverlayBody(streakEmoji(r), r.streak, r.name)
    }),
    true);
  notifSetCondition(`recover:${r.id}:${t}`, !!flags.recoveredFromNeglect, 'congrats',
    ()=>({ title: tr('You made it back!!'), body: trRecoveryNotifBody(r.name) }),
    true);
}
function clearRoutineCompletionNotifications(routineId, t){
  notifSetCondition(`ms:${routineId}:${t}`, false, 'celebration', null, false);
  notifSetCondition(`recover:${routineId}:${t}`, false, 'congrats', null, false);
}

// ---------- LIVE: NP-cap notices + "all clear today" ----------
// Re-checked after any routine/task complete, uncomplete, add, edit, or delete — all of those can
// change today's due-item count, received points, or whether anything is still left open, which
// is all these four conditions depend on.
function evaluateLiveDailyNotifications(){
  if(!state.settings.ratingStartDate) return;
  const today = todayStr();

  // Band-aid: an active, uncompleted grace-period routine makes the day read as "not productive"
  // (wasRoutineDueOn excludes it from the due count until it's done), which can trigger a false
  // daily-cap notification purely because the user hasn't gotten to it yet — not because they're
  // actually capped. Suppress the notification in that case without touching the rating/denominator
  // logic itself. This is a band-aid — see BACKLOG.md 0d for the real underlying fix, which this
  // doesn't attempt (worth a proper backlog entry of its own once you batch-update the docs).
  const activeGraceToday = state.routines.some(r => r.graceAppliedDate === today && r.lastCompletedDate !== today);
  const dailyCond = isNotProductiveDay(today) && getTodayRating()==='GOOD' && !activeGraceToday;
  notifSetCondition(`npcap:daily:${today}`, dailyCond, 'info',
    ()=>({ title: tr('Daily Rating limit.'), body: trDailyNpCapBody() }), true);

  const weekStart = getWeekStart(today);
  const weekNp = aggregatePeriod(weekStart, today).npCount;
  notifSetCondition(`npcap:weekly:${weekStart}`, weekNp>=3, 'info',
    ()=>({ title: tr('Weekly Rating limit.'), body: trWeeklyNpCapBody(weekNp) }), true);

  const monthStr = today.slice(0,7);
  const monthNp = aggregatePeriod(monthStr+'-01', today).npCount;
  notifSetCondition(`npcap:monthly:${monthStr}`, monthNp>=17, 'info',
    ()=>({ title: tr('Monthly Rating limit.'), body: trMonthlyNpCapBody(monthNp) }), true);

  const dueRoutines = routinesForToday();
  // Still-open (uncompleted, due/overdue, not soft-deleted) tasks — this must check completedDate
  // directly, not taskDoneToday(), or a task completed on some earlier day would incorrectly keep
  // counting as "open" forever and this notification would never fire again.
  const openTasks = state.tasks.filter(t=> !t.deleted && !t.completedDate && taskState(t)!=='upcoming');
  const doneTodayTasks = state.tasks.filter(t=> !t.deleted && taskDoneToday(t));
  const somethingExists = dueRoutines.length>0 || openTasks.length>0 || doneTodayTasks.length>0;
  const allClear = somethingExists && dueRoutines.every(r=>routineDoneToday(r)) && openTasks.length===0;
  notifSetCondition(`allclear:${today}`, allClear, 'congrats',
    ()=>({ title: tr('All clear today'), body: trAllClearBody() }), true);

  if(typeof evaluateRewardNotifications==='function') evaluateRewardNotifications();
}

// ---------- SILENT: neglect milestone ----------
// Called from applyRoutineMiss() in app-consistency.js — a missed occurrence is only ever
// discovered during the catch-up pass on load, never live, so this never shows a banner.
function notifyNeglectMilestoneIfCrossed(r, missedDate, oldNeglectCount, newNeglectCount){
  if(newNeglectCount <= oldNeglectCount) return;
  notifSetCondition(`neglect:${r.id}:${missedDate}`, true, 'warning',
    ()=>({ title: tr('Be careful!'), body: trNeglectNotifBody(neglectEmoji(r), r.neglect, r.name) }),
    false);
}

// ---------- SILENT: weekly/monthly rating finalized ----------
// A week/month is "finalized" once today is past its last day. Re-derived fresh from today's date
// on every load rather than tracked with a pointer — notifSetCondition's existing-key check is
// what keeps this from ever re-notifying the same finalized period twice.
function finalizedWeekRating(weekStart, weekEnd){
  const {base, received, npCount} = aggregatePeriod(weekStart, weekEnd);
  return applyRatingCap(calcRating(Math.max(0,received), base), npCount>=4);
}
async function runSilentNotificationCatchUp(){
  if(!state.settings.ratingStartDate) return;
  const today = todayStr();
  const start = state.settings.ratingStartDate;

  const curWeekStart = getWeekStart(today);
  const lastWeekStart = addDays(curWeekStart, -7);
  const lastWeekEnd = addDays(curWeekStart, -1);
  if(lastWeekStart >= start){
    const rating = finalizedWeekRating(lastWeekStart, lastWeekEnd);
    if(rating){
      const category = rating==='NOT GOOD' ? 'warning' : 'congrats';
      notifSetCondition(`rating:weekly:${lastWeekStart}`, true, category,
        ()=>({ title: trRatingNotifTitle('weekly', rating), body: trRatingNotifBody('weekly', rating) }),
        false);
    }
  }

  const ty = parseInt(today.slice(0,4)), tm = parseInt(today.slice(5,7));
  let py = ty, pm = tm - 1;
  if(pm < 1){ pm = 12; py--; }
  const prevMonthStr = `${py}-${String(pm).padStart(2,'0')}`;
  if(prevMonthStr+'-01' >= start){
    const rating = getMonthRatingFor(prevMonthStr);
    if(rating){
      const category = rating==='NOT GOOD' ? 'warning' : 'congrats';
      notifSetCondition(`rating:monthly:${prevMonthStr}`, true, category,
        ()=>({ title: trRatingNotifTitle('monthly', rating), body: trRatingNotifBody('monthly', rating) }),
        false);
    }
  }
}

// ---------- Slide-down banner UI ----------
// A small stack: newest banner is index 0 (frontmost). Each entry keeps its own auto-dismiss
// timer running from the moment it was created, regardless of stack position — matches how two
// notifications firing close together behave on a phone lock screen.
let notifBannerStack = [];

function ensureBannerStackEl(){
  let stack = document.getElementById('notifBannerStack');
  if(!stack){
    stack = document.createElement('div');
    stack.id = 'notifBannerStack';
    document.body.appendChild(stack);
  }
  return stack;
}

// The header's real height varies (single-line wordmark vs. two-line title+date vs. the
// Settings/Notifications back-button layout), so it's measured live rather than assumed — the
// stack's own top/height are set to exactly the area under the header, and (paired with
// overflow:hidden on #notifBannerStack) that's what makes a banner's slide-down animation read as
// emerging from underneath the header rather than sliding in over the top of it. Recomputed every
// time a banner is shown, not cached, since the header's content (and therefore height) can change
// between one banner and the next.
function positionBannerStack(stack){
  const header = document.querySelector('header.top');
  const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
  stack.style.top = top + 'px';
  stack.style.height = `calc(100vh - ${top}px)`;
}

function layoutBannerStack(){
  notifBannerStack.forEach((b, i)=>{
    b.baseY = i*10;
    b.baseScale = Math.max(0.86, 1 - i*0.04);
    b.el.style.zIndex = String(100 - i);
    b.el.style.opacity = i>2 ? '0' : '1';
    if(!b.dragging){
      b.el.style.transform = `translate(0px, ${b.baseY}px) scale(${b.baseScale})`;
    }
  });
}

// exit: optional {x, y} override for the dismiss direction. Default (no exit passed, the
// auto-timeout case) drifts up slightly with no horizontal movement, same as before.
function removeBanner(entry, exit){
  const idx = notifBannerStack.indexOf(entry);
  if(idx===-1) return;
  clearTimeout(entry.timer);
  notifBannerStack.splice(idx, 1);
  entry.el.style.transition = 'transform .22s ease, opacity .22s ease';
  entry.el.style.opacity = '0';
  const x = (exit && exit.x!=null) ? exit.x : 0;
  const y = (exit && exit.y!=null) ? exit.y : entry.baseY - 40;
  entry.el.style.transform = `translate(${x}px, ${y}px) scale(${entry.baseScale})`;
  setTimeout(()=> entry.el.remove(), 220);
  layoutBannerStack();
}

function dismissAllBanners(){
  notifBannerStack.slice().forEach(entry=>{
    clearTimeout(entry.timer);
    entry.el.remove();
  });
  notifBannerStack = [];
}

function showNotifBanner({ category, title, body, overlayBody }){
  // 'celebration' gets the full-screen star-burst overlay instead of the small slide-down
  // banner — visually a completely different presentation, but it's still governed by the exact
  // same once-per-key-per-day gate in notifSetCondition() above; this function only decides HOW
  // to show it once that gate has already said yes.
  if(category==='celebration'){ showCelebrationOverlay({title, body: overlayBody || body}); return; }
  const stack = ensureBannerStackEl();
  positionBannerStack(stack);
  const el = document.createElement('div');
  el.className = 'notif-banner';
  el.innerHTML = `
    <div class="nb-icon">${NOTIF_ICONS[category] || ''}</div>
    <div class="nb-text">
      <div class="nb-title">${escapeHtml(title)}</div>
      <div class="nb-body">${escapeHtml(body)}</div>
    </div>
  `;
  stack.appendChild(el);
  const entry = { el, timer: null, dragging: false, baseY: 0, baseScale: 1 };
  notifBannerStack.unshift(entry);
  layoutBannerStack();
  entry.timer = setTimeout(()=> removeBanner(entry), NOTIF_BANNER_MS);
  wireBannerGestures(entry);
}

function wireBannerGestures(entry){
  const el = entry.el;
  // touchAction 'pan-y' let vertical scroll gestures pass through the browser before this was
  // wired for vertical swipe — now that swiping up is itself a dismiss gesture, block native
  // vertical panning entirely so it doesn't fight the drag.
  let startX=0, startY=0, dx=0, dy=0, moved=false;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e)=>{
    entry.dragging = true; moved = false; dx = 0; dy = 0;
    startX = e.clientX; startY = e.clientY;
    el.style.transition = 'none';
    try{ el.setPointerCapture(e.pointerId); }catch(err){ /* not needed for mouse in some browsers */ }
  });
  el.addEventListener('pointermove', (e)=>{
    if(!entry.dragging) return;
    dx = e.clientX - startX;
    dy = e.clientY - startY;
    if(Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
    // Only follow the finger upward, not downward — dragging down isn't a supported gesture and
    // would just look like the banner sinking back toward/into the header.
    const followY = Math.min(dy, 0);
    el.style.transform = `translate(${dx}px, ${entry.baseY + followY}px) scale(${entry.baseScale})`;
  });
  const finish = ()=>{
    if(!entry.dragging) return;
    entry.dragging = false;
    el.style.transition = 'transform .22s ease, opacity .22s ease';
    if(Math.abs(dx) > 70){
      removeBanner(entry, { x: dx>0 ? 400 : -400, y: entry.baseY });
    } else if(dy < -70){
      removeBanner(entry, { x: 0, y: entry.baseY - 300 });
    } else if(!moved){
      dismissAllBanners();
      openNotificationsPage();
    } else {
      el.style.transform = `translate(0px, ${entry.baseY}px) scale(${entry.baseScale})`;
    }
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
}

// ---------- Category 2 "celebration": full-screen star-burst overlay ----------
// A single persistent overlay (see index.html), reused for every celebration — restarts its own
// animations each time rather than being torn down/recreated, same idea as the ring/badge
// elsewhere in the app.
function showCelebrationOverlay({title, body}){
  const overlay = document.getElementById('notifCelebrationOverlay');
  if(!overlay) return;
  document.getElementById('notifCelebrationTitle').textContent = title;
  // body is trusted HTML here (unlike everywhere else notification text is shown, which always
  // uses textContent/escapeHtml) — it's the overlayBody built by trRewardUnlockedOverlayBody() /
  // trMilestoneOverlayBody() in app-i18n.js, which already escapeHtml()s the one user-supplied
  // piece (the reward/routine name) before wrapping it in a <b> the rest of that string is a fixed
  // literal. Never pass raw/unescaped user input into this function.
  document.getElementById('notifCelebrationBody').innerHTML = body;
  document.getElementById('notifCelebrationCta').textContent = tr('Continue');
  const star = overlay.querySelector('.nc-star');
  const rays = overlay.querySelectorAll('.nc-ray');
  star.style.animation = 'none';
  rays.forEach(r=> r.style.animation = 'none');
  void overlay.offsetWidth; // force reflow so the animation restarts even if already showing
  star.style.animation = '';
  rays.forEach(r=> r.style.animation = '');
  overlay.classList.add('show');
}
function closeCelebrationOverlay(){
  const overlay = document.getElementById('notifCelebrationOverlay');
  if(overlay) overlay.classList.remove('show');
}
document.getElementById('notifCelebrationClose').addEventListener('click', closeCelebrationOverlay);
document.getElementById('notifCelebrationCta').addEventListener('click', closeCelebrationOverlay);
document.getElementById('notifCelebrationScrim').addEventListener('click', closeCelebrationOverlay);
