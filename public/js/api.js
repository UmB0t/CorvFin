/**
 * Finanças Pro - API Client & Centralized JWT Handler
 */
(function () {
  'use strict';

  const TOKEN_KEY = 'auth_token';
  const USER_KEY = 'user_data';

  // Limpeza imediata e proativa de chaves legadas de JWT no localStorage
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('token');
    localStorage.removeItem('financas_pro_jwt_token');
  } catch (_) {}

  function getToken() {
    // JWT agora reside exclusivamente em cookie HttpOnly gerenciado pelo navegador
    return null;
  }

  function setSession(arg1, arg2) {
    // Suporta assinatura unificada setSession(user) ou legado transitório setSession(token, user)
    const user = (arg2 !== undefined) ? arg2 : arg1;

    // Garante que nenhum token JWT permaneça gravado no navegador
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('token');
      localStorage.removeItem('financas_pro_jwt_token');
    } catch (_) {}

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
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('token');
      localStorage.removeItem('financas_pro_jwt_token');
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem('user');
      localStorage.removeItem('financas_pro_user_info');
    } catch (_) {}
  }

  function isAuthenticated() {
    return !!getUser();
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

  // Base HTTP Request Wrapper com credentials: same-origin, header anti-CSRF e interceptor 401
  async function request(endpoint, options = {}) {
    const headers = Object.assign(
      {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      options.headers || {}
    );

    const resolvedUrl = resolveUrl(endpoint);
    const fetchOptions = Object.assign(
      { credentials: 'same-origin' },
      options,
      { headers }
    );

    try {
      const response = await fetch(resolvedUrl, fetchOptions);

      // 401 Unauthorized Interceptor
      if (response.status === 401) {
        // Se for a rota de login (/api/auth/login), 401 representa credenciais inválidas, NÃO sessão expirada
        const isLoginEndpoint = typeof endpoint === 'string' && endpoint.includes('/api/auth/login');
        if (isLoginEndpoint) {
          const errData = await response.json().catch(() => null);
          return {
            success: false,
            status: 401,
            error: (errData && errData.error) || 'INVALID_CREDENTIALS',
            message: (errData && errData.message) || 'Login ou senha inválidos. Verifique os dados e tente novamente.'
          };
        }

        // Para outras rotas autenticadas: sessão inexistente ou token/sessão expirada
        clearSession();
        if (typeof window.notifyAuthChange === 'function') {
          window.notifyAuthChange('SESSION_INVALIDATED');
        }
        const currentPath = (window.location && window.location.pathname) ? window.location.pathname : '';
        if (!currentPath.endsWith('login.html') && !currentPath.endsWith('/login')) {
          window.location.href = resolveUrl('/login');
        }
        return { success: false, status: 401, error: 'SESSION_EXPIRED', message: 'Sessão expirada. Faça login novamente.' };
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

    // AI Assistant & Controlled Actions endpoints
    aiChat: (payload) => request('/api/ai/chat', { method: 'POST', body: JSON.stringify(payload) }),
    aiInterpretAction: (payload) => request('/api/ai/actions/interpret', { method: 'POST', body: JSON.stringify(payload) }),
    aiConfirmExpense: (payload) => request('/api/ai/actions/expense/confirm', { method: 'POST', body: JSON.stringify(payload) }),
    aiCancelExpense: (payload) => request('/api/ai/actions/expense/cancel', { method: 'POST', body: JSON.stringify(payload) }),
    aiConfirmBenefit: (payload) => request('/api/ai/actions/benefit/confirm', { method: 'POST', body: JSON.stringify(payload) }),
    aiCancelBenefit: (payload) => request('/api/ai/actions/benefit/cancel', { method: 'POST', body: JSON.stringify(payload) }),

    // Auth endpoints
    login: (login, senha) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ login, senha }) }),
    register: (payload) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
    verifyEmail: (token) => request('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
    resendVerification: (email) => request('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
    forgotPassword: (email) => request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
    resetPassword: (token, newPassword) => request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
    changePassword: (senhaAtual, novaSenha) => request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ senhaAtual, novaSenha }) }),
    logout: async () => {
      try {
        await request('/api/auth/logout', { method: 'POST' }).catch(() => null);
      } finally {
        clearSession();
        if (typeof window.notifyAuthChange === 'function') {
          window.notifyAuthChange('LOGOUT');
        }
      }
    },
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
    saveMaintenanceConfig: (maintenance) => request('/api/admin/maintenance', { method: 'PUT', body: JSON.stringify({ maintenance }) }),

    // Email & SMTP endpoints (Security 6A)
    getEmailSettings: () => request('/api/admin/email-settings', { method: 'GET' }),
    saveEmailSettings: (settings) => request('/api/admin/email-settings', { method: 'PUT', body: JSON.stringify(settings) }),
    testEmailSettings: (payload) => request('/api/admin/email-settings/test', { method: 'POST', body: JSON.stringify(payload || {}) }),

    // Commercial Plans & Entitlements endpoints (Lote 5D/5E)
    getPlansRegistry: () => request('/api/admin/plans/registry', { method: 'GET' }),
    getPlans: (filters = {}) => {
      const query = new URLSearchParams();
      if (filters.status) query.set('status', filters.status);
      if (filters.isDefault !== undefined && filters.isDefault !== null) query.set('isDefault', String(filters.isDefault));
      const qs = query.toString();
      return request(`/api/admin/plans${qs ? '?' + qs : ''}`, { method: 'GET' });
    },
    getPlanById: (planId) => request(`/api/admin/plans/${encodeURIComponent(planId)}`, { method: 'GET' }),
    createPlan: (payload) => request('/api/admin/plans', { method: 'POST', body: JSON.stringify(payload) }),
    updatePlan: (planId, payload) => request(`/api/admin/plans/${encodeURIComponent(planId)}`, { method: 'PUT', body: JSON.stringify(payload) }),
    setPlanStatus: (planId, status) => request(`/api/admin/plans/${encodeURIComponent(planId)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    setDefaultPlan: (planId) => request(`/api/admin/plans/${encodeURIComponent(planId)}/set-default`, { method: 'POST' }),
    assignUserPlan: (userId, planId) => request(`/api/admin/users/${encodeURIComponent(userId)}/plan`, { method: 'PATCH', body: JSON.stringify({ planId }) }),
    getUserPlan: (userId) => request(`/api/admin/users/${encodeURIComponent(userId)}/plan`, { method: 'GET' })
  };

  // Helper centralizado de avaliação de política de senha para UX (Security 6B)
  const PasswordPolicy = {
    minLength: 8,
    maxLength: 128,
    checkCriteria: function(password, confirmPassword) {
      const pwd = typeof password === 'string' ? password : '';
      const conf = typeof confirmPassword === 'string' ? confirmPassword : '';
      const hasLen = pwd.length >= 8 && pwd.length <= 128;
      const hasUpper = /[A-Z]/.test(pwd);
      const hasLower = /[a-z]/.test(pwd);
      const hasNum = /[0-9]/.test(pwd);
      const hasSpec = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);
      const isValid = hasLen && hasUpper && hasLower && hasNum && hasSpec;
      const hasMatch = Boolean(pwd && conf && pwd === conf);
      const score = [hasLen, hasUpper, hasLower, hasNum, hasSpec].filter(Boolean).length;
      return {
        hasLen,
        hasUpper,
        hasLower,
        hasNum,
        hasSpec,
        isValid,
        hasMatch,
        score
      };
    },
    updateChecklist: function(elements, criteria) {
      if (!elements) return;
      const updateItem = (el, valid) => {
        if (!el) return;
        const icon = el.querySelector('.crit-icon');
        if (valid) {
          el.classList.add('valid');
          el.classList.remove('invalid');
          if (icon) icon.textContent = '✓';
        } else {
          el.classList.remove('valid');
          el.classList.add('invalid');
          if (icon) icon.textContent = '✕';
        }
      };
      if (elements.len) updateItem(elements.len, criteria.hasLen);
      if (elements.upper) updateItem(elements.upper, criteria.hasUpper);
      if (elements.lower) updateItem(elements.lower, criteria.hasLower);
      if (elements.num) updateItem(elements.num, criteria.hasNum);
      if (elements.spec) updateItem(elements.spec, criteria.hasSpec);
      if (elements.match) updateItem(elements.match, criteria.hasMatch);
    }
  };

  API.passwordPolicy = PasswordPolicy;
  window.PasswordPolicy = PasswordPolicy;

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
