/**
 * OmniFin V3 - Main Application Shell & Runtime Orchestrator
 */
(function () {
  "use strict";

  let stateHydrated = false;
  window.isStateHydrated = function isStateHydrated() {
    return stateHydrated;
  };
  window.setStateHydrated = function setStateHydrated(val) {
    stateHydrated = !!val;
  };

  let state = loadState();
  window.getState = function getState() {
    return state;
  };
  window.saveLocalState = saveLocalState;
  window.saveState = saveState;
  window.render = render;

  window.selectMonth = function selectMonth(m) {
    state.month = m;
    saveLocalState();
    render();
  };

  function saveLocalState() {
    if (typeof window.saveLocalPreferences === 'function') {
      window.saveLocalPreferences({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        collapsedSections: state.collapsedSections,
        chartViewType: state.chartViewType,
        destChartViewType: state.destChartViewType
      });
    }
  }

  let saveQueue = Promise.resolve();
  let isRevalidatingConflict = false;
  let lastConflictToastTime = 0;

  async function saveState(reason = 'unspecified') {
    saveLocalState();

    // HYDRATION GUARD: Impede qualquer persistência remota se o estado ainda não foi hidratado do servidor
    if (!stateHydrated) {
      console.warn(`[HYDRATION GUARD] Persistência remota bloqueada antes da hidratação do servidor (reason: ${reason}).`);
      return false;
    }

    // Filtro de ações puramente visuais que não devem emitir PUT financeiro
    const visualOnly = ['theme-toggle', 'sidebar-toggle', 'tab-switch', 'chart-toggle', 'subview-toggle', 'invest-sim-toggle', 'filter-change', 'month-select'];
    if (visualOnly.includes(reason)) {
      return true;
    }

    // Serializa chamadas assíncronas ao servidor para garantir que apenas 1 PUT esteja em voo por vez
    // e que state.revision esteja sempre atualizado antes de enviar o próximo payload.
    const saveTask = saveQueue.then(() => _executeSaveRemote(reason));
    saveQueue = saveTask.catch(() => {});
    return saveTask;
  }

  async function _executeSaveRemote(reason) {
    if (!stateHydrated) return false;

    const payload = Object.assign({}, state, {
      expectedRevision: Number(state.revision || 0)
    });

    try {
      let response;
      if (window.API && typeof API.saveFinances === 'function') {
        response = await API.saveFinances(payload);
      } else {
        const endpoint = (window.API && typeof API.resolveUrl === 'function') ? API.resolveUrl('/api/finances') : '/api/finances';
        const res = await fetch(endpoint, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify(payload)
        });
        if (res.status === 409) {
          const conflictData = await res.json();
          await handleConcurrencyConflict(conflictData);
          return false;
        }
        response = await res.json();
      }

      if (response && (response.conflict || response.code === 'CONCURRENCY_CONFLICT')) {
        await handleConcurrencyConflict(response);
        return false;
      }

      if (response && (response.status === 403 || response.code === 'RESOURCE_LIMIT_REACHED' || response.error === 'RESOURCE_LIMIT_REACHED')) {
        if (typeof window.showResourceLimitModal === 'function') {
          window.showResourceLimitModal(response);
        } else if (typeof notify === 'function') {
          notify(response.message || 'Limite do seu plano atingido.', 'warning');
        }
        if (typeof window.revalidateStateFromServer === 'function') {
          window.revalidateStateFromServer().catch(() => {});
        }
        return false;
      }

      if (response && response.success) {
        if (typeof response.revision === 'number') {
          state.revision = response.revision;
        } else if (response.data && typeof response.data.revision === 'number') {
          state.revision = response.data.revision;
        } else {
          state.revision = (state.revision || 0) + 1;
        }
        return true;
      }
    } catch (err) {
      if (err.status === 409 || err.conflict || (err.message && err.message.includes('409'))) {
        await handleConcurrencyConflict(err);
        return false;
      }
      if (err && (err.status === 403 || err.code === 'RESOURCE_LIMIT_REACHED' || err.error === 'RESOURCE_LIMIT_REACHED')) {
        if (typeof window.showResourceLimitModal === 'function') {
          window.showResourceLimitModal(err);
        } else if (typeof notify === 'function') {
          notify(err.message || 'Limite do seu plano atingido.', 'warning');
        }
        if (typeof window.revalidateStateFromServer === 'function') {
          window.revalidateStateFromServer().catch(() => {});
        }
        return false;
      }
      console.warn('Erro ao salvar no servidor:', err);
    }
    return false;
  }

  async function handleConcurrencyConflict(conflictData) {
    const now = Date.now();
    // Supressão de flood de avisos idênticos em sequência (< 3s)
    if (now - lastConflictToastTime > 3000) {
      lastConflictToastTime = now;
      notify('⚠️ Dados atualizados em outro dispositivo. Sincronizando versão mais recente...', 'warning');
    }

    if (isRevalidatingConflict) {
      return;
    }

    isRevalidatingConflict = true;
    try {
      if (typeof window.revalidateStateFromServer === 'function') {
        await window.revalidateStateFromServer();
      }
    } finally {
      isRevalidatingConflict = false;
    }
  }
  window.handleConcurrencyConflict = handleConcurrencyConflict;

  function notify(msg, type = 'info') {
    if (typeof window.notify === 'function' && window.notify !== notify) {
      return window.notify(msg, type);
    }
  }

  const ALL_APP_TABS = [
    'tab-dashboard',
    'tab-expenses',
    'tab-extras',
    'tab-debtors',
    'tab-investments',
    'tab-benefits',
    'tab-shopping',
    'tab-simulation',
    'tab-profile',
    'tab-admin'
  ];

  function renderTabContent(tabId) {
    const isSimp = !!state.simplifiedView;
    if (window.checkModuleMaintenance && window.checkModuleMaintenance(tabId)) {
      return;
    }
    if (window.checkModuleAccess && window.checkModuleAccess(tabId).allowed === false) {
      return;
    }

    if (tabId === 'tab-dashboard') {
      if (typeof renderConsolidatedDashboardTab === 'function') {
        renderConsolidatedDashboardTab();
      }
    } else if (tabId === 'tab-expenses') {
      const isInstallmentsSub = state.expensesSubView === 'installments' && !isSimp;
      const expensesSubTabsWrap = $('#expensesSubTabsWrap');
      if (expensesSubTabsWrap) expensesSubTabsWrap.hidden = isSimp;

      const btnInsights = $('#toggleInsightsBtn');
      if (btnInsights) btnInsights.hidden = isSimp;
      const btnDest = $('#toggleDestChartBtn');
      if (btnDest) btnDest.hidden = isSimp;
      const btnCat = $('#toggleCategoryChartBtn');
      if (btnCat) btnCat.hidden = isSimp;

      const monthlyTabBtn = $('#expensesMonthlyTabBtn');
      const instTabBtn = $('#expensesInstallmentsTabBtn');
      const monthlyWrap = $('#expensesMonthlyViewWrap');
      const instWrap = $('#expensesInstallmentsViewWrap');

      if (monthlyTabBtn && instTabBtn) {
        monthlyTabBtn.className = !isInstallmentsSub ? 'btn small primary' : 'btn small soft';
        instTabBtn.className = isInstallmentsSub ? 'btn small primary' : 'btn small soft';
      }

      if (isInstallmentsSub) {
        if (monthlyWrap) monthlyWrap.hidden = true;
        if (instWrap) instWrap.hidden = false;
        if (typeof renderExpensesInstallmentsTab === 'function') renderExpensesInstallmentsTab();
      } else {
        if (monthlyWrap) monthlyWrap.hidden = false;
        if (instWrap) instWrap.hidden = true;

        const dashMetrics = $('#dashboardMetrics'); if (dashMetrics) dashMetrics.hidden = isSimp;
        const insightsCard = $('#insightsSectionCard'); if (insightsCard) insightsCard.hidden = isSimp || !!state.collapsedSections.insights;
        const destCard = $('#destChartSectionCard'); if (destCard) destCard.hidden = isSimp || !!state.collapsedSections.destChart;
        const catCard = $('#categoryChartSectionCard'); if (catCard) catCard.hidden = isSimp || !!state.collapsedSections.categoryChart;
        const normalGrid = $('#normalExpensesGrid'); if (normalGrid) normalGrid.hidden = isSimp;

        if (btnInsights && !isSimp) btnInsights.classList.toggle('active', !state.collapsedSections.insights);
        if (btnDest && !isSimp) btnDest.classList.toggle('active', !state.collapsedSections.destChart);
        if (btnCat && !isSimp) btnCat.classList.toggle('active', !state.collapsedSections.categoryChart);

        const simpContainer = $('#simplifiedExpensesContainer');
        if (simpContainer) {
          simpContainer.hidden = !isSimp;
          if (isSimp) {
            if (typeof renderSimplifiedExpenses === 'function') renderSimplifiedExpenses();
          } else {
            if (typeof renderDashboardMetrics === 'function') renderDashboardMetrics();
            if (!state.collapsedSections.insights && typeof renderInsightsSection === 'function') renderInsightsSection();
            if (!state.collapsedSections.destChart && typeof renderDestinationChart === 'function') renderDestinationChart();
            if (!state.collapsedSections.categoryChart && typeof renderCategoryDistributionChart === 'function') renderCategoryDistributionChart();
            if (typeof renderExpensesLists === 'function') renderExpensesLists();
          }
        }
      }
    } else if (tabId === 'tab-extras') {
      const extraMetrics = $('#extraMetrics'); if (extraMetrics) extraMetrics.hidden = isSimp;
      if (typeof renderExtrasTab === 'function') renderExtrasTab();
    } else if (tabId === 'tab-debtors') {
      const isTotalsSub = state.debtorsSubView === 'totals';
      const monthlyTabBtn = $('#debtorsMonthlyTabBtn');
      const totalsTabBtn = $('#debtorsTotalsTabBtn');
      const monthlyWrap = $('#debtorsMonthlyViewWrap');
      const totalsWrap = $('#debtorsTotalsViewWrap');

      if (monthlyTabBtn && totalsTabBtn) {
        monthlyTabBtn.className = !isTotalsSub ? 'btn small primary' : 'btn small soft';
        totalsTabBtn.className = isTotalsSub ? 'btn small primary' : 'btn small soft';
      }

      if (isTotalsSub) {
        if (monthlyWrap) monthlyWrap.hidden = true;
        if (totalsWrap) totalsWrap.hidden = false;
        if (typeof renderDebtorsTotalsTab === 'function') renderDebtorsTotalsTab();
      } else {
        if (monthlyWrap) monthlyWrap.hidden = false;
        if (totalsWrap) totalsWrap.hidden = true;

        const debtorMetrics = $('#debtorMetrics'); if (debtorMetrics) debtorMetrics.hidden = isSimp;
        if (typeof renderDebtorsTab === 'function') renderDebtorsTab();
      }
    } else if (tabId === 'tab-investments') {
      const investMetrics = $('#investMetrics'); if (investMetrics) investMetrics.hidden = isSimp;
      const investSimCard = $('#investSimulatorCard'); if (investSimCard) investSimCard.hidden = isSimp;
      const investChartsGrid = $('#investChartsGrid'); if (investChartsGrid) investChartsGrid.hidden = isSimp;
      if (typeof renderInvestmentsTab === 'function') renderInvestmentsTab();
    } else if (tabId === 'tab-benefits') {
      if (typeof renderBenefitsTab === 'function') renderBenefitsTab();
    } else if (tabId === 'tab-shopping') {
      if (typeof renderShoppingTab === 'function') renderShoppingTab();
    } else if (tabId === 'tab-simulation') {
      if (typeof renderSimulationTab === 'function') renderSimulationTab();
    } else if (tabId === 'tab-profile') {
      if (typeof renderProfile === 'function') renderProfile();
    } else if (tabId === 'tab-admin') {
      if (window.AdminModule && window.AdminModule.render) {
        window.AdminModule.render();
      }
    }
  }
  window.renderTabContent = renderTabContent;

  function renderAllTabs() {
    ALL_APP_TABS.forEach(tabId => {
      try {
        renderTabContent(tabId);
      } catch (tabErr) {
        console.warn('Erro ao renderizar aba ' + tabId + ':', tabErr);
      }
    });
  }
  window.renderAllTabs = renderAllTabs;

  function render(targetModule = null) {
    applyTheme();
    applySidebarState();

    // HYDRATION GUARD: Se o estado ainda não foi hidratado do servidor, não renderiza dados financeiros e de perfil falsos
    if (!stateHydrated) {
      fillMonthSelects();
      return;
    }

    // FALLBACK DEFENSIVO: Garante que o splash inicial seja removido após o estado estar hidratado
    const splash = document.getElementById('appHydrationSplash');
    if (splash) {
      splash.classList.add('hide');
      splash.style.display = 'none';
    }

    renderRibbon();
    fillMonthSelects();
    updateDestinationSelects();
    updateCategorySelects();
    updateCategoryTagsList();
    if (typeof renderProfile === 'function') renderProfile();
    updateNotificationBell();
    if (typeof updateReleaseNotesBadge === 'function') updateReleaseNotesBadge();

    const isSimp = !!state.simplifiedView;
    const btnView = $('#viewModeToggleBtn');
    if (btnView) {
      btnView.classList.toggle('active', isSimp);
      const tip = isSimp ? 'Alternar para Visão Completa' : 'Alternar para Visão Simplificada';
      btnView.setAttribute('title', tip);
      btnView.setAttribute('aria-label', tip);
    }

    if (targetModule && ALL_APP_TABS.includes(targetModule)) {
      renderTabContent(targetModule);
    } else {
      renderAllTabs();
    }
  }

  function initApp() {
    // Garantia de integridade determinística da API no boot
    if (!window.API || typeof window.API.getBasePath !== 'function' || typeof window.API.resolveUrl !== 'function') {
      console.warn('API client ainda não inicializado no DOMContentLoaded. Tentando novamente...');
      setTimeout(initApp, 20);
      return;
    }

    try { initDialogs(); } catch (e) { console.error('initDialogs error:', e); }
    try { initTabs(); } catch (e) { console.error('initTabs error:', e); }
    try { initAuthAndSync(); } catch (e) { console.error('initAuthAndSync error:', e); }
    try { fillMonthSelects(); } catch (e) { console.error('fillMonthSelects error:', e); }
    if (window.initInvestmentsModule) {
      try { window.initInvestmentsModule(); } catch (e) { console.error('initInvestmentsModule error:', e); }
    }
    if (window.initProfileModule) {
      try { window.initProfileModule(); } catch (e) { console.error('initProfileModule error:', e); }
    }
    if (window.initExpenseInstallmentsModule) {
      try { window.initExpenseInstallmentsModule(); } catch (e) { console.error('initExpenseInstallmentsModule error:', e); }
    }
    if (window.initReleaseNotesModule) {
      try { window.initReleaseNotesModule(); } catch (e) { console.error('initReleaseNotesModule error:', e); }
    }
    if (window.initAiAssistant) {
      try { window.initAiAssistant(); } catch (e) { console.error('initAiAssistant error:', e); }
    }
    try { initGlobalDropZones(); } catch (e) { console.error('initGlobalDropZones error:', e); }
    try { render(); } catch (e) { console.error('render error:', e); }
    try { checkWelcomeTour(); } catch (e) { console.error('checkWelcomeTour error:', e); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
