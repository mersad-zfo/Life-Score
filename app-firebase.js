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
  getAuth, onAuthStateChanged, signInAnonymously,
  GoogleAuthProvider, signInWithPopup, linkWithPopup, signInWithCredential,
  EmailAuthProvider, linkWithCredential, createUserWithEmailAndPassword, signInWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';

// Public by design — not a secret. See ARCHITECTURE.md / the chat where this was set up: the
// actual access control is the Firestore security rule (a signed-in user may only touch
// /users/{their own uid}), not this config being hidden.
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

async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    if (currentUser && currentUser.isAnonymous) {
      // Upgrade the existing anonymous account in place — same uid, same data already backed up
      // under it, nothing to merge.
      await linkWithPopup(currentUser, provider);
    } else {
      await signInWithPopup(auth, provider);
    }
    return { ok: true };
  } catch (e) {
    if (e.code === 'auth/credential-already-in-use') {
      // This Google account already has a real Lifyar account from before (e.g. signing in on a
      // second device, where that device got its own fresh anonymous account first). Switch to
      // the existing account instead of failing outright — app-main.js's boot-time reconciliation
      // then decides, by lastModified, whether the local or cloud copy of data wins.
      try {
        const cred = GoogleAuthProvider.credentialFromError(e);
        await signInWithCredential(auth, cred);
        return { ok: true, switchedAccount: true };
      } catch (e2) {
        return { ok: false, code: e2.code, error: e2.message };
      }
    }
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
  signUpWithEmail,
  logInWithEmail,
  pullState,
  pushState,
  scheduleSync,
};
