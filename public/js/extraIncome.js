/**
 * Finanças Pro - Módulo de Rendas Extras
 */
const ExtraIncomeModule = (() => {
  const CATEGORY_COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4', '#6366F1', '#F97316', '#14B8A6'];

  function uid() { return 'ext_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function currency(val) { return window.currency ? window.currency(val) : (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  function getActiveExtras(year, month) {
    if (!window.FP_STATE || !window.FP_STATE.extras) return [];
    return window.FP_STATE.extras.filter(e => {
      if (e.month && e.year) {
        return Number(e.year) === Number(year) && Number(e.month) === Number(month);
      }
      return true;
    });
  }

  // Render KPI Metrics
  function renderMetrics() {
    const container = document.getElementById('extraIncomeMetrics');
    if (!container) return;

    const y = window.FP_STATE.year;
    const m = window.FP_STATE.month;
    const extras = getActiveExtras(y, m);

    const total = extras.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const received = extras.filter(e => e.status === 'pago').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const pending = total - received;

    container.innerHTML = `
      <div class="metrics">
        <div class="metric">
          <div class="label">Renda Extra Total (${window.MONTH_ABBR[m - 1]}/${y})</div>
          <div class="value num positive">${currency(total)}</div>
          <div class="sub">Ganhos adicionais no mês</div>
        </div>
        <div class="metric">
          <div class="label">Valores Recebidos</div>
          <div class="value num positive">${currency(received)}</div>
          <div class="sub">Já depositados / compensados</div>
        </div>
        <div class="metric">
          <div class="label">Aguardando Recebimento</div>
          <div class="value num warning">${currency(pending)}</div>
          <div class="sub">Valores a receber neste mês</div>
        </div>
      </div>
    `;
  }

  // Render Charts (Origin & Annual Evolution)
  function renderCharts() {
    const chartsWrap = document.getElementById('extrasChartsWrap');
    if (!chartsWrap) return;

    const isCollapsed = window.FP_STATE.collapsedSections?.extrasCharts === true;
    const toggleBtn = document.getElementById('toggleExtrasChartsBtn');

    if (toggleBtn) {
      toggleBtn.innerHTML = isCollapsed ? '▶ Expandir Gráficos' : '▼ Recolher Gráficos';
    }

    if (isCollapsed) {
      chartsWrap.style.display = 'none';
      return;
    }
    chartsWrap.style.display = 'grid';

    const y = window.FP_STATE.year;
    const m = window.FP_STATE.month;
    const curExtras = getActiveExtras(y, m);
    const curTotal = curExtras.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    // 1. Origem / Remetente
    const originMap = {};
    curExtras.forEach(e => {
      const org = (e.sender || e.source || e.title || 'Outros').trim();
      originMap[org] = (originMap[org] || 0) + Number(e.amount || 0);
    });

    const originEntries = Object.entries(originMap).sort((a, b) => b[1] - a[1]);
    const maxOriginVal = originEntries[0] ? originEntries[0][1] : 1;

    // 2. Evolução Anual
    let yearTotal = 0;
    const monthsData = [];
    for (let mIdx = 1; mIdx <= 12; mIdx++) {
      const mExt = getActiveExtras(y, mIdx);
      const mSum = mExt.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      yearTotal += mSum;
      monthsData.push({ month: mIdx, total: mSum });
    }
    const maxMonthVal = Math.max(...monthsData.map(d => d.total), 100);

    chartsWrap.innerHTML = `
      <div class="card chart-card">
        <div class="chart-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 class="chart-title" style="font-size:0.95rem; font-weight:800;">Origem / Remetente</h3>
          <span class="badge info">${currency(curTotal)}</span>
        </div>
        <div style="display:grid; gap:8px;">
          ${originEntries.length === 0 ? '<div class="empty" style="color:var(--muted); font-size:0.82rem;">Sem rendas cadastradas para este mês.</div>' : originEntries.map(([org, val], idx) => {
            const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
            const pct = curTotal > 0 ? Math.round((val / curTotal) * 100) : 0;
            const barW = Math.round((val / maxOriginVal) * 100);
            return `
              <div style="display:flex; flex-direction:column; gap:3px;">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                  <span><strong>${escapeHtml(org)}</strong></span>
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
          <h3 class="chart-title" style="font-size:0.95rem; font-weight:800;">Evolução Anual (${y})</h3>
          <span class="badge success">Total: ${currency(yearTotal)}</span>
        </div>
        <div style="display:flex; align-items:flex-end; gap:6px; height:120px; border-bottom:1px solid var(--line); padding-bottom:6px;">
          ${monthsData.map(d => {
            const isCur = d.month === m;
            const h = d.total > 0 ? Math.max(8, Math.round((d.total / maxMonthVal) * 90)) : 4;
            return `
              <div class="extra-income-month-col" data-month="${d.month}" style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end; cursor:pointer;">
                <div style="width:100%; max-width:16px; height:${h}px; background:${isCur ? 'var(--brand)' : 'var(--surface-2)'}; border-radius:3px 3px 0 0;" title="${window.MONTH_NAMES[d.month - 1]}: ${currency(d.total)}"></div>
                <small style="font-size:0.65rem; color:${isCur ? 'var(--brand)' : 'var(--muted)'}; font-weight:${isCur ? '800' : '600'}; margin-top:4px;">${window.MONTH_ABBR[d.month - 1]}</small>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('.extra-income-month-col').forEach(col => {
      col.addEventListener('click', () => {
        const selM = Number(col.getAttribute('data-month'));
        if (selM && window.FP_STATE) {
          window.FP_STATE.month = selM;
          if (typeof window.saveFinanceState === 'function') window.saveFinanceState();
          if (window.ExtraIncomeModule && typeof window.ExtraIncomeModule.render === 'function') window.ExtraIncomeModule.render();
        }
      });
    });
  }

  // Render Table / List
  function renderList() {
    const container = document.getElementById('extraIncomeListContainer');
    if (!container) return;

    const y = window.FP_STATE.year;
    const m = window.FP_STATE.month;
    const extras = getActiveExtras(y, m);

    if (extras.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:32px; color:var(--muted);">
          <p>Nenhuma renda extra cadastrada para <strong>${window.MONTH_NAMES[m - 1]}/${y}</strong>.</p>
          <button type="button" class="btn primary small" id="btnAddExtraEmpty" style="margin-top:12px;">+ Nova Renda Extra</button>
        </div>
      `;
      document.getElementById('btnAddExtraEmpty')?.addEventListener('click', () => openModal());
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
          <h3 style="font-size:1.1rem; font-weight:800;">Lançamentos de Rendas Extras (${extras.length})</h3>
          <button type="button" class="btn primary small" id="btnAddExtraTop">+ Nova Renda Extra</button>
        </div>

        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--line); color:var(--muted); font-size:0.75rem; text-transform:uppercase;">
                <th style="padding:10px 8px;">Status</th>
                <th style="padding:10px 8px;">Título / Serviço</th>
                <th style="padding:10px 8px;">Origem</th>
                <th style="padding:10px 8px;">Remetente</th>
                <th style="padding:10px 8px; text-align:right;">Valor</th>
                <th style="padding:10px 8px; text-align:center;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${extras.map(item => {
                const isPaid = item.status === 'pago';
                return `
                  <tr style="border-bottom:1px solid var(--line);">
                    <td style="padding:10px 8px;">
                      <button type="button" class="btn small ${isPaid ? 'primary' : 'soft'}" data-toggle-extra-paid="${item.id}" style="padding:4px 8px; font-size:0.75rem;">
                        ${isPaid ? '✓ Recebido' : 'Pendente'}
                      </button>
                    </td>
                    <td style="padding:10px 8px; font-weight:700;">${escapeHtml(item.title)}</td>
                    <td style="padding:10px 8px;"><span class="tag">${escapeHtml(item.source || 'Extra')}</span></td>
                    <td style="padding:10px 8px;">${escapeHtml(item.sender || '-')}</td>
                    <td style="padding:10px 8px; text-align:right; font-weight:800;" class="num positive">+${currency(item.amount)}</td>
                    <td style="padding:10px 8px; text-align:center;">
                      <button type="button" class="icon-btn small" data-edit-extra="${item.id}" title="Editar">✎</button>
                      <button type="button" class="icon-btn small" data-del-extra="${item.id}" title="Excluir" style="color:var(--danger);">✕</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btnAddExtraTop')?.addEventListener('click', () => openModal());

    // Toggle Paid
    container.querySelectorAll('[data-toggle-extra-paid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-toggle-extra-paid');
        const item = window.FP_STATE.extras.find(e => e.id === id);
        if (item) {
          item.status = item.status === 'pago' ? 'pendente' : 'pago';
          window.saveFinanceState();
          render();
          notify('Status atualizado!');
        }
      });
    });

    // Edit
    container.querySelectorAll('[data-edit-extra]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-extra');
        openModal(id);
      });
    });

    // Delete
    container.querySelectorAll('[data-del-extra]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-extra');
        if (confirm('Deseja excluir esta renda extra?')) {
          window.FP_STATE.extras = window.FP_STATE.extras.filter(e => e.id !== id);
          window.saveFinanceState();
          render();
          notify('Renda extra removida!');
        }
      });
    });
  }

  // Modal Dialog Add/Edit
  function openModal(editingId = null) {
    let modal = document.getElementById('extraDialog');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'extraDialog';
      modal.className = 'dialog-card';
      document.body.appendChild(modal);
    }

    const currentItem = editingId ? window.FP_STATE.extras.find(e => e.id === editingId) : null;

    modal.innerHTML = `
      <form id="formExtraModal" style="padding:20px; min-width:320px; max-width:440px;">
        <h3 style="margin-bottom:16px; font-weight:800;">${currentItem ? 'Editar Renda Extra' : 'Nova Renda Extra'}</h3>
        
        <div class="field" style="margin-bottom:12px;">
          <label>Título / Descrição</label>
          <input type="text" id="modalExtraTitle" value="${currentItem ? escapeHtml(currentItem.title) : ''}" placeholder="Ex: Consultoria, Freelance, Venda" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Valor (R$)</label>
          <input type="number" step="0.01" min="0" id="modalExtraAmount" value="${currentItem ? currentItem.amount : ''}" placeholder="0,00" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Origem / Categoria</label>
          <input type="text" id="modalExtraSource" value="${currentItem ? escapeHtml(currentItem.source) : ''}" placeholder="Ex: Projeto Web, Aulas" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:16px;">
          <label>Remetente / Pagador</label>
          <input type="text" id="modalExtraSender" value="${currentItem ? escapeHtml(currentItem.sender) : ''}" placeholder="Ex: Empresa X, Cliente Y" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn soft" id="btnCancelExtraModal">Cancelar</button>
          <button type="submit" class="btn primary">Salvar</button>
        </div>
      </form>
    `;

    document.getElementById('btnCancelExtraModal')?.addEventListener('click', () => modal.close());

    document.getElementById('formExtraModal')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('modalExtraTitle').value.trim();
      const amount = Number(document.getElementById('modalExtraAmount').value) || 0;
      const source = document.getElementById('modalExtraSource').value.trim() || 'Renda Extra';
      const sender = document.getElementById('modalExtraSender').value.trim() || '-';

      if (!title || amount <= 0) {
        notify('Preencha os campos corretamente.', 'error');
        return;
      }

      if (currentItem) {
        currentItem.title = title;
        currentItem.amount = amount;
        currentItem.source = source;
        currentItem.sender = sender;
      } else {
        window.FP_STATE.extras.push({
          id: uid(),
          title,
          amount,
          source,
          sender,
          month: window.FP_STATE.month,
          year: window.FP_STATE.year,
          status: 'pendente'
        });
      }

      window.saveFinanceState();
      modal.close();
      render();
      notify('Renda extra salva com sucesso!', 'success');
    });

    modal.showModal();
  }

  // Master Render
  function render() {
    const container = document.getElementById('view-extras');
    if (!container) return;

    if (!container.querySelector('#extraIncomeMetrics')) {
      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
          <h2 style="font-size:1.4rem; font-weight:800;">Rendas Extras & Ganhos Pontuais</h2>
          <button type="button" class="btn soft small" id="toggleExtrasChartsBtn">▼ Gráficos</button>
        </div>
        <div id="extraIncomeMetrics" style="margin-bottom:16px;"></div>
        <div id="extrasChartsWrap" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-bottom:16px;"></div>
        <div id="extraIncomeListContainer"></div>
      `;

      document.getElementById('toggleExtrasChartsBtn')?.addEventListener('click', () => {
        window.FP_STATE.collapsedSections.extrasCharts = !window.FP_STATE.collapsedSections?.extrasCharts;
        window.saveFinanceState();
        renderCharts();
      });
    }

    renderMetrics();
    renderCharts();
    renderList();
  }

  document.addEventListener('tabChanged', (e) => {
    if (e.detail && e.detail.tabId === 'tab-extras') {
      render();
    }
  });

  return {
    render,
    openModal,
    getActiveExtras
  };
})();
