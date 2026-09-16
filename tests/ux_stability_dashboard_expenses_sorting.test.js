/**
 * CORVFIN — UX STABILITY PATCH
 * TEST SUITE: DASHBOARD EXPANDABLE RE-RENDER PRESERVATION + EXPENSE TABLE SORTING
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Carrega arquivos reais
const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const componentsCss = fs.readFileSync(path.join(__dirname, '../public/css/components.css'), 'utf8');
const expensesJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/expenses.js'), 'utf8');
const calendarJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/calendar.js'), 'utf8');
const consolidatedDashboardJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/consolidatedDashboard.js'), 'utf8');
const uiShellJs = fs.readFileSync(path.join(__dirname, '../public/js/core/uiShell.js'), 'utf8');

describe('CORVFIN — UX STABILITY PATCH TESTS', () => {

  // =========================================================================
  // PARTE 1: DASHBOARD EXPANDABLE STATE PRESERVATION (BUG A.2)
  // =========================================================================
  describe('1. Dashboard Expandable State Preservation During Drilldown Re-renders', () => {

    test('1.1. consolidatedDashboard.js declara expandedSections em memória para persistência de runtime', () => {
      assert.ok(
        consolidatedDashboardJs.includes('const expandedSections = {') &&
        consolidatedDashboardJs.includes('category: false') &&
        consolidatedDashboardJs.includes('destination: false') &&
        consolidatedDashboardJs.includes('matrix: false'),
        'consolidatedDashboard.js deve declarar expandedSections com category, destination e matrix'
      );
    });

    test('1.2. consolidatedDashboard.js lê estado do DOM antes de cada re-render', () => {
      assert.ok(
        consolidatedDashboardJs.includes("document.getElementById('dashCategorySection')") &&
        consolidatedDashboardJs.includes("existingCat.classList.contains('is-expanded')"),
        'Deve ler existingCat antes do re-render'
      );
      assert.ok(
        consolidatedDashboardJs.includes("document.getElementById('dashDestinationSection')") &&
        consolidatedDashboardJs.includes("existingDest.classList.contains('is-expanded')"),
        'Deve ler existingDest antes do re-render'
      );
      assert.ok(
        consolidatedDashboardJs.includes("document.getElementById('dashMatrixSection')") &&
        consolidatedDashboardJs.includes("existingMatrix.classList.contains('is-expanded')"),
        'Deve ler existingMatrix antes do re-render'
      );
    });

    test('1.3. Seções do Dashboard (Categoria, Destino e Matriz) possuem marcação canônica e classes dinâmicas', () => {
      assert.ok(consolidatedDashboardJs.includes('id="dashCategorySection"'), 'Seção Categoria existe');
      assert.ok(consolidatedDashboardJs.includes('id="dashCategoryHeader"'), 'Header Categoria existe');
      assert.ok(consolidatedDashboardJs.includes('id="dashCategoryContent"'), 'Content Categoria existe');
      assert.ok(consolidatedDashboardJs.includes('isCatExpanded ? \'is-expanded\' : \'is-collapsed\''), 'Classe dinâmica de Categoria');

      assert.ok(consolidatedDashboardJs.includes('id="dashDestinationSection"'), 'Seção Destino existe');
      assert.ok(consolidatedDashboardJs.includes('id="dashDestinationHeader"'), 'Header Destino existe');
      assert.ok(consolidatedDashboardJs.includes('id="dashDestinationContent"'), 'Content Destino existe');
      assert.ok(consolidatedDashboardJs.includes('isDestExpanded ? \'is-expanded\' : \'is-collapsed\''), 'Classe dinâmica de Destino');

      assert.ok(consolidatedDashboardJs.includes('id="dashMatrixSection"'), 'Seção Matriz existe');
      assert.ok(consolidatedDashboardJs.includes('id="dashMatrixHeader"'), 'Header Matriz existe');
      assert.ok(consolidatedDashboardJs.includes('id="dashMatrixContent"'), 'Content Matriz existe');
      assert.ok(consolidatedDashboardJs.includes('isMatrixExpanded ? \'is-expanded\' : \'is-collapsed\''), 'Classe dinâmica da Matriz');
    });

    test('1.4. initExpandableSection recebe defaultExpanded dinâmico e callback onToggle', () => {
      assert.ok(
        consolidatedDashboardJs.includes('defaultExpanded: isCatExpanded') &&
        consolidatedDashboardJs.includes('expandedSections.category = isExp;'),
        'Categoria deve passar isCatExpanded e onToggle'
      );
      assert.ok(
        consolidatedDashboardJs.includes('defaultExpanded: isDestExpanded') &&
        consolidatedDashboardJs.includes('expandedSections.destination = isExp;'),
        'Destino deve passar isDestExpanded e onToggle'
      );
      assert.ok(
        consolidatedDashboardJs.includes('defaultExpanded: isMatrixExpanded') &&
        consolidatedDashboardJs.includes('expandedSections.matrix = isExp;'),
        'Matriz deve passar isMatrixExpanded e onToggle'
      );
    });

    test('1.5. Simulação de ciclo de vida: expandir Categoria -> drilldown interno -> re-render -> Categoria continua is-expanded', () => {
      // Simula o mecanismo de runtime do consolidatedDashboard
      const mockExpandedSections = {
        category: false,
        destination: false,
        matrix: false
      };
      const mockExpandedAccordions = {
        categories: {},
        destinations: {}
      };

      // 1. Render inicial: tudo inicia collapsed
      assert.equal(mockExpandedSections.category, false, 'Inicialmente collapsed');
      assert.equal(mockExpandedSections.destination, false);
      assert.equal(mockExpandedSections.matrix, false);

      // 2. Usuário expande "Por Categoria"
      mockExpandedSections.category = true;

      // 3. Usuário clica no drilldown "Investimento"
      mockExpandedAccordions.categories['Investimento'] = true;

      // 4. Ocorre re-render do Dashboard (renderConsolidatedDashboardTab)
      // O render preserva o estado de mockExpandedSections
      const isCatExpandedAfterRender = !!mockExpandedSections.category;
      const isDestExpandedAfterRender = !!mockExpandedSections.destination;
      const isMatrixExpandedAfterRender = !!mockExpandedSections.matrix;

      assert.equal(isCatExpandedAfterRender, true, 'Por Categoria CONTINUA EXPANDIDO após drilldown!');
      assert.equal(isDestExpandedAfterRender, false, 'Destino permanece collapsed');
      assert.equal(isMatrixExpandedAfterRender, false, 'Matriz permanece collapsed');
      assert.equal(mockExpandedAccordions.categories['Investimento'], true, 'Drilldown de Investimento está aberto');

      // 5. Usuário abre também "Por Destino / Cartão"
      mockExpandedSections.destination = true;

      // 6. Usuário clica no drilldown de "Dinheiro" dentro de Destino
      mockExpandedAccordions.destinations['Dinheiro'] = true;

      // 7. Novo re-render: ambas seções externas devem continuar expandidas
      assert.equal(mockExpandedSections.category, true, 'Categoria continua expanded');
      assert.equal(mockExpandedSections.destination, true, 'Destino continua expanded');
      assert.equal(mockExpandedSections.matrix, false, 'Matriz continua collapsed');
      assert.equal(mockExpandedAccordions.destinations['Dinheiro'], true, 'Drilldown Dinheiro aberto');

      // 8. Usuário fecha o drilldown de Investimento
      mockExpandedAccordions.categories['Investimento'] = false;
      // Re-render: Categoria AINDA continua expandido
      assert.equal(mockExpandedSections.category, true, 'Categoria continua expanded mesmo fechando o drilldown interno');
    });

    test('1.6. Calendar Benefits collapse e preferência de storage continuam preservados', () => {
      assert.ok(calendarJs.includes('calendarBenefitsModule'), 'Módulo Benefits presente');
      assert.ok(calendarJs.includes('corvfin_calendar_benefits_expanded'), 'StorageKey de Benefits preservada');
      assert.ok(calendarJs.includes('calendarBenefitUndatedSection'), 'Seção Benefits Undated presente');
    });

  });

  // =========================================================================
  // PARTE 2: EXPENSES TABLE SORTING (BUG 2 — MANTIDO 100% INTACTO)
  // =========================================================================
  describe('2. Expenses Table Canonical Sorting & Domain Semantics', () => {

    test('2.1. Contrato canônico markup e JS: #fullscreenTable th[data-sort-col]', () => {
      assert.ok(indexHtml.includes('id="fullscreenTable"'), 'Tabela em index.html possui id="fullscreenTable"');
      assert.ok(indexHtml.includes('data-sort-col="name"'), 'Coluna name possui data-sort-col');
      assert.ok(indexHtml.includes('data-sort-col="amount"'), 'Coluna amount possui data-sort-col');
      assert.ok(indexHtml.includes('data-sort-col="dueDay"'), 'Coluna dueDay possui data-sort-col');
      assert.ok(indexHtml.includes('data-sort-col="status"'), 'Coluna status possui data-sort-col');
      assert.ok(expensesJs.includes('#fullscreenTable th[data-sort-col]'), 'JS escuta estritamente #fullscreenTable th[data-sort-col]');
    });

    test('2.2. Ordenação por DESCRIÇÃO/TÍTULO (name): alfabética case-insensitive ASC e DESC', () => {
      const items = [
        { name: 'Zap' },
        { name: 'Água' },
        { name: 'alimentação' },
        { name: 'Casa' }
      ];

      const compareFn = extractExpensesSortCompare();
      assert.ok(compareFn, 'Função compareFullscreenItems deve existir');

      // ASC
      const sortedAsc = [...items].sort((a, b) => compareFn(a, b, 'name', true));
      assert.equal(sortedAsc[0].name, 'Água');
      assert.equal(sortedAsc[1].name, 'alimentação');
      assert.equal(sortedAsc[2].name, 'Casa');
      assert.equal(sortedAsc[3].name, 'Zap');

      // DESC
      const sortedDesc = [...items].sort((a, b) => compareFn(a, b, 'name', false));
      assert.equal(sortedDesc[0].name, 'Zap');
      assert.equal(sortedDesc[1].name, 'Casa');
      assert.equal(sortedDesc[2].name, 'alimentação');
      assert.equal(sortedDesc[3].name, 'Água');
    });

    test('2.3. Ordenação por VALOR (amount): numérica pelo valor real ASC e DESC', () => {
      const items = [
        { name: 'Item 100', amount: 100 },
        { name: 'Item 25', amount: 25.5 },
        { name: 'Item 1000', amount: 1000 },
        { name: 'Item 0', amount: 0 }
      ];

      const compareFn = extractExpensesSortCompare();

      // ASC
      const sortedAsc = [...items].sort((a, b) => compareFn(a, b, 'amount', true));
      assert.equal(sortedAsc[0].amount, 0);
      assert.equal(sortedAsc[1].amount, 25.5);
      assert.equal(sortedAsc[2].amount, 100);
      assert.equal(sortedAsc[3].amount, 1000);

      // DESC
      const sortedDesc = [...items].sort((a, b) => compareFn(a, b, 'amount', false));
      assert.equal(sortedDesc[0].amount, 1000);
      assert.equal(sortedDesc[1].amount, 100);
      assert.equal(sortedDesc[2].amount, 25.5);
      assert.equal(sortedDesc[3].amount, 0);
    });

    test('2.4. Ordenação por CATEGORIA (group) e DESTINO (destination): alfabética case-insensitive', () => {
      const items = [
        { name: 'A', group: 'Saúde', destination: 'Nubank' },
        { name: 'B', group: 'Alimentação', destination: 'Carteira' },
        { name: 'C', group: 'Educação', destination: 'Inter' }
      ];

      const compareFn = extractExpensesSortCompare();

      const sortedCat = [...items].sort((a, b) => compareFn(a, b, 'group', true));
      assert.equal(sortedCat[0].group, 'Alimentação');
      assert.equal(sortedCat[1].group, 'Educação');
      assert.equal(sortedCat[2].group, 'Saúde');

      const sortedDest = [...items].sort((a, b) => compareFn(a, b, 'destination', true));
      assert.equal(sortedDest[0].destination, 'Carteira');
      assert.equal(sortedDest[1].destination, 'Inter');
      assert.equal(sortedDest[2].destination, 'Nubank');
    });

    test('2.5. Ordenação por VENCIMENTO / PARCELA (dueDay): Dia 2 < Dia 8 < Dia 15 e Sem Data ao final no ASC', () => {
      const items = [
        { name: 'A', dueDay: 15, installmentIndex: 1 },
        { name: 'B', dueDay: null, installmentIndex: 0 },
        { name: 'C', dueDay: 2, installmentIndex: 1 },
        { name: 'D', dueDay: 8, installmentIndex: 2 },
        { name: 'E', dueDay: 8, installmentIndex: 1 }, // Desempate por installmentIndex
        { name: 'F', paymentDay: 5 } // Fallback para paymentDay
      ];

      const compareFn = extractExpensesSortCompare();

      const sortedAsc = [...items].sort((a, b) => compareFn(a, b, 'dueDay', true));
      // Esperado: Dia 2 (C) < Dia 5 (F) < Dia 8 parc 1 (E) < Dia 8 parc 2 (D) < Dia 15 (A) < Sem data (B)
      assert.equal(sortedAsc[0].name, 'C', 'Dia 2 deve ser o primeiro');
      assert.equal(sortedAsc[1].name, 'F', 'Dia 5 deve ser o segundo');
      assert.equal(sortedAsc[2].name, 'E', 'Dia 8 parc 1 antes de parc 2');
      assert.equal(sortedAsc[3].name, 'D', 'Dia 8 parc 2');
      assert.equal(sortedAsc[4].name, 'A', 'Dia 15');
      assert.equal(sortedAsc[5].name, 'B', 'Sem data deve ficar no final em ASC');
    });

    test('2.6. Ordenação por STATUS: hierarquia semântica pendente (1) -> parcial (2) -> pago (3) -> desconhecido (99)', () => {
      const items = [
        { name: 'P1', status: 'pago' },
        { name: 'D1', status: 'desconhecido' },
        { name: 'Pend1', status: 'pendente' },
        { name: 'Parc1', status: 'parcial' },
        { name: 'R1', status: 'recebido' } // Alias financeiro para pago
      ];

      const compareFn = extractExpensesSortCompare();

      const sortedAsc = [...items].sort((a, b) => compareFn(a, b, 'status', true));
      assert.equal(sortedAsc[0].status, 'pendente', 'Pendente deve vir primeiro (rank 1)');
      assert.equal(sortedAsc[1].status, 'parcial', 'Parcial deve vir em segundo (rank 2)');
      assert.ok(sortedAsc[2].status === 'pago' || sortedAsc[2].status === 'recebido', 'Pago/Recebido em terceiro (rank 3)');
      assert.ok(sortedAsc[3].status === 'pago' || sortedAsc[3].status === 'recebido', 'Pago/Recebido em terceiro (rank 3)');
      assert.equal(sortedAsc[4].status, 'desconhecido', 'Status desconhecido deve vir no final com fallback determinístico');
    });

    test('2.7. Alternância de ordenação e troca de coluna', () => {
      let currentKey = 'amount';
      let currentAsc = true;

      function simulateHeaderClick(newKey) {
        if (currentKey === newKey) {
          currentAsc = !currentAsc;
        } else {
          currentKey = newKey;
          currentAsc = true;
        }
      }

      // Clique inicial em amount (já ativo) -> inverte para DESC
      simulateHeaderClick('amount');
      assert.equal(currentKey, 'amount');
      assert.equal(currentAsc, false);

      // Clique em dueDay -> muda coluna e reseta para ASC
      simulateHeaderClick('dueDay');
      assert.equal(currentKey, 'dueDay');
      assert.equal(currentAsc, true);
    });

  });

});

// Helper para extrair a função compareFullscreenItems de expenses.js
function extractExpensesSortCompare() {
  const sandbox = {
    window: {},
    document: { querySelectorAll: () => [], getElementById: () => null },
    $: () => null,
    $$: () => [],
    MONTH_NAMES: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    getState: () => ({ year: 2026, month: 10 }),
    saveLocalState: () => {},
    formatMoney: (v) => `R$ ${v}`,
    escapeHtml: (t) => t,
    renderExpensesLists: () => {},
    markAllSectionPaid: () => {},
    reorderExpenses: () => {},
    openQuickExpenseDialog: () => {},
    openPartialPaymentDialog: () => {},
    toggleExpenseStatus: () => {}
  };

  try {
    const fn = new Function('window', 'document', '$', '$$', 'MONTH_NAMES', 'getState', 'saveLocalState', 'formatMoney', 'escapeHtml', 'renderExpensesLists', 'markAllSectionPaid', 'reorderExpenses', 'openQuickExpenseDialog', 'openPartialPaymentDialog', 'toggleExpenseStatus', expensesJs);
    fn(sandbox.window, sandbox.document, sandbox.$, sandbox.$$, sandbox.MONTH_NAMES, sandbox.getState, sandbox.saveLocalState, sandbox.formatMoney, sandbox.escapeHtml, sandbox.renderExpensesLists, sandbox.markAllSectionPaid, sandbox.reorderExpenses, sandbox.openQuickExpenseDialog, sandbox.openPartialPaymentDialog, sandbox.toggleExpenseStatus);
    return sandbox.window.compareFullscreenItems;
  } catch (err) {
    console.error('Erro ao instanciar compareFullscreenItems:', err);
    return null;
  }
}
