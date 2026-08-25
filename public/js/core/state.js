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
    aportes: []
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
  s.extras = (parsed.extras && parsed.extras.length > 0) ? parsed.extras : s.extras;
  const bConf = parsed.benefitsConfig || {};
  const bAmt = bConf.amount != null ? Number(bConf.amount) : (bConf.va != null ? (Number(bConf.va || 0) + Number(bConf.vr || 0)) : s.benefitsConfig.amount);
  s.benefitsConfig = { amount: bAmt };
  s.benefitTransactions = parsed.benefitTransactions || [];
  s.customExpensesOrder = parsed.customExpensesOrder || [];
  s.debtors = (parsed.debtors || []).map(d => Object.assign({ countInTotal: false, paidHistory: {} }, d));
  s.profile = (parsed.profile && parsed.profile.name && parsed.profile.name !== 'Usuário') ? parsed.profile : s.profile;
  s.destinations = normalizeDestinations(parsed.destinations);
  return s;
};
