/**
 * ==============================================================================
 * Testes Automatizados da Fundação Web do Calendário Financeiro (Lote C1)
 *
 * Cobertura mandatória:
 * 1. Módulo calendar existe
 * 2. Nova tab é registrada
 * 3. API correta é chamada com year/month
 * 4. Mês inicial é o atual
 * 5. Next month funciona
 * 6. Previous month funciona
 * 7. Jan -> Dez anterior
 * 8. Dez -> Jan seguinte
 * 9. Hoje retorna para mês atual
 * 10. Events agrupados por date
 * 11. Inflow/outflow agregados visualmente por dia
 * 12. Benefits não entram no agrupamento bancário
 * 13. Undated renderiza em seção separada
 * 14. Summary usa payload da API
 * 15. Mês sem eventos renderiza empty state
 * 16. Erro de API renderiza error state
 * 17. Loading não preserva dado incorreto
 * 18. Resposta stale não sobrescreve mês atual
 * 19. Célula não renderiza descrição/nome da transação
 * 20. Frontend não importa/reimplementa financeProjectionService
 * 21. Nenhum request loop ao renderizar
 * 22. Mobile possui indicador compacto (+ / - / +-)
 * ==============================================================================
 */

'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const calendarJsCode = fs.readFileSync(path.join(__dirname, '../public/js/modules/calendar.js'), 'utf8');
const indexHtmlContent = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const constantsJsCode = fs.readFileSync(path.join(__dirname, '../public/js/core/constants.js'), 'utf8');
const uiShellJsCode = fs.readFileSync(path.join(__dirname, '../public/js/core/uiShell.js'), 'utf8');
const appJsCode = fs.readFileSync(path.join(__dirname, '../public/js/core/app.js'), 'utf8');
const apiJsCode = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');
const calendarCssContent = fs.readFileSync(path.join(__dirname, '../public/css/calendar.css'), 'utf8');
const swJsContent = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');

/**
 * Cria ambiente sandbox com DOM mock para testes funcionais do módulo.
 */
function createCalendarSandbox(customApiHandler = null) {
  const listeners = {};
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
      showModal: function() { this.open = true; this.setAttribute('open', ''); },
      close: function() { this.open = false; this.removeAttribute('open'); },
      click: function() {
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

  // Pre-popula o container tab-calendar
  mockElement('tab-calendar');

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
            {
              id: 'ev1',
              sourceId: 'fix_1',
              description: 'Aluguel Apartamento',
              amount: 1500,
              date: `${year}-${String(month).padStart(2, '0')}-10`,
              direction: 'outflow',
              status: 'pending'
            },
            {
              id: 'ev2',
              sourceId: 'sal_1',
              description: 'Salário Empresa',
              amount: 5000,
              date: `${year}-${String(month).padStart(2, '0')}-05`,
              direction: 'inflow',
              status: null
            }
          ],
          undated: [
            {
              id: 'und1',
              sourceId: 'fix_und',
              description: 'Taxa Anual Bancária',
              amount: 120,
              date: null,
              direction: 'outflow',
              status: 'pending'
            }
          ],
          summary: {
            inflow: 5000,
            outflow: 1620,
            net: 3380
          },
          benefits: {
            events: [
              {
                id: 'bt1',
                description: 'Mercado Almoço',
                amount: 85,
                date: `${year}-${String(month).padStart(2, '0')}-12`,
                direction: 'outflow'
              }
            ],
            undated: [
              {
                id: 'bu1',
                description: 'Vale Refeição Mensal',
                amount: 600,
                date: null,
                direction: 'inflow'
              }
            ],
            summary: {
              inflow: 600,
              outflow: 85,
              net: 515
            }
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

describe('CORVFIN V2 — LOTE C1 — CALENDAR WEB FOUNDATION', () => {

  test('1. Módulo calendar.js existe e exporta window.CalendarModule e renderCalendarTab', () => {
    const { sandbox } = createCalendarSandbox();
    assert.ok(sandbox.window.CalendarModule, 'CalendarModule deve estar disponível no window');
    assert.equal(typeof sandbox.window.CalendarModule.render, 'function');
    assert.equal(typeof sandbox.window.CalendarModule.previousMonth, 'function');
    assert.equal(typeof sandbox.window.CalendarModule.nextMonth, 'function');
    assert.equal(typeof sandbox.window.CalendarModule.goToToday, 'function');
    assert.equal(typeof sandbox.window.CalendarModule.groupCalendarEventsByDate, 'function');
    assert.equal(typeof sandbox.window.renderCalendarTab, 'function');
  });

  test('2. Nova tab é registrada no index.html, constants.js, uiShell.js e app.js', () => {
    // index.html declara main id="tab-calendar", link na sidebar e script
    assert.ok(indexHtmlContent.includes('id="tab-calendar"'), 'index.html deve conter contêiner main com id="tab-calendar"');
    assert.ok(indexHtmlContent.includes('data-tab="tab-calendar"'), 'index.html deve conter botão da sidebar com data-tab="tab-calendar"');
    assert.ok(indexHtmlContent.includes('src="js/modules/calendar.js"'), 'index.html deve carregar js/modules/calendar.js');
    assert.ok(indexHtmlContent.includes('href="css/calendar.css"'), 'index.html deve carregar css/calendar.css');

    // constants.js contém TAB_TITLES
    assert.ok(constantsJsCode.includes("'tab-calendar': 'Calendário'"), 'constants.js deve mapear tab-calendar para Calendário');

    // uiShell.js contém mapeamento de rotas e configs
    assert.ok(uiShellJsCode.includes("'/calendario': 'tab-calendar'"), 'uiShell.js deve mapear /calendario');
    assert.ok(uiShellJsCode.includes("'tab-calendar': '/calendario'"), 'uiShell.js deve mapear tab-calendar para /calendario');
    assert.ok(uiShellJsCode.includes("'tab-calendar': 'Calendário'"), 'uiShell.js deve conter titleMap para tab-calendar');
    assert.ok(uiShellJsCode.includes("key: 'calendario'"), 'uiShell.js deve conter chave de módulo no drawer');

    // app.js contém tab-calendar em ALL_APP_TABS e renderTabContent
    assert.ok(appJsCode.includes("'tab-calendar'"), 'app.js deve listar tab-calendar');
    assert.ok(appJsCode.includes('renderCalendarTab'), 'app.js deve chamar renderCalendarTab');

    // sw.js faz cache de calendar.css e calendar.js
    assert.ok(swJsContent.includes("'./css/calendar.css'"), 'sw.js deve cachear ./css/calendar.css');
    assert.ok(swJsContent.includes("'./js/modules/calendar.js'"), 'sw.js deve cachear ./js/modules/calendar.js');
  });

  test('3. API correta é chamada com year/month ao renderizar a aba', async () => {
    const { sandbox, apiCalls } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    assert.equal(apiCalls.length, 1);
    assert.equal(apiCalls[0].year, 2026);
    assert.equal(apiCalls[0].month, 9);
  });

  test('4. Mês inicial é o civil atual fornecido por todayYM()', () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.CalendarModule.render();
    const state = sandbox.window.CalendarModule.getState();
    assert.equal(state.selectedYear, 2026);
    assert.equal(state.selectedMonth, 9);
  });

  test('5. nextMonth avança um mês civil', async () => {
    const { sandbox, apiCalls } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.nextMonth();
    await new Promise(r => setImmediate(r));

    const state = sandbox.window.CalendarModule.getState();
    assert.equal(state.selectedYear, 2026);
    assert.equal(state.selectedMonth, 10);
    assert.equal(apiCalls[1].year, 2026);
    assert.equal(apiCalls[1].month, 10);
  });

  test('6. previousMonth recua um mês civil', async () => {
    const { sandbox, apiCalls } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.previousMonth();
    await new Promise(r => setImmediate(r));

    const state = sandbox.window.CalendarModule.getState();
    assert.equal(state.selectedYear, 2026);
    assert.equal(state.selectedMonth, 8);
    assert.equal(apiCalls[1].year, 2026);
    assert.equal(apiCalls[1].month, 8);
  });

  test('7. Transição Jan -> Dez do ano anterior', async () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.CalendarModule.setState({ selectedYear: 2026, selectedMonth: 1 });

    sandbox.window.CalendarModule.previousMonth();
    await new Promise(r => setImmediate(r));

    const state = sandbox.window.CalendarModule.getState();
    assert.equal(state.selectedYear, 2025);
    assert.equal(state.selectedMonth, 12);
  });

  test('8. Transição Dez -> Jan do ano seguinte', async () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.CalendarModule.setState({ selectedYear: 2026, selectedMonth: 12 });

    sandbox.window.CalendarModule.nextMonth();
    await new Promise(r => setImmediate(r));

    const state = sandbox.window.CalendarModule.getState();
    assert.equal(state.selectedYear, 2027);
    assert.equal(state.selectedMonth, 1);
  });

  test('9. Ação "Hoje" retorna exatamente para o mês civil atual', async () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.CalendarModule.setState({ selectedYear: 2030, selectedMonth: 4 });

    sandbox.window.CalendarModule.goToToday();
    await new Promise(r => setImmediate(r));

    const state = sandbox.window.CalendarModule.getState();
    assert.equal(state.selectedYear, 2026);
    assert.equal(state.selectedMonth, 9);
  });

  test('10. groupCalendarEventsByDate agrupa eventos exclusivamente por string YYYY-MM-DD', () => {
    const { sandbox } = createCalendarSandbox();
    const events = [
      { id: '1', date: '2026-09-10', amount: 100, direction: 'outflow' },
      { id: '2', date: '2026-09-10', amount: 50, direction: 'inflow' },
      { id: '3', date: '2026-09-15', amount: 200, direction: 'outflow' },
      { id: '4', date: null, amount: 80, direction: 'outflow' } // undated
    ];

    const grouped = sandbox.window.CalendarModule.groupCalendarEventsByDate(events);
    assert.equal(Object.keys(grouped).length, 2);
    assert.ok(grouped['2026-09-10']);
    assert.ok(grouped['2026-09-15']);
    assert.equal(grouped['2026-09-10'].events.length, 2);
    assert.equal(grouped['2026-09-15'].events.length, 1);
    assert.equal(grouped['null'], undefined);
  });

  test('11. Inflow e outflow são agregados visualmente por dia com flags corretas', () => {
    const { sandbox } = createCalendarSandbox();
    const events = [
      { id: '1', date: '2026-09-10', amount: 100, direction: 'outflow' },
      { id: '2', date: '2026-09-10', amount: 300, direction: 'inflow' },
      { id: '3', date: '2026-09-10', amount: 50, direction: 'outflow' }
    ];

    const grouped = sandbox.window.CalendarModule.groupCalendarEventsByDate(events);
    const day = grouped['2026-09-10'];
    assert.equal(day.inflow, 300);
    assert.equal(day.outflow, 150);
    assert.equal(day.hasInflow, true);
    assert.equal(day.hasOutflow, true);
  });

  test('12. Benefits NÃO entram no agrupamento bancário principal', () => {
    const { sandbox } = createCalendarSandbox();
    const bankEvents = [
      { id: '1', date: '2026-09-12', amount: 500, direction: 'outflow' }
    ];

    const grouped = sandbox.window.CalendarModule.groupCalendarEventsByDate(bankEvents);
    // Deve conter apenas a despesa bancária de 500, zero benefícios
    assert.equal(grouped['2026-09-12'].outflow, 500);
    assert.equal(grouped['2026-09-12'].events.length, 1);
  });

  test('13. Undated renderiza em seção separada ("Sem data definida") com status e valor', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('Sem data definida'), 'Deve exibir seção "Sem data definida"');
    assert.ok(html.includes('Taxa Anual Bancária'), 'Deve exibir descrição do item undated');
    assert.ok(html.includes('120,00'), 'Deve exibir valor formatado');
    assert.ok(html.includes('Pendente') || html.includes('tag due') || html.includes('tag partial'), 'Deve exibir status');
  });

  test('14. Summary renderiza os valores oficiais vindos do payload da API', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('Resultado do mês'), 'Deve conter rótulo "Resultado do mês"');
    assert.ok(html.includes('3.380,00') || html.includes('3380,00'), 'Deve exibir resultado do mês da API');
    assert.ok(html.includes('5.000,00') || html.includes('5000,00'), 'Deve exibir entradas da API');
    assert.ok(html.includes('1.620,00') || html.includes('1620,00'), 'Deve exibir saídas da API');
  });

  test('15. Mês sem eventos renderiza empty state informativo', async () => {
    const { sandbox, elements } = createCalendarSandbox(async () => ({
      year: 2026,
      month: 9,
      competence: '2026-09',
      events: [],
      undated: [],
      summary: { inflow: 0, outflow: 0, net: 0 },
      benefits: { events: [], undated: [], summary: { inflow: 0, outflow: 0, net: 0 } }
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('Nenhuma movimentação financeira prevista'), 'Deve renderizar nota de mês vazio');
  });

  test('16. Erro de API renderiza error state com botão de tentar novamente', async () => {
    const { sandbox, elements } = createCalendarSandbox(async () => {
      throw new Error('Falha simulada na rede');
    });

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('Erro ao carregar calendário'), 'Deve exibir aviso de erro');
    assert.ok(html.includes('calendarRetryBtn'), 'Deve fornecer botão de retry');
  });

  test('17. Loading state não preserva dados incorretos do mês anterior', async () => {
    let resolveFirst;
    const { sandbox, elements } = createCalendarSandbox(async () => {
      return new Promise(res => {
        resolveFirst = res;
      });
    });

    sandbox.window.renderCalendarTab();
    // Enquanto carrega, isLoading deve ser true e container deve exibir spinner/loading
    assert.equal(sandbox.window.CalendarModule.getState().isLoading, true);
    assert.equal(sandbox.window.CalendarModule.getState().currentProjection, null);
    assert.ok(elements['tab-calendar'].innerHTML.includes('Carregando Calendário'));

    // Resolução da promise
    resolveFirst({
      year: 2026,
      month: 9,
      events: [],
      undated: [],
      summary: { inflow: 0, outflow: 0, net: 0 },
      benefits: { events: [], undated: [], summary: { inflow: 0, outflow: 0, net: 0 } }
    });
    await new Promise(r => setImmediate(r));
    assert.equal(sandbox.window.CalendarModule.getState().isLoading, false);
  });

  test('18. Resposta stale (fora de ordem) NÃO sobrescreve mês atual mais recente', async () => {
    let resolveMonth9;
    let resolveMonth10;

    const { sandbox } = createCalendarSandbox(async (year, month) => {
      if (month === 9) {
        return new Promise(res => { resolveMonth9 = res; });
      }
      if (month === 10) {
        return new Promise(res => { resolveMonth10 = res; });
      }
    });

    // Dispara requisição para Setembro
    sandbox.window.renderCalendarTab();

    // Usuário imediatamente avança para Outubro
    sandbox.window.CalendarModule.nextMonth();

    // Resposta de Outubro chega primeiro
    resolveMonth10({
      year: 2026,
      month: 10,
      competence: '2026-10',
      events: [{ id: 'out_10', date: '2026-10-01', amount: 999, direction: 'inflow' }],
      undated: [],
      summary: { inflow: 999, outflow: 0, net: 999 }
    });
    await new Promise(r => setImmediate(r));

    assert.equal(sandbox.window.CalendarModule.getState().selectedMonth, 10);
    assert.equal(sandbox.window.CalendarModule.getState().currentProjection.month, 10);

    // Resposta antiga de Setembro chega ATRASADA
    resolveMonth9({
      year: 2026,
      month: 9,
      competence: '2026-09',
      events: [{ id: 'set_9', date: '2026-09-01', amount: 111, direction: 'inflow' }],
      undated: [],
      summary: { inflow: 111, outflow: 0, net: 111 }
    });
    await new Promise(r => setImmediate(r));

    // O estado do calendário DEVE continuar em Outubro, ignorando o Setembro stale!
    assert.equal(sandbox.window.CalendarModule.getState().selectedMonth, 10);
    assert.equal(sandbox.window.CalendarModule.getState().currentProjection.month, 10);
    assert.equal(sandbox.window.CalendarModule.getState().currentProjection.summary.inflow, 999);
  });

  test('19. Célula da grade NÃO renderiza descrição/nome individual da transação', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    // Pega a parte da grade mensal (dentro de calendar-days-grid)
    const gridPart = html.slice(html.indexOf('calendar-days-grid'), html.indexOf('calendar-undated-section'));

    // Na grade do mês, NÃO pode aparecer "Aluguel Apartamento" nem "Salário Empresa"
    assert.equal(gridPart.includes('Aluguel Apartamento'), false, 'Nomes de transações não devem aparecer dentro da célula da grade');
    assert.equal(gridPart.includes('Salário Empresa'), false, 'Nomes de transações não devem aparecer dentro da célula da grade');

    // Mas os valores monetários agregados devem aparecer
    assert.ok(gridPart.includes('1500,00') || gridPart.includes('1.500,00'), 'Valores agregados devem aparecer na célula');
    assert.ok(gridPart.includes('5000,00') || gridPart.includes('5.000,00'), 'Valores agregados devem aparecer na célula');
  });

  test('20. Frontend não importa nem reimplementa financeProjectionService', () => {
    assert.equal(calendarJsCode.includes('projectFinancialMonth'), false, 'calendar.js não deve chamar projectFinancialMonth');
    assert.equal(calendarJsCode.includes('financeProjectionService'), false, 'calendar.js não deve referenciar financeProjectionService');
    assert.equal(calendarJsCode.includes('calculateInstallmentSchedule'), false, 'calendar.js não deve calcular parcelas');
    assert.equal(calendarJsCode.includes('paidHistory'), false, 'calendar.js não deve inspecionar paidHistory');
  });

  test('21. Nenhum request loop ao renderizar a aba do calendário', async () => {
    const { sandbox, apiCalls } = createCalendarSandbox();
    // Renderiza a aba múltiplas vezes simulando alternância rápida
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));
    sandbox.window.renderCalendarTab();
    sandbox.window.renderCalendarTab();

    // Como já tem a projeção em memória para o mês selecionado, não deve refazer request sem mudança de período
    assert.equal(apiCalls.length, 1, 'Não deve re-executar requisições em loop ao renderizar');
  });

  test('22. Célula possui indicador compacto (+ / - / +-) preparado para mobile', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('calendar-day-mobile-indicator'), 'Deve conter indicador compacto de mobile');
    assert.ok(html.includes('calendar-day-mobile-indicator--inflow') || html.includes('calendar-day-mobile-indicator--outflow'), 'Deve conter indicador de entrada ou saída');
  });

});

describe('CORVFIN V2 — LOTE C1.1 — PRESENTATION LABELS + DAY SELECTION FOUNDATION', () => {

  test('1. extra_income -> "Renda extra"', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: [],
      undated: [{ id: 'u1', description: 'SHEIN', sourceType: 'extra_income', amount: 120, direction: 'inflow' }]
    }));
    assert.equal(sandbox.window.CalendarModule.getCalendarSourceTypeLabel('extra_income'), 'Renda extra');
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));
    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('Renda extra'), 'Deve exibir label amigável "Renda extra"');
    assert.equal(html.includes('extra_income'), false, 'NÃO deve conter o identificador técnico extra_income');
  });

  test('2. debtor_receivable -> "Valor a receber"', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: [],
      undated: [{ id: 'u2', description: 'YASMIM • ROUPAS DA SHEIN', sourceType: 'debtor_receivable', amount: 250, direction: 'inflow' }]
    }));
    assert.equal(sandbox.window.CalendarModule.getCalendarSourceTypeLabel('debtor_receivable'), 'Valor a receber');
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));
    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('Valor a receber'), 'Deve exibir label amigável "Valor a receber"');
    assert.equal(html.includes('debtor_receivable'), false, 'NÃO deve conter o identificador técnico debtor_receivable');
  });

  test('3. fixed_expense -> "Despesa fixa"', () => {
    const { sandbox } = createCalendarSandbox();
    assert.equal(sandbox.window.CalendarModule.getCalendarSourceTypeLabel('fixed_expense'), 'Despesa fixa');
  });

  test('4. variable_expense -> "Despesa variável"', () => {
    const { sandbox } = createCalendarSandbox();
    assert.equal(sandbox.window.CalendarModule.getCalendarSourceTypeLabel('variable_expense'), 'Despesa variável');
  });

  test('5. salary -> "Salário"', () => {
    const { sandbox } = createCalendarSandbox();
    assert.equal(sandbox.window.CalendarModule.getCalendarSourceTypeLabel('salary'), 'Salário');
  });

  test('6. unknown sourceType NÃO vaza identificador técnico (fallback "Movimentação")', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: [],
      undated: [{ id: 'u_unk', description: 'Item Estranho', sourceType: 'unknown_internal_type', amount: 99, direction: 'inflow' }]
    }));
    assert.equal(sandbox.window.CalendarModule.getCalendarSourceTypeLabel('unknown_internal_type'), 'Movimentação');
    assert.equal(sandbox.window.CalendarModule.getCalendarSourceTypeLabel(null), 'Movimentação');
    assert.equal(sandbox.window.CalendarModule.getCalendarSourceTypeLabel(undefined), 'Movimentação');
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));
    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('Movimentação'), 'Deve exibir fallback "Movimentação"');
    assert.equal(html.includes('unknown_internal_type'), false, 'NUNCA deve vazar identificador técnico não mapeado');
  });

  test('7. Clicar em um dia define selectedDate', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-15');
    assert.equal(sandbox.window.CalendarModule.getState().selectedDate, '2026-09-15');

    if (elements['calendar-day-2026-09-18'] && elements['calendar-day-2026-09-18'].onclick) {
      elements['calendar-day-2026-09-18'].onclick({ preventDefault: () => {} });
      assert.equal(sandbox.window.CalendarModule.getState().selectedDate, '2026-09-18');
    }
  });

  test('8. selectedDate usa formato canônico YYYY-MM-DD', async () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const sDate = sandbox.window.CalendarModule.getState().selectedDate;
    assert.match(sDate, /^\d{4}-\d{2}-\d{2}$/, 'selectedDate deve seguir rigorosamente YYYY-MM-DD');
  });

  test('9. Célula selecionada recebe estado visual/semântico (.calendar-day--selected e aria-selected="true")', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-15');
    const html = elements['tab-calendar'].innerHTML;

    assert.ok(html.includes('id="calendar-day-2026-09-15"'), 'Deve conter o botão do dia 15');
    assert.ok(html.includes('calendar-day--selected'), 'Célula selecionada deve ter classe .calendar-day--selected');
    assert.ok(html.includes('aria-selected="true"'), 'Célula selecionada deve ter aria-selected="true"');
  });

  test('10. Painel mostra data selecionada', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-12');
    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('calendar-selected-day-panel'), 'Deve renderizar o painel do dia selecionado');
    assert.ok(html.includes('12 de setembro de 2026'), 'Painel deve exibir a data amigável');
  });

  test('11. Painel agrega inflow do dia', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-05');
    const html = elements['tab-calendar'].innerHTML;
    const panelPart = html.slice(html.indexOf('calendar-selected-day-panel'));
    assert.ok(panelPart.includes('5000,00') || panelPart.includes('5.000,00'), 'Painel deve agregar entradas previstas do dia');
  });

  test('12. Painel agrega outflow do dia', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-10');
    const html = elements['tab-calendar'].innerHTML;
    const panelPart = html.slice(html.indexOf('calendar-selected-day-panel'));
    assert.ok(panelPart.includes('1500,00') || panelPart.includes('1.500,00'), 'Painel deve agregar saídas previstas do dia');
  });

  test('13. Painel calcula resultado visual (net = inflow - outflow)', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: [
        { id: 'e1', date: '2026-09-12', description: 'Entrada A', amount: 1200, direction: 'inflow' },
        { id: 'e2', date: '2026-09-12', description: 'Saída B', amount: 430, direction: 'outflow' }
      ],
      undated: []
    }));
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-12');
    const html = elements['tab-calendar'].innerHTML;
    const panelPart = html.slice(html.indexOf('calendar-selected-day-panel'));
    assert.ok(panelPart.includes('770,00'), 'Resultado do dia deve ser 770,00');
  });

  test('14. Painel pode listar description das ocorrências do dia', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-10');
    const html = elements['tab-calendar'].innerHTML;
    const panelPart = html.slice(html.indexOf('calendar-selected-day-panel'));
    assert.ok(panelPart.includes('Aluguel Apartamento'), 'Painel do dia pode listar description da ocorrência');
  });

  test('15. Painel NÃO mostra sourceType técnico (mostra label amigável)', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: [
        { id: 'e1', date: '2026-09-10', description: 'Aluguel', sourceType: 'fixed_expense', amount: 1500, direction: 'outflow' }
      ],
      undated: []
    }));
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-10');
    const html = elements['tab-calendar'].innerHTML;
    const panelPart = html.slice(html.indexOf('calendar-selected-day-panel'));
    assert.ok(panelPart.includes('Despesa fixa'), 'Deve exibir "Despesa fixa"');
    assert.equal(panelPart.includes('fixed_expense'), false, 'NÃO deve exibir o sourceType técnico fixed_expense');
  });

  test('16. Dia vazio pode ser selecionado e exibe mensagem informativa', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-22');
    assert.equal(sandbox.window.CalendarModule.getState().selectedDate, '2026-09-22');

    const html = elements['tab-calendar'].innerHTML;
    const panelPart = html.slice(html.indexOf('calendar-selected-day-panel'));
    assert.ok(panelPart.includes('Nenhuma movimentação financeira prevista para este dia.'), 'Deve exibir aviso para dia vazio');
  });

  test('17. next day funciona (+1 dia civil)', async () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-12');
    sandbox.window.CalendarModule.nextDay();
    assert.equal(sandbox.window.CalendarModule.getState().selectedDate, '2026-09-13');
  });

  test('18. previous day funciona (-1 dia civil)', async () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-12');
    sandbox.window.CalendarModule.previousDay();
    assert.equal(sandbox.window.CalendarModule.getState().selectedDate, '2026-09-11');
  });

  test('19. 30/09 -> 01/10 (travessia de mês pelo nextDay)', async () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-30');
    sandbox.window.CalendarModule.nextDay();
    await new Promise(r => setImmediate(r));

    assert.equal(sandbox.window.CalendarModule.getState().selectedDate, '2026-10-01');
    assert.equal(sandbox.window.CalendarModule.getState().selectedMonth, 10);
    assert.equal(sandbox.window.CalendarModule.getState().selectedYear, 2026);
  });

  test('20. 01/10 -> 30/09 (travessia de mês pelo previousDay)', async () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-10-01');
    await new Promise(r => setImmediate(r));
    assert.equal(sandbox.window.CalendarModule.getState().selectedMonth, 10);

    sandbox.window.CalendarModule.previousDay();
    await new Promise(r => setImmediate(r));

    assert.equal(sandbox.window.CalendarModule.getState().selectedDate, '2026-09-30');
    assert.equal(sandbox.window.CalendarModule.getState().selectedMonth, 9);
    assert.equal(sandbox.window.CalendarModule.getState().selectedYear, 2026);
  });

  test('21. Travessia de mês chama API da nova competência', async () => {
    const { sandbox, apiCalls } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-30');
    sandbox.window.CalendarModule.nextDay();
    await new Promise(r => setImmediate(r));

    const lastCall = apiCalls[apiCalls.length - 1];
    assert.equal(lastCall.year, 2026);
    assert.equal(lastCall.month, 10, 'Deve chamar API para o mês 10');
  });

  test('22. Today seleciona data civil atual e vai para mês atual', async () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    // Muda de mês
    sandbox.window.CalendarModule.nextMonth();
    await new Promise(r => setImmediate(r));
    assert.equal(sandbox.window.CalendarModule.getState().selectedMonth, 10);

    // Clica em Hoje
    sandbox.window.CalendarModule.goToToday();
    await new Promise(r => setImmediate(r));

    assert.equal(sandbox.window.CalendarModule.getState().selectedMonth, 9);
    assert.equal(sandbox.window.CalendarModule.getState().selectedDate, '2026-09-12');
  });

  test('23. Troca manual de mês limpa selectedDate quando necessário', async () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    assert.equal(sandbox.window.CalendarModule.getState().selectedDate, '2026-09-12');

    // Troca manual de mês para Outubro (mês 10 não contém 2026-09-12)
    sandbox.window.CalendarModule.nextMonth();
    await new Promise(r => setImmediate(r));

    assert.equal(sandbox.window.CalendarModule.getState().selectedDate, null, 'selectedDate deve ser null ao trocar de mês manualmente');
  });

  test('24. Stale request continua protegida durante navegação', async () => {
    let slowResolve;
    const { sandbox } = createCalendarSandbox((year, month) => {
      if (month === 10) {
        return new Promise((resolve) => {
          slowResolve = () => resolve({
            year: 2026,
            month: 10,
            summary: { inflow: 111, outflow: 0, net: 111 },
            events: [],
            undated: []
          });
        });
      }
      return {
        year,
        month,
        summary: { inflow: 888, outflow: 0, net: 888 },
        events: [],
        undated: []
      };
    });

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    // Navega para Outubro (lento)
    sandbox.window.CalendarModule.nextMonth();

    // Imediatamente navega para Novembro (rápido)
    sandbox.window.CalendarModule.nextMonth();
    await new Promise(r => setImmediate(r));

    assert.equal(sandbox.window.CalendarModule.getState().selectedMonth, 11);

    // Agora a resposta de Outubro chega atrasada
    if (slowResolve) slowResolve();
    await new Promise(r => setImmediate(r));

    // Estado NÃO deve ter sido corrompido para Outubro
    assert.equal(sandbox.window.CalendarModule.getState().selectedMonth, 11);
  });

  test('25. Benefits NÃO entram no resumo diário bancário', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: [
        { id: 'b1', date: '2026-09-12', description: 'Gasto Bancário', amount: 100, direction: 'outflow' }
      ],
      undated: [],
      benefits: {
        summary: { inflow: 800, outflow: 200, net: 600 },
        events: [
          { id: 'ben1', date: '2026-09-12', description: 'Almoço VR', amount: 45, direction: 'outflow' }
        ],
        undated: [
          { id: 'ben_cred', description: 'Recarga VA', amount: 800, direction: 'inflow' }
        ]
      }
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-12');
    const html = elements['tab-calendar'].innerHTML;
    const panelPart = html.slice(html.indexOf('calendar-selected-day-panel'), html.indexOf('calendar-benefits-section'));

    assert.equal(panelPart.includes('Almoço VR'), false, 'Benefícios não devem aparecer na lista do painel bancário');
    assert.equal(panelPart.includes('Recarga VA'), false, 'Benefícios não devem aparecer na lista do painel bancário');
    assert.ok(panelPart.includes('100,00'), 'Deve conter o gasto bancário do dia');
    assert.equal(panelPart.includes('800,00'), false, 'Resumo do dia bancário não deve conter recarga de benefício');
  });

  test('26. Células da grade continuam sem nomes de transações', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    const gridPart = html.slice(html.indexOf('calendar-days-grid'), html.indexOf('calendar-selected-day-panel'));

    assert.equal(gridPart.includes('Aluguel Apartamento'), false, 'Grade não deve conter nomes de transações');
    assert.equal(gridPart.includes('Salário Empresa'), false, 'Grade não deve conter nomes de transações');
  });

});

describe('CORVFIN V2 — LOTE C1.2 — DESKTOP SIDE DAY PANEL', () => {

  test('1. Existe wrapper desktop principal (.calendar-main-layout)', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('calendar-main-layout'), 'Deve renderizar wrapper .calendar-main-layout');
  });

  test('2. Month section e day panel coexistem dentro do wrapper principal', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('calendar-month-section'), 'Deve conter .calendar-month-section');
    assert.ok(html.includes('calendar-day-panel'), 'Deve conter .calendar-day-panel');

    const layoutPart = html.slice(html.indexOf('calendar-main-layout'), html.indexOf('calendar-undated-section'));
    assert.ok(layoutPart.includes('calendar-grid-card'), 'A grade deve estar dentro do layout principal');
    assert.ok(layoutPart.includes('calendar-selected-day-panel'), 'O painel do dia deve estar dentro do layout principal');
  });

  test('3. Painel continua renderizando selectedDate no layout reorganizado', async () => {
    const { sandbox, elements } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-12');
    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('12 de setembro de 2026'), 'Painel lateral deve exibir a data selecionada');
  });

  test('4. Desktop possui layout lado a lado via CSS (grid-template-columns)', () => {
    assert.ok(calendarCssContent.includes('.calendar-main-layout'), 'calendar.css deve conter .calendar-main-layout');
    assert.ok(calendarCssContent.includes('@media (min-width: 1100px)'), 'calendar.css deve conter breakpoint desktop >= 1100px');
    const desktopMediaQuery = calendarCssContent.slice(calendarCssContent.indexOf('@media (min-width: 1100px)'));
    assert.ok(desktopMediaQuery.includes('grid-template-columns'), 'Desktop deve definir grid-template-columns para exibição lado a lado');
    assert.ok(desktopMediaQuery.includes('minmax'), 'Desktop deve usar proporções minmax para contenção');
  });

  test('4b. Desktop aplica max-height no painel lateral e scroll interno em .calendar-selected-day-list (UX1.1)', () => {
    const desktopMediaQuery = calendarCssContent.slice(calendarCssContent.indexOf('@media (min-width: 1100px)'));
    assert.ok(desktopMediaQuery.includes('max-height: calc(100vh - 120px)'), 'Desktop deve conter altura máxima no painel lateral');
    assert.ok(desktopMediaQuery.includes('.calendar-selected-day-list'), 'Desktop deve conter regra para lista de eventos');
    assert.ok(desktopMediaQuery.includes('overflow-y: auto'), 'Desktop deve aplicar overflow-y: auto na lista de eventos selecionados');
  });

  test('5. Breakpoint volta painel para baixo em telas menores (< 1100px e mobile)', () => {
    assert.ok(calendarCssContent.includes('.calendar-main-layout'), 'CSS base deve definir .calendar-main-layout');
    assert.ok(calendarCssContent.includes('flex-direction: column'), 'Layout padrão / abaixo do breakpoint deve empilhar verticalmente');
    assert.ok(calendarCssContent.includes('@media (max-width: 1099px)'), 'CSS deve prever comportamento responsivo < 1100px');
  });

  test('6. Nenhuma lógica de day navigation foi alterada', async () => {
    const { sandbox } = createCalendarSandbox();
    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-30');
    sandbox.window.CalendarModule.nextDay();
    await new Promise(r => setImmediate(r));

    assert.equal(sandbox.window.CalendarModule.getState().selectedDate, '2026-10-01');
    assert.equal(sandbox.window.CalendarModule.getState().selectedMonth, 10);

    sandbox.window.CalendarModule.previousDay();
    await new Promise(r => setImmediate(r));

    assert.equal(sandbox.window.CalendarModule.getState().selectedDate, '2026-09-30');
    assert.equal(sandbox.window.CalendarModule.getState().selectedMonth, 9);
  });

});

describe('CORVFIN V2 — LOTE C1.2.1 — DAY PANEL VALUE OVERFLOW FIX', () => {

  test('1. Desktop side panel empilha os summary cards verticalmente (grid-template-columns: 1fr)', () => {
    const css = fs.readFileSync(path.join(__dirname, '../public/css/calendar.css'), 'utf8');
    const desktopMedia = css.slice(css.indexOf('@media (min-width: 1100px)'));
    assert.ok(desktopMedia.includes('.calendar-selected-day-summary'), 'Media query desktop deve customizar .calendar-selected-day-summary');
    assert.ok(desktopMedia.includes('grid-template-columns: 1fr'), 'Desktop side panel deve empilhar em 1fr para evitar overflow horizontal');
  });

  test('2. Containers de resumo possuem min-width: 0, box-sizing e max-width: 100%', () => {
    const css = fs.readFileSync(path.join(__dirname, '../public/css/calendar.css'), 'utf8');
    assert.ok(css.includes('.calendar-day-summary-card'), 'Deve estilizar .calendar-day-summary-card');
    assert.ok(css.includes('.calendar-day-summary-val'), 'Deve estilizar .calendar-day-summary-val');

    const cardRule = css.slice(css.indexOf('.calendar-day-summary-card'), css.indexOf('.calendar-day-summary-label'));
    assert.ok(cardRule.includes('min-width: 0'), 'Summary card deve ter min-width: 0');
    assert.ok(cardRule.includes('box-sizing: border-box'), 'Summary card deve ter box-sizing: border-box');

    const valRule = css.slice(css.indexOf('.calendar-day-summary-val'), css.indexOf('.calendar-selected-day-list'));
    assert.ok(valRule.includes('min-width: 0'), 'Valor de resumo deve ter min-width: 0');
    assert.ok(valRule.includes('max-width: 100%'), 'Valor de resumo deve ter max-width: 100%');
    assert.ok(valRule.includes('white-space: nowrap'), 'Valor de resumo deve manter moeda em uma linha');
  });

  test('3. Lista de movimentações protege contra overflow com flex e white-space nowrap', () => {
    const css = fs.readFileSync(path.join(__dirname, '../public/css/calendar.css'), 'utf8');
    const detailDesc = css.slice(css.indexOf('.calendar-day-detail-desc'), css.indexOf('.calendar-day-detail-meta'));
    assert.ok(detailDesc.includes('text-overflow: ellipsis'), 'Descrição de movimentação deve truncar com reticências se exceder');
    assert.ok(detailDesc.includes('min-width: 0'), 'Descrição de movimentação deve ter min-width: 0');

    const detailAmt = css.slice(css.indexOf('.calendar-day-detail-amt'), css.indexOf('.calendar-selected-day-empty'));
    assert.ok(detailAmt.includes('white-space: nowrap'), 'Valor da movimentação deve usar white-space: nowrap');
    assert.ok(detailAmt.includes('flex-shrink: 0'), 'Valor da movimentação deve ter flex-shrink: 0 para não amassar');
  });

  test('4. Renderização com valor longo (ex: R$ 7.899,23) mantém valor íntegro no painel', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: [
        {
          id: 'sal_long',
          date: '2026-09-12',
          description: 'Salário Integral',
          sourceType: 'salary',
          amount: 7899.23,
          direction: 'inflow',
          status: 'paid'
        }
      ],
      undated: []
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    sandbox.window.CalendarModule.selectDate('2026-09-12');
    const html = elements['tab-calendar'].innerHTML;
    const panelPart = html.slice(html.indexOf('calendar-selected-day-panel'));

    assert.ok(panelPart.includes('7899,23') || panelPart.includes('7.899,23'), 'Painel deve conter valor R$ 7.899,23');
    assert.ok(panelPart.includes('Salário Integral'), 'Painel deve conter descrição do salário');
    assert.ok(panelPart.includes('Salário'), 'Painel deve conter label amigável');
  });

});

describe('CORVFIN — UX1.4 — CALENDAR DAY PREVIEW & DETAILED MODAL', () => {

  function createDayEvents(count, date = '2026-09-12') {
    const types = ['salary', 'extra_income', 'fixed_expense', 'variable_expense', 'debtor_entry'];
    const events = [];
    for (let i = 1; i <= count; i++) {
      events.push({
        id: `ev_${i}`,
        date,
        description: `Transação de Teste ${i}`,
        sourceType: types[(i - 1) % types.length],
        amount: 100 * i,
        direction: i % 2 === 0 ? 'inflow' : 'outflow',
        status: i % 2 === 0 ? 'paid' : 'pending'
      });
    }
    return events;
  }

  test('14. preview mostra no máximo 5 ocorrências no painel lateral', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: createDayEvents(8, '2026-09-12'),
      undated: []
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));
    sandbox.window.CalendarModule.selectDate('2026-09-12');

    const html = elements['tab-calendar'].innerHTML;
    const panelPart = html.slice(html.indexOf('calendar-selected-day-panel'));
    const listPart = panelPart.slice(panelPart.indexOf('calendar-selected-day-list'), panelPart.indexOf('calendar-day-preview-footer'));
    const itemMatches = listPart.match(/class="calendar-day-detail-item"/g) || [];

    assert.equal(itemMatches.length, 5, 'Preview lateral deve exibir exatamente 5 itens para o dia');
  });

  test('15. N <= 5 não mostra CTA desnecessário', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: createDayEvents(4, '2026-09-12'),
      undated: []
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));
    sandbox.window.CalendarModule.selectDate('2026-09-12');

    const html = elements['tab-calendar'].innerHTML;
    assert.equal(html.includes('calendarOpenDayDetailsBtn'), false, 'Não deve exibir botão CTA quando N <= 5');
    assert.equal(html.includes('Ver todas as'), false, 'Não deve conter texto "Ver todas as" quando N <= 5');
  });

  test('16. N > 5 mostra "Ver todas as N movimentações"', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: createDayEvents(8, '2026-09-12'),
      undated: []
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));
    sandbox.window.CalendarModule.selectDate('2026-09-12');

    const html = elements['tab-calendar'].innerHTML;
    assert.ok(html.includes('id="calendarOpenDayDetailsBtn"'), 'Deve conter botão #calendarOpenDayDetailsBtn quando N > 5');
    assert.ok(html.includes('Ver todas as 8 movimentações'), 'CTA deve exibir quantidade total exata de movimentações');
  });

  test('17. CTA abre detalhes completos (abre dialog com showModal)', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: createDayEvents(8, '2026-09-12'),
      undated: []
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));
    sandbox.window.CalendarModule.selectDate('2026-09-12');

    const ctaBtn = elements['calendarOpenDayDetailsBtn'];
    assert.ok(ctaBtn, 'Botão CTA deve existir no container');

    // Executa clique no CTA
    ctaBtn.click();

    const dialog = elements['calendarDayDetailsDialog'];
    assert.ok(dialog.open, 'Dialog deve estar aberto após o clique no CTA');
    assert.equal(elements['calendarDayDetailsTitle'].textContent, 'Movimentações de 12 de Setembro de 2026');
  });

  test('18. detalhes contém todas as N ocorrências', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: createDayEvents(9, '2026-09-12'),
      undated: []
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));
    sandbox.window.CalendarModule.selectDate('2026-09-12');

    // Abre o modal
    sandbox.window.CalendarModule.openDayDetailsModal('2026-09-12');

    const listEl = elements['calendarDayDetailsList'];
    const countEl = elements['calendarDayDetailsCount'];

    const items = listEl.innerHTML.match(/class="calendar-day-detail-item"/g) || [];
    assert.equal(items.length, 9, 'Lista do modal deve conter todas as 9 ocorrências');
    assert.ok(countEl.textContent.includes('9 movimentações'), 'Rodapé do modal deve indicar contagem total');

    // Todas as descrições de 1 a 9 devem estar no HTML
    for (let i = 1; i <= 9; i++) {
      assert.ok(listEl.innerHTML.includes(`Transação de Teste ${i}`), `Item ${i} deve estar presente`);
    }
  });

  test('19. detalhes mantém summary diário (Entradas, Saídas, Resultado)', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: [
        { id: '1', date: '2026-09-12', description: 'Entrada 1', amount: 3000, direction: 'inflow', sourceType: 'salary' },
        { id: '2', date: '2026-09-12', description: 'Saída 1', amount: 1000, direction: 'outflow', sourceType: 'fixed_expense' }
      ],
      undated: []
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));
    sandbox.window.CalendarModule.selectDate('2026-09-12');

    sandbox.window.CalendarModule.openDayDetailsModal('2026-09-12');

    const summaryEl = elements['calendarDayDetailsSummary'];
    assert.ok(summaryEl.innerHTML.includes('Entradas'), 'Deve exibir label de Entradas');
    assert.ok(summaryEl.innerHTML.includes('Saídas'), 'Deve exibir label de Saídas');
    assert.ok(summaryEl.innerHTML.includes('Resultado'), 'Deve exibir label de Resultado');
    assert.ok(summaryEl.innerHTML.includes('3.000,00') || summaryEl.innerHTML.includes('3000,00'), 'Deve exibir soma de entradas R$ 3.000,00');
    assert.ok(summaryEl.innerHTML.includes('1.000,00') || summaryEl.innerHTML.includes('1000,00'), 'Deve exibir soma de saídas R$ 1.000,00');
    assert.ok(summaryEl.innerHTML.includes('2.000,00') || summaryEl.innerHTML.includes('2000,00'), 'Deve exibir resultado líquido R$ 2.000,00');
  });

  test('20. modal possui área scrollável no CSS com max-height e overflow-y auto', () => {
    const css = fs.readFileSync(path.join(__dirname, '../public/css/calendar.css'), 'utf8');
    assert.ok(css.includes('.calendar-day-modal-list'), 'calendar.css deve conter seletor .calendar-day-modal-list');
    const modalListRule = css.slice(css.indexOf('.calendar-day-modal-list'));
    const ruleContent = modalListRule.slice(0, modalListRule.indexOf('}'));
    assert.ok(ruleContent.includes('overflow-y: auto'), 'Lista do modal deve ter overflow-y: auto');
    assert.ok(ruleContent.includes('max-height'), 'Lista do modal deve definir max-height apropriado');
  });

  test('21. sourceType técnico não vaza nem no preview nem nos detalhes do modal', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: [
        { id: '1', date: '2026-09-12', description: 'Salário Base', amount: 5000, direction: 'inflow', sourceType: 'salary' },
        { id: '2', date: '2026-09-12', description: 'Bico Freelance', amount: 800, direction: 'inflow', sourceType: 'extra_income' },
        { id: '3', date: '2026-09-12', description: 'Aluguel Casa', amount: 1500, direction: 'outflow', sourceType: 'fixed_expense' },
        { id: '4', date: '2026-09-12', description: 'Restaurante Fim de Semana', amount: 120, direction: 'outflow', sourceType: 'variable_expense' },
        { id: '5', date: '2026-09-12', description: 'Empréstimo Amigo', amount: 250, direction: 'inflow', sourceType: 'debtor_receivable' },
        { id: '6', date: '2026-09-12', description: 'Tipo Desconhecido', amount: 50, direction: 'outflow', sourceType: 'some_technical_source_type_internal' }
      ],
      undated: []
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));
    sandbox.window.CalendarModule.selectDate('2026-09-12');

    // Abre modal de detalhes
    sandbox.window.CalendarModule.openDayDetailsModal('2026-09-12');

    const sidePanelHtml = elements['tab-calendar'].innerHTML;
    const modalHtml = elements['calendarDayDetailsList'].innerHTML;
    const fullHtml = sidePanelHtml + modalHtml;

    // Tokens técnicos não devem vazar como texto visível
    assert.equal(fullHtml.includes('some_technical_source_type_internal'), false, 'Não deve vazar sourceType técnico desconhecido');
    assert.ok(modalHtml.includes('Salário'), 'Deve mostrar label amigável "Salário"');
    assert.ok(modalHtml.includes('Renda extra'), 'Deve mostrar label amigável "Renda extra"');
    assert.ok(modalHtml.includes('Despesa fixa'), 'Deve mostrar label amigável "Despesa fixa"');
    assert.ok(modalHtml.includes('Despesa variável'), 'Deve mostrar label amigável "Despesa variável"');
    assert.ok(modalHtml.includes('Valor a receber'), 'Deve mostrar label amigável para devedor');
    assert.ok(modalHtml.includes('Movimentação'), 'Fallback amigável deve ser usado para tipo desconhecido');
  });

  test('22. painel diário não depende de lista gigante (com 25 itens, exibe apenas 5 no painel)', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: createDayEvents(25, '2026-09-12'),
      undated: []
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));
    sandbox.window.CalendarModule.selectDate('2026-09-12');

    const html = elements['tab-calendar'].innerHTML;
    const panelPart = html.slice(html.indexOf('calendar-selected-day-panel'));
    const listPart = panelPart.slice(panelPart.indexOf('calendar-selected-day-list'), panelPart.indexOf('calendar-day-preview-footer'));
    const itemMatches = listPart.match(/class="calendar-day-detail-item"/g) || [];

    assert.equal(itemMatches.length, 5, 'Painel lateral deve se limitar a 5 itens mesmo com 25 movimentações');
    assert.ok(panelPart.includes('Ver todas as 25 movimentações'), 'CTA deve sinalizar 25 movimentações');
  });

  test('23. day navigation permanece funcional e aplica regra de preview ao mudar de dia', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: [
        ...createDayEvents(3, '2026-09-12'),
        ...createDayEvents(7, '2026-09-13')
      ],
      undated: []
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));

    // Dia 12 (3 eventos)
    sandbox.window.CalendarModule.selectDate('2026-09-12');
    assert.equal(elements['tab-calendar'].innerHTML.includes('calendarOpenDayDetailsBtn'), false, 'Dia 12 tem <= 5 eventos, sem CTA');

    // Navega para próximo dia (dia 13, com 7 eventos)
    sandbox.window.CalendarModule.nextDay();
    await new Promise(r => setImmediate(r));

    assert.equal(sandbox.window.CalendarModule.getState().selectedDate, '2026-09-13');
    assert.ok(elements['tab-calendar'].innerHTML.includes('calendarOpenDayDetailsBtn'), 'Dia 13 tem > 5 eventos, com CTA');
    assert.ok(elements['tab-calendar'].innerHTML.includes('Ver todas as 7 movimentações'), 'CTA do dia 13 exibe 7 movimentações');

    // Navega de volta para dia anterior (dia 12)
    sandbox.window.CalendarModule.previousDay();
    await new Promise(r => setImmediate(r));

    assert.equal(sandbox.window.CalendarModule.getState().selectedDate, '2026-09-12');
    assert.equal(elements['tab-calendar'].innerHTML.includes('calendarOpenDayDetailsBtn'), false, 'Voltando para dia 12, CTA é ocultado');
  });

  test('24. benefits não entram no detalhe financeiro bancário (nem no preview nem no modal)', async () => {
    const { sandbox, elements } = createCalendarSandbox(() => ({
      year: 2026,
      month: 9,
      events: [
        { id: 'bank1', date: '2026-09-12', description: 'Compra Supermercado', amount: 180, direction: 'outflow', sourceType: 'variable_expense' }
      ],
      undated: [],
      benefits: {
        events: [
          { id: 'b_ev1', date: '2026-09-12', description: 'Vale Alimentação Sodexo', amount: 450, direction: 'outflow' }
        ],
        undated: [],
        summary: { inflow: 500, outflow: 450, net: 50 }
      }
    }));

    sandbox.window.renderCalendarTab();
    await new Promise(r => setImmediate(r));
    sandbox.window.CalendarModule.selectDate('2026-09-12');

    // Abre o modal de detalhes do dia bancário
    sandbox.window.CalendarModule.openDayDetailsModal('2026-09-12');

    const panelHtml = elements['tab-calendar'].innerHTML;
    const sidePanelStart = panelHtml.indexOf('calendar-selected-day-panel');
    const sidePanelEnd = panelHtml.indexOf('</section>', sidePanelStart) + 10;
    const sidePanelSection = panelHtml.slice(sidePanelStart, sidePanelEnd);
    const modalHtml = elements['calendarDayDetailsList'].innerHTML;

    // Benefício não entra no painel diário bancário
    assert.equal(sidePanelSection.includes('Vale Alimentação Sodexo'), false, 'Benefício não deve aparecer na lista diária do painel bancário');
    // Benefício não entra no modal diário bancário
    assert.equal(modalHtml.includes('Vale Alimentação Sodexo'), false, 'Benefício não deve aparecer no modal de movimentações bancárias');
    // Benefício aparece exclusivamente no Calendário de Benefícios ao selecionar a data
    sandbox.window.CalendarModule.selectBenefitDate('2026-09-12');
    const updatedHtml = elements['tab-calendar'].innerHTML;
    assert.ok(updatedHtml.includes('id="calendarBenefitsModule"'), 'Módulo de benefícios deve existir');
    assert.ok(updatedHtml.includes('Vale Alimentação Sodexo'), 'Benefício deve aparecer no detalhamento de benefícios');
  });

});


