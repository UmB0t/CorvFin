/* ==========================================================================
   MODULO DE DESPESAS OPERACIONAIS (expenses.js)
   Financas Pro - Vanilla JS Architecture
   ========================================================================== */

(function() {
  'use strict';

  // Estado Privado do Modulo
  let entryDlgState = { mode: 'new', type: 'fixed', id: null, fixedId: null };
  let fsSortKey = 'name';
  let fsSortAsc = true;

function getDueDateLabel(item) {
        let dueText = '';
        if (item.dueDay && Number(item.dueDay) >= 1 && Number(item.dueDay) <= 31) {
          dueText = `Dia ${item.dueDay}`;
        }

        if (item.itemType === 'fixed') {
          return dueText ? `${dueText} (Mensal)` : `Desde ${MONTH_ABBR[(item.effMonth || 1) - 1]}/${item.effYear || ''}`;
        } else if (item.itemType === 'variable') {
          const totalContract = item.installmentTotal ? Number(item.amount) * Number(item.installmentTotal) : null;
          const totalText = totalContract ? ` • Total ${currency(totalContract)}` : '';
          const parc = (item.installmentIndex && item.installmentTotal) ? `[Parc. ${item.installmentIndex}/${item.installmentTotal}${totalText}]` : '';
          return dueText ? `${dueText} ${parc}`.trim() : (parc || 'Variável');
        } else if (item.itemType === 'extra') {
          return dueText || `Vigência: ${MONTH_ABBR[(item.startMonth || 1) - 1]}/${item.startYear} a ${MONTH_ABBR[(item.endMonth || 1) - 1]}/${item.endYear}`;
        } else if (item.itemType === 'debtor') {
          const totalDebt = item.installmentTotal ? Number(item.amount) * Number(item.installmentTotal) : null;
          const totalText = totalDebt ? ` • Total ${currency(totalDebt)}` : '';
          const parc = (item.installmentIndex && item.installmentTotal) ? `Parc. ${item.installmentIndex}/${item.installmentTotal}${totalText}` : '';
          return dueText ? `${dueText} (${parc})` : parc || 'Mensal';
        }
        return dueText || 'Mensal';
      }

function openFullscreenTable(presetType) {
    const state = getState();
        const dlg = $('#fullscreenTableDialog');

        const typeSelect = $('#fsTypeFilter');
        if (presetType) {
          typeSelect.value = presetType;
          $('#fsModalTitle').textContent = `Tabela de ${presetType === 'fixed' ? 'Despesas Fixas' : 'Despesas Variáveis'}`;
        } else {
          typeSelect.value = 'all';
          $('#fsModalTitle').textContent = `Visão Completa em Tabela (Estilo Excel)`;
        }

        const destSelect = $('#fsDestFilter');
        destSelect.innerHTML = `<option value="all">Todos os Destinos</option>` + state.destinations.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');

        const catSelect = $('#fsCategoryFilter');
        catSelect.innerHTML = `<option value="all">Todas as Categorias</option>` + state.categories.map(c => {
          const name = (typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name);
          return `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
        }).join('');

        renderFullscreenTable();
        dlg.showModal();
      }

function renderFullscreenTable() {
    const state = getState();
        const y = state.year, m = state.month;
        const fixed = activeFixedForMonth(y, m).map(f => Object.assign({ typeName: 'Fixa', itemType: 'fixed' }, f));
        const variable = activeVariableForMonth(y, m).map(v => Object.assign({ typeName: 'Variável', itemType: 'variable' }, v));
        const extras = activeExtrasForMonth(y, m).map(e => Object.assign({ typeName: 'Extra', itemType: 'extra', name: e.title, group: e.source }, e));
        const debtors = activeDebtorsForMonth(y, m).map(d => Object.assign({ typeName: 'Devedor', itemType: 'debtor', name: `${d.debtorName} — ${d.title}`, group: 'Devedor' }, d));

        let allItems = [...fixed, ...variable, ...extras, ...debtors];

        const query = ($('#fsSearchInput').value || '').toLowerCase().trim();
        const typeFilter = $('#fsTypeFilter').value;
        const destFilter = $('#fsDestFilter').value;
        const catFilter = $('#fsCategoryFilter').value;
        const statusFilter = $('#fsStatusFilter').value;

        allItems = allItems.filter(item => {
          if (typeFilter !== 'all' && item.itemType !== typeFilter) return false;
          if (destFilter !== 'all' && item.destination !== destFilter) return false;
          if (catFilter !== 'all' && item.group !== catFilter) return false;
          if (statusFilter !== 'all' && item.status !== statusFilter) return false;
          if (query) {
            const text = `${item.name} ${item.group} ${item.destination} ${item.note || ''}`.toLowerCase();
            if (!text.includes(query)) return false;
          }
          return true;
        });

        allItems.sort((a, b) => {
          let valA = a[fsSortKey] || '';
          let valB = b[fsSortKey] || '';

          if (fsSortKey === 'amount') { valA = Number(valA) || 0; valB = Number(valB) || 0; }
          else if (fsSortKey === 'dueDay') { valA = Number(valA) || 99; valB = Number(valB) || 99; }
          else { valA = String(valA).toLowerCase(); valB = String(valB).toLowerCase(); }

          if (valA < valB) return fsSortAsc ? -1 : 1;
          if (valA > valB) return fsSortAsc ? 1 : -1;
          return 0;
        });

        $('#fsTableSummary').textContent = `Exibindo ${allItems.length} lançamentos em ${MONTH_NAMES[m - 1]}/${y}`;

        const tbody = $('#fsTableBody');
        if (allItems.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--muted)">Nenhum lançamento encontrado para os filtros selecionados.</td></tr>`;
          return;
        }

        tbody.innerHTML = allItems.map(item => {
          const destMeta = getDestMeta(item.destination);
          const iconSvg = DEST_SVG_ICONS[destMeta.icon] || DEST_SVG_ICONS.card;
          const isPaid = item.status === 'pago';
          const dueLabel = getDueDateLabel(item);

          return `
        <tr>
          <td><span class="tag">${item.typeName}</span></td>
          <td><strong>${escapeHtml(item.name)}</strong></td>
          <td class="num font-weight:800;">${currency(item.amount)}</td>
          <td><span class="tag">${escapeHtml(item.group || 'Gerais')}</span></td>
          <td>
            <span class="tag dest" style="background:${destMeta.color}22; color:${destMeta.color}; border:1px solid ${destMeta.color}44;">
              ${iconSvg} ${escapeHtml(item.destination || 'Nubank')}
            </span>
          </td>
          <td><span class="tag">${escapeHtml(dueLabel)}</span></td>
          <td><span class="badge ${isPaid ? 'success' : 'warning'}">${isPaid ? 'Pago' : 'Pendente'}</span></td>
        </tr>
      `;
        }).join('');
      }

function reorderExpenses(type, sourceKey, targetKey) {
    const state = getState();
        if (sourceKey === targetKey) return;

        if (type === 'fixed') {
          const sIdx = state.fixed.findIndex(f => f.id === sourceKey);
          const tIdx = state.fixed.findIndex(f => f.id === targetKey);
          if (sIdx !== -1 && tIdx !== -1) {
            const [moved] = state.fixed.splice(sIdx, 1);
            state.fixed.splice(tIdx, 0, moved);
          }
        } else if (type === 'variable') {
          const sIdx = state.variable.findIndex(v => v.id === sourceKey);
          const tIdx = state.variable.findIndex(v => v.id === targetKey);
          if (sIdx !== -1 && tIdx !== -1) {
            const [moved] = state.variable.splice(sIdx, 1);
            state.variable.splice(tIdx, 0, moved);
          }
        }

        const allOrderedIds = [
          ...state.fixed.map(f => f.id),
          ...state.variable.map(v => v.id)
        ];
        state.customExpensesOrder = allOrderedIds;

        const sortSelect = $('#expensesSortFilter');
        if (sortSelect) sortSelect.value = 'custom';

        saveState();
        render();
        notify('Ordem das despesas atualizada com sucesso!');
      }

function moveExpenseToEndOfList(type, sourceKey) {
    const state = getState();
        if (type === 'fixed') {
          const sIdx = state.fixed.findIndex(f => f.id === sourceKey);
          if (sIdx !== -1) {
            const [moved] = state.fixed.splice(sIdx, 1);
            state.fixed.push(moved);
          }
        } else if (type === 'variable') {
          const sIdx = state.variable.findIndex(v => v.id === sourceKey);
          if (sIdx !== -1) {
            const [moved] = state.variable.splice(sIdx, 1);
            state.variable.push(moved);
          }
        }

        const allOrderedIds = [
          ...state.fixed.map(f => f.id),
          ...state.variable.map(v => v.id)
        ];
        state.customExpensesOrder = allOrderedIds;

        const sortSelect = $('#expensesSortFilter');
        if (sortSelect) sortSelect.value = 'custom';

        saveState();
        render();
        notify('Ordem das despesas atualizada com sucesso!');
      }

function getFixedActiveMonths(fixedItem, year) {
    const state = getState();
        if (!fixedItem) return [state.month];
        const targetY = year;
        const activeMonths = [];
        for (let m = 1; m <= 12; m++) {
          const target = mk(targetY, m);
          if (fixedItem.endedFrom && target >= mk(fixedItem.endedFrom.year, fixedItem.endedFrom.month)) continue;
          const versions = fixedItem.versions ? [...fixedItem.versions].sort((a, b) => mk(a.year, a.month) - mk(b.year, b.month)) : [];
          let active = null;
          for (const v of versions) {
            if (mk(v.year, v.month) <= target) active = v; else break;
          }
          if (active) activeMonths.push(m);
        }
        return activeMonths.length ? activeMonths : [state.month];
      }

function getVariableActiveMonths(varItem, year) {
    const state = getState();
        if (!varItem) return [state.month];
        const activeMonths = [];
        for (let m = 1; m <= 12; m++) {
          const target = mk(year, m);
          if (target >= mk(varItem.startYear, varItem.startMonth) && target <= mk(varItem.endYear, varItem.endMonth)) {
            activeMonths.push(m);
          }
        }
        return activeMonths.length ? activeMonths : [state.month];
      }

function highlightRibbonMonths(monthsArray) {
        if (!monthsArray || !monthsArray.length) return;
        $$('.ribbon-col').forEach(col => {
          const m = Number(col.dataset.month);
          if (monthsArray.includes(m)) {
            col.classList.add('highlight-month', 'ribbon-highlight');
            col.classList.remove('dimmed-month', 'ribbon-dimmed');
          } else {
            col.classList.remove('highlight-month', 'ribbon-highlight');
            col.classList.add('dimmed-month', 'ribbon-dimmed');
          }
        });
      }

function clearRibbonHighlight() {
        $$('.ribbon-col').forEach(col => {
          col.classList.remove('highlight-month', 'ribbon-highlight', 'dimmed-month', 'ribbon-dimmed');
        });
      }

function buildEntryRow({
        id, fixedId, type, title, tags = [], amount, status, dueDay, destination,
        onClickToggleStatus, onClickEdit, onClickTimeline, onMouseEnter, onMouseLeave,
        customLeftBadge, onDelete
      }) {
    const state = getState();
        const row = document.createElement('div');
        row.className = 'entry-row';
        const itemKey = fixedId || id;

        row.setAttribute('draggable', 'true');
        row.dataset.entryId = itemKey;
        row.dataset.entryType = type;

        const isPaid = status === 'pago';
        let leftIconHtml = '';

        if (customLeftBadge) {
          leftIconHtml = customLeftBadge;
        } else if (onClickToggleStatus) {
          const statusTip = isPaid ? 'Marcado como Pago/Recebido. Clique para alternar' : 'Pendente. Clique para marcar como Pago/Recebido';
          leftIconHtml = `
            <button type="button" class="status-btn ${isPaid ? 'paid' : 'pending'}" data-tooltip="${statusTip}" aria-label="${statusTip}">
              ${isPaid ? ICONS.check : ICONS.clock}
            </button>`;
        }

        const now = new Date();
        const isCurrentMonthView = state.year === now.getFullYear() && state.month === (now.getMonth() + 1);
        let dueTagHtml = '';

        if (dueDay && Number(dueDay) >= 1 && Number(dueDay) <= 31) {
          if (!isPaid && isCurrentMonthView) {
            const currentDay = now.getDate();
            const diff = Number(dueDay) - currentDay;
            if (diff < 0) { dueTagHtml = `<span class="tag overdue">Vencido há ${Math.abs(diff)} dia(s)</span>`; }
            else if (diff <= 3) { dueTagHtml = `<span class="tag due">Vence em ${diff === 0 ? 'HOJE' : diff + ' dia(s)'}</span>`; }
            else { dueTagHtml = `<span class="tag">Vence dia ${dueDay}</span>`; }
          } else {
            dueTagHtml = `<span class="tag">Vence dia ${dueDay}</span>`;
          }
        }

        const destMeta = destination ? getDestMeta(destination) : null;
        const destIconSvg = destMeta ? (DEST_SVG_ICONS[destMeta.icon] || DEST_SVG_ICONS.card) : '';
        const destPillHtml = (destination && destination !== 'Renda Extra') ? `
      <span class="tag dest" style="background:${destMeta.color}22; color:${destMeta.color}; border:1px solid ${destMeta.color}44;">
        ${destIconSvg} ${escapeHtml(destination)}
      </span>` : '';

        const dragHandleTitle = (type === 'fixed' || type === 'variable')
          ? 'Arraste para reordenar ou converter entre Fixa e Variável'
          : 'Arraste para reordenar este item';

        const dragHandleHtml = `
      <span class="drag-handle" data-tooltip="${dragHandleTitle}" aria-label="${dragHandleTitle}">
        <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px;"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
      </span>`;

        const timelineBtnHtml = (type === 'fixed' || type === 'variable') ? `
      <button type="button" class="icon-btn small timeline-btn" data-tooltip="Ver Evolução & Linha do Tempo" aria-label="Ver Evolução & Linha do Tempo">${ICONS.timeline || '<svg class="svg-icon" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'}</button>` : '';

        const editBtnHtml = onClickEdit ? `
      <button type="button" class="icon-btn small edit-btn" data-tooltip="Editar Lançamento" aria-label="Editar Lançamento">${ICONS.edit}</button>` : '';

        const deleteBtnHtml = onDelete ? `
      <button type="button" class="icon-btn small delete-btn" data-tooltip="Excluir Lançamento" aria-label="Excluir Lançamento" style="color:var(--danger);">${ICONS.close}</button>` : '';

        const amountClass = type === 'benefit' ? 'negative' : (isPaid ? 'positive' : '');

        row.innerHTML = `
      ${dragHandleHtml}
      ${leftIconHtml}
      <div class="entry-info">
        <div class="entry-title">${escapeHtml(title)}</div>
        <div class="entry-meta">
          ${destPillHtml}
          ${dueTagHtml}
          ${tags.filter(Boolean).map(t => {
            const isCat = (state.categories || []).some(c => ((typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name)) === t);
            if (isCat && typeof getCategoryIconSvg === 'function') {
              const iconSvg = getCategoryIconSvg(t);
              return `<span class="tag" style="display:inline-flex; align-items:center; gap:4px;">${iconSvg} ${escapeHtml(t)}</span>`;
            }
            return `<span class="tag">${escapeHtml(t)}</span>`;
          }).join('')}
        </div>
      </div>
      <div class="entry-amount num ${amountClass}">${currency(amount)}</div>
      <div class="entry-actions">
        ${timelineBtnHtml}
        ${editBtnHtml}
        ${deleteBtnHtml}
      </div>
    `;

        if (onClickToggleStatus) {
          const statusBtn = row.querySelector('.status-btn');
          if (statusBtn) statusBtn.addEventListener('click', (e) => { e.stopPropagation(); onClickToggleStatus(); });
        }
        if (onClickEdit) {
          const editBtn = row.querySelector('.edit-btn');
          if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); onClickEdit(); });
        }
        if (onDelete) {
          const delBtn = row.querySelector('.delete-btn');
          if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); onDelete(); });
        }

        const timelineBtn = row.querySelector('.timeline-btn');
        if (timelineBtn && onClickTimeline) {
          timelineBtn.addEventListener('click', (e) => { e.stopPropagation(); onClickTimeline(); });
        }

        if (onMouseEnter) row.addEventListener('mouseenter', onMouseEnter);
        if (onMouseLeave) row.addEventListener('mouseleave', onMouseLeave);

        // HTML5 Drag and Drop events (Global para todas as linhas)
        row.addEventListener('dragstart', (e) => {
          setDragItem({ type, id: itemKey, fixedId, itemKey });
          e.dataTransfer.setData('text/plain', itemKey);
          e.dataTransfer.effectAllowed = 'move';
          row.classList.add('dragging');
        });

        row.addEventListener('dragend', () => {
          clearDragItem();
          row.classList.remove('dragging');
          $$('.entry-row').forEach(r => r.classList.remove('drag-over'));
          $$('.section-body').forEach(b => b.classList.remove('drag-container-over'));
        });

        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          const cur = getDragItem();
          if (cur && cur.itemKey !== itemKey) {
            row.classList.add('drag-over');
          }
        });

        row.addEventListener('dragleave', () => {
          row.classList.remove('drag-over');
        });

        row.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          row.classList.remove('drag-over');
          $$('.section-body').forEach(b => b.classList.remove('drag-container-over'));
          const cur = getDragItem();
          if (!cur) return;

          const sourceType = cur.type;
          const sourceKey = cur.itemKey;
          const targetType = type;
          const targetKey = itemKey;

          if (sourceType === targetType && sourceKey !== targetKey) {
            if (sourceType === 'fixed' || sourceType === 'variable') {
              reorderExpenses(sourceType, sourceKey, targetKey);
            } else if (sourceType === 'extra') {
              reorderExtras(sourceKey, targetKey);
            } else if (sourceType === 'debtor') {
              reorderDebtors(sourceKey, targetKey);
            } else if (sourceType === 'benefit') {
              reorderBenefits(sourceKey, targetKey);
            }
          } else if (sourceType === 'variable' && targetType === 'fixed') {
            convertVariableToFixed(cur.id);
          } else if (sourceType === 'fixed' && targetType === 'variable') {
            openConvertFixedToVarDialog(cur.fixedId || cur.id);
          }
        });

        return row;
      }

function toggleExpenseStatus(type, idKey, currentStatus) {
    const state = getState();
        const newStatus = currentStatus === 'pago' ? 'pendente' : 'pago';
        const key = ymKey(state.year, state.month);

        if (type === 'fixed') {
          const item = state.fixed.find(f => f.id === idKey);
          if (item) { item.paidHistory = item.paidHistory || {}; item.paidHistory[key] = newStatus === 'pago'; }
        } else if (type === 'variable') {
          const item = state.variable.find(v => v.id === idKey);
          if (item) { item.paidHistory = item.paidHistory || {}; item.paidHistory[key] = newStatus === 'pago'; }
        } else if (type === 'extra') {
          const item = state.extras.find(e => e.id === idKey);
          if (item) { item.paidHistory = item.paidHistory || {}; item.paidHistory[key] = newStatus === 'pago'; }
        } else if (type === 'debtor') {
          const item = state.debtors.find(d => d.id === idKey);
          if (item) { item.paidHistory = item.paidHistory || {}; item.paidHistory[key] = newStatus === 'pago'; }
        }

        saveState(); render();
        notify(`Status alterado para "${newStatus === 'pago' ? 'Pago' : 'Pendente'}".`);
      }

function markAllSectionPaid(type) {
    const state = getState();
    const y = state.year, m = state.month;
    const key = ymKey(y, m);
    let count = 0;
    let totalItems = 0;

    const normType = String(type || '').toLowerCase();

    if (normType === 'fixed' || normType === 'fixas') {
      const items = activeFixedForMonth(y, m);
      totalItems = items.length;
      items.forEach(f => {
        if (f.status !== 'pago') {
          const item = state.fixed.find(x => x.id === f.fixedId);
          if (item) { item.paidHistory = item.paidHistory || {}; item.paidHistory[key] = true; count++; }
        }
      });
    } else if (normType === 'variable' || normType === 'variaveis') {
      const items = activeVariableForMonth(y, m);
      totalItems = items.length;
      items.forEach(v => {
        if (v.status !== 'pago') {
          const item = state.variable.find(x => x.id === v.id);
          if (item) { item.paidHistory = item.paidHistory || {}; item.paidHistory[key] = true; count++; }
        }
      });
    } else if (normType === 'extra' || normType === 'extras') {
      const items = activeExtrasForMonth(y, m);
      totalItems = items.length;
      items.forEach(e => {
        if (e.status !== 'pago') {
          const item = state.extras.find(x => x.id === e.id);
          if (item) { item.paidHistory = item.paidHistory || {}; item.paidHistory[key] = true; count++; }
        }
      });
    } else if (normType === 'debtor' || normType === 'debtors' || normType === 'devedores') {
      const items = activeDebtorsForMonth(y, m);
      totalItems = items.length;
      items.forEach(d => {
        if (d.status !== 'pago') {
          const item = state.debtors.find(x => x.id === d.id);
          if (item) { item.paidHistory = item.paidHistory || {}; item.paidHistory[key] = true; count++; }
        }
      });
    }

    if (count > 0) {
      saveState(); render();
      notify(`${count} item(ns) marcados como PAGOS!`, 'success');
    } else if (totalItems > 0) {
      notify(`Todos os itens desta lista já estão quitados.`, 'info');
    } else {
      notify(`Não há itens nesta lista para quitar no mês selecionado.`, 'info');
    }
  }

function updateMarkAllButtonState(btnId, items) {
    const btn = $(btnId);
    if (!btn) return;
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
      btn.disabled = true;
      btn.classList.remove('all-paid');
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.setAttribute('data-tooltip', 'Nenhum item para quitar');
      btn.setAttribute('aria-label', 'Nenhum item para quitar');
      return;
    }
    const pendingCount = list.filter(x => x.status !== 'pago').length;
    if (pendingCount === 0) {
      btn.disabled = true;
      btn.classList.add('all-paid');
      btn.style.background = 'var(--success, #10b981)';
      btn.style.color = '#ffffff';
      btn.style.borderColor = 'var(--success, #10b981)';
      btn.setAttribute('data-tooltip', 'Todos os itens já estão quitados');
      btn.setAttribute('aria-label', 'Todos os itens já estão quitados');
    } else {
      btn.disabled = false;
      btn.classList.remove('all-paid');
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.setAttribute('data-tooltip', 'Marcar todas como pagas');
      btn.setAttribute('aria-label', 'Marcar todas como pagas');
    }
  }
  window.updateMarkAllButtonState = updateMarkAllButtonState;

function renderSection(listId, sumId, items, sumValue) {
        const container = $(listId);
        container.innerHTML = '';
        $(sumId).textContent = currency(sumValue);
        if (items.length === 0) {
          container.innerHTML = `<div class="empty">Nada encontrado.</div>`;
          return;
        }
        items.forEach(item => container.appendChild(item));
      }

function checkDueAlerts(allExpenses) {
    const state = getState();
        const now = new Date();
        if (state.year !== now.getFullYear() || state.month !== (now.getMonth() + 1)) {
          $('#dueAlertBanner').hidden = true;
          return;
        }

        const currentDay = now.getDate();
        let urgentCount = 0;

        allExpenses.forEach(e => {
          if (e.status === 'pendente' && e.dueDay) {
            const diff = Number(e.dueDay) - currentDay;
            if (diff <= 3) urgentCount++;
          }
        });

        const banner = $('#dueAlertBanner');
        if (urgentCount > 0) {
          $('#dueAlertText').textContent = `Você possui ${urgentCount} conta(s) pendente(s) com vencimento próximo ou em atraso!`;
          banner.hidden = false;
        } else {
          banner.hidden = true;
        }
      }

function sortExpensesList(list, sortMode = 'amount-desc') {
    const state = getState();
        const sorted = [...list];
        switch (sortMode) {
          case 'custom': {
            const order = state.customExpensesOrder || [];
            return sorted.sort((a, b) => {
              const idA = a.fixedId || a.id;
              const idB = b.fixedId || b.id;
              const idxA = order.indexOf(idA);
              const idxB = order.indexOf(idB);
              if (idxA !== -1 && idxB !== -1) return idxA - idxB;
              if (idxA !== -1) return -1;
              if (idxB !== -1) return 1;
              return Number(b.amount || 0) - Number(a.amount || 0);
            });
          }
          case 'amount-asc':
            return sorted.sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
          case 'name-asc':
            return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
          case 'name-desc':
            return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'pt-BR', { sensitivity: 'base' }));
          case 'due-asc':
            return sorted.sort((a, b) => {
              const dA = (a.dueDay != null && a.dueDay !== '') ? Number(a.dueDay) : 999;
              const dB = (b.dueDay != null && b.dueDay !== '') ? Number(b.dueDay) : 999;
              if (dA !== dB) return dA - dB;
              return Number(b.amount || 0) - Number(a.amount || 0);
            });
          case 'amount-desc':
          default:
            return sorted.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
        }
      }

function renderSimplifiedExpenses() {
    const state = getState();
        const y = state.year, m = state.month;
        const t = monthTotals(y, m);
        const sobra = t.totalIncome - t.totalExpenses;

        const simpTotal = $('#simpTotalExpenses'); if (simpTotal) simpTotal.textContent = currency(t.totalExpenses);
        const simpPaid = $('#simpPaidExpenses'); if (simpPaid) simpPaid.textContent = currency(t.paidExpenses);
        const simpPending = $('#simpPendingExpenses'); if (simpPending) simpPending.textContent = currency(t.pendingExpenses);

        const sobraEl = $('#simpSobraValue');
        if (sobraEl) {
          sobraEl.textContent = currency(sobra);
          sobraEl.className = `num ${sobra >= 0 ? 'positive' : 'negative'}`;
        }

        const query = ($('#expensesSearchInput').value || '').toLowerCase().trim();
        const statusFilter = $('#expensesStatusFilter').value;
        const destFilter = $('#expensesDestFilter').value;
        const sortMode = $('#expensesSortFilter') ? $('#expensesSortFilter').value : 'amount-desc';

        const fixed = activeFixedForMonth(y, m).map(f => Object.assign({ typeName: 'Fixa', itemType: 'fixed' }, f));
        const variable = activeVariableForMonth(y, m).map(v => Object.assign({ typeName: 'Variável', itemType: 'variable' }, v));

        let combined = [...fixed, ...variable];

        combined = sortExpensesList(combined.filter(item => {
          if (statusFilter !== 'all' && item.status !== statusFilter) return false;
          if (destFilter !== 'all' && item.destination !== destFilter) return false;
          if (query) {
            const text = `${item.name} ${item.group} ${item.destination} ${item.note || ''}`.toLowerCase();
            if (!text.includes(query)) return false;
          }
          return true;
        }), sortMode);

        const totalFiltered = combined.reduce((s, i) => s + Number(i.amount), 0);
        const simpSumAll = $('#simpSumAll'); if (simpSumAll) simpSumAll.textContent = currency(totalFiltered);

        const container = $('#simpExpensesList');
        if (!container) return;
        container.innerHTML = '';

        if (combined.length === 0) {
          container.innerHTML = `<div class="empty">Nenhuma despesa encontrada para os filtros selecionados.</div>`;
          return;
        }

        combined.forEach(item => {
          const isFixed = item.itemType === 'fixed';
          const totalContract = !isFixed && item.installmentTotal ? Number(item.amount) * Number(item.installmentTotal) : null;
          const origItem = isFixed ? (state.fixed.find(f => f.id === item.fixedId) || item) : (state.variable.find(v => v.id === item.id) || item);
          const activeMonths = isFixed ? getFixedActiveMonths(origItem, y) : getVariableActiveMonths(origItem, y);

          const row = buildEntryRow({
            id: item.id,
            fixedId: item.fixedId,
            type: item.itemType,
            title: item.name,
            tags: [
              item.typeName,
              isFixed ? `desde ${MONTH_ABBR[(item.effMonth || 1) - 1]}/${item.effYear}` : `parcela ${item.installmentIndex}/${item.installmentTotal}`,
              totalContract ? `Total: ${currency(totalContract)}` : null,
              item.group || 'Gerais'
            ].filter(Boolean),
            amount: item.amount,
            status: item.status,
            dueDay: item.dueDay,
            destination: item.destination,
            onClickToggleStatus: () => toggleExpenseStatus(item.itemType, isFixed ? item.fixedId : item.id, item.status),
            onClickEdit: () => openEntryDialog({ mode: 'edit', type: item.itemType, fixedId: item.fixedId, id: item.id }),
            onClickTimeline: () => openExpenseTimeline({ type: item.itemType, fixedId: item.fixedId, id: item.id }),
            onMouseEnter: () => highlightRibbonMonths(activeMonths),
            onMouseLeave: clearRibbonHighlight
          });
          container.appendChild(row);
        });
      }

function renderExpensesLists() {
    const state = getState();
        if (state.simplifiedView) {
          renderSimplifiedExpenses();
          return;
        }
        const y = state.year, m = state.month;

        const query = ($('#expensesSearchInput').value || '').toLowerCase().trim();
        const statusFilter = $('#expensesStatusFilter').value;
        const destFilter = $('#expensesDestFilter').value;
        const sortMode = $('#expensesSortFilter') ? $('#expensesSortFilter').value : 'amount-desc';

        const filterFn = (item) => {
          if (statusFilter !== 'all' && item.status !== statusFilter) return false;
          if (destFilter !== 'all' && item.destination !== destFilter) return false;
          if (query) {
            const text = `${item.name} ${item.group} ${item.destination} ${item.note || ''}`.toLowerCase();
            if (!text.includes(query)) return false;
          }
          return true;
        };

        const rawFixed = activeFixedForMonth(y, m);
        checkDueAlerts([...rawFixed, ...activeVariableForMonth(y, m)]);

        const fixed = sortExpensesList(rawFixed.filter(filterFn), sortMode);
        const fixedRows = fixed.map(f => {
          const origFixed = state.fixed.find(x => x.id === f.fixedId) || f;
          const activeMonths = getFixedActiveMonths(origFixed, y);
          return buildEntryRow({
            fixedId: f.fixedId, type: 'fixed', title: f.name, tags: [f.group || 'Fixa', `desde ${MONTH_ABBR[f.effMonth - 1]}/${f.effYear}`],
            amount: f.amount, status: f.status, dueDay: f.dueDay, destination: f.destination,
            onClickToggleStatus: () => toggleExpenseStatus('fixed', f.fixedId, f.status),
            onClickEdit: () => openEntryDialog({ mode: 'edit', type: 'fixed', fixedId: f.fixedId }),
            onClickTimeline: () => openExpenseTimeline({ type: 'fixed', fixedId: f.fixedId }),
            onMouseEnter: () => highlightRibbonMonths(activeMonths),
            onMouseLeave: clearRibbonHighlight
          });
        });
        renderSection('#listFixed', '#sumFixed', fixedRows, fixed.reduce((s, i) => s + Number(i.amount), 0));

        const rawVariable = activeVariableForMonth(y, m);
        const variable = sortExpensesList(rawVariable.filter(filterFn), sortMode);
        const variableRows = variable.map(v => {
          const totalContract = Number(v.amount) * Number(v.installmentTotal);
          const origVar = state.variable.find(x => x.id === v.id) || v;
          const activeMonths = getVariableActiveMonths(origVar, y);
          return buildEntryRow({
            id: v.id, type: 'variable', title: v.name,
            tags: [
              v.group || 'Variável',
              `parcela ${v.installmentIndex}/${v.installmentTotal}`,
              `Total: ${currency(totalContract)}`
            ],
            amount: v.amount, status: v.status, dueDay: v.dueDay, destination: v.destination,
            onClickToggleStatus: () => toggleExpenseStatus('variable', v.id, v.status),
            onClickEdit: () => openEntryDialog({ mode: 'edit', type: 'variable', id: v.id }),
            onClickTimeline: () => openExpenseTimeline({ type: 'variable', id: v.id }),
            onMouseEnter: () => highlightRibbonMonths(activeMonths),
            onMouseLeave: clearRibbonHighlight
          });
        });
        renderSection('#listVariable', '#sumVariable', variableRows, variable.reduce((s, i) => s + Number(i.amount), 0));

        updateMarkAllButtonState('#markAllFixedPaidBtn', rawFixed);
        updateMarkAllButtonState('#markAllVarPaidBtn', rawVariable);
        updateMarkAllButtonState('#simpMarkAllPaidBtn', [...rawFixed, ...rawVariable]);
      }

function showTypeBlocks(type) {
        const ff = $('#fieldsFixed');
        const fv = $('#fieldsVariable');
        if (ff) ff.hidden = type !== 'fixed';
        if (fv) fv.hidden = type !== 'variable';
      }

function setEntryDialogType(type) {
        entryDlgState.type = type;
        $$('#typeSelector button, .entry-type-tab').forEach(b => {
          const isActive = b.dataset.type === type;
          b.style.background = isActive ? 'var(--surface)' : 'transparent';
          b.style.color = isActive ? 'var(--text)' : 'var(--muted)';
        });
        if (entryDlgState.mode === 'new') {
          const titleEl = $('#entryDialogTitle');
          if (titleEl) titleEl.textContent = type === 'fixed' ? 'Nova Despesa Fixa' : 'Nova Despesa Variável';
        }
        showTypeBlocks(type);
        if (type === 'variable') {
          updateVarInstallments();
        }
      }

function updateVarInstallments() {
    const state = getState();
        const sm = Number($('#varStartMonth')?.value) || state.month || 1;
        const sy = Number($('#varStartYear')?.value) || state.year || 2026;
        const count = Math.max(1, parseInt($('#varInstallmentsCount')?.value, 10) || 1);
        const amount = Number($('#entryAmount')?.value) || 0;

        const endMonthIdx = (sm - 1) + (count - 1);
        const ey = sy + Math.floor(endMonthIdx / 12);
        const em = (endMonthIdx % 12) + 1;

        if ($('#varEndMonth')) $('#varEndMonth').value = em;
        if ($('#varEndYear')) $('#varEndYear').value = ey;

        const badge = $('#varInstallmentsBadge');
        if (!badge) return;

        const totalAmount = amount * count;
        if (count === 1) {
          badge.classList.remove('invalid', 'error');
          badge.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> <span>Vigência: <strong>Parcela única</strong> em ${MONTH_ABBR[sm - 1]}/${sy} • Total: ${currency(amount)}</span>`;
        } else {
          badge.classList.remove('invalid', 'error');
          badge.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> <span>Vigência calculada: <strong>${MONTH_ABBR[sm - 1]}/${sy} a ${MONTH_ABBR[em - 1]}/${ey}</strong> (${count}x de ${currency(amount)} • Total: ${currency(totalAmount)})</span>`;
        }
      }

function openEntryDialog(opts) {
    const state = getState();
    const entryDlg = $('#entryDialog');
        opts = opts || {};
        let mode = 'new', type = 'fixed', id = null, fixedId = null;
        if (typeof opts === 'object' && opts !== null) {
          mode = opts.mode || 'new';
          type = opts.type || 'fixed';
          id = opts.id || null;
          fixedId = opts.fixedId || null;
        } else {
          mode = opts || 'new';
          type = arguments[1] || 'fixed';
          id = arguments[2] || null;
          fixedId = arguments[3] || null;
        }

        $('#entryForm').reset();
        fillMonthSelects();
        updateCategorySelects();

        const delBtn = $('#deleteEntryBtn');
        const fixActions = $('#fixedActions');
        if (delBtn) delBtn.hidden = true;
        if (fixActions) fixActions.hidden = true;

        if (mode === 'new') {
          entryDlgState = { mode: 'new', type, id: null, fixedId: null };
          $('#entryDialogTitle').textContent = type === 'fixed' ? 'Nova Despesa Fixa' : 'Nova Despesa Variável';
          setEntryDialogType(type);

          const now = new Date();
          const curDay = now.getDate();
          const curMonth = state.month || (now.getMonth() + 1);
          const curYear = state.year || now.getFullYear();

          $('#fixedEffMonth').value = curMonth;
          $('#fixedEffYear').value = curYear;
          $('#varStartMonth').value = curMonth;
          $('#varStartYear').value = curYear;
          if ($('#varInstallmentsCount')) $('#varInstallmentsCount').value = 1;
          const firstCatName = state.categories.length > 0 ? ((typeof getCategoryName === 'function') ? getCategoryName(state.categories[0]) : (typeof state.categories[0] === 'string' ? state.categories[0] : state.categories[0].name)) : 'Gerais';
          $('#entryDueDay').value = curDay;
          $('#entryDestination').value = state.destinations[0]?.name || 'Nubank';
          $('#entryStatus').value = 'pendente';
          if (state.categories.length > 0) $('#entryGroup').value = firstCatName;

          updateVarInstallments();
        } else if (type === 'fixed') {
          const firstCatName = state.categories.length > 0 ? ((typeof getCategoryName === 'function') ? getCategoryName(state.categories[0]) : (typeof state.categories[0] === 'string' ? state.categories[0] : state.categories[0].name)) : 'Gerais';
          const fixed = state.fixed.find(f => f.id === fixedId || f.id === id);
          if (!fixed) return;
          const active = activeFixedForMonth(state.year, state.month).find(a => a.fixedId === fixed.id)
            || [...fixed.versions].sort((a, b) => mk(a.year, a.month) - mk(b.year, b.month))[0];

          entryDlgState = {
            mode: 'edit',
            type: 'fixed',
            id: null,
            fixedId: fixed.id,
            effMonth: active.effMonth || active.month || (active.versions && active.versions[0]?.month),
            effYear: active.effYear || active.year || (active.versions && active.versions[0]?.year)
          };
          $('#entryDialogTitle').textContent = 'Editar Despesa Fixa';
          setEntryDialogType('fixed');

          $('#entryName').value = fixed.name;
          $('#entryGroup').value = fixed.group || firstCatName;
          $('#entryNote').value = fixed.note || '';
          $('#entryAmount').value = active.amount;
          $('#entryDueDay').value = fixed.dueDay || '';
          $('#entryDestination').value = fixed.destination || 'Nubank';

          const key = ymKey(state.year, state.month);
          const isPaid = fixed.paidHistory ? fixed.paidHistory[key] === true : (active.status === 'pago');
          $('#entryStatus').value = isPaid ? 'pago' : 'pendente';
          $('#fixedEffMonth').value = active.effMonth || active.month || state.month;
          $('#fixedEffYear').value = active.effYear || active.year || state.year;
          if (fixActions) fixActions.hidden = false;
        } else if (type === 'variable') {
          const firstCatName = state.categories.length > 0 ? ((typeof getCategoryName === 'function') ? getCategoryName(state.categories[0]) : (typeof state.categories[0] === 'string' ? state.categories[0] : state.categories[0].name)) : 'Gerais';
          const v = state.variable.find(x => x.id === id || x.id === fixedId);
          if (!v) return;

          entryDlgState = { mode: 'edit', type: 'variable', id: v.id, fixedId: null };
          $('#entryDialogTitle').textContent = 'Editar Despesa Variável';
          setEntryDialogType('variable');

          $('#entryName').value = v.name;
          $('#entryGroup').value = v.group || firstCatName;
          $('#entryNote').value = v.note || '';
          $('#entryAmount').value = v.amount;
          $('#entryDueDay').value = v.dueDay || '';
          $('#entryDestination').value = v.destination || 'Nubank';

          const key = ymKey(state.year, state.month);
          const isPaid = v.paidHistory ? v.paidHistory[key] === true : (v.status === 'pago');
          $('#entryStatus').value = isPaid ? 'pago' : 'pendente';
          $('#varStartMonth').value = v.startMonth;
          $('#varStartYear').value = v.startYear;
          $('#varEndMonth').value = v.endMonth;
          $('#varEndYear').value = v.endYear;

          const count = mk(v.endYear, v.endMonth) - mk(v.startYear, v.startMonth) + 1;
          if ($('#varInstallmentsCount')) $('#varInstallmentsCount').value = Math.max(1, count);
          if (delBtn) delBtn.hidden = false;
          updateVarInstallments();
        }

        if (entryDlg) entryDlg.showModal();
      }

  function initExpensesListeners() {
    $('#openFixedFsBtn')?.addEventListener('click', () => openFullscreenTable('fixed'));
    $('#openVarFsBtn')?.addEventListener('click', () => openFullscreenTable('variable'));

    ['#fsSearchInput', '#fsTypeFilter', '#fsGroupFilter', '#fsStatusFilter', '#fsDestFilter'].forEach(id => {
      const el = $(id);
      if (el) {
        el.addEventListener('input', renderFullscreenTable);
        el.addEventListener('change', renderFullscreenTable);
      }
    });

    $$('#fullscreenTable th[data-sort]')?.forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (fsSortKey === key) {
          fsSortAsc = !fsSortAsc;
        } else {
          fsSortKey = key;
          fsSortAsc = true;
        }
        renderFullscreenTable();
      });
    });

    $('#markAllFixedPaidBtn')?.addEventListener('click', () => markAllSectionPaid('fixed'));
    $('#markAllVarPaidBtn')?.addEventListener('click', () => markAllSectionPaid('variable'));

    $('#expensesSearchInput')?.addEventListener('input', renderExpensesLists);
    $('#expensesStatusFilter')?.addEventListener('change', renderExpensesLists);
    $('#expensesDestFilter')?.addEventListener('change', renderExpensesLists);
    if ($('#expensesSortFilter')) $('#expensesSortFilter').addEventListener('change', renderExpensesLists);

    $('#expensesAddBtn')?.addEventListener('click', () => openEntryDialog({ mode: 'new', type: 'fixed' }));
    $('#addFixedBtn')?.addEventListener('click', () => openEntryDialog({ mode: 'new', type: 'fixed' }));
    $('#addVariableBtn')?.addEventListener('click', () => openEntryDialog({ mode: 'new', type: 'variable' }));

    $$('#typeSelector button, .entry-type-tab')?.forEach(b => {
      b.addEventListener('click', () => {
        const t = b.dataset.type;
        if (t) setEntryDialogType(t);
      });
    });

    ['#varStartMonth', '#varStartYear', '#varInstallmentsCount', '#entryAmount'].forEach(id => {
      const el = $(id);
      if (el) {
        el.addEventListener('input', updateVarInstallments);
        el.addEventListener('change', updateVarInstallments);
      }
    });

    $$('.preset-inst-btn, .inst-pill')?.forEach(btn => {
      btn.addEventListener('click', () => {
        const inst = btn.getAttribute('data-inst');
        const input = $('#varInstallmentsCount');
        if (input && inst) {
          input.value = inst;
          updateVarInstallments();
        }
      });
    });

    $$('.preset-due-btn, .due-pill')?.forEach(btn => {
      btn.addEventListener('click', () => {
        const day = btn.getAttribute('data-day');
        const input = $('#entryDueDay');
        if (input && day) input.value = day;
      });
    });

    $('#entryForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const state = getState();
      const entryDlg = $('#entryDialog');
      const type = entryDlgState.type || 'fixed';
      const name = $('#entryName').value.trim();
      let group = $('#entryGroup').value.trim() || 'Gerais';
      const note = $('#entryNote').value.trim();
      const amount = Number($('#entryAmount').value);
      const dueDay = Number($('#entryDueDay').value) || null;
      const destination = $('#entryDestination').value || 'Nubank';
      const status = $('#entryStatus').value || 'pendente';
      const key = ymKey(state.year, state.month);

      if (!name || amount <= 0) {
        notify('Preencha um nome e valor válidos para a despesa.', 'error');
        return;
      }

      if (type === 'fixed') {
        state.fixed = state.fixed || [];
        const effMonth = Number($('#fixedEffMonth').value) || state.month;
        const effYear = Number($('#fixedEffYear').value) || state.year;
        let fixed = entryDlgState.fixedId ? state.fixed.find(f => f.id === entryDlgState.fixedId) : null;

        if (fixed) {
          fixed.name = name;
          fixed.group = group;
          fixed.destination = destination;
          fixed.dueDay = dueDay;
          fixed.note = note;
          fixed.versions = fixed.versions || [];

          // Localiza a versão que estava sendo editada para atualizar a data/valor
          const origMonth = entryDlgState.effMonth;
          const origYear = entryDlgState.effYear;
          let targetVersion = null;

          if (origYear != null && origMonth != null) {
            targetVersion = fixed.versions.find(v => (v.year || v.startYear) === origYear && (v.month || v.startMonth) === origMonth);
          }
          if (!targetVersion && fixed.versions.length === 1) {
            targetVersion = fixed.versions[0];
          }

          if (targetVersion) {
            targetVersion.year = effYear;
            targetVersion.month = effMonth;
            targetVersion.startYear = effYear;
            targetVersion.startMonth = effMonth;
            targetVersion.amount = amount;
          } else {
            const existing = fixed.versions.find(v => (v.year || v.startYear) === effYear && (v.month || v.startMonth) === effMonth);
            if (existing) {
              existing.amount = amount;
            } else {
              fixed.versions.push({ year: effYear, month: effMonth, amount, startYear: effYear, startMonth: effMonth });
            }
          }

          fixed.versions.sort((a, b) => mk(a.year || a.startYear, a.month || a.startMonth) - mk(b.year || b.startYear, b.month || b.startMonth));
        } else {
          const newId = uid();
          state.fixed.push({
            id: newId,
            name,
            group,
            destination,
            dueDay,
            note,
            versions: [{ year: effYear, month: effMonth, amount, startYear: effYear, startMonth: effMonth }],
            paidHistory: {}
          });
          fixed = state.fixed.find(f => f.id === newId);
        }

        if (fixed && effMonth === state.month && effYear === state.year) {
          fixed.paidHistory = fixed.paidHistory || {};
          fixed.paidHistory[key] = (status === 'pago');
        }
      } else {
        state.variable = state.variable || [];
        const sMonth = Number($('#varStartMonth').value) || state.month;
        const sYear = Number($('#varStartYear').value) || state.year;
        const count = Math.max(1, parseInt($('#varInstallmentsCount')?.value, 10) || 1);
        const endMonthIdx = (sMonth - 1) + (count - 1);
        const eYear = sYear + Math.floor(endMonthIdx / 12);
        const eMonth = (endMonthIdx % 12) + 1;

        let v = entryDlgState.id ? state.variable.find(x => x.id === entryDlgState.id) : null;

        if (v) {
          v.name = name;
          v.amount = amount;
          v.group = group;
          v.destination = destination;
          v.dueDay = dueDay;
          v.note = note;
          v.startMonth = sMonth;
          v.startYear = sYear;
          v.endMonth = eMonth;
          v.endYear = eYear;
          v.installments = count;
        } else {
          const newId = uid();
          state.variable.push({
            id: newId,
            name,
            amount,
            group,
            destination,
            dueDay,
            note,
            startMonth: sMonth,
            startYear: sYear,
            endMonth: eMonth,
            endYear: eYear,
            installments: count,
            paidHistory: {}
          });
          v = state.variable.find(x => x.id === newId);
        }

        if (v) {
          v.paidHistory = v.paidHistory || {};
          v.paidHistory[key] = (status === 'pago');
        }
      }

      saveState();
      if (entryDlg) entryDlg.close();
      render();
      notify('Despesa salva com sucesso!', 'success');
    });

    $('#deleteEntryBtn')?.addEventListener('click', () => {
      const state = getState();
      const entryDlg = $('#entryDialog');
      if (!confirm('Excluir este lançamento?')) return;
      if (entryDlgState.type === 'variable') state.variable = state.variable.filter(v => v.id !== entryDlgState.id);
      saveState();
      if (entryDlg) entryDlg.close();
      render();
      notify('Lançamento excluído!', 'info');
    });

    $('#endFixedBtn')?.addEventListener('click', () => {
      const state = getState();
      const entryDlg = $('#entryDialog');
      const fixed = state.fixed.find(f => f.id === entryDlgState.fixedId);
      if (!fixed) return;
      const m = Number($('#fixedEffMonth').value) || state.month, y = Number($('#fixedEffYear').value) || state.year;
      if (!confirm(`Encerrar vigência de "${fixed.name}" a partir de ${String(m).padStart(2, '0')}/${y}?`)) return;
      fixed.endedFrom = { year: y, month: m };
      saveState();
      if (entryDlg) entryDlg.close();
      render();
      notify('Vigência da despesa fixa encerrada!', 'warning');
    });

    $('#deleteFixedBtn')?.addEventListener('click', () => {
      const state = getState();
      const entryDlg = $('#entryDialog');
      if (!confirm('Excluir esta despesa fixa e TODO seu histórico?')) return;
      state.fixed = state.fixed.filter(f => f.id !== entryDlgState.fixedId);
      saveState();
      if (entryDlg) entryDlg.close();
      render();
      notify('Despesa fixa excluída!', 'info');
    });

    const viewModeBtn = $('#viewModeToggleBtn');
    if (viewModeBtn) {
      viewModeBtn.addEventListener('click', () => {
        const state = getState();
        state.simplifiedView = !state.simplifiedView;
        saveState(); render();
        notify(state.simplifiedView ? 'Visão Simplificada ativada!' : 'Visão Completa ativada!');
      });
    }

    const simpAddBtn = $('#simpAddBtn');
    if (simpAddBtn) simpAddBtn.addEventListener('click', () => openEntryDialog({ mode: 'new', type: 'fixed' }));

    const simpMarkAllPaidBtn = $('#simpMarkAllPaidBtn');
    if (simpMarkAllPaidBtn) {
      simpMarkAllPaidBtn.addEventListener('click', () => {
        markAllSectionPaid('fixed');
        markAllSectionPaid('variable');
      });
    }
  }

  // Bridges publicas autorizadas do modulo de despesas
  window.renderExpensesLists = renderExpensesLists;
  window.renderSimplifiedExpenses = renderSimplifiedExpenses;
  window.openEntryDialog = openEntryDialog;
  window.openFullscreenTable = openFullscreenTable;
  window.toggleExpenseStatus = toggleExpenseStatus;
  window.markAllSectionPaid = markAllSectionPaid;
  window.reorderExpenses = reorderExpenses;
  window.moveExpenseToEndOfList = moveExpenseToEndOfList;
  window.buildEntryRow = buildEntryRow;
  window.renderSection = renderSection;

  // Inicializacao sincrona dos listeners de despesas
  try {
    initExpensesListeners();
  } catch (err) {
    console.error('Erro ao inicializar listeners de despesas:', err);
  }
})();
