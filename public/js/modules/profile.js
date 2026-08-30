/* ==========================================================================
   MODULO DE PERFIL, CATEGORIAS, DESTINOS & ORCAMENTOS (profile.js)
/* ==========================================================================
   MODULO DE PERFIL, CATEGORIAS, DESTINOS & ORCAMENTOS (profile.js)
   Financas Pro - Vanilla JS Architecture
   ========================================================================== */

(function() {
  'use strict';

  function updateCategorySelects() {
    const state = getState();
    const groupSelect = $('#entryGroup');
    const cats = Array.isArray(state.categories) ? state.categories : [];
    if (groupSelect) {
      const curVal = groupSelect.value;
      let opts = cats.map((c, idx) => {
        const name = (typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name);
        const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
        return `<option value="${escapeHtml(name)}" data-color="${color}">${escapeHtml(name)}</option>`;
      }).join('');
      groupSelect.innerHTML = opts;
      const hasCur = cats.some(c => ((typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name)) === curVal);
      if (curVal && hasCur) {
        groupSelect.value = curVal;
      } else if (cats.length > 0) {
        groupSelect.value = (typeof getCategoryName === 'function') ? getCategoryName(cats[0]) : (typeof cats[0] === 'string' ? cats[0] : cats[0].name);
      }
    }

    const fsCat = $('#fsCategoryFilter');
    if (fsCat) {
      const prev = fsCat.value;
      fsCat.innerHTML = `<option value="all">Todas as Categorias</option>` + cats.map(c => {
        const name = (typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name);
        return `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
      }).join('');
      if (prev) fsCat.value = prev;
    }
  }

  function getDestMeta(destName) {
    const state = getState();
    const found = state.destinations.find(d => d.name === destName);
    if (found) return found;
    return { name: destName || 'Gerais', color: '#1F7A5C', icon: 'card' };
  }

  function countUsage(type, name) {
    const state = getState();
    let count = 0;
    if (type === 'dest') {
      state.fixed.forEach(f => { if (f.destination === name) count++; });
      state.variable.forEach(v => { if (v.destination === name) count++; });
      state.debtors.forEach(d => { if (d.destination === name) count++; });
      state.assets.forEach(a => { if (a.destination === name) count++; });
    } else if (type === 'cat') {
      state.fixed.forEach(f => { if (f.group === name) count++; });
      state.variable.forEach(v => { if (v.group === name) count++; });
      state.extras.forEach(e => { if (e.source === name) count++; });
      state.assets.forEach(a => { if (a.category === name) count++; });
    }
    return count;
  }

  function updateDestinationSelects() {
    const state = getState();
    const opts = state.destinations.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
    $('#entryDestination').innerHTML = opts;
    $('#debtorDestination').innerHTML = opts;
    $('#assetDestination').innerHTML = opts;

    const destFilterSelect = $('#expensesDestFilter');
    if (destFilterSelect) {
      destFilterSelect.innerHTML = `<option value="all">Todos os Destinos</option>` + state.destinations.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
    }

    const tagsContainer = $('#destTagsList');
    if (tagsContainer) {
      tagsContainer.innerHTML = state.destinations.map(d => {
        const iconSvg = DEST_SVG_ICONS[d.icon] || DEST_SVG_ICONS.card;
        const usage = countUsage('dest', d.name);
        const isNative = (d.name.toLowerCase() === 'pix' || d.name.toLowerCase() === 'dinheiro');
        const dueText = d.dueDay ? `<small style="font-weight:800; opacity:0.85;">(Venc. dia ${d.dueDay})</small>` : (isNative ? `<small style="font-weight:800; opacity:0.75;">(À Vista)</small>` : '');
        const delTip = isNative ? 'Destino nativo protegido' : (usage > 0 ? `Em uso por ${usage} lançamento(s)` : 'Remover Destino');
        return `
          <span class="tag dest" style="border-radius:999px; padding:5px 12px; font-size:.78rem; font-weight:750; display:inline-flex; align-items:center; gap:6px; background:${d.color}22; color:${d.color}; border:1px solid ${d.color}55;">
            ${iconSvg} <strong>${escapeHtml(d.name)}</strong> ${dueText}
            <button type="button" data-edit-dest="${escapeHtml(d.name)}" data-tooltip="Editar Destino" aria-label="Editar Destino" style="background:transparent; border:none; color:inherit; cursor:pointer; font-weight:800; padding:0 2px; display:inline-flex; align-items:center; opacity:0.75;">
              ${ICONS.edit}
            </button>
            ${!isNative ? `
              <button type="button" data-del-dest="${escapeHtml(d.name)}" data-tooltip="${delTip}" aria-label="${delTip}" style="background:transparent; border:none; color:inherit; cursor:pointer; font-weight:800; padding:0 2px; display:inline-flex; align-items:center; opacity:0.75;">
                ${ICONS.close}
              </button>
            ` : ''}
          </span>
        `;
      }).join('');

      $$('[data-edit-dest]').forEach(b => {
        b.addEventListener('click', () => {
          const name = b.getAttribute('data-edit-dest');
          const dest = state.destinations.find(x => x.name === name);
          if (!dest) return;
          $('#newDestInput').value = dest.name;
          if ($('#newDestDueDay')) $('#newDestDueDay').value = dest.dueDay || '';
          $('#newDestColor').value = dest.color || '#1F7A5C';
          $('#newDestIcon').value = dest.icon || 'card';
          $('#editingDestOriginalName').value = dest.name;
          $('#addDestBtn').textContent = 'Salvar Alterações';
          notify(`Editando destino "${dest.name}". Altere os campos e clique em Salvar Alterações.`);
        });
      });

      $$('[data-del-dest]').forEach(b => {
        b.addEventListener('click', () => {
          const name = b.getAttribute('data-del-dest');
          if (!name) return;
          if (name.toLowerCase() === 'pix' || name.toLowerCase() === 'dinheiro' || name.toLowerCase() === 'em dinheiro') {
            notify('Destinos nativos (Pix e Dinheiro) são protegidos e não podem ser removidos.', 'warning');
            return;
          }
          const usage = countUsage('dest', name);
          if (usage > 0) {
            notify(`Não é possível excluir "${name}": este destino está em uso por ${usage} lançamento(s).`, 'warning');
            return;
          }
          state.destinations = state.destinations.filter(x => x.name !== name);
          saveState(); updateDestinationSelects(); render();
          notify(`Destino "${name}" removido.`, 'info');
        });
      });
    }

    const groupDatalist = $('#groupSuggestions');
    if (groupDatalist) {
      const cats = Array.isArray(state.categories) ? state.categories : [];
      groupDatalist.innerHTML = cats.map(c => `<option value="${escapeHtml((typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name))}">`).join('');
    }
  }

  function updateCategoryTagsList() {
    const state = getState();
    const container = $('#categoryTagsList');
    if (!container) return;

    let unbudgetedCount = 0;
    const cats = Array.isArray(state.categories) ? state.categories : [];

    container.innerHTML = cats.map((c, idx) => {
      const name = (typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name);
      const iconKey = (typeof c === 'object' && c.icon) ? c.icon : (window.DEFAULT_CATEGORY_ICONS_MAP[name] || 'tag');
      const iconSvg = window.CATEGORY_SVG_ICONS[iconKey] || window.CATEGORY_SVG_ICONS.tag;
      const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
      const budget = state.budgets[name] || 0;
      if (budget === 0) unbudgetedCount++;
      const usage = countUsage('cat', name);
      const delCatTip = usage > 0 ? `Em uso por ${usage} lançamento(s)` : 'Remover Categoria';

      return `
        <span class="tag" style="border-radius:999px; padding:5px 12px; font-size:.78rem; font-weight:750; display:inline-flex; align-items:center; gap:6px; background:${color}18; color:var(--text); border:1px solid ${color}44;">
          <span style="display:inline-flex; color:${color};">${iconSvg}</span>
          <strong>${escapeHtml(name)}</strong> ${budget > 0 ? `<small style="color:var(--brand); font-weight:800;">(${currency(budget)})</small>` : `<small style="color:var(--warning); font-weight:700;">(Sem Teto)</small>`}
          <button type="button" data-edit-cat="${escapeHtml(name)}" data-tooltip="Editar Categoria / Teto / Ícone" aria-label="Editar Categoria / Teto / Ícone" style="background:transparent; border:none; color:inherit; cursor:pointer; font-weight:800; padding:0 2px; display:inline-flex; align-items:center; opacity:0.75;">
            ${ICONS.edit}
          </button>
          <button type="button" data-del-cat="${escapeHtml(name)}" data-tooltip="${delCatTip}" aria-label="${delCatTip}" style="background:transparent; border:none; color:inherit; cursor:pointer; font-weight:800; padding:0 2px; display:inline-flex; align-items:center; opacity:0.75;">
            ${ICONS.close}
          </button>
        </span>
      `;
    }).join('');

    const alertBanner = $('#unbudgetedCategoriesAlert');
    if (alertBanner) {
      if (unbudgetedCount > 0) {
        $('#unbudgetedCategoriesText').innerHTML = `Você possui <strong>${unbudgetedCount} categoria(s)</strong> sem teto de gastos configurado! Defina um valor limite acima.`;
        alertBanner.hidden = false;
      } else {
        alertBanner.hidden = true;
      }
    }

    $$('[data-edit-cat]').forEach(b => {
      b.addEventListener('click', () => {
        const catName = b.getAttribute('data-edit-cat');
        const catObj = (state.categories || []).find(x => ((typeof getCategoryName === 'function') ? getCategoryName(x) : (typeof x === 'string' ? x : x.name)) === catName);
        $('#newCategoryInput').value = catName;
        if ($('#newCategoryIcon')) {
          $('#newCategoryIcon').value = (typeof catObj === 'object' && catObj.icon) ? catObj.icon : (window.DEFAULT_CATEGORY_ICONS_MAP[catName] || 'tag');
        }
        $('#newCategoryBudgetInput').value = state.budgets[catName] || '';
        $('#editingCategoryOriginalName').value = catName;
        $('#addCategoryBtn').textContent = 'Salvar Categoria';
        notify(`Editando categoria "${catName}". Altere o ícone, teto ou nome e clique em Salvar Categoria.`);
      });
    });

    $$('[data-del-cat]').forEach(b => {
      b.addEventListener('click', () => {
        const catName = b.getAttribute('data-del-cat');
        if (!catName) return;
        const usage = countUsage('cat', catName);
        if (usage > 0) {
          notify(`Não é possível excluir "${catName}": ela está em uso por ${usage} lançamento(s).`, 'warning');
          return;
        }
        state.categories = (state.categories || []).filter(x => ((typeof getCategoryName === 'function') ? getCategoryName(x) : (typeof x === 'string' ? x : x.name)) !== catName);
        delete state.budgets[catName];
        saveState(); updateDestinationSelects(); updateCategorySelects(); updateCategoryTagsList(); render();
        notify(`Categoria "${catName}" removida.`, 'info');
      });
    });
  }

  function renderProfile() {
    if (typeof window.isStateHydrated === 'function' && !window.isStateHydrated()) return;
    const state = getState();
    if (!state) return;
    const profName = $('#profName');
    const profSalary = $('#profSalary');
    const profBen = $('#profBenefit');

    if (profName && document.activeElement !== profName) {
      profName.value = state.profile?.name || '';
    }
    if (profSalary && document.activeElement !== profSalary) {
      profSalary.value = state.profile?.baseSalary != null ? state.profile.baseSalary : '';
    }
    if (profBen && document.activeElement !== profBen) {
      profBen.value = state.benefitsConfig?.amount != null
        ? state.benefitsConfig.amount
        : (Number(state.benefitsConfig?.va || 0) + Number(state.benefitsConfig?.vr || 0));
    }
  }

  function initProfileForm() {
    renderProfile();

    $('#profileForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const state = getState();
      state.profile.name = $('#profName').value.trim();
      state.profile.baseSalary = Number($('#profSalary').value) || 0;
      state.benefitsConfig = state.benefitsConfig || { amount: 0 };
      const benVal = Number($('#profBenefit')?.value) || 0;
      state.benefitsConfig.amount = benVal;
      saveState(); render();
      notify('Perfil e Benefícios atualizados com sucesso!', 'success');
    });

    $$('.color-swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = btn.getAttribute('data-color');
        if (c && $('#newDestColor')) {
          $('#newDestColor').value = c;
        }
      });
    });

    $('#addDestBtn')?.addEventListener('click', () => {
      const state = getState();
      const val = $('#newDestInput').value.trim();
      const dueDayInput = $('#newDestDueDay')?.value;
      const dueDayNum = Number(dueDayInput);
      const isNative = (val.toLowerCase() === 'pix' || val.toLowerCase() === 'dinheiro');
      const dueDay = (!isNative && dueDayInput !== '' && dueDayNum >= 1 && dueDayNum <= 31) ? dueDayNum : null;
      const color = $('#newDestColor').value || '#1F7A5C';
      const icon = $('#newDestIcon').value || (val.toLowerCase() === 'pix' ? 'dollar' : (val.toLowerCase() === 'dinheiro' ? 'wallet' : 'card'));
      const origName = $('#editingDestOriginalName').value;

      if (!val) { notify('Informe o nome do destino.', 'error'); return; }

      if (origName) {
        const idx = state.destinations.findIndex(d => d.name === origName);
        if (idx >= 0) state.destinations[idx] = { name: val, color, icon, dueDay };
        if (origName !== val) {
          state.fixed.forEach(f => { if (f.destination === origName) f.destination = val; });
          state.variable.forEach(v => { if (v.destination === origName) v.destination = val; });
          state.debtors.forEach(d => { if (d.destination === origName) d.destination = val; });
          state.assets.forEach(a => { if (a.destination === origName) a.destination = val; });
        }
        $('#editingDestOriginalName').value = '';
        $('#addDestBtn').textContent = 'Adicionar';
        notify(`Destino "${val}" atualizado com sucesso!`, 'success');
      } else {
        const existingIdx = state.destinations.findIndex(d => d.name === val);
        if (existingIdx >= 0) { state.destinations[existingIdx] = { name: val, color, icon, dueDay }; }
        else { state.destinations.push({ name: val, color, icon, dueDay }); }
        notify(`Destino "${val}" adicionado com sucesso!`, 'success');
      }

      $('#newDestInput').value = '';
      if ($('#newDestDueDay')) $('#newDestDueDay').value = '';
      saveState(); updateDestinationSelects(); render();
    });

    $('#addCategoryBtn')?.addEventListener('click', () => {
      const state = getState();
      const catName = $('#newCategoryInput').value.trim();
      const icon = $('#newCategoryIcon')?.value || 'tag';
      const budgetVal = Number($('#newCategoryBudgetInput').value) || 0;
      const origCat = $('#editingCategoryOriginalName').value;

      if (!catName) { notify('Informe o nome da categoria.', 'error'); return; }

      state.categories = Array.isArray(state.categories) ? state.categories : [];

      if (origCat) {
        const idx = state.categories.findIndex(x => ((typeof getCategoryName === 'function') ? getCategoryName(x) : (typeof x === 'string' ? x : x.name)) === origCat);
        if (idx >= 0) state.categories[idx] = { name: catName, icon };
        delete state.budgets[origCat];
        if (budgetVal > 0) state.budgets[catName] = budgetVal;

        if (origCat !== catName) {
          state.fixed.forEach(f => { if (f.group === origCat) f.group = catName; });
          state.variable.forEach(v => { if (v.group === origCat) v.group = catName; });
          state.extras.forEach(e => { if (e.source === origCat) e.source = catName; });
          state.assets.forEach(a => { if (a.category === origCat) a.category = catName; });
        }
        $('#editingCategoryOriginalName').value = '';
        $('#addCategoryBtn').textContent = 'Adicionar Categoria';
        notify(`Categoria "${catName}" atualizada com sucesso!`, 'success');
      } else {
        const existingIdx = state.categories.findIndex(x => ((typeof getCategoryName === 'function') ? getCategoryName(x) : (typeof x === 'string' ? x : x.name)) === catName);
        if (existingIdx >= 0) {
          state.categories[existingIdx] = { name: catName, icon };
        } else {
          state.categories.push({ name: catName, icon });
        }
        if (budgetVal > 0) state.budgets[catName] = budgetVal;
        else delete state.budgets[catName];
        notify(`Categoria "${catName}" cadastrada com sucesso!`, 'success');
      }

      $('#newCategoryInput').value = '';
      if ($('#newCategoryIcon')) $('#newCategoryIcon').value = 'tag';
      $('#newCategoryBudgetInput').value = '';

      saveState(); updateDestinationSelects(); updateCategorySelects(); updateCategoryTagsList(); render();
    });
  }

  // Bridges publicas autorizadas
  window.updateCategorySelects = updateCategorySelects;
  window.updateDestinationSelects = updateDestinationSelects;
  window.updateCategoryTagsList = updateCategoryTagsList;
  window.getDestMeta = getDestMeta;
  window.renderProfile = renderProfile;
  window.renderProfileTab = renderProfile;
  window.initProfileModule = initProfileForm;
})();
