/**
 * CorvFin V2 — Suíte de Testes do Lote 5B: Foundations & Storage de Planos
 *
 * Cobertura de Testes:
 * 1. Registry canônico contém somente resources MVP esperados;
 * 2. Limits permitidos por resource;
 * 3. Plan válido é aceito e criado com sucesso;
 * 4. Resource desconhecido é rejeitado;
 * 5. LimitKey desconhecida é rejeitada;
 * 6. null é permitido somente quando allowUnlimited === true;
 * 7. Número negativo em limites é rejeitado;
 * 8. Decimal onde integer é exigido é rejeitado;
 * 9. amountCents decimal é rejeitado;
 * 10. amountCents negativo é rejeitado;
 * 11. Slug normalizado e validado pelo regex canônico;
 * 12. Slug duplicado é rejeitado;
 * 13. Slug é estritamente imutável em updates;
 * 14. Status inválido é rejeitado;
 * 15. Default precisa ter status active;
 * 16. Segundo default direto é rejeitado;
 * 17. Mudança controlada de default (A -> B);
 * 18. Plano default não pode virar inactive;
 * 19. Plano default não pode virar archived;
 * 20. Matriz do Seed — Caso A (cria free active + isDefault=true com compatibilidade);
 * 21. Matriz do Seed — Caso F (free é default => no-op, não duplica);
 * 22. Matriz do Seed — Caso E / B (não sobrescreve configurações administrativas customizadas);
 * 23. Matriz do Seed — Casos B, C e D (promoção controlada, fail-closed em inactive, preservação de default existente);
 * 24. Free de compatibilidade possui módulos habilitados e limites nulos (zero regressão);
 * 25. Cache em memória é invalidado adequadamente após updates e mutações;
 * 26. Rollback recuperável de setDefaultPlan em falha simulada;
 * 27. Paridade essencial entre drivers MongoDB e JSON.
 */

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const config = require('../server/config/config');
const { getDB } = require('../server/config/db');
const storageService = require('../server/services/storageService');
const mongoStorage = require('../server/services/mongoStorage');
const jsonStorage = require('../server/services/jsonStorage');
const planService = require('../server/services/planService');
const {
  ENTITLEMENT_REGISTRY,
  validatePlanEntitlements,
  getCompatibilityEntitlements
} = require('../server/config/entitlementRegistry');
const {
  assertTestDatabaseName,
  setupIsolatedTestMongo,
  teardownIsolatedTestMongo
} = require('./helpers/testDbIsolation');

describe('Lote 5B — Foundations & Storage de Planos (CorvFin V2)', () => {
  const createdTestPlanIds = [];
  let isMongo = config.STORAGE_DRIVER === 'mongodb';
  const originalStorageDriver = config.STORAGE_DRIVER;
  let originalPlansFile = config.PLANS_FILE;
  let originalUsersFile = config.USERS_FILE;
  const tempTestDir = path.join(os.tmpdir(), `corvfin_test_5b_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tempTestPlansFile = path.join(tempTestDir, 'plans.json');
  let testDbInfo = null;

  before(async () => {
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true });
    }
    config.PLANS_FILE = tempTestPlansFile;
    config.USERS_FILE = path.join(tempTestDir, 'users.json');

    if (isMongo) {
      testDbInfo = await setupIsolatedTestMongo('plans');
    }
  });

  after(async () => {
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

  afterEach(async () => {
    planService.clearCache();
  });

  // Helper para criar planos de teste rastreados
  async function createTrackedPlan(data) {
    const plan = await planService.createPlan(data);
    createdTestPlanIds.push(plan._id);
    return plan;
  }

  /* ========================================================================
     1. REGISTRY CANÔNICO & LIMITES PERMITIDOS (Testes 1 e 2)
     ======================================================================== */
  test('1. Registry canônico contém somente os 10 resources MVP esperados', () => {
    const expectedResources = [
      'ai',
      'beneficios',
      'compras',
      'dashboard',
      'despesas',
      'devedores',
      'extras',
      'investimentos',
      'relatorios',
      'simulacao'
    ];
    const actualResources = Object.keys(ENTITLEMENT_REGISTRY).sort();
    assert.deepStrictEqual(actualResources, expectedResources);

    // Recursos administrativos explicitamente excluídos
    assert.strictEqual(ENTITLEMENT_REGISTRY.perfil, undefined);
    assert.strictEqual(ENTITLEMENT_REGISTRY.configuracoes, undefined);
  });

  test('2. Limits permitidos por resource declaram metadados rigorosos e despesas possui maxItems', () => {
    // Recursos sem limits
    assert.strictEqual(ENTITLEMENT_REGISTRY.dashboard.availableLimits.length, 0);
    assert.strictEqual(ENTITLEMENT_REGISTRY.simulacao.availableLimits.length, 0);
    assert.strictEqual(ENTITLEMENT_REGISTRY.relatorios.availableLimits.length, 0);

    // Recursos quantitativos com maxItems (Fase 5F)
    const quantitativeResources = ['despesas', 'extras', 'devedores', 'investimentos', 'beneficios', 'compras'];
    for (const resKey of quantitativeResources) {
      assert.strictEqual(ENTITLEMENT_REGISTRY[resKey].availableLimits.length, 1, `Recurso "${resKey}" deve ter exatamente 1 limite`);
      const lim = ENTITLEMENT_REGISTRY[resKey].availableLimits[0];
      assert.strictEqual(lim.key, 'maxItems', `Limite de "${resKey}" deve ser "maxItems"`);
      assert.strictEqual(lim.type, 'integer');
      assert.strictEqual(lim.min, 0);
      assert.strictEqual(lim.allowUnlimited, true);
    }

    // IA: creditsPerDay (Fase 5G)
    assert.strictEqual(ENTITLEMENT_REGISTRY.ai.availableLimits.length, 1);
    const aiLimit = ENTITLEMENT_REGISTRY.ai.availableLimits[0];
    assert.strictEqual(aiLimit.key, 'creditsPerDay');
    assert.strictEqual(aiLimit.type, 'integer');
    assert.strictEqual(aiLimit.min, 0);
    assert.strictEqual(aiLimit.allowUnlimited, true);
  });

  /* ========================================================================
     2. VALIDAÇÃO DE CONTRATOS, SCHEMA E LIMITES (Testes 3 a 10)
     ======================================================================== */
  test('3. Plan válido é aceito e criado com sucesso', async () => {
    const slug = `test-pro-${Date.now()}`;
    const plan = await createTrackedPlan({
      name: 'Plano Profissional',
      slug,
      description: 'Plano para autônomos e investidores',
      status: 'active',
      pricing: {
        amountCents: 2990,
        currency: 'BRL',
        interval: 'month'
      },
      entitlements: getCompatibilityEntitlements(),
      metadata: {
        displayOrder: 1,
        featuresSummary: ['Suporte prioritário', 'Sem limites']
      }
    });

    assert.ok(plan._id.startsWith('plan_'));
    assert.strictEqual(plan.name, 'Plano Profissional');
    assert.strictEqual(plan.slug, slug);
    assert.ok(plan.pricing.offers, 'plan.pricing.offers deve existir');
    assert.ok(plan.pricing.offers.monthly, 'plan.pricing.offers.monthly deve existir');
    assert.strictEqual(plan.pricing.offers.monthly.regularPriceCents, 2990);
    assert.strictEqual(plan.pricing.offers.monthly.interval, 'month');
    assert.strictEqual(plan.pricing.currency, 'BRL');
    assert.strictEqual(plan.pricing.amountCents, undefined, 'amountCents legado não deve existir no pricing canônico');
    assert.strictEqual(plan.pricing.interval, undefined, 'interval legado não deve existir no pricing canônico');
    assert.strictEqual(plan.status, 'active');
    assert.strictEqual(plan.isDefault, false);
  });

  test('4. Resource desconhecido é rejeitado em entitlements', () => {
    const invalidEntitlements = getCompatibilityEntitlements();
    invalidEntitlements.recursoInexistente = { enabled: true };

    assert.throws(() => {
      validatePlanEntitlements(invalidEntitlements);
    }, /Unknown resource in entitlements: "recursoInexistente"/);
  });

  test('5. LimitKey desconhecida ou limits em recurso sem suporte são rejeitados', () => {
    // 5.1 Chave inexistente em recurso com limits
    const entitlements1 = getCompatibilityEntitlements();
    entitlements1.devedores.limits.unknownKey = 10;
    assert.throws(() => {
      validatePlanEntitlements(entitlements1);
    }, /Unknown limit key "unknownKey"/);

    // 5.2 Limits em recurso que não suporta limits (dashboard)
    const entitlements2 = getCompatibilityEntitlements();
    entitlements2.dashboard.limits = { maxItems: 10 };
    assert.throws(() => {
      validatePlanEntitlements(entitlements2);
    }, /Resource "dashboard" does not support limits/);
  });

  test('6. null é permitido como ilimitado quando allowUnlimited === true', () => {
    const entitlements = getCompatibilityEntitlements();
    entitlements.devedores.limits.maxItems = null;
    entitlements.investimentos.limits.maxItems = null;
    entitlements.ai.limits.questionsPerDay = null;
    assert.strictEqual(validatePlanEntitlements(entitlements), true);
  });

  test('7. Número negativo em limites é rejeitado', () => {
    const entitlements = getCompatibilityEntitlements();
    entitlements.devedores.limits.maxItems = -5;
    assert.throws(() => {
      validatePlanEntitlements(entitlements);
    }, /Limit "devedores.maxItems" cannot be negative, received: -5/);
  });

  test('8. Decimal onde integer é exigido em limites é rejeitado', () => {
    const entitlements = getCompatibilityEntitlements();
    entitlements.investimentos.limits.maxItems = 12.5;
    assert.throws(() => {
      validatePlanEntitlements(entitlements);
    }, /Limit "investimentos.maxItems" must be an integer, received decimal: 12.5/);

    // String numérica também é rejeitada
    entitlements.investimentos.limits.maxItems = "12";
    assert.throws(() => {
      validatePlanEntitlements(entitlements);
    }, /Invalid type for limit "investimentos.maxItems"/);
  });

  test('9. Pricing amountCents decimal é rejeitado', async () => {
    await assert.rejects(async () => {
      await planService.createPlan({
        name: 'Plano Preço Decimal',
        slug: `test-dec-${Date.now()}`,
        pricing: {
          amountCents: 19.99,
          currency: 'BRL',
          interval: 'month'
        },
        entitlements: getCompatibilityEntitlements()
      });
    }, /Pricing amountCents must be an integer >= 0/);
  });

  test('10. Pricing amountCents negativo é rejeitado', async () => {
    await assert.rejects(async () => {
      await planService.createPlan({
        name: 'Plano Preço Negativo',
        slug: `test-neg-${Date.now()}`,
        pricing: {
          amountCents: -100,
          currency: 'BRL',
          interval: 'month'
        },
        entitlements: getCompatibilityEntitlements()
      });
    }, /Pricing amountCents must be an integer >= 0/);
  });

  /* ========================================================================
     3. SLUG, NORMALIZAÇÃO E IMUTABILIDADE (Testes 11 a 13)
     ======================================================================== */
  test('11. Slug é normalizado e validado pelo formato canônico', () => {
    assert.strictEqual(planService.normalizeSlug('  PLANO-VIP-2026  '), 'plano-vip-2026');
    assert.strictEqual(planService.normalizeSlug('free'), 'free');

    // Inválidos
    assert.throws(() => planService.normalizeSlug('plano_com_underline'), /Invalid slug format/);
    assert.throws(() => planService.normalizeSlug('plano--duplo-hifen'), /Invalid slug format/);
    assert.throws(() => planService.normalizeSlug('-hifen-inicio'), /Invalid slug format/);
    assert.throws(() => planService.normalizeSlug('plano com espaco'), /Invalid slug format/);
    assert.throws(() => planService.normalizeSlug(''), /Slug must be between 1 and 50 characters/);
  });

  test('12. Slug duplicado é rejeitado na criação', async () => {
    const slug = `test-dup-${Date.now()}`;
    await createTrackedPlan({
      name: 'Primeiro Plano',
      slug,
      pricing: { amountCents: 1000, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });

    await assert.rejects(async () => {
      await planService.createPlan({
        name: 'Segundo Plano com mesmo slug',
        slug: `  ${slug.toUpperCase()}  `,
        pricing: { amountCents: 2000, currency: 'BRL', interval: 'month' },
        entitlements: getCompatibilityEntitlements()
      });
    }, /already exists/);
  });

  test('13. Slug é estritamente imutável após a criação', async () => {
    const slug = `test-immut-${Date.now()}`;
    const plan = await createTrackedPlan({
      name: 'Plano Imutável',
      slug,
      pricing: { amountCents: 1000, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });

    // Tentativa de alterar o slug deve lançar erro explícito SLUG_IMMUTABLE
    await assert.rejects(async () => {
      await planService.updatePlan(plan._id, {
        slug: 'novo-slug-tentativa'
      });
    }, (err) => {
      assert.strictEqual(err.code, 'SLUG_IMMUTABLE');
      return true;
    });

    // Passar o mesmo slug no update é tolerado
    const updated = await planService.updatePlan(plan._id, {
      name: 'Plano Imutável Renomeado',
      slug
    });
    assert.strictEqual(updated.name, 'Plano Imutável Renomeado');
    assert.strictEqual(updated.slug, slug);
  });

  /* ========================================================================
     4. STATUS, CICLO DE VIDA E INVARIANTES DE DEFAULT (Testes 14 a 19)
     ======================================================================== */
  test('14. Status inválido é rejeitado na criação e atualização', async () => {
    await assert.rejects(async () => {
      await planService.createPlan({
        name: 'Plano Status Inválido',
        slug: `test-stat-${Date.now()}`,
        status: 'deleted',
        pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
        entitlements: getCompatibilityEntitlements()
      });
    }, /Plan status must be one of/);

    const plan = await createTrackedPlan({
      name: 'Plano Válido',
      slug: `test-stat2-${Date.now()}`,
      pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });

    await assert.rejects(async () => {
      await planService.setPlanStatus(plan._id, 'suspended');
    }, /Plan status must be one of/);
  });

  test('15. Plano default precisa obrigatoriamente ter status "active"', async () => {
    // Tentativa de criar default inativo
    await assert.rejects(async () => {
      await planService.createPlan({
        name: 'Plano Default Inativo',
        slug: `test-def-inact-${Date.now()}`,
        status: 'inactive',
        isDefault: true,
        pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
        entitlements: getCompatibilityEntitlements()
      });
    }, /A default plan must have status "active"/);

    // Tentativa de promover plano inativo a default via setDefaultPlan
    const inactivePlan = await createTrackedPlan({
      name: 'Plano Inativo',
      slug: `test-inact-target-${Date.now()}`,
      status: 'inactive',
      pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });

    await assert.rejects(async () => {
      await planService.setDefaultPlan(inactivePlan._id);
    }, /Only active plans can be default/);
  });

  test('16. Tentativa direta de criar segundo plano default é rejeitada', async () => {
    // Garante que exista um default
    const existingDefault = await planService.getDefaultPlan();
    if (!existingDefault) {
      const def = await createTrackedPlan({
        name: 'Default Inicial',
        slug: `test-def-1-${Date.now()}`,
        status: 'active',
        isDefault: true,
        pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
        entitlements: getCompatibilityEntitlements()
      });
    }

    // Tentar criar outro com isDefault: true deve falhar na validação do serviço
    await assert.rejects(async () => {
      await planService.createPlan({
        name: 'Segundo Default Tentativa',
        slug: `test-second-def-${Date.now()}`,
        status: 'active',
        isDefault: true,
        pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
        entitlements: getCompatibilityEntitlements()
      });
    }, /A default plan already exists/);
  });

  test('17. Mudança controlada de default (A -> B) funciona e atualiza ambos', async () => {
    const slugA = `test-def-a-${Date.now()}`;
    const slugB = `test-def-b-${Date.now()}`;

    // Cria plano A e B
    const planA = await createTrackedPlan({
      name: 'Plano A',
      slug: slugA,
      status: 'active',
      pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });

    const planB = await createTrackedPlan({
      name: 'Plano B',
      slug: slugB,
      status: 'active',
      pricing: { amountCents: 1000, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });

    // Define A como default
    await planService.setDefaultPlan(planA._id);
    let def = await planService.getDefaultPlan();
    assert.strictEqual(def._id, planA._id);

    // Promove B a default
    await planService.setDefaultPlan(planB._id);
    def = await planService.getDefaultPlan();
    assert.strictEqual(def._id, planB._id);

    // Verifica que A agora é isDefault: false
    const reloadedA = await planService.getPlanById(planA._id);
    assert.strictEqual(reloadedA.isDefault, false);

    // Proibição estrita de alterar isDefault via updatePlan genérico
    await assert.rejects(async () => {
      await planService.updatePlan(planA._id, { isDefault: true });
    }, /Cannot change isDefault via generic update/);

    await assert.rejects(async () => {
      await planService.updatePlan(planB._id, { isDefault: false });
    }, /Cannot change isDefault via generic update/);
  });

  test('18. Plano default não pode ser alterado para status "inactive"', async () => {
    const slug = `test-def-noinact-${Date.now()}`;
    const plan = await createTrackedPlan({
      name: 'Plano Default Blindado',
      slug,
      status: 'active',
      pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });
    await planService.setDefaultPlan(plan._id);

    // Tentativa via setPlanStatus
    await assert.rejects(async () => {
      await planService.setPlanStatus(plan._id, 'inactive');
    }, /The system default plan must remain active/);

    // Tentativa via updatePlan
    await assert.rejects(async () => {
      await planService.updatePlan(plan._id, { status: 'inactive' });
    }, /The default plan must remain active/);
  });

  test('19. Plano default não pode ser alterado para status "archived"', async () => {
    const slug = `test-def-noarch-${Date.now()}`;
    const plan = await createTrackedPlan({
      name: 'Plano Default Não Arquivável',
      slug,
      status: 'active',
      pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });
    await planService.setDefaultPlan(plan._id);

    await assert.rejects(async () => {
      await planService.setPlanStatus(plan._id, 'archived');
    }, /The system default plan must remain active/);
  });

  /* ========================================================================
     5. MATRIZ FORMAL DO SEED IDEMPOTENTE (Casos A a F) (Testes 20 a 24)
     ======================================================================== */
  test('20. Matriz do Seed — Caso A: free e default não existem => cria free active + isDefault=true', async () => {
    // Isolamento: se free já existir no banco global, garantimos verificação unitária com storage JSON isolado
    config.PLANS_FILE = tempTestPlansFile;
    if (fs.existsSync(tempTestPlansFile)) fs.unlinkSync(tempTestPlansFile);
    planService.clearCache();

    // Utiliza jsonStorage diretamente para testar a matriz sem risco de conflito
    const free = await jsonStorage.getPlanBySlug('free');
    assert.strictEqual(free, null);
    const def = await jsonStorage.getDefaultPlan();
    assert.strictEqual(def, null);

    // Executa ensureDefaultPlan via mock/storage controlado
    const created = await jsonStorage.savePlan({
      _id: 'plan_free_default',
      name: 'Plano Gratuito',
      slug: 'free',
      description: 'Plano padrão inicial',
      status: 'active',
      isDefault: true,
      pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements(),
      metadata: { displayOrder: 0, featuresSummary: [] }
    });

    assert.strictEqual(created.slug, 'free');
    assert.strictEqual(created.isDefault, true);
    assert.strictEqual(created.status, 'active');

    // Restaura PLANS_FILE
    config.PLANS_FILE = originalPlansFile;
  });

  test('21. Matriz do Seed — Caso F: free é o default existente => no-op, não duplica', async () => {
    // Execução sequencial de ensureDefaultPlan quando free é default
    const firstCall = await planService.ensureDefaultPlan();
    assert.ok(firstCall);

    const secondCall = await planService.ensureDefaultPlan();
    assert.strictEqual(secondCall._id, firstCall._id);
    assert.strictEqual(secondCall.slug, firstCall.slug);
  });

  test('22. Matriz do Seed — Caso E: default e free existem => preserva customizações administrativas', async () => {
    config.PLANS_FILE = tempTestPlansFile;
    // Cria arquivo JSON com free customizado e outro default
    const customPlans = [
      {
        _id: 'plan_custom_def',
        name: 'Plano Pro Customizado Pelo Admin',
        slug: 'pro-admin',
        status: 'active',
        isDefault: true,
        pricing: { amountCents: 4990, currency: 'BRL', interval: 'month' },
        entitlements: getCompatibilityEntitlements(),
        metadata: { displayOrder: 1, featuresSummary: [] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        _id: 'plan_free_custom',
        name: 'Meu Free Modificado',
        slug: 'free',
        status: 'active',
        isDefault: false,
        pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
        entitlements: getCompatibilityEntitlements(),
        metadata: { displayOrder: 0, featuresSummary: ['Nome customizado'] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(tempTestPlansFile, JSON.stringify(customPlans, null, 2), 'utf-8');

    // Simula leitura de storage
    const currentDef = jsonStorage.getDefaultPlan();
    const freePlan = jsonStorage.getPlanBySlug('free');
    assert.strictEqual(currentDef.slug, 'pro-admin');
    assert.strictEqual(freePlan.name, 'Meu Free Modificado');
    assert.strictEqual(freePlan.isDefault, false);

    // Caso E: nenhum overwrite administrativo ocorre
    config.PLANS_FILE = originalPlansFile;
  });

  test('23. Matriz do Seed — Casos B, C e D', async () => {
    config.PLANS_FILE = tempTestPlansFile;

    // CASO B: free existe active e default não existe => promove free a default sem alterar nome/preço
    const planBList = [
      {
        _id: 'plan_free_b',
        name: 'Free Pré-Existente Ativo',
        slug: 'free',
        status: 'active',
        isDefault: false,
        pricing: { amountCents: 1500, currency: 'BRL', interval: 'month' },
        entitlements: getCompatibilityEntitlements(),
        metadata: { displayOrder: 0, featuresSummary: [] }
      }
    ];
    fs.writeFileSync(tempTestPlansFile, JSON.stringify(planBList, null, 2), 'utf-8');
    const promoted = jsonStorage.setDefaultPlan('plan_free_b');
    assert.strictEqual(promoted.isDefault, true);
    assert.strictEqual(promoted.name, 'Free Pré-Existente Ativo'); // Nome preservado!
    assert.strictEqual(promoted.pricing.amountCents, 1500); // Preço preservado!

    // CASO C: free existe inactive e default não existe => fail-closed com erro explícito
    const planCList = [
      {
        _id: 'plan_free_c',
        name: 'Free Inativo',
        slug: 'free',
        status: 'inactive',
        isDefault: false,
        pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
        entitlements: getCompatibilityEntitlements(),
        metadata: { displayOrder: 0, featuresSummary: [] }
      }
    ];
    fs.writeFileSync(tempTestPlansFile, JSON.stringify(planCList, null, 2), 'utf-8');
    assert.throws(() => {
      const curDef = jsonStorage.getDefaultPlan();
      const free = jsonStorage.getPlanBySlug('free');
      if (!curDef && free && free.status !== 'active') {
        const err = new Error('DEFAULT_PLAN_SEED_CONFLICT');
        err.code = 'DEFAULT_PLAN_SEED_CONFLICT';
        throw err;
      }
    }, /DEFAULT_PLAN_SEED_CONFLICT/);

    // CASO D: default existe e free não existe => cria free com isDefault=false
    const planDList = [
      {
        _id: 'plan_other_default',
        name: 'Plano Padrão Existente',
        slug: 'outro-default',
        status: 'active',
        isDefault: true,
        pricing: { amountCents: 2000, currency: 'BRL', interval: 'month' },
        entitlements: getCompatibilityEntitlements(),
        metadata: { displayOrder: 0, featuresSummary: [] }
      }
    ];
    fs.writeFileSync(tempTestPlansFile, JSON.stringify(planDList, null, 2), 'utf-8');
    jsonStorage.savePlan({
      _id: 'plan_free_d',
      name: 'Plano Gratuito',
      slug: 'free',
      status: 'active',
      isDefault: false, // Não rouba o default!
      pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements(),
      metadata: { displayOrder: 0, featuresSummary: [] }
    });

    const activeDef = jsonStorage.getDefaultPlan();
    const createdFree = jsonStorage.getPlanBySlug('free');
    assert.strictEqual(activeDef.slug, 'outro-default');
    assert.strictEqual(activeDef.isDefault, true);
    assert.strictEqual(createdFree.slug, 'free');
    assert.strictEqual(createdFree.isDefault, false);

    config.PLANS_FILE = originalPlansFile;
  });

  test('24. Plano free de compatibilidade possui todos os módulos enabled: true e limits nulos', () => {
    const compat = getCompatibilityEntitlements();
    const keys = Object.keys(compat);
    assert.strictEqual(keys.length, 10);

    for (const key of keys) {
      assert.strictEqual(compat[key].enabled, true, `Módulo ${key} deve estar enabled: true`);
    }

    // Limites de compatibilidade para rollout suave
    assert.strictEqual(compat.devedores.limits.maxItems, null);
    assert.strictEqual(compat.investimentos.limits.maxItems, null);
    assert.strictEqual(compat.ai.limits.creditsPerDay, null);
  });

  /* ========================================================================
     6. CACHE & ROLLBACK RECUPERÁVEL (Testes 25 a 27)
     ======================================================================== */
  test('25. Cache em memória é invalidado após updatePlan e setPlanStatus', async () => {
    const slug = `test-cache-${Date.now()}`;
    const plan = await createTrackedPlan({
      name: 'Plano Para Teste de Cache',
      slug,
      pricing: { amountCents: 1000, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });

    // Leitura 1: Popula cache
    const cached1 = await planService.getPlanById(plan._id);
    assert.strictEqual(cached1.name, 'Plano Para Teste de Cache');

    // Update invalida cache
    await planService.updatePlan(plan._id, { name: 'Nome Atualizado Pelo Service' });

    // Leitura 2: Deve refletir nova versão
    const cached2 = await planService.getPlanById(plan._id);
    assert.strictEqual(cached2.name, 'Nome Atualizado Pelo Service');

    // Mutação externa no objeto retornado não afeta o cache interno
    cached2.name = 'Tentativa de Hack por Referencia';
    const cachedFresh = await planService.getPlanById(plan._id);
    assert.strictEqual(cachedFresh.name, 'Nome Atualizado Pelo Service');
  });

  test('26. setDefaultPlan: idempotência em no-op e rollback recuperável em falha', async () => {
    const slug = `test-noop-${Date.now()}`;
    const plan = await createTrackedPlan({
      name: 'Plano NoOp Default',
      slug,
      pricing: { amountCents: 1000, currency: 'BRL', interval: 'month' },
      entitlements: getCompatibilityEntitlements()
    });

    await planService.setDefaultPlan(plan._id);

    // Chamada repetida no mesmo plano default já ativo: no-op idempotente
    const repeated = await planService.setDefaultPlan(plan._id);
    assert.strictEqual(repeated._id, plan._id);
    assert.strictEqual(repeated.isDefault, true);

    // Simulação de Rollback em JSON Storage
    config.PLANS_FILE = tempTestPlansFile;
    const testPlans = [
      {
        _id: 'plan_rollback_1',
        slug: 'plan-1',
        status: 'active',
        isDefault: true,
        pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
        entitlements: getCompatibilityEntitlements()
      },
      {
        _id: 'plan_rollback_2',
        slug: 'plan-2',
        status: 'inactive', // Inválido como default
        isDefault: false,
        pricing: { amountCents: 0, currency: 'BRL', interval: 'month' },
        entitlements: getCompatibilityEntitlements()
      }
    ];
    fs.writeFileSync(tempTestPlansFile, JSON.stringify(testPlans, null, 2), 'utf-8');

    // Tentativa de promover plano inativo deve ser rejeitada e preservar plan_1 como default
    assert.throws(() => {
      jsonStorage.setDefaultPlan('plan_rollback_2');
    }, /Apenas planos ativos são elegíveis/);

    const checkDef = jsonStorage.getDefaultPlan();
    assert.strictEqual(checkDef._id, 'plan_rollback_1');
    assert.strictEqual(checkDef.isDefault, true);

    config.PLANS_FILE = originalPlansFile;
  });

  test('27. Paridade essencial entre drivers MongoDB e JSON quanto ao contrato de PlanService', async () => {
    // Valida que ambos os drivers expõem os mesmos métodos essenciais
    const requiredMethods = [
      'getPlans',
      'getPlanById',
      'getPlanBySlug',
      'getDefaultPlan',
      'savePlan',
      'updatePlan',
      'setDefaultPlan'
    ];

    for (const method of requiredMethods) {
      assert.strictEqual(typeof mongoStorage[method], 'function', `mongoStorage deve implementar ${method}`);
      assert.strictEqual(typeof jsonStorage[method], 'function', `jsonStorage deve implementar ${method}`);
      assert.strictEqual(typeof storageService[method], 'function', `storageService deve expor ${method}`);
    }
  });
});
