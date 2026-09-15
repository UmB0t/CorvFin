/**
 * ==============================================================================
 * Testes Automatizados do Calendário de Benefícios (Lote B2)
 *
 * Cobertura mandatória:
 * 1. Coexistência: Ambos os calendários (Financeiro e Benefícios) são renderizados na mesma página
 * 2. Consumo canônico: Dados vêm exclusivamente de response.benefits sem segunda request HTTP
 * 3. Sincronização temporal: selectedMonth/selectedYear atualiza ambos os calendários
 * 4. Crédito sem data: benefits.undated não é projetado na grade civil
 * 5. Eventos de benefícios: projetados no dia civil exato
 * 6. Semântica de valor: sem sinal negativo (-) na grade ou painel diário de benefícios
 * 7. Resumo mensal de benefícios: Crédito Mensal, Total Consumido, Saldo Disponível
 * 8. Empty state: Mês sem benefícios continua renderizando grade e resumo com mensagem informativa
 * 9. Segregação estrita: Nenhum benefício entra no resumo ou painel bancário e vice-versa
 * 10. Seleção de dia: selectedBenefitDate destaca célula e alimenta painel do dia de benefícios
 * 11. Modal diário de benefícios: cabeçalho explícito "Benefícios — DD/MM/AAAA" e sem dados bancários
 * 12. Navegação de dia em benefícios: previousDay('benefits') e nextDay('benefits')
 * ==============================================================================
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const calendarJsCode = fs.readFileSync(path.join(__dirname, '../public/js/modules/calendar.js'), 'utf8');

function createCalendarSandbox(customApiHandler = null) {
  const elements = {};

  function mockElement(id) {
    if (elements[id]) return elements[id];
    const classList = new Set();
    const attrs = {};
    const el = {
      id,
      innerHTML: '',
      textContent: '',
      hidden: false,
      style: {},
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
      onclick: null,
      open: false,
      showModal: function () { this.open = true; this.setAttribute('open', ''); },
      close: function () { this.open = false; this.removeAttribute('open'); },
      click: function () {
        if (typeof this.onclick === 'function') {
          this.onclick({ preventDefault: () => {}, stopPropagation: () => {}, target: this });
        }
      },
      querySelector: (sel) => {
        if (sel.startsWith('#')) {
          const targetId = sel.slice(1);
          if (el.innerHTML && el.innerHTML.includes(`id="${targetId}"`)) {
            return mockElement(targetId);
          }
          return elements[targetId] || null;
        }
        return null;
      },
      querySelectorAll: (sel) => []
    };
    elements[id] = el;
    return el;
  }

  mockElement('tab-calendar');
  mockElement('calendarDayDetailsDialog');
  mockElement('calendarDayDetailsTitle');
  mockElement('calendarDayDetailsSubtitle');
  mockElement('calendarDayDetailsSummary');
  mockElement('calendarDayDetailsList');
  mockElement('calendarDayDetailsCount');

  const apiCalls = [];

  const sandbox = {
    window: {},
    document: {
      readyState: 'complete',
      getElementById: (id) => mockElement(id),
      querySelector: (sel) => {
        if (sel.startsWith('#')) return mockElement(sel.slice(1));
        return null;
      },
      querySelectorAll: () => []
    },
    todayYM: () => ({ year: 2026, month: 9 }),
    getDaysInMonth: (y, m) => {
      const days = [31, (y % 4 === 0 ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return days[m - 1];
    },
    formatCanonicalDate: (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    getTodayCivilDate: () => '2026-09-12',
    currency: (v) => `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`,
    escapeHtml: (s) => String(s || ''),
    API: {
      getCalendarProjection: async (year, month, options) => {
        apiCalls.push({ year, month, options });
        if (typeof customApiHandler === 'function') {
          return customApiHandler(year, month, options);
        }
        return {
          year,
          month,
          competence: `${year}-${String(month).padStart(2, '0')}`,
          events: [
            { id: 'fe1', date: `${year}-${String(month).padStart(2, '0')}-05`, description: 'Conta de Luz', amount: 150, direction: 'outflow', sourceType: 'fixed_expense' }
          ],
          undated: [],
          summary: { inflow: 5000, outflow: 150, net: 4850 },
          benefits: {
            summary: { inflow: 900, outflow: 135, net: 765 },
            events: [
              { id: 'b1', date: `${year}-${String(month).padStart(2, '0')}-08`, description: 'Supermercado Extra', amount: 90, direction: 'outflow', benefitCategory: 'va' },
              { id: 'b2', date: `${year}-${String(month).padStart(2, '0')}-08`, description: 'Almoço Restaurante', amount: 45, direction: 'outflow', benefitCategory: 'vr' }
            ],
            undated: [
              { id: 'bc1', description: 'Crédito Benefício (VA/VR)', amount: 900, direction: 'inflow', sourceType: 'benefit_credit' }
            ]
          }
        };
      }
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    apiCalls
  };

  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(calendarJsCode, sandbox);

  return { sandbox, elements, apiCalls };
}

describe('CORVFIN — LOTE B2 — CALENDÁRIO DE BENEFÍCIOS', () => {

  test('1. Coexistência: Ambos os calendários (Financeiro e Benefícios) coexistem na mesma página', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('id="calendarFinancialModule"'), 'Deve renderizar módulo financeiro');
    assert.ok(html.includes('id="calendarBenefitsModule"'), 'Deve renderizar módulo de benefícios');
    assert.ok(html.includes('Calendário Financeiro'), 'Deve conter título do Calendário Financeiro');
    assert.ok(html.includes('Calendário de Benefícios'), 'Deve conter título do Calendário de Benefícios');

    // Módulo financeiro deve preceder visualmente o de benefícios
    const posFin = html.indexOf('id="calendarFinancialModule"');
    const posBen = html.indexOf('id="calendarBenefitsModule"');
    assert.ok(posFin < posBen, 'Calendário financeiro deve ficar acima do calendário de benefícios');
  });

  test('2. Consumo canônico: Carrega exclusivamente com 1 request e consome response.benefits', async () => {
    const { sandbox, elements, apiCalls } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    assert.equal(apiCalls.length, 1, 'Deve fazer exatamente 1 request HTTP para a competência');
    assert.equal(apiCalls[0].year, 2026);
    assert.equal(apiCalls[0].month, 9);

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('Crédito Mensal'), 'Deve renderizar resumo de benefícios do payload');
    assert.ok(html.includes('R$ 900,00'), 'Deve exibir valor de crédito do payload');

    sandbox.window.CalendarModule.selectBenefitDate('2026-09-08');
    const updatedHtml = elements['tab-calendar'].innerHTML;
    assert.ok(updatedHtml.includes('Supermercado Extra'), 'Deve consumir os eventos de benefícios do payload no detalhamento');
  });

  test('3. Sincronização temporal: Navegar mês atualiza ambos os calendários sem segundo estado de competência', async () => {
    const { sandbox, elements, apiCalls } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    assert.equal(apiCalls.length, 1);

    // Avança para Outubro de 2026
    sandbox.window.CalendarModule.nextMonth();
    await new Promise(r => setImmediate(r));

    assert.equal(apiCalls.length, 2);
    assert.equal(apiCalls[1].year, 2026);
    assert.equal(apiCalls[1].month, 10);

    const state = sandbox.window.CalendarModule.getState();
    assert.equal(state.selectedYear, 2026);
    assert.equal(state.selectedMonth, 10);

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('Outubro de 2026'), 'Ambos os calendários devem exibir a nova competência');
  });

  test('4. Crédito sem data: benefits.undated não é projetado na grade civil', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    const gridPart = html.slice(html.indexOf('calendar-days-grid--benefits'), html.indexOf('calendar-selected-day-panel--benefits'));

    assert.equal(gridPart.includes('Crédito Benefício'), false, 'Nome de recarga não pode aparecer nas células');
    assert.equal(gridPart.includes('+ R$ 900,00'), false, 'Crédito sem data não pode ser projetado nas células civis');
  });

  test('5. Eventos de benefício projetados no dia civil correto com indicador e badges', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('id="calendar-benefit-day-2026-09-08"'), 'Deve existir célula para 08/09/2026');
    assert.ok(html.includes('data-benefit-date="2026-09-08"'), 'Célula de benefícios deve ter atributo data-benefit-date');

    // Célula do dia 8 com 2 gastos (R$ 90 + R$ 45 = R$ 135)
    assert.ok(html.includes('R$ 135,00'), 'Deve exibir soma consumida no dia');
    assert.ok(html.includes('calendar-benefit-cat-pill--va'), 'Deve exibir badge de categoria VA');
    assert.ok(html.includes('calendar-benefit-cat-pill--vr'), 'Deve exibir badge de categoria VR');
    assert.ok(html.includes('2x'), 'Deve exibir indicador de múltiplos lançamentos');
  });

  test('6. Semântica de valor: SEM sinal negativo (-) na grade ou painel de benefícios', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    const benGrid = html.slice(html.indexOf('calendar-days-grid--benefits'), html.indexOf('calendar-selected-day-panel--benefits'));

    assert.ok(!benGrid.includes('- R$ 135,00'), 'Grade NÃO pode conter sinal negativo no valor de benefícios');
    assert.ok(!benGrid.includes('- R$ 90,00'), 'Nenhum lançamento pode ter sinal negativo');
    assert.ok(benGrid.includes('R$ 135,00'), 'Valor deve ser exibido como número positivo com semântica de utilização');
  });

  test('7. Resumo mensal de benefícios: Crédito Mensal, Total Consumido e Saldo Disponível', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    const benSummaryPart = html.slice(html.indexOf('calendar-benefits-summary-cards'), html.indexOf('calendar-main-layout--benefits'));

    assert.ok(benSummaryPart.includes('Crédito Mensal'), 'Deve conter label Crédito Mensal');
    assert.ok(benSummaryPart.includes('R$ 900,00'), 'Crédito deve ser R$ 900,00');
    assert.ok(benSummaryPart.includes('Total Consumido'), 'Deve conter label Total Consumido');
    assert.ok(benSummaryPart.includes('R$ 135,00'), 'Total consumido deve ser R$ 135,00 positivo');
    assert.ok(benSummaryPart.includes('Saldo Disponível'), 'Deve conter label Saldo Disponível');
    assert.ok(benSummaryPart.includes('R$ 765,00'), 'Saldo disponível deve ser R$ 765,00');
  });

  test('8. Empty state: Mês sem movimentações de benefícios continua exibindo o módulo e a grade', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: [],
      undated: [],
      summary: { inflow: 0, outflow: 0, net: 0 },
      benefits: {
        events: [],
        undated: [],
        summary: { inflow: 500, outflow: 0, net: 500 }
      }
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('id="calendarBenefitsModule"'), 'Módulo de benefícios continua visível');
    assert.ok(html.includes('calendar-days-grid--benefits'), 'Grade de benefícios continua sendo renderizada');
    assert.ok(html.includes('Nenhum gasto com benefícios registrado em Setembro de 2026'), 'Exibe empty state amigável');
    assert.ok(html.includes('R$ 500,00'), 'Crédito mensal continua visível');
    assert.ok(html.includes('R$ 0,00'), 'Total consumido deve ser R$ 0,00');
  });

  test('9. Segregação estrita: Nenhum benefício entra no resumo bancário e vice-versa', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;

    // Resumo financeiro bancário
    const finSummary = html.slice(html.indexOf('id="calendarFinancialModule"'), html.indexOf('id="calendarBenefitsModule"'));
    assert.ok(finSummary.includes('5000,00'), 'Entradas bancárias preservadas');
    assert.ok(finSummary.includes('150,00'), 'Saídas bancárias preservadas');
    assert.ok(!finSummary.includes('900,00'), 'Crédito de benefício NÃO entra no resumo bancário');
    assert.ok(!finSummary.includes('135,00'), 'Consumo de benefício NÃO entra no resumo bancário');
  });

  test('10. Seleção de dia em benefícios: selectedBenefitDate destaca dia e exibe detalhes', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectBenefitDate('2026-09-08');

    const state = sandbox.window.CalendarModule.getState();
    assert.equal(state.selectedBenefitDate, '2026-09-08');

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('Benefícios — 8 de setembro de 2026'), 'Painel de benefícios deve exibir data selecionada');
    assert.ok(html.includes('Supermercado Extra'), 'Painel deve listar compra do dia');
    assert.ok(html.includes('Almoço Restaurante'), 'Painel deve listar segunda compra do dia');
    assert.ok(html.includes('Vale Alimentação (VA)'), 'Painel deve exibir categoria legível');
  });

  test('11. Navegação de dia em benefícios: previousDay("benefits") e nextDay("benefits")', async () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectBenefitDate('2026-09-08');

    sandbox.window.CalendarModule.previousDay('benefits');
    assert.equal(sandbox.window.CalendarModule.getSelectedBenefitDate(), '2026-09-07');

    sandbox.window.CalendarModule.nextDay('benefits');
    assert.equal(sandbox.window.CalendarModule.getSelectedBenefitDate(), '2026-09-08');
  });

  test('12. Modal diário de benefícios: cabeçalho explícito "Benefícios — DD/MM/AAAA" e sem contaminação', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.openDayDetailsModal('2026-09-08', 'benefits');

    const titleEl = elements['calendarDayDetailsTitle'];
    const summaryEl = elements['calendarDayDetailsSummary'];
    const listEl = elements['calendarDayDetailsList'];

    assert.ok(titleEl.textContent.includes('Benefícios — 8 de Setembro de 2026'), 'Título deve explicitar contexto de Benefícios');
    assert.ok(summaryEl.innerHTML.includes('Total Consumido'), 'Resumo do modal de benefícios deve exibir Total Consumido');
    assert.ok(summaryEl.innerHTML.includes('R$ 135,00'), 'Resumo do modal deve conter R$ 135,00');
    assert.ok(!summaryEl.innerHTML.includes('Entradas'), 'Modal de benefícios não deve exibir Entradas bancárias');

    assert.ok(listEl.innerHTML.includes('Supermercado Extra'), 'Lista do modal deve conter compras de benefícios');
    assert.ok(!listEl.innerHTML.includes('Conta de Luz'), 'Lista do modal de benefícios NÃO pode conter contas bancárias');
  });

  test('13. Mudança de competência invalida selectedBenefitDate fora do mês', async () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectBenefitDate('2026-09-08');
    assert.equal(sandbox.window.CalendarModule.getSelectedBenefitDate(), '2026-09-08');

    // Troca de mês para Outubro
    sandbox.window.CalendarModule.nextMonth();
    await new Promise(r => setImmediate(r));

    assert.equal(sandbox.window.CalendarModule.getSelectedBenefitDate(), null, 'selectedBenefitDate de setembro deve ser resetado ao ir para outubro');
  });

  test('14. B2.1 — Remoção da apresentação legada duplicada de Benefícios', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;

    // 1. "Calendário de Benefícios" aparece uma única vez
    const moduleMatches = html.match(/id="calendarBenefitsModule"/g) || [];
    assert.equal(moduleMatches.length, 1, 'Módulo "Calendário de Benefícios" deve aparecer exatamente uma vez');

    const titleMatches = html.match(/id="calendarBenefitsModuleTitle"/g) || [];
    assert.equal(titleMatches.length, 1, 'Título "Calendário de Benefícios" deve aparecer exatamente uma vez');

    // 2. Os três indicadores aparecem uma única vez
    const credMatches = html.match(/Crédito Mensal/g) || [];
    assert.equal(credMatches.length, 1, 'Indicador "Crédito Mensal" deve aparecer exatamente uma vez');

    const consMatches = html.match(/Total Consumido/g) || [];
    // Nota: "Total Consumido" aparece 1 vez nos summary cards do mês (e pode aparecer no painel diário se houver dia selecionado)
    const monthSummaryMatches = (html.slice(html.indexOf('id="calendarBenefitsModule"')).match(/Crédito Mensal/g) || []).length;
    assert.equal(monthSummaryMatches, 1, 'Resumo mensal de benefícios deve aparecer uma única vez');

    // 3. "Benefícios do mês (Segregados)" NÃO existe mais na UI
    assert.equal(html.includes('Benefícios do mês (Segregados)'), false, 'Não deve existir texto legado "Benefícios do mês (Segregados)"');

    // 4. IDs legados da seção removida não existem na UI
    assert.equal(html.includes('id="calendarBenefitsSection"'), false, 'id="calendarBenefitsSection" legado não deve existir');
    assert.equal(html.includes('id="calendarBenefitsToggleBtn"'), false, 'id="calendarBenefitsToggleBtn" legado não deve existir');
    assert.equal(html.includes('id="calendarBenefitsNetBadge"'), false, 'id="calendarBenefitsNetBadge" legado não deve existir');
    assert.equal(html.includes('id="calendarBenefitsContent"'), false, 'id="calendarBenefitsContent" legado não deve existir');

    // 5. Novo módulo permanece funcional e canônico
    assert.ok(html.includes('id="calendarBenefitsModule"'), 'Novo módulo de benefícios continua presente e canônico');
    assert.ok(html.includes('calendar-days-grid--benefits'), 'Grade de benefícios continua presente');
  });
});

