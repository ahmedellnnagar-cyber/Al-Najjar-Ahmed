// Service Worker: الموقع يفتح حتى بدون إنترنت (الصفحة + مكتبات CDN بتتخزن في الكاش).
// الصفحة نفسها network-first (دايماً أحدث نسخة)، ومكتبات CDN cache-first (نسخها ثابتة).
const CACHE = 'nagar-chem-v3';
const ASSETS = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const CDN = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => {}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
const store = (req, res) => {
  if (res && (res.status === 200 || res.type === 'opaque')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)).catch(() => {}); }
  return res;
};
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    if (!CDN.includes(url.hostname)) return;   // Supabase / تلجرام: متتلمسش
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => store(req, res))));
    return;
  }
  // network-first بمهلة 3 ثواني: لو النت بطيء أو "واصل ومش شغال" يفتح من الكاش فوراً بدل ما يعلّق
  e.respondWith(new Promise(resolve => {
    let done = false;
    const fromCache = () => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'));
    const t = setTimeout(() => { fromCache().then(r => { if (r && !done) { done = true; resolve(r); } }); }, 3000);
    fetch(req).then(res => { clearTimeout(t); store(req, res); if (!done) { done = true; resolve(res); } })
      .catch(() => { clearTimeout(t); if (!done) { done = true; fromCache().then(resolve); } });
  }));
});
