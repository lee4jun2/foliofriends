'use strict';

/*
 * Gemini 비전으로 증권 앱 스크린샷에서 보유 종목을 추출한다.
 *
 * - 키(window.FIREBASE_CONFIG.geminiApiKey)는 배포 시 GitHub Secret에서 주입.
 * - 브라우저에서 직접 호출(방법 A). 키는 Google Cloud Console에서 HTTP 리퍼러로
 *   네 Pages 도메인만 허용하도록 제한해 두는 걸 권장.
 * - 키가 없거나 호출이 실패하면 app.js가 기존 Tesseract 파서로 자동 대체한다.
 *
 * 반환: [{ name, y, usd, shares, avg }]  (OCR_DRAFTS와 동일한 형식)
 */
(function () {
  const MODEL = 'gemini-2.5-flash';
  const ENDPOINT = (key) =>
    'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + encodeURIComponent(key);

  function apiKey() {
    const k = window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.geminiApiKey;
    return k && !String(k).includes('YOUR_') ? k : null;
  }
  function visionAvailable() { return !!apiKey(); }

  // ---- 과금 방지: 이중 일일 한도(하드 차단) ----
  // Gemini 2.5 Flash 무료 한도는 시기에 따라 250~1500 RPD로 변동 → 가장 낮은 250 기준,
  // 그 ~60%인 150을 "전체 유저 합산" 상한으로 잡는다(=결제가 켜져 있어도 과금 구간 도달 불가).
  //   · GLOBAL_CAP : 전체 유저 합산/일 (Firebase 카운터, 권위 있는 차단)
  //   · PER_USER_CAP: 한 사람/기기당/일 (localStorage, 한 명이 전체를 소진 못 하게)
  // 확실한 보장은 "결제 미연동 프로젝트의 키" 사용. 코드 한도는 추가 방어선.
  const GLOBAL_CAP = 150;
  const PER_USER_CAP = 20;
  const MIN_GAP_MS = 4000; // 연속 호출 최소 간격(폭주 방지)
  const USAGE_KEY = 'ff_gemini_usage_v1';
  function _today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function _usage() {
    try { const u = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null'); if (u && u.date === _today()) return u; } catch (e) {}
    return { date: _today(), count: 0, last: 0 };
  }
  function _save(u) { try { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); } catch (e) {} }
  function quotaRemaining() { return Math.max(0, PER_USER_CAP - _usage().count); }
  function _capError(msg, code) { const e = new Error(msg); e.code = code; return e; }

  // 파일 → 다운스케일(가장 긴 변 1600px) JPEG base64. 토큰/전송량 절감.
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        const max = 1600;
        let w = img.naturalWidth, h = img.naturalHeight;
        const scale = Math.min(1, max / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = cv.toDataURL('image/jpeg', 0.9);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 불러오지 못했어요')); };
      img.src = url;
    });
  }

  const PROMPT = [
    '이 이미지들은 한국 증권 앱(예: 도미노/토스 등)의 보유 종목 화면 스크린샷이다.',
    '각 보유 종목에 대해 다음을 정확히 추출해라:',
    '- name: 종목명 (한국 주식은 한글명, 미국 주식은 영문명. 예: 삼성전자, NVIDIA, Tesla)',
    '- shares: 보유 수량(주식 수). 정수 또는 소수.',
    '- avg: 평균 단가(평단가, 1주당 매입 평균가격). 현재가가 아니라 "평단가"여야 한다.',
    '- currency: 평단가의 통화. "$" 또는 달러 표기가 있으면 "USD", 원/₩ 표기면 "KRW".',
    '',
    '이미지가 2장이면 한 장은 수량(평가 탭), 한 장은 평단가(시세 탭)일 수 있다.',
    '같은 종목명끼리 짝지어 하나로 병합해라.',
    '현금/총자산/예수금/합계/요약 같은 줄은 종목이 아니므로 제외해라.',
    'avg나 shares를 못 읽으면 그 값은 0으로 둬라(종목은 그대로 포함).',
    'JSON 배열로만 답하라.',
  ].join('\n');

  const SCHEMA = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        shares: { type: 'NUMBER' },
        avg: { type: 'NUMBER' },
        currency: { type: 'STRING', enum: ['KRW', 'USD'] },
      },
      required: ['name', 'shares', 'avg', 'currency'],
    },
  };

  // files: File[]  (1~2장)
  async function visionExtract(files, onProgress) {
    const key = apiKey();
    if (!key) throw new Error('Gemini 키가 없어요');
    // 과금 방지 가드 — 한도 초과/너무 잦은 호출이면 호출 자체를 막는다.
    const u = _usage();
    if (u.count >= PER_USER_CAP) throw _capError('오늘 내 AI 분석 한도(' + PER_USER_CAP + '회)에 도달했어요. 내일 다시 시도하거나 직접 입력해 주세요.', 'DAILY_CAP');
    const now = Date.now();
    if (u.last && now - u.last < MIN_GAP_MS) throw _capError('너무 빨라요. 잠시 후 다시 시도해 주세요.', 'TOO_FAST');
    // 전체 유저 합산 한도를 Firebase에서 원자적으로 예약(권위 있는 차단).
    if (window.DB && window.DB.reserveGeminiCall) {
      const r = await window.DB.reserveGeminiCall(GLOBAL_CAP);
      if (!r.ok) throw _capError('오늘 전체 AI 분석 한도에 도달했어요. 내일 다시 시도하거나 직접 입력해 주세요.', 'DAILY_CAP');
    }
    // 네트워크 호출 전에 유저 카운트를 올린다(실패해도 차감 — 가장 보수적).
    u.count += 1; u.last = now; _save(u);
    if (onProgress) onProgress('이미지 준비 중…');
    const parts = [{ text: PROMPT }];
    for (const f of files) {
      const b64 = await fileToBase64(f);
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
    }
    if (onProgress) onProgress('AI가 종목을 읽고 있어요…');
    const body = {
      contents: [{ parts: parts }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
    };
    const res = await fetch(ENDPOINT(key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) {}
      throw new Error('Gemini 호출 실패: ' + msg);
    }
    const json = await res.json();
    const text = json && json.candidates && json.candidates[0] &&
      json.candidates[0].content && json.candidates[0].content.parts &&
      json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text;
    if (!text) throw new Error('응답이 비었어요');
    let rows;
    try { rows = JSON.parse(text); } catch (e) { throw new Error('응답 파싱 실패'); }
    if (!Array.isArray(rows)) throw new Error('형식이 올바르지 않아요');
    return toDrafts(rows);
  }

  // Gemini 결과 → OCR_DRAFTS 형식. 종목명은 사전 매칭으로 야후 심볼(y) 보정.
  function toDrafts(rows) {
    const out = [];
    rows.forEach(function (r) {
      const rawName = (r.name || '').trim();
      if (!rawName) return;
      const usd = String(r.currency).toUpperCase() === 'USD';
      const norm = (typeof window.normalizeName === 'function') ? window.normalizeName(rawName) : { name: rawName, y: null };
      const shares = Number(r.shares);
      const avg = Number(r.avg);
      out.push({
        name: norm.name || rawName,
        y: norm.y || null,
        usd: usd,
        shares: Number.isFinite(shares) && shares > 0 ? shares : null,
        avg: Number.isFinite(avg) && avg > 0 ? avg : null,
      });
    });
    return out.filter(function (d) { return d.name; });
  }

  window.visionAvailable = visionAvailable;
  window.visionExtract = visionExtract;
  window.visionQuotaRemaining = quotaRemaining;
  window.visionDailyCap = PER_USER_CAP;
})();
