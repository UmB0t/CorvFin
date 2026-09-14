/**
 * Suíte Oficial de Testes — CORVFIN V2 — LOTE A2
 * MOTOR CANÔNICO DE PROJEÇÃO TEMPORAL (financeProjectionService.js)
 *
 * Cobertura Completa dos 37 Cenários Obrigatórios:
 * 1. Mês vazio retorna arrays e resumo zerado
 * 2. Fixed com dueDay projeta evento com data civil correspondente
 * 3. Fixed com dueDay 31 em fevereiro comum (2026) aplica clamp para 28
 * 4. Fixed com dueDay 31 em fevereiro bissexto (2024) aplica clamp para 29
 * 5. Fixed sem dueDay vai para undated com date: null
 * 6. Fixed fora da recorrência é ausente na projeção
 * 7. Fixed encerrada (endedFrom atingido) é ausente na projeção
 * 8. Variable one-time (à vista / installments 1) projeta ocorrência única
 * 9. Variable parcelada projeta parcela da competência com índice e total
 * 10. Distribuição de valores preservada (invariante de centavos determinística)
 * 11. Variable sem data resolvível vai para undated
 * 12. paidHistory canonical (YYYY-MM) lido corretamente
 * 13. paidHistory legacy (YYYY-M) lido corretamente
 * 14. Status pending refletido corretamente
 * 15. Status partial refletido corretamente
 * 16. Status paid refletido corretamente
 * 17. Extra pontual com receiveDate projeta data civil exata em events
 * 18. Extra recorrente com receiveDay projeta data civil no mês em events
 * 19. Extra com receiveDay 31 aplica clamp em mês de 30 dias (abril)
 * 20. Extra legacy sem receiveDate e sem receiveDay vai para undated
 * 21. Debtor com receiveDay projeta data civil no mês em events
 * 22. Debtor com receiveDay 31 aplica clamp em mês de 30 dias (abril)
 * 23. Debtor legacy sem receiveDay vai para undated
 * 24. Salário base projetado em inflow a partir de profile.baseSalary
 * 25. Override mensal de salário via incomes tem precedência sobre baseSalary
 * 26. Salário com fixed_day projeta data civil correspondente
 * 27. Salário sem salaryPayment vai para undated com date: null
 * 28. Final de semana não sofre deslocamento automático (data nominal)
 * 29. Benefits estritamente separados em benefits.events e benefits.undated
 * 30. Benefits não alteram o resumo bancário (summary.inflow/outflow/net)
 * 31. occurrenceKey é determinística e estável entre múltiplas execuções
 * 32. Ordenação determinística de events e undated
 * 33. Imutabilidade: input finances não sofre mutação (deepEqual antes e depois)
 * 34. month inválido rejeitado com erro fail-closed
 * 35. year inválido rejeitado com erro fail-closed
 * 36. Nenhum evento possui data inválida
 * 37. Nenhum amount produzido é NaN ou não-finito
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const {
  projectFinancialMonth,
  projectSalary,
  projectFixedExpenses,
  projectVariableExpenses,
  projectExtras,
  projectDebtors,
  projectBenefits,
  validatePeriod,
  sanitizeAmount,
  mapPaymentStatus
} = require('../server/services/financeProjectionService');
const { isValidCanonicalDateString } = require('../server/services/temporalUtils');

describe('CORVFIN V2 — LOTE A2 — MOTOR CANÔNICO DE PROJEÇÃO TEMPORAL', () => {

  // 1. Mês vazio
  test('1. Mês vazio retorna estrutura normalizada com listas vazias e resumo zerado', () => {
    const finances = {};
    const res = projectFinancialMonth(finances, 2026, 9);

    assert.strictEqual(res.year, 2026);
    assert.strictEqual(res.month, 9);
    assert.strictEqual(res.competence, '2026-09');
    assert.deepStrictEqual(res.events, []);
    assert.deepStrictEqual(res.undated, []);
    assert.deepStrictEqual(res.summary, { inflow: 0, outflow: 0, net: 0 });
    assert.deepStrictEqual(res.benefits, {
      events: [],
      undated: [],
      summary: { inflow: 0, outflow: 0, net: 0 }
    });
  });

  // 2. Fixed com dueDay
  test('2. Fixed com dueDay projeta evento datado com direção outflow', () => {
    const finances = {
      fixed: [
        {
          id: 'fix_internet',
          name: 'Internet Fibra',
          amount: 120,
          dueDay: 10,
          versions: [{ year: 2026, month: 1, amount: 120 }]
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 1);
    assert.strictEqual(res.undated.length, 0);

    const ev = res.events[0];
    assert.strictEqual(ev.sourceId, 'fix_internet');
    assert.strictEqual(ev.sourceType, 'fixed_expense');
    assert.strictEqual(ev.direction, 'outflow');
    assert.strictEqual(ev.date, '2026-09-10');
    assert.strictEqual(ev.amount, 120);
    assert.strictEqual(ev.status, 'pending');
    assert.strictEqual(res.summary.outflow, 120);
    assert.strictEqual(res.summary.net, -120);
  });

  // 3. Fixed dueDay 31 em fevereiro comum
  test('3. Fixed com dueDay 31 em fevereiro comum (2026) aplica clamp para 2026-02-28', () => {
    const finances = {
      fixed: [
        {
          id: 'fix_aluguel',
          name: 'Aluguel',
          amount: 1500,
          dueDay: 31,
          versions: [{ year: 2026, month: 1, amount: 1500 }]
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 2);
    assert.strictEqual(res.events.length, 1);
    const ev = res.events[0];
    assert.strictEqual(ev.date, '2026-02-28');
    assert.strictEqual(ev.nominalDay, 31);
    assert.strictEqual(ev.wasClamped, true);
    assert.strictEqual(ev.amount, 1500);
  });

  // 4. Fixed dueDay 31 em fevereiro bissexto
  test('4. Fixed com dueDay 31 em fevereiro bissexto (2024) aplica clamp para 2024-02-29', () => {
    const finances = {
      fixed: [
        {
          id: 'fix_aluguel',
          name: 'Aluguel',
          amount: 1400,
          dueDay: 31,
          versions: [{ year: 2024, month: 1, amount: 1400 }]
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2024, 2);
    assert.strictEqual(res.events.length, 1);
    const ev = res.events[0];
    assert.strictEqual(ev.date, '2024-02-29');
    assert.strictEqual(ev.nominalDay, 31);
    assert.strictEqual(ev.wasClamped, true);
    assert.strictEqual(ev.amount, 1400);
  });

  // 5. Fixed sem dueDay -> undated
  test('5. Fixed sem dueDay vai para undated com date null', () => {
    const finances = {
      fixed: [
        {
          id: 'fix_academia',
          name: 'Academia',
          amount: 90,
          dueDay: null,
          versions: [{ year: 2026, month: 1, amount: 90 }]
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 0);
    assert.strictEqual(res.undated.length, 1);
    const ev = res.undated[0];
    assert.strictEqual(ev.sourceId, 'fix_academia');
    assert.strictEqual(ev.date, null);
    assert.strictEqual(ev.amount, 90);
    // Summary bancário contabiliza undated
    assert.strictEqual(res.summary.outflow, 90);
    assert.strictEqual(res.summary.net, -90);
  });

  // 6. Fixed fora da recorrência -> ausente
  test('6. Fixed antes do início ou após o término de recorrência é ausente na projeção', () => {
    const finances = {
      fixed: [
        {
          id: 'fix_curso',
          name: 'Curso Inglês',
          amount: 250,
          dueDay: 15,
          versions: [{ year: 2026, month: 5, amount: 250 }], // Inicia em maio/2026
          temporal: {
            type: 'fixed',
            recurrence: { type: 'count', count: 4 } // 4 meses: maio, junho, julho, agosto/2026
          }
        }
      ]
    };

    // 1. Antes do início (abril/2026) -> ausente
    const resBefore = projectFinancialMonth(finances, 2026, 4);
    assert.strictEqual(resBefore.events.length, 0);

    // 2. Durante a vigência (agosto/2026 - 4ª ocorrência) -> presente
    const resActive = projectFinancialMonth(finances, 2026, 8);
    assert.strictEqual(resActive.events.length, 1);
    assert.strictEqual(resActive.events[0].amount, 250);

    // 3. Após o término (setembro/2026 - 5º mês) -> ausente
    const resAfter = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(resAfter.events.length, 0);
  });

  // 7. Fixed encerrada -> ausente
  test('7. Fixed com endedFrom atingido é ausente na projeção', () => {
    const finances = {
      fixed: [
        {
          id: 'fix_plano_velho',
          name: 'Plano Antigo',
          amount: 80,
          dueDay: 20,
          versions: [{ year: 2026, month: 1, amount: 80 }],
          endedFrom: { year: 2026, month: 7 } // Encerrado a partir de julho/2026
        }
      ]
    };

    // Junho (último mês ativo) -> presente
    const resJun = projectFinancialMonth(finances, 2026, 6);
    assert.strictEqual(resJun.events.length, 1);

    // Julho (primeiro mês inativo) -> ausente
    const resJul = projectFinancialMonth(finances, 2026, 7);
    assert.strictEqual(resJul.events.length, 0);

    // Setembro -> ausente
    const resSep = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(resSep.events.length, 0);
  });

  // 8. Variable one-time
  test('8. Variable à vista com transactionDate na competência projeta ocorrência datada', () => {
    const finances = {
      variable: [
        {
          id: 'var_almoco',
          name: 'Almoço Restaurante',
          amount: 55.50,
          paymentMethod: 'pix',
          installments: 1,
          startYear: 2026,
          startMonth: 9,
          transactionDate: '2026-09-11'
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 1);
    const ev = res.events[0];
    assert.strictEqual(ev.sourceId, 'var_almoco');
    assert.strictEqual(ev.sourceType, 'variable_expense');
    assert.strictEqual(ev.direction, 'outflow');
    assert.strictEqual(ev.date, '2026-09-11');
    assert.strictEqual(ev.amount, 55.50);
    assert.strictEqual(ev.transactionDate, '2026-09-11');
  });

  // 9. Variable parcelada
  test('9. Variable parcelada projeta parcela com installmentIndex, installmentTotal e dueDay', () => {
    const finances = {
      variable: [
        {
          id: 'var_tv',
          name: 'Smart TV',
          totalAmount: 2400,
          installments: 4,
          startYear: 2026,
          startMonth: 8,
          endYear: 2026,
          endMonth: 11,
          dueDay: 15
        }
      ]
    };

    // Consulta mês 9 (setembro = 2ª parcela)
    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 1);
    const ev = res.events[0];
    assert.strictEqual(ev.sourceId, 'var_tv');
    assert.strictEqual(ev.date, '2026-09-15');
    assert.strictEqual(ev.amount, 600);
    assert.strictEqual(ev.installmentIndex, 2);
    assert.strictEqual(ev.installmentTotal, 4);
  });

  // 10. Distribuição de valores preservada (centavos determinísticos)
  test('10. Distribuição de valores preserva 100/3x (33,34 na 1ª e 33,33 nas restantes)', () => {
    const finances = {
      variable: [
        {
          id: 'var_centavos',
          name: 'Compra 100 Reais',
          totalAmount: 100,
          amountInputMode: 'total',
          installments: 3,
          startYear: 2026,
          startMonth: 8,
          endYear: 2026,
          endMonth: 10,
          dueDay: 10
        }
      ]
    };

    // Parcela 1 (agosto): 33.34
    const resAug = projectFinancialMonth(finances, 2026, 8);
    assert.strictEqual(resAug.events[0].amount, 33.34);

    // Parcela 2 (setembro): 33.33
    const resSep = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(resSep.events[0].amount, 33.33);

    // Parcela 3 (outubro): 33.33
    const resOct = projectFinancialMonth(finances, 2026, 10);
    assert.strictEqual(resOct.events[0].amount, 33.33);

    // Soma exata dos 3 meses = 100.00
    assert.strictEqual(resAug.events[0].amount + resSep.events[0].amount + resOct.events[0].amount, 100);
  });

  // 11. Variable sem data resolvível -> undated
  test('11. Variable parcelada sem dueDay vai para undated com date null', () => {
    const finances = {
      variable: [
        {
          id: 'var_nodate',
          name: 'Parcelamento Sem Vencimento',
          amount: 200,
          installments: 2,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 10
          // sem dueDay
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 0);
    assert.strictEqual(res.undated.length, 1);
    assert.strictEqual(res.undated[0].date, null);
    assert.strictEqual(res.undated[0].amount, 200);
    assert.strictEqual(res.summary.outflow, 200);
  });

  // 12. paidHistory canonical (YYYY-MM)
  test('12. paidHistory canonical (YYYY-MM) reconhecido com valor pago integral', () => {
    const finances = {
      fixed: [
        {
          id: 'fix_luz',
          name: 'Energia Elétrica',
          amount: 220,
          dueDay: 18,
          versions: [{ year: 2026, month: 1, amount: 220 }],
          paidHistory: {
            '2026-09': 220
          }
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    const ev = res.events[0];
    assert.strictEqual(ev.status, 'paid');
    assert.strictEqual(ev.paidAmount, 220);
    assert.strictEqual(ev.remainingAmount, 0);
  });

  // 13. paidHistory legacy (YYYY-M)
  test('13. paidHistory legacy (YYYY-M) tolerado e lido corretamente sem mutação', () => {
    const finances = {
      fixed: [
        {
          id: 'fix_agua',
          name: 'Água',
          amount: 95,
          dueDay: 12,
          versions: [{ year: 2026, month: 1, amount: 95 }],
          paidHistory: {
            '2026-9': 95 // Chave legada
          }
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    const ev = res.events[0];
    assert.strictEqual(ev.status, 'paid');
    assert.strictEqual(ev.paidAmount, 95);
    assert.strictEqual(ev.remainingAmount, 0);
  });

  // 14. Status pending
  test('14. Item sem registro no paidHistory reflete status pending', () => {
    const finances = {
      fixed: [
        {
          id: 'fix_condominio',
          name: 'Condomínio',
          amount: 450,
          dueDay: 5,
          versions: [{ year: 2026, month: 1, amount: 450 }]
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    const ev = res.events[0];
    assert.strictEqual(ev.status, 'pending');
    assert.strictEqual(ev.paidAmount, 0);
    assert.strictEqual(ev.remainingAmount, 450);
  });

  // 15. Status partial
  test('15. Item com pagamento parcial reflete status partial e valores corretos', () => {
    const finances = {
      fixed: [
        {
          id: 'fix_escola',
          name: 'Escola',
          amount: 1000,
          dueDay: 10,
          versions: [{ year: 2026, month: 1, amount: 1000 }],
          paidHistory: {
            '2026-09': 400 // Pago R$ 400 de R$ 1000
          }
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    const ev = res.events[0];
    assert.strictEqual(ev.status, 'partial');
    assert.strictEqual(ev.paidAmount, 400);
    assert.strictEqual(ev.remainingAmount, 600);
  });

  // 16. Status paid
  test('16. Item com pagamento total ou objeto com status pago reflete status paid', () => {
    const finances = {
      variable: [
        {
          id: 'var_mercado',
          name: 'Supermercado',
          amount: 320,
          dueDay: 20,
          installments: 1,
          startYear: 2026,
          startMonth: 9,
          paidHistory: {
            '2026-09': { paidAmount: 320, status: 'pago' }
          }
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    const ev = res.events[0];
    assert.strictEqual(ev.status, 'paid');
    assert.strictEqual(ev.paidAmount, 320);
    assert.strictEqual(ev.remainingAmount, 0);
  });

  // 17. Extra pontual receiveDate
  test('17. Extra pontual com receiveDate projeta data civil exata em events com direction inflow', () => {
    const finances = {
      extras: [
        {
          id: 'ext_freela',
          title: 'Freelance Website',
          amount: 1800,
          startYear: 2026,
          startMonth: 9,
          receiveDate: '2026-09-22'
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 1);
    const ev = res.events[0];
    assert.strictEqual(ev.sourceId, 'ext_freela');
    assert.strictEqual(ev.sourceType, 'extra_income');
    assert.strictEqual(ev.direction, 'inflow');
    assert.strictEqual(ev.date, '2026-09-22');
    assert.strictEqual(ev.amount, 1800);
    assert.strictEqual(res.summary.inflow, 1800);
    assert.strictEqual(res.summary.net, 1800);
  });

  // 18. Extra recorrente receiveDay
  test('18. Extra recorrente com receiveDay projeta data civil com clamp no mês', () => {
    const finances = {
      extras: [
        {
          id: 'ext_aluguel_vaga',
          title: 'Aluguel Vaga Garagem',
          amount: 250,
          startYear: 2026,
          startMonth: 1,
          endYear: 2026,
          endMonth: 12,
          receiveDay: 15
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 1);
    const ev = res.events[0];
    assert.strictEqual(ev.date, '2026-09-15');
    assert.strictEqual(ev.amount, 250);
    assert.strictEqual(ev.direction, 'inflow');
  });

  // 19. Extra dia 31 clamp
  test('19. Extra com receiveDay 31 aplica clamp em mês de 30 dias (abril)', () => {
    const finances = {
      extras: [
        {
          id: 'ext_clamp',
          title: 'Rendimento Mensal',
          amount: 300,
          startYear: 2026,
          startMonth: 1,
          endYear: 2026,
          endMonth: 12,
          receiveDay: 31
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 4);
    assert.strictEqual(res.events.length, 1);
    const ev = res.events[0];
    assert.strictEqual(ev.date, '2026-04-30');
    assert.strictEqual(ev.nominalDay, 31);
    assert.strictEqual(ev.wasClamped, true);
  });

  // 20. Extra legacy -> undated
  test('20. Extra legacy sem receiveDate e sem receiveDay vai para undated com date null', () => {
    const finances = {
      extras: [
        {
          id: 'ext_legacy',
          title: 'Bico Passado',
          amount: 150,
          startYear: 2026,
          startMonth: 9
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 0);
    assert.strictEqual(res.undated.length, 1);
    const ev = res.undated[0];
    assert.strictEqual(ev.sourceId, 'ext_legacy');
    assert.strictEqual(ev.date, null);
    assert.strictEqual(ev.amount, 150);
    assert.strictEqual(res.summary.inflow, 150);
  });

  // 21. Debtor receiveDay
  test('21. Debtor com receiveDay projeta data civil no mês com direction inflow', () => {
    const finances = {
      debtors: [
        {
          id: 'deb_carlos',
          debtorName: 'Carlos',
          title: 'Empréstimo',
          amount: 300,
          startYear: 2026,
          startMonth: 8,
          endYear: 2026,
          endMonth: 10,
          receiveDay: 25,
          countInTotal: true
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 1);
    const ev = res.events[0];
    assert.strictEqual(ev.sourceId, 'deb_carlos');
    assert.strictEqual(ev.sourceType, 'debtor_receivable');
    assert.strictEqual(ev.direction, 'inflow');
    assert.strictEqual(ev.date, '2026-09-25');
    assert.strictEqual(ev.amount, 300);
    assert.strictEqual(ev.installmentIndex, 2);
    assert.strictEqual(ev.installmentTotal, 3);
    assert.strictEqual(res.summary.inflow, 300);
  });

  // 22. Debtor dia 31 clamp
  test('22. Debtor com receiveDay 31 aplica clamp em mês de 30 dias (abril)', () => {
    const finances = {
      debtors: [
        {
          id: 'deb_clamp',
          debtorName: 'Mariana',
          amount: 200,
          startYear: 2026,
          startMonth: 1,
          endYear: 2026,
          endMonth: 12,
          receiveDay: 31
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 4);
    assert.strictEqual(res.events.length, 1);
    const ev = res.events[0];
    assert.strictEqual(ev.date, '2026-04-30');
    assert.strictEqual(ev.nominalDay, 31);
    assert.strictEqual(ev.wasClamped, true);
  });

  // 23. Debtor legacy -> undated
  test('23. Debtor legacy sem receiveDay vai para undated com date null', () => {
    const finances = {
      debtors: [
        {
          id: 'deb_legacy',
          debtorName: 'Beto',
          amount: 100,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          countInTotal: true
          // sem receiveDay
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 0);
    assert.strictEqual(res.undated.length, 1);
    assert.strictEqual(res.undated[0].date, null);
    assert.strictEqual(res.undated[0].amount, 100);
    assert.strictEqual(res.summary.inflow, 100);
  });

  // 24. Salário base
  test('24. Salário base projetado em inflow a partir de profile.baseSalary', () => {
    const finances = {
      profile: {
        baseSalary: 5000,
        salaryPayment: { type: 'fixed_day', day: 5 }
      }
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 1);
    const ev = res.events[0];
    assert.strictEqual(ev.sourceType, 'salary');
    assert.strictEqual(ev.direction, 'inflow');
    assert.strictEqual(ev.amount, 5000);
    assert.strictEqual(ev.date, '2026-09-05');
    assert.strictEqual(res.summary.inflow, 5000);
  });

  // 25. Override mensal de salário
  test('25. incomes mensal sobrescreve baseSalary com precedência oficial', () => {
    const finances = {
      profile: {
        baseSalary: 5000,
        salaryPayment: { type: 'fixed_day', day: 5 }
      },
      incomes: {
        '2026-09': 6500 // Bônus ou aumento no mês 9
      }
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 1);
    const ev = res.events[0];
    assert.strictEqual(ev.amount, 6500);
    assert.strictEqual(res.summary.inflow, 6500);
  });

  // 26. Salário fixed_day com clamp
  test('26. Salário com fixed_day 31 em fevereiro (2026) aplica clamp para 2026-02-28', () => {
    const finances = {
      profile: {
        baseSalary: 4200,
        salaryPayment: { type: 'fixed_day', day: 31 }
      }
    };

    const res = projectFinancialMonth(finances, 2026, 2);
    assert.strictEqual(res.events.length, 1);
    assert.strictEqual(res.events[0].date, '2026-02-28');
    assert.strictEqual(res.events[0].wasClamped, true);
  });

  // 27. Salário sem salaryPayment -> undated
  test('27. Salário configurado sem salaryPayment vai para undated com date null', () => {
    const finances = {
      profile: {
        baseSalary: 4000
        // sem salaryPayment
      }
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 0);
    assert.strictEqual(res.undated.length, 1);
    const ev = res.undated[0];
    assert.strictEqual(ev.sourceType, 'salary');
    assert.strictEqual(ev.date, null);
    assert.strictEqual(ev.amount, 4000);
    assert.strictEqual(res.summary.inflow, 4000);
  });

  // 28. Final de semana sem deslocamento (data nominal V1)
  test('28. Final de semana não sofre deslocamento automático (permanece dia nominal civil)', () => {
    // 05/07/2026 é um domingo no calendário gregoriano
    const finances = {
      profile: {
        baseSalary: 3000,
        salaryPayment: { type: 'fixed_day', day: 5 }
      }
    };

    const res = projectFinancialMonth(finances, 2026, 7);
    assert.strictEqual(res.events[0].date, '2026-07-05', 'Dia 5 permanece dia 5 mesmo caindo em domingo');
  });

  // 29. Benefits separados
  test('29. Benefits segregados em benefits.events e benefits.undated', () => {
    const finances = {
      benefitTransactions: [
        { id: 'ben_mercado', description: 'Supermercado VR', amount: 85.00, day: 12, month: 9, year: 2026, category: 'vr' },
        { id: 'ben_padaria', description: 'Padaria VA', amount: 30.00, day: null, month: 9, year: 2026, category: 'va' } // sem dia
      ],
      benefitsConfig: {
        amount: 800 // Recarga mensal de benefícios
      }
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.benefits.events.length, 1);
    assert.strictEqual(res.benefits.events[0].sourceId, 'ben_mercado');
    assert.strictEqual(res.benefits.events[0].date, '2026-09-12');
    assert.strictEqual(res.benefits.events[0].amount, 85);

    // 2 itens em undated de benefícios: transação sem dia e recarga de benefícios
    assert.strictEqual(res.benefits.undated.length, 2);
    assert.strictEqual(res.benefits.summary.outflow, 115);
    assert.strictEqual(res.benefits.summary.inflow, 800);
    assert.strictEqual(res.benefits.summary.net, 685);
  });

  // 30. Benefits não alteram summary bancário
  test('30. Transações e créditos de benefícios NÃO afetam summary bancário', () => {
    const finances = {
      fixed: [
        { id: 'fix_1', name: 'Aluguel', amount: 1000, dueDay: 10, versions: [{ year: 2026, month: 1, amount: 1000 }] }
      ],
      profile: {
        baseSalary: 3000,
        salaryPayment: { type: 'fixed_day', day: 5 }
      },
      benefitTransactions: [
        { id: 'ben_1', description: 'Almoço VA', amount: 500, day: 15, month: 9, year: 2026 }
      ],
      benefitsConfig: {
        amount: 1200
      }
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    // Summary bancário considera APENAS salário (3000) e aluguel (1000)
    assert.strictEqual(res.summary.inflow, 3000);
    assert.strictEqual(res.summary.outflow, 1000);
    assert.strictEqual(res.summary.net, 2000);

    // O summary de benefícios é isolado
    assert.strictEqual(res.benefits.summary.inflow, 1200);
    assert.strictEqual(res.benefits.summary.outflow, 500);
  });

  // 31. occurrenceKey determinística
  test('31. occurrenceKey é determinística e idêntica em múltiplas chamadas', () => {
    const finances = {
      fixed: [{ id: 'f_100', name: 'Net', amount: 100, dueDay: 10, versions: [{ year: 2026, month: 1, amount: 100 }] }],
      variable: [{ id: 'v_200', name: 'Celular', amount: 200, installments: 2, startYear: 2026, startMonth: 9, dueDay: 15 }],
      extras: [{ id: 'e_300', title: 'Freela', amount: 300, receiveDate: '2026-09-20' }],
      debtors: [{ id: 'd_400', debtorName: 'Marcos', amount: 400, startYear: 2026, startMonth: 9, receiveDay: 25 }]
    };

    const res1 = projectFinancialMonth(finances, 2026, 9);
    const res2 = projectFinancialMonth(finances, 2026, 9);

    const keys1 = res1.events.map(e => e.occurrenceKey);
    const keys2 = res2.events.map(e => e.occurrenceKey);
    assert.deepStrictEqual(keys1, keys2);
    assert.strictEqual(keys1[0], 'fixed_f_100_2026-09');
  });

  // 32. Ordenação determinística
  test('32. Events são ordenados por data crescente e tie-breakers estáveis', () => {
    const finances = {
      fixed: [
        { id: 'f_dia20', name: 'Despesa Dia 20', amount: 100, dueDay: 20, versions: [{ year: 2026, month: 1, amount: 100 }] },
        { id: 'f_dia10', name: 'Despesa Dia 10', amount: 50, dueDay: 10, versions: [{ year: 2026, month: 1, amount: 50 }] }
      ],
      extras: [
        { id: 'e_dia10', title: 'Entrada Dia 10', amount: 500, receiveDay: 10, startYear: 2026, startMonth: 9 }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.strictEqual(res.events.length, 3);
    // Dia 10 antes do dia 20
    assert.strictEqual(res.events[0].date, '2026-09-10');
    assert.strictEqual(res.events[1].date, '2026-09-10');
    assert.strictEqual(res.events[2].date, '2026-09-20');

    // No mesmo dia (10): inflow antes de outflow
    assert.strictEqual(res.events[0].direction, 'inflow');
    assert.strictEqual(res.events[1].direction, 'outflow');
  });

  // 33. Imutabilidade: finances não é mutado
  test('33. Imutabilidade estrita: finances permanece rigorosamente idêntico após projeção', () => {
    const finances = {
      profile: { baseSalary: 3000, salaryPayment: { type: 'fixed_day', day: 5 } },
      fixed: [{ id: 'f1', name: 'Aluguel', amount: 1200, dueDay: 10, versions: [{ year: 2026, month: 1, amount: 1200 }] }],
      variable: [{ id: 'v1', name: 'Notebook', totalAmount: 3000, installments: 3, startYear: 2026, startMonth: 8, dueDay: 15 }],
      extras: [{ id: 'e1', title: 'Freela', amount: 500, receiveDate: '2026-09-20' }],
      debtors: [{ id: 'd1', debtorName: 'Ana', amount: 150, startYear: 2026, startMonth: 9, receiveDay: 22 }],
      benefitTransactions: [{ id: 'b1', description: 'VR', amount: 40, day: 12, month: 9, year: 2026 }],
      incomes: { '2026-09': 3500 }
    };

    const snapshotBefore = structuredClone(finances);
    projectFinancialMonth(finances, 2026, 9);
    assert.deepStrictEqual(finances, snapshotBefore);
  });

  // 34. month inválido
  test('34. month inválido (fora de 1..12 ou não inteiro) lança erro fail-closed', () => {
    const finances = {};
    assert.throws(() => projectFinancialMonth(finances, 2026, 0), /INVALID_PROJECTION_PERIOD/);
    assert.throws(() => projectFinancialMonth(finances, 2026, 13), /INVALID_PROJECTION_PERIOD/);
    assert.throws(() => projectFinancialMonth(finances, 2026, -1), /INVALID_PROJECTION_PERIOD/);
    assert.throws(() => projectFinancialMonth(finances, 2026, 'invalido'), /INVALID_PROJECTION_PERIOD/);
  });

  // 35. year inválido
  test('35. year inválido (fora de 2000..2100 ou não inteiro) lança erro fail-closed', () => {
    const finances = {};
    assert.throws(() => projectFinancialMonth(finances, 1999, 9), /INVALID_PROJECTION_PERIOD/);
    assert.throws(() => projectFinancialMonth(finances, 2101, 9), /INVALID_PROJECTION_PERIOD/);
    assert.throws(() => projectFinancialMonth(finances, null, 9), /INVALID_PROJECTION_PERIOD/);
    assert.throws(() => projectFinancialMonth(finances, 'ano', 9), /INVALID_PROJECTION_PERIOD/);
  });

  // 36. Nenhum evento possui Invalid Date
  test('36. Todos os eventos datados gerados possuem formato YYYY-MM-DD rigorosamente válido', () => {
    const finances = {
      profile: { baseSalary: 4000, salaryPayment: { type: 'fixed_day', day: 31 } },
      fixed: [{ id: 'f1', name: 'Aluguel', amount: 1000, dueDay: 31, versions: [{ year: 2026, month: 1, amount: 1000 }] }],
      extras: [{ id: 'e1', title: 'Freela', amount: 200, receiveDate: '2026-02-28' }],
      debtors: [{ id: 'd1', debtorName: 'Carlos', amount: 100, startYear: 2026, startMonth: 2, receiveDay: 31 }],
      benefitTransactions: [{ id: 'b1', description: 'VR', amount: 50, day: 31, month: 2, year: 2026 }]
    };

    // Fevereiro 2026 (28 dias)
    const res = projectFinancialMonth(finances, 2026, 2);
    for (const ev of res.events) {
      assert.strictEqual(typeof ev.date, 'string');
      assert.strictEqual(isValidCanonicalDateString(ev.date), true, `Data ${ev.date} deve ser data civil válida`);
    }
    for (const bev of res.benefits.events) {
      assert.strictEqual(typeof bev.date, 'string');
      assert.strictEqual(isValidCanonicalDateString(bev.date), true, `Data de benefício ${bev.date} deve ser data civil válida`);
    }
  });

  // 37. Nenhum amount produzido é NaN ou não-finito
  test('37. Nenhum amount em events, undated ou summaries é NaN, null ou negativo', () => {
    const finances = {
      profile: { baseSalary: 'NaN', salaryPayment: { type: 'fixed_day', day: 5 } },
      fixed: [{ id: 'f1', name: 'Teste', amount: undefined, dueDay: 10, versions: [{ year: 2026, month: 1, amount: null }] }],
      variable: [{ id: 'v1', name: 'Teste Var', amount: -50, installments: 1, startYear: 2026, startMonth: 9, dueDay: 12 }],
      extras: [{ id: 'e1', title: 'Teste Extra', amount: 'invalido', receiveDate: '2026-09-15' }]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    const all = [...res.events, ...res.undated, ...res.benefits.events, ...res.benefits.undated];
    for (const item of all) {
      assert.strictEqual(typeof item.amount, 'number');
      assert.strictEqual(Number.isFinite(item.amount), true);
      assert.strictEqual(isNaN(item.amount), false);
      assert.ok(item.amount >= 0);
    }
    assert.strictEqual(Number.isFinite(res.summary.inflow), true);
    assert.strictEqual(Number.isFinite(res.summary.outflow), true);
    assert.strictEqual(Number.isFinite(res.summary.net), true);
  });

});
