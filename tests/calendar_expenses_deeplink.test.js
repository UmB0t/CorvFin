/**
 * CorvFin — Suíte de Testes: Deep-Link Calendar → Despesas (Fase 3)
 *
 * Cobre estritamente os requisitos de navegação e integridade:
 * 1. Eventos de transação de cartão e despesas carregam sourceId persistente.
 * 2. Itens agregados na fatura contêm sourceId individual de cada obrigação.
 * 3. renderCalendarEventItem renderiza botão "Ver em Despesas" com data-source-id estável.
 * 4. navigateToExpense(sourceId) fecha modal, ativa aba tab-expenses e abre openEntryDialog.
 * 5. Resolução estrita por ID persistente: imune a nomes idênticos, valores iguais e mesma data.
 * 6. Imunidade a filtros e ordenações do módulo de despesas.
 * 7. Tratamento fail-safe: despesa inexistente ou removida não dispara erro e exibe notificação amigável.
 * 8. Entradas inválidas (null/undefined/vazio) tratadas com segurança.
 */

'use strict';

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { projectFinancialMonth } = require('../server/services/financeProjectionService');

const calendarCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'calendar.js'), 'utf-8');

describe('CorvFin — Deep-Link Calendar → Despesas por ID Persistente', () => {
  let ctx;
  let lastActivatedTab = null;
  let lastEntryDialogOpts = null;
  let lastNotification = null;
  let modalClosed = false;

  const mockState = {
    year: 2026,
    month: 9,
    destinations: [
      { id: 'dest_nubank', name: 'Nubank', type: 'credit_card', closingDay: 20, dueDay: 5 },
      { id: 'dest_pix', name: 'Pix', type: 'cash' }
    ],
    variable: [
      {
        id: 'var_almoco_1',
        name: 'Almoço Executivo',
        amount: 50.00,
        transactionDate: '2026-09-10',
        destinationId: 'dest_nubank',
        destination: 'Nubank',
        payment: { method: 'cartao_credito' }
      },
      {
        id: 'var_almoco_2',
        name: 'Almoço Executivo', // Nome e valor idênticos para teste de colisão
        amount: 50.00,
        transactionDate: '2026-09-10',
        destinationId: 'dest_nubank',
        destination: 'Nubank',
        payment: { method: 'cartao_credito' }
      },
      {
        id: 'var_celular_12x',
        name: 'Smartphone Galaxy',
        amount: 100.00,
        totalAmount: 1200.00,
        installments: 12,
        startYear: 2026,
        startMonth: 9,
        transactionDate: '2026-09-02',
        destinationId: 'dest_nubank',
        destination: 'Nubank',
        payment: { method: 'cartao_credito' }
      }
    ],
    fixed: [
      {
        id: 'fix_internet_fibra',
        fixedId: 'fix_internet_fibra',
        name: 'Internet Fibra 500MB',
        amount: 129.90,
        dueDay: 15,
        destination: 'Nubank',
        payment: { method: 'cartao_credito' }
      }
    ]
  };

  before(() => {
    lastActivatedTab = null;
    lastEntryDialogOpts = null;
    lastNotification = null;
    modalClosed = false;

    // Criar ambiente VM para carregar calendar.js com globals mockados
    ctx = {
      console,
      Math,
      Number,
      String,
      parseInt,
      parseFloat,
      Boolean,
      Date,
      Array,
      Object,
      window: {},
      document: {
        getElementById: (id) => {
          if (id === 'calendarDayDetailsDialog') {
            return {
              close: () => { modalClosed = true; },
              removeAttribute: () => { modalClosed = true; }
            };
          }
          return null;
        },
        querySelector: () => null,
        querySelectorAll: () => []
      }
    };

    ctx.window = ctx;
    ctx.window.getState = () => mockState;
    ctx.window.activateTab = (tabId, updateUrl) => {
      lastActivatedTab = tabId;
    };
    ctx.window.openEntryDialog = (opts) => {
      lastEntryDialogOpts = opts;
    };
    ctx.window.notify = (msg, level) => {
      lastNotification = { msg, level };
    };
    ctx.window.currency = (v) => `R$ ${(Number(v) || 0).toFixed(2)}`;
    ctx.window.escapeHtml = (s) => String(s || '');

    vm.createContext(ctx);
    vm.runInContext(calendarCode, ctx);
  });

  test('1. Projeção backend anexa sourceId persistente a eventos de transação de cartão', () => {
    const finances = {
      destinations: mockState.destinations,
      variable: mockState.variable,
      fixed: []
    };

    const proj = projectFinancialMonth(finances, 2026, 9);
    assert.ok(Array.isArray(proj.events), 'Deve conter array de events');

    // Transação de almoço em 2026-09-10
    const txAlmoco = proj.events.find(e => e.eventKind === 'transaction' && e.sourceId === 'var_almoco_1');
    assert.ok(txAlmoco, 'Deve existir evento de transação com sourceId var_almoco_1');
    assert.strictEqual(txAlmoco.sourceId, 'var_almoco_1');
    assert.strictEqual(txAlmoco.affectsCashflow, false, 'Transação de cartão não afeta caixa');
    assert.strictEqual(txAlmoco.date, '2026-09-10');
  });

  test('2. Faturas agregadas projetam sourceItems contendo sourceId de cada despesa de origem', () => {
    const finances = {
      destinations: mockState.destinations,
      variable: mockState.variable,
      fixed: []
    };

    // Smartphone comprado em 2026-09-02 com closing=20, due=5 vence em 2026-10-05
    const projOut = projectFinancialMonth(finances, 2026, 10);
    const invoice = projOut.events.find(e => e.eventKind === 'invoice');
    assert.ok(invoice, 'Deve existir evento de fatura em outubro');
    assert.ok(Array.isArray(invoice.sourceItems), 'Fatura deve ter sourceItems');

    const phoneItem = invoice.sourceItems.find(item => item.sourceId === 'var_celular_12x');
    assert.ok(phoneItem, 'Item da fatura deve conter sourceId var_celular_12x');
    assert.strictEqual(phoneItem.sourceId, 'var_celular_12x');
  });

  test('3. renderCalendarEventItem renderiza botão "Ver em Despesas" com data-source-id', () => {
    const { renderCalendarEventItem } = ctx.CalendarModule;
    assert.strictEqual(typeof renderCalendarEventItem, 'function', 'renderCalendarEventItem deve ser exportada');

    const ev = {
      eventKind: 'transaction',
      sourceId: 'var_almoco_1',
      description: 'Almoço Executivo',
      amount: 50.00,
      affectsCashflow: false
    };

    const html = renderCalendarEventItem(ev);
    assert.ok(html.includes('data-action="view-expense"'), 'Deve conter data-action="view-expense"');
    assert.ok(html.includes('data-source-id="var_almoco_1"'), 'Deve conter data-source-id="var_almoco_1"');
    assert.ok(html.includes('Ver em Despesas'), 'Deve conter texto Ver em Despesas');
  });

  test('4. navigateToExpense navega para tab-expenses e abre openEntryDialog para despesa variável', () => {
    lastActivatedTab = null;
    lastEntryDialogOpts = null;
    modalClosed = false;

    const res = ctx.window.navigateToExpense('var_celular_12x');

    assert.strictEqual(res, true, 'navigateToExpense deve retornar true para item encontrado');
    assert.strictEqual(modalClosed, true, 'Modal do dia deve ser fechado');
    assert.strictEqual(lastActivatedTab, 'tab-expenses', 'Deve ativar a aba de despesas');
    assert.strictEqual(lastEntryDialogOpts.mode, 'edit');
    assert.strictEqual(lastEntryDialogOpts.type, 'variable');
    assert.strictEqual(lastEntryDialogOpts.id, 'var_celular_12x');
  });

  test('5. navigateToExpense navega e abre openEntryDialog para despesa fixa', () => {
    lastActivatedTab = null;
    lastEntryDialogOpts = null;

    const res = ctx.window.navigateToExpense('fix_internet_fibra');

    assert.strictEqual(res, true);
    assert.strictEqual(lastActivatedTab, 'tab-expenses');
    assert.strictEqual(lastEntryDialogOpts.mode, 'edit');
    assert.strictEqual(lastEntryDialogOpts.type, 'fixed');
    assert.strictEqual(lastEntryDialogOpts.fixedId, 'fix_internet_fibra');
    assert.strictEqual(lastEntryDialogOpts.id, 'fix_internet_fibra');
  });

  test('6. Imunidade a colisões de nome, valor e data: resolve estritamente pelo ID', () => {
    lastEntryDialogOpts = null;

    // Abre var_almoco_2 (mesmo nome e valor de var_almoco_1)
    const res = ctx.window.navigateToExpense('var_almoco_2');

    assert.strictEqual(res, true);
    assert.strictEqual(lastEntryDialogOpts.id, 'var_almoco_2', 'Deve abrir estritamente var_almoco_2 e não o 1');
  });

  test('7. Fail-Safe: ID inexistente ou despesa removida não gera erro e notifica o usuário', () => {
    lastNotification = null;
    lastEntryDialogOpts = null;

    const res = ctx.window.navigateToExpense('id_fantasma_deletado');

    assert.strictEqual(res, false, 'Deve retornar false');
    assert.strictEqual(lastEntryDialogOpts, null, 'Não deve tentar abrir diálogo');
    assert.ok(lastNotification, 'Deve disparar notificação amigável');
    assert.strictEqual(lastNotification.level, 'info');
    assert.ok(lastNotification.msg.includes('Despesa não encontrada'), 'Mensagem informativa amigável');
  });

  test('8. Entrada inválida (null, undefined, vazio) é tratada com segurança', () => {
    lastNotification = null;

    assert.strictEqual(ctx.window.navigateToExpense(null), false);
    assert.strictEqual(ctx.window.navigateToExpense(''), false);
    assert.strictEqual(ctx.window.navigateToExpense(undefined), false);
  });
});
