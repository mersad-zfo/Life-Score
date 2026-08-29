// ---------- Rewards popover (split out of app-rewards.js) ----------
// The big reward list (tap the mini panel to open it) and its Manage Rewards view, which the SAME
// popover element morphs INTO in place — not a second overlay stacked on top. This is the surface
// meant to grow: weekly/monthly rewards (planned, not built yet — see BACKLOG.md) will land here,
// most likely as new tabs/sections inside Manage Rewards reusing this same popover shell, which is
// why it's split into its own file rather than living alongside the mini panel/Add/Edit modals in
// app-rewards.js (the stable, unlikely-to-grow-much core — reward data/derived state, presets,
// notifications, and the mini panel/CRUD modals stay there). Loaded right after app-rewards.js —
// see index.html's script order — and freely calls that file's functions/globals
// (rewardAchievedToday(), rewardsAchievedCount(), rewardGlyphHtml(), openEditRewardModal(),
// openAddRewardModal(), openRewardsPanel(), pendingAfterRewardPanelClose, etc.), same as any two
// plain global scripts in this project.
//
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
      : `<span class="rw-pop-pill">${rewardPillLabel(r)}</span>`;
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
      <span class="rp-manage-points">${rewardPillLabel(r)}</span>
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
    // See the doc comment on pendingAfterRewardPanelClose in app-rewards.js — let the panel's own
    // async close actually finish before we push the popover's own history entry on top of it.
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
    const wasSheet = rewardsPopoverSheetMode;
    if(wasSheet){ flyRingHome(); rewardsPopoverSheetMode = false; }
    document.getElementById('rewardsPopover').classList.remove('show', 'as-sheet');
    document.getElementById('rwScrim').classList.remove('show', 'as-sheet');
    document.getElementById('rpManageView').classList.add('hide');
    document.getElementById('rpListView').classList.remove('hide');
    const heroRow = document.getElementById('heroRow');
    if(heroRow) heroRow.classList.remove('reward-popover-open');
    const navigateAway = rewardsPopoverCloseIsNavigateAway;
    rewardsPopoverCloseIsNavigateAway = false;
    // Only reopen the mini panel when closing straight out of the List view — that's the state
    // you came from (tapping the mini panel is the only way into List). Closing out of Manage
    // Rewards (wasSheet) should land on the plain closed badge instead, not loop back through
    // the mini panel you never actually opened this trip (see the owner's report this session).
    if(!navigateAway && !wasSheet){
      openRewardsPanel();
    }
    // Navigating away from Home entirely (tab switch / Settings / bell — see setTab()/gearBtn/
    // bellBtn in app-main.js) while the popover was open: no mini panel to reopen once you're not
    // on Home, and whatever navigation the user actually asked for was queued here rather than
    // fired right after closeBackLayer() above, which is async — see the identical race this same
    // pattern works around for pendingAfterRewardPanelClose.
    if(pendingAfterPopoverClose){ const fn = pendingAfterPopoverClose; pendingAfterPopoverClose = null; fn(); }
  });
}
document.getElementById('rpListClose').addEventListener('click', ()=> closeBackLayer());
document.getElementById('rpManageClose').addEventListener('click', ()=> closeBackLayer());
document.getElementById('rpDoneBtn').addEventListener('click', ()=> closeBackLayer());
document.getElementById('rwScrim').addEventListener('click', ()=>{ if(rewardsPopoverOpen) closeBackLayer(); });

// Set right before closing the popover for a reason other than the user's own close action —
// specifically, navigating away from Home while it's open. See doc comment above.
let rewardsPopoverCloseIsNavigateAway = false;
let pendingAfterPopoverClose = null;
// Closes the popover first (if open) and defers `fn` until that close has genuinely finished —
// used by setTab()/gearBtn/bellBtn in app-main.js so the popover (and its flown-up ring) can't be
// left floating on top of whatever page you navigate to. If the popover isn't open, `fn` just runs
// immediately.
function closeRewardsPopoverForNavigationThen(fn){
  if(!rewardsPopoverOpen){ fn(); return; }
  rewardsPopoverCloseIsNavigateAway = true;
  pendingAfterPopoverClose = fn;
  closeBackLayer();
}

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
