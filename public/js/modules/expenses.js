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

        const sortedDests = (typeof getSortedDestinations === 'function') ? getSortedDestinations(state.destinations) : (state.destinations || []);
        const destSelect = $('#fsDestFilter');
        if (destSelect) {
          destSelect.innerHTML = `<option value="all">Todos os Destinos</option>` + sortedDests.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
        }

        const sortedCats = (typeof getSortedCategories === 'function') ? getSortedCategories(state.categories) : (state.categories || []);
        const catSelect = $('#fsCategoryFilter');
        if (catSelect) {
          catSelect.innerHTML = `<option value="all">Todas as Categorias</option>` + sortedCats.map(c => {
            const name = (typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name);
            return `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
          }).join('');
        }

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
        id, fixedId, type, title, tags = [], amount, status, paidAmount, remainingAmount, dueDay, destination,
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

        const isIncome = (type === 'debtor' || type === 'extra');
        const isPaid = status === 'pago';
        const isPartial = status === 'parcial';
        let leftIconHtml = '';

        if (customLeftBadge) {
          leftIconHtml = customLeftBadge;
        } else if (onClickToggleStatus) {
          let statusTip = isIncome ? 'Pendente. Clique para registrar recebimento' : 'Pendente. Clique para registrar pagamento';
          let statusClass = 'pending';
          let statusIcon = ICONS.clock;

          if (isPaid) {
            statusTip = isIncome ? 'Marcado como Recebido. Clique para alternar para Pendente' : 'Marcado como Pago. Clique para alternar para Pendente';
            statusClass = 'paid';
            statusIcon = ICONS.check;
          } else if (isPartial) {
            statusTip = isIncome
              ? `Parcialmente Recebido (${currency(paidAmount || 0)} de ${currency(amount)}). Clique para gerenciar recebimento`
              : `Parcialmente Pago (${currency(paidAmount || 0)} de ${currency(amount)}). Clique para gerenciar pagamento`;
            statusClass = 'partial';
            statusIcon = `<svg class="svg-icon" viewBox="0 0 24 24" style="stroke:currentColor; fill:none; width:16px; height:16px;"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 9 9h-9z" fill="currentColor" opacity="0.75"/></svg>`;
          }

          leftIconHtml = `
            <button type="button" class="status-btn ${statusClass}" data-tooltip="${statusTip}" aria-label="${statusTip}">
              ${statusIcon}
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

        let partialTagHtml = '';
        if (isPartial) {
          const resolvedPaid = Number(paidAmount || 0);
          const resolvedRem = remainingAmount !== undefined ? Number(remainingAmount) : Math.max(0, Number(amount) - resolvedPaid);
          const prefix = isIncome ? 'Recebido' : 'Pago';
          partialTagHtml = `<span class="tag partial" style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.35); font-weight:750;">${prefix}: ${currency(resolvedPaid)} • Restante: ${currency(resolvedRem)}</span>`;
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

        const amountClass = type === 'benefit' ? 'negative' : (isPaid ? 'positive' : (isPartial ? 'partial' : ''));

        row.innerHTML = `
      ${dragHandleHtml}
      ${leftIconHtml}
      <div class="entry-info">
        <div class="entry-title">${escapeHtml(title)}</div>
        <div class="entry-meta">
          ${destPillHtml}
          ${dueTagHtml}
          ${partialTagHtml}
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

  let partialPayState = { type: null, idKey: null, totalAmount: 0, paidAmount: 0, remainingAmount: 0, itemName: '' };

  function openPartialPaymentDialog(type, idKey) {
    const state = getState();
    const y = state.year, m = state.month;

    let item = null;
    let totalAmount = 0;
    let itemName = '';
    let dialogTitle = 'Pagamento de Despesa';
    let subtitle = '';
    const isIncome = (type === 'debtor' || type === 'extra');

    if (type === 'fixed') {
      item = state.fixed.find(f => f.id === idKey);
      const active = activeFixedForMonth(y, m).find(a => a.fixedId === idKey);
      totalAmount = active ? Number(active.amount) : (item?.versions && item.versions[0] ? Number(item.versions[0].amount) : 0);
      itemName = item?.name || 'Despesa Fixa';
      dialogTitle = 'Pagamento de Despesa';
      subtitle = itemName;
    } else if (type === 'variable') {
      item = state.variable.find(v => v.id === idKey);
      totalAmount = item ? Number(item.amount) : 0;
      itemName = item?.name || 'Despesa Variável';
      dialogTitle = 'Pagamento de Despesa';
      subtitle = itemName;
    } else if (type === 'debtor') {
      item = (state.debtors || []).find(d => d.id === idKey);
      totalAmount = item ? Number(item.amount) : 0;
      itemName = item ? (item.debtorName || item.name || item.title || 'Devedor') : 'Devedor';
      dialogTitle = 'Recebimento de Devedor';
      subtitle = `${itemName}${item?.title ? ' • ' + item.title : ''}`;
    } else if (type === 'extra') {
      item = (state.extras || []).find(e => e.id === idKey);
      totalAmount = item ? Number(item.amount) : 0;
      itemName = item ? (item.title || item.source || 'Renda Extra') : 'Renda Extra';
      dialogTitle = 'Recebimento de Renda Extra';
      subtitle = `${itemName}${item?.sender ? ' • ' + item.sender : ''}`;
    }

    if (!item) return;

    const payInfo = (typeof getExpensePaymentInfo === 'function')
      ? getExpensePaymentInfo(item, y, m, totalAmount)
      : { totalAmount, paidAmount: 0, remainingAmount: totalAmount, status: 'pendente' };

    partialPayState = {
      type,
      idKey,
      totalAmount: payInfo.totalAmount,
      paidAmount: payInfo.paidAmount,
      remainingAmount: payInfo.remainingAmount,
      itemName,
      isIncome
    };

    const dlg = $('#partialPaymentDialog');
    if ($('#partialPayDialogTitle')) $('#partialPayDialogTitle').textContent = dialogTitle;
    if ($('#partialPayItemName')) $('#partialPayItemName').textContent = subtitle;
    if ($('#partialPayTotalVal')) $('#partialPayTotalVal').textContent = currency(payInfo.totalAmount);
    if ($('#partialPayPaidVal')) $('#partialPayPaidVal').textContent = currency(payInfo.paidAmount);
    if ($('#partialPayRemainingVal')) $('#partialPayRemainingVal').textContent = currency(payInfo.remainingAmount);

    const paidLabel = $('#partialPayPaidLabel');
    if (paidLabel) paidLabel.textContent = isIncome ? 'Já Recebido' : 'Já Pago';

    const amountLabel = $('#partialPayAmountLabel') || $('label[for="partialPayAmountInput"]');
    if (amountLabel) amountLabel.textContent = isIncome ? 'Valor a receber agora (R$):' : 'Valor a pagar agora (R$):';

    const input = $('#partialPayAmountInput');
    if (input) {
      input.value = payInfo.remainingAmount > 0 ? payInfo.remainingAmount : '';
      input.max = String(payInfo.remainingAmount);
      input.min = '0.01';
      input.step = '0.01';
    }

    const btnPayFull = $('#btnPayFull');
    if (btnPayFull) {
      const fullActionText = isIncome
        ? `✓ Receber valor restante / Quitar (${currency(payInfo.remainingAmount)})`
        : `✓ Quitar Total (${currency(payInfo.remainingAmount)})`;
      btnPayFull.textContent = fullActionText;
    }

    const btnConfirm = $('#btnConfirmPartialPay');
    if (btnConfirm) {
      btnConfirm.textContent = isIncome ? 'Confirmar Recebimento' : 'Confirmar Pagamento';
    }

    const alert = $('#partialPayAlert');
    if (alert) alert.style.display = 'none';

    if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
    setTimeout(() => {
      $('#partialPayAmountInput')?.focus();
    }, 50);
  }
  window.openPartialPaymentDialog = openPartialPaymentDialog;

  function toggleExpenseStatus(type, idKey, currentStatus) {
    const state = getState();
    const y = state.year, m = state.month;
    const key = ymKey(y, m);

    let item = null;
    let totalAmount = 0;

    if (type === 'fixed') {
      item = state.fixed.find(f => f.id === idKey);
      const active = activeFixedForMonth(y, m).find(a => a.fixedId === idKey);
      totalAmount = active ? Number(active.amount) : (item?.versions && item.versions[0] ? Number(item.versions[0].amount) : 0);
    } else if (type === 'variable') {
      item = state.variable.find(v => v.id === idKey);
      totalAmount = item ? Number(item.amount) : 0;
    } else if (type === 'debtor') {
      item = (state.debtors || []).find(d => d.id === idKey);
      totalAmount = item ? Number(item.amount) : 0;
    } else if (type === 'extra') {
      item = (state.extras || []).find(e => e.id === idKey);
      totalAmount = item ? Number(item.amount) : 0;
    }

    if (!item) return;

    if (currentStatus === 'pago') {
      // Alterna de pago total para pendente (0 pago)
      if (typeof setExpensePayment === 'function') {
        setExpensePayment(item, y, m, 0, totalAmount);
      } else {
        item.paidHistory = item.paidHistory || {};
        item.paidHistory[key] = {
          paidAmount: 0,
          updatedAt: new Date().toISOString()
        };
      }
      saveState(); render();
      notify(`Status alterado para "Pendente".`);
    } else {
      // Abre modal de pagamento / recebimento parcial ou quitação
      openPartialPaymentDialog(type, idKey);
    }
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
          if (item) {
            if (typeof setExpensePayment === 'function') {
              setExpensePayment(item, y, m, f.amount, f.amount);
            } else {
              item.paidHistory = item.paidHistory || {};
              item.paidHistory[key] = { paidAmount: f.amount, updatedAt: new Date().toISOString() };
            }
            count++;
          }
        }
      });
    } else if (normType === 'variable' || normType === 'variaveis') {
      const items = activeVariableForMonth(y, m);
      totalItems = items.length;
      items.forEach(v => {
        if (v.status !== 'pago') {
          const item = state.variable.find(x => x.id === v.id);
          if (item) {
            if (typeof setExpensePayment === 'function') {
              setExpensePayment(item, y, m, v.amount, v.amount);
            } else {
              item.paidHistory = item.paidHistory || {};
              item.paidHistory[key] = { paidAmount: v.amount, updatedAt: new Date().toISOString() };
            }
            count++;
          }
        }
      });
    } else if (normType === 'extra' || normType === 'extras') {
      const items = activeExtrasForMonth(y, m);
      totalItems = items.length;
      items.forEach(e => {
        if (e.status !== 'pago') {
          const item = state.extras.find(x => x.id === e.id);
          if (item) {
            if (typeof setExpensePayment === 'function') {
              setExpensePayment(item, y, m, e.amount, e.amount);
            } else {
              item.paidHistory = item.paidHistory || {};
              item.paidHistory[key] = { paidAmount: e.amount, updatedAt: new Date().toISOString() };
            }
            count++;
          }
        }
      });
    } else if (normType === 'debtor' || normType === 'debtors' || normType === 'devedores') {
      const items = activeDebtorsForMonth(y, m);
      totalItems = items.length;
      items.forEach(d => {
        if (d.status !== 'pago') {
          const item = state.debtors.find(x => x.id === d.id);
          if (item) {
            if (typeof setExpensePayment === 'function') {
              setExpensePayment(item, y, m, d.amount, d.amount);
            } else {
              item.paidHistory = item.paidHistory || {};
              item.paidHistory[key] = { paidAmount: d.amount, updatedAt: new Date().toISOString() };
            }
            count++;
          }
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
            amount: f.amount, status: f.status, paidAmount: f.paidAmount, remainingAmount: f.remainingAmount, dueDay: f.dueDay, destination: f.destination,
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
            amount: v.amount, status: v.status, paidAmount: v.paidAmount, remainingAmount: v.remainingAmount, dueDay: v.dueDay, destination: v.destination,
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

  function getEntryNote() {
    return ($('#entryNoteStep1')?.value || $('#entryNote')?.value || '').trim();
  }

  function setEntryNote(val) {
    const v = val || '';
    if ($('#entryNoteStep1')) $('#entryNoteStep1').value = v;
    if ($('#entryNote')) $('#entryNote').value = v;
  }

  function clearEntryValidation() {
    const alert = $('#entryValidationAlert');
    if (alert) {
      alert.style.display = 'none';
      alert.textContent = '';
    }
    const dialog = $('#entryDialog');
    let fields = [];
    if (dialog && typeof dialog.querySelectorAll === 'function') {
      try {
        fields = Array.from(dialog.querySelectorAll('input, select, textarea'));
      } catch (e) {
        fields = [];
      }
    }
    if (!fields.length && typeof $$ === 'function') {
      try {
        fields = $$('#entryDialog input, #entryDialog select, #entryDialog textarea, input, select, textarea');
      } catch (e) {
        fields = [];
      }
    }
    fields.forEach(el => {
      if (el && typeof el.removeAttribute === 'function') {
        el.removeAttribute('aria-invalid');
      }
      if (el && el.classList && typeof el.classList.remove === 'function') {
        el.classList.remove('is-invalid');
        el.classList.remove('input-error');
      }
    });
  }

  function setEntryFieldError(fieldEl, message) {
    clearEntryValidation();
    if (fieldEl) {
      fieldEl.setAttribute('aria-invalid', 'true');
      fieldEl.classList.add('is-invalid', 'input-error');
      try { fieldEl.focus(); } catch (e) {}
    }
    const alert = $('#entryValidationAlert');
    if (alert) {
      alert.textContent = message;
      alert.style.display = 'block';
    }
  }

  function validateEntryStep1() {
    const nameInput = $('#entryName');
    const name = nameInput?.value.trim();
    if (!name) {
      setEntryFieldError(nameInput, 'Informe a descrição do lançamento.');
      return false;
    }

    const groupInput = $('#entryGroup');
    const group = groupInput?.value.trim();
    if (!group) {
      setEntryFieldError(groupInput, 'Selecione a categoria do lançamento.');
      return false;
    }

    const amountInput = $('#entryAmount');
    const amountVal = amountInput?.value.trim();
    const amount = Number(amountVal);
    if (!amountVal || isNaN(amount) || amount <= 0) {
      setEntryFieldError(amountInput, 'Informe um valor maior que zero.');
      return false;
    }

    const destInput = $('#entryDestination');
    const dest = destInput?.value.trim();
    if (!dest) {
      setEntryFieldError(destInput, 'Selecione a forma de pagamento / destino.');
      return false;
    }

    clearEntryValidation();
    return true;
  }

  function validateEntryStep2() {
    const expType = entryDlgState.type || 'cash';
    if (expType === 'cash') {
      const monthInput = $('#cashEffMonth');
      if (!monthInput?.value) {
        setEntryFieldError(monthInput, 'Selecione o mês de competência.');
        return false;
      }
      const yearInput = $('#cashEffYear');
      if (!yearInput?.value) {
        setEntryFieldError(yearInput, 'Selecione o ano de competência.');
        return false;
      }
    } else if (expType === 'installment') {
      const startMonthInput = $('#varStartMonth');
      if (!startMonthInput?.value) {
        setEntryFieldError(startMonthInput, 'Selecione o mês inicial do parcelamento.');
        return false;
      }
      const startYearInput = $('#varStartYear');
      if (!startYearInput?.value) {
        setEntryFieldError(startYearInput, 'Selecione o ano inicial do parcelamento.');
        return false;
      }
      const countInput = $('#varInstallmentsCount');
      const count = parseInt(countInput?.value, 10);
      if (!count || count < 1) {
        setEntryFieldError(countInput, 'Informe um número de parcelas válido.');
        return false;
      }
    } else if (expType === 'fixed') {
      const monthInput = $('#fixedEffMonth');
      if (!monthInput?.value) {
        setEntryFieldError(monthInput, 'Selecione o mês inicial de vigência.');
        return false;
      }
      const yearInput = $('#fixedEffYear');
      if (!yearInput?.value) {
        setEntryFieldError(yearInput, 'Selecione o ano inicial de vigência.');
        return false;
      }
    }

    clearEntryValidation();
    return true;
  }

  function setWizardStep(stepNumber) {
    clearEntryValidation();
    entryDlgState.step = stepNumber;

    const destName = $('#entryDestination')?.value || '';
    const isPixOrCash = (destName.toLowerCase() === 'pix' || destName.toLowerCase() === 'dinheiro');

    // Visual indicators
    [1, 2, 3].forEach(s => {
      const ind = $(`#stepIndicator${s}`);
      if (!ind) return;
      const dot = ind.querySelector('.wizard-dot');
      if (s < stepNumber) {
        ind.style.color = 'var(--brand)';
        if (dot) {
          dot.style.background = 'var(--brand)';
          dot.style.color = '#fff';
          dot.textContent = '✓';
        }
      } else if (s === stepNumber) {
        ind.style.color = 'var(--brand)';
        if (dot) {
          dot.style.background = 'var(--brand)';
          dot.style.color = '#fff';
          dot.textContent = String(s);
        }
      } else {
        ind.style.color = 'var(--muted)';
        if (dot) {
          dot.style.background = 'var(--surface)';
          dot.style.border = '1px solid var(--line)';
          dot.style.color = 'var(--muted)';
          dot.textContent = String(s);
        }
      }
    });

    // Panels visibility
    if ($('#entryStep1')) $('#entryStep1').style.display = (stepNumber === 1 ? 'grid' : 'none');
    if ($('#entryStep2')) $('#entryStep2').style.display = (stepNumber === 2 ? 'grid' : 'none');
    if ($('#entryStep3')) $('#entryStep3').style.display = (stepNumber === 3 ? 'grid' : 'none');

    // Buttons visibility
    const cancel1 = $('#btnCancelStep1');
    const next1 = $('#btnNextStep1');
    const back2 = $('#btnBackStep2');
    const next2 = $('#btnNextStep2');
    const back3 = $('#btnBackStep3');
    const submitBtn = $('#entrySubmitBtn');

    if (cancel1) cancel1.style.display = (stepNumber === 1 ? 'inline-flex' : 'none');

    if (stepNumber === 1) {
      if (isPixOrCash) {
        if (next1) next1.style.display = 'none';
        if (submitBtn) {
          submitBtn.style.display = 'inline-flex';
          submitBtn.textContent = '✓ Salvar Lançamento';
        }
      } else {
        if (next1) next1.style.display = 'inline-flex';
        if (submitBtn) submitBtn.style.display = 'none';
      }
      if (back2) back2.style.display = 'none';
      if (next2) next2.style.display = 'none';
      if (back3) back3.style.display = 'none';
    } else if (stepNumber === 2) {
      if (next1) next1.style.display = 'none';
      if (back2) back2.style.display = 'inline-flex';
      if (next2) next2.style.display = 'inline-flex';
      if (back3) back3.style.display = 'none';
      if (submitBtn) submitBtn.style.display = 'none';
    } else if (stepNumber === 3) {
      if (next1) next1.style.display = 'none';
      if (back2) back2.style.display = 'none';
      if (next2) next2.style.display = 'none';
      if (back3) back3.style.display = 'inline-flex';
      if (submitBtn) {
        submitBtn.style.display = 'inline-flex';
        submitBtn.textContent = '✓ Salvar Lançamento';
      }
    }
  }

  function setEntryExpenseType(expType) {
    entryDlgState.type = expType;
    if ($('#entryType')) $('#entryType').value = expType;
    if ($('#entryPaymentType')) $('#entryPaymentType').value = expType;

    $$('.entry-type-btn').forEach(btn => {
      const active = btn.dataset.expType === expType;
      btn.style.background = active ? 'var(--surface)' : 'transparent';
      btn.style.color = active ? 'var(--text)' : 'var(--muted)';
      btn.style.boxShadow = active ? '0 2px 6px rgba(0,0,0,0.1)' : 'none';
    });

    if ($('#panelTypeCash')) $('#panelTypeCash').style.display = (expType === 'cash' ? 'grid' : 'none');
    if ($('#panelTypeInstallment')) $('#panelTypeInstallment').style.display = (expType === 'installment' ? 'grid' : 'none');
    if ($('#panelTypeFixed')) $('#panelTypeFixed').style.display = (expType === 'fixed' ? 'grid' : 'none');

    if (expType === 'installment') {
      updateVarInstallments();
    }
  }

  function syncDestinationRules() {
    const state = getState();
    const destName = $('#entryDestination')?.value;
    const dest = (state.destinations || []).find(d => d.name === destName);
    const isPixOrCash = dest && (dest.name.toLowerCase() === 'pix' || dest.name.toLowerCase() === 'dinheiro');

    const destHint = $('#entryDestHint');
    const dueWrap = $('#dueDayWrap');
    const inheritedHint = $('#inheritedDueHint');
    const noteStep1Wrap = $('#entryNoteStep1Wrap');
    const stepInd1 = $('#stepIndicator1');
    const stepInd2 = $('#stepIndicator2');
    const stepInd3 = $('#stepIndicator3');
    const stepLines = $$('.wizard-line');
    const btnNext1 = $('#btnNextStep1');
    const submitBtn = $('#entrySubmitBtn');

    // Keep notes synced between fields
    setEntryNote(getEntryNote());

    if (isPixOrCash) {
      if (destHint) destHint.textContent = '⚡ Forma de pagamento à vista com quitação automática.';
      if (dueWrap) dueWrap.style.display = 'none';
      if ($('#entryDueDay')) $('#entryDueDay').value = '';
      if (inheritedHint) inheritedHint.style.display = 'none';
      setEntryExpenseType('cash');

      // Show note in Step 1 for shortcut flow
      if (noteStep1Wrap) noteStep1Wrap.style.display = 'grid';

      // Adapt stepper to Direct Flow
      if (stepInd1) {
        const span = stepInd1.querySelector('span:not(.wizard-dot)');
        if (span) span.textContent = 'Identificação & Finalização';
      }
      if (stepInd2) stepInd2.style.display = 'none';
      if (stepInd3) stepInd3.style.display = 'none';
      stepLines.forEach(l => l.style.display = 'none');

      // If on step 1, show Save button directly
      if (entryDlgState.step === 1) {
        if (btnNext1) btnNext1.style.display = 'none';
        if (submitBtn) {
          submitBtn.style.display = 'inline-flex';
          submitBtn.textContent = '✓ Salvar Lançamento';
        }
      }
    } else {
      if (noteStep1Wrap) noteStep1Wrap.style.display = 'none';
      if (dueWrap) dueWrap.style.display = 'grid';

      // Restore 3-step wizard stepper
      if (stepInd1) {
        const span = stepInd1.querySelector('span:not(.wizard-dot)');
        if (span) span.textContent = 'Identificação';
      }
      if (stepInd2) stepInd2.style.display = 'flex';
      if (stepInd3) stepInd3.style.display = 'flex';
      stepLines.forEach(l => l.style.display = 'block');

      if (entryDlgState.step === 1) {
        if (btnNext1) btnNext1.style.display = 'inline-flex';
        if (submitBtn) submitBtn.style.display = 'none';
      }

      if (dest && dest.dueDay) {
        if (destHint) destHint.textContent = `📅 Vencimento padrão deste destino: dia ${dest.dueDay}`;
        if ($('#entryDueDay') && ($('#entryDueDay').value === '' || entryDlgState.mode === 'new')) {
          $('#entryDueDay').value = dest.dueDay;
        }
        if (inheritedHint) {
          inheritedHint.textContent = `✓ Vencimento: dia ${dest.dueDay} (herdado de ${dest.name})`;
          inheritedHint.style.display = 'block';
        }
      } else {
        if (destHint) destHint.textContent = '';
        if (inheritedHint) inheritedHint.style.display = 'none';
      }
    }
  }

  function updateStep3Summary() {
    const state = getState();
    const name = $('#entryName')?.value.trim() || 'Sem nome';
    const amount = Number($('#entryAmount')?.value) || 0;
    const cat = $('#entryGroup')?.value || 'Gerais';
    const destName = $('#entryDestination')?.value || 'Nubank';
    const expType = entryDlgState.type || 'cash';
    const isPixOrCash = (destName.toLowerCase() === 'pix' || destName.toLowerCase() === 'dinheiro');

    if ($('#summaryName')) $('#summaryName').textContent = name;
    if ($('#summaryAmount')) $('#summaryAmount').textContent = currency(amount);
    if ($('#summaryCategory')) $('#summaryCategory').textContent = cat;
    if ($('#summaryDestination')) $('#summaryDestination').textContent = destName;

    if ($('#summaryType') && $('#summaryPeriod')) {
      if (expType === 'cash') {
        const cm = Number($('#cashEffMonth')?.value) || state.month;
        const cy = Number($('#cashEffYear')?.value) || state.year;
        $('#summaryType').textContent = 'À Vista';
        $('#summaryPeriod').textContent = `${MONTH_ABBR[cm - 1]}/${cy}`;
      } else if (expType === 'installment') {
        const count = Math.max(1, parseInt($('#varInstallmentsCount')?.value, 10) || 1);
        const sm = Number($('#varStartMonth')?.value) || state.month;
        const sy = Number($('#varStartYear')?.value) || state.year;
        const em = Number($('#varEndMonth')?.value) || sm;
        const ey = Number($('#varEndYear')?.value) || sy;
        $('#summaryType').textContent = `Parcelado (${count}x)`;
        $('#summaryPeriod').textContent = `${MONTH_ABBR[sm - 1]}/${sy} a ${MONTH_ABBR[em - 1]}/${ey}`;
      } else {
        const fm = Number($('#fixedEffMonth')?.value) || state.month;
        const fy = Number($('#fixedEffYear')?.value) || state.year;
        $('#summaryType').textContent = 'Fixa (Mensal)';
        $('#summaryPeriod').textContent = `Desde ${MONTH_ABBR[fm - 1]}/${fy}`;
      }
    }

    if (isPixOrCash) {
      if ($('#entryStatus')) $('#entryStatus').value = 'pago';
      if ($('#pixCashStatusHint')) $('#pixCashStatusHint').style.display = 'block';
    } else {
      if ($('#pixCashStatusHint')) $('#pixCashStatusHint').style.display = 'none';
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
      badge.innerHTML = `<span>Parcela única em ${MONTH_ABBR[sm - 1]}/${sy} • Total: ${currency(amount)}</span>`;
    } else {
      badge.classList.remove('invalid', 'error');
      badge.innerHTML = `<span>Vigência calculada: <strong>${MONTH_ABBR[sm - 1]}/${sy} a ${MONTH_ABBR[em - 1]}/${ey}</strong> (${count}x de ${currency(amount)} • Total: ${currency(totalAmount)})</span>`;
    }
  }

  function updateQuickExpenseSelects() {
    const state = getState();
    const sortedCats = (typeof getSortedCategories === 'function') ? getSortedCategories(state.categories) : (state.categories || []);
    const sortedDests = (typeof getSortedDestinations === 'function') ? getSortedDestinations(state.destinations) : (state.destinations || []);

    const groupSelect = $('#quickExpenseGroup');
    if (groupSelect) {
      groupSelect.innerHTML = sortedCats.map((c, idx) => {
        const name = (typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name);
        const color = (typeof getCategoryColor === 'function') ? getCategoryColor(c) : (c.color || (window.CATEGORY_COLORS && window.CATEGORY_COLORS[idx % window.CATEGORY_COLORS.length]) || '#1F7A5C');
        return `<option value="${escapeHtml(name)}" data-color="${color}">${escapeHtml(name)}</option>`;
      }).join('');
      if (sortedCats.length > 0) {
        groupSelect.value = (typeof getCategoryName === 'function') ? getCategoryName(sortedCats[0]) : (typeof sortedCats[0] === 'string' ? sortedCats[0] : sortedCats[0].name);
      }
    }

    const destSelect = $('#quickExpenseDestination');
    if (destSelect) {
      destSelect.innerHTML = sortedDests.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
      if (sortedDests.length > 0) {
        destSelect.value = sortedDests[0].name;
      }
    }
  }

  function syncQuickExpenseDestHint() {
    const state = getState();
    const destName = $('#quickExpenseDestination')?.value || '';
    const dest = (state.destinations || []).find(d => d.name === destName);
    const hintEl = $('#quickExpenseDestHint');
    if (!hintEl) return;

    const isPixOrCash = (destName.toLowerCase() === 'pix' || destName.toLowerCase() === 'dinheiro');
    if (isPixOrCash) {
      hintEl.textContent = '⚡ Pagamento à vista com quitação automática.';
      hintEl.style.color = 'var(--brand)';
    } else if (dest && dest.dueDay) {
      hintEl.textContent = `📅 Vencimento padrão deste destino: dia ${dest.dueDay}`;
      hintEl.style.color = 'var(--muted)';
    } else {
      hintEl.textContent = '✓ Lançamento à vista na competência atual.';
      hintEl.style.color = 'var(--muted)';
    }
  }

  function openQuickExpenseDialog() {
    const state = getState();
    const dlg = $('#quickExpenseDialog');
    $('#quickExpenseForm')?.reset();

    updateQuickExpenseSelects();
    syncQuickExpenseDestHint();

    const alert = $('#quickExpenseValidationAlert');
    if (alert) { alert.style.display = 'none'; alert.textContent = ''; }

    if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
  }
  window.openQuickExpenseDialog = openQuickExpenseDialog;

  function openEntryDialog(opts) {
    const state = getState();
    const entryDlg = $('#entryDialog');
    opts = opts || {};
    let mode = 'new', type = 'cash', id = null, fixedId = null;
    if (typeof opts === 'object' && opts !== null) {
      mode = opts.mode || 'new';
      type = opts.type || 'cash';
      id = opts.id || null;
      fixedId = opts.fixedId || null;
    }

    $('#entryForm').reset();
    setEntryNote('');
    fillMonthSelects();
    updateCategorySelects();
    updateDestinationSelects();

    const delBtn = $('#deleteEntryBtn');
    const fixActions = $('#fixedActions');
    if (delBtn) delBtn.hidden = true;
    if (fixActions) fixActions.hidden = true;

    const now = new Date();
    const curMonth = state.month || (now.getMonth() + 1);
    const curYear = state.year || now.getFullYear();

    if ($('#fixedEffMonth')) $('#fixedEffMonth').value = curMonth;
    if ($('#fixedEffYear')) $('#fixedEffYear').value = curYear;
    if ($('#cashEffMonth')) $('#cashEffMonth').value = curMonth;
    if ($('#cashEffYear')) $('#cashEffYear').value = curYear;
    if ($('#varStartMonth')) $('#varStartMonth').value = curMonth;
    if ($('#varStartYear')) $('#varStartYear').value = curYear;
    if ($('#varInstallmentsCount')) $('#varInstallmentsCount').value = 2;

    const sortedCats = (typeof getSortedCategories === 'function') ? getSortedCategories(state.categories) : (state.categories || []);
    const sortedDests = (typeof getSortedDestinations === 'function') ? getSortedDestinations(state.destinations) : (state.destinations || []);

    const firstCatName = sortedCats.length > 0
      ? ((typeof getCategoryName === 'function') ? getCategoryName(sortedCats[0]) : (typeof sortedCats[0] === 'string' ? sortedCats[0] : sortedCats[0].name))
      : 'Gerais';
    if ($('#entryGroup')) $('#entryGroup').value = firstCatName;

    if (mode === 'new') {
      entryDlgState = { mode: 'new', step: 1, type: (type === 'fixed' ? 'fixed' : 'cash'), id: null, fixedId: null };
      $('#entryDialogTitle').textContent = 'Nova Despesa';

      const defaultDest = sortedDests[0]?.name || 'Pix';
      $('#entryDestination').value = defaultDest;
      syncDestinationRules();
      setEntryExpenseType(entryDlgState.type);
      setWizardStep(1);
    } else if (type === 'fixed') {
      const fixed = state.fixed.find(f => f.id === fixedId || f.id === id);
      if (!fixed) return;
      const active = activeFixedForMonth(state.year, state.month).find(a => a.fixedId === fixed.id)
        || [...fixed.versions].sort((a, b) => mk(a.year, a.month) - mk(b.year, b.month))[0];

      entryDlgState = {
        mode: 'edit',
        step: 1,
        type: 'fixed',
        id: null,
        fixedId: fixed.id,
        effMonth: active.effMonth || active.month || (active.versions && active.versions[0]?.month),
        effYear: active.effYear || active.year || (active.versions && active.versions[0]?.year)
      };
      $('#entryDialogTitle').textContent = 'Editar Despesa Fixa';

      $('#entryName').value = fixed.name;
      $('#entryGroup').value = fixed.group || firstCatName;
      setEntryNote(fixed.note || '');
      $('#entryAmount').value = active.amount;
      $('#entryDestination').value = fixed.destination || 'Nubank';
      $('#entryDueDay').value = fixed.dueDay || '';

      const key = ymKey(state.year, state.month);
      const isPaid = fixed.paidHistory ? fixed.paidHistory[key] === true : (active.status === 'pago');
      $('#entryStatus').value = isPaid ? 'pago' : 'pendente';
      $('#fixedEffMonth').value = active.effMonth || active.month || state.month;
      $('#fixedEffYear').value = active.effYear || active.year || state.year;
      if (fixActions) fixActions.hidden = false;

      syncDestinationRules();
      setEntryExpenseType('fixed');
      setWizardStep(1);
    } else {
      const v = state.variable.find(x => x.id === id || x.id === fixedId);
      if (!v) return;

      const isInstallment = (v.installments > 1 || (mk(v.endYear, v.endMonth) > mk(v.startYear, v.startMonth)));
      const isPixOrCash = (v.destination && (v.destination.toLowerCase() === 'pix' || v.destination.toLowerCase() === 'dinheiro'));
      const expType = isPixOrCash ? 'cash' : (isInstallment ? 'installment' : 'cash');

      entryDlgState = { mode: 'edit', step: 1, type: expType, id: v.id, fixedId: null };
      $('#entryDialogTitle').textContent = isPixOrCash ? 'Editar Despesa (À Vista)' : (isInstallment ? 'Editar Despesa Parcelada' : 'Editar Despesa À Vista');

      $('#entryName').value = v.name;
      $('#entryGroup').value = v.group || firstCatName;
      setEntryNote(v.note || '');
      $('#entryAmount').value = v.amount;
      $('#entryDestination').value = v.destination || 'Nubank';
      $('#entryDueDay').value = v.dueDay || '';

      const key = ymKey(v.startYear || state.year, v.startMonth || state.month);
      const isPaid = v.paidHistory ? v.paidHistory[key] === true : (v.status === 'pago');
      $('#entryStatus').value = isPaid ? 'pago' : 'pendente';
      $('#cashEffMonth').value = v.startMonth || state.month;
      $('#cashEffYear').value = v.startYear || state.year;
      $('#varStartMonth').value = v.startMonth || state.month;
      $('#varStartYear').value = v.startYear || state.year;
      $('#varEndMonth').value = v.endMonth || state.month;
      $('#varEndYear').value = v.endYear || state.year;

      const count = Math.max(1, v.installments || (mk(v.endYear, v.endMonth) - mk(v.startYear, v.startMonth) + 1));
      if ($('#varInstallmentsCount')) $('#varInstallmentsCount').value = count;
      if (delBtn) delBtn.hidden = false;

      syncDestinationRules();
      setEntryExpenseType(expType);
      setWizardStep(1);
    }

    clearEntryValidation();
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

    $('#expensesAddBtn')?.addEventListener('click', () => openEntryDialog({ mode: 'new', type: 'cash' }));
    $('#addFixedBtn')?.addEventListener('click', () => openEntryDialog({ mode: 'new', type: 'fixed' }));
    $('#addVariableBtn')?.addEventListener('click', () => openEntryDialog({ mode: 'new', type: 'installment' }));

    // WIZARD NAVIGATION LISTENERS
    $('#entryDestination')?.addEventListener('change', syncDestinationRules);

    // Note inputs live synchronization
    $('#entryNoteStep1')?.addEventListener('input', (e) => {
      if ($('#entryNote')) $('#entryNote').value = e.target.value;
    });
    $('#entryNote')?.addEventListener('input', (e) => {
      if ($('#entryNoteStep1')) $('#entryNoteStep1').value = e.target.value;
    });

    // Auto-clear validation error states when user interacts with dialog fields
    const entryDlgEl = $('#entryDialog');
    if (entryDlgEl) {
      const handleFieldCorrection = (e) => {
        const target = e.target;
        if (target && (target.getAttribute('aria-invalid') === 'true' || target.classList.contains('is-invalid'))) {
          target.removeAttribute('aria-invalid');
          target.classList.remove('is-invalid', 'input-error');
          const hasOtherErrors = entryDlgEl.querySelector('[aria-invalid="true"]');
          if (!hasOtherErrors) {
            const alert = $('#entryValidationAlert');
            if (alert) alert.style.display = 'none';
          }
        }
      };
      entryDlgEl.addEventListener('input', handleFieldCorrection);
      entryDlgEl.addEventListener('change', handleFieldCorrection);
    }

    $$('.entry-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.expType;
        if (t) setEntryExpenseType(t);
      });
    });

    $('#btnNextStep1')?.addEventListener('click', () => {
      if (!validateEntryStep1()) return;
      syncDestinationRules();
      setWizardStep(2);
    });

    $('#btnBackStep2')?.addEventListener('click', () => setWizardStep(1));

    $('#btnNextStep2')?.addEventListener('click', () => {
      if (!validateEntryStep2()) return;
      updateStep3Summary();
      setWizardStep(3);
    });

    $('#btnBackStep3')?.addEventListener('click', () => setWizardStep(2));

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
      const name = $('#entryName').value.trim();
      let group = $('#entryGroup').value.trim() || 'Gerais';
      const note = getEntryNote();
      const amount = Number($('#entryAmount').value);
      const destination = $('#entryDestination').value || 'Nubank';
      const isPixOrCash = (destination.toLowerCase() === 'pix' || destination.toLowerCase() === 'dinheiro');
      const type = isPixOrCash ? 'cash' : (entryDlgState.type || 'cash');
      const dueDay = isPixOrCash ? null : (Number($('#entryDueDay').value) || null);
      const status = isPixOrCash ? 'pago' : ($('#entryStatus').value || 'pendente');
      const key = ymKey(state.year, state.month);

      if (!validateEntryStep1()) {
        setWizardStep(1);
        return;
      }

      if (!isPixOrCash && !validateEntryStep2()) {
        setWizardStep(2);
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
          fixed.paymentType = 'fixed';
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
            paymentType: 'fixed',
            versions: [{ year: effYear, month: effMonth, amount, startYear: effYear, startMonth: effMonth }],
            paidHistory: {}
          });
          fixed = state.fixed.find(f => f.id === newId);
        }

        if (fixed && effMonth === state.month && effYear === state.year) {
          if (typeof setExpensePayment === 'function') {
            setExpensePayment(fixed, effYear, effMonth, status === 'pago' ? amount : 0, amount);
          } else {
            fixed.paidHistory = fixed.paidHistory || {};
            fixed.paidHistory[key] = (status === 'pago');
          }
        }
      } else {
        state.variable = state.variable || [];
        let sMonth, sYear, count, eMonth, eYear, pType;

        let v = entryDlgState.id ? state.variable.find(x => x.id === entryDlgState.id) : null;

        if (isPixOrCash) {
          // Shortcut flow: Creation uses active navigation month; Edit preserves original months
          if (v) {
            sMonth = v.startMonth || state.month;
            sYear = v.startYear || state.year;
            eMonth = v.endMonth || sMonth;
            eYear = v.endYear || sYear;
          } else {
            sMonth = state.month;
            sYear = state.year;
            eMonth = state.month;
            eYear = state.year;
          }
          count = 1;
          pType = 'cash';
        } else if (type === 'cash') {
          sMonth = Number($('#cashEffMonth')?.value) || state.month;
          sYear = Number($('#cashEffYear')?.value) || state.year;
          count = 1;
          eMonth = sMonth;
          eYear = sYear;
          pType = 'cash';
        } else {
          sMonth = Number($('#varStartMonth')?.value) || state.month;
          sYear = Number($('#varStartYear')?.value) || state.year;
          count = Math.max(1, parseInt($('#varInstallmentsCount')?.value, 10) || 1);
          const endMonthIdx = (sMonth - 1) + (count - 1);
          eYear = sYear + Math.floor(endMonthIdx / 12);
          eMonth = (endMonthIdx % 12) + 1;
          pType = 'installment';
        }

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
          v.paymentType = pType;
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
            paymentType: pType,
            paidHistory: {}
          });
          v = state.variable.find(x => x.id === newId);
        }

        if (v) {
          if (typeof setExpensePayment === 'function') {
            setExpensePayment(v, sYear, sMonth, status === 'pago' ? amount : 0, amount);
          } else {
            v.paidHistory = v.paidHistory || {};
            const expenseKey = ymKey(sYear, sMonth);
            v.paidHistory[expenseKey] = (status === 'pago');
          }
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
      if (entryDlgState.type !== 'fixed') state.variable = state.variable.filter(v => v.id !== entryDlgState.id);
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

    // Botão de Despesa Rápida no desktop
    $('#btnQuickExpenseDesktop')?.addEventListener('click', openQuickExpenseDialog);

    // Mudança de destino no Quick Expense
    $('#quickExpenseDestination')?.addEventListener('change', syncQuickExpenseDestHint);

    // Alternar do Quick Expense para o Wizard Completo
    $('#btnSwitchToFullWizard')?.addEventListener('click', () => {
      const qName = ($('#quickExpenseName')?.value || '').trim();
      const qAmt = ($('#quickExpenseAmount')?.value || '').trim();
      const qGrp = ($('#quickExpenseGroup')?.value || '').trim();
      const qDst = ($('#quickExpenseDestination')?.value || '').trim();
      const qNote = ($('#quickExpenseNote')?.value || '').trim();

      $('#quickExpenseDialog')?.close();
      openEntryDialog({ mode: 'new', type: 'cash' });

      if (qName && $('#entryName')) $('#entryName').value = qName;
      if (qAmt && $('#entryAmount')) $('#entryAmount').value = qAmt;
      if (qGrp && $('#entryGroup')) $('#entryGroup').value = qGrp;
      if (qDst && $('#entryDestination')) {
        $('#entryDestination').value = qDst;
        syncDestinationRules();
      }
      if (qNote) setEntryNote(qNote);
    });

    // Submissão do Quick Expense Form
    $('#quickExpenseForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = ($('#quickExpenseName')?.value || '').trim();
      const amount = Number($('#quickExpenseAmount')?.value);
      const group = ($('#quickExpenseGroup')?.value || '').trim() || 'Gerais';
      const destination = ($('#quickExpenseDestination')?.value || '').trim() || 'Pix';
      const note = ($('#quickExpenseNote')?.value || '').trim();

      const alert = $('#quickExpenseValidationAlert');
      if (!name) {
        if (alert) { alert.style.display = 'block'; alert.textContent = 'Informe a descrição do lançamento.'; }
        return;
      }
      if (!amount || isNaN(amount) || amount <= 0) {
        if (alert) { alert.style.display = 'block'; alert.textContent = 'Informe um valor válido maior que zero.'; }
        return;
      }

      const state = getState();
      state.variable = state.variable || [];
      const destMeta = (state.destinations || []).find(d => d.name === destination);
      const isPixOrCash = (destination.toLowerCase() === 'pix' || destination.toLowerCase() === 'dinheiro');
      const dueDay = isPixOrCash ? null : (destMeta?.dueDay || null);
      const y = state.year, m = state.month;

      const newExpense = {
        id: uid(),
        name,
        amount,
        group,
        destination,
        dueDay,
        note,
        startMonth: m,
        startYear: y,
        endMonth: m,
        endYear: y,
        installments: 1,
        paymentType: 'cash',
        status: isPixOrCash ? 'pago' : 'pendente',
        paidHistory: {}
      };

      if (isPixOrCash && typeof setExpensePayment === 'function') {
        setExpensePayment(newExpense, y, m, amount, amount);
      }

      state.variable.push(newExpense);
      saveState();
      $('#quickExpenseDialog')?.close();
      render();
      notify('Despesa rápida adicionada com sucesso!', 'success');
    });

    // Partial Payment: Quitar Total / Receber Restante
    $('#btnPayFull')?.addEventListener('click', () => {
      if (!partialPayState.type || !partialPayState.idKey) return;
      const state = getState();
      const y = state.year, m = state.month;
      let item = null;
      if (partialPayState.type === 'fixed') {
        item = state.fixed.find(f => f.id === partialPayState.idKey);
      } else if (partialPayState.type === 'variable') {
        item = state.variable.find(v => v.id === partialPayState.idKey);
      } else if (partialPayState.type === 'debtor') {
        item = (state.debtors || []).find(d => d.id === partialPayState.idKey);
      } else if (partialPayState.type === 'extra') {
        item = (state.extras || []).find(e => e.id === partialPayState.idKey);
      }
      if (!item) return;

      if (typeof setExpensePayment === 'function') {
        setExpensePayment(item, y, m, partialPayState.totalAmount, partialPayState.totalAmount);
      } else {
        item.paidHistory = item.paidHistory || {};
        item.paidHistory[ymKey(y, m)] = {
          paidAmount: partialPayState.totalAmount,
          updatedAt: new Date().toISOString()
        };
      }

      saveState();
      $('#partialPaymentDialog')?.close();
      render();
      const actionMsg = partialPayState.isIncome ? 'recebido e quitado' : 'quitada';
      notify(`"${partialPayState.itemName}" ${actionMsg} com sucesso!`, 'success');
    });

    // Partial Payment: Submissão do formulário (pagamento / recebimento parcial ou customizado)
    $('#partialPayForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!partialPayState.type || !partialPayState.idKey) return;
      const payVal = Number($('#partialPayAmountInput')?.value);
      const alert = $('#partialPayAlert');

      if (!payVal || isNaN(payVal) || payVal <= 0) {
        if (alert) { alert.style.display = 'block'; alert.textContent = 'Informe um valor válido maior que zero.'; }
        return;
      }

      const remaining = Number(partialPayState.remainingAmount || 0);
      if (payVal > remaining + 0.0001) {
        const actionLabel = partialPayState.isIncome ? 'a receber' : 'a pagar';
        if (alert) { alert.style.display = 'block'; alert.textContent = `O valor informado (${currency(payVal)}) excede o restante ${actionLabel} (${currency(remaining)}).`; }
        return;
      }

      const state = getState();
      const y = state.year, m = state.month;
      let item = null;
      if (partialPayState.type === 'fixed') {
        item = state.fixed.find(f => f.id === partialPayState.idKey);
      } else if (partialPayState.type === 'variable') {
        item = state.variable.find(v => v.id === partialPayState.idKey);
      } else if (partialPayState.type === 'debtor') {
        item = (state.debtors || []).find(d => d.id === partialPayState.idKey);
      } else if (partialPayState.type === 'extra') {
        item = (state.extras || []).find(e => e.id === partialPayState.idKey);
      }
      if (!item) return;

      const newPaidTotal = Number(partialPayState.paidAmount || 0) + payVal;
      if (typeof setExpensePayment === 'function') {
        setExpensePayment(item, y, m, newPaidTotal, partialPayState.totalAmount);
      } else {
        item.paidHistory = item.paidHistory || {};
        item.paidHistory[ymKey(y, m)] = {
          paidAmount: Math.round(newPaidTotal * 100) / 100,
          updatedAt: new Date().toISOString()
        };
      }

      saveState();
      $('#partialPaymentDialog')?.close();
      render();
      const actionName = partialPayState.isIncome ? 'Recebimento' : 'Pagamento';
      notify(`${actionName} de ${currency(payVal)} registrado para "${partialPayState.itemName}"!`, 'success');
    });
  }

  // Bridges publicas autorizadas do modulo de despesas
  window.renderExpensesLists = renderExpensesLists;
  window.renderSimplifiedExpenses = renderSimplifiedExpenses;
  window.openEntryDialog = openEntryDialog;
  window.openQuickExpenseDialog = openQuickExpenseDialog;
  window.openPartialPaymentDialog = openPartialPaymentDialog;
  window.openFullscreenTable = openFullscreenTable;
  window.toggleExpenseStatus = toggleExpenseStatus;
  window.markAllSectionPaid = markAllSectionPaid;
  window.reorderExpenses = reorderExpenses;
  window.moveExpenseToEndOfList = moveExpenseToEndOfList;
  window.buildEntryRow = buildEntryRow;
  window.renderSection = renderSection;
  window.validateEntryStep1 = validateEntryStep1;
  window.validateEntryStep2 = validateEntryStep2;
  window.clearEntryValidation = clearEntryValidation;
  window.setEntryFieldError = setEntryFieldError;

  // Inicializacao sincrona dos listeners de despesas
  try {
    initExpensesListeners();
  } catch (err) {
    console.error('Erro ao inicializar listeners de despesas:', err);
  }
})();
