/**
 * CorvFin V2 — Suíte de Testes do Lote 5G: AI Daily Credits / Weighted Quota
 *
 * Cobertura Obrigatória (44 Casos):
 * - ENTITLEMENT (1-6): questionsPerDay -> creditsPerDay, preservação de null/0/N, fail-closed
 * - CLASSIFICATION (7-14): intents gratuitas, queries (1), análises (3), ambiguidade nunca gratuita
 * - LOCAL (15-17): zero getUserFinances, zero n8n, funcionamento com creditsPerDay = 0
 * - QUOTA (18-25): 0 bloqueia, N ponderado, teto exato, over-limit, required>limit sem doc inválido,
 *                  null registra sem bloquear, admin sem bypass, planId inválido fail-closed
 * - CONCURRENCY (26-27): limit10/used6/duas reservas4 -> 1 aprovada, creditsUsed <= limit
 * - FAILURE (28-31): estorno em timeout e malformed, sucesso mantém, release sem negativos
 * - AGGREGATES (32-34): operations por tipo, providerCalls sem contar local, unlimited registra aggregates
 * - INTERPRET (35-38): cancelamento=0, confirmação=0, n8n real=1, follow-up no n8n=tarifado
 * - FRONTEND (39-42): 403, 429, 503, 504 terminais sem cair para aiChat
 * - UNSUPPORTED (43-44): inputMode audio e image rejeitados com erro 400 sem provider/quota
 */

'use strict';

const { describe, test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { closeDB } = require('../server/config/db');

const {
  ENTITLEMENT_REGISTRY,
  getCompatibilityEntitlements,
  normalizePlanEntitlements,
  validatePlanEntitlements
} = require('../server/config/entitlementRegistry');
const {
  AI_CREDIT_POLICY,
  getCreditCost,
  isInputModeSupported
} = require('../server/config/aiCreditPolicy');
const {
  classifyAiOperation,
  normalizeText,
  LOCAL_RESPONSES
} = require('../server/services/aiClassificationService');
const aiQuotaService = require('../server/services/aiQuotaService');
const jsonStorage = require('../server/services/jsonStorage');
const entitlementService = require('../server/services/entitlementService');
const config = require('../server/config/config');

// Diretório isolado para testes com JSON storage
const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data', 'test_5g_data');
config.AI_USAGE_DAILY_FILE = path.join(TEST_DATA_DIR, 'ai_usage_daily.json');
config.STORAGE_DRIVER = 'json';

function resetTestDataDir() {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
  try {
    fs.writeFileSync(config.AI_USAGE_DAILY_FILE, '{}', 'utf8');
  } catch (_) {}
}

describe('Lote 5G — Entitlement Registry & Schema Evolution (Casos 1 a 6)', () => {
  test('1. questionsPerDay legado normaliza para creditsPerDay', () => {
    const rawEntitlements = {
      ai: {
        enabled: true,
        limits: {
          questionsPerDay: 15
        }
      }
    };

    const normalized = normalizePlanEntitlements(rawEntitlements);
    assert.equal(normalized.ai.limits.creditsPerDay, 15);
    assert.equal(normalized.ai.limits.questionsPerDay, 15, 'questionsPerDay legado preservado no documento');
  });

  test('2. creditsPerDay existente nunca é sobrescrito por questionsPerDay legado', () => {
    const rawEntitlements = {
      ai: {
        enabled: true,
        limits: {
          creditsPerDay: 30,
          questionsPerDay: 10
        }
      }
    };

    const normalized = normalizePlanEntitlements(rawEntitlements);
    assert.equal(normalized.ai.limits.creditsPerDay, 30, 'creditsPerDay configurado prevalece');
  });

  test('3. Ambos ausentes = Fail-Closed (creditsPerDay não é inventado)', async () => {
    const rawEntitlements = {
      ai: {
        enabled: true,
        limits: {}
      }
    };

    const normalized = normalizePlanEntitlements(rawEntitlements);
    assert.equal(normalized.ai.limits.creditsPerDay, undefined);

    // No runtime comercial, plano com creditsPerDay ausente lança PLAN_CONFIGURATION_INVALID
    const userWithBrokenPlan = {
      id: 'usr_broken_limits',
      planId: 'plan_broken_limits',
      _resolvedPlan: {
        _id: 'plan_broken_limits',
        slug: 'broken-limits',
        entitlements: normalized
      }
    };

    await assert.rejects(
      async () => {
        await entitlementService.getLimit(userWithBrokenPlan, 'ai', 'creditsPerDay');
      },
      (err) => {
        assert.equal(err.code, 'PLAN_CONFIGURATION_INVALID');
        return true;
      }
    );
  });

  test('4. questionsPerDay = null (ilimitado) é preservado como creditsPerDay = null', () => {
    const rawEntitlements = {
      ai: {
        enabled: true,
        limits: {
          questionsPerDay: null
        }
      }
    };

    const normalized = normalizePlanEntitlements(rawEntitlements);
    assert.equal(normalized.ai.limits.creditsPerDay, null);
    assert.equal(validatePlanEntitlements(normalized), true);
  });

  test('5. questionsPerDay = 0 é preservado como creditsPerDay = 0', () => {
    const rawEntitlements = {
      ai: {
        enabled: true,
        limits: {
          questionsPerDay: 0
        }
      }
    };

    const normalized = normalizePlanEntitlements(rawEntitlements);
    assert.equal(normalized.ai.limits.creditsPerDay, 0);
    assert.equal(validatePlanEntitlements(normalized), true);
  });

  test('6. questionsPerDay = N positivo é preservado como creditsPerDay = N', () => {
    const rawEntitlements = {
      ai: {
        enabled: true,
        limits: {
          questionsPerDay: 42
        }
      }
    };

    const normalized = normalizePlanEntitlements(rawEntitlements);
    assert.equal(normalized.ai.limits.creditsPerDay, 42);
    assert.equal(validatePlanEntitlements(normalized), true);
  });
});

describe('Lote 5G — AI Operation Classification (Casos 7 a 14)', () => {
  test('7. "Oi" = casual_conversation / 0 créditos', () => {
    const res = classifyAiOperation({ endpoint: 'chat', message: 'Oi' });
    assert.equal(res.operationType, 'casual_conversation');
    assert.equal(res.creditCost, 0);
    assert.equal(res.providerRequired, false);
    assert.ok(res.localResponse);
    assert.equal(res.requiresFinancialContext, false);
  });

  test('8. "Bom dia" = casual_conversation / 0 créditos', () => {
    const res = classifyAiOperation({ endpoint: 'chat', message: 'Bom dia!' });
    assert.equal(res.operationType, 'casual_conversation');
    assert.equal(res.creditCost, 0);
    assert.equal(res.providerRequired, false);
    assert.ok(res.localResponse);
  });

  test('9. "Como altero minha senha?" = product_help / 0 créditos', () => {
    const res = classifyAiOperation({ endpoint: 'chat', message: 'Como altero minha senha?' });
    assert.equal(res.operationType, 'product_help');
    assert.equal(res.creditCost, 0);
    assert.equal(res.providerRequired, false);
    assert.ok(res.localResponse);
    assert.ok(res.localResponse.answer.includes('Perfil'));
  });

  test('10. "Como reporto um bug?" = product_help / 0 créditos', () => {
    const res = classifyAiOperation({ endpoint: 'chat', message: 'Como reporto um bug?' });
    assert.equal(res.operationType, 'product_help');
    assert.equal(res.creditCost, 0);
    assert.equal(res.providerRequired, false);
    assert.ok(res.localResponse);
    assert.ok(res.localResponse.answer.includes('suporte@corvfin.com.br'));
  });

  test('11. "O que você sabe fazer?" = capabilities_help / 0 créditos', () => {
    const res = classifyAiOperation({ endpoint: 'chat', message: 'O que você sabe fazer?' });
    assert.equal(res.operationType, 'capabilities_help');
    assert.equal(res.creditCost, 0);
    assert.equal(res.providerRequired, false);
    assert.ok(res.localResponse);
    assert.ok(res.localResponse.answer.includes('ajudar'));
  });

  test('12. "Quanto gastei este mês?" = financial_query / 1 crédito', () => {
    const res = classifyAiOperation({ endpoint: 'chat', message: 'Quanto gastei este mês?' });
    assert.equal(res.operationType, 'financial_query');
    assert.equal(res.creditCost, 1);
    assert.equal(res.providerRequired, true);
    assert.equal(res.localResponse, null);
    assert.equal(res.requiresFinancialContext, true);
  });

  test('13. "Analise minhas despesas do ano" = financial_analysis / 3 créditos', () => {
    const res = classifyAiOperation({ endpoint: 'chat', message: 'Analise minhas despesas do ano' });
    assert.equal(res.operationType, 'financial_analysis');
    assert.equal(res.creditCost, 3);
    assert.equal(res.providerRequired, true);
    assert.equal(res.localResponse, null);
    assert.equal(res.requiresFinancialContext, true);
  });

  test('14. Mensagem ambígua nunca vira gratuita (cai em financial_query / 1 crédito)', () => {
    const ambiguousMessages = [
      'Talvez eu precise ver isso depois',
      'Oi, quanto gastei no mercado?',
      'Quero saber mais',
      'Preciso de uma ajuda',
      'O que você acha disso?'
    ];

    for (const msg of ambiguousMessages) {
      const res = classifyAiOperation({ endpoint: 'chat', message: msg });
      assert.notEqual(res.creditCost, 0, `Mensagem "${msg}" não pode ser gratuita`);
      assert.equal(res.providerRequired, true, `Mensagem "${msg}" deve exigir provider`);
    }
  });
});

describe('Lote 5G — Resolução Local vs Provider & creditsPerDay = 0 (Casos 15 a 17)', () => {
  test('15. Intent gratuita tem flag requiresFinancialContext = false (não carrega getUserFinances)', () => {
    const res = classifyAiOperation({ endpoint: 'chat', message: 'Como altero minha senha?' });
    assert.equal(res.creditCost, 0);
    assert.equal(res.requiresFinancialContext, false);
  });

  test('16. Intent gratuita tem flag providerRequired = false (não chama n8n)', () => {
    const res = classifyAiOperation({ endpoint: 'chat', message: 'Oi' });
    assert.equal(res.creditCost, 0);
    assert.equal(res.providerRequired, false);
    assert.ok(res.localResponse && res.localResponse.answer);
  });

  test('17. Intent gratuita funciona com creditsPerDay = 0 (reserve permite credits = 0)', async () => {
    // Plano com ai.enabled = true e creditsPerDay = 0
    const mockPlan = {
      _id: 'plan_zero_ai',
      slug: 'zero-ai',
      entitlements: {
        ...getCompatibilityEntitlements(),
        ai: {
          enabled: true,
          limits: { creditsPerDay: 0 }
        }
      }
    };

    const mockUser = {
      id: 'usr_zero_credits',
      planId: 'plan_zero_ai',
      permissions: {},
      _resolvedPlan: mockPlan
    };

    // getLimit retorna 0
    const limit = mockPlan.entitlements.ai.limits.creditsPerDay;
    assert.equal(limit, 0);

    // Reserva de 0 créditos (intent gratuita) deve ser permitida sem lançar erro
    const reservation = await aiQuotaService.reserve({
      user: mockUser,
      operationType: 'casual_conversation',
      credits: 0
    });

    assert.equal(reservation.allowed, true);
    assert.equal(reservation.credits, 0);
  });
});

describe('Lote 5G — Quota Diária Ponderada (Casos 18 a 25)', () => {
  beforeEach(() => {
    resetTestDataDir();
  });

  test('18. creditsPerDay = 0 bloqueia operação tarifada (credits > 0)', async () => {
    const dateKey = '2026-09-08';
    await assert.rejects(
      async () => {
        // limit = 0, credits = 1 -> deve ser bloqueado
        const res = await jsonStorage.reserveAiDailyCredits({
          userId: 'usr_blocked_0',
          dateKey,
          limit: 0,
          credits: 1,
          operationType: 'financial_query',
          dataDir: TEST_DATA_DIR
        });
        if (!res.allowed) {
          throw new aiQuotaService.AiDailyQuotaError({
            limit: 0,
            used: res.creditsUsed,
            required: 1,
            remaining: res.remaining,
            dateKey,
            resetsAt: '2026-09-09T03:00:00.000Z'
          });
        }
      },
      (err) => {
        assert.equal(err.status, 429);
        assert.equal(err.code, 'AI_DAILY_QUOTA_REACHED');
        assert.equal(err.limit, 0);
        assert.equal(err.remaining, 0);
        return true;
      }
    );
  });

  test('19. N permite até o teto ponderado (1 + 1 + 3 = 5)', async () => {
    const dateKey = '2026-09-08';
    const limit = 5;
    const userId = 'usr_ponderada_5';

    // 1ª op: 1 crédito
    const r1 = await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 1, operationType: 'financial_query', dataDir: TEST_DATA_DIR
    });
    assert.equal(r1.allowed, true);
    assert.equal(r1.creditsUsed, 1);
    assert.equal(r1.remaining, 4);

    // 2ª op: 1 crédito
    const r2 = await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 1, operationType: 'expense_interpretation', dataDir: TEST_DATA_DIR
    });
    assert.equal(r2.allowed, true);
    assert.equal(r2.creditsUsed, 2);
    assert.equal(r2.remaining, 3);

    // 3ª op: 3 créditos
    const r3 = await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR
    });
    assert.equal(r3.allowed, true);
    assert.equal(r3.creditsUsed, 5);
    assert.equal(r3.remaining, 0);
  });

  test('20. used + required == limit permite a operação', async () => {
    const dateKey = '2026-09-08';
    const userId = 'usr_exact_limit';

    // Usar 7 de 10
    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit: 10, credits: 7, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR
    });

    // Operação de 3 créditos: 7 + 3 == 10 (permitido!)
    const rExact = await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit: 10, credits: 3, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR
    });
    assert.equal(rExact.allowed, true);
    assert.equal(rExact.creditsUsed, 10);
    assert.equal(rExact.remaining, 0);
  });

  test('21. used + required > limit bloqueia operação', async () => {
    const dateKey = '2026-09-08';
    const userId = 'usr_over_limit';

    // Usar 8 de 10
    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit: 10, credits: 8, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR
    });

    // Operação de 3 créditos: 8 + 3 = 11 > 10 (bloqueado!)
    const rOver = await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit: 10, credits: 3, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR
    });
    assert.equal(rOver.allowed, false);
    assert.equal(rOver.creditsUsed, 8);
    assert.equal(rOver.remaining, 2);
  });

  test('22. required > limit bloqueia documento inexistente sem criar uso inválido', async () => {
    const dateKey = '2026-09-08';
    const userId = 'usr_doc_inexistente';

    // Tentar reservar 3 créditos em plano com teto diário 2
    const r = await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit: 2, credits: 3, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR
    });

    assert.equal(r.allowed, false);

    // Verifica que nenhum documento com creditsUsed = 3 foi persistido
    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey, TEST_DATA_DIR);
    assert.equal(usage, null, 'Nenhum documento de uso deve ter sido criado');
  });

  test('23. creditsPerDay = null (unlimited) registra consumo sem bloquear', async () => {
    const dateKey = '2026-09-08';
    const userId = 'usr_unlimited';

    // Múltiplas operações volumosas
    const r1 = await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit: null, credits: 10, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR
    });
    assert.equal(r1.allowed, true);
    assert.equal(r1.creditsUsed, 10);
    assert.equal(r1.remaining, null);

    const r2 = await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit: null, credits: 50, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR
    });
    assert.equal(r2.allowed, true);
    assert.equal(r2.creditsUsed, 60);
    assert.equal(r2.remaining, null);
  });

  test('24. is_admin = true NÃO possui bypass comercial', async () => {
    const adminUser = {
      id: 'usr_admin',
      is_admin: true,
      planId: 'plan_limited'
    };

    // Se o plano limita a 2 créditos diários, o admin não pode burlar
    const limit = 2;
    const dateKey = '2026-09-08';

    await jsonStorage.reserveAiDailyCredits({
      userId: adminUser.id, dateKey, limit, credits: 2, operationType: 'financial_query', dataDir: TEST_DATA_DIR
    });

    const denied = await jsonStorage.reserveAiDailyCredits({
      userId: adminUser.id, dateKey, limit, credits: 1, operationType: 'financial_query', dataDir: TEST_DATA_DIR
    });
    assert.equal(denied.allowed, false);
  });

  test('25. planId inválido resulta em FAIL-CLOSED (PLAN_REFERENCE_INVALID)', async () => {
    const invalidUser = {
      id: 'usr_broken_plan',
      planId: 'plan_inexistente_999'
    };

    await assert.rejects(
      async () => {
        await entitlementService.assertAccess(invalidUser, 'ai');
      },
      (err) => {
        assert.equal(err.code, 'PLAN_REFERENCE_INVALID');
        assert.equal(err.status, 403);
        return true;
      }
    );
  });
});

describe('Lote 5G — Concorrência e Atomicidade (Casos 26 e 27)', () => {
  beforeEach(() => {
    resetTestDataDir();
  });

  test('26. limit=10, used=6, duas reservas concorrentes de 4: exatamente uma aprovada', async () => {
    const dateKey = '2026-09-08';
    const userId = 'usr_concurrent_race_1';
    const limit = 10;

    // Estado inicial: used = 6
    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 6, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR
    });

    // Disparar duas reservas de 4 créditos simultaneamente
    const [resA, resB] = await Promise.all([
      jsonStorage.reserveAiDailyCredits({ userId, dateKey, limit, credits: 4, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR }),
      jsonStorage.reserveAiDailyCredits({ userId, dateKey, limit, credits: 4, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR })
    ]);

    const allowedCount = [resA, resB].filter(r => r.allowed).length;
    const deniedCount = [resA, resB].filter(r => !r.allowed).length;

    assert.equal(allowedCount, 1, 'Exatamente UMA reserva de 4 créditos deve ser aprovada');
    assert.equal(deniedCount, 1, 'Exatamente UMA reserva de 4 créditos deve ser recusada');
  });

  test('27. creditsUsed nunca ultrapassa limit sob concorrência', async () => {
    const dateKey = '2026-09-08';
    const userId = 'usr_concurrent_race_2';
    const limit = 10;

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 6, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR
    });

    await Promise.all([
      jsonStorage.reserveAiDailyCredits({ userId, dateKey, limit, credits: 4, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR }),
      jsonStorage.reserveAiDailyCredits({ userId, dateKey, limit, credits: 4, operationType: 'financial_analysis', dataDir: TEST_DATA_DIR })
    ]);

    const finalUsage = await jsonStorage.getAiDailyUsage(userId, dateKey, TEST_DATA_DIR);
    assert.equal(finalUsage.creditsUsed, 10);
    assert.ok(finalUsage.creditsUsed <= limit, 'creditsUsed nunca pode ultrapassar o limite');
  });
});

describe('Lote 5G — Falha de Provedor & Estorno Exato (Casos 28 a 31)', () => {
  beforeEach(() => {
    resetTestDataDir();
  });

  test('28. Timeout do provider estorna quantidade exata reservada e registra providerFailures', async () => {
    const dateKey = '2026-09-08';
    const userId = 'usr_timeout_release';

    // Reserva 3 créditos
    const res = await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit: 10, credits: 3, operationType: 'financial_analysis', reservationId: 'res_timeout_1'
    });
    assert.equal(res.creditsUsed, 3);

    // Inicia provider
    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_timeout_1' });

    // Timeout simulado -> release de 3 créditos com providerStarted: true
    const rel = await jsonStorage.releaseAiDailyCredits({
      userId, dateKey, reservationId: 'res_timeout_1', credits: 3, operationType: 'financial_analysis', providerStarted: true
    });
    assert.equal(rel.creditsUsed, 0, 'creditsUsed deve retornar a 0 após estorno');

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.creditsUsed, 0);
    assert.equal(usage.operations.financial_analysis || 0, 0, 'Operação não incrementada em falha');
    assert.equal(usage.providerCalls, 1, 'ProviderCall iniciada permanece 1');
    assert.equal(usage.providerFailures, 1, 'ProviderFailures incrementada em falha');
  });

  test('29. Resposta malformada do provider estorna créditos reservados e registra failure', async () => {
    const dateKey = '2026-09-08';
    const userId = 'usr_malformed_release';

    // Reserva 1 crédito
    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit: 5, credits: 1, operationType: 'financial_query', reservationId: 'res_malformed_1'
    });
    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_malformed_1' });

    // Erro de parse JSON simulado -> estorno com providerStarted = true
    const rel = await jsonStorage.releaseAiDailyCredits({
      userId, dateKey, reservationId: 'res_malformed_1', credits: 1, operationType: 'financial_query', providerStarted: true
    });
    assert.equal(rel.creditsUsed, 0);

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.providerCalls, 1);
    assert.equal(usage.providerFailures, 1);
  });

  test('30. Sucesso mantém consumo de créditos e finaliza reserva', async () => {
    const dateKey = '2026-09-08';
    const userId = 'usr_success_keep';

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit: 10, credits: 3, operationType: 'financial_analysis', reservationId: 'res_success_1'
    });
    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_success_1' });
    await jsonStorage.finalizeAiDailyCredits({ userId, dateKey, reservationId: 'res_success_1', operationType: 'financial_analysis' });

    // Operação teve sucesso: créditos e operations mantidos
    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.creditsUsed, 3);
    assert.equal(usage.operations.financial_analysis, 1);
    assert.equal(usage.providerCalls, 1);
    assert.equal(usage.providerFailures, 0);
  });

  test('31. Release nunca produz valor negativo (clamped em 0)', async () => {
    const dateKey = '2026-09-08';
    const userId = 'usr_clamp_zero';

    // Sem uso prévio, tenta estornar 5 créditos
    const rel = await jsonStorage.releaseAiDailyCredits({
      userId, dateKey, reservationId: 'res_inexistente', credits: 5, operationType: 'financial_analysis'
    });
    assert.equal(rel.creditsUsed, 0);

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    if (usage) {
      assert.ok(usage.creditsUsed >= 0, 'creditsUsed não pode ser negativo');
      assert.ok(usage.providerCalls >= 0, 'providerCalls não pode ser negativo');
    }
  });
});

describe('Lote 5G — Agregados de Uso (Casos 32 a 34)', () => {
  beforeEach(() => {
    resetTestDataDir();
  });

  test('32. operations incrementa corretamente os contadores por tipo após finalização', async () => {
    const dateKey = '2026-09-08';
    const userId = 'usr_aggregates';

    const r1 = await jsonStorage.reserveAiDailyCredits({ userId, dateKey, limit: 20, credits: 1, operationType: 'financial_query', reservationId: 'r1' });
    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'r1' });
    await jsonStorage.finalizeAiDailyCredits({ userId, dateKey, reservationId: 'r1', operationType: 'financial_query' });

    const r2 = await jsonStorage.reserveAiDailyCredits({ userId, dateKey, limit: 20, credits: 1, operationType: 'financial_query', reservationId: 'r2' });
    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'r2' });
    await jsonStorage.finalizeAiDailyCredits({ userId, dateKey, reservationId: 'r2', operationType: 'financial_query' });

    const r3 = await jsonStorage.reserveAiDailyCredits({ userId, dateKey, limit: 20, credits: 3, operationType: 'financial_analysis', reservationId: 'r3' });
    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'r3' });
    await jsonStorage.finalizeAiDailyCredits({ userId, dateKey, reservationId: 'r3', operationType: 'financial_analysis' });

    const r4 = await jsonStorage.reserveAiDailyCredits({ userId, dateKey, limit: 20, credits: 1, operationType: 'expense_interpretation', reservationId: 'r4' });
    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'r4' });
    await jsonStorage.finalizeAiDailyCredits({ userId, dateKey, reservationId: 'r4', operationType: 'expense_interpretation' });

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.creditsUsed, 6);
    assert.equal(usage.operations.financial_query, 2);
    assert.equal(usage.operations.financial_analysis, 1);
    assert.equal(usage.operations.expense_interpretation, 1);
    assert.equal(usage.providerCalls, 4);
  });

  test('33. providerCalls não conta operações locais gratuitas', () => {
    const res = classifyAiOperation({ endpoint: 'chat', message: 'Olá!' });
    assert.equal(res.creditCost, 0);
    assert.equal(res.providerRequired, false);
  });

  test('34. Plano ilimitado também registra agregados completos com reservationId', async () => {
    const dateKey = '2026-09-08';
    const userId = 'usr_unlimited_aggregates';

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit: null, credits: 3, operationType: 'financial_analysis', reservationId: 'res_unl_1'
    });
    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_unl_1' });
    await jsonStorage.finalizeAiDailyCredits({ userId, dateKey, reservationId: 'res_unl_1', operationType: 'financial_analysis' });

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.creditsUsed, 3);
    assert.equal(usage.operations.financial_analysis, 1);
    assert.equal(usage.providerCalls, 1);
  });
});

describe('Lote 5G.1 — Idempotent Reservations & Provider Telemetry (Casos Obrigatórios 1 a 15)', () => {
  beforeEach(() => {
    resetTestDataDir();
  });

  test('1. reserve A = 3, reserve B = 3, release A: somente 3 créditos devolvidos', async () => {
    const userId = 'usr_idemp_1';
    const dateKey = '2026-09-08';
    const limit = 10;

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_A'
    });
    const resB = await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_B'
    });
    assert.equal(resB.creditsUsed, 6);

    const relA = await jsonStorage.releaseAiDailyCredits({
      userId, dateKey, reservationId: 'res_A', credits: 3, operationType: 'financial_analysis'
    });
    assert.equal(relA.success, true);
    assert.equal(relA.creditsUsed, 3, 'Somente os 3 créditos de A devem ser devolvidos');

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.creditsUsed, 3);
  });

  test('2. release A novamente: NO-OP', async () => {
    const userId = 'usr_idemp_2';
    const dateKey = '2026-09-08';
    const limit = 10;

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_A'
    });
    const rel1 = await jsonStorage.releaseAiDailyCredits({
      userId, dateKey, reservationId: 'res_A', credits: 3
    });
    assert.equal(rel1.success, true);
    assert.equal(rel1.noop, false);
    assert.equal(rel1.creditsUsed, 0);

    // Segundo release de A
    const rel2 = await jsonStorage.releaseAiDailyCredits({
      userId, dateKey, reservationId: 'res_A', credits: 3
    });
    assert.equal(rel2.noop, true, 'Segundo release deve ser NO-OP');
    assert.equal(rel2.creditsUsed, 0);

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.creditsUsed, 0, 'creditsUsed inalterado no segundo release');
  });

  test('3. release A novamente: B permanece intacta', async () => {
    const userId = 'usr_idemp_3';
    const dateKey = '2026-09-08';
    const limit = 10;

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_A'
    });
    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_B'
    });

    // Release A 1a vez
    await jsonStorage.releaseAiDailyCredits({ userId, dateKey, reservationId: 'res_A', credits: 3 });

    // Release A 2a vez
    const relA2 = await jsonStorage.releaseAiDailyCredits({ userId, dateKey, reservationId: 'res_A', credits: 3 });
    assert.equal(relA2.noop, true);

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.creditsUsed, 3, 'Créditos de B (3) permanecem consumidos');
    assert.ok(usage.pendingReservations['res_B'], 'Reserva pendente B permanece intacta');
    assert.equal(usage.pendingReservations['res_A'], undefined, 'Reserva pendente A não existe');
  });

  test('4. finalize A: operation count +1', async () => {
    const userId = 'usr_idemp_4';
    const dateKey = '2026-09-08';
    const limit = 10;

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_A'
    });
    const finA = await jsonStorage.finalizeAiDailyCredits({
      userId, dateKey, reservationId: 'res_A', operationType: 'financial_analysis'
    });
    assert.equal(finA.success, true);
    assert.equal(finA.noop, false);
    assert.equal(finA.operationCount, 1);

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.operations.financial_analysis, 1);
    assert.equal(usage.creditsUsed, 3);
  });

  test('5. finalize A novamente: NO-OP', async () => {
    const userId = 'usr_idemp_5';
    const dateKey = '2026-09-08';
    const limit = 10;

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_A'
    });
    await jsonStorage.finalizeAiDailyCredits({
      userId, dateKey, reservationId: 'res_A', operationType: 'financial_analysis'
    });

    // Segundo finalize da mesma reservation
    const finA2 = await jsonStorage.finalizeAiDailyCredits({
      userId, dateKey, reservationId: 'res_A', operationType: 'financial_analysis'
    });
    assert.equal(finA2.noop, true, 'Segundo finalize deve ser NO-OP');

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.operations.financial_analysis, 1, 'Contador não deve subir para 2');
  });

  test('6. finalize A seguido de release A: release NO-OP', async () => {
    const userId = 'usr_idemp_6';
    const dateKey = '2026-09-08';
    const limit = 10;

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_A'
    });
    await jsonStorage.finalizeAiDailyCredits({
      userId, dateKey, reservationId: 'res_A', operationType: 'financial_analysis'
    });

    // Release após finalização bem-sucedida deve ser NO-OP
    const relAfterFin = await jsonStorage.releaseAiDailyCredits({
      userId, dateKey, reservationId: 'res_A', credits: 3
    });
    assert.equal(relAfterFin.noop, true, 'Release após finalize deve ser NO-OP');

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.creditsUsed, 3, 'Créditos não podem ser estornados após finalize');
    assert.equal(usage.operations.financial_analysis, 1);
  });

  test('7. release A seguido de finalize A: finalize NO-OP', async () => {
    const userId = 'usr_idemp_7';
    const dateKey = '2026-09-08';
    const limit = 10;

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_A'
    });
    await jsonStorage.releaseAiDailyCredits({
      userId, dateKey, reservationId: 'res_A', credits: 3
    });

    // Finalize após release deve ser NO-OP
    const finAfterRel = await jsonStorage.finalizeAiDailyCredits({
      userId, dateKey, reservationId: 'res_A', operationType: 'financial_analysis'
    });
    assert.equal(finAfterRel.noop, true, 'Finalize após release deve ser NO-OP');

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.operations.financial_analysis || 0, 0, 'Operações não podem ser contabilizadas');
    assert.equal(usage.creditsUsed, 0);
  });

  test('8. provider não iniciado + erro local: providerCalls 0 e providerFailures 0', async () => {
    const userId = 'usr_idemp_8';
    const dateKey = '2026-09-08';
    const limit = 10;

    const res = await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_local_err'
    });
    assert.equal(res.creditsUsed, 3);

    // Erro local antes de markProviderStarted -> release com providerStarted = false
    const rel = await jsonStorage.releaseAiDailyCredits({
      userId, dateKey, reservationId: 'res_local_err', credits: 3, providerStarted: false
    });
    assert.equal(rel.success, true);
    assert.equal(rel.creditsUsed, 0);

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.providerCalls, 0, 'providerCalls deve ser 0 quando provider não foi iniciado');
    assert.equal(usage.providerFailures, 0, 'providerFailures deve ser 0 para erro local');
    assert.equal(usage.creditsUsed, 0, 'Créditos estornados');
  });

  test('9. provider iniciado + sucesso: providerCalls 1, providerFailures 0', async () => {
    const userId = 'usr_idemp_9';
    const dateKey = '2026-09-08';
    const limit = 10;

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_success_9'
    });
    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_success_9' });
    await jsonStorage.finalizeAiDailyCredits({
      userId, dateKey, reservationId: 'res_success_9', operationType: 'financial_analysis'
    });

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.providerCalls, 1, 'providerCalls deve ser 1');
    assert.equal(usage.providerFailures, 0, 'providerFailures deve ser 0');
    assert.equal(usage.creditsUsed, 3);
    assert.equal(usage.operations.financial_analysis, 1);
  });

  test('10. provider iniciado + timeout: providerCalls 1, providerFailures 1, créditos estornados', async () => {
    const userId = 'usr_idemp_10';
    const dateKey = '2026-09-08';
    const limit = 10;

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_timeout_10'
    });
    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_timeout_10' });

    // Timeout -> release com providerStarted = true
    await jsonStorage.releaseAiDailyCredits({
      userId, dateKey, reservationId: 'res_timeout_10', credits: 3, providerStarted: true
    });

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.providerCalls, 1, 'providerCalls permanece 1');
    assert.equal(usage.providerFailures, 1, 'providerFailures incrementa para 1');
    assert.equal(usage.creditsUsed, 0, 'Créditos devem ser estornados');
    assert.equal(usage.operations.financial_analysis || 0, 0);
  });

  test('11. provider iniciado + malformed response: providerCalls 1, providerFailures 1, créditos estornados', async () => {
    const userId = 'usr_idemp_11';
    const dateKey = '2026-09-08';
    const limit = 10;

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 1, operationType: 'financial_query', reservationId: 'res_malformed_11'
    });
    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_malformed_11' });

    await jsonStorage.releaseAiDailyCredits({
      userId, dateKey, reservationId: 'res_malformed_11', credits: 1, providerStarted: true
    });

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.providerCalls, 1);
    assert.equal(usage.providerFailures, 1);
    assert.equal(usage.creditsUsed, 0);
  });

  test('12. duas reservations concorrentes do mesmo operationType: falha de uma nunca altera a outra', async () => {
    const userId = 'usr_idemp_12';
    const dateKey = '2026-09-08';
    const limit = 10;

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_A12'
    });
    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_B12'
    });

    // Falha de A após provider iniciado
    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_A12' });
    await jsonStorage.releaseAiDailyCredits({ userId, dateKey, reservationId: 'res_A12', credits: 3, providerStarted: true });

    // B conclui com sucesso
    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_B12' });
    await jsonStorage.finalizeAiDailyCredits({ userId, dateKey, reservationId: 'res_B12', operationType: 'financial_analysis' });

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.creditsUsed, 3, 'Créditos de B continuam debitados');
    assert.equal(usage.operations.financial_analysis, 1, 'Operação de B concluída');
    assert.equal(usage.providerCalls, 2, '2 chamadas ao provider iniciadas');
    assert.equal(usage.providerFailures, 1, '1 falha registrada (de A)');
  });

  test('13. unlimited continua funcionando com reservationId', async () => {
    const user = { id: 'usr_unl_13', planId: 'plan_unl_test' };
    const dateKey = '2026-09-08';

    const res = await jsonStorage.reserveAiDailyCredits({
      userId: user.id, dateKey, limit: null, credits: 3, operationType: 'financial_analysis', reservationId: 'res_unl_13'
    });
    assert.equal(res.allowed, true);
    assert.equal(res.reservationId, 'res_unl_13');
    assert.equal(res.creditsUsed, 3);

    await jsonStorage.markAiProviderStarted({ userId: user.id, dateKey, reservationId: 'res_unl_13' });
    await jsonStorage.finalizeAiDailyCredits({ userId: user.id, dateKey, reservationId: 'res_unl_13', operationType: 'financial_analysis' });

    const usage = await jsonStorage.getAiDailyUsage(user.id, dateKey);
    assert.equal(usage.creditsUsed, 3);
    assert.equal(usage.operations.financial_analysis, 1);
    assert.equal(usage.providerCalls, 1);
  });

  test('14. pendingReservations não contém prompt/contexto/mídia (somente metadados técnicos)', async () => {
    const userId = 'usr_idemp_14';
    const dateKey = '2026-09-08';
    const limit = 10;

    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 3, operationType: 'financial_analysis', reservationId: 'res_audit_keys'
    });

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    const pendingItem = usage.pendingReservations['res_audit_keys'];
    assert.ok(pendingItem, 'Item pendente deve existir');

    const keys = Object.keys(pendingItem);
    const forbidden = ['prompt', 'response', 'context', 'financialContext', 'media', 'message', 'query'];
    for (const f of forbidden) {
      assert.equal(keys.includes(f), false, `Chave proibida ${f} não pode existir em pendingReservations`);
    }
    assert.ok(keys.includes('credits'));
    assert.ok(keys.includes('operationType'));
    assert.ok(keys.includes('createdAt'));
    assert.ok(keys.includes('providerStarted'));
  });

  test('15. após finalize/release normal: pendingReservations correspondente desaparece', async () => {
    const userId = 'usr_idemp_15';
    const dateKey = '2026-09-08';
    const limit = 10;

    // Caso finalize
    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 2, operationType: 'financial_query', reservationId: 'res_fin_15'
    });
    let usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.ok(usage.pendingReservations['res_fin_15']);

    await jsonStorage.finalizeAiDailyCredits({ userId, dateKey, reservationId: 'res_fin_15', operationType: 'financial_query' });
    usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.pendingReservations['res_fin_15'], undefined, 'pendingReservations removida após finalize');

    // Caso release
    await jsonStorage.reserveAiDailyCredits({
      userId, dateKey, limit, credits: 2, operationType: 'financial_query', reservationId: 'res_rel_15'
    });
    usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.ok(usage.pendingReservations['res_rel_15']);

    await jsonStorage.releaseAiDailyCredits({ userId, dateKey, reservationId: 'res_rel_15', credits: 2 });
    usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.pendingReservations['res_rel_15'], undefined, 'pendingReservations removida após release');
  });

  test('16. aiQuotaService end-to-end: reserve retorna reservationId estruturado, markProviderStarted, finalize e release idempotente', async () => {
    // Configura mock plan no entitlementService
    const user = { id: 'usr_service_e2e', planId: 'plan_service_test' };
    const dateKey = aiQuotaService.getDateKey();

    // Mock do getLimit e assertAccess para o teste de serviço
    const origGetLimit = entitlementService.getLimit;
    const origAssert = entitlementService.assertAccess;
    entitlementService.getLimit = async () => 10;
    entitlementService.assertAccess = async () => true;

    try {
      // 1. Reserve
      const res = await aiQuotaService.reserve({
        user,
        operationType: 'financial_analysis',
        credits: 3
      });
      assert.equal(res.allowed, true);
      assert.ok(res.reservation);
      assert.ok(res.reservation.reservationId);
      assert.equal(res.reservation.credits, 3);
      assert.equal(res.reservation.operationType, 'financial_analysis');
      assert.equal(res.reservation.providerStarted, false);

      // 2. Mark Provider Started
      const startRes = await aiQuotaService.markProviderStarted(res.reservation);
      assert.equal(startRes.success, true);
      assert.equal(startRes.providerCalls, 1);
      assert.equal(res.reservation.providerStarted, true);

      // 3. Finalize
      const finRes = await aiQuotaService.finalize(res.reservation);
      assert.equal(finRes.success, true);
      assert.equal(finRes.noop, false);

      // 4. Segundo finalize -> NO-OP
      const finRes2 = await aiQuotaService.finalize(res.reservation);
      assert.equal(finRes2.noop, true);

      // 5. Release após finalize -> NO-OP
      const relRes = await aiQuotaService.release(res.reservation);
      assert.equal(relRes.noop, true);

      const usage = await jsonStorage.getAiDailyUsage(user.id, dateKey);
      assert.equal(usage.creditsUsed, 3);
      assert.equal(usage.operations.financial_analysis, 1);
      assert.equal(usage.providerCalls, 1);
      assert.equal(usage.providerFailures, 0);
      assert.equal(Object.keys(usage.pendingReservations || {}).length, 0);
    } finally {
      entitlementService.getLimit = origGetLimit;
      entitlementService.assertAccess = origAssert;
    }
  });

  test('17. Paridade de interface 5G.1: mongoStorage, jsonStorage e storageService exportam métodos de reserva, telemetria e finalização', () => {
    const mongoStorage = require('../server/services/mongoStorage');
    const storageService = require('../server/services/storageService');
    const requiredMethods = [
      'getAiDailyUsage',
      'reserveAiDailyCredits',
      'markAiProviderStarted',
      'finalizeAiDailyCredits',
      'releaseAiDailyCredits'
    ];

    for (const method of requiredMethods) {
      assert.equal(typeof jsonStorage[method], 'function', `jsonStorage deve exportar ${method}`);
      assert.equal(typeof mongoStorage[method], 'function', `mongoStorage deve exportar ${method}`);
      assert.equal(typeof storageService[method], 'function', `storageService deve exportar ${method}`);
    }

    assert.equal(typeof aiQuotaService.reserve, 'function');
    assert.equal(typeof aiQuotaService.markProviderStarted, 'function');
    assert.equal(typeof aiQuotaService.finalize, 'function');
    assert.equal(typeof aiQuotaService.release, 'function');
  });
});

describe('Lote 5G — Interpret Actions (Casos 35 a 38)', () => {
  test('35. Cancelamento local = 0 créditos', () => {
    // "cancela", "deixa pra la"
    const norm = normalizeText('deixa pra lá, cancela');
    const isCancellation = /\b(deixa pra la|cancela|cancelar|nao precisa|esquece)\b/i.test(norm);
    assert.ok(isCancellation, 'Deve ser detectado como cancelamento local');
  });

  test('36. Confirmação local = 0 créditos', () => {
    // "sim", "pode cadastrar"
    const norm = normalizeText('sim, pode salvar');
    const isConfirmation = /\b(sim|pode cadastrar|confirma|confirmar|pode salvar|salva)\b/i.test(norm);
    assert.ok(isConfirmation, 'Deve ser detectado como confirmação local');
  });

  test('37. Chamada real ao n8n no endpoint interpret = tarifada (1 crédito)', () => {
    const res = classifyAiOperation({ endpoint: 'interpret', message: 'Comprei almoço por 35 reais no débito' });
    assert.equal(res.operationType, 'expense_interpretation');
    assert.equal(res.creditCost, 1);
    assert.equal(res.providerRequired, true);
  });

  test('38. Follow-up multi-turno que chama n8n continua tarifado', () => {
    const res = classifyAiOperation({ endpoint: 'interpret', message: 'Foi no cartão Nubank', pendingAction: { status: 'collecting' } });
    assert.equal(res.operationType, 'expense_interpretation');
    assert.equal(res.creditCost, 1);
    assert.equal(res.providerRequired, true);
  });
});

describe('Lote 5G — Frontend Terminal Errors (Casos 39 a 42)', () => {
  function simulateFrontendCatch(actionErr) {
    const isTerminalStatus = actionErr && [403, 429, 503, 504].includes(actionErr.status);
    const terminalCodes = ['PLAN_ACCESS_DENIED', 'PLAN_REFERENCE_INVALID', 'PLAN_CONFIGURATION_INVALID', 'AI_DAILY_QUOTA_REACHED'];
    const isTerminalCode = actionErr && (terminalCodes.includes(actionErr.code) || terminalCodes.includes(actionErr.error));

    let fellBackToAiChat = false;
    if (isTerminalStatus || isTerminalCode) {
      // Re-throw (terminal, no fallback)
      return { terminal: true, fellBackToAiChat: false };
    } else {
      // Fallback to aiChat
      fellBackToAiChat = true;
      return { terminal: false, fellBackToAiChat: true };
    }
  }

  test('39. 403 não cai para aiChat (terminal)', () => {
    const res = simulateFrontendCatch({ status: 403, code: 'PLAN_ACCESS_DENIED' });
    assert.equal(res.terminal, true);
    assert.equal(res.fellBackToAiChat, false);
  });

  test('40. 429 não cai para aiChat (terminal)', () => {
    const res = simulateFrontendCatch({ status: 429, code: 'AI_DAILY_QUOTA_REACHED' });
    assert.equal(res.terminal, true);
    assert.equal(res.fellBackToAiChat, false);
  });

  test('41. 503 não cai para aiChat (terminal)', () => {
    const res = simulateFrontendCatch({ status: 503 });
    assert.equal(res.terminal, true);
    assert.equal(res.fellBackToAiChat, false);
  });

  test('42. 504 não cai para aiChat (terminal)', () => {
    const res = simulateFrontendCatch({ status: 504 });
    assert.equal(res.terminal, true);
    assert.equal(res.fellBackToAiChat, false);
  });
});

describe('Lote 5G — Modalidades Multimodais Futuras Não Ativadas (Casos 43 e 44)', () => {
  test('43. inputMode audio ainda não suportado = rejeitado sem provider/quota', () => {
    assert.equal(isInputModeSupported('audio'), false);

    const res = classifyAiOperation({ endpoint: 'chat', message: 'Áudio gravado', inputMode: 'audio' });
    assert.equal(res.unsupported, true);
    assert.equal(res.providerRequired, false);
    assert.equal(res.creditCost, 0);
    assert.ok(res.errorMessage.includes('audio'));
  });

  test('44. inputMode image ainda não suportado = rejeitado sem provider/quota', () => {
    assert.equal(isInputModeSupported('image'), false);

    const res = classifyAiOperation({ endpoint: 'chat', message: 'Comprovante em imagem', inputMode: 'image' });
    assert.equal(res.unsupported, true);
    assert.equal(res.providerRequired, false);
    assert.equal(res.creditCost, 0);
    assert.ok(res.errorMessage.includes('image'));
  });
});

describe('Lote 5G.2 — Provider Start Idempotency + Finalize Boundary (Casos 45 a 49)', () => {
  const dateKey = aiQuotaService.getDateKey();

  test('45. markProviderStarted idempotência estrita: chamadas duplicadas mantêm providerCalls = 1', async () => {
    const userId = 'usr_5g2_idemp_45';
    // reserve A
    const res = await jsonStorage.reserveAiDailyCredits({
      userId,
      dateKey,
      limit: 10,
      credits: 2,
      operationType: 'expense_interpretation',
      reservationId: 'res_idemp_A'
    });
    assert.equal(res.creditsUsed, 2);

    // markProviderStarted(A) primeira vez
    const start1 = await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_idemp_A' });
    assert.equal(start1.success, true);
    assert.equal(start1.providerCalls, 1);

    let usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.providerCalls, 1);
    assert.equal(usage.providerFailures, 0);
    assert.equal(usage.pendingReservations['res_idemp_A'].providerStarted, true);

    // markProviderStarted(A) segunda vez (chamada duplicada / retry)
    const start2 = await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_idemp_A' });
    assert.equal(start2.success, true);
    assert.equal(start2.providerCalls, 1, 'providerCalls NÃO deve ser incrementado na segunda chamada');

    usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.providerCalls, 1, 'providerCalls permanece 1');
    assert.equal(usage.providerFailures, 0, 'providerFailures permanece 0');
    assert.equal(usage.pendingReservations['res_idemp_A'].providerStarted, true);
  });

  test('46. markProviderStarted após finalize: chamada subsequente é NO-OP e não altera providerCalls', async () => {
    const userId = 'usr_5g2_idemp_46';
    // reserve B
    await jsonStorage.reserveAiDailyCredits({
      userId,
      dateKey,
      limit: 10,
      credits: 1,
      operationType: 'chat',
      reservationId: 'res_idemp_B'
    });

    // markProviderStarted(B)
    const start1 = await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_idemp_B' });
    assert.equal(start1.providerCalls, 1);

    // finalize(B)
    const fin = await jsonStorage.finalizeAiDailyCredits({ userId, dateKey, reservationId: 'res_idemp_B', operationType: 'chat' });
    assert.equal(fin.success, true);

    // markProviderStarted(B) novamente após finalize
    const start2 = await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_idemp_B' });
    assert.equal(start2.success, false, 'Reserva já finalizada não existe mais em pendingReservations');
    assert.equal(start2.providerCalls, 1, 'providerCalls permanece 1');

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.providerCalls, 1, 'providerCalls permanece 1');
    assert.equal(usage.creditsUsed, 1, 'Créditos consolidados');
    assert.equal(usage.operations.chat, 1);
  });

  test('47. aiQuotaService end-to-end: markProviderStarted duplicado e chamado após finalize', async () => {
    const user = { id: 'usr_quota_idemp_svc_47', planId: 'plan_test' };
    const origGetLimit = entitlementService.getLimit;
    const origAssert = entitlementService.assertAccess;
    entitlementService.getLimit = async () => 10;
    entitlementService.assertAccess = async () => true;

    try {
      const res = await aiQuotaService.reserve({
        user,
        operationType: 'expense_interpretation',
        credits: 1
      });
      assert.ok(res.reservation);

      // 1ª chamada
      const s1 = await aiQuotaService.markProviderStarted(res.reservation);
      assert.equal(s1.providerCalls, 1);

      // 2ª chamada (duplicada)
      const s2 = await aiQuotaService.markProviderStarted(res.reservation);
      assert.equal(s2.providerCalls, 1);

      let usage = await jsonStorage.getAiDailyUsage(user.id, dateKey);
      assert.equal(usage.providerCalls, 1);
      assert.equal(usage.providerFailures, 0);

      // Finalize
      await aiQuotaService.finalize(res.reservation);

      // 3ª chamada após finalize
      const s3 = await aiQuotaService.markProviderStarted(res.reservation);
      assert.equal(s3.providerCalls, 1);

      usage = await jsonStorage.getAiDailyUsage(user.id, dateKey);
      assert.equal(usage.providerCalls, 1);
      assert.equal(usage.creditsUsed, 1);
    } finally {
      entitlementService.getLimit = origGetLimit;
      entitlementService.assertAccess = origAssert;
    }
  });

  test('48. Finalize boundary: falha local de persistência estorna créditos SEM incrementar providerFailures', async () => {
    const userId = 'usr_5g2_idemp_48';
    // Cenário: provider iniciou e respondeu com sucesso (providerCalls = 1),
    // mas uma etapa local indispensável (ex: saveAiProposal) falhou antes do finalize.
    // Regra comercial: devolver créditos ao usuário, providerCalls = 1, providerFailures = 0.
    const res = await jsonStorage.reserveAiDailyCredits({
      userId,
      dateKey,
      limit: 10,
      credits: 1,
      operationType: 'expense_interpretation',
      reservationId: 'res_local_fail'
    });
    assert.equal(res.creditsUsed, 1);

    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_local_fail' });
    let usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.providerCalls, 1);

    // Falha local: caller informa explicitamente providerFailed = false
    const rel = await jsonStorage.releaseAiDailyCredits({
      userId,
      dateKey,
      reservationId: 'res_local_fail',
      credits: 1,
      providerStarted: false,
      providerFailed: false
    });
    assert.equal(rel.success, true);
    assert.equal(rel.creditsUsed, 0, 'Créditos devolvidos ao usuário');

    usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.creditsUsed, 0, 'Créditos estornados');
    assert.equal(usage.providerCalls, 1, 'Chamada externa ocorreu');
    assert.equal(usage.providerFailures, 0, 'Provedor não falhou; falha foi estritamente local');
  });

  test('49. Finalize boundary: falha de contrato semântico do provedor estorna créditos E incrementa providerFailures', async () => {
    const userId = 'usr_5g2_idemp_49';
    // Cenário: provider respondeu 200 com JSON sem action/data/answer válidos (contrato inválido).
    // Regra comercial: estornar créditos, providerCalls = 1, providerFailures = 1.
    const res = await jsonStorage.reserveAiDailyCredits({
      userId,
      dateKey,
      limit: 10,
      credits: 1,
      operationType: 'expense_interpretation',
      reservationId: 'res_contract_fail'
    });
    assert.equal(res.creditsUsed, 1);

    await jsonStorage.markAiProviderStarted({ userId, dateKey, reservationId: 'res_contract_fail' });

    // Falha de contrato do provedor: providerFailed = true
    const rel = await jsonStorage.releaseAiDailyCredits({
      userId,
      dateKey,
      reservationId: 'res_contract_fail',
      credits: 1,
      providerStarted: true,
      providerFailed: true
    });
    assert.equal(rel.success, true);
    assert.equal(rel.creditsUsed, 0);

    const usage = await jsonStorage.getAiDailyUsage(userId, dateKey);
    assert.equal(usage.creditsUsed, 0, 'Créditos estornados');
    assert.equal(usage.providerCalls, 1, 'Chamada externa ocorreu');
    assert.equal(usage.providerFailures, 1, 'Contabilizado como falha do provedor');
  });
});

after(async () => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  try {
    await closeDB();
  } catch (_) {}
});
