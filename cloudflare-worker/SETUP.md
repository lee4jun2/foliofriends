# 웹 푸시(가입 승인·친구 추가 알림) 설정

앱을 꺼놔도 폰에 알림이 오게 하는 설정. 모두 무료(카드 불필요).

## 1) Firebase — VAPID 키 + 서비스계정
1. Firebase Console → 프로젝트 설정 → **Cloud Messaging** 탭
   - "웹 푸시 인증서(Web Push certificates)" → **키 쌍 생성** → 나온 공개키 복사 = `FCM_VAPID_KEY`
2. Firebase Console → 프로젝트 설정 → **서비스 계정** 탭
   - **새 비공개 키 생성** → JSON 파일 다운로드 (Worker 시크릿으로 사용)
3. (보통 자동) Google Cloud Console에서 **Firebase Cloud Messaging API (V1)** 사용 설정 확인

## 2) Cloudflare Worker 배포 (발송기)
```
npm i -g wrangler
wrangler login
cd cloudflare-worker
wrangler secret put SERVICE_ACCOUNT     # 1-2의 JSON 파일 내용 전체 붙여넣기
wrangler secret put FIREBASE_API_KEY    # Firebase 웹 API 키(공개값)
wrangler deploy
```
배포되면 URL이 나옴: `https://foliofriends-push.<계정>.workers.dev` = `PUSH_WORKER_URL`

## 3) GitHub Secrets 등록
저장소 → Settings → Secrets and variables → Actions → New secret:
- `FCM_VAPID_KEY`   = 1-1의 공개키
- `PUSH_WORKER_URL` = 2의 Worker URL

## 4) 보안 규칙 재게시
`database.rules.json`에 `/pushTokens` 노드가 추가됨 → Firebase Console 규칙 편집기에 다시 붙여넣고 게시.

## 5) 사용
- 배포 후 앱 → 프로필 → **알림 켜기** (권한 허용 → 토큰 저장)
- 그 뒤 가입 승인/친구 추가가 일어나면 대상에게 푸시 발송
- iOS는 **홈 화면에 추가(PWA)로 설치한 뒤** 웹 푸시가 동작(브라우저 탭 상태에선 제한)

설정 안 하면(시크릿 미등록) 알림 기능은 자동으로 꺼진 채 앱은 정상 동작.
