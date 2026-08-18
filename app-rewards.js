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
// list in sync with whatever just changed the day's received score.
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
  if(fracEl) fracEl.textContent = trRewardFraction(rewardsAchievedCount(), state.rewards.length);
  const titleEl = document.getElementById('rewardPanelTitle');
  if(titleEl) titleEl.textContent = tr('Rewards');
  const addLabelEl = document.getElementById('rewardAddLabel');
  if(addLabelEl) addLabelEl.textContent = tr('Add reward');
  if(rewardsPanelOpen) renderRewardPanelList();
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
      ? `<span class="reward-tag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6L9 17l-5-5"/></svg></span>`
      : `<span class="reward-tag locked">${trNum(r.pointsNeeded)}</span>`;
    return `
      <div class="reward-row" data-reward-row="${r.id}">
        <span class="reward-row-name">${escapeHtml(r.name)}</span>
        ${tag}
      </div>`;
  }).join('');
  listEl.querySelectorAll('[data-reward-row]').forEach(row=>{
    row.addEventListener('click', ()=> openEditRewardModal(row.dataset.rewardRow));
  });
}

// Kept in sync with hero-row.rewards-open's CSS gap value and flex ratios (6:4, i.e. 60/40) in
// ring.css.
const REWARD_ROW_GAP_PX = 10;
const REWARD_ROW_RING_SHARE = 0.6;

function openRewardsPanel(){
  if(rewardsPanelOpen || !state.settings.rewardsEnabled) return;
  rewardsPanelOpen = true;
  const heroRow = document.getElementById('heroRow');
  const panel = document.getElementById('rewardPanel');
  // Panel height is set to match the ring's height (not the panel's own, narrower width) so the
  // two boxes still line up top-to-bottom even though the ring is now the wider one — computed
  // directly from hero-row's own (already-known, unanimated) width so it's correct from frame one,
  // rather than measuring the ring mid-transition (which would catch it partway through its own
  // animation and lock in the wrong number).
  if(heroRow && panel){
    const available = heroRow.getBoundingClientRect().width - REWARD_ROW_GAP_PX;
    const ringSide = available * REWARD_ROW_RING_SHARE;
    panel.style.height = Math.max(0, ringSide) + 'px';
  }
  heroRow.classList.add('rewards-open');
  renderRewardPanelList();
  pushBackLayer(()=>{
    rewardsPanelOpen = false;
    const heroRow = document.getElementById('heroRow');
    const panel = document.getElementById('rewardPanel');
    if(heroRow) heroRow.classList.remove('rewards-open');
    if(panel) panel.style.height = '';
  });
}
// For callers that need to close it as a side effect (switching tabs, opening Settings) rather
// than as the user's own back action — goes through the same back-layer stack either way, since
// it really is the layer on top at that point; see app-main.js's setTab()/gearBtn wiring.
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
      <input id="rwName" type="text" value="${escapeHtml(name||'')}" placeholder="${tr('e.g. Movie night')}" />
    </div>
    <div class="field">
      <label>${tr('Points needed')}</label>
      <input id="rwPoints" type="number" min="1" step="1" value="${pointsNeeded||''}" placeholder="${tr('e.g. 200')}" />
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
