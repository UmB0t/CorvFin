/**
 * Finanças Pro - Módulo de Devedores & Contratos a Receber
 */
const DebtorsModule = (() => {
  const DEBTOR_COLORS = [
    '#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];

  function uid() { return 'deb_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function mk(y, m) { return window.mk ? window.mk(y, m) : Number(y) * 12 + Number(m); }
  function ymKey(y, m) { return window.ymKey ? window.ymKey(y, m) : `${y}-${String(m).padStart(2, '0')}`; }
  function currency(val) { return window.currency ? window.currency(val) : (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  function getActiveDebtorsForMonth(year, month) {
    if (!window.FP_STATE || !window.FP_STATE.debtors) return [];
    const target = mk(year, month);
    const key = ymKey(year, month);

    return window.FP_STATE.debtors
      .filter(d => target >= mk(d.startYear, d.startMonth) && target <= mk(d.endYear, d.endMonth))
      .map(d => {
        const total = mk(d.endYear, d.endMonth) - mk(d.startYear, d.startMonth) + 1;
        const idx = target - mk(d.startYear, d.startMonth) + 1;
        const isPaid = d.paidHistory ? d.paidHistory[key] === true : d.status === 'pago';
        return Object.assign({}, d, {
          installmentIndex: idx,
          installmentTotal: total,
          status: isPaid ? 'pago' : 'pendente'
        });
      });
  }

  // Render KPI Metrics
  function renderMetrics() {
    const container = document.getElementById('debtorsMetrics');
    if (!container) return;

    const y = window.FP_STATE.year;
    const m = window.FP_STATE.month;
    const monthDebtors = getActiveDebtorsForMonth(y, m);

    let grandTotalDebt = 0;
    let grandPaidDebt = 0;

    (window.FP_STATE.debtors || []).forEach(d => {
      const totalMonths = mk(d.endYear, d.endMonth) - mk(d.startYear, d.startMonth) + 1;
      const totalValue = Number(d.amount) * totalMonths;
      grandTotalDebt += totalValue;

      if (d.paidHistory) {
        Object.values(d.paidHistory).forEach(p => {
          if (p === true) grandPaidDebt += Number(d.amount);
        });
      }
    });

    const grandRemainingDebt = grandTotalDebt - grandPaidDebt;
    const monthReceivable = monthDebtors.reduce((s, d) => s + (Number(d.amount) || 0), 0);

    container.innerHTML = `
      <div class="metrics">
        <div class="metric">
          <div class="label">Montante Global em Dívidas</div>
          <div class="value num negative">${currency(grandTotalDebt)}</div>
          <div class="sub">Acordos totais vigentes</div>
        </div>
        <div class="metric">
          <div class="label">Total Já Quitado</div>
          <div class="value num positive">${currency(grandPaidDebt)}</div>
          <div class="sub">Valores já recebidos</div>
        </div>
        <div class="metric">
          <div class="label">Saldo Global a Receber</div>
          <div class="value num warning">${currency(grandRemainingDebt)}</div>
          <div class="sub">Parcelas futuras a receber</div>
        </div>
        <div class="metric">
          <div class="label">A Receber no Mês (${window.MONTH_ABBR[m - 1]}/${y})</div>
          <div class="value num positive">${currency(monthReceivable)}</div>
          <div class="sub">${monthDebtors.length} cobrança(s) no mês</div>
        </div>
      </div>
    `;
  }

  // Update & Render Debtor Charts
  function updateDebtorCharts() {
    const grid = document.getElementById('debtorChartsGrid');
    if (!grid) return;

    const isCollapsed = window.FP_STATE.collapsedSections?.debtorCharts === true;
    const toggleBtn = document.getElementById('toggleDebtorChartsBtn');

    if (toggleBtn) {
      toggleBtn.innerHTML = isCollapsed ? '▶ Expandir Gráficos' : '▼ Recolher Gráficos';
    }

    if (isCollapsed) {
      grid.style.display = 'none';
      return;
    }
    grid.style.display = 'grid';

    const y = window.FP_STATE.year;
    const m = window.FP_STATE.month;
    const monthDebtors = getActiveDebtorsForMonth(y, m);
    const totalMonth = monthDebtors.reduce((s, d) => s + Number(d.amount || 0), 0);

    // 1. Por Devedor
    const debtorMap = {};
    monthDebtors.forEach(d => {
      const name = d.debtorName || 'Devedor';
      debtorMap[name] = (debtorMap[name] || 0) + Number(d.amount || 0);
    });

    const debtorEntries = Object.entries(debtorMap).sort((a, b) => b[1] - a[1]);
    const maxDebtorVal = debtorEntries[0] ? debtorEntries[0][1] : 1;

    // 2. Por Destino de Recebimento
    const destMap = {};
    monthDebtors.forEach(d => {
      const dest = d.destination || 'Gerais';
      destMap[dest] = (destMap[dest] || 0) + Number(d.amount || 0);
    });
    const destEntries = Object.entries(destMap).sort((a, b) => b[1] - a[1]);
    const maxDestVal = destEntries[0] ? destEntries[0][1] : 1;

    grid.innerHTML = `
      <div class="card chart-card">
        <div class="chart-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 class="chart-title" style="font-size:0.95rem; font-weight:800;">Cobranças por Devedor</h3>
          <span class="badge info">${currency(totalMonth)}</span>
        </div>
        <div style="display:grid; gap:8px;">
          ${debtorEntries.length === 0 ? '<div class="empty" style="color:var(--muted); font-size:0.82rem;">Sem devedores para este mês.</div>' : debtorEntries.map(([name, val], idx) => {
            const color = DEBTOR_COLORS[idx % DEBTOR_COLORS.length];
            const pct = totalMonth > 0 ? Math.round((val / totalMonth) * 100) : 0;
            const barW = Math.round((val / maxDebtorVal) * 100);
            return `
              <div style="display:flex; flex-direction:column; gap:3px;">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                  <span><strong>${escapeHtml(name)}</strong></span>
                  <span class="num">${currency(val)} (${pct}%)</span>
                </div>
                <div class="dest-track" style="height:8px; background:var(--surface-2); border-radius:999px; overflow:hidden;">
                  <div style="width:${barW}%; background:${color}; height:100%; border-radius:999px;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="card chart-card">
        <div class="chart-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 class="chart-title" style="font-size:0.95rem; font-weight:800;">Destino de Recebimento</h3>
          <span class="badge success">${destEntries.length} destinos</span>
        </div>
        <div style="display:grid; gap:8px;">
          ${destEntries.length === 0 ? '<div class="empty" style="color:var(--muted); font-size:0.82rem;">Sem lançamentos ativos.</div>' : destEntries.map(([dest, val], idx) => {
            const color = DEBTOR_COLORS[(idx + 3) % DEBTOR_COLORS.length];
            const pct = totalMonth > 0 ? Math.round((val / totalMonth) * 100) : 0;
            const barW = Math.round((val / maxDestVal) * 100);
            return `
              <div style="display:flex; flex-direction:column; gap:3px;">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                  <span><strong>${escapeHtml(dest)}</strong></span>
                  <span class="num">${currency(val)} (${pct}%)</span>
                </div>
                <div class="dest-track" style="height:8px; background:var(--surface-2); border-radius:999px; overflow:hidden;">
                  <div style="width:${barW}%; background:${color}; height:100%; border-radius:999px;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Render Table / List
  function renderList() {
    const container = document.getElementById('debtorsListContainer');
    if (!container) return;

    const y = window.FP_STATE.year;
    const m = window.FP_STATE.month;
    const monthDebtors = getActiveDebtorsForMonth(y, m);

    if (monthDebtors.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:32px; color:var(--muted);">
          <p>Nenhuma cobrança ativa de devedores em <strong>${window.MONTH_NAMES[m - 1]}/${y}</strong>.</p>
          <button type="button" class="btn primary small" id="btnAddDebtorEmpty" style="margin-top:12px;">+ Novo Contrato / Devedor</button>
        </div>
      `;
      document.getElementById('btnAddDebtorEmpty')?.addEventListener('click', () => openModal());
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
          <h3 style="font-size:1.1rem; font-weight:800;">Cobranças do Mês (${monthDebtors.length})</h3>
          <button type="button" class="btn primary small" id="btnAddDebtorTop">+ Novo Devedor</button>
        </div>

        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--line); color:var(--muted); font-size:0.75rem; text-transform:uppercase;">
                <th style="padding:10px 8px;">Status</th>
                <th style="padding:10px 8px;">Devedor & Título</th>
                <th style="padding:10px 8px;">Parcela</th>
                <th style="padding:10px 8px;">Destino</th>
                <th style="padding:10px 8px;">Soma na Renda</th>
                <th style="padding:10px 8px; text-align:right;">Valor Mensal</th>
                <th style="padding:10px 8px; text-align:center;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${monthDebtors.map(item => {
                const isPaid = item.status === 'pago';
                const totalContract = Number(item.amount) * Number(item.installmentTotal);
                return `
                  <tr style="border-bottom:1px solid var(--line);">
                    <td style="padding:10px 8px;">
                      <button type="button" class="btn small ${isPaid ? 'primary' : 'soft'}" data-toggle-debtor-paid="${item.id}" style="padding:4px 8px; font-size:0.75rem;">
                        ${isPaid ? '✓ Quitado' : 'Pendente'}
                      </button>
                    </td>
                    <td style="padding:10px 8px;">
                      <strong>${escapeHtml(item.debtorName)}</strong> — ${escapeHtml(item.title)}
                      <div style="font-size:0.75rem; color:var(--muted);">Total do acordo: ${currency(totalContract)}</div>
                    </td>
                    <td style="padding:10px 8px;"><span class="badge info">${item.installmentIndex} de ${item.installmentTotal}</span></td>
                    <td style="padding:10px 8px;">${escapeHtml(item.destination || 'Gerais')}</td>
                    <td style="padding:10px 8px;">${item.countInTotal ? '<span class="badge success">Sim</span>' : '<span class="tag">Não</span>'}</td>
                    <td style="padding:10px 8px; text-align:right; font-weight:800;" class="num positive">${currency(item.amount)}</td>
                    <td style="padding:10px 8px; text-align:center;">
                      <button type="button" class="icon-btn small" data-edit-debtor="${item.id}" title="Editar">✎</button>
                      <button type="button" class="icon-btn small" data-del-debtor="${item.id}" title="Excluir" style="color:var(--danger);">✕</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btnAddDebtorTop')?.addEventListener('click', () => openModal());

    // Toggle Paid
    container.querySelectorAll('[data-toggle-debtor-paid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-toggle-debtor-paid');
        const item = window.FP_STATE.debtors.find(d => d.id === id);
        if (item) {
          const key = ymKey(y, m);
          item.paidHistory = item.paidHistory || {};
          item.paidHistory[key] = !item.paidHistory[key];
          window.saveFinanceState();
          render();
          notify('Status de pagamento atualizado!');
        }
      });
    });

    // Edit
    container.querySelectorAll('[data-edit-debtor]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-debtor');
        openModal(id);
      });
    });

    // Delete
    container.querySelectorAll('[data-del-debtor]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-debtor');
        if (confirm('Deseja excluir este contrato de devedor?')) {
          window.FP_STATE.debtors = window.FP_STATE.debtors.filter(d => d.id !== id);
          window.saveFinanceState();
          render();
          notify('Devedor removido com sucesso!');
        }
      });
    });
  }

  // Modal Dialog Add/Edit
  function openModal(editingId = null) {
    let modal = document.getElementById('debtorDialog');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'debtorDialog';
      modal.className = 'dialog-card';
      document.body.appendChild(modal);
    }

    const currentItem = editingId ? window.FP_STATE.debtors.find(d => d.id === editingId) : null;
    const currentYear = window.FP_STATE.year;

    modal.innerHTML = `
      <form id="formDebtorModal" style="padding:20px; min-width:320px; max-width:460px;">
        <h3 style="margin-bottom:16px; font-weight:800;">${currentItem ? 'Editar Devedor' : 'Novo Contrato de Devedor'}</h3>
        
        <div class="field" style="margin-bottom:12px;">
          <label>Nome do Devedor</label>
          <input type="text" id="modalDebtorName" value="${currentItem ? escapeHtml(currentItem.debtorName) : ''}" placeholder="Ex: Carlos Oliveira" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Título / Motivo do Empréstimo</label>
          <input type="text" id="modalDebtorTitle" value="${currentItem ? escapeHtml(currentItem.title) : ''}" placeholder="Ex: Empréstimo Pessoal, Compra Parcelada" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Valor da Parcela Mensal (R$)</label>
          <input type="number" step="0.01" min="0" id="modalDebtorAmount" value="${currentItem ? currentItem.amount : ''}" placeholder="0,00" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Destino de Recebimento</label>
          <select id="modalDebtorDest" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
            ${(window.FP_STATE.destinations || []).map(d => `<option value="${escapeHtml(d.name)}" ${currentItem && currentItem.destination === d.name ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
          </select>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
          <div class="field">
            <label>Mês Início</label>
            <input type="number" min="1" max="12" id="modalDebtorStartMonth" value="${currentItem ? currentItem.startMonth : window.FP_STATE.month}" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
          </div>
          <div class="field">
            <label>Ano Início</label>
            <input type="number" id="modalDebtorStartYear" value="${currentItem ? currentItem.startYear : currentYear}" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
          <div class="field">
            <label>Mês Fim</label>
            <input type="number" min="1" max="12" id="modalDebtorEndMonth" value="${currentItem ? currentItem.endMonth : window.FP_STATE.month}" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
          </div>
          <div class="field">
            <label>Ano Fim</label>
            <input type="number" id="modalDebtorEndYear" value="${currentItem ? currentItem.endYear : currentYear}" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
          </div>
        </div>

        <label class="checkbox-wrap" style="display:flex; align-items:center; gap:8px; margin-bottom:16px; font-size:0.84rem; cursor:pointer;">
          <input type="checkbox" id="modalDebtorCountInTotal" ${currentItem && currentItem.countInTotal ? 'checked' : ''}>
          <span>Somar parcelas na Renda do Mês (Total do Mês)</span>
        </label>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn soft" id="btnCancelDebtorModal">Cancelar</button>
          <button type="submit" class="btn primary">Salvar</button>
        </div>
      </form>
    `;

    document.getElementById('btnCancelDebtorModal')?.addEventListener('click', () => modal.close());

    document.getElementById('formDebtorModal')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const debtorName = document.getElementById('modalDebtorName').value.trim();
      const title = document.getElementById('modalDebtorTitle').value.trim();
      const amount = Number(document.getElementById('modalDebtorAmount').value) || 0;
      const destination = document.getElementById('modalDebtorDest').value;
      const startMonth = Number(document.getElementById('modalDebtorStartMonth').value) || 1;
      const startYear = Number(document.getElementById('modalDebtorStartYear').value) || currentYear;
      const endMonth = Number(document.getElementById('modalDebtorEndMonth').value) || 12;
      const endYear = Number(document.getElementById('modalDebtorEndYear').value) || currentYear;
      const countInTotal = document.getElementById('modalDebtorCountInTotal').checked;

      if (!debtorName || !title || amount <= 0) {
        notify('Preencha os campos obrigatórios.', 'error');
        return;
      }

      if (currentItem) {
        currentItem.debtorName = debtorName;
        currentItem.title = title;
        currentItem.amount = amount;
        currentItem.destination = destination;
        currentItem.startMonth = startMonth;
        currentItem.startYear = startYear;
        currentItem.endMonth = endMonth;
        currentItem.endYear = endYear;
        currentItem.countInTotal = countInTotal;
      } else {
        window.FP_STATE.debtors.push({
          id: uid(),
          debtorName,
          title,
          amount,
          destination,
          startMonth,
          startYear,
          endMonth,
          endYear,
          countInTotal,
          paidHistory: {}
        });
      }

      window.saveFinanceState();
      modal.close();
      render();
      notify('Contrato de devedor salvo com sucesso!', 'success');
    });

    modal.showModal();
  }

  // Master Render
  function render() {
    const container = document.getElementById('view-debtors');
    if (!container) return;

    if (!container.querySelector('#debtorsMetrics')) {
      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
          <h2 style="font-size:1.4rem; font-weight:800;">Controle de Devedores & Recebíveis</h2>
          <button type="button" class="btn soft small" id="toggleDebtorChartsBtn">▼ Gráficos</button>
        </div>
        <div id="debtorsMetrics" style="margin-bottom:16px;"></div>
        <div id="debtorChartsGrid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-bottom:16px;"></div>
        <div id="debtorsListContainer"></div>
      `;

      document.getElementById('toggleDebtorChartsBtn')?.addEventListener('click', () => {
        window.FP_STATE.collapsedSections.debtorCharts = !window.FP_STATE.collapsedSections?.debtorCharts;
        window.saveFinanceState();
        updateDebtorCharts();
      });
    }

    renderMetrics();
    updateDebtorCharts();
    renderList();
  }

  document.addEventListener('tabChanged', (e) => {
    if (e.detail && e.detail.tabId === 'tab-debtors') {
      render();
    }
  });

  return {
    render,
    openModal,
    updateDebtorCharts,
    getActiveDebtorsForMonth
  };
})();
