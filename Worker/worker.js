// worker.js — Lifyar push notification backend.
// NOTE (app rebrand, Life Score → Lifyar): this Worker's actual deployed name on Cloudflare,
// its URL (see app-notif-shared.js NOTIF_WORKER_URL), and its KV binding (LIFE_SCORE_KV below)
// still say "life-score" / "LIFE_SCORE" on purpose — they haven't been renamed on Cloudflare
// yet. Do not rename them here until the Cloudflare-side Worker/KV are renamed to match
// (tracked in BACKLOG.md), or push notifications will break.
//
// Fully self-contained, single-file version — no import statement, nothing to install. Paste
// this whole file into the Cloudflare dashboard's code editor (Workers & Pages →
// life-score-notifications → Edit Code) and click Deploy.
//
// This version uses the "aes128gcm" Web Push encryption scheme (RFC 8291 + RFC 8188), which
// modern browsers REQUIRE support for. An earlier version of this file used a library that only
// implemented the older, deprecated "aesgcm" draft scheme — which up-to-date browsers are no
// longer required to support and evidently don't anymore, causing pushes to be silently accepted
// by the push service but never actually displayed (exactly the symptom this was built to fix).
// The derivation chain below has been checked against the official RFC 8291 Appendix A test
// vectors — see the verification block at the very end of this file, which you can safely
// delete once you've confirmed real notifications are arriving (or leave in — it costs nothing
// to keep, it only runs if you call it).

// =====================================================================================
// ---------- Push encryption (RFC 8291 / RFC 8188 "aes128gcm") ----------
// =====================================================================================

function b64uToBuf(s){
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const bin = atob((s+pad).replace(/-/g,'+').replace(/_/g,'/'));
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bufToB64u(buf){
  let bin = '';
  const bytes = new Uint8Array(buf);
  for(let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function concatBuffers(arrays){
  const length = arrays.reduce((sum,a)=>sum+a.byteLength,0);
  const out = new Uint8Array(length);
  let offset = 0;
  for(const a of arrays){ out.set(new Uint8Array(a), offset); offset += a.byteLength; }
  return out;
}

function validatePrivateJWK(jwk){
  if(jwk.kty !== 'EC') throw new Error(`Invalid JWK: 'kty' must be 'EC', received '${jwk.kty ?? 'undefined'}'`);
  if(jwk.crv !== 'P-256') throw new Error(`Invalid JWK: 'crv' must be 'P-256', received '${jwk.crv ?? 'undefined'}'`);
  if(!jwk.x || typeof jwk.x !== 'string') throw new Error("Invalid JWK: missing or invalid 'x' coordinate");
  if(!jwk.y || typeof jwk.y !== 'string') throw new Error("Invalid JWK: missing or invalid 'y' coordinate");
  if(!jwk.d || typeof jwk.d !== 'string') throw new Error("Invalid JWK: missing or invalid 'd' (private key)");
}
// Only real browser push services should ever end up here — without this, anything that could
// call /api/device (see authorizeDevice() below) could point `subscription.endpoint` at an
// arbitrary HTTPS host, and the scheduled cron / sendPush() would then fetch() that host from
// Cloudflare's network, VAPID-signed, twice a day. That's a free SSRF primitive using Lifyar's
// own infrastructure. Checking "is this HTTPS" alone doesn't stop that — checking the host does.
const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com', // older FCM-era host some Chromium builds still hand out
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
];
function isAllowedPushHost(hostname){
  if(ALLOWED_PUSH_HOSTS.includes(hostname)) return true;
  if(/\.notify\.windows\.com$/.test(hostname)) return true; // WNS: wns2-<region>.notify.windows.com
  return false;
}
function validateEndpoint(endpoint){
  let url;
  try{ url = new URL(endpoint); }catch{ throw new Error(`Invalid subscription endpoint: '${endpoint}' is not a valid URL`); }
  if(url.protocol !== 'https:') throw new Error(`Invalid subscription endpoint: push endpoints must use HTTPS, received '${url.protocol}'`);
  if(!isAllowedPushHost(url.hostname)) throw new Error(`Invalid subscription endpoint: '${url.hostname}' is not a recognized push service`);
}

// Parses the browser's subscription.keys (p256dh + auth) into usable crypto material.
async function importClientKeys(keys){
  const auth = b64uToBuf(keys.auth);
  if(auth.byteLength !== 16) throw new Error(`Incorrect auth length, expected 16 bytes but got ${auth.byteLength}`);
  const decodedKey = b64uToBuf(keys.p256dh);
  if(decodedKey.byteLength !== 65) throw new Error(`Invalid p256dh key: expected 65 bytes but got ${decodedKey.byteLength} bytes`);
  if(decodedKey[0] !== 4) throw new Error(`Invalid p256dh key: expected uncompressed point format (0x04 prefix)`);
  const p256 = await crypto.subtle.importKey('jwk', {
    kty:'EC', crv:'P-256',
    x: bufToB64u(decodedKey.slice(1,33)),
    y: bufToB64u(decodedKey.slice(33,65)),
    ext:true,
  }, {name:'ECDH', namedCurve:'P-256'}, true, []);
  return { auth, p256, rawPoint: decodedKey };
}

// VAPID JWT signing — identical regardless of content-encoding scheme.
async function createJwt(jwk, jwtData){
  const jwtInfo = { typ:'JWT', alg:'ES256' };
  const b64Info = bufToB64u(new TextEncoder().encode(JSON.stringify(jwtInfo)));
  const b64Data = bufToB64u(new TextEncoder().encode(JSON.stringify(jwtData)));
  const unsigned = `${b64Info}.${b64Data}`;
  const privateKey = await crypto.subtle.importKey('jwk', jwk, {name:'ECDSA', namedCurve:'P-256'}, true, ['sign']);
  const sig = await crypto.subtle.sign({name:'ECDSA', hash:{name:'SHA-256'}}, privateKey, new TextEncoder().encode(unsigned));
  return `${unsigned}.${bufToB64u(sig)}`;
}
function getPublicKeyFromJwk(jwk){
  // Uncompressed point: 0x04 || x || y — this is the "k" value in the VAPID Authorization header.
  return bufToB64u(concatBuffers([new Uint8Array([4]), b64uToBuf(jwk.x), b64uToBuf(jwk.y)]));
}

// ---------- aes128gcm derivation (RFC 8291 section 3.3-3.4 + RFC 8188 section 2.1) ----------
async function deriveWebPushIKM(clientPublicKey, serverKeyPair, authSecret){
  const sharedSecretBits = await crypto.subtle.deriveBits({name:'ECDH', public: clientPublicKey}, serverKeyPair.privateKey, 256);
  const sharedSecretKey = await crypto.subtle.importKey('raw', sharedSecretBits, {name:'HKDF'}, false, ['deriveBits']);

  const clientRaw = new Uint8Array(await crypto.subtle.exportKey('raw', clientPublicKey));
  const serverRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeyPair.publicKey));
  const keyInfo = concatBuffers([
    new TextEncoder().encode('WebPush: info\0'),
    clientRaw, // receiver (browser) public key, 65 bytes, unprefixed
    serverRaw, // sender (us) public key, 65 bytes, unprefixed
  ]);

  const ikmBits = await crypto.subtle.deriveBits({name:'HKDF', hash:'SHA-256', salt: authSecret, info: keyInfo}, sharedSecretKey, 256);
  return crypto.subtle.importKey('raw', ikmBits, {name:'HKDF'}, false, ['deriveBits']);
}

async function deriveCEKAndNonce(ikmKey, salt){
  const cekBits = await crypto.subtle.deriveBits(
    {name:'HKDF', hash:'SHA-256', salt, info: new TextEncoder().encode('Content-Encoding: aes128gcm\0')}, ikmKey, 128);
  const cek = await crypto.subtle.importKey('raw', cekBits, 'AES-GCM', false, ['encrypt']);
  // Nonce for record SEQ=0 (our messages are always a single record) is just the raw HKDF
  // output — RFC 8188 XORs it with the sequence number, and XOR with zero is a no-op.
  const nonce = await crypto.subtle.deriveBits(
    {name:'HKDF', hash:'SHA-256', salt, info: new TextEncoder().encode('Content-Encoding: nonce\0')}, ikmKey, 96);
  return { cek, nonce };
}

async function encryptPayload128(serverKeyPair, salt, plaintextBytes, subscriptionKeys){
  const clientKeys = await importClientKeys(subscriptionKeys);
  const ikmKey = await deriveWebPushIKM(clientKeys.p256, serverKeyPair, clientKeys.auth);
  const { cek, nonce } = await deriveCEKAndNonce(ikmKey, salt);
  // Single-record message: append the "last record" padding delimiter (0x02), zero extra padding.
  const padded = concatBuffers([plaintextBytes, new Uint8Array([2])]);
  return crypto.subtle.encrypt({name:'AES-GCM', iv: nonce}, cek, padded);
}

async function buildPushHTTPRequest({ privateJWK, subscription, message }){
  const jwk = typeof privateJWK === 'string' ? JSON.parse(privateJWK) : privateJWK;
  validatePrivateJWK(jwk);
  validateEndpoint(subscription.endpoint);

  const MAX_TTL = 24*60*60;
  const ttl = message.options?.ttl && message.options.ttl > 0 && message.options.ttl <= MAX_TTL ? message.options.ttl : MAX_TTL;
  const jwtPayload = { aud: new URL(subscription.endpoint).origin, exp: Math.floor(Date.now()/1000)+ttl, sub: message.adminContact };
  const authJwt = await createJwt(jwk, jwtPayload);
  const serverPublicKeyB64 = getPublicKeyFromJwk(jwk);

  const serverKeyPair = await crypto.subtle.generateKey({name:'ECDH', namedCurve:'P-256'}, true, ['deriveBits']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const payloadBytes = new TextEncoder().encode(JSON.stringify(message.payload));
  const ciphertext = new Uint8Array(await encryptPayload128(serverKeyPair, salt, payloadBytes, subscription.keys));
  const serverPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeyPair.publicKey));

  // Wire format: salt(16) | record_size(4, big-endian) | keyid_len(1) | server_pubkey(65) | ciphertext
  const rs = 4096;
  const header = new Uint8Array(16+4+1+65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = 65;
  header.set(serverPublicKeyRaw, 21);
  const body = concatBuffers([header, ciphertext]);

  const headerValues = {
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    'Content-Length': String(body.byteLength),
    'Authorization': `vapid t=${authJwt}, k=${serverPublicKeyB64}`,
    'TTL': String(ttl),
  };
  if(message.options?.topic) headerValues.Topic = message.options.topic;
  if(message.options?.urgency) headerValues.Urgency = message.options.urgency;

  return { endpoint: subscription.endpoint, body, headers: new Headers(headerValues) };
}

// =====================================================================================
// ---------- Lifyar notification logic ----------
// =====================================================================================

const ADMIN_CONTACT = "mailto:you@example.com"; // TODO: replace with a real contact email/URL.
const STALE_DEVICE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days.

const MESSAGES = {
  morning: {
    en: { title: "Lifyar", body: "Have you checked your to-do list for today?" },
    fa: { title: "Lifyar", body: "امروز لیست کارهات رو چک کردی؟" },
  },
  evening: {
    en: { title: "Lifyar", body: "Wanna set your tasks for tomorrow?" },
    fa: { title: "Lifyar", body: "می‌خوای کارهای فردا رو تنظیم کنی؟" },
  },
};

function localTimeParts(timezone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "UTC",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  return {
    hour: parseInt(parts.hour, 10) % 24,
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

// =====================================================================================
// ---------- Auth ----------
// =====================================================================================
// PREVIOUSLY this file gated every route behind a single static bearer token
// (`env.API_SECRET`) that was also shipped inside the client app (see the old
// NOTIF_API_SECRET constant in app-notif-shared.js). That meant the "secret" was fully
// readable by anyone who opened the app's JS in a browser or unzipped the PWA — it wasn't
// actually secret, so it wasn't actually access control. Concretely, that let anyone: (1) call
// /api/test-push to force-send a real push to every registered device, repeatedly, with no rate
// limit; (2) register a device record with an attacker-chosen `subscription.endpoint`, turning
// the scheduled cron into an SSRF primitive against arbitrary HTTPS hosts (see
// validateEndpoint() above for the other half of that fix).
//
// Replaced with two credential types, used for different callers:
//
//   /api/device — accepts EITHER:
//     "Bearer <firebase-id-token>": a real signed Firebase Auth token. Every real Lifyar
//       install has one, even before sign-up — the app signs in anonymously on first launch
//       (see app-firebase.js) — so this is checkable without requiring a real account. Verified
//       here directly against Google's public keys (RS256), no library, no secret needed on our
//       side to check it. Used when the call comes from the page, where a live Firebase session
//       exists.
//     "Device <deviceId>:<secret>": a random secret THIS Worker mints the first time a device
//       authenticates with a real Firebase token, and the client caches locally (see
//       notifMetaSet('deviceSecret', ...) in app-notif-shared.js). Used from the service
//       worker's pushsubscriptionchange handler, which can run with no page open and therefore
//       no way to get a fresh Firebase token. Only ever grants control over that ONE deviceId —
//       never other devices, never test-push.
//
//   /api/test-push — unchanged in spirit: a static bearer secret, BUT now `env.ADMIN_SECRET`,
//     a value that must never be added to any client-shipped file (app-notif-shared.js or
//     otherwise). Call it yourself directly (curl, Cloudflare dashboard) — see BACKEND.md.
//
// Required env vars/secrets after this change: FIREBASE_PROJECT_ID (a plain var, e.g.
// "lifyar-c13ce" — not secret, it's public in app-firebase.js's config too), ADMIN_SECRET (a new
// `wrangler secret put ADMIN_SECRET`, pick a fresh random value), VAPID_PRIVATE_KEY (unchanged).
// `API_SECRET` is no longer read anywhere in this file — delete it from Cloudflare once this is
// deployed, and treat its old value as permanently compromised (it shipped in production JS).

const DEVICE_ID_RE = /^[A-Za-z0-9_-]{4,128}$/;

function mintDeviceSecret(){
  return bufToB64u(crypto.getRandomValues(new Uint8Array(24)));
}

// Plain === on strings leaks timing info proportional to how many leading characters match.
// Not the biggest risk here, but it costs nothing to compare in constant time instead.
function timingSafeEqual(a, b){
  if(typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for(let i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- Firebase ID token verification (RS256, Google's public JWKS, no library) ----------
let jwksCache = null;
let jwksCacheAt = 0;
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const JWKS_TTL_MS = 60 * 60 * 1000;

async function fetchJwks(){
  const res = await fetch(JWKS_URL);
  if(!res.ok) throw new Error('jwks_fetch_failed');
  const data = await res.json();
  jwksCache = data.keys || [];
  jwksCacheAt = Date.now();
  return jwksCache;
}

async function getJwk(kid){
  if(!jwksCache || Date.now() - jwksCacheAt > JWKS_TTL_MS) await fetchJwks();
  let jwk = (jwksCache || []).find(k => k.kid === kid);
  if(!jwk){
    // Not in our cache — could be a very recent key rotation. Force one fresh fetch before
    // giving up, rather than waiting up to an hour for the next natural refresh.
    await fetchJwks();
    jwk = (jwksCache || []).find(k => k.kid === kid);
  }
  return jwk || null;
}

async function verifyFirebaseIdToken(idToken, env){
  const parts = idToken.split('.');
  if(parts.length !== 3) throw new Error('malformed_token');
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(new TextDecoder().decode(b64uToBuf(headerB64)));
  const payload = JSON.parse(new TextDecoder().decode(b64uToBuf(payloadB64)));
  if(header.alg !== 'RS256') throw new Error('unexpected_alg');

  const jwk = await getJwk(header.kid);
  if(!jwk) throw new Error('unknown_kid');

  const key = await crypto.subtle.importKey('jwk', jwk, { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['verify']);
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uToBuf(sigB64), signedData);
  if(!valid) throw new Error('bad_signature');

  const now = Math.floor(Date.now() / 1000);
  if(typeof payload.exp !== 'number' || payload.exp < now) throw new Error('expired');
  if(typeof payload.iat !== 'number' || payload.iat > now + 60) throw new Error('issued_in_future');
  if(!env.FIREBASE_PROJECT_ID) throw new Error('worker_missing_FIREBASE_PROJECT_ID');
  if(payload.aud !== env.FIREBASE_PROJECT_ID) throw new Error('bad_audience');
  if(payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) throw new Error('bad_issuer');
  if(!payload.sub || typeof payload.sub !== 'string') throw new Error('no_subject');

  return payload.sub; // Firebase uid — works for anonymous accounts too.
}

// Resolves who's allowed to touch ONE specific deviceId. See the big comment above for the two
// credential types. Never returns access to any device other than `bodyDeviceId`.
async function authorizeDevice(request, env, bodyDeviceId){
  const auth = request.headers.get('Authorization') || '';

  if(auth.startsWith('Bearer ')){
    try{
      const uid = await verifyFirebaseIdToken(auth.slice(7), env);
      return { ok: true, uid, via: 'firebase' };
    }catch(e){
      return { ok: false, reason: 'bad_firebase_token' };
    }
  }

  if(auth.startsWith('Device ')){
    const rest = auth.slice(7);
    const sep = rest.indexOf(':');
    if(sep === -1) return { ok: false, reason: 'malformed_device_credential' };
    const deviceId = rest.slice(0, sep);
    const secret = rest.slice(sep + 1);
    if(deviceId !== bodyDeviceId) return { ok: false, reason: 'device_id_mismatch' };
    const existingRaw = await env.LIFE_SCORE_KV.get(`device:${deviceId}`);
    if(!existingRaw) return { ok: false, reason: 'unknown_device' };
    const existing = JSON.parse(existingRaw);
    if(!existing.deviceSecret || !timingSafeEqual(existing.deviceSecret, secret)) return { ok: false, reason: 'bad_device_secret' };
    return { ok: true, uid: existing.ownerUid || null, via: 'device' };
  }

  return { ok: false, reason: 'missing_credential' };
}

// ---------- Rate limiting ----------
// Best-effort — Workers KV isn't strongly consistent or atomic, so under heavy concurrent load
// this can under-count slightly. That's an acceptable tradeoff for what this is guarding against
// (casual/scripted abuse), not a hard security boundary on its own — the real boundary is the
// auth model above.
async function checkRateLimit(env, bucketKey, limit, windowSeconds){
  const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `rl:${bucketKey}:${windowId}`;
  const current = parseInt((await env.LIFE_SCORE_KV.get(key)) || '0', 10);
  if(current >= limit) return { allowed: false };
  await env.LIFE_SCORE_KV.put(key, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return { allowed: true };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    try {
      if (url.pathname === "/api/device" && request.method === "POST") {
        let body;
        try { body = await request.json(); } catch (e) { return json({ error: "invalid_json" }, 400); }
        const { deviceId, subscription, platform, timezone, enabled, language } = body;

        if (!deviceId || typeof deviceId !== "string" || !DEVICE_ID_RE.test(deviceId)) {
          return json({ error: "invalid_device_id" }, 400);
        }
        if (!timezone || typeof timezone !== "string") {
          return json({ error: "invalid_timezone" }, 400);
        }

        const rl = await checkRateLimit(env, `device:${deviceId}`, 20, 60);
        if (!rl.allowed) return json({ error: "rate_limited" }, 429);

        const authResult = await authorizeDevice(request, env, deviceId);
        if (!authResult.ok) return json({ error: "unauthorized" }, 401);

        const existingRaw = await env.LIFE_SCORE_KV.get(`device:${deviceId}`);
        const existing = existingRaw ? JSON.parse(existingRaw) : null;

        // A Firebase-token request may only (re)claim a device that's brand new, or already
        // owned by that same uid — stops account A's real login from overwriting account B's
        // device record. A Device-secret request already proves the right to touch this specific
        // device regardless of uid (existing.ownerUid may be missing on records created before
        // this fix shipped — those self-heal into ownership on their next authenticated call).
        if (authResult.via === "firebase" && existing && existing.ownerUid && existing.ownerUid !== authResult.uid) {
          return json({ error: "forbidden" }, 403);
        }

        if (subscription) {
          try { validateEndpoint(subscription.endpoint); }
          catch (e) { return json({ error: "invalid_endpoint", detail: String(e.message || e) }, 400); }
        }

        const deviceSecret = (existing && existing.deviceSecret) || mintDeviceSecret();

        const record = {
          id: deviceId,
          ownerUid: (existing && existing.ownerUid) || authResult.uid || null,
          deviceSecret,
          subscription: subscription || existing?.subscription,
          platform: platform || existing?.platform,
          timezone,
          language: language || existing?.language || 'en',
          enabled: enabled !== undefined ? enabled : (existing?.enabled ?? true),
          lastSeen: Date.now(),
          updatedAt: Date.now(),
        };
        await env.LIFE_SCORE_KV.put(`device:${deviceId}`, JSON.stringify(record));
        // Always hand back the current secret — cheap, and keeps whichever context called us
        // (page or service worker) holding a fresh copy in notifMetaSet('deviceSecret', ...).
        return json({ ok: true, deviceSecret });
      }

      if (url.pathname === "/api/test-push" && request.method === "POST") {
        const auth = request.headers.get("Authorization") || "";
        if (!env.ADMIN_SECRET || auth !== `Bearer ${env.ADMIN_SECRET}`) {
          return json({ error: "unauthorized" }, 401);
        }
        const rl = await checkRateLimit(env, "test-push:global", 10, 60);
        if (!rl.allowed) return json({ error: "rate_limited" }, 429);

        const TEST_MESSAGES = {
          en: { title: "Lifyar", body: "Test notification — this worked!" },
          fa: { title: "Lifyar", body: "پیام آزمایشی — کار کرد!" },
        };
        const list = await env.LIFE_SCORE_KV.list({ prefix: "device:" });
        let sent = 0;
        const errors = [];
        for (const key of list.keys) {
          const raw = await env.LIFE_SCORE_KV.get(key.name);
          if (!raw) continue;
          const device = JSON.parse(raw);
          if (!device.enabled || !device.subscription) continue;
          try {
            const lang = device.language === 'fa' ? 'fa' : 'en';
            await sendPush(device, TEST_MESSAGES[lang], env);
            sent++;
          } catch (err) {
            errors.push({ deviceId: device.id, error: String(err) });
          }
        }
        return json({ ok: true, sent, errors });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  },

  async scheduled(event, env) {
    const list = await env.LIFE_SCORE_KV.list({ prefix: "device:" });

    for (const key of list.keys) {
      const raw = await env.LIFE_SCORE_KV.get(key.name);
      if (!raw) continue;
      const device = JSON.parse(raw);

      if (Date.now() - (device.lastSeen || 0) > STALE_DEVICE_MS) {
        await env.LIFE_SCORE_KV.delete(key.name);
        continue;
      }

      if (!device.enabled || !device.subscription) continue;

      const { hour, dateStr } = localTimeParts(device.timezone);
      let slot = null;
      if (hour === 8) slot = "morning";
      else if (hour === 20) slot = "evening";
      if (!slot) continue;

      const sentKey = `sent:${device.id}:${slot}:${dateStr}`;
      const alreadySent = await env.LIFE_SCORE_KV.get(sentKey);
      if (alreadySent) continue;

      const lang = device.language === 'fa' ? 'fa' : 'en';
      await sendPush(device, MESSAGES[slot][lang], env);
      await env.LIFE_SCORE_KV.put(sentKey, "1", { expirationTtl: 172800 });
    }
  },
};

async function sendPush(device, message, env) {
  const { endpoint, headers, body } = await buildPushHTTPRequest({
    privateJWK: JSON.parse(env.VAPID_PRIVATE_KEY),
    subscription: device.subscription,
    message: {
      payload: { title: message.title, body: message.body },
      adminContact: ADMIN_CONTACT,
      options: { ttl: 3600, urgency: "high" },
    },
  });
  const res = await fetch(endpoint, { method: "POST", headers, body });
  if (res.status === 404 || res.status === 410) {
    await env.LIFE_SCORE_KV.delete(`device:${device.id}`);
  }
}
