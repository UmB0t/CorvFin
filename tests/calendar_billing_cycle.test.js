/**
 * CorvFin V2 — Suíte Canônica de Testes: Ciclo de Fatura de Cartão de Crédito
 * tests/calendar_billing_cycle.test.js
 *
 * Cobertura estrita dos 11 cenários da Seção 39:
 * 1. closing 20 / due 5, purchase 19/09/2026 -> close 20/09, due 05/10
 * 2. closing 20 / due 5, purchase 20/09 -> close 20/09, due 05/10 (compra no fechamento)
 * 3. closing 20 / due 5, purchase 21/09 -> close 20/10, due 05/11
 * 4. closing 10 / due 25, purchase antes do fechamento -> due 25 do mesmo mês quando posterior ao fechamento
 * 5. closing 31 em fevereiro não normaliza para março
 * 6. due 31 em fevereiro resolve último dia civil
 * 7. fevereiro bissexto
 * 8. virada dezembro -> janeiro -> fevereiro
 * 9. missing closingDay -> nenhuma invoice fabricada
 * 10. missing dueDay -> nenhuma invoice fabricada
 * 11. invalid transactionDate -> nenhuma transaction/invoice inventada
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const TemporalDomain = require('../shared/temporalDomain');
const temporalUtils = require('../server/services/temporalUtils');

test('CorvFin — Ciclo de Fatura de Cartão de Crédito (Seção 39)', async (t) => {

  await t.test('1. closing 20 / due 5, purchase 19/09/2026 -> close 20/09/2026, due 05/10/2026', () => {
    const cycle = TemporalDomain.resolveCreditCardBillingCycle('2026-09-19', 20, 5);
    assert.ok(cycle, 'Ciclo deve ser resolvido');
    assert.equal(cycle.closingDate, '2026-09-20');
    assert.equal(cycle.invoiceDueDate, '2026-10-05');
    assert.equal(cycle.closingYear, 2026);
    assert.equal(cycle.closingMonth, 9);
    assert.equal(cycle.closingDay, 20);
    assert.equal(cycle.dueYear, 2026);
    assert.equal(cycle.dueMonth, 10);
    assert.equal(cycle.dueDay, 5);
    assert.equal(cycle.isSameMonthDue, false);
  });

  await t.test('2. closing 20 / due 5, purchase 20/09/2026 (no dia do fechamento) -> close 20/09/2026, due 05/10/2026', () => {
    const cycle = TemporalDomain.resolveCreditCardBillingCycle('2026-09-20', 20, 5);
    assert.ok(cycle);
    assert.equal(cycle.closingDate, '2026-09-20');
    assert.equal(cycle.invoiceDueDate, '2026-10-05');
  });

  await t.test('3. closing 20 / due 5, purchase 21/09/2026 (após o fechamento) -> close 20/10/2026, due 05/11/2026', () => {
    const cycle = TemporalDomain.resolveCreditCardBillingCycle('2026-09-21', 20, 5);
    assert.ok(cycle);
    assert.equal(cycle.closingDate, '2026-10-20');
    assert.equal(cycle.invoiceDueDate, '2026-11-05');
    assert.equal(cycle.closingMonth, 10);
    assert.equal(cycle.dueMonth, 11);
  });

  await t.test('4. closing 10 / due 25, purchase 05/09/2026 -> due 25 do mesmo mês quando posterior ao fechamento', () => {
    const cycle = TemporalDomain.resolveCreditCardBillingCycle('2026-09-05', 10, 25);
    assert.ok(cycle);
    assert.equal(cycle.closingDate, '2026-09-10');
    assert.equal(cycle.invoiceDueDate, '2026-09-25');
    assert.equal(cycle.closingMonth, 9);
    assert.equal(cycle.dueMonth, 9);
    assert.equal(cycle.isSameMonthDue, true);
  });

  await t.test('5. closing 31 em fevereiro não normaliza para março (clamp 28/02 em ano comum)', () => {
    // Compra em 15/02/2027, closingDay 31
    const closing = TemporalDomain.resolveApplicableClosingDate('2027-02-15', 31);
    assert.ok(closing);
    assert.equal(closing.date, '2027-02-28');
    assert.equal(closing.month, 2);
    assert.equal(closing.day, 28);
    assert.equal(closing.wasClamped, true);

    const cycle = TemporalDomain.resolveCreditCardBillingCycle('2027-02-15', 31, 10);
    assert.ok(cycle);
    assert.equal(cycle.closingDate, '2027-02-28');
    assert.equal(cycle.invoiceDueDate, '2027-03-10');
  });

  await t.test('6. due 31 em fevereiro resolve último dia civil (clamp 28/02 em ano comum)', () => {
    // Fechamento 10/02/2027, vencimento 31 -> vence 28/02/2027 no mesmo mês
    const cycle = TemporalDomain.resolveCreditCardBillingCycle('2027-02-05', 10, 31);
    assert.ok(cycle);
    assert.equal(cycle.closingDate, '2027-02-10');
    assert.equal(cycle.invoiceDueDate, '2027-02-28');
    assert.equal(cycle.dueMonth, 2);
    assert.equal(cycle.dueDay, 28);
  });

  await t.test('7. fevereiro bissexto (2028: dia 29 existe e é respeitado)', () => {
    const closing = TemporalDomain.resolveApplicableClosingDate('2028-02-10', 31);
    assert.ok(closing);
    assert.equal(closing.date, '2028-02-29');
    assert.equal(closing.day, 29);

    const cycle = TemporalDomain.resolveCreditCardBillingCycle('2028-02-05', 10, 31);
    assert.ok(cycle);
    assert.equal(cycle.closingDate, '2028-02-10');
    assert.equal(cycle.invoiceDueDate, '2028-02-29');
    assert.equal(cycle.dueDay, 29);
  });

  await t.test('8. virada de ano dezembro -> janeiro -> fevereiro', () => {
    // Compra 21/12/2026 com fechamento 20 e vencimento 5
    // Como compra é após 20/12, fecha em 20/01/2027 e vence em 05/02/2027
    const cycle = TemporalDomain.resolveCreditCardBillingCycle('2026-12-21', 20, 5);
    assert.ok(cycle);
    assert.equal(cycle.closingDate, '2027-01-20');
    assert.equal(cycle.invoiceDueDate, '2027-02-05');
    assert.equal(cycle.closingYear, 2027);
    assert.equal(cycle.closingMonth, 1);
    assert.equal(cycle.dueYear, 2027);
    assert.equal(cycle.dueMonth, 2);
  });

  await t.test('9. missing closingDay -> nenhuma invoice fabricada (retorna null)', () => {
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('2026-09-19', null, 5), null);
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('2026-09-19', undefined, 5), null);
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('2026-09-19', 0, 5), null);
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('2026-09-19', 32, 5), null);
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('2026-09-19', 'abc', 5), null);
  });

  await t.test('10. missing dueDay -> nenhuma invoice fabricada (retorna null)', () => {
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('2026-09-19', 20, null), null);
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('2026-09-19', 20, undefined), null);
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('2026-09-19', 20, 0), null);
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('2026-09-19', 20, 35), null);
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('2026-09-19', 20, ''), null);
  });

  await t.test('11. invalid transactionDate -> nenhuma transaction/invoice inventada (retorna null)', () => {
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle(null, 20, 5), null);
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('', 20, 5), null);
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('2026-02-30', 20, 5), null);
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('19/09/2026', 20, 5), null);
    assert.equal(TemporalDomain.resolveCreditCardBillingCycle('not-a-date', 20, 5), null);
  });

  await t.test('12. Paridade estrita com re-exports de temporalUtils.js', () => {
    assert.equal(typeof temporalUtils.resolveNominalCivilDate, 'function');
    assert.equal(typeof temporalUtils.resolveApplicableClosingDate, 'function');
    assert.equal(typeof temporalUtils.resolveInvoiceDueDate, 'function');
    assert.equal(typeof temporalUtils.resolveCreditCardBillingCycle, 'function');

    const d1 = TemporalDomain.resolveCreditCardBillingCycle('2026-09-19', 20, 5);
    const d2 = temporalUtils.resolveCreditCardBillingCycle('2026-09-19', 20, 5);
    assert.deepEqual(d1, d2);
  });
});
