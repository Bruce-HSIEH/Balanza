'use strict';
// 自繪 SVG 圖表：逐月還款堆疊長條、投入進度環、累計投入與利息

const Charts = (() => {
  const PALETTE = ['#7cb7ff', '#ff8a80', '#ffc46b', '#8ce0a8', '#b39dfa', '#80deea', '#f48fb1', '#c5e1a5', '#ffab91', '#9fa8da'];
  const niceMax = v => {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  };
  const wanLabel = v => v >= 1e4 ? `${+(v / 1e4).toFixed(v >= 1e5 ? 0 : 1)}萬` : Math.round(v).toLocaleString();

  // months: [{ym,total,items:{id:{pay}}}]；series: [{id,color}]；markers: {k: color}
  function stacked(months, series, { selected = 0, markers = {}, height = 190, width = 340 } = {}) {
    const L = 38, R = 6, T = 14, B = 22;
    const pw = width - L - R, ph = height - T - B;
    const n = months.length;
    const max = niceMax(Math.max(1, ...months.map(m => m.total)));
    const bw = pw / n, gap = bw > 6 ? Math.min(3, bw * .22) : bw > 2.5 ? .6 : 0;
    const y = v => T + ph - v / max * ph;
    let bars = '', grid = '', xlab = '', marks = '', hits = '';
    for (const f of [0, .5, 1]) {
      const v = max * f, yy = y(v);
      grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${width - R}" y2="${yy.toFixed(1)}" class="grid"/><text x="${L - 4}" y="${(yy + 3.5).toFixed(1)}" text-anchor="end" class="ax">${wanLabel(v)}</text>`;
    }
    months.forEach((m, k) => {
      const x = L + k * bw;
      let acc = 0;
      series.forEach(s => {
        const it = m.items[s.id];
        if (!it || it.pay <= 0) return;
        const y0 = y(acc), y1 = y(acc + it.pay);
        bars += `<rect x="${(x + gap / 2).toFixed(2)}" y="${y1.toFixed(2)}" width="${Math.max(.8, bw - gap).toFixed(2)}" height="${Math.max(.5, y0 - y1).toFixed(2)}" fill="${s.color}" ${it.grace ? 'class="grace"' : ''}/>`;
        acc += it.pay;
      });
      const mth = Number(m.ym.slice(5)), yr = Number(m.ym.slice(0, 4));
      const every = n <= 15 ? 1 : n <= 40 ? 6 : n <= 80 ? 12 : n <= 160 ? 24 : 60;
      let label = '';
      if (k === 0) label = `'${m.ym.slice(2, 4)}/${mth}`;
      else if (every < 12 && (mth - 1) % every === 0) label = mth === 1 ? `'${m.ym.slice(2, 4)}` : `${mth}月`;
      else if (every >= 12 && mth === 1 && yr % (every / 12) === 0) label = `'${m.ym.slice(2, 4)}`;
      if (label && !(k > 0 && k < 3 && every >= 6)) xlab += `<text x="${(x + bw / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" class="ax">${label}</text>`;
      if (markers[k]) marks += `<g class="mk"><path d="M${(x + bw / 2).toFixed(1)} ${(y(m.total) - 4).toFixed(1)} l-4 -6 h8z" fill="${markers[k]}"/></g>`;
      hits += `<rect x="${x.toFixed(2)}" y="${T}" width="${bw.toFixed(2)}" height="${ph}" fill="transparent" data-k="${k}"/>`;
    });
    const sx = L + selected * bw;
    const sel = `<rect x="${sx.toFixed(2)}" y="${T - 4}" width="${bw.toFixed(2)}" height="${ph + 4}" rx="2" class="sel"/>`;
    return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${grid}${sel}<g class="bars">${bars}</g>${marks}${xlab}${hits}</svg>`;
  }

  function ring(p, size = 112, color = '#14b8a6') {
    const r = size / 2 - 9, c = 2 * Math.PI * r;
    return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--soft)" stroke-width="12"/>
      <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - Math.min(1, p))).toFixed(1)}" style="--c:${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      <text x="50%" y="48%" text-anchor="middle" class="ring-pct">${Math.round(p * 100)}%</text>
      <text x="50%" y="66%" text-anchor="middle" class="ring-sub">已投入</text></svg>`;
  }

  // 累計投入（長條）＋ 每月利息（折線）
  function invest(rows, { width = 340, height = 170, current = -1 } = {}) {
    const L = 38, R = 40, T = 12, B = 22, pw = width - L - R, ph = height - T - B, n = rows.length;
    const maxC = niceMax(Math.max(1, ...rows.map(r => r.cum)));
    const maxI = niceMax(Math.max(1, ...rows.map(r => r.interest)));
    const bw = pw / n, gap = Math.min(4, bw * .25);
    let bars = '', pts = [], lab = '';
    rows.forEach((r, i) => {
      const x = L + i * bw, h = r.cum / maxC * ph;
      bars += `<rect x="${(x + gap / 2).toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="ib ${r.state}" style="--d:${i * 40}ms"/>`;
      pts.push(`${(x + bw / 2).toFixed(1)},${(T + ph - r.interest / maxI * ph).toFixed(1)}`);
      if (i === 0 || i === n - 1 || (n > 6 && i % Math.ceil(n / 5) === 0)) lab += `<text x="${(x + bw / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" class="ax">${r.ym.slice(2).replace('-', '/')}</text>`;
    });
    const grid = [0, .5, 1].map(f => `<line x1="${L}" y1="${(T + ph - f * ph).toFixed(1)}" x2="${width - R}" y2="${(T + ph - f * ph).toFixed(1)}" class="grid"/>
      <text x="${L - 4}" y="${(T + ph - f * ph + 3.5).toFixed(1)}" text-anchor="end" class="ax">${wanLabel(maxC * f)}</text>
      <text x="${width - R + 4}" y="${(T + ph - f * ph + 3.5).toFixed(1)}" class="ax ax-r">${wanLabel(maxI * f)}</text>`).join('');
    const cur = current >= 0 ? `<rect x="${(L + current * bw).toFixed(1)}" y="${T - 4}" width="${bw.toFixed(1)}" height="${ph + 4}" class="sel"/>` : '';
    return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${grid}${cur}${bars}
      <polyline class="iline" points="${pts.join(' ')}" fill="none"/>${pts.map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="2.6" class="idot"/>`).join('')}${lab}</svg>`;
  }

  return { PALETTE, stacked, ring, invest, wanLabel };
})();
