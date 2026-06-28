// ---------- Modals ----------
function openModal(html){
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', (e)=>{ if(e.target===wrap) wrap.remove(); });
  return wrap;
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
// Fields specific to a routine's recurrence type. Daily: a single difficulty value.
// Weekly/monthly: which day(s) it's scheduled on, plus a fixed reward and a fixed per-missed-
// occurrence penalty. `locked` greys out the numeric/value fields (never the schedule days
// themselves — those stay editable forever, same "fix a typo, don't dodge penalties" rule as before).
function routineRecurrenceFieldsHtml(idPrefix, recurrence, routine, locked){
  const dis = locked ? 'disabled' : '';
  const lockNote = locked ? `<div class="lock-note" style="margin-top:4px;">Locked after the first day</div>` : '';
  if(recurrence==='daily'){
    return `
    <div class="field"><label>Base points (difficulty)</label><input id="${idPrefix}Points" type="number" value="${routine?routine.basePoints:10}" min="1" /></div>`;
  }
  const sched = routine ? routine.schedule : [];
  return `
    <div class="field"><label>${recurrence==='weekly'?'Which day(s) of the week':'Which day(s) of the month'}</label>
      ${buildDayGrid(idPrefix, recurrence, sched)}
    </div>
    <div class="field"><label>Reward value (fixed)</label><input id="${idPrefix}Reward" type="number" value="${routine?routine.rewardValue:20}" ${dis} /></div>
    <div class="field"><label>Penalty if missed</label><input id="${idPrefix}Penalty" type="number" value="${routine?routine.penaltyValue:5}" min="0" ${dis} />${lockNote}</div>`;
}

function openAddRoutineModal(){
  const m = openModal(`
    <h3>New routine</h3>
    <div class="field">
      <label>Name &amp; emoji</label>
      <div class="emoji-field-row">
        <input id="hEmoji" type="text" value="${ROUTINE_FALLBACK_EMOJI}" />
        <input id="hName" type="text" placeholder="e.g. Brush teeth" style="flex:1;" />
      </div>
    </div>
    <a class="add-details-link" id="hAddDetailsLink">+ Add details</a>
    <div class="field" id="hDescField" style="display:none;"><label>Description (optional)</label><input id="hDesc" type="text" placeholder="Add extra detail" /></div>
    <div class="field"><label>Repeats</label>
      <select id="hRecurrence">
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>
    <div id="hRecurFields">${routineRecurrenceFieldsHtml('h', 'daily', null, false)}</div>
    <div class="modal-actions">
      <button class="btn-secondary" id="hCancel">Cancel</button>
      <button class="btn-primary" id="hSave">Add routine</button>
    </div>
  `);
  wireDayGrid(m, 'h');
  let emojiTouched = false;
  m.querySelector('#hEmoji').addEventListener('input', ()=>{ emojiTouched = true; });
  m.querySelector('#hName').addEventListener('input', (e)=>{
    if(!emojiTouched){
      m.querySelector('#hEmoji').value = pickRoutineEmoji(e.target.value);
    }
  });
  m.querySelector('#hAddDetailsLink').addEventListener('click', ()=>{
    m.querySelector('#hDescField').style.display = 'block';
    m.querySelector('#hAddDetailsLink').style.display = 'none';
  });
  m.querySelector('#hRecurrence').addEventListener('change', (e)=>{
    m.querySelector('#hRecurFields').innerHTML = routineRecurrenceFieldsHtml('h', e.target.value, null, false);
    wireDayGrid(m, 'h');
  });
  m.querySelector('#hCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#hSave').addEventListener('click', ()=>{
    const name = m.querySelector('#hName').value.trim();
    const emoji = m.querySelector('#hEmoji').value.trim() || ROUTINE_FALLBACK_EMOJI;
    const description = m.querySelector('#hDesc').value.trim();
    const recurrence = m.querySelector('#hRecurrence').value;
    if(!name){ showToast('Give it a name'); return; }
    const base = {
      id: uid(), name, emoji, description, recurrence,
      createdDate: todayStr(),
      streak:0, neglect:0, recoveryChain:false,
      lastCompletedDate:null, lastEvaluatedDate: addDays(todayStr(),-1),
      awardedPoints: null
    };
    if(recurrence==='daily'){
      const pts = parseInt(m.querySelector('#hPoints').value)||10;
      state.routines.push({...base, basePoints: pts});
    } else {
      const reward = parseFloat(m.querySelector('#hReward').value)||0;
      const penalty = parseFloat(m.querySelector('#hPenalty').value)||0;
      const schedule = readDayGrid(m, 'h');
      if(schedule.length===0){ showToast('Pick at least one day'); return; }
      state.routines.push({...base, rewardValue: reward, penaltyValue: penalty, schedule});
    }
    saveState();
    m.remove();
    renderMain();
  });
  setTimeout(()=>m.querySelector('#hName').focus(), 100);
}

function openEditRoutineModal(id){
  const h = state.routines.find(x=>x.id===id);
  if(!h) return;
  // Recurrence type (daily/weekly/monthly) is locked forever once a routine is created.
  // Numeric value fields (weekly/monthly reward/penalty) lock after the first day, same as tasks
  // used to. Daily's basePoints has no decay to dodge, so it stays editable forever.
  const valuesLocked = !routineEditable(h);
  const m = openModal(`
    <h3>Edit routine</h3>
    <div class="field">
      <label>Name &amp; emoji</label>
      <div class="emoji-field-row">
        <input id="ehEmoji" type="text" value="${escapeHtml(h.emoji||ROUTINE_FALLBACK_EMOJI)}" />
        <input id="ehName" type="text" value="${escapeHtml(h.name)}" style="flex:1;" />
      </div>
    </div>
    <a class="add-details-link" id="ehAddDetailsLink" style="${h.description?'display:none;':''}">+ Add details</a>
    <div class="field" id="ehDescField" style="${h.description?'':'display:none;'}"><label>Description (optional)</label><input id="ehDesc" type="text" value="${escapeHtml(h.description||'')}" placeholder="Add extra detail" /></div>
    <div class="field"><label>Repeats</label>
      <select id="ehRecurrence" disabled>
        <option value="daily" ${h.recurrence==='daily'?'selected':''}>Daily</option>
        <option value="weekly" ${h.recurrence==='weekly'?'selected':''}>Weekly</option>
        <option value="monthly" ${h.recurrence==='monthly'?'selected':''}>Monthly</option>
      </select>
      <div class="lock-note" style="margin-top:4px;">Repeat type can't be changed after creation</div>
    </div>
    <div id="ehRecurFields">${routineRecurrenceFieldsHtml('eh', h.recurrence, h, valuesLocked)}</div>
    <div class="modal-actions">
      <button class="btn-secondary" id="ehCancel">Cancel</button>
      <button class="btn-primary" id="ehSave">Save changes</button>
    </div>
  `);
  wireDayGrid(m, 'eh');
  m.querySelector('#ehAddDetailsLink').addEventListener('click', ()=>{
    m.querySelector('#ehDescField').style.display = 'block';
    m.querySelector('#ehAddDetailsLink').style.display = 'none';
  });
  m.querySelector('#ehCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#ehSave').addEventListener('click', ()=>{
    const name = m.querySelector('#ehName').value.trim();
    const emoji = m.querySelector('#ehEmoji').value.trim() || ROUTINE_FALLBACK_EMOJI;
    const description = m.querySelector('#ehDesc').value.trim();
    if(!name){ showToast('Give it a name'); return; }
    h.name = name;
    h.emoji = emoji;
    h.description = description;
    if(h.recurrence==='daily'){
      const pts = parseInt(m.querySelector('#ehPoints').value)||1;
      h.basePoints = pts;
    } else {
      const schedule = readDayGrid(m, 'eh');
      if(schedule.length===0){ showToast('Pick at least one day'); return; }
      h.schedule = schedule; // editable forever — people reschedule
      if(!valuesLocked){
        h.rewardValue = parseFloat(m.querySelector('#ehReward').value)||0;
        h.penaltyValue = parseFloat(m.querySelector('#ehPenalty').value)||0;
      }
    }
    saveState();
    m.remove();
    renderMain();
    showToast('Routine updated');
  });
  setTimeout(()=>m.querySelector('#ehName').focus(), 100);
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
    <div class="field"><label>Starting value</label><input id="tStart" type="number" value="50" /></div>
    <div class="field"><label>Decay per day</label><input id="tDecay" type="number" value="5" min="0" /></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="tCancel">Cancel</button>
      <button class="btn-primary" id="tSave">Add task</button>
    </div>
  `);
  m.querySelector('#tAddDetailsLink').addEventListener('click', ()=>{
    m.querySelector('#tDescField').style.display = 'block';
    m.querySelector('#tAddDetailsLink').style.display = 'none';
  });
  m.querySelector('#tCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#tSave').addEventListener('click', ()=>{
    const name = m.querySelector('#tName').value.trim();
    const emoji = m.querySelector('#tEmoji').value.trim() || TASK_DEFAULT_EMOJI;
    const description = m.querySelector('#tDesc').value.trim();
    if(!name){ showToast('Give it a name'); return; }
    const start = parseFloat(m.querySelector('#tStart').value)||0;
    const decay = parseFloat(m.querySelector('#tDecay').value)||0;
    state.tasks.push({
      id: uid(), name, emoji, description, recurrence:'once',
      createdDate: todayStr(), completedDate: null, awardedPoints: null,
      startValue: start, decayRate: decay
    });
    saveState();
    m.remove();
    renderMain();
  });
  setTimeout(()=>m.querySelector('#tName').focus(), 100);
}

function openEditTaskModal(id){
  const task = state.tasks.find(x=>x.id===id);
  if(!task) return;
  const valuesLocked = !taskEditable(task);
  const lockNote = valuesLocked ? `<div class="lock-note" style="margin-top:4px;">Locked after the first day</div>` : '';
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
    <div class="field"><label>Starting value</label><input id="etStart" type="number" value="${task.startValue}" ${valuesLocked?'disabled':''} /></div>
    <div class="field"><label>Decay per day</label><input id="etDecay" type="number" value="${task.decayRate}" min="0" ${valuesLocked?'disabled':''} />${lockNote}</div>
    <div class="modal-actions">
      <button class="btn-secondary" id="etCancel">Cancel</button>
      <button class="btn-primary" id="etSave">Save changes</button>
    </div>
  `);
  m.querySelector('#etAddDetailsLink').addEventListener('click', ()=>{
    m.querySelector('#etDescField').style.display = 'block';
    m.querySelector('#etAddDetailsLink').style.display = 'none';
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
    if(!valuesLocked){
      task.startValue = parseFloat(m.querySelector('#etStart').value)||0;
      task.decayRate = parseFloat(m.querySelector('#etDecay').value)||0;
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
      This permanently deletes all routines, tasks, and score history. This can't be undone.
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" id="rCancel">Cancel</button>
      <button class="btn-primary btn-danger" id="rConfirm">Reset everything</button>
    </div>
  `);
  m.querySelector('#rCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#rConfirm').addEventListener('click', async ()=>{
    state = {routines:[], tasks:[], log:[], profile: state.profile, settings: state.settings};
    ensureStateShape();
    await saveState();
    applyTheme();
    m.remove();
    renderMain();
    showToast('Everything reset');
  });
}
