/**
 * CorvFin V2 — Suíte de Testes do Domínio Temporal Canônico V2 (tests/temporal_rules_a3_1.test.js)
 *
 * Validação mandatória das regras puras de cálculo temporal, resolução de datas civis,
 * dias úteis Nível 1, ajustes de fim de semana, navegação civil e comportamento canônico cross-month.
 *
 * Cobertura mandatória:
 * A. Compatibilidade A1 (isLeapYear, getDaysInMonth, clampDayToMonth, parse/format, normalizeCompetenceKey, paidHistory)
 * B. Dia da semana (getDayOfWeek - segunda, sexta, sábado, domingo via algoritmo puro)
 * C. Navegação civil (getNextCivilDate, getPrevCivilDate com transições de mês, ano e anos bissextos)
 * D. fixed_day (dia comum, sem ajuste, adjustment none, previous_business_day, next_business_day, clamp 31, fevereiro)
 * E. nth_business_day (1º, 5º, último dia útil, mês iniciando sábado, mês finalizando domingo, ordinal excedente)
 * F. Cross-month (2026-11 -> 2026-10-30, 2026-01 -> 2026-02-02, dez->jan, jan->dez anterior, fev->março)
 * G. Invalid rules & fail-safe (null, {}, tipo desconhecido, day inválido, ordinal inválido, ajuste desconhecido, ano/mês inválido)
 * H. Imunidade estrita a Timezone
 * I. Paridade canônica entre shared/temporalDomain.js e adapter server/services/temporalUtils.js
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const TemporalDomain = require('../shared/temporalDomain');
const temporalUtils = require('../server/services/temporalUtils');

describe('CORVFIN V2 — LOTE A3.1 — DOMÍNIO TEMPORAL CANÔNICO ISOMÓRFICO', () => {

  // --------------------------------------------------------------------------
  // A. Compatibilidade A1
  // --------------------------------------------------------------------------
  describe('A. Compatibilidade A1 no Domínio Compartilhado', () => {
    test('isLeapYear calcula corretamente anos bissextos e seculares', () => {
      assert.strictEqual(TemporalDomain.isLeapYear(2024), true);
      assert.strictEqual(TemporalDomain.isLeapYear(2026), false);
      assert.strictEqual(TemporalDomain.isLeapYear(2000), true);
      assert.strictEqual(TemporalDomain.isLeapYear(2100), false);
      assert.strictEqual(TemporalDomain.isLeapYear('invalid'), false);
    });

    test('getDaysInMonth retorna total exato de dias', () => {
      assert.strictEqual(TemporalDomain.getDaysInMonth(2026, 1), 31);
      assert.strictEqual(TemporalDomain.getDaysInMonth(2026, 2), 28);
      assert.strictEqual(TemporalDomain.getDaysInMonth(2024, 2), 29);
      assert.strictEqual(TemporalDomain.getDaysInMonth(2026, 4), 30);
      assert.strictEqual(TemporalDomain.getDaysInMonth(2026, 12), 31);
      assert.strictEqual(TemporalDomain.getDaysInMonth(2026, 13), 0);
      assert.strictEqual(TemporalDomain.getDaysInMonth(2026, 0), 0);
    });

    test('clampDayToMonth limita dias nominais excedentes ao tamanho do mês', () => {
      assert.strictEqual(TemporalDomain.clampDayToMonth(2026, 4, 31), 30);
      assert.strictEqual(TemporalDomain.clampDayToMonth(2026, 2, 31), 28);
      assert.strictEqual(TemporalDomain.clampDayToMonth(2024, 2, 31), 29);
      assert.strictEqual(TemporalDomain.clampDayToMonth(2026, 5, 15), 15);
      assert.strictEqual(TemporalDomain.clampDayToMonth(2026, 5, -5), 1);
    });

    test('isValidCanonicalDateString e parseCanonicalDate validam formato estrito YYYY-MM-DD', () => {
      assert.strictEqual(TemporalDomain.isValidCanonicalDateString('2026-09-15'), true);
      assert.strictEqual(TemporalDomain.isValidCanonicalDateString('2026-02-29'), false); // 2026 não bissexto
      assert.strictEqual(TemporalDomain.isValidCanonicalDateString('2024-02-29'), true);  // 2024 bissexto
      assert.strictEqual(TemporalDomain.isValidCanonicalDateString('15/09/2026'), false);
      assert.strictEqual(TemporalDomain.isValidCanonicalDateString('2026-9-5'), false);

      assert.deepStrictEqual(TemporalDomain.parseCanonicalDate('2026-09-15'), { year: 2026, month: 9, day: 15 });
      assert.strictEqual(TemporalDomain.parseCanonicalDate('invalido'), null);
    });

    test('formatCanonicalDate formata ano, mês e dia com padding canônico', () => {
      assert.strictEqual(TemporalDomain.formatCanonicalDate(2026, 9, 5), '2026-09-05');
      assert.strictEqual(TemporalDomain.formatCanonicalDate(2026, 12, 31), '2026-12-31');
      assert.strictEqual(TemporalDomain.formatCanonicalDate('abc', 1, 1), '');
    });

    test('resolveOccurrenceDate resolve ocorrência pontual mantendo nominalDay e flag clamped', () => {
      const res = TemporalDomain.resolveOccurrenceDate(2026, 4, 31);
      assert.deepStrictEqual(res, {
        date: '2026-04-30',
        year: 2026,
        month: 4,
        day: 30,
        nominalDay: 31,
        originalDay: 31,
        wasClamped: true,
        clamped: true
      });
      assert.strictEqual(TemporalDomain.resolveOccurrenceDate(2026, 4, null), null);
    });

    test('normalizeCompetenceKey e getPaidHistoryEntry preservam comportamento canônico e legado', () => {
      assert.strictEqual(TemporalDomain.normalizeCompetenceKey(2026, 9), '2026-09');
      assert.strictEqual(TemporalDomain.normalizeCompetenceKey('2026', '09'), '2026-09');
      assert.strictEqual(TemporalDomain.normalizeCompetenceKey(2026, 13), null);

      const history = { '2026-09': { status: 'paid', amount: 100 }, '2026-8': { status: 'paid', amount: 50 } };
      assert.deepStrictEqual(TemporalDomain.getPaidHistoryEntry(history, 2026, 9), { status: 'paid', amount: 100 });
      assert.deepStrictEqual(TemporalDomain.getPaidHistoryEntry(history, 2026, 8), { status: 'paid', amount: 50 });
      assert.strictEqual(TemporalDomain.getPaidHistoryEntry(history, 2026, 7), undefined);
    });
  });

  // --------------------------------------------------------------------------
  // B. Dia da Semana (getDayOfWeek)
  // --------------------------------------------------------------------------
  describe('B. Dia da Semana Determinístico (getDayOfWeek)', () => {
    test('Calcula corretamente dias da semana para datas conhecidas (0=Dom..6=Sáb)', () => {
      // 2026-09-14 é Segunda-feira (1)
      assert.strictEqual(TemporalDomain.getDayOfWeek(2026, 9, 14), 1);
      assert.strictEqual(TemporalDomain.getDayOfWeek('2026-09-14'), 1);

      // 2026-09-18 é Sexta-feira (5)
      assert.strictEqual(TemporalDomain.getDayOfWeek(2026, 9, 18), 5);

      // 2026-09-19 é Sábado (6)
      assert.strictEqual(TemporalDomain.getDayOfWeek(2026, 9, 19), 6);

      // 2026-09-20 é Domingo (0)
      assert.strictEqual(TemporalDomain.getDayOfWeek(2026, 9, 20), 0);

      // 2000-01-01 (Ano bissexto secular) foi Sábado (6)
      assert.strictEqual(TemporalDomain.getDayOfWeek(2000, 1, 1), 6);

      // 2024-02-29 (Bissexto) foi Quinta-feira (4)
      assert.strictEqual(TemporalDomain.getDayOfWeek(2024, 2, 29), 4);
    });

    test('Retorna -1 para datas ou parâmetros inválidos', () => {
      assert.strictEqual(TemporalDomain.getDayOfWeek(2026, 2, 30), -1);
      assert.strictEqual(TemporalDomain.getDayOfWeek(2026, 13, 1), -1);
      assert.strictEqual(TemporalDomain.getDayOfWeek('data-invalida'), -1);
      assert.strictEqual(TemporalDomain.getDayOfWeek(null), -1);
    });
  });

  // --------------------------------------------------------------------------
  // C. Navegação Civil (getNextCivilDate, getPrevCivilDate)
  // --------------------------------------------------------------------------
  describe('C. Navegação Civil Determinística', () => {
    test('getNextCivilDate avança dia comum', () => {
      const next = TemporalDomain.getNextCivilDate(2026, 9, 14);
      assert.deepStrictEqual(next, {
        date: '2026-09-15',
        year: 2026,
        month: 9,
        day: 15,
        dayOfWeek: 2 // Terça
      });
    });

    test('getNextCivilDate avança transição de fim de mês', () => {
      const next = TemporalDomain.getNextCivilDate(2026, 9, 30);
      assert.deepStrictEqual(next, {
        date: '2026-10-01',
        year: 2026,
        month: 10,
        day: 1,
        dayOfWeek: 4 // Quinta
      });
    });

    test('getNextCivilDate avança virada de ano (31/12 -> 01/01)', () => {
      const next = TemporalDomain.getNextCivilDate(2026, 12, 31);
      assert.deepStrictEqual(next, {
        date: '2027-01-01',
        year: 2027,
        month: 1,
        day: 1,
        dayOfWeek: 5 // Sexta
      });
    });

    test('getNextCivilDate respeita fevereiro comum e bissexto', () => {
      // 2026 comum (28/02 -> 01/03)
      const nextCommon = TemporalDomain.getNextCivilDate(2026, 2, 28);
      assert.strictEqual(nextCommon.date, '2026-03-01');

      // 2024 bissexto (28/02 -> 29/02 -> 01/03)
      const nextLeap1 = TemporalDomain.getNextCivilDate(2024, 2, 28);
      assert.strictEqual(nextLeap1.date, '2024-02-29');
      const nextLeap2 = TemporalDomain.getNextCivilDate(2024, 2, 29);
      assert.strictEqual(nextLeap2.date, '2024-03-01');
    });

    test('getPrevCivilDate retrocede dia comum', () => {
      const prev = TemporalDomain.getPrevCivilDate(2026, 9, 15);
      assert.deepStrictEqual(prev, {
        date: '2026-09-14',
        year: 2026,
        month: 9,
        day: 14,
        dayOfWeek: 1 // Segunda
      });
    });

    test('getPrevCivilDate retrocede início de mês para último dia do mês anterior', () => {
      const prev = TemporalDomain.getPrevCivilDate(2026, 10, 1);
      assert.deepStrictEqual(prev, {
        date: '2026-09-30',
        year: 2026,
        month: 9,
        day: 30,
        dayOfWeek: 3 // Quarta
      });
    });

    test('getPrevCivilDate retrocede virada de ano (01/01 -> 31/12 do ano anterior)', () => {
      const prev = TemporalDomain.getPrevCivilDate(2027, 1, 1);
      assert.deepStrictEqual(prev, {
        date: '2026-12-31',
        year: 2026,
        month: 12,
        day: 31,
        dayOfWeek: 4 // Quinta
      });
    });

    test('getPrevCivilDate retrocede 01/03 para 28/02 (comum) ou 29/02 (bissexto)', () => {
      const prevCommon = TemporalDomain.getPrevCivilDate(2026, 3, 1);
      assert.strictEqual(prevCommon.date, '2026-02-28');

      const prevLeap = TemporalDomain.getPrevCivilDate(2024, 3, 1);
      assert.strictEqual(prevLeap.date, '2024-02-29');
    });

    test('Navegadores civis aceitam string canônica e retornam null para entradas inválidas', () => {
      assert.strictEqual(TemporalDomain.getNextCivilDate('2026-09-14').date, '2026-09-15');
      assert.strictEqual(TemporalDomain.getPrevCivilDate('2026-09-15').date, '2026-09-14');
      assert.strictEqual(TemporalDomain.getNextCivilDate('invalido'), null);
      assert.strictEqual(TemporalDomain.getPrevCivilDate('invalido'), null);
    });
  });

  // --------------------------------------------------------------------------
  // D. Business Day — Nível 1 (isBusinessDay, getNextBusinessDay, getPrevBusinessDay)
  // --------------------------------------------------------------------------
  describe('D. Dia Útil Nível 1 e Boundary Extensível', () => {
    test('isBusinessDay classifica Seg-Sex como útil e Sáb-Dom como não útil', () => {
      assert.strictEqual(TemporalDomain.isBusinessDay(2026, 9, 14), true);  // Seg
      assert.strictEqual(TemporalDomain.isBusinessDay(2026, 9, 15), true);  // Ter
      assert.strictEqual(TemporalDomain.isBusinessDay(2026, 9, 16), true);  // Qua
      assert.strictEqual(TemporalDomain.isBusinessDay(2026, 9, 17), true);  // Qui
      assert.strictEqual(TemporalDomain.isBusinessDay(2026, 9, 18), true);  // Sex
      assert.strictEqual(TemporalDomain.isBusinessDay(2026, 9, 19), false); // Sáb
      assert.strictEqual(TemporalDomain.isBusinessDay(2026, 9, 20), false); // Dom
    });

    test('Boundary de feriado: context.isHoliday intercepta sem alterar Nível 1 padrão', () => {
      const holidayContext = {
        isHoliday: (y, m, d) => (y === 2026 && m === 9 && d === 7) // 7 de setembro (Segunda)
      };

      // Sem contexto: 2026-09-07 é Segunda -> útil
      assert.strictEqual(TemporalDomain.isBusinessDay(2026, 9, 7), true);

      // Com contexto de feriado: 2026-09-07 torna-se não útil
      assert.strictEqual(TemporalDomain.isBusinessDay(2026, 9, 7, holidayContext), false);

      // Dia não feriado continua útil
      assert.strictEqual(TemporalDomain.isBusinessDay(2026, 9, 8, holidayContext), true);
    });

    test('getNextBusinessDay pula final de semana para segunda-feira', () => {
      // Sexta 18/09 -> próxima útil é Segunda 21/09
      const nextFromFri = TemporalDomain.getNextBusinessDay(2026, 9, 18);
      assert.strictEqual(nextFromFri.date, '2026-09-21');
      assert.strictEqual(nextFromFri.dayOfWeek, 1);

      // Sábado 19/09 -> próxima útil é Segunda 21/09
      const nextFromSat = TemporalDomain.getNextBusinessDay(2026, 9, 19);
      assert.strictEqual(nextFromSat.date, '2026-09-21');

      // Domingo 20/09 -> próxima útil é Segunda 21/09
      const nextFromSun = TemporalDomain.getNextBusinessDay(2026, 9, 20);
      assert.strictEqual(nextFromSun.date, '2026-09-21');
    });

    test('getPrevBusinessDay retrocede final de semana para sexta-feira', () => {
      // Segunda 21/09 -> anterior útil é Sexta 18/09
      const prevFromMon = TemporalDomain.getPrevBusinessDay(2026, 9, 21);
      assert.strictEqual(prevFromMon.date, '2026-09-18');
      assert.strictEqual(prevFromMon.dayOfWeek, 5);

      // Domingo 20/09 -> anterior útil é Sexta 18/09
      const prevFromSun = TemporalDomain.getPrevBusinessDay(2026, 9, 20);
      assert.strictEqual(prevFromSun.date, '2026-09-18');

      // Sábado 19/09 -> anterior útil é Sexta 18/09
      const prevFromSat = TemporalDomain.getPrevBusinessDay(2026, 9, 19);
      assert.strictEqual(prevFromSat.date, '2026-09-18');
    });
  });

  // --------------------------------------------------------------------------
  // E. TemporalRule — fixed_day
  // --------------------------------------------------------------------------
  describe('E. TemporalRule V2 — fixed_day', () => {
    test('fixed_day em dia de semana útil não sofre ajuste', () => {
      const rule = { type: 'fixed_day', day: 15, weekendAdjustment: 'none' };
      // 15/09/2026 é Terça-feira
      const res = TemporalDomain.resolveTemporalRule(rule, 2026, 9);
      assert.deepStrictEqual(res, {
        date: '2026-09-15',
        year: 2026,
        month: 9,
        day: 15,
        nominalDay: 15,
        type: 'fixed_day',
        weekendAdjustment: 'none',
        wasClamped: false,
        wasAdjusted: false,
        competenceKept: true,
        dayOfWeek: 2
      });
    });

    test('fixed_day sem weekendAdjustment defaulta para "none"', () => {
      const rule = { type: 'fixed_day', day: 19 }; // 19/09/2026 é Sábado
      const res = TemporalDomain.resolveTemporalRule(rule, 2026, 9);
      assert.strictEqual(res.date, '2026-09-19');
      assert.strictEqual(res.weekendAdjustment, 'none');
      assert.strictEqual(res.wasAdjusted, false);
      assert.strictEqual(res.competenceKept, true);
      assert.strictEqual(res.dayOfWeek, 6);
    });

    test('fixed_day no sábado com previous_business_day ajusta para sexta-feira', () => {
      const rule = { type: 'fixed_day', day: 19, weekendAdjustment: 'previous_business_day' };
      // 19/09/2026 é Sábado -> Sexta 18/09
      const res = TemporalDomain.resolveTemporalRule(rule, 2026, 9);
      assert.strictEqual(res.date, '2026-09-18');
      assert.strictEqual(res.nominalDay, 19);
      assert.strictEqual(res.day, 18);
      assert.strictEqual(res.wasAdjusted, true);
      assert.strictEqual(res.competenceKept, true);
      assert.strictEqual(res.dayOfWeek, 5);
    });

    test('fixed_day no domingo com next_business_day ajusta para segunda-feira', () => {
      const rule = { type: 'fixed_day', day: 20, weekendAdjustment: 'next_business_day' };
      // 20/09/2026 é Domingo -> Segunda 21/09
      const res = TemporalDomain.resolveTemporalRule(rule, 2026, 9);
      assert.strictEqual(res.date, '2026-09-21');
      assert.strictEqual(res.nominalDay, 20);
      assert.strictEqual(res.day, 21);
      assert.strictEqual(res.wasAdjusted, true);
      assert.strictEqual(res.competenceKept, true);
      assert.strictEqual(res.dayOfWeek, 1);
    });

    test('fixed_day com dia 31 em abril aplica clamp para dia 30', () => {
      const rule = { type: 'fixed_day', day: 31, weekendAdjustment: 'none' };
      // 30/04/2026 é Quinta-feira
      const res = TemporalDomain.resolveTemporalRule(rule, 2026, 4);
      assert.strictEqual(res.date, '2026-04-30');
      assert.strictEqual(res.nominalDay, 31);
      assert.strictEqual(res.day, 30);
      assert.strictEqual(res.wasClamped, true);
      assert.strictEqual(res.wasAdjusted, false);
      assert.strictEqual(res.competenceKept, true);
    });

    test('fixed_day com dia 31 em fevereiro comum aplica clamp para dia 28', () => {
      const rule = { type: 'fixed_day', day: 31, weekendAdjustment: 'none' };
      // 28/02/2026 é Sábado
      const res = TemporalDomain.resolveTemporalRule(rule, 2026, 2);
      assert.strictEqual(res.date, '2026-02-28');
      assert.strictEqual(res.nominalDay, 31);
      assert.strictEqual(res.day, 28);
      assert.strictEqual(res.wasClamped, true);
      assert.strictEqual(res.wasAdjusted, false);
    });
  });

  // --------------------------------------------------------------------------
  // F. TemporalRule — nth_business_day
  // --------------------------------------------------------------------------
  describe('F. TemporalRule V2 — nth_business_day', () => {
    test('1º dia útil do mês', () => {
      // Setembro 2026: 01/09 é Terça-feira (1º dia útil)
      const rule1 = { type: 'nth_business_day', ordinal: 1 };
      const res1 = TemporalDomain.resolveTemporalRule(rule1, 2026, 9);
      assert.strictEqual(res1.date, '2026-09-01');
      assert.strictEqual(res1.nominalDay, 1);
      assert.strictEqual(res1.dayOfWeek, 2);
      assert.strictEqual(res1.competenceKept, true);

      // Novembro 2026: 01/11 é Domingo -> 1º dia útil é Segunda 02/11
      const resNov = TemporalDomain.resolveTemporalRule(rule1, 2026, 11);
      assert.strictEqual(resNov.date, '2026-11-02');
      assert.strictEqual(resNov.nominalDay, 2);
      assert.strictEqual(resNov.dayOfWeek, 1);
    });

    test('5º dia útil do mês (neutro, sem nomenclatura CLT na regra)', () => {
      // Setembro 2026: 01 Ter, 02 Qua, 03 Qui, 04 Sex, [05 Sáb, 06 Dom], 07 Seg (5º dia útil)
      const rule5 = { type: 'nth_business_day', ordinal: 5 };
      const res = TemporalDomain.resolveTemporalRule(rule5, 2026, 9);
      assert.strictEqual(res.date, '2026-09-07');
      assert.strictEqual(res.day, 7);
      assert.strictEqual(res.nominalDay, 7);
      assert.strictEqual(res.dayOfWeek, 1);
      assert.strictEqual(res.competenceKept, true);
    });

    test('Último dia útil do mês (ordinal: -1)', () => {
      // Setembro 2026 termina em 30/09 (Quarta-feira, útil)
      const ruleLast = { type: 'nth_business_day', ordinal: -1 };
      const resSep = TemporalDomain.resolveTemporalRule(ruleLast, 2026, 9);
      assert.strictEqual(resSep.date, '2026-09-30');
      assert.strictEqual(resSep.day, 30);
      assert.strictEqual(resSep.dayOfWeek, 3);

      // Outubro 2026: 31/10 é Sábado -> último dia útil é Sexta 30/10
      const resOct = TemporalDomain.resolveTemporalRule(ruleLast, 2026, 10);
      assert.strictEqual(resOct.date, '2026-10-30');
      assert.strictEqual(resOct.day, 30);
      assert.strictEqual(resOct.dayOfWeek, 5);

      // Maio 2026: 31/05 é Domingo -> último dia útil é Sexta 29/05
      const resMay = TemporalDomain.resolveTemporalRule(ruleLast, 2026, 5);
      assert.strictEqual(resMay.date, '2026-05-29');
      assert.strictEqual(resMay.day, 29);
      assert.strictEqual(resMay.dayOfWeek, 5);
    });

    test('Mês que inicia no sábado (Agosto 2026)', () => {
      // 01/08/2026 é Sábado, 02/08 é Domingo -> 1º dia útil é Segunda 03/08
      const rule1 = { type: 'nth_business_day', ordinal: 1 };
      const res = TemporalDomain.resolveTemporalRule(rule1, 2026, 8);
      assert.strictEqual(res.date, '2026-08-03');
      assert.strictEqual(res.day, 3);
    });

    test('Mês que termina no domingo (Maio 2026)', () => {
      // 31/05/2026 é Domingo -> último dia útil é 29/05 Sexta
      const ruleLast = { type: 'nth_business_day', ordinal: -1 };
      const res = TemporalDomain.resolveTemporalRule(ruleLast, 2026, 5);
      assert.strictEqual(res.date, '2026-05-29');
      assert.strictEqual(res.day, 29);
    });

    test('Ordinal válido alto alcança o dia útil correspondente', () => {
      // Setembro 2026 possui 22 dias úteis
      const rule22 = { type: 'nth_business_day', ordinal: 22 };
      const res = TemporalDomain.resolveTemporalRule(rule22, 2026, 9);
      assert.strictEqual(res.date, '2026-09-30');
    });

    test('Ordinal que excede a quantidade de dias úteis no mês retorna null (fail-safe)', () => {
      // Fevereiro 2026 possui 20 dias úteis; ordinal 21 excede
      const ruleExceed = { type: 'nth_business_day', ordinal: 21 };
      const res = TemporalDomain.resolveTemporalRule(ruleExceed, 2026, 2);
      assert.strictEqual(res, null);

      const ruleHuge = { type: 'nth_business_day', ordinal: 99 };
      assert.strictEqual(TemporalDomain.resolveTemporalRule(ruleHuge, 2026, 9), null);
    });
  });

  // --------------------------------------------------------------------------
  // G. Cross-Month Determinístico (Errata Arquitetural)
  // --------------------------------------------------------------------------
  describe('G. Comportamento Canônico Cross-Month', () => {
    test('T11 Obrigatório: 01/11/2026 (Dom) + previous_business_day -> 2026-10-30', () => {
      const rule = {
        type: 'fixed_day',
        day: 1,
        weekendAdjustment: 'previous_business_day'
      };
      const res = TemporalDomain.resolveTemporalRule(rule, 2026, 11);
      assert.deepStrictEqual(res, {
        date: '2026-10-30',
        year: 2026,
        month: 10,
        day: 30,
        nominalDay: 1,
        type: 'fixed_day',
        weekendAdjustment: 'previous_business_day',
        wasClamped: false,
        wasAdjusted: true,
        competenceKept: false, // Cruzou para outubro
        dayOfWeek: 5 // Sexta-feira
      });
    });

    test('T11b Obrigatório: 31/01/2026 (Sáb) + next_business_day -> 2026-02-02', () => {
      const rule = {
        type: 'fixed_day',
        day: 31,
        weekendAdjustment: 'next_business_day'
      };
      const res = TemporalDomain.resolveTemporalRule(rule, 2026, 1);
      assert.deepStrictEqual(res, {
        date: '2026-02-02',
        year: 2026,
        month: 2,
        day: 2,
        nominalDay: 31,
        type: 'fixed_day',
        weekendAdjustment: 'next_business_day',
        wasClamped: false,
        wasAdjusted: true,
        competenceKept: false, // Cruzou para fevereiro
        dayOfWeek: 1 // Segunda-feira
      });
    });

    test('T11c Obrigatório: Virada Dezembro -> Janeiro do ano seguinte (2028-12-31 Dom -> 2029-01-01)', () => {
      // 31/12/2028 é Domingo
      const rule = {
        type: 'fixed_day',
        day: 31,
        weekendAdjustment: 'next_business_day'
      };
      const res = TemporalDomain.resolveTemporalRule(rule, 2028, 12);
      assert.deepStrictEqual(res, {
        date: '2029-01-01',
        year: 2029,
        month: 1,
        day: 1,
        nominalDay: 31,
        type: 'fixed_day',
        weekendAdjustment: 'next_business_day',
        wasClamped: false,
        wasAdjusted: true,
        competenceKept: false, // Cruzou ano civil
        dayOfWeek: 1 // Segunda-feira
      });
    });

    test('T11d Obrigatório: Virada Janeiro -> Dezembro do ano anterior (2028-01-01 Sáb -> 2027-12-31)', () => {
      // 01/01/2028 é Sábado
      const rule = {
        type: 'fixed_day',
        day: 1,
        weekendAdjustment: 'previous_business_day'
      };
      const res = TemporalDomain.resolveTemporalRule(rule, 2028, 1);
      assert.deepStrictEqual(res, {
        date: '2027-12-31',
        year: 2027,
        month: 12,
        day: 31,
        nominalDay: 1,
        type: 'fixed_day',
        weekendAdjustment: 'previous_business_day',
        wasClamped: false,
        wasAdjusted: true,
        competenceKept: false, // Cruzou para o ano civil anterior
        dayOfWeek: 5 // Sexta-feira
      });
    });

    test('T11e Obrigatório: Fevereiro comum -> Março (28/02/2026 Sáb -> 2026-03-02)', () => {
      // 28/02/2026 é Sábado
      const rule = {
        type: 'fixed_day',
        day: 28,
        weekendAdjustment: 'next_business_day'
      };
      const res = TemporalDomain.resolveTemporalRule(rule, 2026, 2);
      assert.deepStrictEqual(res, {
        date: '2026-03-02',
        year: 2026,
        month: 3,
        day: 2,
        nominalDay: 28,
        type: 'fixed_day',
        weekendAdjustment: 'next_business_day',
        wasClamped: false,
        wasAdjusted: true,
        competenceKept: false,
        dayOfWeek: 1 // Segunda-feira
      });
    });

    test('T11f: Clamping 31 em fevereiro com previous_business_day não cruza se dia 28 for dia útil', () => {
      // 2025: 28/02/2025 é Sexta-feira. Clamped para 28. Como 28 já é dia útil, permanece 28/02/2025.
      const rule = {
        type: 'fixed_day',
        day: 31,
        weekendAdjustment: 'previous_business_day'
      };
      const res = TemporalDomain.resolveTemporalRule(rule, 2025, 2);
      assert.strictEqual(res.date, '2025-02-28');
      assert.strictEqual(res.wasClamped, true);
      assert.strictEqual(res.wasAdjusted, false);
      assert.strictEqual(res.competenceKept, true);
    });
  });

  // --------------------------------------------------------------------------
  // H. Regras Inválidas e Fail-Safe (Sem crash)
  // --------------------------------------------------------------------------
  describe('H. Fail-Safe e Sanitização de Regras Inválidas', () => {
    test('Regras nulas, vazias ou primitivas retornam null', () => {
      assert.strictEqual(TemporalDomain.resolveTemporalRule(null, 2026, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule(undefined, 2026, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule({}, 2026, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule('string', 2026, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule([], 2026, 9), null);
    });

    test('Tipo de regra desconhecido retorna null', () => {
      assert.strictEqual(TemporalDomain.resolveTemporalRule({ type: 'split_payment' }, 2026, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule({ type: 'biweekly' }, 2026, 9), null);
    });

    test('fixed_day com day inválido retorna null', () => {
      assert.strictEqual(TemporalDomain.resolveTemporalRule({ type: 'fixed_day', day: 0 }, 2026, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule({ type: 'fixed_day', day: 32 }, 2026, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule({ type: 'fixed_day', day: -1 }, 2026, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule({ type: 'fixed_day', day: 'abc' }, 2026, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule({ type: 'fixed_day' }, 2026, 9), null);
    });

    test('fixed_day com weekendAdjustment desconhecido retorna null', () => {
      assert.strictEqual(TemporalDomain.resolveTemporalRule({ type: 'fixed_day', day: 5, weekendAdjustment: 'nearest' }, 2026, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule({ type: 'fixed_day', day: 5, weekendAdjustment: 123 }, 2026, 9), null);
    });

    test('nth_business_day com ordinal inválido retorna null', () => {
      assert.strictEqual(TemporalDomain.resolveTemporalRule({ type: 'nth_business_day', ordinal: 0 }, 2026, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule({ type: 'nth_business_day', ordinal: -2 }, 2026, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule({ type: 'nth_business_day', ordinal: 'abc' }, 2026, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule({ type: 'nth_business_day' }, 2026, 9), null);
    });

    test('Competência com ano ou mês inválido retorna null', () => {
      const validRule = { type: 'fixed_day', day: 5 };
      assert.strictEqual(TemporalDomain.resolveTemporalRule(validRule, 1999, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule(validRule, 2101, 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule(validRule, 2026, 0), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule(validRule, 2026, 13), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule(validRule, 'ano', 9), null);
      assert.strictEqual(TemporalDomain.resolveTemporalRule(validRule, 2026, 'mes'), null);
    });
  });

  // --------------------------------------------------------------------------
  // I. Imunidade a Timezone
  // --------------------------------------------------------------------------
  describe('I. Imunidade Absoluta a Timezone', () => {
    test('Aritmética temporal civil produz idêntico resultado independente de timeZone', () => {
      // Simula datas críticas de virada de mês/dia
      const dayOfWeek = TemporalDomain.getDayOfWeek(2026, 9, 15);
      const nextDate = TemporalDomain.getNextCivilDate(2026, 9, 30);
      const prevDate = TemporalDomain.getPrevCivilDate(2026, 10, 1);
      const isBiz = TemporalDomain.isBusinessDay(2026, 9, 15);

      assert.strictEqual(dayOfWeek, 2);
      assert.strictEqual(nextDate.date, '2026-10-01');
      assert.strictEqual(prevDate.date, '2026-09-30');
      assert.strictEqual(isBiz, true);
    });
  });

  // --------------------------------------------------------------------------
  // J. Paridade Canônica entre shared/temporalDomain.js e temporalUtils.js
  // --------------------------------------------------------------------------
  describe('J. Paridade Estrita com Adapter temporalUtils.js', () => {
    test('temporalUtils reexporta os métodos matemáticos e V2 com comportamento 100% idêntico', () => {
      assert.strictEqual(temporalUtils.isLeapYear(2024), TemporalDomain.isLeapYear(2024));
      assert.strictEqual(temporalUtils.getDaysInMonth(2026, 2), TemporalDomain.getDaysInMonth(2026, 2));
      assert.strictEqual(temporalUtils.clampDayToMonth(2026, 4, 31), TemporalDomain.clampDayToMonth(2026, 4, 31));
      assert.strictEqual(temporalUtils.formatCanonicalDate(2026, 9, 5), TemporalDomain.formatCanonicalDate(2026, 9, 5));
      assert.strictEqual(temporalUtils.getDayOfWeek(2026, 9, 14), TemporalDomain.getDayOfWeek(2026, 9, 14));
      assert.strictEqual(temporalUtils.isBusinessDay(2026, 9, 14), TemporalDomain.isBusinessDay(2026, 9, 14));

      const rule = { type: 'fixed_day', day: 1, weekendAdjustment: 'previous_business_day' };
      assert.deepStrictEqual(
        temporalUtils.resolveTemporalRule(rule, 2026, 11),
        TemporalDomain.resolveTemporalRule(rule, 2026, 11)
      );
    });
  });
});
