const fs = require('fs');
const path = require('path');
const config = require('../config/config');

// Ensure data directory exists
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

function safeReadJSON(filePath, defaultVal = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      safeWriteJSON(filePath, defaultVal);
      return defaultVal;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content || JSON.stringify(defaultVal));
  } catch (err) {
    console.error(`Erro lendo arquivo ${filePath}:`, err);
    return defaultVal;
  }
}

function safeWriteJSON(filePath, data) {
  try {
    const tempPath = `${filePath}.tmp_${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    console.error(`Erro gravando arquivo ${filePath}:`, err);
    return false;
  }
}

// User Storage Helpers
function getUsers() {
  return safeReadJSON(config.USERS_FILE, []);
}

function saveUsers(users) {
  return safeWriteJSON(config.USERS_FILE, users);
}

// Permissions Storage Helpers
function getPermissions() {
  return safeReadJSON(config.PERMISSIONS_FILE, {});
}

function savePermissions(permissions) {
  return safeWriteJSON(config.PERMISSIONS_FILE, permissions);
}

// Default Permissions Storage Helpers
function getDefaultPermissions() {
  const filePath = config.DEFAULT_PERMISSIONS_FILE || path.join(config.DATA_DIR, 'default_permissions.json');
  return safeReadJSON(filePath, {
    despesas: true,
    extras: true,
    devedores: true,
    investimentos: true,
    beneficios: true,
    compras: true,
    simulacao: true
  });
}

function saveDefaultPermissions(permissions) {
  const filePath = config.DEFAULT_PERMISSIONS_FILE || path.join(config.DATA_DIR, 'default_permissions.json');
  return safeWriteJSON(filePath, permissions);
}

// Maintenance Storage Helpers
const DEFAULT_MAINTENANCE_CONFIG = {
  despesas: { maintenance: false, name: 'Despesas' },
  extras: { maintenance: false, name: 'Rendas Extras' },
  devedores: { maintenance: false, name: 'Devedores' },
  investimentos: { maintenance: false, name: 'Investimentos' },
  beneficios: { maintenance: false, name: 'Benefícios' },
  compras: { maintenance: false, name: 'Lista de Compras' },
  simulacao: { maintenance: false, name: 'Simulação' }
};

function getMaintenanceConfig() {
  const filePath = config.MAINTENANCE_FILE || path.join(config.DATA_DIR, 'maintenance.json');
  const saved = safeReadJSON(filePath, DEFAULT_MAINTENANCE_CONFIG);
  const result = {};
  Object.keys(DEFAULT_MAINTENANCE_CONFIG).forEach(key => {
    result[key] = {
      name: DEFAULT_MAINTENANCE_CONFIG[key].name,
      maintenance: saved && saved[key] && typeof saved[key].maintenance === 'boolean' ? saved[key].maintenance : false
    };
  });
  return result;
}

function saveMaintenanceConfig(newConfig) {
  const filePath = config.MAINTENANCE_FILE || path.join(config.DATA_DIR, 'maintenance.json');
  const current = getMaintenanceConfig();
  const allowedKeys = Object.keys(DEFAULT_MAINTENANCE_CONFIG);

  Object.keys(newConfig || {}).forEach(key => {
    if (allowedKeys.includes(key)) {
      const val = newConfig[key];
      const isMaint = typeof val === 'boolean' ? val : (val && typeof val.maintenance === 'boolean' ? val.maintenance : current[key].maintenance);
      current[key] = {
        name: DEFAULT_MAINTENANCE_CONFIG[key].name,
        maintenance: isMaint
      };
    }
  });

  safeWriteJSON(filePath, current);
  return current;
}

function getUserPermissions(userId) {
  const permissions = getPermissions();
  const defaultPerms = getDefaultPermissions();
  return permissions[userId] || Object.assign(
    {
      despesas: true,
      extras: true,
      devedores: true,
      investimentos: true,
      beneficios: true,
      compras: true,
      simulacao: true,
      configuracoes: false
    },
    defaultPerms
  );
}

function setUserPermissions(userId, userPerms) {
  const permissions = getPermissions();
  const defaultPerms = getDefaultPermissions();
  permissions[userId] = Object.assign(
    {
      despesas: true,
      extras: true,
      devedores: true,
      investimentos: true,
      beneficios: true,
      compras: true,
      simulacao: true,
      configuracoes: false
    },
    defaultPerms,
    userPerms
  );
  savePermissions(permissions);
  return permissions[userId];
}

// Finances Storage Helpers
function getAllFinances() {
  return safeReadJSON(config.FINANCES_FILE, {});
}

function saveAllFinances(finances) {
  return safeWriteJSON(config.FINANCES_FILE, finances);
}

function getDefaultUserFinances(userId, userName, userSalary = 0) {
  const now = new Date();
  return {
    userId,
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
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    profile: {
      name: userName || 'Usuário',
      baseSalary: Number(userSalary) || 0
    },
    destinations: [
      { name: 'XP Investimentos', color: '#1F7A5C', icon: 'bank' },
      { name: 'BTG Pactual', color: '#2563EB', icon: 'bank' },
      { name: 'Nubank', color: '#8B5CF6', icon: 'card' },
      { name: 'Nubank PF', color: '#8B5CF6', icon: 'card' },
      { name: 'Nubank PJ', color: '#8B5CF6', icon: 'card' },
      { name: 'Neon', color: '#06B6D4', icon: 'card' },
      { name: 'Pix', color: '#10B981', icon: 'dollar' },
      { name: 'Em dinheiro', color: '#F59E0B', icon: 'wallet' },
      { name: 'Gerais', color: '#6B7280', icon: 'wallet' }
    ],
    categories: ['Moradia', 'Lazer', 'Alimentação', 'Cartão', 'Transporte', 'Saúde', 'Educação', 'Gerais', 'Investimento', 'Assinatura', 'Outros'],
    budgets: {},
    collapsedSections: {
      insights: false,
      destChart: false,
      categoryChart: false,
      debtorPerson: false,
      debtorDest: false,
      extrasCharts: false,
      benefitsCharts: false,
      investSimulator: false,
      investCharts: false
    },
    benefitsConfig: {
      amount: 0,
      va: 0,
      vr: 0
    },
    benefitTransactions: [],
    readNotifications: [],
    incomes: {},
    fixed: [],
    variable: [],
    extras: [],
    debtors: [],
    assets: [],
    aportes: []
  };
}

function getUserFinances(userId, userName, userSalary = 0) {
  const finances = getAllFinances();
  if (!finances[userId]) {
    finances[userId] = getDefaultUserFinances(userId, userName, userSalary);
    saveAllFinances(finances);
  }
  return finances[userId];
}

function saveUserFinances(userId, data) {
  const finances = getAllFinances();
  finances[userId] = Object.assign({}, finances[userId] || {}, data, { userId, lastModified: new Date().toISOString() });
  saveAllFinances(finances);
  return finances[userId];
}

module.exports = {
  getUsers,
  saveUsers,
  getPermissions,
  savePermissions,
  getDefaultPermissions,
  saveDefaultPermissions,
  getMaintenanceConfig,
  saveMaintenanceConfig,
  getUserPermissions,
  setUserPermissions,
  getAllFinances,
  saveAllFinances,
  getUserFinances,
  saveUserFinances,
  getDefaultUserFinances
};
