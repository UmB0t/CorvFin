/**
 * CorvFin V2 — Suíte de Testes do Domínio Financeiro Compartilhado (tests/finance_domain_shared.test.js)
 *
 * Validação mandatória das regras puras de cálculo financeiro, parcelamento,
 * cronograma de centavos e liquidação, sem qualquer acoplamento a DOM, state ou Express.
 *
 * Cobertura mandatória:
 * 1. Schedule de compra única (installments = 1);
 * 2. Schedule parcelado (installments > 1);
 * 3. Total dividido preservando centavos (ex: 100/3x -> 33,34 na 1ª e 33,33 nas restantes);
 * 4. Total que gera resíduo determinístico na primeira competência;
 * 5. Invariante matemática: soma do cronograma rigorosamente igual ao totalAmount;
 * 6. amountInputMode = 'total';
 * 7. amountInputMode = 'installment' / registros legados;
 * 8. Determinismo: mesma entrada gera exatamente a mesma saída (imutabilidade e estabilidade);
 * 9. Ausência de state/DOM não altera comportamento quando parâmetros explícitos são fornecidos;
 * 10. Domínio puro funciona sem window, document ou browser globals;
 * 11. calculatePaymentSettlement com status 'pendente' (isPending: true);
 * 12. calculatePaymentSettlement com status 'parcial' (isPartial: true);
 * 13. calculatePaymentSettlement com status 'pago' (isPaid: true);
 * 14. paidAmount maior que total não gera remaining negativo (remainingAmount >= 0);
 * 15. Valores de borda e sanitização (zeros, valores nulos/inválidos, booleanos);
 * 16. Paridade semântica estrita entre FinanceDomain e os wrappers de financeQueries.js.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const FinanceDomain = require('../shared/financeDomain');
const financeQueries = require('../public/js/core/financeQueries');

describe('CORVFIN V2 — DOMÍNIO FINANCEIRO COMPARTILHADO (shared/financeDomain.js)', () => {

  test('1. Schedule de compra única (installments = 1)', () => {
    const expense = {
      id: 'single_1',
      amount: 150.50,
      totalAmount: 150.50,
      installments: 1,
      startYear: 2026,
      startMonth: 3
    };

    const res = FinanceDomain.calculateInstallmentSchedule(expense, null, null, 2026, 3, false);
    assert.equal(res.keys.length, 1);
    assert.equal(res.keys[0], '2026-03');
    assert.equal(res.schedule['2026-03'], 150.50);
    assert.equal(res.totalCents, 15050);
    assert.equal(res.sumScheduleCents, 15050);
    assert.equal(res.remainingCents, 15050);
    assert.equal(res.paidKeys.length, 0);
    assert.equal(res.openKeys.length, 1);
  });

  test('2. Schedule parcelado uniforme (1200 / 12x => 12x 100,00)', () => {
    const expense = {
      id: 'inst_12',
      totalAmount: 1200,
      installments: 12,
      startYear: 2026,
      startMonth: 1
    };

    const res = FinanceDomain.calculateInstallmentSchedule(expense, null, null, 2026, 1, false);
    assert.equal(res.keys.length, 12);
    assert.equal(res.keys[0], '2026-01');
    assert.equal(res.keys[11], '2026-12');
    res.keys.forEach((k) => {
      assert.equal(res.schedule[k], 100.00);
    });
    assert.equal(res.totalCents, 120000);
    assert.equal(res.sumScheduleCents, 120000);
    assert.equal(res.remainingCents, 120000);
  });

  test('3. Total dividido preservando centavos (100 / 3x => 33,34 na 1ª e 33,33 nas demais)', () => {
    const expense = {
      id: 'split_cents',
      totalAmount: 100,
      installments: 3,
      startYear: 2026,
      startMonth: 9
    };

    const res = FinanceDomain.calculateInstallmentSchedule(expense, null, null, 2026, 9, false);
    assert.equal(res.keys.length, 3);
    assert.equal(res.schedule['2026-09'], 33.34);
    assert.equal(res.schedule['2026-10'], 33.33);
    assert.equal(res.schedule['2026-11'], 33.33);
    assert.equal(res.totalCents, 10000);
    assert.equal(res.sumScheduleCents, 10000);
  });

  test('4. Total que gera resíduo de centavos determinístico na 1ª competência aberta', () => {
    const expense = {
      id: 'res_cents',
      totalAmount: 50,
      installments: 4,
      startYear: 2026,
      startMonth: 5
    };
    // 50 / 4 = 12.50 sem resto
    const resNoRem = FinanceDomain.calculateInstallmentSchedule(expense, null, null, 2026, 5, false);
    assert.equal(resNoRem.schedule['2026-05'], 12.50);

    // 50.02 / 4 = 12.50 com resto de 2 centavos distribuídos deterministicamente (1 centavo cada para as primeiras 2 parcelas)
    const resWithRem = FinanceDomain.calculateInstallmentSchedule(expense, 50.02, 4, 2026, 5, true);
    assert.equal(resWithRem.schedule['2026-05'], 12.51);
    assert.equal(resWithRem.schedule['2026-06'], 12.51);
    assert.equal(resWithRem.schedule['2026-07'], 12.50);
    assert.equal(resWithRem.schedule['2026-08'], 12.50);
    assert.equal(resWithRem.sumScheduleCents, 5002);
  });

  test('5. Invariante matemática: soma de todas as parcelas é sempre exatamente igual ao totalAmount', () => {
    const testCases = [
      { total: 10, count: 3 },
      { total: 100, count: 3 },
      { total: 1000.01, count: 7 },
      { total: 99.99, count: 6 },
      { total: 350.55, count: 11 },
      { total: 1, count: 12 }
    ];

    testCases.forEach(({ total, count }) => {
      const exp = { totalAmount: total, installments: count, startYear: 2026, startMonth: 1 };
      const res = FinanceDomain.calculateInstallmentSchedule(exp, null, null, 2026, 1, false);
      const expectedCents = Math.round(total * 100);
      assert.equal(res.sumScheduleCents, expectedCents, `Falha na invariante para total=${total}, count=${count}`);
      const sumFloat = Math.round(Object.values(res.schedule).reduce((acc, v) => acc + v, 0) * 100);
      assert.equal(sumFloat, expectedCents, `Falha no float arredondado para total=${total}, count=${count}`);
    });
  });

  test('6. amountInputMode = "total" resolve amount como montante integral', () => {
    const expense = {
      id: 'mode_total',
      amount: 100,
      totalAmount: 600,
      installmentAmount: 100,
      amountInputMode: 'total',
      installments: 6,
      startYear: 2026,
      startMonth: 2
    };

    const resolved = FinanceDomain.resolveInstallmentAmounts(expense, 2026, 2);
    assert.equal(resolved.amountInputMode, 'total');
    assert.equal(resolved.totalAmount, 600);
    assert.equal(resolved.installmentAmount, 100);
    assert.equal(resolved.currentInstallmentAmount, 100);
    assert.equal(resolved.installments, 6);
  });

  test('7. amountInputMode = "installment" e registros legados calculam totalAmount = parcela * count', () => {
    // Registro legado sem amountInputMode e sem totalAmount:
    const legacyExpense = {
      id: 'mode_legacy',
      amount: 150,
      installments: 4,
      startYear: 2026,
      startMonth: 4
    };

    const resolved = FinanceDomain.resolveInstallmentAmounts(legacyExpense, 2026, 4);
    assert.equal(resolved.amountInputMode, 'installment');
    assert.equal(resolved.installmentAmount, 150);
    assert.equal(resolved.totalAmount, 600); // 150 * 4
    assert.equal(resolved.currentInstallmentAmount, 150);
  });

  test('8. Determinismo: mesma entrada gera estritamente a mesma saída sem mutação', () => {
    const expense = {
      id: 'det_1',
      totalAmount: 250,
      installments: 5,
      startYear: 2026,
      startMonth: 1,
      paidHistory: { '2026-01': 50 }
    };

    const snapshotBefore = JSON.stringify(expense);
    const out1 = FinanceDomain.calculateInstallmentSchedule(expense, null, null, 2026, 1, false);
    const out2 = FinanceDomain.calculateInstallmentSchedule(expense, null, null, 2026, 1, false);
    const snapshotAfter = JSON.stringify(expense);

    assert.equal(snapshotBefore, snapshotAfter, 'O objeto recebido não pode ser mutado');
    assert.deepEqual(out1, out2, 'Múltiplas chamadas com os mesmos parâmetros devem produzir saída estritamente idêntica');
  });

  test('9. Ausência de state não altera comportamento quando parâmetros explícitos são fornecidos', () => {
    const expense = {
      id: 'no_state',
      totalAmount: 300,
      installments: 3
    };

    // Parâmetros sYear=2027, sMonth=6 passados explicitamente
    const res = FinanceDomain.calculateInstallmentSchedule(expense, null, null, 2027, 6, false);
    assert.equal(res.keys[0], '2027-06');
    assert.equal(res.keys[1], '2027-07');
    assert.equal(res.keys[2], '2027-08');
    assert.equal(res.schedule['2027-06'], 100);

    const resolved = FinanceDomain.resolveInstallmentAmounts(expense, 2027, 7);
    assert.equal(resolved.currentInstallmentAmount, 100);
  });

  test('10. Domínio compartilhado não acessa window, document nem browser globals', () => {
    // Validação estrita de isolamento de ambiente
    assert.equal(typeof FinanceDomain.calculateInstallmentSchedule, 'function');
    assert.equal(typeof FinanceDomain.resolveInstallmentAmounts, 'function');
    assert.equal(typeof FinanceDomain.calculatePaymentSettlement, 'function');

    // Executado em ambiente Node puro onde window e document não existem
    assert.equal(typeof window, 'undefined');
    assert.equal(typeof document, 'undefined');
  });

  test('11. calculatePaymentSettlement: status pendente quando nada foi pago', () => {
    const settlement = FinanceDomain.calculatePaymentSettlement(200, 0);
    assert.equal(settlement.totalAmount, 200);
    assert.equal(settlement.paidAmount, 0);
    assert.equal(settlement.remainingAmount, 200);
    assert.equal(settlement.status, 'pendente');
    assert.equal(settlement.isPending, true);
    assert.equal(settlement.isPartial, false);
    assert.equal(settlement.isPaid, false);
  });

  test('12. calculatePaymentSettlement: status parcial quando paidAmount < totalAmount', () => {
    const settlement = FinanceDomain.calculatePaymentSettlement(200, 75.50);
    assert.equal(settlement.totalAmount, 200);
    assert.equal(settlement.paidAmount, 75.50);
    assert.equal(settlement.remainingAmount, 124.50);
    assert.equal(settlement.status, 'parcial');
    assert.equal(settlement.isPending, false);
    assert.equal(settlement.isPartial, true);
    assert.equal(settlement.isPaid, false);
  });

  test('13. calculatePaymentSettlement: status pago quando paidAmount >= totalAmount', () => {
    const settlement = FinanceDomain.calculatePaymentSettlement(200, 200);
    assert.equal(settlement.totalAmount, 200);
    assert.equal(settlement.paidAmount, 200);
    assert.equal(settlement.remainingAmount, 0);
    assert.equal(settlement.status, 'pago');
    assert.equal(settlement.isPending, false);
    assert.equal(settlement.isPartial, false);
    assert.equal(settlement.isPaid, true);
  });

  test('14. calculatePaymentSettlement: paidAmount maior que totalAmount não gera remainingAmount negativo', () => {
    const settlement = FinanceDomain.calculatePaymentSettlement(100, 150);
    assert.equal(settlement.totalAmount, 100);
    assert.equal(settlement.paidAmount, 150);
    assert.equal(settlement.remainingAmount, 0);
    assert.equal(settlement.remainingAmount >= 0, true);
    assert.equal(settlement.status, 'pago');
    assert.equal(settlement.isPaid, true);
  });

  test('15. Valores de borda e sanitização defensiva', () => {
    // Total zerado sem flag de pago
    const zeroPendente = FinanceDomain.calculatePaymentSettlement(0, 0);
    assert.equal(zeroPendente.totalAmount, 0);
    assert.equal(zeroPendente.paidAmount, 0);
    assert.equal(zeroPendente.remainingAmount, 0);
    assert.equal(zeroPendente.status, 'pendente');

    // Total zerado explicitamente marcado como pago
    const zeroPago = FinanceDomain.calculatePaymentSettlement(0, 0, { isMarkedPaid: true });
    assert.equal(zeroPago.status, 'pago');
    assert.equal(zeroPago.isPaid, true);

    // Entradas inválidas ou NaN sanitizadas com fail-safe
    const invalid = FinanceDomain.calculatePaymentSettlement('invalid', -50);
    assert.equal(invalid.totalAmount, 0);
    assert.equal(invalid.paidAmount, 0);
    assert.equal(invalid.remainingAmount, 0);
    assert.equal(invalid.status, 'pendente');

    // Despesa nula para cronograma
    const nullSchedule = FinanceDomain.calculateInstallmentSchedule(null);
    assert.deepEqual(nullSchedule.keys, []);
    assert.equal(nullSchedule.totalCents, 0);

    // Despesa nula para resolução de valores
    const nullResolve = FinanceDomain.resolveInstallmentAmounts(null, 2026, 1);
    assert.equal(nullResolve.totalAmount, 0);
    assert.equal(nullResolve.installments, 1);
  });

  test('16. Paridade semântica entre FinanceDomain e os wrappers de financeQueries.js', () => {
    const expense = {
      id: 'parity_exp',
      name: 'Smart TV',
      totalAmount: 1800,
      installments: 6,
      amountInputMode: 'total',
      startYear: 2026,
      startMonth: 7,
      paidHistory: {
        '2026-07': { paidAmount: 300, status: 'pago' }
      }
    };

    // Resolução de valores
    const domainResolved = FinanceDomain.resolveInstallmentAmounts(expense, 2026, 7);
    const queriesResolved = financeQueries.resolveInstallmentAmounts(expense, 2026, 7);
    assert.deepEqual(domainResolved, queriesResolved, 'Paridade estrita em resolveInstallmentAmounts');

    // Cronograma
    const domainSchedule = FinanceDomain.calculateInstallmentSchedule(expense, null, null, 2026, 7, false);
    const queriesSchedule = financeQueries.calculateInstallmentSchedule(expense, null, null, 2026, 7, false);
    assert.deepEqual(domainSchedule, queriesSchedule, 'Paridade estrita em calculateInstallmentSchedule');

    // Quitação / Payment info
    const info = financeQueries.getExpensePaymentInfo(expense, 2026, 7);
    assert.equal(info.totalAmount, 300);
    assert.equal(info.paidAmount, 300);
    assert.equal(info.remainingAmount, 0);
    assert.equal(info.status, 'pago');
    assert.equal(info.isPaid, true);
  });

  test('17. isDebtorCountedInTotal: semântica estrita booleana e fail-safe', () => {
    assert.equal(typeof FinanceDomain.isDebtorCountedInTotal, 'function');

    // Contabilizável: countInTotal estritamente true
    assert.strictEqual(FinanceDomain.isDebtorCountedInTotal({ countInTotal: true }), true);

    // Não contabilizável: countInTotal false
    assert.strictEqual(FinanceDomain.isDebtorCountedInTotal({ countInTotal: false }), false);

    // Fail-safe: ausente, undefined, null, número ou string "true" não são contabilizados
    assert.strictEqual(FinanceDomain.isDebtorCountedInTotal({}), false);
    assert.strictEqual(FinanceDomain.isDebtorCountedInTotal({ countInTotal: undefined }), false);
    assert.strictEqual(FinanceDomain.isDebtorCountedInTotal({ countInTotal: null }), false);
    assert.strictEqual(FinanceDomain.isDebtorCountedInTotal({ countInTotal: 1 }), false);
    assert.strictEqual(FinanceDomain.isDebtorCountedInTotal({ countInTotal: 'true' }), false);
    assert.strictEqual(FinanceDomain.isDebtorCountedInTotal(null), false);
    assert.strictEqual(FinanceDomain.isDebtorCountedInTotal(undefined), false);
    assert.strictEqual(FinanceDomain.isDebtorCountedInTotal('string'), false);
  });

});
