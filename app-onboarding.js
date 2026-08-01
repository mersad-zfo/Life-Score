// ---------- Onboarding ----------
let onboardingActive = false;
let obStep = 1;
let obSelectedDaily = new Set(['brush','tidy','eathealthy','language']);
let obSelectedWeekly = new Set(['laundry']);
let obCustomDaily = [];
let obCustomWeekly = [];
let obTask = { name: '', emoji: '' };
let obTaskDue = addDays(todayStr(), 1);
let obRestoredViaOnboarding = false;
let obWelcomeAnimSession = 0;
let obDiffChoice = {};      // id -> 'easy'|'normal'|'hard'
let obDetailsOpen = {};     // id -> bool
let obRowExtra = {};        // id -> {time, description}
let obWeeklyDays = {};      // id -> Set of day indices (JS getDay convention)
let obActiveWeekdayPopoverId = null;
let obLastRenderedStep = null; // tracks the last step actually painted, so we only reset scroll on a real step change

const OB_DAILY_ITEMS = [
  {id:'brush', emoji:'🪥', nameKey:'Brushing Teeth'},
  {id:'work', emoji:'💲', nameKey:'Working'},
  {id:'cook', emoji:'🍲', nameKey:'Cooking'},
  {id:'shower', emoji:'🚿', nameKey:'Showering'},
  {id:'tidy', emoji:'🧹', nameKey:'Tidy Up'},
  {id:'read', emoji:'📖', nameKey:'Reading'},
  {id:'eathealthy', emoji:'🥪', nameKey:'Eating right'},
  {id:'exercise', emoji:'💪', nameKey:'Exercising'},
  {id:'medication', emoji:'💊', nameKey:'Taking Meds'},
  {id:'language', emoji:'📚', nameKey:'Study/Homework'},
  {id:'dishes', emoji:'🧽', nameKey:'Washing Dishes'},
  {id:'journal', emoji:'🪶', nameKey:'Journaling'},
];
const OB_WEEKLY_ITEMS = [
  {id:'gym', emoji:'🏋️', nameKey:'Gym'},
  {id:'laundry', emoji:'🧺', nameKey:'Laundry'},
  {id:'clean', emoji:'🧹', nameKey:'House cleaning'},
  {id:'groceries', emoji:'🛒', nameKey:'Grocery Shopping'},
  {id:'mealprep', emoji:'🍱', nameKey:'Meal Prep'},
  {id:'call', emoji:'📞', nameKey:'Calling Family'},
];

function obResetState(){
  obStep = 1;
  obSelectedDaily = new Set(['brush','tidy','eathealthy','language']);
  obSelectedWeekly = new Set(['laundry']);
  obCustomDaily = [];
  obCustomWeekly = [];
  obTask = { name: '', emoji: '' };
  obTaskDue = addDays(todayStr(), 1);
  obRestoredViaOnboarding = false;
  obDiffChoice = {};
  obDetailsOpen = {};
  obRowExtra = {};
  obWeeklyDays = {};
  obActiveWeekdayPopoverId = null;
  obLastRenderedStep = null;
}

// Finishes up ANY successful cloud sign-in (email/password, or Google once it returns from its
// redirect — see handlePendingGoogleRedirect below) the same way: pull down cloud data right now
// rather than waiting for the next app launch (item 4), save the display name, and — if we were
// still in onboarding and real cloud data actually came down — skip straight to the final
// onboarding step instead of making a returning user re-pick routines/tasks they already have
// (item 5), mirroring the existing file-based restore flow (see restoreData() in
// app-render-settings.js).
async function completeCloudSignIn(name, email, wasOnboarding){
  const pulled = await reconcileWithCloud();
  state.profile = { name, email };
  state.session.loggedIn = true;
  saveState();
  if(pulled && wasOnboarding){
    obRestoredViaOnboarding = true;
    obStep = 5;
  }
  renderMain();
  showToast(pulled ? tr('Restored your data from the cloud') : trWelcome(name));
}

const PENDING_GOOGLE_KEY = 'lifyar_pending_google_signin';
// Google sign-in now uses a full-page redirect (item 6), not a popup — the click that starts it
// navigates away immediately, so there's no modal left to finish the job when the app reloads.
// This picks that back up: the name typed just before redirecting (and whether onboarding was
// active) was stashed in localStorage — see the Google button handler in app-render-settings.js —
// and gets read back here once app-main.js's boot sequence confirms a Google sign-in just landed.
async function handlePendingGoogleRedirect(result){
  let pending = null;
  try{
    const raw = localStorage.getItem(PENDING_GOOGLE_KEY);
    if(raw) pending = JSON.parse(raw);
  }catch(e){ /* fall through */ }
  localStorage.removeItem(PENDING_GOOGLE_KEY);
  if(!result.ok){
    showToast(tr('Something went wrong — try again'));
    return;
  }
  const cloud = window.LifyarCloud;
  const user = cloud ? cloud.getUser() : null;
  const name = (pending && pending.name) || (user && user.displayName) || '';
  if(!name) return; // nothing usable to finish the sign-in with — user can just sign in again
  await completeCloudSignIn(name, (user && user.email) || '', !!(pending && pending.wasOnboarding));
}

function enterOnboarding(){
  onboardingActive = true;
  obResetState();
  document.getElementById('app').style.display = 'none';
  document.getElementById('onboarding').style.display = 'flex';
  renderOnboarding();
}

function initOnboarding(){
  onboardingActive = !state.settings.onboardingComplete;
  document.getElementById('obBackBtn').addEventListener('click', ()=>{
    if(obStep>1 && obStep<5){ obStep--; renderOnboarding(); }
  });
  document.getElementById('obWeekdayPopoverConfirm').addEventListener('click', ()=>{
    document.getElementById('obWeekdayPopoverScrim').style.display = 'none';
    const trigger = document.querySelector(`[data-weekday-trigger="${obActiveWeekdayPopoverId}"]`);
    if(trigger){
      trigger.textContent = obDaysSummaryText(obActiveWeekdayPopoverId);
      // Clear the validation-failure shake/red state as soon as the item actually has days again —
      // it should only ever reflect the *current* state, not linger from a past failed Finish-setup click.
      if(obGetWeekdaySet(obActiveWeekdayPopoverId).size > 0) trigger.classList.remove('shake');
    }
    obActiveWeekdayPopoverId = null;
  });
  if(onboardingActive){
    document.getElementById('app').style.display = 'none';
    document.getElementById('onboarding').style.display = 'flex';
    obStep = 1;
    renderOnboarding();
  }
}

function obItemDisplayName(i){
  return i.nameKey ? tr(i.nameKey) : i.name;
}

function obAllPicked(){
  const list = [];
  OB_DAILY_ITEMS.concat(obCustomDaily).forEach(i=>{ if(obSelectedDaily.has(i.id)) list.push({id:i.id, emoji:i.emoji, name:obItemDisplayName(i), group:'Daily'}); });
  OB_WEEKLY_ITEMS.concat(obCustomWeekly).forEach(i=>{ if(obSelectedWeekly.has(i.id)) list.push({id:i.id, emoji:i.emoji, name:obItemDisplayName(i), group:'Weekly'}); });
  if(obTask.name && obTask.name.trim()) list.push({id:'__task', emoji: obTask.emoji || TASK_DEFAULT_EMOJI, name:obTask.name.trim(), group:'Task'});
  return list;
}

// ---------- Chip flow (step 3) ----------
function obChipFlowHtml(items, customItems, selectedSet, addKey){
  const customIds = new Set(customItems.map(c=>c.id));
  const chips = items.concat(customItems).map(i=>{
    const sel = selectedSet.has(i.id);
    const isCustom = customIds.has(i.id);
    const label = isCustom ? escapeHtml(i.name) : tr(i.nameKey);
    return `<div class="chip ${sel?'selected':''}" data-id="${i.id}">${sel?'✓ ':''}${i.emoji} ${label}${isCustom?`<span class="chip-remove" data-remove="${i.id}">×</span>`:''}</div>`;
  }).join('');
  return `<div class="chip-flow" id="flow-${addKey}">${chips}<div class="chip chip-add" id="add-${addKey}">${tr('+ Add yours')}</div></div>`;
}
function obWireChipFlow(addKey, customItems, selectedSet, onChange){
  const flow = document.getElementById(`flow-${addKey}`);
  flow.querySelectorAll('.chip:not(.chip-add)').forEach(chip=>{
    chip.addEventListener('click', (e)=>{
      if(e.target.closest('.chip-remove')) return;
      const id = chip.dataset.id;
      selectedSet.has(id) ? selectedSet.delete(id) : selectedSet.add(id);
      onChange();
    });
  });
  flow.querySelectorAll('.chip-remove').forEach(x=>{
    x.addEventListener('click', (e)=>{
      e.stopPropagation();
      const id = x.dataset.remove;
      const idx = customItems.findIndex(c=>c.id===id);
      if(idx>-1) customItems.splice(idx,1);
      selectedSet.delete(id);
      onChange();
    });
  });
  const addChip = document.getElementById(`add-${addKey}`);
  addChip.addEventListener('click', ()=>{
    const form = document.createElement('span');
    form.className = 'chip-add-form';
    form.innerHTML = `<input class="chip-add-input" placeholder="${tr('Type your own…')}"><button class="chip-add-confirm" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></button>`;
    addChip.replaceWith(form);
    const input = form.querySelector('input');
    const confirmBtn = form.querySelector('.chip-add-confirm');
    input.focus();
    const commit = ()=>{
      const val = input.value.trim();
      if(val){
        const id = 'custom-' + Date.now();
        customItems.push({id, emoji: pickRoutineEmoji(val), name: val});
        selectedSet.add(id);
      }
      onChange();
    };
    confirmBtn.addEventListener('click', commit);
    input.addEventListener('keydown', e=>{
      if(e.key==='Enter') commit();
      if(e.key==='Escape') onChange();
    });
    input.addEventListener('blur', ()=>{
      setTimeout(()=>{ if(document.activeElement !== confirmBtn) onChange(); }, 120);
    });
  });
}

// ---------- Welcome animation (step 1, purely decorative) ----------
function obWait(ms){ return new Promise(r=>setTimeout(r, ms)); }
function obCountUpEl(el, from, to, duration){
  return new Promise(resolve=>{
    const start = performance.now();
    function tick(now){
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if(t < 1){ requestAnimationFrame(tick); } else { resolve(); }
    }
    requestAnimationFrame(tick);
  });
}
function obStartWelcomeAnimation(){
  obWelcomeAnimSession++;
  const mySession = obWelcomeAnimSession;
  const card = document.querySelector('.welcome-illustration');
  if(!card) return;
  const scoreNum = card.querySelector('#obAnimScoreNum');
  const ratingPill = card.querySelector('#obAnimRatingPill');
  const btn = id => card.querySelector(`.anim-btn-done[data-anim="${id}"]`);
  const flt = id => card.querySelector(`.anim-row-float[data-anim-float="${id}"]`);

  function checkOff(id){
    btn(id).classList.add('done', 'bump');
    btn(id).textContent = '✓';
    flt(id).classList.add('animate');
  }
  function resetVisual(){
    scoreNum.textContent = '140';
    ratingPill.textContent = tr('GOOD');
    ratingPill.classList.remove('tier-great', 'tier-awesome', 'glow-great', 'glow-awesome');
    ['work','read','exercise'].forEach(id=>{
      btn(id).classList.remove('done', 'bump');
      btn(id).textContent = '';
      flt(id).classList.remove('animate');
    });
  }

  (async function loop(){
    while(mySession === obWelcomeAnimSession){
      resetVisual();
      await obWait(1300);
      if(mySession !== obWelcomeAnimSession) return;
      checkOff('work');
      await obWait(250);
      await obCountUpEl(scoreNum, 140, 200, 700);
      await obWait(900);
      if(mySession !== obWelcomeAnimSession) return;
      checkOff('read');
      await obWait(250);
      ratingPill.textContent = tr('GREAT!');
      ratingPill.classList.add('tier-great');
      requestAnimationFrame(()=> ratingPill.classList.add('glow-great'));
      await obCountUpEl(scoreNum, 200, 240, 700);
      await obWait(1400);
      if(mySession !== obWelcomeAnimSession) return;
      checkOff('exercise');
      await obWait(250);
      ratingPill.textContent = tr('AWESOME!!!');
      ratingPill.classList.remove('tier-great');
      ratingPill.classList.add('tier-awesome');
      requestAnimationFrame(()=> ratingPill.classList.add('glow-awesome'));
      await obCountUpEl(scoreNum, 240, 300, 700);
      await obWait(2000);
      await obWait(500);
    }
  })();
}

// ---------- Step renderers ----------
function obRenderDots(){
  const dots = document.getElementById('obDots');
  dots.innerHTML = '';
  if(obStep < 2 || obStep > 4) return;
  const idx = obStep - 1;
  for(let i=1;i<=3;i++){
    const d = document.createElement('div');
    d.className = 'ob-dot' + (i < idx ? ' done' : '') + (i === idx ? ' current' : '');
    dots.appendChild(d);
  }
}

function obRenderStep1(content, footer){
  content.innerHTML = `
    <div class="welcome-hero">
      <img class="welcome-icon" src="./welcome-icon.png" alt="" />
      <p class="welcome-wordmark">${tr('Welcome to Lifyar!')}</p>
      <p class="welcome-sub">${tr('Lifyar helps you reflect how well you lived today, not just what you completed.')}</p>
      <div class="welcome-lang">
        <div class="seg-control" id="obLangSeg">
          <button type="button" data-val="en" class="${curLang()==='en'?'active':''}">${tr('English')}</button>
          <button type="button" data-val="fa" class="${curLang()==='fa'?'active':''}">فارسی</button>
        </div>
      </div>
      <div class="welcome-illustration">
        <div class="anim-card">
          <div class="anim-card-label">${tr('Today')}</div>
          <div class="anim-score-block">
            <div class="anim-score-num" id="obAnimScoreNum">140</div>
            <div class="anim-rating-pill" id="obAnimRatingPill">${tr('GOOD')}</div>
          </div>
          <div>
            <div class="anim-task-row"><button class="anim-btn-done done" data-anim="brush">✓</button><span class="anim-task-name">${tr('Brush Teeth')}</span><span class="anim-row-float" data-anim-float="brush"></span></div>
            <div class="anim-task-row"><button class="anim-btn-done" data-anim="work"></button><span class="anim-task-name">${tr('Work')}</span><span class="anim-row-float" data-anim-float="work">+60</span></div>
            <div class="anim-task-row"><button class="anim-btn-done" data-anim="read"></button><span class="anim-task-name">${tr('Read')}</span><span class="anim-row-float" data-anim-float="read">+40</span></div>
            <div class="anim-task-row"><button class="anim-btn-done done" data-anim="cook">✓</button><span class="anim-task-name">${tr('Cook')}</span><span class="anim-row-float" data-anim-float="cook"></span></div>
            <div class="anim-task-row"><button class="anim-btn-done" data-anim="exercise"></button><span class="anim-task-name">${tr('Exercise')}</span><span class="anim-row-float" data-anim-float="exercise">+60</span></div>
          </div>
        </div>
      </div>
    </div>
  `;
  content.querySelectorAll('#obLangSeg button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(btn.dataset.val === curLang()) return;
      state.settings.language = btn.dataset.val;
      saveState();
      applyLanguage(); // re-renders via renderMain -> renderOnboarding
    });
  });
  obStartWelcomeAnimation();
  footer.innerHTML = `<button class="btn-primary" id="obNextBtn">${tr('Get started')}</button>`;
}

function obRenderStep2(content, footer){
  const isLoggedIn = state.profile && state.session.loggedIn;
  // "System" is no longer a selectable option (a fresh state still defaults theme to 'system'
  // internally) — resolve the same way applyTheme() does, so the correct button starts highlighted.
  const obThemeIsDark = state.settings.theme==='dark' || (state.settings.theme!=='light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  content.innerHTML = `
    <p class="ob-eyebrow">${tr('Step 1 of 3')}</p>
    <h1 class="ob-title">${tr('A couple quick preferences')}</h1>
    <p class="ob-sub">${tr('All of this lives in Settings too — change any of it anytime.')}</p>

    <div class="settings-group">
      <div class="item-name" style="margin-bottom:10px;">${tr('Appearance')}</div>
      <div class="seg-control" id="obThemeSeg">
        <button type="button" data-theme="light" class="${obThemeIsDark?'':'active'}">${tr('Light')}</button>
        <button type="button" data-theme="dark" class="${obThemeIsDark?'active':''}">${tr('Dark')}</button>
      </div>
    </div>

    <div class="settings-group">
      <div class="toggle-row">
        <div>
          <div class="item-name">${tr('Night owl mode')}</div>
          <div class="item-sub">${tr('Day ends at 5:00am instead of midnight')}</div>
        </div>
        <div class="switch ${state.settings.nightOwlMode?'on':''}" id="obNightOwlSwitch"><div class="knob"></div></div>
      </div>
    </div>

    <div class="settings-group ob-account-card">
      <div class="settings-group-title">${tr('Account')}</div>
      ${isLoggedIn ? `
        <div class="account-card">
          <div class="acc-name">${escapeHtml(state.profile.name)}</div>
          <div class="acc-email">${escapeHtml(state.profile.email||'')}</div>
          <div class="settings-btn-row">
            <div class="toggle-row" style="cursor:pointer;" id="obRestoreBtn">
              <div><div class="item-name">${tr('Restore')}</div></div>
            </div>
            <button class="settings-btn danger-text" id="obLogoutBtn">${tr('Log out')}</button>
          </div>
        </div>
      ` : `
        <div class="item-sub" style="margin-bottom:10px;">${tr('Log in to restore your data to this device.')}</div>
        <button class="settings-btn" id="obLoginBtn">${state.profile ? tr('Log back in') : tr('Sign up / Log in')}</button>
      `}
    </div>
  `;
  content.querySelectorAll('[data-theme]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.settings.theme = btn.dataset.theme;
      applyTheme();
      saveState();
      renderOnboarding();
    });
  });
  document.getElementById('obNightOwlSwitch').addEventListener('click', ()=>{
    state.settings.nightOwlMode = !state.settings.nightOwlMode;
    applyRoutineCatchUp();
    saveState();
    renderOnboarding();
  });
  if(isLoggedIn){
    content.querySelector('#obRestoreBtn').addEventListener('click', ()=> restoreData());
    content.querySelector('#obLogoutBtn').addEventListener('click', ()=>{
      if(confirm(tr('Log out? Your profile stays saved on this device — you can log back in anytime. Your routines, tasks, and scores are unaffected either way.'))){
        state.session.loggedIn = false;
        saveState();
        if(window.LifyarCloud) window.LifyarCloud.signOutCloud();
        renderOnboarding();
        showToast(tr('Logged out'));
      }
    });
  } else {
    content.querySelector('#obLoginBtn').addEventListener('click', openLoginModal);
  }
  footer.innerHTML = `
    <button class="btn-secondary" id="obSkipBtn">${tr('Skip setup')}</button>
    <button class="btn-primary" id="obNextBtn">${tr('Continue')}</button>
  `;
}

function obRenderStep3(content, footer){
  content.innerHTML = `
    <p class="ob-eyebrow">${tr('Step 2 of 3')}</p>
    <h1 class="ob-title">${tr('Choose your routines')}</h1>
    <p class="ob-sub">${tr("Pick the activities that are already part of your life, plus anything you'd like to make part of it.")}</p>

    <p class="routine-task-note">${tr('<b>Try to have at least 4 Routines</b> in each day. For most people, having 4-6 routines is the sweet spot.')}</p>

    <div class="ob-glass-panel">
      <div class="section-label"><span>${tr('Daily')}</span><span class="section-count" id="obDailyCount"></span></div>
      ${obChipFlowHtml(OB_DAILY_ITEMS, obCustomDaily, obSelectedDaily, 'daily')}
    </div>

    <div class="ob-glass-panel">
      <div class="section-label"><span>${tr('Weekly')}</span><span class="section-count" id="obWeeklyCount"></span></div>
      ${obChipFlowHtml(OB_WEEKLY_ITEMS, obCustomWeekly, obSelectedWeekly, 'weekly')}
    </div>

    <p class="routine-task-note">${tr('<b>Routines</b> repeat automatically. <b>Tasks</b> are one-time activities — unlike routines, tasks disappear after completion.')}</p>

    <div class="ob-glass-panel">
      <div class="section-label"><span>${tr("One task you've been putting off?")}</span></div>
      <div class="task-inline">
        <input type="text" id="obTaskEmoji" value="${escapeHtml(obTask.emoji || TASK_DEFAULT_EMOJI)}">
        <input type="text" id="obTaskName" placeholder="${tr('Optional — e.g. Renew car insurance')}" value="${escapeHtml(obTask.name)}">
      </div>
    </div>
  `;
  const updateDailyCount = ()=>{ document.getElementById('obDailyCount').textContent = obSelectedDaily.size ? trSelectedCount(obSelectedDaily.size) : ''; };
  const updateWeeklyCount = ()=>{ document.getElementById('obWeeklyCount').textContent = obSelectedWeekly.size ? trSelectedCount(obSelectedWeekly.size) : ''; };
  obWireChipFlow('daily', obCustomDaily, obSelectedDaily, ()=>{ renderOnboarding(); });
  obWireChipFlow('weekly', obCustomWeekly, obSelectedWeekly, ()=>{ renderOnboarding(); });
  updateDailyCount(); updateWeeklyCount();
  const taskEmojiInput = content.querySelector('#obTaskEmoji');
  const taskNameInput = content.querySelector('#obTaskName');
  let taskEmojiTouched = !!obTask.emoji;
  limitToOneGrapheme(taskEmojiInput);
  taskEmojiInput.addEventListener('input', e=>{ taskEmojiTouched = true; obTask.emoji = e.target.value; });
  taskNameInput.addEventListener('input', e=>{
    obTask.name = e.target.value;
    if(!taskEmojiTouched){ obTask.emoji = pickTaskEmoji(e.target.value); taskEmojiInput.value = obTask.emoji; }
  });
  footer.innerHTML = `
    <button class="btn-secondary" id="obSkipBtn">${tr('Skip setup')}</button>
    <button class="btn-primary" id="obNextBtn">${tr('Continue')}</button>
  `;
}

// ---------- Weekday popover (step 4, weekly routines) ----------
function obWeekdayAbbrev(dayIdx){
  if(curLang()==='fa'){
    const map = {6:'ش',0:'۱ش',1:'۲ش',2:'۳ش',3:'۴ش',4:'۵ش',5:'ج'};
    return map[dayIdx];
  }
  const map = {6:'Sa',0:'Su',1:'Mo',2:'Tu',3:'We',4:'Th',5:'Fr'};
  return map[dayIdx];
}
function obWeekdayFullName(dayIdx){
  if(curLang()==='fa'){
    const map = {6:'شنبه',0:'یکشنبه',1:'دوشنبه',2:'سه‌شنبه',3:'چهارشنبه',4:'پنجشنبه',5:'جمعه'};
    return map[dayIdx];
  }
  const map = {6:'Saturday',0:'Sunday',1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday'};
  return map[dayIdx];
}
function obGetWeekdaySet(id){
  // Starts empty on purpose — the user must deliberately choose due days for a weekly routine;
  // see obValidateWeeklyDays()/the finish-setup guard, which blocks proceeding until every
  // weekly pick has at least one day selected.
  if(!obWeeklyDays[id]) obWeeklyDays[id] = new Set();
  return obWeeklyDays[id];
}
function obDaysSummaryText(id){
  const set = obGetWeekdaySet(id);
  if(set.size === 0) return tr('Select days');
  return [6,0,1,2,3,4,5].filter(d=>set.has(d)).map(d=>obWeekdayAbbrev(d)).join(curLang()==='fa' ? '، ' : ', ');
}
function obRenderWeekdayPopoverGrid(){
  const set = obGetWeekdaySet(obActiveWeekdayPopoverId);
  const grid = document.getElementById('obWeekdayPopoverGrid');
  grid.innerHTML = [6,0,1,2,3,4,5].map(d=>`<button type="button" data-day="${d}" class="${set.has(d)?'active':''}">${obWeekdayFullName(d)}</button>`).join('');
  grid.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const day = +btn.dataset.day;
      set.has(day) ? set.delete(day) : set.add(day);
      btn.classList.toggle('active');
    });
  });
}
// Returns the picked weekly items (from step 3) that still have zero due days selected.
function obWeeklyItemsMissingDays(){
  return obAllPicked().filter(p => p.group === 'Weekly' && obGetWeekdaySet(p.id).size === 0);
}
function obOpenWeekdayPopover(id, label){
  obActiveWeekdayPopoverId = id;
  document.getElementById('obWeekdayPopoverTitle').textContent = label;
  obRenderWeekdayPopoverGrid();
  document.getElementById('obWeekdayPopoverScrim').style.display = 'flex';
}

// ---------- Difficulty step (step 4) ----------
function obRenderStep4(content, footer){
  const picked = obAllPicked();
  if(picked.length === 0){
    content.innerHTML = `
      <div class="empty-state">
        <span class="emoji">🌱</span>
        <h1 class="ob-title">${tr('Nothing to set up yet')}</h1>
        <p class="ob-sub">${tr('You can add routines and tasks anytime from the Home tab.')}</p>
      </div>
    `;
    footer.innerHTML = `<button class="btn-primary" id="obNextBtn">${tr('Finish setup')}</button>`;
    return;
  }
  const groupLabel = { Daily: tr('Daily'), Weekly: tr('Weekly'), Task: tr('Task') };
  let groupsHtml = '';
  ['Daily','Weekly','Task'].forEach(group=>{
    const items = picked.filter(p=>p.group===group);
    if(!items.length) return;
    groupsHtml += `<div class="ob-glass-panel"><p class="section-label">${groupLabel[group]}</p>`;
    items.forEach(i=>{
      const isTask = i.group === 'Task';
      const isWeekly = i.group === 'Weekly';
      const diff = obDiffChoice[i.id] || 'normal';
      const open = !!obDetailsOpen[i.id];
      const segHtml = `
        <div class="diff-seg" data-id="${i.id}">
          <button type="button" data-val="easy" class="${diff==='easy'?'active':''}">${tr('Easy')}</button>
          <button type="button" data-val="normal" class="${diff==='normal'?'active':''}">${tr('Normal')}</button>
          <button type="button" data-val="hard" class="${diff==='hard'?'active':''}">${tr('Hard')}</button>
        </div>`;
      const linkHtml = `<span class="subtle-link" data-details="${i.id}">${open ? tr('– Hide time & details') : tr('+ Add time & details')}</span>`;
      const titleHtml = `<span class="name name-lg">${i.emoji} ${escapeHtml(i.name)}</span>`;

      let topHtml;
      if(isTask){
        topHtml = `
          <div class="diff-row-top grid-align">
            ${titleHtml}
            ${segHtml}
            <div class="due-row-inline">
              <label>${tr('Due')}</label>
              <input type="date" id="obTaskDue" value="${obTaskDue}" min="${todayStr()}">
            </div>
            ${linkHtml}
          </div>`;
      } else if(isWeekly){
        topHtml = `
          <div class="diff-row-top grid-align">
            ${titleHtml}
            ${segHtml}
            <div class="due-row-inline">
              <label>${tr('Due')}</label>
              <button type="button" class="due-trigger" data-weekday-trigger="${i.id}">${obDaysSummaryText(i.id)}</button>
            </div>
            ${linkHtml}
          </div>`;
      } else {
        topHtml = `
          <div class="diff-row-top">
            <div class="diff-left">
              ${titleHtml}
            </div>
            <div class="diff-right">
              ${segHtml}
              ${linkHtml}
            </div>
          </div>`;
      }

      groupsHtml += `
        <div class="diff-row">
          ${topHtml}
          ${open ? `
            <div class="row-details">
              <div class="field time-field">
                <label>${tr('Time')}</label>
                <input type="time" data-time="${i.id}" value="${(obRowExtra[i.id]&&obRowExtra[i.id].time)||''}">
              </div>
              <div class="field">
                <label>${tr('Description (optional)')}</label>
                <input type="text" data-desc="${i.id}" placeholder="${tr('Add extra detail')}" value="${(obRowExtra[i.id]&&obRowExtra[i.id].description)||''}">
              </div>
            </div>
          ` : ''}
        </div>`;
    });
    groupsHtml += `</div>`; // close .ob-glass-panel
  });
  content.innerHTML = `
    <p class="ob-eyebrow">${tr('Step 3 of 3')}</p>
    <h1 class="ob-title">${tr('How difficult is each activity for you?')}</h1>
    <p class="ob-sub">${tr("Choose how demanding each activity usually is for you. If you're unsure, leave everything at Normal.")}</p>
    ${groupsHtml}
  `;
  // Wire difficulty segments
  content.querySelectorAll('.diff-seg').forEach(seg=>{
    const id = seg.dataset.id;
    seg.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        seg.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        obDiffChoice[id] = btn.dataset.val;
      });
    });
  });
  // Wire time/description inputs (write straight to obRowExtra as the user types)
  content.querySelectorAll('[data-time]').forEach(inp=>{
    const id = inp.dataset.time;
    inp.addEventListener('input', ()=>{
      obRowExtra[id] = obRowExtra[id] || {};
      obRowExtra[id].time = inp.value;
    });
  });
  content.querySelectorAll('[data-desc]').forEach(inp=>{
    const id = inp.dataset.desc;
    inp.addEventListener('input', ()=>{
      obRowExtra[id] = obRowExtra[id] || {};
      obRowExtra[id].description = inp.value;
    });
  });
  // Wire the subtle-link details toggle
  content.querySelectorAll('[data-details]').forEach(link=>{
    link.addEventListener('click', ()=>{
      const id = link.dataset.details;
      obDetailsOpen[id] = !obDetailsOpen[id];
      renderOnboarding();
    });
  });
  // Wire weekday due-trigger buttons
  content.querySelectorAll('[data-weekday-trigger]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.weekdayTrigger;
      const picked_ = picked.find(p=>p.id===id);
      obOpenWeekdayPopover(id, picked_ ? `${picked_.emoji} ${picked_.name}` : '');
    });
  });
  const dueInput = content.querySelector('#obTaskDue');
  if(dueInput) dueInput.addEventListener('input', e=>{ obTaskDue = e.target.value; });
  footer.innerHTML = `
    <button class="btn-secondary" id="obSkipBtn">${tr('Skip setup')}</button>
    <button class="btn-primary" id="obNextBtn">${tr('Finish setup')}</button>
  `;
}

function obRenderStep5(content, footer){
  const picked = obAllPicked();
  const dailyN = picked.filter(p=>p.group==='Daily').length;
  const weeklyN = picked.filter(p=>p.group==='Weekly').length;
  const taskN = picked.filter(p=>p.group==='Task').length;
  const parts = [];
  if(dailyN) parts.push(trPickPart(dailyN, 'daily'));
  if(weeklyN) parts.push(trPickPart(weeklyN, 'weekly'));
  if(taskN) parts.push(trPickPart(taskN, 'task'));
  const summaryLine = obRestoredViaOnboarding
    ? tr('Your data has been restored to this device.')
    : (parts.length ? parts.join(' · ') : tr('Starting from a blank slate'));
  content.innerHTML = `
    <div class="done-wrap">
      <div class="done-circle">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
      </div>
      <h1 class="ob-title">${state.profile && state.profile.name ? trAllSetWithName(state.profile.name) : tr("You're all set")}</h1>
      <p class="ob-sub">${tr('Your Lifyar is ready. Everything here can still be edited, renamed, or removed anytime.')}</p>
      <p class="done-summary">${summaryLine}</p>
      <p class="done-notif-note">🔔 ${tr("<b>One more thing</b> — allow notifications if you'd like daily reminders to check your list.")}</p>
    </div>
  `;
  footer.innerHTML = `<button class="btn-primary" id="obNextBtn">${tr('Enter Lifyar')}</button>`;
}

// ---------- Commit / skip / finish ----------
function obCommitPicks(){
  const picked = obAllPicked();
  picked.forEach(i=>{
    const difficulty = obDiffChoice[i.id] || 'normal';
    const extra = obRowExtra[i.id] || {};
    const time = extra.time || null;
    const description = extra.description || null;
    if(i.group==='Task'){
      state.tasks.push({
        id: uid(), name: i.name, emoji: i.emoji, description, time, difficulty, recurrence:'once',
        createdDate: todayStr(), dueDate: obTaskDue, completedDate: null, awardedPoints: null,
        startValue: difficultyPointsFor('task', difficulty),
        decayRate: TASK_DECAY_RATE
      });
      return;
    }
    const graceToday = shouldGraceToday();
    const base = {
      id: uid(), name: i.name, emoji: i.emoji, description, time,
      recurrence: i.group==='Daily' ? 'daily' : 'weekly',
      difficulty,
      createdDate: todayStr(),
      streak:0, neglect:0, recoveryChain:false, neglectMilestoneHit:false,
      lastCompletedDate:null, lastEvaluatedDate: graceToday ? todayStr() : addDays(todayStr(),-1),
      graceAppliedDate: graceToday ? todayStr() : null,
      awardedPoints: null
    };
    if(i.group==='Daily'){
      const basePoints = difficultyPointsFor('daily', difficulty);
      state.routines.push({...base, basePoints, configHistory:[{from: base.createdDate, basePoints}]});
    } else {
      const daySet = obGetWeekdaySet(i.id);
      // The finish-setup guard (obWeeklyItemsMissingDays()) blocks proceeding while any weekly
      // pick has an empty day set, so this fallback should be unreachable in normal use — kept
      // only as a defensive default in case obCommitPicks() is ever called some other way.
      const schedule = daySet.size ? Array.from(daySet) : [6,0];
      const rewardValue = difficultyPointsFor('weekly', difficulty);
      state.routines.push({...base, rewardValue, schedule, configHistory:[{from: base.createdDate, schedule, rewardValue}]});
    }
  });
  saveState();
}

function obSkipSetup(){
  const m = openModal(`
    <h3>${tr('Skip setup?')}</h3>
    <div class="field" style="color:var(--ink-soft); font-size:14px; line-height:1.5;">
      ${tr("This clears any routines or tasks you've already picked, and takes you straight to the end.")}
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" id="obSkipCancel">${tr('Cancel')}</button>
      <button class="btn-primary btn-danger" id="obSkipConfirm">${tr('Skip setup')}</button>
    </div>
  `);
  m.querySelector('#obSkipCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#obSkipConfirm').addEventListener('click', ()=>{
    obSelectedDaily = new Set();
    obSelectedWeekly = new Set();
    obCustomDaily = [];
    obCustomWeekly = [];
    obTask = {name:'', emoji:''};
    obDiffChoice = {};
    obDetailsOpen = {};
    obRowExtra = {};
    obWeeklyDays = {};
    obStep = 5;
    m.remove();
    renderOnboarding();
  });
}

function obFinishOnboarding(){
  state.settings.onboardingComplete = true;
  onboardingActive = false;
  saveState();
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  setTab('today');
  const graceApplied = state.routines.some(r=> r.graceAppliedDate === todayStr());
  notifSetCondition('welcome:onboarding', true, 'congrats',
    ()=>({ title: tr('Welcome to Lifyar'), body: trWelcomeNotifBody(graceApplied) }), true);
}

// ---------- Dispatcher ----------
function renderOnboarding(){
  const content = document.getElementById('obContent');
  const footer = document.getElementById('obFooter');
  const stepChanged = obLastRenderedStep !== obStep; // only reset scroll on a real transition, not an in-step re-render (e.g. picking a chip, toggling a switch)
  document.getElementById('obBackBtn').classList.toggle('show', obStep>1 && obStep<5);
  document.getElementById('obWeekdayPopoverConfirm').textContent = tr('Confirm');
  obRenderDots();
  if(obStep===1) obRenderStep1(content, footer);
  if(obStep===2) obRenderStep2(content, footer);
  if(obStep===3) obRenderStep3(content, footer);
  if(obStep===4) obRenderStep4(content, footer);
  if(obStep===5) obRenderStep5(content, footer);
  if(stepChanged) content.scrollTop = 0;
  obLastRenderedStep = obStep;

  const skipBtn = document.getElementById('obSkipBtn');
  if(skipBtn) skipBtn.addEventListener('click', obSkipSetup);

  const nextBtn = document.getElementById('obNextBtn');
  if(nextBtn) nextBtn.addEventListener('click', async ()=>{
    if(obStep===5){
      nextBtn.disabled = true;
      try{
        await Promise.race([
          enablePushNotifications(false),
          new Promise(resolve=>setTimeout(resolve, 4000)) // never let this block entering the app
        ]);
      }catch(e){
        console.error('Notification opt-in during onboarding failed', e);
      }
      obFinishOnboarding();
      return;
    }
    if(obStep===4 && !obRestoredViaOnboarding){
      const missing = obWeeklyItemsMissingDays();
      if(missing.length){
        showToast(tr('Pick due days for each weekly routine before continuing'));
        missing.forEach(p=>{
          const trigger = content.querySelector(`[data-weekday-trigger="${p.id}"]`);
          if(!trigger) return;
          trigger.classList.remove('shake');
          void trigger.offsetWidth; // force reflow so the animation can restart on repeated clicks
          trigger.classList.add('shake');
        });
        return;
      }
      obCommitPicks();
    }
    obStep = Math.min(5, obStep+1);
    renderOnboarding();
  });
}
