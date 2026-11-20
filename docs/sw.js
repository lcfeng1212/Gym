// GymMonitor 離線快取：載入過（或按「下載離線資料」）之後，健身房沒網路也能開啟與辨識。
'use strict';
const SHELL_CACHE = 'gm-shell-v8.2.1';
const MODEL_CACHE = 'gm-models-1';   // 姿態辨識程式與模型（網址含版本，不會變）
const PHOTO_CACHE = 'gm-photos-1';   // 動作照片
const PHOTO_LIMIT = 300;
const SHELL = ['./', 'index.html', 'style.css?v=82', 'library.js?v=82', 'lib.js?v=82', 'research.js?v=82',
  'observations.js?v=82', 'camera.js?v=82', 'session.js?v=82', 'overlay.js?v=82', 'capture.js?v=82', 'app.js?v=821',
  'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'fedb-steps.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  const keep = new Set([SHELL_CACHE, MODEL_CACHE, PHOTO_CACHE]);
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('gm-shell-v')&&!keep.has(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isModel = url => (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/@mediapipe/tasks-vision@'))
  || (url.hostname === 'storage.googleapis.com' && url.pathname.startsWith('/mediapipe-models/'));
const isPhoto = url => url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith('/yuhonas/free-exercise-db/');

async function cacheFirst(request, name, limit) {
  const cache = await caches.open(name);
  const hit = await cache.match(request, {ignoreVary: true});
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    await cache.put(request, response.clone());
    if (limit) {
      const keys = await cache.keys();
      for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key);
    }
  }
  return response;
}
// 本站檔案：有網路就拿最新版（4 秒內），沒網路或太慢用快取
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await Promise.race([fetch(request), new Promise((_, reject) => setTimeout(() => reject(Error('timeout')), 4000))]);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request, {ignoreSearch: request.mode === 'navigate'}) ||
      (request.mode === 'navigate' ? await cache.match('index.html') : null);
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isModel(url)) event.respondWith(cacheFirst(request, MODEL_CACHE));
  else if (isPhoto(url)) event.respondWith(cacheFirst(request, PHOTO_CACHE, PHOTO_LIMIT));
  else if (url.origin === self.location.origin) event.respondWith(networkFirst(request));
});
