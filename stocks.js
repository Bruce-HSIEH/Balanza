'use strict';
// 股價：讀取 GitHub Action 每天產生的 data/stocks/*.json（台股收盤、美股收盤、匯率）
// 你的持股只存在手機裡，App 下載的是整個市場的公開報價檔

const Stocks = (() => {
  const data = { tw: null, us: null, meta: null, usall: null };
  let tailP = null;
  let loading = null;

  async function getJSON(path) {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }

  function load() {
    if (loading) return loading;
    loading = Promise.allSettled([getJSON('data/stocks/tw.json'), getJSON('data/stocks/us.json'), getJSON('data/stocks/meta.json')])
      .then(([tw, us, meta]) => {
        data.tw = tw.status === 'fulfilled' ? tw.value : null;
        data.us = us.status === 'fulfilled' ? us.value : null;
        data.meta = meta.status === 'fulfilled' ? meta.value : null;
        return data;
      });
    return loading;
  }

  // 美股長尾（NASDAQ／NYSE 全部上市，只有最近收盤）：背景載入
  function tail() {
    if (tailP) return tailP;
    tailP = getJSON('data/stocks/us-all.json').then(j => { data.usall = j; return true; }).catch(() => false);
    return tailP;
  }
  const norm = (mkt, sym) => {
    sym = String(sym || '').trim().toUpperCase();
    return mkt === 'us' ? sym.replace(/\./g, '-') : sym;
  };

  function quote(mkt, sym) {
    const D = data[mkt];
    const k = norm(mkt, sym);
    let row = D && D.s[k], date = D && D.date;
    if (!row && mkt === 'us' && data.usall) { row = data.usall.s[k]; date = data.usall.date; }
    if (!row) return null;
    const [name, closes, rowDate] = row;
    const series = closes.filter(v => v != null);
    if (!series.length) return null;
    const price = series.at(-1), prev = series.length > 1 ? series.at(-2) : price;
    return {
      sym: k, name, price, prev,
      chg: price - prev, chgPct: prev ? (price - prev) / prev * 100 : 0,
      series: series.slice(-30), date: rowDate || date,
      ccy: mkt === 'us' ? 'USD' : 'TWD',
    };
  }

  function list(mkt) {
    const D = data[mkt];
    if (!D) return [];
    const all = mkt === 'us' && data.usall ? { ...data.usall.s, ...D.s } : D.s;
    return Object.entries(all).map(([k, [name, closes]]) => {
      const s = closes.filter(v => v != null);
      return { sym: k, name, price: s.at(-1), series: s.slice(-20) };
    });
  }

  // 1 單位 from 幣別 = ? 單位 to 幣別
  function fx(from, to) {
    if (from === to) return 1;
    const r = (data.meta && data.meta.fx) || { TWD: 1, USD: 32, JPY: 0.21, EUR: 35 };
    const a = r[from], b = r[to];
    return a && b ? a / b : 1;
  }

  const ready = () => !!(data.tw || data.us);
  const info = () => data.meta;

  return { load, tail, quote, list, fx, ready, info, norm };
})();
