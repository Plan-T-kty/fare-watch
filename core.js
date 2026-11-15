/* Shared by the app page and by the price checker. Pure functions, no DOM. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FareCore = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
'use strict';

/* ===================== small helpers ===================== */
const pad = n => String(n).padStart(2, '0');
const won = n => Math.round(Number(n)).toLocaleString('ko-KR');
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const toD = s => { const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
const fromD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => fromD(new Date());
const todayIn = tz => new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const addDays = (s, n) => { const d = toD(s); d.setDate(d.getDate() + n); return fromD(d); };
const diffDays = (a, b) => Math.round((toD(b) - toD(a)) / 86400000);
const DOW = '일월화수목금토';
const md = s => {
  if (!isDate(s)) return '';
  const d = toD(s);
  const y = d.getFullYear() !== new Date().getFullYear() ? `${String(d.getFullYear()).slice(2)}년 ` : '';
  return `${y}${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
};
const span = (a, b) => `${md(a)}${b && b !== a ? ' – ' + md(b) : ''}`;
const stamp = iso => { const d = new Date(iso); if (!iso || isNaN(d)) return ''; return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const httpUrl = u => (typeof u === 'string' && /^https?:\/\//i.test(u)) ? u : '';
const posNum = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const code3 = v => String(v == null ? '' : v).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
const batchim = s => { const c = String(s).trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0; };
const iga = s => s + (batchim(s) ? '이' : '가');
const ieyo = s => s + (batchim(s) ? '이에요' : '예요');

/* ===================== places ===================== */
const AP = [
['SEL','서울','인천·김포 모두','Seoul','한국','인천 김포 seoul'],
['ICN','인천','인천공항만','Incheon','한국','서울 incheon'],
['GMP','김포','김포공항만','Gimpo','한국','서울 gimpo'],
['PUS','부산','김해공항','Busan','한국','김해 busan gimhae'],
['CJU','제주','','Jeju','한국','jeju'],
['TAE','대구','','Daegu','한국','daegu'],
['CJJ','청주','','Cheongju','한국','cheongju'],
['FUK','후쿠오카','','Fukuoka','일본','하카타 규슈 큐슈 福岡 hakata'],
['OKA','오키나와','나하공항','Okinawa','일본','나하 naha 沖縄 那覇'],
['KIX','오사카 간사이','','Osaka Kansai','일본','大阪 kansai'],
['OSA','오사카','간사이·이타미·고베 모두','Osaka','일본','大阪'],
['NRT','도쿄 나리타','','Tokyo Narita','일본','東京 narita'],
['HND','도쿄 하네다','','Tokyo Haneda','일본','東京 haneda'],
['TYO','도쿄','나리타·하네다 모두','Tokyo','일본','東京'],
['NGO','나고야','주부공항','Nagoya','일본','名古屋 chubu 중부'],
['CTS','삿포로','신치토세공항','Sapporo','일본','홋카이도 치토세 札幌 hokkaido'],
['KKJ','기타큐슈','','Kitakyushu','일본','北九州 고쿠라'],
['KOJ','가고시마','','Kagoshima','일본','鹿児島'],
['KMJ','구마모토','','Kumamoto','일본','熊本'],
['NGS','나가사키','','Nagasaki','일본','長崎'],
['OIT','오이타','','Oita','일본','벳푸 유후인 大分'],
['HSG','사가','','Saga','일본','佐賀'],
['KMI','미야자키','','Miyazaki','일본','宮崎'],
['MYJ','마쓰야마','','Matsuyama','일본','松山 에히메'],
['TAK','다카마쓰','','Takamatsu','일본','高松 가가와'],
['HIJ','히로시마','','Hiroshima','일본','広島'],
['OKJ','오카야마','','Okayama','일본','岡山'],
['YGJ','요나고','','Yonago','일본','돗토리 米子'],
['UBJ','우베','야마구치','Ube','일본','야마구치 宇部'],
['TKS','도쿠시마','','Tokushima','일본','徳島'],
['FSZ','시즈오카','','Shizuoka','일본','静岡'],
['KMQ','고마쓰','가나자와','Komatsu','일본','가나자와 小松'],
['TOY','도야마','','Toyama','일본','富山'],
['KIJ','니가타','','Niigata','일본','新潟'],
['SDJ','센다이','','Sendai','일본','仙台'],
['AOJ','아오모리','','Aomori','일본','青森'],
['AKJ','아사히카와','','Asahikawa','일본','旭川'],
['HKD','하코다테','','Hakodate','일본','函館'],
['ISG','이시가키','','Ishigaki','일본','石垣'],
['MMY','미야코지마','','Miyako','일본','宮古 미야코'],
['SHI','시모지시마','미야코','Shimojishima','일본','미야코 下地島'],
['UKB','고베','','Kobe','일본','神戸'],
['IBR','이바라키','','Ibaraki','일본','茨城'],
['TPE','타이베이','타오위안공항','Taipei','대만','대만 taiwan 타이페이'],
['TSA','타이베이 쑹산','','Taipei Songshan','대만','대만 송산'],
['KHH','가오슝','','Kaohsiung','대만','대만'],
['RMQ','타이중','','Taichung','대만','대만'],
['HKG','홍콩','','Hong Kong','홍콩',''],
['MFM','마카오','','Macau','마카오',''],
['PVG','상하이','푸둥공항','Shanghai','중국','상해'],
['PEK','베이징','서우두공항','Beijing','중국','북경'],
['TAO','칭다오','','Qingdao','중국','청도'],
['DLC','다롄','','Dalian','중국','대련'],
['YNJ','옌지','','Yanji','중국','연길'],
['HAN','하노이','','Hanoi','베트남',''],
['SGN','호찌민','','Ho Chi Minh City','베트남','호치민'],
['DAD','다낭','','Da Nang','베트남',''],
['CXR','나트랑','깜라인공항','Nha Trang','베트남','냐짱'],
['PQC','푸꾸옥','','Phu Quoc','베트남','푸쿠옥'],
['BKK','방콕','수완나품공항','Bangkok','태국',''],
['CNX','치앙마이','','Chiang Mai','태국',''],
['HKT','푸껫','','Phuket','태국','푸켓'],
['MNL','마닐라','','Manila','필리핀',''],
['CEB','세부','','Cebu','필리핀',''],
['KLO','보라카이','칼리보공항','Kalibo','필리핀','칼리보'],
['TAG','보홀','','Bohol','필리핀',''],
['CRK','클락','','Clark','필리핀',''],
['SIN','싱가포르','','Singapore','싱가포르',''],
['KUL','쿠알라룸푸르','','Kuala Lumpur','말레이시아',''],
['BKI','코타키나발루','','Kota Kinabalu','말레이시아',''],
['DPS','발리','','Bali','인도네시아','덴파사르'],
['GUM','괌','','Guam','미국령',''],
['SPN','사이판','','Saipan','미국령',''],
['ULN','울란바토르','','Ulaanbaatar','몽골',''],
['HNL','호놀룰루','','Honolulu','미국','하와이'],
['LAX','로스앤젤레스','','Los Angeles','미국','LA 엘에이'],
['SFO','샌프란시스코','','San Francisco','미국',''],
['JFK','뉴욕','JFK공항','New York','미국',''],
['YVR','밴쿠버','','Vancouver','캐나다',''],
['SYD','시드니','','Sydney','호주',''],
['LHR','런던','히스로공항','London','영국',''],
['CDG','파리','샤를드골공항','Paris','프랑스',''],
['FRA','프랑크푸르트','','Frankfurt','독일',''],
['FCO','로마','','Rome','이탈리아',''],
['BCN','바르셀로나','','Barcelona','스페인',''],
['IST','이스탄불','','Istanbul','튀르키예','터키'],
['DXB','두바이','','Dubai','아랍에미리트','']
].map(a => ({c: a[0], ko: a[1], sub: a[2], en: a[3], cc: a[4], keys: a[5]}));
const APMAP = Object.fromEntries(AP.map(a => [a.c, a]));
const place = c => { const k = code3(c); return APMAP[k] || {c: k, ko: k || '?', sub: k ? '직접 넣은 공항 코드' : '', en: k, cc: '', keys: ''}; };
const isJP = c => place(c).cc === '일본';
const isKR = c => place(c).cc === '한국';
const norm = s => String(s).toLowerCase().replace(/\s+/g, '');
function findPlaces(q) {
  const n = norm(q);
  if (!n) return [];
  const hits = [];
  for (const a of AP) {
    const h = [a.c, a.ko, a.en, a.sub, a.cc, a.keys].map(norm);
    let s = -1;
    if (h[0] === n) s = 0;
    else if (h[1].startsWith(n)) s = 1;
    else if (h[0].startsWith(n) || h[2].startsWith(n)) s = 2;
    else if (h.some(x => x.includes(n))) s = 3;
    if (s >= 0) hits.push([s, a]);
  }
  hits.sort((x, y) => x[0] - y[0]);
  const out = hits.slice(0, 8).map(x => x[1]);
  const raw = String(q).trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(raw) && !APMAP[raw]) out.push(place(raw));
  return out;
}

/* ===================== Japanese holidays ===================== */
const JPCACHE = {};
function jpYear(y) {
  if (JPCACHE[y]) return JPCACHE[y];
  const H = new Map();
  const key = (m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const nthMon = (m, n) => 1 + ((8 - new Date(y, m - 1, 1).getDay()) % 7) + 7 * (n - 1);
  const eq = base => Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  [[1, 1, '새해 첫날'], [1, nthMon(1, 2), '성인의 날'], [2, 11, '건국기념일'], [2, 23, '일왕 탄생일'],
   [3, eq(20.8431), '춘분의 날'], [4, 29, '쇼와의 날'], [5, 3, '헌법기념일'], [5, 4, '녹색의 날'], [5, 5, '어린이날'],
   [7, nthMon(7, 3), '바다의 날'], [8, 11, '산의 날'], [9, nthMon(9, 3), '경로의 날'], [9, eq(23.2488), '추분의 날'],
   [10, nthMon(10, 2), '스포츠의 날'], [11, 3, '문화의 날'], [11, 23, '근로감사의 날']
  ].forEach(h => H.set(key(h[0], h[1]), {name: h[2], legal: true}));
  const base = [...H.keys()].sort();
  for (const k of base) {            // a holiday on Sunday moves to the next free day
    if (toD(k).getDay() === 0) { let n = addDays(k, 1); while (H.has(n)) n = addDays(n, 1); H.set(n, {name: '대체휴일', legal: true}); }
  }
  for (const k of base) {            // a day between two holidays is a holiday
    const mid = addDays(k, 1), nx = addDays(k, 2);
    if (!H.has(mid) && base.includes(nx)) H.set(mid, {name: '국민의 휴일', legal: true});
  }
  [[12, 29], [12, 30], [12, 31], [1, 2], [1, 3]].forEach(a => { const k = key(a[0], a[1]); if (!H.has(k)) H.set(k, {name: '연말연시', legal: false}); });
  [[8, 13], [8, 14], [8, 15], [8, 16]].forEach(a => { const k = key(a[0], a[1]); if (!H.has(k)) H.set(k, {name: '오봉', legal: false}); });
  return (JPCACHE[y] = H);
}
const jpDay = s => isDate(s) ? (jpYear(Number(s.slice(0, 4))).get(s) || null) : null;
function jpInSpan(a, b) {
  const out = [];
  if (!isDate(a)) return out;
  const end = isDate(b) && b >= a ? b : a;
  let d = a;
  for (let i = 0; i < 62 && d <= end; i++, d = addDays(d, 1)) { const h = jpDay(d); if (h) out.push({date: d, name: h.name}); }
  return out;
}
function groupDays(list) {
  const g = [];
  for (const h of list) {
    const last = g[g.length - 1];
    if (last && last.name === h.name && addDays(last.end, 1) === h.date) last.end = h.date;
    else g.push({name: h.name, start: h.date, end: h.date});
  }
  return g;
}
function holText(hs) {
  const g = groupDays(hs);
  const parts = g.slice(0, 2).map(x => `${span(x.start, x.end)} ${x.name}`);
  return parts.join(', ') + (g.length > 2 ? ` 외 ${g.length - 2}건` : '');
}
/* runs of days off in Japan (weekend or holiday) that contain at least one holiday */
function jpBlocks(from, limit) {
  const out = [];
  let d = from, run = null;
  for (let i = 0; i < 430 && out.length < limit; i++, d = addDays(d, 1)) {
    const dow = toD(d).getDay(), h = jpDay(d);
    if (h || dow === 0 || dow === 6) {
      if (!run) run = {start: d, end: d, names: []};
      run.end = d;
      if (h && !run.names.includes(h.name)) run.names.push(h.name);
    } else { if (run && run.names.length) out.push(run); run = null; }
  }
  return out;
}
const blockTrip = (b, nights) => ({dep: b.start, ret: b.end > b.start ? b.end : addDays(b.start, Math.max(1, nights || 2))});

/* ===================== links to sites ===================== */
const SKY = {SEL: 'sela', TYO: 'tyoa', OSA: 'osaa'};
const TRIPC = {ICN: 'sel', GMP: 'sel', NRT: 'tyo', HND: 'tyo', KIX: 'osa', ITM: 'osa', UKB: 'osa', CTS: 'spk', PVG: 'sha', PEK: 'bjs', TSA: 'tpe', DMK: 'bkk'};
const y6 = d => d.slice(2).replace(/-/g, '');
const y8 = d => d.replace(/-/g, '');
const L = {
  skyscanner(x, jp) {
    const o = (SKY[x.from] || x.from).toLowerCase(), d = (SKY[x.to] || x.to).toLowerCase();
    return `https://www.skyscanner.${jp ? 'jp' : 'co.kr'}/transport/flights/${o}/${d}/${y6(x.dep)}/${x.ret ? y6(x.ret) + '/' : ''}?adultsv2=1&cabinclass=economy&rtn=${x.ret ? 1 : 0}`;
  },
  naver(x) {
    if (isKR(x.from) && isKR(x.to)) return 'https://flight.naver.com/';
    return `https://flight.naver.com/flights/international/${x.from}-${x.to}-${y8(x.dep)}${x.ret ? `/${x.to}-${x.from}-${y8(x.ret)}` : ''}?adult=1&fareType=Y`;
  },
  google(x) {
    const nm = c => (['SEL', 'TYO', 'OSA'].includes(c) ? place(c).en : c);
    const q = `Flights from ${nm(x.from)} to ${nm(x.to)} on ${x.dep}${x.ret ? ` through ${x.ret}` : ' one way'}`;
    return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&hl=ko&gl=KR&curr=KRW`;
  },
  kayak(x) { return `https://www.kayak.co.kr/flights/${x.from}-${x.to}/${x.dep}${x.ret ? '/' + x.ret : ''}?sort=price_a`; },
  trip(x) {
    const o = (TRIPC[x.from] || x.from).toLowerCase(), d = (TRIPC[x.to] || x.to).toLowerCase();
    return `https://kr.trip.com/flights/showfarefirst?dcity=${o}&acity=${d}&ddate=${x.dep}${x.ret ? `&rdate=${x.ret}&triptype=rt` : '&triptype=ow'}&class=y&quantity=1&locale=ko-KR&curr=KRW`;
  },
  airtrip(x) {
    const city = c => ['SEL', 'TYO', 'OSA'].includes(c);
    return (isJP(x.from) && isJP(x.to) && !city(x.from) && !city(x.to)) ? `https://www.airtrip.jp/flight/${x.from}/${x.to}/` : 'https://www.airtrip.jp/';
  }
};
const AIRLINES = [
  ['제주항공', 'https://www.jejuair.net/', ['제주', 'jeju']],
  ['진에어', 'https://www.jinair.com/', ['진에어', 'jin air', 'jinair']],
  ['트리니티항공', 'https://www.trinityairways.com/', ['트리니티', '티웨이', 'trinity', 'tway']],
  ['이스타항공', 'https://www.eastarjet.com/', ['이스타', 'eastar']],
  ['에어서울', 'https://flyairseoul.com/', ['에어서울', 'air seoul']],
  ['에어부산', 'https://www.airbusan.com/', ['에어부산', 'air busan']],
  ['대한항공', 'https://www.koreanair.com/', ['대한항공', 'korean air']],
  ['아시아나항공', 'https://flyasiana.com/', ['아시아나', 'asiana']],
  ['에어로케이', 'https://www.aerok.com/', ['에어로케이', 'aero k', 'aerok']],
  ['피치', 'https://www.flypeach.com/', ['피치', 'peach']],
  ['스카이마크', 'https://www.skymark.co.jp/', ['스카이마크', 'skymark']],
  ['솔라시드에어', 'https://www.solaseedair.jp/', ['솔라시드', 'solaseed']],
  ['일본항공', 'https://www.jal.co.jp/', ['일본항공', 'jal']],
  ['전일본공수', 'https://www.ana.co.jp/', ['전일본', 'ana']]
];
function airlineSite(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return null;
  for (const a of AIRLINES) {
    for (const k of a[2]) {
      const ascii = /^[a-z ]+$/.test(k);
      if (ascii ? new RegExp('(^|[^a-z])' + k + '([^a-z]|$)').test(n) : n.includes(k)) return {n: a[0], u: a[1]};
    }
  }
  return null;
}

/* ===================== routes and found fares ===================== */
const isChain = r => !!r && r.trip === 'chain' && !!code3(r.via);
/* the flights a watched item is made of: one for a simple route, two or three for a trip that continues on */
function legsOf(r) {
  const f = code3(r.from), t = code3(r.to), v = code3(r.via);
  if (!isChain(r)) return [{from: f, to: t}];
  const legs = [{from: f, to: v}, {from: v, to: t}];
  if (r.back !== false) legs.push({from: t, to: f});
  return legs;
}
const routeLabel = r => isChain(r)
  ? `${place(r.from).ko} → ${place(r.via).ko} → ${place(r.to).ko}`
  : `${place(r.from).ko} → ${place(r.to).ko}`;
const tripLabel = r => isChain(r) ? (r.back !== false ? '이어 가기, 돌아오는 편 포함' : '이어 가기') : (r.trip === 'ow' ? '편도' : '왕복');

function readLeg(o) {
  if (!o || typeof o !== 'object') return null;
  const price = posNum(o.price);
  if (!price || !isDate(o.dep)) return null;
  return {price, dep: o.dep, airline: str(o.airline, 30), from: code3(o.from), to: code3(o.to), src: str(o.src, 20), jpy: posNum(o.jpy)};
}
function readDeal(o) {
  if (!o || typeof o !== 'object') return null;
  const price = posNum(o.price);
  if (!price) return null;
  let legs = null;
  if (Array.isArray(o.legs)) {
    legs = o.legs.slice(0, 4).map(readLeg);
    if (!legs.length || legs.some(x => !x)) return null;
  }
  return {
    price, airline: str(o.airline, 30),
    dep: isDate(o.dep) ? o.dep : (legs ? legs[0].dep : ''),
    ret: isDate(o.ret) ? o.ret : (legs ? legs[legs.length - 1].dep : ''),
    from: code3(o.from), to: code3(o.to), src: str(o.src, 20), legs
  };
}
/* split what a check found into trips with and without a Japanese holiday, cheapest first */
function classify(r, p, t) {
  t = t || today();
  const src = p && Array.isArray(p.cands) ? p.cands.slice(0, 60) : [];
  const chain = isChain(r), ow = r.trip === 'ow';
  const need = chain ? legsOf(r).length : 0;
  const list = [];
  const seen = new Set();
  for (const raw of src) {
    const d = readDeal(raw);
    if (!d || !d.dep || d.dep < t) continue;
    if (chain) { if (!d.legs || d.legs.length !== need) continue; }
    else if (d.legs) continue;
    if (!ow && (!d.ret || d.ret < d.dep)) continue;
    if (isDate(r.winFrom) && d.dep < r.winFrom) continue;
    if (isDate(r.winTo) && d.dep > r.winTo) continue;
    const k = chain ? d.legs.map(x => x.dep + x.airline + x.price).join('|') : [d.dep, ow ? '' : d.ret, d.airline, d.price].join('|');
    if (seen.has(k)) continue;
    seen.add(k);
    const hs = jpInSpan(d.dep, ow ? d.dep : d.ret);
    list.push(Object.assign(d, {hs, ret: ow ? '' : d.ret}));
  }
  list.sort((a, b) => a.price - b.price);
  return {norm: list.filter(x => !x.hs.length), hol: list.filter(x => x.hs.length)};
}
/* join one-way fares into trips whose dates follow on: a night or more at each stop,
   and not much longer than the planned stay */
function buildCombos(r, legDeals, t, perClass) {
  const legs = legsOf(r);
  if (!isChain(r) || !Array.isArray(legDeals) || legDeals.length !== legs.length) return [];
  t = t || today();
  const viaN = Math.max(1, Math.round(Number(r.viaNights) || 2));
  const stayN = Math.max(1, Math.round(Number(r.nights) || 3));
  const viaMax = viaN * 2 + 1, stayMax = stayN * 2 + 1;   // a stay may run to about twice the plan, never less than a night
  const clean = legDeals.map((list, i) => (Array.isArray(list) ? list : []).map(readLeg).filter(x => x && x.dep >= t)
    .map(x => Object.assign(x, {from: x.from || legs[i].from, to: x.to || legs[i].to})));
  const A = clean[0].filter(a => (!isDate(r.winFrom) || a.dep >= r.winFrom) && (!isDate(r.winTo) || a.dep <= r.winTo));
  const B = clean[1], C = legs.length === 3 ? clean[2] : null;
  const sets = [];
  for (const a of A) for (const b of B) {
    const g1 = diffDays(a.dep, b.dep);
    if (g1 < 1 || g1 > viaMax) continue;
    if (!C) { sets.push([a, b]); continue; }
    for (const c of C) { const g2 = diffDays(b.dep, c.dep); if (g2 >= 1 && g2 <= stayMax) sets.push([a, b, c]); }
  }
  const all = sets.map(ls => {
    const first = ls[0].dep, last = ls[ls.length - 1].dep;
    return {
      price: ls.reduce((s, x) => s + x.price, 0), dep: first, ret: last, airline: '구간 조합',
      from: legs[0].from, to: code3(r.to), src: '조합', legs: ls,
      off: Math.abs(diffDays(ls[0].dep, ls[1].dep) - viaN) + (ls[2] ? Math.abs(diffDays(ls[1].dep, ls[2].dep) - stayN) : 0),
      hol: jpInSpan(first, last).length > 0
    };
  }).sort((x, y) => x.price - y.price || x.off - y.off);
  const seen = new Set(), scored = [];   // one entry per pair of outer dates and airlines: the middle flight only shifts
  for (const x of all) {
    const k = [x.dep, x.ret, x.legs[0].airline, x.legs[x.legs.length - 1].airline].join('|');
    if (!seen.has(k)) { seen.add(k); scored.push(x); }
  }
  const pick = h => scored.filter(x => x.hol === h).slice(0, perClass || 6);
  return pick(false).concat(pick(true)).map(x => { const y = Object.assign({}, x); delete y.off; delete y.hol; return y; });
}

return {
  pad, won, isDate, toD, fromD, today, todayIn, addDays, diffDays, md, span, stamp, httpUrl, posNum, str, code3, batchim, iga, ieyo,
  AP, place, isJP, isKR, findPlaces,
  jpYear, jpDay, jpInSpan, groupDays, holText, jpBlocks, blockTrip,
  L, AIRLINES, airlineSite,
  isChain, legsOf, routeLabel, tripLabel, readLeg, readDeal, classify, buildCombos
};
});
