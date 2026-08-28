const { getDB, connectDB } = require('../config/db');

// Maintenance Default Configuration Constants
const DEFAULT_MAINTENANCE_CONFIG = {
  despesas: { maintenance: false, name: 'Despesas' },
  extras: { maintenance: false, name: 'Rendas Extras' },
  devedores: { maintenance: false, name: 'Devedores' },
  investimentos: { maintenance: false, name: 'Investimentos' },
  beneficios: { maintenance: false, name: 'Benefícios' },
  compras: { maintenance: false, name: 'Lista de Compras' },
  simulacao: { maintenance: false, name: 'Simulação' }
};

const DEFAULT_PERMISSIONS_FALLBACK = {
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
    result[key] = {
      name: DEFAULT_MAINTENANCE_CONFIG[key].name,
      maintenance: saved && saved[key] && typeof saved[key].maintenance === 'boolean' ? saved[key].maintenance : false
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
function getDefaultUserFinances(userId, userName, userSalary = 0) {
  const now = new Date();
  return {
    userId,
    version: 5,
    revision: 0,
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
async function getUserFinances(userId, userName, userSalary = 0) {
  const col = await getCollection('finances');
  const doc = await col.findOne({ _id: userId });

  if (!doc) {
    const defaults = getDefaultUserFinances(userId, userName, userSalary);
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
    const newDoc = Object.assign({}, defaults, cleanData, {
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
  const updatePayload = Object.assign({}, cleanData, {
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
  getDefaultUserFinances,
  ensureMongoIndexes
};
