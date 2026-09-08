/**
 * Utilitário de Isolamento Completo de Banco de Testes (CorvFin V2)
 *
 * Garante que suítes de teste nunca se conectem nem executem escritas/deleções
 * em bancos de homologação ou produção (ex: omnifin_v3_hml, financas_pro).
 */

const config = require('../../server/config/config');
const { connectDB, getDB, closeDB } = require('../../server/config/db');
const mongoStorage = require('../../server/services/mongoStorage');

const FORBIDDEN_TEST_DBS = [
  'omnifin_v3_hml',
  'financas_pro',
  'production',
  'admin',
  'local',
  'config'
];

/**
 * Validação rigorosa de fail-safe.
 * Aborta a execução antes de qualquer operação caso o nome do banco seja inválido ou aponte para ambiente real.
 */
function assertTestDatabaseName(dbName) {
  if (!dbName || typeof dbName !== 'string') {
    throw new Error(`[FAIL-SAFE BLOCKER] Invalid test database name: "${dbName}"`);
  }
  const clean = dbName.trim().toLowerCase();
  for (const forbidden of FORBIDDEN_TEST_DBS) {
    if (clean === forbidden || clean.includes('hml') || clean.includes('prod')) {
      throw new Error(
        `[FAIL-SAFE BLOCKER] Refusing to run tests against forbidden database: "${dbName}". Tests MUST run against an isolated test DB with a dedicated test prefix.`
      );
    }
  }
  if (!clean.startsWith('corvfin_test_') && !clean.startsWith('omnifin_test_')) {
    throw new Error(
      `[FAIL-SAFE BLOCKER] Database name "${dbName}" does not have required test prefix ('corvfin_test_' or 'omnifin_test_').`
    );
  }
}

/**
 * Gera um nome exclusivo e rastreável para o banco de teste descartável.
 */
function generateTestDbName(suitePrefix) {
  const safePrefix = (suitePrefix || 'suite').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  return `corvfin_test_${safePrefix}_${process.pid}_${Date.now()}`;
}

/**
 * Inicializa conexão isolada no MongoDB descartável, garantindo índices e fail-safe.
 */
async function setupIsolatedTestMongo(suitePrefix) {
  const testDbName = generateTestDbName(suitePrefix);

  assertTestDatabaseName(testDbName);

  await connectDB(testDbName);
  const db = getDB();

  assertTestDatabaseName(db.databaseName);
  if (db.databaseName !== testDbName) {
    throw new Error(`[FAIL-SAFE BLOCKER] Connected DB "${db.databaseName}" does not match target test DB "${testDbName}"`);
  }

  await mongoStorage.ensureMongoIndexes();

  return {
    testDbName,
    db
  };
}

/**
 * Limpa e destrói o banco de teste descartável de forma segura.
 */
async function teardownIsolatedTestMongo(testDbName) {
  try {
    let db = null;
    try {
      db = getDB();
    } catch (e) {}

    if (db) {
      assertTestDatabaseName(db.databaseName);
      if (db.databaseName === testDbName) {
        await db.dropDatabase();
      } else {
        throw new Error(`[FAIL-SAFE BLOCKER] Attempted to drop unexpected database: "${db.databaseName}" (expected "${testDbName}")`);
      }
    }
  } finally {
    await closeDB();
  }
}

module.exports = {
  FORBIDDEN_TEST_DBS,
  assertTestDatabaseName,
  generateTestDbName,
  setupIsolatedTestMongo,
  teardownIsolatedTestMongo
};
