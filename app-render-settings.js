// ---------- Settings tab + Account flows ----------
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
      migrateRecurringTasksToRoutines();
      pruneStaleCompletedTasks();
      applyRoutineCatchUp();
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
