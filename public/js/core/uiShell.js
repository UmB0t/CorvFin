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
      '#fixedEffMonth', '#recEndMonth', '#entryMonth',
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
      '#fixedEffYear', '#recEndYear', '#entryYear',
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
    let localUser = {};
    try {
      if (typeof localStorage !== 'undefined') {
        localUser = JSON.parse(localStorage.getItem('user_data') || localStorage.getItem('user') || '{}');
      }
    } catch (_) {}
    const u = user || (window.API && typeof API.getUser === 'function' ? API.getUser() : null) || localUser;
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
    let localUser = {};
    try {
      if (typeof localStorage !== 'undefined') {
        localUser = JSON.parse(localStorage.getItem('user_data') || localStorage.getItem('user') || '{}');
      }
    } catch (_) {}
    const u = user || (window.API && typeof API.getUser === 'function' ? API.getUser() : null) || localUser;
    for (const tabId of TAB_ORDER) {
      const access = getModuleCommercialAccess(tabId, u);
      if (access.effectiveAllowed) {
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

  function getModuleCommercialAccess(tabOrModuleKey, user) {
    const permKey = TAB_PERMISSION_MAP[tabOrModuleKey] || tabOrModuleKey;
    const ctx = window._cachedCommercialContext;
    let localUser = {};
    try {
      if (typeof localStorage !== 'undefined') {
        localUser = JSON.parse(localStorage.getItem('user_data') || localStorage.getItem('user') || '{}');
      }
    } catch (_) {}
    const u = user || (window.API && typeof API.getUser === 'function' ? API.getUser() : null) || localUser;
    const rbacAllowed = hasTabPermission(tabOrModuleKey, u);
    if (!ctx || !ctx.access || !ctx.access[permKey]) {
      return {
        planAllowed: true,
        permissionAllowed: rbacAllowed,
        effectiveAllowed: rbacAllowed
      };
    }
    const access = ctx.access[permKey];
    return {
      planAllowed: access.planAllowed !== false,
      permissionAllowed: rbacAllowed,
      effectiveAllowed: Boolean(access.planAllowed !== false && rbacAllowed)
    };
  }

  const MODULE_DYNAMIC_SELECTORS = {
    'tab-expenses': {
      lists: ['#listFixed', '#listVariable', '#simpExpensesList'],
      tables: [{ selector: '#installmentsTableBody', cols: 7, rows: 2 }],
      charts: ['#insightsContainer', '#destChartBars', '#destUnifiedChartContent', '#categoryUnifiedChartContent'],
      totals: [
        '#sumFixed', '#sumVariable', '#sumInstallmentsTotal', '#destChartTotal',
        '#categoryChartTotalIncome', '#simpTotalExpenses', '#simpPaidExpenses',
        '#simpPendingExpenses', '#simpSobraValue', '#simpSumAll'
      ],
      metricContainers: ['#dashboardMetrics', '#expensesInstallmentsMetrics']
    },
    'tab-extras': {
      lists: ['#listExtra'],
      tables: [],
      charts: ['#extrasOriginChartContainer', '#extrasYearChartContainer'],
      totals: [
        '#sumExtra', '#extrasOriginTotalBadge', '#extrasYearTotalBadge',
        '#extrasAvgSummaryText', '#extrasTotalYearSummaryText'
      ],
      metricContainers: ['#extraMetrics']
    },
    'tab-debtors': {
      lists: ['#listDebtors'],
      tables: [{ selector: '#debtorsTotalsTableBody', cols: 6, rows: 2 }],
      charts: ['#debtorPersonChartContent', '#debtorDestChartContent'],
      totals: ['#sumDebtors', '#sumDebtorsGrandTotal', '#debtorPersonTotal', '#debtorDestTotal'],
      metricContainers: ['#debtorMetrics', '#debtorsTotalsMetrics']
    },
    'tab-investments': {
      lists: ['#assetGridList'],
      listType: 'cards',
      tables: [],
      charts: ['#simResultsContainer', '#investChartsGrid'],
      totals: [],
      metricContainers: ['#investMetrics']
    },
    'tab-benefits': {
      lists: ['#listBenefits'],
      tables: [],
      charts: ['#benefitTypeChartContainer', '#benefitDailyChartContainer'],
      totals: [
        '#sumBenefits', '#benefitTypeTotalBadge',
        '#benefitSpentSummaryText', '#benefitBaseSummaryText'
      ],
      metricContainers: ['#benefitMetrics']
    },
    'tab-shopping': {
      lists: ['#shoppingListsGrid'],
      listType: 'cards',
      tables: [],
      charts: [],
      totals: [],
      metricContainers: [],
      cleanup: (container) => {
        const detail = container.querySelector('#shoppingListDetail, .shopping-list-detail-wrap');
        if (detail) detail.remove();
        const grid = container.querySelector('#shoppingListsGrid');
        if (grid) grid.style.display = '';
      }
    },
    'tab-simulation': {
      lists: ['#simRealList', '#simInjectedList'],
      tables: [],
      charts: ['#simMonthlyBarsContainer'],
      totals: ['#simRealTotal', '#simInjectedTotal', '#savedSimulationsCountBadge'],
      cleanup: (container) => {
        const savedList = container.querySelector('#savedSimulationsList');
        if (savedList) {
          savedList.innerHTML = '<div class="module-locked-placeholder-text" style="color:var(--muted); text-align:center; padding:16px; font-size:0.85rem;">Nenhum cenário salvo</div>';
        }
      },
      metricContainers: ['#simMetrics']
    }
  };

  function createSkeletonRowHtml(count = 3, height = '44px') {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `<div class="module-locked-skeleton-row" style="height:${height}; background:var(--surface-2, rgba(255,255,255,0.05)); border-radius:8px; margin-bottom:8px; opacity:0.5;"></div>`;
    }
    return html;
  }

  function createSkeletonCardHtml(count = 2, height = '90px') {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `<div class="card module-locked-skeleton-card" style="height:${height}; background:var(--surface-2, rgba(255,255,255,0.05)); border-radius:12px; margin-bottom:12px; opacity:0.5;"></div>`;
    }
    return html;
  }

  function createSkeletonTableRowsHtml(cols = 6, rows = 2) {
    let html = '';
    for (let r = 0; r < rows; r++) {
      html += `<tr class="module-locked-skeleton-tr">`;
      for (let c = 0; c < cols; c++) {
        html += `<td style="padding:12px;"><div style="height:14px; background:var(--surface-2, rgba(255,255,255,0.06)); border-radius:4px; opacity:0.5;"></div></td>`;
      }
      html += `</tr>`;
    }
    return html;
  }

  function sanitizeLockedModulePreview(container, tabId) {
    if (!container || !tabId) return;
    const config = MODULE_DYNAMIC_SELECTORS[tabId];
    if (!config) return;

    // 1. Substituir listas por skeletons neutros
    if (Array.isArray(config.lists)) {
      config.lists.forEach(sel => {
        const el = container.querySelector(sel);
        if (el) {
          if (config.listType === 'cards') {
            el.innerHTML = createSkeletonCardHtml(2, '90px');
          } else {
            el.innerHTML = createSkeletonRowHtml(3, '44px');
          }
        }
      });
    }

    // 2. Substituir tabelas por linhas skeleton neutras
    if (Array.isArray(config.tables)) {
      config.tables.forEach(t => {
        const tbody = container.querySelector(t.selector);
        if (tbody) {
          tbody.innerHTML = createSkeletonTableRowsHtml(t.cols || 6, t.rows || 2);
        }
      });
    }

    // 3. Limpar gráficos e seções de insights
    if (Array.isArray(config.charts)) {
      config.charts.forEach(sel => {
        const chart = container.querySelector(sel);
        if (chart) {
          chart.innerHTML = '';
        }
      });
    }

    // 4. Resetar totais e badges para placeholders neutros
    if (Array.isArray(config.totals)) {
      config.totals.forEach(sel => {
        const tot = container.querySelector(sel);
        if (tot) {
          if (sel.includes('SummaryText')) {
            tot.textContent = sel.includes('Avg') ? 'Média: R$ 0,00' : 'Total: R$ 0,00';
          } else if (sel.includes('CountBadge')) {
            tot.textContent = '0 cenários';
          } else {
            tot.textContent = 'R$ 0,00';
          }
        }
      });
    }

    // 5. Resetar contêineres de métricas
    if (Array.isArray(config.metricContainers)) {
      config.metricContainers.forEach(sel => {
        const mWrap = container.querySelector(sel);
        if (mWrap) {
          const subSelectors = ['.metric-val', '.metric-value', '.metric-num', '.stat-value', '.num', 'span', 'h3', 'p'];
          subSelectors.forEach(subSel => {
            mWrap.querySelectorAll(subSel).forEach(el => {
              if ((/R\$|\d/.test(el.textContent)) && (!el.children || el.children.length === 0)) {
                el.textContent = 'R$ 0,00';
              }
            });
          });
        }
      });
    }

    // 6. Cleanup customizado por módulo se houver
    if (typeof config.cleanup === 'function') {
      config.cleanup(container);
    }

    // 7. Limpar valores de inputs e formulários dentro do módulo
    container.querySelectorAll('input, textarea').forEach(input => {
      if (input.type === 'text' || input.type === 'search' || input.tagName === 'TEXTAREA') {
        input.value = '';
      }
    });
  }

  function clearLockedModuleSkeletons(container, tabId) {
    if (!container || !tabId) return;
    const config = MODULE_DYNAMIC_SELECTORS[tabId];
    if (!config) return;

    if (Array.isArray(config.lists)) {
      config.lists.forEach(sel => {
        const el = container.querySelector(sel);
        if (el) {
          const skeletons = el.querySelectorAll('.module-locked-skeleton-row, .module-locked-skeleton-card');
          if (skeletons && skeletons.length > 0) {
            el.innerHTML = '';
          }
        }
      });
    }

    if (Array.isArray(config.tables)) {
      config.tables.forEach(t => {
        const tbody = container.querySelector(t.selector);
        if (tbody) {
          const skeletons = tbody.querySelectorAll('.module-locked-skeleton-tr');
          if (skeletons && skeletons.length > 0) {
            tbody.innerHTML = '';
          }
        }
      });
    }

    const placeholder = container.querySelector('.module-locked-placeholder-text');
    if (placeholder) {
      placeholder.remove();
    }
  }

  function ensureModulePreviewShell(container, tabId) {
    if (!container) return;
    const nonOverlayChildren = Array.from(container.children).filter(c =>
      !c.classList || (!c.classList.contains('access-denied-screen-overlay') && !c.classList.contains('maintenance-screen-overlay'))
    );
    if (nonOverlayChildren.length > 0) return;

    if (tabId === 'tab-shopping') {
      const shell = document.createElement('div');
      shell.className = 'module-preview-structural-shell';
      shell.innerHTML = `
        <div class="module-header">
          <div>
            <h2 style="font-size:1.4rem; font-weight:800; margin:0;">Lista de Compras</h2>
            <p style="margin:2px 0 0; color:var(--muted); font-size:.84rem; font-weight:600;">Planejamento e controle de itens de compras com comparativo de preços e categorias.</p>
          </div>
          <div class="toolbar-group">
            <button type="button" class="btn primary small pill">+ Nova Lista</button>
          </div>
        </div>
        <div class="card section-card full-width" style="padding:16px 20px; margin-bottom:20px; border-radius:14px;">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <input type="text" placeholder="Ex: Compras do Mês, Supermercado..." disabled style="flex:1; min-width:200px; padding:10px 14px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text);">
            <button type="button" class="btn primary" disabled style="border-radius:10px; font-weight:800;">+ Criar Nova Lista</button>
          </div>
        </div>
        <div class="sections-grid">
          <div class="card" style="padding:24px; text-align:center; color:var(--muted); border-radius:14px;">
            <p style="margin:0; font-weight:600;">Suas listas de compras organizadas por categoria e status de aquisição.</p>
          </div>
        </div>
      `;
      container.insertBefore(shell, container.firstChild);
    }
  }

  function checkModuleAccess(tabId) {
    if (!tabId || tabId === 'tab-profile') {
      return { allowed: true, reason: null };
    }
    const container = $(`#${tabId}`);
    if (!container) return { allowed: true, reason: null };

    const access = getModuleCommercialAccess(tabId);
    let accessOverlay = container.querySelector('.access-denied-screen-overlay');

    if (!access.effectiveAllowed) {
      const moduleName = titleMap[tabId] || (typeof TAB_TITLES !== 'undefined' && TAB_TITLES[tabId]) || 'Módulo';
      const isPlanDenied = (access.planAllowed === false);
      const safeModuleName = typeof escapeHtml === 'function' ? escapeHtml(moduleName) : String(moduleName || '').replace(/[&<>"']/g, '');

      if (isPlanDenied) {
        // 1. Sanitização obrigatória de dados financeiros previamente renderizados no DOM
        sanitizeLockedModulePreview(container, tabId);

        // 2. Experiência de Preview Seguro (PLAN_DENIED)
        container.classList.add('tab-content--plan-locked');

        ensureModulePreviewShell(container, tabId);

        // Filhos reais permanecem no DOM como preview visual de fundo, mas totalmente inertes e inacessíveis
        Array.from(container.children).forEach(child => {
          if (child !== accessOverlay && (!child.classList || !child.classList.contains('maintenance-screen-overlay'))) {
            child.removeAttribute('data-access-hidden');
            child.style.display = '';
            child.setAttribute('aria-hidden', 'true');
            child.setAttribute('inert', '');
            child.inert = true;
            if (child.classList && !child.classList.contains('module-locked-preview-inert')) {
              child.classList.add('module-locked-preview-inert');
            }
          }
        });

        if (!accessOverlay) {
          accessOverlay = document.createElement('div');
          accessOverlay.className = 'access-denied-screen-overlay plan-denied module-locked-overlay';
          container.appendChild(accessOverlay);
        } else {
          accessOverlay.style.display = 'flex';
          accessOverlay.className = 'access-denied-screen-overlay plan-denied module-locked-overlay';
        }

        accessOverlay.innerHTML = `
          <div class="module-locked-card" role="region" aria-labelledby="lockedCardTitle" aria-describedby="lockedCardDesc">
            <div class="module-locked-icon-wrap" aria-hidden="true">
              <svg class="svg-icon svg-locked-hero" viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <div class="module-locked-eyebrow">Plano CorvFin</div>
            <h2 id="lockedCardTitle" class="module-locked-title">Este recurso não está disponível no seu plano.</h2>
            <p id="lockedCardDesc" class="module-locked-desc">
              O recurso <strong>${safeModuleName}</strong> está disponível em outros planos. Faça upgrade para desbloquear ${safeModuleName} e aproveitar mais recursos do CorvFin.
            </p>
            <div class="module-locked-actions">
              <button type="button" class="btn primary btn-open-commercial-plans" id="btnAccessDeniedUpgrade">
                Ver Planos
              </button>
            </div>
          </div>
        `;

        const upgradeBtn = accessOverlay.querySelector('#btnAccessDeniedUpgrade');
        upgradeBtn?.addEventListener('click', () => {
          if (typeof window.openCommercialPlansModal === 'function') {
            window.openCommercialPlansModal();
          }
        });

        if (upgradeBtn && typeof upgradeBtn.focus === 'function') {
          try { upgradeBtn.focus({ preventScroll: true }); } catch (_) {}
        }
      } else {
        // 2. Experiência de Acesso Restrito Neutro (RBAC_DENIED)
        container.classList.remove('tab-content--plan-locked');

        Array.from(container.children).forEach(child => {
          if (child !== accessOverlay && (!child.classList || !child.classList.contains('maintenance-screen-overlay'))) {
            child.setAttribute('data-access-hidden', 'true');
            child.style.display = 'none';
            child.removeAttribute('aria-hidden');
            child.removeAttribute('inert');
            child.inert = false;
            if (child.classList) child.classList.remove('module-locked-preview-inert');
          }
        });

        if (!accessOverlay) {
          accessOverlay = document.createElement('div');
          accessOverlay.className = 'access-denied-screen-overlay rbac-denied';
          container.appendChild(accessOverlay);
        } else {
          accessOverlay.style.display = 'block';
          accessOverlay.className = 'access-denied-screen-overlay rbac-denied';
        }

        accessOverlay.innerHTML = `
          <div class="card section-card full-width" style="padding:48px 24px; margin:20px 0; border-radius:14px; text-align:center; background:var(--surface);">
            <div style="width:64px; height:64px; border-radius:50%; background:rgba(239, 68, 68, 0.12); display:inline-flex; align-items:center; justify-content:center; margin-bottom:16px;">
              <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--danger, #ef4444); width:32px; height:32px; stroke-width:2.2;">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <div style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); margin-bottom:8px;">Acesso Restrito</div>
            <h2 style="font-size:1.4rem; font-weight:800; color:var(--text); margin:0 0 8px;">Seu acesso a este recurso está restrito.</h2>
            <p style="font-size:0.92rem; color:var(--muted); max-width:440px; margin:0 auto 24px; line-height:1.5;">
              Você não tem permissão para acessar o módulo <strong>${safeModuleName}</strong>.
            </p>
          </div>
        `;
      }

      return { allowed: false, reason: isPlanDenied ? 'PLAN_DENIED' : 'RBAC_DENIED', access };
    } else {
      const wasLocked = container.classList.contains('tab-content--plan-locked');
      if (accessOverlay) {
        accessOverlay.style.display = 'none';
      }
      container.classList.remove('tab-content--plan-locked');
      if (container && container.children) {
        Array.from(container.children).forEach(child => {
          if (child !== accessOverlay && (!child.classList || !child.classList.contains('maintenance-screen-overlay'))) {
            if (typeof child.getAttribute === 'function' && child.getAttribute('data-access-hidden') === 'true') {
              child.removeAttribute('data-access-hidden');
              child.style.display = '';
            }
            child.removeAttribute('aria-hidden');
            child.removeAttribute('inert');
            child.inert = false;
            if (child.classList) child.classList.remove('module-locked-preview-inert');
          }
        });
      }

      // Se o módulo estava previamente bloqueado por plano e voltou a ser permitido,
      // limpar skeletons e acionar a reconstrução normal de dados
      if (wasLocked) {
        clearLockedModuleSkeletons(container, tabId);
        if (!container.hidden && typeof window.renderTabContent === 'function') {
          try {
            window.renderTabContent(tabId);
          } catch (_) {}
        }
      }

      return { allowed: true, reason: null, access };
    }
  }

  function updateSidebarCommercialBadges() {
    let localUser = {};
    try {
      if (typeof localStorage !== 'undefined') {
        localUser = JSON.parse(localStorage.getItem('user_data') || localStorage.getItem('user') || '{}');
      }
    } catch (_) {}
    const user = (window.API && typeof API.getUser === 'function') ? API.getUser() : localUser;

    // 1. Sidebar desktop
    document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
      const tabId = link.getAttribute('data-tab');
      if (!tabId || tabId === 'tab-profile') return;

      const access = getModuleCommercialAccess(tabId, user);
      const isPlanLocked = (access.planAllowed === false && access.permissionAllowed === true);

      let badge = link.querySelector('.sidebar-plan-lock-badge');

      if (isPlanLocked) {
        link.classList.add('sidebar-link--plan-locked');
        if (link.style.display === 'none') {
          link.style.display = '';
        }
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'sidebar-plan-lock-badge';
          badge.setAttribute('title', 'Não disponível no seu plano atual');
          badge.setAttribute('aria-label', 'Não disponível no seu plano atual');
          badge.innerHTML = `
            <svg class="svg-icon svg-lock" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          `;
          link.appendChild(badge);
        } else {
          badge.style.display = 'inline-flex';
        }
      } else {
        link.classList.remove('sidebar-link--plan-locked');
        if (badge) {
          badge.style.display = 'none';
        }
      }
    });

    // 2. Barra inferior e drawer mobile
    document.querySelectorAll('.bottom-nav-item[data-tab], .mobile-drawer-card[data-tab]').forEach(link => {
      const tabId = link.getAttribute('data-tab');
      if (!tabId || tabId === 'tab-profile') return;

      const access = getModuleCommercialAccess(tabId, user);
      const isPlanLocked = (access.planAllowed === false && access.permissionAllowed === true);

      let badge = link.querySelector('.nav-plan-lock-badge') || link.querySelector('.sidebar-plan-lock-badge');

      if (isPlanLocked) {
        link.classList.add('nav-item--plan-locked');
        if (link.classList.contains('mobile-drawer-card') && link.style.display === 'none') {
          link.style.display = '';
        }
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'nav-plan-lock-badge';
          badge.setAttribute('title', 'Não disponível no seu plano atual');
          badge.setAttribute('aria-label', 'Não disponível no seu plano atual');
          badge.innerHTML = `
            <svg class="svg-icon svg-lock" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          `;
          link.appendChild(badge);
        } else {
          badge.style.display = 'inline-flex';
        }
      } else {
        link.classList.remove('nav-item--plan-locked');
        if (badge) {
          badge.style.display = 'none';
        }
      }
    });
  }

  async function loadCommercialContext(options = {}) {
    try {
      if (typeof API !== 'undefined' && API.getCommercialContext) {
        const forceRefresh = Boolean(options && (options.forceRefresh || options.refresh));
        const res = await API.getCommercialContext({ forceRefresh });
        if (res && res.success) {
          const data = (res.data && res.data.plan) ? res.data : (res.plan ? res : res.data);
          window._cachedCommercialContext = data;
          updateSidebarCommercialBadges();
          const activeTab = document.querySelector('.tab-content:not([hidden])')?.id;
          if (activeTab && typeof checkModuleAccess === 'function') {
            checkModuleAccess(activeTab);
          }
        }
      }
    } catch (err) {
      console.warn('Falha ao carregar contexto comercial:', err);
    }
  }

  window.getModuleCommercialAccess = getModuleCommercialAccess;
  window.checkModuleAccess = checkModuleAccess;
  window.sanitizeLockedModulePreview = sanitizeLockedModulePreview;
  window.clearLockedModuleSkeletons = clearLockedModuleSkeletons;
  window.loadCommercialContext = loadCommercialContext;
  window.updateSidebarCommercialBadges = updateSidebarCommercialBadges;
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
    if (typeof renderMobileBottomNav === 'function') {
      renderMobileBottomNav();
    }
    updateSidebarCommercialBadges();
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
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="16" y1="14" x2="16" y2="18" /><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01" /></svg>'
    }
  ];
  window.MOBILE_MODULE_CONFIG = MOBILE_MODULE_CONFIG;

  const ALL_DRAWER_MODULE_CONFIG = [
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
      tabId: 'tab-extras',
      key: 'extras',
      label: 'Rendas Extras',
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></svg>'
    },
    {
      tabId: 'tab-debtors',
      key: 'devedores',
      label: 'Devedores',
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>'
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
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="16" y1="14" x2="16" y2="18" /><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01" /></svg>'
    },
    {
      tabId: 'tab-profile',
      key: null,
      label: 'Perfil',
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>'
    },
    {
      tabId: 'tab-admin',
      key: 'configuracoes',
      label: 'Configurações / Usuários',
      fullWidth: true,
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>'
    }
  ];
  window.ALL_DRAWER_MODULE_CONFIG = ALL_DRAWER_MODULE_CONFIG;

  function normalizeTabId(item) {
    if (!item) return null;
    if (typeof item === 'string' && item.startsWith('tab-')) return item;
    const found = ALL_DRAWER_MODULE_CONFIG.find(m => m.key === item || m.tabId === 'tab-' + item);
    return found ? found.tabId : 'tab-' + item;
  }
  window.normalizeTabId = normalizeTabId;

  function activateTab(tabId, updateUrl = true) {
    let targetTabId = tabId || DEFAULT_TAB;

    const accessCheck = (typeof checkModuleAccess === 'function')
      ? checkModuleAccess(targetTabId)
      : { allowed: true };

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
    const showRibbon = accessCheck.allowed && TABS_WITH_MONTH_RIBBON.includes(targetTabId);
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
    if (titleEl) titleEl.textContent = titleMap[targetTabId] || (typeof TAB_TITLES !== 'undefined' && TAB_TITLES[targetTabId]) || 'CorvFin';
    if (subEl && subMap[targetTabId]) subEl.textContent = subMap[targetTabId];

    if (accessCheck.allowed) {
      if (targetTabId === 'tab-dashboard' && typeof window.renderConsolidatedDashboardTab === 'function') {
        window.renderConsolidatedDashboardTab();
      } else if (targetTabId === 'tab-profile') {
        if (typeof window.renderProfile === 'function') {
          window.renderProfile();
        } else if (typeof window.renderProfilePlanCard === 'function') {
          window.renderProfilePlanCard();
        }
      } else if (targetTabId === 'tab-simulation' && typeof window.renderSimulationTab === 'function') {
        window.renderSimulationTab();
      }
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

    let localUser = {};
    try {
      if (typeof localStorage !== 'undefined') {
        localUser = JSON.parse(localStorage.getItem('user_data') || localStorage.getItem('user') || '{}');
      }
    } catch (_) {}

    const user = (typeof API !== 'undefined' && API.getUser)
      ? API.getUser()
      : localUser;

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

    // Carrega o contexto comercial de forma assíncrona no boot
    loadCommercialContext();
  }

  function openQuickActionSheet() {
    const quickOverlay = document.getElementById('mobileQuickActionOverlay') || $('#mobileQuickActionOverlay');
    if (!quickOverlay) return;

    // Aplica RBAC e manutenção nos itens de cadastro rápido
    const btnFastExp = document.getElementById('quickActionFastExpense') || $('#quickActionFastExpense');
    const btnWizExp = document.getElementById('quickActionWizardExpense') || $('#quickActionWizardExpense');
    const btnExpLegacy = document.getElementById('quickActionNewExpense') || $('#quickActionNewExpense');
    const btnDeb = document.getElementById('quickActionNewDebtor') || $('#quickActionNewDebtor');
    const btnExt = document.getElementById('quickActionNewExtra') || $('#quickActionNewExtra');
    const btnBen = document.getElementById('quickActionNewBenefit') || $('#quickActionNewBenefit');

    const expAllowed = hasTabPermission('tab-expenses') && !isModuleInMaintenance('tab-expenses');
    if (btnFastExp) btnFastExp.style.display = expAllowed ? 'flex' : 'none';
    if (btnWizExp) btnWizExp.style.display = expAllowed ? 'flex' : 'none';
    if (btnExpLegacy) btnExpLegacy.style.display = expAllowed ? 'flex' : 'none';

    if (btnDeb) {
      const allowed = hasTabPermission('tab-debtors') && !isModuleInMaintenance('tab-debtors');
      btnDeb.style.display = allowed ? 'flex' : 'none';
    }
    if (btnExt) {
      const allowed = hasTabPermission('tab-extras') && !isModuleInMaintenance('tab-extras');
      btnExt.style.display = allowed ? 'flex' : 'none';
    }
    if (btnBen) {
      const allowed = hasTabPermission('tab-benefits') && !isModuleInMaintenance('tab-benefits');
      btnBen.style.display = allowed ? 'flex' : 'none';
    }

    quickOverlay.classList.add('open');
  }
  window.openQuickActionSheet = openQuickActionSheet;

  function handleQuickActionItemClick(actionId) {
    const quickOverlay = document.getElementById('mobileQuickActionOverlay') || $('#mobileQuickActionOverlay');
    if (quickOverlay) quickOverlay.classList.remove('open');

    if (actionId === 'quickActionFastExpense') {
      if (typeof window.openQuickExpenseDialog === 'function') {
        window.openQuickExpenseDialog();
      } else if (typeof activateTab === 'function') {
        activateTab('tab-expenses', true);
      }
    } else if (actionId === 'quickActionNewExpense' || actionId === 'quickActionWizardExpense') {
      if (typeof window.openEntryDialog === 'function') {
        window.openEntryDialog({ mode: 'new', type: 'cash' });
      } else {
        const addBtn = document.getElementById('expensesAddBtn');
        if (addBtn) addBtn.click();
        else if (typeof activateTab === 'function') activateTab('tab-expenses', true);
      }
    } else if (actionId === 'quickActionNewDebtor') {
      if (typeof window.openDebtorDialog === 'function') {
        window.openDebtorDialog('new');
      } else if (typeof activateTab === 'function') {
        activateTab('tab-debtors', true);
      }
    } else if (actionId === 'quickActionNewExtra') {
      if (typeof window.openExtraDialog === 'function') {
        window.openExtraDialog('new');
      } else if (typeof activateTab === 'function') {
        activateTab('tab-extras', true);
      }
    } else if (actionId === 'quickActionNewBenefit') {
      if (typeof window.openBenefitDialog === 'function') {
        window.openBenefitDialog('new');
      } else if (typeof activateTab === 'function') {
        activateTab('tab-benefits', true);
      }
    }
  }
  window.handleQuickActionItemClick = handleQuickActionItemClick;

  function initQuickActionListeners() {
    const quickOverlay = document.getElementById('mobileQuickActionOverlay') || $('#mobileQuickActionOverlay');
    const closeBtn = document.getElementById('closeMobileQuickActionBtn') || $('#closeMobileQuickActionBtn');

    if (closeBtn && quickOverlay) {
      closeBtn.onclick = () => {
        quickOverlay.classList.remove('open');
      };
    }

    if (quickOverlay) {
      quickOverlay.onclick = (e) => {
        if (e.target === quickOverlay) {
          quickOverlay.classList.remove('open');
        }
      };
    }

    // Ação 1: Despesa Rápida (4 campos mínimos)
    const btnFastExp = document.getElementById('quickActionFastExpense') || $('#quickActionFastExpense');
    if (btnFastExp) {
      btnFastExp.onclick = (e) => {
        e.preventDefault();
        handleQuickActionItemClick('quickActionFastExpense');
      };
    }

    // Ação 2: Despesa Completa (Wizard Completo - idêntico ao botão + Novo Lançamento)
    const btnWizExp = document.getElementById('quickActionWizardExpense') || $('#quickActionWizardExpense');
    if (btnWizExp) {
      btnWizExp.onclick = (e) => {
        e.preventDefault();
        handleQuickActionItemClick('quickActionWizardExpense');
      };
    }

    const btnExpLegacy = document.getElementById('quickActionNewExpense') || $('#quickActionNewExpense');
    if (btnExpLegacy) {
      btnExpLegacy.onclick = (e) => {
        e.preventDefault();
        handleQuickActionItemClick('quickActionNewExpense');
      };
    }

    // Ação 3: Novo Devedor
    const btnDeb = document.getElementById('quickActionNewDebtor') || $('#quickActionNewDebtor');
    if (btnDeb) {
      btnDeb.onclick = (e) => {
        e.preventDefault();
        handleQuickActionItemClick('quickActionNewDebtor');
      };
    }

    // Ação 4: Nova Renda Extra
    const btnExt = document.getElementById('quickActionNewExtra') || $('#quickActionNewExtra');
    if (btnExt) {
      btnExt.onclick = (e) => {
        e.preventDefault();
        handleQuickActionItemClick('quickActionNewExtra');
      };
    }

    // Ação 5: Novo Benefício
    const btnBen = document.getElementById('quickActionNewBenefit') || $('#quickActionNewBenefit');
    if (btnBen) {
      btnBen.onclick = (e) => {
        e.preventDefault();
        handleQuickActionItemClick('quickActionNewBenefit');
      };
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

    const fav1 = validFavs[0] ? (MOBILE_MODULE_CONFIG.find(m => m.tabId === validFavs[0]) || ALL_DRAWER_MODULE_CONFIG.find(m => m.tabId === validFavs[0])) : null;
    const fav2 = validFavs[1] ? (MOBILE_MODULE_CONFIG.find(m => m.tabId === validFavs[1]) || ALL_DRAWER_MODULE_CONFIG.find(m => m.tabId === validFavs[1])) : null;
    const fav3 = validFavs[2] ? (MOBILE_MODULE_CONFIG.find(m => m.tabId === validFavs[2]) || ALL_DRAWER_MODULE_CONFIG.find(m => m.tabId === validFavs[2])) : null;

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
    const activeFavTabIds = [fav1?.tabId, fav2?.tabId, fav3?.tabId].filter(Boolean);
    const isSecondaryTab = !activeFavTabIds.includes(activeTab);
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

    // Renderiza dinamicamente os demais módulos permitidos dentro do menu "Mais" (sem omitir nenhum)
    renderMobileDrawerGrid(activeFavTabIds);

    updateSidebarMaintenanceBadges();
    updateSidebarCommercialBadges();
  }
  window.renderMobileBottomNav = renderMobileBottomNav;

  function renderMobileDrawerGrid(favTabIds = []) {
    const drawerGrid = document.querySelector('.mobile-drawer-grid');
    if (!drawerGrid) return;

    const normalizedFavs = Array.isArray(favTabIds) ? favTabIds.map(normalizeTabId) : [];

    const moreModules = ALL_DRAWER_MODULE_CONFIG.filter(m => {
      if (m.tabId === 'tab-admin') {
        const user = (window.API && typeof API.getUser === 'function') ? API.getUser() : null;
        return (user && user.is_admin) && !normalizedFavs.includes(m.tabId);
      }
      return hasTabPermission(m.tabId) && !isModuleInMaintenance(m.tabId) && !normalizedFavs.includes(m.tabId);
    });

    drawerGrid.innerHTML = moreModules.map(m => {
      const fullStyle = m.fullWidth ? 'style="grid-column:1 / -1;"' : '';
      const idAttr = m.tabId === 'tab-admin' ? 'id="mobileDrawerAdminLink"' : '';
      return `
        <button type="button" class="mobile-drawer-card" data-tab="${m.tabId}" ${idAttr} ${fullStyle}>
          ${m.iconSvg}
          <span>${m.label}</span>
        </button>
      `;
    }).join('');

    const drawerOverlay = document.getElementById('mobileDrawerOverlay') || (typeof $ === 'function' ? $('#mobileDrawerOverlay') : null);
    drawerGrid.querySelectorAll('.mobile-drawer-card[data-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = btn.getAttribute('data-tab');
        if (tabId && typeof activateTab === 'function') {
          activateTab(tabId, true);
          if (drawerOverlay && drawerOverlay.classList) {
            drawerOverlay.classList.remove('open');
          }
        }
      });
    });
  }
  window.renderMobileDrawerGrid = renderMobileDrawerGrid;

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

  function calculateTooltipPosition(target, rect, tipRect, windowWidth = (typeof window !== 'undefined' ? window.innerWidth : 1280), windowHeight = (typeof window !== 'undefined' ? window.innerHeight : 800)) {
    const MARGIN = 8;
    const explicitPos = target?.getAttribute ? target.getAttribute('data-tooltip-position') : null;
    const isSidebar = Boolean(target?.closest && target.closest('.sidebar, .sidebar-nav, .sidebar-footer-nav, .sidebar-header, .sidebar-brand'));
    const preferredPos = explicitPos || (isSidebar ? 'right' : 'top');

    let left = 0;
    let top = 0;
    let actualPos = preferredPos;

    if (preferredPos === 'right') {
      left = rect.right + MARGIN;
      top = rect.top + (rect.height / 2) - (tipRect.height / 2);

      if (left + tipRect.width > windowWidth - MARGIN) {
        if (rect.left - tipRect.width - MARGIN >= MARGIN) {
          left = rect.left - tipRect.width - MARGIN;
          actualPos = 'left';
        } else {
          left = Math.max(MARGIN, windowWidth - tipRect.width - MARGIN);
        }
      }

      if (top + tipRect.height > windowHeight - MARGIN) {
        top = Math.max(MARGIN, windowHeight - tipRect.height - MARGIN);
      }
      if (top < MARGIN) {
        top = MARGIN;
      }
    } else if (preferredPos === 'left') {
      left = rect.left - tipRect.width - MARGIN;
      top = rect.top + (rect.height / 2) - (tipRect.height / 2);

      if (left < MARGIN) {
        if (rect.right + tipRect.width + MARGIN <= windowWidth - MARGIN) {
          left = rect.right + MARGIN;
          actualPos = 'right';
        } else {
          left = MARGIN;
        }
      }

      if (top + tipRect.height > windowHeight - MARGIN) {
        top = Math.max(MARGIN, windowHeight - tipRect.height - MARGIN);
      }
      if (top < MARGIN) {
        top = MARGIN;
      }
    } else if (preferredPos === 'bottom') {
      top = rect.bottom + MARGIN;
      left = rect.left + (rect.width / 2) - (tipRect.width / 2);

      if (top + tipRect.height > windowHeight - MARGIN) {
        if (rect.top - tipRect.height - MARGIN >= MARGIN) {
          top = rect.top - tipRect.height - MARGIN;
          actualPos = 'top';
        } else {
          top = Math.max(MARGIN, windowHeight - tipRect.height - MARGIN);
        }
      }

      left = Math.max(MARGIN, Math.min(left, windowWidth - tipRect.width - MARGIN));
    } else {
      // 'top' (default)
      const hasSpaceAbove = (rect.top - tipRect.height - MARGIN) >= MARGIN;
      top = hasSpaceAbove ? (rect.top - tipRect.height - MARGIN) : (rect.bottom + MARGIN);
      actualPos = hasSpaceAbove ? 'top' : 'bottom';

      if (top + tipRect.height > windowHeight - MARGIN) {
        top = Math.max(MARGIN, windowHeight - tipRect.height - MARGIN);
      }
      if (top < MARGIN) {
        top = MARGIN;
      }

      left = rect.left + (rect.width / 2) - (tipRect.width / 2);
      left = Math.max(MARGIN, Math.min(left, windowWidth - tipRect.width - MARGIN));
    }

    return {
      left: Math.round(left),
      top: Math.round(top),
      position: actualPos,
      preferredPosition: preferredPos
    };
  }
  window.calculateTooltipPosition = calculateTooltipPosition;

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
      const pos = calculateTooltipPosition(activeTarget, rect, tipRect, window.innerWidth, window.innerHeight);

      tooltipEl.setAttribute('data-position', pos.position);
      tooltipEl.style.transform = `translate3d(${pos.left}px, ${pos.top}px, 0)`;
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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && activeTarget && tooltipEl.classList.contains('show')) {
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
      function registerServiceWorker() {
        const swUrl = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/sw.js') : 'sw.js';
        const swScope = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/') : './';
        navigator.serviceWorker.register(swUrl, { scope: swScope }).catch(err => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
      }

      if (document.readyState === 'complete') {
        registerServiceWorker();
      } else {
        window.addEventListener('load', registerServiceWorker, { once: true });
      }
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
  window.calculateTooltipPosition = calculateTooltipPosition;
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
    updateSidebarCommercialBadges,
    sanitizeLockedModulePreview,
    clearLockedModuleSkeletons,
    isModuleInMaintenance,
    initGlobalTooltips,
    calculateTooltipPosition,
    initPwaSupport
  };

})();
