/* ==========================================================================
   MÓDULO DE UI SHELL, NAVEGAÇÃO & MODAIS BASE (uiShell.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

    const SUN_ICON = `<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const MOON_ICON = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

  function applyTheme() {
    const state = getState();
    const theme = state.theme || 'light';
    document.documentElement?.setAttribute('data-theme', theme);
    const iconHtml = theme === 'dark' ? SUN_ICON : MOON_ICON;
    const themeBtn = $('#themeBtn');
    if (themeBtn) themeBtn.innerHTML = iconHtml;
    const drawerThemeBtn = $('#drawerThemeBtn');
    if (drawerThemeBtn) {
      const span = drawerThemeBtn.querySelector('span');
      if (span) span.textContent = theme === 'dark' ? 'Modo Claro' : 'Modo Noturno';
    }
  }

  function toggleTheme() {
    const state = getState();
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    if (typeof saveLocalState === 'function') { saveLocalState(); } else { saveState('theme-toggle'); }
    applyTheme();
  }

  function applySidebarState() {
    const state = getState();
    const sidebar = $('#sidebar');
    if (!sidebar) return;
    const btn = $('#toggleSidebarBtn');
    if (state.sidebarCollapsed) {
      sidebar.classList.add('collapsed');
      if (btn) {
        btn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`;
        btn.setAttribute('data-tooltip', 'Expandir Menu');
        btn.removeAttribute('title');
      }
    } else {
      sidebar.classList.remove('collapsed');
      if (btn) {
        btn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>`;
        btn.setAttribute('data-tooltip', 'Recolher Menu');
        btn.removeAttribute('title');
      }
    }
  }

  function fillMonthSelects() {
    const state = (typeof getState === 'function' ? getState() : (window.getState ? window.getState() : {})) || {};
    const monthList = (typeof MONTH_NAMES !== 'undefined' && Array.isArray(MONTH_NAMES) && MONTH_NAMES.length === 12)
      ? MONTH_NAMES
      : (window.MONTH_NAMES && Array.isArray(window.MONTH_NAMES) && window.MONTH_NAMES.length === 12 ? window.MONTH_NAMES : ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']);
    const optionsHtml = monthList.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');

    const monthSelectors = [
      '#cashEffMonth', '#varStartMonth', '#varEndMonth',
      '#fixedEffMonth', '#entryMonth',
      '#extraStartMonth', '#extraEndMonth',
      '#debtorStartMonth', '#debtorEndMonth',
      '#aporteMonth', '#benefitMonth',
      '#convertVarStartMonth', '#convertVarEndMonth',
      '#simFormStartMonth', '#simStartMonth', '#simEndMonth'
    ];

    monthSelectors.forEach(id => {
      const el = $(id);
      if (el) {
        const cur = el.value;
        el.innerHTML = optionsHtml;
        if (cur) el.value = cur;
      }
    });

    const baseYear = state.year || new Date().getFullYear();
    const years = [];
    for (let y = baseYear - 4; y <= baseYear + 10; y++) {
      years.push(y);
    }
    const yearOpts = years.map(y => `<option value="${y}">${y}</option>`).join('');

    const yearSelectors = [
      '#cashEffYear', '#varStartYear', '#varEndYear',
      '#fixedEffYear', '#entryYear',
      '#extraStartYear', '#extraEndYear',
      '#debtorStartYear', '#debtorEndYear',
      '#aporteYear', '#benefitYear',
      '#convertVarStartYear', '#convertVarEndYear',
      '#simFormStartYear', '#simStartYear', '#simEndYear'
    ];

    yearSelectors.forEach(id => {
      const el = $(id);
      if (el) {
        const cur = el.value;
        el.innerHTML = yearOpts;
        if (cur) el.value = cur;
      }
    });
  }

  const ROUTE_MAP = {
    '/': 'tab-dashboard',
    '': 'tab-dashboard',
    '/index.html': 'tab-dashboard',
    '/dashboard': 'tab-dashboard',
    '/despesas': 'tab-expenses',
    '/extras': 'tab-extras',
    '/devedores': 'tab-debtors',
    '/investimentos': 'tab-investments',
    '/beneficios': 'tab-benefits',
    '/compras': 'tab-shopping',
    '/simulacao': 'tab-simulation',
    '/perfil': 'tab-profile',
    '/admin': 'tab-admin'
  };

  const TAB_TO_ROUTE = {
    'tab-dashboard': '/dashboard',
    'tab-expenses': '/despesas',
    'tab-extras': '/extras',
    'tab-debtors': '/devedores',
    'tab-investments': '/investimentos',
    'tab-benefits': '/beneficios',
    'tab-shopping': '/compras',
    'tab-simulation': '/simulacao',
    'tab-profile': '/perfil',
    'tab-admin': '/admin'
  };

  const DEFAULT_TAB = 'tab-dashboard';

  const titleMap = {
    'tab-dashboard': 'Dashboard',
    'tab-expenses': 'Despesas',
    'tab-extras': 'Rendas Extras',
    'tab-debtors': 'Devedores & Cobranças',
    'tab-investments': 'Investimentos & Metas',
    'tab-benefits': 'Benefícios',
    'tab-shopping': 'Lista de Compras',
    'tab-simulation': 'Simulador de Cenários & Novas Despesas',
    'tab-profile': 'Perfil',
    'tab-admin': 'Painel Administrativo'
  };

  const subMap = {
    'tab-dashboard': 'Visão consolidada da sua vida financeira',
    'tab-expenses': 'Gestão financeira pessoal com devedores e rendas extras',
    'tab-extras': 'Gerenciamento de fontes adicionais de receita e trabalhos pontuais',
    'tab-debtors': 'Controle de valores a receber, parcelas e cobranças de terceiros',
    'tab-investments': 'Acompanhamento de patrimônio, aportes e metas financeiras',
    'tab-benefits': 'Controle de benefícios corporativos e gastos compartilhados',
    'tab-shopping': 'Planejamento e controle de itens de compras',
    'tab-simulation': 'Projete o impacto de novos gastos e parcelamentos sem alterar seus dados reais',
    'tab-profile': 'Configuração de perfil, salário base, benefícios, categorias e destinos',
    'tab-admin': 'Gerenciamento de usuários e permissões do sistema'
  };

  function getTabFromPath(pathname) {
    let cleanPath = (pathname || window.location.pathname || '').replace(/\/+$/, '').toLowerCase();
    const base = (window.API && typeof API.getBasePath === 'function')
      ? API.getBasePath().toLowerCase()
      : (typeof window.__BASE_PATH__ === 'string' ? window.__BASE_PATH__.toLowerCase() : '');

    if (base && cleanPath.startsWith(base)) {
      cleanPath = cleanPath.slice(base.length) || '/';
    }
    return ROUTE_MAP[cleanPath] || null;
  }

  function getPathFromTab(tabId) {
    const relPath = TAB_TO_ROUTE[tabId] || '/dashboard';
    if (window.API && typeof API.resolveUrl === 'function') {
      return API.resolveUrl(relPath);
    }
    if (typeof window.withBasePath === 'function') {
      return window.withBasePath(relPath);
    }
    const base = typeof window.__BASE_PATH__ === 'string' ? window.__BASE_PATH__.trim().replace(/\/+$/, '') : '';
    return base ? `${base}${relPath}` : relPath;
  }

  const TAB_PERMISSION_MAP = {
    'tab-dashboard': 'dashboard',
    'tab-expenses': 'despesas',
    'tab-extras': 'extras',
    'tab-debtors': 'devedores',
    'tab-investments': 'investimentos',
    'tab-benefits': 'beneficios',
    'tab-shopping': 'compras',
    'tab-simulation': 'simulacao',
    'tab-profile': null,
    'tab-admin': 'configuracoes'
  };

  const TAB_ORDER = [
    'tab-dashboard',
    'tab-expenses',
    'tab-extras',
    'tab-debtors',
    'tab-investments',
    'tab-benefits',
    'tab-shopping',
    'tab-simulation',
    'tab-profile'
  ];

  function hasTabPermission(tabId, user) {
    const u = user || (window.API && typeof API.getUser === 'function' ? API.getUser() : null) || JSON.parse(localStorage.getItem('user_data') || localStorage.getItem('user') || '{}');
    if (!u || !u.id) return true;
    if (u.is_admin) return true;

    const permKey = TAB_PERMISSION_MAP[tabId];
    if (!permKey) return true;
    if (permKey === 'configuracoes') return !!u.is_admin;

    const perms = u.permissions || {};
    // Retrocompatibilidade: se a chave for undefined, permite acesso
    if (perms[permKey] === undefined) {
      return true;
    }
    return perms[permKey] === true;
  }

  function getFirstAllowedTab(user) {
    const u = user || (window.API && typeof API.getUser === 'function' ? API.getUser() : null) || JSON.parse(localStorage.getItem('user_data') || localStorage.getItem('user') || '{}');
    for (const tabId of TAB_ORDER) {
      if (hasTabPermission(tabId, u)) {
        if (!isModuleInMaintenance(tabId)) {
          return tabId;
        }
      }
    }
    return 'tab-profile';
  }

  function getFirstAllowedRoute(user) {
    const tabId = getFirstAllowedTab(user);
    return TAB_TO_ROUTE[tabId] || '/dashboard';
  }

  window.getFirstAllowedRouteForUser = getFirstAllowedRoute;
  window.hasTabPermission = hasTabPermission;
  window.getFirstAllowedTab = getFirstAllowedTab;

  function applyPermissions() {
    const user = (window.API && typeof API.getUser === 'function') ? API.getUser() : null;
    document.querySelectorAll('.sidebar-link[data-tab], .bottom-nav-item[data-tab], .mobile-drawer-card[data-tab]').forEach(el => {
      const tabId = el.getAttribute('data-tab');
      if (tabId === 'tab-admin' || el.id === 'sidebarAdminLink' || el.id === 'mobileDrawerAdminLink') {
        el.style.display = (user && user.is_admin) ? 'flex' : 'none';
      } else if (tabId) {
        const allowed = hasTabPermission(tabId, user);
        el.style.display = allowed ? '' : 'none';
      }
    });
  }
  window.applyPermissions = applyPermissions;

  const MOBILE_MODULE_CONFIG = [
    {
      tabId: 'tab-dashboard',
      key: 'dashboard',
      label: 'Dashboard',
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>'
    },
    {
      tabId: 'tab-expenses',
      key: 'despesas',
      label: 'Despesas',
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>'
    },
    {
      tabId: 'tab-debtors',
      key: 'devedores',
      label: 'Devedores',
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>'
    },
    {
      tabId: 'tab-extras',
      key: 'extras',
      label: 'Extras',
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></svg>'
    },
    {
      tabId: 'tab-investments',
      key: 'investimentos',
      label: 'Investir',
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>'
    },
    {
      tabId: 'tab-benefits',
      key: 'beneficios',
      label: 'Benefícios',
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>'
    },
    {
      tabId: 'tab-shopping',
      key: 'compras',
      label: 'Compras',
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>'
    },
    {
      tabId: 'tab-simulation',
      key: 'simulacao',
      label: 'Simulação',
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polygon points="12 6 12 12 16 14" /></svg>'
    }
  ];
  window.MOBILE_MODULE_CONFIG = MOBILE_MODULE_CONFIG;

  function normalizeTabId(item) {
    if (!item) return null;
    if (typeof item === 'string' && item.startsWith('tab-')) return item;
    const found = MOBILE_MODULE_CONFIG.find(m => m.key === item || m.tabId === 'tab-' + item);
    return found ? found.tabId : 'tab-' + item;
  }
  window.normalizeTabId = normalizeTabId;

  function activateTab(tabId, updateUrl = true) {
    let targetTabId = tabId || DEFAULT_TAB;

    if (!hasTabPermission(targetTabId)) {
      targetTabId = getFirstAllowedTab();
    }

    // Atualiza links da sidebar, bottom navigation e mobile drawer
    document.querySelectorAll('[data-tab]').forEach(l => {
      const lTab = typeof l.getAttribute === 'function' ? (l.getAttribute('data-tab') || l.dataset?.tab) : (l.dataset ? l.dataset.tab : null);
      l.classList.toggle('active', lTab === targetTabId);
    });

    // Se a aba ativa não estiver visível nos botões da barra inferior, destaca o botão "Mais"
    const state = (typeof getState === 'function') ? getState() : {};
    const rawFavs = (state.preferences && Array.isArray(state.preferences.mobileNavigation))
      ? state.preferences.mobileNavigation
      : ['tab-dashboard', 'tab-expenses', 'tab-debtors'];
    const currentFavTabs = rawFavs.map(normalizeTabId);
    const isSecondaryTab = !currentFavTabs.includes(targetTabId);
    const moreBtn = document.getElementById('btnMobileMore') || $('#btnMobileMore');
    if (moreBtn) {
      moreBtn.classList.toggle('active', isSecondaryTab);
    }

    // Fecha o drawer mobile e quick action caso estejam abertos
    const drawerOverlay = document.getElementById('mobileDrawerOverlay') || $('#mobileDrawerOverlay');
    if (drawerOverlay && drawerOverlay.classList.contains('open')) {
      drawerOverlay.classList.remove('open');
    }
    const quickOverlay = document.getElementById('mobileQuickActionOverlay') || $('#mobileQuickActionOverlay');
    if (quickOverlay && quickOverlay.classList.contains('open')) {
      quickOverlay.classList.remove('open');
    }

    // Alterna visibilidade das abas sem tocar em seus conteúdos internos
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(c => {
      const isTarget = (c.id === targetTabId);
      c.hidden = !isTarget;
      c.style.display = isTarget ? 'block' : 'none';
    });

    // Controle explícito da barra de meses (Ribbon) por módulo/aba
    const TABS_WITH_MONTH_RIBBON = ['tab-dashboard', 'tab-expenses', 'tab-extras', 'tab-debtors', 'tab-benefits'];
    const showRibbon = TABS_WITH_MONTH_RIBBON.includes(targetTabId);
    const ribbonSection = document.getElementById('ribbonSection') || (typeof $ === 'function' ? $('#ribbonSection') : null);
    if (ribbonSection) {
      ribbonSection.hidden = !showRibbon;
      ribbonSection.style.display = showRibbon ? '' : 'none';
      if (showRibbon && typeof renderRibbon === 'function') {
        renderRibbon(targetTabId);
      }
    }

    const titleEl = $('#pageTitle');
    const subEl = $('.page-sub') || $('#pageSub');
    if (titleEl) titleEl.textContent = titleMap[targetTabId] || (typeof TAB_TITLES !== 'undefined' && TAB_TITLES[targetTabId]) || 'OmniFin';
    if (subEl && subMap[targetTabId]) subEl.textContent = subMap[targetTabId];

    if (targetTabId === 'tab-dashboard' && typeof window.renderConsolidatedDashboardTab === 'function') {
      window.renderConsolidatedDashboardTab();
    } else if (targetTabId === 'tab-profile' && typeof window.renderProfile === 'function') {
      window.renderProfile();
    } else if (targetTabId === 'tab-simulation' && typeof window.renderSimulationTab === 'function') {
      window.renderSimulationTab();
    }

    if (updateUrl) {
      const targetPath = getPathFromTab(targetTabId);
      if (window.location.pathname !== targetPath && window.history && typeof window.history.pushState === 'function') {
        window.history.pushState({ tabId: targetTabId }, '', targetPath);
      }
    }
  }

  function syncRouteFromLocation() {
    const rawPath = (window.location && window.location.pathname) ? window.location.pathname : '';
    let targetTab = getTabFromPath(rawPath);

    if (!targetTab) {
      targetTab = getFirstAllowedTab();
      const isLoginPage = rawPath.endsWith('/login') || rawPath.endsWith('login.html');
      if (!isLoginPage && window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState({ tabId: targetTab }, '', getPathFromTab(targetTab));
      }
    } else {
      if (!hasTabPermission(targetTab)) {
        targetTab = getFirstAllowedTab();
        if (window.history && typeof window.history.replaceState === 'function') {
          window.history.replaceState({ tabId: targetTab }, '', getPathFromTab(targetTab));
        }
      } else {
        let cleanPath = rawPath.replace(/\/+$/, '').toLowerCase();
        const base = (window.API && typeof API.getBasePath === 'function')
          ? API.getBasePath().toLowerCase()
          : (typeof window.__BASE_PATH__ === 'string' ? window.__BASE_PATH__.toLowerCase() : '');
        if (base && cleanPath.startsWith(base)) {
          cleanPath = cleanPath.slice(base.length) || '/';
        }
        if (cleanPath === '/' || cleanPath === '' || cleanPath === '/index.html') {
          if (window.history && typeof window.history.replaceState === 'function') {
            window.history.replaceState({ tabId: targetTab }, '', getPathFromTab(targetTab));
          }
        }
      }
    }

    applyPermissions();
    activateTab(targetTab, false);
  }

  const MAINTENANCE_MODULE_MAP = {
    'tab-dashboard': 'dashboard',
    'tab-expenses': 'despesas',
    'tab-extras': 'extras',
    'tab-debtors': 'devedores',
    'tab-investments': 'investimentos',
    'tab-benefits': 'beneficios',
    'tab-shopping': 'compras',
    'tab-simulation': 'simulacao'
  };

  let systemMaintenanceConfig = null;
  let maintenanceLoadFailed = false;

    async function loadSystemMaintenance() {
    try {
      if (typeof API !== 'undefined' && API.getSystemMaintenance) {
        const res = await API.getSystemMaintenance();
        if (res && res.success && res.maintenance) {
          systemMaintenanceConfig = res.maintenance;
          maintenanceLoadFailed = false;
          updateSidebarMaintenanceBadges();
          const activeLink = document.querySelector('.sidebar-link.active');
          const activeTab = activeLink ? (activeLink.getAttribute?.('data-tab') || (activeLink.dataset && activeLink.dataset.tab)) : 'tab-dashboard';
          checkModuleMaintenance(activeTab);
          if (typeof render === 'function') render();
          return;
        }
      }
    } catch (err) {
      console.warn('Falha ao obter status de manutenção:', err);
    }
    maintenanceLoadFailed = true;
    updateSidebarMaintenanceBadges();
    const activeLink = document.querySelector('.sidebar-link.active');
    const activeTab = activeLink ? (typeof activeLink.getAttribute === 'function' ? (activeLink.getAttribute('data-tab') || activeLink.dataset?.tab) : (activeLink.dataset ? activeLink.dataset.tab : 'tab-dashboard')) : 'tab-dashboard';
    checkModuleMaintenance(activeTab);
    if (typeof render === 'function') render();
  }

  function updateSidebarMaintenanceBadges() {
    // 1. Atualiza badges na sidebar desktop
    document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
      const tabId = link.getAttribute('data-tab');
      const moduleKey = MAINTENANCE_MODULE_MAP[tabId];
      let isMaint = false;

      if (moduleKey && systemMaintenanceConfig && systemMaintenanceConfig[moduleKey]) {
        isMaint = !!systemMaintenanceConfig[moduleKey].maintenance;
      } else if (moduleKey && maintenanceLoadFailed) {
        isMaint = true;
      }

      let badge = link.querySelector('.sidebar-maint-badge');
      if (isMaint) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'sidebar-maint-badge';
          badge.setAttribute('title', 'Módulo em manutenção');
          badge.style.cssText = 'margin-left:auto; display:inline-flex; align-items:center; color:var(--warning, #f59e0b); flex-shrink:0;';
          badge.innerHTML = `
            <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--warning, #f59e0b); width:13px; height:13px; stroke-width:2.2;">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
          `;
          link.appendChild(badge);
        } else {
          badge.style.display = 'inline-flex';
        }
      } else {
        if (badge) {
          badge.style.display = 'none';
        }
      }
    });

    // 2. Atualiza badges na barra inferior e drawer mobile
    document.querySelectorAll('.bottom-nav-item[data-tab], .mobile-drawer-card[data-tab]').forEach(link => {
      const tabId = link.getAttribute('data-tab');
      const moduleKey = MAINTENANCE_MODULE_MAP[tabId];
      let isMaint = false;

      if (moduleKey && systemMaintenanceConfig && systemMaintenanceConfig[moduleKey]) {
        isMaint = !!systemMaintenanceConfig[moduleKey].maintenance;
      } else if (moduleKey && maintenanceLoadFailed) {
        isMaint = true;
      }

      let badge = link.querySelector('.nav-badge') || link.querySelector('.sidebar-maint-badge');
      if (isMaint) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'nav-badge';
          badge.setAttribute('title', 'Módulo em manutenção');
          link.appendChild(badge);
        } else {
          badge.style.display = 'block';
        }
      } else {
        if (badge) {
          badge.style.display = 'none';
        }
      }
    });
  }

  function isModuleInMaintenance(tabId) {
    const moduleKey = MAINTENANCE_MODULE_MAP[tabId];
    if (!moduleKey) return false;

    const user = (typeof API !== 'undefined' && API.getUser)
      ? API.getUser()
      : JSON.parse(localStorage.getItem('user_data') || localStorage.getItem('user') || '{}');

    // Admin possui bypass total
    if (user && user.is_admin) {
      return false;
    }

    // Política Fail-Closed: se falhou em carregar o status, bloqueia por segurança
    if (maintenanceLoadFailed) {
      return true;
    }

    if (!systemMaintenanceConfig) {
      return false;
    }

    const mod = systemMaintenanceConfig[moduleKey];
    return !!(mod && mod.maintenance);
  }

  function checkModuleMaintenance(tabId) {
    const container = $(`#${tabId}`);
    if (!container) return false;

    const inMaintenance = isModuleInMaintenance(tabId);
    const maintenanceOverlay = container.querySelector('.maintenance-screen-overlay');

    if (inMaintenance) {
      // Oculta filhos originais preservando a árvore DOM e listeners intactos
      Array.from(container.children).forEach(child => {
        if (child !== maintenanceOverlay) {
          child.setAttribute('data-maint-hidden', 'true');
          child.style.display = 'none';
        }
      });

      const moduleName = titleMap[tabId] || 'Módulo';

      if (!maintenanceOverlay) {
        const overlay = document.createElement('div');
        overlay.className = 'maintenance-screen-overlay';
        overlay.innerHTML = `
          <div class="card section-card full-width" style="padding:48px 24px; margin:20px 0; border-radius:14px; text-align:center; background:var(--surface);">
            <div style="width:64px; height:64px; border-radius:50%; background:rgba(245, 158, 11, 0.12); display:inline-flex; align-items:center; justify-content:center; margin-bottom:16px;">
              <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--warning, #f59e0b); width:32px; height:32px; stroke-width:2.2;">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            </div>
            <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--warning, #f59e0b); margin-bottom:8px;">Manutenção do Sistema</div>
            <h2 style="font-size:1.4rem; font-weight:800; color:var(--text); margin:0 0 8px;">Área temporariamente em manutenção</h2>
            <p style="font-size:0.92rem; color:var(--muted); max-width:440px; margin:0 auto 24px; line-height:1.5;">
              Estamos realizando melhorias em <strong>${typeof escapeHtml === 'function' ? escapeHtml(moduleName) : moduleName}</strong>. Tente novamente em alguns minutos.
            </p>
            <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
              <button type="button" class="btn primary" id="btnMaintReload" style="border-radius:10px; font-weight:700;">
                Recarregar
              </button>
            </div>
          </div>
        `;
        container.appendChild(overlay);

        overlay.querySelector('#btnMaintReload')?.addEventListener('click', async () => {
          const reloadBtn = overlay.querySelector('#btnMaintReload');
          if (reloadBtn) {
            reloadBtn.disabled = true;
            reloadBtn.textContent = 'Verificando...';
          }
          await loadSystemMaintenance();
          if (reloadBtn) {
            reloadBtn.disabled = false;
            reloadBtn.textContent = 'Recarregar';
          }
        });
      } else {
        maintenanceOverlay.style.display = 'block';
      }

      return true; // Bloqueado pelo guard
    } else {
      // Restaura visibilidade dos filhos normais
      if (maintenanceOverlay) {
        maintenanceOverlay.style.display = 'none';
      }
      if (container && container.children) {
        Array.from(container.children).forEach(child => {
          if (typeof child.getAttribute === 'function' && child.getAttribute('data-maint-hidden') === 'true') {
            child.removeAttribute('data-maint-hidden');
            child.style.display = '';
          }
        });
      }
      return false; // Liberado para renderizar
    }
  }

  function initTabs() {
    const toggleBtn = $('#toggleSidebarBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const state = getState();
        state.sidebarCollapsed = !state.sidebarCollapsed;
        if (typeof saveLocalState === 'function') { saveLocalState(); } else { saveState('sidebar-toggle'); }
        applySidebarState();
      });
    }

    applyPermissions();

    // Listeners de navegação para Sidebar, Bottom Nav e Mobile Drawer
    document.querySelectorAll('[data-tab]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = link.getAttribute('data-tab') || link.dataset.tab;
        if (!tabId) return;
        activateTab(tabId, true);
      });
    });

    // Abertura e Fechamento do Drawer Mobile
    const drawerOverlay = $('#mobileDrawerOverlay');
    const btnMobileMore = $('#btnMobileMore');
    const mobileKebabBtn = $('#mobileKebabBtn');
    const closeDrawerBtn = $('#closeMobileDrawerBtn');

    if (btnMobileMore && drawerOverlay) {
      btnMobileMore.addEventListener('click', (e) => {
        e.preventDefault();
        drawerOverlay.classList.add('open');
      });
    }

    if (mobileKebabBtn && drawerOverlay) {
      mobileKebabBtn.addEventListener('click', (e) => {
        e.preventDefault();
        drawerOverlay.classList.add('open');
      });
    }

    if (closeDrawerBtn && drawerOverlay) {
      closeDrawerBtn.addEventListener('click', () => {
        drawerOverlay.classList.remove('open');
      });
    }

    if (drawerOverlay) {
      drawerOverlay.addEventListener('click', (e) => {
        if (e.target === drawerOverlay) {
          drawerOverlay.classList.remove('open');
        }
      });
    }

    // Inicializa listeners do Cadastro Rápido e renderiza Bottom Nav dinâmico
    initQuickActionListeners();
    renderMobileBottomNav();

    // Ações secundárias do Drawer Mobile
    $('#themeBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      toggleTheme();
    });

    $('#drawerThemeBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      toggleTheme();
      drawerOverlay?.classList.remove('open');
    });

    $('#drawerReportBtn')?.addEventListener('click', () => {
      $('#reportBtn')?.click();
      drawerOverlay?.classList.remove('open');
    });

    $('#drawerCsvBtn')?.addEventListener('click', () => {
      $('#csvBtn')?.click();
      drawerOverlay?.classList.remove('open');
    });

    $('#drawerBackupBtn')?.addEventListener('click', () => {
      $('#backupBtn')?.click();
      drawerOverlay?.classList.remove('open');
    });

    $('#drawerInfoBtn')?.addEventListener('click', () => {
      $('#infoBtn')?.click();
      drawerOverlay?.classList.remove('open');
    });

    $('#drawerLogoutBtn')?.addEventListener('click', () => {
      $('#btnLogout')?.click();
    });

    window.addEventListener('popstate', () => {
      syncRouteFromLocation();
    });

    // Sincroniza a aba com a URL inicial (acesso direto ou F5)
    syncRouteFromLocation();

    // Carrega o status de manutenção do sistema de forma assíncrona no boot
    loadSystemMaintenance();
  }

  function openQuickActionSheet() {
    const quickOverlay = document.getElementById('mobileQuickActionOverlay') || $('#mobileQuickActionOverlay');
    if (!quickOverlay) return;

    // Aplica RBAC e manutenção nos itens de cadastro rápido
    const btnExp = document.getElementById('quickActionNewExpense') || $('#quickActionNewExpense');
    const btnDeb = document.getElementById('quickActionNewDebtor') || $('#quickActionNewDebtor');
    const btnBen = document.getElementById('quickActionNewBenefit') || $('#quickActionNewBenefit');

    if (btnExp) {
      const allowed = hasTabPermission('tab-expenses') && !isModuleInMaintenance('tab-expenses');
      btnExp.style.display = allowed ? 'flex' : 'none';
    }
    if (btnDeb) {
      const allowed = hasTabPermission('tab-debtors') && !isModuleInMaintenance('tab-debtors');
      btnDeb.style.display = allowed ? 'flex' : 'none';
    }
    if (btnBen) {
      const allowed = hasTabPermission('tab-benefits') && !isModuleInMaintenance('tab-benefits');
      btnBen.style.display = allowed ? 'flex' : 'none';
    }

    quickOverlay.classList.add('open');
  }
  window.openQuickActionSheet = openQuickActionSheet;

  function initQuickActionListeners() {
    const quickOverlay = document.getElementById('mobileQuickActionOverlay') || $('#mobileQuickActionOverlay');
    const closeBtn = document.getElementById('closeMobileQuickActionBtn') || $('#closeMobileQuickActionBtn');

    if (closeBtn && quickOverlay) {
      closeBtn.addEventListener('click', () => {
        quickOverlay.classList.remove('open');
      });
    }

    if (quickOverlay) {
      quickOverlay.addEventListener('click', (e) => {
        if (e.target === quickOverlay) {
          quickOverlay.classList.remove('open');
        }
      });
    }

    // Ação: Nova Despesa
    const btnExp = document.getElementById('quickActionNewExpense') || $('#quickActionNewExpense');
    if (btnExp) {
      btnExp.addEventListener('click', () => {
        quickOverlay?.classList.remove('open');
        if (typeof window.openEntryDialog === 'function') {
          window.openEntryDialog({ mode: 'new', type: 'cash' });
        } else {
          activateTab('tab-expenses', true);
        }
      });
    }

    // Ação: Novo Devedor
    const btnDeb = document.getElementById('quickActionNewDebtor') || $('#quickActionNewDebtor');
    if (btnDeb) {
      btnDeb.addEventListener('click', () => {
        quickOverlay?.classList.remove('open');
        if (typeof window.openDebtorDialog === 'function') {
          window.openDebtorDialog('new');
        } else {
          activateTab('tab-debtors', true);
        }
      });
    }

    // Ação: Novo Benefício
    const btnBen = document.getElementById('quickActionNewBenefit') || $('#quickActionNewBenefit');
    if (btnBen) {
      btnBen.addEventListener('click', () => {
        quickOverlay?.classList.remove('open');
        if (typeof window.openBenefitDialog === 'function') {
          window.openBenefitDialog('new');
        } else {
          activateTab('tab-benefits', true);
        }
      });
    }
  }
  window.initQuickActionListeners = initQuickActionListeners;

  function renderMobileBottomNav() {
    const navEl = document.getElementById('mobileBottomNav') || $('#mobileBottomNav');
    if (!navEl) return;

    const state = (typeof getState === 'function') ? getState() : {};
    const rawFavs = (state.preferences && Array.isArray(state.preferences.mobileNavigation) && state.preferences.mobileNavigation.length > 0)
      ? state.preferences.mobileNavigation
      : ['tab-dashboard', 'tab-expenses', 'tab-debtors'];

    // Normaliza e filtra por permissões ativas e manutenção
    const validFavs = [];
    rawFavs.forEach(f => {
      const tabId = normalizeTabId(f);
      if (tabId && hasTabPermission(tabId) && !isModuleInMaintenance(tabId) && !validFavs.includes(tabId)) {
        validFavs.push(tabId);
      }
    });

    // Se faltarem favoritos para compor até 3, completa com os primeiros permitidos do sistema
    if (validFavs.length < 3) {
      MOBILE_MODULE_CONFIG.forEach(m => {
        if (validFavs.length < 3 && hasTabPermission(m.tabId) && !isModuleInMaintenance(m.tabId) && !validFavs.includes(m.tabId)) {
          validFavs.push(m.tabId);
        }
      });
    }

    const fav1 = validFavs[0] ? MOBILE_MODULE_CONFIG.find(m => m.tabId === validFavs[0]) : MOBILE_MODULE_CONFIG[0];
    const fav2 = validFavs[1] ? MOBILE_MODULE_CONFIG.find(m => m.tabId === validFavs[1]) : (validFavs[0] !== MOBILE_MODULE_CONFIG[1]?.tabId ? MOBILE_MODULE_CONFIG[1] : null);
    const fav3 = validFavs[2] ? MOBILE_MODULE_CONFIG.find(m => m.tabId === validFavs[2]) : (validFavs.length > 2 ? MOBILE_MODULE_CONFIG.find(m => m.tabId === validFavs[2]) : null);

    const activeTab = document.querySelector('.tab-content:not([hidden])')?.id || DEFAULT_TAB;

    let html = '';
    // Posição 1: Favorito 1
    if (fav1) {
      html += `
        <button type="button" class="bottom-nav-item ${activeTab === fav1.tabId ? 'active' : ''}" data-tab="${fav1.tabId}" id="bottomNavFav1">
          ${fav1.iconSvg}
          <span>${fav1.label}</span>
        </button>
      `;
    }

    // Posição 2: Favorito 2
    if (fav2) {
      html += `
        <button type="button" class="bottom-nav-item ${activeTab === fav2.tabId ? 'active' : ''}" data-tab="${fav2.tabId}" id="bottomNavFav2">
          ${fav2.iconSvg}
          <span>${fav2.label}</span>
        </button>
      `;
    }

    // Posição 3: Botão Central "+" (Cadastro Rápido)
    html += `
      <button type="button" class="bottom-nav-fab" id="btnMobileQuickAction" aria-label="Cadastro Rápido" data-tooltip="Cadastro Rápido">
        <svg class="svg-icon" viewBox="0 0 24 24">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    `;

    // Posição 4: Favorito 3
    if (fav3) {
      html += `
        <button type="button" class="bottom-nav-item ${activeTab === fav3.tabId ? 'active' : ''}" data-tab="${fav3.tabId}" id="bottomNavFav3">
          ${fav3.iconSvg}
          <span>${fav3.label}</span>
        </button>
      `;
    }

    // Posição 5: Botão "Mais"
    const isSecondaryTab = !validFavs.includes(activeTab);
    html += `
      <button type="button" class="bottom-nav-item ${isSecondaryTab ? 'active' : ''}" id="btnMobileMore" aria-label="Mais Módulos">
        <svg class="svg-icon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="1.5"/>
          <circle cx="19" cy="12" r="1.5"/>
          <circle cx="5" cy="12" r="1.5"/>
        </svg>
        <span>Mais</span>
      </button>
    `;

    navEl.innerHTML = html;

    // Attach listeners aos itens recém-renderizados
    navEl.querySelectorAll('.bottom-nav-item[data-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tId = btn.getAttribute('data-tab');
        if (tId && typeof activateTab === 'function') {
          activateTab(tId, true);
        }
      });
    });

    const fabBtn = navEl.querySelector('#btnMobileQuickAction');
    if (fabBtn) {
      fabBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openQuickActionSheet();
      });
    }

    const moreBtn = navEl.querySelector('#btnMobileMore');
    const drawerOverlay = document.getElementById('mobileDrawerOverlay') || $('#mobileDrawerOverlay');
    if (moreBtn && drawerOverlay) {
      moreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        drawerOverlay.classList.add('open');
      });
    }

    updateSidebarMaintenanceBadges();
  }
  window.renderMobileBottomNav = renderMobileBottomNav;

  function initDialogs() {
    $$('dialog').forEach(d => {
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
      d.addEventListener('close', () => {
        const t = $('#toast-container') || $('#toast');
        if (t && t.parentElement !== document.body) {
          try { document.body.appendChild(t); } catch (_) { }
        }
      });
    });
    $$('[data-close]').forEach(b => b.addEventListener('click', () => {
      const targetDlg = $(`#${b.dataset.close}`);
      if (targetDlg && typeof targetDlg.close === 'function') targetDlg.close();
    }));
  }

  function openInfo() {
    dismissWelcomeTour();
    $('#infoDialog').showModal();
  }

  // Listener exclusivo de abertura do diálogo institucional
  $('#infoBtn')?.addEventListener('click', openInfo);

  // ==========================================================================
  // SISTEMA GLOBAL DE TOOLTIPS (SINGLETON VIEWPORT-SAFE)
  // ==========================================================================
  function initGlobalTooltips() {
    let tooltipEl = document.getElementById('globalTooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'globalTooltip';
      tooltipEl.className = 'global-tooltip';
      tooltipEl.setAttribute('role', 'tooltip');
      tooltipEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tooltipEl);
    } else if (tooltipEl.parentElement !== document.body) {
      document.body.appendChild(tooltipEl);
    }

    let activeTarget = null;
    let isPointerOverTarget = false;
    let isPointerOverTooltip = false;
    let hideTimer = null;
    const MARGIN = 8;
    const HIDE_DELAY_MS = 80;

    function updatePosition() {
      if (!activeTarget || !activeTarget.isConnected) {
        hideTooltip(true);
        return;
      }

      const rect = activeTarget.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        hideTooltip(true);
        return;
      }

      const tipRect = tooltipEl.getBoundingClientRect();
      const hasSpaceAbove = (rect.top - tipRect.height - MARGIN) >= MARGIN;

      let top = hasSpaceAbove ? (rect.top - tipRect.height - MARGIN) : (rect.bottom + MARGIN);
      if (top + tipRect.height > window.innerHeight - MARGIN) {
        top = Math.max(MARGIN, window.innerHeight - tipRect.height - MARGIN);
      }
      if (top < MARGIN) top = MARGIN;

      let left = rect.left + (rect.width / 2) - (tipRect.width / 2);
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - tipRect.width - MARGIN));

      tooltipEl.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    }

    function showTooltip(target) {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }

      const text = target.getAttribute('data-tooltip');
      if (!text || text.trim() === '') {
        hideTooltip(true);
        return;
      }

      activeTarget = target;
      isPointerOverTarget = true;
      tooltipEl.textContent = text.trim();
      tooltipEl.setAttribute('aria-hidden', 'false');
      tooltipEl.classList.add('show');
      updatePosition();
    }

    function scheduleHide() {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!isPointerOverTarget && !isPointerOverTooltip) {
          hideTooltip(false);
        }
      }, HIDE_DELAY_MS);
    }

    function hideTooltip(immediate = false) {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      activeTarget = null;
      isPointerOverTarget = false;
      isPointerOverTooltip = false;
      tooltipEl.classList.remove('show');
      tooltipEl.setAttribute('aria-hidden', 'true');
    }

    // Delegação global de eventos
    document.addEventListener('pointerenter', (e) => {
      const target = e.target.closest && e.target.closest('[data-tooltip]');
      if (target) showTooltip(target);
    }, { capture: true, passive: true });

    document.addEventListener('pointerleave', (e) => {
      const target = e.target.closest && e.target.closest('[data-tooltip]');
      if (target && target === activeTarget) {
        isPointerOverTarget = false;
        scheduleHide();
      }
    }, { capture: true, passive: true });

    // Eventos no próprio tooltip para transição de mouse
    tooltipEl.addEventListener('pointerenter', () => {
      isPointerOverTooltip = true;
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }, { passive: true });

    tooltipEl.addEventListener('pointerleave', () => {
      isPointerOverTooltip = false;
      scheduleHide();
    }, { passive: true });

    document.addEventListener('focusin', (e) => {
      const target = e.target.closest && e.target.closest('[data-tooltip]');
      if (target) showTooltip(target);
    }, { capture: true, passive: true });

    document.addEventListener('focusout', (e) => {
      const target = e.target.closest && e.target.closest('[data-tooltip]');
      if (target && target === activeTarget) {
        isPointerOverTarget = false;
        scheduleHide();
      }
    }, { capture: true, passive: true });

    document.addEventListener('pointerdown', (e) => {
      if (activeTarget && e.target !== tooltipEl && !tooltipEl.contains(e.target)) {
        hideTooltip(true);
      }
    }, { capture: true, passive: true });

    window.addEventListener('scroll', () => {
      if (activeTarget && tooltipEl.classList.contains('show')) updatePosition();
    }, { capture: true, passive: true });

    window.addEventListener('resize', () => {
      if (activeTarget && tooltipEl.classList.contains('show')) updatePosition();
    }, { passive: true });
  }

  // Inicializa o sistema de tooltips imediatamente
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGlobalTooltips);
  } else {
    initGlobalTooltips();
  }

  // PWA Service Worker Registration & iOS Standalone Navigation Handler
  function initPwaSupport() {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const swUrl = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/sw.js') : 'sw.js';
        const swScope = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/') : './';
        navigator.serviceWorker.register(swUrl, { scope: swScope }).catch(err => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
      });
    }

    if (typeof navigator !== 'undefined' && ('standalone' in navigator) && navigator.standalone) {
      document.addEventListener('click', (event) => {
        const a = event.target.closest('a');
        if (a && a.href && a.hostname === window.location.hostname && !a.target && !a.hasAttribute('download')) {
          event.preventDefault();
          window.location.href = a.href;
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPwaSupport);
  } else {
    initPwaSupport();
  }

  // APIs públicas do Módulo de UI Shell & Roteador SPA
  window.applyTheme = applyTheme;
  window.toggleTheme = toggleTheme;
  window.applySidebarState = applySidebarState;
  window.fillMonthSelects = fillMonthSelects;
  window.initTabs = initTabs;
  window.initDialogs = initDialogs;
  window.activateTab = activateTab;
  window.syncRouteFromLocation = syncRouteFromLocation;
  window.checkModuleMaintenance = checkModuleMaintenance;
  window.loadSystemMaintenance = loadSystemMaintenance;
  window.updateSidebarMaintenanceBadges = updateSidebarMaintenanceBadges;
  window.isModuleInMaintenance = isModuleInMaintenance;
  window.initGlobalTooltips = initGlobalTooltips;
  window.initPwaSupport = initPwaSupport;

  window.uiShell = {
    applyTheme,
    toggleTheme,
    applySidebarState,
    fillMonthSelects,
    initTabs,
    initDialogs,
    activateTab,
    syncRouteFromLocation,
    checkModuleMaintenance,
    loadSystemMaintenance,
    updateSidebarMaintenanceBadges,
    isModuleInMaintenance,
    initGlobalTooltips,
    initPwaSupport
  };

})();
