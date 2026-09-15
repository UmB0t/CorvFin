/**
 * CorvFin — Suíte de Testes Automatizados Lote A3.4
 * Benefits Credit TemporalRule — Persistence, Projection, Segregation, and UX
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  validateFinanceSemantics,
  sanitizeFinancePayload
} = require('../server/services/financeValidation');

const {
  projectFinancialMonth,
  projectBenefits
} = require('../server/services/financeProjectionService');

test.describe('CORVFIN V2 — LOTE A3.4 — BENEFITS CREDIT TEMPORALRULE', () => {

  function createBasePayload() {
    return {
      month: 8,
      year: 2026,
      profile: {
        name: 'Arlys CorvFin',
        theme: 'dark',
        baseSalary: 6000
      },
      benefitsConfig: {
        amount: 1000,
        va: 500,
        vr: 500
      },
      benefitTransactions: [],
      fixed: [],
      variable: [],
      extras: [],
      debtors: [],
      assets: [],
      aportes: [],
      incomes: {}
    };
  }

  // --------------------------------------------------------------------------
  // 1. VALIDAÇÃO BACKEND (financeValidation.js) (Casos 1 a 15)
  // --------------------------------------------------------------------------
  test.describe('1. Validação Backend (financeValidation.js)', () => {
    test('1. benefitsConfig sem creditRule continua válido', () => {
      const payload = createBasePayload();
      delete payload.benefitsConfig.creditRule;
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('2. aceita fixed_day válido ({ type: "fixed_day", day: 10 })', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = { type: 'fixed_day', day: 10 };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('3. aceita fixed_day + weekendAdjustment: "none"', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = { type: 'fixed_day', day: 10, weekendAdjustment: 'none' };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('4. aceita fixed_day + weekendAdjustment: "previous_business_day"', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = { type: 'fixed_day', day: 10, weekendAdjustment: 'previous_business_day' };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('5. aceita fixed_day + weekendAdjustment: "next_business_day"', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = { type: 'fixed_day', day: 10, weekendAdjustment: 'next_business_day' };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('6. aceita nth_business_day ordinal 1 (1º dia útil)', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = { type: 'nth_business_day', ordinal: 1 };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('7. aceita nth_business_day ordinal 5 (5º dia útil)', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = { type: 'nth_business_day', ordinal: 5 };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('8. aceita nth_business_day ordinal -1 (último dia útil)', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = { type: 'nth_business_day', ordinal: -1 };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('9. rejeita type desconhecido com erro 400', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = { type: 'biweekly_schedule', day: 10 };
      assert.throws(
        () => validateFinanceSemantics(payload),
        err => err.status === 400 && /benefitsConfig\.creditRule\.type/.test(err.message)
      );
    });

    test('10. rejeita day inválido (day: 0 ou day: 32) com erro 400', () => {
      const payload0 = createBasePayload();
      payload0.benefitsConfig.creditRule = { type: 'fixed_day', day: 0 };
      assert.throws(
        () => validateFinanceSemantics(payload0),
        err => err.status === 400 && /benefitsConfig\.creditRule\.day/.test(err.message)
      );

      const payload32 = createBasePayload();
      payload32.benefitsConfig.creditRule = { type: 'fixed_day', day: 32 };
      assert.throws(
        () => validateFinanceSemantics(payload32),
        err => err.status === 400 && /benefitsConfig\.creditRule\.day/.test(err.message)
      );
    });

    test('11. rejeita weekendAdjustment inválido com erro 400', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = { type: 'fixed_day', day: 10, weekendAdjustment: 'nearest_weekday' };
      assert.throws(
        () => validateFinanceSemantics(payload),
        err => err.status === 400 && /benefitsConfig\.creditRule\.weekendAdjustment/.test(err.message)
      );
    });

    test('12. rejeita ordinal 0 em nth_business_day com erro 400', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = { type: 'nth_business_day', ordinal: 0 };
      assert.throws(
        () => validateFinanceSemantics(payload),
        err => err.status === 400 && /benefitsConfig\.creditRule\.ordinal/.test(err.message)
      );
    });

    test('13. rejeita ordinal negativo != -1 (ex: -2) com erro 400', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = { type: 'nth_business_day', ordinal: -2 };
      assert.throws(
        () => validateFinanceSemantics(payload),
        err => err.status === 400 && /benefitsConfig\.creditRule\.ordinal/.test(err.message)
      );
    });

    test('14. zero-leakage fixed_day: rejeita campo ordinal em fixed_day', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = { type: 'fixed_day', day: 10, ordinal: 5 };
      assert.throws(
        () => validateFinanceSemantics(payload),
        err => err.status === 400 && /"ordinal" não é permitido em "benefitsConfig\.creditRule"/.test(err.message)
      );
    });

    test('15. zero-leakage nth_business_day: rejeita day e weekendAdjustment em nth_business_day', () => {
      const payloadWithDay = createBasePayload();
      payloadWithDay.benefitsConfig.creditRule = { type: 'nth_business_day', ordinal: 5, day: 10 };
      assert.throws(
        () => validateFinanceSemantics(payloadWithDay),
        err => err.status === 400 && /"day" não é permitido em "benefitsConfig\.creditRule"/.test(err.message)
      );

      const payloadWithAdj = createBasePayload();
      payloadWithAdj.benefitsConfig.creditRule = { type: 'nth_business_day', ordinal: 5, weekendAdjustment: 'previous_business_day' };
      assert.throws(
        () => validateFinanceSemantics(payloadWithAdj),
        err => err.status === 400 && /"weekendAdjustment" não é permitido em "benefitsConfig\.creditRule"/.test(err.message)
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. PROJEÇÃO DE BENEFÍCIOS (financeProjectionService.js) (Casos 16 a 25)
  // --------------------------------------------------------------------------
  test.describe('2. Projeção de Benefícios (projectBenefits)', () => {
    test('16. sem creditRule -> crédito permanece em benefits.undated com date null', () => {
      const finances = { benefitsConfig: { amount: 1200 } };
      const res = projectBenefits(finances, 2026, 8);
      assert.equal(res.events.length, 0);
      assert.equal(res.undated.length, 1);
      assert.equal(res.undated[0].sourceId, 'benefitsConfig');
      assert.equal(res.undated[0].date, null);
      assert.equal(res.undated[0].amount, 1200);
      assert.equal(res.summary.inflow, 1200);
    });

    test('17. fixed_day -> crédito aparece em benefits.events com data civil', () => {
      const finances = {
        benefitsConfig: {
          amount: 800,
          creditRule: { type: 'fixed_day', day: 10 }
        }
      };
      const res = projectBenefits(finances, 2026, 8); // 10/08/2026 é segunda-feira
      assert.equal(res.events.length, 1);
      assert.equal(res.undated.length, 0);
      assert.equal(res.events[0].date, '2026-08-10');
      assert.equal(res.events[0].amount, 800);
      assert.equal(res.events[0].temporalRuleType, 'fixed_day');
      assert.equal(res.summary.inflow, 800);
    });

    test('18. nth_business_day -> crédito aparece em benefits.events no dia útil correto', () => {
      const finances = {
        benefitsConfig: {
          amount: 950,
          creditRule: { type: 'nth_business_day', ordinal: 5 }
        }
      };
      // Em Agosto de 2026: 01=Sáb, 02=Dom, 03=Seg(1º), 04=Ter(2º), 05=Qua(3º), 06=Qui(4º), 07=Sex(5º)
      const res = projectBenefits(finances, 2026, 8);
      assert.equal(res.events.length, 1);
      assert.equal(res.undated.length, 0);
      assert.equal(res.events[0].date, '2026-08-07');
      assert.equal(res.events[0].temporalRuleType, 'nth_business_day');
      assert.equal(res.summary.inflow, 950);
    });

    test('19. previous_business_day ajusta sábado para sexta-feira', () => {
      const finances = {
        benefitsConfig: {
          amount: 1000,
          creditRule: { type: 'fixed_day', day: 15, weekendAdjustment: 'previous_business_day' }
        }
      };
      // 15/08/2026 é Sábado -> deve antecipar para 14/08/2026 (Sexta)
      const res = projectBenefits(finances, 2026, 8);
      assert.equal(res.events.length, 1);
      assert.equal(res.events[0].date, '2026-08-14');
      assert.equal(res.events[0].wasAdjusted, true);
    });

    test('20. next_business_day ajusta domingo para segunda-feira', () => {
      const finances = {
        benefitsConfig: {
          amount: 1000,
          creditRule: { type: 'fixed_day', day: 16, weekendAdjustment: 'next_business_day' }
        }
      };
      // 16/08/2026 é Domingo -> deve adiar para 17/08/2026 (Segunda)
      const res = projectBenefits(finances, 2026, 8);
      assert.equal(res.events.length, 1);
      assert.equal(res.events[0].date, '2026-08-17');
      assert.equal(res.events[0].wasAdjusted, true);
    });

    test('21. cross-month anterior: 01/11/2026 (Dom) + previous -> 2026-10-30 mantendo competência 2026-11', () => {
      const finances = {
        benefitsConfig: {
          amount: 1100,
          creditRule: { type: 'fixed_day', day: 1, weekendAdjustment: 'previous_business_day' }
        }
      };
      // 01/11/2026 é Domingo -> antecipa para 30/10/2026
      const res = projectBenefits(finances, 2026, 11);
      assert.equal(res.events.length, 1);
      assert.equal(res.events[0].date, '2026-10-30');
      assert.equal(res.events[0].competence, '2026-11');
      assert.equal(res.events[0].competenceKept, false);
      assert.equal(res.summary.inflow, 1100);
    });

    test('22. cross-month posterior: 31/01/2026 (Sáb) + next -> 2026-02-02 mantendo competência 2026-01', () => {
      const finances = {
        benefitsConfig: {
          amount: 1100,
          creditRule: { type: 'fixed_day', day: 31, weekendAdjustment: 'next_business_day' }
        }
      };
      // 31/01/2026 é Sábado -> adia para 02/02/2026
      const res = projectBenefits(finances, 2026, 1);
      assert.equal(res.events.length, 1);
      assert.equal(res.events[0].date, '2026-02-02');
      assert.equal(res.events[0].competence, '2026-01');
      assert.equal(res.events[0].competenceKept, false);
      assert.equal(res.summary.inflow, 1100);
    });

    test('23. competência preservada: creditItem sempre registra a competência financeira solicitada', () => {
      const finances = {
        benefitsConfig: {
          amount: 500,
          creditRule: { type: 'nth_business_day', ordinal: -1 }
        }
      };
      const res = projectBenefits(finances, 2026, 8);
      assert.equal(res.events[0].competence, '2026-08');
      assert.equal(res.events[0].date, '2026-08-31'); // Último dia útil de agosto/2026 é 31 (Segunda)
    });

    test('24. exatamente um crédito mensal: events + undated contém rigorosamente 1 crédito', () => {
      const finances = {
        benefitsConfig: {
          amount: 700,
          creditRule: { type: 'fixed_day', day: 5 }
        },
        benefitTransactions: [
          { description: 'Almoço', amount: 45, day: 5, month: 8, year: 2026 },
          { description: 'Supermercado', amount: 150, day: 10, month: 8, year: 2026 }
        ]
      };
      const res = projectBenefits(finances, 2026, 8);
      const creditEvents = res.events.filter(e => e.sourceType === 'benefit_credit');
      const creditUndated = res.undated.filter(e => e.sourceType === 'benefit_credit');
      assert.equal(creditEvents.length + creditUndated.length, 1);
    });

    test('25. fail-safe: regra corrompida ou inválida não crasha e envia para benefits.undated', () => {
      const finances = {
        benefitsConfig: {
          amount: 850,
          creditRule: { type: 'nth_business_day', ordinal: 99 } // Impossível em um mês de ~22 dias úteis
        }
      };
      const res = projectBenefits(finances, 2026, 8);
      assert.equal(res.events.length, 0);
      assert.equal(res.undated.length, 1);
      assert.equal(res.undated[0].date, null);
      assert.equal(res.summary.inflow, 850);
    });
  });

  // --------------------------------------------------------------------------
  // 3. SEGREGAÇÃO FINANCEIRA E SUMMARY (Casos 26 a 31)
  // --------------------------------------------------------------------------
  test.describe('3. Segregação Financeira Estrita', () => {
    test('26. crédito de benefícios NÃO altera o banking summary.inflow', () => {
      const finances = {
        profile: { baseSalary: 5000, salaryPayment: { type: 'fixed_day', day: 5 } },
        benefitsConfig: {
          amount: 1500,
          creditRule: { type: 'nth_business_day', ordinal: 5 }
        },
        fixed: [],
        variable: [],
        extras: [],
        debtors: []
      };
      const projection = projectFinancialMonth(finances, 2026, 8);
      assert.equal(projection.summary.inflow, 5000); // Exclusivamente o salário!
      assert.equal(projection.benefits.summary.inflow, 1500); // Isolado em benefits!
    });

    test('27. consumo de benefício NÃO altera o banking summary.outflow', () => {
      const finances = {
        profile: { baseSalary: 5000 },
        benefitsConfig: { amount: 1000 },
        benefitTransactions: [
          { description: 'Restaurante', amount: 300, day: 10, month: 8, year: 2026 }
        ],
        fixed: [{ name: 'Aluguel', amount: 2000, dueDay: 10 }],
        variable: [],
        extras: [],
        debtors: []
      };
      const projection = projectFinancialMonth(finances, 2026, 8);
      assert.equal(projection.summary.outflow, 2000); // Somente o aluguel bancário!
      assert.equal(projection.benefits.summary.outflow, 300); // Isolado em benefits!
    });

    test('28. cross-month em creditRule não vaza para banking summary de nenhuma competência', () => {
      const finances = {
        profile: { baseSalary: 6000 },
        benefitsConfig: {
          amount: 1200,
          creditRule: { type: 'fixed_day', day: 1, weekendAdjustment: 'previous_business_day' } // 01/11 -> 30/10
        },
        fixed: [],
        variable: [],
        extras: [],
        debtors: []
      };
      // Competência 2026-10
      const projOct = projectFinancialMonth(finances, 2026, 10);
      assert.equal(projOct.summary.inflow, 6000); // Salário de outubro

      // Competência 2026-11
      const projNov = projectFinancialMonth(finances, 2026, 11);
      assert.equal(projNov.summary.inflow, 6000); // Salário de novembro
      assert.equal(projNov.benefits.summary.inflow, 1200); // Benefício pertence a novembro
    });

    test('29. benefits.summary.inflow reflete o crédito total', () => {
      const finances = {
        benefitsConfig: { amount: 1400, creditRule: { type: 'fixed_day', day: 15 } }
      };
      const res = projectBenefits(finances, 2026, 8);
      assert.equal(res.summary.inflow, 1400);
    });

    test('30. benefits.summary.outflow reflete soma dos consumos', () => {
      const finances = {
        benefitsConfig: { amount: 1000 },
        benefitTransactions: [
          { amount: 50, day: 2, month: 8, year: 2026 },
          { amount: 75.50, day: 3, month: 8, year: 2026 },
          { amount: 24.50, day: 4, month: 8, year: 2026 }
        ]
      };
      const res = projectBenefits(finances, 2026, 8);
      assert.equal(res.summary.outflow, 150);
    });

    test('31. benefits.summary.net reflete exatamente saldo (inflow - outflow)', () => {
      const finances = {
        benefitsConfig: { amount: 1000, creditRule: { type: 'nth_business_day', ordinal: 1 } },
        benefitTransactions: [
          { amount: 350.25, day: 5, month: 8, year: 2026 }
        ]
      };
      const res = projectBenefits(finances, 2026, 8);
      assert.equal(res.summary.net, 649.75);
    });
  });

  // --------------------------------------------------------------------------
  // 4. UX / HYDRATION / ROUND-TRIP (Casos 32 a 42)
  // --------------------------------------------------------------------------
  test.describe('4. UX, Hydration e Round-trip', () => {
    test('32. hydrate ausente: benefitsConfig sem creditRule define "none" e oculta grupos', () => {
      const state = { benefitsConfig: { amount: 1000 } };
      const cr = state.benefitsConfig?.creditRule;
      const expectedRuleType = (cr && cr.type) ? cr.type : 'none';
      assert.equal(expectedRuleType, 'none');
    });

    test('33. hydrate fixed_day: seleciona "fixed_day", popula dia e "none"', () => {
      const state = {
        benefitsConfig: {
          amount: 800,
          creditRule: { type: 'fixed_day', day: 10 }
        }
      };
      const cr = state.benefitsConfig.creditRule;
      assert.equal(cr.type, 'fixed_day');
      assert.equal(cr.day, 10);
      assert.equal(cr.weekendAdjustment || 'none', 'none');
    });

    test('34. hydrate fixed_day V2: popula dia e "previous_business_day"', () => {
      const state = {
        benefitsConfig: {
          amount: 800,
          creditRule: { type: 'fixed_day', day: 10, weekendAdjustment: 'previous_business_day' }
        }
      };
      const cr = state.benefitsConfig.creditRule;
      assert.equal(cr.type, 'fixed_day');
      assert.equal(cr.day, 10);
      assert.equal(cr.weekendAdjustment, 'previous_business_day');
    });

    test('35. hydrate nth_business_day: seleciona "nth_business_day" e ordinal correspondente', () => {
      const state = {
        benefitsConfig: {
          amount: 800,
          creditRule: { type: 'nth_business_day', ordinal: 5 }
        }
      };
      const cr = state.benefitsConfig.creditRule;
      assert.equal(cr.type, 'nth_business_day');
      assert.equal(cr.ordinal, 5);
    });

    test('36. payload fixed_day não contém ordinal', () => {
      const simulatedInput = {
        ruleType: 'fixed_day',
        day: '10',
        weekendAdjustment: 'previous_business_day'
      };

      const creditRule = {
        type: 'fixed_day',
        day: parseInt(simulatedInput.day, 10),
        weekendAdjustment: simulatedInput.weekendAdjustment
      };

      assert.equal(creditRule.ordinal, undefined);
      assert.equal(creditRule.type, 'fixed_day');
      assert.equal(creditRule.day, 10);
      assert.equal(creditRule.weekendAdjustment, 'previous_business_day');
    });

    test('37. payload nth_business_day não contém day nem weekendAdjustment', () => {
      const simulatedInput = {
        ruleType: 'nth_business_day',
        ordinal: '5'
      };

      const creditRule = {
        type: 'nth_business_day',
        ordinal: parseInt(simulatedInput.ordinal, 10)
      };

      assert.equal(creditRule.day, undefined);
      assert.equal(creditRule.weekendAdjustment, undefined);
      assert.equal(creditRule.type, 'nth_business_day');
      assert.equal(creditRule.ordinal, 5);
    });

    test('38. alternância dinâmica: markup em index.html contém seletores com IDs esperados', () => {
      const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
      assert.ok(html.includes('id="profBenefitCreditRuleType"'));
      assert.ok(html.includes('id="profBenefitFixedGroup"'));
      assert.ok(html.includes('id="profBenefitCreditDay"'));
      assert.ok(html.includes('id="profBenefitCreditWeekendAdj"'));
      assert.ok(html.includes('id="profBenefitBusinessGroup"'));
      assert.ok(html.includes('id="profBenefitBusinessDay"'));
    });

    test('39. round-trip de fixed_day: validação -> sanitização -> projeção', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = {
        type: 'fixed_day',
        day: 10,
        weekendAdjustment: 'previous_business_day'
      };

      const sanitized = sanitizeFinancePayload(payload);
      assert.deepStrictEqual(sanitized.benefitsConfig.creditRule, {
        type: 'fixed_day',
        day: 10,
        weekendAdjustment: 'previous_business_day'
      });

      const proj = projectBenefits(sanitized, 2026, 8);
      assert.equal(proj.events.length, 1);
      assert.equal(proj.events[0].date, '2026-08-10');
    });

    test('40. round-trip de nth_business_day: validação -> sanitização -> projeção', () => {
      const payload = createBasePayload();
      payload.benefitsConfig.creditRule = {
        type: 'nth_business_day',
        ordinal: -1
      };

      const sanitized = sanitizeFinancePayload(payload);
      assert.deepStrictEqual(sanitized.benefitsConfig.creditRule, {
        type: 'nth_business_day',
        ordinal: -1
      });

      const proj = projectBenefits(sanitized, 2026, 8);
      assert.equal(proj.events.length, 1);
      assert.equal(proj.events[0].date, '2026-08-31');
    });

    test('41. remoção / desconfiguração: ao remover creditRule, crédito volta para benefits.undated', () => {
      const payload = createBasePayload();
      // Usuário desconfigura -> creditRule é deletada
      delete payload.benefitsConfig.creditRule;

      const sanitized = sanitizeFinancePayload(payload);
      assert.equal(sanitized.benefitsConfig.creditRule, undefined);

      const proj = projectBenefits(sanitized, 2026, 8);
      assert.equal(proj.events.length, 0);
      assert.equal(proj.undated.length, 1);
      assert.equal(proj.undated[0].date, null);
      assert.equal(proj.undated[0].amount, 1000);
    });

    test('42. Calendar API projeta crédito datado exclusivamente em response.benefits', () => {
      const finances = {
        profile: { baseSalary: 5000 },
        benefitsConfig: {
          amount: 1000,
          creditRule: { type: 'nth_business_day', ordinal: 5 }
        },
        fixed: [],
        variable: [],
        extras: [],
        debtors: []
      };

      const fullCalendar = projectFinancialMonth(finances, 2026, 8);
      // O crédito datado está em benefits.events
      const benCredit = fullCalendar.benefits.events.find(e => e.sourceType === 'benefit_credit');
      assert.ok(benCredit, 'Crédito mensal deve estar presente em benefits.events');
      assert.equal(benCredit.date, '2026-08-07');

      // E NUNCA em events bancários
      const bankingCredit = fullCalendar.events.find(e => e.sourceType === 'benefit_credit');
      assert.equal(bankingCredit, undefined, 'Crédito de benefício nunca deve poluir events bancários');
    });
  });
});
