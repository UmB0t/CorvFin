const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const { filterAllowedFields } = require('./financeValidation');

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

function getUserById(userId) {
  if (!userId) return null;
  const users = getUsers();
  return users.find(u => u.id === userId) || null;
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
    dashboard: true,
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
  dashboard: { maintenance: false, name: 'Dashboard' },
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
    let isMaint = false;
    if (saved && saved[key]) {
      if (typeof saved[key].maintenance === 'boolean') {
        isMaint = saved[key].maintenance === true;
      } else if (typeof saved[key] === 'boolean') {
        isMaint = saved[key] === true;
      }
    }
    result[key] = {
      name: (saved && saved[key] && saved[key].name) || DEFAULT_MAINTENANCE_CONFIG[key].name,
      maintenance: isMaint
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
      dashboard: true,
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
      dashboard: true,
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

function getDefaultUserFinances(userId, userName, userSalary = 0, isNewUser = false) {
  const now = new Date();
  return {
    userId,
    version: 5,
    revision: 0,
    firstLogin: true,
    onboarding: {
      welcomeSeen: !isNewUser
    },
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
      insights: true,
      destChart: true,
      categoryChart: true,
      debtorPerson: true,
      debtorDest: true,
      extrasCharts: true,
      benefitsCharts: true,
      investSimulator: true,
      investCharts: true
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
    aportes: [],
    shoppingLists: [],
    shoppingItemSuggestions: [],
    savedSimulations: []
  };
}

function getUserFinances(userId, userName, userSalary = 0, isNewUser = false) {
  const finances = getAllFinances();
  if (!finances[userId]) {
    finances[userId] = getDefaultUserFinances(userId, userName, userSalary, isNewUser);
    saveAllFinances(finances);
  }
  return finances[userId];
}

function saveUserFinances(userId, data) {
  const finances = getAllFinances();
  const current = finances[userId] || getDefaultUserFinances(userId);
  const currentRev = Number(current.revision || 0);
  const expectedRev = Number(data.expectedRevision ?? data.revision ?? 0);

  if (finances[userId] && finances[userId].revision !== undefined && expectedRev !== currentRev) {
    const err = new Error('Conflito de concorrência detectado. Os dados foram alterados por outro dispositivo.');
    err.code = 'CONCURRENCY_CONFLICT';
    err.status = 409;
    err.currentRevision = currentRev;
    err.expectedRevision = expectedRev;
    throw err;
  }

  const newRevision = currentRev + 1;
  const { _id, userId: _u, expectedRevision: _er, revision: _r, ...cleanData } = data;
  const filteredClean = filterAllowedFields(cleanData);
  finances[userId] = Object.assign({}, current, filteredClean, {
    userId,
    revision: newRevision,
    lastModified: new Date().toISOString()
  });
  saveAllFinances(finances);
  return finances[userId];
}

// AI Proposals Storage Helpers (File: ai_proposals.json)
function getAiProposalsFile() {
  return config.AI_PROPOSALS_FILE || path.join(config.DATA_DIR, 'ai_proposals.json');
}

function getAllAiProposals() {
  return safeReadJSON(getAiProposalsFile(), {});
}

function saveAllAiProposals(proposals) {
  return safeWriteJSON(getAiProposalsFile(), proposals);
}

function saveAiProposal(proposalDoc) {
  if (!proposalDoc || !proposalDoc._id) return false;
  const proposals = getAllAiProposals();
  proposals[proposalDoc._id] = proposalDoc;
  saveAllAiProposals(proposals);
  return proposalDoc;
}

function getAiProposal(proposalId) {
  if (!proposalId) return null;
  const proposals = getAllAiProposals();
  const doc = proposals[proposalId];
  if (!doc) return null;
  // Verifica expiração em tempo de leitura
  if (doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now()) {
    delete proposals[proposalId];
    saveAllAiProposals(proposals);
    return null;
  }
  return doc;
}

function updateAiProposalStatus(proposalId, status, extraFields = {}) {
  if (!proposalId) return null;
  const proposals = getAllAiProposals();
  const doc = proposals[proposalId];
  if (!doc) return null;
  doc.status = status;
  Object.assign(doc, extraFields);
  doc.updatedAt = new Date().toISOString();
  saveAllAiProposals(proposals);
  return doc;
}

function deleteAiProposal(proposalId) {
  if (!proposalId) return false;
  const proposals = getAllAiProposals();
  if (proposals[proposalId]) {
    delete proposals[proposalId];
    saveAllAiProposals(proposals);
    return true;
  }
  return false;
}

function getAiPendingActionsFile() {
  return config.AI_PENDING_ACTIONS_FILE || path.join(config.DATA_DIR, 'ai_pending_actions.json');
}

function getAllAiPendingActions() {
  return safeReadJSON(getAiPendingActionsFile(), {});
}

function saveAllAiPendingActions(actions) {
  return safeWriteJSON(getAiPendingActionsFile(), actions);
}

function saveAiPendingAction(pendingActionDoc) {
  if (!pendingActionDoc || !pendingActionDoc.userId || !pendingActionDoc.conversationId) return null;
  const actions = getAllAiPendingActions();
  const key = `${pendingActionDoc.userId}_${pendingActionDoc.conversationId}`;
  const now = new Date();
  const defaultTtlMs = config.AI_PENDING_ACTION_TTL_MS || (30 * 60 * 1000);
  const actionId = pendingActionDoc._id || `pa_${key}`;
  const docToSave = {
    ...pendingActionDoc,
    _id: actionId,
    id: actionId,
    createdAt: pendingActionDoc.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: pendingActionDoc.expiresAt || new Date(Date.now() + defaultTtlMs).toISOString()
  };
  actions[key] = docToSave;
  saveAllAiPendingActions(actions);
  return docToSave;
}

function getAiPendingAction(userId, conversationId) {
  if (!userId || !conversationId) return null;
  const actions = getAllAiPendingActions();
  const key = `${userId}_${conversationId}`;
  const doc = actions[key];
  if (!doc) return null;
  if ((doc.expiresAt && new Date(doc.expiresAt).getTime() < Date.now()) || doc.status === 'expired') {
    delete actions[key];
    saveAllAiPendingActions(actions);
    return null;
  }
  return doc;
}

function clearAiPendingAction(userId, conversationId) {
  if (!userId || !conversationId) return false;
  const actions = getAllAiPendingActions();
  const key = `${userId}_${conversationId}`;
  if (actions[key]) {
    delete actions[key];
    saveAllAiPendingActions(actions);
    return true;
  }
  return false;
}

function updateAiPendingAction(userId, conversationId, updateFields = {}) {
  if (!userId || !conversationId) return null;
  const actions = getAllAiPendingActions();
  const key = `${userId}_${conversationId}`;
  const doc = actions[key];
  if (!doc) return null;
  Object.assign(doc, updateFields, { updatedAt: new Date().toISOString() });
  saveAllAiPendingActions(actions);
  return doc;
}

const DEFAULT_EMAIL_SETTINGS = {
  enabled: false,
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  username: 'no-reply@corvfin.com.br',
  encryptedPassword: null,
  fromName: 'CorvFin',
  fromEmail: 'no-reply@corvfin.com.br'
};

function getEmailSettings() {
  const filePath = config.EMAIL_SETTINGS_FILE || path.join(config.DATA_DIR, 'email_settings.json');
  const saved = safeReadJSON(filePath, DEFAULT_EMAIL_SETTINGS);
  return Object.assign({}, DEFAULT_EMAIL_SETTINGS, saved || {});
}

function saveEmailSettings(newSettings) {
  const filePath = config.EMAIL_SETTINGS_FILE || path.join(config.DATA_DIR, 'email_settings.json');
  const current = getEmailSettings();
  const merged = Object.assign({}, current, newSettings || {}, {
    updatedAt: new Date().toISOString()
  });

  safeWriteJSON(filePath, merged);
  return merged;
}

module.exports = {
  getUsers,
  getUserById,
  saveUsers,
  getPermissions,
  savePermissions,
  getDefaultPermissions,
  saveDefaultPermissions,
  getMaintenanceConfig,
  saveMaintenanceConfig,
  getEmailSettings,
  saveEmailSettings,
  getUserPermissions,
  setUserPermissions,
  getAllFinances,
  saveAllFinances,
  getUserFinances,
  saveUserFinances,
  getDefaultUserFinances,
  saveAiProposal,
  getAiProposal,
  updateAiProposalStatus,
  deleteAiProposal,
  saveAiPendingAction,
  getAiPendingAction,
  clearAiPendingAction,
  updateAiPendingAction
};
