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
  // flash-lite: 비전 정확도 동등 + 무료 한도가 훨씬 큼(2.5-flash는 무료 20회/일이라 금방 소진).
  const MODEL = 'gemini-2.5-flash-lite';
  const ENDPOINT = (key) =>
    'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + encodeURIComponent(key);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
        const max = 2048;
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

  // 화면 한 장에서 "보이는 값만" 추출하는 프롬프트(병합은 코드가 함 → 훨씬 정확).
  const PROMPT = [
    '이 이미지는 한국 증권 앱(도미노/토스 등)의 보유 종목 목록 화면 한 장이다.',
    '화면에 보이는 모든 보유 종목을 하나도 빠짐없이 추출해라.',
    '(좌 단위 펀드·MMF도 포함. 단 현금/예수금/총자산/합계/요약 줄은 제외.)',
    '각 종목 행에서 그 화면에 "실제로 보이는 값만" 채워라(안 보이면 비워둬라):',
    '- name: 종목명 그대로 (예: 삼성전자, SK하이닉스, NVDA, TIGER 미국S&P500)',
    '- market: 한국 종목 "KR", 미국 종목 "US"',
    '- ticker: 시세조회용 코드(네 지식으로). 미국=티커(NVDA,TSLA,AAPL), 한국=6자리코드(삼성전자 005930). 모르면 빈 문자열.',
    '- shares: 종목명 바로 아래의 "N주" 또는 "N좌" 수량 (보일 때만)',
    '- avg: 종목명 바로 아래의 작은 글씨 "평단가"(매입평균가). 우측의 큰 현재가가 절대 아니다 (보일 때만)',
    '- currency: 가격이 $면 "USD", 원이면 "KRW"',
    '- evalAmount: 우측의 큰 "평가금액"(원 단위 정수) (보일 때만)',
    '- profitPct: 우측 괄호 안 수익률 %(부호 포함, 예 -10.44) (보일 때만)',
    '숫자는 한 자리씩 또박또박 정확히 읽어라. 비슷한 숫자(1/4/7, 0/6/9) 혼동 금지.',
    '어떤 종목 행도 빠뜨리지 마라. JSON 배열로만 답하라.',
  ].join('\n');

  const SCHEMA = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        market: { type: 'STRING', enum: ['KR', 'US'] },
        ticker: { type: 'STRING' },
        shares: { type: 'NUMBER' },
        avg: { type: 'NUMBER' },
        currency: { type: 'STRING', enum: ['KRW', 'USD'] },
        evalAmount: { type: 'NUMBER' },
        profitPct: { type: 'NUMBER' },
      },
      required: ['name'],
    },
  };

  // Gemini가 준 ticker/market로 야후 심볼 구성. 사전 매칭(dictY)이 있으면 그걸 우선.
  function buildSymbol(r, usd, dictY) {
    if (dictY) return dictY;
    const ticker = String(r.ticker || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!ticker) return null;
    const market = String(r.market || '').toUpperCase();
    const isKR = market === 'KR' || (!market && !usd);
    if (isKR) {
      const code = ticker.replace(/[^0-9]/g, '');
      return /^\d{6}$/.test(code) ? code + '.KS' : null; // 크론이 실패 시 .KQ로 폴백
    }
    return /^[A-Z][A-Z.\-]{0,5}$/.test(ticker) ? ticker : null; // 미국 티커
  }

  const _n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

  // 이미지 한 장 → Gemini 호출 → 행 배열. 503(혼잡)은 재시도, 429(한도)는 QUOTA 에러.
  async function callOne(key, b64) {
    const body = {
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
    };
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(ENDPOINT(key), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) break;
      if (res.status === 503 && attempt < 2) { await sleep(1200 * (attempt + 1)); continue; } // 일시 혼잡 → 재시도
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) {}
      if (res.status === 429 || /quota|exceeded|RESOURCE_EXHAUSTED/i.test(msg)) throw _capError('무료 AI 한도가 잠시 소진됐어요. 잠시 후 다시 시도하거나 직접 입력해 주세요.', 'QUOTA');
      throw new Error('Gemini 호출 실패: ' + msg);
    }
    const json = await res.json();
    const text = json && json.candidates && json.candidates[0] && json.candidates[0].content &&
      json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text;
    if (!text) return [];
    let rows; try { rows = JSON.parse(text); } catch (e) { return []; }
    return Array.isArray(rows) ? rows : [];
  }

  // files: File[] (여러 장). 화면별로 따로 추출 후 코드로 이름 기준 병합.
  async function visionExtract(files, onProgress) {
    const key = apiKey();
    if (!key) throw new Error('Gemini 키가 없어요');
    const u0 = _usage();
    if (u0.last && Date.now() - u0.last < MIN_GAP_MS) throw _capError('너무 빨라요. 잠시 후 다시 시도해 주세요.', 'TOO_FAST');

    const allRows = [];
    for (let i = 0; i < files.length; i++) {
      // 과금 방지: 이미지(=호출) 1건마다 한도 검사/예약
      const u = _usage();
      if (u.count >= PER_USER_CAP) throw _capError('오늘 내 AI 분석 한도(' + PER_USER_CAP + '회)에 도달했어요. 내일 다시 시도하거나 직접 입력해 주세요.', 'DAILY_CAP');
      if (window.DB && window.DB.reserveGeminiCall) {
        const r = await window.DB.reserveGeminiCall(GLOBAL_CAP);
        if (!r.ok) throw _capError('오늘 전체 AI 분석 한도에 도달했어요. 내일 다시 시도하거나 직접 입력해 주세요.', 'DAILY_CAP');
      }
      u.count += 1; u.last = Date.now(); _save(u);
      if (onProgress) onProgress(files.length > 1 ? ('화면 ' + (i + 1) + '/' + files.length + ' 읽는 중…') : 'AI가 종목을 읽고 있어요…');
      const b64 = await fileToBase64(files[i]);
      const rows = await callOne(key, b64);
      for (const r of rows) allRows.push(r);
    }
    return mergeRows(allRows);
  }

  // 여러 화면의 행들을 종목명 기준으로 병합 → OCR_DRAFTS 형식.
  function mergeRows(rows) {
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
    const by = new Map();
    rows.forEach(function (r) {
      const nm = (r.name || '').trim();
      if (!nm) return;
      const k = norm(nm);
      if (!k) return;
      let e = by.get(k);
      if (!e) { e = { name: nm, market: '', ticker: '', shares: 0, avg: 0, currency: '', evalAmount: 0, profitPct: null }; by.set(k, e); }
      if (_n(r.shares) > 0) e.shares = _n(r.shares);
      if (_n(r.avg) > 0) { e.avg = _n(r.avg); if (r.currency) e.currency = String(r.currency).toUpperCase(); }
      if (_n(r.evalAmount) > 0) e.evalAmount = _n(r.evalAmount);
      if (r.profitPct != null && r.profitPct !== '' && Number.isFinite(Number(r.profitPct))) e.profitPct = Number(r.profitPct);
      if (!e.ticker && r.ticker) e.ticker = r.ticker;
      if (!e.market && r.market) e.market = String(r.market).toUpperCase();
      if (!e.currency && r.currency) e.currency = String(r.currency).toUpperCase();
      if (nm.length > e.name.length) e.name = nm; // 더 완전한 종목명 채택
    });

    const out = [];
    by.forEach(function (e) {
      const usd = e.currency === 'USD' || e.market === 'US';
      // 직접 읽은 수량/평단가를 신뢰. 평단가가 화면에 없을 때만(평가 탭 단독 등) 역산.
      let avg = e.avg;
      if ((!avg || avg <= 0) && !usd && e.evalAmount > 0 && e.profitPct != null && e.shares > 0) {
        avg = Math.round((e.evalAmount / (1 + e.profitPct / 100)) / e.shares);
      }
      const nm2 = (typeof window.normalizeName === 'function') ? window.normalizeName(e.name) : { name: e.name, y: null };
      out.push({
        name: nm2.name || e.name,
        y: buildSymbol(e, usd, nm2.y),
        usd: usd,
        shares: e.shares > 0 ? e.shares : null,
        avg: avg > 0 ? avg : null,
      });
    });
    return out.filter(function (d) { return d.name; });
  }

  window.visionAvailable = visionAvailable;
  window.visionExtract = visionExtract;
  window.visionQuotaRemaining = quotaRemaining;
  window.visionDailyCap = PER_USER_CAP;
})();
