// ---------- Tasks tab (one-time only — recurring tasks now live as Routines) ----------
function renderTaskCard(task, draggable){
  const val = taskDisplayValue(task);
  const st = taskState(task);
  const lines = [];
  if(task.time) lines.push(`<div class="item-sub">${timeChipHtml(task.time)}</div>`);
  if(task.description) lines.push(`<div class="item-sub" style="color:var(--ink);">${escapeHtml(task.description)}</div>`);
  if(st==='upcoming'){
    lines.push(`<div class="item-sub">${trTaskDueDateLine(task.dueDate)}</div>`);
  } else if(st==='due'){
    lines.push(`<div class="item-sub">${trTaskDueTodayShort()}</div>`);
  } else {
    lines.push(`<div class="item-sub">${trTaskOverdueShort()}</div>`);
    lines.push(`<div class="item-sub" style="color:var(--rust);">${trTaskCurrentDecayLine(taskDecayAmount(task))}</div>`);
  }
  lines.push(stepsToggleRowHtml('task', task));
  const dragAttrs = draggable ? `data-drag-item data-drag-id="${task.id}"` : '';
  const dragHandle = draggable ? `<span class="drag-handle"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>` : '';
  return `
  <div class="card ${st==='upcoming'?'task-upcoming':''}" data-card-task="${task.id}" ${dragAttrs}>
    <div class="row">
      ${dragHandle}
      ${emojiWithStepsBadgeHtml('emoji-list', task.emoji||TASK_DEFAULT_EMOJI, task, 'task')}
      <div style="flex:1;">
        <div class="item-name">${escapeHtml(task.name)}</div>
        ${lines.join('')}
      </div>
      <span class="pill ${val<0?'negative':''}">${val}</span>
      <button class="btn-done-square" data-complete-task="${task.id}">✓</button>
    </div>
    ${stepsBodyHtml('task', task)}
    <div class="row" style="margin-top:10px;">
      <button class="link-danger" style="font-size:12px;" data-del-task="${task.id}">${tr('Remove')}</button>
      <button class="btn-complete-task" data-edit-task="${task.id}">${tr('Edit')}</button>
    </div>
  </div>`;
}
function taskPenaltyInfoCardHtml(){
  const n = curLang()==='fa' ? numFa(TASK_DECAY_RATE) : TASK_DECAY_RATE;
  return `
    <div class="penalty-info${tasksPenaltyInfoOpen?' open':''}" data-penalty-info="tasks">
      <div class="penalty-info-head">
        <div class="penalty-info-title">${tr('Missing a task will decay its points')}</div>
        <div class="penalty-info-toggle">${tasksPenaltyInfoOpen ? tr('less') : tr('more')}</div>
      </div>
      <div class="penalty-info-body">
        <div class="penalty-info-body-inner">
          <span style="color:var(--rust);">-${n}</span> <span style="color:var(--ink);">${tr('points per missed day')}</span>
        </div>
      </div>
    </div>`;
}
function renderTasks(main){
  const openAll = state.tasks.filter(task=>!task.deleted && !task.completedDate);
  const done = state.tasks.filter(task=>!task.deleted && taskDoneToday(task));
  // Active (Due + Overdue) keeps the existing manual order (driven by Home tab drag-reorder).
  // Upcoming (Not due yet) is a separate group at the end, sorted soonest-due-first — it's never
  // shown on Home, so there's nothing to drag it against; date order is the meaningful order.
  const active = openAll.filter(task=> taskState(task)!=='upcoming');
  const upcoming = openAll.filter(task=> taskState(task)==='upcoming')
                          .slice().sort((a,b)=> a.dueDate.localeCompare(b.dueDate));
  let html = taskPenaltyInfoCardHtml();
  if(openAll.length===0 && done.length===0){
    html += `<div class="empty"><div class="big">📋</div>${tr('Nothing pending.')}<br>${tr('Tap + to add a task.')}</div>`;
  } else {
    if(active.length>0){
      html += `<div id="tasksActiveList">`;
      active.forEach(task=> html += renderTaskCard(task, true));
      html += `</div>`;
    } else if(upcoming.length===0){
      html += `<div class="card" style="text-align:center; color:var(--ink-soft); font-size:13px;">${tr('No open tasks.')}</div>`;
    }
    if(upcoming.length>0){
      html += `<div class="section-label">${trUpcomingSectionLabel()}</div>`;
      upcoming.forEach(task=> html += renderTaskCard(task, false));
    }
  }
  if(done.length>0){
    html += `<div class="section-label">${tr('Completed today')}</div>`;
    done.forEach(task=>{
      html += `
      <div class="card task-row-done" data-card-task="${task.id}">
        <div class="row">
          <span class="emoji-list">${task.emoji||TASK_DEFAULT_EMOJI}</span>
          <div style="flex:1;">
            <div class="item-name">${escapeHtml(task.name)}</div>
            <div class="item-sub">${trEarned(task.awardedPoints)}</div>
          </div>
          <button class="btn-undo" data-undo-task="${task.id}">${tr('Undo')}</button>
        </div>
      </div>`;
    });
  }
  main.innerHTML = html;
  main.querySelectorAll('[data-complete-task]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.completeTask;
      const task = state.tasks.find(x=>x.id===id);
      if(task && taskHasSteps(task)){ toggleAllTaskSteps(id); return; }
      if(task && taskState(task)==='upcoming'){
        if(!confirm(tr("This task isn't due yet — mark it as done early?"))) return;
      }
      completeTask(id);
    });
  });
  openAll.forEach(task=> wireStepsUi(main, 'task', task));
  main.querySelectorAll('[data-undo-task]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.undoTask;
      const task = state.tasks.find(x=>x.id===id);
      // A stepped task's completion may include steps auto-checked just now by the complete
      // button above (dispatched to toggleAllTaskSteps) — plain uncompleteTask() only removes the
      // task-level log entry and never touches those individual task_step entries, so undo would
      // silently leave today's steps checked (and their points still counted) while the task
      // itself went back to "not done". toggleAllTaskSteps() correctly unchecks every step done
      // TODAY (leaving any earlier-day locked steps alone) and, via uncompleteTaskStep(), resets
      // completedDate/awardedPoints once the last today-step comes off — same completion path,
      // used in reverse.
      if(task && taskHasSteps(task)){ toggleAllTaskSteps(id); return; }
      uncompleteTask(id);
    });
  });
  main.querySelectorAll('[data-del-task]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(confirm(tr('Remove this task without earning or losing points for it?'))) deleteTask(btn.dataset.delTask);
    });
  });
  main.querySelectorAll('[data-edit-task]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditTaskModal(btn.dataset.editTask));
  });
  const penaltyInfo = main.querySelector('[data-penalty-info="tasks"]');
  if(penaltyInfo) penaltyInfo.addEventListener('click', ()=>{
    tasksPenaltyInfoOpen = !tasksPenaltyInfoOpen;
    penaltyInfo.classList.toggle('open', tasksPenaltyInfoOpen);
    penaltyInfo.querySelector('.penalty-info-toggle').textContent = tasksPenaltyInfoOpen ? tr('less') : tr('more');
  });
  enableHoldDrag('#tasksActiveList', '[data-drag-item]', '.drag-handle', 'task', (newOrderIds)=>{
    state.tasks = reorderMasterByVisibleOrder(state.tasks, newOrderIds);
    saveState();
  });
}
