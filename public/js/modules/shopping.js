/**
 * Finanças Pro - Módulo de Lista de Compras & Planejamento (shopping.js)
 * Vanilla JS Architecture
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

  let activeShoppingListId = null;
  let pendingCheckItemId = null;

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
    item.price = 0;
    saveState();
    renderShoppingTab();
  }

  // --- MODAL DE PREÇO / CHECK ---

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
    const labelEl = $('#shoppingModalPriceLabel');

    if (nameEl) nameEl.textContent = item.name;
    if (qtyEl) qtyEl.value = item.quantity || 1;
    if (unitEl) unitEl.value = item.unit || 'un';
    if (priceEl) priceEl.value = item.price > 0 ? item.price : '';
    if (labelEl) labelEl.textContent = (unitEl && unitEl.value === 'un') ? 'Valor total pago ou valor unitário:' : 'Valor total pago (R$):';

    if (modal && typeof modal.showModal === 'function') {
      modal.showModal();
      setTimeout(() => { if (priceEl && typeof priceEl.focus === 'function') priceEl.focus(); }, 80);
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
    const priceVal = Number($('#shoppingModalPrice')?.value) || 0;

    item.is_checked = true;
    item.quantity = qty;
    item.unit = unit;
    item.price = priceVal;

    saveState();
    closePriceModal();
    renderShoppingTab();
    if (typeof notify === 'function') notify(`"${item.name}" marcado como comprado!`, 'success');
  }

  // --- RENDERIZAÇÃO DA ABA ---

  function renderShoppingTab() {
    const state = getState();
    state.shoppingLists = state.shoppingLists || [];

    const container = $('#tab-shopping');
    if (!container) return;

    // Se nenhuma lista específica estiver aberta
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
          <p style="margin:4px 0 0; color:var(--muted); font-size:0.86rem;">Gerencie suas compras de supermercado, feira ou eventos com cálculo em tempo real.</p>
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
          <div style="width:56px; height:56px; border-radius:50%; background:var(--brand-soft); display:inline-flex; align-items:center; justify-content:center; margin-bottom:12px;">
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
        const items = l.items || [];
        const totalChecked = items.filter(i => i.is_checked).length;
        const totalCost = items.filter(i => i.is_checked).reduce((acc, i) => acc + Number(i.price || 0), 0);
        const percent = items.length > 0 ? Math.round((totalChecked / items.length) * 100) : 0;

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
                ${totalChecked} de ${items.length} itens comprados (${percent}%)
              </div>

              <div style="background:var(--surface-2); border-radius:8px; height:6px; overflow:hidden; margin-bottom:16px;">
                <div style="background:var(--brand); height:100%; width:${percent}%; transition:width 0.3s ease;"></div>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--line); padding-top:12px; margin-top:6px;">
              <div>
                <span style="font-size:0.75rem; color:var(--muted); font-weight:700; text-transform:uppercase;">Total Comprado</span>
                <div style="font-size:1.15rem; font-weight:800; color:var(--brand);">${formatCurrency(totalCost)}</div>
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

  // Visualização 2: Detalhes de Uma Lista Específica
  function renderSingleListDetail(container, list) {
    const items = list.items || [];
    const totalChecked = items.filter(i => i.is_checked).length;
    const totalCost = items.filter(i => i.is_checked).reduce((acc, i) => acc + Number(i.price || 0), 0);

    let html = `
      <!-- CABEÇALHO DA LISTA ATIVA -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <button type="button" class="btn soft" id="btnBackToShoppingLists" style="border-radius:10px; font-weight:700; display:flex; align-items:center; gap:6px;">
            ← Todas as Listas
          </button>
          <div>
            <h2 style="margin:0; font-size:1.35rem; font-weight:800; color:var(--text); display:flex; align-items:center; gap:8px;">
              ${escapeHtml(list.name)}
              <button type="button" class="icon-btn small" id="btnEditCurrentListName" title="Renomear Lista" style="display:inline-flex;">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:13px; height:13px;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              </button>
            </h2>
            <p style="margin:2px 0 0; color:var(--muted); font-size:0.84rem;">${totalChecked} de ${items.length} itens marcados como comprados</p>
          </div>
        </div>

        <div style="background:var(--surface-2); padding:10px 18px; border-radius:12px; border:1px solid var(--line); text-align:right;">
          <div style="font-size:0.75rem; color:var(--muted); font-weight:700; text-transform:uppercase;">Total no Carrinho</div>
          <div style="font-size:1.3rem; font-weight:800; color:var(--brand);">${formatCurrency(totalCost)}</div>
        </div>
      </div>

      <!-- FORMULÁRIO DE ADICIONAR ITEM -->
      <div class="card section-card full-width" style="padding:16px 20px; margin-bottom:18px; border-radius:14px;">
        <form id="formAddShoppingItem" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <input type="text" id="inputShoppingItemName" placeholder="Nome do item (ex: Arroz, Leite, Pão...)" required
            style="flex:2; min-width:200px; padding:10px 14px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.92rem;">
          
          <select id="selectShoppingItemCategory" style="flex:1; min-width:140px; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-weight:600;">
            ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>

          <button type="submit" class="btn primary" style="border-radius:10px; font-weight:800; display:flex; align-items:center; gap:6px;">
            <svg class="svg-icon" viewBox="0 0 24 24" style="width:16px; height:16px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            + Adicionar
          </button>
        </form>
      </div>

      <!-- BARRA DE FILTROS -->
      <div style="display:flex; justify-content:space-between; align-items:center; gap:14px; margin-bottom:18px; flex-wrap:wrap; background:var(--surface); padding:12px 18px; border-radius:12px; border:1px solid var(--line);">
        <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:220px;">
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
              const detailsText = isChecked
                ? `Qtd: <strong>${item.quantity} ${escapeHtml(item.unit)}</strong> • Total: <strong style="color:var(--brand);">${formatCurrency(item.price)}</strong>`
                : `<span style="color:var(--muted); font-style:italic;">Aguardando compra no mercado...</span>`;

              return `
                <div class="entry-row" style="padding:10px 14px; border-radius:10px; background:var(--surface-2); border:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:12px; ${isChecked ? 'opacity:0.85;' : ''}">
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

                  <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    ${!isChecked ? `
                      <button type="button" class="btn soft small" data-check-item="${item.id}" style="border-radius:8px; font-weight:700;">
                        Peguei
                      </button>
                    ` : `
                      <button type="button" class="btn soft small" data-uncheck-item="${item.id}" style="border-radius:8px; font-size:0.75rem;">
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
    $('#shoppingModalUnit')?.addEventListener('change', (e) => {
      const labelEl = $('#shoppingModalPriceLabel');
      if (labelEl) {
        labelEl.textContent = (e.target.value === 'un') ? 'Valor total pago ou valor unitário:' : 'Valor total pago (R$):';
      }
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
    editShoppingItemName
  };

  window.renderShoppingTab = renderShoppingTab;

})();
