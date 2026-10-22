'use strict';
// AI 理解：把一句口語交給 Claude（Anthropic API）或 Gemini（Google）整理成資產／負債項目
// 手機直接呼叫 API（使用者自己的金鑰），只送出這句話與選單清單，不送現有資產負債資料

const AI = (() => {
  const URL = 'https://api.anthropic.com/v1/messages';
  const MODELS = [
    { v: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', d: '最快、最便宜（建議）' },
    { v: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', d: '更聰明，費用約 20 倍' },
  ];
  const GMODELS = [
    { v: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', d: '最便宜（建議）' },
    { v: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', d: '更聰明，費用約 3 倍' },
  ];

  const TOOL = {
    name: 'record_items',
    description: '把使用者說的每一筆資產或負債整理成結構化資料。一句話可能有多筆。',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['asset', 'stock', 'debt'], description: 'asset=一般資產, stock=股票/ETF 持股, debt=負債' },
              name: { type: 'string', description: '簡短名稱（繁體中文），例：玉山活存、國泰房貸、愛車' },
              category: { type: 'string', enum: ['現金/存款', '基金', '債券', '加密貨幣', '保險', '不動產', '車輛', '其他'], description: '資產類別（kind=asset 時）' },
              amount: { type: 'number', description: '資產目前價值（新台幣元，萬要換算）' },
              market: { type: 'string', enum: ['tw', 'us'], description: '股票市場（kind=stock）' },
              symbol: { type: 'string', description: '股票代號，台股如 0050、2330，美股如 AAPL' },
              shares: { type: 'number', description: '股數（1 張 = 1000 股）' },
              price: { type: 'number', description: '每股成交價或平均成本' },
              debt_type: { type: 'string', enum: ['房貸', '理財型房貸', '信貸', '車貸', '學貸', '信用卡', '親友借款', '其他'] },
              bank_code: { type: 'string', description: '銀行三碼代碼（見清單），親友借款或不知道就省略' },
              mode: { type: 'string', enum: ['auto', 'manual', 'revolving'], description: 'auto=有貸款總額與年限可自動攤還；manual=只知道剩餘本金與月付；revolving=理財型/額度型只繳利息' },
              principal: { type: 'number', description: '原始貸款金額（mode=auto）' },
              balance: { type: 'number', description: '剩餘本金（mode=manual）' },
              monthly: { type: 'number', description: '每月還款（mode=manual）' },
              limit: { type: 'number', description: '核准額度（mode=revolving）' },
              drawn: { type: 'number', description: '已動用金額（mode=revolving）' },
              rate: { type: 'number', description: '年利率百分比，例 2.1' },
              years: { type: 'number', description: '貸款年限（年）' },
              grace_months: { type: 'number', description: '寬限期月數（3 年 = 36）' },
              grace_start: { type: 'string', description: '寬限期開始年月 YYYY-MM（不是一撥款就開始時才填）' },
              start: { type: 'string', description: '撥款年月 YYYY-MM' },
              method: { type: 'string', enum: ['annuity', 'principal', 'interest'], description: 'annuity=本息平均, principal=本金平均, interest=只繳息到期還本' },
              pay_day: { type: 'number', description: '每月扣款日 1-31' },
              car_brand: { type: 'string', description: '車輛廠牌英文名（見清單）' },
              car_model: { type: 'string' },
              buy_year: { type: 'number' },
              buy_price: { type: 'number' },
              ping: { type: 'number', description: '建物坪數' },
              note: { type: 'string' },
              source_text: { type: 'string', description: '這一筆對應的原句片段' },
            },
            required: ['kind', 'source_text'],
          },
        },
      },
      required: ['items'],
    },
  };

  function system() {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const banks = BANKS.filter(b => b.code !== '—').map(b => `${b.code} ${b.name}`).join('、');
    const cars = CAR_BRANDS.filter(b => b.v !== '其他').map(b => `${b.v}(${b.zh})`).join('、');
    return `你是台灣個人記帳 App「Balanza」的輸入助手。使用者會用口語（多半來自語音辨識，可能有錯字、同音字、中文數字）描述要新增的資產或負債。
請呼叫 record_items，把每一筆整理出來。今天是 ${today}，金額單位是新台幣元。

規則：
- 「萬」「億」要換算成元；「張」= 1000 股；「趴」「百分之」= %。
- 股票、ETF 一律 kind=stock，填 market 與 symbol（台股用數字代號，美股用英文代號，例：輝達→NVDA、蘋果→AAPL、台積電→2330、元大台灣50→0050、元大高股息→0056）。
- 房貸、信貸等：有貸款總額＋年限 → mode=auto；只知道還欠多少＋每月繳多少 → mode=manual；理財型房貸、額度型、循環動用 → mode=revolving（limit=額度）。
- 「前 N 年只繳利息」「寬限期 N 年」→ grace_months=N*12；整段期間只繳息、到期還本 → method=interest。
- 「上個月」「去年三月」這類相對時間請換算成 YYYY-MM。
- 不確定的欄位就不要填，不要亂猜金額。
- 語音辨識的同音錯字請合理修正（例：「國太」→ 國泰、「於山」→ 玉山）。
- 名稱用繁體中文，簡短。

資產類別：現金/存款、基金、債券、加密貨幣、保險、不動產、車輛、其他（股票用 kind=stock）。
負債類型：房貸、理財型房貸、信貸、車貸、學貸、信用卡、親友借款、其他。
銀行代碼：${banks}。
車輛廠牌：${cars}。`;
  }

  // ---- Claude ----
  async function callClaude(key, model, text, signal) {
    const res = await fetch(URL, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 2000, system: system(), tools: [TOOL], tool_choice: { type: 'tool', name: 'record_items' }, messages: [{ role: 'user', content: text }] }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = j.error && j.error.message || res.statusText;
      if (res.status === 401) throw new Error('API 金鑰無效，請到設定確認');
      if (res.status === 429) throw new Error('使用次數太頻繁或額度不足，稍後再試');
      if (res.status === 400 && /credit|balance/i.test(msg)) throw new Error('Anthropic 帳號餘額不足');
      throw new Error(`AI 回應錯誤（${res.status}）：${msg}`);
    }
    const tool = (j.content || []).find(c => c.type === 'tool_use');
    return { items: (tool && tool.input && tool.input.items) || [], usage: j.usage };
  }

  // ---- Gemini ----
  // 把 JSON Schema 轉成 Gemini responseSchema（OpenAPI 子集）
  function toGemini(sc) {
    const o = { type: String(sc.type).toUpperCase() };
    if (sc.description) o.description = sc.description;
    if (sc.enum) o.enum = sc.enum;
    if (sc.properties) { o.properties = {}; for (const [k, v] of Object.entries(sc.properties)) o.properties[k] = toGemini(v); }
    if (sc.items) o.items = toGemini(sc.items);
    if (sc.required) o.required = sc.required;
    return o;
  }
  async function callGemini(key, model, text, signal) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system() + '\n\n請只輸出符合 schema 的 JSON：{"items":[...]}。' }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: toGemini(TOOL.input_schema), temperature: 0.1 },
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (j.error && j.error.message) || res.statusText;
      if (res.status === 400 && /API key|API_KEY/i.test(msg)) throw new Error('Gemini API 金鑰無效，請到設定確認');
      if (res.status === 403) throw new Error('Gemini API 金鑰沒有權限（請確認已在 AI Studio 啟用）');
      if (res.status === 429) throw new Error('Gemini 使用次數已達上限，稍後再試');
      if (res.status === 404) throw new Error(`找不到模型 ${model}`);
      throw new Error(`Gemini 回應錯誤（${res.status}）：${msg}`);
    }
    const txt = (((j.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || '').join('') || '';
    let out = {};
    try { out = JSON.parse(txt); } catch (e) { const m = txt.match(/\{[\s\S]*\}/); if (m) try { out = JSON.parse(m[0]); } catch (e2) { /* ignore */ } }
    return { items: Array.isArray(out.items) ? out.items : [], usage: j.usageMetadata };
  }

  function call(cfg, text, signal) {
    return cfg.provider === 'gemini' ? callGemini(cfg.gkey, cfg.gmodel, text, signal) : callClaude(cfg.key, cfg.model, text, signal);
  }

  async function test(cfg) {
    const r = await call(cfg, '玉山活存 50 萬');
    if (!r.items.length) throw new Error('有連上，但沒有整理出結果');
    return true;
  }
  const keyOf = cfg => cfg.provider === 'gemini' ? cfg.gkey : cfg.key;

  return { call, test, keyOf, MODELS, GMODELS };
})();
