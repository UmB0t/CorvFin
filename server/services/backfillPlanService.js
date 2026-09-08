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

module.exports = {
  backfillUserPlans
};
