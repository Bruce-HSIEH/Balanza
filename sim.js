'use strict';
// 模擬人生：展示用的三種人生，資料只在記憶體裡，不會儲存或備份

const Sim = (() => {
  const now = new Date();
  const ym = (back = 0) => { const d = new Date(now.getFullYear(), now.getMonth() - back, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const day = (back = 0) => { const d = new Date(now.getTime() - back * 864e5); return d.toISOString().slice(0, 10); };
  let n = 0;
  const id = () => 'sim' + (++n).toString(36);
  const buy = (shares, price, back) => ({ id: id(), type: 'buy', date: day(back), shares, price });
  const sell = (shares, price, back) => ({ id: id(), type: 'sell', date: day(back), shares, price });
  // 依目前股價推算當初的買價（f > 1 = 追高套牢）
  const at = (mkt, sym, f, fallback) => { const q = typeof Stocks !== 'undefined' && Stocks.quote(mkt, sym); return q ? Math.round(q.price * f * 100) / 100 : fallback; };
  const tw = (sym, name, lots) => ({ id: id(), category: '台股', sym, name, lots });
  const us = (sym, name, lots) => ({ id: id(), category: '美股', sym, name, lots });
  const A = (category, name, amount, extra = {}) => ({ id: id(), category, name, amount, ...extra });
  const car = (name, brand, model, carColor, buyYear, buyPrice, amount) => ({ id: id(), category: '車輛', name, brand, model, carColor, buyYear, buyPrice, amount });
  const house = (name, amount, county, district, road, btype, ping, extra = {}) => ({ id: id(), category: '不動產', name, amount, county, district, road, btype, ping, ...extra });
  const auto = (type, name, bank, principal, rate, years, back, extra = {}) => ({ id: id(), type, name, bank, mode: 'auto', principal, rate, years, startYM: ym(back), method: 'annuity', payDay: 5, grace: '0', changes: [], ...extra });
  const manual = (type, name, bank, balance, monthly, rate, extra = {}) => ({ id: id(), type, name, bank, mode: 'manual', balance, monthly, rate, ...extra });
  const line = (type, name, bank, limit, drawn, rate, extra = {}) => ({ id: id(), type, name, bank, mode: 'revolving', limit, drawn, rate, drawnYM: ym(14), ...extra });
  const B = {
    bot: '004|臺灣銀行', land: '005|臺灣土地銀行', tcb: '006|合作金庫商業銀行', first: '007|第一商業銀行', hn: '008|華南商業銀行',
    fubon: '012|台北富邦商業銀行', cathay: '013|國泰世華商業銀行', mega: '017|兆豐國際商業銀行', post: '700|中華郵政',
    esun: '808|玉山商業銀行', taishin: '812|台新國際商業銀行', ctbc: '822|中國信託商業銀行',
  };

  const PERSONAS = {
    rich: {
      name: '超級富豪', who: '霸氣金秤', desc: '豪宅、跑車、美股科技巨頭與私募基金，淨資產數十億',
      build() {
        const mansion = house('信義區頂樓豪宅', 960000000, 'A', '信義區', '松智路', '住宅大樓', 168, { address: '1號' });
        const shop = house('大安區精華店面', 320000000, 'A', '大安區', '忠孝東路四段', '店面', 85);
        const villa = house('宜蘭海景別墅', 68000000, 'G', '頭城鎮', '濱海路', '透天厝', 120);
        const tokyo = house('東京港區公寓', 180000000, '', '', '', '住宅大樓', 42, { note: '海外' });
        const office = house('內湖辦公大樓整層', 450000000, 'A', '內湖區', '瑞光路', '住宅大樓', 620);
        const d = {
          currency: 'TWD',
          assets: [
            A('現金/存款', '富邦私人銀行活存', 48000000, { note: '台幣' }),
            A('現金/存款', '美元定存', 62000000, { note: 'USD 190 萬' }),
            A('現金/存款', '瑞士帳戶', 95000000),
            tw('2330', '台積電', [buy(80000, 520, 1500), buy(40000, 610, 900)]),
            tw('0050', '元大台灣50', [buy(200000, 98, 700)]),
            tw('2454', '聯發科', [buy(30000, 820, 600)]),
            tw('2308', '台達電', [buy(20000, 310, 500)]),
            tw('00679B', '元大美債20年', [buy(500000, 31, 400)]),
            us('NVDA', 'NVIDIA', [buy(20000, 48, 1200), sell(2000, 140, 300)]),
            us('AAPL', 'Apple', [buy(15000, 150, 1000)]),
            us('MSFT', 'Microsoft', [buy(8000, 280, 900)]),
            us('BRK-B', 'Berkshire Hathaway', [buy(3000, 320, 800)]),
            us('VOO', 'Vanguard S&P 500', [buy(10000, 380, 700)]),
            us('TSM', 'TSMC ADR', [buy(12000, 95, 600)]),
            A('基金', '私募股權基金 Fund IV', 150000000),
            A('基金', '全球平衡基金', 30000000),
            A('債券', '美國 10 年期公債', 200000000),
            A('債券', '投資等級公司債', 60000000),
            A('加密貨幣', '比特幣 25 顆', 75000000),
            A('加密貨幣', '以太幣 300 顆', 30000000),
            A('保險', '高資產儲蓄險', 50000000),
            A('保險', '傳承規劃壽險', 80000000),
            mansion, shop, villa, tokyo, office,
            car('911 Turbo S', 'Porsche', '911', '#c62828', 2025, 16800000, 15200000),
            car('G 63', 'Mercedes-Benz', 'G-Class', '#1f2328', 2024, 11500000, 9800000),
            car('Model X', 'Tesla', 'Model X', '#f4f4f1', 2025, 4200000, 3600000),
            car('Taycan', 'Porsche', 'Taycan', '#1e4fa8', 2024, 6900000, 5600000),
            A('其他', '藝術品收藏（常玉、草間彌生）', 80000000),
            A('其他', '名錶收藏', 12000000),
            A('其他', '遊艇', 45000000),
          ],
          debts: [],
          plans: [],
        };
        const lineDebt = line('理財型房貸', '豪宅理財型額度', B.fubon, 200000000, 50000000, 1.95, { collateral: mansion.id });
        d.debts = [
          auto('房貸', '豪宅房貸（低利槓桿）', B.fubon, 300000000, 1.9, 20, 30, { collateral: mansion.id, grace: '24' }),
          auto('房貸', '辦公大樓貸款', B.mega, 220000000, 2.05, 15, 18, { collateral: office.id, changes: [{ id: id(), ym: ym(6), type: 'rate', rate: 2.15 }] }),
          lineDebt,
          auto('車貸', '911 低利分期', B.ctbc, 8000000, 0, 3, 8),
          manual('信用卡', '無限卡月結', B.ctbc, 680000, 680000, 0),
        ];
        const amex = { id: id(), bkind: 'card', name: '富邦無限卡', bank: B.fubon, closeDay: 15, dueDay: 30, autopay: 'auto', ccy: 'TWD', amount: 680000 };
        const ctbcB = { id: id(), bkind: 'card', name: '中信鼎極卡', bank: B.ctbc, closeDay: 5, dueDay: 20, autopay: 'auto', ccy: 'TWD' };
        d.bills = [amex, ctbcB,
          { id: id(), bkind: 'sub', name: '私人管家服務', cat: '其他', amount: 120000, ccy: 'TWD', cycle: '1', anchor: day(10), payWith: '' },
          { id: id(), bkind: 'sub', name: '遊艇碼頭泊位', cat: '其他', amount: 380000, ccy: 'TWD', cycle: '3', anchor: day(50), payWith: '' },
          { id: id(), bkind: 'sub', name: 'Claude Max', cat: 'AI／軟體', amount: 200, ccy: 'USD', cycle: '1', anchor: day(6), payWith: ctbcB.id },
          { id: id(), bkind: 'sub', name: '高爾夫球會年費', cat: '健身', amount: 360000, ccy: 'TWD', cycle: '12', anchor: day(200), payWith: ctbcB.id },
          { id: id(), bkind: 'sub', name: '豪宅管理費', cat: '房租', amount: 86000, ccy: 'TWD', cycle: '1', anchor: day(20), payWith: '' },
          { id: id(), bkind: 'sub', name: 'Bloomberg 終端機', cat: 'AI／軟體', amount: 2665, ccy: 'USD', cycle: '1', anchor: day(3), payWith: ctbcB.id },
        ];
        d.plans = [{ id: id(), name: '美股科技分批布局', total: 120000000, months: 12, startYM: ym(4), day: 10, source: lineDebt.id, targets: 'NVDA 40%、MSFT 30%、VOO 30%', yieldPct: 9 }];
        return d;
      },
      trend: { start: 0.82, vol: 0.012 },
    },
    normal: {
      name: '普通人', who: '小資上班族', desc: '板橋華廈、定期定額 0050、房貸車貸都有，穩穩前進',
      build() {
        const home = house('板橋的家', 15800000, 'F', '板橋區', '文化路一段', '華廈', 28, { address: '120巷8號' });
        const d = {
          currency: 'TWD',
          assets: [
            A('現金/存款', '玉山數位帳戶', 350000),
            A('現金/存款', '郵局薪轉', 180000),
            A('現金/存款', '緊急預備金定存', 300000),
            tw('0050', '元大台灣50', [buy(1000, 120, 900), buy(1000, 135, 500), buy(1000, 150, 120)]),
            tw('00878', '國泰永續高股息', [buy(5000, 18.5, 800), buy(3000, 21, 300)]),
            tw('0056', '元大高股息', [buy(5000, 33, 600)]),
            tw('2330', '台積電', [buy(200, 580, 700)]),
            us('VOO', 'Vanguard S&P 500', [buy(8, 410, 500), buy(7, 480, 200)]),
            A('基金', '定期定額全球股票基金', 180000),
            A('加密貨幣', '比特幣 0.05 顆', 150000),
            A('保險', '六年期儲蓄險', 300000),
            home,
            car('家用休旅', 'Toyota', 'Corolla Cross', '#c5cad0', 2021, 950000, 620000),
            car('通勤機車', 'Gogoro', 'Viva', '#7fb8e6', 2022, 62000, 38000),
          ],
          debts: [
            auto('房貸', '板橋房貸', B.first, 12000000, 2.0, 30, 52, { collateral: home.id, grace: '36', changes: [{ id: id(), ym: ym(42), type: 'rate', rate: 2.185 }] }),
            auto('車貸', 'Corolla Cross 車貸', B.taishin, 600000, 3.5, 5, 52),
            auto('信貸', '裝潢信貸', B.cathay, 300000, 3.8, 5, 30),
            auto('學貸', '研究所學貸', B.bot, 150000, 1.15, 8, 70),
            manual('信用卡', '中信 LINE Pay 卡', B.ctbc, 35000, 35000, 0),
          ],
          bills: [],
          plans: [{ id: id(), name: '每月定期定額 0050', total: 240000, months: 24, startYM: ym(6), day: 6, source: 'self', targets: '0050 100%', yieldPct: 7 }],
        };
        const ctbc = { id: id(), bkind: 'card', name: '中信 LINE Pay 卡', bank: B.ctbc, closeDay: 22, dueDay: 7, autopay: 'auto', ccy: 'TWD' };
        const esun = { id: id(), bkind: 'card', name: '玉山 Pi 卡', bank: B.esun, closeDay: 3, dueDay: 18, autopay: 'manual', ccy: 'TWD', amount: 8600 };
        d.bills = [ctbc, esun,
          { id: id(), bkind: 'sub', name: 'Netflix 標準方案', cat: '串流影音', amount: 390, ccy: 'TWD', cycle: '1', anchor: day(40), payWith: ctbc.id },
          { id: id(), bkind: 'sub', name: 'Spotify', cat: '串流影音', amount: 149, ccy: 'TWD', cycle: '1', anchor: day(55), payWith: ctbc.id },
          { id: id(), bkind: 'sub', name: 'Claude Pro', cat: 'AI／軟體', amount: 20, ccy: 'USD', cycle: '1', anchor: day(12), payWith: ctbc.id },
          { id: id(), bkind: 'sub', name: 'iCloud+ 200GB', cat: '雲端儲存', amount: 90, ccy: 'TWD', cycle: '1', anchor: day(26), payWith: esun.id },
          { id: id(), bkind: 'sub', name: '中華電信 5G', cat: '電信網路', amount: 999, ccy: 'TWD', cycle: '1', anchor: day(19), payWith: '' },
          { id: id(), bkind: 'sub', name: '健身房月費', cat: '健身', amount: 1288, ccy: 'TWD', cycle: '1', anchor: day(8), payWith: esun.id },
          { id: id(), bkind: 'sub', name: '機車強制險', cat: '保險', amount: 1080, ccy: 'TWD', cycle: '12', anchor: day(300), payWith: 'other' },
          { id: id(), bkind: 'sub', name: '水電瓦斯', cat: '水電瓦斯', amount: 1600, ccy: 'TWD', cycle: '1', anchor: day(15), payWith: '' },
        ];
        return d;
      },
      trend: { start: 0.9, vol: 0.02 },
    },
    debt: {
      name: '欠債大王', who: '債台高築', desc: '信用卡循環、信貸疊信貸、追高套牢、名車分期，淨資產深陷負數',
      build() {
        const d = {
          currency: 'TWD',
          assets: [
            A('現金/存款', '錢包', 3200),
            A('現金/存款', '台新活存', 8800),
            tw('2603', '長榮', [buy(3000, at('tw', '2603', 1.55, 233), 1300)]),
            tw('3008', '大立光', [buy(100, at('tw', '3008', 1.7, 4000), 1700)]),
            tw('2409', '友達', [buy(10000, at('tw', '2409', 1.9, 32), 1400)]),
            us('TSLA', 'Tesla', [buy(60, at('us', 'TSLA', 1.45, 400), 1100)]),
            us('NFLX', 'Netflix', [buy(10, at('us', 'NFLX', 1.3, 90), 1500)]),
            A('加密貨幣', '狗狗幣 50 萬顆', 30000),
            A('加密貨幣', '朋友推薦的山寨幣', 2000, { note: '幣價歸零中' }),
            car('拉風雙門跑車', 'BMW', 'M4', '#1e4fa8', 2023, 3200000, 2200000),
            car('改裝重機', 'Yamaha', 'MT-15', '#c62828', 2022, 380000, 210000),
            A('其他', '名牌包 ×4', 80000),
            A('其他', '球鞋收藏', 45000),
          ],
          debts: [
            manual('信用卡', '中信卡循環', B.ctbc, 280000, 8400, 15),
            manual('信用卡', '台新卡循環', B.taishin, 190000, 5700, 14.8),
            manual('信用卡', '國泰卡循環', B.cathay, 350000, 10500, 15),
            manual('信用卡', '富邦卡預借現金', B.fubon, 120000, 3600, 15),
            auto('信貸', '整合負債信貸', B.esun, 1500000, 6.5, 7, 20),
            auto('信貸', '第二筆信貸', B.hn, 800000, 8.9, 5, 12),
            auto('車貸', 'BMW 車貸', B.taishin, 2600000, 3.9, 6, 30, { grace: '12' }),
            auto('車貸', '重機分期', B.ctbc, 300000, 9.9, 3, 26),
            auto('學貸', '大學學貸', B.bot, 400000, 1.15, 8, 40, { changes: [{ id: id(), ym: ym(20), type: 'grace', months: 12 }] }),
            line('其他', '股票質押額度', B.first, 5000000, 5000000, 3.2),
            auto('信貸', '第三筆信貸（利率最高）', B.taishin, 1000000, 12.5, 5, 6),
            manual('親友借款', '投資失利跟親戚周轉', '—|親戚', 2000000, 10000, 0),
            manual('親友借款', '跟老爸借的', '—|家人', 500000, 5000, 0),
            manual('親友借款', '大學室友周轉', '—|朋友', 120000, 0, 0),
            manual('其他', '手機分期', B.esun, 36000, 3000, 0),
            manual('其他', '當鋪', '—|當鋪', 50000, 1500, 30),
          ],
          plans: [],
        };
        const c1 = { id: id(), bkind: 'card', name: '中信卡', bank: B.ctbc, closeDay: 26, dueDay: 10, autopay: 'manual', ccy: 'TWD', amount: 8400 };
        const c2 = { id: id(), bkind: 'card', name: '台新卡', bank: B.taishin, closeDay: 2, dueDay: 17, autopay: 'manual', ccy: 'TWD', amount: 5700 };
        const c3 = { id: id(), bkind: 'card', name: '國泰卡', bank: B.cathay, closeDay: 12, dueDay: 27, autopay: 'manual', ccy: 'TWD', amount: 10500 };
        d.bills = [c1, c2, c3,
          { id: id(), bkind: 'sub', name: 'Netflix 高級方案', cat: '串流影音', amount: 490, ccy: 'TWD', cycle: '1', anchor: day(21), payWith: c1.id },
          { id: id(), bkind: 'sub', name: 'Disney+', cat: '串流影音', amount: 270, ccy: 'TWD', cycle: '1', anchor: day(9), payWith: c2.id },
          { id: id(), bkind: 'sub', name: '線上遊戲月卡', cat: '其他', amount: 450, ccy: 'TWD', cycle: '1', anchor: day(4), payWith: c3.id },
          { id: id(), bkind: 'sub', name: '手機月租吃到飽', cat: '電信網路', amount: 1399, ccy: 'TWD', cycle: '1', anchor: day(13), payWith: '' },
          { id: id(), bkind: 'sub', name: '套房房租', cat: '房租', amount: 16000, ccy: 'TWD', cycle: '1', anchor: day(23), payWith: 'other' },
          { id: id(), bkind: 'sub', name: '跑車保險', cat: '保險', amount: 68000, ccy: 'TWD', cycle: '12', anchor: day(330), payWith: c1.id },
        ];
        return d;
      },
      trend: { start: 1.25, vol: 0.03 },
    },
  };

  // 依目前的資產、負債往回生一年的走勢（平滑的隨機波動＋趨勢）
  function history(kind, assets, debts) {
    const out = [];
    let seed = { rich: 7, normal: 13, debt: 29 }[kind];
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    const days = 365;
    let e = 0;
    const vol = { rich: 0.006, normal: 0.004, debt: 0.012 }[kind];
    const pts = [];
    for (let i = days; i >= 0; i--) { e = e * 0.93 + rnd() * vol; pts.push({ i, e }); }
    const endE = pts[pts.length - 1].e;
    for (const { i, e: ei } of pts) {
      const t = 1 - i / days, noise = ei - endE * t;   // 最後一天剛好等於現在
      let fa, fl;
      if (kind === 'rich') { fa = 0.8 + 0.2 * t + noise * 3; fl = 1.04 - 0.04 * t; }
      else if (kind === 'normal') { fa = 0.88 + 0.12 * t + noise; fl = 1.03 - 0.03 * t; }
      else { fa = 1.5 - 0.5 * t + noise * 2; fl = 0.8 + 0.2 * t; }
      out.push({ d: day(i), a: Math.round(assets * fa), l: Math.round(debts * fl) });
    }
    return out;
  }

  function build(kind) { n = 0; return PERSONAS[kind].build(); }
  return { PERSONAS, build, history };
})();
