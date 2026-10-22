'use strict';
// 投資計畫與逐月還款推算
// - 投資計畫：總額分 N 個月投入，可連結理財型房貸（額度型、只繳息）；每期可確認實際投入金額
// - 理財型房貸：每月利息 = 當月已動用金額 × 年利率 / 12；已動用 = 計畫外已動用 + 計畫累計投入
// - project()：把所有負債推算成逐月還款，並找出寬限期開始／結束、還清、動用完等事件

const Plan = (() => {
  const n0 = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
  const { ymAdd, ymDiff, ymSlash, nowYM } = Loan;

  // ---------- 投資計畫 ----------
  function amounts(p) {
    const n = Math.max(1, Math.round(n0(p.months)));
    const total = n0(p.total);
    const per = Math.floor(total / n);
    return Array.from({ length: n }, (_, i) => {
      if (p.custom && p.custom[i] != null && p.custom[i] !== '') return n0(p.custom[i]);
      return i === n - 1 ? total - per * (n - 1) : per;
    });
  }
  // 第 i 期的狀態：done 已確認、assumed 已過期但未確認（假設已投入）、now 本月、future 未來
  function periodState(p, i, cur = nowYM()) {
    const ym = ymAdd(p.startYM, i);
    if (p.done && p.done[i] != null) return 'done';
    const d = ymDiff(cur, ym);
    return d < 0 ? 'assumed' : d === 0 ? 'now' : 'future';
  }
  const actual = (p, i, planned) => (p.done && p.done[i] != null ? n0(p.done[i]) : planned);

  // 到 ym 月「月初」為止已投入的金額（當月投入要下個月才開始算利息；已確認的當月投入立即算）
  function investedBefore(p, ym, cur = nowYM()) {
    if (!p.startYM) return 0;
    const am = amounts(p);
    let sum = 0;
    am.forEach((a, i) => {
      const m = ymAdd(p.startYM, i);
      const d = ymDiff(m, ym);
      if (d > 0 || (d === 0 && p.done && p.done[i] != null)) sum += actual(p, i, a);
    });
    return sum;
  }
  function progress(p, cur = nowYM()) {
    const am = amounts(p);
    let invested = 0, confirmed = 0, idx = -1;
    am.forEach((a, i) => {
      const st = periodState(p, i, cur);
      if (st === 'done') { invested += actual(p, i, a); confirmed++; }
      else if (st === 'assumed') invested += a;
      if (st === 'now' || (idx < 0 && st === 'future')) idx = idx < 0 ? i : idx;
    });
    const k = ymDiff(p.startYM, cur);
    return { amounts: am, invested, confirmed, total: n0(p.total), n: am.length, current: Math.max(0, Math.min(am.length, k + 1)), nextIdx: idx };
  }

  // ---------- 理財型房貸 ----------
  function drawnAt(d, plans, ym, cur = nowYM()) {
    let drawn = n0(d.drawn);
    for (const p of plans) if (p.source === d.id) drawn += investedBefore(p, ym, cur);
    const limit = n0(d.limit);
    return limit ? Math.min(drawn, limit) : drawn;
  }
  function revolvingStatus(d, plans, cur = nowYM()) {
    const r = n0(d.rate) / 100 / 12;
    const now = drawnAt(d, plans, cur, cur);
    const linked = plans.filter(p => p.source === d.id);
    let full = now, fullYM = null;
    for (const p of linked) {
      const end = ymAdd(p.startYM, Math.round(n0(p.months)));
      if (!fullYM || ymDiff(fullYM, end) > 0) fullYM = end;
    }
    if (fullYM) full = drawnAt(d, plans, fullYM, cur);
    return {
      balance: now, monthly: now * r, monthlyInterest: now * r, revolving: true,
      limit: n0(d.limit), fullDrawn: full, fullInterest: full * r, fullYM: fullYM ? ymSlash(fullYM) : null,
      inGrace: false, graceLeft: 0, monthsLeft: Infinity, interestLeft: Infinity, payoffYM: d.endYM ? ymSlash(d.endYM) : null,
    };
  }

  function status(d, plans) {
    if (d.mode === 'revolving') return revolvingStatus(d, plans);
    if (d.mode === 'auto') return Loan.autoStatus(d) || Loan.manualStatus({});
    return Loan.manualStatus(d);
  }

  // ---------- 逐月推算 ----------
  // 回傳 { months: [{ym, items: {id: {pay, interest, principal, balance, grace}}, total}], events: [...] }
  function project(debts, plans, horizon = 36, today = new Date()) {
    const cur = nowYM(today);
    const months = Array.from({ length: horizon }, (_, k) => ({ ym: ymAdd(cur, k), items: {}, total: 0 }));
    const events = [];
    const dayOf = d => Math.min(28, Math.max(1, Math.round(n0(d.payDay)) || 1));
    const ev = (d, ym, type, extra) => events.push({ debt: d, ym, day: dayOf(d), type, ...extra });

    for (const d of debts) {
      if (d.mode === 'auto') {
        const rows = Loan.schedule(d);
        if (!rows.length) continue;
        const paid = Loan.paidPeriods(d.startYM, n0(d.payDay), today);
        rows.forEach((r, idx) => {
          const k = ymDiff(cur, r.ym);
          if (k < 0 || k >= horizon) return;
          months[k].items[d.id] = idx < paid ? { ...r, paid: true } : r;   // 本月已扣款的仍算在本月
        });
        const g = Math.round(n0(d.grace)), a = Loan.graceOffset(d), gEnd = Math.min(rows.length, a + g);
        if (g > 0) {
          const startYM = ymAdd(d.startYM, a + 1), endYM = ymAdd(d.startYM, gEnd + 1);  // 第一個寬限期繳款月、第一個恢復還本月
          if (ymDiff(cur, startYM) > 0) ev(d, startYM, 'graceStart', { from: rows[a - 1]?.pay || 0, to: rows[a]?.pay || 0 });
          if (ymDiff(cur, endYM) >= 0 && rows[gEnd]) ev(d, endYM, 'graceEnd', { from: rows[gEnd - 1].pay, to: rows[gEnd].pay });
        }
        const last = rows.at(-1);
        if (ymDiff(cur, last.ym) >= 0) {
          const regular = rows.length > 1 ? rows[rows.length - 2].pay : last.pay;   // 平常的月付（不含最後一期一次還本）
          if (last.principal > regular * 3) ev(d, last.ym, 'balloon', { from: regular, to: last.pay, amount: last.principal });
          ev(d, ymAdd(last.ym, 1), 'payoff', { from: last.principal > regular * 3 ? regular : last.pay, to: 0 });
        }
      } else if (d.mode === 'revolving') {
        const r = n0(d.rate) / 100 / 12;
        months.forEach(m => {
          const bal = drawnAt(d, plans, m.ym, cur);
          if (bal > 0) m.items[d.id] = { pay: bal * r, interest: bal * r, principal: 0, balance: bal, revolving: true };
        });
        for (const p of plans.filter(p => p.source === d.id)) {
          const endYM = ymAdd(p.startYM, Math.round(n0(p.months)));
          if (ymDiff(cur, endYM) >= 0) {
            const before = drawnAt(d, plans, ymAdd(endYM, -1), cur) * r, after = drawnAt(d, plans, endYM, cur) * r;
            ev(d, endYM, 'drawFull', { from: before, to: after, plan: p });
          }
        }
        if (d.endYM && ymDiff(cur, d.endYM) >= 0) ev(d, d.endYM, 'lineEnd', { from: 0, to: 0 });
      } else {
        let bal = n0(d.balance);
        const P = n0(d.monthly), r = n0(d.rate) / 100 / 12;
        for (let k = 0; k < horizon && bal > 0.5 && P > 0; k++) {
          const interest = bal * r, prin = Math.min(Math.max(P - interest, 0), bal);
          bal -= prin;
          months[k].items[d.id] = { pay: interest + prin, interest, principal: prin, balance: bal };
          if (bal <= 0.5) ev(d, ymAdd(cur, k + 1), 'payoff', { from: interest + prin, to: 0 });
          if (P <= interest) break;
        }
      }
    }
    months.forEach(m => { m.total = Object.values(m.items).reduce((s, x) => s + x.pay, 0); });

    // 補上事件發生當月的總月付（變化後）
    const totalAt = ym => { const k = ymDiff(cur, ym); return k >= 0 && k < horizon ? months[k].total : null; };
    events.forEach(e => {
      e.total = totalAt(e.ym);
      e.date = new Date(Number(e.ym.slice(0, 4)), Number(e.ym.slice(5)) - 1, e.day);
      e.days = Math.ceil((e.date - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
    });
    events.sort((a, b) => a.date - b.date);
    return { months, events, cur };
  }

  // 全部貸款結束要幾個月（給「全部」範圍用）
  function horizonAll(debts, today = new Date()) {
    const cur = nowYM(today);
    let max = 12;
    for (const d of debts) {
      if (d.mode === 'auto' && d.startYM) max = Math.max(max, ymDiff(cur, ymAdd(d.startYM, Math.round(n0(d.years) * 12))) + 1);
      if (d.mode !== 'auto' && d.mode !== 'revolving') { const s = Loan.manualStatus(d, today); if (isFinite(s.monthsLeft)) max = Math.max(max, s.monthsLeft + 1); }
      if (d.mode === 'revolving' && d.endYM) max = Math.max(max, ymDiff(cur, d.endYM) + 1);
    }
    return Math.min(max, 480);
  }

  return { amounts, periodState, progress, investedBefore, drawnAt, revolvingStatus, status, project, horizonAll };
})();
