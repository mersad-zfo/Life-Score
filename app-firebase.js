// ---------- Firebase glue (Auth + cloud backup via a Cloudflare Worker) ----------
// Loaded via <script type="module"> in index.html — deliberately the ONLY module script in the
// project. Module scripts get their own isolated top-level scope (unlike every other file here,
// which is a classic script relying on shared global scope) — that isolation is exactly why this
// approach was chosen: it keeps the Firebase SDK's own `import` statements contained in one place
// instead of converting the whole no-build-step app to modules. Everything the rest of the app
// needs from here is exposed as plain functions on `window.LifyarCloud`, callable from any
// classic script exactly like any other global function (e.g. tr(), saveState()).
//
// A module script is deferred (same timing as a classic <script defer>), so it runs AFTER every
// classic script's top-level code has already executed — including app-main.js's init() IIFE,
// which kicks off immediately when that script is parsed. That means `window.LifyarCloud` is NOT
// guaranteed to exist yet the instant init() starts. See waitForLifyarCloud() in
// app-state-core.js, which init() uses to wait for this file rather than assuming it's ready.
//
// What this file deliberately does NOT do: touch `state`, decide WHEN to sync, or render
// anything. That's app-state-core.js's job (saveState()/loadState()) and app-main.js's boot
// sequence. This file is pure plumbing to Firebase (and the sync Worker) and nothing else —
// keeping it that way means the security-sensitive parts of this feature live in exactly one place.
//
// SDK files are vendored locally (./vendor/firebase/) rather than loaded from gstatic.com, and
// Auth's apiHost/tokenApiHost are pointed at our own Cloudflare Worker instead of Google's real
// hosts — both exist to route around gstatic.com/identitytoolkit.googleapis.com/
// securetoken.googleapis.com being unreachable (a real, confirmed problem, not hypothetical) for
// many users in Iran. See the chat this was built in for the full reasoning and the live
// Network-tab test that confirmed the exact request shape this depends on.
//
// Firestore's client SDK is NOT used at all (dropped entirely, not just proxied) — its own
// streaming/long-polling protocol is much harder to relay reliably than plain REST. Instead, the
// Worker itself talks to Firestore server-to-server (see Worker/sync-worker.js) and this file
// just calls its plain /sync endpoint like any other API, authenticated with the signed-in user's
// Firebase ID token.

import { initializeApp } from './vendor/firebase/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously, signOut, getIdToken,
  GoogleAuthProvider, signInWithRedirect, linkWithRedirect, getRedirectResult, signInWithCredential,
  EmailAuthProvider, linkWithCredential, createUserWithEmailAndPassword, signInWithEmailAndPassword,
} from './vendor/firebase/firebase-auth.js';

// The Worker that proxies Auth's REST calls and serves as the actual sync backend — see
// Worker/sync-worker.js. Both apiHost/tokenApiHost point here (confirmed via a real Network-tab
// test that the SDK sends plain paths like "/v1/accounts:signUp" with no extra prefix — the
// Worker routes by those real paths, not anything we get to invent).
const SYNC_WORKER_HOST = 'lifyar-sync.mersad-ziro.workers.dev';
const SYNC_WORKER_URL = `https://${SYNC_WORKER_HOST}/sync`;

// Public by design — not a secret. See the chat where this was set up: the actual access control
// is the sync Worker verifying each caller's Firebase ID token itself before touching any data
// (see Worker/sync-worker.js) — not this config being hidden, and not Firestore's own security
// rule either, since that rule doesn't apply on this path anymore (the Worker talks to Firestore
// as itself, via a service account, not as the signed-in end user).
const firebaseConfig = {
  apiKey: "AIzaSyAKoYd8baiZ9x7wSWByUQ5-Gju-XKtIGpA",
  authDomain: "lifyar-c13ce.firebaseapp.com",
  projectId: "lifyar-c13ce",
  storageBucket: "lifyar-c13ce.firebasestorage.app",
  messagingSenderId: "688180628786",
  appId: "1:688180628786:web:e8c3705a02d699b7495b2b",
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
// Not an officially documented/supported override — see the top-of-file comment and the chat
// this was built in: there's an open issue in Firebase's own SDK repo noting these fields aren't
// meant to be externally writable. It works today because nothing stops a plain runtime property
// mutation, confirmed via a real Network-tab test, but isn't guaranteed to survive a future SDK
// version bump. If Auth requests mysteriously start failing after upgrading the vendored SDK
// files, this is the first thing to check.
auth.config.apiHost = SYNC_WORKER_HOST;
auth.config.tokenApiHost = SYNC_WORKER_HOST;

let currentUser = null;
let readyResolve;
// Resolves once we know who's signed in — specifically once there IS a signed-in user (anonymous
// or real), never on the initial "nobody's signed in yet" callback, since that one immediately
// triggers an anonymous sign-in rather than being a final state. See the comment below.
const ready = new Promise((res) => { readyResolve = res; });
const changeListeners = [];

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  changeListeners.forEach((cb) => { try { cb(user); } catch (e) { console.error(e); } });
  if (user) {
    if (readyResolve) { readyResolve(user); readyResolve = null; }
  } else {
    // Nobody signed in at all yet (very first launch ever, or an explicit sign-out) — sign in
    // anonymously right away, invisibly, so there's always a uid to back up to. No UI for this
    // step; onAuthStateChanged fires again shortly with the new anonymous user, which is what
    // actually resolves `ready` above.
    signInAnonymously(auth).catch((e) => console.error('Anonymous sign-in failed', e));
  }
});

// Returns { state, lastModified } from this user's cloud document, or null if there isn't one
// yet (brand new account), the read failed (e.g. offline), or the Worker rejected the request —
// callers treat all of these the same way: nothing to restore, so fall back to local data as-is.
async function pullState() {
  if (!currentUser) return null;
  try {
    const idToken = await getIdToken(currentUser);
    const resp = await fetch(SYNC_WORKER_URL, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.state) return null;
    return { state: data.state, lastModified: data.lastModified || 0 };
  } catch (e) {
    console.error('Cloud pull failed', e);
    return null;
  }
}

async function pushState(stateObj, lastModified) {
  if (!currentUser) return false;
  try {
    const idToken = await getIdToken(currentUser);
    const resp = await fetch(SYNC_WORKER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: stateObj, lastModified }),
    });
    return resp.ok;
  } catch (e) {
    console.error('Cloud push failed', e);
    return false;
  }
}

let syncTimer = null;
// Debounced on purpose — saveState() calls this on EVERY local save, which can happen many times
// in quick succession (checking off several steps in a row). Waiting ~2.5s after the last call
// turns a burst of edits into one network write instead of a dozen.
function scheduleSync(getStateFn, getLastModifiedFn) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    pushState(getStateFn(), getLastModifiedFn());
  }, 2500);
}

// Resolves once we've checked whether THIS page load is the app coming back from a Google
// redirect sign-in. On a normal load (not a redirect return), Firebase resolves this near-
// instantly with null — it's a one-time internal state check, not a hidden network wait on every
// launch. { notARedirect: true } means "this load wasn't a redirect return, nothing to do."
let redirectResultResolve;
const redirectResult = new Promise((res) => { redirectResultResolve = res; });
getRedirectResult(auth).then((result) => {
  redirectResultResolve(result ? { ok: true } : { notARedirect: true });
}).catch((e) => {
  if (e.code === 'auth/credential-already-in-use') {
    // Same account-collision case as below — this Google account already has a real Lifyar
    // account from before. Switch to it instead of failing.
    const cred = GoogleAuthProvider.credentialFromError(e);
    signInWithCredential(auth, cred)
      .then(() => redirectResultResolve({ ok: true, switchedAccount: true }))
      .catch((e2) => redirectResultResolve({ ok: false, code: e2.code, error: e2.message }));
    return;
  }
  redirectResultResolve({ ok: false, code: e.code, error: e.message });
});

// Navigates the whole page away to Google and back — there is no useful return value here for
// the caller to await (see redirectResult above, which is what actually carries the outcome once
// the app reloads). A popup was the original design but is unreliable in embedded/in-app browsers
// and gets blocked by some browsers' popup blockers by default; a redirect works everywhere.
async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  if (currentUser && currentUser.isAnonymous) {
    await linkWithRedirect(currentUser, provider);
  } else {
    await signInWithRedirect(auth, provider);
  }
}

async function signOutCloud() {
  try {
    await signOut(auth);
    return { ok: true };
  } catch (e) {
    return { ok: false, code: e.code, error: e.message };
  }
}

async function signUpWithEmail(email, password) {
  try {
    if (currentUser && currentUser.isAnonymous) {
      const cred = EmailAuthProvider.credential(email, password);
      await linkWithCredential(currentUser, cred);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }
    return { ok: true };
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      // Same idea as the Google collision above — sign into the existing account rather than
      // failing, and let the normal reconciliation logic sort out which data wins.
      try {
        await signInWithEmailAndPassword(auth, email, password);
        return { ok: true, switchedAccount: true };
      } catch (e2) {
        return { ok: false, code: e2.code, error: e2.message };
      }
    }
    return { ok: false, code: e.code, error: e.message };
  }
}

async function logInWithEmail(email, password) {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return { ok: true };
  } catch (e) {
    return { ok: false, code: e.code, error: e.message };
  }
}

window.LifyarCloud = {
  ready,
  redirectResult,
  getUser: () => currentUser,
  isAnonymous: () => !!(currentUser && currentUser.isAnonymous),
  onChange: (cb) => changeListeners.push(cb),
  signInWithGoogle,
  signUpWithEmail,
  logInWithEmail,
  signOutCloud,
  pullState,
  pushState,
  scheduleSync,
};
