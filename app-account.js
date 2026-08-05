// ---------- Account card + Auth/Manage-account modals (shared by Settings & Onboarding) ----------
// Visual/UX layer matching the account-auth prototype. Real backend wiring: Google sign-in,
// email sign-up/log-in, sign-out, and local file backup/restore (all pre-existing). NOT yet wired
// (deliberately, per owner decision — placeholder toasts only): Apple sign-in (no Apple Developer
// account configured), resend-verification, forgot-password email, change/add password, and
// account deletion. Each placeholder is a single, easy-to-grep `showToast(tr("... isn't connected
// yet"))` — swap these for real calls once that backend work happens.

const ICON_GOOGLE = `<svg viewBox="0 0 48 48" width="18" height="18"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.6-5.2-11.6-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l6-6C34.4 6.2 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11.5 0 19.6-8.1 19.6-19.5 0-1.3-.1-2.6-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.4 18.9 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l6-6C34.4 6.2 29.5 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.4 0 10.2-2.1 13.9-5.5l-6.4-5.4c-2 1.5-4.6 2.4-7.5 2.4-5.2 0-9.6-3.5-11.2-8.3l-6.5 5C9.6 39.6 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.4 5.4C40.9 36.5 44 30.9 44 24c0-1.3-.1-2.6-.4-3.5z"/></svg>`;
const ICON_APPLE = `<svg viewBox="0 0 384 512" width="18" height="18" fill="currentColor"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 25.8 4.7 52.5 14.2 80.1 12.6 36.7 58.1 126.7 105.6 125.2 24.8-.6 42.3-17.6 74.6-17.6 31.3 0 47.5 17.6 75.1 17.6 47.9-.7 89-82.5 101-119.3-64.2-30.2-55.8-88.5-55.8-90.8zM256.4 89.6c26.9-32 24.5-61.2 23.7-71.6-23.8 1.4-51.4 16.4-67.2 34.9-17.4 19.8-27.7 44.4-25.5 71.9 25.9 2 49.4-11 69-35.2z"/></svg>`;
const ICON_EYE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_EYE_OFF = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A10.9 10.9 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>`;

function initials(name){
  if(!name) return '?';
  const parts = name.trim().split(/\s+/).map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
  return parts || '?';
}

// A small, deliberately short map for the handful of errors a person will actually hit —
// everything else falls back to a generic message rather than surfacing raw Firebase text.
function cloudErrorMessage(code){
  const map = {
    'auth/wrong-password': tr('Incorrect password'),
    'auth/invalid-credential': tr('Incorrect email or password'),
    'auth/user-not-found': tr('No account found with that email'),
    'auth/email-already-in-use': tr('An account with that email already exists'),
    'auth/weak-password': tr('Password should be at least 6 characters'),
    'auth/invalid-email': tr("That email doesn't look right"),
    'auth/network-request-failed': tr('No internet connection — try again'),
  };
  return (code && map[code]) || tr('Something went wrong — try again');
}

// Live profile snapshot for rendering — never stored redundantly on `state`, always read fresh
// from state.profile (display name/email) + the real Firebase user (verified status, provider).
function getAccountProfile(){
  if(!(state.profile && state.session.loggedIn)) return null;
  const cloud = window.LifyarCloud;
  const user = cloud ? cloud.getUser() : null;
  const providerId = (user && user.providerData && user.providerData[0] && user.providerData[0].providerId) || 'password';
  const provider = providerId === 'google.com' ? 'google' : providerId === 'apple.com' ? 'apple' : 'password';
  // If cloud isn't available yet, don't nag about verification we can't actually check.
  const verified = user ? !!user.emailVerified : true;
  return {
    name: state.profile.name,
    email: state.profile.email || (user && user.email) || '',
    verified, provider
  };
}

function openAccountModal(innerHtml){
  return openModal(`<div class="modal-inner">${innerHtml}</div>`);
}

/* ============================================================
   ACCOUNT CARD — shared by Settings and Onboarding
============================================================ */
function accountCardHtml(context){
  const profile = getAccountProfile();
  const isOnboarding = context === 'onboarding';

  if(!profile){
    return `
      <div class="settings-group">
        <div class="settings-group-title">${tr('Account')}</div>
        <div class="item-sub" style="margin-bottom:14px;">
          ${isOnboarding
            ? tr('Create an account to back up your data and pick up right where you left off on any device.')
            : tr('Sign in to back up your data to the cloud, or restore it on another device.')}
        </div>
        <button class="settings-btn" style="text-align:center;font-weight:500;" id="btnOpenAuth-${context}">
          ${tr('Sign up or log in')}
        </button>
      </div>
    `;
  }

  const providerLabel = profile.provider === 'google' ? tr('Google') : profile.provider === 'apple' ? tr('Apple') : tr('Email');
  const providerIcon = profile.provider === 'google' ? ICON_GOOGLE : profile.provider === 'apple' ? ICON_APPLE : null;

  return `
    <div class="settings-group">
      <div class="settings-group-title">${tr('Account')}</div>
      <div class="account-card">
        <div class="acc-head">
          <div class="acc-avatar">${initials(profile.name)}</div>
          <div style="flex:1;min-width:0;">
            <div class="acc-name-row">
              <span class="acc-name">${escapeHtml(profile.name)}</span>
              ${profile.verified
                ? `<span class="verify-badge ok">✓ ${tr('Verified')}</span>`
                : `<span class="verify-badge pending">${tr('Unverified')}</span>`}
            </div>
            <div class="acc-email">${escapeHtml(profile.email)}</div>
          </div>
        </div>
        <div class="provider-row">
          ${tr('Signed in with')}
          <span class="provider-chip">${providerIcon ? `<span class="glyph">${providerIcon}</span>` : ''}${providerLabel}</span>
        </div>

        ${!profile.verified ? `
        <div class="verify-banner">
          <span>${tr('Verify your email to enable cloud backup.')}</span>
          <button type="button" id="btnResendVerify-${context}">${tr('Resend')}</button>
        </div>` : ''}

        <div class="settings-btn-row">
          ${isOnboarding ? `
            <button class="settings-btn" id="btnRestore-${context}">${tr('Restore from cloud')}</button>
          ` : `
            <button class="settings-btn" id="btnBackup-${context}">${tr('Back up now')}</button>
            <button class="settings-btn" id="btnRestore-${context}">${tr('Restore from cloud')}</button>
            <button class="settings-btn" id="btnManage-${context}">${tr('Manage account')}</button>
          `}
          <button class="settings-btn danger-text" id="btnSignOut-${context}">${tr('Sign out')}</button>
        </div>
      </div>
    </div>
  `;
}

// `root` is whatever element the card's HTML was just injected into (settings' `main`, or
// onboarding's step-2 `content`) — every lookup below is scoped to it, not the whole document,
// so the settings and onboarding copies of this card never cross-wire each other.
function wireAccountCard(root, context){
  const openBtn = root.querySelector(`#btnOpenAuth-${context}`);
  if(openBtn) openBtn.addEventListener('click', ()=> openAuthModal());

  const rerender = ()=>{ if(context==='onboarding') renderOnboarding(); else renderSettings(document.getElementById('overlayContent')); };

  const signOutBtn = root.querySelector(`#btnSignOut-${context}`);
  if(signOutBtn) signOutBtn.addEventListener('click', ()=>{
    if(confirm(tr('Sign out? Your data stays saved on this device — you can log back in anytime.'))){
      state.session.loggedIn = false;
      saveState();
      if(window.LifyarCloud) window.LifyarCloud.signOutCloud();
      showToast(tr('Signed out'));
      rerender();
    }
  });

  const resendBtn = root.querySelector(`#btnResendVerify-${context}`);
  if(resendBtn) resendBtn.addEventListener('click', ()=> showToast(tr("Email verification isn't connected yet")));

  const backupBtn = root.querySelector(`#btnBackup-${context}`);
  if(backupBtn) backupBtn.addEventListener('click', ()=> backupData());

  const restoreBtn = root.querySelector(`#btnRestore-${context}`);
  if(restoreBtn) restoreBtn.addEventListener('click', ()=> restoreData());

  const manageBtn = root.querySelector(`#btnManage-${context}`);
  if(manageBtn) manageBtn.addEventListener('click', ()=> openManageModal());
}

/* ============================================================
   AUTH MODAL — choose provider -> email entry -> sign up / log in / forgot password
============================================================ */
function openAuthModal(mode = 'choose'){
  const m = openAccountModal(authModalBody(mode));
  wireAuthModal(m, mode);
  return m;
}

function authModalBody(mode){
  if(mode === 'choose'){
    return `
      <button class="modal-close-x" type="button" data-close>✕</button>
      <h3>${tr('Sign up or log in')}</h3>
      <p class="modal-sub">${tr('Create an account to keep your data backed up and synced across devices.')}</p>

      <button class="btn-oauth" type="button" id="oauthGoogle">${ICON_GOOGLE} ${tr('Continue with Google')}</button>
      <div style="height:10px;"></div>
      <button class="btn-oauth" type="button" id="oauthApple" disabled><span style="color:var(--ink);">${ICON_APPLE}</span> ${tr('Continue with Apple — coming soon')}</button>

      <div class="divider-row">${tr('or continue with email')}</div>

      <button class="btn-secondary" type="button" id="goEmail" style="width:100%;color:var(--ink);">${tr('Continue with email')}</button>
    `;
  }
  if(mode === 'email-entry'){
    return `
      <button class="modal-close-x" type="button" data-close>✕</button>
      <h3>${tr('Continue with email')}</h3>
      <p class="modal-sub">${tr('Enter your email to sign up or log in.')}</p>
      <div class="field">
        <label>${tr('Email')}</label>
        <input id="fEmail" type="email" placeholder="you@example.com" autocomplete="email">
        <div class="field-err" id="errEmail">${tr('Enter a valid email address')}</div>
      </div>
      <button class="btn-primary" type="button" id="btnEmailNext" style="width:100%;">${tr('Next')}</button>
      <p class="form-footnote"><button class="link-btn" type="button" data-back="choose">← ${tr('Back')}</button></p>
    `;
  }
  if(mode === 'signup'){
    return `
      <button class="modal-close-x" type="button" data-close>✕</button>
      <h3>${tr('Create your account')}</h3>
      <p class="modal-sub">${tr('This account backs up your routines, tasks, and score — nothing is shared publicly.')}</p>
      <div class="field">
        <label>${tr('Name')}</label>
        <input id="fName" type="text" placeholder="${tr('Your name')}" autocomplete="name">
      </div>
      <div class="field">
        <label>${tr('Email')}</label>
        <input id="fEmail2" type="email" value="" placeholder="you@example.com" autocomplete="email">
      </div>
      <div class="field">
        <label>${tr('Password')}</label>
        <div class="field-pw-wrap">
          <input id="fPassword" type="password" placeholder="${tr('At least 6 characters')}" autocomplete="new-password">
          <button type="button" class="pw-toggle" data-pwtoggle="fPassword">${ICON_EYE}</button>
        </div>
        <div class="pw-strength" id="pwStrength"><i></i><i></i><i></i></div>
        <div class="pw-hint">${tr('Use 6+ characters with a mix of letters and numbers.')}</div>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="fTerms">
        <label for="fTerms">${tr('I agree to the Terms and Privacy Policy.')}</label>
      </div>
      <button class="btn-primary" type="button" id="btnCreateAccount" style="width:100%;">${tr('Create account')}</button>
      <p class="form-footnote">${tr('Already have an account?')} <button class="link-btn" type="button" data-mode="login">${tr('Log in')}</button></p>
    `;
  }
  if(mode === 'login'){
    return `
      <button class="modal-close-x" type="button" data-close>✕</button>
      <h3>${tr('Log in')}</h3>
      <p class="modal-sub">${tr('Welcome back.')}</p>
      <div class="field">
        <label>${tr('Email')}</label>
        <input id="fEmail3" type="email" placeholder="you@example.com" autocomplete="email">
      </div>
      <div class="field">
        <label>${tr('Password')}</label>
        <div class="field-pw-wrap">
          <input id="fPassword2" type="password" placeholder="${tr('Your password')}" autocomplete="current-password">
          <button type="button" class="pw-toggle" data-pwtoggle="fPassword2">${ICON_EYE}</button>
        </div>
        <div class="field-err" id="errLogin">${tr("That email and password don't match.")}</div>
      </div>
      <p style="text-align:right;margin:-6px 0 14px;"><button class="link-btn" type="button" data-mode="forgot">${tr('Forgot password?')}</button></p>
      <button class="btn-primary" type="button" id="btnLogin" style="width:100%;">${tr('Log in')}</button>
      <p class="form-footnote">${tr('New here?')} <button class="link-btn" type="button" data-mode="signup">${tr('Create an account')}</button></p>
    `;
  }
  if(mode === 'forgot'){
    return `
      <button class="modal-close-x" type="button" data-close>✕</button>
      <h3>${tr('Reset your password')}</h3>
      <p class="modal-sub">${tr("Enter your email and we'll send a link to reset your password.")}</p>
      <div class="field">
        <label>${tr('Email')}</label>
        <input id="fEmail4" type="email" placeholder="you@example.com" autocomplete="email">
      </div>
      <button class="btn-primary" type="button" id="btnSendReset" style="width:100%;">${tr('Send reset link')}</button>
      <p class="form-footnote"><button class="link-btn" type="button" data-mode="login">← ${tr('Back to log in')}</button></p>
    `;
  }
  if(mode === 'reset-sent'){
    return `
      <button class="modal-close-x" type="button" data-close>✕</button>
      <h3>${tr('Check your email')}</h3>
      <p class="modal-sub">${tr('We sent a password reset link to your inbox. Follow the link to choose a new password.')}</p>
      <button class="btn-primary" type="button" data-close style="width:100%;">${tr('Done')}</button>
    `;
  }
}

function wireAuthModal(m, mode){
  const cloud = window.LifyarCloud;
  const swapTo = (next)=>{
    m.querySelector('.modal-inner').innerHTML = authModalBody(next);
    wireAuthModal(m, next);
  };

  m.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', ()=> m.remove()));
  m.querySelectorAll('[data-back]').forEach(el => el.addEventListener('click', ()=> swapTo(el.dataset.back)));
  m.querySelectorAll('[data-mode]').forEach(el => el.addEventListener('click', ()=> swapTo(el.dataset.mode)));
  m.querySelectorAll('[data-pwtoggle]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const input = m.querySelector('#'+btn.dataset.pwtoggle);
      const isPw = input.type === 'password';
      input.type = isPw ? 'text' : 'password';
      btn.innerHTML = isPw ? ICON_EYE_OFF : ICON_EYE;
    });
  });

  if(mode === 'choose'){
    m.querySelector('#oauthGoogle').addEventListener('click', ()=>{
      if(!cloud){ showToast(tr('Cloud backup is unavailable right now')); return; }
      // Google sign-in navigates the whole page away and back (a redirect, not a popup — see
      // app-firebase.js) — this click handler's execution effectively ends at signInWithGoogle()
      // below. Picked back up by handlePendingGoogleRedirect() in app-onboarding.js, which falls
      // back to the Google account's own display name since there's no name field on this screen.
      try{ localStorage.setItem(PENDING_GOOGLE_KEY, JSON.stringify({ wasOnboarding: onboardingActive, obStep: onboardingActive ? obStep : undefined })); }catch(e){ /* best effort */ }
      const btn = m.querySelector('#oauthGoogle');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> ${tr('Connecting to Google…')}`;
      cloud.signInWithGoogle();
    });
    m.querySelector('#oauthApple').addEventListener('click', ()=> showToast(tr('Apple sign-in is coming soon')));
    m.querySelector('#goEmail').addEventListener('click', ()=> swapTo('email-entry'));
  }

  if(mode === 'email-entry'){
    m.querySelector('#btnEmailNext').addEventListener('click', ()=>{
      const email = m.querySelector('#fEmail').value.trim();
      const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if(!pattern.test(email)){
        m.querySelector('#fEmail').closest('.field').classList.add('has-error');
        m.querySelector('#errEmail').classList.add('show');
        return;
      }
      // We can't check (without new backend work) whether this email already has an account, so
      // default to signup — the "Already have an account? Log in" link on that screen covers it.
      swapTo('signup');
      setTimeout(()=>{ const f = m.querySelector('#fEmail2'); if(f) f.value = email; }, 0);
    });
  }

  if(mode === 'signup'){
    const pwInput = m.querySelector('#fPassword');
    pwInput.addEventListener('input', ()=>{
      const v = pwInput.value;
      const bar = m.querySelector('#pwStrength');
      bar.className = 'pw-strength';
      if(v.length >= 10 && /[0-9]/.test(v) && /[A-Z]/.test(v)) bar.classList.add('strong');
      else if(v.length >= 6) bar.classList.add('medium');
      else if(v.length > 0) bar.classList.add('weak');
    });
    m.querySelector('#btnCreateAccount').addEventListener('click', async ()=>{
      const name = m.querySelector('#fName').value.trim();
      const email = m.querySelector('#fEmail2').value.trim();
      const pw = m.querySelector('#fPassword').value;
      const terms = m.querySelector('#fTerms').checked;
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if(!name){ showToast(tr('Enter your name')); return; }
      if(!emailPattern.test(email)){ showToast(tr("That email doesn't look right")); return; }
      if(pw.length < 6){ showToast(tr('Password should be at least 6 characters')); return; }
      if(!terms){ showToast(tr('Please agree to the Terms to continue')); return; }
      if(!cloud){ showToast(tr('Cloud backup is unavailable right now')); return; }
      const btn = m.querySelector('#btnCreateAccount');
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${tr('Creating account…')}`;
      const result = await cloud.signUpWithEmail(email, pw);
      if(!result.ok){
        btn.disabled = false; btn.textContent = tr('Create account');
        showToast(cloudErrorMessage(result.code));
        return;
      }
      m.remove();
      completeCloudSignIn(name, email, onboardingActive, onboardingActive ? obStep : undefined);
    });
  }

  if(mode === 'login'){
    m.querySelector('#btnLogin').addEventListener('click', async ()=>{
      const email = m.querySelector('#fEmail3').value.trim();
      const pw = m.querySelector('#fPassword2').value;
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if(!emailPattern.test(email)){ showToast(tr("That email doesn't look right")); return; }
      if(!pw){ showToast(tr('Enter your password')); return; }
      if(!cloud){ showToast(tr('Cloud backup is unavailable right now')); return; }
      const btn = m.querySelector('#btnLogin');
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${tr('Logging in…')}`;
      const result = await cloud.logInWithEmail(email, pw);
      if(!result.ok){
        btn.disabled = false; btn.textContent = tr('Log in');
        m.querySelector('#errLogin').classList.add('show');
        showToast(cloudErrorMessage(result.code));
        return;
      }
      m.remove();
      const user = cloud.getUser();
      const name = (user && user.displayName) || (state.profile && state.profile.name) || email.split('@')[0];
      completeCloudSignIn(name, email, onboardingActive, onboardingActive ? obStep : undefined);
    });
  }

  if(mode === 'forgot'){
    m.querySelector('#btnSendReset').addEventListener('click', ()=> showToast(tr("Password reset isn't connected yet")));
  }
}

/* ============================================================
   MANAGE ACCOUNT MODAL (settings-only, deeper account controls)
============================================================ */
function openManageModal(){
  const profile = getAccountProfile();
  if(!profile) return;
  const providerLabel = profile.provider === 'google' ? tr('Google') : profile.provider === 'apple' ? tr('Apple') : tr('Email & password');
  const html = `
    <button class="modal-close-x" type="button" data-close>✕</button>
    <h3>${tr('Manage account')}</h3>
    <p class="modal-sub">${escapeHtml(profile.email)}</p>

    <div class="settings-group">
      <div class="settings-group-title">${tr('Sign-in method')}</div>
      <div class="item-sub" style="margin-bottom:10px;">${tr('Signed in with')} ${providerLabel}.</div>
      ${profile.provider === 'password' ? `
      <div class="settings-btn-row">
        <button class="settings-btn" id="btnChangePw">${tr('Change password')}</button>
      </div>` : `
      <div class="empty-state-mini">${tr('Password sign-in is not set up for this account. Add a password so you can also sign in without')} ${providerLabel}.</div>
      <div class="settings-btn-row">
        <button class="settings-btn" id="btnAddPw">${tr('Add a password')}</button>
      </div>`}
    </div>

    <div class="settings-group">
      <div class="settings-group-title">${tr('Danger zone')}</div>
      <div class="settings-btn-row">
        <button class="settings-btn danger-text" id="btnDeleteAcct">${tr('Delete account')}</button>
      </div>
      <div class="item-sub" style="margin-top:8px;">${tr('Your routines, tasks, and score stay on this device — only the account and cloud backup are removed.')}</div>
    </div>
  `;
  const m = openAccountModal(html);
  m.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', ()=> m.remove()));
  const changePw = m.querySelector('#btnChangePw');
  if(changePw) changePw.addEventListener('click', ()=>{ m.remove(); openChangePasswordModal(false); });
  const addPw = m.querySelector('#btnAddPw');
  if(addPw) addPw.addEventListener('click', ()=>{ m.remove(); openChangePasswordModal(true); });
  m.querySelector('#btnDeleteAcct').addEventListener('click', ()=>{
    if(confirm(tr('Permanently delete this account? This removes your cloud backup — routines, tasks, and scores stored on this device are not affected.'))){
      m.remove();
      showToast(tr("Account deletion isn't connected yet"));
    }
  });
}

function openChangePasswordModal(isAdd){
  const html = `
    <button class="modal-close-x" type="button" data-close>✕</button>
    <h3>${isAdd ? tr('Add a password') : tr('Change password')}</h3>
    <p class="modal-sub">${isAdd ? tr('Set a password so you can sign in without Google or Apple.') : tr('Enter your current password, then choose a new one.')}</p>
    ${!isAdd ? `
    <div class="field">
      <label>${tr('Current password')}</label>
      <input type="password" placeholder="${tr('Current password')}">
    </div>` : ''}
    <div class="field">
      <label>${tr('New password')}</label>
      <div class="field-pw-wrap">
        <input id="fNewPw" type="password" placeholder="${tr('At least 6 characters')}">
        <button type="button" class="pw-toggle" data-pwtoggle="fNewPw">${ICON_EYE}</button>
      </div>
    </div>
    <button class="btn-primary" type="button" id="btnSavePw" style="width:100%;">${isAdd ? tr('Add password') : tr('Update password')}</button>
  `;
  const m = openAccountModal(html);
  m.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', ()=> m.remove()));
  m.querySelectorAll('[data-pwtoggle]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const input = m.querySelector('#'+btn.dataset.pwtoggle);
      const isPw = input.type === 'password';
      input.type = isPw ? 'text' : 'password';
      btn.innerHTML = isPw ? ICON_EYE_OFF : ICON_EYE;
    });
  });
  m.querySelector('#btnSavePw').addEventListener('click', ()=>{
    m.remove();
    showToast(isAdd ? tr("Adding a password isn't connected yet") : tr("Changing your password isn't connected yet"));
  });
}
