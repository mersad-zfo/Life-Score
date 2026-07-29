// ---------- Modals ----------
function openModal(html){
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', (e)=>{ if(e.target===wrap) wrap.remove(); });
  return wrap;
}

// ---------- Notifications popover ----------
// Icon (🏆/❗/❕) + title + subtitle, at most 6 most-recent (excluding any hidden via the "x"),
// plus a permanent "show more" row into the full Notifications page. The "x" only hides an item
// from THIS list — see notifDbDismissFromPopover — it stays in history until it 30-day-prunes or
// is trashed from the full page.
async function notifPopoverListHtml(){
  let list = [];
  try{ list = await notifDbGetAll(); }catch(e){ /* IndexedDB unavailable */ }
  const visible = list.filter(n=> !n.hiddenFromPopover).slice(0, 6);
  const itemsHtml = visible.length ? visible.map(n=>`
    <div class="notif-item" data-notif-id="${n.id}">
      <div class="notif-icon">${NOTIF_ICONS[n.category] || ''}</div>
      <div class="notif-text">
        <div class="notif-title">${escapeHtml(n.title)}</div>
        ${n.body ? `<div class="notif-body">${escapeHtml(n.body)}</div>` : ''}
      </div>
      <button class="notif-dismiss" data-dismiss="${n.id}" aria-label="${tr('Delete')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  `).join('') : `<div class="notif-empty">${tr('No notifications yet')}</div>`;
  return `
    <div class="notif-list">${itemsHtml}</div>
    <div class="notif-show-more" id="notifShowMore">${tr('Show more')}</div>
  `;
}
async function openNotificationsModal(){
  const scrim = document.createElement('div');
  scrim.className = 'notif-scrim';
  const pop = document.createElement('div');
  pop.className = 'notif-popover';
  pop.innerHTML = `
    <div class="notif-popover-head">
      <h3>${tr('Notifications')}</h3>
      <button class="notif-popover-close" id="notifPopClose">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div id="notifPopBody">${await notifPopoverListHtml()}</div>
  `;
  document.body.appendChild(scrim);
  document.body.appendChild(pop);

  const close = ()=>{ scrim.remove(); pop.remove(); };
  scrim.addEventListener('click', close);
  pop.querySelector('#notifPopClose').addEventListener('click', close);

  async function rerenderBody(){
    pop.querySelector('#notifPopBody').innerHTML = await notifPopoverListHtml();
    wireBody();
  }
  function wireBody(){
    pop.querySelectorAll('[data-dismiss]').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        e.stopPropagation();
        const id = parseInt(btn.dataset.dismiss);
        try{ await notifDbDismissFromPopover(id); }catch(err){ /* IndexedDB unavailable */ }
        refreshBellBadge();
        rerenderBody();
      });
    });
    const showMore = pop.querySelector('#notifShowMore');
    if(showMore) showMore.addEventListener('click', ()=>{ close(); openNotificationsPage(); });
  }
  wireBody();

  try{
    await notifDbMarkAllRead();
    refreshBellBadge();
  }catch(e){ /* IndexedDB unavailable */ }
}
// ---------- Day grid (weekly / monthly schedule picker) ----------
function buildDayGrid(idPrefix, type, selected){
  if(type==='weekly'){
    const names = weekdayShortNames();
    return `<div class="recur-day-grid" id="${idPrefix}DayGrid">` +
      WEEK_DAY_ORDER.map((dayIdx,i)=>`<button type="button" data-day="${dayIdx}" class="${(selected||[]).includes(dayIdx)?'active':''}">${names[i]}</button>`).join('') +
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

// ---------- Difficulty picker ----------
function buildDifficultyPicker(idPrefix, current, locked){
  const diff = current || 'normal';
  return `
    <div class="field">
      <label>${tr('Difficulty')}</label>
      <div class="seg-control${locked?' seg-locked':''}" id="${idPrefix}Difficulty">
        <button type="button" data-diff="easy"   class="${diff==='easy'  ?'active':''}">${tr('Easy')}</button>
        <button type="button" data-diff="normal" class="${diff==='normal'?'active':''}">${tr('Normal')}</button>
        <button type="button" data-diff="hard"   class="${diff==='hard'  ?'active':''}">${tr('Hard')}</button>
      </div>
      ${locked ? `<div class="lock-note" style="margin-top:4px;">${tr('Locked after the first day')}</div>` : ''}
    </div>`;
}
function wireDifficultyPicker(m, idPrefix){
  m.querySelectorAll(`#${idPrefix}Difficulty button`).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      m.querySelectorAll(`#${idPrefix}Difficulty button`).forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}
function readDifficulty(m, idPrefix){
  const btn = m.querySelector(`#${idPrefix}Difficulty button.active`);
  return btn ? btn.dataset.diff : 'normal';
}

// ---------- Recurrence-specific fields (day grid + difficulty) ----------
function routineRecurrenceFieldsHtml(idPrefix, recurrence, routine, diffLocked){
  const diff = routine ? (routine.difficulty || 'normal') : 'normal';
  const stepsHtml = stepsFieldHtml(idPrefix, routine ? routine.steps : null, diffLocked);
  const diffPicker = buildDifficultyPicker(idPrefix, diff, diffLocked);
  if(recurrence==='daily') return stepsHtml + diffPicker;
  const sched = routine ? routine.schedule : [];
  return `
    <div class="field">
      <label>${recurrence==='weekly' ? tr('Which day(s) of the week') : tr('Which day(s) of the month')}</label>
      ${buildDayGrid(idPrefix, recurrence, sched)}
    </div>
    ${stepsHtml}
    ${diffPicker}`;
}
function wireRecurFields(m, idPrefix, diffLocked){
  wireDayGrid(m, idPrefix);
  if(!diffLocked) wireStepsToggle(m, idPrefix);
  if(!diffLocked) wireDifficultyPicker(m, idPrefix);
}

// ---------- Recurrence seg-control (add modal — interactive) ----------
function buildRecurrencePicker(idPrefix, current){
  const rec = current || 'daily';
  return `
    <div class="field">
      <label>${tr('Repeats')}</label>
      <div class="seg-control" id="${idPrefix}Recurrence">
        <button type="button" data-rec="daily"   class="${rec==='daily'  ?'active':''}">${tr('Daily')}</button>
        <button type="button" data-rec="weekly"  class="${rec==='weekly' ?'active':''}">${tr('Weekly')}</button>
        <button type="button" data-rec="monthly" class="${rec==='monthly'?'active':''}">${tr('Monthly')}</button>
      </div>
    </div>`;
}
// Recurrence picker for edit modal — locked, shows active state but no click handlers.
function buildRecurrencePickerLocked(idPrefix, current){
  return `
    <div class="field">
      <label>${tr('Repeats')}</label>
      <div class="seg-control seg-locked" id="${idPrefix}Recurrence">
        <button type="button" data-rec="daily"   class="${current==='daily'  ?'active':''}">${tr('Daily')}</button>
        <button type="button" data-rec="weekly"  class="${current==='weekly' ?'active':''}">${tr('Weekly')}</button>
        <button type="button" data-rec="monthly" class="${current==='monthly'?'active':''}">${tr('Monthly')}</button>
      </div>
      <div class="lock-note" style="margin-top:4px;">${tr("Repeat type can't be changed after creation")}</div>
    </div>`;
}
function wireRecurrencePicker(m, idPrefix, diffLocked){
  m.querySelectorAll(`#${idPrefix}Recurrence button`).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      m.querySelectorAll(`#${idPrefix}Recurrence button`).forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const rec = btn.dataset.rec;
      m.querySelector(`#${idPrefix}RecurFields`).innerHTML = routineRecurrenceFieldsHtml(idPrefix, rec, null, diffLocked);
      wireRecurFields(m, idPrefix, diffLocked);
    });
  });
}
function readRecurrence(m, idPrefix){
  const btn = m.querySelector(`#${idPrefix}Recurrence button.active`);
  return btn ? btn.dataset.rec : 'daily';
}

// ---------- Shared "+ Add time & details" row (time input + description textarea) ----------
// Collapsed behind a link until tapped, same idea as the old description-only field it replaces,
// but now reveals a native time input alongside a taller textarea in the same row. Used
// identically by all 4 routine/task add/edit modals.
//
// Native <input type="time"> follows whatever 12h/24h clock format the device itself is set to
// (same as its own status bar) — there's no reliable way to force one or the other from the web
// page, so this intentionally just mirrors the device rather than fighting it.
function timeDetailsFieldsHtml(prefix, timeVal, descVal, descPlaceholder){
  const hasExisting = !!(timeVal || descVal);
  return `
    <a class="add-details-link" id="${prefix}AddDetailsLink">${hasExisting ? tr('- Hide time & details') : tr('+ Add time & details')}</a>
    <div class="time-details-row" id="${prefix}DetailsField" style="${hasExisting?'':'display:none;'}">
      <div class="field time-field">
        <label>${tr('Time')}</label>
        <input id="${prefix}Time" type="time" value="${escapeHtml(timeVal||'')}" />
      </div>
      <div class="field desc-field">
        <label>${tr('Description (optional)')}</label>
        <textarea id="${prefix}Desc" rows="2" placeholder="${descPlaceholder||tr('Add extra detail')}">${escapeHtml(descVal||'')}</textarea>
      </div>
    </div>
  `;
}
function wireTimeDetailsToggle(m, prefix){
  const link = m.querySelector(`#${prefix}AddDetailsLink`);
  const field = m.querySelector(`#${prefix}DetailsField`);
  link.addEventListener('click', ()=>{
    const opening = field.style.display === 'none';
    field.style.display = opening ? 'flex' : 'none';
    link.textContent = opening ? tr('- Hide time & details') : tr('+ Add time & details');
  });
}
function readTimeDetails(m, prefix){
  return {
    time: m.querySelector(`#${prefix}Time`).value || null,
    description: m.querySelector(`#${prefix}Desc`).value.trim()
  };
}

// ---------- Shared "+ Add steps" row (checklist sub-items, split points evenly) ----------
// Matches the owner-supplied "Add steps (isolated)" prototype: numbered rows, a circular ×
// remove button per row, and a dashed "+ Add another step" button. Same collapsed-behind-a-link
// pattern as "+ Add time & details" above. Sits directly above the Difficulty picker in both the
// routine and task creator/edit modals (see routineRecurrenceFieldsHtml below and the task
// modals). Existing steps keep their original `id` (read back via a data attribute) so live
// completion state and historical log entries stay correctly linked across an edit; newly-added
// rows get a fresh uid() only when the form is actually saved.
function stepRowHtml(id, val, num, locked){
  return `<div class="step-row" data-step-row data-step-id="${id||''}">
    <span class="step-num">${num}.</span>
    <input type="text" class="step-name" placeholder="${tr('Step name')}" value="${escapeHtml(val||'')}" ${locked?'disabled':''} />
    ${locked ? '' : `<button type="button" class="step-remove" data-remove-step aria-label="${tr('Remove')}">×</button>`}
  </div>`;
}
function stepsFieldHtml(prefix, existingSteps, locked){
  const hasExisting = !!(existingSteps && existingSteps.length>0);
  if(locked && !hasExisting) return ''; // nothing to lock/show
  const rowsHtml = hasExisting
    ? existingSteps.map((s,i)=>stepRowHtml(s.id, s.name, i+1, locked)).join('')
    : [stepRowHtml(null, '', 1, locked), stepRowHtml(null, '', 2, locked)].join('');
  if(locked){
    return `
      <div class="field">
        <label>${tr('Steps')}</label>
        <div class="steps-field seg-locked" id="${prefix}StepsField">
          <div id="${prefix}StepsRows">${rowsHtml}</div>
        </div>
        <div class="lock-note" style="margin-top:4px;">${tr('Locked after the first day')}</div>
      </div>`;
  }
  return `
    <a class="add-details-link" id="${prefix}AddStepsLink">${hasExisting ? tr('- Hide steps') : tr('+ Add steps')}</a>
    <div class="steps-field" id="${prefix}StepsField" style="${hasExisting?'':'display:none;'}">
      <div id="${prefix}StepsRows">${rowsHtml}</div>
      <button type="button" class="step-add-btn" id="${prefix}AddStepRow">${tr('+ Add another step')}</button>
    </div>
  `;
}
function wireStepsToggle(m, prefix){
  const link = m.querySelector(`#${prefix}AddStepsLink`);
  const field = m.querySelector(`#${prefix}StepsField`);
  link.addEventListener('click', ()=>{
    const opening = field.style.display === 'none';
    field.style.display = opening ? 'block' : 'none';
    link.textContent = opening ? tr('- Hide steps') : tr('+ Add steps');
  });
  wireStepRows(m, prefix);
}
function wireStepRows(m, prefix){
  const addBtn = m.querySelector(`#${prefix}AddStepRow`);
  const rows = m.querySelector(`#${prefix}StepsRows`);
  function renumber(){
    rows.querySelectorAll('[data-step-row]').forEach((row,i)=>{
      row.querySelector('.step-num').textContent = (i+1)+'.';
    });
  }
  function wireRemove(){
    rows.querySelectorAll('[data-remove-step]').forEach(btn=>{
      btn.onclick = ()=>{
        // Always leave at least one (empty) row rather than collapsing to nothing mid-edit.
        if(rows.querySelectorAll('[data-step-row]').length>1){
          btn.closest('[data-step-row]').remove();
          renumber();
        } else {
          btn.closest('[data-step-row]').querySelector('.step-name').value = '';
        }
      };
    });
  }
  addBtn.addEventListener('click', ()=>{
    const wrap = document.createElement('div');
    wrap.innerHTML = stepRowHtml(null, '', rows.querySelectorAll('[data-step-row]').length+1);
    const row = wrap.firstElementChild;
    rows.appendChild(row);
    wireRemove();
    row.querySelector('input').focus();
  });
  wireRemove();
}
// Returns null (feature off for this item) if the field is collapsed or every row is empty,
// otherwise the array of {id, name} to store on the routine/task.
function readSteps(m, prefix){
  const field = m.querySelector(`#${prefix}StepsField`);
  if(!field || field.style.display==='none') return null;
  const rows = Array.from(m.querySelectorAll(`#${prefix}StepsRows [data-step-row]`));
  const steps = rows.map(row=>{
    const name = row.querySelector('.step-name').value.trim();
    if(!name) return null;
    return { id: row.dataset.stepId || uid(), name };
  }).filter(Boolean);
  return steps.length>0 ? steps : null;
}

// ---------- Add Routine ----------
function openAddRoutineModal(){
  const m = openModal(`
    <h3>${tr('New routine')}</h3>
    <div class="field">
      <label>${tr('Name & emoji')}</label>
      <div class="emoji-field-row">
        <input id="hEmoji" type="text" value="${ROUTINE_FALLBACK_EMOJI}" />
        <input id="hName" type="text" placeholder="${tr('e.g. Brush teeth')}" style="flex:1;" />
      </div>
    </div>
    ${timeDetailsFieldsHtml('h', null, null)}
    ${buildRecurrencePicker('h', 'daily')}
    <div id="hRecurFields">${routineRecurrenceFieldsHtml('h', 'daily', null, false)}</div>
    <div class="modal-actions">
      <button class="btn-secondary" id="hCancel">${tr('Cancel')}</button>
      <button class="btn-primary" id="hSave">${tr('Add routine')}</button>
    </div>
  `);
  wireRecurFields(m, 'h', false);
  wireRecurrencePicker(m, 'h', false);
  wireTimeDetailsToggle(m, 'h');
  let emojiTouched = false;
  limitToOneGrapheme(m.querySelector('#hEmoji'));
  m.querySelector('#hEmoji').addEventListener('input', ()=>{ emojiTouched = true; });
  m.querySelector('#hName').addEventListener('input', (e)=>{
    if(!emojiTouched) m.querySelector('#hEmoji').value = pickRoutineEmoji(e.target.value);
  });
  m.querySelector('#hCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#hSave').addEventListener('click', ()=>{
    const name = m.querySelector('#hName').value.trim();
    const emoji = m.querySelector('#hEmoji').value.trim() || ROUTINE_FALLBACK_EMOJI;
    const {time, description} = readTimeDetails(m, 'h');
    const recurrence = readRecurrence(m, 'h');
    const difficulty = readDifficulty(m, 'h');
    const steps = readSteps(m, 'h');
    if(!name){ showToast(tr('Give it a name')); return; }
    const graceToday = shouldGraceToday();
    const base = {
      id: uid(), name, emoji, description, time, recurrence, difficulty, steps,
      createdDate: todayStr(),
      streak:0, neglect:0, recoveryChain:false, neglectMilestoneHit:false,
      lastCompletedDate:null, lastEvaluatedDate: graceToday ? todayStr() : addDays(todayStr(),-1),
      graceAppliedDate: graceToday ? todayStr() : null,
      awardedPoints: null
    };
    if(recurrence==='daily'){
      const basePoints = difficultyPointsFor('daily', difficulty);
      state.routines.push({...base, basePoints, configHistory: [{from: base.createdDate, basePoints, steps}]});
    } else {
      const schedule = readDayGrid(m, 'h');
      if(schedule.length===0){ showToast(tr('Pick at least one day')); return; }
      const rewardValue = difficultyPointsFor(recurrence, difficulty);
      state.routines.push({
        ...base,
        rewardValue,
        schedule,
        configHistory: [{from: base.createdDate, schedule, rewardValue, steps}]
      });
    }
    saveState();
    m.remove();
    renderMain();
    if(graceToday){
      notifSetCondition(`grace:${base.id}`, true, 'info',
        ()=>({ title: tr('Grace period applied'), body: tr("Added late, so today won't count — it starts fresh tomorrow.") }), true);
    }
    evaluateLiveDailyNotifications();
  });
  setTimeout(()=>m.querySelector('#hName').focus(), 100);
}

// ---------- Edit Routine ----------
function openEditRoutineModal(id){
  const h = state.routines.find(x=>x.id===id);
  if(!h) return;
  // Recurrence type locked forever. Difficulty is always editable now (routineEditable() always
  // returns true) — weekly/monthly used to lock it after the first day, daily never did.
  const diffLocked = !routineEditable(h);
  const m = openModal(`
    <h3>${tr('Edit routine')}</h3>
    <div class="field">
      <label>${tr('Name & emoji')}</label>
      <div class="emoji-field-row">
        <input id="ehEmoji" type="text" value="${escapeHtml(h.emoji||ROUTINE_FALLBACK_EMOJI)}" />
        <input id="ehName" type="text" value="${escapeHtml(h.name)}" style="flex:1;" />
      </div>
    </div>
    ${timeDetailsFieldsHtml('eh', h.time, h.description)}
    ${buildRecurrencePickerLocked('eh', h.recurrence)}
    <div id="ehRecurFields">${routineRecurrenceFieldsHtml('eh', h.recurrence, h, diffLocked)}</div>
    <div class="modal-actions">
      <button class="btn-secondary" id="ehCancel">${tr('Cancel')}</button>
      <button class="btn-primary" id="ehSave">${tr('Save changes')}</button>
    </div>
  `);
  wireRecurFields(m, 'eh', diffLocked);
  wireTimeDetailsToggle(m, 'eh');
  limitToOneGrapheme(m.querySelector('#ehEmoji'));
  m.querySelector('#ehCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#ehSave').addEventListener('click', ()=>{
    const name = m.querySelector('#ehName').value.trim();
    const emoji = m.querySelector('#ehEmoji').value.trim() || ROUTINE_FALLBACK_EMOJI;
    const {time, description} = readTimeDetails(m, 'eh');
    if(!name){ showToast(tr('Give it a name')); return; }
    h.name = name;
    h.emoji = emoji;
    h.description = description;
    h.time = time;
    if(!diffLocked){
      h.steps = readSteps(m, 'eh');
      const difficulty = readDifficulty(m, 'eh');
      h.difficulty = difficulty;
      if(h.recurrence==='daily'){
        h.basePoints = difficultyPointsFor('daily', difficulty);
      } else {
        h.rewardValue = difficultyPointsFor(h.recurrence, difficulty);
      }
    }
    if(h.recurrence!=='daily'){
      const schedule = readDayGrid(m, 'eh');
      if(schedule.length===0){ showToast(tr('Pick at least one day')); return; }
      h.schedule = schedule;
    }
    // Stamp today's version of whatever changed — configAt() will use this for any date from
    // today forward, while every day before today keeps reading whichever version was actually
    // in effect back then. Without this, editing schedule/difficulty would silently rewrite the
    // base/due calculation for every already-elapsed day too.
    pushConfigVersion(h);
    saveState();
    m.remove();
    renderMain();
    showToast(tr('Routine updated'));
    evaluateLiveDailyNotifications();
  });
  setTimeout(()=>m.querySelector('#ehName').focus(), 100);
}

// ---------- Add Task ----------
function openAddTaskModal(){
  const m = openModal(`
    <h3>${tr('New task')}</h3>
    <div class="field">
      <label>${tr('Name & emoji')}</label>
      <div class="emoji-field-row">
        <input id="tEmoji" type="text" value="${TASK_DEFAULT_EMOJI}" />
        <input id="tName" type="text" placeholder="${tr('e.g. Call dentist')}" style="flex:1;" />
      </div>
    </div>
    ${timeDetailsFieldsHtml('t', null, null, tr('Add extra detail, e.g. a phone number'))}
    <div class="field">
      <label>${trTaskDueDateFieldLabel()}</label>
      <input id="tDueDate" type="date" value="${todayStr()}" min="${todayStr()}" />
    </div>
    ${stepsFieldHtml('t', null)}
    ${buildDifficultyPicker('t', 'normal', false)}
    <div class="modal-actions">
      <button class="btn-secondary" id="tCancel">${tr('Cancel')}</button>
      <button class="btn-primary" id="tSave">${tr('Add task')}</button>
    </div>
  `);
  wireDifficultyPicker(m, 't');
  wireTimeDetailsToggle(m, 't');
  wireStepsToggle(m, 't');
  let emojiTouched = false;
  limitToOneGrapheme(m.querySelector('#tEmoji'));
  m.querySelector('#tEmoji').addEventListener('input', ()=>{ emojiTouched = true; });
  m.querySelector('#tName').addEventListener('input', (e)=>{
    if(!emojiTouched) m.querySelector('#tEmoji').value = pickTaskEmoji(e.target.value);
  });
  m.querySelector('#tCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#tSave').addEventListener('click', ()=>{
    const name = m.querySelector('#tName').value.trim();
    const emoji = m.querySelector('#tEmoji').value.trim() || TASK_DEFAULT_EMOJI;
    const {time, description} = readTimeDetails(m, 't');
    if(!name){ showToast(tr('Give it a name')); return; }
    const difficulty = readDifficulty(m, 't');
    const dueDate = m.querySelector('#tDueDate').value || todayStr();
    const steps = readSteps(m, 't');
    state.tasks.push({
      id: uid(), name, emoji, description, time, difficulty, recurrence:'once', steps,
      createdDate: todayStr(), dueDate, completedDate: null, awardedPoints: null,
      startValue: difficultyPointsFor('task', difficulty),
      decayRate: TASK_DECAY_RATE
    });
    saveState();
    m.remove();
    renderMain();
    evaluateLiveDailyNotifications();
  });
  setTimeout(()=>m.querySelector('#tName').focus(), 100);
}

// ---------- Edit Task ----------
function openEditTaskModal(id){
  const task = state.tasks.find(x=>x.id===id);
  if(!task) return;
  const diffLocked = !taskEditable(task);
  const m = openModal(`
    <h3>${tr('Edit task')}</h3>
    <div class="field">
      <label>${tr('Name & emoji')}</label>
      <div class="emoji-field-row">
        <input id="etEmoji" type="text" value="${escapeHtml(task.emoji||TASK_DEFAULT_EMOJI)}" />
        <input id="etName" type="text" value="${escapeHtml(task.name)}" style="flex:1;" />
      </div>
    </div>
    ${timeDetailsFieldsHtml('et', task.time, task.description, tr('Add extra detail, e.g. a phone number'))}
    <div class="field">
      <label>${trTaskDueDateFieldLabel()}</label>
      <input id="etDueDate" type="date" value="${task.dueDate}" min="${todayStr()}" ${diffLocked?'disabled':''} class="${diffLocked?'seg-locked':''}" />
      ${diffLocked ? `<div class="lock-note" style="margin-top:4px;">${tr('Locked after the first day')}</div>` : ''}
    </div>
    ${stepsFieldHtml('et', task.steps, diffLocked)}
    ${buildDifficultyPicker('et', task.difficulty || 'normal', diffLocked)}
    <div class="modal-actions">
      <button class="btn-secondary" id="etCancel">${tr('Cancel')}</button>
      <button class="btn-primary" id="etSave">${tr('Save changes')}</button>
    </div>
  `);
  if(!diffLocked) wireDifficultyPicker(m, 'et');
  wireTimeDetailsToggle(m, 'et');
  if(!diffLocked) wireStepsToggle(m, 'et');
  limitToOneGrapheme(m.querySelector('#etEmoji'));
  m.querySelector('#etCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#etSave').addEventListener('click', ()=>{
    const name = m.querySelector('#etName').value.trim();
    const emoji = m.querySelector('#etEmoji').value.trim() || TASK_DEFAULT_EMOJI;
    const {time, description} = readTimeDetails(m, 'et');
    if(!name){ showToast(tr('Give it a name')); return; }
    task.name = name;
    task.emoji = emoji;
    task.description = description;
    task.time = time;
    if(!diffLocked){
      const difficulty = readDifficulty(m, 'et');
      task.difficulty = difficulty;
      task.startValue = difficultyPointsFor('task', difficulty);
      task.decayRate = TASK_DECAY_RATE;
      task.steps = readSteps(m, 'et');
      const dueDate = m.querySelector('#etDueDate').value;
      if(dueDate) task.dueDate = dueDate;
    }
    saveState();
    m.remove();
    renderMain();
    showToast(tr('Task updated'));
    evaluateLiveDailyNotifications();
  });
  setTimeout(()=>m.querySelector('#etName').focus(), 100);
}

// ---------- Reset ----------
function openResetModal(){
  const m = openModal(`
    <h3>${tr('Reset everything?')}</h3>
    <div class="field" style="color:var(--ink-soft); font-size:14px; line-height:1.5;">
      ${tr("This permanently deletes all routines, tasks, and score history. This can't be undone.")}
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" id="rCancel">${tr('Cancel')}</button>
      <button class="btn-primary btn-danger" id="rConfirm">${tr('Reset everything')}</button>
    </div>
  `);
  m.querySelector('#rCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#rConfirm').addEventListener('click', async ()=>{
    try{ await notifDbClearAll(); }catch(e){ console.error('Reset: notification inbox clear failed', e); }

    await Promise.race([
      (async ()=>{
        try{
          if(state.settings.notificationsEnabled) await disablePushNotifications();
          if('serviceWorker' in navigator){
            const registration = await navigator.serviceWorker.ready;
            const sub = await registration.pushManager.getSubscription();
            if(sub) await sub.unsubscribe();
          }
        }catch(e){ console.error('Reset: push cleanup failed', e); }
      })(),
      new Promise(resolve=>setTimeout(resolve, 3000)) // never let this block the actual reset
    ]);

    const oldSettings = state.settings;
    state = {
      routines: [], tasks: [], log: [], profile: state.profile,
      settings: {
        theme: oldSettings.theme, sound: oldSettings.sound, language: oldSettings.language,
        nightOwlMode: oldSettings.nightOwlMode,
        ratingStartDate: todayStr(),
        notificationsEnabled: false,
        onboardingComplete: false
      }
    };
    ensureStateShape();
    await saveState();
    applyTheme();
    m.remove();
    enterOnboarding();
    showToast(tr('Everything reset'));
    refreshBellBadge();
  });
}
