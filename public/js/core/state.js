/* ==========================================================================
   ESTADO GLOBAL DA APLICAÇÃO (state.js)
   OmniFin - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  window.normalizeDestinations = function normalizeDestinations(dests) {
    if (!Array.isArray(dests)) return [...DEFAULT_DESTINATIONS];
    return dests.map(d => {
      if (typeof d === 'string') return { name: d, color: '#1F7A5C', icon: 'card' };
      return { name: d.name || 'Destino', color: d.color || '#1F7A5C', icon: d.icon || 'card' };
    });
  };

  window.initialState = function initialState() {
    const t = todayYM();
    const localPrefs = (typeof window.loadLocalPreferences === 'function') ? window.loadLocalPreferences() : {};
    return {
      version: 5,
      revision: 0,
      firstLogin: true,
      sidebarCollapsed: localPrefs.sidebarCollapsed !== undefined ? localPrefs.sidebarCollapsed : false,
      simplifiedView: false,
      chartViewType: localPrefs.chartViewType || 'bar',
      destChartViewType: localPrefs.destChartViewType || 'bar',
      debtorPersonChartType: localPrefs.debtorPersonChartType || 'bar',
      debtorDestChartType: localPrefs.debtorDestChartType || 'bar',
      expensesSubView: 'monthly',
      debtorsSubView: 'monthly',
      theme: localPrefs.theme || localStorage.getItem('fp_theme') || 'light',
      year: t.year || new Date().getFullYear(),
      month: t.month || (new Date().getMonth() + 1),
      profile: { name: 'Usuário', baseSalary: 0 },
      destinations: [...DEFAULT_DESTINATIONS],
      categories: [...DEFAULT_CATEGORIES],
      budgets: {},
      collapsedSections: Object.assign({
        insights: true,
        destChart: true,
        categoryChart: true,
        debtorPerson: true,
        debtorDest: true,
        extrasCharts: true,
        benefitsCharts: true,
        investSimulator: true,
        investCharts: true
      }, localPrefs.collapsedSections || {}),
      readNotifications: [],
      incomes: {},
      fixed: [],
      variable: [],
      extras: [],
      benefitsConfig: { amount: 0, va: 0, vr: 0 },
      benefitTransactions: [],
      customExpensesOrder: [],
      debtors: [],
      assets: [],
      aportes: [],
      shoppingLists: []
    };
  };

  window.migrateState = function migrateState(parsed) {
    const s = initialState();
    const localPrefs = (typeof window.loadLocalPreferences === 'function') ? window.loadLocalPreferences() : {};
    s.sidebarCollapsed = localPrefs.sidebarCollapsed !== undefined ? localPrefs.sidebarCollapsed : false;
    s.simplifiedView = parsed.simplifiedView || false;
    s.chartViewType = localPrefs.chartViewType || parsed.chartViewType || 'bar';
    s.destChartViewType = localPrefs.destChartViewType || parsed.destChartViewType || 'bar';
    s.debtorPersonChartType = localPrefs.debtorPersonChartType || parsed.debtorPersonChartType || 'bar';
    s.debtorDestChartType = localPrefs.debtorDestChartType || parsed.debtorDestChartType || 'bar';
    s.expensesSubView = parsed.expensesSubView || 'monthly';
    s.debtorsSubView = parsed.debtorsSubView || 'monthly';
    s.theme = localPrefs.theme || localStorage.getItem('fp_theme') || parsed.theme || 'light';
    s.year = parsed.year || s.year;
    s.month = parsed.month || s.month;
    s.incomes = parsed.incomes || {};
    s.categories = parsed.categories && parsed.categories.length ? parsed.categories : [...DEFAULT_CATEGORIES];
    s.budgets = Object.assign({}, DEFAULT_BUDGETS, parsed.budgets || {});

    // Dashboards default to COLLAPSED (true) unless explicitly configured in local preferences
    s.collapsedSections = Object.assign({
      insights: true,
      destChart: true,
      categoryChart: true,
      debtorPerson: true,
      debtorDest: true,
      extrasCharts: true,
      benefitsCharts: true,
      investSimulator: true,
      investCharts: true
    }, parsed.collapsedSections || {}, localPrefs.collapsedSections || {});

    s.readNotifications = parsed.readNotifications || [];
    s.fixed = (parsed.fixed && parsed.fixed.length > 0) ? parsed.fixed.map(f => Object.assign({ destination: 'Nubank', paidHistory: {} }, f)) : [];
    s.variable = (parsed.variable && parsed.variable.length > 0) ? parsed.variable.map(v => Object.assign({ destination: 'Nubank', paidHistory: {} }, v)) : [];
    s.assets = parsed.assets || [];
    s.aportes = parsed.aportes || [];
    s.extras = (parsed.extras && parsed.extras.length > 0) ? parsed.extras.map(e => Object.assign({ includeInSimulation: e.includeInSimulation !== false }, e)) : [];
    const bConf = parsed.benefitsConfig || {};
    const bAmt = bConf.amount != null ? Number(bConf.amount) : (bConf.va != null ? (Number(bConf.va || 0) + Number(bConf.vr || 0)) : 0);
    s.benefitsConfig = { amount: bAmt };
    s.benefitTransactions = parsed.benefitTransactions || [];
    s.customExpensesOrder = parsed.customExpensesOrder || [];
    s.debtors = (parsed.debtors || []).map(d => Object.assign({ countInTotal: false, includeInSimulation: d.includeInSimulation !== false, paidHistory: {} }, d));
    s.shoppingLists = (parsed.shoppingLists || parsed.shopping || []).map(list => ({
      id: list.id || (typeof uid === 'function' ? uid() : 'list_' + Math.random().toString(36).substr(2, 9)),
      name: list.name || 'Lista de Compras',
      createdAt: list.createdAt || new Date().toISOString(),
      items: (list.items || []).map(item => {
        const qty = Number(item.quantity || 1);
        const p = Number(item.price || item.current_price || item.currentPrice || 0);
        const uPrice = item.unitPrice != null ? Number(item.unitPrice) : (qty > 0 ? p / qty : p);
        return {
          id: item.id || (typeof uid === 'function' ? uid() : 'item_' + Math.random().toString(36).substr(2, 9)),
          name: item.name || item.itemName || 'Item',
          category: item.category || 'Extras',
          is_checked: !!(item.is_checked || item.isChecked),
          quantity: qty,
          unit: item.unit || 'un',
          unitPrice: Math.round(uPrice * 100) / 100,
          price: Math.round(p * 100) / 100,
          createdAt: item.createdAt || new Date().toISOString()
        };
      })
    }));
    s.revision = typeof parsed.revision === 'number' ? parsed.revision : 0;
    s.profile = (parsed.profile && parsed.profile.name && parsed.profile.name !== 'Usuário') ? parsed.profile : (parsed.profile || s.profile);
    s.destinations = normalizeDestinations(parsed.destinations);
    return s;
  };

})();
