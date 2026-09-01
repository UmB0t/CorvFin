/**
 * OmniFin V3 - Service Worker (PWA Shell Caching & Security Isolation)
 */

const CACHE_VERSION = 'omnifin-static-v3.5';
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
  './js/router.js',
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
  './icons/icon.svg',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/apple-touch-icon.png',
  './icons/apple-touch-icon-180x180.png',
  './icons/apple-touch-icon-152x152.png',
  './icons/apple-touch-icon-120x120.png'
];

// Install: Cache Shell & Static Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Warning: Some assets failed to precache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Remove Old Caches
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

  // 3. Navigation Requests (HTML / Page Shell)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match('./index.html').then((cached) => {
          return cached || caches.match('/index.html');
        });
      })
    );
    return;
  }

  // 4. Static Assets: Stale-While-Revalidate / Cache-First
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => {
              cache.put(req, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
