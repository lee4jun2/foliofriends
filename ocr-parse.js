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
  if (a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a))) return 0.92;
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

if (typeof module !== 'undefined' && module.exports) module.exports = { parseTossEval, normalizeName };
if (typeof window !== 'undefined') { window.parseTossEval = parseTossEval; }
