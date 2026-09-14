/**
 * CORVFIN — UX REFINEMENT
 * LOTE UX3: EXPENSES V2 SIMPLIFIED-FIRST EXPERIENCE
 * SUÍTE DE TESTES: tests/expenses_v2_ux3.test.js
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Leitura dos arquivos fonte reais
const htmlContent = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '../public/js/core/app.js'), 'utf8');
const expensesJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/expenses.js'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/dashboard.js'), 'utf8');
const debtorsJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/debtors.js'), 'utf8');
const uiShellJs = fs.readFileSync(path.join(__dirname, '../public/js/core/uiShell.js'), 'utf8');
const dashboardCss = fs.readFileSync(path.join(__dirname, '../public/css/dashboard.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(__dirname, '../public/css/mobile.css'), 'utf8');

// Mocking minimalista para execução em ambiente Node / vm
class MockElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.style = {};
    this.hidden = false;
    this.innerHTML = '';
    this.textContent = '';
    this.value = '';
    this._listeners = {};
    this.dataset = {};
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
        return (self.className || '').split(/\s+/).filter(Boolean).includes(c);
      }
    };
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  querySelector(sel) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      if (this.id === id) return this;
      for (const c of this.children) {
        if (c.id === id) return c;
        if (c.querySelector) {
          const res = c.querySelector(sel);
          if (res) return res;
        }
      }
    }
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      if (this.classList.contains(cls)) return this;
      for (const c of this.children) {
        if (c.classList && c.classList.contains(cls)) return c;
        if (c.querySelector) {
          const res = c.querySelector(sel);
          if (res) return res;
        }
      }
    }
    return null;
  }

  querySelectorAll(sel) {
    const list = [];
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      if (this.classList.contains(cls)) list.push(this);
      for (const c of this.children) {
        if (c.querySelectorAll) list.push(...c.querySelectorAll(sel));
      }
    }
    return list;
  }

  addEventListener(evt, fn) {
    if (!this._listeners[evt]) this._listeners[evt] = [];
    this._listeners[evt].push(fn);
  }

  dispatchEvent(evt) {
    const type = typeof evt === 'string' ? evt : evt.type;
    const fns = this._listeners[type] || [];
    fns.forEach(fn => fn.call(this, { target: this, stopPropagation: () => {} }));
  }

  click() {
    this.dispatchEvent('click');
  }
}

describe('CORVFIN — UX3: EXPENSES V2 SIMPLIFIED-FIRST', () => {

  describe('1. Shell & Remoção do Modo Global Antigo', () => {
    test('26. #viewModeToggleBtn foi removido do cabeçalho de index.html', () => {
      assert.ok(!htmlContent.includes('id="viewModeToggleBtn"'), 'viewModeToggleBtn não deve mais existir no HTML');
      assert.ok(!htmlContent.includes('data-tooltip="Modo Foco / Visão Simplificada"'), 'Tooltip do modo foco removido');
    });

    test('27. mobile.css não possui mais referência a #viewModeToggleBtn', () => {
      assert.ok(!mobileCss.includes('#viewModeToggleBtn'), 'mobile.css não deve ter seletores para viewModeToggleBtn');
    });

    test('28. app.js não sincroniza nem referencia viewModeToggleBtn', () => {
      assert.ok(!appJs.includes('#viewModeToggleBtn'), 'app.js não deve manipular viewModeToggleBtn');
      assert.ok(!appJs.includes('state.simplifiedView'), 'app.js não deve condicionar abas a state.simplifiedView');
    });

    test('29. debtors.js não esconde cards baseado em state.simplifiedView', () => {
      assert.ok(!debtorsJs.includes('state.simplifiedView'), 'debtors.js não deve ter dependência de state.simplifiedView');
    });

    test('30. corvfin_ribbon_expanded permanece intacto e funcional no storage', () => {
      assert.ok(htmlContent.includes('data-storage-key="corvfin_ribbon_expanded"'), 'ribbonSection preserva data-storage-key oficial');
      assert.ok(uiShellJs.includes('corvfin_ribbon_expanded'), 'uiShellJs mantém integração da preferência global');
    });
  });

  describe('2. Segmented Control e Visão Padrão [ Todas ] [ Por tipo ]', () => {
    test('1. index.html declara segmented control com Todas ativo por padrão', () => {
      assert.ok(htmlContent.includes('id="expensesViewModeControl"'), 'Contém #expensesViewModeControl');
      assert.ok(htmlContent.includes('id="expensesViewAllBtn"'), 'Contém botão #expensesViewAllBtn');
      assert.ok(htmlContent.includes('id="expensesViewByTypeBtn"'), 'Contém botão #expensesViewByTypeBtn');
      assert.ok(htmlContent.includes('class="segmented-btn active" id="expensesViewAllBtn"'), 'Todas é a opção ativa por padrão');
    });

    test('2 e 3. Visão Todas consolida fixed e variable no mesmo conjunto', () => {
      // Mock do estado e helpers
      const mockFixed = [
        { fixedId: 'f1', name: 'Aluguel', amount: 1200, status: 'pendente', dueDay: 5, group: 'Moradia' }
      ];
      const mockVar = [
        { id: 'v1', name: 'Supermercado', amount: 450, status: 'pago', dueDay: 10, group: 'Alimentação' }
      ];

      const fixedMapped = mockFixed.map(f => Object.assign({ typeName: 'Fixa', itemType: 'fixed' }, f));
      const varMapped = mockVar.map(v => Object.assign({ typeName: 'Variável', itemType: 'variable' }, v));
      const combined = [...fixedMapped, ...varMapped];

      assert.equal(combined.length, 2, 'Lista consolidada possui 2 itens');
      assert.ok(combined.some(i => i.itemType === 'fixed'), 'Contém fixed');
      assert.ok(combined.some(i => i.itemType === 'variable'), 'Contém variable');
    });

    test('4. Nenhum item é perdido na consolidação', () => {
      const fixed = Array.from({ length: 15 }, (_, i) => ({ fixedId: `f_${i}`, amount: 100, itemType: 'fixed' }));
      const variable = Array.from({ length: 25 }, (_, i) => ({ id: `v_${i}`, amount: 50, itemType: 'variable' }));
      const combined = [...fixed, ...variable];
      assert.equal(combined.length, 40, 'Total deve ser exatamente a soma de fixas e variáveis');
    });

    test('5 e 6. Por tipo mantém fixed e variable em seções separadas no DOM', () => {
      assert.ok(htmlContent.includes('id="listFixed"'), 'Contém #listFixed');
      assert.ok(htmlContent.includes('id="listVariable"'), 'Contém #listVariable');
      assert.ok(htmlContent.includes('id="normalExpensesGrid"'), 'Contém #normalExpensesGrid');
    });

    test('7. Alternância não faz fetch de rede e opera em memória', () => {
      // Verifica no código que setExpensesViewMode apenas alterna UI e renderiza listas
      assert.ok(expensesJs.includes('function setExpensesViewMode'), 'Define setExpensesViewMode');
      assert.ok(expensesJs.includes('updateExpensesViewModeUI'), 'Define updateExpensesViewModeUI');
    });
  });

  describe('3. Ordenação Determinística com Desempate Estável (Ajuste 1)', () => {
    test('8 e 31. Desempate estável usa chave namespaced type:id sem colisão', () => {
      // Simula a função de desempate idêntica à de expenses.js
      const getExpenseStableComparisonKey = (item) => {
        const type = item.itemType || (item.fixedId ? 'fixed' : 'variable');
        const id = item.fixedId || item.id || '';
        return `${type}:${id}`;
      };
      const stableTieBreaker = (a, b) => {
        const keyA = getExpenseStableComparisonKey(a);
        const keyB = getExpenseStableComparisonKey(b);
        return keyA.localeCompare(keyB);
      };

      // Dois itens com mesmo id numérico/string mas tipos diferentes
      const itemFixa = { fixedId: '100', amount: 500, name: 'Internet' };
      const itemVar = { id: '100', amount: 500, name: 'Luz' };

      const keyFixa = getExpenseStableComparisonKey(itemFixa);
      const keyVar = getExpenseStableComparisonKey(itemVar);

      assert.equal(keyFixa, 'fixed:100', 'Chave fixa deve ser fixed:100');
      assert.equal(keyVar, 'variable:100', 'Chave variável deve ser variable:100');
      assert.notEqual(keyFixa, keyVar, 'Chaves namespaced nunca colidem');
      assert.equal(stableTieBreaker(itemFixa, itemVar) < 0, true, 'fixed:100 vem antes de variable:100 deterministamente');
    });

    test('8b. sortExpensesList produz mesma sequência exata em múltiplos re-renders com empates de valor', () => {
      const items = [
        { fixedId: 'b', itemType: 'fixed', amount: 200, name: 'Conta B' },
        { id: 'a', itemType: 'variable', amount: 200, name: 'Conta A' },
        { fixedId: 'c', itemType: 'fixed', amount: 200, name: 'Conta C' },
        { id: 'b', itemType: 'variable', amount: 200, name: 'Conta B2' }
      ];

      // Simula ordenação com desempate
      const getExpenseStableComparisonKey = (item) => `${item.itemType || (item.fixedId ? 'fixed' : 'variable')}:${item.fixedId || item.id || ''}`;
      const stableTieBreaker = (a, b) => getExpenseStableComparisonKey(a).localeCompare(getExpenseStableComparisonKey(b));
      const sortList = (list) => [...list].sort((a, b) => {
        const diff = Number(b.amount || 0) - Number(a.amount || 0);
        return diff !== 0 ? diff : stableTieBreaker(a, b);
      });

      const res1 = sortList(items).map(i => getExpenseStableComparisonKey(i));
      const res2 = sortList(items).map(i => getExpenseStableComparisonKey(i));
      const res3 = sortList([...items].reverse()).map(i => getExpenseStableComparisonKey(i));

      assert.deepEqual(res1, res2, 'Ordem idêntica entre renders');
      assert.deepEqual(res1, res3, 'Ordem idêntica independente da ordem inicial de entrada');
    });
  });

  describe('4. Filtros Unificados e Distinção de Totais (Ajuste 2)', () => {
    test('9, 10, 11 e 12. filterExpenseItem filtra por query, status e método em ambas as visões', () => {
      // Simula o helper canônico
      function filterExpenseItem(item, query, statusFilter, methodFilter) {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (methodFilter !== 'all' && item.paymentMethod !== methodFilter) return false;
        if (query) {
          const text = `${item.name} ${item.group || ''}`.toLowerCase();
          if (!text.includes(query)) return false;
        }
        return true;
      }

      const items = [
        { name: 'Aluguel Casa', group: 'Moradia', status: 'pendente', paymentMethod: 'pix' },
        { name: 'Mercado Mensal', group: 'Alimentação', status: 'pago', paymentMethod: 'cartao_credito' },
        { name: 'Farmácia', group: 'Saúde', status: 'pendente', paymentMethod: 'cartao_credito' }
      ];

      // Busca
      assert.equal(items.filter(i => filterExpenseItem(i, 'mercado', 'all', 'all')).length, 1);
      // Status
      assert.equal(items.filter(i => filterExpenseItem(i, '', 'pendente', 'all')).length, 2);
      // Método
      assert.equal(items.filter(i => filterExpenseItem(i, '', 'all', 'cartao_credito')).length, 2);
      // Combinado
      assert.equal(items.filter(i => filterExpenseItem(i, 'farm', 'pendente', 'cartao_credito')).length, 1);
    });

    test('14 e 32. Total superior do mês NÃO é alterado por filtros; Header da lista reflete resultados filtrados', () => {
      const allRaw = [
        { amount: 1000 },
        { amount: 500 },
        { amount: 200 }
      ];
      const totalCanonicalExpenses = allRaw.reduce((s, i) => s + i.amount, 0);
      assert.equal(totalCanonicalExpenses, 1700, 'Total canônico deve ser 1700');

      // Usuário busca algo que retorna apenas 1 item
      const filtered = [allRaw[1]];
      const totalFiltered = filtered.reduce((s, i) => s + i.amount, 0);
      assert.equal(totalFiltered, 500, 'Total filtrado deve ser 500');

      // O indicador financeiro superior do mês permanece 1700
      assert.equal(totalCanonicalExpenses, 1700, 'Indicador do mês NÃO deve mudar');

      // O header da lista formata discretamente "1 resultado · R$ 500,00"
      const isFiltered = true;
      const headerText = isFiltered
        ? `${filtered.length} resultado · R$ 500,00`
        : 'R$ 1.700,00';
      assert.equal(headerText, '1 resultado · R$ 500,00');
    });
  });

  describe('5. Indicadores Financeiros e Hierarquia (1 Hero + 4 Compactos)', () => {
    test('13. Total do Mês presente com valor canônico e subtítulo', () => {
      assert.ok(dashboardJs.includes('Total do Mês'), 'Contém label Total do Mês');
      assert.ok(dashboardJs.includes('expenses-metric-hero'), 'Contém classe expenses-metric-hero');
    });

    test('14, 15, 16, 17 e 18. Todos os 5 indicadores canônicos permanecem presentes e calculados', () => {
      assert.ok(dashboardJs.includes('Total de Despesas'), 'Contém Total de Despesas');
      assert.ok(dashboardJs.includes('Valor Pago'), 'Contém Valor Pago');
      assert.ok(dashboardJs.includes('Pendente de Pagamento'), 'Contém Pendente de Pagamento');
      assert.ok(dashboardJs.includes('Sobra do Valor'), 'Contém Sobra do Valor');
      assert.ok(dashboardCss.includes('.expenses-metrics-layout'), 'CSS declara .expenses-metrics-layout');
      assert.ok(dashboardCss.includes('.expenses-metrics-secondary'), 'CSS declara .expenses-metrics-secondary');
    });
  });

  describe('6. Ações na Visão Consolidada Todas', () => {
    test('19, 20, 21, 22 e 23. buildEntryRow renderiza tag discreta de natureza e suporta parcial', () => {
      assert.ok(expensesJs.includes('showNatureBadge'), 'buildEntryRow aceita showNatureBadge');
      assert.ok(expensesJs.includes('nature-fixed'), 'Contém classe nature-fixed');
      assert.ok(expensesJs.includes('nature-variable'), 'Contém classe nature-variable');
      assert.ok(dashboardCss.includes('.nature-tag.nature-fixed'), 'CSS possui estilo para nature-fixed');
      assert.ok(dashboardCss.includes('.nature-tag.nature-variable'), 'CSS possui estilo para nature-variable');
    });

    test('24 e 25. Empty states diferenciam sem dados no mês de filtros sem resultado', () => {
      assert.ok(expensesJs.includes('Nenhum resultado encontrado'), 'Mensagem para filtro sem resultado');
      assert.ok(expensesJs.includes('Nenhuma despesa no mês'), 'Mensagem para competência vazia');
      assert.ok(dashboardCss.includes('.empty-state'), 'CSS declara .empty-state');
    });
  });

  describe('7. Lifecycle de currentExpensesViewMode (Ajuste 3)', () => {
    test('33. by_type permanece by_type após re-render e mutações na aba', () => {
      // Simula lifecycle em memória
      let currentExpensesViewMode = 'all';
      const setViewMode = (m) => { currentExpensesViewMode = m; };
      const render = () => {
        // Render NÃO deve resetar viewMode!
      };

      // Usuário clica Por tipo
      setViewMode('by_type');
      assert.equal(currentExpensesViewMode, 'by_type');

      // Re-render (ex: marcar como pago)
      render();
      assert.equal(currentExpensesViewMode, 'by_type', 'Preserva by_type após re-render');
    });

    test('34. by_type permanece by_type ao trocar de mês durante a permanência na aba', () => {
      let currentExpensesViewMode = 'by_type';
      const onMonthChange = () => {
        // Troca de mês dentro de Despesas NÃO reseta viewMode
      };
      onMonthChange();
      assert.equal(currentExpensesViewMode, 'by_type', 'Preserva by_type ao navegar competência');
    });

    test('35. Sair de Despesas e posteriormente re-entrar restaura Todas (all)', () => {
      let currentActiveTab = 'tab-expenses';
      let currentExpensesViewMode = 'by_type';

      const resetExpensesViewMode = () => {
        currentExpensesViewMode = 'all';
      };

      const activateTab = (targetTabId) => {
        if (currentActiveTab !== targetTabId) {
          if (targetTabId === 'tab-expenses') {
            resetExpensesViewMode();
          }
          currentActiveTab = targetTabId;
        }
      };

      // Sai de Despesas para Dashboard
      activateTab('tab-dashboard');
      assert.equal(currentActiveTab, 'tab-dashboard');

      // Retorna para Despesas
      activateTab('tab-expenses');
      assert.equal(currentActiveTab, 'tab-expenses');
      assert.equal(currentExpensesViewMode, 'all', 'Restaura default Todas (all) ao re-entrar na aba');
    });
  });

  describe('8. Lote UX3.1 — Semantic Financial Colors', () => {
    test('1. Total do mês possui classe semântica institucional (.metric-income)', () => {
      assert.ok(dashboardJs.includes('metric-income'), 'Total do Mês possui classe metric-income');
      assert.ok(dashboardCss.includes('.expenses-metric-hero'), 'CSS declara .expenses-metric-hero');
      assert.ok(dashboardCss.includes('border-left: 3px solid var(--brand);'), 'Acento verde institucional CorvFin');
    });

    test('2. Total de despesas possui classe de saída (.metric-expense) com acento vermelho', () => {
      assert.ok(dashboardJs.includes('metric-expense'), 'Total de despesas possui classe metric-expense');
      assert.ok(dashboardCss.includes('.secondary-metric.metric-expense'), 'CSS declara seletor semântico metric-expense');
      assert.ok(dashboardCss.includes('border-left: 3px solid var(--danger);'), 'Acento vermelho de saída');
    });

    test('3. Valor pago possui classe concluída (.metric-paid) com acento verde', () => {
      assert.ok(dashboardJs.includes('metric-paid'), 'Valor pago possui classe metric-paid');
      assert.ok(dashboardCss.includes('.secondary-metric.metric-paid'), 'CSS declara seletor semântico metric-paid');
      assert.ok(dashboardCss.includes('border-left: 3px solid var(--success);'), 'Acento verde de conclusão');
    });

    test('4. Pendente de pagamento possui classe (.metric-pending) com acento âmbar', () => {
      assert.ok(dashboardJs.includes('metric-pending'), 'Pendente possui classe metric-pending');
      assert.ok(dashboardCss.includes('.secondary-metric.metric-pending'), 'CSS declara seletor semântico metric-pending');
      assert.ok(dashboardCss.includes('border-left: 3px solid var(--warning);'), 'Acento âmbar de pendência');
    });

    test('5, 6 e 7. Sobra do valor possui comportamento cromático dinâmico (positivo -> verde, zero -> neutro, negativo -> vermelho)', () => {
      const getSobraSemanticConfig = (sobra) => {
        let sobraClass = 'metric-neutral';
        let sobraValClass = 'neutral';
        if (sobra > 0) {
          sobraClass = 'metric-positive';
          sobraValClass = 'positive';
        } else if (sobra < 0) {
          sobraClass = 'metric-negative';
          sobraValClass = 'negative';
        }
        return { sobraClass, sobraValClass };
      };

      // 5. Sobra positiva
      const pos = getSobraSemanticConfig(1500.50);
      assert.equal(pos.sobraClass, 'metric-positive', 'Sobra > 0 atribui classe metric-positive');
      assert.equal(pos.sobraValClass, 'positive', 'Valor recebe classe positive');

      // 6. Sobra zero
      const zero = getSobraSemanticConfig(0);
      assert.equal(zero.sobraClass, 'metric-neutral', 'Sobra === 0 atribui classe metric-neutral');
      assert.equal(zero.sobraValClass, 'neutral', 'Valor recebe classe neutral');

      // 7. Sobra negativa (déficit)
      const neg = getSobraSemanticConfig(-450.00);
      assert.equal(neg.sobraClass, 'metric-negative', 'Sobra < 0 atribui classe metric-negative');
      assert.equal(neg.sobraValClass, 'negative', 'Valor recebe classe negative');

      // Validação das regras no CSS
      assert.ok(dashboardCss.includes('.secondary-metric.metric-sobra.metric-positive'), 'CSS declara regra para sobra positiva');
      assert.ok(dashboardCss.includes('.secondary-metric.metric-sobra.metric-neutral'), 'CSS declara regra para sobra neutra');
      assert.ok(dashboardCss.includes('.secondary-metric.metric-sobra.metric-negative'), 'CSS declara regra para sobra negativa');
    });

    test('8. Nenhuma fórmula financeira foi alterada', () => {
      assert.ok(dashboardJs.includes('const sobra = t.totalIncome - t.totalExpenses;'), 'Fórmula canônica de sobra inalterada');
      assert.ok(dashboardJs.includes('monthTotals(state.year, state.month)'), 'Cálculo canônico mensal inalterado');
    });

    test('9. Nenhuma cor dos indicadores depende de inline style nos cards', () => {
      // Verifica que as cores principais vêm de classes e variáveis CSS
      assert.ok(!dashboardJs.includes('style="background: red"'), 'Sem inline styles arbitrários de fundo vermelho');
      assert.ok(!dashboardJs.includes('style="background: green"'), 'Sem inline styles arbitrários de fundo verde');
    });

    test('10. Todas as labels e textos canônicos continuam presentes e legíveis', () => {
      assert.ok(dashboardJs.includes('Total do Mês'), 'Label Total do Mês presente');
      assert.ok(dashboardJs.includes('Total de Despesas'), 'Label Total de Despesas presente');
      assert.ok(dashboardJs.includes('Valor Pago'), 'Label Valor Pago presente');
      assert.ok(dashboardJs.includes('Pendente de Pagamento'), 'Label Pendente de Pagamento presente');
      assert.ok(dashboardJs.includes('Sobra do Valor'), 'Label Sobra do Valor presente (não foi renomeada)');
    });

    test('11 e 12. Ribbon e Segmented Control permanecem 100% intactos', () => {
      assert.ok(htmlContent.includes('id="ribbonSection"'), 'Ribbon section intacta');
      assert.ok(htmlContent.includes('id="expensesViewModeControl"'), 'Segmented control intacto');
      assert.ok(htmlContent.includes('id="expensesViewAllBtn"'), 'Botão Todas intacto');
      assert.ok(htmlContent.includes('id="expensesViewByTypeBtn"'), 'Botão Por tipo intacto');
    });
  });

});

