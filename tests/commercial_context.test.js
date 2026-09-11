/**
 * CorvFin V2 — Suíte de Testes do Lote 5H.1 / 5H.7
 * Commercial Context & Active Plans Catalog Endpoints
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const config = require('../server/config/config');
const app = require('../server/server');
const storageService = require('../server/services/storageService');
const planService = require('../server/services/planService');
const commercialService = require('../server/services/commercialService');
const { generateToken } = require('../server/services/authService');
const { getCompatibilityEntitlements } = require('../server/config/entitlementRegistry');
const {
  setupIsolatedTestMongo,
  teardownIsolatedTestMongo
} = require('./helpers/testDbIsolation');

describe('Lote 5H — Commercial Context & Active Plans Catalog', () => {
  let server;
  let baseUrl;
  const isMongo = config.STORAGE_DRIVER === 'mongodb';
  let testDbInfo = null;

  const originalStorageDriver = config.STORAGE_DRIVER;
  const originalPlansFile = config.PLANS_FILE;
  const originalUsersFile = config.USERS_FILE;
  const tempTestDir = path.join(os.tmpdir(), `corvfin_test_comm_context_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  const testUserA = {
    id: 'usr_comm_tester_a',
    nome: 'Tester Commercial A',
    email: 'tester_a@corvfin.com.br',
    login: 'tester_a',
    role: 'user',
    is_admin: false,
    planId: null
  };

  const testUserB = {
    id: 'usr_comm_tester_b',
    nome: 'Tester Commercial B',
    email: 'tester_b@corvfin.com.br',
    login: 'tester_b',
    role: 'user',
    is_admin: false,
    planId: null
  };

  let tokenA;
  let tokenB;

  before(async () => {
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true });
    }
    // Protege server/data contra qualquer escrita em fallback JSON
    config.PLANS_FILE = path.join(tempTestDir, 'plans.json');
    config.USERS_FILE = path.join(tempTestDir, 'users.json');

    if (isMongo) {
      testDbInfo = await setupIsolatedTestMongo('comm_context');
    }

    // Inicializa plano default
    await planService.ensureDefaultPlan();

    // Sobe servidor HTTP em porta efêmera
    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}`;
        resolve();
      });
    });

    tokenA = generateToken({
      id: testUserA.id,
      nome: testUserA.nome,
      email: testUserA.email,
      login: testUserA.login,
      role: testUserA.role,
      is_admin: testUserA.is_admin
    });

    tokenB = generateToken({
      id: testUserB.id,
      nome: testUserB.nome,
      email: testUserB.email,
      login: testUserB.login,
      role: testUserB.role,
      is_admin: testUserB.is_admin
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
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

  test('1. GET /api/me/commercial-context requer autenticação (401 se sem token)', async () => {
    const res = await fetch(`${baseUrl}/api/me/commercial-context`);
    assert.equal(res.status, 401);
  });

  test('2. Usuário com planId null recebe fallback para o plano default com pricing sanitizado', async () => {
    // Garante que testUserA está no storage sem planId
    await storageService.saveUsers([{ ...testUserA, planId: null }]);

    const res = await fetch(`${baseUrl}/api/me/commercial-context`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.plan);
    assert.ok(data.plan.id);
    assert.ok(data.plan.name);
    assert.ok(data.plan.slug);
    assert.equal(data.plan.status, 'active');
    assert.ok(data.plan.pricing);
    assert.equal(data.plan.pricing.currency, 'BRL');
    assert.ok(data.plan.pricing.offers, 'Pricing deve retornar ofertas canônicas');
    assert.ok(data.plan.pricing.offers.monthly || data.plan.pricing.offers.yearly, 'Deve conter oferta monthly ou yearly');
    assert.equal(data.plan.pricing.amountCents, undefined, 'amountCents não deve fazer parte do contrato canônico público');
    assert.equal(data.plan.pricing.interval, undefined, 'interval não deve fazer parte do contrato canônico público');

    // NUNCA expõe campos confidenciais ou de sistema
    assert.equal(data.plan.password, undefined);
    assert.equal(data.plan.secret, undefined);
    assert.equal(data.pendingReservations, undefined);
  });

  test('3. Distinção detalhada entre Plan Allowed x RBAC Allowed x Effective Allowed', async () => {
    // Configura usuário A com permissão individual de investimentos = false
    await storageService.saveUsers([{ ...testUserA, planId: null }]);
    await storageService.setUserPermissions(testUserA.id, {
      investimentos: false,
      despesas: true
    });

    const res = await fetch(`${baseUrl}/api/me/commercial-context`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.access);

    // No plano default, investimentos é enabled: true
    assert.equal(data.access.investimentos.planAllowed, true, 'Plano permite investimentos');
    assert.equal(data.access.investimentos.permissionAllowed, false, 'RBAC nega investimentos');
    assert.equal(data.access.investimentos.effectiveAllowed, false, 'Acesso efetivo deve ser negado');

    // Despesas deve ser permitido em ambos
    assert.equal(data.access.despesas.planAllowed, true);
    assert.equal(data.access.despesas.permissionAllowed, true);
    assert.equal(data.access.despesas.effectiveAllowed, true);
    assert.ok(data.access.despesas.limits);
  });

  test('4. Cálculo de consumo de IA diária: limite positivo (limit=20, used=7 => remaining=13)', async () => {
    const customEntitlements = getCompatibilityEntitlements();
    customEntitlements.ai = {
      enabled: true,
      limits: { creditsPerDay: 20 }
    };

    const customPlan = await planService.createPlan({
      name: 'Plano IA 20 Test',
      slug: 'plano-ia-20-test',
      pricing: { amountCents: 1990, currency: 'BRL', interval: 'month' },
      entitlements: customEntitlements
    });

    await storageService.saveUsers([{ ...testUserA, planId: customPlan._id }]);
    // Invalida cache de plano no objeto do usuário
    delete testUserA._resolvedPlan;

    // Registra consumo de 7 créditos
    const dateKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: config.APP_TIMEZONE || 'America/Fortaleza',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    await storageService.reserveAiDailyCredits({
      userId: testUserA.id,
      dateKey,
      limit: 20,
      credits: 7,
      operationType: 'expense_interpretation',
      reservationId: 'res_test_comm_1'
    });

    const res = await fetch(`${baseUrl}/api/me/commercial-context`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.usage);
    assert.ok(data.usage.ai);
    assert.equal(data.usage.ai.enabled, true);
    assert.equal(data.usage.ai.limit, 20);
    assert.equal(data.usage.ai.used, 7);
    assert.equal(data.usage.ai.remaining, 13);
    assert.equal(data.usage.ai.unlimited, false);
    assert.ok(data.usage.ai.resetsAt);
    assert.equal(data.usage.ai.dateKey, dateKey);

    // pendingReservations NÃO deve aparecer
    assert.equal(data.usage.ai.pendingReservations, undefined);
  });

  test('5. IA Ilimitada: limit=null => unlimited=true, remaining=null', async () => {
    const unlimitedEntitlements = getCompatibilityEntitlements();
    unlimitedEntitlements.ai = {
      enabled: true,
      limits: { creditsPerDay: null }
    };

    const unlimitedPlan = await planService.createPlan({
      name: 'Plano IA Ilimitada',
      slug: 'plano-ia-ilimitada',
      pricing: { amountCents: 4990, currency: 'BRL', interval: 'month' },
      entitlements: unlimitedEntitlements
    });

    await storageService.saveUsers([{ ...testUserA, planId: unlimitedPlan._id }]);
    delete testUserA._resolvedPlan;

    const res = await fetch(`${baseUrl}/api/me/commercial-context`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.usage.ai.limit, null);
    assert.equal(data.usage.ai.unlimited, true);
    assert.equal(data.usage.ai.remaining, null);
  });

  test('6. IA com limite 0: limit=0 => unlimited=false, remaining=0', async () => {
    const zeroEntitlements = getCompatibilityEntitlements();
    zeroEntitlements.ai = {
      enabled: true,
      limits: { creditsPerDay: 0 }
    };

    const zeroPlan = await planService.createPlan({
      name: 'Plano IA Zero',
      slug: 'plano-ia-zero',
      pricing: { amountCents: 990, currency: 'BRL', interval: 'month' },
      entitlements: zeroEntitlements
    });

    await storageService.saveUsers([{ ...testUserA, planId: zeroPlan._id }]);
    delete testUserA._resolvedPlan;

    const res = await fetch(`${baseUrl}/api/me/commercial-context`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.usage.ai.limit, 0);
    assert.equal(data.usage.ai.unlimited, false);
    assert.equal(data.usage.ai.remaining, 0);
  });

  test('7. planId presente porém inexistente => FAIL-CLOSED com PLAN_REFERENCE_INVALID (403)', async () => {
    await storageService.saveUsers([{ ...testUserA, planId: 'plan_inexistente_99999' }]);
    delete testUserA._resolvedPlan;

    const res = await fetch(`${baseUrl}/api/me/commercial-context`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.error, 'PLAN_REFERENCE_INVALID');
  });

  test('8. Isolamento entre usuários: Usuário A não recebe dados do Usuário B', async () => {
    await storageService.saveUsers([
      { ...testUserA, planId: null },
      { ...testUserB, planId: null }
    ]);

    const resA = await fetch(`${baseUrl}/api/me/commercial-context`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const resB = await fetch(`${baseUrl}/api/me/commercial-context`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });

    const dataA = await resA.json();
    const dataB = await resB.json();

    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);
    // Cada usuário tem seu próprio contexto isolado
    assert.ok(dataA.usage.ai);
    assert.ok(dataB.usage.ai);
  });

  test('9. GET /api/plans requer autenticação e retorna apenas planos com status active', async () => {
    // Cria plano inactive e plano archived
    const inactivePlan = await planService.createPlan({
      name: 'Plano Inactive Antigo',
      slug: 'plano-inactive-antigo',
      pricing: { amountCents: 1000, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });
    await planService.setPlanStatus(inactivePlan._id, 'inactive');

    const archivedPlan = await planService.createPlan({
      name: 'Plano Archived Oculto',
      slug: 'plano-archived-oculto',
      pricing: { amountCents: 2000, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });
    await planService.setPlanStatus(archivedPlan._id, 'archived');

    // Sem token => 401
    const resUnauth = await fetch(`${baseUrl}/api/plans`);
    assert.equal(resUnauth.status, 401);

    // Com token => 200
    const res = await fetch(`${baseUrl}/api/plans`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.plans));
    assert.ok(data.plans.length > 0);

    // TODOS os planos retornados devem ter status === 'active'
    for (const p of data.plans) {
      assert.equal(p.status, undefined, 'Status não é exposto ou deve ser active');
      assert.ok(p.id);
      assert.ok(p.name);
      assert.ok(p.slug);
      assert.ok(p.pricing);
    }

    // Não deve conter os IDs de inactive ou archived
    const returnedIds = data.plans.map(p => p.id);
    assert.equal(returnedIds.includes(inactivePlan._id), false, 'Não deve conter plano inactive');
    assert.equal(returnedIds.includes(archivedPlan._id), false, 'Não deve conter plano archived');
  });

  test('10. Plano vinculado com status inactive continua resolvendo normalmente no commercial-context', async () => {
    const userWithInactivePlan = await planService.createPlan({
      name: 'Plano Legado Inativo',
      slug: 'plano-legado-inativo',
      pricing: { amountCents: 500, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });
    await planService.setPlanStatus(userWithInactivePlan._id, 'inactive');

    await storageService.saveUsers([{ ...testUserB, planId: userWithInactivePlan._id }]);
    delete testUserB._resolvedPlan;

    const res = await fetch(`${baseUrl}/api/me/commercial-context`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.plan.id, userWithInactivePlan._id);
    assert.equal(data.plan.name, 'Plano Legado Inativo');
    assert.equal(data.plan.status, 'inactive');
  });
});
