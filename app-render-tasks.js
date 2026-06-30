// ---------- Tasks tab (one-time only — recurring tasks now live as Routines) ----------
function renderTaskCard(task){
  const val = taskDisplayValue(task);
  const days = daysBetween(task.createdDate, todayStr());
  const subInfo = `${trAddedLabel(days)} · ${trDecaysPerDay(task.decayRate)}`;
  return `
  <div class="card" data-card-task="${task.id}">
    <div class="row">
      <span class="emoji-list">${task.emoji||TASK_DEFAULT_EMOJI}</span>
      <div style="flex:1;">
        <div class="item-name">${escapeHtml(task.name)}</div>
        <div class="item-sub">${subInfo}</div>
        ${task.description ? `<div class="item-sub" style="margin-top:5px; color:var(--ink);">${escapeHtml(task.description)}</div>` : ''}
      </div>
      <span class="pill ${val<0?'negative':''}">${val>=0?'+':''}${val}</span>
    </div>
    <div class="row" style="margin-top:10px;">
      <div style="display:flex; gap:14px; align-items:center;">
        <button class="link-danger" style="font-size:12px;" data-del-task="${task.id}">${tr('Remove')}</button>
        <button class="link-danger" style="font-size:12px; color:var(--ink-soft); text-decoration:underline;" data-edit-task="${task.id}">${tr('Edit')}</button>
      </div>
      <button class="btn-complete-task" data-complete-task="${task.id}">${tr('Mark done')}</button>
    </div>
  </div>`;
}
function renderTasks(main){
  const open = state.tasks.filter(task=>!taskDoneToday(task));
  const done = state.tasks.filter(task=>taskDoneToday(task));
  let html = '';
  if(open.length===0 && done.length===0){
    html += `<div class="empty"><div class="big">📋</div>${tr('Nothing pending.')}<br>${tr('Tap + to add a task.')}</div>`;
  } else if(open.length===0){
    html += `<div class="card" style="text-align:center; color:var(--ink-soft); font-size:13px;">${tr('No open tasks.')}</div>`;
  } else {
    open.forEach(task=> html += renderTaskCard(task));
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
    btn.addEventListener('click', ()=> completeTask(btn.dataset.completeTask));
  });
  main.querySelectorAll('[data-undo-task]').forEach(btn=>{
    btn.addEventListener('click', ()=> uncompleteTask(btn.dataset.undoTask));
  });
  main.querySelectorAll('[data-del-task]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(confirm(tr('Remove this task without earning or losing points for it?'))) deleteTask(btn.dataset.delTask);
    });
  });
  main.querySelectorAll('[data-edit-task]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditTaskModal(btn.dataset.editTask));
  });
}
