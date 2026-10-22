'use strict';

const APP_VERSION = '1.0.0';
const STORE_KEY = 'balanza.v1';

const ASSET_CATS = ['現金/存款', '股票', 'ETF/基金', '債券', '加密貨幣', '保險', '不動產', '車輛', '其他'];
const DEBT_TYPES = ['房貸', '信貸', '車貸', '學貸', '信用卡', '親友借款', '其他'];

// ---------- 資料 ----------
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { currency: 'TWD', assets: [], debts: [], ...d };
    }
  } catch (e) { /* ignore */ }
  return { currency: 'TWD', assets: [], debts: [] };
}
let state = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { alert('儲存失敗：' + e.message); }
  render();
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

// ---------- 格式 ----------
function fmt(n) {
  const digits = state.currency === 'JPY' || state.currency === 'TWD' ? 0 : 2;
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: state.currency, maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n || 0);
}
const pct = n => (n || 0).toFixed(2).replace(/\.?0+$/, '') + '%';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 計算 ----------
// 以本息平均攤還估算剩餘期數
function payoff(d) {
  const B = num(d.balance), P = num(d.monthly), r = num(d.rate) / 100 / 12;
  if (B <= 0) return { months: 0, interest: 0 };
  if (P <= 0) return { months: Infinity, interest: Infinity };
  if (r === 0) return { months: Math.ceil(B / P), interest: 0 };
  if (P <= B * r) return { months: Infinity, interest: Infinity };
  const n = -Math.log(1 - (r * B) / P) / Math.log(1 + r);
  const months = Math.ceil(n);
  return { months, interest: Math.max(0, n * P - B) };
}

function addMonths(m) {
  const d = new Date();
  d.setMonth(d.getMonth() + m);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function summary() {
  const totalAssets = state.assets.reduce((s, a) => s + num(a.amount), 0);
  const totalDebts = state.debts.reduce((s, d) => s + num(d.balance), 0);
  const monthlyPay = state.debts.reduce((s, d) => s + num(d.monthly), 0);
  const monthlyInterest = state.debts.reduce((s, d) => s + num(d.balance) * num(d.rate) / 100 / 12, 0);
  const avgRate = totalDebts > 0 ? state.debts.reduce((s, d) => s + num(d.balance) * num(d.rate), 0) / totalDebts : 0;
  return {
    totalAssets, totalDebts, monthlyPay, monthlyInterest, avgRate,
    netWorth: totalAssets - totalDebts,
    debtRatio: totalAssets > 0 ? totalDebts / totalAssets * 100 : 0,
    monthlyPrincipal: Math.max(0, monthlyPay - monthlyInterest),
  };
}

function groupSum(items, keyFn, valFn) {
  const m = new Map();
  for (const it of items) { const k = keyFn(it) || '未分類'; m.set(k, (m.get(k) || 0) + valFn(it)); }
  return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}

function barsHTML(rows, extra) {
  if (!rows.length) return '<div class="empty">尚無資料</div>';
  const max = rows[0][1], total = rows.reduce((s, r) => s + r[1], 0);
  return rows.map(([k, v]) => `
    <div class="bar">
      <div class="bar-top"><span>${esc(k)}</span><span>${fmt(v)} · ${(v / total * 100).toFixed(0)}%${extra ? extra(k) : ''}</span></div>
      <div class="track"><div class="fill" style="width:${(v / max * 100).toFixed(1)}%"></div></div>
    </div>`).join('');
}

// ---------- 畫面 ----------
const $ = id => document.getElementById(id);

function render() {
  const s = summary();
  $('netWorth').textContent = fmt(s.netWorth);
  $('netWorth').className = 'big ' + (s.netWorth < 0 ? 'neg' : '');
  $('totalAssets').textContent = fmt(s.totalAssets);
  $('totalDebts').textContent = fmt(s.totalDebts);
  $('debtRatio').textContent = pct(s.debtRatio);
  $('monthlyPay').textContent = fmt(s.monthlyPay);
  $('avgRate').textContent = pct(s.avgRate);
  $('monthlyInterest').textContent = fmt(s.monthlyInterest);
  $('monthlyPrincipal').textContent = fmt(s.monthlyPrincipal);

  // 負債來源（依機構/債權人），附該來源每月還款
  const paidBySource = groupSum(state.debts, d => d.source, d => num(d.monthly));
  const payMap = new Map(paidBySource);
  $('debtBySource').innerHTML = barsHTML(
    groupSum(state.debts, d => d.source, d => num(d.balance)),
    k => payMap.get(k) ? `<br><small>月付 ${fmt(payMap.get(k))}</small>` : ''
  );
  $('assetByCat').innerHTML = barsHTML(groupSum(state.assets, a => a.category, a => num(a.amount)));

  // 還款時程
  const debts = [...state.debts].filter(d => num(d.balance) > 0)
    .map(d => ({ d, p: payoff(d) }))
    .sort((a, b) => a.p.months - b.p.months);
  $('payoffList').innerHTML = debts.length ? debts.map(({ d, p }) => {
    const done = isFinite(p.months)
      ? `<div>${addMonths(p.months)} 還清</div><div class="sub">約 ${p.months} 期 · 剩餘利息 ${fmt(p.interest)}</div>`
      : `<div class="neg">月付不足以還清</div><div class="sub">月付低於每月利息</div>`;
    return `<div class="payoff"><div><div>${esc(d.name)}</div><div class="sub">${esc(d.source || '')} · ${pct(num(d.rate))}</div></div><div class="r">${done}</div></div>`;
  }).join('') : '<div class="empty">尚無負債</div>';

  // 資產清單
  const assets = [...state.assets].sort((a, b) => num(b.amount) - num(a.amount));
  $('assetsSum').textContent = fmt(s.totalAssets);
  $('assetList').innerHTML = assets.length ? assets.map(a => `
    <li data-edit="asset" data-id="${a.id}">
      <div><div class="name">${esc(a.name)}</div><div class="sub">${esc(a.category)}${a.note ? ' · ' + esc(a.note) : ''}</div></div>
      <div class="amt pos">${fmt(num(a.amount))}</div>
    </li>`).join('') : '<div class="empty">點右下角 ＋ 新增第一筆資產</div>';

  // 負債清單
  const ds = [...state.debts].sort((a, b) => num(b.rate) - num(a.rate));
  $('debtsSum').textContent = fmt(s.totalDebts);
  $('debtList').innerHTML = ds.length ? ds.map(d => `
    <li data-edit="debt" data-id="${d.id}">
      <div><div class="name">${esc(d.name)}</div><div class="sub">${esc(d.type)} · ${esc(d.source || '—')} · 年利率 ${pct(num(d.rate))}</div></div>
      <div class="amt neg">${fmt(num(d.balance))}<div class="sub">月付 ${fmt(num(d.monthly))}</div></div>
    </li>`).join('') : '<div class="empty">點右下角 ＋ 新增第一筆負債</div>';

  $('currency').value = state.currency;
}

// ---------- 分頁 ----------
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + b.dataset.view));
  window.scrollTo(0, 0);
}));

// ---------- 編輯器 ----------
const FIELDS = {
  asset: [
    { k: 'name', label: '名稱', type: 'text', req: true, ph: '例：玉山活存' },
    { k: 'category', label: '類別', type: 'select', opts: ASSET_CATS },
    { k: 'amount', label: '目前價值', type: 'number', req: true },
    { k: 'note', label: '備註', type: 'text' },
  ],
  debt: [
    { k: 'name', label: '名稱', type: 'text', req: true, ph: '例：房貸' },
    { k: 'type', label: '類型', type: 'select', opts: DEBT_TYPES },
    { k: 'source', label: '負債來源（銀行/債權人）', type: 'text', req: true, ph: '例：國泰世華' },
    { k: 'balance', label: '剩餘本金', type: 'number', req: true },
    { k: 'rate', label: '年利率 (%)', type: 'number', step: '0.01', req: true },
    { k: 'monthly', label: '每月還款', type: 'number', req: true },
    { k: 'payDay', label: '每月扣款日', type: 'number', min: 1, max: 31 },
    { k: 'note', label: '備註', type: 'text' },
  ],
};
let editing = null;

function openEditor(kind, id) {
  const list = kind === 'asset' ? state.assets : state.debts;
  const item = id ? list.find(x => x.id === id) : {};
  editing = { kind, id };
  $('editTitle').textContent = (id ? '編輯' : '新增') + (kind === 'asset' ? '資產' : '負債');
  $('delBtn').style.display = id ? '' : 'none';
  $('editFields').innerHTML = FIELDS[kind].map(f => {
    const v = item[f.k] ?? '';
    if (f.type === 'select') {
      return `<label class="field">${f.label}<select name="${f.k}">${f.opts.map(o => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select></label>`;
    }
    const attrs = f.type === 'number'
      ? `inputmode="decimal" step="${f.step || 'any'}"${f.min ? ` min="${f.min}"` : ''}${f.max ? ` max="${f.max}"` : ''}`
      : '';
    return `<label class="field">${f.label}<input name="${f.k}" type="${f.type}" ${attrs} value="${esc(v)}" placeholder="${esc(f.ph || '')}"${f.req ? ' required' : ''}></label>`;
  }).join('');
  $('editor').showModal();
}

document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) return openEditor(add.dataset.add);
  const li = e.target.closest('[data-edit]');
  if (li) return openEditor(li.dataset.edit, li.dataset.id);
});

$('editForm').addEventListener('submit', e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const obj = {};
  for (const f of FIELDS[editing.kind]) {
    const v = fd.get(f.k);
    obj[f.k] = f.type === 'number' ? (v === '' ? '' : num(v)) : String(v || '').trim();
  }
  obj.updatedAt = new Date().toISOString();
  const key = editing.kind === 'asset' ? 'assets' : 'debts';
  if (editing.id) {
    state[key] = state[key].map(x => x.id === editing.id ? { ...x, ...obj } : x);
  } else {
    state[key].push({ id: uid(), ...obj });
  }
  $('editor').close();
  save();
});
$('cancelBtn').addEventListener('click', () => $('editor').close());
$('delBtn').addEventListener('click', () => {
  if (!confirm('確定刪除這筆？')) return;
  const key = editing.kind === 'asset' ? 'assets' : 'debts';
  state[key] = state[key].filter(x => x.id !== editing.id);
  $('editor').close();
  save();
});

// ---------- 設定 ----------
$('currency').addEventListener('change', e => { state.currency = e.target.value; save(); });

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
    state = { currency: d.currency || 'TWD', assets: d.assets, debts: d.debts };
    save();
    alert('匯入完成');
  } catch (err) {
    alert('匯入失敗：' + err.message);
  } finally {
    e.target.value = '';
  }
});

$('clearBtn').addEventListener('click', () => {
  if (!confirm('確定清除所有資料？建議先匯出備份。')) return;
  state = { currency: state.currency, assets: [], debts: [] };
  save();
});

// ---------- 啟動 ----------
$('ver').textContent = 'v' + APP_VERSION;
render();

if ('serviceWorker' in navigator) {
  // 只有「原本就有舊版在控制」時，新版接手才重新整理（首次安裝不重整）
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
}
