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

function getUserPermissions(userId) {
  const permissions = getPermissions();
  return permissions[userId] || {
    despesas: true,
    extras: true,
    devedores: true,
    investimentos: true,
    beneficios: true,
    configuracoes: false
  };
}

function setUserPermissions(userId, userPerms) {
  const permissions = getPermissions();
  permissions[userId] = Object.assign(
    {
      despesas: true,
      extras: true,
      devedores: true,
      investimentos: true,
      beneficios: true,
      configuracoes: false
    },
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
  getUserPermissions,
  setUserPermissions,
  getAllFinances,
  saveAllFinances,
  getUserFinances,
  saveUserFinances,
  getDefaultUserFinances
};
