'use strict';

/*
 * 웹 푸시(FCM) 클라이언트. (window.Push)
 *  - enable()       : 알림 권한 요청 → FCM 토큰 발급 → /pushTokens/{uid} 저장
 *  - initIfGranted(): 이미 허용된 사용자는 조용히 토큰 갱신/저장
 *  - send(uid,t,b)  : 대상의 토큰을 읽어 Cloudflare Worker로 발송 요청
 *
 * 활성 조건: FIREBASE_CONFIG.fcmVapidKey + pushWorkerUrl 설정 + 브라우저 지원.
 * 미설정/미지원이면 모든 함수가 조용히 no-op (앱 동작엔 영향 없음).
 */
(function () {
  let messaging = null, swReg = null;

  function cfg() { return window.FIREBASE_CONFIG || {}; }
  function configured() {
    const c = cfg();
    return !!(c.fcmVapidKey && !String(c.fcmVapidKey).includes('YOUR_') &&
      c.pushWorkerUrl && !String(c.pushWorkerUrl).includes('YOUR_'));
  }
  function supported() {
    return ('Notification' in window) && ('serviceWorker' in navigator) &&
      (typeof firebase !== 'undefined') && !!firebase.messaging;
  }
  function available() { return configured() && supported(); }

  async function registerSW() {
    if (swReg) return swReg;
    const c = cfg();
    const qs = '?k=' + encodeURIComponent(c.apiKey || '') +
      '&p=' + encodeURIComponent(c.projectId || '') +
      '&s=' + encodeURIComponent(c.messagingSenderId || '') +
      '&a=' + encodeURIComponent(c.appId || '');
    swReg = await navigator.serviceWorker.register('./firebase-messaging-sw.js' + qs, { scope: './fcm-scope' });
    return swReg;
  }

  function initMessaging() {
    if (messaging) return messaging;
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg());
    } catch (e) {}
    messaging = firebase.messaging();
    // 포그라운드(앱 열려있을 때) 메시지 → 시스템 알림 직접 표시
    messaging.onMessage(function (payload) {
      const n = (payload && payload.notification) || {};
      if (!n.title) return;
      try {
        if (swReg && swReg.showNotification) swReg.showNotification(n.title, { body: n.body || '', icon: './icon-192.png' });
        else new Notification(n.title, { body: n.body || '', icon: './icon-192.png' });
      } catch (e) {}
    });
    return messaging;
  }

  // 권한 요청 + 토큰 발급/저장. { ok, reason } 반환
  async function enable() {
    if (!configured()) return { ok: false, reason: 'unconfigured' };
    if (!supported()) return { ok: false, reason: 'unsupported' };
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'denied' };
    try {
      await registerSW();
      initMessaging();
      const token = await messaging.getToken({ vapidKey: cfg().fcmVapidKey, serviceWorkerRegistration: swReg });
      if (!token) return { ok: false, reason: 'no-token' };
      if (window.DB && window.DB.savePushToken) await window.DB.savePushToken(token);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: (e && e.message) || 'error' };
    }
  }

  // 이미 허용된 사용자는 로그인 시 조용히 토큰 갱신(기기/만료 대비)
  async function initIfGranted() {
    if (!available()) return;
    if (Notification.permission === 'granted') { try { await enable(); } catch (e) {} }
  }

  // 대상에게 알림 발송(베스트에포트)
  async function send(targetUid, title, body, link) {
    if (!available() || !targetUid) return;
    try {
      const token = (window.DB && window.DB.getPushToken) ? await window.DB.getPushToken(targetUid) : null;
      if (!token) return;
      const user = window.Auth && window.Auth.user;
      if (!user || !user.getIdToken) return;
      const idToken = await user.getIdToken();
      await fetch(cfg().pushWorkerUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: idToken, token: token, title: title, body: body, link: link }),
      });
    } catch (e) {}
  }

  function permission() { return ('Notification' in window) ? Notification.permission : 'unsupported'; }

  window.Push = { available: available, configured: configured, enable: enable, initIfGranted: initIfGranted, send: send, permission: permission };
})();
