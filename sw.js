// Service Worker: الموقع يفتح حتى بدون إنترنت.
// - الصفحة: network-first بمهلة 4 ثواني (لو النت بطيء/واقف يفتح من الكاش فوراً).
// - مكتبات CDN: بتتخزن وقت التثبيت (قبل أول فصل للنت) وبعدين cache-first.
const CACHE = 'nagar-chem-v3';
const ASSETS = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const CDN_URLS = [
  'https://cdn.tailwindcss.com/3.4.1',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.js',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap'
];
const CDN = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const NET_TIMEOUT = 4000;

// تخزين ملف واحد وتأكيد إنه 200 (الفاشل مش بيتخزن)
const add = async (c, url) => { try { const r = await fetch(url); if (r.ok) { await c.put(url, r.clone()); return r; } } catch (e) {} return null; };

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(a => add(c, a)));
    await Promise.all(CDN_URLS.map(async u => {
      const r = await add(c, u);
      // ملفات الخط الفعلية بتتحمل من gstatic: نخزنها كمان عشان الخط يشتغل أوفلاين
      if (r && u.includes('fonts.googleapis.com')) {
        try { const css = await r.text(); await Promise.all([...new Set(css.match(/https:\/\/fonts\.gstatic\.com[^)'" ]+/g) || [])].map(f => add(c, f))); } catch (e) {}
      }
    }));
    await self.skipWaiting();
  })());
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
// fetch بمهلة: لو النت واقف لكن الجهاز فاكر إنه متصل (lie-fi) ما نستناش دقايق
const netFirst = (req, ms) => new Promise((ok, no) => {
  const t = setTimeout(() => no(new Error('timeout')), ms);
  fetch(req).then(res => { clearTimeout(t); ok(store(req, res)); }, err => { clearTimeout(t); no(err); });
});
const fromCache = req => caches.match(req, { ignoreSearch: true });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== location.origin) {
    if (!CDN.includes(url.hostname)) return;          // Supabase / تلجرام: متتلمسش
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => store(req, res))));
    return;
  }

  const isNav = req.mode === 'navigate';
  e.respondWith(
    netFirst(req, isNav ? NET_TIMEOUT : 8000)
      .then(res => res.ok ? res : fromCache(req).then(r => r || res))          // سيرفر رجّع خطأ: نفضّل الكاش لو موجود
      .catch(() => fromCache(req).then(r => r || (isNav ? caches.match('index.html') : Response.error())))
  );
});
