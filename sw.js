/* 최소 서비스워커 — PWA 설치 가능 요건 충족용.
 * 시세/데이터는 항상 최신이어야 하므로 캐싱하지 않고 네트워크로 통과시킨다. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* network passthrough (no cache) */ });
