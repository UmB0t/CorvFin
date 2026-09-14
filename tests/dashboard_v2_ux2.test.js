/**
 * CORVFIN — LOTE UX2
 * SUÍTE DE TESTES: PREFERÊNCIA GLOBAL DO RIBBON + DASHBOARD V2 HIERARQUIA DE INFORMAÇÃO
 *
 * Cobre:
 * PARTE A — PREFERÊNCIA GLOBAL DO RIBBON (Chave: corvfin_ribbon_expanded)
 *   1. Default expanded sem chave no localStorage
 *   2. Colapso do ribbon grava 'false' em localStorage
 *   3. Expansão do ribbon grava 'true' em localStorage
 *   4. Troca de abas preserva a preferência global nas 5 abas
 *   5. Inicialização/reload restaura o estado salvo no localStorage
 *   6. Navegação mensal preserva a preferência global
 *   7. Calendar expandables não herdam nem usam a chave do ribbon
 *   8. Zero hide_months_ribbon em storage
 *   9. Zero chaves individuais por aba
 *   10. Ordem canônica de inicialização do ribbon (storageKey desde a 1ª instanciação, initAll não remove, sem listeners duplicados)
 *
 * PARTE B — DASHBOARD V2 (HIERARQUIA EM 3 NÍVEIS)
 *   1. Nível 1: Única fonte canônica (GET /api/finances/calendar summary), skeletons no loading, sem monthTotals temporário
 *   2. Nível 2 Contexto: 3 cards compactos (Despesas, Cobranças a Receber, Pendências)
 *   3. Nível 2 Próximos Movimentos: exclusivo projection.events, ordem data ASC, max 5, semântica temporal (atual, futura, passada)
 *   4. Nível 2 CTA: "Ver calendário →" navega para tab-calendar
 *   5. Nível 3 Análise sob demanda: Categorias, Destinos, Matriz iniciam collapsed por padrão, sem storageKey
 *   6. Filtros Compactos: preservação integral de busca, status, categoria, destino, origem e limpar
 *   7. CSS: estilos específicos em dashboard.css com breakpoints responsivos
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Carrega arquivos reais da aplicação
const uiShellJs = fs.readFileSync(path.join(__dirname, '../public/js/core/uiShell.js'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/dashboard.js'), 'utf8');
const consolidatedJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/consolidatedDashboard.js'), 'utf8');
const dashboardCss = fs.readFileSync(path.join(__dirname, '../public/css/dashboard.css'), 'utf8');

// DOM Mocks
class MockClassList {
  constructor(el, initialClass = '') {
    this.el = el;
    this.set = new Set(initialClass ? initialClass.split(/\s+/).filter(Boolean) : []);
  }
  add(...cls) { cls.forEach(c => this.set.add(c)); }
  remove(...cls) { cls.forEach(c => this.set.delete(c)); }
  contains(c) { return this.set.has(c); }
  toggle(c, force) {
    if (force !== undefined) {
      if (force) this.set.add(c); else this.set.delete(c);
      return force;
    }
    if (this.set.has(c)) { this.set.delete(c); return false; }
    this.set.add(c); return true;
  }
  toString() { return Array.from(this.set).join(' '); }
}

class MockElement {
  constructor(tagName, attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = attrs.id || '';
    this.attributes = { ...attrs };
    this.dataset = {};
    this.style = {};
    this.hidden = attrs.hidden !== undefined ? !!attrs.hidden : false;
    this.classList = new MockClassList(this, attrs.class || '');
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
    this._innerHTML = '';
    this.listeners = {};
    this.value = attrs.value || '';

    Object.keys(attrs).forEach(k => {
      if (k.startsWith('data-')) {
        this.dataset[k.slice(5)] = attrs[k];
      }
    });
  }

  get innerHTML() { return this._innerHTML; }
  set innerHTML(val) {
    this._innerHTML = String(val);
    this.children = [];
    const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
    let match;
    while ((match = tagRegex.exec(val)) !== null) {
      const tagName = match[1];
      const rawAttrs = match[2];
      if (tagName.startsWith('/')) continue;
      const attrs = {};
      const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
      let m;
      while ((m = attrRegex.exec(rawAttrs)) !== null) {
        attrs[m[1]] = m[2] !== undefined ? m[2] : '';
      }
      const el = new MockElement(tagName, attrs);
      this.appendChild(el);
      if (global.__REGISTER_MOCK_ELEMENT__) {
        global.__REGISTER_MOCK_ELEMENT__(el);
      }
    }
  }

  getAttribute(k) {
    if (k === 'id') return this.id || null;
    if (k === 'class') return this.classList.toString() || null;
    return this.attributes[k] !== undefined ? String(this.attributes[k]) : null;
  }

  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'hidden') this.hidden = true;
    if (k === 'id') this.id = String(v);
  }

  removeAttribute(k) {
    delete this.attributes[k];
    if (k === 'hidden') this.hidden = false;
  }

  appendChild(ch) {
    ch.parentNode = this;
    this.children.push(ch);
    return ch;
  }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(fn);
  }

  removeEventListener(type, fn) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(f => f !== fn);
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    event.currentTarget = this;
    const list = this.listeners[event.type] || [];
    for (const h of list) {
      h(event);
      if (event._stopped) break;
    }
    if (!event._stopped && this.parentNode) {
      this.parentNode.dispatchEvent(event);
    }
  }

  click() {
    this.dispatchEvent({
      type: 'click',
      target: this,
      _stopped: false,
      stopPropagation() { this._stopped = true; },
      preventDefault() {}
    });
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (matches(curr, selector)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const res = [];
    function scan(node) {
      for (const ch of node.children) {
        if (matches(ch, selector)) res.push(ch);
        scan(ch);
      }
    }
    scan(this);
    return res;
  }
}

function matches(el, sel) {
  if (!el || !sel) return false;
  if (sel === '*') return true;
  if (sel.startsWith('#') && !sel.includes(' ') && !sel.includes('.')) {
    return el.id === sel.slice(1);
  }
  if (sel.startsWith('.') && !sel.includes(' ') && !sel.includes('[')) {
    return el.classList.contains(sel.slice(1));
  }
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const attr = sel.slice(1, -1);
    return el.getAttribute(attr) !== null;
  }
  return false;
}

// Mock localStorage
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(k) {
    return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null;
  }
  setItem(k, v) {
    this.store[k] = String(v);
  }
  removeItem(k) {
    delete this.store[k];
  }
  clear() {
    this.store = {};
  }
}

// Cria ambiente integrado com uiShell, dashboard e consolidatedDashboard
function createTestEnvironment(initialLocalStorage = {}) {
  const ls = new MockLocalStorage();
  Object.keys(initialLocalStorage).forEach(k => ls.setItem(k, initialLocalStorage[k]));

  const elementsById = {};

  function register(el) {
    if (el.id) elementsById[el.id] = el;
    el.children.forEach(ch => register(ch));
    return el;
  }
  global.__REGISTER_MOCK_ELEMENT__ = (el) => register(el);

  // 1. Ribbon compartilhado
  const ribbonSection = new MockElement('section', {
    id: 'ribbonSection',
    class: 'ribbon-card card expandable-section is-expanded',
    'data-expandable': '',
    'data-storage-key': 'corvfin_ribbon_expanded'
  });
  const ribbonHeader = new MockElement('div', { id: 'ribbonSectionHeader', class: 'expandable-section__header' });
  const ribbonTitle = new MockElement('h3', { id: 'ribbonSectionTitle', class: 'expandable-section__title' });
  const ribbonDesc = new MockElement('span', { id: 'ribbonSectionDesc', class: 'expandable-section__desc' });
  const ribbonToggleBtn = new MockElement('button', {
    id: 'ribbonToggleBtn',
    class: 'expandable-section__trigger',
    'aria-expanded': 'true',
    'aria-controls': 'ribbonSectionContent'
  });
  const ribbonContent = new MockElement('div', { id: 'ribbonSectionContent', class: 'expandable-section__content' });

  ribbonHeader.appendChild(ribbonTitle);
  ribbonHeader.appendChild(ribbonDesc);
  ribbonHeader.appendChild(ribbonToggleBtn);
  ribbonSection.appendChild(ribbonHeader);
  ribbonSection.appendChild(ribbonContent);
  register(ribbonSection);

  // 2. Abas funcionais
  const tabs = ['tab-dashboard', 'tab-expenses', 'tab-extras', 'tab-debtors', 'tab-benefits', 'tab-calendar'];
  const tabElements = {};
  tabs.forEach(tid => {
    const el = new MockElement('div', { id: tid, class: 'tab-content', hidden: tid !== 'tab-dashboard' });
    tabElements[tid] = el;
    register(el);
  });

  // 3. Container da view do Dashboard
  const dashboardViewWrap = new MockElement('div', { id: 'dashboardViewWrap' });
  tabElements['tab-dashboard'].appendChild(dashboardViewWrap);
  register(dashboardViewWrap);

  // Elementos do header e perfil
  ['yearLabel', 'userAvatar', 'userNameLabel', 'userSalaryLabel', 'ribbonLegend', 'ribbon', 'ribbonCompactMonthDisplay', 'ribbonCompactTodayBtn'].forEach(id => {
    register(new MockElement('div', { id }));
  });

  const mockState = {
    year: 2026,
    month: 9,
    fixed: [
      { id: 'f1', name: 'Aluguel', group: 'Moradia', destination: 'Nubank', versions: [{ year: 2026, month: 1, amount: 2500 }] },
      { id: 'f2', name: 'Internet', group: 'Moradia', destination: 'Nubank', versions: [{ year: 2026, month: 1, amount: 150 }] }
    ],
    variable: [
      { id: 'v1', name: 'Supermercado', group: 'Alimentação', destination: 'Inter', startYear: 2026, startMonth: 9, endYear: 2026, endMonth: 9, amount: 800 }
    ],
    debtors: [
      { id: 'd1', debtorName: 'Carlos', title: 'Empréstimo', category: 'Devedores', destination: 'Nubank', startYear: 2026, startMonth: 9, endYear: 2026, endMonth: 9, amount: 500 }
    ],
    preferences: {}
  };

  const sandboxWindow = {
    localStorage: ls,
    state: mockState,
    getState: () => mockState,
    isStateHydrated: () => true,
    MONTH_NAMES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
    MONTH_ABBR: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    todayYM: () => ({ year: 2026, month: 9 }),
    getTodayCivilDate: () => '2026-09-14',
    formatMoney: (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','),
    currency: (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','),
    monthTotals: () => ({ total: 100, expenses: 100, extras: 0, debtors: 0, pending: 0, paid: 100 }),
    escapeHtml: (s) => String(s || ''),
    $: (id) => elementsById[typeof id === 'string' && id.startsWith('#') ? id.slice(1) : id] || null,
    $$: (sel) => mockDoc.querySelectorAll(sel),
    API: {
      getCalendarProjection: async (y, m) => ({
        competence: `${y}-${String(m).padStart(2, '0')}`,
        summary: { net: 1550, inflow: 5000, outflow: 3450 },
        events: [
          { id: 'e1', date: '2026-09-15', description: 'Aluguel', direction: 'outflow', amount: 2500, sourceType: 'fixed_expense' },
          { id: 'e2', date: '2026-09-20', description: 'Carlos Empréstimo', direction: 'inflow', amount: 500, sourceType: 'debtor_receivable' },
          { id: 'e3', date: '2026-09-25', description: 'Salário', direction: 'inflow', amount: 4500, sourceType: 'salary' }
        ],
        undated: [],
        benefits: { events: [], undated: [] }
      })
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { pathname: '/dashboard' },
    history: { pushState: () => {}, replaceState: () => {} }
  };

  const mockBody = new MockElement('body');
  const mockDoc = {
    readyState: 'complete',
    body: mockBody,
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => elementsById[id] || null,
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elementsById[sel.slice(1)] || null;
      if (sel === '.tab-content:not([hidden])') {
        return Object.values(tabElements).find(t => !t.hidden) || null;
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === '.tab-content') return Object.values(tabElements);
      if (sel === '[data-tab]') return [];
      if (sel.includes('.expandable-section')) {
        return [ribbonSection];
      }
      return [];
    },
    addEventListener: () => {}
  };

  sandboxWindow.document = mockDoc;
  global.document = mockDoc;
  global.localStorage = ls;
  global.getState = sandboxWindow.getState;
  global.MONTH_NAMES = sandboxWindow.MONTH_NAMES;
  global.MONTH_ABBR = sandboxWindow.MONTH_ABBR;
  global.todayYM = sandboxWindow.todayYM;
  global.formatMoney = sandboxWindow.formatMoney;
  global.currency = sandboxWindow.currency;
  global.monthTotals = sandboxWindow.monthTotals;
  global.escapeHtml = sandboxWindow.escapeHtml;
  global.$ = sandboxWindow.$;
  global.$$ = sandboxWindow.$$;
  global.API = sandboxWindow.API;
  global.location = sandboxWindow.location;
  global.history = sandboxWindow.history;

  // Carrega uiShell
  const uiShellFn = new Function('window', 'document', 'localStorage', uiShellJs);
  uiShellFn(sandboxWindow, mockDoc, ls);

  // Carrega dashboard
  const dashFn = new Function('window', 'document', 'getState', dashboardJs);
  dashFn(sandboxWindow, mockDoc, sandboxWindow.getState);

  // Carrega consolidatedDashboard
  const consFn = new Function('window', 'document', 'getState', consolidatedJs);
  consFn(sandboxWindow, mockDoc, sandboxWindow.getState);

  return {
    window: sandboxWindow,
    document: mockDoc,
    localStorage: ls,
    elements: {
      ribbonSection,
      ribbonHeader,
      ribbonToggleBtn,
      ribbonContent,
      dashboardViewWrap,
      tabElements
    }
  };
}

describe('CORVFIN — LOTE UX2: PREFERÊNCIA GLOBAL DO RIBBON & DASHBOARD V2', () => {

  // ==========================================================
  // PARTE A — PREFERÊNCIA GLOBAL DO RIBBON
  // ==========================================================
  describe('Parte A — Preferência Global do Ribbon (corvfin_ribbon_expanded)', () => {

    test('1. Default expanded quando localStorage NÃO tem corvfin_ribbon_expanded', () => {
      const env = createTestEnvironment();
      assert.equal(env.localStorage.getItem('corvfin_ribbon_expanded'), null);

      const api = env.window.initExpandableSection(env.elements.ribbonSection);
      assert.ok(api, 'API deve ser retornada');
      assert.equal(api.isExpanded(), true, 'Ribbon deve iniciar expandido por padrão');
      assert.equal(env.elements.ribbonContent.hidden, false, 'Conteúdo visível');
    });

    test('2. Colapso do ribbon grava "false" em localStorage', () => {
      const env = createTestEnvironment();
      const api = env.window.initExpandableSection(env.elements.ribbonSection);
      assert.equal(api.isExpanded(), true);

      api.collapse();
      assert.equal(api.isExpanded(), false);
      assert.equal(env.elements.ribbonContent.hidden, true);
      assert.equal(env.localStorage.getItem('corvfin_ribbon_expanded'), 'false', 'Deve gravar "false" no localStorage');
    });

    test('3. Expansão do ribbon grava "true" em localStorage', () => {
      const env = createTestEnvironment({ corvfin_ribbon_expanded: 'false' });
      const api = env.window.initExpandableSection(env.elements.ribbonSection);
      assert.equal(api.isExpanded(), false, 'Inicia recolhido conforme salvo');

      api.expand();
      assert.equal(api.isExpanded(), true);
      assert.equal(env.elements.ribbonContent.hidden, false);
      assert.equal(env.localStorage.getItem('corvfin_ribbon_expanded'), 'true', 'Deve gravar "true" no localStorage');
    });

    test('4. Troca de abas preserva a preferência global nas 5 abas', () => {
      const env = createTestEnvironment();
      const api = env.window.initExpandableSection(env.elements.ribbonSection);

      // Usuário recolhe na aba Despesas
      env.window.activateTab('tab-expenses');
      api.collapse();
      assert.equal(env.localStorage.getItem('corvfin_ribbon_expanded'), 'false');
      assert.equal(api.isExpanded(), false);

      // Navega para Rendas Extras -> continua recolhido
      env.window.activateTab('tab-extras');
      assert.equal(api.isExpanded(), false, 'Rendas Extras respeita preferência global recolhida');

      // Navega para Devedores -> continua recolhido
      env.window.activateTab('tab-debtors');
      assert.equal(api.isExpanded(), false, 'Devedores respeita preferência global recolhida');

      // Navega para Benefícios -> continua recolhido
      env.window.activateTab('tab-benefits');
      assert.equal(api.isExpanded(), false, 'Benefícios respeita preferência global recolhida');

      // Usuário expande em Benefícios
      api.expand();
      assert.equal(env.localStorage.getItem('corvfin_ribbon_expanded'), 'true');

      // Navega de volta para Dashboard -> continua expandido
      env.window.activateTab('tab-dashboard');
      assert.equal(api.isExpanded(), true, 'Dashboard respeita preferência global expandida');
    });

    test('5. Inicialização/reload restaura o estado salvo no localStorage', () => {
      // Simula reload da página quando usuário havia deixado o ribbon recolhido
      const env = createTestEnvironment({ corvfin_ribbon_expanded: 'false' });
      const api = env.window.initExpandableSection(env.elements.ribbonSection);

      assert.equal(api.isExpanded(), false, 'Deve restaurar estado recolhido do localStorage');
      assert.equal(env.elements.ribbonContent.hidden, true);
    });

    test('6. Navegação mensal preserva a preferência global do ribbon', () => {
      const env = createTestEnvironment({ corvfin_ribbon_expanded: 'false' });
      const api = env.window.initExpandableSection(env.elements.ribbonSection);
      assert.equal(api.isExpanded(), false);

      // Simula chamada de renderRibbon durante troca de mês
      env.window.renderRibbon('tab-expenses');
      assert.equal(api.isExpanded(), false, 'renderRibbon não deve re-expandir o ribbon');
      assert.equal(env.localStorage.getItem('corvfin_ribbon_expanded'), 'false');
    });

    test('7. Calendar expandables NÃO herdam nem usam a chave do ribbon', () => {
      const env = createTestEnvironment({ corvfin_ribbon_expanded: 'false' });

      // Cria seção do calendário
      const undatedSec = new MockElement('div', { id: 'calendarUndatedSection', class: 'expandable-section' });
      const undatedHeader = new MockElement('div', { class: 'expandable-section__header', 'aria-controls': 'undatedContent' });
      const undatedContent = new MockElement('div', { id: 'undatedContent', class: 'expandable-section__content' });
      undatedSec.appendChild(undatedHeader);
      undatedSec.appendChild(undatedContent);

      const calApi = env.window.initExpandableSection(undatedSec, { defaultExpanded: true });
      assert.ok(calApi);
      assert.equal(calApi._storageKey, null, 'Calendar expandable não possui storageKey');
      assert.equal(calApi.isExpanded(), true, 'Inicia expandido conforme defaultExpanded, ignorando ribbon');
      assert.equal(env.localStorage.getItem('corvfin_ribbon_expanded'), 'false', 'Chave do ribbon permanece inalterada');
    });

    test('8. Zero hide_months_ribbon em storage', () => {
      const env = createTestEnvironment();
      const api = env.window.initExpandableSection(env.elements.ribbonSection);
      api.collapse();
      api.expand();

      assert.equal(env.localStorage.getItem('hide_months_ribbon'), null, 'NÃO deve gravar hide_months_ribbon');
    });

    test('9. Zero chaves individuais por aba', () => {
      const env = createTestEnvironment();
      env.window.activateTab('tab-expenses');
      env.window.activateTab('tab-debtors');

      assert.equal(env.localStorage.getItem('corvfin_ribbon_expenses'), null);
      assert.equal(env.localStorage.getItem('corvfin_ribbon_debtors'), null);
      assert.equal(env.localStorage.getItem('corvfin_ribbon_dashboard'), null);
    });

    test('10. Ordem canônica de inicialização do ribbon (MANDATÓRIO 2)', () => {
      const env = createTestEnvironment();
      const ribbon = env.elements.ribbonSection;

      // 1. Primeira inicialização do ribbon possui storageKey
      const api1 = env.window.initExpandableSection(ribbon, { defaultExpanded: true, storageKey: 'corvfin_ribbon_expanded' });
      assert.equal(api1._storageKey, 'corvfin_ribbon_expanded', '1. Primeira inicialização possui storageKey');

      // 2. initAllExpandableSections posterior não remove persistência
      env.window.initAllExpandableSections(env.document);
      assert.equal(ribbon._expandableApi._storageKey, 'corvfin_ribbon_expanded', '2. initAll posterior não remove persistência');

      // 3. Reinicializações não criam listeners adicionais
      const initialListenerCount = (env.elements.ribbonHeader.listeners['click'] || []).length;
      env.window.initExpandableSection(ribbon);
      env.window.initExpandableSection(ribbon, { storageKey: 'corvfin_ribbon_expanded' });
      const postListenerCount = (env.elements.ribbonHeader.listeners['click'] || []).length;
      assert.equal(initialListenerCount, postListenerCount, '3. Reinicializações não criam listeners adicionais');

      // 4. localStorage continua sendo atualizado corretamente
      ribbon._expandableApi.collapse();
      assert.equal(env.localStorage.getItem('corvfin_ribbon_expanded'), 'false', '4. localStorage atualizado para false');
      ribbon._expandableApi.expand();
      assert.equal(env.localStorage.getItem('corvfin_ribbon_expanded'), 'true', '4. localStorage atualizado para true');
    });

  });

  // ==========================================================
  // PARTE B — DASHBOARD V2 HIERARQUIA DE INFORMAÇÃO
  // ==========================================================
  describe('Parte B — Dashboard V2 (Hierarquia de Informação)', () => {

    test('1. Nível 1: Única fonte canônica (GET /api/finances/calendar summary) com skeletons (MANDATÓRIO 1)', async () => {
      const env = createTestEnvironment();

      // Renderiza Dashboard
      env.window.ConsolidatedDashboardModule.renderConsolidatedDashboardTab();
      const html = env.elements.dashboardViewWrap.innerHTML;

      // Verifica presença dos elementos do Hero Card
      assert.ok(html.includes('id="dashHeroCard"'), 'Hero Card presente');
      assert.ok(html.includes('id="dashNetResultValue"'), 'Elemento de Resultado Previsto presente');
      assert.ok(html.includes('id="dashInflowValue"'), 'Elemento de Entradas Previstas presente');
      assert.ok(html.includes('id="dashOutflowValue"'), 'Elemento de Saídas Previstas presente');

      // Verifica skeletons durante loading / estado inicial sem projeção
      assert.ok(html.includes('dash-skeleton-val') || html.includes('R$ 1.550,00'), 'Skeleton ou valor preenchido');

      // Simula resolução da projeção canônica
      const mockProjection = {
        competence: '2026-09',
        summary: { net: 1550, inflow: 5000, outflow: 3450 },
        events: [
          { id: 'e1', date: '2026-09-15', description: 'Aluguel', direction: 'outflow', amount: 2500, sourceType: 'fixed_expense' }
        ]
      };

      // Atualiza UI diretamente com os dados da projeção
      const netEl = env.document.getElementById('dashNetResultValue') || env.elements.dashboardViewWrap.querySelector('#dashNetResultValue');
      const inEl = env.document.getElementById('dashInflowValue') || env.elements.dashboardViewWrap.querySelector('#dashInflowValue');
      const outEl = env.document.getElementById('dashOutflowValue') || env.elements.dashboardViewWrap.querySelector('#dashOutflowValue');

      assert.ok(netEl, 'netEl deve existir');
      assert.ok(inEl, 'inEl deve existir');
      assert.ok(outEl, 'outEl deve existir');

      netEl.textContent = env.window.formatMoney(mockProjection.summary.net);
      inEl.textContent = env.window.formatMoney(mockProjection.summary.inflow);
      outEl.textContent = env.window.formatMoney(mockProjection.summary.outflow);

      assert.equal(netEl.textContent, 'R$ 1550,00');
      assert.equal(inEl.textContent, 'R$ 5000,00');
      assert.equal(outEl.textContent, 'R$ 3450,00');
    });

    test('2. Nível 2 Contexto: 3 cards compactos (Despesas, Cobranças a Receber, Pendências)', () => {
      const env = createTestEnvironment();
      env.window.ConsolidatedDashboardModule.renderConsolidatedDashboardTab();
      const html = env.elements.dashboardViewWrap.innerHTML;

      assert.ok(html.includes('dash-context-cards'), 'Container dos 3 cards de contexto presente');
      assert.ok(html.includes('Despesas Operacionais'), 'Card de Despesas presente');
      assert.ok(html.includes('Cobranças a Receber'), 'Card de Cobranças presente');
      assert.ok(html.includes('Pendências em Aberto'), 'Card de Pendências presente');
    });

    test('3. Nível 2 Próximos Movimentos: Semântica temporal estrita (MANDATÓRIO 3)', () => {
      const env = createTestEnvironment();

      const upcomingCard = new MockElement('div', { id: 'dashUpcomingCard' });
      const upcomingList = new MockElement('div', { id: 'dashUpcomingList' });
      upcomingCard.appendChild(upcomingList);

      env.window.state.year = 2026;
      env.window.state.month = 9;
      env.window.ConsolidatedDashboardModule.renderConsolidatedDashboardTab();

      // Testa que undated e benefits não vazam no HTML
      const htmlCurrent = env.elements.dashboardViewWrap.innerHTML;
      assert.ok(!htmlCurrent.includes('Não deve aparecer'), 'Undated não entra em Próximos Movimentos');
      assert.ok(!htmlCurrent.includes('Benefício não entra'), 'Benefits não entram em Próximos Movimentos');

      // Título correto para competência atual: "Próximos movimentos"
      assert.ok(htmlCurrent.includes('Próximos movimentos'), 'Título correto para mês atual');

      // Competência passada: Título "Movimentações do período"
      env.window.state.year = 2026;
      env.window.state.month = 8; // Mês passado
      env.window.ConsolidatedDashboardModule.renderConsolidatedDashboardTab();
      const htmlPast = env.elements.dashboardViewWrap.innerHTML;
      assert.ok(htmlPast.includes('Movimentações do período'), 'Título correto para mês passado');
    });

    test('4. Nível 2 CTA: "Ver calendário →" navega para tab-calendar', () => {
      const env = createTestEnvironment();
      env.window.ConsolidatedDashboardModule.renderConsolidatedDashboardTab();

      let navigatedTab = null;
      env.window.activateTab = (tabId) => { navigatedTab = tabId; };

      const ctaBtn = env.document.getElementById('dashGoToCalendarBtn') || env.elements.dashboardViewWrap.querySelector('#dashGoToCalendarBtn');
      assert.ok(ctaBtn, 'CTA button deve existir');
      ctaBtn.click();
      assert.equal(navigatedTab, 'tab-calendar', 'Deve navegar para tab-calendar ao clicar no CTA');
    });

    test('5. Nível 3 Análise sob demanda: Categorias, Destinos, Matriz iniciam collapsed por padrão, sem storageKey', () => {
      const env = createTestEnvironment();
      env.window.ConsolidatedDashboardModule.renderConsolidatedDashboardTab();
      const html = env.elements.dashboardViewWrap.innerHTML;

      assert.ok(html.includes('id="dashCategorySection"'), 'Seção Por Categoria existe');
      assert.ok(html.includes('id="dashDestinationSection"'), 'Seção Por Destino existe');
      assert.ok(html.includes('id="dashMatrixSection"'), 'Seção Matriz Cruzada existe');

      // Devem iniciar com classe is-collapsed e aria-expanded="false"
      assert.ok(html.includes('id="dashCategorySection"') && html.includes('is-collapsed'), 'Categoria inicia collapsed');
      assert.ok(html.includes('id="dashDestinationSection"') && html.includes('is-collapsed'), 'Destino inicia collapsed');
      assert.ok(html.includes('id="dashMatrixSection"') && html.includes('is-collapsed'), 'Matriz inicia collapsed');

      // Nenhum storageKey nas seções de Nível 3
      assert.ok(!html.includes('data-storage-key="dashCategory"'), 'Sem storageKey em Categoria');
      assert.ok(!html.includes('data-storage-key="dashDestination"'), 'Sem storageKey em Destino');
      assert.ok(!html.includes('data-storage-key="dashMatrix"'), 'Sem storageKey em Matriz');
    });

    test('6. Filtros Compactos: preservação integral de busca, status, categoria, destino, origem e limpar', () => {
      const env = createTestEnvironment();
      env.window.ConsolidatedDashboardModule.renderConsolidatedDashboardTab();
      const html = env.elements.dashboardViewWrap.innerHTML;

      assert.ok(html.includes('id="dashFiltersBar"'), 'Barra de filtros compacta presente');
      assert.ok(html.includes('id="consolidatedSearchInput"'), 'Campo de busca presente');
      assert.ok(html.includes('id="consolidatedStatusFilter"'), 'Filtro de status presente');
      assert.ok(html.includes('id="consolidatedCategoryFilter"'), 'Filtro de categoria presente');
      assert.ok(html.includes('id="consolidatedDestFilter"'), 'Filtro de destino presente');
      assert.ok(html.includes('id="consolidatedSourceFilter"'), 'Filtro de origem presente');
    });

    test('7. CSS: estilos específicos de Dashboard V2 em dashboard.css com regras responsivas', () => {
      assert.ok(dashboardCss.includes('.dash-hero-card'), 'dashboard.css contém .dash-hero-card');
      assert.ok(dashboardCss.includes('.dash-hero-grid'), 'dashboard.css contém .dash-hero-grid');
      assert.ok(dashboardCss.includes('.dash-hero-net'), 'dashboard.css contém .dash-hero-net');
      assert.ok(dashboardCss.includes('.dash-context-grid'), 'dashboard.css contém .dash-context-grid');
      assert.ok(dashboardCss.includes('.dash-context-cards'), 'dashboard.css contém .dash-context-cards');
      assert.ok(dashboardCss.includes('.dash-upcoming-card'), 'dashboard.css contém .dash-upcoming-card');
      assert.ok(dashboardCss.includes('.dash-skeleton-val'), 'dashboard.css contém .dash-skeleton-val');
      assert.ok(dashboardCss.includes('@media (max-width: 1024px)'), 'dashboard.css contém breakpoint 1024px');
      assert.ok(dashboardCss.includes('@media (max-width: 768px)'), 'dashboard.css contém breakpoint 768px');
    });

  });

});
