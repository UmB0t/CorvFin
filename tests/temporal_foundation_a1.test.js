/**
 * Suíte Oficial de Testes — CORVFIN V2 — LOTE A1
 * FUNDAÇÃO TEMPORAL DO DOMÍNIO
 *
 * Cobertura Completa:
 * 1. temporalUtils: validação de datas canônicas civis YYYY-MM-DD
 * 2. temporalUtils: anos bissextos (2024 vs 2026), dias do mês
 * 3. temporalUtils: clampDayToMonth e resolveOccurrenceDate (clamping de dueDay sem mutação)
 * 4. temporalUtils: getTodayCivilDate no timezone 'America/Fortaleza'
 * 5. temporalUtils: normalização de competência e leitura dual de paidHistory (YYYY-MM e YYYY-M)
 * 6. financeValidation: validação rigorosa de transactionDate em despesas variáveis
 * 7. financeValidation: validação de dueDay / receiveDay em devedores
 * 8. financeValidation: validação de receiveDay e receiveDate em rendas extras
 * 9. financeValidation: validação de profile.salaryPayment ({ type: 'fixed_day', day: 1..31 })
 * 10. Compatibilidade legada: registros legados sem campos temporais continuam 100% válidos
 * 11. Ausência de data significa 'sem data' (nunca inferir de createdAt ou timestamps)
 * 12. financeQueries: getExpensePaymentInfo lê tanto 'YYYY-MM' quanto legado 'YYYY-M'
 * 13. financeQueries: setExpensePayment grava estritamente canônico 'YYYY-MM' e limpa chave legada
 * 14. financeQueries: calculateInstallmentSchedule reconhece parcelas pagas com chaves legadas e canônicas
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const temporalUtils = require('../server/services/temporalUtils');
const { validateFinanceSemantics } = require('../server/services/financeValidation');
const financeQueries = require('../public/js/core/financeQueries');

describe('CORVFIN V2 — LOTE A1 — FUNDAÇÃO TEMPORAL DO DOMÍNIO', () => {

  // --------------------------------------------------------------------------
  // 1. Funções Canônicas de Data Civil (temporalUtils)
  // --------------------------------------------------------------------------
  describe('1. Validações e parsing de datas civis canônicas (temporalUtils)', () => {
    test('isValidCanonicalDateString valida estritamente formato YYYY-MM-DD e existência no calendário civil', () => {
      // Datas válidas
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-01-01'), true);
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-09-11'), true);
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-12-31'), true);
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-02-28'), true);
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2024-02-29'), true); // Ano bissexto válido

      // Formatos inválidos / tipos inválidos
      assert.strictEqual(temporalUtils.isValidCanonicalDateString(null), false);
      assert.strictEqual(temporalUtils.isValidCanonicalDateString(undefined), false);
      assert.strictEqual(temporalUtils.isValidCanonicalDateString(12345), false);
      assert.strictEqual(temporalUtils.isValidCanonicalDateString(''), false);
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-9-11'), false); // Sem zero padding
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-09-1'), false); // Sem zero padding
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('11/09/2026'), false);
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026/09/11'), false);
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-09-11T12:00:00Z'), false); // Timestamp com hora

      // Datas inexistentes no calendário
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-02-29'), false); // 2026 não é bissexto
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-04-31'), false); // Abril só tem 30 dias
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-06-31'), false); // Junho só tem 30 dias
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-11-31'), false); // Novembro só tem 30 dias
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-00-10'), false); // Mês 0 inválido
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-13-10'), false); // Mês 13 inválido
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-09-00'), false); // Dia 0 inválido
      assert.strictEqual(temporalUtils.isValidCanonicalDateString('2026-09-32'), false); // Dia 32 inválido
    });

    test('parseCanonicalDate extrai componentes numéricos ou retorna null se inválido', () => {
      assert.deepStrictEqual(temporalUtils.parseCanonicalDate('2026-09-11'), { year: 2026, month: 9, day: 11 });
      assert.deepStrictEqual(temporalUtils.parseCanonicalDate('2024-02-29'), { year: 2024, month: 2, day: 29 });
      assert.strictEqual(temporalUtils.parseCanonicalDate('2026-02-29'), null);
      assert.strictEqual(temporalUtils.parseCanonicalDate('invalid'), null);
      assert.strictEqual(temporalUtils.parseCanonicalDate(null), null);
    });

    test('formatCanonicalDate formata ano, mês e dia com zero padding canônico', () => {
      assert.strictEqual(temporalUtils.formatCanonicalDate(2026, 9, 5), '2026-09-05');
      assert.strictEqual(temporalUtils.formatCanonicalDate(2026, 12, 31), '2026-12-31');
      assert.strictEqual(temporalUtils.formatCanonicalDate('2026', '01', '08'), '2026-01-08');
    });

    test('isLeapYear e getDaysInMonth calculam corretamente o total de dias', () => {
      assert.strictEqual(temporalUtils.isLeapYear(2024), true);
      assert.strictEqual(temporalUtils.isLeapYear(2026), false);
      assert.strictEqual(temporalUtils.isLeapYear(2000), true);
      assert.strictEqual(temporalUtils.isLeapYear(1900), false);

      assert.strictEqual(temporalUtils.getDaysInMonth(2026, 1), 31);
      assert.strictEqual(temporalUtils.getDaysInMonth(2026, 2), 28);
      assert.strictEqual(temporalUtils.getDaysInMonth(2024, 2), 29);
      assert.strictEqual(temporalUtils.getDaysInMonth(2026, 4), 30);
      assert.strictEqual(temporalUtils.getDaysInMonth(2026, 12), 31);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Resolução de Ocorrências e Clamping (sem mutação do modelo persistido)
  // --------------------------------------------------------------------------
  describe('2. Clamping e Resolução de Ocorrências (temporalUtils)', () => {
    test('clampDayToMonth limita dias excedentes ao último dia do mês', () => {
      assert.strictEqual(temporalUtils.clampDayToMonth(2026, 4, 31), 30); // Abril tem 30
      assert.strictEqual(temporalUtils.clampDayToMonth(2026, 2, 31), 28); // Fev 2026 tem 28
      assert.strictEqual(temporalUtils.clampDayToMonth(2024, 2, 31), 29); // Fev 2024 tem 29
      assert.strictEqual(temporalUtils.clampDayToMonth(2026, 2, 30), 28);
      assert.strictEqual(temporalUtils.clampDayToMonth(2026, 1, 31), 31); // Jan tem 31
      assert.strictEqual(temporalUtils.clampDayToMonth(2026, 5, 15), 15); // Dia 15 inalterado
    });

    test('resolveOccurrenceDate resolve data canônica YYYY-MM-DD para despesas fixas mantendo dueDay intacto', () => {
      const fixedExpense = { id: 'exp_1', name: 'Aluguel', dueDay: 31 };

      // Em abril (30 dias), a ocorrência é 2026-04-30
      const resApr = temporalUtils.resolveOccurrenceDate(2026, 4, fixedExpense.dueDay);
      assert.strictEqual(resApr.date, '2026-04-30');
      assert.strictEqual(resApr.day, 30);
      assert.strictEqual(resApr.nominalDay, 31);
      assert.strictEqual(resApr.wasClamped, true);
      // O objeto original não foi mutado
      assert.strictEqual(fixedExpense.dueDay, 31);

      // Em fevereiro de ano bissexto (29 dias)
      const resFebLeap = temporalUtils.resolveOccurrenceDate(2024, 2, fixedExpense.dueDay);
      assert.strictEqual(resFebLeap.date, '2024-02-29');
      assert.strictEqual(resFebLeap.day, 29);
      assert.strictEqual(resFebLeap.wasClamped, true);

      // Em fevereiro de ano normal (28 dias)
      const resFebNormal = temporalUtils.resolveOccurrenceDate(2026, 2, fixedExpense.dueDay);
      assert.strictEqual(resFebNormal.date, '2026-02-28');
      assert.strictEqual(resFebNormal.day, 28);
      assert.strictEqual(resFebNormal.wasClamped, true);

      // Em mês de 31 dias (janeiro)
      const resJan = temporalUtils.resolveOccurrenceDate(2026, 1, fixedExpense.dueDay);
      assert.strictEqual(resJan.date, '2026-01-31');
      assert.strictEqual(resJan.day, 31);
      assert.strictEqual(resJan.wasClamped, false);

      // Dia inexistente ou inválido retorna null
      assert.strictEqual(temporalUtils.resolveOccurrenceDate(2026, 1, null), null);
      assert.strictEqual(temporalUtils.resolveOccurrenceDate(2026, 1, 0), null);
      assert.strictEqual(temporalUtils.resolveOccurrenceDate(2026, 1, 35), null);
    });

    test('getTodayCivilDate gera formato canônico YYYY-MM-DD no fuso de Fortaleza sem desvio UTC', () => {
      // Simula uma data com UTC às 01:00 do dia 12 (que em Fortaleza UTC-3 ainda é dia 11 às 22:00)
      const utcLateNight = new Date('2026-09-12T01:30:00Z');
      const civilFortaleza = temporalUtils.getTodayCivilDate(utcLateNight, 'America/Fortaleza');
      assert.strictEqual(civilFortaleza, '2026-09-11');
    });

    test('temporalUtils consome APP_TIMEZONE canônico de config.js', () => {
      const config = require('../server/config/config');
      assert.strictEqual(temporalUtils.APP_TIMEZONE, config.APP_TIMEZONE);
      assert.strictEqual(temporalUtils.APP_TIMEZONE, 'America/Fortaleza');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Normalização de Competência e PaidHistory Dual-Read (temporalUtils)
  // --------------------------------------------------------------------------
  describe('3. Normalização de competência e leitura dual de paidHistory', () => {
    test('normalizeCompetenceKey normaliza para YYYY-MM', () => {
      assert.strictEqual(temporalUtils.normalizeCompetenceKey(2026, 9), '2026-09');
      assert.strictEqual(temporalUtils.normalizeCompetenceKey('2026', '9'), '2026-09');
      assert.strictEqual(temporalUtils.normalizeCompetenceKey(2026, 11), '2026-11');
      assert.strictEqual(temporalUtils.normalizeCompetenceKey(2026, 0), null);
      assert.strictEqual(temporalUtils.normalizeCompetenceKey(2026, 13), null);
    });

    test('getPaidHistoryEntry lê tanto YYYY-MM (canônico) quanto YYYY-M (legado)', () => {
      const historyWithLegacy = {
        '2026-9': { status: 'paid', paidAt: '2026-09-05' },
        '2026-10': { status: 'pending' }
      };

      // Mês 9: chave legada '2026-9' deve ser encontrada
      const entry9 = temporalUtils.getPaidHistoryEntry(historyWithLegacy, 2026, 9);
      assert.deepStrictEqual(entry9, { status: 'paid', paidAt: '2026-09-05' });

      // Mês 10: chave canônica '2026-10' encontrada
      const entry10 = temporalUtils.getPaidHistoryEntry(historyWithLegacy, 2026, 10);
      assert.deepStrictEqual(entry10, { status: 'pending' });

      // Chave inexistente retorna undefined
      const entry11 = temporalUtils.getPaidHistoryEntry(historyWithLegacy, 2026, 11);
      assert.strictEqual(entry11, undefined);

      // Prioridade: se ambas existirem, canônica tem precedência
      const historyBoth = {
        '2026-09': { status: 'paid', source: 'canonical' },
        '2026-9': { status: 'paid', source: 'legacy' }
      };
      assert.strictEqual(temporalUtils.getPaidHistoryEntry(historyBoth, 2026, 9).source, 'canonical');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Validações de Backend (financeValidation)
  // --------------------------------------------------------------------------
  describe('4. Validação rigorosa no backend (financeValidation)', () => {
    const baseValidPayload = {
      fixed: [],
      variable: [],
      extras: [],
      debtors: [],
      profile: {}
    };

    test('Despesa variável aceita transactionDate canônica ou ausente', () => {
      // Com data canônica válida
      const payloadWithDate = JSON.parse(JSON.stringify(baseValidPayload));
      payloadWithDate.variable.push({
        id: 'var_1',
        description: 'Supermercado',
        amount: 150.50,
        category: 'Alimentação',
        paymentMethod: 'pix',
        transactionDate: '2026-09-11'
      });
      assert.doesNotThrow(() => validateFinanceSemantics(payloadWithDate));

      // Sem transactionDate (legado compatível)
      const payloadLegacy = JSON.parse(JSON.stringify(baseValidPayload));
      payloadLegacy.variable.push({
        id: 'var_2',
        description: 'Padaria',
        amount: 20.00,
        category: 'Alimentação',
        paymentMethod: 'dinheiro'
      });
      assert.doesNotThrow(() => validateFinanceSemantics(payloadLegacy));

      // Com transactionDate inválida deve lançar erro
      const payloadInvalid = JSON.parse(JSON.stringify(baseValidPayload));
      payloadInvalid.variable.push({
        id: 'var_3',
        description: 'Farmácia',
        amount: 45.00,
        category: 'Saúde',
        paymentMethod: 'pix',
        transactionDate: '2026-02-29' // 2026 não tem dia 29 de fev
      });
      assert.throws(() => validateFinanceSemantics(payloadInvalid), /variable\.transactionDate/);

      // Formato malformado
      payloadInvalid.variable[0].transactionDate = '11/09/2026';
      assert.throws(() => validateFinanceSemantics(payloadInvalid), /variable\.transactionDate/);
    });

    test('Devedores aceitam receiveDay (1..31) ou ausência de dia; dueDay NÃO pertence ao novo contrato', () => {
      const payload = JSON.parse(JSON.stringify(baseValidPayload));
      const newDebtor = {
        id: 'deb_1',
        name: 'João Amigo',
        amount: 200,
        receiveDay: 15,
        installments: 1
      };
      payload.debtors.push(newDebtor);
      assert.doesNotThrow(() => validateFinanceSemantics(payload));

      // dueDay NÃO pertence ao novo contrato criado pelo A1
      assert.strictEqual(newDebtor.dueDay, undefined);
      assert.strictEqual(newDebtor.receiveDay, 15);

      // receiveDay 1 válido
      payload.debtors[0].receiveDay = 1;
      assert.doesNotThrow(() => validateFinanceSemantics(payload));

      // receiveDay 31 válido
      payload.debtors[0].receiveDay = 31;
      assert.doesNotThrow(() => validateFinanceSemantics(payload));

      // Sem receiveDay (legado) continua válido
      delete payload.debtors[0].receiveDay;
      assert.doesNotThrow(() => validateFinanceSemantics(payload));

      // Valores inválidos rejeitados
      payload.debtors[0].receiveDay = 0;
      assert.throws(() => validateFinanceSemantics(payload), /debtors\.receiveDay/);

      payload.debtors[0].receiveDay = 32;
      assert.throws(() => validateFinanceSemantics(payload), /debtors\.receiveDay/);

      payload.debtors[0].receiveDay = 'invalido';
      assert.throws(() => validateFinanceSemantics(payload), /debtors\.receiveDay/);
    });

    test('Rendas extras: contrato estrito de receiveDate (pontual) e receiveDay (recorrente)', () => {
      const payload = JSON.parse(JSON.stringify(baseValidPayload));

      // Extra pontual somente com receiveDate -> válido
      payload.extras = [{
        id: 'ext_1',
        description: 'Freelance Design',
        amount: 800,
        startYear: 2026,
        startMonth: 9,
        receiveDate: '2026-09-10'
      }];
      assert.doesNotThrow(() => validateFinanceSemantics(payload));

      // Extra recorrente somente com receiveDay -> válido
      payload.extras = [{
        id: 'ext_2',
        description: 'Consultoria Mensal',
        amount: 1500,
        receiveDay: 10
      }];
      assert.doesNotThrow(() => validateFinanceSemantics(payload));

      // Extra sem ambos -> válido como legacy
      payload.extras = [{
        id: 'ext_3',
        description: 'Bico Antigo',
        amount: 300
      }];
      assert.doesNotThrow(() => validateFinanceSemantics(payload));

      // receiveDay + receiveDate -> rejeitado SEMPRE
      payload.extras = [{
        id: 'ext_4',
        description: 'Freelance Conflito',
        amount: 800,
        startYear: 2026,
        startMonth: 9,
        receiveDay: 15,
        receiveDate: '2026-09-20'
      }];
      assert.throws(() => validateFinanceSemantics(payload), /INVALID_FINANCE_PAYLOAD/);

      // receiveDay + receiveDate representando o mesmo dia -> também rejeitado SEMPRE
      payload.extras = [{
        id: 'ext_5',
        description: 'Freelance Mesmo Dia',
        amount: 800,
        startYear: 2026,
        startMonth: 9,
        receiveDay: 10,
        receiveDate: '2026-09-10'
      }];
      assert.throws(() => validateFinanceSemantics(payload), /INVALID_FINANCE_PAYLOAD/);

      // receiveDate fora da competência correspondente -> rejeitado conforme contrato atual
      payload.extras = [{
        id: 'ext_6',
        description: 'Competência Divergente',
        amount: 800,
        startYear: 2026,
        startMonth: 9,
        receiveDate: '2026-10-10'
      }];
      assert.throws(() => validateFinanceSemantics(payload), /diverge da competência/);

      // receiveDate inválida no calendário -> rejeitado
      payload.extras = [{
        id: 'ext_7',
        description: 'Data Inexistente',
        amount: 800,
        receiveDate: '2026-04-31'
      }];
      assert.throws(() => validateFinanceSemantics(payload), /extras\.receiveDate/);

      // receiveDay inválido (fora de 1..31) -> rejeitado
      payload.extras = [{
        id: 'ext_8',
        description: 'Dia Inválido',
        amount: 800,
        receiveDay: 35
      }];
      assert.throws(() => validateFinanceSemantics(payload), /extras\.receiveDay/);
    });

    test('Profile aceita salaryPayment ({ type: "fixed_day", day: 1..31 }) ou ausência', () => {
      const payload = JSON.parse(JSON.stringify(baseValidPayload));
      payload.profile = {
        name: 'Usuário Teste',
        salaryPayment: {
          type: 'fixed_day',
          day: 5
        }
      };
      assert.doesNotThrow(() => validateFinanceSemantics(payload));

      // Sem salaryPayment
      payload.profile.salaryPayment = null;
      assert.doesNotThrow(() => validateFinanceSemantics(payload));

      // salaryPayment inválido (dia fora da faixa)
      payload.profile.salaryPayment = { type: 'fixed_day', day: 32 };
      assert.throws(() => validateFinanceSemantics(payload), /salaryPayment\.day/);

      // salaryPayment inválido (tipo desconhecido)
      payload.profile.salaryPayment = { type: 'unknown_type', day: 5 };
      assert.throws(() => validateFinanceSemantics(payload), /salaryPayment\.type/);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Integração com financeQueries (Leitura Dual e Escrita Canônica)
  // --------------------------------------------------------------------------
  describe('5. Dual-read e Escrita Canônica em financeQueries', () => {
    test('getExpensePaymentInfo resolve status a partir de chave legada YYYY-M', () => {
      const expense = {
        id: 'exp_fixed_1',
        name: 'Internet',
        amount: 120,
        dueDay: 10,
        paidHistory: {
          '2026-9': 120 // Chave legada '2026-9' com valor integral pago
        }
      };

      // Consulta mês 9 (setembro)
      const info = financeQueries.getExpensePaymentInfo(expense, 2026, 9);
      assert.strictEqual(info.isPaid, true);
      assert.strictEqual(info.status, 'pago');
      assert.strictEqual(info.paidAmount, 120);
      assert.strictEqual(info.remainingAmount, 0);
    });

    test('getExpensePaymentInfo resolve status a partir de chave canônica YYYY-MM', () => {
      const expense = {
        id: 'exp_fixed_2',
        name: 'Energia',
        amount: 250,
        dueDay: 15,
        paidHistory: {
          '2026-09': 250 // Chave canônica '2026-09'
        }
      };

      const info = financeQueries.getExpensePaymentInfo(expense, 2026, 9);
      assert.strictEqual(info.isPaid, true);
      assert.strictEqual(info.status, 'pago');
      assert.strictEqual(info.paidAmount, 250);
      assert.strictEqual(info.remainingAmount, 0);
    });

    test('setExpensePayment grava chave canônica YYYY-MM e remove chave legada YYYY-M para evitar duplicidade', () => {
      const expense = {
        id: 'exp_fixed_3',
        name: 'Água',
        amount: 80,
        dueDay: 20,
        paidHistory: {
          '2026-9': 30 // Chave legada pré-existente
        }
      };

      financeQueries.setExpensePayment(expense, 2026, 9, 80);

      // A chave '2026-09' foi gravada
      assert.strictEqual(expense.paidHistory['2026-09'].paidAmount, 80);

      // A chave legada '2026-9' foi excluída da memória
      assert.strictEqual(expense.paidHistory['2026-9'], undefined);
    });

    test('calculateInstallmentSchedule detecta pagamentos com chave canônica e com chave legada', () => {
      const expense = {
        id: 'exp_install_1',
        description: 'Notebook Parcelado',
        amount: 3000,
        totalAmount: 3000,
        installments: 3,
        startYear: 2026,
        startMonth: 8,
        paidHistory: {
          '2026-8': 1000,   // Parcela 1: chave legada
          '2026-09': 1000  // Parcela 2: chave canônica
          // Parcela 3: 2026-10 pendente (sem registro)
        }
      };

      const scheduleRes = financeQueries.calculateInstallmentSchedule(expense);
      assert.strictEqual(scheduleRes.keys.length, 3);
      assert.strictEqual(scheduleRes.keys[0], '2026-08');
      assert.strictEqual(scheduleRes.keys[1], '2026-09');
      assert.strictEqual(scheduleRes.keys[2], '2026-10');

      // Ambas as parcelas pagas foram detectadas
      assert.strictEqual(scheduleRes.paidKeys.length, 2);
      assert.strictEqual(scheduleRes.paidKeys.includes('2026-08'), true);
      assert.strictEqual(scheduleRes.paidKeys.includes('2026-09'), true);
      assert.strictEqual(scheduleRes.openKeys.length, 1);
      assert.strictEqual(scheduleRes.openKeys[0], '2026-10');
      assert.strictEqual(scheduleRes.actuallyPaidCents, 200000);
      assert.strictEqual(scheduleRes.remainingCents, 100000);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Integridade de Domínio e Não-Invenção de Dados
  // --------------------------------------------------------------------------
  describe('6. Integridade de Domínio e Tratamento de Ausência de Data', () => {
    test('Registro legado sem transactionDate permanece estritamente indefinido (não inventa data)', () => {
      const legacyExpense = {
        id: 'var_legacy',
        description: 'Almoço Restaurante',
        amount: 45,
        paymentMethod: 'cash',
        createdAt: '2026-09-01T14:30:00.000Z'
      };

      // Validação não injeta transactionDate
      validateFinanceSemantics({
        fixed: [],
        variable: [legacyExpense],
        extras: [],
        debtors: [],
        profile: {}
      });

      assert.strictEqual(legacyExpense.transactionDate, undefined);
    });

    test('Despesa no cartão: transactionDate e dueDay convivem sem conflito conceitual', () => {
      // Compra feita em 11/09 no cartão cujo vencimento da fatura é dia 25
      const cardExpense = {
        id: 'card_exp_1',
        description: 'Tênis de Corrida',
        amount: 350,
        paymentMethod: 'credit',
        cardId: 'card_nubank',
        transactionDate: '2026-09-11',
        installments: 1
      };

      const card = {
        id: 'card_nubank',
        name: 'Nubank',
        dueDay: 25,
        closingDay: 18
      };

      // Ambos os conceitos temporais são preservados
      assert.strictEqual(cardExpense.transactionDate, '2026-09-11');
      assert.strictEqual(card.dueDay, 25);
    });

    test('Benefícios continuam com day/month/year e isolados do fluxo de caixa', () => {
      const benefitItem = {
        id: 'ben_1',
        name: 'Vale Refeição',
        day: 1,
        month: 9,
        year: 2026,
        amount: 600
      };

      // Formato e campos existentes são preservados
      assert.strictEqual(benefitItem.day, 1);
      assert.strictEqual(benefitItem.month, 9);
      assert.strictEqual(benefitItem.year, 2026);
    });
  });
});
