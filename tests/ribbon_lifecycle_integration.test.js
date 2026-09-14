/**
 * CORVFIN — UX1.8
 * SUÍTE DE INTEGRAÇÃO DO LIFECYCLE REAL DO RIBBON ANUAL COMPARTILHADO
 *
 * Simula a cadeia de execução real do browser SEM browser headless:
 * activateTab() -> show/hide ribbon -> initExpandableSection() -> renderRibbon() -> renderTabContent()
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('vm');

// Carrega arquivos reais da aplicação
const uiShellJs = fs.readFileSync(path.join(__dirname, '../public/js/core/uiShell.js'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/dashboard.js'), 'utf8');

// Helper de classes DOM
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

// Elemento DOM mock com propagação de eventos
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
    if (attr.includes('=')) {
      const [k, v] = attr.split('=');
      const cleanV = v.replace(/['"]/g, '');
      return el.getAttribute(k) === cleanV;
    }
    return el.getAttribute(attr) !== null;
  }
  // Compound selector like [data-tab].active
  if (sel.includes('[') && sel.includes(']')) {
    const attrMatch = sel.match(/^\[([^\]]+)\]/);
    if (attrMatch) {
      const attrPart = attrMatch[0];
      const rest = sel.slice(attrPart.length);
      if (matches(el, attrPart)) {
        if (!rest) return true;
        if (rest.startsWith('.')) return el.classList.contains(rest.slice(1));
      }
      return false;
    }
  }
  // Compound class selector like .tab-content:not([hidden])
  if (sel === '.tab-content:not([hidden])') {
    return el.classList.contains('tab-content') && !el.hidden;
  }
  return false;
}

// Constrói ambiente com o DOM idêntico ao de index.html
function setupIntegrationEnv() {
  const root = new MockElement('div', { id: 'root' });

  // 1. Ribbon Section
  const ribbonSection = new MockElement('section', {
    id: 'ribbonSection',
    class: 'ribbon-card card expandable-section is-expanded',
    'data-expandable': ''
  });

  const ribbonHeader = new MockElement('div', {
    id: 'ribbonSectionHeader',
    class: 'expandable-section__header'
  });

  const titleGroup = new MockElement('div', { class: 'expandable-section__title-group' });
  const titleEl = new MockElement('h3', { id: 'ribbonSectionTitle', class: 'expandable-section__title' });
  const descEl = new MockElement('span', { id: 'ribbonSectionDesc', class: 'expandable-section__desc' });
  const yearBadge = new MockElement('span', { id: 'ribbonYearBadge' });
  titleGroup.appendChild(titleEl);
  titleGroup.appendChild(descEl);
  titleGroup.appendChild(yearBadge);
  ribbonHeader.appendChild(titleGroup);

  const compactNav = new MockElement('div', { id: 'ribbonCompactNav', class: 'ribbon-compact-nav' });
  const prevMonthBtn = new MockElement('button', { id: 'ribbonPrevMonthBtn', class: 'btn small soft icon-btn ribbon-compact-nav-btn' });
  const compactMonthDisplay = new MockElement('div', { id: 'ribbonCompactMonthDisplay', class: 'ribbon-compact-month-display' });
  const nextMonthBtn = new MockElement('button', { id: 'ribbonNextMonthBtn', class: 'btn small soft icon-btn ribbon-compact-nav-btn' });
  const compactTodayBtn = new MockElement('button', { id: 'ribbonCompactTodayBtn', class: 'btn small soft ribbon-compact-today-btn' });
  compactNav.appendChild(prevMonthBtn);
  compactNav.appendChild(compactMonthDisplay);
  compactNav.appendChild(nextMonthBtn);
  compactNav.appendChild(compactTodayBtn);
  ribbonHeader.appendChild(compactNav);

  const toggleBtn = new MockElement('button', {
    id: 'ribbonToggleBtn',
    class: 'expandable-section__trigger',
    'aria-expanded': 'true',
    'aria-controls': 'ribbonSectionContent'
  });
  ribbonHeader.appendChild(toggleBtn);
  ribbonSection.appendChild(ribbonHeader);

  const ribbonContent = new MockElement('div', {
    id: 'ribbonSectionContent',
    class: 'expandable-section__content'
  });
  const ribbonHead = new MockElement('div', { class: 'ribbon-head' });
  const yearNav = new MockElement('div', { class: 'year-nav' });
  const prevYear = new MockElement('button', { id: 'prevYear' });
  const yearLabel = new MockElement('span', { id: 'yearLabel' });
  const nextYear = new MockElement('button', { id: 'nextYear' });
  const todayBtn = new MockElement('button', { id: 'todayBtn' });
  yearNav.appendChild(prevYear);
  yearNav.appendChild(yearLabel);
  yearNav.appendChild(nextYear);
  yearNav.appendChild(todayBtn);

  const ribbonLegend = new MockElement('div', { id: 'ribbonLegend', class: 'legend' });
  const userGreeting = new MockElement('div', { class: 'user-greeting' });
  const userAvatar = new MockElement('div', { id: 'userAvatar', class: 'user-avatar' });
  const userNameLabel = new MockElement('span', { id: 'userNameLabel', class: 'user-name' });
  const userSalaryLabel = new MockElement('span', { id: 'userSalaryLabel', class: 'user-salary' });
  userGreeting.appendChild(userAvatar);
  userGreeting.appendChild(userNameLabel);
  userGreeting.appendChild(userSalaryLabel);

  ribbonHead.appendChild(yearNav);
  ribbonHead.appendChild(ribbonLegend);
  ribbonHead.appendChild(userGreeting);
  ribbonContent.appendChild(ribbonHead);

  const ribbon = new MockElement('div', { id: 'ribbon', class: 'ribbon' });
  ribbonContent.appendChild(ribbon);
  ribbonSection.appendChild(ribbonContent);
  root.appendChild(ribbonSection);

  // 2. Abas funcionais (<main id="tab-..." class="tab-content">)
  const tabDashboard = new MockElement('main', { id: 'tab-dashboard', class: 'tab-content' });
  const dashboardViewWrap = new MockElement('div', { id: 'dashboardViewWrap' });
  tabDashboard.appendChild(dashboardViewWrap);

  const tabExpenses = new MockElement('main', { id: 'tab-expenses', class: 'tab-content', hidden: true });
  const expensesList = new MockElement('div', { id: 'listFixed' });
  tabExpenses.appendChild(expensesList);

  const tabExtras = new MockElement('main', { id: 'tab-extras', class: 'tab-content', hidden: true });
  const extrasList = new MockElement('div', { id: 'listExtra' });
  tabExtras.appendChild(extrasList);

  const tabDebtors = new MockElement('main', { id: 'tab-debtors', class: 'tab-content', hidden: true });
  const debtorsList = new MockElement('div', { id: 'listDebtors' });
  tabDebtors.appendChild(debtorsList);

  const tabBenefits = new MockElement('main', { id: 'tab-benefits', class: 'tab-content', hidden: true });
  const benefitsList = new MockElement('div', { id: 'listBenefits' });
  tabBenefits.appendChild(benefitsList);

  root.appendChild(tabDashboard);
  root.appendChild(tabExpenses);
  root.appendChild(tabExtras);
  root.appendChild(tabDebtors);
  root.appendChild(tabBenefits);

  // 3. Links de navegação [data-tab]
  const linkDash = new MockElement('button', { 'data-tab': 'tab-dashboard', class: 'sidebar-link active' });
  const linkExp = new MockElement('button', { 'data-tab': 'tab-expenses', class: 'sidebar-link' });
  const linkExt = new MockElement('button', { 'data-tab': 'tab-extras', class: 'sidebar-link' });
  const linkDeb = new MockElement('button', { 'data-tab': 'tab-debtors', class: 'sidebar-link' });
  const linkBen = new MockElement('button', { 'data-tab': 'tab-benefits', class: 'sidebar-link' });

  root.appendChild(linkDash);
  root.appendChild(linkExp);
  root.appendChild(linkExt);
  root.appendChild(linkDeb);
  root.appendChild(linkBen);

  const elementMap = {
    root,
    ribbonSection,
    ribbonSectionHeader: ribbonHeader,
    ribbonSectionTitle: titleEl,
    ribbonSectionDesc: descEl,
    ribbonYearBadge: yearBadge,
    ribbonCompactNav: compactNav,
    ribbonPrevMonthBtn: prevMonthBtn,
    ribbonCompactMonthDisplay: compactMonthDisplay,
    ribbonNextMonthBtn: nextMonthBtn,
    ribbonCompactTodayBtn: compactTodayBtn,
    ribbonToggleBtn: toggleBtn,
    ribbonSectionContent: ribbonContent,
    yearLabel,
    userAvatar,
    userNameLabel,
    userSalaryLabel,
    prevYear,
    nextYear,
    todayBtn,
    ribbonLegend,
    ribbon,
    'tab-dashboard': tabDashboard,
    'tab-expenses': tabExpenses,
    'tab-extras': tabExtras,
    'tab-debtors': tabDebtors,
    'tab-benefits': tabBenefits,
    dashboardViewWrap,
    listFixed: expensesList,
    listExtra: extrasList,
    listDebtors: debtorsList,
    listBenefits: benefitsList
  };

  let state = {
    year: 2026,
    month: 9,
    profile: { name: 'Usuário Teste', baseSalary: 5000 },
    fixed: [],
    variable: [],
    extras: [],
    debtors: [],
    benefits: [],
    collapsedSections: {},
    preferences: {}
  };

  let stateHydrated = false;

  const mockDocument = {
    body: root,
    head: new MockElement('head'),
    getElementById: (id) => elementMap[id] || root.querySelector('#' + id),
    querySelector: (sel) => root.querySelector(sel),
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    createElement: (tag) => new MockElement(tag),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const sandbox = {
    window: {},
    document: mockDocument,
    $: (sel) => {
      if (sel.startsWith('#')) return mockDocument.getElementById(sel.slice(1));
      return mockDocument.querySelector(sel);
    },
    $$: (sel) => mockDocument.querySelectorAll(sel),
    getState: () => state,
    saveState: () => {},
    saveLocalState: () => {},
    currency: (v) => `R$ ${Number(v || 0).toFixed(2)}`,
    todayYM: () => ({ year: 2026, month: 9 }),
    MONTH_NAMES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
    MONTH_ABBR: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    monthTotals: () => ({ totalIncome: 5000, totalExpenses: 2000, sumFixed: 1500, sumVar: 500 }),
    activeExtrasForMonth: () => [{ amount: 400 }],
    activeDebtorsForMonth: () => [{ amount: 300 }],
    monthBenefitsTotals: () => ({ spentTotal: 250 }),
    checkModuleAccess: () => ({ allowed: true }),
    isModuleInMaintenance: () => false,
    hasTabPermission: () => true,
    location: { pathname: '/' },
    history: { pushState: () => {}, replaceState: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    isStateHydrated: () => stateHydrated,
    setStateHydrated: (v) => { stateHydrated = !!v; },
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    }
  };

  sandbox.window = sandbox;
  sandbox.global = sandbox;

  // Carrega uiShell.js e dashboard.js
  vm.runInNewContext(uiShellJs, sandbox);
  vm.runInNewContext(dashboardJs, sandbox);

  // Orquestrador de render funcional das abas
  sandbox.window.renderTabContent = (tabId) => {
    // Simula render funcional sem quebrar DOM
    if (tabId === 'tab-dashboard' && elementMap.dashboardViewWrap) {
      elementMap.dashboardViewWrap.innerHTML = '<div class="dash-content">OK</div>';
    }
  };
  sandbox.renderTabContent = sandbox.window.renderTabContent;

  sandbox.render = () => {
    if (!stateHydrated) return;
    if (typeof sandbox.window.renderRibbon === 'function') {
      sandbox.window.renderRibbon();
    }
    const activeEl = mockDocument.querySelector('[data-tab].active');
    const activeTab = activeEl ? (activeEl.getAttribute('data-tab') || activeEl.dataset?.tab) : 'tab-dashboard';
    sandbox.window.renderTabContent(activeTab);
  };
  sandbox.window.render = sandbox.render;

  return { root, elementMap, sandbox, getState: () => state };
}

describe('CORVFIN — UX1.8: INTEGRAÇÃO DO LIFECYCLE REAL DO RIBBON', () => {

  test('0. Boot sequence real: activateTab antes da hidratação seguido de hidratação e render()', () => {
    const { elementMap, sandbox } = setupIntegrationEnv();

    // 1. Inicia desidratado (como no DOMContentLoaded real)
    sandbox.setStateHydrated(false);

    // 2. initTabs chama syncRouteFromLocation -> activateTab('tab-dashboard')
    sandbox.activateTab('tab-dashboard', false);

    // FALHA ESPERADA NO CÓDIGO ANTERIOR:
    // Antes da hidratação, activateTab DEVE inicializar a API canônica do expandable em #ribbonSection
    assert.ok(elementMap.ribbonSection._expandableApi, '#ribbonSection deve possuir a propriedade _expandableApi anexada e pronta no boot');
    assert.equal(typeof elementMap.ribbonSection._expandableApi.expand, 'function', '_expandableApi.expand deve ser uma função');

    // 3. Servidor responde e chama render()
    sandbox.setStateHydrated(true);
    sandbox.render();

    // Estado final esperado pós-boot:
    assert.equal(elementMap.ribbonSection.hidden, false, '#ribbonSection deve estar visível');
    assert.equal(elementMap.ribbonSectionContent.hidden, false, '#ribbonSectionContent deve estar visível (hidden === false)');
    assert.equal(elementMap.ribbonToggleBtn.getAttribute('aria-expanded'), 'true', 'aria-expanded deve ser true');
    assert.equal(elementMap.ribbonSection.classList.contains('is-expanded'), true, 'classe is-expanded presente');
    assert.equal(elementMap.ribbonSection.classList.contains('is-collapsed'), false, 'classe is-collapsed ausente');
    assert.equal(elementMap.ribbon.children.length, 12, 'Deve ter renderizado os 12 meses');
  });

  test('0b. Autoridade Única: renderRibbon() NÃO deve manipular ribbonSection.hidden nem ribbonSection.style.display', () => {
    const { elementMap, sandbox } = setupIntegrationEnv();
    sandbox.setStateHydrated(true);

    // Inicializa aba
    sandbox.activateTab('tab-dashboard', false);

    let hiddenTouched = false;
    let displayTouched = false;

    // Monitora mutações no container
    let currentHidden = elementMap.ribbonSection.hidden;
    Object.defineProperty(elementMap.ribbonSection, 'hidden', {
      get() { return currentHidden; },
      set(v) {
        hiddenTouched = true;
        currentHidden = v;
      }
    });

    let currentDisplay = elementMap.ribbonSection.style.display;
    Object.defineProperty(elementMap.ribbonSection.style, 'display', {
      get() { return currentDisplay; },
      set(v) {
        displayTouched = true;
        currentDisplay = v;
      }
    });

    // Chama renderRibbon() diretamente (como feito durante render() central ou atualização de métricas)
    sandbox.window.renderRibbon();

    // CONTRATO UX1.8: renderRibbon NÃO é a autoridade de visibilidade do container!
    assert.equal(hiddenTouched, false, 'renderRibbon() NÃO deve tocar em ribbonSection.hidden');
    assert.equal(displayTouched, false, 'renderRibbon() NÃO deve tocar em ribbonSection.style.display');
  });

  test('0c. Autoridade Única: renderRibbon() NÃO deve conter lógica duplicada de expansão (não re-expande se colapsado)', () => {
    const { elementMap, sandbox } = setupIntegrationEnv();
    sandbox.setStateHydrated(true);

    // Ativa aba e colapsa
    sandbox.activateTab('tab-expenses', true);
    elementMap.ribbonToggleBtn.click();
    assert.equal(elementMap.ribbonSectionContent.hidden, true, 'Deve estar colapsado');

    // Executa renderRibbon() diretamente sem parâmetro (como durante recálculo interno)
    sandbox.window.renderRibbon();

    // Deve permanecer colapsado
    assert.equal(elementMap.ribbonSectionContent.hidden, true, 'renderRibbon() não deve forçar re-expansão');
    assert.equal(elementMap.ribbonSection.classList.contains('is-collapsed'), true);
  });


  test('1. Ativação inicial de cada uma das 5 abas resulta em ribbonSection VISÍVEL e ribbonSectionContent EXPANDIDO', () => {
    const fiveTabs = ['tab-dashboard', 'tab-expenses', 'tab-extras', 'tab-debtors', 'tab-benefits'];

    fiveTabs.forEach(tabId => {
      const { elementMap, sandbox } = setupIntegrationEnv();

      // Simula boot e hidratação
      sandbox.setStateHydrated(true);
      sandbox.activateTab(tabId, false);

      // Asserções para a aba
      assert.equal(elementMap.ribbonSection.hidden, false, `${tabId}: #ribbonSection deve estar visível`);
      assert.notEqual(elementMap.ribbonSection.style.display, 'none', `${tabId}: #ribbonSection.style.display não pode ser 'none'`);

      assert.equal(elementMap.ribbonSectionContent.hidden, false, `${tabId}: #ribbonSectionContent.hidden deve ser false imediatamente após ativação`);
      assert.notEqual(elementMap.ribbonSectionContent.style.display, 'none', `${tabId}: #ribbonSectionContent não pode ter display none`);

      assert.equal(elementMap.ribbonToggleBtn.getAttribute('aria-expanded'), 'true', `${tabId}: aria-expanded deve ser 'true'`);
      assert.equal(elementMap.ribbonSection.classList.contains('is-expanded'), true, `${tabId}: classe 'is-expanded' deve estar presente`);
      assert.equal(elementMap.ribbonSection.classList.contains('is-collapsed'), false, `${tabId}: classe 'is-collapsed' deve estar ausente`);
    });
  });

  test('2. Toggle Collapse: recolhe apenas o conteúdo anual Jan-Dez e preserva o conteúdo funcional da aba', () => {
    const { elementMap, sandbox } = setupIntegrationEnv();
    sandbox.setStateHydrated(true);

    // Ativa Despesas
    sandbox.activateTab('tab-expenses', true);
    assert.equal(elementMap.ribbonSectionContent.hidden, false, 'Inicia expanded');

    // Usuário clica no botão de recolher
    elementMap.ribbonToggleBtn.click();

    // Esperado: ribbonSectionContent.hidden === true
    assert.equal(elementMap.ribbonSectionContent.hidden, true, 'ribbonSectionContent deve estar oculto após collapse');
    assert.equal(elementMap.ribbonToggleBtn.getAttribute('aria-expanded'), 'false', 'aria-expanded deve ser false após collapse');
    assert.equal(elementMap.ribbonSection.classList.contains('is-collapsed'), true, 'classe is-collapsed deve estar presente');
    assert.equal(elementMap.ribbonSection.classList.contains('is-expanded'), false, 'classe is-expanded deve estar ausente');

    // Header compacto continua visível
    assert.equal(elementMap.ribbonSectionHeader.hidden, false, 'Header compacto continua visível');
    assert.equal(elementMap.ribbonSection.hidden, false, 'Container #ribbonSection continua visível');

    // Conteúdo funcional da aba continua presente e visível
    assert.equal(elementMap['tab-expenses'].hidden, false, 'Conteúdo funcional de tab-expenses continua visível');
  });

  test('3. Navegação de mês enquanto COLLAPSED mantém ribbon COLLAPSED (sem forçar re-expansão)', () => {
    const { elementMap, sandbox, getState } = setupIntegrationEnv();
    sandbox.setStateHydrated(true);

    // Ativa Despesas e colapsa
    sandbox.activateTab('tab-expenses', true);
    elementMap.ribbonToggleBtn.click();
    assert.equal(elementMap.ribbonSectionContent.hidden, true, 'Ribbon colapsado com sucesso');

    // Navega próximo mês
    sandbox.ribbonNextMonth();
    assert.equal(getState().month, 10, 'Avançou para o mês 10');

    // CONTRATO CRÍTICO UX1.8: Navegar o mês NÃO deve forçar re-expansão do ribbon anual!
    assert.equal(elementMap.ribbonSectionContent.hidden, true, 'ribbonSectionContent DEVE CONTINUAR hidden===true após navegar próximo mês em modo collapsed');
    assert.equal(elementMap.ribbonSection.classList.contains('is-collapsed'), true, 'classe is-collapsed deve continuar presente');
    assert.equal(elementMap.ribbonSection.classList.contains('is-expanded'), false, 'classe is-expanded deve continuar ausente');
  });

  test('4. Trocar de aba restaura estado EXPANDIDO na nova aba', () => {
    const { elementMap, sandbox } = setupIntegrationEnv();
    sandbox.setStateHydrated(true);

    // Entra em Despesas e colapsa
    sandbox.activateTab('tab-expenses', true);
    elementMap.ribbonToggleBtn.click();
    assert.equal(elementMap.ribbonSectionContent.hidden, true, 'Despesas colapsado');

    // Troca para Extras
    sandbox.activateTab('tab-extras', true);

    // CONTRATO: nova aba com ribbon entra EXPANDIDA
    assert.equal(elementMap.ribbonSectionContent.hidden, false, 'Nova aba (Extras) deve iniciar EXPANDIDA');
    assert.equal(elementMap.ribbonToggleBtn.getAttribute('aria-expanded'), 'true');
    assert.equal(elementMap.ribbonSection.classList.contains('is-expanded'), true);
    assert.equal(elementMap.ribbonSection.classList.contains('is-collapsed'), false);
  });

  test('5. Sequência completa real: Despesas -> collapse -> próximo mês -> Extras -> Devedores -> Despesas', () => {
    const { elementMap, sandbox, getState } = setupIntegrationEnv();
    sandbox.setStateHydrated(true);

    // 1. Despesas
    sandbox.activateTab('tab-expenses', true);
    assert.equal(elementMap.ribbonSectionContent.hidden, false, '1. Despesas inicia expanded');

    // 2. Collapse
    elementMap.ribbonToggleBtn.click();
    assert.equal(elementMap.ribbonSectionContent.hidden, true, '2. Despesas colapsado');

    // 3. Próximo mês
    sandbox.ribbonNextMonth();
    assert.equal(getState().month, 10, '3. Mês avançou');
    assert.equal(elementMap.ribbonSectionContent.hidden, true, '3. Permanece colapsado');

    // 4. Extras
    sandbox.activateTab('tab-extras', true);
    assert.equal(elementMap.ribbonSectionContent.hidden, false, '4. Extras inicia expanded');

    // 5. Devedores
    sandbox.activateTab('tab-debtors', true);
    assert.equal(elementMap.ribbonSectionContent.hidden, false, '5. Devedores inicia expanded');

    // 6. Voltar para Despesas
    sandbox.activateTab('tab-expenses', true);
    assert.equal(elementMap.ribbonSectionContent.hidden, false, '6. Ao voltar para Despesas, deve estar EXPANDIDO');
    assert.equal(elementMap.ribbonToggleBtn.getAttribute('aria-expanded'), 'true');
    assert.equal(elementMap.ribbonSection.classList.contains('is-expanded'), true);
    assert.equal(elementMap.ribbonSection.classList.contains('is-collapsed'), false);
  });

});
