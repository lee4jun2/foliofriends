/* FCM 백그라운드 메시지 처리용 서비스워커.
 * 앱이 등록할 때 쿼리스트링으로 설정을 넘겨받는다(공개값이라 OK). */
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

const _p = new URLSearchParams(location.search);
firebase.initializeApp({
  apiKey: _p.get('k'),
  projectId: _p.get('p'),
  messagingSenderId: _p.get('s'),
  appId: _p.get('a'),
});

const messaging = firebase.messaging();

// data 메시지일 때만 직접 표시(notification 페이로드는 브라우저가 자동 표시).
messaging.onBackgroundMessage(function (payload) {
  const n = (payload && payload.notification) || {};
  if (!n.title) return;
  self.registration.showNotification(n.title, {
    body: n.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: (payload && payload.data) || {},
  });
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
      for (const c of cs) { if ('focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
