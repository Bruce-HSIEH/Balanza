'use strict';
// 貸款試算：寬限期可從任何時間點開始（例如增貸後才申請）、本息平均／本金平均／只繳息
// 寬限期結束後，剩餘本金攤到「剩下的非寬限期期數」重新計算月付

const Loan = (() => {
  const n0 = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
  const ymNum = ym => { const [y, m] = String(ym).split('-').map(Number); return y * 12 + (m - 1); };
  const ymStr = t => `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  const ymAdd = (ym, n) => ymStr(ymNum(ym) + n);
  const ymDiff = (a, b) => ymNum(b) - ymNum(a);       // b 比 a 晚幾個月
  const ymSlash = ym => ym ? ym.replace('-', '/') : '';
  const nowYM = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  // 每月扣款日：有填就用，沒填用撥款日期那一天
  const dueDay = d => Math.round(n0(d.payDay)) || (d.startDate ? Number(String(d.startDate).slice(8, 10)) : 0) || 0;
  const daysIn = ym => { const [y, m] = String(ym).split('-').map(Number); return new Date(y, m, 0).getDate(); };
  // 某個月的扣款日（遇到月底不足就用該月最後一天）
  const dueDate = (ym, day) => { const [y, m] = String(ym).split('-').map(Number); return new Date(y, m - 1, Math.min(day || 1, daysIn(ym))); };

  // 寬限期在第幾期之後開始（0 = 撥款就開始）— 舊資料相容
  const graceOffset = d => (d.graceYM && d.startYM ? Math.max(0, ymDiff(d.startYM, d.graceYM)) : 0);

  // 變更紀錄：撥款後發生的事，ym = 從哪個月的扣款開始生效
  //   grace   {months}  申請寬限期（期間只繳息）
  //   rate    {rate}    利率調整
  //   term    {months}  延長（負數 = 縮短）貸款年限，到期日跟著移動
  //   prepay  {amount}  提前還本（年限不變、月付重算）
  //   balance {amount}  以銀行顯示的剩餘本金為準
  const CHANGE_TYPES = ['grace', 'rate', 'term', 'prepay', 'balance'];
  function changesOf(d) {
    const list = (Array.isArray(d.changes) ? d.changes : []).filter(c => c && c.ym && CHANGE_TYPES.includes(c.type));
    // 舊欄位：graceYM＋grace 視為一筆「申請寬限期」
    if (d.graceYM && n0(d.grace) > 0) list.push({ ym: d.graceYM, type: 'grace', months: n0(d.grace), legacy: true });
    return list.slice().sort((x, y) => ymDiff(y.ym, x.ym));
  }

  // 第 i 期（1 起算）在 startYM + i 月繳款
  function schedule(d) {
    const P = n0(d.principal);
    let r = n0(d.rate) / 100 / 12, n = Math.round(n0(d.years) * 12);
    const method = d.method || 'annuity';
    const rows = [];
    if (P <= 0 || n <= 0 || !d.startYM) return rows;
    // 撥款就開始的寬限期
    const windows = [];
    const g0 = d.graceYM ? 0 : Math.max(0, Math.round(n0(d.grace)));
    if (g0) windows.push([1, g0]);
    // 依生效期數分組
    const byPeriod = new Map();
    for (const c of changesOf(d)) {
      const i = Math.max(1, ymDiff(d.startYM, c.ym));
      if (!byPeriod.has(i)) byPeriod.set(i, []);
      byPeriod.get(i).push(c);
    }
    let bal = P;
    for (let i = 1; i <= n && i <= 1200; i++) {
      const applied = [];
      for (const c of byPeriod.get(i) || []) {
        if (c.type === 'rate') r = n0(c.rate) / 100 / 12;
        else if (c.type === 'term') n = Math.max(i, n + Math.round(n0(c.months)));
        else if (c.type === 'prepay') bal = Math.max(0, bal - n0(c.amount));
        else if (c.type === 'balance') bal = Math.max(0, n0(c.amount));
        else if (c.type === 'grace') { const m = Math.round(n0(c.months)); if (m > 0) windows.push([i, i + m - 1]); }
        applied.push(c);
      }
      if (bal <= 0.5 && !applied.length) break;
      const interest = bal * r;
      const inGrace = windows.some(([a, b]) => i >= a && i <= b);
      let prin = 0;
      if (method === 'interest') prin = i === n ? bal : 0;
      else if (!inGrace) {
        const rem = n - i + 1;   // 到期前剩下的期數（寬限期結束後重新攤還）
        if (method === 'principal') prin = bal / rem;
        else prin = (r === 0 ? bal / rem : bal * r / (1 - Math.pow(1 + r, -rem))) - interest;
      }
      prin = Math.min(Math.max(prin, 0), bal);
      bal -= prin;
      rows.push({ i, ym: ymAdd(d.startYM, i), interest, principal: prin, pay: interest + prin, balance: Math.max(0, bal), grace: inGrace, rate: r * 1200, changes: applied.length ? applied : null });
      if (bal <= 0.5 && i < n && method !== 'interest') break;
    }
    return rows;
  }

  // 寬限期區段：[{from, to}]（rows 的索引）
  function graceRuns(rows) {
    const out = [];
    rows.forEach((x, k) => {
      if (!x.grace) return;
      if (k && rows[k - 1].grace) out[out.length - 1].to = k; else out.push({ from: k, to: k });
    });
    return out;
  }

  // 從 'YYYY-MM' 起算到今天已繳幾期（未到扣款日則本月尚未扣）
  function paidPeriods(startYM, payDay, today = new Date()) {
    if (!startYM) return 0;
    let k = ymDiff(startYM, nowYM(today));
    if (payDay && today.getDate() < Math.min(payDay, daysIn(nowYM(today)))) k -= 1;
    return Math.max(0, k);
  }

  function autoStatus(d, today = new Date()) {
    const rows = schedule(d);
    const n = rows.length;
    if (!n) return null;
    const k = Math.min(paidPeriods(d.startYM, dueDay(d), today), n);
    const balance = k === 0 ? n0(d.principal) : rows[k - 1].balance;
    const next = rows[k] || null;
    const runs = graceRuns(rows);
    const cur = runs.find(g => g.from <= k && g.to >= k);           // 正在寬限期
    const up = runs.find(g => g.from > k);                           // 之後的寬限期
    const g = cur || up;
    const remaining = rows.slice(k);
    const rateNow = next ? next.rate : n0(d.rate);
    return {
      balance,
      monthly: next ? next.pay : 0,
      inGrace: !!cur, graceUpcoming: !cur && !!up,
      graceLeft: cur ? cur.to - k + 1 : 0,
      graceStartYM: g ? ymSlash(rows[g.from].ym) : null,
      graceEndYM: g ? ymSlash(rows[g.to].ym) : null,
      afterGracePay: g && rows[g.to + 1] ? rows[g.to + 1].pay : 0,
      monthsLeft: remaining.length,
      interestLeft: remaining.reduce((s, x) => s + x.interest, 0),
      payoffYM: ymSlash(rows[n - 1].ym),
      paid: k, total: n,
      rate: rateNow,
      monthlyInterest: balance * rateNow / 100 / 12,
    };
  }

  function manualStatus(d, today = new Date()) {
    const B = n0(d.balance), P = n0(d.monthly), r = n0(d.rate) / 100 / 12;
    const base = { balance: B, monthly: P, inGrace: false, graceLeft: 0, monthlyInterest: B * r };
    const cur = nowYM(today);
    if (B <= 0) return { ...base, monthsLeft: 0, interestLeft: 0, payoffYM: '已還清' };
    if (P <= 0 || P <= B * r) return { ...base, monthsLeft: Infinity, interestLeft: Infinity, payoffYM: null };
    const n = r === 0 ? B / P : -Math.log(1 - r * B / P) / Math.log(1 + r);
    const months = Math.ceil(n);
    return { ...base, monthsLeft: months, interestLeft: Math.max(0, n * P - B), payoffYM: ymSlash(ymAdd(cur, months)) };
  }

  return { dueDay, dueDate, daysIn, schedule, graceRuns, changesOf, CHANGE_TYPES, autoStatus, manualStatus, paidPeriods, graceOffset, ymAdd, ymDiff, ymNum, ymStr, ymSlash, nowYM };
})();

if (typeof module !== 'undefined') module.exports = Loan;
