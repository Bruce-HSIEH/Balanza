'use strict';
// 股價：讀取 GitHub Action 每天產生的 data/stocks/*.json（台股收盤、美股收盤、匯率）
// 你的持股只存在手機裡，App 下載的是整個市場的公開報價檔

const Stocks = (() => {
  const data = { tw: null, us: null, meta: null };
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

  const norm = (mkt, sym) => {
    sym = String(sym || '').trim().toUpperCase();
    return mkt === 'us' ? sym.replace(/\./g, '-') : sym;
  };

  function quote(mkt, sym) {
    const D = data[mkt];
    if (!D) return null;
    const k = norm(mkt, sym);
    const row = D.s[k];
    if (!row) return null;
    const [name, closes, rowDate] = row;
    const series = closes.filter(v => v != null);
    if (!series.length) return null;
    const price = series.at(-1), prev = series.length > 1 ? series.at(-2) : price;
    return {
      sym: k, name, price, prev,
      chg: price - prev, chgPct: prev ? (price - prev) / prev * 100 : 0,
      series: series.slice(-30), date: rowDate || D.date,
      ccy: mkt === 'us' ? 'USD' : 'TWD',
    };
  }

  function list(mkt) {
    const D = data[mkt];
    if (!D) return [];
    return Object.entries(D.s).map(([k, [name, closes]]) => {
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

  return { load, quote, list, fx, ready, info, norm };
})();
