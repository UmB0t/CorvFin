/* ==========================================================================
   MODULO DE DEVEDORES & COBRANCAS (debtors.js)
   Financas Pro - Vanilla JS Architecture
   ========================================================================== */

(function() {
  'use strict';

function normalizeSearchText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}



  let debtorDlgId = null;

    function updateDebtorInstallments() {
    const sm = Number($('#debtorStartMonth')?.value) || 1, sy = Number($('#debtorStartYear')?.value) || 2026;
    const em = Number($('#debtorEndMonth')?.value) || 1, ey = Number($('#debtorEndYear')?.value) || 2026;
    const count = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
    const badge = $('#debtorInstallmentsBadge');
    if (badge) {
      badge.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> Quantidade de Parcelas: ${count}x`;
    }
  }

  function openDebtorDialog(mode, id) {
    const state = getState();
    const debtorDlg = $('#debtorDialog');
    $('#debtorForm')?.reset();
    debtorDlgId = id || null;
    if ($('#deleteDebtorBtn')) $('#deleteDebtorBtn').hidden = !id;

    const startSel = $('#debtorStartMonth');
    const endSel = $('#debtorEndMonth');
    if (startSel) startSel.innerHTML = MONTH_ABBR.map((m, idx) => `<option value="${idx + 1}">${m}</option>`).join('');
    if (endSel) endSel.innerHTML = MONTH_ABBR.map((m, idx) => `<option value="${idx + 1}">${m}</option>`).join('');

    const destSelect = $('#debtorDestination');
    if (destSelect) {
      destSelect.innerHTML = (state.destinations || []).map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
    }

    if (mode === 'new') {
      if ($('#debtorDialogTitle')) $('#debtorDialogTitle').textContent = 'Cadastrar Devedor';
      if ($('#debtorTitle')) $('#debtorTitle').value = '';
      if ($('#debtorName')) $('#debtorName').value = '';
      if ($('#debtorAmount')) $('#debtorAmount').value = '';
      if ($('#debtorStartMonth')) $('#debtorStartMonth').value = state.month || 1;
      if ($('#debtorStartYear')) $('#debtorStartYear').value = state.year || 2026;
      if ($('#debtorEndMonth')) $('#debtorEndMonth').value = state.month || 1;
      if ($('#debtorEndYear')) $('#debtorEndYear').value = state.year || 2026;
      if (destSelect && state.destinations && state.destinations.length > 0) {
        destSelect.value = state.destinations[0].name;
      }
      if ($('#debtorStatus')) $('#debtorStatus').value = 'pendente';
      if ($('#debtorCountInTotal')) $('#debtorCountInTotal').checked = true;
      if ($('#debtorIncludeInSimulation')) $('#debtorIncludeInSimulation').checked = true;
      if ($('#debtorDescription')) $('#debtorDescription').value = '';
      updateDebtorInstallments();
    } else {
      const d = (state.debtors || []).find(x => x.id === id);
      if (!d) return;
      if ($('#debtorDialogTitle')) $('#debtorDialogTitle').textContent = 'Editar Devedor';
      if ($('#debtorTitle')) $('#debtorTitle').value = d.title || '';
      if ($('#debtorName')) $('#debtorName').value = d.debtorName || d.name || '';
      if ($('#debtorAmount')) $('#debtorAmount').value = d.amount || '';
      if (destSelect) destSelect.value = d.destination || (state.destinations[0] || {}).name || 'Nubank';
      if ($('#debtorStartMonth')) $('#debtorStartMonth').value = d.startMonth || state.month || 1;
      if ($('#debtorStartYear')) $('#debtorStartYear').value = d.startYear || state.year || 2026;
      if ($('#debtorEndMonth')) $('#debtorEndMonth').value = d.endMonth || state.month || 1;
      if ($('#debtorEndYear')) $('#debtorEndYear').value = d.endYear || state.year || 2026;
      if ($('#debtorStatus')) $('#debtorStatus').value = d.status || 'pendente';
      if ($('#debtorCountInTotal')) $('#debtorCountInTotal').checked = d.countInTotal !== false;
      if ($('#debtorIncludeInSimulation')) $('#debtorIncludeInSimulation').checked = d.includeInSimulation !== false;
      if ($('#debtorDescription')) $('#debtorDescription').value = d.description || '';
      updateDebtorInstallments();
    }
    if (debtorDlg) debtorDlg.showModal();
  }

function activeDebtorsForMonth(year, month) {
  const state = getState();
  const target = mk(year, month);
  const key = ymKey(year, month);
  return (state.debtors || []).filter(d => target >= mk(d.startYear, d.startMonth) && target <= mk(d.endYear, d.endMonth))
    .map(d => {
      const total = mk(d.endYear, d.endMonth) - mk(d.startYear, d.startMonth) + 1;
      const cur = mk(year, month) - mk(d.startYear, d.startMonth) + 1;
      const isPaid = d.paidHistory ? d.paidHistory[key] === true : d.status === 'pago';
      return Object.assign({}, d, {
        installmentIndex: cur,
        installmentTotal: total,
        status: isPaid ? 'pago' : 'pendente'
      });
    });
};

function reorderDebtors(sourceId, targetId) {
  if (sourceId === targetId) return;
  const state = getState();
  const sIdx = (state.debtors || []).findIndex(d => d.id === sourceId);
  const tIdx = (state.debtors || []).findIndex(d => d.id === targetId);
  if (sIdx !== -1 && tIdx !== -1) {
    const [moved] = state.debtors.splice(sIdx, 1);
    state.debtors.splice(tIdx, 0, moved);
    saveState();
    render();
    notify('Ordem dos devedores atualizada!');
  }
};

function moveDebtorToEnd(sourceId) {
  const state = getState();
  const sIdx = (state.debtors || []).findIndex(d => d.id === sourceId);
  if (sIdx !== -1) {
    const [moved] = state.debtors.splice(sIdx, 1);
    state.debtors.push(moved);
    saveState();
    render();
    notify('Ordem dos devedores atualizada!');
  }
};

function getDebtorPersonColor(name, index) {
  if (typeof index === 'number' && index >= 0) {
    return DEBTOR_COLORS_PALETTE[index % DEBTOR_COLORS_PALETTE.length];
  }
  let hash = 0;
  const str = String(name || '');
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const absIdx = Math.abs(hash);
  return DEBTOR_COLORS_PALETTE[absIdx % DEBTOR_COLORS_PALETTE.length];
};

function markDebtorPersonPaid(debtorName) {
  const state = getState();
  const y = state.year, m = state.month;
  const key = ymKey(y, m);
  let count = 0;

  activeDebtorsForMonth(y, m).forEach(d => {
    if (d.debtorName === debtorName && d.status !== 'pago') {
      const item = (state.debtors || []).find(x => x.id === d.id);
      if (item) {
        item.paidHistory = item.paidHistory || {};
        item.paidHistory[key] = true;
        count++;
      }
    }
  });

  if (count > 0) {
    saveState();
    render();
    notify(`Todas as cobranças de "${debtorName}" (${count}) foram marcadas como PAGAS!`, 'success');
  } else {
    notify(`Nenhuma cobrança pendente para "${debtorName}" neste mês.`, 'info');
  }
};

function markDebtorDestPaid(destName) {
  const state = getState();
  const y = state.year, m = state.month;
  const key = ymKey(y, m);
  let count = 0;

  activeDebtorsForMonth(y, m).forEach(d => {
    if ((d.destination || 'Gerais') === destName && d.status !== 'pago') {
      const item = (state.debtors || []).find(x => x.id === d.id);
      if (item) {
        item.paidHistory = item.paidHistory || {};
        item.paidHistory[key] = true;
        count++;
      }
    }
  });

  if (count > 0) {
    saveState();
    render();
    notify(`Todas as cobranças com destino "${destName}" (${count}) foram marcadas como PAGAS!`, 'success');
  } else {
    notify(`Nenhuma cobrança pendente para o destino "${destName}" neste mês.`, 'info');
  }
};

function renderDynamicDebtorChart(container, mapData, chartType, isDestination = false, totalBadgeSel = null) {
  if (!container) return;

  const entries = Object.entries(mapData).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, i) => s + i[1], 0);

  if (totalBadgeSel) {
    const badge = $(totalBadgeSel);
    if (badge) badge.textContent = `Total: ${currency(total)}`;
  }

  if (entries.length === 0 || total <= 0) {
    container.innerHTML = `<div style="text-align:center; padding:24px 8px; color:var(--muted); font-size:.8rem;">Nenhum valor a receber no período.</div>`;
    return;
  }

  const items = entries.map(([name, val], idx) => {
    let color, iconSvg;
    if (isDestination) {
      const meta = getDestMeta(name);
      color = meta.color || '#10B981';
      iconSvg = DEST_SVG_ICONS[meta.icon] || DEST_SVG_ICONS.card;
    } else {
      color = getDebtorPersonColor(name, idx);
      iconSvg = `<svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px; stroke:currentColor;"><circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>`;
    }
    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
    const btnClass = isDestination ? 'pay-debt-dest-btn' : 'pay-debt-person-btn';
    return { name, val, color, iconSvg, pct, btnClass };
  });

  if (chartType === 'column') {
    const maxVal = Math.max(...items.map(i => i.val), 1);
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px; padding:8px 0;">
        <div style="display:flex; align-items:flex-end; gap:10px; height:140px; padding:0 8px 4px 8px; border-bottom:1px dashed var(--line); overflow-x:auto;">
          ${items.map(item => {
            const colHeight = Math.max(14, Math.round((item.val / maxVal) * 100));
            return `
              <div style="display:flex; flex-direction:column; align-items:center; flex:1; min-width:55px; height:100%; justify-content:flex-end;" data-tooltip="${escapeHtml(item.name)}: ${currency(item.val)} (${item.pct}%)">
                <div class="num" style="font-size:.7rem; font-weight:800; margin-bottom:3px; text-align:center;">
                  ${currency(item.val)}
                  <div style="font-size:.62rem; color:var(--muted);">${item.pct}%</div>
                </div>
                <div style="width:100%; height:${colHeight}px; background:${item.color}; border-radius:6px 6px 0 0; transition:height .3s ease; box-shadow:0 2px 5px rgba(0,0,0,0.08);" title="${escapeHtml(item.name)}: ${currency(item.val)} (${item.pct}%)"></div>
                <div style="margin-top:6px; font-size:.72rem; font-weight:750; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; display:flex; align-items:center; justify-content:center; gap:4px;" title="${escapeHtml(item.name)}">
                  <span style="color:${item.color}; display:inline-flex;">${item.iconSvg}</span>
                  <span>${escapeHtml(item.name)}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:center;">
          ${items.map(item => {
            const quitTip = `Quitar: Marcar todas as cobranças de '${escapeHtml(item.name)}' como PAGAS`;
            return `
            <div style="display:inline-flex; align-items:center; gap:6px; background:var(--surface-2); padding:4px 8px; border-radius:8px; font-size:.74rem; border:1px solid var(--line);">
              <span style="width:8px; height:8px; border-radius:50%; background:${item.color}; flex-shrink:0;"></span>
              <strong>${escapeHtml(item.name)}:</strong>
              <span class="num">${currency(item.val)} (${item.pct}%)</span>
              <button type="button" class="icon-btn small ${item.btnClass}" style="width:22px; height:22px; font-size:.7rem; margin-left:3px;" data-target-name="${escapeHtml(item.name)}" data-tooltip="${quitTip}" aria-label="${quitTip}">
                ${ICONS.check}
              </button>
            </div>
          `;}).join('')}
        </div>
      </div>
    `;
  } else if (chartType === 'donut') {
    const size = 180;
    const strokeWidth = 28;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    let accumulatedPct = 0;

    const slicesSvg = items.map((item) => {
      const ratio = item.val / total;
      const strokeDasharray = `${ratio * circumference} ${circumference}`;
      const strokeDashoffset = -accumulatedPct * circumference;
      accumulatedPct += ratio;

      return `
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}"
          fill="transparent"
          stroke="${item.color}"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${strokeDasharray}"
          stroke-dashoffset="${strokeDashoffset}"
          transform="rotate(-90 ${size / 2} ${size / 2})"
          style="transition: stroke-dasharray .4s ease, stroke-dashoffset .4s ease;">
          <title>${escapeHtml(item.name)}: ${currency(item.val)} (${item.pct}%)</title>
        </circle>
      `;
    }).join('');

    container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-around; flex-wrap:wrap; gap:16px; padding:8px 0;">
        <div style="position:relative; width:${size}px; height:${size}px; flex-shrink:0;">
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            ${slicesSvg}
          </svg>
          <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; pointer-events:none;">
            <span style="font-size:.68rem; color:var(--muted); font-weight:700;">Total</span>
            <span class="num" style="font-size:.95rem; font-weight:800;">${currency(total)}</span>
            <span style="font-size:.65rem; color:var(--muted);">${items.length} itens</span>
          </div>
        </div>
        <div style="flex:1; min-width:200px; display:grid; gap:6px; max-height:220px; overflow-y:auto;">
          ${items.map(item => {
            const quitTip = `Quitar: Marcar todas as cobranças de '${escapeHtml(item.name)}' como PAGAS`;
            return `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:5px 8px; background:var(--surface-2); border-radius:8px; font-size:.76rem; gap:8px; border:1px solid var(--line);">
              <div style="display:flex; align-items:center; gap:6px; overflow:hidden;">
                <span style="width:8px; height:8px; border-radius:50%; background:${item.color}; flex-shrink:0;"></span>
                <span style="color:${item.color}; display:inline-flex;">${item.iconSvg}</span>
                <span style="font-weight:750; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.name)}</span>
              </div>
              <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                <span class="num" style="font-weight:800;">${currency(item.val)}</span>
                <span class="badge info" style="font-size:.68rem;">${item.pct}%</span>
                <button type="button" class="icon-btn small ${item.btnClass}" style="width:24px; height:24px; font-size:.72rem;" data-target-name="${escapeHtml(item.name)}" data-tooltip="${quitTip}" aria-label="${quitTip}">
                  ${ICONS.check}
                </button>
              </div>
            </div>
          `;}).join('')}
        </div>
      </div>
    `;
  } else {
    // Horizontal bars
    container.innerHTML = `
      <div class="dest-bars" style="display:grid; gap:8px;">
        ${items.map(item => {
          const quitTip = `Quitar: Marcar todas as cobranças de '${escapeHtml(item.name)}' como PAGAS`;
          return `
          <div class="dest-bar-item" style="grid-template-columns: 120px 1fr auto auto; gap: 10px; align-items: center;">
            <div style="display:flex; align-items:center; gap:6px; overflow:hidden;">
              <span style="width:18px; height:18px; border-radius:5px; background:${item.color}22; color:${item.color}; display:grid; place-items:center; flex-shrink:0;">${item.iconSvg}</span>
              <span class="dest-name" data-tooltip="${escapeHtml(item.name)}" aria-label="${escapeHtml(item.name)}"><strong>${escapeHtml(item.name)}</strong></span>
            </div>
            <div class="dest-track" style="height:10px; background:var(--surface-2); border-radius:999px; overflow:hidden;">
              <div class="dest-fill" style="width:${item.pct}%; background:${item.color}; border-radius:999px; height:100%; transition:width .3s ease;"></div>
            </div>
            <span class="dest-val num" style="font-size:.8rem;"><strong>${currency(item.val)}</strong> <small style="color:var(--muted)">(${item.pct}%)</small></span>
            <button type="button" class="icon-btn small ${item.btnClass}" style="width:24px; height:24px; font-size:.75rem;" data-target-name="${escapeHtml(item.name)}" data-tooltip="${quitTip}" aria-label="${quitTip}">
              ${ICONS.check}
            </button>
          </div>
        `;}).join('')}
      </div>
    `;
  }

  // Attach payment check button listeners
  container.querySelectorAll('.pay-debt-person-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-target-name');
      if (name) markDebtorPersonPaid(name);
    });
  });

  container.querySelectorAll('.pay-debt-dest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dest = btn.getAttribute('data-target-name');
      if (dest) markDebtorDestPaid(dest);
    });
  });
};

function renderDebtorCharts() {
  const state = getState();
  const personCard = $('#debtorPersonCard');
  const destCard = $('#debtorDestCard');
  const grid = $('#debtorChartsGrid');
  const isPersonCollapsed = !!state.collapsedSections?.debtorPerson;
  const isDestCollapsed = !!state.collapsedSections?.debtorDest;
  const isSimp = !!state.simplifiedView;

  if (personCard) personCard.hidden = isSimp || isPersonCollapsed;
  if (destCard) destCard.hidden = isSimp || isDestCollapsed;
  if (grid) grid.hidden = isSimp || (isPersonCollapsed && isDestCollapsed);

  if (personCard && destCard) {
    if (!isPersonCollapsed && isDestCollapsed) {
      personCard.classList.add('full-width');
      destCard.classList.remove('full-width');
    } else if (isPersonCollapsed && !isDestCollapsed) {
      destCard.classList.add('full-width');
      personCard.classList.remove('full-width');
    } else {
      personCard.classList.remove('full-width');
      destCard.classList.remove('full-width');
    }
  }

  const togglePersonBtn = $('#toggleDebtorPersonBtn');
  if (togglePersonBtn) togglePersonBtn.classList.toggle('active', !isPersonCollapsed);
  const toggleDestBtn = $('#toggleDebtorDestBtn');
  if (toggleDestBtn) toggleDestBtn.classList.toggle('active', !isDestCollapsed);

  const personType = state.debtorPersonChartType || 'bar';
  $$('.debtor-person-chart-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.debtorPersonChartType === personType);
  });

  const destType = state.debtorDestChartType || 'bar';
  $$('.debtor-dest-chart-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.debtorDestChartType === destType);
  });

  if (isSimp || (isPersonCollapsed && isDestCollapsed)) return;

  const rawDebtors = activeDebtorsForMonth(state.year, state.month);

  if (!isPersonCollapsed) {
    const personMap = {};
    rawDebtors.forEach(d => {
      personMap[d.debtorName] = (personMap[d.debtorName] || 0) + Number(d.amount);
    });
    const personContainer = $('#debtorPersonChartContent') || $('#debtorPersonBars');
    renderDynamicDebtorChart(personContainer, personMap, personType, false, '#debtorPersonTotal');
  }

  if (!isDestCollapsed) {
    const destMap = {};
    rawDebtors.forEach(d => {
      destMap[d.destination || 'Gerais'] = (destMap[d.destination || 'Gerais'] || 0) + Number(d.amount);
    });
    const destContainer = $('#debtorDestChartContent') || $('#debtorDestBars');
    renderDynamicDebtorChart(destContainer, destMap, destType, true, '#debtorDestTotal');
  }
};

function updateDebtorCharts() {
  renderDebtorCharts();
};

function toggleDebtorPerson() {
  // window.toggleDebtorPerson bridge assigned below
  const state = getState();
  state.collapsedSections = state.collapsedSections || {};
  state.collapsedSections.debtorPerson = !state.collapsedSections.debtorPerson;
  saveState();
  render();
};

function toggleDebtorDest() {
  // window.toggleDebtorDest bridge assigned below
  const state = getState();
  state.collapsedSections = state.collapsedSections || {};
  state.collapsedSections.debtorDest = !state.collapsedSections.debtorDest;
  saveState();
  render();
};

function toggleDebtorStatus(id) {
    toggleExpenseStatus("debtor", id);
  }

  function markAllDebtorsPaid() {
    markAllSectionPaid("debtors");
  }

  function renderDebtorsTab() {
  const state = getState();
  const y = state.year, m = state.month;
  const rawDebtors = activeDebtorsForMonth(y, m);

  let grandTotalDebt = 0;
  let grandPaidDebt = 0;

  (state.debtors || []).forEach(d => {
    const totalMonths = mk(d.endYear, d.endMonth) - mk(d.startYear, d.startMonth) + 1;
    const totalValue = Number(d.amount) * totalMonths;
    grandTotalDebt += totalValue;

    if (d.paidHistory) {
      Object.values(d.paidHistory).forEach(p => { if (p === true) grandPaidDebt += Number(d.amount); });
    }
  });

  const grandRemainingDebt = grandTotalDebt - grandPaidDebt;

  $('#debtorMetrics').innerHTML = `
      <div class="metric">
        <div class="label">Montante Total em Dívidas</div>
        <div class="value num negative">${currency(grandTotalDebt)}</div>
        <div class="sub">Soma acumulada de todos os acordos</div>
      </div>
      <div class="metric">
        <div class="label">Total Já Recebido</div>
        <div class="value num positive">${currency(grandPaidDebt)}</div>
        <div class="sub">Quitado pelos devedores</div>
      </div>
      <div class="metric">
        <div class="label">Restam a Receber</div>
        <div class="value num warning">${currency(grandRemainingDebt)}</div>
        <div class="sub">Saldo devedor restante</div>
      </div>
      <div class="metric">
        <div class="label">A Receber no Mês Atual</div>
        <div class="value num positive">${currency(rawDebtors.reduce((s, d) => s + Number(d.amount), 0))}</div>
        <div class="sub">Parcelas vigentes de ${MONTH_ABBR[m - 1]}/${y}</div>
      </div>
    `;

  renderDebtorCharts();

  const searchInput = $('#debtorsSearchInput');
  const statusFilterEl = $('#debtorsStatusFilter');
  const query = normalizeSearchText(searchInput?.value || '');
  const statusFilter = statusFilterEl?.value || 'all';

  const debtors = rawDebtors.filter(d => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (query) {
      const searchTarget = normalizeSearchText(`${d.debtorName || ''} ${d.title || ''} ${d.description || ''} ${d.destination || ''}`);
      if (!searchTarget.includes(query)) return false;
    }
    return true;
  });

  const rows = debtors.map(d => {
    const totalDebt = Number(d.amount) * Number(d.installmentTotal);
    return buildEntryRow({
      id: d.id, type: 'debtor', title: `${d.debtorName} • ${d.title}`,
      tags: [
        `Parcela ${d.installmentIndex}/${d.installmentTotal}`,
        `Total: ${currency(totalDebt)}`,
        d.countInTotal ? 'Soma na Renda do Mês' : null,
        d.description || 'Sem obs'
      ].filter(Boolean),
      amount: d.amount, status: d.status, destination: d.destination,
      onClickToggleStatus: () => toggleExpenseStatus('debtor', d.id, d.status),
      onClickEdit: () => openDebtorDialog('edit', d.id)
    });
  });

  const listContainer = $('#listDebtors');
  const sumEl = $('#sumDebtors');
  const filteredTotal = debtors.reduce((s, d) => s + Number(d.amount), 0);
  if (sumEl) sumEl.textContent = currency(filteredTotal);

  if (listContainer) {
    listContainer.innerHTML = '';
    if (rows.length === 0) {
      const emptyMsg = query || statusFilter !== 'all'
        ? 'Nenhum devedor encontrado para esta busca.'
        : 'Nenhum devedor registrado para este mês.';
      listContainer.innerHTML = `<div class="empty">${emptyMsg}</div>`;
    } else {
      rows.forEach(r => listContainer.appendChild(r));
    }
  }
  if (typeof updateMarkAllButtonState === 'function') {
    updateMarkAllButtonState('#markAllDebtorsPaidBtn', rawDebtors);
  }
};


      let debtorsTableSort = { key: 'totalDebt', asc: false };

      function updateDebtorsSortIcons() {
        const keys = ['debtorName', 'destination', 'amount', 'months', 'totalDebt', 'paidAmount', 'remainingDebt', 'progress', 'period'];
        keys.forEach(k => {
          const iconEl = $(`#sortIconDeb_${k}`);
          const thEl = iconEl ? iconEl.closest('.sortable-th') : null;
          if (iconEl) {
            if (debtorsTableSort.key === k) {
              iconEl.textContent = debtorsTableSort.asc ? '▲' : '▼';
              if (thEl) thEl.classList.add('active-sort');
            } else {
              iconEl.textContent = '↕';
              if (thEl) thEl.classList.remove('active-sort');
            }
          }
        });
      }

      function renderDebtorsTotalsTab() {
  const state = getState();
        let grandTotalDebt = 0;
        let grandPaidDebt = 0;
        let grandRemainingDebt = 0;
        let activeAgreementsCount = 0;

        const items = state.debtors.map(d => {
          const totalMonths = mk(d.endYear, d.endMonth) - mk(d.startYear, d.startMonth) + 1;
          const totalDebt = Number(d.amount) * totalMonths;
          grandTotalDebt += totalDebt;

          let paidMonthsCount = 0;
          if (d.paidHistory) {
            Object.values(d.paidHistory).forEach(p => { if (p === true) paidMonthsCount++; });
          }

          const paidAmount = paidMonthsCount * Number(d.amount);
          const remainingDebt = Math.max(0, totalDebt - paidAmount);
          grandPaidDebt += paidAmount;
          grandRemainingDebt += remainingDebt;

          const isCompleted = paidMonthsCount >= totalMonths;
          if (!isCompleted) activeAgreementsCount++;

          const pctPaid = totalDebt > 0 ? Math.min(100, Math.round((paidAmount / totalDebt) * 100)) : 0;

          return {
            id: d.id,
            debtorName: d.debtorName,
            title: d.title,
            destination: d.destination || 'Nubank',
            amount: Number(d.amount),
            totalMonths,
            paidMonthsCount,
            totalDebt,
            paidAmount,
            remainingDebt,
            isCompleted,
            pctPaid,
            startMonth: d.startMonth,
            startYear: d.startYear,
            endMonth: d.endMonth,
            endYear: d.endYear
          };
        });

        $('#debtorsTotalsMetrics').innerHTML = `
      <div class="metric">
        <div class="label">Montante Global em Dívidas</div>
        <div class="value num negative">${currency(grandTotalDebt)}</div>
        <div class="sub">Soma acumulada de todos os acordos</div>
      </div>
      <div class="metric">
        <div class="label">Total Já Quitado</div>
        <div class="value num positive">${currency(grandPaidDebt)}</div>
        <div class="sub">Valores recebidos até o momento</div>
      </div>
      <div class="metric">
        <div class="label">Saldo Global a Receber</div>
        <div class="value num warning">${currency(grandRemainingDebt)}</div>
        <div class="sub">Total de parcelas futuras</div>
      </div>
      <div class="metric">
        <div class="label">Acordos em Aberto</div>
        <div class="value num info">${activeAgreementsCount} <small style="font-size:.8rem; color:var(--muted)">de ${items.length}</small></div>
        <div class="sub">Devedores ativos</div>
      </div>
    `;

        // Populate top filter bar selects while preserving selection
        const debtorSel = $('#debtorsTotalsDebtorFilter');
        if (debtorSel) {
          const currentVal = debtorSel.value || 'all';
          const uniqueDebtors = [...new Set(state.debtors.map(d => d.debtorName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
          debtorSel.innerHTML = `<option value="all">Todos os Devedores</option>` + uniqueDebtors.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
          debtorSel.value = uniqueDebtors.includes(currentVal) ? currentVal : 'all';
        }

        const destSel = $('#debtorsTotalsDestFilter');
        if (destSel) {
          const currentVal = destSel.value || 'all';
          const uniqueDests = [...new Set((state.destinations || []).map(d => d.name).concat(items.map(i => i.destination)).filter(Boolean))].sort();
          destSel.innerHTML = `<option value="all">Todos os Destinos</option>` + uniqueDests.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
          destSel.value = uniqueDests.includes(currentVal) ? currentVal : 'all';
        }

        const query = normalizeSearchText($('#debtorsTotalsSearchInput')?.value || '');
        const debtorFilter = $('#debtorsTotalsDebtorFilter')?.value || 'all';
        const destFilter = $('#debtorsTotalsDestFilter')?.value || 'all';
        const statusFilter = $('#debtorsTotalsStatusFilter')?.value || 'all';

        const filtered = items.filter(item => {
          if (debtorFilter !== 'all' && item.debtorName !== debtorFilter) return false;
          if (destFilter !== 'all' && item.destination !== destFilter) return false;
          if (statusFilter === 'active' && item.isCompleted) return false;
          if (statusFilter === 'completed' && !item.isCompleted) return false;
          if (query) {
            const searchTarget = normalizeSearchText(`${item.debtorName || ''} ${item.title || ''} ${item.destination || ''}`);
            if (!searchTarget.includes(query)) return false;
          }
          return true;
        });

        // Apply interactive column sort
        const dir = debtorsTableSort.asc ? 1 : -1;
        filtered.sort((a, b) => {
          let diff = 0;
          switch (debtorsTableSort.key) {
            case 'debtorName':
              diff = a.debtorName.localeCompare(b.debtorName) || a.title.localeCompare(b.title);
              break;
            case 'destination':
              diff = (a.destination || '').localeCompare(b.destination || '');
              break;
            case 'amount':
              diff = a.amount - b.amount;
              break;
            case 'months':
              diff = a.totalMonths - b.totalMonths || a.paidMonthsCount - b.paidMonthsCount;
              break;
            case 'totalDebt':
              diff = a.totalDebt - b.totalDebt;
              break;
            case 'paidAmount':
              diff = a.paidAmount - b.paidAmount;
              break;
            case 'remainingDebt':
              diff = a.remainingDebt - b.remainingDebt;
              break;
            case 'progress':
              diff = a.pctPaid - b.pctPaid;
              break;
            case 'period':
              diff = mk(a.startYear, a.startMonth) - mk(b.startYear, b.startMonth);
              break;
            default:
              diff = a.totalDebt - b.totalDebt;
          }
          return diff * dir;
        });

        updateDebtorsSortIcons();

        const sumFiltered = filtered.reduce((s, i) => s + i.totalDebt, 0);
        $('#sumDebtorsGrandTotal').textContent = `Total: ${currency(sumFiltered)}`;

        const tbody = $('#debtorsTotalsTableBody');
        if (!tbody) return;

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:24px; color:var(--muted)">Nenhum contrato de devedor encontrado para os filtros selecionados.</td></tr>`;
          return;
        }

        tbody.innerHTML = filtered.map(item => {
          const destMeta = getDestMeta(item.destination);
          const iconSvg = DEST_SVG_ICONS[destMeta.icon] || DEST_SVG_ICONS.card;
          return `
        <tr>
          <td><strong>${escapeHtml(item.debtorName)}</strong> — ${escapeHtml(item.title)}</td>
          <td>
            <span class="tag dest" style="background:${destMeta.color}22; color:${destMeta.color}; border:1px solid ${destMeta.color}44;">
              ${iconSvg} ${escapeHtml(item.destination)}
            </span>
          </td>
          <td class="num">${currency(item.amount)}</td>
          <td><span class="tag">${item.paidMonthsCount} de ${item.totalMonths}x</span></td>
          <td><strong class="num negative">${currency(item.totalDebt)}</strong></td>
          <td class="num positive">${currency(item.paidAmount)}</td>
          <td class="num warning">${currency(item.remainingDebt)}</td>
          <td style="min-width:120px;">
            <div class="dest-track" style="margin-bottom:2px;">
              <div class="dest-fill" style="width:${item.pctPaid}%; background:${item.isCompleted ? 'var(--success)' : 'var(--brand)'};"></div>
            </div>
            <small style="font-weight:800; color:var(--muted);">${item.pctPaid}% ${item.isCompleted ? '(Quitado)' : ''}</small>
          </td>
          <td><small>${MONTH_ABBR[(item.startMonth || 1) - 1]}/${item.startYear} a ${MONTH_ABBR[(item.endMonth || 1) - 1]}/${item.endYear}</small></td>
          <td>
            <button type="button" class="icon-btn small edit-debt-btn" data-debt-id="${item.id}" data-tooltip="Editar Devedor" aria-label="Editar Devedor">${ICONS.edit}</button>
          </td>
        </tr>
      `;
        }).join('');

        $$('.edit-debt-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-debt-id');
            if (id) openDebtorDialog('edit', id);
          });
        });
      }

      $$('.sortable-th[data-sort-table="debtors"]').forEach(th => {
        th.addEventListener('click', () => {
          const key = th.getAttribute('data-sort-key');
          if (!key) return;
          if (debtorsTableSort.key === key) {
            debtorsTableSort.asc = !debtorsTableSort.asc;
          } else {
            debtorsTableSort.key = key;
            debtorsTableSort.asc = (key === 'debtorName' || key === 'destination');
          }
          renderDebtorsTotalsTab();
        });
      });

      // Listeners de busca e filtro da visão mensal de devedores
      $('#debtorsSearchInput')?.addEventListener('input', () => renderDebtorsTab());
      $('#debtorsSearchInput')?.addEventListener('change', () => renderDebtorsTab());
      $('#debtorsStatusFilter')?.addEventListener('change', () => renderDebtorsTab());

      // Listeners de busca e filtro da visão de totais de devedores
      $('#debtorsTotalsSearchInput')?.addEventListener('input', () => renderDebtorsTotalsTab());
      $('#debtorsTotalsSearchInput')?.addEventListener('change', () => renderDebtorsTotalsTab());
      $('#debtorsTotalsDebtorFilter')?.addEventListener('change', () => renderDebtorsTotalsTab());
      $('#debtorsTotalsDestFilter')?.addEventListener('change', () => renderDebtorsTotalsTab());
      $('#debtorsTotalsStatusFilter')?.addEventListener('change', () => renderDebtorsTotalsTab());

      /* =============================================================
         GRÁFICOS DINÂMICOS DE DEVEDORES (PESSOA E DESTINO)
         ============================================================= */


      const toggleDebtorPersonBtn = $('#toggleDebtorPersonBtn');
      if (toggleDebtorPersonBtn) toggleDebtorPersonBtn.addEventListener('click', toggleDebtorPerson);
      const closeDebtorPersonBtn = $('#closeDebtorPersonBtn');
      if (closeDebtorPersonBtn) closeDebtorPersonBtn.addEventListener('click', toggleDebtorPerson);

      const toggleDebtorDestBtn = $('#toggleDebtorDestBtn');
      if (toggleDebtorDestBtn) toggleDebtorDestBtn.addEventListener('click', toggleDebtorDest);
      const closeDebtorDestBtn = $('#closeDebtorDestBtn');
      if (closeDebtorDestBtn) closeDebtorDestBtn.addEventListener('click', toggleDebtorDest);

      const debMonthlyBtn = $('#debtorsMonthlyTabBtn');
      if (debMonthlyBtn) {
        debMonthlyBtn.addEventListener('click', () => {
          const state = getState();
      state.debtorsSubView = 'monthly'; if (typeof saveLocalState === 'function') { saveLocalState(); } else { saveState('subview-toggle'); } render();
        });
      }

      const debTotalsBtn = $('#debtorsTotalsTabBtn');
      if (debTotalsBtn) {
        debTotalsBtn.addEventListener('click', () => {
          const state = getState();
      state.debtorsSubView = 'totals'; if (typeof saveLocalState === 'function') { saveLocalState(); } else { saveState('subview-toggle'); } render();
        });
      }


window.renderDebtorsTotalsTab = renderDebtorsTotalsTab;

window.toggleDebtorPerson = toggleDebtorPerson;
window.toggleDebtorDest = toggleDebtorDest;

window.activeDebtorsForMonth = activeDebtorsForMonth;
window.reorderDebtors = reorderDebtors;
window.moveDebtorToEnd = moveDebtorToEnd;
window.getDebtorPersonColor = getDebtorPersonColor;
window.markDebtorPersonPaid = markDebtorPersonPaid;
window.markDebtorDestPaid = markDebtorDestPaid;
window.renderDynamicDebtorChart = renderDynamicDebtorChart;
window.renderDebtorCharts = renderDebtorCharts;
window.updateDebtorCharts = updateDebtorCharts;
window.renderDebtorsTab = renderDebtorsTab;
  window.openDebtorDialog = openDebtorDialog;

    function initDebtorsListeners() {
    $$('.debtor-person-chart-btn')?.forEach(btn => {
      btn.addEventListener('click', () => {
        const state = getState();
        const type = btn.dataset.debtorPersonChartType;
        if (type) {
          state.debtorPersonChartType = type;
          saveState();
          renderDebtorCharts();
        }
      });
    });

    $$('.debtor-dest-chart-btn')?.forEach(btn => {
      btn.addEventListener('click', () => {
        const state = getState();
        const type = btn.dataset.debtorDestChartType;
        if (type) {
          state.debtorDestChartType = type;
          saveState();
          renderDebtorCharts();
        }
      });
    });

    ['#debtorStartMonth', '#debtorStartYear', '#debtorEndMonth', '#debtorEndYear'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('change', updateDebtorInstallments);
      if (el) el.addEventListener('input', updateDebtorInstallments);
    });

    const newDebtorBtn = $('#newDebtorBtn');
    if (newDebtorBtn) newDebtorBtn.addEventListener('click', () => openDebtorDialog('new'));

    $('#debtorForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const state = getState();
      const debtorDlg = $('#debtorDialog');
      const title = $('#debtorTitle')?.value.trim() || 'Cobrança';
      const name = $('#debtorName')?.value.trim() || '';
      const amount = Number($('#debtorAmount')?.value) || 0;
      const destination = $('#debtorDestination')?.value || (state.destinations[0] || {}).name || 'Nubank';
      const sm = Number($('#debtorStartMonth')?.value) || state.month || 1;
      const sy = Number($('#debtorStartYear')?.value) || state.year || 2026;
      const em = Number($('#debtorEndMonth')?.value) || state.month || 1;
      const ey = Number($('#debtorEndYear')?.value) || state.year || 2026;
      const status = $('#debtorStatus')?.value || 'pendente';
      const countInTotal = $('#debtorCountInTotal')?.checked !== false;
      const includeInSimulation = $('#debtorIncludeInSimulation')?.checked !== false;
      const description = $('#debtorDescription')?.value.trim() || '';

      if (!name || amount <= 0) {
        notify('Preencha um nome e valor válidos para o devedor.', 'error');
        return;
      }
      if (mk(ey, em) < mk(sy, sm)) {
        notify('O mês/ano final não pode ser anterior ao inicial.', 'error');
        return;
      }

      state.debtors = state.debtors || [];
      const installments = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);

      if (debtorDlgId) {
        const debtor = state.debtors.find(x => x.id === debtorDlgId);
        if (debtor) {
          debtor.title = title;
          debtor.debtorName = name;
          debtor.name = name;
          debtor.amount = amount;
          debtor.destination = destination;
          debtor.startMonth = sm;
          debtor.startYear = sy;
          debtor.endMonth = em;
          debtor.endYear = ey;
          debtor.status = status;
          debtor.installments = installments;
          debtor.countInTotal = countInTotal;
          debtor.includeInSimulation = includeInSimulation;
          debtor.description = description;
        }
      } else {
        state.debtors.push({
          id: uid(),
          title,
          debtorName: name,
          name,
          amount,
          destination,
          startMonth: sm,
          startYear: sy,
          endMonth: em,
          endYear: ey,
          status,
          installments,
          countInTotal,
          includeInSimulation,
          description,
          paidHistory: {}
        });
      }

      saveState();
      if (debtorDlg) debtorDlg.close();
      render();
      notify('Devedor salvo com sucesso!', 'success');
    });

    $('#deleteDebtorBtn')?.addEventListener('click', () => {
      const state = getState();
      const debtorDlg = $('#debtorDialog');
      if (!debtorDlgId) return;
      if (!confirm('Excluir este devedor?')) return;
      state.debtors = (state.debtors || []).filter(x => x.id !== debtorDlgId);
      saveState();
      if (debtorDlg) debtorDlg.close();
      render();
      notify('Devedor excluído!', 'info');
    });
  }

  // Bridges publicas autorizadas
  window.activeDebtorsForMonth = activeDebtorsForMonth;
  window.reorderDebtors = reorderDebtors;
  window.moveDebtorToEnd = moveDebtorToEnd;
  window.toggleDebtorStatus = toggleDebtorStatus;
  window.markAllDebtorsPaid = markAllDebtorsPaid;
  window.renderDebtorsTab = renderDebtorsTab;
  window.renderDebtorsTotalsTab = renderDebtorsTotalsTab;

  // Inicializacao sincrona dos listeners de devedores
  try {
    initDebtorsListeners();
  } catch (err) {
    console.error('Erro ao inicializar listeners de devedores:', err);
  }
})();
