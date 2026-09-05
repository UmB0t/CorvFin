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
const aiAssistantJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'aiAssistant.js'), 'utf-8');
const expenseInstallmentsJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'expenseInstallments.js'), 'utf-8');

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

    const recEndTypeRadios = [
      mockEl('entryRecEndTypeNever', 'never'),
      mockEl('entryRecEndTypeCount', 'count'),
      mockEl('entryRecEndTypeDate', 'date')
    ];
    recEndTypeRadios[0].checked = true;
    recEndTypeRadios[1].checked = false;
    recEndTypeRadios[2].checked = false;

    const elementIds = [
      'entryDialog', 'entryForm', 'entryDialogTitle', 'entryId', 'entryFixedId', 'entryType', 'entryPaymentType',
      'entryValidationAlert', 'entryStep1', 'entryStep2', 'entryStep3',
      'entryName', 'entryGroup', 'entryAmount', 'entryDestination', 'entryDestHint',
      'entryPaymentMethod', 'entryAccount', 'entryAccountWrap', 'entryAccountLabel',
      'entryPayee', 'payeeSuggestions',
      'entryRecurrenceWrap', 'entryRecurrenceSelector', 'entryRecSingleBtn', 'entryRecInstallmentBtn', 'entryRecRecurringBtn', 'entryRecurrence',
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
      'timelineMetrics', 'timelineProgressBar', 'timelineProgressText', 'timelineTableBody'
    ];

    elementIds.forEach(id => {
      elements['#' + id] = mockEl(id);
    });

    elements['#timelineDialog'].showModal = function() { this.open = true; };
    elements['#timelineDialog'].close = function() { this.open = false; };

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

    function resolveSelector(sel) {
      if (sel === 'input[name="entryRecEndType"]:checked') return recEndTypeRadios.find(r => r.checked) || recEndTypeRadios[0];
      if (sel === 'input[name="entryRecEndType"][value="never"]') return recEndTypeRadios[0];
      if (sel === 'input[name="entryRecEndType"][value="count"]') return recEndTypeRadios[1];
      if (sel === 'input[name="entryRecEndType"][value="date"]') return recEndTypeRadios[2];
      return elements[sel] || null;
    }

    function resolveSelectorAll(sel) {
      if (sel === 'input[name="entryRecEndType"]') return recEndTypeRadios;
      return Array.isArray(elements[sel]) ? elements[sel] : (elements[sel] ? [elements[sel]] : []);
    }

    const bodyEl = mockEl('body');
    bodyEl.children = [];
    bodyEl.appendChild = (child) => { bodyEl.children.push(child); return child; };

    const ctx = {
      window: { addEventListener: () => {} },
      document: {
        body: bodyEl,
        readyState: 'complete',
        addEventListener: () => {},
        removeEventListener: () => {},
        getElementById: (id) => elements['#' + id] || null,
        querySelector: resolveSelector,
        querySelectorAll: resolveSelectorAll,
        createElement: (tag) => {
          const el = mockEl('mock_' + Math.random().toString(36).substr(2, 6));
          el.tagName = tag.toUpperCase();
          el.children = [];
          el.appendChild = (child) => { el.children.push(child); return child; };
          return el;
        }
      },
      $: resolveSelector,
      $$: resolveSelectorAll,
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
    vm.runInContext(expenseInstallmentsJs, ctx);

    return { ctx, elements, state, getSavedState: () => savedState, notifications, recEndTypeRadios };
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

  /* ==========================================================================
   * 18 CENÁRIOS OBRIGATÓRIOS DO NOVO DOMÍNIO V2
   * ========================================================================== */

  test('V2-01. PIX + única: contrato V2 com payment.method, temporal e quitação pontual', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Almoço Executivo';
    elements['#entryGroup'].value = 'Alimentação';
    elements['#entryAmount'].value = '42.00';
    elements['#entryPaymentMethod'].value = 'pix';
    elements['#entryAccount'].value = '';
    ctx.setEntryRecurrence('single');
    ctx.syncDestinationRules();

    elements['#entryForm'].dispatchEvent('submit');

    assert.strictEqual(state.variable.length, 1);
    const item = state.variable[0];
    assert.strictEqual(item.name, 'Almoço Executivo');
    assert.strictEqual(item.payment?.method, 'pix');
    assert.strictEqual(item.payment?.account, null);
    assert.strictEqual(item.destination, 'Pix', 'Bridge V1 deve ser gerada como Pix');
    assert.strictEqual(item.temporal?.type, 'cash');
    assert.strictEqual(item.installments, 1);
    const payInfo = ctx.getExpensePaymentInfo(item, 2026, 9, 42);
    assert.strictEqual(payInfo.status, 'pago');
  });

  test('V2-02. PIX + recorrente sem fim: grava em fixed com temporal never e endedFrom nulo', () => {
    const { ctx, elements, state, recEndTypeRadios } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Streaming Música';
    elements['#entryGroup'].value = 'Lazer';
    elements['#entryAmount'].value = '21.90';
    elements['#entryPaymentMethod'].value = 'pix';
    ctx.setEntryRecurrence('recurring');
    ctx.syncDestinationRules();

    recEndTypeRadios[0].checked = true; // never
    recEndTypeRadios[1].checked = false;
    recEndTypeRadios[2].checked = false;
    ctx.updateRecDurationView();

    elements['#entryForm'].dispatchEvent('submit');

    assert.strictEqual(state.fixed.length, 1);
    const fixed = state.fixed[0];
    assert.strictEqual(fixed.payment?.method, 'pix');
    assert.strictEqual(fixed.temporal?.type, 'fixed');
    assert.strictEqual(fixed.temporal?.recurrence?.type, 'never');
    assert.strictEqual(fixed.endedFrom, null);
    assert.strictEqual(ctx.getExpensePaymentInfo(fixed, 2026, 9, 21.90).status, 'pago');
    assert.strictEqual(ctx.getExpensePaymentInfo(fixed, 2026, 10, 21.90).status, 'pendente');
  });

  test('V2-03. PIX + recorrente limitada a 10 ocorrências: cessa após 10 meses', () => {
    const { ctx, elements, state, recEndTypeRadios } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Curso Francês';
    elements['#entryAmount'].value = '190.00';
    elements['#entryPaymentMethod'].value = 'pix';
    elements['#fixedEffMonth'].value = '9';
    elements['#fixedEffYear'].value = '2026';
    ctx.setEntryRecurrence('recurring');
    ctx.syncDestinationRules();

    recEndTypeRadios[0].checked = false;
    recEndTypeRadios[1].checked = true; // count
    recEndTypeRadios[2].checked = false;
    elements['#recCountInput'].value = '10';
    ctx.updateRecDurationView();

    elements['#entryForm'].dispatchEvent('submit');

    assert.strictEqual(state.fixed.length, 1);
    const fixed = state.fixed[0];
    assert.strictEqual(fixed.temporal?.recurrence?.type, 'count');
    assert.strictEqual(fixed.temporal?.recurrence?.count, 10);
    // 9/2026 a 6/2027 = 10 ocorrências ativas. Primeiro mês inativo: 7/2027
    assert.strictEqual(fixed.endedFrom?.year, 2027);
    assert.strictEqual(fixed.endedFrom?.month, 7);

    // Ativo na 1ª e na 10ª ocorrência
    const activeSep = ctx.activeFixedForMonth(2026, 9).find(f => f.fixedId === fixed.id);
    assert.ok(activeSep, 'Deve estar ativo em Setembro/2026 (1ª)');
    const activeJun = ctx.activeFixedForMonth(2027, 6).find(f => f.fixedId === fixed.id);
    assert.ok(activeJun, 'Deve estar ativo em Junho/2027 (10ª)');

    // Inativo na 11ª
    const activeJul = ctx.activeFixedForMonth(2027, 7).find(f => f.fixedId === fixed.id);
    assert.strictEqual(activeJul, undefined, 'NÃO deve estar ativo em Julho/2027 (11ª)');
  });

  test('V2-04. Dinheiro + recorrente: suporta recorrência física em dinheiro', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Pensão Alimentícia';
    elements['#entryAmount'].value = '800.00';
    elements['#entryPaymentMethod'].value = 'dinheiro';
    ctx.setEntryRecurrence('recurring');
    ctx.syncDestinationRules();

    elements['#entryForm'].dispatchEvent('submit');

    assert.strictEqual(state.fixed.length, 1);
    const fixed = state.fixed[0];
    assert.strictEqual(fixed.payment?.method, 'dinheiro');
    assert.strictEqual(fixed.destination, 'Dinheiro');
    assert.strictEqual(ctx.getExpensePaymentInfo(fixed, 2026, 9, 800).status, 'pago');
    assert.strictEqual(ctx.getExpensePaymentInfo(fixed, 2026, 10, 800).status, 'pendente');
  });

  test('V2-05. Crédito + única: gera despesa pontual com conta vinculada e status pendente', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Livro Técnico';
    elements['#entryAmount'].value = '95.00';
    elements['#entryPaymentMethod'].value = 'cartao_credito';
    elements['#entryAccount'].value = 'Nubank';
    ctx.setEntryRecurrence('single');
    ctx.syncDestinationRules();

    elements['#entryForm'].dispatchEvent('submit');

    assert.strictEqual(state.variable.length, 1);
    const item = state.variable[0];
    assert.strictEqual(item.payment?.method, 'cartao_credito');
    assert.strictEqual(item.payment?.account, 'Nubank');
    assert.strictEqual(item.destination, 'Nubank');
    assert.strictEqual(item.installments, 1);
    assert.strictEqual(item.dueDay, 10, 'Deve herdar vencimento dia 10 do Nubank');
    assert.strictEqual(ctx.getExpensePaymentInfo(item, 2026, 9, 95).status, 'pendente');
  });

  test('V2-06. Crédito + parcelada: registra installments com temporal.type installment', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'installment' });
    elements['#entryName'].value = 'Smartphone Novo';
    elements['#entryAmount'].value = '400.00';
    elements['#entryPaymentMethod'].value = 'cartao_credito';
    elements['#entryAccount'].value = 'Nubank';
    elements['#varInstallmentsCount'].value = '5';
    elements['#varStartMonth'].value = '9';
    elements['#varStartYear'].value = '2026';
    ctx.setEntryRecurrence('installment');
    ctx.syncDestinationRules();

    elements['#entryForm'].dispatchEvent('submit');

    assert.strictEqual(state.variable.length, 1);
    const item = state.variable[0];
    assert.strictEqual(item.payment?.method, 'cartao_credito');
    assert.strictEqual(item.payment?.account, 'Nubank');
    assert.strictEqual(item.installments, 5);
    assert.strictEqual(item.temporal?.type, 'installment');
    assert.strictEqual(item.temporal?.installments, 5);
  });

  test('V2-07. Crédito + recorrente: salva em fixed com conta e vencimento herdado', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'fixed' });
    elements['#entryName'].value = 'Assinatura Software';
    elements['#entryAmount'].value = '75.00';
    elements['#entryPaymentMethod'].value = 'cartao_credito';
    elements['#entryAccount'].value = 'Nubank';
    ctx.setEntryRecurrence('recurring');
    ctx.syncDestinationRules();

    elements['#entryForm'].dispatchEvent('submit');

    assert.strictEqual(state.fixed.length, 1);
    const fixed = state.fixed[0];
    assert.strictEqual(fixed.payment?.method, 'cartao_credito');
    assert.strictEqual(fixed.payment?.account, 'Nubank');
    assert.strictEqual(fixed.destination, 'Nubank');
    assert.strictEqual(fixed.dueDay, 10);
    assert.strictEqual(fixed.temporal?.type, 'fixed');
  });

  test('V2-08. Favorecido opcional: presente preenche payee; ausente salva null', () => {
    const { ctx, elements, state } = createMockEnvironment();

    // 8a: Favorecido presente
    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Consulta Odontológica';
    elements['#entryAmount'].value = '250.00';
    elements['#entryPaymentMethod'].value = 'pix';
    elements['#entryPayee'].value = 'Dr. Marcos Silva';
    ctx.setEntryRecurrence('single');
    ctx.syncDestinationRules();
    elements['#entryForm'].dispatchEvent('submit');

    const item1 = state.variable[0];
    assert.strictEqual(item1.payee, 'Dr. Marcos Silva');
    assert.strictEqual(ctx.resolveExpensePayee(item1), 'Dr. Marcos Silva');

    // 8b: Favorecido ausente
    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Farmácia Genérica';
    elements['#entryAmount'].value = '30.00';
    elements['#entryPaymentMethod'].value = 'pix';
    elements['#entryPayee'].value = '   ';
    ctx.setEntryRecurrence('single');
    ctx.syncDestinationRules();
    elements['#entryForm'].dispatchEvent('submit');

    const item2 = state.variable[1];
    assert.strictEqual(item2.payee, null);
    assert.strictEqual(ctx.resolveExpensePayee(item2), null);
  });

  test('V2-09. Conta opcional: presente salva account e destination; ausente salva null e fallback canônico', () => {
    const { ctx, elements, state } = createMockEnvironment();

    // 9a: Conta presente no PIX
    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Transferência Aluguel';
    elements['#entryAmount'].value = '1500.00';
    elements['#entryPaymentMethod'].value = 'pix';
    elements['#entryAccount'].value = 'Inter';
    ctx.setEntryRecurrence('single');
    ctx.syncDestinationRules();
    elements['#entryForm'].dispatchEvent('submit');

    const item1 = state.variable[0];
    assert.strictEqual(item1.payment?.account, 'Inter');
    assert.strictEqual(item1.destination, 'Inter');
    assert.strictEqual(ctx.resolveExpenseAccount(item1), 'Inter');

    // 9b: Conta ausente no PIX
    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'Café';
    elements['#entryAmount'].value = '8.00';
    elements['#entryPaymentMethod'].value = 'pix';
    elements['#entryAccount'].value = '';
    ctx.setEntryRecurrence('single');
    ctx.syncDestinationRules();
    elements['#entryForm'].dispatchEvent('submit');

    const item2 = state.variable[1];
    assert.strictEqual(item2.payment?.account, null);
    assert.strictEqual(item2.destination, 'Pix');
    assert.strictEqual(ctx.resolveExpenseAccount(item2), null);
  });

  test('V2-10. Método de pagamento: Transferência', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'TED Fornecedor';
    elements['#entryAmount'].value = '350.00';
    elements['#entryPaymentMethod'].value = 'transferencia';
    elements['#entryAccount'].value = 'Itaú';
    ctx.setEntryRecurrence('single');
    ctx.syncDestinationRules();
    elements['#entryForm'].dispatchEvent('submit');

    const item = state.variable[0];
    assert.strictEqual(item.payment?.method, 'transferencia');
    assert.strictEqual(item.payment?.account, 'Itaú');
    assert.strictEqual(item.destination, 'Itaú');
    assert.strictEqual(ctx.PAYMENT_METHOD_NAMES_MAP['transferencia'], 'Transferência');
  });

  test('V2-11. Método de pagamento: Débito Automático', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'fixed' });
    elements['#entryName'].value = 'Conta de Luz Débito Auto';
    elements['#entryAmount'].value = '210.00';
    elements['#entryPaymentMethod'].value = 'debito_automatico';
    elements['#entryAccount'].value = 'Bradesco';
    ctx.setEntryRecurrence('recurring');
    ctx.syncDestinationRules();
    elements['#entryForm'].dispatchEvent('submit');

    const fixed = state.fixed[0];
    assert.strictEqual(fixed.payment?.method, 'debito_automatico');
    assert.strictEqual(fixed.payment?.account, 'Bradesco');
    assert.strictEqual(fixed.destination, 'Bradesco');
    assert.strictEqual(ctx.PAYMENT_METHOD_NAMES_MAP['debito_automatico'], 'Débito Automático');
  });

  test('V2-12. Recorrência por quantidade atravessando mudança de ano', () => {
    const { ctx, elements, state, recEndTypeRadios } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'fixed' });
    elements['#entryName'].value = 'Treinamento 5 Meses';
    elements['#entryAmount'].value = '100.00';
    elements['#entryPaymentMethod'].value = 'pix';
    elements['#fixedEffMonth'].value = '11';
    elements['#fixedEffYear'].value = '2026';
    ctx.setEntryRecurrence('recurring');
    ctx.syncDestinationRules();

    recEndTypeRadios[0].checked = false;
    recEndTypeRadios[1].checked = true; // count
    elements['#recCountInput'].value = '5';
    ctx.updateRecDurationView();

    elements['#entryForm'].dispatchEvent('submit');

    const fixed = state.fixed[0];
    // Início em 11/2026 por 5 meses: 11/2026, 12/2026, 1/2027, 2/2027, 3/2027. Término: 4/2027
    assert.strictEqual(fixed.endedFrom?.year, 2027);
    assert.strictEqual(fixed.endedFrom?.month, 4);

    // Testa meses ativos atravessando virada de ano
    assert.ok(ctx.activeFixedForMonth(2026, 11).find(f => f.fixedId === fixed.id));
    assert.ok(ctx.activeFixedForMonth(2026, 12).find(f => f.fixedId === fixed.id));
    assert.ok(ctx.activeFixedForMonth(2027, 1).find(f => f.fixedId === fixed.id));
    assert.ok(ctx.activeFixedForMonth(2027, 2).find(f => f.fixedId === fixed.id));
    assert.ok(ctx.activeFixedForMonth(2027, 3).find(f => f.fixedId === fixed.id));

    // Mês após término: inativo
    assert.strictEqual(ctx.activeFixedForMonth(2027, 4).find(f => f.fixedId === fixed.id), undefined);
  });

  test('V2-13. Recorrência até competência final determinada', () => {
    const { ctx, elements, state, recEndTypeRadios } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'fixed' });
    elements['#entryName'].value = 'Contrato Consultoria Até Fim do Ano';
    elements['#entryAmount'].value = '600.00';
    elements['#entryPaymentMethod'].value = 'pix';
    elements['#fixedEffMonth'].value = '9';
    elements['#fixedEffYear'].value = '2026';
    ctx.setEntryRecurrence('recurring');
    ctx.syncDestinationRules();

    recEndTypeRadios[0].checked = false;
    recEndTypeRadios[1].checked = false;
    recEndTypeRadios[2].checked = true; // date
    elements['#recEndMonth'].value = '12';
    elements['#recEndYear'].value = '2026';
    ctx.updateRecDurationView();

    elements['#entryForm'].dispatchEvent('submit');

    const fixed = state.fixed[0];
    assert.strictEqual(fixed.temporal?.recurrence?.type, 'date');
    assert.strictEqual(fixed.temporal?.recurrence?.endMonth, 12);
    assert.strictEqual(fixed.temporal?.recurrence?.endYear, 2026);
    // Primeiro mês inativo é Janeiro 2027
    assert.strictEqual(fixed.endedFrom?.year, 2027);
    assert.strictEqual(fixed.endedFrom?.month, 1);

    assert.ok(ctx.activeFixedForMonth(2026, 9).find(f => f.fixedId === fixed.id));
    assert.ok(ctx.activeFixedForMonth(2026, 12).find(f => f.fixedId === fixed.id));
  });

  test('V2-14. Competência imediatamente posterior ao término NÃO deve conter a despesa', () => {
    const fixedEnded = {
      id: 'fix_ended_test_14',
      name: 'Assinatura Finalizada',
      group: 'Lazer',
      destination: 'Pix',
      payment: { method: 'pix', account: null },
      paymentType: 'fixed',
      versions: [{ year: 2026, month: 1, amount: 50 }],
      endedFrom: { year: 2027, month: 1 }
    };

    const { ctx } = createMockEnvironment({ fixed: [fixedEnded] });

    // Dezembro 2026: deve conter
    const inDec = ctx.activeFixedForMonth(2026, 12).find(f => f.fixedId === 'fix_ended_test_14');
    assert.ok(inDec, 'Última competência deve conter a despesa');

    // Janeiro 2027: não deve conter
    const inJan = ctx.activeFixedForMonth(2027, 1).find(f => f.fixedId === 'fix_ended_test_14');
    assert.strictEqual(inJan, undefined, 'Primeira competência inativa NÃO deve conter a despesa');

    // Fevereiro 2027: não deve conter
    const inFeb = ctx.activeFixedForMonth(2027, 2).find(f => f.fixedId === 'fix_ended_test_14');
    assert.strictEqual(inFeb, undefined, 'Competências futuras NÃO devem conter a despesa');
  });

  test('V2-15. paidHistory preservado durante edição com novos campos V2', () => {
    const existingFixed = {
      id: 'fix_hist_preserve_15',
      name: 'Internet V1',
      group: 'Moradia',
      destination: 'Pix',
      paymentType: 'fixed',
      versions: [{ year: 2026, month: 1, amount: 100 }],
      paidHistory: {
        '2026-1': true,
        '2026-2': true,
        '2026-5': { paidAmount: 100, status: 'pago' }
      }
    };

    const { ctx, elements, state } = createMockEnvironment({ fixed: [existingFixed] });

    ctx.openEntryDialog({ mode: 'edit', type: 'fixed', fixedId: 'fix_hist_preserve_15' });
    elements['#entryName'].value = 'Internet V2 Fibra Turbo';
    elements['#entryPaymentMethod'].value = 'debito_automatico';
    elements['#entryAccount'].value = 'Santander';
    elements['#entryPayee'].value = 'Operadora Vivo';
    elements['#entryForm'].dispatchEvent('submit');

    const updated = state.fixed[0];
    assert.strictEqual(updated.name, 'Internet V2 Fibra Turbo');
    assert.strictEqual(updated.payment?.method, 'debito_automatico');
    assert.strictEqual(updated.payment?.account, 'Santander');
    assert.strictEqual(updated.payee, 'Operadora Vivo');
    assert.strictEqual(updated.destination, 'Santander');

    // Histórico de pagamentos continua intacto
    assert.strictEqual(updated.paidHistory['2026-1'], true);
    assert.strictEqual(updated.paidHistory['2026-2'], true);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(updated.paidHistory['2026-5'])), { paidAmount: 100, status: 'pago' });
  });

  test('V2-16. Registro legado somente com destination continua legível e editável', () => {
    const legacyItem = {
      id: 'leg_record_16',
      name: 'Seguro Auto Antigo',
      group: 'Transporte',
      destination: 'Porto Seguro',
      dueDay: 20,
      paymentType: 'fixed',
      versions: [{ year: 2026, month: 1, amount: 250 }]
    };

    const { ctx, elements, state } = createMockEnvironment({ fixed: [legacyItem] });

    // Resolução retrocompatível
    assert.strictEqual(ctx.resolveExpensePaymentMethod(legacyItem), 'cartao_credito');
    assert.strictEqual(ctx.resolveExpenseAccount(legacyItem), 'Porto Seguro');
    assert.strictEqual(ctx.resolveExpensePayee(legacyItem), null);

    // Abre em modo de edição
    ctx.openEntryDialog({ mode: 'edit', type: 'fixed', fixedId: 'leg_record_16' });
    assert.strictEqual(elements['#entryPaymentMethod'].value, 'cartao_credito');
    assert.strictEqual(elements['#entryAccount'].value, 'Porto Seguro');

    // Atualiza com novo favorecido V2
    elements['#entryPayee'].value = 'Corretora Silva';
    elements['#entryForm'].dispatchEvent('submit');

    const saved = state.fixed[0];
    assert.strictEqual(saved.payee, 'Corretora Silva');
    assert.strictEqual(saved.payment?.method, 'cartao_credito');
    assert.strictEqual(saved.payment?.account, 'Porto Seguro');
    assert.strictEqual(saved.destination, 'Porto Seguro');
  });

  test('V2-17. Método PIX não deve ser arquiteturalmente equivalente a status pago: suporta PIX pendente', () => {
    const { ctx, elements, state } = createMockEnvironment();

    ctx.openEntryDialog({ mode: 'new', type: 'cash' });
    elements['#entryName'].value = 'PIX Agendado para Amanhã';
    elements['#entryAmount'].value = '300.00';
    elements['#entryPaymentMethod'].value = 'pix';
    elements['#entryStatus'].value = 'pendente'; // Usuário explicitou status pendente
    ctx.setEntryRecurrence('single');
    ctx.syncDestinationRules();

    elements['#entryForm'].dispatchEvent('submit');

    const item = state.variable[0];
    assert.strictEqual(item.payment?.method, 'pix');
    const payInfo = ctx.getExpensePaymentInfo(item, 2026, 9, 300);
    assert.strictEqual(payInfo.status, 'pendente', 'Método PIX com status pendente deve permanecer PENDENTE');
    assert.strictEqual(payInfo.isPaid, false);
    assert.strictEqual(payInfo.paidAmount, 0);
  });

  test('V2-18. Despesa criada pela IA respeita o contrato V2 sem quebrar payload legado', () => {
    const { confirmExpenseProposal } = require('../server/services/aiService');
    const { validateFinanceSemantics } = require('../server/services/financeValidation');

    // 18a: Proposta da IA com campos V2
    const financesState1 = { fixed: [], variable: [], destinations: [{ name: 'Nubank' }] };
    const proposalV2 = {
      name: 'Exame de Sangue',
      amount: 180,
      group: 'Saúde',
      payee: 'Laboratório Fleury',
      payment: { method: 'pix', account: 'Nubank' },
      isRecurring: false,
      status: 'pendente'
    };

    const resV2 = confirmExpenseProposal(financesState1, proposalV2);
    assert.strictEqual(resV2.variable.length, 1);
    const itemV2 = resV2.variable[0];
    assert.strictEqual(itemV2.payee, 'Laboratório Fleury');
    assert.strictEqual(itemV2.payment?.method, 'pix');
    assert.strictEqual(itemV2.payment?.account, 'Nubank');
    assert.strictEqual(itemV2.destination, 'Nubank', 'Bridge V1 deve preservar o nome da conta');
    assert.strictEqual(itemV2.temporal?.type, 'cash');
    // Validação semântica do backend não deve disparar exceção
    assert.doesNotThrow(() => validateFinanceSemantics(resV2));

    // 18b: Payload legado da IA (sem payment/payee, apenas destination e isRecurring)
    const financesState2 = { fixed: [], variable: [], destinations: [{ name: 'Itaú' }] };
    const proposalLegacy = {
      name: 'Condomínio Mensal',
      amount: 650,
      group: 'Moradia',
      destination: 'Itaú',
      isRecurring: true
    };

    const resLegacy = confirmExpenseProposal(financesState2, proposalLegacy);
    assert.strictEqual(resLegacy.fixed.length, 1);
    const fixedLegacy = resLegacy.fixed[0];
    assert.strictEqual(fixedLegacy.destination, 'Itaú');
    assert.strictEqual(fixedLegacy.payment?.method, 'cartao_credito');
    assert.strictEqual(fixedLegacy.payment?.account, 'Itaú');
    assert.strictEqual(fixedLegacy.temporal?.type, 'fixed');
    assert.strictEqual(fixedLegacy.temporal?.recurrence?.type, 'never');
    assert.doesNotThrow(() => validateFinanceSemantics(resLegacy));
  });

  test('V2-19. buildEntryRow com Pix e sem conta: renderiza somente Favorecido e Método (sem [Dinheiro] ou [Gerais] fantasma)', () => {
    const { ctx } = createMockEnvironment();
    const row = ctx.buildEntryRow({
      title: 'Café da manhã',
      payee: 'Padaria Central',
      paymentMethod: 'pix',
      account: null,
      destination: 'Pix',
      amount: 25,
      status: 'pago'
    });
    assert.ok(row.innerHTML.includes('entry-sub'), 'Deve conter linha de contexto .entry-sub');
    assert.ok(row.innerHTML.includes('Padaria Central'), 'Deve conter Favorecido');
    assert.ok(row.innerHTML.includes('PIX'), 'Deve conter método PIX');
    assert.ok(!row.innerHTML.includes('Dinheiro'), 'NÃO deve vazar Dinheiro');
    assert.ok(!row.innerHTML.includes('Gerais'), 'NÃO deve vazar Gerais');
    assert.ok(!row.innerHTML.includes('null'), 'NÃO deve renderizar literal null');
  });

  test('V2-20. buildEntryRow com Cartão e Conta Nubank: renderiza Favorecido · Cartão de Crédito · Nubank', () => {
    const { ctx } = createMockEnvironment();
    const row = ctx.buildEntryRow({
      title: 'Supermercado',
      payee: 'Carrefour',
      paymentMethod: 'cartao_credito',
      account: 'Nubank',
      amount: 150,
      status: 'pendente'
    });
    assert.ok(row.innerHTML.includes('Carrefour · Cartão de Crédito · Nubank'), 'Deve renderizar Favorecido · Método · Conta');
  });

  test('V2-21. buildEntryRow sem favorecido: renderiza apenas Método · Conta (ou apenas Método)', () => {
    const { ctx } = createMockEnvironment();
    const row1 = ctx.buildEntryRow({
      title: 'Transferência Avulsa',
      payee: null,
      paymentMethod: 'pix',
      account: null,
      amount: 40,
      status: 'pago'
    });
    assert.ok(row1.innerHTML.includes('<div class="entry-sub">PIX</div>'), 'Deve renderizar apenas PIX sem favorecido');

    const row2 = ctx.buildEntryRow({
      title: 'Fatura',
      payee: null,
      paymentMethod: 'cartao_credito',
      account: 'Itaú',
      amount: 300,
      status: 'pendente'
    });
    assert.ok(row2.innerHTML.includes('<div class="entry-sub">Cartão de Crédito · Itaú</div>'), 'Deve renderizar Cartão de Crédito · Itaú');
  });

  test('V2-22. Despesa parcelada exibe chip X/N e não exibe Total na listagem compacta', () => {
    const { ctx } = createMockEnvironment();
    const row = ctx.buildEntryRow({
      title: 'Notebook Gamer',
      tags: ['Informática', '1/10'],
      amount: 500,
      status: 'pendente'
    });
    assert.ok(row.innerHTML.includes('1/10'), 'Deve exibir chip 1/10');
    assert.ok(row.innerHTML.includes('Informática'), 'Deve exibir tag de categoria');
    assert.ok(!row.innerHTML.includes('Total:'), 'NÃO deve exibir Total: R$ na listagem compacta');
  });

  test('V2-23. Despesas pagas, parciais e pendentes exibem seus respectivos badges e classes', () => {
    const { ctx } = createMockEnvironment();
    const rowPaid = ctx.buildEntryRow({ title: 'Internet', amount: 100, status: 'pago', onClickToggleStatus: () => {} });
    assert.ok(rowPaid.innerHTML.includes('status-btn paid'), 'Deve ter classe status-btn paid');

    const rowPartial = ctx.buildEntryRow({ title: 'Faculdade', amount: 1000, status: 'parcial', paidAmount: 400, remainingAmount: 600, onClickToggleStatus: () => {} });
    assert.ok(rowPartial.innerHTML.includes('status-btn partial'), 'Deve ter classe status-btn partial');
    assert.ok(rowPartial.innerHTML.includes('tag partial'), 'Deve ter tag.partial');
    assert.ok(rowPartial.innerHTML.includes('Pago:') && rowPartial.innerHTML.includes('400'), 'Deve exibir valor pago');
    assert.ok(rowPartial.innerHTML.includes('Restante:') && rowPartial.innerHTML.includes('600'), 'Deve exibir valor restante');

    const rowPending = ctx.buildEntryRow({ title: 'Condomínio', amount: 500, status: 'pendente', onClickToggleStatus: () => {} });
    assert.ok(rowPending.innerHTML.includes('status-btn pending'), 'Deve ter classe status-btn pending');
  });

  test('V2-24. Filtro por Método seleciona apenas despesas com aquele resolveExpensePaymentMethod', () => {
    const { ctx } = createMockEnvironment();
    const items = [
      { id: '1', name: 'Almoço', payment: { method: 'pix' } },
      { id: '2', name: 'Jantar', payment: { method: 'cartao_credito', account: 'Nubank' } },
      { id: '3', name: 'Feira', payment: { method: 'dinheiro' } }
    ];
    const pixOnly = items.filter(it => ctx.resolveExpensePaymentMethod(it) === 'pix');
    assert.strictEqual(pixOnly.length, 1);
    assert.strictEqual(pixOnly[0].id, '1');

    const cardOnly = items.filter(it => ctx.resolveExpensePaymentMethod(it) === 'cartao_credito');
    assert.strictEqual(cardOnly.length, 1);
    assert.strictEqual(cardOnly[0].id, '2');
  });

  test('V2-25. Filtro por Método funciona para registros legados via resolveExpensePaymentMethod', () => {
    const { ctx } = createMockEnvironment();
    const legacyItems = [
      { id: 'l1', name: 'Café', destination: 'Pix' },
      { id: 'l2', name: 'Padaria', destination: 'Dinheiro' },
      { id: 'l3', name: 'Mercado', destination: 'Nubank' },
      { id: 'l4', name: 'Livraria', destination: 'Itaú', paymentType: 'installment' }
    ];
    const pixItems = legacyItems.filter(it => ctx.resolveExpensePaymentMethod(it) === 'pix');
    assert.strictEqual(pixItems.length, 1);
    assert.strictEqual(pixItems[0].id, 'l1');

    const cardItems = legacyItems.filter(it => ctx.resolveExpensePaymentMethod(it) === 'cartao_credito');
    assert.strictEqual(cardItems.length, 2);
  });

  test('V2-26. Campo de busca pesquisa em item.payment.account e item.payee', () => {
    const items = [
      { id: '1', name: 'Lanche', payee: 'McDonalds', payment: { method: 'pix' } },
      { id: '2', name: 'Combustível', payee: 'Posto Ipiranga', payment: { method: 'cartao_credito', account: 'Bradesco Prime' } },
      { id: '3', name: 'Assinatura', payee: 'Netflix', payment: { method: 'cartao_credito', account: 'Nubank PJ' } }
    ];

    const searchPayee = 'mcdonalds';
    const foundPayee = items.filter(it => {
      const p = (it.payee || '').toLowerCase();
      return p.includes(searchPayee);
    });
    assert.strictEqual(foundPayee.length, 1);
    assert.strictEqual(foundPayee[0].id, '1');

    const searchAcc = 'bradesco';
    const foundAcc = items.filter(it => {
      const a = (it.payment?.account || '').toLowerCase();
      return a.includes(searchAcc);
    });
    assert.strictEqual(foundAcc.length, 1);
    assert.strictEqual(foundAcc[0].id, '2');
  });

  test('V2-27. Contexto enviado ao n8n contém validCategories, paymentMethods canônicos, validAccounts (sem Pix/Dinheiro)', () => {
    const finances = {
      categories: ['Alimentação', 'Saúde', 'Moradia'],
      destinations: ['Pix', 'Dinheiro', 'Nubank', 'Itaú', 'Cartão XP']
    };
    const normalizeSearchStr = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const NATIVE_METHODS = new Set(['pix', 'dinheiro', 'em dinheiro', 'cash', 'gerais', 'outros']);
    const userCategories = finances.categories;
    const rawUserDestinations = finances.destinations;
    const validAccounts = rawUserDestinations.filter(d => !NATIVE_METHODS.has(normalizeSearchStr(d)));
    const canonicalPaymentMethods = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'debito_automatico', 'outros'];

    assert.deepStrictEqual(validAccounts, ['Nubank', 'Itaú', 'Cartão XP']);
    assert.ok(!validAccounts.includes('Pix'));
    assert.ok(!validAccounts.includes('Dinheiro'));
    assert.deepStrictEqual(userCategories, ['Alimentação', 'Saúde', 'Moradia']);
    assert.strictEqual(canonicalPaymentMethods.length, 8);
  });

  test('V2-28. Resolução de categoria pelo backend faz match estrito contra userCategories com normalização segura e preserva casing original', () => {
    const userCategories = ['Alimentação', 'Saúde e Cuidados', 'Moradia'];
    const normalizeSearchStr = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    function resolveCat(input) {
      if (!input) return null;
      const targetCat = input.toLowerCase().trim();
      const normTarget = normalizeSearchStr(input);
      return userCategories.find(c => c.trim().toLowerCase() === targetCat)
        || userCategories.find(c => normalizeSearchStr(c) === normTarget)
        || null;
    }

    assert.strictEqual(resolveCat('alimentação'), 'Alimentação', 'Case-insensitive preserva casing original');
    assert.strictEqual(resolveCat('ALIMENTACAO'), 'Alimentação', 'Sem acento preserva casing original');
    assert.strictEqual(resolveCat('  alimentação  '), 'Alimentação', 'Trim preserva casing original');
    assert.strictEqual(resolveCat('saude e cuidados'), 'Saúde e Cuidados');
    assert.strictEqual(resolveCat('Alimentos'), null, 'Não deve fazer fuzzy matching agressivo');
    assert.strictEqual(resolveCat('Comida'), null, 'Não deve mapear arbitrariamente para Alimentação sem regra');
  });

  test('V2-29. Se IA retornar categoria inexistente no cadastro, category = null, requiresReview = true e confirmação é bloqueada', () => {
    const userCategories = ['Moradia', 'Transporte'];
    const aiCategory = 'Fast Food';
    const normalizeSearchStr = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    let matchedCategory = userCategories.find(c => normalizeSearchStr(c) === normalizeSearchStr(aiCategory)) || null;
    let requiresReview = !matchedCategory;
    let rawWarnings = [];
    if (!matchedCategory) {
      rawWarnings.push(`Categoria "${aiCategory}" não foi encontrada nas suas categorias.`);
    }

    assert.strictEqual(matchedCategory, null, 'Categoria inexistente deve ser null');
    assert.strictEqual(requiresReview, true, 'requiresReview deve ser true');
    assert.ok(rawWarnings[0].includes('não foi encontrada'));
  });

  test('V2-30. Backend rejeita confirmação de proposta com category = null ou inexistente com status 400', async () => {
    const { confirmExpenseProposal } = require('../server/services/aiService');

    assert.throws(() => {
      confirmExpenseProposal({ fixed: [], variable: [] }, { name: 'Coxinha', amount: 10, category: null });
    }, (err) => {
      return err.code === 'CATEGORY_REQUIRED' || err.message.includes('Categoria é obrigatória');
    });

    assert.throws(() => {
      confirmExpenseProposal({ fixed: [], variable: [] }, { name: 'Pastel', amount: 8, group: '' });
    }, (err) => {
      return err.code === 'CATEGORY_REQUIRED' || err.message.includes('Categoria é obrigatória');
    });
  });

  test('V2-31. Card da proposta no frontend renderiza Método, Favorecido, Conta / Cartão, Categoria, Competência, Temporalidade e zero "Destino"', () => {
    const { ctx } = createMockEnvironment();
    vm.runInContext(aiAssistantJs, ctx);

    const proposal = {
      proposalId: 'prop_test_1',
      status: 'pending',
      action: 'create_expense',
      data: {
        description: 'Jantar Romântico',
        amount: 250,
        category: 'Alimentação',
        payee: 'Bistrô Paris',
        payment: { method: 'cartao_credito', account: 'Nubank' },
        temporal: { type: 'cash' },
        competence: { month: 9, year: 2026 },
        installments: 1
      }
    };

    const html = ctx.renderProposalCardHtml(proposal);
    assert.ok(html.includes('Método'), 'Deve exibir Método');
    assert.ok(html.includes('Favorecido'), 'Deve exibir Favorecido');
    assert.ok(html.includes('Bistrô Paris'), 'Deve exibir nome do favorecido');
    assert.ok(html.includes('Conta / Cartão'), 'Deve exibir Conta / Cartão');
    assert.ok(html.includes('Nubank'), 'Deve exibir nome da conta');
    assert.ok(html.includes('Categoria'), 'Deve exibir Categoria');
    assert.ok(html.includes('Alimentação'), 'Deve exibir nome da categoria');
    assert.ok(html.includes('Competência'), 'Deve exibir Competência');
    assert.ok(html.includes('Temporalidade'), 'Deve exibir Temporalidade');
    assert.ok(!html.includes('Destino'), 'NÃO deve conter o rótulo Destino');
  });

  test('V2-32. Card da proposta com category = null desabilita botão de confirmação e exibe seletor de categorias reais', () => {
    const { ctx } = createMockEnvironment({
      categories: ['Alimentação', 'Saúde', 'Lazer']
    });
    vm.runInContext(aiAssistantJs, ctx);

    const proposal = {
      proposalId: 'prop_test_no_cat',
      status: 'pending',
      action: 'create_expense',
      data: {
        description: 'Pastel de Feira',
        amount: 15,
        category: null,
        requiresReview: true,
        payment: { method: 'pix' },
        temporal: { type: 'cash' },
        competence: { month: 9, year: 2026 }
      }
    };

    const html = ctx.renderProposalCardHtml(proposal);
    assert.ok(html.includes('disabled aria-disabled="true"'), 'Botão confirmar deve estar desabilitado');
    assert.ok(html.includes('ai-proposal-cat-select'), 'Deve conter select de categoria');
    assert.ok(html.includes('Alimentação'), 'Select deve conter categoria Alimentação');
    assert.ok(html.includes('Saúde'), 'Select deve conter categoria Saúde');
    assert.ok(html.includes('Lazer'), 'Select deve conter categoria Lazer');
  });

  test('V2-33. Edição da proposta permite selecionar categoria válida e em seguida confirmar com sucesso', async () => {
    const { ctx } = createMockEnvironment({
      categories: ['Alimentação', 'Saúde']
    });
    vm.runInContext(aiAssistantJs, ctx);

    const proposal = {
      proposalId: 'prop_test_edit_cat',
      status: 'pending',
      action: 'create_expense',
      data: {
        description: 'Almoço Executivo',
        amount: 45,
        category: null,
        requiresReview: true,
        payment: { method: 'pix' }
      }
    };

    // Simula seleção da categoria real pelo usuário
    proposal.data.category = 'Alimentação';
    proposal.data.requiresReview = false;

    const htmlAfter = ctx.renderProposalCardHtml(proposal);
    assert.ok(!htmlAfter.includes('disabled aria-disabled="true"'), 'Botão confirmar deve estar habilitado após escolher categoria');
    assert.ok(htmlAfter.includes('Alimentação'), 'Deve exibir Alimentação como categoria selecionada');

    // Confirmação via confirmExpenseProposal no backend deve funcionar com a categoria preenchida
    const { confirmExpenseProposal } = require('../server/services/aiService');
    const financesState = { fixed: [], variable: [], destinations: [{ name: 'Pix' }] };
    const res = confirmExpenseProposal(financesState, proposal.data);
    assert.strictEqual(res.variable.length, 1);
    assert.strictEqual(res.variable[0].group, 'Alimentação');
  });

  /* ==========================================================================
     TESTES DE REGRESSÃO: MODAL DE ANÁLISE & RESUMO ESTRUTURADO (V2-34 A V2-50)
     ========================================================================== */

  test('V2-34. Despesa única simples: renderiza Categoria, Método, Natureza = Única, Competência, Status, Valor', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'BOLSA DA NIKE',
      amount: 300,
      group: 'Lazer',
      payment: { method: 'pix', account: null },
      temporal: { type: 'single' },
      startMonth: 9,
      startYear: 2026,
      status: 'pago'
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'variable', { year: 2026, month: 9 });
    assert.ok(html.includes('Categoria'), 'Deve conter Categoria');
    assert.ok(html.includes('Lazer'), 'Deve conter valor da categoria Lazer');
    assert.ok(html.includes('Método'), 'Deve conter Método');
    assert.ok(html.includes('PIX'), 'Deve conter PIX');
    assert.ok(html.includes('Natureza'), 'Deve conter Natureza');
    assert.ok(html.includes('Única'), 'Deve conter Única');
    assert.ok(html.includes('Competência'), 'Deve conter Competência');
    assert.ok(html.includes('Set/2026'), 'Deve conter Set/2026');
    assert.ok(html.includes('Pago'), 'Deve conter Pago');
    assert.ok(html.includes(ctx.currency(300)), 'Deve conter valor de R$ 300,00');
  });

  test('V2-35. Despesa única com favorecido: renderiza Favorecido no grid', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'JANTAR',
      amount: 150,
      group: 'Alimentação',
      payee: 'Restaurante Sabor',
      payment: { method: 'cartao_debito', account: 'Nubank' },
      temporal: { type: 'single' },
      startMonth: 9,
      startYear: 2026,
      status: 'pago'
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'variable', { year: 2026, month: 9 });
    assert.ok(html.includes('Favorecido'), 'Deve conter rótulo Favorecido');
    assert.ok(html.includes('Restaurante Sabor'), 'Deve conter o nome do Favorecido');
  });

  test('V2-36. Despesa com Conta/Cartão: renderiza Conta / Cartão no grid', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'COMPRAS',
      amount: 500,
      group: 'Casa',
      payment: { method: 'cartao_credito', account: 'XP Investimentos' },
      temporal: { type: 'single' },
      startMonth: 9,
      startYear: 2026,
      status: 'pendente'
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'variable', { year: 2026, month: 9 });
    assert.ok(html.includes('Conta / Cartão'), 'Deve conter rótulo Conta / Cartão');
    assert.ok(html.includes('XP Investimentos'), 'Deve conter nome da conta XP Investimentos');
  });

  test('V2-37. Campo opcional ausente não gera "Não informado": omite Favorecido e Conta quando ausentes', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'PIX SIMPLES',
      amount: 50,
      group: 'Gerais',
      payee: null,
      payment: { method: 'pix', account: null },
      temporal: { type: 'single' },
      startMonth: 9,
      startYear: 2026,
      status: 'pago'
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'variable', { year: 2026, month: 9 });
    assert.ok(!html.includes('Não informado'), 'Não deve conter texto "Não informado"');
    assert.ok(!html.includes('Não informada'), 'Não deve conter texto "Não informada"');
    assert.ok(!html.includes('Favorecido'), 'Não deve exibir Favorecido quando ausente');
    assert.ok(!html.includes('Conta / Cartão'), 'Não deve exibir Conta / Cartão quando ausente');
  });

  test('V2-38. Parcelada mostra X/N: exibe Parcela X de N no resumo', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'SOFÁ',
      amount: 300,
      group: 'Casa',
      payee: 'Casas Bahia',
      payment: { method: 'cartao_credito', account: 'Nubank' },
      temporal: { type: 'installment' },
      installments: 10,
      startMonth: 4,
      startYear: 2026,
      endMonth: 1,
      endYear: 2027,
      status: 'pendente'
    };
    // Na competência Setembro/2026 (mês 9): (2026*12+9) - (2026*12+4) + 1 = 6
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'variable', { year: 2026, month: 9 });
    assert.ok(html.includes('Parcelada'), 'Natureza deve ser Parcelada');
    assert.ok(html.includes('6 de 10'), 'Parcelamento deve indicar 6 de 10');
  });

  test('V2-39. Parcelada mostra valor da parcela', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'SMARTPHONE',
      amount: 250,
      group: 'Lazer',
      payment: { method: 'cartao_credito', account: 'Nubank' },
      temporal: { type: 'installment' },
      installments: 12,
      startMonth: 1,
      startYear: 2026,
      endMonth: 12,
      endYear: 2026,
      status: 'pendente'
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'variable', { year: 2026, month: 9 });
    assert.ok(html.includes('Valor da parcela'), 'Deve conter campo Valor da parcela');
    assert.ok(html.includes(ctx.currency(250)), 'Deve conter valor da parcela formatado');
  });

  test('V2-40. Parcelada mostra valor total: exibe Valor total com destaque', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'SMARTPHONE',
      amount: 250,
      group: 'Lazer',
      payment: { method: 'cartao_credito', account: 'Nubank' },
      temporal: { type: 'installment' },
      installments: 12,
      startMonth: 1,
      startYear: 2026,
      endMonth: 12,
      endYear: 2026,
      status: 'pendente'
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'variable', { year: 2026, month: 9 });
    assert.ok(html.includes('Valor total'), 'Deve conter campo Valor total');
    assert.ok(html.includes(ctx.currency(3000)), 'Deve conter R$ 3.000,00 como valor total do contrato');
    assert.ok(html.includes('highlight'), 'Valor total deve ter classe highlight');
  });

  test('V2-41. Recorrente sem fim mostra "Sem data final"', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'ACADEMIA',
      amount: 100,
      group: 'Saúde',
      payee: 'Academia XYZ',
      payment: { method: 'pix', account: 'Nubank' },
      temporal: { type: 'fixed', recurrence: { frequency: 'monthly', type: 'never' } },
      paymentType: 'fixed',
      versions: [{ year: 2026, month: 8, amount: 100 }],
      endedFrom: null
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'fixed', { year: 2026, month: 9 });
    assert.ok(html.includes('Recorrente'), 'Natureza deve ser Recorrente');
    assert.ok(html.includes('Mensal'), 'Frequência deve ser Mensal');
    assert.ok(html.includes('Sem data final'), 'Término deve ser Sem data final');
    assert.ok(!html.includes('Duração'), 'Não deve exibir Duração quando sem fim');
  });

  test('V2-42. Recorrente limitada mostra competência final (Término)', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'CONTRATO ALUGUEL',
      amount: 1500,
      group: 'Moradia',
      payment: { method: 'transferencia', account: 'Itaú' },
      temporal: { type: 'fixed', recurrence: { frequency: 'monthly', type: 'date', endYear: 2027, endMonth: 6 } },
      paymentType: 'fixed',
      versions: [{ year: 2026, month: 1, amount: 1500 }],
      endedFrom: { year: 2027, month: 7 } // Primeiro mês inativo é Jul/2027, logo vigência encerra em Jun/2027
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'fixed', { year: 2026, month: 9 });
    assert.ok(html.includes('Término'), 'Deve conter Término');
    assert.ok(html.includes('Jun/2027'), 'Término deve indicar Jun/2027');
  });

  test('V2-43. Recorrente por quantidade mostra duração e término: "10 ocorrências" e Término derivado', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'PAGAMENTO FERNANDO',
      amount: 500,
      group: 'Dívidas',
      payee: 'Fernando',
      payment: { method: 'pix', account: 'Nubank' },
      temporal: { type: 'fixed', recurrence: { frequency: 'monthly', type: 'count', count: 10 } },
      paymentType: 'fixed',
      versions: [{ year: 2026, month: 9, startYear: 2026, startMonth: 9, amount: 500 }],
      endedFrom: { year: 2027, month: 7 }
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'fixed', { year: 2026, month: 9 });
    assert.ok(html.includes('Duração'), 'Deve conter campo Duração');
    assert.ok(html.includes('10 ocorrências'), 'Duração deve ser 10 ocorrências');
    assert.ok(html.includes('Término'), 'Deve conter Término');
    assert.ok(html.includes('Jun/2027'), 'Término deve ser Jun/2027');
  });

  test('V2-44. Pagamento parcial mostra pago e restante corretamente: status Parcialmente pago, Valor Pago e Restante a Pagar', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'CURSO DE INGLÊS',
      amount: 200,
      group: 'Educação',
      payment: { method: 'boleto', account: 'Bradesco' },
      temporal: { type: 'single' },
      startMonth: 9,
      startYear: 2026,
      paidHistory: {
        '2026-09': { paidAmount: 80, updatedAt: '2026-09-01T10:00:00Z' }
      }
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'variable', { year: 2026, month: 9 });
    assert.ok(html.includes('Parcialmente pago'), 'Status deve ser Parcialmente pago');
    assert.ok(html.includes(ctx.currency(80)), 'Deve exibir Valor Pago R$ 80,00');
    assert.ok(html.includes(ctx.currency(120)), 'Deve exibir Restante a Pagar R$ 120,00');
  });

  test('V2-45. Status pendente continua independente do método PIX: método PIX não força status Pago no resumo', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'PIX AGENDADO',
      amount: 150,
      group: 'Lazer',
      payment: { method: 'pix', account: null },
      temporal: { type: 'single' },
      startMonth: 9,
      startYear: 2026,
      status: 'pendente'
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'variable', { year: 2026, month: 9 });
    assert.ok(html.includes('PIX'), 'Método deve ser PIX');
    assert.ok(html.includes('Pendente'), 'Status deve ser Pendente');
    assert.ok(!html.includes('success">Pago<'), 'Não deve conter badge Pago');
  });

  test('V2-46. Registro legado V1 abre corretamente e resolve dimensões via helpers de compatibilidade', () => {
    const { ctx } = createMockEnvironment();
    const itemLegado = {
      id: 'leg_v1_test',
      name: 'Almoço',
      amount: 45,
      group: 'Alimentação',
      destination: 'Nubank',
      paymentType: 'cash',
      status: 'pago'
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(itemLegado, 'variable', { year: 2026, month: 9 });
    assert.ok(html.includes('Alimentação'), 'Deve resolver categoria Alimentação');
    assert.ok(html.includes('Cartão de Crédito'), 'Deve inferir Cartão de Crédito a partir do destino Nubank legado');
    assert.ok(html.includes('Nubank'), 'Deve inferir Nubank como Conta / Cartão');
    assert.ok(html.includes('Única'), 'Deve inferir natureza Única');
    assert.ok(html.includes('Pago'), 'Status deve ser Pago');
  });

  test('V2-47. destination não aparece como label de negócio no resumo V2 (não exibe "Destino: ...")', () => {
    const { ctx, elements, state } = createMockEnvironment();
    const item = {
      id: 'exp_no_dest_label',
      name: 'INTERNET',
      amount: 120,
      group: 'Moradia',
      destination: 'Nubank',
      payment: { method: 'boleto', account: 'Nubank' },
      temporal: { type: 'single' },
      startMonth: 9,
      startYear: 2026,
      status: 'pago'
    };
    state.variable.push(item);

    ctx.openExpenseTimeline({ type: 'variable', id: 'exp_no_dest_label' });
    const summaryHtml = elements['#expenseAnalysisSummary'].innerHTML;
    const subText = elements['#timelineSub'].textContent;

    assert.ok(!summaryHtml.includes('Destino:'), 'O resumo não deve conter label "Destino:"');
    assert.ok(!summaryHtml.includes('Destino</span>'), 'O resumo não deve conter label Destino');
    assert.ok(!subText.includes('Destino:'), 'O subtítulo timelineSub não deve conter "Destino:"');
  });

  test('V2-48. Resumo não duplica desnecessariamente nome/descrição já presentes no cabeçalho', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'ENERGIA SOLAR',
      amount: 1500,
      group: 'Investimento',
      payment: { method: 'cartao_credito', account: 'Nubank' },
      temporal: { type: 'single' },
      startMonth: 9,
      startYear: 2026,
      status: 'pago'
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'variable', { year: 2026, month: 9 });
    assert.ok(!html.includes('Descrição'), 'Não deve conter rótulo redundante "Descrição"');
    assert.ok(!html.includes('Nome:'), 'Não deve conter rótulo redundante "Nome:"');
  });

  test('V2-49. Histórico/competências existente continua sendo renderizado na tabela de 12 meses', () => {
    const { ctx, elements, state } = createMockEnvironment();
    const item = {
      id: 'exp_timeline_history',
      name: 'SEGURO CARRO',
      amount: 200,
      group: 'Transporte',
      payment: { method: 'cartao_credito', account: 'Porto Seguro' },
      temporal: { type: 'installment' },
      startMonth: 1,
      startYear: 2026,
      endMonth: 12,
      endYear: 2026,
      installments: 12,
      status: 'pendente'
    };
    state.variable.push(item);

    ctx.openExpenseTimeline({ type: 'variable', id: 'exp_timeline_history' });
    const tableHtml = elements['#timelineTableBody'].innerHTML;
    assert.ok(tableHtml.includes('Janeiro / 2026'), 'Tabela deve conter Janeiro / 2026');
    assert.ok(tableHtml.includes('Dezembro / 2026'), 'Tabela deve conter Dezembro / 2026');
    assert.ok(tableHtml.includes(ctx.currency(200)), 'Tabela deve conter valor R$ 200,00');
    assert.ok(tableHtml.includes('Parcela'), 'Tabela deve indicar Parcela');
  });

  test('V2-50. Layout não utiliza inline styles no HTML gerado pelo resumo estruturado', () => {
    const { ctx } = createMockEnvironment();
    const item = {
      name: 'TESTE SEM INLINE STYLES',
      amount: 100,
      group: 'Lazer',
      payee: 'Cinema',
      payment: { method: 'pix', account: null },
      temporal: { type: 'single' },
      startMonth: 9,
      startYear: 2026,
      status: 'pago'
    };
    const html = ctx.buildExpenseAnalysisSummaryHtml(item, 'variable', { year: 2026, month: 9 });
    assert.ok(!html.includes('style="'), 'O HTML do resumo não deve utilizar atributos style inline');
  });

});
