const config = require('../config/config');
const { getDB, connectDB } = require('../config/db');
const { filterAllowedFields } = require('./financeValidation');

// Maintenance Default Configuration Constants
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

const DEFAULT_PERMISSIONS_FALLBACK = {
  dashboard: true,
  despesas: true,
  extras: true,
  devedores: true,
  investimentos: true,
  beneficios: true,
  compras: true,
  simulacao: true
};

/**
 * Helper interno para obter a instância da collection garantindo conexão ativa.
 */
async function getCollection(collectionName) {
  try {
    const db = getDB();
    return db.collection(collectionName);
  } catch (err) {
    const db = await connectDB();
    return db.collection(collectionName);
  }
}

/* ==========================================================================
   USERS REPOSITORY
   ========================================================================== */

/**
 * Retorna todos os usuários cadastrados.
 * Mapeia _id para garantir que o objeto contenha o formato idêntico ao JSON.
 */
async function getUsers() {
  const col = await getCollection('users');
  const docs = await col.find({}).toArray();
  return docs.map(doc => {
    const { _id, ...rest } = doc;
    return { id: doc.id || _id, ...rest };
  });
}

/**
 * Consulta individual e eficiente de usuário pelo identificador via findOne (evita carregar coleção inteira).
 */
async function getUserById(userId) {
  if (!userId) return null;
  const col = await getCollection('users');
  const doc = await col.findOne({ $or: [{ _id: userId }, { id: userId }] });
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: doc.id || _id, ...rest };
}

/**
 * Salva a lista completa de usuários (reproduzindo semanticamente replace exato do JSON).
 * Remove qualquer usuário que não esteja no array fornecido.
 */
async function saveUsers(users) {
  const col = await getCollection('users');
  if (!Array.isArray(users)) return false;

  if (users.length === 0) {
    await col.deleteMany({});
    return true;
  }

  const userIds = users.map(u => u.id);
  const operations = users.map(u => ({
    updateOne: {
      filter: { _id: u.id },
      update: { $set: { _id: u.id, ...u } },
      upsert: true
    }
  }));

  // Remoção atômica de registros ausentes no novo conjunto
  await col.deleteMany({ _id: { $nin: userIds } });
  const res = await col.bulkWrite(operations);
  return !!res.ok;
}

/* ==========================================================================
   PERMISSIONS REPOSITORY
   ========================================================================== */

/**
 * Retorna o mapa completo de permissões por usuário no formato legado: { [userId]: { ...flags } }
 */
async function getPermissions() {
  const col = await getCollection('permissions');
  const docs = await col.find({}).toArray();
  const result = {};
  docs.forEach(doc => {
    const userId = doc.userId || doc._id;
    const { _id, userId: uid, updatedAt, ...perms } = doc;
    result[userId] = perms;
  });
  return result;
}

/**
 * Salva o mapa completo de permissões (reproduzindo semanticamente replace exato do JSON).
 * Remove qualquer permissão de usuário que não esteja no objeto fornecido.
 */
async function savePermissions(permissions) {
  const col = await getCollection('permissions');
  if (!permissions || typeof permissions !== 'object') return false;

  const userIds = Object.keys(permissions);
  if (userIds.length === 0) {
    await col.deleteMany({});
    return true;
  }

  const operations = userIds.map(userId => ({
    updateOne: {
      filter: { _id: userId },
      update: { $set: { _id: userId, userId, ...permissions[userId] } },
      upsert: true
    }
  }));

  // Remoção atômica de permissões de usuários ausentes no novo conjunto
  await col.deleteMany({ _id: { $nin: userIds } });
  const res = await col.bulkWrite(operations);
  return !!res.ok;
}

/**
 * Retorna as permissões de um usuário específico, aplicando merge com as permissões padrão.
 */
async function getUserPermissions(userId) {
  const col = await getCollection('permissions');
  const doc = await col.findOne({ _id: userId });
  const defaultPerms = await getDefaultPermissions();

  const basePermissions = Object.assign(
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

  if (!doc) {
    return basePermissions;
  }

  const { _id, userId: uid, updatedAt, ...userPerms } = doc;
  return Object.assign(basePermissions, userPerms);
}

/**
 * Define e persiste as permissões de um usuário via upsert.
 */
async function setUserPermissions(userId, userPerms) {
  const col = await getCollection('permissions');
  const defaultPerms = await getDefaultPermissions();

  const merged = Object.assign(
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

  await col.updateOne(
    { _id: userId },
    { $set: { _id: userId, userId, ...merged, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );

  return merged;
}

/* ==========================================================================
   DEFAULT PERMISSIONS REPOSITORY (SINGLETON: "global_default")
   ========================================================================== */

/**
 * Retorna as permissões padrão globais sem expor _id ou updatedAt.
 */
async function getDefaultPermissions() {
  const col = await getCollection('default_permissions');
  const doc = await col.findOne({ _id: 'global_default' });
  if (!doc) {
    return Object.assign({}, DEFAULT_PERMISSIONS_FALLBACK);
  }
  const { _id, updatedAt, ...perms } = doc;
  return perms;
}

/**
 * Salva as permissões padrão globais via upsert no singleton "global_default".
 */
async function saveDefaultPermissions(permissions) {
  const col = await getCollection('default_permissions');
  const sanitized = {
    dashboard: permissions.dashboard !== false,
    despesas: permissions.despesas !== false,
    extras: permissions.extras !== false,
    devedores: permissions.devedores !== false,
    investimentos: permissions.investimentos !== false,
    beneficios: permissions.beneficios !== false,
    compras: permissions.compras === true,
    simulacao: permissions.simulacao === true,
    updatedAt: new Date().toISOString()
  };

  await col.updateOne(
    { _id: 'global_default' },
    { $set: { _id: 'global_default', ...sanitized } },
    { upsert: true }
  );
  return sanitized;
}

/* ==========================================================================
   MAINTENANCE REPOSITORY (SINGLETON: "system_maintenance")
   ========================================================================== */

/**
 * Retorna a configuração atual de manutenção de módulos sem expor _id ou updatedAt.
 */
async function getMaintenanceConfig() {
  const col = await getCollection('maintenance');
  const saved = await col.findOne({ _id: 'system_maintenance' });
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

/**
 * Atualiza e salva a configuração de manutenção com sanitização estrita.
 */
async function saveMaintenanceConfig(newConfig) {
  const col = await getCollection('maintenance');
  const current = await getMaintenanceConfig();
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

  await col.updateOne(
    { _id: 'system_maintenance' },
    { $set: { _id: 'system_maintenance', ...current, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
  return current;
}

/* ==========================================================================
   FINANCES REPOSITORY (1 DOCUMENTO AGREGADO POR USUÁRIO: _id = userId)
   ========================================================================== */

/**
 * Helper síncrono puro que constrói a estrutura default de finanças do usuário.
 */
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

/**
 * Retorna todos os documentos de finanças indexados por userId.
 */
async function getAllFinances() {
  const col = await getCollection('finances');
  const docs = await col.find({}).toArray();
  const result = {};
  docs.forEach(doc => {
    const userId = doc.userId || doc._id;
    const { _id, ...data } = doc;
    result[userId] = data;
  });
  return result;
}

/**
 * Salva a coleção completa de finanças de todos os usuários via bulk write (replace exato do JSON).
 * Remove qualquer documento financeiro de usuário que não esteja no objeto fornecido.
 */
async function saveAllFinances(finances) {
  const col = await getCollection('finances');
  if (!finances || typeof finances !== 'object') return false;

  const userIds = Object.keys(finances);
  if (userIds.length === 0) {
    await col.deleteMany({});
    return true;
  }

  const operations = userIds.map(userId => ({
    updateOne: {
      filter: { _id: userId },
      update: { $set: { _id: userId, userId, ...finances[userId] } },
      upsert: true
    }
  }));

  // Remoção atômica de documentos de usuários ausentes no novo conjunto
  await col.deleteMany({ _id: { $nin: userIds } });
  const res = await col.bulkWrite(operations);
  return !!res.ok;
}

/**
 * Retorna as finanças de um usuário específico sem expor _id.
 * Se não existir, inicializa com o template padrão.
 */
async function getUserFinances(userId, userName, userSalary = 0, isNewUser = false) {
  const col = await getCollection('finances');
  const doc = await col.findOne({ _id: userId });

  if (!doc) {
    const defaults = getDefaultUserFinances(userId, userName, userSalary, isNewUser);
    await col.updateOne(
      { _id: userId },
      { $set: { _id: userId, ...defaults } },
      { upsert: true }
    );
    return defaults;
  }

  const { _id, ...financesData } = doc;
  if (financesData.revision === undefined) {
    financesData.revision = 0;
  }
  if (userName && userName !== 'Usuário') {
    if (!financesData.profile) {
      financesData.profile = { name: userName, baseSalary: Number(userSalary) || 0 };
    } else if (!financesData.profile.name || financesData.profile.name === 'Usuário') {
      financesData.profile.name = userName;
    }
  }
  return financesData;
}

/**
 * Atualiza e persiste as finanças de um usuário com merge.
 */
async function saveUserFinances(userId, data) {
  const col = await getCollection('finances');
  
  const currentDoc = await col.findOne({ _id: userId });
  if (!currentDoc) {
    const defaults = getDefaultUserFinances(userId);
    const { _id, userId: _u, expectedRevision: _er, revision: _r, ...cleanData } = data;
    const filteredClean = filterAllowedFields(cleanData);
    const newDoc = Object.assign({}, defaults, filteredClean, {
      _id: userId,
      userId,
      revision: 1,
      lastModified: new Date().toISOString()
    });
    await col.insertOne(newDoc);
    const { _id: _, ...result } = newDoc;
    return result;
  }

  const expectedRevision = Number(data.expectedRevision ?? data.revision ?? 0);
  const currentRevision = Number(currentDoc.revision || 0);

  // Atomic filter with revision check / optimistic locking
  const filter = {
    _id: userId,
    $or: [
      { revision: expectedRevision },
      ...(expectedRevision === 0 ? [{ revision: { $exists: false } }, { revision: null }] : [])
    ]
  };

  const { _id, userId: _u, expectedRevision: _er, revision: _r, ...cleanData } = data;
  const filteredClean = filterAllowedFields(cleanData);
  const updatePayload = Object.assign({}, filteredClean, {
    userId,
    lastModified: new Date().toISOString()
  });

  const res = await col.updateOne(
    filter,
    {
      $set: updatePayload,
      $inc: { revision: 1 }
    }
  );

  if (res.matchedCount === 0) {
    const fresh = await col.findOne({ _id: userId });
    const freshRev = fresh ? Number(fresh.revision || 0) : currentRevision;
    const err = new Error('Conflito de concorrência detectado. Os dados foram alterados por outro dispositivo.');
    err.code = 'CONCURRENCY_CONFLICT';
    err.status = 409;
    err.currentRevision = freshRev;
    err.expectedRevision = expectedRevision;
    throw err;
  }

  const freshDoc = await col.findOne({ _id: userId });
  const { _id: _, ...result } = freshDoc;
  return result;
}

/**
 * Helper explícito para definição de índices únicos (chamado manualmente ou em scripts de migração).
 * NÃO é invocado automaticamente no boot.
 */
async function ensureMongoIndexes() {
  const usersCol = await getCollection('users');
  await usersCol.createIndex({ login: 1 }, { unique: true, collation: { locale: 'pt', strength: 2 } });
  await usersCol.createIndex({ email: 1 }, { unique: true, collation: { locale: 'pt', strength: 2 } });

  const permsCol = await getCollection('permissions');
  await permsCol.createIndex({ userId: 1 }, { unique: true });

  const financesCol = await getCollection('finances');
  await financesCol.createIndex({ userId: 1 }, { unique: true });

  const plansCol = await getCollection('plans');
  await plansCol.createIndex({ slug: 1 }, { unique: true });
  await plansCol.createIndex(
    { isDefault: 1 },
    { unique: true, partialFilterExpression: { isDefault: true } }
  );
}

/* ==========================================================================
   AI PROPOSALS REPOSITORY (Collection: ai_proposals)
   ========================================================================== */

let ttlIndexEnsured = false;
async function ensureAiProposalTTLIndex(col) {
  if (ttlIndexEnsured) return;
  try {
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    ttlIndexEnsured = true;
  } catch (err) {
    // TTL index can already exist
  }
}

async function saveAiProposal(proposalDoc) {
  if (!proposalDoc || !proposalDoc._id) return null;
  const col = await getCollection('ai_proposals');
  await ensureAiProposalTTLIndex(col);
  const docToSave = {
    ...proposalDoc,
    expiresAt: proposalDoc.expiresAt instanceof Date ? proposalDoc.expiresAt : new Date(proposalDoc.expiresAt),
    createdAt: proposalDoc.createdAt instanceof Date ? proposalDoc.createdAt : new Date(proposalDoc.createdAt || Date.now())
  };
  await col.updateOne(
    { _id: proposalDoc._id },
    { $set: docToSave },
    { upsert: true }
  );
  return proposalDoc;
}

async function getAiProposal(proposalId) {
  if (!proposalId) return null;
  const col = await getCollection('ai_proposals');
  const doc = await col.findOne({ _id: proposalId });
  if (!doc) return null;
  const { _id, ...rest } = doc;
  // Checagem de expiração em tempo de execução
  const exp = doc.expiresAt instanceof Date ? doc.expiresAt.getTime() : new Date(doc.expiresAt).getTime();
  if (exp < Date.now()) {
    await col.deleteOne({ _id: proposalId });
    return null;
  }
  return { _id, id: _id, ...rest };
}

async function updateAiProposalStatus(proposalId, status, extraFields = {}) {
  if (!proposalId) return null;
  const col = await getCollection('ai_proposals');
  const updatePayload = {
    status,
    ...extraFields,
    updatedAt: new Date()
  };
  const res = await col.findOneAndUpdate(
    { _id: proposalId },
    { $set: updatePayload },
    { returnDocument: 'after' }
  );
  const updatedDoc = res?.value || res;
  if (!updatedDoc) return null;
  const { _id, ...rest } = updatedDoc;
  return { _id, id: _id, ...rest };
}

async function deleteAiProposal(proposalId) {
  if (!proposalId) return false;
  const col = await getCollection('ai_proposals');
  const res = await col.deleteOne({ _id: proposalId });
  return res.deletedCount > 0;
}

let pendingActionTTLIndexEnsured = false;
async function ensureAiPendingActionTTLIndex(col) {
  if (pendingActionTTLIndexEnsured) return;
  try {
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await col.createIndex({ userId: 1, conversationId: 1 });
    pendingActionTTLIndexEnsured = true;
  } catch (err) {
    // TTL index can already exist
  }
}

async function saveAiPendingAction(pendingActionDoc) {
  if (!pendingActionDoc || !pendingActionDoc.userId || !pendingActionDoc.conversationId) return null;
  const col = await getCollection('ai_pending_actions');
  await ensureAiPendingActionTTLIndex(col);
  const actionId = pendingActionDoc._id || `pa_${pendingActionDoc.userId}_${pendingActionDoc.conversationId}`;
  const now = new Date();
  const defaultTtlMs = config.AI_PENDING_ACTION_TTL_MS || (30 * 60 * 1000);
  const docToSave = {
    ...pendingActionDoc,
    _id: actionId,
    createdAt: pendingActionDoc.createdAt instanceof Date ? pendingActionDoc.createdAt : new Date(pendingActionDoc.createdAt || now),
    updatedAt: now,
    expiresAt: pendingActionDoc.expiresAt instanceof Date ? pendingActionDoc.expiresAt : new Date(pendingActionDoc.expiresAt || (Date.now() + defaultTtlMs))
  };
  await col.updateOne(
    { userId: pendingActionDoc.userId, conversationId: pendingActionDoc.conversationId },
    { $set: docToSave },
    { upsert: true }
  );
  return { ...docToSave, id: actionId };
}

async function getAiPendingAction(userId, conversationId) {
  if (!userId || !conversationId) return null;
  const col = await getCollection('ai_pending_actions');
  const doc = await col.findOne({ userId, conversationId });
  if (!doc) return null;
  const exp = doc.expiresAt instanceof Date ? doc.expiresAt.getTime() : new Date(doc.expiresAt).getTime();
  if (exp < Date.now() || doc.status === 'expired') {
    await col.deleteOne({ userId, conversationId });
    return null;
  }
  const { _id, ...rest } = doc;
  return { _id, id: _id, ...rest };
}

async function clearAiPendingAction(userId, conversationId) {
  if (!userId || !conversationId) return false;
  const col = await getCollection('ai_pending_actions');
  const res = await col.deleteOne({ userId, conversationId });
  return res.deletedCount > 0;
}

async function updateAiPendingAction(userId, conversationId, updateFields = {}) {
  if (!userId || !conversationId) return null;
  const col = await getCollection('ai_pending_actions');
  const now = new Date();
  const updatePayload = {
    ...updateFields,
    updatedAt: now
  };
  const res = await col.findOneAndUpdate(
    { userId, conversationId },
    { $set: updatePayload },
    { returnDocument: 'after' }
  );
  const updatedDoc = res?.value || res;
  if (!updatedDoc) return null;
  const { _id, ...rest } = updatedDoc;
  return { _id, id: _id, ...rest };
}

/* ==========================================================================
   GLOBAL SETTINGS REPOSITORY (Collection 'settings': _id = 'email_settings', etc.)
   ========================================================================== */

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

async function getEmailSettings() {
  const col = await getCollection('settings');
  const doc = await col.findOne({ _id: 'email_settings' });
  if (!doc) {
    return Object.assign({}, DEFAULT_EMAIL_SETTINGS);
  }
  const { _id, ...rest } = doc;
  return Object.assign({}, DEFAULT_EMAIL_SETTINGS, rest);
}

async function saveEmailSettings(newSettings) {
  const col = await getCollection('settings');
  const current = await getEmailSettings();
  const merged = Object.assign({}, current, newSettings || {}, {
    updatedAt: new Date().toISOString()
  });

  await col.updateOne(
    { _id: 'email_settings' },
    { $set: { _id: 'email_settings', ...merged } },
    { upsert: true }
  );
  return merged;
}

/* ==========================================================================
   SECURITY TOKENS REPOSITORY (Checkpoint Security 6B)
   ========================================================================== */

/**
 * Localiza usuário pelo e-mail normalizado (case-insensitive)
 */
async function getUserByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const clean = email.trim().toLowerCase();
  const col = await getCollection('users');
  const doc = await col.findOne({ email: { $regex: new RegExp(`^${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: doc.id || _id, ...rest };
}

/**
 * Cria um token de segurança, invalidando previamente tokens ativos anteriores do mesmo usuário e tipo.
 */
async function createSecurityToken({ userId, type, tokenHash, expiresAt }) {
  const col = await getCollection('security_tokens');
  const nowISO = new Date().toISOString();

  // Invalida tokens anteriores ativos do mesmo usuário e tipo
  await col.updateMany(
    { userId, type, status: 'active' },
    { $set: { status: 'invalidated', usedAt: nowISO } }
  );

  const doc = {
    userId,
    type,
    tokenHash,
    status: 'active',
    expiresAt,
    createdAt: nowISO,
    usedAt: null,
    claimedAt: null
  };

  await col.insertOne(doc);
  return { ...doc };
}

/**
 * Invalida tokens ativos de um usuário para um tipo específico.
 */
async function invalidateSecurityTokensForUser(userId, type) {
  const col = await getCollection('security_tokens');
  const nowISO = new Date().toISOString();
  const res = await col.updateMany(
    { userId, type, status: 'active' },
    { $set: { status: 'invalidated', usedAt: nowISO } }
  );
  return res.modifiedCount;
}

/**
 * Consome token de confirmação de e-mail de forma atômica (Two-Phase Claim)
 * sem risco de perda do token em caso de falha no update do usuário.
 */
async function verifyEmailWithToken(tokenHash) {
  if (!tokenHash || typeof tokenHash !== 'string') {
    return { success: false, reason: 'INVALID_TOKEN' };
  }

  const colTokens = await getCollection('security_tokens');
  const userCol = await getCollection('users');
  const nowISO = new Date().toISOString();

  // PASSO 1: Claim atômico (active -> claiming)
  const claimedToken = await colTokens.findOneAndUpdate(
    {
      tokenHash,
      type: 'email_verification',
      status: 'active',
      usedAt: null,
      expiresAt: { $gt: nowISO }
    },
    {
      $set: { status: 'claiming', claimedAt: nowISO }
    },
    { returnDocument: 'after' }
  );

  const tokenDoc = claimedToken && (claimedToken.value || claimedToken._id ? (claimedToken.value || claimedToken) : null);
  if (!tokenDoc) {
    return { success: false, reason: 'INVALID_OR_EXPIRED' };
  }

  // PASSO 2: Atualização do usuário (emailVerified = true)
  let userUpdated = false;
  try {
    const userUpdateRes = await userCol.findOneAndUpdate(
      { $or: [{ _id: tokenDoc.userId }, { id: tokenDoc.userId }] },
      {
        $set: {
          emailVerified: true,
          emailVerifiedAt: nowISO
        }
      },
      { returnDocument: 'after' }
    );
    const updatedUser = userUpdateRes && (userUpdateRes.value || userUpdateRes._id ? (userUpdateRes.value || userUpdateRes) : null);
    if (!updatedUser) {
      throw new Error('User not found');
    }
    userUpdated = true;
  } catch (err) {
    // PASSO 3A: Falha no update do usuário -> Rollback para active
    try {
      await colTokens.updateOne(
        { _id: tokenDoc._id, status: 'claiming' },
        { $set: { status: 'active', claimedAt: null } }
      );
    } catch (rbErr) {
      console.error('Falha no rollback do token de verificação:', rbErr);
    }
    return { success: false, reason: 'USER_UPDATE_FAILED', error: err.message };
  }

  // PASSO 3B: Usuário atualizado -> Finaliza token (claiming -> used)
  try {
    await colTokens.updateOne(
      { _id: tokenDoc._id },
      { $set: { status: 'used', usedAt: nowISO, claimedAt: null } }
    );
  } catch (finErr) {
    // Fail-safe: o token permanece 'claiming' e nunca mais pode ser reivindicado
    console.error('Falha não-crítica ao finalizar token de verificação pós-confirmação:', finErr.message);
  }

  return { success: true, userId: tokenDoc.userId };
}

/**
 * Redefine senha utilizando token com Two-Phase Claim e Fail-Safe pós-update.
 */
async function resetPasswordWithToken(tokenHash, newHashedPassword) {
  if (!tokenHash || typeof tokenHash !== 'string' || !newHashedPassword) {
    return { success: false, reason: 'INVALID_ARGUMENTS' };
  }

  const colTokens = await getCollection('security_tokens');
  const userCol = await getCollection('users');
  const nowISO = new Date().toISOString();

  // PASSO 1: Claim atômico (active -> claiming)
  const claimedToken = await colTokens.findOneAndUpdate(
    {
      tokenHash,
      type: 'password_reset',
      status: 'active',
      usedAt: null,
      expiresAt: { $gt: nowISO }
    },
    {
      $set: { status: 'claiming', claimedAt: nowISO }
    },
    { returnDocument: 'after' }
  );

  const tokenDoc = claimedToken && (claimedToken.value || claimedToken._id ? (claimedToken.value || claimedToken) : null);
  if (!tokenDoc) {
    return { success: false, reason: 'INVALID_OR_EXPIRED' };
  }

  // PASSO 2: Atualização de credencial e invalidação de sessões (tokenVersion++)
  let userUpdated = false;
  let userEmail = null;
  let userNome = null;
  try {
    const userUpdateRes = await userCol.findOneAndUpdate(
      { $or: [{ _id: tokenDoc.userId }, { id: tokenDoc.userId }] },
      {
        $set: { senha: newHashedPassword },
        $inc: { tokenVersion: 1 }
      },
      { returnDocument: 'after' }
    );
    const updatedUser = userUpdateRes && (userUpdateRes.value || userUpdateRes._id ? (userUpdateRes.value || userUpdateRes) : null);
    if (!updatedUser) {
      throw new Error('User not found');
    }
    userUpdated = true;
    userEmail = updatedUser.email;
    userNome = updatedUser.nome;
  } catch (err) {
    // Falha ANTES do update da senha -> Rollback do claim para active
    try {
      await colTokens.updateOne(
        { _id: tokenDoc._id, status: 'claiming' },
        { $set: { status: 'active', claimedAt: null } }
      );
    } catch (rbErr) {
      console.error('Falha no rollback do token de reset:', rbErr);
    }
    return { success: false, reason: 'USER_UPDATE_FAILED', error: err.message };
  }

  // PASSO 3: Fail-Safe pós-update (o token nunca volta para active)
  try {
    await colTokens.updateOne(
      { _id: tokenDoc._id },
      { $set: { status: 'used', usedAt: nowISO, claimedAt: null } }
    );
    // Invalida outros tokens de reset ativos do mesmo usuário
    await colTokens.updateMany(
      {
        userId: tokenDoc.userId,
        type: 'password_reset',
        _id: { $ne: tokenDoc._id },
        status: 'active'
      },
      { $set: { status: 'invalidated', usedAt: nowISO } }
    );
  } catch (finErr) {
    // Fail-safe: o token permanece 'claiming' e nunca mais pode ser reivindicado
    console.error('Falha não-crítica ao finalizar token de reset pós-alteração de senha:', finErr.message);
  }

  return { success: true, userId: tokenDoc.userId, email: userEmail, nome: userNome };
}

/**
 * Atualiza a senha e incrementa tokenVersion para usuário autenticado.
 */
async function updateUserPassword(userId, newHashedPassword) {
  if (!userId || !newHashedPassword) return false;
  const col = await getCollection('users');
  const res = await col.findOneAndUpdate(
    { $or: [{ _id: userId }, { id: userId }] },
    {
      $set: { senha: newHashedPassword },
      $inc: { tokenVersion: 1 }
    },
    { returnDocument: 'after' }
  );
  const updated = res && (res.value || res._id ? (res.value || res) : null);
  return !!updated;
}

/**
 * Limpeza oportunística de tokens expirados há mais de 7 dias
 */
async function cleanExpiredSecurityTokens(retentionMs = 7 * 24 * 60 * 60 * 1000) {
  try {
    const col = await getCollection('security_tokens');
    const cutoff = new Date(Date.now() - retentionMs).toISOString();
    const res = await col.deleteMany({
      $or: [
        { expiresAt: { $lt: cutoff } },
        { usedAt: { $ne: null, $lt: cutoff } }
      ]
    });
    return res.deletedCount;
  } catch (err) {
    console.error('Erro na limpeza de security_tokens expirados:', err);
    return 0;
  }
}

/* ==========================================================================
   PLANS REPOSITORY (Collection: plans) - Lote 5B
   ========================================================================== */

let planIndexesEnsured = false;
async function ensurePlanIndexes(col) {
  if (planIndexesEnsured) return;
  try {
    await col.createIndex({ slug: 1 }, { unique: true });
    await col.createIndex(
      { isDefault: 1 },
      { unique: true, partialFilterExpression: { isDefault: true } }
    );
    planIndexesEnsured = true;
  } catch (err) {
    // Índices podem já existir ou ser criados concorrentemente
  }
}

function mapPlanDoc(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id, id: _id, ...rest };
}

async function getPlans(filter = {}) {
  const col = await getCollection('plans');
  await ensurePlanIndexes(col);
  const query = {};
  if (filter.status) {
    query.status = filter.status;
  }
  const docs = await col.find(query).sort({ 'metadata.displayOrder': 1, createdAt: 1 }).toArray();
  return docs.map(mapPlanDoc);
}

async function getPlanById(planId) {
  if (!planId) return null;
  const col = await getCollection('plans');
  await ensurePlanIndexes(col);
  const doc = await col.findOne({ $or: [{ _id: planId }, { id: planId }] });
  return mapPlanDoc(doc);
}

async function getPlanBySlug(slug) {
  if (!slug) return null;
  const col = await getCollection('plans');
  await ensurePlanIndexes(col);
  const doc = await col.findOne({ slug });
  return mapPlanDoc(doc);
}

async function getDefaultPlan() {
  const col = await getCollection('plans');
  await ensurePlanIndexes(col);
  const doc = await col.findOne({ isDefault: true });
  return mapPlanDoc(doc);
}

async function savePlan(planDoc) {
  if (!planDoc || !planDoc._id) {
    throw new Error('Documento de plano inválido: _id obrigatório');
  }
  const col = await getCollection('plans');
  await ensurePlanIndexes(col);

  const docToSave = {
    ...planDoc,
    createdAt: planDoc.createdAt || new Date().toISOString(),
    updatedAt: planDoc.updatedAt || new Date().toISOString()
  };

  await col.insertOne(docToSave);
  return mapPlanDoc(docToSave);
}

async function updatePlan(planId, updateData) {
  if (!planId) return null;
  const col = await getCollection('plans');
  await ensurePlanIndexes(col);

  const payload = {
    ...updateData,
    updatedAt: new Date().toISOString()
  };

  const res = await col.findOneAndUpdate(
    { $or: [{ _id: planId }, { id: planId }] },
    { $set: payload },
    { returnDocument: 'after' }
  );

  const updated = res && (res.value || res._id ? (res.value || res) : null);
  return mapPlanDoc(updated);
}

async function setDefaultPlan(targetPlanId) {
  if (!targetPlanId) {
    throw new Error('targetPlanId obrigatório para setDefaultPlan');
  }
  const col = await getCollection('plans');
  await ensurePlanIndexes(col);

  const target = await col.findOne({ $or: [{ _id: targetPlanId }, { id: targetPlanId }] });
  if (!target) {
    throw new Error(`Plano não encontrado: "${targetPlanId}"`);
  }
  if (target.status !== 'active') {
    throw new Error(`Não é possível definir plano com status "${target.status}" como default. Apenas planos ativos são elegíveis.`);
  }

  const currentDefault = await col.findOne({ isDefault: true });
  if (currentDefault && (currentDefault._id === targetPlanId || currentDefault.id === targetPlanId)) {
    return mapPlanDoc(currentDefault);
  }

  const now = new Date().toISOString();

  if (currentDefault) {
    await col.updateOne(
      { _id: currentDefault._id },
      { $set: { isDefault: false, updatedAt: now } }
    );
  }

  try {
    const res = await col.findOneAndUpdate(
      { $or: [{ _id: targetPlanId }, { id: targetPlanId }] },
      { $set: { isDefault: true, updatedAt: now } },
      { returnDocument: 'after' }
    );
    const updated = res && (res.value || res._id ? (res.value || res) : null);
    return mapPlanDoc(updated);
  } catch (promoErr) {
    if (currentDefault) {
      try {
        await col.updateOne(
          { _id: currentDefault._id },
          { $set: { isDefault: true, updatedAt: new Date().toISOString() } }
        );
      } catch (rollbackErr) {
        console.error('[CRITICAL] Falha crítica no rollback de setDefaultPlan:', rollbackErr);
        const critErr = new Error(`Falha ao promover novo default (${promoErr.message}) E falha crítica no rollback (${rollbackErr.message})`);
        critErr.code = 'CRITICAL_DEFAULT_ROLLBACK_FAILED';
        throw critErr;
      }
    }
    throw promoErr;
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
  ensureMongoIndexes,
  saveAiProposal,
  getAiProposal,
  updateAiProposalStatus,
  deleteAiProposal,
  saveAiPendingAction,
  getAiPendingAction,
  clearAiPendingAction,
  updateAiPendingAction,
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
