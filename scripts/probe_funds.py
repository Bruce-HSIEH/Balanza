import os, re, json, urllib.request, socket
socket.setdefaulttimeout(25)
os.makedirs('data/probe', exist_ok=True)
out = {}
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36'}
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25).read().decode('utf-8', 'replace')
h = get('https://www.fundclear.com.tw/')
js = re.findall(r'src="([^"]+\.js)"', h)
segs = []
for s in js:
    u = s if s.startswith('http') else 'https://www.fundclear.com.tw/' + s.lstrip('/')
    t = get(u)
    for kw in ('download-doc', 'nav-profit', 'navProfit', 'fund-doc', 'downloadNav', 'download-nav'):
        for m in re.finditer(re.escape(kw), t):
            segs.append(t[max(0, m.start() - 400): m.start() + 400].replace('\n', ' '))
    # 類別定義：含 type:"nav" 的元件附近
    for m in re.finditer(r'type:"nav"|"nav"', t):
        segs.append('NAV@' + t[max(0, m.start() - 300): m.start() + 300].replace('\n', ' '))
seen, uniq = set(), []
for x in segs:
    k = x[350:450]
    if k not in seen: seen.add(k); uniq.append(x)
out['segs'] = uniq[:120]
# 試打幾個可能的下載
tries = {}
for path, body in [('/api/onshore/download-doc/download-nav', {}), ('/api/onshore/download-doc/download-fund-type', {}), ('/api/onshore/download-doc/init', {}), ('/api/onshore/download-doc/query', {})]:
    try:
        r = urllib.request.urlopen(urllib.request.Request('https://www.fundclear.com.tw' + path, data=json.dumps(body).encode(), headers={**UA, 'Content-Type': 'application/json', 'Accept': '*/*'}), timeout=25)
        b = r.read(); tries[path] = {'status': r.status, 'type': r.headers.get('Content-Type'), 'disp': r.headers.get('Content-Disposition'), 'len': len(b), 'head': b[:300].decode('utf-8', 'replace')}
    except urllib.error.HTTPError as e: tries[path] = {'status': e.code, 'body': e.read()[:300].decode('utf-8', 'replace')}
    except Exception as e: tries[path] = repr(e)
out['tries'] = tries
json.dump(out, open('data/probe/out.json', 'w'), ensure_ascii=False, indent=1)
