/*
 * Firebase 웹 설정.
 *
 * ⚠️ 실제 값은 소스에 두지 않습니다.
 * 배포 시 GitHub Actions가 GitHub Secrets에서 이 파일을 생성합니다
 * (.github/workflows/deploy.yml 참고).
 *
 * 이 플레이스홀더 상태에서는 로그인 없이 "데모 모드"로 동작하므로
 * 로컬 개발(예: python3 -m http.server) 시 그대로 미리볼 수 있습니다.
 *
 * 로컬에서 실제 로그인을 테스트하려면 이 값들을 본인 Firebase 값으로
 * 잠시 바꾸되, 커밋하지 마세요.
 */
window.FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  databaseURL: 'YOUR_DATABASE_URL',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
  measurementId: 'YOUR_MEASUREMENT_ID',
  // 가입 승인제 / 텔레그램 알림 (소유자 전용)
  ownerEmail: 'YOUR_OWNER_EMAIL',          // 소유자 구글 로그인 이메일 (승인 권한)
  telegramBotToken: 'YOUR_TELEGRAM_TOKEN', // 신규 가입 알림용 텔레그램 봇 토큰
  telegramChatId: 'YOUR_TELEGRAM_CHAT_ID', // 알림 받을 내 채팅 ID
};
