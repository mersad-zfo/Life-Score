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
  return `
  <div class="card" data-card-routine="${r.id}">
    <div class="row">
      <span class="emoji-list">${r.emoji||ROUTINE_FALLBACK_EMOJI}</span>
      <div style="flex:1;">
        <div class="item-name">${escapeHtml(r.name)}</div>
        ${lines.join('')}
      </div>
      <span class="pill">${r.basePoints}</span>
      <button class="btn-done ${done?'done':''}" data-routine="${r.id}">${done? '✓' : ''}</button>
    </div>
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
  const scheduleText = r.recurrence==='weekly'
    ? (r.schedule||[]).slice().sort((a,b)=>a-b).map(d=>names[d]).join(', ')
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
  } else {
    secondaryText = trPenaltyIfMissed(routinePreviewPenalty(r));
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

  return `
  <div class="card ${!isDue?'not-due':''}" data-card-routine="${r.id}">
    <div class="row">
      <span class="emoji-list">${r.emoji||ROUTINE_FALLBACK_EMOJI}</span>
      <div style="flex:1;">
        <div class="item-name">${escapeHtml(r.name)}</div>
        ${lines.join('')}
      </div>
      <span class="pill ${pointsPreview<0?'negative':''}">${pointsPreview}</span>
      ${doneBtnHtml}
    </div>
    <div class="row" style="margin-top:8px;">
      <button class="link-danger" style="font-size:12px;" data-del-routine="${r.id}">${tr('Remove')}</button>
      <button class="btn-complete-task" data-edit-routine="${r.id}">${tr('Edit')}</button>
    </div>
  </div>`;
}
function renderRoutines(main){
  const live = state.routines.filter(r=>!r.deleted);
  const daily = live.filter(r=>r.recurrence==='daily');
  const weekly = live.filter(r=>r.recurrence==='weekly');
  const monthly = live.filter(r=>r.recurrence==='monthly');
  let html = '';
  function group(title, list, cardFn){
    let h = `<div class="task-group-title">${title}</div>`;
    if(list.length===0){
      h += `<div class="card" style="text-align:center; color:var(--ink-soft); font-size:13px;">${tr('None yet.')}</div>`;
    } else {
      list.forEach(r=> h += cardFn(r));
    }
    return h;
  }
  if(live.length===0){
    html += `<div class="empty"><div class="big">🪴</div>${tr('Nothing here yet.')}<br>${tr('Tap + to add your first routine.')}</div>`;
  } else {
    html += group(tr('Daily'), daily, renderDailyRoutineCard);
    html += group(tr('Weekly'), weekly, renderRecurringRoutineCard);
    html += group(tr('Monthly'), monthly, renderRecurringRoutineCard);
  }
  main.innerHTML = html;
  main.querySelectorAll('[data-routine]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.routine;
      const h = state.routines.find(x=>x.id===id);
      if(routineDoneToday(h)) uncompleteRoutine(id); else completeRoutine(id);
    });
  });
  main.querySelectorAll('[data-del-routine]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(confirm(tr('Remove this routine? It will disappear from your active lists, but its past history stays exactly as it was.'))) deleteRoutine(btn.dataset.delRoutine);
    });
  });
  main.querySelectorAll('[data-edit-routine]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditRoutineModal(btn.dataset.editRoutine));
  });
}
