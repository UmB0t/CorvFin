/**
 * BackfillPlanService — Utilitário de Migração Segura e Idempotente de Usuários (CorvFin V2)
 *
 * Objetivo:
 * Atribuir users.planId = defaultPlan._id para usuários legados (planId ausente ou null).
 *
 * Regras:
 * - NÃO executa por import;
 * - 100% Idempotente (execuções repetidas reportam modifiedCount: 0);
 * - NÃO sobrescreve planId existente válido;
 * - NÃO corrige silenciosamente planId quebrado (preserva estado para auditoria de integridade);
 * - Funciona com paridade em MongoDB e JSON Storage.
 */

const config = require('../config/config');
const planService = require('./planService');
const storageService = require('./storageService');
const jsonStorage = require('./jsonStorage');
const { getDB, connectDB } = require('../config/db');

async function backfillUserPlans(options = {}) {
  const defaultPlan = await planService.getDefaultPlan();
  if (!defaultPlan || !defaultPlan._id) {
    const err = new Error('Cannot perform backfill: No default plan is configured in the system');
    err.code = 'DEFAULT_PLAN_NOT_FOUND';
    throw err;
  }

  const driver = options.driver || storageService.getDriver();

  if (driver === 'mongodb') {
    let db;
    try {
      db = getDB();
    } catch (e) {
      db = await connectDB();
    }
    const col = db.collection('users');

    // Filtro estrito: apenas documentos onde planId não existe ou é explicitamente nulo
    const baseFilter = options.filter || {};
    const filter = {
      ...baseFilter,
      $or: [
        { planId: { $exists: false } },
        { planId: null }
      ]
    };

    const result = await col.updateMany(filter, {
      $set: { planId: defaultPlan._id }
    });

    return {
      driver: 'mongodb',
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      defaultPlanId: defaultPlan._id,
      defaultPlanSlug: defaultPlan.slug
    };
  }

  // Driver JSON
  const users = (driver === 'json') ? jsonStorage.getUsers() : await storageService.getUsers();
  let modifiedCount = 0;
  let matchedCount = 0;

  for (const user of users) {
    if (user.planId === undefined || user.planId === null) {
      matchedCount++;
      user.planId = defaultPlan._id;
      modifiedCount++;
    }
  }

  if (modifiedCount > 0) {
    if (driver === 'json') {
      jsonStorage.saveUsers(users);
    } else {
      await storageService.saveUsers(users);
    }
  }

  return {
    driver: 'json',
    matchedCount,
    modifiedCount,
    defaultPlanId: defaultPlan._id,
    defaultPlanSlug: defaultPlan.slug
  };
}

/**
 * Realiza evolução de schema/backfill nos documentos de planos existentes,
 * garantindo que limites novos do registry canônico ausentes em planos já persistidos
 * sejam preenchidos explicitamente com `null` (unlimited).
 *
 * Invariantes:
 * - 100% idempotente;
 * - Preserva estritamente limites existentes (0, N positivo, null);
 * - Suporta options.dryRun (default: false);
 * - NÃO executa automaticamente contra banco de produção/HML.
 */
async function backfillPlanEntitlements(options = {}) {
  const driver = options.driver || (storageService.getDriver ? storageService.getDriver() : config.STORAGE_DRIVER);
  const dryRun = !!options.dryRun;
  const { normalizePlanEntitlements } = require('../config/entitlementRegistry');

  let matchedCount = 0;
  let modifiedCount = 0;

  if (driver === 'mongodb') {
    let db;
    try {
      db = getDB();
    } catch (e) {
      db = await connectDB();
    }
    const col = db.collection('plans');
    const plans = await col.find({}).toArray();

    for (const plan of plans) {
      const originalEntitlements = JSON.stringify(plan.entitlements || {});
      const normalizedEntitlements = normalizePlanEntitlements(JSON.parse(originalEntitlements));
      const hasChanges = JSON.stringify(normalizedEntitlements) !== originalEntitlements;

      if (hasChanges) {
        matchedCount++;
        if (!dryRun) {
          await col.updateOne(
            { _id: plan._id },
            {
              $set: {
                entitlements: normalizedEntitlements,
                updatedAt: new Date().toISOString()
              }
            }
          );
          modifiedCount++;
        }
      }
    }

    if (!dryRun && modifiedCount > 0) {
      planService.invalidateCache();
    }

    return {
      driver: 'mongodb',
      dryRun,
      matchedCount,
      modifiedCount
    };
  }

  // Driver JSON
  const rawPlans = (driver === 'json') ? jsonStorage.getRawPlans() : await storageService.getPlans();
  for (const plan of rawPlans) {
    const originalEntitlements = JSON.stringify(plan.entitlements || {});
    const normalizedEntitlements = normalizePlanEntitlements(JSON.parse(originalEntitlements));
    const hasChanges = JSON.stringify(normalizedEntitlements) !== originalEntitlements;

    if (hasChanges) {
      matchedCount++;
      if (!dryRun) {
        plan.entitlements = normalizedEntitlements;
        plan.updatedAt = new Date().toISOString();
        modifiedCount++;
      }
    }
  }

  if (!dryRun && modifiedCount > 0) {
    if (driver === 'json') {
      jsonStorage.saveRawPlans(rawPlans);
    }
    planService.invalidateCache();
  }

  return {
    driver: 'json',
    dryRun,
    matchedCount,
    modifiedCount
  };
}

module.exports = {
  backfillUserPlans,
  backfillPlanEntitlements
};
