'use strict';

const APP_VERSION = '5.2.0';
const STORE_KEY = 'balanza.v1';
const { esc } = UI;
const $ = id => document.getElementById(id);
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- 資料 ----------
const CAT_MIGRATE = { '股票': '台股', 'ETF/基金': '基金' };
function migrate(d) {
  d = { currency: 'TWD', assets: [], debts: [], plans: [], ...d };
  d.plans = d.plans || [];
  d.assets = d.assets.map(a => {
    let category = CAT_MIGRATE[a.category] || a.category;
    if (a.category === 'ETF/基金' && /^00\d{2,4}[A-Z]?$/.test(String(a.name).trim())) category = '台股';
    return { ...a, category };
  });
  d.debts = d.debts.map(x => {
    if (x.mode) return x;
    const b = BANKS.find(b => x.source && (b.name.includes(x.source) || x.source.includes(b.name.replace(/(國際)?商業(儲蓄)?銀行$/, ''))));
    return { ...x, mode: 'manual', bank: b ? `${b.code}|${b.name}` : (x.source ? `—|${x.source}` : '') };
  });
  return d;
}
function load() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return migrate(JSON.parse(raw)); } catch (e) { /* ignore */ }
  return migrate({});
}
let state = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { alert('儲存失敗：' + e.message); }
  render();
}

// ---------- 隱藏金額 ----------
const EYE_ON = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="#e8f7fd" stroke="#4a8fc4" stroke-width="1.8"/><circle cx="12" cy="12" r="3.6" fill="#4a8fc4"/><circle cx="13.2" cy="10.8" r="1.1" fill="#fff"/></svg><span>隱藏</span>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="#f1f3f5" stroke="#90a4ae" stroke-width="1.8"/><path d="M4 4l16 16" stroke="#90a4ae" stroke-width="2" stroke-linecap="round"/></svg><span>顯示</span>';
const PREFS_KEY = 'balanza.prefs';
const prefs = (() => { try { return { autoHide: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch (e) { return { autoHide: true }; } })();
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };
let hidden = !!prefs.autoHide;
const MASK = '••••••';
function setHidden(h) {
  hidden = h;
  document.body.classList.toggle('privacy', hidden);
  lastLv = null; levelsKey = '';
  render();
  if ($('editor').open) refreshForm();
}

// ---------- 格式 ----------
function fmt(n, ccy = state.currency) {
  if (hidden) return `$${MASK}`;
  const digits = ccy === 'JPY' || ccy === 'TWD' ? 0 : 2;
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: ccy, maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n || 0);
}
const wan = n => Math.abs(n) >= 1e4 ? `${(n / 1e4).toFixed(Math.abs(n) >= 1e6 ? 0 : 1).replace(/\.0$/, '')} 萬` : Math.round(n).toLocaleString();
function short(n) {
  if (hidden) return MASK;
  return shortRaw(n);
}
function shortRaw(n) {
  if (state.currency === 'TWD') {
    if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, '')} 億`;
    return wan(n);
  }
  return new Intl.NumberFormat('zh-TW', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
const pct = n => (n || 0).toFixed(2).replace(/\.?0+$/, '') + '%';
const price = (p, ccy) => (p >= 1000 ? p.toLocaleString(undefined, { maximumFractionDigits: 0 }) : p.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: p < 10 ? 2 : 0 })) + (ccy === 'USD' ? ' USD' : '');

// ---------- 查找 ----------
const bankOf = v => { if (!v) return null; const [code, name] = v.split('|'); return BANKS.find(b => b.code === code && b.name === name) || { code, name, s: (name || '?')[0], c: '#757575' }; };
const bankLabel = b => b ? (b.code !== '—' ? `${b.code} ${b.name}` : b.name) : '—';
const shortBank = b => b ? b.name.replace(/(\(台灣\))?(國際)?商業(儲蓄)?銀行$/, '').replace(/^臺灣(?=土地|中小)/, '') : '—';
const catOf = v => ASSET_CATS.find(c => c.v === v) || ASSET_CATS.at(-1);
const typeOf = v => DEBT_TYPES.find(c => c.v === v) || DEBT_TYPES.at(-1);
const brandOf = v => CAR_BRANDS.find(c => c.v === v);
const mktOf = a => catOf(a.category).stock;   // 'tw' | 'us' | undefined
const icCat = v => v === '車輛' ? UI.carIcon() : Icon(catOf(v).ic);
const icDebt = v => v === '車貸' ? UI.carIcon() : Icon(typeOf(v).ic);

function assetIcon(a) {
  if (a.category === '車輛' && a.brand) return UI.carIcon(brandOf(a.brand), a.model, a.carColor);
  return icCat(a.category);
}

// ---------- 價值計算 ----------
const debtStatus = d => Plan.status(d, state.plans);
const debtColor = d => Charts.PALETTE[Math.max(0, state.debts.indexOf(d)) % Charts.PALETTE.length];
function stockInfo(a) {
  const mkt = mktOf(a);
  if (!mkt || !a.sym) return null;
  const q = Stocks.quote(mkt, a.sym);
  const ccy = mkt === 'us' ? 'USD' : 'TWD';
  const px = q ? q.price : num(a.manualPrice);
  const k = Stocks.fx(ccy, state.currency);
  const shares = num(a.shares);
  const value = px ? shares * px * k : num(a.amount);
  const costVal = num(a.cost) ? shares * num(a.cost) * k : 0;
  return { q, mkt, ccy, px, shares, value, costVal, pl: costVal ? value - costVal : null, dayChg: q ? shares * q.chg * k : 0 };
}
function assetValue(a) {
  const s = stockInfo(a);
  return s ? s.value : num(a.amount);
}

function summary() {
  const st = state.debts.map(d => ({ d, s: debtStatus(d) }));
  const totalAssets = state.assets.reduce((s, a) => s + assetValue(a), 0);
  const totalDebts = st.reduce((s, x) => s + x.s.balance, 0);
  const monthlyPay = st.reduce((s, x) => s + x.s.monthly, 0);
  const monthlyInterest = st.reduce((s, x) => s + x.s.monthlyInterest, 0);
  const avgRate = totalDebts > 0 ? st.reduce((s, x) => s + x.s.balance * num(x.d.rate), 0) / totalDebts : 0;
  const graceItems = st.filter(x => x.s.inGrace);
  return {
    st, totalAssets, totalDebts, monthlyPay, monthlyInterest, avgRate, graceItems,
    netWorth: totalAssets - totalDebts,
    debtRatio: totalAssets > 0 ? totalDebts / totalAssets * 100 : (totalDebts > 0 ? 100 : 0),
    monthlyPrincipal: Math.max(0, monthlyPay - monthlyInterest),
    graceJump: graceItems.reduce((s, x) => s + (x.s.afterGracePay - x.s.monthly), 0),
  };
}
const twdK = () => Stocks.fx('TWD', state.currency);  // 1 TWD = ? 顯示幣別

function groupSum(items, keyFn, valFn) {
  const m = new Map();
  for (const it of items) { const k = keyFn(it) || '未分類'; m.set(k, (m.get(k) || 0) + valFn(it)); }
  return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}

function barsHTML(rows, iconFn, labelFn, extraFn) {
  if (!rows.length) return `<div class="empty">${Icon('sleep', 'ico-lg')}<p>尚無資料</p></div>`;
  const max = rows[0][1], total = rows.reduce((s, r) => s + r[1], 0);
  return rows.map(([k, v], i) => `
    <div class="bar" style="--i:${i}">
      ${iconFn(k)}
      <div class="bar-body">
        <div class="bar-top"><span>${esc(labelFn ? labelFn(k) : k)}</span><span>${fmt(v)} · ${(v / total * 100).toFixed(0)}%</span></div>
        ${extraFn ? extraFn(k) : ''}
        <div class="track"><div class="fill" data-w="${(v / max * 100).toFixed(1)}"></div></div>
      </div>
    </div>`).join('');
}

// ---------- 畫面 ----------
let lastLv = null, lastStress = null;
const openGroups = new Set(ASSET_CATS.map(c => c.v));
const openStocks = new Set();

function render() {
  const s = summary();
  const L = UI.levelOf(s, twdK());
  const stress = s.debtRatio >= 70 && s.netWorth >= 0;

  // 吉祥物
  if (L.lv !== lastLv || stress !== lastStress) {
    $('mascot').innerHTML = UI.mascotSVG(L, { stress });
    $('mascotCard').dataset.lv = L.lv;
    $('mascotCard').style.setProperty('--g', L.lv > 0 ? Math.min(1, L.lv / 30).toFixed(2) : 0);
    $('mascotCard').classList.toggle('glow', L.lv >= 7);
    lastLv = L.lv; lastStress = stress;
  }
  $('mascotLv').textContent = L.lv === 0 ? '' : `Lv.${L.lv} ${L.name}`;
  $('mascotCard').dataset.tier = L.tier;
  $('mascotMsg').textContent = L.msg;
  $('mascotTip').textContent = L.lv === 0 ? '到「資產」「負債」新增資料叫醒牠' : `負債比 ${pct(s.debtRatio)}${stress ? '，負債偏重小秤在冒汗' : ''}`;

  $('eyeBtn').innerHTML = hidden ? EYE_OFF : EYE_ON;
  $('eyeBtn').setAttribute('aria-label', hidden ? '顯示金額' : '隱藏金額');
  UI.countTo($('netWorth'), s.netWorth, fmt);
  $('netWorth').classList.toggle('neg', s.netWorth < 0);
  UI.countTo($('totalAssets'), s.totalAssets, fmt);
  UI.countTo($('totalDebts'), s.totalDebts, fmt);
  $('debtRatio').textContent = pct(s.debtRatio);
  $('ratioFill').style.width = Math.min(100, s.debtRatio) + '%';
  $('ratioFill').className = 'ratio-fill ' + (s.debtRatio >= 70 ? 'hot' : s.debtRatio >= 30 ? 'warm' : 'cool');
  UI.countTo($('monthlyPay'), s.monthlyPay, fmt);
  $('avgRate').textContent = pct(s.avgRate);
  UI.countTo($('monthlyInterest'), s.monthlyInterest, fmt);
  UI.countTo($('monthlyPrincipal'), s.monthlyPrincipal, fmt);

  renderHomeRepay();

  // 負債來源
  const balByBank = groupSum(s.st, x => x.d.bank || '—|未填', x => x.s.balance);
  const payByBank = new Map(groupSum(s.st, x => x.d.bank || '—|未填', x => x.s.monthly));
  $('debtBySource').innerHTML = barsHTML(balByBank, k => UI.bankIcon(bankOf(k)),
    k => { const b = bankOf(k); return b && b.code !== '—' ? `${shortBank(b)} (${b.code})` : (b ? b.name : k); },
    k => payByBank.get(k) ? `<small class="sub">月付 ${fmt(payByBank.get(k))}</small>` : '');
  $('assetByCat').innerHTML = barsHTML(groupSum(state.assets, a => a.category, assetValue), icCat);

  // 還款時程
  const pl = s.st.filter(x => x.s.balance > 0).sort((a, b) => a.s.monthsLeft - b.s.monthsLeft);
  $('payoffList').innerHTML = pl.length ? pl.map(({ d, s: x }, i) => {
    const prog = d.mode === 'auto' && x.total ? x.paid / x.total : null;
    const right = x.revolving
      ? `<div>只繳利息</div><div class="sub">動用 ${short(x.balance)} / 額度 ${short(x.limit)}</div>`
      : isFinite(x.monthsLeft)
      ? `<div>${x.payoffYM} 還清</div><div class="sub">剩 ${x.monthsLeft} 期 · 利息 ${fmt(x.interestLeft)}</div>`
      : `<div class="neg">月付不足以還清</div><div class="sub">月付低於每月利息</div>`;
    return `<div class="payoff" style="--i:${i}">${icDebt(d.type)}<div class="grow"><div>${esc(d.name)}</div><div class="sub">${esc(shortBank(bankOf(d.bank)))} · ${pct(num(d.rate))}</div>
      ${prog !== null ? `<div class="mini-track"><div style="width:${(prog * 100).toFixed(1)}%"></div></div>` : ''}</div><div class="r">${right}</div></div>`;
  }).join('') : `<div class="empty">${Icon('heart', 'ico-lg')}<p>沒有負債，太棒了</p></div>`;

  renderAssets(s);
  renderDebts(s);
  renderLevels(s, L);
  renderRepay();
  renderInvest();

  const cur = CURRENCIES.find(c => c.v === state.currency) || CURRENCIES[0];
  $('currencyBtn').innerHTML = `${Icon(cur.ic)}<span>${cur.label}</span><i>›</i>`;
  growBars();
}

// --- 資產：依大項分組 ---
function stockRow(a, i) {
  const si = stockInfo(a);
  const q = si.q;
  const open = openStocks.has(a.id);
  const tw = si.mkt === 'tw';
  const chgCls = q ? (q.chg > 0 ? 'up' : q.chg < 0 ? 'down' : '') : '';
  const chgTxt = q ? `${q.chg > 0 ? '▲' : q.chg < 0 ? '▼' : ''}${Math.abs(q.chgPct).toFixed(2)}%` : '手動價格';
  const unit = tw && si.shares >= 1000 && si.shares % 1000 === 0 ? `${si.shares / 1000} 張` : `${si.shares.toLocaleString()} 股`;
  return `<li class="stock ${open ? 'open' : ''} ${tw ? 'tw' : 'us'}" data-expand="${a.id}" style="--i:${i}">
    <div class="row">
      <span class="ticker">${esc(Stocks.norm(si.mkt, a.sym))}</span>
      <div class="grow"><div class="name">${esc(q ? q.name : a.name || a.sym)}</div><div class="sub">${unit}${si.px ? ` · ${price(si.px, si.ccy)}` : ''}</div></div>
      <div class="amt">${fmt(si.value)}<div class="sub chg ${chgCls}">${chgTxt}</div></div>
    </div>
    <div class="detail">
      ${q ? `<div class="chart-box">${UI.sparkline(q.series, 280, 64, { tw, dot: true, sw: 2 })}<div class="chart-cap"><span>近 ${q.series.length} 個交易日</span><span>${esc(q.date || '')} 收盤</span></div></div>` : `<div class="hint-row">${Icon('search')}<span>沒有這檔的自動報價，使用手動填的價格</span></div>`}
      <div class="kv"><span>現價</span><span>${si.px ? price(si.px, si.ccy) : '—'}</span></div>
      ${q ? `<div class="kv"><span>今日漲跌</span><span class="chg ${chgCls}">${q.chg >= 0 ? '+' : ''}${q.chg.toFixed(2)}（${chgTxt}）· ${fmt(si.dayChg)}</span></div>` : ''}
      ${si.pl !== null ? `<div class="kv"><span>損益（成本 ${price(num(a.cost), si.ccy)}）</span><span class="chg ${si.pl > 0 ? 'up' : si.pl < 0 ? 'down' : ''}">${si.pl >= 0 ? '+' : ''}${fmt(si.pl)}（${(si.pl / si.costVal * 100).toFixed(1)}%）</span></div>` : ''}
      <button type="button" class="btn mini" data-edit="asset" data-id="${a.id}">${Icon.svg('pencil', 18)} 編輯持股</button>
    </div></li>`;
}

function renderAssets(s) {
  $('assetsSum').textContent = fmt(s.totalAssets);
  if (!state.assets.length) { $('assetList').innerHTML = `<div class="empty big-empty">${Icon('piggy', 'ico-xl')}<p>點右下角 ＋ 新增第一筆資產</p></div>`; return; }
  const groups = ASSET_CATS.map(c => {
    const items = state.assets.filter(a => a.category === c.v).map(a => ({ a, v: assetValue(a) })).sort((x, y) => y.v - x.v);
    return { c, items, total: items.reduce((t, x) => t + x.v, 0) };
  }).filter(g => g.items.length).sort((x, y) => y.total - x.total);
  let i = 0;
  $('assetList').innerHTML = groups.map(g => {
    const open = openGroups.has(g.c.v);
    const share = s.totalAssets ? g.total / s.totalAssets * 100 : 0;
    let extra = '';
    if (g.c.stock) {
      const day = g.items.reduce((t, x) => t + (stockInfo(x.a)?.dayChg || 0), 0);
      if (day) extra = `<span class="chg ${day > 0 ? 'up' : 'down'}">今日 ${day > 0 ? '+' : ''}${fmt(day)}</span>`;
    }
    const rows = g.items.map(({ a, v }) => {
      if (g.c.stock && a.sym) return stockRow(a, i++);
      let sub = '';
      if (a.category === '車輛' && a.brand) { const b = brandOf(a.brand); sub = `${b ? b.zh : a.brand}${a.model ? ' ' + a.model : ''}${a.buyYear ? ' · ' + a.buyYear : ''}`; }
      if (a.category === '不動產' && a.district) sub = `${a.district}${a.road || ''}${a.ping ? ' · ' + a.ping + ' 坪' : ''}${a.lvrAt ? ' · 實價估' : ''}`;
      if (a.note) sub += (sub ? ' · ' : '') + a.note;
      return `<li data-edit="asset" data-id="${a.id}" style="--i:${i++}">${assetIcon(a)}
        <div class="grow"><div class="name">${esc(a.name)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
        <div class="amt pos">${fmt(v)}</div></li>`;
    }).join('');
    return `<div class="group ${open ? 'open' : ''}">
      <button type="button" class="group-head" data-group="${esc(g.c.v)}">${icCat(g.c.v)}
        <div class="grow"><div class="name">${esc(g.c.v)} <small>${g.items.length} 項</small></div><div class="sub">${share.toFixed(0)}% ${extra}</div></div>
        <div class="amt pos">${fmt(g.total)}</div><i class="chev">›</i></button>
      <ul class="list sub-list">${rows}</ul></div>`;
  }).join('');
}

function renderDebts(s) {
  const ds = [...s.st].sort((a, b) => num(b.d.rate) - num(a.d.rate));
  $('debtsSum').textContent = fmt(s.totalDebts);
  $('debtList').innerHTML = ds.length ? ds.map(({ d, s: x }, i) => {
    const b = bankOf(d.bank);
    return `<li data-edit="debt" data-id="${d.id}" style="--i:${i}"><span class="stack">${UI.bankIcon(b)}<span class="badge">${Icon.svg(typeOf(d.type).ic === 'car' ? 'loan' : typeOf(d.type).ic, 18)}</span></span>
      <div class="grow"><div class="name">${esc(d.name)}${x.inGrace ? ` <span class="chip">寬限期剩 ${x.graceLeft} 月</span>` : ''}</div>
      <div class="sub">${esc(b && b.code !== '—' ? b.code + ' ' + shortBank(b) : (b ? b.name : '—'))} · 年利率 ${pct(num(d.rate))}${d.mode === 'auto' ? ' · 自動試算' : d.mode === 'revolving' ? ` · 額度 ${short(x.limit)}` : ''}</div></div>
      <div class="amt neg">${fmt(x.balance)}<div class="sub">${x.revolving ? '利息' : '月付'} ${fmt(x.monthly)}</div></div></li>`;
  }).join('') : `<div class="empty big-empty">${Icon('heart', 'ico-xl')}<p>點右下角 ＋ 新增負債</p></div>`;
}

// --- 等級 ---
function rangeText(L, k) {
  if (L.min === -Infinity) return `淨資產 ${shortRaw(L.max * k)} 以下`;
  if (L.max === Infinity) return `淨資產 ${shortRaw(L.min * k)} 以上`;
  if (L.min === 0) return `淨資產 0 ～ ${shortRaw(L.max * k)}`;
  if (L.max === 0) return `淨資產 ${shortRaw(L.min * k)} ～ 0`;
  return `淨資產 ${shortRaw(L.min * k)} ～ ${shortRaw(L.max * k)}`;
}
const nextLevel = L => L.lv === 0 || L.lv === 30 ? null : LEVELS.find(x => x.lv === (L.lv === -1 ? 1 : L.lv + 1));
function levelProgress(L, nw, k) {
  const next = nextLevel(L);
  if (!next) return { prog: L.lv === 30 ? 1 : 0, need: 0, next: null };
  const lo = (L.min === -Infinity ? L.max * 1.5 : L.min) * k, hi = next.min * k;
  return { prog: Math.max(0, Math.min(1, (nw - lo) / (hi - lo))), need: hi - nw, next };
}
const lvBadge = L => L.lv === 0 ? 'Zzz' : `Lv.${L.lv}`;
let levelsKey = '';
function renderLevels(s, L) {
  const k = twdK();
  const nw = s.netWorth;
  const { prog, need, next } = levelProgress(L, nw, k);
  const note = L.lv === 0 ? '新增資產或負債後，小秤就會醒來'
    : !next ? '已經是最高等級了，太強了'
    : L.lv < 0 ? `再減少 ${fmt(need)} 負債（或增加資產）就能升到 Lv.${next.lv} ${next.name}`
    : `再增加 ${fmt(need)} 淨資產就能升到 Lv.${next.lv} ${next.name}`;
  $('lvNow').innerHTML = `<div class="lv-mascot">${UI.mascotSVG(L)}</div>
    <div class="lv-info"><div class="lv-badge ${L.lv < 0 ? 'neg-bg' : ''}">${lvBadge(L)}${L.tierName ? ' · ' + esc(L.tierName) : ''}</div><h2>${esc(L.name)}</h2>
    <div class="muted">${esc(L.msg)}</div><div class="lv-nw">目前淨資產 <b class="${nw < 0 ? 'neg' : 'pos'}">${fmt(nw)}</b></div></div>
    <div class="lv-prog"><div class="lv-track"><div class="lv-fill" style="width:${(prog * 100).toFixed(1)}%"></div></div><div class="small muted">${note}</div></div>`;

  // 首頁的升級進度
  $('homeProg').hidden = !next;
  if (next) {
    $('homeProgFill').style.width = (prog * 100).toFixed(1) + '%';
    $('homeProgText').textContent = `距離 Lv.${next.lv} ${next.name} 還差 ${fmt(need)}`;
  }

  const key = `${L.lv}|${state.currency}|${k.toFixed(6)}`;
  if (key === levelsKey) return;
  levelsKey = key;
  const row = X => {
    const cur = X.lv === L.lv;
    const reached = L.lv > 0 && X.lv > 0 && X.lv < L.lv;
    const tag = cur ? '<span class="lv-tag cur">你在這裡</span>' : reached ? '<span class="lv-tag ok">已達成</span>' : (X.lv > 0 && X.lv > L.lv) ? `<span class="lv-tag lock">${Icon.svg('lock', 13)}</span>` : '';
    return `<li class="lv-row ${cur ? 'cur' : ''} ${X.lv < 0 ? 'negative' : ''}" ${cur ? 'id="lvCurRow"' : ''}>
      <div class="lv-mini">${UI.mascotSVG(X, { still: !cur })}</div>
      <div class="grow"><div class="lv-name"><b>Lv.${X.lv}</b> ${esc(X.name)} ${tag}</div>
      <div class="lv-range">${rangeText(X, k)}</div></div></li>`;
  };
  const tierBlock = (list, title, desc) => `<li class="lv-tier"><b>${esc(title)}</b><small>${esc(desc)}</small></li>${list.map(row).join('')}`;
  const pos = [], neg = [];
  for (let t = 10; t >= 1; t--) { const g = LEVELS.filter(x => x.tier === t); pos.push(tierBlock(g, `${g[0].tierName} · Lv.${g.at(-1).lv}–${g[0].lv}`, g[0].desc)); }
  for (let t = -1; t >= -10; t--) { const g = LEVELS.filter(x => x.tier === t); neg.push(tierBlock(g, `${g[0].tierName} · Lv.${g[0].lv}–${g.at(-1).lv}`, g[0].desc)); }
  $('lvList').innerHTML = `<li class="lv-sep pos-sep">${Icon.svg('star', 18)} 正資產 30 級</li>${pos.join('')}
    <li class="lv-sep neg-sep">${Icon.svg('warn', 18)} 負資產 30 級</li>${neg.join('')}`;
  $('lvNoteCcy').textContent = state.currency === 'TWD' ? '每 3 級是一個階段，造型會變；同階段用星星數區分。' : `門檻以新台幣設定，依目前匯率換算成 ${state.currency}。`;
}

// --- 更新紀錄 ---
function changelogHTML(list) {
  return list.map((c, i) => `<details class="cl" ${i === 0 ? 'open' : ''}><summary><b>v${c.v}</b> ${esc(c.title)}<small>${c.date}</small></summary>
    <ul>${c.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>`).join('');
}
function openChangelog(onlyNew) {
  const seen = (() => { try { return localStorage.getItem('balanza.seenVersion'); } catch (e) { return null; } })();
  let list = CHANGELOG;
  if (onlyNew && seen) { const i = CHANGELOG.findIndex(c => c.v === seen); if (i > 0) list = CHANGELOG.slice(0, i); }
  $('clTitle').innerHTML = `${Icon('star')} ${onlyNew ? `更新到 v${APP_VERSION} 了` : '更新紀錄'}`;
  $('clBody').innerHTML = changelogHTML(list);
  $('clDialog').showModal();
  try { localStorage.setItem('balanza.seenVersion', APP_VERSION); } catch (e) { /* ignore */ }
}
$('ver').addEventListener('click', () => openChangelog(false));
$('clClose').addEventListener('click', () => $('clDialog').close());
$('clOpen').addEventListener('click', () => openChangelog(false));

function growBars() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('.view.active .fill[data-w]').forEach(f => { f.style.width = f.dataset.w + '%'; });
  }));
}

// ---------- 分頁與新增按鈕 ----------
let currentView = 'home';
function showView(name) {
  currentView = name;
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => {
    const on = v.id === 'view-' + name;
    v.classList.toggle('active', on);
    if (on) { v.style.animation = 'none'; void v.offsetWidth; v.style.animation = ''; }
  });
  const fab = $('fab');
  const kind = { assets: 'asset', debts: 'debt', invest: 'plan' }[name] || '';
  document.querySelectorAll('.top-btn').forEach(x => x.classList.toggle('active', x.dataset.view === name));
  fab.hidden = !kind;
  fab.dataset.add = kind;
  fab.setAttribute('aria-label', '新增' + KIND_NAME[kind]);
  if (kind) { fab.classList.remove('pop'); void fab.offsetWidth; fab.classList.add('pop'); }
  if (name === 'levels') setTimeout(() => { const r = $('lvCurRow'); r && r.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 450);
  document.querySelectorAll('.fill[data-w]').forEach(f => { f.style.width = '0'; });
  growBars();
  if (name !== 'levels') window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button, .top-btn').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
$('toLevels').addEventListener('click', () => showView('levels'));
document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) showView(g.dataset.goto); });

// ---------- 表單欄位定義 ----------
const opt = (v, label, icon, sub, extra = {}) => ({ value: v, label, icon, sub, ...extra });
const OPTS = {
  assetCat: () => ASSET_CATS.map(c => opt(c.v, c.v, icCat(c.v), c.stock ? '輸入持股自動抓股價' : '')),
  debtType: () => DEBT_TYPES.map(c => opt(c.v, c.v, icDebt(c.v))),
  bank: () => BANKS.map(b => opt(`${b.code}|${b.name}`, b.name, UI.bankIcon(b), b.code !== '—' ? `銀行代碼 ${b.code}` : '')),
  mode: () => CALC_MODES.map(c => opt(c.v, c.label, Icon(c.ic), c.d)),
  method: () => REPAY_METHODS.map(c => opt(c.v, c.label, Icon(c.ic), c.d)),
  brand: () => CAR_BRANDS.map(b => opt(b.v, b.zh === b.v ? b.v : `${b.zh} ${b.v}`, UI.carIcon(b), b.f + (b.t === 'scooter' ? ' · 機車' : ''))),
  carModel: vals => { const b = brandOf(vals.brand); return Car.models(vals.brand).map(m => opt(m.name, m.name, UI.carIcon(b, m.name, vals.carColor), BODY_ZH[m.type] || '')); },
  carColor: () => [...(brandOf(vals.brand) ? [{ v: brandOf(vals.brand).c, label: '品牌代表色' }] : []), ...Car.COLORS].map(c => opt(c.v, c.label, swatch(c.v))),
  county: () => COUNTIES.map(c => opt(c.k, c.v, Icon('pin'))),
  district: async vals => { if (!vals.county) return []; const d = await LVR.loadCounty(vals.county); return Object.keys(d.d).map(k => opt(k, k, Icon('city'), `${d.d[k].s.all[3]} 筆成交`)); },
  road: async vals => { if (!vals.county || !vals.district) return []; const d = await LVR.loadCounty(vals.county); const r = d.d[vals.district]?.r || {}; return Object.keys(r).sort((a, b) => r[b].s.all[3] - r[a].s.all[3]).map(k => opt(k, k, Icon('road'), `${r[k].s.all[3]} 筆 · 中位 ${wan(r[k].s.all[0])}/坪`)); },
  btype: () => BUILDING_TYPES.map(c => opt(c.v, c.v, Icon(c.ic), c.d)),
  planSource: () => [opt('self', '自有資金', Icon('wallet'), '不產生利息'), ...state.debts.filter(isRev).map(d => opt(d.id, d.name, UI.bankIcon(bankOf(d.bank)), `理財型額度 ${short(num(d.limit))} · ${pct(num(d.rate))}`))],
  grace: () => [0, 6, 12, 24, 36, 48, 60].map(m => opt(String(m), m ? `${m} 個月${m % 12 === 0 ? `（${m / 12} 年）` : ''}` : '沒有寬限期', Icon(m ? 'pause' : 'play'), m ? '期間只繳利息、不還本金' : '一撥款就開始還本金')),
  stock: async vals => {
    await Stocks.load();
    const mkt = mktOf(vals);
    return Stocks.list(mkt).map(x => opt(x.sym, `${x.sym}  ${x.name}`, `<span class="ticker small">${esc(x.sym.slice(0, 6))}</span>`, x.price != null ? price(x.price, mkt === 'us' ? 'USD' : 'TWD') : '', { key: `${x.sym} ${x.name}`, right: UI.sparkline(x.series, 56, 22, { tw: mkt === 'tw' }) }));
  },
};
const BODY_ZH = { sedan: '轎車', hatch: '掀背車', suv: '休旅車', bigsuv: '越野車', coupe: '跑車', roadster: '敞篷車', minivan: 'MPV', pickup: '皮卡', evcross: '電動跨界休旅', wagon: '旅行車', scooter: '速克達', escooter: '電動機車', sportbike: '檔車' };
const swatch = c => `<span class="ico swatch" style="--sw:${c}"></span>`;
const PICK_LABEL = {
  planSource: v => v === 'self' || !v ? '自有資金' : (state.debts.find(d => d.id === v) || {}).name || '（已刪除的額度）',
  carColor: v => ([...Car.COLORS].find(c => c.v === v) || {}).label || (v ? '品牌代表色' : ''),
  bank: v => { const b = bankOf(v); return b ? bankLabel(b) : ''; },
  county: v => (COUNTIES.find(c => c.k === v) || {}).v || '',
  method: v => (REPAY_METHODS.find(c => c.v === v) || {}).label || '',
  mode: v => (CALC_MODES.find(c => c.v === v) || {}).label || '',
  brand: v => { const b = brandOf(v); return b ? (b.zh === b.v ? b.v : `${b.zh} ${b.v}`) : v; },
  grace: v => +v ? `${v} 個月` : '沒有寬限期',
  stock: (v, vals) => { const q = v && Stocks.quote(mktOf(vals), v); return q ? `${q.sym} ${q.name}` : v; },
};
const PICK_ICON = {
  planSource: v => v === 'self' || !v ? Icon('wallet') : UI.bankIcon(bankOf((state.debts.find(d => d.id === v) || {}).bank)),
  assetCat: v => icCat(v),
  debtType: v => icDebt(v),
  bank: v => UI.bankIcon(bankOf(v)),
  mode: v => Icon((CALC_MODES.find(c => c.v === v) || {}).ic || 'calc'),
  method: v => Icon((REPAY_METHODS.find(c => c.v === v) || {}).ic || 'scale'),
  brand: (v, vals) => UI.carIcon(brandOf(v), vals.model, vals.carColor),
  carModel: (v, vals) => UI.carIcon(brandOf(vals.brand), v, vals.carColor),
  carColor: v => swatch(v),
  county: () => Icon('pin'), district: () => Icon('city'), road: () => Icon('road'),
  btype: v => Icon((BUILDING_TYPES.find(c => c.v === v) || {}).ic || 'tower'),
  grace: v => Icon(+v ? 'pause' : 'play'),
  stock: (v, vals) => Icon(mktOf(vals) === 'us' ? 'us' : 'tw'),
};

const isRE = v => v.category === '不動產';
const isCar = v => v.category === '車輛';
const isStock = v => !!mktOf(v);
const isAuto = v => v.mode === 'auto';
const isRev = v => v.mode === 'revolving';
const isManual = v => !isAuto(v) && !isRev(v);
const noQuote = v => isStock(v) && v.sym && !Stocks.quote(mktOf(v), v.sym);
const thisYM = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

const FIELDS = {
  asset: [
    { k: 'category', label: '類別', type: 'pick', opts: 'assetCat', def: '現金/存款' },
    { k: 'name', label: '名稱', type: 'text', req: true, ph: '例：玉山活存', show: v => !isStock(v) },
    { sec: ['tw', '股票持股'], show: isStock },
    { k: 'sym', label: '股票代號', type: 'pick', opts: 'stock', show: isStock, req: true },
    { panel: 'stockPanel', show: isStock },
    { k: 'shares', label: '持有股數', type: 'number', req: true, show: isStock, half: true, hintFn: v => mktOf(v) === 'tw' ? '1 張 = 1,000 股' : '可輸入小數（零股）' },
    { k: 'cost', label: '平均成本／股（選填）', type: 'number', show: isStock, half: true },
    { k: 'manualPrice', label: '目前股價（找不到報價時填）', type: 'number', show: noQuote },
    { sec: ['property', '實價登錄估價'], show: isRE },
    { k: 'address', label: '地址（只存在手機裡）', type: 'text', ph: '例：臺北市大安區信義路四段1號', show: isRE, action: { id: 'lookupBtn', text: '查實價' } },
    { k: 'county', label: '縣市', type: 'pick', opts: 'county', show: isRE, half: true },
    { k: 'district', label: '行政區', type: 'pick', opts: 'district', show: isRE, half: true },
    { k: 'road', label: '路段', type: 'pick', opts: 'road', show: isRE },
    { k: 'btype', label: '建物型態', type: 'pick', opts: 'btype', def: '住宅大樓', show: isRE, half: true },
    { k: 'ping', label: '建物坪數（不含車位）', type: 'number', show: isRE, half: true },
    { panel: 'lvrPanel', show: isRE },
    { sec: ['car', '車輛資訊'], show: isCar },
    { panel: 'carPreview', show: isCar },
    { k: 'brand', label: '廠牌', type: 'pick', opts: 'brand', show: isCar },
    { k: 'model', label: '車款', type: 'pick', opts: 'carModel', show: v => isCar(v) && !!v.brand },
    { k: 'carColor', label: '車色', type: 'pick', opts: 'carColor', show: v => isCar(v) && !!v.brand },
    { k: 'buyYear', label: '購入年份', type: 'number', ph: String(new Date().getFullYear()), show: isCar, half: true },
    { k: 'buyPrice', label: '購入價格', type: 'number', show: isCar, half: true },
    { panel: 'carPanel', show: isCar },
    { sec: ['wallet', '價值'], show: v => !isStock(v) },
    { k: 'amount', label: '目前價值', type: 'number', req: true, show: v => !isStock(v) },
    { k: 'note', label: '備註', type: 'text' },
  ],
  debt: [
    { k: 'type', label: '類型', type: 'pick', opts: 'debtType', def: '房貸' },
    { k: 'name', label: '名稱', type: 'text', req: true, ph: '例：自住房貸' },
    { k: 'bank', label: '負債來源（銀行）', type: 'pick', opts: 'bank', search: true },
    { k: 'mode', label: '計算方式', type: 'pick', opts: 'mode', def: 'auto' },
    { k: 'principal', label: '原始貸款金額', type: 'number', req: true, show: isAuto },
    { k: 'limit', label: '核准額度', type: 'number', req: true, show: isRev },
    { k: 'rate', label: '年利率 (%)', type: 'number', step: '0.001', req: true, half: true },
    { k: 'years', label: '貸款年限（年）', type: 'number', step: '0.5', req: true, show: isAuto, half: true },
    { k: 'startYM', label: '撥款年月', type: 'month', req: true, show: isAuto, half: true, def: thisYM },
    { k: 'payDay', label: '每月扣款日', type: 'number', min: 1, max: 31, half: true },
    { k: 'grace', label: '寬限期', type: 'pick', opts: 'grace', def: '0', show: isAuto },
    { k: 'graceYM', label: '寬限期開始年月（從撥款就開始可不填）', type: 'month', show: v => isAuto(v) && +v.grace > 0 },
    { k: 'method', label: '還款方式', type: 'pick', opts: 'method', def: 'annuity', show: isAuto },
    { k: 'balance', label: '剩餘本金', type: 'number', req: true, show: isManual, half: true },
    { k: 'monthly', label: '每月還款', type: 'number', req: true, show: isManual, half: true },
    { k: 'drawn', label: '已動用金額（投資計畫以外）', type: 'number', show: isRev, half: true, def: '0' },
    { k: 'endYM', label: '額度到期年月（選填）', type: 'month', show: isRev, half: true },
    { panel: 'loanPanel', show: () => true },
    { k: 'note', label: '備註', type: 'text' },
  ],
};
FIELDS.plan = [
  { k: 'name', label: '計畫名稱', type: 'text', req: true, ph: '例：理財型房貸分批投入' },
  { k: 'total', label: '投入總額', type: 'number', req: true, half: true },
  { k: 'months', label: '分幾個月投入', type: 'number', req: true, half: true, def: '12', min: 1, max: 120 },
  { k: 'startYM', label: '第一次投入年月', type: 'month', req: true, half: true, def: thisYM },
  { k: 'day', label: '每月投入日（選填）', type: 'number', min: 1, max: 31, half: true },
  { k: 'source', label: '資金來源', type: 'pick', opts: 'planSource', def: 'self' },
  { k: 'targets', label: '投資標的（選填，可寫比例）', type: 'text', ph: '例：0050 50%、00878 30%、VOO 20%' },
  { k: 'yieldPct', label: '預估年化報酬／殖利率 %（選填）', type: 'number', step: '0.1', half: true },
  { panel: 'planPanel', show: () => true },
  { k: 'note', label: '備註', type: 'text' },
];
const KEY = { asset: 'assets', debt: 'debts', plan: 'plans' };
const KIND_NAME = { asset: '資產', debt: '負債', plan: '投資計畫', '': '' };
const KIND_ICON = { asset: 'piggy', debt: 'card', plan: 'invest' };
const NUMERIC = new Set(['amount', 'ping', 'buyYear', 'buyPrice', 'principal', 'rate', 'years', 'payDay', 'balance', 'monthly', 'shares', 'cost', 'manualPrice', 'limit', 'drawn', 'total', 'months', 'day', 'yieldPct']);

// ---------- 編輯器 ----------
let editing = null;
let vals = {};

function fieldHTML(f) {
  if (f.sec) return `<div class="sec" data-show>${f.sec[0] === 'car' ? UI.carIcon() : Icon(f.sec[0])}<span>${f.sec[1]}</span></div>`;
  if (f.panel) return `<div class="panel" id="${f.panel}" data-show></div>`;
  const v = vals[f.k] ?? '';
  const cls = `field${f.half ? ' half' : ''}`;
  const hint = f.hintFn ? `<small class="hint">${f.hintFn(vals)}</small>` : '';
  if (f.type === 'pick') {
    const label = (PICK_LABEL[f.opts] || PICK_LABEL[f.k] || (x => x))(v, vals);
    return `<div class="${cls}" data-show data-k="${f.k}"><span class="flabel">${f.label}</span>
      <button type="button" class="pickbtn${v ? '' : ' empty'}" data-pick="${f.k}">${v ? (PICK_ICON[f.opts] || (() => ''))(v, vals) : Icon('plus')}<span>${esc(label || '請選擇')}</span><i>›</i></button></div>`;
  }
  const attrs = f.type === 'number' ? `inputmode="decimal" step="${f.step || 'any'}"${f.min ? ` min="${f.min}"` : ''}${f.max ? ` max="${f.max}"` : ''}` : '';
  return `<label class="${cls}" data-show data-k="${f.k}"><span class="flabel">${f.label}</span>
    <span class="inrow"><input name="${f.k}" type="${f.type}" ${attrs} value="${esc(v)}" placeholder="${esc(f.ph || '')}" data-req="${f.req ? 1 : ''}">
    ${f.action ? `<button type="button" class="btn mini" id="${f.action.id}">${Icon.svg('search', 18)} ${f.action.text}</button>` : ''}</span>${hint}</label>`;
}

function openEditor(kind, id) {
  const list = state[KEY[kind]];
  const item = id ? list.find(x => x.id === id) : null;
  editing = { kind, id };
  vals = item ? { ...item } : {};
  FIELDS[kind].forEach(f => { if (f.k && vals[f.k] == null && f.def != null) vals[f.k] = typeof f.def === 'function' ? f.def() : f.def; });
  $('editTitle').innerHTML = `${Icon(KIND_ICON[kind])} ${id ? '編輯' : '新增'}${KIND_NAME[kind]}`;
  $('delBtn').style.display = id ? '' : 'none';
  drawForm();
  $('editor').showModal();
  if (kind === 'asset') Stocks.load().then(() => { if ($('editor').open && isStock(vals)) drawForm(); });
}

function drawForm() {
  $('editFields').innerHTML = FIELDS[editing.kind].map(fieldHTML).join('');
  refreshForm();
}

function refreshForm() {
  const fs = FIELDS[editing.kind];
  const nodes = $('editFields').querySelectorAll('[data-show]');
  fs.forEach((f, i) => {
    const on = !f.show || f.show(vals);
    nodes[i].hidden = !on;
    const inp = nodes[i].querySelector('input');
    if (inp) inp.required = on && inp.dataset.req === '1';
  });
  if (editing.kind === 'debt') drawLoanPanel();
  if (editing.kind === 'asset' && isCar(vals)) drawCarPanels();
  if (editing.kind === 'asset' && isRE(vals)) drawLvrPanel();
  if (editing.kind === 'asset' && isStock(vals)) drawStockPanel();
  if (editing.kind === 'plan') drawPlanPanel();
}

function readInputs() {
  $('editFields').querySelectorAll('input[name]').forEach(i => { vals[i.name] = i.value; });
}

$('editFields').addEventListener('input', e => {
  if (!e.target.name) return;
  vals[e.target.name] = e.target.value;
  if (editing.kind === 'debt') drawLoanPanel();
  if (editing.kind === 'plan') drawPlanPanel();
  if (editing.kind === 'asset' && isCar(vals) && ['buyYear', 'buyPrice', 'model'].includes(e.target.name)) drawCarPanels();
  if (editing.kind === 'asset' && isRE(vals) && e.target.name === 'ping') drawLvrPanel();
  if (editing.kind === 'asset' && isStock(vals) && ['shares', 'cost', 'manualPrice'].includes(e.target.name)) drawStockPanel();
});

$('editFields').addEventListener('click', async e => {
  const pb = e.target.closest('[data-pick]');
  if (pb) {
    readInputs();
    const k = pb.dataset.pick;
    const f = FIELDS[editing.kind].find(x => x.k === k);
    let options;
    try { options = await OPTS[f.opts](vals); } catch (err) { return toast(err.message); }
    const isStk = f.opts === 'stock';
    const isModel = f.opts === 'carModel';
    if (!options.length && !isStk) return toast(k === 'district' ? '請先選縣市' : k === 'road' ? '請先選行政區' : '沒有選項');
    const o = await UI.openPicker({
      title: isStk ? (mktOf(vals) === 'us' ? '美股代號' : '台股代號') : f.label, options, value: vals[k],
      search: f.search || isStk || isModel || options.length > 8, limit: isStk ? 40 : 0,
      placeholder: isStk ? (mktOf(vals) === 'us' ? '輸入代號，例如 AAPL、VOO' : '輸入代號或名稱，例如 2330、0050、台積電') : '',
      custom: isStk ? q => !/^[A-Za-z0-9.\-]{1,10}$/.test(q) ? null : opt(Stocks.norm(mktOf(vals), q), `使用「${Stocks.norm(mktOf(vals), q)}」`, Icon('pencil'), '沒有自動報價，之後手動填股價')
        : isModel ? q => opt(q, `使用「${q}」`, Icon('pencil'), '清單沒有的車款') : null,
    });
    if (!o) return;
    const prev = vals[k];
    vals[k] = o.value;
    if (k === 'county' && prev !== o.value) { vals.district = ''; vals.road = ''; }
    if (k === 'district' && prev !== o.value) vals.road = '';
    if (k === 'type' && !editing.id) vals.mode = o.value === '理財型房貸' ? 'revolving' : ['信用卡', '親友借款'].includes(o.value) ? 'manual' : 'auto';
    if (k === 'category') {
      if (o.value === '不動產' && !vals.name) vals.name = '自住房';
      if (mktOf({ category: prev }) !== mktOf(vals)) { vals.sym = ''; }
    }
    if (k === 'brand') {
      if (!vals.name) vals.name = brandOf(o.value)?.t === 'scooter' ? '機車' : '愛車';
      if (prev !== o.value) { vals.model = ''; }
    }
    drawForm();
    return;
  }
  if (e.target.closest('#lookupBtn')) return lookupAddress();
  const ap = e.target.closest('[data-apply]');
  if (ap) {
    vals.amount = ap.dataset.apply;
    if (ap.dataset.lvr) vals.lvrAt = new Date().toISOString();
    const inp = $('editFields').querySelector('input[name=amount]');
    inp.value = vals.amount;
    inp.classList.remove('flash'); void inp.offsetWidth; inp.classList.add('flash');
    toast('已套用估價');
  }
  const qs = e.target.closest('[data-shares]');
  if (qs) {
    const inp = $('editFields').querySelector('input[name=shares]');
    inp.value = num(inp.value) + num(qs.dataset.shares);
    vals.shares = inp.value;
    drawStockPanel();
  }
});

// --- 股票面板 ---
function drawStockPanel() {
  const el = $('stockPanel');
  if (!el) return;
  const mkt = mktOf(vals);
  if (!vals.sym) {
    el.innerHTML = `<div class="hint-row">${Icon(mkt === 'us' ? 'us' : 'tw')}<span>${Stocks.ready() ? '點上面選股票代號，會自動帶出最新收盤價與走勢' : '報價資料讀取中，或尚未產生（GitHub Action 每天收盤後更新）'}</span></div>`;
    return;
  }
  const q = Stocks.quote(mkt, vals.sym);
  const ccy = mkt === 'us' ? 'USD' : 'TWD';
  const px = q ? q.price : num(vals.manualPrice);
  const sh = num(vals.shares), k = Stocks.fx(ccy, state.currency);
  const val = sh * px * k;
  const cost = num(vals.cost);
  const tw = mkt === 'tw';
  const chgCls = q ? (q.chg > 0 ? 'up' : q.chg < 0 ? 'down' : '') : '';
  el.innerHTML = (q ? `<div class="stock-head"><div><b>${esc(q.sym)} ${esc(q.name)}</b><div class="small muted">${esc(q.date || '')} 收盤</div></div>
      <div class="r"><b class="big-px">${price(q.price, ccy)}</b><div class="chg ${chgCls}">${q.chg >= 0 ? '+' : ''}${q.chg.toFixed(2)}（${q.chgPct >= 0 ? '+' : ''}${q.chgPct.toFixed(2)}%）</div></div></div>
      <div class="chart-box">${UI.sparkline(q.series, 280, 60, { tw, dot: true, sw: 2 })}</div>`
    : `<div class="hint-row">${Icon('search')}<span>找不到「${esc(vals.sym)}」的自動報價，請在下方手動填目前股價</span></div>`) +
    (tw ? `<div class="quick">${[1000, 100, 1].map(n => `<button type="button" class="btn mini" data-shares="${n}">+${n === 1000 ? '1 張' : n + ' 股'}</button>`).join('')}</div>` : '') +
    (sh && px ? `<div class="kv"><span>市值</span><b class="accent">${fmt(val)}</b></div>` : '') +
    (sh && px && ccy !== state.currency ? `<div class="small muted">以匯率 1 ${ccy} ≈ ${k.toFixed(k < 1 ? 4 : 2)} ${state.currency} 換算</div>` : '') +
    (sh && px && cost ? (() => { const pl = (px - cost) * sh * k; return `<div class="kv"><span>未實現損益</span><span class="chg ${pl > 0 ? 'up' : pl < 0 ? 'down' : ''}">${pl >= 0 ? '+' : ''}${fmt(pl)}（${((px - cost) / cost * 100).toFixed(1)}%）</span></div>`; })() : '');
}

// --- 貸款試算面板 ---
function drawLoanPanel() {
  const el = $('loanPanel');
  if (!el) return;
  const d = { ...vals };
  if (isRev(d)) {
    const r = num(d.rate) / 100 / 12;
    const linked = state.plans.filter(p => p.source === d.id && d.id);
    const st = d.id ? Plan.revolvingStatus({ ...d }, state.plans) : null;
    el.innerHTML = `<div class="panel-title">${Icon('hourglass')} 理財型額度</div>
      <div class="kv"><span>目前已動用</span><b>${fmt(st ? st.balance : num(d.drawn))}</b></div>
      <div class="kv"><span>目前每月利息</span><b class="accent">${fmt((st ? st.balance : num(d.drawn)) * r)}</b></div>
      <div class="kv"><span>每動用 100 萬，每月利息</span><span>${fmt(1e6 * r)}</span></div>
      ${num(d.limit) ? `<div class="kv"><span>全額動用每月利息</span><span class="neg">${fmt(num(d.limit) * r)}</span></div>` : ''}
      ${linked.length ? `<div class="small muted">已連結投資計畫：${linked.map(p => esc(p.name)).join('、')}（已動用會依投入進度自動增加）</div>`
        : `<div class="small muted">${d.id ? '' : '先儲存，'}到「投資」分頁新增計畫並把資金來源選這筆額度，已動用金額與利息就會依投入進度自動遞增。</div>`}`;
    return;
  }
  const ok = isAuto(d) ? num(d.principal) > 0 && num(d.years) > 0 && d.startYM : num(d.balance) > 0;
  if (!ok) { el.innerHTML = `<div class="hint-row">${Icon('calc')}<span>${isAuto(d) ? '填入貸款金額、年限與撥款年月，就會自動算出月付' : '填入剩餘本金與月付，估算還清時間'}</span></div>`; return; }
  const s = Plan.status(d, state.plans);
  const rows = [['目前每月還款', `<b class="accent">${fmt(s.monthly)}</b>`], ['剩餘本金', fmt(s.balance)]];
  if (isAuto(d)) rows.push(['已繳期數', `${s.paid} / ${s.total} 期`]);
  if (s.inGrace) rows.push(['寬限期', `剩 ${s.graceLeft} 個月，${s.graceEndYM} 結束`], ['寬限期後月付', `<b class="neg">${fmt(s.afterGracePay)}</b>`]);
  rows.push(['預計還清', isFinite(s.monthsLeft) ? `${s.payoffYM}（剩 ${s.monthsLeft} 期）` : '<span class="neg">月付不足以還清</span>']);
  rows.push(['剩餘利息', isFinite(s.interestLeft) ? fmt(s.interestLeft) : '—']);
  el.innerHTML = `<div class="panel-title">${Icon('calc')} 試算結果</div>` + rows.map(([a, b]) => `<div class="kv"><span>${a}</span><span>${b}</span></div>`).join('');
}

// --- 車輛 ---
function carValue(price, year) {
  const age = Math.max(0, new Date().getFullYear() - num(year));
  const v = price * (age === 0 ? 1 : 0.8 * Math.pow(0.88, age - 1));
  return Math.round(Math.max(v, price * 0.1));
}
function drawCarPanels() {
  const b = brandOf(vals.brand);
  const pv = $('carPreview');
  const type = b ? Car.typeOf(b.v, vals.model, ({ sport: 'coupe', ev: 'evcross' })[b.t] || b.t) : 'sedan';
  const color = vals.carColor || (b ? b.c : '#cfd8dc');
  if (pv) pv.innerHTML = `<div class="car-stage">${Car.svg(type, color, 260)}<div class="road"></div></div>
    <div class="car-name">${b ? esc(b.zh === b.v ? b.v : b.zh + ' ' + b.v) + ' ' + esc(vals.model || '') : '先選廠牌'} <small class="muted">${b ? esc(BODY_ZH[type] || '') + ' · ' + esc(b.f) : ''}</small></div>`;
  const el = $('carPanel');
  if (!el) return;
  const pr = num(vals.buyPrice), year = num(vals.buyYear);
  if (!pr || !year) { el.innerHTML = `<div class="hint-row">${Icon('down')}<span>填入購入年份與價格，可估算目前殘值</span></div>`; return; }
  const v = carValue(pr, year);
  el.innerHTML = `<div class="kv"><span>估算殘值（車齡 ${Math.max(0, new Date().getFullYear() - year)} 年）</span><b class="accent">${fmt(v)}</b></div>
    <button type="button" class="btn mini primary" data-apply="${v}">套用為目前價值</button>
    <div class="muted small">依一般折舊估算（首年約 -20%，之後每年約 -12%），實際以中古車行情為準。</div>`;
}

// --- 實價登錄 ---
let lvrToken = 0;
async function lookupAddress() {
  readInputs();
  if (!vals.address) return toast('請先輸入地址');
  const btn = $('lookupBtn');
  btn.disabled = true; btn.textContent = '查詢中…';
  try {
    const r = await LVR.parseAddress(vals.address);
    vals.county = r.countyKey; vals.district = r.district; vals.road = r.road;
    if (!r.district) toast('找不到行政區，請手動選擇');
    else if (!r.road) toast('找不到這條路的成交，改用行政區行情');
    drawForm();
  } catch (err) {
    toast(err.message);
    btn.disabled = false; btn.textContent = '查實價';
  }
}

async function drawLvrPanel() {
  const el = $('lvrPanel');
  if (!el) return;
  if (!vals.county || !vals.district) {
    el.innerHTML = `<div class="hint-row">${Icon('townhouse')}<span>輸入地址按「查實價」，或選縣市與行政區，會用近兩年實價登錄估算價值</span></div>`;
    return;
  }
  const tk = ++lvrToken;
  el.innerHTML = `<div class="hint-row">${Icon('hourglass')}<span>讀取實價登錄資料…</span></div>`;
  try {
    const r = await LVR.estimate({ countyKey: vals.county, district: vals.district, road: vals.road, btype: vals.btype, ping: vals.ping });
    if (tk !== lvrToken) return;
    const where = r.level === 'road' ? `${vals.road}` : `${vals.district}全區`;
    const tx = r.tx.slice(0, 6).map(t => `<li><span>${esc(t[0])} · ${esc(t[2])}${t[6] ? ' · ' + esc(t[6]) : ''}<small>${esc(t[1])}</small></span><span>${wan(t[4])}/坪<small>${t[3]} 坪 · 總 ${wan(t[5])}</small></span></li>`).join('');
    el.innerHTML = `<div class="panel-title">${Icon('chart')} ${esc(where)}${r.typed ? '・' + esc(vals.btype) : ''} 行情</div>
      <div class="kv"><span>成交單價中位數</span><b class="accent">${wan(r.unit)} / 坪</b></div>
      <div class="kv"><span>常見區間（中間 50%）</span><span>${wan(r.p25)} ～ ${wan(r.p75)} / 坪</span></div>
      <div class="kv"><span>樣本</span><span>${r.n} 筆</span></div>
      ${r.level === 'district' && vals.road ? '<div class="muted small">這條路段樣本不足，改用行政區行情</div>' : ''}
      ${r.value ? `<div class="estimate"><div><small>估算價值（${vals.ping} 坪）</small><b>${fmt(r.value)}</b><small>${fmt(r.low)} ～ ${fmt(r.high)}</small></div>
        <button type="button" class="btn mini primary" data-apply="${r.value}" data-lvr="1">套用</button></div>` : '<div class="muted small">填入坪數即可估算總價</div>'}
      ${tx ? `<details><summary>最近成交 ${Math.min(6, r.tx.length)} 筆</summary><ul class="tx">${tx}</ul></details>` : ''}
      <div class="muted small">資料：內政部實價登錄（${esc(r.seasons?.[0] || '')}～${esc(r.seasons?.at(-1) || '')}），單價已扣除車位，僅供參考。</div>`;
  } catch (err) {
    if (tk !== lvrToken) return;
    el.innerHTML = `<div class="hint-row">${Icon('warn')}<span>${esc(err.message)}。資料每週自動更新，也可以先手動輸入目前價值。</span></div>`;
  }
}

// --- 點擊：開啟、展開、分組 ---
document.addEventListener('click', e => {
  if (e.target.closest('dialog')) return;
  const add = e.target.closest('[data-add]');
  if (add && add.dataset.add) return openEditor(add.dataset.add);
  const ed = e.target.closest('[data-edit]');
  if (ed) return openEditor(ed.dataset.edit, ed.dataset.id);
  const ex = e.target.closest('[data-expand]');
  if (ex) {
    const id = ex.dataset.expand;
    openStocks.has(id) ? openStocks.delete(id) : openStocks.add(id);
    ex.classList.toggle('open');
    return;
  }
  const g = e.target.closest('[data-group]');
  if (g) {
    const k = g.dataset.group;
    openGroups.has(k) ? openGroups.delete(k) : openGroups.add(k);
    g.parentElement.classList.toggle('open');
  }
});

$('editForm').addEventListener('submit', e => {
  e.preventDefault();
  readInputs();
  if (editing.kind === 'debt' && !vals.bank) return toast('請選擇負債來源');
  if (editing.kind === 'asset' && isStock(vals) && !vals.sym) return toast('請選擇股票代號');
  const obj = {};
  for (const f of FIELDS[editing.kind]) {
    if (!f.k) continue;
    if (f.show && !f.show(vals)) continue;
    const v = vals[f.k];
    obj[f.k] = NUMERIC.has(f.k) ? (v === '' || v == null ? '' : num(v)) : String(v ?? '').trim();
  }
  if (vals.lvrAt && isRE(vals)) obj.lvrAt = vals.lvrAt;
  if (editing.kind === 'asset' && isStock(obj)) {
    const q = Stocks.quote(mktOf(obj), obj.sym);
    obj.name = q ? q.name : obj.sym;
    obj.amount = Math.round(assetValue(obj));
  }
  obj.updatedAt = new Date().toISOString();
  const key = KEY[editing.kind];
  if (editing.id) state[key] = state[key].map(x => x.id === editing.id ? { id: x.id, ...obj } : x);
  else { const id = uid(); state[key].push({ id, ...obj }); openGroups.add(obj.category); }
  $('editor').close();
  UI.burst(editing.kind === 'asset' ? 'coin' : 'heart');
  save();
});
$('cancelBtn').addEventListener('click', () => $('editor').close());
$('delBtn').addEventListener('click', () => {
  if (!confirm('確定刪除這筆？')) return;
  const key = KEY[editing.kind];
  state[key] = state[key].filter(x => x.id !== editing.id);
  $('editor').close();
  save();
});


// ================= 還款計畫 =================
const EV_INFO = {
  graceEnd: { ic: 'warn', t: '寬限期結束，開始還本金' },
  graceStart: { ic: 'pause', t: '寬限期開始，只繳利息' },
  payoff: { ic: 'heart', t: '還清了' },
  drawFull: { ic: 'invest', t: '投資計畫投入完成，利息到頂' },
  lineEnd: { ic: 'lock', t: '額度到期，需展延或還本' },
};
const dateTxt = d => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
const daysTxt = n => n < 0 ? '已過' : n === 0 ? '今天' : n < 60 ? `還有 ${n} 天` : n < 730 ? `還有 ${n} 天（約 ${Math.round(n / 30)} 個月）` : `還有 ${n} 天（約 ${(n / 365).toFixed(1)} 年）`;
function eventHTML(e, compact) {
  const info = EV_INFO[e.type];
  const diff = e.to - e.from;
  const soon = e.days <= 90 && e.type === 'graceEnd';
  const change = e.type === 'lineEnd' ? '' : e.type === 'payoff'
    ? `每月少繳 <b class="pos">${fmt(e.from)}</b>`
    : `${e.debt.mode === 'revolving' ? '每月利息' : '月付'} ${fmt(e.from)} → <b class="${diff > 0 ? 'neg' : 'pos'}">${fmt(e.to)}</b>（${diff > 0 ? '+' : ''}${fmt(diff)}）`;
  return `<div class="ev ${e.type} ${soon ? 'soon' : ''}">${Icon(info.ic)}
    <div class="grow"><div class="ev-title"><b>${esc(e.debt.name)}</b> ${info.t}</div>
    <div class="ev-date">${dateTxt(e.date)} · <span class="${soon ? 'neg' : ''}">${daysTxt(e.days)}</span></div>
    ${change ? `<div class="ev-change">${change}</div>` : ''}
    ${!compact && e.total != null && e.type !== 'lineEnd' ? `<div class="ev-total">當月起總月付約 <b>${fmt(e.total)}</b></div>` : ''}</div></div>`;
}

let repayH = 36, repaySel = 0, repayOpen = new Set();
function projection(h) { return Plan.project(state.debts, state.plans, h); }

function renderHomeRepay() {
  const card = $('homeRepay');
  if (!state.debts.length) { card.hidden = true; return; }
  card.hidden = false;
  const P = projection(24);
  const m0 = P.months[0];
  const rows = state.debts.map(d => ({ d, it: m0.items[d.id] })).filter(x => x.it && x.it.pay > 0);
  const next = P.events.find(e => e.days >= 0 && e.type !== 'lineEnd');
  const spark = UI.sparkline(P.months.map(m => m.total), 300, 44, { color: '#14b8a6', sw: 2 });
  $('homeRepayBody').innerHTML = `
    <div class="hr-total"><span>本月應繳</span><b>${fmt(m0.total)}</b></div>
    ${rows.map(({ d, it }) => `<div class="hr-row"><span class="dot" style="--c:${debtColor(d)}"></span><span class="grow">${esc(d.name)}
      ${it.grace ? '<span class="chip">寬限期</span>' : ''}${it.revolving ? '<span class="chip blue">只繳息</span>' : ''}${it.paid ? '<span class="chip gray">已扣款</span>' : ''}</span>
      <span>${fmt(it.pay)}</span></div>`).join('')}
    ${next ? `<div class="hr-next">${Icon(EV_INFO[next.type].ic)}<div><b>下一個變化</b>：${esc(next.debt.name)} ${EV_INFO[next.type].t}<br><small>${dateTxt(next.date)}（${daysTxt(next.days)}）· ${next.type === 'payoff' ? `每月少 ${fmt(next.from)}` : `月付 ${next.to - next.from >= 0 ? '+' : ''}${fmt(next.to - next.from)}`}</small></div></div>` : ''}
    <div class="hr-spark"><div class="small muted">未來 24 個月總月付</div>${spark}</div>`;
}

function renderRepay() {
  const el = $('repayBody');
  if (!state.debts.length) {
    el.innerHTML = `<div class="card empty big-empty">${Icon('repay', 'ico-xl')}<p>先到「負債」新增貸款，這裡就會推算你未來每個月要繳多少</p></div>`;
    return;
  }
  const all = Plan.horizonAll(state.debts);
  const H = repayH === 0 ? all : repayH;
  const P = projection(Math.max(H, 13));
  const months = P.months.slice(0, H);
  repaySel = Math.min(repaySel, months.length - 1);
  const series = state.debts.map(d => ({ id: d.id, color: debtColor(d), d }));
  const next12 = P.months.slice(0, 12).reduce((t, m) => t + m.total, 0);
  const peak = months.reduce((a, m) => (Math.round(m.total) > Math.round(a.total) ? m : a), months[0]);
  const PA = projection(all);
  const evAll = PA.events.filter(e => e.days >= 0 || e.ym === P.cur);
  const markers = {};
  P.events.forEach(e => { const k = Loan.ymDiff(P.cur, e.ym); if (k >= 0 && k < H && e.type === 'graceEnd') markers[k] = '#e53935'; else if (k >= 0 && k < H && !markers[k] && e.type !== 'lineEnd') markers[k] = '#90a4ae'; });
  const sel = months[repaySel];
  const selRows = series.map(s => ({ s, it: sel.items[s.id] })).filter(x => x.it && x.it.pay > 0);
  const tableRows = months.map((m, k) => {
    const prev = k ? months[k - 1].total : m.total, diff = m.total - prev;
    const evs = P.events.filter(e => e.ym === m.ym && e.type !== 'lineEnd');
    const open = repayOpen.has(m.ym);
    return `<li class="mrow ${evs.length ? 'has-ev' : ''} ${open ? 'open' : ''}" data-ym="${m.ym}">
      <div class="mrow-head"><span class="mym">${m.ym.replace('-', '/')}</span>
        <span class="grow">${evs.map(e => `<span class="chip ${e.type === 'graceEnd' ? 'red' : e.type === 'payoff' ? 'green' : 'blue'}">${esc(e.debt.name)}${e.type === 'graceEnd' ? '寬限期結束' : e.type === 'graceStart' ? '寬限期開始' : e.type === 'payoff' ? '還清' : '投入完成'}</span>`).join('')}</span>
        <span class="mtot">${fmt(m.total)}${k && Math.abs(diff) >= 1 ? `<small class="${diff > 0 ? 'neg' : 'pos'}">${diff > 0 ? '▲' : '▼'}${fmt(Math.abs(diff))}</small>` : ''}</span></div>
      <div class="mrow-detail">${series.map(s => { const it = m.items[s.id]; if (!it || it.pay <= 0) return ''; return `<div class="kv"><span><span class="dot" style="--c:${s.color}"></span>${esc(s.d.name)}${it.grace ? ' · 寬限期' : ''}${it.revolving ? ' · 只繳息' : ''}</span><span>${fmt(it.pay)}<small class="muted"> 本 ${fmt(it.principal)} / 息 ${fmt(it.interest)}</small></span></div>`; }).join('')}</div></li>`;
  }).join('');
  el.innerHTML = `
    <div class="card repay-sum">
      <div class="rs"><span>本月應繳</span><b>${fmt(P.months[0].total)}</b></div>
      <div class="rs"><span>下個月</span><b>${fmt(P.months[1]?.total || 0)}</b></div>
      <div class="rs"><span>未來 12 個月合計</span><b>${fmt(next12)}</b></div>
      <div class="rs"><span>期間最高月付</span><b class="neg">${fmt(peak.total)}</b><small>${peak.ym.replace('-', '/')} 起</small></div>
    </div>
    <div class="card">
      <h2>${Icon.svg('warn', 24)} 重要時間點</h2>
      ${evAll.length ? evAll.map(e => eventHTML(e)).join('') : '<div class="empty">沒有即將發生的變化</div>'}
    </div>
    <div class="card">
      <h2>${Icon.svg('chart', 24)} 未來每月要繳多少</h2>
      <div class="chips">${[[12, '1 年'], [36, '3 年'], [60, '5 年'], [120, '10 年'], [0, '全部']].map(([v, t]) => `<button type="button" class="chip-btn ${repayH === v ? 'on' : ''}" data-h="${v}">${t}</button>`).join('')}</div>
      <div class="chart-wrap" id="repayChart">${Charts.stacked(months, series, { selected: repaySel, markers })}</div>
      <div class="legend">${series.map(s => `<span><span class="dot" style="--c:${s.color}"></span>${esc(s.d.name)}</span>`).join('')}<span><span class="tri"></span>寬限期結束</span></div>
      <div class="sel-box"><div class="sel-head"><b>${sel.ym.replace('-', '/')}</b><b>${fmt(sel.total)}</b></div>
        ${selRows.map(({ s, it }) => `<div class="kv"><span><span class="dot" style="--c:${s.color}"></span>${esc(s.d.name)}${it.grace ? ' · 寬限期' : ''}${it.revolving ? ' · 只繳息' : ''}</span><span>${fmt(it.pay)}</span></div>`).join('') || '<div class="muted small">這個月沒有要繳的</div>'}
        <div class="small muted">點圖上的月份看那個月的明細</div></div>
    </div>
    <div class="card">
      <h2>${Icon.svg('calendar', 24)} 逐月明細</h2>
      <ul class="mlist">${tableRows}</ul>
    </div>`;
}

document.addEventListener('click', e => {
  const h = e.target.closest('[data-h]');
  if (h && h.closest('#view-repay')) { repayH = +h.dataset.h; repaySel = 0; renderRepay(); return; }
  const bar = e.target.closest('#repayChart [data-k]');
  if (bar) { repaySel = +bar.dataset.k; renderRepay(); return; }
  const mr = e.target.closest('.mrow');
  if (mr) { const ym = mr.dataset.ym; repayOpen.has(ym) ? repayOpen.delete(ym) : repayOpen.add(ym); mr.classList.toggle('open'); }
});

// ================= 投資計畫 =================
function parseTargets(t) {
  const out = [];
  String(t || '').replace(/([^\s,，、;；]+)\s*(\d+(?:\.\d+)?)\s*%/g, (m, name, p) => { out.push({ name, pct: +p }); });
  return out;
}
function planRows(p) {
  const pr = Plan.progress(p);
  const src = state.debts.find(d => d.id === p.source);
  const r = src ? num(src.rate) / 100 / 12 : 0;
  let cum = 0;
  return pr.amounts.map((planned, i) => {
    const st = Plan.periodState(p, i);
    const amt = st === 'done' ? num(p.done[i]) : planned;
    cum += amt;
    const base = src ? num(src.drawn) : 0;
    return { i, ym: Loan.ymAdd(p.startYM, i), planned, amt, cum, state: st, interest: src ? Math.min(cum + base, num(src.limit) || Infinity) * r : 0 };
  });
}
function renderInvest() {
  const el = $('investBody');
  if (!state.plans.length) {
    el.innerHTML = `<div class="card empty big-empty">${Icon('invest', 'ico-xl')}<p>還沒有投資計畫</p>
      <p class="muted">例如理財型房貸 1,460 萬分 15 個月投入：新增計畫、資金來源選那筆理財型房貸，就會自動算出每月投入、利息怎麼遞增，還款計畫也會跟著更新。</p>
      <button type="button" class="btn primary" data-add="plan">新增投資計畫</button></div>`;
    return;
  }
  el.innerHTML = state.plans.map(p => {
    const pr = Plan.progress(p);
    const rows = planRows(p);
    const src = state.debts.find(d => d.id === p.source);
    const rs = src ? Plan.revolvingStatus(src, state.plans) : null;
    const curIdx = Math.max(-1, Math.min(rows.length - 1, Loan.ymDiff(p.startYM, Loan.nowYM())));
    const nowRow = rows[curIdx] && rows[curIdx].state !== 'done' && curIdx >= 0 && Loan.ymDiff(p.startYM, Loan.nowYM()) < rows.length ? rows[curIdx] : null;
    const nextRow = rows.find(r => r.state === 'future');
    const targets = parseTargets(p.targets);
    const y = num(p.yieldPct) / 100;
    const fullInt = rs ? rs.fullInterest : 0;
    const income = y ? num(p.total) * y / 12 : 0;
    const assumed = rows.filter(r => r.state === 'assumed').length;
    return `<div class="card plan-card">
      <div class="plan-head"><div><h2>${Icon.svg('invest', 26)} ${esc(p.name)}</h2>
        <div class="small muted">${src ? `${UI.bankIcon(bankOf(src.bank))}` : ''}資金來源：${src ? esc(src.name) + ` · 利率 ${pct(num(src.rate))}` : '自有資金'}</div></div>
        <button type="button" class="btn mini" data-edit="plan" data-id="${p.id}">${Icon.svg('pencil', 16)} 編輯</button></div>
      <div class="plan-top">${Charts.ring(pr.invested / (pr.total || 1))}
        <div class="plan-stats">
          <div class="kv"><span>已投入</span><b class="accent">${fmt(pr.invested)}</b></div>
          <div class="kv"><span>總額</span><span>${fmt(pr.total)}</span></div>
          <div class="kv"><span>進度</span><span>第 ${Math.min(pr.current, pr.n)} / ${pr.n} 期</span></div>
          ${nowRow ? `<div class="kv"><span>本月要投入</span><b>${fmt(nowRow.amt)}</b></div>` : nextRow ? `<div class="kv"><span>下次投入</span><span>${nextRow.ym.replace('-', '/')} · ${fmt(nextRow.amt)}</span></div>` : '<div class="kv"><span>狀態</span><b class="pos">全部投入完成</b></div>'}
        </div></div>
      ${assumed ? `<div class="hint-row warn-row">${Icon('warn')}<span>有 ${assumed} 期已過但還沒確認，先當作照計畫投入。點下面那期就能確認實際金額。</span></div>` : ''}
      ${rs ? `<div class="int-box"><div class="kv"><span>目前每月利息</span><b>${fmt(rs.monthly)}</b></div>
        <div class="kv"><span>全部投入後每月利息（${rs.fullYM || ''} 起）</span><b class="neg">${fmt(rs.fullInterest)}</b></div>
        <div class="kv"><span>每多投入 100 萬，每月利息增加</span><span>${fmt(1e6 * num(src.rate) / 100 / 12)}</span></div></div>` : ''}
      ${y ? `<div class="cf-box"><div class="panel-title">${Icon('scale')} 全部投入後的每月現金流（估算）</div>
        <div class="cf-bars"><div class="cf"><span>預估收益</span><div class="cf-track"><div class="cf-fill pos-bg" style="width:${Math.min(100, income / Math.max(income, fullInt, 1) * 100)}%"></div></div><b class="pos">${fmt(income)}</b></div>
        <div class="cf"><span>利息成本</span><div class="cf-track"><div class="cf-fill neg-bg" style="width:${Math.min(100, fullInt / Math.max(income, fullInt, 1) * 100)}%"></div></div><b class="neg">${fmt(fullInt)}</b></div></div>
        <div class="kv"><span>每月淨額</span><b class="${income - fullInt >= 0 ? 'pos' : 'neg'}">${income - fullInt >= 0 ? '+' : ''}${fmt(income - fullInt)}</b></div>
        <div class="small muted">以總額 × ${pct(num(p.yieldPct))} ÷ 12 估算；${src ? `損益兩平的年化報酬約 ${pct(num(src.rate))}。` : ''}實際報酬會波動，僅供參考。</div></div>` : ''}
      <div class="chart-wrap">${Charts.invest(rows, { current: curIdx })}</div>
      <div class="legend"><span><span class="dot" style="--c:#14b8a6"></span>累計投入（左軸）</span>${src ? '<span><span class="dot" style="--c:#ff7043"></span>投入後每月利息（右軸）</span>' : ''}</div>
      ${targets.length ? `<div class="targets"><div class="small muted">每期分配（以每期 ${fmt(pr.amounts[0])} 計）</div>${targets.map(t => `<span class="chip blue">${esc(t.name)} ${t.pct}% · ${short(pr.amounts[0] * t.pct / 100)}</span>`).join('')}</div>` : p.targets ? `<div class="small muted">標的：${esc(p.targets)}</div>` : ''}
      <ul class="plist">${rows.map(r => `<li class="prow ${r.state}" data-plan="${p.id}" data-i="${r.i}">
        <span class="pnum">${r.i + 1}</span>
        <div class="grow"><div><b>${r.ym.replace('-', '/')}${p.day ? '/' + String(p.day).padStart(2, '0') : ''}</b> ${({ done: '<span class="chip green">已確認</span>', assumed: '<span class="chip gray">未確認</span>', now: '<span class="chip red">本月</span>', future: '' })[r.state]}</div>
          <div class="sub">累計 ${short(r.cum)}${src ? ` · 之後每月利息 ${fmt(r.interest)}` : ''}</div></div>
        <div class="pamt">${fmt(r.amt)}${r.state === 'done' && Math.round(r.amt) !== Math.round(r.planned) ? `<small class="muted">計畫 ${fmt(r.planned)}</small>` : ''}</div></li>`).join('')}</ul>
    </div>`;
  }).join('') + `<button type="button" class="btn add-plan" data-add="plan">${Icon.svg('plus', 20)} 再新增一個投資計畫</button>`;
}

// 確認某一期
let periodCtx = null;
document.addEventListener('click', e => {
  const r = e.target.closest('.prow');
  if (!r) return;
  const p = state.plans.find(x => x.id === r.dataset.plan);
  const i = +r.dataset.i;
  const planned = Plan.amounts(p)[i];
  const done = p.done && p.done[i] != null;
  periodCtx = { p, i };
  $('pdTitle').innerHTML = `${Icon('invest')} 第 ${i + 1} 期 · ${Loan.ymAdd(p.startYM, i).replace('-', '/')}`;
  $('pdAmount').value = Math.round(done ? p.done[i] : planned);
  $('pdPlanned').textContent = `計畫金額 ${fmt(planned)}`;
  $('pdUndo').hidden = !done;
  $('periodDialog').showModal();
});
function savePeriod(mode) {
  const { p, i } = periodCtx;
  const v = num($('pdAmount').value);
  if (mode === 'done') { p.done = { ...(p.done || {}), [i]: v }; UI.burst('coin'); }
  if (mode === 'plan') { p.custom = { ...(p.custom || {}) }; p.custom[i] = v; }
  if (mode === 'undo' && p.done) { delete p.done[i]; }
  $('periodDialog').close();
  save();
}
$('pdDone').addEventListener('click', () => savePeriod('done'));
$('pdPlan').addEventListener('click', () => savePeriod('plan'));
$('pdUndo').addEventListener('click', () => savePeriod('undo'));
$('pdCancel').addEventListener('click', () => $('periodDialog').close());

function drawPlanPanel() {
  const el = $('planPanel');
  if (!el) return;
  const t = num(vals.total), n = Math.max(1, Math.round(num(vals.months)));
  if (!t) { el.innerHTML = `<div class="hint-row">${Icon('invest')}<span>填入總額與期數，會自動算出每月投入多少；資金來源選理財型房貸，會一起算出利息怎麼遞增</span></div>`; return; }
  const src = state.debts.find(d => d.id === vals.source);
  const r = src ? num(src.rate) / 100 / 12 : 0;
  const end = vals.startYM ? Loan.ymAdd(vals.startYM, n - 1).replace('-', '/') : '';
  el.innerHTML = `<div class="panel-title">${Icon('calc')} 試算</div>
    <div class="kv"><span>每月投入</span><b class="accent">${fmt(t / n)}</b></div>
    <div class="kv"><span>最後一期</span><span>${end}</span></div>
    ${src ? `<div class="kv"><span>第 1 期後每月利息</span><span>${fmt((num(src.drawn) + t / n) * r)}</span></div>
    <div class="kv"><span>全部投入後每月利息</span><b class="neg">${fmt((num(src.drawn) + t) * r)}</b></div>
    ${num(src.limit) && num(src.drawn) + t > num(src.limit) ? `<div class="small neg">超過核准額度 ${fmt(num(src.limit))}</div>` : ''}` : ''}
    ${num(vals.yieldPct) ? `<div class="kv"><span>預估每月收益（全部投入後）</span><span class="pos">${fmt(t * num(vals.yieldPct) / 100 / 12)}</span></div>` : ''}`;
}

// ---------- 小提示 ----------
let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- 設定 ----------
$('eyeBtn').addEventListener('click', () => setHidden(!hidden));
$('autoHide').checked = !!prefs.autoHide;
$('autoHide').addEventListener('change', e => { prefs.autoHide = e.target.checked; savePrefs(); });
// 切到背景再回來時，若設定為自動隱藏就重新遮住
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && prefs.autoHide && !hidden) { hidden = true; document.body.classList.add('privacy'); } });
$('currencyBtn').addEventListener('click', async () => {
  const o = await UI.openPicker({ title: '幣別', options: CURRENCIES.map(c => opt(c.v, c.label, Icon(c.ic))), value: state.currency });
  if (o) { state.currency = o.value; levelsKey = ''; save(); }
});

$('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'Balanza', version: APP_VERSION, exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `balanza-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.assets) || !Array.isArray(d.debts)) throw new Error('格式不正確');
    if (!confirm(`匯入 ${d.assets.length} 筆資產、${d.debts.length} 筆負債？目前資料將被取代。`)) return;
    state = migrate({ currency: d.currency, assets: d.assets, debts: d.debts });
    save();
    toast('匯入完成');
  } catch (err) {
    alert('匯入失敗：' + err.message);
  } finally {
    e.target.value = '';
  }
});

$('clearBtn').addEventListener('click', () => {
  if (!confirm('確定清除所有資料？建議先匯出備份。')) return;
  state = migrate({ currency: state.currency });
  save();
});

$('mascot').addEventListener('click', () => {
  const m = $('mascot');
  m.classList.remove('poke'); void m.offsetWidth; m.classList.add('poke');
});
$('mascot').addEventListener('animationend', e => { if (e.animationName === 'poke') $('mascot').classList.remove('poke'); });
// 回到 App 時重新開始動畫（有些手機在背景會暫停 SVG 動畫）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { lastLv = null; levelsKey = ''; render(); }
});

// ---------- 啟動 ----------
Icon.hydrate();
document.body.classList.toggle('privacy', hidden);
$('ver').textContent = 'v' + APP_VERSION;
$('clList').innerHTML = changelogHTML(CHANGELOG.slice(0, 3));
(() => {
  let seen = null;
  try { seen = localStorage.getItem('balanza.seenVersion'); } catch (e) { /* ignore */ }
  const hasData = state.assets.length || state.debts.length;
  if (seen !== APP_VERSION) {
    if (hasData) setTimeout(() => openChangelog(true), 900);
    else try { localStorage.setItem('balanza.seenVersion', APP_VERSION); } catch (e) { /* ignore */ }
  }
})();
showView('home');
render();
Stocks.load().then(() => {
  levelsKey = '';
  render();
  const m = Stocks.info();
  $('stockStatus').textContent = m ? `股價資料：台股 ${m.tw?.date || '—'}、美股 ${m.us?.date || '—'} 收盤（${m.tw?.n || 0} + ${m.us?.n || 0} 檔）` : '股價資料：尚未產生（GitHub Action 每天收盤後自動更新）';
});
LVR.loadIndex().then(ix => { $('lvrStatus').textContent = `實價登錄資料：${ix.seasons[0]}～${ix.seasons.at(-1)}，更新於 ${ix.updated.slice(0, 10)}`; })
  .catch(() => { $('lvrStatus').textContent = '實價登錄資料：尚未產生（GitHub Action 會自動下載）'; });

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
}
