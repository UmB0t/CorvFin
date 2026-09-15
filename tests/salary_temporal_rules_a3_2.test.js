/**
 * CorvFin V2 — Suíte de Testes da Integração de Temporal Rules ao Salário (tests/salary_temporal_rules_a3_2.test.js)
 *
 * Lote A3.2 — Validação da Projeção de Salário com TemporalRule V2
 *
 * Cobertura mandatória:
 * 1. salaryPayment legacy fixed_day ({ type: "fixed_day", day: 5 })
 * 2. fixed_day + weekendAdjustment: "none"
 * 3. fixed_day + weekendAdjustment: "previous_business_day"
 * 4. fixed_day + weekendAdjustment: "next_business_day"
 * 5. nth_business_day ordinal 1 (1º dia útil)
 * 6. nth_business_day ordinal 5 (5º dia útil)
 * 7. nth_business_day ordinal -1 (último dia útil)
 * 8. salaryPayment ausente -> undated com date: null
 * 9. salaryPayment inválido (day: 35, ordinal: 0) -> undated com date: null
 * 10. salaryPayment type desconhecido -> undated com date: null
 * 11. summary.inflow rigorosamente preservado quando salário cai em undated
 * 12. summary.inflow rigorosamente preservado na competência quando ocorre cross-month
 * 13. Metadado competence preservado com a competência solicitada
 * 14. Data civil real resolvida preservada sem clamp artificial à competência
 * 15. Cross-month anterior (2026-11 dia 1 anterior -> 2026-10-30)
 * 16. Cross-month posterior (2026-01 dia 31 posterior -> 2026-02-02)
 * 17. Virada de ano (2028-12 dia 31 posterior -> 2029-01-01)
 * 18. Fevereiro comum (clamp 31 -> 28 e ajuste subsequente para 02/03)
 * 19. Ano bissexto (2024-02 dia 29 preservado e dia 31 clamped para 29)
 * 20. Zero duplicação de salário entre competências adjacentes
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const {
  projectSalary,
  projectFinancialMonth
} = require('../server/services/financeProjectionService');

describe('CORVFIN V2 — LOTE A3.2 — SALARY TEMPORALRULE INTEGRATION', () => {

  // --------------------------------------------------------------------------
  // 1. Compatibilidade Legada (fixed_day sem ajuste)
  // --------------------------------------------------------------------------
  test('1. salaryPayment legacy fixed_day funciona sem ajuste e mantém data nominal', () => {
    // 05/07/2026 é Domingo. Sem weekendAdjustment, permanece dia 5.
    const finances = {
      profile: {
        baseSalary: 6000,
        salaryPayment: { type: 'fixed_day', day: 5 }
      }
    };

    const res = projectSalary(finances, 2026, 7);
    assert.ok(res, 'projectSalary deve retornar objeto');
    assert.strictEqual(res.sourceType, 'salary');
    assert.strictEqual(res.date, '2026-07-05');
    assert.strictEqual(res.nominalDay, 5);
    assert.strictEqual(res.wasClamped, false);
    assert.strictEqual(res.wasAdjusted, false);
    assert.strictEqual(res.competenceKept, true);
    assert.strictEqual(res.temporalRuleType, 'fixed_day');
    assert.strictEqual(res.weekendAdjustment, 'none');
    assert.strictEqual(res.competence, '2026-07');
    assert.strictEqual(res.amount, 6000);
  });

  // --------------------------------------------------------------------------
  // 2. fixed_day + weekendAdjustment: "none"
  // --------------------------------------------------------------------------
  test('2. fixed_day com weekendAdjustment "none" explícito não desloca final de semana', () => {
    const finances = {
      profile: {
        baseSalary: 4500,
        salaryPayment: { type: 'fixed_day', day: 19, weekendAdjustment: 'none' }
      }
    };
    // 19/09/2026 é Sábado
    const res = projectSalary(finances, 2026, 9);
    assert.strictEqual(res.date, '2026-09-19');
    assert.strictEqual(res.nominalDay, 19);
    assert.strictEqual(res.wasAdjusted, false);
    assert.strictEqual(res.competenceKept, true);
  });

  // --------------------------------------------------------------------------
  // 3. fixed_day + weekendAdjustment: "previous_business_day"
  // --------------------------------------------------------------------------
  test('3. fixed_day no sábado com previous_business_day ajusta para sexta-feira anterior', () => {
    const finances = {
      profile: {
        baseSalary: 5500,
        salaryPayment: { type: 'fixed_day', day: 19, weekendAdjustment: 'previous_business_day' }
      }
    };
    // 19/09/2026 é Sábado -> Sexta 18/09
    const res = projectSalary(finances, 2026, 9);
    assert.strictEqual(res.date, '2026-09-18');
    assert.strictEqual(res.nominalDay, 19);
    assert.strictEqual(res.wasAdjusted, true);
    assert.strictEqual(res.competenceKept, true);
    assert.strictEqual(res.temporalRuleType, 'fixed_day');
  });

  // --------------------------------------------------------------------------
  // 4. fixed_day + weekendAdjustment: "next_business_day"
  // --------------------------------------------------------------------------
  test('4. fixed_day no domingo com next_business_day ajusta para segunda-feira posterior', () => {
    const finances = {
      profile: {
        baseSalary: 5500,
        salaryPayment: { type: 'fixed_day', day: 20, weekendAdjustment: 'next_business_day' }
      }
    };
    // 20/09/2026 é Domingo -> Segunda 21/09
    const res = projectSalary(finances, 2026, 9);
    assert.strictEqual(res.date, '2026-09-21');
    assert.strictEqual(res.nominalDay, 20);
    assert.strictEqual(res.wasAdjusted, true);
    assert.strictEqual(res.competenceKept, true);
    assert.strictEqual(res.temporalRuleType, 'fixed_day');
  });

  // --------------------------------------------------------------------------
  // 5. nth_business_day ordinal: 1
  // --------------------------------------------------------------------------
  test('5. nth_business_day ordinal 1 resolve para o 1º dia útil da competência', () => {
    // Novembro 2026: 01/11 é Domingo -> 1º dia útil é Segunda 02/11
    const finances = {
      profile: {
        baseSalary: 7000,
        salaryPayment: { type: 'nth_business_day', ordinal: 1 }
      }
    };

    const res = projectSalary(finances, 2026, 11);
    assert.strictEqual(res.date, '2026-11-02');
    assert.strictEqual(res.nominalDay, 2);
    assert.strictEqual(res.wasClamped, false);
    assert.strictEqual(res.wasAdjusted, false);
    assert.strictEqual(res.competenceKept, true);
    assert.strictEqual(res.temporalRuleType, 'nth_business_day');
  });

  // --------------------------------------------------------------------------
  // 6. nth_business_day ordinal: 5
  // --------------------------------------------------------------------------
  test('6. nth_business_day ordinal 5 resolve para o 5º dia útil do mês', () => {
    // Setembro 2026: 01 Ter, 02 Qua, 03 Qui, 04 Sex, [05 Sáb, 06 Dom], 07 Seg (5º dia útil)
    const finances = {
      profile: {
        baseSalary: 8000,
        salaryPayment: { type: 'nth_business_day', ordinal: 5 }
      }
    };

    const res = projectSalary(finances, 2026, 9);
    assert.strictEqual(res.date, '2026-09-07');
    assert.strictEqual(res.nominalDay, 7);
    assert.strictEqual(res.competenceKept, true);
    assert.strictEqual(res.temporalRuleType, 'nth_business_day');
  });

  // --------------------------------------------------------------------------
  // 7. nth_business_day ordinal: -1 (último dia útil)
  // --------------------------------------------------------------------------
  test('7. nth_business_day ordinal -1 resolve para o último dia útil do mês', () => {
    // Outubro 2026: 31/10 é Sábado -> último dia útil é Sexta 30/10
    const finances = {
      profile: {
        baseSalary: 5200,
        salaryPayment: { type: 'nth_business_day', ordinal: -1 }
      }
    };

    const res = projectSalary(finances, 2026, 10);
    assert.strictEqual(res.date, '2026-10-30');
    assert.strictEqual(res.nominalDay, 30);
    assert.strictEqual(res.competenceKept, true);
    assert.strictEqual(res.temporalRuleType, 'nth_business_day');
  });

  // --------------------------------------------------------------------------
  // 8. salaryPayment ausente -> undated
  // --------------------------------------------------------------------------
  test('8. salaryPayment ausente projeta ocorrência em undated com date null', () => {
    const finances = {
      profile: {
        baseSalary: 4000
        // salaryPayment ausente
      }
    };

    const resSalary = projectSalary(finances, 2026, 9);
    assert.strictEqual(resSalary.date, null);
    assert.strictEqual(resSalary.competence, '2026-09');

    const proj = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(proj.events.length, 0);
    assert.strictEqual(proj.undated.length, 1);
    assert.strictEqual(proj.undated[0].sourceType, 'salary');
    assert.strictEqual(proj.undated[0].date, null);
  });

  // --------------------------------------------------------------------------
  // 9. salaryPayment com parâmetros inválidos -> undated (fail-safe)
  // --------------------------------------------------------------------------
  test('9. salaryPayment inválido (day: 35 ou ordinal: 0) vai para undated sem crash', () => {
    const financesInvalidDay = {
      profile: {
        baseSalary: 3800,
        salaryPayment: { type: 'fixed_day', day: 35 }
      }
    };

    const proj1 = projectFinancialMonth(financesInvalidDay, 2026, 9);
    assert.strictEqual(proj1.events.length, 0);
    assert.strictEqual(proj1.undated.length, 1);
    assert.strictEqual(proj1.undated[0].sourceType, 'salary');
    assert.strictEqual(proj1.undated[0].date, null);

    const financesInvalidOrdinal = {
      profile: {
        baseSalary: 3800,
        salaryPayment: { type: 'nth_business_day', ordinal: 0 }
      }
    };

    const proj2 = projectFinancialMonth(financesInvalidOrdinal, 2026, 9);
    assert.strictEqual(proj2.events.length, 0);
    assert.strictEqual(proj2.undated.length, 1);
    assert.strictEqual(proj2.undated[0].date, null);
  });

  // --------------------------------------------------------------------------
  // 10. salaryPayment com type desconhecido -> undated
  // --------------------------------------------------------------------------
  test('10. salaryPayment com type desconhecido vai para undated sem crash', () => {
    const finances = {
      profile: {
        baseSalary: 4200,
        salaryPayment: { type: 'biweekly_schedule', days: [5, 20] }
      }
    };

    const proj = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(proj.events.length, 0);
    assert.strictEqual(proj.undated.length, 1);
    assert.strictEqual(proj.undated[0].date, null);
    assert.strictEqual(proj.undated[0].amount, 4200);
  });

  // --------------------------------------------------------------------------
  // 11. summary.inflow preservado quando undated
  // --------------------------------------------------------------------------
  test('11. summary.inflow inclui integralmente o salário mesmo quando cai em undated', () => {
    const finances = {
      profile: {
        baseSalary: 5120
        // sem data
      }
    };

    const proj = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(proj.summary.inflow, 5120);
    assert.strictEqual(proj.summary.net, 5120);
  });

  // --------------------------------------------------------------------------
  // 12. summary.inflow preservado quando cross-month
  // --------------------------------------------------------------------------
  test('12. summary.inflow da competência solicitada preserva o salário mesmo quando date cai em outro mês', () => {
    // 01/11/2026 (Dom) + previous_business_day -> 2026-10-30 (Outubro)
    const finances = {
      profile: {
        baseSalary: 7500,
        salaryPayment: {
          type: 'fixed_day',
          day: 1,
          weekendAdjustment: 'previous_business_day'
        }
      }
    };

    const projNov = projectFinancialMonth(finances, 2026, 11);
    assert.strictEqual(projNov.summary.inflow, 7500, 'summary.inflow de novembro DEVE conter o salário de novembro');
    assert.strictEqual(projNov.summary.net, 7500);
  });

  // --------------------------------------------------------------------------
  // 13. Metadado competence preservado
  // --------------------------------------------------------------------------
  test('13. Ocorrência de salário preserva explicitamente a competence da projeção solicitada', () => {
    const finances = {
      profile: {
        baseSalary: 6200,
        salaryPayment: {
          type: 'fixed_day',
          day: 1,
          weekendAdjustment: 'previous_business_day'
        }
      }
    };

    const res = projectSalary(finances, 2026, 11);
    assert.strictEqual(res.competence, '2026-11');
    assert.strictEqual(res.date, '2026-10-30');
    assert.strictEqual(res.competenceKept, false);
  });

  // --------------------------------------------------------------------------
  // 14. Data civil real preservada
  // --------------------------------------------------------------------------
  test('14. Data civil real não é clamp-ada artificialmente ao mês da competência', () => {
    const finances = {
      profile: {
        baseSalary: 6200,
        salaryPayment: {
          type: 'fixed_day',
          day: 31,
          weekendAdjustment: 'next_business_day'
        }
      }
    };

    // 31/01/2026 é Sábado -> Segunda 02/02/2026
    const res = projectSalary(finances, 2026, 1);
    assert.strictEqual(res.date, '2026-02-02', 'Data civil DEVE ser 02/02/2026');
    assert.strictEqual(res.competence, '2026-01', 'Competência financeira DEVE ser 2026-01');
    assert.strictEqual(res.competenceKept, false);
  });

  // --------------------------------------------------------------------------
  // 15. Cross-month anterior (T11 Obrigatório)
  // --------------------------------------------------------------------------
  test('15. T11: Cross-month anterior projeta date no mês anterior mantendo ownership na competência', () => {
    const finances = {
      profile: {
        baseSalary: 10000,
        salaryPayment: {
          type: 'fixed_day',
          day: 1,
          weekendAdjustment: 'previous_business_day'
        }
      }
    };

    const projNov = projectFinancialMonth(finances, 2026, 11);
    assert.strictEqual(projNov.events.length, 1);
    const ev = projNov.events[0];
    assert.strictEqual(ev.sourceType, 'salary');
    assert.strictEqual(ev.competence, '2026-11');
    assert.strictEqual(ev.date, '2026-10-30');
    assert.strictEqual(ev.wasAdjusted, true);
    assert.strictEqual(ev.competenceKept, false);
  });

  // --------------------------------------------------------------------------
  // 16. Cross-month posterior (Janeiro -> Fevereiro)
  // --------------------------------------------------------------------------
  test('16. Cross-month posterior projeta date no mês seguinte mantendo ownership na competência', () => {
    const finances = {
      profile: {
        baseSalary: 9500,
        salaryPayment: {
          type: 'fixed_day',
          day: 31,
          weekendAdjustment: 'next_business_day'
        }
      }
    };

    const projJan = projectFinancialMonth(finances, 2026, 1);
    assert.strictEqual(projJan.events.length, 1);
    const ev = projJan.events[0];
    assert.strictEqual(ev.competence, '2026-01');
    assert.strictEqual(ev.date, '2026-02-02');
    assert.strictEqual(ev.competenceKept, false);
    assert.strictEqual(projJan.summary.inflow, 9500);
  });

  // --------------------------------------------------------------------------
  // 17. Virada de ano (Dezembro -> Janeiro do ano seguinte)
  // --------------------------------------------------------------------------
  test('17. Virada de ano: 31/12/2028 (Dom) com next_business_day projeta 01/01/2029', () => {
    const finances = {
      profile: {
        baseSalary: 8800,
        salaryPayment: {
          type: 'fixed_day',
          day: 31,
          weekendAdjustment: 'next_business_day'
        }
      }
    };

    const projDec = projectFinancialMonth(finances, 2028, 12);
    assert.strictEqual(projDec.events.length, 1);
    const ev = projDec.events[0];
    assert.strictEqual(ev.competence, '2028-12');
    assert.strictEqual(ev.date, '2029-01-01');
    assert.strictEqual(ev.competenceKept, false);
    assert.strictEqual(projDec.summary.inflow, 8800);
  });

  // --------------------------------------------------------------------------
  // 18. Fevereiro comum
  // --------------------------------------------------------------------------
  test('18. Fevereiro comum: dia 28 (Sáb em 2026) com next_business_day projeta 02/03/2026', () => {
    const finances = {
      profile: {
        baseSalary: 4800,
        salaryPayment: {
          type: 'fixed_day',
          day: 28,
          weekendAdjustment: 'next_business_day'
        }
      }
    };

    const projFeb = projectFinancialMonth(finances, 2026, 2);
    assert.strictEqual(projFeb.events.length, 1);
    const ev = projFeb.events[0];
    assert.strictEqual(ev.competence, '2026-02');
    assert.strictEqual(ev.date, '2026-03-02');
    assert.strictEqual(ev.wasAdjusted, true);
    assert.strictEqual(ev.competenceKept, false);
    assert.strictEqual(projFeb.summary.inflow, 4800);
  });

  // --------------------------------------------------------------------------
  // 19. Ano bissexto
  // --------------------------------------------------------------------------
  test('19. Ano bissexto: dia 29 de fevereiro de 2024 preservado e dia 31 clamped para 29', () => {
    // 29/02/2024 é Quinta-feira
    const finances29 = {
      profile: {
        baseSalary: 5000,
        salaryPayment: { type: 'fixed_day', day: 29, weekendAdjustment: 'previous_business_day' }
      }
    };
    const res29 = projectSalary(finances29, 2024, 2);
    assert.strictEqual(res29.date, '2024-02-29');
    assert.strictEqual(res29.wasClamped, false);
    assert.strictEqual(res29.wasAdjusted, false);

    // 31 em ano bissexto clamped para 29
    const finances31 = {
      profile: {
        baseSalary: 5000,
        salaryPayment: { type: 'fixed_day', day: 31, weekendAdjustment: 'none' }
      }
    };
    const res31 = projectSalary(finances31, 2024, 2);
    assert.strictEqual(res31.date, '2024-02-29');
    assert.strictEqual(res31.wasClamped, true);
  });

  // --------------------------------------------------------------------------
  // 20. Zero duplicação de salário entre competências adjacentes
  // --------------------------------------------------------------------------
  test('20. Zero duplicação: salário de novembro com data civil em outubro NÃO vaza para a projeção de outubro', () => {
    const finances = {
      profile: {
        baseSalary: 10000,
        salaryPayment: {
          type: 'fixed_day',
          day: 1,
          weekendAdjustment: 'previous_business_day'
        }
      }
    };

    // Projeta Outubro de 2026:
    // Outubro projeta o salário de Outubro: 01/10/2026 (Quinta-feira, útil) -> 2026-10-01
    const projOct = projectFinancialMonth(finances, 2026, 10);
    const salaryEventsOct = projOct.events.filter(e => e.sourceType === 'salary');
    assert.strictEqual(salaryEventsOct.length, 1, 'Outubro deve ter exatamente 1 salário');
    assert.strictEqual(salaryEventsOct[0].competence, '2026-10');
    assert.strictEqual(salaryEventsOct[0].date, '2026-10-01');
    assert.strictEqual(projOct.summary.inflow, 10000, 'Inflow de outubro não recebe salário duplicado');

    // Projeta Novembro de 2026:
    // Novembro projeta o salário de Novembro: 01/11/2026 (Dom) -> 2026-10-30
    const projNov = projectFinancialMonth(finances, 2026, 11);
    const salaryEventsNov = projNov.events.filter(e => e.sourceType === 'salary');
    assert.strictEqual(salaryEventsNov.length, 1, 'Novembro deve ter exatamente 1 salário');
    assert.strictEqual(salaryEventsNov[0].competence, '2026-11');
    assert.strictEqual(salaryEventsNov[0].date, '2026-10-30');
    assert.strictEqual(projNov.summary.inflow, 10000, 'Inflow de novembro é 10000');
  });
});
