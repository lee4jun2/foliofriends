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

  const INVITE_TTL = 30 * 60 * 1000; // 30분

  const DB = {
    enabled: false, me: null, onAuth: null,
    isAdmin: false, approved: false, approvedReady: false,
    syncProfile, saveHoldings, loadHoldings, saveShared, getShared,
    createInvite, getInvite, acceptInvite, watchFriends, unfriend, getUser,
    approveUser, rejectUser, watchPending, addSymbols,
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
    DB.approved = false;
    DB.approvedReady = false;
    if (_approvedRef) { _approvedRef.off(); _approvedRef = null; }
    if (!u) { DB.approved = false; DB.approvedReady = true; if (DB.onAuth) DB.onAuth(null); return; }

    // 프로필 동기화 + (소유자 자동승인 / 신규 가입이면 텔레그램 알림)
    db.ref('users/' + u.uid).get().then(function (snap) {
      const isNew = !snap.exists();
      syncProfile({ name: u.displayName, photo: u.photoURL });
      if (DB.isAdmin) db.ref('approved/' + u.uid).set(true);
      else if (isNew) notifyNewUser(u);
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

  function approveUser(uid) {
    const updates = {};
    updates['approved/' + uid] = true;
    updates['rejected/' + uid] = null; // 거절 해제
    return db.ref().update(updates);
  }
  function rejectUser(uid) {
    const updates = {};
    updates['rejected/' + uid] = true;
    updates['approved/' + uid] = null;
    return db.ref().update(updates);
  }

  // 승인 대기자 목록(소유자 전용) 실시간 구독 — 승인/거절된 사람 제외
  function watchPending(cb) {
    if (!DB.isAdmin) { cb([]); return function () {}; }
    const uref = db.ref('users');
    const handler = uref.on('value', function (snap) {
      Promise.all([db.ref('approved').get(), db.ref('rejected').get()]).then(function (r) {
        const approved = r[0].val() || {}, rejected = r[1].val() || {};
        const pending = [];
        snap.forEach(function (c) { if (!approved[c.key] && !rejected[c.key]) pending.push(Object.assign({ uid: c.key }, c.val())); });
        cb(pending);
      }).catch(function () { cb([]); });
    });
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

  function syncProfile(p) {
    if (!DB.me) return Promise.resolve();
    return db.ref('users/' + DB.me).update({
      name: p.name || '익명', photo: p.photo || null,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
    });
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
