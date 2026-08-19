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
// The reward panel is not a modal — it's an inline expand/collapse of the Home ring hero — but it
// still goes through the hardware-back-button stack like everything else back-able (see
// app-main.js's back-layer stack doc comment): opening pushes a layer, and the panel's own
// back-chevron is the only in-UI close control (confirmed explicitly — no tap-elsewhere-to-close).

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

// Called from renderToday() every Home render — keeps the badge fraction and (if open) the panel
// list in sync with whatever just changed the day's received score. Deliberately does NOT call
// evaluateRewardNotifications() here — it used to, as a "safety net," but that ran it a second
// time in the same synchronous action as the evaluateLiveDailyNotifications() hook below (e.g.
// completing a routine calls that hook, then renderMain()/renderToday() runs and called this).
// notifSetCondition()'s existing-entry check is async (an IndexedDB read), so both calls could see
// "nothing yet" before either had actually written, and both would insert — a duplicate bell
// entry for the same unlock. One real trigger point per action, not "call it everywhere and let
// it sort itself out": see the explicit calls in the Add/Edit/Delete reward handlers below for
// the cases evaluateLiveDailyNotifications() doesn't already cover.
function updateRewardBadge(){
  const badge = document.getElementById('rewardBadge');
  const heroRow = document.getElementById('heroRow');
  if(!badge || !heroRow) return;
  const enabled = !!state.settings.rewardsEnabled;
  badge.style.display = enabled ? '' : 'none';
  if(!enabled){
    if(rewardsPanelOpen) closeRewardsPanelIfOpen();
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
  const addLabelEl = document.getElementById('rewardAddLabel');
  if(addLabelEl) addLabelEl.textContent = tr('Add reward');
  if(rewardsPanelOpen) renderRewardPanelList();
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

function renderRewardPanelList(){
  const listEl = document.getElementById('rewardPanelList');
  if(!listEl) return;
  if(state.rewards.length===0){
    listEl.innerHTML = `<div class="reward-panel-empty">${tr('No rewards yet')}</div>`;
    return;
  }
  listEl.innerHTML = state.rewards.map(r=>{
    const achieved = rewardAchievedToday(r);
    const tag = achieved
      ? `<span class="reward-tag star">🌟</span>`
      : `<span class="reward-tag locked">${trNum(r.pointsNeeded)}</span>`;
    return `
      <div class="reward-row${achieved?' achieved':''}" data-reward-row="${r.id}">
        <span class="reward-row-name">${escapeHtml(r.name)}</span>
        ${tag}
      </div>`;
  }).join('');
  listEl.querySelectorAll('[data-reward-row]').forEach(row=>{
    row.addEventListener('click', ()=> openEditRewardModal(row.dataset.rewardRow));
  });
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
  });
}
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
document.getElementById('rewardAddBtn').addEventListener('click', ()=> openAddRewardModal());

// ---------- Add / Edit Reward modals ----------
function rewardModalFieldsHtml(name, pointsNeeded){
  const val = pointsNeeded || 0;
  return `
    <div class="field">
      <label>${tr('Reward name')}</label>
      <input id="rwName" type="text" value="${escapeHtml(name||'')}" placeholder="${tr('e.g. Using Phone')}" />
    </div>
    <div class="field">
      <label>${tr('Points needed')}</label>
      <div class="reward-slider-row">
        <input id="rwPoints" type="range" min="0" max="990" step="10" value="${val}" class="reward-slider" />
        <span class="reward-slider-value" id="rwPointsValue">${trNum(val)}</span>
      </div>
    </div>
  `;
}
function wireRewardSlider(m){
  const slider = m.querySelector('#rwPoints');
  const valueEl = m.querySelector('#rwPointsValue');
  const paint = ()=>{
    const pct = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--line) ${pct}%)`;
    valueEl.textContent = trNum(slider.value);
  };
  slider.addEventListener('input', paint);
  paint();
}
function readRewardFields(m){
  const name = m.querySelector('#rwName').value.trim();
  const pointsNeeded = parseInt(m.querySelector('#rwPoints').value, 10);
  return {name, pointsNeeded};
}
function openAddRewardModal(){
  const m = openModal(`
    ${modalCloseXHtml()}
    <h3>${tr('New reward')}</h3>
    <p class="modal-sub">${tr('Set a point target for today — reach it and this reward unlocks.')}</p>
    ${rewardModalFieldsHtml('', '')}
    <div class="modal-actions">
      <button class="btn-secondary" id="rwCancel">${tr('Cancel')}</button>
      <button class="btn-primary" id="rwSave">${tr('Add reward')}</button>
    </div>
  `);
  wireRewardSlider(m);
  m.querySelector('#rwCancel').addEventListener('click', ()=> closeBackLayer());
  m.querySelector('#rwSave').addEventListener('click', ()=>{
    const {name, pointsNeeded} = readRewardFields(m);
    if(!name){ showToast(tr('Give it a name')); return; }
    if(!pointsNeeded || pointsNeeded<1){ showToast(tr('Give it a points target')); return; }
    state.rewards.push({ id: uid(), name, pointsNeeded, createdDate: todayStr() });
    saveState();
    closeBackLayer();
    updateRewardBadge();
    evaluateRewardNotifications();
    showToast(tr('Reward added'));
  });
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
  wireRewardSlider(m);
  m.querySelector('#rwCancel').addEventListener('click', ()=> closeBackLayer());
  m.querySelector('#rwSave').addEventListener('click', ()=>{
    const {name, pointsNeeded} = readRewardFields(m);
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
  });
}
