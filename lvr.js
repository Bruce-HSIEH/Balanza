'use strict';
// 實價登錄：讀取 GitHub Action 產生的彙整資料（data/lvr/*.json），依地址估價
// 地址只在手機上比對，不會送出；下載的是整個縣市的公開彙整檔

const LVR = (() => {
  const cache = {};
  let index = null;
  const PING = 3.305785;

  async function getJSON(path) {
    if (cache[path]) return cache[path];
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status === 404 ? '實價登錄資料尚未產生' : `下載失敗 (${res.status})`);
    return (cache[path] = await res.json());
  }

  async function loadIndex() {
    if (index) return index;
    index = await getJSON('data/lvr/index.json');
    return index;
  }
  const loadCounty = k => getJSON(`data/lvr/${k}.json`);

  const FW = '０１２３４５６７８９';
  const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function normalize(s) {
    return String(s || '').replace(/[０-９]/g, c => FW.indexOf(c)).replace(/台(?=[北中南東灣])/g, '臺').replace(/\s+/g, '')
      .replace(/桃園縣/, '桃園市').replace(/(\d{1,2})段/g, (m, n) => (+n <= 10 ? CN[+n] : n) + '段');
  }

  // 解析地址 → { countyKey, district, road }
  async function parseAddress(addr) {
    const a = normalize(addr);
    const c = COUNTIES.find(x => a.startsWith(x.v));
    if (!c) throw new Error('請以縣市開頭，例如「臺北市大安區…」');
    const data = await loadCounty(c.k);
    const rest = a.slice(c.v.length);
    const district = Object.keys(data.d).sort((x, y) => y.length - x.length).find(d => rest.startsWith(d));
    if (!district) return { countyKey: c.k, district: '', road: '' };
    const after = rest.slice(district.length);
    const roads = Object.keys(data.d[district].r || {}).sort((x, y) => y.length - x.length);
    const road = roads.find(r => after.startsWith(r)) || roads.find(r => after.includes(r)) || '';
    return { countyKey: c.k, district, road };
  }

  async function estimate({ countyKey, district, road, btype, ping }) {
    const data = await loadCounty(countyKey);
    const D = data.d[district];
    if (!D) throw new Error('找不到這個行政區的成交資料');
    const R = road && D.r ? D.r[road] : null;
    const t = btype && btype !== '全部' ? btype : 'all';
    const pick = (stats, lvl) => {
      if (!stats) return null;
      const s = stats[t] && stats[t][3] >= 3 ? stats[t] : null;
      return s ? { s, lvl, typed: t !== 'all' } : null;
    };
    const hit = pick(R && R.s, 'road') || (R && R.s.all && R.s.all[3] >= 3 && { s: R.s.all, lvl: 'road', typed: false })
      || pick(D.s, 'district') || { s: D.s.all, lvl: 'district', typed: false };
    const [med, p25, p75, n] = hit.s;
    const p = parseFloat(ping) || 0;
    return {
      unit: med, p25, p75, n,
      level: hit.lvl, typed: hit.typed,
      value: p > 0 ? Math.round(med * p) : 0,
      low: p > 0 ? Math.round(p25 * p) : 0,
      high: p > 0 ? Math.round(p75 * p) : 0,
      tx: (R && R.t) || [],
      updated: data.updated,
      seasons: data.seasons,
    };
  }

  return { loadIndex, loadCounty, parseAddress, estimate, normalize, PING };
})();
