# 暫時：找投資海外的境內基金淨值
import os, re, json, urllib.request, socket
socket.setdefaulttimeout(25)
os.makedirs('data/probe', exist_ok=True)
out = {}
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36'}
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25).read().decode('utf-8', 'replace')
for pg in ('IN2104.aspx?pid=IN2213_01', 'IN2107.aspx?pid=IN2213_03', 'IN2103.aspx?pid=IN2212_01'):
    u = 'https://www.sitca.org.tw/ROC/Industry/' + pg
    try:
        t = get(u)
        open('data/probe/' + pg.split('.')[0] + '.html', 'w').write(re.sub(r'value="[^"]{300,}"', 'value="…"', t))
        out[pg] = {'len': len(t), 'inputs': re.findall(r'<(?:input|select)[^>]*name="([^"]+)"', t),
                   'text': re.sub(r'\s+', ' ', re.sub('<[^>]+>', ' ', re.sub(r'<script.*?</script>|value="[^"]{100,}"', '', t, flags=re.S)))[:1200]}
    except Exception as e: out[pg] = repr(e)
try:
    h = get('https://www.fundclear.com.tw/')
    js = re.findall(r'src="([^"]+\.js)"', h)
    found = set()
    for s in js:
        u = s if s.startswith('http') else 'https://www.fundclear.com.tw/' + s.lstrip('/')
        t = get(u)
        for m in re.finditer(r'onshore', t):
            seg = t[max(0, m.start() - 80): m.start() + 120]
            if 'api' in seg or 'nav' in seg.lower() or 'Nav' in seg: found.add(seg.replace('\n', ' '))
    out['fundclear'] = sorted(found)[:200]
except Exception as e: out['fundclear_err'] = repr(e)
json.dump(out, open('data/probe/out.json', 'w'), ensure_ascii=False, indent=1)
