// ---------- Home tab ----------
function ratingPillHtml(rating){
  const classMap = {
    'NOT GOOD':  'rating-notgood',
    'GOOD':      'rating-good',
    'GREAT!':    'rating-great',
    'AWESOME!!!':'rating-awesome',
  };
  if(!rating) return `<div class="rating-pill rating-none">${tr('no rating yet')}</div>`;
  return `<div class="rating-pill ${classMap[rating]||'rating-none'}">${tr(rating)}</div>`;
}

function renderToday(main){
  const t = todayStr();
  // Routines due today: all daily routines + weekly/monthly routines that are due/overdue/done-today.
  const dueRoutines = routinesForToday();
  // Upcoming (not-due-yet) tasks are hidden from Home entirely, so they shouldn't pad the tally
  // denominator either — unless completed early, in which case they're a real "done today" win.
  // A task completed on some earlier day must NOT count here at all (taskState() is computed from
  // dueDate alone, so it says nothing about completion — without the !completedDate guard, an old
  // completed task would keep inflating today's denominator forever).
  const tasksForTally = state.tasks.filter(task=> !task.deleted &&
    ((!task.completedDate && taskState(task)!=='upcoming') || taskDoneToday(task)));
  const tallyDone = dueRoutines.filter(h=>routineDoneToday(h)).length + tasksForTally.filter(task=>taskDoneToday(task)).length;
  const tallyTotal = dueRoutines.length + tasksForTally.length;
  const todayRating = getTodayRating();
  const todayScore = getScores().daily;
  let html = `
    <div class="score-hero">
      <div class="label">${tr("Today's score")}</div>
      <div class="score-hero-fraction">${scoreFractionHtml(todayScore.received, todayScore.base)}</div>
      ${ratingPillHtml(todayRating)}
      ${tallyTotal>0 ? `<div class="daily-tally">${trTallyLine(tallyDone, tallyTotal)}</div>` : ''}
    </div>
    <div class="section-label">${tr('Routines')}</div>`;
  if(dueRoutines.length===0){
    html += `<div class="card" style="text-align:center; color:var(--ink-soft); font-size:13px;">${tr('No routines due today.')}</div>`;
  } else {
    html += `<div id="todayRoutinesList">`;
    dueRoutines.forEach(h=>{
      const done = routineDoneToday(h);
      const pointsPreview = done ? h.awardedPoints : routinePreviewReward(h);
      const rState = routineState(h);
      const lines = [];
      if(rState==='streak'){
        lines.push(`<div class="item-sub"><span class="streak-chip" data-streak="${h.id}">${streakEmoji(h)} ×${h.streak}</span></div>`);
      } else if(rState==='neglect'){
        lines.push(`<div class="item-sub"><span class="neglect-chip" data-neglect="${h.id}">${neglectEmoji(h)} ×${h.neglect}</span></div>`);
      }
      if(h.time) lines.push(`<div class="item-sub">${timeChipHtml(h.time)}</div>`);
      if(h.description) lines.push(`<div class="item-sub">${escapeHtml(h.description)}</div>`);
      const subtitleHtml = lines.join('');
      html += `
      <div class="card row" data-card-routine="${h.id}" data-drag-item data-drag-id="${h.id}">
        <span class="drag-handle"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>
        <span class="emoji-today">${h.emoji||ROUTINE_FALLBACK_EMOJI}</span>
        <div style="flex:1;">
          <div class="item-name">${escapeHtml(h.name)}</div>
          ${subtitleHtml}
        </div>
        <span class="pill ${pointsPreview<0?'negative':''}">${pointsPreview}</span>
        <button class="btn-done ${done?'done':''}" data-routine="${h.id}">${done? '✓' : ''}</button>
      </div>`;
    });
    html += `</div>`;
  }
  // Upcoming (not-due-yet) tasks never appear on Home — only Due/Overdue are "active today".
  const openTasks = state.tasks.filter(task=>!task.deleted && !task.completedDate && taskState(task)!=='upcoming');
  const doneTasks = state.tasks.filter(task=>!task.deleted && taskDoneToday(task));
  html += `<div class="section-label">${tr('Open tasks')}</div>`;
  if(openTasks.length===0){
    html += `<div class="card" style="text-align:center; color:var(--ink-soft); font-size:13px;">${tr('No open tasks. Nice.')}</div>`;
  } else {
    html += `<div id="todayTasksList">`;
    openTasks.forEach(task=>{
      const val = taskDisplayValue(task);
      const st = taskState(task);
      const taskLines = [];
      if(task.time) taskLines.push(`<div class="item-sub">${timeChipHtml(task.time)}</div>`);
      if(task.description) taskLines.push(`<div class="item-sub">${escapeHtml(task.description)}</div>`);
      taskLines.push(`<div class="item-sub">${st==='overdue' ? trTaskOverdueShort() : trTaskDueTodayShort()}</div>`);
      html += `
      <div class="card row" data-card-task="${task.id}" data-drag-item data-drag-id="${task.id}">
        <span class="drag-handle"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>
        <span class="emoji-today">${task.emoji||TASK_DEFAULT_EMOJI}</span>
        <div style="flex:1;">
          <div class="item-name">${escapeHtml(task.name)}</div>
          ${taskLines.join('')}
        </div>
        <span class="pill ${val<0?'negative':''}">${val}</span>
        <button class="btn-done-square" data-complete-task-today="${task.id}">✓</button>
      </div>`;
    });
    html += `</div>`;
  }
  if(doneTasks.length>0){
    html += `<div class="section-label">${tr('Completed today')}</div>`;
    doneTasks.forEach(task=>{
      html += `
      <div class="card row task-row-done" data-card-task="${task.id}">
        <span class="emoji-today">${task.emoji||TASK_DEFAULT_EMOJI}</span>
        <div style="flex:1;">
          <div class="item-name">${escapeHtml(task.name)}</div>
        </div>
        <button class="btn-undo" data-undo-task="${task.id}">${tr('Undo')}</button>
      </div>`;
    });
  }
  main.innerHTML = html;
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
