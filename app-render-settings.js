// ---------- Settings tab + Account flows ----------
function renderSettings(main){
  checkNotificationPermissionState().then(changed=>{ if(changed) renderSettings(main); });
  const theme = state.settings.theme;
  // "System" is no longer a selectable option, but a user's stored theme could still be 'system'
  // from before this change (or any other legacy value) — resolve it the same way applyTheme()
  // does, so the correct button still shows as active instead of neither being highlighted.
  const effectiveThemeIsDark = theme==='dark' || (theme!=='light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const colorTheme = state.settings.colorTheme || 'green';
  const sound = state.settings.sound;
  const lang = state.settings.language || 'en';
  let html = `
    <div class="settings-group">
      <div class="item-name" style="margin-bottom:10px;">${tr('Appearance')}</div>
      <div class="seg-control">
        <button data-theme="light" class="${effectiveThemeIsDark?'':'active'}">${tr('Light')}</button>
        <button data-theme="dark" class="${effectiveThemeIsDark?'active':''}">${tr('Dark')}</button>
      </div>
      <div class="color-theme-row">
        <button data-color-theme="green" class="color-swatch-btn ${colorTheme==='green'?'active':''}" aria-label="${tr('Green')}"><span class="color-swatch" style="background:#2F6F5E;"></span></button>
        <button data-color-theme="blue" class="color-swatch-btn ${colorTheme==='blue'?'active':''}" aria-label="${tr('Blue')}"><span class="color-swatch" style="background:#2F5F8F;"></span></button>
        <button data-color-theme="pink" class="color-swatch-btn ${colorTheme==='pink'?'active':''}" aria-label="${tr('Pink')}"><span class="color-swatch" style="background:#A9436F;"></span></button>
      </div>
    </div>

    <div class="settings-group">
      <div class="item-name" style="margin-bottom:10px;">${tr('Language')}</div>
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
      <div class="toggle-row">
        <div class="item-name">${tr('Sound')}</div>
        <div class="switch ${sound?'on':''}" id="soundSwitch"><div class="knob"></div></div>
      </div>
    </div>

    <div class="settings-group">
      <div class="toggle-row">
        <div>
          <div class="item-name">${tr('Night owl mode')}</div>
          <div class="item-sub">${tr('Day ends at 5:00am instead of midnight')}</div>
        </div>
        <div class="switch ${state.settings.nightOwlMode?'on':''}" id="nightOwlSwitch"><div class="knob"></div></div>
      </div>
    </div>

    ${accountCardHtml('settings')}

    <div class="settings-group">
      <div class="settings-group-title">${tr('Danger zone')}</div>
      <div class="settings-btn-row">
        <button class="settings-btn danger-text" style="text-align:center;font-weight:500;" id="resetBtn">${tr('Reset everything')}</button>
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
  main.querySelectorAll('[data-color-theme]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.settings.colorTheme = btn.dataset.colorTheme;
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
  document.getElementById('nightOwlSwitch').addEventListener('click', ()=>{
    if(new Date().getHours() < 5){
      showToast(tr("Can't change this between midnight and 5am"));
      return;
    }
    state.settings.nightOwlMode = !state.settings.nightOwlMode;
    applyRoutineCatchUp(); // re-evaluate against the new day boundary right away
    saveState();
    renderMain();
  });
  document.getElementById('resetBtn').addEventListener('click', ()=> openResetModal());
  wireAccountCard(main, 'settings');
}

// Local-file backup/restore. Deliberately local-file, not cloud — actual cloud backup/restore is
// automatic (scheduleSync()/reconcileWithCloud()) and doesn't need a manual trigger; these are for
// taking an explicit local snapshot or migrating between devices without relying on the cloud at
// all. Reached via the "Backup/Restore" modal (settings) and "Local restore" (onboarding) — see
// openBackupRestoreModal() / accountCardHtml() in app-account.js.
function backupData(){
  try{
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lifyar-backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(tr('Saved to your Downloads folder with the name "lifyar-backup"'));
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
        showToast(tr("That file doesn't look like a Lifyar backup"));
        return;
      }
      const currentProfile = state.profile;
      const wasOnboarding = onboardingActive;
      state = parsed;
      ensureStateShape();
      state.profile = currentProfile;
      migrateRecurringTasksToRoutines();
      applyRoutineCatchUp();
      applyTheme();
      saveState();
      if(wasOnboarding){
        obRestoredViaOnboarding = true;
        obStep = 5;
      }
      renderMain();
      showToast(tr('Data restored'));
    }catch(err){
      showToast(tr('Could not read that file'));
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});
