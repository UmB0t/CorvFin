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

  // Mapeamento semântico dos status do domínio financeiro
  function getStatusSortRank(status) {
    const s = String(status || '').toLowerCase().trim();
    switch (s) {
      case 'pendente':
      case 'em_aberto':
      case 'unpaid':
      case 'aberto':
        return 1;
      case 'parcial':
      case 'partial':
        return 2;
      case 'pago':
      case 'recebido':
      case 'liquidado':
      case 'settled':
      case 'paid':
        return 3;
      default:
        return 99; // Fallback determinístico para status desconhecido
    }
  }

  // Extração da data temporal efetiva da ocorrência no mês
  function extractEffectiveDueDay(item) {
    let rawDay = item.dueDay;
    if (rawDay === undefined || rawDay === null || rawDay === '') {
      rawDay = item.paymentDay;
    }
    const dayNum = Number(rawDay);
    if (Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31) {
      return dayNum;
    }
    return null;
  }

  // Comparador semântico para a tabela de despesas
  function compareFullscreenItems(a, b, key, asc) {
    let cmp = 0;

    switch (key) {
      case 'type': {
        const typeA = String(a.typeName || a.itemType || '');
        const typeB = String(b.typeName || b.itemType || '');
        cmp = typeA.localeCompare(typeB, 'pt-BR', { sensitivity: 'base' });
        break;
      }
      case 'name': {
        const nameA = String(a.name || a.title || '');
        const nameB = String(b.name || b.title || '');
        cmp = nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' });
        break;
      }
      case 'amount': {
        const amtA = Number(a.amount) || 0;
        const amtB = Number(b.amount) || 0;
        cmp = amtA - amtB;
        break;
      }
      case 'group':
      case 'category': {
        const catA = String(a.group || a.category || 'Gerais');
        const catB = String(b.group || b.category || 'Gerais');
        cmp = catA.localeCompare(catB, 'pt-BR', { sensitivity: 'base' });
        break;
      }
      case 'destination': {
        const destA = String(a.destination || 'Gerais');
        const destB = String(b.destination || 'Gerais');
        cmp = destA.localeCompare(destB, 'pt-BR', { sensitivity: 'base' });
        break;
      }
      case 'dueDay': {
        // Prioridade 1: data temporal efetiva da ocorrência (itens sem data ao final no ASC)
        const dayA = extractEffectiveDueDay(a);
        const dayB = extractEffectiveDueDay(b);

        if (dayA !== null && dayB === null) {
          cmp = -1;
        } else if (dayA === null && dayB !== null) {
          cmp = 1;
        } else if (dayA !== null && dayB !== null && dayA !== dayB) {
          cmp = dayA - dayB;
        } else {
          // Prioridade 2: índice da parcela como desempate quando aplicável
          const instA = Number(a.installmentIndex) || 0;
          const instB = Number(b.installmentIndex) || 0;
          if (instA !== instB) {
            cmp = instA - instB;
          }
        }
        break;
      }
      case 'status': {
        const rankA = getStatusSortRank(a.status);
        const rankB = getStatusSortRank(b.status);
        if (rankA !== rankB) {
          cmp = rankA - rankB;
        } else {
          cmp = String(a.status || '').localeCompare(String(b.status || ''), 'pt-BR', { sensitivity: 'base' });
        }
        break;
      }
      default: {
        const valA = String(a[key] || '');
        const valB = String(b[key] || '');
        cmp = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' });
        break;
      }
    }

    // Desempate estável por nome se diferente de 'name'
    if (cmp === 0 && key !== 'name') {
      cmp = String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' });
    }

    return asc ? cmp : -cmp;
  }

  function updateFullscreenTableSortIndicators() {
    const headers = document.querySelectorAll('#fullscreenTable th[data-sort-col]');
    headers.forEach(th => {
      const col = th.getAttribute('data-sort-col');
      if (!col) return;
      const isActive = (col === fsSortKey);
      const icon = isActive ? (fsSortAsc ? '▲' : '▼') : '⇳';

      th.classList.toggle('active-sort', isActive);
      th.setAttribute('aria-sort', isActive ? (fsSortAsc ? 'ascending' : 'descending') : 'none');

      let iconSpan = th.querySelector('.sort-icon');
      if (iconSpan) {
        iconSpan.textContent = icon;
      }
    });
  }

  function bindFullscreenTableSortListeners() {
    const headers = document.querySelectorAll('#fullscreenTable th[data-sort-col]');
    headers.forEach(th => {
      if (th._fsSortBound) return;
      th._fsSortBound = true;
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-sort-col');
        if (!col) return;
        if (fsSortKey === col) {
          fsSortAsc = !fsSortAsc;
        } else {
          fsSortKey = col;
          fsSortAsc = true;
        }
        renderFullscreenTable();
      });
    });
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

        bindFullscreenTableSortListeners();
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

        allItems.sort((a, b) => compareFullscreenItems(a, b, fsSortKey, fsSortAsc));

        $('#fsTableSummary').textContent = `Exibindo ${allItems.length} lançamentos em ${MONTH_NAMES[m - 1]}/${y}`;

        bindFullscreenTableSortListeners();
        updateFullscreenTableSortIndicators();

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
        payee, paymentMethod, account,
        onClickToggleStatus, onClickEdit, onClickTimeline, onMouseEnter, onMouseLeave,
        customLeftBadge, onDelete, showNatureBadge = false
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
            statusIcon = `<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 9 9h-9z" fill="currentColor" opacity="0.75"/></svg>`;
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
          partialTagHtml = `<span class="tag partial">${prefix}: ${currency(resolvedPaid)} • Restante: ${currency(resolvedRem)}</span>`;
        }

        // Resolução de campos V2 com fallback seguro para legado (constants.js helpers)
        const resolvedPayee = payee || (typeof resolveExpensePayee === 'function' ? resolveExpensePayee({ payee, name: title }) : null);
        const resolvedMethod = paymentMethod || (typeof resolveExpensePaymentMethod === 'function' ? resolveExpensePaymentMethod({ destination }) : null);
        const resolvedAccount = account || (typeof resolveExpenseAccount === 'function' ? resolveExpenseAccount({ destination }) : null);

        // Sublinha de contexto V2 limpa e despoluída: Favorecido · Método · Conta
        const contextParts = [];
        if (resolvedPayee) {
          contextParts.push(resolvedPayee);
        }
        if (resolvedMethod && resolvedMethod !== 'outros') {
          const mName = (window.PAYMENT_METHOD_NAMES_MAP && window.PAYMENT_METHOD_NAMES_MAP[resolvedMethod]) || resolvedMethod.toUpperCase();
          contextParts.push(mName);
        }
        if (resolvedAccount) {
          contextParts.push(resolvedAccount);
        } else if (type === 'debtor' && destination && destination !== 'Renda Extra') {
          contextParts.push(destination);
        }

        const contextSubHtml = contextParts.length > 0
          ? `<div class="entry-sub">${contextParts.map(escapeHtml).join(' · ')}</div>`
          : '';

        const dragHandleTitle = (type === 'fixed' || type === 'variable')
          ? 'Arraste para reordenar ou converter entre Fixa e Variável'
          : 'Arraste para reordenar este item';

        const dragHandleHtml = `
      <span class="drag-handle" data-tooltip="${dragHandleTitle}" aria-label="${dragHandleTitle}">
        <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px;"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
      </span>`;

        const timelineBtnHtml = (type === 'fixed' || type === 'variable') ? `
      <button type="button" class="icon-btn small timeline-btn" data-tooltip="Análise da Despesa" aria-label="Análise da Despesa">${ICONS.timeline || '<svg class="svg-icon" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'}</button>` : '';

        const editBtnHtml = onClickEdit ? `
      <button type="button" class="icon-btn small edit-btn" data-tooltip="Editar Lançamento" aria-label="Editar Lançamento">${ICONS.edit}</button>` : '';

        const deleteBtnHtml = onDelete ? `
      <button type="button" class="icon-btn small delete-btn" data-tooltip="Excluir Lançamento" aria-label="Excluir Lançamento" style="color:var(--danger);">${ICONS.close}</button>` : '';

        const amountClass = type === 'benefit' ? 'negative' : (isPaid ? 'positive' : (isPartial ? 'partial' : ''));

        // Filtragem limpa de tags: remove chips redundantes de Total de contrato e tipo
        const filteredTags = (tags || []).filter(Boolean).filter(t => {
          if (typeof t === 'string') {
            if (t.startsWith('Total:') || t === 'Fixa' || t === 'Variável') return false;
          }
          return true;
        });

        const tagsHtml = filteredTags.map(t => {
          const isCat = (state.categories || []).some(c => ((typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name)) === t);
          if (isCat && typeof getCategoryIconSvg === 'function') {
            const iconSvg = getCategoryIconSvg(t);
            return `<span class="tag tag-cat">${iconSvg} ${escapeHtml(t)}</span>`;
          }
          return `<span class="tag">${escapeHtml(t)}</span>`;
        }).join('');

        let natureTagHtml = '';
        if (showNatureBadge && (type === 'fixed' || type === 'variable')) {
          const isFixed = type === 'fixed';
          natureTagHtml = `<span class="nature-tag ${isFixed ? 'nature-fixed' : 'nature-variable'}">${isFixed ? 'Fixa' : 'Variável'}</span>`;
        }

        row.innerHTML = `
      ${dragHandleHtml}
      ${leftIconHtml}
      <div class="entry-info">
        <div class="entry-title">${escapeHtml(title)}</div>
        ${contextSubHtml}
        <div class="entry-meta">
          ${natureTagHtml}
          ${dueTagHtml}
          ${partialTagHtml}
          ${tagsHtml}
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
      const resolved = (item && typeof resolveInstallmentAmounts === 'function')
        ? resolveInstallmentAmounts(item, y, m)
        : null;
      totalAmount = resolved ? resolved.currentInstallmentAmount : (item ? Number(item.amount) : 0);
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
      const resolved = (item && typeof resolveInstallmentAmounts === 'function')
        ? resolveInstallmentAmounts(item, y, m)
        : null;
      totalAmount = resolved ? resolved.currentInstallmentAmount : (item ? Number(item.amount) : 0);
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
        const diff = Number(b.amount || 0) - Number(a.amount || 0);
        return diff !== 0 ? diff : stableTieBreaker(a, b);
      });
    }
    case 'amount-asc':
      return sorted.sort((a, b) => {
        const diff = Number(a.amount || 0) - Number(b.amount || 0);
        return diff !== 0 ? diff : stableTieBreaker(a, b);
      });
    case 'name-asc':
      return sorted.sort((a, b) => {
        const diff = (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
        return diff !== 0 ? diff : stableTieBreaker(a, b);
      });
    case 'name-desc':
      return sorted.sort((a, b) => {
        const diff = (b.name || '').localeCompare(a.name || '', 'pt-BR', { sensitivity: 'base' });
        return diff !== 0 ? diff : stableTieBreaker(a, b);
      });
    case 'due-asc':
      return sorted.sort((a, b) => {
        const dA = (a.dueDay != null && a.dueDay !== '') ? Number(a.dueDay) : 999;
        const dB = (b.dueDay != null && b.dueDay !== '') ? Number(b.dueDay) : 999;
        if (dA !== dB) return dA - dB;
        const diff = Number(b.amount || 0) - Number(a.amount || 0);
        return diff !== 0 ? diff : stableTieBreaker(a, b);
      });
    case 'amount-desc':
    default:
      return sorted.sort((a, b) => {
        const diff = Number(b.amount || 0) - Number(a.amount || 0);
        return diff !== 0 ? diff : stableTieBreaker(a, b);
      });
  }
}

function filterExpenseItem(item, query, statusFilter, methodFilter) {
  const itemMethod = (typeof resolveExpensePaymentMethod === 'function') ? resolveExpensePaymentMethod(item) : (item.payment?.method || null);
  const itemAcc = (typeof resolveExpenseAccount === 'function') ? resolveExpenseAccount(item) : (item.payment?.account || null);
  if (statusFilter !== 'all' && item.status !== statusFilter) return false;
  if (methodFilter !== 'all' && itemMethod !== methodFilter) return false;
  if (query) {
    const itemPayee = (typeof resolveExpensePayee === 'function') ? (resolveExpensePayee(item) || '') : (item.payee || '');
    const mName = (window.PAYMENT_METHOD_NAMES_MAP && itemMethod && window.PAYMENT_METHOD_NAMES_MAP[itemMethod]) || itemMethod || '';
    const text = `${item.name} ${item.group || ''} ${itemPayee} ${mName} ${itemAcc || ''} ${item.note || ''}`.toLowerCase();
    if (!text.includes(query)) return false;
  }
  return true;
}

const EXPENSES_VIEW_MODE_STORAGE_KEY = 'corvfin_expenses_view_mode';

let inMemoryExpensesViewMode = 'all';

function readExpensesViewMode() {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(EXPENSES_VIEW_MODE_STORAGE_KEY);
      if (stored === 'all' || stored === 'type') {
        inMemoryExpensesViewMode = stored;
        return stored;
      }
      return 'all';
    }
  } catch (_) {}
  return inMemoryExpensesViewMode || 'all';
}
window.readExpensesViewMode = readExpensesViewMode;

function writeExpensesViewMode(mode) {
  if (mode !== 'all' && mode !== 'type') return;
  inMemoryExpensesViewMode = mode;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(EXPENSES_VIEW_MODE_STORAGE_KEY, mode);
    }
  } catch (_) {}
}
window.writeExpensesViewMode = writeExpensesViewMode;

let currentExpensesViewMode = readExpensesViewMode();

function updateExpensesViewModeUI() {
  const isAll = currentExpensesViewMode === 'all';
  const allBtn = $('#expensesViewAllBtn');
  const byTypeBtn = $('#expensesViewByTypeBtn');
  const simpContainer = $('#simplifiedExpensesContainer');
  const normalGrid = $('#normalExpensesGrid');

  if (allBtn) {
    allBtn.classList.toggle('active', isAll);
    allBtn.setAttribute('aria-selected', isAll ? 'true' : 'false');
  }
  if (byTypeBtn) {
    byTypeBtn.classList.toggle('active', !isAll);
    byTypeBtn.setAttribute('aria-selected', !isAll ? 'true' : 'false');
  }
  if (simpContainer) simpContainer.hidden = !isAll;
  if (normalGrid) normalGrid.hidden = isAll;
}

function resetExpensesViewMode(forceAll = false) {
  if (forceAll) {
    writeExpensesViewMode('all');
    currentExpensesViewMode = 'all';
  } else {
    currentExpensesViewMode = readExpensesViewMode();
  }
  updateExpensesViewModeUI();
}
window.resetExpensesViewMode = resetExpensesViewMode;

function getExpensesViewMode() {
  return currentExpensesViewMode;
}
window.getExpensesViewMode = getExpensesViewMode;

function setExpensesViewMode(mode) {
  const normalized = (mode === 'type' || mode === 'by_type') ? 'type' : (mode === 'all' ? 'all' : null);
  if (normalized) {
    writeExpensesViewMode(normalized);
    currentExpensesViewMode = normalized;
    renderExpensesLists();
  }
}
window.setExpensesViewMode = setExpensesViewMode;

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

  const query = ($('#expensesSearchInput')?.value || '').toLowerCase().trim();
  const statusFilter = $('#expensesStatusFilter')?.value || 'all';
  const methodFilter = $('#expensesDestFilter')?.value || 'all';
  const sortMode = $('#expensesSortFilter') ? $('#expensesSortFilter').value : 'amount-desc';
  const isFiltered = Boolean(query || statusFilter !== 'all' || methodFilter !== 'all');

  const rawFixed = activeFixedForMonth(y, m).map(f => Object.assign({ typeName: 'Fixa', itemType: 'fixed' }, f));
  const rawVariable = activeVariableForMonth(y, m).map(v => Object.assign({ typeName: 'Variável', itemType: 'variable' }, v));
  const allRaw = [...rawFixed, ...rawVariable];
  const totalCanonicalExpenses = allRaw.reduce((s, i) => s + Number(i.amount || 0), 0);

  checkDueAlerts(allRaw);

  const filtered = allRaw.filter(item => filterExpenseItem(item, query, statusFilter, methodFilter));
  const combined = sortExpensesList(filtered, sortMode);

  const totalFiltered = combined.reduce((s, i) => s + Number(i.amount || 0), 0);
  const simpSumAll = $('#simpSumAll');
  if (simpSumAll) {
    if (isFiltered) {
      simpSumAll.textContent = `${combined.length} ${combined.length === 1 ? 'resultado' : 'resultados'} · ${currency(totalFiltered)}`;
    } else {
      simpSumAll.textContent = currency(totalCanonicalExpenses);
    }
  }

  const container = $('#simpExpensesList');
  if (!container) return;
  container.innerHTML = '';

  if (combined.length === 0) {
    if (allRaw.length > 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">Nenhum resultado encontrado</div>
          <div class="empty-desc">Nenhuma despesa corresponde aos filtros selecionados.</div>
        </div>`;
    } else {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📂</div>
          <div class="empty-title">Nenhuma despesa no mês</div>
          <div class="empty-desc">Não há despesas fixas ou variáveis cadastradas para esta competência.</div>
          <button type="button" class="btn primary small" id="simpEmptyAddBtn">Novo Lançamento</button>
        </div>`;
      container.querySelector('#simpEmptyAddBtn')?.addEventListener('click', () => openEntryDialog({ mode: 'new', type: 'fixed' }));
    }
    updateMarkAllButtonState('#simpMarkAllPaidBtn', allRaw);
    return;
  }

  combined.forEach(item => {
    const isFixed = item.itemType === 'fixed';
    const origItem = isFixed ? (state.fixed.find(f => f.id === item.fixedId) || item) : (state.variable.find(v => v.id === item.id) || item);
    const activeMonths = isFixed ? getFixedActiveMonths(origItem, y) : getVariableActiveMonths(origItem, y);

    const row = buildEntryRow({
      id: item.id,
      fixedId: item.fixedId,
      type: item.itemType,
      title: item.name,
      tags: [
        item.group || 'Gerais',
        isFixed ? `desde ${MONTH_ABBR[(item.effMonth || 1) - 1]}/${item.effYear}` : (item.installmentTotal > 1 ? `parcela ${item.installmentIndex}/${item.installmentTotal}` : null)
      ].filter(Boolean),
      amount: item.amount,
      status: item.status,
      paidAmount: item.paidAmount,
      remainingAmount: item.remainingAmount,
      dueDay: item.dueDay,
      destination: item.destination,
      payee: item.payee || origItem.payee,
      paymentMethod: item.payment?.method || origItem.payment?.method,
      account: item.payment?.account || origItem.payment?.account,
      showNatureBadge: true,
      onClickToggleStatus: () => toggleExpenseStatus(item.itemType, isFixed ? item.fixedId : item.id, item.status),
      onClickEdit: () => openEntryDialog({ mode: 'edit', type: item.itemType, fixedId: item.fixedId, id: item.id }),
      onClickTimeline: () => openExpenseTimeline({ type: item.itemType, fixedId: item.fixedId, id: item.id }),
      onMouseEnter: () => highlightRibbonMonths(activeMonths),
      onMouseLeave: clearRibbonHighlight
    });
    container.appendChild(row);
  });

  updateMarkAllButtonState('#simpMarkAllPaidBtn', allRaw);
}

function renderByTypeExpenses() {
  const state = getState();
  const y = state.year, m = state.month;

  const query = ($('#expensesSearchInput')?.value || '').toLowerCase().trim();
  const statusFilter = $('#expensesStatusFilter')?.value || 'all';
  const methodFilter = $('#expensesDestFilter')?.value || 'all';
  const sortMode = $('#expensesSortFilter') ? $('#expensesSortFilter').value : 'amount-desc';
  const isFiltered = Boolean(query || statusFilter !== 'all' || methodFilter !== 'all');

  const rawFixed = activeFixedForMonth(y, m).map(f => Object.assign({ typeName: 'Fixa', itemType: 'fixed' }, f));
  const rawVariable = activeVariableForMonth(y, m).map(v => Object.assign({ typeName: 'Variável', itemType: 'variable' }, v));

  checkDueAlerts([...rawFixed, ...rawVariable]);

  const fixed = sortExpensesList(rawFixed.filter(item => filterExpenseItem(item, query, statusFilter, methodFilter)), sortMode);
  const fixedListEl = $('#listFixed');
  if (fixedListEl) {
    fixedListEl.innerHTML = '';
    if (fixed.length === 0) {
      if (rawFixed.length > 0) {
        fixedListEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">Nenhuma despesa fixa encontrada</div>
            <div class="empty-desc">Nenhum item corresponde aos filtros selecionados.</div>
          </div>`;
      } else {
        fixedListEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📂</div>
            <div class="empty-title">Nenhuma despesa fixa</div>
            <div class="empty-desc">Não há despesas fixas ativas para este mês.</div>
          </div>`;
      }
    } else {
      fixed.forEach(f => {
        const origFixed = state.fixed.find(x => x.id === f.fixedId) || f;
        const activeMonths = getFixedActiveMonths(origFixed, y);
        fixedListEl.appendChild(buildEntryRow({
          fixedId: f.fixedId, type: 'fixed', title: f.name,
          tags: [f.group || 'Gerais', `desde ${MONTH_ABBR[f.effMonth - 1]}/${f.effYear}`],
          amount: f.amount, status: f.status, paidAmount: f.paidAmount, remainingAmount: f.remainingAmount,
          dueDay: f.dueDay, destination: f.destination,
          payee: f.payee || origFixed.payee,
          paymentMethod: f.payment?.method || origFixed.payment?.method,
          account: f.payment?.account || origFixed.payment?.account,
          showNatureBadge: false,
          onClickToggleStatus: () => toggleExpenseStatus('fixed', f.fixedId, f.status),
          onClickEdit: () => openEntryDialog({ mode: 'edit', type: 'fixed', fixedId: f.fixedId }),
          onClickTimeline: () => openExpenseTimeline({ type: 'fixed', fixedId: f.fixedId }),
          onMouseEnter: () => highlightRibbonMonths(activeMonths),
          onMouseLeave: clearRibbonHighlight
        }));
      });
    }
  }

  const sumFixedEl = $('#sumFixed');
  if (sumFixedEl) {
    const fixedTotal = fixed.reduce((s, i) => s + Number(i.amount || 0), 0);
    sumFixedEl.textContent = isFiltered ? `${fixed.length} · ${currency(fixedTotal)}` : currency(fixedTotal);
  }

  const variable = sortExpensesList(rawVariable.filter(item => filterExpenseItem(item, query, statusFilter, methodFilter)), sortMode);
  const varListEl = $('#listVariable');
  if (varListEl) {
    varListEl.innerHTML = '';
    if (variable.length === 0) {
      if (rawVariable.length > 0) {
        varListEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">Nenhuma despesa variável encontrada</div>
            <div class="empty-desc">Nenhum item corresponde aos filtros selecionados.</div>
          </div>`;
      } else {
        varListEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📂</div>
            <div class="empty-title">Nenhuma despesa variável</div>
            <div class="empty-desc">Não há despesas variáveis ativas para este mês.</div>
          </div>`;
      }
    } else {
      variable.forEach(v => {
        const origVar = state.variable.find(x => x.id === v.id) || v;
        const activeMonths = getVariableActiveMonths(origVar, y);
        varListEl.appendChild(buildEntryRow({
          id: v.id, type: 'variable', title: v.name,
          tags: [
            v.group || 'Gerais',
            v.installmentTotal > 1 ? `parcela ${v.installmentIndex}/${v.installmentTotal}` : null
          ].filter(Boolean),
          amount: v.amount, status: v.status, paidAmount: v.paidAmount, remainingAmount: v.remainingAmount,
          dueDay: v.dueDay, destination: v.destination,
          payee: v.payee || origVar.payee,
          paymentMethod: v.payment?.method || origVar.payment?.method,
          account: v.payment?.account || origVar.payment?.account,
          showNatureBadge: false,
          onClickToggleStatus: () => toggleExpenseStatus('variable', v.id, v.status),
          onClickEdit: () => openEntryDialog({ mode: 'edit', type: 'variable', id: v.id }),
          onClickTimeline: () => openExpenseTimeline({ type: 'variable', id: v.id }),
          onMouseEnter: () => highlightRibbonMonths(activeMonths),
          onMouseLeave: clearRibbonHighlight
        }));
      });
    }
  }

  const sumVarEl = $('#sumVariable');
  if (sumVarEl) {
    const varTotal = variable.reduce((s, i) => s + Number(i.amount || 0), 0);
    sumVarEl.textContent = isFiltered ? `${variable.length} · ${currency(varTotal)}` : currency(varTotal);
  }

  updateMarkAllButtonState('#markAllFixedPaidBtn', rawFixed);
  updateMarkAllButtonState('#markAllVarPaidBtn', rawVariable);
}

function renderExpensesLists() {
  currentExpensesViewMode = readExpensesViewMode();
  updateExpensesViewModeUI();
  if (currentExpensesViewMode === 'all') {
    renderSimplifiedExpenses();
  } else {
    renderByTypeExpenses();
  }
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
    const name = String(nameInput?.value ?? '').trim();
    if (!name) {
      setEntryFieldError(nameInput, 'Informe a descrição do lançamento.');
      return false;
    }

    const groupInput = $('#entryGroup');
    const group = String(groupInput?.value ?? '').trim();
    if (!group) {
      setEntryFieldError(groupInput, 'Selecione a categoria do lançamento.');
      return false;
    }

    const amountInput = $('#entryAmount');
    const amountVal = String(amountInput?.value ?? '').trim();
    const amount = Number(amountVal);
    if (!amountVal || isNaN(amount) || amount <= 0) {
      setEntryFieldError(amountInput, 'Informe um valor maior que zero.');
      return false;
    }

    const destInput = $('#entryDestination');
    const dest = String(destInput?.value ?? '').trim();
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
    const state = getState();
    const dest = (state.destinations || []).find(d => d.name === destName);
    const isPixOrCash = dest && (dest.name.toLowerCase() === 'pix' || dest.name.toLowerCase() === 'dinheiro');
    const isRecurring = (entryDlgState.recurrence === 'recurring' || entryDlgState.type === 'fixed');
    const simplifiedFlow = isPixOrCash && !isRecurring;

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
      if (simplifiedFlow) {
      if ($('#amountLabel')) $('#amountLabel').textContent = 'Valor (R$) *';
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

  function updateRecDurationView() {
    const endType = $('input[name="entryRecEndType"]:checked')?.value || 'never';
    const countWrap = $('#recCountWrap');
    const dateWrap = $('#recDateWrap');
    const badge = $('#recDurationBadge');

    if (countWrap) countWrap.style.display = (endType === 'count' ? 'block' : 'none');
    if (dateWrap) dateWrap.style.display = (endType === 'date' ? 'block' : 'none');

    if (!badge) return;

    const sm = Number($('#fixedEffMonth')?.value) || (getState().month || 1);
    const sy = Number($('#fixedEffYear')?.value) || (getState().year || 2026);

    if (endType === 'never') {
      badge.textContent = 'Recorrência mensal contínua (sem data de término)';
    } else if (endType === 'count') {
      const count = Math.max(1, parseInt($('#recCountInput')?.value, 10) || 1);
      const endIdx = (sm - 1) + (count - 1);
      const ey = sy + Math.floor(endIdx / 12);
      const em = (endIdx % 12) + 1;
      badge.textContent = `Recorrência mensal: ${count} ocorrência(s) (de ${MONTH_ABBR[sm - 1]}/${sy} até ${MONTH_ABBR[em - 1]}/${ey})`;
    } else if (endType === 'date') {
      const em = Number($('#recEndMonth')?.value) || sm;
      const ey = Number($('#recEndYear')?.value) || sy;
      const count = Math.max(1, (ey * 12 + em) - (sy * 12 + sm) + 1);
      badge.textContent = `Recorrência mensal até ${MONTH_ABBR[em - 1]}/${ey} (${count} ocorrência(s))`;
    }
  }

  function updatePaymentMethodSelect() {
    const sel = $('#entryPaymentMethod');
    if (!sel) return;
    const methods = window.PAYMENT_METHODS || [
      { id: 'pix', name: 'PIX' },
      { id: 'dinheiro', name: 'Dinheiro' },
      { id: 'cartao_credito', name: 'Cartão de Crédito' },
      { id: 'cartao_debito', name: 'Cartão de Débito' },
      { id: 'boleto', name: 'Boleto' },
      { id: 'transferencia', name: 'Transferência' },
      { id: 'debito_automatico', name: 'Débito Automático' },
      { id: 'outros', name: 'Outro' }
    ];
    const curVal = sel.value;
    sel.innerHTML = methods.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    if (curVal && methods.some(m => m.id === curVal)) {
      sel.value = curVal;
    } else {
      sel.value = 'pix';
    }
  }

  function updateAccountSelect() {
    const state = getState();
    const sel = $('#entryAccount');
    if (!sel) return;
    const sortedDests = (typeof getSortedDestinations === 'function') ? getSortedDestinations(state.destinations) : (state.destinations || []);
    const accounts = sortedDests.filter(d => {
      const n = (d.name || '').toLowerCase().trim();
      return n !== 'pix' && n !== 'dinheiro' && n !== 'em dinheiro';
    });
    const curVal = sel.value;
    let opts = `<option value="">Nenhuma / Não informada</option>`;
    opts += accounts.map(a => `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`).join('');
    sel.innerHTML = opts;
    if (curVal && accounts.some(a => a.name === curVal)) {
      sel.value = curVal;
    } else {
      sel.value = '';
    }
  }

  function updatePayeeSuggestions() {
    const state = getState();
    const datalist = $('#payeeSuggestions');
    if (!datalist) return;
    const payees = new Set();
    (state.fixed || []).forEach(f => {
      const p = (typeof resolveExpensePayee === 'function') ? resolveExpensePayee(f) : f.payee;
      if (p) payees.add(p);
    });
    (state.variable || []).forEach(v => {
      const p = (typeof resolveExpensePayee === 'function') ? resolveExpensePayee(v) : v.payee;
      if (p) payees.add(p);
    });
    datalist.innerHTML = Array.from(payees).sort().map(p => `<option value="${escapeHtml(p)}"></option>`).join('');
  }

  function setEntryRecurrence(rec) {
    const isRec = (rec === 'recurring');
    const isInst = (rec === 'installment');
    const isSingle = (!isRec && !isInst);

    entryDlgState.recurrence = isRec ? 'recurring' : (isInst ? 'installment' : 'single');
    if ($('#entryRecurrence')) $('#entryRecurrence').value = entryDlgState.recurrence;

    const singleBtn = $('#entryRecSingleBtn');
    const instBtn = $('#entryRecInstallmentBtn');
    const recBtn = $('#entryRecRecurringBtn');

    if (singleBtn) {
      singleBtn.classList.toggle('active', isSingle);
      singleBtn.setAttribute('aria-pressed', String(isSingle));
    }
    if (instBtn) {
      instBtn.classList.toggle('active', isInst);
      instBtn.setAttribute('aria-pressed', String(isInst));
    }
    if (recBtn) {
      recBtn.classList.toggle('active', isRec);
      recBtn.setAttribute('aria-pressed', String(isRec));
    }

    if (isRec) {
      setEntryExpenseType('fixed');
    } else if (isInst) {
      setEntryExpenseType('installment');
    } else {
      setEntryExpenseType('cash');
    }

    syncDestinationRules();
  }

  function setEntryExpenseType(expType) {
    entryDlgState.type = expType;
    if ($('#entryType')) $('#entryType').value = expType;
    if ($('#entryPaymentType')) $('#entryPaymentType').value = expType;

    const isRec = (expType === 'fixed');
    const isInst = (expType === 'installment');
    const isSingle = (!isRec && !isInst);

    entryDlgState.recurrence = isRec ? 'recurring' : (isInst ? 'installment' : 'single');
    if ($('#entryRecurrence')) $('#entryRecurrence').value = entryDlgState.recurrence;

    const singleBtn = $('#entryRecSingleBtn');
    const instBtn = $('#entryRecInstallmentBtn');
    const recBtn = $('#entryRecRecurringBtn');
    if (singleBtn) {
      singleBtn.classList.toggle('active', isSingle);
      singleBtn.setAttribute('aria-pressed', String(isSingle));
    }
    if (instBtn) {
      instBtn.classList.toggle('active', isInst);
      instBtn.setAttribute('aria-pressed', String(isInst));
    }
    if (recBtn) {
      recBtn.classList.toggle('active', isRec);
      recBtn.setAttribute('aria-pressed', String(isRec));
    }

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
    if (expType === 'fixed') {
      updateRecDurationView();
    }
  }

  let entryDlgSynced = { method: '', account: '', dest: '' };

  function syncDestinationRules() {
    const state = getState();

    // 1. Resolução do método de pagamento e conta: V2 é autoritativo, mas mudanças diretas em destination são detectadas e propagadas
    const paymentMethodInput = $('#entryPaymentMethod');
    const destInput = $('#entryDestination');
    const accountInput = $('#entryAccount');

    const curMethod = paymentMethodInput?.value || '';
    const curAccount = accountInput?.value || '';
    const curDest = destInput?.value || '';

    let paymentMethod = curMethod || 'pix';
    let account = curAccount || null;

    // Se o destino legado foi alterado diretamente (ex: testes legados ou input em entryDestination)
    if (destInput && curDest && curDest !== entryDlgSynced.dest && (curMethod === entryDlgSynced.method && curAccount === entryDlgSynced.account)) {
      paymentMethod = (typeof resolveExpensePaymentMethod === 'function')
        ? resolveExpensePaymentMethod({ destination: curDest })
        : (curDest.toLowerCase() === 'dinheiro' ? 'dinheiro' : (curDest.toLowerCase() === 'pix' ? 'pix' : 'cartao_credito'));
      account = (typeof resolveExpenseAccount === 'function')
        ? resolveExpenseAccount({ destination: curDest })
        : (paymentMethod !== 'pix' && paymentMethod !== 'dinheiro' ? curDest : null);

      if (paymentMethodInput) paymentMethodInput.value = paymentMethod;
      if (accountInput) accountInput.value = account || '';
    } else {
      // V2 tem precedência: sincroniza a bridge legada destination
      paymentMethod = curMethod || 'pix';
      account = curAccount || null;

      if (destInput) {
        const legacyDest = (typeof buildLegacyDestinationBridge === 'function')
          ? buildLegacyDestinationBridge(paymentMethod, account)
          : (account || (paymentMethod === 'pix' ? 'Pix' : (paymentMethod === 'dinheiro' ? 'Dinheiro' : 'Nubank')));
        destInput.value = legacyDest;
      }
    }

    entryDlgSynced = {
      method: paymentMethodInput?.value || '',
      account: accountInput?.value || '',
      dest: destInput?.value || ''
    };

    const isPixOrCash = (paymentMethod === 'pix' || paymentMethod === 'dinheiro');
    const isRecurring = (entryDlgState.recurrence === 'recurring' || entryDlgState.type === 'fixed');
    const isInstallment = (entryDlgState.recurrence === 'installment' || entryDlgState.type === 'installment');
    const simplifiedFlow = isPixOrCash && !isRecurring && !isInstallment;

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
    const typeSelectorWrap = $('#typeSelectorWrap');
    const accountWrap = $('#entryAccountWrap');
    const accountLabel = $('#entryAccountLabel');
    const txDateWrap = $('#transactionDateWrap');

    if (txDateWrap) {
      txDateWrap.style.display = isRecurring ? 'none' : '';
    }

    // Visibilidade contextual do seletor de Conta / Cartão
    if (accountWrap) {
      if (paymentMethod === 'dinheiro') {
        accountWrap.style.display = 'none';
        if (accountInput) accountInput.value = '';
      } else {
        accountWrap.style.display = 'grid';
        if (accountLabel) {
          if (paymentMethod === 'pix') {
            accountLabel.innerHTML = 'Conta de Origem <small style="font-weight:600; color:var(--muted);">(Opcional)</small>';
          } else if (paymentMethod === 'cartao_credito') {
            accountLabel.innerHTML = 'Cartão Utilizado <small style="font-weight:600; color:var(--muted);">(Opcional)</small>';
          } else if (paymentMethod === 'cartao_debito') {
            accountLabel.innerHTML = 'Conta / Cartão <small style="font-weight:600; color:var(--muted);">(Opcional)</small>';
          } else if (paymentMethod === 'boleto' || paymentMethod === 'transferencia' || paymentMethod === 'debito_automatico') {
            accountLabel.innerHTML = 'Conta de Débito <small style="font-weight:600; color:var(--muted);">(Opcional)</small>';
          } else {
            accountLabel.innerHTML = 'Conta / Instrumento <small style="font-weight:600; color:var(--muted);">(Opcional)</small>';
          }
        }
      }
    }

    // Herança de vencimento da conta/cartão selecionada
    const targetAccountName = accountInput?.value || (destInput?.value && destInput.value !== 'Pix' && destInput.value !== 'Dinheiro' ? destInput.value : null);
    const destMeta = targetAccountName ? (state.destinations || []).find(d => d.name === targetAccountName) : null;

    if (destMeta && destMeta.dueDay) {
      if (destHint) destHint.textContent = `📅 Vencimento padrão: dia ${destMeta.dueDay}`;
      if ($('#entryDueDay') && ($('#entryDueDay').value === '' || entryDlgState.mode === 'new')) {
        $('#entryDueDay').value = destMeta.dueDay;
      }
      if (inheritedHint) {
        inheritedHint.textContent = `✓ Vencimento: dia ${destMeta.dueDay} (herdado de ${destMeta.name})`;
        inheritedHint.style.display = 'block';
      }
    } else {
      if (destHint) destHint.textContent = '';
      if (inheritedHint) inheritedHint.style.display = 'none';
    }

    // Manter observações sincronizadas
    setEntryNote(getEntryNote());

    if (simplifiedFlow) {
      if (destHint) destHint.textContent = '⚡ Pagamento à vista. Este lançamento será quitado automaticamente.';
      if (dueWrap) dueWrap.style.display = 'none';
      if ($('#entryDueDay')) $('#entryDueDay').value = '';
      if (inheritedHint) inheritedHint.style.display = 'none';
      setEntryExpenseType('cash');

      if (noteStep1Wrap) noteStep1Wrap.style.display = 'grid';

      if (stepInd1) {
        const span = stepInd1.querySelector('span:not(.wizard-dot)');
        if (span) span.textContent = 'Identificação & Finalização';
      }
      if (stepInd2) stepInd2.style.display = 'none';
      if (stepInd3) stepInd3.style.display = 'none';
      stepLines.forEach(l => l.style.display = 'none');

      if (entryDlgState.step === 1) {
        if (btnNext1) btnNext1.style.display = 'none';
        if (submitBtn) {
          submitBtn.style.display = 'inline-flex';
          submitBtn.textContent = '✓ Salvar Lançamento';
        }
      }
    } else if (isRecurring) {
      if ($('#amountLabel')) $('#amountLabel').textContent = 'Valor por mês / ocorrência (R$) *';
      if (destHint) {
        if (isPixOrCash) {
          destHint.textContent = '⚡ O lançamento atual será quitado automaticamente. Os próximos lançamentos da recorrência permanecerão pendentes até o pagamento.';
        } else {
          destHint.textContent = '';
        }
      }
      if (noteStep1Wrap) noteStep1Wrap.style.display = 'none';
      if (dueWrap) dueWrap.style.display = 'grid';
      if (typeSelectorWrap) typeSelectorWrap.style.display = 'none';

      setEntryExpenseType('fixed');

      if (stepInd1) {
        const span = stepInd1.querySelector('span:not(.wizard-dot)');
        if (span) span.textContent = 'Identificação';
      }
      if (stepInd2) {
        stepInd2.style.display = 'flex';
        const span2 = stepInd2.querySelector('span:not(.wizard-dot)');
        if (span2) span2.textContent = 'Recorrência';
      }
      if (stepInd3) stepInd3.style.display = 'flex';
      stepLines.forEach(l => l.style.display = 'block');

      if (entryDlgState.step === 1) {
        if (btnNext1) btnNext1.style.display = 'inline-flex';
        if (submitBtn) submitBtn.style.display = 'none';
      }
      updateRecDurationView();
    } else if (isInstallment) {
      const mode = getEntryAmountInputMode();
      if ($('#amountLabel')) {
        $('#amountLabel').textContent = (mode === 'installment')
          ? 'Valor da parcela (R$) *'
          : 'Valor total da compra (R$) *';
      }
      if (noteStep1Wrap) noteStep1Wrap.style.display = 'none';
      if (dueWrap) dueWrap.style.display = 'grid';
      if (typeSelectorWrap) typeSelectorWrap.style.display = 'none';

      setEntryExpenseType('installment');

      if (stepInd1) {
        const span = stepInd1.querySelector('span:not(.wizard-dot)');
        if (span) span.textContent = 'Identificação';
      }
      if (stepInd2) {
        stepInd2.style.display = 'flex';
        const span2 = stepInd2.querySelector('span:not(.wizard-dot)');
        if (span2) span2.textContent = 'Parcelamento';
      }
      if (stepInd3) stepInd3.style.display = 'flex';
      stepLines.forEach(l => l.style.display = 'block');

      if (entryDlgState.step === 1) {
        if (btnNext1) btnNext1.style.display = 'inline-flex';
        if (submitBtn) submitBtn.style.display = 'none';
      }
      updateVarInstallments();
    } else {
      if ($('#amountLabel')) $('#amountLabel').textContent = 'Valor (R$) *';
      if (noteStep1Wrap) noteStep1Wrap.style.display = 'none';
      if (dueWrap) dueWrap.style.display = 'grid';
      if (typeSelectorWrap) typeSelectorWrap.style.display = 'none';

      setEntryExpenseType('cash');

      if (stepInd1) {
        const span = stepInd1.querySelector('span:not(.wizard-dot)');
        if (span) span.textContent = 'Identificação';
      }
      if (stepInd2) {
        stepInd2.style.display = 'flex';
        const span2 = stepInd2.querySelector('span:not(.wizard-dot)');
        if (span2) span2.textContent = 'Pagamento';
      }
      if (stepInd3) stepInd3.style.display = 'flex';
      stepLines.forEach(l => l.style.display = 'block');

      if (entryDlgState.step === 1) {
        if (btnNext1) btnNext1.style.display = 'inline-flex';
        if (submitBtn) submitBtn.style.display = 'none';
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
    const paymentMethod = $('#entryPaymentMethod')?.value || (destName.toLowerCase() === 'pix' ? 'pix' : (destName.toLowerCase() === 'dinheiro' ? 'dinheiro' : 'cartao_credito'));
    const isPixOrCash = (paymentMethod === 'pix' || paymentMethod === 'dinheiro');
    const isRecurring = (entryDlgState.recurrence === 'recurring' || expType === 'fixed');

    if ($('#summaryName')) $('#summaryName').textContent = name;
    if ($('#summaryAmount')) $('#summaryAmount').textContent = currency(amount);
    if ($('#summaryCategory')) $('#summaryCategory').textContent = cat;

    const methodName = (window.PAYMENT_METHOD_NAMES_MAP && window.PAYMENT_METHOD_NAMES_MAP[paymentMethod]) || (paymentMethod ? paymentMethod.toUpperCase() : 'PIX');
    if ($('#summaryMethod')) $('#summaryMethod').textContent = methodName;

    const payee = ($('#entryPayee')?.value || '').trim();
    if ($('#summaryPayee')) {
      if (payee) {
        $('#summaryPayee').textContent = payee;
        $('#summaryPayee').style.display = 'inline-block';
      } else {
        $('#summaryPayee').style.display = 'none';
      }
    }

    const account = $('#entryAccount')?.value;
    if ($('#summaryAccount')) {
      if (account) {
        $('#summaryAccount').textContent = account;
        $('#summaryAccount').style.display = 'inline-block';
      } else {
        $('#summaryAccount').style.display = 'none';
      }
    }

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
        const mode = getEntryAmountInputMode();
        const total = (mode === 'installment') ? Math.round(amount * count * 100) / 100 : amount;
        const parcel = (mode === 'installment') ? amount : (count > 0 ? Math.round((total / count) * 100) / 100 : 0);

        if ($('#summaryAmount')) {
          $('#summaryAmount').textContent = (mode === 'installment')
            ? `${currency(parcel)} / parcela (${currency(total)} total)`
            : `${currency(total)} total (${count}x de aprox. ${currency(parcel)})`;
        }
        $('#summaryType').textContent = `Parcelado (${count}x)`;
        $('#summaryPeriod').textContent = `${MONTH_ABBR[sm - 1]}/${sy} a ${MONTH_ABBR[em - 1]}/${ey}`;
      } else {
        const fm = Number($('#fixedEffMonth')?.value) || state.month;
        const fy = Number($('#fixedEffYear')?.value) || state.year;
        const recEndType = $('input[name="entryRecEndType"]:checked')?.value || 'never';
        if (recEndType === 'count') {
          const count = Math.max(1, parseInt($('#recCountInput')?.value, 10) || 1);
          const endIdx = (fm - 1) + (count - 1);
          const ey = fy + Math.floor(endIdx / 12);
          const em = (endIdx % 12) + 1;
          $('#summaryType').textContent = `Recorrente (${count}x)`;
          $('#summaryPeriod').textContent = `${MONTH_ABBR[fm - 1]}/${fy} a ${MONTH_ABBR[em - 1]}/${ey}`;
        } else if (recEndType === 'date') {
          const em = Number($('#recEndMonth')?.value) || fm;
          const ey = Number($('#recEndYear')?.value) || fy;
          $('#summaryType').textContent = 'Recorrente';
          $('#summaryPeriod').textContent = `${MONTH_ABBR[fm - 1]}/${fy} a ${MONTH_ABBR[em - 1]}/${ey}`;
        } else {
          $('#summaryType').textContent = 'Fixa (Mensal)';
          $('#summaryPeriod').textContent = `Desde ${MONTH_ABBR[fm - 1]}/${fy}`;
        }
      }
    }

    const pixCashHint = $('#pixCashStatusHint');
    if (isPixOrCash) {
      if ($('#entryStatus') && entryDlgState.mode === 'new') {
        $('#entryStatus').value = 'pago';
      }
      if (pixCashHint) {
        if (isRecurring) {
          pixCashHint.textContent = '✓ O lançamento atual será quitado automaticamente. Os próximos lançamentos da recorrência permanecerão pendentes até o pagamento.';
        } else {
          pixCashHint.textContent = '✓ Pagamento à vista. Este lançamento será quitado automaticamente.';
        }
        pixCashHint.style.display = 'block';
      }
    } else {
      if (pixCashHint) pixCashHint.style.display = 'none';
    }
  }

  function getEntryAmountInputMode() {
    return ($('#entryAmountInputMode')?.value === 'installment') ? 'installment' : 'total';
  }

  function setEntryAmountInputMode(mode) {
    const m = (mode === 'installment') ? 'installment' : 'total';
    if ($('#entryAmountInputMode')) $('#entryAmountInputMode').value = m;

    const totalBtn = $('#entryAmountModeTotalBtn');
    const instBtn = $('#entryAmountModeInstallmentBtn');
    if (totalBtn) {
      totalBtn.classList.toggle('active', m === 'total');
      totalBtn.setAttribute('aria-pressed', m === 'total' ? 'true' : 'false');
    }
    if (instBtn) {
      instBtn.classList.toggle('active', m === 'installment');
      instBtn.setAttribute('aria-pressed', m === 'installment' ? 'true' : 'false');
    }

    const isInstallmentNature = (entryDlgState.recurrence === 'installment' || entryDlgState.type === 'installment');
    if (isInstallmentNature && $('#amountLabel')) {
      $('#amountLabel').textContent = (m === 'installment')
        ? 'Valor da parcela (R$) *'
        : 'Valor total da compra (R$) *';
    }

    updateVarInstallments();
  }

  function updateVarInstallments() {
    const state = getState();
    const sm = Number($('#varStartMonth')?.value) || state.month || 1;
    const sy = Number($('#varStartYear')?.value) || state.year || 2026;
    const count = Math.max(1, parseInt($('#varInstallmentsCount')?.value, 10) || 1);
    const inputValue = Number($('#entryAmount')?.value) || 0;
    const mode = getEntryAmountInputMode();

    let totalAmount = 0;
    let installmentAmount = 0;

    if (mode === 'installment') {
      installmentAmount = inputValue;
      totalAmount = Math.round(installmentAmount * count * 100) / 100;
    } else {
      totalAmount = inputValue;
      installmentAmount = count > 0 ? (Math.round((totalAmount / count) * 100) / 100) : 0;
    }

    const endMonthIdx = (sm - 1) + (count - 1);
    const ey = sy + Math.floor(endMonthIdx / 12);
    const em = (endMonthIdx % 12) + 1;

    if ($('#varEndMonth')) $('#varEndMonth').value = em;
    if ($('#varEndYear')) $('#varEndYear').value = ey;

    const badge = $('#varInstallmentsBadge');
    if (!badge) return;

    if (count === 1) {
      badge.classList.remove('invalid', 'error');
      badge.innerHTML = `<span>Parcela única em ${MONTH_ABBR[sm - 1]}/${sy} • Total: ${currency(totalAmount)}</span>`;
    } else if (mode === 'installment') {
      badge.classList.remove('invalid', 'error');
      badge.innerHTML = `<span>Vigência calculada: <strong>${MONTH_ABBR[sm - 1]}/${sy} a ${MONTH_ABBR[em - 1]}/${ey}</strong> (${count}x de ${currency(installmentAmount)} • Total da compra: ${currency(totalAmount)})</span>`;
    } else {
      const totalCents = Math.round(totalAmount * 100);
      const baseCents = Math.floor(totalCents / count);
      const remCents = totalCents - (baseCents * count);
      const firstInst = (baseCents + remCents) / 100;
      const otherInst = baseCents / 100;

      let detailText = '';
      if (remCents !== 0) {
        detailText = `Total: ${currency(totalAmount)} (${count} parcelas: 1ª ${currency(firstInst)}, demais ${currency(otherInst)})`;
      } else {
        detailText = `Total: ${currency(totalAmount)} (${count}x de ${currency(otherInst)})`;
      }

      badge.classList.remove('invalid', 'error');
      badge.innerHTML = `<span>Vigência calculada: <strong>${MONTH_ABBR[sm - 1]}/${sy} a ${MONTH_ABBR[em - 1]}/${ey}</strong> • ${detailText}</span>`;
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
    updatePaymentMethodSelect();
    updateAccountSelect();
    updatePayeeSuggestions();

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
      const isFixedInit = (type === 'fixed');
      entryDlgState = {
        mode: 'new',
        step: 1,
        type: isFixedInit ? 'fixed' : (type === 'installment' ? 'installment' : 'cash'),
        recurrence: isFixedInit ? 'recurring' : (type === 'installment' ? 'installment' : 'single'),
        id: null,
        fixedId: null
      };
      $('#entryDialogTitle').textContent = isFixedInit ? 'Nova Despesa Fixa' : (type === 'installment' ? 'Nova Despesa Parcelada' : 'Nova Despesa');

      if ($('#entryPayee')) $('#entryPayee').value = '';
      if ($('#entryPaymentMethod')) $('#entryPaymentMethod').value = 'pix';
      if ($('#entryAccount')) $('#entryAccount').value = '';

      const radioNever = $('input[name="entryRecEndType"][value="never"]');
      if (radioNever) radioNever.checked = true;
      if ($('#recCountInput')) $('#recCountInput').value = 12;
      if ($('#recEndMonth')) $('#recEndMonth').value = curMonth;
      if ($('#recEndYear')) $('#recEndYear').value = curYear + 1;
      updateRecDurationView();

      const defaultDest = sortedDests[0]?.name || 'Pix';
      $('#entryDestination').value = defaultDest;
      if ($('#entryTransactionDate')) {
        if (!isFixedInit && (type === 'cash' || type === 'pix' || defaultDest.toLowerCase() === 'pix' || defaultDest.toLowerCase() === 'dinheiro')) {
          $('#entryTransactionDate').value = (typeof getTodayCivilDate === 'function') ? getTodayCivilDate() : '';
        } else {
          $('#entryTransactionDate').value = '';
        }
      }
      setEntryAmountInputMode('total');
      setEntryRecurrence(entryDlgState.recurrence);
      setEntryExpenseType(entryDlgState.type);
      syncDestinationRules();
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
        recurrence: 'recurring',
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
      if ($('#entryTransactionDate')) $('#entryTransactionDate').value = '';

      const payeeVal = (typeof resolveExpensePayee === 'function') ? resolveExpensePayee(fixed) : (fixed.payee || '');
      if ($('#entryPayee')) $('#entryPayee').value = payeeVal || '';

      const pmVal = (typeof resolveExpensePaymentMethod === 'function') ? resolveExpensePaymentMethod(fixed) : (fixed.payment?.method || 'pix');
      const accVal = (typeof resolveExpenseAccount === 'function') ? resolveExpenseAccount(fixed) : (fixed.payment?.account || '');
      if ($('#entryPaymentMethod')) $('#entryPaymentMethod').value = pmVal;
      if ($('#entryAccount')) $('#entryAccount').value = accVal || '';

      if (fixed.endedFrom) {
        if (fixed.temporal?.recurrence?.type === 'count') {
          const radioCount = $('input[name="entryRecEndType"][value="count"]');
          if (radioCount) radioCount.checked = true;
          if ($('#recCountInput')) $('#recCountInput').value = fixed.temporal.recurrence.count || 12;
        } else {
          const radioDate = $('input[name="entryRecEndType"][value="date"]');
          if (radioDate) radioDate.checked = true;
          let lastActiveY = fixed.endedFrom.year;
          let lastActiveM = fixed.endedFrom.month - 1;
          if (lastActiveM < 1) { lastActiveM = 12; lastActiveY--; }
          if ($('#recEndMonth')) $('#recEndMonth').value = fixed.temporal?.recurrence?.endMonth || lastActiveM;
          if ($('#recEndYear')) $('#recEndYear').value = fixed.temporal?.recurrence?.endYear || lastActiveY;
        }
      } else {
        const radioNever = $('input[name="entryRecEndType"][value="never"]');
        if (radioNever) radioNever.checked = true;
      }
      updateRecDurationView();

      const key = ymKey(state.year, state.month);
      const isPaid = fixed.paidHistory ? fixed.paidHistory[key] === true : (active.status === 'pago');
      $('#entryStatus').value = isPaid ? 'pago' : 'pendente';
      $('#fixedEffMonth').value = active.effMonth || active.month || state.month;
      $('#fixedEffYear').value = active.effYear || active.year || state.year;
      if (fixActions) fixActions.hidden = false;

      setEntryRecurrence('recurring');
      setEntryExpenseType('fixed');
      syncDestinationRules();
      setWizardStep(1);
    } else {
      const v = state.variable.find(x => x.id === id || x.id === fixedId);
      if (!v) return;

      const isInstallment = (v.installments > 1 || (mk(v.endYear, v.endMonth) > mk(v.startYear, v.startMonth)));
      const resolvedMethod = (typeof resolveExpensePaymentMethod === 'function') ? resolveExpensePaymentMethod(v) : (v.payment?.method || (v.destination?.toLowerCase() === 'pix' ? 'pix' : 'cartao_credito'));
      const isPixOrCash = (resolvedMethod === 'pix' || resolvedMethod === 'dinheiro');
      const expType = isPixOrCash ? 'cash' : (isInstallment ? 'installment' : 'cash');

      entryDlgState = { mode: 'edit', step: 1, type: expType, recurrence: isInstallment ? 'installment' : 'single', id: v.id, fixedId: null };
      $('#entryDialogTitle').textContent = isPixOrCash ? 'Editar Despesa (À Vista)' : (isInstallment ? 'Editar Despesa Parcelada' : 'Editar Despesa À Vista');

      $('#entryName').value = v.name;
      $('#entryGroup').value = v.group || firstCatName;
      setEntryNote(v.note || '');
      const resolvedInst = (isInstallment && typeof resolveInstallmentAmounts === 'function')
        ? resolveInstallmentAmounts(v)
        : null;
      const recordMode = v.amountInputMode || (v.totalAmount !== undefined ? 'total' : 'installment');
      setEntryAmountInputMode(recordMode);
      if (recordMode === 'installment') {
        $('#entryAmount').value = resolvedInst ? resolvedInst.installmentAmount : v.amount;
      } else {
        $('#entryAmount').value = resolvedInst ? resolvedInst.totalAmount : (v.totalAmount !== undefined ? v.totalAmount : v.amount);
      }
      $('#entryDestination').value = v.destination || 'Nubank';
      $('#entryDueDay').value = v.dueDay || '';
      if ($('#entryTransactionDate')) $('#entryTransactionDate').value = v.transactionDate || '';

      const payeeVal = (typeof resolveExpensePayee === 'function') ? resolveExpensePayee(v) : (v.payee || '');
      if ($('#entryPayee')) $('#entryPayee').value = payeeVal || '';

      const pmVal = (typeof resolveExpensePaymentMethod === 'function') ? resolveExpensePaymentMethod(v) : (v.payment?.method || 'cartao_credito');
      const accVal = (typeof resolveExpenseAccount === 'function') ? resolveExpenseAccount(v) : (v.payment?.account || '');
      if ($('#entryPaymentMethod')) $('#entryPaymentMethod').value = pmVal;
      if ($('#entryAccount')) $('#entryAccount').value = accVal || '';

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

      setEntryRecurrence(isInstallment ? 'installment' : 'single');
      setEntryExpenseType(expType);
      syncDestinationRules();
      setWizardStep(1);
    }

    entryDlgSynced = {
      method: $('#entryPaymentMethod')?.value || '',
      account: $('#entryAccount')?.value || '',
      dest: $('#entryDestination')?.value || ''
    };
    clearEntryValidation();
    if (entryDlg) entryDlg.showModal();
  }

  function initExpensesListeners() {
    $('#openFixedFsBtn')?.addEventListener('click', () => openFullscreenTable('fixed'));
    $('#openVarFsBtn')?.addEventListener('click', () => openFullscreenTable('variable'));

    ['#fsSearchInput', '#fsTypeFilter', '#fsGroupFilter', '#fsCategoryFilter', '#fsStatusFilter', '#fsDestFilter'].forEach(id => {
      const el = $(id);
      if (el) {
        el.addEventListener('input', renderFullscreenTable);
        el.addEventListener('change', renderFullscreenTable);
      }
    });

    bindFullscreenTableSortListeners();

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
    $('#entryDestination')?.addEventListener('change', () => {
      const dVal = $('#entryDestination')?.value;
      if (dVal) {
        const resolvedMethod = (typeof resolveExpensePaymentMethod === 'function')
          ? resolveExpensePaymentMethod({ destination: dVal })
          : (dVal.toLowerCase() === 'dinheiro' ? 'dinheiro' : (dVal.toLowerCase() === 'pix' ? 'pix' : 'cartao_credito'));
        const resolvedAcc = (typeof resolveExpenseAccount === 'function')
          ? resolveExpenseAccount({ destination: dVal })
          : (resolvedMethod !== 'pix' && resolvedMethod !== 'dinheiro' ? dVal : null);
        if ($('#entryPaymentMethod')) $('#entryPaymentMethod').value = resolvedMethod;
        if ($('#entryAccount')) $('#entryAccount').value = resolvedAcc || '';
      }
      syncDestinationRules();
    });
    $('#entryPaymentMethod')?.addEventListener('change', syncDestinationRules);
    $('#entryAccount')?.addEventListener('change', syncDestinationRules);
    $$('input[name="entryRecEndType"]').forEach(r => r.addEventListener('change', updateRecDurationView));
    ['#recCountInput', '#recEndMonth', '#recEndYear'].forEach(id => {
      const el = $(id);
      if (el) {
        el.addEventListener('input', updateRecDurationView);
        el.addEventListener('change', updateRecDurationView);
      }
    });

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

    $$('.entry-rec-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rec = btn.dataset.rec;
        if (rec) setEntryRecurrence(rec);
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

    $('#entryAmountModeTotalBtn')?.addEventListener('click', () => setEntryAmountInputMode('total'));
    $('#entryAmountModeInstallmentBtn')?.addEventListener('click', () => setEntryAmountInputMode('installment'));

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

      const payee = ($('#entryPayee')?.value || '').trim() || null;
      let paymentMethod = $('#entryPaymentMethod')?.value;
      let account = ($('#entryAccount')?.value || '').trim() || null;
      let destination = $('#entryDestination')?.value;

      if (!paymentMethod && destination) {
        paymentMethod = (typeof resolveExpensePaymentMethod === 'function')
          ? resolveExpensePaymentMethod({ destination })
          : (destination.toLowerCase() === 'dinheiro' ? 'dinheiro' : (destination.toLowerCase() === 'pix' ? 'pix' : 'cartao_credito'));
      }
      if (!account && destination && paymentMethod !== 'pix' && paymentMethod !== 'dinheiro') {
        account = destination;
      }
      paymentMethod = paymentMethod || 'pix';

      destination = (typeof buildLegacyDestinationBridge === 'function')
        ? buildLegacyDestinationBridge(paymentMethod, account)
        : (account || (paymentMethod === 'pix' ? 'Pix' : (paymentMethod === 'dinheiro' ? 'Dinheiro' : 'Nubank')));

      const isPixOrCash = (paymentMethod === 'pix' || paymentMethod === 'dinheiro');
      const isRecurring = (entryDlgState.recurrence === 'recurring' || entryDlgState.type === 'fixed');
      const isInstallment = (entryDlgState.recurrence === 'installment' || entryDlgState.type === 'installment');
      const simplifiedFlow = isPixOrCash && !isRecurring && !isInstallment;
      const type = isRecurring ? 'fixed' : (isInstallment ? 'installment' : 'cash');
      const dueDay = simplifiedFlow ? null : (Number($('#entryDueDay').value) || null);
      const rawTxDate = $('#entryTransactionDate')?.value;
      const transactionDate = (rawTxDate && typeof rawTxDate === 'string' && rawTxDate.trim() !== '') ? rawTxDate.trim() : null;

      // Ajuste 3: Metodo != Status. No fluxo rapido de criacao, status default para pix/dinheiro é pago se nao fornecido, respeitando selecao explicita.
      let status = $('#entryStatus')?.value;
      if (!status) {
        status = (isPixOrCash && entryDlgState.mode === 'new') ? 'pago' : 'pendente';
      }
      const key = ymKey(state.year, state.month);

      if (!validateEntryStep1()) {
        setWizardStep(1);
        return;
      }

      if (!simplifiedFlow && !validateEntryStep2()) {
        setWizardStep(2);
        return;
      }

      if (type === 'fixed') {
        state.fixed = state.fixed || [];
        const effMonth = Number($('#fixedEffMonth').value) || state.month;
        const effYear = Number($('#fixedEffYear').value) || state.year;

        const recEndType = $('input[name="entryRecEndType"]:checked')?.value || 'never';
        let temporalRecurrence = { frequency: 'monthly', type: 'never' };
        let calculatedEndedFrom = null;

        if (recEndType === 'count') {
          const recCount = Math.max(1, parseInt($('#recCountInput')?.value, 10) || 12);
          temporalRecurrence = { frequency: 'monthly', type: 'count', count: recCount };
          if (typeof calculateRecurrenceEndFrom === 'function') {
            calculatedEndedFrom = calculateRecurrenceEndFrom(effYear, effMonth, recCount);
          } else {
            const endIdx = (effMonth - 1) + recCount;
            calculatedEndedFrom = { year: effYear + Math.floor(endIdx / 12), month: (endIdx % 12) + 1 };
          }
        } else if (recEndType === 'date') {
          const endM = Number($('#recEndMonth')?.value) || effMonth;
          const endY = Number($('#recEndYear')?.value) || effYear;
          temporalRecurrence = { frequency: 'monthly', type: 'date', endYear: endY, endMonth: endM };
          const nextIdx = (endM - 1) + 1;
          calculatedEndedFrom = { year: endY + Math.floor(nextIdx / 12), month: (nextIdx % 12) + 1 };
        }

        let fixed = entryDlgState.fixedId ? state.fixed.find(f => f.id === entryDlgState.fixedId) : null;

        if (fixed) {
          fixed.name = name;
          fixed.group = group;
          fixed.destination = destination; // Bridge V1
          fixed.payment = { method: paymentMethod, account: account || null };
          fixed.payee = payee;
          fixed.temporal = { type: 'fixed', recurrence: temporalRecurrence };
          fixed.endedFrom = calculatedEndedFrom;
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
            destination, // Bridge V1
            payment: { method: paymentMethod, account: account || null },
            payee,
            temporal: { type: 'fixed', recurrence: temporalRecurrence },
            endedFrom: calculatedEndedFrom,
            dueDay,
            note,
            paymentType: 'fixed',
            versions: [{ year: effYear, month: effMonth, amount, startYear: effYear, startMonth: effMonth }],
            paidHistory: {}
          });
          fixed = state.fixed.find(f => f.id === newId);
        }

        if (fixed) {
          if (entryDlgState.mode === 'new') {
            if (status === 'pago') {
              if (typeof setExpensePayment === 'function') {
                setExpensePayment(fixed, effYear, effMonth, amount, amount);
              } else {
                fixed.paidHistory = fixed.paidHistory || {};
                const initKey = (typeof ymKey === 'function') ? ymKey(effYear, effMonth) : `${effYear}-${effMonth}`;
                fixed.paidHistory[initKey] = true;
              }
            }
          } else if (effMonth === state.month && effYear === state.year) {
            if (typeof setExpensePayment === 'function') {
              setExpensePayment(fixed, effYear, effMonth, status === 'pago' ? amount : 0, amount);
            } else {
              fixed.paidHistory = fixed.paidHistory || {};
              fixed.paidHistory[key] = (status === 'pago');
            }
          }
        }
      } else {
        state.variable = state.variable || [];
        let sMonth, sYear, count, eMonth, eYear, pType;

        let v = entryDlgState.id ? state.variable.find(x => x.id === entryDlgState.id) : null;

        if (simplifiedFlow) {
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

        const temporalData = (pType === 'installment')
          ? { type: 'installment', installments: count, startYear: sYear, startMonth: sMonth, endYear: eYear, endMonth: eMonth }
          : { type: 'cash', year: sYear, month: sMonth };

        if (pType === 'installment') {
          const chosenMode = getEntryAmountInputMode();
          let totalAmount = 0;
          let nominalInstallmentAmount = 0;

          if (chosenMode === 'installment') {
            nominalInstallmentAmount = amount;
            totalAmount = Math.round(nominalInstallmentAmount * count * 100) / 100;
          } else {
            totalAmount = amount;
            nominalInstallmentAmount = count > 0 ? (Math.round((totalAmount / count) * 100) / 100) : 0;
          }

          if (v) {
            let paidCount = 0;
            let sumPaid = 0;
            if (v.paidHistory) {
              const existingResolved = (typeof resolveInstallmentAmounts === 'function')
                ? resolveInstallmentAmounts(v)
                : null;
              Object.entries(v.paidHistory).forEach(([k, p]) => {
                const expectedMonthly = (existingResolved && existingResolved.schedule && existingResolved.schedule[k] !== undefined)
                  ? existingResolved.schedule[k]
                  : (existingResolved ? existingResolved.installmentAmount : Number(v.amount || 0));

                if (p === true) {
                  paidCount++;
                  sumPaid += expectedMonthly;
                } else if (typeof p === 'object' && p !== null) {
                  const pAmt = Number(p.paidAmount !== undefined ? p.paidAmount : (p.amount || 0));
                  if (pAmt > 0) {
                    if (pAmt >= expectedMonthly - 0.01) {
                      paidCount++;
                    }
                    sumPaid += pAmt;
                  }
                }
              });
            }
            sumPaid = Math.round(sumPaid * 100) / 100;

            if (count < paidCount) {
              if (typeof notify === 'function') {
                notify(`Não é possível reduzir para ${count} parcelas pois ${paidCount} já possuem pagamento registrado.`, 'error');
              }
              return;
            }
            if (totalAmount < sumPaid) {
              if (typeof notify === 'function') {
                notify(`O valor total (${currency(totalAmount)}) não pode ser inferior ao valor já quitado (${currency(sumPaid)}).`, 'error');
              }
              return;
            }

            // Recálculo canônico do schedule com partição exata do saldo remanescente em centavos inteiros
            const calculated = (typeof calculateInstallmentSchedule === 'function')
              ? calculateInstallmentSchedule(v, totalAmount, count, sYear, sMonth, true)
              : null;

            const newSchedule = calculated ? calculated.schedule : null;
            let futureInstallment = nominalInstallmentAmount;

            if (calculated && calculated.openKeys && calculated.openKeys.length > 0) {
              const firstOpenKey = calculated.openKeys[0];
              futureInstallment = (newSchedule && newSchedule[firstOpenKey] !== undefined)
                ? newSchedule[firstOpenKey]
                : nominalInstallmentAmount;
            } else if (newSchedule && Object.keys(newSchedule).length > 0) {
              const schedKeys = Object.keys(newSchedule);
              futureInstallment = newSchedule[schedKeys[schedKeys.length - 1]];
            }

            v.name = name;
            v.amount = (paidCount > 0) ? futureInstallment : nominalInstallmentAmount;
            v.totalAmount = totalAmount;
            v.installmentAmount = nominalInstallmentAmount;
            v.amountInputMode = chosenMode;
            if (newSchedule) {
              v.installmentSchedule = newSchedule;
            }
            v.group = group;
            v.destination = destination;
            v.payment = { method: paymentMethod, account: account || null };
            v.payee = payee;
            v.temporal = temporalData;
            v.dueDay = dueDay;
            v.note = note;
            v.startMonth = sMonth;
            v.startYear = sYear;
            v.endMonth = eMonth;
            v.endYear = eYear;
            v.installments = count;
            v.paymentType = pType;
            if (transactionDate) v.transactionDate = transactionDate;
            else delete v.transactionDate;
          } else {
            const newId = uid();
            const newExpense = {
              id: newId,
              name,
              amount: nominalInstallmentAmount,
              totalAmount,
              installmentAmount: nominalInstallmentAmount,
              amountInputMode: chosenMode,
              group,
              destination,
              payment: { method: paymentMethod, account: account || null },
              payee,
              temporal: temporalData,
              dueDay,
              note,
              startMonth: sMonth,
              startYear: sYear,
              endMonth: eMonth,
              endYear: eYear,
              installments: count,
              paymentType: pType,
              paidHistory: {}
            };
            if (transactionDate) newExpense.transactionDate = transactionDate;
            if (typeof calculateInstallmentSchedule === 'function') {
              const calcNew = calculateInstallmentSchedule(newExpense, totalAmount, count, sYear, sMonth, false);
              if (calcNew && calcNew.schedule) {
                newExpense.installmentSchedule = calcNew.schedule;
                const firstK = calcNew.keys && calcNew.keys[0];
                if (firstK && calcNew.schedule[firstK] !== undefined) {
                  newExpense.amount = calcNew.schedule[firstK];
                }
              }
            }
            state.variable.push(newExpense);
            v = state.variable.find(x => x.id === newId);
          }

          if (v) {
            const resolvedInit = (typeof resolveInstallmentAmounts === 'function')
              ? resolveInstallmentAmounts(v, sYear, sMonth)
              : null;
            const currentDue = resolvedInit ? resolvedInit.currentInstallmentAmount : nominalInstallmentAmount;

            if (typeof setExpensePayment === 'function') {
              setExpensePayment(v, sYear, sMonth, status === 'pago' ? currentDue : 0, currentDue);
            } else {
              v.paidHistory = v.paidHistory || {};
              const expenseKey = ymKey(sYear, sMonth);
              v.paidHistory[expenseKey] = (status === 'pago');
            }
          }
        } else {
          if (v) {
            v.name = name;
            v.amount = amount;
            v.totalAmount = amount;
            v.installmentAmount = amount;
            v.amountInputMode = 'total';
            v.group = group;
            v.destination = destination; // Bridge V1
            v.payment = { method: paymentMethod, account: account || null };
            v.payee = payee;
            v.temporal = temporalData;
            v.dueDay = dueDay;
            v.note = note;
            v.startMonth = sMonth;
            v.startYear = sYear;
            v.endMonth = eMonth;
            v.endYear = eYear;
            v.installments = count;
            v.paymentType = pType;
            if (transactionDate) v.transactionDate = transactionDate;
            else delete v.transactionDate;
          } else {
            const newId = uid();
            const newExpense = {
              id: newId,
              name,
              amount,
              totalAmount: amount,
              installmentAmount: amount,
              amountInputMode: 'total',
              group,
              destination, // Bridge V1
              payment: { method: paymentMethod, account: account || null },
              payee,
              temporal: temporalData,
              dueDay,
              note,
              startMonth: sMonth,
              startYear: sYear,
              endMonth: eMonth,
              endYear: eYear,
              installments: count,
              paymentType: pType,
              paidHistory: {}
            };
            if (transactionDate) newExpense.transactionDate = transactionDate;
            state.variable.push(newExpense);
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

    const allBtn = $('#expensesViewAllBtn');
    if (allBtn) {
      allBtn.addEventListener('click', () => {
        if (currentExpensesViewMode !== 'all') {
          setExpensesViewMode('all');
        }
      });
    }

    const byTypeBtn = $('#expensesViewByTypeBtn');
    if (byTypeBtn) {
      byTypeBtn.addEventListener('click', () => {
        if (currentExpensesViewMode !== 'type') {
          setExpensesViewMode('type');
        }
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

      const qMethod = isPixOrCash ? (destination.toLowerCase() === 'pix' ? 'pix' : 'dinheiro') : 'cartao_credito';
      const qAccount = isPixOrCash ? null : destination;

      const newExpense = {
        id: uid(),
        name,
        amount,
        totalAmount: amount,
        installmentAmount: amount,
        amountInputMode: 'total',
        group,
        destination, // Bridge V1
        payment: { method: qMethod, account: qAccount },
        payee: null,
        temporal: { type: 'cash', year: y, month: m },
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
  window.readExpensesViewMode = readExpensesViewMode;
  window.writeExpensesViewMode = writeExpensesViewMode;
  window.getExpensesViewMode = getExpensesViewMode;
  window.setExpensesViewMode = setExpensesViewMode;
  window.resetExpensesViewMode = resetExpensesViewMode;
  window.renderExpensesLists = renderExpensesLists;
  window.renderSimplifiedExpenses = renderSimplifiedExpenses;
  window.openEntryDialog = openEntryDialog;
  window.openQuickExpenseDialog = openQuickExpenseDialog;
  window.openPartialPaymentDialog = openPartialPaymentDialog;
  window.openFullscreenTable = openFullscreenTable;
  window.renderFullscreenTable = renderFullscreenTable;
  window.compareFullscreenItems = compareFullscreenItems;
  window.getFsSortState = () => ({ sortKey: fsSortKey, sortAsc: fsSortAsc });
  window.setFsSortState = (key, asc) => { fsSortKey = key; fsSortAsc = !!asc; };
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
  window.setEntryRecurrence = setEntryRecurrence;
  window.setEntryExpenseType = setEntryExpenseType;
  window.setWizardStep = setWizardStep;
  window.syncDestinationRules = syncDestinationRules;
  window.getEntryAmountInputMode = getEntryAmountInputMode;
  window.setEntryAmountInputMode = setEntryAmountInputMode;
  window.updateVarInstallments = updateVarInstallments;
  window.updateStep3Summary = updateStep3Summary;
  window.updatePaymentMethodSelect = updatePaymentMethodSelect;
  window.updateAccountSelect = updateAccountSelect;
  window.updatePayeeSuggestions = updatePayeeSuggestions;
  window.updateRecDurationView = updateRecDurationView;
  window.getEntryDlgState = () => entryDlgState;

  // Inicializacao sincrona dos listeners de despesas
  try {
    initExpensesListeners();
  } catch (err) {
    console.error('Erro ao inicializar listeners de despesas:', err);
  }
})();
