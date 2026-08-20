// ---------- Rewards (this session) ----------
// User-defined daily point targets ("200 pts -> Gaming"). Daily-only for now — weekly/monthly
// rewards are a planned future addition, not built yet (see BACKLOG.md).
//
// Achieved-state is never persisted: it's derived live, every render, from today's real received
// score (routines + tasks combined, same number the Home ring shows) vs. each reward's
// pointsNeeded. That's what makes the daily reset automatic — there is no midnight job to run,
// "today" just naturally means a different, empty-again comparison once the day rolls over.
//
// Rewards are hard-deleted (no soft-delete/configHistory, unlike Routines/Tasks) — deliberate:
// a reward never appears in any historical view (Progression, log entries, past-day
// recomputation), so there's nothing to protect by keeping a deleted one around. See
// ARCHITECTURE.md "Historical Data Integrity" for why that machinery exists for Routines/Tasks
// and why it doesn't apply here.
//
// The mini reward panel is not a modal — it's an inline expand/collapse of the Home ring hero —
// but it still goes through the hardware-back-button stack like everything else back-able (see
// app-main.js's back-layer stack doc comment): opening pushes a layer, and the panel's own
// back-chevron is the only in-UI close control (confirmed explicitly — no tap-elsewhere-to-close).
//
// This session added the big Rewards popover (tap the mini panel's list to open it) and its
// Manage Rewards view, which the popover morphs INTO in place (not a second overlay stacked on
// top) — see the "Rewards popover" section below. Editing a reward from Manage Rewards still
// opens the plain, original Edit Reward modal (untouched, at the bottom of this file); only the
// New Reward modal was overhauled, into a single-select preset/custom chip picker — same visual
// pattern as onboarding's routine/task chips (see obChipFlowHtml/obWireChipFlow in
// app-onboarding.js).

let rewardsPanelOpen = false;

function todaysReceivedForRewards(){
  return Math.max(0, getDailyLogPoints(todayStr()));
}
function rewardAchievedToday(r){
  return todaysReceivedForRewards() >= r.pointsNeeded;
}
function rewardsAchievedCount(){
  return state.rewards.filter(r=> rewardAchievedToday(r)).length;
}

// ---------- Preset rewards + glyphs (this session) ----------
// Fixed catalogue offered in the New Reward chip picker. A preset's glyph is fixed — never
// user-chosen — and anything typed via "+ Add yours" always gets the same default, REWARD_DEFAULT_
// EMOJI. Point values are pre-filled suggestions on the existing 0-990/step-10 slider, not a new
// range of their own.
const REWARD_DEFAULT_EMOJI = '🎁';
const PRESET_REWARDS = [
  {id:'gaming', nameKey:'Gaming', emoji:'🎮', points:150},
  {id:'youtube', nameKey:'Youtube', logoId:'youtube', points:100},
  {id:'instagram', nameKey:'Instagram', logoId:'instagram', points:100},
  {id:'tiktok', nameKey:'Tiktok', logoId:'tiktok', points:100},
  {id:'news', nameKey:'Reading news', emoji:'📰', points:80},
  {id:'tv', nameKey:'Tv Shows', emoji:'📺', points:200},
  {id:'nap', nameKey:'Napping', emoji:'💤', points:60},
  {id:'text', nameKey:'Texting', emoji:'💬', points:50},
  {id:'reading', nameKey:'Reading', emoji:'📖', points:120},
  {id:'smoking', nameKey:'Smoking', emoji:'🚬', points:50},
  {id:'adult', nameKey:'Adult content', emoji:'🔞', points:150},
];
// Flat brand marks — same rendering convention as ICON_GOOGLE/ICON_APPLE in app-account.js (no
// background box, just the logomark) — for the presets that are apps most phones won't have an
// emoji for.
const REWARD_LOGOS = {
  youtube: `<svg viewBox="0 0 24 24" width="1em" height="1em"><path fill="#FF0000" d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2 31 31 0 000 12a31 31 0 00.5 5.8 3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1A31 31 0 0024 12a31 31 0 00-.5-5.8z"/><path fill="#fff" d="M9.6 15.6V8.4l6.3 3.6z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" width="1em" height="1em"><defs><linearGradient id="igGradReward" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#FED576"/><stop offset="26%" stop-color="#F47133"/><stop offset="61%" stop-color="#BC3081"/><stop offset="100%" stop-color="#4C63D2"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#igGradReward)"/><rect x="6.5" y="6.5" width="11" height="11" rx="3.2" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="16.6" cy="7.4" r="1.1" fill="#fff"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" width="1em" height="1em"><path fill="#25F4EE" d="M16.6 3.1c.7 1.7 2.1 3 3.9 3.4v3a7 7 0 01-3.9-1.2v6.4a5.7 5.7 0 11-5.7-5.7c.3 0 .6 0 .9.07v3.1a2.6 2.6 0 100 5.1 2.6 2.6 0 002.6-2.6V1.6h2.2z" transform="translate(-0.45,0.45)"/><path fill="#FE2C55" d="M16.6 3.1c.7 1.7 2.1 3 3.9 3.4v3a7 7 0 01-3.9-1.2v6.4a5.7 5.7 0 11-5.7-5.7c.3 0 .6 0 .9.07v3.1a2.6 2.6 0 100 5.1 2.6 2.6 0 002.6-2.6V1.6h2.2z" transform="translate(0.45,-0.45)"/><path fill="#000" d="M16.6 3.1c.7 1.7 2.1 3 3.9 3.4v3a7 7 0 01-3.9-1.2v6.4a5.7 5.7 0 11-5.7-5.7c.3 0 .6 0 .9.07v3.1a2.6 2.6 0 100 5.1 2.6 2.6 0 002.6-2.6V1.6h2.2z"/></svg>`,
};
// Full glyph for a stored reward object (has flat emoji/logoId fields) — used in the big popover
// list and the Manage Rewards list. Never shown in the small mini panel.
function rewardGlyphHtml(r){
  if(r.logoId && REWARD_LOGOS[r.logoId]) return `<span class="reward-glyph">${REWARD_LOGOS[r.logoId]}</span>`;
  return `<span class="reward-glyph">${r.emoji || REWARD_DEFAULT_EMOJI}</span>`;
}
// Inline glyph fragment for a preset chip's own label (emoji char, or a sized logo span) — same
// "emoji + label" concatenation onboarding's chips use.
function presetGlyphInline(p){
  return p.logoId && REWARD_LOGOS[p.logoId] ? `<span class="chip-logo">${REWARD_LOGOS[p.logoId]}</span>` : p.emoji;
}

// Called from renderToday() every Home render — keeps the badge fraction and (if open) the mini
// panel / big popover in sync with whatever just changed the day's received score. Deliberately
// does NOT call evaluateRewardNotifications() here — it used to, as a "safety net," but that ran it
// a second time in the same synchronous action as the evaluateLiveDailyNotifications() hook below
// (e.g. completing a routine calls that hook, then renderMain()/renderToday() runs and called
// this). notifSetCondition()'s existing-entry check is async (an IndexedDB read), so both calls
// could see "nothing yet" before either had actually written, and both would insert — a duplicate
// bell entry for the same unlock. One real trigger point per action, not "call it everywhere and
// let it sort itself out": see the explicit calls in the Add/Edit/Delete reward handlers below for
// the cases evaluateLiveDailyNotifications() doesn't already cover.
function updateRewardBadge(){
  const badge = document.getElementById('rewardBadge');
  const heroRow = document.getElementById('heroRow');
  if(!badge || !heroRow) return;
  const enabled = !!state.settings.rewardsEnabled;
  badge.style.display = enabled ? '' : 'none';
  if(!enabled){
    if(rewardsPanelOpen) closeRewardsPanelIfOpen();
    if(rewardsPopoverOpen) closeBackLayer();
    return;
  }
  const fracEl = document.getElementById('rewardBadgeFraction');
  if(fracEl){
    const hasRewards = state.rewards.length>0;
    fracEl.textContent = hasRewards ? trRewardFraction(rewardsAchievedCount(), state.rewards.length) : '';
    fracEl.style.display = hasRewards ? '' : 'none';
  }
  const titleEl = document.getElementById('rewardPanelTitle');
  if(titleEl) titleEl.textContent = tr('Rewards');
  const manageBtnLabelEl = document.getElementById('manageRewardsBtnLabel');
  if(manageBtnLabelEl) manageBtnLabelEl.textContent = tr('Manage Rewards');
  const rpManageTitleEl = document.getElementById('rpManageTitle');
  if(rpManageTitleEl) rpManageTitleEl.textContent = tr('Manage rewards');
  const rpManageSubEl = document.getElementById('rpManageSub');
  if(rpManageSubEl) rpManageSubEl.textContent = tr('Rewards are time-consuming or unproductive activities you unlock by earning points.');
  const rpActiveLabelEl = document.getElementById('rpActiveLabel');
  if(rpActiveLabelEl) rpActiveLabelEl.textContent = tr('Active rewards');
  const rpAddRewardLabelEl = document.getElementById('rpAddRewardLabel');
  if(rpAddRewardLabelEl) rpAddRewardLabelEl.textContent = tr('Add reward');
  const rpDoneBtnEl = document.getElementById('rpDoneBtn');
  if(rpDoneBtnEl) rpDoneBtnEl.textContent = tr('Done');
  const fixedAddLabelEl = document.getElementById('rewardAddLabelFixed');
  if(fixedAddLabelEl) fixedAddLabelEl.textContent = tr('Add reward');
  if(rewardsPanelOpen) renderRewardPanelList();
  if(rewardsPopoverOpen) renderRewardsPopoverAll();
}

// Category 2 (local, condition-triggered) notification for reward unlocks — routes through the
// exact same engine as every other in-app notification (app-notif-triggers.js's
// notifSetCondition()): once-per-key-per-day, lands in the bell popover/history with the
// 'celebration' category's 🌟 icon, and — because 'celebration' is what triggers it — shows the
// full-screen star-burst overlay instead of the small slide-down banner other categories get.
// Keyed per reward per day (`reward:<id>:<date>`), so undo (score dropping back below the target)
// removes the notification entry via the same isTrueNow===false branch everything else uses, and
// crossing the target again later the same day is a fresh add, not a re-notify of a stale one.
function evaluateRewardNotifications(){
  if(!state.settings.rewardsEnabled) return;
  const today = todayStr();
  state.rewards.forEach(r=>{
    notifSetCondition(`reward:${r.id}:${today}`, rewardAchievedToday(r), 'celebration',
      ()=>({
        title: tr('Got a reward!'),
        body: trRewardUnlockedBody(r.name),
        overlayBody: trRewardUnlockedOverlayBody(r.name)
      }),
      true);
  });
}

// ---------- Mini reward panel (badge <-> expanded list) ----------
// Reward emoji is intentionally never shown here (only in the big popover / Manage Rewards) — see
// PHILOSOPHY.md-adjacent note in DECISIONS.md this session. Tapping anywhere in the list opens the
// big Rewards popover (replacing the old per-row "tap to edit" — editing moved into Manage
// Rewards). "+ Add reward" is its own fixed footer button below the list (#rewardAddBtnFixed,
// static in index.html, wired once below) — always in the same place, opens the New Reward modal
// directly.
function renderRewardPanelList(){
  const listEl = document.getElementById('rewardPanelList');
  if(!listEl) return;
  if(!state.rewards.length){
    listEl.innerHTML = `<div class="reward-panel-empty">${tr('No rewards yet')}</div>`;
    return;
  }
  listEl.innerHTML = state.rewards.map(r=>{
    const achieved = rewardAchievedToday(r);
    const tag = achieved
      ? `<span class="reward-tag star">🌟</span>`
      : `<span class="reward-tag locked">${trNum(r.pointsNeeded)}</span>`;
    return `
      <div class="reward-row${achieved?' achieved':''}">
        <span class="reward-row-name">${escapeHtml(r.name)}</span>
        ${tag}
      </div>`;
  }).join('');
}

// Kept in sync with hero-row.rewards-open's CSS gap value in ring.css.
const REWARD_ROW_GAP_PX = 10;
const REWARD_ROW_RING_SHARE = 0.6; // ring gets 60% of the row, panel gets 40%
const REWARD_PANEL_HEIGHT_FACTOR = 0.92; // 8% shorter than the ring's own height (4% off top, 4% off bottom — centered via align-self:center in CSS)

function openRewardsPanel(){
  if(rewardsPanelOpen || !state.settings.rewardsEnabled) return;
  rewardsPanelOpen = true;
  const heroRow = document.getElementById('heroRow');
  const ringWrap = document.getElementById('ringWrap');
  const panel = document.getElementById('rewardPanel');
  // Both boxes' final pixel width/height are computed up front from hero-row's own
  // (already-known, unanimated) width, then set as plain inline styles so the CSS width/height
  // transitions in ring.css are a straight, guaranteed-monotonic px-to-px interpolation — the
  // ring just shrinks-while-sliding-right in one motion, no grow-then-shrink hitch from
  // flex-grow/flex-basis interpolating independently.
  if(heroRow && ringWrap && panel){
    const available = heroRow.getBoundingClientRect().width - REWARD_ROW_GAP_PX;
    const ringSide = Math.max(0, available * REWARD_ROW_RING_SHARE);
    const panelWidth = Math.max(0, available - ringSide);
    ringWrap.style.width = ringSide + 'px';
    ringWrap.style.height = ringSide + 'px';
    panel.style.width = panelWidth + 'px';
    panel.style.height = (ringSide * REWARD_PANEL_HEIGHT_FACTOR) + 'px';
  }
  heroRow.classList.add('rewards-open');
  renderRewardPanelList();
  pushBackLayer(()=>{
    rewardsPanelOpen = false;
    const heroRow = document.getElementById('heroRow');
    const ringWrap = document.getElementById('ringWrap');
    const panel = document.getElementById('rewardPanel');
    if(heroRow) heroRow.classList.remove('rewards-open');
    if(ringWrap){ ringWrap.style.width = ''; ringWrap.style.height = ''; }
    if(panel){ panel.style.width = ''; panel.style.height = ''; }
    // If this close was itself only a step toward opening the big popover (see openRewardsPopover()
    // below), that's queued here rather than fired right after closeBackLayer() — closeBackLayer()
    // calls history.go(-1), which is async (see app-main.js's doc comment on pushBackLayer/
    // closeBackLayer); calling pushBackLayer() again immediately, before that navigation actually
    // resolves, races it and left the panel never really closing. Running it from inside this onPop
    // instead means it only runs once the panel's own close has genuinely completed.
    if(pendingAfterRewardPanelClose){ const fn = pendingAfterRewardPanelClose; pendingAfterRewardPanelClose = null; fn(); }
  });
}
let pendingAfterRewardPanelClose = null;
// For callers that need to close it as a side effect (e.g. disabling the Rewards setting while
// the panel happens to be open) rather than as the user's own back action — goes through the same
// back-layer stack either way. Tab switches and opening Settings do NOT call this: the panel
// deliberately stays open across tab changes, only a hardware-back/chevron tap or quitting the
// app closes it (state is in-memory only, so it's naturally closed again on next launch).
function closeRewardsPanelIfOpen(){
  if(rewardsPanelOpen) closeBackLayer();
}

document.getElementById('rewardBadge').addEventListener('click', openRewardsPanel);
document.getElementById('rewardPanelClose').addEventListener('click', ()=> closeBackLayer());
document.getElementById('rewardAddBtnFixed').addEventListener('click', (e)=>{ e.stopPropagation(); openAddRewardModal(); });
document.getElementById('rewardPanelList').addEventListener('click', ()=> openRewardsPopover());

// ---------- Rewards popover (this session) ----------
// One persistent, body-root element (index.html) — never re-created, only shown/hidden and toggled
// between its two views (List / Manage). Opening it pushes exactly ONE back-layer: every close
// control (both views' own close-X, the scrim tap, and hardware back) converges on that same single
// cleanup, same as openModal()'s own choke point. Manage Rewards has no separate "back to List" of
// its own — matching its own close-X, hardware-back from Manage fully closes the popover too.
let rewardsPopoverOpen = false;
let rewardsPopoverSheetMode = false; // true while the Manage Rewards ("sheet") view is showing

function renderRewardsPopoverList(){
  const el = document.getElementById('rpListRows');
  const fracEl = document.getElementById('rpListFrac');
  if(!el) return;
  if(fracEl) fracEl.textContent = state.rewards.length ? trRewardFraction(rewardsAchievedCount(), state.rewards.length) : '';
  if(!state.rewards.length){
    el.innerHTML = `<div class="reward-panel-empty">${tr('No rewards yet')}</div>`;
    return;
  }
  el.innerHTML = state.rewards.map(r=>{
    const achieved = rewardAchievedToday(r);
    const right = achieved
      ? `<span class="rw-pop-star-wrap"><span class="rw-pop-glow"></span><span class="rw-pop-star">🌟</span></span>`
      : `<span class="rw-pop-pill">${trNum(r.pointsNeeded)}</span>`;
    return `
      <div class="rw-pop-row${achieved?' achieved':''}">
        ${rewardGlyphHtml(r)}
        <span class="rw-pop-name">${escapeHtml(r.name)}</span>
        ${right}
      </div>`;
  }).join('');
}
function renderManageRewardsList(){
  const el = document.getElementById('rpManageRows');
  if(!el) return;
  el.innerHTML = state.rewards.map(r=>`
    <div class="rp-manage-row">
      ${rewardGlyphHtml(r)}
      <span class="rp-manage-name">${escapeHtml(r.name)}</span>
      <span class="rp-manage-points">${trNum(r.pointsNeeded)}</span>
      <button class="rp-icon-btn rp-edit-btn" data-edit="${r.id}" aria-label="${tr('Edit reward')}">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
      </button>
      <button class="rp-icon-btn rp-delete-btn" data-delete="${r.id}" aria-label="${tr('Remove reward')}">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"/><path d="M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/></svg>
      </button>
    </div>`).join('');
  el.querySelectorAll('[data-edit]').forEach(b=> b.addEventListener('click', ()=> openEditRewardModal(b.dataset.edit)));
  el.querySelectorAll('[data-delete]').forEach(b=> b.addEventListener('click', ()=>{
    const id = b.dataset.delete;
    if(!confirm(tr('Remove this reward?'))) return;
    // Clears today's notification entry if this reward happened to be achieved-and-celebrated
    // already — otherwise it'd be orphaned in the bell forever, since evaluateRewardNotifications()
    // only re-checks rewards still in state.rewards. Same pattern as
    // clearRoutineCompletionNotifications() for a deleted routine.
    notifSetCondition(`reward:${id}:${todayStr()}`, false, 'celebration', null, false);
    state.rewards = state.rewards.filter(x=>x.id!==id);
    saveState();
    updateRewardBadge();
    renderManageRewardsList();
    renderRewardsPopoverList();
  }));
}
function renderRewardsPopoverAll(){
  renderRewardsPopoverList();
  renderManageRewardsList();
}

// FLIP helper (used only by the ring-fly transition below): lets an element that just got
// reparented/resized/repositioned by `mutate` animate FROM its old rect TO its new one, instead of
// jumping there instantly.
function flipAnimate(el, mutate){
  const first = el.getBoundingClientRect();
  mutate();
  const last = el.getBoundingClientRect();
  const dx = first.left - last.left, dy = first.top - last.top;
  const sx = first.width / last.width, sy = first.height / last.height;
  el.style.transition = 'none';
  el.style.transformOrigin = 'top left';
  el.style.transform = `translate(${dx}px,${dy}px) scale(${sx},${sy})`;
  el.getBoundingClientRect(); // force layout so the transform above actually applies before the next frame reverts it
  requestAnimationFrame(()=>{
    el.style.transition = 'transform .45s cubic-bezier(.4,0,.2,1)';
    el.style.transform = 'none';
  });
  // Hand control back to CSS once the flip settles, instead of leaving this inline override in
  // place forever — matters for the popover especially, which gets flipped in and out of "sheet"
  // shape across multiple opens and otherwise would silently stop its own CSS-declared show/hide
  // pop-scale from ever running again after the first Manage Rewards morph.
  setTimeout(()=>{
    el.style.transition = '';
    el.style.transformOrigin = '';
    el.style.transform = '';
  }, 480);
}

// Reparents the real #ringWrap out of hero-row and into #app itself so it can float above
// everything (including the Manage Rewards sheet below it) while shrunk to sit just under the
// header, with "DAILY" appearing underneath it. Only ever called while Manage Rewards is open.
function flyRingUp(){
  const app = document.getElementById('app');
  const header = app && app.querySelector('header.top');
  const ringWrap = document.getElementById('ringWrap');
  const label = document.getElementById('ringPeriodLabel');
  const homeLists = document.getElementById('homeLists');
  if(!app || !header || !ringWrap) return;
  flipAnimate(ringWrap, ()=>{
    app.appendChild(ringWrap);
    ringWrap.classList.add('ring-flying', 'ring-compact');
    const headerRect = header.getBoundingClientRect();
    const appRect = app.getBoundingClientRect();
    const zoneTop = headerRect.bottom - appRect.top;
    // The sheet's own top edge sits at 40% of #app's height (it's height:60% anchored to the
    // bottom — see .rewards-popover.as-sheet in ring.css). zoneBottom used to land exactly there,
    // leaving DAILY's label with no breathing room above the sheet — reserving 10px here (label's
    // own text height plus a real gap) instead of letting the ring/label zone run flush to it.
    const sheetTopPx = appRect.height * 0.4;
    const zoneBottom = sheetTopPx - 10;
    const zoneHeight = zoneBottom - zoneTop;
    const ringSize = Math.max(160, Math.min(200, zoneHeight - 16));
    const ringTop = zoneTop + (zoneHeight - ringSize) / 2;
    ringWrap.style.top = ringTop + 'px';
    ringWrap.style.left = '50%';
    ringWrap.style.marginLeft = (-ringSize/2) + 'px';
    ringWrap.style.width = ringSize + 'px';
    ringWrap.style.height = ringSize + 'px';
    if(label){
      label.textContent = tr('DAILY');
      // sits right under the ring, between it and the Manage Rewards sheet below
      label.style.top = (ringTop + ringSize + 1) + 'px';
      label.classList.add('show');
      requestAnimationFrame(()=> label.classList.add('in'));
    }
  });
  if(homeLists) homeLists.classList.add('rewards-modal-mode');
}
// Reverses flyRingUp() — reparents #ringWrap back into hero-row at its normal flow position.
function flyRingHome(){
  const ringWrap = document.getElementById('ringWrap');
  const heroRow = document.getElementById('heroRow');
  const label = document.getElementById('ringPeriodLabel');
  const homeLists = document.getElementById('homeLists');
  if(!ringWrap || !heroRow) return;
  if(label) label.classList.remove('show','in');
  flipAnimate(ringWrap, ()=>{
    ringWrap.classList.remove('ring-flying', 'ring-compact');
    ringWrap.style.top = ''; ringWrap.style.left = ''; ringWrap.style.marginLeft = '';
    ringWrap.style.width = ''; ringWrap.style.height = '';
    heroRow.appendChild(ringWrap);
  });
  if(homeLists) homeLists.classList.remove('rewards-modal-mode');
}

function openRewardsPopover(){
  if(rewardsPopoverOpen || !state.settings.rewardsEnabled) return;
  if(rewardsPanelOpen){
    // See the doc comment on pendingAfterRewardPanelClose above — let the panel's own async close
    // actually finish before we push the popover's own history entry on top of it.
    pendingAfterRewardPanelClose = doOpenRewardsPopover;
    closeBackLayer();
    return;
  }
  doOpenRewardsPopover();
}
function doOpenRewardsPopover(){
  rewardsPopoverOpen = true;
  const heroRow = document.getElementById('heroRow');
  if(heroRow) heroRow.classList.add('reward-popover-open');
  document.getElementById('rpManageView').classList.add('hide');
  document.getElementById('rpListView').classList.remove('hide');
  renderRewardsPopoverAll();
  document.getElementById('rwScrim').classList.add('show');
  document.getElementById('rewardsPopover').classList.add('show');
  pushBackLayer(()=>{
    rewardsPopoverOpen = false;
    if(rewardsPopoverSheetMode){ flyRingHome(); rewardsPopoverSheetMode = false; }
    document.getElementById('rewardsPopover').classList.remove('show', 'as-sheet');
    document.getElementById('rwScrim').classList.remove('show', 'as-sheet');
    document.getElementById('rpManageView').classList.add('hide');
    document.getElementById('rpListView').classList.remove('hide');
    const heroRow = document.getElementById('heroRow');
    if(heroRow) heroRow.classList.remove('reward-popover-open');
    openRewardsPanel();
  });
}
document.getElementById('rpListClose').addEventListener('click', ()=> closeBackLayer());
document.getElementById('rpManageClose').addEventListener('click', ()=> closeBackLayer());
document.getElementById('rpDoneBtn').addEventListener('click', ()=> closeBackLayer());
document.getElementById('rwScrim').addEventListener('click', ()=>{ if(rewardsPopoverOpen) closeBackLayer(); });

document.getElementById('manageRewardsBtn').addEventListener('click', ()=>{
  rewardsPopoverSheetMode = true;
  const popover = document.getElementById('rewardsPopover');
  flipAnimate(popover, ()=>{
    popover.classList.add('as-sheet');
    document.getElementById('rwScrim').classList.add('as-sheet');
    document.getElementById('rpListView').classList.add('hide');
    document.getElementById('rpManageView').classList.remove('hide');
  });
  flyRingUp();
});
document.getElementById('rpAddRewardBtn').addEventListener('click', ()=> openAddRewardModal());

// ---------- New Reward chip picker (this session — overhauled) ----------
// Single-select preset/custom chip flow, same visual language and DOM/CSS classes as onboarding's
// routine/task picker (chip / chip-flow / chip-add / chip-add-form — see onboarding.css). Picking a
// preset replaces the previous pick (unlike onboarding's routines, which are multi-select). Emoji is
// never user-chosen: a preset carries its own fixed glyph, "+ Add yours" always gets 🎁.
let rwSelectedPreset = null;   // the chosen PRESET_REWARDS entry, or null
let rwCustomChips = [];        // [{id, name}] created via "+ Add yours" this modal session
let rwSelectedCustomId = null; // id into rwCustomChips, or null

function rwFindCustom(id){ return rwCustomChips.find(c=>c.id===id); }

function rwChipFlowHtml(){
  const presetHtml = PRESET_REWARDS.map(p=>{
    const sel = rwSelectedPreset && rwSelectedPreset.id===p.id;
    return `<div class="chip ${sel?'selected':''}" data-preset="${p.id}">${sel?'✓ ':''}${presetGlyphInline(p)} ${escapeHtml(tr(p.nameKey))}</div>`;
  }).join('');
  const customHtml = rwCustomChips.map(c=>{
    const sel = rwSelectedCustomId===c.id;
    return `<div class="chip ${sel?'selected':''}" data-custom="${c.id}">${sel?'✓ ':''}${REWARD_DEFAULT_EMOJI} ${escapeHtml(c.name)}<span class="chip-remove" data-remove="${c.id}">×</span></div>`;
  }).join('');
  return `<div class="chip-flow" id="rwChipFlow">${presetHtml}${customHtml}<div class="chip chip-add" id="rwAddYours">${tr('+ Add yours')}</div></div>`;
}
function rwWireChipFlow(onChange){
  const flow = document.getElementById('rwChipFlow');
  flow.querySelectorAll('.chip[data-preset]').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      rwSelectedPreset = PRESET_REWARDS.find(p=>p.id===chip.dataset.preset);
      rwSelectedCustomId = null;
      onChange(rwSelectedPreset.points);
    });
  });
  flow.querySelectorAll('.chip[data-custom]').forEach(chip=>{
    chip.addEventListener('click', (e)=>{
      if(e.target.closest('.chip-remove')) return;
      rwSelectedCustomId = chip.dataset.custom;
      rwSelectedPreset = null;
      onChange(null);
    });
  });
  flow.querySelectorAll('.chip-remove').forEach(x=>{
    x.addEventListener('click', (e)=>{
      e.stopPropagation();
      const id = x.dataset.remove;
      rwCustomChips = rwCustomChips.filter(c=>c.id!==id);
      if(rwSelectedCustomId===id) rwSelectedCustomId = null;
      onChange(null);
    });
  });
  const addYours = document.getElementById('rwAddYours');
  addYours.addEventListener('click', ()=>{
    const form = document.createElement('span');
    form.className = 'chip-add-form';
    form.innerHTML = `<input class="chip-add-input" placeholder="${tr('Type your own…')}"><button class="chip-add-confirm" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></button>`;
    addYours.replaceWith(form);
    const input = form.querySelector('input');
    const confirmBtn = form.querySelector('.chip-add-confirm');
    input.focus();
    const commit = ()=>{
      const val = input.value.trim();
      if(val){
        const id = 'custom-' + Date.now();
        rwCustomChips.push({id, name: val});
        rwSelectedCustomId = id;
        rwSelectedPreset = null;
      }
      onChange(null);
    };
    confirmBtn.addEventListener('click', commit);
    input.addEventListener('keydown', e=>{
      if(e.key==='Enter') commit();
      if(e.key==='Escape') onChange(null);
    });
    input.addEventListener('blur', ()=>{
      setTimeout(()=>{ if(document.activeElement !== confirmBtn) onChange(null); }, 120);
    });
  });
}

// ---------- Shared "Points needed" control (this session — reworked for clarity + direct typing)
// Used by both the New Reward chip picker and the (otherwise untouched) Edit Reward modal. The
// slider stays capped 0-990/step-10 (dragging it), but the number beside it is a real, independent
// <input type="number"> — tapping it lets you type any value directly, with no upper cap and no
// requirement to land on a multiple of 10; the slider just visually clamps to its own 0-990 range
// to represent that (maxed-out) when the typed value exceeds it, without altering what actually
// gets saved. ----------
function rewardPointsFieldHtml(value){
  const val = Math.max(0, value || 0);
  const sliderVal = Math.max(0, Math.min(990, val));
  return `
    <div class="field">
      <label>${tr('Points needed')}</label>
      <div class="reward-slider-row">
        <input id="rwPoints" type="range" min="0" max="990" step="10" value="${sliderVal}" class="reward-slider" />
        <input id="rwPointsValue" type="number" inputmode="numeric" class="reward-slider-value-input" value="${val}" />
      </div>
    </div>`;
}
// Returns {getValue, setValue} — getValue() always reads from the number input (the source of
// truth); setValue() (used by the chip picker's preset pre-fill) drives both controls from one call.
function wireRewardPointsControl(root){
  const slider = root.querySelector('#rwPoints');
  const numInput = root.querySelector('#rwPointsValue');
  const paint = (raw)=>{
    const clamped = Math.max(0, Math.min(990, raw));
    slider.value = clamped;
    const pct = (clamped - slider.min) / (slider.max - slider.min) * 100;
    slider.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--line) ${pct}%)`;
  };
  slider.addEventListener('input', ()=>{
    const v = parseInt(slider.value, 10);
    numInput.value = v;
    paint(v);
  });
  numInput.addEventListener('input', ()=>{
    const v = parseInt(numInput.value, 10);
    if(!isNaN(v)) paint(v);
  });
  paint(parseInt(numInput.value, 10) || 0);
  return {
    getValue: ()=>{ const v = parseInt(numInput.value, 10); return isNaN(v) ? 0 : Math.max(0, v); },
    setValue: (v)=>{ numInput.value = v; paint(v); }
  };
}

function openAddRewardModal(){
  rwSelectedPreset = null;
  rwCustomChips = [];
  rwSelectedCustomId = null;
  const m = openModal(`
    ${modalCloseXHtml()}
    <h3>${tr('New reward')}</h3>
    <p class="modal-sub">${tr('Pick something that usually wastes your time or is a guilty pleasure.')}</p>
    <div class="section-label"><span>${tr('Choose a reward')}</span></div>
    ${rwChipFlowHtml()}
    <div style="margin-top:18px;">${rewardPointsFieldHtml(0)}</div>
    <div class="modal-actions">
      <button class="btn-secondary" id="rwCancel">${tr('Cancel')}</button>
      <button class="btn-primary" id="rwSave">${tr('Add reward')}</button>
    </div>
  `);
  const points = wireRewardPointsControl(m);
  function onChipChange(pointsToSet){
    if(pointsToSet!=null) points.setValue(pointsToSet);
    m.querySelector('#rwChipFlow').outerHTML = rwChipFlowHtml();
    rwWireChipFlow(onChipChange);
  }
  rwWireChipFlow(onChipChange);
  m.querySelector('#rwCancel').addEventListener('click', ()=> closeBackLayer());
  m.querySelector('#rwSave').addEventListener('click', ()=>{
    const pointsNeeded = points.getValue();
    let name = '', emoji = null, logoId = null;
    if(rwSelectedPreset){
      name = tr(rwSelectedPreset.nameKey);
      emoji = rwSelectedPreset.emoji || null;
      logoId = rwSelectedPreset.logoId || null;
    } else if(rwSelectedCustomId){
      const c = rwFindCustom(rwSelectedCustomId);
      if(c){ name = c.name; emoji = REWARD_DEFAULT_EMOJI; }
    }
    if(!name){ showToast(tr('Pick a reward first')); return; }
    if(!pointsNeeded || pointsNeeded<1){ showToast(tr('Give it a points target')); return; }
    state.rewards.push({ id: uid(), name, pointsNeeded, createdDate: todayStr(), emoji, logoId });
    saveState();
    closeBackLayer();
    updateRewardBadge();
    evaluateRewardNotifications();
    showToast(tr('Reward added'));
  });
}

// ---------- Edit Reward modal (untouched this session — plain name + slider, no chips; a
// reward's emoji/logo is preserved as-is across an edit, never touched here) ----------
function rewardModalFieldsHtml(name, pointsNeeded){
  return `
    <div class="field">
      <label>${tr('Reward name')}</label>
      <input id="rwName" type="text" value="${escapeHtml(name||'')}" placeholder="${tr('e.g. Using Phone')}" />
    </div>
    ${rewardPointsFieldHtml(pointsNeeded)}
  `;
}
function openEditRewardModal(id){
  const reward = state.rewards.find(x=>x.id===id);
  if(!reward) return;
  const m = openModal(`
    ${modalCloseXHtml()}
    <h3>${tr('Edit reward')}</h3>
    ${rewardModalFieldsHtml(reward.name, reward.pointsNeeded)}
    <div class="modal-actions">
      <button class="btn-secondary" id="rwCancel">${tr('Cancel')}</button>
      <button class="btn-primary" id="rwSave">${tr('Save changes')}</button>
    </div>
    <button class="settings-btn danger-text" style="text-align:center; width:100%; margin-top:10px;" id="rwDelete">${tr('Remove reward')}</button>
  `);
  const points = wireRewardPointsControl(m);
  m.querySelector('#rwCancel').addEventListener('click', ()=> closeBackLayer());
  m.querySelector('#rwSave').addEventListener('click', ()=>{
    const name = m.querySelector('#rwName').value.trim();
    const pointsNeeded = points.getValue();
    if(!name){ showToast(tr('Give it a name')); return; }
    if(!pointsNeeded || pointsNeeded<1){ showToast(tr('Give it a points target')); return; }
    reward.name = name;
    reward.pointsNeeded = pointsNeeded;
    saveState();
    closeBackLayer();
    updateRewardBadge();
    evaluateRewardNotifications();
    showToast(tr('Reward updated'));
  });
  m.querySelector('#rwDelete').addEventListener('click', ()=>{
    if(!confirm(tr('Remove this reward?'))) return;
    // Clears today's notification entry if this reward happened to be achieved-and-celebrated
    // already — otherwise it'd be orphaned in the bell forever, since evaluateRewardNotifications()
    // only re-checks rewards still in state.rewards. Same pattern as
    // clearRoutineCompletionNotifications() for a deleted routine.
    notifSetCondition(`reward:${id}:${todayStr()}`, false, 'celebration', null, false);
    state.rewards = state.rewards.filter(x=>x.id!==id);
    saveState();
    closeBackLayer();
    updateRewardBadge();
    renderManageRewardsList();
    renderRewardsPopoverList();
  });
}
