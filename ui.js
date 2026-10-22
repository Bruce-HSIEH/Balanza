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

  // 可愛小車（自繪，不使用品牌標誌）
  function carSVG(type = 'sedan', color = '#e53935', size = 40) {
    const eye = (x, y) => `<circle cx="${x}" cy="${y}" r="3.2" fill="#fff"/><circle cx="${x + .8}" cy="${y + .3}" r="1.7" fill="#222"/><circle cx="${x + 1.4}" cy="${y - .5}" r=".6" fill="#fff"/>`;
    const wheel = x => `<circle cx="${x}" cy="35" r="6" fill="#2b2b2b"/><circle cx="${x}" cy="35" r="2.4" fill="#cfd8dc"/>`;
    if (type === 'scooter') {
      return `<svg class="car" viewBox="0 0 64 44" width="${size}" height="${size * 44 / 64}" aria-hidden="true">
        <path d="M14 30 Q14 20 26 20 L40 20 Q46 20 47 14 L49 6" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round"/>
        <rect x="20" y="22" width="26" height="9" rx="4.5" fill="${color}"/>
        <rect x="18" y="16" width="16" height="5" rx="2.5" fill="#5d4037"/>
        <circle cx="50" cy="8" r="4.5" fill="${color}"/>${eye(49, 8)}
        <path d="M45 6 L54 5" stroke="#455a64" stroke-width="2" stroke-linecap="round"/>
        ${wheel(15)}${wheel(48)}</svg>`;
    }
    const cabins = {
      sedan: 'M18 20 L24 10 Q25 8 28 8 L40 8 Q43 8 45 10 L51 20 Z',
      hatch: 'M14 20 L16 10 Q17 8 20 8 L38 8 Q41 8 43 10 L50 20 Z',
      suv: 'M12 20 L13 7 Q13 5 16 5 L42 5 Q45 5 47 7 L52 20 Z',
      sport: 'M22 20 L28 12 Q29 11 32 11 L40 11 Q43 11 45 13 L52 20 Z',
      ev: 'M17 20 L23 9 Q24 7 27 7 L41 7 Q44 7 46 9 L52 20 Z',
    };
    const glass = { sedan: 'M22 19 L26 11 L36 11 L36 19 Z M38 19 L38 11 L43 11 L48 19 Z', hatch: 'M17 19 L19 11 L32 11 L32 19 Z M34 19 L34 11 L40 11 L46 19 Z', suv: 'M15 19 L16 8 L30 8 L30 19 Z M32 19 L32 8 L43 8 L48 19 Z', sport: 'M26 19 L30 13 L42 13 L48 19 Z', ev: 'M21 19 L25 10 L37 10 L37 19 Z M39 19 L39 10 L44 10 L49 19 Z' };
    return `<svg class="car" viewBox="0 0 64 44" width="${size}" height="${size * 44 / 64}" aria-hidden="true">
      <path d="${cabins[type] || cabins.sedan}" fill="${color}"/>
      <path d="${glass[type] || glass.sedan}" fill="#bbdefb" opacity=".9"/>
      <rect x="6" y="18" width="52" height="17" rx="7" fill="${color}"/>
      <rect x="6" y="18" width="52" height="17" rx="7" fill="none" stroke="rgba(0,0,0,.12)"/>
      ${eye(52, 24)}
      <path d="M50 30 Q53 32.5 56 30" stroke="#222" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <ellipse cx="45" cy="29" rx="2.4" ry="1.4" fill="#ff8a80" opacity=".8"/>
      <rect x="5" y="22" width="4" height="4" rx="1.5" fill="#ffab91"/>
      ${type === 'ev' ? '<path d="M30 21 L26 28 L30 28 L28 33 L34 25 L30 25 L32 21 Z" fill="#ffeb3b"/>' : ''}
      ${type === 'sport' ? '<path d="M6 17 L13 17 L13 14" stroke="#333" stroke-width="2" fill="none"/>' : ''}
      ${wheel(18)}${wheel(46)}</svg>`;
  }
  const carIcon = brand => `<span class="ico ico-car">${carSVG(brand?.t || 'sedan', brand?.c || '#ff8a80', 38)}</span>`;

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

  // 每個等級的造型
  const LOOK = {
    6: { eyes: 'sparkle', mouth: 'grin', arms: 'wave', anim: 'm-bounce-big', fx: ['rainbow', 'aura', 'firework', 'coins', 'sparks'], acc: ['cape', 'shades', 'crown'] },
    5: { eyes: 'sparkle', mouth: 'grin', arms: 'wave', anim: 'm-bounce', fx: ['coins', 'sparks'], acc: ['shades', 'bag'] },
    4: { eyes: 'happy', mouth: 'big', arms: 'wave', anim: 'm-bounce', fx: ['coins', 'sparks'], acc: [] },
    3: { eyes: 'happy', mouth: 'big', arms: 'hold', anim: 'm-hop', fx: ['sun', 'sparks'], acc: ['coin'] },
    2: { eyes: 'dot', mouth: 'smile', arms: 'rest', anim: 'm-sway', fx: ['sun'], acc: [] },
    1: { eyes: 'dot', mouth: 'smile', arms: 'rest', anim: 'm-breathe', fx: ['leaf'], acc: ['sprout'] },
    0: { eyes: 'sleep', mouth: 'o', arms: 'sleep', anim: 'm-breathe', fx: ['zz'], acc: [] },
    '-1': { eyes: 'nervous', mouth: 'wavy', arms: 'side', anim: 'm-fidget', fx: ['cloudlet', 'sweat1'], acc: [] },
    '-2': { eyes: 'worried', mouth: 'wavy', arms: 'side', anim: 'm-shake', fx: ['sweat', 'flybill'], acc: [] },
    '-3': { eyes: 'sad', mouth: 'frown', arms: 'droop', anim: 'm-droop', fx: ['cloud', 'drizzle', 'tear1'], acc: [] },
    '-4': { eyes: 'sad', mouth: 'frown', arms: 'droop', anim: 'm-droop', fx: ['cloud', 'rain', 'tears'], acc: ['bandage'] },
    '-5': { eyes: 'cry', mouth: 'wail', arms: 'droop', anim: 'm-shiver', fx: ['storm', 'rain', 'bolt', 'tears'], acc: ['bandage', 'wallet'] },
  };

  const FX = {
    coins: () => [[30, 0], [70, .6], [150, .3], [190, .9], [110, 1.3], [50, 1.7], [170, 2.0]].map(([x, d]) =>
      `<g class="coin" style="animation-delay:${d}s">${Icon.coin(x, 0, 7)}</g>`).join(''),
    sparks: () => [[40, 50], [184, 64], [158, 14], [24, 96]].map(([x, y], i) => `<g class="spark" style="animation-delay:${i * .35}s">${Icon.spark(x, y, 1.6, '#fff59d')}</g>`).join(''),
    sun: () => `<g class="sun"><circle cx="186" cy="26" r="12" fill="#ffd54f"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="186" y1="8" x2="186" y2="2" stroke="#ffd54f" stroke-width="3" stroke-linecap="round" transform="rotate(${a} 186 26)"/>`).join('')}</g><g transform="translate(186 26)">${Icon.face(0, -1, .7, 'happy')}</g>`,
    leaf: () => `<path class="leaf" d="M30 40 q8 -10 14 0 q-6 6 -14 0z" fill="#a5e3b0"/><path class="leaf" style="animation-delay:1.4s" d="M176 60 q8 -10 14 0 q-6 6 -14 0z" fill="#c8f0d0"/>`,
    zz: () => `<text class="zz" x="150" y="70" font-size="16" font-weight="700" fill="#90a4ae">Z</text><text class="zz" style="animation-delay:.8s" x="164" y="54" font-size="12" font-weight="700" fill="#90a4ae">z</text>`,
    cloudlet: () => `<g class="cloud"><ellipse cx="170" cy="30" rx="20" ry="9" fill="#cfd8dc"/><ellipse cx="160" cy="25" rx="10" ry="9" fill="#cfd8dc"/><ellipse cx="176" cy="22" rx="11" ry="10" fill="#cfd8dc"/></g>`,
    sweat1: () => `<path class="sweat" d="M148 82 Q154 92 148 96 Q142 92 148 82 Z" fill="#81d4fa"/>`,
    sweat: () => `<path class="sweat" d="M148 82 Q154 92 148 96 Q142 92 148 82 Z" fill="#81d4fa"/><path class="sweat" style="animation-delay:.7s" d="M72 86 Q77 94 72 97 Q67 94 72 86 Z" fill="#81d4fa"/>`,
    flybill: () => [0, 1].map(i => `<g class="flybill" style="animation-delay:${i * 1.3}s"><rect x="160" y="60" width="22" height="13" rx="3" fill="#8ce0a8"/><circle cx="171" cy="66.5" r="3.5" fill="#c8f5d6"/><path d="M162 60 q-8 -8 -4 -12 q5 2 8 10z M180 60 q8 -8 4 -12 q-5 2 -8 10z" fill="#fff" stroke="#cfd8dc"/></g>`).join(''),
    cloud: () => `<g class="cloud"><ellipse cx="110" cy="30" rx="44" ry="16" fill="#90a4ae"/><ellipse cx="88" cy="24" rx="20" ry="16" fill="#90a4ae"/><ellipse cx="128" cy="20" rx="24" ry="18" fill="#90a4ae"/></g>`,
    storm: () => `<g class="cloud"><ellipse cx="110" cy="28" rx="60" ry="18" fill="#607d8b"/><ellipse cx="78" cy="20" rx="26" ry="18" fill="#607d8b"/><ellipse cx="132" cy="14" rx="30" ry="20" fill="#546e7a"/><ellipse cx="160" cy="24" rx="20" ry="14" fill="#607d8b"/></g>`,
    drizzle: () => [92, 110, 128].map((x, i) => `<line class="rain" style="animation-delay:${i * .25}s" x1="${x}" y1="46" x2="${x - 2}" y2="54" stroke="#81d4fa" stroke-width="2.5" stroke-linecap="round"/>`).join(''),
    rain: () => [64, 78, 94, 110, 126, 142, 156].map((x, i) => `<line class="rain fast" style="animation-delay:${i * .11}s" x1="${x}" y1="46" x2="${x - 4}" y2="58" stroke="#4fc3f7" stroke-width="2.5" stroke-linecap="round"/>`).join(''),
    bolt: () => `<path class="bolt" d="M150 30 L138 52 L148 52 L140 72 L160 46 L150 46 L158 30 Z" fill="#ffeb3b" stroke="#fbc02d" stroke-width="1.5"/>`,
    tear1: () => `<path class="tear" d="M90 112 Q94 120 90 123 Q86 120 90 112 Z" fill="#4fc3f7"/>`,
    tears: () => `<path class="tear" d="M90 112 Q94 120 90 123 Q86 120 90 112 Z" fill="#4fc3f7"/><path class="tear" style="animation-delay:.5s" d="M130 112 Q134 120 130 123 Q126 120 130 112 Z" fill="#4fc3f7"/><path class="tear" style="animation-delay:1s" d="M88 112 Q92 120 88 123 Q84 120 88 112 Z" fill="#4fc3f7"/>`,
    rainbow: () => `<g class="rainbow" fill="none" stroke-width="7">${['#ff8a80', '#ffd180', '#ffff8d', '#b9f6ca', '#80d8ff', '#b388ff'].map((c, i) => `<path d="M${14 + i * 7} 150 A${96 - i * 7} ${96 - i * 7} 0 0 1 ${206 - i * 7} 150" stroke="${c}" opacity=".55"/>`).join('')}</g>`,
    aura: () => `<circle class="aura" cx="110" cy="112" r="64" fill="#fff59d" opacity=".35"/>`,
    firework: () => [[34, 30, '#ff8fa3', 0], [190, 40, '#80d8ff', .8], [170, 6, '#b9f6ca', 1.5]].map(([x, y, c, d]) => `<g class="firework" style="animation-delay:${d}s;transform-origin:${x}px ${y}px">${Array.from({ length: 8 }, (_, i) => `<line x1="${x}" y1="${y}" x2="${x + 12 * Math.cos(i * Math.PI / 4)}" y2="${y + 12 * Math.sin(i * Math.PI / 4)}" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>`).join('')}</g>`).join(''),
  };

  const ACC = {
    sprout: () => `<g class="sprout"><path d="M110 64 v-14" stroke="#5cc485" stroke-width="3.5" stroke-linecap="round"/><path d="M110 54 c-14 0 -16 -12 -15 -16 c9 -1 15 5 15 16z" fill="#8ce0a8"/><path d="M110 52 c12 0 15 -10 14 -14 c-8 -1 -14 4 -14 14z" fill="#b8f0c8"/></g>`,
    antenna: c => `<path d="M110 64 L110 54" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><circle cx="110" cy="51" r="5" fill="${c}"/>`,
    coin: () => `<g class="held">${Icon.coin(110, 140, 13)}</g>`,
    bag: () => `<g class="held"><path d="M98 128 q12 -8 24 0 l-3 4 h-18z" fill="#c6a477"/><path d="M96 134 q-10 8 -8 16 c2 7 10 9 22 9 s20 -2 22 -9 q2 -8 -8 -16z" fill="#e3c08d"/><text x="110" y="152" text-anchor="middle" font-size="13" font-weight="800" fill="#8a6a3c">$</text></g>`,
    shades: () => `<g><rect x="80" y="95" width="25" height="15" rx="6" fill="#263238"/><rect x="115" y="95" width="25" height="15" rx="6" fill="#263238"/><path d="M105 100 h10" stroke="#263238" stroke-width="3"/><path d="M84 99 l8 0" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/><path d="M119 99 l8 0" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/></g>`,
    crown: () => `<g class="crown"><path d="M88 66 L92 44 L102 56 L110 38 L118 56 L128 44 L132 66 Z" fill="#ffca28" stroke="#f9a825" stroke-width="2.5" stroke-linejoin="round"/><circle cx="110" cy="56" r="3.5" fill="#ff5252"/><circle cx="96" cy="60" r="2.5" fill="#40c4ff"/><circle cx="124" cy="60" r="2.5" fill="#69f0ae"/></g>`,
    cape: () => `<path class="cape" d="M70 92 Q60 140 50 160 L170 160 Q160 140 150 92 Z" fill="#e53935"/><path d="M70 92 Q110 108 150 92" stroke="#ffca28" stroke-width="4" fill="none"/>`,
    bandage: () => `<g transform="rotate(-25 146 84)"><rect x="132" y="79" width="28" height="10" rx="5" fill="#ffe0b2"/><rect x="142" y="79" width="8" height="10" fill="#ffcc80"/></g>`,
    wallet: () => `<g class="held"><rect x="94" y="134" width="32" height="20" rx="4" fill="#a1887f"/><path d="M94 138 h32" stroke="#8d6e63" stroke-width="2"/></g><g class="fly"><circle cx="150" cy="128" r="2.5" fill="#455a64"/><ellipse cx="148" cy="125" rx="3" ry="1.6" fill="#fff" opacity=".8"/><ellipse cx="152" cy="125" rx="3" ry="1.6" fill="#fff" opacity=".8"/></g>`,
  };

  function mascotSVG(L, opts = {}) {
    const look = LOOK[L.lv];
    const c = L.color;
    const behind = look.acc.includes('cape') ? ACC.cape() : '';
    const pre = look.fx.filter(f => ['rainbow', 'aura'].includes(f)).map(f => FX[f]()).join('');
    const post = look.fx.filter(f => !['rainbow', 'aura'].includes(f)).map(f => FX[f]()).join('');
    const top = look.acc.includes('sprout') ? ACC.sprout() : look.acc.includes('crown') ? '' : ACC.antenna(L.lv >= 4 ? '#ffb300' : L.lv < 0 ? '#90a4ae' : '#8ce0a8');
    const accFront = look.acc.filter(a => !['sprout', 'cape'].includes(a)).map(a => ACC[a]()).join('');
    const stress = opts.stress && L.lv > 0 ? FX.sweat1() : '';
    const blush = L.lv <= -3 ? .25 : .6;
    return `<svg viewBox="0 -12 220 182" class="mascot lv${L.lv < 0 ? 'n' + -L.lv : L.lv}" role="img" aria-label="${esc(L.name)}">
      ${pre}
      <ellipse class="shadow" cx="110" cy="160" rx="46" ry="6" fill="rgba(0,0,0,.12)"/>
      <g class="body ${opts.still ? '' : look.anim}">
        ${behind}
        <g fill="${c}">${ARMS[look.arms]}<ellipse cx="94" cy="155" rx="12" ry="6"/><ellipse cx="126" cy="155" rx="12" ry="6"/></g>
        ${top}
        <path d="M110 64 C152 64 168 92 168 118 C168 144 144 156 110 156 C76 156 52 144 52 118 C52 92 68 64 110 64 Z" fill="${c}"/>
        <ellipse cx="92" cy="84" rx="14" ry="7" fill="#fff" opacity=".4" transform="rotate(-20 92 84)"/>
        <ellipse cx="78" cy="118" rx="8" ry="5" fill="#ff8a80" opacity="${blush}"/>
        <ellipse cx="142" cy="118" rx="8" ry="5" fill="#ff8a80" opacity="${blush}"/>
        ${EYES[look.eyes]}${MOUTH[look.mouth]}${accFront}
      </g>
      ${post}${stress}
    </svg>`;
  }

  // ---------- 數字跳動 ----------
  const lastVals = new WeakMap();
  function countTo(el, to, fmt, ms = 700) {
    const from = lastVals.has(el) ? lastVals.get(el) : 0;
    lastVals.set(el, to);
    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
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

  return { esc, bankIcon, carSVG, carIcon, sparkline, openPicker, levelOf, mascotSVG, countTo, burst };
})();
