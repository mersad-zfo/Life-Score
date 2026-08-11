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
const ICON_CHECK = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

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
    'auth/requires-recent-login': tr('Please re-enter your password to confirm — this needs a fresh sign-in'),
    'auth/too-many-requests': tr('Too many attempts — try again in a bit'),
    'auth/provider-already-linked': tr('A password is already set for this account'),
  };
  return (code && map[code]) || tr('Something went wrong — try again');
}

// Live profile snapshot for rendering — never stored redundantly on `state`, always read fresh
// from state.profile (display name/email) + the real Firebase user (verified status, provider).
function getAccountProfile(){
  if(!(state.profile && state.session.loggedIn)) return null;
  const cloud = window.LifyarCloud;
  const user = cloud ? cloud.getUser() : null;
  // An account can have BOTH google.com and password linked at once (e.g. after connecting a
  // Google account to an existing email/password one, or adding a password to a Google-only
  // one) — looking at providerData[0] alone breaks the moment that happens, since it only ever
  // reflects whichever provider happened to be linked first. hasPassword checks the whole list.
  const providerIds = (user && user.providerData && user.providerData.map(p => p.providerId)) || [];
  const hasPassword = providerIds.includes('password');
  const hasGoogle = providerIds.includes('google.com');
  // "provider" below is just for the small badge/icon on the account card — prefer Google when
  // both are present since it's the richer identity (real name/photo), not a meaningful claim
  // about which one is "primary".
  const provider = hasGoogle ? 'google' : providerIds.includes('apple.com') ? 'apple' : 'password';
  // If cloud isn't available yet, don't nag about verification we can't actually check.
  const verified = user ? cloud.isAccountVerified(user) : true;
  return {
    name: state.profile.name,
    email: state.profile.email || (user && user.email) || '',
    verified, provider, hasPassword
  };
}

function openAccountModal(innerHtml){
  return openModal(`<div class="modal-inner">${innerHtml}</div>`);
}

// Shared by every account-related action that needs to refresh the settings/onboarding view
// after changing something (sign out, cancel pending verification, delete account, change name,
// etc.) — context defaults to onboarding-vs-settings based on onboardingActive when not passed.
function rerenderAccountView(context){
  const ctx = context || (onboardingActive ? 'onboarding' : 'settings');
  if(ctx === 'onboarding') renderOnboarding(); else renderSettings(document.getElementById('overlayContent'));
}

const PENDING_EMAIL_VERIFY_KEY = 'lifyar_pending_email_verify';
function stashPendingEmailVerify(name, email){
  try{ localStorage.setItem(PENDING_EMAIL_VERIFY_KEY, JSON.stringify({ name, email })); }catch(e){ /* best effort */ }
}
function readPendingEmailVerify(){
  try{
    const raw = localStorage.getItem(PENDING_EMAIL_VERIFY_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function clearPendingEmailVerify(){
  try{ localStorage.removeItem(PENDING_EMAIL_VERIFY_KEY); }catch(e){ /* best effort */ }
}

// A real (non-anonymous) Firebase user who hasn't clicked their verification link yet counts as
// NOT signed in, by design — see the note on pushState/pullState in app-firebase.js. This is what
// lets accountCardHtml (and the boot-time check in app-main.js) recognize "there's a signup
// waiting to be finished" without needing its own separate bookkeeping — it's entirely derived
// from Firebase's own user object plus whether we've actually completed sign-in locally yet.
function getPendingVerificationEmail(){
  if(state.profile && state.session.loggedIn) return null;
  const cloud = window.LifyarCloud;
  const user = cloud ? cloud.getUser() : null;
  if(user && !user.isAnonymous && cloud && !cloud.isAccountVerified(user)) return user.email;
  return null;
}

// Checks (against Firebase's servers, not a cached flag) whether the pending sign-up has been
// verified yet, and if so, finishes it — same completeCloudSignIn every other sign-in path uses.
// `silent` suppresses the "not verified yet" toast for automatic checks (window focus, app boot)
// where nagging the person for just switching tabs would be annoying; the manual "I've verified —
// continue" button passes silent=false so a too-early click gets clear feedback.
// Returns true if sign-in was actually completed just now.
async function tryCompletePendingVerification(context, silent){
  // If sign-in already completed — e.g. the background visibility-based check (below) beat a
  // manual button click to it — there's nothing left to do. The caller (typically a modal's
  // "I've verified" button) still needs a true/false answer so it knows to close itself instead
  // of just sitting there looking stuck, which is why this returns true here rather than false.
  if(state.profile && state.session.loggedIn) return true;
  const cloud = window.LifyarCloud;
  if(!cloud) return false;
  const user = cloud.getUser();
  if(!user || user.isAnonymous) return false; // no pending signup to check at all
  if(!cloud.isAccountVerified(user)){
    const result = await cloud.checkEmailVerified();
    if(!result.verified && !cloud.isAccountVerified(cloud.getUser())){
      if(!silent) showToast(tr("Not verified yet — check your inbox and tap the link."));
      return false;
    }
  }
  const pending = readPendingEmailVerify();
  const name = (pending && pending.name) || user.displayName || (user.email ? user.email.split('@')[0] : '') || tr('Account');
  const email = (pending && pending.email) || user.email || '';
  clearPendingEmailVerify();
  await completeCloudSignIn(name, email, onboardingActive, onboardingActive ? obStep : undefined);
  return true;
}

// Best-effort auto-detection: if they switch back to this tab after checking their email,
// silently check whether they've verified yet and finish signing them in if so. The manual
// "I've verified — continue" button and the boot-time check in app-main.js are the reliable
// fallbacks — visibility events aren't guaranteed on every platform.
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible'){
    tryCompletePendingVerification(onboardingActive ? 'onboarding' : 'settings', true).then(completed=>{
      // This runs in the background, independent of whatever modal (if any) is currently open —
      // if it just finished signing someone in while their "verify your email" screen was still
      // showing, that screen is now stale and needs closing, or it just sits there looking like
      // nothing happened even though sign-in already succeeded.
      if(completed && currentAuthModal && currentAuthModal.isConnected){
        currentAuthModal.remove();
      }
    });
  }
});

/* ============================================================
   ACCOUNT CARD — shared by Settings and Onboarding
============================================================ */
function accountCardHtml(context){
  const profile = getAccountProfile();
  const isOnboarding = context === 'onboarding';
  const pendingEmail = !profile ? getPendingVerificationEmail() : null;

  if(pendingEmail){
    return `
      <div class="settings-group">
        <div class="settings-group-title">${tr('Account')}</div>
        <div class="account-card pending">
          <div class="acc-head">
            <div class="acc-avatar" style="background:var(--line);color:var(--ink-soft);">✉</div>
            <div style="flex:1;min-width:0;">
              <div class="acc-name-row">
                <span class="acc-name">${tr('Verify your email')}</span>
                <span class="verify-badge pending">${tr('Unverified')}</span>
              </div>
              <div class="acc-email">${escapeHtml(pendingEmail)}</div>
            </div>
          </div>
          <div class="verify-banner">
            <span>${tr('Check your inbox to finish signing up.')}</span>
            <button type="button" id="btnResendPending-${context}">${tr('Resend')}</button>
          </div>
          <div class="settings-btn-row">
            <button class="settings-btn" id="btnCheckVerified-${context}">${tr("I've verified — continue")}</button>
            <button class="settings-btn danger-text" id="btnCancelPending-${context}">${tr('Use a different email')}</button>
          </div>
        </div>
      </div>
    `;
  }

  if(!profile){
    return `
      <div class="settings-group">
        <div class="settings-group-title">${tr('Account')}</div>
        <div class="account-card" style="text-align:center;">
          <div class="item-sub" style="margin-bottom:14px;">
            ${isOnboarding
              ? tr('Create an account to back up your data and pick up right where you left off on any device.')
              : tr('Sign in to back up your data to the cloud, or restore it on another device.')}
          </div>
          <button class="settings-btn" style="text-align:center;font-weight:500;" id="btnOpenAuth-${context}">
            ${tr('Sign up or log in')}
          </button>
        </div>
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
            <button class="settings-btn" id="btnRestore-${context}">${tr('Local restore')}</button>
          ` : `
            <button class="settings-btn" id="btnBackupRestore-${context}">${tr('Backup/Restore')}</button>
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

  const rerender = ()=> rerenderAccountView(context);

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
  if(resendBtn) resendBtn.addEventListener('click', async ()=>{
    const cloud = window.LifyarCloud;
    if(!cloud) return;
    resendBtn.disabled = true;
    const result = await cloud.sendVerificationEmail();
    resendBtn.disabled = false;
    showToast(result.ok ? tr('Verification email sent') : cloudErrorMessage(result.code));
  });

  const resendPendingBtn = root.querySelector(`#btnResendPending-${context}`);
  if(resendPendingBtn) resendPendingBtn.addEventListener('click', async ()=>{
    const cloud = window.LifyarCloud;
    if(!cloud) return;
    resendPendingBtn.disabled = true;
    const result = await cloud.sendVerificationEmail();
    resendPendingBtn.disabled = false;
    showToast(result.ok ? tr('Verification email sent') : cloudErrorMessage(result.code));
  });

  const checkVerifiedBtn = root.querySelector(`#btnCheckVerified-${context}`);
  if(checkVerifiedBtn) checkVerifiedBtn.addEventListener('click', async ()=>{
    checkVerifiedBtn.disabled = true;
    const completed = await tryCompletePendingVerification(context, false);
    if(!completed) checkVerifiedBtn.disabled = false;
  });

  const cancelPendingBtn = root.querySelector(`#btnCancelPending-${context}`);
  if(cancelPendingBtn) cancelPendingBtn.addEventListener('click', async ()=>{
    const cloud = window.LifyarCloud;
    if(cloud) await cloud.signOutCloud();
    clearPendingEmailVerify();
    rerender();
  });

  const backupRestoreBtn = root.querySelector(`#btnBackupRestore-${context}`);
  if(backupRestoreBtn) backupRestoreBtn.addEventListener('click', ()=> openBackupRestoreModal());

  const restoreBtn = root.querySelector(`#btnRestore-${context}`);
  if(restoreBtn) restoreBtn.addEventListener('click', ()=> restoreData());

  const manageBtn = root.querySelector(`#btnManage-${context}`);
  if(manageBtn) manageBtn.addEventListener('click', ()=> openManageModal());
}

function openBackupRestoreModal(){
  const html = `
    <button class="modal-close-x" type="button" data-close>✕</button>
    <h3>${tr('Backup/Restore')}</h3>
    <p class="modal-sub">${tr('Save a copy of your data to a file, or restore from one.')}</p>
    <div class="settings-btn-row">
      <button class="settings-btn" id="btnBackupInModal">${tr('Back up now')}</button>
      <button class="settings-btn" id="btnRestoreInModal">${tr('Restore')}</button>
    </div>
  `;
  const m = openAccountModal(html);
  m.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', ()=> m.remove()));
  m.querySelector('#btnBackupInModal').addEventListener('click', ()=> backupData());
  m.querySelector('#btnRestoreInModal').addEventListener('click', ()=> restoreData());
}

/* ============================================================
   AUTH MODAL — choose provider -> email entry -> sign up / log in / forgot password
============================================================ */
let currentAuthModal = null;

function openAuthModal(mode = 'choose'){
  const m = openAccountModal(authModalBody(mode));
  currentAuthModal = m;
  wireAuthModal(m, mode);
  return m;
}

function authModalBody(mode, ctx){
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
        <div class="field-err" id="errLogin">
          <span id="errLoginText"></span>
          <button type="button" class="link-btn" id="tryGoogleLink" style="margin-inline-start:6px;display:none;">${tr('Try Google')}</button>
        </div>
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
  if(mode === 'link-google'){
    const email = (ctx && ctx.email) || '';
    return `
      <button class="modal-close-x" type="button" data-close>✕</button>
      <h3>${tr('Connect your Google account')}</h3>
      <p class="modal-sub">${tr('An account with this email already exists. Enter its password to connect your Google account to it — after that, either one signs you in.')}</p>
      <div class="field">
        <label>${tr('Email')}</label>
        <input id="fLinkEmail" type="email" placeholder="you@example.com" autocomplete="email" value="${escapeHtml(email)}">
      </div>
      <div class="field">
        <label>${tr('Password')}</label>
        <div class="field-pw-wrap">
          <input id="fLinkPassword" type="password" placeholder="${tr('Your password')}" autocomplete="current-password">
          <button type="button" class="pw-toggle" data-pwtoggle="fLinkPassword">${ICON_EYE}</button>
        </div>
        <div class="field-err" id="errLink">${tr('Incorrect password')}</div>
      </div>
      <button class="btn-primary" type="button" id="btnLinkGoogle" style="width:100%;">${tr('Connect account')}</button>
    `;
  }
  if(mode === 'verify-pending'){
    const email = (ctx && ctx.email) || '';
    return `
      <button class="modal-close-x" type="button" data-close>✕</button>
      <h3>${tr('Verify your email')}</h3>
      <p class="modal-sub">${tr('We sent a link to')} <strong>${escapeHtml(email)}</strong>. ${tr('Click it, then come back here to finish signing up.')}</p>
      <button class="btn-primary" type="button" id="btnCheckVerifiedModal" style="width:100%;">${tr("I've verified — continue")}</button>
      <p class="form-footnote">
        <button class="link-btn" type="button" id="btnResendModal">${tr('Resend email')}</button>
        &nbsp;·&nbsp;
        <button class="link-btn" type="button" id="btnCancelPendingModal">${tr('Use a different email')}</button>
      </p>
    `;
  }
  if(mode === 'google-name'){
    return `
      <button class="modal-close-x" type="button" data-close>✕</button>
      <h3>${tr('One more thing')}</h3>
      <p class="modal-sub">${tr("What's your name?")}</p>
      <div class="field">
        <label>${tr('Name')}</label>
        <input id="fGoogleName" type="text" placeholder="${tr('Your name')}" autocomplete="name">
      </div>
      <button class="btn-primary" type="button" id="btnGoogleNameNext" style="width:100%;">${tr('Continue')}</button>
    `;
  }
}

function wireAuthModal(m, mode){
  const cloud = window.LifyarCloud;
  const swapTo = (next, ctx)=>{
    m.querySelector('.modal-inner').innerHTML = authModalBody(next, ctx);
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

  // Shared by the "Continue with Google" button on the choose screen and the "Try Google" link
  // shown after a failed email login (in case that email actually belongs to a Google-only
  // account with no password set) — same outcome either way, just a different trigger button and
  // idle label to restore on failure.
  const runGoogleSignIn = async (btn, idleLabel)=>{
    if(!cloud){ showToast(tr('Cloud backup is unavailable right now')); return; }
    const originalDisabled = btn.disabled;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${tr('Connecting to Google…')}`;
    const result = await cloud.signInWithGoogle();
    if(!result.ok){
      btn.disabled = originalDisabled;
      btn.innerHTML = idleLabel;
      if(result.needsLink){
        // Stash the pending Google credential on the modal itself (not in the HTML, obviously)
        // before swapping steps, so the link-google step below can still reach it.
        m._pendingGoogleCredential = result.credential;
        swapTo('link-google', { email: result.email || '' });
        return;
      }
      if(result.code !== 'auth/popup-closed-by-user' && result.code !== 'auth/cancelled-popup-request'){
        showToast(cloudErrorMessage(result.code));
      }
      return;
    }
    const user = result.user || cloud.getUser();
    if(result.isNewUser){
      // Brand-new account — same requirement as email signup: we need a name before completing
      // sign-in. Existing accounts keep whatever name they already have (see completeCloudSignIn
      // in app-onboarding.js) — this step only appears for genuinely first-time sign-ups.
      swapTo('google-name', {});
      return;
    }
    const name = (state.profile && state.profile.name) || user.displayName || (user.email ? user.email.split('@')[0] : '') || tr('Account');
    m.remove();
    completeCloudSignIn(name, user.email || '', onboardingActive, onboardingActive ? obStep : undefined);
  };

  if(mode === 'choose'){
    m.querySelector('#oauthGoogle').addEventListener('click', ()=>{
      runGoogleSignIn(m.querySelector('#oauthGoogle'), `${ICON_GOOGLE} ${tr('Continue with Google')}`);
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
      // default to the login screen — the "New here? Create an account" link there covers signup.
      swapTo('login');
      setTimeout(()=>{ const f = m.querySelector('#fEmail3'); if(f) f.value = email; }, 0);
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
        showToast(result.ambiguousProvider ? tr('Something went wrong. Try Google.') : cloudErrorMessage(result.code), 3500);
        return;
      }
      const user = result.user || cloud.getUser();
      if(user && !cloud.isAccountVerified(user)){
        stashPendingEmailVerify(name, email);
        await cloud.sendVerificationEmail();
        m.querySelector('.modal-inner').innerHTML = authModalBody('verify-pending', { email });
        wireAuthModal(m, 'verify-pending');
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
        const errText = m.querySelector('#errLoginText');
        const tryGoogleBtn = m.querySelector('#tryGoogleLink');
        if(result.ambiguousProvider){
          // Deliberately the SAME message regardless of which of several possible causes this
          // actually is (wrong password / no account yet / a Google-only account with no
          // password) — Firebase's email-enumeration protection means it won't tell us which,
          // and showing different wording per case would leak exactly the info that setting
          // exists to hide. See the note on ambiguousProvider in app-firebase.js. Just "Something
          // went wrong." here, not "...Try Google" too — the green button right next to this
          // already says that; repeating it in the red text was showing "Try Google" twice.
          errText.textContent = tr('Something went wrong.');
          tryGoogleBtn.style.display = '';
        } else {
          // A non-ambiguous failure (e.g. no account at all under that email) — showing "Try
          // Google" here would be misleading, since Google would just create a brand new account
          // rather than reach an existing one.
          errText.textContent = cloudErrorMessage(result.code);
          tryGoogleBtn.style.display = 'none';
        }
        m.querySelector('#errLogin').classList.add('show');
        showToast(result.ambiguousProvider ? tr('Something went wrong. Try Google.') : cloudErrorMessage(result.code), 3500);
        return;
      }
      const user = result.user || cloud.getUser();
      if(user && !cloud.isAccountVerified(user)){
        stashPendingEmailVerify((user && user.displayName) || email.split('@')[0], email);
        await cloud.sendVerificationEmail();
        m.querySelector('.modal-inner').innerHTML = authModalBody('verify-pending', { email });
        wireAuthModal(m, 'verify-pending');
        return;
      }
      m.remove();
      const name = (user && user.displayName) || (state.profile && state.profile.name) || email.split('@')[0];
      completeCloudSignIn(name, email, onboardingActive, onboardingActive ? obStep : undefined);
    });
    m.querySelector('#tryGoogleLink').addEventListener('click', ()=>{
      runGoogleSignIn(m.querySelector('#tryGoogleLink'), tr('Try Google'));
    });
  }

  if(mode === 'forgot'){
    m.querySelector('#btnSendReset').addEventListener('click', async ()=>{
      const email = m.querySelector('#fEmail4').value.trim();
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if(!emailPattern.test(email)){ showToast(tr("That email doesn't look right")); return; }
      if(!cloud){ showToast(tr('Cloud backup is unavailable right now')); return; }
      const btn = m.querySelector('#btnSendReset');
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${tr('Sending…')}`;
      const result = await cloud.sendPasswordReset(email);
      if(!result.ok){
        btn.disabled = false; btn.textContent = tr('Send reset link');
        showToast(cloudErrorMessage(result.code));
        return;
      }
      swapTo('reset-sent');
    });
  }

  if(mode === 'link-google'){
    m.querySelector('#btnLinkGoogle').addEventListener('click', async ()=>{
      const email = m.querySelector('#fLinkEmail').value.trim();
      const pw = m.querySelector('#fLinkPassword').value;
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if(!emailPattern.test(email)){ showToast(tr("That email doesn't look right")); return; }
      if(!pw){ showToast(tr('Enter your password')); return; }
      if(!cloud || !m._pendingGoogleCredential){ showToast(tr('Cloud backup is unavailable right now')); return; }
      const btn = m.querySelector('#btnLinkGoogle');
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${tr('Connecting…')}`;
      const result = await cloud.linkGoogleWithPassword(email, pw, m._pendingGoogleCredential);
      if(!result.ok){
        btn.disabled = false; btn.textContent = tr('Connect account');
        m.querySelector('#errLink').classList.add('show');
        showToast(cloudErrorMessage(result.code));
        return;
      }
      const user = result.user || cloud.getUser();
      const name = user.displayName || (user.email ? user.email.split('@')[0] : '') || tr('Account');
      m.remove();
      completeCloudSignIn(name, user.email || '', onboardingActive, onboardingActive ? obStep : undefined);
    });
  }

  if(mode === 'verify-pending'){
    m.querySelector('#btnCheckVerifiedModal').addEventListener('click', async ()=>{
      const btn = m.querySelector('#btnCheckVerifiedModal');
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${tr('Checking…')}`;
      const completed = await tryCompletePendingVerification(onboardingActive ? 'onboarding' : 'settings', false);
      if(completed){ m.remove(); return; }
      btn.disabled = false; btn.textContent = tr("I've verified — continue");
    });
    m.querySelector('#btnResendModal').addEventListener('click', async ()=>{
      if(!cloud) return;
      const result = await cloud.sendVerificationEmail();
      showToast(result.ok ? tr('Verification email sent') : cloudErrorMessage(result.code));
    });
    m.querySelector('#btnCancelPendingModal').addEventListener('click', async ()=>{
      if(cloud) await cloud.signOutCloud();
      clearPendingEmailVerify();
      swapTo('choose');
    });
  }

  if(mode === 'google-name'){
    const nameInput = m.querySelector('#fGoogleName');
    setTimeout(()=> nameInput.focus(), 100);
    m.querySelector('#btnGoogleNameNext').addEventListener('click', async ()=>{
      const name = nameInput.value.trim();
      if(!name){ showToast(tr('Enter your name')); return; }
      const btn = m.querySelector('#btnGoogleNameNext');
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${tr('Saving…')}`;
      const user = cloud ? cloud.getUser() : null;
      if(cloud) await cloud.setDisplayName(name); // best effort — state.profile.name is authoritative
      m.remove();
      completeCloudSignIn(name, (user && user.email) || '', onboardingActive, onboardingActive ? obStep : undefined);
    });
  }
}

/* ============================================================
   MANAGE ACCOUNT MODAL (settings-only, deeper account controls)
============================================================ */
function manageModalHtml(){
  const profile = getAccountProfile();
  if(!profile) return '';
  return `
    <button class="modal-close-x" type="button" data-close>✕</button>
    <h3>${tr('Manage account')}</h3>
    <p class="modal-sub">${escapeHtml(profile.email)}</p>

    <div class="settings-group">
      <div class="settings-group-title">${tr('Name')}</div>
      <div class="field-check-wrap">
        <input id="fAccountName" type="text" value="${escapeHtml(profile.name)}" placeholder="${tr('Your name')}" autocomplete="name">
        <button type="button" class="field-check-btn" id="btnSaveName" aria-label="${tr('Save')}">${ICON_CHECK}</button>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">${tr('Password')}</div>
      ${profile.hasPassword ? `
      <div class="settings-btn-row">
        <button class="settings-btn" id="btnChangePw">${tr('Change password')}</button>
      </div>` : `
      <div class="settings-btn-row">
        <button class="settings-btn" id="btnAddPw">${tr('Add a password')}</button>
      </div>
      <div class="item-sub" style="margin-top:8px;">${tr('Password sign-in is not set up for this account. Add a password so you can also sign in with email too.')}</div>
      `}
    </div>

    <div class="settings-group">
      <div class="settings-group-title">${tr('Danger zone')}</div>
      <div class="settings-btn-row">
        <button class="settings-btn danger-text" id="btnDeleteAcct">${tr('Delete account')}</button>
      </div>
      <div class="item-sub" style="margin-top:8px;">${tr('Your routines, tasks, and score stay on this device — only the account and cloud backup are removed.')}</div>
    </div>
  `;
}

function wireManageModal(m){
  m.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', ()=> m.remove()));

  const nameInput = m.querySelector('#fAccountName');
  const saveNameBtn = m.querySelector('#btnSaveName');
  const saveName = async ()=>{
    const name = nameInput.value.trim();
    if(!name){ showToast(tr('Enter your name')); return; }
    saveNameBtn.disabled = true;
    state.profile.name = name;
    saveState();
    const cloud = window.LifyarCloud;
    if(cloud) await cloud.setDisplayName(name); // best effort — state.profile.name (synced via the normal state doc) is the real source of truth
    saveNameBtn.disabled = false;
    showToast(tr('Name updated'));
    rerenderAccountView(); // updates the account card underneath; this modal stays open
  };
  saveNameBtn.addEventListener('click', saveName);
  nameInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') saveName(); });

  const changePw = m.querySelector('#btnChangePw');
  if(changePw) changePw.addEventListener('click', ()=> openChangePasswordModal(false, m));
  const addPw = m.querySelector('#btnAddPw');
  if(addPw) addPw.addEventListener('click', ()=> openChangePasswordModal(true, m));
  m.querySelector('#btnDeleteAcct').addEventListener('click', ()=> openDeleteAccountModal(m));
}

function openManageModal(){
  const profile = getAccountProfile();
  if(!profile) return;
  const m = openAccountModal(manageModalHtml());
  wireManageModal(m);
}

// Called after an action inside a nested modal (change/add password) changes something Manage
// Account displays, so the still-open modal underneath doesn't sit there showing stale info
// (e.g. still offering "Add a password" after one was just added).
function refreshManageModal(parentModal){
  if(!parentModal || !parentModal.isConnected) return;
  parentModal.querySelector('.modal-inner').innerHTML = manageModalHtml();
  wireManageModal(parentModal);
}

function openDeleteAccountModal(parentModal){
  const profile = getAccountProfile();
  if(!profile) return;
  const html = `
    <button class="modal-close-x" type="button" data-close>✕</button>
    <h3>${tr('Delete account')}</h3>
    <p class="modal-sub">${tr('Permanently delete this account? This removes your cloud backup — routines, tasks, and scores stored on this device are not affected.')}</p>
    ${profile.hasPassword ? `
    <div class="field">
      <label>${tr('Password')}</label>
      <div class="field-pw-wrap">
        <input id="fDeletePw" type="password" placeholder="${tr('Your password')}" autocomplete="current-password">
        <button type="button" class="pw-toggle" data-pwtoggle="fDeletePw">${ICON_EYE}</button>
      </div>
    </div>
    ` : `
    <div class="item-sub" style="margin-bottom:14px;">${tr('Re-authenticate with Google to confirm.')}</div>
    `}
    <button class="btn-primary" type="button" id="btnConfirmDelete" style="width:100%;background:var(--rust);border-color:var(--rust);">${tr('Permanently delete account')}</button>
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
  m.querySelector('#btnConfirmDelete').addEventListener('click', async ()=>{
    const cloud = window.LifyarCloud;
    if(!cloud){ showToast(tr('Cloud backup is unavailable right now')); return; }
    const btn = m.querySelector('#btnConfirmDelete');
    let reauth;
    if(profile.hasPassword){
      const pw = m.querySelector('#fDeletePw').value;
      if(!pw){ showToast(tr('Enter your password')); return; }
      reauth = { type: 'password', email: profile.email, password: pw };
    } else {
      reauth = { type: 'google' };
    }
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${tr('Deleting…')}`;
    const result = await cloud.deleteAccount(reauth);
    if(!result.ok){
      btn.disabled = false; btn.textContent = tr('Permanently delete account');
      if(result.code !== 'auth/popup-closed-by-user' && result.code !== 'auth/cancelled-popup-request'){
        showToast(cloudErrorMessage(result.code));
      }
      return;
    }
    state.profile = null;
    state.session.loggedIn = false;
    saveState();
    m.remove();
    // The account is gone — nothing left for the Manage Account modal underneath to manage.
    if(parentModal && parentModal.isConnected) parentModal.remove();
    showToast(tr('Account deleted'));
    rerenderAccountView();
  });
}

function openChangePasswordModal(isAdd, parentModal){
  const profile = getAccountProfile();
  const html = `
    <button class="modal-close-x" type="button" data-close>✕</button>
    <h3>${isAdd ? tr('Add a password') : tr('Change password')}</h3>
    <p class="modal-sub">${isAdd ? tr('Set a password so you can sign in without Google or Apple.') : tr('Enter your current password, then choose a new one.')}</p>
    ${!isAdd ? `
    <div class="field">
      <label>${tr('Current password')}</label>
      <div class="field-pw-wrap">
        <input id="fCurrentPw" type="password" placeholder="${tr('Current password')}" autocomplete="current-password">
        <button type="button" class="pw-toggle" data-pwtoggle="fCurrentPw">${ICON_EYE}</button>
      </div>
    </div>` : `
    <div class="field">
      <label>${tr('Email')}</label>
      <input type="email" value="${escapeHtml(profile ? profile.email : '')}" disabled>
    </div>`}
    <div class="field">
      <label>${tr('New password')}</label>
      <div class="field-pw-wrap">
        <input id="fNewPw" type="password" placeholder="${tr('At least 6 characters')}" autocomplete="new-password">
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
  m.querySelector('#btnSavePw').addEventListener('click', async ()=>{
    const newPw = m.querySelector('#fNewPw').value;
    if(newPw.length < 6){ showToast(tr('Password should be at least 6 characters')); return; }
    const cloud = window.LifyarCloud;
    if(!cloud || !profile){ showToast(tr('Cloud backup is unavailable right now')); return; }
    const btn = m.querySelector('#btnSavePw');
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${tr('Connecting…')}`;
    let result;
    if(isAdd){
      result = await cloud.addPasswordToAccount(profile.email, newPw);
    } else {
      const oldPw = m.querySelector('#fCurrentPw').value;
      if(!oldPw){
        btn.disabled = false; btn.textContent = tr('Update password');
        showToast(tr('Enter your current password'));
        return;
      }
      result = await cloud.changePassword(profile.email, oldPw, newPw);
    }
    if(!result.ok){
      btn.disabled = false; btn.textContent = isAdd ? tr('Add password') : tr('Update password');
      showToast(cloudErrorMessage(result.code));
      return;
    }
    m.remove();
    refreshManageModal(parentModal);
    showToast(isAdd ? tr('Password added — you can now log in with email too') : tr('Password updated'));
  });
}
