/**
 * CorvFin V2 — Suíte de Testes de Domínio e API de Relatórios Financeiros (Fase R2)
 * Arquivo: tests/finance_reports_domain_api.test.js
 *
 * Cobertura Completa dos 28 Cenários Mandatórios + Reconciliações + Segurança:
 *  1. Salário base (profile.baseSalary)
 *  2. Override mensal de salário (incomes['YYYY-MM'])
 *  3. Renda extra (extras)
 *  4. Debtor countInTotal=true
 *  5. Debtor countInTotal=false (segregado)
 *  6. Despesa fixa (fixed com versões, endedFrom e recorrência)
 *  7. Despesa variável (variable regular)
 *  8. V2 installment amountInputMode='total'
 *  9. V2 installment amountInputMode='installment'
 * 10. Legacy installment (sem totalAmount)
 * 11. Cartão estruturado (credit card com closingDay/dueDay)
 * 12. Cartão legado compatível (sem closingDay)
 * 13. Pix imediato com transactionDate
 * 14. Dinheiro imediato com transactionDate
 * 15. Cartão de débito imediato com transactionDate
 * 16. Transferência imediata com transactionDate
 * 17. Débito automático imediato com transactionDate
 * 18. Pagamento completo (status 'paid')
 * 19. Pagamento parcial (status 'partial')
 * 20. Pendente (status 'pending')
 * 21. Mês vazio (zero inflow/outflow, savingsRate null)
 * 22. Intervalo cruzando dezembro/janeiro
 * 23. savingsRate positivo (+20%)
 * 24. savingsRate negativo (-20%, sem clamp a 0%)
 * 25. savingsRate null quando totalInflow=0
 * 26. Range >12 competências rejeitado (REPORT_PERIOD_TOO_LARGE)
 * 27. Perspective inválida rejeitada (INVALID_REPORT_PERSPECTIVE)
 * 28. Anti-double-counting de cartão de crédito
 *
 * Reconciliações Adicionais:
 * - Cashflow === projectFinancialMonth().summary
 * - Soma de itens === totais agregados
 * - Competence === semântica orçamentária pura
 * - Segregação de benefícios corporativos
 * - Segurança, RBAC, Entitlements e isolamento de usuário
 */

'use strict';

const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');

const financeReportService = require('../server/services/financeReportService');
const {
  generateFinancialReport,
  validateReportOptions,
  calculateSavingsRate,
  projectCompetenceMonth,
  projectCashflowMonth,
  aggregateCategories,
  aggregateDestinations,
  aggregatePaymentMethods,
  aggregateCostTypes,
  aggregateInstallmentsOverview
} = financeReportService;

const { projectFinancialMonth } = require('../server/services/financeProjectionService');
const FinanceDomain = require('../shared/financeDomain');

describe('CorvFin V2 — Relatórios Financeiros (Fase R2 — Domain & API Foundation)', () => {

  // -----------------------------------------------------------------------------
  // CENÁRIO 1: Salário Base
  // -----------------------------------------------------------------------------
  test('1. Salário base projetado em inflow a partir de profile.baseSalary quando não há override', () => {
    const finances = {
      profile: { baseSalary: 5500 },
      incomes: {}
    };

    const reportCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 3, endYear: 2026, endMonth: 3, perspective: 'cashflow'
    });
    assert.strictEqual(reportCash.kpis.totalInflow, 5500);

    const reportComp = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 3, endYear: 2026, endMonth: 3, perspective: 'competence'
    });
    assert.strictEqual(reportComp.kpis.totalInflow, 5500);
    assert.strictEqual(reportComp.monthlyTimeline[0].inflow, 5500);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 2: Override Mensal de Salário
  // -----------------------------------------------------------------------------
  test('2. Override mensal em incomes[YYYY-MM] possui precedência oficial sobre baseSalary', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      incomes: {
        '2026-04': 7200
      }
    };

    const reportComp = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 4, endYear: 2026, endMonth: 4, perspective: 'competence'
    });
    assert.strictEqual(reportComp.kpis.totalInflow, 7200);

    const reportCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 4, endYear: 2026, endMonth: 4, perspective: 'cashflow'
    });
    assert.strictEqual(reportCash.kpis.totalInflow, 7200);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 3: Renda Extra
  // -----------------------------------------------------------------------------
  test('3. Rendas extras ativas são projetadas em inflow com categoria e status preservados', () => {
    const finances = {
      profile: { baseSalary: 3000 },
      extras: [
        {
          id: 'ext_1',
          title: 'Consultoria Web',
          source: 'Freelance',
          amount: 1500,
          startYear: 2026,
          startMonth: 1,
          endYear: 2026,
          endMonth: 2
        }
      ]
    };

    const report = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 2, perspective: 'competence'
    });
    // 2 meses: baseSalary (3000*2) + extra (1500*2) = 9000
    assert.strictEqual(report.kpis.totalInflow, 9000);
    assert.strictEqual(report.monthlyTimeline[0].inflow, 4500);
    assert.strictEqual(report.monthlyTimeline[1].inflow, 4500);

    const extraItems = report.items.filter(it => it.sourceType === 'extra_income');
    assert.strictEqual(extraItems.length, 2);
    assert.strictEqual(extraItems[0].category, 'Freelance');
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 4: Devedor com countInTotal === true
  // -----------------------------------------------------------------------------
  test('4. Devedor com countInTotal === true é rigorosamente contabilizado em totalInflow, netResult e savingsRate', () => {
    const finances = {
      profile: { baseSalary: 4000 },
      debtors: [
        {
          id: 'deb_true',
          debtorName: 'Carlos',
          title: 'Empréstimo',
          amount: 500,
          startYear: 2026,
          startMonth: 5,
          endYear: 2026,
          endMonth: 5,
          countInTotal: true
        }
      ]
    };

    const report = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 5, endYear: 2026, endMonth: 5, perspective: 'competence'
    });
    assert.strictEqual(report.kpis.totalInflow, 4500);
    assert.strictEqual(report.kpis.netResult, 4500);
    assert.strictEqual(report.kpis.savingsRate, 100);

    const reportCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 5, endYear: 2026, endMonth: 5, perspective: 'cashflow'
    });
    assert.strictEqual(reportCash.kpis.totalInflow, 4500);
    assert.strictEqual(reportCash.kpis.netResult, 4500);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 5: Devedor com countInTotal === false
  // -----------------------------------------------------------------------------
  test('5. Devedor com countInTotal === false é estritamente excluído de totalInflow, netResult e savingsRate', () => {
    const finances = {
      profile: { baseSalary: 4000 },
      debtors: [
        {
          id: 'deb_false',
          debtorName: 'Empresa X',
          title: 'Reembolso pendente',
          amount: 1000,
          startYear: 2026,
          startMonth: 5,
          endYear: 2026,
          endMonth: 5,
          countInTotal: false
        }
      ]
    };

    const reportComp = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 5, endYear: 2026, endMonth: 5, perspective: 'competence'
    });
    // Inflow NÃO deve incluir os 1000 de devedor não contabilizado
    assert.strictEqual(reportComp.kpis.totalInflow, 4000);
    assert.strictEqual(reportComp.kpis.netResult, 4000);

    // O item analítico existe para drilldown/Corvo, porém com countInTotal: false
    const debItem = reportComp.items.find(it => it.sourceId === 'deb_false');
    assert.ok(debItem, 'Item analítico de devedor deve estar presente no dataset');
    assert.strictEqual(debItem.countInTotal, false);

    const reportCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 5, endYear: 2026, endMonth: 5, perspective: 'cashflow'
    });
    assert.strictEqual(reportCash.kpis.totalInflow, 4000);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 6: Despesa Fixa
  // -----------------------------------------------------------------------------
  test('6. Despesa fixa projeta outflow respeitando versões vigentes, endedFrom e recorrência', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      fixed: [
        {
          id: 'fix_aluguel',
          name: 'Aluguel',
          group: 'Moradia',
          destination: 'Nubank',
          versions: [
            { year: 2026, month: 1, amount: 2000 },
            { year: 2026, month: 3, amount: 2200 }
          ]
        },
        {
          id: 'fix_encerrada',
          name: 'Academia Antiga',
          group: 'Saúde',
          versions: [{ year: 2026, month: 1, amount: 150 }],
          endedFrom: { year: 2026, month: 3 } // Encerrada a partir de março
        }
      ]
    };

    const report = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 3, perspective: 'competence'
    });

    // Mês 1: 2000 (aluguel) + 150 (academia) = 2150
    // Mês 2: 2000 (aluguel) + 150 (academia) = 2150
    // Mês 3: 2200 (aluguel nova versão) + 0 (academia encerrada) = 2200
    // Total Outflow = 2150 + 2150 + 2200 = 6500
    assert.strictEqual(report.monthlyTimeline[0].outflow, 2150);
    assert.strictEqual(report.monthlyTimeline[1].outflow, 2150);
    assert.strictEqual(report.monthlyTimeline[2].outflow, 2200);
    assert.strictEqual(report.kpis.totalOutflow, 6500);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 7: Despesa Variável Regular
  // -----------------------------------------------------------------------------
  test('7. Despesa variável à vista projeta outflow exclusivamente na sua competência', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      variable: [
        {
          id: 'var_mercado',
          name: 'Supermercado',
          group: 'Alimentação',
          amount: 600,
          installments: 1,
          startYear: 2026,
          startMonth: 2,
          endYear: 2026,
          endMonth: 2
        }
      ]
    };

    const report = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 3, perspective: 'competence'
    });

    assert.strictEqual(report.monthlyTimeline[0].outflow, 0);
    assert.strictEqual(report.monthlyTimeline[1].outflow, 600);
    assert.strictEqual(report.monthlyTimeline[2].outflow, 0);
    assert.strictEqual(report.kpis.totalOutflow, 600);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 8: Parcelamento V2 amountInputMode='total'
  // -----------------------------------------------------------------------------
  test('8. Parcelamento V2 com amountInputMode="total" (1200 em 10x) projeta parcela exata de 120 por mês', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      variable: [
        {
          id: 'var_v2_tot',
          name: 'Notebook',
          totalAmount: 1200,
          amount: 1200,
          amountInputMode: 'total',
          installments: 10,
          startYear: 2026,
          startMonth: 1,
          endYear: 2026,
          endMonth: 10
        }
      ]
    };

    const report = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 3, perspective: 'competence'
    });

    assert.strictEqual(report.monthlyTimeline[0].outflow, 120);
    assert.strictEqual(report.monthlyTimeline[1].outflow, 120);
    assert.strictEqual(report.monthlyTimeline[2].outflow, 120);
    assert.strictEqual(report.kpis.totalOutflow, 360);

    // Panorama de parcelamento
    assert.strictEqual(report.installmentsOverview.activeCount, 1);
    assert.strictEqual(report.installmentsOverview.totalContractedAmount, 1200);
    assert.strictEqual(report.installmentsOverview.periodAmount, 360);
    assert.strictEqual(report.installmentsOverview.futureRemainingAmount, 840);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 9: Parcelamento V2 amountInputMode='installment'
  // -----------------------------------------------------------------------------
  test('9. Parcelamento V2 com amountInputMode="installment" (120 em 10x) preserva parcela e calcula total de 1200', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      variable: [
        {
          id: 'var_v2_inst',
          name: 'Curso',
          installmentAmount: 120,
          amount: 120,
          totalAmount: 1200,
          amountInputMode: 'installment',
          installments: 10,
          startYear: 2026,
          startMonth: 1,
          endYear: 2026,
          endMonth: 10
        }
      ]
    };

    const report = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 2, perspective: 'competence'
    });

    assert.strictEqual(report.monthlyTimeline[0].outflow, 120);
    assert.strictEqual(report.monthlyTimeline[1].outflow, 120);
    assert.strictEqual(report.kpis.totalOutflow, 240);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 10: Parcelamento Legado
  // -----------------------------------------------------------------------------
  test('10. Parcelamento legado sem totalAmount e sem amountInputMode interpreta amount como valor da parcela', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      variable: [
        {
          id: 'var_leg',
          name: 'Sofá Legado',
          amount: 250, // parcela
          installments: 4,
          startYear: 2026,
          startMonth: 1,
          endYear: 2026,
          endMonth: 4
        }
      ]
    };

    const report = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 4, perspective: 'competence'
    });

    assert.strictEqual(report.monthlyTimeline[0].outflow, 250);
    assert.strictEqual(report.monthlyTimeline[1].outflow, 250);
    assert.strictEqual(report.monthlyTimeline[2].outflow, 250);
    assert.strictEqual(report.monthlyTimeline[3].outflow, 250);
    assert.strictEqual(report.kpis.totalOutflow, 1000);
    assert.strictEqual(report.installmentsOverview.totalContractedAmount, 1000);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 11: Cartão de Crédito Estruturado
  // -----------------------------------------------------------------------------
  test('11. Cartão estruturado projeta fatura no dueDay em cashflow, mantendo transação informativa affectsCashflow=false', () => {
    const finances = {
      profile: { baseSalary: 6000 },
      destinations: [
        { id: 'card_1', name: 'Inter Black', type: 'credit_card', closingDay: 20, dueDay: 28 }
      ],
      variable: [
        {
          id: 'compra_card',
          name: 'Passagem Aérea',
          amount: 800,
          transactionDate: '2026-05-10', // Antes do fechamento dia 20 -> vence em 28/05
          destinationId: 'card_1',
          paymentMethod: 'cartao_credito',
          installments: 1,
          startYear: 2026,
          startMonth: 5,
          endYear: 2026,
          endMonth: 5
        }
      ]
    };

    // Em CASHFLOW:
    const reportCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 5, endYear: 2026, endMonth: 5, perspective: 'cashflow'
    });
    // Outflow deve ser exatamente os 800 da fatura
    assert.strictEqual(reportCash.kpis.totalOutflow, 800);

    const txItem = reportCash.items.find(it => it.eventKind === 'transaction');
    const invItem = reportCash.items.find(it => it.eventKind === 'invoice');

    assert.ok(txItem, 'Item de transação deve existir');
    assert.strictEqual(txItem.affectsCashflow, false, 'Transação não deve afetar fluxo de caixa');

    assert.ok(invItem, 'Item de fatura consolidada deve existir');
    assert.strictEqual(invItem.affectsCashflow, true, 'Fatura deve afetar fluxo de caixa');
    assert.strictEqual(invItem.amount, 800);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 12: Cartão de Crédito Compatível Legado (sem closingDay)
  // -----------------------------------------------------------------------------
  test('12. Cartão de crédito legado compatível (sem closingDay) projeta obrigação em cashflow na data de vencimento', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      destinations: [
        { id: 'neon_card', name: 'Neon', type: 'credit_card', dueDay: 15 } // Sem closingDay
      ],
      variable: [
        {
          id: 'var_neon',
          name: 'Compra Neon',
          amount: 300,
          dueDay: 15,
          destinationId: 'neon_card',
          paymentMethod: 'cartao_credito',
          startYear: 2026,
          startMonth: 6,
          endYear: 2026,
          endMonth: 6
        }
      ]
    };

    const reportCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 6, endYear: 2026, endMonth: 6, perspective: 'cashflow'
    });
    assert.strictEqual(reportCash.kpis.totalOutflow, 300);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIOS 13 a 17: Meios de Pagamento Imediatos
  // -----------------------------------------------------------------------------
  test('13. Pix com transactionDate afeta cashflow na data da transação sem duplicidade', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      variable: [
        {
          id: 'v_pix',
          name: 'Transferência Pix',
          amount: 200,
          transactionDate: '2026-07-10',
          paymentMethod: 'pix',
          startYear: 2026,
          startMonth: 7,
          endYear: 2026,
          endMonth: 7
        }
      ]
    };

    const repCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 7, endYear: 2026, endMonth: 7, perspective: 'cashflow'
    });
    assert.strictEqual(repCash.kpis.totalOutflow, 200);

    const repComp = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 7, endYear: 2026, endMonth: 7, perspective: 'competence'
    });
    assert.strictEqual(repComp.kpis.totalOutflow, 200);
  });

  test('14. Dinheiro com transactionDate afeta cashflow na data da transação sem duplicidade', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      variable: [
        {
          id: 'v_din',
          name: 'Padaria em Dinheiro',
          amount: 50,
          transactionDate: '2026-07-12',
          paymentMethod: 'dinheiro',
          startYear: 2026,
          startMonth: 7,
          endYear: 2026,
          endMonth: 7
        }
      ]
    };

    const repCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 7, endYear: 2026, endMonth: 7, perspective: 'cashflow'
    });
    assert.strictEqual(repCash.kpis.totalOutflow, 50);
  });

  test('15. Cartão de débito afeta cashflow na data da transação sem virar fatura', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      variable: [
        {
          id: 'v_deb',
          name: 'Mercado Débito',
          amount: 150,
          transactionDate: '2026-07-15',
          paymentMethod: 'cartao_debito',
          startYear: 2026,
          startMonth: 7,
          endYear: 2026,
          endMonth: 7
        }
      ]
    };

    const repCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 7, endYear: 2026, endMonth: 7, perspective: 'cashflow'
    });
    assert.strictEqual(repCash.kpis.totalOutflow, 150);
    const invoiceEvents = repCash.items.filter(it => it.eventKind === 'invoice');
    assert.strictEqual(invoiceEvents.length, 0, 'Débito nunca deve gerar fatura');
  });

  test('16. Transferência imediata afeta cashflow na data da transação', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      variable: [
        {
          id: 'v_ted',
          name: 'TED Aluguel Garagem',
          amount: 300,
          transactionDate: '2026-07-05',
          paymentMethod: 'transferencia',
          startYear: 2026,
          startMonth: 7,
          endYear: 2026,
          endMonth: 7
        }
      ]
    };

    const repCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 7, endYear: 2026, endMonth: 7, perspective: 'cashflow'
    });
    assert.strictEqual(repCash.kpis.totalOutflow, 300);
  });

  test('17. Débito automático afeta cashflow corretamente', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      variable: [
        {
          id: 'v_deb_auto',
          name: 'Conta de Água',
          amount: 120,
          transactionDate: '2026-07-22',
          paymentMethod: 'debito_automatico',
          startYear: 2026,
          startMonth: 7,
          endYear: 2026,
          endMonth: 7
        }
      ]
    };

    const repCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 7, endYear: 2026, endMonth: 7, perspective: 'cashflow'
    });
    assert.strictEqual(repCash.kpis.totalOutflow, 120);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 18: Pagamento Completo (Paid)
  // -----------------------------------------------------------------------------
  test('18. Pagamento completo reflete status="paid", paidAmount=amount e remainingAmount=0', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      fixed: [
        {
          id: 'f_pago',
          name: 'Internet',
          amount: 200,
          startYear: 2026,
          startMonth: 8,
          paidHistory: {
            '2026-08': true
          }
        }
      ]
    };

    const report = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 8, endYear: 2026, endMonth: 8, perspective: 'competence'
    });

    assert.strictEqual(report.kpis.totalPaid, 200);
    assert.strictEqual(report.kpis.totalPending, 0);
    const item = report.items.find(it => it.sourceId === 'f_pago');
    assert.strictEqual(item.status, 'paid');
    assert.strictEqual(item.paidAmount, 200);
    assert.strictEqual(item.remainingAmount, 0);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 19: Pagamento Parcial (Partial)
  // -----------------------------------------------------------------------------
  test('19. Pagamento parcial reflete status="partial", paidAmount parcial e saldo remanescente correto', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      fixed: [
        {
          id: 'f_parcial',
          name: 'Condomínio',
          amount: 800,
          startYear: 2026,
          startMonth: 8,
          paidHistory: {
            '2026-08': { paidAmount: 500 }
          }
        }
      ]
    };

    const report = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 8, endYear: 2026, endMonth: 8, perspective: 'competence'
    });

    assert.strictEqual(report.kpis.totalPaid, 500);
    assert.strictEqual(report.kpis.totalPending, 300);
    const item = report.items.find(it => it.sourceId === 'f_parcial');
    assert.strictEqual(item.status, 'partial');
    assert.strictEqual(item.paidAmount, 500);
    assert.strictEqual(item.remainingAmount, 300);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 20: Pendente (Pending)
  // -----------------------------------------------------------------------------
  test('20. Item sem pagamento registrado reflete status="pending", paidAmount=0 e remainingAmount=amount', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      fixed: [
        {
          id: 'f_pendente',
          name: 'Luz',
          amount: 250,
          startYear: 2026,
          startMonth: 8
        }
      ]
    };

    const report = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 8, endYear: 2026, endMonth: 8, perspective: 'competence'
    });

    assert.strictEqual(report.kpis.totalPaid, 0);
    assert.strictEqual(report.kpis.totalPending, 250);
    const item = report.items.find(it => it.sourceId === 'f_pendente');
    assert.strictEqual(item.status, 'pending');
    assert.strictEqual(item.paidAmount, 0);
    assert.strictEqual(item.remainingAmount, 250);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 21: Mês Vazio
  // -----------------------------------------------------------------------------
  test('21. Mês sem dados retorna totais zerados, listas vazias e savingsRate nulo', () => {
    const finances = {};

    const report = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 9, endYear: 2026, endMonth: 9, perspective: 'competence'
    });

    assert.strictEqual(report.kpis.totalInflow, 0);
    assert.strictEqual(report.kpis.totalOutflow, 0);
    assert.strictEqual(report.kpis.netResult, 0);
    assert.strictEqual(report.kpis.savingsRate, null);
    assert.strictEqual(report.kpis.totalPaid, 0);
    assert.strictEqual(report.kpis.totalPending, 0);
    assert.strictEqual(report.items.length, 0);
    assert.strictEqual(report.categories.length, 0);
    assert.strictEqual(report.destinations.length, 0);
    assert.strictEqual(report.paymentMethods.length, 0);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 22: Intervalo Cruzando Virada de Ano
  // -----------------------------------------------------------------------------
  test('22. Intervalo cruzando dezembro/janeiro projeta corretamente competências contínuas', () => {
    const finances = {
      profile: { baseSalary: 5000 }
    };

    const report = generateFinancialReport(finances, {
      startYear: 2025, startMonth: 11, endYear: 2026, endMonth: 2, perspective: 'competence'
    });

    assert.strictEqual(report.period.months, 4);
    assert.strictEqual(report.period.start, '2025-11');
    assert.strictEqual(report.period.end, '2026-02');
    assert.strictEqual(report.monthlyTimeline.length, 4);
    assert.strictEqual(report.monthlyTimeline[0].competence, '2025-11');
    assert.strictEqual(report.monthlyTimeline[1].competence, '2025-12');
    assert.strictEqual(report.monthlyTimeline[2].competence, '2026-01');
    assert.strictEqual(report.monthlyTimeline[3].competence, '2026-02');
    assert.strictEqual(report.kpis.totalInflow, 20000);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIOS 23 a 25: Taxa de Poupança (savingsRate)
  // -----------------------------------------------------------------------------
  test('23. savingsRate positivo: inflow=5000, outflow=4000 resulta em +20%', () => {
    const rate = calculateSavingsRate(5000, 4000);
    assert.strictEqual(rate, 20);
  });

  test('24. savingsRate negativo: inflow=5000, outflow=6000 resulta em -20% (sem clamp a 0%)', () => {
    const rate = calculateSavingsRate(5000, 6000);
    assert.strictEqual(rate, -20);
  });

  test('25. savingsRate retorna estritamente null quando totalInflow === 0', () => {
    assert.strictEqual(calculateSavingsRate(0, 1000), null);
    assert.strictEqual(calculateSavingsRate(0, 0), null);
    assert.strictEqual(calculateSavingsRate(-500, 1000), null);
  });

  // -----------------------------------------------------------------------------
  // CENÁRIOS 26 & 27: Validações Estritas de Consulta
  // -----------------------------------------------------------------------------
  test('26. Intervalo maior que 12 competências é rejeitado com REPORT_PERIOD_TOO_LARGE', () => {
    const finances = { profile: { baseSalary: 5000 } };
    assert.throws(() => {
      generateFinancialReport(finances, {
        startYear: 2026, startMonth: 1, endYear: 2027, endMonth: 2, perspective: 'cashflow'
      });
    }, (err) => {
      assert.strictEqual(err.code, 'REPORT_PERIOD_TOO_LARGE');
      assert.strictEqual(err.status, 400);
      return true;
    });
  });

  test('27. Perspectiva inválida é rejeitada com INVALID_REPORT_PERSPECTIVE', () => {
    const finances = { profile: { baseSalary: 5000 } };
    assert.throws(() => {
      generateFinancialReport(finances, {
        startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 1, perspective: 'invalida'
      });
    }, (err) => {
      assert.strictEqual(err.code, 'INVALID_REPORT_PERSPECTIVE');
      assert.strictEqual(err.status, 400);
      return true;
    });
  });

  // -----------------------------------------------------------------------------
  // CENÁRIO 28: Anti-Double-Counting de Cartão de Crédito
  // -----------------------------------------------------------------------------
  test('28. Anti-double-counting: compra no cartão + fatura no mesmo mês NÃO duplicam outflow em cashflow', () => {
    const finances = {
      profile: { baseSalary: 6000 },
      destinations: [
        { id: 'card_nubank', name: 'Nubank Card', type: 'credit_card', closingDay: 10, dueDay: 17 }
      ],
      variable: [
        {
          id: 'v_compra_vista',
          name: 'Livros',
          amount: 400,
          transactionDate: '2026-08-05', // fecha dia 10, vence dia 17 de agosto
          destinationId: 'card_nubank',
          paymentMethod: 'cartao_credito',
          installments: 1,
          startYear: 2026,
          startMonth: 8,
          endYear: 2026,
          endMonth: 8
        }
      ]
    };

    const reportCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 8, endYear: 2026, endMonth: 8, perspective: 'cashflow'
    });

    // Total outflow DEVE ser exatamente 400 (apenas a fatura liquidada), NÃO 800 (compra + fatura)
    assert.strictEqual(reportCash.kpis.totalOutflow, 400);

    // Na agregação por categoria, o total acumulado também deve ser exatamente 400
    const catTotal = reportCash.categories.reduce((s, c) => s + c.amount, 0);
    assert.strictEqual(catTotal, 400);
  });

  // -----------------------------------------------------------------------------
  // RECONCILIAÇÃO 1: Reconciliação Estrita de Cashflow contra projectFinancialMonth
  // -----------------------------------------------------------------------------
  test('RECONCILIAÇÃO CASHFLOW: Cada mês em monthlyTimeline é 100% idêntico ao summary de projectFinancialMonth()', () => {
    const finances = {
      profile: {
        baseSalary: 7000,
        salaryPayment: { type: 'fixed_day', day: 5 }
      },
      fixed: [
        { id: 'f1', name: 'Aluguel', amount: 2500, dueDay: 10 },
        { id: 'f2', name: 'Condomínio', amount: 600, dueDay: 15 }
      ],
      destinations: [
        { id: 'c1', name: 'Cartão XP', type: 'credit_card', closingDay: 20, dueDay: 27 }
      ],
      variable: [
        {
          id: 'v1',
          name: 'Supermercado Débito',
          amount: 800,
          transactionDate: '2026-03-08',
          paymentMethod: 'cartao_debito'
        },
        {
          id: 'v2',
          name: 'Eletrônicos Cartão',
          amount: 900,
          transactionDate: '2026-03-12',
          destinationId: 'c1',
          paymentMethod: 'cartao_credito',
          installments: 1,
          startYear: 2026,
          startMonth: 3,
          endYear: 2026,
          endMonth: 3
        }
      ],
      extras: [
        { id: 'e1', title: 'Bônus', amount: 1000, receiveDate: '2026-03-20' }
      ],
      debtors: [
        { id: 'd1', debtorName: 'Ana', amount: 300, receiveDay: 18, countInTotal: true, startYear: 2026, startMonth: 3, endYear: 2026, endMonth: 3 },
        { id: 'd2', debtorName: 'Beto', amount: 500, receiveDay: 18, countInTotal: false, startYear: 2026, startMonth: 3, endYear: 2026, endMonth: 3 }
      ]
    };

    const report = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 3, endYear: 2026, endMonth: 3, perspective: 'cashflow'
    });

    const canonicalMonth = projectFinancialMonth(finances, 2026, 3);

    assert.strictEqual(report.monthlyTimeline[0].inflow, canonicalMonth.summary.inflow);
    assert.strictEqual(report.monthlyTimeline[0].outflow, canonicalMonth.summary.outflow);
    assert.strictEqual(report.monthlyTimeline[0].netResult, canonicalMonth.summary.net);
    assert.strictEqual(report.kpis.totalInflow, canonicalMonth.summary.inflow);
    assert.strictEqual(report.kpis.totalOutflow, canonicalMonth.summary.outflow);
    assert.strictEqual(report.kpis.netResult, canonicalMonth.summary.net);

    // Prova que a soma dos itens que afetam cashflow bate 100% com o totalOutflow
    const sumOutflowItems = report.items
      .filter(it => it.direction === 'outflow' && it.affectsCashflow !== false)
      .reduce((s, it) => s + it.amount, 0);
    assert.strictEqual(sumOutflowItems, canonicalMonth.summary.outflow);

    // Prova que a soma dos itens que afetam cashflow de inflow bate 100% com o totalInflow
    const sumInflowItems = report.items
      .filter(it => it.direction === 'inflow' && (it.sourceType !== 'debtor_receivable' || it.countInTotal === true))
      .reduce((s, it) => s + it.amount, 0);
    assert.strictEqual(sumInflowItems, canonicalMonth.summary.inflow);
  });

  // -----------------------------------------------------------------------------
  // RECONCILIAÇÃO 2: Reconciliação Estrita de Agregações Analíticas
  // -----------------------------------------------------------------------------
  test('RECONCILIAÇÃO AGREGAÇÕES: Soma de categorias, destinos, meios de pagamento e costTypes coincide com totalOutflow', () => {
    const finances = {
      profile: { baseSalary: 8000 },
      destinations: [
        { id: 'itau', name: 'Itaú', type: 'bank_account' },
        { id: 'nubank', name: 'Nubank', type: 'bank_account' }
      ],
      fixed: [
        { id: 'f1', name: 'Aluguel', amount: 2000, group: 'Moradia', destinationId: 'itau', payment: { method: 'pix' } },
        { id: 'f2', name: 'Plano de Saúde', amount: 600, group: 'Saúde', destinationId: 'nubank', payment: { method: 'debito_automatico' } }
      ],
      variable: [
        { id: 'v1', name: 'Restaurante', amount: 400, group: 'Lazer', destinationId: 'nubank', paymentMethod: 'cartao_debito', startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 1 }
      ]
    };

    const report = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 1, perspective: 'competence'
    });

    const totalOutflow = 3000;
    assert.strictEqual(report.kpis.totalOutflow, totalOutflow);

    // Categorias
    const catSum = report.categories.reduce((s, c) => s + c.amount, 0);
    assert.strictEqual(catSum, totalOutflow);

    // Destinos
    const destSum = report.destinations.reduce((s, d) => s + d.amount, 0);
    assert.strictEqual(destSum, totalOutflow);

    // Meios de Pagamento
    const paySum = report.paymentMethods.reduce((s, p) => s + p.amount, 0);
    assert.strictEqual(paySum, totalOutflow);

    // Cost Types (Fixos vs Variáveis)
    const costSum = report.costTypes.fixed.amount + report.costTypes.variable.amount;
    assert.strictEqual(costSum, totalOutflow);
    assert.strictEqual(report.costTypes.fixed.amount, 2600);
    assert.strictEqual(report.costTypes.variable.amount, 400);
  });

  // -----------------------------------------------------------------------------
  // RECONCILIAÇÃO 3: Segregação Estrita de Benefícios Corporativos
  // -----------------------------------------------------------------------------
  test('RECONCILIAÇÃO BENEFÍCIOS: Benefícios corporativos (VA/VR) NÃO contaminam totalInflow nem totalOutflow', () => {
    const finances = {
      profile: { baseSalary: 5000 },
      benefitsConfig: {
        amount: 1200,
        va: 600,
        vr: 600
      },
      benefitTransactions: [
        { id: 'bt_1', description: 'Restaurante VR', amount: 85, month: 2, year: 2026, type: 'vr' }
      ]
    };

    const reportComp = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 2, endYear: 2026, endMonth: 2, perspective: 'competence'
    });
    assert.strictEqual(reportComp.kpis.totalInflow, 5000);
    assert.strictEqual(reportComp.kpis.totalOutflow, 0);

    const reportCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 2, endYear: 2026, endMonth: 2, perspective: 'cashflow'
    });
    assert.strictEqual(reportCash.kpis.totalInflow, 5000);
    assert.strictEqual(reportCash.kpis.totalOutflow, 0);
  });

  // -----------------------------------------------------------------------------
  // TESTES DE SEGURANÇA E VALIDAÇÕES DO CONTRATO
  // -----------------------------------------------------------------------------
  // -----------------------------------------------------------------------------
  // TESTES DE SEGURANÇA E CONTRATO DO ENDPOINT HTTP (GET /api/finances/reports)
  // -----------------------------------------------------------------------------
  test('API ENDPOINT: O endpoint GET /api/finances/reports está registrado na aplicação Express', () => {
    const app = require('../server/server');
    const reportsLayer = app._router.stack.find(l => l.route && l.route.path === '/api/finances/reports');
    assert.ok(reportsLayer, 'Rota /api/finances/reports deve estar registrada no router Express');
    assert.ok(reportsLayer.route.methods.get, 'Rota deve aceitar método GET');
  });

  test('API ENDPOINT: Rejeita query params forjados (userId/ownerId/documentId) com 400 FORBIDDEN_USER_QUERY', async () => {
    const app = require('../server/server');
    const reportsLayer = app._router.stack.find(l => l.route && l.route.path === '/api/finances/reports');
    const handler = reportsLayer.route.stack[reportsLayer.route.stack.length - 1].handle;

    const mockReq = {
      user: { id: 'usr_auth_123', nome: 'Usuário Autenticado' },
      query: {
        userId: 'hacker_target',
        startYear: '2026', startMonth: '1', endYear: '2026', endMonth: '2'
      }
    };

    let responseStatus = null;
    let responseBody = null;

    const mockRes = {
      status(code) { responseStatus = code; return this; },
      json(data) { responseBody = data; return this; }
    };

    await handler(mockReq, mockRes);
    assert.strictEqual(responseStatus, 400);
    assert.strictEqual(responseBody.error, 'FORBIDDEN_USER_QUERY');
  });

  test('API ENDPOINT: Rejeita período inválido ou ausente com 400 INVALID_REPORT_PERIOD', async () => {
    const app = require('../server/server');
    const reportsLayer = app._router.stack.find(l => l.route && l.route.path === '/api/finances/reports');
    const handler = reportsLayer.route.stack[reportsLayer.route.stack.length - 1].handle;

    const mockReq = {
      user: { id: 'usr_123', nome: 'Usuário Teste' },
      query: {
        startYear: '2026', startMonth: '5', endYear: '2026', endMonth: '4' // start > end
      }
    };

    let responseStatus = null;
    let responseBody = null;

    const mockRes = {
      status(code) { responseStatus = code; return this; },
      json(data) { responseBody = data; return this; }
    };

    await handler(mockReq, mockRes);
    assert.strictEqual(responseStatus, 400);
    assert.strictEqual(responseBody.error, 'INVALID_REPORT_PERIOD');
  });

  test('API ENDPOINT: Rejeita período maior que 12 meses com 400 REPORT_PERIOD_TOO_LARGE', async () => {
    const app = require('../server/server');
    const reportsLayer = app._router.stack.find(l => l.route && l.route.path === '/api/finances/reports');
    const handler = reportsLayer.route.stack[reportsLayer.route.stack.length - 1].handle;

    const mockReq = {
      user: { id: 'usr_123', nome: 'Usuário Teste' },
      query: {
        startYear: '2026', startMonth: '1', endYear: '2027', endMonth: '2' // 14 meses
      }
    };

    let responseStatus = null;
    let responseBody = null;

    const mockRes = {
      status(code) { responseStatus = code; return this; },
      json(data) { responseBody = data; return this; }
    };

    await handler(mockReq, mockRes);
    assert.strictEqual(responseStatus, 400);
    assert.strictEqual(responseBody.error, 'REPORT_PERIOD_TOO_LARGE');
  });

  test('API ENDPOINT: Rejeita perspectiva inválida com 400 INVALID_REPORT_PERSPECTIVE', async () => {
    const app = require('../server/server');
    const reportsLayer = app._router.stack.find(l => l.route && l.route.path === '/api/finances/reports');
    const handler = reportsLayer.route.stack[reportsLayer.route.stack.length - 1].handle;

    const mockReq = {
      user: { id: 'usr_123', nome: 'Usuário Teste' },
      query: {
        startYear: '2026', startMonth: '1', endYear: '2026', endMonth: '1',
        perspective: 'perspectiva_inexistente'
      }
    };

    let responseStatus = null;
    let responseBody = null;

    const mockRes = {
      status(code) { responseStatus = code; return this; },
      json(data) { responseBody = data; return this; }
    };

    await handler(mockReq, mockRes);
    assert.strictEqual(responseStatus, 400);
    assert.strictEqual(responseBody.error, 'INVALID_REPORT_PERSPECTIVE');
  });

  test('API ENDPOINT: Rejeita acesso com 403 PLAN_ACCESS_DENIED quando entitlement "relatorios" está desabilitado', async () => {
    const app = require('../server/server');
    const reportsLayer = app._router.stack.find(l => l.route && l.route.path === '/api/finances/reports');
    const handler = reportsLayer.route.stack[reportsLayer.route.stack.length - 1].handle;

    const mockReq = {
      user: {
        id: 'usr_free',
        nome: 'Usuário Free',
        entitlements: {
          relatorios: { enabled: false }
        }
      },
      query: {
        startYear: '2026', startMonth: '1', endYear: '2026', endMonth: '2',
        perspective: 'cashflow'
      }
    };

    let responseStatus = null;
    let responseBody = null;

    const mockRes = {
      status(code) { responseStatus = code; return this; },
      json(data) { responseBody = data; return this; }
    };

    await handler(mockReq, mockRes);
    assert.strictEqual(responseStatus, 403);
    assert.strictEqual(responseBody.error, 'PLAN_ACCESS_DENIED');
  });

  test('API ENDPOINT: Sucesso: retorna 200 OK com contrato estruturado e determinístico', async () => {
    const app = require('../server/server');
    const mongoStorage = require('../server/services/mongoStorage');
    const reportsLayer = app._router.stack.find(l => l.route && l.route.path === '/api/finances/reports');
    const handler = reportsLayer.route.stack[reportsLayer.route.stack.length - 1].handle;

    // Salva mock de finanças em memória para o usuário
    const mockFinances = {
      profile: { baseSalary: 7500 },
      fixed: [{ id: 'f_net', name: 'Internet', amount: 150, versions: [{ year: 2026, month: 1, amount: 150 }] }]
    };

    const origGetUserFinances = mongoStorage.getUserFinances;
    mongoStorage.getUserFinances = async (userId) => {
      if (userId === 'usr_ok') return mockFinances;
      return origGetUserFinances(userId);
    };

    try {
      const mockReq = {
        user: {
          id: 'usr_ok',
          nome: 'Usuário Pro',
          entitlements: {
            relatorios: { enabled: true }
          }
        },
        query: {
          startYear: '2026', startMonth: '1', endYear: '2026', endMonth: '3',
          perspective: 'competence'
        }
      };

      let responseStatus = 200;
      let responseBody = null;

      const mockRes = {
        status(code) { responseStatus = code; return this; },
        json(data) { responseBody = data; return this; }
      };

      await handler(mockReq, mockRes);
      assert.strictEqual(responseStatus, 200);
      assert.ok(responseBody, 'Resposta deve conter corpo JSON');
      assert.strictEqual(responseBody.perspective, 'competence');
      assert.strictEqual(responseBody.period.months, 3);
      assert.strictEqual(responseBody.period.start, '2026-01');
      assert.strictEqual(responseBody.period.end, '2026-03');
      assert.strictEqual(responseBody.kpis.totalInflow, 22500); // 7500 * 3
      assert.strictEqual(responseBody.kpis.totalOutflow, 450);  // 150 * 3
      assert.strictEqual(responseBody.kpis.netResult, 22050);
      assert.strictEqual(responseBody.kpis.savingsRate, 98);
    } finally {
      mongoStorage.getUserFinances = origGetUserFinances;
    }
  });

  // -----------------------------------------------------------------------------
  // TESTES R2.1: PERMISSÃO INDIVIDUAL (EFFECTIVE ACCESS)
  // -----------------------------------------------------------------------------
  test('API ENDPOINT: Rejeita acesso com 403 PLAN_ACCESS_DENIED quando permissão individual do usuário é relatorios === false (Effective Access)', async () => {
    const app = require('../server/server');
    const reportsLayer = app._router.stack.find(l => l.route && l.route.path === '/api/finances/reports');
    const handler = reportsLayer.route.stack[reportsLayer.route.stack.length - 1].handle;

    const mockReq = {
      user: {
        id: 'usr_plan_ok_perm_denied',
        nome: 'Usuário com Plano Pro mas sem Permissão',
        entitlements: {
          relatorios: { enabled: true }
        },
        permissions: {
          relatorios: false // Permissão individual revogada
        }
      },
      query: {
        startYear: '2026', startMonth: '1', endYear: '2026', endMonth: '2',
        perspective: 'cashflow'
      }
    };

    let responseStatus = null;
    let responseBody = null;
    const mockRes = {
      status(code) { responseStatus = code; return this; },
      json(data) { responseBody = data; return this; }
    };

    await handler(mockReq, mockRes);
    assert.strictEqual(responseStatus, 403);
    assert.strictEqual(responseBody.error, 'PLAN_ACCESS_DENIED');
  });

  test('API ENDPOINT: Permite acesso quando entitlement=true e individual permission=true (Effective Access positivo)', async () => {
    const app = require('../server/server');
    const mongoStorage = require('../server/services/mongoStorage');
    const reportsLayer = app._router.stack.find(l => l.route && l.route.path === '/api/finances/reports');
    const handler = reportsLayer.route.stack[reportsLayer.route.stack.length - 1].handle;

    const mockFinances = { profile: { baseSalary: 4000 } };
    const origGetUserFinances = mongoStorage.getUserFinances;
    mongoStorage.getUserFinances = async () => mockFinances;

    try {
      const mockReq = {
        user: {
          id: 'usr_both_allowed',
          nome: 'Usuário Acesso Total',
          entitlements: { relatorios: { enabled: true } },
          permissions: { relatorios: true }
        },
        query: {
          startYear: '2026', startMonth: '1', endYear: '2026', endMonth: '1'
        }
      };

      let responseStatus = null;
      let responseBody = null;
      const mockRes = {
        status(code) { responseStatus = code; return this; },
        json(data) { responseBody = data; return this; }
      };

      await handler(mockReq, mockRes);
      assert.strictEqual(responseStatus || 200, 200);
      assert.ok(responseBody, 'Deve retornar JSON do relatório');
    } finally {
      mongoStorage.getUserFinances = origGetUserFinances;
    }
  });

  // -----------------------------------------------------------------------------
  // TESTES R2.1: MAINTENANCE
  // -----------------------------------------------------------------------------
  test('API ENDPOINT: Bloqueia com 503 MODULE_MAINTENANCE quando relatorios está em manutenção', async () => {
    const app = require('../server/server');
    const mongoStorage = require('../server/services/mongoStorage');
    const reportsLayer = app._router.stack.find(l => l.route && l.route.path === '/api/finances/reports');
    const handler = reportsLayer.route.stack[reportsLayer.route.stack.length - 1].handle;

    const origGetMaintenance = mongoStorage.getMaintenanceConfig;
    mongoStorage.getMaintenanceConfig = async () => ({
      relatorios: { maintenance: true, name: 'Relatórios' }
    });

    try {
      const mockReq = {
        user: {
          id: 'usr_ok',
          entitlements: { relatorios: { enabled: true } }
        },
        query: {
          startYear: '2026', startMonth: '1', endYear: '2026', endMonth: '1'
        }
      };

      let responseStatus = null;
      let responseBody = null;
      const mockRes = {
        status(code) { responseStatus = code; return this; },
        json(data) { responseBody = data; return this; }
      };

      await handler(mockReq, mockRes);
      assert.strictEqual(responseStatus, 503);
      assert.strictEqual(responseBody.error, 'MODULE_MAINTENANCE');
    } finally {
      mongoStorage.getMaintenanceConfig = origGetMaintenance;
    }
  });

  test('API ENDPOINT: Não bloqueia por manutenção quando relatorios maintenance é false', async () => {
    const app = require('../server/server');
    const mongoStorage = require('../server/services/mongoStorage');
    const reportsLayer = app._router.stack.find(l => l.route && l.route.path === '/api/finances/reports');
    const handler = reportsLayer.route.stack[reportsLayer.route.stack.length - 1].handle;

    const mockFinances = { profile: { baseSalary: 3000 } };
    const origGetUserFinances = mongoStorage.getUserFinances;
    const origGetMaintenance = mongoStorage.getMaintenanceConfig;
    mongoStorage.getUserFinances = async () => mockFinances;
    mongoStorage.getMaintenanceConfig = async () => ({
      relatorios: { maintenance: false, name: 'Relatórios' }
    });

    try {
      const mockReq = {
        user: {
          id: 'usr_ok',
          entitlements: { relatorios: { enabled: true } }
        },
        query: {
          startYear: '2026', startMonth: '1', endYear: '2026', endMonth: '1'
        }
      };

      let responseStatus = 200;
      const mockRes = {
        status(code) { responseStatus = code; return this; },
        json() { return this; }
      };

      await handler(mockReq, mockRes);
      assert.strictEqual(responseStatus, 200);
    } finally {
      mongoStorage.getUserFinances = origGetUserFinances;
      mongoStorage.getMaintenanceConfig = origGetMaintenance;
    }
  });

  // -----------------------------------------------------------------------------
  // TESTES R2.1: INVARIANTES MATEMÁTICAS (netResult e série temporal)
  // -----------------------------------------------------------------------------
  test('RECONCILIAÇÃO MATEMÁTICA: totalInflow - totalOutflow === netResult e soma mensal === total acumulado', () => {
    const finances = {
      profile: { baseSalary: 6250.75 },
      fixed: [
        { id: 'f1', name: 'Aluguel', amount: 1800.50, versions: [{ year: 2026, month: 1, amount: 1800.50 }] },
        { id: 'f2', name: 'Internet', amount: 120.30, versions: [{ year: 2026, month: 1, amount: 120.30 }] }
      ],
      variable: [
        { id: 'v1', name: 'Compras', amount: 350.25, installments: 3, startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 3 }
      ],
      debtors: [
        { id: 'd1', debtorName: 'José', amount: 400.00, countInTotal: true, startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 3 }
      ]
    };

    for (const perspective of ['cashflow', 'competence']) {
      const report = generateFinancialReport(finances, {
        startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 3, perspective
      });

      const { totalInflow, totalOutflow, netResult } = report.kpis;

      // 1. Invariante fundamental do resultado líquido
      const expectedNet = Math.round((totalInflow - totalOutflow) * 100) / 100;
      assert.strictEqual(netResult, expectedNet, `netResult deve ser exatamente totalInflow - totalOutflow na perspectiva ${perspective}`);

      // 2. Invariante da série temporal acumulada
      const sumTimelineInflow = Math.round(report.monthlyTimeline.reduce((s, m) => s + m.inflow, 0) * 100) / 100;
      const sumTimelineOutflow = Math.round(report.monthlyTimeline.reduce((s, m) => s + m.outflow, 0) * 100) / 100;
      const sumTimelineNet = Math.round(report.monthlyTimeline.reduce((s, m) => s + m.netResult, 0) * 100) / 100;

      assert.strictEqual(sumTimelineInflow, totalInflow, `Soma da timeline de inflow deve coincidir com kpis.totalInflow (${perspective})`);
      assert.strictEqual(sumTimelineOutflow, totalOutflow, `Soma da timeline de outflow deve coincidir com kpis.totalOutflow (${perspective})`);
      assert.strictEqual(sumTimelineNet, netResult, `Soma da timeline de netResult deve coincidir com kpis.netResult (${perspective})`);
    }
  });

  // -----------------------------------------------------------------------------
  // TESTES R2.1: INVARIANTE PAID + PENDING
  // -----------------------------------------------------------------------------
  test('INVARIANTE PAID + PENDING: paidAmount + remainingAmount === amount em paid, partial, pending e no agregado de settlement', () => {
    // 1. Prova para status pago integral
    const fullSettlement = FinanceDomain.calculatePaymentSettlement(500, 500, { isMarkedPaid: true });
    assert.strictEqual(fullSettlement.paidAmount + fullSettlement.remainingAmount, 500);

    // 2. Prova para status parcial
    const partialSettlement = FinanceDomain.calculatePaymentSettlement(500, 200, {});
    assert.strictEqual(partialSettlement.paidAmount + partialSettlement.remainingAmount, 500);

    // 3. Prova para status pendente
    const pendingSettlement = FinanceDomain.calculatePaymentSettlement(500, 0, {});
    assert.strictEqual(pendingSettlement.paidAmount + pendingSettlement.remainingAmount, 500);

    // 4. Prova do agregado na perspectiva COMPETENCE (onde todas as despesas são obrigações de liquidação)
    const finances = {
      profile: { baseSalary: 5000 },
      fixed: [
        { id: 'f_p', name: 'Pago', amount: 300, versions: [{ year: 2026, month: 1, amount: 300 }], paidHistory: { '2026-01': true } },
        { id: 'f_par', name: 'Parcial', amount: 400, versions: [{ year: 2026, month: 1, amount: 400 }], paidHistory: { '2026-01': { paidAmount: 150 } } },
        { id: 'f_pend', name: 'Pendente', amount: 500, versions: [{ year: 2026, month: 1, amount: 500 }] }
      ]
    };

    const reportComp = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 1, perspective: 'competence'
    });

    // Na competência: totalPaid (300 + 150 = 450) + totalPending (0 + 250 + 500 = 750) === totalOutflow (1200)
    assert.strictEqual(reportComp.kpis.totalPaid + reportComp.kpis.totalPending, reportComp.kpis.totalOutflow);

    // 5. Prova do agregado na perspectiva CASHFLOW sobre as obrigações que afetam o caixa bancário
    const reportCash = generateFinancialReport(finances, {
      startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 1, perspective: 'cashflow'
    });
    assert.strictEqual(reportCash.kpis.totalPaid + reportCash.kpis.totalPending, reportCash.kpis.totalOutflow);
  });

  after(() => {
    setTimeout(() => {
      process.exit(0);
    }, 50).unref();
  });

});


