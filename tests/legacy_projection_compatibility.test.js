/**
 * CorvFin — Suíte de Testes de Compatibilidade de Projeção Legada (Fase 2)
 *
 * Cobre estritamente os 14 requisitos de regressão da Projeção de Despesas Legadas
 * e as regras canônicas de resolução temporal determinística:
 * 1. Variável com startYear/startMonth continua igual.
 * 2. Variável legada com transactionDate válida pode resolver competência sem re-save.
 * 3. transactionDate não é substituída por dueDay.
 * 4. Registro sem evidência temporal NÃO assume janeiro.
 * 5. Registro sem evidência temporal NÃO assume o mês consultado.
 * 6. dueDay sozinho NÃO define purchase month.
 * 7. paidHistory não é tratado genericamente como start month quando ambíguo.
 * 8. Installment com dados canônicos não sofre regressão.
 * 9. Cash expense V2 não sofre regressão.
 * 10. Fixed expenses não sofrem regressão.
 * 11. Summary não sofre dupla contabilização.
 * 12. Salary permanece correto.
 * 13. Benefits permanece segregado (sem afetar summary bancário).
 * 14. Debtor countInTotal permanece correto.
 * 15. Incerteza explicitamente preservada: variáveis sem competência não vazam para undated em múltiplos meses.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');

const {
  projectFinancialMonth,
  projectVariableExpenses,
  resolveVariableStartCompetence
} = require('../server/services/financeProjectionService');

describe('CorvFin — Legacy Projection Compatibility (Fase 2)', () => {

  // 1. Variável com startYear/startMonth continua igual
  test('1. Variável com startYear/startMonth válidos projeta ocorrência idêntica', () => {
    const finances = {
      variable: [
        {
          id: 'var_canonical',
          name: 'Curso Online',
          amount: 150,
          startYear: 2026,
          startMonth: 5,
          endYear: 2026,
          endMonth: 5,
          installments: 1
        }
      ]
    };

    const resMay = projectFinancialMonth(finances, 2026, 5);
    assert.strictEqual(resMay.undated.length, 1);
    assert.strictEqual(resMay.undated[0].amount, 150);
    assert.strictEqual(resMay.undated[0].sourceId, 'var_canonical');

    const resJun = projectFinancialMonth(finances, 2026, 6);
    assert.strictEqual(resJun.events.length, 0);
    assert.strictEqual(resJun.undated.length, 0);
  });

  // 2. Variável legada com transactionDate válida pode resolver competência sem re-save
  test('2. Variável legada com transactionDate válida projeta na competência correta sem re-save', () => {
    const finances = {
      variable: [
        {
          id: 'var_legacy_tx',
          name: 'Jantar Restaurante',
          amount: 180,
          transactionDate: '2026-07-22'
          // SEM startYear e SEM startMonth!
        }
      ]
    };

    // Consulta em Julho/2026 (mês da compra) -> deve estar presente com data civil da compra!
    const resJul = projectFinancialMonth(finances, 2026, 7);
    assert.strictEqual(resJul.events.length, 1, 'Deve projetar evento em julho');
    assert.strictEqual(resJul.events[0].date, '2026-07-22');
    assert.strictEqual(resJul.events[0].amount, 180);
    assert.strictEqual(resJul.summary.outflow, 180);

    // Consulta em Janeiro/2026 -> NÃO pode aparecer (bug antigo de sMonth=1 corrigido!)
    const resJan = projectFinancialMonth(finances, 2026, 1);
    assert.strictEqual(resJan.events.length, 0, 'NÃO pode assumir janeiro');
    assert.strictEqual(resJan.undated.length, 0);
    assert.strictEqual(resJan.summary.outflow, 0);

    // Consulta em Agosto/2026 -> ausente
    const resAug = projectFinancialMonth(finances, 2026, 8);
    assert.strictEqual(resAug.events.length, 0);
    assert.strictEqual(resAug.undated.length, 0);
  });

  // 3. transactionDate não é substituída por dueDay
  test('3. transactionDate e dueDay preservam seus papéis sem substituição indevida', () => {
    const finances = {
      variable: [
        {
          id: 'var_card_tx',
          name: 'Compra Parcelada no Cartão',
          totalAmount: 300,
          installments: 3,
          startYear: 2026,
          startMonth: 4,
          transactionDate: '2026-04-05',
          dueDay: 20 // Vencimento da fatura dia 20
        }
      ]
    };

    // Parcela 1 em abril vence no dueDay 20, mas preserva transactionDate civil da compra (05/04)
    const resApr = projectFinancialMonth(finances, 2026, 4);
    assert.strictEqual(resApr.events.length, 1);
    assert.strictEqual(resApr.events[0].date, '2026-04-20', 'Vencimento financeiro segue dueDay');
    assert.strictEqual(resApr.events[0].transactionDate, '2026-04-05', 'transactionDate da compra não foi alterada');
  });

  // 4. Registro sem evidência temporal NÃO assume janeiro
  test('4. Registro sem evidência temporal NÃO assume janeiro (sMonth = 1)', () => {
    const v = {
      id: 'var_no_evidence',
      name: 'Despesa Indeterminada',
      amount: 200
      // Sem startYear, sem startMonth, sem transactionDate, sem year/month
    };

    const resolved = resolveVariableStartCompetence(v);
    assert.strictEqual(resolved, null, 'resolveVariableStartCompetence deve retornar null');

    const finances = { variable: [v] };
    const resJan = projectFinancialMonth(finances, 2026, 1);
    assert.strictEqual(resJan.events.length, 0, 'Não deve aparecer em janeiro');
    assert.strictEqual(resJan.undated.length, 0, 'Não deve aparecer em janeiro');
    assert.strictEqual(resJan.summary.outflow, 0, 'Não pode descontar em janeiro');
  });

  // 5. Registro sem evidência temporal NÃO assume mês consultado
  test('5. Registro sem evidência temporal NÃO assume o mês consultado (setembro/2026)', () => {
    const finances = {
      variable: [
        {
          id: 'var_ambiguous',
          name: 'Despesa Sem Mês',
          amount: 500
        }
      ]
    };

    // Consultando setembro
    const resSep = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(resSep.events.length, 0, 'Não deve aparecer em setembro');
    assert.strictEqual(resSep.undated.length, 0, 'Não deve aparecer em setembro');
    assert.strictEqual(resSep.summary.outflow, 0, 'Não pode afetar summary de setembro');

    // Consultando outubro
    const resOct = projectFinancialMonth(finances, 2026, 10);
    assert.strictEqual(resOct.events.length, 0);
    assert.strictEqual(resOct.undated.length, 0);
    assert.strictEqual(resOct.summary.outflow, 0);
  });

  // 6. dueDay sozinho NÃO define purchase month
  test('6. dueDay sozinho (ex: dueDay = 15) NÃO define purchase month ou start competence', () => {
    const v = {
      id: 'var_due_only',
      name: 'Boleto Sem Mês',
      amount: 350,
      dueDay: 15
      // apenas dueDay, sem ano ou mês
    };

    const resolved = resolveVariableStartCompetence(v);
    assert.strictEqual(resolved, null, 'dueDay não pode ser usado para inferir ano/mês de compra');

    const finances = { variable: [v] };
    const res = projectFinancialMonth(finances, 2026, 5);
    assert.strictEqual(res.events.length, 0);
    assert.strictEqual(res.undated.length, 0);
  });

  // 7. paidHistory não é tratado genericamente como start month quando ambíguo
  test('7. paidHistory com múltiplas chaves ou em despesa parcelada NÃO infere start competence', () => {
    const v = {
      id: 'var_hist_ambiguous',
      name: 'Parcelamento Antigo com Histórico',
      amount: 100,
      installments: 12,
      paidHistory: {
        '2026-05': { paidAmount: 100 },
        '2026-06': { paidAmount: 100 }
      }
    };

    const resolved = resolveVariableStartCompetence(v);
    assert.strictEqual(resolved, null, 'paidHistory ambíguo não deve inferir start month');
  });

  // 8. Installment com dados canônicos não sofre regressão
  test('8. Installment canônico (startYear, startMonth, installments, dueDay) projeta perfeitamente', () => {
    const finances = {
      variable: [
        {
          id: 'var_inst_canon',
          name: 'Notebook Dell',
          totalAmount: 4000,
          installments: 4,
          startYear: 2026,
          startMonth: 3,
          endYear: 2026,
          endMonth: 6,
          dueDay: 10
        }
      ]
    };

    // Mês 4 (abril) = 2ª parcela
    const res = projectFinancialMonth(finances, 2026, 4);
    assert.strictEqual(res.events.length, 1);
    assert.strictEqual(res.events[0].date, '2026-04-10');
    assert.strictEqual(res.events[0].amount, 1000);
    assert.strictEqual(res.events[0].installmentIndex, 2);
    assert.strictEqual(res.events[0].installmentTotal, 4);
  });

  // 9. Cash expense V2 não sofre regressão
  test('9. Cash expense V2 com startYear/startMonth projeta corretamente', () => {
    const finances = {
      variable: [
        {
          id: 'var_cash_v2',
          name: 'Padaria',
          amount: 25.50,
          paymentMethod: 'dinheiro',
          startYear: 2026,
          startMonth: 9,
          transactionDate: '2026-09-08'
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 1);
    assert.strictEqual(res.events[0].date, '2026-09-08');
    assert.strictEqual(res.events[0].amount, 25.50);
  });

  // 10. Fixed expenses não sofrem regressão
  test('10. Fixed expenses com dueDay e versões projetam normalmente', () => {
    const finances = {
      fixed: [
        {
          id: 'fix_seguro',
          name: 'Seguro Auto',
          amount: 220,
          dueDay: 18,
          versions: [{ year: 2026, month: 1, amount: 220 }]
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 1);
    assert.strictEqual(res.events[0].date, '2026-09-18');
    assert.strictEqual(res.events[0].amount, 220);
  });

  // 11. Summary não sofre dupla contabilização
  test('11. Summary reflete soma exata de inflow e outflow sem duplicação', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      fixed: [
        { id: 'f1', name: 'Aluguel', amount: 1500, dueDay: 5, versions: [{ year: 2026, month: 1, amount: 1500 }] }
      ],
      variable: [
        { id: 'v1', name: 'Supermercado', amount: 800, startYear: 2026, startMonth: 9, dueDay: 12 }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.summary.inflow, 5000);
    assert.strictEqual(res.summary.outflow, 2300);
    assert.strictEqual(res.summary.net, 2700);
  });

  // 12. Salary permanece correto
  test('12. Salário base projeta inflow integralmente na competência', () => {
    const finances = {
      profile: {
        baseSalary: 6500,
        salaryPayment: { type: 'fixed_day', day: 5, weekendAdjustment: 'none' }
      }
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 1);
    assert.strictEqual(res.events[0].sourceType, 'salary');
    assert.strictEqual(res.events[0].amount, 6500);
    assert.strictEqual(res.summary.inflow, 6500);
  });

  // 13. Benefits permanece segregado
  test('13. Benefícios (VR/VA) permanecem segregados sem contaminar summary bancário', () => {
    const finances = {
      benefitsConfig: { amount: 800, va: 400, vr: 400 },
      benefitTransactions: [
        { id: 'bt_1', description: 'Restaurante VR', amount: 45, day: 10, month: 9, year: 2026 }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.summary.inflow, 0, 'Summary bancário deve ser zero');
    assert.strictEqual(res.summary.outflow, 0, 'Summary bancário deve ser zero');
    assert.strictEqual(res.benefits.events.length, 1);
    assert.strictEqual(res.benefits.events[0].amount, 45);
  });

  // 14. Debtor countInTotal permanece correto
  test('14. Debtor com countInTotal = true participa de inflow, false não participa', () => {
    const finances = {
      debtors: [
        { id: 'deb_in', title: 'Empréstimo Irmão', amount: 300, receiveDay: 15, countInTotal: true, startYear: 2026, startMonth: 9 },
        { id: 'deb_out', title: 'Dívida Amigo', amount: 200, receiveDay: 20, countInTotal: false, startYear: 2026, startMonth: 9 }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 2);
    // Apenas deb_in soma no inflow bancário
    assert.strictEqual(res.summary.inflow, 300);
  });

  // 15. Incerteza explicitamente preservada: variáveis sem competência não vazam para undated em múltiplos meses
  test('15. Despesa sem competência retorna null e NÃO vaza para undated de múltiplos meses consultados', () => {
    const finances = {
      variable: [
        { id: 'var_undated_test', name: 'Despesa sem Data', amount: 999 }
      ]
    };

    // Testando em 3 meses distintos
    const jan = projectFinancialMonth(finances, 2026, 1);
    const jul = projectFinancialMonth(finances, 2026, 7);
    const dec = projectFinancialMonth(finances, 2026, 12);

    assert.strictEqual(jan.undated.length, 0);
    assert.strictEqual(jan.summary.outflow, 0);

    assert.strictEqual(jul.undated.length, 0);
    assert.strictEqual(jul.summary.outflow, 0);

    assert.strictEqual(dec.undated.length, 0);
    assert.strictEqual(dec.summary.outflow, 0);
  });
});
