window.activeExtrasForMonth = function activeExtrasForMonth(year, month) {
  const state = getState();
  const target = mk(year, month);
  const key = ymKey(year, month);
  return (state.extras || []).filter(e => target >= mk(e.startYear, e.startMonth) && target <= mk(e.endYear, e.endMonth))
    .map(e => {
      const isPaid = e.paidHistory ? e.paidHistory[key] === true : e.status === 'pago';
      return Object.assign({}, e, { status: isPaid ? 'pago' : 'pendente' });
    });
};

window.reorderExtras = function reorderExtras(sourceId, targetId) {
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

window.moveExtraToEnd = function moveExtraToEnd(sourceId) {
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

window.renderExtraIncomeCharts = function renderExtraIncomeCharts() {
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

window.renderExtrasTab = function renderExtrasTab() {
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
