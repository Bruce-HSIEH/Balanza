'use strict';

const APP_VERSION = '5.27.3';
const splashT0 = performance.now();
let splashDoneR; const splashDone = new Promise(r => { splashDoneR = r; });   // 開機畫面淡出後才跳其他視窗
const STORE_KEY = 'balanza.v1';
const { esc } = UI;
const $ = id => document.getElementById(id);
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- 資料 ----------
const CAT_MIGRATE = { '股票': '台股', 'ETF/基金': '基金' };
function migrate(d) {
  d = { currency: 'TWD', assets: [], debts: [], plans: [], ...d };
  d.ai = { on: true, provider: 'claude', key: '', model: 'claude-haiku-5-5', gkey: '', gmodel: 'gemini-3.1-flash-lite', ...(d.ai || {}) };
  d.bills = Array.isArray(d.bills) ? d.bills : [];
  d.backup = { on: false, token: '', gistId: '', login: '', key: '', salt: '', ...(d.backup || {}) };
  d.plans = d.plans || [];
  d.assets = d.assets.map(a => {
    let category = CAT_MIGRATE[a.category] || a.category;
    if (a.category === 'ETF/基金' && /^00\d{2,4}[A-Z]?$/.test(String(a.name).trim())) category = '台股';
    return { ...a, category };
  });
  // 股票：一檔一筆，買賣記錄在 lots；舊資料（shares/cost）轉成第一筆買進，同代號合併
  const merged = [], bySym = new Map();
  for (const a of d.assets) {
    const mkt = (ASSET_CATS.find(c => c.v === a.category) || {}).stock;
    if (!mkt || !a.sym) { merged.push(a); continue; }
    const key = a.category + '|' + String(a.sym).toUpperCase().replace(/\./g, mkt === 'us' ? '-' : '.');
    const lots = Array.isArray(a.lots) ? a.lots : (num(a.shares) ? [{ id: uid(), type: 'buy', date: '', shares: num(a.shares), price: num(a.cost) || '' }] : []);
    if (bySym.has(key)) { const h = bySym.get(key); h.lots.push(...lots); if (!h.manualPrice && a.manualPrice) h.manualPrice = a.manualPrice; continue; }
    const h = { ...a, lots };
    delete h.shares; delete h.cost;
    bySym.set(key, h); merged.push(h);
  }
  d.assets = merged;
  d.debts = d.debts.map(normLoan).map(x => {
    if (x.mode) return x;
    const b = BANKS.find(b => x.source && (b.name.includes(x.source) || x.source.includes(b.name.replace(/(國際)?商業(儲蓄)?銀行$/, ''))));
    return { ...x, mode: 'manual', bank: b ? `${b.code}|${b.name}` : (x.source ? `—|${x.source}` : '') };
  });
  return d;
}
// 舊資料：「寬限期開始年月」改成貸款歷程裡的一筆「申請寬限期」
function normLoan(x) {
  if (!x || !x.graceYM || !(+x.grace > 0) || !x.startYM) return x.graceYM && !(+x.grace > 0) ? { ...x, graceYM: '' } : x;
  const changes = (x.changes || []).slice();
  if (Loan.ymDiff(x.startYM, x.graceYM) <= 0) return { ...x, graceYM: '' };   // 其實是撥款就開始
  changes.push({ id: uid(), ym: x.graceYM, type: 'grace', months: +x.grace });
  return { ...x, changes, grace: '0', graceYM: '' };
}
let locked = false;
function load() {
  if (Vault.enabled()) {                       // 已啟用加密：先上鎖，解鎖後才有資料
    locked = true;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    return migrate({});
  }
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return migrate(JSON.parse(raw)); } catch (e) { /* ignore */ }
  return migrate({});
}
let state = load();
let sim = null;   // 模擬人生：{ kind, real }，資料只在記憶體
function store() {
  if (sim) return;
  if (Vault.enabled()) {
    if (Vault.unlocked()) Vault.store(JSON.stringify(state)).catch(e => alert('加密儲存失敗：' + e.message));
  } else {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { alert('儲存失敗：' + e.message); }
  }
}
function save() {
  if (typeof syncPlanEstimates === 'function') syncPlanEstimates();
  store();
  render();
  if (typeof scheduleBackup === 'function') scheduleBackup();
}

// ---------- 隱藏金額 ----------
const EYE_ON = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="#e8f7fd" stroke="#4a8fc4" stroke-width="1.8"/><circle cx="12" cy="12" r="3.6" fill="#4a8fc4"/><circle cx="13.2" cy="10.8" r="1.1" fill="#fff"/></svg><span>隱藏</span>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="#f1f3f5" stroke="#90a4ae" stroke-width="1.8"/><path d="M4 4l16 16" stroke="#90a4ae" stroke-width="2" stroke-linecap="round"/></svg><span>顯示</span>';
const PREFS_KEY = 'balanza.prefs';
const prefs = (() => { try { return { autoHide: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch (e) { return { autoHide: true }; } })();
prefs.bk = { at: 0, err: '', hash: '', exportAt: 0, snooze: 0, ...(prefs.bk || {}) };
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };
// 文字大小（整個畫面一起縮放，版面比例不變）
const FS = { s: { k: 0.9, t: '小' }, m: { k: 1, t: '中（預設）' }, l: { k: 1.12, t: '大' } };
const fsK = () => (FS[prefs.fs] || FS.m).k;
function applyFs() { const k = fsK(); document.body.style.zoom = k === 1 ? '' : String(k); document.documentElement.dataset.fs = prefs.fs || 'm'; }
applyFs();
let hidden = !!prefs.autoHide;
// 縮小顯示：所有金額除以只有自己知道的倍率（比例、正負不變）
let scaled = !!prefs.scaleStart;
const SCALE_DEF = 13.25;
const scaleK = () => scaled ? (+prefs.scaleK > 0 ? +prefs.scaleK : SCALE_DEF) : 1;
function setScaled(on) {
  scaled = !!on;
  Charts.setScale(scaleK());
  lastLv = null; levelsKey = '';
  render();
  if (currentView === 'settings' && setPage === 'privacy') renderPrivacySettings();
}
Charts.setScale(scaleK());
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
  n = (n || 0) / scaleK();
  const digits = ccy === 'JPY' || ccy === 'TWD' ? 0 : 2;
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: ccy, maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n || 0);
}
const wan = n => Math.abs(n) >= 1e4 ? `${(n / 1e4).toFixed(Math.abs(n) >= 1e6 ? 0 : 1).replace(/\.0$/, '')} 萬` : Math.round(n).toLocaleString();
function short(n) {
  if (hidden) return MASK;
  return shortRaw(n);
}
function shortRaw(n) {
  n = n / scaleK();
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
// 'tw' | 'us' | 'fund' | undefined；基金可以選「自己填市值」（舊資料沒有基金代碼也是這種）
const mktOf = a => { const m = catOf(a.category).stock; if (m !== 'fund') return m; return a.fmode === 'manual' || (a.id && !a.sym && a.fmode !== 'track') ? undefined : 'fund'; };
const MKTS = { tw: { cat: '台股', ccy: 'TWD', unit: '股', ic: 'tw' }, us: { cat: '美股', ccy: 'USD', unit: '股', ic: 'us' }, fund: { cat: '基金', ccy: 'TWD', unit: '單位', ic: 'fund' } };
const mktCat = m => (MKTS[m] || MKTS.tw).cat;
const catMkt = c => c === '美股' ? 'us' : c === '基金' ? 'fund' : 'tw';
const mktCcy = (m, q, a) => (q && q.ccy) || (a && a.ccy) || (MKTS[m] || MKTS.tw).ccy;
const roundSh = (m, v) => m === 'tw' ? Math.floor(v) : Math.floor(v * 1e4) / 1e4;
const unitOf = m => (MKTS[m] || MKTS.tw).unit;
const pickType = t => (t || '股票') === '股票' || t === '基金';   // 投資計畫可以挑標的的類型
const symName = x => { const q = x.sym && Stocks.quote(x.mkt, x.sym); return x.mkt === 'fund' ? (q ? q.name : x.sym) : x.sym; };
const icCat = v => v === '車輛' ? UI.carIcon() : Icon(catOf(v).ic);
const icDebt = v => v === '車貸' ? UI.carIcon() : Icon(typeOf(v).ic);

function assetIcon(a) {
  if (a.category === '車輛' && a.brand) return UI.carIcon(brandOf(a.brand), a.model, a.carColor);
  return icCat(a.category);
}

// ---------- 價值計算 ----------
const debtStatus = d => Plan.status(d, state.plans);
const debtColor = d => Charts.PALETTE[Math.max(0, state.debts.indexOf(d)) % Charts.PALETTE.length];
// 平均成本法：依日期處理買進／賣出，得到目前股數、總成本、均價、已實現損益
function lotsSummary(lots) {
  const list = [...(lots || [])].map((l, i) => ({ ...l, _i: i })).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a._i - b._i);
  let shares = 0, cost = 0, realized = 0, unknown = false;
  const rows = [];
  for (const l of list) {
    const q = num(l.shares), p = num(l.price);
    if (l.type === 'sell') {
      const avg = shares ? cost / shares : 0, sq = Math.min(q, shares);
      const r = p && avg ? (p - avg) * sq : null;
      if (r != null) realized += r;
      cost -= avg * sq; shares -= sq;
      rows.push({ ...l, avg, realized: r });
    } else {
      if (!p) unknown = true;
      shares += q; cost += q * p;
      rows.push({ ...l });
    }
  }
  return { shares, cost: Math.max(0, cost), avg: shares && !unknown ? cost / shares : 0, realized, unknown, rows };
}
function stockInfo(a) {
  const mkt = mktOf(a);
  if (!mkt || !a.sym) return null;
  const q = Stocks.quote(mkt, a.sym);
  const ccy = mktCcy(mkt, q, a);
  const px = q ? q.price : num(a.manualPrice);
  const k = Stocks.fx(ccy, state.currency);
  const L = a.lots ? lotsSummary(a.lots) : { shares: num(a.shares), cost: num(a.shares) * num(a.cost), avg: num(a.cost), realized: 0, unknown: !num(a.cost), rows: [] };
  const shares = L.shares;
  const value = px ? shares * px * k : num(a.amount);
  const costVal = !L.unknown && L.cost ? L.cost * k : 0;
  const pl = costVal ? value - costVal : null;
  return { q, mkt, ccy, px, shares, value, costVal, avg: L.avg, pl, plPct: pl != null ? pl / costVal * 100 : null, realized: L.realized * k, lots: L, dayChg: q ? shares * q.chg * k : 0 };
}
function assetValue(a) {
  const s = stockInfo(a);
  if (s) return s.value;
  if (a.category === '車輛' && num(a.buyPrice) && num(a.buyYear)) return carValue(num(a.buyPrice), num(a.buyYear), a.buyMonth);   // 殘值每年自動重算
  return num(a.amount);
}
// 車子只看殘值，不算進總資產／淨資產
const countsAsAsset = a => a.category !== '車輛';

function summary() {
  const st = state.debts.map(d => ({ d, s: debtStatus(d) }));
  const totalAssets = state.assets.filter(countsAsAsset).reduce((s, a) => s + assetValue(a), 0);
  const totalDebts = st.reduce((s, x) => s + x.s.balance, 0);
  const monthlyPay = st.reduce((s, x) => s + x.s.monthly, 0);
  const monthlyInterest = st.reduce((s, x) => s + x.s.monthlyInterest, 0);
  const avgRate = totalDebts > 0 ? st.reduce((s, x) => s + x.s.balance * (x.s.rate ?? num(x.d.rate)), 0) / totalDebts : 0;
  const graceItems = st.filter(x => x.s.inGrace);
  return {
    st, totalAssets, totalDebts, monthlyPay, monthlyInterest, avgRate, graceItems,
    netWorth: totalAssets - totalDebts,
    debtRatio: totalAssets > 0 ? totalDebts / totalAssets * 100 : (totalDebts > 0 ? 100 : 0),
    monthlyPrincipal: Math.max(0, monthlyPay - monthlyInterest),
    graceJump: graceItems.reduce((s, x) => s + (x.s.afterGracePay - x.s.monthly), 0),
  };
}
const twdK = () => Stocks.fx('TWD', state.currency) * scaleK();  // 1 TWD = ? 顯示幣別（縮小顯示時連等級也一起縮小）

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
const openGroups = new Set();   // 一開始全部收合，點了才展開
const openStocks = new Set();

// 有基金持股或投資計畫選了基金，才下載基金淨值（清單＋用到的走勢分檔）
let fundKey = '';
function ensureFunds() {
  const codes = [...state.assets.filter(a => mktOf(a) === 'fund' && a.sym).map(a => a.sym), ...state.plans.flatMap(p => planStocksOf(p).filter(x => x.mkt === 'fund').map(x => x.sym))];
  const k = [...new Set(codes)].sort().join(',');
  if (!k || k === fundKey) return;
  fundKey = k;
  Stocks.fundHist(codes).then(() => { if (!locked && syncPlanEstimates()) store(); levelsKey = ''; render(); });
}
// 剛開 App：股價、基金淨值還在載入時先不跑數字，等資料到齊再一次算好（最多等 2.5 秒）
let booting = true, firstNums = true;
// 第一次顯示直接放正確數字（畫面是淡入的），之後變動才用滾動動畫
const SK = (w = '60%', h = '') => `<i class="sk" style="width:${w}${h ? `;height:${h}` : ''}"></i>`;
const cnt = (el, v) => { if (booting) { el.innerHTML = SK(el.id === 'netWorth' ? '62%' : '78%'); return; } UI.countTo(el, v, fmt, firstNums ? 0 : 700); };
// 載入中的骨架：版面先固定好，只有數字、圖表先用灰條代替
function bootSkeleton() {
  if (!$('mascot').firstChild) $('mascot').innerHTML = '<div class="sk sk-mascot"></div>';
  $('mascotLv').innerHTML = SK('92px', '15px');
  $('mascotMsg').innerHTML = SK('96%', '18px') + SK('70%', '18px');
  $('mascotTip').innerHTML = SK('55%', '13px');
  $('homeProg').hidden = false; $('homeProgFill').style.width = '0'; $('homeProgText').innerHTML = SK('80%', '14px');
  $('debtRatio').innerHTML = SK('70%');
  $('ratioFill').style.width = '0';
  if (!$('nwTrend').dataset.sk) { $('nwTrend').dataset.sk = '1'; $('nwTrend').innerHTML = `<div class="chips">${['1 月', '3 月', '1 年', '全部'].map((t, i) => `<span class="chip-btn ${i === 3 ? 'on' : ''}">${t}</span>`).join('')}</div><div class="nw-delta">${SK('42%', '14px')}</div><div class="sk sk-chart"></div><div class="sel-box">${SK('100%', '16px')}${SK('100%', '14px')}${SK('100%', '14px')}</div>`; }
}
function render() {
  ensureFunds();
  const s = summary();
  const L = UI.levelOf(s, twdK());
  const stress = s.debtRatio >= 70 && s.netWorth >= 0;

  if (booting) bootSkeleton();
  // 吉祥物
  if (!booting && (L.lv !== lastLv || stress !== lastStress)) {
    $('mascot').innerHTML = UI.mascotSVG(L, { stress });
    $('mascotCard').dataset.lv = L.lv;
    $('mascotCard').style.setProperty('--g', L.lv > 0 ? Math.min(1, L.lv / 30).toFixed(2) : 0);
    $('mascotCard').classList.toggle('glow', L.lv >= 7);
    lastLv = L.lv; lastStress = stress;
  }
  if (!booting) {
    $('mascotLv').textContent = L.lv === 0 ? '' : `Lv.${L.lv} ${L.name}`;
    $('mascotCard').dataset.tier = L.tier;
    $('mascotMsg').textContent = L.msg;
    $('mascotTip').textContent = L.lv === 0 ? '到「資產」「負債」新增資料叫醒牠' : `負債比 ${pct(s.debtRatio)}${stress ? '，負債偏重小秤在冒汗' : ''}`;
  }

  $('eyeBtn').innerHTML = hidden ? EYE_OFF : EYE_ON;
  $('eyeBtn').classList.toggle('scaled', scaled && !hidden);
  $('eyeBtn').setAttribute('aria-label', hidden ? '顯示金額' : '隱藏金額');
  cnt($('netWorth'), s.netWorth);
  $('netWorth').classList.toggle('neg', s.netWorth < 0);
  cnt($('totalAssets'), s.totalAssets);
  cnt($('totalDebts'), s.totalDebts);
  if (!booting) { $('debtRatio').textContent = pct(s.debtRatio); $('ratioFill').style.width = Math.min(100, s.debtRatio) + '%'; }
  $('ratioFill').className = 'ratio-fill ' + (s.debtRatio >= 70 ? 'hot' : s.debtRatio >= 30 ? 'warm' : 'cool');
  cnt($('monthlyPay'), s.monthlyPay);
  $('avgRate').textContent = pct(s.avgRate);
  cnt($('monthlyInterest'), s.monthlyInterest);
  cnt($('monthlyPrincipal'), s.monthlyPrincipal);

  renderHomeRepay();

  // 負債來源
  const balByBank = groupSum(s.st, x => x.d.bank || '—|未填', x => x.s.balance);
  const payByBank = new Map(groupSum(s.st, x => x.d.bank || '—|未填', x => x.s.monthly));
  $('debtBySource').innerHTML = barsHTML(balByBank, k => UI.bankIcon(bankOf(k)),
    k => { const b = bankOf(k); return b && b.code !== '—' ? `${shortBank(b)} (${b.code})` : (b ? b.name : k); },
    k => payByBank.get(k) ? `<small class="sub">月付 ${fmt(payByBank.get(k))}</small>` : '');
  renderAssetDonut();
  if (!booting) { recordHistory(s); delete $('nwTrend').dataset.sk; renderNwTrend(); }   // 資料還沒載完不要記錄當天淨資產，也不要畫半套的走勢

  // 還款時程
  const pl = s.st.filter(x => x.s.balance > 0).sort((a, b) => a.s.monthsLeft - b.s.monthsLeft);
  $('payoffList').innerHTML = pl.length ? pl.map(({ d, s: x }, i) => {
    const prog = d.mode === 'auto' && x.total ? x.paid / x.total : null;
    const right = x.revolving
      ? `<div>只繳利息</div><div class="sub">動用 ${short(x.balance)} / 額度 ${short(x.limit)}</div>`
      : isFinite(x.monthsLeft)
      ? `<div>${x.payoffYM} 還清</div><div class="sub">剩 ${x.monthsLeft} 期 · 利息 ${fmt(x.interestLeft)}</div>`
      : `<div class="neg">月付不足以還清</div><div class="sub">月付低於每月利息</div>`;
    return `<div class="payoff" style="--i:${i}">${icDebt(d.type)}<div class="grow"><div>${esc(d.name)}</div><div class="sub">${esc(shortBank(bankOf(d.bank)))} · ${pct(x.rate ?? num(d.rate))}</div>
      ${prog !== null ? `<div class="mini-track"><div style="width:${(prog * 100).toFixed(1)}%"></div></div>` : ''}</div><div class="r">${right}</div></div>`;
  }).join('') : `<div class="empty">${Icon('heart', 'ico-lg')}<p>沒有負債，太棒了</p></div>`;

  renderAssets(s);
  renderDebts(s);
  renderLevels(s, L);
  renderRepay();
  renderInvest();

  if (!document.activeElement || document.activeElement.id !== 'aiKey') renderAISettings();
  const cur = CURRENCIES.find(c => c.v === state.currency) || CURRENCIES[0];
  $('currencyBtn').innerHTML = `${Icon(cur.ic)}<span>${cur.label}</span><i>›</i>`;
  growBars();
}

// --- 資料日期 ---
const md = iso => { if (!iso) return '—'; const d = new Date(iso.length <= 10 ? iso + 'T00:00:00+08:00' : iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
const ago = iso => { if (!iso) return Infinity; return Math.floor((Date.now() - new Date(iso.length <= 10 ? iso + 'T14:00:00+08:00' : iso)) / 86400000); };
function stockDataLine() {
  const m = Stocks.info();
  if (!m) return '股價資料讀取中…';
  const tw = m.tw?.date, us = m.us?.date;
  const stale = Math.min(ago(tw), ago(us)) > 4;
  return `股價：台股 ${md(tw)} 收盤、美股 ${md(us)} 收盤 · 每個交易日收盤後自動更新${stale ? '（資料超過 4 天沒更新，可能排程暫停了）' : ''}`;
}

// --- 資產：依大項分組 ---
const plCls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
const plTxt = (v, p) => `${v >= 0 ? '+' : ''}${fmt(v)}${p != null ? `（${p >= 0 ? '+' : ''}${p.toFixed(2)}%）` : ''}`;
const unitTxt = (mkt, sh) => scaled ? `${(+(sh / scaleK()).toFixed(2)).toLocaleString()} ${unitOf(mkt)}` : mkt === 'tw' && sh >= 1000 && sh % 1000 === 0 ? `${sh / 1000} 張` : `${(+sh.toFixed(4)).toLocaleString()} ${unitOf(mkt)}`;
function stockRow(a, i) {
  const si = stockInfo(a);
  const q = si.q;
  const open = openStocks.has(a.id);
  const tw = si.mkt === 'tw', fd = si.mkt === 'fund';
  const chgCls = q ? plCls(q.chg) : '';
  const chgTxt = q ? `${q.chg > 0 ? '▲' : q.chg < 0 ? '▼' : ''}${Math.abs(q.chgPct).toFixed(2)}%` : '手動價格';
  const lots = si.lots.rows.slice().reverse();
  const W = fd ? { b: '申購', s: '贖回', px: '淨值', buy: '加碼申購' } : { b: '買', s: '賣', px: '現價', buy: '加碼買進' };
  return `<li class="stock ${open ? 'open' : ''} ${tw ? 'tw' : fd ? 'fund' : 'us'}" data-expand="${a.id}" style="--i:${i}">
    <div class="row">
      ${fd ? `<span class="ticker fund-tk">${Icon('fund')}<small>${q ? (q.org === 'D' ? '境內' : '境外') : '基金'}</small></span>` : `<span class="ticker">${esc(Stocks.norm(si.mkt, a.sym))}</span>`}
      <div class="grow"><div class="name">${esc(q ? q.name : a.name || a.sym)}</div>
        <div class="sub">${unitTxt(si.mkt, si.shares)}${si.avg ? ` · 均價 ${price(si.avg, si.ccy)}` : ''}${si.px ? ` · ${W.px} ${price(si.px, si.ccy)}` : ''}</div></div>
      <div class="amt">${fmt(si.value)}
        ${si.pl != null ? `<div class="sub chg ${plCls(si.pl)}">${si.pl >= 0 ? '+' : ''}${fmt(si.pl)}</div><div class="pl-pct ${plCls(si.pl)}">${si.plPct >= 0 ? '+' : ''}${si.plPct.toFixed(2)}%</div>` : `<div class="sub chg ${chgCls}">${chgTxt}</div>`}</div>
    </div>
    <div class="detail">
      ${q ? `<div class="chart-box">${UI.sparkline(q.series, 280, 64, { tw: tw || fd, dot: true, sw: 2 })}<div class="chart-cap"><span>${fd ? (q.series.length > 2 ? `近 ${q.series.length} 筆淨值` : '走勢每天累積中') : `近 ${q.series.length} 個交易日`}</span><span>${esc(q.date || '')} ${fd ? '淨值' : '收盤'}</span></div></div>` : `<div class="hint-row">${Icon('search')}<span>沒有這檔的自動報價，使用手動填的價格</span></div>`}
      <div class="kv"><span>${W.px}</span><span>${si.px ? price(si.px, si.ccy) : '—'}</span></div>
      ${q ? `<div class="kv"><span>今日漲跌</span><span class="chg ${chgCls}">${q.chg >= 0 ? '+' : ''}${q.chg.toFixed(2)}（${chgTxt}）· ${fmt(si.dayChg)}</span></div>` : ''}
      <div class="kv"><span>持有</span><span>${unitTxt(si.mkt, si.shares)}${si.avg ? ` · 平均成本 ${price(si.avg, si.ccy)}` : ''}</span></div>
      ${si.costVal ? `<div class="kv"><span>總成本</span><span>${fmt(si.costVal)}</span></div>` : ''}
      ${si.pl != null ? `<div class="kv"><span>未實現損益</span><b class="chg ${plCls(si.pl)}">${plTxt(si.pl, si.plPct)}</b></div>` : `<div class="small muted">有買進沒有填價格，無法計算損益</div>`}
      ${si.realized ? `<div class="kv"><span>已實現損益</span><span class="chg ${plCls(si.realized)}">${plTxt(si.realized)}</span></div>` : ''}
      <div class="lot-title">交易紀錄（${lots.length} 筆${lots.some(l => String(l.src || '').startsWith('plan:')) ? `，其中 ${lots.filter(l => String(l.src || '').startsWith('plan:')).length} 筆來自投資計畫` : ''}）</div>
      <ul class="lots">${lots.map(l => {
        const isSell = l.type === 'sell';
        const lp = !isSell && num(l.price) && si.px ? (si.px - num(l.price)) * num(l.shares) * Stocks.fx(si.ccy, state.currency) : null;
        const fromPlan = String(l.src || '').startsWith('plan:');
        const pp = fromPlan ? l.src.split(':') : null;
        return `<li ${fromPlan ? `data-goplan="${pp[1]}|${pp[2]}" class="${l.est ? 'est' : ''}"` : `data-lot="${a.id}|${l.id}"`}><span class="lot-tag ${isSell ? 'sell' : 'buy'}">${fd ? (isSell ? '贖' : '申') : isSell ? '賣' : '買'}</span>
          <span class="grow">${l.date ? esc(l.date.replace(/-/g, '/')) : '原有持股'} ${fromPlan ? `<span class="chip ${l.est ? 'gray' : 'blue'}">投資計畫・${l.est ? '預估' : '已確認'}</span>` : '<span class="chip">自己輸入</span>'}<small>${unitTxt(si.mkt, num(l.shares))}${num(l.price) ? ` @ ${price(num(l.price), si.ccy)}` : ' · 未填價格'}${fromPlan && l.note ? ` · ${esc(l.note)}` : ''}${l.est ? ' · 點一下去確認實際成交' : ''}</small></span>
          <span class="lot-pl">${isSell ? (l.realized != null ? `<span class="chg ${plCls(l.realized)}">實現 ${plTxt(l.realized * Stocks.fx(si.ccy, state.currency))}</span>` : '') : lp != null ? `<span class="chg ${plCls(lp)}">${plTxt(lp, (si.px / num(l.price) - 1) * 100)}</span>` : ''}</span></li>`;
      }).join('')}</ul>
      <div class="btnrow">
        <button type="button" class="btn mini primary" data-trade="buy" data-id="${a.id}">${Icon.svg('plus', 16)} ${W.buy}</button>
        <button type="button" class="btn mini" data-trade="sell" data-id="${a.id}">${fd ? '贖回' : '賣出'}</button>
        <button type="button" class="btn mini" data-edit="asset" data-id="${a.id}">${Icon.svg('pencil', 16)} 編輯</button>
      </div>
    </div></li>`;
}

// ================= 圖表 =================
// 資產類別固定配色（顏色跟著類別走，不跟排名）
const CAT_SLOT = { '不動產': 1, '台股': 2, '現金/存款': 3, '美股': 4, '基金': 5, '車輛': 6, '保險': 7, '債券': 8 };
const catColor = c => CAT_SLOT[c] ? `var(--viz-${CAT_SLOT[c]})` : Charts.OTHER;
const donutSel = {};
// slices: [{key, label, icon, value, color, sub}]
function donutHTML(id, slices, centerTop) {
  const total = slices.reduce((t, x) => t + x.value, 0);
  const sel = slices.find(x => x.key === donutSel[id]);
  const c = sel ? { t: sel.label, b: short(sel.value), s: total ? `${(sel.value / total * 100).toFixed(1)}%` : '' } : { t: centerTop, b: short(total), s: `${slices.length} 項` };
  return `<div class="donut-wrap" data-donut="${id}">
    <div class="donut-box">${Charts.donut(slices, { selected: sel ? sel.key : null })}
      <div class="donut-center"><small>${esc(c.t)}</small><b>${c.b}</b><small>${c.s}</small></div></div>
    <ul class="donut-legend">${slices.map(x => `<li data-dk="${esc(x.key)}" class="${sel ? (sel === x ? 'on' : 'dim') : ''}"><span class="sw" style="--c:${x.color}"></span>${x.icon || ''}<span class="dl-name">${esc(x.label)}${x.sub ? `<small>${x.sub}</small>` : ''}</span><span class="dl-v"><b>${total ? (x.value / total * 100).toFixed(x.value / total < 0.1 ? 1 : 0) : 0}%</b><small>${short(x.value)}</small></span></li>`).join('')}</ul></div>`;
}
document.addEventListener('click', e => {
  const k = e.target.closest('[data-dk]'), w = k && k.closest('[data-donut]');
  if (!w) return;
  const id = w.dataset.donut;
  donutSel[id] = donutSel[id] === k.dataset.dk ? null : k.dataset.dk;
  if (id === 'cat') renderAssetDonut(); else if (id === 'pf') renderPortfolio();
});
function renderAssetDonut() {
  const rows = groupSum(state.assets.filter(countsAsAsset), a => a.category, assetValue).filter(r => r[1] > 0);
  $('assetByCat').innerHTML = rows.length ? donutHTML('cat', rows.map(([k, v]) => ({ key: k, label: k, icon: icCat(k), value: v, color: catColor(k) })), '總資產')
    : `<div class="empty">${Icon('sleep', 'ico-lg')}<p>尚無資料</p></div>`;
}

// 淨資產走勢：每天記一筆（同一天覆蓋），超過 400 天的只留每月第一筆
function recordHistory(s) {
  if (locked || (!state.assets.length && !state.debts.length)) return;
  const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const h = state.history = Array.isArray(state.history) ? state.history : [];
  const sv = c => Math.round(state.assets.filter(a => a.category === c).reduce((t, a) => t + assetValue(a), 0));
  const rec = { d: day, a: Math.round(s.totalAssets), l: Math.round(s.totalDebts), tw: sv('台股'), us: sv('美股') };
  const fv = sv('基金'); if (fv) rec.fund = fv;
  const last = h[h.length - 1];
  if (last && last.d === day) { if (last.a === rec.a && last.l === rec.l && last.tw === rec.tw && last.us === rec.us && last.fund === rec.fund) return; h[h.length - 1] = rec; }
  else h.push(rec);
  if (h.length > 400) {
    const cut = h.length - 400, keep = [], seen = new Set();
    h.slice(0, cut).forEach(x => { const m = x.d.slice(0, 7); if (!seen.has(m)) { seen.add(m); keep.push(x); } });
    state.history = keep.concat(h.slice(cut));
  }
  store();
}
let nwRange = 0, nwSel = -1;   // 0 = 全部
function renderNwTrend() {
  const h = (state.history || []).slice();
  const el = $('nwTrend'); if (!el) return;
  if (h.length < 2) { el.innerHTML = `<div class="hint-row">${Icon('sprout')}<span>從今天開始每天記錄一次淨資產，過幾天這裡就會長出走勢圖</span></div>`; return; }
  const cut = nwRange ? (() => { const d = new Date(); d.setDate(d.getDate() - nwRange); return d.toISOString().slice(0, 10); })() : '';
  const pts = h.filter(x => !cut || x.d >= cut).map(x => ({ label: x.d, v: x.a - x.l, a: x.a, l: x.l }));
  if (pts.length < 2) pts.unshift(...h.slice(-2, -1).map(x => ({ label: x.d, v: x.a - x.l, a: x.a, l: x.l })));
  if (nwSel >= pts.length) nwSel = -1;
  const first = pts[0], last = pts[pts.length - 1], diff = last.v - first.v;
  const s = nwSel >= 0 ? pts[nwSel] : last;
  scrubData.nw = { pts, tip: p => [p.label.replace(/-/g, '/'), fmt(p.v)], on: k => { nwSel = k; const b = el.querySelector('.sel-box'); if (b) b.innerHTML = nwSelHTML(pts[k]); } };
  el.innerHTML = `<div class="chips">${[[30, '1 月'], [90, '3 月'], [365, '1 年'], [0, '全部']].map(([v, t]) => `<button type="button" class="chip-btn ${nwRange === v ? 'on' : ''}" data-nwr="${v}">${t}</button>`).join('')}</div>
    <div class="nw-delta">${first.label.slice(5).replace('-', '/')} 起 <b class="${diff >= 0 ? 'pos' : 'neg'}">${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))}</b></div>
    <div class="chart-wrap" id="nwChart">${Charts.line(pts, { selected: nwSel, color: diff >= 0 ? 'var(--viz-3)' : 'var(--viz-2)', hideAxis: hidden, fmtX: l => l.slice(5).replace('-', '/'), sid: 'nw' })}</div>
    <div class="sel-box">${nwSelHTML(s)}</div>`;
}
const nwSelHTML = s => `<div class="sel-head"><b>${s.label.replace(/-/g, '/')}</b><b>${fmt(s.v)}</b></div>
      <div class="kv"><span>總資產</span><span class="pos">${fmt(s.a)}</span></div><div class="kv"><span>總負債</span><span class="neg">${fmt(s.l)}</span></div>
      <div class="small muted">手指在圖上左右滑，看每一天的數字</div>`;
document.addEventListener('click', e => {
  const r = e.target.closest('[data-nwr]');
  if (r) { nwRange = +r.dataset.nwr; nwSel = -1; renderNwTrend(); return; }
});

// 資產頁：投資組合（持股比重＋各檔損益）
function renderPortfolio() { renderAssets(summary()); }
function portfolioHTML() {
  const hs = state.assets.map(a => ({ a, i: stockInfo(a) })).filter(x => x.i && x.i.value > 0);
  if (hs.length < 2) return '';
  const byV = hs.slice().sort((x, y) => y.i.value - x.i.value);
  const top = byV.slice(0, hs.length > 8 ? 7 : 8), rest = byV.slice(top.length);
  const order = top.slice().sort((x, y) => state.assets.indexOf(x.a) - state.assets.indexOf(y.a));   // 依加入順序配色
  const color = new Map(order.map((x, k) => [x.a.id, Charts.PALETTE[k]]));
  const nm = a => a.sym ? `${a.sym} ${(a.name && a.name !== a.sym) ? a.name : ''}`.trim() : a.name;
  const slices = top.map(x => ({ key: x.a.id, label: nm(x.a), value: x.i.value, color: color.get(x.a.id), sub: x.i.plPct != null ? `<span class="chg ${plCls(x.i.pl)}">${x.i.pl >= 0 ? '+' : ''}${x.i.plPct.toFixed(1)}%</span>` : '' }));
  if (rest.length) slices.push({ key: '__rest', label: `其他 ${rest.length} 檔`, value: rest.reduce((t, x) => t + x.i.value, 0), color: Charts.OTHER });
  const withPL = hs.filter(x => x.i.pl != null).sort((x, y) => y.i.pl - x.i.pl);
  const maxPL = Math.max(1, ...withPL.map(x => Math.abs(x.i.pl)));
  const plRows = withPL.map(x => { const w = Math.abs(x.i.pl) / maxPL * 50; return `<div class="pl-row"><span class="pl-name">${esc(x.a.sym || x.a.name)}</span>
      <div class="pl-track"><span class="pl-mid"></span><span class="pl-bar ${plCls(x.i.pl)}" style="${x.i.pl >= 0 ? 'left:50%' : `left:${(50 - w).toFixed(1)}%`};width:${Math.max(0.6, w).toFixed(1)}%"></span></div>
      <span class="pl-v chg ${plCls(x.i.pl)}">${x.i.pl >= 0 ? '+' : '−'}${short(Math.abs(x.i.pl))}</span></div>`; }).join('');
  return `<div class="pf-box"><h3 class="pf-sub">${Icon.svg('chart', 20)} 持股比重</h3>
    ${donutHTML('pf', slices, '股票市值')}
    ${withPL.length ? (() => { const tot = withPL.reduce((t, x) => t + x.i.pl, 0); return `<div class="fold pl-fold ${fold.has('pfpl') ? 'open' : ''}" data-f="pfpl"><button type="button" class="fold-head" data-fold="pfpl">${Icon('chart')}<span class="grow"><b>各檔未實現損益</b><small>${withPL.length} 檔・合計 <span class="chg ${plCls(tot)}">${tot >= 0 ? '+' : '−'}${fmt(Math.abs(tot))}</span></small></span><i class="chev">›</i></button><div class="fold-body"><div class="pl-list">${plRows}</div></div></div>`; })() : ''}</div>`;
}

// 負債頁：負債餘額預測（到全部還清）
let dcSel = -1;
function renderDebtCurve() {
  const el = $('debtCurve'); if (!el) return;
  const debts = state.debts.filter(d => d.mode === 'auto' || d.mode === 'revolving');
  if (!debts.length) { el.innerHTML = ''; return; }
  const all = Plan.horizonAll(state.debts);
  const P = projection(all);
  // 每 3 個月取一點，避免太密
  const step = all > 240 ? 6 : all > 60 ? 3 : 1;
  const balAt = m => Object.values(m.items).reduce((t, it) => t + (it.balance || 0), 0);
  const pts = [];
  P.months.forEach((m, k) => { if (k % step === 0 || k === P.months.length - 1) pts.push({ label: m.ym, v: balAt(m), k }); });
  // 還清事件標點
  P.events.filter(e => e.type === 'payoff').forEach(e => { let best = 0; pts.forEach((p, i) => { if (Loan.ymDiff(p.label, e.ym) >= 0) best = i; }); pts[best].mark = debtColor(e.debt); pts[best].ev = (pts[best].ev || []).concat(e.debt.name); });
  if (pts.length < 2) { el.innerHTML = ''; return; }
  if (dcSel >= pts.length) dcSel = -1;
  const s = dcSel >= 0 ? pts[dcSel] : null;
  const payoffs = P.events.filter(e => e.type === 'payoff').sort((a, b) => Loan.ymDiff(b.ym, a.ym));
  const selH = s => s ? `<div class="sel-box"><div class="sel-head"><b>${s.label.replace('-', '/')}</b><b>${fmt(s.v)}</b></div>${s.ev ? `<div class="small">${s.ev.map(esc).join('、')} 還清</div>` : ''}</div>`
      : `<div class="dc-legend">${payoffs.map(e => `<span><span class="dot" style="--c:${debtColor(e.debt)}"></span>${esc(e.debt.name)} ${e.ym.replace('-', '/')} 還清</span>`).join('')}</div>`;
  scrubData.dc = { pts, tip: p => [p.label.replace('-', '/'), fmt(p.v)], on: k => { dcSel = k; const b = $('dcSel'); if (b) b.innerHTML = selH(pts[k]); } };
  el.innerHTML = `<div class="card"><h2>${Icon.svg('down', 24)} 負債餘額會怎麼下降</h2>
    <div class="chart-wrap" id="dcChart">${Charts.line(pts, { selected: dcSel, color: 'var(--viz-1)', hideAxis: hidden, fmtX: l => `'${l.slice(2, 4)}`, sid: 'dc' })}</div>
    <div id="dcSel">${selH(s)}</div>
    <div class="small muted">只含自動試算與理財型額度；手指在圖上左右滑，看每個時間點還欠多少</div></div>`;
}

// 股票資產走勢：近 30 個交易日用收盤價 × 當時持有股數回推，更早的用每天記錄的快照
const trSel = {};
function prevTradingDays(lastISO, n) {
  const out = []; let d = new Date(lastISO + 'T12:00:00');
  while (out.length < n) { const w = d.getDay(); if (w !== 0 && w !== 6) out.unshift(dKey(d)); d = new Date(d.getTime() - 864e5); }
  return out;
}
function stockTrend(cats) {
  const hs = state.assets.filter(a => cats.includes(a.category));
  if (!hs.length) return [];
  const per = [], dates = new Set();
  let flat = 0;
  for (const a of hs) {
    const si = stockInfo(a);
    if (!si) { flat += assetValue(a); continue; }
    const q = si.q;
    if (!q || !q.series || q.series.length < 2 || !q.date) { flat += si.value; continue; }
    const ds = q.dates || prevTradingDays(q.date, q.series.length);
    const k = Stocks.fx(si.ccy, state.currency);
    const lots = (a.lots || []).map(l => ({ d: l.date || '', s: (l.type === 'sell' ? -1 : 1) * num(l.shares) }));
    const map = {};
    ds.forEach((dt, i) => { const sh = lots.reduce((t, l) => t + (!l.d || l.d <= dt ? l.s : 0), 0); map[dt] = Math.max(0, sh) * q.series[i] * k; dates.add(dt); });
    per.push({ map, first: ds[0] });
  }
  const sorted = [...dates].sort();
  const pts = sorted.map(dt => {
    let v = flat;
    for (const p of per) {
      if (p.map[dt] != null) v += p.map[dt];
      else { const prev = Object.keys(p.map).filter(x => x <= dt).sort().pop(); v += prev ? p.map[prev] : p.map[p.first]; }
    }
    return { label: dt, v };
  });
  // 更早的快照
  const first = sorted[0] || '9999';
  const key = cats.length > 1 ? null : catMkt(cats[0]);
  const snaps = (state.history || []).filter(h => h.d < first && (key ? h[key] != null : h.tw != null)).map(h => ({ label: h.d, v: key ? h[key] : (h.tw || 0) + (h.us || 0) }));
  return snaps.concat(pts);
}
function trendHTML(id, cats, title) {
  const pts = stockTrend(cats);
  if (pts.length < 2) return '';
  if (trSel[id] == null || trSel[id] >= pts.length) trSel[id] = pts.length - 1;
  const f = pts[0], l = pts[pts.length - 1], d = l.v - f.v, sel = pts[trSel[id]];
  scrubData['tr-' + id] = { pts, tip: p => [p.label.replace(/-/g, '/'), fmt(p.v)], on: k => { trSel[id] = k; const b = document.querySelector(`.trend[data-tr="${id}"] .tr-sel`); if (b) b.innerHTML = `<span>${pts[k].label.replace(/-/g, '/')}</span><b>${fmt(pts[k].v)}</b>`; } };
  return `<div class="trend" data-tr="${id}" data-cats="${cats.join(',')}">
    <div class="tr-head"><b>${title}</b><span>${f.label.slice(5).replace('-', '/')} 起 <b class="chg ${plCls(d)}">${d >= 0 ? '+' : '−'}${fmt(Math.abs(d))}${f.v ? `（${(d / f.v * 100).toFixed(1)}%）` : ''}</b></span></div>
    <div class="chart-wrap">${Charts.line(pts, { selected: trSel[id], color: d >= 0 ? '#e53935' : '#2e9e4f', hideAxis: hidden, height: 130, fmtX: x => x.slice(5).replace('-', '/'), sid: 'tr-' + id })}</div>
    <div class="tr-sel"><span>${sel.label.replace(/-/g, '/')}</span><b>${fmt(sel.v)}</b></div></div>`;
}
// ---- 圖表手指滑動：虛線跟著手指，即時顯示那一點的日期與數字 ----
const scrubData = {};   // sid → { pts, tip(p) → [標題, 數字], on(k) }
{
  let act = null;
  const idxAt = (svg, cx) => {
    const r = svg.getBoundingClientRect(), d = svg.dataset, n = +d.n;
    const xv = (cx - r.left) / r.width * +d.w - +d.x0, pw = +d.pw;
    const k = d.kind === 'bar' ? Math.floor(xv / pw * n) : Math.round(xv / pw * (n - 1));
    return Math.max(0, Math.min(n - 1, k));
  };
  const move = (svg, k) => {
    const d = svg.dataset, n = +d.n, x0 = +d.x0, pw = +d.pw;
    if (d.kind === 'bar') {
      const bw = pw / n, r = svg.querySelector('.sel'); if (r) r.setAttribute('x', (x0 + k * bw).toFixed(2));
    } else {
      const x = (x0 + (n === 1 ? pw / 2 : k / (n - 1) * pw)).toFixed(1), g = svg.querySelector('.xh');
      if (g) { g.classList.remove('off'); const l = g.querySelector('line'), c = g.querySelector('circle'); l.setAttribute('x1', x); l.setAttribute('x2', x); c.setAttribute('cx', x); c.setAttribute('cy', d.ys.split(',')[k]); }
    }
    const S = scrubData[d.sid];
    if (S) {
      S.on(k);
      const wrap = svg.closest('.chart-wrap'); let tip = wrap.querySelector('.xtip');
      if (!tip) { tip = document.createElement('div'); tip.className = 'xtip'; wrap.appendChild(tip); }
      const [a, b] = S.tip(S.pts[k]); tip.innerHTML = `<small>${a}</small><b>${b}</b>`;
      const wr = wrap.getBoundingClientRect(), sr = svg.getBoundingClientRect(), z = wr.width / (wrap.offsetWidth || wr.width) || 1;   // 文字大小縮放
      const px = (sr.left - wr.left + (d.kind === 'bar' ? (x0 + (k + .5) * pw / n) : (x0 + (n === 1 ? pw / 2 : k / (n - 1) * pw))) / +d.w * sr.width) / z;
      tip.style.left = Math.max(4, Math.min(wrap.offsetWidth - tip.offsetWidth - 4, px - tip.offsetWidth / 2)) + 'px';
      tip.classList.add('on');
    }
  };
  const end = () => { if (!act) return; const w = act.svg.closest('.chart-wrap'), t = w && w.querySelector('.xtip'); if (t) t.classList.remove('on'); act = null; };
  document.addEventListener('pointerdown', e => {
    const svg = e.target.closest && e.target.closest('svg.scrub'); if (!svg) return;
    act = { svg, id: e.pointerId, k: -1 };
    try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    const k = idxAt(svg, e.clientX); act.k = k; move(svg, k);
  });
  document.addEventListener('pointermove', e => {
    if (!act || e.pointerId !== act.id) return;
    const k = idxAt(act.svg, e.clientX);
    if (k !== act.k) { act.k = k; move(act.svg, k); if (navigator.vibrate && e.pointerType === 'touch') try { navigator.vibrate(3); } catch (_) {} }
  });
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
}

function renderAssets(s) {
  if ($('portfolio')) $('portfolio').innerHTML = '';
  $('assetsSum').textContent = fmt(s.totalAssets);
  if (!state.assets.length) { $('assetList').innerHTML = `<div class="empty big-empty">${Icon('piggy', 'ico-xl')}<p>點右下角 ＋ 新增第一筆資產</p></div>`; return; }
  const groups = ASSET_CATS.map(c => {
    const items = state.assets.filter(a => a.category === c.v).map(a => ({ a, v: assetValue(a) })).sort((x, y) => y.v - x.v);
    return { c, items, total: items.reduce((t, x) => t + x.v, 0) };
  }).filter(g => g.items.length).sort((x, y) => y.total - x.total);
  let i = 0;
  const hasStock = state.assets.some(a => mktOf(a));
  const groupHTML = g => {
    const open = openGroups.has(g.c.v);
    const share = s.totalAssets ? g.total / s.totalAssets * 100 : 0;
    let extra = '';
    let plLine = '';
    if (g.c.stock) {
      const infos = g.items.map(x => stockInfo(x.a)).filter(Boolean);
      const day = infos.reduce((t, x) => t + (x.dayChg || 0), 0);
      if (day) extra = `<span class="chg ${day > 0 ? 'up' : 'down'}">今日 ${day > 0 ? '+' : ''}${fmt(day)}</span>`;
      const withCost = infos.filter(x => x.pl != null);
      if (withCost.length) {
        const pl = withCost.reduce((t, x) => t + x.pl, 0), cost = withCost.reduce((t, x) => t + x.costVal, 0);
        plLine = `<div class="pl-line chg ${plCls(pl)}">損益 ${plTxt(pl, cost ? pl / cost * 100 : null)}</div>`;
      }
    }
    const rows = g.items.map(({ a, v }) => {
      if (g.c.stock && a.sym) return stockRow(a, i++);
      let sub = '';
      if (a.category === '車輛' && a.brand) { const b = brandOf(a.brand); sub = `${b ? b.zh : a.brand}${a.model ? ' ' + a.model : ''}${a.buyYear ? ' · ' + a.buyYear + ' 年購入' : ''}${num(a.buyPrice) ? ' · 買價 ' + short(num(a.buyPrice)) : ''}${num(a.buyPrice) && num(a.buyYear) ? '' : ' · 未填購入年份或價格，點開補上才會自動算殘值'}`; }
      if (a.category === '不動產' && a.district) sub = `${a.district}${a.road || ''}${a.ping ? ' · ' + a.ping + ' 坪' : ''}${a.lvrAt ? ' · 實價估' : ''}`;
      let eq = '';
      if (isRE(a)) { const L = loansOn(a.id, s.st); if (L.list.length) eq = `<div class="sub eq-line">貸款 <span class="neg">${short(L.debt)}</span> · 淨值 <b class="${v - L.debt >= 0 ? 'pos' : 'neg'}">${short(v - L.debt)}</b> · 成數 ${v ? Math.round(L.debt / v * 100) : '—'}%</div>`; }
      if (a.note) sub += (sub ? ' · ' : '') + a.note;
      return `<li data-view-item="asset|${a.id}" style="--i:${i++}">${assetIcon(a)}
        <div class="grow"><div class="name">${esc(a.name)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}${eq}</div>
        <div class="amt pos">${fmt(v)}</div></li>`;
    }).join('');
    const nc = g.c.v === '車輛';
    return `<div class="group ${open ? 'open' : ''} ${nc ? 'not-counted' : ''}">
      <button type="button" class="group-head" data-group="${esc(g.c.v)}">${icCat(g.c.v)}
        <div class="grow"><div class="name">${esc(g.c.v)} <small>${g.items.length} 項</small></div><div class="sub">${nc ? '<span class="chip gray">不計入總資產</span>估算殘值' : `${share.toFixed(0)}% ${extra}`}</div>${plLine}</div>
        <div class="amt ${nc ? 'muted' : 'pos'}">${fmt(g.total)}</div><i class="chev">›</i></button>
      <div class="sub-list-wrap">${g.c.stock ? trendHTML('tr-' + g.c.stock, [g.c.v], `${g.c.v}資產走勢`) : ''}<ul class="list sub-list">${rows}</ul></div></div>`;
  };
  // 台股、美股收進「股票」大分類
  const inStk = g => g.c.stock === 'tw' || g.c.stock === 'us';
  const stockGs = groups.filter(inStk), others = groups.filter(g => !inStk(g));
  const sTotal = stockGs.reduce((t, g) => t + g.total, 0);
  let stockBlock = '';
  if (stockGs.length) {
    const open = openGroups.has('股票');
    const infos = stockGs.flatMap(g => g.items.map(x => stockInfo(x.a)).filter(Boolean));
    const day = infos.reduce((t, x) => t + (x.dayChg || 0), 0);
    const wc = infos.filter(x => x.pl != null), pl = wc.reduce((t, x) => t + x.pl, 0), cost = wc.reduce((t, x) => t + x.costVal, 0);
    const n = stockGs.reduce((t, g) => t + g.items.length, 0);
    stockBlock = `<div class="group stock-group ${open ? 'open' : ''}">
      <button type="button" class="group-head" data-group="股票">${Icon('chart')}
        <div class="grow"><div class="name">股票 <small>${n} 檔・${stockGs.map(g => g.c.v).join('＋')}</small></div><div class="sub">${s.totalAssets ? (sTotal / s.totalAssets * 100).toFixed(0) : 0}% ${day ? `<span class="chg ${day > 0 ? 'up' : 'down'}">今日 ${day > 0 ? '+' : ''}${fmt(day)}</span>` : ''}</div>${wc.length ? `<div class="pl-line chg ${plCls(pl)}">損益 ${plTxt(pl, cost ? pl / cost * 100 : null)}</div>` : ''}</div>
        <div class="amt pos">${fmt(sTotal)}</div><i class="chev">›</i></button>
      <div class="sub-list-wrap stock-inner">
        ${hasStock ? `<div class="data-line">${Icon.svg('clock', 16)} ${esc(stockDataLine())}</div>` : ''}
        ${trendHTML('tr-all', stockGs.map(g => g.c.v), '股票資產走勢（台股＋美股）')}
        ${portfolioHTML()}
        ${stockGs.map(groupHTML).join('')}
      </div></div>`;
  }
  const all = [...others.map(g => ({ t: g.c.v === '車輛' ? -1 : g.total, h: groupHTML(g) })), ...(stockGs.length ? [{ t: sTotal, h: stockBlock }] : [])].sort((a, b) => b.t - a.t);
  $('assetList').innerHTML = all.map(x => x.h).join('');
}

// 理財型額度底下：一筆一筆列出投資計畫的動用
function drawsHTML(d) {
  const cur = Loan.nowYM();
  const rows = [];
  if (num(d.drawn) > 0) rows.push({ ym: d.drawnYM || '', t: '計畫外動用', a: num(d.drawn), st: 'base' });
  state.plans.filter(p => p.source === d.id && p.startYM).forEach(p => {
    Plan.amounts(p).forEach((a, i) => {
      const st = Plan.periodState(p, i, cur);
      if (st === 'future' || st === 'now') return;   // 本月還沒確認的，列在「下一期」
      const amt = p.done && p.done[i] != null ? num(p.done[i]) : a;
      rows.push({ ym: Loan.ymAdd(p.startYM, i), t: `${p.name} 第 ${i + 1} 期`, a: amt, st, plan: p.id });
    });
  });
  if (!rows.length) return '';
  rows.sort((a, b) => String(a.ym).localeCompare(String(b.ym)));
  let acc = 0;
  const next = state.plans.filter(p => p.source === d.id).map(p => ({ p, pr: Plan.progress(p, cur) })).find(x => x.pr.nextIdx >= 0 && ['now', 'future'].includes(Plan.periodState(x.p, x.pr.nextIdx, cur)));
  const total = rows.reduce((t, r) => t + r.a, 0), fk = 'draws:' + d.id;
  return `<li class="draws ${fold.has(fk) ? 'open' : ''}"><button type="button" class="draws-head" data-draws="${d.id}"><span class="grow">動用明細 ${rows.length} 筆${next ? '・下一期 ' + Loan.ymAdd(next.p.startYM, next.pr.nextIdx).replace('-', '/') : ''}</span><span class="neg">${fmt(total)}</span><i class="chev">›</i></button><ul>${rows.map(r => { acc += r.a; return `<li class="draw-row" ${r.plan ? `data-edit="plan" data-id="${r.plan}"` : ''}><span class="draw-ym">${r.ym ? r.ym.replace('-', '/') : '—'}</span><span class="grow">${esc(r.t)}${r.st === 'assumed' ? ' <span class="chip gray">未確認</span>' : r.st === 'now' ? ' <span class="chip">本月</span>' : ''}<small>累計 ${fmt(acc)}</small></span><span class="neg">+${fmt(r.a)}</span></li>`; }).join('')}
    ${next ? `<li class="draw-row next"><span class="draw-ym">${Loan.ymAdd(next.p.startYM, next.pr.nextIdx).replace('-', '/')}</span><span class="grow">${Plan.periodState(next.p, next.pr.nextIdx, cur) === 'now' ? '本月' : '下一期'} ${esc(next.p.name)} 第 ${next.pr.nextIdx + 1} 期<small>預計動用，到投資分頁確認後就會算進來</small></span><span class="muted">+${fmt(next.pr.amounts[next.pr.nextIdx])}</span></li>` : ''}</ul></li>`;
}
function renderDebts(s) {
  renderDebtCurve();
  const rt = x => x.s.rate ?? num(x.d.rate);
  const ds = [...s.st].sort((a, b) => rt(b) - rt(a));
  $('debtsSum').textContent = fmt(s.totalDebts);
  if (!ds.length) { $('debtList').innerHTML = `<div class="empty big-empty">${Icon('heart', 'ico-xl')}<p>點右下角 ＋ 新增負債</p></div>`; return; }
  let i = 0;
  const row = ({ d, s: x }, linked) => {
    const b = bankOf(d.bank);
    return `<li data-view-item="debt|${d.id}" class="${linked ? 'linked' : ''}" style="--i:${i++}"><span class="stack">${UI.bankIcon(b)}<span class="badge">${Icon.svg(typeOf(d.type).ic === 'car' ? 'loan' : typeOf(d.type).ic, 18)}</span></span>
      <div class="grow"><div class="name">${esc(d.name)}${x.inGrace ? ` <span class="chip">寬限期剩 ${x.graceLeft} 月</span>` : ''}</div>
      <div class="sub">${esc(b && b.code !== '—' ? b.code + ' ' + shortBank(b) : (b ? b.name : '—'))} · 年利率 ${pct(rt({ d, s: x }))}${dueTxt(d) ? ` · ${dueTxt(d)}扣` : ''}${d.mode === 'auto' ? ((d.changes || []).length ? ` · 歷程 ${d.changes.length} 筆` : ' · 自動試算') : d.mode === 'revolving' ? ` · 額度 ${short(x.limit)}` : ''}</div></div>
      <div class="amt neg">${fmt(x.balance)}<div class="sub">${x.revolving ? '利息' : '月付'} ${fmt(x.monthly)}</div></div></li>${x.revolving ? drawsHTML(d) : ''}`;
  };
  // 依抵押的房子分組
  const props = state.assets.filter(isRE).map(a => ({ a, v: assetValue(a), items: ds.filter(x => x.d.collateral === a.id) })).filter(p => p.items.length);
  const used = new Set(props.flatMap(p => p.items.map(x => x.d.id)));
  const groups = props.map(p => {
    const debt = p.items.reduce((t, x) => t + x.s.balance, 0), monthly = p.items.reduce((t, x) => t + x.s.monthly, 0), eq = p.v - debt;
    const ltv = p.v ? debt / p.v * 100 : 0;
    return `<li class="prop-group" style="--i:${i++}">
      <button type="button" class="prop-head" data-view-item="asset|${p.a.id}">${assetIcon(p.a)}
        <div class="grow"><div class="name">${esc(p.a.name)}</div><div class="sub">估值 ${short(p.v)} · ${p.items.length} 筆貸款 · 月付合計 ${fmt(monthly)}</div></div>
        <div class="amt"><div class="${eq >= 0 ? 'pos' : 'neg'}">淨值 ${short(eq)}</div><div class="sub">貸款 ${short(debt)}</div></div></button>
      <div class="ltv"><div class="ltv-bar"><span style="width:${Math.min(100, ltv).toFixed(1)}%"></span></div><small>貸款成數 ${ltv.toFixed(0)}%</small></div>
      <ul class="list linked-list">${p.items.map(x => row(x, true)).join('')}</ul></li>`;
  }).join('');
  $('debtList').innerHTML = groups + ds.filter(x => !used.has(x.d.id)).map(x => row(x)).join('');
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
let selLv = null;
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
  if (booting) return;
  $('homeProg').hidden = !next;
  if (next) {
    $('homeProgFill').style.width = (prog * 100).toFixed(1) + '%';
    $('homeProgText').textContent = `距離 Lv.${next.lv} ${next.name} 還差 ${fmt(need)}`;
  }

  const key = `${L.lv}|${state.currency}|${k.toFixed(6)}|${selLv}|${hidden}|${scaled}|${Math.round(nw)}`;
  if (key === levelsKey) return;
  levelsKey = key;
  const gap = X => {
    const lo = X.min === -Infinity ? -Infinity : X.min * k, hi = X.max === Infinity ? Infinity : X.max * k;
    if (L.lv === 0) return { txt: `需要淨資產 ${rangeText(X, k).replace('淨資產 ', '')}`, cls: '' };
    if (nw >= lo && nw < hi) return { txt: '你就在這一級', cls: 'pos', prog: 1 };
    if (nw < lo) return { txt: `還差 ${fmt(lo - nw)}`, sub: X.lv > 0 ? '淨資產再增加這麼多就能到達' : '負債再減少（或資產增加）這麼多就能回到這一級', cls: 'neg', prog: L.lv >= 0 && X.lv > 0 && lo > 0 ? Math.max(0, nw) / lo : null };
    return { txt: `已超過 ${fmt(nw - (hi === Infinity ? lo : hi))}`, sub: '要是淨資產減少這麼多就會掉到這一級', cls: 'pos' };
  };
  const row = X => {
    const cur = X.lv === L.lv, sel = X.lv === selLv;
    const reached = L.lv > 0 && X.lv > 0 && X.lv < L.lv;
    const tag = cur ? '<span class="lv-tag cur">你在這裡</span>' : reached ? '<span class="lv-tag ok">已達成</span>' : (X.lv > 0 && X.lv > L.lv) ? `<span class="lv-tag lock">${Icon.svg('lock', 13)}</span>` : '';
    const g = sel ? gap(X) : null;
    return `<li class="lv-row ${cur ? 'cur' : ''} ${sel ? 'sel' : ''} ${X.lv < 0 ? 'negative' : ''}" data-lvsel="${X.lv}" ${cur ? 'id="lvCurRow"' : ''}>
      <div class="lv-mini">${UI.mascotSVG(X, { still: !cur && !sel })}</div>
      <div class="grow"><div class="lv-name"><b>Lv.${X.lv}</b> ${esc(X.name)} ${tag}</div>
      <div class="lv-range">${rangeText(X, k)}</div>
      ${g ? `<div class="lv-gap"><b class="${g.cls}">${g.txt}</b>${g.sub ? `<small>${g.sub}</small>` : ''}
        ${g.prog != null && g.prog < 1 ? `<div class="lv-track sm"><div class="lv-fill" style="width:${(g.prog * 100).toFixed(1)}%"></div></div>` : ''}
        <small class="muted">${esc(X.msg)}</small></div>` : '<div class="lv-hint">點我看這一級</div>'}</div></li>`;
  };
  const tierBlock = (list, title, desc) => `<li class="lv-tier"><b>${esc(title)}</b><small>${esc(desc)}</small></li>${list.map(row).join('')}`;
  const pos = [], neg = [];
  for (let t = 10; t >= 1; t--) { const g = LEVELS.filter(x => x.tier === t); pos.push(tierBlock(g, `${g[0].tierName} · Lv.${g.at(-1).lv} ～ ${g[0].lv}`, g[0].desc)); }
  for (let t = -1; t >= -10; t--) { const g = LEVELS.filter(x => x.tier === t); neg.push(tierBlock(g, `${g[0].tierName} · Lv.${g[0].lv} ～ ${g.at(-1).lv}`, g[0].desc)); }
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
  $('clClose').textContent = onlyNew ? '我知道了' : '關閉';
  clOnlyNew = !!onlyNew;
  // 新版說明：置中視窗（要按「我知道了」）；平常點版本號：底部面板（可往下拉關閉）
  $('clDialog').className = onlyNew ? 'cl-dialog' : 'sheet cl-sheet';
  if (!$('clDialog').open) $('clDialog').showModal();
  $('clDialog').querySelector('.cl-scroll').scrollTop = 0;
}
// 新版說明要按「我知道了」才算看過；看過之前每次開 App 都會再顯示
let clOnlyNew = false, pendingReload = false;
$('ver').addEventListener('click', () => openChangelog(false));
$('clClose').addEventListener('click', () => $('clDialog').close());
// 按「我知道了」或往下拉關掉，都算看過
$('clDialog').addEventListener('close', () => {
  if (clOnlyNew) try { localStorage.setItem('balanza.seenVersion', APP_VERSION); } catch (e) { /* ignore */ }
  clOnlyNew = false;
  if (pendingReload) location.reload();
});
$('clDialog').addEventListener('cancel', e => { if (clOnlyNew) e.preventDefault(); });
$('clOpen').addEventListener('click', () => openChangelog(false));

function growBars() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('.view.active .fill[data-w]').forEach(f => { f.style.width = f.dataset.w + '%'; });
  }));
}

// ---------- 分頁與新增按鈕 ----------
let currentView = 'home';
function showView(name) {
  if (!name) name = lastTab || 'home';
  currentView = name;
  if (!['levels', 'settings'].includes(name)) lastTab = name;
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => {
    const on = v.id === 'view-' + name;
    v.classList.toggle('active', on);
    if (on) { v.style.animation = 'none'; void v.offsetWidth; v.style.animation = ''; }
  });
  const fab = $('fab');
  const kind = { assets: 'asset', debts: 'debt', invest: 'plan', repay: 'bill' }[name] || '';
  document.querySelectorAll('.top-btn').forEach(x => x.classList.toggle('active', x.dataset.view === name));
  fab.hidden = !kind;
  fab.dataset.add = kind;
  fab.setAttribute('aria-label', '新增' + KIND_NAME[kind]);
  if (kind) { fab.classList.remove('pop'); void fab.offsetWidth; fab.classList.add('pop'); }
  if (name === 'levels') setTimeout(() => { const r = $('lvCurRow'); r && r.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 450);
  document.querySelectorAll('.fill[data-w]').forEach(f => { f.style.width = '0'; });
  growBars();
  if (name === 'settings') openSetPage('');
  if (name !== 'levels') document.querySelector('main').scrollTo(0, 0);
}
// 下方分頁直接切換；右上角（等級、設定）再點一次就關掉，回到原本停留的分頁
let lastTab = 'home';
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
document.querySelectorAll('.top-btn[data-view]').forEach(b => b.addEventListener('click', () => showView(currentView === b.dataset.view ? lastTab : b.dataset.view)));
$('toLevels').addEventListener('click', () => showView('levels'));
document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) showView(g.dataset.goto); });
document.addEventListener('click', e => {
  const r = e.target.closest('[data-lvsel]');
  if (!r) return;
  const lv = +r.dataset.lvsel;
  selLv = selLv === lv ? null : lv;
  const y = r.getBoundingClientRect().top;
  render();
  const n = document.querySelector(`[data-lvsel="${lv}"]`);
  if (n) document.querySelector('main').scrollBy(0, n.getBoundingClientRect().top - y);   // 維持在原本的位置
  if (selLv !== null && n) UI.poke(n.querySelector('svg'));
});

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
  planSource: () => [opt('self', '自有資金', Icon('wallet'), '不產生利息'), ...state.debts.filter(isRev).map(d => opt(d.id, d.name, UI.bankIcon(bankOf(d.bank)), `理財型額度 ${short(num(d.limit))} · ${pct(num(d.rate))}`)),
    opt('__newline', '＋ 新增理財型房貸額度', Icon('mortgage'), '會自動在負債新增一筆，隨投入進度增加'),
    opt('__newother', '＋ 新增其他額度', Icon('loan'), '股票質押、信用額度、保單借款…只繳利息的額度')],
  property: () => {
    const ps = state.assets.filter(isRE);
    if (!ps.length) throw new Error('還沒有不動產資產，先到「資產」新增這間房子');
    return [opt('', '不指定', Icon('other'), '不和任何房子連結'), ...ps.map(a => opt(a.id, a.name, assetIcon(a), `估值 ${short(assetValue(a))}${a.district ? ' · ' + a.district + (a.road || '') : ''}`))];
  },
  planType: () => ['股票', '基金', '債券', '加密貨幣', '儲蓄／定存', '其他'].map(v => opt(v, v, Icon({ '股票': 'chart', '基金': 'fund', '債券': 'bond', '加密貨幣': 'crypto', '儲蓄／定存': 'cash', '其他': 'other' }[v]), v === '股票' ? '可以選台股、美股標的，看即時收盤價與走勢' : v === '基金' ? '可以選境內、境外基金，看最新淨值與走勢' : '')),
  planMode: () => [opt('total', '投資總額', Icon('invest'), '一筆總額分幾個月投入，例如 1460 萬分 15 個月'), opt('monthly', '每月投入', Icon('calendar'), '每月固定投入多少，例如定期定額每月 1 萬')],
  billKind: () => BILL_KINDS.map(c => opt(c.v, c.label, Icon(c.ic), c.d)),
  billCat: () => BILL_CATS.map(c => opt(c.v, c.v, Icon(c.ic))),
  billCcy: () => CURRENCIES.map(c => opt(c.v, c.label, Icon(c.ic))),
  billCycle: () => BILL_CYCLES.map(c => opt(c.v, c.label, Icon(c.v === 'w' ? 'clock' : 'calendar'))),
  payWith: () => [opt('', '銀行帳戶自動扣款', Icon('bank')), ...state.bills.filter(isCardBill).map(c => opt(c.id, `刷 ${c.name}`, UI.bankIcon(bankOf(c.bank)), '金額會併入這張卡的帳單')), opt('other', '其他（現金、轉帳…）', Icon('wallet'))],
  autopay: () => [opt('auto', '自動扣繳', Icon('bank'), '截止日從帳戶自動扣'), opt('manual', '自己繳', Icon('wallet'), '截止日前要記得繳')],
  fmode: () => [opt('track', '選基金，每天自動更新淨值', Icon('fund'), '境內、境外基金都有，填單位數就能算市值與損益'), opt('manual', '自己填目前市值', Icon('pencil'), '找不到的基金，或只想記總額')],
  grace: () => [0, 6, 12, 24, 36, 48, 60].map(m => opt(String(m), m ? `${m} 個月${m % 12 === 0 ? `（${m / 12} 年）` : ''}` : '沒有寬限期', Icon(m ? 'pause' : 'play'), m ? '期間只繳利息、不還本金' : '一撥款就開始還本金')),
  stock: async vals => {
    await Stocks.load(); if (mktOf(vals) === 'us') await Stocks.tail();
    const mkt = mktOf(vals);
    if (mkt === 'fund') return fundOpts();
    return Stocks.list(mkt).map(x => opt(x.sym, `${x.sym}  ${x.name}`, `<span class="ticker small">${esc(x.sym.slice(0, 6))}</span>`, x.price != null ? price(x.price, mkt === 'us' ? 'USD' : 'TWD') : '', { key: `${x.sym} ${x.name}`, right: UI.sparkline(x.series, 56, 22, { tw: mkt === 'tw' }) }));
  },
};
async function fundOpts() {
  if (!(await Stocks.funds())) throw new Error('基金資料還沒產生（每天晚上自動更新），可以先選「自己填市值」');
  return Stocks.list('fund').map(x => opt(x.sym, x.name, Icon('fund'), `${x.org === 'D' ? '境內' : '境外'}・${x.ccy}・淨值 ${(+x.price).toLocaleString(undefined, { maximumFractionDigits: 4 })}`,
    { key: `${x.name} ${x.sym} ${x.co || ''} ${x.org === 'D' ? '境內' : '境外'} ${x.ccy}`, right: x.prev ? `<span class="chg ${x.price > x.prev ? 'up' : x.price < x.prev ? 'down' : ''} small">${x.price >= x.prev ? '+' : ''}${((x.price - x.prev) / x.prev * 100).toFixed(2)}%</span>` : '' }));
}
const BODY_ZH = { sedan: '轎車', hatch: '掀背車', suv: '休旅車', bigsuv: '越野車', coupe: '跑車', roadster: '敞篷車', minivan: 'MPV', pickup: '皮卡', evcross: '電動跨界休旅', wagon: '旅行車', scooter: '速克達', escooter: '電動機車', sportbike: '檔車' };
const swatch = c => `<span class="ico swatch" style="--sw:${c}"></span>`;
const PICK_LABEL = {
  planSource: v => v === 'self' || !v ? '自有資金' : v === '__newline' ? '新增理財型房貸額度' : v === '__newother' ? '新增其他額度' : (state.debts.find(d => d.id === v) || {}).name || '（已刪除的額度）',
  carColor: v => ([...Car.COLORS].find(c => c.v === v) || {}).label || (v ? '品牌代表色' : ''),
  bank: v => { const b = bankOf(v); return b ? bankLabel(b) : ''; },
  county: v => (COUNTIES.find(c => c.k === v) || {}).v || '',
  method: v => (REPAY_METHODS.find(c => c.v === v) || {}).label || '',
  mode: v => (CALC_MODES.find(c => c.v === v) || {}).label || '',
  brand: v => { const b = brandOf(v); return b ? (b.zh === b.v ? b.v : `${b.zh} ${b.v}`) : v; },
  grace: v => +v ? `${v} 個月` : '沒有寬限期',
  planMode: v => v === 'monthly' ? '每月投入' : '投資總額',
  planType: v => v || '股票',
  billKind: v => (BILL_KINDS.find(c => c.v === v) || {}).label || '',
  billCcy: v => (CURRENCIES.find(c => c.v === v) || {}).label || v,
  billCycle: v => (BILL_CYCLES.find(c => c.v === v) || {}).label || '',
  payWith: v => !v ? '銀行帳戶自動扣款' : v === 'other' ? '其他（現金、轉帳…）' : `刷 ${(state.bills.find(c => c.id === v) || {}).name || '（已刪除的卡）'}`,
  autopay: v => v === 'manual' ? '自己繳' : '自動扣繳',
  property: v => { const a = propOf(v); return a ? a.name : v ? '（已刪除的房子）' : '不指定'; },
  stock: (v, vals) => { const q = v && Stocks.quote(mktOf(vals), v); return q ? (q.fund ? q.name : `${q.sym} ${q.name}`) : v; },
  fmode: v => v === 'manual' ? '自己填目前市值' : '選基金，每天自動更新淨值',
};
const PICK_ICON = {
  planSource: v => v === 'self' || !v ? Icon('wallet') : v === '__newline' ? Icon('mortgage') : v === '__newother' ? Icon('loan') : UI.bankIcon(bankOf((state.debts.find(d => d.id === v) || {}).bank)),
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
  planMode: v => Icon(v === 'monthly' ? 'calendar' : 'invest'),
  planType: v => Icon({ '股票': 'chart', '基金': 'fund', '債券': 'bond', '加密貨幣': 'crypto', '儲蓄／定存': 'cash', '其他': 'other' }[v || '股票'] || 'other'),
  billKind: v => Icon((BILL_KINDS.find(c => c.v === v) || {}).ic || 'calendar'),
  billCat: v => Icon((BILL_CATS.find(c => c.v === v) || {}).ic || 'other'),
  billCcy: v => Icon((CURRENCIES.find(c => c.v === v) || {}).ic || 'twd'),
  billCycle: v => Icon(v === 'w' ? 'clock' : 'calendar'),
  payWith: v => !v ? Icon('bank') : v === 'other' ? Icon('wallet') : UI.bankIcon(bankOf((state.bills.find(c => c.id === v) || {}).bank)),
  autopay: v => Icon(v === 'manual' ? 'wallet' : 'bank'),
  property: v => { const a = propOf(v); return a ? assetIcon(a) : Icon('other'); },
  stock: (v, vals) => Icon((MKTS[mktOf(vals)] || MKTS.tw).ic),
  fmode: v => Icon(v === 'manual' ? 'pencil' : 'fund'),
};

const isRE = v => v.category === '不動產';
const isMortgage = v => ['房貸', '理財型房貸'].includes(v.type) || !!v.collateral;
const propOf = id => id && state.assets.find(a => a.id === id && isRE(a));
// 這間房子背的貸款
function loansOn(assetId, st = summary().st) {
  const list = st.filter(x => x.d.collateral === assetId);
  const debt = list.reduce((t, x) => t + x.s.balance, 0), monthly = list.reduce((t, x) => t + x.s.monthly, 0);
  return { list, debt, monthly };
}
const isCar = v => v.category === '車輛';
const isStock = v => !!mktOf(v);
const isAuto = v => v.mode === 'auto';
const isRev = v => v.mode === 'revolving';
const isManual = v => !isAuto(v) && !isRev(v);
const noQuote = v => isStock(v) && v.sym && !Stocks.quote(mktOf(v), v.sym);
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// 下一次扣款日（今天還沒扣就是這個月，扣過了就下個月；還沒開始還款就是第一期）
function nextDue(d, today = new Date()) {
  const day = Loan.dueDay(d); if (!day) return null;
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let ym = Loan.nowYM(today);
  if (d.mode === 'auto' && d.startYM && Loan.ymDiff(ym, Loan.ymAdd(d.startYM, 1)) > 0) ym = Loan.ymAdd(d.startYM, 1);
  let dt = Loan.dueDate(ym, day);
  if (dt < t0) dt = Loan.dueDate(Loan.ymAdd(ym, 1), day);
  return { date: dt, days: Math.round((dt - t0) / 864e5) };
}
const WD = '日一二三四五六';
const mdTxt = dt => `${dt.getMonth() + 1}/${dt.getDate()}（${WD[dt.getDay()]}）`;
const dueTxt = d => { const k = Loan.dueDay(d); return k ? `每月 ${k} 日` : ''; };
const thisYM = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

const FIELDS = {
  asset: [
    { k: 'category', label: '類別', type: 'pick', opts: 'assetCat', def: '現金/存款' },
    { k: 'name', label: '名稱', type: 'text', req: true, ph: '例：玉山活存', show: v => !isStock(v) },
    { k: 'fmode', label: '記錄方式', type: 'pick', opts: 'fmode', def: 'track', show: v => v.category === '基金' && !v.id },
    { sec: ['tw', '股票持股'], show: isStock, labelFn: v => mktOf(v) === 'fund' ? '基金持有' : '股票持股', iconFn: v => (MKTS[mktOf(v)] || MKTS.tw).ic },
    { k: 'sym', label: '股票代號', type: 'pick', opts: 'stock', show: v => isStock(v) && !v.id, req: true, labelFn: v => mktOf(v) === 'fund' ? '基金' : '股票代號' },
    { panel: 'stockPanel', show: isStock },
    { k: 'shares', label: '買進股數', type: 'number', req: true, show: v => isStock(v) && !v.id, half: true, labelFn: v => mktOf(v) === 'fund' ? '持有單位數' : '買進股數', hintFn: v => mktOf(v) === 'tw' ? '1 張 = 1,000 股' : mktOf(v) === 'fund' ? '對帳單上的「單位數」，可輸入小數' : '可輸入小數（零股）' },
    { k: 'cost', label: '成交價／平均成本', type: 'number', show: v => isStock(v) && !v.id, half: true, labelFn: v => mktOf(v) === 'fund' ? '申購淨值／平均成本' : '成交價／平均成本', hintFn: v => mktOf(v) === 'fund' ? `用基金的計價幣別${(() => { const q = v.sym && Stocks.quote('fund', v.sym); return q ? `（${q.ccy}）` : ''; })()}，用來算損益，可不填` : '用來算損益，可不填' },
    { k: 'buyDate', label: '買進日期（選填）', type: 'date', show: v => isStock(v) && !v.id },
    { k: 'manualPrice', label: '目前股價（找不到報價時填）', type: 'number', show: noQuote, labelFn: v => mktOf(v) === 'fund' ? '目前淨值（找不到淨值時填）' : '目前股價（找不到報價時填）' },
    { sec: ['property', '實價登錄估價'], show: isRE },
    { k: 'county', label: '縣市', type: 'pick', opts: 'county', show: isRE, half: true },
    { k: 'district', label: '行政區', type: 'pick', opts: 'district', show: isRE, half: true },
    { k: 'road', label: '路段', type: 'pick', opts: 'road', show: isRE },
    { k: 'address', label: '巷弄門牌（只存在手機裡）', type: 'text', ph: '例：43巷12號，或貼上完整地址', show: isRE, action: { id: 'lookupBtn', text: '查實價' } },
    { k: 'btype', label: '建物型態', type: 'pick', opts: 'btype', def: '住宅大樓', show: isRE, half: true },
    { k: 'ping', label: '建物坪數（不含車位）', type: 'number', show: isRE, half: true },
    { panel: 'lvrPanel', show: isRE },
    { panel: 'propLoanPanel', show: v => isRE(v) && !!v.id },
    { sec: ['car', '車輛資訊'], show: isCar },
    { panel: 'carPreview', show: isCar },
    { k: 'brand', label: '廠牌', type: 'pick', opts: 'brand', show: isCar },
    { k: 'model', label: '車款', type: 'pick', opts: 'carModel', show: v => isCar(v) && !!v.brand },
    { k: 'carColor', label: '車色', type: 'pick', opts: 'carColor', show: v => isCar(v) && !!v.brand },
    { k: 'buyYear', label: '購入年份', type: 'number', ph: String(new Date().getFullYear()), show: isCar, half: true, req: true },
    { k: 'buyMonth', label: '購入月份（選填）', type: 'number', min: 1, max: 12, ph: '例：5', show: isCar, half: true },
    { k: 'buyPrice', label: '購入價格（新台幣元）', type: 'number', show: isCar, half: true, req: true, ph: '例：950000', hintFn: v => num(v.buyPrice) && num(v.buyPrice) < 10000 ? '<span class="neg">要填「元」，例如 95 萬填 950000</span>' : '' },
    { panel: 'carPanel', show: isCar },
    { sec: ['wallet', '價值'], show: v => !isStock(v) && !(isCar(v) && num(v.buyPrice) && num(v.buyYear)) },
    { k: 'amount', label: '目前價值', type: 'number', req: true, show: v => !isStock(v) && !(isCar(v) && num(v.buyPrice) && num(v.buyYear)) },
    { k: 'note', label: '備註', type: 'text' },
  ],
  debt: [
    { k: 'type', label: '類型', type: 'pick', opts: 'debtType', def: '房貸' },
    { k: 'name', label: '名稱', type: 'text', req: true, ph: '例：自住房貸' },
    { k: 'bank', label: '負債來源（銀行）', type: 'pick', opts: 'bank', search: true },
    { k: 'collateral', label: '抵押的房子', type: 'pick', opts: 'property', show: v => isMortgage(v) },
    { k: 'mode', label: '計算方式', type: 'pick', opts: 'mode', def: 'auto' },
    { k: 'principal', label: '原始貸款金額（撥款時）', type: 'number', req: true, show: isAuto },
    { k: 'limit', label: '核准額度', type: 'number', req: true, show: isRev },
    { k: 'rate', label: '年利率 (%)', type: 'number', step: '0.001', req: true, half: true },
    { k: 'years', label: '貸款年限（年）', type: 'number', step: '0.5', req: true, show: isAuto, half: true },
    { k: 'startDate', label: '撥款日期', type: 'date', req: true, show: isAuto, half: true, def: todayStr, hintFn: v => v._dateGuess ? '<span class="neg">原本只記到月份，請改成實際撥款日</span>' : '' },
    { k: 'payDay', label: '每月扣款日', type: 'number', min: 1, max: 31, half: true, ph: '同撥款日', hintFn: v => isAuto(v) ? '不填 = 跟撥款同一天' : '幾號從帳戶扣款' },
    { k: 'grace', label: '撥款時就有的寬限期（之後才申請的請加在下方「貸款歷程」）', type: 'pick', opts: 'grace', def: '0', show: isAuto },
    { k: 'method', label: '還款方式', type: 'pick', opts: 'method', def: 'annuity', show: isAuto },
    { k: 'balance', label: '剩餘本金', type: 'number', req: true, show: isManual, half: true },
    { k: 'monthly', label: '每月還款', type: 'number', req: true, show: isManual, half: true },
    { k: 'drawn', label: '已動用金額（投資計畫以外）', type: 'number', show: isRev, half: true, def: '0' },
    { k: 'drawnYM', label: '這筆動用從哪個月開始（選填，用來算已繳利息）', type: 'month', show: v => isRev(v) && num(v.drawn) > 0 },
    { k: 'endYM', label: '額度到期年月（選填）', type: 'month', show: isRev, half: true },
    { panel: 'loanPanel', show: () => true },
    { panel: 'chgPanel', show: isAuto },
    { k: 'note', label: '備註', type: 'text' },
  ],
};
FIELDS.plan = [
  { k: 'name', label: '計畫名稱', type: 'text', req: true, ph: '例：理財型房貸分批投入' },
  { k: 'ptype', label: '投資類型', type: 'pick', opts: 'planType', def: '股票' },
  { k: 'pmode', label: '怎麼投入', type: 'pick', opts: 'planMode', def: 'total' },
  { k: 'total', label: '投入總額', type: 'number', req: true, half: true, show: v => v.pmode !== 'monthly', ph: '例：14600000' },
  { k: 'perMonth', label: '每月投入金額', type: 'number', req: true, half: true, show: v => v.pmode === 'monthly', ph: '例：10000' },
  { k: 'months', label: '分幾個月投入', type: 'number', req: true, half: true, def: '12', min: 1, max: 600, labelFn: v => v.pmode === 'monthly' ? '投入幾個月' : '分幾個月投入', hintFn: v => v.pmode === 'monthly' ? '定期定額沒有結束日，可以填 120（10 年）' : '' },
  { k: 'startYM', label: '第一次投入年月', type: 'month', req: true, half: true, def: thisYM },
  { k: 'day', label: '每月投入日（選填）', type: 'number', min: 1, max: 31, half: true },
  { k: 'doneMonths', label: '已經投入幾個月（選填）', type: 'number', min: 0, max: 600, half: true, ph: '例：3', hintFn: () => '已經在跑的計畫填這裡；這幾期會直接算已投入，「第一次投入年月」會自動往前推' },
  { k: 'source', label: '資金來源', type: 'pick', opts: 'planSource', def: 'self' },
  { sec: ['bank', '新額度的資料（儲存後會出現在負債）'], show: v => isNewLine(v) },
  { k: 'nlName', label: '額度名稱', type: 'text', req: true, show: v => isNewLine(v), ph: v => v.source === '__newother' ? '例：股票質押額度' : '例：理財型房貸額度' },
  { k: 'nlBank', label: '銀行', type: 'pick', opts: 'bank', search: true, show: v => isNewLine(v) },
  { k: 'nlLimit', label: '核准額度', type: 'number', half: true, show: v => isNewLine(v), ph: v => v.total ? String(v.total) : '例：14600000', hintFn: () => '不填就用投入總額' },
  { k: 'nlRate', label: '年利率 (%)', type: 'number', step: '0.001', req: true, half: true, show: v => isNewLine(v), ph: v => v.source === '__newother' ? '例：3.2' : '例：2.6' },
  { panel: 'planStocks', show: v => pickType(v.ptype) },
  { k: 'targets', label: '投資標的（選填，可寫比例）', type: 'text', ph: '例：0050 50%、00878 30%、VOO 20%', show: v => !pickType(v.ptype) },
  { k: 'yieldPct', label: '預估年化報酬／殖利率 %（選填）', type: 'number', step: '0.1', half: true },
  { panel: 'planPanel', show: () => true },
  { k: 'note', label: '備註', type: 'text' },
];
const KEY = { asset: 'assets', debt: 'debts', plan: 'plans', bill: 'bills' };
const KIND_NAME = { asset: '資產', debt: '負債', plan: '投資計畫', bill: '定期扣款', '': '' };
const KIND_ICON = { asset: 'piggy', debt: 'card', plan: 'invest', bill: 'calendar' };
const isNewLine = v => String(v.source || '').startsWith('__new');
const isCardBill = v => v.bkind === 'card', isSub = v => v.bkind !== 'card';
FIELDS.bill = [
  { k: 'bkind', label: '種類', type: 'pick', opts: 'billKind', def: 'sub' },
  { k: 'name', label: '名稱', type: 'text', req: true, phFn: true, ph: '例：Netflix、Claude Pro、中華電信' },
  { k: 'cat', label: '類別', type: 'pick', opts: 'billCat', def: '其他', show: isSub },
  { k: 'bank', label: '發卡銀行', type: 'pick', opts: 'bank', search: true, show: isCardBill },
  { k: 'closeDay', label: '結帳日（每月幾號）', type: 'number', min: 1, max: 31, req: true, half: true, show: isCardBill },
  { k: 'dueDay', label: '繳款截止日（每月幾號）', type: 'number', min: 1, max: 31, req: true, half: true, show: isCardBill },
  { k: 'amount', label: '金額', type: 'number', half: true, hintFn: v => isCardBill(v) ? '每期大約要繳多少（選填）；不填就用刷這張卡的訂閱加總' : '' },
  { k: 'ccy', label: '幣別', type: 'pick', opts: 'billCcy', def: 'TWD', half: true },
  { k: 'cycle', label: '週期', type: 'pick', opts: 'billCycle', def: '1', show: isSub },
  { k: 'anchor', label: '某一次扣款的日期', type: 'date', req: true, def: () => todayStr(), show: isSub, hintFn: () => '例如上次扣款那天；之後依週期自動推算' },
  { k: 'payWith', label: '扣款方式', type: 'pick', opts: 'payWith', def: '', show: isSub },
  { k: 'autopay', label: '繳款方式', type: 'pick', opts: 'autopay', def: 'auto', show: isCardBill },
  { k: 'endDate', label: '結束日期（選填，到期或已取消）', type: 'date', show: isSub },
  { k: 'note', label: '備註', type: 'text' },
];
// ---- 各情境的範例文字 ----
const EX = {
  assetName: { '現金/存款': '例：玉山活存、郵局定存', '基金': '例：安聯台灣科技基金、全球股票基金', '債券': '例：美國 10 年期公債、投資等級公司債', '加密貨幣': '例：比特幣 0.1 顆、以太幣', '保險': '例：國泰六年期儲蓄險、富邦還本壽險', '不動產': '例：板橋的家、新豐透天', '車輛': '例：家用休旅、通勤機車', '其他': '例：名錶、黃金存摺、借給朋友的錢' },
  assetAmount: { '現金/存款': '帳戶餘額', '基金': '目前市值（淨值 × 單位數）', '債券': '目前市值', '加密貨幣': '目前市值（換算台幣）', '保險': '目前保單價值（可領回的解約金）', '不動產': '目前價值（可用上面的實價登錄估價）', '車輛': '目前價值（可用上面的估算）', '其他': '目前價值' },
  assetNote: { '現金/存款': '例：緊急預備金、年利率 1.7%', '基金': '例：每月定期定額 5,000', '保險': '例：2030 年滿期', '不動產': '例：自住、出租中', '車輛': '例：車牌 ABC-1234', '加密貨幣': '例：放在冷錢包' },
  debtName: { '房貸': '例：自住房貸', '理財型房貸': '例：理財型房貸額度', '信貸': '例：裝潢信貸', '車貸': '例：Corolla Cross 車貸', '學貸': '例：大學學貸', '信用卡': '例：中信卡循環', '親友借款': '例：跟爸媽借的頭期款', '其他': '例：手機分期、iPhone 0 利率' },
  debtNote: { '房貸': '例：第一年固定利率', '理財型房貸': '例：抵押家人的房子', '親友借款': '例：每月還 5,000、不算利息', '信用卡': '例：最低應繳 10%' },
  billName: { card: '例：花旗現金回饋卡、中信 LINE Pay 卡、國泰 CUBE 卡',
    '串流影音': '例：Netflix、Spotify、Disney+', 'AI／軟體': '例：Claude Pro、ChatGPT Plus、Adobe', '電信網路': '例：中華電信 5G、光世代', '保險': '例：機車強制險、壽險', '水電瓦斯': '例：台電電費、自來水、瓦斯', '房租': '例：套房房租、大樓管理費', '健身': '例：World Gym 月費', '雲端儲存': '例：iCloud+、Google One', '其他': '例：Costco 年費、報紙訂閱' },
  billAmount: { card: '例：8000', '串流影音': '例：390', 'AI／軟體': '例：20（美元就把幣別改成 USD）', '電信網路': '例：999', '保險': '例：1080', '水電瓦斯': '例：1600', '房租': '例：16000', '健身': '例：1288', '雲端儲存': '例：90', '其他': '例：1350' },
  billNote: { card: '例：從玉山帳戶扣款、回饋 3%', sub: '例：家庭方案，跟家人分攤' },
};
FIELDS.asset.find(f => f.k === 'name').ph = v => EX.assetName[v.category] || '例：玉山活存';
FIELDS.asset.find(f => f.k === 'amount').labelFn = v => EX.assetAmount[v.category] || '目前價值';
FIELDS.asset.find(f => f.k === 'note').ph = v => isStock(v) ? '例：長期持有、領股息' : EX.assetNote[v.category] || '';
FIELDS.debt.find(f => f.k === 'name').ph = v => EX.debtName[v.type] || '例：自住房貸';
FIELDS.debt.find(f => f.k === 'note').ph = v => EX.debtNote[v.type] || '';
FIELDS.debt.find(f => f.k === 'rate').ph = v => ({ '房貸': '例：2.185', '理財型房貸': '例：2.6', '信貸': '例：3.5', '車貸': '例：3.9', '學貸': '例：1.15', '信用卡': '例：15', '親友借款': '0' })[v.type] || '';
FIELDS.debt.find(f => f.k === 'years').ph = v => ({ '房貸': '例：30', '理財型房貸': '例：30', '信貸': '例：7', '車貸': '例：5', '學貸': '例：8' })[v.type] || '';
FIELDS.debt.find(f => f.k === 'principal').ph = v => ({ '房貸': '例：12000000', '信貸': '例：500000', '車貸': '例：800000', '學貸': '例：200000' })[v.type] || '';
FIELDS.debt.find(f => f.k === 'limit').ph = v => v.type === '理財型房貸' ? '例：14600000' : '例：3000000';
FIELDS.plan.find(f => f.k === 'name').ph = v => v.source && v.source !== 'self' ? '例：理財型房貸分批投入' : '例：每月定期定額 0050';
FIELDS.plan.find(f => f.k === 'targets').ph = v => v.source && v.source !== 'self' ? '例：0050 50%、00878 30%、VOO 20%' : '例：0050 100%';
FIELDS.bill.find(f => f.k === 'name').ph = v => isCardBill(v) ? EX.billName.card : EX.billName[v.cat] || EX.billName['其他'];
FIELDS.bill.find(f => f.k === 'amount').ph = v => isCardBill(v) ? EX.billAmount.card : EX.billAmount[v.cat] || '';
FIELDS.bill.find(f => f.k === 'amount').labelFn = v => isCardBill(v) ? '每期大約金額（選填）' : '每次扣款金額';
FIELDS.bill.find(f => f.k === 'note').ph = v => isCardBill(v) ? EX.billNote.card : EX.billNote.sub;
const NUMERIC = new Set(['doneMonths', 'perMonth', 'buyMonth', 'nlLimit', 'nlRate', 'closeDay', 'dueDay', 'amount', 'ping', 'buyYear', 'buyPrice', 'principal', 'rate', 'years', 'payDay', 'balance', 'monthly', 'shares', 'cost', 'manualPrice', 'limit', 'drawn', 'total', 'months', 'day', 'yieldPct']);

// ---------- 編輯器 ----------
let editing = null;
let vals = {};

function fieldHTML(f) {
  if (f.sec) return `<div class="sec" data-show>${f.sec[0] === 'car' ? UI.carIcon() : Icon(f.iconFn ? f.iconFn(vals) : f.sec[0])}<span>${f.labelFn ? f.labelFn(vals) : f.sec[1]}</span></div>`;
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
    <span class="inrow"><input name="${f.k}" type="${f.type}" ${attrs} value="${esc(v)}" placeholder="${esc((typeof f.ph === 'function' ? f.ph(vals) : f.ph) || '')}" data-req="${f.req ? 1 : ''}">
    ${f.action ? `<button type="button" class="btn mini" id="${f.action.id}">${Icon.svg('search', 18)} ${f.action.text}</button>` : ''}</span>${hint}</label>`;
}

function openEditor(kind, id, preset) {
  if (scaled) return toast('目前是縮小顯示，切回正常顯示才能新增或修改');
  const list = state[KEY[kind]];
  const item = id ? list.find(x => x.id === id) : null;
  editing = { kind, id };
  vals = item ? { ...item } : {};
  if (preset) Object.assign(vals, preset);
  if (kind === 'debt') {
    vals = normLoan(vals); vals.changes = (vals.changes || []).map(c => ({ ...c })); chgEdit = null;
    if (vals.startDate && !vals.startYM) vals.startYM = vals.startDate.slice(0, 7);
    if (!vals.startDate && vals.startYM) { vals.startDate = `${vals.startYM}-${String(Math.min(Loan.daysIn(vals.startYM), +vals.payDay || 1)).padStart(2, '0')}`; vals._dateGuess = true; }
  }
  FIELDS[kind].forEach(f => { if (f.k && vals[f.k] == null && f.def != null) vals[f.k] = typeof f.def === 'function' ? f.def() : f.def; });
  if (kind === 'debt' && vals.startDate && !vals.startYM) vals.startYM = vals.startDate.slice(0, 7);
  if (kind === 'plan' && item && !item.ptype) {
    // 舊計畫：把文字寫的標的（例如「0050 50%、VOO 20%」）轉成股票清單
    const ts = parseTargets(vals.targets);
    const conv = ts.map(t => { const sym = t.name.toUpperCase(); const m = /^\d/.test(sym) ? 'tw' : 'us'; return Stocks.quote(m, sym) ? { mkt: m, sym, pct: t.pct } : null; });
    if (ts.length && conv.every(Boolean)) { vals.ptype = '股票'; vals.stocks = conv; }
    else vals.ptype = vals.targets ? '其他' : '股票';
  }
  if (kind === 'plan') { vals.stocks = (vals.stocks && vals.stocks.length ? vals.stocks : [{ mkt: 'tw', sym: '', pct: '' }]).map(x => ({ ...x })); vals.doneMonths = ''; Stocks.load().then(() => { if ($('editor').open && editing.kind === 'plan') drawPlanStocks(); }); }
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
    // 範例、標題、提示跟著目前選的類別／類型切換
    if (typeof f.ph === 'function') { const inp = nodes[i].querySelector('input'); if (inp) inp.placeholder = f.ph(vals) || ''; }
    if (f.labelFn) { const lb = nodes[i].querySelector('.flabel'); if (lb) lb.textContent = f.labelFn(vals); }
    if (f.hintFn) { const h = nodes[i].querySelector('.hint'); if (h) h.innerHTML = f.hintFn(vals); }
    const inp = nodes[i].querySelector('input');
    if (inp) inp.required = on && inp.dataset.req === '1';
  });
  if (editing.kind === 'debt') { drawLoanPanel(); drawChgPanel(); }
  if (editing.kind === 'asset' && isCar(vals)) drawCarPanels();
  if (editing.kind === 'asset' && isRE(vals)) drawLvrPanel();
  if (editing.kind === 'asset' && isRE(vals) && vals.id) drawPropLoanPanel();
  if (editing.kind === 'asset' && isStock(vals)) drawStockPanel();
  if (editing.kind === 'plan') { drawPlanPanel(); drawPlanStocks(); }
}
function drawPropLoanPanel() {
  const el = $('propLoanPanel'); if (!el) return;
  const L = loansOn(vals.id);
  const v = num(vals.amount);
  if (!L.list.length) { el.innerHTML = `<div class="hint-row">${Icon('mortgage')}<span>這間房子有房貸的話，到那筆貸款的「抵押的房子」選這間，就會在這裡看到貸款與淨值</span></div>`; return; }
  el.innerHTML = `<div class="panel-title">${Icon('mortgage')} 這間房子的貸款</div>
    ${L.list.map(x => `<button type="button" class="kv kv-btn" data-jump="${x.d.id}"><span>${esc(x.d.name)}</span><span>${fmt(x.s.balance)} ›</span></button>`).join('')}
    <div class="kv"><span>貸款合計</span><b class="neg">${fmt(L.debt)}</b></div>
    <div class="kv"><span>每月合計還款</span><span>${fmt(L.monthly)}</span></div>
    <div class="kv"><span>淨值（價值 − 貸款）</span><b class="${v - L.debt >= 0 ? 'pos' : 'neg'}">${fmt(v - L.debt)}</b></div>
    <div class="kv"><span>貸款成數</span><span>${v ? (L.debt / v * 100).toFixed(1) + '%' : '—'}</span></div>`;
}
$('editFields').addEventListener('click', e => {
  const j = e.target.closest('[data-jump]');
  if (j) openEditor('debt', j.dataset.jump);
});

function readInputs() {
  $('editFields').querySelectorAll('input[name]').forEach(i => { vals[i.name] = i.value; });
}

$('editFields').addEventListener('input', e => {
  if (!e.target.name) return;
  vals[e.target.name] = e.target.value;
  if (e.target.name === 'startDate') {
    vals._dateGuess = false; vals.startYM = (e.target.value || '').slice(0, 7);
    const pd = $('editFields').querySelector('input[name=payDay]'); if (pd) pd.placeholder = e.target.value ? `同撥款日（${+e.target.value.slice(8)} 日）` : '同撥款日';
    const h = e.target.closest('label') && e.target.closest('label').querySelector('.hint'); if (h) h.innerHTML = '';
  }
  if (editing.kind === 'debt') { drawLoanPanel(); drawChgPanel(); }
  if (editing.kind === 'plan') drawPlanPanel();
  if (editing.kind === 'asset' && isCar(vals) && ['buyYear', 'buyMonth', 'buyPrice', 'model'].includes(e.target.name)) refreshForm();
  if (editing.kind === 'asset' && isRE(vals) && e.target.name === 'ping') drawLvrPanel();
  if (editing.kind === 'asset' && isRE(vals) && vals.id && e.target.name === 'amount') drawPropLoanPanel();
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
      title: isStk ? ({ us: '美股代號', fund: '選基金（境內＋境外）', tw: '台股代號' }[mktOf(vals)] || '台股代號') : f.label, options, value: vals[k],
      search: f.search || isStk || isModel || options.length > 8, limit: isStk ? 40 : 0,
      placeholder: isStk ? ({ us: '輸入代號，例如 AAPL、VOO', fund: '輸入基金名稱或公司，例如 安聯台灣科技、摩根、貝萊德' }[mktOf(vals)] || '輸入代號或名稱，例如 2330、0050、台積電') : '',
      custom: isStk && mktOf(vals) === 'fund' ? null : isStk ? q => !/^[A-Za-z0-9.\-]{1,10}$/.test(q) ? null : opt(Stocks.norm(mktOf(vals), q), `使用「${Stocks.norm(mktOf(vals), q)}」`, Icon('pencil'), '沒有自動報價，之後手動填股價')
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
      const pm = mktOf({ category: prev }), nm = mktOf(vals);
      if (pm !== nm) {
        if (editing.id && pm && nm && (pm === 'fund' || nm === 'fund')) { vals[k] = prev; toast('基金和股票不能互換，請另外新增'); }
        else if (editing.id && pm && nm && vals.sym) { vals.sym = Stocks.norm(nm, vals.sym); toast(`這檔會改成${vals.category}，按儲存生效`); }
        else if (editing.id && pm && !nm) { vals[k] = prev; toast('股票只能在台股和美股之間切換'); }
        else vals.sym = '';
      }
    }
    if (k === 'sym' && mktOf(vals) === 'fund') Stocks.fundHist([vals.sym]).then(() => { if ($('editor').open) drawStockPanel(); });
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

// --- 股票：新增時同代號自動歸到同一檔 ---
function findHolding(category, sym) {
  const mkt = mktOf({ category });
  const k = Stocks.norm(mkt, sym);
  return state.assets.find(a => a.category === category && a.sym && Stocks.norm(mkt, a.sym) === k);
}
function addLot(category, sym, lot, extra = {}) {
  const mkt = mktOf({ category });
  const k = Stocks.norm(mkt, sym);
  const h = findHolding(category, k);
  const q = Stocks.quote(mkt, k);
  if (h) { h.lots = [...(h.lots || []), lot]; if (!h.name || h.name === h.sym) h.name = q ? q.name : h.sym; Object.assign(h, extra, { updatedAt: new Date().toISOString() }); return { h, merged: true }; }
  const nh = { id: uid(), category, sym: k, name: q ? q.name : k, lots: [lot], ...(mkt === 'fund' ? { fmode: 'track', ccy: q ? q.ccy : 'TWD' } : {}), ...extra, updatedAt: new Date().toISOString() };
  state.assets.push(nh);
  openGroups.add(category);
  return { h: nh, merged: false };
}
function saveStock() {
  if (editing.id) {
    const cur = state.assets.find(a => a.id === editing.id);
    // 改市場（台股 ↔ 美股）：同市場已有同代號就合併交易紀錄
    if (cur && cur.category !== vals.category) {
      const sym = Stocks.norm(mktOf(vals), vals.sym);
      const other = state.assets.find(a => a.id !== cur.id && a.category === vals.category && a.sym && Stocks.norm(mktOf(a), a.sym) === sym);
      if (other) {
        other.lots = [...(other.lots || []), ...(cur.lots || [])];
        state.assets = state.assets.filter(a => a.id !== cur.id);
        $('editor').close(); save(); return toast(`已併入${vals.category} ${sym}`);
      }
      const q = Stocks.quote(mktOf(vals), sym);
      cur.category = vals.category; cur.sym = sym; if (q) cur.name = q.name;
      openGroups.add(vals.category);
    }
    state.assets = state.assets.map(a => a.id === editing.id ? { ...a, manualPrice: vals.manualPrice === '' || vals.manualPrice == null ? '' : num(vals.manualPrice), note: String(vals.note || '').trim(), updatedAt: new Date().toISOString() } : a);
    $('editor').close();
    return save();
  }
  if (!num(vals.shares)) return toast(mktOf(vals) === 'fund' ? '請填持有單位數' : '請填買進股數');
  const lot = { id: uid(), type: 'buy', date: vals.buyDate || '', shares: num(vals.shares), price: vals.cost === '' || vals.cost == null ? '' : num(vals.cost) };
  const { h, merged } = addLot(vals.category, vals.sym, lot, vals.manualPrice ? { manualPrice: num(vals.manualPrice) } : {});
  $('editor').close();
  UI.burst('coin');
  save();
  const nm = mktOf(h) === 'fund' ? h.name : `${h.sym} ${h.name}`;
  toast(merged ? `已加入 ${nm}（共 ${h.lots.length} 筆交易）` : `已新增 ${nm}`);
}

// --- 股票面板 ---
function drawStockPanel() {
  const el = $('stockPanel');
  if (!el) return;
  const mkt = mktOf(vals);
  if (vals.id) {
    const si = stockInfo(vals);
    el.innerHTML = `<div class="stock-head"><div><b>${mkt === 'fund' ? '' : esc(Stocks.norm(mkt, vals.sym)) + ' '}${esc(si.q ? si.q.name : vals.name || '')}</b><div class="small muted">${unitTxt(mkt, si.shares)}${si.avg ? ` · 均價 ${price(si.avg, si.ccy)}` : ''}</div></div>
      <div class="r"><b class="big-px">${fmt(si.value)}</b>${si.pl != null ? `<div class="chg ${plCls(si.pl)}">${plTxt(si.pl, si.plPct)}</div>` : ''}</div></div>
      <div class="small muted">買進、賣出與每筆交易，請在資產列表點開這檔${mkt === 'fund' ? '基金，用「加碼申購」「贖回」' : '股票，用「加碼買進」「賣出」'}或點交易紀錄修改。</div>`;
    return;
  }
  const exist = vals.sym && findHolding(vals.category, vals.sym);
  if (!vals.sym) {
    el.innerHTML = mkt === 'fund' ? `<div class="hint-row">${Icon('fund')}<span>點上面選基金（境內＋境外都有），會帶出最新淨值與走勢。淨值每天晚上自動更新。</span></div>`
      : `<div class="hint-row">${Icon(mkt === 'us' ? 'us' : 'tw')}<span>${Stocks.ready() ? '點上面選股票代號，會自動帶出最新收盤價與走勢' : '報價資料讀取中，或尚未產生（GitHub Action 每天收盤後更新）'}</span></div>`;
    return;
  }
  const q = Stocks.quote(mkt, vals.sym);
  const ccy = mktCcy(mkt, q, vals);
  const px = q ? q.price : num(vals.manualPrice);
  const sh = num(vals.shares), k = Stocks.fx(ccy, state.currency);
  const val = sh * px * k;
  const cost = num(vals.cost);
  const tw = mkt === 'tw';
  const chgCls = q ? (q.chg > 0 ? 'up' : q.chg < 0 ? 'down' : '') : '';
  const twc = mkt !== 'us';   // 台股、基金：紅漲綠跌
  el.innerHTML = (exist ? `<div class="hint-row merge-row">${Icon('basket')}<span>你已經有 ${esc(exist.sym)} ${esc(exist.name || '')}，這次買進會歸到同一檔，自動重算平均成本</span></div>` : '') + (q ? `<div class="stock-head"><div><b>${q.fund ? '' : esc(q.sym) + ' '}${esc(q.name)}</b><div class="small muted">${q.fund ? `${q.org === 'D' ? '境內' : '境外'}基金・${esc(q.ccy)} 計價・${esc(q.date || '')} 淨值・每天自動更新` : `${esc(q.date || '')} 收盤 · 每個交易日自動更新`}</div></div>
      <div class="r"><b class="big-px">${price(q.price, ccy)}</b><div class="chg ${chgCls}">${q.chg >= 0 ? '+' : ''}${q.chg.toFixed(2)}（${q.chgPct >= 0 ? '+' : ''}${q.chgPct.toFixed(2)}%）</div></div></div>
      <div class="chart-box">${UI.sparkline(q.series, 280, 60, { tw: twc, dot: true, sw: 2 })}</div>`
    : `<div class="hint-row">${Icon('search')}<span>找不到「${esc(vals.sym)}」的自動報價，請在下方手動填目前${mkt === 'fund' ? '淨值' : '股價'}</span></div>`) +
    (tw ? `<div class="quick">${[1000, 100, 1].map(n => `<button type="button" class="btn mini" data-shares="${n}">+${n === 1000 ? '1 張' : n + ' 股'}</button>`).join('')}</div>` : '') +
    (sh && px ? `<div class="kv"><span>市值</span><b class="accent">${fmt(val)}</b></div>` : '') +
    (sh && px && ccy !== state.currency ? `<div class="small muted">以匯率 1 ${ccy} ≈ ${k.toFixed(k < 1 ? 4 : 2)} ${state.currency} 換算</div>` : '') +
    (sh && px && cost ? (() => { const pl = (px - cost) * sh * k; return `<div class="kv"><span>這筆的損益</span><span class="chg ${pl > 0 ? 'up' : pl < 0 ? 'down' : ''}">${pl >= 0 ? '+' : ''}${fmt(pl)}（${((px - cost) / cost * 100).toFixed(1)}%）</span></div>`; })() : '');
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
      ${(() => { const ps = d.id ? Plan.paidSoFar(d, state.plans) : null; return ps && ps.months ? `<div class="kv"><span>已繳利息（累計，估算）</span><span class="neg">${fmt(ps.interest)}</span></div>` : ''; })()}
      ${linked.length ? `<div class="small muted">已連結投資計畫：${linked.map(p => esc(p.name)).join('、')}（已動用會依投入進度自動增加）</div>`
        : `<div class="small muted">${d.id ? '' : '先儲存，'}到「投資」分頁新增計畫並把資金來源選這筆額度，已動用金額與利息就會依投入進度自動遞增。</div>`}`;
    return;
  }
  const ok = isAuto(d) ? num(d.principal) > 0 && num(d.years) > 0 && d.startYM : num(d.balance) > 0;
  if (!ok) { el.innerHTML = `<div class="hint-row">${Icon('calc')}<span>${isAuto(d) ? '填入貸款金額、年限與撥款年月，就會自動算出月付' : '填入剩餘本金與月付，估算還清時間'}</span></div>`; return; }
  const s = Plan.status(d, state.plans);
  const rows = [['目前每月還款', `<b class="accent">${fmt(s.monthly)}</b>`], ['剩餘本金', fmt(s.balance)]];
  const nd = nextDue(d);
  if (nd) rows.splice(1, 0, ['扣款日', `${dueTxt(d)}・下次 <b>${mdTxt(nd.date)}</b>${nd.days === 0 ? ' <span class="chip red">今天</span>' : `，還有 ${nd.days} 天`}`]);
  else if (!isAuto(d)) rows.splice(1, 0, ['扣款日', '<span class="muted">還沒填，填了就會提醒你幾號要繳</span>']);
  if (isAuto(d)) rows.push(['已繳期數', `${s.paid} / ${s.total} 期`]);
  if (s.inGrace) rows.push(['寬限期', `剩 ${s.graceLeft} 個月，${s.graceEndYM} 結束`], ['寬限期後月付', `<b class="neg">${fmt(s.afterGracePay)}</b>`]);
  rows.push(['預計還清', isFinite(s.monthsLeft) ? `${s.payoffYM}（剩 ${s.monthsLeft} 期）` : '<span class="neg">月付不足以還清</span>']);
  rows.push(['剩餘利息', isFinite(s.interestLeft) ? fmt(s.interestLeft) : '—']);
  const ps = isAuto(d) ? Plan.paidSoFar(d, state.plans) : null;
  if (ps && ps.months) rows.push(['已繳利息（累計）', `<span class="neg">${fmt(ps.interest)}</span>`], ['已還本金（累計）', `<span class="pos">${fmt(ps.principal)}</span>`]);
  el.innerHTML = `<div class="panel-title">${Icon('calc')} 試算結果</div>` + rows.map(([a, b]) => `<div class="kv"><span>${a}</span><span>${b}</span></div>`).join('');
}

// --- 貸款歷程：原始條件＋之後的變更 ---
const CHG = {
  grace: { ic: 'pause', t: '申請寬限期', f: [['months', '寬限期幾個月', 'pick']], d: c => `寬限期 ${+c.months} 個月（只繳利息）` },
  rate: { ic: 'percent', t: '利率調整', f: [['rate', '新的年利率 (%)', 'number', '0.001']], d: c => `利率改為 ${+c.rate}%` },
  term: { ic: 'calendar', t: '延長年限', f: [['months', '延長幾個月（12 = 1 年，縮短填負數）', 'number', '1']], d: c => `${+c.months >= 0 ? '延長' : '縮短'} ${Math.abs(+c.months) % 12 ? Math.abs(+c.months) + ' 個月' : Math.abs(+c.months) / 12 + ' 年'}，到期日跟著${+c.months >= 0 ? '往後' : '提前'}` },
  prepay: { ic: 'coin', t: '提前還本', f: [['amount', '還了多少', 'number', 'any']], d: c => `提前還本 ${fmt(+c.amount)}（年限不變，月付重算）` },
  balance: { ic: 'bank', t: '本金校正', f: [['amount', '銀行顯示的剩餘本金', 'number', 'any']], d: c => `以銀行為準，剩餘本金 ${fmt(+c.amount)}` },
};
let chgEdit = null;   // 正在編輯的變更 {id, type, ym, ...}
function drawChgPanel() {
  const el = $('chgPanel');
  if (!el) return;
  if (!isAuto(vals)) { el.innerHTML = ''; return; }
  const d = { ...vals, changes: vals.changes || [] };
  const ok = num(d.principal) > 0 && num(d.years) > 0 && d.startYM;
  const rows = ok ? Loan.schedule(d) : [];
  const ymS = ym => ym ? ym.replace('-', '/') : '';
  const today = Loan.nowYM();
  const at = ym => { const k = Loan.ymDiff(d.startYM, ym) - 1; return k >= 0 ? rows[k] : null; };   // 該月那一期
  const before = ym => { const k = Loan.ymDiff(d.startYM, ym) - 2; return k >= 0 ? rows[k] : null; };
  const items = [];
  if (ok && rows.length) {
    const first = rows.find(r => !r.grace) || rows[0];
    items.push({ ym: d.startYM, dl: d.startDate ? d.startDate.replace(/-/g, '/') : '', ic: 'bank', t: '撥款', d: `貸款 ${fmt(num(d.principal))}・${num(d.rate)}%・${num(d.years)} 年・${{ annuity: '本息平均', principal: '本金平均', interest: '只繳息到期還本' }[d.method || 'annuity']}${+d.grace ? `・寬限期 ${+d.grace} 個月` : ''}`, x: `第一期 ${fmt(rows[0].pay)}${first !== rows[0] ? `，寬限期後 ${fmt(first.pay)}` : ''}` });
    for (const c of d.changes.slice().sort((a, b) => Loan.ymDiff(b.ym, a.ym))) {
      const info = CHG[c.type]; if (!info || !c.ym) continue;
      const r = at(c.ym), p = before(c.ym);
      items.push({ ym: c.ym, ic: info.ic, t: info.t, d: info.d(c), x: r ? `${p ? `當時剩餘本金 ${fmt(p.balance)}・` : ''}月付 ${p ? fmt(p.pay) + ' → ' : ''}<b>${fmt(r.pay)}</b>` : '<span class="neg">在撥款前或貸款結束後，不會生效</span>', id: c.id, future: Loan.ymDiff(today, c.ym) > 0 });
    }
    for (const g of Loan.graceRuns(rows)) {
      const after = rows[g.to + 1];
      if (after) items.push({ ym: after.ym, ic: 'warn', t: '寬限期結束', d: '開始還本金', x: `月付 ${fmt(rows[g.to].pay)} → <b class="neg">${fmt(after.pay)}</b>`, auto: true, future: Loan.ymDiff(today, after.ym) > 0 });
    }
    const k = Math.min(Loan.paidPeriods(d.startYM, Loan.dueDay(d)), rows.length);
    if (k > 0 && k < rows.length) { const pi = rows.slice(0, k).reduce((t, r) => t + r.interest, 0), pp = rows.slice(0, k).reduce((t, r) => t + r.principal, 0);
      items.push({ ym: today, ic: 'pin', t: '現在', d: `已繳 ${k} 期，剩 ${rows.length - k} 期・累計繳了利息 <span class="neg">${fmt(pi)}</span>、本金 <span class="pos">${fmt(pp)}</span>`, x: `剩餘本金 <b>${fmt(rows[k - 1].balance)}</b>・本月 ${fmt(rows[k].pay)}`, now: true }); }
    const last = rows.at(-1);
    items.push({ ym: last.ym, ic: 'heart', t: '還清', d: `共 ${rows.length} 期`, x: `總利息 ${fmt(rows.reduce((t, r) => t + r.interest, 0))}`, auto: true, future: true });
    items.sort((a, b) => Loan.ymDiff(b.ym, a.ym) || (a.now ? 1 : 0) - (b.now ? 1 : 0));
  }
  const form = chgEdit ? (() => {
    const info = CHG[chgEdit.type];
    return `<div class="chg-form">
      <div class="seg chg-types">${Object.entries(CHG).map(([k, v]) => `<button type="button" data-ct="${k}" class="${chgEdit.type === k ? 'on' : ''}">${v.t}</button>`).join('')}</div>
      <label class="field"><span class="flabel">從哪個月的扣款開始</span><input type="month" data-cf="ym" value="${esc(chgEdit.ym || '')}"></label>
      ${info.f.map(([k, label, type, step]) => type === 'pick'
        ? `<label class="field"><span class="flabel">${label}</span><div class="seg">${[6, 12, 24, 36, 48, 60].map(m => `<button type="button" data-cm="${m}" class="${+chgEdit[k] === m ? 'on' : ''}">${m % 12 ? m + ' 月' : m / 12 + ' 年'}</button>`).join('')}</div></label>`
        : `<label class="field"><span class="flabel">${label}</span><input type="number" inputmode="decimal" step="${step}" data-cf="${k}" value="${esc(chgEdit[k] ?? '')}"></label>`).join('')}
      <div class="btnrow">${chgEdit.id && (vals.changes || []).some(c => c.id === chgEdit.id) ? '<button type="button" class="btn mini danger" data-ca="del">刪除</button>' : ''}<span class="spacer"></span><button type="button" class="btn mini" data-ca="cancel">取消</button><button type="button" class="btn mini primary" data-ca="ok">確定</button></div>
    </div>`;
  })() : '';
  el.innerHTML = `<div class="panel-title">${Icon('calendar')} 貸款歷程</div>
    <p class="small muted">撥款後發生的事（之後才申請寬限期、利率調整、延長年限、提前還本）都加在這裡，會從撥款一路算到今天，再推算以後。</p>
    ${ok ? `<ol class="loan-tl">${items.map(it => `<li class="${it.now ? 'now' : ''} ${it.future ? 'future' : ''} ${it.auto ? 'auto' : ''}" ${it.id ? `data-cid="${it.id}"` : ''}>
        <span class="tl-dot">${Icon.svg(it.ic, 20)}</span>
        <div class="tl-body"><div class="tl-head"><b>${it.t}</b><span>${it.dl || ymS(it.ym)}</span></div>
        <div class="small">${it.d}</div>${it.x ? `<div class="small muted">${it.x}</div>` : ''}</div>${it.id ? '<i class="set-chev">›</i>' : ''}</li>`).join('')}</ol>`
      : '<p class="small muted">先填好原始貸款金額、年限和撥款年月。</p>'}
    ${form || (ok ? '<button type="button" class="btn mini" data-ca="add">＋ 新增變更</button>' : '')}`;
}
$('editFields').addEventListener('click', e => {
  const t = e.target.closest('[data-ca], [data-ct], [data-cm], [data-cid]');
  if (!t || !t.closest('#chgPanel')) return;
  readInputs(); readChg();
  if (t.dataset.cid) { const c = (vals.changes || []).find(x => x.id === t.dataset.cid); if (c) chgEdit = { ...c }; }
  else if (t.dataset.ct) { chgEdit.type = t.dataset.ct; }
  else if (t.dataset.cm) { chgEdit.months = +t.dataset.cm; }
  else {
    const a = t.dataset.ca;
    if (a === 'add') chgEdit = { id: uid(), type: 'grace', ym: Loan.nowYM(), months: 36 };
    else if (a === 'cancel') chgEdit = null;
    else if (a === 'del') { vals.changes = vals.changes.filter(c => c.id !== chgEdit.id); chgEdit = null; }
    else if (a === 'ok') {
      const c = chgEdit, f = CHG[c.type].f[0][0];
      if (!c.ym) return toast('請選生效年月');
      if (c[f] === '' || c[f] == null || !isFinite(+c[f])) return toast('請填' + CHG[c.type].f[0][1]);
      const clean = { id: c.id, ym: c.ym, type: c.type, [f]: +c[f] };
      const list = (vals.changes || []).filter(x => x.id !== c.id); list.push(clean);
      vals.changes = list; chgEdit = null;
    }
  }
  drawLoanPanel(); drawChgPanel();
});
function readChg() {
  if (!chgEdit) return;
  document.querySelectorAll('#chgPanel [data-cf]').forEach(i => { chgEdit[i.dataset.cf] = i.value; });
}
$('editFields').addEventListener('input', e => { if (e.target.dataset.cf && chgEdit) chgEdit[e.target.dataset.cf] = e.target.value; });

// --- 車輛 ---
// 車齡（年，可有小數）：有購入月份就用月份，沒有就當年中購入
function carAge(year, month) {
  const now = new Date(), y = num(year);
  if (!y) return 0;
  const m = num(month) ? num(month) - 1 : 6;
  return Math.max(0, (now.getFullYear() + now.getMonth() / 12) - (y + m / 12));
}
// 第一年約 -20%（逐月攤），之後每年約 -12%，最低保留 10%
function carValue(price, year, month) {
  const age = carAge(year, month);
  const v = price * (age <= 1 ? 1 - 0.2 * age : 0.8 * Math.pow(0.88, age - 1));
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
  const pr = num(vals.buyPrice), year = num(vals.buyYear), age = carAge(year, vals.buyMonth);
  if (!pr || !year) { el.innerHTML = `<div class="hint-row">${Icon('down')}<span>填入購入年份與價格，就會自動估算目前殘值（車子不計入總資產）</span></div>`; return; }
  const v = carValue(pr, year, vals.buyMonth);
  el.innerHTML = `<div class="kv"><span>估算殘值（車齡約 ${age < 1 ? Math.round(age * 12) + ' 個月' : age.toFixed(1) + ' 年'}）</span><b class="accent">${fmt(v)}</b></div>
    <div class="kv"><span>已折舊</span><span class="neg">${fmt(pr - v)}（${(100 - v / pr * 100).toFixed(0)}%）</span></div>
    <div class="muted small">殘值會自動算、每年自動更新，<b>不計入總資產與淨資產</b>。依一般折舊估算（首年約 -20%，之後每年約 -12%），實際以中古車行情為準。</div>`;
}

// --- 實價登錄 ---
let lvrToken = 0;
async function lookupAddress() {
  readInputs();
  if (!vals.address) return toast('請先輸入地址');
  const btn = $('lookupBtn');
  btn.disabled = true; btn.textContent = '查詢中…';
  try {
    // 只填巷弄門牌時，接上已選的縣市／行政區／路段再查
    let addr = vals.address.trim();
    const cn = (COUNTIES.find(c => c.k === vals.county) || {}).v || '';
    if (vals.district && !/[縣市]/.test(addr.slice(0, 4)) && !addr.includes(vals.district)) addr = cn + vals.district + (vals.road && !addr.includes(vals.road) ? vals.road : '') + addr;
    const r = await LVR.parseAddress(addr);
    vals.county = r.countyKey || vals.county; vals.district = r.district || vals.district; vals.road = r.road || vals.road;
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
    el.innerHTML = `<div class="hint-row">${Icon('townhouse')}<span>選縣市、行政區、路段，或在「巷弄門牌」貼上完整地址按「查實價」，會用近兩年實價登錄估算價值</span></div>`;
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
      <div class="muted small">資料：內政部實價登錄（${esc(r.seasons?.[0] || '')}～${esc(r.seasons?.at(-1) || '')}），資料更新於 ${esc((r.updated || '').slice(0, 10))}，每週一自動更新。單價已扣除車位，僅供參考。</div>`;
  } catch (err) {
    if (tk !== lvrToken) return;
    el.innerHTML = `<div class="hint-row">${Icon('warn')}<span>${esc(err.message)}。資料每週自動更新，也可以先手動輸入目前價值。</span></div>`;
  }
}

// ---- 問 AI：App 使用說明＋（可選）帶入自己的資料摘要 ----
const ASK_GUIDE = `Balanza 是台灣的個人資產負債 App（PWA），資料只存在使用者手機裡（可加密、可備份到自己的 GitHub Gist）。主要功能：
- 總覽：淨資產、資產負債比例、等級吉祥物、淨資產走勢（手指可在圖上左右滑看每天數字）。
- 資產：現金存款、台股、美股（自動收盤價）、基金（境內＋境外，自動淨值，或自己填市值）、債券、加密貨幣、保險、不動產（可用實價登錄估價）、車輛（只算殘值、不計入總資產）。股票基金可記多筆買進賣出、平均成本、損益。右下角 ＋ 可新增一筆、一次輸入股票（可用券商截圖 AI 辨識），或「用說的新增」。
- 負債：房貸、理財型房貸（額度、只繳息、依投資計畫逐筆動用）、信貸、車貸、學貸、信用卡、親友借款。自動試算本息平均／本金平均／只繳息，支援寬限期、利率調整、延長年限、提前還本、本金校正等歷程，可連結抵押的房子。
- 還款：扣款月曆（可左右滑、看過去已繳月份）、貸款與訂閱定期扣款、信用卡結帳日、未來每月要繳多少、貸款逐月明細、已經繳出去的利息本金。
- 投資：投資計畫（總額或每月投入、已投入月數、資金來源可選理財型房貸並自動建立額度與負債），標的可選台股、美股、基金，金額可填台幣或美金；每期確認實際成交後會加進持股。
- 設定：Face ID 加密鎖、隱私（隱藏金額、縮小顯示倍率）、AI 金鑰（Claude 或 Gemini）、文字大小、幣別、加密自動備份與還原、模擬人生展示。
點已加入的資產或負債會先顯示詳細內容，按「編輯」才修改。`;
function askData() {
  const S = summary(), r = v => Math.round(v);
  const L = [`今天 ${todayStr()}，金額為新台幣元。`, `總資產 ${r(S.totalAssets)}、總負債 ${r(S.totalDebts)}、淨資產 ${r(S.netWorth)}、負債比 ${S.debtRatio.toFixed(1)}%、每月貸款月付合計 ${r(S.monthlyPay)}（其中利息 ${r(S.monthlyInterest)}）。`];
  const cats = groupSum(state.assets.filter(countsAsAsset), a => a.category, assetValue);
  if (cats.length) L.push('資產類別：' + cats.map(([k, v]) => `${k} ${r(v)}`).join('、'));
  const hs = state.assets.map(a => ({ a, i: stockInfo(a) })).filter(x => x.i);
  if (hs.length) L.push('持股：' + hs.map(({ a, i }) => `${i.mkt === 'fund' ? (a.name || a.sym) : a.sym}（${mktCat(i.mkt)}）市值 ${r(i.value)}${i.pl != null ? `、未實現損益 ${r(i.pl)}（${i.plPct.toFixed(1)}%）` : ''}`).join('；'));
  const cars = state.assets.filter(isCar); if (cars.length) L.push('車輛（不計入資產）：' + cars.map(a => `${a.name} 殘值約 ${r(assetValue(a))}`).join('、'));
  if (S.st.length) L.push('負債：' + S.st.map(({ d, s: x }) => `${d.name}（${d.type || ''}，${shortBank(bankOf(d.bank))}）餘額 ${r(x.balance)}、年利率 ${(x.rate ?? num(d.rate))}%、${x.revolving ? `只繳息 每月利息 ${r(x.monthly)}、額度 ${r(x.limit || 0)}` : `月付 ${r(x.monthly)}`}${x.inGrace ? `、寬限期剩 ${x.graceLeft} 個月，結束後月付 ${r(x.afterGracePay)}` : ''}${isFinite(x.monthsLeft) ? `、${x.payoffYM} 還清` : ''}`).join('；'));
  if (state.plans.length) L.push('投資計畫：' + state.plans.map(p => `${p.name}（${p.ptype || '股票'}，每期 ${r(planPer(p))}、共 ${p.months} 期，${p.startYM} 起，資金來源 ${p.source === 'self' || !p.source ? '自有資金' : (state.debts.find(d => d.id === p.source) || {}).name || '額度'}）`).join('；'));
  const subs = state.bills.filter(isSub); if (subs.length) L.push(`訂閱與定期扣款 ${subs.length} 項，每月約 ${r(subs.reduce((t, b) => t + perMonth(b), 0))}`);
  try { const P = projection(24); L.push('未來 12 個月每月要繳：' + P.months.slice(0, 12).map(m => `${m.ym} ${r(m.total)}`).join('、')); } catch (e) { /* ignore */ }
  return L.join('\n');
}
let askLog = [], askBusy = null;
const ASK_SUGG = ['這個 App 可以做什麼？', '我每個月要繳多少？哪一筆最重？', '寬限期結束後月付會變多少？', '我的負債比健康嗎？', '怎麼新增基金？', '怎麼設定自動備份？'];
const ASK_LOCAL = {
  '這個 App 可以做什麼？': ASK_GUIDE,
  '怎麼新增基金？': '到「資產」分頁按右下角 ＋ →「新增一筆資產」→ 類別選「基金」。記錄方式選「選基金，每天自動更新淨值」，搜尋名稱（例如「安聯 收益」），再填持有單位數和申購淨值就好。找不到的基金可以選「自己填目前市值」。',
  '怎麼設定自動備份？': '到「設定 → 備份與還原」，照步驟建立 GitHub token，App 會產生一組恢復金鑰並加密備份到你自己的秘密 Gist。之後資料一有變動就會自動備份；換手機時用恢復金鑰就能還原。',
};
function mdLite(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{1,4}\s*(.+)$/gm, '<b>$1</b>').replace(/^\s*[-*•]\s+(.+)$/gm, '<span class="ask-li">$1</span>').replace(/\n/g, '<br>').replace(/<\/span><br>/g, '</span>');
}
function drawAsk() {
  const ready = aiReady();
  $('askBadge').textContent = ready ? (state.ai.provider === 'gemini' ? 'Gemini' : 'Claude') : '';
  $('askBadge').hidden = !ready;
  $('askLog').innerHTML = (askLog.length ? '' : `<div class="ask-msg ai">${ready ? '嗨！我可以回答 App 怎麼用，也可以根據你的資料幫你看看貸款、月付、資產配置。想問什麼？' : `目前還沒設定 AI 金鑰，我只能回答下面幾個常見問題。<br>到「設定 → AI 理解」貼上 Claude 或 Gemini 的 API 金鑰後，就可以自由提問，也能幫你看自己的資料。<br><button type="button" class="btn mini primary" data-sp="ai" data-askclose="1">前往設定 AI</button>`}</div>`)
    + askLog.map(m => `<div class="ask-msg ${m.role}${m.err ? ' err' : ''}">${m.role === 'ai' ? mdLite(m.text) : esc(m.text)}</div>`).join('')
    + (askBusy ? '<div class="ask-msg ai typing"><i></i><i></i><i></i></div>' : '');
  $('askSugg').innerHTML = (ready ? ASK_SUGG : Object.keys(ASK_LOCAL)).filter(q => !askLog.some(m => m.text === q)).slice(0, 4).map(q => `<button type="button" class="chip-btn" data-askq="${esc(q)}">${esc(q)}</button>`).join('');
  $('askCtx').checked = prefs.askCtx !== false;
  $('askCtx').disabled = !ready;
  $('askSend').disabled = !!askBusy;
  const lg = $('askLog'); lg.scrollTop = lg.scrollHeight;
}
function openAsk() {
  if (locked) return;
  drawAsk();
  $('askDialog').showModal();
}
async function askSend(q) {
  q = String(q || $('askText').value).trim();
  if (!q || askBusy) return;
  $('askText').value = ''; $('askText').style.height = '';
  askLog.push({ role: 'user', text: q });
  if (!aiReady()) {
    askLog.push({ role: 'ai', text: ASK_LOCAL[q] || '這個問題需要 AI 才能回答。到「設定 → AI 理解」貼上 Claude 或 Gemini 的 API 金鑰後就能自由提問。' });
    return drawAsk();
  }
  const ctl = new AbortController(); askBusy = ctl; drawAsk();
  const sys = `你是台灣個人資產負債 App「Balanza」裡的小幫手，用繁體中文、口語、精簡（多用條列）回答。
可以回答：App 功能怎麼用、使用者自己的資產負債與貸款狀況、一般理財觀念。算數字時要列出算法。
你不是理財顧問：不要叫使用者買賣特定標的，涉及重大決定時提醒他自行判斷或諮詢專業人士。不知道的不要編。
如果使用者想新增或修改資料，告訴他在 App 哪裡操作（你不能直接改資料）。

【App 說明】
${ASK_GUIDE}
${prefs.askCtx !== false ? `\n【使用者的資料摘要】\n${askData()}` : '\n（使用者沒有提供個人資料；需要時請他打開「讓 AI 參考我的資料摘要」）'}`;
  try {
    const txt = await AI.chat(state.ai, sys, askLog.slice(-12).filter(m => !m.err), ctl.signal);
    askLog.push({ role: 'ai', text: txt });
  } catch (e) {
    if (e.name !== 'AbortError') askLog.push({ role: 'ai', text: e.message, err: true });
  }
  askBusy = null; drawAsk();
}
$('askSend').addEventListener('click', () => askSend());
$('askText').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); askSend(); } });
$('askText').addEventListener('input', e => { const t = e.target; t.style.height = ''; t.style.height = Math.min(120, t.scrollHeight) + 'px'; });
$('askSugg').addEventListener('click', e => { const b = e.target.closest('[data-askq]'); if (b) askSend(b.dataset.askq); });
$('askCtx').addEventListener('change', e => { prefs.askCtx = e.target.checked; savePrefs(); });
$('askClear').addEventListener('click', () => { if (askBusy) askBusy.abort(); askBusy = null; askLog = []; drawAsk(); });
$('askClose').addEventListener('click', () => $('askDialog').close());
$('askDialog').addEventListener('click', e => { if (e.target === $('askDialog')) $('askDialog').close(); });   // 點外面（含右上角對話鈕的位置）就關閉
$('askLog').addEventListener('click', e => { const b = e.target.closest('[data-askclose]'); if (b) { $('askDialog').close(); showView('settings'); openSetPage(b.dataset.sp); } });

// --- 詳細內容：點一下先看內容，要改再按「編輯」 ---
let detailCtx = null;
const kvs = rows => rows.filter(Boolean).map(([a, b]) => `<div class="kv"><span>${a}</span><span>${b}</span></div>`).join('');
function openDetail(kind, id) {
  const S = summary();
  let head = '', body = '', editLabel = '編輯';
  if (kind === 'asset') {
    const a = state.assets.find(x => x.id === id); if (!a) return;
    const v = assetValue(a);
    head = `<div class="dt-head">${assetIcon(a)}<div class="grow"><h3>${esc(a.name || a.category)}</h3><small>${esc(a.category)}${a.updatedAt ? `・${a.updatedAt.slice(0, 10).replace(/-/g, '/')} 更新` : ''}</small></div><b class="dt-amt ${isCar(a) ? 'muted' : 'pos'}">${fmt(v)}</b></div>`;
    const rows = [];
    if (isRE(a)) {
      const cn = (COUNTIES.find(c => c.k === a.county) || {}).v || '';
      rows.push(['位置', esc([cn, a.district, a.road].filter(Boolean).join(' ') || '—')]);
      if (a.btype) rows.push(['建物型態', esc(a.btype)]);
      if (num(a.ping)) rows.push(['坪數', `${num(a.ping)} 坪${v && num(a.ping) ? `・每坪約 ${short(v / num(a.ping))}` : ''}`]);
      if (a.lvrAt) rows.push(['估價', `實價登錄估價（${a.lvrAt.slice(0, 10).replace(/-/g, '/')}）`]);
      const L = loansOn(a.id, S.st);
      if (L.list.length) {
        rows.push(['貸款', `${L.list.length} 筆・<span class="neg">${fmt(L.debt)}</span>`]);
        rows.push(['淨值', `<b class="${v - L.debt >= 0 ? 'pos' : 'neg'}">${fmt(v - L.debt)}</b>・成數 ${v ? Math.round(L.debt / v * 100) : '—'}%`]);
        rows.push(['每月要繳', fmt(L.monthly)]);
      }
    } else if (isCar(a)) {
      const b = brandOf(a.brand);
      if (a.brand) rows.push(['車款', esc(`${b ? b.zh : a.brand} ${a.model || ''}`)]);
      if (a.buyYear) rows.push(['購入', `${a.buyYear} 年${a.buyMonth ? ` ${a.buyMonth} 月` : ''}${num(a.buyPrice) ? `・${fmt(num(a.buyPrice))}` : ''}`]);
      rows.push(['估算殘值', `${fmt(v)}<small class="muted">（不計入總資產）</small>`]);
    } else {
      rows.push(['目前價值', fmt(v)]);
      if (S.totalAssets && countsAsAsset(a)) rows.push(['占總資產', `${(v / S.totalAssets * 100).toFixed(1)}%`]);
    }
    if (a.note) rows.push(['備註', esc(a.note)]);
    body = kvs(rows);
  } else {
    const d = state.debts.find(x => x.id === id); if (!d) return;
    const x = debtStatus(d) || {};
    const b = bankOf(d.bank), nd = nextDue(d), prop = propOf(d.collateral);
    head = `<div class="dt-head"><span class="stack">${UI.bankIcon(b)}</span><div class="grow"><h3>${esc(d.name)}</h3><small>${esc(d.type || '負債')}・${esc(b ? (b.code !== '—' ? b.code + ' ' : '') + shortBank(b) : '—')}</small></div><b class="dt-amt neg">${fmt(x.balance || 0)}</b></div>`;
    const rows = [
      [x.revolving ? '已動用' : '剩餘本金', fmt(x.balance || 0)],
      x.revolving ? ['額度', `${fmt(x.limit || 0)}・還可動用 ${fmt(Math.max(0, (x.limit || 0) - (x.balance || 0)))}`] : null,
      ['年利率', pct(x.rate ?? num(d.rate))],
      [x.revolving ? '每月利息' : '每月要繳', `<b>${fmt(x.monthly || 0)}</b>`],
      ['扣款日', nd ? `${dueTxt(d)}・下次 ${mdTxt(nd.date)}${nd.days === 0 ? '（今天）' : `（${nd.days} 天後）`}` : '<span class="muted">還沒填</span>'],
      d.mode === 'auto' && num(d.principal) ? ['撥款', `${d.startDate ? d.startDate.replace(/-/g, '/') : d.startYM ? d.startYM.replace('-', '/') : ''}・${fmt(num(d.principal))}・${num(d.years)} 年`] : null,
      x.inGrace ? ['寬限期', `剩 ${x.graceLeft} 個月，${String(x.graceEndYM || '').replace('-', '/')} 結束後月付 <b class="neg">${fmt(x.afterGracePay || 0)}</b>`] : null,
      isFinite(x.monthsLeft) ? ['還清', `${String(x.payoffYM || '').replace('-', '/')}（剩 ${x.monthsLeft} 期）`] : null,
      isFinite(x.interestLeft) && x.interestLeft ? ['剩餘利息', fmt(x.interestLeft)] : null,
      prop ? ['抵押', esc(prop.name)] : null,
    ];
    const paid = Plan.paidSoFar(d, state.plans);
    if (paid && paid.months) rows.push(['已經繳了', `利息 <span class="neg">${fmt(paid.interest)}</span>${paid.principal ? `・本金 ${fmt(paid.principal)}` : ''}`]);
    if (d.note) rows.push(['備註', esc(d.note)]);
    const chg = (d.changes || []).filter(c => CHG[c.type] && c.ym).sort((p, q) => String(p.ym).localeCompare(q.ym));
    body = kvs(rows) + (chg.length ? `<div class="dt-sub">貸款歷程</div><ul class="dt-tl">${chg.map(c => `<li><span>${String(c.ym).replace('-', '/')}</span><span>${esc(CHG[c.type].d(c))}</span></li>`).join('')}</ul>` : '')
      + (x.revolving ? (() => { const h = drawsHTML(d); return h ? `<div class="dt-sub">動用明細</div><ul class="list dt-draws">${h.replace('class="draws ', 'class="draws open ')}</ul>` : ''; })() : '');
  }
  detailCtx = { kind, id };
  $('dtBody').innerHTML = head + `<div class="dt-body">${body}</div>`;
  $('dtEdit').innerHTML = `${Icon.svg('pencil', 18)} ${editLabel}`;
  $('detailDialog').showModal();
}
$('dtClose').addEventListener('click', () => $('detailDialog').close());
$('dtEdit').addEventListener('click', () => { const c = detailCtx; $('detailDialog').close(); if (c) openEditor(c.kind, c.id); });
$('detailDialog').addEventListener('click', e => {
  if (e.target === $('detailDialog')) return $('detailDialog').close();
  const p = e.target.closest('[data-edit="plan"]');
  if (p) { $('detailDialog').close(); openEditor('plan', p.dataset.id); }
});

// --- 點擊：開啟、展開、分組 ---
document.addEventListener('click', e => {
  if (e.target.closest('dialog')) return;
  const add = e.target.closest('[data-add]');
  if (add && add.id === 'fab' && add.dataset.add === 'asset') return assetAddMenu();
  if (add && add.id === 'fab' && add.dataset.add === 'debt') return debtAddMenu();
  const vw = e.target.closest('[data-view-item]');
  if (vw) { const [k, id] = vw.dataset.viewItem.split('|'); return openDetail(k, id); }
  const dt = e.target.closest('[data-draws]');
  if (dt) { const k = 'draws:' + dt.dataset.draws; fold.has(k) ? fold.delete(k) : fold.add(k); dt.closest('.draws').classList.toggle('open', fold.has(k)); return; }
  if (add && add.dataset.add) return openEditor(add.dataset.add);
  const ed = e.target.closest('[data-edit]');
  if (ed) return openEditor(ed.dataset.edit, ed.dataset.id);
  const tr = e.target.closest('[data-trade]');
  if (tr) return openTrade(tr.dataset.id, tr.dataset.trade);
  const lt = e.target.closest('[data-lot]');
  if (lt) { const [aid, lid] = lt.dataset.lot.split('|'); return openTrade(aid, null, lid); }
  if (e.target.closest('li.stock .detail')) return;
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
  if (editing.kind === 'debt' && chgEdit) return toast('貸款歷程還有一筆變更沒按「確定」');
  if (editing.kind === 'asset' && isStock(vals) && !vals.sym) return toast('請選擇股票代號');
  if (editing.kind === 'asset' && isStock(vals)) return saveStock();
  const obj = {};
  for (const f of FIELDS[editing.kind]) {
    if (!f.k) continue;
    if (f.show && !f.show(vals)) continue;
    const v = vals[f.k];
    obj[f.k] = NUMERIC.has(f.k) ? (v === '' || v == null ? '' : num(v)) : String(v ?? '').trim();
  }
  if (vals.lvrAt && isRE(vals)) obj.lvrAt = vals.lvrAt;
  if (editing.kind === 'plan') {
    if (pickType(obj.ptype)) {
      const per0 = obj.pmode === 'monthly' ? num(obj.perMonth) : num(obj.total) / Math.max(1, Math.round(num(obj.months)));
      obj.stocks = (vals.stocks || []).filter(x => x.sym).map(x => x.ccy === 'USD' && x.amt !== '' && x.amt != null
        ? { mkt: x.mkt, sym: x.sym, ccy: 'USD', amt: Math.round(num(x.amt) * 100) / 100 }
        : { mkt: x.mkt, sym: x.sym, amt: Math.round(stockAmt(x, per0)) });
      if (obj.stocks.length) obj.targets = obj.stocks.map(x => `${x.sym} ${x.ccy === 'USD' ? 'US$' : ''}${x.amt}`).join('、');
    } else delete obj.stocks;
    if (obj.pmode === 'monthly') obj.total = Math.round(num(obj.perMonth) * Math.max(1, Math.round(num(obj.months))));
    else delete obj.perMonth;
    if (isNewLine(obj)) {
      if (!vals.nlBank) return toast('請選擇新額度的銀行');
      const id = uid();
      state.debts.push({ id, type: obj.source === '__newother' ? '其他' : '理財型房貸', name: obj.nlName || '理財型房貸額度', bank: vals.nlBank, mode: 'revolving', limit: num(obj.nlLimit) || num(obj.total), drawn: 0, rate: num(obj.nlRate), payDay: obj.day || '', note: `由投資計畫「${obj.name}」建立`, updatedAt: new Date().toISOString() });
      obj.source = id;
      toast('已在負債新增這筆額度');
    }
    ['nlName', 'nlBank', 'nlLimit', 'nlRate'].forEach(k => delete obj[k]);
    // 已經投入幾個月：起始月份往前推，前幾期直接算已投入
    const dm = Math.round(num(obj.doneMonths));
    delete obj.doneMonths;
    if (dm > 0) {
      const cur = Loan.nowYM();
      if (!obj.startYM || Loan.ymDiff(obj.startYM, cur) < dm) obj.startYM = Loan.ymAdd(cur, -dm);
      const am = Plan.amounts(obj);
      const prev = editing.id ? (state.plans.find(x => x.id === editing.id) || {}).done : null;
      obj.done = { ...(prev || {}) };
      for (let i = 0; i < Math.min(dm, am.length); i++) if (obj.done[i] == null) obj.done[i] = am[i];
    } else if (editing.id) {
      const prev = state.plans.find(x => x.id === editing.id) || {};
      if (prev.done) obj.done = prev.done;
      if (prev.custom) obj.custom = prev.custom;
    }
  }
  if (editing.kind === 'debt' && isAuto(vals)) {
    obj.changes = (vals.changes || []).filter(c => c.ym);
    if (obj.startDate) obj.startYM = obj.startDate.slice(0, 7);
  }
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
  balloon: { ic: 'warn', t: '到期，需一次還清本金' },
  rateChange: { ic: 'percent', t: '利率調整' },
};
const dateTxt = d => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
const daysTxt = n => n < 0 ? '已過' : n === 0 ? '今天' : n < 60 ? `還有 ${n} 天` : n < 730 ? `還有 ${n} 天（約 ${Math.round(n / 30)} 個月）` : `還有 ${n} 天（約 ${(n / 365).toFixed(1)} 年）`;
function eventRowHTML(e, i) {
  const k = 'ev:' + i, o = fold.has(k), info = EV_INFO[e.type];
  const soon = e.days <= 90 && (e.type === 'graceEnd' || e.type === 'balloon');
  return `<div class="fold sub ${o ? 'open' : ''}" data-f="${k}"><button type="button" class="ev-row ${soon ? 'soon' : ''}" data-fold="${k}"><span class="ev-dt"><b>${e.date.getFullYear() === new Date().getFullYear() ? `${e.date.getMonth() + 1}/${e.date.getDate()}` : `${e.date.getFullYear()}/${e.date.getMonth() + 1}`}</b><small>${e.days <= 0 ? '今天' : e.days < 60 ? `${e.days} 天後` : e.days < 730 ? `${Math.round(e.days / 30)} 個月後` : `${(e.days / 365).toFixed(1)} 年後`}</small></span>${Icon.svg(info.ic, 22)}<span class="grow"><b>${esc(e.debt.name)}</b> ${info.t}</span><i class="chev">›</i></button>
    <div class="fold-body">${eventHTML(e)}</div></div>`;
}
function eventHTML(e, compact) {
  const info = EV_INFO[e.type];
  const diff = e.to - e.from;
  const soon = e.days <= 90 && (e.type === 'graceEnd' || e.type === 'balloon');
  const change = e.type === 'lineEnd' ? '' : e.type === 'balloon'
    ? `當月要繳 <b class="neg">${fmt(e.to)}</b>（本金 ${fmt(e.amount)} ＋ 利息）`
    : e.type === 'payoff'
    ? `每月少繳 <b class="pos">${fmt(e.from)}</b>`
    : `${e.debt.mode === 'revolving' ? '每月利息' : '月付'} ${fmt(e.from)} → <b class="${diff > 0 ? 'neg' : 'pos'}">${fmt(e.to)}</b>（${diff > 0 ? '+' : ''}${fmt(diff)}）`;
  return `<div class="ev ${e.type} ${soon ? 'soon' : ''}">${Icon(info.ic)}
    <div class="grow"><div class="ev-title"><b>${esc(e.debt.name)}</b> ${info.t}</div>
    <div class="ev-date">${dateTxt(e.date)} · <span class="${soon ? 'neg' : ''}">${daysTxt(e.days)}</span></div>
    ${change ? `<div class="ev-change">${change}</div>` : ''}
    ${!compact && e.total != null && e.type !== 'lineEnd' ? `<div class="ev-total">當月起總月付約 <b>${fmt(e.total)}</b></div>` : ''}</div></div>`;
}

let repayH = 36, repaySel = 0, repayOpen = new Set(), yrIdx = 0, yrBase = 0;   // yrIdx：距今年幾年（負數 = 過去）
// 還款分頁可能還沒顯示（寬度 0），等版面出來再捲到目前年度
function yrSync(sc, tries = 0) {
  sc._sync = true;
  requestAnimationFrame(() => {
    if (!sc.isConnected) return;
    if (!sc.clientWidth && tries < 120) return setTimeout(() => yrSync(sc, tries + 1), 100);
    sc.scrollLeft = (yrBase + yrIdx) * sc.clientWidth;
    requestAnimationFrame(() => { sc._sync = false; });
  });
}
const yrLbl = () => { const l = $('yrLabel'); if (l) l.textContent = `${new Date().getFullYear() + yrIdx} 年`; const h = $('yrHome'); if (h) h.hidden = yrIdx === 0; };
function projection(h) { return Plan.project(state.debts, state.plans, h); }
// 過去每個月實際繳了多少（依撥款條件與貸款歷程回推），只算這個月以前
function pastPay() {
  const cur = Loan.nowYM(), by = {};
  for (const d of state.debts) {
    const r = Plan.paidSoFar(d, state.plans);
    if (!r) continue;
    for (const x of r.rows) {
      if (Loan.ymDiff(x.ym, cur) <= 0) continue;          // x.ym 不早於這個月就跳過
      const m = by[x.ym] || (by[x.ym] = { ym: x.ym, total: 0, items: {} });
      const pay = x.interest + x.principal;
      m.items[d.id] = { pay, principal: x.principal, interest: x.interest, past: true, revolving: d.mode === 'revolving' };
      m.total += pay;
    }
  }
  return by;
}
// 所有資料裡最早的月份（貸款開始、動用、投資計畫、訂閱開始），最多往回 40 年
function earliestYM() {
  const cur = Loan.nowYM(), c = [];
  for (const d of state.debts) { if (d.startYM) c.push(d.startYM); if (d.drawnYM) c.push(d.drawnYM); const r = Plan.paidSoFar(d, state.plans); if (r && r.since) c.push(r.since); }
  for (const p of state.plans) if (p.startYM) c.push(p.startYM);
  for (const b of state.bills) if (b.anchor) c.push(String(b.anchor).slice(0, 7));
  let e = cur;
  for (const ym of c) if (/^\d{4}-\d{2}$/.test(ym) && Loan.ymDiff(ym, e) > 0) e = ym;   // ym 比 e 早
  return Loan.ymDiff(e, cur) > 480 ? Loan.ymAdd(cur, -480) : e;
}

function renderHomeRepay() {
  const card = $('homeRepay');
  if (!state.debts.length) { card.hidden = true; return; }
  card.hidden = false;
  const P = projection(24);
  const m0 = P.months[0];
  const rows = state.debts.map(d => ({ d, it: m0.items[d.id], day: Loan.dueDay(d) })).filter(x => x.it && x.it.pay > 0).sort((a, b) => (a.day || 99) - (b.day || 99));
  const today = new Date(), td = today.getDate(), dim = Loan.daysIn(Loan.nowYM(today));
  const next = P.events.find(e => e.days >= 0 && e.type !== 'lineEnd');
  const spark = UI.sparkline(P.months.map(m => m.total), 300, 44, { color: '#14b8a6', sw: 2 });
  $('homeRepayBody').innerHTML = `
    <div class="hr-total"><span>本月應繳</span><b>${fmt(m0.total)}</b></div>
    ${rows.map(({ d, it, day }) => { const dd = day ? Math.min(day, dim) : 0, left = dd - td;
      const st = !dd ? '' : left < 0 || it.paid ? '<span class="chip gray">已扣款</span>' : left === 0 ? '<span class="chip red">今天扣款</span>' : left <= 3 ? `<span class="chip red">還有 ${left} 天</span>` : `<span class="chip">還有 ${left} 天</span>`;
      return `<div class="hr-row ${dd && left < 0 ? 'done' : ''}" ${dd ? '' : `data-edit="debt" data-id="${d.id}" title="點一下填撥款日期"`}><span class="hr-day">${dd ? `<b>${dd}</b><small>日</small>` : '<small class="neg">未填</small>'}</span><span class="dot" style="--c:${debtColor(d)}"></span><span class="grow">${esc(d.name)}
      ${it.grace ? '<span class="chip">寬限期</span>' : ''}${it.revolving ? '<span class="chip blue">只繳息</span>' : ''}${st}</span>
      <span>${fmt(it.pay)}</span></div>`; }).join('')}
    ${next ? `<div class="hr-next">${Icon(EV_INFO[next.type].ic)}<div><b>下一個變化</b>：${esc(next.debt.name)} ${EV_INFO[next.type].t}<br><small>${dateTxt(next.date)}（${daysTxt(next.days)}）· ${next.type === 'payoff' ? `每月少 ${fmt(next.from)}` : next.type === 'balloon' ? `當月要繳 ${fmt(next.to)}` : `月付 ${next.to - next.from >= 0 ? '+' : ''}${fmt(next.to - next.from)}`}</small></div></div>` : ''}
    <div class="hr-spark"><div class="small muted">未來 24 個月總月付</div>${spark}</div>`;
}

// ---------- 定期扣款（信用卡、訂閱）----------
const billFx = b => Stocks.fx(b.ccy || 'TWD', state.currency);
const billColor = b => Charts.PALETTE[(Math.max(0, state.bills.indexOf(b)) + 4) % Charts.PALETTE.length];
const cardColor = b => (bankOf(b.bank) || {}).c || 'var(--viz-other)';
const dKey = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const md2 = dt => `${dt.getMonth() + 1}/${dt.getDate()}`;
const cardOf = id => id && state.bills.find(c => c.id === id && isCardBill(c));
// 某個訂閱在 [from, to] 之間的扣款日
function chargesBetween(b, from, to) {
  if (!b.anchor) return [];
  const a = new Date(b.anchor + 'T00:00:00'), end = b.endDate ? new Date(b.endDate + 'T23:59:59') : null;
  const out = [];
  if (b.cycle === 'w') {
    let k = Math.max(0, Math.ceil((from - a) / (7 * 864e5)));
    for (let dt = new Date(a.getTime() + k * 7 * 864e5); dt <= to; dt = new Date(dt.getTime() + 7 * 864e5)) if (dt >= from && (!end || dt <= end)) out.push(dt);
    return out;
  }
  const n = +b.cycle || 1, aYM = dKey(a).slice(0, 7);
  for (let ym = dKey(from).slice(0, 7); Loan.ymDiff(ym, dKey(to).slice(0, 7)) >= 0; ym = Loan.ymAdd(ym, 1)) {
    const k = Loan.ymDiff(aYM, ym);
    if (k < 0 || k % n) continue;
    const dt = Loan.dueDate(ym, a.getDate());
    if (dt >= from && dt <= to && dt >= a && (!end || dt <= end)) out.push(dt);
  }
  return out;
}
// 一張卡某一期的金額：有填就用填的，沒填就加總刷這張卡的訂閱
function cardAmount(c, from, to) {
  if (+c.amount) return +c.amount * billFx(c);
  return state.bills.filter(b => isSub(b) && b.payWith === c.id).reduce((t, b) => t + chargesBetween(b, from, to).length * (+b.amount || 0) * billFx(b), 0);
}
// 某個月份的所有帳單事件
function billEvents(ym) {
  const out = [], dim = Loan.daysIn(ym);
  const [y, m] = ym.split('-').map(Number);
  for (const b of state.bills) {
    if (isCardBill(b)) {
      const cd = +b.closeDay, dd = +b.dueDay;
      if (!cd || !dd) continue;
      const cl = Loan.dueDate(ym, cd), pv = Loan.dueDate(Loan.ymAdd(ym, -1), cd);
      const dueYM = dd > cd ? ym : Loan.ymAdd(ym, 1);
      out.push({ day: cl.getDate(), kind: 'close', b, from: new Date(pv.getTime() + 864e5), to: cl, dueAt: Loan.dueDate(dueYM, dd) });
      const stYM = dd > cd ? ym : Loan.ymAdd(ym, -1);                // 這個月繳的是哪一期
      const sc = Loan.dueDate(stYM, cd), sp = Loan.dueDate(Loan.ymAdd(stYM, -1), cd);
      const from = new Date(sp.getTime() + 864e5);
      out.push({ day: Math.min(dd, dim), kind: 'due', b, from, to: sc, amount: cardAmount(b, from, sc) });
    } else {
      for (const dt of chargesBetween(b, new Date(y, m - 1, 1), new Date(y, m - 1, dim, 23, 59))) {
        out.push({ day: dt.getDate(), kind: 'charge', b, amount: (+b.amount || 0) * billFx(b), card: cardOf(b.payWith) });
      }
    }
  }
  return out;
}
const perMonth = b => isCardBill(b) ? 0 : (+b.amount || 0) * billFx(b) * (b.cycle === 'w' ? 52 / 12 : 1 / (+b.cycle || 1));

// 這個月的扣款日曆（貸款＋信用卡＋訂閱）
let calOff = 0, calSel = 0, calDir = 0;   // calOff 0 = 這個月，負數 = 過去、正數 = 未來；calSel = 選到的日期
const calMin = () => -Math.max(0, Loan.ymDiff(earliestYM(), Loan.nowYM()));
const CAL_MAX = 360;
function dueCalHTML(P) {
  calOff = Math.max(calMin(), Math.min(CAL_MAX, calOff));
  const ymC = Loan.ymAdd(Loan.nowYM(), calOff);
  const m = calOff >= 0 ? (P.months[calOff] || projection(calOff + 1).months[calOff]) : (pastPay()[ymC] || { ym: ymC, total: 0, items: {} });
  if (!m) return '';
  const today = new Date(), isCur = calOff === 0, isPast = calOff < 0, td = isPast ? 99 : today.getDate();
  const [y, mo] = m.ym.split('-').map(Number), dim = Loan.daysIn(m.ym), first = new Date(y, mo - 1, 1).getDay();
  // 統一成同一種項目
  const E = [];
  state.debts.forEach(d => { const it = m.items[d.id]; if (!it || it.pay <= 0) return; const day = Loan.dueDay(d);
    E.push({ day: day ? Math.min(day, dim) : 0, mark: 'loan', color: debtColor(d), name: d.name, sub: `${shortBank(bankOf(d.bank))}${it.grace ? '・寬限期' : ''}${it.revolving ? '・只繳息' : ''}`, amount: it.pay, count: 'loan', edit: ['debt', d.id] }); });
  billEvents(m.ym).forEach(e => {
    const b = e.b;
    if (e.kind === 'close') E.push({ day: e.day, mark: 'close', color: cardColor(b), name: `${b.name} 結帳`, sub: `本期消費 ${md2(e.from)}–${md2(e.to)}，${md2(e.dueAt)} 前繳`, amount: null, tag: '<span class="chip blue">結帳日</span>', edit: ['bill', b.id] });
    else if (e.kind === 'due') E.push({ day: e.day, mark: 'card', color: cardColor(b), name: `${b.name} 繳款`, sub: `消費 ${md2(e.from)}–${md2(e.to)}・${b.autopay === 'manual' ? '要自己繳' : '自動扣繳'}${+b.amount ? '' : e.amount ? '・訂閱加總' : ''}`, amount: e.amount || null, manual: b.autopay === 'manual', count: 'card', edit: ['bill', b.id] });
    else E.push({ day: e.day, mark: 'sub', color: billColor(b), name: b.name, sub: `${b.cat || '訂閱'}・${(BILL_CYCLES.find(c => c.v === (b.cycle || '1')) || {}).label}${e.card ? `・刷 ${e.card.name}（併入卡費）` : b.payWith === 'other' ? '・現金／轉帳' : '・帳戶扣款'}${(b.ccy || 'TWD') !== state.currency ? `・${b.ccy} ${(+b.amount).toLocaleString()}` : ''}`, amount: e.amount, onCard: !!e.card, count: e.card ? '' : 'sub', edit: ['bill', b.id] });
  });
  const byDay = {};
  E.forEach(x => { if (x.day) (byDay[x.day] = byDay[x.day] || []).push(x); });
  let cells = '';
  for (let i = 0; i < first; i++) cells += '<span class="cd empty"></span>';
  for (let dday = 1; dday <= dim; dday++) {
    const xs = byDay[dday] || [], past = isPast || (isCur && dday < td), now = isCur && dday === td;
    // 貸款：整格上色（多筆就分色）；卡費、訂閱、結帳：維持小記號
    const lc = [...new Set(xs.filter(x => x.mark === 'loan').map(x => x.color))];
    const small = xs.filter(x => x.mark !== 'loan');
    const bg = !lc.length ? '' : lc.length === 1 ? lc[0] : `linear-gradient(135deg, ${lc.map((c, i) => `${c} ${(i / lc.length * 100).toFixed(0)}% ${((i + 1) / lc.length * 100).toFixed(0)}%`).join(', ')})`;
    cells += `<button type="button" class="cd${xs.length ? ' has' : ''}${lc.length ? ' loan' : ''}${past ? ' past' : ''}${now ? ' today' : ''}${calSel === dday ? ' sel' : ''}" data-cday="${dday}"${bg ? ` style="--lbg:${bg}"` : ''}><b>${dday}</b>${small.length ? `<i>${small.slice(0, 4).map(x => `<span class="mk-${x.mark}" style="--c:${x.color}"></span>`).join('')}${small.length > 4 ? '<em>+</em>' : ''}</i>` : ''}</button>`;
  }
  const shown = E.filter(x => calSel && x.day === calSel).slice().sort((a, b) => (a.day || 99) - (b.day || 99) || (a.mark === 'close') - (b.mark === 'close'));
  const rows = shown.map(x => {
    const dd = x.day, dt = dd ? new Date(y, mo - 1, dd) : null, left = (isCur || isPast) && dd ? dd - td : null;
    const st = x.tag || (!dd ? '<span class="chip gray">沒填扣款日</span>' : isPast ? '<span class="chip gray">已繳費</span>' : isCur ? (left < 0 ? '<span class="chip gray">已扣款</span>' : left === 0 ? '<span class="chip red">今天</span>' : `<span class="chip${left <= 3 ? ' red' : ''}">還有 ${left} 天</span>`) : '');
    return `<div class="due-row ${(isPast || isCur) && dd && left < 0 ? 'done' : ''} ${x.onCard ? 'oncard' : ''}" data-edit="${x.edit[0]}" data-id="${x.edit[1]}"><span class="due-d">${dt ? `<b>${dd}</b><small>週${WD[dt.getDay()]}</small>` : '<small>—</small>'}</span><span class="mk mk-${x.mark}" style="--c:${x.color}"></span><span class="grow">${esc(x.name)}${x.manual ? ' <span class="chip red">自己繳</span>' : ''}<small>${esc(x.sub)}</small></span><span class="due-amt">${x.amount != null ? fmt(x.amount) : ''}${st}</span></div>`;
  }).join('') || (calSel ? '<div class="empty small">這天沒有扣款</div>' : '<div class="cal-hint">點月曆上的日期，看那天要繳什麼</div>');
  const cnt = x => x.count && (isPast || !isCur || !x.day || x.day >= td);
  const sum = k => E.filter(x => x.count === k && cnt(x)).reduce((t, x) => t + (x.amount || 0), 0);
  const L = sum('loan'), C = sum('card'), Sb = sum('sub');
  return `<div class="card due-card">
    <div class="due-head"><h2>${Icon.svg('calendar', 24)} ${y !== today.getFullYear() ? `${y} 年 ` : ''}${mo} 月扣款日</h2><div class="yr-nav"><button type="button" class="yr-btn" data-calgo="-1" aria-label="上個月" ${calOff <= calMin() ? 'disabled' : ''}>‹</button>${calOff !== 0 ? '<button type="button" class="chip-btn on" data-cal="0">回這個月</button>' : ''}<button type="button" class="yr-btn" data-calgo="1" aria-label="下個月" ${calOff >= CAL_MAX ? 'disabled' : ''}>›</button></div></div>
    <div class="due-sum"><span>${isPast ? '這個月繳了' : isCur ? '這個月還要繳' : `${mo} 月要繳`}${isPast ? ' <span class="chip gray">已繳費</span>' : ''}</span><b class="${isPast ? 'muted' : ''}">${fmt(L + C + Sb)}</b></div>
    <div class="due-split"><span><i class="mk mk-loanday" style="--c:var(--viz-1)"></i>貸款 ${fmt(L)}</span><span><i class="mk mk-card" style="--c:var(--viz-2)"></i>卡費 ${fmt(C)}</span><span><i class="mk mk-sub" style="--c:var(--viz-5)"></i>訂閱 ${fmt(Sb)}</span><span><i class="mk mk-close" style="--c:var(--viz-2)"></i>卡片結帳日</span></div>
    <div class="cal${calDir ? (calDir > 0 ? ' slide-l' : ' slide-r') : ''}${isPast ? ' is-past' : ''}" id="dueCal"><span class="cw">日</span><span class="cw">一</span><span class="cw">二</span><span class="cw">三</span><span class="cw">四</span><span class="cw">五</span><span class="cw">六</span>${cells}</div>
    ${calSel ? `<div class="due-filter">${mo}/${calSel}（週${WD[new Date(y, mo - 1, calSel).getDay()]}）<button type="button" class="link-btn" data-cday="0">收起</button></div>` : ''}
    <div class="due-list">${rows}</div>
  </div>`;
}
// 收合狀態（點了才展開）
const fold = new Set();
document.addEventListener('click', e => {
  const f = e.target.closest('[data-fold]');
  if (!f || e.target.closest('[data-edit], [data-add], a')) return;
  const k = f.dataset.fold;
  fold.has(k) ? fold.delete(k) : fold.add(k);
  const box = f.closest('.fold');
  if (box && box.dataset.f === k) box.classList.toggle('open', fold.has(k)); else renderRepay();
});
const foldHead = (k, icon, title, sub, right, extra = '') => `<button type="button" class="fold-head" data-fold="${k}">${icon}<span class="grow"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${right ? `<span class="fold-r">${right}</span>` : ''}${extra}<i class="chev">›</i></button>`;
function billsCardHTML() {
  const subs = state.bills.filter(isSub);
  const live = subs.filter(b => !b.endDate || new Date(b.endDate) >= new Date());
  const mon = live.reduce((t, b) => t + perMonth(b), 0);
  const subRow = b => { const n = chargesBetween(b, new Date(), new Date(Date.now() + 400 * 864e5))[0];
    return `<div class="bill-row" data-edit="bill" data-id="${b.id}"><span class="mk mk-sub" style="--c:${billColor(b)}"></span>${Icon((BILL_CATS.find(c => c.v === b.cat) || {}).ic || 'other')}<span class="grow">${esc(b.name)}<small>${(BILL_CYCLES.find(c => c.v === (b.cycle || '1')) || {}).label}${n ? `・下次 ${mdTxt(n)}` : b.endDate ? '・已結束' : ''}${cardOf(b.payWith) ? `・刷 ${esc(cardOf(b.payWith).name)}` : ''}</small></span><span class="due-amt">${(b.ccy || 'TWD') === state.currency ? fmt(+b.amount || 0) : `${b.ccy} ${(+b.amount || 0).toLocaleString()}<small class="muted">≈ ${fmt((+b.amount || 0) * billFx(b))}</small>`}</span></div>`; };
  const open = fold.has('bills');
  return `<div class="card fold bills-card ${open ? 'open' : ''}" data-f="bills">
    ${foldHead('bills', Icon('repay'), '訂閱與定期扣款', subs.length ? `${live.length} 項・每月約 ${fmt(mon)}・一年約 ${fmt(mon * 12)}` : '還沒有加入', '')}
    <div class="fold-body">
      ${subs.length ? subs.map(subRow).join('') : `<div class="hint-row">${Icon('calendar')}<span>加入 Netflix、Claude、電信費、房租這類定期扣款，會一起出現在上面的月曆</span></div>`}
      <p class="small muted fold-note">只顯示在扣款月曆，不會算進資產或負債。信用卡的結帳日和繳款日也在月曆上，點那一天的項目就能修改。</p>
    </div>
  </div>`;
}
// 貸款：一筆一列，點了才展開細項
function loansCardHTML(P) {
  const m0 = P.months[0];
  const list = state.debts.map(d => ({ d, s: debtStatus(d), it: m0.items[d.id] })).filter(x => x.s);
  const total = list.reduce((t, x) => t + (x.it ? x.it.pay : 0), 0);
  const open = fold.has('loans');
  const row = ({ d, s: x, it }) => {
    const k = 'loan:' + d.id, o = fold.has(k), nd = nextDue(d);
    const det = [
      ['剩餘本金', fmt(x.balance)],
      ['年利率', pct(x.rate ?? num(d.rate))],
      ['扣款日', nd ? `${dueTxt(d)}・下次 ${mdTxt(nd.date)}${nd.days === 0 ? '（今天）' : `（${nd.days} 天後）`}` : '<span class="muted">還沒填</span>'],
      x.inGrace ? ['寬限期', `剩 ${x.graceLeft} 個月，${x.graceEndYM} 結束後月付 <b class="neg">${fmt(x.afterGracePay)}</b>`] : null,
      x.revolving ? ['額度', `已動用 ${short(x.balance)} / ${short(x.limit)}`] : null,
      isFinite(x.monthsLeft) ? ['還清', `${x.payoffYM}（剩 ${x.monthsLeft} 期）`] : x.revolving ? null : ['還清', '<span class="neg">月付不足以還清</span>'],
      isFinite(x.interestLeft) ? ['剩餘利息', fmt(x.interestLeft)] : null,
    ].filter(Boolean);
    return `<div class="fold sub ${o ? 'open' : ''}" data-f="${k}">
      <button type="button" class="loan-row" data-fold="${k}"><span class="mk mk-loan" style="--c:${debtColor(d)}"></span><span class="grow">${esc(d.name)}${x.inGrace ? ' <span class="chip">寬限期</span>' : ''}${x.revolving ? ' <span class="chip blue">只繳息</span>' : ''}<small>${esc(shortBank(bankOf(d.bank)))}${dueTxt(d) ? `・${dueTxt(d)}` : ''}</small></span><span class="due-amt">${fmt(it ? it.pay : 0)}<small class="muted">每月</small></span><i class="chev">›</i></button>
      <div class="fold-body">${det.map(([a, b]) => `<div class="kv"><span>${a}</span><span>${b}</span></div>`).join('')}<button type="button" class="btn mini" data-edit="debt" data-id="${d.id}">${Icon.svg('pencil', 16)} 編輯這筆</button></div>
    </div>`;
  };
  return `<div class="card fold loans-card ${open ? 'open' : ''}" data-f="loans">
    ${foldHead('loans', Icon('mortgage'), '貸款', `${list.length} 筆・這個月 ${fmt(total)}`, '')}
    <div class="fold-body">${list.map(row).join('')}</div>
  </div>`;
}
document.addEventListener('click', e => { const c = e.target.closest('[data-cday]'); if (c && c.closest('#view-repay') && Date.now() - calSwiped > 400) { const d = +c.dataset.cday; calSel = calSel === d ? 0 : d; renderRepay(); } });
function calGo(n, abs) {
  const to = Math.max(calMin(), Math.min(CAL_MAX, abs ? n : calOff + n));
  if (to === calOff) return;
  calDir = Math.sign(to - calOff); calOff = to; calSel = 0;
  const y = window.scrollY; renderRepay(); window.scrollTo(0, y); calDir = 0;
}
document.addEventListener('click', e => {
  const c = e.target.closest('[data-cal]'); if (c) { calGo(+c.dataset.cal, true); return; }
  const g = e.target.closest('[data-calgo]'); if (g) calGo(+g.dataset.calgo);
});
// 月曆左右滑：往左滑看下個月、往右滑看上個月
{
  let sx = 0, sy = 0, on = false;
  document.addEventListener('touchstart', e => { const c = e.target.closest('#dueCal'); on = !!c; if (on) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!on) return; on = false;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) { calSwiped = Date.now(); calGo(dx < 0 ? 1 : -1); }
  }, { passive: true });
}
let calSwiped = 0;

// 已經繳出去的錢
let paidOpen = false;
function paidCardHTML() {
  const list = state.debts.map(d => ({ d, p: Plan.paidSoFar(d, state.plans) }));
  const ok = list.filter(x => x.p && x.p.months);
  const skipped = list.filter(x => !x.p).map(x => x.d.name);
  if (!ok.length) return skipped.length ? `<div class="card paid-card"><h2>${Icon.svg('coin', 24)} 已經繳出去的錢</h2><p class="small muted">手動輸入的貸款沒有撥款條件，無法回推已繳金額；改用「自動試算」並填入撥款條件就看得到。</p></div>` : '';
  const I = ok.reduce((t, x) => t + x.p.interest, 0), Pp = ok.reduce((t, x) => t + x.p.principal, 0), T = I + Pp;
  const y = String(new Date().getFullYear());
  const yi = ok.reduce((t, x) => t + (x.p.byYear[y]?.i || 0), 0), yp = ok.reduce((t, x) => t + (x.p.byYear[y]?.p || 0), 0);
  const years = {};
  ok.forEach(x => Object.entries(x.p.byYear).forEach(([k, v]) => { (years[k] = years[k] || { i: 0, p: 0 }); years[k].i += v.i; years[k].p += v.p; }));
  const ys = Object.keys(years).sort();
  const maxY = Math.max(1, ...ys.map(k => years[k].i + years[k].p));
  const since = ok.map(x => x.p.since).sort()[0];
  const ip = T ? I / T * 100 : 0;
  return `<div class="card paid-card">
    <h2>${Icon.svg('coin', 24)} 已經繳出去的錢</h2>
    <div class="paid-total"><small>從 ${since.replace('-', '/')} 到現在，貸款一共繳了</small><b>${fmt(T)}</b></div>
    <div class="paid-bar"><span class="pi" style="width:${ip.toFixed(1)}%"></span><span class="pp" style="width:${(100 - ip).toFixed(1)}%"></span></div>
    <div class="paid-legend">
      <div><span class="dot" style="--c:#ff7a59"></span>利息 <b class="neg">${fmt(I)}</b><small>付給銀行的成本，不會回來</small></div>
      <div><span class="dot" style="--c:#2fbf71"></span>本金 <b class="pos">${fmt(Pp)}</b><small>還掉的債，變成你的淨資產</small></div>
    </div>
    <div class="kv paid-year"><span>${y} 年至今</span><span>利息 <b class="neg">${fmt(yi)}</b>・本金 ${fmt(yp)}</span></div>
    <button type="button" class="link-btn" id="paidMore">${paidOpen ? '收起' : '看每筆貸款與每年明細'} ›</button>
    ${paidOpen ? `<div class="paid-detail">
      ${ok.map(x => `<div class="kv"><span><span class="dot" style="--c:${debtColor(x.d)}"></span>${esc(x.d.name)}<small class="muted"> ${x.p.since.replace('-', '/')} 起${x.p.estimated ? '・估算' : ''}</small></span><span>利息 <span class="neg">${fmt(x.p.interest)}</span>${x.p.principal ? `<br><small>本金 ${fmt(x.p.principal)}</small>` : ''}</span></div>`).join('')}
      <div class="paid-years">${ys.map(k => { const v = years[k]; return `<div class="py"><span>${k}</span><div class="py-bar"><span class="pi" style="width:${(v.i / maxY * 100).toFixed(1)}%"></span><span class="pp" style="width:${(v.p / maxY * 100).toFixed(1)}%"></span></div><small>${short(v.i)} / ${short(v.p)}</small></div>`; }).join('')}</div>
      <div class="small muted">每年：利息 / 本金。依撥款條件與貸款歷程推算，實際金額以銀行對帳單為準${ok.some(x => x.p.partial) ? '；理財型額度有「已動用金額」沒填開始月份的部分沒算進去' : ''}${skipped.length ? `；${skipped.map(esc).join('、')} 是手動輸入，無法回推` : ''}。</div>
    </div>` : ''}
  </div>`;
}
document.addEventListener('click', e => { if (e.target.closest('#paidMore')) { paidOpen = !paidOpen; renderRepay(); } });

function renderRepay() {
  const el = $('repayBody');
  if (!state.debts.length) {
    el.innerHTML = (state.bills.length ? dueCalHTML(projection(2)) : '') + billsCardHTML() + `<div class="card empty big-empty">${Icon('repay', 'ico-xl')}<p>到「負債」新增貸款，這裡就會推算你未來每個月要繳多少</p></div>`;
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
  const repaySelHTML = sel => `<div class="sel-head"><b>${sel.ym.replace('-', '/')}</b><b>${fmt(sel.total)}</b></div>
        ${series.map(s => ({ s, it: sel.items[s.id] })).filter(x => x.it && x.it.pay > 0).map(({ s, it }) => `<div class="kv"><span>${Loan.dueDay(s.d) ? `<span class="dday">${Math.min(Loan.dueDay(s.d), Loan.daysIn(sel.ym))} 日</span>` : ''}<span class="dot" style="--c:${s.color}"></span>${esc(s.d.name)}${it.grace ? ' · 寬限期' : ''}${it.revolving ? ' · 只繳息' : ''}</span><span>${fmt(it.pay)}</span></div>`).join('') || '<div class="muted small">這個月沒有要繳的</div>'}
        <div class="small muted">手指在圖上左右滑，看每個月的明細</div>`;
  scrubData.repay = { pts: months, tip: m => [m.ym.replace('-', '/'), fmt(m.total)], on: k => { repaySel = k; const b = $('repaySelBox'); if (b) b.innerHTML = repaySelHTML(months[k]); } };
  const tableRows = months.map((m, k) => {
    const prev = k ? months[k - 1].total : m.total, diff = m.total - prev;
    const evs = P.events.filter(e => e.ym === m.ym && e.type !== 'lineEnd');
    const open = repayOpen.has(m.ym);
    return `<li class="mrow ${evs.length ? 'has-ev' : ''} ${open ? 'open' : ''}" data-ym="${m.ym}">
      <div class="mrow-head"><span class="mym">${m.ym.replace('-', '/')}</span>
        <span class="grow">${evs.map(e => `<span class="chip ${e.type === 'graceEnd' || e.type === 'balloon' ? 'red' : e.type === 'payoff' ? 'green' : 'blue'}">${esc(e.debt.name)}${e.type === 'graceEnd' ? '寬限期結束' : e.type === 'graceStart' ? '寬限期開始' : e.type === 'payoff' ? '還清' : e.type === 'balloon' ? '到期還本' : e.type === 'rateChange' ? '利率調整' : '投入完成'}</span>`).join('')}</span>
        <span class="mtot">${fmt(m.total)}${k && Math.abs(diff) >= 1 ? `<small class="${diff > 0 ? 'neg' : 'pos'}">${diff > 0 ? '▲' : '▼'}${fmt(Math.abs(diff))}</small>` : ''}</span></div>
      <div class="mrow-detail">${series.map(s => { const it = m.items[s.id]; if (!it || it.pay <= 0) return ''; const dd = Loan.dueDay(s.d); return `<div class="kv"><span>${dd ? `<span class="dday">${Math.min(dd, Loan.daysIn(m.ym))} 日</span>` : ''}<span class="dot" style="--c:${s.color}"></span>${esc(s.d.name)}${it.grace ? ' · 寬限期' : ''}${it.revolving ? ' · 只繳息' : ''}</span><span>${fmt(it.pay)}<small class="muted"> 本 ${fmt(it.principal)} / 息 ${fmt(it.interest)}</small></span></div>`; }).join('')}</div></li>`;
  }).join('');
  // 貸款逐月明細：一年一頁，左右滑 30 年
  const PY = projection(360);
  const y0 = new Date().getFullYear(), curM = new Date().getMonth();
  const PAST = pastPay(), yStart = Math.min(y0, +earliestYM().slice(0, 4)), base = y0 - yStart;
  yrIdx = Math.max(-base, Math.min(29, yrIdx));
  const pastRow = (m, mi) => `<li class="mrow paid ${repayOpen.has(m.ym) ? 'open' : ''}" data-ym="${m.ym}">
      <div class="mrow-head"><span class="mym">${mi + 1} 月</span><span class="grow"><span class="chip gray">已繳費</span></span><span class="mtot">${fmt(m.total)}</span></div>
      <div class="mrow-detail">${series.map(s => { const it = m.items[s.id]; if (!it || it.pay <= 0) return ''; const dd = Loan.dueDay(s.d); return `<div class="kv"><span>${dd ? `<span class="dday">${Math.min(dd, Loan.daysIn(m.ym))} 日</span>` : ''}<span class="dot" style="--c:${s.color}"></span>${esc(s.d.name)}${it.revolving ? ' · 只繳息' : ''}</span><span>${fmt(it.pay)}<small class="muted"> 本 ${fmt(it.principal)} / 息 ${fmt(it.interest)}</small></span></div>`; }).join('')}<div class="small muted">依撥款條件與貸款歷程回推，實際以銀行對帳單為準</div></div></li>`;
  const yearsHTML = Array.from({ length: base + 30 }, (_, yj) => {
    const yi = yj - base, yr = y0 + yi;
    let yt = 0, yp = 0;
    const rowsY = Array.from({ length: 12 }, (_, mi) => {
      const k = yi * 12 + mi - curM;
      if (k < 0) {
        const ym = `${yr}-${String(mi + 1).padStart(2, '0')}`, pm = PAST[ym];
        if (pm && pm.total > 0) { yp += pm.total; return pastRow(pm, mi); }
        return `<li class="mrow past"><div class="mrow-head"><span class="mym">${mi + 1} 月</span><span class="grow"></span><span class="mtot muted">沒有繳款</span></div></li>`;
      }
      const m = PY.months[k];
      if (!m) return '';
      yt += m.total;
      const prev = k ? PY.months[k - 1].total : m.total, diff = m.total - prev;
      const evs = PY.events.filter(e => e.ym === m.ym && e.type !== 'lineEnd');
      const open = repayOpen.has(m.ym);
      return `<li class="mrow ${evs.length ? 'has-ev' : ''} ${open ? 'open' : ''}" data-ym="${m.ym}">
      <div class="mrow-head"><span class="mym">${mi + 1} 月</span>
        <span class="grow">${evs.map(e => `<span class="chip ${e.type === 'graceEnd' || e.type === 'balloon' ? 'red' : e.type === 'payoff' ? 'green' : 'blue'}">${esc(e.debt.name)}${e.type === 'graceEnd' ? '寬限期結束' : e.type === 'graceStart' ? '寬限期開始' : e.type === 'payoff' ? '還清' : e.type === 'balloon' ? '到期還本' : e.type === 'rateChange' ? '利率調整' : '投入完成'}</span>`).join('')}</span>
        <span class="mtot">${fmt(m.total)}${k && Math.abs(diff) >= 1 ? `<small class="${diff > 0 ? 'neg' : 'pos'}">${diff > 0 ? '▲' : '▼'}${fmt(Math.abs(diff))}</small>` : ''}</span></div>
      <div class="mrow-detail">${series.map(s => { const it = m.items[s.id]; if (!it || it.pay <= 0) return ''; const dd = Loan.dueDay(s.d); return `<div class="kv"><span>${dd ? `<span class="dday">${Math.min(dd, Loan.daysIn(m.ym))} 日</span>` : ''}<span class="dot" style="--c:${s.color}"></span>${esc(s.d.name)}${it.grace ? ' · 寬限期' : ''}${it.revolving ? ' · 只繳息' : ''}</span><span>${fmt(it.pay)}<small class="muted"> 本 ${fmt(it.principal)} / 息 ${fmt(it.interest)}</small></span></div>`; }).join('') || '<div class="muted small">這個月沒有要繳的</div>'}</div></li>`;
    }).join('');
    const head = yi < 0 ? `全年已繳 <b class="muted">${fmt(yp)}</b>` : yi === 0 ? `全年 <b>${fmt(yt + yp)}</b><small class="muted">已繳 ${fmt(yp)}・還要繳 ${fmt(yt)}</small>` : `全年 <b>${fmt(yt)}</b>`;
    return `<section class="yr ${yi < 0 ? 'yr-past' : ''}" data-yr="${yr}"><div class="yr-head"><b>${yr} 年</b><span>${head}</span></div><ul class="mlist">${rowsY}</ul></section>`;
  }).join('');
  el.innerHTML = `
    <div class="card repay-sum">
      <div class="rs"><span>本月應繳</span><b>${fmt(P.months[0].total)}</b></div>
      <div class="rs"><span>下個月</span><b>${fmt(P.months[1]?.total || 0)}</b></div>
      <div class="rs"><span>未來 12 個月合計</span><b>${fmt(next12)}</b></div>
      <div class="rs"><span>期間最高月付</span><b class="neg">${fmt(peak.total)}</b><small>${peak.ym.replace('-', '/')} 起</small></div>
    </div>
    ${dueCalHTML(P)}
    ${loansCardHTML(P)}
    ${billsCardHTML()}
    ${paidCardHTML()}
    <div class="card">
      <h2>${Icon.svg('warn', 24)} 重要時間點</h2>
      ${evAll.length ? `<div class="ev-list">${evAll.map(eventRowHTML).join('')}</div>` : '<div class="empty">沒有即將發生的變化</div>'}
    </div>
    <div class="card">
      <h2>${Icon.svg('chart', 24)} 未來每月要繳多少</h2>
      <div class="chips">${[[12, '1 年'], [36, '3 年'], [60, '5 年'], [120, '10 年'], [0, '全部']].map(([v, t]) => `<button type="button" class="chip-btn ${repayH === v ? 'on' : ''}" data-h="${v}">${t}</button>`).join('')}</div>
      <div class="chart-wrap" id="repayChart">${Charts.stacked(months, series, { selected: repaySel, markers, sid: 'repay' })}</div>
      <div class="legend">${series.map(s => `<span><span class="dot" style="--c:${s.color}"></span>${esc(s.d.name)}</span>`).join('')}<span><span class="tri"></span>寬限期結束</span></div>
      <div class="sel-box" id="repaySelBox">${repaySelHTML(sel)}</div>
    </div>
    <div class="card yr-card">
      <div class="due-head"><h2>${Icon.svg('calendar', 24)} 貸款逐月明細</h2><div class="yr-nav"><button type="button" class="yr-btn" data-yrgo="-1" aria-label="上一年">‹</button><span id="yrLabel">${y0 + yrIdx} 年</span><button type="button" class="yr-btn" data-yrgo="1" aria-label="下一年">›</button></div></div>
      <div class="yr-sub"><span class="small muted">左右滑動看其他年度（${yStart}～${y0 + 29}），點月份看每筆明細</span><button type="button" class="chip-btn on" id="yrHome" ${yrIdx === 0 ? 'hidden' : ''}>回今年</button></div>
      <div class="yr-scroll" id="yrScroll">${yearsHTML}</div>
    </div>`;
  const sc = $('yrScroll');
  yrBase = base;
  yrSync(sc);
  sc.addEventListener('scroll', () => { if (sc._sync) return; const i = Math.round(sc.scrollLeft / Math.max(1, sc.clientWidth)) - base; if (i !== yrIdx) { yrIdx = i; yrLbl(); } }, { passive: true });
}

document.addEventListener('click', e => {
  const h = e.target.closest('[data-h]');
  if (h && h.closest('#view-repay')) { repayH = +h.dataset.h; repaySel = 0; renderRepay(); return; }
  const yg = e.target.closest('[data-yrgo]');
  const yh = e.target.closest('#yrHome');
  if (yg || yh) { const sc = $('yrScroll'); yrIdx = yh ? 0 : Math.max(-yrBase, Math.min(29, yrIdx + +yg.dataset.yrgo)); sc.scrollTo({ left: (yrBase + yrIdx) * sc.clientWidth, behavior: 'smooth' }); yrLbl(); return; }
  const mr = e.target.closest('.mrow:not(.past)');
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
      <p class="muted">例如把一筆額度分 12 個月投入：新增計畫、資金來源選那筆理財型房貸，就會自動算出每月投入、利息怎麼遞增，還款計畫也會跟著更新。</p>
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
          ${p.pmode === 'monthly' ? `<div class="kv"><span>每月投入</span><span>${fmt(num(p.perMonth) || pr.total / pr.n)}</span></div><div class="kv"><span>預計總額</span><span>${fmt(pr.total)}</span></div>` : `<div class="kv"><span>總額</span><span>${fmt(pr.total)}</span></div>`}
          <div class="kv"><span>進度</span><span>第 ${Math.min(pr.current, pr.n)} / ${pr.n} 期</span></div>
          ${nowRow ? `<div class="kv"><span>本月要投入</span><b>${fmt(nowRow.amt)}</b></div>` : nextRow ? `<div class="kv"><span>下次投入</span><span>${nextRow.ym.replace('-', '/')} · ${fmt(nextRow.amt)}</span></div>` : '<div class="kv"><span>狀態</span><b class="pos">全部投入完成</b></div>'}
        </div></div>
      ${assumed ? `<div class="hint-row warn-row">${Icon('warn')}<span>有 ${assumed} 期已過但還沒確認，負債先當作照計畫動用${pickType(p.ptype) ? '；股票要確認後才會加進持股' : ''}。點下面那期就能填實際${p.ptype === '股票' ? '股數、成交價' : '金額'}。</span></div>` : ''}
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
      ${pickType(p.ptype) && (p.stocks || []).length ? `<div class="plan-stocks">${p.stocks.map(x => { const q = Stocks.quote(x.mkt, x.sym); const amt = stockAmt(x, planPer(p)); const k = q ? Stocks.fx(q.ccy, state.currency) : 1;
        return `<div class="pst">${x.mkt === 'fund' ? Icon('fund') : `<span class="ticker small">${esc(x.sym)}</span>`}<span class="grow">${esc(q ? q.name : x.sym)}<small>${q ? `${q.fund ? '淨值' : '收盤'} ${price(q.price, q.ccy)}・<span class="chg ${q.chg > 0 ? 'up' : q.chg < 0 ? 'down' : ''}">${q.chg >= 0 ? '+' : ''}${q.chgPct.toFixed(2)}%</span>` : '找不到報價'}</small></span>${q ? UI.sparkline(q.series, 70, 24, { tw: x.mkt !== 'us' }) : ''}${amt && q ? `<span class="pst-r">${x.ccy === 'USD' ? `US$${(+x.amt).toLocaleString()}<small>≈ ${fmt(amt)}</small><small>` : `${fmt(amt)}<small>`}≈ ${(amt / (q.price * k)).toFixed(x.mkt === 'tw' ? 0 : 2)} ${unitOf(x.mkt)}</small></span>` : ''}</div>`; }).join('')}</div>` : targets.length ? `<div class="targets"><div class="small muted">每期分配（以每期 ${fmt(pr.amounts[0])} 計）</div>${targets.map(t => `<span class="chip blue">${esc(t.name)} ${t.pct}% · ${short(pr.amounts[0] * t.pct / 100)}</span>`).join('')}</div>` : p.targets ? `<div class="small muted">標的：${esc(p.targets)}</div>` : ''}
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
  periodCtx = { p, i, manual: false };
  $('pdTitle').innerHTML = `${Icon('invest')} 第 ${i + 1} 期 · ${Loan.ymAdd(p.startYM, i).replace('-', '/')}`;
  $('pdAmount').value = Math.round(done ? p.done[i] : planned);
  $('pdPlanned').textContent = `計畫金額 ${fmt(planned)}${state.debts.some(d => d.id === p.source) ? '・確認後的金額就是這期理財型房貸實際動用的金額' : ''}`;
  drawPdStocks(p, i, planned);
  $('pdUndo').hidden = !done;
  $('periodDialog').showModal();
});
// 股票計畫：每期依標的填實際成交股數與價格，確認後同步寫進股票持股（之後還能再改）
const lotSrc = (p, i, sym) => `plan:${p.id}:${i}:${sym}`;
// 計畫的股票標的（舊計畫的「0050 50%、VOO 50%」文字也算）
function planStocksOf(p) {
  if (pickType(p.ptype) && (p.stocks || []).some(x => x.sym)) return p.stocks.filter(x => x.sym);
  if (!p.ptype || p.ptype === '股票') {
    const ts = parseTargets(p.targets);
    if (ts.length) return ts.map(t => { const sym = t.name.toUpperCase(); return { mkt: /^\d/.test(sym) ? 'tw' : 'us', sym, pct: t.pct }; });
  }
  return [];
}
// 某一天的收盤價（30 個交易日內用當天收盤，更早的先用現價估）
function estPrice(mkt, sym, dt) {
  const q = Stocks.quote(mkt, sym); if (!q) return null;
  if (q.series && q.series.length > 1 && q.date) {
    const ds = q.dates || prevTradingDays(q.date, q.series.length);
    let idx = -1; ds.forEach((d, k) => { if (d <= dt) idx = k; });
    if (idx >= 0) return q.series[idx];
  }
  return q.price;
}
// 已經過去但還沒確認的期數：在股票持股放一筆「預估」交易，確認後換成實際成交
function syncPlanEstimates() {
  if (!Stocks.ready()) return false;
  const sig = () => JSON.stringify(state.assets.filter(a => mktOf(a)).map(a => [a.id, (a.lots || []).filter(l => l.est).map(l => [l.id, l.shares, l.price])]));
  const before = sig() + state.assets.length;
  for (const a of state.assets) if (a.lots && a.lots.some(l => l.est)) a.lots = a.lots.filter(l => !l.est);
  const cur = Loan.nowYM();
  for (const p of state.plans) {
    const ss = planStocksOf(p);
    if (!ss.length || !p.startYM) continue;
    const per = planPer(p), am = Plan.amounts(p);
    am.forEach((amount, i) => {
      if (Plan.periodState(p, i, cur) !== 'assumed') return;
      const ym = Loan.ymAdd(p.startYM, i), day = String(Math.min(Loan.daysIn(ym), Math.round(num(p.day)) || 1)).padStart(2, '0'), dt = `${ym}-${day}`;
      for (const x of ss) {
        const amt = stockAmt(x, per);
        const px = estPrice(x.mkt, x.sym, dt);
        if (!px || !amt) continue;
        const fx = Stocks.fx(mktCcy(x.mkt, Stocks.quote(x.mkt, x.sym)), 'TWD');
        const sh = roundSh(x.mkt, amt / (px * fx));
        if (!sh) continue;
        const cat = mktCat(x.mkt), key = lotSrc(p, i, Stocks.norm(x.mkt, x.sym));
        let h = findHolding(cat, x.sym);
        if (h && (h.lots || []).some(l => l.src === key && !l.est)) continue;   // 已有實際成交
        if (!h) { const q = Stocks.quote(x.mkt, x.sym); h = { id: 'plan-' + p.id + '-' + Stocks.norm(x.mkt, x.sym), category: cat, sym: Stocks.norm(x.mkt, x.sym), name: q ? q.name : x.sym, lots: [], fromPlan: true }; state.assets.push(h); }
        h.lots.push({ id: `est-${p.id}-${i}-${x.sym}`, type: 'buy', date: dt, shares: sh, price: Math.round(px * 100) / 100, src: key, est: true, note: `${p.name} 第 ${i + 1} 期` });
      }
    });
  }
  state.assets = state.assets.filter(a => !(a.fromPlan && mktOf(a) && !(a.lots || []).length));
  return sig() + state.assets.length !== before;
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-goplan]');
  if (!g) return;
  e.stopPropagation();
  const [pid, i] = g.dataset.goplan.split('|');
  showView('invest');
  setTimeout(() => { const r = document.querySelector(`.prow[data-plan="${pid}"][data-i="${i}"]`); if (r) { r.scrollIntoView({ block: 'center' }); r.click(); } }, 250);
}, true);

function findPlanLot(p, i, x) {
  const cat = mktCat(x.mkt);
  const h = findHolding(cat, x.sym);
  const key = lotSrc(p, i, Stocks.norm(x.mkt, x.sym));
  const lots = h ? (h.lots || []).filter(l => l.src === key) : [];
  const lot = lots.find(l => !l.est) || lots[0];
  return { h, lot, cat, key };
}
function drawPdStocks(p, i, planned) {
  const el = $('pdStocks');
  const list = planStocksOf(p);
  periodCtx.stocks = list;
  $('pdAmtLabel').textContent = list.length ? '這期實際動用金額（新台幣）' : '實際投入金額';
  if (!list.length) { el.innerHTML = ''; return; }
  const per = planPer(p), ratio = per ? planned / per : 1;
  const hasF = list.some(x => x.mkt === 'fund');
  el.innerHTML = `<div class="small muted pd-note">填每一檔實際買了幾${hasF ? '股／單位' : '股'}、成交價${hasF ? '或申購淨值' : ''}多少；確認後會加進持股，並且就是這期理財型房貸的動用金額。之後再點這期可以隨時改。</div>` + list.map((x, k) => {
    const q = Stocks.quote(x.mkt, x.sym), cc = mktCcy(x.mkt, q), fx = Stocks.fx(cc, state.currency), fd = x.mkt === 'fund';
    const { lot } = findPlanLot(p, i, x);
    const amt = stockAmt(x, per);
    const px = lot ? num(lot.price) : q ? q.price : '';
    const sh = lot ? num(lot.shares) : px ? roundSh(x.mkt, amt / (px * fx)) : '';
    return `<div class="pd-st" data-k="${k}"><div class="pd-st-h">${fd ? Icon('fund') : `<span class="ticker small">${esc(x.sym)}</span>`}<span class="grow">${esc(q ? q.name : x.sym)}<small>計畫 ${fmt(amt)}${q ? `・${fd ? '淨值' : '收盤'} ${price(q.price, q.ccy)}` : ''}${lot ? '・<b class="pos">已記錄</b>' : ''}</small></span></div>
      <div class="pd-st-in"><label><span>${fd ? '單位數' : '股數'}</span><input type="number" inputmode="decimal" step="any" class="pd-sh" value="${sh === '' ? '' : sh}"></label>
      <label><span>${fd ? '申購淨值' : '成交價'}${cc !== 'TWD' ? `（${cc}）` : ''}</span><input type="number" inputmode="decimal" step="any" class="pd-px" value="${px === '' ? '' : px}"></label>
      <span class="pd-sub" data-fx="${fx}"></span></div></div>`;
  }).join('');
  pdRecalc(!(p.done && p.done[i] != null));
}
function pdRecalc(setAmount) {
  let sum = 0;
  $('pdStocks').querySelectorAll('.pd-st').forEach(r => {
    const sh = num(r.querySelector('.pd-sh').value), px = num(r.querySelector('.pd-px').value), fx = +r.querySelector('.pd-sub').dataset.fx || 1;
    const v = sh * px * fx; sum += v;
    r.querySelector('.pd-sub').textContent = v ? `= ${fmt(v)}` : '';
  });
  if (setAmount && !periodCtx.manual && sum) $('pdAmount').value = Math.round(sum);
}
$('pdStocks').addEventListener('input', () => pdRecalc(true));
$('pdAmount').addEventListener('input', () => { periodCtx.manual = true; });
function syncPlanLots(p, i, remove) {
  for (const x of planStocksOf(p)) {
    const { h, key } = findPlanLot(p, i, x);
    if (h) h.lots = h.lots.filter(l => l.src !== key);
    if (h && !h.lots.length) state.assets = state.assets.filter(a => a !== h);
  }
  if (remove) return;
  const ym = Loan.ymAdd(p.startYM, i), day = String(Math.min(Loan.daysIn(ym), Math.round(num(p.day)) || 1)).padStart(2, '0');
  $('pdStocks').querySelectorAll('.pd-st').forEach(r => {
    const x = periodCtx.stocks[+r.dataset.k];
    const sh = num(r.querySelector('.pd-sh').value), px = num(r.querySelector('.pd-px').value);
    if (!sh) return;
    const cat = mktCat(x.mkt);
    const had = findHolding(cat, x.sym);
    const { h } = addLot(cat, x.sym, { id: uid(), type: 'buy', date: `${ym}-${day}`, shares: sh, price: px || '', src: lotSrc(p, i, Stocks.norm(x.mkt, x.sym)), note: `${p.name} 第 ${i + 1} 期` });
    if (!had) h.fromPlan = true;
  });
}
function savePeriod(mode) {
  const { p, i } = periodCtx;
  const v = num($('pdAmount').value);
  if (mode === 'done') { p.done = { ...(p.done || {}), [i]: v }; if (planStocksOf(p).length) syncPlanLots(p, i); UI.burst('coin'); }
  if (mode === 'plan') { p.custom = { ...(p.custom || {}) }; p.custom[i] = v; }
  if (mode === 'undo' && p.done) { delete p.done[i]; if (planStocksOf(p).length) syncPlanLots(p, i, true); }
  $('periodDialog').close();
  save();
}
$('pdDone').addEventListener('click', () => savePeriod('done'));
$('pdPlan').addEventListener('click', () => savePeriod('plan'));
$('pdUndo').addEventListener('click', () => savePeriod('undo'));
$('pdCancel').addEventListener('click', () => $('periodDialog').close());

// 每期要投入多少（依計畫方式）
const planPer = v => { const n = Math.max(1, Math.round(num(v.months))); return v.pmode === 'monthly' ? num(v.perMonth) : num(v.total) / n; };
// 標的每期金額：新版存金額；舊資料只有 %，換算成金額
// 金額可以填台幣或美金（x.ccy === 'USD'），回傳一律換成台幣
const stockAmt = (x, per) => x.amt !== undefined && x.amt !== '' ? num(x.amt) * (x.ccy === 'USD' ? Stocks.fx('USD', 'TWD') : 1) : (num(x.pct) ? per * num(x.pct) / 100 : 0);
// 最新匯率與更新時間
function fxNote() {
  const m = Stocks.info() || {}, r = Stocks.fx('USD', 'TWD');
  const t = m.updated ? new Date(m.updated) : null;
  const when = t && !isNaN(t) ? `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : '—';
  return `匯率 1 USD = ${r.toFixed(2)} TWD・${when} 更新`;
}
function psSumHTML(list, per) {
  const sum = list.reduce((t, x) => t + stockAmt(x, per), 0);
  const usd = list.some(x => x.ccy === 'USD' && x.amt !== '' && x.amt != null);
  return `<span>單筆合計 <b>${usd ? '約 ' : ''}${fmt(sum)}</b></span>${per ? `<small>貸款每期動用以上面的每${vals.pmode === 'monthly' ? '月' : '期'}投入 ${fmt(per)} 計算</small>` : ''}${usd ? `<small class="ps-fx">${fxNote()}</small>` : ''}`;
}
// 投資計畫的股票標的：台股／美股、可搜尋代號、帶出收盤價與走勢
function drawPlanStocks() {
  const el = $('planStocks'); if (!el) return;
  if (!pickType(vals.ptype)) { el.innerHTML = ''; return; }
  if (vals.ptype === '基金' && vals.stocks) vals.stocks.forEach(x => { if (!x.sym && x.mkt !== 'fund') x.mkt = 'fund'; });
  const list = vals.stocks || (vals.stocks = [{ mkt: 'tw', sym: '', pct: '' }]);
  const per = planPer(vals);
  // 只有一檔、還沒填金額 → 自動帶入每期金額
  if (list.length === 1 && (list[0].amt === undefined || list[0].amt === '') && per) list[0].amt = Math.round(per);
  el.innerHTML = `<div class="panel-title">${Icon('chart')} 投資標的</div>
    ${list.map((x, i) => {
      const q = x.sym ? Stocks.quote(x.mkt, x.sym) : null;
      const share = stockAmt(x, per);
      const k = q ? Stocks.fx(q.ccy, state.currency) : 1;
      return `<div class="ps-row" data-ps="${i}">
        <div class="ps-top">
          <button type="button" class="bk-tag ${x.mkt === 'us' ? 'us' : x.mkt === 'fund' ? 'fund' : ''}" data-psm="${i}">${mktCat(x.mkt)} ⇄</button>
          <button type="button" class="pickbtn ps-pick ${x.sym ? '' : 'empty'}" data-psp="${i}"><span>${x.sym ? esc(symName(x)) : x.mkt === 'fund' ? '選基金' : '選股票'}</span><i>›</i></button>
          ${list.length > 1 ? `<button type="button" class="bk-del" data-psd="${i}" aria-label="刪除">×</button>` : ''}
        </div>
        <div class="ps-money"><span class="small muted">每期金額</span>
          <button type="button" class="ps-ccy ${x.ccy === 'USD' ? 'us' : ''}" data-psc="${i}" aria-label="切換台幣／美金">${x.ccy === 'USD' ? 'US$ ⇄' : 'NT$ ⇄'}</button>
          <input class="ps-amt" type="number" inputmode="decimal" step="any" placeholder="${x.ccy === 'USD' ? '例如 500' : '例如 10000'}" value="${esc(x.amt !== undefined && x.amt !== '' ? x.amt : share ? Math.round(share) : '')}" data-psv="${i}" aria-label="每期投入金額">
          <span class="ps-conv small muted" data-psx="${i}">${x.ccy === 'USD' && share ? `≈ ${fmt(share)}` : ''}</span>
        </div>
        ${q ? `<div class="ps-info">${q.fund ? '' : `<span class="ps-nm">${esc(q.name)}</span>`}<span>${q.fund ? `${q.org === 'D' ? '境內' : '境外'}・淨值` : '收盤'} <b>${price(q.price, q.ccy)}</b> <span class="chg ${q.chg > 0 ? 'up' : q.chg < 0 ? 'down' : ''}">${q.chg >= 0 ? '+' : ''}${q.chgPct.toFixed(2)}%</span></span>${UI.sparkline(q.series, 90, 26, { tw: x.mkt !== 'us' })}${share ? `<span class="muted">每期約可買 ${(share / (q.price * k)).toFixed(x.mkt === 'tw' ? 0 : 2)} ${unitOf(x.mkt)}</span>` : ''}</div>` : x.sym ? '<div class="ps-info muted small">找不到報價</div>' : ''}
      </div>`;
    }).join('')}
    <div class="ps-sum">${psSumHTML(list, per)}</div>
    <div class="btnrow"><button type="button" class="btn mini" data-psa="1">＋ 再加一檔</button></div>`;
}
$('editFields').addEventListener('click', async e => {
  const t = e.target.closest('[data-psm], [data-psp], [data-psd], [data-psa], [data-psc]');
  if (!t || !t.closest('#planStocks')) return;
  readInputs();
  const L = vals.stocks;
  if (t.dataset.psc != null) { const x = L[+t.dataset.psc]; x.ccy = x.ccy === 'USD' ? 'TWD' : 'USD'; }
  else if (t.dataset.psa) { const last = L[L.length - 1]; L.push({ mkt: last ? last.mkt : 'tw', ccy: last ? last.ccy || 'TWD' : 'TWD', sym: '', amt: '' }); }
  else if (t.dataset.psd != null) L.splice(+t.dataset.psd, 1);
  else if (t.dataset.psm != null) { const x = L[+t.dataset.psm]; x.mkt = { tw: 'us', us: 'fund', fund: 'tw' }[x.mkt] || 'us'; x.sym = ''; }
  else if (t.dataset.psp != null) {
    const x = L[+t.dataset.psp];
    let options;
    try { options = await OPTS.stock({ category: mktCat(x.mkt) }); } catch (err) { return toast(err.message); }
    const o = await UI.openPicker({ title: { us: '選美股', fund: '選基金（境內＋境外）' }[x.mkt] || '選台股', options, value: x.sym, search: true, limit: 40, placeholder: x.mkt === 'fund' ? '輸入基金名稱或公司搜尋' : '輸入代號或名稱搜尋' });
    if (o) { x.sym = o.value; if (x.mkt === 'fund') Stocks.fundHist([x.sym]).then(() => { if ($('editor').open && editing.kind === 'plan') drawPlanStocks(); }); }
  }
  drawPlanStocks(); drawPlanPanel();
});
$('editFields').addEventListener('input', e => {
  const i = e.target.dataset && e.target.dataset.psv;
  if (i != null && vals.stocks) { const x = vals.stocks[+i]; x.amt = e.target.value; delete x.pct; updatePsSum(); const c = $('planStocks').querySelector(`[data-psx="${i}"]`); if (c) c.textContent = x.ccy === 'USD' && num(x.amt) ? `≈ ${fmt(stockAmt(x, 0))}` : ''; }
  else if (editing && editing.kind === 'plan' && ['total', 'perMonth', 'months'].includes(e.target.name)) updatePsSum();
});
// 只更新合計那一行，不重畫輸入框（打字時才不會跳掉）
function updatePsSum() {
  const el = $('planStocks'); if (!el || !vals.stocks) return;
  const box = el.querySelector('.ps-sum'); if (!box) return;
  box.innerHTML = psSumHTML(vals.stocks, planPer(vals));
}
$('editFields').addEventListener('change', e => { if (e.target.dataset && e.target.dataset.psv != null) drawPlanStocks(); });

function drawPlanPanel() {
  const el = $('planPanel');
  if (!el) return;
  const n = Math.max(1, Math.round(num(vals.months)));
  const monthly = vals.pmode === 'monthly';
  const t = monthly ? num(vals.perMonth) * n : num(vals.total);
  if (!t) { el.innerHTML = `<div class="hint-row">${Icon('invest')}<span>${monthly ? '填入每月金額與月數，會自動算出總共投入多少' : '填入總額與期數，會自動算出每月投入多少'}；資金來源選理財型房貸，會一起算出利息怎麼遞增</span></div>`; return; }
  const src = state.debts.find(d => d.id === vals.source);
  const r = src ? num(src.rate) / 100 / 12 : 0;
  const end = vals.startYM ? Loan.ymAdd(vals.startYM, n - 1).replace('-', '/') : '';
  el.innerHTML = `<div class="panel-title">${Icon('calc')} 試算</div>
    ${monthly ? `<div class="kv"><span>總共投入</span><b class="accent">${fmt(t)}</b></div>` : `<div class="kv"><span>每月投入</span><b class="accent">${fmt(t / n)}</b></div>`}
    <div class="kv"><span>最後一期</span><span>${end}</span></div>
    ${src ? `<div class="kv"><span>第 1 期後每月利息</span><span>${fmt((num(src.drawn) + t / n) * r)}</span></div>
    <div class="kv"><span>全部投入後每月利息</span><b class="neg">${fmt((num(src.drawn) + t) * r)}</b></div>
    ${num(src.limit) && num(src.drawn) + t > num(src.limit) ? `<div class="small neg">超過核准額度 ${fmt(num(src.limit))}</div>` : ''}` : ''}
    ${num(vals.yieldPct) ? `<div class="kv"><span>預估每月收益（全部投入後）</span><span class="pos">${fmt(t * num(vals.yieldPct) / 100 / 12)}</span></div>` : ''}`;
}


// ================= 股票交易（加碼／賣出／修改） =================
let tradeCtx = null;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function openTrade(id, type, lotId) {
  if (scaled) return toast('目前是縮小顯示，切回正常顯示才能新增或修改');
  const a = state.assets.find(x => x.id === id);
  if (!a) return;
  const si = stockInfo(a);
  const lot = lotId ? (a.lots || []).find(l => l.id === lotId) : null;
  tradeCtx = { a, lotId, type: lot ? lot.type || 'buy' : type };
  $('tdTitle').innerHTML = si.mkt === 'fund' ? esc(si.q ? si.q.name : a.name || '') : `<span class="ticker">${esc(a.sym)}</span> ${esc(si.q ? si.q.name : a.name || '')}`;
  const fd = si.mkt === 'fund';
  $('tdType').innerHTML = `<button type="button" data-t="buy">${fd ? '申購' : '買進'}</button><button type="button" data-t="sell">${fd ? '贖回' : '賣出'}</button>`;
  $('tdPriceLabel').textContent = fd ? `淨值（${si.ccy}）` : si.ccy === 'TWD' ? '成交價（每股）' : `成交價（每股，${si.ccy}）`;
  $('tdDate').value = lot ? lot.date || '' : todayISO();
  $('tdShares').value = lot ? lot.shares : '';
  $('tdPrice').value = lot ? (lot.price === '' ? '' : lot.price) : (si.px ? +si.px.toFixed(si.mkt === 'fund' ? 4 : 2) : '');
  $('tdDelete').hidden = !lot;
  $('tdQuick').innerHTML = si.mkt === 'tw' ? [1000, 100].map(n => `<button type="button" class="btn mini" data-tq="${n}">+${n === 1000 ? '1 張' : n + ' 股'}</button>`).join('') + (si.shares ? `<button type="button" class="btn mini" data-tq="all">全部 ${unitTxt(si.mkt, si.shares)}</button>` : '') : (si.shares ? `<button type="button" class="btn mini" data-tq="all">全部 ${unitTxt(si.mkt, si.shares)}</button>` : '');
  setTradeType(tradeCtx.type);
  $('tradeDialog').showModal();
}
function setTradeType(t) {
  tradeCtx.type = t;
  $('tdType').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  const fd = mktOf(tradeCtx.a) === 'fund';
  $('tdSharesLabel').textContent = fd ? (t === 'sell' ? '贖回單位數' : '申購單位數') : t === 'sell' ? '賣出股數' : '買進股數';
  $('tdQuick').querySelectorAll('[data-tq="all"]').forEach(b => { b.hidden = t !== 'sell'; });
  tradePreview();
}
function tradePreview() {
  const { a, lotId, type } = tradeCtx;
  const sh = num($('tdShares').value), p = num($('tdPrice').value);
  const lot = { id: lotId || 'preview', type, date: $('tdDate').value, shares: sh, price: p || '' };
  const lots = (a.lots || []).filter(l => l.id !== lotId).concat(sh ? [lot] : []);
  const before = stockInfo(a), after = stockInfo({ ...a, lots });
  const L = lotsSummary(lots);
  const row = L.rows.find(r => r.id === lot.id);
  $('tdPreview').innerHTML = !sh ? `<div class="hint-row">${Icon('calc')}<span>${mktOf(a) === 'fund' ? '填入單位數與淨值' : '填入股數與價格'}，會算出交易後的平均成本與損益</span></div>`
    : `<div class="kv"><span>交易後持有</span><span>${unitTxt(after.mkt, after.shares)}</span></div>
      ${after.avg ? `<div class="kv"><span>平均成本</span><span>${before.avg ? price(before.avg, after.ccy) + ' → ' : ''}<b>${price(after.avg, after.ccy)}</b></span></div>` : ''}
      ${type === 'buy' && p ? `<div class="kv"><span>這筆金額</span><span>${fmt(sh * p * Stocks.fx(after.ccy, state.currency))}</span></div>` : ''}
      ${type === 'sell' && row && row.realized != null ? `<div class="kv"><span>這筆實現損益</span><b class="chg ${plCls(row.realized)}">${plTxt(row.realized * Stocks.fx(after.ccy, state.currency))}</b></div>` : ''}
      ${type === 'sell' && sh > before.shares + (lotId ? num((a.lots.find(l => l.id === lotId) || {}).shares) : 0) ? `<div class="small neg">${mktOf(a) === 'fund' ? '贖回單位數' : '賣出股數'}超過持有</div>` : ''}
      ${after.pl != null ? `<div class="kv"><span>交易後未實現損益</span><span class="chg ${plCls(after.pl)}">${plTxt(after.pl, after.plPct)}</span></div>` : ''}`;
}
$('tdType').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) setTradeType(b.dataset.t); });
['tdShares', 'tdPrice', 'tdDate'].forEach(id => $(id).addEventListener('input', tradePreview));
$('tdQuick').addEventListener('click', e => {
  const b = e.target.closest('[data-tq]'); if (!b) return;
  const si = stockInfo(tradeCtx.a);
  $('tdShares').value = b.dataset.tq === 'all' ? si.shares : num($('tdShares').value) + num(b.dataset.tq);
  tradePreview();
});
$('tdSave').addEventListener('click', () => {
  const { a, lotId, type } = tradeCtx;
  const sh = num($('tdShares').value);
  if (!sh) return toast(mktOf(a) === 'fund' ? '請填單位數' : '請填股數');
  const lot = { id: lotId || uid(), type, date: $('tdDate').value, shares: sh, price: $('tdPrice').value === '' ? '' : num($('tdPrice').value) };
  a.lots = lotId ? a.lots.map(l => l.id === lotId ? lot : l) : [...(a.lots || []), lot];
  a.updatedAt = new Date().toISOString();
  openStocks.add(a.id);
  $('tradeDialog').close();
  UI.burst(type === 'sell' ? 'heart' : 'coin');
  save();
  toast(type === 'sell' ? '已記錄賣出' : lotId ? '已更新' : `已加碼 ${a.sym}`);
});
$('tdDelete').addEventListener('click', () => {
  const { a, lotId } = tradeCtx;
  if (!confirm('刪除這筆交易？')) return;
  a.lots = a.lots.filter(l => l.id !== lotId);
  if (!a.lots.length && confirm('這檔已經沒有任何交易，要把整檔刪掉嗎？')) state.assets = state.assets.filter(x => x.id !== a.id);
  $('tradeDialog').close();
  save();
});
$('tdCancel').addEventListener('click', () => $('tradeDialog').close());

// ================= 一次輸入多檔持股 =================
let bulkMkt = '台股';
function bulkRow(v = {}) {
  return `<div class="bk-row${v.mkt ? ' fixed' : ''}"${v.mkt ? ` data-mkt="${v.mkt}"` : ''}${v.note ? ` data-note="${esc(v.note)}"` : ''}><input class="bk-sym" list="bkList" placeholder="${bulkMkt === '美股' ? 'AAPL' : '2330'}" value="${esc(v.sym || '')}" autocapitalize="characters">
    <input class="bk-sh" type="number" inputmode="decimal" step="any" placeholder="${bulkMkt === '美股' ? '10' : '1000'}" value="${esc(v.shares || '')}">
    <input class="bk-cost" type="number" inputmode="decimal" step="any" placeholder="選填" value="${esc(v.cost || '')}">
    <button type="button" class="bk-del" aria-label="刪除這列">×</button><small class="bk-name"></small></div>`;
}
async function openBulk() {
  if (scaled) return toast('目前是縮小顯示，切回正常顯示才能新增或修改');
  await Stocks.load(); Stocks.tail().then(() => { if ($('bulkDialog').open) setBulkMkt(bulkMkt); });
  setBulkMkt(bulkMkt);
  $('bkRows').innerHTML = [0, 1, 2].map(() => bulkRow()).join('');
  $('bulkDialog').showModal();
}
function setBulkMkt(m) {
  bulkMkt = m;
  $('bkMkt').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  const mkt = m === '美股' ? 'us' : 'tw';
  $('bkList').innerHTML = Stocks.list(mkt).map(x => `<option value="${esc(x.sym)}">${esc(x.name)}</option>`).join('');
  $('bkRows').querySelectorAll('.bk-row').forEach(bulkName);
}
function bulkName(row) {
  const cat = row.dataset.mkt || bulkMkt;
  const mkt = cat === '美股' ? 'us' : 'tw';
  const sym = row.querySelector('.bk-sym').value.trim();
  const el = row.querySelector('.bk-name');
  if (!sym) { el.textContent = ''; return; }
  const q = Stocks.quote(mkt, sym);
  const ex = findHolding(cat, sym);
  const have = ex ? lotsSummary(ex.lots).shares : 0;
  const note = row.dataset.note ? ' · ' + row.dataset.note : '';
  el.className = 'bk-name ' + (q ? '' : 'neg');
  const tag = row.dataset.mkt ? `<button type="button" class="bk-tag ${cat === '美股' ? 'us' : ''}" data-flip="1" title="點一下切換台股／美股">${cat} ⇄</button>` : '';
  el.innerHTML = tag + (q ? `${esc(q.name)} · 收盤 ${price(q.price, q.ccy)}${esc(note)}${ex ? ` · <span class="neg">已持有 ${have.toLocaleString()} 股，會再加上這列</span>` : ''}` : '找不到報價（仍可加入，之後手動填股價）' + esc(note));
}
// 資產頁的 ＋：新增一筆資產，或一次輸入股票持股（含截圖）
async function assetAddMenu() {
  if (scaled) return toast('目前是縮小顯示，切回正常顯示才能新增或修改');
  const o = await UI.openPicker({ title: '新增資產', options: [
    opt('one', '新增一筆資產', Icon('piggy'), '存款、房子、車子、保險、股票、基金…'),
    opt('bulk', '一次輸入股票持股', Icon('chart'), '多檔一起輸入，或用券商 App 的庫存截圖自動辨識'),
    opt('voice', '用說的新增', Icon('mic'), '例：玉山活存 50 萬、0050 三張 均價 95'),
  ] });
  if (!o) return;
  if (o.value === 'bulk') openBulk(); else if (o.value === 'voice') openVoice(); else openEditor('asset');
}
async function debtAddMenu() {
  if (scaled) return toast('目前是縮小顯示，切回正常顯示才能新增或修改');
  const o = await UI.openPicker({ title: '新增負債', options: [
    opt('one', '新增一筆負債', Icon('card'), '房貸、理財型房貸、信貸、車貸、學貸、信用卡…'),
    opt('voice', '用說的新增', Icon('mic'), '例：國泰房貸 800 萬 利率 2.1% 30 年'),
  ] });
  if (!o) return;
  if (o.value === 'voice') openVoice(); else openEditor('debt');
}
$('bkMkt').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) setBulkMkt(b.dataset.m); });
$('bkAdd').addEventListener('click', () => { $('bkRows').insertAdjacentHTML('beforeend', bulkRow()); $('bkRows').lastElementChild.querySelector('input').focus(); });
$('bkRows').addEventListener('input', e => { if (e.target.classList.contains('bk-sym')) bulkName(e.target.closest('.bk-row')); });
$('bkRows').addEventListener('click', e => {
  if (e.target.closest('.bk-del')) return e.target.closest('.bk-row').remove();
  const f = e.target.closest('[data-flip]');
  if (f) { const r = f.closest('.bk-row'); r.dataset.mkt = r.dataset.mkt === '美股' ? '台股' : '美股'; bulkName(r); }
});
$('bkCancel').addEventListener('click', () => { if (shotCtl) shotCtl.abort(); $('bulkDialog').close(); });

// --- 從截圖讀取持股（用設定裡的 AI）---
function shrinkImage(file, maxSide = 1800) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.88).split(',')[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('讀不到這張圖片')); };
    img.src = url;
  });
}
// 名稱或代號 → 報價；找不到就在兩個市場都試
function matchStock(h) {
  // AI 有時把市場塞進代號（例如「NVDA,US」「2330.TW」），先清乾淨
  const raw = String(h.symbol || '').toUpperCase();
  const sym = raw.split(/[,\s:;/|]+/)[0].replace(/\.(TW|TWO|US)$/, '').trim();
  // 代號開頭是數字 → 台股；是英文字母 → 美股（比 AI 的判斷可靠）
  const guess = /^\d/.test(sym) ? 'tw' : /^[A-Z]/.test(sym) ? 'us' : (/\bUS\b|USD/.test(raw) || h.market === 'us' ? 'us' : 'tw');
  const mkts = guess === 'us' ? ['us', 'tw'] : ['tw', 'us'];
  for (const m of mkts) { const q = sym && Stocks.quote(m, sym); if (q) return { m, q }; }
  const nm = String(h.name || '').replace(/\s+/g, '');
  if (nm) for (const m of mkts) {
    const L = Stocks.list(m);
    const x = L.find(x => x.name.replace(/\s+/g, '') === nm) || L.find(x => nm.length >= 2 && (x.name.includes(nm) || nm.includes(x.name.replace(/\s+/g, ''))));
    if (x) return { m, q: Stocks.quote(m, x.sym) };
  }
  return { m: mkts[0], q: null, sym };
}
const n1 = v => { if (v === '' || v == null) return null; const x = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,\s$＄]/g, '').replace(/^\+/, '')); return isFinite(x) ? x : null; };
// AI 可能用別的欄位名稱，統一一下
const pickN = (h, ...ks) => { for (const k of ks) { const v = n1(h[k]); if (v != null) return v; } return null; };
function holdingToRow(h) {
  const { m, q, sym } = matchStock(h);
  const notes = [];
  h = { ...h, shares: pickN(h, 'shares', 'quantity', 'total_shares', 'qty'), avg_cost: pickN(h, 'avg_cost', 'average_cost', 'avg_price', 'average_price', 'cost_price'), price: pickN(h, 'price', 'last_price', 'current_price'), market_value: pickN(h, 'market_value', 'value'), cost_total: pickN(h, 'cost_total', 'total_cost'), pl_amount: pickN(h, 'pl_amount', 'pnl', 'profit'), pl_pct: pickN(h, 'pl_pct', 'return_pct', 'pnl_pct') };
  const px = n1(h.price) || (q && q.price) || null;
  const mv = n1(h.market_value);
  let shares = n1(h.shares);
  if (!shares && mv && px) { shares = mv / px; notes.push('股數由市值推算'); }
  if (shares) shares = m === 'tw' ? Math.round(shares) : Math.round(shares * 1e5) / 1e5;
  let cost = n1(h.avg_cost);
  if (!cost && shares) {
    const pl = n1(h.pl_amount), pct = n1(h.pl_pct);
    let total = n1(h.cost_total);
    if (!total && mv != null && pl != null) total = mv - pl;
    if (!total && mv != null && pct != null && pct > -100) total = mv / (1 + pct / 100);
    if (!total && px && pct != null && pct > -100) total = px / (1 + pct / 100) * shares;
    if (total) { cost = total / shares; notes.push('成本由損益推算'); }
  }
  if (cost) cost = Math.round(cost * (m === 'tw' ? 100 : 1e4)) / (m === 'tw' ? 100 : 1e4);
  return { mkt: m === 'us' ? '美股' : '台股', sym: q ? q.sym : (sym || h.name || ''), shares: shares || '', cost: cost || '', note: notes.join('、'), name: h.name };
}
let shotCtl = null, lastShotRaw = null;
document.addEventListener('click', e => { if (e.target.id === 'bkRaw' && lastShotRaw) alert(JSON.stringify(lastShotRaw, null, 1).slice(0, 3000)); });
document.addEventListener('input', e => { if (e.target.classList && e.target.classList.contains('bk-sh')) e.target.classList.toggle('need', !e.target.value); });
$('bkShot').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  if (!files.length) return;
  if (!aiReady()) { $('bkShotMsg').innerHTML = '<span class="neg">要先到「設定 → AI 理解」填入 Claude 或 Gemini 金鑰，才能看圖</span>'; return; }
  const msg = t => { $('bkShotMsg').innerHTML = t; };
  $('bkShotBtn').classList.add('busy');
  shotCtl = new AbortController();
  try {
    msg(`壓縮 ${files.length} 張圖片…`);
    const imgs = [];
    for (const f of files.slice(0, 20)) imgs.push(await shrinkImage(f));
    await Stocks.load(); await Stocks.tail();
    const hs = await AI.readHoldings(state.ai, imgs, shotCtl.signal, (i, n) => msg(`AI 辨識中…（${Math.min(n, i + 5)}/${n} 張）`));
    lastShotRaw = hs;
    // 去掉跨截圖重複的同一列
    const seen = new Set(), rows = [];
    for (const h of hs) {
      const r = holdingToRow(h);
      const k = `${r.mkt}|${r.sym}|${r.shares}`;
      if (!r.sym || seen.has(k)) continue;
      seen.add(k); rows.push(r);
    }
    if (!rows.length) { msg('<span class="neg">沒有在圖片裡找到持股，換一張庫存畫面試試</span>'); return; }
    // 移除空白列，放進結果
    $('bkRows').querySelectorAll('.bk-row').forEach(r => { if (!r.querySelector('.bk-sym').value.trim()) r.remove(); });
    $('bkRows').insertAdjacentHTML('beforeend', rows.map(bulkRow).join(''));
    $('bkRows').querySelectorAll('.bk-row').forEach(bulkName);
    const miss = rows.filter(r => !r.shares).length;
    msg(`讀到 <b>${rows.length}</b> 檔，請核對後按「全部加入」${miss ? `<span class="neg">（${miss} 檔沒讀到股數，紅框請補上）</span>` : ''}${files.length > 20 ? '（只讀前 20 張）' : ''}<br><button type="button" class="link-btn" id="bkRaw">看 AI 讀到的原始內容</button>`);
    $('bkRows').querySelectorAll('.bk-row.fixed .bk-sh').forEach(i => i.classList.toggle('need', !i.value));
  } catch (err) {
    if (err.name !== 'AbortError') msg(`<span class="neg">${esc(err.message)}</span>`);
  } finally {
    $('bkShotBtn').classList.remove('busy'); shotCtl = null;
  }
});
$('bkSave').addEventListener('click', () => {
  const rows = [...$('bkRows').querySelectorAll('.bk-row')].map(r => ({ cat: r.dataset.mkt || bulkMkt, sym: r.querySelector('.bk-sym').value.trim(), shares: num(r.querySelector('.bk-sh').value), cost: r.querySelector('.bk-cost').value })).filter(r => r.sym && r.shares);
  if (!rows.length) return toast('至少填一列代號與股數');
  let added = 0, merged = 0;
  for (const r of rows) {
    const res = addLot(r.cat, r.sym, { id: uid(), type: 'buy', date: '', shares: r.shares, price: r.cost === '' ? '' : num(r.cost) });
    res.merged ? merged++ : added++;
  }
  $('bulkDialog').close();
  UI.burst('coin');
  save();
  toast(`新增 ${added} 檔${merged ? `、${merged} 筆歸到原有股票` : ''}`);
});


// ================= 語音／一句話快速新增 =================
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, vcResults = [];
const fmtRaw = (n, ccy = state.currency) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: ccy, maximumFractionDigits: ccy === 'TWD' || ccy === 'JPY' ? 0 : 2 }).format(n || 0);
const MISS_ZH = { principal: '貸款金額', years: '年限', startYM: '撥款年月', rate: '利率', bank: '銀行', balance: '剩餘本金', monthly: '每月還款', limit: '額度', shares: '股數', amount: '金額' };
const VC_EXAMPLES = ['玉山活存 50 萬', '0050 三張 均價 95', '國泰房貸 800 萬 利率 2.1% 30 年 寬限期 3 年', '信用卡 欠 3 萬 每月繳 5000', '房子 1800 萬 30 坪', '車子 豐田 RAV4 價值 70 萬'];

function openVoice() {
  if (scaled) return toast('目前是縮小顯示，切回正常顯示才能新增或修改');
  if (locked) return;
  vcResults = [];
  $('vcText').value = '';
  $('vcResults').innerHTML = '';
  $('vcMascot').innerHTML = UI.mascotSVG(UI.levelOf(summary(), twdK()));
  $('vcMic').hidden = !SR;
  aiLast = '';
  $('vcAI').hidden = !aiReady();
  $('vcBadge').hidden = !aiReady();
  $('vcHint').innerHTML = SR ? '按下麥克風開始說，說完會自動整理；也可以直接打字。'
    : `這個模式不支援 App 內語音辨識。點下面的輸入框，按<b>鍵盤上的麥克風</b>用聽寫說話，效果一樣。`;
  $('vcExamples').innerHTML = VC_EXAMPLES.map(x => `<button type="button" class="chip-btn" data-vcx="${esc(x)}">${esc(x)}</button>`).join('');
  setListening(false);
  $('voiceDialog').showModal();
  Stocks.load().then(vcParse);
  if (SR) setTimeout(startListening, 250);
}
function setListening(on) {
  listening = on;
  $('voiceDialog').classList.toggle('listening', on);
  $('vcMic').innerHTML = on ? `<span class="rec-dot"></span> 停止` : `${Icon.svg('mic', 26)} 開始說話`;
  $('vcState').textContent = on ? '正在聽…' : '';
}
// iOS Safari 的連續聆聽常常不理會 stop()，所以：每次聆聽有編號、停止時作廢舊的、
// 先 stop() 再強制 abort()、2.5 秒沒新內容自動停、最長 40 秒
let recId = 0, silenceT = 0, maxT = 0;
function startListening() {
  if (!SR || listening) return;
  const id = ++recId;
  try {
    const r = new SR();
    rec = r;
    r.lang = 'zh-TW'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    const base = $('vcText').value ? $('vcText').value.trim() + '，' : '';
    const bump = () => { clearTimeout(silenceT); silenceT = setTimeout(() => { if (id === recId) stopListening(); }, 2500); };
    r.onresult = e => {
      if (id !== recId) return;                 // 已經停止，忽略晚到的結果
      let txt = '';
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      $('vcText').value = base + txt;
      vcParse();
      bump();
    };
    r.onerror = e => {
      if (id !== recId) return;
      $('vcState').textContent = e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? '沒有麥克風或語音辨識權限，可以改用鍵盤上的麥克風聽寫' : e.error === 'no-speech' ? '沒有聽到聲音，再試一次' : e.error === 'aborted' ? '' : '語音辨識發生問題：' + e.error;
      stopListening();
    };
    r.onend = () => { if (id === recId) stopListening(); };
    r.start();
    setListening(true);
    bump();
    clearTimeout(maxT); maxT = setTimeout(() => { if (id === recId) stopListening(); }, 40000);
  } catch (err) { setListening(false); $('vcState').textContent = '無法開始語音辨識，可以改用鍵盤聽寫'; }
}
function stopListening() {
  recId++;                                       // 作廢目前這次聆聽
  clearTimeout(silenceT); clearTimeout(maxT);
  const r = rec; rec = null;
  if (r) {
    r.onresult = r.onerror = r.onend = null;
    try { r.stop(); } catch (e) { /* ignore */ }
    setTimeout(() => { try { r.abort(); } catch (e) { /* ignore */ } }, 400);   // iOS 不理 stop() 時強制中斷
  }
  if (listening) { setListening(false); vcParse(); if (aiReady()) setTimeout(() => vcAI(), 300); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stopListening(); });

function vcCardHTML(r, i) {
  const v = r.vals;
  const chips = [];
  let icon, title;
  if (r.stock) {
    icon = Icon(v.category === '美股' ? 'us' : 'tw');
    title = `${v.category} · <b>${esc(v.sym)} ${esc(r.name)}</b>`;
    if (v.shares) chips.push(unitTxt(v.category === '美股' ? 'us' : 'tw', +v.shares));
    if (v.cost) chips.push(`均價 ${v.cost}`);
    if (findHolding(v.category, v.sym)) chips.push('已持有，會歸到同一檔');
  } else if (r.kind === 'asset') {
    icon = v.category === '車輛' ? UI.carIcon(brandOf(v.brand), v.model) : Icon(catOf(v.category).ic);
    title = `資產 · ${esc(v.category)} · <b>${esc(v.name)}</b>`;
    if (v.amount) chips.push(fmtRaw(v.amount));
    if (v.ping) chips.push(`${v.ping} 坪`);
  } else {
    const b = bankOf(v.bank);
    icon = v.bank ? UI.bankIcon(b) : Icon(typeOf(v.type).ic);
    title = `負債 · ${esc(v.type)} · <b>${esc(v.name)}</b>`;
    if (b && b.code !== '—') chips.push(`${b.code} ${shortBank(b)}`);
    const amt = v.principal || v.balance || v.limit;
    if (amt) chips.push((v.mode === 'revolving' ? '額度 ' : v.mode === 'auto' ? '貸款 ' : '剩餘 ') + fmtRaw(amt));
    if (v.rate !== '' && v.rate != null) chips.push(`利率 ${v.rate}%`);
    if (v.years) chips.push(`${v.years} 年`);
    if (+v.grace) chips.push(`寬限期 ${v.grace} 個月`);
    if (v.method === 'interest') chips.push('只繳息到期還本');
    if (v.monthly) chips.push(`月付 ${fmtRaw(v.monthly)}`);
    if (v.startYM) chips.push(`${v.startYM.replace('-', '/')} 撥款`);
  }
  const ok = !r.missing.length;
  return `<div class="vc-card ${ok ? '' : 'need'}" style="--i:${i}">${icon}
    <div class="grow"><div class="vc-title">${title}</div>
      <div class="vc-chips">${chips.map(c => `<span class="chip blue">${esc(c)}</span>`).join('')}</div>
      ${ok ? '' : `<div class="vc-miss">還缺：${r.missing.map(m => MISS_ZH[m] || m).join('、')}</div>`}
      <div class="vc-src">「${esc(r.text)}」</div></div>
    <div class="vc-btns">${ok ? `<button type="button" class="btn mini primary" data-vcadd="${i}">新增</button>` : ''}
      <button type="button" class="btn mini" data-vcform="${i}">${ok ? '修改' : '補資料'}</button></div></div>`;
}
// AI 結果 → 與規則解析相同的格式
const aiReady = () => !!(state.ai && state.ai.on && AI.keyOf(state.ai));
function debtMissing(v) {
  const m = [];
  if (!v.bank) m.push('bank');
  if (v.mode === 'auto') { if (!v.principal) m.push('principal'); if (!v.years) m.push('years'); if (!v.startYM) m.push('startYM'); if (v.rate === '' || v.rate == null) m.push('rate'); }
  if (v.mode === 'manual') { if (!v.balance) m.push('balance'); if (!v.monthly) m.push('monthly'); if (v.rate === '' || v.rate == null) m.push('rate'); }
  if (v.mode === 'revolving') { if (!v.limit) m.push('limit'); if (v.rate === '' || v.rate == null) m.push('rate'); }
  return m;
}
function fromAI(it) {
  const text = it.source_text || '';
  const z = v => v == null ? '' : v;
  if (it.kind === 'stock') {
    const mkt = it.market === 'us' ? 'us' : 'tw';
    let sym = String(it.symbol || '').toUpperCase().replace(/\.TWO?$/, '');
    if (!Stocks.quote(mkt, sym)) { const f = Voice.findStock(`${it.name || ''} ${sym}`); if (f) sym = f.sym; }
    const q = Stocks.quote(mkt, sym);
    const vals = { category: mkt === 'us' ? '美股' : '台股', sym: Stocks.norm(mkt, sym), shares: z(it.shares), cost: z(it.price) };
    return { kind: 'asset', stock: true, ai: true, vals, name: q ? q.name : (it.name || sym), missing: it.shares ? [] : ['shares'], text };
  }
  if (it.kind === 'debt') {
    const type = DEBT_TYPES.some(t => t.v === it.debt_type) ? it.debt_type : '其他';
    const b = it.bank_code && BANKS.find(x => x.code === String(it.bank_code).padStart(3, '0'));
    const mode = it.mode || (type === '理財型房貸' ? 'revolving' : it.years ? 'auto' : 'manual');
    const vals = { type, name: it.name || type, bank: b ? `${b.code}|${b.name}` : type === '親友借款' ? '—|親友' : '', mode, rate: z(it.rate ?? (type === '親友借款' ? 0 : '')),
      principal: z(it.principal), balance: z(it.balance), monthly: z(it.monthly), limit: z(it.limit), drawn: z(it.drawn ?? (mode === 'revolving' ? 0 : '')),
      years: z(it.years), grace: String(it.grace_months || 0), graceYM: z(it.grace_start), startYM: z(it.start), method: it.method || 'annuity', payDay: z(it.pay_day), note: z(it.note) };
    if (mode === 'auto' && !vals.principal && vals.balance) vals.principal = vals.balance;
    return { kind: 'debt', ai: true, vals, missing: debtMissing(vals), text };
  }
  const cat = ASSET_CATS.some(c => c.v === it.category) ? it.category : '其他';
  const brand = it.car_brand && CAR_BRANDS.find(c => c.v.toLowerCase() === String(it.car_brand).toLowerCase() || c.zh === it.car_brand);
  const vals = { category: cat, name: it.name || cat, amount: z(it.amount), note: z(it.note) };
  if (cat === '車輛') Object.assign(vals, { brand: brand ? brand.v : '', model: z(it.car_model), buyYear: z(it.buy_year), buyPrice: z(it.buy_price) });
  if (cat === '不動產' && it.ping) vals.ping = it.ping;
  return { kind: 'asset', ai: true, vals, missing: vals.amount ? [] : ['amount'], text };
}
let aiCtl = null, aiLast = '';
async function vcAI(force) {
  const txt = $('vcText').value.trim();
  if (!aiReady() || !txt || (!force && txt === aiLast)) return;
  aiLast = txt;
  if (aiCtl) aiCtl.abort();
  aiCtl = new AbortController();
  const ctl = aiCtl;
  clearTimeout(vcTimer);
  $('vcResults').innerHTML = `<div class="vc-thinking">${Icon('star')}<span>AI 整理中…</span></div>`;
  try {
    await Stocks.load();
    const r = await AI.call(state.ai, txt, ctl.signal);
    if (ctl !== aiCtl) return;
    vcResults = r.items.map(fromAI);
    renderVc(true);
  } catch (e) {
    if (e.name === 'AbortError') return;
    vcResults = Voice.parse(txt);
    renderVc(false, e.message);
  }
}
function renderVc(byAI, err) {
  const txt = $('vcText').value.trim();
  const okN = vcResults.filter(r => !r.missing.length).length;
  $('vcResults').innerHTML = (err ? `<div class="vc-err">${Icon('warn')}<span>${esc(err)}，先用內建規則整理</span></div>` : '')
    + (byAI && vcResults.length ? `<div class="vc-by">${Icon.svg('star', 16)} 由 AI 整理</div>` : '')
    + (vcResults.length ? vcResults.map(vcCardHTML).join('') + (okN > 1 ? `<button type="button" class="btn primary vc-all" data-vcall="1">全部新增（${okN} 筆）</button>` : '')
      : txt ? `<div class="empty">${byAI ? 'AI 沒有找到可以新增的項目' : '聽不太懂，換個說法試試，例如「玉山活存 50 萬」'}</div>` : '');
}

let vcTimer;
function vcParse() {
  clearTimeout(vcTimer);
  vcTimer = setTimeout(() => {
    const txt = $('vcText').value.trim();
    if (aiReady() && txt && txt === aiLast) return;   // 已有 AI 結果就不要被規則覆蓋
    vcResults = txt ? Voice.parse(txt) : [];
    renderVc(false);
    if (aiReady() && txt) $('vcResults').insertAdjacentHTML('afterbegin', `<div class="vc-by muted">即時預覽（內建規則）· 按「AI 整理」或說完會由 AI 重新整理</div>`);
  }, 250);
}
function vcAdd(r) {
  const v = { ...r.vals };
  if (r.stock) {
    addLot(v.category, v.sym, { id: uid(), type: 'buy', date: '', shares: +v.shares, price: v.cost === '' ? '' : +v.cost });
    return;
  }
  const kind = r.kind;
  for (const k of Object.keys(v)) if (NUMERIC.has(k) && v[k] !== '' && v[k] != null) v[k] = num(v[k]);
  v.updatedAt = new Date().toISOString();
  state[KEY[kind]].push({ id: uid(), ...v });
  if (kind === 'asset') openGroups.add(v.category);
}
document.addEventListener('click', e => {
  const x = e.target.closest('[data-vcx]');
  if (x) { $('vcText').value = x.dataset.vcx; vcParse(); return; }
  const a = e.target.closest('[data-vcadd]');
  if (a) {
    const r = vcResults[+a.dataset.vcadd];
    vcAdd(r); save(); UI.burst('coin');
    a.closest('.vc-card').classList.add('added'); a.closest('.vc-btns').innerHTML = '<span class="pos">已新增</span>';
    toast(`已新增：${r.stock ? r.vals.sym + ' ' + r.name : r.vals.name}`);
    return;
  }
  if (e.target.closest('[data-vcall]')) {
    const ok = vcResults.filter(r => !r.missing.length);
    ok.forEach(vcAdd); save(); UI.burst('coin');
    $('voiceDialog').close();
    toast(`已新增 ${ok.length} 筆`);
    return;
  }
  const f = e.target.closest('[data-vcform]');
  if (f) {
    const r = vcResults[+f.dataset.vcform];
    stopListening();
    $('voiceDialog').close();
    const preset = { ...r.vals };
    if (r.stock) { preset.cost = r.vals.cost; preset.shares = r.vals.shares; }
    showView(r.kind === 'asset' ? 'assets' : 'debts');
    openEditor(r.kind, null, preset);
  }
});
$('vcText').addEventListener('input', () => { aiLast = ''; vcParse(); });
$('vcAI').addEventListener('click', () => vcAI(true));
$('vcMic').addEventListener('click', () => listening ? stopListening() : startListening());
$('vcClose').addEventListener('click', () => { stopListening(); $('voiceDialog').close(); });
$('voiceDialog').addEventListener('close', stopListening);
$('askBtn').addEventListener('click', () => openAsk());

// ---------- 小提示 ----------
let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- AI 設定 ----------
function renderAISettings() {
  const a = state.ai || {};
  const g = a.provider === 'gemini';
  const key = g ? a.gkey : a.key;
  const masked = key ? key.slice(0, 8) + '••••' + key.slice(-4) : '';
  const models = g ? AI.GMODELS : AI.MODELS, cur = g ? a.gmodel : a.model;
  $('aiSet').innerHTML = `
    <label class="switch-row"><span><b>用 AI 整理語音輸入</b><small class="muted">聽得懂比較口語的說法；沒有金鑰或連不上時會自動改用內建規則</small></span>
      <input type="checkbox" class="switch" id="aiOn" ${a.on ? 'checked' : ''}></label>
    <span class="flabel" style="margin-top:12px">AI 服務</span>
    <div class="seg" id="aiProv"><button type="button" data-p="claude" class="${g ? '' : 'on'}">Claude<small>Anthropic</small></button><button type="button" data-p="gemini" class="${g ? 'on' : ''}">Gemini<small>Google</small></button></div>
    <span class="flabel">${g ? 'Gemini' : 'Anthropic'} API 金鑰${key ? `（目前：${esc(masked)}）` : ''}</span>
    <div class="inrow"><input id="aiKey" type="password" autocomplete="off" placeholder="${key ? '輸入新的金鑰可取代' : g ? 'AQ.… 或 AIza…' : 'sk-ant-...'}" class="ai-key">
      <button type="button" class="btn mini primary" id="aiSave">儲存</button></div>
    <span class="flabel" style="margin-top:12px">模型</span>
    <div class="seg" id="aiModel">${models.map(m => `<button type="button" data-m="${m.v}" class="${cur === m.v ? 'on' : ''}">${m.label}<small>${m.d}</small></button>`).join('')}</div>
    <div class="btnrow"><button type="button" class="btn mini" id="aiTest">測試連線</button>${key ? '<button type="button" class="btn mini danger" id="aiDel">刪除金鑰</button>' : ''}<span class="small muted" id="aiMsg"></span></div>
    <p class="muted small">${g
      ? `金鑰到 <b>aistudio.google.com</b> →「Get API key」建立。Gemini App 的訂閱（Google AI Pro）<b>不包含 API 用量</b>，API 另外計費。<br>
         ・<b>沒綁帳單（免費方案）</b>：有每日次數上限，Google 條款寫明送出的內容<b>可能會被用來改善產品</b>。<br>
         ・<b>綁定 Cloud 帳單（付費方案）</b>：用多少付多少，Flash-Lite 每句大約不到新台幣 0.1 元，內容不會被用來改善產品；AI Pro 訂閱者可能領得到每月 Cloud 抵用額度。`
      : `金鑰到 <b>platform.claude.com</b> 建立（API Keys），費用記在你的 Anthropic 帳號，Claude 訂閱不包含 API 用量。使用 Haiku 5.5 每句大約不到新台幣 0.1 元。`}<br>
    會送出的只有你說的那句話和選單清單（類別、銀行代碼、車廠），不會送出你的資產負債資料。金鑰存在這支手機裡，開啟 Face ID 鎖時會一起加密；匯出備份不會包含金鑰。</p>`;
}
document.addEventListener('click', async e => {
  const t = e.target.closest('#aiSave, #aiTest, #aiDel, #aiModel [data-m], #aiProv [data-p]');
  if (!t) return;
  const g = state.ai.provider === 'gemini';
  if (t.dataset.p) { state.ai.provider = t.dataset.p; save(); renderAISettings(); return; }
  if (t.id === 'aiSave') {
    const k = $('aiKey').value.trim();
    if (g ? !/^(AIza|AQ\.)[0-9A-Za-z_.\-]{16,}$/.test(k) : !/^sk-ant-/.test(k)) return toast(g ? 'Gemini 金鑰應該是 AQ. 或 AIza 開頭' : '金鑰應該是 sk-ant- 開頭');
    if (g) state.ai.gkey = k; else state.ai.key = k;
    save(); renderAISettings(); toast('已儲存金鑰');
  } else if (t.id === 'aiDel') {
    if (!confirm('刪除 API 金鑰？')) return;
    if (g) state.ai.gkey = ''; else state.ai.key = '';
    save(); renderAISettings();
  } else if (t.dataset.m) {
    if (g) state.ai.gmodel = t.dataset.m; else state.ai.model = t.dataset.m;
    save(); renderAISettings();
  } else if (t.id === 'aiTest') {
    if (!AI.keyOf(state.ai)) return toast('先輸入並儲存金鑰');
    $('aiMsg').textContent = '測試中…';
    try { await AI.test(state.ai); $('aiMsg').innerHTML = '<span class="pos">連線成功</span>'; }
    catch (err) { $('aiMsg').innerHTML = `<span class="neg">${esc(err.message)}</span>`; }
  }
});
document.addEventListener('change', e => { if (e.target.id === 'aiOn') { state.ai.on = e.target.checked; save(); } });

// ---------- 設定 ----------
// 點：隱藏／顯示；長按：切換縮小顯示（只有自己知道）
let eyeTimer = null, eyeLong = false;
$('eyeBtn').addEventListener('pointerdown', () => { eyeLong = false; clearTimeout(eyeTimer); eyeTimer = setTimeout(() => { eyeLong = true; if (hidden) setHidden(false); setScaled(!scaled); toast(scaled ? '已切換顯示方式' : '已恢復'); if (navigator.vibrate) navigator.vibrate(15); }, 650); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(t => $('eyeBtn').addEventListener(t, () => clearTimeout(eyeTimer)));
$('eyeBtn').addEventListener('contextmenu', e => e.preventDefault());
$('eyeBtn').addEventListener('click', () => { if (eyeLong) { eyeLong = false; return; } setHidden(!hidden); });
function renderPrivacySettings() {
  $('scaleSet').innerHTML = `
    <h3>${Icon.svg('scale', 22)} 縮小顯示</h3>
    <p class="muted small">給別人看的時候用：所有金額、圖表、等級都除以一個只有你知道的倍率。資產與負債的比例、正負、報酬率 % 都不變，別人看得出結構，猜不出實際金額。</p>
    <div class="inrow"><label class="flabel" for="scaleK" style="align-self:center;margin:0 6px 0 0">倍率</label>
      <input id="scaleK" type="password" inputmode="decimal" autocomplete="off" placeholder="${SCALE_DEF}" value="${esc(String(prefs.scaleK || SCALE_DEF))}">
      <button type="button" class="btn mini" id="scaleShow">看</button><button type="button" class="btn mini primary" id="scaleSave">儲存</button></div>
    <div class="btnrow"><button type="button" class="btn ${scaled ? '' : 'primary'}" id="scaleToggle">${scaled ? '恢復正常顯示' : '現在切換成縮小顯示'}</button></div>
    <label class="switch-row" style="margin-top:12px"><span><b>打開 App 時就用縮小顯示</b><small class="muted">搭配「自動隱藏」時，點眼睛顯示出來的也是縮小後的金額</small></span>
      <input type="checkbox" class="switch" id="scaleStart" ${prefs.scaleStart ? 'checked' : ''}></label>
    <p class="muted small">快速切換：<b>長按</b>總覽淨資產旁的眼睛，畫面不會出現任何倍率提示；縮小顯示時眼睛右上角會有一個小點，只有你知道。縮小顯示時不能新增或修改資料。</p>`;
}
document.addEventListener('click', e => {
  const t = e.target.closest('#scaleShow, #scaleSave, #scaleToggle');
  if (!t) return;
  if (t.id === 'scaleShow') { const i = $('scaleK'); i.type = i.type === 'password' ? 'text' : 'password'; return; }
  if (t.id === 'scaleSave') {
    const v = +$('scaleK').value;
    if (!(v > 1 && v < 1e6)) return toast('倍率要大於 1');
    prefs.scaleK = v; savePrefs(); if (scaled) setScaled(true); toast('已儲存倍率');
    return;
  }
  if (t.id === 'scaleToggle') { if (hidden) setHidden(false); setScaled(!scaled); renderPrivacySettings(); }
});
document.addEventListener('change', e => { if (e.target.id === 'scaleStart') { prefs.scaleStart = e.target.checked; savePrefs(); } });

$('autoHide').checked = !!prefs.autoHide;
$('autoHide').addEventListener('change', e => { prefs.autoHide = e.target.checked; savePrefs(); });
// 切到背景再回來時，若設定為自動隱藏就重新遮住
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && prefs.autoHide && !hidden) { hidden = true; document.body.classList.add('privacy'); } });
$('currencyBtn').addEventListener('click', async () => {
  const o = await UI.openPicker({ title: '幣別', options: CURRENCIES.map(c => opt(c.v, c.label, Icon(c.ic))), value: state.currency });
  if (o) { state.currency = o.value; levelsKey = ''; save(); renderSetMenu(); }
});

// ---------- 備份 ----------
function backupPayload() {
  const { ai, backup, ...rest } = state;   // API 金鑰、GitHub token、恢復金鑰都不放進備份
  return { app: 'Balanza', version: APP_VERSION, ...rest };
}
async function sha256(str) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(h), x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
function since(t) {
  if (!t) return '從未';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return '剛剛';
  if (m < 60) return `${m} 分鐘前`;
  if (m < 1440) return `${Math.round(m / 60)} 小時前`;
  return `${Math.round(m / 1440)} 天前`;
}
const bkReady = () => !locked && state.backup.on && state.backup.token && state.backup.key;
let bkTimer = null, bkBusy = false, bkAgain = false;
function scheduleBackup(delay = 8000) {
  if (!bkReady()) return;
  clearTimeout(bkTimer);
  bkTimer = setTimeout(() => { bkTimer = null; runBackup(); }, delay);
}
async function runBackup(force) {
  if (!bkReady()) return false;
  if (bkBusy) { bkAgain = true; return false; }
  const p = backupPayload();
  const empty = !p.assets.length && !p.debts.length && !(p.plans || []).length;
  if (empty && !force) return false;                 // 不拿空資料蓋掉雲端備份
  const h = await sha256(JSON.stringify(p) + state.backup.gistId + state.backup.salt);
  if (!force && h === prefs.bk.hash) return false;   // 沒變就不上傳
  bkBusy = true; refreshBackupUI('uploading');
  let ok = false;
  try {
    const b = state.backup;
    const file = await Backup.encrypt({ ...p, exportedAt: new Date().toISOString() }, b.key, b.salt);
    const id = await Backup.upload(b.token, b.gistId, file);
    if (id !== b.gistId) { b.gistId = id; store(); }
    prefs.bk = { ...prefs.bk, at: Date.now(), err: '', hash: await sha256(JSON.stringify(p) + id + b.salt) };
    ok = true;
  } catch (e) {
    prefs.bk.err = e.message || String(e);
  } finally {
    bkBusy = false; savePrefs(); refreshBackupUI();
    if (bkAgain) { bkAgain = false; scheduleBackup(1500); }
  }
  return ok;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && bkTimer) { clearTimeout(bkTimer); bkTimer = null; runBackup(); } });
window.addEventListener('online', () => scheduleBackup(2000));

function refreshBackupUI(st) {
  if (currentView === 'settings' && setPage === 'backup') renderBackupSettings(st);
  if (currentView === 'settings' && !setPage) renderSetMenu();
  renderBkNag();
}
// 從沒確認過、或超過半年沒確認「金鑰存好了」
const keyStale = () => !!state.backup.key && (!prefs.bk.savedAt || Date.now() - prefs.bk.savedAt > 180 * 864e5);
function backupSummary() {
  const b = state.backup;
  if (!b.on) return b.key ? '已有恢復金鑰・未開自動備份' : '尚未設定自動備份';
  if (prefs.bk.err) return '⚠️ 備份失敗：' + prefs.bk.err;
  return '自動備份到 GitHub・' + since(prefs.bk.at);
}
let persisted = null;
function renderBackupSettings(st) {
  const b = state.backup;
  const status = st === 'uploading' || bkBusy ? '<span class="muted">上傳中…</span>'
    : prefs.bk.err ? `<span class="neg">上次失敗：${esc(prefs.bk.err)}</span>`
    : `上次備份：<b>${since(prefs.bk.at)}</b>`;
  $('bkSet').innerHTML = `
  <div class="card">
    <h3>${Icon.svg('lock', 22)} 恢復金鑰</h3>
    ${b.key
      ? `<p class="muted small">已建立。所有備份都用它加密；換手機或資料不見時，用它${b.on ? '和 GitHub token ' : ''}才能還原。</p>
         ${keyStale() ? `<div class="hint-row warn-row">${Icon('warn')}<span>${prefs.bk.savedAt ? '好一陣子沒確認了：' : ''}恢復金鑰${b.on ? '和 GitHub token ' : ''}存到「密碼」App 或備忘錄了嗎？換手機、刪掉 App 重裝時一定要用到。</span></div>` : `<p class="small pos">✓ ${new Date(prefs.bk.savedAt).toLocaleDateString('zh-TW')} 確認已存好</p>`}
         <div class="btnrow"><button type="button" class="btn mini ${keyStale() ? 'primary' : ''}" id="bkShowKey">${b.on ? '顯示恢復金鑰與 token' : '顯示恢復金鑰'}</button><button type="button" class="btn mini" id="bkNewKey">換一組新的</button></div>`
      : `<p class="muted small">隨機產生的 25 碼金鑰，強度遠高於自己想的密碼。備份檔用它加密，就算檔案被別人拿到也打不開。<br><b>弄丟恢復金鑰又同時丟了手機，備份就救不回來。</b></p>
         <div class="btnrow"><button type="button" class="btn primary" id="bkMakeKey">產生恢復金鑰</button></div>`}
  </div>
  <div class="card">
    <h3>${Icon.svg('export', 22)} 自動備份到 GitHub</h3>
    ${!b.key ? '<p class="muted small">先產生恢復金鑰，才能開啟自動備份。</p>'
    : b.on
      ? `<div class="bk-status">${Icon('lock')}<div><b>已開啟</b><small>帳號 ${esc(b.login || '—')}・秘密 Gist（只存密文）</small><small>${status}</small></div></div>
         <p class="muted small">資料有變動約 8 秒後、或離開 App 時自動上傳。GitHub 會保留每一次的歷史版本，可以還原到任一個。</p>
         <div class="btnrow"><button type="button" class="btn mini primary" id="bkNow">立即備份</button><button type="button" class="btn mini" id="bkRestore">從雲端還原</button><button type="button" class="btn mini danger" id="bkOff">停用</button></div>`
      : `<p class="muted small">每次資料變動就自動把<b>加密後</b>的備份存到你 GitHub 帳號的秘密 Gist，不用自己按。</p>
         <ol class="kd-steps small">
           <li>點 <a href="https://github.com/settings/tokens/new?scopes=gist&description=Balanza%20backup" target="_blank" rel="noopener">這個連結</a>（已預先勾好只有 <b>gist</b> 權限）</li>
           <li>Expiration 選 <b>No expiration</b> → 最下面 Generate token</li>
           <li>複製 ghp_ 開頭的 token 貼到下面（<b>GitHub 只顯示這一次</b>，開啟後 App 會提醒你連同恢復金鑰一起存好）</li>
         </ol>
         <div class="inrow"><input id="bkToken" type="password" autocomplete="off" placeholder="ghp_..." class="ai-key"><button type="button" class="btn mini primary" id="bkConnect">開啟</button></div>
         <p class="small" id="bkMsg"></p>`}
  </div>
  <div class="card">
    <h3>${Icon.svg('import', 22)} 手動備份與還原</h3>
    <p class="muted small">匯出的檔案也是加密的，可以放心存到 iCloud 雲碟或傳給自己。上次匯出：${since(prefs.bk.exportAt)}</p>
    <div class="btnrow">
      <button type="button" class="btn" id="exportBtn">${Icon.svg('export', 18)} 匯出加密備份</button>
      <button type="button" class="btn" id="importBtn">${Icon.svg('import', 18)} 匯入備份檔</button>
      ${b.on ? '' : '<button type="button" class="btn" id="bkRestore">從雲端還原</button>'}
    </div>
  </div>
  <div class="card">
    <h3>${Icon.svg('piggy', 22)} 系統永久保存</h3>
    <p class="muted small">${persisted === true ? '<b class="pos">已開啟</b>：手機空間不足時，系統不會自動清掉這個 App 的資料。'
      : persisted === false ? '系統目前沒有同意永久保存（iPhone 加到主畫面使用時通常不會被清除）。仍建議開啟自動備份。'
      : '這個瀏覽器不支援查詢。'}</p>
  </div>`;
}

// 顯示恢復金鑰（有開自動備份時連 GitHub token 一起），提醒存起來
function showKey(first) {
  const tok = state.backup.on && state.backup.token;
  $('kdKey').textContent = state.backup.key;
  $('kdTokWrap').hidden = !tok; $('kdTok').textContent = tok || '';
  $('kdCopyAll').hidden = !tok;
  $('kdTitle').innerHTML = `${Icon('lock')} ${tok ? '存好這兩組，換手機才還原得回來' : '你的恢復金鑰'}`;
  $('kdMsg').textContent = first ? (tok ? 'GitHub token 只會在建立時顯示一次，恢復金鑰是唯一能解開備份的鑰匙。請現在就一起存好；之後也可以在「設定 → 備份與還原」再看到。' : '這是唯一能解開備份的鑰匙，請現在就存好。之後也可以在這裡再看到。')
    : '請確認這些已經存在「密碼」App、備忘錄或紙上。換手機、刪掉 App 重裝時都要用到。';
  $('kdOkTxt').textContent = tok ? '我已經把 token 和恢復金鑰都存好了' : '我已經把恢復金鑰存好了';
  $('kdOkRow').hidden = false; $('kdOk').checked = false; kdFirst = !!first;
  $('keyDialog').showModal();
}
let kdFirst = false;   // 第一次（剛建立）一定要勾「存好了」才能關；之後查看可以直接關
const copyText = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg); } catch (e) { toast('無法複製，請手動抄下'); } };
$('kdCopy').addEventListener('click', () => copyText(state.backup.key, '已複製恢復金鑰'));
$('kdCopyAll').addEventListener('click', () => copyText(`Balanza 備份\n恢復金鑰：${state.backup.key}\nGitHub token：${state.backup.token}\nGitHub 帳號：${state.backup.login || ''}\n（換手機：設定 → 備份與還原 → 從雲端還原，貼上這兩組）`, '已複製，貼到備忘錄或「密碼」App 存好'));
$('kdDone').addEventListener('click', () => {
  if (!$('kdOk').checked && kdFirst) return toast(`請先勾選「${$('kdOkTxt').textContent}」`);
  if ($('kdOk').checked) { prefs.bk.savedAt = Date.now(); savePrefs(); }
  $('keyDialog').close();
  if (currentView === 'settings' && setPage === 'backup') renderBackupSettings();
  renderBkNag();
});
$('keyDialog').addEventListener('cancel', e => { if (kdFirst && !$('kdOk').checked) e.preventDefault(); });

async function exportBackup() {
  if (!state.backup.key) { toast('先產生恢復金鑰'); return; }
  const file = await Backup.encrypt({ ...backupPayload(), exportedAt: new Date().toISOString() }, state.backup.key, state.backup.salt);
  const name = `balanza-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const f = new File([blob], name, { type: 'application/json' });
  let done = false;
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], title: 'Balanza 加密備份' }); done = true; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  if (!done) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  prefs.bk.exportAt = Date.now(); savePrefs(); refreshBackupUI();
}
function applyRestore(d) {
  if (!Array.isArray(d.assets) || !Array.isArray(d.debts)) throw new Error('格式不正確');
  state = migrate({ currency: d.currency, assets: d.assets, debts: d.debts, plans: d.plans || [], history: d.history || [], bills: d.bills || [], ai: state.ai, backup: state.backup });
  lastLv = null; levelsKey = '';
  save();
}
async function askKeyAndDecrypt(file) {
  if (state.backup.key) { try { return await Backup.decrypt(file, state.backup.key); } catch (e) { /* 試使用者輸入的 */ } }
  const k = Backup.normKey(prompt('這是加密備份，請輸入恢復金鑰（25 碼）'));
  if (!k) throw new Error('恢復金鑰格式不對');
  return Backup.decrypt(file, k);
}
$('importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    let d = JSON.parse(await file.text());
    if (Backup.isEncrypted(d)) d = await askKeyAndDecrypt(d);
    if (!Array.isArray(d.assets) || !Array.isArray(d.debts)) throw new Error('格式不正確');
    if (!confirm(`匯入 ${d.assets.length} 筆資產、${d.debts.length} 筆負債？目前資料將被取代。`)) return;
    applyRestore(d);
    toast('匯入完成');
  } catch (err) {
    alert('匯入失敗：' + err.message);
  } finally {
    e.target.value = '';
  }
});

// 從雲端還原
function openRestore() {
  $('rsToken').value = state.backup.token || '';
  $('rsKey').value = state.backup.key || '';
  $('rsMsg').textContent = ''; $('rsList').innerHTML = '';
  $('restoreDialog').showModal();
}
let rsCtx = null;
$('rsFind').addEventListener('click', async () => {
  const token = $('rsToken').value.trim(), key = Backup.normKey($('rsKey').value);
  if (!token) return toast('請輸入 GitHub token');
  if (!key) return toast('恢復金鑰格式不對（25 碼英數字）');
  $('rsMsg').textContent = '尋找中…'; $('rsList').innerHTML = '';
  try {
    const login = await Backup.whoami(token);
    const gistId = state.backup.token === token && state.backup.gistId ? state.backup.gistId : await Backup.findGist(token);
    if (!gistId) throw new Error(`帳號 ${login} 裡找不到 Balanza 備份`);
    const hist = await Backup.history(token, gistId);
    rsCtx = { token, key, gistId, login };
    $('rsMsg').textContent = `找到 ${hist.length} 個版本`;
    $('rsList').innerHTML = `<div class="rs-list">${hist.map((h, i) => `<button type="button" class="rs-row" data-sha="${esc(h.sha)}"><b>${new Date(h.at).toLocaleString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</b><small>${i === 0 ? '最新' : ''}</small><i>還原 ›</i></button>`).join('')}</div>`;
  } catch (e) { $('rsMsg').innerHTML = `<span class="neg">${esc(e.message)}</span>`; }
});
$('rsList').addEventListener('click', async e => {
  const r = e.target.closest('[data-sha]');
  if (!r || !rsCtx) return;
  $('rsMsg').textContent = '下載並解密中…';
  try {
    const file = await Backup.download(rsCtx.token, rsCtx.gistId, r.dataset.sha);
    const d = await Backup.decrypt(file, rsCtx.key);
    if (!confirm(`還原 ${r.querySelector('b').textContent} 的備份：${d.assets.length} 筆資產、${d.debts.length} 筆負債？目前這支手機的資料會被取代。`)) { $('rsMsg').textContent = ''; return; }
    state.backup = { ...state.backup, on: true, token: rsCtx.token, key: rsCtx.key, salt: file.salt, gistId: rsCtx.gistId, login: rsCtx.login };
    prefs.bk.hash = ''; savePrefs();
    applyRestore(d);
    $('restoreDialog').close();
    toast('還原完成，自動備份已開啟');
    refreshBackupUI();
  } catch (err) { $('rsMsg').innerHTML = `<span class="neg">${esc(err.message)}</span>`; }
});
$('rsCancel').addEventListener('click', () => $('restoreDialog').close());

document.addEventListener('click', async e => {
  const t = e.target.closest('#bkMakeKey, #bkNewKey, #bkShowKey, #bkConnect, #bkNow, #bkOff, #bkRestore, #exportBtn, #importBtn, #bkNagGo, #bkNagLater, #bkNagKey');
  if (!t) return;
  const b = state.backup;
  switch (t.id) {
    case 'bkMakeKey':
    case 'bkNewKey': {
      if (t.id === 'bkNewKey' && !confirm('換新的恢復金鑰？之後的備份改用新金鑰加密；以前匯出的檔案和雲端的舊版本仍然要用舊金鑰才能打開。')) return;
      const salt = crypto.getRandomValues(new Uint8Array(16));
      b.key = Backup.newKey(); b.salt = btoa(String.fromCharCode(...salt));
      prefs.bk.hash = ''; savePrefs();
      store(); renderBackupSettings(); showKey(true);
      scheduleBackup(1000);
      break;
    }
    case 'bkShowKey': showKey(false); break;
    case 'bkConnect': {
      const token = $('bkToken').value.trim();
      if (!/^(ghp_|github_pat_|gho_)[A-Za-z0-9_]{20,}$/.test(token)) return toast('token 應該是 ghp_ 開頭');
      $('bkMsg').textContent = '連線中…';
      try {
        const login = await Backup.whoami(token);
        const gistId = await Backup.findGist(token);
        if (gistId && !confirm(`帳號 ${login} 裡已經有一份 Balanza 備份。要用這支手機的資料繼續備份到同一個地方嗎？（舊版本會保留在歷史裡；要拿舊資料回來請選取消，再按「從雲端還原」）`)) { $('bkMsg').textContent = ''; return; }
        Object.assign(b, { on: true, token, login, gistId });
        prefs.bk = { ...prefs.bk, hash: '', err: '' }; savePrefs();
        store(); renderBackupSettings('uploading');
        const ok = await runBackup(true);
        toast(ok ? '自動備份已開啟，第一次備份完成' : '自動備份已開啟');
        prefs.bk.savedAt = 0; savePrefs(); showKey(true);   // token 只會顯示一次：馬上請使用者連同恢復金鑰一起存好
      } catch (err) { $('bkMsg').innerHTML = `<span class="neg">${esc(err.message)}</span>`; }
      break;
    }
    case 'bkNow': { const ok = await runBackup(true); toast(ok ? '已備份' : '備份失敗：' + prefs.bk.err); break; }
    case 'bkOff':
      if (!confirm('停用自動備份？雲端已有的備份會保留（要刪除請到 gist.github.com）。')) return;
      Object.assign(b, { on: false, token: '' }); store(); refreshBackupUI(); break;
    case 'bkRestore': openRestore(); break;
    case 'exportBtn': try { await exportBackup(); } catch (err) { alert('匯出失敗：' + err.message); } break;
    case 'importBtn': $('importFile').click(); break;
    case 'bkNagGo': showView('settings'); openSetPage('backup'); break;
    case 'bkNagKey': showKey(false); break;
    case 'bkNagLater': prefs.bk.snooze = Date.now(); savePrefs(); renderBkNag(); break;
  }
});

// 總覽的備份提醒：有資料、沒開自動備份、超過 14 天沒匯出
function renderBkNag() {
  const el = $('bkNag'); if (!el) return;
  const hasData = state.assets.length || state.debts.length;
  const DAY = 864e5;
  const show = !locked && hasData && !state.backup.on && Date.now() - prefs.bk.exportAt > 14 * DAY && Date.now() - prefs.bk.snooze > 7 * DAY;
  const fail = !locked && state.backup.on && prefs.bk.err && Date.now() - prefs.bk.at > 2 * DAY;
  const keyNag = !locked && !show && !fail && state.backup.on && keyStale() && Date.now() - prefs.bk.snooze > 7 * DAY;
  if (keyNag) { el.innerHTML = `<div class="bk-nag">${Icon('lock')}<div><b>備份金鑰存好了嗎？</b><small>換手機或重裝 App 時，要用恢復金鑰和 GitHub token 才能還原</small></div>
    <button type="button" class="btn mini primary" id="bkNagKey">查看</button><button type="button" class="nag-x" id="bkNagLater" aria-label="稍後">×</button></div>`; return; }
  el.innerHTML = show || fail ? `<div class="bk-nag">${Icon('warn')}<div><b>${fail ? '自動備份失敗' : '資料還沒有備份'}</b><small>${fail ? esc(prefs.bk.err) : '手機遺失或清除資料就會不見，開啟自動備份就不用再手動按'}</small></div>
    <button type="button" class="btn mini primary" id="bkNagGo">${fail ? '查看' : '設定'}</button>${fail ? '' : '<button type="button" class="nag-x" id="bkNagLater" aria-label="稍後">×</button>'}</div>` : '';
}

$('clearBtn').addEventListener('click', () => {
  if (!confirm('確定清除所有資料？建議先匯出備份。')) return;
  state = migrate({ currency: state.currency, ai: state.ai, backup: state.backup });
  save();
});

$('mascot').addEventListener('click', () => UI.poke($('mascot').querySelector('svg')));
// 回到 App 時重新開始動畫（有些手機在背景會暫停 SVG 動畫）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { lastLv = null; levelsKey = ''; render(); }
});


// ================= Face ID 加密鎖 =================
const afterUnlock = [];
const LOCK_DELAYS = [[0, '立即'], [60, '1 分鐘'], [300, '5 分鐘'], [900, '15 分鐘']];
if (prefs.lockAfter == null) prefs.lockAfter = 0;

// PIN 鍵盤
function pinPad(el, onDone, len = 6) {
  let v = '';
  el.innerHTML = `<div class="pin-dots">${'<i></i>'.repeat(len)}</div>
    <div class="pin-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button type="button" data-k="${k}">${k}</button>`).join('')}</div>`;
  const dots = () => el.querySelectorAll('.pin-dots i').forEach((d, i) => d.classList.toggle('on', i < v.length));
  el.querySelector('.pin-keys').onclick = e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k;
    if (k === '⌫') v = v.slice(0, -1); else if (v.length < len) v += k;
    dots();
    if (v.length === len) { const x = v; setTimeout(() => { v = ''; dots(); onDone(x); }, 120); }
  };
  return { shake() { el.querySelector('.pin-dots').classList.remove('shake'); void el.offsetWidth; el.querySelector('.pin-dots').classList.add('shake'); } };
}

function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(d => d.close()); }

function showLock(auto) {
  closeDialogs();
  const info = Vault.info();
  const lk = $('lockScreen');
  lk.hidden = false;
  document.body.classList.add('is-locked');
  $('lockMascot').innerHTML = UI.mascotSVG(LEVEL_EMPTY);
  $('lockFace').hidden = !info.faceID;
  $('lockMsg').textContent = info.faceID ? '用 Face ID 解鎖，或輸入 PIN' : '輸入 PIN 解鎖';
  $('lockErr').textContent = '';
  $('lockPinWrap').hidden = info.faceID;
  const pad = pinPad($('lockPin'), async pin => {
    $('lockErr').textContent = '解鎖中…';
    try { finishUnlock(await Vault.unlockPIN(pin)); }
    catch (e) { $('lockErr').textContent = e.message; pad.shake(); }
  });
  if (info.faceID && auto) setTimeout(() => tryFaceID(true), 350);
}
async function tryFaceID(silent) {
  $('lockErr').textContent = '';
  try { finishUnlock(await Vault.unlockFaceID()); }
  catch (e) {
    if (!silent || e.name !== 'NotAllowedError') $('lockErr').textContent = e.name === 'NotAllowedError' ? 'Face ID 已取消，可以再按一次或改用 PIN' : e.message;
    $('lockPinWrap').hidden = false;
  }
}
function finishUnlock(plain) {
  try { state = migrate(JSON.parse(plain)); } catch (e) { state = migrate({}); }
  locked = false;
  if (Stocks.ready()) syncPlanEstimates();
  $('lockScreen').classList.add('opening');
  setTimeout(() => { $('lockScreen').hidden = true; $('lockScreen').classList.remove('opening'); document.body.classList.remove('is-locked'); }, 350);
  lastLv = null; levelsKey = '';
  render();
  renderBkNag();
  scheduleBackup(3000);
  afterUnlock.splice(0).forEach(f => f());
}
async function enterSim(kind) {
  const P = Sim.PERSONAS[kind];
  if (!P) return;
  await Stocks.load();
  await Stocks.fundHist(['AGIF-FV1', '18480065']).catch(() => {});
  if (!sim) sim = { kind, real: state };
  sim.kind = kind;
  state = migrate({ ...Sim.build(kind), ai: sim.real.ai, backup: { on: false } });
  syncPlanEstimates();
  const s0 = summary();
  state.history = Sim.history(kind, s0.totalAssets, s0.totalDebts);
  openGroups.clear(); openStocks.clear(); fold.clear(); repayOpen.clear();
  lastLv = null; levelsKey = ''; nwSel = -1; dcSel = -1; Object.keys(donutSel).forEach(k => { donutSel[k] = null; });
  document.body.classList.add('simming');
  renderSimBar();
  showView('home');
  render();
  UI.burst(kind === 'debt' ? 'heart' : 'coin');
}
function exitSim() {
  if (!sim) return;
  state = sim.real; sim = null;
  openGroups.clear();
  lastLv = null; levelsKey = ''; nwSel = -1; dcSel = -1;
  document.body.classList.remove('simming');
  renderSimBar();
  render();
  if (currentView === 'settings') openSetPage(setPage);
  toast('已回到你的資料');
}
function renderSimBar() {
  const el = $('simBar'); if (!el) return;
  if (!sim) { el.hidden = true; el.innerHTML = ''; return; }
  const P = Sim.PERSONAS[sim.kind];
  el.hidden = false;
  el.innerHTML = `<span class="sim-dot"></span><b>模擬</b><span class="sim-tabs">${Object.entries(Sim.PERSONAS).map(([k, v]) => `<button type="button" data-sim="${k}" class="${k === sim.kind ? 'on' : ''}">${esc(v.name)}</button>`).join('')}</span><button type="button" class="sim-exit" id="simExit">結束</button>`;
}
function renderSimSettings() {
  $('simSet').innerHTML = `<p class="muted small">展示用：切換成三種完全不同的人生，看看 App 在各種情況下的樣子。模擬時的資料只在畫面上，<b>不會儲存、不會備份，也不會動到你的資料</b>；按上方的「結束」或重新打開 App 就回到你的資料。</p>
    <div class="sim-cards">${Object.entries(Sim.PERSONAS).map(([k, v]) => `<button type="button" class="sim-card ${k}" data-sim="${k}"><span class="sim-face">${UI.mascotSVG(LEVELS.find(L => L.lv === (k === 'rich' ? 30 : k === 'normal' ? 6 : -18)) || LEVELS[0])}</span><span><b>${esc(v.name)}</b><small>${esc(v.who)}</small><small class="muted">${esc(v.desc)}</small></span></button>`).join('')}</div>
    ${sim ? '<button type="button" class="btn" id="simExit2">結束模擬，回到我的資料</button>' : ''}`;
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-sim], #simExit, #simExit2');
  if (!t) return;
  if (t.dataset.sim) enterSim(t.dataset.sim); else exitSim();
});

function lockNow() {
  if (sim) { state = sim.real; sim = null; document.body.classList.remove('simming'); renderSimBar(); }
  if (typeof stopListening === 'function') stopListening();
  if (!Vault.enabled()) return;
  Vault.lock();
  state = migrate({});
  locked = true;
  clearTimeout(bkTimer); bkTimer = null;
  lastLv = null; levelsKey = '';
  render();
  showLock(false);
}
$('lockFace').addEventListener('click', () => tryFaceID(false));
$('lockUsePin').addEventListener('click', () => { $('lockPinWrap').hidden = false; });

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (!Vault.enabled() || locked) return;
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    if (!prefs.lockAfter) lockNow();
  } else if (hiddenAt && Date.now() - hiddenAt >= prefs.lockAfter * 1000) lockNow();
});

// 設定：啟用／停用／換 PIN
async function renderLockSettings() {
  const info = Vault.info();
  const can = await Vault.platformAvailable();
  const mode = info ? { prf: 'Face ID 加密金鑰（資料只有掃過 Face ID 或輸入 PIN 才解得開）', device: '裝置金鑰加密＋Face ID 門禁（這台裝置不支援 Face ID 金鑰）', pin: 'PIN 加密（沒有使用 Face ID）' }[info.mode] : '';
  $('lockSet').innerHTML = info
    ? `<div class="lock-on">${Icon('lock')}<div><b>已啟用</b><small>${esc(mode)}</small></div></div>
       <span class="flabel">離開 App 多久後自動上鎖</span>
       <div class="seg" id="lockDelay">${LOCK_DELAYS.map(([v, t]) => `<button type="button" data-d="${v}" class="${prefs.lockAfter === v ? 'on' : ''}">${t}</button>`).join('')}</div>
       <div class="btnrow"><button type="button" class="btn" id="lockNowBtn">${Icon.svg('lock', 18)} 立即上鎖</button><button type="button" class="btn" id="pinChange">更換 PIN</button><button type="button" class="btn danger" id="lockOff">停用</button></div>`
    : `<p class="muted">啟用後，資料會加密存在手機裡，打開 App 要用 ${can ? 'Face ID' : 'PIN'} 解鎖。需要先設定 6 位數 PIN 當備用（Face ID 失敗或換手機時用）。</p>
       ${can ? '' : '<p class="small neg">這個瀏覽器偵測不到 Face ID／Touch ID，會只用 PIN 加密。請用 iPhone 主畫面的 App 或 Safari 開啟。</p>'}
       <button type="button" class="btn primary" id="lockOn">${Icon.svg('lock', 18)} 啟用${can ? ' Face ID ' : ' PIN '}鎖</button>`;
}
document.addEventListener('click', async e => {
  const t = e.target.closest('#lockOn, #lockOff, #pinChange, #lockNowBtn, [data-d]');
  if (!t || !t.closest('#lockSet')) return;
  if (t.id === 'lockNowBtn') return lockNow();
  if (t.dataset.d != null) { prefs.lockAfter = +t.dataset.d; savePrefs(); return renderLockSettings(); }
  if (t.id === 'lockOff') {
    if (!confirm('停用後資料會改回未加密的方式存在手機裡，確定？')) return;
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    Vault.disable();
    toast('已停用加密鎖');
    return renderLockSettings();
  }
  if (t.id === 'lockOn' || t.id === 'pinChange') pinSetup(t.id === 'pinChange');
});
function pinSetup(changing) {
  let first = null;
  $('psTitle').innerHTML = `${Icon('lock')} ${changing ? '更換 PIN' : '設定備用 PIN'}`;
  $('psMsg').textContent = '輸入 6 位數 PIN';
  $('psErr').textContent = '';
  const pad = pinPad($('psPad'), async pin => {
    if (!first) { first = pin; $('psMsg').textContent = '再輸入一次確認'; return; }
    if (pin !== first) { first = null; $('psMsg').textContent = '兩次不一樣，請重新輸入'; pad.shake(); return; }
    if (changing) { await Vault.changePIN(pin); $('pinDialog').close(); toast('PIN 已更換'); return; }
    $('psMsg').textContent = '接著請掃 Face ID（可能會掃兩次）';
    try {
      const mode = await Vault.enable(pin, JSON.stringify(state));
      localStorage.removeItem(STORE_KEY);
      $('pinDialog').close();
      UI.burst('heart');
      toast(mode === 'prf' ? '已啟用 Face ID 加密鎖' : mode === 'device' ? '已啟用（裝置金鑰加密＋Face ID）' : '已啟用 PIN 加密鎖');
      renderLockSettings();
    } catch (err) {
      Vault.disable();
      first = null;
      $('psMsg').textContent = '輸入 6 位數 PIN';
      $('psErr').textContent = err.name === 'NotAllowedError' ? 'Face ID 已取消，沒有啟用。可以再試一次。' : '啟用失敗：' + err.message;
    }
  });
  $('pinDialog').showModal();
}
$('psCancel').addEventListener('click', () => $('pinDialog').close());
renderLockSettings();

// ---------- 主畫面 App 模式標記（給 iOS 26 畫面高度修正用，見 style.css） ----------
if (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches) document.documentElement.classList.add('standalone');

// ---------- 畫面尺寸診斷（設定頁最下方） ----------
function viewportDiag() {
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const t = document.querySelector('.tabs').getBoundingClientRect();
  const d = $('vpDiag');
  if (d) d.textContent = `畫面 ${innerWidth}×${innerHeight} · 螢幕 ${screen.width}×${screen.height} · ${standalone ? '主畫面 App' : '瀏覽器'} · 選單底 ${Math.round(t.bottom)}`;
}
['resize', 'orientationchange', 'pageshow'].forEach(ev => window.addEventListener(ev, () => setTimeout(viewportDiag, 300)));
setTimeout(viewportDiag, 500);

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
    if (hasData || locked) afterUnlock.push(() => splashDone.then(() => setTimeout(() => openChangelog(true), 300)));
    else try { localStorage.setItem('balanza.seenVersion', APP_VERSION); } catch (e) { /* ignore */ }
  }
})();
if (locked) { showLock(true); splashOut(); } else afterUnlock.splice(0).forEach(f => f());
// ---- 設定：先列項目，點進去再看內容 ----
const SET_GROUPS = [
  ['安全與隱私', [
    { p: 'lock', ic: 'lock', t: 'Face ID 加密鎖', s: () => Vault.info() ? '已啟用' : '未啟用' },
    { p: 'privacy', ic: 'eye', t: '隱私與縮小顯示', s: () => (prefs.autoHide ? '開啟時自動隱藏金額' : '開啟時顯示金額') + (scaled ? '・縮小顯示中' : '') },
  ]],
  ['一般', [
    { p: 'ai', ic: 'star', t: 'AI 理解', s: () => { const a = state.ai || {}; return !a.on ? '關閉' : AI.keyOf(a) ? (a.provider === 'gemini' ? 'Gemini' : 'Claude') : '尚未設定金鑰（使用內建規則）'; } },
    { p: 'textsize', ic: 'search', t: '文字大小', s: () => (FS[prefs.fs] || FS.m).t.replace('（預設）', '') },
    { p: 'currency', ic: () => (CURRENCIES.find(c => c.v === state.currency) || CURRENCIES[0]).ic, t: '幣別', s: () => (CURRENCIES.find(c => c.v === state.currency) || CURRENCIES[0]).label },
  ]],
  ['資料', [
    { p: 'backup', ic: 'export', t: '備份與還原', s: backupSummary },
    { p: 'stocks', ic: 'chart', t: '股價資料', s: () => { const m = Stocks.info(); return m ? `台股 ${m.tw?.date || '—'}・美股 ${m.us?.date || '—'}` : '尚未載入'; } },
    { p: 'lvr', ic: 'townhouse', t: '實價登錄資料', s: () => lvrSummary },
  ]],
  ['展示', [
    { p: 'sim', ic: 'trophy', t: '模擬人生', s: () => sim ? `模擬中：${Sim.PERSONAS[sim.kind].name}` : '超級富豪・普通人・欠債大王' },
  ]],
  ['關於', [
    { p: 'changelog', ic: 'sprout', t: '更新紀錄', s: () => 'v' + APP_VERSION },
  ]],
  ['', [
    { p: 'danger', ic: 'warn', t: '清除所有資料', s: () => '', cls: 'danger' },
  ]],
];
let lvrSummary = '讀取中…', setPage = '';
function renderSetMenu() {
  $('setMenu').innerHTML = SET_GROUPS.map(([g, items]) => `
    ${g ? `<div class="set-group">${g}</div>` : '<div class="set-gap"></div>'}
    <div class="set-list">${items.map(it => {
      let sub = ''; try { sub = it.s(); } catch (e) { /* ignore */ }
      const ic = typeof it.ic === 'function' ? it.ic() : it.ic;
      return `<button type="button" class="set-row ${it.cls || ''}" data-sp="${it.p}">${Icon(ic)}<span class="set-t"><b>${esc(it.t)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><i class="set-chev">›</i></button>`;
    }).join('')}</div>`).join('');
}
function openSetPage(p) {
  if (p === 'currency') { $('currencyBtn').click(); return; }
  if (p === 'textsize') {
    UI.openPicker({ title: '文字大小', value: prefs.fs || 'm', options: Object.entries(FS).map(([v, x]) => opt(v, x.t, `<span class="fs-demo fs-${v}">字</span>`, v === 's' ? '一頁看到比較多' : v === 'l' ? '字和按鈕都放大，比較好按' : '')) })
      .then(o => { if (!o) return; prefs.fs = o.value; savePrefs(); applyFs(); renderSetMenu(); toast(`文字大小：${FS[o.value].t.replace('（預設）', '')}`); });
    return;
  }
  if (sim && ['backup', 'lock'].includes(p)) { toast('模擬中不能使用，先結束模擬'); p = ''; }
  setPage = p;
  const it = SET_GROUPS.flatMap(g => g[1]).find(x => x.p === p);
  document.querySelectorAll('#view-settings .set-page').forEach(el => { el.hidden = el.dataset.page !== p; });
  $('setMenu').hidden = !!p;
  $('setBack').hidden = !p;
  $('setTitle').innerHTML = p ? `<span class="ic-inline">${Icon.svg(typeof it.ic === 'function' ? it.ic() : it.ic, 26)}</span> ${esc(it.t)}` : `<span class="ic-inline">${Icon.svg('gear', 26)}</span> 設定`;
  if (!p) renderSetMenu();
  if (p === 'privacy') renderPrivacySettings();
  if (p === 'sim') renderSimSettings();
  if (p === 'backup') { renderBackupSettings(); Backup.persist().then(v => { persisted = v; if (setPage === 'backup') renderBackupSettings(); }); }
  const v = $('view-settings'); v.classList.remove('set-in'); void v.offsetWidth; if (p) v.classList.add('set-in');
  document.querySelector('main').scrollTo(0, 0);
}
document.addEventListener('click', e => { const r = e.target.closest('[data-sp]'); if (r) openSetPage(r.dataset.sp); });
$('setBack').addEventListener('click', () => openSetPage(''));

showView('home');
render();
renderBkNag();
if (!locked) scheduleBackup(4000);
Backup.persist().then(v => { persisted = v; });
fetch('data/funds/meta.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(m => {
  if (!m) return;
  fundStatus = `<br><b>基金 ${esc(m.date || '—')} 淨值</b>（境內 ${m.domestic || 0} 檔、境外 ${m.offshore || 0} 檔），每天 21:17、09:47 自動更新`;
  const el = $('stockStatus'); if (el && el.dataset.ok) el.insertAdjacentHTML('beforeend', fundStatus);
}).catch(() => {});
let fundStatus = '';
// 開機畫面：跟 iPhone 啟動圖片一模一樣，接手後天秤輕輕擺動；資料到齊、畫面排好再淡出（至少停 0.7 秒，避免一閃而過）
setTimeout(() => { const sp = $('splash'); if (sp) sp.classList.add('sp-live'); }, 150);   // 從空白開始，字母一個一個浮現
setTimeout(() => { const sp = $('splash'); if (sp && !sp.dataset.out) sp.classList.add('sp-wait'); }, 1900);   // 資料比較慢才顯示載入條
// 字母全部出現、標語浮現後（至少約 1.9 秒），資料到齊：字標飛到左上角變成標題，首頁卡片依序浮上來
function splashOut() {
  const sp = $('splash'); if (!sp) { splashDoneR(); return; } if (sp.dataset.out) return;
  sp.dataset.out = '1';
  const wait = Math.max(0, 1900 - (performance.now() - splashT0));   // 字母出現、標語浮現、天秤找到平衡後再走
  setTimeout(() => requestAnimationFrame(() => splashExit(sp)), wait);
}
function splashExit(sp) {
  const finish = () => { sp.remove(); document.body.classList.remove('sp-flying'); setTimeout(() => document.body.classList.remove('enter'), 900); splashDoneR(); };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wSrc = sp.querySelector('.sp-wm'), h1 = document.querySelector('.top h1');
  if (reduce || locked || currentView !== 'home' || !wSrc || !h1) { sp.classList.add('sp-out'); setTimeout(finish, 550); return; }
  [...document.querySelectorAll('#view-home > *')].forEach((c, i) => c.style.setProperty('--ed', `${200 + i * 70}ms`));
  document.body.classList.add('enter', 'sp-flying');
  // 字標拿出來單獨飛（背景淡出時字不會跟著消失）
  const ws = wSrc.getBoundingClientRect(), hr = h1.getBoundingClientRect();
  const k = (parseFloat(getComputedStyle(h1).fontSize) * 0.9) / ws.height;
  const fw = document.createElement('div'); fw.className = 'sp-fly';
  Object.assign(fw.style, { left: ws.left + 'px', top: ws.top + 'px', width: ws.width + 'px', height: ws.height + 'px', color: getComputedStyle(wSrc).fill });
  fw.innerHTML = wSrc.outerHTML.replace('class="sp-wm"', 'class="sp-wm-fly"');
  document.body.appendChild(fw);
  wSrc.style.visibility = 'hidden';
  sp.classList.add('sp-exit');
  const dx = hr.left - ws.left, dy = hr.top + (hr.height - ws.height * k) / 2 - ws.top;
  fw.animate([
    { transform: 'translate(0,0) scale(1)' },
    { transform: `translate(${dx * .35}px,${dy * .55}px) scale(${1 + (k - 1) * .5})`, offset: .45 },
    { transform: `translate(${dx}px,${dy}px) scale(${k})` },
  ], { duration: 760, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' }).finished.then(() => {
    document.body.classList.remove('sp-flying');   // 標題出現，飛過來的字同時淡掉
    fw.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.then(() => fw.remove());
    finish();
  });
}
setTimeout(splashOut, 4000);   // 保險：最多 4 秒
{
  // 等股價（含美股長尾）與用到的基金淨值都載入，或最多 2.5 秒，再顯示數字
  const needFund = () => state.assets.some(a => mktOf(a) === 'fund' && a.sym) || state.plans.some(p => planStocksOf(p).some(x => x.mkt === 'fund'));
  // 只有持股不在主要清單時才等美股長尾
  const needTail = () => state.assets.some(a => mktOf(a) === 'us' && a.sym && !Stocks.quote('us', a.sym));
  const ready = Stocks.load().then(() => Promise.all([needTail() ? Stocks.tail() : null, needFund() ? Stocks.fundHist([...state.assets.filter(a => mktOf(a) === 'fund' && a.sym).map(a => a.sym), ...state.plans.flatMap(p => planStocksOf(p).filter(x => x.mkt === 'fund').map(x => x.sym))]) : null]));
  Promise.race([ready, new Promise(r => setTimeout(r, 1800))]).catch(() => {}).then(() => {
    if (!locked && syncPlanEstimates()) store();
    booting = false; levelsKey = ''; lastLv = null;
    document.body.classList.remove('booting');
    render(); firstNums = false;
    splashOut();
    // 先用手機裡的股價開起來，背景再抓最新的；有變才平順更新
    Stocks.refresh().then(ch => { if (ch) { levelsKey = ''; if (!locked && syncPlanEstimates()) store(); render(); } });
  });
}
Stocks.load().then(() => {
  // 美股長尾報價（小型股、槓桿 ETF…）背景載入，載完再更新一次
  Stocks.tail().then(ok => { if (ok) { levelsKey = ''; render(); } });
  if (!locked && syncPlanEstimates()) store();
  levelsKey = '';
  render();
  const m = Stocks.info();
  const upd = m && m.updated ? new Date(m.updated).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
  $('stockStatus').dataset.ok = '1';
  $('stockStatus').innerHTML = (m ? `<b>台股 ${esc(m.tw?.date || '—')} 收盤</b>（${m.tw?.n || 0} 檔）、<b>美股 ${esc(m.us?.date || '—')} 收盤</b>（${m.us?.n || 0} 檔）<br>最後更新：${upd}<br>自動更新：週一～五 14:23（台股收盤後）、05:41（美股收盤後）` : '股價資料：尚未產生（GitHub Action 每天收盤後自動更新）') + fundStatus;
  if ($('view-assets').classList.contains('active')) renderAssets(summary());
});
LVR.loadIndex().then(ix => { lvrSummary = `更新到 ${ix.updated.slice(0, 10)}`; if (currentView === 'settings' && !setPage) renderSetMenu(); $('lvrStatus').innerHTML = `<b>成交資料：${esc(ix.seasons[0])}～${esc(ix.seasons.at(-1))}</b><br>最後更新：${esc(ix.updated.slice(0, 10))}<br>自動更新：每週一 03:17（內政部約每 10 天發布一批新成交）`; })
  .catch(() => { lvrSummary = '尚未產生'; $('lvrStatus').textContent = '實價登錄資料：尚未產生（GitHub Action 會自動下載）'; });

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    // 新版說明開著的時候先不要重新整理，等使用者按「我知道了」
    if ($('clDialog').open) pendingReload = true; else location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
}
