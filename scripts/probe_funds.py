# 暫時：探測境內基金完整淨值來源
import re, urllib.request, urllib.parse, http.cookiejar, json, os, datetime as dt
os.makedirs('data/probe', exist_ok=True)
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
cj = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def req(url, data=None, ref=None):
    h = {'User-Agent': UA}
    if ref: h['Referer'] = ref
    r = op.open(urllib.request.Request(url, data=data, headers=h), timeout=90)
    return r.read(), dict(r.headers)
out = {}
U = 'https://www.sitca.org.tw/ROC/Industry/IN2106.aspx?pid=IN2213_02'
try:
    html, _ = req(U); t = html.decode('utf-8', 'replace')
    hid = dict(re.findall(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', t))
    day = (dt.datetime.utcnow() + dt.timedelta(hours=8) - dt.timedelta(days=1)).strftime('%Y%m%d')
    for btn in ('BtnExport', 'BtnQuery'):
        f = dict(hid); f['ctl00$ContentPlaceHolder1$txtQ_Date'] = day; f['ctl00$ContentPlaceHolder1$ddlQ_Comid'] = ''
        f[f'ctl00$ContentPlaceHolder1${btn}'] = '匯出' if btn == 'BtnExport' else '查詢'
        b, h = req(U, urllib.parse.urlencode(f).encode(), U)
        open(f'data/probe/sitca-{btn}.bin', 'wb').write(b[:200000])
        out[btn] = {'len': len(b), 'type': h.get('Content-Type'), 'disp': h.get('Content-Disposition')}
except Exception as e:
    out['sitca_err'] = repr(e)
for i in list(range(1, 46)):
    for c in ('1', '2', '4'):
        u = f'https://opendata.tdcc.com.tw/getOD.ashx?id={c}-{i}'
        try:
            b, h = req(u)
            if len(b) > 50: out[f'{c}-{i}'] = {'len': len(b), 'head': b[:300].decode('utf-8-sig', 'replace')}
        except Exception as e:
            pass
json.dump(out, open('data/probe/out.json', 'w'), ensure_ascii=False, indent=1)
