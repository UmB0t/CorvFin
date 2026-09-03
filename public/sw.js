/**
 * OmniFin V3 - Service Worker (PWA Shell Caching & Security Isolation)
 */

const CACHE_VERSION = 'omnifin-static-v3.8.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './login.html',
  './manifest.webmanifest',
  './manifest.json',
  './config.js',
  './css/variables.css',
  './css/themes.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/dashboard.css',
  './css/dialogs.css',
  './css/responsive.css',
  './css/mobile.css',
  './css/auth.css',
  './js/api.js',
  './js/admin.js',
  './js/auth.js',
  './js/loginInit.js',
  './js/router.js',
  './js/core/splash.js',
  './js/core/constants.js',
  './js/core/utils.js',
  './js/core/state.js',
  './js/core/storage.js',
  './js/core/dom.js',
  './js/core/financeQueries.js',
  './js/core/uiShell.js',
  './js/core/dragDrop.js',
  './js/core/authSync.js',
  './js/core/releaseNotes.js',
  './js/core/app.js',
  './js/modules/benefits.js',
  './js/modules/shopping.js',
  './js/modules/extras.js',
  './js/modules/debtors.js',
  './js/modules/investments.js',
  './js/modules/simulation.js',
  './js/modules/reports.js',
  './js/modules/csvImport.js',
  './js/modules/profile.js',
  './js/modules/dashboard.js',
  './js/modules/expenseInstallments.js',
  './js/modules/consolidatedDashboard.js',
  './js/modules/expenses.js',
  './js/modules/welcomeTour.js',
  './js/modules/aiAssistant.js',
  './js/modules/backup.js',
  './js/modules/notifications.js',
  './icons/favicon.svg',
  './icons/favicon-32x32.png',
  './icons/favicon-16x16.png',
  './icons/icon.svg',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/apple-touch-icon.png',
  './icons/apple-touch-icon-180x180.png',
  './icons/apple-touch-icon-152x152.png',
  './icons/apple-touch-icon-120x120.png'
];

// Install: Cache Shell & Static Assets com resiliência a falhas individuais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const results = await Promise.allSettled(
        STATIC_ASSETS.map((asset) =>
          fetch(asset, { cache: 'no-cache' }).then((res) => {
            if (res.ok) {
              return cache.put(asset, res);
            }
            throw new Error(`Failed to fetch ${asset} (status: ${res.status})`);
          })
        )
      );
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        console.warn(`[SW] Precache concluído com ${failed.length} alertas não-bloqueantes.`);
      }
    }).then(() => self.skipWaiting())
  );
});

// Activate: Remove Old Caches imediatamente ao atualizar versão
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy Isolation
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Non-GET requests: Network Only
  if (req.method !== 'GET') {
    return;
  }

  // 1.1 Ignora requisições de extensões do navegador (chrome-extension://, moz-extension://) ou esquemas locais
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 1.2 Recursos de origens externas (Google Fonts, CDNs): Não intercepta pelo Cache Storage
  if (url.origin !== self.location.origin) {
    return;
  }

  // 2. CRITICAL SECURITY: Financial APIs & AI Assistant are strictly NETWORK-ONLY
  // Never cache sensitive user documents, tokens, or live financial databases
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(
          JSON.stringify({
            success: false,
            offline: true,
            message: 'Você está offline. Conecte-se à internet para atualizar dados financeiros.'
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
    return;
  }

  // 3. Navigation Requests (HTML / Page Shell): Network-First com fallback para o index.html offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cachedIndex = await caches.match('./index.html')
          || await caches.match('/index.html')
          || await caches.match('index.html')
          || await caches.match('./')
          || await caches.match('/');
        if (cachedIndex) {
          return cachedIndex;
        }
        return new Response(
          '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>OmniFin Offline</title><style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;}</style></head><body><div><h2>OmniFin — Conexão Offline</h2><p>Você está sem conexão com a internet e a versão em cache ainda não está disponível.</p><a href="." style="display:inline-block;padding:10px 18px;border-radius:8px;text-decoration:none;background:#2563eb;color:#fff;font-weight:700;margin-top:12px;">Tentar Novamente</a></div></body></html>',
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          }
        );
      })
    );
    return;
  }

  // 4. Static Assets (CSS, JS, Shell Assets): Network-First com Fallback em Cache
  // Previne entrega de versão stale após nova release e atualiza o Cache Storage automaticamente
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(req, responseToCache);
          }).catch(() => {});
        }
        return networkResponse;
      })
      .catch(async () => {
        // Fallback offline: se estiver sem conexão, serve do Cache Storage
        const cached = await caches.match(req);
        if (cached) {
          return cached;
        }
        return new Response('', {
          status: 504,
          statusText: 'Gateway Timeout / Asset Offline Unavailable'
        });
      })
  );
});
