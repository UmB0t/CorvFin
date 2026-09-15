/**
 * CorvFin — UX3.3: Suíte de Testes de Persistência da Visualização em Despesas
 *
 * Cobertura obrigatória:
 * - Caso A: sem chave no localStorage -> "Todas" (all)
 * - Caso B: chave "all" -> "Todas" (all)
 * - Caso C: chave "type" -> "Por tipo" (type)
 * - Caso D: valor inválido -> fallback "Todas" (all)
 * - Caso E: clique em "Por tipo" persiste "type"
 * - Caso F: clique em "Todas" persiste "all"
 * - Caso G: reentrada na aba preserva escolha
 * - Caso H: refresh/reinicialização simulada preserva escolha
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const expensesJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/expenses.js'), 'utf8');

class MockLocalStorage {
  constructor(initialData = {}) {
    this.store = { ...initialData };
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

class MockElement {
  constructor(tagName = 'div', id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.hidden = false;
    this._innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.dataset = {};
    this._listeners = {};
  }

  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, val) { this.attributes[name] = String(val); }
  removeAttribute(name) { delete this.attributes[name]; }

  get classList() {
    const self = this;
    return {
      add(...classes) {
        const set = new Set((self.className || '').split(/\s+/).filter(Boolean));
        classes.forEach(c => set.add(c));
        self.className = Array.from(set).join(' ');
      },
      remove(...classes) {
        const set = new Set((self.className || '').split(/\s+/).filter(Boolean));
        classes.forEach(c => set.delete(c));
        self.className = Array.from(set).join(' ');
      },
      toggle(c, force) {
        const set = new Set((self.className || '').split(/\s+/).filter(Boolean));
        let res;
        if (force !== undefined) {
          if (force) set.add(c); else set.delete(c);
          res = force;
        } else {
          if (set.has(c)) { set.delete(c); res = false; }
          else { set.add(c); res = true; }
        }
        self.className = Array.from(set).join(' ');
        return res;
      },
      contains(c) {
        return (self.className || '').split(/\s+/).includes(c);
      }
    };
  }

  appendChild(child) {
    this.children.push(child);
  }

  querySelectorAll() {
    return [];
  }

  querySelector() {
    return null;
  }

  closest() {
    return this;
  }

  addEventListener(ev, fn) {
    this._listeners[ev] = this._listeners[ev] || [];
    this._listeners[ev].push(fn);
  }

  click() {
    (this._listeners['click'] || []).forEach(fn => fn({ preventDefault() {} }));
  }
}

function createExpensesEnvironment(localStorageData = {}) {
  const mockStorage = new MockLocalStorage(localStorageData);
  const elements = new Map();

  function getEl(sel) {
    if (!elements.has(sel)) {
      elements.set(sel, new MockElement('div', sel.replace(/^[#.]/, '')));
    }
    return elements.get(sel);
  }

  const state = {
    year: 2026,
    month: 9,
    profile: { baseSalary: 2000 },
    fixed: [],
    variable: [],
    extras: [],
    debtors: [],
    destinations: [{ name: 'Nubank' }],
    categories: ['Alimentação', 'Moradia'],
    collapsedSections: {}
  };

  const sandbox = {
    console,
    localStorage: mockStorage,
    getState: () => state,
    saveState: () => {},
    saveLocalState: () => {},
    $: (sel) => getEl(sel),
    $$: () => [],
    mk: (y, m) => Number(y) * 12 + Number(m),
    ymKey: (y, m) => `${y}-${String(m).padStart(2, '0')}`,
    currency: (v) => `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`,
    MONTH_ABBR: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    MONTH_NAMES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
    CATEGORY_COLORS: ['#10b981', '#3b82f6'],
    monthTotals: () => ({
      totalIncome: 2000,
      totalExpenses: 500,
      paidExpenses: 200,
      pendingExpenses: 300,
      balance: 1500,
      fixed: [],
      variable: [],
      allExpenses: []
    }),
    activeFixedForMonth: () => [],
    activeVariableForMonth: () => [],
    updateMarkAllButtonState: () => {},
    buildEntryRow: () => new MockElement(),
    render: () => {},
    notify: () => {},
    document: {
      querySelectorAll: () => []
    }
  };
  sandbox.window = sandbox;

  const script = new vm.Script(expensesJs);
  const ctx = vm.createContext(sandbox);
  script.runInContext(ctx);

  return {
    sandbox,
    mockStorage,
    getEl,
    reinit: () => {
      // Simula reload da página com o mesmo localStorage
      return createExpensesEnvironment(mockStorage.store);
    }
  };
}

describe('CorvFin — UX3.3: Persistência da visualização em Despesas', () => {

  test('Caso A — Sem chave no localStorage -> visualização padrão "Todas" (all)', () => {
    const env = createExpensesEnvironment(); // localStorage vazio
    assert.strictEqual(env.sandbox.readExpensesViewMode(), 'all');
    assert.strictEqual(env.sandbox.getExpensesViewMode(), 'all');

    env.sandbox.renderExpensesLists();
    const allBtn = env.getEl('#expensesViewAllBtn');
    const byTypeBtn = env.getEl('#expensesViewByTypeBtn');
    assert.ok(allBtn.classList.contains('active'), 'Botão Todas deve estar ativo');
    assert.ok(!byTypeBtn.classList.contains('active'), 'Botão Por tipo não deve estar ativo');
    assert.strictEqual(env.getEl('#simplifiedExpensesContainer').hidden, false, 'Contêiner Todas visível');
    assert.strictEqual(env.getEl('#normalExpensesGrid').hidden, true, 'Grade Por tipo oculta');
  });

  test('Caso B — Chave "all" no localStorage -> "Todas" (all)', () => {
    const env = createExpensesEnvironment({ corvfin_expenses_view_mode: 'all' });
    assert.strictEqual(env.sandbox.readExpensesViewMode(), 'all');
    assert.strictEqual(env.sandbox.getExpensesViewMode(), 'all');

    env.sandbox.renderExpensesLists();
    assert.ok(env.getEl('#expensesViewAllBtn').classList.contains('active'));
    assert.ok(!env.getEl('#expensesViewByTypeBtn').classList.contains('active'));
    assert.strictEqual(env.getEl('#simplifiedExpensesContainer').hidden, false);
    assert.strictEqual(env.getEl('#normalExpensesGrid').hidden, true);
  });

  test('Caso C — Chave "type" no localStorage -> "Por tipo" (type)', () => {
    const env = createExpensesEnvironment({ corvfin_expenses_view_mode: 'type' });
    assert.strictEqual(env.sandbox.readExpensesViewMode(), 'type');
    assert.strictEqual(env.sandbox.getExpensesViewMode(), 'type');

    env.sandbox.renderExpensesLists();
    const allBtn = env.getEl('#expensesViewAllBtn');
    const byTypeBtn = env.getEl('#expensesViewByTypeBtn');
    assert.ok(!allBtn.classList.contains('active'), 'Botão Todas não deve estar ativo');
    assert.ok(byTypeBtn.classList.contains('active'), 'Botão Por tipo deve estar ativo');
    assert.strictEqual(env.getEl('#simplifiedExpensesContainer').hidden, true, 'Contêiner Todas oculto');
    assert.strictEqual(env.getEl('#normalExpensesGrid').hidden, false, 'Grade Por tipo visível');
  });

  test('Caso D — Valor inválido no localStorage -> fallback "Todas" (all)', () => {
    const invalidValues = ['invalid', '', '123', 'true', 'TYPE', 'ALL', 'null', 'undefined'];
    for (const val of invalidValues) {
      const env = createExpensesEnvironment({ corvfin_expenses_view_mode: val });
      assert.strictEqual(env.sandbox.readExpensesViewMode(), 'all', `Valor "${val}" deve ter fallback "all"`);
      assert.strictEqual(env.sandbox.getExpensesViewMode(), 'all');
    }
  });

  test('Caso E — Clique em "Por tipo" persiste "type" no localStorage', () => {
    const env = createExpensesEnvironment(); // Inicia com "all"
    assert.strictEqual(env.mockStorage.getItem('corvfin_expenses_view_mode'), null);

    // Clica no botão "Por tipo"
    const byTypeBtn = env.getEl('#expensesViewByTypeBtn');
    byTypeBtn.click();

    // Verifica persistência e estado
    assert.strictEqual(env.mockStorage.getItem('corvfin_expenses_view_mode'), 'type', 'Deve persistir "type" no localStorage');
    assert.strictEqual(env.sandbox.getExpensesViewMode(), 'type', 'Estado interno deve ser "type"');
    assert.ok(byTypeBtn.classList.contains('active'), 'Botão Por tipo deve ter classe active');
    assert.ok(!env.getEl('#expensesViewAllBtn').classList.contains('active'), 'Botão Todas não deve ter classe active');
    assert.strictEqual(env.getEl('#simplifiedExpensesContainer').hidden, true);
    assert.strictEqual(env.getEl('#normalExpensesGrid').hidden, false);
  });

  test('Caso F — Clique em "Todas" persiste "all" no localStorage', () => {
    const env = createExpensesEnvironment({ corvfin_expenses_view_mode: 'type' });
    assert.strictEqual(env.mockStorage.getItem('corvfin_expenses_view_mode'), 'type');

    // Clica no botão "Todas"
    const allBtn = env.getEl('#expensesViewAllBtn');
    allBtn.click();

    // Verifica persistência e estado
    assert.strictEqual(env.mockStorage.getItem('corvfin_expenses_view_mode'), 'all', 'Deve persistir "all" no localStorage');
    assert.strictEqual(env.sandbox.getExpensesViewMode(), 'all', 'Estado interno deve ser "all"');
    assert.ok(allBtn.classList.contains('active'), 'Botão Todas deve ter classe active');
    assert.ok(!env.getEl('#expensesViewByTypeBtn').classList.contains('active'), 'Botão Por tipo não deve ter classe active');
    assert.strictEqual(env.getEl('#simplifiedExpensesContainer').hidden, false);
    assert.strictEqual(env.getEl('#normalExpensesGrid').hidden, true);
  });

  test('Caso G — Reentrada na aba Despesas preserva a escolha persistida (não reseta para Todas)', () => {
    const env = createExpensesEnvironment();

    // 1. Usuário seleciona "Por tipo"
    env.getEl('#expensesViewByTypeBtn').click();
    assert.strictEqual(env.mockStorage.getItem('corvfin_expenses_view_mode'), 'type');
    assert.strictEqual(env.sandbox.getExpensesViewMode(), 'type');

    // 2. Simula navegação para outra aba (ex: Dashboard)
    // Em uiShell.js não deve mais existir resetExpensesViewMode() forçado para 'all'
    // Se resetExpensesViewMode() for chamado, ele agora respeita o valor persistido
    env.sandbox.resetExpensesViewMode();
    assert.strictEqual(env.sandbox.getExpensesViewMode(), 'type', 'resetExpensesViewMode deve respeitar o valor persistido');

    // 3. Simula re-render ao entrar na aba Despesas
    env.sandbox.renderExpensesLists();
    assert.strictEqual(env.sandbox.getExpensesViewMode(), 'type', 'Ao re-entrar na aba Despesas, deve permanecer "type"');
    assert.ok(env.getEl('#expensesViewByTypeBtn').classList.contains('active'), 'Botão Por tipo permanece ativo');
    assert.strictEqual(env.getEl('#normalExpensesGrid').hidden, false, 'Grade Por tipo permanece visível');
  });

  test('Caso H — Refresh / reinicialização simulada preserva a escolha', () => {
    // 1. Primeira sessão: seleciona "Por tipo"
    const session1 = createExpensesEnvironment();
    session1.getEl('#expensesViewByTypeBtn').click();
    assert.strictEqual(session1.mockStorage.getItem('corvfin_expenses_view_mode'), 'type');

    // 2. Simula refresh (recarregando os scripts com o mesmo localStorage)
    const session2 = session1.reinit();
    assert.strictEqual(session2.sandbox.readExpensesViewMode(), 'type');
    assert.strictEqual(session2.sandbox.getExpensesViewMode(), 'type');

    session2.sandbox.renderExpensesLists();
    assert.ok(session2.getEl('#expensesViewByTypeBtn').classList.contains('active'), 'Após refresh, Por tipo continua ativo');
    assert.ok(!session2.getEl('#expensesViewAllBtn').classList.contains('active'));
    assert.strictEqual(session2.getEl('#normalExpensesGrid').hidden, false);
    assert.strictEqual(session2.getEl('#simplifiedExpensesContainer').hidden, true);
  });

  test('writeExpensesViewMode rejeita valores inválidos sem corromper localStorage', () => {
    const env = createExpensesEnvironment({ corvfin_expenses_view_mode: 'type' });

    env.sandbox.writeExpensesViewMode('invalid_mode');
    assert.strictEqual(env.mockStorage.getItem('corvfin_expenses_view_mode'), 'type', 'Valor inválido não deve sobrescrever');

    env.sandbox.writeExpensesViewMode(null);
    assert.strictEqual(env.mockStorage.getItem('corvfin_expenses_view_mode'), 'type', 'null não deve sobrescrever');

    env.sandbox.writeExpensesViewMode(undefined);
    assert.strictEqual(env.mockStorage.getItem('corvfin_expenses_view_mode'), 'type', 'undefined não deve sobrescrever');
  });

});
