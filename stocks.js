'use strict';
// 股價：讀取 GitHub Action 每天產生的 data/stocks/*.json（台股收盤、美股收盤、匯率）
// 你的持股只存在手機裡，App 下載的是整個市場的公開報價檔

const Stocks = (() => {
  const data = { tw: null, us: null, meta: null, usall: null, fund: null, fhist: {} };
  let fundP = null; const histP = {};
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
  // 基金：境內（投信投顧公會）＋境外（集保）每日淨值；清單用到才下載，走勢依代碼分檔，只抓用到的
  function funds() {
    if (fundP) return fundP;
    fundP = getJSON('data/funds/list.json').then(j => { data.fund = j; return true; }).catch(() => { fundP = null; return false; });
    return fundP;
  }
  const shardOf = code => [...String(code)].reduce((t, c) => t + c.charCodeAt(0), 0) % ((data.fund && data.fund.shards) || 64);
  async function fundHist(codes) {
    await funds();
    const need = [...new Set(codes.filter(Boolean).map(c => shardOf(norm('fund', c))))];
    await Promise.all(need.map(i => histP[i] || (histP[i] = getJSON(`data/funds/hist/${String(i).padStart(2, '0')}.json`).then(j => { data.fhist[i] = j; }).catch(() => { delete histP[i]; }))));
  }
  function fundQuote(code) {
    const k = norm('fund', code), row = data.fund && data.fund.s[k];
    if (!row) return null;
    const [name, ccy, nav, prev0, date, org, co] = row;
    const h = (data.fhist[shardOf(k)] || {})[k];
    const series = h && h.length > 1 ? h.map(x => x[1]) : [prev0, nav];
    const dates = h && h.length > 1 ? h.map(x => { const t = String(x[0]); return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6)}`; }) : null;
    const prev = prev0 || nav;
    return { sym: k, name, price: nav, prev, chg: nav - prev, chgPct: prev ? (nav - prev) / prev * 100 : 0, series, dates, date, ccy: ccy || 'TWD', org, co, fund: true };
  }
  const fundReady = () => !!data.fund;

  const norm = (mkt, sym) => {
    sym = String(sym || '').trim().toUpperCase();
    return mkt === 'us' ? sym.replace(/\./g, '-') : sym;
  };

  function quote(mkt, sym) {
    if (mkt === 'fund') return fundQuote(sym);
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
    if (mkt === 'fund') return data.fund ? Object.entries(data.fund.s).map(([k, r]) => ({ sym: k, name: r[0], ccy: r[1], price: r[2], prev: r[3], date: r[4], org: r[5], co: r[6], series: [] })) : [];
    const D = data[mkt];
    if (!D) return [];
    const all = mkt === 'us' && data.usall ? { ...data.usall.s, ...D.s } : D.s;
    return Object.entries(all).map(([k, [name, closes]]) => {
      const s = closes.filter(v => v != null);
      return { sym: k, name, price: s.at(-1), series: s.slice(-20) };
    });
  }

  // 匯率還沒載入或缺幣別時的概略值（只用來避免算成 1:1）
  const FX0 = { TWD: 1, USD: 32, JPY: 0.21, EUR: 35, CNY: 4.5, AUD: 21, ZAR: 1.8, GBP: 42, HKD: 4.1, CHF: 40, SGD: 25, NZD: 19, CAD: 23 };
  // 1 單位 from 幣別 = ? 單位 to 幣別
  function fx(from, to) {
    if (from === to) return 1;
    const r = { ...FX0, ...((data.meta && data.meta.fx) || {}) };
    const a = r[from], b = r[to];
    return a && b ? a / b : 1;
  }

  const ready = () => !!(data.tw || data.us);
  const info = () => data.meta;

  const fundInfo = () => data.fund ? { date: data.fund.date, n: data.fund.n } : null;
  return { load, tail, quote, list, fx, ready, info, norm, funds, fundHist, fundReady, fundInfo };
})();
