/* ==========================================================================
   ESTADO GLOBAL DA APLICAÇÃO (state.js)
   OmniFin - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  window.normalizeDestinations = function normalizeDestinations(dests) {
    if (!Array.isArray(dests) || dests.length === 0) {
      return (typeof DEFAULT_DESTINATIONS !== 'undefined') ? [...DEFAULT_DESTINATIONS] : [
        { name: 'Pix', color: '#10B981', icon: 'dollar', dueDay: null },
        { name: 'Dinheiro', color: '#F59E0B', icon: 'wallet', dueDay: null }
      ];
    }
    const list = dests.map(d => {
      if (typeof d === 'string') {
        let name = d.trim();
        if (name.toLowerCase() === 'em dinheiro') name = 'Dinheiro';
        return {
          name,
          color: (name === 'Pix' ? '#10B981' : (name === 'Dinheiro' ? '#F59E0B' : '#1F7A5C')),
          icon: (name === 'Pix' ? 'dollar' : (name === 'Dinheiro' ? 'wallet' : 'card')),
          dueDay: null
        };
      }
      let name = (d.name || 'Destino').trim();
      if (name.toLowerCase() === 'em dinheiro') name = 'Dinheiro';
      const isNative = (name.toLowerCase() === 'pix' || name.toLowerCase() === 'dinheiro');
      const dueDay = (!isNative && d.dueDay != null && !isNaN(Number(d.dueDay)) && Number(d.dueDay) >= 1 && Number(d.dueDay) <= 31)
        ? Number(d.dueDay)
        : null;
      return {
        name,
        color: d.color || (name === 'Pix' ? '#10B981' : (name === 'Dinheiro' ? '#F59E0B' : '#1F7A5C')),
        icon: d.icon || (name === 'Pix' ? 'dollar' : (name === 'Dinheiro' ? 'wallet' : 'card')),
        dueDay
      };
    });

    // Ensure native Pix and Dinheiro always exist
    const hasPix = list.some(d => d.name.toLowerCase() === 'pix');
    if (!hasPix) {
      list.unshift({ name: 'Pix', color: '#10B981', icon: 'dollar', dueDay: null });
    }
    const hasCash = list.some(d => d.name.toLowerCase() === 'dinheiro' || d.name.toLowerCase() === 'em dinheiro');
    if (!hasCash) {
      const pixIdx = list.findIndex(d => d.name.toLowerCase() === 'pix');
      list.splice(pixIdx + 1, 0, { name: 'Dinheiro', color: '#F59E0B', icon: 'wallet', dueDay: null });
    }

    return list;
  };

  window.normalizeCategories = function normalizeCategories(cats) {
    if (!Array.isArray(cats) || cats.length === 0) {
      return (typeof DEFAULT_CATEGORIES !== 'undefined') ? DEFAULT_CATEGORIES.map(c => ({ name: c.name || c, icon: c.icon || 'tag' })) : [];
    }
    const defaultIconsMap = (typeof DEFAULT_CATEGORY_ICONS_MAP !== 'undefined') ? DEFAULT_CATEGORY_ICONS_MAP : {};
    return cats.map(c => {
      if (typeof c === 'string') {
        return { name: c, icon: defaultIconsMap[c] || 'tag' };
      }
      const name = c.name || 'Gerais';
      const icon = c.icon || defaultIconsMap[name] || 'tag';
      return { name, icon };
    });
  };

  window.initialState = function initialState() {
    const t = todayYM();
    const localPrefs = (typeof window.loadLocalPreferences === 'function') ? window.loadLocalPreferences() : {};
    const loggedUser = (typeof window !== 'undefined' && window.API && typeof API.getUser === 'function') ? API.getUser() : null;
    const fallbackName = loggedUser?.nome || '';
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
      theme: localPrefs.theme || (typeof localStorage !== 'undefined' ? localStorage.getItem('fp_theme') : null) || 'light',
      year: t.year || new Date().getFullYear(),
      month: t.month || (new Date().getMonth() + 1),
      profile: { name: fallbackName, baseSalary: null },
      destinations: normalizeDestinations(DEFAULT_DESTINATIONS),
      categories: normalizeCategories(DEFAULT_CATEGORIES),
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
      readReleases: [],
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
      shoppingLists: [],
      shoppingItemSuggestions: [],
      savedSimulations: []
    };
  };

  window.migrateState = function migrateState(parsed) {
    if (!parsed || typeof parsed !== 'object') return initialState();
    const s = initialState();
    const localPrefs = (typeof window.loadLocalPreferences === 'function') ? window.loadLocalPreferences() : {};

    s.version = 5;
    s.firstLogin = false;
    s.theme = localPrefs.theme || (typeof localStorage !== 'undefined' ? localStorage.getItem('fp_theme') : null) || parsed.theme || 'light';
    s.sidebarCollapsed = localPrefs.sidebarCollapsed !== undefined ? localPrefs.sidebarCollapsed : (parsed.sidebarCollapsed || false);
    s.simplifiedView = !!parsed.simplifiedView;
    s.chartViewType = localPrefs.chartViewType || parsed.chartViewType || 'bar';
    s.destChartViewType = localPrefs.destChartViewType || parsed.destChartViewType || 'bar';
    s.debtorPersonChartType = localPrefs.debtorPersonChartType || parsed.debtorPersonChartType || 'bar';
    s.debtorDestChartType = localPrefs.debtorDestChartType || parsed.debtorDestChartType || 'bar';
    s.expensesSubView = parsed.expensesSubView || 'monthly';
    s.debtorsSubView = parsed.debtorsSubView || 'monthly';
    s.year = Number(parsed.year) || s.year;
    s.month = Number(parsed.month) || s.month;
    s.categories = normalizeCategories(parsed.categories);
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
      status: list.status || 'open',
      completedAt: list.completedAt || null,
      completionMonth: list.completionMonth != null ? Number(list.completionMonth) : null,
      completionYear: list.completionYear != null ? Number(list.completionYear) : null,
      allocation: list.allocation || null,
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
          allocation: item.allocation || null,
          createdAt: item.createdAt || new Date().toISOString()
        };
      })
    }));

    const normItemName = (typeof normalizeShoppingItemName === 'function')
      ? normalizeShoppingItemName
      : (str) => String(str || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

    s.shoppingItemSuggestions = Array.isArray(parsed.shoppingItemSuggestions)
      ? parsed.shoppingItemSuggestions
          .map(item => {
            if (typeof item === 'string') {
              const name = item.trim();
              return {
                name,
                normalizedName: normItemName(name),
                category: 'Extras',
                unit: 'un',
                createdAt: new Date().toISOString()
              };
            }
            const name = (item && item.name) ? String(item.name).trim() : '';
            return {
              name,
              normalizedName: (item && item.normalizedName) ? item.normalizedName : normItemName(name),
              category: (item && item.category) ? item.category : 'Extras',
              unit: (item && item.unit) ? item.unit : 'un',
              createdAt: (item && item.createdAt) ? item.createdAt : new Date().toISOString()
            };
          })
          .filter(item => item.name && item.name.length > 0)
      : [];

    s.revision = typeof parsed.revision === 'number' ? parsed.revision : 0;
    const loggedUser = (typeof window !== 'undefined' && window.API && typeof API.getUser === 'function') ? API.getUser() : null;
    const fallbackName = loggedUser?.nome || 'Usuário';
    if (parsed.profile) {
      s.profile = {
        name: (parsed.profile.name && parsed.profile.name !== 'Usuário') ? parsed.profile.name : fallbackName,
        baseSalary: parsed.profile.baseSalary != null ? Number(parsed.profile.baseSalary) : 0
      };
    } else {
      s.profile = { name: fallbackName, baseSalary: 0 };
    }
    s.destinations = normalizeDestinations(parsed.destinations);
    s.savedSimulations = Array.isArray(parsed.savedSimulations) ? parsed.savedSimulations : [];
    s.readReleases = Array.isArray(parsed.readReleases) ? parsed.readReleases : [];
    return s;
  };

})();
