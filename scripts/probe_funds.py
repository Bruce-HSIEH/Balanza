import os, re, json, urllib.request, socket, datetime as dt
socket.setdefaulttimeout(40)
os.makedirs('data/probe', exist_ok=True)
out = {}
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36', 'Content-Type': 'application/json', 'Accept': 'application/json, text/plain, */*', 'Origin': 'https://www.fundclear.com.tw', 'Referer': 'https://www.fundclear.com.tw/onshore/fund-doc?type=nav'}
B = 'https://www.fundclear.com.tw'
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA['User-Agent']}), timeout=40).read().decode('utf-8', 'replace')
def post(path, body):
    try:
        r = urllib.request.urlopen(urllib.request.Request(B + path, data=json.dumps(body).encode(), headers=UA), timeout=60)
        return r.status, r.headers.get('Content-Type'), r.read()
    except urllib.error.HTTPError as e: return e.code, None, e.read()
import traceback
try:
    h = get(B + '/')
    main = [s for s in re.findall(r'src="([^"]+\.js)"', h) if 'main' in s][0]
    t = get(B + '/' + main.lstrip('/'))
    i = t.find('onshoreCommonSelectOrgSelection(')
    j = t.find('basePath}', i)
    path = t[j + 9: t.find('`', j)] if i >= 0 and j >= 0 else None
    out['orgCtx'] = t[i: i + 900] if i >= 0 else 'notfound'
    out['orgPath'] = path
    try:
        st, ct, b = post(path, {'all': True}) if path else (0, 0, b'')
    except Exception as e:
        st, ct, b = 0, 0, repr(e).encode()
    out['org'] = {'st': st, 'head': b[:1500].decode('utf-8', 'replace')}
    try:
        orgs = json.loads(b.decode('utf-8'))
        data = orgs.get('data', orgs) if isinstance(orgs, dict) else orgs
    except Exception: data = []
    out['n_org'] = len(data) if isinstance(data, list) else str(type(data))
    day = (dt.datetime.utcnow() + dt.timedelta(hours=8) - dt.timedelta(days=1)).strftime('%Y/%m/%d')
    res = {}
    cands = []
    if isinstance(data, list):
        cands = [d.get('value') or d.get('uuid') or d.get('id') for d in data[:3] if isinstance(d, dict)]
    for aid in cands + ['', 'ALL', 'all']:
        try: st, ct, b = post('/api/onshore/download-doc/download-nav', {'agentId': aid, 'navDate': day})
        except Exception as e: st, ct, b = 0, 0, repr(e).encode()
        res[str(aid)] = {'st': st, 'ct': ct, 'len': len(b), 'head': b[:600].decode('utf-8-sig', 'replace')}
    out['nav'] = res
except Exception:
    out['tb'] = traceback.format_exc()
json.dump(out, open('data/probe/out.json', 'w'), ensure_ascii=False, indent=1)
