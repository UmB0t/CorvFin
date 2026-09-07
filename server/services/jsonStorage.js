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

/* ==========================================================================
   SECURITY TOKENS REPOSITORY (Checkpoint Security 6B - JSON Driver)
   ========================================================================== */

function getSecurityTokens() {
  const filePath = config.SECURITY_TOKENS_FILE || path.join(config.DATA_DIR, 'security_tokens.json');
  return safeReadJSON(filePath, []);
}

function saveSecurityTokens(tokens) {
  const filePath = config.SECURITY_TOKENS_FILE || path.join(config.DATA_DIR, 'security_tokens.json');
  return safeWriteJSON(filePath, tokens);
}

function getUserByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const clean = email.trim().toLowerCase();
  const users = getUsers();
  return users.find(u => (u.email || '').trim().toLowerCase() === clean) || null;
}

function createSecurityToken({ userId, type, tokenHash, expiresAt }) {
  const tokens = getSecurityTokens();
  const nowISO = new Date().toISOString();
  tokens.forEach(t => {
    if (t.userId === userId && t.type === type && t.status === 'active') {
      t.status = 'invalidated';
      t.usedAt = nowISO;
    }
  });
  const doc = {
    id: `tok_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    userId,
    type,
    tokenHash,
    status: 'active',
    expiresAt,
    createdAt: nowISO,
    usedAt: null,
    claimedAt: null
  };
  tokens.push(doc);
  saveSecurityTokens(tokens);
  return { ...doc };
}

function invalidateSecurityTokensForUser(userId, type) {
  const tokens = getSecurityTokens();
  const nowISO = new Date().toISOString();
  let count = 0;
  tokens.forEach(t => {
    if (t.userId === userId && t.type === type && t.status === 'active') {
      t.status = 'invalidated';
      t.usedAt = nowISO;
      count++;
    }
  });
  if (count > 0) saveSecurityTokens(tokens);
  return count;
}

function verifyEmailWithToken(tokenHash) {
  if (!tokenHash || typeof tokenHash !== 'string') {
    return { success: false, reason: 'INVALID_TOKEN' };
  }
  const tokens = getSecurityTokens();
  const nowISO = new Date().toISOString();
  const tokenIndex = tokens.findIndex(t =>
    t.tokenHash === tokenHash &&
    t.type === 'email_verification' &&
    t.status === 'active' &&
    !t.usedAt &&
    t.expiresAt > nowISO
  );
  if (tokenIndex === -1) {
    return { success: false, reason: 'INVALID_OR_EXPIRED' };
  }
  const tokenDoc = tokens[tokenIndex];

  // PASSO 1: Claim
  tokenDoc.status = 'claiming';
  tokenDoc.claimedAt = nowISO;

  // PASSO 2: Update user
  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === tokenDoc.userId);
  if (userIndex === -1) {
    tokenDoc.status = 'active';
    tokenDoc.claimedAt = null;
    saveSecurityTokens(tokens);
    return { success: false, reason: 'USER_NOT_FOUND' };
  }

  users[userIndex].emailVerified = true;
  users[userIndex].emailVerifiedAt = nowISO;
  const userSaved = saveUsers(users);
  if (!userSaved) {
    tokenDoc.status = 'active';
    tokenDoc.claimedAt = null;
    saveSecurityTokens(tokens);
    return { success: false, reason: 'USER_UPDATE_FAILED' };
  }

  // PASSO 3: Finaliza token
  tokenDoc.status = 'used';
  tokenDoc.usedAt = nowISO;
  tokenDoc.claimedAt = null;
  saveSecurityTokens(tokens);

  return { success: true, userId: tokenDoc.userId };
}

function resetPasswordWithToken(tokenHash, newHashedPassword) {
  if (!tokenHash || typeof tokenHash !== 'string' || !newHashedPassword) {
    return { success: false, reason: 'INVALID_ARGUMENTS' };
  }
  const tokens = getSecurityTokens();
  const nowISO = new Date().toISOString();
  const tokenIndex = tokens.findIndex(t =>
    t.tokenHash === tokenHash &&
    t.type === 'password_reset' &&
    t.status === 'active' &&
    !t.usedAt &&
    t.expiresAt > nowISO
  );
  if (tokenIndex === -1) {
    return { success: false, reason: 'INVALID_OR_EXPIRED' };
  }
  const tokenDoc = tokens[tokenIndex];

  // PASSO 1: Claim
  tokenDoc.status = 'claiming';
  tokenDoc.claimedAt = nowISO;

  // PASSO 2: Update user
  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === tokenDoc.userId);
  if (userIndex === -1) {
    tokenDoc.status = 'active';
    tokenDoc.claimedAt = null;
    saveSecurityTokens(tokens);
    return { success: false, reason: 'USER_NOT_FOUND' };
  }

  users[userIndex].senha = newHashedPassword;
  users[userIndex].tokenVersion = (typeof users[userIndex].tokenVersion === 'number' ? users[userIndex].tokenVersion : 0) + 1;
  const userSaved = saveUsers(users);
  if (!userSaved) {
    tokenDoc.status = 'active';
    tokenDoc.claimedAt = null;
    saveSecurityTokens(tokens);
    return { success: false, reason: 'USER_UPDATE_FAILED' };
  }

  const userEmail = users[userIndex].email;
  const userNome = users[userIndex].nome;

  // PASSO 3: Fail-safe finalization (never rollback to active)
  tokenDoc.status = 'used';
  tokenDoc.usedAt = nowISO;
  tokenDoc.claimedAt = null;

  tokens.forEach((t, idx) => {
    if (idx !== tokenIndex && t.userId === tokenDoc.userId && t.type === 'password_reset' && t.status === 'active') {
      t.status = 'invalidated';
      t.usedAt = nowISO;
    }
  });

  saveSecurityTokens(tokens);
  return { success: true, userId: tokenDoc.userId, email: userEmail, nome: userNome };
}

function updateUserPassword(userId, newHashedPassword) {
  if (!userId || !newHashedPassword) return false;
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return false;
  users[idx].senha = newHashedPassword;
  users[idx].tokenVersion = (typeof users[idx].tokenVersion === 'number' ? users[idx].tokenVersion : 0) + 1;
  return saveUsers(users);
}

function cleanExpiredSecurityTokens(retentionMs = 7 * 24 * 60 * 60 * 1000) {
  const tokens = getSecurityTokens();
  const cutoff = new Date(Date.now() - retentionMs).toISOString();
  const filtered = tokens.filter(t => {
    if (t.expiresAt && t.expiresAt < cutoff) return false;
    if (t.usedAt && t.usedAt < cutoff) return false;
    return true;
  });
  const deletedCount = tokens.length - filtered.length;
  if (deletedCount > 0) saveSecurityTokens(filtered);
  return deletedCount;
}

/* ==========================================================================
   PLANS REPOSITORY (File: config.PLANS_FILE) - Lote 5B
   ========================================================================== */

function getPlansFilePath() {
  return config.PLANS_FILE || path.join(config.DATA_DIR, 'plans.json');
}

function getRawPlans() {
  return safeReadJSON(getPlansFilePath(), []);
}

function saveRawPlans(plans) {
  return safeWriteJSON(getPlansFilePath(), plans);
}

function mapJsonPlan(plan) {
  if (!plan) return null;
  const { _id, ...rest } = plan;
  return { _id, id: _id, ...rest };
}

function getPlans(filter = {}) {
  const plans = getRawPlans();
  let result = plans;
  if (filter.status) {
    result = result.filter(p => p.status === filter.status);
  }
  result.sort((a, b) => {
    const orderA = a.metadata?.displayOrder ?? 0;
    const orderB = b.metadata?.displayOrder ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
  return result.map(mapJsonPlan);
}

function getPlanById(planId) {
  if (!planId) return null;
  const plans = getRawPlans();
  const found = plans.find(p => p._id === planId || p.id === planId);
  return mapJsonPlan(found);
}

function getPlanBySlug(slug) {
  if (!slug) return null;
  const plans = getRawPlans();
  const found = plans.find(p => p.slug === slug);
  return mapJsonPlan(found);
}

function getDefaultPlan() {
  const plans = getRawPlans();
  const found = plans.find(p => p.isDefault === true);
  return mapJsonPlan(found);
}

function savePlan(planDoc) {
  if (!planDoc || !planDoc._id) {
    throw new Error('Documento de plano inválido: _id obrigatório');
  }
  const plans = getRawPlans();

  if (plans.some(p => p.slug === planDoc.slug)) {
    const err = new Error(`E11000 duplicate key error: slug "${planDoc.slug}" already exists`);
    err.code = 11000;
    throw err;
  }

  if (planDoc.isDefault === true && plans.some(p => p.isDefault === true)) {
    const err = new Error('E11000 duplicate key error: isDefault true already exists');
    err.code = 11000;
    throw err;
  }

  const docToSave = {
    ...planDoc,
    id: planDoc._id,
    createdAt: planDoc.createdAt || new Date().toISOString(),
    updatedAt: planDoc.updatedAt || new Date().toISOString()
  };

  plans.push(docToSave);
  saveRawPlans(plans);
  return mapJsonPlan(docToSave);
}

function updatePlan(planId, updateData) {
  if (!planId) return null;
  const plans = getRawPlans();
  const index = plans.findIndex(p => p._id === planId || p.id === planId);
  if (index === -1) return null;

  if (updateData.isDefault === true) {
    const existingDefault = plans.find((p, i) => i !== index && p.isDefault === true);
    if (existingDefault) {
      const err = new Error('E11000 duplicate key error: isDefault true already exists');
      err.code = 11000;
      throw err;
    }
  }

  const current = plans[index];
  const updated = {
    ...current,
    ...updateData,
    _id: current._id,
    id: current._id,
    updatedAt: new Date().toISOString()
  };

  plans[index] = updated;
  saveRawPlans(plans);
  return mapJsonPlan(updated);
}

function setDefaultPlan(targetPlanId) {
  if (!targetPlanId) {
    throw new Error('targetPlanId obrigatório para setDefaultPlan');
  }
  const plans = getRawPlans();
  const targetIndex = plans.findIndex(p => p._id === targetPlanId || p.id === targetPlanId);
  if (targetIndex === -1) {
    throw new Error(`Plano não encontrado: "${targetPlanId}"`);
  }

  const target = plans[targetIndex];
  if (target.status !== 'active') {
    throw new Error(`Não é possível definir plano com status "${target.status}" como default. Apenas planos ativos são elegíveis.`);
  }

  const currentDefaultIndex = plans.findIndex(p => p.isDefault === true);
  if (currentDefaultIndex === targetIndex) {
    return mapJsonPlan(target);
  }

  const now = new Date().toISOString();
  const snapshot = JSON.parse(JSON.stringify(plans));

  try {
    if (currentDefaultIndex !== -1) {
      plans[currentDefaultIndex].isDefault = false;
      plans[currentDefaultIndex].updatedAt = now;
    }
    plans[targetIndex].isDefault = true;
    plans[targetIndex].updatedAt = now;

    const ok = saveRawPlans(plans);
    if (!ok) {
      throw new Error('Falha ao gravar arquivo plans.json');
    }
    return mapJsonPlan(plans[targetIndex]);
  } catch (err) {
    try {
      saveRawPlans(snapshot);
    } catch (rollbackErr) {
      console.error('[CRITICAL] Falha crítica no rollback de setDefaultPlan em JSON:', rollbackErr);
      const critErr = new Error(`Falha ao promover default (${err.message}) E falha crítica no rollback (${rollbackErr.message})`);
      critErr.code = 'CRITICAL_DEFAULT_ROLLBACK_FAILED';
      throw critErr;
    }
    throw err;
  }
}

module.exports = {
  getUsers,
  getUserById,
  getUserByEmail,
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
  updateAiPendingAction,
  getSecurityTokens,
  createSecurityToken,
  invalidateSecurityTokensForUser,
  verifyEmailWithToken,
  resetPasswordWithToken,
  updateUserPassword,
  cleanExpiredSecurityTokens,
  getPlans,
  getPlanById,
  getPlanBySlug,
  getDefaultPlan,
  savePlan,
  updatePlan,
  setDefaultPlan
};
