/* ==========================================================================
   MÓDULO DE AUTENTICAÇÃO & SINCRONIZAÇÃO (authSync.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  async function initAuthAndSync() {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || localStorage.getItem('financas_pro_jwt_token');
    if (!token) {
      window.location.href = '/login';
      return;
    }

    const logoutBtn = $('#btnLogout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('token');
        localStorage.removeItem('financas_pro_jwt_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('user');
        localStorage.removeItem('financas_pro_user_info');
        window.location.href = '/login';
      });
    }

    try {
      const res = await fetch('/api/finances', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        }
      });
      if (res.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('token');
        localStorage.removeItem('financas_pro_jwt_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('user');
        localStorage.removeItem('financas_pro_user_info');
        window.location.href = '/login';
        return;
      }
      const json = await res.json();
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
