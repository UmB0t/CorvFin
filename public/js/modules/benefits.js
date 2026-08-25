window.getBenefitTypeInfo = function getBenefitTypeInfo(typeKey) {
  if (BENEFIT_TYPES_MAP[typeKey]) return BENEFIT_TYPES_MAP[typeKey];
  return { label: typeKey || 'Outro', short: (typeKey || 'BEN').toUpperCase().slice(0, 5), color: 'var(--brand)', bg: 'var(--brand-soft)' };
};

window.monthBenefitsTotals = function monthBenefitsTotals(year, month) {
  const state = getState();
  const config = state.benefitsConfig || { amount: 0 };
  const baseTotal = config.amount != null ? Number(config.amount || 0) : (Number(config.va || 0) + Number(config.vr || 0));

  const txs = (state.benefitTransactions || []).filter(t => t.year === year && t.month === month);
  const spentTotal = txs.reduce((s, t) => s + Number(t.amount || 0), 0);
  const remTotal = baseTotal - spentTotal;

  const spentByType = {};
  Object.keys(BENEFIT_TYPES_MAP).forEach(k => { spentByType[k] = 0; });
  txs.forEach(t => {
    const k = t.type || 'va';
    spentByType[k] = (spentByType[k] || 0) + Number(t.amount || 0);
  });

  return { baseTotal, spentTotal, remTotal, txs, spentByType };
};

window.renderBenefitsCharts = function renderBenefitsCharts(bt) {
  const state = getState();
  const grid = $('#benefitsChartsGrid');
  const toggleBtn = $('#toggleBenefitsChartsBtn');
  const isHidden = state.collapsedSections?.benefitsCharts === true;

  if (toggleBtn) toggleBtn.classList.toggle('active', !isHidden);
  if (grid) {
    grid.style.display = isHidden ? 'none' : 'grid';
    if (isHidden) return;
  }

  const typeContainer = $('#benefitTypeBars');
  const typeBadge = $('#benefitTypeTotalBadge');
  const dailyContainer = $('#benefitDailyBars');
  const remBadge = $('#benefitRemainingBadge');
  const spentSumText = $('#benefitSpentSummaryText');
  const baseSumText = $('#benefitBaseSummaryText');

  if (typeBadge) typeBadge.textContent = `Total: ${currency(bt.spentTotal)}`;
  if (spentSumText) spentSumText.textContent = currency(bt.spentTotal);
  if (baseSumText) baseSumText.textContent = currency(bt.baseTotal);
  if (remBadge) {
    remBadge.className = `badge ${bt.remTotal >= 0 ? 'positive' : 'danger'}`;
    remBadge.textContent = `Saldo: ${currency(bt.remTotal)}`;
  }

  // 1. Gráfico por Tipo de Benefício
  if (typeContainer) {
    const typeEntries = Object.entries(bt.spentByType)
      .filter(([_, val]) => val > 0)
      .sort((a, b) => b[1] - a[1]);

    if (typeEntries.length === 0) {
      typeContainer.innerHTML = `<div class="empty" style="padding:20px;">Sem lançamentos de benefícios neste mês (${MONTH_ABBR[state.month - 1]}/${state.year}).</div>`;
    } else {
      const maxVal = typeEntries[0][1] || 1;
      typeContainer.innerHTML = typeEntries.map(([typeKey, val]) => {
        const info = getBenefitTypeInfo(typeKey);
        const pctOfSpent = bt.spentTotal > 0 ? Math.round((val / bt.spentTotal) * 100) : 0;
        const barWidth = Math.round((val / maxVal) * 100);
        return `
          <div class="dest-bar-item" data-tooltip="${info.label}: ${currency(val)} (${pctOfSpent}% dos gastos)" style="cursor:default; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:6px; min-width:110px;">
              <span style="display:inline-block; width:10px; height:10px; border-radius:3px; background:${info.color}; flex-shrink:0;"></span>
              <span class="dest-name" style="font-size:.78rem;"><strong>${info.label}</strong></span>
            </div>
            <div class="dest-track" style="flex:1;">
              <div class="dest-fill" style="width:${barWidth}%; background:${info.color};"></div>
            </div>
            <span class="dest-val num" style="font-size:.82rem; font-weight:800;">${currency(val)} <small style="font-size:.68rem; color:var(--muted); font-weight:700;">(${pctOfSpent}%)</small></span>
          </div>
        `;
      }).join('');
    }
  }

  // 2. Gráfico de Evolução Diária & Saldo
  if (dailyContainer) {
    if (bt.txs.length === 0) {
      dailyContainer.innerHTML = `<div class="empty" style="width:100%; padding:20px; align-self:center;">Nenhuma movimentação diária para exibir.</div>`;
    } else {
      const daysMap = {};
      for (let d = 1; d <= 31; d++) daysMap[d] = 0;
      bt.txs.forEach(t => {
        const d = Math.max(1, Math.min(31, Number(t.day) || 1));
        daysMap[d] += Number(t.amount || 0);
      });

      const maxDayInMonth = Math.max(...bt.txs.map(t => Number(t.day) || 1), 15);
      const activeDays = [];
      for (let d = 1; d <= maxDayInMonth; d++) {
        activeDays.push({ day: d, amount: daysMap[d] });
      }

      const maxDaily = Math.max(...activeDays.map(x => x.amount), 50);
      let runningSpent = 0;

      dailyContainer.innerHTML = activeDays.map(item => {
        runningSpent += item.amount;
        const runningRem = bt.baseTotal - runningSpent;
        const h = item.amount > 0 ? Math.max(10, Math.round((item.amount / maxDaily) * 85)) : 3;
        const isSpentDay = item.amount > 0;
        const barColor = isSpentDay ? 'var(--brand)' : 'var(--line)';
        const tip = `Dia ${String(item.day).padStart(2, '0')}/${MONTH_ABBR[state.month - 1]}: ${currency(item.amount)} | Acumulado: ${currency(runningSpent)} | Saldo: ${currency(runningRem)}`;

        return `
          <div style="display:flex; flex-direction:column; align-items:center; flex:1; min-width:20px; height:100%; justify-content:flex-end;" data-tooltip="${tip}">
            ${isSpentDay ? `<span style="font-size:.62rem; font-weight:800; color:var(--brand); margin-bottom:2px;" class="num">${Math.round(item.amount)}</span>` : ''}
            <div style="width:100%; max-width:18px; height:${h}px; border-radius:4px 4px 0 0; background:${barColor}; transition:height .2s ease;"></div>
            <span style="font-size:.65rem; color:var(--muted); font-weight:700; margin-top:4px;">${item.day}</span>
          </div>
        `;
      }).join('');
    }
  }
};

window.updateBenefitCharts = function updateBenefitCharts() {
  const state = getState();
  const bt = monthBenefitsTotals(state.year, state.month);
  renderBenefitsCharts(bt);
};

window.renderBenefitsTab = function renderBenefitsTab() {
  const state = getState();
  const y = state.year, m = state.month;
  const bt = monthBenefitsTotals(y, m);

  const pctGasto = bt.baseTotal > 0 ? Math.min(100, Math.round((bt.spentTotal / bt.baseTotal) * 100)) : 0;

  const containerMetrics = $('#benefitMetrics');
  if (containerMetrics) {
    containerMetrics.innerHTML = `
        <div class="metric">
          <div class="label">Crédito Base Mensal</div>
          <div class="value num positive">${currency(bt.baseTotal)}</div>
          <div class="sub">Vale Benefício concedido no mês (Perfil)</div>
        </div>
        <div class="metric">
          <div class="label">Total Gasto no Mês <span class="badge ${pctGasto > 90 ? 'danger' : 'info'}">${pctGasto}%</span></div>
          <div class="value num negative">${currency(bt.spentTotal)}</div>
          <div class="sub">${currency(bt.spentTotal)} de ${currency(bt.baseTotal)} consumidos</div>
          <div class="bar"><span style="width:${pctGasto}%; background:${pctGasto > 100 ? 'var(--danger)' : 'var(--brand)'}"></span></div>
        </div>
        <div class="metric">
          <div class="label">Saldo Restante Disponível</div>
          <div class="value num ${bt.remTotal >= 0 ? 'positive' : 'negative'}">${currency(bt.remTotal)}</div>
          <div class="sub">${bt.remTotal >= 0 ? 'Disponível para compras compartilhadas' : 'Excedeu o valor do benefício'}</div>
        </div>
        <div class="metric">
          <div class="label">Lançamentos no Mês</div>
          <div class="value num">${bt.txs.length} <small style="font-size:.8rem; color:var(--muted)">registros</small></div>
          <div class="sub">Transações registradas no período</div>
        </div>
      `;
  }

  renderBenefitsCharts(bt);

  const query = ($('#benefitsSearchInput')?.value || '').toLowerCase().trim();
  const typeFilter = $('#benefitsTypeFilter')?.value || 'all';
  const sortFilter = $('#benefitsSortFilter')?.value || 'date-desc';

  let filtered = bt.txs.filter(t => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (query) {
      const typeInfo = getBenefitTypeInfo(t.type);
      const text = `${t.description} ${t.note || ''} ${t.type || ''} ${typeInfo.label}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });

  if (sortFilter === 'custom') {
    // Mantém a ordem customizada definida por drag-and-drop
  } else if (sortFilter === 'amount-desc') {
    filtered.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
  } else if (sortFilter === 'amount-asc') {
    filtered.sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
  } else if (sortFilter === 'date-asc') {
    filtered.sort((a, b) => Number(a.day || 1) - Number(b.day || 1));
  } else {
    filtered.sort((a, b) => Number(b.day || 1) - Number(a.day || 1));
  }

  const sumFiltered = filtered.reduce((s, t) => s + Number(t.amount || 0), 0);
  const sumEl = $('#sumBenefits');
  if (sumEl) sumEl.textContent = currency(sumFiltered);

  const listEl = $('#listBenefits');
  if (listEl) {
    listEl.innerHTML = '';
    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="empty">Nenhum gasto com benefício encontrado para os filtros selecionados.</div>`;
    } else {
      filtered.forEach(item => {
        const typeInfo = getBenefitTypeInfo(item.type);
        const badgeHtml = `
                <div style="width:36px; height:36px; border-radius:10px; background:${typeInfo.bg}; color:${typeInfo.color}; display:grid; place-items:center; font-weight:800; font-size:.7rem; flex-shrink:0; letter-spacing:-.02em;">
                  ${typeInfo.short}
                </div>`;

        const row = buildEntryRow({
          id: item.id,
          type: 'benefit',
          title: item.description,
          tags: [
            typeInfo.label,
            `Dia ${item.day || 1}/${MONTH_ABBR[(item.month || 1) - 1]}`,
            item.note || ''
          ].filter(Boolean),
          amount: item.amount,
          customLeftBadge: badgeHtml,
          onClickEdit: () => openBenefitDialog('edit', item.id),
          onDelete: () => deleteBenefit(item.id)
        });
        listEl.appendChild(row);
      });
    }
  }
};
