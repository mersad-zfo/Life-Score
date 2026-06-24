// ---------- Modals ----------
function openModal(html){
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', (e)=>{ if(e.target===wrap) wrap.remove(); });
  return wrap;
}

function openAddHabitModal(){
  const m = openModal(`
    <h3>New habit</h3>
    <div class="field">
      <label>Name &amp; emoji</label>
      <div class="emoji-field-row">
        <input id="hEmoji" type="text" value="${HABIT_FALLBACK_EMOJI}" />
        <input id="hName" type="text" placeholder="e.g. Brush teeth" style="flex:1;" />
      </div>
    </div>
    <div class="field"><label>Base points (difficulty)</label><input id="hPoints" type="number" value="10" min="1" /></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="hCancel">Cancel</button>
      <button class="btn-primary" id="hSave">Add habit</button>
    </div>
  `);
  let emojiTouched = false;
  m.querySelector('#hEmoji').addEventListener('input', ()=>{ emojiTouched = true; });
  m.querySelector('#hName').addEventListener('input', (e)=>{
    if(!emojiTouched){
      m.querySelector('#hEmoji').value = pickHabitEmoji(e.target.value);
    }
  });
  m.querySelector('#hCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#hSave').addEventListener('click', ()=>{
    const name = m.querySelector('#hName').value.trim();
    const emoji = m.querySelector('#hEmoji').value.trim() || HABIT_FALLBACK_EMOJI;
    const pts = parseInt(m.querySelector('#hPoints').value)||10;
    if(!name){ showToast('Give it a name'); return; }
    state.habits.push({id: uid(), name, emoji, basePoints: pts, streak:0, lastCompletedDate:null});
    saveState();
    m.remove();
    renderMain();
  });
  setTimeout(()=>m.querySelector('#hName').focus(), 100);
}

function buildDayGrid(idPrefix, type, selected){
  if(type==='weekly'){
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return `<div class="recur-day-grid" id="${idPrefix}DayGrid">` +
      names.map((n,i)=>`<button type="button" data-day="${i}" class="${(selected||[]).includes(i)?'active':''}">${n}</button>`).join('') +
      `</div>`;
  } else {
    let h = `<div class="recur-day-grid" id="${idPrefix}DayGrid">`;
    for(let d=1; d<=31; d++){
      h += `<button type="button" data-day="${d}" class="${(selected||[]).includes(d)?'active':''}">${d}</button>`;
    }
    h += `</div>`;
    return h;
  }
}
function wireDayGrid(m, idPrefix){
  m.querySelectorAll(`#${idPrefix}DayGrid button`).forEach(btn=>{
    btn.addEventListener('click', ()=> btn.classList.toggle('active'));
  });
}
function readDayGrid(m, idPrefix){
  return Array.from(m.querySelectorAll(`#${idPrefix}DayGrid button.active`)).map(b=>parseInt(b.dataset.day));
}
function recurrenceFieldsHtml(idPrefix, recurrence, task, locked){
  const dis = locked ? 'disabled' : '';
  const lockNote = locked ? `<div class="lock-note" style="margin-top:4px;">Locked after the first day</div>` : '';
  if(recurrence==='once'){
    return `
    <div class="field"><label>Starting value</label><input id="${idPrefix}Start" type="number" value="${task?task.startValue:50}" ${dis} /></div>
    <div class="field"><label>Decay per day</label><input id="${idPrefix}Decay" type="number" value="${task?task.decayRate:5}" min="0" ${dis} />${lockNote}</div>`;
  }
  const sched = task ? task.schedule : [];
  return `
    <div class="field"><label>${recurrence==='weekly'?'Which day(s) of the week':'Which day(s) of the month'}</label>
      ${buildDayGrid(idPrefix, recurrence, sched)}
    </div>
    <div class="field"><label>Reward value (fixed)</label><input id="${idPrefix}Reward" type="number" value="${task?task.rewardValue:20}" ${dis} /></div>
    <div class="field"><label>Penalty per missed day</label><input id="${idPrefix}Penalty" type="number" value="${task?task.penaltyValue:5}" min="0" ${dis} />${lockNote}</div>`;
}
function openAddTaskModal(){
  const m = openModal(`
    <h3>New task</h3>
    <div class="field">
      <label>Name &amp; emoji</label>
      <div class="emoji-field-row">
        <input id="tEmoji" type="text" value="${TASK_DEFAULT_EMOJI}" />
        <input id="tName" type="text" placeholder="e.g. Call dentist" style="flex:1;" />
      </div>
    </div>
    <a class="add-details-link" id="tAddDetailsLink">+ Add details</a>
    <div class="field" id="tDescField" style="display:none;"><label>Description (optional)</label><input id="tDesc" type="text" placeholder="Add extra detail, e.g. a phone number" /></div>
    <div class="field"><label>Repeats</label>
      <select id="tRecurrence">
        <option value="once">One-time</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>
    <div id="tRecurFields">${recurrenceFieldsHtml('t', 'once', null, false)}</div>
    <div class="modal-actions">
      <button class="btn-secondary" id="tCancel">Cancel</button>
      <button class="btn-primary" id="tSave">Add task</button>
    </div>
  `);
  wireDayGrid(m, 't');
  m.querySelector('#tAddDetailsLink').addEventListener('click', ()=>{
    m.querySelector('#tDescField').style.display = 'block';
    m.querySelector('#tAddDetailsLink').style.display = 'none';
  });
  m.querySelector('#tRecurrence').addEventListener('change', (e)=>{
    m.querySelector('#tRecurFields').innerHTML = recurrenceFieldsHtml('t', e.target.value, null, false);
    wireDayGrid(m, 't');
  });
  m.querySelector('#tCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#tSave').addEventListener('click', ()=>{
    const name = m.querySelector('#tName').value.trim();
    const emoji = m.querySelector('#tEmoji').value.trim() || TASK_DEFAULT_EMOJI;
    const description = m.querySelector('#tDesc').value.trim();
    const recurrence = m.querySelector('#tRecurrence').value;
    if(!name){ showToast('Give it a name'); return; }
    const base = {id: uid(), name, emoji, description, createdDate: todayStr(), completedDate: null, awardedPoints: null, recurrence};
    if(recurrence==='once'){
      const start = parseFloat(m.querySelector('#tStart').value)||0;
      const decay = parseFloat(m.querySelector('#tDecay').value)||0;
      state.tasks.push({...base, startValue: start, decayRate: decay});
    } else {
      const reward = parseFloat(m.querySelector('#tReward').value)||0;
      const penalty = parseFloat(m.querySelector('#tPenalty').value)||0;
      const schedule = readDayGrid(m, 't');
      if(schedule.length===0){ showToast('Pick at least one day'); return; }
      state.tasks.push({...base, rewardValue: reward, penaltyValue: penalty, schedule, lastCompletedDate: null});
    }
    saveState();
    m.remove();
    renderMain();
  });
  setTimeout(()=>m.querySelector('#tName').focus(), 100);
}

function openEditHabitModal(id){
  const h = state.habits.find(x=>x.id===id);
  if(!h) return;
  const m = openModal(`
    <h3>Edit habit</h3>
    <div class="field">
      <label>Name &amp; emoji</label>
      <div class="emoji-field-row">
        <input id="ehEmoji" type="text" value="${escapeHtml(h.emoji||HABIT_FALLBACK_EMOJI)}" />
        <input id="ehName" type="text" value="${escapeHtml(h.name)}" style="flex:1;" />
      </div>
    </div>
    <div class="field"><label>Base points (difficulty)</label><input id="ehPoints" type="number" value="${h.basePoints}" min="1" /></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="ehCancel">Cancel</button>
      <button class="btn-primary" id="ehSave">Save changes</button>
    </div>
  `);
  m.querySelector('#ehCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#ehSave').addEventListener('click', ()=>{
    const name = m.querySelector('#ehName').value.trim();
    const emoji = m.querySelector('#ehEmoji').value.trim() || HABIT_FALLBACK_EMOJI;
    const pts = parseInt(m.querySelector('#ehPoints').value)||1;
    if(!name){ showToast('Give it a name'); return; }
    h.name = name;
    h.emoji = emoji;
    h.basePoints = pts;
    saveState();
    m.remove();
    renderMain();
    showToast('Habit updated');
  });
  setTimeout(()=>m.querySelector('#ehName').focus(), 100);
}

function openEditTaskModal(id){
  const task = state.tasks.find(x=>x.id===id);
  if(!task) return;
  const valuesLocked = !taskEditable(task);
  const recurrence = taskRecurrenceType(task);
  const m = openModal(`
    <h3>Edit task</h3>
    <div class="field">
      <label>Name &amp; emoji</label>
      <div class="emoji-field-row">
        <input id="etEmoji" type="text" value="${escapeHtml(task.emoji||TASK_DEFAULT_EMOJI)}" />
        <input id="etName" type="text" value="${escapeHtml(task.name)}" style="flex:1;" />
      </div>
    </div>
    <a class="add-details-link" id="etAddDetailsLink" style="${task.description?'display:none;':''}">+ Add details</a>
    <div class="field" id="etDescField" style="${task.description?'':'display:none;'}"><label>Description (optional)</label><input id="etDesc" type="text" value="${escapeHtml(task.description||'')}" placeholder="Add extra detail" /></div>
    <div class="field"><label>Repeats</label>
      <select id="etRecurrence" ${valuesLocked?'disabled':''}>
        <option value="once" ${recurrence==='once'?'selected':''}>One-time</option>
        <option value="weekly" ${recurrence==='weekly'?'selected':''}>Weekly</option>
        <option value="monthly" ${recurrence==='monthly'?'selected':''}>Monthly</option>
      </select>
      ${valuesLocked?'<div class="lock-note" style="margin-top:4px;">Repeat type locked after the first day</div>':''}
    </div>
    <div id="etRecurFields">${recurrenceFieldsHtml('et', recurrence, task, valuesLocked)}</div>
    <div class="modal-actions">
      <button class="btn-secondary" id="etCancel">Cancel</button>
      <button class="btn-primary" id="etSave">Save changes</button>
    </div>
  `);
  wireDayGrid(m, 'et');
  m.querySelector('#etAddDetailsLink').addEventListener('click', ()=>{
    m.querySelector('#etDescField').style.display = 'block';
    m.querySelector('#etAddDetailsLink').style.display = 'none';
  });
  m.querySelector('#etRecurrence').addEventListener('change', (e)=>{
    if(valuesLocked) return; // recurrence type itself can't change after day one
    m.querySelector('#etRecurFields').innerHTML = recurrenceFieldsHtml('et', e.target.value, e.target.value===recurrence?task:null, false);
    wireDayGrid(m, 'et');
  });
  m.querySelector('#etCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#etSave').addEventListener('click', ()=>{
    const name = m.querySelector('#etName').value.trim();
    const emoji = m.querySelector('#etEmoji').value.trim() || TASK_DEFAULT_EMOJI;
    const description = m.querySelector('#etDesc').value.trim();
    if(!name){ showToast('Give it a name'); return; }
    task.name = name;
    task.emoji = emoji;
    task.description = description;

    if(recurrence==='once'){
      // schedule/type locked fields — only touch them if still within the edit window
      if(!valuesLocked){
        task.startValue = parseFloat(m.querySelector('#etStart').value)||0;
        task.decayRate = parseFloat(m.querySelector('#etDecay').value)||0;
      }
    } else {
      const schedule = readDayGrid(m, 'et');
      if(schedule.length===0){ showToast('Pick at least one day'); return; }
      task.schedule = schedule; // editable forever — people reschedule
      if(!valuesLocked){
        task.rewardValue = parseFloat(m.querySelector('#etReward').value)||0;
        task.penaltyValue = parseFloat(m.querySelector('#etPenalty').value)||0;
      }
    }
    saveState();
    m.remove();
    renderMain();
    showToast('Task updated');
  });
  setTimeout(()=>m.querySelector('#etName').focus(), 100);
}

function openResetModal(){
  const m = openModal(`
    <h3>Reset everything?</h3>
    <div class="field" style="color:var(--ink-soft); font-size:14px; line-height:1.5;">
      This permanently deletes all habits, tasks, and score history. This can't be undone.
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" id="rCancel">Cancel</button>
      <button class="btn-primary btn-danger" id="rConfirm">Reset everything</button>
    </div>
  `);
  m.querySelector('#rCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#rConfirm').addEventListener('click', async ()=>{
    state = {habits:[], tasks:[], log:[], profile: state.profile, settings: state.settings};
    ensureStateShape();
    await saveState();
    applyTheme();
    m.remove();
    renderMain();
    showToast('Everything reset');
  });
}
