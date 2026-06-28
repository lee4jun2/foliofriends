/*
 * FolioFriends 푸시 발송기 (Cloudflare Worker, 무료)
 *
 * 역할: 앱(클라이언트)이 "이 FCM 토큰에 이 알림을 보내줘"라고 요청하면,
 *       호출자의 Firebase ID 토큰을 검증한 뒤 FCM HTTP v1 으로 푸시를 보낸다.
 *       FCM 서비스계정 자격증명은 Worker 시크릿에만 두어 클라이언트에 노출 안 됨.
 *
 * 필요한 Worker 시크릿/변수:
 *   SERVICE_ACCOUNT  : Firebase 서비스계정 JSON 전체(문자열). (FCM 발송 권한)
 *   FIREBASE_API_KEY : Firebase 웹 API 키(공개값). ID 토큰 검증용.
 *
 * 요청(POST, JSON): { idToken, token, title, body, link? }
 *   - idToken : 호출한 로그인 사용자의 Firebase ID 토큰(검증용)
 *   - token   : 알림을 받을 대상의 FCM 등록 토큰
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (!env.SERVICE_ACCOUNT) return json({ error: 'SERVICE_ACCOUNT not set' }, 500);

    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
    const { idToken, token, title, body: msg, link } = body || {};
    if (!idToken || !token) return json({ error: 'missing idToken/token' }, 400);

    const sa = JSON.parse(env.SERVICE_ACCOUNT);

    // 1) 호출자 Firebase ID 토큰 검증(로그인 사용자만 발송 허용) — Identity Toolkit REST로 구글이 검증
    const ver = await verifyIdToken(idToken, env.FIREBASE_API_KEY);
    if (!ver.ok) return json({ error: 'unauthorized: ' + ver.error }, 401);

    // 2) 서비스계정 OAuth 액세스 토큰
    let access;
    try { access = await getAccessToken(sa); } catch (e) { return json({ error: 'oauth: ' + e.message }, 500); }

    // 3) FCM v1 발송
    const message = {
      token,
      notification: { title: title || 'FolioFriends', body: msg || '' },
      webpush: {
        notification: { icon: 'https://lee4jun2.github.io/foliofriends/icon-192.png' },
        fcm_options: { link: link || 'https://lee4jun2.github.io/foliofriends/' },
      },
    };
    const r = await fetch('https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    const out = await r.json().catch(() => ({}));
    return json({ ok: r.ok, fcm: out }, r.ok ? 200 : 502);
  },
};

/* ---------- Web Crypto 유틸 ---------- */
function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function strToB64url(str) {
  return bytesToB64url(new TextEncoder().encode(str));
}

async function importPkcs8(pem) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return crypto.subtle.importKey('pkcs8', b64urlToBytes(body.replace(/\+/g, '-').replace(/\//g, '_')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

/* ---------- 서비스계정 → OAuth 액세스 토큰 ---------- */
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = strToB64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = strToB64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const key = await importPkcs8(sa.private_key);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(header + '.' + claim));
  const jwt = header + '.' + claim + '.' + bytesToB64url(new Uint8Array(sig));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt,
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(j.error_description || j.error || 'no access_token');
  return j.access_token;
}

/* ---------- Firebase ID 토큰 검증 (Identity Toolkit REST) ---------- */
async function verifyIdToken(idToken, apiKey) {
  if (!apiKey) return { ok: false, error: 'no api key' };
  try {
    const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return { ok: false, error: 'lookup ' + res.status };
    const j = await res.json();
    const u = j.users && j.users[0];
    return u ? { ok: true, uid: u.localId, email: u.email } : { ok: false, error: 'no user' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
