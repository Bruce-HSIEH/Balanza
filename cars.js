'use strict';
// 車輛插圖：依真實車款的車身比例自繪側面圖（車頭朝右），不使用任何品牌標誌
// Car.svg(type, color, width) → SVG 字串；Car.models(brand) → 該品牌常見車款

const Car = (() => {
  // ---- 顏色工具 ----
  function shade(hex, p) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = p < 0 ? 0 : 255, k = Math.abs(p);
    r = Math.round((t - r) * k + r); g = Math.round((t - g) * k + g); b = Math.round((t - b) * k + b);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }
  const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

  // ---- 零件 ----
  const wheel = (x, y, r) => {
    const sp = Array.from({ length: 5 }, (_, i) => {
      const a = (i * 72 - 90) * Math.PI / 180;
      return `<line x1="${x}" y1="${y}" x2="${(x + Math.cos(a) * r * .58).toFixed(1)}" y2="${(y + Math.sin(a) * r * .58).toFixed(1)}" stroke="#9aa3ab" stroke-width="${(r * .16).toFixed(1)}" stroke-linecap="round"/>`;
    }).join('');
    return `<g class="wheel"><circle cx="${x}" cy="${y}" r="${r}" fill="#25282c"/><circle cx="${x}" cy="${y}" r="${r * .66}" fill="#dfe3e7"/>${sp}<circle cx="${x}" cy="${y}" r="${r * .18}" fill="#7d868e"/><circle cx="${x - r * .28}" cy="${y - r * .32}" r="${r * .14}" fill="#fff" opacity=".7"/></g>`;
  };
  const arch = (x, y, r, c) => `<path d="M${x - r - 4} ${y + 2} A${r + 4} ${r + 4} 0 0 1 ${x + r + 4} ${y + 2}" fill="none" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`;

  // 每種車身：body 車身輪廓、glass 車窗、wheels [x, r]、wy 輪心 y、doors 車門縫 x、
  // head/tail 燈、extra 其他細節（函式，參數為深色、淺色）
  const BODIES = {
    // 轎車：Camry、Altis、Model 3、3 系列
    sedan: {
      body: 'M14 74 L13 63 Q13 56 19 54 L46 50 C60 44 72 33 84 30 L128 29 C141 30 151 38 159 47 L196 53 Q206 55 207 63 L207 72 Q207 76 202 76 L185 76 A19 19 0 0 0 147 76 L71 76 A19 19 0 0 0 33 76 L20 76 Q14 76 14 74 Z',
      glass: ['M60 49 C70 42 78 35 87 33 L117 32 L117 49 Z', 'M121 32 L128 32 C139 33 147 40 153 49 L121 49 Z'],
      wheels: [[52, 15], [166, 15]], wy: 74, doors: [86, 119, 155], belt: 51,
      head: 'M191 55 L204 58 Q206 61 202 61 L189 59 Z', tail: 'M13 58 L25 56 L25 61 L13 63 Z',
      extra: (d) => `<path d="M48 50 L60 49" stroke="${d}" stroke-width="1.2"/><path d="M199 66 h7 v4 h-7z" fill="#3a3f45"/>`,
    },
    // 掀背：Fit、Golf、Yaris、Mazda3
    hatch: {
      body: 'M30 75 L28 56 Q28 46 36 38 C44 30 52 25 64 24 L116 24 C130 25 140 34 150 46 L186 52 Q197 54 198 62 L199 72 Q199 76 194 76 L178 76 A18 18 0 0 0 142 76 L74 76 A18 18 0 0 0 38 76 L33 76 Q30 76 30 75 Z',
      glass: ['M42 47 C45 38 52 31 62 29 L86 29 L86 47 Z', 'M90 29 L116 29 C126 30 134 37 142 47 L90 47 Z'],
      wheels: [[56, 15], [160, 15]], wy: 74, doors: [88, 146], belt: 49,
      head: 'M183 53 L196 57 Q198 60 194 60 L181 57 Z', tail: 'M28 46 L36 44 L34 55 L28 56 Z',
      extra: () => `<path d="M30 40 L44 31" stroke="#2c3035" stroke-width="3" stroke-linecap="round"/><path d="M192 66 h6 v4 h-6z" fill="#3a3f45"/>`,
    },

    // 休旅：RAV4、CR-V、CX-5、Tucson、Forester
    suv: {
      body: 'M18 70 L17 46 Q17 34 24 28 L32 18 Q35 14 42 14 L132 14 C146 15 156 26 164 38 L200 44 Q210 46 211 56 L211 68 Q211 73 206 73 L191 73 A21 21 0 0 0 149 73 L77 73 A21 21 0 0 0 35 73 L22 73 Q18 73 18 70 Z',
      glass: ['M28 40 L34 23 Q36 20 40 20 L58 20 L58 40 Z', 'M62 20 L96 20 L96 40 L62 40 Z', 'M100 20 L130 20 C140 21 148 29 154 40 L100 40 Z'],
      wheels: [[56, 17], [170, 17]], wy: 71, doors: [98, 156], belt: 42, clad: true,
      head: 'M196 45 L209 49 Q211 53 207 53 L194 50 Z', tail: 'M17 36 L25 35 L25 46 L17 47 Z',
      extra: (d) => `<path d="M40 11 L128 11" stroke="${d}" stroke-width="2.5" stroke-linecap="round"/><path d="M203 60 h8 v5 h-8z" fill="#3a3f45"/>`,
    },
    // 方正越野：Jimny、Defender、Land Cruiser、G-Class
    bigsuv: {
      body: 'M18 70 L18 22 Q18 15 25 15 L140 15 L159 38 L204 42 Q210 43 210 50 L210 68 Q210 72 205 72 L193 72 A22 22 0 0 0 151 72 L79 72 A22 22 0 0 0 37 72 L22 72 Q18 72 18 70 Z',
      glass: ['M26 21 h28 v18 h-28z', 'M60 21 h36 v18 h-36z', 'M100 21 h37 l15 18 h-52z'],
      wheels: [[58, 18], [172, 18]], wy: 70, doors: [98, 156], belt: 41, clad: true,
      head: 'M200 44 a5 5 0 1 0 0.1 0z', tail: 'M18 30 h6 v12 h-6z',
      extra: (d) => `<circle cx="13" cy="46" r="12" fill="#2c3035"/><circle cx="13" cy="46" r="6.5" fill="#cfd5da"/><path d="M24 13 L134 13" stroke="${d}" stroke-width="3" stroke-linecap="round"/><path d="M200 54 h10 v8 h-10z" fill="#3a3f45"/>`,
    },
    // 跑車：911、Mustang、GR86
    coupe: {
      body: 'M16 73 L15 63 Q17 55 30 49 C52 37 76 29 100 28 C122 28 138 35 150 45 L194 52 Q204 54 205 62 L205 72 Q205 75 200 75 L183 75 A18 18 0 0 0 145 75 L73 75 A18 18 0 0 0 35 75 L20 75 Q16 75 16 73 Z',
      glass: ['M56 47 C68 40 80 35 92 33 L100 33 L100 47 Z', 'M104 33 C118 33 130 38 140 47 L104 47 Z'],
      wheels: [[55, 17], [164, 17]], wy: 73, doors: [102, 144], belt: 49,
      head: 'M184 52 a7 5 -15 1 0 0.1 0z', tail: 'M15 60 L36 56 L36 59 L15 63 Z',
      extra: (d) => `<path d="M60 58 h24" stroke="${d}" stroke-width="1.4" opacity=".6"/><path d="M190 64 h14 v4 h-14z" fill="#3a3f45"/>`,
    },

    // 敞篷：MX-5、Z4
    roadster: {
      body: 'M18 72 L17 61 Q18 53 28 51 L66 49 L114 49 L190 53 Q202 55 203 63 L203 72 Q203 75 198 75 L181 75 A18 18 0 0 0 145 75 L71 75 A18 18 0 0 0 35 75 L22 75 Q18 75 18 72 Z',
      glass: ['M113 49 L127 34 L132 34 L121 49 Z'],
      wheels: [[53, 15], [163, 15]], wy: 73, doors: [108], belt: 52,
      head: 'M185 54 L199 57 Q201 60 197 60 L184 58 Z', tail: 'M17 56 L27 55 L27 60 L17 61 Z',
      extra: (d) => `<path d="M70 49 q2 -14 12 -14 q8 0 8 14z" fill="#2c3035"/><path d="M58 49 q2 -10 9 -10 q6 0 6 10" fill="none" stroke="#9aa3ab" stroke-width="3"/>`,
    },
    // 休旅車／MPV：Sienta、Alphard、Odyssey、Carnival
    minivan: {
      body: 'M16 72 L16 26 Q16 14 28 13 L150 12 C164 13 172 26 180 40 L202 46 Q210 48 210 58 L210 70 Q210 74 205 74 L191 74 A20 20 0 0 0 151 74 L75 74 A20 20 0 0 0 35 74 L20 74 Q16 74 16 72 Z',
      glass: ['M24 20 h30 v21 h-30z', 'M58 19 h45 v22 h-45z', 'M107 19 h42 c10 2 18 10 24 22 h-66z'],
      wheels: [[55, 17], [171, 17]], wy: 72, doors: [56, 105, 176], belt: 43,
      head: 'M196 47 L208 51 Q210 55 206 55 L194 52 Z', tail: 'M16 24 h6 v20 h-6z',
      extra: (d) => `<path d="M58 45 h45" stroke="${d}" stroke-width="1.5" stroke-dasharray="4 3"/><path d="M202 62 h8 v5 h-8z" fill="#3a3f45"/>`,
    },
    // 皮卡：Hilux、Ranger、Cybertruck
    pickup: {
      body: 'M14 70 L14 44 L86 44 L86 22 Q86 16 92 16 L140 16 L158 36 L204 40 Q212 41 212 50 L212 68 Q212 72 207 72 L199 72 A22 22 0 0 0 157 72 L76 72 A22 22 0 0 0 32 72 L18 72 Q14 72 14 70 Z',
      glass: ['M92 22 h20 v16 h-20z', 'M116 22 h23 l14 16 h-37z'],
      wheels: [[54, 18], [178, 18]], wy: 70, doors: [114, 156], belt: 41, clad: true,
      head: 'M200 42 L211 45 Q212 49 208 49 L198 46 Z', tail: 'M14 47 h5 v10 h-5z',
      extra: (d) => `<path d="M14 48 h72" stroke="${d}" stroke-width="2"/><path d="M22 44 v-4 h60 v4" fill="none" stroke="#2c3035" stroke-width="2.5"/>`,
    },
    // 電動跨界：Model Y、Model X、EX30、ID.4
    evcross: {
      body: 'M18 70 L17 52 Q18 44 26 38 C46 24 70 14 98 12 L126 12 C142 13 154 25 164 38 L200 45 Q210 47 211 57 L211 68 Q211 73 206 73 L190 73 A22 22 0 0 0 146 73 L78 73 A22 22 0 0 0 34 73 L22 73 Q18 73 18 70 Z',
      glass: ['M42 40 C58 29 76 21 96 18 L108 18 L108 40 Z', 'M112 18 L126 18 C138 19 148 28 154 40 L112 40 Z'],
      wheels: [[56, 18], [168, 18]], wy: 71, doors: [76, 110, 156], belt: 42, clad: true,
      head: 'M193 47 L209 51 L208 53 L192 50 Z', tail: 'M17 45 L36 40 L36 43 L17 48 Z',
      extra: () => ``,
    },

    // 旅行車：Outback、V60、Octavia Combi
    wagon: {
      body: 'M16 74 L15 50 Q15 36 22 30 L28 24 Q31 21 37 21 L124 21 C138 22 148 32 156 44 L196 50 Q206 52 207 62 L207 72 Q207 76 202 76 L185 76 A19 19 0 0 0 147 76 L71 76 A19 19 0 0 0 33 76 L20 76 Q16 76 16 74 Z',
      glass: ['M24 44 L30 29 Q32 26 36 26 L56 26 L56 44 Z', 'M60 26 L96 26 L96 44 L60 44 Z', 'M100 26 L124 26 C134 27 142 34 148 44 L100 44 Z'],
      wheels: [[52, 15], [166, 15]], wy: 74, doors: [98, 152], belt: 46,
      head: 'M190 51 L204 55 Q206 58 202 58 L188 55 Z', tail: 'M15 40 L22 39 L22 50 L15 51 Z',
      extra: (d) => `<path d="M36 18 L122 18" stroke="${d}" stroke-width="2.5" stroke-linecap="round"/>`,
    },
  };

  function svgCar(type, c, w) {
    const B = BODIES[type] || BODIES.sedan;
    const dark = shade(c, -0.35), light = shade(c, 0.45);
    const id = 'c' + Math.random().toString(36).slice(2, 8);
    const seam = lum(c) < .35 ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)';
    const glass = B.glass.map(g => `<path d="${g}" fill="url(#${id}g)"/>`).join('');
    const doors = B.doors.map(x => `<path d="M${x} ${B.belt} V${B.wy + 1}" stroke="${seam}" stroke-width="1.3"/>`).join('');
    const handles = B.doors.slice(0, -1).map((x, i) => `<rect x="${x + (B.doors[i + 1] - x) - 16}" y="${B.belt + 6}" width="9" height="2.6" rx="1.3" fill="${seam}"/>`).join('');
    const clad = B.clad ? `<path d="M20 ${B.wy - 6} H210" stroke="#3a3f45" stroke-width="6" opacity=".55"/>${B.wheels.map(([x, r]) => arch(x, B.wy, r, '#3a3f45')).join('')}` : '';
    const wheels = B.wheels.map(([x, r]) => wheel(x, B.wy, r)).join('');
    return `<svg class="car-art" viewBox="0 0 220 96" width="${w}" height="${(w * 96 / 220).toFixed(0)}" aria-hidden="true">
      <defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9f6fd"/><stop offset="1" stop-color="#8dbbdc"/></linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset=".45" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.18)}"/></linearGradient></defs>
      <ellipse cx="112" cy="${B.wy + (B.wheels[0][1]) + 3}" rx="98" ry="5" fill="rgba(0,0,0,.14)"/>
      <path d="${B.body}" fill="url(#${id}b)" stroke="${dark}" stroke-width="1.2" stroke-linejoin="round"/>
      ${glass}
      <path d="M30 ${B.belt + 1} H190" stroke="#fff" stroke-width="1.6" opacity=".35"/>
      ${clad}${doors}${handles}
      <path d="${B.head}" fill="#fff6c9" stroke="${dark}" stroke-width=".8"/>
      <path d="${B.tail}" fill="#e53935"/>
      ${B.extra(dark, light)}
      ${wheels}
    </svg>`;
  }

  // 機車：一般 125cc 速克達（JET、勁戰）、電動車（Gogoro）、檔車（R15）
  function svgScooter(type, c, w) {
    const dark = shade(c, -0.35), light = shade(c, 0.4);
    const id = 'm' + Math.random().toString(36).slice(2, 8);
    const grad = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>`;
    let body;
    if (type === 'escooter') {
      body = `<path d="M50 64 Q44 44 70 40 L116 38 Q126 38 124 48 L118 62 Z" fill="url(#${id})" stroke="${dark}" stroke-width="1.2"/>
        <path d="M60 38 Q60 30 70 30 L118 30 Q126 30 125 38 Z" fill="#2c3035"/>
        <path d="M112 62 L150 62 L152 68 L110 68 Z" fill="#3a3f45"/>
        <path d="M146 66 L156 26 Q158 16 168 16 L172 16 Q176 26 168 42 L158 66 Z" fill="url(#${id})" stroke="${dark}" stroke-width="1.2"/>
        <circle cx="168" cy="26" r="6" fill="#fff6c9" stroke="#9aa3ab" stroke-width="2"/>
        <path d="M160 16 L154 8 L140 7" stroke="#2c3035" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M164 40 L170 76" stroke="#5b636b" stroke-width="3.5"/><path d="M152 66 Q166 56 180 66" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
        <path d="M48 52 h6 v5 h-6z" fill="#e53935"/>`;
    } else if (type === 'sportbike') {
      body = `<path d="M110 60 L56 76" stroke="#5b636b" stroke-width="5" stroke-linecap="round"/>
        <path d="M104 46 L136 46 L132 68 L108 68 Z" fill="#3a3f45"/>
        <path d="M38 44 L78 38 L82 47 L46 52 Z" fill="url(#${id})" stroke="${dark}" stroke-width="1.2"/>
        <path d="M74 39 L102 34 L106 41 L80 46 Z" fill="#2c3035"/>
        <path d="M98 36 Q112 24 134 28 L142 42 L104 45 Z" fill="url(#${id})" stroke="${dark}" stroke-width="1.2"/>
        <path d="M132 28 L166 28 Q184 34 182 50 L162 62 L122 64 L112 46 Z" fill="url(#${id})" stroke="${dark}" stroke-width="1.2"/>
        <path d="M158 29 L174 18 L182 24 L170 33 Z" fill="#8dbbdc"/>
        <path d="M172 38 L182 41" stroke="#fff6c9" stroke-width="4" stroke-linecap="round"/>
        <path d="M168 46 L172 76" stroke="#5b636b" stroke-width="4"/>
        <path d="M158 62 Q170 54 184 62" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
        <path d="M38 44 h5 v5 h-5z" fill="#e53935"/>`;
    } else {
      body = `<path d="M36 62 Q34 46 54 42 L112 40 Q120 40 120 48 L118 60 Q100 64 86 64 Z" fill="url(#${id})" stroke="${dark}" stroke-width="1.2"/>
        <path d="M50 41 Q50 32 60 32 L110 32 Q118 32 117 41 Z" fill="#2c3035"/>
        <path d="M88 62 L142 62 L144 68 L86 68 Z" fill="#3a3f45"/>
        <path d="M138 66 L150 28 Q152 20 160 20 L166 20 Q170 30 162 44 L152 66 Z" fill="url(#${id})" stroke="${dark}" stroke-width="1.2"/>
        <path d="M156 24 L168 22 L168 30 L158 32 Z" fill="#fff6c9" stroke="${dark}" stroke-width=".8"/>
        <path d="M152 20 L146 11 L132 9" stroke="#2c3035" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M158 44 L162 76" stroke="#5b636b" stroke-width="3.5"/><path d="M146 66 Q160 56 174 66" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
        <path d="M34 50 h6 v6 h-6z" fill="#e53935"/><path d="M60 64 L90 70" stroke="#9aa3ab" stroke-width="4" stroke-linecap="round"/>`;
    }
    const wy = 76, r = type === 'sportbike' ? 16 : 13;
    return `<svg class="car-art" viewBox="0 0 220 96" width="${w}" height="${(w * 96 / 220).toFixed(0)}" aria-hidden="true">${grad}
      <ellipse cx="110" cy="${wy + r + 2}" rx="78" ry="4.5" fill="rgba(0,0,0,.14)"/>
      ${body}${wheel(type === 'sportbike' ? 56 : 58, wy, r)}${wheel(type === 'sportbike' ? 172 : 166, wy, r)}</svg>`;
  }

  const MOTO = ['scooter', 'escooter', 'sportbike'];
  const svg = (type = 'sedan', color = '#c5cad0', w = 160) => (MOTO.includes(type) ? svgScooter : svgCar)(type, color, w);

  // 常見車款（台灣市場）→ 車身類型
  const M = s => s.trim().split('\n').map(l => { const [n, t] = l.split(':').map(x => x.trim()); return { name: n, type: t }; });
  const MODELS = {
    Toyota: M(`Corolla Cross:suv
RAV4:suv
Corolla Altis:sedan
Camry:sedan
Yaris:hatch
Vios:sedan
Sienta:minivan
Alphard:minivan
Town Ace:minivan
Hilux:pickup
Land Cruiser:bigsuv
bZ4X:evcross
Prius:hatch
GR86:coupe
Crown:sedan`),
    Lexus: M(`UX:suv
NX:suv
RX:suv
LX:bigsuv
ES:sedan
IS:sedan
LS:sedan
LM:minivan
RZ:evcross`),
    Honda: M(`Fit:hatch
HR-V:suv
CR-V:suv
ZR-V:suv
Civic:sedan
Accord:sedan
Odyssey:minivan
e:N1:evcross`),
    Nissan: M(`Kicks:suv
X-Trail:suv
Juke:suv
Sentra:sedan
Altima:sedan
Leaf:hatch`),
    Mazda: M(`Mazda2:hatch
Mazda3:hatch
Mazda6:sedan
CX-3:suv
CX-30:suv
CX-5:suv
CX-60:suv
CX-90:suv
MX-5:roadster`),
    Mitsubishi: M(`Outlander:suv
Eclipse Cross:suv
Colt Plus:hatch
Xpander:minivan
Zinger:minivan
Delica:minivan`),
    Subaru: M(`Forester:suv
Crosstrek:suv
Outback:wagon
Levorg:wagon
WRX:sedan
BRZ:coupe
Solterra:evcross`),
    Suzuki: M(`Swift:hatch
Ignis:hatch
Jimny:bigsuv
Vitara:suv
S-Cross:suv`),
    BMW: M(`1 系列:hatch
3 系列:sedan
5 系列:sedan
7 系列:sedan
X1:suv
X3:suv
X5:suv
X7:bigsuv
i4:sedan
iX:evcross
M4:coupe
Z4:roadster`),
    'Mercedes-Benz': M(`A-Class:hatch
C-Class:sedan
E-Class:sedan
S-Class:sedan
GLA:suv
GLC:suv
GLE:suv
G-Class:bigsuv
EQA:evcross
EQE SUV:evcross
V-Class:minivan`),
    Audi: M(`A1:hatch
A3:hatch
A4:sedan
A4 Avant:wagon
A6:sedan
Q2:suv
Q3:suv
Q5:suv
Q7:suv
Q8 e-tron:evcross
TT:coupe
R8:coupe`),
    Volkswagen: M(`Polo:hatch
Golf:hatch
T-Roc:suv
Tiguan:suv
Touran:minivan
Passat Variant:wagon
ID.4:evcross
Multivan:minivan`),
    Porsche: M(`911:coupe
718:coupe
Macan:suv
Cayenne:suv
Panamera:sedan
Taycan:sedan`),
    Volvo: M(`XC40:suv
XC60:suv
XC90:suv
EX30:evcross
EX40:evcross
V60:wagon
S60:sedan
S90:sedan`),
    Tesla: M(`Model 3:sedan
Model Y:evcross
Model S:sedan
Model X:evcross
Cybertruck:pickup`),
    Ford: M(`Focus:hatch
Kuga:suv
Ranger:pickup
Mustang:coupe
Mustang Mach-E:evcross
Tourneo Connect:minivan`),
    Hyundai: M(`Venue:suv
Kona:suv
Tucson L:suv
Santa Fe:suv
Elantra:sedan
Ioniq 5:evcross
Ioniq 6:sedan
Custin:minivan`),
    Kia: M(`Picanto:hatch
Stonic:suv
Sportage:suv
Sorento:suv
Carnival:minivan
EV6:evcross
EV9:suv`),
    Luxgen: M(`n7:evcross
URX:suv
U6:suv
M7:minivan`),
    'Škoda': M(`Fabia:hatch
Scala:hatch
Kamiq:suv
Karoq:suv
Kodiaq:suv
Octavia:sedan
Octavia Combi:wagon
Superb:sedan
Enyaq:evcross`),
    Peugeot: M(`208:hatch
2008:suv
3008:suv
5008:suv
408:sedan
Rifter:minivan`),
    MG: M(`ZS:suv
HS:suv
MG4:hatch`),
    'Land Rover': M(`Defender:bigsuv
Discovery:bigsuv
Range Rover:bigsuv
Range Rover Velar:suv
Range Rover Evoque:suv`),
    Gogoro: M(`SuperSport:escooter
Viva:escooter
Delight:escooter
JEGO:escooter
Pulse:escooter`),
    KYMCO: M(`Racing S:scooter
KRV:scooter
Like:scooter
Many:scooter
G6:scooter
Ionex:escooter`),
    SYM: M(`JET SL:scooter
DRG:scooter
4MICA:scooter
Woo:scooter
MMBCU:scooter`),
    Yamaha: M(`勁戰 Cygnus Gryphus:scooter
BWS:scooter
NMAX:scooter
Force:scooter
Limi:scooter
EMF:escooter
R15:sportbike
MT-15:sportbike`),
    '其他': M(`轎車:sedan
掀背車:hatch
休旅車:suv
越野車:bigsuv
MPV:minivan
皮卡:pickup
跑車:coupe
速克達:scooter
電動機車:escooter`),
  };

  const COLORS = [
    { v: '#f4f4f1', label: '珍珠白' }, { v: '#1f2328', label: '黑' }, { v: '#c5cad0', label: '銀' },
    { v: '#6b7178', label: '灰' }, { v: '#c62828', label: '紅' }, { v: '#1e4fa8', label: '藍' },
    { v: '#1b2a4a', label: '深藍' }, { v: '#7fb8e6', label: '淺藍' }, { v: '#2e6b4f', label: '綠' },
    { v: '#6d4c3d', label: '棕' }, { v: '#d9c3a0', label: '奶茶' }, { v: '#f2c14e', label: '黃' }, { v: '#e8742a', label: '橘' },
  ];

  const models = brand => MODELS[brand] || MODELS['其他'];
  const typeOf = (brand, model, fallback = 'sedan') => (models(brand).find(m => m.name === model) || {}).type || fallback;
  return { svg, models, typeOf, COLORS, shade, BODIES };
})();
