/* The page itself: what is drawn, what is saved, what happens on a tap. Shared rules are in core.js. */
(() => {
'use strict';

const F = window.FareCore;
const $ = (s, r = document) => r.querySelector(s);
if (!F) { $('#routes-notice').innerHTML = '<p class="banner">앱 파일을 다 불러오지 못했어요. 페이지를 다시 열어 주세요.</p>'; return; }
const {won, isDate, today, addDays, md, span, stamp, httpUrl, posNum, str, code3, iga, ieyo,
  place, isJP, findPlaces, jpDay, jpInSpan, groupDays, holText, jpBlocks, blockTrip, L, airlineSite,
  isChain, legsOf, routeLabel, tripLabel, classify} = F;

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ext = (url, label, cls) => `<a class="${cls || 'btn line small'}" href="${esc(url)}">${esc(label)}</a>`;

function quickLinks(x, airline) {
  const out = [];
  const jp = isJP(x.from) && isJP(x.to);
  const air = airlineSite(airline);
  if (air) out.push([air.n + ' 공식', air.u]);
  out.push(['스카이스캐너', L.skyscanner(x, jp)]);
  if (!jp) out.push(['네이버 항공권', L.naver(x)]);
  out.push(['구글 항공편', L.google(x)]);
  if (jp) out.push(['에어트립', L.airtrip(x)]);
  else out.push(['카약', L.kayak(x)]);
  return out;
}
function legLinks(x) {
  const jp = isJP(x.from) && isJP(x.to);
  return jp ? [['스카이스캐너', L.skyscanner(x, true)], ['에어트립', L.airtrip(x)]] : [['스카이스캐너', L.skyscanner(x)], ['네이버', L.naver(x)]];
}

/* ===================== state ===================== */
const S = {
  mode: 'wait',        // wait | db | repo | local
  db: null, config: null,
  routes: [], prices: {}, status: null,
  loaded: false, confirmed: false, slow: false, err: '',
  ctx: null,
  openMore: new Set(),
  trends: {}
};
const sortedRoutes = () => S.routes.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
const dealCtx = (r, d) => ({from: d.from || code3(r.from), to: d.to || code3(r.to), dep: d.dep, ret: r.trip === 'ow' ? '' : d.ret});
/* dates to open the sites with when a check found nothing: one entry per flight */
function legDates(r, start) {
  const legs = legsOf(r);
  if (!isChain(r)) return [{from: legs[0].from, to: legs[0].to, dep: start, ret: r.trip === 'ow' ? '' : addDays(start, Math.max(1, Number(r.nights) || 3))}];
  const d2 = addDays(start, Math.max(1, Number(r.viaNights) || 2));
  const out = [{from: legs[0].from, to: legs[0].to, dep: start, ret: ''}, {from: legs[1].from, to: legs[1].to, dep: d2, ret: ''}];
  if (legs[2]) out.push({from: legs[2].from, to: legs[2].to, dep: addDays(d2, Math.max(1, Number(r.nights) || 3)), ret: ''});
  return out;
}
function planDates(r) {
  const t = today();
  return legDates(r, isDate(r.winFrom) && r.winFrom > t ? r.winFrom : addDays(t, 28));
}
function nextBlock(r) {
  const from = isDate(r.winFrom) && r.winFrom > today() ? r.winFrom : addDays(today(), 1);
  const list = jpBlocks(from, 1);
  return list.length ? list[0] : null;
}

/* ===================== render: routes ===================== */
function chipFor(deal, target) {
  if (!deal || !target) return '';
  if (deal.price <= target) return `<span class="chip go">목표가 도달${deal.price < target ? `, ${won(target - deal.price)}원 더 싸요` : ''}</span>`;
  return `<span class="chip plain">${won(deal.price - target)}원 더 내려가면 알림</span>`;
}
function trendHTML(id, hist, field, target, label) {
  if (!hist || typeof hist !== 'object') return '';
  const pts = Object.keys(hist).filter(isDate).map(d => [d, posNum(hist[d] && hist[d][field])]).filter(p => p[1]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-60);
  if (pts.length < 2) return '';
  const vals = pts.map(p => p[1]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const showT = target && target > lo * 0.6 && target < hi * 1.4;
  if (showT) { lo = Math.min(lo, target); hi = Math.max(hi, target); }
  const sp = (hi - lo) || hi * 0.1;
  lo -= sp * 0.2; hi += sp * 0.2;
  const W = 300, H = 44, X = i => i / (pts.length - 1) * W, Y = v => H - (v - lo) / (hi - lo) * H;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ');
  const lastTop = (Y(vals[vals.length - 1]) / H * 100).toFixed(1);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const cap = `${md(pts[0][0])}부터 ${pts.length}번 확인. 가장 쌀 때 ${won(mn)}원, 비쌀 때 ${won(mx)}원`;
  S.trends[id] = {pts, cap};
  return `<figure class="trend" data-trend="${esc(id)}" tabindex="0" aria-label="${esc(label + ' 최저가 흐름. ' + cap + '. 좌우 화살표로 날짜별 값을 볼 수 있어요.')}">
    <div class="plot">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${line} L${W} ${H} L0 ${H} Z"/><path class="ln" d="${line}"/></svg>
      ${showT ? `<div class="tl" style="top:${(Y(target) / H * 100).toFixed(1)}%"><span>목표</span></div>` : ''}
      <span class="dot" style="top:calc(${lastTop}% - 4px)"></span>
      <i class="xh" hidden></i>
    </div>
    <figcaption class="cap">${esc(cap)}</figcaption>
  </figure>`;
}
/* one row per flight of a trip that continues on, each with its own one-way search links */
function legRows(legs) {
  return `<ul class="legs">${legs.map(x => {
    const links = legLinks({from: x.from, to: x.to, dep: x.dep, ret: ''});
    const bits = [md(x.dep), x.airline, x.jpy ? won(x.jpy) + '엔' : ''].filter(Boolean).join(', ');
    return `<li><span class="lg-r">${esc(place(x.from).ko)} → ${esc(place(x.to).ko)}</span><span class="lg-p">${x.price ? won(x.price) + '원' : ''}</span>
      <span class="lg-d">${esc(bits)}</span><span class="lg-l">${links.map(l => ext(l[1], l[0], 'lk')).join('')}</span></li>`;
  }).join('')}</ul>`;
}
function fareBlock(r, p, kind, list, target, on) {
  const hol = kind === 'hol', chain = isChain(r);
  const title = hol ? '일본 공휴일 낀 일정' : '공휴일 아닌 일정';
  const d = list[0] || null;
  let body = '', links = [], legs = '', linkNote = '';
  if (d) {
    if (chain) {
      body = `<div class="fb-main"><p class="won">${won(d.price)}<small>원</small></p>
        <div class="who"><p>${d.legs.length}구간을 따로 살 때의 합계</p><p>${esc(span(d.dep, d.ret))}</p></div></div>`;
      legs = legRows(d.legs);
    } else {
      const dep = d.from && d.from !== code3(r.from) ? `${place(d.from).ko} 출발` : '';
      body = `<div class="fb-main"><p class="won">${won(d.price)}<small>원</small></p>
        <div class="who"><p>${esc([d.airline, dep].filter(Boolean).join(', '))}</p><p>${esc(r.trip === 'ow' ? md(d.dep) + ' 출발' : span(d.dep, d.ret))}</p></div></div>`;
      links = quickLinks(dealCtx(r, d), d.airline);
    }
    if (hol) body += `<p class="why">${esc(iga(holText(d.hs)))} 끼어 있어요.</p>`;
  } else {
    body = '<p class="none">최근 검색에 잡힌 표가 없어요.</p>';
    let plan = null;
    if (hol) {
      const b = nextBlock(r);
      if (b) {
        body += `<p class="why">다음 일본 공휴일은 ${esc(span(b.start, b.end))} ${esc(ieyo(b.names.join(', ')))}.</p>`;
        if (chain) plan = legDates(r, b.start);
        else { const tr = blockTrip(b, Number(r.nights) || 3); plan = [{from: code3(r.from), to: code3(r.to), dep: tr.dep, ret: r.trip === 'ow' ? '' : tr.ret}]; }
      }
    } else plan = planDates(r);
    if (plan && chain) {
      legs = legRows(plan.map(x => ({from: x.from, to: x.to, dep: x.dep, price: 0, airline: '', jpy: 0})));
      linkNote = '위 날짜로 열려요. 사이트에서 날짜를 바꿔 보세요.';
    } else if (plan) {
      links = quickLinks(plan[0], '');
      linkNote = `${r.trip === 'ow' ? md(plan[0].dep) : span(plan[0].dep, plan[0].ret)} 일정으로 열려요.${hol ? '' : ' 사이트에서 날짜를 바꿔 보세요.'}`;
    }
  }
  if (!target) {   // no target for this kind of trip: the person does not want it, so it gets one quiet line
    const now = d ? `지금 최저 ${won(d.price)}원${chain ? '' : ', ' + [d.airline, r.trip === 'ow' ? md(d.dep) + ' 출발' : span(d.dep, d.ret)].filter(Boolean).join(' ')}` : '';
    return `<section class="fb off${hol ? ' hol' : ''}">
      <div class="fb-top"><div><h4>${title}</h4><p class="goal">목표가를 비워 둬서 이 일정은 알리지 않아요.</p></div></div>
      ${now ? `<p class="cap">${esc(now)}</p>` : ''}
    </section>`;
  }
  const hit = !!(d && on && target && d.price <= target);
  return `<section class="fb${hol ? ' hol' : ''}${hit ? ' hit' : ''}">
    <div class="fb-top"><div><h4>${title}</h4><p class="goal">${target ? `목표 ${won(target)}원` : '목표가 없음, 알림 안 받아요'}</p></div>${chipFor(d, target)}</div>
    ${body}
    ${trendHTML(r.id + '-' + kind, p && p.hist, hol ? 'h' : 'n', target, title)}
    ${legs}
    ${links.length ? `<div class="btns">${links.map(l => ext(l[1], l[0])).join('')}</div>` : ''}
    ${linkNote ? `<p class="cap">${esc(linkNote)}</p>` : ''}
  </section>`;
}
function dealRows(r, list) {
  return list.map(d => {
    if (d.legs) {
      const path = d.legs.map(x => `${md(x.dep)} ${place(x.from).ko}→${place(x.to).ko}`).join(', ');
      return `<div class="deal"><span>${esc(span(d.dep, d.ret))}</span><span class="p">${won(d.price)}원</span>
        <span class="l"><span class="w">${esc(path)}${d.hs.length ? '. ' + esc(holText(d.hs)) : ''}</span></span></div>`;
    }
    const x = dealCtx(r, d);
    const jp = isJP(x.from) && isJP(x.to);
    return `<div class="deal"><span>${esc(r.trip === 'ow' ? md(d.dep) + ' 출발' : span(d.dep, d.ret))} <span class="w">${esc(d.airline)}</span></span><span class="p">${won(d.price)}원</span>
      <span class="l">${d.hs.length ? `<span class="w">${esc(holText(d.hs))}</span>` : ''}${ext(L.skyscanner(x, jp), '스카이스캐너', 'lk')}${jp ? '' : ext(L.naver(x), '네이버', 'lk')}</span></div>`;
  }).join('');
}
function tagHTML(r) {
  const to = place(r.to);
  const chain = isChain(r);
  const p = S.prices[r.id] || null;
  const cls = classify(r, p);
  const on = r.on !== false;
  const tN = posNum(r.target), tH = posNum(r.targetHol);
  const restN = cls.norm.slice(1, 6), restH = cls.hol.slice(1, 6);
  const mId = 'deals-' + r.id, hId = 'hist-' + r.id;
  let more = '';
  if (restN.length || restH.length) {
    more = `<details class="more" data-more="${esc(mId)}"${S.openMore.has(mId) ? ' open' : ''}><summary>다른 일정 ${restN.length + restH.length}건</summary><div class="in">
      ${restN.length ? `<h4>공휴일 아닌 일정</h4>${dealRows(r, restN)}` : ''}
      ${restH.length ? `<h4${restN.length ? ' style="margin-top:8px"' : ''}>일본 공휴일 낀 일정</h4>${dealRows(r, restH)}` : ''}
    </div></details>`;
  }
  let hist = '';
  const hk = p && p.hist && typeof p.hist === 'object' ? Object.keys(p.hist).filter(isDate).sort().reverse().slice(0, 30) : [];
  if (hk.length) {
    hist = `<details class="more" data-more="${esc(hId)}"${S.openMore.has(hId) ? ' open' : ''}><summary>날짜별 최저가 기록</summary><div class="in"><div class="tw"><table>
      <thead><tr><th>확인한 날</th><th class="r">공휴일 아닌 일정</th><th class="r">일본 공휴일 낀 일정</th></tr></thead>
      <tbody>${hk.map(k => { const v = p.hist[k] || {}; const n = posNum(v.n), h = posNum(v.h); return `<tr><td>${esc(md(k))}</td><td class="r">${n ? won(n) + '원' : '없음'}</td><td class="r">${h ? won(h) + '원' : '없음'}</td></tr>`; }).join('')}</tbody>
    </table></div></div></details>`;
  }
  const srcs = p && p.srcUrls && typeof p.srcUrls === 'object' ? Object.keys(p.srcUrls).slice(0, 5).map(k => { const u = httpUrl(p.srcUrls[k]); return u ? ext(u, str(k, 20), 'lk') : esc(str(k, 20)); }) : [];
  const foot = p && p.checkedAt
    ? `${esc(stamp(p.checkedAt))} 확인${srcs.length ? `, 출처 ${srcs.join(', ')}` : ''}. 검색 사이트에 최근 잡힌 값이라 좌석이 팔리면 달라져요.${!chain && p.ow && posNum(p.ow.price) ? ` 편도는 ${won(p.ow.price)}원부터 있어요${p.ow.airline ? `, ${esc(str(p.ow.airline, 30))}${isDate(p.ow.dep) ? ' ' + esc(md(p.ow.dep)) + ' 출발' : ''}` : ''}.` : ''}${p.hint ? ' ' + esc(str(p.hint, 200)) : ''}`
    : '아직 가격을 확인하지 않았어요. 다음 확인 때 채워져요.';
  return `<article class="tag">
    <div class="strip"><span class="hole" aria-hidden="true"></span><h3>${esc(routeLabel(r))}<span>${esc(tripLabel(r))}</span></h3>
      <button type="button" class="sw" role="switch" aria-checked="${on}" data-act="toggle" data-id="${esc(r.id)}"><i aria-hidden="true"></i>알림 ${on ? '켜짐' : '꺼짐'}</button></div>
    <div class="lead">
      <div class="code" aria-hidden="true">${esc(to.c)}</div>
      ${chain ? `<div class="viacode" aria-hidden="true"><span>${esc(place(r.via).c)}</span>거쳐서</div>` : ''}
      <button type="button" class="btn line small" data-act="edit" data-id="${esc(r.id)}">목표가·일정 바꾸기</button>
    </div>
    ${fareBlock(r, p, 'norm', cls.norm, tN, on)}
    ${fareBlock(r, p, 'hol', cls.hol, tH, on)}
    ${more}${hist}
    <p class="tagfoot">${foot}</p>
  </article>`;
}
function renderRoutes() {
  const box = $('#routes-list'), notice = $('#routes-notice');
  let n = '';
  if (S.mode === 'local') n = '<p class="banner">이 화면에서는 저장 기능을 쓸 수 없어요. 노선을 바꿔도 다시 열면 처음으로 돌아가요.</p>';
  else if (S.mode === 'repo' && !S.err && !tokenStore.get()) n = '<p class="banner">지금은 보기만 돼요. 노선을 추가하거나 바꾸려면 이 기기를 한 번 연결하세요.<button type="button" class="btn line small" data-act="connect">연결하기</button></p>';
  else if (S.err === 'revoked') n = '<p class="banner">이 화면의 데이터 연결이 끊겼어요. 페이지를 다시 열어 주세요.</p>';
  else if (S.err) n = '<p class="banner">노선을 불러오지 못했어요. 잠시 뒤 페이지를 다시 열어 주세요.</p>';
  else if (S.slow && !S.confirmed) n = `<p class="banner">${S.loaded ? '보이는 내용이 최신이 아닐 수 있어요. 연결되면 자동으로 바뀌어요.' : '아직 데이터에 닿지 못했어요. 연결되면 자동으로 보여요.'}</p>`;
  notice.innerHTML = n;
  S.trends = {};
  if (!S.loaded) { box.innerHTML = '<p class="note">노선을 불러오는 중이에요.</p>'; return; }
  const list = sortedRoutes();
  if (!list.length) {
    box.innerHTML = `<div class="sheet stack"><h3>보고 있는 노선이 없어요</h3><p class="note">노선과 목표가를 넣으면 가격을 확인할 때마다 여기에 최저가가 채워져요.</p>
      <div class="btns"><button type="button" class="btn line" data-act="add-preset" data-from="SEL" data-to="FUK">서울 → 후쿠오카 추가</button><button type="button" class="btn line" data-act="add-preset" data-from="SEL" data-to="OKA">서울 → 오키나와 추가</button></div></div>`;
    return;
  }
  box.innerHTML = list.map(tagHTML).join('');
}
function renderHead() {
  let latest = S.status && S.status.lastRunAt ? String(S.status.lastRunAt) : '';
  for (const k in S.prices) { const c = S.prices[k] && S.prices[k].checkedAt; if (c && String(c) > latest) latest = String(c); }
  const el = $('#last-check');
  if (S.mode === 'local') el.textContent = '저장 없이 보는 중';
  else if (!S.loaded) el.textContent = '가격 기록을 불러오는 중이에요';
  else el.textContent = latest && stamp(latest) ? `최근 가격 확인 ${stamp(latest)}` : '아직 가격을 확인하지 않았어요';
  const s = S.status || {};
  const schedule = str(s.schedule || (S.config && S.config.scheduleText) || '', 80);
  const repo = S.mode === 'repo';
  $('#how-auto').textContent = schedule
    ? (repo
      ? `${schedule}에 자동으로 가격을 확인해요. Claude API 크레딧으로 돌아가요. 알림이 켜진 노선이 목표가 이하로 내려오면 알림을 보내고, 이 화면에도 표시돼요. 목표가를 바꾸면 다음 확인부터 반영돼요.`
      : `Claude가 ${schedule}에 가격을 확인해요. 알림이 켜진 노선이 목표가 이하로 내려오면 Claude 앱 알림으로 알려 주고, 이 화면에도 표시돼요. 목표가를 바꾸면 다음 확인부터 반영돼요.`)
    : '날마다 자동으로 확인하는 기능은 아직 켜져 있지 않아요. Claude 대화창에서 켜 달라고 하면 매일 가격을 확인하고, 알림이 켜진 노선이 목표가 이하로 내려올 때 알려 줘요. 그 전에는 아래 문구를 보낼 때마다 확인해요.';
  const bits = [];
  if (s.lastRunAt && stamp(s.lastRunAt)) bits.push(`마지막 확인 ${stamp(s.lastRunAt)}${s.summary ? ': ' + str(s.summary, 220) : ''}`);
  if (Array.isArray(s.errors) && s.errors.length) bits.push(`읽지 못한 곳이 ${s.errors.length}곳 있어요. ${str(s.errors[0], 90)}${s.errors.length > 1 ? ' 등' : ''}.`);
  $('#run-line').textContent = bits.join(' ');
  $('#run-line').hidden = !bits.length;
  $('#ask-now').hidden = repo;
  $('#repo-set').hidden = !repo;
  if (repo) {
    $('#token-state').textContent = tokenStore.get() ? '이 기기는 연결돼 있어요. 노선을 바꿀 수 있어요.' : '아직 연결하지 않아서 지금은 보기만 할 수 있어요.';
    $('#run-now').hidden = !tokenStore.get();
    const rn = repoName().split('/')[1];
    if (rn) $('#repo-name').textContent = rn;
  }
}
function renderHolCal() {
  const rows = [];
  let d = today();
  const days = [];
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) { const h = jpDay(d); if (h) days.push({date: d, name: h.name}); }
  for (const g of groupDays(days)) rows.push(`<tr><td>${esc(span(g.start, g.end))}</td><td>${esc(g.name)}</td></tr>`);
  $('#hol-rows').innerHTML = rows.join('');
}

/* ===================== render: sites ===================== */
const GROUPS = [
  {title: '가격 비교', sub: '여러 판매처 값을 한 번에 보여 주는 검색 사이트예요. 여기서 찾고 결제는 아래 항공사나 여행사에서 하세요.', sites: [
    {n: '스카이스캐너', g: 'pick', t: '한 달 치 최저가를 한눈에 보기 좋아요. 결과에 뜨는 판매처는 맨 아래 뺀 곳 목록과 견줘 고르세요.', u: x => L.skyscanner(x)},
    {n: '네이버 항공권', g: 'pick', t: '국내 여행사 값과 카드 할인가가 같이 나와요.', u: x => L.naver(x)},
    {n: '구글 항공편', g: 'pick', t: '날짜별 가격 그래프가 편하고 항공사 공식 사이트로 가는 링크가 함께 나와요.', u: x => L.google(x)},
    {n: '카약', g: 'pick', t: '이 앱이 가격을 읽어 오는 곳이에요.', u: x => L.kayak(x)}
  ]},
  {title: '항공사 공식', sub: '취소와 변경을 항공사와 바로 처리할 수 있어 가장 안전해요. 특가도 여기서 먼저 열려요. 운항 노선은 2026년 11월 카약 노선 정보 기준이에요.', sites: [
    {n: '제주항공', g: 'pick', t: '서울–후쿠오카, 서울–오키나와', u: 'https://www.jejuair.net/'},
    {n: '진에어', g: 'pick', t: '서울–후쿠오카, 서울–오키나와', u: 'https://www.jinair.com/'},
    {n: '트리니티항공', g: 'pick', t: '옛 티웨이항공이에요. 서울–후쿠오카, 서울–오키나와', u: 'https://www.trinityairways.com/'},
    {n: '이스타항공', g: 'pick', t: '서울–후쿠오카, 서울–오키나와', u: 'https://www.eastarjet.com/'},
    {n: '에어서울', g: 'pick', t: '서울–후쿠오카', u: 'https://flyairseoul.com/'},
    {n: '에어부산', g: 'pick', t: '부산·서울–후쿠오카', u: 'https://www.airbusan.com/'},
    {n: '대한항공', g: 'pick', t: '서울–후쿠오카, 서울–오키나와', u: 'https://www.koreanair.com/'},
    {n: '아시아나항공', g: 'pick', t: '2026년 12월 17일에 대한항공과 합쳐질 예정이에요.', u: 'https://flyasiana.com/'}
  ]},
  {title: '국내 여행사', sub: '한국어로 상담할 수 있는 국내 사업자예요. 발권과 취소 수수료는 결제 전에 확인하세요.', sites: [
    {n: '인터파크투어', g: 'ok', t: '', u: 'https://travel.interpark.com/'},
    {n: '하나투어', g: 'ok', t: '', u: 'https://www.hanatour.com/'},
    {n: '모두투어', g: 'ok', t: '', u: 'https://www.modetour.com/'},
    {n: '마이리얼트립', g: 'ok', t: '', u: 'https://www.myrealtrip.com/'}
  ]},
  {title: '해외 예약 사이트', sub: '싸게 나올 때가 많지만 취소와 환불 분쟁이 잦은 편이에요. 환불 규정을 읽고 결제하세요.', sites: [
    {n: '트립닷컴', g: 'care', t: '한국어 상담은 되지만 한국소비자원 집계에서 아고다와 합쳐 상담이 2,778건에서 5,559건으로 늘었어요.', u: x => L.trip(x)},
    {n: '아고다', g: 'care', t: '위 집계에 함께 들어 있어요.', u: 'https://www.agoda.com/ko-kr/flights'},
    {n: '익스피디아', g: 'ok', t: '2022년 한국소비자원 조사에서 8곳 가운데 혼자 변경·취소·환불 정보를 제대로 표시했어요.', u: 'https://www.expedia.co.kr/Flights'}
  ]},
  {title: '일본 사이트', sub: '일본어 화면에 엔화로 결제해요. 후쿠오카–오키나와 같은 일본 국내선을 찾을 때 쓸모 있어요.', sites: [
    {n: '트래블코 (トラベルコ)', g: 'ok', t: '일본의 여행 가격 비교 사이트예요. 운영사 오픈도어는 도쿄증권거래소 상장사예요.', u: x => (isJP(x.from) && isJP(x.to)) ? 'https://www.tour.ne.jp/j_air/' : 'https://www.tour.ne.jp/w_air/'},
    {n: '스카이스캐너 일본판', g: 'ok', t: '엔화 가격으로 보여 줘요.', u: x => L.skyscanner(x, true)},
    {n: '에어트립 (エアトリ)', g: 'ok', t: '도쿄증권거래소 프라임 상장사예요. 표시가에 수수료와 제비용이 따로 붙어요.', u: x => L.airtrip(x)},
    {n: '스카이티켓 (スカイチケット)', g: 'ok', t: '저비용항공사까지 일본 국내선을 한 번에 찾아 줘요.', u: 'https://skyticket.jp/'},
    {n: '라쿠텐 트래블 (楽天トラベル)', g: 'ok', t: '', u: 'https://travel.rakuten.co.jp/'},
    {n: '스카이마크', g: 'pick', t: '후쿠오카–오키나와 국내선 공식', u: 'https://www.skymark.co.jp/'},
    {n: '피치', g: 'pick', t: '후쿠오카–오키나와 국내선 공식', u: 'https://www.flypeach.com/'},
    {n: '솔라시드에어', g: 'pick', t: '후쿠오카–오키나와 국내선 공식', u: 'https://www.solaseedair.jp/'},
    {n: '일본항공', g: 'pick', t: '', u: 'https://www.jal.co.jp/'},
    {n: '전일본공수', g: 'pick', t: '', u: 'https://www.ana.co.jp/'}
  ]},
  {title: '배 예약', sub: '배는 선사 공식 사이트가 기본이에요. 일본 국내 페리는 윌러 트래블에서 한국어로 예약할 수 있어요.', sites: [
    {n: '윌러 트래블', g: 'ok', t: '고속버스 윌러 익스프레스를 운영하는 일본 회사의 예약 사이트예요. 가고시마–오키나와 같은 일본 국내 페리를 한국어로 예약해요.', u: 'https://willer-travel.com/ko/ferry/'},
    {n: '고려훼리', g: 'pick', t: '부산–후쿠오카 뉴카멜리아 공식', u: 'https://www.koreaferry.co.kr/rs/idv/reservation'},
    {n: '마루에이페리', g: 'pick', t: '가고시마–오키나와 공식 예약. 일본어 화면이에요.', u: 'https://ferry.smaku.app/'},
    {n: '팬스타', g: 'pick', t: '부산–오사카, 부산–대마도 공식', u: 'https://www.panstarcruise.com/?lang=ko'},
    {n: '부관훼리', g: 'pick', t: '부산–시모노세키 공식', u: 'https://www.pukwan.co.kr/'}
  ]},
  {title: '이 앱에서 뺀 곳', sub: '사기라는 뜻이 아니에요. 한국소비자원이 환불이나 약관 문제를 짚었거나 그와 같은 계열이라 링크를 걸지 않았어요. 가격 비교 결과에 이 이름이 최저가로 떠도 건너뛰길 권해요.', sites: [
    {n: '키위닷컴', g: 'out', t: '약관에서 환불을 10유로나 기한이 있는 적립금으로 제한했고 소비자원의 개선 권고를 받아들이지 않았어요.'},
    {n: '고투게이트', g: 'out', t: '항공사 사정으로 취소돼도 수수료를 따로 받는 약관이 있었고, 연락이 닿지 않는다는 지적을 받았어요.'},
    {n: '마이트립', g: 'out', t: '고투게이트와 같은 이트래블리 그룹 브랜드라 같은 기준으로 뺐어요.'},
    {n: '이드림스', g: 'out', t: '약관에 항공권은 환불되지 않는다는 일반 조항이 있었어요.'},
    {n: '버짓에어', g: 'out', t: '위와 같은 조항이 있었어요.'},
    {n: '트래블제니오', g: 'out', t: '위와 같은 조항이 있었어요.'}
  ]}
];
const GRADE = {pick: ['go', '추천'], ok: ['plain', '이용 가능'], care: ['hold', '주의'], out: ['stop', '제외']};
function ctxOptions() {
  const list = [], seen = new Set();
  const add = o => { if (!seen.has(o.key)) { seen.add(o.key); list.push(o); } };
  for (const r of sortedRoutes()) {
    if (isChain(r)) legsOf(r).forEach(g => add({key: `${g.from}|${g.to}|ow`, from: g.from, to: g.to, trip: 'ow', nights: 3, r: null}));
    else add({key: [code3(r.from), code3(r.to), r.trip === 'ow' ? 'ow' : 'rt'].join('|'), from: code3(r.from), to: code3(r.to), trip: r.trip === 'ow' ? 'ow' : 'rt', nights: Number(r.nights) || 3, r});
  }
  if (!list.length) {
    add({key: 'SEL|FUK|rt', from: 'SEL', to: 'FUK', trip: 'rt', nights: 3, r: null});
    add({key: 'SEL|OKA|rt', from: 'SEL', to: 'OKA', trip: 'rt', nights: 4, r: null});
  }
  return list;
}
function setCtxFromOption(o, dates) {
  let dep, ret;
  if (dates) { dep = dates.dep; ret = dates.ret; }
  else {
    const cls = o.r ? classify(o.r, S.prices[o.r.id]) : {norm: [], hol: []};
    const best = [cls.norm[0], cls.hol[0]].filter(Boolean).sort((a, b) => a.price - b.price)[0];
    if (best) { dep = best.dep; ret = best.ret; }
    else { dep = addDays(today(), 28); ret = addDays(dep, o.nights); }
  }
  S.ctx = {key: o.key, from: o.from, to: o.to, trip: o.trip, nights: o.nights, dep, ret: o.trip === 'ow' ? '' : (ret || addDays(dep, o.nights)), auto: !dates};
}
let ctxSig = '';
function renderSites() {
  const opts = ctxOptions();
  if (!S.ctx || !opts.some(o => o.key === S.ctx.key)) setCtxFromOption(opts[0]);
  else if (S.ctx.auto) setCtxFromOption(opts.find(o => o.key === S.ctx.key));
  const sel = $('#ctx-route');
  const sig = opts.map(o => o.key).join(',');
  if (sig !== ctxSig) {
    sel.innerHTML = opts.map(o => `<option value="${esc(o.key)}">${esc(place(o.from).ko)} → ${esc(place(o.to).ko)}, ${o.trip === 'ow' ? '편도' : '왕복'}</option>`).join('');
    ctxSig = sig;
  }
  sel.value = S.ctx.key;
  const dep = $('#ctx-dep'), ret = $('#ctx-ret');
  if (document.activeElement !== dep) dep.value = S.ctx.dep;
  dep.min = today();
  if (document.activeElement !== ret) ret.value = S.ctx.ret;
  ret.disabled = S.ctx.trip === 'ow';
  ret.min = S.ctx.dep;
  const hs = $('#ctx-hol');
  const blocks = jpBlocks(addDays(today(), 1), 10);
  const hsig = blocks.map(b => b.start + b.end).join(',');
  if (hs._sig !== hsig) {
    hs.innerHTML = '<option value="">고르면 가는 날과 오는 날이 채워져요</option>' + blocks.map((b, i) => `<option value="${i}">${esc(span(b.start, b.end))} ${esc(b.names.join(', '))}</option>`).join('');
    hs._sig = hsig;
  }
  hs._blocks = blocks;
  const picked = blocks.findIndex(b => { const tr = blockTrip(b, S.ctx.nights); return tr.dep === S.ctx.dep && (S.ctx.trip === 'ow' || tr.ret === S.ctx.ret); });
  if (document.activeElement !== hs) hs.value = picked >= 0 ? String(picked) : '';
  const x = {from: S.ctx.from, to: S.ctx.to, dep: S.ctx.dep, ret: S.ctx.ret};
  const inSpan = jpInSpan(x.dep, x.ret || x.dep);
  $('#ctx-note').textContent = `가격 비교 네 곳과 트립닷컴, 일본판 스카이스캐너는 이 일정이 들어간 채로 열려요. 나머지는 첫 화면으로 열려요. ${inSpan.length ? '이 일정에는 ' + iga(holText(inSpan)) + ' 끼어 있어요.' : '이 일정에는 일본 공휴일이 없어요.'}`;
  $('#site-groups').innerHTML = GROUPS.map(g => `<div class="grp"><h3>${esc(g.title)}</h3><p>${esc(g.sub)}</p>${g.sites.map(s => {
    const gr = GRADE[s.g];
    const url = typeof s.u === 'function' ? s.u(x) : s.u;
    return `<div class="site ${s.g}"><div class="nm"><b>${esc(s.n)}</b><span class="chip ${gr[0]}">${gr[1]}</span></div>${s.t ? `<div class="nt">${esc(s.t)}</div>` : ''}${url ? `<div class="op">${ext(url, '열기')}</div>` : ''}</div>`;
  }).join('')}</div>`).join('');
}

/* ===================== render: ferry ===================== */
const FERRY = [['2등 일반, 여럿이 쓰는 방', 150000], ['2등 침대', 170000], ['1등 화실·양실', 210000], ['특등 2~3인실', 280000], ['특등 1인실', 300000], ['특별실', 330000]];
function loadFerryPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem('fare-ferry') || 'null');
    if (v && typeof v === 'object') {
      if (posNum(v.rate)) $('#fy-rate').value = v.rate;
      if (v.kr >= 0 && v.kr !== null) $('#fy-fee-kr').value = v.kr;
      if (v.jp >= 0 && v.jp !== null) $('#fy-fee-jp').value = v.jp;
    }
  } catch (e) { /* storage can be missing */ }
}
function saveFerryPrefs() {
  try { localStorage.setItem('fare-ferry', JSON.stringify({rate: Number($('#fy-rate').value), kr: Number($('#fy-fee-kr').value), jp: Number($('#fy-fee-jp').value)})); } catch (e) { /* ignore */ }
}
function renderFerry() {
  const fare = FERRY[Number($('#fy-class').value) || 0][1];
  const rt = $('#fy-trip').value !== 'ow';
  const pax = Math.min(9, Math.max(1, Math.round(Number($('#fy-pax').value) || 1)));
  const rate = posNum($('#fy-rate').value) || 833;
  const kr = Math.max(0, Number($('#fy-fee-kr').value) || 0), jp = Math.max(0, Number($('#fy-fee-jp').value) || 0);
  const base = fare * (rt ? 2 : 1);
  const jpWon = rt ? Math.round(jp * rate / 100) : 0;
  const one = base + kr + jpWon;
  const rows = [
    ['운임' + (rt ? ', 편도 ' + won(fare) + '원씩 두 번' : ''), won(base) + '원'],
    ['부산 출발 부대비용', won(kr) + '원']
  ];
  if (rt) rows.push([`하카타 출발 부대비용 ${won(jp)}엔`, '약 ' + won(jpWon) + '원']);
  $('#fy-rows').innerHTML = rows.map(r => `<tr><td>${esc(r[0])}</td><td class="r">${esc(r[1])}</td></tr>`).join('') +
    `<tr class="total"><td>1인 합계</td><td class="r">${won(one)}원</td></tr>` +
    (pax > 1 ? `<tr><td>${pax}명 합계</td><td class="r">${won(one * pax)}원</td></tr>` : '');
  // next to the cheapest flight to Fukuoka on the watch list
  let flight = null;
  for (const r of sortedRoutes()) {
    if (isChain(r) || code3(r.to) !== 'FUK' || (rt ? r.trip === 'ow' : r.trip !== 'ow')) continue;
    const cls = classify(r, S.prices[r.id]);
    const b = [cls.norm[0], cls.hol[0]].filter(Boolean).sort((a, c) => a.price - c.price)[0];
    if (b && (!flight || b.price < flight.d.price)) flight = {r, d: b};
  }
  const vs = $('#fy-vs');
  if (flight) {
    const diff = one - flight.d.price;
    vs.innerHTML = `<div><span class="k">배, ${rt ? '왕복' : '편도'} 1인</span><span class="v">${won(one)}원</span><span class="d">부산까지 가는 값은 따로예요</span></div>
      <div><span class="k">비행기 최저, ${esc(place(flight.r.from).ko)} 출발 ${rt ? '왕복' : '편도'}</span><span class="v">${won(flight.d.price)}원</span><span class="d">${esc(flight.d.airline)} ${esc(rt ? span(flight.d.dep, flight.d.ret) : md(flight.d.dep))}</span></div>`;
    vs.insertAdjacentHTML('beforeend', `<p class="note" style="grid-column:1/-1">${diff > 0 ? `정가로는 비행기가 ${won(diff)}원 싸요. 배는 할인 운임이 나올 때나 짐이 많을 때 유리해요.` : `지금은 배가 ${won(-diff)}원 싸요.`}</p>`);
    vs.hidden = false;
  } else { vs.innerHTML = ''; vs.hidden = true; }
}

/* ===================== trend hover / keyboard readout ===================== */
function showPoint(fig, i) {
  const t = S.trends[fig.dataset.trend];
  if (!t) return;
  const n = t.pts.length;
  i = Math.max(0, Math.min(n - 1, i));
  fig._i = i;
  const xh = $('.xh', fig);
  xh.hidden = false;
  xh.style.left = (i / (n - 1) * 100) + '%';
  $('.cap', fig).textContent = `${md(t.pts[i][0])} 확인: ${won(t.pts[i][1])}원`;
}
function clearPoint(fig) {
  const t = S.trends[fig.dataset.trend];
  $('.xh', fig).hidden = true;
  fig._i = undefined;
  if (t) $('.cap', fig).textContent = t.cap;
}
function pointAt(e) {
  const plot = e.target.closest && e.target.closest('.plot');
  if (!plot) return;
  const fig = plot.closest('.trend'), t = S.trends[fig.dataset.trend];
  if (!t) return;
  const r = plot.getBoundingClientRect();
  showPoint(fig, Math.round((e.clientX - r.left) / r.width * (t.pts.length - 1)));
}
document.addEventListener('pointermove', pointAt);
document.addEventListener('pointerdown', pointAt);
document.addEventListener('pointerout', e => {
  const plot = e.target.closest && e.target.closest('.plot');
  if (plot && !(e.relatedTarget && plot.contains(e.relatedTarget)) && e.pointerType === 'mouse') clearPoint(plot.closest('.trend'));
});
document.addEventListener('keydown', e => {
  const fig = e.target.closest && e.target.closest('.trend');
  if (!fig || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
  const t = S.trends[fig.dataset.trend];
  if (!t) return;
  e.preventDefault();
  showPoint(fig, fig._i === undefined ? t.pts.length - 1 : fig._i + (e.key === 'ArrowLeft' ? -1 : 1));
});
document.addEventListener('focusout', e => { const fig = e.target.closest && e.target.closest('.trend'); if (fig) clearPoint(fig); });

/* ===================== the full airport list ===================== */
/* airports.js holds every airport with scheduled flights. It is fetched the first time someone searches,
   or at once when a watched route uses an airport that has no Korean name here. */
let airportsWait = null;
function loadAirports() {
  if (F.hasAllAirports()) return Promise.resolve(true);
  if (!airportsWait) airportsWait = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'airports.js';
    s.onload = () => { F.setAirports(window.FareAirports); resolve(F.hasAllAirports()); };
    s.onerror = () => { airportsWait = null; resolve(false); };
    document.head.appendChild(s);
  });
  return airportsWait;
}
const namesMissing = () => !F.hasAllAirports() && S.routes.some(r => [r.from, r.via, r.to].some(c => code3(c) && !place(c).iso));

/* ===================== render scheduling ===================== */
let queued = false;
function render() {
  if (namesMissing()) loadAirports().then(ok => { if (ok) render(); });
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    renderHead();
    renderRoutes();
    renderSites();
    renderFerry();
  });
}

/* ===================== toast ===================== */
let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3600);
}
function writeErr(e) {
  const c = e && e.code;
  if (c === 'invalid_argument' || c === 'not_granted') return '이 화면에서는 바꿀 권한이 없어요.';
  if (c === 'quota_exceeded') return '저장 공간이 가득 찼어요. 안 쓰는 노선을 지워 주세요.';
  if (c === 'resource_exhausted') return '요청이 너무 잦아요. 잠시 뒤 다시 눌러 주세요.';
  if (c === 'revoked') return '데이터 연결이 끊겼어요. 페이지를 다시 열어 주세요.';
  return '저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요.';
}

/* ===================== the copy kept in a GitHub repository ===================== */
/* There the watch list is data/config.json and a daily job writes data/prices.json and data/status.json. */
const tokenStore = {
  get() { try { return localStorage.getItem('fare-token') || ''; } catch (e) { return ''; } },
  set(v) { try { if (v) localStorage.setItem('fare-token', v); else localStorage.removeItem('fare-token'); localStorage.removeItem('fare-user'); } catch (e) { /* ignore */ } }
};
async function loadJson(path) {
  const r = await fetch(path + '?t=' + Date.now(), {cache: 'no-store'});
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}
function useConfig(cfg) {
  S.config = cfg;
  S.routes = Array.isArray(cfg.routes) ? cfg.routes.filter(r => r && typeof r.id === 'string') : [];
}
async function repoLoad(cfg) {
  useConfig(cfg || await loadJson('data/config.json'));
  try { const p = await loadJson('data/prices.json'); S.prices = p && typeof p === 'object' ? p : {}; } catch (e) { S.prices = {}; }
  try { S.status = await loadJson('data/status.json'); } catch (e) { S.status = null; }
  S.loaded = true; S.confirmed = true;
  render();
}
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const unb64 = s => decodeURIComponent(escape(atob(String(s).replace(/\s/g, ''))));
function repoName() {
  if (S.config && typeof S.config.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(S.config.repo)) return S.config.repo;
  const m = /^([\w-]+)\.github\.io$/.exec(location.hostname), seg = location.pathname.split('/').filter(Boolean)[0];
  return m && seg && /^[\w.-]+$/.test(seg) ? `${m[1]}/${seg}` : '';
}
async function repoRunNow() {
  const repo = repoName(), token = tokenStore.get();
  if (!repo || !token) { toast('먼저 편집용 토큰을 넣어 주세요.'); return; }
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/check.yml/dispatches`, {method: 'POST', headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json'}, body: JSON.stringify({ref: (S.config && S.config.branch) || 'main'})});
    if (r.status === 204) toast('가격 확인을 시작했어요. 몇 분 뒤에 이 화면을 다시 열어 보세요.');
    else if (r.status === 401 || r.status === 403 || r.status === 404) toast('이 토큰으로는 확인을 시작할 수 없어요. 토큰에 Actions 쓰기 권한을 넣어 주세요.');
    else toast('확인을 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
  } catch (e) { toast('확인을 시작하지 못했어요. 연결을 확인하고 다시 눌러 주세요.'); }
}
/* who the token belongs to, for the name on commits made from this page */
async function whoAmI(token) {
  try { const v = JSON.parse(localStorage.getItem('fare-user') || 'null'); if (v && v.login && v.id) return v; } catch (e) { /* ask again */ }
  try {
    const r = await fetch('https://api.github.com/user', {headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json'}, cache: 'no-store'});
    const j = r.ok ? await r.json() : null;
    if (!j || !j.login || !j.id) return null;
    const v = {login: String(j.login), id: Number(j.id)};
    try { localStorage.setItem('fare-user', JSON.stringify(v)); } catch (e) { /* not kept, asked again next time */ }
    return v;
  } catch (e) { return null; }
}
async function repoSave(mutate, message) {
  const repo = repoName();
  const token = tokenStore.get();
  if (!repo || !token) { toast('바꾸려면 아래 편집용 토큰을 먼저 넣어 주세요.'); return false; }
  const api = `https://api.github.com/repos/${repo}/contents/data/config.json`;
  const h = {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json'};
  try {
    const cur = await fetch(api, {headers: h, cache: 'no-store'});
    if (cur.status === 401 || cur.status === 403 || cur.status === 404) { toast('토큰이 맞지 않거나 이 저장소에 쓸 권한이 없어요. 토큰을 다시 넣어 주세요.'); return false; }
    if (!cur.ok) throw new Error('read ' + cur.status);
    const meta = await cur.json();
    const cfg = JSON.parse(unb64(meta.content));
    if (!Array.isArray(cfg.routes)) cfg.routes = [];
    mutate(cfg.routes);
    // the commit is signed with GitHub's private address for the account, so the real email never lands in a public repository
    const me = await whoAmI(token), owner = repo.split('/')[0];
    const signer = me ? {name: me.login, email: `${me.id}+${me.login}@users.noreply.github.com`} : {name: owner, email: `${owner}@users.noreply.github.com`};
    const put = await fetch(api, {method: 'PUT', headers: Object.assign({'Content-Type': 'application/json'}, h), body: JSON.stringify({message, content: b64(JSON.stringify(cfg, null, 2) + '\n'), sha: meta.sha, committer: signer, author: signer})});
    if (!put.ok) throw new Error('write ' + put.status);
    useConfig(cfg);
    render();
    return true;
  } catch (e) { toast('저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요.'); return false; }
}

/* on the repository copy, a device that is not connected yet cannot save: show how to connect instead */
const needConnect = () => S.mode === 'repo' && !tokenStore.get();
function openConnect() {
  if (location.hash && location.hash !== '#routes') location.hash = '#routes';
  const box = $('#repo-set');
  box.open = true;
  setTimeout(() => box.scrollIntoView({block: 'start'}), 60);
  toast('이 기기에서 노선을 바꾸려면 먼저 한 번 연결해야 해요. 아래 순서대로 하면 돼요.');
}

/* ===================== data writes ===================== */
async function putRoute(id, data, isNew) {
  if (S.mode === 'db') {
    try {
      if (isNew) await S.db.doc('routes/' + id).set(data); else await S.db.doc('routes/' + id).update(data);
      return true;
    } catch (e) { toast(writeErr(e)); return false; }
  }
  const apply = routes => {
    const i = routes.findIndex(r => r.id === id);
    if (i >= 0) routes[i] = Object.assign({}, routes[i], data); else routes.push(Object.assign({id}, data));
  };
  if (S.mode === 'repo') return repoSave(apply, isNew ? '노선 추가' : '노선 설정 변경');
  apply(S.routes);
  render();
  return true;
}
async function dropRoute(id) {
  if (S.mode === 'db') {
    try {
      await S.db.doc('routes/' + id).delete();
      try { await S.db.doc('prices/' + id).delete(); } catch (e) { /* the price record is cleaned up at the next check */ }
      return true;
    } catch (e) { toast(writeErr(e)); return false; }
  }
  if (S.mode === 'repo') return repoSave(routes => { const i = routes.findIndex(r => r.id === id); if (i >= 0) routes.splice(i, 1); }, '노선 삭제');
  S.routes = S.routes.filter(r => r.id !== id);
  delete S.prices[id];
  render();
  return true;
}
async function dropPrices(id) {
  if (S.mode === 'db') { try { await S.db.doc('prices/' + id).delete(); } catch (e) { /* refreshed at the next check */ } }
  else { delete S.prices[id]; render(); }
}

/* ===================== airport picker ===================== */
function makePicker(host, cfg) {
  let value = '';
  const api = {get: () => value, set(v) { value = code3(v); draw(); }};
  function draw() {
    if (value) {
      const p = place(value);
      host.innerHTML = `<div class="picked"><span><b>${esc(p.ko)}</b> <span class="c">${esc(p.c)}</span> <span class="cc">${esc(p.sub)}</span></span><button type="button" class="btn line small" data-pk="clear">${cfg.optional ? '빼기' : '바꾸기'}</button></div>`;
    } else {
      host.innerHTML = `<input type="search" id="${cfg.id}" autocomplete="off" aria-labelledby="${cfg.label}" placeholder="${esc(cfg.placeholder || '도시, 나라, 공항 코드로 찾기. 예: 삿포로, FUK')}">
        <div class="quick">${cfg.quick.map(c => `<button type="button" data-pk="set" data-code="${c}">${esc(place(c).ko)}</button>`).join('')}</div>
        <div class="opts" hidden></div>`;
    }
  }
  function fill(q) {
    const box = $('.opts', host);
    if (!box) return;
    if (!String(q).trim()) { box.hidden = true; box.innerHTML = ''; return; }
    const ready = F.hasAllAirports();
    // the first search fetches the full list, then shows the results again
    if (!ready) loadAirports().then(ok => { const i = $('input', host); if (ok && i && i.value === q) fill(q); });
    const list = findPlaces(q);
    box.hidden = false;
    box.innerHTML = (list.length
      ? list.map(a => `<button type="button" data-pk="set" data-code="${esc(a.c)}"><span><b>${esc(a.ko)}</b><span class="cc">${esc([a.sub, a.cc].filter(Boolean).join(', '))}</span></span><span class="c">${esc(a.c)}</span></button>`).join('')
      : (ready ? '<p class="note" style="padding:10px 12px">찾지 못했어요. 한글 이름이 없는 공항은 영어 이름이나 공항 코드 세 글자로 찾을 수 있어요. 예: Hobart, HBA</p>' : ''))
      + (ready ? '' : '<p class="note" style="padding:10px 12px">전 세계 공항 목록을 불러오는 중이에요.</p>');
  }
  host.addEventListener('click', e => {
    const b = e.target.closest('[data-pk]');
    if (!b) return;
    if (b.dataset.pk === 'clear') { value = ''; draw(); if (!cfg.optional) { const i = $('input', host); if (i) i.focus(); } }
    else { value = code3(b.dataset.code); draw(); }
    cfg.onChange();
  });
  host.addEventListener('input', e => { if (e.target.matches('input[type="search"]')) fill(e.target.value); });
  draw();
  return api;
}

/* ===================== route sheet ===================== */
const sheet = $('#sheet');
let editing = null, delArmed = false;
const pkFrom = makePicker($('#pick-from'), {id: 'f-from', label: 'lab-from', quick: ['SEL', 'ICN', 'GMP', 'PUS', 'FUK'], onChange: syncSheet});
const pkVia = makePicker($('#pick-via'), {id: 'f-via', label: 'lab-via', quick: ['FUK', 'KIX', 'TYO'], optional: true, placeholder: '들렀다 가는 도시가 있으면 찾기', onChange: syncSheet});
const pkTo = makePicker($('#pick-to'), {id: 'f-to', label: 'lab-to', quick: ['FUK', 'OKA', 'KIX', 'TYO', 'CTS', 'TPE'], onChange: syncSheet});
const tripVal = () => (pkVia.get() ? 'chain' : ($('#f-trip-ow').checked ? 'ow' : 'rt'));
function sameRoute(x, f, v, t, trip, back) {
  if (code3(x.from) !== f || code3(x.to) !== t) return false;
  if (trip === 'chain') return isChain(x) && code3(x.via) === v && (x.back !== false) === back;
  return !isChain(x) && (x.trip === 'ow' ? 'ow' : 'rt') === trip;
}
function syncSheet() {
  const f = pkFrom.get(), v = pkVia.get(), t = pkTo.get(), trip = tripVal(), back = $('#f-back').checked;
  $('#f-trip-wrap').hidden = !!v;
  $('#f-back-wrap').hidden = !v;
  $('#f-via-nights-wrap').hidden = !v;
  $('#f-stay-wrap').hidden = trip === 'ow' || (trip === 'chain' && !back);
  $('#f-nights-row').hidden = $('#f-via-nights-wrap').hidden && $('#f-stay-wrap').hidden;
  const base = v ? '구간을 따로 샀을 때의 1인 합계 기준이에요. 한쪽을 비워 두면 그 종류는 알리지 않아요.' : '1인 총액 기준이에요. 한쪽을 비워 두면 그 종류는 알리지 않아요.';
  const r = S.routes.find(x => sameRoute(x, f, v, t, trip, back));
  let extra = '';
  if (r) {
    const cls = classify(Object.assign({}, r, {winFrom: '', winTo: ''}), S.prices[r.id]);
    const bits = [];
    if (cls.norm[0]) bits.push(`공휴일 아닌 일정 ${won(cls.norm[0].price)}원`);
    if (cls.hol[0]) bits.push(`일본 공휴일 낀 일정 ${won(cls.hol[0].price)}원`);
    if (bits.length) extra = ` 지금 확인된 최저가는 ${bits.join(', ')}이에요.`;
  }
  $('#f-target-hint').textContent = base + extra;
}
function openSheet(route, preset) {
  editing = route || null;
  delArmed = false;
  $('#f-error').hidden = true;
  $('#sheet-title').textContent = editing ? '노선 설정' : '노선 추가';
  $('#f-save').textContent = editing ? '저장' : '노선 추가';
  $('#f-del').hidden = !editing;
  $('#f-del').textContent = '이 노선 지우기';
  const src = editing || preset || {};
  const common = sortedRoutes()[0];
  pkFrom.set(src.from || (common ? common.from : 'SEL'));
  pkVia.set(src.via || '');
  pkTo.set(src.to || '');
  $('#f-trip-ow').checked = src.trip === 'ow';
  $('#f-trip-rt').checked = src.trip !== 'ow';
  $('#f-back').checked = src.back !== false;
  $('#f-target').value = posNum(src.target) || '';
  $('#f-target-hol').value = posNum(src.targetHol) || '';
  $('#f-win-from').value = isDate(src.winFrom) ? src.winFrom : '';
  $('#f-win-to').value = isDate(src.winTo) ? src.winTo : '';
  $('#f-nights').value = src.nights !== undefined && Number.isFinite(Number(src.nights)) ? Number(src.nights) : 3;
  $('#f-via-nights').value = src.viaNights !== undefined && Number.isFinite(Number(src.viaNights)) ? Number(src.viaNights) : 2;
  syncSheet();
  if (typeof sheet.showModal === 'function') { if (!sheet.open) sheet.showModal(); } else sheet.setAttribute('open', '');
}
function closeSheet() { if (typeof sheet.close === 'function') sheet.close(); else sheet.removeAttribute('open'); }
function formError(msg) { const e = $('#f-error'); e.textContent = msg; e.hidden = false; }
$('#route-form').addEventListener('change', e => { if (e.target.name === 'trip' || e.target.id === 'f-back') syncSheet(); });
$('#route-form').addEventListener('submit', async e => {
  e.preventDefault();
  const from = pkFrom.get(), via = pkVia.get(), to = pkTo.get(), trip = tripVal(), back = $('#f-back').checked;
  const target = Math.round(posNum($('#f-target').value)), targetHol = Math.round(posNum($('#f-target-hol').value));
  const winFrom = $('#f-win-from').value, winTo = $('#f-win-to').value;
  const nights = Math.max(0, Math.min(30, Math.round(Number($('#f-nights').value) || 0)));
  const viaNights = Math.max(1, Math.min(30, Math.round(Number($('#f-via-nights').value) || 1)));
  if (!from || !to) return formError('출발과 도착을 모두 골라 주세요.');
  if (from === to) return formError('출발과 도착이 같아요. 다른 곳을 골라 주세요.');
  if (via && (via === from || via === to)) return formError('거쳐 가는 곳이 출발이나 도착과 같아요. 다른 곳을 고르거나 빼 주세요.');
  if (!target && !targetHol) return formError('목표가를 하나 이상 넣어 주세요. 숫자만 넣으면 돼요.');
  if ((target && target < 10000) || (targetHol && targetHol < 10000)) return formError('목표가는 10,000원 이상으로 넣어 주세요.');
  if (winFrom && winTo && winFrom > winTo) return formError('여행 시기의 시작이 끝보다 늦어요. 날짜를 바꿔 주세요.');
  const data = {from, via: via || '', to, trip, back: trip === 'chain' ? back : true, target, targetHol, winFrom: isDate(winFrom) ? winFrom : '', winTo: isDate(winTo) ? winTo : '', nights, viaNights};
  const btn = $('#f-save');
  btn.disabled = true;
  let ok;
  if (editing) {
    const moved = !sameRoute(editing, from, via, to, trip, back);
    ok = await putRoute(editing.id, data, false);
    if (ok && moved) await dropPrices(editing.id);
  } else {
    const stem = (trip === 'chain' ? `${from}-${via}-${to}-chain` : `${from}-${to}-${trip}`).toLowerCase();
    let id = stem, n = 2;
    while (S.routes.some(r => r.id === id)) id = `${stem}-${n++}`;
    const order = S.routes.reduce((m, r) => Math.max(m, Number(r.order) || 0), 0) + 1;
    ok = await putRoute(id, Object.assign(data, {on: true, order, createdAt: new Date().toISOString()}), true);
  }
  btn.disabled = false;
  if (ok) { closeSheet(); toast(editing ? '저장했어요. 다음 가격 확인부터 반영돼요.' : '노선을 추가했어요. 가격을 확인하면 값이 채워져요.'); }
});
$('#f-del').addEventListener('click', async () => {
  if (!editing) return;
  if (!delArmed) { delArmed = true; $('#f-del').textContent = '한 번 더 누르면 지워져요'; return; }
  const ok = await dropRoute(editing.id);
  if (ok) { closeSheet(); toast('노선을 지웠어요.'); }
});

/* ===================== events ===================== */
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (act === 'connect' || (needConnect() && ['add', 'add-preset', 'edit', 'toggle'].includes(act))) return openConnect();
  if (act === 'add') openSheet(null, null);
  else if (act === 'add-preset') openSheet(null, {from: el.dataset.from, via: el.dataset.via || '', to: el.dataset.to});
  else if (act === 'edit') { const r = S.routes.find(x => x.id === id); if (r) openSheet(r); }
  else if (act === 'close-sheet') closeSheet();
  else if (act === 'toggle') {
    const r = S.routes.find(x => x.id === id);
    if (!r) return;
    const next = r.on === false;
    el.disabled = true;
    const ok = await putRoute(id, {on: next}, false);
    el.disabled = false;
    if (ok) toast(next ? '이 노선의 알림을 켰어요.' : '이 노선의 알림을 껐어요.');
  }
  else if (act === 'copy-ask') {
    const text = $('#ask-text').textContent;
    try { await navigator.clipboard.writeText(text); toast('문구를 복사했어요.'); }
    catch (err) { toast('복사하지 못했어요. 문구를 길게 눌러 직접 복사해 주세요.'); }
  }
  else if (act === 'save-token') {
    const v = $('#token-input').value.trim();
    if (v) {
      el.disabled = true;
      let bad = false;
      try { const r = await fetch(`https://api.github.com/repos/${repoName()}`, {headers: {Authorization: 'Bearer ' + v, Accept: 'application/vnd.github+json'}, cache: 'no-store'}); bad = r.status === 401; } catch (err) { /* offline: keep it and let the first save tell */ }
      el.disabled = false;
      if (bad) { toast('토큰이 맞지 않아요. 복사한 값을 다시 확인해 주세요.'); return; }
    }
    tokenStore.set(v);
    $('#token-input').value = '';
    toast(v ? '연결했어요. 이제 노선을 추가하고 바꿀 수 있어요.' : '연결을 끊었어요.');
    render();
  }
  else if (act === 'run-now') { el.disabled = true; await repoRunNow(); el.disabled = false; }
});
document.addEventListener('toggle', e => {
  const d = e.target;
  if (d && d.dataset && d.dataset.more) { if (d.open) S.openMore.add(d.dataset.more); else S.openMore.delete(d.dataset.more); }
}, true);
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

$('#ctx-route').addEventListener('change', e => { const o = ctxOptions().find(x => x.key === e.target.value); if (o) { setCtxFromOption(o); renderSites(); } });
$('#ctx-dep').addEventListener('change', e => {
  const v = e.target.value;
  if (!isDate(v) || !S.ctx) return;
  S.ctx.dep = v < today() ? today() : v;
  S.ctx.auto = false;
  if (S.ctx.trip !== 'ow' && (!S.ctx.ret || S.ctx.ret < S.ctx.dep)) S.ctx.ret = addDays(S.ctx.dep, S.ctx.nights || 3);
  renderSites();
});
$('#ctx-ret').addEventListener('change', e => {
  const v = e.target.value;
  if (!isDate(v) || !S.ctx || S.ctx.trip === 'ow') return;
  S.ctx.ret = v < S.ctx.dep ? S.ctx.dep : v;
  S.ctx.auto = false;
  renderSites();
});
$('#ctx-hol').addEventListener('change', e => {
  const b = e.target._blocks && e.target._blocks[Number(e.target.value)];
  if (e.target.value === '' || !b || !S.ctx) return;
  const tr = blockTrip(b, S.ctx.nights);
  S.ctx.dep = tr.dep;
  S.ctx.ret = S.ctx.trip === 'ow' ? '' : tr.ret;
  S.ctx.auto = false;
  renderSites();
});
['fy-class', 'fy-trip', 'fy-pax', 'fy-rate', 'fy-fee-kr', 'fy-fee-jp'].forEach(id => $('#' + id).addEventListener('input', () => { saveFerryPrefs(); renderFerry(); }));

/* ===================== tabs ===================== */
const TABS = ['routes', 'sites', 'ferry'];
function setTab() {
  const h = (location.hash || '').slice(1);
  const t = TABS.includes(h) ? h : 'routes';
  TABS.forEach(k => { $('#view-' + k).hidden = k !== t; });
  document.querySelectorAll('.tabs a').forEach(a => { if (a.dataset.tab === t) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
window.addEventListener('hashchange', () => { setTab(); window.scrollTo(0, 0); });

/* ===================== boot ===================== */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hasClaude = () => !!(window.claude && typeof window.claude.use === 'function');
async function cap(name) {
  for (let i = 0; i < 30 && !hasClaude(); i++) await sleep(100);
  if (!hasClaude()) return null;
  try { return await window.claude.use(name); } catch (e) { return null; }
}
function startDb(db) {
  S.db = db;
  S.mode = 'db';
  const timer = setTimeout(() => { S.slow = true; render(); }, 10000);
  db.collection('routes').onSnapshot(snap => {
    S.routes = snap.docs.map(d => Object.assign({id: d.id}, d.data()));
    if (!snap.metadata || !snap.metadata.fromCache) { S.confirmed = true; S.loaded = true; clearTimeout(timer); S.slow = false; }
    else if (snap.docs.length) S.loaded = true;
    render();
  }, err => { S.err = (err && err.code) || 'unavailable'; S.loaded = true; clearTimeout(timer); render(); });
  db.collection('prices').onSnapshot(snap => {
    const m = {};
    snap.docs.forEach(d => { m[d.id] = d.data(); });
    S.prices = m;
    render();
  }, () => {});
  db.doc('meta/status').onSnapshot(s => { S.status = s.exists ? s.data() : null; render(); }, () => {});
}
async function startRepo(cfg) {
  S.mode = 'repo';
  await repoLoad(cfg);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) repoLoad().catch(() => {}); });
  try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) { /* not available here */ }
}
async function boot() {
  $('#fy-class').innerHTML = FERRY.map((f, i) => `<option value="${i}">${esc(f[0])}, 편도 ${won(f[1])}원</option>`).join('');
  loadFerryPrefs();
  renderHolCal();
  setTab();
  render();
  if (window.FARE_MODE === 'repo') {   // the copy kept in a GitHub repository: mode.js says so
    const cfg = await loadJson('data/config.json').catch(() => null);
    if (cfg && Array.isArray(cfg.routes)) return startRepo(cfg);
    S.mode = 'repo'; S.loaded = true; S.err = 'config';
    render();
    return;
  }
  const db = await cap('db');
  if (db) return startDb(db);
  S.mode = 'local';
  S.loaded = true;
  S.routes = [
    {id: 'sel-fuk-rt', from: 'SEL', to: 'FUK', trip: 'rt', target: 0, targetHol: 0, nights: 3, on: true, order: 1},
    {id: 'sel-oka-rt', from: 'SEL', to: 'OKA', trip: 'rt', target: 0, targetHol: 0, nights: 4, on: true, order: 2}
  ];
  render();
}
boot();
})();
