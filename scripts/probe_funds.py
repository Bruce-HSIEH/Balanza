import sys, os, re, json, urllib.request, html as H
sys.path.insert(0, 'scripts'); import build_funds as B
os.makedirs('data/probe', exist_ok=True)
out = {}
UA = {'User-Agent': 'Mozilla/5.0 Chrome/124'}
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read().decode('utf-8', 'replace')
for pg in ('IN2104.aspx?pid=IN2213_01', 'IN2107.aspx?pid=IN2213_03', 'IN2103.aspx?pid=IN2212_01', 'IN2105.aspx?pid=IN2212_02'):
    u = 'https://www.sitca.org.tw/ROC/Industry/' + pg
    try:
        t = get(u)
        o = {'title': [re.sub('<[^>]+>', '', x).strip() for x in re.findall(r'<(?:h\d|span[^>]*Title[^>]*)[^>]*>(.*?)</', t, re.S)][:6],
             'inputs': re.findall(r'<(?:input|select)[^>]*name="([^"]+)"', t), 'opts': re.findall(r'<option[^>]*value="([^"]*)"[^>]*>([^<]{0,30})', t)[:15],
             'text': re.sub(r'\s+', ' ', re.sub('<[^>]+>', ' ', re.sub(r'value="[^"]{100,}"', '', t)))[:1500]}
        if 'IN2107' in pg or 'IN2104' in pg:
            B.SRC_D2 = u
            try:
                rs = B.sitca_all(); o['n'] = len(rs); o['ccy'] = sorted(set(r[4] for r in rs)); o['sample'] = [r[3] for r in rs[:5]]
            except Exception as e: o['err'] = repr(e)
        out[pg] = o
    except Exception as e: out[pg] = repr(e)
json.dump(out, open('data/probe/out.json', 'w'), ensure_ascii=False, indent=1)
