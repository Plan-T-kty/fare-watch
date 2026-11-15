#!/usr/bin/env node
/* Daily fare check.
   Reads the watch list in data/config.json, has Claude fetch each fare page through the Claude API's
   web fetch tool and list the fares printed on it, keeps only what passes the checks below,
   writes data/prices.json and data/status.json, and sends an alert when a fare reaches its target.
   Runs on the Claude API key in ANTHROPIC_API_KEY. No packages to install: Node 18 or newer. */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('../core.js');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.FARE_DATA_DIR || path.join(ROOT, 'data');
const API = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
const KEY = process.env.ANTHROPIC_API_KEY || '';
const TODAY = C.isDate(process.env.FARE_TODAY) ? process.env.FARE_TODAY : C.todayIn('Asia/Seoul');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WAIT = Number(process.env.FARE_WAIT_SCALE || 1);   // tests shorten the waits
const log = (...a) => console.log(...a);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')); } catch (e) { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(DATA, {recursive: true});
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(value, null, 1) + '\n');
}

/* ===================== where fares are read from ===================== */
const SKY = {SEL: 'sela', TYO: 'tyoa', OSA: 'osaa'};
const enName = c => String(C.place(c).en || c);
const slug = c => enName(c).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || c.toLowerCase();
const capSlug = c => enName(c).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || c;
function sourcesFor(from, to, cfg, oneWays) {
  const custom = cfg.sources && cfg.sources[`${from}-${to}`];
  if (Array.isArray(custom) && custom.length) return custom.filter(s => s && s.name && C.httpUrl(s.url)).map(s => ({name: String(s.name), url: String(s.url), currency: s.currency === 'JPY' ? 'JPY' : 'KRW', maxContentTokens: Number(s.maxContentTokens) || 0, optional: !!s.optional}));
  const inJapan = C.isJP(from) && C.isJP(to);
  const list = [];
  // Kayak's page for a flight inside Japan does not open through the API's fetch tool
  if (!inJapan) list.push({name: '카약', url: `https://www.kayak.co.kr/flight-routes/${capSlug(from)}-${from}/${capSlug(to)}-${to}`, currency: 'KRW', maxContentTokens: 80000});
  list.push({name: '스카이스캐너', url: `https://www.skyscanner.co.kr/routes/${SKY[from] || from.toLowerCase()}/${SKY[to] || to.toLowerCase()}/${slug(from)}-to-${slug(to)}.html`, currency: 'KRW'});
  // a Japanese site with a day-by-day calendar of the lowest posted fare, for flights inside Japan
  if (inJapan && !SKY[from] && !SKY[to]) list.push({name: '트래블리스트', url: `https://travelist.jp/airport_${to}/airport_${from}/`, currency: 'JPY'});
  // one more list of dated one-way fares, read only where one-way fares are what the route is built from
  if (oneWays && !inJapan) list.push({name: '호텔스컴바인', url: `https://www.hotelscombined.co.kr/flight-routes/${capSlug(from)}-${from}/${capSlug(to)}-${to}.ksp`, currency: 'KRW', maxContentTokens: 60000, optional: true});
  return list;
}

/* ===================== Claude API ===================== */
const usage = {calls: 0, input_tokens: 0, output_tokens: 0, fetches: 0};
function addUsage(u) {
  if (!u) return;
  usage.calls++;
  usage.input_tokens += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  usage.output_tokens += u.output_tokens || 0;
  usage.fetches += (u.server_tool_use && u.server_tool_use.web_fetch_requests) || 0;
}
let beta = process.env.ANTHROPIC_BETA || '';
async function callClaude(body) {
  for (let attempt = 0; ; attempt++) {
    const headers = {'x-api-key': KEY, 'anthropic-version': process.env.ANTHROPIC_VERSION || '2026-10-21', 'content-type': 'application/json'};
    if (process.env.ANTHROPIC_WORKSPACE_ID) headers['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID;
    if (beta) headers['anthropic-beta'] = beta;
    let res;
    try {
      res = await fetch(API + '/v1/messages', {method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(240000)});
    } catch (e) {
      if (attempt < 2) { await sleep(5000 * (attempt + 1) * WAIT); continue; }
      throw new Error('Claude API에 연결하지 못했어요: ' + e.message);
    }
    if (res.ok) return res.json();
    const text = await res.text();
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text); if (j.error && j.error.message) msg = String(j.error.message).slice(0, 300); } catch (e) { /* not JSON */ }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {   // too many requests or a busy server: wait and try again
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Math.min(120, ra > 0 ? ra + 1 : 15 * (attempt + 1)) * 1000 * WAIT);
      continue;
    }
    if (res.status === 400 && !beta && /beta/i.test(msg) && /web[_-]?fetch/i.test(msg)) { beta = 'web-fetch-2025-09-10'; continue; }   // the tool asked for its beta header
    const err = new Error(`Claude API ${res.status}: ${msg}`);
    // a wrong key, no access, an unknown model or no credit left will fail the same way for every page
    err.fatal = [401, 403, 404].includes(res.status) || (res.status === 400 && /credit|billing|balance|workspace/i.test(msg));
    throw err;
  }
}

const SYSTEM = 'You read one flight-fare web page with the web_fetch tool and list the fares printed on it. You answer with a single JSON object and nothing else. You never invent, estimate or round a value: anything not printed on the fetched page is left out.';
function promptFor(src, leg) {
  const a = C.place(leg.from), b = C.place(leg.to);
  return `Today is ${TODAY} (Asia/Seoul).
Fetch this page with the web_fetch tool, once: ${src.url}

It should be a fare page on ${src.name} for flights from ${enName(leg.from)} (${a.ko}, ${leg.from}) to ${enName(leg.to)} (${b.ko}, ${leg.to}). Prices on it are in ${src.currency}.
List the fares printed on the fetched page. Use nothing but that page.

Answer with one JSON object only, in this compact shape. Each fare is one row (an array), not an object:
{"ok":true,"cur":"${src.currency}",
 "rt":[[123456,"YYYY-MM-DD","YYYY-MM-DD","airline",1,"",""]],
 "ow":[[123456,"YYYY-MM-DD","airline",1,"",""]],
 "note":""}
rt row (round trip): price, departure date, return date, airline, nonstop, from, to.
ow row (one way): price, date, airline, nonstop, from, to.
If the fetch fails, or the page is not a fare page for this route, answer {"ok":false,"reason":"<short reason>"}.

Rules
- price: the integer exactly as printed, without separators. Never rounded, never converted.
- Dates: pages usually print month and day without a year. Use the first such date on or after today. Leave out a fare whose date is missing, marked as invalid, or already past.
- 왕복 is a round trip, 편도 is one way, 직항 is nonstop, 경유 means it has a stop.
- A "round trip" whose return leg is a placeholder (for example a return at 00:00 lasting 0 minutes, or the same placeholder date on every row) is really a one-way fare: put it in ow.
- A table of the lowest one-way fare per month: each row with a date is one ow row.
- A calendar of the lowest fare per day: each day with a price is one ow row.
- Pages often have one section of round-trip (왕복) deals and another of one-way (편도) deals. Go through the whole page and list both kinds.
- A round trip belongs in rt only when both its departure date and its return date are printed.
- airline: as printed (Korean if printed in Korean). Mixed airlines: "항공사 조합". Not printed: "".
- from / to: the three-letter airport codes if printed for that fare, else "".
- nonstop: 1 if the fare is shown as nonstop on every leg, 0 if it shows a stop, null if the page does not say.
- At most 40 rt rows and 40 ow rows, cheapest first. On a calendar page with one lowest fare per day, list every day that has a price in every month shown, up to 200 rows.
- note: one short sentence in Korean if something on the page looks off, else "".`;
}
function parseJson(text) {
  const s = String(text || '');
  let tries = 0;
  for (let i = s.indexOf('{'); i >= 0 && tries < 400; i = s.indexOf('{', i + 1)) {
    for (let j = s.lastIndexOf('}'); j > i && tries < 400; j = s.lastIndexOf('}', j - 1)) {
      tries++;
      try { const v = JSON.parse(s.slice(i, j + 1)); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch (e) { /* try a shorter piece */ }
    }
  }
  return null;
}
/* a cut-off answer: keep everything up to the last finished row */
function parseAnswer(text) {
  const whole = parseJson(text);
  if (whole) return {value: whole, cut: false};
  const s = String(text || ''), start = s.indexOf('{');
  if (start < 0) return {value: null, cut: false};
  let body = s.slice(start);
  for (let i = 0; i < 80; i++) {
    const end = Math.max(body.lastIndexOf(']'), body.lastIndexOf('}'));
    if (end < 1) break;
    body = body.slice(0, end + 1);
    for (const tail of [']}', '}', ']]}', '']) {
      try { const v = JSON.parse(body + tail); if (v && typeof v === 'object' && !Array.isArray(v)) return {value: v, cut: true}; } catch (e) { /* try the next ending */ }
    }
    body = body.slice(0, end);
  }
  return {value: null, cut: false};
}
const flag = v => (v === 1 || v === true ? true : v === 0 || v === false ? false : null);
/* a row from the compact answer, or an object from the older shape */
function rowToFare(row, round, cur) {
  if (!Array.isArray(row)) return row && typeof row === 'object' ? Object.assign({currency: cur}, row, {nonstop: flag(row.nonstop)}) : null;
  return round
    ? {price: row[0], dep: row[1], ret: row[2], airline: row[3], nonstop: flag(row[4]), from: row[5], to: row[6], currency: cur}
    : {price: row[0], dep: row[1], airline: row[2], nonstop: flag(row[3]), from: row[4], to: row[5], currency: cur};
}
/* one page: fetched by Claude, listed by Claude, checked here */
async function readSource(src, leg, cfg) {
  const host = new URL(src.url).hostname;
  const body = {
    model: cfg.model || 'claude-haiku-5-5',
    max_tokens: 14000,
    system: SYSTEM,
    tools: [{type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 1, max_content_tokens: src.maxContentTokens || Number(cfg.maxContentTokens) || 40000, allowed_domains: [host]}],
    messages: [{role: 'user', content: promptFor(src, leg)}]
  };
  let content = [], stop = '';
  for (let turn = 0; turn < 4; turn++) {
    const res = await callClaude(body);
    addUsage(res.usage);
    content = content.concat(Array.isArray(res.content) ? res.content : []);
    stop = String(res.stop_reason || '');
    if (res.stop_reason !== 'pause_turn') break;
    body.messages = [body.messages[0], {role: 'assistant', content}];   // a paused turn continues from what it has so far
  }
  const results = content.filter(b => b && b.type === 'web_fetch_tool_result' && b.content);
  const pages = results.filter(b => b.content.type === 'web_fetch_result');
  if (!pages.length) {
    const bad = results.find(b => b.content.type === 'web_fetch_tool_result_error');
    return {ok: false, error: bad ? String(bad.content.error_code || 'fetch_error') : 'no_fetch'};
  }
  const rawText = pages.map(b => { const d = b.content.content, s = d && d.source; return s && s.type === 'text' ? String(s.data || '') : ''; }).join('\n');
  const pageText = rawText.replace(/[,.\u00a0\u202f]/g, '');   // 226,921 and 226.921 both read as 226921
  const parsed = parseAnswer(content.filter(b => b && b.type === 'text').map(b => b.text).join('\n'));
  const answer = parsed.value;
  const diag = {chars: rawText.length, stop, cut: parsed.cut, got: [0, 0], drops: {}, samples: [], snippets: []};
  if (!answer) return {ok: false, error: 'no_answer', diag};
  if (answer.ok === false) return {ok: false, error: 'not_a_fare_page', note: C.str(answer.reason, 120), diag};
  const cur = String(answer.cur || src.currency || 'KRW').toUpperCase();
  const keep = (list, round) => {
    const rows = (Array.isArray(list) ? list : []).slice(0, 220);
    diag.got[round ? 0 : 1] += rows.length;
    const out = [];
    for (const row of rows) {
      const why = {};
      const fare = cleanFare(rowToFare(row, round, cur), round, src, leg, pageText, cfg, why);
      if (fare) out.push(fare);
      else { diag.drops[why.reason] = (diag.drops[why.reason] || 0) + 1; if (diag.samples.length < 3) diag.samples.push(`${why.reason}: ${JSON.stringify(row).slice(0, 110)}`); }
    }
    return out;
  };
  const roundtrips = keep(answer.rt || answer.roundtrips, true), oneways = keep(answer.ow || answer.oneways, false);
  if (!roundtrips.length && !oneways.length) {   // nothing survived: show what prices on the page look like
    const re = /[₩¥]\s?\d{1,3}(?:[,.]\d{3})+|\d{1,3}(?:[,.]\d{3})+\s?(?:원|円|엔)/g;
    let m;
    while (diag.snippets.length < 3 && (m = re.exec(rawText))) { diag.snippets.push(rawText.slice(Math.max(0, m.index - 50), m.index + 70).replace(/\s+/g, ' ')); re.lastIndex = m.index + 400; }
    if (!diag.snippets.length) diag.snippets.push('가격 꼴의 글자가 없음. 글 첫머리: ' + rawText.slice(0, 160).replace(/\s+/g, ' '));
  }
  return {ok: true, roundtrips, oneways, checked: !!pageText, diag};
}
/* a fare is kept only if it is plausible, in the future, nonstop where the page says, and its price is printed on the page */
function cleanFare(o, round, src, leg, pageText, cfg, why) {
  const no = reason => { if (why) why.reason = reason; return null; };
  if (!o || typeof o !== 'object') return no('꼴이 다름');
  const cur = String(o.currency || src.currency || 'KRW').toUpperCase();
  const raw = Math.round(Number(o.price));
  if (!(raw > 0)) return no('값이 숫자가 아님');
  if (cur !== 'KRW' && cur !== 'JPY') return no('다른 통화 ' + cur.slice(0, 4));
  if (cur === 'KRW' ? (raw < 15000 || raw > 5000000) : (raw < 1500 || raw > 500000)) return no('값이 범위 밖');
  if (!C.isDate(o.dep)) return no('날짜 없음');
  if (o.dep < TODAY) return no('지난 날짜');
  if (o.dep > C.addDays(TODAY, 370)) return no('너무 먼 날짜');
  if (round && (!C.isDate(o.ret) || o.ret < o.dep || C.diffDays(o.dep, o.ret) > 60)) return no('오는 날이 없거나 이상함');
  if (o.nonstop === false) return no('경유');
  const airline = C.str(o.airline, 30);
  if (/한에어|hahn/i.test(airline)) return no('발권 대행 코드');   // a ticketing company's code, not an airline that flies the route
  if (pageText && !pageText.includes(String(raw))) return no('페이지에 없는 값');   // not printed on the page: not kept
  const code = v => (/^[A-Z]{3}$/.test(String(v || '')) ? String(v) : '');
  const price = cur === 'JPY' ? Math.round(raw * cfg.jpy100 / 100) : raw;
  const out = {price, airline, dep: o.dep, from: code(o.from) || leg.from, to: code(o.to) || leg.to, src: src.name};
  if (round) out.ret = o.ret;
  if (cur === 'JPY') out.jpy = raw;
  return out;
}

const pageCache = new Map();
/* every source for one flight; each page is read once per run */
async function legFares(leg, cfg, errors, oneWays) {
  const out = {roundtrips: [], oneways: [], srcUrls: {}, read: 0};
  for (const src of sourcesFor(leg.from, leg.to, cfg, oneWays)) {
    const label = `${src.name} ${C.place(leg.from).ko}→${C.place(leg.to).ko}`;
    let got = pageCache.get(src.url);
    if (!got) {
      try {
        got = await readSource(src, leg, cfg);
        if (!got.ok && got.error === 'no_fetch') got = await readSource(src, leg, cfg);   // Claude answered without fetching: once more
      } catch (e) {
        if (e.fatal) throw e;
        got = {ok: false, error: e.message};
      }
      pageCache.set(src.url, got);
      if (!got.ok) {
        // a page that is only an extra is not listed among the unread ones in the app
        if (!src.optional) errors.push(`${label}: ${explain(got.error)}`);
        log(`  ✗ ${label}: ${got.error}${got.note ? ' (' + got.note + ')' : ''}${got.diag ? ` [글 ${got.diag.chars}자, 끝 ${got.diag.stop}]` : ''}${src.optional ? ' (덤으로 읽는 곳)' : ''}`);
      } else {
        const first = list => (list.length ? list.slice().sort((a, b) => a.price - b.price)[0] : null);
        const show = x => (x ? `${C.won(x.price)}원 ${x.dep}${x.ret ? '~' + x.ret : ''} ${x.airline}` : '');
        log(`  ✓ ${label}: 왕복 ${got.roundtrips.length}건, 편도 ${got.oneways.length}건${got.checked ? '' : ' (페이지 글과 대조하지 못함)'}${got.roundtrips.length ? '. 왕복 최저 ' + show(first(got.roundtrips)) : ''}${got.oneways.length ? '. 편도 최저 ' + show(first(got.oneways)) : ''}`);
        const d = got.diag;
        if (d) {
          const drops = Object.keys(d.drops).map(k => `${k} ${d.drops[k]}`).join(', ');
          log(`      받은 줄 왕복 ${d.got[0]}, 편도 ${d.got[1]}${drops ? '. 버림: ' + drops : ''}. 글 ${d.chars}자, 끝 ${d.stop}${d.cut ? ', 답이 잘려서 끝난 줄까지만 씀' : ''}`);
          for (const x of d.samples) log(`      버린 예 ${x}`);
          for (const x of d.snippets) log(`      페이지 글 ${x}`);
        }
      }
    }
    if (!got.ok) continue;
    out.read++;
    out.srcUrls[src.name] = src.url;
    out.roundtrips.push(...got.roundtrips);
    out.oneways.push(...got.oneways);
  }
  return out;
}
function explain(code) {
  return ({
    url_not_allowed: '이 사이트는 Claude가 읽을 수 없게 막혀 있어요', url_not_accessible: '페이지가 열리지 않았어요', too_many_requests: '요청이 너무 잦았어요',
    unsupported_content_type: '읽을 수 없는 형식이에요', content_too_large: '페이지가 너무 커요', max_uses_exceeded: '읽기 횟수를 넘었어요', unavailable: '읽기 도구가 잠시 멈췄어요',
    no_fetch: '페이지를 읽지 않고 답했어요', no_answer: '답을 알아볼 수 없었어요', not_a_fare_page: '운임 페이지가 아니었어요'
  })[code] || String(code).slice(0, 120);
}
const uniq = (list, key) => { const seen = new Set(); return list.filter(x => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };

/* ===================== one watched item ===================== */
async function checkRoute(r, cfg, prev, errors) {
  const legs = C.legsOf(r);
  const srcUrls = {};
  let cands = [], ow = null, hint = '', read = 0;
  if (C.isChain(r)) {
    const legDeals = [];
    for (const leg of legs) {
      const got = await legFares(leg, cfg, errors, true);
      read += got.read;
      Object.assign(srcUrls, got.srcUrls);
      legDeals.push(got.oneways);
      if (!got.oneways.length) errors.push(`${C.place(leg.from).ko}→${C.place(leg.to).ko} 편도 값을 찾지 못해 ${C.routeLabel(r)} 합계를 내지 못했어요`);
    }
    cands = C.buildCombos(r, legDeals, TODAY, 6);
    if (legDeals.some(list => list.some(x => x.jpy))) hint = `엔화로 나온 구간은 100엔 ${C.won(Math.round(cfg.jpy100))}원으로 바꾼 값이에요. 수수료가 따로 붙을 수 있어요.`;
  } else {
    const got = await legFares(legs[0], cfg, errors, r.trip === 'ow');
    read = got.read;
    Object.assign(srcUrls, got.srcUrls);
    const one = uniq(got.oneways.slice().sort((a, b) => a.price - b.price), x => [x.dep, x.airline, x.price].join('|'));
    if (r.trip === 'ow') cands = one.slice(0, 40);
    else {
      cands = uniq(got.roundtrips.slice().sort((a, b) => a.price - b.price), x => [x.dep, x.ret, x.airline, x.price].join('|')).slice(0, 40);
      if (one[0]) ow = {price: one[0].price, airline: one[0].airline, dep: one[0].dep, src: one[0].src};
    }
  }
  if (!cands.length) return {record: prev ? Object.assign({}, prev, {lastError: read ? '맞는 표를 찾지 못했어요' : '가격 페이지를 읽지 못했어요', lastTriedAt: new Date().toISOString()}) : null, cls: null, read};
  const cls = C.classify(r, {cands}, TODAY);
  const hist = Object.assign({}, prev && prev.hist);
  if (cls.norm[0] || cls.hol[0]) hist[TODAY] = {n: cls.norm[0] ? cls.norm[0].price : 0, h: cls.hol[0] ? cls.hol[0].price : 0};
  for (const k of Object.keys(hist).sort().slice(0, -120)) delete hist[k];
  const record = {checkedAt: new Date().toISOString(), cands, srcUrls, hist, alerted: Object.assign({n: '', h: ''}, prev && prev.alerted)};
  if (ow) record.ow = ow;
  if (hint) record.hint = hint;
  return {record, cls, read};
}

/* ===================== alerts ===================== */
const KIND = {n: ['norm', 'target', '공휴일 아닌 일정'], h: ['hol', 'targetHol', '일본 공휴일 낀 일정']};
function findHits(r, cls, record) {
  const hits = [];
  for (const k of ['n', 'h']) {
    const [list, field, label] = KIND[k];
    const target = C.posNum(r[field]), best = cls[list][0];
    const hit = r.on !== false && target && best && best.price <= target;
    const key = hit ? [best.price, best.dep, best.ret].join('|') : '';
    if (hit) hits.push({k, route: r, label, target, deal: best, key, fresh: record.alerted[k] !== key});
    else record.alerted[k] = '';   // back above the target: the next drop alerts again
  }
  return hits;
}
function hitText(h) {
  const r = h.route, d = h.deal;
  const lines = [`[최저가 알림] ${C.routeLabel(r)} ${C.tripLabel(r)}, ${h.label}`,
    `${C.won(d.price)}원 (목표 ${C.won(h.target)}원${d.price < h.target ? `보다 ${C.won(h.target - d.price)}원 싸요` : ''})`];
  if (d.legs) {
    for (const x of d.legs) {
      const jp = C.isJP(x.from) && C.isJP(x.to);
      lines.push(`${C.md(x.dep)} ${C.place(x.from).ko}→${C.place(x.to).ko} ${[x.airline, C.won(x.price) + '원'].filter(Boolean).join(' ')}`,
        `  ${C.L.skyscanner({from: x.from, to: x.to, dep: x.dep, ret: ''}, jp)}`);
    }
  } else {
    const x = {from: d.from || C.code3(r.from), to: d.to || C.code3(r.to), dep: d.dep, ret: r.trip === 'ow' ? '' : d.ret};
    lines.push([d.airline, r.trip === 'ow' ? C.md(d.dep) + ' 출발' : C.span(d.dep, d.ret)].filter(Boolean).join(', '));
    if (d.hs && d.hs.length) lines.push(`${C.holText(d.hs)} 포함`);
    lines.push(`스카이스캐너 ${C.L.skyscanner(x, C.isJP(x.from) && C.isJP(x.to))}`);
    if (!(C.isJP(x.from) && C.isJP(x.to))) lines.push(`네이버 항공권 ${C.L.naver(x)}`);
  }
  return lines.join('\n');
}
async function post(url, headers, body) {
  const res = await fetch(url, {method: 'POST', headers: Object.assign({'content-type': 'application/json'}, headers), body: JSON.stringify(body), signal: AbortSignal.timeout(30000)});
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
  return res;
}
/* sends to every channel that is set up; true when at least one went out */
async function notify(text, cfg) {
  const env = process.env, sent = [];
  const tryOne = async (name, fn) => { try { await fn(); sent.push(name); log(`  알림 보냄: ${name}`); } catch (e) { log(`  알림 실패 (${name}): ${e.message}`); } };
  const repo = env.GITHUB_REPOSITORY, token = env.GITHUB_TOKEN;
  if (repo && token && !(cfg.notify && cfg.notify.githubIssue === false)) {
    await tryOne('GitHub', async () => {
      const base = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
      const h = {authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'user-agent': 'fare-watch'};
      const owner = env.GITHUB_REPOSITORY_OWNER;
      const bodyText = text + (owner && !(cfg.notify && cfg.notify.mention === false) ? `\n\n@${owner}` : '');   // the mention is what makes GitHub push it to the owner
      const list = await fetch(`${base}/repos/${repo}/issues?state=open&per_page=50`, {headers: h, signal: AbortSignal.timeout(30000)}).then(r => (r.ok ? r.json() : []));
      const issue = Array.isArray(list) ? list.find(i => i && i.title === '최저가 알림' && !i.pull_request) : null;
      if (issue) await post(`${base}/repos/${repo}/issues/${issue.number}/comments`, h, {body: bodyText});
      else await post(`${base}/repos/${repo}/issues`, h, {title: '최저가 알림', body: bodyText});
    });
  }
  if (env.NTFY_TOPIC) {
    await tryOne('ntfy', () => post((env.NTFY_URL || 'https://ntfy.sh').replace(/\/+$/, '') + '/', {}, {topic: env.NTFY_TOPIC, title: '항공권 최저가 알림', message: text.slice(0, 3800), priority: 4, click: (text.match(/https:\/\/\S+/) || [])[0]}));
  }
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    await tryOne('텔레그램', () => post(`${(env.TELEGRAM_API_URL || 'https://api.telegram.org').replace(/\/+$/, '')}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {}, {chat_id: env.TELEGRAM_CHAT_ID, text: text.slice(0, 4000), disable_web_page_preview: true}));
  }
  return sent;
}

/* the yen rate: a public rate service when it answers, else the number in the config */
async function yenRate(cfg) {
  const fallback = C.posNum(cfg.fx && cfg.fx.jpy100) || 900;
  if (cfg.fx && cfg.fx.auto === false) return {jpy100: fallback, from: '설정값'};
  try {
    const res = await fetch(process.env.FX_URL || 'https://open.er-api.com/v6/latest/JPY', {signal: AbortSignal.timeout(15000)});
    const j = await res.json();
    const krw = j && j.rates && Number(j.rates.KRW);
    if (res.ok && krw > 4 && krw < 30) return {jpy100: Math.round(krw * 10000) / 100, from: 'open.er-api.com'};
  } catch (e) { /* fall through to the config value */ }
  return {jpy100: fallback, from: '설정값'};
}

/* ===================== run ===================== */
async function main() {
  const cfg = readJson('config.json', null);
  if (!cfg || !Array.isArray(cfg.routes)) throw Object.assign(new Error('data/config.json을 읽지 못했어요.'), {fatal: true});
  const routes = cfg.routes.filter(r => r && typeof r.id === 'string' && C.code3(r.from) && C.code3(r.to));
  const prices = readJson('prices.json', {}) || {};
  const status = {lastRunAt: new Date().toISOString(), schedule: C.str(cfg.scheduleText, 80), model: cfg.model || 'claude-haiku-5-5'};
  const errors = [];
  let fatal = '';
  if (!KEY) fatal = 'ANTHROPIC_API_KEY가 없어요. 저장소 Settings → Secrets and variables → Actions에 넣어 주세요.';
  const fx = await yenRate(cfg);
  cfg.jpy100 = fx.jpy100;
  status.fx = fx;
  log(`오늘 ${TODAY}, 노선 ${routes.length}개, 모델 ${status.model}, 100엔 ${fx.jpy100}원 (${fx.from})`);

  const allHits = [];
  let updated = 0;
  if (!fatal) {
    for (const r of routes) {
      log(`${C.routeLabel(r)} ${C.tripLabel(r)}`);
      try {
        const {record, cls} = await checkRoute(r, cfg, prices[r.id] || null, errors);
        if (record) prices[r.id] = record;
        if (cls) {
          updated++;
          const hits = findHits(r, cls, record);
          allHits.push(...hits);
          log(`  공휴일 아닌 일정 ${cls.norm[0] ? C.won(cls.norm[0].price) + '원' : '없음'}, 일본 공휴일 낀 일정 ${cls.hol[0] ? C.won(cls.hol[0].price) + '원' : '없음'}${hits.length ? `, 목표가 도달 ${hits.length}건` : ''}`);
        }
      } catch (e) {
        if (e.fatal) { fatal = e.message; break; }
        errors.push(`${C.routeLabel(r)}: ${String(e.message).slice(0, 160)}`);
      }
    }
    for (const id of Object.keys(prices)) if (!routes.some(r => r.id === id)) delete prices[id];   // routes taken off the list
  }

  const fresh = allHits.filter(h => h.fresh);
  if (fresh.length) {
    const appUrl = C.httpUrl(cfg.appUrl) || (process.env.GITHUB_REPOSITORY ? `https://${process.env.GITHUB_REPOSITORY.split('/')[0].toLowerCase()}.github.io/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : '');
    const text = fresh.map(hitText).join('\n\n') + (appUrl ? `\n\n앱에서 보기 ${appUrl}` : '');
    log('\n' + text + '\n');
    const sent = await notify(text, cfg);
    status.notified = sent;
    // remembered only once it went out somewhere, so a failed send is tried again at the next check
    if (sent.length) for (const h of fresh) prices[h.route.id].alerted[h.k] = h.key;
  }

  const hitLine = allHits.length ? `목표가 이하인 표가 ${allHits.length}건 있어요${fresh.length ? '' : ', 이미 알린 표예요'}.` : '목표가 이하인 표는 아직 없어요.';
  status.summary = fatal ? `가격을 확인하지 못했어요. ${fatal}`
    : !routes.length ? '보고 있는 노선이 없어요. 앱에서 노선을 추가해 주세요.'
    : updated ? `노선 ${updated}개를 확인했어요. ${hitLine}${routes.length > updated ? ` ${routes.length - updated}개는 값을 읽지 못했어요.` : ''}`
    : '가격 페이지를 하나도 읽지 못했어요. 실행 기록을 확인해 주세요.';
  status.hits = allHits.map(h => ({id: h.route.id, kind: h.k, price: h.deal.price, target: h.target, dep: h.deal.dep, ret: h.deal.ret || ''}));
  status.errors = errors.slice(0, 20);
  status.usage = usage;
  if (updated || !fatal) writeJson('prices.json', prices);
  writeJson('status.json', status);
  log(`\n${status.summary}`);
  if (errors.length) log('읽지 못한 곳:\n- ' + errors.join('\n- '));
  log(`API 사용: 요청 ${usage.calls}번, 입력 ${usage.input_tokens.toLocaleString('en-US')} 토큰, 출력 ${usage.output_tokens.toLocaleString('en-US')} 토큰`);
  if (fatal || (routes.length && !updated)) process.exitCode = 1;   // a failed run shows up in the Actions list and GitHub mails the owner
}
main().catch(e => { console.error(e.fatal ? e.message : e); process.exitCode = 1; });
