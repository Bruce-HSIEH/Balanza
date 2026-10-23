import os, re, json, urllib.request, socket, datetime as dt, traceback, csv, io, collections
os.makedirs('data/probe', exist_ok=True)
out = {}
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36', 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*', 'Origin': 'https://www.fundclear.com.tw', 'Referer': 'https://www.fundclear.com.tw/onshore/fund-doc?type=nav'}
def post(path, body):
    try:
        r = urllib.request.urlopen(urllib.request.Request('https://www.fundclear.com.tw' + path, data=json.dumps(body).encode(), headers=UA), timeout=60)
        return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
now = dt.datetime.utcnow() + dt.timedelta(hours=8)
for back in range(0, 6):
    day = (now - dt.timedelta(days=back)).strftime('%Y/%m/%d')
    try:
        st, b = post('/api/onshore/download-doc/download-nav', {'agentId': 'all', 'navDate': day})
        if st != 200: out[day] = {'st': st, 'msg': b[:100].decode('utf-8', 'replace')}; continue
        rows = list(csv.DictReader(io.StringIO(b.decode('utf-8-sig', 'replace'))))
        out[day] = {'n': len(rows), 'ccy': collections.Counter(r.get('計價幣別') for r in rows).most_common(8), 'dates': collections.Counter(r.get('淨值日期') for r in rows).most_common(4), 'anlian': [r['基金中文名稱'] for r in rows if '安聯' in r.get('基金中文名稱', '')][:12]}
    except Exception: out[day] = traceback.format_exc()[-300:]
json.dump(out, open('data/probe/out.json', 'w'), ensure_ascii=False, indent=1)
