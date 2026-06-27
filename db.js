'use strict';

/*
 * Firebase Realtime Database 데이터 레이어 (window.DB).
 *
 * 저장 모델 — 두 노드로 분리해 보안 규칙으로 강제:
 *   /holdings/{uid}  = 전체 보유내역(종목·수량·평단·평가액)   ← 본인만 read/write
 *                       (다른 기기에서도 본인 자산을 그대로 보기 위함)
 *   /shared/{uid}    = { ret, dayPct, count, holdings:[{name, weight, ret, color}] }
 *                       ← 본인 + 팔로워만 read. 금액(수량·평단·평가액)은 없음.
 *   /users/{uid}     = { name, photo, updatedAt }
 *   /following/{uid}/{target} = true,  /followers/{target}/{uid} = true
 *
 * 즉, 민감정보(금액)는 커뮤니티로 공유될 때만 가려진다 — 본인은 항상 본다.
 */
(function () {
  const cfg = window.FIREBASE_CONFIG || {};
  const hasUrl = !!cfg.databaseURL && !String(cfg.databaseURL).includes('YOUR_');

  const DB = {
    enabled: false,
    me: null,
    onAuth: null, // app.js가 로그인/로그아웃 시 호출받을 콜백
    syncProfile, saveHoldings, loadHoldings, saveShared, getShared,
    follow, unfollow, isFollowing, watchFollowing, getUser, searchUsers,
  };
  window.DB = DB;

  if (!hasUrl || typeof firebase === 'undefined' || !(window.Auth && window.Auth.enabled)) return;

  let db;
  try { db = firebase.database(); } catch (e) { console.warn('[DB] 초기화 실패:', e.message); return; }
  DB.enabled = true;

  firebase.auth().onAuthStateChanged(function (u) {
    DB.me = u ? u.uid : null;
    if (u) syncProfile({ name: u.displayName, photo: u.photoURL });
    if (typeof DB.onAuth === 'function') DB.onAuth(DB.me);
  });

  function syncProfile(p) {
    if (!DB.me) return Promise.resolve();
    return db.ref('users/' + DB.me).update({
      name: p.name || '익명',
      photo: p.photo || null,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
    });
  }

  // 전체 보유내역 저장 (본인 전용)
  function saveHoldings(holdings) {
    if (!DB.me) return Promise.resolve();
    return db.ref('holdings/' + DB.me).set({ items: holdings || [], updatedAt: firebase.database.ServerValue.TIMESTAMP });
  }

  // 다른 기기에서 본인 보유내역 불러오기
  function loadHoldings() {
    if (!DB.me) return Promise.resolve(null);
    return db.ref('holdings/' + DB.me).get().then(function (s) {
      const v = s.val();
      return v && v.items ? v.items : null;
    });
  }

  // 공유본 저장 (비중·수익률만, 금액 제외)
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

  // 팔로우한 사람의 공유 포트폴리오 (금액 없음)
  function getShared(uid) {
    return db.ref('shared/' + uid).get().then(function (s) { return s.exists() ? s.val() : null; });
  }

  function follow(target) {
    if (!DB.me || !target || target === DB.me) return Promise.resolve();
    const updates = {};
    updates['following/' + DB.me + '/' + target] = true;
    updates['followers/' + target + '/' + DB.me] = true;
    return db.ref().update(updates);
  }

  function unfollow(target) {
    if (!DB.me || !target) return Promise.resolve();
    const updates = {};
    updates['following/' + DB.me + '/' + target] = null;
    updates['followers/' + target + '/' + DB.me] = null;
    return db.ref().update(updates);
  }

  function isFollowing(target) {
    if (!DB.me || !target) return Promise.resolve(false);
    return db.ref('following/' + DB.me + '/' + target).get().then(function (s) { return s.exists(); });
  }

  function watchFollowing(cb) {
    if (!DB.me) { cb([]); return function () {}; }
    const ref = db.ref('following/' + DB.me);
    const handler = ref.on('value', function (snap) { cb(Object.keys(snap.val() || {})); });
    return function () { ref.off('value', handler); };
  }

  function getUser(uid) {
    return db.ref('users/' + uid).get().then(function (s) { return s.exists() ? Object.assign({ uid: uid }, s.val()) : null; });
  }

  function searchUsers(query) {
    const q = (query || '').trim().toLowerCase();
    return db.ref('users').limitToFirst(200).get().then(function (s) {
      const out = [];
      s.forEach(function (child) {
        const v = child.val() || {};
        if (child.key === DB.me) return;
        if (!q || (v.name || '').toLowerCase().includes(q)) out.push(Object.assign({ uid: child.key }, v));
      });
      return out;
    });
  }

  function round1(n) { return n == null ? 0 : Math.round(n * 10) / 10; }
})();
