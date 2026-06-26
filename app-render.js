// ---------- Rendering ----------
function renderMain(){
  const main = document.getElementById('main');
  document.getElementById('fab').style.display = (currentTab==='routines'||currentTab==='tasks') ? 'flex' : 'none';
  if(currentTab==='today') return renderToday(main);
  if(currentTab==='routines') return renderRoutines(main);
  if(currentTab==='tasks') return renderTasks(main);
  if(currentTab==='score') return renderScore(main);
  if(currentTab==='settings') return renderSettings(main);
}

function renderToday(main){
  const t = todayStr();
  const todays = state.log.filter(l=>l.date===t);
  const total = todays.reduce((s,l)=>s+l.points,0);
  const dueTasks = state.tasks.filter(task=>{
    if(!isRecurring(task)) return true;
    if(task.lastCompletedDate === todayStr()) return true; // completed today — show in Completed Today
    const status = recurringStatus(task);
    return status==='due' || status==='overdue';
  });
  const tallyDone = state.routines.filter(h=>routineDoneToday(h)).length + dueTasks.filter(task=>taskDoneToday(task)).length;
  const tallyTotal = state.routines.length + dueTasks.length;
  let html = `
    <div class="score-hero">
      <div class="label">Today's score</div>
      <div class="number ${total<0?'negative':''}">${total>0?'+':''}${total}</div>
      ${tallyTotal>0 ? `<div class="daily-tally">${tallyDone} of ${tallyTotal} done today</div>` : ''}
    </div>
    <div class="section-label">Routines</div>`;
  if(state.routines.length===0){
    html += `<div class="card" style="text-align:center; color:var(--ink-soft); font-size:13px;">No routines yet. Add one from the Routines tab.</div>`;
  } else {
    html += `<div id="todayRoutinesList">`;
    state.routines.forEach(h=>{
      const done = routineDoneToday(h);
      const pointsPreview = done ? h.awardedPoints : routinePreviewReward(h);
      const rState = routineState(h);
      let subtitleHtml = '';
      if(rState==='streak'){
        subtitleHtml = `<div class="item-sub"><span class="streak-chip" data-streak="${h.id}">x${h.streak}🔥</span></div>`;
      } else if(rState==='neglect'){
        subtitleHtml = `<div class="item-sub"><span class="neglect-chip" data-neglect="${h.id}">x${h.neglect}⚠️</span></div>`;
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
  const openTasks = dueTasks.filter(task=>!taskDoneToday(task));
  const doneTasks = dueTasks.filter(task=>taskDoneToday(task));
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
  const allClear = (state.routines.length>0 || state.tasks.length>0) &&
    state.routines.every(h=>routineDoneToday(h)) &&
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
    state.routines = newOrderIds.map(id=> state.routines.find(h=>h.id===id));
    saveState();
  });
  enableHoldDrag('#todayTasksList', '[data-drag-item]', '.drag-handle', 'task', (newOrderIds)=>{
    state.tasks = reorderMasterByVisibleOrder(state.tasks, newOrderIds);
    saveState();
  });
}

function renderRoutines(main){
  let html = '';
  if(state.routines.length===0){
    html += `<div class="empty"><div class="big">🪴</div>Nothing here yet.<br>Tap + to add your first routine.</div>`;
  } else {
    state.routines.forEach((h, idx)=>{
      const done = routineDoneToday(h);
      const rState = routineState(h);
      let statusText;
      if(rState==='streak') statusText = `🔥 x${h.streak} streak`;
      else if(rState==='neglect') statusText = `⚠️ x${h.neglect} neglect`;
      else statusText = 'Neutral';
      html += `
      <div class="card" data-card-routine="${h.id}">
        <div class="row">
          <span class="emoji-list">${h.emoji||ROUTINE_FALLBACK_EMOJI}</span>
          <div style="flex:1;">
            <div class="item-name">${escapeHtml(h.name)}</div>
            <div class="item-sub">${statusText} · base ${h.basePoints} pts</div>
          </div>
          <button class="btn-done ${done?'done':''}" data-routine="${h.id}">${done? '✓' : ''}</button>
        </div>
        <div class="row" style="margin-top:8px;">
          <button class="link-danger" style="font-size:12px;" data-del-routine="${h.id}">Remove</button>
          <button class="btn-complete-task" data-edit-routine="${h.id}">Edit</button>
        </div>
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
  main.querySelectorAll('[data-del-routine]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(confirm('Remove this routine? Its streak history will be lost.')) deleteRoutine(btn.dataset.delRoutine);
    });
  });
  main.querySelectorAll('[data-edit-routine]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditRoutineModal(btn.dataset.editRoutine));
  });
}

function renderTaskCard(task, opts){
  const type = taskRecurrenceType(task);
  const status = isRecurring(task) ? recurringStatus(task) : null;
  const isNotDue = status==='not_due';
  const isOverdue = status==='overdue';
  const isDormant = status==='done_this_cycle' && task.lastCompletedDate !== todayStr();
  const val = taskDisplayValue(task);
  const days = daysBetween(task.createdDate, todayStr());
  let subInfo = '';
  if(type==='once'){
    subInfo = `${days===0?'added today':`added ${days} day${days===1?'':'s'} ago`} · decays ${task.decayRate}/day`;
  } else if(type==='weekly'){
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    subInfo = `Weekly · ${(task.schedule||[]).slice().sort().map(d=>names[d]).join(', ')} · -${Math.abs(task.penaltyValue||0)}/day if missed`;
  } else if(type==='monthly'){
    subInfo = `Monthly · day${(task.schedule||[]).length>1?'s':''} ${(task.schedule||[]).slice().sort((a,b)=>a-b).join(', ')} · -${Math.abs(task.penaltyValue||0)}/day if missed`;
  }
  let statusLine = subInfo;
  if(isNotDue){
    const next = nextScheduledDate(task, todayStr());
    statusLine = next ? `Due ${formatDueLabel(next, type)}` : 'Not due yet';
  } else if(isDormant){
    const next = nextScheduledDate(task, task.lastCompletedDate);
    statusLine = next ? `Next due: ${formatDueLabel(next, type)}` : 'Done for now';
  }
  return `
  <div class="card ${isNotDue||isDormant?'not-due':''}" data-card-task="${task.id}">
    <div class="row">
      <span class="emoji-list">${task.emoji||TASK_DEFAULT_EMOJI}</span>
      <div style="flex:1;">
        <div class="item-name">${escapeHtml(task.name)}${isOverdue?'<span class="badge-overdue">Overdue</span>':''}</div>
        <div class="item-sub">${statusLine}</div>
        ${task.description ? `<div class="item-sub" style="margin-top:5px; color:var(--ink);">${escapeHtml(task.description)}</div>` : ''}
      </div>
      <span class="pill ${val<0?'negative':''}">${val>=0?'+':''}${val}</span>
    </div>
    <div class="row" style="margin-top:10px;">
      <div style="display:flex; gap:14px; align-items:center;">
        <button class="link-danger" style="font-size:12px;" data-del-task="${task.id}">Remove</button>
        <button class="link-danger" style="font-size:12px; color:var(--ink-soft); text-decoration:underline;" data-edit-task="${task.id}">Edit</button>
      </div>
      ${(isNotDue||isDormant) ? '' : `<button class="btn-complete-task" data-complete-task="${task.id}">Mark done</button>`}
    </div>
  </div>`;
}

function renderTasks(main){
  const allOpen = state.tasks.filter(task=>!taskDoneToday(task));
  const doneTasks = state.tasks.filter(task=>taskDoneToday(task));

  const onceTasks = allOpen.filter(t=>taskRecurrenceType(t)==='once');
  const weeklyTasks = allOpen.filter(t=>taskRecurrenceType(t)==='weekly');
  const monthlyTasks = allOpen.filter(t=>taskRecurrenceType(t)==='monthly');

  let html = '';
  function renderGroup(title, list){
    let h = `<div class="task-group-title">${title}</div>`;
    if(list.length===0){
      h += `<div class="card" style="text-align:center; color:var(--ink-soft); font-size:13px;">None yet.</div>`;
    } else {
      list.forEach((task, idx)=>{
        h += renderTaskCard(task, {});
      });
    }
    return h;
  }

  if(allOpen.length===0 && doneTasks.length===0){
    html += `<div class="empty"><div class="big">📋</div>Nothing pending.<br>Tap + to add a task.</div>`;
  } else {
    html += renderGroup('One-time', onceTasks);
    html += renderGroup('Weekly', weeklyTasks);
    html += renderGroup('Monthly', monthlyTasks);
  }

  if(doneTasks.length>0){
    html += `<div class="section-label">Completed today</div>`;
    doneTasks.forEach(task=>{
      html += `
      <div class="card task-row-done" data-card-task="${task.id}">
        <div class="row">
          <span class="emoji-list">${task.emoji||TASK_DEFAULT_EMOJI}</span>
          <div style="flex:1;">
            <div class="item-name">${escapeHtml(task.name)}</div>
            <div class="item-sub">${task.awardedPoints>=0?'+':''}${task.awardedPoints} earned</div>
          </div>
          <button class="btn-undo" data-undo-task="${task.id}">Undo</button>
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
      if(confirm('Remove this task without earning or losing points for it?')) deleteTask(btn.dataset.delTask);
    });
  });
  main.querySelectorAll('[data-edit-task]').forEach(btn=>{
    btn.addEventListener('click', ()=> openEditTaskModal(btn.dataset.editTask));
  });
}

function renderScore(main){
  const s = getScores();
  let html = `
    <div class="score-hero">
      <div class="label">All-time score</div>
      <div class="number ${s.allTime<0?'negative':''}">${s.allTime>0?'+':''}${s.allTime}</div>
    </div>
    <div class="score-grid">
      <div class="score-tile">
        <div class="t-label">Today</div>
        <div class="t-value ${s.daily<0?'negative':''}">${s.daily>0?'+':''}${s.daily}</div>
      </div>
      <div class="score-tile">
        <div class="t-label">This week</div>
        <div class="t-value ${s.weekly<0?'negative':''}">${s.weekly>0?'+':''}${s.weekly}</div>
      </div>
      <div class="score-tile">
        <div class="t-label">This month</div>
        <div class="t-value ${s.monthly<0?'negative':''}">${s.monthly>0?'+':''}${s.monthly}</div>
      </div>
      <div class="score-tile">
        <div class="t-label">Routines tracked</div>
        <div class="t-value">${state.routines.length}</div>
      </div>
    </div>
  `;
  main.innerHTML = html;
}

function renderSettings(main){
  const theme = state.settings.theme;
  const sound = state.settings.sound;
  const isLoggedIn = state.profile && state.session.loggedIn;
  let html = `
    <div class="back-row">
      <button id="backFromSettings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        Back
      </button>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Account</div>
      ${isLoggedIn ? `
        <div class="account-card">
          <div class="acc-name">${escapeHtml(state.profile.name)}</div>
          <div class="acc-email">${escapeHtml(state.profile.email||'')}</div>
          <div class="settings-btn-row">
            <div class="toggle-row" style="cursor:pointer;" id="backupBtn">
              <div>
                <div class="item-name">Backup</div>
                ${backupTapped ? `<div class="item-sub">Saved to your Downloads folder with the name "life-score-backup"</div>` : ''}
              </div>
            </div>
            <div class="toggle-row" style="cursor:pointer;" id="restoreBtn">
              <div>
                <div class="item-name">Restore</div>
                ${restoreTapped ? `<div class="item-sub">Look for "life-score-backup.json" in your Downloads folder</div>` : ''}
              </div>
            </div>
            <button class="settings-btn danger-text" id="logoutBtn">Log out</button>
          </div>
        </div>
      ` : `
        <div class="item-sub" style="margin-bottom:10px;">Log in to back up your data to this device, or restore it on another.</div>
        <button class="settings-btn" id="loginBtn">${state.profile ? 'Log back in' : 'Sign up / Log in'}</button>
      `}
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Appearance</div>
      <div class="seg-control">
        <button data-theme="system" class="${theme==='system'?'active':''}">System</button>
        <button data-theme="light" class="${theme==='light'?'active':''}">Light</button>
        <button data-theme="dark" class="${theme==='dark'?'active':''}">Dark</button>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Sound</div>
      <div class="toggle-row">
        <div>
          <div class="item-name">Sound on completion</div>
        </div>
        <div class="switch ${sound?'on':''}" id="soundSwitch"><div class="knob"></div></div>
      </div>
    </div>


    <div class="settings-group">
      <div class="settings-group-title">Danger zone</div>
      <div class="settings-btn-row">
        <button class="settings-btn danger-text" id="resetBtn">Reset everything</button>
        ${state.profile ? `<button class="settings-btn danger-text" id="deleteAccountBtn">Delete account</button>` : ''}
      </div>
    </div>

    <div class="credit-line">Developed by Mersad</div>
  `;
  main.innerHTML = html;

  document.getElementById('backFromSettings').addEventListener('click', ()=>{
    backupTapped = false;
    restoreTapped = false;
    setTab(previousTab);
  });
  main.querySelectorAll('[data-theme]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.settings.theme = btn.dataset.theme;
      applyTheme();
      saveState();
      renderSettings(main);
    });
  });
  document.getElementById('soundSwitch').addEventListener('click', ()=>{
    state.settings.sound = !state.settings.sound;
    saveState();
    renderSettings(main);
  });
  document.getElementById('resetBtn').addEventListener('click', ()=> openResetModal());
  if(isLoggedIn){
    document.getElementById('backupBtn').addEventListener('click', ()=>{
      backupData();
      backupTapped = true;
      renderSettings(main);
    });
    document.getElementById('restoreBtn').addEventListener('click', ()=>{
      restoreTapped = true;
      renderSettings(main);
      restoreData();
    });
    document.getElementById('logoutBtn').addEventListener('click', ()=>{
      if(confirm('Log out? Your profile stays saved on this device — you can log back in anytime. Your routines, tasks, and scores are unaffected either way.')){
        state.session.loggedIn = false;
        saveState();
        renderSettings(main);
        showToast('Logged out');
      }
    });
  } else {
    document.getElementById('loginBtn').addEventListener('click', openLoginModal);
  }
  if(state.profile){
    document.getElementById('deleteAccountBtn').addEventListener('click', ()=>{
      if(confirm('Permanently delete this profile (name and email) from this device? Your routines, tasks, and scores are not affected — only the account itself is removed.')){
        state.profile = null;
        state.session.loggedIn = false;
        saveState();
        renderSettings(main);
        showToast('Account deleted');
      }
    });
  }
}

function openLoginModal(){
  const existing = state.profile;
  const m = openModal(`
    <h3>${existing ? 'Log back in' : 'Sign up / Log in'}</h3>
    <div class="field" style="color:var(--ink-soft); font-size:13px; line-height:1.5; margin-bottom:16px;">
      This just creates a local profile on this device for now — no account is created on a server, and nothing is verified. It's here so your name can be used in the app, and so it's ready for real accounts in a future version.
    </div>
    <div class="field"><label>Name</label><input id="loginName" type="text" placeholder="Your name" value="${existing ? escapeHtml(existing.name) : ''}" /></div>
    <div class="field"><label>Email</label><input id="loginEmail" type="email" placeholder="you@example.com" value="${existing ? escapeHtml(existing.email||'') : ''}" /></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="loginCancel">Cancel</button>
      <button class="btn-primary" id="loginSave">${existing ? 'Log in' : 'Save'}</button>
    </div>
  `);
  m.querySelector('#loginCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#loginSave').addEventListener('click', ()=>{
    const name = m.querySelector('#loginName').value.trim();
    const email = m.querySelector('#loginEmail').value.trim();
    if(!name){ showToast('Enter a name'); return; }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(email && !emailPattern.test(email)){
      showToast('That email doesn\'t look right');
      return;
    }
    state.profile = { name, email };
    state.session.loggedIn = true;
    saveState();
    m.remove();
    renderMain();
    showToast(`Welcome, ${name}`);
  });
  setTimeout(()=>m.querySelector('#loginName').focus(), 100);
}

function backupData(){
  try{
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'life-score-backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }catch(e){
    showToast('Backup failed — try again');
  }
}

function restoreData(){
  document.getElementById('restoreFileInput').click();
}

document.getElementById('restoreFileInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const parsed = JSON.parse(reader.result);
      if(!parsed.routines || !parsed.tasks || !parsed.log){
        showToast('That file doesn\'t look like a Life Score backup');
        return;
      }
      const currentProfile = state.profile;
      state = parsed;
      ensureStateShape();
      state.profile = currentProfile;
      pruneStaleCompletedTasks();
      applyTheme();
      saveState();
      renderMain();
      showToast('Data restored');
    }catch(err){
      showToast('Could not read that file');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
