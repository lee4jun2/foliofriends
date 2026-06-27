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

// 흔한 종목명 → 표준명/야후심볼 보정 (한글 OCR 깨짐 대응).
const TICKER_MAP = [
  [/하이닉스|sk하/i, { name: 'SK하이닉스', y: '000660.KS' }],
  [/삼성전자/i, { name: '삼성전자', y: '005930.KS' }],
  [/현대차|혀.?자|현대자/i, { name: '현대차', y: '005380.KS' }],
  [/^nvda|nvidia/i, { name: 'NVIDIA', y: 'NVDA' }],
  [/^tsla|tesla/i, { name: 'Tesla', y: 'TSLA' }],
  [/^aapl|apple/i, { name: 'Apple', y: 'AAPL' }],
  [/googl|구글/i, { name: 'Alphabet(GOOGL)', y: 'GOOGL' }],
  [/kodex\s*200/i, { name: 'KODEX 200', y: '069500.KS' }],
  [/반도체.*top\s*10|반도체.*10810|반도체.*0010/i, { name: 'TIGER 반도체TOP10', y: '396500.KS' }],
  [/나스닥\s*100|미국나스닥/i, { name: 'ACE 미국나스닥100', y: '367380.KS' }],
  [/s\s*&?\s*p\s*500|미국s.?p/i, { name: 'TIGER 미국S&P500', y: '360750.KS' }],
  [/원자력/i, { name: 'HANARO 원자력iSelect', y: null }],
  [/우주|항공우주/i, { name: 'TIGER 미국우주테크', y: null }],
  [/mmf|종류형/i, { name: '삼성신종MMF', y: null }],
];

function normalizeName(raw) {
  let name = (raw || '').replace(/\s+/g, ' ').trim();
  for (const [re, info] of TICKER_MAP) {
    if (re.test(name)) return { name: info.name, y: info.y, matched: true };
  }
  // 매칭 실패 시 OCR 원문을 그대로 두되 앞쪽 잡기호만 정리.
  name = name.replace(/^[^A-Za-z가-힣]+/, '').trim();
  return { name: name || raw, y: null, matched: false };
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
