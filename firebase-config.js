/*
 * Firebase 웹 설정.
 *
 * 아래 YOUR_... 값을 본인 Firebase 프로젝트 값으로 바꾸면 구글 로그인이 켜집니다.
 * (값이 그대로면 로그인 없이 데모 모드로 동작합니다.)
 *
 * 값 얻는 곳:
 *   console.firebase.google.com → 프로젝트 → ⚙ 프로젝트 설정
 *   → "내 앱"에서 웹 앱(</>) 추가 → SDK 설정 및 구성 → "구성"
 *
 * 이 값들은 비밀이 아니므로 깃에 커밋해도 안전합니다.
 * (보안은 Firebase 규칙 + 승인된 도메인으로 처리됩니다.)
 */
window.FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  appId: 'YOUR_APP_ID',
};
