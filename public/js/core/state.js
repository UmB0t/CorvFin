window.normalizeDestinations = function normalizeDestinations(dests) {
  if (!Array.isArray(dests)) return [...DEFAULT_DESTINATIONS];
  return dests.map(d => {
    if (typeof d === 'string') return { name: d, color: '#1F7A5C', icon: 'card' };
    return { name: d.name || 'Destino', color: d.color || '#1F7A5C', icon: d.icon || 'card' };
  });
};

window.initialState = function initialState() {
  const t = todayYM();
  return {
    version: 5,
    firstLogin: true,
    sidebarCollapsed: false,
    simplifiedView: false,
    chartViewType: 'bar',
    destChartViewType: 'bar',
    debtorPersonChartType: 'bar',
    debtorDestChartType: 'bar',
    expensesSubView: 'monthly',
    debtorsSubView: 'monthly',
    theme: 'light',
    year: t.year || new Date().getFullYear(),
    month: t.month || (new Date().getMonth() + 1),
    profile: { name: 'Usuário', baseSalary: 0 },
    destinations: [...DEFAULT_DESTINATIONS],
    categories: [...DEFAULT_CATEGORIES],
    budgets: {},
    collapsedSections: { insights: false, destChart: false, categoryChart: false, debtorPerson: false, debtorDest: false, extrasCharts: false, benefitsCharts: false, investSimulator: false, investCharts: false },
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
  s.sidebarCollapsed = false;
  s.simplifiedView = parsed.simplifiedView || false;
  s.chartViewType = parsed.chartViewType || 'bar';
  s.destChartViewType = parsed.destChartViewType || 'bar';
  s.debtorPersonChartType = parsed.debtorPersonChartType || 'bar';
  s.debtorDestChartType = parsed.debtorDestChartType || 'bar';
  s.expensesSubView = parsed.expensesSubView || 'monthly';
  s.debtorsSubView = parsed.debtorsSubView || 'monthly';
  s.theme = parsed.theme || 'light';
  s.year = parsed.year || s.year;
  s.month = parsed.month || s.month;
  s.incomes = parsed.incomes || {};
  s.categories = parsed.categories && parsed.categories.length ? parsed.categories : [...DEFAULT_CATEGORIES];
  s.budgets = Object.assign({}, DEFAULT_BUDGETS, parsed.budgets || {});
  const isCatCollapsed = parsed.collapsedSections?.categoryChart !== undefined
    ? parsed.collapsedSections.categoryChart
    : (parsed.collapsedSections?.categoryBudget || parsed.collapsedSections?.incomeCategory || false);
  s.collapsedSections = Object.assign({ insights: false, destChart: false, categoryChart: isCatCollapsed, debtorPerson: false, debtorDest: false, extrasCharts: false, benefitsCharts: false, investSimulator: false, investCharts: false }, parsed.collapsedSections || {});
  s.readNotifications = parsed.readNotifications || [];
  s.fixed = (parsed.fixed && parsed.fixed.length > 0) ? parsed.fixed.map(f => Object.assign({ destination: 'Nubank', paidHistory: {} }, f)) : s.fixed;
  s.variable = (parsed.variable && parsed.variable.length > 0) ? parsed.variable.map(v => Object.assign({ destination: 'Nubank', paidHistory: {} }, v)) : s.variable;
  s.assets = parsed.assets || [];
  s.aportes = parsed.aportes || [];
  s.extras = (parsed.extras && parsed.extras.length > 0) ? parsed.extras.map(e => Object.assign({ includeInSimulation: e.includeInSimulation !== false }, e)) : s.extras;
  const bConf = parsed.benefitsConfig || {};
  const bAmt = bConf.amount != null ? Number(bConf.amount) : (bConf.va != null ? (Number(bConf.va || 0) + Number(bConf.vr || 0)) : s.benefitsConfig.amount);
  s.benefitsConfig = { amount: bAmt };
  s.benefitTransactions = parsed.benefitTransactions || [];
  s.customExpensesOrder = parsed.customExpensesOrder || [];
  s.debtors = (parsed.debtors || []).map(d => Object.assign({ countInTotal: false, includeInSimulation: d.includeInSimulation !== false, paidHistory: {} }, d));
  s.shoppingLists = (parsed.shoppingLists || parsed.shopping || []).map(list => ({
    id: list.id || (typeof uid === 'function' ? uid() : 'list_' + Math.random().toString(36).substr(2, 9)),
    name: list.name || 'Lista de Compras',
    createdAt: list.createdAt || new Date().toISOString(),
    items: (list.items || []).map(item => ({
      id: item.id || (typeof uid === 'function' ? uid() : 'item_' + Math.random().toString(36).substr(2, 9)),
      name: item.name || item.itemName || 'Item',
      category: item.category || 'Extras',
      is_checked: !!(item.is_checked || item.isChecked),
      quantity: Number(item.quantity || 1),
      unit: item.unit || 'un',
      price: Number(item.price || item.current_price || item.currentPrice || 0),
      createdAt: item.createdAt || new Date().toISOString()
    }))
  }));
  s.profile = (parsed.profile && parsed.profile.name && parsed.profile.name !== 'Usuário') ? parsed.profile : s.profile;
  s.destinations = normalizeDestinations(parsed.destinations);
  return s;
};
