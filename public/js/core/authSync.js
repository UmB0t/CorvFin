/* ==========================================================================
   MÓDULO DE AUTENTICAÇÃO E SINCRONIZAÇÃO (authSync.js)
   OmniFin - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  // Sincronização entre abas via BroadcastChannel (sem trafegar tokens ou credenciais)
  let authChannel = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      authChannel = new BroadcastChannel('omnifin_auth');
      authChannel.onmessage = (event) => {
        const msg = event && event.data;
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'LOGOUT' || msg.type === 'SESSION_INVALIDATED') {
          if (window.API && typeof API.clearSession === 'function') {
            API.clearSession();
          }
          const currentPath = (window.location && window.location.pathname) ? window.location.pathname : '';
          if (!currentPath.endsWith('login.html') && !currentPath.endsWith('/login')) {
            const loginUrl = (window.API && typeof API.resolveUrl === 'function')
              ? API.resolveUrl('/login')
              : '/login';
            window.location.href = loginUrl;
          }
        } else if (msg.type === 'LOGIN') {
          const currentPath = (window.location && window.location.pathname) ? window.location.pathname : '';
          if (currentPath.endsWith('login.html') || currentPath.endsWith('/login')) {
            const dashUrl = (window.API && typeof API.resolveUrl === 'function')
              ? API.resolveUrl('/dashboard')
              : '/dashboard';
            window.location.href = dashUrl;
          }
        }
      };
    } catch (e) {
      console.warn('[AUTH] BroadcastChannel indisponível:', e);
    }
  }

  function notifyAuthChange(type) {
    if (authChannel && typeof authChannel.postMessage === 'function') {
      try {
        authChannel.postMessage({ type, timestamp: Date.now() });
      } catch (_) {}
    }
  }
  window.notifyAuthChange = notifyAuthChange;

  async function handleLogout() {
    try {
      if (window.API && typeof API.logout === 'function') {
        await API.logout();
      } else if (window.API && typeof API.clearSession === 'function') {
        API.clearSession();
      }
    } finally {
      notifyAuthChange('LOGOUT');
      const loginUrl = (window.API && typeof API.resolveUrl === 'function')
        ? API.resolveUrl('/login')
        : (typeof window.withBasePath === 'function' ? window.withBasePath('/login') : '/login');
      window.location.href = loginUrl;
    }
  }

  const splashStartTime = (typeof window !== 'undefined' && window.__SPLASH_START__) || Date.now();
  const MIN_SPLASH_DURATION_MS = 650; // Tempo mínimo visual curto para evitar flash (600-900ms)
  const MAX_SPLASH_TIMEOUT_MS = 8000; // Timeout de segurança: impede loading infinito

  function dismissHydrationSplash(reason = 'ready') {
    if (typeof document === 'undefined') return;
    const splashEl = document.getElementById('appHydrationSplash');
    if (!splashEl || splashEl.classList.contains('hide')) return;

    if (reason === 'error' || reason === 'timeout') {
      const textEl = document.getElementById('hydrationSplashText');
      if (textEl) {
        textEl.textContent = 'Não foi possível carregar seus dados. Tente novamente.';
      }
    }

    const elapsed = Date.now() - splashStartTime;
    const remaining = Math.max(0, MIN_SPLASH_DURATION_MS - elapsed);

    setTimeout(() => {
      splashEl.classList.add('hide');
      setTimeout(() => {
        splashEl.style.display = 'none';
      }, 240);
    }, remaining);
  }
  window.dismissHydrationSplash = dismissHydrationSplash;

  // Timeout de segurança preventiva para jamais prender a interface
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      dismissHydrationSplash('timeout');
    }, MAX_SPLASH_TIMEOUT_MS);
  }

  let isRevalidating = false;

  async function revalidateStateFromServer() {
    if (isRevalidating) return false;
    isRevalidating = true;

    const user = (window.API && typeof API.getUser === 'function')
      ? API.getUser()
      : (typeof localStorage !== 'undefined' ? (localStorage.getItem('user_data') || localStorage.getItem('user')) : null);

    if (!user) {
      isRevalidating = false;
      dismissHydrationSplash('no-user');
      handleLogout();
      return false;
    }

    try {
      let json;
      if (window.API && typeof API.getFinances === 'function') {
        json = await API.getFinances();
      } else {
        const endpoint = (window.API && typeof API.resolveUrl === 'function')
          ? API.resolveUrl('/api/finances')
          : '/api/finances';

        const res = await fetch(endpoint, {
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        if (res.status === 401) {
          dismissHydrationSplash('401');
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

        // Encerra suavemente a camada de loading de hidratação inicial
        dismissHydrationSplash('ready');
        return true;
      } else {
        dismissHydrationSplash('error');
      }
    } catch (err) {
      console.warn('Erro ao sincronizar com API:', err);
      dismissHydrationSplash('error');
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
