/**
 * Finanças Pro - Módulo de Investimentos, Patrimônio & Simulador de Juros
 */
const InvestmentsModule = (() => {
  const CATEGORY_COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4', '#6366F1', '#F97316', '#14B8A6'];

  function uid() { return 'inv_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function currency(val) { return window.currency ? window.currency(val) : (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  // Compound Interest Simulator
  function runSimulation() {
    const p = Number(document.getElementById('simInitial')?.value) || 0;
    const pmt = Number(document.getElementById('simMonthly')?.value) || 0;
    const rateAnual = Number(document.getElementById('simRate')?.value) || 0;
    const periodVal = Number(document.getElementById('simPeriod')?.value) || 1;
    const unit = document.getElementById('simUnit')?.value || 'anos';

    const nMonths = unit === 'anos' ? periodVal * 12 : periodVal;
    const taxaMensal = rateAnual > 0 ? (Math.pow(1 + (rateAnual / 100), 1 / 12) - 1) : 0;

    const container = document.getElementById('simResultsContainer');
    if (!container) return;

    let balance = p;
    let totalContributed = p;

    for (let i = 1; i <= nMonths; i++) {
      balance = balance * (1 + taxaMensal) + pmt;
      totalContributed += pmt;
    }

    const totalInterest = Math.max(0, balance - totalContributed);
    const labelPeriod = unit === 'anos' ? `${periodVal} ano(s)` : `${periodVal} mês(es)`;
    const pctInvested = balance > 0 ? Math.min(100, Math.round((totalContributed / balance) * 100)) : 100;
    const pctInterest = 100 - pctInvested;

    container.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-top:14px;">
        <div style="background:var(--surface); padding:12px 14px; border-radius:10px; border:1px solid var(--line);">
          <div style="font-size:0.72rem; color:var(--muted); font-weight:800; text-transform:uppercase;">Valor Bruto Final (${labelPeriod})</div>
          <div class="num positive" style="font-size:1.35rem; font-weight:800; margin-top:2px;">${currency(balance)}</div>
          <div style="font-size:0.72rem; color:var(--muted); margin-top:2px;">Taxa: ~${(taxaMensal * 100).toFixed(2)}% ao mês</div>
        </div>
        <div style="background:var(--surface); padding:12px 14px; border-radius:10px; border:1px solid var(--line);">
          <div style="font-size:0.72rem; color:var(--muted); font-weight:800; text-transform:uppercase;">Total Investido (Aportes)</div>
          <div class="num" style="font-size:1.2rem; font-weight:800; margin-top:2px;">${currency(totalContributed)}</div>
          <div style="font-size:0.72rem; color:var(--muted); margin-top:2px;">${pctInvested}% do montante</div>
        </div>
        <div style="background:var(--surface); padding:12px 14px; border-radius:10px; border:1px solid var(--line);">
          <div style="font-size:0.72rem; color:var(--muted); font-weight:800; text-transform:uppercase;">Juros Compostos Ganhos</div>
          <div class="num" style="font-size:1.2rem; font-weight:800; color:var(--info, #3b82f6); margin-top:2px;">${currency(totalInterest)}</div>
          <div style="font-size:0.72rem; color:var(--muted); margin-top:2px;">${pctInterest}% do montante</div>
        </div>
      </div>
      <div style="margin-top:12px;">
        <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--muted); font-weight:700; margin-bottom:4px;">
          <span>Aportado: ${pctInvested}%</span>
          <span>Juros: ${pctInterest}%</span>
        </div>
        <div style="height:8px; border-radius:999px; background:var(--surface-2); overflow:hidden; display:flex;">
          <div style="width:${pctInvested}%; background:var(--brand); height:100%;"></div>
          <div style="width:${pctInterest}%; background:var(--info, #3b82f6); height:100%;"></div>
        </div>
      </div>
    `;
  }

  // Render KPI Metrics
  function renderMetrics() {
    const container = document.getElementById('investMetrics');
    if (!container) return;

    const y = window.FP_STATE.year;
    const m = window.FP_STATE.month;

    const assets = window.FP_STATE.assets || [];
    const aportes = window.FP_STATE.aportes || [];

    const totalInvested = assets.reduce((s, a) => s + (Number(a.currentAmount) || 0), 0);
    const totalGoals = assets.reduce((s, a) => s + (Number(a.goalAmount) || 0), 0);
    const monthlyAportes = aportes.filter(ap => Number(ap.month) === Number(m) && Number(ap.year) === Number(y)).reduce((s, ap) => s + (Number(ap.amount) || 0), 0);
    const goalPct = totalGoals > 0 ? Math.min(100, Math.round((totalInvested / totalGoals) * 100)) : 0;

    container.innerHTML = `
      <div class="metrics">
        <div class="metric">
          <div class="label">Patrimônio Total Investido</div>
          <div class="value num positive">${currency(totalInvested)}</div>
          <div class="sub">Total acumulado em ${assets.length} ativos</div>
        </div>
        <div class="metric">
          <div class="label">Aportes do Mês (${window.MONTH_ABBR[m - 1]}/${y})</div>
          <div class="value num positive">${currency(monthlyAportes)}</div>
          <div class="sub">Adicionado no período</div>
        </div>
        <div class="metric">
          <div class="label">Metas Globais Atingidas</div>
          <div class="value num info">${goalPct}%</div>
          <div class="sub">${currency(totalInvested)} de ${currency(totalGoals)}</div>
        </div>
      </div>
    `;
  }

  // Render Charts
  function renderCharts() {
    const grid = document.getElementById('investChartsGrid');
    if (!grid) return;

    const isCollapsed = window.FP_STATE.collapsedSections?.investCharts === true;
    const toggleBtn = document.getElementById('toggleInvestChartsBtn');

    if (toggleBtn) {
      toggleBtn.innerHTML = isCollapsed ? '▶ Expandir Gráficos' : '▼ Recolher Gráficos';
    }

    if (isCollapsed) {
      grid.style.display = 'none';
      return;
    }
    grid.style.display = 'grid';

    const assets = window.FP_STATE.assets || [];
    const total = assets.reduce((s, a) => s + (Number(a.currentAmount) || 0), 0);

    // 1. By Category
    const catMap = {};
    assets.forEach(a => {
      const c = a.category || 'Renda Fixa';
      catMap[c] = (catMap[c] || 0) + Number(a.currentAmount || 0);
    });
    const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const maxCatVal = catEntries[0] ? catEntries[0][1] : 1;

    // 2. By Broker / Institution
    const destMap = {};
    assets.forEach(a => {
      const d = a.destination || 'XP Investimentos';
      destMap[d] = (destMap[d] || 0) + Number(a.currentAmount || 0);
    });
    const destEntries = Object.entries(destMap).sort((a, b) => b[1] - a[1]);
    const maxDestVal = destEntries[0] ? destEntries[0][1] : 1;

    grid.innerHTML = `
      <div class="card chart-card">
        <div class="chart-head" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 class="chart-title" style="font-size:0.95rem; font-weight:800;">Alocação por Categoria</h3>
          <span class="badge info">${currency(total)}</span>
        </div>
        <div style="display:grid; gap:8px;">
          ${catEntries.length === 0 ? '<div class="empty" style="color:var(--muted); font-size:0.82rem;">Sem ativos cadastrados.</div>' : catEntries.map(([cat, val], idx) => {
            const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
            const pct = total > 0 ? Math.round((val / total) * 100) : 0;
            const barW = Math.round((val / maxCatVal) * 100);
            return `
              <div style="display:flex; flex-direction:column; gap:3px;">
                <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                  <span><strong>${escapeHtml(cat)}</strong></span>
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
          <h3 class="chart-title" style="font-size:0.95rem; font-weight:800;">Alocação por Instituição</h3>
          <span class="badge success">${destEntries.length} instituições</span>
        </div>
        <div style="display:grid; gap:8px;">
          ${destEntries.length === 0 ? '<div class="empty" style="color:var(--muted); font-size:0.82rem;">Sem instituições vinculadas.</div>' : destEntries.map(([dest, val], idx) => {
            const color = CATEGORY_COLORS[(idx + 2) % CATEGORY_COLORS.length];
            const pct = total > 0 ? Math.round((val / total) * 100) : 0;
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

  // Render Assets Cards Grid
  function renderAssetGrid() {
    const container = document.getElementById('investAssetGrid');
    if (!container) return;

    const assets = window.FP_STATE.assets || [];

    if (assets.length === 0) {
      container.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align:center; padding:32px; color:var(--muted);">
          <p>Nenhum investimento cadastrado ainda.</p>
          <button type="button" class="btn primary small" id="btnAddAssetEmpty" style="margin-top:12px;">+ Criar Novo Investimento</button>
        </div>
      `;
      document.getElementById('btnAddAssetEmpty')?.addEventListener('click', () => openAssetModal());
      return;
    }

    container.innerHTML = assets.map(asset => {
      const current = Number(asset.currentAmount || 0);
      const goal = Number(asset.goalAmount || 0);
      const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;

      return `
        <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; gap:12px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <h4 style="font-size:1rem; font-weight:800; margin:0;">${escapeHtml(asset.name)}</h4>
              <div style="display:flex; gap:6px; margin-top:4px; flex-wrap:wrap;">
                <span class="tag">${escapeHtml(asset.category || 'Ativo')}</span>
                <span class="tag" style="background:var(--brand-soft); color:var(--brand);">${escapeHtml(asset.destination || 'XP')}</span>
              </div>
            </div>
            <div style="display:flex; gap:4px;">
              <button type="button" class="icon-btn small" data-edit-asset="${asset.id}" title="Editar">✎</button>
              <button type="button" class="icon-btn small" data-del-asset="${asset.id}" title="Excluir" style="color:var(--danger);">✕</button>
            </div>
          </div>

          <div>
            <div class="num positive" style="font-size:1.4rem; font-weight:800;">${currency(current)}</div>
            ${goal > 0 ? `<div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">Meta: ${currency(goal)} (${pct}%)</div>` : ''}
            ${goal > 0 ? `
              <div class="dest-track" style="height:6px; background:var(--surface-2); border-radius:999px; margin-top:6px; overflow:hidden;">
                <div style="width:${pct}%; background:var(--brand); height:100%; border-radius:999px;"></div>
              </div>
            ` : ''}
          </div>

          <button type="button" class="btn soft small" data-aporte-asset="${asset.id}" style="width:100%; justify-content:center;">
            + Registrar Aporte
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-edit-asset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-asset');
        openAssetModal(id);
      });
    });

    container.querySelectorAll('[data-del-asset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-asset');
        if (confirm('Deseja excluir este investimento?')) {
          window.FP_STATE.assets = window.FP_STATE.assets.filter(a => a.id !== id);
          window.saveFinanceState();
          render();
          notify('Investimento excluído com sucesso!');
        }
      });
    });

    container.querySelectorAll('[data-aporte-asset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-aporte-asset');
        openAporteModal(id);
      });
    });
  }

  // Modal Dialog: Add/Edit Asset
  function openAssetModal(editingId = null) {
    let modal = document.getElementById('assetDialog');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'assetDialog';
      modal.className = 'dialog-card';
      document.body.appendChild(modal);
    }

    const currentItem = editingId ? (window.FP_STATE.assets || []).find(a => a.id === editingId) : null;

    modal.innerHTML = `
      <form id="formAssetModal" style="padding:20px; min-width:320px; max-width:440px;">
        <h3 style="margin-bottom:16px; font-weight:800;">${currentItem ? 'Editar Investimento' : 'Novo Investimento'}</h3>
        
        <div class="field" style="margin-bottom:12px;">
          <label>Nome do Ativo</label>
          <input type="text" id="modalAssetName" value="${currentItem ? escapeHtml(currentItem.name) : ''}" placeholder="Ex: Tesouro Selic 2029, FII HGLG11, Ações WEGE3" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Categoria</label>
          <select id="modalAssetCategory" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
            ${['Renda Fixa', 'Ações', 'FIIs (Imobiliário)', 'Criptomoedas', 'Reserva de Emergência', 'Fundos', 'Outros'].map(c => `<option value="${c}" ${currentItem && currentItem.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Instituição / Corretora</label>
          <select id="modalAssetDest" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
            ${(window.FP_STATE.destinations || []).map(d => `<option value="${escapeHtml(d.name)}" ${currentItem && currentItem.destination === d.name ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
          </select>
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Saldo Atual Investido (R$)</label>
          <input type="number" step="0.01" min="0" id="modalAssetAmount" value="${currentItem ? currentItem.currentAmount : ''}" placeholder="0,00" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:16px;">
          <label>Meta Financeira (Opcional R$)</label>
          <input type="number" step="0.01" min="0" id="modalAssetGoal" value="${currentItem ? (currentItem.goalAmount || '') : ''}" placeholder="Ex: 50000,00" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn soft" id="btnCancelAssetModal">Cancelar</button>
          <button type="submit" class="btn primary">Salvar</button>
        </div>
      </form>
    `;

    document.getElementById('btnCancelAssetModal')?.addEventListener('click', () => modal.close());

    document.getElementById('formAssetModal')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('modalAssetName').value.trim();
      const category = document.getElementById('modalAssetCategory').value;
      const destination = document.getElementById('modalAssetDest').value;
      const currentAmount = Number(document.getElementById('modalAssetAmount').value) || 0;
      const goalAmount = Number(document.getElementById('modalAssetGoal').value) || 0;

      if (!name) {
        notify('Informe o nome do ativo.', 'error');
        return;
      }

      window.FP_STATE.assets = window.FP_STATE.assets || [];

      if (currentItem) {
        currentItem.name = name;
        currentItem.category = category;
        currentItem.destination = destination;
        currentItem.currentAmount = currentAmount;
        currentItem.goalAmount = goalAmount;
      } else {
        window.FP_STATE.assets.push({
          id: uid(),
          name,
          category,
          destination,
          currentAmount,
          goalAmount
        });
      }

      window.saveFinanceState();
      modal.close();
      render();
      notify('Investimento salvo com sucesso!', 'success');
    });

    modal.showModal();
  }

  // Modal Dialog: Add Aporte
  function openAporteModal(assetId) {
    let modal = document.getElementById('aporteDialog');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'aporteDialog';
      modal.className = 'dialog-card';
      document.body.appendChild(modal);
    }

    const asset = (window.FP_STATE.assets || []).find(a => a.id === assetId);
    if (!asset) return;

    modal.innerHTML = `
      <form id="formAporteModal" style="padding:20px; min-width:300px; max-width:400px;">
        <h3 style="margin-bottom:6px; font-weight:800;">Registrar Aporte</h3>
        <p style="font-size:0.85rem; color:var(--muted); margin-bottom:14px;">Ativo: <strong>${escapeHtml(asset.name)}</strong></p>

        <div class="field" style="margin-bottom:12px;">
          <label>Valor do Aporte (R$)</label>
          <input type="number" step="0.01" min="0.01" id="modalAporteAmount" placeholder="0,00" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:16px;">
          <label>Observação (Opcional)</label>
          <input type="text" id="modalAporteNote" placeholder="Ex: Compra mensal de cotas" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn soft" id="btnCancelAporteModal">Cancelar</button>
          <button type="submit" class="btn primary">Confirmar Aporte</button>
        </div>
      </form>
    `;

    document.getElementById('btnCancelAporteModal')?.addEventListener('click', () => modal.close());

    document.getElementById('formAporteModal')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = Number(document.getElementById('modalAporteAmount').value) || 0;
      const note = document.getElementById('modalAporteNote').value.trim();

      if (amount <= 0) {
        notify('Informe um valor válido.', 'error');
        return;
      }

      asset.currentAmount = (Number(asset.currentAmount) || 0) + amount;

      window.FP_STATE.aportes = window.FP_STATE.aportes || [];
      window.FP_STATE.aportes.push({
        id: uid(),
        assetId: asset.id,
        amount,
        note,
        month: window.FP_STATE.month,
        year: window.FP_STATE.year,
        date: new Date().toISOString()
      });

      window.saveFinanceState();
      modal.close();
      render();
      notify(`Aporte de ${currency(amount)} adicionado a ${asset.name}!`, 'success');
    });

    modal.showModal();
  }

  // Master Render
  function render() {
    const container = document.getElementById('view-investments');
    if (!container) return;

    if (!container.querySelector('#investMetrics')) {
      const isSimCollapsed = localStorage.getItem('fp_invest_sim_collapsed') === 'true';

      container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
          <h2 style="font-size:1.4rem; font-weight:800;">Investimentos & Patrimônio</h2>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn soft small" id="toggleInvestChartsBtn">▼ Gráficos</button>
            <button type="button" class="btn primary small" id="btnAddNewAssetTop">+ Novo Ativo</button>
          </div>
        </div>

        <div id="investMetrics" style="margin-bottom:16px;"></div>

        <!-- SIMULADOR DE JUROS COMPOSTOS -->
        <div class="card" style="margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" id="simHeaderToggle">
            <h3 style="font-size:1rem; font-weight:800; margin:0; display:flex; align-items:center; gap:8px;">
              <span>📈</span> Simulador de Juros Compostos & Projeção Futura
            </h3>
            <button type="button" class="icon-btn small" id="btnToggleSim">${isSimCollapsed ? '▶' : '▼'}</button>
          </div>
          <div id="simBody" style="display:${isSimCollapsed ? 'none' : 'block'}; margin-top:14px;">
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px; align-items:end;">
              <div class="field">
                <label>Aporte Inicial (R$)</label>
                <input id="simInitial" type="number" min="0" step="100" value="1000" style="padding:8px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
              </div>
              <div class="field">
                <label>Aporte Mensal (R$)</label>
                <input id="simMonthly" type="number" min="0" step="50" value="200" style="padding:8px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
              </div>
              <div class="field">
                <label>Taxa Anual (%)</label>
                <input id="simRate" type="number" min="0" step="0.1" value="12" style="padding:8px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
              </div>
              <div class="field">
                <label>Período</label>
                <div style="display:flex; gap:6px;">
                  <input id="simPeriod" type="number" min="1" max="100" value="5" style="flex:1; padding:8px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
                  <select id="simUnit" style="padding:8px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
                    <option value="anos" selected>Anos</option>
                    <option value="meses">Meses</option>
                  </select>
                </div>
              </div>
              <button type="button" class="btn primary" id="simCalcBtn" style="height:38px;">Simular</button>
            </div>
            <div id="simResultsContainer"></div>
          </div>
        </div>

        <div id="investChartsGrid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-bottom:16px;"></div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="font-size:1.1rem; font-weight:800;">Meus Ativos & Metas</h3>
        </div>
        <div id="investAssetGrid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px;"></div>
      `;

      document.getElementById('btnAddNewAssetTop')?.addEventListener('click', () => openAssetModal());

      const simToggleAction = () => {
        const simBody = document.getElementById('simBody');
        const btnToggle = document.getElementById('btnToggleSim');
        const isHidden = simBody.style.display === 'none';
        simBody.style.display = isHidden ? 'block' : 'none';
        if (btnToggle) btnToggle.textContent = isHidden ? '▼' : '▶';
        localStorage.setItem('fp_invest_sim_collapsed', !isHidden);
      };

      document.getElementById('simHeaderToggle')?.addEventListener('click', simToggleAction);
      document.getElementById('simCalcBtn')?.addEventListener('click', runSimulation);
      ['simInitial', 'simMonthly', 'simRate', 'simPeriod', 'simUnit'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', runSimulation);
      });

      document.getElementById('toggleInvestChartsBtn')?.addEventListener('click', () => {
        window.FP_STATE.collapsedSections.investCharts = !window.FP_STATE.collapsedSections?.investCharts;
        window.saveFinanceState();
        renderCharts();
      });

      runSimulation();
    }

    renderMetrics();
    renderCharts();
    renderAssetGrid();
  }

  document.addEventListener('tabChanged', (e) => {
    if (e.detail && e.detail.tabId === 'tab-investments') {
      render();
    }
  });

  return {
    render,
    openAssetModal,
    openAporteModal
  };
})();
