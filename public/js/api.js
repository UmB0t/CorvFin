/**
 * Finanças Pro - API Client & Centralized JWT Handler
 */
const API = (() => {
  const TOKEN_KEY = 'auth_token';
  const USER_KEY = 'user_data';

  function getToken() {
    return localStorage.getItem('auth_token') || localStorage.getItem('token') || localStorage.getItem('financas_pro_jwt_token');
  }

  function setSession(token, user) {
    if (token) {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('token', token);
      localStorage.setItem('financas_pro_jwt_token', token);
    }
    if (user) {
      const userStr = typeof user === 'string' ? user : JSON.stringify(user);
      localStorage.setItem('user_data', userStr);
      localStorage.setItem('user', userStr);
      localStorage.setItem('financas_pro_user_info', userStr);
    }
  }

  function getUser() {
    try {
      const u = localStorage.getItem('user_data') || localStorage.getItem('user') || localStorage.getItem('financas_pro_user_info');
      return u ? JSON.parse(u) : null;
    } catch (_) {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('token');
    localStorage.removeItem('financas_pro_jwt_token');
    localStorage.removeItem('user_data');
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
    const p = window.location.pathname || '';
    const match = p.match(/^(\/[a-zA-Z0-9_\-]+)(\/|$)/);
    if (match) {
      const firstSeg = match[1].toLowerCase();
      const knownRootRoutes = [
        '/despesas', '/extras', '/devedores', '/investimentos',
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
    let res;
    if (!path) {
      res = base ? `${base}/` : '/';
    } else if (!path.startsWith('/')) {
      res = path;
    } else if (base) {
      if (path === base || path.startsWith(base + '/')) {
        res = path;
      } else {
        res = `${base}${path}`;
      }
    } else {
      res = path;
    }

    if (path === '/despesas' || path === '/api/finances') {
      console.log('[API.resolveUrl]', { input: path, base, result: res, pathname: window.location.pathname });
      if (res === '/despesas') {
        console.trace('[NAV DEBUG resolveUrl returned /despesas without base]');
      }
    }
    return res;
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
        const currentPath = window.location.pathname;
        if (!currentPath.endsWith('login.html') && !currentPath.endsWith('/login')) {
          window.location.href = resolveUrl('/login');
        }
        return { success: false, message: 'Sessão expirada. Faça login novamente.' };
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('API Request Error:', err);
      return { success: false, message: 'Erro na comunicação com o servidor.' };
    }
  }

  return {
    getBasePath,
    resolveUrl,
    withBasePath: resolveUrl,
    getToken,
    setSession,
    getUser,
    clearSession,
    isAuthenticated,

    // Generic HTTP Methods
    get: (url) => request(url, { method: 'GET' }),
    post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
    put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (url) => request(url, { method: 'DELETE' }),

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
})();

// Global withBasePath helper
window.withBasePath = function (path) {
  return typeof API !== 'undefined' && API.resolveUrl ? API.resolveUrl(path) : path;
};

// Global Notification Helper
function notify(msg, type = 'info') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.className = `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
  toast.style.display = 'block';

  clearTimeout(notify._timer);
  notify._timer = setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}

// Global Toast Notifications
window.showToast = function(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-message toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};
