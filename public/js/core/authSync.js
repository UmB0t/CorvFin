/* ==========================================================================
   MÓDULO DE AUTENTICAÇÃO E SINCRONIZAÇÃO (authSync.js)
   OmniFin - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  async function revalidateStateFromServer() {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || localStorage.getItem('financas_pro_jwt_token');
    if (!token) return false;

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
          return false;
        }
        json = await res.json();
      }

      if (json && json.success && json.data) {
        const nextState = migrateState(json.data);
        const state = getState();
        Object.keys(state).forEach(k => delete state[k]);
        Object.assign(state, nextState);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        if (typeof window.setStateHydrated === 'function') {
          window.setStateHydrated(true);
        }
        if (typeof render === 'function') {
          render();
        }
        return true;
      }
    } catch (err) {
      console.warn('Erro ao sincronizar com API:', err);
    }
    return false;
  }

  async function initAuthAndSync() {
    const authBtn = $('#authBtn');
    if (authBtn) {
      authBtn.addEventListener('click', () => {
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

    const syncSuccess = await revalidateStateFromServer();
    if (syncSuccess) {
      if (typeof checkOnboarding === 'function') {
        checkOnboarding();
      }
    }
  }

  // BFCache & Visibility Revalidation
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && typeof revalidateStateFromServer === 'function') {
      revalidateStateFromServer();
    }
  });

  // API pública do Módulo de Autenticação e Sincronização
  window.initAuthAndSync = initAuthAndSync;
  window.revalidateStateFromServer = revalidateStateFromServer;

})();
