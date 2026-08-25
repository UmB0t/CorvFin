/**
 * Finanças Pro - Módulo de Benefícios Corporativos (VA, VR, Saúde, etc.)
 */
const BenefitsModule = (() => {
  const BENEFIT_TYPES = {
    va: { label: 'Vale Alimentação (VA)', short: 'VA', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' },
    vr: { label: 'Vale Refeição (VR)', short: 'VR', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' },
    saude: { label: 'Saúde & Farmácia', short: 'SAÚDE', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' },
    transporte: { label: 'Transporte & Combustível', short: 'TRANS', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' },
    educacao: { label: 'Educação & Cursos', short: 'EDUC', color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.15)' },
    cultura: { label: 'Cultura & Lazer', short: 'CULT', color: '#EC4899', bg: 'rgba(236, 72, 153, 0.15)' },
    outros: { label: 'Outros Benefícios', short: 'OUTRO', color: '#64748B', bg: 'rgba(100, 116, 139, 0.15)' }
  };

  function uid() { return 'ben_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function currency(val) { return window.currency ? window.currency(val) : (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  function getMonthTransactions(year, month) {
    if (!window.FP_STATE || !window.FP_STATE.benefitTransactions) return [];
    return window.FP_STATE.benefitTransactions.filter(t => Number(t.year) === Number(year) && Number(t.month) === Number(month));
  }

  function getMonthlyCredit() {
    if (!window.FP_STATE) return 1000;
    return Number(window.FP_STATE.benefitsConfig?.amount || window.FP_STATE.benefitSettings?.sharedBudget || 1053.63);
  }

  // Render KPI Metrics
  function renderMetrics() {
    const container = document.getElementById('benefitsMetrics');
    if (!container) return;

    const y = window.FP_STATE.year;
    const m = window.FP_STATE.month;
    const txs = getMonthTransactions(y, m);

    const credit = getMonthlyCredit();
    const spent = txs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const balance = credit - spent;
    const pctUsed = credit > 0 ? Math.min(100, Math.round((spent / credit) * 100)) : 0;
    const isExceeded = balance < 0;

    container.innerHTML = `
      <div class="metrics">
        <div class="metric">
          <div class="label">Crédito Disponível no Mês</div>
          <div class="value num positive">${currency(credit)}</div>
          <div class="sub">Benefício mensal creditado</div>
        </div>
        <div class="metric">
          <div class="label">Total Utilizado</div>
          <div class="value num negative">${currency(spent)}</div>
          <div class="sub">${pctUsed}% do saldo mensal consumido</div>
        </div>
        <div class="metric">
          <div class="label">Saldo Restante ${isExceeded ? '<span class="badge danger">ESTOURADO</span>' : ''}</div>
          <div class="value num ${!isExceeded ? 'positive' : 'negative'}">${currency(balance)}</div>
          <div class="sub">${isExceeded ? `Excedeu em ${currency(Math.abs(balance))}` : 'Saldo livre para novos gastos'}</div>
        </div>
      </div>
    `;
  }

  // Render Charts
  function renderCharts() {
    const chartsWrap = document.getElementById('benefitsChartsGrid');
    if (!chartsWrap) return;

    const isCollapsed = window.FP_STATE.collapsedSections?.benefitsCharts === true;
    const toggleBtn = document.getElementById('toggleBenefitsChartsBtn');

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
    const txs = getMonthTransactions(y, m);
    const totalSpent = txs.reduce((s, t) => s + (Number(t.amount) || 0), 0);

    // 1. Distribution by Type / Category
    const catMap = {};
    txs.forEach(t => {
      const typeKey = t.type || 'outros';
      catMap[typeKey] = (catMap[typeKey] || 0) + Number(t.amount || 0);
    });
    const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const maxVal = catEntries[0] ? catEntries[0][1] : 1;

    // 2. Daily / Weekly Evolution
    const daysData = {};
    txs.forEach(t => {
      const day = t.day || 1;
      daysData[day] = (daysData[day] || 0) + Number(t.amount || 0);
    });
    const daysSorted = Object.entries(daysData).sort((a, b) => Number(a[0]) - Number(b[0]));
    const maxDayVal = Math.max(...Object.values(daysData), 50);

    chartsWrap.innerHTML = `
      <div class="card chart-card">
        <div class="chart-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 class="chart-title" style="font-size:0.95rem; font-weight:800;">Distribuição por Categoria</h3>
          <span class="badge info">${currency(totalSpent)}</span>
        </div>
        <div style="display:grid; gap:8px;">
          ${catEntries.length === 0 ? '<div class="empty" style="color:var(--muted); font-size:0.82rem;">Sem gastos de benefícios neste mês.</div>' : catEntries.map(([typeKey, val]) => {
            const meta = BENEFIT_TYPES[typeKey] || BENEFIT_TYPES.outros;
            const pct = totalSpent > 0 ? Math.round((val / totalSpent) * 100) : 0;
            const barW = Math.round((val / maxVal) * 100);
            return `
              <div style="display:flex; flex-direction:column; gap:3px;">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                  <span><strong>${escapeHtml(meta.label)}</strong></span>
                  <span class="num">${currency(val)} (${pct}%)</span>
                </div>
                <div class="dest-track" style="height:8px; background:var(--surface-2); border-radius:999px; overflow:hidden;">
                  <div style="width:${barW}%; background:${meta.color}; height:100%; border-radius:999px;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="card chart-card">
        <div class="chart-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 class="chart-title" style="font-size:0.95rem; font-weight:800;">Gastos por Dia (${window.MONTH_ABBR[m - 1]}/${y})</h3>
          <span class="badge success">${txs.length} compras</span>
        </div>
        <div style="display:flex; align-items:flex-end; gap:4px; height:120px; border-bottom:1px solid var(--line); padding-bottom:6px; overflow-x:auto;">
          ${daysSorted.length === 0 ? '<div class="empty" style="color:var(--muted); font-size:0.82rem; width:100%;">Nenhum lançamento no período.</div>' : daysSorted.map(([day, val]) => {
            const h = Math.max(10, Math.round((val / maxDayVal) * 90));
            return `
              <div style="flex:1; min-width:24px; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end;" title="Dia ${day}: ${currency(val)}">
                <div style="width:100%; max-width:14px; height:${h}px; background:var(--brand); border-radius:3px 3px 0 0;"></div>
                <small style="font-size:0.65rem; color:var(--muted); margin-top:4px;">${day}</small>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Render Table / List
  function renderList() {
    const container = document.getElementById('benefitsListContainer');
    if (!container) return;

    const y = window.FP_STATE.year;
    const m = window.FP_STATE.month;
    const txs = getMonthTransactions(y, m);

    if (txs.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:32px; color:var(--muted);">
          <p>Nenhum gasto de benefício registrado em <strong>${window.MONTH_NAMES[m - 1]}/${y}</strong>.</p>
          <div style="display:flex; justify-content:center; gap:8px; margin-top:12px;">
            <button type="button" class="btn primary small" id="btnAddBenefitEmpty">+ Novo Gasto</button>
            <button type="button" class="btn soft small" id="btnConfigCreditEmpty">Configurar Crédito Mensal</button>
          </div>
        </div>
      `;
      document.getElementById('btnAddBenefitEmpty')?.addEventListener('click', () => openTransactionModal());
      document.getElementById('btnConfigCreditEmpty')?.addEventListener('click', () => openConfigModal());
      return;
    }

    container.innerHTML = `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
          <h3 style="font-size:1.1rem; font-weight:800;">Lançamentos de Benefícios (${txs.length})</h3>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn primary small" id="btnAddBenefitTop">+ Novo Gasto</button>
            <button type="button" class="btn soft small" id="btnConfigCreditTop">Crédito: ${currency(getMonthlyCredit())}</button>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--line); color:var(--muted); font-size:0.75rem; text-transform:uppercase;">
                <th style="padding:10px 8px;">Data</th>
                <th style="padding:10px 8px;">Tipo</th>
                <th style="padding:10px 8px;">Estabelecimento / Descrição</th>
                <th style="padding:10px 8px;">Observação</th>
                <th style="padding:10px 8px; text-align:right;">Valor</th>
                <th style="padding:10px 8px; text-align:center;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${txs.map(t => {
                const meta = BENEFIT_TYPES[t.type] || BENEFIT_TYPES.outros;
                return `
                  <tr style="border-bottom:1px solid var(--line);">
                    <td style="padding:10px 8px; font-weight:700;">${String(t.day || 1).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}</td>
                    <td style="padding:10px 8px;"><span class="tag" style="background:${meta.bg}; color:${meta.color}; font-weight:700;">${escapeHtml(meta.short)}</span></td>
                    <td style="padding:10px 8px; font-weight:700;">${escapeHtml(t.description)}</td>
                    <td style="padding:10px 8px; color:var(--muted); font-size:0.8rem;">${escapeHtml(t.note || '-')}</td>
                    <td style="padding:10px 8px; text-align:right; font-weight:800;" class="num negative">${currency(t.amount)}</td>
                    <td style="padding:10px 8px; text-align:center;">
                      <button type="button" class="icon-btn small" data-edit-benefit="${t.id}" title="Editar">✎</button>
                      <button type="button" class="icon-btn small" data-del-benefit="${t.id}" title="Excluir" style="color:var(--danger);">✕</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btnAddBenefitTop')?.addEventListener('click', () => openTransactionModal());
    document.getElementById('btnConfigCreditTop')?.addEventListener('click', () => openConfigModal());

    container.querySelectorAll('[data-edit-benefit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-benefit');
        openTransactionModal(id);
      });
    });

    container.querySelectorAll('[data-del-benefit]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-benefit');
        if (confirm('Deseja excluir este lançamento de benefício?')) {
          window.FP_STATE.benefitTransactions = window.FP_STATE.benefitTransactions.filter(t => t.id !== id);
          window.saveFinanceState();
          render();
          notify('Lançamento removido com sucesso!');
        }
      });
    });
  }

  // Modal Dialog: Add/Edit Transaction
  function openTransactionModal(editingId = null) {
    let modal = document.getElementById('benefitTransactionDialog');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'benefitTransactionDialog';
      modal.className = 'dialog-card';
      document.body.appendChild(modal);
    }

    const currentItem = editingId ? window.FP_STATE.benefitTransactions.find(t => t.id === editingId) : null;
    const nowDay = new Date().getDate();

    modal.innerHTML = `
      <form id="formBenefitModal" style="padding:20px; min-width:320px; max-width:440px;">
        <h3 style="margin-bottom:16px; font-weight:800;">${currentItem ? 'Editar Gasto de Benefício' : 'Novo Gasto de Benefício'}</h3>
        
        <div class="field" style="margin-bottom:12px;">
          <label>Tipo de Benefício</label>
          <select id="modalBenType" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
            ${Object.entries(BENEFIT_TYPES).map(([k, v]) => `<option value="${k}" ${currentItem && currentItem.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Estabelecimento / Descrição</label>
          <input type="text" id="modalBenDesc" value="${currentItem ? escapeHtml(currentItem.description) : ''}" placeholder="Ex: Supermercado Pão de Açúcar, Farmácia" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Valor Gasto (R$)</label>
          <input type="number" step="0.01" min="0" id="modalBenAmount" value="${currentItem ? currentItem.amount : ''}" placeholder="0,00" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Dia do Gasto</label>
          <input type="number" min="1" max="31" id="modalBenDay" value="${currentItem ? (currentItem.day || 1) : nowDay}" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:16px;">
          <label>Observação (Opcional)</label>
          <input type="text" id="modalBenNote" value="${currentItem ? escapeHtml(currentItem.note || '') : ''}" placeholder="Ex: Compras da quinzena" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn soft" id="btnCancelBenefitModal">Cancelar</button>
          <button type="submit" class="btn primary">Salvar</button>
        </div>
      </form>
    `;

    document.getElementById('btnCancelBenefitModal')?.addEventListener('click', () => modal.close());

    document.getElementById('formBenefitModal')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const type = document.getElementById('modalBenType').value;
      const description = document.getElementById('modalBenDesc').value.trim();
      const amount = Number(document.getElementById('modalBenAmount').value) || 0;
      const day = Number(document.getElementById('modalBenDay').value) || 1;
      const note = document.getElementById('modalBenNote').value.trim();

      if (!description || amount <= 0) {
        notify('Preencha os campos obrigatórios.', 'error');
        return;
      }

      window.FP_STATE.benefitTransactions = window.FP_STATE.benefitTransactions || [];

      if (currentItem) {
        currentItem.type = type;
        currentItem.description = description;
        currentItem.amount = amount;
        currentItem.day = day;
        currentItem.note = note;
      } else {
        window.FP_STATE.benefitTransactions.push({
          id: uid(),
          type,
          description,
          amount,
          day,
          note,
          month: window.FP_STATE.month,
          year: window.FP_STATE.year
        });
      }

      window.saveFinanceState();
      modal.close();
      render();
      notify('Gasto de benefício salvo com sucesso!', 'success');
    });

    modal.showModal();
  }

  // Modal Dialog: Configure Credit
  function openConfigModal() {
    let modal = document.getElementById('benefitConfigDialog');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'benefitConfigDialog';
      modal.className = 'dialog-card';
      document.body.appendChild(modal);
    }

    const curCredit = getMonthlyCredit();

    modal.innerHTML = `
      <form id="formBenefitConfig" style="padding:20px; min-width:300px; max-width:400px;">
        <h3 style="margin-bottom:16px; font-weight:800;">Configurar Crédito Mensal</h3>
        
        <div class="field" style="margin-bottom:16px;">
          <label>Valor Mensal do Vale (R$)</label>
          <input type="number" step="0.01" min="0" id="modalConfigCredit" value="${curCredit}" placeholder="0,00" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn soft" id="btnCancelConfigModal">Cancelar</button>
          <button type="submit" class="btn primary">Salvar</button>
        </div>
      </form>
    `;

    document.getElementById('btnCancelConfigModal')?.addEventListener('click', () => modal.close());

    document.getElementById('formBenefitConfig')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const newCredit = Number(document.getElementById('modalConfigCredit').value) || 0;
      window.FP_STATE.benefitsConfig = window.FP_STATE.benefitsConfig || {};
      window.FP_STATE.benefitsConfig.amount = newCredit;

      window.saveFinanceState();
      modal.close();
      render();
      notify('Crédito mensal de benefícios atualizado!', 'success');
    });

    modal.showModal();
  }

  // Master Render
  function render() {
    const container = document.getElementById('view-benefits');
    if (!container) return;

    if (!container.querySelector('#benefitsMetrics')) {
      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
          <h2 style="font-size:1.4rem; font-weight:800;">Benefícios Corporativos & Vales</h2>
          <button type="button" class="btn soft small" id="toggleBenefitsChartsBtn">▼ Gráficos</button>
        </div>
        <div id="benefitsMetrics" style="margin-bottom:16px;"></div>
        <div id="benefitsChartsGrid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-bottom:16px;"></div>
        <div id="benefitsListContainer"></div>
      `;

      document.getElementById('toggleBenefitsChartsBtn')?.addEventListener('click', () => {
        window.FP_STATE.collapsedSections.benefitsCharts = !window.FP_STATE.collapsedSections?.benefitsCharts;
        window.saveFinanceState();
        renderCharts();
      });
    }

    renderMetrics();
    renderCharts();
    renderList();
  }

  document.addEventListener('tabChanged', (e) => {
    if (e.detail && e.detail.tabId === 'tab-benefits') {
      render();
    }
  });

  return {
    render,
    openTransactionModal,
    openConfigModal
  };
})();
