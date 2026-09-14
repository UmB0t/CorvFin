/**
 * CorvFin — HML Patch 1: Suíte de Testes de Consistência de Devedores
 *
 * Cobertura obrigatória:
 * - Caso A: Devedor contabilizável (countInTotal: true) -> entra em Entradas Previstas
 * - Caso B: Devedor não contabilizável (countInTotal: false) -> aparece na dívida, NÃO entra em Entradas Previstas nem altera Resultado Previsto
 * - Caso C: Combinação Salário 2000 + Extra 300 + Devedor Contabilizável 100 + Devedor Não Contabilizável 900 - Despesas 1500 = Entradas 2400, Resultado 900
 * - Caso D: Fail-safe para countInTotal ausente / undefined / string -> NÃO entra nas Entradas Previstas
 * - Paridade semântica estrita entre financeProjectionService (Dashboard / Calendar API) e financeQueries.monthTotals (Despesas)
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const FinanceDomain = require('../shared/financeDomain');
const { projectFinancialMonth } = require('../server/services/financeProjectionService');
const financeQueries = require('../public/js/core/financeQueries');

describe('CorvFin — HML Patch 1: Consistência de Devedores', () => {

  // ---------------------------------------------------------------------------
  // CASO A: Devedor contabilizável
  // ---------------------------------------------------------------------------
  test('Caso A — Devedor contabilizável (countInTotal: true) entra em Entradas Previstas', () => {
    const finances = {
      profile: { baseSalary: 0 },
      debtors: [
        {
          id: 'deb_a',
          debtorName: 'Devedor A',
          title: 'Empréstimo Amigo',
          amount: 100,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          receiveDay: 15,
          countInTotal: true
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);

    // Deve gerar evento datado
    assert.strictEqual(res.events.length, 1);
    assert.strictEqual(res.events[0].sourceType, 'debtor_receivable');
    assert.strictEqual(res.events[0].amount, 100);
    assert.strictEqual(res.events[0].countInTotal, true);

    // Entradas Previstas e Resultado Previsto devem refletir o valor
    assert.strictEqual(res.summary.inflow, 100, 'Entradas Previstas deve conter o devedor contabilizável');
    assert.strictEqual(res.summary.net, 100, 'Resultado Previsto deve refletir o valor do devedor contabilizável');
  });

  // ---------------------------------------------------------------------------
  // CASO B: Devedor não contabilizável
  // ---------------------------------------------------------------------------
  test('Caso B — Devedor não contabilizável (countInTotal: false) aparece no evento, mas NÃO altera Entradas Previstas nem Resultado', () => {
    const finances = {
      profile: { baseSalary: 0 },
      debtors: [
        {
          id: 'deb_b',
          debtorName: 'Devedor B',
          title: 'Cobrança Externa',
          amount: 900,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          receiveDay: 20,
          countInTotal: false
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);

    // O evento da dívida em si DEVE continuar existindo (informativo)
    assert.strictEqual(res.events.length, 1);
    assert.strictEqual(res.events[0].sourceType, 'debtor_receivable');
    assert.strictEqual(res.events[0].amount, 900);
    assert.strictEqual(res.events[0].countInTotal, false);

    // NÃO deve entrar em Entradas Previstas nem alterar Resultado Previsto
    assert.strictEqual(res.summary.inflow, 0, 'Entradas Previstas NÃO deve incluir devedor não contabilizável');
    assert.strictEqual(res.summary.outflow, 0);
    assert.strictEqual(res.summary.net, 0, 'Resultado Previsto NÃO deve ser alterado por devedor não contabilizável');
  });

  // ---------------------------------------------------------------------------
  // CASO C: Combinação especificada
  // ---------------------------------------------------------------------------
  test('Caso C — Combinação: Salário 2.000 + Extra 300 + Devedor Contabilizável 100 + Devedor Não Contabilizável 900 - Despesas 1.500', () => {
    const finances = {
      profile: {
        baseSalary: 2000,
        salaryPayment: { type: 'fixed_day', day: 5 }
      },
      fixed: [
        {
          id: 'fix_aluguel',
          name: 'Aluguel',
          amount: 1500,
          startYear: 2026,
          startMonth: 1,
          dueDay: 10
        }
      ],
      extras: [
        {
          id: 'ext_freela',
          title: 'Freela Design',
          amount: 300,
          year: 2026,
          month: 9,
          receiveDate: '2026-09-12'
        }
      ],
      debtors: [
        {
          id: 'deb_c1',
          debtorName: 'João (Contabilizável)',
          amount: 100,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          receiveDay: 18,
          countInTotal: true
        },
        {
          id: 'deb_c2',
          debtorName: 'Pedro (Não Contabilizável)',
          amount: 900,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          receiveDay: 22,
          countInTotal: false
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);

    // Verificação estrita de capacidade financeira
    // Salário (2000) + Extra (300) + Devedor Contabilizável (100) = 2400
    assert.strictEqual(res.summary.inflow, 2400, 'Entradas Previstas deve ser exatamente 2.400 (e NÃO 3.300)');
    assert.strictEqual(res.summary.outflow, 1500, 'Saídas Previstas deve ser exatamente 1.500');
    assert.strictEqual(res.summary.net, 900, 'Resultado Previsto deve ser exatamente 900 (e NÃO 1.800)');

    // Ambos os devedores devem continuar existindo nas ocorrências da competência
    const debtorEvents = res.events.filter(e => e.sourceType === 'debtor_receivable');
    assert.strictEqual(debtorEvents.length, 2, 'Ambos os devedores devem aparecer nas ocorrências');
    const totalReceivable = debtorEvents.reduce((s, e) => s + e.amount, 0);
    assert.strictEqual(totalReceivable, 1000, 'Cobranças totais a receber continuam sendo 1.000');
  });

  // ---------------------------------------------------------------------------
  // CASO D: Fail-safe para countInTotal ausente / undefined / string
  // ---------------------------------------------------------------------------
  test('Caso D — Fail-safe: countInTotal ausente, undefined, null ou "true" string NÃO entra em Entradas Previstas', () => {
    const finances = {
      profile: { baseSalary: 1000 },
      debtors: [
        {
          id: 'deb_missing',
          debtorName: 'Sem Propriedade',
          amount: 250,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          receiveDay: 10
          // countInTotal ausente
        },
        {
          id: 'deb_undef',
          debtorName: 'Undefined',
          amount: 350,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          receiveDay: 11,
          countInTotal: undefined
        },
        {
          id: 'deb_null',
          debtorName: 'Null',
          amount: 450,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          receiveDay: 12,
          countInTotal: null
        },
        {
          id: 'deb_str',
          debtorName: 'String True',
          amount: 550,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          receiveDay: 13,
          countInTotal: 'true' // string não deve ser aceita
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);

    // Apenas o salário deve compor as entradas previstas (nenhum dos 4 devedores com formatos anômalos)
    assert.strictEqual(res.summary.inflow, 1000, 'Entradas Previstas deve conter apenas o salário (1.000) e rejeitar devedores sem countInTotal === true');
    assert.strictEqual(res.summary.net, 1000);
  });

  // ---------------------------------------------------------------------------
  // PARIDADE ENTRE PROJEÇÃO (DASHBOARD/CALENDAR) E FINANCEQUERIES (DESPESAS)
  // ---------------------------------------------------------------------------
  test('Paridade: financeProjectionService e financeQueries.monthTotals convergem nas entradas', () => {
    const stateData = {
      year: 2026,
      month: 9,
      profile: { baseSalary: 2917.56 },
      extras: [
        { id: 'ext1', amount: 210.65, year: 2026, month: 9 }
      ],
      fixed: [
        {
          id: 'fix1',
          name: 'Despesas Gerais',
          amount: 3497.90,
          startYear: 2026,
          startMonth: 1,
          versions: [{ id: 'v1', year: 2026, month: 1, amount: 3497.90 }]
        }
      ],
      variable: [],
      debtors: [
        {
          id: 'deb_counted',
          amount: 108.00,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          countInTotal: true,
          receiveDay: 10
        },
        {
          id: 'deb_uncounted',
          amount: 887.78,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          countInTotal: false,
          receiveDay: 20
        }
      ]
    };

    // 1. Configuração do ambiente para financeQueries
    const oldGetState = global.getState;
    const oldActiveFixed = global.activeFixedForMonth;
    const oldActiveVar = global.activeVariableForMonth;
    const oldActiveExt = global.activeExtrasForMonth;
    const oldActiveDeb = global.activeDebtorsForMonth;
    const oldMk = global.mk;
    const oldYmKey = global.ymKey;

    global.mk = (y, m) => (Number(y) * 12 + Number(m));
    global.ymKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
    global.getState = () => stateData;
    global.activeFixedForMonth = () => stateData.fixed;
    global.activeVariableForMonth = () => stateData.variable;
    global.activeExtrasForMonth = () => stateData.extras;
    global.activeDebtorsForMonth = () => stateData.debtors;


    try {
      const despesasTotals = financeQueries.monthTotals(2026, 9);
      assert.strictEqual(despesasTotals.baseSalary, 2917.56);
      assert.strictEqual(despesasTotals.sumExt, 210.65);
      assert.strictEqual(despesasTotals.sumDebtorCounted, 108.00);
      assert.strictEqual(despesasTotals.totalIncome, 3236.21);
      assert.strictEqual(despesasTotals.totalExpenses, 3497.90);
      assert.strictEqual(Math.round(despesasTotals.balance * 100) / 100, -261.69);
      assert.strictEqual(despesasTotals.sumDeb, 995.78, 'sumDeb deve representar todas as cobranças (995,78)');

      // 2. Cálculo em Dashboard via motor de projeção canônico
      const projection = projectFinancialMonth(stateData, 2026, 9);
      assert.strictEqual(projection.summary.inflow, 3236.21, 'Dashboard Entradas Previstas deve convergir exatamente com Despesas totalIncome (3.236,21)');
      assert.strictEqual(projection.summary.outflow, 3497.90, 'Dashboard Saídas Previstas deve convergir com Despesas totalExpenses (3.497,90)');
      assert.strictEqual(projection.summary.net, -261.69, 'Dashboard Resultado Previsto deve convergir com Despesas balance (-261,69)');
    } finally {
      global.getState = oldGetState;
      global.activeFixedForMonth = oldActiveFixed;
      global.activeVariableForMonth = oldActiveVar;
      global.activeExtrasForMonth = oldActiveExt;
      global.activeDebtorsForMonth = oldActiveDeb;
      global.mk = oldMk;
      global.ymKey = oldYmKey;
    }
  });


  // ---------------------------------------------------------------------------
  // RECEBIDO X PREVISTO: Estado de quitação não impede projeção de contabilizável
  // ---------------------------------------------------------------------------
  test('Recebido x Previsto: Devedor pendente contabilizável entra na previsão', () => {
    const finances = {
      profile: { baseSalary: 1000 },
      debtors: [
        {
          id: 'deb_pend',
          amount: 200,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          countInTotal: true,
          status: 'pendente',
          paidHistory: {}
        },
        {
          id: 'deb_pago_nao_contabilizado',
          amount: 500,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          countInTotal: false,
          status: 'pago',
          paidHistory: { '2026-09': true }
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);

    // O devedor pendente contabilizável entra nas Entradas Previstas (1000 + 200 = 1200)
    // O devedor pago que está marcado como NÃO contabilizável continua fora (1200, não 1700)
    assert.strictEqual(res.summary.inflow, 1200);
    assert.strictEqual(res.summary.net, 1200);
  });

});
