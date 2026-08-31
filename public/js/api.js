/**
 * Finanças Pro - API Client & Centralized JWT Handler
 */
(function () {
  'use strict';

  const TOKEN_KEY = 'auth_token';
  const USER_KEY = 'user_data';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('token') || localStorage.getItem('financas_pro_jwt_token');
  }

  function setSession(token, user) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem('token', token);
      localStorage.setItem('financas_pro_jwt_token', token);
    }
    if (user) {
      const userStr = typeof user === 'string' ? user : JSON.stringify(user);
      localStorage.setItem(USER_KEY, userStr);
      localStorage.setItem('user', userStr);
      localStorage.setItem('financas_pro_user_info', userStr);
    }
  }

  function getUser() {
    try {
      const u = localStorage.getItem(USER_KEY) || localStorage.getItem('user') || localStorage.getItem('financas_pro_user_info');
      return u ? JSON.parse(u) : null;
    } catch (_) {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('token');
    localStorage.removeItem('financas_pro_jwt_token');
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('user');
    localStorage.removeItem('financas_pro_user_info');
  }

  function isAuthenticated() {
    const t = getToken();
    return !!(t && t.length > 10);
  }

  function getBasePath() {
    if (typeof window.__BASE_PATH__ === 'string') {
      return window.__BASE_PATH__.trim().replace(/\/+$/, '');
    }
    const meta = document.querySelector('meta[name="base-path"]');
    if (meta && meta.content) {
      return meta.content.trim().replace(/\/+$/, '');
    }
    // Auto-detection: checks if pathname starts with a subpath prefix (e.g. /omnifin)
    const p = (window.location && window.location.pathname) ? window.location.pathname : '';
    const match = p.match(/^(\/[a-zA-Z0-9_\-]+)(\/|$)/);
    if (match) {
      const firstSeg = match[1].toLowerCase();
      const knownRootRoutes = [
        '/dashboard', '/despesas', '/extras', '/devedores', '/investimentos',
        '/beneficios', '/compras', '/simulacao', '/perfil',
        '/admin', '/login', '/api', '/css', '/js', '/views'
      ];
      if (!knownRootRoutes.includes(firstSeg) && firstSeg !== '/index.html') {
        return match[1];
      }
    }
    return '';
  }

  function resolveUrl(path) {
    const base = getBasePath();
    if (!path) return base ? `${base}/` : '/';
    if (!path.startsWith('/')) {
      return path;
    }
    if (base) {
      if (path === base || path.startsWith(base + '/')) {
        return path;
      }
      return `${base}${path}`;
    }
    return path;
  }

  // Base HTTP Request Wrapper with JWT & 401 Interceptor
  async function request(endpoint, options = {}) {
    const token = getToken();
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options.headers || {}
    );

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const resolvedUrl = resolveUrl(endpoint);

    try {
      const response = await fetch(resolvedUrl, Object.assign({}, options, { headers }));

      // 401 Unauthorized Interceptor
      if (response.status === 401) {
        clearSession();
        const currentPath = (window.location && window.location.pathname) ? window.location.pathname : '';
        if (!currentPath.endsWith('login.html') && !currentPath.endsWith('/login')) {
          window.location.href = resolveUrl('/login');
        }
        return { success: false, message: 'Sessão expirada. Faça login novamente.' };
      }

      const data = await response.json().catch(() => null);
      if (!data) {
        return { success: false, status: response.status, message: `Erro na resposta do servidor (HTTP ${response.status}).` };
      }
      if (typeof data === 'object' && !('status' in data)) {
        data.status = response.status;
      }
      return data;
    } catch (err) {
      console.error('API Request Error:', err);
      return { success: false, status: 0, message: 'Erro na comunicação com o servidor.' };
    }
  }

  const API = {
    getBasePath,
    resolveUrl,
    withBasePath: resolveUrl,
    getToken,
    setSession,
    getUser,
    clearSession,
    isAuthenticated,

    // Generic HTTP Methods
    request: (endpoint, options) => request(endpoint, options),
    get: (url) => request(url, { method: 'GET' }),
    post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
    put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (url) => request(url, { method: 'DELETE' }),

    // AI Assistant endpoint
    aiChat: (payload) => request('/api/ai/chat', { method: 'POST', body: JSON.stringify(payload) }),

    // Auth endpoints
    login: (login, senha) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ login, senha }) }),
    register: (payload) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
    getMe: () => request('/api/auth/me', { method: 'GET' }),
    updateProfile: (data) => request('/api/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),

    // Finances endpoints
    getFinances: () => request('/api/finances', { method: 'GET' }),
    saveFinances: (data) => request('/api/finances', { method: 'PUT', body: JSON.stringify(data) }),

    // Admin & Permissions endpoints
    getUsers: () => request('/api/admin/users', { method: 'GET' }),
    createUser: (payload) => request('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
    updateUser: (userId, payload) => request(`/api/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify(payload) }),
    updatePermissions: (userId, perms) => request(`/api/admin/permissions/${userId}`, { method: 'PUT', body: JSON.stringify({ permissions: perms }) }),
    getDefaultPermissions: () => request('/api/admin/default-permissions', { method: 'GET' }),
    saveDefaultPermissions: (permissions) => request('/api/admin/default-permissions', { method: 'POST', body: JSON.stringify({ permissions }) }),
    changeUserRole: (userId, is_admin) => request(`/api/admin/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ is_admin }) }),
    resetUserPassword: (userId, novaSenha) => request(`/api/admin/users/${userId}/password`, { method: 'PUT', body: JSON.stringify({ novaSenha }) }),
    deleteUser: (userId) => request(`/api/admin/users/${userId}`, { method: 'DELETE' }),

    // System & Maintenance endpoints
    getSystemMaintenance: () => request('/api/system/maintenance', { method: 'GET' }),
    getMaintenanceConfig: () => request('/api/admin/maintenance', { method: 'GET' }),
    saveMaintenanceConfig: (maintenance) => request('/api/admin/maintenance', { method: 'PUT', body: JSON.stringify({ maintenance }) })
  };

  // Garante disponibilidade global irrestrita
  window.API = API;
  window.withBasePath = resolveUrl;
})();

// Global Notification & Toast System (Unified OmniFin V3 Architecture)
(function() {
  function getOrCreateToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    } else if (container.parentElement !== document.body) {
      document.body.appendChild(container);
    }
    return container;
  }

  function _escape(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function createToast(msg, type = 'info') {
    const container = getOrCreateToastContainer();
    const toast = document.createElement('div');
    const typeClass = (type === 'error' || type === 'danger') ? 'error' : (type === 'success' ? 'success' : (type === 'warning' ? 'warning' : 'info'));
    toast.className = `toast-item toast-${typeClass}`;

    let iconSvg = '';
    if (typeClass === 'success') {
      iconSvg = '<svg class="svg-icon" viewBox="0 0 24 24" style="width:17px; height:17px; stroke:currentColor; stroke-width:2.5; flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>';
    } else if (typeClass === 'error') {
      iconSvg = '<svg class="svg-icon" viewBox="0 0 24 24" style="width:17px; height:17px; stroke:currentColor; stroke-width:2.5; flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else if (typeClass === 'warning') {
      iconSvg = '<svg class="svg-icon" viewBox="0 0 24 24" style="width:17px; height:17px; stroke:currentColor; stroke-width:2.5; flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    } else {
      iconSvg = '<svg class="svg-icon" viewBox="0 0 24 24" style="width:17px; height:17px; stroke:currentColor; stroke-width:2.5; flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `<span class="toast-icon">${iconSvg}</span><span class="toast-text">${_escape(msg)}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    const removeToast = () => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 280);
    };

    const timer = setTimeout(removeToast, 3500);
    toast.addEventListener('click', () => {
      clearTimeout(timer);
      removeToast();
    });

    return toast;
  }

  window.notify = createToast;
  window.showToast = createToast;
})();

function notify(msg, type = 'info') {
  return window.notify(msg, type);
}
