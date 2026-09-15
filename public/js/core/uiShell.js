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
    '/calendario': 'tab-calendar',
    '/calendar': 'tab-calendar',
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
    'tab-calendar': '/calendario',
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
    'tab-calendar': 'Calendário',
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
    'tab-calendar': 'Visão cronológica e projeção financeira mensal',
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
    'tab-calendar': 'calendario',
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
    'tab-calendar',
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
      charts: ['#extrasOriginChartContainer'],
      totals: ['#sumExtra', '#extrasOriginTotalBadge'],
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

  function sanitizeLockedModuleContent(container, tabId) {
    if (!container || !tabId) return;
    const config = MODULE_DYNAMIC_SELECTORS[tabId];
    if (config) {
      // 1. Limpar listas dinâmicas
      if (Array.isArray(config.lists)) {
        config.lists.forEach(sel => {
          const el = container.querySelector(sel);
          if (el) {
            el.innerHTML = '';
          }
        });
      }

      // 2. Limpar tabelas
      if (Array.isArray(config.tables)) {
        config.tables.forEach(t => {
          const tbody = container.querySelector(t.selector);
          if (tbody) {
            tbody.innerHTML = '';
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
    }

    // 7. Limpar valores de inputs e formulários dentro do módulo
    container.querySelectorAll('input, textarea').forEach(input => {
      if (input.type === 'text' || input.type === 'search' || input.tagName === 'TEXTAREA') {
        input.value = '';
      }
    });

    // 8. Ocultar seções operacionais, filtros e formulários internos (preservando eventual header)
    Array.from(container.children).forEach(child => {
      if (!child.classList || (!child.classList.contains('module-contextual-upgrade-view') && !child.classList.contains('access-denied-screen-overlay') && !child.classList.contains('module-header'))) {
        child.setAttribute('data-plan-denied-hidden', 'true');
        child.style.display = 'none';
        child.setAttribute('aria-hidden', 'true');
        child.setAttribute('inert', '');
        child.inert = true;
      }
    });

    // Se houver .module-header existente, oculta seus botões e toolbar
    const existingHeader = container.querySelector('.module-header');
    if (existingHeader) {
      existingHeader.querySelectorAll('.toolbar-group, button, .subtabs-nav').forEach(el => {
        el.setAttribute('data-plan-denied-hidden', 'true');
        el.style.display = 'none';
      });
    }
  }

  // Alias retrocompatível
  const sanitizeLockedModulePreview = sanitizeLockedModuleContent;

  function clearLockedModuleSkeletons(container, tabId) {
    if (!container) return;
    const placeholder = container.querySelector('.module-locked-placeholder-text');
    if (placeholder) {
      placeholder.remove();
    }
  }

  function escapeHtmlSafe(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let contextualRequestTokenSeq = 0;

  async function renderContextualUpgradePage(container, tabId, user, access) {
    if (!container || !tabId) return;

    const moduleName = titleMap[tabId] || (typeof TAB_TITLES !== 'undefined' && TAB_TITLES[tabId]) || 'Módulo';
    const moduleSub = subMap[tabId] || '';
    const safeModuleName = escapeHtmlSafe(moduleName);

    // Resolve nome do plano atual (se disponível no commercial-context em cache)
    let currentPlanName = '';
    let currentPlanId = null;
    let isLegacyCurrentPlan = false;
    let cachedCtx = (typeof window !== 'undefined' && window._cachedCommercialContext) ? window._cachedCommercialContext : null;
    if (!cachedCtx && typeof window !== 'undefined' && typeof window.fetchCommercialContext === 'function') {
      try { cachedCtx = await window.fetchCommercialContext(false); } catch (_) {}
    }
    if (cachedCtx && cachedCtx.plan) {
      currentPlanName = cachedCtx.plan.name || '';
      currentPlanId = cachedCtx.plan.id || cachedCtx.plan.slug;
      isLegacyCurrentPlan = (cachedCtx.plan.status === 'inactive' || cachedCtx.plan.status === 'archived');
    }

    // 1. Sanitização estrita do conteúdo prévio
    sanitizeLockedModuleContent(container, tabId);

    // 2. Garante contêiner contextual
    let contextualWrap = container.querySelector('.module-contextual-upgrade-view');
    if (!contextualWrap) {
      contextualWrap = document.createElement('div');
      contextualWrap.className = 'module-contextual-upgrade-view';
      container.appendChild(contextualWrap);
    } else {
      contextualWrap.style.display = 'flex';
    }

    // Se o container NÃO possuir .module-header no DOM, renderiza header contextual
    const existingHeader = container.querySelector('.module-header');
    const headerHtml = !existingHeader ? `
      <div class="module-contextual-header">
        <h2 class="module-contextual-title">${safeModuleName}</h2>
        ${moduleSub ? `<p class="module-contextual-sub">${escapeHtmlSafe(moduleSub)}</p>` : ''}
      </div>
    ` : '';

    const noticeDesc = currentPlanName
      ? `Seu plano atual, <strong>${escapeHtmlSafe(currentPlanName)}</strong>, não inclui ${safeModuleName}. Este recurso está disponível nos planos abaixo.`
      : `Seu plano atual não inclui ${safeModuleName}. Este recurso está disponível nos planos abaixo.`;

    const wrapId = `ctx_${tabId}_${Date.now()}`;
    contextualWrap.innerHTML = `
      ${headerHtml}
      <div class="module-contextual-notice" role="region" aria-label="Aviso de recurso bloqueado">
        <div class="contextual-notice-icon" aria-hidden="true">
          <svg class="svg-icon svg-lock" viewBox="0 0 24 24" style="width:22px;height:22px;stroke:currentColor;stroke-width:2.2;fill:none;">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <div class="contextual-notice-content">
          <div class="contextual-notice-title">Recurso não disponível no seu plano</div>
          <p class="contextual-notice-desc">${noticeDesc}</p>
        </div>
      </div>

      <div class="contextual-plans-section">
        <div class="contextual-plans-header">
          <div class="contextual-plans-title-wrap">
            <h3 class="contextual-plans-title">Planos que incluem ${safeModuleName}</h3>
          </div>
          <div class="plans-billing-toggle contextual-billing-toggle" role="group" aria-label="Ciclo de cobrança">
            <button type="button" class="plans-toggle-btn btn-interval-toggle btn-ctx-monthly active" aria-pressed="true">Mensal</button>
            <button type="button" class="plans-toggle-btn btn-interval-toggle btn-ctx-yearly" aria-pressed="false">
              Anual <span class="plans-toggle-discount-badge contextual-savings-badge" style="display:none;"></span>
            </button>
          </div>
        </div>

        <div class="contextual-carousel-wrapper">
          <div class="contextual-carousel-viewport" id="ctxViewport_${wrapId}">
            <div class="contextual-plans-track plans-carousel-track" id="ctxTrack_${wrapId}">
              <div class="contextual-plans-loading" role="status" aria-live="polite" style="padding:32px 16px; text-align:center; width:100%;">
                <p style="margin:0; font-size:0.90rem; color:var(--muted); font-weight:600;">Carregando planos disponíveis...</p>
              </div>
            </div>
          </div>
          <div class="contextual-carousel-nav" id="ctxNav_${wrapId}" style="display:none;">
            <button type="button" class="btn-carousel-ctrl prev" id="ctxBtnPrev_${wrapId}" aria-label="Plano anterior" disabled>‹</button>
            <button type="button" class="btn-carousel-ctrl next" id="ctxBtnNext_${wrapId}" aria-label="Próximo plano">›</button>
          </div>
        </div>
      </div>
    `;

    const trackEl = contextualWrap.querySelector(`#ctxTrack_${wrapId}`);
    const viewportEl = contextualWrap.querySelector(`#ctxViewport_${wrapId}`);
    const btnPrev = contextualWrap.querySelector(`#ctxBtnPrev_${wrapId}`);
    const btnNext = contextualWrap.querySelector(`#ctxBtnNext_${wrapId}`);
    const navEl = contextualWrap.querySelector(`#ctxNav_${wrapId}`);
    const btnMonthly = contextualWrap.querySelector('.btn-ctx-monthly');
    const btnYearly = contextualWrap.querySelector('.btn-ctx-yearly');
    const savingsBadge = contextualWrap.querySelector('.contextual-savings-badge');

    let contextualInterval = (typeof window !== 'undefined' && typeof window.getActiveInterval === 'function' ? window.getActiveInterval() : 'monthly') || 'monthly';
    if (contextualInterval === 'yearly') {
      btnYearly?.classList.add('active');
      btnYearly?.setAttribute('aria-pressed', 'true');
      btnMonthly?.classList.remove('active');
      btnMonthly?.setAttribute('aria-pressed', 'false');
    } else {
      btnMonthly?.classList.add('active');
      btnMonthly?.setAttribute('aria-pressed', 'true');
      btnYearly?.classList.remove('active');
      btnYearly?.setAttribute('aria-pressed', 'false');
    }

    // Race condition token
    const token = ++contextualRequestTokenSeq;
    container._contextualToken = token;

    async function loadAndRenderPlans() {
      let allPlans = [];
      try {
        if (typeof window !== 'undefined' && typeof window.fetchActivePlans === 'function') {
          allPlans = await window.fetchActivePlans();
        } else if (typeof API !== 'undefined' && typeof API.getActivePlans === 'function') {
          const res = await API.getActivePlans();
          allPlans = Array.isArray(res?.plans) ? res.plans : (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));
        }
      } catch (err) {
        if (container._contextualToken !== token) return;
        if (trackEl) {
          trackEl.innerHTML = `
            <div class="contextual-plans-error" style="text-align:center; padding:32px 16px; width:100%;">
              <p style="margin:0 0 12px; font-size:0.90rem; color:var(--danger, #ef4444); font-weight:600;">Não foi possível carregar os planos no momento.</p>
              <button type="button" class="btn soft small btn-retry-contextual">Tentar novamente</button>
            </div>
          `;
          trackEl.querySelector('.btn-retry-contextual')?.addEventListener('click', () => {
            loadAndRenderPlans();
          });
        }
        return;
      }

      if (container._contextualToken !== token) return;
      if (typeof window !== 'undefined' && window.currentActiveTab && window.currentActiveTab !== tabId) return;

      const resourceKey = TAB_PERMISSION_MAP[tabId];
      const eligiblePlans = (typeof window !== 'undefined' && typeof window.filterPlansByResource === 'function')
        ? window.filterPlansByResource(allPlans, resourceKey)
        : allPlans.filter(p => Array.isArray(p.includedResources) && p.includedResources.includes(resourceKey));

      // Atualiza badge de economia anual
      if (savingsBadge && typeof window !== 'undefined' && typeof window.calculateMaxAnnualSavings === 'function') {
        const maxSavings = window.calculateMaxAnnualSavings(eligiblePlans);
        if (maxSavings > 0) {
          savingsBadge.style.display = 'inline-flex';
          savingsBadge.textContent = `Economize até ${maxSavings}%`;
        } else {
          savingsBadge.style.display = 'none';
        }
      }

      function doRender() {
        if (!trackEl) return;
        if (typeof window !== 'undefined' && typeof window.renderCommercialPlansView === 'function') {
          window.renderCommercialPlansView(trackEl, eligiblePlans, {
            mode: 'contextual',
            resourceKey,
            currentPlanId,
            currentPlanName,
            isLegacyCurrentPlan,
            activeInterval: contextualInterval,
            viewport: viewportEl,
            btnPrev,
            btnNext,
            updateCarousel: false
          });
        }
        updateContextualControls();
      }

      function updateContextualControls() {
        if (!viewportEl || !btnPrev || !btnNext || !navEl) return;
        const scrollWidth = viewportEl.scrollWidth || 0;
        const clientWidth = viewportEl.clientWidth || 0;
        const hasOverflow = scrollWidth > clientWidth + 8;
        if (!hasOverflow || eligiblePlans.length <= 4) {
          navEl.style.display = 'none';
          btnPrev.style.display = 'none';
          btnNext.style.display = 'none';
          return;
        }
        navEl.style.display = 'flex';
        btnPrev.style.display = 'flex';
        btnNext.style.display = 'flex';
        const scrollLeft = viewportEl.scrollLeft || 0;
        btnPrev.disabled = scrollLeft <= 4;
        btnPrev.style.opacity = btnPrev.disabled ? '0.35' : '1';
        btnNext.disabled = (scrollLeft + clientWidth) >= (scrollWidth - 6);
        btnNext.style.opacity = btnNext.disabled ? '0.35' : '1';
      }

      btnMonthly?.addEventListener('click', () => {
        contextualInterval = 'monthly';
        btnMonthly.classList.add('active');
        btnMonthly.setAttribute('aria-pressed', 'true');
        btnYearly?.classList.remove('active');
        btnYearly?.setAttribute('aria-pressed', 'false');
        doRender();
      });

      btnYearly?.addEventListener('click', () => {
        contextualInterval = 'yearly';
        btnYearly.classList.add('active');
        btnYearly.setAttribute('aria-pressed', 'true');
        btnMonthly?.classList.remove('active');
        btnMonthly?.setAttribute('aria-pressed', 'false');
        doRender();
      });

      btnPrev?.addEventListener('click', () => {
        if (typeof viewportEl.scrollBy === 'function') {
          viewportEl.scrollBy({ left: -320, behavior: 'smooth' });
        }
      });

      btnNext?.addEventListener('click', () => {
        if (typeof viewportEl.scrollBy === 'function') {
          viewportEl.scrollBy({ left: 320, behavior: 'smooth' });
        }
      });

      viewportEl?.addEventListener('scroll', updateContextualControls, { passive: true });

      doRender();
    }

    loadAndRenderPlans();
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
        if (accessOverlay) {
          accessOverlay.style.display = 'none';
        }

        container.classList.add('tab-content--plan-locked', 'tab-content--plan-denied');

        renderContextualUpgradePage(container, tabId, null, access);
      } else {
        // RBAC_DENIED (Acesso Restrito Neutro)
        container.classList.remove('tab-content--plan-locked', 'tab-content--plan-denied');
        const contextualView = container.querySelector('.module-contextual-upgrade-view');
        if (contextualView) {
          contextualView.style.display = 'none';
        }

        Array.from(container.children).forEach(child => {
          if (child !== accessOverlay && (!child.classList || !child.classList.contains('maintenance-screen-overlay'))) {
            child.setAttribute('data-access-hidden', 'true');
            child.style.display = 'none';
            child.removeAttribute('aria-hidden');
            child.removeAttribute('inert');
            child.inert = false;
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
      // ALLOWED
      const contextualView = container.querySelector('.module-contextual-upgrade-view');
      if (contextualView) {
        contextualView.style.display = 'none';
        if (typeof contextualView.remove === 'function') {
          contextualView.remove();
        } else if (contextualView.parentNode) {
          contextualView.parentNode.removeChild(contextualView);
        }
      }
      container.classList.remove('tab-content--plan-denied');
      container.classList.remove('tab-content--plan-locked');

      if (accessOverlay) {
        accessOverlay.style.display = 'none';
      }

      if (container && container.children) {
        Array.from(container.children).forEach(child => {
          if (child !== accessOverlay && (!child.classList || !child.classList.contains('maintenance-screen-overlay'))) {
            if (typeof child.getAttribute === 'function' && child.getAttribute('data-access-hidden') === 'true') {
              child.removeAttribute('data-access-hidden');
              child.style.display = '';
            }
            if (typeof child.getAttribute === 'function' && child.getAttribute('data-plan-denied-hidden') === 'true') {
              child.removeAttribute('data-plan-denied-hidden');
              child.style.display = '';
            }
            child.removeAttribute('aria-hidden');
            child.removeAttribute('inert');
            child.inert = false;
          }
        });
      }

      const existingH = container.querySelector('.module-header');
      if (existingH) {
        existingH.querySelectorAll('[data-plan-denied-hidden="true"]').forEach(el => {
          el.removeAttribute('data-plan-denied-hidden');
          el.style.display = '';
        });
      }

      clearLockedModuleSkeletons(container, tabId);

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
      tabId: 'tab-calendar',
      key: 'calendario',
      label: 'Calendário',
      iconSvg: '<svg class="svg-icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>'
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
    const previousTabId = window._currentActiveTabId;

    if (window._currentActiveTabId !== targetTabId) {
      window._currentActiveTabId = targetTabId;
    }

    // Regra A3.4.2 UX: Ao entrar em Calendar vindo de outro módulo, o viewport deve iniciar no topo.
    if (targetTabId === 'tab-calendar' && previousTabId !== 'tab-calendar') {
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        window.scrollTo(0, 0);
      }
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        if (typeof mainContent.scrollTo === 'function') {
          mainContent.scrollTo(0, 0);
        } else {
          mainContent.scrollTop = 0;
        }
      }
      const calContainer = document.getElementById('tab-calendar');
      if (calContainer) {
        calContainer.scrollTop = 0;
      }
    }

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

    // Controle explícito da barra de meses (Ribbon) compartilhado por módulo/aba (UX1.7 e UX1.8)
    const TABS_WITH_MONTH_RIBBON = ['tab-dashboard', 'tab-expenses', 'tab-extras', 'tab-debtors', 'tab-benefits'];
    const showRibbon = accessCheck.allowed && TABS_WITH_MONTH_RIBBON.includes(targetTabId);
    const ribbonSection = document.getElementById('ribbonSection') || (typeof $ === 'function' ? $('#ribbonSection') : null);
    if (ribbonSection) {
      // Container Visibility — autoridade EXCLUSIVA de activateTab
      ribbonSection.hidden = !showRibbon;
      ribbonSection.style.display = showRibbon ? '' : 'none';
      if (showRibbon) {
        // Regra canônica UX2: ribbon respeita preferência global salva em localStorage (chave: corvfin_ribbon_expanded, default: expanded)
        // Obtém ou inicializa a API oficial do expandable com a chave global
        let api = ribbonSection._expandableApi || ribbonSection.querySelector('.expandable-section__header')?._expandableApi;
        if (!api && typeof initExpandableSection === 'function') {
          api = initExpandableSection(ribbonSection, { defaultExpanded: true, storageKey: 'corvfin_ribbon_expanded' });
        }
        if (api && !api._storageKey) {
          api._storageKey = 'corvfin_ribbon_expanded';
        }
        // Sincroniza estado com a preferência global se houver divergência
        if (api && api._storageKey && typeof localStorage !== 'undefined') {
          try {
            const saved = localStorage.getItem(api._storageKey);
            if (saved !== null) {
              const shouldBeExpanded = (saved === 'true');
              if (api.isExpanded() !== shouldBeExpanded) {
                if (shouldBeExpanded) api.expand();
                else api.collapse();
              }
            }
          } catch (_) {}
        }
        if (typeof renderRibbon === 'function') {
          renderRibbon(targetTabId);
        }
      }
    }

    const titleEl = $('#pageTitle');
    const subEl = $('.page-sub') || $('#pageSub');
    if (titleEl) titleEl.textContent = titleMap[targetTabId] || (typeof TAB_TITLES !== 'undefined' && TAB_TITLES[targetTabId]) || 'CorvFin';
    if (subEl && subMap[targetTabId]) subEl.textContent = subMap[targetTabId];

    if (accessCheck.allowed) {
      if (typeof window.renderTabContent === 'function') {
        window.renderTabContent(targetTabId);
      } else {
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
    'tab-calendar': 'calendario',
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

  /* ==========================================================================
     EXPANDABLE SECTIONS — PADRÃO REUTILIZÁVEL (UX1)
     Progressive disclosure genérico e idempotente para o Design System
     ========================================================================== */
  /**
   * Inicializa um container de seção expansível genérico com acessibilidade (aria-expanded / aria-controls).
   * Padrão reutilizável do Design System (UX1). Idempotente e sem persistência em storage.
   *
   * @param {HTMLElement|string} containerOrId - Elemento ou ID do container .expandable-section
   * @param {Object} [options]
   * @param {boolean} [options.defaultExpanded=false] - Estado inicial se nunca inicializado
   * @param {Function} [options.onToggle] - Callback (isExpanded, container)
   * @returns {Object|null} API { toggle, expand, collapse, isExpanded, container, header, content }
   */
  function initExpandableSection(containerOrId, options = {}) {
    const container = typeof containerOrId === 'string'
      ? document.getElementById(containerOrId)
      : containerOrId;

    if (!container || !container.querySelector) return null;

    const header = container.querySelector('.expandable-section__header') || container.querySelector('[aria-controls]');
    if (!header) return null;

    const trigger = (header.getAttribute && header.getAttribute('aria-controls'))
      ? header
      : (header.querySelector('[aria-controls]') || container.querySelector('[aria-controls]'));

    const contentId = (trigger && trigger.getAttribute && trigger.getAttribute('aria-controls'))
      || (header.getAttribute && header.getAttribute('aria-controls'));
    const content = (contentId && typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById(contentId) : null)
      || (contentId ? container.querySelector('#' + contentId) : null)
      || container.querySelector('.expandable-section__content');
    if (!content) return null;

    // Detecta storageKey opcional da options ou data-storage-key
    const detectedStorageKey = options.storageKey
      || (container.getAttribute && container.getAttribute('data-storage-key'))
      || (container.dataset ? container.dataset.storageKey : null);

    // Idempotência: se já inicializado no container, header ou trigger, reutiliza a API existente e preserva o estado atual
    if (container._expandableApi) {
      if (detectedStorageKey && !container._expandableApi._storageKey) {
        container._expandableApi._storageKey = detectedStorageKey;
      }
      if (typeof options.onToggle === 'function') {
        container._expandableApi._onToggle = options.onToggle;
      }
      return container._expandableApi;
    }
    if (header._expandableApi) {
      if (detectedStorageKey && !header._expandableApi._storageKey) {
        header._expandableApi._storageKey = detectedStorageKey;
      }
      if (typeof options.onToggle === 'function') {
        header._expandableApi._onToggle = options.onToggle;
      }
      return header._expandableApi;
    }
    if (trigger && trigger !== header && trigger._expandableApi) {
      if (detectedStorageKey && !trigger._expandableApi._storageKey) {
        trigger._expandableApi._storageKey = detectedStorageKey;
      }
      if (typeof options.onToggle === 'function') {
        trigger._expandableApi._onToggle = options.onToggle;
      }
      return trigger._expandableApi;
    }

    // Detecta estado existente se markup já tinha atributos ou classe
    const existingExpandedAttr = (trigger && trigger.getAttribute && trigger.getAttribute('aria-expanded'))
      || (header.getAttribute && header.getAttribute('aria-expanded'));
    let isExpanded;

    // Se houver storageKey configurada, a preferência persistida em localStorage tem precedência
    let persistedValue = null;
    if (detectedStorageKey && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(detectedStorageKey);
        if (raw !== null) {
          persistedValue = (raw === 'true');
        }
      } catch (_) {}
    }

    if (persistedValue !== null) {
      isExpanded = persistedValue;
    } else if (options.defaultExpanded !== undefined) {
      isExpanded = !!options.defaultExpanded;
    } else if (existingExpandedAttr !== null) {
      isExpanded = (existingExpandedAttr === 'true');
    } else {
      isExpanded = container.classList.contains('is-expanded');
    }

    let api = null;

    function setExpanded(expanded, triggerCallback = true) {
      isExpanded = !!expanded;
      if (header.setAttribute) header.setAttribute('aria-expanded', String(isExpanded));
      if (trigger && trigger !== header && trigger.setAttribute) {
        trigger.setAttribute('aria-expanded', String(isExpanded));
      }
      if (isExpanded) {
        container.classList.add('is-expanded');
        container.classList.remove('is-collapsed');
        content.hidden = false;
        content.removeAttribute('hidden');
      } else {
        container.classList.remove('is-expanded');
        container.classList.add('is-collapsed');
        content.hidden = true;
        content.setAttribute('hidden', '');
      }

      // Persistência em localStorage se storageKey estiver configurada
      const effectiveStorageKey = (api && api._storageKey) || detectedStorageKey;
      if (effectiveStorageKey && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(effectiveStorageKey, String(isExpanded));
        } catch (_) {}
      }

      const callback = (api && api._onToggle) || options.onToggle;
      if (triggerCallback && typeof callback === 'function') {
        try {
          callback(isExpanded, container);
        } catch (err) {
          console.error('Erro no callback onToggle de expandable-section:', err);
        }
      }
    }

    function toggle() {
      setExpanded(!isExpanded);
    }

    header.addEventListener('click', (e) => {
      // Se o clique veio da navegação compacta ou de botões/links que não sejam o trigger, não dá toggle
      if (e.target && typeof e.target.closest === 'function') {
        if (e.target.closest('.ribbon-compact-nav') || e.target.closest('.dash-nav-controls') || e.target.closest('.expandable-section__no-toggle')) {
          return;
        }
        const interactive = e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('select');
        if (interactive && interactive !== header && !interactive.classList?.contains('expandable-section__trigger') && interactive.id !== 'ribbonToggleBtn' && interactive.id !== 'dashboardToggleBtn') {
          return;
        }
      }
      toggle();
    });

    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target && typeof e.target.closest === 'function' && (e.target.closest('.ribbon-compact-nav') || e.target.closest('.dash-nav-controls') || e.target.closest('.expandable-section__no-toggle'))) {
          return;
        }
        if (e.target.tagName !== 'BUTTON' || e.target === trigger || e.target === header) {
          if (typeof e.preventDefault === 'function') {
            e.preventDefault();
          }
          toggle();
        }
      }
    });

    // Aplica estado inicial sem disparar callback
    setExpanded(isExpanded, false);

    api = {
      toggle,
      expand: () => setExpanded(true),
      collapse: () => setExpanded(false),
      isExpanded: () => isExpanded,
      container,
      header,
      trigger,
      content,
      _storageKey: detectedStorageKey || null,
      _onToggle: options.onToggle
    };

    header._expandableApi = api;
    if (trigger && trigger !== header) {
      trigger._expandableApi = api;
    }
    container._expandableApi = api;
    header.dataset.expandableInitialized = 'true';
    if (container.dataset) {
      container.dataset.expandableInitialized = 'true';
    }
    return api;
  }

  function initAllExpandableSections(root = document) {
    if (!root || !root.querySelectorAll) return [];
    // Ordem canônica: se o ribbon estiver presente no root e ainda não possuir _expandableApi,
    // inicializa-o explicitamente com a chave canônica 'corvfin_ribbon_expanded'
    const ribbonSection = (root.getElementById ? root.getElementById('ribbonSection') : null)
      || (root.querySelector ? root.querySelector('#ribbonSection') : null);
    if (ribbonSection && !ribbonSection._expandableApi) {
      initExpandableSection(ribbonSection, { defaultExpanded: true, storageKey: 'corvfin_ribbon_expanded' });
    }

    const containers = root.querySelectorAll('.expandable-section[data-expandable], [data-expandable-section]');
    const apis = [];
    containers.forEach(el => {
      const api = initExpandableSection(el);
      if (api) apis.push(api);
    });
    return apis;
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
  window.initExpandableSection = initExpandableSection;
  window.initAllExpandableSections = initAllExpandableSections;

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
    initPwaSupport,
    initExpandableSection,
    initAllExpandableSections
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      initExpandableSection,
      initAllExpandableSections
    };
  }

})();
