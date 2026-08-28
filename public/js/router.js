/**
 * Finanças Pro - SPA Router & Access Control
 */
const AppRouter = (() => {
  // Tab configuration metadata
  const TABS_CONFIG = {
    'tab-expenses': {
      id: 'tab-expenses',
      viewId: 'view-expenses',
      permission: 'despesas',
      title: 'Despesas & Orçamento',
      subtitle: 'Controle detalhado de gastos fixos, variáveis e limites anuais'
    },
    'tab-extras': {
      id: 'tab-extras',
      viewId: 'view-extras',
      permission: 'extras',
      title: 'Rendas Extras',
      subtitle: 'Gestão de faturamentos e recebimentos adicionais'
    },
    'tab-debtors': {
      id: 'tab-debtors',
      viewId: 'view-debtors',
      permission: 'devedores',
      title: 'Controle de Devedores',
      subtitle: 'Acompanhamento de valores a receber e quitações'
    },
    'tab-investments': {
      id: 'tab-investments',
      viewId: 'view-investments',
      permission: 'investimentos',
      title: 'Investimentos & Patrimônio',
      subtitle: 'Aportes, rendimentos e projeções financeiras'
    },
    'tab-benefits': {
      id: 'tab-benefits',
      viewId: 'view-benefits',
      permission: 'beneficios',
      title: 'Benefícios & Auxílios',
      subtitle: 'Gestão de vales, reembolsos e subsídios'
    },
    'tab-simulation': {
      id: 'tab-simulation',
      viewId: 'tab-simulation',
      permission: 'simulacao',
      title: 'Simulação de Despesas & Cenários',
      subtitle: 'Planeje e simule o impacto de compras e parcelamentos em um sandbox isolado'
    },
    'tab-profile': {
      id: 'tab-profile',
      viewId: 'tab-profile',
      permission: null,
      title: 'Perfil, Categorias & Destinos',
      subtitle: 'Personalize suas preferências, tetos de gastos e contas'
    },
    'tab-admin': {
      id: 'tab-admin',
      viewId: 'tab-admin',
      permission: 'configuracoes',
      title: 'Gestão de Usuários & Permissões (RBAC)',
      subtitle: 'Gerenciamento de contas cadastradas, redefinição de senhas e controle modular'
    },
    'tab-config': {
      id: 'tab-config',
      viewId: 'view-config',
      permission: 'configuracoes',
      title: 'Configurações do Sistema',
      subtitle: 'Gerenciamento de usuários, permissões e parâmetros do app'
    }
  };

  let currentTab = 'tab-expenses';

  // Check if current user has permission for a specific module
  function hasPermission(permissionKey) {
    if (!permissionKey) return true;
    const user = API.getUser();
    if (!user) return false;
    if (user.is_admin) return true; // Admins have full access

    const permissions = user.permissions || {};
    // By default, financial tabs are enabled if not explicitly set to false
    if (permissionKey === 'configuracoes') {
      return !!permissions.configuracoes;
    }
    return permissions[permissionKey] !== false;
  }

  // Apply RBAC access restrictions to Sidebar & Bottom Nav
  function applyPermissions() {
    const user = API.getUser();
    if (!user) return;

    // Filter sidebar navigation buttons
    const navButtons = document.querySelectorAll('.sidebar-link[data-tab]');
    navButtons.forEach(btn => {
      const tabId = btn.getAttribute('data-tab');
      const tabConfig = TABS_CONFIG[tabId];
      if (tabConfig && !hasPermission(tabConfig.permission)) {
        btn.style.display = 'none';
      } else {
        btn.style.display = 'flex';
      }
    });

    // Filter mobile bottom navigation bar items
    const bottomItems = document.querySelectorAll('.bottom-nav-item[data-tab]');
    bottomItems.forEach(item => {
      const tabId = item.getAttribute('data-tab');
      const tabConfig = TABS_CONFIG[tabId];
      if (tabConfig && !hasPermission(tabConfig.permission)) {
        item.style.display = 'none';
      } else {
        item.style.display = 'flex';
      }
    });
  }

  // Switch to a specific tab
  function navigate(tabId) {
    const tabConfig = TABS_CONFIG[tabId];
    if (!tabConfig) return;

    // Check permission
    if (!hasPermission(tabConfig.permission)) {
      notify('Você não tem permissão para acessar este módulo.', 'error');
      return;
    }

    currentTab = tabId;

    // Update active state in Sidebar
    document.querySelectorAll('.sidebar-link[data-tab]').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update active state in Bottom Navigation
    document.querySelectorAll('.bottom-nav-item[data-tab]').forEach(item => {
      if (item.getAttribute('data-tab') === tabId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Toggle View Containers
    document.querySelectorAll('.tab-view, .tab-content').forEach(view => {
      if (view.id === tabConfig.viewId || view.id === tabConfig.id || view.getAttribute('data-view') === tabId) {
        view.style.display = 'block';
        view.hidden = false;
        view.classList.add('active');
      } else {
        view.style.display = 'none';
        view.hidden = true;
        view.classList.remove('active');
      }
    });

    // Update Page Header Info
    const pageTitleEl = document.getElementById('pageTitle');
    const pageSubEl = document.getElementById('pageSub');
    if (pageTitleEl) pageTitleEl.textContent = tabConfig.title;
    if (pageSubEl) pageSubEl.textContent = tabConfig.subtitle;

    // Dispatch global tab changed event
    document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tabId, tabConfig } }));
  }

  // Setup User Interface (Header, Avatar, Theme, Logout)
  function initUserInterface() {
    const user = API.getUser();
    if (!user) return;

    // Render User Header / Sidebar elements
    const userNameEl = document.getElementById('headerUserName');
    const userEmailEl = document.getElementById('headerUserEmail');
    const userAvatarEl = document.getElementById('headerUserAvatar');
    const userBadgeEl = document.getElementById('headerUserBadge');

    if (userNameEl) userNameEl.textContent = user.nome || user.login;
    if (userEmailEl) userEmailEl.textContent = user.email || '';
    if (userAvatarEl) {
      const initials = (user.nome || user.login || 'U')
        .split(' ')
        .filter(Boolean)
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
      userAvatarEl.textContent = initials;
    }
    if (userBadgeEl) {
      userBadgeEl.textContent = user.is_admin ? 'Admin' : 'Usuário';
      userBadgeEl.style.display = 'inline-block';
    }

    // Sidebar Collapse Toggle
    const sidebar = document.getElementById('sidebar');
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    if (toggleSidebarBtn && sidebar) {
      const isCollapsed = localStorage.getItem('fp_sidebar_collapsed') === 'true';
      if (isCollapsed) sidebar.classList.add('collapsed');

      toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('fp_sidebar_collapsed', sidebar.classList.contains('collapsed'));
      });
    }

    // Dark / Light Theme Toggle
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const savedTheme = localStorage.getItem('fp_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('fp_theme', next);
      });
    }

    // Logout Handler
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        API.clearSession();
        window.location.href = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/login') : '/login';
      });
    }

    // Welcome Tour Popover
    function checkWelcomeTour() {
      const tourCompleted = localStorage.getItem('tour_manual_completed');
      const popover = document.getElementById('welcome-tour-popover') || document.getElementById('onboardingPopover');
      if (!popover) return;

      if (tourCompleted === 'true') {
        popover.hidden = true;
        popover.setAttribute('aria-hidden', 'true');
        popover.classList.add('hidden');
        popover.classList.remove('open');
        popover.style.setProperty('display', 'none', 'important');
      } else {
        popover.hidden = false;
        popover.removeAttribute('aria-hidden');
        popover.classList.remove('hidden');
        popover.classList.add('open');
        popover.style.removeProperty('display');
        popover.style.setProperty('display', 'flex', 'important');
      }
    }

    function dismissWelcomeTour() {
      try {
        localStorage.setItem('tour_manual_completed', 'true');
      } catch (_) {}
      const popover = document.getElementById('welcome-tour-popover') || document.getElementById('onboardingPopover');
      if (popover) {
        popover.hidden = true;
        popover.setAttribute('aria-hidden', 'true');
        popover.classList.add('hidden');
        popover.classList.remove('open');
        popover.style.setProperty('display', 'none', 'important');
      }
    }

    const btnDismiss = document.getElementById('btnDismissOnboarding');
    if (btnDismiss) btnDismiss.addEventListener('click', dismissWelcomeTour);
    const infoBtn = document.getElementById('infoBtn');
    if (infoBtn) infoBtn.addEventListener('click', dismissWelcomeTour);

    checkWelcomeTour();
  }

  // Initialize Router
  function init() {
    // Check Authentication
    if (!API.isAuthenticated()) {
      window.location.href = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/login') : 'login.html';
      return;
    }

    // Setup UI & Permissions
    initUserInterface();
    applyPermissions();

    // Attach Click Handlers to navigation elements
    document.querySelectorAll('.sidebar-link[data-tab], .bottom-nav-item[data-tab]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = el.getAttribute('data-tab');
        navigate(tabId);
      });
    });

    // Default Navigation: Pick first authorized tab
    const firstAuthTab = Object.keys(TABS_CONFIG).find(tabId => hasPermission(TABS_CONFIG[tabId].permission)) || 'tab-expenses';
    navigate(firstAuthTab);
  }

  return {
    init,
    navigate,
    hasPermission,
    applyPermissions,
    getCurrentTab: () => currentTab,
    getTabsConfig: () => TABS_CONFIG
  };
})();

// Auto bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  AppRouter.init();
});
