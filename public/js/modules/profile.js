/* ==========================================================================
   MODULO DE PERFIL, CATEGORIAS, DESTINOS & ORCAMENTOS (profile.js)
   Financas Pro - Vanilla JS Architecture
   ========================================================================== */

(function() {
  'use strict';

function updateCategorySelects() {
    const state = getState();
        const groupSelect = $('#entryGroup');
        if (groupSelect) {
          const curVal = groupSelect.value;
          let opts = state.categories.map((c, idx) => {
            const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
            return `<option value="${escapeHtml(c)}" data-color="${color}">🏷️ ${escapeHtml(c)}</option>`;
          }).join('');
          opts += `<option value="__NEW_CATEGORY__" style="font-weight:800; color:var(--brand);">➕ + Nova Categoria...</option>`;
          groupSelect.innerHTML = opts;
          if (curVal && state.categories.includes(curVal)) {
            groupSelect.value = curVal;
          } else if (state.categories.length > 0) {
            groupSelect.value = state.categories[0];
          }
        }

        const fsCat = $('#fsCategoryFilter');
        if (fsCat) {
          const prev = fsCat.value;
          fsCat.innerHTML = `<option value="all">Todas as Categorias</option>` + state.categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
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
            return `
          <span class="tag dest" style="border-radius:999px; padding:5px 12px; font-size:.78rem; font-weight:750; display:inline-flex; align-items:center; gap:6px; background:${d.color}22; color:${d.color}; border:1px solid ${d.color}55;">
            ${iconSvg} <strong>${escapeHtml(d.name)}</strong>
            <button type="button" data-edit-dest="${escapeHtml(d.name)}" title="Editar Destino" style="background:transparent; border:none; color:inherit; cursor:pointer; font-weight:800; padding:0 2px; display:inline-flex; align-items:center; opacity:0.75;">
              ${ICONS.edit}
            </button>
            <button type="button" data-del-dest="${escapeHtml(d.name)}" title="${usage > 0 ? `Em uso por ${usage} lançamento(s)` : 'Remover Destino'}" style="background:transparent; border:none; color:inherit; cursor:pointer; font-weight:800; padding:0 2px; display:inline-flex; align-items:center; opacity:0.75;">
              ${ICONS.close}
            </button>
          </span>
        `;
          }).join('');

          $$('[data-edit-dest]').forEach(b => {
            b.addEventListener('click', () => {
              const name = b.getAttribute('data-edit-dest');
              const dest = state.destinations.find(x => x.name === name);
              if (!dest) return;
              $('#newDestInput').value = dest.name;
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
          groupDatalist.innerHTML = state.categories.map(c => `<option value="${escapeHtml(c)}">`).join('');
        }
      }

      function updateCategoryTagsList() {
    const state = getState();
        const container = $('#categoryTagsList');
        if (!container) return;

        let unbudgetedCount = 0;

        container.innerHTML = state.categories.map(c => {
          const budget = state.budgets[c] || 0;
          if (budget === 0) unbudgetedCount++;
          const usage = countUsage('cat', c);

          return `
        <span class="tag" style="border-radius:999px; padding:5px 12px; font-size:.78rem; font-weight:750; display:inline-flex; align-items:center; gap:6px; background:var(--surface-2); color:var(--text); border:1px solid var(--line);">
          🏷️ <strong>${escapeHtml(c)}</strong> ${budget > 0 ? `<small style="color:var(--brand); font-weight:800;">(${currency(budget)})</small>` : `<small style="color:var(--warning); font-weight:700;">(Sem Teto)</small>`}
          <button type="button" data-edit-cat="${escapeHtml(c)}" title="Editar Categoria / Teto" style="background:transparent; border:none; color:inherit; cursor:pointer; font-weight:800; padding:0 2px; display:inline-flex; align-items:center; opacity:0.75;">
            ${ICONS.edit}
          </button>
          <button type="button" data-del-cat="${escapeHtml(c)}" title="${usage > 0 ? `Em uso por ${usage} lançamento(s)` : 'Remover Categoria'}" style="background:transparent; border:none; color:inherit; cursor:pointer; font-weight:800; padding:0 2px; display:inline-flex; align-items:center; opacity:0.75;">
            ${ICONS.close}
          </button>
        </span>
      `;
        }).join('');

        const alertBanner = $('#unbudgetedCategoriesAlert');
        if (alertBanner) {
          if (unbudgetedCount > 0) {
            $('#unbudgetedCategoriesText').innerHTML = `⚠️ Você possui <strong>${unbudgetedCount} categoria(s)</strong> sem teto de gastos configurado! Defina um valor limite acima.`;
            alertBanner.hidden = false;
          } else {
            alertBanner.hidden = true;
          }
        }

        $$('[data-edit-cat]').forEach(b => {
          b.addEventListener('click', () => {
            const cat = b.getAttribute('data-edit-cat');
            $('#newCategoryInput').value = cat;
            $('#newCategoryBudgetInput').value = state.budgets[cat] || '';
            $('#editingCategoryOriginalName').value = cat;
            $('#addCategoryBtn').textContent = 'Salvar Categoria';
            notify(`Editando categoria "${cat}". Altere o teto ou nome e clique em Salvar.`, 'info');
          });
        });

        $$('[data-del-cat]').forEach(b => {
          b.addEventListener('click', () => {
            const cat = b.getAttribute('data-del-cat');
            if (!cat) return;
            const usage = countUsage('cat', cat);
            if (usage > 0) {
              notify(`Não é possível excluir "${cat}": ela está em uso por ${usage} lançamento(s).`, 'warning');
              return;
            }
            state.categories = state.categories.filter(x => x !== cat);
            delete state.budgets[cat];
            saveState(); updateDestinationSelects(); updateCategoryTagsList(); render();
            notify(`Categoria "${cat}" removida.`, 'info');
          });
        });
      }

function initProfileForm() {
    const state = getState();
        $('#profName').value = state.profile.name || '';
        $('#profSalary').value = state.profile.baseSalary || 0;
        const profBen = $('#profBenefit');
        if (profBen) {
          profBen.value = state.benefitsConfig?.amount != null
            ? state.benefitsConfig.amount
            : (Number(state.benefitsConfig?.va || 0) + Number(state.benefitsConfig?.vr || 0));
        }

        $('#profileForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const state = getState();
        state.profile.name = $('#profName').value.trim();
          state.profile.baseSalary = Number($('#profSalary').value) || 0;
          state.benefitsConfig = state.benefitsConfig || { amount: 0 };
          const benVal = Number($('#profBenefit')?.value) || 0;
          state.benefitsConfig.amount = benVal;
          saveState(); render();
          notify('Perfil e Vale Benefício atualizados com sucesso!', 'success');
        });

        $$('.color-swatch-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const c = btn.getAttribute('data-color');
            if (c && $('#newDestColor')) {
              $('#newDestColor').value = c;
            }
          });
        });

        $('#addDestBtn').addEventListener('click', () => {
          const state = getState();
        const val = $('#newDestInput').value.trim();
          const color = $('#newDestColor').value || '#1F7A5C';
          const icon = $('#newDestIcon').value || 'card';
          const origName = $('#editingDestOriginalName').value;

          if (!val) { notify('Informe o nome do destino.', 'error'); return; }

          if (origName) {
            const idx = state.destinations.findIndex(d => d.name === origName);
            if (idx >= 0) state.destinations[idx] = { name: val, color, icon };
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
            if (existingIdx >= 0) { state.destinations[existingIdx] = { name: val, color, icon }; }
            else { state.destinations.push({ name: val, color, icon }); }
            notify(`Destino "${val}" adicionado com sucesso!`, 'success');
          }

          $('#newDestInput').value = '';
          saveState(); updateDestinationSelects(); render();
        });

        $('#addCategoryBtn').addEventListener('click', () => {
          const state = getState();
        const catName = $('#newCategoryInput').value.trim();
          const budgetVal = Number($('#newCategoryBudgetInput').value) || 0;
          const origCat = $('#editingCategoryOriginalName').value;

          if (!catName) { notify('Informe o nome da categoria.', 'error'); return; }

          if (origCat) {
            const idx = state.categories.indexOf(origCat);
            if (idx >= 0) state.categories[idx] = catName;
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
            if (!state.categories.includes(catName)) state.categories.push(catName);
            if (budgetVal > 0) state.budgets[catName] = budgetVal;
            else delete state.budgets[catName];
            notify(`Categoria "${catName}" cadastrada com sucesso!`, 'success');
          }

          $('#newCategoryInput').value = '';
          $('#newCategoryBudgetInput').value = '';

          saveState(); updateDestinationSelects(); updateCategoryTagsList(); render();
        });
      }

  // Bridges publicas autorizadas (consumidas pelo render() central e outros modulos)
  window.updateCategorySelects = updateCategorySelects;
  window.updateDestinationSelects = updateDestinationSelects;
  window.updateCategoryTagsList = updateCategoryTagsList;
  window.getDestMeta = getDestMeta;

  // Inicializacao sincrona dos formulários e listeners do dominio
  try {
    initProfileForm();
  } catch (err) {
    console.error('Erro ao inicializar profile.js:', err);
  }
})();
