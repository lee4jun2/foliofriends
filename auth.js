'use strict';

/*
 * 구글 로그인(Firebase Auth) 래퍼.
 * window.Auth 로 노출하며, app.js 가 이를 보고 로그인 게이트를 그린다.
 *
 *   Auth.enabled   설정이 채워져 있어 로그인 기능이 켜졌는지
 *   Auth.ready     초기 인증 상태 확인이 끝났는지
 *   Auth.user      { name, email, photo, uid } 또는 null
 *   Auth.signIn()  구글 팝업 로그인
 *   Auth.signOut() 로그아웃
 *   Auth.onChange  상태 변경 시 호출될 콜백 (app.js가 render를 연결)
 */
(function () {
  const cfg = window.FIREBASE_CONFIG || {};
  const configured = !!cfg.apiKey && !String(cfg.apiKey).includes('YOUR_');

  const Auth = { enabled: false, ready: true, user: null, onChange: null,
    signIn: function () {}, signOut: function () {} };
  window.Auth = Auth;

  if (!configured) return; // 데모 모드: 로그인 없이 동작

  if (typeof firebase === 'undefined') {
    console.warn('[Auth] Firebase SDK를 불러오지 못해 데모 모드로 동작합니다.');
    return;
  }

  try {
    firebase.initializeApp(cfg);
  } catch (e) {
    console.error('[Auth] Firebase 초기화 실패:', e.message);
    return;
  }

  const auth = firebase.auth();
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});

  Auth.enabled = true;
  Auth.ready = false; // 첫 onAuthStateChanged 까지 대기

  Auth.signIn = function () {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return auth.signInWithPopup(provider).catch(function (e) {
      if (e && e.code === 'auth/popup-closed-by-user') return;
      alert('로그인에 실패했어요: ' + (e && e.message ? e.message : e));
    });
  };

  Auth.signOut = function () { return auth.signOut(); };

  auth.onAuthStateChanged(function (u) {
    Auth.user = u ? { name: u.displayName, email: u.email, photo: u.photoURL, uid: u.uid } : null;
    Auth.ready = true;
    if (typeof Auth.onChange === 'function') Auth.onChange();
  });
})();
