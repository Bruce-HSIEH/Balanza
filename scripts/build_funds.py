#!/usr/bin/env python3
"""每天更新基金淨值（只用 Python 標準函式庫）。

來源（政府資料開放平臺登記的官方資料）：
  境內基金：投信投顧公會「證券投資信託基金每日淨值」 https://www.sitca.org.tw/MemberK0000/F/03/nav.csv
  境外基金：集保結算所「境外基金淨值」               https://opendata.tdcc.com.tw/getOD.ashx?id=3-4

輸出（供 App 讀取）：
  data/funds/list.json      {"date", "n", "s": {代碼: [名稱, 幣別, 最新淨值, 前一筆淨值, "YYYY-MM-DD", "D"|"O", 公司]}}
  data/funds/hist/NN.json   {代碼: [[YYYYMMDD, 淨值], ...]}  依代碼分 64 份，App 只下載自己用到的那幾份
來源檔每天只有最近 1～3 天，所以走勢是每天累積起來的（保留最近 HIST_N 筆）。
"""
import base64, csv, datetime as dt, html as H, http.cookiejar, io, json, os, re, sys, time, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_stocks import get, log, load, LOG  # noqa: E402

OUT = 'data/funds'
SHARDS = 64
HIST_N = 30
SRC_D = 'https://www.sitca.org.tw/MemberK0000/F/03/nav.csv'
SRC_O = 'https://opendata.tdcc.com.tw/getOD.ashx?id=3-4'
SRC_D2 = 'https://www.sitca.org.tw/ROC/Industry/IN2106.aspx?pid=IN2213_02'   # 投信投顧公會「基金淨值（日）」所有公司
UA2 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'


def sitca_all():
    """投信投顧公會查詢頁：所有公司、指定日期的淨值表。表格放在頁面裡（有時包在 __VIEWSTATE 中）。
    回傳 [(日期YYYYMMDD, 公司, 基金統編, 名稱, 幣別, 淨值, 前一日淨值)]"""
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    def req(data=None):
        r = op.open(urllib.request.Request(SRC_D2, data=data, headers={'User-Agent': UA2, 'Referer': SRC_D2}), timeout=120)
        return r.read().decode('utf-8', 'replace')
    page = req()
    hid = dict(re.findall(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', page))
    now = dt.datetime.utcnow() + dt.timedelta(hours=8)
    for back in range(0, 7):
        day = (now - dt.timedelta(days=back)).strftime('%Y%m%d')
        f = dict(hid)
        f['ctl00$ContentPlaceHolder1$txtQ_Date'] = day
        f['ctl00$ContentPlaceHolder1$ddlQ_Comid'] = ''
        f['ctl00$ContentPlaceHolder1$BtnQuery'] = '查詢'
        t = req(urllib.parse.urlencode(f).encode())
        rows = parse_sitca(t)
        if not rows:
            m = re.search(r'id="__VIEWSTATE" value="([^"]+)"', t)
            if m:
                try:
                    rows = parse_sitca(base64.b64decode(m.group(1)).decode('utf-8', 'replace'))
                except Exception:  # noqa
                    rows = []
        if rows:
            log(f'投信投顧公會 {day}：{len(rows)} 檔')
            return [(int(day),) + r for r in rows]
        new_hid = dict(re.findall(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', t))
        if new_hid:
            hid = new_hid
    return []


def parse_sitca(t):
    out = []
    for tr in re.findall(r'<tr class=["\']?DT(?:even|odd)["\']?[^>]*>(.*?)</tr>', t, re.S | re.I):
        c = [H.unescape(re.sub(r'<br\s*/?>', ' ', x, flags=re.I)) for x in re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S | re.I)]
        c = [re.sub(r'<[^>]+>', '', x).strip() for x in c]
        if len(c) < 10:
            continue
        # 類型代號, 公司代號, 公司名稱, 受益憑證代號, 基金統編, 基金名稱, 幣別, 淨值, 前一日淨值, 漲跌
        out.append((c[2], c[4], re.sub(r'\s+', ' ', c[5]), (c[6] or 'TWD').upper(), c[7], c[8]))
    return out


def shard(code):
    return sum(ord(c) for c in code) % SHARDS     # App 端用一樣的算法


def rows(url):
    b = get(url, timeout=90, tries=3, raw=True)
    t = b.decode('utf-8-sig', errors='replace')
    return list(csv.DictReader(io.StringIO(t)))


def f(v):
    try:
        x = float(str(v).replace(',', '').strip())
        return x if x > 0 else None
    except (ValueError, TypeError):
        return None


def d8(v):
    s = ''.join(ch for ch in str(v) if ch.isdigit())
    return int(s) if len(s) == 8 else None


def collect():
    """回傳 {code: {'name','ccy','org','co','navs': {yyyymmdd: nav}}}"""
    out, ok = {}, []
    try:
        for day, co, code, name, ccy, nav, prev in sitca_all():
            nav, prev = f(nav), f(prev)
            if not code or not nav:
                continue
            x = out.setdefault(code, {'name': name.split(' (')[0].split(' ((')[0].strip(), 'ccy': ccy or 'TWD', 'org': 'D', 'co': co, 'navs': {}})
            x['navs'][day] = nav
            if prev:
                x.setdefault('prev', prev)
        if out:
            ok.append('D')
    except Exception as e:  # noqa
        log(f'投信投顧公會查詢頁失敗：{e}')
    try:
        rs = rows(SRC_D)
        for r in rs:
            code = (r.get('基金統編') or '').strip()
            nav, day = f(r.get('基金淨值')), d8(r.get('日期'))
            if not code or not nav or not day:
                continue
            x = out.setdefault(code, {'name': (r.get('基金名稱') or '').strip(), 'ccy': (r.get('幣別') or 'TWD').strip().upper() or 'TWD',
                                      'org': 'D', 'co': (r.get('公司名稱') or '').strip(), 'navs': {}})
            x['navs'].setdefault(day, nav)
        if 'D' not in ok and rs:
            ok.append('D')
        log(f'境內基金（每日淨值 CSV）：{len(rs)} 列')
    except Exception as e:  # noqa
        log(f'境內基金失敗：{e}')
    try:
        rs = rows(SRC_O)
        n0 = len(out)
        for r in rs:
            code = (r.get('基金代碼') or '').strip()
            nav, day = f(r.get('基金淨值(金額)')), d8(r.get('日期'))
            if not code or not nav or not day:
                continue
            x = out.setdefault(code, {'name': (r.get('基金名稱') or '').strip(), 'ccy': (r.get('計價幣別') or 'USD').strip().upper(),
                                      'org': 'O', 'co': '', 'navs': {}})
            x['navs'][day] = nav
        ok.append('O')
        log(f'境外基金：{len(rs)} 列，{len(out) - n0} 檔')
    except Exception as e:  # noqa
        log(f'境外基金失敗：{e}')
    return out, ok


def iso(d):
    s = str(d)
    return f'{s[:4]}-{s[4:6]}-{s[6:]}'


def main():
    os.makedirs(os.path.join(OUT, 'hist'), exist_ok=True)
    new, ok = collect()
    old_list = load(os.path.join(OUT, 'list.json'), {}).get('s', {})
    hist = [load(os.path.join(OUT, 'hist', f'{i:02d}.json'), {}) for i in range(SHARDS)]

    # 合併歷史
    for code, x in new.items():
        h = hist[shard(code)]
        m = {int(d): v for d, v in h.get(code, [])}
        m.update(x['navs'])
        h[code] = [[d, m[d]] for d in sorted(m)[-HIST_N:]]

    # 這次沒抓到的來源，保留舊清單
    s = {}
    for code, row in old_list.items():
        if row[5] not in ok:
            s[code] = row
    for code, x in new.items():
        h = hist[shard(code)][code]
        last = h[-1]
        prev = h[-2][1] if len(h) > 1 else x.get('prev', last[1])
        s[code] = [x['name'], x['ccy'], last[1], prev, iso(last[0]), x['org'], x['co']]

    # 清掉很久沒更新（已下市／清算）的基金
    if s:
        newest = max(r[4] for r in s.values())
        cut = time.strftime('%Y-%m-%d', time.gmtime(time.mktime(time.strptime(newest, '%Y-%m-%d')) - 45 * 86400))
        gone = [c for c, r in s.items() if r[4] < cut]
        for c in gone:
            s.pop(c)
            hist[shard(c)].pop(c, None)
        if gone:
            log(f'移除 {len(gone)} 檔超過 45 天沒有淨值的基金')
    else:
        newest = ''

    # 一檔一行，讓 git 只記錄有變的部分
    def write(path, obj, head='', tail=''):
        with open(path, 'w', encoding='utf-8') as fp:
            fp.write('{' + head)
            fp.write(',\n'.join(f'{json.dumps(k, ensure_ascii=False)}:{json.dumps(v, ensure_ascii=False, separators=(",", ":"))}' for k, v in sorted(obj.items())))
            fp.write(tail + '}\n')

    nd = sum(1 for r in s.values() if r[5] == 'D')
    write(os.path.join(OUT, 'list.json'), s, head=f'"date":{json.dumps(newest)},"n":{len(s)},"shards":{SHARDS},"s":{{\n', tail='}')
    for i in range(SHARDS):
        write(os.path.join(OUT, 'hist', f'{i:02d}.json'), hist[i])
    meta = {'updated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'date': newest, 'n': len(s), 'domestic': nd, 'offshore': len(s) - nd, 'ok': ok, 'log': LOG[-30:]}
    with open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8') as fp:
        json.dump(meta, fp, ensure_ascii=False)
    log(f'完成：境內 {nd} 檔、境外 {len(s) - nd} 檔，最新 {newest}')
    if not ok:
        sys.exit(1)


if __name__ == '__main__':
    main()
