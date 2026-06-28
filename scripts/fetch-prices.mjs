// Yahoo Finance(비공식, 키 불필요)에서 시세를 받아 prices.json 으로 저장한다.
// GitHub Action(크론)에서 서버사이드로 실행되므로 CORS 문제가 없다.
//
// 사용: node scripts/fetch-prices.mjs
// 입력: symbols.json  (["AAPL","005930.KS", ...])
// 출력: prices.json   ({ "AAPL": {price, prevClose, currency, time}, ... })

import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('..', import.meta.url);
const symbolsUrl = new URL('symbols.json', ROOT);
const outUrl = new URL('prices.json', ROOT);

async function fetchQuote(symbol) {
  // 가벼운 현재가 캐시: 현재가/전일종가/통화 + 홈·랭킹 스파크라인용 최근 ~24 거래일만.
  // (1년치 차트 데이터는 저장하지 않고, 앱이 종목 상세를 열 때 프록시로 동적 fetch)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta || meta.regularMarketPrice == null) throw new Error(`${symbol}: no price`);
  const price = meta.regularMarketPrice;
  let closes = (result?.indicators?.quote?.[0]?.close || []).filter((v) => v != null);
  closes = closes.slice(-24).map((v) => Math.round(v * 100) / 100);
  // 전일종가(일간 변동용) = 직전 거래일 종가. meta.chartPreviousClose 는 "차트 범위 시작 전"
  // 값(=약 1개월 전)이라 일간 계산에 쓰면 안 된다. 일봉 시계열의 마지막 직전값을 쓴다.
  const prevClose =
    meta.previousClose ?? meta.regularMarketPreviousClose ??
    (closes.length >= 2 ? closes[closes.length - 2] : (meta.chartPreviousClose ?? price));
  return { price, prevClose, currency: meta.currency || null, closes };
}

// 한국 코드의 거래소 접미사 반대쪽(.KS↔.KQ). Gemini가 .KS로 줬는데 실제 코스닥이면 .KQ로 폴백.
function altKoreanSymbol(sym) {
  const m = /^(\d{6})\.(KS|KQ)$/i.exec(sym);
  if (!m) return null;
  return m[1] + '.' + (m[2].toUpperCase() === 'KS' ? 'KQ' : 'KS');
}

// 심볼 1개의 시세를 받되, 한국 코드면 .KS↔.KQ 폴백까지 시도한다.
async function fetchQuoteWithFallback(sym) {
  try { return await fetchQuote(sym); }
  catch (e1) {
    const alt = altKoreanSymbol(sym);
    if (!alt) throw e1;
    const q = await fetchQuote(alt); // 반대 접미사로 성공
    return q; // 저장은 호출부에서 원래 sym 키로 → 앱이 그대로 찾음
  }
}

const DB_URL = 'https://foliofriends-3770e-default-rtdb.firebaseio.com';

// 사용자들이 보유 중인 종목 심볼을 RTDB(/symbols, 공개읽기)에서 모은다.
async function dynamicSymbols() {
  try {
    const res = await fetch(`${DB_URL}/symbols.json`);
    if (!res.ok) return [];
    const obj = await res.json();
    return obj ? Object.values(obj).filter((s) => typeof s === 'string') : [];
  } catch (e) {
    return [];
  }
}

async function main() {
  const seed = JSON.parse(await readFile(symbolsUrl, 'utf8'));
  const dyn = await dynamicSymbols();
  const symbols = [...new Set([...seed, ...dyn, 'KRW=X'])];
  console.log(`symbols: ${seed.length} seed + ${dyn.length} dynamic = ${symbols.length} total`);
  const out = {};
  const nowIso = new Date().toISOString();
  for (const sym of symbols) {
    try {
      const q = await fetchQuoteWithFallback(sym);
      out[sym] = { ...q, time: nowIso }; // 원래 요청 심볼 키로 저장(앱이 그 키로 조회)
      console.log(`✓ ${sym}: ${q.price} ${q.currency} (prev ${q.prevClose})`);
    } catch (e) {
      console.error(`✗ ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 200)); // 과도한 호출 방지
  }
  const payload = { updated: nowIso, quotes: out };
  await writeFile(outUrl, JSON.stringify(payload, null, 2) + '\n');
  console.log(`\nwrote prices.json (${Object.keys(out).length}/${symbols.length} symbols)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
