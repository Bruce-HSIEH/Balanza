#!/usr/bin/env python3
"""下載內政部實價登錄開放資料（不動產買賣），彙整成每縣市一個 JSON。

輸出：
  data/lvr/index.json   {updated, seasons, counties: {A: {name, districts: n, tx: n}}}
  data/lvr/<K>.json     {updated, seasons, d: {行政區: {s: stats, r: {路段: {s: stats, t: [tx...]}}}}}
  stats = {"all": [中位數, P25, P75, 筆數], "住宅大樓": [...], ...}   單價為 元/坪，已扣車位
  tx    = [年月, 門牌(官方已模糊化), 型態, 坪數, 單價/坪, 總價, 樓層, 屋齡]

只用 Python 標準函式庫。用法：python scripts/build_lvr.py [--seasons 8] [--zip 本機檔案.zip ...]
"""
import argparse, csv, datetime as dt, io, json, os, re, statistics, sys, time, urllib.request, zipfile

COUNTIES = {
    'A': '臺北市', 'B': '臺中市', 'C': '基隆市', 'D': '臺南市', 'E': '高雄市', 'F': '新北市', 'G': '宜蘭縣',
    'H': '桃園市', 'I': '嘉義市', 'J': '新竹縣', 'K': '苗栗縣', 'M': '南投縣', 'N': '彰化縣', 'O': '新竹市',
    'P': '雲林縣', 'Q': '嘉義縣', 'T': '屏東縣', 'U': '花蓮縣', 'V': '臺東縣', 'W': '金門縣', 'X': '澎湖縣', 'Z': '連江縣',
}
TYPES = [('住宅大樓', '住宅大樓'), ('華廈', '華廈'), ('公寓', '公寓'), ('透天厝', '透天厝'), ('套房', '套房'), ('店面', '店面')]
EXCLUDE = re.compile(r'親友|員工|特殊關係|急買急賣|瑕疵|債權|債務|法拍|拍賣|共有人|含增建|未登記建物|毛胚|關係人')
PING = 3.305785
UA = {'User-Agent': 'Mozilla/5.0 (Balanza; +https://github.com/Bruce-HSIEH/Balanza)'}
FW = str.maketrans('０１２３４５６７８９', '0123456789')
ROAD = re.compile(r'^(.{1,12}?(?:大道|路|街))([一二三四五六七八九十]+段)?')
CN = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}


def seasons_back(n, today=None):
    today = today or dt.date.today()
    y, q = today.year - 1911, (today.month - 1) // 3 + 1
    out = []
    for _ in range(n):
        q -= 1
        if q == 0:
            y, q = y - 1, 4
        out.append(f'{y}S{q}')
    return out  # 新到舊


def download(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                data = r.read()
            if data[:2] == b'PK':
                return data
            print(f'  非 zip 回應 ({len(data)} bytes)', file=sys.stderr)
            return None
        except Exception as e:  # noqa
            print(f'  下載失敗 {e}（第 {i + 1} 次）', file=sys.stderr)
            time.sleep(5 * (i + 1))
    return None


def decode(raw):
    for enc in ('utf-8-sig', 'cp950', 'big5'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    return raw.decode('utf-8', 'ignore')


def fnum(v):
    try:
        return float(str(v).replace(',', '').strip() or 0)
    except ValueError:
        return 0.0


def roc_ym(s):
    s = re.sub(r'\D', '', str(s))
    if len(s) < 5:
        return None
    y, m = int(s[:-4]) + 1911, int(s[-4:-2])
    return f'{y}-{m:02d}' if 1 <= m <= 12 and 1990 < y < 2100 else None


def age_years(s, ref_year):
    s = re.sub(r'\D', '', str(s))
    if len(s) < 5:
        return None
    a = ref_year - (int(s[:-4]) + 1911)
    return a if 0 <= a < 120 else None


def btype(s):
    for key, name in TYPES:
        if s.startswith(key):
            return name
    return None


def floor_txt(s):
    s = str(s or '')
    m = re.match(r'^([一二三四五六七八九十]+)層', s)
    if not m:
        return s[:6]
    t = m.group(1)
    n = 0
    if '十' in t:
        a, _, b = t.partition('十')
        n = (CN.get(a, 1) if a else 1) * 10 + (CN.get(b, 0) if b else 0)
    else:
        n = CN.get(t, 0)
    return f'{n}F' if n else s[:6]


def road_of(addr, county, district):
    a = addr.translate(FW).replace('台', '臺')
    for p in (county, county.replace('臺', '台')):
        if a.startswith(p):
            a = a[len(p):]
    if a.startswith(district):
        a = a[len(district):]
    m = ROAD.match(a)
    if not m:  # 去掉開頭的「○○里○鄰」再試
        m = ROAD.match(re.sub(r'^.{1,4}?里(\d+鄰)?', '', a))
    if not m:
        return None
    road = m.group(1) + (m.group(2) or '')
    return road if not re.search(r'\d', road) else None


def parse_csv(text, county):
    rows = list(csv.reader(io.StringIO(text)))
    if len(rows) < 2:
        return
    head = [h.strip() for h in rows[0]]
    idx = {h: i for i, h in enumerate(head)}
    need = ['鄉鎮市區', '交易標的', '土地位置建物門牌', '交易年月日', '建物型態', '建物移轉總面積平方公尺', '總價元']
    if not all(n in idx for n in need):
        return
    g = lambda r, k: r[idx[k]].strip() if k in idx and idx[k] < len(r) else ''
    start = 2 if rows[1] and re.match(r'^[A-Za-z ]+$', rows[1][0].strip()) else 1
    for r in rows[start:]:
        if len(r) < len(need):
            continue
        if '建物' not in g(r, '交易標的'):
            continue
        if EXCLUDE.search(g(r, '備註')):
            continue
        t = btype(g(r, '建物型態'))
        if not t:
            continue
        ym = roc_ym(g(r, '交易年月日'))
        if not ym:
            continue
        area = fnum(g(r, '建物移轉總面積平方公尺')) - fnum(g(r, '車位移轉總面積平方公尺'))
        price = fnum(g(r, '總價元')) - fnum(g(r, '車位總價元'))
        if area < 5 or price <= 0:
            continue
        ping = area / PING
        unit = price / ping
        if not 30_000 <= unit <= 8_000_000:
            continue
        district = g(r, '鄉鎮市區')
        addr = g(r, '土地位置建物門牌').translate(FW)
        yield {
            'id': g(r, '編號') or f'{addr}|{ym}|{price}',
            'district': district,
            'road': road_of(addr, county, district),
            'ym': ym, 'type': t, 'ping': round(ping, 1), 'unit': round(unit), 'total': round(price),
            'addr': re.sub(r'^' + re.escape(county) + re.escape(district), '', addr.replace('台', '臺'))[:30],
            'floor': floor_txt(g(r, '移轉層次')),
            'age': age_years(g(r, '建築完成年月'), int(ym[:4])),
        }


def stats(units):
    units = sorted(units)
    n = len(units)
    if n == 1:
        return [units[0]] * 3 + [1]
    q = statistics.quantiles(units, n=4, method='inclusive')
    return [round(statistics.median(units)), round(q[0]), round(q[2]), n]


def stat_block(txs):
    out = {'all': stats([t['unit'] for t in txs])}
    by = {}
    for t in txs:
        by.setdefault(t['type'], []).append(t['unit'])
    for k, v in by.items():
        out[k] = stats(v)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seasons', type=int, default=8)
    ap.add_argument('--out', default='data/lvr')
    ap.add_argument('--zip', nargs='*', help='使用本機 zip（測試用）')
    ap.add_argument('--max-tx', type=int, default=8)
    a = ap.parse_args()

    zips = []  # (season label, bytes)
    if a.zip:
        for p in a.zip:
            zips.append((os.path.splitext(os.path.basename(p))[0], open(p, 'rb').read()))
    else:
        for s in seasons_back(a.seasons + 2):
            if len(zips) >= a.seasons:
                break
            url = f'https://plvr.land.moi.gov.tw/DownloadSeason?season={s}&type=zip&fileName=lvr_landcsv.zip'
            print(f'下載 {s} …')
            data = download(url)
            if data:
                zips.append((s, data))
        print('下載本期資料 …')
        cur = download('https://plvr.land.moi.gov.tw/Download?type=zip&fileName=lvr_landcsv.zip')
        if cur:
            zips.append(('本期', cur))

    if not zips:
        print('沒有下載到任何資料，保留既有檔案', file=sys.stderr)
        sys.exit(1)

    seen, per = set(), {k: [] for k in COUNTIES}
    for label, data in zips:
        zf = zipfile.ZipFile(io.BytesIO(data))
        names = {n.lower(): n for n in zf.namelist()}
        cnt = 0
        for k, county in COUNTIES.items():
            n = names.get(f'{k.lower()}_lvr_land_a.csv')
            if not n:
                continue
            for t in parse_csv(decode(zf.read(n)), county):
                if t['id'] in seen:
                    continue
                seen.add(t['id'])
                per[k].append(t)
                cnt += 1
        print(f'  {label}: {cnt} 筆')

    season_labels = sorted(l for l, _ in zips if l != '本期')
    meta_seasons = season_labels + (['本期'] if any(l == '本期' for l, _ in zips) else [])
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    os.makedirs(a.out, exist_ok=True)
    index = {'updated': now, 'seasons': meta_seasons, 'counties': {}}
    for k, txs in per.items():
        if not txs:
            continue
        d = {}
        by_d = {}
        for t in txs:
            by_d.setdefault(t['district'], []).append(t)
        for dist, dtx in sorted(by_d.items()):
            roads = {}
            for t in dtx:
                if t['road']:
                    roads.setdefault(t['road'], []).append(t)
            d[dist] = {
                's': stat_block(dtx),
                'r': {
                    rd: {
                        's': stat_block(rtx),
                        't': [[t['ym'], t['addr'], t['type'], t['ping'], t['unit'], t['total'], t['floor'], t['age']]
                              for t in sorted(rtx, key=lambda x: x['ym'], reverse=True)[:a.max_tx]],
                    } for rd, rtx in sorted(roads.items())
                },
            }
        with open(os.path.join(a.out, f'{k}.json'), 'w', encoding='utf-8') as f:
            json.dump({'updated': now, 'seasons': meta_seasons, 'd': d}, f, ensure_ascii=False, separators=(',', ':'))
        index['counties'][k] = {'name': COUNTIES[k], 'districts': len(d), 'tx': len(txs)}
        print(f'{COUNTIES[k]}: {len(txs)} 筆、{len(d)} 區')
    with open(os.path.join(a.out, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
