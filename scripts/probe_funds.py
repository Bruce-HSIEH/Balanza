import os, re, json, urllib.request, socket
socket.setdefaulttimeout(25)
os.makedirs('data/probe', exist_ok=True)
out = {}
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36'}
B = 'https://www.fundclear.com.tw/'
def get(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25).read().decode('utf-8', 'replace')
h = get(B)
todo = [s if s.startswith('http') else B + s.lstrip('/') for s in re.findall(r'src="([^"]+\.js)"', h)]
done, hits = set(), []
while todo and len(done) < 120:
    u = todo.pop()
    if u in done: continue
    done.add(u)
    try: t = get(u)
    except Exception: continue
    for c in set(re.findall(r'["\']((?:chunk-)?[A-Za-z0-9_\-]{6,40}\.js)["\']', t)):
        todo.append(B + c)
    for m in re.finditer(r'DownloadDocDownloadNav\(|download-nav|navDate|NavDate', t):
        hits.append(u.split('/')[-1] + ' @ ' + t[max(0, m.start() - 600): m.start() + 400].replace('\n', ' '))
out['n_js'] = len(done)
out['hits'] = hits[:60]
json.dump(out, open('data/probe/out.json', 'w'), ensure_ascii=False, indent=1)
