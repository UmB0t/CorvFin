/**
 * CorvFin V2 — Suíte de Testes do Lote 5C: EntitlementService + Vínculo de Plano no Usuário
 *
 * Cobertura de Testes:
 * Seção 25 (Entitlements Tests 1 a 25)
 * Seção 26 (Backfill Tests 26 a 31)
 * Seção 27 (Default / Startup Tests 32 a 35)
 */

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const config = require('../server/config/config');
const app = require('../server/server');
const { getDB } = require('../server/config/db');
const storageService = require('../server/services/storageService');
const mongoStorage = require('../server/services/mongoStorage');
const jsonStorage = require('../server/services/jsonStorage');
const planService = require('../server/services/planService');
const entitlementService = require('../server/services/entitlementService');
const { backfillUserPlans } = require('../server/services/backfillPlanService');
const {
  ENTITLEMENT_REGISTRY,
  getCompatibilityEntitlements
} = require('../server/config/entitlementRegistry');
const { generateToken, hashPassword } = require('../server/services/authService');
const {
  assertTestDatabaseName,
  setupIsolatedTestMongo,
  teardownIsolatedTestMongo
} = require('./helpers/testDbIsolation');

describe('Lote 5C — EntitlementService, Vínculo de Plano e Backfill (CorvFin V2)', () => {
  let server;
  let baseUrl;
  const isMongo = config.STORAGE_DRIVER === 'mongodb';
  const createdTestPlanIds = [];
  const createdTestUserIds = [];
  let defaultPlanInstance = null;
  let testDbInfo = null;

  const originalStorageDriver = config.STORAGE_DRIVER;
  const originalPlansFile = config.PLANS_FILE;
  const originalUsersFile = config.USERS_FILE;
  const tempTestDir = path.join(os.tmpdir(), `corvfin_test_5c_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tempTestPlansFile = path.join(tempTestDir, 'plans.json');
  const tempTestUsersFile = path.join(tempTestDir, 'users.json');

  before(async () => {
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true });
    }
    // Protege server/data contra qualquer escrita acidental em modo JSON
    config.PLANS_FILE = tempTestPlansFile;
    config.USERS_FILE = tempTestUsersFile;

    if (isMongo) {
      testDbInfo = await setupIsolatedTestMongo('entitlements');
    }

    // Garante que o plano default de compatibilidade esteja inicializado dentro do banco isolado
    defaultPlanInstance = await planService.ensureDefaultPlan();

    // Sobe o servidor Express em porta efêmera para testes de endpoints
    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Fecha o servidor HTTP
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    // Teardown completo e seguro do banco descartável do MongoDB
    if (isMongo && testDbInfo) {
      await teardownIsolatedTestMongo(testDbInfo.testDbName);
    }

    config.STORAGE_DRIVER = originalStorageDriver;
    config.PLANS_FILE = originalPlansFile;
    config.USERS_FILE = originalUsersFile;

    if (fs.existsSync(tempTestDir)) {
      try {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      } catch (e) {}
    }
  });

  beforeEach(() => {
    planService.clearCache();
  });

  afterEach(() => {
    planService.clearCache();
  });

  // Helper para registrar planos de teste rastreados
  async function createTrackedPlan(data) {
    const plan = await planService.createPlan(data);
    createdTestPlanIds.push(plan._id);
    return plan;
  }

  // Helper para registrar usuários de teste rastreados
  async function createTrackedUser(userObj) {
    const users = await storageService.getUsers();
    users.push(userObj);
    await storageService.saveUsers(users);
    createdTestUserIds.push(userObj.id);
    return userObj;
  }

  /* ========================================================================
     SEÇÃO 25: ENTITLEMENT SERVICE (Testes 1 a 25)
     ======================================================================== */
  test('1. user sem planId (undefined) resolve temporariamente para defaultPlan (compatibilidade)', async () => {
    const userLegacy = { id: `u_leg_${Date.now()}` };
    const resolved = await entitlementService.getPlanForUser(userLegacy);

    assert.ok(resolved);
    assert.strictEqual(resolved._id, defaultPlanInstance._id);
    assert.strictEqual(resolved.isDefault, true);
  });

  test('2. user planId=null resolve temporariamente para defaultPlan (compatibilidade)', async () => {
    const userNull = { id: `u_null_${Date.now()}`, planId: null };
    const resolved = await entitlementService.getPlanForUser(userNull);

    assert.ok(resolved);
    assert.strictEqual(resolved._id, defaultPlanInstance._id);
    assert.strictEqual(resolved.isDefault, true);
  });

  test('3. user com planId válido resolve exatamente o plano apontado', async () => {
    const customPlan = await createTrackedPlan({
      name: 'Plano Específico 5C',
      slug: `custom-5c-${Date.now()}`,
      pricing: { amountCents: 1500, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });

    const userWithPlan = { id: `u_spec_${Date.now()}`, planId: customPlan._id };
    const resolved = await entitlementService.getPlanForUser(userWithPlan);

    assert.strictEqual(resolved._id, customPlan._id);
    assert.strictEqual(resolved.name, 'Plano Específico 5C');
  });

  test('4. planId inválido ou inexistente lança PLAN_REFERENCE_INVALID (Fail-Closed)', async () => {
    const userBroken = { id: `u_broken_${Date.now()}`, planId: 'plan_inexistente_12345' };

    await assert.rejects(async () => {
      await entitlementService.getPlanForUser(userBroken);
    }, (err) => {
      assert.strictEqual(err.code, 'PLAN_REFERENCE_INVALID');
      assert.strictEqual(err.status, 403);
      return true;
    });
  });

  test('5. plano inactive vinculado continua resolvendo normalmente para o usuário', async () => {
    const inactivePlan = await createTrackedPlan({
      name: 'Plano Inativo Vinculado',
      slug: `inactive-vinc-${Date.now()}`,
      status: 'active',
      pricing: { amountCents: 1000, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });

    // Inativa o plano no catálogo
    await planService.setPlanStatus(inactivePlan._id, 'inactive');

    // Usuário já possuía o vínculo anterior
    const user = { id: `u_inact_${Date.now()}`, planId: inactivePlan._id };
    const resolved = await entitlementService.getPlanForUser(user);

    assert.strictEqual(resolved._id, inactivePlan._id);
    assert.strictEqual(resolved.status, 'inactive');
  });

  test('6. plano archived vinculado continua resolvendo normalmente para o usuário', async () => {
    const archivedPlan = await createTrackedPlan({
      name: 'Plano Arquivado Vinculado',
      slug: `archived-vinc-${Date.now()}`,
      status: 'active',
      pricing: { amountCents: 1000, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });

    await planService.setPlanStatus(archivedPlan._id, 'archived');

    const user = { id: `u_arch_${Date.now()}`, planId: archivedPlan._id };
    const resolved = await entitlementService.getPlanForUser(user);

    assert.strictEqual(resolved._id, archivedPlan._id);
    assert.strictEqual(resolved.status, 'archived');
  });

  test('7. Admin NÃO possui bypass comercial implícito (is_admin não altera resultado)', async () => {
    // Cria plano com relatorios desabilitado
    const ents = getCompatibilityEntitlements();
    ents.relatorios.enabled = false;

    const restrictedPlan = await createTrackedPlan({
      name: 'Plano Sem Relatórios',
      slug: `no-reports-${Date.now()}`,
      pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
      entitlements: ents
    });

    const adminUser = {
      id: `u_admin_${Date.now()}`,
      is_admin: true,
      planId: restrictedPlan._id,
      permissions: { relatorios: true }
    };

    const allowed = await entitlementService.canAccess(adminUser, 'relatorios');
    assert.strictEqual(allowed, false, 'Admin não deve ter bypass comercial');

    await assert.rejects(async () => {
      await entitlementService.assertAccess(adminUser, 'relatorios');
    }, /PLAN_ACCESS_DENIED/);
  });

  test('8. Regra combinada: plano false + permission true = false', async () => {
    const ents = getCompatibilityEntitlements();
    ents.simulacao.enabled = false;

    const plan = await createTrackedPlan({
      name: 'Plano Sem Simulação',
      slug: `no-sim-${Date.now()}`,
      pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
      entitlements: ents
    });

    const user = {
      id: `u_test8_${Date.now()}`,
      planId: plan._id,
      permissions: { simulacao: true }
    };

    const allowed = await entitlementService.canAccess(user, 'simulacao');
    assert.strictEqual(allowed, false);
  });

  test('9. Regra combinada: plano true + permission false = false', async () => {
    const plan = defaultPlanInstance; // relatorios.enabled = true
    const user = {
      id: `u_test9_${Date.now()}`,
      planId: plan._id,
      permissions: { relatorios: false } // Desativado pelo admin no RBAC individual
    };

    const allowed = await entitlementService.canAccess(user, 'relatorios');
    assert.strictEqual(allowed, false);
  });

  test('10. Regra combinada: plano true + permission true = true', async () => {
    const plan = defaultPlanInstance;
    const user = {
      id: `u_test10_${Date.now()}`,
      planId: plan._id,
      permissions: { despesas: true }
    };

    const allowed = await entitlementService.canAccess(user, 'despesas');
    assert.strictEqual(allowed, true);
  });

  test('11. Entitlement ausente no Plan = Fail-Closed com PLAN_CONFIGURATION_INVALID', async () => {
    // Constrói documento de plano malformado diretamente no mock
    const corruptPlan = {
      _id: 'plan_corrupt_test',
      slug: 'corrupt-test',
      status: 'active',
      isDefault: false,
      pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
      entitlements: {
        dashboard: { enabled: true, limits: {} }
        // Recursos restantes ausentes
      }
    };

    const user = {
      id: `u_corrupt_${Date.now()}`,
      _resolvedPlan: corruptPlan
    };

    await assert.rejects(async () => {
      await entitlementService.getEffectiveEntitlements(user);
    }, (err) => {
      assert.strictEqual(err.code, 'PLAN_CONFIGURATION_INVALID');
      assert.strictEqual(err.status, 500);
      return true;
    });
  });

  test('12. Resource desconhecido no canAccess/assertAccess rejeita com erro', async () => {
    const user = { id: `u_unk_${Date.now()}`, planId: defaultPlanInstance._id };

    await assert.rejects(async () => {
      await entitlementService.canAccess(user, 'perfil');
    }, /not a valid commercial entitlement resource/);

    await assert.rejects(async () => {
      await entitlementService.assertAccess(user, 'configuracoes');
    }, /not a valid commercial entitlement resource/);
  });

  test('13. getLimit com valor null retorna null (unlimited)', async () => {
    const user = { id: `u_lim1_${Date.now()}`, planId: defaultPlanInstance._id };
    const limit = await entitlementService.getLimit(user, 'devedores', 'maxItems');
    assert.strictEqual(limit, null);
  });

  test('14. getLimit com valor 0 retorna 0 (zero permitido)', async () => {
    const ents = getCompatibilityEntitlements();
    ents.devedores.limits.maxItems = 0;

    const plan = await createTrackedPlan({
      name: 'Plano Zero Devedores',
      slug: `zero-dev-${Date.now()}`,
      pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
      entitlements: ents
    });

    const user = { id: `u_lim2_${Date.now()}`, planId: plan._id };
    const limit = await entitlementService.getLimit(user, 'devedores', 'maxItems');
    assert.strictEqual(limit, 0);
  });

  test('15. getLimit com inteiro positivo retorna o teto numérico', async () => {
    const ents = getCompatibilityEntitlements();
    ents.investimentos.limits.maxItems = 25;
    ents.ai.limits.creditsPerDay = 50;

    const plan = await createTrackedPlan({
      name: 'Plano Com Tetos',
      slug: `capped-${Date.now()}`,
      pricing: { amountCents: 1990, currency: 'BRL', interval: 'month' },
      entitlements: ents
    });

    const user = { id: `u_lim3_${Date.now()}`, planId: plan._id };
    const limitInv = await entitlementService.getLimit(user, 'investimentos', 'maxItems');
    assert.strictEqual(limitInv, 25);

    const limitAi = await entitlementService.getLimit(user, 'ai', 'creditsPerDay');
    assert.strictEqual(limitAi, 50);
  });

  test('16. missing limitKey no Plan = Fail-Closed (PLAN_CONFIGURATION_INVALID)', async () => {
    const badPlan = {
      _id: 'plan_missing_lim',
      slug: 'missing-lim',
      status: 'active',
      isDefault: false,
      pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
      entitlements: {
        ...getCompatibilityEntitlements(),
        devedores: { enabled: true, limits: {} } // Sem a chave maxItems!
      }
    };

    const user = { id: `u_lim4_${Date.now()}`, _resolvedPlan: badPlan };

    await assert.rejects(async () => {
      await entitlementService.getLimit(user, 'devedores', 'maxItems');
    }, (err) => {
      assert.strictEqual(err.code, 'PLAN_CONFIGURATION_INVALID');
      return true;
    });
  });

  test('17. assertAccess negado lança erro com status 403 e code PLAN_ACCESS_DENIED', async () => {
    const ents = getCompatibilityEntitlements();
    ents.beneficios.enabled = false;

    const plan = await createTrackedPlan({
      name: 'Plano Sem Benefícios',
      slug: `no-ben-${Date.now()}`,
      pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
      entitlements: ents
    });

    const user = { id: `u_assert1_${Date.now()}`, planId: plan._id };

    await assert.rejects(async () => {
      await entitlementService.assertAccess(user, 'beneficios');
    }, (err) => {
      assert.strictEqual(err.status, 403);
      assert.strictEqual(err.code, 'PLAN_ACCESS_DENIED');
      assert.strictEqual(err.resource, 'beneficios');
      return true;
    });
  });

  test('18. assertAccess permitido retorna true sem lançar erro', async () => {
    const user = { id: `u_assert2_${Date.now()}`, planId: defaultPlanInstance._id };
    const ok = await entitlementService.assertAccess(user, 'dashboard');
    assert.strictEqual(ok, true);
  });

  test('19. req.user no authMiddleware preserva integralmente todos os campos legados', async () => {
    const testUser = await createTrackedUser({
      id: `usr_mw_leg_${Date.now()}`,
      login: `testmw_${Date.now()}`,
      nome: 'Usuário Teste MW',
      email: `testmw_${Date.now()}@corvfin.com.br`,
      senha: await hashPassword('SenhaSegura123!'),
      is_admin: false,
      notificacoes_ativas: true,
      tokenVersion: 0,
      createdAt: new Date().toISOString()
    });

    const token = generateToken(testUser);

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.id, testUser.id);
    assert.strictEqual(data.user.login, testUser.login);
    assert.strictEqual(data.user.nome, testUser.nome);
    assert.strictEqual(data.user.email, testUser.email);
    assert.strictEqual(data.user.is_admin, false);
    assert.strictEqual(data.user.notificacoes_ativas, true);
    assert.strictEqual(data.user.tokenVersion, 0);
    assert.ok(data.user.permissions);
  });

  test('20. req.user recebe planId, plan resumido e entitlements resolvidos', async () => {
    const testUser = await createTrackedUser({
      id: `usr_mw_plan_${Date.now()}`,
      login: `testplan_${Date.now()}`,
      nome: 'Usuário Com Plano',
      email: `testplan_${Date.now()}@corvfin.com.br`,
      senha: await hashPassword('SenhaSegura123!'),
      is_admin: false,
      planId: defaultPlanInstance._id,
      tokenVersion: 0,
      createdAt: new Date().toISOString()
    });

    const token = generateToken(testUser);
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.user.planId, defaultPlanInstance._id);
    assert.deepStrictEqual(data.user.plan, {
      id: defaultPlanInstance._id,
      name: defaultPlanInstance.name,
      slug: defaultPlanInstance.slug
    });
    assert.ok(data.user.entitlements);
    assert.strictEqual(data.user.entitlements.dashboard.enabled, true);
    assert.strictEqual(data.user._resolvedPlan, undefined, '_resolvedPlan não deve ser exposto na resposta JSON');
  });

  test('20b. cache intra-request _resolvedPlan é estritamente non-enumerable e não vaza em JSON nem Object.keys', async () => {
    const userObj = { id: `u_sec_cache_${Date.now()}`, planId: defaultPlanInstance._id };
    const plan = await entitlementService.getPlanForUser(userObj);

    assert.ok(plan);
    assert.strictEqual(userObj._resolvedPlan._id, plan._id);
    // Deve ser invisível para JSON.stringify e Object.keys
    assert.ok(!Object.keys(userObj).includes('_resolvedPlan'), 'Object.keys não deve incluir _resolvedPlan');
    assert.ok(!JSON.stringify(userObj).includes('_resolvedPlan'), 'JSON.stringify não deve incluir _resolvedPlan');
  });

  test('20c. getEffectiveEntitlements integra permissões mescladas (getUserPermissions) com fallback de defaults', async () => {
    // Cria usuário no storage sem passar objeto permissions em memória
    const trackedUser = await createTrackedUser({
      id: `usr_rbac_merge_${Date.now()}`,
      login: `rbacmerge_${Date.now()}`,
      nome: 'Usuário RBAC Merge',
      email: `rbacmerge_${Date.now()}@corvfin.com.br`,
      senha: await hashPassword('SenhaForte123!'),
      is_admin: false,
      tokenVersion: 0,
      createdAt: new Date().toISOString()
    });

    // Define override de permissão desativando investimentos para este usuário específico
    await storageService.setUserPermissions(trackedUser.id, { investimentos: false });

    // Chama getEffectiveEntitlements passando apenas { id, planId }
    const userWithoutPerms = { id: trackedUser.id, planId: defaultPlanInstance._id };
    const effective = await entitlementService.getEffectiveEntitlements(userWithoutPerms);

    // No plano default, investimentos.enabled = true. Mas a permissão individual é false!
    assert.strictEqual(effective.investimentos.enabled, false, 'Permissão individual false deve prevalecer');
    // Outros módulos com default true continuam true
    assert.strictEqual(effective.dashboard.enabled, true);
  });

  test('21. novo auto-cadastro público recebe automaticamente default planId', async () => {
    const regPayload = {
      nome: 'Novo Registrado 5C',
      login: `reg5c_${Date.now()}`,
      email: `reg5c_${Date.now()}@corvfin.com.br`,
      senha: 'SenhaValida123!'
    };

    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(regPayload)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    // Consulta usuário persistido no storage
    const users = await storageService.getUsers();
    const created = users.find(u => u.login === regPayload.login);
    assert.ok(created);
    assert.strictEqual(created.planId, defaultPlanInstance._id);
    createdTestUserIds.push(created.id);
  });

  test('22. criação via painel Admin recebe automaticamente default planId', async () => {
    // Cria admin para a requisição
    const adminUser = await createTrackedUser({
      id: `usr_adm_cr_${Date.now()}`,
      login: `admcr_${Date.now()}`,
      nome: 'Admin Master',
      email: `admcr_${Date.now()}@corvfin.com.br`,
      senha: await hashPassword('SenhaAdmin123!'),
      is_admin: true,
      tokenVersion: 0,
      createdAt: new Date().toISOString()
    });
    const adminToken = generateToken(adminUser);

    const newPayload = {
      nome: 'Usuário Criado Pelo Admin',
      login: `admincreated_${Date.now()}`,
      email: `admincreated_${Date.now()}@corvfin.com.br`,
      senha: 'SenhaUsuario123!'
    };

    const res = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(newPayload)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    const users = await storageService.getUsers();
    const created = users.find(u => u.login === newPayload.login);
    assert.ok(created);
    assert.strictEqual(created.planId, defaultPlanInstance._id);
    createdTestUserIds.push(created.id);
  });

  test('23. registro público não consegue escolher ou adulterar planId arbitrário', async () => {
    const maliciousPayload = {
      nome: 'Invasor de Plano',
      login: `hackplan_${Date.now()}`,
      email: `hackplan_${Date.now()}@corvfin.com.br`,
      senha: 'SenhaValida123!',
      planId: 'plan_custom_privilegiado' // Tentativa de injeção
    };

    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(maliciousPayload)
    });

    assert.strictEqual(res.status, 201);
    const users = await storageService.getUsers();
    const created = users.find(u => u.login === maliciousPayload.login);
    assert.ok(created);
    // Deve ser o default real do sistema, ignorando o payload malicioso
    assert.strictEqual(created.planId, defaultPlanInstance._id);
    createdTestUserIds.push(created.id);
  });

  test('24. usuário legado sem planId no banco continua autenticando normalmente via fallback default', async () => {
    const legacyUser = await createTrackedUser({
      id: `usr_legacy_auth_${Date.now()}`,
      login: `legacyauth_${Date.now()}`,
      nome: 'Usuário Legado Antigo',
      email: `legacyauth_${Date.now()}@corvfin.com.br`,
      senha: await hashPassword('SenhaLegada123!'),
      is_admin: false,
      tokenVersion: 0,
      createdAt: new Date().toISOString()
      // planId omitido
    });

    const token = generateToken(legacyUser);
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.user.planId, defaultPlanInstance._id);
    assert.strictEqual(data.user.plan.slug, 'free');
  });

  test('25. usuário com planId quebrado falha autenticação de forma explícita com 403 PLAN_REFERENCE_INVALID (Fail-Closed)', async () => {
    const corruptedUser = await createTrackedUser({
      id: `usr_corrupted_${Date.now()}`,
      login: `corruptauth_${Date.now()}`,
      nome: 'Usuário com Chave Quebrada',
      email: `corruptauth_${Date.now()}@corvfin.com.br`,
      senha: await hashPassword('SenhaCorrompida123!'),
      planId: 'plan_fantasma_inexistente_999',
      is_admin: false,
      tokenVersion: 0,
      createdAt: new Date().toISOString()
    });

    const token = generateToken(corruptedUser);
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, 'PLAN_REFERENCE_INVALID');
  });

  /* ========================================================================
     SEÇÃO 26: TESTES DE BACKFILL (Testes 26 a 31)
     ======================================================================== */
  test('26. backfill: usuário sem planId recebe defaultPlan', async () => {
    config.USERS_FILE = tempTestUsersFile;
    try {
      const testUsers = [
        { id: 'u_bf_1', nome: 'Sem PlanId' } // sem planId
      ];

      jsonStorage.saveUsers(testUsers);

      const res = await backfillUserPlans({ driver: 'json' });
      assert.strictEqual(res.modifiedCount, 1);

      const reloaded = jsonStorage.getUsers();
      assert.strictEqual(reloaded[0].planId, defaultPlanInstance._id);
    } finally {
      config.USERS_FILE = tempTestUsersFile;
    }
  });

  test('27. backfill: usuário com planId=null recebe defaultPlan', async () => {
    config.USERS_FILE = tempTestUsersFile;
    try {
      const testUsers = [
        { id: 'u_bf_2', nome: 'PlanId Null', planId: null }
      ];

      jsonStorage.saveUsers(testUsers);

      const res = await backfillUserPlans({ driver: 'json' });
      assert.strictEqual(res.modifiedCount, 1);

      const reloaded = jsonStorage.getUsers();
      assert.strictEqual(reloaded[0].planId, defaultPlanInstance._id);
    } finally {
      config.USERS_FILE = tempTestUsersFile;
    }
  });

  test('28. backfill: usuário com planId válido pré-existente NÃO é alterado', async () => {
    config.USERS_FILE = tempTestUsersFile;
    try {
      const testUsers = [
        { id: 'u_bf_3', nome: 'Plano Pro Já Existente', planId: 'plan_pro_existente' }
      ];

      jsonStorage.saveUsers(testUsers);

      const res = await backfillUserPlans({ driver: 'json' });
      assert.strictEqual(res.modifiedCount, 0);

      const reloaded = jsonStorage.getUsers();
      assert.strictEqual(reloaded[0].planId, 'plan_pro_existente');
    } finally {
      config.USERS_FILE = tempTestUsersFile;
    }
  });

  test('29. backfill: usuário com planId inválido não é sobrescrito automaticamente (preserva auditoria)', async () => {
    config.USERS_FILE = tempTestUsersFile;
    try {
      const testUsers = [
        { id: 'u_bf_4', nome: 'PlanId Corrompido', planId: 'plan_inexistente_nao_migrar' }
      ];

      jsonStorage.saveUsers(testUsers);

      const res = await backfillUserPlans({ driver: 'json' });
      assert.strictEqual(res.modifiedCount, 0, 'Não deve sobrescrever planId existente mesmo se inválido');

      const reloaded = jsonStorage.getUsers();
      assert.strictEqual(reloaded[0].planId, 'plan_inexistente_nao_migrar');
    } finally {
      config.USERS_FILE = tempTestUsersFile;
    }
  });

  test('30. backfill: execução repetida é 100% idempotente', async () => {
    config.USERS_FILE = tempTestUsersFile;
    try {
      const testUsers = [
        { id: 'u_bf_5', nome: 'Usuário Idempotente' }
      ];

      jsonStorage.saveUsers(testUsers);

      const res1 = await backfillUserPlans({ driver: 'json' });
      assert.strictEqual(res1.modifiedCount, 1);

      // Segunda execução consecutiva
      const res2 = await backfillUserPlans({ driver: 'json' });
      assert.strictEqual(res2.modifiedCount, 0, 'Segunda execução deve modificar 0 registros');
    } finally {
      config.USERS_FILE = tempTestUsersFile;
    }
  });

  test('31. backfill: contagem e métrica de registros alterados reportam valores corretos', async () => {
    config.USERS_FILE = tempTestUsersFile;
    try {
      const testUsers = [
        { id: 'u_m_1', nome: 'U1' }, // elegível
        { id: 'u_m_2', nome: 'U2', planId: null }, // elegível
        { id: 'u_m_3', nome: 'U3', planId: 'plan_existente' }, // ignorado
        { id: 'u_m_4', nome: 'U4' } // elegível
      ];

      jsonStorage.saveUsers(testUsers);

      const res = await backfillUserPlans({ driver: 'json' });
      assert.strictEqual(res.modifiedCount, 3);
      assert.strictEqual(res.matchedCount, 3);
      assert.strictEqual(res.defaultPlanId, defaultPlanInstance._id);
    } finally {
      config.USERS_FILE = tempTestUsersFile;
    }
  });

  /* ========================================================================
     SEÇÃO 27: TESTES DE DEFAULT / STARTUP DOMAIN BOOTSTRAP (Testes 32 a 35)
     ======================================================================== */
  test('32. startup domain bootstrap cria default quando storage está vazio', async () => {
    const originalDriver = config.STORAGE_DRIVER;
    try {
      config.STORAGE_DRIVER = 'json';
      config.PLANS_FILE = tempTestPlansFile;
      if (fs.existsSync(tempTestPlansFile)) fs.unlinkSync(tempTestPlansFile);
      planService.clearCache();

      // Executa o bootstrap explícito de domínio
      const bootPlan = await app.initDomainBootstrap();
      assert.ok(bootPlan);
      assert.strictEqual(bootPlan.slug, 'free');
      assert.strictEqual(bootPlan.isDefault, true);
    } finally {
      config.STORAGE_DRIVER = originalDriver;
      config.PLANS_FILE = tempTestPlansFile;
      planService.clearCache();
    }
  });

  test('33. startup domain bootstrap não duplica default se já existir', async () => {
    const firstCall = await app.initDomainBootstrap();
    const secondCall = await app.initDomainBootstrap();

    assert.strictEqual(firstCall._id, secondCall._id);
    assert.strictEqual(firstCall.slug, secondCall.slug);
  });

  test('34. startup com conflito fail-closed impede inicialização limpa', async () => {
    const originalDriver = config.STORAGE_DRIVER;
    try {
      config.STORAGE_DRIVER = 'json';
      config.PLANS_FILE = tempTestPlansFile;
      // Cria free inativo e sem default ativo
      const conflictPlans = [
        {
          _id: 'plan_conflict_free',
          name: 'Free Inativo Administrativo',
          slug: 'free',
          status: 'inactive',
          isDefault: false,
          pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
          entitlements: getCompatibilityEntitlements()
        }
      ];
      fs.writeFileSync(tempTestPlansFile, JSON.stringify(conflictPlans, null, 2), 'utf-8');
      planService.clearCache();

      await assert.rejects(async () => {
        await app.initDomainBootstrap();
      }, (err) => {
        assert.strictEqual(err.code, 'DEFAULT_PLAN_SEED_CONFLICT');
        return true;
      });
    } finally {
      config.STORAGE_DRIVER = originalDriver;
      config.PLANS_FILE = tempTestPlansFile;
      planService.clearCache();
    }
  });

  test('35. require/import isolado de app e planService continua sem nenhum side effect automático', () => {
    // Apenas requer os módulos novamente
    const reqApp = require('../server/server');
    const reqPlanService = require('../server/services/planService');
    const reqEntitlements = require('../server/services/entitlementService');

    assert.ok(reqApp);
    assert.ok(reqPlanService);
    assert.ok(reqEntitlements);
  });
});
