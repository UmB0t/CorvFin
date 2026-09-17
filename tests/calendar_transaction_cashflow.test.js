/**
 * CorvFin V2 — Suíte Canônica de Testes: Transaction Events, Invoice Projection e Cashflow
 * tests/calendar_transaction_cashflow.test.js
 *
 * Cobertura das Seções 40, 41, 42 e Correção Final de Precedência:
 * - Separação estrita entre Transaction Event (affectsCashflow: false) e Invoice (affectsCashflow: true);
 * - Prevenção absoluta de dupla contabilização em summary.outflow;
 * - Precedência de installmentSchedule persistido quando válido (Ajuste 1);
 * - Precedência de payment.method explícito sobre destination (Correção Final A..G);
 * - Agregação estável por ID e fail-closed para nomes ambíguos (Ajuste 3).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { projectFinancialMonth } = require('../server/services/financeProjectionService');

test('CorvFin — Transaction Events, Invoice Projection e Cashflow (Fase 3)', async (t) => {

  const standardDestinations = [
    { id: 'dest_neon', name: 'Neon', type: 'credit_card', closingDay: 20, dueDay: 5 },
    { id: 'dest_nubank', name: 'Nubank', type: 'credit_card', closingDay: 10, dueDay: 25 },
    { id: 'dest_itau_acc', name: 'Itaú Conta', type: 'bank_account', closingDay: null, dueDay: null },
    { id: 'dest_cash', name: 'Carteira', type: 'cash', closingDay: null, dueDay: null },
    { id: 'dest_terceiro', name: 'Terceiro', type: 'other', closingDay: null, dueDay: null }
  ];

  await t.test('1. Compra no crédito gera transaction event na data real com affectsCashflow: false', () => {
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_amazon',
          name: 'Amazon',
          amount: 150,
          destinationId: 'dest_neon',
          transactionDate: '2026-09-10',
          payment: { method: 'cartao_credito' }
        }
      ]
    };

    // Setembro 2026 (mês da compra)
    const resSep = projectFinancialMonth(finances, 2026, 9);
    const tx = resSep.events.find(e => e.sourceId === 'v_amazon');
    assert.ok(tx, 'Deve gerar transaction event');
    assert.equal(tx.eventKind, 'transaction');
    assert.equal(tx.affectsCashflow, false);
    assert.equal(tx.date, '2026-09-10');
    assert.equal(tx.amount, 150);
    assert.equal(tx.destination, 'Neon');
    assert.equal(tx.destinationType, 'credit_card');

    // Compra no crédito NÃO aumenta summary.outflow no mês da compra
    assert.equal(resSep.summary.outflow, 0, 'Compra no crédito não afeta outflow no mês da compra');
  });

  await t.test('2. Fatura no vencimento gera invoice event com affectsCashflow: true e entra em outflow', () => {
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_amazon',
          name: 'Amazon',
          amount: 150,
          destinationId: 'dest_neon',
          transactionDate: '2026-09-10', // fecha 20/09, vence 05/10
          payment: { method: 'cartao_credito' }
        }
      ]
    };

    // Outubro 2026 (mês de vencimento da fatura)
    const resOct = projectFinancialMonth(finances, 2026, 10);
    const inv = resOct.events.find(e => e.sourceType === 'credit_card_invoice');
    assert.ok(inv, 'Deve gerar invoice event em outubro');
    assert.equal(inv.eventKind, 'invoice');
    assert.equal(inv.affectsCashflow, true);
    assert.equal(inv.date, '2026-10-05');
    assert.equal(inv.amount, 150);
    assert.equal(inv.description, 'Fatura Neon');
    assert.equal(inv.itemCount, 1);

    // Em outubro, outflow reflete exatamente a fatura
    assert.equal(resOct.summary.outflow, 150);
  });

  await t.test('3. Zero Dupla Contabilização: Compra e fatura no mesmo mês não duplicam outflow', () => {
    // Compra 05/09 fecha 10/09 e vence 25/09 no Nubank (mesmo mês civil!)
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_spotify',
          name: 'Spotify Anual',
          amount: 200,
          destinationId: 'dest_nubank', // closing 10, due 25
          transactionDate: '2026-09-05',
          payment: { method: 'cartao_credito' }
        }
      ]
    };

    const resSep = projectFinancialMonth(finances, 2026, 9);
    // Deve haver 2 eventos em setembro:
    // - 05/09: Transaction Event (Spotify, affectsCashflow: false)
    // - 25/09: Invoice Event (Fatura Nubank, affectsCashflow: true)
    const tx = resSep.events.find(e => e.eventKind === 'transaction');
    const inv = resSep.events.find(e => e.eventKind === 'invoice');
    assert.ok(tx);
    assert.ok(inv);
    assert.equal(tx.affectsCashflow, false);
    assert.equal(inv.affectsCashflow, true);

    // Outflow DEVE SER EXATAMENTE 200 (uma única vez pela fatura, não 400!)
    assert.equal(resSep.summary.outflow, 200, 'Zero dupla contabilização');
  });

  await t.test('4. Transação imediata (cash / dinheiro) entra uma única vez no cashflow', () => {
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_padaria',
          name: 'Padaria',
          amount: 45,
          destinationId: 'dest_cash',
          transactionDate: '2026-09-12',
          payment: { method: 'dinheiro' }
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    assert.equal(res.events.length, 1);
    assert.equal(res.events[0].affectsCashflow, true);
    assert.equal(res.events[0].date, '2026-09-12');
    assert.equal(res.summary.outflow, 45);
  });

  await t.test('5. bank_account e other NÃO viram cartão de crédito', () => {
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_bank_transfer',
          name: 'Transferência Ted',
          amount: 500,
          destinationId: 'dest_itau_acc',
          dueDay: 15,
          startYear: 2026,
          startMonth: 9,
          installments: 1,
          payment: { method: 'transferencia' }
        },
        {
          id: 'v_other_item',
          name: 'Aporte Cripto',
          amount: 300,
          destinationId: 'dest_terceiro',
          dueDay: 18,
          startYear: 2026,
          startMonth: 9,
          installments: 1
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    const invoices = res.events.filter(e => e.sourceType === 'credit_card_invoice');
    assert.equal(invoices.length, 0, 'Não pode fabricar invoice para bank_account ou other');
    assert.equal(res.summary.outflow, 800);
  });

  await t.test('6. Destino legado sem configuração estruturada não inventa fatura', () => {
    const finances = {
      destinations: [
        { name: 'Nubank' } // Legado sem type, sem closingDay, sem dueDay
      ],
      variable: [
        {
          id: 'v_leg',
          name: 'Mercado',
          amount: 250,
          destination: 'Nubank',
          dueDay: 10,
          startYear: 2026,
          startMonth: 9,
          installments: 1
        }
      ]
    };

    const res = projectFinancialMonth(finances, 2026, 9);
    const invoices = res.events.filter(e => e.sourceType === 'credit_card_invoice');
    assert.equal(invoices.length, 0, 'Fail-closed: legado sem closingDay/dueDay não inventa fatura');
    assert.equal(res.summary.outflow, 250, 'Obrigação legada preservada no dueDay');
  });

  await t.test('7. Parcelamento: Compra 10x gera UMA única transaction original com total, e fatura com parcela', () => {
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_notebook',
          name: 'Notebook Dell',
          totalAmount: 3000,
          amount: 300,
          installmentAmount: 300,
          installments: 10,
          destinationId: 'dest_neon', // closing 20, due 5
          transactionDate: '2026-09-16', // compra em 16/09 fecha 20/09, vence 05/10
          payment: { method: 'cartao_credito' }
        }
      ]
    };

    // Setembro 2026 (mês da compra):
    const resSep = projectFinancialMonth(finances, 2026, 9);
    const txSep = resSep.events.filter(e => e.eventKind === 'transaction');
    assert.equal(txSep.length, 1, 'Deve gerar exatamente uma transaction event na compra');
    assert.equal(txSep[0].amount, 3000, 'Valor exibido na transaction reflete o total do bem');
    assert.equal(txSep[0].installmentTotal, 10);
    assert.equal(txSep[0].installmentAmount, 300);
    assert.equal(txSep[0].affectsCashflow, false);
    assert.equal(resSep.summary.outflow, 0, 'Zero outflow em setembro');

    // Outubro 2026 (1ª parcela):
    const resOct = projectFinancialMonth(finances, 2026, 10);
    const txOct = resOct.events.filter(e => e.eventKind === 'transaction');
    assert.equal(txOct.length, 0, 'NÃO pode gerar transaction event nos meses de parcelas futuras');

    const invOct = resOct.events.find(e => e.eventKind === 'invoice');
    assert.ok(invOct, 'Fatura de outubro deve existir');
    assert.equal(invOct.amount, 300, 'Fatura usa installment amount (300), não totalAmount (3000)');
    assert.equal(invOct.date, '2026-10-05');
    assert.equal(resOct.summary.outflow, 300);

    // Novembro 2026 (2ª parcela):
    const resNov = projectFinancialMonth(finances, 2026, 11);
    const invNov = resNov.events.find(e => e.eventKind === 'invoice');
    assert.ok(invNov);
    assert.equal(invNov.amount, 300);
    assert.equal(invNov.date, '2026-11-05');
  });

  await t.test('8. Precedência de installmentSchedule: Schedule persistido prevalece sobre cálculo teórico (Ajuste 1)', () => {
    // Suponha que um schedule histórico foi gerado com datas específicas e centavos ajustados
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_sched_test',
          name: 'Curso',
          totalAmount: 100,
          installments: 3,
          destinationId: 'dest_neon', // dueDay 5
          transactionDate: '2026-09-10',
          installmentSchedule: {
            '2026-10': 33.34,
            '2026-11': 33.33,
            '2026-12': 33.33
          },
          payment: { method: 'cartao_credito' }
        }
      ]
    };

    // Consulta em Outubro
    const resOct = projectFinancialMonth(finances, 2026, 10);
    const invOct = resOct.events.find(e => e.eventKind === 'invoice');
    assert.ok(invOct);
    assert.equal(invOct.amount, 33.34, 'Prevalece centavo do schedule persistido');

    // Consulta em Novembro
    const resNov = projectFinancialMonth(finances, 2026, 11);
    const invNov = resNov.events.find(e => e.eventKind === 'invoice');
    assert.ok(invNov);
    assert.equal(invNov.amount, 33.33, 'Prevalece valor do schedule persistido');

    // Imutabilidade: installmentSchedule original no objeto não foi mutado
    assert.deepEqual(finances.variable[0].installmentSchedule, {
      '2026-10': 33.34,
      '2026-11': 33.33,
      '2026-12': 33.33
    });
  });

  await t.test('9. Divergência entre schedule persistido e billing cycle: Preserva schedule intacto (Ajuste 1)', () => {
    // Schedule gerado historicamente para competências set/out/nov mesmo compra sendo 25/09 (que normalmente fecharia em out)
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_divergent',
          name: 'Compra Divergente',
          totalAmount: 200,
          installments: 2,
          destinationId: 'dest_neon', // closing 20, due 5
          transactionDate: '2026-09-25', // pós fechamento
          installmentSchedule: {
            '2026-09': 100, // Divergente do ciclo teórico
            '2026-10': 100
          },
          payment: { method: 'cartao_credito' }
        }
      ]
    };

    // Em Setembro (devido ao schedule persistido com chave 2026-09):
    const resSep = projectFinancialMonth(finances, 2026, 9);
    const invSep = resSep.events.find(e => e.eventKind === 'invoice');
    assert.ok(invSep, 'Respeita schedule persistido');
    assert.equal(invSep.amount, 100);

    // O schedule original NUNCA é alterado
    assert.equal(finances.variable[0].installmentSchedule['2026-09'], 100);
  });

  await t.test('10. Agregação de Faturas: Múltiplas compras no mesmo cartão agregam; cartões diferentes não agregam', () => {
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v1',
          name: 'Supermercado',
          amount: 200,
          destinationId: 'dest_neon', // due 05/10
          transactionDate: '2026-09-05',
          payment: { method: 'cartao_credito' }
        },
        {
          id: 'v2',
          name: 'Farmácia',
          amount: 150,
          destinationId: 'dest_neon', // due 05/10
          transactionDate: '2026-09-08',
          payment: { method: 'cartao_credito' }
        },
        {
          id: 'v3',
          name: 'Uber',
          amount: 40,
          destinationId: 'dest_nubank', // due 25/09 (outro cartão!)
          transactionDate: '2026-09-02',
          payment: { method: 'cartao_credito' }
        }
      ]
    };

    // Outubro: Fatura Neon agrega v1 + v2 = 350
    const resOct = projectFinancialMonth(finances, 2026, 10);
    const neonInvoices = resOct.events.filter(e => e.sourceType === 'credit_card_invoice' && e.destinationId === 'dest_neon');
    assert.equal(neonInvoices.length, 1, 'Exatamente uma fatura para o Neon');
    assert.equal(neonInvoices[0].amount, 350, 'Soma exata das duas compras');
    assert.equal(neonInvoices[0].itemCount, 2, 'Contagem correta de itens');
    assert.equal(neonInvoices[0].sourceItems.length, 2);

    // Fatura do outro cartão não agrega junto
    const nubankInvoices = resOct.events.filter(e => e.destinationId === 'dest_nubank');
    assert.equal(nubankInvoices.length, 0, 'Nubank venceu em setembro, não em outubro');
  });

  await t.test('11. Dois destinos com mesmo nome mas IDs diferentes NÃO agregam juntos (Ajuste 3)', () => {
    const finances = {
      destinations: [
        { id: 'card_a', name: 'Nubank', type: 'credit_card', closingDay: 20, dueDay: 5 },
        { id: 'card_b', name: 'Nubank', type: 'credit_card', closingDay: 20, dueDay: 5 } // Mesmo nome, ID diferente!
      ],
      variable: [
        {
          id: 'v_a',
          name: 'Item A',
          amount: 100,
          destinationId: 'card_a',
          transactionDate: '2026-09-05',
          payment: { method: 'cartao_credito' }
        },
        {
          id: 'v_b',
          name: 'Item B',
          amount: 200,
          destinationId: 'card_b',
          transactionDate: '2026-09-05',
          payment: { method: 'cartao_credito' }
        }
      ]
    };

    const resOct = projectFinancialMonth(finances, 2026, 10);
    const invoices = resOct.events.filter(e => e.sourceType === 'credit_card_invoice');
    assert.equal(invoices.length, 2, 'Devem ser duas faturas separadas!');
    assert.equal(invoices[0].amount, 100);
    assert.equal(invoices[1].amount, 200);
    assert.notEqual(invoices[0].id, invoices[1].id, 'IDs de invoice são distintos e seguros contra colisão');
  });

  // ====================================================================
  // TESTES OBRIGATÓRIOS DA CORREÇÃO FINAL (A até G)
  // ====================================================================

  await t.test('Correção Final A: credit_card destination + payment.method=cartao_credito -> transaction + invoice', () => {
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_test_a',
          name: 'Teste A',
          amount: 120,
          destinationId: 'dest_neon',
          transactionDate: '2026-09-10',
          payment: { method: 'cartao_credito' }
        }
      ]
    };

    const resSep = projectFinancialMonth(finances, 2026, 9);
    assert.ok(resSep.events.some(e => e.eventKind === 'transaction' && e.sourceId === 'v_test_a'));
    assert.equal(resSep.summary.outflow, 0);

    const resOct = projectFinancialMonth(finances, 2026, 10);
    assert.ok(resOct.events.some(e => e.eventKind === 'invoice' && e.destinationId === 'dest_neon'));
    assert.equal(resOct.summary.outflow, 120);
  });

  await t.test('Correção Final B: credit_card destination + payment.method=null -> transaction + invoice', () => {
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_test_b',
          name: 'Teste B',
          amount: 85,
          destinationId: 'dest_neon',
          transactionDate: '2026-09-10',
          payment: null // ausente
        }
      ]
    };

    const resSep = projectFinancialMonth(finances, 2026, 9);
    assert.ok(resSep.events.some(e => e.eventKind === 'transaction' && e.sourceId === 'v_test_b'));
    assert.equal(resSep.summary.outflow, 0);

    const resOct = projectFinancialMonth(finances, 2026, 10);
    assert.ok(resOct.events.some(e => e.eventKind === 'invoice' && e.destinationId === 'dest_neon'));
    assert.equal(resOct.summary.outflow, 85);
  });

  await t.test('Correção Final C: credit_card destination + payment.method=pix -> ZERO invoice, cashflow conforme Pix', () => {
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_test_c',
          name: 'Pix no Neon',
          amount: 210,
          destinationId: 'dest_neon',
          transactionDate: '2026-09-10',
          dueDay: 10,
          startYear: 2026,
          startMonth: 9,
          installments: 1,
          payment: { method: 'pix' } // MÉTODO EXPLÍCITO INCOMPATÍVEL COM CRÉDITO
        }
      ]
    };

    // Em setembro: NÃO deve gerar fatura, mas sim cashflow de Pix
    const resSep = projectFinancialMonth(finances, 2026, 9);
    const invoicesSep = resSep.events.filter(e => e.eventKind === 'invoice');
    assert.equal(invoicesSep.length, 0, 'Zero invoice em setembro');
    assert.equal(resSep.summary.outflow, 210, 'Outflow debitado imediatamente via Pix em setembro');

    // Em outubro: ZERO invoice
    const resOct = projectFinancialMonth(finances, 2026, 10);
    const invoicesOct = resOct.events.filter(e => e.eventKind === 'invoice');
    assert.equal(invoicesOct.length, 0, 'Zero invoice em outubro');
  });

  await t.test('Correção Final D: credit_card destination + payment.method=dinheiro -> ZERO invoice', () => {
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_test_d',
          name: 'Dinheiro no Neon',
          amount: 90,
          destinationId: 'dest_neon',
          transactionDate: '2026-09-10',
          dueDay: 10,
          startYear: 2026,
          startMonth: 9,
          installments: 1,
          payment: { method: 'dinheiro' }
        }
      ]
    };

    const resOct = projectFinancialMonth(finances, 2026, 10);
    assert.equal(resOct.events.filter(e => e.eventKind === 'invoice').length, 0, 'Zero invoice');
  });

  await t.test('Correção Final E: credit_card destination + payment.method=cartao_debito -> ZERO invoice', () => {
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_test_e',
          name: 'Débito no Neon',
          amount: 140,
          destinationId: 'dest_neon',
          transactionDate: '2026-09-10',
          dueDay: 10,
          startYear: 2026,
          startMonth: 9,
          installments: 1,
          payment: { method: 'cartao_debito' }
        }
      ]
    };

    const resOct = projectFinancialMonth(finances, 2026, 10);
    assert.equal(resOct.events.filter(e => e.eventKind === 'invoice').length, 0, 'Zero invoice');
  });

  await t.test('Correção Final F: destination não-credit-card + payment.method=cartao_credito -> NÃO inventar billing cycle', () => {
    const finances = {
      destinations: standardDestinations,
      variable: [
        {
          id: 'v_test_f',
          name: 'Crédito em Conta Corrente',
          amount: 320,
          destinationId: 'dest_itau_acc', // bank_account! Sem closingDay nem dueDay de cartão
          transactionDate: '2026-09-10',
          dueDay: 15,
          startYear: 2026,
          startMonth: 9,
          installments: 1,
          payment: { method: 'cartao_credito' }
        }
      ]
    };

    const resOct = projectFinancialMonth(finances, 2026, 10);
    assert.equal(resOct.events.filter(e => e.eventKind === 'invoice').length, 0, 'Não inventa billing cycle');
  });

  await t.test('Correção Final G: Heurística legada não sobrepõe payment.method explícito', () => {
    const finances = {
      destinations: [
        { id: 'dest_legacy_neon', name: 'Neon', type: 'credit_card', closingDay: 20, dueDay: 5 }
      ],
      variable: [
        {
          id: 'v_test_g',
          name: 'Compra com Método Boleto',
          amount: 400,
          destination: 'Neon',
          destinationId: 'dest_legacy_neon',
          transactionDate: '2026-09-10',
          dueDay: 12,
          startYear: 2026,
          startMonth: 9,
          installments: 1,
          payment: { method: 'boleto' } // Método explícito incompatível
        }
      ]
    };

    const resOct = projectFinancialMonth(finances, 2026, 10);
    assert.equal(resOct.events.filter(e => e.eventKind === 'invoice').length, 0, 'Método explícito boleto prevalece sobre destino Neon');
  });
});
