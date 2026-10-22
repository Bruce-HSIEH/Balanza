'use strict';
// 介面元件：小圖、選擇器、吉祥物、數字動畫

const UI = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 小圖 ----------
  const emoji = e => `<span class="ico ico-emoji">${e}</span>`;

  function bankIcon(b) {
    if (!b) return emoji('🏦');
    if (b.emoji) return emoji(b.emoji);
    return `<span class="ico ico-bank" style="--bc:${b.c}"><b>${esc(b.s)}</b><i>🪙</i></span>`;
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
      <rect x="6" y="18" width="52" height="17" rx="7" fill="url(#none)" stroke="rgba(0,0,0,.12)"/>
      ${eye(52, 24)}
      <path d="M50 30 Q53 32.5 56 30" stroke="#222" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <ellipse cx="45" cy="29" rx="2.4" ry="1.4" fill="#ff8a80" opacity=".8"/>
      <rect x="5" y="22" width="4" height="4" rx="1.5" fill="#ffab91"/>
      ${type === 'ev' ? '<path d="M30 21 L26 28 L30 28 L28 33 L34 25 L30 25 L32 21 Z" fill="#ffeb3b"/>' : ''}
      ${type === 'sport' ? '<path d="M6 17 L13 17 L13 14" stroke="#333" stroke-width="2" fill="none"/>' : ''}
      ${wheel(18)}${wheel(46)}</svg>`;
  }
  const carIcon = brand => `<span class="ico ico-car">${carSVG(brand?.t, brand?.c, 38)}</span>`;

  // ---------- 選擇器（底部彈出） ----------
  let sheet;
  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement('dialog');
    sheet.className = 'sheet';
    sheet.innerHTML = `<div class="sheet-grip"></div><h3 class="sheet-title"></h3>
      <input class="sheet-search" type="search" placeholder="搜尋…" autocomplete="off">
      <ul class="sheet-list"></ul>`;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(''); });
    return sheet;
  }

  function openPicker({ title, options, value, search = options.length > 8 }) {
    const s = ensureSheet();
    s.querySelector('.sheet-title').textContent = title;
    const input = s.querySelector('.sheet-search');
    const list = s.querySelector('.sheet-list');
    input.style.display = search ? '' : 'none';
    input.value = '';
    const draw = q => {
      q = (q || '').trim().toLowerCase();
      const items = options.filter(o => !q || `${o.label} ${o.sub || ''} ${o.value}`.toLowerCase().includes(q));
      list.innerHTML = items.length ? items.map((o, i) => `
        <li><button type="button" data-i="${options.indexOf(o)}" class="${o.value === value ? 'sel' : ''}" style="--d:${Math.min(i, 12) * 18}ms">
          ${o.icon || ''}<span class="opt-text"><span>${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>
          ${o.value === value ? '<span class="check">✓</span>' : ''}
        </button></li>`).join('') : '<li class="empty">找不到符合的項目</li>';
    };
    draw('');
    input.oninput = () => draw(input.value);
    return new Promise(resolve => {
      list.onclick = e => {
        const b = e.target.closest('button[data-i]');
        if (!b) return;
        const o = options[+b.dataset.i];
        s.close('');
        resolve(o);
      };
      s.onclose = () => resolve(null);
      s.showModal();
      if (search && matchMedia('(pointer:fine)').matches) input.focus();
      const sel = list.querySelector('.sel');
      sel && sel.scrollIntoView({ block: 'center' });
    });
  }

  // ---------- 吉祥物「小秤」 ----------
  const MOODS = {
    rich: { color: '#ffd54f', msg: '財務超健康，小秤每天都在跳舞 🎉', anim: 'm-bounce' },
    good: { color: '#a5d6a7', msg: '日子過得穩穩的，繼續保持！', anim: 'm-sway' },
    tight: { color: '#ffcc80', msg: '負債有點重，小秤壓力山大…', anim: 'm-shake' },
    broke: { color: '#b0bec5', msg: '淨資產是負的…小秤在淋雨 🥲', anim: 'm-droop' },
    empty: { color: '#e0e0e0', msg: '還沒有資料，小秤在睡覺 💤', anim: 'm-breathe' },
  };

  function moodOf(s) {
    if (s.totalAssets === 0 && s.totalDebts === 0) return 'empty';
    if (s.netWorth < 0) return 'broke';
    if (s.debtRatio >= 70) return 'tight';
    if (s.debtRatio >= 30) return 'good';
    return 'rich';
  }

  function mascotSVG(mood) {
    const m = MOODS[mood];
    const eyes = {
      rich: '<path d="M84 104 Q92 94 100 104" class="stroke"/><path d="M120 104 Q128 94 136 104" class="stroke"/>',
      good: '<circle cx="92" cy="102" r="5.5" fill="#263238"/><circle cx="128" cy="102" r="5.5" fill="#263238"/><circle cx="94" cy="100" r="1.8" fill="#fff"/><circle cx="130" cy="100" r="1.8" fill="#fff"/>',
      tight: '<circle cx="92" cy="104" r="5" fill="#263238"/><circle cx="128" cy="104" r="5" fill="#263238"/><path d="M83 92 L99 96" class="stroke"/><path d="M137 92 L121 96" class="stroke"/>',
      broke: '<circle cx="92" cy="106" r="5" fill="#263238"/><circle cx="128" cy="106" r="5" fill="#263238"/><path d="M84 96 L99 92" class="stroke"/><path d="M136 96 L121 92" class="stroke"/>',
      empty: '<path d="M85 104 Q92 109 99 104" class="stroke"/><path d="M121 104 Q128 109 135 104" class="stroke"/>',
    }[mood];
    const mouth = {
      rich: '<path d="M96 118 Q110 136 124 118 Z" fill="#c62828"/><path d="M102 126 Q110 132 118 126" fill="#ff8a80"/>',
      good: '<path d="M100 119 Q110 128 120 119" class="stroke"/>',
      tight: '<path d="M100 124 Q105 120 110 124 Q115 128 120 124" class="stroke"/>',
      broke: '<path d="M100 128 Q110 118 120 128" class="stroke"/>',
      empty: '<ellipse cx="110" cy="123" rx="3.5" ry="2.5" fill="#263238"/>',
    }[mood];
    const arms = {
      rich: '<ellipse class="arm-l wave" cx="54" cy="96" rx="8" ry="13" transform="rotate(-35 54 96)"/><ellipse class="arm-r wave" cx="166" cy="96" rx="8" ry="13" transform="rotate(35 166 96)"/>',
      good: '<ellipse cx="56" cy="118" rx="8" ry="12" transform="rotate(20 56 118)"/><ellipse cx="164" cy="118" rx="8" ry="12" transform="rotate(-20 164 118)"/>',
      tight: '<ellipse cx="60" cy="110" rx="8" ry="12" transform="rotate(-10 60 110)"/><ellipse cx="160" cy="110" rx="8" ry="12" transform="rotate(10 160 110)"/>',
      broke: '<ellipse cx="58" cy="128" rx="8" ry="12" transform="rotate(10 58 128)"/><ellipse cx="162" cy="128" rx="8" ry="12" transform="rotate(-10 162 128)"/>',
      empty: '<ellipse cx="58" cy="124" rx="8" ry="12" transform="rotate(25 58 124)"/><ellipse cx="162" cy="124" rx="8" ry="12" transform="rotate(-25 162 124)"/>',
    }[mood];
    let fx = '';
    if (mood === 'rich') {
      fx = [[30, 0], [70, .6], [150, .3], [185, .9], [110, 1.3], [50, 1.7], [170, 2.0]].map(([x, d]) =>
        `<g class="coin" style="animation-delay:${d}s"><circle cx="${x}" cy="0" r="7" fill="#ffca28" stroke="#f9a825" stroke-width="2"/><text x="${x}" y="3.5" text-anchor="middle" font-size="9" font-weight="700" fill="#f57f17">$</text></g>`).join('') +
        [[40, 50], [180, 60], [150, 20]].map(([x, y], i) => `<path class="spark" style="animation-delay:${i * .4}s" d="M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z" fill="#fff59d"/>`).join('');
    } else if (mood === 'good') {
      fx = `<g class="sun"><circle cx="184" cy="30" r="12" fill="#ffd54f"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="184" y1="12" x2="184" y2="6" stroke="#ffd54f" stroke-width="3" stroke-linecap="round" transform="rotate(${a} 184 30)"/>`).join('')}</g>
        <path class="spark" d="M40 40 L42 45 L47 47 L42 49 L40 54 L38 49 L33 47 L38 45 Z" fill="#c5e1a5"/>`;
    } else if (mood === 'tight') {
      fx = `<path class="sweat" d="M148 82 Q154 92 148 96 Q142 92 148 82 Z" fill="#81d4fa"/>
        <path class="sweat" style="animation-delay:.7s" d="M72 86 Q77 94 72 97 Q67 94 72 86 Z" fill="#81d4fa"/>
        <text x="172" y="50" font-size="16" class="float">💸</text>`;
    } else if (mood === 'broke') {
      fx = `<g class="cloud"><ellipse cx="110" cy="30" rx="44" ry="16" fill="#78909c"/><ellipse cx="88" cy="24" rx="20" ry="16" fill="#78909c"/><ellipse cx="128" cy="20" rx="24" ry="18" fill="#78909c"/></g>
        ${[78, 94, 110, 126, 142].map((x, i) => `<line class="rain" style="animation-delay:${i * .17}s" x1="${x}" y1="46" x2="${x - 3}" y2="56" stroke="#4fc3f7" stroke-width="2.5" stroke-linecap="round"/>`).join('')}
        <path class="tear" d="M90 112 Q94 120 90 123 Q86 120 90 112 Z" fill="#4fc3f7"/>
        <path class="tear" style="animation-delay:.6s" d="M130 112 Q134 120 130 123 Q126 120 130 112 Z" fill="#4fc3f7"/>`;
    } else {
      fx = `<text class="zz" x="150" y="70" font-size="16" font-weight="700" fill="#90a4ae">Z</text><text class="zz" style="animation-delay:.8s" x="164" y="54" font-size="12" font-weight="700" fill="#90a4ae">z</text>`;
    }
    return `<svg viewBox="0 -12 220 182" class="mascot mood-${mood}" role="img" aria-label="${esc(m.msg)}">
      <ellipse class="shadow" cx="110" cy="160" rx="46" ry="6" fill="rgba(0,0,0,.12)"/>
      ${fx}
      <g class="body ${m.anim}" style="--mc:${m.color}">
        <g class="limbs" fill="${m.color}">${arms}<ellipse cx="94" cy="155" rx="12" ry="6"/><ellipse cx="126" cy="155" rx="12" ry="6"/></g>
        <path d="M110 64 C152 64 168 92 168 118 C168 144 144 156 110 156 C76 156 52 144 52 118 C52 92 68 64 110 64 Z" fill="${m.color}"/>
        <ellipse cx="92" cy="84" rx="14" ry="7" fill="#fff" opacity=".35" transform="rotate(-20 92 84)"/>
        <ellipse cx="78" cy="118" rx="8" ry="5" fill="#ff8a80" opacity="${mood === 'broke' ? .25 : .6}"/>
        <ellipse cx="142" cy="118" rx="8" ry="5" fill="#ff8a80" opacity="${mood === 'broke' ? .25 : .6}"/>
        ${eyes}${mouth}
        <path d="M110 64 L110 54" class="stroke"/><circle cx="110" cy="51" r="5" fill="${mood === 'rich' ? '#ffb300' : '#90a4ae'}"/>
      </g>
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

  // ---------- 存檔小煙火 ----------
  function burst(emojiSet = ['🪙', '✨', '💰']) {
    const box = document.createElement('div');
    box.className = 'burst';
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.textContent = emojiSet[i % emojiSet.length];
      const a = Math.random() * Math.PI * 2, r = 80 + Math.random() * 90;
      s.style.setProperty('--x', `${Math.cos(a) * r}px`);
      s.style.setProperty('--y', `${Math.sin(a) * r - 60}px`);
      s.style.animationDelay = `${Math.random() * 80}ms`;
      box.appendChild(s);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 1100);
  }

  return { esc, emoji, bankIcon, carSVG, carIcon, openPicker, MOODS, moodOf, mascotSVG, countTo, burst };
})();
