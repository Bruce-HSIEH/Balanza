'use strict';
// 自繪可愛圖示庫（全部 SVG，不使用 emoji 或外部圖片）
// 用法：Icon('piggy') 回傳 <span class="ico"><svg>…</svg></span>

const Icon = (() => {
  const INK = '#3b3a3f';
  // 小臉：眼睛、嘴巴、腮紅
  const face = (x, y, s = 1, mood = 'smile') => {
    const e = 3.6 * s, r = 1.5 * s;
    let eyes = `<circle cx="${x - e}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${x + e}" cy="${y}" r="${r}" fill="${INK}"/>`;
    if (mood === 'happy') eyes = `<path d="M${x - e - 1.6 * s} ${y + .6 * s}q${1.6 * s} ${-2.4 * s} ${3.2 * s} 0M${x + e - 1.6 * s} ${y + .6 * s}q${1.6 * s} ${-2.4 * s} ${3.2 * s} 0" stroke="${INK}" stroke-width="${1.3 * s}" fill="none" stroke-linecap="round"/>`;
    if (mood === 'sleep') eyes = `<path d="M${x - e - 1.6 * s} ${y}q${1.6 * s} ${1.8 * s} ${3.2 * s} 0M${x + e - 1.6 * s} ${y}q${1.6 * s} ${1.8 * s} ${3.2 * s} 0" stroke="${INK}" stroke-width="${1.2 * s}" fill="none" stroke-linecap="round"/>`;
    const mouth = mood === 'sad'
      ? `<path d="M${x - 1.8 * s} ${y + 4 * s}q${1.8 * s} ${-1.8 * s} ${3.6 * s} 0" stroke="${INK}" stroke-width="${1.2 * s}" fill="none" stroke-linecap="round"/>`
      : `<path d="M${x - 1.8 * s} ${y + 2.6 * s}q${1.8 * s} ${2 * s} ${3.6 * s} 0" stroke="${INK}" stroke-width="${1.2 * s}" fill="none" stroke-linecap="round"/>`;
    return eyes + mouth + `<ellipse cx="${x - e - 2.2 * s}" cy="${y + 2.4 * s}" rx="${1.7 * s}" ry="${1.1 * s}" fill="#ff8fa3" opacity=".7"/><ellipse cx="${x + e + 2.2 * s}" cy="${y + 2.4 * s}" rx="${1.7 * s}" ry="${1.1 * s}" fill="#ff8fa3" opacity=".7"/>`;
  };
  const shine = (x, y, w = 5, h = 2.4, rot = -25) => `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${h}" fill="#fff" opacity=".55" transform="rotate(${rot} ${x} ${y})"/>`;
  const coin = (x, y, r = 7, label = '$', c = '#ffd166', d = '#f4a62a') =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="${d}" stroke-width="${r * .22}"/><text x="${x}" y="${y + r * .38}" text-anchor="middle" font-size="${r * 1.05}" font-weight="800" fill="${d}" font-family="Arial Rounded MT Bold,Arial,sans-serif">${label}</text>`;
  const spark = (x, y, s = 1, c = '#ffe066') => `<path d="M${x} ${y - 4 * s}L${x + 1.2 * s} ${y - 1.2 * s}L${x + 4 * s} ${y}L${x + 1.2 * s} ${y + 1.2 * s}L${x} ${y + 4 * s}L${x - 1.2 * s} ${y + 1.2 * s}L${x - 4 * s} ${y}L${x - 1.2 * s} ${y - 1.2 * s}Z" fill="${c}"/>`;

  const house = (roof = '#ff7b7b', wall = '#fff1d6') => `
    <path d="M8 23 L24 9 L40 23" fill="${roof}"/><path d="M6.5 24 L24 8.5 L41.5 24" stroke="${roof}" stroke-width="4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="11" y="22" width="26" height="19" rx="4" fill="${wall}"/>
    <rect x="31" y="11" width="4" height="8" rx="1" fill="${roof}"/>
    <rect x="20.5" y="31" width="7" height="10" rx="3" fill="#c98b5e"/>${face(24, 26.5, .8)}`;
  const board = (bg, line, badge) => `
    <rect x="6" y="8" width="36" height="30" rx="8" fill="${bg}"/>
    <rect x="10" y="12" width="28" height="18" rx="4" fill="#fff" opacity=".9"/>
    <path d="M13 26 L19 20 L24 23 L33 15" stroke="${line}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M29 15 L33.5 14.5 L33 19" stroke="${line}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="19" y="38" width="10" height="4" rx="2" fill="${bg}"/>${face(24, 34, .6)}
    <circle cx="38" cy="10" r="6.5" fill="#fff" stroke="${bg}" stroke-width="1.6"/><text x="38" y="12.6" text-anchor="middle" font-size="7.2" font-weight="800" fill="${line}" font-family="Arial,sans-serif">${badge}</text>`;
  const blob = (x, y, r, c) => `<path d="M${x} ${y - r}C${x + r * 1.15} ${y - r} ${x + r * 1.1} ${y + r} ${x} ${y + r}C${x - r * 1.1} ${y + r} ${x - r * 1.15} ${y - r} ${x} ${y - r}Z" fill="${c}"/>`;
  const box = (c = '#c8a2ff', lid = '#b388ff') => `<rect x="9" y="17" width="30" height="23" rx="5" fill="${c}"/><path d="M7 14 h34 v6 a2 2 0 0 1 -2 2 h-30 a2 2 0 0 1 -2 -2 z" fill="${lid}"/><rect x="21" y="14" width="6" height="8" fill="#ffe08a"/>${face(24, 30, .85)}`;
  const flagCoin = (label, c, d) => `${coin(24, 24, 16, label, c, d)}${shine(17, 15, 4, 2)}`;
  const building = (floors, w, c, dx = 0, withFace = true) => {
    const x = 24 - w / 2 + dx, top = 42 - floors * 5.5 - 6;
    let win = '';
    for (let f = 0; f < floors; f++) {
      const y = top + 4 + f * 5.5;
      if (withFace && y > 26) break;
      for (let i = 0; i < Math.max(1, Math.floor((w - 4) / 6)); i++) win += `<rect x="${x + 3 + i * 6}" y="${y}" width="3.2" height="3" rx=".8" fill="#fff" opacity=".85"/>`;
    }
    return `<rect x="${x}" y="${top}" width="${w}" height="${42 - top}" rx="4" fill="${c}"/>${win}` +
      (withFace ? `<rect x="${24 + dx - 7}" y="29.5" width="14" height="9" rx="4" fill="#fff" opacity=".9"/>${face(24 + dx, 33, .5)}` : '');
  };

  const P = {
    // ---- 資產類別 ----
    cash: `<rect x="5" y="13" width="38" height="23" rx="5" fill="#8ce0a8"/><rect x="8" y="16" width="32" height="17" rx="3" fill="none" stroke="#5cc485" stroke-width="1.4" stroke-dasharray="2 2"/><circle cx="24" cy="24.5" r="7" fill="#c8f5d6"/>${face(24, 23.5, .7)}<circle cx="11.5" cy="20" r="1.6" fill="#5cc485"/><circle cx="36.5" cy="29" r="1.6" fill="#5cc485"/>`,
    tw: board('#ff8a80', '#e53935', '台'),
    us: board('#7cb7ff', '#1e6fd9', 'US'),
    fund: `<path d="M10 22 h28 l-3 17 a3 3 0 0 1 -3 2.5 h-16 a3 3 0 0 1 -3 -2.5 z" fill="#ffc46b"/><path d="M10 22 h28" stroke="#e8a33d" stroke-width="3" stroke-linecap="round"/><path d="M15 22 q9 -16 18 0" stroke="#e8a33d" stroke-width="2.6" fill="none"/>${coin(19, 17, 5)}${coin(28, 15, 5)}${face(24, 31, .8)}`,
    bond: `<rect x="11" y="9" width="24" height="30" rx="3" fill="#fff4dc"/><path d="M11 12 a4 4 0 0 0 -4 4 v1 h8 v-5z M35 36 a4 4 0 0 0 4 -4 v-1 h-8 v5z" fill="#f2d49b"/><rect x="11" y="9" width="24" height="30" rx="3" fill="none" stroke="#e7c27a" stroke-width="1.6"/><path d="M16 15 h14 M16 19 h10" stroke="#d4a64c" stroke-width="1.8" stroke-linecap="round"/>${face(23, 27, .75)}<circle cx="33" cy="35" r="4.5" fill="#ff7b7b"/><path d="M31 38 l-1 5 3-2 3 2 -1-5" fill="#ff7b7b"/>`,
    crypto: `<path d="M24 6 l15 9 v18 l-15 9 l-15 -9 v-18 z" fill="#ffd166"/><path d="M24 10 l11.5 7 v14 l-11.5 7 l-11.5 -7 v-14 z" fill="#ffe29a"/>${face(24, 24, .9)}${spark(38, 9, .8, '#fff')}`,
    insurance: `<path d="M24 6 C30 10 36 10 39 10 C39 27 33 37 24 42 C15 37 9 27 9 10 C12 10 18 10 24 6 Z" fill="#7fd6c2"/><path d="M24 11 C29 14 33 14 35 14 C35 27 31 34 24 38 C17 34 13 27 13 14 C15 14 19 14 24 11 Z" fill="#b6efe1"/>${face(24, 22, .8)}<path d="M24 34 c-4 -3 -6 -5 -4 -7 c1.3 -1.3 3 -.6 4 .8 c1 -1.4 2.7 -2.1 4 -.8 c2 2 0 4 -4 7z" fill="#ff8fa3"/>`,
    property: house(),
    other: box(),
    // ---- 負債類型 ----
    mortgage: house('#9b8cff', '#efeaff') + `<circle cx="38" cy="36" r="5" fill="#ffd166" stroke="#f4a62a" stroke-width="1.5"/><path d="M38 41 v4 h2" stroke="#f4a62a" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    loan: `<path d="M17 12 q7 -6 14 0 l-2 3 h-10 z" fill="#c6a477"/><path d="M14 18 q-6 6 -6 13 c0 7 6 11 16 11 s16 -4 16 -11 q0 -7 -6 -13 z" fill="#e3c08d"/><rect x="16" y="15" width="16" height="4" rx="2" fill="#a8845a"/>${face(24, 28, .9)}<path d="M8 20 q-5 -3 -4 -8 q4 1 6 5z M40 20 q5 -3 4 -8 q-4 1 -6 5z" fill="#fff" stroke="#d9e2ec" stroke-width="1"/>`,
    student: `${blob(24, 29, 12, '#ffd7a8')}${face(24, 30, .9)}<path d="M8 17 L24 10 L40 17 L24 24 Z" fill="#4a4e69"/><rect x="17" y="18" width="14" height="5" rx="1" fill="#4a4e69"/><path d="M36 18.5 v8" stroke="#ffd166" stroke-width="1.6"/><circle cx="36" cy="27.5" r="1.8" fill="#ffd166"/>`,
    card: `<rect x="5" y="11" width="38" height="26" rx="6" fill="#b39dfa"/><rect x="5" y="16" width="38" height="5" fill="#7e64e6"/><rect x="9" y="25" width="8" height="6" rx="1.5" fill="#ffd166"/>${face(30, 28, .8)}${shine(12, 13.5, 4, 1.2, 0)}`,
    friends: `${blob(17, 28, 10, '#ffb4a2')}${blob(31, 28, 10, '#a0d8ef')}${face(16, 28, .7, 'happy')}${face(32, 28, .7, 'happy')}<path d="M20 36 q4 3 8 0" stroke="#3b3a3f" stroke-width="1.3" fill="none"/><path d="M24 13 c-3 -3 -6 -1 -4 2 l4 3 4 -3 c2 -3 -1 -5 -4 -2z" fill="#ff6b81"/>`,
    // ---- 介面 ----
    chart: `<rect x="7" y="26" width="8" height="14" rx="3" fill="#a0d8ef"/><rect x="20" y="18" width="8" height="22" rx="3" fill="#8ce0a8"/><rect x="33" y="9" width="8" height="31" rx="3" fill="#ffc46b"/>${face(37, 20, .55)}<path d="M5 41 h38" stroke="#c9d2d8" stroke-width="2" stroke-linecap="round"/>`,
    piggy: `<ellipse cx="24" cy="27" rx="16" ry="12.5" fill="#ffb3c1"/><path d="M13 17 l-1 -7 6 4z M30 15 l5 -5 0 7z" fill="#ff8fa3"/><ellipse cx="38" cy="27" rx="4" ry="3.4" fill="#ff8fa3"/><circle cx="37" cy="27" r=".9" fill="#c9566d"/><circle cx="39.2" cy="27" r=".9" fill="#c9566d"/><circle cx="29" cy="23" r="1.5" fill="${INK}"/><ellipse cx="31" cy="30" rx="1.8" ry="1.1" fill="#ff6b81" opacity=".6"/><rect x="20" y="14" width="8" height="2.4" rx="1.2" fill="#c9566d"/><rect x="14" y="36" width="5" height="6" rx="2" fill="#ff8fa3"/><rect x="27" y="36" width="5" height="6" rx="2" fill="#ff8fa3"/><path d="M8 26 q-4 -1 -3 -4" stroke="#ff8fa3" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    trophy: `<path d="M14 9 h20 v9 a10 10 0 0 1 -20 0z" fill="#ffd166"/><path d="M14 12 h-5 a4 4 0 0 0 5 8 M34 12 h5 a4 4 0 0 1 -5 8" stroke="#f4a62a" stroke-width="2.4" fill="none"/><rect x="21" y="27" width="6" height="7" fill="#f4a62a"/><rect x="15" y="34" width="18" height="6" rx="2" fill="#c08b2c"/>${face(24, 16, .75)}${spark(40, 6, .7)}`,
    gear: `<path d="M21 5h6l1 5 4 2 4-3 4 4-3 4 2 4 5 1v6l-5 1-2 4 3 4-4 4-4-3-4 2-1 5h-6l-1-5-4-2-4 3-4-4 3-4-2-4-5-1v-6l5-1 2-4-3-4 4-4 4 3 4-2z" fill="#b8c4ce"/><circle cx="24" cy="24" r="10" fill="#e3e9ee"/>${face(24, 23.5, .8)}`,
    calendar: `<rect x="7" y="10" width="34" height="31" rx="6" fill="#fff"/><rect x="7" y="10" width="34" height="10" rx="5" fill="#ff7b7b"/><rect x="7" y="16" width="34" height="4" fill="#ff7b7b"/><rect x="14" y="6" width="3.5" height="8" rx="1.7" fill="#c9566d"/><rect x="30.5" y="6" width="3.5" height="8" rx="1.7" fill="#c9566d"/>${face(24, 29, .9)}<rect x="7" y="10" width="34" height="31" rx="6" fill="none" stroke="#e6e9ec" stroke-width="1.5"/>`,
    percent: `<circle cx="24" cy="24" r="17" fill="#a0d8ef"/>${shine(16, 14)}<circle cx="16.5" cy="17" r="3.4" fill="#fff"/><circle cx="31.5" cy="31" r="3.4" fill="#fff"/><path d="M32 15 L16 33" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>`,
    fire: `<path d="M24 5 C28 12 37 16 37 28 C37 36 31 42 24 42 C17 42 11 36 11 28 C11 22 15 18 17 15 C18 19 20 21 22 21 C21 15 22 9 24 5Z" fill="#ff8a5c"/><path d="M24 20 C27 25 31 27 31 32 C31 37 28 39 24 39 C20 39 17 37 17 32 C17 28 21 25 24 20Z" fill="#ffd166"/>${face(24, 32, .65)}`,
    brick: `<rect x="6" y="28" width="17" height="11" rx="2.5" fill="#ff9f7a"/><rect x="25" y="28" width="17" height="11" rx="2.5" fill="#ff9f7a"/><rect x="14" y="15" width="20" height="11" rx="2.5" fill="#ffb59a"/>${face(24, 20, .6)}<path d="M38 13 v-6 M35 10 l3 -3 3 3" stroke="#5cc485" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    bank: `<path d="M5 18 L24 7 L43 18 Z" fill="#7fd6c2"/><rect x="7" y="17" width="34" height="3" rx="1.5" fill="#5bbfa8"/><rect x="10" y="22" width="5" height="13" rx="2" fill="#b6efe1"/><rect x="33" y="22" width="5" height="13" rx="2" fill="#b6efe1"/><rect x="17.5" y="22" width="13" height="13" rx="3" fill="#e2fbf4"/>${face(24, 27.5, .65)}<rect x="6" y="36" width="36" height="5" rx="2.5" fill="#5bbfa8"/>${coin(24, 14, 3.2)}`,
    basket: `<path d="M8 22 h32 l-4 16 a4 4 0 0 1 -4 3 h-16 a4 4 0 0 1 -4 -3z" fill="#e3c08d"/><path d="M13 27 h22 M14 32 h20" stroke="#c6a477" stroke-width="1.6"/><path d="M15 22 q9 -14 18 0" stroke="#c6a477" stroke-width="2.6" fill="none"/><circle cx="18" cy="19" r="4.5" fill="#ff7b7b"/><circle cx="30" cy="19" r="4.5" fill="#8ce0a8"/><circle cx="24" cy="16" r="4.5" fill="#ffd166"/>${face(24, 31.5, .65)}`,
    clock: `<circle cx="24" cy="25" r="16" fill="#ffe08a"/><circle cx="24" cy="25" r="12.5" fill="#fff8e1"/><path d="M24 17 v8 l5 3" stroke="#e8a33d" stroke-width="2.4" fill="none" stroke-linecap="round"/>${face(24, 31, .55)}<path d="M10 11 l5 -4 M38 11 l-5 -4" stroke="#e8a33d" stroke-width="3" stroke-linecap="round"/>`,
    pause: `<circle cx="24" cy="24" r="17" fill="#ffc46b"/>${shine(16, 14)}<rect x="17" y="15" width="5" height="14" rx="2.5" fill="#fff"/><rect x="26" y="15" width="5" height="14" rx="2.5" fill="#fff"/>${face(24, 34, .5)}`,
    play: `<circle cx="24" cy="24" r="17" fill="#8ce0a8"/>${shine(16, 14)}<path d="M20 15 L32 22 L20 29 Z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>${face(24, 34, .5)}`,
    calc: `<rect x="10" y="6" width="28" height="36" rx="7" fill="#a0d8ef"/><rect x="14" y="10" width="20" height="9" rx="2.5" fill="#e8f7fd"/>${face(24, 14, .5)}${[0, 1, 2].map(r => [0, 1, 2].map(c => `<rect x="${14.5 + c * 7}" y="${22.5 + r * 6}" width="5" height="4" rx="1.5" fill="${r === 2 && c === 2 ? '#ff8a80' : '#fff'}"/>`).join('')).join('')}`,
    pencil: `<g transform="rotate(40 24 24)"><rect x="19" y="4" width="10" height="30" rx="2" fill="#ffd166"/><rect x="19" y="4" width="10" height="5" rx="2" fill="#ff8fa3"/><path d="M19 34 h10 l-5 9z" fill="#f2d4a8"/><path d="M22.5 40 h3 l-1.5 3z" fill="${INK}"/>${face(24, 22, .6)}</g>`,
    scale: `<path d="M24 9 v29" stroke="#b8c4ce" stroke-width="3" stroke-linecap="round"/><path d="M10 14 h28" stroke="#b8c4ce" stroke-width="3" stroke-linecap="round"/><path d="M10 14 l-5 11 h10z M38 14 l-5 11 h10z" fill="none" stroke="#b8c4ce" stroke-width="1.6"/><path d="M4 25 a6 4 0 0 0 12 0z M32 25 a6 4 0 0 0 12 0z" fill="#ffd166"/><rect x="16" y="37" width="16" height="5" rx="2.5" fill="#8b9aa6"/><circle cx="24" cy="9" r="4.5" fill="#8ce0a8"/>${face(24, 9.5, .38)}`,
    stairs: `<path d="M7 12 h9 v8 h9 v8 h9 v8 h7 v6 h-34z" fill="#a0d8ef"/>${blob(12, 7, 4.5, '#ffb3c1')}${face(12, 7.5, .4)}<path d="M30 14 l6 6 M36 14 v6 h-6" stroke="#5cc485" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    hourglass: `<rect x="11" y="6" width="26" height="4" rx="2" fill="#c6a477"/><rect x="11" y="38" width="26" height="4" rx="2" fill="#c6a477"/><path d="M14 10 h20 c0 8 -7 10 -7 14 s7 6 7 14 h-20 c0 -8 7 -10 7 -14 s-7 -6 -7 -14z" fill="#e8f7fd"/><path d="M17 13 h14 c-1 4 -5 6 -7 7 c-2 -1 -6 -3 -7 -7z M16 37 c1 -5 5 -7 8 -7 s7 2 8 7z" fill="#ffd166"/>${face(24, 33.5, .45)}`,
    tower: building(6, 18, '#9fb4ff'),
    midrise: building(4, 22, '#b5a6ff'),
    apartment: building(3, 26, '#ffb59a'),
    townhouse: house('#ff9f7a', '#fff1d6'),
    studio: `<rect x="6" y="24" width="36" height="10" rx="4" fill="#a0d8ef"/><rect x="6" y="18" width="10" height="16" rx="4" fill="#7cb7ff"/><rect x="16" y="20" width="12" height="6" rx="3" fill="#fff"/>${face(22, 22.5, .45, 'sleep')}<rect x="8" y="34" width="3" height="5" rx="1" fill="#7cb7ff"/><rect x="37" y="34" width="3" height="5" rx="1" fill="#7cb7ff"/><text x="34" y="16" font-size="7" font-weight="800" fill="#9fb4ff" font-family="Arial">z</text>`,
    shop: `<rect x="9" y="20" width="30" height="21" rx="3" fill="#fff1d6"/><path d="M7 12 h34 l-2 9 h-30z" fill="#ff7b7b"/><path d="M13.5 12 l-1.5 9 M20.5 12 l-.5 9 M27.5 12 l.5 9 M34.5 12 l1.5 9" stroke="#fff" stroke-width="3"/><rect x="13" y="27" width="10" height="14" rx="2" fill="#c98b5e"/>${face(31, 31, .6)}`,
    search: `<circle cx="20" cy="20" r="12" fill="#e8f7fd" stroke="#7cb7ff" stroke-width="4"/>${face(20, 19.5, .6)}<path d="M29 29 l10 10" stroke="#7cb7ff" stroke-width="5" stroke-linecap="round"/>`,
    pin: `<path d="M24 43 C14 31 10 25 10 18 a14 14 0 0 1 28 0 c0 7 -4 13 -14 25z" fill="#ff7b7b"/><circle cx="24" cy="18" r="8" fill="#fff"/>${face(24, 17.5, .55)}`,
    city: `${building(5, 14, '#9fb4ff', -8, false)}${building(3, 16, '#ffb59a', 8)}`,
    road: `<path d="M18 6 h12 l8 36 h-28z" fill="#8b9aa6"/><path d="M24 9 v5 M24 19 v6 M24 30 v7" stroke="#ffd166" stroke-width="2.4" stroke-linecap="round"/>${blob(38, 12, 5, '#8ce0a8')}${face(38, 12.5, .4)}<rect x="37" y="17" width="2" height="6" fill="#c6a477"/>`,
    twd: flagCoin('NT', '#ffd166', '#e09422'),
    usd: flagCoin('$', '#b8e6a6', '#4f9a3b'),
    jpy: flagCoin('¥', '#ffd0d6', '#d9485f'),
    eur: flagCoin('€', '#c7d7ff', '#3d5bd9'),
    coin: `${coin(24, 24, 15)}${shine(17, 15, 4, 2)}`,
    export: `${box('#a0d8ef', '#7cb7ff')}<path d="M24 12 v-9 M19 7 l5 -5 5 5" stroke="#5cc485" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    import: `${box('#ffc46b', '#f4a62a')}<path d="M24 2 v9 M19 7 l5 5 5 -5" stroke="#5cc485" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    warn: `<path d="M24 6 L43 40 H5 Z" fill="#ffd166" stroke="#ffd166" stroke-width="4" stroke-linejoin="round"/>${face(24, 28, .75, 'sad')}<rect x="22.6" y="13" width="2.8" height="7" rx="1.4" fill="${INK}"/>`,
    trash: `<rect x="12" y="15" width="24" height="26" rx="4" fill="#ffb3c1"/><rect x="9" y="10" width="30" height="5" rx="2.5" fill="#ff8fa3"/><rect x="20" y="6" width="8" height="5" rx="2" fill="#ff8fa3"/>${face(24, 27, .75, 'sad')}`,
    plus: `<circle cx="24" cy="24" r="17" fill="#8ce0a8"/><path d="M24 15 v18 M15 24 h18" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
    wallet: `<rect x="6" y="14" width="36" height="25" rx="6" fill="#ffc46b"/><path d="M10 14 l20 -7 3 7" fill="#8ce0a8"/><rect x="28" y="21" width="14" height="11" rx="4" fill="#f4a62a"/><circle cx="33" cy="26.5" r="2" fill="#fff"/>${face(17, 26, .8)}`,
    car: '', // 由 UI.carSVG 產生
    invest: `<path d="M10 30 h28 l-3 11 a3 3 0 0 1 -3 2 h-16 a3 3 0 0 1 -3 -2z" fill="#ffb59a"/><rect x="8" y="27" width="32" height="5" rx="2.5" fill="#ff9f7a"/><path d="M24 27 v-12" stroke="#5cc485" stroke-width="2.6" stroke-linecap="round"/>${coin(16, 15, 5.5)}${coin(32, 12, 5.5)}${coin(24, 7, 5.5)}${face(24, 36, .6)}`,
    chat: `<path d="M8 10 h32 a4 4 0 0 1 4 4 v17 a4 4 0 0 1 -4 4 h-18 l-8 7 v-7 h-6 a4 4 0 0 1 -4 -4 v-17 a4 4 0 0 1 4 -4z" fill="#9fd8ff" stroke="#5aaee8" stroke-width="2" stroke-linejoin="round"/>${face(24, 22, .65)}<path d="M38 5 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4z" fill="#ffd166"/>`,
    mic: `<rect x="16" y="5" width="16" height="25" rx="8" fill="#ff8fa3"/><rect x="16" y="5" width="16" height="25" rx="8" fill="none" stroke="#e9637c" stroke-width="1.5"/>${face(24, 17, .62)}<path d="M11 22 a13 13 0 0 0 26 0" stroke="#7cb7ff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M24 35 v6 M17 42 h14" stroke="#7cb7ff" stroke-width="3" stroke-linecap="round"/><path d="M38 10 q3 3 0 6 M41 7 q5 6 0 12" stroke="#ffc46b" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    repay: `<rect x="7" y="10" width="34" height="31" rx="6" fill="#fff"/><rect x="7" y="10" width="34" height="10" rx="5" fill="#7cb7ff"/><rect x="7" y="16" width="34" height="4" fill="#7cb7ff"/><rect x="14" y="6" width="3.5" height="8" rx="1.7" fill="#1e6fd9"/><rect x="30.5" y="6" width="3.5" height="8" rx="1.7" fill="#1e6fd9"/><rect x="12" y="31" width="5" height="6" rx="1.5" fill="#8ce0a8"/><rect x="20" y="27" width="5" height="10" rx="1.5" fill="#ffc46b"/><rect x="28" y="24" width="5" height="13" rx="1.5" fill="#ff8a80"/>${face(30, 18.5, .45)}<rect x="7" y="10" width="34" height="31" rx="6" fill="none" stroke="#e6e9ec" stroke-width="1.5"/>`,
    sprout: `<path d="M24 42 v-16" stroke="#5cc485" stroke-width="3" stroke-linecap="round"/><path d="M24 28 c-12 0 -14 -10 -13 -14 c8 -1 13 4 13 14z" fill="#8ce0a8"/><path d="M24 26 c10 0 13 -9 12 -13 c-7 -1 -12 3 -12 13z" fill="#b8f0c8"/>${face(17.5, 19.5, .45)}`,
    sleep: `${blob(24, 28, 13, '#e3e9ee')}${face(24, 29, .9, 'sleep')}<text x="34" y="14" font-size="9" font-weight="800" fill="#9fb4ff" font-family="Arial">Z</text><text x="40" y="8" font-size="6" font-weight="800" fill="#9fb4ff" font-family="Arial">z</text>`,
    heart: `<path d="M24 41 C10 31 5 24 5 17 a9 9 0 0 1 19 -4 a9 9 0 0 1 19 4 c0 7 -5 14 -19 24z" fill="#ff8fa3"/>${face(24, 22, .9, 'happy')}`,
    star: `<path d="M24 5 l5.6 11.6 12.6 1.8 -9.1 8.9 2.2 12.6 -11.3 -6 -11.3 6 2.2 -12.6 -9.1 -8.9 12.6 -1.8z" fill="#ffd166" stroke="#ffd166" stroke-width="2" stroke-linejoin="round"/>${face(24, 23, .7)}`,
    up: `<circle cx="24" cy="24" r="17" fill="#ffd7d2"/><path d="M24 33 v-17 M16 23 l8 -8 8 8" stroke="#e53935" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    down: `<circle cx="24" cy="24" r="17" fill="#d4f5dd"/><path d="M24 15 v17 M16 25 l8 8 8 -8" stroke="#2e9e4f" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    eye: `<path d="M4 25 C10 13 38 13 44 25 C38 37 10 37 4 25z" fill="#e8f7fd" stroke="#7cc4e8" stroke-width="2.5"/><circle cx="24" cy="25" r="8" fill="#4a8fc4"/><circle cx="26.5" cy="22.5" r="2.4" fill="#fff"/><ellipse cx="12" cy="31" rx="2" ry="1.2" fill="#ff8fa3" opacity=".7"/><ellipse cx="36" cy="31" rx="2" ry="1.2" fill="#ff8fa3" opacity=".7"/>`,
    lock: `<rect x="10" y="21" width="28" height="20" rx="6" fill="#b5a6ff"/><path d="M16 21 v-5 a8 8 0 0 1 16 0 v5" stroke="#9b8cff" stroke-width="4" fill="none"/>${face(24, 30, .8)}`,
  };

  function svg(name, size = 48) {
    const body = P[name] ?? P.other;
    return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" class="ic ic-${name}">${body}</svg>`;
  }
  // 包成圓角小方塊
  const wrap = (name, cls = '') => `<span class="ico ${cls}">${svg(name)}</span>`;

  const fn = (name, cls) => wrap(name, cls);
  fn.svg = svg;
  fn.coin = coin;
  fn.spark = spark;
  fn.face = face;
  fn.has = n => n in P;
  // 把 HTML 裡的 <i data-ic="name"> 換成圖示
  fn.hydrate = (root = document) => root.querySelectorAll('i[data-ic]').forEach(el => {
    const s = el.dataset.size;
    el.outerHTML = `<span class="ic-inline">${svg(el.dataset.ic, s || 20)}</span>`;
  });
  return fn;
})();
