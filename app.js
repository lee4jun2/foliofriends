'use strict';

/* ===================== Design tokens ===================== */
const C = {
  bg: '#F2F4F6', card: '#FFFFFF', t1: '#191F28', t2: '#6B7684', t3: '#8B95A1',
  t4: '#B0B8C1', line: '#F1F3F5', brand: '#3182F6', up: '#F04452', down: '#3182F6',
  tint: '#EAF2FE',
};
const KRW = 1380;

/* ===================== Data ===================== */
// 실시간 시세 (prices.json 에서 채워짐): { yahooSymbol: {price, prevClose, currency, time} }
let LIVE = {};
let LIVE_UPDATED = null;

// 데모 시드 (사용자가 스크린샷으로 가져오기 전 기본).
const SEED_RAW = [
  { id: 'aapl', name: 'Apple', ticker: 'AAPL', y: 'AAPL', mkt: 'US', color: '#4C6EF5', shares: 30, avg: 240, cur: 283, day: 1.1, ccy: '$' },
  { id: 'nvda', name: 'NVIDIA', ticker: 'NVDA', y: 'NVDA', mkt: 'US', color: '#15AABF', shares: 45, avg: 150, cur: 192, day: 3.2, ccy: '$' },
  { id: 'tsla', name: 'Tesla', ticker: 'TSLA', y: 'TSLA', mkt: 'US', color: '#FF8787', shares: 18, avg: 410, cur: 379, day: -0.8, ccy: '$' },
  { id: 'sse', name: '삼성전자', ticker: '005930', y: '005930.KS', mkt: 'KR', color: '#20C997', shares: 35, avg: 290000, cur: 339500, day: 0.9, ccy: '₩' },
  { id: 'skh', name: 'SK하이닉스', ticker: '000660', y: '000660.KS', mkt: 'KR', color: '#FAB005', shares: 4, avg: 2200000, cur: 2673000, day: 2.4, ccy: '₩' },
  { id: 'nav', name: 'NAVER', ticker: '035420', y: '035420.KS', mkt: 'KR', color: '#9775FA', shares: 45, avg: 210000, cur: 196400, day: -1.2, ccy: '₩' },
];

const STORE_KEY = 'ff_holdings_v1';
let _holdingsCache = null;  // 로그인 시 해당 uid의 보유내역(Firebase에서 로드)
let _holdingsUid = null;
function loggedInUid() { return (window.DB && window.DB.enabled && window.DB.me) ? window.DB.me : null; }

function loadUserHoldings() {
  const uid = loggedInUid();
  if (uid) return (_holdingsUid === uid) ? _holdingsCache : null; // 계정별 격리 — 다른 계정/로컬 데이터 노출 방지
  try { const v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); return (v && v.length) ? v : null; } catch (e) { return null; }
}
function saveUserHoldings(h) {
  const uid = loggedInUid();
  if (uid) { _holdingsCache = h; _holdingsUid = uid; if (window.DB) window.DB.saveHoldings(h); }
  else { localStorage.setItem(STORE_KEY, JSON.stringify(h)); }
  _port = null;
}
function clearUserHoldings() {
  const uid = loggedInUid();
  if (uid) { _holdingsCache = null; _holdingsUid = uid; if (window.DB) window.DB.saveHoldings([]); }
  else { localStorage.removeItem(STORE_KEY); }
  _port = null;
}

let _port = null;
function buildPortfolio() {
  if (_port) return _port;
  const user = loadUserHoldings();
  // 로그인 상태에선 데모 시드를 쓰지 않음 (연동 전엔 빈 포트폴리오 → 온보딩이 가림)
  const base = user || (loggedInUid() ? [] : SEED_RAW);
  const raw = base.map(h => ({ ...h }));
  const fx = (LIVE['KRW=X'] && LIVE['KRW=X'].price) || 1380; // USD→KRW 환율(라이브)
  // 실시간 시세가 있으면 현재가/일간등락을 덮어쓴다.
  raw.forEach(s => {
    const q = s.y && LIVE[s.y];
    if (q && q.price) {
      s.cur = q.price; // 현지 통화 그대로 (미국=USD, 한국=KRW)
      s.live = true;
      if (q.prevClose) s.day = (q.price - q.prevClose) / q.prevClose * 100;
    }
  });
  let total = 0, cost = 0, dayPnl = 0;
  raw.forEach(s => {
    const m = s.ccy === '$' ? fx : 1; // 달러 종목은 라이브 환율로 원화 환산
    s.val = s.shares * s.cur * m;
    s.cost = s.shares * s.avg * m;
    s.pnl = s.val - s.cost;
    s.ret = (s.cur - s.avg) / s.avg * 100;
    s.dayPnl = s.val * s.day / 100;
    total += s.val; cost += s.cost; dayPnl += s.dayPnl;
  });
  raw.forEach(s => s.weight = s.val / total * 100);
  raw.sort((a, b) => b.weight - a.weight);
  _port = { holdings: raw, total, cost, pnl: total - cost, ret: cost ? (total - cost) / cost * 100 : 0, dayPnl, dayPct: total ? dayPnl / total * 100 : 0 };
  return _port;
}

function friends() {
  return [
    { id: 'f1', name: '김재현', short: '재현', color: '#4C6EF5', ret: 42.3, time: '2시간 전', likes: 24, comments: 8,
      hold: [{ n: 'NVIDIA', w: 35, r: 75.5 }, { n: 'TSLA', w: 22, r: 21.6 }, { n: '삼성전자', w: 18, r: 16.5 }, { n: 'AMD', w: 15, r: 33.0 }, { n: 'SK하이닉스', w: 10, r: 30.6 }] },
    { id: 'f2', name: '이수민', short: '수민', color: '#15AABF', ret: 31.8, time: '5시간 전', likes: 18, comments: 5,
      hold: [{ n: 'Apple', w: 30, r: 28.6 }, { n: 'Microsoft', w: 25, r: 19.0 }, { n: '삼성전자', w: 20, r: 16.5 }, { n: 'NAVER', w: 15, r: -10.5 }, { n: '카카오', w: 10, r: -5.0 }] },
    { id: 'f4', name: '정유진', short: '유진', color: '#20C997', ret: 18.5, time: '어제', likes: 11, comments: 3,
      hold: [{ n: '삼성전자', w: 40, r: 16.5 }, { n: '현대차', w: 25, r: 12.0 }, { n: 'KB금융', w: 20, r: 9.5 }, { n: 'Apple', w: 15, r: 28.6 }] },
    { id: 'f5', name: '최민서', short: '민서', color: '#FAB005', ret: 12.1, time: '2일 전', likes: 7, comments: 2,
      hold: [{ n: 'S&P500 ETF', w: 50, r: 14.0 }, { n: '삼성전자', w: 30, r: 16.5 }, { n: 'TIGER나스닥', w: 20, r: 11.0 }] },
    { id: 'f6', name: '강태형', short: '태형', color: '#FF8787', ret: -3.4, time: '3일 전', likes: 4, comments: 6,
      hold: [{ n: '카카오', w: 35, r: -12.0 }, { n: 'NAVER', w: 30, r: -10.5 }, { n: '엔씨소프트', w: 20, r: -8.0 }, { n: '펄어비스', w: 15, r: 5.0 }] },
  ];
}

/* ===================== State ===================== */
let state = { tab: 'assets', view: 'home', param: null, hist: [], hide: false, sortKey: 'value', sortDir: 'desc' };
function upd(patch) { state = { ...state, ...patch }; render(); }
function goTab(tab) { upd({ tab, view: tab === 'assets' ? 'home' : tab, param: null, hist: [] }); }
function push(view, param) { upd({ view, param, hist: [...state.hist, { view: state.view, param: state.param }] }); }
function back() { const h = [...state.hist]; const last = h.pop() || { view: 'home', param: null }; upd({ view: last.view, param: last.param, hist: h }); }
function toggleHide() { upd({ hide: !state.hide }); }
function setSort(key) {
  if ((state.sortKey || 'value') === key) upd({ sortDir: (state.sortDir || 'desc') === 'desc' ? 'asc' : 'desc' });
  else upd({ sortKey: key, sortDir: 'desc' });
}
function sortBy(port) {
  const m = { value: 'val', pnl: 'pnl', ret: 'ret', dayPnl: 'dayPnl', day: 'day' };
  const f = m[state.sortKey || 'value']; const dir = (state.sortDir || 'desc') === 'desc' ? -1 : 1;
  return [...port.holdings].sort((a, b) => (a[f] - b[f]) * dir);
}

/* ===================== Formatting ===================== */
const won = (n, hide) => hide ? '••••••' : '₩' + Math.round(n).toLocaleString('ko-KR');
const swon = (n, hide) => hide ? '••••' : (n < 0 ? '-' : '+') + '₩' + Math.abs(Math.round(n)).toLocaleString('ko-KR');
const pct = n => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
const cc = n => n >= 0 ? C.up : C.down;
const price = s => s.ccy === '$' ? '$' + s.cur.toFixed(2) : s.cur.toLocaleString('ko-KR') + '원';

// "실시간 시세 · HH:MM 기준" 표시 (라이브 데이터 있을 때만).
function liveStamp() {
  if (!LIVE_UPDATED) return null;
  const d = new Date(LIVE_UPDATED);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return row({ gap: 5, marginTop: 12 },
    el('div', { style: { width: 6, height: 6, borderRadius: 3, background: '#22C55E' } }),
    txt('실시간 시세 · ' + hh + ':' + mm + ' 기준', { fontSize: 11.5, fontWeight: 600, color: C.t3 }));
}

/* ===================== DOM helpers ===================== */
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'ellipse', 'line', 'rect', 'polygon', 'defs', 'linearGradient', 'stop', 'g']);
const UNITLESS = new Set(['fontWeight', 'flex', 'flexGrow', 'flexShrink', 'opacity', 'zIndex', 'lineHeight', 'order', 'strokeWidth']);

function el(tag, props, ...kids) {
  const node = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  props = props || {};
  for (const k in props) {
    const v = props[k];
    if (v == null) continue;
    if (k === 'style' && typeof v === 'object') {
      for (const sk in v) {
        let sv = v[sk];
        const prop = sk.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
        if (typeof sv === 'number' && !UNITLESS.has(sk)) sv = sv + 'px';
        node.style.setProperty(prop, sv);
      }
    } else if (k === 'onClick') {
      node.addEventListener('click', v);
      node.style.cursor = 'pointer';
    } else if (k === 'class') {
      node.setAttribute('class', v);
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}
const col = (s, ...c) => el('div', { style: { display: 'flex', flexDirection: 'column', ...s } }, ...c);
const row = (s, ...c) => el('div', { style: { display: 'flex', alignItems: 'center', ...s } }, ...c);
const txt = (v, s) => el('span', { style: s }, v);
const clk = (onClick, s, ...c) => el('div', { onClick, style: { cursor: 'pointer', ...s } }, ...c);

/* ===================== Icons ===================== */
function icon(name, size = 24, color = C.t1, sw = 2) {
  const kids = [];
  const p = (d, i) => el('path', { key: i, d });
  if (name === 'eye') { kids.push(el('ellipse', { cx: 12, cy: 12, rx: 11, ry: 7 }), el('circle', { cx: 12, cy: 12, r: 3 })); }
  else if (name === 'eyeoff') { kids.push(el('ellipse', { cx: 12, cy: 12, rx: 11, ry: 7 }), el('circle', { cx: 12, cy: 12, r: 3 }), el('line', { x1: 3, y1: 3, x2: 21, y2: 21 })); }
  else if (name === 'chev') { kids.push(p('M9 18l6-6-6-6')); }
  else if (name === 'back') { kids.push(p('M19 12H5'), p('M12 19l-7-7 7-7')); }
  else if (name === 'lock') { kids.push(el('rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }), p('M8 11V7a4 4 0 0 1 8 0v4')); }
  else if (name === 'share') { kids.push(el('circle', { cx: 18, cy: 5, r: 3 }), el('circle', { cx: 6, cy: 12, r: 3 }), el('circle', { cx: 18, cy: 19, r: 3 }), el('line', { x1: 8.6, y1: 13.5, x2: 15.4, y2: 17.5 }), el('line', { x1: 15.4, y1: 6.5, x2: 8.6, y2: 10.5 })); }
  else if (name === 'bars') { kids.push(el('line', { x1: 6, y1: 20, x2: 6, y2: 14 }), el('line', { x1: 12, y1: 20, x2: 12, y2: 9 }), el('line', { x1: 18, y1: 20, x2: 18, y2: 4 })); }
  else if (name === 'users') { kids.push(p('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'), el('circle', { cx: 9, cy: 7, r: 4 }), p('M23 21v-2a4 4 0 0 0-3-3.9'), p('M16 3.1a4 4 0 0 1 0 7.8')); }
  else if (name === 'award') { kids.push(el('circle', { cx: 12, cy: 8, r: 6 }), p('M8.2 13.3 7 22l5-3 5 3-1.2-8.7')); }
  else if (name === 'heart') { kids.push(p('M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z')); }
  else if (name === 'msg') { kids.push(p('M21 11.5a8.4 8.4 0 0 1-11.9 7.6L3 21l1.9-6.1A8.4 8.4 0 1 1 21 11.5z')); }
  else if (name === 'star') { kids.push(el('polygon', { points: '12 2 15 8.6 22 9.4 17 14.2 18.3 21.2 12 17.8 5.7 21.2 7 14.2 2 9.4 9 8.6' })); }
  return el('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ...kids);
}

/* ===================== Charts ===================== */
function donut(segs, size, stroke, center) {
  const r = (size - stroke) / 2; const circ = 2 * Math.PI * r; let off = 0;
  const arcs = segs.map(s => {
    const len = circ * s.w / 100;
    const c = el('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: s.color, 'stroke-width': stroke, 'stroke-dasharray': len + ' ' + (circ - len), 'stroke-dashoffset': -off, transform: 'rotate(-90 ' + (size / 2) + ' ' + (size / 2) + ')' });
    off += len; return c;
  });
  const svg = el('svg', { width: size, height: size }, el('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: C.line, 'stroke-width': stroke }), ...arcs);
  const wrap = el('div', { style: { position: 'relative', width: size, height: size } }, svg);
  if (center) wrap.append(el('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } }, center));
  return wrap;
}

function stackBar(segs, height, radius) {
  return el('div', { style: { display: 'flex', width: '100%', height, borderRadius: radius || height / 2, overflow: 'hidden', gap: '2px', background: C.line } },
    ...segs.map(s => el('div', { style: { width: s.w + '%', background: s.color } })));
}

function spark(seed, up, w, ht, color) {
  const n = 44; let v = 50, r = seed; const pts = [];
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  for (let i = 0; i < n; i++) { v += (rnd() - 0.5) * 7 + (up ? 0.75 : -0.6); v = Math.max(12, Math.min(88, v)); pts.push(v); }
  const X = i => (i / (n - 1)) * w; const Y = val => ht - 8 - (val / 100) * (ht - 16);
  let line = '';
  pts.forEach((pv, i) => { line += (i === 0 ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(pv).toFixed(1) + ' '; });
  const area = line + 'L' + w + ' ' + ht + ' L0 ' + ht + ' Z';
  const gid = 'g' + Math.round(seed);
  return el('svg', { width: w, height: ht, viewBox: '0 0 ' + w + ' ' + ht, style: { width: '100%', height: ht } },
    el('defs', null, el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
      el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.18 }),
      el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }))),
    el('path', { d: area, fill: 'url(#' + gid + ')' }),
    el('path', { d: line, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}

/* ===================== Pieces ===================== */
const avatar = (short, color, size) => row({ justifyContent: 'center', width: size, height: size, borderRadius: size / 2, background: color, color: '#fff', fontSize: size * 0.38, fontWeight: 700, flex: 'none' }, txt(short));
const logo = (s, size) => row({ justifyContent: 'center', width: size, height: size, borderRadius: size * 0.28, background: s.color + '1A', color: s.color, fontSize: size * 0.38, fontWeight: 800, flex: 'none' }, txt(s.ccy === '$' ? s.ticker[0] : s.name[0]));
const sectionTitle = t => txt(t, { fontSize: 15, fontWeight: 800, color: C.t1 });
const divider = () => el('div', { style: { height: 1, background: C.line, margin: '4px 0' } });
const pill = (label, value, color) => row({ gap: 6, background: color + '14', padding: '7px 12px', borderRadius: 10 },
  txt(label, { fontSize: 12, fontWeight: 600, color: C.t3 }), txt(value, { fontSize: 13, fontWeight: 700, color }));
const eyeBtn = () => clk(toggleHide, { width: 36, height: 36, borderRadius: 18, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }, icon(state.hide ? 'eyeoff' : 'eye', 19, C.t2, 1.8));
const iconBtn = (ic, onClick) => clk(onClick || (() => {}), { width: 36, height: 36, borderRadius: 18, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }, icon(ic, 18, C.t2, 1.8));

function valBlock(label, amount, p, color) {
  return col({ flex: 1, background: C.bg, borderRadius: 10, padding: '8px 11px', gap: 4, minWidth: 0 },
    txt(label, { fontSize: 11, fontWeight: 600, color: C.t3 }),
    row({ gap: 6, alignItems: 'baseline' },
      txt(amount, { fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }),
      txt(p, { fontSize: 11.5, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' })));
}

function holdingRow(s, opts) {
  opts = opts || {};
  return clk(() => push('stock', s.id), { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0' },
    logo(s, 42),
    col({ flex: 1, gap: 2, minWidth: 0 },
      txt(s.name, { fontSize: 15, fontWeight: 700, color: C.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
      row({ gap: 6 },
        txt(s.shares + '주', { fontSize: 12.5, color: C.t3, fontWeight: 500 }),
        txt('·', { fontSize: 12, color: C.t4 }),
        txt(s.mkt, { fontSize: 11, fontWeight: 700, color: C.t4 }))),
    col({ alignItems: 'flex-end', gap: 2 },
      txt(opts.weight ? s.weight.toFixed(1) + '%' : won(s.val, state.hide), { fontSize: 15, fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums' }),
      txt(pct(s.ret), { fontSize: 13, fontWeight: 600, color: cc(s.ret), fontVariantNumeric: 'tabular-nums' })));
}

function holdingRowB(s, last) {
  return clk(() => push('stock', s.id),
    { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: last ? 'none' : '1px solid ' + C.line },
    logo(s, 40),
    col({ flex: 1, gap: 3, minWidth: 0 },
      txt(s.name, { fontSize: 15, fontWeight: 700, color: C.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
      row({ gap: 6 },
        txt(s.shares + '주', { fontSize: 12, color: C.t3, fontWeight: 500 }),
        txt('·', { fontSize: 11, color: C.t4 }),
        txt('비중 ' + s.weight.toFixed(1) + '%', { fontSize: 12, color: C.t3, fontWeight: 500 }))),
    col({ alignItems: 'flex-end', gap: 3, flex: 'none' },
      txt(won(s.val, state.hide), { fontSize: 15, fontWeight: 800, color: C.t1, fontVariantNumeric: 'tabular-nums' }),
      row({ gap: 6, alignItems: 'baseline' },
        txt(pct(s.ret), { fontSize: 13, fontWeight: 700, color: cc(s.ret), fontVariantNumeric: 'tabular-nums' }),
        txt('오늘 ' + pct(s.day), { fontSize: 11.5, fontWeight: 600, color: cc(s.day), fontVariantNumeric: 'tabular-nums' }))));
}

/* ===================== Screens ===================== */
function homeB(port) {
  const segs = port.holdings.map(s => ({ w: s.weight, color: s.color }));
  const sorted = sortBy(port);
  const chips = [['value', '평가액'], ['pnl', '총수익'], ['ret', '총수익률'], ['dayPnl', '일간수익'], ['day', '일간수익률']];
  return col({ padding: '10px 20px 28px', background: C.card, minHeight: '100%' },
    row({ justifyContent: 'space-between', padding: '2px 0 18px' },
      txt('내 자산', { fontSize: 18, fontWeight: 800, color: C.t1, whiteSpace: 'nowrap' }),
      row({ gap: 8 }, eyeBtn(), iconBtn('share', () => goTab('feed')), profileBtn())),
    (window.DB && window.DB.isAdmin && ADMIN.pending.length)
      ? clk(() => push('admin'), { display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px', padding: '12px 14px', borderRadius: 12, background: '#FFF1F0' },
          icon('lock', 16, C.up, 1.8),
          txt('가입 승인 대기 ' + ADMIN.pending.length + '명', { fontSize: 13.5, fontWeight: 700, color: C.t1 }),
          el('div', { style: { flex: 1 } }), icon('chev', 16, C.up, 2))
      : null,
    txt('총 자산', { fontSize: 13, fontWeight: 600, color: C.t3, marginBottom: 8 }),
    txt(won(port.total, state.hide), { fontSize: 34, fontWeight: 800, color: C.t1, letterSpacing: -0.8, fontVariantNumeric: 'tabular-nums' }),
    row({ gap: 8, marginTop: 14 },
      pill('오늘', pct(port.dayPct), cc(port.dayPct)),
      pill('총 수익', pct(port.ret), cc(port.ret))),
    liveStamp() || el('div', { style: { height: 4 } }),
    el('div', { style: { height: 14 } }),
    divider(),
    row({ padding: '14px 0', alignItems: 'stretch' },
      col({ flex: 1, gap: 6, minWidth: 0 },
        txt('오늘 수익', { fontSize: 13, fontWeight: 600, color: C.t3 }),
        txt(swon(port.dayPnl, state.hide), { fontSize: 17, fontWeight: 800, color: cc(port.dayPct), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' })),
      el('div', { style: { width: 1, background: C.line, margin: '2px 16px' } }),
      col({ flex: 1, gap: 6, minWidth: 0 },
        txt('총 평가손익', { fontSize: 13, fontWeight: 600, color: C.t3 }),
        txt(swon(port.pnl, state.hide), { fontSize: 17, fontWeight: 800, color: cc(port.ret), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }))),
    divider(),
    col({ padding: '16px 0' },
      sectionTitle('자산 비중'),
      el('div', { style: { height: 14 } }),
      stackBar(segs, 12, 6),
      col({ marginTop: 16, gap: 11 }, ...port.holdings.map(s =>
        row({ justifyContent: 'space-between' },
          row({ gap: 8, minWidth: 0 },
            el('div', { style: { width: 9, height: 9, borderRadius: 3, background: s.color, flex: 'none' } }),
            txt(s.name, { fontSize: 14, fontWeight: 600, color: C.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' })),
          txt(s.weight.toFixed(1) + '%', { fontSize: 14, fontWeight: 700, color: C.t2, fontVariantNumeric: 'tabular-nums', flex: 'none' }))))),
    el('div', { style: { height: 8, background: C.bg, margin: '4px -20px 0' } }),
    clk(() => push('import'), { display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 0', padding: '13px 14px', borderRadius: 12, background: C.tint },
      icon('share', 18, C.brand, 1.8),
      col({ flex: 1, gap: 1 },
        txt('스크린샷으로 내 종목 가져오기', { fontSize: 13.5, fontWeight: 700, color: C.t1 }),
        txt('증권 앱 화면을 올리면 자동으로 채워져요', { fontSize: 11.5, fontWeight: 500, color: C.t3 })),
      icon('chev', 16, C.brand, 2)),
    col({ padding: '18px 0 0' },
      txt('보유 종목 ' + port.holdings.length, { fontSize: 15, fontWeight: 800, color: C.t1, marginBottom: 12 }),
      row({ gap: 7, flexWrap: 'wrap', marginBottom: 2 },
        ...chips.map(([key, label]) => {
          const on = (state.sortKey || 'value') === key;
          const arrow = on ? ((state.sortDir || 'desc') === 'desc' ? ' ↓' : ' ↑') : '';
          return clk(() => setSort(key), { display: 'flex', alignItems: 'center', background: on ? C.t1 : C.bg, padding: '6px 11px', borderRadius: 9 },
            txt(label + arrow, { fontSize: 12, fontWeight: 700, color: on ? '#fff' : C.t2, whiteSpace: 'nowrap' }));
        })),
      col({ marginTop: 4 }, ...sorted.map((s, k) => holdingRowB(s, k === sorted.length - 1)))));
}

function holdingsScreen(port) {
  return col({ padding: '4px 20px 28px' },
    col({ gap: 6, padding: '14px 2px 16px' },
      txt('총 평가금액', { fontSize: 13, fontWeight: 600, color: C.t3 }),
      txt(won(port.total, state.hide), { fontSize: 26, fontWeight: 800, color: C.t1, fontVariantNumeric: 'tabular-nums' }),
      row({ gap: 6 }, txt('평가손익', { fontSize: 13, color: C.t3, fontWeight: 500 }),
        txt(swon(port.pnl, state.hide) + ' (' + pct(port.ret) + ')', { fontSize: 13.5, fontWeight: 700, color: cc(port.ret) }))),
    col({ borderTop: '1px solid ' + C.line },
      ...port.holdings.map(s => el('div', { style: { borderBottom: '1px solid ' + C.line } }, holdingRow(s, {})))));
}

// 실제 일봉 종가 시계열로 라인+영역 차트
function realChart(closes, w, h, color) {
  const min = Math.min(...closes), max = Math.max(...closes);
  const range = (max - min) || 1;
  const n = closes.length;
  const X = (i) => (i / (n - 1)) * w;
  const Y = (v) => h - 8 - ((v - min) / range) * (h - 16);
  let line = '';
  closes.forEach((v, i) => { line += (i === 0 ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1) + ' '; });
  const area = line + 'L' + w + ' ' + h + ' L0 ' + h + ' Z';
  const gid = 'rc' + Math.round(min) + n;
  return el('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, style: { width: '100%', height: h } },
    el('defs', null, el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 },
      el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.18 }),
      el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }))),
    el('path', { d: area, fill: 'url(#' + gid + ')' }),
    el('path', { d: line, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}
const CHART_PERIODS = { '1주': 5, '2주': 10, '1개월': 24 };
let CHART_PERIOD = '1개월';

function stockScreen(port) {
  const s = port.holdings.find(x => x.id === state.param) || port.holdings[0];
  const live = LIVE[s.y];
  const allCloses = (live && live.closes) || [];
  const periods = Object.keys(CHART_PERIODS);
  const closes = allCloses.slice(-CHART_PERIODS[CHART_PERIOD]);
  const trendColor = closes.length > 1 ? (closes[closes.length - 1] >= closes[0] ? C.up : C.down) : cc(s.ret);
  const rows = [
    ['보유 수량', s.shares + '주'],
    ['평균 단가', s.ccy === '$' ? '$' + s.avg.toFixed(2) : s.avg.toLocaleString('ko-KR') + '원'],
    ['평가 금액', won(s.val, state.hide)],
    ['포트폴리오 비중', s.weight.toFixed(1) + '%'],
  ];
  return col({ padding: '0 0 28px' },
    col({ padding: '14px 20px 6px' },
      row({ gap: 8, marginBottom: 6 }, logo(s, 28), txt(s.mkt + ' · ' + s.ticker, { fontSize: 13, fontWeight: 600, color: C.t3 })),
      txt(s.name, { fontSize: 22, fontWeight: 800, color: C.t1 }),
      row({ gap: 10, alignItems: 'baseline', marginTop: 8 },
        txt(price(s), { fontSize: 28, fontWeight: 800, color: C.t1, fontVariantNumeric: 'tabular-nums' }),
        txt(pct(s.day) + ' 오늘', { fontSize: 15, fontWeight: 700, color: cc(s.day) }))),
    el('div', { style: { padding: '10px 20px 0' } },
      closes.length > 1
        ? realChart(closes, 334, 150, trendColor)
        : col({ justifyContent: 'center', alignItems: 'center', height: 150 }, txt('시세 데이터 수집 중이에요', { fontSize: 13, fontWeight: 500, color: C.t4 }), txt('(최대 15분 내 표시)', { fontSize: 11.5, color: C.t4, marginTop: 4 }))),
    closes.length > 1
      ? row({ gap: 6, padding: '8px 20px 18px', justifyContent: 'space-between' },
          ...periods.map(pr => clk(() => { CHART_PERIOD = pr; render(); }, { display: 'flex', justifyContent: 'center', flex: 1, padding: '6px 0', borderRadius: 8, background: pr === CHART_PERIOD ? C.t1 : 'transparent' },
            txt(pr, { fontSize: 12.5, fontWeight: 700, color: pr === CHART_PERIOD ? '#fff' : C.t3 }))))
      : el('div', { style: { height: 18 } }),
    col({ margin: '0 20px', background: C.bg, borderRadius: 16, padding: 18 },
      txt('내 보유 현황', { fontSize: 15, fontWeight: 800, color: C.t1, marginBottom: 14 }),
      ...rows.map((rw, k) => row({ justifyContent: 'space-between', padding: '9px 0', borderBottom: k < 3 ? '1px solid ' + C.line : 'none' },
        txt(rw[0], { fontSize: 14, fontWeight: 500, color: C.t3 }),
        txt(rw[1], { fontSize: 14.5, fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums' }))),
      row({ justifyContent: 'space-between', padding: '12px 0 2px', marginTop: 6, borderTop: '2px solid ' + C.line },
        txt('평가 손익', { fontSize: 14, fontWeight: 700, color: C.t1 }),
        txt(swon(s.pnl, state.hide) + ' (' + pct(s.ret) + ')', { fontSize: 15, fontWeight: 800, color: cc(s.ret), fontVariantNumeric: 'tabular-nums' }))));
}

function feedScreen() {
  const fr = feedFriends();
  const community = useCommunity();
  return col({ padding: '4px 16px 28px', gap: 14 },
    row({ padding: '14px 4px 6px', justifyContent: 'space-between', alignItems: 'flex-end' },
      col({ gap: 4 },
        txt('친구 피드', { fontSize: 22, fontWeight: 800, color: C.t1 }),
        txt(community ? '팔로우한 친구들의 포트폴리오' : '친구들이 공유한 포트폴리오를 둘러보세요', { fontSize: 13, fontWeight: 500, color: C.t3 })),
      community ? clk(() => push('invite'), { display: 'flex', alignItems: 'center', gap: 4, background: C.tint, padding: '8px 12px', borderRadius: 10 },
        icon('users', 16, C.brand, 1.8), txt('친구 초대', { fontSize: 12.5, fontWeight: 700, color: C.brand })) : null),
    (community && !fr.length)
      ? col({ alignItems: 'center', gap: 10, padding: '50px 20px' },
          txt('아직 친구가 없어요', { fontSize: 15, fontWeight: 700, color: C.t2 }),
          txt('초대 링크를 보내 친구를 맺으면\n서로의 포트폴리오를 비중·수익률로 볼 수 있어요', { fontSize: 13, fontWeight: 500, color: C.t3, whiteSpace: 'pre-line', textAlign: 'center' }),
          clk(() => push('invite'), { marginTop: 8, padding: '12px 22px', borderRadius: 11, background: C.brand }, txt('친구 초대하기', { fontSize: 14, fontWeight: 700, color: '#fff' })))
      : null,
    ...fr.map(f => {
      const top = f.hold.slice(0, 3);
      const segs = f.hold.map((x, idx) => ({ w: x.w, color: ['#4C6EF5', '#15AABF', '#FAB005', '#9775FA', '#FF8787'][idx % 5] }));
      return col({ background: C.card, border: '1px solid ' + C.line, borderRadius: 18, padding: 16, gap: 13, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' },
        row({ gap: 11 },
          avatar(f.short, f.color, 42),
          col({ flex: 1, gap: 2 },
            txt(f.name, { fontSize: 15, fontWeight: 700, color: C.t1 }),
            txt(f.time + ' · 포트폴리오 공유', { fontSize: 12.5, fontWeight: 500, color: C.t3 })),
          row({ gap: 5, background: cc(f.ret) + '14', padding: '6px 11px', borderRadius: 10 },
            txt(pct(f.ret), { fontSize: 14, fontWeight: 800, color: cc(f.ret) }))),
        col({ gap: 9 },
          stackBar(segs, 9, 5),
          row({ gap: 12, flexWrap: 'wrap' }, ...top.map((x, idx) => row({ gap: 5 },
            el('div', { style: { width: 8, height: 8, borderRadius: 2, background: segs[idx].color } }),
            txt(x.n + ' ' + x.w + '%', { fontSize: 12, fontWeight: 600, color: C.t2 }))))),
        row({ justifyContent: 'space-between', paddingTop: 3, borderTop: '1px solid ' + C.line },
          row({ gap: 14, paddingTop: 10 },
            row({ gap: 5 }, icon('heart', 17, C.t4, 1.8), txt(String(f.likes), { fontSize: 13, fontWeight: 600, color: C.t3 })),
            row({ gap: 5 }, icon('msg', 17, C.t4, 1.8), txt(String(f.comments), { fontSize: 13, fontWeight: 600, color: C.t3 }))),
          clk(() => push('friend', f.id), { display: 'flex', alignItems: 'center', gap: 3, paddingTop: 10 },
            txt('포트폴리오 보기', { fontSize: 13.5, fontWeight: 700, color: C.brand }), icon('chev', 16, C.brand, 2.2))));
    }));
}

function friendScreen() {
  const list = feedFriends();
  const f = list.find(x => x.id === state.param) || list[0];
  if (!f) return col({ padding: 40, alignItems: 'center' }, txt('포트폴리오를 불러올 수 없어요', { fontSize: 14, color: C.t3 }));
  const myPort = (function () { try { return buildPortfolio(); } catch (e) { return null; } })();
  const myRet = myPort ? myPort.ret : 0;
  const myByName = {};
  if (myPort) myPort.holdings.forEach(function (h) { myByName[h.name] = { w: h.weight, r: h.ret }; });
  const overlap = f.hold.filter(function (x) { return myByName[x.n]; }).length;
  const palette = ['#4C6EF5', '#15AABF', '#FAB005', '#9775FA', '#FF8787'];
  const segs = f.hold.map((x, idx) => ({ w: x.w, color: palette[idx % palette.length] }));
  return col({ padding: '4px 20px 28px' },
    row({ gap: 13, padding: '16px 0 14px' },
      avatar(f.short, f.color, 52),
      col({ flex: 1, gap: 3 },
        txt(f.name, { fontSize: 19, fontWeight: 800, color: C.t1 }),
        row({ gap: 6, background: C.bg, padding: '3px 9px', borderRadius: 8, alignSelf: 'flex-start' },
          icon('lock', 13, C.t3, 1.8), txt('비중만 공개', { fontSize: 11.5, fontWeight: 700, color: C.t3 }))),
      col({ alignItems: 'flex-end', gap: 2 },
        txt('누적 ' + pct(f.ret), { fontSize: 20, fontWeight: 800, color: cc(f.ret) }),
        txt('오늘 ' + pct(f.day || 0), { fontSize: 12.5, fontWeight: 600, color: cc(f.day || 0) }))),
    col({ background: C.bg, borderRadius: 14, padding: '13px 16px', margin: '2px 0 6px' },
      row({ justifyContent: 'space-between', alignItems: 'center' },
        col({ gap: 2 }, txt('나', { fontSize: 12, fontWeight: 600, color: C.t3 }), txt(pct(myRet), { fontSize: 18, fontWeight: 800, color: cc(myRet) })),
        txt('vs', { fontSize: 12, fontWeight: 700, color: C.t4 }),
        col({ alignItems: 'flex-end', gap: 2 }, txt(f.name, { fontSize: 12, fontWeight: 600, color: C.t3 }), txt(pct(f.ret), { fontSize: 18, fontWeight: 800, color: cc(f.ret) }))),
      overlap ? txt('겹치는 종목 ' + overlap + '개', { fontSize: 11.5, fontWeight: 600, color: C.t3, marginTop: 8 }) : null),
    row({ justifyContent: 'center', margin: '14px 0 22px' },
      donut(segs, 160, 24, col({ alignItems: 'center', gap: 1 },
        txt(String(f.hold.length), { fontSize: 26, fontWeight: 800, color: C.t1 }),
        txt('종목', { fontSize: 12, fontWeight: 600, color: C.t3 })))),
    txt('보유 비중', { fontSize: 16, fontWeight: 800, color: C.t1, marginBottom: 4 }),
    col({}, ...f.hold.map((x, k) => row({ gap: 12, padding: '13px 0', borderBottom: k < f.hold.length - 1 ? '1px solid ' + C.line : 'none' },
      el('div', { style: { width: 11, height: 11, borderRadius: 3, background: segs[k].color, flex: 'none' } }),
      col({ flex: 1, gap: 5, minWidth: 0 },
        row({ gap: 7 },
          txt(x.n, { fontSize: 15, fontWeight: 700, color: C.t1 }),
          myByName[x.n] ? row({ background: C.tint, padding: '2px 7px', borderRadius: 6 }, txt('나 ' + Math.round(myByName[x.n].w) + '%', { fontSize: 10.5, fontWeight: 700, color: C.brand })) : null),
        el('div', { style: { height: 6, borderRadius: 3, background: C.line, overflow: 'hidden' } },
          el('div', { style: { width: x.w + '%', height: '100%', background: segs[k].color, borderRadius: 3 } }))),
      col({ alignItems: 'flex-end', gap: 3, flex: 'none' },
        txt(x.w + '%', { fontSize: 15, fontWeight: 800, color: C.t1, fontVariantNumeric: 'tabular-nums' }),
        txt(pct(x.r), { fontSize: 12.5, fontWeight: 600, color: cc(x.r) }))))));
}

function rankingScreen() {
  const community = useCommunity();
  const fr = feedFriends();
  const myRet = (() => { try { return Math.round(buildPortfolio().ret * 10) / 10; } catch (e) { return 0; } })();
  const myName = (window.Auth && window.Auth.user && (window.Auth.user.name || '나')) || '나 (지훈)';
  const me = { id: 'me', name: community ? myName : '나 (지훈)', short: myName.replace(/\s/g, '').slice(0, 2), color: C.brand, ret: community ? myRet : 27.7, isMe: true };
  const list = [...fr, me].sort((a, b) => b.ret - a.ret);
  const medal = ['#F7B500', '#9AA5B1', '#CD8B5B'];
  return col({ padding: '4px 16px 28px' },
    col({ padding: '14px 4px 8px', gap: 4 },
      txt('수익률 랭킹', { fontSize: 22, fontWeight: 800, color: C.t1 }),
      txt(community ? '팔로우한 친구 ' + fr.length + '명과 비교' : '이번 달 · 친구 ' + friends().length + '명과 비교', { fontSize: 13, fontWeight: 500, color: C.t3 })),
    col({ gap: 8, marginTop: 8 },
      ...list.map((f, k) => {
        const rank = k + 1;
        return clk(f.isMe ? (() => {}) : (() => push('friend', f.id)),
          { display: 'flex', alignItems: 'center', gap: 13, padding: '13px 14px', borderRadius: 14, background: f.isMe ? C.tint : C.card, border: '1px solid ' + (f.isMe ? C.brand + '33' : C.line) },
          row({ justifyContent: 'center', width: 26, flex: 'none' },
            rank <= 3
              ? row({ justifyContent: 'center', width: 24, height: 24, borderRadius: 12, background: medal[rank - 1] }, txt(String(rank), { fontSize: 13, fontWeight: 800, color: '#fff' }))
              : txt(String(rank), { fontSize: 15, fontWeight: 700, color: C.t4 })),
          avatar(f.short, f.color, 40),
          col({ flex: 1, gap: 2 },
            row({ gap: 6 },
              txt(f.name, { fontSize: 15, fontWeight: f.isMe ? 800 : 700, color: C.t1 }),
              f.isMe ? row({ background: C.brand, padding: '1px 7px', borderRadius: 6 }, txt('나', { fontSize: 10.5, fontWeight: 700, color: '#fff' })) : null),
            txt(f.isMe ? '내 포트폴리오' : '포트폴리오 공유중', { fontSize: 12, fontWeight: 500, color: C.t3 })),
          txt(pct(f.ret), { fontSize: 17, fontWeight: 800, color: cc(f.ret), fontVariantNumeric: 'tabular-nums' }));
      })));
}

/* ===================== Chrome ===================== */
function backHeader(title, right) {
  return row({ justifyContent: 'space-between', padding: '6px 16px 10px', flex: 'none', background: C.card, borderBottom: '1px solid ' + C.line },
    clk(back, { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: -6 }, icon('back', 24, C.t1, 2.2)),
    txt(title, { fontSize: 17, fontWeight: 700, color: C.t1 }),
    right || el('div', { style: { width: 36 } }));
}

function tabBar() {
  const items = [['assets', '자산', 'bars'], ['feed', '피드', 'users'], ['ranking', '랭킹', 'award']];
  return row({ justifyContent: 'space-around', padding: '8px 0 max(10px, env(safe-area-inset-bottom))', borderTop: '1px solid ' + C.line, background: C.card, flex: 'none' },
    ...items.map(([key, label, ic]) => {
      const on = state.tab === key;
      return clk(() => goTab(key), { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '2px 18px' },
        icon(ic, 24, on ? C.brand : C.t4, 2),
        txt(label, { fontSize: 11, fontWeight: on ? 700 : 500, color: on ? C.brand : C.t4 }));
    }));
}

/* ===================== Auth UI ===================== */
// 구글 G 로고 (멀티컬러).
function googleG(size) {
  const p = (fill, d) => el('path', { fill, d });
  return el('svg', { width: size, height: size, viewBox: '0 0 48 48' },
    p('#EA4335', 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'),
    p('#4285F4', 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'),
    p('#FBBC05', 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'),
    p('#34A853', 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'));
}

function googleBtn() {
  return clk(() => window.Auth.signIn(),
    { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '15px 0', borderRadius: 12, background: '#fff', border: '1px solid #E5E8EB', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' },
    googleG(20), txt('Google로 시작하기', { fontSize: 15, fontWeight: 700, color: C.t1 }));
}

function loginScreen() {
  return col({ height: '100%', justifyContent: 'center', padding: '0 28px', background: C.card },
    col({ alignItems: 'center' },
      row({ justifyContent: 'center', width: 76, height: 76, borderRadius: 22, background: C.brand, marginBottom: 24 }, icon('bars', 40, '#fff', 2.4)),
      txt('FolioFriends', { fontSize: 27, fontWeight: 800, color: C.t1, letterSpacing: -0.5 }),
      el('div', { style: { height: 12 } }),
      txt('친구들과 포트폴리오를 공유하고', { fontSize: 15, fontWeight: 500, color: C.t3 }),
      txt('내 자산과 수익률을 한눈에', { fontSize: 15, fontWeight: 500, color: C.t3 })),
    el('div', { style: { height: 44 } }),
    googleBtn(),
    el('div', { style: { height: 14 } }),
    el('div', { style: { textAlign: 'center' } },
      txt('로그인하면 서비스 이용약관에 동의하게 됩니다', { fontSize: 12, fontWeight: 500, color: C.t4 })));
}

function loadingScreen() {
  return col({ height: '100%', justifyContent: 'center', alignItems: 'center', background: C.card },
    txt('FolioFriends', { fontSize: 22, fontWeight: 800, color: C.t1, letterSpacing: -0.5 }),
    el('div', { style: { height: 10 } }),
    txt('불러오는 중…', { fontSize: 13, fontWeight: 500, color: C.t3 }));
}

// 로그인된 경우에만 헤더에 표시되는 프로필(탭하면 로그아웃).
function profileBtn() {
  const A = window.Auth;
  if (!(A && A.enabled && A.user)) return null;
  const u = A.user;
  const inner = u.photo
    ? el('img', { src: u.photo, referrerpolicy: 'no-referrer', width: 36, height: 36, style: { width: 36, height: 36, objectFit: 'cover' } })
    : txt((u.name || u.email || 'U')[0].toUpperCase(), { fontSize: 15, fontWeight: 700, color: C.t2 });
  return clk(() => { if (confirm((u.name || u.email) + '님, 로그아웃 하시겠어요?')) A.signOut(); },
    { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' },
    inner);
}

/* ===================== OCR 스크린샷 가져오기 ===================== */
const HOLDING_COLORS = ['#4C6EF5', '#15AABF', '#FF8787', '#20C997', '#FAB005', '#9775FA', '#3182F6', '#F783AC', '#5C7CFA', '#22B8CF', '#94D82D', '#FFA94D', '#845EF7', '#FF6B6B'];
let OCR_STAGE = 'pick';   // pick | processing | review
let OCR_DRAFTS = [];
let OCR_MSG = '';
let OCR_FILE_SHARES = null; // ① 주식 수 화면(평가 탭)
let OCR_FILE_PRICE = null;  // ② 평단가 화면(시세 탭)
let OCR_PROGRESS = 0;     // 0~1 (인식 진행률)
let OCR_RAW = '';         // 디버그: 마지막 원시 OCR 텍스트

function fileToImage(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

// 전처리: 확대 + 그레이스케일 + 다크모드 자동반전 + 대비 강화 (Tesseract 정확도 향상)
function preprocess(img) {
  const scale = Math.min(3, Math.max(1.5, 1280 / img.width));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  // 1) 그레이스케일 + 평균 밝기
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
    sum += g;
  }
  const mean = sum / (d.length / 4);
  const dark = mean < 110; // 다크모드(검은 배경) 화면 감지
  // 2) 다크면 반전(검은 글자/흰 배경) + 대비 강화 → Tesseract가 잘 읽음
  for (let i = 0; i < d.length; i += 4) {
    let g = d[i];
    if (dark) g = 255 - g;
    g = (g - 128) * 1.35 + 128;
    d[i] = d[i + 1] = d[i + 2] = g < 0 ? 0 : g > 255 ? 255 : g;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

async function ocrText(file, label, idx, total) {
  const img = await fileToImage(file);
  const canvas = preprocess(img);
  OCR_MSG = label + ' 화면 인식 중…'; render();
  const { data } = await Tesseract.recognize(canvas, 'kor+eng', {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        OCR_PROGRESS = (idx + m.progress) / total;
        OCR_MSG = label + ' 화면 인식 중 ' + Math.round(m.progress * 100) + '%';
        if (OCR_STAGE === 'processing') render();
      }
    },
  });
  OCR_RAW = data.text || '';
  return data.text || '';
}

async function runOcrAndParse() {
  OCR_STAGE = 'processing'; OCR_MSG = '준비 중…'; OCR_PROGRESS = 0; render();
  try {
    const jobs = [];
    if (OCR_FILE_SHARES) jobs.push('shares');
    if (OCR_FILE_PRICE) jobs.push('price');
    let sharesList = [], priceList = [];
    for (let i = 0; i < jobs.length; i++) {
      if (jobs[i] === 'shares') sharesList = window.parseSharesView(await ocrText(OCR_FILE_SHARES, '주식 수', i, jobs.length));
      else priceList = window.parsePriceView(await ocrText(OCR_FILE_PRICE, '평단가', i, jobs.length));
    }
    OCR_DRAFTS = mergeViews(sharesList, priceList);
    if (!OCR_DRAFTS.length) {
      OCR_STAGE = 'pick';
      OCR_MSG = '종목을 찾지 못했어요. 토스 "평가"(주식 수)·"시세"(평단가) 화면을 캡처해 주세요.';
      render();
      return;
    }
    OCR_STAGE = 'review'; OCR_MSG = ''; render();
  } catch (e) {
    OCR_STAGE = 'pick';
    OCR_MSG = '이미지 처리 중 오류가 났어요: ' + (e && e.message ? e.message : e);
    render();
  }
}

// 주식수 화면(수량) + 평단가 화면(평단가)을 같은 순서로 병합
function mergeViews(sharesList, priceList) {
  const fx = (LIVE['KRW=X'] && LIVE['KRW=X'].price) || 1380;
  const isUsd = (y) => !!(y && !/\.K[SQ]$/i.test(y));
  if (sharesList.length && priceList.length) {
    const n = Math.max(sharesList.length, priceList.length);
    const out = [];
    for (let i = 0; i < n; i++) {
      const s = sharesList[i], p = priceList[i];
      const y = (p && p.y) || (s && s.y) || null;
      out.push({
        name: (p && p.name) || (s && s.name) || '',
        y, usd: p ? !!p.usd : isUsd(y),
        shares: s ? s.shares : null,
        avg: p ? p.avg : null,
      });
    }
    return out.filter((d) => d.name);
  }
  // 주식 수 화면만: 평단가는 역산(원화) → 미국은 환율로 달러 환산
  if (sharesList.length) {
    return sharesList.map((s) => {
      const usd = isUsd(s.y);
      let avg = s.avg;
      if (usd && avg) avg = Math.round((avg / fx) * 100) / 100;
      return { name: s.name, y: s.y, usd, shares: s.shares, avg: avg || null };
    });
  }
  // 평단가 화면만: 수량은 사용자 입력
  if (priceList.length) {
    return priceList.map((p) => ({ name: p.name, y: p.y, usd: !!p.usd, shares: null, avg: p.avg }));
  }
  return [];
}

function applyDrafts() {
  const ready = OCR_DRAFTS.filter((d) => d.name && d.shares > 0 && d.avg > 0);
  if (!ready.length) { alert('종목명·수량·평단가가 채워진 항목이 없어요'); return; }
  const holdings = ready.map((d, i) => ({
    id: 'u' + i, name: d.name, ticker: d.y || d.name, y: d.y || null,
    mkt: d.usd ? 'US' : 'KR', color: HOLDING_COLORS[i % HOLDING_COLORS.length],
    shares: d.shares, avg: d.avg, cur: d.avg, day: 0, ccy: d.usd ? '$' : '₩', usd: !!d.usd,
  }));
  saveUserHoldings(holdings);
  // 보유 종목 심볼을 등록 → 다음 시세 갱신부터 실시간 반영
  if (window.DB && window.DB.addSymbols) window.DB.addSymbols(holdings.map((h) => h.y).filter(Boolean));
  OCR_STAGE = 'pick'; OCR_DRAFTS = []; OCR_FILE_SHARES = null; OCR_FILE_PRICE = null;
  goTab('assets');
  loadPrices(); // 기존에 받아둔 시세 즉시 반영
}

function importScreen() {
  if (OCR_STAGE === 'processing') {
    const pn = Math.round(OCR_PROGRESS * 100);
    return col({ flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center', padding: '0 36px' },
      txt('종목을 읽고 있어요', { fontSize: 16, fontWeight: 800, color: C.t1 }),
      el('div', { style: { height: 18 } }),
      el('div', { style: { width: '100%', height: 8, borderRadius: 4, background: C.line, overflow: 'hidden' } },
        el('div', { style: { width: pn + '%', height: '100%', background: C.brand, borderRadius: 4 } })),
      el('div', { style: { height: 10 } }),
      txt(pn + '%', { fontSize: 13, fontWeight: 700, color: C.brand, fontVariantNumeric: 'tabular-nums' }),
      el('div', { style: { height: 6 } }),
      txt(OCR_MSG || '준비 중…', { fontSize: 12, fontWeight: 500, color: C.t3 }),
      el('div', { style: { height: 4 } }),
      txt('🔒 사진은 기기 안에서만 분석돼요', { fontSize: 11.5, color: C.t4 }));
  }
  if (OCR_STAGE === 'review') return reviewScreen();
  return pickScreen();
}

function uploadSlot(num, title, sub, file, onPick) {
  const input = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  input.addEventListener('change', (e) => { if (e.target.files[0]) { onPick(e.target.files[0]); render(); } });
  const done = !!file;
  return clk(() => input.click(),
    { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, border: '1.5px solid ' + (done ? C.brand : C.line), background: done ? C.tint : C.card },
    row({ justifyContent: 'center', width: 30, height: 30, borderRadius: 15, background: done ? C.brand : C.bg, flex: 'none' },
      done ? txt('✓', { fontSize: 15, fontWeight: 800, color: '#fff' }) : txt(num, { fontSize: 14, fontWeight: 800, color: C.t3 })),
    col({ flex: 1, gap: 2, minWidth: 0 },
      txt(title, { fontSize: 14.5, fontWeight: 700, color: C.t1 }),
      txt(done ? '선택됨 · 다시 누르면 변경' : sub, { fontSize: 12, fontWeight: 500, color: done ? C.brand : C.t3 })),
    icon('chev', 18, C.t4, 2), input);
}

function pickScreen() {
  const hasUser = !!loadUserHoldings();
  const canAnalyze = !!(OCR_FILE_SHARES || OCR_FILE_PRICE);
  return col({ padding: '8px 20px max(20px, env(safe-area-inset-bottom))', flex: 1, minHeight: 0 },
    col({ flex: 1, justifyContent: 'center', gap: 12 },
      col({ alignItems: 'center', gap: 0, marginBottom: 6 },
        txt('스크린샷으로 가져오기', { fontSize: 19, fontWeight: 800, color: C.t1 }),
        el('div', { style: { height: 8 } }),
        txt('토스증권 두 화면을 각각 캡처해 올려주세요', { fontSize: 13, fontWeight: 500, color: C.t3, textAlign: 'center' })),
      uploadSlot('1', '① 주식 수 화면', '"평가" 탭 — 종목·수량', OCR_FILE_SHARES, (f) => { OCR_FILE_SHARES = f; }),
      uploadSlot('2', '② 평단가 화면', '"시세" 탭 — 평균단가', OCR_FILE_PRICE, (f) => { OCR_FILE_PRICE = f; }),
      txt('🔒 사진은 서버 전송 없이 기기 안에서만 분석돼요', { fontSize: 11.5, fontWeight: 500, color: C.t4, textAlign: 'center', marginTop: 4 }),
      OCR_MSG ? el('div', { style: { textAlign: 'center' } }, txt(OCR_MSG, { fontSize: 12.5, fontWeight: 600, color: C.up })) : null),
    clk(() => { if (canAnalyze) runOcrAndParse(); }, { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px 0', borderRadius: 12, background: canAnalyze ? C.brand : C.line },
      txt('분석하기', { fontSize: 15, fontWeight: 700, color: canAnalyze ? '#fff' : C.t4 })),
    hasUser ? clk(() => { if (confirm('가져온 종목을 지우고 데모로 되돌릴까요?')) { clearUserHoldings(); goTab('assets'); loadPrices(); } },
      { display: 'flex', justifyContent: 'center', padding: '12px 0', marginTop: 4 },
      txt('데모 데이터로 초기화', { fontSize: 13, fontWeight: 600, color: C.t3 })) : null);
}

function reviewScreen() {
  return col({ flex: 1, minHeight: 0 },
    el('div', { style: { padding: '12px 20px', background: '#FFF7E6' } },
      txt('종목명·수량·평단가만 확인하고 잘못된 값은 고쳐주세요. 수익률·평가액은 실시간 시세로 자동 계산돼요.', { fontSize: 12.5, fontWeight: 500, color: '#9A6700', lineHeight: 1.4 })),
    el('div', { class: 'scrn', style: { flex: 1, padding: '12px 16px' } },
      ...OCR_DRAFTS.map((d, i) => draftCard(d, i))),
    el('div', { style: { padding: '10px 16px max(10px, env(safe-area-inset-bottom))', borderTop: '1px solid ' + C.line, display: 'flex', gap: 10 } },
      clk(() => { OCR_STAGE = 'pick'; render(); }, { flex: 1, display: 'flex', justifyContent: 'center', padding: '14px 0', borderRadius: 12, background: C.bg }, txt('다시 선택', { fontSize: 15, fontWeight: 700, color: C.t2 })),
      clk(applyDrafts, { flex: 2, display: 'flex', justifyContent: 'center', padding: '14px 0', borderRadius: 12, background: C.brand }, txt(OCR_DRAFTS.filter((d) => d.name && d.shares > 0 && d.avg > 0).length + '개 적용하기', { fontSize: 15, fontWeight: 700, color: '#fff' }))));
}

function numInput(value, onChange, opts) {
  const inp = el('input', {
    type: 'text', inputmode: 'numeric', value: value == null ? '' : String(value),
    style: { width: '100%', border: '1px solid ' + C.line, borderRadius: 8, padding: '8px 10px', fontSize: 14, fontWeight: 600, color: C.t1, fontFamily: 'inherit', textAlign: opts && opts.right ? 'right' : 'left', outline: 'none', background: '#fff' },
  });
  inp.addEventListener('input', () => onChange(inp.value));
  return inp;
}

function draftCard(d, i) {
  const nameInp = el('input', {
    type: 'text', value: d.name || '',
    style: { flex: 1, border: 'none', fontSize: 15, fontWeight: 700, color: C.t1, fontFamily: 'inherit', outline: 'none', background: 'transparent', minWidth: 0 },
  });
  nameInp.addEventListener('input', () => { d.name = nameInp.value; });
  return col({ border: '1px solid ' + (d.name && d.shares > 0 && d.avg > 0 ? C.line : C.up), borderRadius: 14, padding: '12px 14px', marginBottom: 10, gap: 10 },
    row({ gap: 8 },
      el('div', { style: { width: 10, height: 10, borderRadius: 3, background: HOLDING_COLORS[i % HOLDING_COLORS.length], flex: 'none' } }),
      nameInp,
      d.y ? row({ background: C.tint, padding: '2px 7px', borderRadius: 6, flex: 'none' }, txt('시세연동', { fontSize: 10.5, fontWeight: 700, color: C.brand })) : null,
      clk(() => { OCR_DRAFTS.splice(i, 1); render(); }, { padding: 4, flex: 'none' }, txt('✕', { fontSize: 14, color: C.t4 }))),
    row({ gap: 8 },
      col({ flex: 1, gap: 3 }, txt('수량(주)', { fontSize: 11, fontWeight: 600, color: C.t3 }),
        numInput(d.shares, (v) => { d.shares = parseInt(v.replace(/[^\d]/g, ''), 10) || 0; })),
      col({ flex: 1.4, gap: 3 }, txt(d.usd ? '평단가($)' : '평단가(원)', { fontSize: 11, fontWeight: 600, color: C.t3 }),
        numInput(d.avg, (v) => {
          const cleaned = v.replace(/[^\d.]/g, '');
          d.avg = d.usd ? (parseFloat(cleaned) || 0) : (parseInt(cleaned.replace(/\./g, ''), 10) || 0);
        }, { right: true }))));
}

/* ===================== 커뮤니티(팔로우) ===================== */
const COMM_PALETTE = ['#4C6EF5', '#15AABF', '#FAB005', '#9775FA', '#FF8787', '#20C997', '#FF922B'];
let COMMUNITY = { following: [], byUid: {}, ready: false };
let _unwatchFollowing = null;

function useCommunity() { return !!(window.DB && window.DB.enabled && window.DB.me); }
function hashIdx(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

function startCommunity() {
  if (!useCommunity()) return;
  if (_unwatchFollowing) _unwatchFollowing();
  _unwatchFollowing = window.DB.watchFriends(function (uids) {
    COMMUNITY.following = uids;
    Promise.all(uids.map(function (uid) {
      return Promise.all([window.DB.getUser(uid), window.DB.getShared(uid)]).then(function (r) {
        COMMUNITY.byUid[uid] = { user: r[0], shared: r[1] };
      }).catch(function () {});
    })).then(function () { COMMUNITY.ready = true; render(); });
  });
}

// 팔로우한 사용자들을 피드/랭킹용 형태로 변환
function communityFriends() {
  return COMMUNITY.following.map(function (uid) {
    const e = COMMUNITY.byUid[uid] || {};
    const u = e.user || {}; const sh = e.shared || { ret: 0, holdings: [] };
    const nm = u.name || '사용자';
    return {
      id: uid, name: nm, short: nm.replace(/\s/g, '').slice(0, 2), photo: u.photo || null,
      color: COMM_PALETTE[hashIdx(uid) % COMM_PALETTE.length], ret: sh.ret || 0, day: sh.dayPct || 0,
      time: '팔로잉', likes: 0, comments: 0,
      hold: (sh.holdings || []).map(function (h) { return { n: h.name, w: h.weight, r: h.ret }; }),
    };
  });
}

// 피드/친구/랭킹이 쓰는 데이터: DB면 팔로잉, 아니면 데모
function feedFriends() { return useCommunity() ? communityFriends() : friends(); }

// 내 보유 종목명 집합 ("나도 보유" 표시용)
function myHoldingNames() {
  try { return new Set(buildPortfolio().holdings.map(function (s) { return s.name; })); }
  catch (e) { return new Set(); }
}

/* ----- 친구 초대 / 수락 ----- */
let INVITE = { code: null, url: null, exp: 0, loading: false };
let PENDING_INVITE = null;            // 수락 대기 중인 초대 {code, name, from}
let INVITE_CODE_FROM_URL = (function () { const m = location.search.match(/[?&]invite=([A-Za-z0-9]+)/); return m ? m[1] : null; })();

function clearInviteParam() { if (history.replaceState) history.replaceState(null, '', location.pathname); }

function makeInvite() {
  if (!useCommunity()) return;
  INVITE.loading = true; render();
  const myName = (window.Auth.user && window.Auth.user.name) || '친구';
  window.DB.createInvite(myName).then(function (r) {
    INVITE.code = r.code; INVITE.exp = r.exp;
    INVITE.url = location.origin + location.pathname + '?invite=' + r.code;
    INVITE.loading = false; render();
  }).catch(function (e) { INVITE.loading = false; alert(e.message); render(); });
}

function shareInvite() {
  if (!INVITE.url) return;
  // url을 text에 또 넣으면 일부 앱이 링크를 중복 첨부함 → url 필드만 사용
  if (navigator.share) navigator.share({ title: 'FolioFriends 친구 초대', text: 'FolioFriends에서 친구 맺어요! (30분 내 수락)', url: INVITE.url }).catch(function () {});
  else if (navigator.clipboard) navigator.clipboard.writeText(INVITE.url).then(function () { alert('초대 링크를 복사했어요'); });
  else alert(INVITE.url);
}

function inviteScreen() {
  const friendsList = communityFriends();
  return col({ flex: 1, minHeight: 0 },
    el('div', { class: 'scrn', style: { flex: 1, padding: '8px 20px 24px' } },
      col({ background: C.tint, borderRadius: 16, padding: 18, gap: 12, marginTop: 8 },
        txt('친구 초대하기', { fontSize: 16, fontWeight: 800, color: C.t1 }),
        txt('초대 링크를 보내고, 상대가 로그인 상태로 수락하면 서로 친구가 돼요. 링크는 30분간 유효해요.', { fontSize: 12.5, fontWeight: 500, color: C.t2, lineHeight: 1.45 }),
        INVITE.url
          ? col({ gap: 8 },
              el('div', { style: { background: '#fff', borderRadius: 10, padding: '12px 14px', wordBreak: 'break-all', fontSize: 12.5, color: C.t2, fontWeight: 600 } }, INVITE.url),
              row({ gap: 8 },
                clk(shareInvite, { flex: 1, display: 'flex', justifyContent: 'center', padding: '12px 0', borderRadius: 10, background: C.brand }, txt('공유하기', { fontSize: 14, fontWeight: 700, color: '#fff' })),
                clk(makeInvite, { display: 'flex', justifyContent: 'center', padding: '12px 16px', borderRadius: 10, background: '#fff' }, txt('새 링크', { fontSize: 14, fontWeight: 700, color: C.brand }))))
          : clk(makeInvite, { display: 'flex', justifyContent: 'center', padding: '14px 0', borderRadius: 11, background: C.brand }, txt(INVITE.loading ? '만드는 중…' : '초대 링크 만들기', { fontSize: 15, fontWeight: 700, color: '#fff' }))),
      txt('내 친구 ' + friendsList.length, { fontSize: 15, fontWeight: 800, color: C.t1, marginTop: 24, marginBottom: 4 }),
      friendsList.length
        ? col({}, ...friendsList.map(function (f) {
            return row({ gap: 12, padding: '12px 0', borderBottom: '1px solid ' + C.line },
              f.photo ? el('img', { src: f.photo, referrerpolicy: 'no-referrer', width: 42, height: 42, style: { width: 42, height: 42, borderRadius: 21, objectFit: 'cover', flex: 'none' } }) : avatar(f.short, f.color, 42),
              col({ flex: 1, minWidth: 0 }, txt(f.name, { fontSize: 15, fontWeight: 700, color: C.t1 }), txt('수익률 ' + pct(f.ret), { fontSize: 12.5, fontWeight: 600, color: cc(f.ret) })),
              clk(function () { if (confirm(f.name + '님과 친구를 끊을까요? (상대도 해제돼요)')) window.DB.unfriend(f.id).then(function () { render(); }); }, { padding: '7px 13px', borderRadius: 9, background: C.bg, flex: 'none' }, txt('끊기', { fontSize: 13, fontWeight: 700, color: C.t2 })));
          }))
        : txt('아직 친구가 없어요. 위에서 초대 링크를 보내보세요.', { fontSize: 13, fontWeight: 500, color: C.t3, marginTop: 8 })));
}

function acceptScreen() {
  const inv = PENDING_INVITE || {};
  return col({ flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center', padding: '0 28px' },
    row({ justifyContent: 'center', width: 64, height: 64, borderRadius: 20, background: C.tint, marginBottom: 18 }, icon('users', 30, C.brand, 1.8)),
    txt((inv.name || '친구') + '님이', { fontSize: 18, fontWeight: 700, color: C.t1 }),
    txt('친구 신청을 보냈어요', { fontSize: 18, fontWeight: 800, color: C.t1 }),
    el('div', { style: { height: 8 } }),
    txt('수락하면 서로의 포트폴리오를 비중·수익률로 볼 수 있어요', { fontSize: 13, fontWeight: 500, color: C.t3, textAlign: 'center' }),
    el('div', { style: { height: 28 } }),
    clk(function () {
      window.DB.acceptInvite(inv.code).then(function (r) {
        PENDING_INVITE = null; clearInviteParam(); startCommunity();
        alert((r.name || '친구') + '님과 친구가 됐어요!'); goTab('feed');
      }).catch(function (e) { alert(e.message); PENDING_INVITE = null; clearInviteParam(); goTab('assets'); });
    }, { width: '100%', display: 'flex', justifyContent: 'center', padding: '15px 0', borderRadius: 12, background: C.brand }, txt('수락하기', { fontSize: 15, fontWeight: 700, color: '#fff' })),
    el('div', { style: { height: 10 } }),
    clk(function () { PENDING_INVITE = null; clearInviteParam(); render(); }, { padding: '10px' }, txt('나중에', { fontSize: 14, fontWeight: 600, color: C.t3 })));
}

// 로그인 + DB 준비 후 URL의 초대코드 처리
function processInviteFromUrl() {
  if (!INVITE_CODE_FROM_URL || !useCommunity()) return;
  const code = INVITE_CODE_FROM_URL; INVITE_CODE_FROM_URL = null;
  window.DB.getInvite(code).then(function (inv) {
    if (inv && inv.from !== window.DB.me && (!inv.exp || inv.exp > Date.now())) {
      PENDING_INVITE = { code: code, name: inv.name, from: inv.from }; render();
    } else { clearInviteParam(); }
  }).catch(function () { clearInviteParam(); });
}

/* ----- 온보딩 (신규 로그인·보유내역 없음) ----- */
function onboardingScreen() {
  const adminBanner = (window.DB && window.DB.isAdmin && ADMIN.pending.length)
    ? clk(() => push('admin'), { position: 'absolute', top: 14, left: 20, right: 20, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 12, background: '#FFF1F0' },
        icon('lock', 16, C.up, 1.8), txt('가입 승인 대기 ' + ADMIN.pending.length + '명', { fontSize: 13.5, fontWeight: 700, color: C.t1 }), el('div', { style: { flex: 1 } }), icon('chev', 16, C.up, 2))
    : null;
  return col({ flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center', padding: '0 28px', background: C.card, position: 'relative' },
    adminBanner,
    row({ justifyContent: 'center', width: 72, height: 72, borderRadius: 22, background: C.brand, marginBottom: 20 }, icon('bars', 38, '#fff', 2.2)),
    txt('내 자산 한눈에 보기', { fontSize: 21, fontWeight: 800, color: C.t1 }),
    el('div', { style: { height: 10 } }),
    txt('증권 앱 "평가" 화면을 캡처해 올리면', { fontSize: 14, fontWeight: 500, color: C.t3, textAlign: 'center' }),
    txt('종목·수량·평단가를 자동으로 채워드려요', { fontSize: 14, fontWeight: 500, color: C.t3, textAlign: 'center' }),
    el('div', { style: { height: 8 } }),
    txt('🔒 사진은 기기 안에서만 분석돼요', { fontSize: 12, fontWeight: 500, color: C.t4 }),
    el('div', { style: { height: 32 } }),
    clk(function () { OCR_STAGE = 'pick'; push('import'); }, { width: '100%', display: 'flex', justifyContent: 'center', padding: '15px 0', borderRadius: 12, background: C.brand }, txt('스크린샷으로 시작하기', { fontSize: 15, fontWeight: 700, color: '#fff' })));
}
// 보유내역이 없으면 반드시 온보딩(스크린샷 가져오기)부터 — 건너뛰기 없음
function needsOnboarding() { return useCommunity() && !loadUserHoldings(); }

/* ----- 가입 승인 (소유자 전용) ----- */
let ADMIN = { pending: [] };
let _unwatchPending = null;
function startAdmin() {
  if (!(window.DB && window.DB.isAdmin)) return;
  if (_unwatchPending) _unwatchPending();
  _unwatchPending = window.DB.watchPending(function (list) { ADMIN.pending = list; render(); });
}

function pendingScreen() {
  return col({ flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center', padding: '0 28px', background: C.card },
    row({ justifyContent: 'center', width: 64, height: 64, borderRadius: 20, background: C.bg, marginBottom: 18 }, icon('lock', 30, C.t3, 1.8)),
    txt('승인 대기 중', { fontSize: 19, fontWeight: 800, color: C.t1 }),
    el('div', { style: { height: 10 } }),
    txt('관리자 승인 후 이용할 수 있어요.', { fontSize: 14, fontWeight: 500, color: C.t3, textAlign: 'center' }),
    txt('초대받은 분이라면 곧 승인돼요.', { fontSize: 14, fontWeight: 500, color: C.t3, textAlign: 'center' }),
    el('div', { style: { height: 24 } }),
    clk(function () { if (window.Auth) window.Auth.signOut(); }, { padding: '10px' }, txt('로그아웃', { fontSize: 14, fontWeight: 600, color: C.t3 })));
}

function adminScreen() {
  return col({ flex: 1, minHeight: 0 },
    el('div', { class: 'scrn', style: { flex: 1, padding: '12px 20px 24px' } },
      txt('승인 대기 ' + ADMIN.pending.length + '명', { fontSize: 16, fontWeight: 800, color: C.t1, marginBottom: 8 }),
      ADMIN.pending.length
        ? col({}, ...ADMIN.pending.map(function (u) {
            return row({ gap: 12, padding: '12px 0', borderBottom: '1px solid ' + C.line },
              u.photo ? el('img', { src: u.photo, referrerpolicy: 'no-referrer', width: 42, height: 42, style: { width: 42, height: 42, borderRadius: 21, objectFit: 'cover', flex: 'none' } }) : avatar((u.name || 'U').slice(0, 2), C.t4, 42),
              col({ flex: 1, minWidth: 0 }, txt(u.name || '사용자', { fontSize: 15, fontWeight: 700, color: C.t1 })),
              clk(function () { window.DB.rejectUser(u.uid); ADMIN.pending = ADMIN.pending.filter(function (x) { return x.uid !== u.uid; }); render(); }, { padding: '8px 12px', borderRadius: 9, background: C.bg, flex: 'none' }, txt('거절', { fontSize: 13, fontWeight: 700, color: C.t3 })),
              clk(function () { window.DB.approveUser(u.uid); ADMIN.pending = ADMIN.pending.filter(function (x) { return x.uid !== u.uid; }); render(); }, { padding: '8px 16px', borderRadius: 9, background: C.brand, flex: 'none' }, txt('승인', { fontSize: 13, fontWeight: 700, color: '#fff' })));
          }))
        : txt('대기 중인 사용자가 없어요.', { fontSize: 13, color: C.t3, marginTop: 8 })));
}

// 디버그/테스트 관찰용 훅 (top-level let은 window에 안 올라가므로 노출)
if (typeof window !== 'undefined') window.__ff = () => ({ stage: OCR_STAGE, drafts: OCR_DRAFTS, msg: OCR_MSG, raw: OCR_RAW, community: COMMUNITY, useCommunity: useCommunity() });

/* ===================== Render ===================== */
function render() {
  const A = window.Auth;
  const app = document.getElementById('app');
  if (A && A.enabled && !A.ready) { app.replaceChildren(loadingScreen()); return; }
  if (A && A.enabled && !A.user) { app.replaceChildren(loginScreen()); return; }
  // 가입 승인 게이트
  // 로그인했으면(Auth.user) DB 승인 확정 전까지 아무것도 안 보여줌(데모 깜빡임 방지)
  const D = window.DB;
  if (D && D.enabled && A && A.user) {
    if (!D.approvedReady || D.me !== A.user.uid) { app.replaceChildren(loadingScreen()); return; }
    if (!D.approved) { app.replaceChildren(pendingScreen()); return; }
  }
  if (PENDING_INVITE) { app.replaceChildren(acceptScreen()); return; }

  const port = buildPortfolio();
  let header = null, body = null;
  if (state.view === 'home') body = needsOnboarding() ? onboardingScreen() : homeB(port);
  else if (state.view === 'holdings') { header = backHeader('보유 종목', eyeBtn()); body = holdingsScreen(port); }
  else if (state.view === 'stock') { const s = port.holdings.find(x => x.id === state.param) || port.holdings[0]; header = backHeader(s.name, iconBtn('star')); body = stockScreen(port); }
  else if (state.view === 'feed') body = feedScreen();
  else if (state.view === 'friend') { const l = feedFriends(); const f = l.find(x => x.id === state.param) || l[0]; header = backHeader(f ? f.name : '포트폴리오'); body = friendScreen(); }
  else if (state.view === 'ranking') body = rankingScreen();
  else if (state.view === 'import') { header = backHeader('스크린샷 가져오기'); body = importScreen(); }
  else if (state.view === 'invite') { header = backHeader('친구'); body = inviteScreen(); }
  else if (state.view === 'admin') { header = backHeader('가입 승인'); body = adminScreen(); }

  app.replaceChildren();
  if (header) app.append(header);
  if (state.view === 'import' || state.view === 'invite' || state.view === 'admin') {
    app.append(body); // 자체 레이아웃/스크롤 관리
  } else {
    app.append(el('div', { class: 'scrn' }, body));
  }
  // import는 자체 하단 버튼/뒤로가기가 있으므로 탭바 숨김
  if (state.view !== 'import') app.append(tabBar());
}

// 인증 상태가 바뀌면 다시 그린다.
if (window.Auth) window.Auth.onChange = render;
render();

// 내 보유내역을 Firebase에 저장:
//  - /holdings/{me}: 전체(금액 포함) — 본인 전용, 기기 간 동기화
//  - /shared/{me}:   비중·수익률만 — 팔로워 공개(금액 제외)
function publishMine() {
  if (!(window.DB && window.DB.enabled && window.DB.me)) return;
  const uh = loadUserHoldings();
  if (!uh) return; // 보유내역 없으면 발행 안 함 (데모 시드가 공유되는 것 방지)
  try {
    window.DB.saveHoldings(uh);
    window.DB.saveShared(buildPortfolio());
  } catch (e) { /* noop */ }
}

// 로그인 시: 다른 기기에 저장해 둔 보유내역을 불러와 반영.
if (window.DB) {
  window.DB.onAuth = function (uid) {
    if (!uid) {
      if (_unwatchFollowing) { _unwatchFollowing(); _unwatchFollowing = null; }
      if (_unwatchPending) { _unwatchPending(); _unwatchPending = null; }
      COMMUNITY = { following: [], byUid: {}, ready: false };
      ADMIN = { pending: [] };
      render();
      return;
    }
    startCommunity();
    startAdmin();
    processInviteFromUrl();
    // 이 계정의 보유내역만 로드 (없으면 null → 온보딩). 다른 계정/로컬 데이터 노출 방지.
    window.DB.loadHoldings().then(function (items) {
      _holdingsUid = uid;
      _holdingsCache = (items && items.length) ? items : null;
      _port = null;
      render();
      publishMine();
    }).catch(function () { _holdingsUid = uid; _holdingsCache = null; _port = null; render(); });
  };
}

// 실시간 시세 로드 (같은 도메인 prices.json — CORS 불필요).
async function loadPrices() {
  try {
    const res = await fetch('./prices.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    LIVE = data.quotes || {};
    LIVE_UPDATED = data.updated || null;
    _port = null; // 캐시 무효화 → 실시간 가격으로 재계산
    render();
    publishMine(); // 최신 비중·수익률 공유
  } catch (e) {
    // prices.json 이 아직 없으면 시드 가격으로 동작 (조용히 무시)
  }
}
loadPrices();
// 앱이 열려 있는 동안 5분마다 갱신
setInterval(loadPrices, 5 * 60 * 1000);
