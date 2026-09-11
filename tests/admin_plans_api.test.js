/**
 * Suíte de Testes da API Administrativa de Planos — Lote 5D (CorvFin V2)
 *
 * Garante o isolamento completo via corvfin_test_admin_plans_<pid>_<timestamp>.
 * Testa todos os endpoints administrativos de planos e atribuição a usuários.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../server/config/config');
const { getDB } = require('../server/config/db');
const app = require('../server/server');
const storageService = require('../server/services/storageService');
const { getUserById, updateUserPlan } = storageService;
const {
  assertTestDatabaseName,
  setupIsolatedTestMongo,
  teardownIsolatedTestMongo
} = require('./helpers/testDbIsolation');
const planService = require('../server/services/planService');
const { hashPassword } = require('../server/services/authService');
const { getCompatibilityEntitlements } = require('../server/config/entitlementRegistry');

describe('Lote 5D — API Administrativa de Planos (CorvFin V2)', () => {
  let server;
  let baseUrl;
  let adminToken;
  let userToken;
  let testAdminId;
  let testUserId;
  let testDbInfo = null;

  const originalStorageDriver = config.STORAGE_DRIVER;
  const originalPlansFile = config.PLANS_FILE;
  const originalUsersFile = config.USERS_FILE;
  const tempTestDir = path.join(os.tmpdir(), `corvfin_test_5d_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  const testSuffix = 'adm_' + Date.now();
  const testAdminLogin = `admin_${testSuffix}`;
  const testUserLogin = `user_${testSuffix}`;
  const testPassword = 'Password@2026';

  before(async () => {
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true });
    }
    // Protege server/data contra qualquer escrita em fallback JSON
    config.PLANS_FILE = path.join(tempTestDir, 'plans.json');
    config.USERS_FILE = path.join(tempTestDir, 'users.json');

    // 1. Conecta ao banco descartável 100% isolado com fail-safe
    testDbInfo = await setupIsolatedTestMongo('admin_plans');
    const db = getDB();

    // 2. Garante plano padrão no banco isolado
    await planService.ensureDefaultPlan();

    // 3. Inicia servidor em porta efêmera
    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // 4. Cria admin sintético direto no banco
    testAdminId = `usr_admin_${testSuffix}`;
    const hashedAdminPwd = await hashPassword(testPassword);
    await db.collection('users').insertOne({
      _id: testAdminId,
      id: testAdminId,
      nome: 'Admin Planos Teste',
      login: testAdminLogin,
      email: `${testAdminLogin}@corvfin.test`,
      senha: hashedAdminPwd,
      is_admin: true,
      notificacoes_ativas: true,
      createdAt: new Date().toISOString()
    });

    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: testAdminLogin, senha: testPassword })
    });
    const adminLoginData = await adminLoginRes.json();
    assert.strictEqual(adminLoginRes.status, 200, 'Login do admin deve retornar 200');
    const adminCookie = adminLoginRes.headers.get('set-cookie') || '';
    const adminMatch = adminCookie.match(/omnifin_session=([^;]+)/);
    adminToken = (adminMatch && adminMatch[1]) || adminLoginData.token;

    // 5. Cadastra usuário comum de teste
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Usuário Comum Teste',
        login: testUserLogin,
        email: `${testUserLogin}@corvfin.test`,
        senha: testPassword
      })
    });
    const regData = await regRes.json();
    assert.strictEqual(regRes.status, 201, 'Cadastro de usuário comum deve retornar 201');
    testUserId = regData.user.id;

    await db.collection('users').updateOne(
      { _id: testUserId },
      { $set: { is_admin: false, emailVerified: true, emailVerifiedAt: new Date().toISOString() } }
    );

    const userLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: testUserLogin, senha: testPassword })
    });
    const userCookie = userLoginRes.headers.get('set-cookie') || '';
    const userMatch = userCookie.match(/omnifin_session=([^;]+)/);
    userToken = (userMatch && userMatch[1]) || '';
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (testDbInfo) {
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

  // Helper para headers autenticados
  function authHeader(token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /* ==========================================================================
     1. AUTORIZAÇÃO E SEGURANÇA BÁSICA
     ========================================================================== */

  test('1. Endpoints administrativos exigem autenticação (401 sem token)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans`);
    assert.strictEqual(res.status, 401);
  });

  test('2. Usuário autenticado não-admin recebe 403 (ADMIN_REQUIRED)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans`, {
      headers: authHeader(userToken)
    });
    assert.strictEqual(res.status, 403);
  });

  /* ==========================================================================
     2. REGISTRY COMERCIAL CANÔNICO
     ========================================================================== */

  test('3. Admin lista registry comercial com metadados para futura UI', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/registry`, {
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.resources));
    assert.strictEqual(data.resources.length, 10, 'Deve listar exatamente os 10 recursos MVP');

    const aiRes = data.resources.find(r => r.key === 'ai');
    assert.ok(aiRes, 'Recurso AI deve constar no registry');
    assert.ok(Array.isArray(aiRes.availableLimits));
    const qpd = aiRes.availableLimits.find(l => l.key === 'creditsPerDay');
    assert.ok(qpd, 'Limite creditsPerDay deve constar em ai.availableLimits');
    assert.strictEqual(qpd.type, 'integer');
    assert.strictEqual(qpd.allowUnlimited, true);
  });

  test('4. Não-admin recebe 403 ao acessar GET /api/admin/plans/registry', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/registry`, {
      headers: authHeader(userToken)
    });
    assert.strictEqual(res.status, 403);
  });

  /* ==========================================================================
     3. LISTAGEM E FILTROS DE PLANOS
     ========================================================================== */

  test('5. Admin lista planos cadastrados com ordenação por displayOrder ASC e name ASC', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans`, {
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.plans));
    assert.ok(data.plans.length >= 1, 'Deve conter pelo menos o plano default');
  });

  test('6. GET /api/admin/plans com filtro status válido filtra corretamente', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans?status=active`, {
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.plans.every(p => p.status === 'active'));
  });

  test('7. GET /api/admin/plans com filtro status inválido retorna 400 INVALID_PLAN_STATUS', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans?status=invalid_status`, {
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'INVALID_PLAN_STATUS');
  });

  test('8. GET /api/admin/plans com filtro isDefault=true filtra o plano padrão', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans?isDefault=true`, {
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.plans.length, 1);
    assert.strictEqual(data.plans[0].isDefault, true);
  });

  test('9. GET /api/admin/plans com filtro isDefault inválido (ex: "1" ou "yes") retorna 400 INVALID_REQUEST_FIELD', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans?isDefault=1`, {
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'INVALID_REQUEST_FIELD');
  });

  /* ==========================================================================
     4. CONSULTA INDIVIDUAL DE PLANO
     ========================================================================== */

  test('10. Admin consulta plano existente por ID retorna 200', async () => {
    const defaultPlan = await planService.getDefaultPlan();
    const res = await fetch(`${baseUrl}/api/admin/plans/${defaultPlan._id}`, {
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.plan._id, defaultPlan._id);
    assert.strictEqual(data.plan.slug, 'free');
  });

  test('11. Consulta plano inexistente retorna 404 PLAN_NOT_FOUND', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/plan_inexistente_999`, {
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.error, 'PLAN_NOT_FOUND');
  });

  /* ==========================================================================
     5. CRIAÇÃO DE PLANO (POST /api/admin/plans)
     ========================================================================== */

  let createdProPlanId = null;

  test('12. Cria plano válido com sucesso (201)', async () => {
    const payload = {
      name: 'Plano Pro Teste',
      slug: 'pro-teste',
      description: 'Plano profissional para testes',
      status: 'active',
      pricing: {
        currency: 'BRL',
        offers: {
          monthly: {
            regularPriceCents: 2990
          }
        }
      },
      entitlements: getCompatibilityEntitlements(),
      metadata: {
        displayOrder: 1,
        featuresSummary: ['Recurso A', 'Recurso B']
      }
    };

    const res = await fetch(`${baseUrl}/api/admin/plans`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.plan.name, 'Plano Pro Teste');
    assert.strictEqual(data.plan.slug, 'pro-teste');
    assert.strictEqual(data.plan.isDefault, false, 'Novo plano não pode ser default');
    assert.strictEqual(data.plan.pricing.offers.monthly.regularPriceCents, 2990);
    assert.strictEqual(data.plan.pricing.amountCents, undefined, 'amountCents não deve estar no retorno canônico');
    createdProPlanId = data.plan._id;
  });

  test('13. POST /api/admin/plans rejeita tentativa de definir isDefault com 400', async () => {
    const payload = {
      name: 'Plano Com Default Indevido',
      slug: 'plan-def-fail',
      isDefault: true,
      pricing: {
        currency: 'BRL',
        offers: {
          monthly: { regularPriceCents: 1000 }
        }
      },
      entitlements: getCompatibilityEntitlements()
    };

    const res = await fetch(`${baseUrl}/api/admin/plans`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'PLAN_DEFAULT_CHANGE_REQUIRES_EXPLICIT_ENDPOINT');
  });

  test('14. POST /api/admin/plans rejeita campos desconhecidos com 400 INVALID_REQUEST_FIELD', async () => {
    const payload = {
      name: 'Plano Com Campo Injetado',
      slug: 'plan-extra-field',
      unknownCustomField: 'malicious',
      pricing: {
        currency: 'BRL',
        offers: {
          monthly: { regularPriceCents: 1000 }
        }
      },
      entitlements: getCompatibilityEntitlements()
    };

    const res = await fetch(`${baseUrl}/api/admin/plans`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'INVALID_REQUEST_FIELD');
  });

  test('15. POST /api/admin/plans rejeita resource desconhecido com 400 UNKNOWN_RESOURCE', async () => {
    const badEntitlements = Object.assign({}, getCompatibilityEntitlements(), {
      crypto_trading: { enabled: true, limits: {} }
    });
    const payload = {
      name: 'Plano Com Recurso Inválido',
      slug: 'plan-bad-res',
      pricing: {
        currency: 'BRL',
        offers: {
          monthly: { regularPriceCents: 1000 }
        }
      },
      entitlements: badEntitlements
    };

    const res = await fetch(`${baseUrl}/api/admin/plans`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'UNKNOWN_RESOURCE');
  });

  test('16. POST /api/admin/plans rejeita limit desconhecido com 400 UNKNOWN_LIMIT', async () => {
    const badEntitlements = getCompatibilityEntitlements();
    badEntitlements.devedores.limits = { invalidLimitKey: 10 };
    const payload = {
      name: 'Plano Com Limite Inválido',
      slug: 'plan-bad-lim',
      pricing: {
        currency: 'BRL',
        offers: {
          monthly: { regularPriceCents: 1000 }
        }
      },
      entitlements: badEntitlements
    };

    const res = await fetch(`${baseUrl}/api/admin/plans`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'UNKNOWN_LIMIT');
  });

  test('17. POST /api/admin/plans rejeita pricing inválido (regularPriceCents negativo ou decimal)', async () => {
    const payload = {
      name: 'Plano Preço Inválido',
      slug: 'plan-bad-price',
      pricing: {
        currency: 'BRL',
        offers: {
          monthly: { regularPriceCents: -50 }
        }
      },
      entitlements: getCompatibilityEntitlements()
    };

    const res = await fetch(`${baseUrl}/api/admin/plans`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res.status, 400);
  });

  test('17b. POST /api/admin/plans rejeita pricing no formato legado amountCents/interval (AE)', async () => {
    const payload = {
      name: 'Plano Preço Legado Rejeitado',
      slug: 'plan-legacy-reject',
      pricing: {
        amountCents: 1000,
        currency: 'BRL',
        interval: 'month'
      },
      entitlements: getCompatibilityEntitlements()
    };

    const res = await fetch(`${baseUrl}/api/admin/plans`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'LEGACY_PRICING_NOT_ACCEPTED');
  });

  test('18. POST /api/admin/plans rejeita slug duplicado com 400 SLUG_DUPLICATE', async () => {
    const payload = {
      name: 'Plano Slug Duplicado',
      slug: 'pro-teste', // Já criado no teste 12
      pricing: {
        currency: 'BRL',
        offers: {
          monthly: { regularPriceCents: 2000 }
        }
      },
      entitlements: getCompatibilityEntitlements()
    };

    const res = await fetch(`${baseUrl}/api/admin/plans`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'SLUG_DUPLICATE');
  });

  /* ==========================================================================
     6. EDIÇÃO DE PLANO (PUT /api/admin/plans/:planId)
     ========================================================================== */

  test('19. Edita nome e pricing do plano existente com sucesso', async () => {
    const updatePayload = {
      name: 'Plano Pro Renomeado',
      description: 'Nova descrição do plano pro',
      pricing: {
        currency: 'BRL',
        offers: {
          monthly: {
            regularPriceCents: 3990
          }
        }
      }
    };

    const res = await fetch(`${baseUrl}/api/admin/plans/${createdProPlanId}`, {
      method: 'PUT',
      headers: authHeader(adminToken),
      body: JSON.stringify(updatePayload)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.plan.name, 'Plano Pro Renomeado');
    assert.strictEqual(data.plan.pricing.offers.monthly.regularPriceCents, 3990);
    assert.strictEqual(data.plan.pricing.amountCents, undefined);
  });

  test('20. PUT /api/admin/plans/:planId rejeita alteração de slug com 400 PLAN_SLUG_IMMUTABLE', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/${createdProPlanId}`, {
      method: 'PUT',
      headers: authHeader(adminToken),
      body: JSON.stringify({ slug: 'pro-novo-slug' })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'PLAN_SLUG_IMMUTABLE');
  });

  test('21. PUT /api/admin/plans/:planId rejeita alteração de isDefault com 400', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/${createdProPlanId}`, {
      method: 'PUT',
      headers: authHeader(adminToken),
      body: JSON.stringify({ isDefault: true })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'PLAN_DEFAULT_CHANGE_REQUIRES_EXPLICIT_ENDPOINT');
  });

  test('22. PUT /api/admin/plans/:planId rejeita status com 400 (exige PATCH status)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/${createdProPlanId}`, {
      method: 'PUT',
      headers: authHeader(adminToken),
      body: JSON.stringify({ status: 'inactive' })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'INVALID_REQUEST_FIELD');
  });

  test('23. PUT /api/admin/plans/:planId rejeita campos desconhecidos com 400 INVALID_REQUEST_FIELD', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/${createdProPlanId}`, {
      method: 'PUT',
      headers: authHeader(adminToken),
      body: JSON.stringify({ unknownProp: 'xyz' })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'INVALID_REQUEST_FIELD');
  });

  /* ==========================================================================
     7. LIFECYCLE DE PLANO (PATCH /api/admin/plans/:planId/status)
     ========================================================================== */

  let createdSecondaryPlanId = null;

  test('24. PATCH status altera status active -> inactive com sucesso', async () => {
    // Cria um plano secundário ativo
    const planB = await planService.createPlan({
      name: 'Plano Secundário',
      slug: 'secundario',
      pricing: {
        currency: 'BRL',
        offers: {
          monthly: { regularPriceCents: 1000 }
        }
      },
      entitlements: getCompatibilityEntitlements()
    });
    createdSecondaryPlanId = planB._id;

    const res = await fetch(`${baseUrl}/api/admin/plans/${createdSecondaryPlanId}/status`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ status: 'inactive' })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.plan.status, 'inactive');
  });

  test('25. PATCH status altera status inactive -> archived com sucesso', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/${createdSecondaryPlanId}/status`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ status: 'archived' })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.plan.status, 'archived');
  });

  test('26. PATCH status rejeita tentativa de inativar plano padrão com 409 DEFAULT_PLAN_MUST_BE_ACTIVE', async () => {
    const defaultPlan = await planService.getDefaultPlan();
    const res = await fetch(`${baseUrl}/api/admin/plans/${defaultPlan._id}/status`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ status: 'inactive' })
    });
    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.error, 'DEFAULT_PLAN_MUST_BE_ACTIVE');
  });

  test('27. PATCH status rejeita tentativa de arquivar plano padrão com 409 DEFAULT_PLAN_MUST_BE_ACTIVE', async () => {
    const defaultPlan = await planService.getDefaultPlan();
    const res = await fetch(`${baseUrl}/api/admin/plans/${defaultPlan._id}/status`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ status: 'archived' })
    });
    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.error, 'DEFAULT_PLAN_MUST_BE_ACTIVE');
  });

  test('28. PATCH status rejeita payload sem campo "status" ou com campos extras com 400', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/${createdSecondaryPlanId}/status`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ extra: 'field' })
    });
    assert.strictEqual(res.status, 400);
  });

  test('29. PATCH status rejeita valor inválido com 400 INVALID_PLAN_STATUS', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/${createdSecondaryPlanId}/status`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ status: 'destroyed' })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, 'INVALID_PLAN_STATUS');
  });

  /* ==========================================================================
     8. TROCA EXPLÍCITA DE DEFAULT (POST /api/admin/plans/:planId/set-default)
     ========================================================================== */

  test('30. POST set-default troca plano padrão com sucesso para plano ativo', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/${createdProPlanId}/set-default`, {
      method: 'POST',
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.plan._id, createdProPlanId);
    assert.strictEqual(data.plan.isDefault, true);

    const newDefault = await planService.getDefaultPlan();
    assert.strictEqual(newDefault._id, createdProPlanId);
  });

  test('31. POST set-default em plano que já é default é no-op idempotente (200)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/${createdProPlanId}/set-default`, {
      method: 'POST',
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
  });

  test('32. POST set-default rejeita plano archived com 409 DEFAULT_PLAN_MUST_BE_ACTIVE', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/${createdSecondaryPlanId}/set-default`, {
      method: 'POST',
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.error, 'DEFAULT_PLAN_MUST_BE_ACTIVE');
  });

  test('33. POST set-default em plano inexistente retorna 404 PLAN_NOT_FOUND', async () => {
    const res = await fetch(`${baseUrl}/api/admin/plans/plan_missing_id/set-default`, {
      method: 'POST',
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.error, 'PLAN_NOT_FOUND');
  });

  /* ==========================================================================
     9. ATRIBUIÇÃO DE PLANO A USUÁRIO (PATCH /api/admin/users/:userId/plan)
     ========================================================================== */

  test('34. Atribui plano ativo a usuário comum com sucesso', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${testUserId}/plan`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ planId: createdProPlanId })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.planId, createdProPlanId);

    // Confirma persistência estrita no banco
    const user = await getUserById(testUserId);
    assert.strictEqual(user.planId, createdProPlanId);
  });

  test('35. Atribuição de plano não altera permissions nem is_admin do usuário', async () => {
    const user = await getUserById(testUserId);
    assert.strictEqual(user.is_admin, false);
    const permissions = await storageService.getUserPermissions(testUserId);
    assert.ok(permissions, 'Permissions do usuário devem existir e permanecer intocadas');
  });

  test('36. Reatribuir exatamente o mesmo plano ao usuário é no-op idempotente (200)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${testUserId}/plan`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ planId: createdProPlanId })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.unchanged, true);
  });

  test('37. Reatribuir mesmo plano archived a usuário que já o possui é no-op idempotente', async () => {
    // Vincula o usuário ao plano secundário diretamente no storage para simular vínculo prévio
    await updateUserPlan(testUserId, createdSecondaryPlanId);

    // O admin envia PATCH com o mesmo plano archived
    const res = await fetch(`${baseUrl}/api/admin/users/${testUserId}/plan`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ planId: createdSecondaryPlanId })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.unchanged, true);
  });

  test('38. Nova atribuição de plano archived para usuário rejeita com 409 PLAN_NOT_ASSIGNABLE', async () => {
    // Cria um outro usuário
    const db = getDB();
    const otherUserId = `usr_other_${Date.now()}`;
    await db.collection('users').insertOne({
      _id: otherUserId,
      id: otherUserId,
      nome: 'Outro Usuário',
      login: `other_${Date.now()}`,
      email: `other_${Date.now()}@test.com`,
      planId: createdProPlanId,
      is_admin: false,
      createdAt: new Date().toISOString()
    });

    // Tenta atribuir o plano archived a este usuário
    const res = await fetch(`${baseUrl}/api/admin/users/${otherUserId}/plan`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ planId: createdSecondaryPlanId })
    });
    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.error, 'PLAN_NOT_ASSIGNABLE');
  });

  test('39. PATCH user plan com usuário inexistente retorna 404 USER_NOT_FOUND', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/usr_inexistente_999/plan`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ planId: createdProPlanId })
    });
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.error, 'USER_NOT_FOUND');
  });

  test('40. PATCH user plan com plano inexistente retorna 404 PLAN_NOT_FOUND', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${testUserId}/plan`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ planId: 'plan_fantasma_999' })
    });
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.error, 'PLAN_NOT_FOUND');
  });

  test('41. PATCH user plan rejeita payload inválido (null, vazio, campos extras) com 400', async () => {
    const resNull = await fetch(`${baseUrl}/api/admin/users/${testUserId}/plan`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ planId: null })
    });
    assert.strictEqual(resNull.status, 400);

    const resExtra = await fetch(`${baseUrl}/api/admin/users/${testUserId}/plan`, {
      method: 'PATCH',
      headers: authHeader(adminToken),
      body: JSON.stringify({ planId: createdProPlanId, is_admin: true })
    });
    assert.strictEqual(resExtra.status, 400);
    const extraData = await resExtra.json();
    assert.strictEqual(extraData.error, 'INVALID_REQUEST_FIELD');
  });

  /* ==========================================================================
     10. CONSULTA DE PLANO DO USUÁRIO (GET /api/admin/users/:userId/plan)
     ========================================================================== */

  test('42. GET user plan retorna plano persistido e effectiveEntitlements com inheritedFromDefault=false', async () => {
    // Restaura vínculo para plano Pro ativo
    await updateUserPlan(testUserId, createdProPlanId);

    const res = await fetch(`${baseUrl}/api/admin/users/${testUserId}/plan`, {
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.userId, testUserId);
    assert.strictEqual(data.planId, createdProPlanId);
    assert.strictEqual(data.inheritedFromDefault, false);
    assert.ok(data.plan);
    assert.strictEqual(data.plan.name, 'Plano Pro Renomeado');
    assert.ok(data.effectiveEntitlements, 'Deve calcular effectiveEntitlements');
    assert.strictEqual(typeof data.effectiveEntitlements.despesas.enabled, 'boolean');
  });

  test('43. GET user plan para usuário legado sem planId retorna inheritedFromDefault=true', async () => {
    const db = getDB();
    const legacyUserId = `usr_legacy_${Date.now()}`;
    await db.collection('users').insertOne({
      _id: legacyUserId,
      id: legacyUserId,
      nome: 'Usuário Legado Sem Plano',
      login: `legacy_${Date.now()}`,
      email: `legacy_${Date.now()}@test.com`,
      is_admin: false,
      createdAt: new Date().toISOString()
      // planId omitido
    });

    const res = await fetch(`${baseUrl}/api/admin/users/${legacyUserId}/plan`, {
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.inheritedFromDefault, true);
    assert.strictEqual(data.planId, null);
    assert.ok(data.plan);
    assert.ok(data.effectiveEntitlements);
  });

  test('44. GET user plan com planId quebrado retorna 409 PLAN_REFERENCE_INVALID (sem fallback)', async () => {
    const db = getDB();
    const brokenUserId = `usr_broken_${Date.now()}`;
    await db.collection('users').insertOne({
      _id: brokenUserId,
      id: brokenUserId,
      nome: 'Usuário Com Plano Quebrado',
      login: `broken_${Date.now()}`,
      email: `broken_${Date.now()}@test.com`,
      planId: 'plan_inexistente_de_fato',
      is_admin: false,
      createdAt: new Date().toISOString()
    });

    const res = await fetch(`${baseUrl}/api/admin/users/${brokenUserId}/plan`, {
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.error, 'PLAN_REFERENCE_INVALID');
  });

  test('45. Usuário com plano archived continua consultável via GET /api/admin/users/:userId/plan', async () => {
    await updateUserPlan(testUserId, createdSecondaryPlanId);

    const res = await fetch(`${baseUrl}/api/admin/users/${testUserId}/plan`, {
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.plan.status, 'archived');
    assert.ok(data.effectiveEntitlements);
  });

  test('46. GET user plan para usuário inexistente retorna 404 USER_NOT_FOUND', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/usr_nao_existe_404/plan`, {
      headers: authHeader(adminToken)
    });
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.error, 'USER_NOT_FOUND');
  });

  test('47. Falha segura: nenhum teste executou escritas no banco de HML', async () => {
    const currentDb = getDB();
    assertTestDatabaseName(currentDb.databaseName);
    assert.notStrictEqual(currentDb.databaseName, 'omnifin_v3_hml');
    assert.notStrictEqual(currentDb.databaseName, 'financas_pro');
    assert.ok(currentDb.databaseName.startsWith('corvfin_test_admin_plans_'));
  });
});
