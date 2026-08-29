// ---------- Routines tab (Daily / Weekly / Monthly grouping) ----------
function renderDailyRoutineCard(r){
  const done = routineDoneToday(r);
  const rState = routineState(r);
  let stateText;
  if(rState==='streak') stateText = `${streakEmoji(r)} ×${r.streak} · ${tr('Streak')}`;
  else if(rState==='neglect') stateText = `${neglectEmoji(r)} ×${r.neglect} · ${tr('Neglect')}`;
  else stateText = tr('Neutral');
  const lines = [];
  if(r.time) lines.push(`<div class="item-sub">${timeChipHtml(r.time)}</div>`);
  if(r.description) lines.push(`<div class="item-sub" style="color:var(--ink);">${escapeHtml(r.description)}</div>`);
  lines.push(`<div class="item-sub">${stateText}</div>`);
  lines.push(stepsToggleRowHtml('routine', r));
  return `
  <div class="card" data-card-routine="${r.id}" data-drag-item data-drag-id="${r.id}">
    <div class="row">
      <span class="drag-handle"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>
      ${emojiWithStepsBadgeHtml('emoji-list', r.emoji||ROUTINE_FALLBACK_EMOJI, r, 'routine')}
      <div style="flex:1;">
        <div class="item-name">${escapeHtml(r.name)}</div>
        ${lines.join('')}
      </div>
      <span class="pill">${r.basePoints}</span>
      <button class="btn-done ${done?'done':''}" data-routine="${r.id}">${done? '✓' : ''}</button>
    </div>
    ${stepsBodyHtml('routine', r)}
    <div class="row" style="margin-top:8px;">
      <button class="link-danger" style="font-size:12px;" data-del-routine="${r.id}">${tr('Remove')}</button>
      <button class="btn-complete-task" data-edit-routine="${r.id}">${tr('Edit')}</button>
    </div>
  </div>`;
}
// Weekly/monthly card. "Due" is strictly today's exact scheduled date — no backward-looking
// carryover, no "overdue" concept. While due and not yet done, the card is live and shows the
// live penalty preview (what neglect would become, and what that costs, if missed today). Once
// today passes, the card goes quiet/grayed until its next scheduled day.
function renderRecurringRoutineCard(r){
  const isDue = routineIsDueToday(r);
  const done = routineDoneToday(r);
  const pointsPreview = done ? r.awardedPoints : routinePreviewReward(r);
  const names = weekdayShortNames();
  // names[] is Saturday-first (to match the day-grid's display order — see buildDayGrid() in
  // app-modals.js), but d here is the raw JS weekday integer (Sun=0..Sat=6). Indexing names[]
  // with d directly was off by one day (a Monday routine showed "Due Days: Sun") — go through
  // WEEK_DAY_ORDER.indexOf(d) to convert to the array's actual position, same as buildDayGrid()
  // already does for the picker's own button labels.
  const scheduleText = r.recurrence==='weekly'
    ? (r.schedule||[]).slice().sort((a,b)=>a-b).map(d=>names[WEEK_DAY_ORDER.indexOf(d)]).join(', ')
    : (r.schedule||[]).slice().sort((a,b)=>a-b).join(', ');

  const rState = routineState(r);
  let stateText;
  if(rState==='streak') stateText = `${streakEmoji(r)} ×${r.streak} · ${tr('Streak')}`;
  else if(rState==='neglect') stateText = `${neglectEmoji(r)} ×${r.neglect} · ${tr('Neglect')}`;
  else stateText = tr('Neutral');

  let secondaryText;
  if(!isDue){
    const next = nextScheduledDate(r, todayStr());
    secondaryText = next ? trNextDue(formatDueLabel(next, r.recurrence)) : tr('Not due yet');
  }

  // Same circular checkmark as daily routines. Only ever clickable while genuinely due today
  // (to mark done) or already done today (to undo) — fully inert outside that window, since
  // a missed weekly/monthly occurrence currently can't be made up later.
  let doneBtnHtml;
  if(done){
    doneBtnHtml = `<button class="btn-done done" data-routine="${r.id}">✓</button>`;
  } else if(isDue){
    doneBtnHtml = `<button class="btn-done" data-routine="${r.id}"></button>`;
  } else {
    doneBtnHtml = `<button class="btn-done" style="opacity:0.35; cursor:default;"></button>`;
  }

  const lines = [];
  if(r.time) lines.push(`<div class="item-sub">${timeChipHtml(r.time)}</div>`);
  if(r.description) lines.push(`<div class="item-sub" style="color:var(--ink);">${escapeHtml(r.description)}</div>`);
  lines.push(`<div class="item-sub">${stateText}${secondaryText?` · ${secondaryText}`:''}</div>`);
  lines.push(`<div class="item-sub">${trDueDates(scheduleText)}</div>`);
  lines.push(stepsToggleRowHtml('routine', r));

  return `
  <div class="card ${!isDue?'not-due':''}" data-card-routine="${r.id}" data-drag-item data-drag-id="${r.id}">
    <div class="row">
      <span class="drag-handle"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>
      ${emojiWithStepsBadgeHtml('emoji-list', r.emoji||ROUTINE_FALLBACK_EMOJI, r, 'routine')}
      <div style="flex:1;">
        <div class="item-name">${escapeHtml(r.name)}</div>
        ${lines.join('')}
      </div>
      <span class="pill ${pointsPreview<0?'negative':''}">${pointsPreview}</span>
      ${doneBtnHtml}
    </div>
    ${stepsBodyHtml('routine', r)}
    <div class="row" style="margin-top:8px;">
      <button class="link-danger" style="font-size:12px;" data-del-routine="${r.id}">${tr('Remove')}</button>
      <button class="btn-complete-task" data-edit-routine="${r.id}">${tr('Edit')}</button>
    </div>
  </div>`;
}
function penaltyInfoCardHtml(){
  const n = (v)=> curLang()==='fa' ? numFa(v) : v;
  return `
    <div class="penalty-info${routinesPenaltyInfoOpen?' open':''}" data-penalty-info="routines">
      <div class="penalty-info-head">
        <div class="penalty-info-title">${tr('Missing a routine costs points')}</div>
        <div class="penalty-info-toggle">${routinesPenaltyInfoOpen ? tr('less') : tr('more')}</div>
      </div>
      <div class="penalty-info-body">
        <div class="penalty-info-body-inner">
          <span style="color:var(--ink);">${tr('Daily')}</span> <span style="color:var(--rust);">-${n(ROUTINE_PENALTY.daily)}</span>
          &nbsp;·&nbsp;
          <span style="color:var(--ink);">${tr('Weekly')}</span> <span style="color:var(--rust);">-${n(ROUTINE_PENALTY.weekly)}</span>
          &nbsp;·&nbsp;
          <span style="color:var(--ink);">${tr('Monthly')}</span> <span style="color:var(--rust);">-${n(ROUTINE_PENALTY.monthly)}</span>
        </div>
      </div>
    </div>`;
}
function renderRoutines(main){
  const live = state.routines.filter(r=>!r.deleted);
  const daily = live.filter(r=>r.recurrence==='daily');
  const weekly = live.filter(r=>r.recurrence==='weekly');
  const monthly = live.filter(r=>r.recurrence==='monthly');
  let html = penaltyInfoCardHtml();
  function group(title, list, cardFn, listId){
    let h = `<div class="task-group-title">${title}</div>`;
    if(list.length===0){
      h += `<div class="card" style="text-align:center; color:var(--ink-soft); font-size:13px;">${tr('None yet.')}</div>`;
    } else {
      h += `<div id="${listId}">`;
      list.forEach(r=> h += cardFn(r));
      h += `</div>`;
    }
    return h;
  }
  if(live.length===0){
    html += `<div class="empty"><div class="big">🪴</div>${tr('Nothing here yet.')}<br>${tr('Tap + to add your first routine.')}</div>`;
  } else {
    html += group(tr('Daily'), daily, renderDailyRoutineCard, 'routinesDailyList');
    html += group(tr('Weekly'), weekly, renderRecurringRoutineCard, 'routinesWeeklyList');
    html += group(tr('Monthly'), monthly, renderRecurringRoutineCard, 'routinesMonthlyList');
  }
  main.innerHTML = html;
  main.querySelectorAll('[data-routine]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.routine;
      const h = state.routines.find(x=>x.id===id);
      if(routineHasSteps(h)){ toggleAllRoutineSteps(id); return; }
      if(routineDoneToday(h)) uncompleteRoutine(id); else completeRoutine(id);
    });
  });
  live.forEach(r=> wireStepsUi(main, 'routine', r));
  main.querySelectorAll('[data-del-routine]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(confirm(tr('Remove this routine? It will disappear from your active lists, but its past history stays exactly as it was.'))) deleteRoutine(btn.dataset.delRoutine);
    });
  });
  main.querySelectorAll('[data-edit-routine]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditRoutineModal(btn.dataset.editRoutine));
  });
  const penaltyInfo = main.querySelector('[data-penalty-info="routines"]');
  if(penaltyInfo) penaltyInfo.addEventListener('click', ()=>{
    routinesPenaltyInfoOpen = !routinesPenaltyInfoOpen;
    penaltyInfo.classList.toggle('open', routinesPenaltyInfoOpen);
    penaltyInfo.querySelector('.penalty-info-toggle').textContent = routinesPenaltyInfoOpen ? tr('less') : tr('more');
  });
  ['routinesDailyList','routinesWeeklyList','routinesMonthlyList'].forEach(listId=>{
    enableHoldDrag(`#${listId}`, '[data-drag-item]', '.drag-handle', 'routine', (newOrderIds)=>{
      state.routines = reorderMasterByVisibleOrder(state.routines, newOrderIds);
      saveState();
    });
  });
}
