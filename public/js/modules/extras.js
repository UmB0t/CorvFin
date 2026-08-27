/* ==========================================================================
   MODULO DE RENDAS EXTRAS (extras.js)
   Financas Pro - Vanilla JS Architecture
   ========================================================================== */

(function() {
  'use strict';

  let extraDlgId = null;

  function updateExtraInstallments() {
    const sm = Number($('#extraStartMonth').value), sy = Number($('#extraStartYear').value);
    const em = Number($('#extraEndMonth').value), ey = Number($('#extraEndYear').value);
    const count = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
    const el = $('#extraInstallmentsCount');
    if (el) el.textContent = count > 1 ? `(${count} parcelas)` : '(pagamento único)';
  }

  function openExtraDialog(mode, id) {
    const state = getState();
    const extraDlg = $('#extraIncomeDialog');
    $('#extraIncomeForm').reset();
    extraDlgId = id || null;
    $('#deleteExtraIncomeBtn').hidden = !id;

    if (mode === 'new') {
      $('#extraDialogTitle').textContent = 'Nova Renda Extra';
      $('#extraStartMonth').value = state.month;
      $('#extraStartYear').value = state.year;
      $('#extraEndMonth').value = state.month;
      $('#extraEndYear').value = state.year;
      $('#extraDest').value = (state.destinations[0] || {}).name || 'Nubank';
      $('#extraGroup').value = (state.categories[0] || {}).name || 'Renda Extra';
      updateExtraInstallments();
    } else {
      const e = (state.extras || []).find(x => x.id === id);
      if (!e) return;
      $('#extraDialogTitle').textContent = 'Editar Renda Extra';
      $('#extraName').value = e.name;
      $('#extraAmount').value = currency(e.amount);
      $('#extraGroup').value = e.group || '';
      $('#extraDest').value = e.destination || (state.destinations[0] || {}).name || 'Nubank';
      $('#extraStartMonth').value = e.startMonth;
      $('#extraStartYear').value = e.startYear;
      $('#extraEndMonth').value = e.endMonth;
      $('#extraEndYear').value = e.endYear;
      updateExtraInstallments();
    }
    if (extraDlg) extraDlg.showModal();
  }

function activeExtrasForMonth(year, month) {
  const state = getState();
  const target = mk(year, month);
  const key = ymKey(year, month);
  return (state.extras || []).filter(e => target >= mk(e.startYear, e.startMonth) && target <= mk(e.endYear, e.endMonth))
    .map(e => {
      const isPaid = e.paidHistory ? e.paidHistory[key] === true : e.status === 'pago';
      return Object.assign({}, e, { status: isPaid ? 'pago' : 'pendente' });
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
  const yearContainer = $('#extrasYearBars');
  const yearBadge = $('#extrasYearTotalBadge');
  const avgSummaryText = $('#extrasAvgSummaryText');
  const totalYearSummaryText = $('#extrasTotalYearSummaryText');

  const curExtras = activeExtrasForMonth(state.year, state.month);
  const curTotal = curExtras.reduce((s, e) => s + Number(e.amount || 0), 0);
  if (originBadge) originBadge.textContent = `Total Mês: ${currency(curTotal)}`;

  // 1. Gráfico por Origem / Remetente
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

  // 2. Gráfico de Evolução Anual
  if (yearContainer) {
    let yearTotal = 0;
    const monthsData = [];
    for (let m = 1; m <= 12; m++) {
      const mExt = activeExtrasForMonth(state.year, m);
      const mSum = mExt.reduce((s, e) => s + Number(e.amount || 0), 0);
      yearTotal += mSum;
      monthsData.push({ month: m, total: mSum });
    }

    const avg = yearTotal / 12;
    if (yearBadge) yearBadge.textContent = `Total ${state.year}: ${currency(yearTotal)}`;
    if (avgSummaryText) avgSummaryText.textContent = currency(avg);
    if (totalYearSummaryText) totalYearSummaryText.textContent = currency(yearTotal);

    const maxM = Math.max(...monthsData.map(x => x.total), 100);
    yearContainer.innerHTML = monthsData.map(item => {
      const isCur = item.month === state.month;
      const h = item.total > 0 ? Math.max(10, Math.round((item.total / maxM) * 85)) : 4;
      const barColor = isCur ? 'var(--c-extra)' : (item.total > 0 ? 'var(--brand)' : 'var(--line)');
      const tip = `${MONTH_NAMES[item.month - 1]}/${state.year}: ${currency(item.total)}`;
      return `
        <div style="display:flex; flex-direction:column; align-items:center; flex:1; min-width:20px; height:100%; justify-content:flex-end; cursor:pointer;" data-tooltip="${tip}" onclick="window.selectMonth && window.selectMonth(${item.month})">
          ${item.total > 0 ? `<span style="font-size:.62rem; font-weight:800; color:var(--brand); margin-bottom:2px;" class="num">${Math.round(item.total)}</span>` : ''}
          <div style="width:100%; max-width:18px; height:${h}px; border-radius:4px 4px 0 0; background:${barColor}; transition:height .2s ease; ${isCur ? 'box-shadow: 0 0 8px var(--c-extra);' : ''}"></div>
          <span style="font-size:.65rem; color:${isCur ? 'var(--brand-strong)' : 'var(--muted)'}; font-weight:${isCur ? '800' : '700'}; margin-top:4px;">${MONTH_ABBR[item.month - 1]}</span>
        </div>
      `;
    }).join('');
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
  const receivedExtra = rawExtras.filter(e => e.status === 'pago').reduce((s, e) => s + Number(e.amount), 0);
  const pendingExtra = totalExtra - receivedExtra;

  $('#extraMetrics').innerHTML = `
      <div class="metric">
        <div class="label">Renda Extra Total (Mês)</div>
        <div class="value num positive">${currency(totalExtra)}</div>
        <div class="sub">Adiciona ao seu salário</div>
      </div>
      <div class="metric">
        <div class="label">Valores Recebidos</div>
        <div class="value num positive">${currency(receivedExtra)}</div>
        <div class="sub">Já pagos pelos remetentes</div>
      </div>
      <div class="metric">
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
    id: e.id, type: 'extra', title: e.title,
    tags: [`Origem: ${e.source}`, `Envia: ${e.sender}`],
    amount: e.amount, status: e.status, destination: 'Renda Extra',
    onClickToggleStatus: () => toggleExpenseStatus('extra', e.id, e.status),
    onClickEdit: () => openExtraDialog('edit', e.id)
  }));

  renderSection('#listExtra', '#sumExtra', rows, extras.reduce((s, e) => s + Number(e.amount), 0));
};

  function initExtrasListeners() {
    $('#extrasSearchInput')?.addEventListener('input', renderExtrasTab);
    $('#extrasStatusFilter')?.addEventListener('change', renderExtrasTab);

    const toggleExtrasChartsBtn = $('#toggleExtrasChartsBtn');
    if (toggleExtrasChartsBtn) {
      toggleExtrasChartsBtn.addEventListener('click', () => {
        const state = getState();
        state.collapsedSections.extrasCharts = !state.collapsedSections.extrasCharts;
        saveState();
        renderExtraIncomeCharts();
      });
    }

    ['#extraStartMonth', '#extraStartYear', '#extraEndMonth', '#extraEndYear'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('change', updateExtraInstallments);
      if (el) el.addEventListener('input', updateExtraInstallments);
    });

    const newExtraBtn = $('#newExtraBtn');
    if (newExtraBtn) newExtraBtn.addEventListener('click', () => openExtraDialog('new'));

    $('#extraIncomeForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const state = getState();
      const extraDlg = $('#extraIncomeDialog');
      const name = $('#extraName').value.trim();
      const amount = Number(String($('#extraAmount').value).replace(/[^0-9,-]/g, '').replace(',', '.')) || 0;
      const group = $('#extraGroup').value.trim() || 'Renda Extra';
      const destination = $('#extraDest').value;
      const sm = Number($('#extraStartMonth').value), sy = Number($('#extraStartYear').value);
      const em = Number($('#extraEndMonth').value), ey = Number($('#extraEndYear').value);

      if (!name || amount <= 0) {
        notify('Preencha um nome e valor válidos para a renda extra.', 'error');
        return;
      }
      if (mk(ey, em) < mk(sy, sm)) {
        notify('O mês/ano final não pode ser anterior ao inicial.', 'error');
        return;
      }

      state.extras = state.extras || [];
      const installments = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);

      if (extraDlgId) {
        const extra = state.extras.find(x => x.id === extraDlgId);
        if (extra) {
          extra.name = name;
          extra.amount = amount;
          extra.group = group;
          extra.destination = destination;
          extra.startMonth = sm;
          extra.startYear = sy;
          extra.endMonth = em;
          extra.endYear = ey;
          extra.installments = installments;
        }
      } else {
        state.extras.push({
          id: uid(),
          name,
          amount,
          group,
          destination,
          startMonth: sm,
          startYear: sy,
          endMonth: em,
          endYear: ey,
          installments,
          paidHistory: {}
        });
      }

      saveState();
      if (extraDlg) extraDlg.close();
      render();
      notify('Renda extra salva com sucesso!', 'success');
    });

    $('#deleteExtraIncomeBtn')?.addEventListener('click', () => {
      const state = getState();
      const extraDlg = $('#extraIncomeDialog');
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

  // Inicializacao sincrona dos listeners de rendas extras
  try {
    initExtrasListeners();
  } catch (err) {
    console.error('Erro ao inicializar listeners de extras:', err);
  }
})();
