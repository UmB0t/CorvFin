/**
 * OmniFin V3 - Login PWA Service Worker Registration & iOS Standalone Navigation
 */
(function () {
  "use strict";

  // PWA Service Worker Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/sw.js') : 'sw.js';
      const swScope = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/') : './';
      navigator.serviceWorker.register(swUrl, { scope: swScope }).catch(err => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
    });
  }

  // iOS Standalone Link Interception
  if (('standalone' in window.navigator) && window.navigator.standalone) {
    document.addEventListener('click', (event) => {
      const a = event.target.closest('a');
      if (a && a.href && a.hostname === window.location.hostname && !a.target && !a.hasAttribute('download')) {
        event.preventDefault();
        window.location.href = a.href;
      }
    });
  }
})();
