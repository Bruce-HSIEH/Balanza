'use strict';
// 貸款試算：支援寬限期、本息平均／本金平均／只繳息

const Loan = (() => {
  const n0 = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };

  // 從 'YYYY-MM' 起算到今天已繳幾期（第一期在撥款後一個月；未到扣款日則本月尚未扣）
  function paidPeriods(startYM, payDay, today = new Date()) {
    if (!startYM) return 0;
    const [y, m] = startYM.split('-').map(Number);
    let k = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m);
    if (payDay && today.getDate() < payDay) k -= 1;
    return Math.max(0, k);
  }

  function ymAdd(startYM, months) {
    const [y, m] = startYM.split('-').map(Number);
    const t = y * 12 + (m - 1) + months;
    return `${Math.floor(t / 12)}/${String((t % 12) + 1).padStart(2, '0')}`;
  }

  // 產生完整攤還表
  function schedule({ principal, rate, years, grace = 0, method = 'annuity' }) {
    const P = n0(principal), r = n0(rate) / 100 / 12, n = Math.round(n0(years) * 12), g = Math.min(Math.max(0, Math.round(n0(grace))), n);
    const rows = [];
    if (P <= 0 || n <= 0) return rows;
    let bal = P;
    const m = n - g;
    const annuity = m > 0 ? (r === 0 ? P / m : P * r / (1 - Math.pow(1 + r, -m))) : 0;
    for (let i = 1; i <= n; i++) {
      const interest = bal * r;
      let principalPart;
      if (method === 'interest') principalPart = i === n ? bal : 0;
      else if (i <= g) principalPart = 0;
      else if (method === 'principal') principalPart = P / m;
      else principalPart = annuity - interest;
      principalPart = Math.min(principalPart, bal);
      bal -= principalPart;
      rows.push({ i, interest, principal: principalPart, pay: interest + principalPart, balance: Math.max(0, bal), grace: i <= g });
    }
    return rows;
  }

  // 自動模式：依今天日期推算現況
  function autoStatus(d, today = new Date()) {
    const rows = schedule(d);
    const n = rows.length;
    if (!n) return null;
    const k = Math.min(paidPeriods(d.startYM, n0(d.payDay), today), n);
    const balance = k === 0 ? n0(d.principal) : rows[k - 1].balance;
    const next = rows[k] || null;
    const g = Math.round(n0(d.grace));
    const graceLeft = Math.max(0, g - k);
    const afterGrace = rows[g] || null; // 寬限期後第一期
    const remaining = rows.slice(k);
    return {
      balance,
      monthly: next ? next.pay : 0,
      inGrace: graceLeft > 0,
      graceLeft,
      graceEndYM: g ? ymAdd(d.startYM, g) : null,
      afterGracePay: afterGrace ? afterGrace.pay : 0,
      monthsLeft: remaining.length,
      interestLeft: remaining.reduce((s, x) => s + x.interest, 0),
      payoffYM: ymAdd(d.startYM, n),
      paid: k,
      total: n,
      monthlyInterest: balance * n0(d.rate) / 100 / 12,
    };
  }

  // 手動模式：用剩餘本金＋月付推估
  function manualStatus(d, today = new Date()) {
    const B = n0(d.balance), P = n0(d.monthly), r = n0(d.rate) / 100 / 12;
    const base = { balance: B, monthly: P, inGrace: false, graceLeft: 0, monthlyInterest: B * r };
    const ym = m => { const t = new Date(today.getFullYear(), today.getMonth() + m, 1); return `${t.getFullYear()}/${String(t.getMonth() + 1).padStart(2, '0')}`; };
    if (B <= 0) return { ...base, monthsLeft: 0, interestLeft: 0, payoffYM: '已還清' };
    if (P <= 0 || P <= B * r) return { ...base, monthsLeft: Infinity, interestLeft: Infinity, payoffYM: null };
    const n = r === 0 ? B / P : -Math.log(1 - r * B / P) / Math.log(1 + r);
    const months = Math.ceil(n);
    return { ...base, monthsLeft: months, interestLeft: Math.max(0, n * P - B), payoffYM: ym(months) };
  }

  function status(d, today) {
    return d.mode === 'auto' ? (autoStatus(d, today) || manualStatus({}, today)) : manualStatus(d, today);
  }

  return { schedule, autoStatus, manualStatus, status, paidPeriods };
})();

if (typeof module !== 'undefined') module.exports = Loan;
