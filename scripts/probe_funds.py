# 暫時：找跨國投資的境內基金淨值
import sys, os, re, json, urllib.request
sys.path.insert(0, 'scripts'); import build_funds as B
os.makedirs('data/probe', exist_ok=True)
out = {}
for pid in ('IN2213_01', 'IN2213_02', 'IN2213_03', 'IN2213_04', 'IN2213_05'):
    B.SRC_D2 = f'https://www.sitca.org.tw/ROC/Industry/IN2106.aspx?pid={pid}'
    try:
        rs = B.sitca_all(); out[pid] = {'n': len(rs), 'ccy': sorted(set(r[4] for r in rs)), 'sample': [r[3] for r in rs[:3]]}
    except Exception as e: out[pid] = repr(e)
UA = {'User-Agent': 'Mozilla/5.0 Chrome/124'}
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read().decode('utf-8', 'replace')
try:
    h = get('https://www.fundclear.com.tw/')
    js = re.findall(r'src="([^"]+\.js)"', h)
    apis = set()
    for s in js:
        u = s if s.startswith('http') else 'https://www.fundclear.com.tw/' + s.lstrip('/')
        t = get(u)
        apis |= set(re.findall(r'["\'`](/?api/[A-Za-z0-9_/\-]+)', t))
        apis |= set(re.findall(r'["\'`](https?://[a-z0-9.\-]*fundclear[^"\'`]{0,100})', t))
    out['fundclear'] = sorted(apis)
except Exception as e: out['fundclear_err'] = repr(e)
for u in ['https://www.sitca.org.tw/ROC/Industry/IN2002.aspx?PGMID=IN0202', 'https://www.sitca.org.tw/ROC/Industry/IN2105.aspx']:
    try:
        t = get(u); out[u] = sorted(set(re.findall(r'IN2\d{3}\.aspx[^"\'<> ]{0,40}', t)))[:80]
    except Exception as e: out[u] = repr(e)
json.dump(out, open('data/probe/out.json', 'w'), ensure_ascii=False, indent=1)
