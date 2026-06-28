// ---------- Home tab ----------
function renderToday(main){
  const t = todayStr();
  const todays = state.log.filter(l=>l.date===t);
  const total = todays.reduce((s,l)=>s+l.points,0);
  // Routines due today: all daily routines + weekly/monthly routines that are due/overdue/done-today.
  const dueRoutines = routinesForToday();
  const tallyDone = dueRoutines.filter(h=>routineDoneToday(h)).length + state.tasks.filter(task=>taskDoneToday(task)).length;
  const tallyTotal = dueRoutines.length + state.tasks.length;
  let html = `
    <div class="score-hero">
      <div class="label">Today's score</div>
      <div class="number ${total<0?'negative':''}">${total>0?'+':''}${total}</div>
      ${tallyTotal>0 ? `<div class="daily-tally">${tallyDone} of ${tallyTotal} done today</div>` : ''}
    </div>
    <div class="section-label">Routines</div>`;
  if(dueRoutines.length===0){
    html += `<div class="card" style="text-align:center; color:var(--ink-soft); font-size:13px;">No routines due today.</div>`;
  } else {
    html += `<div id="todayRoutinesList">`;
    dueRoutines.forEach(h=>{
      const done = routineDoneToday(h);
      const pointsPreview = done ? h.awardedPoints : routinePreviewReward(h);
      const rState = routineState(h);
      let subtitleHtml = '';
      if(rState==='streak'){
        subtitleHtml = `<div class="item-sub"><span class="streak-chip" data-streak="${h.id}">${streakEmoji(h)} ×${h.streak}</span></div>`;
      } else if(rState==='neglect'){
        subtitleHtml = `<div class="item-sub"><span class="neglect-chip" data-neglect="${h.id}">${neglectEmoji(h)} ×${h.neglect}</span></div>`;
      }
      html += `
      <div class="card row" data-card-routine="${h.id}" data-drag-item data-drag-id="${h.id}">
        <span class="drag-handle"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>
        <span class="emoji-today">${h.emoji||ROUTINE_FALLBACK_EMOJI}</span>
        <div style="flex:1;">
          <div class="item-name">${escapeHtml(h.name)}</div>
          ${subtitleHtml}
        </div>
        <span class="pill ${pointsPreview<0?'negative':''}">${pointsPreview>=0?'+':''}${pointsPreview}</span>
        <button class="btn-done ${done?'done':''}" data-routine="${h.id}">${done? '✓' : ''}</button>
      </div>`;
    });
    html += `</div>`;
  }
  const openTasks = state.tasks.filter(task=>!taskDoneToday(task));
  const doneTasks = state.tasks.filter(task=>taskDoneToday(task));
  html += `<div class="section-label">Open tasks</div>`;
  if(openTasks.length===0){
    html += `<div class="card" style="text-align:center; color:var(--ink-soft); font-size:13px;">No open tasks. Nice.</div>`;
  } else {
    html += `<div id="todayTasksList">`;
    openTasks.forEach(task=>{
      const val = taskDisplayValue(task);
      html += `
      <div class="card row" data-card-task="${task.id}" data-drag-item data-drag-id="${task.id}">
        <span class="drag-handle"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>
        <span class="emoji-today">${task.emoji||TASK_DEFAULT_EMOJI}</span>
        <div style="flex:1;">
          <div class="item-name">${escapeHtml(task.name)}</div>
          ${task.description ? `<div class="item-sub">${escapeHtml(task.description)}</div>` : ''}
        </div>
        <span class="pill ${val<0?'negative':''}">${val>=0?'+':''}${val}</span>
        <button class="btn-done-square" data-complete-task-today="${task.id}">✓</button>
      </div>`;
    });
    html += `</div>`;
  }
  if(doneTasks.length>0){
    html += `<div class="section-label">Completed today</div>`;
    doneTasks.forEach(task=>{
      html += `
      <div class="card row task-row-done" data-card-task="${task.id}">
        <span class="emoji-today">${task.emoji||TASK_DEFAULT_EMOJI}</span>
        <div style="flex:1;">
          <div class="item-name">${escapeHtml(task.name)}</div>
        </div>
        <button class="btn-undo" data-undo-task="${task.id}">Undo</button>
      </div>`;
    });
  }
  main.innerHTML = html;
  const allClear = (dueRoutines.length>0 || state.tasks.length>0) &&
    dueRoutines.every(h=>routineDoneToday(h)) &&
    openTasks.length===0;
  if(allClear && !allClearDismissed){
    const overlay = document.createElement('div');
    overlay.className = 'all-clear-overlay';
    overlay.innerHTML = `
      <div class="big-emoji">🌿</div>
      <div class="msg">All clear today</div>
      <div class="hint">Tap anywhere to keep going</div>
    `;
    overlay.addEventListener('click', ()=>{
      allClearDismissed = true;
      overlay.remove();
    });
    main.appendChild(overlay);
  }
  main.querySelectorAll('[data-routine]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.routine;
      const h = state.routines.find(x=>x.id===id);
      if(routineDoneToday(h)) uncompleteRoutine(id); else completeRoutine(id);
    });
  });
  main.querySelectorAll('[data-undo-task]').forEach(btn=>{
    btn.addEventListener('click', ()=> uncompleteTask(btn.dataset.undoTask));
  });
  main.querySelectorAll('[data-complete-task-today]').forEach(btn=>{
    btn.addEventListener('click', ()=> completeTask(btn.dataset.completeTaskToday));
  });
  enableHoldDrag('#todayRoutinesList', '[data-drag-item]', '.drag-handle', 'routine', (newOrderIds)=>{
    state.routines = reorderMasterByVisibleOrder(state.routines, newOrderIds);
    saveState();
  });
  enableHoldDrag('#todayTasksList', '[data-drag-item]', '.drag-handle', 'task', (newOrderIds)=>{
    state.tasks = reorderMasterByVisibleOrder(state.tasks, newOrderIds);
    saveState();
  });
}
