/**
 * Finanças Pro - Módulo de Lista de Compras & Planejamento (shopping.js)
 * Vanilla JS Architecture - Apuração & Dashboards Analíticos
 */

(function () {
  "use strict";

  const CATEGORY_COLORS = {
    'Proteína': '#ef233c',
    'Carboidrato': '#f59e0b',
    'Legumes': '#10b981',
    'Frutas': '#f43f5e',
    'Tempero': '#eab308',
    'Complemento': '#3b82f6',
    'Extras': '#8d99ae'
  };

  const CATEGORIES = ['Proteína', 'Carboidrato', 'Legumes', 'Frutas', 'Tempero', 'Complemento', 'Extras'];

  const UNIT_LABELS = {
    'un': 'Valor de uma unidade (R$):',
    'kg': 'Valor por kg (R$):',
    'g': 'Valor por g (R$):',
    'L': 'Valor por litro (R$):',
    'ml': 'Valor por ml (R$):',
    'pct': 'Valor de um pacote (R$):',
    'cx': 'Valor de uma caixa (R$):'
  };

  let activeShoppingListId = null;
  let pendingCheckItemId = null;
  let isDashboardCollapsed = false;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function formatCurrency(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function getActiveList() {
    const state = getState();
    if (!state.shoppingLists || !Array.isArray(state.shoppingLists)) {
      state.shoppingLists = [];
    }
    return state.shoppingLists.find(l => l.id === activeShoppingListId) || null;
  }

  // --- HISTÓRICO DE PREÇOS E ECONOMIA ---

  /**
   * Obtém histórico de preços unitários de um item a partir de outras listas no state
   */
  function getShoppingPriceHistory(itemName, itemUnit, currentListId) {
    const state = getState();
    const lists = state.shoppingLists || [];
    const normalizedTarget = (itemName || '').trim().toLowerCase();
    if (!normalizedTarget) return null;

    let pastPrices = [];

    lists.forEach(l => {
      if (l.id === currentListId) return; // ignora a lista atual
      (l.items || []).forEach(it => {
        const normName = (it.name || '').trim().toLowerCase();
        if (normName === normalizedTarget && it.is_checked) {
          const qty = Number(it.quantity || 1);
          const rawPrice = Number(it.price || 0);
          const uPrice = it.unitPrice != null ? Number(it.unitPrice) : (qty > 0 ? rawPrice / qty : rawPrice);

          if (uPrice > 0) {
            // Verifica compatibilidade estrita de unidade
            const pastUnit = (it.unit || 'un').toLowerCase();
            const targetUnit = (itemUnit || 'un').toLowerCase();
            if (pastUnit === targetUnit) {
              pastPrices.push({
                listName: l.name,
                unitPrice: uPrice,
                quantity: qty,
                unit: it.unit || 'un',
                date: it.createdAt || l.createdAt
              });
            }
          }
        }
      });
    });

    if (pastPrices.length === 0) return null;

    const avgUnitPrice = pastPrices.reduce((acc, p) => acc + p.unitPrice, 0) / pastPrices.length;
    const lowestUnitPrice = Math.min(...pastPrices.map(p => p.unitPrice));
    const highestUnitPrice = Math.max(...pastPrices.map(p => p.unitPrice));
    const lastPurchase = pastPrices[pastPrices.length - 1];

    return {
      count: pastPrices.length,
      avgUnitPrice: Math.round(avgUnitPrice * 100) / 100,
      lowestUnitPrice,
      highestUnitPrice,
      lastUnitPrice: lastPurchase.unitPrice,
      unit: itemUnit || 'un'
    };
  }

  /**
   * Calcula economia ou aumento de um item comprado em relação ao histórico de preço unitário
   */
  function calculateItemEconomy(item, currentListId) {
    if (!item.is_checked) return null;
    const qty = Number(item.quantity || 1);
    const rawPrice = Number(item.price || 0);
    const curUnitPrice = item.unitPrice != null ? Number(item.unitPrice) : (qty > 0 ? rawPrice / qty : rawPrice);

    if (curUnitPrice <= 0 || qty <= 0) return null;

    const history = getShoppingPriceHistory(item.name, item.unit || 'un', currentListId);
    if (!history) return null;

    const diffPerUnit = history.avgUnitPrice - curUnitPrice;
    const totalDiff = Math.round(diffPerUnit * qty * 100) / 100;

    return {
      curUnitPrice,
      avgUnitPrice: history.avgUnitPrice,
      diffPerUnit,
      totalDiff,
      isSavings: totalDiff > 0.01,
      isIncrease: totalDiff < -0.01,
      historyCount: history.count
    };
  }

  // --- CÁLCULO DE KPIs DA LISTA (ESTILO APURAÇÃO) ---

  function getShoppingListMetrics(list) {
    const items = list.items || [];
    const checkedItems = items.filter(i => i.is_checked);
    const totalCost = checkedItems.reduce((acc, i) => acc + Number(i.price || 0), 0);
    const totalChecked = checkedItems.length;
    const percent = items.length > 0 ? Math.round((totalChecked / items.length) * 100) : 0;

    const avgTicket = totalChecked > 0 ? totalCost / totalChecked : 0;

    let maxItem = null;
    checkedItems.forEach(i => {
      const p = Number(i.price || 0);
      if (!maxItem || p > Number(maxItem.price || 0)) {
        maxItem = i;
      }
    });

    const catTotals = {};
    checkedItems.forEach(i => {
      const c = i.category || 'Extras';
      catTotals[c] = (catTotals[c] || 0) + Number(i.price || 0);
    });

    let topCategory = null;
    let topCategorySpent = 0;
    Object.entries(catTotals).forEach(([cat, spent]) => {
      if (spent > topCategorySpent) {
        topCategory = cat;
        topCategorySpent = spent;
      }
    });

    // Economia e Aumentos consolidados
    let totalSavings = 0;
    let totalIncrease = 0;

    checkedItems.forEach(i => {
      const econ = calculateItemEconomy(i, list.id);
      if (econ) {
        if (econ.isSavings) totalSavings += econ.totalDiff;
        else if (econ.isIncrease) totalIncrease += Math.abs(econ.totalDiff);
      }
    });

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      totalChecked,
      totalItems: items.length,
      percent,
      avgTicket: Math.round(avgTicket * 100) / 100,
      maxItemName: maxItem ? maxItem.name : null,
      maxItemPrice: maxItem ? Number(maxItem.price || 0) : 0,
      topCategory,
      topCategorySpent: Math.round(topCategorySpent * 100) / 100,
      catTotals,
      totalSavings: Math.round(totalSavings * 100) / 100,
      totalIncrease: Math.round(totalIncrease * 100) / 100
    };
  }

  // --- CRUD LISTAS ---

  function createShoppingList(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      if (typeof notify === 'function') notify('Informe o nome da lista de compras.', 'error');
      return;
    }
    const state = getState();
    state.shoppingLists = state.shoppingLists || [];
    const newList = {
      id: typeof uid === 'function' ? uid() : 'list_' + Math.random().toString(36).substr(2, 9),
      name: trimmed,
      createdAt: new Date().toISOString(),
      items: []
    };
    state.shoppingLists.push(newList);
    activeShoppingListId = newList.id;
    saveState();
    renderShoppingTab();
    if (typeof notify === 'function') notify(`Lista "${trimmed}" criada com sucesso!`, 'success');
  }

  function deleteShoppingList(listId) {
    const state = getState();
    state.shoppingLists = state.shoppingLists || [];
    const list = state.shoppingLists.find(l => l.id === listId);
    if (!list) return;

    if (confirm(`Deseja realmente excluir a lista "${list.name}" e todos os seus itens?`)) {
      state.shoppingLists = state.shoppingLists.filter(l => l.id !== listId);
      if (activeShoppingListId === listId) {
        activeShoppingListId = null;
      }
      saveState();
      renderShoppingTab();
      if (typeof notify === 'function') notify('Lista de compras excluída!', 'info');
    }
  }

  function editShoppingListName(listId) {
    const state = getState();
    const list = (state.shoppingLists || []).find(l => l.id === listId);
    if (!list) return;

    const newName = prompt('Editar nome da lista:', list.name);
    if (newName && newName.trim() && newName.trim() !== list.name) {
      list.name = newName.trim();
      saveState();
      renderShoppingTab();
      if (typeof notify === 'function') notify('Nome da lista atualizado!', 'success');
    }
  }

  function openShoppingList(listId) {
    activeShoppingListId = listId;
    renderShoppingTab();
  }

  function closeShoppingList() {
    activeShoppingListId = null;
    renderShoppingTab();
  }

  // --- CRUD ITENS ---

  function addShoppingItem(name, category) {
    const list = getActiveList();
    if (!list) return;

    const trimmed = (name || '').trim();
    if (!trimmed) {
      if (typeof notify === 'function') notify('Informe o nome do item a comprar.', 'error');
      return;
    }

    list.items = list.items || [];
    const newItem = {
      id: typeof uid === 'function' ? uid() : 'item_' + Math.random().toString(36).substr(2, 9),
      name: trimmed,
      category: category || 'Extras',
      is_checked: false,
      quantity: 1,
      unit: 'un',
      unitPrice: 0,
      price: 0,
      createdAt: new Date().toISOString()
    };

    list.items.push(newItem);
    saveState();
    renderShoppingTab();
    if (typeof notify === 'function') notify(`"${trimmed}" adicionado à lista!`, 'success');
  }

  function editShoppingItemName(itemId) {
    const list = getActiveList();
    if (!list) return;
    const item = (list.items || []).find(i => i.id === itemId);
    if (!item) return;

    const newName = prompt('Editar nome do produto:', item.name);
    if (newName && newName.trim() && newName.trim() !== item.name) {
      item.name = newName.trim();
      saveState();
      renderShoppingTab();
      if (typeof notify === 'function') notify('Item atualizado!', 'success');
    }
  }

  function deleteShoppingItem(itemId) {
    const list = getActiveList();
    if (!list) return;

    list.items = (list.items || []).filter(i => i.id !== itemId);
    saveState();
    renderShoppingTab();
    if (typeof notify === 'function') notify('Item removido da lista!', 'info');
  }

  function uncheckShoppingItem(itemId) {
    const list = getActiveList();
    if (!list) return;
    const item = (list.items || []).find(i => i.id === itemId);
    if (!item) return;

    item.is_checked = false;
    item.unitPrice = 0;
    item.price = 0;
    saveState();
    renderShoppingTab();
  }

  // --- MODAL DE PREÇO UNITÁRIO / COMPRA ---

  function updatePriceModalLabel() {
    const unit = $('#shoppingModalUnit')?.value || 'un';
    const labelEl = $('#shoppingModalPriceLabel');
    if (labelEl) {
      labelEl.textContent = UNIT_LABELS[unit] || `Valor por ${unit} (R$):`;
    }
  }

  function openPriceModal(itemId) {
    const list = getActiveList();
    if (!list) return;
    const item = (list.items || []).find(i => i.id === itemId);
    if (!item) return;

    pendingCheckItemId = itemId;

    const modal = $('#shoppingPriceModal');
    const nameEl = $('#shoppingModalItemName');
    const qtyEl = $('#shoppingModalQty');
    const unitEl = $('#shoppingModalUnit');
    const priceEl = $('#shoppingModalPrice');
    const histHintEl = $('#shoppingModalHistoryHint');

    if (nameEl) nameEl.textContent = item.name;
    if (qtyEl) qtyEl.value = item.quantity || 1;
    if (unitEl) unitEl.value = item.unit || 'un';

    // Preenche com o unitPrice existente (ou deriva de price/quantity se faltar)
    const existingUnitPrice = item.unitPrice != null && Number(item.unitPrice) > 0
      ? item.unitPrice
      : (item.quantity > 0 && Number(item.price) > 0 ? Number(item.price) / Number(item.quantity) : '');

    if (priceEl) priceEl.value = existingUnitPrice;
    updatePriceModalLabel();

    // Referência Histórica do Preço Unitário
    const history = getShoppingPriceHistory(item.name, item.unit || 'un', list.id);
    if (histHintEl) {
      if (history && history.avgUnitPrice > 0) {
        histHintEl.style.display = 'block';
        histHintEl.innerHTML = `
          <div style="display:flex; align-items:center; gap:6px;">
            <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:14px; height:14px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>Referência Histórica: média de <strong>${formatCurrency(history.avgUnitPrice)}/${history.unit}</strong> (${history.count} compras anteriores)</span>
          </div>
        `;
      } else {
        histHintEl.style.display = 'none';
      }
    }

    if (modal && typeof modal.showModal === 'function') {
      modal.showModal();
      setTimeout(() => {
        if (priceEl && typeof priceEl.focus === 'function') priceEl.focus();
      }, 80);
    }
  }

  function closePriceModal() {
    const modal = $('#shoppingPriceModal');
    if (modal && modal.open && typeof modal.close === 'function') {
      modal.close();
    }
    pendingCheckItemId = null;
  }

  function confirmPriceAndCheck() {
    if (!pendingCheckItemId) return;
    const list = getActiveList();
    if (!list) return;
    const item = (list.items || []).find(i => i.id === pendingCheckItemId);
    if (!item) return;

    const qty = Number($('#shoppingModalQty')?.value) || 1;
    const unit = $('#shoppingModalUnit')?.value || 'un';
    const unitPriceVal = Number($('#shoppingModalPrice')?.value) || 0;

    // REGRA DE NEGÓCIO CANÔNICA:
    // unitPrice = valor digitado no input
    // price = quantity * unitPrice (Total da compra)
    const calculatedTotal = Math.round(qty * unitPriceVal * 100) / 100;

    item.is_checked = true;
    item.quantity = qty;
    item.unit = unit;
    item.unitPrice = unitPriceVal;
    item.price = calculatedTotal;

    saveState();
    closePriceModal();
    renderShoppingTab();
    if (typeof notify === 'function') notify(`"${item.name}" adicionado ao carrinho por ${formatCurrency(calculatedTotal)}!`, 'success');
  }

  // --- RENDERIZAÇÃO DA ABA ---

  function renderShoppingTab() {
    const state = getState();
    state.shoppingLists = state.shoppingLists || [];

    const container = $('#tab-shopping');
    if (!container) return;

    if (!activeShoppingListId) {
      renderListsOverview(container, state.shoppingLists);
    } else {
      const activeList = state.shoppingLists.find(l => l.id === activeShoppingListId);
      if (!activeList) {
        activeShoppingListId = null;
        renderListsOverview(container, state.shoppingLists);
        return;
      }
      renderSingleListDetail(container, activeList);
    }
  }

  // Visualização 1: Visão Geral de Todas as Listas
  function renderListsOverview(container, lists) {
    let html = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
        <div>
          <h2 style="margin:0; font-size:1.35rem; font-weight:800; color:var(--text); display:flex; align-items:center; gap:8px;">
            <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:24px; height:24px;">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            Suas Listas de Compras
          </h2>
          <p style="margin:4px 0 0; color:var(--muted); font-size:0.86rem;">Gerencie suas compras com apuração analítica, controle de preços unitários e evolução de gastos.</p>
        </div>
      </div>

      <!-- FORMULÁRIO DE NOVA LISTA -->
      <div class="card section-card full-width" style="padding:16px 20px; margin-bottom:20px; border-radius:14px;">
        <form id="formNewShoppingList" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <input type="text" id="inputNewListName" placeholder="Ex: Compras do Mês, Churrasco, Feira..." required
            style="flex:1; min-width:240px; padding:10px 14px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.92rem;">
          <button type="submit" class="btn primary" style="border-radius:10px; font-weight:800; display:flex; align-items:center; gap:6px;">
            <svg class="svg-icon" viewBox="0 0 24 24" style="width:16px; height:16px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            + Criar Nova Lista
          </button>
        </form>
      </div>

      <!-- GRID DE LISTAS -->
      <div id="shoppingListsGrid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
    `;

    if (lists.length === 0) {
      html += `
        <div style="grid-column: 1 / -1; padding:48px 20px; text-align:center; background:var(--surface); border-radius:14px; border:1px solid var(--line);">
          <div style="width:56px; height:56px; border-radius:50%; background:var(--brand-soft, rgba(31,122,92,0.12)); display:inline-flex; align-items:center; justify-content:center; margin-bottom:12px;">
            <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:28px; height:28px;">
              <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
          </div>
          <h3 style="font-size:1.1rem; font-weight:800; color:var(--text); margin:0 0 6px;">Nenhuma lista de compras cadastrada</h3>
          <p style="color:var(--muted); font-size:0.86rem; margin:0 auto; max-width:360px;">Crie sua primeira lista no campo acima para organizar seus itens e controlar os valores gastos.</p>
        </div>
      `;
    } else {
      lists.forEach(l => {
        const metrics = getShoppingListMetrics(l);

        html += `
          <div class="card section-card" style="padding:18px 20px; border-radius:14px; display:flex; flex-direction:column; justify-content:space-between; transition:transform 0.15s ease, border-color 0.15s ease; border:1px solid var(--line);">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <h3 style="margin:0; font-size:1.12rem; font-weight:800; color:var(--text); cursor:pointer;" data-open-list="${l.id}">
                  ${escapeHtml(l.name)}
                </h3>
                <div style="display:flex; gap:6px;">
                  <button type="button" class="icon-btn small" data-edit-list="${l.id}" title="Renomear Lista">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="width:13px; height:13px;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  </button>
                  <button type="button" class="icon-btn small" data-del-list="${l.id}" title="Excluir Lista" style="color:var(--danger);">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="width:13px; height:13px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>

              <div style="font-size:0.82rem; color:var(--muted); margin-bottom:14px;">
                ${metrics.totalChecked} de ${metrics.totalItems} itens comprados (${metrics.percent}%)
              </div>

              <div style="background:var(--surface-2); border-radius:8px; height:6px; overflow:hidden; margin-bottom:16px;">
                <div style="background:var(--brand); height:100%; width:${metrics.percent}%; transition:width 0.3s ease;"></div>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--line); padding-top:12px; margin-top:6px;">
              <div>
                <span style="font-size:0.72rem; color:var(--muted); font-weight:800; text-transform:uppercase;">Total no Carrinho</span>
                <div style="font-size:1.25rem; font-weight:850; color:var(--brand); line-height:1.2;">${formatCurrency(metrics.totalCost)}</div>
              </div>
              <button type="button" class="btn primary small" data-open-list="${l.id}" style="border-radius:8px; font-weight:700;">
                Abrir Lista →
              </button>
            </div>
          </div>
        `;
      });
    }

    html += `</div>`;
    container.innerHTML = html;

    // Listeners do Overview
    $('#formNewShoppingList')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = $('#inputNewListName')?.value;
      createShoppingList(val);
    });

    container.querySelectorAll('[data-open-list]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-open-list');
        openShoppingList(id);
      });
    });

    container.querySelectorAll('[data-edit-list]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.getAttribute('data-edit-list');
        editShoppingListName(id);
      });
    });

    container.querySelectorAll('[data-del-list]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.getAttribute('data-del-list');
        deleteShoppingList(id);
      });
    });
  }

  // Visualização 2: Detalhes de Uma Lista Específica (Layout de Apuração)
  function renderSingleListDetail(container, list) {
    const items = list.items || [];
    const metrics = getShoppingListMetrics(list);
    const state = getState();
    const allLists = state.shoppingLists || [];

    // Geração do Card 1: Distribuição por Categoria
    let categoryBreakdownHtml = '';
    const activeCats = Object.entries(metrics.catTotals).filter(([_, val]) => val > 0).sort((a, b) => b[1] - a[1]);

    if (activeCats.length === 0) {
      categoryBreakdownHtml = `<div style="color:var(--muted); font-size:0.84rem; font-style:italic; padding:12px 0;">Nenhum item comprado registrado ainda nesta lista.</div>`;
    } else {
      activeCats.forEach(([cat, spent]) => {
        const catColor = CATEGORY_COLORS[cat] || '#8d99ae';
        const pctOfTotal = metrics.totalCost > 0 ? Math.round((spent / metrics.totalCost) * 100) : 0;

        categoryBreakdownHtml += `
          <div style="display:flex; flex-direction:column; gap:5px;">
            <div style="display:flex; justify-content:space-between; font-size:0.86rem; font-weight:750;">
              <span style="display:flex; align-items:center; gap:8px;">
                <span style="width:10px; height:10px; border-radius:50%; background:${catColor}; flex-shrink:0;"></span>
                ${escapeHtml(cat)}
              </span>
              <span style="font-feature-settings:'tnum';">${formatCurrency(spent)} <span style="font-size:0.78rem; color:var(--muted); font-weight:600;">(${pctOfTotal}%)</span></span>
            </div>
            <div style="background:var(--line); border-radius:6px; height:7px; overflow:hidden;">
              <div style="background:${catColor}; height:100%; width:${pctOfTotal}%; transition:width 0.3s ease;"></div>
            </div>
          </div>
        `;
      });
    }

    // Geração do Card 2: Histórico de Compras das Demais Listas
    let historyListsHtml = '';
    const otherLists = allLists.filter(l => l.id !== list.id);

    if (otherLists.length === 0) {
      historyListsHtml = `<div style="color:var(--muted); font-size:0.84rem; font-style:italic; padding:12px 0;">Nenhuma outra lista cadastrada para comparação histórica.</div>`;
    } else {
      historyListsHtml = otherLists.map(l => {
        const lMetrics = getShoppingListMetrics(l);
        const dateStr = l.createdAt ? new Date(l.createdAt).toLocaleDateString('pt-BR') : 'Data não informada';
        return `
          <div style="padding:10px 14px; border-radius:10px; background:var(--surface); border:1px solid var(--line); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:750; font-size:0.88rem; color:var(--text);">${escapeHtml(l.name)}</div>
              <div style="font-size:0.75rem; color:var(--muted);">${dateStr} • ${lMetrics.totalChecked} itens pegos</div>
            </div>
            <div style="font-weight:850; font-size:0.95rem; color:var(--brand);">
              ${formatCurrency(lMetrics.totalCost)}
            </div>
          </div>
        `;
      }).join('');
    }

    let html = `
      <!-- CABEÇALHO DA LISTA ATIVA -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; flex-wrap:wrap; gap:16px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <button type="button" class="btn soft" id="btnBackToShoppingLists" style="border-radius:10px; font-weight:750; display:flex; align-items:center; gap:6px;">
            ← Todas as Listas
          </button>
          <div>
            <h2 style="margin:0; font-size:1.35rem; font-weight:800; color:var(--text); display:flex; align-items:center; gap:8px;">
              ${escapeHtml(list.name)}
              <button type="button" class="icon-btn small" id="btnEditCurrentListName" title="Renomear Lista" style="display:inline-flex;">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:13px; height:13px;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              </button>
            </h2>
            <p style="margin:2px 0 0; color:var(--muted); font-size:0.84rem;">${metrics.totalChecked} de ${metrics.totalItems} itens marcados como comprados</p>
          </div>
        </div>

        <!-- RESUMO DO TOTAL NO CARRINHO -->
        <div class="card" style="padding:12px 20px; border-radius:14px; background:var(--surface); border:2px solid var(--brand); display:flex; align-items:center; gap:12px; min-width:210px; box-shadow:0 4px 12px rgba(0,0,0,0.04);">
          <div style="width:38px; height:38px; border-radius:10px; background:var(--brand-soft, rgba(31,122,92,0.12)); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:20px; height:20px; stroke-width:2.2;">
              <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
          </div>
          <div>
            <div style="font-size:0.70rem; color:var(--muted); font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">TOTAL NO CARRINHO</div>
            <div style="font-size:1.45rem; font-weight:850; color:var(--brand); line-height:1.2;">${formatCurrency(metrics.totalCost)}</div>
          </div>
        </div>
      </div>

      <!-- DASHBOARD RETRÁTIL DA LISTA (ESTRUTURA DE APURAÇÃO) -->
      <div class="card section-card full-width" style="padding:0; margin-bottom:22px; border-radius:14px; overflow:hidden; border:1px solid var(--line);">
        <div id="toggleShoppingDashboardBtn" style="display:flex; justify-content:space-between; align-items:center; padding:14px 20px; background:var(--surface-2); cursor:pointer; user-select:none;">
          <div style="display:flex; align-items:center; gap:10px; font-weight:800; font-size:0.95rem; color:var(--text);">
            <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:18px; height:18px;">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
            Dashboard da Lista & Apuração de Gastos
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:0.82rem; color:var(--muted); font-weight:600;">${metrics.totalChecked} de ${metrics.totalItems} comprados (${metrics.percent}%)</span>
            <svg class="svg-icon" id="shoppingDashChevron" viewBox="0 0 24 24" style="width:16px; height:16px; transition:transform 0.2s ease; ${isDashboardCollapsed ? 'transform:rotate(-90deg);' : ''}">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        <div id="shoppingDashboardBody" style="padding:20px; display:${isDashboardCollapsed ? 'none' : 'block'}; background:var(--surface);">
          <!-- GRID DE KPIS EM 2 COLUNAS (INSPIRADO NA APURAÇÃO) -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-bottom:22px;">
            <!-- LINHA 1 -->
            <div class="card" style="padding:18px 20px; background:var(--surface-2); border-radius:12px; border:1px solid var(--line);">
              <div style="font-size:0.74rem; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">TOTAL GASTO</div>
              <div class="value num" style="font-size:1.6rem; font-weight:850; color:var(--brand); margin:4px 0;">${formatCurrency(metrics.totalCost)}</div>
              <div style="font-size:0.8rem; color:var(--muted);">Soma de todos os itens no carrinho</div>
            </div>

            <div class="card" style="padding:18px 20px; background:var(--surface-2); border-radius:12px; border:1px solid var(--line);">
              <div style="font-size:0.74rem; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">TOP CATEGORIA</div>
              <div class="value num" style="font-size:1.45rem; font-weight:850; color:var(--text); margin:4px 0;">${escapeHtml(metrics.topCategory || 'Nenhuma')}</div>
              <div style="font-size:0.8rem; color:var(--muted);">${formatCurrency(metrics.topCategorySpent)} gastos nesta categoria</div>
            </div>

            <!-- LINHA 2 -->
            <div class="card" style="padding:18px 20px; background:var(--surface-2); border-radius:12px; border:1px solid var(--line);">
              <div style="font-size:0.74rem; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">ITENS COMPRADOS</div>
              <div class="value num" style="font-size:1.45rem; font-weight:850; color:var(--text); margin:4px 0;">${metrics.totalChecked} <span style="font-size:0.95rem; font-weight:600; color:var(--muted);">/ ${metrics.totalItems}</span></div>
              <div style="font-size:0.8rem; color:var(--muted);">${metrics.percent}% da lista concluída</div>
            </div>

            <div class="card" style="padding:18px 20px; background:var(--surface-2); border-radius:12px; border:1px solid var(--line);">
              <div style="font-size:0.74rem; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">TICKET MÉDIO</div>
              <div class="value num" style="font-size:1.45rem; font-weight:850; color:var(--text); margin:4px 0;">${formatCurrency(metrics.avgTicket)}</div>
              <div style="font-size:0.8rem; color:var(--muted);">Valor médio por item comprado</div>
            </div>

            <!-- LINHA 3 -->
            <div class="card" style="padding:18px 20px; background:var(--surface-2); border-radius:12px; border:1px solid var(--line);">
              <div style="font-size:0.74rem; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">ECONOMIA ESTIMADA</div>
              <div class="value num ${metrics.totalSavings >= metrics.totalIncrease ? 'positive' : 'negative'}" style="font-size:1.45rem; font-weight:850; margin:4px 0;">${formatCurrency(metrics.totalSavings)}</div>
              <div style="font-size:0.8rem; color:var(--muted);">${metrics.totalIncrease > 0 ? `Aumentos: ${formatCurrency(metrics.totalIncrease)}` : 'vs compras anteriores'}</div>
            </div>

            <div class="card" style="padding:18px 20px; background:var(--surface-2); border-radius:12px; border:1px solid var(--line);">
              <div style="font-size:0.74rem; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">MAIOR COMPRA</div>
              <div class="value num" style="font-size:1.45rem; font-weight:850; color:var(--c-var, #f59e0b); margin:4px 0;" title="${escapeHtml(metrics.maxItemName || '')}">${formatCurrency(metrics.maxItemPrice)}</div>
              <div style="font-size:0.8rem; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(metrics.maxItemName || 'Nenhum item com valor')}</div>
            </div>
          </div>

          <!-- SEÇÃO GRÁFICA ANALÍTICA -->
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px; align-items:start;">
            <!-- CARD 1: DISTRIBUIÇÃO POR CATEGORIA -->
            <div style="background:var(--surface-2); padding:18px 20px; border-radius:12px; border:1px solid var(--line);">
              <h4 style="margin:0 0 14px; font-size:0.92rem; font-weight:800; color:var(--text); display:flex; align-items:center; gap:8px;">
                <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:16px; height:16px;"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                Distribuição de Gastos por Categoria
              </h4>
              <div style="display:flex; flex-direction:column; gap:10px;">
                ${categoryBreakdownHtml}
              </div>
            </div>

            <!-- CARD 2: HISTÓRICO DE COMPRAS -->
            <div style="background:var(--surface-2); padding:18px 20px; border-radius:12px; border:1px solid var(--line);">
              <h4 style="margin:0 0 14px; font-size:0.92rem; font-weight:800; color:var(--text); display:flex; align-items:center; gap:8px;">
                <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:16px; height:16px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Histórico de Compras das Listas
              </h4>
              <div style="display:flex; flex-direction:column; gap:10px; max-height:260px; overflow-y:auto;">
                ${historyListsHtml}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- FORMULÁRIO DE ADICIONAR ITEM -->
      <div class="card section-card full-width" style="padding:16px 20px; margin-bottom:18px; border-radius:14px;">
        <form id="formAddShoppingItem" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <input type="text" id="inputShoppingItemName" placeholder="Nome do item (ex: Arroz 5kg, Alcatra, Café...)" required
            style="flex:2; min-width:200px; padding:10px 14px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.92rem;">

          <select id="selectShoppingItemCategory" style="flex:1; min-width:140px; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-weight:600;">
            ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>

          <button type="submit" class="btn primary" style="border-radius:10px; font-weight:800; display:flex; align-items:center; gap:6px;">
            <svg class="svg-icon" viewBox="0 0 24 24" style="width:16px; height:16px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            + Adicionar Item
          </button>
        </form>
      </div>

      <!-- BARRA DE FILTROS -->
      <div style="display:flex; justify-content:space-between; align-items:center; gap:14px; margin-bottom:18px; flex-wrap:wrap; background:var(--surface); padding:12px 18px; border-radius:12px; border:1px solid var(--line);">
        <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:200px;">
          <input type="text" id="shoppingSearchFilter" placeholder="Buscar item na lista..."
            style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.86rem;">
        </div>

        <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
          <select id="shoppingCategoryFilter" style="padding:8px 10px; border-radius:8px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.86rem; font-weight:600;">
            <option value="Todas">Todas as Categorias</option>
            ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>

          <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.84rem; font-weight:700; color:var(--text); margin:0;">
            <input type="checkbox" id="shoppingHideChecked" style="width:16px; height:16px; accent-color:var(--brand); cursor:pointer;">
            Ocultar Comprados
          </label>

          <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.84rem; font-weight:700; color:var(--text); margin:0;">
            <input type="checkbox" id="shoppingSortAlpha" style="width:16px; height:16px; accent-color:var(--brand); cursor:pointer;">
            Ordem A-Z
          </label>
        </div>
      </div>

      <!-- LISTA DE ITENS POR CATEGORIA -->
      <div id="shoppingItemsContainer" style="display:flex; flex-direction:column; gap:16px;">
        <!-- Renderizado dinamicamente por applyItemFilters -->
      </div>
    `;

    container.innerHTML = html;

    // Listeners da Lista Individual
    $('#btnBackToShoppingLists')?.addEventListener('click', closeShoppingList);
    $('#btnEditCurrentListName')?.addEventListener('click', () => editShoppingListName(list.id));

    $('#toggleShoppingDashboardBtn')?.addEventListener('click', () => {
      isDashboardCollapsed = !isDashboardCollapsed;
      const body = $('#shoppingDashboardBody');
      const chevron = $('#shoppingDashChevron');
      if (body) body.style.display = isDashboardCollapsed ? 'none' : 'block';
      if (chevron) chevron.style.transform = isDashboardCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
    });

    $('#formAddShoppingItem')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#inputShoppingItemName')?.value;
      const cat = $('#selectShoppingItemCategory')?.value;
      addShoppingItem(name, cat);
    });

    $('#shoppingSearchFilter')?.addEventListener('input', applyItemFilters);
    $('#shoppingCategoryFilter')?.addEventListener('change', applyItemFilters);
    $('#shoppingHideChecked')?.addEventListener('change', applyItemFilters);
    $('#shoppingSortAlpha')?.addEventListener('change', applyItemFilters);

    applyItemFilters();
  }

  function applyItemFilters() {
    const list = getActiveList();
    if (!list) return;

    const s = ($('#shoppingSearchFilter')?.value || '').toLowerCase();
    const c = $('#shoppingCategoryFilter')?.value || 'Todas';
    const hideChecked = !!$('#shoppingHideChecked')?.checked;
    const sortAlpha = !!$('#shoppingSortAlpha')?.checked;

    let items = (list.items || []).filter(item => {
      const matchSearch = item.name.toLowerCase().includes(s);
      const matchCat = (c === 'Todas') || (item.category === c);
      const matchChecked = hideChecked ? !item.is_checked : true;
      return matchSearch && matchCat && matchChecked;
    });

    if (sortAlpha) {
      items.sort((a, b) => a.name.localeCompare(b.name));
    }

    const container = $('#shoppingItemsContainer');
    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = `
        <div style="padding:36px; text-align:center; color:var(--muted); background:var(--surface); border-radius:12px; border:1px solid var(--line);">
          Nenhum item encontrado nesta lista.
        </div>
      `;
      return;
    }

    // Agrupa por categoria
    let groupedHtml = '';
    CATEGORIES.forEach(cat => {
      const catItems = items.filter(i => (i.category || 'Extras') === cat);
      if (catItems.length === 0) return;

      const catColor = CATEGORY_COLORS[cat] || '#8d99ae';
      groupedHtml += `
        <div class="card section-card full-width" style="padding:14px 18px; border-radius:14px; border-left:4px solid ${catColor};">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; font-weight:800; font-size:0.92rem; color:var(--text);">
            <span style="width:10px; height:10px; border-radius:50%; background:${catColor};"></span>
            ${escapeHtml(cat)}
            <span style="font-size:0.75rem; color:var(--muted); font-weight:600;">(${catItems.length})</span>
          </div>

          <div style="display:flex; flex-direction:column; gap:8px;">
            ${catItems.map(item => {
              const isChecked = !!item.is_checked;
              const economyInfo = calculateItemEconomy(item, list.id);
              const historyInfo = getShoppingPriceHistory(item.name, item.unit || 'un', list.id);

              let detailsText = '';
              if (isChecked) {
                const qty = Number(item.quantity || 1);
                const rawPrice = Number(item.price || 0);
                const uPrice = item.unitPrice != null ? Number(item.unitPrice) : (qty > 0 ? rawPrice / qty : rawPrice);

                detailsText = `Qtd: <strong>${qty} ${escapeHtml(item.unit)}</strong> • Total: <strong style="color:var(--brand); font-size:0.92rem;">${formatCurrency(rawPrice)}</strong> <span style="color:var(--muted); font-size:0.8rem;">(${formatCurrency(uPrice)}/${item.unit})</span>`;

                if (economyInfo) {
                  if (economyInfo.isSavings) {
                    detailsText += ` <span style="display:inline-flex; align-items:center; gap:2px; background:rgba(16, 185, 129, 0.12); color:#10b981; font-weight:800; font-size:0.75rem; padding:2px 8px; border-radius:6px; margin-left:6px;">Economia: ${formatCurrency(economyInfo.totalDiff)}</span>`;
                  } else if (economyInfo.isIncrease) {
                    detailsText += ` <span style="display:inline-flex; align-items:center; gap:2px; background:rgba(239, 68, 68, 0.10); color:#ef4444; font-weight:750; font-size:0.75rem; padding:2px 8px; border-radius:6px; margin-left:6px;">+ ${formatCurrency(Math.abs(economyInfo.totalDiff))} vs histórico</span>`;
                  }
                }
              } else {
                const histRef = historyInfo && historyInfo.avgUnitPrice > 0
                  ? ` <span style="color:var(--muted); font-weight:600; font-size:0.78rem;">(Ref: ${formatCurrency(historyInfo.avgUnitPrice)}/${historyInfo.unit})</span>`
                  : '';
                detailsText = `<span style="color:var(--muted); font-style:italic;">Aguardando no mercado...</span>${histRef}`;
              }

              return `
                <div class="entry-row" style="padding:10px 14px; border-radius:10px; background:var(--surface-2); border:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:12px; ${isChecked ? 'opacity:0.92;' : ''}">
                  <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
                    <button type="button" class="btn-check-item" data-item-id="${item.id}" data-is-checked="${isChecked}"
                      style="width:28px; height:28px; border-radius:50%; border:2px solid ${isChecked ? 'var(--brand)' : 'var(--line)'}; background:${isChecked ? 'var(--brand)' : 'transparent'}; color:white; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
                      ${isChecked ? '✓' : ''}
                    </button>
                    <div style="min-width:0;">
                      <div style="font-weight:750; font-size:0.92rem; color:var(--text); ${isChecked ? 'text-decoration:line-through; color:var(--muted);' : ''} cursor:pointer;" data-edit-item="${item.id}" title="Clique para renomear">
                        ${escapeHtml(item.name)}
                      </div>
                      <div style="font-size:0.8rem; margin-top:2px;">
                        ${detailsText}
                      </div>
                    </div>
                  </div>

                  <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    ${!isChecked ? `
                      <button type="button" class="btn primary small" data-check-item="${item.id}" style="border-radius:8px; font-weight:750; padding:5px 12px;">
                        Peguei
                      </button>
                    ` : `
                      <span class="badge" style="background:rgba(31, 122, 92, 0.15); color:var(--brand); font-weight:800; font-size:0.78rem; padding:4px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                        ✓ Comprado
                      </span>
                      <button type="button" class="btn soft small" data-uncheck-item="${item.id}" title="Desfazer e voltar para pendente" style="border-radius:6px; font-size:0.72rem; padding:3px 6px;">
                        Desfazer
                      </button>
                    `}
                    <button type="button" class="icon-btn small" data-del-item="${item.id}" title="Excluir Item" style="color:var(--danger);">
                      <svg class="svg-icon" viewBox="0 0 24 24" style="width:13px; height:13px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = groupedHtml;

    // Listeners dos itens
    container.querySelectorAll('.btn-check-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-item-id');
        const isChecked = btn.getAttribute('data-is-checked') === 'true';
        if (isChecked) uncheckShoppingItem(id);
        else openPriceModal(id);
      });
    });

    container.querySelectorAll('[data-check-item]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-check-item');
        openPriceModal(id);
      });
    });

    container.querySelectorAll('[data-uncheck-item]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-uncheck-item');
        uncheckShoppingItem(id);
      });
    });

    container.querySelectorAll('[data-edit-item]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-edit-item');
        editShoppingItemName(id);
      });
    });

    container.querySelectorAll('[data-del-item]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-item');
        deleteShoppingItem(id);
      });
    });
  }

  // --- MODAL DIALOG HANDLERS ---
  function initShoppingModal() {
    $('#shoppingModalCloseBtn')?.addEventListener('click', closePriceModal);
    $('#shoppingModalCancelBtn')?.addEventListener('click', closePriceModal);
    $('#formShoppingPriceModal')?.addEventListener('submit', (e) => {
      e.preventDefault();
      confirmPriceAndCheck();
    });
    $('#shoppingModalUnit')?.addEventListener('change', () => {
      updatePriceModalLabel();
    });
  }

  // Registra e inicializa no carregamento do script
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShoppingModal);
  } else {
    initShoppingModal();
  }

  // APIs públicas do Módulo de Compras
  window.ShoppingModule = {
    renderShoppingTab,
    createShoppingList,
    deleteShoppingList,
    editShoppingListName,
    openShoppingList,
    closeShoppingList,
    addShoppingItem,
    openPriceModal,
    closePriceModal,
    confirmPriceAndCheck,
    uncheckShoppingItem,
    deleteShoppingItem,
    editShoppingItemName,
    getShoppingListMetrics,
    getShoppingPriceHistory,
    calculateItemEconomy,
    updatePriceModalLabel
  };

  window.renderShoppingTab = renderShoppingTab;

})();
