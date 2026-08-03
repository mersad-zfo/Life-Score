// ================= Lifyar Sync + Auth Proxy Worker =================
// Two jobs, both existing to route around Iran's network-level blocking of gstatic.com/
// identitytoolkit.googleapis.com/securetoken.googleapis.com/firestore.googleapis.com (confirmed
// via real Iranian connections — see the chat where this was designed), while ALSO routing around
// what turned out to be a Google-side 403, not just an Iranian one: those hosts return 403 to
// Iranian IPs directly, but a request FROM this Worker (a Cloudflare edge IP, not an Iranian one)
// reaches Google fine. That's true for every Google host this file talks to below — none of that
// depends on what's reachable from the end user's own connection, only from Cloudflare's.
//
// Job 1 — Auth proxy: relay Firebase Auth's REST calls (sign up, sign in, token refresh) to
// Google essentially untouched. The self-hosted Firebase SDK (see app-firebase.js) has
// auth.config.apiHost and auth.config.tokenApiHost both pointed at THIS Worker's own hostname —
// confirmed via a real Network-tab test that the SDK then requests e.g.
// "<this-worker>/v1/accounts:signUp?key=..." with no extra prefix of any kind (the SDK always
// builds requests as apiHost + a literal path it writes itself, like "/v1/accounts:signUp" or
// "/v1/token" — never anything we get to name), so routing below matches by the REAL paths
// Firebase sends, not an invented prefix. NOTE: apiHost/tokenApiHost being writable like this is
// NOT an officially documented/supported override — there's an open issue in Firebase's own SDK
// repo about these fields not being intended to be externally writable; it currently works
// because nothing stops a plain runtime property mutation, but a future SDK release could remove
// that incidentally. If Auth requests start failing after an SDK version bump, this is the first
// thing to check.
//
// Job 2 — /sync: the actual Firestore backend. The app no longer talks to Firestore's client SDK
// at all (that SDK's own streaming/long-polling protocol is much harder to proxy reliably than
// plain REST) — instead it calls this Worker's plain /sync endpoint, and THIS Worker talks to
// Firestore server-to-server using a Google Cloud service account.
//
// IMPORTANT — this is the one part of the whole cloud-backup feature where a bug could actually
// expose one user's data to another. Firestore's own security rule (see DECISIONS.md /
// ARCHITECTURE.md — "a user may only touch /users/{their own uid}") does NOT apply on this path,
// because the Worker is talking to Firestore as itself (the service account), not as the
// end user. That means THIS FILE is now fully responsible for that same guarantee: every /sync
// call verifies the caller's Firebase ID token — checking its cryptographic signature against
// Google's own public keys, not just trusting whatever uid the request claims to be — before
// touching any data, and only ever reads/writes that exact uid's own document.

const PROJECT_ID = "lifyar-c13ce";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const GOOGLE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const MAX_SYNC_BODY_BYTES = 2 * 1024 * 1024; // generous ceiling for a JSON state blob — just a sanity cap, not a real-world limit

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ---------------- small encoding helpers ----------------
function b64urlToBytes(str){
  const b64 = str.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(str.length/4)*4, "=");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64url(bytes){
  let bin = "";
  for(let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function pemToDer(pem){
  // A service-account JSON key file stores its private key with literal escaped "\n" sequences
  // (it's JSON) rather than real line breaks — normalize that first so this works correctly
  // whether the secret was pasted with real newlines or copied straight out of the JSON file as-is.
  const normalized = pem.replace(/\\n/g, "\n");
  const b64 = normalized.replace(/-----BEGIN [^-]+-----/,"").replace(/-----END [^-]+-----/,"").replace(/\s+/g,"");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------------- minimal DER walker (still needed for the service account's OWN private key) ----------------
// This is unrelated to verifying incoming tokens (see below) — it's only used to import the
// Worker's own service-account private key (a PEM-encoded PKCS8 key we control ourselves) so it
// can sign requests to Google. PKCS8 is already the exact structure Web Crypto's importKey
// expects, so this is just PEM-header stripping + base64 decode, not real ASN.1 parsing.

// ---------------- verifying an incoming Firebase ID token ----------------
// Caches Google's public keys in Cloudflare's edge cache, honoring the max-age Google's own
// response sends — same refresh strategy Firebase's own docs describe, just against the JWK
// endpoint instead of the X.509 one (see the chat this was built in for why).
async function getGoogleJwks(){
  const cache = caches.default;
  const cacheKey = new Request(GOOGLE_JWKS_URL);
  let resp = await cache.match(cacheKey);
  if(!resp){
    resp = await fetch(GOOGLE_JWKS_URL);
    if(resp.ok) await cache.put(cacheKey, resp.clone());
  }
  const data = await resp.json();
  return data.keys || [];
}

// Returns the verified uid on success, or null on any failure — deliberately fails closed:
// anything unexpected (bad signature, wrong project, expired, malformed) is treated as "not
// authenticated," never as "authenticated, missing some optional check."
async function verifyIdToken(idToken){
  try{
    const parts = idToken.split(".");
    if(parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
    const now = Math.floor(Date.now()/1000);
    if(payload.aud !== PROJECT_ID) return null;
    if(payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) return null;
    if(!payload.sub || typeof payload.sub !== "string") return null;
    if(typeof payload.exp !== "number" || payload.exp < now) return null;
    if(typeof payload.iat !== "number" || payload.iat > now + 60) return null; // small clock-skew allowance
    const jwks = await getGoogleJwks();
    const jwk = jwks.find(k => k.kid === header.kid);
    if(!jwk) return null; // unknown key id — cache may be stale, or token is bogus
    const pubKey = await crypto.subtle.importKey(
      "jwk", jwk, { name:"RSASSA-PKCS1-v1_5", hash:"SHA-256" }, false, ["verify"]
    );
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const sigOk = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", pubKey, b64urlToBytes(parts[2]), signingInput
    );
    return sigOk ? payload.sub : null;
  }catch(e){
    return null; // any parsing/crypto error — treat as unauthenticated, never throw through to the caller
  }
}

// ---------------- Firestore access, as the service account (server-to-server) ----------------
let cachedAccessToken = null; // best-effort only — Workers don't guarantee this survives across
let cachedAccessTokenExpiry = 0; // requests/isolates, so a miss here just means one extra fetch, not a bug.

async function getFirestoreAccessToken(env){
  const now = Math.floor(Date.now()/1000);
  if(cachedAccessToken && cachedAccessTokenExpiry > now + 60) return cachedAccessToken;

  const privKeyDer = pemToDer(env.SERVICE_ACCOUNT_PRIVATE_KEY);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", privKeyDer, { name:"RSASSA-PKCS1-v1_5", hash:"SHA-256" }, false, ["sign"]
  );
  const header = { alg:"RS256", typ:"JWT" };
  const payload = {
    iss: env.SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const encHeader = bytesToB64url(new TextEncoder().encode(JSON.stringify(header)));
  const encPayload = bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encHeader}.${encPayload}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  const assertion = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
  });
  if(!tokenResp.ok) throw new Error("Failed to get Firestore access token: " + await tokenResp.text());
  const tokenData = await tokenResp.json();
  cachedAccessToken = tokenData.access_token;
  cachedAccessTokenExpiry = now + (tokenData.expires_in || 3600);
  return cachedAccessToken;
}

// The whole state blob is stored as one JSON string field, and lastModified as one integer field
// — deliberately NOT mapped field-by-field into Firestore's typed value format. We never need to
// query into individual fields (the app always reads/writes the whole thing as one unit, same as
// localStorage today), so a full recursive JS-object <-> Firestore-value encoder would just be
// extra surface area for bugs with zero benefit here.
async function firestoreGet(env, uid){
  const token = await getFirestoreAccessToken(env);
  const resp = await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if(resp.status === 404) return null;
  if(!resp.ok) throw new Error("Firestore read failed: " + await resp.text());
  const doc = await resp.json();
  const stateStr = doc.fields && doc.fields.state && doc.fields.state.stringValue;
  const lastModified = doc.fields && doc.fields.lastModified && Number(doc.fields.lastModified.integerValue);
  if(!stateStr) return null;
  return { state: JSON.parse(stateStr), lastModified: lastModified || 0 };
}

async function firestoreSet(env, uid, stateObj, lastModified){
  const token = await getFirestoreAccessToken(env);
  const body = {
    fields: {
      state: { stringValue: JSON.stringify(stateObj) },
      lastModified: { integerValue: String(lastModified) },
    },
  };
  // PATCH with no updateMask replaces the document's fields wholesale (creating it if it doesn't
  // exist yet) — exactly the "newest wins, whole blob" semantics the rest of the sync design uses.
  const resp = await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if(!resp.ok) throw new Error("Firestore write failed: " + await resp.text());
}

// ---------------- request handling ----------------
function withCors(resp){
  const headers = new Headers(resp.headers);
  Object.entries(CORS_HEADERS).forEach(([k,v]) => headers.set(k,v));
  return new Response(resp.body, { status: resp.status, headers });
}
function json(data, status=200){
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function handleAuthProxy(request, url, googleHost){
  // Forwards the path/query exactly as the SDK sent them — method, headers (minus Host, which
  // fetch sets itself), body, everything untouched. The SDK writes its own real paths (see the
  // top-of-file comment); this never needs to rewrite them, only pick which Google host to relay
  // to.
  const target = `https://${googleHost}${url.pathname}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete("Host");
  const resp = await fetch(target, {
    method: request.method,
    headers,
    body: (request.method === "GET" || request.method === "HEAD") ? undefined : await request.arrayBuffer(),
  });
  return withCors(resp);
}

async function handleSync(request, env){
  const authHeader = request.headers.get("Authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if(!idToken) return json({ error: "Missing Authorization header" }, 401);
  const uid = await verifyIdToken(idToken);
  if(!uid) return json({ error: "Invalid or expired token" }, 401);

  if(request.method === "GET"){
    const result = await firestoreGet(env, uid);
    return json(result || { state: null, lastModified: 0 });
  }
  if(request.method === "POST"){
    const raw = await request.text();
    if(raw.length > MAX_SYNC_BODY_BYTES) return json({ error: "Payload too large" }, 413);
    let body;
    try{ body = JSON.parse(raw); }catch(e){ return json({ error: "Invalid JSON" }, 400); }
    if(!body || typeof body !== "object" || !body.state || typeof body.lastModified !== "number"){
      return json({ error: "Expected { state, lastModified }" }, 400);
    }
    await firestoreSet(env, uid, body.state, body.lastModified);
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}

export default {
  async fetch(request, env){
    if(request.method === "OPTIONS"){
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    try{
      if(url.pathname === "/sync"){
        return handleSync(request, env);
      }
      if(url.pathname === "/v1/token"){
        return handleAuthProxy(request, url, "securetoken.googleapis.com");
      }
      if(url.pathname.startsWith("/v1/") || url.pathname.startsWith("/v2/")){
        return handleAuthProxy(request, url, "identitytoolkit.googleapis.com");
      }
      return json({ error: "Not found" }, 404);
    }catch(e){
      console.error(e);
      return json({ error: "Internal error" }, 500);
    }
  },
};
