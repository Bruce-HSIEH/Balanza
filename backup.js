'use strict';
// 加密備份：恢復金鑰（隨機 125 bits）→ PBKDF2-SHA256 60 萬次 → AES-256-GCM
// 自動備份到使用者自己的 GitHub 秘密 Gist（只存密文；Gist 會保留每次修改的歷史版本）

const Backup = (() => {
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 32 字，去掉容易看錯的 I O 0 1
  const ITER = 600000;
  const FMT = 'balanza-enc-1';
  const GIST_DESC = 'Balanza 加密備份（沒有恢復金鑰無法讀取）';
  const GIST_FILE = 'balanza-backup.enc.json';
  const API = 'https://api.github.com';

  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  // ---- 恢復金鑰 ----
  function newKey() {
    const r = crypto.getRandomValues(new Uint8Array(25));
    const s = Array.from(r, x => ALPHA[x & 31]).join('');
    return s.match(/.{5}/g).join('-');
  }
  // 使用者輸入：忽略大小寫、空白、破折號
  function normKey(s) {
    const t = String(s || '').toUpperCase().replace(/[\s\-_]/g, '');
    return t.length === 25 && [...t].every(c => ALPHA.includes(c)) ? t.match(/.{5}/g).join('-') : '';
  }

  const keyCache = new Map();
  async function derive(key, salt, iter = ITER) {
    const id = key + '|' + b64(salt) + '|' + iter;
    if (keyCache.has(id)) return keyCache.get(id);
    const base = await crypto.subtle.importKey('raw', enc.encode(key.replace(/-/g, '')), 'PBKDF2', false, ['deriveKey']);
    const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    keyCache.set(id, k);
    return k;
  }

  async function encrypt(obj, key, saltB64) {
    const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const k = await derive(key, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(FMT) }, k, enc.encode(JSON.stringify(obj)));
    return { app: 'Balanza', fmt: FMT, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct), savedAt: new Date().toISOString() };
  }
  const isEncrypted = d => d && d.fmt === FMT && d.ct;
  async function decrypt(file, key) {
    if (!isEncrypted(file)) throw new Error('不是 Balanza 加密備份檔');
    const k = await derive(key, unb64(file.salt), file.iter || ITER);
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv), additionalData: enc.encode(FMT) }, k, unb64(file.ct));
      return JSON.parse(dec.decode(pt));
    } catch (e) { throw new Error('恢復金鑰不對，無法解開'); }
  }

  // ---- GitHub Gist ----
  async function gh(token, path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    if (res.status === 401) throw new Error('GitHub token 無效或已過期');
    if (res.status === 403 || res.status === 404) {
      const j = await res.json().catch(() => ({}));
      if (/rate limit/i.test(j.message || '')) throw new Error('GitHub 請求太頻繁，稍後再試');
      throw new Error(res.status === 404 ? '找不到備份（可能已被刪除，或 token 沒有 gist 權限）' : 'token 沒有 gist 權限');
    }
    if (!res.ok) throw new Error(`GitHub 錯誤（${res.status}）`);
    return res.status === 204 ? null : res.json();
  }
  async function whoami(token) {
    const u = await gh(token, '/user');
    return u.login;
  }
  async function findGist(token) {
    for (let page = 1; page <= 10; page++) {
      const list = await gh(token, `/gists?per_page=100&page=${page}`);
      const g = list.find(x => x.files && x.files[GIST_FILE]);
      if (g) return g.id;
      if (list.length < 100) break;
    }
    return '';
  }
  async function upload(token, gistId, file) {
    const body = JSON.stringify({ description: GIST_DESC, files: { [GIST_FILE]: { content: JSON.stringify(file) } } });
    if (gistId) {
      try { await gh(token, '/gists/' + gistId, { method: 'PATCH', body }); return gistId; }
      catch (e) { if (!/找不到備份/.test(e.message)) throw e; }   // 被刪掉了就重建
    }
    const g = await gh(token, '/gists', { method: 'POST', body: JSON.stringify({ ...JSON.parse(body), public: false }) });
    return g.id;
  }
  async function readFile(token, g) {
    const f = g.files && g.files[GIST_FILE];
    if (!f) throw new Error('這個版本沒有備份檔');
    if (!f.truncated) return JSON.parse(f.content);
    const res = await fetch(f.raw_url, { cache: 'no-store' });
    return res.json();
  }
  async function download(token, gistId, sha) {
    const g = await gh(token, `/gists/${gistId}${sha ? '/' + sha : ''}`);
    return readFile(token, g);
  }
  // 歷史版本（新到舊）
  async function history(token, gistId) {
    const list = await gh(token, `/gists/${gistId}/commits?per_page=30`);
    return list.map(c => ({ sha: c.version, at: c.committed_at }));
  }

  // ---- 系統永久保存 ----
  async function persist() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return null;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (e) { return null; }
  }

  return { newKey, normKey, encrypt, decrypt, isEncrypted, whoami, findGist, upload, download, history, persist, GIST_FILE };
})();
