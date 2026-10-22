'use strict';
// 介面元件：小圖、選擇器、吉祥物、走勢圖、動畫

const UI = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 小圖 ----------
  function bankIcon(b) {
    if (!b) return Icon('bank');
    if (b.ic) return Icon(b.ic);
    return `<span class="ico ico-bank" style="--bc:${b.c}"><b>${esc(b.s)}</b><svg class="bank-coin" viewBox="0 0 16 16">${Icon.coin(8, 8, 6)}</svg></span>`;
  }

  // 車輛插圖（cars.js，依真實車款比例自繪）
  const TYPE_MAP = { sport: 'coupe', ev: 'evcross' };
  const carSVG = (type = 'sedan', color = '#c5cad0', size = 160) => Car.svg(TYPE_MAP[type] || type, color, size);
  function carIcon(brand, model, color) {
    const type = brand ? Car.typeOf(brand.v, model, TYPE_MAP[brand.t] || brand.t) : 'hatch';
    return `<span class="ico ico-car">${Car.svg(type, color || (brand ? brand.c : '#ff8a80'), 44)}</span>`;
  }

  // ---------- 走勢小圖 ----------
  function sparkline(series, w = 72, h = 24, opts = {}) {
    const pts = (series || []).filter(v => v != null && isFinite(v));
    if (pts.length < 2) return `<svg class="spark" width="${w}" height="${h}"></svg>`;
    const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1, pad = 2;
    const up = pts.at(-1) >= pts[0];
    const col = opts.color || (up ? '#e53935' : '#2e9e4f'); // 台灣習慣：紅漲綠跌
    const xy = pts.map((v, i) => [pad + i * (w - pad * 2) / (pts.length - 1), pad + (1 - (v - min) / span) * (h - pad * 2)]);
    const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
    const area = `${line}L${xy.at(-1)[0].toFixed(1)} ${h}L${xy[0][0].toFixed(1)} ${h}Z`;
    const id = 'g' + Math.random().toString(36).slice(2, 8);
    const last = xy.at(-1);
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#${id})"/><path class="spark-line" d="${line}" fill="none" stroke="${col}" stroke-width="${opts.sw || 1.6}" stroke-linejoin="round" stroke-linecap="round"/>
      ${opts.dot ? `<circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${col}"/><circle class="spark-pulse" cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${col}"/>` : ''}</svg>`;
  }

  // ---------- 選擇器（底部彈出） ----------
  let sheet;
  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement('dialog');
    sheet.className = 'sheet';
    sheet.innerHTML = `<div class="sheet-grip"></div><h3 class="sheet-title"></h3>
      <input class="sheet-search" type="search" placeholder="搜尋…" autocomplete="off" autocapitalize="characters">
      <ul class="sheet-list"></ul><div class="sheet-more"></div>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(''); });
    return sheet;
  }

  // options: [{value,label,sub,icon,right,key}]；limit：一次最多顯示幾項（大清單用）
  function openPicker({ title, options, value, search = options.length > 8, limit = 0, placeholder, custom }) {
    const s = ensureSheet();
    s.querySelector('.sheet-title').textContent = title;
    const input = s.querySelector('.sheet-search');
    const list = s.querySelector('.sheet-list');
    const more = s.querySelector('.sheet-more');
    input.style.display = search ? '' : 'none';
    input.placeholder = placeholder || '搜尋…';
    input.value = '';
    let shown = [];
    const draw = q => {
      q = (q || '').trim().toLowerCase();
      let items = options.filter(o => !q || (o.key || `${o.label} ${o.sub || ''} ${o.value}`).toLowerCase().includes(q));
      if (q && limit) items.sort((a, b) => (String(b.value).toLowerCase() === q) - (String(a.value).toLowerCase() === q) || (String(b.value).toLowerCase().startsWith(q)) - (String(a.value).toLowerCase().startsWith(q)));
      const total = items.length;
      if (limit) items = items.slice(0, limit);
      shown = items;
      const extra = custom && q && !options.some(o => String(o.value).toLowerCase() === q) ? custom(input.value.trim()) : null;
      if (extra) shown = [...items, extra];
      list.innerHTML = shown.length ? shown.map((o, i) => `
        <li><button type="button" data-i="${i}" class="${o.value === value ? 'sel' : ''}" style="--d:${Math.min(i, 12) * 16}ms">
          ${o.icon || ''}<span class="opt-text"><span>${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>
          ${o.right || ''}${o.value === value ? '<span class="check"><svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M6 10.5l2.6 2.6L14 7.6" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' : ''}
        </button></li>`).join('') : '<li class="empty">找不到符合的項目</li>';
      more.textContent = limit && total > limit ? `還有 ${total - limit} 項，輸入代號或名稱縮小範圍` : '';
    };
    draw('');
    input.oninput = () => draw(input.value);
    return new Promise(resolve => {
      let done = false;
      list.onclick = e => {
        const b = e.target.closest('button[data-i]');
        if (!b) return;
        done = true;
        s.close('');
        resolve(shown[+b.dataset.i]);
      };
      s.onclose = () => { if (!done) resolve(null); };
      s.showModal();
      if (search && matchMedia('(pointer:fine)').matches) input.focus();
      const sel = list.querySelector('.sel');
      sel && sel.scrollIntoView({ block: 'center' });
    });
  }

  // ---------- 吉祥物「小秤」 ----------
  // 門檻以新台幣計，k = 1 新台幣換成顯示幣別的倍數
  function levelOf(s, k = 1) {
    if (s.totalAssets === 0 && s.totalDebts === 0) return LEVEL_EMPTY;
    const nw = s.netWorth / k;
    return LEVELS.find(L => nw >= L.min && nw < L.max) || LEVELS.at(-1);
  }

  const INK = '#263238';
  const st = (d, w = 3.5) => `<path d="${d}" stroke="${INK}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const EYES = {
    dot: '<circle cx="92" cy="102" r="5.5" fill="#263238"/><circle cx="128" cy="102" r="5.5" fill="#263238"/><circle cx="94" cy="100" r="1.8" fill="#fff"/><circle cx="130" cy="100" r="1.8" fill="#fff"/>',
    happy: st('M84 104 Q92 94 100 104') + st('M120 104 Q128 94 136 104'),
    sleep: st('M85 103 Q92 108 99 103') + st('M121 103 Q128 108 135 103'),
    nervous: '<circle cx="92" cy="104" r="5" fill="#263238"/><circle cx="128" cy="104" r="5" fill="#263238"/>' + st('M84 93 Q90 90 98 94', 3) + st('M136 93 Q130 90 122 94', 3),
    worried: '<circle cx="92" cy="104" r="5" fill="#263238"/><circle cx="128" cy="104" r="5" fill="#263238"/>' + st('M83 92 L99 96') + st('M137 92 L121 96'),
    sad: '<circle cx="92" cy="106" r="5" fill="#263238"/><circle cx="128" cy="106" r="5" fill="#263238"/>' + st('M84 96 L99 92') + st('M136 96 L121 92'),
    cry: st('M85 100 L97 105 L85 110') + st('M135 100 L123 105 L135 110'),
    sparkle: '<circle cx="92" cy="102" r="6.5" fill="#263238"/><circle cx="128" cy="102" r="6.5" fill="#263238"/><circle cx="94.5" cy="99.5" r="2.4" fill="#fff"/><circle cx="130.5" cy="99.5" r="2.4" fill="#fff"/><circle cx="90" cy="105" r="1.1" fill="#fff"/><circle cx="126" cy="105" r="1.1" fill="#fff"/>',
  };
  const MOUTH = {
    smile: st('M100 119 Q110 128 120 119'),
    big: '<path d="M96 118 Q110 136 124 118 Z" fill="#c62828"/><path d="M102 126 Q110 132 118 126" fill="#ff8a80"/>',
    grin: '<path d="M93 117 Q110 140 127 117 Z" fill="#c62828"/><path d="M93 117 L127 117 L125 121 L95 121 Z" fill="#fff"/><path d="M101 128 Q110 134 119 128" fill="#ff8a80"/>',
    wavy: st('M100 124 Q105 120 110 124 Q115 128 120 124'),
    flat: st('M101 123 L119 123'),
    frown: st('M100 128 Q110 118 120 128'),
    wail: '<path d="M98 130 Q110 114 122 130 Z" fill="#8e2b2b"/>',
    o: '<ellipse cx="110" cy="123" rx="3.5" ry="2.8" fill="#263238"/>',
  };
  const ARMS = {
    rest: '<ellipse cx="56" cy="118" rx="8" ry="12" transform="rotate(20 56 118)"/><ellipse cx="164" cy="118" rx="8" ry="12" transform="rotate(-20 164 118)"/>',
    side: '<ellipse cx="60" cy="110" rx="8" ry="12" transform="rotate(-10 60 110)"/><ellipse cx="160" cy="110" rx="8" ry="12" transform="rotate(10 160 110)"/>',
    wave: '<ellipse class="wave" cx="54" cy="96" rx="8" ry="13" transform="rotate(-35 54 96)"/><ellipse class="wave wave-r" cx="166" cy="96" rx="8" ry="13" transform="rotate(35 166 96)"/>',
    hold: '<ellipse cx="78" cy="132" rx="8" ry="11" transform="rotate(-50 78 132)"/><ellipse cx="142" cy="132" rx="8" ry="11" transform="rotate(50 142 132)"/>',
    droop: '<ellipse cx="58" cy="130" rx="8" ry="12" transform="rotate(10 58 130)"/><ellipse cx="162" cy="130" rx="8" ry="12" transform="rotate(-10 162 130)"/>',
    sleep: '<ellipse cx="58" cy="124" rx="8" ry="12" transform="rotate(25 58 124)"/><ellipse cx="162" cy="124" rx="8" ry="12" transform="rotate(-25 162 124)"/>',
  };

  // 每個階段（tier）的造型；同階段 3 級用星星數與顏色區分
  const LOOK = {
    1: { eyes: 'dot', mouth: 'smile', arms: 'rest', anim: 'm-breathe', fx: ['leaf'], acc: ['sprout'] },
    2: { eyes: 'dot', mouth: 'smile', arms: 'rest', anim: 'm-sway', fx: ['sun'], acc: [] },
    3: { eyes: 'happy', mouth: 'big', arms: 'hold', anim: 'm-hop', fx: ['sun', 'sparks'], acc: ['coin'] },
    4: { eyes: 'happy', mouth: 'big', arms: 'wave', anim: 'm-bounce', fx: ['coins', 'sparks'], acc: [] },
    5: { eyes: 'happy', mouth: 'big', arms: 'wave', anim: 'm-bounce', fx: ['coins'], acc: ['tophat', 'bowtie'] },
    6: { eyes: 'sparkle', mouth: 'grin', arms: 'wave', anim: 'm-bounce', fx: ['coins', 'sparks'], acc: ['shades', 'bag'] },
    7: { eyes: 'sparkle', mouth: 'grin', arms: 'wave', anim: 'm-bounce', fx: ['coins', 'sparks'], acc: ['shades', 'medal'] },
    8: { eyes: 'sparkle', mouth: 'grin', arms: 'wave', anim: 'm-bounce', fx: ['coins', 'sparks'], acc: ['cape', 'shades', 'crown'] },
    9: { eyes: 'sparkle', mouth: 'grin', arms: 'wave', anim: 'm-bounce-big', fx: ['rainbow', 'coins', 'sparks', 'cloudseat'], acc: ['cape', 'crown'] },
    10: { eyes: 'sparkle', mouth: 'grin', arms: 'wave', anim: 'm-bounce-big', fx: ['rainbow', 'firework', 'coins', 'sparks'], acc: ['wings', 'cape', 'shades', 'bigcrown'] },
    0: { eyes: 'sleep', mouth: 'o', arms: 'sleep', anim: 'm-breathe', fx: ['zz'], acc: [] },
    '-1': { eyes: 'nervous', mouth: 'wavy', arms: 'side', anim: 'm-fidget', fx: ['sweat1'], acc: [] },
    '-2': { eyes: 'worried', mouth: 'wavy', arms: 'side', anim: 'm-shake', fx: ['sweat', 'flybill'], acc: [] },
    '-3': { eyes: 'sad', mouth: 'frown', arms: 'droop', anim: 'm-droop', fx: ['cloud', 'drizzle', 'tear1'], acc: [] },
    '-4': { eyes: 'sad', mouth: 'frown', arms: 'droop', anim: 'm-droop', fx: ['cloud', 'rain', 'tears'], acc: ['bandage'] },
    '-5': { eyes: 'cry', mouth: 'wail', arms: 'droop', anim: 'm-shiver', fx: ['storm', 'rain', 'bolt', 'tears'], acc: [] },
    '-6': { eyes: 'sad', mouth: 'frown', arms: 'hold', anim: 'm-droop', fx: ['cloud', 'drizzle', 'tears'], acc: ['patch', 'wallet'] },
    '-7': { eyes: 'sad', mouth: 'wail', arms: 'droop', anim: 'm-droop', fx: ['cloud', 'rain', 'tears'], acc: ['sign', 'box'] },
    '-8': { eyes: 'cry', mouth: 'frown', arms: 'side', anim: 'm-shiver', fx: ['snowcloud', 'snow'], acc: ['scarf', 'bandage'] },
    '-9': { eyes: 'cry', mouth: 'wail', arms: 'droop', anim: 'm-droop', fx: ['storm', 'rain', 'bolt', 'tears'], acc: ['chain'] },
    '-10': { eyes: 'cry', mouth: 'wail', arms: 'droop', anim: 'm-shiver', fx: ['abyss', 'storm', 'rain', 'bolt', 'tears'], acc: ['chain', 'bandage', 'patch'] },
  };
  const BACK_FX = ['rays', 'rainbow', 'aura', 'abyss'];

  const FX = {
    coins: () => [[30, 0], [70, .6], [150, .3], [190, .9], [110, 1.3], [50, 1.7], [170, 2.0]].map(([x, d]) =>
      `<g class="coin" style="animation-delay:${d}s">${Icon.coin(x, 0, 7)}</g>`).join(''),
    sparks: () => [[40, 50], [184, 64], [158, 14], [24, 96]].map(([x, y], i) => `<g class="spark" style="animation-delay:${i * .35}s">${Icon.spark(x, y, 1.6, '#fff59d')}</g>`).join(''),
    sun: () => `<g class="sun"><circle cx="186" cy="26" r="12" fill="#ffd54f"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="186" y1="8" x2="186" y2="2" stroke="#ffd54f" stroke-width="3" stroke-linecap="round" transform="rotate(${a} 186 26)"/>`).join('')}</g><g transform="translate(186 26)">${Icon.face(0, -1, .7, 'happy')}</g>`,
    leaf: () => `<path class="leaf" d="M30 40 q8 -10 14 0 q-6 6 -14 0z" fill="#a5e3b0"/><path class="leaf" style="animation-delay:1.4s" d="M176 60 q8 -10 14 0 q-6 6 -14 0z" fill="#c8f0d0"/>`,
    zz: () => `<text class="zz" x="150" y="70" font-size="16" font-weight="700" fill="#90a4ae">Z</text><text class="zz" style="animation-delay:.8s" x="164" y="54" font-size="12" font-weight="700" fill="#90a4ae">z</text>`,
    sweat1: () => `<path class="sweat" d="M148 82 Q154 92 148 96 Q142 92 148 82 Z" fill="#81d4fa"/>`,
    sweat: () => `<path class="sweat" d="M148 82 Q154 92 148 96 Q142 92 148 82 Z" fill="#81d4fa"/><path class="sweat" style="animation-delay:.7s" d="M72 86 Q77 94 72 97 Q67 94 72 86 Z" fill="#81d4fa"/>`,
    flybill: () => [0, 1].map(i => `<g class="flybill" style="animation-delay:${i * 1.3}s"><rect x="160" y="60" width="22" height="13" rx="3" fill="#8ce0a8"/><circle cx="171" cy="66.5" r="3.5" fill="#c8f5d6"/><path d="M162 60 q-8 -8 -4 -12 q5 2 8 10z M180 60 q8 -8 4 -12 q-5 2 -8 10z" fill="#fff" stroke="#cfd8dc"/></g>`).join(''),
    cloud: () => `<g class="cloud"><ellipse cx="110" cy="30" rx="44" ry="16" fill="#90a4ae"/><ellipse cx="88" cy="24" rx="20" ry="16" fill="#90a4ae"/><ellipse cx="128" cy="20" rx="24" ry="18" fill="#90a4ae"/></g>`,
    snowcloud: () => `<g class="cloud"><ellipse cx="110" cy="28" rx="50" ry="16" fill="#cfd8dc"/><ellipse cx="86" cy="22" rx="22" ry="16" fill="#cfd8dc"/><ellipse cx="130" cy="16" rx="26" ry="18" fill="#dfe6ea"/></g>`,
    storm: () => `<g class="cloud"><ellipse cx="110" cy="28" rx="60" ry="18" fill="#607d8b"/><ellipse cx="78" cy="20" rx="26" ry="18" fill="#607d8b"/><ellipse cx="132" cy="14" rx="30" ry="20" fill="#546e7a"/><ellipse cx="160" cy="24" rx="20" ry="14" fill="#607d8b"/></g>`,
    drizzle: () => [92, 110, 128].map((x, i) => `<line class="rain" style="animation-delay:${i * .25}s" x1="${x}" y1="46" x2="${x - 2}" y2="54" stroke="#81d4fa" stroke-width="2.5" stroke-linecap="round"/>`).join(''),
    rain: () => [64, 78, 94, 110, 126, 142, 156].map((x, i) => `<line class="rain fast" style="animation-delay:${i * .11}s" x1="${x}" y1="46" x2="${x - 4}" y2="58" stroke="#4fc3f7" stroke-width="2.5" stroke-linecap="round"/>`).join(''),
    snow: () => [40, 66, 92, 118, 144, 170, 196, 80, 156].map((x, i) => `<circle class="snow" style="animation-delay:${(i * .37) % 2.6}s" cx="${x}" cy="44" r="${i % 3 ? 2.4 : 3.2}" fill="#fff" stroke="#cfd8dc" stroke-width=".8"/>`).join(''),
    bolt: () => `<path class="bolt" d="M150 30 L138 52 L148 52 L140 72 L160 46 L150 46 L158 30 Z" fill="#ffeb3b" stroke="#fbc02d" stroke-width="1.5"/>`,
    tear1: () => `<path class="tear" d="M90 112 Q94 120 90 123 Q86 120 90 112 Z" fill="#4fc3f7"/>`,
    tears: () => `<path class="tear" d="M90 112 Q94 120 90 123 Q86 120 90 112 Z" fill="#4fc3f7"/><path class="tear" style="animation-delay:.5s" d="M130 112 Q134 120 130 123 Q126 120 130 112 Z" fill="#4fc3f7"/><path class="tear" style="animation-delay:1s" d="M88 112 Q92 120 88 123 Q84 120 88 112 Z" fill="#4fc3f7"/>`,
    rainbow: () => `<g class="rainbow" fill="none" stroke-width="7">${['#ff8a80', '#ffd180', '#ffff8d', '#b9f6ca', '#80d8ff', '#b388ff'].map((c, i) => `<path d="M${14 + i * 7} 150 A${96 - i * 7} ${96 - i * 7} 0 0 1 ${206 - i * 7} 150" stroke="${c}" opacity=".55"/>`).join('')}</g>`,
    aura: () => `<circle class="aura" cx="110" cy="112" r="64" fill="#fff59d" opacity=".35"/>`,
    rays: () => `<g class="rays">${Array.from({ length: 12 }, (_, i) => `<path d="M110 110 L${110 + 120 * Math.cos((i * 30 - 4) * Math.PI / 180)} ${110 + 120 * Math.sin((i * 30 - 4) * Math.PI / 180)} L${110 + 120 * Math.cos((i * 30 + 4) * Math.PI / 180)} ${110 + 120 * Math.sin((i * 30 + 4) * Math.PI / 180)} Z" fill="#ffe082" opacity=".35"/>`).join('')}</g>`,
    abyss: () => `<g class="abyss"><ellipse cx="110" cy="160" rx="80" ry="14" fill="#37474f" opacity=".85"/><path class="swirl" d="M110 160 m-60 0 a60 10 0 1 0 120 0 a48 8 0 1 0 -96 0 a34 6 0 1 0 68 0 a20 4 0 1 0 -40 0" fill="none" stroke="#546e7a" stroke-width="2.5"/></g>`,
    cloudseat: () => `<g class="seat"><ellipse cx="110" cy="164" rx="62" ry="12" fill="#fff"/><ellipse cx="72" cy="160" rx="22" ry="12" fill="#fff"/><ellipse cx="148" cy="160" rx="22" ry="12" fill="#fff"/><ellipse cx="110" cy="166" rx="62" ry="8" fill="#e3f2fd"/></g>`,
    firework: () => [[34, 30, '#ff8fa3', 0], [190, 40, '#80d8ff', .8], [170, 6, '#b9f6ca', 1.5]].map(([x, y, c, d]) => `<g class="firework" style="animation-delay:${d}s;transform-origin:${x}px ${y}px">${Array.from({ length: 8 }, (_, i) => `<line x1="${x}" y1="${y}" x2="${x + 12 * Math.cos(i * Math.PI / 4)}" y2="${y + 12 * Math.sin(i * Math.PI / 4)}" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`).join('')}</g>`).join(''),
  };

  const ACC = {
    sprout: sub => `<g class="sprout"><path d="M110 64 v-14" stroke="#5cc485" stroke-width="3.5" stroke-linecap="round"/><path d="M110 54 c-14 0 -16 -12 -15 -16 c9 -1 15 5 15 16z" fill="#8ce0a8"/>${sub >= 1 ? '<path d="M110 52 c12 0 15 -10 14 -14 c-8 -1 -14 4 -14 14z" fill="#b8f0c8"/>' : ''}${sub >= 2 ? '<circle cx="110" cy="44" r="6" fill="#ffb3c1"/><circle cx="110" cy="44" r="2.5" fill="#ffe066"/>' : ''}</g>`,
    antenna: c => `<path d="M110 64 L110 54" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><circle cx="110" cy="51" r="5" fill="${c}"/>`,
    coin: () => `<g class="held">${Icon.coin(110, 140, 13)}</g>`,
    bag: () => `<g class="held"><path d="M98 128 q12 -8 24 0 l-3 4 h-18z" fill="#c6a477"/><path d="M96 134 q-10 8 -8 16 c2 7 10 9 22 9 s20 -2 22 -9 q2 -8 -8 -16z" fill="#e3c08d"/><text x="110" y="152" text-anchor="middle" font-size="13" font-weight="800" fill="#8a6a3c">$</text></g>`,
    shades: () => `<g><rect x="80" y="95" width="25" height="15" rx="6" fill="#263238"/><rect x="115" y="95" width="25" height="15" rx="6" fill="#263238"/><path d="M105 100 h10" stroke="#263238" stroke-width="3"/><path d="M84 99 l8 0" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/><path d="M119 99 l8 0" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/></g>`,
    tophat: () => `<g class="crown"><rect x="88" y="58" width="44" height="8" rx="4" fill="#263238"/><rect x="95" y="30" width="30" height="30" rx="4" fill="#37474f"/><rect x="95" y="50" width="30" height="6" fill="#e53935"/></g>`,
    bowtie: () => `<g><path d="M110 138 l-14 -8 v16z M110 138 l14 -8 v16z" fill="#e53935"/><circle cx="110" cy="138" r="4" fill="#c62828"/></g>`,
    medal: () => `<g class="held"><path d="M98 120 l8 18 M122 120 l-8 18" stroke="#1e88e5" stroke-width="6" stroke-linecap="round"/>${Icon.coin(110, 145, 11, '1', '#ffd54f', '#f9a825')}</g>`,
    crown: () => `<g class="crown"><path d="M92 66 L95 48 L103 58 L110 44 L117 58 L125 48 L128 66 Z" fill="#ffca28" stroke="#f9a825" stroke-width="2.5" stroke-linejoin="round"/><circle cx="110" cy="58" r="3" fill="#ff5252"/></g>`,
    bigcrown: () => `<g class="crown"><path d="M84 66 L88 38 L100 54 L110 30 L120 54 L132 38 L136 66 Z" fill="#ffca28" stroke="#f9a825" stroke-width="2.5" stroke-linejoin="round"/><circle cx="110" cy="54" r="4" fill="#ff5252"/><circle cx="95" cy="60" r="3" fill="#40c4ff"/><circle cx="125" cy="60" r="3" fill="#69f0ae"/><circle cx="88" cy="38" r="3" fill="#fff59d"/><circle cx="110" cy="30" r="3" fill="#fff59d"/><circle cx="132" cy="38" r="3" fill="#fff59d"/></g>`,
    cape: () => `<path class="cape" d="M70 92 Q60 140 50 160 L170 160 Q160 140 150 92 Z" fill="#e53935"/><path d="M70 92 Q110 108 150 92" stroke="#ffca28" stroke-width="4" fill="none"/>`,
    wings: () => `<g class="wings"><path class="wing-l" d="M60 100 C30 70 10 80 14 96 C4 100 8 116 22 114 C14 124 26 134 40 124 C48 128 58 120 62 112 Z" fill="#fff" stroke="#e0e0e0" stroke-width="2"/><path class="wing-r" d="M160 100 C190 70 210 80 206 96 C216 100 212 116 198 114 C206 124 194 134 180 124 C172 128 162 120 158 112 Z" fill="#fff" stroke="#e0e0e0" stroke-width="2"/></g>`,
    bandage: () => `<g transform="rotate(-25 146 84)"><rect x="132" y="79" width="28" height="10" rx="5" fill="#ffe0b2"/><rect x="142" y="79" width="8" height="10" fill="#ffcc80"/></g>`,
    patch: () => `<g><rect x="66" y="126" width="18" height="14" rx="3" fill="#a1887f" transform="rotate(-10 75 133)"/><path d="M68 128 l14 10 M68 138 l14 -10" stroke="#6d4c41" stroke-width="1.6" transform="rotate(-10 75 133)"/></g>`,
    wallet: () => `<g class="held"><rect x="94" y="134" width="32" height="20" rx="4" fill="#a1887f"/><path d="M94 138 h32" stroke="#8d6e63" stroke-width="2"/></g><g class="fly"><circle cx="150" cy="128" r="2.5" fill="#455a64"/><ellipse cx="148" cy="125" rx="3" ry="1.6" fill="#fff" opacity=".8"/><ellipse cx="152" cy="125" rx="3" ry="1.6" fill="#fff" opacity=".8"/></g>`,
    sign: () => `<g class="held"><path d="M168 150 V82" stroke="#8d6e63" stroke-width="4" stroke-linecap="round"/><rect x="146" y="58" width="46" height="28" rx="4" fill="#fff8e1" stroke="#c6a477" stroke-width="2"/><text x="169" y="78" text-anchor="middle" font-size="14" font-weight="800" fill="#c62828">救命</text></g>`,
    box: () => `<g><path d="M62 130 h96 v34 h-96z" fill="#d7b98e"/><path d="M62 130 l-10 -12 h40 l10 12z M158 130 l10 -12 h-40 l-10 12z" fill="#c6a477"/><path d="M100 140 h20" stroke="#a1887f" stroke-width="2"/></g>`,
    scarf: () => `<g><path d="M66 130 Q110 146 154 130 L154 140 Q110 156 66 140 Z" fill="#e57373"/><path d="M134 140 l6 24 l10 -2 l-4 -22z" fill="#ef5350"/><path d="M80 134 v8 M96 138 v8 M112 140 v8 M128 138 v8" stroke="#fff" stroke-width="2" opacity=".6"/></g>`,
    chain: () => `<g><path d="M126 158 Q150 166 170 158" stroke="#78909c" stroke-width="3" fill="none" stroke-dasharray="5 3"/><circle class="ball" cx="180" cy="152" r="12" fill="#455a64"/><ellipse cx="176" cy="147" rx="4" ry="2.5" fill="#fff" opacity=".3"/><text x="180" y="156" text-anchor="middle" font-size="10" font-weight="800" fill="#cfd8dc">債</text></g>`,
  };

  function subMarks(L) {
    if (!L.lv) return '';
    const n = (L.sub || 0) + 1;
    if (L.lv > 0) return Array.from({ length: n }, (_, i) => `<g class="spark" style="animation-delay:${i * .3}s">${Icon.spark(18 + i * 15, 132, 1.5, '#ffd54f')}</g>`).join('');
    return Array.from({ length: n }, (_, i) => `<path d="M${14 + i * 13} 128 q4 -6 8 0 t8 0" stroke="#90a4ae" stroke-width="2.4" fill="none" stroke-linecap="round"/>`).join('');
  }

  // 氣勢：動漫「集氣」式往上竄的氣場（不放射、不模糊本體），等級越高層數越多、越高、越快
  // 氣場形狀用 SMIL 在幾個版本間變形，看起來像一直在燃燒
  function auraPath(r, ry, n, h, seed) {
    const cx = 110, cy = 120, bottom = 164;
    const rnd = k => { const x = Math.sin(seed * 97.3 + k * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const topAt = x => cy - ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / r) ** 2));
    let d = `M${cx} ${bottom} C${(cx - r * .9).toFixed(1)} ${bottom} ${(cx - r - 4).toFixed(1)} ${(cy + 26).toFixed(1)} ${(cx - r).toFixed(1)} ${cy}`;
    const x0 = cx - r, w = 2 * r / n;
    let prev = [cx - r, cy];
    for (let i = 0; i < n; i++) {
      const xm = x0 + w * (i + .5), xv = x0 + w * (i + 1);
      const lean = (cx - xm) * .18;                          // 火舌微微往中間收，像往上竄
      const hh = h * (.55 + .45 * Math.sin(Math.PI * (i + .5) / n)) * (.8 + rnd(i) * .4);
      const pk = [xm + lean, topAt(xm) - hh];
      const vy = i === n - 1 ? cy : topAt(xv) - h * .12;
      d += ` Q${(prev[0] + w * .15).toFixed(1)} ${((prev[1] + pk[1]) / 2 + 4).toFixed(1)} ${pk[0].toFixed(1)} ${pk[1].toFixed(1)}`;
      d += ` Q${(xv - w * .15).toFixed(1)} ${((pk[1] + vy) / 2 + 4).toFixed(1)} ${(i === n - 1 ? cx + r : xv).toFixed(1)} ${vy.toFixed(1)}`;
      prev = [xv, vy];
    }
    d += ` C${(cx + r + 4).toFixed(1)} ${(cy + 26).toFixed(1)} ${(cx + r * .9).toFixed(1)} ${bottom} ${cx} ${bottom} Z`;
    return d;
  }
  function power(L, id) {
    const none = { back: '', defs: '', front: '', rim: '' };
    if (L.lv <= -13) {
      const q = Math.min(1, (-L.lv - 12) / 18);
      const paths = [1, 2, 3].map(k => auraPath(66, 52, 6, 14 + q * 18, k)).join(';');
      return { ...none, back: `<path fill="#455a64" opacity="${(.16 + q * .22).toFixed(2)}" d="${auraPath(66, 52, 6, 14 + q * 18, 1)}"><animate attributeName="d" dur="3.2s" repeatCount="indefinite" values="${paths};${auraPath(66, 52, 6, 14 + q * 18, 1)}"/></path>` };
    }
    if (L.lv < 3) return none;
    const p = Math.min(1, L.lv / 30);
    // 本體保持清楚：只加一圈金色輪廓光
    const rim = `<path class="rim" d="M110 64 C152 64 168 92 168 118 C168 144 144 156 110 156 C76 156 52 144 52 118 C52 92 68 64 110 64 Z" fill="none" stroke="#fff3b0" stroke-width="${(2 + p * 2.5).toFixed(1)}" opacity="${(.5 + p * .5).toFixed(2)}"/>`;
    if (L.lv < 10) return { ...none, rim };
    const layers = L.lv >= 22 ? 3 : L.lv >= 16 ? 2 : 1;
    const n = L.lv >= 22 ? 7 : L.lv >= 16 ? 6 : 5;
    const dur = (1.6 - p * .7).toFixed(2);
    const cols = [['#ffc107', .34], ['#ffca28', .48], ['#fff3c4', .7]];
    const defs = `<linearGradient id="${id}a" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".15"/><stop offset=".45" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient>
      <mask id="${id}m"><rect x="-20" y="-40" width="260" height="220" fill="url(#${id}a)"/></mask>`;
    let back = '';
    for (let k = 0; k < layers; k++) {
      const big = layers - 1 - k;                                  // 外層最大
      const r = 64 + big * 8 + p * 6, ry = 52 + big * 6, h = (18 + p * 46) * (1 + big * .35);
      const vals = [1, 2, 3, 4].map(sd => auraPath(r, ry, n, h, sd + k * 5));
      const [c, op] = cols[layers === 1 ? 1 : k + (3 - layers)];
      back += `<path class="aura-l" fill="${c}" opacity="${op}" mask="url(#${id}m)" d="${vals[0]}"><animate attributeName="d" dur="${(+dur + k * .17).toFixed(2)}s" repeatCount="indefinite" values="${vals.join(';')};${vals[0]}"/></path>`;
    }
    let front = '';
    if (L.lv >= 16) {   // 往上衝的氣流線
      const m = 4 + Math.round(p * 6);
      for (let i = 0; i < m; i++) {
        const x = 52 + (i * 37) % 116, len = 14 + (i % 3) * 8;
        front += `<line class="streak" x1="${x}" y1="150" x2="${x}" y2="${150 - len}" stroke="#fff59d" stroke-width="2.2" stroke-linecap="round" style="animation-delay:${(i * .23 % 1.4).toFixed(2)}s;--sd:${(1.3 - p * .5).toFixed(2)}s"/>`;
      }
    }
    if (L.lv >= 13) {
      const m = 4 + Math.round(p * 6);
      for (let i = 0; i < m; i++) front += `<circle class="rise" cx="${(56 + (i * 97) % 110).toFixed(0)}" cy="160" r="${(1.6 + (i % 3) * .7).toFixed(1)}" fill="#fff59d" style="animation-delay:${(i * .37 % 2.2).toFixed(2)}s"/>`;
    }
    if (L.lv >= 19) {
      const m = 3 + L.sub + (L.lv >= 25 ? 2 : 0);
      front += `<g class="orbit" style="--od:${(4 - p * 1.5).toFixed(2)}s">${Array.from({ length: m }, (_, i) => { const a = i * 2 * Math.PI / m; return `<g transform="translate(${(110 + Math.cos(a) * 80).toFixed(1)} ${(116 + Math.sin(a) * 26).toFixed(1)})">${Icon.spark(0, 0, 1.4, '#fffde7')}</g>`; }).join('')}</g>`;
    }
    if (L.lv >= 25) {
      front += `<path class="zap" d="M36 92 l9 7 -6 2 10 9" stroke="#fff176" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path class="zap" style="animation-delay:.7s" d="M184 86 l-9 8 6 2 -10 9" stroke="#fff176" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return { back, defs, front, rim };
  }

  function mascotSVG(L, opts = {}) {
    const look = LOOK[L.tier] || LOOK[0];
    const pw = power(L, 'p' + Math.random().toString(36).slice(2, 8));
    const c = L.color;
    const behind = ['wings', 'cape'].filter(a => look.acc.includes(a)).map(a => ACC[a]()).join('');
    const pre = look.fx.filter(f => BACK_FX.includes(f)).map(f => FX[f]()).join('');
    const post = look.fx.filter(f => !BACK_FX.includes(f)).map(f => FX[f]()).join('');
    const topAcc = ['sprout', 'tophat', 'crown', 'bigcrown'].find(a => look.acc.includes(a));
    const top = topAcc ? ACC[topAcc](L.sub) : ACC.antenna(L.tier >= 4 ? '#ffb300' : L.tier < 0 ? '#90a4ae' : '#8ce0a8');
    const front = look.acc.filter(a => !['sprout', 'cape', 'wings', 'tophat', 'crown', 'bigcrown'].includes(a)).map(a => ACC[a](L.sub)).join('');
    const stress = opts.stress && L.lv > 0 ? FX.sweat1() : '';
    const blush = L.tier <= -3 ? .25 : .6;
    return `<svg viewBox="0 -12 220 182" class="mascot js ${opts.still ? 'still' : ''} ${L.lv >= 3 ? 'powered' : ''}" role="img" aria-label="${esc(L.name)}">
      ${pw.defs ? `<defs>${pw.defs}</defs>` : ''}
      ${pw.back}${pre}
      <ellipse class="shadow" cx="110" cy="160" rx="46" ry="6" fill="rgba(0,0,0,.12)"/>
      <g class="body ${look.anim}" data-anim="${opts.still ? '' : look.anim}">
        ${behind}
        <g fill="${c}">${ARMS[look.arms]}<ellipse cx="94" cy="155" rx="12" ry="6"/><ellipse cx="126" cy="155" rx="12" ry="6"/></g>
        <path d="M110 64 C152 64 168 92 168 118 C168 144 144 156 110 156 C76 156 52 144 52 118 C52 92 68 64 110 64 Z" fill="${c}"/>
        ${top}
        ${pw.rim}
        <ellipse cx="92" cy="84" rx="14" ry="7" fill="#fff" opacity=".4" transform="rotate(-20 92 84)"/>
        <ellipse cx="78" cy="118" rx="8" ry="5" fill="#ff8a80" opacity="${blush}"/>
        <ellipse cx="142" cy="118" rx="8" ry="5" fill="#ff8a80" opacity="${blush}"/>
        ${EYES[look.eyes]}${MOUTH[look.mouth]}${front}
      </g>
      ${post}${pw.front}${subMarks(L)}${stress}
    </svg>`;
  }

  // ---------- 主體動作：由 JS 每一格計算（不依賴 CSS 動畫，手機瀏覽器也不會停） ----------
  const TAU = Math.PI * 2;
  const ease = x => .5 - .5 * Math.cos(x * TAU);          // 0→1→0
  const MOTION = {
    'm-bounce': t => { const ph = (t / 900) % 1, up = Math.sin(ph * Math.PI); return { ty: -20 * up, sx: 1 + .08 * (1 - up) - .05 * up, sy: 1 - .08 * (1 - up) + .06 * up }; },
    'm-bounce-big': t => { const ph = (t / 800) % 1, up = Math.sin(ph * Math.PI); return { ty: -28 * up, sx: 1.1 - .16 * up, sy: .9 + .18 * up, r: -3 * up }; },
    'm-hop': t => { const ph = (t / 1300) % 1; if (ph < .6) return {}; const q = (ph - .6) / .4, up = Math.sin(q * Math.PI); return { ty: -10 * up, sx: 1 + .05 * Math.sin(q * TAU), sy: 1 - .05 * Math.sin(q * TAU) }; },
    'm-sway': t => { const ph = (t / 2400) % 1; return { r: 5 * Math.sin(ph * TAU), ty: -3 * ease(ph * 2 % 1) }; },
    'm-breathe': t => { const e = ease((t / 3000) % 1); return { sx: 1 + .03 * e, sy: 1 - .03 * e }; },
    'm-fidget': t => { const ph = (t / 2200) % 1; return { r: ph < .6 ? 3 * Math.sin(ph / .6 * TAU * 1.5) * (1 - ph / .6) : 0 }; },
    'm-shake': t => { const ph = (t / 1600) % 1; return { tx: ph > .6 && ph < .82 ? 3 * Math.sin((ph - .6) * 90) : 0 }; },
    'm-droop': t => { const e = ease((t / 3200) % 1); return { sx: 1.04 + .03 * e, sy: .94 - .04 * e, ty: 2 * e }; },
    'm-shiver': t => { const e = ease((t / 3200) % 1); return { tx: 1.5 * Math.sin(t / 40), sx: 1.04 + .03 * e, sy: .94 - .04 * e, ty: 2 * e }; },
  };
  function tick(now) {
    document.querySelectorAll('svg.mascot.js:not(.still) g.body[data-anim]').forEach(g => {
      const f = MOTION[g.dataset.anim];
      if (!f) return;
      const m = f(now);
      const pk = +(g.dataset.poke || 0);
      if (pk && now - pk < 520) {                      // 被戳一下：跳起來再彈回
        const q = (now - pk) / 520, up = Math.sin(q * Math.PI);
        m.ty = (m.ty || 0) - 24 * up; m.sx = (m.sx || 1) * (1 - .08 * up + .1 * Math.max(0, q - .6)); m.sy = (m.sy || 1) * (1 + .1 * up);
      }
      g.setAttribute('transform', `translate(${(110 + (m.tx || 0)).toFixed(2)} ${(156 + (m.ty || 0)).toFixed(2)}) rotate(${(m.r || 0).toFixed(2)}) scale(${(m.sx || 1).toFixed(3)} ${(m.sy || 1).toFixed(3)}) translate(-110 -156)`);
    });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  function poke(svg) { const g = svg && svg.querySelector('g.body'); if (g) g.dataset.poke = performance.now(); }

  // 看門狗：其他特效若被瀏覽器暫停就繼續播放
  function wake(root = document) {
    root.querySelectorAll('svg.mascot:not(.still)').forEach(svg => {
      try { if (svg.animationsPaused && svg.animationsPaused()) svg.unpauseAnimations(); } catch (e) { /* ignore */ }
      try { svg.getAnimations({ subtree: true }).forEach(a => { if (a.playState === 'paused' || a.playState === 'idle') a.play(); }); } catch (e) { /* ignore */ }
    });
  }
  setInterval(() => { if (document.visibilityState === 'visible') wake(); }, 2000);
  ['pageshow', 'focus', 'touchend'].forEach(ev => window.addEventListener(ev, () => wake(), { passive: true }));
  document.addEventListener('scroll', () => wake(), { passive: true, capture: true });

  // ---------- 數字跳動 ----------
  const lastVals = new WeakMap();
  function countTo(el, to, fmt, ms = 700) {
    const from = lastVals.has(el) ? lastVals.get(el) : 0;
    lastVals.set(el, to);
    if (from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- 存檔小煙火（自繪金幣、星星、愛心） ----------
  function burst(kind = 'coin') {
    const box = document.createElement('div');
    box.className = 'burst';
    const shapes = kind === 'coin'
      ? [`<svg viewBox="0 0 20 20" width="22" height="22">${Icon.coin(10, 10, 8)}</svg>`, `<svg viewBox="0 0 20 20" width="18" height="18">${Icon.spark(10, 10, 2.2)}</svg>`]
      : [`<svg viewBox="0 0 20 20" width="20" height="20">${Icon.spark(10, 10, 2.2, '#9fe3c4')}</svg>`, `<svg viewBox="0 0 48 48" width="20" height="20"><path d="M24 41 C10 31 5 24 5 17 a9 9 0 0 1 19 -4 a9 9 0 0 1 19 4 c0 7 -5 14 -19 24z" fill="#ff8fa3"/></svg>`];
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.innerHTML = shapes[i % shapes.length];
      const a = Math.random() * Math.PI * 2, r = 80 + Math.random() * 90;
      s.style.setProperty('--x', `${Math.cos(a) * r}px`);
      s.style.setProperty('--y', `${Math.sin(a) * r - 60}px`);
      s.style.animationDelay = `${Math.random() * 80}ms`;
      box.appendChild(s);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 1100);
  }

  return { esc, bankIcon, carSVG, carIcon, sparkline, openPicker, levelOf, mascotSVG, countTo, burst, poke, wake };
})();
