/* ==========================================================================
   MÓDULO DE AUTENTICAÇÃO E SINCRONIZAÇÃO (authSync.js)
   OmniFin - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  function handleLogout() {
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
  }

  let isRevalidating = false;

  async function revalidateStateFromServer() {
    if (isRevalidating) return false;
    isRevalidating = true;

    const token = (window.API && typeof API.getToken === 'function')
      ? API.getToken()
      : (typeof localStorage !== 'undefined' ? (localStorage.getItem('auth_token') || localStorage.getItem('token') || localStorage.getItem('financas_pro_jwt_token')) : null);

    if (!token) {
      isRevalidating = false;
      return false;
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
          handleLogout();
          return false;
        }
        json = await res.json();
      }

      // O endpoint /api/finances retorna diretamente o documento de finanças ou um objeto { success: true, data }
      const serverData = (json && json.data) ? json.data : json;

      if (serverData && (serverData.fixed !== undefined || serverData.version !== undefined || serverData.profile !== undefined || serverData.success === true)) {
        const nextState = migrateState(serverData);
        const state = getState();
        Object.keys(state).forEach(k => delete state[k]);
        Object.assign(state, nextState);

        if (typeof window.setStateHydrated === 'function') {
          window.setStateHydrated(true);
        }

        try {
          if (typeof render === 'function') {
            render();
          }
        } catch (renderErr) {
          console.error('Erro ao renderizar interface após hidratação:', renderErr);
        }

        try {
          if (typeof window.checkWelcomeTour === 'function') {
            window.checkWelcomeTour();
          }
        } catch (tourErr) {
          console.error('Erro ao checar onboarding pós-hidratação:', tourErr);
        }

        setTimeout(() => {
          try {
            if (typeof window.checkWelcomeTour === 'function') {
              window.checkWelcomeTour();
            }
          } catch (_) {}
        }, 50);

        return true;
      }
    } catch (err) {
      console.warn('Erro ao sincronizar com API:', err);
    } finally {
      isRevalidating = false;
    }
    return false;
  }

  async function initAuthAndSync() {
    // Bind Desktop & Mobile Logout Buttons
    const logoutBtns = [
      document.getElementById('btnLogout'),
      document.getElementById('drawerLogoutBtn'),
      document.getElementById('authBtn')
    ];

    logoutBtns.forEach(btn => {
      if (btn && !btn.dataset.logoutBound) {
        btn.dataset.logoutBound = 'true';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          handleLogout();
        });
      }
    });

    const syncSuccess = await revalidateStateFromServer();
    if (syncSuccess) {
      if (typeof checkOnboarding === 'function') {
        checkOnboarding();
      }
    }
  }

  // BFCache & Visibility Revalidation (Mobile & Multi-tab sync)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && typeof revalidateStateFromServer === 'function') {
      revalidateStateFromServer();
    }
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted && typeof revalidateStateFromServer === 'function') {
      revalidateStateFromServer();
    }
  });

  // APIs públicas do Módulo de Autenticação e Sincronização
  window.handleLogout = handleLogout;
  window.initAuthAndSync = initAuthAndSync;
  window.revalidateStateFromServer = revalidateStateFromServer;

})();
