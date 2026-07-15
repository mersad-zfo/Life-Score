// ---------- Settings tab + Account flows ----------
function renderSettings(main){
  checkNotificationPermissionState().then(changed=>{ if(changed) renderSettings(main); });
  const theme = state.settings.theme;
  const sound = state.settings.sound;
  const lang = state.settings.language || 'en';
  const isLoggedIn = state.profile && state.session.loggedIn;
  let html = `
    <div class="settings-group">
      <div class="settings-group-title">${tr('Account')}</div>
      ${isLoggedIn ? `
        <div class="account-card">
          <div class="acc-name">${escapeHtml(state.profile.name)}</div>
          <div class="acc-email">${escapeHtml(state.profile.email||'')}</div>
          <div class="settings-btn-row">
            <div class="toggle-row" style="cursor:pointer;" id="backupBtn">
              <div>
                <div class="item-name">${tr('Backup')}</div>
                ${backupTapped ? `<div class="item-sub">${tr('Saved to your Downloads folder with the name "life-score-backup"')}</div>` : ''}
              </div>
            </div>
            <div class="toggle-row" style="cursor:pointer;" id="restoreBtn">
              <div>
                <div class="item-name">${tr('Restore')}</div>
                ${restoreTapped ? `<div class="item-sub">${tr('Look for "life-score-backup.json" in your Downloads folder')}</div>` : ''}
              </div>
            </div>
            <button class="settings-btn danger-text" id="logoutBtn">${tr('Log out')}</button>
          </div>
        </div>
      ` : `
        <div class="item-sub" style="margin-bottom:10px;">${tr('Log in to back up your data to this device, or restore it on another.')}</div>
        <button class="settings-btn" id="loginBtn">${state.profile ? tr('Log back in') : tr('Sign up / Log in')}</button>
      `}
    </div>

    <div class="settings-group">
      <div class="settings-group-title">${tr('Appearance')}</div>
      <div class="seg-control">
        <button data-theme="system" class="${theme==='system'?'active':''}">${tr('System')}</button>
        <button data-theme="light" class="${theme==='light'?'active':''}">${tr('Light')}</button>
        <button data-theme="dark" class="${theme==='dark'?'active':''}">${tr('Dark')}</button>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">${tr('Language')}</div>
      <div class="seg-control">
        <button data-lang="en" class="${lang==='en'?'active':''}">${tr('English')}</button>
        <button data-lang="fa" class="${lang==='fa'?'active':''}">فارسی</button>
      </div>
    </div>

    <div class="settings-group">
      <div class="toggle-row">
        <div class="item-name">${tr('Notifications')}</div>
        <div class="switch ${state.settings.notificationsEnabled?'on':''}" id="notifSwitch"><div class="knob"></div></div>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">${tr('Sound')}</div>
      <div class="toggle-row">
        <div>
          <div class="item-name">${tr('Sound on completion')}</div>
        </div>
        <div class="switch ${sound?'on':''}" id="soundSwitch"><div class="knob"></div></div>
      </div>
    </div>


    <div class="settings-group">
      <div class="settings-group-title">${tr('Danger zone')}</div>
      <div class="settings-btn-row">
        <button class="settings-btn danger-text" id="resetBtn">${tr('Reset everything')}</button>
        ${state.profile ? `<button class="settings-btn danger-text" id="deleteAccountBtn">${tr('Delete account')}</button>` : ''}
      </div>
    </div>

    <div class="credit-line">Developed by Mersad</div>
  `;
  main.innerHTML = html;

  main.querySelectorAll('[data-theme]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.settings.theme = btn.dataset.theme;
      applyTheme();
      saveState();
      renderSettings(main);
    });
  });
  main.querySelectorAll('[data-lang]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.settings.language = btn.dataset.lang;
      saveState();
      applyLanguage();
      reconfirmDeviceIfNeeded(); // so push notifications switch language right away, not just next app open
      renderSettings(main);
    });
  });
  document.getElementById('notifSwitch').addEventListener('click', async ()=>{
    if(state.settings.notificationsEnabled){
      await disablePushNotifications();
    } else {
      await enablePushNotifications();
    }
    renderSettings(main);
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
      if(confirm(tr('Log out? Your profile stays saved on this device — you can log back in anytime. Your routines, tasks, and scores are unaffected either way.'))){
        state.session.loggedIn = false;
        saveState();
        renderSettings(main);
        showToast(tr('Logged out'));
      }
    });
  } else {
    document.getElementById('loginBtn').addEventListener('click', openLoginModal);
  }
  if(state.profile){
    document.getElementById('deleteAccountBtn').addEventListener('click', ()=>{
      if(confirm(tr('Permanently delete this profile (name and email) from this device? Your routines, tasks, and scores are not affected — only the account itself is removed.'))){
        state.profile = null;
        state.session.loggedIn = false;
        saveState();
        renderSettings(main);
        showToast(tr('Account deleted'));
      }
    });
  }
}

function openLoginModal(){
  const existing = state.profile;
  const m = openModal(`
    <h3>${existing ? tr('Log back in') : tr('Sign up / Log in')}</h3>
    <div class="field" style="color:var(--ink-soft); font-size:13px; line-height:1.5; margin-bottom:16px;">
      ${tr("This just creates a local profile on this device for now — no account is created on a server, and nothing is verified. It's here so your name can be used in the app, and so it's ready for real accounts in a future version.")}
    </div>
    <div class="field"><label>${tr('Name')}</label><input id="loginName" type="text" placeholder="${tr('Your name')}" value="${existing ? escapeHtml(existing.name) : ''}" /></div>
    <div class="field"><label>${tr('Email')}</label><input id="loginEmail" type="email" placeholder="you@example.com" value="${existing ? escapeHtml(existing.email||'') : ''}" /></div>
    <div class="modal-actions">
      <button class="btn-secondary" id="loginCancel">${tr('Cancel')}</button>
      <button class="btn-primary" id="loginSave">${existing ? tr('Log in') : tr('Save')}</button>
    </div>
  `);
  m.querySelector('#loginCancel').addEventListener('click', ()=>m.remove());
  m.querySelector('#loginSave').addEventListener('click', ()=>{
    const name = m.querySelector('#loginName').value.trim();
    const email = m.querySelector('#loginEmail').value.trim();
    if(!name){ showToast(tr('Enter a name')); return; }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(email && !emailPattern.test(email)){
      showToast(tr("That email doesn't look right"));
      return;
    }
    state.profile = { name, email };
    state.session.loggedIn = true;
    saveState();
    m.remove();
    renderMain();
    showToast(trWelcome(name));
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
    showToast(tr('Backup failed — try again'));
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
        showToast(tr("That file doesn't look like a Life Score backup"));
        return;
      }
      const currentProfile = state.profile;
      state = parsed;
      ensureStateShape();
      state.profile = currentProfile;
      migrateRecurringTasksToRoutines();
      applyRoutineCatchUp();
      applyTheme();
      saveState();
      renderMain();
      showToast(tr('Data restored'));
    }catch(err){
      showToast(tr('Could not read that file'));
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});
