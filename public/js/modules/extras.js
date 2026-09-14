/* ==========================================================================
   MODULO DE RENDAS EXTRAS (extras.js)
   Financas Pro - Vanilla JS Architecture
   ========================================================================== */

(function() {
  'use strict';

  let extraDlgId = null;

    function updateExtraInstallments() {
    const sm = Number($('#extraStartMonth')?.value) || 1, sy = Number($('#extraStartYear')?.value) || 2026;
    const em = Number($('#extraEndMonth')?.value) || 1, ey = Number($('#extraEndYear')?.value) || 2026;
    const count = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
    const isMulti = count > 1;
    const badge = $('#extraInstallmentsBadge');
    if (badge) {
      badge.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> Período: ${count} ${count > 1 ? 'meses' : 'mês'}`;
    }
    const dateWrap = $('#extraReceiveDateWrap');
    const dateInput = $('#extraReceiveDate');
    if (dateWrap) {
      dateWrap.style.display = isMulti ? 'none' : '';
    }
    if (isMulti && dateInput) {
      dateInput.value = '';
    }
  }

  function openExtraDialog(mode = 'new', id = null) {
    if (typeof window.hasTabPermission === 'function' && !window.hasTabPermission('tab-extras')) {
      if (typeof notify === 'function') notify('Você não tem permissão para acessar o módulo de Rendas Extras.', 'error');
      return;
    }
    if (typeof window.isModuleInMaintenance === 'function' && window.isModuleInMaintenance('tab-extras')) {
      if (typeof notify === 'function') notify('O módulo de Rendas Extras está temporariamente em manutenção.', 'warning');
      return;
    }

    const state = getState();
    const extraDlg = $('#extraDialog');
    if (!extraDlg) return;
    $('#extraForm')?.reset();
    extraDlgId = id || null;
    if ($('#deleteExtraBtn')) $('#deleteExtraBtn').hidden = !id;

    if (typeof fillMonthSelects === 'function') {
      try { fillMonthSelects(); } catch (e) {}
    }

    const startSel = $('#extraStartMonth');
    const endSel = $('#extraEndMonth');
    if (startSel && (!startSel.children || startSel.children.length === 0)) {
      startSel.innerHTML = MONTH_ABBR.map((m, idx) => `<option value="${idx + 1}">${m}</option>`).join('');
    }
    if (endSel && (!endSel.children || endSel.children.length === 0)) {
      endSel.innerHTML = MONTH_ABBR.map((m, idx) => `<option value="${idx + 1}">${m}</option>`).join('');
    }

    if (mode === 'new' || !id) {
      if ($('#extraDialogTitle')) $('#extraDialogTitle').textContent = 'Nova Renda Extra';
      if ($('#extraTitle')) $('#extraTitle').value = '';
      if ($('#extraSource')) $('#extraSource').value = '';
      if ($('#extraAmount')) $('#extraAmount').value = '';
      if ($('#extraSender')) $('#extraSender').value = '';
      if ($('#extraStartMonth')) $('#extraStartMonth').value = state.month || 1;
      if ($('#extraStartYear')) $('#extraStartYear').value = state.year || 2026;
      if ($('#extraEndMonth')) $('#extraEndMonth').value = state.month || 1;
      if ($('#extraEndYear')) $('#extraEndYear').value = state.year || 2026;
      if ($('#extraStatus')) $('#extraStatus').value = 'pendente';
      if ($('#extraReceiveDay')) $('#extraReceiveDay').value = '';
      if ($('#extraReceiveDate')) $('#extraReceiveDate').value = '';
      if ($('#extraIncludeInSimulation')) $('#extraIncludeInSimulation').checked = true;
      if ($('#extraDescription')) $('#extraDescription').value = '';
      updateExtraInstallments();
    } else {
      const e = (state.extras || []).find(x => x.id === id);
      if (!e) return;
      if ($('#extraDialogTitle')) $('#extraDialogTitle').textContent = 'Editar Renda Extra';
      if ($('#extraTitle')) $('#extraTitle').value = e.title || '';
      if ($('#extraSource')) $('#extraSource').value = e.source || '';
      if ($('#extraAmount')) $('#extraAmount').value = e.amount || '';
      if ($('#extraSender')) $('#extraSender').value = e.sender || '';
      if ($('#extraStartMonth')) $('#extraStartMonth').value = e.startMonth || state.month || 1;
      if ($('#extraStartYear')) $('#extraStartYear').value = e.startYear || state.year || 2026;
      if ($('#extraEndMonth')) $('#extraEndMonth').value = e.endMonth || state.month || 1;
      if ($('#extraEndYear')) $('#extraEndYear').value = e.endYear || state.year || 2026;
      if ($('#extraStatus')) $('#extraStatus').value = e.status || 'pendente';
      if ($('#extraReceiveDay')) $('#extraReceiveDay').value = e.receiveDay != null ? e.receiveDay : '';
      if ($('#extraReceiveDate')) $('#extraReceiveDate').value = e.receiveDate || '';
      if ($('#extraIncludeInSimulation')) $('#extraIncludeInSimulation').checked = e.includeInSimulation !== false;
      if ($('#extraDescription')) $('#extraDescription').value = e.description || '';
      updateExtraInstallments();
    }
    extraDlg.showModal();
    setTimeout(() => {
      $('#extraTitle')?.focus();
    }, 50);
  }

function activeExtrasForMonth(year, month) {
  const state = getState();
  const target = mk(year, month);
  const key = ymKey(year, month);
  return (state.extras || []).filter(e => target >= mk(e.startYear, e.startMonth) && target <= mk(e.endYear, e.endMonth))
    .map(e => {
      const payInfo = (typeof getExpensePaymentInfo === 'function')
        ? getExpensePaymentInfo(e, year, month, e.amount)
        : { totalAmount: Number(e.amount), paidAmount: (e.paidHistory && e.paidHistory[key] === true ? Number(e.amount) : 0), remainingAmount: 0, status: (e.paidHistory && e.paidHistory[key] === true ? 'pago' : 'pendente') };

      return Object.assign({}, e, {
        status: payInfo.status,
        paidAmount: payInfo.paidAmount,
        remainingAmount: payInfo.remainingAmount
      });
    });
};

function reorderExtras(sourceId, targetId) {
  if (sourceId === targetId) return;
  const state = getState();
  const sIdx = (state.extras || []).findIndex(e => e.id === sourceId);
  const tIdx = (state.extras || []).findIndex(e => e.id === targetId);
  if (sIdx !== -1 && tIdx !== -1) {
    const [moved] = state.extras.splice(sIdx, 1);
    state.extras.splice(tIdx, 0, moved);
    saveState();
    render();
    notify('Ordem das rendas extras atualizada!');
  }
};

function moveExtraToEnd(sourceId) {
  const state = getState();
  const sIdx = (state.extras || []).findIndex(e => e.id === sourceId);
  if (sIdx !== -1) {
    const [moved] = state.extras.splice(sIdx, 1);
    state.extras.push(moved);
    saveState();
    render();
    notify('Ordem das rendas extras atualizada!');
  }
};

function renderExtraIncomeCharts() {
  const state = getState();
  const grid = $('#extrasChartsGrid');
  const toggleBtn = $('#toggleExtrasChartsBtn');
  const isHidden = state.collapsedSections?.extrasCharts === true;

  if (toggleBtn) toggleBtn.classList.toggle('active', !isHidden);
  if (grid) {
    grid.style.display = isHidden ? 'none' : 'grid';
    if (isHidden) return;
  }

  const originContainer = $('#extrasOriginBars');
  const originBadge = $('#extrasOriginTotalBadge');

  const curExtras = activeExtrasForMonth(state.year, state.month);
  const curTotal = curExtras.reduce((s, e) => s + Number(e.amount || 0), 0);
  if (originBadge) originBadge.textContent = `Total Mês: ${currency(curTotal)}`;

  // Gráfico por Origem / Remetente
  if (originContainer) {
    const originMap = {};
    curExtras.forEach(e => {
      const org = (e.sender || e.source || e.title || 'Outros').trim();
      originMap[org] = (originMap[org] || 0) + Number(e.amount || 0);
    });

    const originEntries = Object.entries(originMap).sort((a, b) => b[1] - a[1]);
    if (originEntries.length === 0) {
      originContainer.innerHTML = `<div class="empty" style="padding:20px;">Sem rendas extras cadastradas neste mês (${MONTH_ABBR[state.month - 1]}/${state.year}).</div>`;
    } else {
      const maxVal = originEntries[0][1] || 1;
      originContainer.innerHTML = originEntries.map(([org, val], idx) => {
        const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
        const pct = curTotal > 0 ? Math.round((val / curTotal) * 100) : 0;
        const barWidth = Math.round((val / maxVal) * 100);
        return `
          <div class="dest-bar-item" data-tooltip="${escapeHtml(org)}: ${currency(val)} (${pct}%)" style="cursor:default; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:6px; min-width:110px;">
              <span style="display:inline-block; width:10px; height:10px; border-radius:3px; background:${color}; flex-shrink:0;"></span>
              <span class="dest-name" style="font-size:.78rem;"><strong>${escapeHtml(org)}</strong></span>
            </div>
            <div class="dest-track" style="flex:1;">
              <div class="dest-fill" style="width:${barWidth}%; background:${color};"></div>
            </div>
            <span class="dest-val num" style="font-size:.82rem; font-weight:800;">${currency(val)} <small style="font-size:.68rem; color:var(--muted); font-weight:700;">(${pct}%)</small></span>
          </div>
        `;
      }).join('');
    }
  }
};

window.updateExtraIncomeCharts = function updateExtraIncomeCharts() {
  renderExtraIncomeCharts();
};

function toggleExtraStatus(id) {
    toggleExpenseStatus("extra", id);
  }

  function markAllExtrasPaid() {
    markAllSectionPaid("extras");
  }

  function renderExtrasTab() {
  const state = getState();
  const y = state.year, m = state.month;
  const rawExtras = activeExtrasForMonth(y, m);
  const totalExtra = rawExtras.reduce((s, e) => s + Number(e.amount), 0);
  const receivedExtra = rawExtras.reduce((s, e) => s + Number(e.paidAmount !== undefined ? e.paidAmount : (e.status === 'pago' ? e.amount : 0)), 0);
  const pendingExtra = Math.max(0, totalExtra - receivedExtra);

  $('#extraMetrics').innerHTML = `
      <div class="metric metric-income">
        <div class="label">Renda Extra Total (Mês)</div>
        <div class="value num positive">${currency(totalExtra)}</div>
        <div class="sub">Adiciona ao seu salário</div>
      </div>
      <div class="metric metric-paid">
        <div class="label">Valores Recebidos</div>
        <div class="value num positive">${currency(receivedExtra)}</div>
        <div class="sub">Já pagos pelos remetentes</div>
      </div>
      <div class="metric metric-pending">
        <div class="label">Valores a Receber</div>
        <div class="value num warning">${currency(pendingExtra)}</div>
        <div class="sub">Pendentes neste mês</div>
      </div>
    `;

  renderExtraIncomeCharts();

  const query = ($('#extrasSearchInput').value || '').toLowerCase().trim();
  const statusFilter = $('#extrasStatusFilter').value;

  const extras = rawExtras.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (query) {
      const text = `${e.title} ${e.source} ${e.sender} ${e.description || ''}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });

  const rows = extras.map(e => buildEntryRow({
    id: e.id,
    type: 'extra',
    title: e.title,
    tags: [`Origem: ${e.source}`, `Envia: ${e.sender}`],
    amount: e.amount,
    status: e.status,
    paidAmount: e.paidAmount,
    remainingAmount: e.remainingAmount,
    destination: 'Renda Extra',
    onClickToggleStatus: () => toggleExpenseStatus('extra', e.id, e.status),
    onClickEdit: () => openExtraDialog('edit', e.id)
  }));

  renderSection('#listExtra', '#sumExtra', rows, extras.reduce((s, e) => s + Number(e.amount), 0));
  if (typeof updateMarkAllButtonState === 'function') {
    updateMarkAllButtonState('#markAllExtrasPaidBtn', rawExtras);
  }
};

    function initExtrasListeners() {
    $('#extrasSearchInput')?.addEventListener('input', renderExtrasTab);
    $('#extrasStatusFilter')?.addEventListener('change', renderExtrasTab);



    const toggleExtrasChartsBtn = $('#toggleExtrasChartsBtn');
    if (toggleExtrasChartsBtn) {
      toggleExtrasChartsBtn.addEventListener('click', () => {
        const state = getState();
        state.collapsedSections = state.collapsedSections || {};
        state.collapsedSections.extrasCharts = !state.collapsedSections.extrasCharts;
        saveState();
        renderExtrasTab();
      });
    }

    ['#extraStartMonth', '#extraStartYear', '#extraEndMonth', '#extraEndYear'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('change', updateExtraInstallments);
      if (el) el.addEventListener('input', updateExtraInstallments);
    });

    const newExtraBtn = $('#newExtraBtn');
    if (newExtraBtn) newExtraBtn.addEventListener('click', () => openExtraDialog('new'));

    $('#extraReceiveDate')?.addEventListener('input', () => {
      if ($('#extraReceiveDate')?.value && $('#extraReceiveDay')) {
        $('#extraReceiveDay').value = '';
      }
    });
    $('#extraReceiveDay')?.addEventListener('input', () => {
      if ($('#extraReceiveDay')?.value && $('#extraReceiveDate')) {
        $('#extraReceiveDate').value = '';
      }
    });

    $('#extraForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const state = getState();
      const extraDlg = $('#extraDialog');
      const title = $('#extraTitle')?.value.trim();
      const source = $('#extraSource')?.value.trim() || 'Gerais';
      const amount = Number($('#extraAmount')?.value) || 0;
      const sender = $('#extraSender')?.value.trim() || '';
      const sm = Number($('#extraStartMonth')?.value) || state.month || 1;
      const sy = Number($('#extraStartYear')?.value) || state.year || 2026;
      const em = Number($('#extraEndMonth')?.value) || state.month || 1;
      const ey = Number($('#extraEndYear')?.value) || state.year || 2026;
      const status = $('#extraStatus')?.value || 'pendente';
      const rawReceiveDay = $('#extraReceiveDay')?.value;
      const receiveDay = (rawReceiveDay !== undefined && rawReceiveDay !== '' && !isNaN(Number(rawReceiveDay))) ? Number(rawReceiveDay) : null;
      const rawReceiveDate = $('#extraReceiveDate')?.value;
      const receiveDate = (rawReceiveDate && typeof rawReceiveDate === 'string' && rawReceiveDate.trim() !== '') ? rawReceiveDate.trim() : null;
      const description = $('#extraDescription')?.value.trim() || '';
      const includeInSimulation = $('#extraIncludeInSimulation')?.checked !== false;

      if (!title || amount <= 0) {
        notify('Preencha um título e valor válidos para a renda extra.', 'error');
        return;
      }
      if (mk(ey, em) < mk(sy, sm)) {
        notify('O mês/ano final não pode ser anterior ao inicial.', 'error');
        return;
      }

      state.extras = state.extras || [];
      const installments = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
      const isMulti = installments > 1;

      let finalReceiveDay = receiveDay;
      let finalReceiveDate = receiveDate;

      if (isMulti) {
        finalReceiveDate = null;
      } else {
        if (finalReceiveDate) {
          finalReceiveDay = null;
        }
      }

      if (extraDlgId) {
        const item = state.extras.find(x => x.id === extraDlgId);
        if (item) {
          item.title = title;
          item.source = source;
          item.amount = amount;
          item.sender = sender;
          item.startMonth = sm;
          item.startYear = sy;
          item.endMonth = em;
          item.endYear = ey;
          item.status = status;
          item.description = description;
          item.installments = installments;
          item.includeInSimulation = includeInSimulation;
          if (finalReceiveDay != null) item.receiveDay = finalReceiveDay;
          else delete item.receiveDay;
          if (finalReceiveDate) item.receiveDate = finalReceiveDate;
          else delete item.receiveDate;
        }
      } else {
        const newExtra = {
          id: uid(),
          title,
          source,
          amount,
          sender,
          startMonth: sm,
          startYear: sy,
          endMonth: em,
          endYear: ey,
          status,
          description,
          installments,
          includeInSimulation,
          paidHistory: {}
        };
        if (finalReceiveDay != null) newExtra.receiveDay = finalReceiveDay;
        if (finalReceiveDate) newExtra.receiveDate = finalReceiveDate;
        state.extras.push(newExtra);
      }

      saveState();
      if (extraDlg) extraDlg.close();
      render();
      notify('Renda extra salva com sucesso!', 'success');
    });

    $('#deleteExtraBtn')?.addEventListener('click', () => {
      const state = getState();
      const extraDlg = $('#extraDialog');
      if (!extraDlgId) return;
      if (!confirm('Excluir esta renda extra?')) return;
      state.extras = (state.extras || []).filter(x => x.id !== extraDlgId);
      saveState();
      if (extraDlg) extraDlg.close();
      render();
      notify('Renda extra excluída!', 'info');
    });
  }

  // Bridges publicas autorizadas
  window.activeExtrasForMonth = activeExtrasForMonth;
  window.reorderExtras = reorderExtras;
  window.moveExtraToEnd = moveExtraToEnd;
  window.toggleExtraStatus = toggleExtraStatus;
  window.markAllExtrasPaid = markAllExtrasPaid;
  window.renderExtrasTab = renderExtrasTab;
  window.openExtraDialog = openExtraDialog;

  // Inicializacao sincrona dos listeners de rendas extras
  try {
    initExtrasListeners();
  } catch (err) {
    console.error('Erro ao inicializar listeners de extras:', err);
  }
})();
