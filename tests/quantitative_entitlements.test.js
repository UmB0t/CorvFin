/**
 * CorvFin V2 — Suíte de Testes do Lote 5F: Quantitative Entitlements / MaxItems
 *
 * Cobertura Obrigatória:
 * A. Semântica: null (unlimited), 0 (bloqueia incremento), N (permite até N), N+1 (bloqueia)
 * B. Over-limit: 15->16 bloqueado, 15->15 permitido, 15->14 permitido, 15->10 permitido
 * C. Seis domínios: despesas, extras, devedores, investimentos, beneficios, compras
 * D. Despesas: única=1, parcelada 12x=1, recorrente=1, variable->fixed = delta 0
 * E. Compras: nova lista=+1, adicionar produtos em lista existente = delta 0
 * F. Investimentos: novo ativo=+1, aporte em ativo existente = delta 0
 * G. Benefícios: benefitTransactions contam, benefitsConfig não conta
 * H. Admin: is_admin NÃO bypassa maxItems
 * I. Plan resolution: sem planId -> default, válido -> exato, quebrado -> fail-closed
 * J. Configuração: limite ausente/inválido -> fail-closed, 0 permanece 0, null permanece null
 * K. PUT agregado: mudança no recurso A não é bloqueada por recurso B sem crescimento
 * L. AI confirms: expense confirm respeita despesas.maxItems, benefit confirm respeita beneficios.maxItems
 * M. Registry DTO: expõe maxItems dinamicamente nos seis recursos quantitativos
 */

'use strict';

const { describe, test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { closeDB } = require('../server/config/db');

const {
  ENTITLEMENT_REGISTRY,
  PLAN_ENTITLEMENT_SCHEMA_EVOLUTIONS,
  getCompatibilityEntitlements,
  validatePlanEntitlements,
  normalizePlanEntitlements
} = require('../server/config/entitlementRegistry');

const entitlementService = require('../server/services/entitlementService');
const planService = require('../server/services/planService');
const quantitativeEntitlementService = require('../server/services/quantitativeEntitlementService');
const {
  QUANTITATIVE_RESOURCES,
  ResourceLimitReachedError,
  countDomainItems,
  assertWithinItemLimit,
  assertAllItemLimits
} = quantitativeEntitlementService;

describe('Lote 5F — Registry Canônico de Entitlements Quantitativos', () => {
  test('M. Registry canônico declara maxItems para os 6 recursos comerciais quantitativos', () => {
    const requiredResources = ['despesas', 'extras', 'devedores', 'investimentos', 'beneficios', 'compras'];

    for (const resKey of requiredResources) {
      const def = ENTITLEMENT_REGISTRY[resKey];
      assert.ok(def, `Recurso "${resKey}" deve existir no registry`);
      assert.ok(Array.isArray(def.availableLimits), `availableLimits de "${resKey}" deve ser um array`);

      const maxItemsDef = def.availableLimits.find(l => l.key === 'maxItems');
      assert.ok(maxItemsDef, `"${resKey}" deve conter definição de limite "maxItems"`);
      assert.equal(maxItemsDef.type, 'integer');
      assert.equal(maxItemsDef.min, 0);
      assert.equal(maxItemsDef.allowUnlimited, true);
    }
  });

  test('M. getCompatibilityEntitlements gera todos os limites com null (ilimitado) para compatibilidade', () => {
    const compat = getCompatibilityEntitlements();
    const requiredResources = ['despesas', 'extras', 'devedores', 'investimentos', 'beneficios', 'compras'];

    for (const resKey of requiredResources) {
      assert.ok(compat[resKey], `Recurso "${resKey}" deve existir no plano de compatibilidade`);
      assert.equal(compat[resKey].enabled, true);
      assert.strictEqual(compat[resKey].limits?.maxItems, null, `Limite maxItems de "${resKey}" deve ser null`);
    }
  });

  test('J. validatePlanEntitlements aceita inteiros >= 0 e null, mas rejeita valores inválidos', () => {
    const validEntitlements = getCompatibilityEntitlements();
    validEntitlements.despesas.limits.maxItems = 10;
    validEntitlements.extras.limits.maxItems = 0;
    validEntitlements.devedores.limits.maxItems = null;

    assert.ok(validatePlanEntitlements(validEntitlements, true));

    // Rejeita decimal
    const invalidDecimal = getCompatibilityEntitlements();
    invalidDecimal.despesas.limits.maxItems = 10.5;
    assert.throws(() => validatePlanEntitlements(invalidDecimal), /must be an integer/);

    // Rejeita negativo
    const invalidNeg = getCompatibilityEntitlements();
    invalidNeg.extras.limits.maxItems = -1;
    assert.throws(() => validatePlanEntitlements(invalidNeg), /cannot be negative/);

    // Rejeita string numérica
    const invalidStr = getCompatibilityEntitlements();
    invalidStr.compras.limits.maxItems = '10';
    assert.throws(() => validatePlanEntitlements(invalidStr), /Invalid type for limit/);
  });
});

describe('Lote 5F — Definição e Contagem de Entidades Comerciais por Domínio', () => {
  test('D. Despesas: única=1, parcelada 12x=1, recorrente=1, e conversão variable->fixed mantém delta 0', () => {
    const finances = {
      fixed: [
        { id: 'f1', name: 'Aluguel', versions: [{ year: 2026, month: 1, amount: 2000 }] },
        { id: 'f2', name: 'Internet Fibra', versions: [{ year: 2026, month: 1, amount: 120 }] }
      ],
      variable: [
        { id: 'v1', name: 'Lanche', installments: 1, startMonth: 9, startYear: 2026, endMonth: 9, endYear: 2026 },
        { id: 'v2', name: 'Notebook 12x', installments: 12, startMonth: 1, startYear: 2026, endMonth: 12, endYear: 2026 }
      ]
    };

    // Total de despesas lógicas base = 2 fixas + 2 variáveis = 4
    assert.equal(countDomainItems(finances, 'despesas'), 4);

    // Conversão de variável v1 para fixa: remove v1 de variable e adiciona em fixed
    const convertedFinances = {
      fixed: [
        ...finances.fixed,
        { id: 'f3', name: 'Lanche Convertido', versions: [{ year: 2026, month: 9, amount: 50 }] }
      ],
      variable: [
        finances.variable[1] // apenas o Notebook
      ]
    };

    // 3 fixas + 1 variável = 4 despesas lógicas. Delta = 0!
    assert.equal(countDomainItems(convertedFinances, 'despesas'), 4);
    assert.equal(countDomainItems(convertedFinances, 'despesas') - countDomainItems(finances, 'despesas'), 0);
  });

  test('E. Compras: lista de compras = 1 item comercial; produtos internos não contam', () => {
    const finances = {
      shoppingLists: [
        {
          id: 'list_1',
          name: 'Supermercado Mensal',
          items: [
            { id: 'i1', name: 'Arroz', checked: true },
            { id: 'i2', name: 'Feijão', checked: false },
            { id: 'i3', name: 'Azeite', checked: false }
          ]
        },
        {
          id: 'list_2',
          name: 'Farmácia',
          items: [
            { id: 'i4', name: 'Vitamina C', checked: false }
          ]
        }
      ]
    };

    // 2 listas de compras = contagem 2
    assert.equal(countDomainItems(finances, 'compras'), 2);

    // Adiciona 50 itens na lista de compras existente
    for (let i = 5; i <= 55; i++) {
      finances.shoppingLists[0].items.push({ id: `i_${i}`, name: `Item ${i}`, checked: false });
    }

    // A contagem comercial continua sendo exatamente 2!
    assert.equal(countDomainItems(finances, 'compras'), 2);

    // Criar uma nova lista aumenta para 3
    finances.shoppingLists.push({ id: 'list_3', name: 'Feira', items: [] });
    assert.equal(countDomainItems(finances, 'compras'), 3);
  });

  test('F. Investimentos: ativo cadastrado = 1 item; aportes não aumentam quota de ativos', () => {
    const finances = {
      assets: [
        { id: 'a1', name: 'Tesouro Selic', currentAmount: 5000 },
        { id: 'a2', name: 'CDB 110% CDI', currentAmount: 10000 }
      ],
      aportes: [
        { id: 'ap1', assetId: 'a1', amount: 500, month: 1, year: 2026 },
        { id: 'ap2', assetId: 'a1', amount: 500, month: 2, year: 2026 },
        { id: 'ap3', assetId: 'a2', amount: 1000, month: 2, year: 2026 }
      ]
    };

    // 2 ativos cadastrados
    assert.equal(countDomainItems(finances, 'investimentos'), 2);

    // Inserção de mais aportes no histórico não afeta a quantidade de ativos
    finances.aportes.push({ id: 'ap4', assetId: 'a2', amount: 2000, month: 3, year: 2026 });
    assert.equal(countDomainItems(finances, 'investimentos'), 2);
  });

  test('G. Benefícios: benefitTransactions contam; benefitsConfig é configuração escalar', () => {
    const finances = {
      benefitsConfig: { amount: 800, va: 400, vr: 400 },
      benefitTransactions: [
        { id: 'b1', description: 'Almoço Restaurante', amount: 35, type: 'vr' },
        { id: 'b2', description: 'Supermercado VA', amount: 150, type: 'va' }
      ]
    };

    // 2 transações de benefícios contadas
    assert.equal(countDomainItems(finances, 'beneficios'), 2);

    // Alteração nos valores de benefitsConfig não altera a contagem
    finances.benefitsConfig.amount = 1200;
    assert.equal(countDomainItems(finances, 'beneficios'), 2);
  });

  test('C. Extras e Devedores contam rigorosamente seus respectivos arrays', () => {
    const finances = {
      extras: [{ id: 'e1', title: 'Consultoria' }, { id: 'e2', title: 'Venda de Item' }],
      debtors: [{ id: 'd1', name: 'João' }]
    };

    assert.equal(countDomainItems(finances, 'extras'), 2);
    assert.equal(countDomainItems(finances, 'devedores'), 1);
  });
});

describe('Lote 5F — Semântica Quantitativa e Regra Delta-Based', () => {
  // Helper de mock do usuário e plano
  function createTestUserWithPlan(planEntitlements, overrides = {}) {
    const plan = {
      _id: 'plan_test_5f',
      slug: 'plan-test-5f',
      name: 'Plano Teste 5F',
      status: 'active',
      isDefault: false,
      entitlements: planEntitlements
    };

    const user = {
      id: 'usr_test_1',
      nome: 'Usuário Teste',
      email: 'teste@corvfin.com',
      is_admin: false,
      permissions: {},
      planId: 'plan_test_5f',
      _resolvedPlan: plan,
      ...overrides
    };

    return { user, plan };
  }

  test('A. null = Ilimitado: permite qualquer incremento', async () => {
    const entitlements = getCompatibilityEntitlements();
    entitlements.despesas.limits.maxItems = null;

    const { user } = createTestUserWithPlan(entitlements);
    const current = { fixed: new Array(50).fill({ id: 'x' }), variable: [] };
    const incoming = { fixed: new Array(100).fill({ id: 'x' }), variable: [] };

    const res = await assertWithinItemLimit({
      user,
      resourceKey: 'despesas',
      currentFinances: current,
      incomingFinances: incoming
    });

    assert.equal(res.allowed, true);
    assert.strictEqual(res.limit, null);
  });

  test('A. 0 = Zero itens: bloqueia qualquer incremento mas permite no-op e redução', async () => {
    const entitlements = getCompatibilityEntitlements();
    entitlements.extras.limits.maxItems = 0;

    const { user } = createTestUserWithPlan(entitlements);

    // 0 -> 1: Bloqueado
    await assert.rejects(
      async () => {
        await assertWithinItemLimit({
          user,
          resourceKey: 'extras',
          currentFinances: { extras: [] },
          incomingFinances: { extras: [{ id: 'e1' }] }
        });
      },
      (err) => {
        assert.equal(err.code, 'RESOURCE_LIMIT_REACHED');
        assert.equal(err.status, 403);
        assert.equal(err.resource, 'extras');
        assert.equal(err.limit, 0);
        assert.equal(err.currentCount, 0);
        assert.equal(err.nextCount, 1);
        return true;
      }
    );

    // 5 -> 5 (over-limit mantendo quantidade): Permitido!
    const noOpRes = await assertWithinItemLimit({
      user,
      resourceKey: 'extras',
      currentFinances: { extras: new Array(5).fill({ id: 'e' }) },
      incomingFinances: { extras: new Array(5).fill({ id: 'e' }) }
    });
    assert.equal(noOpRes.allowed, true);

    // 5 -> 4 (over-limit reduzindo): Permitido!
    const redRes = await assertWithinItemLimit({
      user,
      resourceKey: 'extras',
      currentFinances: { extras: new Array(5).fill({ id: 'e' }) },
      incomingFinances: { extras: new Array(4).fill({ id: 'e' }) }
    });
    assert.equal(redRes.allowed, true);
  });

  test('A & B. N limite e Cenários Over-limit (15->16 bloqueado, 15->15 permitido, 15->14 permitido, 9->10 permitido)', async () => {
    const entitlements = getCompatibilityEntitlements();
    entitlements.devedores.limits.maxItems = 10;

    const { user } = createTestUserWithPlan(entitlements);

    // 9 -> 10 (delta +1 <= 10): PERMITIDO
    const res1 = await assertWithinItemLimit({
      user,
      resourceKey: 'devedores',
      currentFinances: { debtors: new Array(9).fill({ id: 'd' }) },
      incomingFinances: { debtors: new Array(10).fill({ id: 'd' }) }
    });
    assert.equal(res1.allowed, true);
    assert.equal(res1.nextCount, 10);

    // 10 -> 11 (delta +1 > 10): BLOQUEADO
    await assert.rejects(
      async () => {
        await assertWithinItemLimit({
          user,
          resourceKey: 'devedores',
          currentFinances: { debtors: new Array(10).fill({ id: 'd' }) },
          incomingFinances: { debtors: new Array(11).fill({ id: 'd' }) }
        });
      },
      (err) => {
        assert.equal(err.code, 'RESOURCE_LIMIT_REACHED');
        assert.equal(err.limit, 10);
        assert.equal(err.currentCount, 10);
        assert.equal(err.nextCount, 11);
        return true;
      }
    );

    // 15 -> 16 (over-limit tentando crescer): BLOQUEADO
    await assert.rejects(
      async () => {
        await assertWithinItemLimit({
          user,
          resourceKey: 'devedores',
          currentFinances: { debtors: new Array(15).fill({ id: 'd' }) },
          incomingFinances: { debtors: new Array(16).fill({ id: 'd' }) }
        });
      },
      (err) => {
        assert.equal(err.code, 'RESOURCE_LIMIT_REACHED');
        assert.equal(err.limit, 10);
        assert.equal(err.currentCount, 15);
        assert.equal(err.nextCount, 16);
        return true;
      }
    );

    // 15 -> 15 (over-limit mantendo): PERMITIDO
    const res15 = await assertWithinItemLimit({
      user,
      resourceKey: 'devedores',
      currentFinances: { debtors: new Array(15).fill({ id: 'd' }) },
      incomingFinances: { debtors: new Array(15).fill({ id: 'd' }) }
    });
    assert.equal(res15.allowed, true);

    // 15 -> 14 (over-limit reduzindo): PERMITIDO
    const res14 = await assertWithinItemLimit({
      user,
      resourceKey: 'devedores',
      currentFinances: { debtors: new Array(15).fill({ id: 'd' }) },
      incomingFinances: { debtors: new Array(14).fill({ id: 'd' }) }
    });
    assert.equal(res14.allowed, true);

    // 15 -> 10 (reduzindo até o limite exato): PERMITIDO
    const res10 = await assertWithinItemLimit({
      user,
      resourceKey: 'devedores',
      currentFinances: { debtors: new Array(15).fill({ id: 'd' }) },
      incomingFinances: { debtors: new Array(10).fill({ id: 'd' }) }
    });
    assert.equal(res10.allowed, true);
  });

  test('H. Admin NÃO possui bypass comercial em limites quantitativos', async () => {
    const entitlements = getCompatibilityEntitlements();
    entitlements.investimentos.limits.maxItems = 3;

    // Usuário admin
    const { user } = createTestUserWithPlan(entitlements, { is_admin: true });

    // Admin tentando ir de 3 para 4 ativos: deve ser bloqueado com 403
    await assert.rejects(
      async () => {
        await assertWithinItemLimit({
          user,
          resourceKey: 'investimentos',
          currentFinances: { assets: [{ id: '1' }, { id: '2' }, { id: '3' }] },
          incomingFinances: { assets: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }] }
        });
      },
      (err) => {
        assert.equal(err.code, 'RESOURCE_LIMIT_REACHED');
        assert.equal(err.status, 403);
        return true;
      }
    );
  });

  test('J. Limite ausente ou inválido na configuração do plano resulta em FAIL-CLOSED', async () => {
    const brokenEntitlements = getCompatibilityEntitlements();
    delete brokenEntitlements.beneficios.limits.maxItems;

    const { user } = createTestUserWithPlan(brokenEntitlements);

    await assert.rejects(
      async () => {
        await assertWithinItemLimit({
          user,
          resourceKey: 'beneficios',
          currentFinances: { benefitTransactions: [] },
          incomingFinances: { benefitTransactions: [{ id: 'b1' }] }
        });
      },
      (err) => {
        assert.equal(err.code, 'PLAN_CONFIGURATION_INVALID');
        assert.equal(err.status, 500);
        return true;
      }
    );
  });

  test('K. PUT Agregado: alteração em recurso A não é bloqueada se recurso B inalterado estiver desabilitado/no limite', async () => {
    const entitlements = getCompatibilityEntitlements();
    entitlements.despesas.limits.maxItems = 10;
    // Investimentos desabilitado no plano
    entitlements.investimentos.enabled = false;
    entitlements.investimentos.limits.maxItems = 0;

    const { user } = createTestUserWithPlan(entitlements);

    // Documento agregado transporta dados legados de investimentos sem alteração (delta 0)
    // e o usuário está apenas criando uma nova despesa (de 2 para 3, dentro do limite de 10)
    const currentFinances = {
      fixed: [{ id: 'f1' }],
      variable: [{ id: 'v1' }],
      assets: [{ id: 'old_asset' }] // Investimento existente preservado
    };

    const incomingFinances = {
      fixed: [{ id: 'f1' }],
      variable: [{ id: 'v1' }, { id: 'v2' }], // Nova despesa (+1)
      assets: [{ id: 'old_asset' }] // Inalterado (delta 0)
    };

    // assertAllItemLimits deve permitir a requisição completa!
    await assert.doesNotReject(async () => {
      await assertAllItemLimits({
        user,
        currentFinances,
        incomingFinances
      });
    });

    // Se o usuário tentar adicionar um novo investimento (delta +1 em módulo desabilitado/limite 0), aí sim bloqueia!
    const incomingWithNewAsset = {
      ...incomingFinances,
      assets: [{ id: 'old_asset' }, { id: 'new_asset' }]
    };

    await assert.rejects(
      async () => {
        await assertAllItemLimits({
          user,
          currentFinances,
          incomingFinances: incomingWithNewAsset
        });
      },
      (err) => {
        // Bloqueado porque tentou expandir módulo desabilitado ou no limite 0
        assert.ok(err.code === 'PLAN_ACCESS_DENIED' || err.code === 'RESOURCE_LIMIT_REACHED');
        return true;
      }
    );
  });

  test('L. AI Confirms: explicitDelta avalia incremento antes do cadastro de despesa ou benefício', async () => {
    const entitlements = getCompatibilityEntitlements();
    entitlements.despesas.limits.maxItems = 5;
    entitlements.beneficios.limits.maxItems = 2;

    const { user } = createTestUserWithPlan(entitlements);

    // Despesas: 5 cadastradas, tentar confirmar 6ª via IA -> BLOQUEADO
    const currentFinances = {
      fixed: [{ id: '1' }, { id: '2' }],
      variable: [{ id: '3' }, { id: '4' }, { id: '5' }],
      benefitTransactions: [{ id: 'b1' }]
    };

    await assert.rejects(
      async () => {
        await assertWithinItemLimit({
          user,
          resourceKey: 'despesas',
          limitKey: 'maxItems',
          currentFinances,
          explicitDelta: 1
        });
      },
      (err) => {
        assert.equal(err.code, 'RESOURCE_LIMIT_REACHED');
        assert.equal(err.limit, 5);
        assert.equal(err.nextCount, 6);
        return true;
      }
    );

    // Benefícios: 1 cadastrado, limite 2, confirmar via IA -> PERMITIDO
    const benRes = await assertWithinItemLimit({
      user,
      resourceKey: 'beneficios',
      limitKey: 'maxItems',
      currentFinances,
      explicitDelta: 1
    });
    assert.equal(benRes.allowed, true);
    assert.equal(benRes.nextCount, 2);
  });

  test('I. Plan Resolution: sem planId usa default, planId quebrado lança PLAN_REFERENCE_INVALID', async () => {
    const entitlements = getCompatibilityEntitlements();
    entitlements.compras.limits.maxItems = 5;

    const defaultPlanMock = {
      _id: 'plan_default',
      slug: 'free',
      status: 'active',
      isDefault: true,
      entitlements
    };

    const origGetDefaultPlan = planService.getDefaultPlan;
    planService.getDefaultPlan = async () => defaultPlanMock;

    // Usuário sem planId usa default plan
    const userWithoutPlan = {
      id: 'usr_no_plan',
      email: 'no_plan@corvfin.com',
      is_admin: false,
      permissions: {},
      planId: null
    };

    try {
      const resDefault = await assertWithinItemLimit({
        user: userWithoutPlan,
        resourceKey: 'compras',
        currentFinances: { shoppingLists: [] },
        incomingFinances: { shoppingLists: [{ id: 'l1' }] }
      });
      assert.equal(resDefault.allowed, true);
    } finally {
      planService.getDefaultPlan = origGetDefaultPlan;
    }

    // Usuário com planId quebrado
    const brokenUser = {
      id: 'usr_broken',
      email: 'broken@corvfin.com',
      is_admin: false,
      permissions: {},
      planId: 'plan_non_existent'
    };

    // getPlanForUser busca no banco; mock de getPlanById retornando null
    const origGetPlanById = planService.getPlanById;
    planService.getPlanById = async () => null;

    try {
      await assert.rejects(
        async () => {
          await assertWithinItemLimit({
            user: brokenUser,
            resourceKey: 'compras',
            currentFinances: { shoppingLists: [] },
            incomingFinances: { shoppingLists: [{ id: 'l1' }] }
          });
        },
        (err) => {
          assert.equal(err.code, 'PLAN_REFERENCE_INVALID');
          assert.equal(err.status, 403);
          return true;
        }
      );
    } finally {
      planService.getPlanById = origGetPlanById;
    }
  });
});

describe('Lote 5F.2 — Evolução de Schema Controlada (Allowlist 5F) e Fail-Closed de Limites Anteriores', () => {
  test('A. Compatibilidade 5F: plano legado sem os 4 novos maxItems recebe null exclusivamente neles', () => {
    const legacyEntitlements = {
      despesas: { enabled: true, limits: {} },
      extras: { enabled: true, limits: {} },
      beneficios: { enabled: true, limits: {} },
      compras: { enabled: true, limits: {} },
      devedores: { enabled: true, limits: { maxItems: null } },
      investimentos: { enabled: true, limits: { maxItems: null } },
      dashboard: { enabled: true, limits: {} },
      simulacao: { enabled: true, limits: {} },
      relatorios: { enabled: true, limits: {} },
      ai: { enabled: true, limits: { questionsPerDay: null } }
    };

    const evolved = normalizePlanEntitlements(legacyEntitlements);

    assert.strictEqual(evolved.despesas.limits.maxItems, null);
    assert.strictEqual(evolved.extras.limits.maxItems, null);
    assert.strictEqual(evolved.beneficios.limits.maxItems, null);
    assert.strictEqual(evolved.compras.limits.maxItems, null);
    // Preserva limites pré-existentes intactos
    assert.strictEqual(evolved.devedores.limits.maxItems, null);
    assert.strictEqual(evolved.investimentos.limits.maxItems, null);
    assert.strictEqual(evolved.ai.limits.questionsPerDay, null);
  });

  test('B. Preservação: valores configurados (0, 20, null) permanecem exatamente iguais sem sobrescrita', () => {
    const configuredEntitlements = {
      despesas: { enabled: true, limits: { maxItems: 0 } },
      extras: { enabled: true, limits: { maxItems: 20 } },
      beneficios: { enabled: true, limits: { maxItems: null } },
      compras: { enabled: true, limits: {} }, // ausente -> deve virar null
      devedores: { enabled: true, limits: { maxItems: 5 } },
      investimentos: { enabled: true, limits: { maxItems: 0 } },
      dashboard: { enabled: true, limits: {} },
      simulacao: { enabled: true, limits: {} },
      relatorios: { enabled: true, limits: {} },
      ai: { enabled: true, limits: { questionsPerDay: 50 } }
    };

    const evolved = normalizePlanEntitlements(configuredEntitlements);

    assert.strictEqual(evolved.despesas.limits.maxItems, 0, 'despesas.maxItems 0 deve ser mantido');
    assert.strictEqual(evolved.extras.limits.maxItems, 20, 'extras.maxItems 20 deve ser mantido');
    assert.strictEqual(evolved.beneficios.limits.maxItems, null, 'beneficios.maxItems null deve ser mantido');
    assert.strictEqual(evolved.compras.limits.maxItems, null, 'compras.maxItems ausente deve virar null');
    assert.strictEqual(evolved.devedores.limits.maxItems, 5, 'devedores.maxItems 5 deve ser mantido');
    assert.strictEqual(evolved.investimentos.limits.maxItems, 0, 'investimentos.maxItems 0 deve ser mantido');
    assert.strictEqual(evolved.ai.limits.questionsPerDay, 50, 'ai.questionsPerDay 50 deve ser mantido');
  });

  test('C. FAIL-CLOSED ANTIGO (devedores): devedores.limits sem maxItems continua ausente e lança PLAN_CONFIGURATION_INVALID', async () => {
    const brokenPlan = {
      _id: 'plan_broken_dev',
      slug: 'broken-dev',
      status: 'active',
      entitlements: {
        despesas: { enabled: true, limits: {} },
        devedores: { enabled: true, limits: {} } // maxItems ausente!
      }
    };

    // Aplica normalizePlanDoc
    planService.normalizePlanDoc(brokenPlan);

    // devedores.limits.maxItems NÃO deve ter sido preenchido
    assert.strictEqual(brokenPlan.entitlements.devedores.limits.maxItems, undefined);

    const user = {
      id: 'usr_broken_dev',
      email: 'broken_dev@corvfin.com',
      is_admin: false,
      permissions: {},
      planId: brokenPlan._id,
      _resolvedPlan: brokenPlan
    };

    await assert.rejects(
      async () => {
        await entitlementService.getLimit(user, 'devedores', 'maxItems');
      },
      (err) => {
        assert.strictEqual(err.code, 'PLAN_CONFIGURATION_INVALID');
        assert.strictEqual(err.status, 500);
        return true;
      }
    );
  });

  test('D. FAIL-CLOSED ANTIGO (investimentos): investimentos.limits sem maxItems continua ausente e lança PLAN_CONFIGURATION_INVALID', async () => {
    const brokenPlan = {
      _id: 'plan_broken_inv',
      slug: 'broken-inv',
      status: 'active',
      entitlements: {
        despesas: { enabled: true, limits: {} },
        investimentos: { enabled: true, limits: {} } // maxItems ausente!
      }
    };

    planService.normalizePlanDoc(brokenPlan);
    assert.strictEqual(brokenPlan.entitlements.investimentos.limits.maxItems, undefined);

    const user = {
      id: 'usr_broken_inv',
      email: 'broken_inv@corvfin.com',
      is_admin: false,
      permissions: {},
      planId: brokenPlan._id,
      _resolvedPlan: brokenPlan
    };

    await assert.rejects(
      async () => {
        await entitlementService.getLimit(user, 'investimentos', 'maxItems');
      },
      (err) => {
        assert.strictEqual(err.code, 'PLAN_CONFIGURATION_INVALID');
        assert.strictEqual(err.status, 500);
        return true;
      }
    );
  });

  test('E. FAIL-CLOSED ANTIGO (ai): ai.limits sem questionsPerDay continua ausente e lança PLAN_CONFIGURATION_INVALID', async () => {
    const brokenPlan = {
      _id: 'plan_broken_ai',
      slug: 'broken-ai',
      status: 'active',
      entitlements: {
        despesas: { enabled: true, limits: {} },
        ai: { enabled: true, limits: {} } // questionsPerDay ausente!
      }
    };

    planService.normalizePlanDoc(brokenPlan);
    assert.strictEqual(brokenPlan.entitlements.ai.limits.questionsPerDay, undefined);

    const user = {
      id: 'usr_broken_ai',
      email: 'broken_ai@corvfin.com',
      is_admin: false,
      permissions: {},
      planId: brokenPlan._id,
      _resolvedPlan: brokenPlan
    };

    await assert.rejects(
      async () => {
        await entitlementService.getLimit(user, 'ai', 'questionsPerDay');
      },
      (err) => {
        assert.strictEqual(err.code, 'PLAN_CONFIGURATION_INVALID');
        assert.strictEqual(err.status, 500);
        return true;
      }
    );
  });

  test('F. Backfill: preenche somente os 4 campos 5F e NÃO fabrica devedores, investimentos ou ai ausentes', async () => {
    const { backfillPlanEntitlements } = require('../server/services/backfillPlanService');
    const storageService = require('../server/services/storageService');

    const fakePlans = [
      {
        _id: 'p1_legacy_5f',
        slug: 'p1-legacy',
        entitlements: {
          despesas: { enabled: true, limits: {} }, // 5F: deve virar null
          extras: { enabled: true, limits: { maxItems: 15 } }, // 5F: mantido 15
          devedores: { enabled: true, limits: {} }, // pré-5F ausente: DEVE CONTINUAR AUSENTE!
          investimentos: { enabled: true, limits: { maxItems: 8 } }, // pré-5F: mantido 8
          ai: { enabled: true, limits: {} } // pré-5F ausente: DEVE CONTINUAR AUSENTE!
        }
      }
    ];

    const origGetPlans = storageService.getPlans;
    storageService.getPlans = async () => fakePlans;

    try {
      const result = await backfillPlanEntitlements({ driver: 'json-mock', dryRun: false });
      assert.strictEqual(result.matchedCount, 1);
      assert.strictEqual(result.modifiedCount, 1);

      const p1 = fakePlans[0];
      // 5F: preenchido ou preservado
      assert.strictEqual(p1.entitlements.despesas.limits.maxItems, null);
      assert.strictEqual(p1.entitlements.extras.limits.maxItems, 15);

      // Limites anteriores ausentes: NÃO foram criados (permanecem undefined/ausentes)
      assert.strictEqual(p1.entitlements.devedores.limits.maxItems, undefined);
      assert.strictEqual(p1.entitlements.investimentos.limits.maxItems, 8);
      assert.strictEqual(p1.entitlements.ai.limits.questionsPerDay, undefined);
    } finally {
      storageService.getPlans = origGetPlans;
    }
  });

  test('G. planId inválido + delta = 0 lança PLAN_REFERENCE_INVALID (Fail-Closed)', async () => {
    const brokenUser = {
      id: 'usr_broken_e',
      email: 'broken_e@corvfin.com',
      is_admin: false,
      permissions: {},
      planId: 'plan_does_not_exist_e'
    };

    const origGetPlanById = planService.getPlanById;
    planService.getPlanById = async () => null;

    try {
      await assert.rejects(
        async () => {
          await assertWithinItemLimit({
            user: brokenUser,
            resourceKey: 'despesas',
            currentFinances: { fixed: [{ id: 'f1' }], variable: [] },
            incomingFinances: { fixed: [{ id: 'f1' }], variable: [] } // delta = 0
          });
        },
        (err) => {
          assert.strictEqual(err.code, 'PLAN_REFERENCE_INVALID');
          assert.strictEqual(err.status, 403);
          return true;
        }
      );
    } finally {
      planService.getPlanById = origGetPlanById;
    }
  });

  test('H. planId inválido + delta < 0 lança PLAN_REFERENCE_INVALID (Fail-Closed)', async () => {
    const brokenUser = {
      id: 'usr_broken_f',
      email: 'broken_f@corvfin.com',
      is_admin: false,
      permissions: {},
      planId: 'plan_does_not_exist_f'
    };

    const origGetPlanById = planService.getPlanById;
    planService.getPlanById = async () => null;

    try {
      await assert.rejects(
        async () => {
          await assertWithinItemLimit({
            user: brokenUser,
            resourceKey: 'despesas',
            currentFinances: { fixed: [{ id: 'f1' }, { id: 'f2' }], variable: [] },
            incomingFinances: { fixed: [{ id: 'f1' }], variable: [] } // delta = -1
          });
        },
        (err) => {
          assert.strictEqual(err.code, 'PLAN_REFERENCE_INVALID');
          assert.strictEqual(err.status, 403);
          return true;
        }
      );
    } finally {
      planService.getPlanById = origGetPlanById;
    }
  });

  test('I. Recurso desabilitado + delta = 0 NÃO é bloqueado apenas por assertAccess no PUT agregado', async () => {
    const planWithDisabledInvestments = {
      _id: 'plan_no_investments',
      slug: 'no-investments',
      status: 'active',
      entitlements: getCompatibilityEntitlements()
    };
    planWithDisabledInvestments.entitlements.investimentos.enabled = false;

    const user = {
      id: 'usr_disabled_res',
      email: 'disabled@corvfin.com',
      is_admin: false,
      permissions: {},
      planId: planWithDisabledInvestments._id,
      _resolvedPlan: planWithDisabledInvestments
    };

    const currentFinances = {
      fixed: [{ id: 'f1' }],
      variable: [],
      assets: [{ id: 'asset1' }]
    };

    const incomingFinances = {
      fixed: [{ id: 'f1' }],
      variable: [{ id: 'v1' }],
      assets: [{ id: 'asset1' }]
    };

    await assert.doesNotReject(async () => {
      await assertAllItemLimits({
        user,
        currentFinances,
        incomingFinances
      });
    });
  });

  test('J. Recurso desabilitado + delta > 0 é bloqueado conforme effective access (PLAN_ACCESS_DENIED)', async () => {
    const planWithDisabledInvestments = {
      _id: 'plan_no_investments_h',
      slug: 'no-investments-h',
      status: 'active',
      entitlements: getCompatibilityEntitlements()
    };
    planWithDisabledInvestments.entitlements.investimentos.enabled = false;

    const user = {
      id: 'usr_disabled_h',
      email: 'disabled_h@corvfin.com',
      is_admin: false,
      permissions: {},
      planId: planWithDisabledInvestments._id,
      _resolvedPlan: planWithDisabledInvestments
    };

    const currentFinances = {
      fixed: [{ id: 'f1' }],
      variable: [],
      assets: [{ id: 'asset1' }]
    };

    const incomingFinances = {
      fixed: [{ id: 'f1' }],
      variable: [],
      assets: [{ id: 'asset1' }, { id: 'asset2' }]
    };

    await assert.rejects(
      async () => {
        await assertAllItemLimits({
          user,
          currentFinances,
          incomingFinances
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'PLAN_ACCESS_DENIED');
        assert.strictEqual(err.status, 403);
        return true;
      }
    );
  });

  test('K. Depois da evolução 5F, getLimit() funciona normalmente com plano evoluído', async () => {
    const legacyPlan = {
      _id: 'plan_legacy_5f2',
      slug: 'legacy-plan-5f2',
      name: 'Plano Legado 5F.2',
      status: 'active',
      isDefault: false,
      entitlements: {
        despesas: { enabled: true, limits: {} },
        extras: { enabled: true, limits: {} },
        beneficios: { enabled: true, limits: {} },
        compras: { enabled: true, limits: {} },
        devedores: { enabled: true, limits: { maxItems: null } },
        investimentos: { enabled: true, limits: { maxItems: null } },
        dashboard: { enabled: true, limits: {} },
        simulacao: { enabled: true, limits: {} },
        relatorios: { enabled: true, limits: {} },
        ai: { enabled: true, limits: { questionsPerDay: null } }
      }
    };

    planService.normalizePlanDoc(legacyPlan);

    const user = {
      id: 'usr_evolved_5f2',
      email: 'evolved_5f2@corvfin.com',
      is_admin: false,
      permissions: {},
      planId: legacyPlan._id,
      _resolvedPlan: legacyPlan
    };

    const despesasLimit = await entitlementService.getLimit(user, 'despesas', 'maxItems');
    assert.strictEqual(despesasLimit, null);

    const comprasLimit = await entitlementService.getLimit(user, 'compras', 'maxItems');
    assert.strictEqual(comprasLimit, null);

    const res = await assertWithinItemLimit({
      user,
      resourceKey: 'despesas',
      currentFinances: { fixed: [{ id: 'f1' }], variable: [] },
      incomingFinances: { fixed: [{ id: 'f1' }], variable: [{ id: 'v1' }] }
    });
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.limit, null);
  });
});

after(async () => {
  await closeDB();
});

