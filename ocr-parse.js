'use strict';

/*
 * 토스증권 "평가" 탭 스크린샷 OCR 텍스트를 보유 종목으로 파싱한다.
 *
 * 각 종목은 2줄로 구성:
 *   [로고] 종목명            평가액          (이름 줄)
 *   N주        +총수익원 (+수익률%)          (상세 줄)
 *
 * 평가액과 수익률은 OCR이 안정적이므로, 평단가는 총수익(노이즈 가능)이 아니라
 * 수익률로 역산한다:  cost = 평가액 / (1 + 수익률/100),  평단가 = cost / 수량.
 */

// ---- 종목 사전 퍼지 매칭 (OCR 깨진 이름 → 표준명/야후심볼 교정) ----
function _norm(s) { return (s || '').toLowerCase().replace(/[^가-힣a-z0-9]/g, ''); }
function _bigrams(s) {
  const b = [];
  if (s.length <= 1) return s ? [s] : [];
  for (let i = 0; i < s.length - 1; i++) b.push(s.slice(i, i + 2));
  return b;
}
// Dice 계수(바이그램) + 부분문자열 보너스
function _sim(a, b) {
  a = _norm(a); b = _norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a))) return 0.92;
  const A = _bigrams(a), B = _bigrams(b);
  if (!A.length || !B.length) return 0;
  const cnt = {};
  B.forEach((x) => { cnt[x] = (cnt[x] || 0) + 1; });
  let inter = 0;
  A.forEach((x) => { if (cnt[x] > 0) { inter++; cnt[x]--; } });
  return (2 * inter) / (A.length + B.length);
}

// raw(OCR 종목명) → {name, y, matched, score}
function normalizeName(raw) {
  const cleaned = (raw || '').replace(/\s+/g, ' ').trim();
  const dict = (typeof window !== 'undefined' && window.STOCKS) ? window.STOCKS : [];
  let best = null, bestScore = 0;
  for (const e of dict) {
    const cands = [e.name].concat(e.aliases || []);
    for (const c of cands) {
      const sc = _sim(cleaned, c);
      if (sc > bestScore) { bestScore = sc; best = e; }
    }
  }
  if (best && bestScore >= 0.45) {
    return { name: best.name, y: best.y || null, matched: true, score: bestScore };
  }
  // 매칭 실패: OCR 원문 정리해서 그대로 (사용자가 검토화면에서 수정)
  const fallback = cleaned.replace(/^[^A-Za-z가-힣]+/, '').trim();
  return { name: fallback || cleaned, y: null, matched: false, score: bestScore };
}

function parseTossEval(text) {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const out = [];
  let started = false, pending = null;

  for (const line of lines) {
    if (/^\s*현금/.test(line)) break;
    if (!started) { if (/시세.*평가|평가\s*[액맥]|평가\s*$/.test(line)) started = true; continue; }

    const hasPct = /[\(\[]\s*[+\-]?[\d.,]+\s*%\s*[\)\]]/.test(line);
    if (hasPct) {
      if (!pending) continue;
      const sharesM = line.match(/^[^\d]*([\d,]+)/);
      const pctM = line.match(/[\(\[]\s*([+\-]?[\d.,]+)\s*%/);
      const shares = sharesM ? parseInt(sharesM[1].replace(/,/g, ''), 10) : null;
      let retPct = pctM ? parseFloat(pctM[1].replace(/,/g, '')) : null;
      // 괄호 앞 부호 추론: 상세 줄에 '-'로 시작하는 금액이 있으면 손실.
      if (retPct != null && retPct > 0 && /[\(\[]\s*-/.test(line) === false) {
        const lossM = line.match(/[-]\s?[\d,]{3,}\s*원?\s*[\(\[]/);
        if (lossM) retPct = -Math.abs(retPct);
      }
      const evalV = pending.eval;
      let cost = null, avg = null, cur = null, profit = null;
      if (evalV != null && retPct != null) {
        cost = Math.round(evalV / (1 + retPct / 100));
        profit = evalV - cost;
        if (shares) { avg = Math.round(cost / shares); cur = Math.round(evalV / shares); }
      }
      const norm = normalizeName(pending.rawName);
      out.push({ name: norm.name, y: norm.y, matched: norm.matched, rawName: pending.rawName, shares, eval: evalV, retPct, profit, avg, cur });
      pending = null;
    } else {
      const nums = line.match(/[\d,]{4,}/g);
      const evalV = nums ? parseInt(nums[nums.length - 1].replace(/,/g, ''), 10) : null;
      if (evalV == null || evalV < 1000) { continue; }
      const rawName = line.replace(/[\d,]+\s*원?/g, ' ').replace(/\s+/g, ' ').trim();
      pending = { rawName, eval: evalV };
    }
  }
  return out;
}

/* ===== 두 화면 전용 파서 (정확도 ↑) ===== */

// 헤더("시세 평가") 이후 ~ "현금" 이전의 줄들만
function _bodyLines(text) {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const out = [];
  let started = false;
  for (const line of lines) {
    if (/^\s*현금/.test(line)) break;
    if (!started) { if (/시세\s*평가|평가\s*[액맥]|평가맥/.test(line)) started = true; continue; }
    out.push(line);
  }
  return out;
}

// 줄에서 가격·퍼센트만 떼고 종목명 후보로 사전 매칭.
// 종목명에 든 작은 숫자(S&P500의 500, TOP10의 10, KODEX 200 등)는 보존.
function _lineName(line) {
  const textPart = line
    .replace(/\$\s*[\d.,]+/g, ' ')       // $가격
    .replace(/[\d,]{4,}/g, ' ')          // 큰 숫자(가격, 4자리+ 또는 콤마)
    .replace(/[\d,]+\s*원/g, ' ')        // X원
    .replace(/[+\-]?[\d.]+\s*%/g, ' ')   // 퍼센트
    .replace(/[^A-Za-z가-힣0-9&]/g, ' ') // 숫자는 보존
    .trim();
  return normalizeName(textPart);
}

const _PCT = /[\(\[]?\s*[+\-]?[\d.,]+\s*%/;

// ① 주식수 화면(평가 탭): [{name, y, shares}] (이름이 윗줄로 분리돼도 복구)
function parseSharesView(text) {
  const lines = _bodyLines(text);
  const out = [];
  let recent = [];
  for (const line of lines) {
    // 상세줄: (±X%) 형태의 퍼센트를 포함 (MMF처럼 +2원 작은 손익도 누락 안 되게 완화)
    const isDetail = /[\(\[]\s*[+\-]?[\d.,]+\s*%/.test(line);
    if (isDetail) {
      const sharesM = line.match(/^[^\d]*([\d,]+)/);
      const shares = sharesM ? parseInt(sharesM[1].replace(/,/g, ''), 10) : null;
      const pctM = line.match(/[\(\[]\s*([+\-]?[\d.,]+)\s*%/);
      const retPct = pctM ? parseFloat(pctM[1].replace(/,/g, '')) : null;
      // 직전 1~2줄을 이름 후보로, 사전 매칭 점수가 높은 쪽 선택
      let best = { name: '', y: null, score: 0, matched: false };
      for (const cand of recent.slice(-2)) {
        const n = _lineName(cand);
        if (n.score >= best.score) best = n;
      }
      // 평가액(이름줄의 큰 숫자) → 평단가 역산 (단독 업로드 fallback용)
      let evalV = null;
      for (const cand of recent) {
        const em = cand.match(/([\d,]{5,})/);
        if (em) { const v = parseInt(em[1].replace(/,/g, ''), 10); if (v > (evalV || 0)) evalV = v; }
      }
      let avg = null;
      if (evalV && retPct != null && shares) avg = Math.round((evalV / (1 + retPct / 100)) / shares);
      if (shares && shares > 0 && (best.name || recent.length)) {
        out.push({ name: best.name || _lineName(recent[recent.length - 1] || '').name, y: best.y, shares, avg, matched: best.matched });
      }
      recent = [];
    } else {
      recent.push(line);
    }
  }
  return out;
}

// ② 평단가 화면(시세 탭): [{name, y, avg, usd}]
// 시세 뷰 구조: [이름줄: 종목명+현재가(%없음)] → [평단가줄: 평단가+일간등락%(%있음)]
function parsePriceView(text) {
  const lines = _bodyLines(text);
  const out = [];
  let pending = null;
  for (const line of lines) {
    const hasPct = /[+\-]?[\d.,]+\s*%/.test(line);
    if (hasPct && pending) {
      // 평단가줄: $금액 또는 큰 숫자
      const usdM = line.match(/\$\s*([\d.,]+)/);
      let avg = null, usd = false;
      if (usdM) { avg = parseFloat(usdM[1].replace(/,/g, '')); usd = true; }
      else {
        const m = line.match(/([\d][\d,]{2,})/);
        if (m) avg = parseInt(m[1].replace(/,/g, ''), 10);
      }
      if (avg != null && avg > 0) { out.push({ name: pending.name, y: pending.y, avg, usd }); pending = null; }
    } else if (!hasPct) {
      // 이름줄 후보
      const nm = _lineName(line);
      if (nm.matched && /\d/.test(line)) pending = nm;
    }
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { parseTossEval, parseSharesView, parsePriceView, normalizeName };
if (typeof window !== 'undefined') { window.parseTossEval = parseTossEval; window.parseSharesView = parseSharesView; window.parsePriceView = parsePriceView; }
