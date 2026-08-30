/**
 * Finanças Pro - Módulo de Lista de Compras & Planejamento (shopping.js)
 * Vanilla JS Architecture - Apuração & Conclusão com Lançamentos Financeiros (V3)
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

  const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

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
  let completingListId = null;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function formatCurrency(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('pt-BR');
    } catch (_) {
      return '';
    }
  }

  function getActiveList() {
    const state = getState();
    if (!state.shoppingLists || !Array.isArray(state.shoppingLists)) {
      state.shoppingLists = [];
    }
    return state.shoppingLists.find(l => l.id === activeShoppingListId) || null;
  }

  // --- HISTÓRICO DE PREÇOS E ECONOMIA ---

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
      status: 'open',
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

    if (list.status === 'completed') {
      if (typeof notify === 'function') notify('Listas concluídas não podem ser renomeadas.', 'warning');
      return;
    }

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

  function addShoppingItem(name, category, qty = 1, unit = 'un') {
    const list = getActiveList();
    if (!list) return;

    if (list.status === 'completed') {
      if (typeof notify === 'function') notify('Não é possível adicionar itens a uma lista já concluída.', 'warning');
      return;
    }

    const trimmed = (name || '').trim();
    if (!trimmed) {
      if (typeof notify === 'function') notify('Informe o nome do item.', 'error');
      return;
    }

    list.items = list.items || [];
    const newItem = {
      id: typeof uid === 'function' ? uid() : 'item_' + Math.random().toString(36).substr(2, 9),
      name: trimmed,
      category: category || 'Extras',
      is_checked: false,
      quantity: Number(qty) || 1,
      unit: unit || 'un',
      unitPrice: 0,
      price: 0,
      createdAt: new Date().toISOString()
    };

    list.items.push(newItem);
    saveState();
    renderShoppingTab();
    if (typeof notify === 'function') notify(`Item "${trimmed}" adicionado à lista!`, 'success');
  }

  function editShoppingItemName(itemId) {
    const list = getActiveList();
    if (!list) return;

    if (list.status === 'completed') {
      if (typeof notify === 'function') notify('Esta lista está concluída (somente leitura).', 'warning');
      return;
    }

    const item = (list.items || []).find(i => i.id === itemId);
    if (!item) return;

    const newName = prompt('Editar nome do item:', item.name);
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

    if (list.status === 'completed') {
      if (typeof notify === 'function') notify('Esta lista está concluída (somente leitura).', 'warning');
      return;
    }

    list.items = (list.items || []).filter(i => i.id !== itemId);
    saveState();
    renderShoppingTab();
    if (typeof notify === 'function') notify('Item removido da lista!', 'info');
  }

  function uncheckShoppingItem(itemId) {
    const list = getActiveList();
    if (!list) return;

    if (list.status === 'completed') {
      if (typeof notify === 'function') notify('Esta lista está concluída (somente leitura).', 'warning');
      return;
    }

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

    if (list.status === 'completed') {
      if (typeof notify === 'function') notify('Esta lista está concluída (somente leitura).', 'warning');
      return;
    }

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

    const existingUnitPrice = item.unitPrice != null && Number(item.unitPrice) > 0
      ? item.unitPrice
      : (item.quantity > 0 && Number(item.price) > 0 ? Number(item.price) / Number(item.quantity) : '');

    if (priceEl) priceEl.value = existingUnitPrice;
    updatePriceModalLabel();

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

    if (list.status === 'completed') {
      closePriceModal();
      return;
    }

    const item = (list.items || []).find(i => i.id === pendingCheckItemId);
    if (!item) return;

    const qty = Number($('#shoppingModalQty')?.value) || 1;
    const unit = $('#shoppingModalUnit')?.value || 'un';
    const unitPriceVal = Number($('#shoppingModalPrice')?.value) || 0;

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

  // --- MODAL DE CONCLUSÃO DE LISTA DE COMPRAS COM LANÇAMENTO FINANCEIRO ---

  function openShoppingCompleteModal(listId) {
    const state = getState();
    const lists = state.shoppingLists || [];
    const list = lists.find(l => l.id === listId);
    if (!list) return;

    if (list.status === 'completed') {
      if (typeof notify === 'function') notify('Esta lista já foi concluída anteriormente.', 'info');
      return;
    }

    completingListId = list.id;

    const modal = $('#shoppingCompleteDialog');
    if (!modal) return;

    const listNameEl = $('#shoppingCompleteListName');
    const totalItemsEl = $('#shoppingCompleteTotalItems');
    const checkedItemsEl = $('#shoppingCompleteCheckedItems');
    const totalPurchasedEl = $('#shoppingCompleteTotalPurchased');
    const warningBox = $('#shoppingCompleteWarningBox');
    const warningMsg = $('#shoppingCompleteWarningMsg');
    const submitBtn = $('#shoppingCompleteSubmitBtn');

    if (listNameEl) listNameEl.textContent = list.name;

    const items = list.items || [];
    const checkedItems = items.filter(i => i.is_checked);
    const totalCost = checkedItems.reduce((acc, i) => acc + Number(i.price || 0), 0);

    if (totalItemsEl) totalItemsEl.textContent = items.length;
    if (checkedItemsEl) checkedItemsEl.textContent = checkedItems.length;
    if (totalPurchasedEl) totalPurchasedEl.textContent = formatCurrency(totalCost);

    // Validações de Bloqueio (Itens zerados ou sem preço)
    let isBlocked = false;
    let blockerHtml = '';

    if (checkedItems.length === 0) {
      isBlocked = true;
      blockerHtml = 'Nenhum item marcado como pego nesta lista. Marque os itens comprados antes de efetuar o fechamento financeiro.';
    } else {
      const invalidPriceItems = checkedItems.filter(i => !Number(i.price) || Number(i.price) <= 0);
      if (invalidPriceItems.length > 0) {
        isBlocked = true;
        const itemNames = invalidPriceItems.map(i => `<strong>${escapeHtml(i.name)}</strong>`).join(', ');
        blockerHtml = `Os seguintes itens marcados como pegos não possuem preço cadastrado: ${itemNames}. Defina o valor pago de cada item antes de concluir.`;
      }
    }

    if (warningBox && warningMsg) {
      if (isBlocked) {
        warningBox.style.display = 'block';
        warningMsg.innerHTML = blockerHtml;
      } else {
        warningBox.style.display = 'none';
      }
    }

    if (submitBtn) {
      submitBtn.disabled = isBlocked;
      submitBtn.style.opacity = isBlocked ? '0.5' : '1';
      submitBtn.style.cursor = isBlocked ? 'not-allowed' : 'pointer';
    }

    // Popula Mês e Ano de Competência
    const monthSelect = $('#shoppingCompleteMonth');
    const yearSelect = $('#shoppingCompleteYear');

    if (monthSelect) {
      monthSelect.innerHTML = MONTH_NAMES.map((mName, idx) => {
        const mVal = idx + 1;
        const sel = mVal === Number(state.month || (new Date().getMonth() + 1)) ? 'selected' : '';
        return `<option value="${mVal}" ${sel}>${mName} (Mês ${mVal})</option>`;
      }).join('');
    }

    if (yearSelect) {
      const curY = Number(state.year || new Date().getFullYear());
      const years = [curY - 1, curY, curY + 1, curY + 2];
      yearSelect.innerHTML = years.map(y => {
        const sel = y === curY ? 'selected' : '';
        return `<option value="${y}" ${sel}>${y}</option>`;
      }).join('');
    }

    // Popula Categorias e Destinos (Despesa Consolidada)
    const metrics = getShoppingListMetrics(list);
    const catSelect = $('#shoppingCompleteExpenseCategory');
    const destSelect = $('#shoppingCompleteExpenseDestination');
    const splitCatSelect = $('#shoppingCompleteSplitCategory');
    const splitDestSelect = $('#shoppingCompleteSplitDestination');

    const appCategories = (state.categories && state.categories.length > 0) ? state.categories : CATEGORIES;
    const catNames = appCategories.map(c => (typeof getCategoryName === 'function' ? getCategoryName(c) : (typeof c === 'string' ? c : (c.name || 'Gerais'))));
    const defaultCat = metrics.topCategory || (catNames.includes('Alimentação') ? 'Alimentação' : catNames[0] || 'Extras');

    const categoriesHtml = catNames.map(c => {
      const sel = c === defaultCat ? 'selected' : '';
      return `<option value="${escapeHtml(c)}" ${sel}>${escapeHtml(c)}</option>`;
    }).join('');

    if (catSelect) catSelect.innerHTML = categoriesHtml;
    if (splitCatSelect) splitCatSelect.innerHTML = categoriesHtml;

    const appDestinations = (state.destinations && state.destinations.length > 0)
      ? state.destinations.map(d => typeof d === 'string' ? d : (d.name || 'Conta'))
      : ['Nubank'];
    const defaultDest = appDestinations.includes('Nubank') ? 'Nubank' : (appDestinations[0] || 'Nubank');

    const destsHtml = appDestinations.map(d => {
      const sel = d === defaultDest ? 'selected' : '';
      return `<option value="${escapeHtml(d)}" ${sel}>${escapeHtml(d)}</option>`;
    }).join('');

    if (destSelect) destSelect.innerHTML = destsHtml;
    if (splitDestSelect) splitDestSelect.innerHTML = destsHtml;

    // Reseta Rádio para "Despesas" e Atualiza Painéis
    const radioExpenses = document.querySelector('input[name="shoppingAllocationMode"][value="expenses"]');
    if (radioExpenses) radioExpenses.checked = true;
    updateAllocationPanels(list);

    if (typeof modal.showModal === 'function') {
      modal.showModal();
    }
  }

  function updateAllocationPanels(list) {
    const selectedMode = document.querySelector('input[name="shoppingAllocationMode"]:checked')?.value || 'expenses';

    const panelExpenses = $('#shoppingCompletePanelExpenses');
    const panelBenefits = $('#shoppingCompletePanelBenefits');
    const panelSplit = $('#shoppingCompletePanelSplit');

    // Destaque visual dos botões/cards de opção
    document.querySelectorAll('.allocation-opt-label').forEach(lbl => {
      const radio = lbl.querySelector('input[type="radio"]');
      if (radio && radio.checked) {
        lbl.style.borderColor = 'var(--brand)';
        lbl.style.background = 'var(--surface)';
      } else {
        lbl.style.borderColor = 'var(--line)';
        lbl.style.background = 'var(--surface-2)';
      }
    });

    if (panelExpenses) panelExpenses.style.display = selectedMode === 'expenses' ? 'flex' : 'none';
    if (panelBenefits) panelBenefits.style.display = selectedMode === 'benefits' ? 'flex' : 'none';
    if (panelSplit) panelSplit.style.display = selectedMode === 'split' ? 'flex' : 'none';

    if (selectedMode === 'split' && list) {
      renderSplitModeItemsTable(list);
    }
  }

  function renderSplitModeItemsTable(list) {
    const splitContainer = $('#shoppingCompleteSplitItemsList');
    if (!splitContainer) return;

    const checkedItems = (list.items || []).filter(i => i.is_checked);
    if (checkedItems.length === 0) {
      splitContainer.innerHTML = '<div style="color:var(--muted); font-size:0.8rem; font-style:italic;">Nenhum item marcado como comprado.</div>';
      return;
    }

    splitContainer.innerHTML = checkedItems.map(item => {
      const p = Number(item.price || 0);
      const isFood = ['Proteína', 'Carboidrato', 'Legumes', 'Frutas', 'Alimentação'].includes(item.category);
      const defaultAlloc = item.allocation || (isFood ? 'benefit' : 'expense');

      return `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:6px 10px; border-radius:8px; background:var(--surface); border:1px solid var(--line);">
          <div style="min-width:0; flex:1;">
            <div style="font-weight:750; font-size:0.84rem; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.name)}</div>
            <div style="font-size:0.75rem; color:var(--muted);">${item.quantity} ${escapeHtml(item.unit || 'un')} • <strong style="color:var(--text);">${formatCurrency(p)}</strong></div>
          </div>
          <div style="flex-shrink:0;">
            <select class="shopping-split-item-alloc" data-item-id="${item.id}" data-item-price="${p}"
              style="padding:5px 8px; border-radius:6px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.78rem; font-weight:750;">
              <option value="expense" ${defaultAlloc === 'expense' ? 'selected' : ''}>Despesa</option>
              <option value="benefit" ${defaultAlloc === 'benefit' ? 'selected' : ''}>Benefício</option>
            </select>
          </div>
        </div>
      `;
    }).join('');

    // Listeners nos selects de divisão por item
    splitContainer.querySelectorAll('.shopping-split-item-alloc').forEach(sel => {
      sel.addEventListener('change', () => {
        recalculateSplitTotals();
      });
    });

    recalculateSplitTotals();
  }

  function recalculateSplitTotals() {
    let totalExp = 0;
    let totalBen = 0;

    document.querySelectorAll('.shopping-split-item-alloc').forEach(sel => {
      const p = Number(sel.getAttribute('data-item-price')) || 0;
      if (sel.value === 'benefit') {
        totalBen += p;
      } else {
        totalExp += p;
      }
    });

    totalExp = Math.round(totalExp * 100) / 100;
    totalBen = Math.round(totalBen * 100) / 100;

    const expTotalEl = $('#shoppingCompleteSplitExpenseTotal');
    const benTotalEl = $('#shoppingCompleteSplitBenefitTotal');
    const expConfigsEl = $('#shoppingCompleteSplitExpenseConfigs');
    const benConfigsEl = $('#shoppingCompleteSplitBenefitConfigs');

    if (expTotalEl) expTotalEl.textContent = formatCurrency(totalExp);
    if (benTotalEl) benTotalEl.textContent = formatCurrency(totalBen);

    if (expConfigsEl) expConfigsEl.style.display = totalExp > 0 ? 'flex' : 'none';
    if (benConfigsEl) benConfigsEl.style.display = totalBen > 0 ? 'flex' : 'none';
  }

  function closeShoppingCompleteModal() {
    const modal = $('#shoppingCompleteDialog');
    if (modal && modal.open && typeof modal.close === 'function') {
      modal.close();
    }
    completingListId = null;
  }

  async function confirmShoppingCompletion() {
    if (!completingListId) return;
    const state = getState();
    const list = (state.shoppingLists || []).find(l => l.id === completingListId);
    if (!list) return;

    if (list.status === 'completed') {
      if (typeof notify === 'function') notify('Esta lista já foi concluída anteriormente.', 'warning');
      closeShoppingCompleteModal();
      return;
    }

    const checkedItems = (list.items || []).filter(i => i.is_checked);
    if (checkedItems.length === 0) {
      if (typeof notify === 'function') notify('Nenhum item marcado como pego na lista.', 'error');
      return;
    }

    const invalidPriceItems = checkedItems.filter(i => !Number(i.price) || Number(i.price) <= 0);
    if (invalidPriceItems.length > 0) {
      if (typeof notify === 'function') notify('Existem itens pegos sem preço definido.', 'error');
      return;
    }

    // Leitura dos parâmetros do formulário
    const compMonth = Number($('#shoppingCompleteMonth')?.value) || Number(state.month || (new Date().getMonth() + 1));
    const compYear = Number($('#shoppingCompleteYear')?.value) || Number(state.year || new Date().getFullYear());
    const mode = document.querySelector('input[name="shoppingAllocationMode"]:checked')?.value || 'expenses';

    let expenseAmount = 0;
    let benefitAmount = 0;
    let category = null;
    let destination = null;
    let status = 'pago';
    let benefitType = null;
    let itemsAllocation = null;

    if (mode === 'expenses') {
      expenseAmount = Math.round(checkedItems.reduce((acc, i) => acc + Number(i.price || 0), 0) * 100) / 100;
      category = $('#shoppingCompleteExpenseCategory')?.value || 'Alimentação';
      destination = $('#shoppingCompleteExpenseDestination')?.value || 'Nubank';
      status = $('#shoppingCompleteExpenseStatus')?.value || 'pago';
    } else if (mode === 'benefits') {
      benefitAmount = Math.round(checkedItems.reduce((acc, i) => acc + Number(i.price || 0), 0) * 100) / 100;
      benefitType = $('#shoppingCompleteBenefitType')?.value || 'va';
    } else if (mode === 'split') {
      const allocMap = {};
      let sumExp = 0;
      let sumBen = 0;

      document.querySelectorAll('.shopping-split-item-alloc').forEach(sel => {
        const itId = sel.getAttribute('data-item-id');
        const val = sel.value;
        allocMap[itId] = val;

        const it = checkedItems.find(x => x.id === itId);
        if (it) {
          it.allocation = val;
          const p = Number(it.price || 0);
          if (val === 'benefit') sumBen += p;
          else sumExp += p;
        }
      });

      expenseAmount = Math.round(sumExp * 100) / 100;
      benefitAmount = Math.round(sumBen * 100) / 100;
      category = $('#shoppingCompleteSplitCategory')?.value || 'Alimentação';
      destination = $('#shoppingCompleteSplitDestination')?.value || 'Nubank';
      benefitType = $('#shoppingCompleteSplitBenefitType')?.value || 'va';
      status = 'pago';
      itemsAllocation = allocMap;
    }

    // SNAPSHOT DE SEGURANÇA PARA ROLLBACK EM CASO DE ERRO DE PERSISTÊNCIA / 409
    const rollbackVariable = JSON.parse(JSON.stringify(state.variable || []));
    const rollbackBenefits = JSON.parse(JSON.stringify(state.benefitTransactions || []));
    const rollbackLists = JSON.parse(JSON.stringify(state.shoppingLists || []));

    // MONTAGEM DOS LANÇAMENTOS EM MEMÓRIA
    const createdVariableIds = [];
    const createdBenefitIds = [];

    if (expenseAmount > 0) {
      const newVarId = typeof uid === 'function' ? uid() : 'var_' + Math.random().toString(36).substr(2, 9);
      const ym = `${compYear}-${String(compMonth).padStart(2, '0')}`;
      const paidHist = {};
      paidHist[ym] = (status === 'pago');

      state.variable = state.variable || [];
      state.variable.push({
        id: newVarId,
        name: `Lista de Compras: ${list.name}`,
        amount: expenseAmount,
        group: category,
        destination: destination,
        dueDay: 1,
        note: `Gerado automaticamente na conclusão da lista "${list.name}"`,
        startMonth: compMonth,
        startYear: compYear,
        endMonth: compMonth,
        endYear: compYear,
        installments: 1,
        paidHistory: paidHist,
        sourceType: 'shopping_list',
        sourceId: list.id
      });
      createdVariableIds.push(newVarId);
    }

    if (benefitAmount > 0) {
      const newBenId = typeof uid === 'function' ? uid() : 'ben_' + Math.random().toString(36).substr(2, 9);
      state.benefitTransactions = state.benefitTransactions || [];
      state.benefitTransactions.push({
        id: newBenId,
        description: `Lista de Compras: ${list.name}`,
        type: benefitType || 'va',
        amount: benefitAmount,
        day: 1,
        month: compMonth,
        year: compYear,
        note: `Gerado automaticamente na conclusão da lista "${list.name}"`,
        sourceType: 'shopping_list',
        sourceId: list.id
      });
      createdBenefitIds.push(newBenId);
    }

    // ATUALIZAÇÃO DO STATUS DA LISTA
    list.status = 'completed';
    list.completedAt = new Date().toISOString();
    list.completionMonth = compMonth;
    list.completionYear = compYear;
    list.allocation = {
      mode,
      expenseAmount,
      benefitAmount,
      category: expenseAmount > 0 ? category : null,
      destination: expenseAmount > 0 ? destination : null,
      benefitType: benefitAmount > 0 ? benefitType : null,
      status: expenseAmount > 0 ? status : null,
      itemsAllocation
    };

    // PERSISTÊNCIA ATÔMICA ÚNICA NO MONGODB
    let saveSuccess = false;
    try {
      saveSuccess = await saveState('shopping-list-complete');
    } catch (err) {
      console.error('Erro durante saveState na conclusão da lista:', err);
      saveSuccess = false;
    }

    // TRATAMENTO DE FALHA / CONFLITO / REJEIÇÃO
    if (!saveSuccess) {
      // Reverte estado em memória para evitar estado corrompido / falso positivo
      state.variable = rollbackVariable;
      state.benefitTransactions = rollbackBenefits;
      const origList = rollbackLists.find(l => l.id === list.id);
      if (origList) {
        Object.keys(list).forEach(k => delete list[k]);
        Object.assign(list, origList);
      }
      state.shoppingLists = rollbackLists;

      if (typeof notify === 'function') {
        notify('⚠️ Falha ao registrar conclusão no servidor. Nenhuma alteração foi gravada.', 'error');
      }
      return;
    }

    // SUCESSO (HTTP 200)
    closeShoppingCompleteModal();
    if (typeof notify === 'function') {
      notify(`Lista "${list.name}" concluída e lançamentos financeiros gerados com sucesso!`, 'success');
    }

    renderShoppingTab();
    try {
      if (typeof render === 'function') render();
    } catch (_) {}
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
        const isCompleted = l.status === 'completed';
        const dateStr = l.createdAt ? formatDate(l.createdAt) : '';
        const completedDateStr = l.completedAt ? formatDate(l.completedAt) : '';

        let allocationSummary = '';
        if (isCompleted && l.allocation) {
          if (l.allocation.mode === 'expenses') {
            allocationSummary = `<div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">Destinado a <strong>Despesas</strong>: <span style="color:var(--text); font-weight:750;">${formatCurrency(l.allocation.expenseAmount)}</span></div>`;
          } else if (l.allocation.mode === 'benefits') {
            allocationSummary = `<div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">Destinado a <strong>Benefícios</strong>: <span style="color:var(--brand); font-weight:750;">${formatCurrency(l.allocation.benefitAmount)}</span></div>`;
          } else if (l.allocation.mode === 'split') {
            allocationSummary = `<div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">Dividido: <strong>Despesas</strong> ${formatCurrency(l.allocation.expenseAmount)} • <strong>Benefícios</strong> ${formatCurrency(l.allocation.benefitAmount)}</div>`;
          }
        }

        html += `
          <div class="card" style="padding:18px; border-radius:14px; background:var(--surface); border:1px solid ${isCompleted ? 'rgba(16, 185, 129, 0.35)' : 'var(--line)'}; display:flex; flex-direction:column; justify-content:space-between; gap:14px; position:relative; box-shadow:0 2px 8px rgba(0,0,0,0.02);">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; gap:8px;">
                <div>
                  <h3 style="margin:0 0 4px; font-size:1.05rem; font-weight:800; color:var(--text); word-break:break-word;">
                    ${escapeHtml(l.name)}
                  </h3>
                  <div style="font-size:0.75rem; color:var(--muted);">Criada em ${dateStr}</div>
                </div>
                <div style="flex-shrink:0;">
                  ${isCompleted ? `
                    <span class="badge" style="background:rgba(16, 185, 129, 0.15); color:#10b981; font-weight:800; font-size:0.72rem; padding:3px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:3px;">
                      ✓ Concluída
                    </span>
                  ` : `
                    <span class="badge" style="background:rgba(59, 130, 246, 0.12); color:#3b82f6; font-weight:800; font-size:0.72rem; padding:3px 8px; border-radius:6px;">
                      Aberta
                    </span>
                  `}
                </div>
              </div>

              <!-- RESUMO DE ITENS E VALOR -->
              <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-radius:10px; background:var(--surface-2); margin-bottom:10px;">
                <div>
                  <div style="font-size:0.72rem; color:var(--muted); font-weight:700;">ITENS PEGOS</div>
                  <div style="font-size:0.95rem; font-weight:800; color:var(--text);">${metrics.totalChecked} / ${metrics.totalItems} <span style="font-size:0.76rem; color:var(--muted);">(${metrics.percent}%)</span></div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:0.72rem; color:var(--muted); font-weight:700;">TOTAL GASTO</div>
                  <div style="font-size:1.15rem; font-weight:850; color:var(--brand);">${formatCurrency(metrics.totalCost)}</div>
                </div>
              </div>

              <!-- BARRA DE PROGRESSO -->
              <div style="background:var(--line); border-radius:6px; height:6px; overflow:hidden; margin-bottom:6px;">
                <div style="background:${isCompleted ? '#10b981' : 'var(--brand)'}; height:100%; width:${metrics.percent}%; transition:width 0.3s ease;"></div>
              </div>

              ${allocationSummary}
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; pt:8px; border-top:1px solid var(--line);">
              <button type="button" class="btn ${isCompleted ? 'soft' : 'primary'} small" data-open-list="${l.id}" style="border-radius:8px; font-weight:800; padding:6px 14px;">
                ${isCompleted ? 'Ver Detalhes →' : 'Abrir Lista →'}
              </button>
              <div style="display:flex; gap:6px;">
                ${!isCompleted ? `
                  <button type="button" class="icon-btn small" data-edit-list-name="${l.id}" data-tooltip="Renomear Lista" aria-label="Renomear Lista">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="width:13px; height:13px;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  </button>
                ` : ''}
                <button type="button" class="icon-btn small" data-del-list="${l.id}" data-tooltip="Excluir Lista" aria-label="Excluir Lista" style="color:var(--danger);">
                  <svg class="svg-icon" viewBox="0 0 24 24" style="width:13px; height:13px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
          </div>
        `;
      });
    }

    html += '</div>';
    container.innerHTML = html;

    // Listeners do formulário de criação
    $('#formNewShoppingList')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#inputNewListName');
      if (input && input.value) {
        createShoppingList(input.value);
        input.value = '';
      }
    });

    // Listeners de Ações dos Cards
    container.querySelectorAll('[data-open-list]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-open-list');
        openShoppingList(id);
      });
    });

    container.querySelectorAll('[data-edit-list-name]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-list-name');
        editShoppingListName(id);
      });
    });

    container.querySelectorAll('[data-del-list]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-list');
        deleteShoppingList(id);
      });
    });
  }

  // Visualização 2: Detalhe de Uma Lista Única
  function renderSingleListDetail(container, list) {
    const metrics = getShoppingListMetrics(list);
    const allLists = (getState().shoppingLists || []);
    const isCompleted = list.status === 'completed';

    // Geração do Card 1: Distribuição por Categoria
    let categoryBreakdownHtml = '';
    const activeCats = Object.entries(metrics.catTotals).filter(([_, val]) => val > 0);

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
        const dateStr = l.createdAt ? formatDate(l.createdAt) : 'Data não informada';
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

    let completionStatusBadge = '';
    if (isCompleted) {
      const compDate = list.completedAt ? formatDate(list.completedAt) : '';
      completionStatusBadge = `
        <div style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:8px; background:rgba(16, 185, 129, 0.15); color:#10b981; font-weight:800; font-size:0.80rem;">
          <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:#10b981; width:14px; height:14px; stroke-width:2.5;"><polyline points="20 6 9 17 4 12"/></svg>
          Lista Concluída em ${compDate} (Competência: ${list.completionMonth}/${list.completionYear})
        </div>
      `;
    }

    let html = `
      <!-- CABEÇALHO DA LISTA ATIVA -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; flex-wrap:wrap; gap:16px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <button type="button" class="btn soft" id="btnBackToShoppingLists" style="border-radius:10px; font-weight:750; display:flex; align-items:center; gap:6px;">
            ← Todas as Listas
          </button>
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <h2 style="margin:0; font-size:1.35rem; font-weight:800; color:var(--text); display:flex; align-items:center; gap:8px;">
                ${escapeHtml(list.name)}
                ${!isCompleted ? `
                  <button type="button" class="icon-btn small" id="btnEditCurrentListName" data-tooltip="Renomear Lista" aria-label="Renomear Lista" style="display:inline-flex;">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="width:13px; height:13px;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  </button>
                ` : ''}
              </h2>
              ${completionStatusBadge}
            </div>
            <p style="margin:2px 0 0; color:var(--muted); font-size:0.84rem;">${metrics.totalChecked} de ${metrics.totalItems} itens marcados como comprados</p>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <!-- BOTÃO CONCLUIR LISTA (SE ABERTA) OU STATUS FINAL (SE CONCLUÍDA) -->
          ${!isCompleted ? `
            <button type="button" class="btn primary" id="btnOpenShoppingCompleteModal" style="border-radius:12px; font-weight:800; padding:10px 18px; display:flex; align-items:center; gap:8px; box-shadow:0 4px 14px rgba(31,122,92,0.22);">
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:18px; height:18px; stroke-width:2.5;"><polyline points="20 6 9 17 4 12"/></svg>
              Concluir Lista
            </button>
          ` : `
            <div style="padding:8px 14px; border-radius:10px; background:var(--surface-2); border:1px solid var(--line); font-size:0.82rem; font-weight:800; color:var(--muted); display:flex; align-items:center; gap:6px;">
              <span style="width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
              Modo Somente Leitura
            </div>
          `}

          <!-- RESUMO DO TOTAL NO CARRINHO -->
          <div class="card" style="padding:10px 18px; border-radius:14px; background:var(--surface); border:2px solid var(--brand); display:flex; align-items:center; gap:12px; min-width:190px; box-shadow:0 4px 12px rgba(0,0,0,0.04);">
            <div style="width:36px; height:36px; border-radius:10px; background:var(--brand-soft, rgba(31,122,92,0.12)); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:18px; height:18px; stroke-width:2.2;">
                <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
            </div>
            <div>
              <div style="font-size:0.68rem; color:var(--muted); font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">TOTAL NO CARRINHO</div>
              <div style="font-size:1.35rem; font-weight:850; color:var(--brand); line-height:1.2;">${formatCurrency(metrics.totalCost)}</div>
            </div>
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

      <!-- FORMULÁRIO DE NOVO ITEM NA LISTA (APENAS SE ABERTA) -->
      ${!isCompleted ? `
        <div class="card section-card full-width" style="padding:16px 20px; margin-bottom:20px; border-radius:14px;">
          <form id="formAddShoppingItem" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <input type="text" id="inputNewItemName" placeholder="Nome do Item (ex: Arroz, Peito de Frango, Detergente)" required
              style="flex:2; min-width:200px; padding:10px 14px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.92rem;">

            <select id="selectNewItemCategory"
              style="flex:1; min-width:140px; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.92rem;">
              ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>

            <div style="display:flex; gap:6px; flex:1; min-width:160px;">
              <input type="number" id="inputNewItemQty" min="0.01" step="any" value="1" placeholder="Qtd" required
                style="width:70px; padding:10px 10px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.92rem; text-align:center;">

              <select id="selectNewItemUnit"
                style="flex:1; padding:10px 8px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.92rem;">
                <option value="un">un</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="L">L</option>
                <option value="ml">ml</option>
                <option value="pct">pct</option>
                <option value="cx">cx</option>
              </select>
            </div>

            <button type="submit" class="btn primary" style="border-radius:10px; font-weight:800; display:flex; align-items:center; gap:6px; padding:10px 18px;">
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:16px; height:16px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              + Adicionar Item
            </button>
          </form>
        </div>
      ` : ''}

      <!-- ITENS DA LISTA AGRUPADOS POR CATEGORIA -->
      <div id="shoppingItemsGroupedContainer" style="display:flex; flex-direction:column; gap:16px;">
        <!-- Injetado por renderGroupedItems -->
      </div>
    `;

    container.innerHTML = html;

    // Listeners do Cabeçalho da Lista
    $('#btnBackToShoppingLists')?.addEventListener('click', closeShoppingList);
    $('#btnEditCurrentListName')?.addEventListener('click', () => editShoppingListName(list.id));
    $('#btnOpenShoppingCompleteModal')?.addEventListener('click', () => openShoppingCompleteModal(list.id));

    // Listener do Toggle do Dashboard Retrátil
    $('#toggleShoppingDashboardBtn')?.addEventListener('click', () => {
      isDashboardCollapsed = !isDashboardCollapsed;
      const body = $('#shoppingDashboardBody');
      const chevron = $('#shoppingDashChevron');
      if (body) body.style.display = isDashboardCollapsed ? 'none' : 'block';
      if (chevron) chevron.style.transform = isDashboardCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
    });

    // Listener do Formulário de Adicionar Item
    $('#formAddShoppingItem')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = $('#inputNewItemName');
      const catSelect = $('#selectNewItemCategory');
      const qtyInput = $('#inputNewItemQty');
      const unitSelect = $('#selectNewItemUnit');

      if (nameInput && nameInput.value) {
        addShoppingItem(
          nameInput.value,
          catSelect ? catSelect.value : 'Extras',
          qtyInput ? qtyInput.value : 1,
          unitSelect ? unitSelect.value : 'un'
        );
        nameInput.value = '';
        if (qtyInput) qtyInput.value = '1';
      }
    });

    // Renderiza Itens Agrupados
    renderGroupedItems(list);
  }

  function renderGroupedItems(list) {
    const container = $('#shoppingItemsGroupedContainer');
    if (!container) return;

    const items = list.items || [];
    const isCompleted = list.status === 'completed';

    if (items.length === 0) {
      container.innerHTML = `
        <div style="padding:36px 20px; text-align:center; background:var(--surface); border-radius:14px; border:1px solid var(--line);">
          <p style="color:var(--muted); font-size:0.92rem; margin:0;">Esta lista ainda não possui itens. Adicione o primeiro item no campo acima!</p>
        </div>
      `;
      return;
    }

    const itemsByCategory = {};
    items.forEach(item => {
      const cat = item.category || 'Extras';
      if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
      itemsByCategory[cat].push(item);
    });

    let groupedHtml = '';

    Object.keys(itemsByCategory).forEach(cat => {
      const catItems = itemsByCategory[cat];
      const catColor = CATEGORY_COLORS[cat] || '#8d99ae';

      groupedHtml += `
        <div class="card" style="padding:16px 18px; border-radius:12px; background:var(--surface); border:1px solid var(--line);">
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
                    <button type="button" class="btn-check-item" data-item-id="${item.id}" data-is-checked="${isChecked}" ${isCompleted ? 'disabled style="cursor:default;"' : ''}
                      style="width:28px; height:28px; border-radius:50%; border:2px solid ${isChecked ? 'var(--brand)' : 'var(--line)'}; background:${isChecked ? 'var(--brand)' : 'transparent'}; color:white; display:flex; align-items:center; justify-content:center; cursor:${isCompleted ? 'default' : 'pointer'}; flex-shrink:0;">
                      ${isChecked ? '✓' : ''}
                    </button>
                    <div style="min-width:0;">
                      <div style="font-weight:750; font-size:0.92rem; color:var(--text); ${isChecked ? 'text-decoration:line-through; color:var(--muted);' : ''} ${!isCompleted ? 'cursor:pointer;' : ''}" ${!isCompleted ? `data-edit-item="${item.id}" data-tooltip="Clique para renomear" aria-label="Clique para renomear"` : ''}>
                        ${escapeHtml(item.name)}
                      </div>
                      <div style="font-size:0.8rem; margin-top:2px;">
                        ${detailsText}
                      </div>
                    </div>
                  </div>

                  <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    ${!isCompleted ? (
                      !isChecked ? `
                        <button type="button" class="btn primary small" data-check-item="${item.id}" style="border-radius:8px; font-weight:750; padding:5px 12px;">
                          Peguei
                        </button>
                      ` : `
                        <span class="badge" style="background:rgba(31, 122, 92, 0.15); color:var(--brand); font-weight:800; font-size:0.78rem; padding:4px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                          ✓ Comprado
                        </span>
                        <button type="button" class="btn soft small" data-uncheck-item="${item.id}" data-tooltip="Desfazer e voltar para pendente" aria-label="Desfazer e voltar para pendente" style="border-radius:6px; font-size:0.72rem; padding:3px 6px;">
                          Desfazer
                        </button>
                      `
                    ) : (
                      isChecked ? `
                        <span class="badge" style="background:rgba(16, 185, 129, 0.15); color:#10b981; font-weight:800; font-size:0.78rem; padding:4px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                          ✓ Comprado
                        </span>
                      ` : `
                        <span class="badge" style="background:rgba(141, 153, 174, 0.15); color:var(--muted); font-weight:700; font-size:0.75rem; padding:4px 8px; border-radius:6px;">
                          Não comprado
                        </span>
                      `
                    )}
                    ${!isCompleted ? `
                      <button type="button" class="icon-btn small" data-del-item="${item.id}" data-tooltip="Excluir Item" aria-label="Excluir Item" style="color:var(--danger);">
                        <svg class="svg-icon" viewBox="0 0 24 24" style="width:13px; height:13px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = groupedHtml;

    if (!isCompleted) {
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
  }

  // --- MODAL DIALOG HANDLERS & INITS ---
  function initShoppingModal() {
    // Modal de Preço Unitário
    $('#shoppingModalCloseBtn')?.addEventListener('click', closePriceModal);
    $('#shoppingModalCancelBtn')?.addEventListener('click', closePriceModal);
    $('#formShoppingPriceModal')?.addEventListener('submit', (e) => {
      e.preventDefault();
      confirmPriceAndCheck();
    });
    $('#shoppingModalUnit')?.addEventListener('change', () => {
      updatePriceModalLabel();
    });

    // Modal de Conclusão da Lista
    $('#shoppingCompleteCloseBtn')?.addEventListener('click', closeShoppingCompleteModal);
    $('#shoppingCompleteCancelBtn')?.addEventListener('click', closeShoppingCompleteModal);
    $('#formShoppingComplete')?.addEventListener('submit', (e) => {
      e.preventDefault();
      confirmShoppingCompletion();
    });

    // Eventos de troca de modo de destinação no modal de conclusão
    document.querySelectorAll('input[name="shoppingAllocationMode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const list = completingListId ? (getState().shoppingLists || []).find(l => l.id === completingListId) : null;
        updateAllocationPanels(list);
      });
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
    updatePriceModalLabel,
    openShoppingCompleteModal,
    closeShoppingCompleteModal,
    confirmShoppingCompletion
  };

  window.renderShoppingTab = renderShoppingTab;

})();
