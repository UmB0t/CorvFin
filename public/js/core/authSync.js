/* ==========================================================================
   MÓDULO DE AUTENTICAÇÃO & SINCRONIZAÇÃO (authSync.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  async function initAuthAndSync() {
    const token = (window.API && typeof API.getToken === 'function')
      ? API.getToken()
      : (localStorage.getItem('auth_token') || localStorage.getItem('token') || localStorage.getItem('financas_pro_jwt_token'));

    if (!token) {
      const loginUrl = (window.API && typeof API.resolveUrl === 'function')
        ? API.resolveUrl('/login')
        : (typeof window.withBasePath === 'function' ? window.withBasePath('/login') : '/login');
      window.location.href = loginUrl;
      return;
    }

    const logoutBtn = $('#btnLogout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        if (window.API && typeof API.clearSession === 'function') {
          API.clearSession();
        } else {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('token');
          localStorage.removeItem('financas_pro_jwt_token');
          localStorage.removeItem('user_data');
          localStorage.removeItem('user');
          localStorage.removeItem('financas_pro_user_info');
        }
        const loginUrl = (window.API && typeof API.resolveUrl === 'function')
          ? API.resolveUrl('/login')
          : (typeof window.withBasePath === 'function' ? window.withBasePath('/login') : '/login');
        window.location.href = loginUrl;
      });
    }

    try {
      let json;
      if (window.API && typeof API.getFinances === 'function') {
        json = await API.getFinances();
      } else {
        const endpoint = (window.API && typeof API.resolveUrl === 'function')
          ? API.resolveUrl('/api/finances')
          : (typeof window.withBasePath === 'function' ? window.withBasePath('/api/finances') : '/api/finances');

        const res = await fetch(endpoint, {
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          }
        });
        if (res.status === 401) {
          if (window.API && typeof API.clearSession === 'function') {
            API.clearSession();
          }
          const loginUrl = (window.API && typeof API.resolveUrl === 'function')
            ? API.resolveUrl('/login')
            : (typeof window.withBasePath === 'function' ? window.withBasePath('/login') : '/login');
          window.location.href = loginUrl;
          return;
        }
        json = await res.json();
      }

      if (json && json.success && json.data) {
        const nextState = migrateState(json.data);
        const state = getState();
        Object.keys(state).forEach(k => delete state[k]);
        Object.assign(state, nextState);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        render();
        checkOnboarding();
      }
    } catch (err) {
      console.warn('Sincronização com API:', err);
    }
  }

  // API pública do Módulo de Autenticação e Sincronização
  window.initAuthAndSync = initAuthAndSync;

})();
