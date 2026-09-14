/**
 * CorvFin — HML Patch 2: Testes de Renderização e Dataset de Devedores
 *
 * Cobertura obrigatória:
 * - Caso A: Devedor ativo na competência deve aparecer na lista
 * - Caso B: Devedor com countInTotal: false deve continuar aparecendo na aba e nos gráficos
 * - Caso C: Devedor com countInTotal: true também aparece normalmente
 * - Caso D: Devedor fora da competência não aparece no recorte mensal quando a tela exigir competência
 * - Caso E: Total dos itens renderizados/gráficos compatível com o universo exibido
 * - Caso F: Filtros não devem zerar silenciosamente o dataset inicial
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const debtorsJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/debtors.js'), 'utf8');

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

  set innerHTML(val) {
    this._innerHTML = String(val);
    if (!val) {
      this.children = [];
    }
  }

  get innerHTML() {
    return this._innerHTML;
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

  closest() {
    return this;
  }

  addEventListener(ev, fn) {
    this._listeners[ev] = this._listeners[ev] || [];
    this._listeners[ev].push(fn);
  }

  trigger(ev, eventObj = {}) {
    (this._listeners[ev] || []).forEach(fn => fn(eventObj));
  }
}

function createDebtorsEnvironment(customState = {}) {
  const elements = new Map();
  function getEl(sel) {
    if (!elements.has(sel)) {
      elements.set(sel, new MockElement('div', sel.replace(/^[#.]/, '')));
    }
    return elements.get(sel);
  }

  let state = {
    year: 2026,
    month: 9,
    collapsedSections: { debtorPerson: false, debtorDest: false },
    debtorPersonChartType: 'bar',
    debtorDestChartType: 'bar',
    debtorsSubView: 'monthly',
    destinations: [{ name: 'Nubank' }, { name: 'Inter' }],
    debtors: [],
    ...customState
  };

  const sandbox = {
    console,
    getState: () => state,
    saveState: () => {},
    saveLocalState: () => {},
    $: (sel) => getEl(sel),
    $$: () => [],
    mk: (y, m) => Number(y) * 12 + Number(m),
    ymKey: (y, m) => `${y}-${String(m).padStart(2, '0')}`,
    currency: (v) => `R$ ${(Number(v) || 0).toFixed(2).replace('.', ',')}`,
    MONTH_ABBR: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
    DEBTOR_COLORS_PALETTE: ['#10b981', '#6366f1', '#f59e0b', '#ec4899'],
    ICONS: { check: '', edit: '' },
    DEST_SVG_ICONS: { card: '' },
    getDestMeta: (d) => ({ name: d || 'Gerais', color: '#10b981', icon: 'card' }),
    escapeHtml: (s) => String(s || ''),
    normalizeSearchText: (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    buildEntryRow: (cfg) => {
      const row = new MockElement('div', `debtor-row-${cfg.id}`, 'entry-row');
      row.rowConfig = cfg;
      return row;
    },
    notify: () => {},
    render: () => {}
  };
  sandbox.window = sandbox;

  const script = new vm.Script(debtorsJs);
  const ctx = vm.createContext(sandbox);
  script.runInContext(ctx);

  return {
    sandbox,
    elements,
    getEl,
    setState: (newState) => { state = { ...state, ...newState }; }
  };
}

describe('CorvFin — HML Patch 2: Aba Devedores & Cobranças', () => {

  test('Caso A — Devedor ativo na competência deve aparecer na lista', () => {
    const env = createDebtorsEnvironment({
      year: 2026,
      month: 9,
      debtors: [
        {
          id: 'deb_1',
          debtorName: 'Carlos',
          title: 'Parcela Computador',
          amount: 500,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 12,
          countInTotal: true,
          status: 'pendente'
        }
      ]
    });

    env.sandbox.renderDebtorsTab();

    const listEl = env.getEl('#listDebtors');
    assert.strictEqual(listEl.children.length, 1, 'Deve conter exatamente 1 registro na lista');
    assert.strictEqual(listEl.children[0].rowConfig.title, 'Carlos • Parcela Computador');
    assert.strictEqual(listEl.children[0].rowConfig.amount, 500);

    const sumEl = env.getEl('#sumDebtors');
    assert.strictEqual(sumEl.textContent, 'R$ 500,00', 'Total da lista deve ser R$ 500,00');
  });

  test('Caso B — Devedor com countInTotal: false deve continuar aparecendo na aba e nos gráficos', () => {
    const env = createDebtorsEnvironment({
      year: 2026,
      month: 9,
      debtors: [
        {
          id: 'deb_not_counted',
          debtorName: 'Ana',
          title: 'Empréstimo Pessoal',
          amount: 887.78,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          destination: 'Nubank',
          countInTotal: false, // NÃO contabilizável no orçamento
          status: 'pendente'
        }
      ]
    });

    env.sandbox.renderDebtorsTab();

    // 1. Visível na lista
    const listEl = env.getEl('#listDebtors');
    assert.strictEqual(listEl.children.length, 1, 'Devedor countInTotal: false DEVE aparecer na lista');
    assert.strictEqual(listEl.children[0].rowConfig.title, 'Ana • Empréstimo Pessoal');
    assert.strictEqual(listEl.children[0].rowConfig.amount, 887.78);

    // 2. Não possui a tag "Soma na Renda do Mês"
    const tags = listEl.children[0].rowConfig.tags || [];
    assert.ok(!tags.includes('Soma na Renda do Mês'), 'Não deve indicar que soma na renda do mês');

    // 3. Alimentar total da lista
    const sumEl = env.getEl('#sumDebtors');
    assert.strictEqual(sumEl.textContent, 'R$ 887,78', 'Total da lista deve contemplar o recebível');

    // 4. Alimentar gráficos
    const personTotal = env.getEl('#debtorPersonTotal');
    assert.strictEqual(personTotal.textContent, 'Total: R$ 887,78', 'Gráfico Montante por Devedor deve exibir Total: R$ 887,78');
    const destTotal = env.getEl('#debtorDestTotal');
    assert.strictEqual(destTotal.textContent, 'Total: R$ 887,78', 'Gráfico Montante por Destino deve exibir Total: R$ 887,78');
  });

  test('Caso C — Devedor com countInTotal: true também aparece normalmente', () => {
    const env = createDebtorsEnvironment({
      year: 2026,
      month: 9,
      debtors: [
        {
          id: 'deb_counted',
          debtorName: 'Marcos',
          title: 'Venda de Equipamento',
          amount: 108.00,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          destination: 'Inter',
          countInTotal: true,
          status: 'pendente'
        }
      ]
    });

    env.sandbox.renderDebtorsTab();

    const listEl = env.getEl('#listDebtors');
    assert.strictEqual(listEl.children.length, 1);
    assert.strictEqual(listEl.children[0].rowConfig.title, 'Marcos • Venda de Equipamento');

    const tags = listEl.children[0].rowConfig.tags || [];
    assert.ok(tags.includes('Soma na Renda do Mês'), 'Deve indicar a tag Soma na Renda do Mês');

    const sumEl = env.getEl('#sumDebtors');
    assert.strictEqual(sumEl.textContent, 'R$ 108,00');

    const personTotal = env.getEl('#debtorPersonTotal');
    assert.strictEqual(personTotal.textContent, 'Total: R$ 108,00');
  });

  test('Caso D — Devedor fora da competência não aparece no recorte mensal quando a regra exigir competência', () => {
    const env = createDebtorsEnvironment({
      year: 2026,
      month: 9,
      debtors: [
        {
          id: 'deb_out_past',
          debtorName: 'Passado',
          title: 'Finalizado em Agosto',
          amount: 300,
          startYear: 2026,
          startMonth: 7,
          endYear: 2026,
          endMonth: 8,
          countInTotal: true,
          status: 'pago'
        },
        {
          id: 'deb_cur',
          debtorName: 'Atual',
          title: 'Vigente em Setembro',
          amount: 400,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 10,
          countInTotal: true,
          status: 'pendente'
        },
        {
          id: 'deb_out_future',
          debtorName: 'Futuro',
          title: 'Inicia em Outubro',
          amount: 600,
          startYear: 2026,
          startMonth: 10,
          endYear: 2026,
          endMonth: 12,
          countInTotal: true,
          status: 'pendente'
        }
      ]
    });

    env.sandbox.renderDebtorsTab();

    const listEl = env.getEl('#listDebtors');
    assert.strictEqual(listEl.children.length, 1, 'Apenas o devedor vigente no mês 9 deve aparecer na lista mensal');
    assert.strictEqual(listEl.children[0].rowConfig.title, 'Atual • Vigente em Setembro');

    const sumEl = env.getEl('#sumDebtors');
    assert.strictEqual(sumEl.textContent, 'R$ 400,00', 'Total da lista mensal deve ser exatamente R$ 400,00');
  });

  test('Caso E — Total dos itens renderizados/gráficos compatível com o universo exibido (Cenário HML: 108 + 887,78 = 995,78)', () => {
    const env = createDebtorsEnvironment({
      year: 2026,
      month: 9,
      debtors: [
        {
          id: 'deb_1',
          debtorName: 'Devedor Contabilizado',
          title: 'Parcela A',
          amount: 108.00,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          destination: 'Nubank',
          countInTotal: true,
          status: 'pendente'
        },
        {
          id: 'deb_2',
          debtorName: 'Devedor Não Contabilizado',
          title: 'Parcela B',
          amount: 887.78,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          destination: 'Nubank',
          countInTotal: false,
          status: 'pendente'
        }
      ]
    });

    env.sandbox.renderDebtorsTab();

    // 1. Ambos os itens renderizados na lista
    const listEl = env.getEl('#listDebtors');
    assert.strictEqual(listEl.children.length, 2);

    // 2. Soma da lista
    const sumEl = env.getEl('#sumDebtors');
    assert.strictEqual(sumEl.textContent, 'R$ 995,78', 'Soma da lista deve ser R$ 995,78');

    // 3. Badges dos gráficos
    const personTotal = env.getEl('#debtorPersonTotal');
    assert.strictEqual(personTotal.textContent, 'Total: R$ 995,78', 'Badge Montante por Devedor deve ser Total: R$ 995,78');
    const destTotal = env.getEl('#debtorDestTotal');
    assert.strictEqual(destTotal.textContent, 'Total: R$ 995,78', 'Badge Montante por Destino deve ser Total: R$ 995,78');

    // 4. KPI card "A Receber no Mês Atual" no HTML de #debtorMetrics
    const metricsEl = env.getEl('#debtorMetrics');
    assert.ok(metricsEl.innerHTML.includes('R$ 995,78'), 'KPI A Receber no Mês Atual deve conter R$ 995,78');
    assert.ok(metricsEl.innerHTML.includes('A Receber no Mês Atual'), 'Título do KPI presente');
  });

  test('Caso F — Filtros não devem zerar silenciosamente o dataset inicial', () => {
    const env = createDebtorsEnvironment({
      year: 2026,
      month: 9,
      debtors: [
        {
          id: 'deb_1',
          debtorName: 'Carlos Silva',
          title: 'Acordo 1',
          amount: 200,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          destination: 'Nubank',
          status: 'pendente'
        },
        {
          id: 'deb_2',
          debtorName: 'Beatriz Costa',
          title: 'Acordo 2',
          amount: 300,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          destination: 'Inter',
          status: 'pago'
        }
      ]
    });

    // 1. Estado inicial sem filtros
    env.sandbox.renderDebtorsTab();
    assert.strictEqual(env.getEl('#listDebtors').children.length, 2);
    assert.strictEqual(env.getEl('#sumDebtors').textContent, 'R$ 500,00');

    // 2. Filtrar por status 'pendente'
    env.getEl('#debtorsStatusFilter').value = 'pendente';
    env.sandbox.renderDebtorsTab();
    assert.strictEqual(env.getEl('#listDebtors').children.length, 1);
    assert.strictEqual(env.getEl('#listDebtors').children[0].rowConfig.title, 'Carlos Silva • Acordo 1');
    assert.strictEqual(env.getEl('#sumDebtors').textContent, 'R$ 200,00');

    // 3. Filtrar por status 'pago'
    env.getEl('#debtorsStatusFilter').value = 'pago';
    env.sandbox.renderDebtorsTab();
    assert.strictEqual(env.getEl('#listDebtors').children.length, 1);
    assert.strictEqual(env.getEl('#listDebtors').children[0].rowConfig.title, 'Beatriz Costa • Acordo 2');
    assert.strictEqual(env.getEl('#sumDebtors').textContent, 'R$ 300,00');

    // 4. Restaurar filtro para 'all'
    env.getEl('#debtorsStatusFilter').value = 'all';
    env.sandbox.renderDebtorsTab();
    assert.strictEqual(env.getEl('#listDebtors').children.length, 2, 'Dataset restaurado sem perda');
    assert.strictEqual(env.getEl('#sumDebtors').textContent, 'R$ 500,00');

    // 5. Busca textual
    env.getEl('#debtorsSearchInput').value = 'Carlos';
    env.sandbox.renderDebtorsTab();
    assert.strictEqual(env.getEl('#listDebtors').children.length, 1);
    assert.strictEqual(env.getEl('#listDebtors').children[0].rowConfig.title, 'Carlos Silva • Acordo 1');

    // 6. Limpar busca
    env.getEl('#debtorsSearchInput').value = '';
    env.sandbox.renderDebtorsTab();
    assert.strictEqual(env.getEl('#listDebtors').children.length, 2, 'Dataset restaurado após limpar busca');
    assert.strictEqual(env.getEl('#sumDebtors').textContent, 'R$ 500,00');
  });

  test('Alternância de subvisão: Cobranças do Mês x Dívidas Totais & Contratos preserva dados', () => {
    const env = createDebtorsEnvironment({
      year: 2026,
      month: 9,
      debtors: [
        {
          id: 'deb_multi',
          debtorName: 'Rafael Contrato',
          title: 'Contrato Longo',
          amount: 250,
          startYear: 2026,
          startMonth: 1,
          endYear: 2026,
          endMonth: 10,
          destination: 'Nubank',
          paidHistory: { '2026-01': true, '2026-02': true }
        }
      ]
    });

    // 1. Mensal
    env.sandbox.renderDebtorsTab();
    assert.strictEqual(env.getEl('#listDebtors').children.length, 1);
    assert.strictEqual(env.getEl('#sumDebtors').textContent, 'R$ 250,00');

    // 2. Visão de Totais
    env.sandbox.renderDebtorsTotalsTab();
    const grandTotal = env.getEl('#sumDebtorsGrandTotal');
    // 10 meses * 250 = 2500
    assert.strictEqual(grandTotal.textContent, 'Total: R$ 2500,00');

    // 3. Voltar para Mensal
    env.sandbox.renderDebtorsTab();
    assert.strictEqual(env.getEl('#listDebtors').children.length, 1);
    assert.strictEqual(env.getEl('#sumDebtors').textContent, 'R$ 250,00');
  });

  test('Gráficos de Devedores e Destino não lançam ReferenceError em renderDebtorCharts', () => {
    const env = createDebtorsEnvironment({
      year: 2026,
      month: 9,
      collapsedSections: { debtorPerson: false, debtorDest: false },
      debtors: [
        {
          id: 'deb_chart_test',
          debtorName: 'Mariana',
          title: 'Teste Gráfico',
          amount: 350,
          startYear: 2026,
          startMonth: 9,
          endYear: 2026,
          endMonth: 9,
          destination: 'Nubank'
        }
      ]
    });

    assert.doesNotThrow(() => {
      env.sandbox.renderDebtorCharts();
    }, 'renderDebtorCharts não deve lançar ReferenceError');

    // Colapsar seções e re-executar
    env.sandbox.toggleDebtorPerson();
    env.sandbox.toggleDebtorDest();

    assert.doesNotThrow(() => {
      env.sandbox.renderDebtorCharts();
    }, 'renderDebtorCharts com seções colapsadas não deve lançar exceção');
  });

});
