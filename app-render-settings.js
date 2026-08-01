// ---------- Settings tab + Account flows ----------
function renderSettings(main){
  checkNotificationPermissionState().then(changed=>{ if(changed) renderSettings(main); });
  const theme = state.settings.theme;
  // "System" is no longer a selectable option, but a user's stored theme could still be 'system'
  // from before this change (or any other legacy value) — resolve it the same way applyTheme()
  // does, so the correct button still shows as active instead of neither being highlighted.
  const effectiveThemeIsDark = theme==='dark' || (theme!=='light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const sound = state.settings.sound;
  const lang = state.settings.language || 'en';
  const isLoggedIn = state.profile && state.session.loggedIn;
  let html = `
    <div class="settings-group">
      <div class="item-name" style="margin-bottom:10px;">${tr('Appearance')}</div>
      <div class="seg-control">
        <button data-theme="light" class="${effectiveThemeIsDark?'':'active'}">${tr('Light')}</button>
        <button data-theme="dark" class="${effectiveThemeIsDark?'active':''}">${tr('Dark')}</button>
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
                ${backupTapped ? `<div class="item-sub">${tr('Saved to your Downloads folder with the name "lifyar-backup"')}</div>` : ''}
              </div>
            </div>
            <div class="toggle-row" style="cursor:pointer;" id="restoreBtn">
              <div>
                <div class="item-name">${tr('Restore')}</div>
                ${restoreTapped ? `<div class="item-sub">${tr('Look for "lifyar-backup.json" in your Downloads folder')}</div>` : ''}
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
  const cloud = window.LifyarCloud;
  const cloudUser = cloud ? cloud.getUser() : null;
  const hasRealAccount = !!(cloudUser && !cloudUser.isAnonymous);
  const m = openModal(`
    <h3>${existing ? tr('Log back in') : tr('Sign up / Log in')}</h3>
    <div class="field" style="color:var(--ink-soft); font-size:13px; line-height:1.5; margin-bottom:16px;">
      ${hasRealAccount
        ? tr('Your data backs up to the cloud automatically. Add your name so it can be used in the app.')
        : tr('Create an account (or continue with Google) to back up your data to the cloud and recover it if this device ever loses it.')}
    </div>
    <div class="field"><label>${tr('Name')}</label><input id="loginName" type="text" placeholder="${tr('Your name')}" value="${existing ? escapeHtml(existing.name) : ''}" /></div>
    ${hasRealAccount ? '' : `
    <div class="field"><label>${tr('Email')}</label><input id="loginEmail" type="email" placeholder="you@example.com" value="${existing ? escapeHtml(existing.email||'') : ''}" /></div>
    <div class="field"><label>${tr('Password')}</label><input id="loginPassword" type="password" placeholder="${tr('At least 6 characters')}" /></div>
    `}
    <div class="modal-actions">
      <button class="btn-secondary" id="loginCancel">${tr('Cancel')}</button>
      ${hasRealAccount
        ? `<button class="btn-primary" id="loginSave">${tr('Save')}</button>`
        : `<button class="btn-primary" id="loginSignUp">${tr('Create account')}</button>`}
    </div>
    ${hasRealAccount ? '' : `
    <a class="add-details-link" id="loginLogInInstead">${tr('Already have an account? Log in instead')}</a>
    <button class="btn-secondary" id="loginGoogle" style="width:100%;margin-top:10px;">${tr('Continue with Google')}</button>
    `}
  `);
  m.querySelector('#loginCancel').addEventListener('click', ()=>m.remove());

  function readNameAndEmail(){
    const name = m.querySelector('#loginName').value.trim();
    if(!name){ showToast(tr('Enter a name')); return null; }
    const emailInput = m.querySelector('#loginEmail');
    const email = emailInput ? emailInput.value.trim() : (existing ? existing.email||'' : '');
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(email && !emailPattern.test(email)){ showToast(tr("That email doesn't look right")); return null; }
    return { name, email };
  }
  // Saves the local display profile and, if we now have a real Firebase account, aligns
  // state.profile.email with it — matches what's actually happening rather than showing stale info.
  function finishLogin(name, email){
    state.profile = { name, email };
    state.session.loggedIn = true;
    saveState();
    m.remove();
    renderMain();
    showToast(trWelcome(name));
  }
  function cloudErrorMessage(code){
    // A small, deliberately short map for the handful of errors a person will actually hit —
    // everything else falls back to a generic message rather than surfacing raw Firebase text.
    const map = {
      'auth/wrong-password': tr('Incorrect password'),
      'auth/invalid-credential': tr('Incorrect email or password'),
      'auth/user-not-found': tr('No account found with that email'),
      'auth/weak-password': tr('Password should be at least 6 characters'),
      'auth/invalid-email': tr("That email doesn't look right"),
      'auth/popup-closed-by-user': null, // user cancelled — no error toast needed
      'auth/network-request-failed': tr('No internet connection — try again'),
    };
    if(code && map[code]===null) return null;
    return (code && map[code]) || tr('Something went wrong — try again');
  }

  if(hasRealAccount){
    m.querySelector('#loginSave').addEventListener('click', ()=>{
      const info = readNameAndEmail();
      if(info) finishLogin(info.name, info.email);
    });
  } else {
    let mode = 'signup'; // 'signup' | 'login' — toggled by the link below, no separate screen
    const signUpBtn = m.querySelector('#loginSignUp');
    const switchLink = m.querySelector('#loginLogInInstead');
    function setMode(next){
      mode = next;
      signUpBtn.textContent = mode==='signup' ? tr('Create account') : tr('Log in');
      switchLink.textContent = mode==='signup' ? tr('Already have an account? Log in instead') : tr('New here? Create an account instead');
    }
    switchLink.addEventListener('click', ()=> setMode(mode==='signup' ? 'login' : 'signup'));

    signUpBtn.addEventListener('click', async ()=>{
      const info = readNameAndEmail();
      if(!info) return;
      if(!info.email){ showToast(tr('Enter your email')); return; }
      const password = m.querySelector('#loginPassword').value;
      if(!password || password.length<6){ showToast(tr('Password should be at least 6 characters')); return; }
      if(!cloud){ showToast(tr('Cloud backup is unavailable right now')); return; }
      signUpBtn.disabled = true;
      const result = mode==='signup'
        ? await cloud.signUpWithEmail(info.email, password)
        : await cloud.logInWithEmail(info.email, password);
      signUpBtn.disabled = false;
      if(!result.ok){
        const msg = cloudErrorMessage(result.code);
        if(msg) showToast(msg);
        return;
      }
      finishLogin(info.name, info.email);
    });

    m.querySelector('#loginGoogle').addEventListener('click', async ()=>{
      if(!cloud){ showToast(tr('Cloud backup is unavailable right now')); return; }
      const googleBtn = m.querySelector('#loginGoogle');
      googleBtn.disabled = true;
      const result = await cloud.signInWithGoogle();
      googleBtn.disabled = false;
      if(!result.ok){
        const msg = cloudErrorMessage(result.code);
        if(msg) showToast(msg);
        return;
      }
      const name = m.querySelector('#loginName').value.trim() || (cloud.getUser() && cloud.getUser().displayName) || '';
      if(!name){ showToast(tr('Enter a name')); return; }
      const user = cloud.getUser();
      finishLogin(name, (user && user.email) || '');
    });
  }

  setTimeout(()=>m.querySelector('#loginName').focus(), 100);
}

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
