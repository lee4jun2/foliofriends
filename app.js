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

let _port = null;
function buildPortfolio() {
  if (_port) return _port;
  const raw = [
    { id: 'aapl', name: 'Apple', ticker: 'AAPL', y: 'AAPL', mkt: 'US', color: '#4C6EF5', shares: 30, avg: 240, cur: 283, day: 1.1, ccy: '$' },
    { id: 'nvda', name: 'NVIDIA', ticker: 'NVDA', y: 'NVDA', mkt: 'US', color: '#15AABF', shares: 45, avg: 150, cur: 192, day: 3.2, ccy: '$' },
    { id: 'tsla', name: 'Tesla', ticker: 'TSLA', y: 'TSLA', mkt: 'US', color: '#FF8787', shares: 18, avg: 410, cur: 379, day: -0.8, ccy: '$' },
    { id: 'sse', name: '삼성전자', ticker: '005930', y: '005930.KS', mkt: 'KR', color: '#20C997', shares: 35, avg: 290000, cur: 339500, day: 0.9, ccy: '₩' },
    { id: 'skh', name: 'SK하이닉스', ticker: '000660', y: '000660.KS', mkt: 'KR', color: '#FAB005', shares: 4, avg: 2200000, cur: 2673000, day: 2.4, ccy: '₩' },
    { id: 'nav', name: 'NAVER', ticker: '035420', y: '035420.KS', mkt: 'KR', color: '#9775FA', shares: 45, avg: 210000, cur: 196400, day: -1.2, ccy: '₩' },
  ];
  // 실시간 시세가 있으면 현재가/일간등락을 덮어쓴다.
  raw.forEach(s => {
    const q = s.y && LIVE[s.y];
    if (q && q.price) {
      s.cur = q.price;
      s.live = true;
      if (q.prevClose) s.day = (q.price - q.prevClose) / q.prevClose * 100;
    }
  });
  let total = 0, cost = 0, dayPnl = 0;
  raw.forEach(s => {
    const m = s.ccy === '$' ? KRW : 1;
    s.val = s.shares * s.cur * m;
    s.cost = s.shares * s.avg * m;
    s.pnl = s.val - s.cost;
    s.ret = (s.cur - s.avg) / s.avg * 100;
    s.dayPnl = s.val * s.day / 100;
    total += s.val; cost += s.cost; dayPnl += s.dayPnl;
  });
  raw.forEach(s => s.weight = s.val / total * 100);
  raw.sort((a, b) => b.weight - a.weight);
  _port = { holdings: raw, total, cost, pnl: total - cost, ret: (total - cost) / cost * 100, dayPnl, dayPct: dayPnl / total * 100 };
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
    { display: 'flex', flexDirection: 'column', gap: 11, padding: '14px 0', borderBottom: last ? 'none' : '1px solid ' + C.line },
    row({ gap: 11 },
      logo(s, 38),
      col({ flex: 1, gap: 3, minWidth: 0 },
        txt(s.name, { fontSize: 15, fontWeight: 700, color: C.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
        row({ gap: 6 },
          txt(s.shares + '주', { fontSize: 12, color: C.t3, fontWeight: 500 }),
          txt('·', { fontSize: 11, color: C.t4 }),
          txt('비중 ' + s.weight.toFixed(1) + '%', { fontSize: 12, color: C.t3, fontWeight: 500 }))),
      col({ alignItems: 'flex-end', gap: 2, flex: 'none' },
        txt(won(s.val, state.hide), { fontSize: 15, fontWeight: 800, color: C.t1, fontVariantNumeric: 'tabular-nums' }),
        txt('평가액', { fontSize: 11, fontWeight: 600, color: C.t4 }))),
    row({ gap: 8 },
      valBlock('총수익', swon(s.pnl, state.hide), pct(s.ret), cc(s.ret)),
      valBlock('일간수익', swon(s.dayPnl, state.hide), pct(s.day), cc(s.day))));
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
      col({ marginTop: 16, gap: 11 }, ...port.holdings.slice(0, 4).map(s =>
        row({ justifyContent: 'space-between' },
          row({ gap: 8 },
            el('div', { style: { width: 9, height: 9, borderRadius: 3, background: s.color } }),
            txt(s.name, { fontSize: 14, fontWeight: 600, color: C.t1 })),
          txt(s.weight.toFixed(1) + '%', { fontSize: 14, fontWeight: 700, color: C.t2, fontVariantNumeric: 'tabular-nums' }))))),
    el('div', { style: { height: 8, background: C.bg, margin: '4px -20px 0' } }),
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

function stockScreen(port) {
  const s = port.holdings.find(x => x.id === state.param) || port.holdings[0];
  const up = s.ret >= 0;
  const periods = ['1일', '1주', '1개월', '1년', '전체'];
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
    el('div', { style: { padding: '10px 20px 0' } }, spark(s.cur * 1000 + s.shares, up, 334, 150, cc(s.ret))),
    row({ gap: 6, padding: '8px 20px 18px', justifyContent: 'space-between' },
      ...periods.map(pr => row({ justifyContent: 'center', flex: 1, padding: '6px 0', borderRadius: 8, background: pr === '1개월' ? C.t1 : 'transparent' },
        txt(pr, { fontSize: 12.5, fontWeight: 700, color: pr === '1개월' ? '#fff' : C.t3 })))),
    col({ margin: '0 20px', background: C.bg, borderRadius: 16, padding: 18 },
      txt('내 보유 현황', { fontSize: 15, fontWeight: 800, color: C.t1, marginBottom: 14 }),
      ...rows.map((rw, k) => row({ justifyContent: 'space-between', padding: '9px 0', borderBottom: k < 3 ? '1px solid ' + C.line : 'none' },
        txt(rw[0], { fontSize: 14, fontWeight: 500, color: C.t3 }),
        txt(rw[1], { fontSize: 14.5, fontWeight: 700, color: C.t1, fontVariantNumeric: 'tabular-nums' }))),
      row({ justifyContent: 'space-between', padding: '12px 0 2px', marginTop: 6, borderTop: '2px solid ' + C.line },
        txt('평가 손익', { fontSize: 14, fontWeight: 700, color: C.t1 }),
        txt(swon(s.pnl, state.hide) + ' (' + pct(s.ret) + ')', { fontSize: 15, fontWeight: 800, color: cc(s.ret), fontVariantNumeric: 'tabular-nums' }))),
    row({ gap: 10, padding: '18px 20px 0' },
      row({ justifyContent: 'center', flex: 1, padding: '14px 0', borderRadius: 12, background: C.bg }, txt('매도', { fontSize: 15, fontWeight: 700, color: C.down })),
      row({ justifyContent: 'center', flex: 1, padding: '14px 0', borderRadius: 12, background: C.up }, txt('매수', { fontSize: 15, fontWeight: 700, color: '#fff' }))));
}

function feedScreen() {
  const fr = friends();
  return col({ padding: '4px 16px 28px', gap: 14 },
    col({ padding: '14px 4px 6px', gap: 4 },
      txt('친구 피드', { fontSize: 22, fontWeight: 800, color: C.t1 }),
      txt('친구들이 공유한 포트폴리오를 둘러보세요', { fontSize: 13, fontWeight: 500, color: C.t3 })),
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
  const f = friends().find(x => x.id === state.param) || friends()[0];
  const mine = new Set(['Apple', 'Tesla', 'TSLA', 'NVIDIA', '삼성전자', 'SK하이닉스', 'NAVER']);
  const palette = ['#4C6EF5', '#15AABF', '#FAB005', '#9775FA', '#FF8787'];
  const segs = f.hold.map((x, idx) => ({ w: x.w, color: palette[idx % palette.length] }));
  return col({ padding: '4px 20px 28px' },
    row({ gap: 13, padding: '16px 0 14px' },
      avatar(f.short, f.color, 52),
      col({ flex: 1, gap: 3 },
        txt(f.name, { fontSize: 19, fontWeight: 800, color: C.t1 }),
        row({ gap: 6, background: C.bg, padding: '3px 9px', borderRadius: 8, alignSelf: 'flex-start' },
          icon('lock', 13, C.t3, 1.8), txt('비중만 공개', { fontSize: 11.5, fontWeight: 700, color: C.t3 }))),
      col({ alignItems: 'flex-end', gap: 1 },
        txt('수익률', { fontSize: 12, fontWeight: 600, color: C.t3 }),
        txt(pct(f.ret), { fontSize: 22, fontWeight: 800, color: cc(f.ret) }))),
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
          mine.has(x.n) ? row({ background: C.tint, padding: '2px 7px', borderRadius: 6 }, txt('나도 보유', { fontSize: 10.5, fontWeight: 700, color: C.brand })) : null),
        el('div', { style: { height: 6, borderRadius: 3, background: C.line, overflow: 'hidden' } },
          el('div', { style: { width: x.w + '%', height: '100%', background: segs[k].color, borderRadius: 3 } }))),
      col({ alignItems: 'flex-end', gap: 3, flex: 'none' },
        txt(x.w + '%', { fontSize: 15, fontWeight: 800, color: C.t1, fontVariantNumeric: 'tabular-nums' }),
        txt(pct(x.r), { fontSize: 12.5, fontWeight: 600, color: cc(x.r) }))))));
}

function rankingScreen() {
  const me = { id: 'me', name: '나 (지훈)', short: '지훈', color: C.brand, ret: 27.7, isMe: true };
  const list = [...friends(), me].sort((a, b) => b.ret - a.ret);
  const medal = ['#F7B500', '#9AA5B1', '#CD8B5B'];
  return col({ padding: '4px 16px 28px' },
    col({ padding: '14px 4px 8px', gap: 4 },
      txt('수익률 랭킹', { fontSize: 22, fontWeight: 800, color: C.t1 }),
      txt('이번 달 · 친구 ' + friends().length + '명과 비교', { fontSize: 13, fontWeight: 500, color: C.t3 })),
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

/* ===================== Render ===================== */
function render() {
  const A = window.Auth;
  const app = document.getElementById('app');
  if (A && A.enabled && !A.ready) { app.replaceChildren(loadingScreen()); return; }
  if (A && A.enabled && !A.user) { app.replaceChildren(loginScreen()); return; }

  const port = buildPortfolio();
  let header = null, body = null;
  if (state.view === 'home') body = homeB(port);
  else if (state.view === 'holdings') { header = backHeader('보유 종목', eyeBtn()); body = holdingsScreen(port); }
  else if (state.view === 'stock') { const s = port.holdings.find(x => x.id === state.param) || port.holdings[0]; header = backHeader(s.name, iconBtn('star')); body = stockScreen(port); }
  else if (state.view === 'feed') body = feedScreen();
  else if (state.view === 'friend') { const f = friends().find(x => x.id === state.param) || friends()[0]; header = backHeader(f.name); body = friendScreen(); }
  else if (state.view === 'ranking') body = rankingScreen();

  app.replaceChildren();
  if (header) app.append(header);
  const scrn = el('div', { class: 'scrn' }, body);
  app.append(scrn, tabBar());
}

// 인증 상태가 바뀌면 다시 그린다.
if (window.Auth) window.Auth.onChange = render;
render();

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
  } catch (e) {
    // prices.json 이 아직 없으면 시드 가격으로 동작 (조용히 무시)
  }
}
loadPrices();
// 앱이 열려 있는 동안 5분마다 갱신
setInterval(loadPrices, 5 * 60 * 1000);
