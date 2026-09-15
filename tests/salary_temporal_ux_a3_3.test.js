/**
 * CorvFin V2 — Suíte de Testes da Persistência e UX de Salary TemporalRule (tests/salary_temporal_ux_a3_3.test.js)
 *
 * Lote A3.3 — Validação ponta a ponta:
 * - Validação HTTP backend (financeValidation.js)
 * - Validação de integridade do Markup HTML (public/index.html)
 * - Lógica de hidratação, alternância e montagem de payload frontend
 * - Integração e round-trip com a Calendar API e Projection Service
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateFinanceSemantics, sanitizeFinancePayload } = require('../server/services/financeValidation');
const { projectFinancialMonth } = require('../server/services/financeProjectionService');

describe('CORVFIN V2 — LOTE A3.3 — SALARY TEMPORALRULE PERSISTENCE + CONFIGURATION UX', () => {

  function createBasePayload() {
    return {
      profile: {
        name: 'Usuário Teste',
        baseSalary: 5000
      }
    };
  }

  // --------------------------------------------------------------------------
  // PARTE 1: Validação Backend (financeValidation.js)
  // --------------------------------------------------------------------------
  describe('1. Validação Backend (financeValidation.js)', () => {
    test('1. aceita fixed_day legado ({ type: "fixed_day", day: 5 })', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'fixed_day', day: 5 };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('2. aceita fixed_day + weekendAdjustment: "none"', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'fixed_day', day: 5, weekendAdjustment: 'none' };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('3. aceita fixed_day + weekendAdjustment: "previous_business_day"', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'fixed_day', day: 5, weekendAdjustment: 'previous_business_day' };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('4. aceita fixed_day + weekendAdjustment: "next_business_day"', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'fixed_day', day: 5, weekendAdjustment: 'next_business_day' };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('5. aceita nth_business_day ordinal 1 (1º dia útil)', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'nth_business_day', ordinal: 1 };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('6. aceita nth_business_day ordinal 5 (5º dia útil)', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'nth_business_day', ordinal: 5 };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('7. aceita nth_business_day ordinal -1 (último dia útil)', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'nth_business_day', ordinal: -1 };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));
    });

    test('8. rejeita type desconhecido com erro 400', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'biweekly_schedule', day: 5 };
      assert.throws(
        () => validateFinanceSemantics(payload),
        err => err.status === 400 && /profile\.salaryPayment\.type/.test(err.message)
      );
    });

    test('9. rejeita day 0 em fixed_day com erro 400', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'fixed_day', day: 0 };
      assert.throws(
        () => validateFinanceSemantics(payload),
        err => err.status === 400 && /profile\.salaryPayment\.day/.test(err.message)
      );
    });

    test('10. rejeita day 32 em fixed_day com erro 400', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'fixed_day', day: 32 };
      assert.throws(
        () => validateFinanceSemantics(payload),
        err => err.status === 400 && /profile\.salaryPayment\.day/.test(err.message)
      );
    });

    test('11. rejeita weekendAdjustment inválido com erro 400', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'fixed_day', day: 5, weekendAdjustment: 'nearest_weekday' };
      assert.throws(
        () => validateFinanceSemantics(payload),
        err => err.status === 400 && /profile\.salaryPayment\.weekendAdjustment/.test(err.message)
      );
    });

    test('12. rejeita ordinal 0 em nth_business_day com erro 400', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'nth_business_day', ordinal: 0 };
      assert.throws(
        () => validateFinanceSemantics(payload),
        err => err.status === 400 && /profile\.salaryPayment\.ordinal/.test(err.message)
      );
    });

    test('13. rejeita ordinal negativo != -1 (ex: -2) com erro 400', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'nth_business_day', ordinal: -2 };
      assert.throws(
        () => validateFinanceSemantics(payload),
        err => err.status === 400 && /profile\.salaryPayment\.ordinal/.test(err.message)
      );
    });

    test('14. rejeita ordinal não inteiro (ex: 2.5) com erro 400', () => {
      const payload = createBasePayload();
      payload.profile.salaryPayment = { type: 'nth_business_day', ordinal: 2.5 };
      assert.throws(
        () => validateFinanceSemantics(payload),
        err => err.status === 400 && /profile\.salaryPayment\.ordinal/.test(err.message)
      );
    });
  });

  // --------------------------------------------------------------------------
  // PARTE 2: Markup e Lógica Frontend (public/index.html & profile.js)
  // --------------------------------------------------------------------------
  describe('2. Markup HTML e Lógica Frontend de Perfil', () => {
    const htmlContent = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

    test('15. Markup HTML contém todos os seletores e opções sem menção a CLT', () => {
      // Controles principais
      assert.ok(htmlContent.includes('id="profSalaryRuleType"'), 'deve conter select de tipo de regra');
      assert.ok(htmlContent.includes('id="profSalaryFixedGroup"'), 'deve conter grupo de dia fixo');
      assert.ok(htmlContent.includes('id="profSalaryDay"'), 'deve conter input de dia nominal');
      assert.ok(htmlContent.includes('id="profSalaryWeekendAdj"'), 'deve conter select de ajuste de fim de semana');
      assert.ok(htmlContent.includes('id="profSalaryBusinessGroup"'), 'deve conter grupo de dia útil');
      assert.ok(htmlContent.includes('id="profSalaryBusinessDay"'), 'deve conter select de dia útil');

      // Opções
      assert.ok(htmlContent.includes('value="fixed_day"'), 'deve ter opção fixed_day');
      assert.ok(htmlContent.includes('value="nth_business_day"'), 'deve ter opção nth_business_day');
      assert.ok(htmlContent.includes('value="previous_business_day"'), 'deve ter opção previous_business_day');
      assert.ok(htmlContent.includes('value="next_business_day"'), 'deve ter opção next_business_day');
      assert.ok(htmlContent.includes('value="-1"'), 'deve ter opção último dia útil');

      // Terminologia neutra (sem 'Padrão CLT')
      assert.strictEqual(htmlContent.includes('Padrão CLT'), false, 'NÃO deve conter terminologia "Padrão CLT"');
      assert.strictEqual(htmlContent.includes('CLT'), false, 'NÃO deve referenciar CLT');
    });

    // Helper para criar mock de elementos de perfil
    function createProfileElementsMock() {
      const elements = {
        profSalaryRuleType: { value: 'fixed_day' },
        profSalaryDay: { value: '' },
        profSalaryWeekendAdj: { value: 'none' },
        profSalaryBusinessDay: { value: '5' },
        profSalaryFixedGroup: { style: { display: 'grid' } },
        profSalaryBusinessGroup: { style: { display: 'none' } }
      };

      function hydrate(state) {
        const sp = state.profile?.salaryPayment;
        const isBizRule = sp && sp.type === 'nth_business_day';

        elements.profSalaryRuleType.value = isBizRule ? 'nth_business_day' : 'fixed_day';

        if (isBizRule) {
          elements.profSalaryFixedGroup.style.display = 'none';
          elements.profSalaryBusinessGroup.style.display = 'grid';
          elements.profSalaryBusinessDay.value = String(sp.ordinal != null ? sp.ordinal : '5');
          elements.profSalaryDay.value = '';
          elements.profSalaryWeekendAdj.value = 'none';
        } else {
          elements.profSalaryFixedGroup.style.display = 'grid';
          elements.profSalaryBusinessGroup.style.display = 'none';
          const salDay = sp?.day != null
            ? sp.day
            : (state.profile?.salaryDay != null ? state.profile.salaryDay : '');
          elements.profSalaryDay.value = String(salDay);
          elements.profSalaryWeekendAdj.value = sp?.weekendAdjustment || 'none';
          elements.profSalaryBusinessDay.value = '5';
        }
      }

      function toggleRuleType(newType) {
        elements.profSalaryRuleType.value = newType;
        if (newType === 'nth_business_day') {
          elements.profSalaryFixedGroup.style.display = 'none';
          elements.profSalaryBusinessGroup.style.display = 'grid';
        } else {
          elements.profSalaryFixedGroup.style.display = 'grid';
          elements.profSalaryBusinessGroup.style.display = 'none';
        }
      }

      function buildPayload() {
        const ruleType = elements.profSalaryRuleType.value;
        if (ruleType === 'nth_business_day') {
          const rawOrd = elements.profSalaryBusinessDay.value;
          const numOrd = Number(rawOrd);
          if (Number.isInteger(numOrd) && (numOrd === -1 || (numOrd >= 1 && numOrd <= 23))) {
            return { type: 'nth_business_day', ordinal: numOrd };
          }
          return null;
        } else {
          const rawSalDay = elements.profSalaryDay.value;
          if (rawSalDay !== undefined && rawSalDay !== '' && !isNaN(Number(rawSalDay))) {
            const numDay = Math.min(31, Math.max(1, parseInt(rawSalDay, 10)));
            const rawAdj = elements.profSalaryWeekendAdj.value || 'none';
            const weekendAdjustment = ['none', 'previous_business_day', 'next_business_day'].includes(rawAdj) ? rawAdj : 'none';
            return {
              type: 'fixed_day',
              day: numDay,
              weekendAdjustment
            };
          }
          return null;
        }
      }

      return { elements, hydrate, toggleRuleType, buildPayload };
    }

    test('16. hydrate fixed_day legado: seleciona "fixed_day", popula dia 5 e adjustment "none"', () => {
      const { elements, hydrate } = createProfileElementsMock();
      const state = { profile: { salaryPayment: { type: 'fixed_day', day: 5 } } };

      hydrate(state);

      assert.strictEqual(elements.profSalaryRuleType.value, 'fixed_day');
      assert.strictEqual(elements.profSalaryDay.value, '5');
      assert.strictEqual(elements.profSalaryWeekendAdj.value, 'none');
      assert.strictEqual(elements.profSalaryFixedGroup.style.display, 'grid');
      assert.strictEqual(elements.profSalaryBusinessGroup.style.display, 'none');
    });

    test('17. hydrate fixed_day V2: popula dia e adjustment "previous_business_day"', () => {
      const { elements, hydrate } = createProfileElementsMock();
      const state = {
        profile: {
          salaryPayment: { type: 'fixed_day', day: 10, weekendAdjustment: 'previous_business_day' }
        }
      };

      hydrate(state);

      assert.strictEqual(elements.profSalaryRuleType.value, 'fixed_day');
      assert.strictEqual(elements.profSalaryDay.value, '10');
      assert.strictEqual(elements.profSalaryWeekendAdj.value, 'previous_business_day');
    });

    test('18. hydrate nth_business_day: seleciona "nth_business_day", exibe bizGroup e popula ordinal 5', () => {
      const { elements, hydrate } = createProfileElementsMock();
      const state = { profile: { salaryPayment: { type: 'nth_business_day', ordinal: 5 } } };

      hydrate(state);

      assert.strictEqual(elements.profSalaryRuleType.value, 'nth_business_day');
      assert.strictEqual(elements.profSalaryBusinessDay.value, '5');
      assert.strictEqual(elements.profSalaryFixedGroup.style.display, 'none');
      assert.strictEqual(elements.profSalaryBusinessGroup.style.display, 'grid');
    });

    test('19. alternância de tipo alterna visibilidade dos grupos de controles', () => {
      const { elements, toggleRuleType } = createProfileElementsMock();

      toggleRuleType('nth_business_day');
      assert.strictEqual(elements.profSalaryFixedGroup.style.display, 'none');
      assert.strictEqual(elements.profSalaryBusinessGroup.style.display, 'grid');

      toggleRuleType('fixed_day');
      assert.strictEqual(elements.profSalaryFixedGroup.style.display, 'grid');
      assert.strictEqual(elements.profSalaryBusinessGroup.style.display, 'none');
    });

    test('20. payload fixed_day não contém campo ordinal', () => {
      const { elements, buildPayload } = createProfileElementsMock();
      elements.profSalaryRuleType.value = 'fixed_day';
      elements.profSalaryDay.value = '7';
      elements.profSalaryWeekendAdj.value = 'next_business_day';
      elements.profSalaryBusinessDay.value = '3'; // Residual que não deve vazar

      const payload = buildPayload();
      assert.deepStrictEqual(payload, {
        type: 'fixed_day',
        day: 7,
        weekendAdjustment: 'next_business_day'
      });
      assert.strictEqual(payload.ordinal, undefined);
    });

    test('21. payload nth_business_day não contém day nem weekendAdjustment', () => {
      const { elements, buildPayload } = createProfileElementsMock();
      elements.profSalaryRuleType.value = 'nth_business_day';
      elements.profSalaryBusinessDay.value = '-1';
      elements.profSalaryDay.value = '15'; // Residual que não deve vazar
      elements.profSalaryWeekendAdj.value = 'previous_business_day'; // Residual

      const payload = buildPayload();
      assert.deepStrictEqual(payload, {
        type: 'nth_business_day',
        ordinal: -1
      });
      assert.strictEqual(payload.day, undefined);
      assert.strictEqual(payload.weekendAdjustment, undefined);
    });

    test('22. fallback legado profile.salaryDay popula profSalaryDay quando salaryPayment ausente', () => {
      const { elements, hydrate } = createProfileElementsMock();
      const state = { profile: { salaryDay: 12 } }; // sem salaryPayment

      hydrate(state);

      assert.strictEqual(elements.profSalaryDay.value, '12');
      assert.strictEqual(elements.profSalaryRuleType.value, 'fixed_day');
    });

    test('23. ausência de regra: campo de dia vazio retorna null (não inventa regra)', () => {
      const { elements, buildPayload } = createProfileElementsMock();
      elements.profSalaryRuleType.value = 'fixed_day';
      elements.profSalaryDay.value = '';

      const payload = buildPayload();
      assert.strictEqual(payload, null);
    });
  });

  // --------------------------------------------------------------------------
  // PARTE 3: Integração Completa e Round-Trip
  // --------------------------------------------------------------------------
  describe('3. Integração Completa e Round-Trip', () => {
    test('24. round-trip de fixed_day: validação -> sanitização -> projeção', () => {
      const payload = {
        profile: {
          name: 'Lorenzo',
          baseSalary: 12000,
          salaryPayment: {
            type: 'fixed_day',
            day: 1,
            weekendAdjustment: 'previous_business_day'
          }
        }
      };

      // 1. Sanitização HTTP backend
      const sanitized = sanitizeFinancePayload(payload);
      assert.deepStrictEqual(sanitized.profile.salaryPayment, {
        type: 'fixed_day',
        day: 1,
        weekendAdjustment: 'previous_business_day'
      });

      // 2. Projeção na competência Novembro/2026 (01/11 é Domingo -> Sexta 30/10)
      const proj = projectFinancialMonth(sanitized, 2026, 11);
      assert.strictEqual(proj.events.length, 1);
      const salaryEv = proj.events[0];
      assert.strictEqual(salaryEv.sourceType, 'salary');
      assert.strictEqual(salaryEv.competence, '2026-11');
      assert.strictEqual(salaryEv.date, '2026-10-30');
      assert.strictEqual(salaryEv.wasAdjusted, true);
      assert.strictEqual(salaryEv.competenceKept, false);
      assert.strictEqual(proj.summary.inflow, 12000);
    });

    test('25. round-trip de nth_business_day: validação -> sanitização -> projeção', () => {
      const payload = {
        profile: {
          name: 'Lorenzo',
          baseSalary: 15000,
          salaryPayment: {
            type: 'nth_business_day',
            ordinal: 5
          }
        }
      };

      // 1. Sanitização HTTP backend
      const sanitized = sanitizeFinancePayload(payload);
      assert.deepStrictEqual(sanitized.profile.salaryPayment, {
        type: 'nth_business_day',
        ordinal: 5
      });

      // 2. Projeção em Setembro/2026 (5º dia útil é Segunda 07/09/2026)
      const proj = projectFinancialMonth(sanitized, 2026, 9);
      assert.strictEqual(proj.events.length, 1);
      const salaryEv = proj.events[0];
      assert.strictEqual(salaryEv.sourceType, 'salary');
      assert.strictEqual(salaryEv.competence, '2026-09');
      assert.strictEqual(salaryEv.date, '2026-09-07');
      assert.strictEqual(salaryEv.temporalRuleType, 'nth_business_day');
      assert.strictEqual(proj.summary.inflow, 15000);
    });

    test('26. Calendar API reflete regra persistida de último dia útil (ordinal: -1)', () => {
      const finances = {
        profile: {
          baseSalary: 8500,
          salaryPayment: {
            type: 'nth_business_day',
            ordinal: -1
          }
        }
      };

      // Outubro 2026: 31/10 é Sábado -> último dia útil é Sexta 30/10/2026
      const proj = projectFinancialMonth(finances, 2026, 10);
      const salaryEv = proj.events.find(e => e.sourceType === 'salary');
      assert.ok(salaryEv, 'Evento de salário deve existir');
      assert.strictEqual(salaryEv.date, '2026-10-30');
      assert.strictEqual(salaryEv.nominalDay, 30);
      assert.strictEqual(salaryEv.competence, '2026-10');
      assert.strictEqual(salaryEv.temporalRuleType, 'nth_business_day');
    });

    test('27. summary.inflow permanece rigorosamente íntegro e sem contaminação entre competências', () => {
      const finances = {
        profile: {
          baseSalary: 9000,
          salaryPayment: {
            type: 'nth_business_day',
            ordinal: 1
          }
        }
      };

      // Novembro 2026: 1º dia útil é 02/11/2026
      const projNov = projectFinancialMonth(finances, 2026, 11);
      assert.strictEqual(projNov.summary.inflow, 9000);
      assert.strictEqual(projNov.events[0].date, '2026-11-02');

      // Dezembro 2026: 1º dia útil é 01/12/2026 (Terça)
      const projDec = projectFinancialMonth(finances, 2026, 12);
      assert.strictEqual(projDec.summary.inflow, 9000);
      assert.strictEqual(projDec.events[0].date, '2026-12-01');
    });
  });
});
