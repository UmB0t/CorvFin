/**
 * CorvFin V2 — Suíte de Testes de Regressão: Despesas Recorrentes com Pix/Dinheiro
 * Separação entre Forma de Pagamento e Recorrência
 *
 * Cobre os 13 cenários contratuais obrigatórios:
 * 1. PIX + única (fluxo simplificado, 1 ocorrência em variable, status pago)
 * 2. Dinheiro + única (fluxo simplificado, 1 ocorrência em variable, status pago)
 * 3. PIX + recorrente (recorrência mensal, gravado em fixed, competência inicial paga, futuras pendentes)
 * 4. Dinheiro + recorrente (mesma regra para Dinheiro)
 * 5. Cartão/outro + recorrente (comportamento de cartão preservado)
 * 6. Alterar destino de PIX para outro tipo (wizard recalcula etapas)
 * 7. Alterar recorrência de única para recorrente (etapas 2 e 3 aparecem, botão continuar)
 * 8. Alterar recorrência de recorrente para única (colapsa etapas, sem estado residual)
 * 9. Anti-herança de status pago (ocorrências futuras permanecem estritamente pendentes)
 * 10. Totais e orçamento (cálculo de totais mensais sem duplicação)
 * 11. Preservação de registros históricos (dados prévios não são corrompidos)
 * 12. Contrato de UI & CSS (classes no dialogs.css, sem inline styles no seletor)
 * 13. REGRESSÃO CRÍTICA DE EDIÇÃO: Despesa fixa existente com PIX/Dinheiro editada e salva
 *     permanece em state.fixed, não é convertida para state.variable e preserva paidHistory.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
const dialogsCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'dialogs.css'), 'utf-8');
const constantsJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'constants.js'), 'utf-8');
const utilsJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'utils.js'), 'utf-8');
const financeQueriesJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'financeQueries.js'), 'utf-8');
const expensesJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'expenses.js'), 'utf-8');

describe('CorvFin V2 — Despesas Recorrentes com Pix/Dinheiro', () => {

  function createMockEnvironment(initialState = {}) {
    const elements = {};
    const listeners = {};

    function mockEl(id, initialVal = '') {
      const attrs = {};
      const classList = new Set();
      const el = {
        id,
        value: initialVal,
        textContent: '',
        innerHTML: '',
        style: {},
        dataset: {},
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
      'entryName', 'entryGroup', 'entryAmount', 'entryDestination', 'entryDestHint',
      'entryRecurrenceWrap', 'entryRecurrenceSelector', 'entryRecSingleBtn', 'entryRecRecurringBtn', 'entryRecurrence',
      'entryNoteStep1Wrap', 'entryNoteStep1', 'entryNote',
      'typeSelectorWrap', 'typeSelector',
      'panelTypeCash', 'panelTypeInstallment', 'panelTypeFixed',
      'cashEffMonth', 'cashEffYear', 'varStartMonth', 'varStartYear', 'varEndMonth', 'varEndYear', 'varInstallmentsCount', 'varInstallmentsBadge',
      'fixedEffMonth', 'fixedEffYear',
      'dueDayWrap', 'entryDueDay', 'inheritedDueHint',
      'entrySummaryCard', 'summaryName', 'summaryAmount', 'summaryCategory', 'summaryDestination', 'summaryType', 'summaryPeriod',
      'entryStatusWrap', 'entryStatus', 'pixCashStatusHint',
      'fixedActions', 'endFixedBtn', 'deleteFixedBtn', 'deleteEntryBtn',
      'btnCancelStep1', 'btnNextStep1', 'btnBackStep2', 'btnNextStep2', 'btnBackStep3', 'entrySubmitBtn',
      'stepIndicator1', 'stepIndicator2', 'stepIndicator3'
    ];

    elementIds.forEach(id => {
      elements['#' + id] = mockEl(id);
    });

    elements['.wizard-line'] = [mockEl('wizardLine1'), mockEl('wizardLine2')];
    elements['.entry-rec-btn'] = [elements['#entryRecSingleBtn'], elements['#entryRecRecurringBtn']];
    elements['#entryRecSingleBtn'].dataset.rec = 'single';
    elements['#entryRecRecurringBtn'].dataset.rec = 'recurring';

    const typeBtns = [mockEl('typeCashBtn'), mockEl('typeInstBtn'), mockEl('typeFixedBtn')];
    typeBtns[0].dataset.expType = 'cash';
    typeBtns[1].dataset.expType = 'installment';
    typeBtns[2].dataset.expType = 'fixed';
    elements['.entry-type-btn'] = typeBtns;

    const state = Object.assign({
      year: 2026,
      month: 9,
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

    let savedState = null;
    let notifications = [];

    const ctx = {
      window: { addEventListener: () => {} },
      document: {
        readyState: 'complete',
        addEventListener: () => {},
        removeEventListener: () => {},
        getElementById: (id) => elements['#' + id] || null,
        querySelector: (sel) => elements[sel] || null,
        querySelectorAll: (sel) => Array.isArray(elements[sel]) ? elements[sel] : (elements[sel] ? [elements[sel]] : [])
      },
      $: (selector) => elements[selector] || null,
      $$: (selector) => Array.isArray(elements[selector]) ? elements[selector] : (elements[selector] ? [elements[selector]] : []),
      getState: () => state,
      saveState: () => { savedState = JSON.parse(JSON.stringify(state)); },
      notify: (msg, type) => { notifications.push({ msg, type }); },
      render: () => {},
      fillMonthSelects: () => {},
      updateCategorySelects: () => {},
      updateDestinationSelects: () => {},
      uid: () => 'uid_' + Math.random().toString(36).substr(2, 9),
      mk: (y, m) => Number(y) * 12 + Number(m),
      ymKey: (y, m) => `${y}-${m}`,
      currency: (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`,
      MONTH_ABBR: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
      escapeHtml: (s) => String(s || '')
    };
    ctx.window = ctx;

    vm.createContext(ctx);
    vm.runInContext(constantsJs, ctx);
    vm.runInContext(utilsJs, ctx);
    vm.runInContext(financeQueriesJs, ctx);
    vm.runInContext(expensesJs, ctx);

    return { ctx, elements, state, getSavedState: () => savedState, notifications };
  }

  test('1. PIX + Despesa Única: Fluxo simplificado (1 etapa), grava 1 ocorrência em state.variable com status pago', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Lanche';
    elements['#entryGroup'].value = 'Alimentação';
    elements['#entryAmount'].value = '35.00';
    elements['#entryDestination'].value = 'Pix';

    ctx.setEntryRecurrence('single');
    ctx.syncDestinationRules();

    // Valida UI do fluxo simplificado
    assert.strictEqual(elements['#btnNextStep1'].style.display, 'none', 'Botão Avançar deve estar oculto na etapa 1');
    assert.strictEqual(elements['#entrySubmitBtn'].style.display, 'inline-flex', 'Botão Salvar deve estar visível diretamente na etapa 1');
    assert.strictEqual(elements['#stepIndicator2'].style.display, 'none', 'Etapa 2 deve estar oculta no indicador');
    assert.strictEqual(elements['#stepIndicator3'].style.display, 'none', 'Etapa 3 deve estar oculta no indicador');
    assert.ok(elements['#entryDestHint'].textContent.includes('quitado automaticamente'), 'Hint deve indicar quitação automática');

    // Submete formulário
    elements['#entryForm'].dispatchEvent('submit');

    // Verifica persistência
    assert.strictEqual(state.variable.length, 1, 'Deve criar exatamente 1 registro em state.variable');
    assert.strictEqual(state.fixed.length, 0, 'state.fixed deve permanecer vazio');
    const item = state.variable[0];
    assert.strictEqual(item.name, 'Lanche');
    assert.strictEqual(item.amount, 35);
    assert.strictEqual(item.destination, 'Pix');
    assert.strictEqual(item.paymentType, 'cash');
    assert.strictEqual(item.installments, 1);
    assert.strictEqual(item.startMonth, 9);
    assert.strictEqual(item.startYear, 2026);

    const payInfo = ctx.getExpensePaymentInfo(item, 2026, 9, 35);
    assert.strictEqual(payInfo.status, 'pago', 'Lançamento pontual via PIX deve ser quitado');
    assert.strictEqual(payInfo.paidAmount, 35);
  });

  test('2. Dinheiro + Despesa Única: Fluxo simplificado (1 etapa), grava 1 ocorrência em state.variable com status pago', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Feira Livre';
    elements['#entryGroup'].value = 'Alimentação';
    elements['#entryAmount'].value = '60.00';
    elements['#entryDestination'].value = 'Dinheiro';

    ctx.setEntryRecurrence('single');
    ctx.syncDestinationRules();

    assert.strictEqual(elements['#btnNextStep1'].style.display, 'none');
    assert.strictEqual(elements['#entrySubmitBtn'].style.display, 'inline-flex');
    assert.strictEqual(elements['#stepIndicator2'].style.display, 'none');

    elements['#entryForm'].dispatchEvent('submit');

    assert.strictEqual(state.variable.length, 1);
    assert.strictEqual(state.fixed.length, 0);
    const item = state.variable[0];
    assert.strictEqual(item.name, 'Feira Livre');
    assert.strictEqual(item.destination, 'Dinheiro');
    const payInfo = ctx.getExpensePaymentInfo(item, 2026, 9, 60);
    assert.strictEqual(payInfo.status, 'pago');
  });

  test('3. PIX + Despesa Recorrente: Habilita wizard, grava em state.fixed, ocorrência atual PAGA e futuras PENDENTES', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Academia';
    elements['#entryGroup'].value = 'Saúde';
    elements['#entryAmount'].value = '90.00';
    elements['#entryDestination'].value = 'Pix';

    // Seleciona explicitamente recorrência
    ctx.setEntryRecurrence('recurring');
    ctx.syncDestinationRules();

    // Etapa 1: Stepper expandido, botão avançar visível
    assert.strictEqual(elements['#btnNextStep1'].style.display, 'inline-flex', 'Botão Avançar deve estar visível');
    assert.strictEqual(elements['#entrySubmitBtn'].style.display, 'none', 'Salvar não deve aparecer na etapa 1 para recorrente');
    assert.strictEqual(elements['#stepIndicator2'].style.display, 'flex', 'Etapa 2 deve estar visível no stepper');
    assert.ok(elements['#entryDestHint'].textContent.includes('permanecerão pendentes'), 'Hint deve alertar sobre próximos pendentes');

    // Avança para Etapa 2: Recorrência
    elements['#fixedEffMonth'].value = '9';
    elements['#fixedEffYear'].value = '2026';
    elements['#entryDueDay'].value = '10';
    ctx.setWizardStep(2);

    // Na Etapa 2 de PIX recorrente: tipo parcelado oculto, fixa visível
    assert.strictEqual(elements['#typeSelectorWrap'].style.display, 'none', 'Seletor de tipo deve ficar oculto para PIX');
    assert.strictEqual(elements['#panelTypeFixed'].style.display, 'grid', 'Painel de despesa fixa deve estar visível');
    assert.strictEqual(elements['#panelTypeInstallment'].style.display, 'none', 'Painel de parcelamento deve estar oculto');

    // Avança para Etapa 3: Finalização
    ctx.updateStep3Summary();
    ctx.setWizardStep(3);
    assert.strictEqual(elements['#entrySubmitBtn'].style.display, 'inline-flex');
    assert.strictEqual(elements['#entryStatus'].value, 'pago', 'Status do mês inicial deve ser pago');

    // Submete formulário
    elements['#entryForm'].dispatchEvent('submit');

    // Validação de persistência
    assert.strictEqual(state.fixed.length, 1, 'Deve criar registro em state.fixed');
    assert.strictEqual(state.variable.length, 0, 'state.variable NÃO deve receber despesa recorrente');

    const fixed = state.fixed[0];
    assert.strictEqual(fixed.name, 'Academia');
    assert.strictEqual(fixed.amount || fixed.versions[0].amount, 90);
    assert.strictEqual(fixed.destination, 'Pix');
    assert.strictEqual(fixed.paymentType, 'fixed');
    assert.strictEqual(fixed.dueDay, 10);

    // REGRA CRÍTICA DE QUITAÇÃO:
    // Setembro (mês 9): PAGO
    const paySep = ctx.getExpensePaymentInfo(fixed, 2026, 9, 90);
    assert.strictEqual(paySep.status, 'pago', 'Setembro (mês atual) deve estar PAGO');
    assert.strictEqual(paySep.paidAmount, 90);

    // Outubro (mês 10): PENDENTE
    const payOct = ctx.getExpensePaymentInfo(fixed, 2026, 10, 90);
    assert.strictEqual(payOct.status, 'pendente', 'Outubro deve estar PENDENTE');
    assert.strictEqual(payOct.paidAmount, 0);

    // Novembro (mês 11): PENDENTE
    const payNov = ctx.getExpensePaymentInfo(fixed, 2026, 11, 90);
    assert.strictEqual(payNov.status, 'pendente', 'Novembro deve estar PENDENTE');
    assert.strictEqual(payNov.paidAmount, 0);

    // Dezembro (mês 12): PENDENTE
    const payDec = ctx.getExpensePaymentInfo(fixed, 2026, 12, 90);
    assert.strictEqual(payDec.status, 'pendente', 'Dezembro deve estar PENDENTE');
    assert.strictEqual(payDec.paidAmount, 0);
  });

  test('4. Dinheiro + Despesa Recorrente: Mesma regra de quitação inicial e futuras pendentes', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Diarista';
    elements['#entryGroup'].value = 'Moradia';
    elements['#entryAmount'].value = '200.00';
    elements['#entryDestination'].value = 'Dinheiro';
    elements['#fixedEffMonth'].value = '9';
    elements['#fixedEffYear'].value = '2026';

    ctx.setEntryRecurrence('recurring');
    ctx.syncDestinationRules();
    ctx.setWizardStep(3);

    elements['#entryForm'].dispatchEvent('submit');

    assert.strictEqual(state.fixed.length, 1);
    assert.strictEqual(state.variable.length, 0);

    const diarista = state.fixed[0];
    assert.strictEqual(diarista.name, 'Diarista');
    assert.strictEqual(diarista.destination, 'Dinheiro');

    assert.strictEqual(ctx.getExpensePaymentInfo(diarista, 2026, 9, 200).status, 'pago');
    assert.strictEqual(ctx.getExpensePaymentInfo(diarista, 2026, 10, 200).status, 'pendente');
    assert.strictEqual(ctx.getExpensePaymentInfo(diarista, 2026, 11, 200).status, 'pendente');
  });

  test('5. Cartão/Outro + Recorrente: Comportamento anterior totalmente preservado', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'fixed' });
    elements['#entryName'].value = 'Internet Fibra';
    elements['#entryGroup'].value = 'Moradia';
    elements['#entryAmount'].value = '120.00';
    elements['#entryDestination'].value = 'Nubank';
    elements['#fixedEffMonth'].value = '9';
    elements['#fixedEffYear'].value = '2026';
    elements['#entryStatus'].value = 'pendente';

    ctx.setEntryRecurrence('recurring');
    ctx.syncDestinationRules();

    assert.strictEqual(String(elements['#entryDueDay'].value), '10', 'Deve herdar vencimento do Nubank (dia 10)');

    ctx.setWizardStep(3);
    elements['#entryForm'].dispatchEvent('submit');

    assert.strictEqual(state.fixed.length, 1);
    const internet = state.fixed[0];
    assert.strictEqual(internet.name, 'Internet Fibra');
    assert.strictEqual(internet.destination, 'Nubank');
    assert.strictEqual(internet.dueDay, 10);
    // Cartão sem quitação automática nasce pendente
    assert.strictEqual(ctx.getExpensePaymentInfo(internet, 2026, 9, 120).status, 'pendente');
  });

  test('6. Alterar destino de PIX para Nubank recalcula wizard etapas corretamente', () => {
    const { ctx, elements } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryDestination'].value = 'Pix';
    ctx.setEntryRecurrence('single');
    ctx.syncDestinationRules();

    // No PIX única: fluxo simplificado
    assert.strictEqual(elements['#btnNextStep1'].style.display, 'none');
    assert.strictEqual(elements['#entrySubmitBtn'].style.display, 'inline-flex');
    assert.strictEqual(elements['#stepIndicator2'].style.display, 'none');

    // Altera destino para Nubank
    elements['#entryDestination'].value = 'Nubank';
    ctx.syncDestinationRules();

    // No Nubank: wizard completo em 3 etapas reaparece
    assert.strictEqual(elements['#btnNextStep1'].style.display, 'inline-flex', 'Avançar deve reaparecer para Nubank');
    assert.strictEqual(elements['#entrySubmitBtn'].style.display, 'none', 'Salvar não deve aparecer na etapa 1 do Nubank');
    assert.strictEqual(elements['#stepIndicator2'].style.display, 'flex', 'Etapa 2 deve reaparecer');
    assert.strictEqual(elements['#stepIndicator3'].style.display, 'flex', 'Etapa 3 deve reaparecer');
    assert.strictEqual(String(elements['#entryDueDay'].value), '10', 'Deve preencher vencimento herdado do Nubank');
  });

  test('7. Alterar recorrência de única para recorrente faz aparecer etapas 2 e 3', () => {
    const { ctx, elements } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryDestination'].value = 'Pix';
    ctx.setEntryRecurrence('single');
    ctx.syncDestinationRules();

    assert.strictEqual(elements['#stepIndicator2'].style.display, 'none');
    assert.strictEqual(elements['#btnNextStep1'].style.display, 'none');

    // Alterna para recorrente
    ctx.setEntryRecurrence('recurring');

    assert.strictEqual(elements['#stepIndicator2'].style.display, 'flex', 'Etapa 2 deve aparecer');
    assert.strictEqual(elements['#stepIndicator3'].style.display, 'flex', 'Etapa 3 deve aparecer');
    assert.strictEqual(elements['#btnNextStep1'].style.display, 'inline-flex', 'Botão Avançar deve aparecer');
    assert.strictEqual(elements['#entrySubmitBtn'].style.display, 'none', 'Botão Salvar deve ser ocultado na etapa 1');
  });

  test('8. Alterar recorrência de recorrente para única colapsa wizard sem resíduo', () => {
    const { ctx, elements } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryDestination'].value = 'Pix';
    ctx.setEntryRecurrence('recurring');
    assert.strictEqual(elements['#stepIndicator2'].style.display, 'flex');

    // Volta para única
    ctx.setEntryRecurrence('single');

    assert.strictEqual(elements['#stepIndicator2'].style.display, 'none', 'Etapa 2 deve desaparecer');
    assert.strictEqual(elements['#stepIndicator3'].style.display, 'none', 'Etapa 3 deve desaparecer');
    assert.strictEqual(elements['#btnNextStep1'].style.display, 'none', 'Avançar deve ser ocultado');
    assert.strictEqual(elements['#entrySubmitBtn'].style.display, 'inline-flex', 'Salvar direto deve ser restaurado');
    assert.strictEqual(ctx.getEntryDlgState().type, 'cash', 'Tipo deve ser revertido para cash sem resíduo');
  });

  test('9. Nenhuma ocorrência futura recebe status pago por herança do PIX/Dinheiro', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Pilates';
    elements['#entryAmount'].value = '150.00';
    elements['#entryDestination'].value = 'Pix';
    elements['#fixedEffMonth'].value = '9';
    elements['#fixedEffYear'].value = '2026';

    ctx.setEntryRecurrence('recurring');
    ctx.syncDestinationRules();
    ctx.setWizardStep(3);
    elements['#entryForm'].dispatchEvent('submit');

    const item = state.fixed[0];
    assert.ok(item, 'Item deve existir');

    // Testa meses futuros por 1 ano completo
    for (let month = 10; month <= 12; month++) {
      const info = ctx.getExpensePaymentInfo(item, 2026, month, 150);
      assert.strictEqual(info.isPaid, false, `Mês ${month}/2026 NÃO pode ser pago por herança`);
      assert.strictEqual(info.status, 'pendente');
      assert.strictEqual(info.paidAmount, 0);
    }
    for (let month = 1; month <= 12; month++) {
      const info = ctx.getExpensePaymentInfo(item, 2027, month, 150);
      assert.strictEqual(info.isPaid, false, `Mês ${month}/2027 NÃO pode ser pago por herança`);
      assert.strictEqual(info.status, 'pendente');
      assert.strictEqual(info.paidAmount, 0);
    }
  });

  test('10. Totais e orçamento refletem corretamente mês atual (pago) e meses futuros (pendente) sem duplicação', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Consultoria Financeira';
    elements['#entryAmount'].value = '500.00';
    elements['#entryDestination'].value = 'Pix';
    elements['#fixedEffMonth'].value = '9';
    elements['#fixedEffYear'].value = '2026';

    ctx.setEntryRecurrence('recurring');
    ctx.syncDestinationRules();
    ctx.setWizardStep(3);
    elements['#entryForm'].dispatchEvent('submit');

    // Totais de Setembro (2026-09)
    const totalsSep = ctx.monthTotals(2026, 9);
    assert.strictEqual(totalsSep.totalExpenses, 500, 'Total de despesas em Setembro deve ser 500');
    assert.strictEqual(totalsSep.paidExpenses, 500, 'Despesas pagas em Setembro devem ser 500');
    assert.strictEqual(totalsSep.pendingExpenses, 0, 'Despesas pendentes em Setembro devem ser 0');

    // Totais de Outubro (2026-10)
    const totalsOct = ctx.monthTotals(2026, 10);
    assert.strictEqual(totalsOct.totalExpenses, 500, 'Total de despesas em Outubro deve ser 500');
    assert.strictEqual(totalsOct.paidExpenses, 0, 'Despesas pagas em Outubro devem ser 0');
    assert.strictEqual(totalsOct.pendingExpenses, 500, 'Despesas pendentes em Outubro devem ser 500');
  });

  test('11. Preservação de registros históricos: despesas preexistentes não sofrem mutação', () => {
    const historicalFixed = {
      id: 'fix_hist_1',
      name: 'Aluguel Antigo',
      group: 'Moradia',
      destination: 'Itaú',
      dueDay: 5,
      note: 'Histórico',
      paymentType: 'fixed',
      versions: [{ year: 2025, month: 1, amount: 2000 }],
      paidHistory: { '2025-1': true, '2025-2': true }
    };

    const historicalVariable = {
      id: 'var_hist_1',
      name: 'Compra Antiga',
      amount: 300,
      destination: 'Nubank',
      paymentType: 'installment',
      installments: 3,
      startMonth: 1,
      startYear: 2026,
      endMonth: 3,
      endYear: 2026,
      paidHistory: { '2026-1': true }
    };

    const { ctx, elements, state } = createMockEnvironment({
      fixed: [JSON.parse(JSON.stringify(historicalFixed))],
      variable: [JSON.parse(JSON.stringify(historicalVariable))]
    });

    // Cria nova despesa PIX recorrente
    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Crossfit';
    elements['#entryAmount'].value = '180.00';
    elements['#entryDestination'].value = 'Pix';
    elements['#fixedEffMonth'].value = '9';
    elements['#fixedEffYear'].value = '2026';
    ctx.setEntryRecurrence('recurring');
    ctx.syncDestinationRules();
    ctx.setWizardStep(3);
    elements['#entryForm'].dispatchEvent('submit');

    // Verifica que os registros históricos permanecem idênticos
    const foundHistFixed = state.fixed.find(f => f.id === 'fix_hist_1');
    assert.deepStrictEqual(foundHistFixed.versions, historicalFixed.versions);
    assert.deepStrictEqual(foundHistFixed.paidHistory, historicalFixed.paidHistory);

    const foundHistVar = state.variable.find(v => v.id === 'var_hist_1');
    assert.deepStrictEqual(foundHistVar.paidHistory, historicalVariable.paidHistory);
  });

  test('12. Contrato de UI & CSS: index.html e dialogs.css sem inline styles no seletor de recorrência', () => {
    // 1. Elemento #entryRecurrenceWrap presente no HTML
    assert.ok(htmlContent.includes('id="entryRecurrenceWrap"'), 'index.html deve conter #entryRecurrenceWrap');
    assert.ok(htmlContent.includes('class="field entry-recurrence-wrap"'), 'Deve usar classe field entry-recurrence-wrap');
    assert.ok(htmlContent.includes('id="entryRecurrenceSelector"'), 'index.html deve conter #entryRecurrenceSelector');
    assert.ok(htmlContent.includes('id="entryRecSingleBtn"'), 'index.html deve conter #entryRecSingleBtn');
    assert.ok(htmlContent.includes('id="entryRecRecurringBtn"'), 'index.html deve conter #entryRecRecurringBtn');
    assert.ok(htmlContent.includes('id="entryRecurrence"'), 'index.html deve conter input hidden #entryRecurrence');

    // 2. Não possui style="..." inline no bloco de recorrência
    const startIdx = htmlContent.indexOf('id="entryRecurrenceWrap"');
    const endIdx = htmlContent.indexOf('id="entryNoteStep1Wrap"');
    assert.ok(startIdx > 0 && endIdx > startIdx, 'Bloco de recorrência deve ser localizado');
    const recWrapSnippet = htmlContent.substring(startIdx, endIdx);
    assert.strictEqual(recWrapSnippet.includes('style="'), false, 'NÃO deve conter style inline no componente de recorrência');

    // 3. Classes definidas no dialogs.css
    assert.ok(dialogsCss.includes('.entry-recurrence-wrap'), 'dialogs.css deve conter .entry-recurrence-wrap');
    assert.ok(dialogsCss.includes('.entry-recurrence-selector'), 'dialogs.css deve conter .entry-recurrence-selector');
    assert.ok(dialogsCss.includes('.entry-rec-btn'), 'dialogs.css deve conter .entry-rec-btn');
    assert.ok(dialogsCss.includes('.entry-rec-btn.active'), 'dialogs.css deve estilizar o estado ativo');
  });

  test('13. REGRESSÃO CRÍTICA DE EDIÇÃO: Despesa fixa existente com PIX/Dinheiro editada permanece em state.fixed e preserva paidHistory', () => {
    const existingFixedPix = {
      id: 'fix_pix_existing_99',
      name: 'Internet Fibra Pix',
      group: 'Moradia',
      destination: 'Pix',
      dueDay: 15,
      note: 'Plano 500 Mega',
      paymentType: 'fixed',
      versions: [{ id: 'v1', year: 2026, month: 1, amount: 150 }],
      paidHistory: {
        '2026-1': { paidAmount: 150, status: 'pago' },
        '2026-2': { paidAmount: 150, status: 'pago' },
        '2026-8': { paidAmount: 150, status: 'pago' }
      }
    };

    const { ctx, elements, state } = createMockEnvironment({
      fixed: [JSON.parse(JSON.stringify(existingFixedPix))],
      variable: []
    });

    // 1. Abre a despesa fixa existente para edição
    ctx.openEntryDialog({ mode: 'edit', type: 'fixed', fixedId: 'fix_pix_existing_99' });

    // 2. syncDestinationRules() foi executado durante a abertura
    assert.strictEqual(ctx.getEntryDlgState().type, 'fixed', 'Tipo deve permanecer fixed mesmo com destino Pix');
    assert.strictEqual(ctx.getEntryDlgState().recurrence, 'recurring', 'Recorrência deve ser recurring');

    // 3. Edita campos não relacionados: altera nome e valor da mensalidade
    elements['#entryName'].value = 'Internet Fibra Pix Turbo 1GB';
    elements['#entryAmount'].value = '180.00';

    // 4. Submete o formulário
    elements['#entryForm'].dispatchEvent('submit');

    // 5. Verificações mandatórias do resultado:
    assert.strictEqual(state.fixed.length, 1, 'Deve continuar existindo exatamente 1 item em state.fixed');
    assert.strictEqual(state.variable.length, 0, 'NÃO pode converter para state.variable nem criar cópias');

    const updatedFixed = state.fixed[0];
    assert.strictEqual(updatedFixed.id, 'fix_pix_existing_99', 'ID da despesa fixa deve ser preservado');
    assert.strictEqual(updatedFixed.name, 'Internet Fibra Pix Turbo 1GB', 'Nome deve ser atualizado');
    assert.strictEqual(updatedFixed.paymentType, 'fixed', 'Tipo de pagamento deve continuar fixed');
    assert.strictEqual(updatedFixed.destination, 'Pix', 'Destino deve continuar Pix');

    // 6. paidHistory existente é estritamente preservado
    assert.ok(updatedFixed.paidHistory['2026-1'], 'Histórico de Janeiro 2026 deve existir');
    assert.ok(updatedFixed.paidHistory['2026-2'], 'Histórico de Fevereiro 2026 deve existir');
    assert.ok(updatedFixed.paidHistory['2026-8'], 'Histórico de Agosto 2026 deve existir');

    // 7. Meses futuros continuam pendentes e não são marcados indevidamente
    const payOct = ctx.getExpensePaymentInfo(updatedFixed, 2026, 10, 180);
    assert.strictEqual(payOct.status, 'pendente', 'Outubro deve permanecer pendente');
    assert.strictEqual(payOct.paidAmount, 0, 'Outubro não deve receber paidAmount indevido');

    const payNov = ctx.getExpensePaymentInfo(updatedFixed, 2026, 11, 180);
    assert.strictEqual(payNov.status, 'pendente', 'Novembro deve permanecer pendente');
    assert.strictEqual(payNov.paidAmount, 0, 'Novembro não deve receber paidAmount indevido');
  });

});
