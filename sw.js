// App 本體：快取優先（開啟很快，每次發版換 CACHE 名稱就會整包更新）；股價、基金等資料：網路優先
const CACHE = 'balanza-v5-27-0';
const DATA = 'balanza-data';   // 股價、基金等資料另外放，發新版時不會被清掉
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'ui.js', 'loan.js', 'lvr.js', 'icons.js', 'stocks.js', 'cars.js', 'changelog.js', 'lock.js', 'backup.js', 'voice.js', 'ai.js', 'sim.js', 'plan.js', 'charts.js', 'data/catalog.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  // cache: 'reload' 跳過瀏覽器快取，確保拿到這一版的檔案
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const SHELL = new Set(ASSETS.map(u => new URL(u, self.registration.scope).href));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const url = new URL(e.request.url); url.search = '';
  if (SHELL.has(url.href) || e.request.mode === 'navigate') {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })));
    return;
  }
  // 資料（股價、基金、實價登錄）：?fresh=1 → 網路優先；其他 → 先給手機裡的（秒開），背景更新給下次用
  const key = url.href;
  const net = () => fetch(e.request, { cache: 'no-store' }).then(res => { if (res.ok) { const copy = res.clone(); caches.open(DATA).then(c => c.put(key, copy)); } return res; });
  if (new URL(e.request.url).searchParams.has('fresh')) {
    e.respondWith(net().catch(() => caches.match(key).then(r => r || Response.error())));
    return;
  }
  e.respondWith(caches.match(key).then(hit => {
    const upd = net().catch(() => hit);
    if (hit) { e.waitUntil(upd.then(() => {}, () => {})); return hit; }
    return upd.then(r => r || Response.error());
  }));
});
