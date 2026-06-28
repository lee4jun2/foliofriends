'use strict';

/*
 * Firebase Realtime Database 데이터 레이어 (window.DB).
 *
 * 저장 모델
 *   /holdings/{uid} = 전체 보유내역(금액 포함) — 본인만 read/write (다기기 동기화)
 *   /shared/{uid}   = { ret, dayPct, holdings:[{name,weight,ret,color}] } — 본인+친구만 read (금액 없음)
 *   /users/{uid}    = { name, photo }
 *   /friends/{uid}/{other} = true  — 대칭(둘 다 기록). 한쪽이 지우면 둘 다 해제.
 *   /invites/{code} = { from, name, exp } — 짧은 유효기간 초대코드(링크 공유용)
 *
 * 친구 맺기: 검색이 아니라 초대링크. 상대가 로그인 상태로 수락하면 양쪽 friends에 기록.
 */
(function () {
  const cfg = window.FIREBASE_CONFIG || {};
  const hasUrl = !!cfg.databaseURL && !String(cfg.databaseURL).includes('YOUR_');

  // 가입 승인 권한을 가진 소유자(관리자) 이메일. 이 계정만 승인 가능.
  const OWNER_EMAIL = 'leejunhyuk0205@gmail.com';

  const INVITE_TTL = 3 * 60 * 60 * 1000; // 3시간

  const DB = {
    enabled: false, me: null, onAuth: null,
    isAdmin: false, approved: false, approvedReady: false, profileName: null,
    syncProfile, setNickname, saveHoldings, loadHoldings, saveShared, getShared,
    createInvite, getInvite, acceptInvite, watchFriends, unfriend, getUser,
    approveUser, rejectUser, watchPending, addSymbols, reserveGeminiCall,
    savePushToken, getPushToken,
  };
  window.DB = DB;

  if (!hasUrl || typeof firebase === 'undefined' || !(window.Auth && window.Auth.enabled)) return;

  let db;
  try { db = firebase.database(); } catch (e) { console.warn('[DB] 초기화 실패:', e.message); return; }
  DB.enabled = true;

  let _approvedRef = null;
  firebase.auth().onAuthStateChanged(function (u) {
    DB.me = u ? u.uid : null;
    // 소유자(관리자)는 지정된 이메일 계정만.
    DB.isAdmin = !!(u && u.email && u.email.toLowerCase() === OWNER_EMAIL);
    if (u) console.log('[FF] 로그인:', u.email, '| 관리자(소유자):', DB.isAdmin, '| 소유자이메일:', OWNER_EMAIL);
    DB.approved = false;
    DB.approvedReady = false;
    if (_approvedRef) { _approvedRef.off(); _approvedRef = null; }
    if (!u) { DB.approved = false; DB.approvedReady = true; if (DB.onAuth) DB.onAuth(null); return; }

    // 프로필 동기화 — 닉네임(name)은 한번 설정하면 유지(로그인 때 본명으로 덮어쓰지 않음)
    db.ref('users/' + u.uid).get().then(function (snap) {
      const isNew = !snap.exists();
      const existing = snap.val() || {};
      DB.profileName = existing.name || u.displayName || '사용자';
      const upd = { photo: u.photoURL || null, updatedAt: firebase.database.ServerValue.TIMESTAMP };
      if (isNew) upd.name = u.displayName || '사용자';
      db.ref('users/' + u.uid).update(upd);
      if (DB.isAdmin) db.ref('approved/' + u.uid).set(true);
      else if (isNew) notifyNewUser(u);
      if (DB.onAuth) DB.onAuth(DB.me);
    }).catch(function () {});

    // 승인 상태 실시간 구독 → 미승인이면 앱 게이트가 막음
    _approvedRef = db.ref('approved/' + u.uid);
    _approvedRef.on('value', function (s) {
      DB.approved = DB.isAdmin || s.val() === true;
      DB.approvedReady = true;
      if (DB.onAuth) DB.onAuth(DB.me);
    });
  });

  // 신규 가입 텔레그램 알림 (소유자 봇으로)
  function notifyNewUser(u) {
    const token = cfg.telegramBotToken, chat = cfg.telegramChatId;
    if (!token || String(token).includes('YOUR_') || !chat || String(chat).includes('YOUR_')) return;
    const text = '🆕 FolioFriends 신규 가입\n이름: ' + (u.displayName || '-') + '\n이메일: ' + (u.email || '-');
    fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text }),
    }).catch(function () {});
  }

  // 승인/거절은 단일 경로로 분리 — /rejected 규칙이 없어도 /approved 쓰기는 성공하게.
  function approveUser(uid) {
    return db.ref('approved/' + uid).set(true).then(function () {
      db.ref('rejected/' + uid).remove().catch(function () {}); // 거절 해제(있으면), best-effort
    });
  }
  function rejectUser(uid) {
    return db.ref('rejected/' + uid).set(true).catch(function () {}).then(function () {
      db.ref('approved/' + uid).remove().catch(function () {});
    });
  }

  // 승인 대기자 목록(소유자 전용) 실시간 구독 — 승인/거절된 사람 제외.
  // 규칙 미적용 등으로 approved/rejected 읽기가 막혀도 빈 객체로 견딘다.
  function watchPending(cb) {
    if (!DB.isAdmin) { cb([]); return function () {}; }
    const uref = db.ref('users');
    const getMap = (path) => db.ref(path).get().then((s) => s.val() || {}).catch(() => ({}));
    const handler = uref.on('value', function (snap) {
      Promise.all([getMap('approved'), getMap('rejected')]).then(function (r) {
        const approved = r[0], rejected = r[1];
        const pending = [];
        snap.forEach(function (c) { if (!approved[c.key] && !rejected[c.key]) pending.push(Object.assign({ uid: c.key }, c.val())); });
        cb(pending);
      });
    }, function () { cb([]); });
    return function () { uref.off('value', handler); };
  }

  // 사용자가 보유한 종목 심볼을 /symbols 에 모음 → 크론이 시세를 받아간다.
  function addSymbols(syms) {
    if (!DB.me || !syms) return Promise.resolve();
    const updates = {};
    syms.filter(Boolean).forEach(function (s) {
      const k = String(s).replace(/[.#$/\[\]=^]/g, '_');
      updates['symbols/' + k] = s;
    });
    if (!Object.keys(updates).length) return Promise.resolve();
    return db.ref().update(updates).catch(function () {});
  }

  // Gemini 호출 전 전역(전체 유저 합산) 일일 카운터를 원자적으로 예약한다.
  // 과금 방지: cap 도달 시 트랜잭션이 abort → { ok:false }. 권한/네트워크 실패 시
  // { ok:true, global:false }로 두어 클라이언트의 유저당 로컬 캡에 위임한다.
  function reserveGeminiCall(cap) {
    if (!DB.me || !db) return Promise.resolve({ ok: true, count: 0, global: false });
    const d = new Date();
    const date = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    const ref = db.ref('usage/gemini/' + date);
    return ref.transaction(function (c) {
      c = c || 0;
      if (c >= cap) return; // abort → 한도 초과
      return c + 1;
    }).then(function (res) {
      return { ok: !!res.committed, count: (res.snapshot && res.snapshot.val()) || 0, global: true };
    }).catch(function () {
      return { ok: true, count: 0, global: false };
    });
  }

  // 웹 푸시(FCM) 토큰 저장/조회. 알림 발송 대상의 토큰을 친구/소유자가 읽을 수 있게(규칙).
  function savePushToken(token) {
    if (!DB.me || !token) return Promise.resolve();
    return db.ref('pushTokens/' + DB.me).set({ token: token, updatedAt: firebase.database.ServerValue.TIMESTAMP });
  }
  function getPushToken(uid) {
    if (!uid) return Promise.resolve(null);
    return db.ref('pushTokens/' + uid).get().then(function (s) { return s.exists() ? (s.val().token || null) : null; }).catch(function () { return null; });
  }

  function syncProfile(p) {
    if (!DB.me) return Promise.resolve();
    return db.ref('users/' + DB.me).update({
      photo: p.photo || null,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
    });
  }

  // 닉네임 설정 (본명 대신 표시)
  function setNickname(nick) {
    if (!DB.me || !nick) return Promise.resolve();
    DB.profileName = nick;
    return db.ref('users/' + DB.me).update({ name: nick });
  }

  function saveHoldings(holdings) {
    if (!DB.me) return Promise.resolve();
    return db.ref('holdings/' + DB.me).set({ items: holdings || [], updatedAt: firebase.database.ServerValue.TIMESTAMP });
  }
  function loadHoldings() {
    if (!DB.me) return Promise.resolve(null);
    return db.ref('holdings/' + DB.me).get().then(function (s) { const v = s.val(); return v && v.items ? v.items : null; });
  }
  function saveShared(port) {
    if (!DB.me || !port) return Promise.resolve();
    const holdings = (port.holdings || []).map(function (s) {
      return { name: s.name, weight: round1(s.weight), ret: round1(s.ret), color: s.color || null };
    });
    return db.ref('shared/' + DB.me).set({
      ret: round1(port.ret), dayPct: round1(port.dayPct), count: holdings.length,
      holdings: holdings, updatedAt: firebase.database.ServerValue.TIMESTAMP,
    });
  }
  function getShared(uid) {
    return db.ref('shared/' + uid).get().then(function (s) { return s.exists() ? s.val() : null; });
  }

  // ----- 초대 / 친구 -----
  function randomCode() {
    let s = '';
    const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const buf = (window.crypto && window.crypto.getRandomValues) ? window.crypto.getRandomValues(new Uint32Array(8)) : null;
    for (let i = 0; i < 8; i++) { const r = buf ? buf[i] : Math.floor(Math.random() * 1e9); s += a[r % a.length]; }
    return s;
  }

  // 내 초대코드 생성 (짧은 유효기간). { code, exp } 반환
  function createInvite(myName) {
    if (!DB.me) return Promise.reject(new Error('로그인이 필요해요'));
    const code = randomCode();
    const exp = Date.now() + INVITE_TTL;
    return db.ref('invites/' + code).set({ from: DB.me, name: myName || '친구', exp: exp })
      .then(function () { return { code: code, exp: exp }; });
  }

  function getInvite(code) {
    return db.ref('invites/' + code).get().then(function (s) { return s.exists() ? s.val() : null; });
  }

  // 초대 수락 → 양쪽 friends에 기록. 친구 uid 반환
  function acceptInvite(code) {
    if (!DB.me) return Promise.reject(new Error('로그인이 필요해요'));
    return getInvite(code).then(function (inv) {
      if (!inv) throw new Error('유효하지 않은 초대예요');
      if (inv.exp && inv.exp < Date.now()) throw new Error('만료된 초대예요');
      if (inv.from === DB.me) throw new Error('본인 초대는 수락할 수 없어요');
      const other = inv.from;
      const updates = {};
      updates['friends/' + DB.me + '/' + other] = true;
      updates['friends/' + other + '/' + DB.me] = true;
      return db.ref().update(updates).then(function () { return { uid: other, name: inv.name }; });
    });
  }

  // 친구 끊기 (대칭 — 양쪽 해제)
  function unfriend(other) {
    if (!DB.me || !other) return Promise.resolve();
    const updates = {};
    updates['friends/' + DB.me + '/' + other] = null;
    updates['friends/' + other + '/' + DB.me] = null;
    return db.ref().update(updates);
  }

  function watchFriends(cb) {
    if (!DB.me) { cb([]); return function () {}; }
    const ref = db.ref('friends/' + DB.me);
    const handler = ref.on('value', function (snap) { cb(Object.keys(snap.val() || {})); });
    return function () { ref.off('value', handler); };
  }

  function getUser(uid) {
    return db.ref('users/' + uid).get().then(function (s) { return s.exists() ? Object.assign({ uid: uid }, s.val()) : null; });
  }

  function round1(n) { return n == null ? 0 : Math.round(n * 10) / 10; }
})();
