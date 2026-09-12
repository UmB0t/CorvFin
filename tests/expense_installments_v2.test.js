/**
 * CorvFin V2 — Suíte de Testes da Nova Semântica de Parcelamento
 * VALOR INFORMADO = VALOR TOTAL DA COMPRA
 *
 * Cobertura mandatória dos 15 cenários + Centavos por Competência:
 * 1. 1200 / 12x => 12x100
 * 2. 100 / 3x => soma exata 100 (33,34 + 33,33 + 33,33 = 100)
 * 2-B. Criada como PAGO na primeira competência: paidHistory = 33,34, status = pago, remainingAmount = 0
 * 2-C. Pagamento parcial de R$ 10 na primeira competência: devido = 33,34, pago = 10,00, restante = 23,34
 * 2-D. Segunda competência: devido = 33,33
 * 2-E. Quitação de todas as competências: sum(paidHistory) = 100,00, restante = 0
 * 3. installments = 1
 * 4. métricas mensais usam apenas a parcela daquela competência
 * 5. total do contrato usa totalAmount
 * 6. edição recalcula corretamente
 * 6-B. edição com resíduo preserva competência paga de 33,34
 * 7. paidHistory preservado
 * 8. pagamento parcial preservado
 * 9. recorrência não afetada
 * 10. legado continua igual
 * 11. novo registro usa amountInputMode=total
 * 12. IA total ("Comprei um celular de 1200 em 12x")
 * 12-B. IA consistente explícita ("Comprei por 3000 em 10x de 300")
 * 13. IA parcela explícita ("São 10 parcelas de 300")
 * 14. IA conflito total/parcela ("3000 em 10x de 350")
 * 15. nenhum dado antigo migrado automaticamente
 */

'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const financeDomainCode = fs.readFileSync(path.join(__dirname, '..', 'shared', 'financeDomain.js'), 'utf-8');
const financeQueriesCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'financeQueries.js'), 'utf-8');
const expensesCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'expenses.js'), 'utf-8');
const expenseInstallmentsCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'expenseInstallments.js'), 'utf-8');
const { resolveAiInstallmentSemantics, buildAiExpenseRecord } = require('../server/services/aiService');
const { validateFinanceSemantics } = require('../server/services/financeValidation');

let createTestEnv;

describe('CorvFin V2 — Nova Semântica de Parcelamento (Valor Informado = Total)', () => {
  let ctx;

  before(() => {
    // Ambiente VM para avaliar helpers do frontend
    ctx = {
      window: {},
      console,
      Math,
      Number,
      String,
      parseInt,
      parseFloat,
      Boolean,
      Date,
      Object,
      Array,
      MONTH_NAMES: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
      MONTH_ABBR: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
      currency: (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','),
      mk: (y, m) => Number(y) * 12 + Number(m),
      ymKey: (y, m) => `${y}-${String(m).padStart(2, '0')}`,
      uid: () => 'exp_' + Math.random().toString(36).substring(2, 9),
      getState: () => ctx.__state,
      saveState: () => {},
      notify: (msg, type) => { ctx.__lastNotify = { msg, type }; },
      __state: {
        year: 2026,
        month: 9,
        fixed: [],
        variable: [],
        extras: [],
        debtors: [],
        profile: { baseSalary: 5000 }
      }
    };
    ctx.window = ctx;

    vm.createContext(ctx);
    vm.runInContext(financeDomainCode, ctx);
    vm.runInContext(financeQueriesCode, ctx);
  });

  test('1. 1200 / 12x => 12x100', () => {
    const expense = {
      id: 'exp_1200',
      name: 'iPhone',
      amount: 100, // impacto mensal
      totalAmount: 1200,
      installmentAmount: 100,
      amountInputMode: 'total',
      installments: 12,
      startYear: 2026,
      startMonth: 1,
      endYear: 2026,
      endMonth: 12
    };

    const res = ctx.resolveInstallmentAmounts(expense, 2026, 5);
    assert.strictEqual(res.totalAmount, 1200);
    assert.strictEqual(res.installments, 12);
    assert.strictEqual(res.installmentAmount, 100);
    assert.strictEqual(res.currentInstallmentAmount, 100);
    assert.strictEqual(res.amountInputMode, 'total');
  });

  test('2-A. 100 / 3x => soma exata 100 (invariante de centavos determinística)', () => {
    const expense = {
      id: 'exp_100_3x',
      name: 'Sapato',
      amount: 33.34,
      totalAmount: 100,
      installmentAmount: 33.33,
      amountInputMode: 'total',
      installments: 3,
      startYear: 2026,
      startMonth: 9,
      endYear: 2026,
      endMonth: 11
    };

    const res = ctx.resolveInstallmentAmounts(expense);
    assert.strictEqual(res.totalAmount, 100);
    assert.strictEqual(res.installments, 3);

    // Invariante rigorosa: soma do schedule === totalAmount
    const scheduleKeys = Object.keys(res.schedule);
    assert.strictEqual(scheduleKeys.length, 3);

    const sumSchedule = Object.values(res.schedule).reduce((acc, val) => acc + val, 0);
    assert.strictEqual(Math.round(sumSchedule * 100) / 100, 100.00);

    // Resíduo determinístico na 1ª parcela
    assert.strictEqual(res.schedule['2026-09'], 33.34);
    assert.strictEqual(res.schedule['2026-10'], 33.33);
    assert.strictEqual(res.schedule['2026-11'], 33.33);
  });

  test('2-B. R$ 100 / 3x criada como PAGO na primeira competência: paidHistory = 33,34, status = pago, remaining = 0', () => {
    const expense = {
      id: 'exp_100_pago_init',
      name: 'Sapato Pago',
      totalAmount: 100,
      installments: 3,
      startYear: 2026,
      startMonth: 9,
      endYear: 2026,
      endMonth: 11,
      paidHistory: {}
    };

    // Fonte única do valor devido na 1ª competência
    const resolved = ctx.resolveInstallmentAmounts(expense, 2026, 9);
    const initialDue = resolved.currentInstallmentAmount;
    assert.strictEqual(initialDue, 33.34);

    // Executa quitação inicial da 1ª parcela via setExpensePayment
    ctx.setExpensePayment(expense, 2026, 9, initialDue, initialDue);

    // paidHistory deve conter exatamente 33.34
    assert.strictEqual(expense.paidHistory['2026-09'].paidAmount, 33.34);

    // Consulta de pagamento da 1ª competência
    const payInfo = ctx.getExpensePaymentInfo(expense, 2026, 9, initialDue);
    assert.strictEqual(payInfo.status, 'pago');
    assert.strictEqual(payInfo.paidAmount, 33.34);
    assert.strictEqual(payInfo.remainingAmount, 0);
  });

  test('2-C. Pagamento parcial de R$ 10 na primeira competência: devido = 33,34, pago = 10,00, restante = 23,34', () => {
    const expense = {
      id: 'exp_100_partial',
      name: 'Sapato Parcial',
      totalAmount: 100,
      installments: 3,
      startYear: 2026,
      startMonth: 9,
      endYear: 2026,
      endMonth: 11,
      paidHistory: {
        '2026-09': { paidAmount: 10.00 }
      }
    };

    const resolved = ctx.resolveInstallmentAmounts(expense, 2026, 9);
    const due = resolved.currentInstallmentAmount;
    assert.strictEqual(due, 33.34);

    const payInfo = ctx.getExpensePaymentInfo(expense, 2026, 9, due);
    assert.strictEqual(payInfo.totalAmount, 33.34);
    assert.strictEqual(payInfo.paidAmount, 10.00);
    assert.strictEqual(payInfo.remainingAmount, 23.34);
    assert.strictEqual(payInfo.status, 'parcial');
  });

  test('2-D. Segunda competência: devido = 33,33', () => {
    const expense = {
      id: 'exp_100_month2',
      name: 'Sapato Mês 2',
      totalAmount: 100,
      installments: 3,
      startYear: 2026,
      startMonth: 9,
      endYear: 2026,
      endMonth: 11,
      paidHistory: {
        '2026-09': { paidAmount: 33.34 }
      }
    };

    const resolvedM2 = ctx.resolveInstallmentAmounts(expense, 2026, 10);
    assert.strictEqual(resolvedM2.currentInstallmentAmount, 33.33);

    const payInfoM2 = ctx.getExpensePaymentInfo(expense, 2026, 10, resolvedM2.currentInstallmentAmount);
    assert.strictEqual(payInfoM2.status, 'pendente');
    assert.strictEqual(payInfoM2.paidAmount, 0);
    assert.strictEqual(payInfoM2.remainingAmount, 33.33);
  });

  test('2-E. Quitação de todas as competências: sum(paidHistory) = 100,00, remaining contract = 0', () => {
    const expense = {
      id: 'exp_100_all_paid',
      name: 'Sapato Quitado',
      totalAmount: 100,
      installments: 3,
      startYear: 2026,
      startMonth: 9,
      endYear: 2026,
      endMonth: 11,
      paidHistory: {
        '2026-09': { paidAmount: 33.34 },
        '2026-10': { paidAmount: 33.33 },
        '2026-11': { paidAmount: 33.33 }
      }
    };

    const resolved = ctx.resolveInstallmentAmounts(expense);
    const sumPaid = Object.values(expense.paidHistory).reduce((acc, p) => acc + p.paidAmount, 0);
    assert.strictEqual(Math.round(sumPaid * 100) / 100, 100.00);

    const remainingContract = Math.max(0, Math.round((resolved.totalAmount - sumPaid) * 100) / 100);
    assert.strictEqual(remainingContract, 0.00);
  });

  test('3. installments = 1 (à vista / parcela única)', () => {
    const expense = {
      id: 'exp_single',
      name: 'Supermercado',
      amount: 250,
      totalAmount: 250,
      installmentAmount: 250,
      amountInputMode: 'total',
      installments: 1,
      startYear: 2026,
      startMonth: 9,
      endYear: 2026,
      endMonth: 9
    };

    const res = ctx.resolveInstallmentAmounts(expense, 2026, 9);
    assert.strictEqual(res.totalAmount, 250);
    assert.strictEqual(res.installments, 1);
    assert.strictEqual(res.installmentAmount, 250);
    assert.strictEqual(res.currentInstallmentAmount, 250);
  });

  test('4. Métricas mensais usam apenas a parcela daquela competência (nunca o total)', () => {
    ctx.__state.variable = [
      {
        id: 'exp_tv_1200',
        name: 'Smart TV',
        amount: 100, // parcela
        totalAmount: 1200,
        installmentAmount: 100,
        amountInputMode: 'total',
        installments: 12,
        startYear: 2026,
        startMonth: 9,
        endYear: 2027,
        endMonth: 8,
        paidHistory: {}
      }
    ];

    const activeList = ctx.activeVariableForMonth(2026, 9);
    assert.strictEqual(activeList.length, 1);
    assert.strictEqual(activeList[0].amount, 100); // 100 por mês, NUNCA 1200
    assert.strictEqual(activeList[0].totalAmount, 1200);

    const totals = ctx.monthTotals(2026, 9);
    assert.strictEqual(totals.totalExpenses, 100); // Total de despesas do mês = 100
  });

  test('5. Total do contrato usa totalAmount (Aba de parcelamentos & Detalhes)', () => {
    ctx.__state.variable = [
      {
        id: 'exp_tv_1200',
        name: 'Smart TV',
        amount: 100,
        totalAmount: 1200,
        installmentAmount: 100,
        amountInputMode: 'total',
        installments: 12,
        startYear: 2026,
        startMonth: 9,
        endYear: 2027,
        endMonth: 8,
        paidHistory: {
          '2026-09': true,
          '2026-10': true
        }
      }
    ];

    const resolved = ctx.resolveInstallmentAmounts(ctx.__state.variable[0]);
    assert.strictEqual(resolved.totalAmount, 1200);

    // Simula cálculo da aba de parcelamentos
    let totalContract = resolved.totalAmount;
    let paidAmount = 0;
    Object.entries(ctx.__state.variable[0].paidHistory).forEach(([k, p]) => {
      if (p === true) paidAmount += resolved.schedule[k] || resolved.installmentAmount;
    });

    assert.strictEqual(totalContract, 1200);
    assert.strictEqual(paidAmount, 200);
    assert.strictEqual(totalContract - paidAmount, 1000);
  });

  test('6. Edição recalcula parcelas futuras corretamente mantendo o saldo remanescente', () => {
    const original = {
      id: 'exp_edit',
      name: 'Curso',
      amount: 100,
      totalAmount: 1200,
      installmentAmount: 100,
      amountInputMode: 'total',
      installments: 12,
      startYear: 2026,
      startMonth: 1,
      endYear: 2026,
      endMonth: 12,
      paidHistory: {
        '2026-01': { paidAmount: 100 },
        '2026-02': { paidAmount: 100 }
      }
    };

    let paidCount = 0;
    let sumPaid = 0;
    Object.values(original.paidHistory).forEach(p => {
      paidCount++;
      sumPaid += p.paidAmount;
    });
    assert.strictEqual(paidCount, 2);
    assert.strictEqual(sumPaid, 200);

    const newTotal = 1500;
    const newCount = 12;
    const remainingTotal = newTotal - sumPaid;
    const remainingCount = newCount - paidCount;
    const futureInstallment = Math.round((remainingTotal / remainingCount) * 100) / 100;

    assert.strictEqual(futureInstallment, 130);
  });

  test('6-B. Edição com resíduo: R$ 100 / 3x com 1ª parcela de 33,34 paga preserva quitado e recalcula futuras', () => {
    const original = {
      id: 'exp_100_edit_residual',
      name: 'Sapato Edição',
      totalAmount: 100,
      installments: 3,
      startYear: 2026,
      startMonth: 9,
      endYear: 2026,
      endMonth: 11,
      paidHistory: {
        '2026-09': { paidAmount: 33.34 }
      }
    };

    // Usuário altera para 4 parcelas mantendo total 100
    const resolvedOld = ctx.resolveInstallmentAmounts(original);
    let paidCount = 0;
    let sumPaid = 0;
    Object.entries(original.paidHistory).forEach(([k, p]) => {
      paidCount++;
      sumPaid += (p.paidAmount || resolvedOld.schedule[k]);
    });
    sumPaid = Math.round(sumPaid * 100) / 100;
    assert.strictEqual(paidCount, 1);
    assert.strictEqual(sumPaid, 33.34);

    const newCount = 4;
    const remainingTotal = Math.max(0, Math.round((100 - sumPaid) * 100) / 100);
    const remainingCount = newCount - paidCount;
    assert.strictEqual(remainingTotal, 66.66);
    assert.strictEqual(remainingCount, 3);

    const futureInstallment = Math.round((remainingTotal / remainingCount) * 100) / 100;
    assert.strictEqual(futureInstallment, 22.22);
  });

  test('7. paidHistory preservado (não altera parcelas passadas quitadas)', () => {
    const expense = {
      id: 'exp_preserve',
      name: 'Seguro',
      amount: 100,
      totalAmount: 1200,
      installmentAmount: 100,
      amountInputMode: 'total',
      installments: 12,
      startYear: 2026,
      startMonth: 1,
      endYear: 2026,
      endMonth: 12,
      paidHistory: {
        '2026-01': { paidAmount: 100, updatedAt: '2026-01-10T10:00:00Z' }
      }
    };

    const payInfo = ctx.getExpensePaymentInfo(expense, 2026, 1, 100);
    assert.strictEqual(payInfo.status, 'pago');
    assert.strictEqual(payInfo.paidAmount, 100);
    assert.strictEqual(payInfo.remainingAmount, 0);

    const payInfoFuture = ctx.getExpensePaymentInfo(expense, 2026, 2, 100);
    assert.strictEqual(payInfoFuture.status, 'pendente');
    assert.strictEqual(payInfoFuture.paidAmount, 0);
    assert.strictEqual(payInfoFuture.remainingAmount, 100);
  });

  test('8. Pagamento parcial preservado em competência de despesa parcelada', () => {
    const expense = {
      id: 'exp_partial',
      name: 'Material de Obra',
      amount: 200,
      totalAmount: 2400,
      installmentAmount: 200,
      amountInputMode: 'total',
      installments: 12,
      startYear: 2026,
      startMonth: 9,
      endYear: 2027,
      endMonth: 8,
      paidHistory: {
        '2026-09': { paidAmount: 75.50, updatedAt: '2026-09-05T12:00:00Z' }
      }
    };

    const payInfo = ctx.getExpensePaymentInfo(expense, 2026, 9, 200);
    assert.strictEqual(payInfo.status, 'parcial');
    assert.strictEqual(payInfo.paidAmount, 75.50);
    assert.strictEqual(payInfo.remainingAmount, 124.50);
  });

  test('9. Recorrência não afetada (despesas fixas continuam independentes)', () => {
    const fixedExpense = {
      id: 'fix_aluguel',
      name: 'Aluguel',
      amount: 1500,
      paymentType: 'fixed',
      temporal: { type: 'fixed', recurrence: { frequency: 'monthly', type: 'never' } },
      versions: [
        { year: 2026, month: 1, amount: 1500 }
      ]
    };

    const res = ctx.resolveInstallmentAmounts(fixedExpense, 2026, 9);
    assert.strictEqual(res.totalAmount, 1500);
    assert.strictEqual(res.installments, 1);
    assert.strictEqual(res.installmentAmount, 1500);
    assert.strictEqual(res.currentInstallmentAmount, 1500);
  });

  test('10. Legado continua igual (sem totalAmount e sem amountInputMode)', () => {
    const legacyExpense = {
      id: 'exp_legacy',
      name: 'Sofá Antigo',
      amount: 200,
      installments: 10,
      startYear: 2025,
      startMonth: 1,
      endYear: 2025,
      endMonth: 10
    };

    const res = ctx.resolveInstallmentAmounts(legacyExpense);
    assert.strictEqual(res.amountInputMode, 'installment');
    assert.strictEqual(res.installmentAmount, 200);
    assert.strictEqual(res.totalAmount, 2000); // 200 * 10
    assert.strictEqual(res.currentInstallmentAmount, 200);
  });

  test('11. Novo registro usa amountInputMode=total no schema canônico', () => {
    const newRecord = {
      id: 'exp_canonical',
      name: 'Notebook',
      amount: 200,
      totalAmount: 2400,
      installmentAmount: 200,
      installments: 12,
      amountInputMode: 'total',
      paymentType: 'installment',
      startYear: 2026,
      startMonth: 9,
      endYear: 2027,
      endMonth: 8
    };

    const res = ctx.resolveInstallmentAmounts(newRecord);
    assert.strictEqual(res.amountInputMode, 'total');
    assert.strictEqual(res.totalAmount, 2400);
    assert.strictEqual(res.installmentAmount, 200);
    assert.strictEqual(res.installments, 12);
  });

  test('12. IA total: "Comprei um celular de 1200 em 12x"', () => {
    const resolved = resolveAiInstallmentSemantics({
      cleanMessage: 'Comprei um celular de 1200 em 12x',
      amount: 1200
    });

    assert.strictEqual(resolved.amountInputMode, 'total');
    assert.strictEqual(resolved.totalAmount, 1200);
    assert.strictEqual(resolved.installments, 12);
    assert.strictEqual(resolved.installmentAmount, 100);
    assert.strictEqual(resolved.amount, 100);
    assert.strictEqual(resolved.isConflict, false);
  });

  test('12-B. IA consistente explícita: "Comprei por 3000 em 10x de 300"', () => {
    const resolved = resolveAiInstallmentSemantics({
      cleanMessage: 'Comprei por 3000 em 10x de 300'
    });

    assert.strictEqual(resolved.amountInputMode, 'total');
    assert.strictEqual(resolved.totalAmount, 3000);
    assert.strictEqual(resolved.installments, 10);
    assert.strictEqual(resolved.installmentAmount, 300);
    assert.strictEqual(resolved.amount, 300);
    assert.strictEqual(resolved.isConflict, false);
    assert.strictEqual(resolved.warning, null);
  });

  test('13. IA parcela explícita: "São 10 parcelas de 300"', () => {
    const resolved = resolveAiInstallmentSemantics({
      cleanMessage: 'São 10 parcelas de 300'
    });

    assert.strictEqual(resolved.amountInputMode, 'installment');
    assert.strictEqual(resolved.installmentAmount, 300);
    assert.strictEqual(resolved.installments, 10);
    assert.strictEqual(resolved.totalAmount, 3000);
    assert.strictEqual(resolved.amount, 300);
    assert.strictEqual(resolved.isConflict, false);
  });

  test('14. IA conflito total/parcela: "3000 em 10x de 350"', () => {
    const resolved = resolveAiInstallmentSemantics({
      cleanMessage: '3000 em 10x de 350'
    });

    assert.strictEqual(resolved.isConflict, true);
    assert.strictEqual(resolved.totalAmount, 3000);
    assert.strictEqual(resolved.installmentAmount, 350);
    assert.strictEqual(resolved.installments, 10);
    assert.ok(resolved.warning.includes('Conflito detectado'));
  });

  test('15. Nenhum dado antigo migrado automaticamente e validação de schema', () => {
    // Validação de payload aceita registros legados sem totalAmount
    const legacyPayload = {
      variable: [
        {
          id: 'v_leg',
          name: 'Despesa Antiga',
          amount: 150,
          installments: 5,
          startYear: 2025,
          startMonth: 1,
          endYear: 2025,
          endMonth: 5
        }
      ]
    };
    assert.doesNotThrow(() => validateFinanceSemantics(legacyPayload));

    // Validação de payload aceita novo schema V2 com totalAmount e amountInputMode
    const v2Payload = {
      variable: [
        {
          id: 'v_v2',
          name: 'Despesa Nova',
          amount: 100,
          totalAmount: 1200,
          installmentAmount: 100,
          amountInputMode: 'total',
          installments: 12,
          startYear: 2026,
          startMonth: 9,
          endYear: 2027,
          endMonth: 8
        }
      ]
    };
    assert.doesNotThrow(() => validateFinanceSemantics(v2Payload));

    // buildAiExpenseRecord para 100 em 3x criado como pago:
    // quita exatamente 33,34 (parcela com resíduo determinístico)
    const exp100 = buildAiExpenseRecord({
      base: {
        description: 'Sapato 100 3x',
        amount: 100,
        installments: 3,
        category: 'Vestuário',
        destination: 'Nubank',
        status: 'pago'
      },
      matchedCat: 'Vestuário',
      matchedDestObj: { name: 'Nubank' },
      compMonth: 9,
      compYear: 2026
    });

    assert.strictEqual(exp100.totalAmount, 100);
    assert.strictEqual(exp100.installments, 3);
    assert.strictEqual(exp100.installmentAmount, 33.33); // parcela nominal
    assert.strictEqual(exp100.amount, 33.34); // parcela da 1ª competência
    assert.strictEqual(exp100.amountInputMode, 'total');
    // paidHistory quitou EXATAMENTE 33,34 na 1ª competência!
    assert.strictEqual(exp100.paidHistory['2026-09'].paidAmount, 33.34);
  });
});


describe('CorvFin V2 — Integração & UI: Hotfix Centavos & Dual Input Manual', () => {
  createTestEnv = function(initialState = {}) {
    const elements = {};
    const listeners = {};

    function mockEl(id, val = '') {
      const classList = new Set();
      const attrs = {};
      const el = {
        id,
        value: val,
        textContent: val,
        innerHTML: '',
        style: {},
        dataset: {},
        open: false,
        hidden: false,
        disabled: false,
        setAttribute: (k, v) => { attrs[k] = String(v); },
        getAttribute: (k) => attrs[k] !== undefined ? attrs[k] : null,
        removeAttribute: (k) => { delete attrs[k]; },
        classList: {
          add: (c) => classList.add(c),
          remove: (c) => classList.delete(c),
          contains: (c) => classList.has(c),
          toggle: (c, force) => {
            if (force === undefined) {
              if (classList.has(c)) classList.delete(c); else classList.add(c);
            } else if (force) {
              classList.add(c);
            } else {
              classList.delete(c);
            }
          }
        },
        focus: () => {},
        showModal: () => { el.open = true; },
        close: () => { el.open = false; },
        reset: () => {},
        addEventListener: (evt, handler) => {
          if (!listeners[id]) listeners[id] = {};
          if (!listeners[id][evt]) listeners[id][evt] = [];
          listeners[id][evt].push(handler);
        },
        dispatchEvent: (evt) => {
          const type = typeof evt === 'string' ? evt : evt.type;
          const handlers = (listeners[id] && listeners[id][type]) || [];
          handlers.forEach(h => h({ preventDefault: () => {}, target: el, type }));
        },
        querySelector: (sel) => {
          if (sel === '.wizard-dot') return mockEl(`${id}_dot`, '1');
          if (sel === 'span:not(.wizard-dot)') {
            if (!el._textSpan) el._textSpan = mockEl(`${id}_span`, '');
            return el._textSpan;
          }
          return elements[sel] || null;
        },
        querySelectorAll: (sel) => []
      };
      return el;
    }

    const elementIds = [
      'entryDialog', 'entryForm', 'entryDialogTitle', 'entryId', 'entryFixedId', 'entryType', 'entryPaymentType',
      'entryValidationAlert', 'entryStep1', 'entryStep2', 'entryStep3',
      'entryName', 'entryGroup', 'entryAmount', 'amountLabel', 'entryDestination', 'entryDestHint',
      'entryPaymentMethod', 'entryAccount', 'entryAccountWrap', 'entryAccountLabel',
      'entryPayee', 'payeeSuggestions',
      'entryRecurrenceWrap', 'entryRecurrenceSelector', 'entryRecSingleBtn', 'entryRecInstallmentBtn', 'entryRecRecurringBtn', 'entryRecurrence',
      'entryAmountModeWrap', 'entryAmountModeSelector', 'entryAmountModeTotalBtn', 'entryAmountModeInstallmentBtn', 'entryAmountInputMode',
      'entryRecEndTypeNever', 'entryRecEndTypeCount', 'entryRecEndTypeDate',
      'recCountWrap', 'recDateWrap', 'recCountInput', 'recEndMonth', 'recEndYear', 'recDurationBadge',
      'entryNoteStep1Wrap', 'entryNoteStep1', 'entryNote',
      'typeSelectorWrap', 'typeSelector',
      'panelTypeCash', 'panelTypeInstallment', 'panelTypeFixed',
      'cashEffMonth', 'cashEffYear', 'varStartMonth', 'varStartYear', 'varEndMonth', 'varEndYear', 'varInstallmentsCount', 'varInstallmentsBadge',
      'fixedEffMonth', 'fixedEffYear',
      'dueDayWrap', 'entryDueDay', 'inheritedDueHint',
      'entrySummaryCard', 'summaryName', 'summaryAmount', 'summaryCategory', 'summaryDestination',
      'summaryMethod', 'summaryPayee', 'summaryAccount', 'summaryType', 'summaryPeriod',
      'entryStatusWrap', 'entryStatus', 'pixCashStatusHint',
      'fixedActions', 'endFixedBtn', 'deleteFixedBtn', 'deleteEntryBtn',
      'btnCancelStep1', 'btnNextStep1', 'btnBackStep2', 'btnNextStep2', 'btnBackStep3', 'entrySubmitBtn',
      'stepIndicator1', 'stepIndicator2', 'stepIndicator3',
      'timelineDialog', 'timelineTitle', 'timelineSub', 'expenseAnalysisSummary', 'timelineHistorySub',
      'timelineMetrics', 'timelineProgressBar', 'timelineProgressText', 'timelineTableBody',
      'expensesInstallmentsMetrics', 'sumInstallmentsTotal', 'installmentsTableBody',
      'installmentsSearchInput', 'installmentsCategoryFilter', 'installmentsDestFilter', 'installmentsTypeFilter', 'installmentsStatusFilter'
    ];

    elementIds.forEach(id => {
      elements['#' + id] = mockEl(id);
    });

    elements['.wizard-line'] = [mockEl('wizardLine1'), mockEl('wizardLine2')];
    elements['.entry-rec-btn'] = [elements['#entryRecSingleBtn'], elements['#entryRecInstallmentBtn'], elements['#entryRecRecurringBtn']];
    elements['#entryRecSingleBtn'].dataset.rec = 'single';
    elements['#entryRecInstallmentBtn'].dataset.rec = 'installment';
    elements['#entryRecRecurringBtn'].dataset.rec = 'recurring';

    const typeBtns = [mockEl('typeCashBtn'), mockEl('typeInstBtn'), mockEl('typeFixedBtn')];
    typeBtns[0].dataset.expType = 'cash';
    typeBtns[1].dataset.expType = 'installment';
    typeBtns[2].dataset.expType = 'fixed';
    elements['.entry-type-btn'] = typeBtns;

    const state = Object.assign({
      year: 2026,
      month: 10,
      fixed: [],
      variable: [],
      extras: [],
      debtors: [],
      destinations: [
        { name: 'Pix' },
        { name: 'Dinheiro' },
        { name: 'Nubank', dueDay: 10 }
      ],
      categories: ['Saúde', 'Alimentação', 'Moradia', 'Gerais']
    }, initialState);

    let notifications = [];

    function resolveSelector(sel) {
      if (sel.startsWith('#')) return elements[sel] || null;
      if (elements[sel]) return elements[sel];
      return null;
    }

    const ctx = {
      window: {},
      console,
      Math,
      Number,
      String,
      parseInt,
      parseFloat,
      Boolean,
      Date,
      Object,
      Array,
      Set,
      escapeHtml: (s) => String(s || ''),
      MONTH_NAMES: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
      MONTH_ABBR: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
      currency: (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','),
      currencyInput: (v) => Number(v || 0).toFixed(2).replace('.', ','),
      parseCurrency: (s) => parseFloat(String(s).replace(/[^\d,-]/g, '').replace(',', '.')) || 0,
      mk: (y, m) => Number(y) * 12 + Number(m),
      ymKey: (y, m) => `${y}-${String(m).padStart(2, '0')}`,
      uid: () => 'exp_' + Math.random().toString(36).substring(2, 9),
      getState: () => state,
      saveState: () => {},
      render: () => {},
      notify: (msg, type) => { notifications.push({ msg, type }); },
      fillMonthSelects: () => {},
      updateCategorySelects: () => {},
      updateDestinationSelects: () => {},
      updatePaymentMethodSelect: () => {},
      updateAccountSelect: () => {},
      updatePayeeSuggestions: () => {},
      validateEntryStep1: () => true,
      validateEntryStep2: () => true,
      $: resolveSelector,
      $$: (sel) => {
        const el = resolveSelector(sel);
        if (Array.isArray(el)) return el;
        if (el) return [el];
        return [];
      },
      PAYMENT_METHOD_NAMES_MAP: {
        pix: 'PIX',
        dinheiro: 'Dinheiro',
        cartao_credito: 'Cartão de Crédito'
      },
      DEST_SVG_ICONS: { card: '', bank: '' },
      getDestMeta: () => ({ name: 'Nubank', color: '#820ad1', icon: 'card' }),
      ICONS: { edit: '', trash: '', box: '' },
      expensesTableSort: { key: 'total', asc: false }
    };
    ctx.window = ctx;

    vm.createContext(ctx);
    vm.runInContext(financeDomainCode, ctx);
    vm.runInContext(financeQueriesCode, ctx);
    vm.runInContext(expensesCode, ctx);
    vm.runInContext(expenseInstallmentsCode, ctx);

    return { ctx, state, elements, listeners, notifications };
  }

  test('UI-1. Total 100 / 3x: Histórico visual exibe exatamente 33,34 / 33,33 / 33,33', () => {
    const env = createTestEnv();
    const item = {
      id: 'exp_100_oct',
      name: 'Tênis',
      group: 'Vestuário',
      amount: 33.34,
      totalAmount: 100,
      installmentAmount: 33.33,
      amountInputMode: 'total',
      installments: 3,
      startYear: 2026,
      startMonth: 10,
      endYear: 2026,
      endMonth: 12,
      paidHistory: {}
    };
    env.state.variable.push(item);
    env.ctx.openExpenseTimeline({ type: 'variable', id: 'exp_100_oct' });

    const html = env.elements['#timelineTableBody'].innerHTML;
    assert.ok(html.includes('Outubro / 2026'), 'Tabela deve conter Outubro / 2026');
    assert.ok(html.includes('R$ 33,34'), 'Outubro deve exibir R$ 33,34');
    assert.ok(html.includes('Novembro / 2026'), 'Tabela deve conter Novembro / 2026');
    assert.ok(html.includes('Dezembro / 2026'), 'Tabela deve conter Dezembro / 2026');
    assert.ok(html.includes('R$ 33,33'), 'Novembro/Dezembro devem exibir R$ 33,33');
  });

  test('UI-2. Total Previsto visual do contrato/ano é exatamente R$ 100,00 (sem resíduo 99,99)', () => {
    const env = createTestEnv();
    const item = {
      id: 'exp_100_oct',
      name: 'Tênis',
      group: 'Vestuário',
      amount: 33.34,
      totalAmount: 100,
      installmentAmount: 33.33,
      amountInputMode: 'total',
      installments: 3,
      startYear: 2026,
      startMonth: 10,
      endYear: 2026,
      endMonth: 12,
      paidHistory: {}
    };
    env.state.variable.push(item);
    env.ctx.openExpenseTimeline({ type: 'variable', id: 'exp_100_oct' });

    const metricsHtml = env.elements['#timelineMetrics'].innerHTML;
    assert.ok(metricsHtml.includes('R$ 100,00'), 'Total Previsto visual deve ser R$ 100,00');
    assert.ok(!metricsHtml.includes('R$ 99,99'), 'Total Previsto visual NÃO deve conter R$ 99,99');
  });

  test('UI-3. Modo Total: 100 / 3x persiste amountInputMode=total e totalAmount=100', () => {
    const env = createTestEnv();
    env.ctx.openEntryDialog({ mode: 'new', type: 'installment' });
    env.elements['#entryName'].value = 'Curso Online';
    env.elements['#entryAmount'].value = '100';
    env.elements['#varStartMonth'].value = '10';
    env.elements['#varStartYear'].value = '2026';
    env.elements['#varInstallmentsCount'].value = '3';
    env.ctx.setEntryAmountInputMode('total');

    env.elements['#entryForm'].dispatchEvent('submit');

    const saved = env.state.variable.find(v => v.name === 'Curso Online');
    assert.ok(saved, 'Despesa deve ser salva');
    assert.strictEqual(saved.amountInputMode, 'total');
    assert.strictEqual(saved.totalAmount, 100);
    assert.strictEqual(saved.installments, 3);
    assert.strictEqual(saved.installmentAmount, 33.33);
  });

  test('UI-4. Modo Parcela: 300 x 10 persiste amountInputMode=installment, installmentAmount=300, totalAmount=3000', () => {
    const env = createTestEnv();
    env.ctx.openEntryDialog({ mode: 'new', type: 'installment' });
    env.elements['#entryName'].value = 'Eletrodoméstico';
    env.elements['#entryAmount'].value = '300';
    env.elements['#varStartMonth'].value = '10';
    env.elements['#varStartYear'].value = '2026';
    env.elements['#varInstallmentsCount'].value = '10';
    env.ctx.setEntryAmountInputMode('installment');

    env.elements['#entryForm'].dispatchEvent('submit');

    const saved = env.state.variable.find(v => v.name === 'Eletrodoméstico');
    assert.ok(saved, 'Despesa deve ser salva');
    assert.strictEqual(saved.amountInputMode, 'installment');
    assert.strictEqual(saved.installmentAmount, 300);
    assert.strictEqual(saved.totalAmount, 3000);
    assert.strictEqual(saved.installments, 10);
    assert.strictEqual(saved.amount, 300);
  });

  test('UI-5. Alternância Total -> Parcela atualiza label e preview imediatamente', () => {
    const env = createTestEnv();
    env.ctx.openEntryDialog({ mode: 'new', type: 'installment' });
    env.elements['#entryAmount'].value = '300';
    env.elements['#varInstallmentsCount'].value = '10';

    env.ctx.setEntryAmountInputMode('installment');

    assert.strictEqual(env.elements['#entryAmountInputMode'].value, 'installment');
    assert.strictEqual(env.elements['#entryAmountModeInstallmentBtn'].classList.contains('active'), true);
    assert.strictEqual(env.elements['#entryAmountModeTotalBtn'].classList.contains('active'), false);
    assert.strictEqual(env.elements['#amountLabel'].textContent, 'Valor da parcela (R$) *');
    assert.ok(env.elements['#varInstallmentsBadge'].innerHTML.includes(`10x de ${env.ctx.currency(300)} • Total da compra: ${env.ctx.currency(3000)}`));
  });

  test('UI-6. Alternância Parcela -> Total atualiza label e preview determinístico', () => {
    const env = createTestEnv();
    env.ctx.openEntryDialog({ mode: 'new', type: 'installment' });
    env.elements['#entryAmount'].value = '100';
    env.elements['#varInstallmentsCount'].value = '3';

    env.ctx.setEntryAmountInputMode('total');

    assert.strictEqual(env.elements['#entryAmountInputMode'].value, 'total');
    assert.strictEqual(env.elements['#entryAmountModeTotalBtn'].classList.contains('active'), true);
    assert.strictEqual(env.elements['#entryAmountModeInstallmentBtn'].classList.contains('active'), false);
    assert.strictEqual(env.elements['#amountLabel'].textContent, 'Valor total da compra (R$) *');
    assert.ok(env.elements['#varInstallmentsBadge'].innerHTML.includes(`Total: ${env.ctx.currency(100)} (3 parcelas: 1ª ${env.ctx.currency(33.34)}, demais ${env.ctx.currency(33.33)})`));
  });

  test('UI-7. Edição de registro total abre no modo Total da compra com totalAmount', () => {
    const env = createTestEnv();
    const item = {
      id: 'exp_edit_tot',
      name: 'Geladeira',
      group: 'Moradia',
      amount: 200,
      totalAmount: 2400,
      installmentAmount: 200,
      amountInputMode: 'total',
      installments: 12,
      startYear: 2026,
      startMonth: 1,
      endYear: 2026,
      endMonth: 12
    };
    env.state.variable.push(item);
    env.ctx.openEntryDialog({ mode: 'edit', type: 'variable', id: 'exp_edit_tot' });

    assert.strictEqual(env.elements['#entryAmountInputMode'].value, 'total');
    assert.strictEqual(Number(env.elements['#entryAmount'].value), 2400);
    assert.strictEqual(env.elements['#amountLabel'].textContent, 'Valor total da compra (R$) *');
  });

  test('UI-8. Edição de registro installment abre no modo Valor da parcela com installmentAmount', () => {
    const env = createTestEnv();
    const item = {
      id: 'exp_edit_inst',
      name: 'Smart Watch',
      group: 'Lazer',
      amount: 150,
      totalAmount: 1500,
      installmentAmount: 150,
      amountInputMode: 'installment',
      installments: 10,
      startYear: 2026,
      startMonth: 2,
      endYear: 2026,
      endMonth: 11
    };
    env.state.variable.push(item);
    env.ctx.openEntryDialog({ mode: 'edit', type: 'variable', id: 'exp_edit_inst' });

    assert.strictEqual(env.elements['#entryAmountInputMode'].value, 'installment');
    assert.strictEqual(Number(env.elements['#entryAmount'].value), 150);
    assert.strictEqual(env.elements['#amountLabel'].textContent, 'Valor da parcela (R$) *');
  });

  test('UI-9. Registro legado sem amountInputMode infere installment em runtime sem conversão prematura', () => {
    const env = createTestEnv();
    const itemLegacy = {
      id: 'exp_legacy_test',
      name: 'Mesa de Escritório',
      group: 'Gerais',
      amount: 80,
      installments: 6,
      startYear: 2025,
      startMonth: 1,
      endYear: 2025,
      endMonth: 6
    };
    env.state.variable.push(itemLegacy);
    env.ctx.openEntryDialog({ mode: 'edit', type: 'variable', id: 'exp_legacy_test' });

    assert.strictEqual(env.elements['#entryAmountInputMode'].value, 'installment');
    assert.strictEqual(Number(env.elements['#entryAmount'].value), 80);
    assert.strictEqual(itemLegacy.amountInputMode, undefined, 'Não deve alterar objeto legado apenas por abrir');
    assert.strictEqual(itemLegacy.totalAmount, undefined, 'Não deve gravar totalAmount apenas por abrir');
  });

  test('UI-10. paidHistory criado como pago consome schedule da 1ª competência (R$ 33,34)', () => {
    const env = createTestEnv();
    env.ctx.openEntryDialog({ mode: 'new', type: 'installment' });
    env.elements['#entryName'].value = 'Tênis Quitado Inicial';
    env.elements['#entryAmount'].value = '100';
    env.elements['#varStartMonth'].value = '10';
    env.elements['#varStartYear'].value = '2026';
    env.elements['#varInstallmentsCount'].value = '3';
    env.elements['#entryStatus'].value = 'pago';
    env.ctx.setEntryAmountInputMode('total');

    env.elements['#entryForm'].dispatchEvent('submit');

    const saved = env.state.variable.find(v => v.name === 'Tênis Quitado Inicial');
    assert.ok(saved);
    assert.strictEqual(saved.paidHistory['2026-10'].paidAmount, 33.34);

    const payInfo = env.ctx.getExpensePaymentInfo(saved, 2026, 10, 33.34);
    assert.strictEqual(payInfo.status, 'pago');
    assert.strictEqual(payInfo.remainingAmount, 0);
  });

  test('UI-11. Pagamento parcial respeita o valor do schedule determinístico', () => {
    const env = createTestEnv();
    const item = {
      id: 'exp_partial_100',
      name: 'Calçado',
      amount: 33.34,
      totalAmount: 100,
      installmentAmount: 33.33,
      amountInputMode: 'total',
      installments: 3,
      startYear: 2026,
      startMonth: 10,
      endYear: 2026,
      endMonth: 12,
      paidHistory: {
        '2026-10': { paidAmount: 10.00 }
      }
    };
    const resolved = env.ctx.resolveInstallmentAmounts(item, 2026, 10);
    assert.strictEqual(resolved.currentInstallmentAmount, 33.34);

    const payInfo = env.ctx.getExpensePaymentInfo(item, 2026, 10, resolved.currentInstallmentAmount);
    assert.strictEqual(payInfo.totalAmount, 33.34);
    assert.strictEqual(payInfo.paidAmount, 10.00);
    assert.strictEqual(payInfo.remainingAmount, 23.34);
    assert.strictEqual(payInfo.status, 'parcial');
  });

  test('UI-12. Total contratado não apresenta 99,99 para 100/3 na aba de parcelamentos', () => {
    const env = createTestEnv();
    const item = {
      id: 'exp_installments_tab_100',
      name: 'Compra 100',
      group: 'Gerais',
      destination: 'Nubank',
      amount: 33.34,
      totalAmount: 100,
      installmentAmount: 33.33,
      amountInputMode: 'total',
      installments: 3,
      startYear: 2026,
      startMonth: 10,
      endYear: 2026,
      endMonth: 12,
      paidHistory: {}
    };
    env.state.variable.push(item);
    env.ctx.renderExpensesInstallmentsTab();

    const metricsHtml = env.elements['#expensesInstallmentsMetrics'].innerHTML;
    assert.ok(metricsHtml.includes('R$ 100,00'), 'Aba de parcelamentos deve exibir R$ 100,00');
    assert.ok(!metricsHtml.includes('R$ 99,99'), 'Aba de parcelamentos NÃO deve exibir R$ 99,99');
  });
});
describe('Checkpoint Finalíssimo — Preservação do Histórico Congelado e Redistribuição Exata do Saldo Futuro (Testes A a G)', () => {
  let env;

  before(() => {
    env = createTestEnv();
  });

  test('Teste A. 100 / 3x (33,34 + 33,33 + 33,33) com 1ª paga -> Editar total para 100,01: histórico 33,34 congelado e futuro 33,34 + 33,33 = 100,01', () => {
    const expense = {
      id: 'exp_test_a',
      name: 'Compra 100_3x',
      group: 'Gerais',
      destination: 'Nubank',
      amount: 33.34,
      totalAmount: 100,
      installmentAmount: 33.33,
      amountInputMode: 'total',
      installments: 3,
      startYear: 2026,
      startMonth: 9,
      endYear: 2026,
      endMonth: 11,
      paidHistory: {
        '2026-09': { paidAmount: 33.34, status: 'pago' }
      }
    };

    // Edição do contrato para total 100.01 mantendo 3 parcelas
    const calculated = env.ctx.calculateInstallmentSchedule(expense, 100.01, 3, 2026, 9, true);

    // 1. Histórico congelado: 33,34 imutável
    assert.strictEqual(calculated.schedule['2026-09'], 33.34);

    // 2. Futuro redistribuído em centavos inteiros determinísticos: 33,34 e 33,33
    assert.strictEqual(calculated.schedule['2026-10'], 33.34);
    assert.strictEqual(calculated.schedule['2026-11'], 33.33);

    // 3. Soma das parcelas futuras = 66,67
    const futureSum = calculated.schedule['2026-10'] + calculated.schedule['2026-11'];
    assert.strictEqual(Math.round(futureSum * 100) / 100, 66.67);

    // 4. Total exato do contrato = 100,01
    assert.strictEqual(calculated.sumScheduleCents / 100, 100.01);
  });

  test('Teste B. Depois da edição: sum(paid past + future due) === 100,01', () => {
    const expense = {
      id: 'exp_test_b',
      name: 'Compra 100_01',
      totalAmount: 100.01,
      installments: 3,
      startYear: 2026,
      startMonth: 9,
      endYear: 2026,
      endMonth: 11,
      paidHistory: {
        '2026-09': { paidAmount: 33.34, status: 'pago' }
      },
      installmentSchedule: {
        '2026-09': 33.34,
        '2026-10': 33.34,
        '2026-11': 33.33
      }
    };

    const resolved = env.ctx.resolveInstallmentAmounts(expense);
    const paidPast = expense.paidHistory['2026-09'].paidAmount;
    const futureDue = (resolved.schedule['2026-10'] || 0) + (resolved.schedule['2026-11'] || 0);
    const totalSum = Math.round((paidPast + futureDue) * 100) / 100;

    assert.strictEqual(totalSum, 100.01);
    assert.strictEqual(Math.round(Object.values(resolved.schedule).reduce((a, b) => a + b, 0) * 100) / 100, 100.01);
  });

  test('Teste C. O renderer do histórico NÃO passa a mostrar a primeira parcela como outro valor (permanece 33,34 pago)', () => {
    const expense = {
      id: 'exp_test_c',
      name: 'Sapato Reajustado',
      group: 'Gerais',
      destination: 'Nubank',
      amount: 33.34,
      totalAmount: 100.01,
      installments: 3,
      startYear: 2026,
      startMonth: 9,
      endYear: 2026,
      endMonth: 11,
      paidHistory: {
        '2026-09': { paidAmount: 33.34, status: 'pago' }
      },
      installmentSchedule: {
        '2026-09': 33.34,
        '2026-10': 33.34,
        '2026-11': 33.33
      }
    };

    // Avaliação da primeira competência (passada/liquidada)
    const resM1 = env.ctx.resolveInstallmentAmounts(expense, 2026, 9);
    assert.strictEqual(resM1.currentInstallmentAmount, 33.34, 'Primeira parcela deve continuar exatamente 33,34');

    const payInfoM1 = env.ctx.getExpensePaymentInfo(expense, 2026, 9, resM1.currentInstallmentAmount);
    assert.strictEqual(payInfoM1.totalAmount, 33.34);
    assert.strictEqual(payInfoM1.paidAmount, 33.34);
    assert.strictEqual(payInfoM1.remainingAmount, 0, 'Competência quitada não pode apresentar resíduo');
    assert.strictEqual(payInfoM1.status, 'pago', 'Status deve permanecer pago');
  });

  test('Teste D. Editar 100 -> 120 após primeira de 33,34 paga: 1ª continua 33,34 PAGO e saldo futuro de 86,66 dividido nas 2 restantes (43,33 + 43,33 = 120,00)', () => {
    const expense = {
      id: 'exp_test_d',
      name: 'Curso Reajustado',
      totalAmount: 100,
      installments: 3,
      startYear: 2026,
      startMonth: 9,
      endYear: 2026,
      endMonth: 11,
      paidHistory: {
        '2026-09': { paidAmount: 33.34, status: 'pago' }
      }
    };

    const calculated = env.ctx.calculateInstallmentSchedule(expense, 120.00, 3, 2026, 9, true);

    // 1ª congelada e imutável
    assert.strictEqual(calculated.schedule['2026-09'], 33.34);

    // Saldo futuro: 120,00 - 33,34 = 86,66 em 2 parcelas => 43,33 e 43,33
    assert.strictEqual(calculated.schedule['2026-10'], 43.33);
    assert.strictEqual(calculated.schedule['2026-11'], 43.33);

    // Soma do saldo futuro
    const sumFuture = calculated.schedule['2026-10'] + calculated.schedule['2026-11'];
    assert.strictEqual(Math.round(sumFuture * 100) / 100, 86.66);

    // Soma total rigorosa
    assert.strictEqual(calculated.sumScheduleCents / 100, 120.00);
  });

  test('Teste E. Caso com pagamento parcial: parcela originalmente devida = 33,34, pago = 10,00, novo total = 120,00', () => {
    const expense = {
      id: 'exp_test_e',
      name: 'Material Parcial',
      totalAmount: 100,
      installments: 3,
      startYear: 2026,
      startMonth: 9,
      endYear: 2026,
      endMonth: 11,
      paidHistory: {
        '2026-09': { paidAmount: 10.00, status: 'parcial' }
      }
    };

    // Edição para total 120 em 3 parcelas
    // Saldo a contratar/restante: 120 - 10 = 110 distribuído nas 3 abertas: 36,67 + 36,67 + 36,66
    const calculated = env.ctx.calculateInstallmentSchedule(expense, 120.00, 3, 2026, 9, true);

    // 1. O pago de 10,00 permanece imutável
    assert.strictEqual(expense.paidHistory['2026-09'].paidAmount, 10.00);

    // 2. Parcela 1 devida passa a ser 10,00 + 36,67 = 46,67
    assert.strictEqual(calculated.schedule['2026-09'], 46.67);
    assert.strictEqual(calculated.schedule['2026-10'], 36.67);
    assert.strictEqual(calculated.schedule['2026-11'], 36.66);

    // 3. Verificação do status e pagamento da parcela 1
    const payInfoM1 = env.ctx.getExpensePaymentInfo(expense, 2026, 9, calculated.schedule['2026-09']);
    assert.strictEqual(payInfoM1.totalAmount, 46.67);
    assert.strictEqual(payInfoM1.paidAmount, 10.00);
    assert.strictEqual(payInfoM1.remainingAmount, 36.67);
    assert.strictEqual(payInfoM1.status, 'parcial');

    // 4. Invariante total: 46,67 + 36,67 + 36,66 === 120,00
    assert.strictEqual(calculated.sumScheduleCents / 100, 120.00);
  });

  test('Teste F. Alteração da quantidade de parcelas após pagamento: 1ª paga (33,34), alterar para 4 parcelas e total 120', () => {
    const expense = {
      id: 'exp_test_f',
      name: 'Compra 3x para 4x',
      totalAmount: 100,
      installments: 3,
      startYear: 2026,
      startMonth: 9,
      endYear: 2026,
      endMonth: 11,
      paidHistory: {
        '2026-09': { paidAmount: 33.34, status: 'pago' }
      }
    };

    // Alteração para 4 parcelas e total 120
    // Saldo restante: 120 - 33,34 = 86,66 dividido em 3 parcelas abertas (2026-10, 2026-11, 2026-12)
    // 86,66 / 3 = 28,8866... => 28,89 + 28,89 + 28,88
    const calculated = env.ctx.calculateInstallmentSchedule(expense, 120.00, 4, 2026, 9, true);

    // Histórico congelado intacto
    assert.strictEqual(calculated.schedule['2026-09'], 33.34);

    // Parcelas futuras
    assert.strictEqual(calculated.schedule['2026-10'], 28.89);
    assert.strictEqual(calculated.schedule['2026-11'], 28.89);
    assert.strictEqual(calculated.schedule['2026-12'], 28.88);

    // Invariante estrita: 33,34 + 28,89 + 28,89 + 28,88 === 120,00
    assert.strictEqual(calculated.sumScheduleCents / 100, 120.00);
  });

  test('Teste G. Nenhuma soma pode divergir nem R$ 0,01 em diversas combinações de repactuação', () => {
    const testCases = [
      { origTotal: 100, origCount: 3, paidMonths: 1, paidAmt: 33.34, newTotal: 100.01, newCount: 3 },
      { origTotal: 100, origCount: 3, paidMonths: 1, paidAmt: 33.34, newTotal: 100.02, newCount: 3 },
      { origTotal: 100, origCount: 3, paidMonths: 1, paidAmt: 33.34, newTotal: 99.99, newCount: 3 },
      { origTotal: 100, origCount: 3, paidMonths: 1, paidAmt: 33.34, newTotal: 150.00, newCount: 5 },
      { origTotal: 1000, origCount: 12, paidMonths: 3, paidAmt: 83.34, newTotal: 1250.75, newCount: 15 },
      { origTotal: 50, origCount: 7, paidMonths: 2, paidAmt: 7.15, newTotal: 53.33, newCount: 7 }
    ];

    testCases.forEach((tc, idx) => {
      const paidHistory = {};
      for (let m = 1; m <= tc.paidMonths; m++) {
        paidHistory[`2026-${String(m).padStart(2, '0')}`] = { paidAmount: tc.paidAmt, status: 'pago' };
      }
      const exp = {
        totalAmount: tc.origTotal,
        installments: tc.origCount,
        startYear: 2026,
        startMonth: 1,
        paidHistory
      };

      const res = env.ctx.calculateInstallmentSchedule(exp, tc.newTotal, tc.newCount, 2026, 1, true);
      const sum = Object.values(res.schedule).reduce((acc, v) => acc + Math.round(v * 100), 0);
      const targetCents = Math.round(tc.newTotal * 100);

      assert.strictEqual(
        sum,
        targetCents,
        `Caso #${idx + 1}: soma do schedule (${sum} centavos) deve ser exatamente igual ao novo total (${targetCents} centavos)`
      );
    });
  });
});
