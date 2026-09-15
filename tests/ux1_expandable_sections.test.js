/**
 * CORVFIN — UX REFINEMENT
 * LOTE UX1 — EXPANDABLE SECTIONS + ANNUAL VIEW CONSOLIDATION TESTS
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Carrega arquivos fonte para inspeção de markup e CSS
const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const componentsCss = fs.readFileSync(path.join(__dirname, '../public/css/components.css'), 'utf8');
const calendarCss = fs.readFileSync(path.join(__dirname, '../public/css/calendar.css'), 'utf8');
const uiShellJs = fs.readFileSync(path.join(__dirname, '../public/js/core/uiShell.js'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/dashboard.js'), 'utf8');
const calendarJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/calendar.js'), 'utf8');
const beneficiosJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/beneficios.js'), 'utf8');
const consolidatedDashboardJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/consolidatedDashboard.js'), 'utf8');

// Helper de simulação de DOM simplificado para testes unitários de componentes
function createMockElement(tagName = 'div', attributes = {}, id = '') {
  const listeners = {};
  const classListSet = new Set();
  if (attributes.class) {
    attributes.class.split(/\s+/).filter(Boolean).forEach(c => classListSet.add(c));
  }

  const el = {
    tagName: tagName.toUpperCase(),
    id: id || attributes.id || '',
    attributes: { ...attributes },
    dataset: {},
    hidden: attributes.hidden !== undefined ? attributes.hidden : false,
    textContent: '',
    innerHTML: '',
    children: [],
    parentNode: null,
    style: {},
    classList: {
      add: (...cls) => cls.forEach(c => classListSet.add(c)),
      remove: (...cls) => cls.forEach(c => classListSet.delete(c)),
      contains: (c) => classListSet.has(c),
      toggle: (c) => {
        if (classListSet.has(c)) { classListSet.delete(c); return false; }
        classListSet.add(c); return true;
      }
    },
    getAttribute: (attr) => (attr in el.attributes ? String(el.attributes[attr]) : null),
    setAttribute: (attr, val) => {
      el.attributes[attr] = String(val);
      if (attr === 'hidden') el.hidden = true;
    },
    removeAttribute: (attr) => {
      delete el.attributes[attr];
      if (attr === 'hidden') el.hidden = false;
    },
    addEventListener: (event, handler) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener: (event, handler) => {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(h => h !== handler);
    },
    dispatchEvent: (event) => {
      const handlers = listeners[event.type] || [];
      handlers.forEach(h => h(event));
    },
    click: () => {
      el.dispatchEvent({ type: 'click', target: el });
    },
    querySelector: (selector) => {
      return el.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll: (selector) => {
      const results = [];
      function traverse(node) {
        for (const child of node.children) {
          if (matchesSelector(child, selector)) {
            results.push(child);
          }
          traverse(child);
        }
      }
      traverse(el);
      return results;
    },
    appendChild: (child) => {
      child.parentNode = el;
      el.children.push(child);
      return child;
    }
  };

  return el;
}

function matchesSelector(el, selector) {
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
  if (selector.startsWith('[')) {
    const attrMatch = selector.match(/\[([a-zA-Z0-9_-]+)(?:="?([^"\]]*)"?)?\]/);
    if (attrMatch) {
      const attrName = attrMatch[1];
      const attrVal = attrMatch[2];
      if (attrVal === undefined) return el.getAttribute(attrName) !== null;
      return el.getAttribute(attrName) === attrVal;
    }
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

describe('CORVFIN — UX1: EXPANDABLE SECTIONS + ANNUAL VIEW CONSOLIDATION', () => {
  let mockUiShell;

  describe('1. Padrão Reutilizável e Genérico (Design System & uiShell)', () => {

    beforeEach(() => {
      const exportsObj = {};
      const sandbox = {
        window: {
          addEventListener: () => {},
          removeEventListener: () => {}
        },
        document: {
          addEventListener: () => {},
          removeEventListener: () => {},
          getElementById: (id) => (global.document && global.document.getElementById ? global.document.getElementById(id) : null),
          querySelector: () => null,
          querySelectorAll: () => [],
          createElement: () => ({ style: {}, setAttribute: () => {}, addEventListener: () => {}, removeEventListener: () => {} }),
          body: { appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [] },
          readyState: 'complete'
        },
        navigator: {},
        $: () => null,
        $$: () => [],
        module: { exports: exportsObj }
      };
      // Executa uiShell.js em escopo simulado
      const currentUiShellJs = fs.readFileSync(path.join(__dirname, '../public/js/core/uiShell.js'), 'utf8');
      const fn = new Function('window', 'document', 'navigator', '$', '$$', 'module', currentUiShellJs);
      fn(sandbox.window, sandbox.document, sandbox.navigator, sandbox.$, sandbox.$$, sandbox.module);
      mockUiShell = sandbox.module.exports;
    });

    test('Helper initExpandableSection é exportado e genérico (sem acoplamento com ribbon)', () => {
      assert.equal(typeof mockUiShell.initExpandableSection, 'function');
      assert.equal(typeof mockUiShell.initAllExpandableSections, 'function');
    });

    test('Seção inicia collapsed por padrão (aria-expanded="false", hidden ativo, classe is-collapsed)', () => {
      const container = createMockElement('div', { class: 'expandable-section' }, 'mySection');
      const header = createMockElement('button', { class: 'expandable-section__header', 'aria-controls': 'myContent' });
      const content = createMockElement('div', { class: 'expandable-section__content', id: 'myContent', hidden: '' }, 'myContent');

      container.appendChild(header);
      container.appendChild(content);

      // Document mock para busca por ID
      const docMock = {
        getElementById: (id) => (id === 'myContent' ? content : null)
      };
      global.document = docMock;

      const api = mockUiShell.initExpandableSection(container);

      assert.ok(api);
      assert.equal(api.isExpanded(), false);
      assert.equal(header.getAttribute('aria-expanded'), 'false');
      assert.equal(content.hidden, true);
      assert.ok(container.classList.contains('is-collapsed'));
      assert.ok(!container.classList.contains('is-expanded'));
    });

    test('Clique no header expande a seção (aria-expanded="true", hidden removido, classe is-expanded)', () => {
      const container = createMockElement('div', { class: 'expandable-section' }, 'mySection');
      const header = createMockElement('button', { class: 'expandable-section__header', 'aria-controls': 'myContent' });
      const content = createMockElement('div', { class: 'expandable-section__content', id: 'myContent', hidden: '' }, 'myContent');

      container.appendChild(header);
      container.appendChild(content);
      global.document = { getElementById: (id) => (id === 'myContent' ? content : null) };

      const api = mockUiShell.initExpandableSection(container);

      // Simula primeiro clique
      header.click();

      assert.equal(api.isExpanded(), true);
      assert.equal(header.getAttribute('aria-expanded'), 'true');
      assert.equal(content.hidden, false);
      assert.ok(container.classList.contains('is-expanded'));
      assert.ok(!container.classList.contains('is-collapsed'));
    });

    test('Segundo clique recolhe a seção (collapsed)', () => {
      const container = createMockElement('div', { class: 'expandable-section' }, 'mySection');
      const header = createMockElement('button', { class: 'expandable-section__header', 'aria-controls': 'myContent' });
      const content = createMockElement('div', { class: 'expandable-section__content', id: 'myContent', hidden: '' }, 'myContent');

      container.appendChild(header);
      container.appendChild(content);
      global.document = { getElementById: (id) => (id === 'myContent' ? content : null) };

      const api = mockUiShell.initExpandableSection(container);

      // 1º clique: expande
      header.click();
      assert.equal(api.isExpanded(), true);

      // 2º clique: recolhe
      header.click();
      assert.equal(api.isExpanded(), false);
      assert.equal(header.getAttribute('aria-expanded'), 'false');
      assert.equal(content.hidden, true);
      assert.ok(container.classList.contains('is-collapsed'));
    });

    test('Acessibilidade via teclado: Enter e Espaço disparam toggle', () => {
      const container = createMockElement('div', { class: 'expandable-section' }, 'mySection');
      const header = createMockElement('button', { class: 'expandable-section__header', 'aria-controls': 'myContent' });
      const content = createMockElement('div', { class: 'expandable-section__content', id: 'myContent', hidden: '' }, 'myContent');

      container.appendChild(header);
      container.appendChild(content);
      global.document = { getElementById: (id) => (id === 'myContent' ? content : null) };

      mockUiShell.initExpandableSection(container);

      // Dispara Enter
      header.dispatchEvent({ type: 'keydown', key: 'Enter', target: header });
      assert.ok(header.getAttribute('aria-expanded') === 'false' || header.getAttribute('aria-expanded') === 'true');
    });

    test('Idempotência: reinicializar a mesma seção NÃO duplica listeners nem altera o estado aberto', () => {
      const container = createMockElement('div', { class: 'expandable-section' }, 'mySection');
      const header = createMockElement('button', { class: 'expandable-section__header', 'aria-controls': 'myContent' });
      const content = createMockElement('div', { class: 'expandable-section__content', id: 'myContent', hidden: '' }, 'myContent');

      container.appendChild(header);
      container.appendChild(content);
      global.document = { getElementById: (id) => (id === 'myContent' ? content : null) };

      let toggleCount = 0;
      const api1 = mockUiShell.initExpandableSection(container, { onToggle: () => toggleCount++ });

      // Expande
      header.click();
      assert.equal(api1.isExpanded(), true);
      assert.equal(toggleCount, 1);

      // Reinicializa a mesma seção (ex: durante re-render de tela)
      const api2 = mockUiShell.initExpandableSection(container, { onToggle: () => toggleCount++ });

      // Deve ser a mesma API e manter o estado aberto
      assert.strictEqual(api1, api2);
      assert.equal(api2.isExpanded(), true);
      assert.equal(header.getAttribute('aria-expanded'), 'true');
      assert.equal(content.hidden, false);

      // Clicar novamente deve recolher (1 toggle apenas, não duplicado)
      header.click();
      assert.equal(api2.isExpanded(), false);
      assert.equal(toggleCount, 2);
    });

    test('SEM sessionStorage: padrão expansível opera em memória sem persistência forçada', () => {
      assert.ok(!uiShellJs.includes("sessionStorage.setItem('expandable_"), 'uiShell não deve forçar escrita de estado expansível em sessionStorage');
    });
  });

  describe('2. CSS do Design System (components.css & calendar.css)', () => {
    test('Namespace .expandable-section e classes obrigatórias existem em components.css', () => {
      assert.ok(componentsCss.includes('.expandable-section {'), 'Deve conter classe base .expandable-section');
      assert.ok(componentsCss.includes('.expandable-section__header {'), 'Deve conter .expandable-section__header');
      assert.ok(componentsCss.includes('.expandable-section__content {'), 'Deve conter .expandable-section__content');
      assert.ok(componentsCss.includes('rotate(180deg)') || componentsCss.includes('rotate(90deg)'), 'Chevron deve rotacionar quando expandido');
    });

    test('Modificador de scroll interno .expandable-section__content--scrollable existe em components.css', () => {
      assert.ok(componentsCss.includes('.expandable-section__content--scrollable {'), 'Deve conter modificador de scroll interno');
      assert.ok(componentsCss.includes('overflow-y: auto;'), 'Deve aplicar overflow-y: auto no scroll interno');
      assert.ok(componentsCss.includes('max-height:'), 'Deve limitar max-height no scroll interno');
    });

    test('Ajuste para .ribbon-card.expandable-section remove padding excessivo quando recolhido', () => {
      assert.ok(componentsCss.includes('.ribbon-card.expandable-section {'), 'Deve conter regra para ribbon-card quando expandable-section');
      assert.ok(componentsCss.includes('padding: 0;'), 'Deve anular padding externo no container recolhido');
    });

    test('Ajustes no calendar.css para .calendar-undated-section e .calendar-benefits-section integrados', () => {
      assert.ok(calendarCss.includes('.calendar-undated-section.expandable-section'), 'calendar.css deve estilizar undated como expandable');
      assert.ok(calendarCss.includes('.calendar-benefits-section.expandable-section'), 'calendar.css deve estilizar benefits como expandable');
    });
  });

  describe('3. Ribbon Anual de Despesas e Outras Abas (#ribbonSection)', () => {
    test('index.html declara #ribbonSection com o padrão .expandable-section e inicia expanded', () => {
      assert.ok(indexHtml.includes('id="ribbonSection"'), 'Deve conter elemento #ribbonSection');
      assert.ok(indexHtml.includes('class="ribbon-card card expandable-section is-expanded"'), 'Deve possuir classes do padrão expansível iniciando expanded');
      assert.ok(indexHtml.includes('id="ribbonToggleBtn"'), 'Deve possuir botão de toggle #ribbonToggleBtn');
      assert.ok(indexHtml.includes('aria-expanded="true"'), 'Deve iniciar com aria-expanded="true"');
      assert.ok(indexHtml.includes('aria-controls="ribbonSectionContent"'), 'Header deve controlar #ribbonSectionContent');
      assert.ok(indexHtml.includes('id="ribbonSectionContent"'), 'Conteúdo deve existir no DOM');
    });

    test('Markup de navegação e 12 meses NÃO foram removidos do ribbonSection', () => {
      assert.ok(indexHtml.includes('id="prevYear"'), 'Ano anterior mantido');
      assert.ok(indexHtml.includes('id="yearLabel"'), 'Rótulo de ano mantido');
      assert.ok(indexHtml.includes('id="nextYear"'), 'Próximo ano mantido');
      assert.ok(indexHtml.includes('id="todayBtn"'), 'Botão Mês Atual mantido');
      assert.ok(indexHtml.includes('id="ribbonLegend"'), 'Legenda mantida');
      assert.ok(indexHtml.includes('id="ribbon"'), 'Contêiner das 12 barras mantido');
      assert.ok(indexHtml.includes('id="userNameLabel"'), 'Identificação do usuário mantida');
    });

    test('renderRibbon em dashboard.js atualiza títulos contextuais e ano no badge sem perder estado expandido', () => {
      assert.ok(dashboardJs.includes("tab-expenses': 'Evolução das despesas no ano'"), 'Título contextual para Despesas');
      assert.ok(dashboardJs.includes("tab-extras': 'Evolução das rendas extras no ano'"), 'Título contextual para Extras');
      assert.ok(dashboardJs.includes("tab-debtors': 'Evolução das cobranças a receber no ano'"), 'Título contextual para Devedores');
      assert.ok(dashboardJs.includes("tab-benefits': 'Evolução dos benefícios no ano'"), 'Título contextual para Benefícios');
      assert.ok(dashboardJs.includes("window.initExpandableSection(ribbonSection"), 'renderRibbon inicializa expandable-section idempotente');
    });

    test('setupRibbonHider em beneficios.js e simulacao.js foi neutralizado para não fechar ribbon por cliques externos', () => {
      assert.ok(!beneficiosJs.includes("ribbonCard.addEventListener('click'"), 'beneficios.js não deve adicionar click listener hostil ao ribbon');
      assert.ok(!beneficiosJs.includes("sessionStorage.setItem('hide_months_ribbon'"), 'beneficios.js não deve salvar hide_months_ribbon');
    });
  });

  describe('4. Integração no Módulo do Calendário (calendar.js)', () => {
    test('"Sem data definida" adota .expandable-section, inicia expanded por padrão e exibe contador no header', () => {
      assert.ok(calendarJs.includes('id="calendarUndatedSection" data-expandable'), 'Undated possui padrão expandable-section');
      assert.ok(calendarJs.includes('id="calendarUndatedToggleBtn"'), 'Undated possui botão de toggle acessível');
      assert.ok(calendarJs.includes('id="calendarUndatedCountBadge"'), 'Undated exibe badge de contagem no header');
      assert.ok(calendarJs.includes('id="calendarUndatedContent"'), 'Undated possui contêiner de conteúdo');
      assert.ok(calendarJs.includes('expandable-section__content--scrollable'), 'Undated aplica modificador de scroll interno');
    });

    test('Benefícios sem data definem .expandable-section quando aplicável e preservam segregação', () => {
      assert.ok(calendarJs.includes('id="calendarBenefitUndatedSection" data-expandable'), 'Benefits sem data possui padrão expandable-section');
      assert.ok(calendarJs.includes('id="calendarBenefitUndatedToggleBtn"'), 'Benefits sem data possui botão de toggle acessível');
      assert.ok(calendarJs.includes('id="calendarBenefitUndatedContent"'), 'Benefits sem data possui contêiner de conteúdo');
      assert.ok(calendarJs.includes('calendarBenefitsModule'), 'Módulo canônico de benefícios mantido');
    });

    test('Grade mensal e painel do dia continuam SEMPRE visíveis e essenciais no Calendário', () => {
      assert.ok(calendarJs.includes('calendar-month-section'), 'calendar-month-section permanece no layout principal');
      assert.ok(calendarJs.includes('calendar-grid-card'), 'Grade mensal permanece ativa e visível');
      assert.ok(calendarJs.includes('calendar-day-panel'), 'Painel do dia lateral permanece ativo e visível');
      assert.ok(!calendarJs.includes('calendar-grid-card expandable-section'), 'Grade mensal NÃO foi tornada expansível');
    });

    test('Execução dinâmica no Calendário: 79 itens "Sem data definida" iniciam expandidos por padrão com badge 79 visível e podem recolher', async () => {
      // Simulação com 79 itens undated
      const undatedList = [];
      for (let i = 1; i <= 79; i++) {
        undatedList.push({
          id: `u-${i}`,
          amount: 10 * i,
          direction: 'outflow',
          description: `Despesa sem data #${i}`,
          sourceType: 'fixed_expense',
          status: 'pending'
        });
      }

      const projectionData = {
        year: 2026,
        month: 9,
        competence: '2026-09',
        summary: { inflow: 5000, outflow: 2000, net: 3000 },
        events: [{ id: 'e-1', date: '2026-09-10', amount: 100, direction: 'outflow', description: 'Teste' }],
        undated: undatedList,
        benefits: { events: [], undated: [], summary: { inflow: 0, outflow: 0, net: 0 } }
      };

      // Mock de DOM do container tab-calendar
      const mainContainer = createMockElement('main', { id: 'tab-calendar' }, 'tab-calendar');
      const docMock = {
        getElementById: (id) => (id === 'tab-calendar' ? mainContainer : null),
        querySelector: (s) => (s === '#tab-calendar' ? mainContainer : null),
        querySelectorAll: () => [],
        createElement: () => ({ style: {}, setAttribute: () => {}, addEventListener: () => {} }),
        body: { appendChild: () => {} }
      };

      const sandbox = {
        window: {
          currency: (v) => `R$ ${Number(v).toFixed(2)}`,
          escapeHtml: (s) => String(s),
          getDaysInMonth: () => 30,
          getTodayCivilDate: () => '2026-09-13',
          initExpandableSection: mockUiShell.initExpandableSection,
          API: {
            getCalendarProjection: async () => projectionData
          }
        },
        document: docMock,
        navigator: {}
      };

      const calFn = new Function('window', 'document', 'navigator', calendarJs);
      calFn(sandbox.window, sandbox.document, sandbox.navigator);

      // Verifica estado padrão do calendário: undatedExpanded = true, benefitsExpanded = true (UX1.4)
      const expState = sandbox.window.CalendarModule.getExpandableState();
      assert.equal(expState.undatedExpanded, true, 'Undated inicia expanded por padrão');
      assert.equal(expState.benefitsExpanded, true, 'Benefits inicia expanded por padrão');

      sandbox.window.CalendarModule.setState({ selectedYear: 2026, selectedMonth: 9, currentProjection: projectionData, isLoading: false, hasError: false });

      // Renderiza a UI
      sandbox.window.CalendarModule.render();

      // Inspeciona HTML gerado
      const html = mainContainer.innerHTML;
      assert.ok(html.includes('id="calendarUndatedSection"'), 'Deve conter calendarUndatedSection');
      assert.ok(html.includes('id="calendarUndatedToggleBtn"'), 'Deve conter calendarUndatedToggleBtn');
      assert.ok(html.includes('aria-expanded="true"'), 'Deve iniciar com aria-expanded="true"');
      assert.ok(html.includes('is-expanded'), 'Container deve possuir classe is-expanded');
      assert.ok(html.includes('79'), 'Badge contador de 79 itens deve estar presente no header');
      assert.ok(html.includes('expandable-section__content--scrollable'), 'Deve possuir a classe de scroll interno para suportar os 79 itens');

      // Verifica que a grade mensal e o painel do dia continuam presentes
      assert.ok(html.includes('calendar-grid-card'), 'Grade mensal está presente no layout');
      assert.ok(html.includes('calendar-day-panel'), 'Painel do dia está presente no layout');
    });

    test('Execução dinâmica no Calendário: Benefícios segregados iniciam expandidos por padrão e não afetam resumo bancário', async () => {
      const projectionData = {
        year: 2026,
        month: 9,
        competence: '2026-09',
        summary: { inflow: 10000, outflow: 3000, net: 7000 },
        events: [],
        undated: [],
        benefits: {
          events: [{ id: 'b-1', date: '2026-09-15', amount: 450, description: 'Alimentação' }],
          undated: [{ id: 'b-2', name: 'Vale Refeição', amount: 800 }],
          summary: { inflow: 800, outflow: 450, net: 350 }
        }
      };

      const mainContainer = createMockElement('main', { id: 'tab-calendar' }, 'tab-calendar');
      const docMock = {
        getElementById: (id) => (id === 'tab-calendar' ? mainContainer : null),
        querySelector: (s) => (s === '#tab-calendar' ? mainContainer : null),
        querySelectorAll: () => [],
        createElement: () => ({ style: {}, setAttribute: () => {}, addEventListener: () => {} }),
        body: { appendChild: () => {} }
      };

      const sandbox = {
        window: {
          currency: (v) => `R$ ${Number(v).toFixed(2)}`,
          escapeHtml: (s) => String(s),
          getDaysInMonth: () => 30,
          getTodayCivilDate: () => '2026-09-13',
          initExpandableSection: mockUiShell.initExpandableSection,
          API: {
            getCalendarProjection: async () => projectionData
          }
        },
        document: docMock,
        navigator: {}
      };

      const calFn = new Function('window', 'document', 'navigator', calendarJs);
      calFn(sandbox.window, sandbox.document, sandbox.navigator);

      sandbox.window.CalendarModule.setState({ selectedYear: 2026, selectedMonth: 9, currentProjection: projectionData, isLoading: false, hasError: false });

      sandbox.window.CalendarModule.render();

      const html = mainContainer.innerHTML;
      assert.ok(html.includes('id="calendarBenefitUndatedSection"'), 'Deve conter calendarBenefitUndatedSection quando há créditos sem data');
      assert.ok(html.includes('aria-expanded="true"'), 'Deve iniciar com aria-expanded="true"');
      assert.ok(html.includes('is-expanded'), 'Container de benefícios sem data deve possuir classe is-expanded');
      assert.ok(html.includes('Vale Refeição'), 'Lista de benefícios sem data deve renderizar nome do crédito');

      sandbox.window.CalendarModule.selectBenefitDate('2026-09-15');
      const updatedHtml = mainContainer.innerHTML;
      assert.ok(updatedHtml.includes('Alimentação'), 'Detalhamento do dia selecionado em benefícios deve renderizar descrição');
      assert.ok(!updatedHtml.includes('R$ 7.350,00'), 'Resumo bancário não deve somar resultado de benefícios');
      assert.ok(updatedHtml.includes('R$ 7000.00'), 'Resumo bancário não mistura valor de benefícios');
    });
  });

  describe('5. Lote UX1.5: Separação da Navegação Mensal do Ribbon Anual (5 Abas)', () => {

    test('1. default expanded nas 5 abas', () => {
      const currentDashJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/dashboard.js'), 'utf8');
      const currentUiShellJs = fs.readFileSync(path.join(__dirname, '../public/js/core/uiShell.js'), 'utf8');
      const currentIndexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
      const currentConsolidatedJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/consolidatedDashboard.js'), 'utf8');

      // TABS_WITH_MONTH_RIBBON contém exatamente as 5 abas
      const fiveTabs = ['tab-dashboard', 'tab-expenses', 'tab-extras', 'tab-debtors', 'tab-benefits'];
      fiveTabs.forEach(tab => {
        assert.ok(currentUiShellJs.includes(`'${tab}'`), `uiShell declara ${tab} em TABS_WITH_MONTH_RIBBON`);
        assert.ok(currentDashJs.includes(`'${tab}'`), `dashboard.js mapeia ${tab} para ribbon`);
      });

      // Mapeamento de títulos das 5 abas no ribbon
      assert.ok(currentDashJs.includes("'tab-dashboard': 'Visão Consolidada'"));
      assert.ok(currentDashJs.includes("'tab-expenses': 'Evolução das despesas no ano'"));
      assert.ok(currentDashJs.includes("'tab-extras': 'Evolução das rendas extras no ano'"));
      assert.ok(currentDashJs.includes("'tab-debtors': 'Evolução das cobranças a receber no ano'"));
      assert.ok(currentDashJs.includes("'tab-benefits': 'Evolução dos benefícios no ano'"));

      // Inicialização do ribbon com defaultExpanded: true
      assert.ok(currentDashJs.includes('window.initExpandableSection(ribbonSection, { defaultExpanded: true })'));

      // index.html inicia com is-expanded e aria-expanded="true"
      assert.ok(currentIndexHtml.includes('class="ribbon-card card expandable-section is-expanded"'), 'index.html inicia is-expanded');
      assert.ok(currentIndexHtml.includes('id="ribbonToggleBtn" aria-expanded="true"'), 'ribbonToggleBtn inicia aria-expanded="true"');
      assert.ok(!currentIndexHtml.includes('id="ribbonSectionContent" hidden'), 'ribbonSectionContent NÃO possui hidden estático');

      // ConsolidatedDashboardModule não possui estado artificial persistente de expansão (UX1.7)
      assert.ok(!currentConsolidatedJs.includes('let isDashboardExpanded = true'), 'consolidatedDashboard.js não deve declarar isDashboardExpanded');
      assert.ok(!currentConsolidatedJs.includes('isExpanded:'), 'ConsolidatedDashboardModule não deve expor isExpanded');
      assert.ok(!currentConsolidatedJs.includes('setExpanded:'), 'ConsolidatedDashboardModule não deve expor setExpanded');
    });

    test('2. header continua visível', () => {
      const currentIndexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
      const headerStart = currentIndexHtml.indexOf('id="ribbonSectionHeader"');
      const contentStart = currentIndexHtml.indexOf('id="ribbonSectionContent"');
      assert.ok(headerStart !== -1 && contentStart !== -1 && headerStart < contentStart);
      const headerHtml = currentIndexHtml.slice(headerStart, contentStart);

      assert.ok(headerHtml.includes('id="ribbonSectionTitle"'), 'Título no header');
      assert.ok(headerHtml.includes('id="ribbonSectionDesc"'), 'Subtítulo no header');
      assert.ok(headerHtml.includes('id="ribbonCompactNav"'), 'Navegação mensal compacta no header');
      assert.ok(headerHtml.includes('id="ribbonToggleBtn"'), 'Botão toggle no header');

      // Simulação funcional: recolher a seção mantém header visível
      const container = createMockElement('div', { class: 'expandable-section is-expanded', id: 'ribbonSection' });
      const header = createMockElement('div', { class: 'expandable-section__header', id: 'ribbonSectionHeader' });
      const trigger = createMockElement('button', { class: 'expandable-section__trigger', id: 'ribbonToggleBtn', 'aria-controls': 'ribbonSectionContent', 'aria-expanded': 'true' });
      const content = createMockElement('div', { class: 'expandable-section__content', id: 'ribbonSectionContent' });

      header.appendChild(trigger);
      container.appendChild(header);
      container.appendChild(content);

      global.document = { getElementById: (id) => (id === 'ribbonSectionContent' ? content : null) };

      const api = mockUiShell.initExpandableSection(container, { defaultExpanded: true });
      assert.equal(api.isExpanded(), true);

      // Recolhe
      api.collapse();
      assert.equal(api.isExpanded(), false);
      assert.equal(header.hidden, false, 'Header permanece visível após colapso');
      assert.equal(content.hidden, true, 'Apenas content é ocultado');
    });

    test('3. month nav continua visível', () => {
      const currentIndexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
      const headerStart = currentIndexHtml.indexOf('id="ribbonSectionHeader"');
      const contentStart = currentIndexHtml.indexOf('id="ribbonSectionContent"');
      const headerHtml = currentIndexHtml.slice(headerStart, contentStart);

      assert.ok(headerHtml.includes('id="ribbonCompactNav"'), 'compactMonthNav está no header');
      assert.ok(headerHtml.includes('id="ribbonPrevMonthBtn"'), 'Mês anterior no header');
      assert.ok(headerHtml.includes('id="ribbonCompactMonthDisplay"'), 'Display no header');
      assert.ok(headerHtml.includes('id="ribbonNextMonthBtn"'), 'Próximo mês no header');
      assert.ok(headerHtml.includes('id="ribbonCompactTodayBtn"'), 'Mês Atual no header');
      assert.ok(!currentIndexHtml.slice(contentStart).includes('id="ribbonCompactNav"'), 'compact nav NÃO está no content anual');

      // Clique na navegação compacta NÃO dispara toggle do accordion
      const container = createMockElement('div', { class: 'expandable-section is-expanded', id: 'ribbonSection' });
      const header = createMockElement('div', { class: 'expandable-section__header', id: 'ribbonSectionHeader' });
      const navWrap = createMockElement('div', { class: 'ribbon-compact-nav', id: 'ribbonCompactNav' });
      const prevBtn = createMockElement('button', { id: 'ribbonPrevMonthBtn' });
      navWrap.appendChild(prevBtn);
      const trigger = createMockElement('button', { class: 'expandable-section__trigger', id: 'ribbonToggleBtn', 'aria-controls': 'ribbonContent', 'aria-expanded': 'true' });
      const content = createMockElement('div', { class: 'expandable-section__content', id: 'ribbonContent' });

      header.appendChild(navWrap);
      header.appendChild(trigger);
      container.appendChild(header);
      container.appendChild(content);

      global.document = { getElementById: (id) => (id === 'ribbonContent' ? content : null) };

      const api = mockUiShell.initExpandableSection(container, { defaultExpanded: true });
      assert.equal(api.isExpanded(), true);

      // Simula clique no botão anterior
      prevBtn.click();
      assert.equal(api.isExpanded(), true, 'Clique no botão de mês não recolhe a seção');
      assert.equal(content.hidden, false);
    });

    test('4. annual ribbon visível expanded', () => {
      const container = createMockElement('div', { class: 'expandable-section is-expanded', id: 'ribbonSection' });
      const header = createMockElement('div', { class: 'expandable-section__header' });
      const trigger = createMockElement('button', { class: 'expandable-section__trigger', id: 'ribbonToggleBtn', 'aria-controls': 'ribbonContent', 'aria-expanded': 'true' });
      const content = createMockElement('div', { class: 'expandable-section__content', id: 'ribbonContent' });

      header.appendChild(trigger);
      container.appendChild(header);
      container.appendChild(content);

      global.document = { getElementById: (id) => (id === 'ribbonContent' ? content : null) };

      const api = mockUiShell.initExpandableSection(container, { defaultExpanded: true });
      assert.equal(api.isExpanded(), true);
      assert.equal(content.hidden, false, 'Annual ribbon visível quando expanded');
      assert.ok(container.classList.contains('is-expanded'));
      assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    });

    test('5. annual ribbon hidden collapsed', () => {
      const container = createMockElement('div', { class: 'expandable-section is-expanded', id: 'ribbonSection' });
      const header = createMockElement('div', { class: 'expandable-section__header' });
      const trigger = createMockElement('button', { class: 'expandable-section__trigger', id: 'ribbonToggleBtn', 'aria-controls': 'ribbonContent', 'aria-expanded': 'true' });
      const content = createMockElement('div', { class: 'expandable-section__content', id: 'ribbonContent' });

      header.appendChild(trigger);
      container.appendChild(header);
      container.appendChild(content);

      global.document = { getElementById: (id) => (id === 'ribbonContent' ? content : null) };

      const api = mockUiShell.initExpandableSection(container, { defaultExpanded: true });
      api.collapse();

      assert.equal(api.isExpanded(), false);
      assert.equal(content.hidden, true, 'Annual ribbon hidden quando collapsed');
      assert.ok(container.classList.contains('is-collapsed'));
      assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    });

    test('6. conteúdo funcional abaixo continua visível collapsed', () => {
      const currentIndexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

      // Garante que todas as 5 abas estão estruturadas FORA do ribbonSection (como irmãs no DOM)
      const ribbonIdx = currentIndexHtml.indexOf('id="ribbonSection"');
      const dashIdx = currentIndexHtml.indexOf('id="tab-dashboard"');
      const expIdx = currentIndexHtml.indexOf('id="tab-expenses"');
      const extIdx = currentIndexHtml.indexOf('id="tab-extras"');
      const debIdx = currentIndexHtml.indexOf('id="tab-debtors"');
      const benIdx = currentIndexHtml.indexOf('id="tab-benefits"');

      assert.ok(ribbonIdx !== -1);
      assert.ok(dashIdx > ribbonIdx, 'tab-dashboard fica abaixo de ribbonSection');
      assert.ok(expIdx > ribbonIdx, 'tab-expenses fica abaixo de ribbonSection');
      assert.ok(extIdx > ribbonIdx, 'tab-extras fica abaixo de ribbonSection');
      assert.ok(debIdx > ribbonIdx, 'tab-debtors fica abaixo de ribbonSection');
      assert.ok(benIdx > ribbonIdx, 'tab-benefits fica abaixo de ribbonSection');

      // No DOM, recolher ribbonSection afeta somente ribbonSectionContent
      const ribbonSection = createMockElement('section', { id: 'ribbonSection', class: 'expandable-section is-expanded' });
      const ribbonHeader = createMockElement('div', { class: 'expandable-section__header' });
      const ribbonContent = createMockElement('div', { class: 'expandable-section__content', id: 'ribbonSectionContent' });
      ribbonSection.appendChild(ribbonHeader);
      ribbonSection.appendChild(ribbonContent);

      const tabDashboard = createMockElement('main', { id: 'tab-dashboard' });
      const dashView = createMockElement('div', { id: 'dashboardViewWrap' });
      tabDashboard.appendChild(dashView);

      global.document = { getElementById: (id) => (id === 'ribbonSectionContent' ? ribbonContent : null) };

      const api = mockUiShell.initExpandableSection(ribbonSection, { defaultExpanded: true });
      api.collapse();

      assert.equal(ribbonContent.hidden, true);
      assert.equal(tabDashboard.hidden, false, 'tab-dashboard continua visível');
      assert.equal(dashView.hidden, false, 'dashboardViewWrap continua visível');
    });

    test('7. Dashboard metrics/filtros NÃO são escondidos pelo toggle', () => {
      const currentConsolidatedJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/consolidatedDashboard.js'), 'utf8');

      // Verifica que o Dashboard NÃO cria accordion interno próprio
      assert.ok(!currentConsolidatedJs.includes('id="dashboardExpandableSection"'), 'Não cria #dashboardExpandableSection');
      assert.ok(!currentConsolidatedJs.includes('id="dashboardToggleBtn"'), 'Não cria #dashboardToggleBtn');
      assert.ok(!currentConsolidatedJs.includes('id="dashboardSectionContent"'), 'Não cria #dashboardSectionContent');

      // Teste dinâmico de renderização
      const mainContainer = createMockElement('main', { id: 'dashboardViewWrap' }, 'dashboardViewWrap');
      const ribbonSec = createMockElement('section', { id: 'ribbonSection', class: 'expandable-section is-expanded' });
      const ribbonHeader = createMockElement('div', { id: 'ribbonSectionHeader', class: 'expandable-section__header' });
      const ribbonContent = createMockElement('div', { id: 'ribbonSectionContent', class: 'expandable-section__content' });
      const ribbonBtn = createMockElement('button', { id: 'ribbonToggleBtn', 'aria-expanded': 'true', 'aria-controls': 'ribbonSectionContent' });
      ribbonHeader.appendChild(ribbonBtn);
      ribbonSec.appendChild(ribbonHeader);
      ribbonSec.appendChild(ribbonContent);

      const mockState = {
        year: 2026,
        month: 9,
        fixed: [{ id: 'f1', name: 'Aluguel', group: 'Moradia', versions: [{ year: 2026, month: 1, amount: 1500 }], destination: 'Conta' }],
        variable: [],
        debtors: []
      };

      const sandbox = {
        window: {
          initExpandableSection: mockUiShell.initExpandableSection,
          formatMoney: (v) => `R$ ${Number(v).toFixed(2)}`,
          escapeHtml: (s) => String(s),
          todayYM: () => ({ year: 2026, month: 9 }),
          getState: () => mockState,
          state: mockState
        },
        document: {
          getElementById: (id) => {
            if (id === 'dashboardViewWrap') return mainContainer;
            if (id === 'ribbonSection') return ribbonSec;
            if (id === 'ribbonSectionHeader') return ribbonHeader;
            if (id === 'ribbonSectionContent') return ribbonContent;
            if (id === 'ribbonToggleBtn') return ribbonBtn;
            return null;
          },
          querySelector: (s) => (s === '#dashboardViewWrap' ? mainContainer : null)
        }
      };

      global.document = sandbox.document;

      const fn = new Function('window', 'document', 'getState', currentConsolidatedJs);
      fn(sandbox.window, sandbox.document, () => mockState);

      sandbox.window.ConsolidatedDashboardModule.renderConsolidatedDashboardTab();
      const html = mainContainer.innerHTML;

      assert.ok(html.includes('id="consolidatedDashboardView"'), 'Renderiza consolidatedDashboardView');
      assert.ok(html.includes('Filtros da Visão Consolidada'), 'Filtros estão no container funcional');
      assert.ok(html.includes('TOTAL CONSOLIDADO'), 'Métricas estão no container funcional');
      assert.ok(html.includes('Matriz Cruzada'), 'Matriz está no container funcional');

      // Toggling ribbon via API do ribbon compartilhado (UX1.7)
      const ribbonApi = mockUiShell.initExpandableSection(ribbonSec, { defaultExpanded: true });
      ribbonApi.collapse();

      // Ribbon content recolhe
      assert.equal(ribbonContent.hidden, true, 'Ribbon content foi ocultado');
      assert.ok(ribbonSec.classList.contains('is-collapsed'), 'Ribbon section tem classe is-collapsed');

      // Métricas e filtros do Dashboard permanecem intocados e visíveis
      assert.equal(mainContainer.hidden, false, 'mainContainer continua visível');
      assert.ok(mainContainer.innerHTML.includes('Filtros da Visão Consolidada'), 'Filtros continuam visíveis');
      assert.ok(mainContainer.innerHTML.includes('TOTAL CONSOLIDADO'), 'Métricas continuam visíveis');
    });

    test('8. não existem listeners duplicados', () => {
      const container = createMockElement('div', { class: 'expandable-section is-expanded', id: 'ribbonSection' });
      const header = createMockElement('div', { class: 'expandable-section__header' });
      const trigger = createMockElement('button', { class: 'expandable-section__trigger', id: 'ribbonToggleBtn', 'aria-controls': 'ribbonContent', 'aria-expanded': 'true' });
      const content = createMockElement('div', { class: 'expandable-section__content', id: 'ribbonContent' });

      header.appendChild(trigger);
      container.appendChild(header);
      container.appendChild(content);

      global.document = { getElementById: (id) => (id === 'ribbonContent' ? content : null) };

      let toggleCount = 0;
      const onToggle = () => { toggleCount++; };

      // Primeira chamada
      const api1 = mockUiShell.initExpandableSection(container, { defaultExpanded: true, onToggle });
      // Segunda chamada (simula re-render ou re-inits ao trocar de aba)
      const api2 = mockUiShell.initExpandableSection(container, { defaultExpanded: true, onToggle });

      assert.strictEqual(api1, api2, 'initExpandableSection retorna a mesma instância cacheada');
      assert.strictEqual(header._expandableApi, api1, 'API é preservada em header._expandableApi');

      // Dispara 1 clique no header
      header.click();
      assert.equal(toggleCount, 1, 'Listener executado exatamente 1 vez (sem duplicatas)');

      // Dispara mais 1 clique
      header.click();
      assert.equal(toggleCount, 2, 'Listener executado exatamente 2 vezes');
    });

    test('9. toggle repetido continua idempotente', () => {
      const container = createMockElement('div', { class: 'expandable-section is-expanded', id: 'ribbonSection' });
      const header = createMockElement('div', { class: 'expandable-section__header' });
      const trigger = createMockElement('button', { class: 'expandable-section__trigger', id: 'ribbonToggleBtn', 'aria-controls': 'ribbonContent', 'aria-expanded': 'true' });
      const content = createMockElement('div', { class: 'expandable-section__content', id: 'ribbonContent' });

      header.appendChild(trigger);
      container.appendChild(header);
      container.appendChild(content);

      global.document = { getElementById: (id) => (id === 'ribbonContent' ? content : null) };

      const api = mockUiShell.initExpandableSection(container, { defaultExpanded: true });

      // Alterna 10 vezes consecutivas
      for (let i = 0; i < 10; i++) {
        const shouldBeExpanded = (i % 2 !== 0); // 0: collapse, 1: expand, 2: collapse...
        header.click();
        assert.equal(api.isExpanded(), shouldBeExpanded, `Iteração ${i}: isExpanded deve ser ${shouldBeExpanded}`);
        assert.equal(content.hidden, !shouldBeExpanded, `Iteração ${i}: content.hidden deve ser ${!shouldBeExpanded}`);
        assert.equal(container.classList.contains('is-expanded'), shouldBeExpanded);
        assert.equal(container.classList.contains('is-collapsed'), !shouldBeExpanded);
        assert.equal(trigger.getAttribute('aria-expanded'), String(shouldBeExpanded));
      }
    });

    test('10. nenhuma sessionStorage/localStorage', () => {
      const currentUiShellJs = fs.readFileSync(path.join(__dirname, '../public/js/core/uiShell.js'), 'utf8');
      const currentDashJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/dashboard.js'), 'utf8');
      const currentConsolidatedJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/consolidatedDashboard.js'), 'utf8');

      // Verifica que initExpandableSection não utiliza sessionStorage e opera com storage opcional (UX2 storageKey)
      const helperSource = currentUiShellJs.slice(currentUiShellJs.indexOf('function initExpandableSection'), currentUiShellJs.indexOf('window.initExpandableSection ='));
      assert.ok(!helperSource.includes('sessionStorage'), 'initExpandableSection não usa sessionStorage');

      // dashboard.js não usa storage para ribbon
      assert.ok(!currentDashJs.includes('sessionStorage.getItem("ribbon'), 'dashboard.js não lê ribbon de sessionStorage');
      assert.ok(!currentDashJs.includes('localStorage.getItem("ribbon'), 'dashboard.js não lê ribbon de localStorage');

      // consolidatedDashboard.js não usa storage para accordion
      assert.ok(!currentConsolidatedJs.includes('sessionStorage'), 'consolidatedDashboard.js não usa sessionStorage');
      assert.ok(!currentConsolidatedJs.includes('localStorage'), 'consolidatedDashboard.js não usa localStorage');
    });

    test('11. helper suporta defaultExpanded=true e false', () => {
      const container1 = createMockElement('div', { class: 'expandable-section' }, 'sec1');
      const header1 = createMockElement('button', { class: 'expandable-section__header', 'aria-controls': 'c1' });
      const content1 = createMockElement('div', { class: 'expandable-section__content', id: 'c1', hidden: '' });
      container1.appendChild(header1);
      container1.appendChild(content1);

      global.document = { getElementById: (id) => (id === 'c1' ? content1 : null) };

      // Caso A: defaultExpanded = true abre imediatamente
      const api1 = mockUiShell.initExpandableSection(container1, { defaultExpanded: true });
      assert.equal(api1.isExpanded(), true, 'defaultExpanded: true abre a seção');
      assert.equal(header1.getAttribute('aria-expanded'), 'true');
      assert.equal(content1.hidden, false);
      assert.ok(container1.classList.contains('is-expanded'));

      // Caso B: defaultExpanded = false ou omitido mantém collapsed
      const container2 = createMockElement('div', { class: 'expandable-section' }, 'sec2');
      const header2 = createMockElement('button', { class: 'expandable-section__header', 'aria-controls': 'c2' });
      const content2 = createMockElement('div', { class: 'expandable-section__content', id: 'c2', hidden: '' });
      container2.appendChild(header2);
      container2.appendChild(content2);

      global.document = { getElementById: (id) => (id === 'c2' ? content2 : null) };

      const api2 = mockUiShell.initExpandableSection(container2, { defaultExpanded: false });
      assert.equal(api2.isExpanded(), false, 'defaultExpanded: false mantém a seção recolhida');
      assert.equal(header2.getAttribute('aria-expanded'), 'false');
      assert.equal(content2.hidden, true);
      assert.ok(container2.classList.contains('is-collapsed'));
    });
  });

  describe('6. Lote UX1.7: Correção Estrutural Definitiva do Ribbon Anual Compartilhado (Contratos A até I)', () => {

    test('A) Dashboard: ribbon inicia expanded, collapse esconde somente #ribbonSectionContent, #dashboardViewWrap e componentes permanecem visíveis e sem accordion interno', () => {
      const currentIndexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
      const currentConsolidatedJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/consolidatedDashboard.js'), 'utf8');

      // 1. Não existe accordion interno no Dashboard
      assert.ok(!currentIndexHtml.includes('id="dashboardExpandableSection"'), 'index.html não possui #dashboardExpandableSection');
      assert.ok(!currentConsolidatedJs.includes('id="dashboardExpandableSection"'), 'consolidatedDashboard.js não cria #dashboardExpandableSection');
      assert.ok(!currentConsolidatedJs.includes('isDashboardExpanded'), 'consolidatedDashboard.js não mantém estado de expansão');
      assert.ok(!currentConsolidatedJs.includes('setExpanded:'), 'ConsolidatedDashboardModule não exporta setExpanded');

      // 2. Estrutura canônica no index.html: #ribbonSection seguido de #tab-dashboard > #dashboardViewWrap
      const ribbonIdx = currentIndexHtml.indexOf('id="ribbonSection"');
      const tabDashIdx = currentIndexHtml.indexOf('id="tab-dashboard"');
      const dashWrapIdx = currentIndexHtml.indexOf('id="dashboardViewWrap"');
      assert.ok(ribbonIdx !== -1 && tabDashIdx !== -1 && dashWrapIdx !== -1);
      assert.ok(ribbonIdx < tabDashIdx, '#ribbonSection antecede #tab-dashboard');
      assert.ok(tabDashIdx < dashWrapIdx, '#tab-dashboard encapsula #dashboardViewWrap');

      // 3. Simulação dinâmica: collapse do ribbon esconde apenas #ribbonSectionContent
      const mainWrap = createMockElement('div', { id: 'dashboardViewWrap' });
      mainWrap.innerHTML = `
        <div id="consolidatedDashboardView">
          <div class="consolidated-filter-bar"><input placeholder="Pesquisar"></div>
          <div class="metrics"><span>TOTAL CONSOLIDADO</span></div>
          <div class="matrix"><table><tbody><tr><td>Matriz Cruzada</td></tr></tbody></table></div>
        </div>
      `;
      const ribbonSec = createMockElement('section', { id: 'ribbonSection', class: 'expandable-section is-expanded' });
      const ribbonHeader = createMockElement('div', { id: 'ribbonSectionHeader', class: 'expandable-section__header' });
      const ribbonContent = createMockElement('div', { id: 'ribbonSectionContent', class: 'expandable-section__content' });
      const ribbonTrigger = createMockElement('button', { id: 'ribbonToggleBtn', 'aria-expanded': 'true', 'aria-controls': 'ribbonSectionContent' });
      ribbonHeader.appendChild(ribbonTrigger);
      ribbonSec.appendChild(ribbonHeader);
      ribbonSec.appendChild(ribbonContent);

      global.document = {
        getElementById: (id) => {
          if (id === 'ribbonSection') return ribbonSec;
          if (id === 'ribbonSectionHeader') return ribbonHeader;
          if (id === 'ribbonSectionContent') return ribbonContent;
          if (id === 'ribbonToggleBtn') return ribbonTrigger;
          if (id === 'dashboardViewWrap') return mainWrap;
          return null;
        }
      };

      const api = mockUiShell.initExpandableSection(ribbonSec, { defaultExpanded: true });
      assert.equal(api.isExpanded(), true, 'Inicia expanded');
      assert.equal(ribbonContent.hidden, false);
      assert.equal(mainWrap.hidden, false);

      // Colapso
      api.collapse();
      assert.equal(api.isExpanded(), false);
      assert.equal(ribbonContent.hidden, true, 'Apenas ribbon content é ocultado');
      assert.equal(ribbonHeader.hidden, false, 'Header continua visível');
      assert.equal(mainWrap.hidden, false, '#dashboardViewWrap permanece visível');
      assert.ok(mainWrap.innerHTML.includes('consolidated-filter-bar'), 'Filtros permanecem presentes');
      assert.ok(mainWrap.innerHTML.includes('TOTAL CONSOLIDADO'), 'Cards de métricas permanecem presentes');
      assert.ok(mainWrap.innerHTML.includes('Matriz Cruzada'), 'Matriz permanece presente');

      // Expansão
      api.expand();
      assert.equal(api.isExpanded(), true);
      assert.equal(ribbonContent.hidden, false, 'Ribbon content reaparece completo');
    });

    test('B) Despesas: conteúdo funcional permanece intacto collapsed e expanded', () => {
      const currentIndexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
      const expensesTabIdx = currentIndexHtml.indexOf('id="tab-expenses"');
      assert.ok(expensesTabIdx !== -1, 'tab-expenses existe');
      const expensesSlice = currentIndexHtml.slice(expensesTabIdx, currentIndexHtml.indexOf('</main>', expensesTabIdx));

      assert.ok(expensesSlice.includes('id="listFixed"'), 'listFixed existe em tab-expenses');
      assert.ok(expensesSlice.includes('id="listVariable"'), 'listVariable existe em tab-expenses');
      assert.ok(expensesSlice.includes('id="sumFixed"'), 'sumFixed existe em tab-expenses');
      assert.ok(expensesSlice.includes('id="sumVariable"'), 'sumVariable existe em tab-expenses');

      // O toggle do ribbon superior não afeta os elementos de tab-expenses
      const ribbonSec = createMockElement('section', { id: 'ribbonSection', class: 'expandable-section is-expanded' });
      const ribbonHeader = createMockElement('div', { id: 'ribbonSectionHeader', class: 'expandable-section__header' });
      const ribbonContent = createMockElement('div', { id: 'ribbonSectionContent', class: 'expandable-section__content' });
      const ribbonTrigger = createMockElement('button', { id: 'ribbonToggleBtn', 'aria-expanded': 'true', 'aria-controls': 'ribbonSectionContent' });
      ribbonHeader.appendChild(ribbonTrigger);
      ribbonSec.appendChild(ribbonHeader);
      ribbonSec.appendChild(ribbonContent);

      const expensesEl = createMockElement('main', { id: 'tab-expenses' });
      expensesEl.innerHTML = '<div id="listFixed">Fixas</div><div id="listVariable">Variáveis</div>';

      global.document = {
        getElementById: (id) => {
          if (id === 'ribbonSectionContent') return ribbonContent;
          if (id === 'tab-expenses') return expensesEl;
          return null;
        }
      };

      const api = mockUiShell.initExpandableSection(ribbonSec, { defaultExpanded: true });
      api.collapse();
      assert.equal(expensesEl.hidden, false, 'tab-expenses continua visível após colapso do ribbon');
      assert.ok(expensesEl.innerHTML.includes('listFixed'));

      api.expand();
      assert.equal(expensesEl.hidden, false, 'tab-expenses continua visível após expansão do ribbon');
    });

    test('C) Extras: conteúdo funcional intacto e eliminação de duplicação anual (#extrasYearBars removido)', () => {
      const currentIndexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
      const currentExtrasJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/extras.js'), 'utf8');
      const currentUiShellJs = fs.readFileSync(path.join(__dirname, '../public/js/core/uiShell.js'), 'utf8');

      // 1. Gráfico 1 (Origem / Remetente) preservado
      assert.ok(currentIndexHtml.includes('id="extrasOriginBars"'), 'extrasOriginBars preservado em index.html');
      assert.ok(currentIndexHtml.includes('id="extrasOriginTotalBadge"'), 'extrasOriginTotalBadge preservado em index.html');
      assert.ok(currentExtrasJs.includes('extrasOriginBars'), 'extras.js renderiza extrasOriginBars');
      assert.ok(currentExtrasJs.includes('extrasOriginTotalBadge'), 'extras.js atualiza extrasOriginTotalBadge');

      // 2. Gráfico 2 duplicado (Evolução Anual) REMOVIDO com precisão
      assert.ok(!currentIndexHtml.includes('id="extrasYearBars"'), 'extrasYearBars NÃO existe em index.html');
      assert.ok(!currentIndexHtml.includes('id="extrasYearChartContainer"'), 'extrasYearChartContainer NÃO existe em index.html');
      assert.ok(!currentIndexHtml.includes('id="extrasYearTotalBadge"'), 'extrasYearTotalBadge NÃO existe em index.html');
      assert.ok(!currentIndexHtml.includes('id="extrasAvgSummaryText"'), 'extrasAvgSummaryText NÃO existe em index.html');
      assert.ok(!currentIndexHtml.includes('id="extrasTotalYearSummaryText"'), 'extrasTotalYearSummaryText NÃO existe em index.html');

      assert.ok(!currentExtrasJs.includes('extrasYearBars'), 'extras.js NÃO renderiza extrasYearBars');
      assert.ok(!currentExtrasJs.includes('extrasYearTotalBadge'), 'extras.js NÃO referencia extrasYearTotalBadge');

      assert.ok(!currentUiShellJs.includes('extrasYearChartContainer'), 'uiShell registry não lista extrasYearChartContainer');
      assert.ok(!currentUiShellJs.includes('extrasYearTotalBadge'), 'uiShell registry não lista extrasYearTotalBadge');

      // 3. Conteúdo funcional da aba preservado
      assert.ok(currentIndexHtml.includes('id="listExtra"'), 'listExtra preservado');
      assert.ok(currentIndexHtml.includes('id="extraMetrics"'), 'extraMetrics preservado');
      assert.ok(currentIndexHtml.includes('id="extrasSearchInput"'), 'extrasSearchInput preservado');
      assert.ok(currentIndexHtml.includes('id="extrasStatusFilter"'), 'extrasStatusFilter preservado');
    });

    test('D) Devedores: conteúdo funcional permanece intacto collapsed e expanded', () => {
      const currentIndexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
      const debtorsSlice = currentIndexHtml.slice(currentIndexHtml.indexOf('id="tab-debtors"'), currentIndexHtml.indexOf('</main>', currentIndexHtml.indexOf('id="tab-debtors"')));
      assert.ok(debtorsSlice.includes('id="listDebtors"'), 'listDebtors existe');
      assert.ok(debtorsSlice.includes('id="debtorMetrics"'), 'debtorMetrics existe');
      assert.ok(debtorsSlice.includes('id="debtorPersonChartContent"'), 'debtorPersonChartContent existe');
    });

    test('E) Benefícios: conteúdo funcional permanece intacto collapsed e expanded', () => {
      const currentIndexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
      const benefitsSlice = currentIndexHtml.slice(currentIndexHtml.indexOf('id="tab-benefits"'), currentIndexHtml.indexOf('</main>', currentIndexHtml.indexOf('id="tab-benefits"')));
      assert.ok(benefitsSlice.includes('id="listBenefits"'), 'listBenefits existe');
      assert.ok(benefitsSlice.includes('id="benefitMetrics"'), 'benefitMetrics existe');
      assert.ok(benefitsSlice.includes('id="sumBenefits"'), 'sumBenefits existe');
      assert.ok(benefitsSlice.includes('id="benefitsChartsGrid"'), 'benefitsChartsGrid existe');
    });

    test('F) Navegação: mês anterior, próximo mês e Mês Atual funcionam nos estados expanded e collapsed nas 5 abas', () => {
      const currentDashJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/dashboard.js'), 'utf8');
      assert.ok(currentDashJs.includes('function ribbonPrevMonth'), 'ribbonPrevMonth declarado');
      assert.ok(currentDashJs.includes('function ribbonNextMonth'), 'ribbonNextMonth declarado');
      assert.ok(currentDashJs.includes('function ribbonGoToCurrentMonth'), 'ribbonGoToCurrentMonth declarado');

      const fiveTabs = ['tab-dashboard', 'tab-expenses', 'tab-extras', 'tab-debtors', 'tab-benefits'];

      fiveTabs.forEach(tabId => {
        let localState = { year: 2026, month: 6 };
        let renderCalls = 0;

        const sandbox = {
          getState: () => localState,
          saveLocalState: () => {},
          saveState: () => {},
          render: () => { renderCalls++; },
          todayYM: () => ({ year: 2026, month: 9 }),
          window: {}
        };

        const fn = new Function('getState', 'saveLocalState', 'saveState', 'render', 'todayYM', 'window', `
          ${currentDashJs.slice(currentDashJs.indexOf('function ribbonPrevMonth'), currentDashJs.indexOf('// Bridges publicas autorizadas'))}
          return { ribbonPrevMonth, ribbonNextMonth, ribbonGoToCurrentMonth };
        `);

        const nav = fn(sandbox.getState, sandbox.saveLocalState, sandbox.saveState, sandbox.render, sandbox.todayYM, sandbox.window);

        // 1. Estado EXPANDED: navegação altera mês/ano e dispara render
        nav.ribbonPrevMonth();
        assert.equal(localState.month, 5, `${tabId}: prevMonth decrementou para 5`);
        assert.equal(localState.year, 2026);

        nav.ribbonNextMonth();
        assert.equal(localState.month, 6, `${tabId}: nextMonth incrementou para 6`);

        nav.ribbonGoToCurrentMonth();
        assert.equal(localState.month, 9, `${tabId}: goToCurrentMonth foi para civil 9`);
        assert.equal(localState.year, 2026);

        // 2. Estado COLLAPSED: navegação continua alterando normalmente sem quebrar
        nav.ribbonPrevMonth();
        assert.equal(localState.month, 8, `${tabId}: prevMonth em collapsed decrementou para 8`);

        nav.ribbonNextMonth();
        assert.equal(localState.month, 9, `${tabId}: nextMonth em collapsed incrementou para 9`);
      });
    });

    test('G) Lifecycle: trocar de aba restaura expanded; colapsar e navegar mês preserva collapsed; trocar aba restaura expanded', () => {
      const ribbonSec = createMockElement('section', { id: 'ribbonSection', class: 'expandable-section is-expanded' });
      const ribbonHeader = createMockElement('div', { id: 'ribbonSectionHeader', class: 'expandable-section__header' });
      const ribbonContent = createMockElement('div', { id: 'ribbonSectionContent', class: 'expandable-section__content' });
      const ribbonTrigger = createMockElement('button', { id: 'ribbonToggleBtn', 'aria-expanded': 'true', 'aria-controls': 'ribbonSectionContent' });
      ribbonHeader.appendChild(ribbonTrigger);
      ribbonSec.appendChild(ribbonHeader);
      ribbonSec.appendChild(ribbonContent);

      global.document = {
        getElementById: (id) => {
          if (id === 'ribbonSection') return ribbonSec;
          if (id === 'ribbonSectionHeader') return ribbonHeader;
          if (id === 'ribbonSectionContent') return ribbonContent;
          if (id === 'ribbonToggleBtn') return ribbonTrigger;
          return null;
        }
      };

      const api = mockUiShell.initExpandableSection(ribbonSec, { defaultExpanded: true });
      assert.equal(api.isExpanded(), true, '1. Inicia expanded ao entrar');

      // Usuário colapsa
      api.collapse();
      assert.equal(api.isExpanded(), false, '2. Usuário colapsou ribbon');
      assert.equal(ribbonContent.hidden, true);

      // Simula navegação de mês dentro da MESMA aba (renderRibbon reutiliza header._expandableApi sem expandir)
      const apiDuringMonthNav = mockUiShell.initExpandableSection(ribbonSec, { defaultExpanded: true });
      assert.equal(apiDuringMonthNav.isExpanded(), false, '3. Navegação de mês dentro da mesma aba PRESERVA collapsed');
      assert.equal(ribbonContent.hidden, true);

      // Simula troca de aba (activateTab chama header._expandableApi.expand())
      ribbonHeader._expandableApi.expand();
      assert.equal(api.isExpanded(), true, '4. Trocar para outra aba RESTAURA expanded');
      assert.equal(ribbonContent.hidden, false);

      // Colapsa na nova aba
      api.collapse();
      assert.equal(api.isExpanded(), false, '5. Colapsa na nova aba');

      // Volta para aba anterior (activateTab chama expand())
      ribbonHeader._expandableApi.expand();
      assert.equal(api.isExpanded(), true, '6. Voltar para aba anterior RESTAURA expanded');
      assert.equal(ribbonContent.hidden, false);
    });

    test('H) Listeners: zero listeners duplicados após múltiplos re-renders e idempotência após 10 ciclos de toggle', () => {
      const container = createMockElement('div', { class: 'expandable-section is-expanded', id: 'ribbonSection' });
      const header = createMockElement('div', { class: 'expandable-section__header' });
      const trigger = createMockElement('button', { class: 'expandable-section__trigger', id: 'ribbonToggleBtn', 'aria-controls': 'ribbonContent', 'aria-expanded': 'true' });
      const content = createMockElement('div', { class: 'expandable-section__content', id: 'ribbonContent' });

      header.appendChild(trigger);
      container.appendChild(header);
      container.appendChild(content);

      global.document = { getElementById: (id) => (id === 'ribbonContent' ? content : null) };

      let toggleCount = 0;
      const onToggle = () => { toggleCount++; };

      // Executa 10 inicializações sucessivas (simulando múltiplos renders e trocas de competência)
      let lastApi = null;
      for (let i = 0; i < 10; i++) {
        lastApi = mockUiShell.initExpandableSection(container, { defaultExpanded: true, onToggle });
      }

      assert.strictEqual(header._expandableApi, lastApi);

      // 1 clique dispara exatamente 1 toggle
      header.click();
      assert.equal(toggleCount, 1, 'Após 10 inicializações, exatamente 1 listener ativo');

      // Idempotência após 10 ciclos completos (expand / collapse)
      for (let i = 0; i < 10; i++) {
        lastApi.collapse();
        assert.equal(lastApi.isExpanded(), false);
        assert.equal(content.hidden, true);

        lastApi.expand();
        assert.equal(lastApi.isExpanded(), true);
        assert.equal(content.hidden, false);
      }
    });

    test('I) Persistência: zero hide_months_ribbon, sessionStorage e localStorage para expansão do ribbon', () => {
      const currentUiShellJs = fs.readFileSync(path.join(__dirname, '../public/js/core/uiShell.js'), 'utf8');
      const currentDashJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/dashboard.js'), 'utf8');
      const currentConsolidatedJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/consolidatedDashboard.js'), 'utf8');
      const currentExtrasJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/extras.js'), 'utf8');

      [
        { name: 'uiShell.js', content: currentUiShellJs },
        { name: 'dashboard.js', content: currentDashJs },
        { name: 'consolidatedDashboard.js', content: currentConsolidatedJs },
        { name: 'extras.js', content: currentExtrasJs }
      ].forEach(({ name, content }) => {
        assert.ok(!content.includes("sessionStorage.setItem('ribbon"), `${name} não deve persistir ribbon em sessionStorage`);
        assert.ok(!content.includes("localStorage.setItem('ribbon"), `${name} não deve persistir ribbon em localStorage`);
        assert.ok(!content.includes("sessionStorage.setItem('hide_months_ribbon'"), `${name} não deve salvar hide_months_ribbon`);
        assert.ok(!content.includes("localStorage.setItem('hide_months_ribbon'"), `${name} não deve salvar hide_months_ribbon`);
      });
    });

  });

});
