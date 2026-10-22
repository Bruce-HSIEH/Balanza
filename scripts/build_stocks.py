#!/usr/bin/env python3
"""每天收盤後更新股價（只用 Python 標準函式庫）。

輸出（供 App 讀取）：
  data/stocks/tw.json   {"date", "src", "s": {"2330": ["台積電", [收盤..], "YYYY-MM-DD"]}}  上市＋上櫃股票與 ETF
  data/stocks/us.json   {"date", "src", "s": {"AAPL": ["Apple Inc.", [收盤..], "YYYY-MM-DD"]}}
  data/stocks/meta.json {"updated", "fx": {"TWD":1,"USD":32.1,...}, "tw": {...}, "us": {...}, "log": [...]}

策略（每一步都有時間上限，任何一步失敗都會改用下一個來源，並保留舊資料）：
  台股清單＋最新收盤：證交所 OpenAPI、櫃買 OpenAPI → 失敗時用 Yahoo
  台股近 30 日走勢：Yahoo spark（批次 20 檔）→ 失敗時沿用舊走勢並接上今天收盤
  美股：Yahoo spark 批次 → 缺的再用 chart 逐檔補
用法：python scripts/build_stocks.py [--only tw|us] [--budget 600]
"""
import argparse, concurrent.futures as cf, datetime as dt, json, os, re, sys, time, urllib.parse, urllib.request

OUT = 'data/stocks'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept': 'application/json,text/plain,*/*', 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'}
TW_CODE = re.compile(r'^(\d{4}|00\d{2,4}[A-Z]?)$')   # 一般股票與 ETF（排除權證等）
TZ_TW = dt.timezone(dt.timedelta(hours=8))
LOG = []
T0 = time.time()

POPULAR_US = '''
SPY VOO IVV VTI VT QQQ QQQM DIA IWM VEA VWO VXUS BND AGG TLT IEF SHY SGOV BIL LQD HYG TIP GLD IAU SLV USO
VNQ SCHD VYM DVY HDV JEPI JEPQ DGRO VIG NOBL SPYD XLK XLF XLE XLV XLY XLP XLI XLU XLB XLRE XLC SMH SOXX SOXL TQQQ SQQQ
ARKK ARKW ARKG TAN ICLN LIT BOTZ KWEB FXI EWT EWJ INDA VGT VOOG VUG VTV MGK SCHG SPLG RSP COWZ QUAL MTUM USMV IBIT FBTC ETHA
TSM ASML BABA PDD JD NIO LI XPEV BIDU SE SHOP SONY TM NVO AZN SAP UL BTI HSBC RIO BHP SNY GSK BP SHEL TTE ARM
PLTR COIN HOOD RIVN LCID SOFI MSTR SNOW NET CRWD DDOG ZS MDB OKTA U RBLX DKNG ROKU XYZ PYPL UBER LYFT ABNB DASH SPOT
TEAM WDAY HUBS TWLO PINS SNAP ZM DOCU CRSP BNTX MRNA AFRM UPST AI SMCI IONQ RGTI QBTS OKLO SOUN TEM RDDT ALAB CRWV
AAPL MSFT NVDA AMZN GOOGL GOOG META TSLA AVGO BRK-B JPM V MA NFLX AMD INTC QCOM MU ORCL CRM ADBE KO PEP MCD DIS NKE WMT COST
'''.split()


def log(msg):
    line = f'[{time.time() - T0:5.0f}s] {msg}'
    print(line, flush=True)
    LOG.append(line)


def get(url, timeout=15, tries=1, raw=False):
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                b = r.read()
            return b if raw else json.loads(b.decode('utf-8-sig'))
        except Exception as e:  # noqa
            last = e
            if i + 1 < tries:
                time.sleep(1.5 * (i + 1))
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


def iso_from_any(s):
    s = re.sub(r'\D', '', str(s or ''))
    if len(s) == 7:
        return f'{int(s[:3]) + 1911}-{s[3:5]}-{s[5:]}'
    if len(s) == 8:
        return f'{s[:4]}-{s[4:6]}-{s[6:]}'
    return None


# ---------------- Yahoo ----------------
def parse_spark(j):
    """回傳 {symbol: (name, [closes], last_date)}，相容 v7 與 v8 spark 兩種格式。"""
    out = {}
    if isinstance(j, dict) and 'spark' in j:
        for r in (j['spark'].get('result') or []):
            sym = r.get('symbol')
            for resp in (r.get('response') or [])[:1]:
                meta = resp.get('meta', {})
                ts = resp.get('timestamp') or []
                cl = ((resp.get('indicators') or {}).get('quote') or [{}])[0].get('close') or []
                out[sym] = (meta.get('longName') or meta.get('shortName'), ts, cl, meta.get('regularMarketPrice'))
    elif isinstance(j, dict):
        for sym, r in j.items():
            if isinstance(r, dict) and 'close' in r:
                out[sym] = (r.get('longName') or r.get('shortName'), r.get('timestamp') or [], r.get('close') or [], None)
    res = {}
    for sym, (name, ts, cl, last) in out.items():
        pairs = [(t, c) for t, c in zip(ts, cl) if c is not None]
        if not pairs:
            continue
        closes = [c for _, c in pairs][-30:]
        if last and abs(closes[-1] - last) / last > 1e-6 and time.time() - pairs[-1][0] < 86400:
            closes[-1] = last
        d = dt.datetime.fromtimestamp(pairs[-1][0], dt.timezone.utc).astimezone(TZ_TW if sym.endswith(('.TW', '.TWO')) else dt.timezone(dt.timedelta(hours=-5))).date().isoformat()
        res[sym] = (name, [round(c, 4 if c < 1 else 2) for c in closes], d)
    return res


def yahoo_spark(symbols, deadline, batch=20, rng='1mo'):
    res, fails = {}, 0
    for i in range(0, len(symbols), batch):
        if time.time() > deadline:
            log(f'  spark 時間到，完成 {i}/{len(symbols)}')
            break
        chunk = symbols[i:i + batch]
        q = urllib.parse.quote(','.join(chunk), safe=',')
        ok = False
        for host in ('query1', 'query2'):
            try:
                res.update(parse_spark(get(f'https://{host}.finance.yahoo.com/v7/finance/spark?symbols={q}&range={rng}&interval=1d', timeout=20)))
                ok = True
                break
            except Exception as e:  # noqa
                err = e
        if not ok:
            fails += 1
            if fails == 1:
                log(f'  spark 失敗：{err}')
            if fails >= 3 and not res:
                log('  spark 連續失敗，放棄')
                break
        time.sleep(0.25)
    return res


def yahoo_chart(sym, rng='1mo'):
    j = get(f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range={rng}&interval=1d', timeout=15)
    r = j['chart']['result'][0]
    fake = {'spark': {'result': [{'symbol': sym, 'response': [r]}]}}
    out = parse_spark(fake).get(sym)
    if out and not out[0]:
        m = r.get('meta', {})
        out = (m.get('longName') or m.get('shortName'), out[1], out[2])
    return out


def yahoo_charts(symbols, deadline, workers=6):
    res = {}

    def job(s):
        if time.time() > deadline:
            return s, None
        try:
            return s, yahoo_chart(s)
        except Exception:  # noqa
            return s, None
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        for s, r in ex.map(job, symbols):
            if r:
                res[s] = r
    return res


# ---------------- 台股 ----------------
def tw_openapi():
    out, date = {}, None
    try:
        rows = get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', timeout=25)
        for x in rows:
            c = str(x.get('Code', '')).strip()
            if TW_CODE.match(c):
                out[c] = [str(x.get('Name', '')).strip(), fnum(x.get('ClosingPrice')), 'TW']
            date = date or iso_from_any(x.get('Date'))
        log(f'  證交所 OpenAPI：{sum(1 for v in out.values() if v[2] == "TW")} 檔，日期 {date}')
    except Exception as e:  # noqa
        log(f'  證交所 OpenAPI 失敗：{e}')
    try:
        rows = get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes', timeout=25)
        n = 0
        for x in rows:
            c = str(x.get('SecuritiesCompanyCode', '')).strip()
            if TW_CODE.match(c):
                out[c] = [str(x.get('CompanyName', '')).strip(), fnum(x.get('Close')), 'TWO']
                n += 1
            date = date or iso_from_any(x.get('Date'))
        log(f'  櫃買 OpenAPI：{n} 檔')
    except Exception as e:  # noqa
        log(f'  櫃買 OpenAPI 失敗：{e}')
    return date, out


def build_tw(budget):
    deadline = time.time() + budget
    path = os.path.join(OUT, 'tw.json')
    old = load(path, {'s': {}})
    log('台股：取得清單與最新收盤')
    date, latest = tw_openapi()

    # 清單：OpenAPI ＋ 舊檔（OpenAPI 失敗時至少用舊清單）
    universe = {c: (v[0], v[2]) for c, v in latest.items()}
    for c, row in old.get('s', {}).items():
        universe.setdefault(c, (row[0], row[3] if len(row) > 3 else 'TW'))
    if not universe:
        log('  沒有清單可用（第一次執行且 OpenAPI 失敗），改用常見代號')
        for c in '2330 2317 2454 2308 2382 2881 2882 2891 2303 2412 2886 1301 1303 2002 2603 2609 2615 3008 3711 2357 0050 0056 00878 00919 00929 006208 00713 00940 00692 00881 00631L 00632R'.split():
            universe[c] = (c, 'TW')

    # 走勢：Yahoo spark 批次
    syms = [f'{c}.{mkt}' for c, (n, mkt) in universe.items()]
    log(f'台股：Yahoo 走勢 {len(syms)} 檔')
    hist = yahoo_spark(syms, deadline - 20)
    # 上市／上櫃猜錯時補抓另一個尾碼
    missing = [s for s in syms if s not in hist]
    if missing and len(hist) > len(syms) * .3 and time.time() < deadline - 30:
        alt = [s.replace('.TWO', '.TW') if s.endswith('.TWO') else s.replace('.TW', '.TWO') for s in missing]
        hist.update(yahoo_spark(alt, deadline - 15))
    log(f'  Yahoo 取得 {len(hist)} 檔走勢')

    s = {}
    for c, (name, mkt) in universe.items():
        h = hist.get(f'{c}.{mkt}') or hist.get(f'{c}.{"TWO" if mkt == "TW" else "TW"}')
        oldrow = old.get('s', {}).get(c)
        lt = latest.get(c)
        if h:
            closes, d = h[1], h[2]
            mkt2 = 'TWO' if f'{c}.TWO' in hist and not f'{c}.{mkt}' in hist else mkt
            # 證交所當日收盤比 Yahoo 新時接上
            if lt and lt[1] and date and date > d:
                closes, d = (closes + [lt[1]])[-30:], date
            s[c] = [name, closes, d, mkt2]
        elif lt and lt[1]:
            closes = (oldrow[1] if oldrow else [])
            if oldrow and len(oldrow) > 2 and oldrow[2] == date:
                closes = closes[:-1]
            s[c] = [name, (closes + [lt[1]])[-30:], date, mkt]
        elif oldrow:
            s[c] = oldrow
    if not s:
        log('台股：沒有任何資料，保留舊檔')
        return {'n': 0, 'error': 'no data'}
    dates = sorted(v[2] for v in s.values() if v[2])
    newest = dates[-1] if dates else date
    dump(path, {'date': newest, 's': dict(sorted(s.items()))})
    info = {'date': newest, 'n': len(s), 'yahoo': len(hist), 'openapi': len(latest)}
    log(f'台股完成：{info}')
    return info


# ---------------- 美股 ----------------
def sp500():
    try:
        raw = get('https://en.wikipedia.org/w/index.php?title=List_of_S%26P_500_companies&action=raw', raw=True, timeout=20).decode('utf-8')
        rows = re.findall(r'\{\{\s*(?:NyseSymbol|NasdaqSymbol|nyse|nasdaq|NYSE|NASDAQ)\s*\|\s*([A-Za-z.\-]+)\s*\}\}\s*\|\|\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', raw)
        names = {sym.upper().replace('.', '-'): (alias or page).strip() for sym, page, alias in rows}
        if len(names) > 400:
            return names
        syms = re.findall(r'\{\{\s*(?:NyseSymbol|NasdaqSymbol|nyse|nasdaq|NYSE|NASDAQ)\s*\|\s*([A-Za-z.\-]+)\s*\}\}', raw)
        log(f'  S&P 500 名稱解析 {len(names)}、代號 {len(set(syms))}')
        return {x.upper().replace('.', '-'): None for x in syms} if len(set(syms)) > 400 else names
    except Exception as e:  # noqa
        log(f'  S&P 500 清單失敗：{e}')
        return {}


def build_us(budget):
    deadline = time.time() + budget
    path = os.path.join(OUT, 'us.json')
    old = load(path, {'s': {}})
    extra = []
    try:
        with open(os.path.join(OUT, 'extra.txt'), encoding='utf-8') as f:
            extra = [l.split('#')[0].strip().upper().replace('.', '-') for l in f]
    except FileNotFoundError:
        pass
    names = sp500()
    universe = sorted(set(names) | set(POPULAR_US) | set(old['s']) | {e for e in extra if e})
    log(f'美股：{len(universe)} 檔')
    res = yahoo_spark(universe, deadline - 60)
    missing = [x for x in universe if x not in res]
    if missing:
        log(f'  spark 缺 {len(missing)} 檔，改逐檔抓')
        res.update(yahoo_charts(missing, deadline - 10))
    s = {}
    for sym in universe:
        r = res.get(sym)
        oldrow = old['s'].get(sym)
        if r:
            nm = r[0] or names.get(sym) or (oldrow[0] if oldrow else None) or sym
            s[sym] = [nm, r[1], r[2]]
        elif oldrow:
            s[sym] = oldrow
    # 名稱缺漏的逐檔補一次（之後就存在檔案裡）
    need = [k for k, v in s.items() if v[0] == k][:150]
    if need and time.time() < deadline - 20:
        got = yahoo_charts(need, deadline - 5)
        for k, r in got.items():
            if r[0]:
                s[k][0] = r[0]
    if not s:
        log('美股：沒有任何資料')
        return {'n': 0, 'error': 'no data'}
    dates = sorted(v[2] for v in s.values() if len(v) > 2 and v[2])
    newest = dates[-1] if dates else old.get('date')
    dump(path, {'date': newest, 's': dict(sorted(s.items()))})
    info = {'date': newest, 'n': len(s), 'fresh': len(res), 'universe': len(universe)}
    log(f'美股完成：{info}')
    return info


def build_fx(old_fx):
    fx = {'TWD': 1}
    got = yahoo_spark(['TWD=X', 'JPYTWD=X', 'EURTWD=X'], time.time() + 30, rng='5d')
    for ccy, sym in (('USD', 'TWD=X'), ('JPY', 'JPYTWD=X'), ('EUR', 'EURTWD=X')):
        r = got.get(sym)
        if not r:
            try:
                r = yahoo_chart(sym, '5d')
            except Exception:  # noqa
                r = None
        if r:
            fx[ccy] = round(r[1][-1], 4 if ccy == 'JPY' else 3)
        elif ccy in old_fx:
            fx[ccy] = old_fx[ccy]
    log(f'匯率：{fx}')
    return fx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', choices=['tw', 'us'])
    ap.add_argument('--budget', type=int, default=600, help='每個市場最多花幾秒')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    meta_path = os.path.join(OUT, 'meta.json')
    meta = load(meta_path, {})
    try:
        if a.only in (None, 'tw'):
            meta['tw'] = build_tw(a.budget)
        if a.only in (None, 'us'):
            meta['us'] = build_us(a.budget)
        meta['fx'] = build_fx(meta.get('fx', {}))
    finally:
        meta['updated'] = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
        meta['log'] = (meta.get('log', []) if a.only == 'us' else [])[-40:] + LOG[-60:]
        dump(meta_path, meta)


if __name__ == '__main__':
    main()
