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
// list in sync with whatever just changed the day's received score, and fires the unlock
// celebration the moment a reward first crosses its threshold today.
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
  checkRewardAchievements();
  const fracEl = document.getElementById('rewardBadgeFraction');
  if(fracEl) fracEl.textContent = trRewardFraction(rewardsAchievedCount(), state.rewards.length);
  const titleEl = document.getElementById('rewardPanelTitle');
  if(titleEl) titleEl.textContent = tr('Rewards');
  const addLabelEl = document.getElementById('rewardAddLabel');
  if(addLabelEl) addLabelEl.textContent = tr('Add reward');
  if(rewardsPanelOpen) renderRewardPanelList();
}

// Tracks, per reward id, the date it was last confirmed achieved-and-celebrated — so the "Got a
// reward!" toast fires exactly once per reward per day, the moment it crosses the line, not on
// every render while it stays achieved. Not persisted (in-memory only): a reload re-derives
// achieved-state fresh from today's score and simply won't re-celebrate an already-open session's
// old news, which is the right call since there's nothing to protect here (see file header).
let rewardsCelebratedToday = {};
function checkRewardAchievements(){
  const today = todayStr();
  state.rewards.forEach(r=>{
    const achieved = rewardAchievedToday(r);
    if(achieved && rewardsCelebratedToday[r.id]!==today){
      rewardsCelebratedToday[r.id] = today;
      showRewardToast(tr('Got a reward!'), tr('{reward} is unlocked — nice work today.').replace('{reward}', r.name));
    } else if(!achieved && rewardsCelebratedToday[r.id]===today){
      // Score dropped back below the target (e.g. a task got unchecked) — allow a fresh
      // celebration if they cross it again later today rather than staying silently "used up."
      delete rewardsCelebratedToday[r.id];
    }
  });
}

function showRewardToast(title, subtitle){
  const el = document.getElementById('rewardToast');
  if(!el) return;
  document.getElementById('rewardToastTitle').textContent = title;
  document.getElementById('rewardToastSub').textContent = subtitle;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(()=> el.classList.remove('show'), 3400);
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
const REWARD_PANEL_HEIGHT_FACTOR = 0.8; // panel is a bit shorter than the ring's own height

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
  return `
    <div class="field">
      <label>${tr('Reward name')}</label>
      <input id="rwName" type="text" value="${escapeHtml(name||'')}" placeholder="${tr('e.g. Social media')}" />
    </div>
    <div class="field">
      <label>${tr('Points needed')}</label>
      <input id="rwPoints" type="number" min="1" step="1" value="${pointsNeeded||''}" />
    </div>
  `;
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
  m.querySelector('#rwCancel').addEventListener('click', ()=> closeBackLayer());
  m.querySelector('#rwSave').addEventListener('click', ()=>{
    const {name, pointsNeeded} = readRewardFields(m);
    if(!name){ showToast(tr('Give it a name')); return; }
    if(!pointsNeeded || pointsNeeded<1){ showToast(tr('Give it a points target')); return; }
    state.rewards.push({ id: uid(), name, pointsNeeded, createdDate: todayStr() });
    saveState();
    closeBackLayer();
    updateRewardBadge();
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
    showToast(tr('Reward updated'));
  });
  m.querySelector('#rwDelete').addEventListener('click', ()=>{
    if(!confirm(tr('Remove this reward?'))) return;
    state.rewards = state.rewards.filter(x=>x.id!==id);
    saveState();
    closeBackLayer();
    updateRewardBadge();
  });
}
