'use strict';
// 語音／文字快速新增：把一句中文口語解析成資產或負債，並帶入對應類別與欄位
// 例：「國泰房貸 800 萬 利率 2.1% 30 年 寬限期 3 年」「0050 三張 均價 95」「玉山活存 50 萬」

const Voice = (() => {
  // ---------- 中文數字 ----------
  const DIG = { 零: 0, 〇: 0, 一: 1, 壹: 1, 二: 2, 兩: 2, 两: 2, 貳: 2, 三: 3, 參: 3, 四: 4, 肆: 4, 五: 5, 伍: 5, 六: 6, 陸: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9 };
  const UNIT = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000 };
  // 中文／阿拉伯數字混合：1460萬、一千四百六十萬、3.5萬、三點五萬、1億2000萬
  function cnNumClean(s) {
    s = String(s).replace(/,/g, '').replace(/\s+/g, '').replace(/[元塊]$/, '');
    if (/^[0-9]+(\.[0-9]+)?$/.test(s)) return parseFloat(s);
    let total = 0, wan = 0, section = 0, num = 0, i = 0, any = false;
    while (i < s.length) {
      const m = s.slice(i).match(/^[0-9]+(\.[0-9]+)?/);
      if (m) { num = parseFloat(m[0]); i += m[0].length; any = true; continue; }
      const c = s[i];
      if (c in DIG) { num = DIG[c]; any = true; }
      else if (c in UNIT) { section += (num || 1) * UNIT[c]; num = 0; any = true; }
      else if (c === '萬' || c === '万') { wan += (section + num) * 1e4; section = 0; num = 0; any = true; }
      else if (c === '億' || c === '亿') { total += (wan + section + num) * 1e8; wan = 0; section = 0; num = 0; any = true; }
      else if (c === '點' || c === '.') {
        let j = i + 1, dec = '';
        while (j < s.length && (s[j] in DIG || /[0-9]/.test(s[j]))) { dec += /[0-9]/.test(s[j]) ? s[j] : DIG[s[j]]; j++; }
        num = parseFloat(`${num}.${dec || 0}`); i = j; any = true; continue;
      }
      i++;
    }
    return any ? total + wan + section + num : NaN;
  }

  // 「零零五零」「二三三零」這種逐字念的代號 → 0050、2330
  function digitWords(s) {
    return s.replace(/[零〇一二三四五六七八九]{4,6}/g, m => /[十百千萬億]/.test(m) ? m : [...m].map(c => DIG[c]).join(''));
  }

  // ---------- 銀行 ----------
  const BANK_ALIAS = [
    ['004', ['臺灣銀行', '台灣銀行', '台銀', '臺銀']], ['005', ['土地銀行', '土銀']], ['006', ['合作金庫', '合庫']],
    ['007', ['第一銀行', '一銀', '第一商銀']], ['008', ['華南銀行', '華南']], ['009', ['彰化銀行', '彰銀', '彰化']],
    ['011', ['上海商銀', '上海銀行']], ['012', ['台北富邦', '北富銀', '富邦']], ['013', ['國泰世華', '國泰']],
    ['016', ['高雄銀行', '高銀']], ['017', ['兆豐']], ['021', ['花旗']], ['048', ['王道']], ['050', ['台灣企銀', '臺灣企銀', '企銀']],
    ['052', ['渣打']], ['053', ['台中商銀', '台中銀行']], ['054', ['京城']], ['081', ['滙豐', '匯豐']], ['101', ['瑞興']],
    ['102', ['華泰']], ['103', ['新光']], ['108', ['陽信']], ['118', ['板信']], ['147', ['三信']], ['700', ['中華郵政', '郵局']],
    ['803', ['聯邦']], ['805', ['遠東', '遠銀']], ['806', ['元大銀行', '元大']], ['807', ['永豐']], ['808', ['玉山']],
    ['809', ['凱基']], ['810', ['星展']], ['812', ['台新']], ['816', ['安泰']], ['822', ['中國信託', '中信']],
    ['823', ['將來銀行', '將來']], ['824', ['連線銀行', 'LINE Bank', 'LINEBank', 'LINE銀行']], ['826', ['樂天']],
  ];
  function findBank(t) {
    let best = null;
    for (const [code, names] of BANK_ALIAS) for (const n of names) {
      const i = t.indexOf(n);
      if (i >= 0 && (!best || n.length > best.n.length)) best = { code, n, i };
    }
    if (!best) return null;
    const b = BANKS.find(x => x.code === best.code);
    return b ? { value: `${b.code}|${b.name}`, bank: b, text: best.n } : null;
  }

  // ---------- 股票 ----------
  const US_ALIAS = { 蘋果: 'AAPL', 輝達: 'NVDA', 特斯拉: 'TSLA', 微軟: 'MSFT', 谷歌: 'GOOGL', 估狗: 'GOOGL', 亞馬遜: 'AMZN', 臉書: 'META', 博通: 'AVGO', 網飛: 'NFLX', 超微: 'AMD', 英特爾: 'INTC', 高通: 'QCOM', 美光: 'MU', 甲骨文: 'ORCL', 可口可樂: 'KO', 麥當勞: 'MCD', 迪士尼: 'DIS', 好市多: 'COST', 波克夏: 'BRK-B', 台積電ADR: 'TSM', 台積ADR: 'TSM', 標普500: 'VOO', 那斯達克: 'QQQ' };
  function findStock(t) {
    // 美股中文別名
    for (const [k, v] of Object.entries(US_ALIAS)) if (t.includes(k)) return { mkt: 'us', sym: v, text: k };
    // 英文代號（可能被念成 A A P L）
    const tt = t.replace(/\b([A-Za-z])\s+(?=[A-Za-z]\b)/g, '$1');
    const en = tt.match(/(?:^|[^A-Za-z])([A-Za-z]{1,5}(?:[.-][A-Za-z])?)(?![A-Za-z])/g);
    if (en && Stocks.ready()) for (const raw of en) {
      const s = raw.replace(/^[^A-Za-z]/, '').toUpperCase();
      if (['ETF', 'USD', 'TWD', 'LINE', 'K'].includes(s)) continue;
      if (Stocks.quote('us', s)) return { mkt: 'us', sym: s, text: raw.replace(/^[^A-Za-z]/, '') };
    }
    // 台股代號
    const d = t.match(/(?:^|[^0-9.])(\d{4,6}[A-Z]?)(?![0-9])(?!\s*[萬億元塊%年坪])/);   // 後面接萬、元、%、年…的是金額不是代號
    if (d && Stocks.ready() && Stocks.quote('tw', d[1])) return { mkt: 'tw', sym: d[1], text: d[1] };
    // 台股名稱（取最長符合）
    if (Stocks.ready()) {
      let best = null;
      for (const x of Stocks.list('tw')) {
        const n = x.name;
        if (!n || n.length < 2) continue;
        for (const v of nameVariants(n)) if (t.includes(v) && (!best || v.length > best.text.length)) best = { mkt: 'tw', sym: x.sym, text: v };
      }
      if (best) return best;
    }
    if (d && /[張股]/.test(t)) return { mkt: 'tw', sym: d[1], text: d[1] };
    return null;
  }

  // 名稱裡的數字也接受中文念法：元大台灣50 → 元大台灣五十
  const CN_D = '零一二三四五六七八九';
  function numToCn(n) {
    n = +n; if (!(n >= 0 && n < 100000)) return String(n);
    if (n < 10) return CN_D[n];
    const parts = [[10000, '萬'], [1000, '千'], [100, '百'], [10, '十']];
    let out = '', zero = false;
    for (const [u, c] of parts) { const d = Math.floor(n / u) % 10; if (d) { if (zero) out += '零'; out += (u === 10 && d === 1 && !out ? '' : CN_D[d]) + c; zero = false; } else if (out) zero = true; }
    const d = n % 10; if (d) out += (zero ? '零' : '') + CN_D[d];
    return out;
  }
  function nameVariants(n) {
    if (!/\d/.test(n)) return [n];
    return [n, n.replace(/\d+/g, m => numToCn(m)), n.replace(/\d/g, d => CN_D[d])];
  }

  // ---------- 車 ----------
  function findCar(t) {
    let brand = null;
    for (const b of CAR_BRANDS) {
      for (const n of [b.zh, b.v]) if (n && n !== '其他' && t.toLowerCase().includes(n.toLowerCase()) && (!brand || n.length > brand.text.length)) brand = { b, text: n };
    }
    if (!brand) return null;
    let model = null;
    for (const m of Car.models(brand.b.v)) if (t.toLowerCase().replace(/\s/g, '').includes(m.name.toLowerCase().replace(/\s/g, ''))) model = m.name;
    return { brand: brand.b.v, model, text: brand.text };
  }

  // ---------- 分類關鍵字 ----------
  const DEBT_WORDS = /貸|欠|借|負債|卡費|信用卡|分期|額度|透支/;
  const DEBT_TYPE = [
    ['理財型房貸', /理財型|額度型|循環|房屋週轉|週轉金/],
    ['房貸', /房貸|房屋貸款|增貸|二胎|房子貸/],
    ['車貸', /車貸|汽車貸款|機車貸/],
    ['學貸', /學貸|就學貸款/],
    ['信用卡', /信用卡|卡費|卡債|分期/],
    ['親友借款', /朋友|親友|家人|爸|媽|父母|老婆|老公|兄|弟|姊|姐|妹|同事/],
    ['信貸', /信貸|信用貸款|個人信貸|貸款/],
  ];
  const ASSET_TYPE = [
    ['加密貨幣', /比特幣|以太幣|以太坊|BTC|ETH|USDT|加密|虛擬貨幣|幣安/i],
    ['基金', /基金/],
    ['債券', /債券|公債|美債|公司債/],
    ['保險', /保單|保險|儲蓄險|年金險/],
    ['不動產', /房子|房產|不動產|公寓|套房|大樓|土地|店面|透天|預售屋|房屋/],
    ['車輛', /車子|汽車|機車|摩托車|愛車|轎車|休旅/],
    ['現金/存款', /活存|定存|存款|現金|帳戶|戶頭|存了|外幣|美金存款|儲蓄/],
  ];

  // ---------- 數字與上下文 ----------
  const N = '(?:[0-9][0-9,]*(?:\\.[0-9]+)?|[零〇一二兩三四五六七八九十百千]+)';
  const STOP = '(?![零〇一二兩三四五六七八九十百千0-9坪年張股%％個月號日趴歲])';
  const DEC = '(?:點[零一二三四五六七八九]+)?';
  const NUM_RE = new RegExp(`[0-9]+(?:\\.[0-9]+)?\\s*[kK](?![A-Za-z])|${N}${DEC}(?:\\s*[萬億](?:${N}${STOP})?)*`, 'g');
  function numbers(t) {
    const out = [];
    let m;
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(t))) {
      let raw = m[0];
      if (!raw.trim()) continue;
      if (/^[一二三四五六七八九十]$/.test(raw) && /^[月號日]/.test(t.slice(m.index + raw.length))) { /* 日期用字 */ }
      let v = /[kK]$/.test(raw) ? parseFloat(raw) * 1000 : cnNumClean(raw);
      if (!isFinite(v)) continue;
      out.push({ v, raw, i: m.index, end: m.index + raw.length, pre: t.slice(Math.max(0, m.index - 7), m.index), post: t.slice(m.index + raw.length, m.index + raw.length + 4) });
    }
    return out;
  }

  // 一句話 → { kind, vals, label, missing }
  function parseOne(text, opts = {}) {
    let t = digitWords(String(text).trim()).replace(/[％]/g, '%').replace(/點([零一二三四五六七八九]{2,})(?=[十百千])/g, (m, d) => `點${d.slice(0, -1)}§${d.slice(-1)}`)   // 二點一三十年 → 2.1 ＋ 三十年
      .replace(/百分之([零一二三四五六七八九十0-9]+(?:[點.](?:[0-9]+|[零一二三四五六七八九]+))?)/g, (m, x) => cnNumClean(x) + '%').replace(/趴/g, '%');
    if (!t) return null;
    const bank = findBank(t);
    const stock = findStock(t);
    const car = findCar(t);
    // 把已辨識的名稱拿掉，避免裡面的字被當成數字（例：第一銀行的「一」）
    let rest = t;
    const ents = (car && stock && !/股|ETF|張/.test(t) ? [bank, car] : [bank, stock, car]).filter(e => e && e.text).sort((a, b) => b.text.length - a.text.length);
    for (const e of ents) rest = rest.split(e.text).join(' ');   // 先拿掉長的名稱（元大台灣五十 先於 元大）
    rest = rest.replace(/(\d{4})\s*年\s*(\d{1,2})\s*月/g, ' ').replace(/§/g, ' ');           // 日期另外處理
    const ym = t.match(/(\d{4}|[一二三四五六七八九零〇]{4})\s*年\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*月/);
    const nums = numbers(rest);
    const used = new Set();
    const take = (test) => { const n = nums.find((x, k) => !used.has(k) && test(x)); if (n) used.add(nums.indexOf(n)); return n; };

    const f = {};
    const pct = take(x => /^\s*%/.test(x.post) || /利率|年息|利息|年利/.test(x.pre) && x.v < 30);
    if (pct) f.rate = pct.v;
    const grace = take(x => /寬限/.test(x.pre) && /^\s*(年|個月|月)/.test(x.post));
    if (grace) f.grace = /^\s*年/.test(grace.post) ? grace.v * 12 : grace.v;
    const years = take(x => /^\s*年/.test(x.post) && x.v > 0 && x.v <= 50 && !/寬限/.test(x.pre));
    if (years) f.years = years.v;
    const monthly = take(x => /每月|月付|每個月|月繳|一個月|月還|每期/.test(x.pre));
    if (monthly) f.monthly = monthly.v;
    const sheets = take(x => /^\s*張/.test(x.post));
    const shares = take(x => /^\s*股/.test(x.post));
    if (sheets) f.shares = sheets.v * 1000;
    else if (shares) f.shares = shares.v;
    const price = take(x => /均價|成本|買在|成交價|每股|單價|價格|股價|@/.test(x.pre) && !/^\s*[萬億]/.test(x.post));
    if (price) f.price = price.v;
    const limit = take(x => /額度/.test(x.pre));
    if (limit) f.limit = limit.v;
    const drawn = take(x => /動用|用了|已用/.test(x.pre));
    if (drawn) f.drawn = drawn.v;
    const ping = take(x => /^\s*坪/.test(x.post));
    if (ping) f.ping = ping.v;
    const yr = take(x => /^\s*年/.test(x.post) && x.v >= 1990 && x.v <= 2100);
    if (yr) f.yearNum = yr.v;
    const day = take(x => /^\s*(號|日)/.test(x.post) && x.v >= 1 && x.v <= 31 && /扣|繳|每月/.test(x.pre + x.post));
    if (day) f.payDay = day.v;
    // 剩下最大的金額當主要金額
    const rest2 = nums.filter((x, k) => !used.has(k) && x.v >= 100);
    if (rest2.length) f.amount = Math.max(...rest2.map(x => x.v));
    if (ym) f.startYM = `${ym[1].length === 4 && /\d/.test(ym[1]) ? ym[1] : [...ym[1]].map(c => DIG[c]).join('')}-${String(isNaN(+ym[2]) ? cnNumClean(ym[2]) : +ym[2]).padStart(2, '0')}`;

    // 判斷資產或負債
    const isDebt = DEBT_WORDS.test(t) && !/^.*(存|買了).*(股|張)/.test(t);
    const ctx = { t, bank, stock, car, f };

    const stockish = f.shares || /股|ETF|張|美股|台股|持有|買了|買進/.test(t);
    if (!isDebt && stock && (stockish || !car)) {
      const cat = stock.mkt === 'us' ? '美股' : '台股';
      const q = Stocks.quote(stock.mkt, stock.sym);
      const vals = { category: cat, sym: Stocks.norm(stock.mkt, stock.sym), shares: f.shares || '', cost: f.price || '' };
      return { kind: 'asset', stock: true, vals, name: q ? q.name : stock.sym, missing: f.shares ? [] : ['shares'], ctx };
    }

    if (isDebt) {
      let type = (DEBT_TYPE.find(([, re]) => re.test(t)) || ['其他'])[0];
      if (type === '其他' && /車/.test(t)) type = '車貸';
      const vals = { type, bank: bank ? bank.value : (type === '親友借款' ? '—|親友' : ''), rate: f.rate ?? '', note: '' };
      const tok = t.split(/\s+/).find(w => DEBT_WORDS.test(w) && !/^[0-9]/.test(w));
      vals.name = tok && tok.length <= 10 ? tok.replace(/^(我|有|欠|還有)/, '') : bank ? `${bank.text}${type}` : type;
      if (bank && !vals.name.includes(bank.text) && vals.name === type) vals.name = bank.text + type;
      if (type === '親友借款') vals.name = (t.match(/朋友|家人|爸媽|爸爸|媽媽|父母|老婆|老公|哥哥|弟弟|姊姊|姐姐|妹妹|同事/) || ['親友'])[0] + '借款';
      if (type === '理財型房貸') {
        Object.assign(vals, { mode: 'revolving', limit: f.limit || f.amount || '', drawn: f.drawn || 0 });
      } else if (f.years && (f.amount || f.limit) && type !== '信用卡' && type !== '親友借款') {
        Object.assign(vals, { mode: 'auto', principal: f.amount || f.limit, years: f.years, grace: String(f.grace || 0), method: /本金平均/.test(t) ? 'principal' : /只繳息|只繳利息|到期還本/.test(t) ? 'interest' : 'annuity', startYM: f.startYM || '', payDay: f.payDay || '' });
      } else {
        Object.assign(vals, { mode: 'manual', balance: f.amount || '', monthly: f.monthly || '', payDay: f.payDay || '' });
        if (vals.rate === '') vals.rate = type === '親友借款' ? 0 : '';
      }
      const missing = [];
      if (!vals.bank) missing.push('bank');
      if (vals.mode === 'auto') { if (!vals.startYM) missing.push('startYM'); if (vals.rate === '') missing.push('rate'); }
      if (vals.mode === 'manual') { if (!vals.balance) missing.push('balance'); if (!vals.monthly) missing.push('monthly'); if (vals.rate === '') missing.push('rate'); }
      if (vals.mode === 'revolving') { if (!vals.limit) missing.push('limit'); if (vals.rate === '') missing.push('rate'); }
      return { kind: 'debt', vals, missing, ctx };
    }

    // 資產
    let cat = (ASSET_TYPE.find(([, re]) => re.test(t)) || [null])[0];
    if (!cat && car) cat = '車輛';
    if (!cat && bank) cat = '現金/存款';
    if (!cat) cat = '其他';
    const vals = { category: cat, amount: f.amount || '' };
    // 名稱：去掉數字與單位後的文字
    let name = t.replace(NUM_RE, ' ').replace(/[萬億元塊%％坪張股]|大約|大概|差不多|價值|目前|現在|有|是|我|的|新增|加入|記錄|一筆|資產|總共/g, ' ').replace(/\s+/g, ' ').trim();
    if (cat === '車輛' && car) { Object.assign(vals, { brand: car.brand, model: car.model || '', buyYear: f.yearNum || '' }); name = car.model ? `${car.text} ${car.model}` : '愛車'; }
    if (cat === '不動產') { if (f.ping) vals.ping = f.ping; if (!/房|宅|屋|寓|地|店/.test(name)) name = '房子'; }
    if (cat === '現金/存款' && bank && !name.includes(bank.text)) name = bank.text + (/定存/.test(t) ? '定存' : '活存');
    vals.name = (name || cat).slice(0, 20);
    const missing = vals.amount ? [] : ['amount'];
    return { kind: 'asset', vals, missing, ctx };
  }

  // 一段話可能包含多筆，用標點或「還有、另外、然後」分開
  function parse(text) {
    return String(text).split(/[，,。；;\n]|還有|另外|然後|以及/).map(s => s.trim()).filter(s => s.length >= 2).map(s => { const r = parseOne(s); return r && { ...r, text: s }; }).filter(Boolean);
  }

  return { parse, parseOne, cnNum: cnNumClean, findBank, findStock };
})();

if (typeof module !== 'undefined') module.exports = Voice;
