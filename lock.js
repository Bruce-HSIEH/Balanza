'use strict';
// Face ID 加密鎖
// 資料用隨機 AES-256-GCM 金鑰（data key）加密；data key 再分別被兩把金鑰包起來：
//   1. Face ID：WebAuthn 通行密鑰的 PRF 擴充產生的祕密 → HKDF → AES 金鑰（真正需要 Face ID 才拿得到）
//      若裝置不支援 PRF，改用存在 IndexedDB、不可匯出的裝置金鑰，Face ID 只當門禁
//   2. PIN：PBKDF2-SHA256（31 萬次）→ AES 金鑰，作為備援
// localStorage 只會有加密後的資料；解鎖後明文只在記憶體

const Vault = (() => {
  const KEY = 'balanza.vault';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  const ITER = 310000;

  let dataKeyRaw = null;   // 解鎖後才有

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const write = v => localStorage.setItem(KEY, JSON.stringify(v));
  const enabled = () => !!read();
  const unlocked = () => !!dataKeyRaw;

  async function aesKey(raw) { return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
  async function seal(key, bytes) { const iv = rand(12); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes); return { iv: b64(iv), ct: b64(ct) }; }
  async function open(key, box) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct))); }

  async function pinKey(pin, salt, iter = ITER) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function prfKey(secret) {
    const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('balanza-vault'), info: enc.encode('data-key-wrap') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  // ---- 裝置金鑰（不支援 PRF 時） ----
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('balanza-keys', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('k');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function idbOp(mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => { const t = db.transaction('k', mode); const req = fn(t.objectStore('k')); t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); });
  }
  async function deviceKey(create) {
    let k = await idbOp('readonly', s => s.get('device'));
    if (!k && create) { k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); await idbOp('readwrite', s => s.put(k, 'device')); }
    return k;
  }

  // ---- WebAuthn ----
  const supported = () => !!(window.PublicKeyCredential && navigator.credentials && crypto.subtle);
  async function platformAvailable() {
    try { return supported() && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch (e) { return false; }
  }
  async function createCredential(prfSalt) {
    const cred = await navigator.credentials.create({ publicKey: {
      rp: { name: 'Balanza', id: location.hostname },
      user: { id: rand(16), name: 'Balanza', displayName: 'Balanza 資產鎖' },
      challenge: rand(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
      timeout: 60000,
      extensions: { prf: { eval: { first: prfSalt } } },
    } });
    const ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
    return { id: new Uint8Array(cred.rawId), prfEnabled: !!(ext.prf && ext.prf.enabled), prfFirst: ext.prf && ext.prf.results && ext.prf.results.first };
  }
  async function assert(credId, prfSalt) {
    const a = await navigator.credentials.get({ publicKey: {
      challenge: rand(32), rpId: location.hostname, userVerification: 'required', timeout: 60000,
      allowCredentials: [{ type: 'public-key', id: credId, transports: ['internal', 'hybrid'] }],
      extensions: prfSalt ? { prf: { eval: { first: prfSalt } } } : undefined,
    } });
    const ext = a.getClientExtensionResults ? a.getClientExtensionResults() : {};
    return { prf: ext.prf && ext.prf.results && ext.prf.results.first ? new Uint8Array(ext.prf.results.first) : null };
  }

  // ---- 對外 ----
  // 啟用：設定 PIN、建立 Face ID 通行密鑰、加密目前資料
  async function enable(pin, plaintext, { useFaceID = true } = {}) {
    const raw = rand(32);
    const v = { ver: 1, created: new Date().toISOString(), wrap: {} };
    const salt = rand(16);
    v.wrap.pin = { salt: b64(salt), iter: ITER, ...(await seal(await pinKey(pin, salt), raw)) };
    if (useFaceID && await platformAvailable()) {
      const prfSalt = rand(32);
      const c = await createCredential(prfSalt);
      v.cred = b64(c.id);
      let secret = c.prfFirst ? new Uint8Array(c.prfFirst) : null;
      if (!secret && c.prfEnabled !== false) {
        try { secret = (await assert(c.id, prfSalt)).prf; } catch (e) { secret = null; }   // Safari 要在 get() 才給 PRF 結果
      }
      if (secret) { v.mode = 'prf'; v.prfSalt = b64(prfSalt); v.wrap.prf = await seal(await prfKey(secret), raw); }
      else { v.mode = 'device'; v.wrap.dev = await seal(await deviceKey(true), raw); }
    } else v.mode = 'pin';
    v.data = await seal(await aesKey(raw), enc.encode(plaintext));
    write(v);
    dataKeyRaw = raw;
    return v.mode;
  }

  async function unlockFaceID() {
    const v = read();
    if (!v || !v.cred) throw new Error('沒有設定 Face ID');
    const r = await assert(unb64(v.cred), v.mode === 'prf' ? unb64(v.prfSalt) : null);
    let raw;
    if (v.mode === 'prf') {
      if (!r.prf) throw new Error('這台裝置沒有回傳 Face ID 金鑰，請改用 PIN');
      raw = await open(await prfKey(r.prf), v.wrap.prf);
    } else {
      const dk = await deviceKey(false);
      if (!dk) throw new Error('找不到裝置金鑰，請改用 PIN');
      raw = await open(dk, v.wrap.dev);
    }
    dataKeyRaw = raw;
    return dec.decode(await open(await aesKey(raw), v.data));
  }

  async function unlockPIN(pin) {
    const v = read();
    let raw;
    try { raw = await open(await pinKey(pin, unb64(v.wrap.pin.salt), v.wrap.pin.iter), v.wrap.pin); } catch (e) { throw new Error('PIN 不正確'); }
    dataKeyRaw = raw;
    return dec.decode(await open(await aesKey(raw), v.data));
  }

  let chain = Promise.resolve();
  function store(plaintext) {
    chain = chain.then(async () => {
      if (!dataKeyRaw) return;
      const v = read(); if (!v) return;
      v.data = await seal(await aesKey(dataKeyRaw), enc.encode(plaintext));
      v.saved = new Date().toISOString();
      write(v);
    });
    return chain;
  }

  async function changePIN(pin) {
    const v = read(); if (!v || !dataKeyRaw) return;
    const salt = rand(16);
    v.wrap.pin = { salt: b64(salt), iter: ITER, ...(await seal(await pinKey(pin, salt), dataKeyRaw)) };
    write(v);
  }

  function disable() { localStorage.removeItem(KEY); dataKeyRaw = null; }
  function lock() { dataKeyRaw = null; }
  const info = () => { const v = read(); return v ? { mode: v.mode, created: v.created, faceID: !!v.cred } : null; };

  return { enabled, unlocked, enable, unlockFaceID, unlockPIN, store, changePIN, disable, lock, info, platformAvailable, supported };
})();
