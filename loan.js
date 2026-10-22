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

  // 寬限期在第幾期之後開始（0 = 撥款就開始）
  const graceOffset = d => (d.graceYM && d.startYM ? Math.max(0, ymDiff(d.startYM, d.graceYM)) : 0);

  // 第 i 期（1 起算）在 startYM + i 月繳款
  function schedule(d) {
    const P = n0(d.principal), r = n0(d.rate) / 100 / 12, n = Math.round(n0(d.years) * 12);
    const g = Math.max(0, Math.round(n0(d.grace))), a = Math.min(graceOffset(d), n), gEnd = Math.min(n, a + g);
    const method = d.method || 'annuity';
    const rows = [];
    if (P <= 0 || n <= 0) return rows;
    let bal = P;
    for (let i = 1; i <= n; i++) {
      const interest = bal * r;
      const inGrace = i > a && i <= gEnd;
      let prin = 0;
      if (method === 'interest') prin = i === n ? bal : 0;
      else if (!inGrace) {
        const rem = n - i + 1;   // 剩下的期數（寬限期前不預扣、寬限期後重新攤還）
        if (method === 'principal') prin = bal / rem;
        else prin = (r === 0 ? bal / rem : bal * r / (1 - Math.pow(1 + r, -rem))) - interest;
      }
      prin = Math.min(Math.max(prin, 0), bal);
      bal -= prin;
      rows.push({ i, ym: d.startYM ? ymAdd(d.startYM, i) : null, interest, principal: prin, pay: interest + prin, balance: Math.max(0, bal), grace: inGrace });
    }
    return rows;
  }

  // 從 'YYYY-MM' 起算到今天已繳幾期（未到扣款日則本月尚未扣）
  function paidPeriods(startYM, payDay, today = new Date()) {
    if (!startYM) return 0;
    let k = ymDiff(startYM, nowYM(today));
    if (payDay && today.getDate() < payDay) k -= 1;
    return Math.max(0, k);
  }

  function autoStatus(d, today = new Date()) {
    const rows = schedule(d);
    const n = rows.length;
    if (!n) return null;
    const k = Math.min(paidPeriods(d.startYM, n0(d.payDay), today), n);
    const balance = k === 0 ? n0(d.principal) : rows[k - 1].balance;
    const next = rows[k] || null;
    const g = Math.round(n0(d.grace)), a = graceOffset(d), gEnd = Math.min(n, a + g);
    const inGrace = !!(next && next.grace);
    const graceUpcoming = g > 0 && k < a;
    const remaining = rows.slice(k);
    return {
      balance,
      monthly: next ? next.pay : 0,
      inGrace, graceUpcoming,
      graceLeft: inGrace ? gEnd - k : 0,
      graceStartYM: g ? ymSlash(ymAdd(d.startYM, a)) : null,
      graceEndYM: g ? ymSlash(ymAdd(d.startYM, gEnd)) : null,
      afterGracePay: rows[gEnd] ? rows[gEnd].pay : 0,
      monthsLeft: remaining.length,
      interestLeft: remaining.reduce((s, x) => s + x.interest, 0),
      payoffYM: ymSlash(ymAdd(d.startYM, n)),
      paid: k, total: n,
      monthlyInterest: balance * n0(d.rate) / 100 / 12,
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

  return { schedule, autoStatus, manualStatus, paidPeriods, graceOffset, ymAdd, ymDiff, ymNum, ymStr, ymSlash, nowYM };
})();

if (typeof module !== 'undefined') module.exports = Loan;
