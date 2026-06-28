// ---------- Routines tab (Daily / Weekly / Monthly grouping) ----------
function renderDailyRoutineCard(r){
  const done = routineDoneToday(r);
  const rState = routineState(r);
  let stateText;
  if(rState==='streak') stateText = `${streakEmoji(r)} ×${r.streak} · Streak`;
  else if(rState==='neglect') stateText = `${neglectEmoji(r)} ×${r.neglect} · Neglect`;
  else stateText = 'Neutral';
  return `
  <div class="card" data-card-routine="${r.id}">
    <div class="row">
      <span class="emoji-list">${r.emoji||ROUTINE_FALLBACK_EMOJI}</span>
      <div style="flex:1;">
        <div class="item-name">${escapeHtml(r.name)}</div>
        <div class="item-sub">${stateText}</div>
      </div>
      <span class="pill">+${r.basePoints}</span>
      <button class="btn-done ${done?'done':''}" data-routine="${r.id}">${done? '✓' : ''}</button>
    </div>
    <div class="row" style="margin-top:8px;">
      <button class="link-danger" style="font-size:12px;" data-del-routine="${r.id}">Remove</button>
      <button class="btn-complete-task" data-edit-routine="${r.id}">Edit</button>
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
  const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const scheduleText = r.recurrence==='weekly'
    ? (r.schedule||[]).slice().sort((a,b)=>a-b).map(d=>names[d]).join(', ')
    : (r.schedule||[]).slice().sort((a,b)=>a-b).join(', ');

  const rState = routineState(r);
  let stateText;
  if(rState==='streak') stateText = `${streakEmoji(r)} ×${r.streak} · Streak`;
  else if(rState==='neglect') stateText = `${neglectEmoji(r)} ×${r.neglect} · Neglect`;
  else stateText = 'Neutral';

  let secondaryText;
  if(!isDue){
    const next = nextScheduledDate(r, todayStr());
    secondaryText = next ? `Next due: ${formatDueLabel(next, r.recurrence)}` : 'Not due yet';
  } else {
    secondaryText = `-${Math.abs(routinePreviewPenalty(r))} Penalty (If missed)`;
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

  return `
  <div class="card ${!isDue?'not-due':''}" data-card-routine="${r.id}">
    <div class="row">
      <span class="emoji-list">${r.emoji||ROUTINE_FALLBACK_EMOJI}</span>
      <div style="flex:1;">
        <div class="item-name">${escapeHtml(r.name)}</div>
        <div class="item-sub">${stateText}${secondaryText?` · ${secondaryText}`:''}</div>
        <div class="item-sub">Due dates: ${scheduleText}</div>
        ${r.description ? `<div class="item-sub" style="margin-top:5px; color:var(--ink);">${escapeHtml(r.description)}</div>` : ''}
      </div>
      <span class="pill ${pointsPreview<0?'negative':''}">${pointsPreview>=0?'+':''}${pointsPreview}</span>
      ${doneBtnHtml}
    </div>
    <div class="row" style="margin-top:8px;">
      <button class="link-danger" style="font-size:12px;" data-del-routine="${r.id}">Remove</button>
      <button class="btn-complete-task" data-edit-routine="${r.id}">Edit</button>
    </div>
  </div>`;
}
function renderRoutines(main){
  const daily = state.routines.filter(r=>r.recurrence==='daily');
  const weekly = state.routines.filter(r=>r.recurrence==='weekly');
  const monthly = state.routines.filter(r=>r.recurrence==='monthly');
  let html = '';
  function group(title, list, cardFn){
    let h = `<div class="task-group-title">${title}</div>`;
    if(list.length===0){
      h += `<div class="card" style="text-align:center; color:var(--ink-soft); font-size:13px;">None yet.</div>`;
    } else {
      list.forEach(r=> h += cardFn(r));
    }
    return h;
  }
  if(state.routines.length===0){
    html += `<div class="empty"><div class="big">🪴</div>Nothing here yet.<br>Tap + to add your first routine.</div>`;
  } else {
    html += group('Daily', daily, renderDailyRoutineCard);
    html += group('Weekly', weekly, renderRecurringRoutineCard);
    html += group('Monthly', monthly, renderRecurringRoutineCard);
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
      if(confirm('Remove this routine? Its consistency history will be lost.')) deleteRoutine(btn.dataset.delRoutine);
    });
  });
  main.querySelectorAll('[data-edit-routine]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditRoutineModal(btn.dataset.editRoutine));
  });
}
