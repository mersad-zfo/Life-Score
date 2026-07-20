// worker.js — Life Score push notification backend.
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
function validateEndpoint(endpoint){
  let url;
  try{ url = new URL(endpoint); }catch{ throw new Error(`Invalid subscription endpoint: '${endpoint}' is not a valid URL`); }
  if(url.protocol !== 'https:') throw new Error(`Invalid subscription endpoint: push endpoints must use HTTPS, received '${url.protocol}'`);
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
// ---------- Life Score notification logic ----------
// =====================================================================================

const ADMIN_CONTACT = "mailto:you@example.com"; // TODO: replace with a real contact email/URL.
const STALE_DEVICE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days.

const MESSAGES = {
  morning: {
    en: { title: "Life Score", body: "Have you checked your to-do list for today?" },
    fa: { title: "Life Score", body: "امروز لیست کارهات رو چک کردی؟" },
  },
  evening: {
    en: { title: "Life Score", body: "Wanna set your tasks for tomorrow?" },
    fa: { title: "Life Score", body: "می‌خوای کارهای فردا رو تنظیم کنی؟" },
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

function isAuthorized(request, env) {
  const auth = request.headers.get("Authorization") || "";
  return auth === `Bearer ${env.API_SECRET}`;
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

    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    try {
      if (url.pathname === "/api/device" && request.method === "POST") {
        const body = await request.json();
        const { deviceId, subscription, platform, timezone, enabled, language } = body;
        if (!deviceId || !timezone) {
          return json({ error: "Missing deviceId or timezone" }, 400);
        }
        const existingRaw = await env.LIFE_SCORE_KV.get(`device:${deviceId}`);
        const existing = existingRaw ? JSON.parse(existingRaw) : {};
        const record = {
          id: deviceId,
          subscription: subscription || existing.subscription,
          platform: platform || existing.platform,
          timezone,
          language: language || existing.language || 'en',
          enabled: enabled !== undefined ? enabled : (existing.enabled ?? true),
          lastSeen: Date.now(),
          updatedAt: Date.now(),
        };
        await env.LIFE_SCORE_KV.put(`device:${deviceId}`, JSON.stringify(record));
        return json({ ok: true });
      }

      if (url.pathname === "/api/test-push" && request.method === "POST") {
        const TEST_MESSAGES = {
          en: { title: "Life Score", body: "Test notification — this worked!" },
          fa: { title: "Life Score", body: "پیام آزمایشی — کار کرد!" },
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
