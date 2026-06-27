/*
 * Firebase 웹 설정.
 *
 * 이 값들은 비밀이 아니므로 깃에 커밋해도 안전합니다.
 * (보안은 Firebase 규칙 + 승인된 도메인으로 처리됩니다.)
 *
 * 값 얻는 곳:
 *   console.firebase.google.com → 프로젝트 → ⚙ 프로젝트 설정
 *   → "내 앱"에서 웹 앱(</>) → SDK 설정 및 구성 → "구성"
 */
window.FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
  measurementId: 'YOUR_MEASUREMENT_ID',
};
