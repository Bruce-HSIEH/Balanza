#!/usr/bin/env python3
"""每天收盤後更新股價（只用 Python 標準函式庫）。

輸出（供 App 讀取）：
  data/stocks/tw.json   {"date", "dates":[...], "s": {"2330": ["台積電", [收盤..]]}}   上市＋上櫃股票與 ETF，近 30 個交易日
  data/stocks/us.json   {"date", "s": {"AAPL": ["Apple Inc.", [收盤..]]}}             S&P 500＋熱門個股／ETF＋extra.txt
  data/stocks/meta.json {"updated", "fx": {"TWD":1,"USD":32.1,...}, "tw": {...}, "us": {...}}  匯率為 1 單位外幣 = ? 新台幣

來源：臺灣證券交易所、證券櫃買中心每日收盤行情；美股與匯率為 Yahoo Finance 日線。
用法：python scripts/build_stocks.py [--days 30] [--skip-us] [--skip-tw]
"""
import argparse, concurrent.futures as cf, datetime as dt, json, os, re, sys, time, urllib.parse, urllib.request

OUT = 'data/stocks'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept': 'application/json,text/plain,*/*'}
TW_CODE = re.compile(r'^(\d{4}|00\d{2,4}[A-Z]?)$')   # 一般股票與 ETF（排除權證等）
TZ_TW = dt.timezone(dt.timedelta(hours=8))
status = {'errors': []}

# 熱門美股與 ETF（S&P 500 以外也常見的）
POPULAR_US = '''
SPY VOO IVV VTI VT QQQ QQQM DIA IWM VEA VWO VXUS BND AGG TLT IEF SHY SGOV BIL LQD HYG TIP GLD IAU SLV USO
VNQ SCHD VYM DVY HDV JEPI JEPQ DGRO VIG NOBL SPYD XLK XLF XLE XLV XLY XLP XLI XLU XLB XLRE XLC SMH SOXX SOXL TQQQ SQQQ
ARKK ARKW ARKG TAN ICLN LIT BOTZ KWEB FXI EWT EWJ INDA VGT VOOG VUG VTV MGK SCHG SPLG RSP COWZ QUAL MTUM USMV IBIT FBTC ETHA
TSM ASML BABA PDD JD NIO LI XPEV BIDU SE SHOP SONY TM NVO AZN SAP UL BTI HSBC RIO BHP SNY GSK BP SHEL TTE ARM
PLTR COIN HOOD RIVN LCID SOFI MSTR SNOW NET CRWD DDOG ZS MDB OKTA U RBLX DKNG ROKU SQ XYZ PYPL UBER LYFT ABNB DASH SPOT
TEAM WDAY HUBS TWLO PINS SNAP ZM DOCU CRSP BNTX MRNA AFRM UPST AI SMCI IONQ RGTI QBTS OKLO SOUN TEM RDDT ALAB CRWV
'''.split()


def get(url, tries=3, timeout=40, raw=False):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                b = r.read()
            return b if raw else json.loads(b.decode('utf-8-sig'))
        except Exception as e:  # noqa
            last = e
            time.sleep(2 * (i + 1))
    raise last


def fnum(v):
    try:
        x = float(str(v).replace(',', '').strip())
        return x if x > 0 else None
    except (ValueError, TypeError):
        return None


def load(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:  # noqa
        return default


def dump(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


# ---------------- 台股 ----------------
def find_table(j, need):
    """在證交所／櫃買回應裡找出含有指定欄位的表格，回傳 (fields, rows)。"""
    cands = []
    if isinstance(j.get('tables'), list):
        cands += [(t.get('fields') or [], t.get('data') or []) for t in j['tables'] if isinstance(t, dict)]
    for k, v in j.items():
        m = re.match(r'^fields(\d*)$', k)
        if m and isinstance(v, list):
            cands.append((v, j.get('data' + m.group(1)) or []))
    if 'aaData' in j:
        cands.append((j.get('fields') or ['代號', '名稱', '收盤'], j['aaData']))
    for fields, rows in cands:
        f = [str(x).strip() for x in fields]
        if all(any(n in x for x in f) for n in need) and rows:
            return f, rows
    return None, None


def col(fields, *names):
    for n in names:
        for i, x in enumerate(fields):
            if x == n:
                return i
    for n in names:
        for i, x in enumerate(fields):
            if n in x:
                return i
    return None


def twse_day(d):
    url = f'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={d:%Y%m%d}&type=ALLBUT0999&response=json'
    j = get(url)
    if j.get('stat') not in (None, 'OK'):
        return {}
    f, rows = find_table(j, ['證券代號', '收盤價'])
    if not f:
        return {}
    ic, inm, icl = col(f, '證券代號'), col(f, '證券名稱'), col(f, '收盤價')
    out = {}
    for r in rows:
        code = str(r[ic]).strip()
        if TW_CODE.match(code):
            out[code] = (str(r[inm]).strip(), fnum(r[icl]))
    return out


def tpex_day(d):
    roc = f'{d.year - 1911}/{d:%m/%d}'
    urls = [
        f'https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQ?date={d:%Y/%m/%d}&response=json',
        f'https://www.tpex.org.tw/web/stock/aftertrading/daily_close_quotes/stk_quote_result.php?l=zh-tw&d={roc}&o=json',
    ]
    for url in urls:
        try:
            j = get(url, tries=2)
        except Exception:  # noqa
            continue
        f, rows = find_table(j, ['代號', '收盤'])
        if not f:
            continue
        ic, inm, icl = col(f, '代號', '證券代號'), col(f, '名稱', '證券名稱'), col(f, '收盤', '收盤價')
        if None in (ic, inm, icl):
            ic, inm, icl = 0, 1, 2
        out = {}
        for r in rows:
            code = str(r[ic]).strip()
            if TW_CODE.match(code):
                out[code] = (str(r[inm]).strip(), fnum(r[icl]))
        if out:
            return out
    return {}


def tw_latest_openapi():
    """備援：只拿得到最新一天時使用。"""
    out, date = {}, None
    try:
        for x in get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'):
            c = str(x.get('Code', '')).strip()
            if TW_CODE.match(c):
                out[c] = (x.get('Name', '').strip(), fnum(x.get('ClosingPrice')))
            date = date or x.get('Date')
    except Exception as e:  # noqa
        status['errors'].append(f'twse openapi: {e}')
    try:
        for x in get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes'):
            c = str(x.get('SecuritiesCompanyCode', '')).strip()
            if TW_CODE.match(c):
                out[c] = (x.get('CompanyName', '').strip(), fnum(x.get('Close')))
            date = date or x.get('Date')
    except Exception as e:  # noqa
        status['errors'].append(f'tpex openapi: {e}')
    if date:
        s = re.sub(r'\D', '', str(date))
        if len(s) == 7:
            date = f'{int(s[:3]) + 1911}-{s[3:5]}-{s[5:]}'
        elif len(s) == 8:
            date = f'{s[:4]}-{s[4:6]}-{s[6:]}'
    return date, out


def build_tw(days):
    path = os.path.join(OUT, 'tw.json')
    old = load(path, {'dates': [], 's': {}})
    hist = {d: {} for d in old.get('dates', [])}
    names = {}
    for code, (name, closes) in old.get('s', {}).items():
        names[code] = name
        for d, c in zip(old['dates'], closes):
            if c is not None:
                hist[d][code] = c

    today = dt.datetime.now(TZ_TW).date()
    have = set(hist)
    fetched = ok_twse = ok_tpex = 0
    d = today
    tried = 0
    while tried < days * 2 + 14 and len([k for k in hist if hist[k]]) < days + 1:
        if d.weekday() < 5:
            key = d.isoformat()
            # 今天與最近 3 天都重抓（盤後資料可能晚到），其他已存在的日子跳過
            if key not in have or (today - d).days <= 3:
                day = {}
                try:
                    t = twse_day(d)
                    if t:
                        ok_twse += 1
                    day.update(t)
                except Exception as e:  # noqa
                    status['errors'].append(f'twse {key}: {e}')
                time.sleep(2.2)  # 證交所有頻率限制
                try:
                    t = tpex_day(d)
                    if t:
                        ok_tpex += 1
                    day.update(t)
                except Exception as e:  # noqa
                    status['errors'].append(f'tpex {key}: {e}')
                time.sleep(1.2)
                fetched += 1
                if day:
                    hist[key] = {c: v for c, (n, v) in day.items() if v}
                    for c, (n, v) in day.items():
                        if n:
                            names[c] = n
        d -= dt.timedelta(days=1)
        tried += 1

    if not any(hist.values()):
        date, latest = tw_latest_openapi()
        if latest and date:
            hist[date] = {c: v for c, (n, v) in latest.items() if v}
            names.update({c: n for c, (n, v) in latest.items() if n})

    dates = sorted(k for k in hist if hist[k])[-days:]
    if not dates:
        status['tw'] = {'n': 0, 'error': '沒有取得任何台股資料'}
        return False
    s = {}
    for code, name in names.items():
        closes = [hist[d].get(code) for d in dates]
        if any(c is not None for c in closes[-5:]):  # 最近 5 個交易日有成交才收錄
            s[code] = [name, [round(c, 2) if c is not None else None for c in closes]]
    dump(path, {'date': dates[-1], 'dates': dates, 's': dict(sorted(s.items()))})
    status['tw'] = {'date': dates[-1], 'n': len(s), 'days': len(dates), 'fetched_days': fetched, 'twse_ok': ok_twse, 'tpex_ok': ok_tpex}
    print(f'台股 {len(s)} 檔，{len(dates)} 個交易日，最新 {dates[-1]}')
    return True


# ---------------- 美股與匯率 ----------------
def yahoo(sym, rng='2mo'):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range={rng}&interval=1d'
    j = get(url, tries=2, timeout=25)
    r = j['chart']['result'][0]
    meta = r['meta']
    closes = (r.get('indicators', {}).get('quote') or [{}])[0].get('close') or []
    ts = r.get('timestamp') or []
    pairs = [(t, c) for t, c in zip(ts, closes) if c is not None]
    last = meta.get('regularMarketPrice')
    if pairs and last and abs(pairs[-1][1] - last) / last > 1e-6 and dt.datetime.utcfromtimestamp(pairs[-1][0]).date() == dt.datetime.utcfromtimestamp(meta.get('regularMarketTime', 0)).date():
        pairs[-1] = (pairs[-1][0], last)
    name = meta.get('longName') or meta.get('shortName') or sym
    date = dt.datetime.utcfromtimestamp(pairs[-1][0]).date().isoformat() if pairs else None
    return name, [round(c, 4 if c < 1 else 2) for _, c in pairs][-30:], date


def sp500():
    try:
        raw = get('https://en.wikipedia.org/w/index.php?title=List_of_S%26P_500_companies&action=raw', raw=True).decode('utf-8')
        syms = re.findall(r'\{\{\s*(?:NyseSymbol|NasdaqSymbol|nyse|nasdaq|NYSE|NASDAQ)\s*\|\s*([A-Za-z.\-]+)\s*\}\}', raw)
        syms = sorted({s.upper().replace('.', '-') for s in syms})
        if len(syms) > 400:
            return syms
        status['errors'].append(f'sp500 解析只有 {len(syms)} 檔')
    except Exception as e:  # noqa
        status['errors'].append(f'sp500: {e}')
    return []


def build_us():
    path = os.path.join(OUT, 'us.json')
    old = load(path, {'s': {}})
    extra = []
    try:
        with open(os.path.join(OUT, 'extra.txt'), encoding='utf-8') as f:
            extra = [l.split('#')[0].strip().upper().replace('.', '-') for l in f]
    except FileNotFoundError:
        pass
    universe = sorted(set(sp500()) | set(POPULAR_US) | set(old['s']) | {e for e in extra if e})
    s, dates, failed = {}, [], []

    def job(sym):
        try:
            return sym, yahoo(sym)
        except Exception as e:  # noqa
            return sym, e

    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        for sym, res in ex.map(job, universe):
            if isinstance(res, Exception) or not res[1]:
                failed.append(sym)
                if sym in old['s']:
                    s[sym] = old['s'][sym]
                continue
            name, closes, date = res
            s[sym] = [name, closes]
            if date:
                dates.append(date)
    if not dates:
        status['us'] = {'n': len(s), 'error': 'Yahoo 沒有回應，沿用舊資料', 'failed': len(failed)}
        if s:
            dump(path, {'date': old.get('date'), 's': dict(sorted(s.items()))})
        return
    date = max(dates)
    dump(path, {'date': date, 's': dict(sorted(s.items()))})
    status['us'] = {'date': date, 'n': len(s), 'universe': len(universe), 'failed': len(failed), 'failed_sample': failed[:20]}
    print(f'美股 {len(s)} 檔（失敗 {len(failed)}），最新 {date}')


def build_fx(old_fx):
    fx = {'TWD': 1}
    for ccy, sym in (('USD', 'TWD=X'), ('JPY', 'JPYTWD=X'), ('EUR', 'EURTWD=X')):
        try:
            _, closes, _ = yahoo(sym, '5d')
            fx[ccy] = round(closes[-1], 4 if ccy == 'JPY' else 3)
        except Exception as e:  # noqa
            status['errors'].append(f'fx {ccy}: {e}')
            if ccy in old_fx:
                fx[ccy] = old_fx[ccy]
    return fx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--days', type=int, default=30)
    ap.add_argument('--skip-tw', action='store_true')
    ap.add_argument('--skip-us', action='store_true')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    old_meta = load(os.path.join(OUT, 'meta.json'), {})
    if not a.skip_tw:
        build_tw(a.days)
    else:
        status['tw'] = old_meta.get('tw')
    if not a.skip_us:
        build_us()
    else:
        status['us'] = old_meta.get('us')
    fx = build_fx(old_meta.get('fx', {}))
    meta = {'updated': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), 'fx': fx,
            'tw': status.get('tw'), 'us': status.get('us'), 'errors': status['errors'][:30]}
    dump(os.path.join(OUT, 'meta.json'), meta)
    print(json.dumps(meta, ensure_ascii=False, indent=1)[:2000])


if __name__ == '__main__':
    main()
