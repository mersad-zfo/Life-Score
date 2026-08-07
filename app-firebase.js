// ---------- Firebase glue (Auth + Firestore cloud backup) ----------
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
// sequence. This file is pure plumbing to Firebase and nothing else — keeping it that way means
// the security-sensitive parts of this feature live in exactly one place.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously, signOut,
  GoogleAuthProvider, signInWithPopup, linkWithPopup, signInWithCredential,
  EmailAuthProvider, linkWithCredential, createUserWithEmailAndPassword, signInWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

// Public by design — not a secret. See the chat where this was set up: the actual access control
// is the Firestore security rule (a signed-in user may only touch /users/{their own uid}), not
// this config being hidden.
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
const db = getFirestore(fbApp);

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

function userDocRef(uid) { return doc(db, 'users', uid); }

// Returns { state, lastModified } from this user's cloud document, or null if there isn't one
// yet (brand new account) or the read failed (e.g. offline) — callers treat both the same way:
// nothing to restore, so fall back to local data as-is.
async function pullState() {
  if (!currentUser) return null;
  try {
    const snap = await getDoc(userDocRef(currentUser.uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return { state: data.state, lastModified: data.lastModified || 0 };
  } catch (e) {
    console.error('Cloud pull failed', e);
    return null;
  }
}

async function pushState(stateObj, lastModified) {
  if (!currentUser) return false;
  try {
    await setDoc(userDocRef(currentUser.uid), {
      state: stateObj,
      lastModified,
      updatedAt: serverTimestamp(),
    });
    return true;
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

// Uses a popup, not a full-page redirect. This app isn't hosted on Firebase Hosting, so its
// authDomain (lifyar-c13ce.firebaseapp.com) is a different origin than wherever the app itself
// is served from — and that cross-origin gap is exactly the case where signInWithRedirect's
// getRedirectResult() has been observed (in real testing, not just theory) to silently fail to
// recognize the return trip: modern browsers' third-party storage partitioning blocks the
// cross-origin state Firebase needs to correlate the redirect, and getRedirectResult() just
// resolves null with no error, as if nothing had happened. A popup sidesteps all of that — the
// result comes back directly from this same function call, same as signUpWithEmail/logInWithEmail
// below, no cross-navigation state to lose. (This WAS a popup originally, in fact, and got
// switched to redirect earlier for embedded-in-app-browser compatibility — worth re-testing here
// since redirect turned out to be broken outright for this app's hosting setup.)
async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    if (currentUser && currentUser.isAnonymous) {
      await linkWithPopup(currentUser, provider);
    } else {
      await signInWithPopup(auth, provider);
    }
    return { ok: true };
  } catch (e) {
    if (e.code === 'auth/credential-already-in-use') {
      // This Google account already has a real Lifyar account from before — switch to it
      // instead of failing, same idea as the email collision case below.
      const cred = GoogleAuthProvider.credentialFromError(e);
      try {
        await signInWithCredential(auth, cred);
        return { ok: true, switchedAccount: true };
      } catch (e2) {
        return { ok: false, code: e2.code, error: e2.message };
      }
    }
    if (e.code === 'auth/email-already-in-use' || e.code === 'auth/account-exists-with-different-credential') {
      // This Google account's email already belongs to a real password-based Lifyar account —
      // Firebase won't silently merge the two. Hand back what's needed to let the person link
      // them instead of just failing: the pending Google credential (only usable once, briefly,
      // and only for this) and the email if Firebase's error included it — it may not, depending
      // on this project's email-enumeration-protection setting, so the caller should be ready to
      // ask the person to type it again. See linkGoogleWithPassword below.
      const cred = GoogleAuthProvider.credentialFromError(e);
      const email = e.customData && e.customData.email;
      return { ok: false, code: e.code, needsLink: true, email, credential: cred };
    }
    return { ok: false, code: e.code, error: e.message };
  }
}

// Completes the link started above: proves the person owns the existing password account (by
// actually signing into it), then attaches the pending Google credential to that SAME account —
// after this, either method logs into the same uid, so cloud data stays unified rather than
// split across two accounts.
async function linkGoogleWithPassword(email, password, credential) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    await linkWithCredential(result.user, credential);
    return { ok: true };
  } catch (e) {
    return { ok: false, code: e.code, error: e.message };
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
  getUser: () => currentUser,
  isAnonymous: () => !!(currentUser && currentUser.isAnonymous),
  onChange: (cb) => changeListeners.push(cb),
  signInWithGoogle,
  linkGoogleWithPassword,
  signUpWithEmail,
  logInWithEmail,
  signOutCloud,
  pullState,
  pushState,
  scheduleSync,
};
