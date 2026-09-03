/**
 * Módulo de Simulação de Cenários & Despesas Hipotéticas (Sandbox)
 * Finanças Pro - Execução 100% em memória (não afeta base real)
 */

(function () {
  let simulatedExpenses = [];
  let simDlgId = null;

  const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const DEFAULT_CATEGORIES = ['Moradia', 'Lazer', 'Alimentação', 'Cartão', 'Transporte', 'Saúde', 'Educação', 'Gerais', 'Outros'];
  const DEFAULT_DESTINATIONS = [
    { name: 'XP Investimentos', color: '#1F7A5C', icon: 'bank' },
    { name: 'BTG Pactual', color: '#2563EB', icon: 'bank' },
    { name: 'Nubank', color: '#8B5CF6', icon: 'card' },
    { name: 'Neon', color: '#06B6D4', icon: 'card' },
    { name: 'Pix', color: '#10B981', icon: 'dollar' },
    { name: 'Em dinheiro', color: '#F59E0B', icon: 'wallet' },
    { name: 'Terceiro', color: '#6B7280', icon: 'globe' },
    { name: 'Itaú', color: '#F97316', icon: 'card' },
    { name: 'Bradesco', color: '#EF4444', icon: 'card' },
    { name: 'Binance', color: '#EAB308', icon: 'globe' }
  ];

  function getState() {
    return window.state || window.FP_STATE || {};
  }

  function notify(msg, type = 'info') {
    if (typeof window.notify === 'function') {
      window.notify(msg, type);
    } else if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    }
  }

  function currency(val) {
    if (typeof window.currency === 'function') return window.currency(val);
    return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function uid() {
    if (typeof window.uid === 'function') return window.uid();
    return 'sim_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function fillSimSelects() {
    const state = getState();
    const startMonthSel = document.getElementById('simFormStartMonth');
    const startYearSel = document.getElementById('simFormStartYear');
    const catSel = document.getElementById('simFormCategory');
    const destSel = document.getElementById('simFormDestination');

    if (startMonthSel && startMonthSel.options.length === 0) {
      startMonthSel.innerHTML = MONTH_NAMES.map((name, idx) => `<option value="${idx + 1}">${name}</option>`).join('');
    }
    if (startYearSel && startYearSel.options.length === 0) {
      const curY = state.year || new Date().getFullYear();
      let opts = '';
      for (let y = curY - 1; y <= curY + 5; y++) {
        opts += `<option value="${y}" ${y === curY ? 'selected' : ''}>${y}</option>`;
      }
      startYearSel.innerHTML = opts;
    }
    if (catSel) {
      const categories = state.categories && state.categories.length ? state.categories : DEFAULT_CATEGORIES;
      catSel.innerHTML = categories.map(c => {
        const name = (typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : (c.name || 'Gerais'));
        return `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
      }).join('');
    }
    if (destSel) {
      const destinations = state.destinations && state.destinations.length ? state.destinations : DEFAULT_DESTINATIONS;
      destSel.innerHTML = destinations.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
    }
  }

  function updateSimBadge() {
    const amt = Number(document.getElementById('simFormAmount')?.value) || 0;
    const inst = Number(document.getElementById('simFormInstallments')?.value) || 1;
    const total = amt * inst;
    const badge = document.getElementById('simFormTotalBadge');
    if (badge) {
      badge.textContent = `Total do Contrato: ${currency(total)} (${inst}x de ${currency(amt)})`;
    }
  }

  function openSimDialog(mode, id) {
    fillSimSelects();
    const form = document.getElementById('simForm');
    if (form) form.reset();
    simDlgId = id || null;

    const delBtn = document.getElementById('simFormDeleteBtn');
    if (delBtn) delBtn.hidden = !id;

    const state = getState();
    const simDlg = document.getElementById('simDialog');

    if (mode === 'new') {
      const titleEl = document.getElementById('simDialogTitle');
      if (titleEl) titleEl.textContent = 'Adicionar Gasto Simulado';

      const mEl = document.getElementById('simFormStartMonth');
      const yEl = document.getElementById('simFormStartYear');
      const iEl = document.getElementById('simFormInstallments');
      const aEl = document.getElementById('simFormAmount');
      const nEl = document.getElementById('simFormName');
      const noteEl = document.getElementById('simFormNote');

      if (mEl) mEl.value = state.month || (new Date().getMonth() + 1);
      if (yEl) yEl.value = state.year || new Date().getFullYear();
      if (iEl) iEl.value = 12;
      if (aEl) aEl.value = '';
      if (nEl) nEl.value = '';
      if (noteEl) noteEl.value = '';
    } else {
      const item = simulatedExpenses.find(x => x.id === id);
      if (!item) return;
      const titleEl = document.getElementById('simDialogTitle');
      if (titleEl) titleEl.textContent = 'Editar Gasto Simulado';

      const nEl = document.getElementById('simFormName');
      const aEl = document.getElementById('simFormAmount');
      const iEl = document.getElementById('simFormInstallments');
      const mEl = document.getElementById('simFormStartMonth');
      const yEl = document.getElementById('simFormStartYear');
      const cEl = document.getElementById('simFormCategory');
      const dEl = document.getElementById('simFormDestination');
      const noteEl = document.getElementById('simFormNote');

      if (nEl) nEl.value = item.name || '';
      if (aEl) aEl.value = item.amount || '';
      if (iEl) iEl.value = item.installments || 1;
      if (mEl) mEl.value = item.startMonth || state.month;
      if (yEl) yEl.value = item.startYear || state.year;
      if (cEl) cEl.value = item.group || '';
      if (dEl) dEl.value = item.destination || '';
      if (noteEl) noteEl.value = item.note || '';
    }

    updateSimBadge();
    if (simDlg && typeof simDlg.showModal === 'function') {
      simDlg.showModal();
    }
  }

  function deleteSimExpense(id) {
    simulatedExpenses = simulatedExpenses.filter(x => x.id !== id);
    const simDlg = document.getElementById('simDialog');
    if (simDlg && simDlg.open) simDlg.close();

    renderSimulationTab();
    notify('Despesa simulada removida do sandbox!', 'info');
  }

  function calculateSimProjection() {
    const state = getState();
    const curYear = Number(state.year) || new Date().getFullYear();
    const baseSalary = Number(state.profile?.baseSalary || 0);
    const monthsData = [];

    for (let m = 1; m <= 12; m++) {
      const target = curYear * 12 + m;

      // 1. Despesas Fixas Reais
      let realFixed = 0;
      (state.fixed || []).forEach(f => {
        if (f.endedFrom && target >= (f.endedFrom.year * 12 + f.endedFrom.month)) return;
        const versions = [...(f.versions || [{ amount: f.amount, year: f.startYear, month: f.startMonth }])].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
        let active = null;
        for (const v of versions) {
          if ((v.year * 12 + v.month) <= target) active = v; else break;
        }
        if (active) realFixed += Number(active.amount || 0);
      });

      // 2. Despesas Variáveis Reais
      let realVar = 0;
      (state.variable || []).forEach(v => {
        const sTarget = (v.startYear || curYear) * 12 + (v.startMonth || 1);
        const eTarget = v.endYear && v.endMonth ? (v.endYear * 12 + v.endMonth) : (sTarget + (v.installments || 1) - 1);
        if (target >= sTarget && target <= eTarget) {
          realVar += Number(v.amount || 0);
        }
      });

      // 3. Rendas Extras & Devedores
      let realExtra = 0;
      (state.extras || []).forEach(e => {
        if (e.includeInSimulation !== false) {
              const sTarget = (Number(e.startYear) || curYear) * 12 + (Number(e.startMonth) || 1);
              const eTarget = (Number(e.endYear) || curYear) * 12 + (Number(e.endMonth) || 12);
              if (target >= sTarget && target <= eTarget) {
                realExtra += Number(e.amount || 0);
              }
            }
          });
      (state.debtors || []).forEach(d => {
        if (d.includeInSimulation !== false) {
              const sTarget = (Number(d.startYear) || curYear) * 12 + (Number(d.startMonth) || 1);
              const eTarget = (Number(d.endYear) || curYear) * 12 + (Number(d.endMonth) || 12);
              if (target >= sTarget && target <= eTarget) {
                realExtra += Number(d.amount || 0);
              }
            }
          });

      const realTotalExp = realFixed + realVar;
      const totalIncome = baseSalary + realExtra;
      const realSobra = totalIncome - realTotalExp;

      // 4. Despesas Injetadas da Simulação
      let simExtraExp = 0;
      simulatedExpenses.forEach(sim => {
        const sTarget = (sim.startYear || curYear) * 12 + (sim.startMonth || 1);
        const eTarget = sTarget + (sim.installments || 1) - 1;
        if (target >= sTarget && target <= eTarget) {
          simExtraExp += Number(sim.amount || 0);
        }
      });

      const simTotalExp = realTotalExp + simExtraExp;
      const simSobra = totalIncome - simTotalExp;

      monthsData.push({
        month: m,
        year: curYear,
        totalIncome,
        realTotalExp,
        realSobra,
        simExtraExp,
        simTotalExp,
        simSobra,
        isRealDeficit: realSobra < 0,
        isSimDeficit: simSobra < 0,
        newlyDeficit: realSobra >= 0 && simSobra < 0
      });
    }

    return monthsData;
  }

  function renderSimulationTab() {
    const state = getState();
    const curYear = Number(state.year) || new Date().getFullYear();
    const curMonth = Number(state.month) || (new Date().getMonth() + 1);

    const yearLabel = document.getElementById('simYearLabel');
    if (yearLabel) yearLabel.textContent = curYear;

    const projection = calculateSimProjection();
    const curMData = projection[curMonth - 1] || projection[0];

    // 1. CARDS COMPARATIVOS DE IMPACTO (KPIS)
    const metricsContainer = document.getElementById('simMetrics');
    if (metricsContainer) {
      const monthsInRisk = projection.filter(d => d.isSimDeficit);
      const newlyDeficitMonths = projection.filter(d => d.newlyDeficit);
      const isSimPositive = curMData.simSobra >= 0;
      const simSobraClass = isSimPositive ? 'positive' : 'negative';

      metricsContainer.innerHTML = `
        <div class="metric">
          <div class="label">Sobra Atual vs. Sobra com Simulação</div>
          <div class="value num ${simSobraClass}" style="display:flex; align-items:baseline; gap:6px; flex-wrap:wrap;">
            <span>${currency(curMData.simSobra)}</span>
            <small style="font-size:.78rem; font-weight:700; color:var(--muted); text-decoration:line-through;">${currency(curMData.realSobra)}</small>
          </div>
          <div class="sub">
            ${curMData.simExtraExp > 0 ? `<span style="color:var(--danger, #EF4444); font-weight:750;">-${currency(curMData.simExtraExp)}/mês no orçamento</span>` : 'Nenhum acréscimo neste mês'}
          </div>
        </div>

        <div class="metric">
          <div class="label">Total de Despesas no Mês (${MONTH_NAMES[curMonth - 1] || 'Mês'})</div>
          <div class="value num negative">${currency(curMData.simTotalExp)}</div>
          <div class="sub">Real: ${currency(curMData.realTotalExp)} ${curMData.simExtraExp > 0 ? `+ Simulado: <span style="color:var(--warning, #D97706); font-weight:750;">+${currency(curMData.simExtraExp)}</span>` : ''}</div>
        </div>

        <div class="metric">
          <div class="label">Meses em Risco de Déficit (${curYear})</div>
          <div class="value num ${monthsInRisk.length > 0 ? 'negative' : 'positive'}">
            ${monthsInRisk.length} de 12 meses
          </div>
          <div class="sub">
            ${newlyDeficitMonths.length > 0
              ? `<span style="color:var(--danger, #EF4444); font-weight:800;">⚠️ ${newlyDeficitMonths.map(d => MONTH_ABBR[d.month - 1]).join(', ')} entram no vermelho!</span>`
              : (monthsInRisk.length === 0 ? '<span style="color:var(--brand, #1F7A5C); font-weight:750;">✓ Orçamento 100% positivo no ano</span>' : 'Déficits já existentes')}
          </div>
        </div>
      `;
    }

    // 2. GRÁFICO COMPARATIVO MENSAL (12 MESES)
    const barsContainer = document.getElementById('simMonthlyBarsContainer');
    if (barsContainer) {
      const maxVal = Math.max(...projection.map(x => Math.max(x.realTotalExp, x.simTotalExp, x.totalIncome)), 100);

      barsContainer.innerHTML = `
        <div style="display:flex; align-items:flex-end; gap:8px; height:160px; border-bottom:1px solid var(--line, rgba(0,0,0,0.1)); padding-bottom:8px; overflow-x:auto;">
          ${projection.map(d => {
            const hReal = Math.max(6, Math.round((d.realTotalExp / maxVal) * 120));
            const hSim = Math.max(6, Math.round((d.simTotalExp / maxVal) * 120));
            const isCurMonth = d.month === curMonth;

            const tip = `${MONTH_NAMES[d.month - 1]}: Despesas Reais ${currency(d.realTotalExp)} -> Com Simulação ${currency(d.simTotalExp)} | Sobra: ${currency(d.simSobra)}`;

            return `
              <div class="sim-month-bar-item"
                   data-month="${d.month}"
                   style="flex:1; min-width:34px; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end; cursor:pointer; padding:2px; border-radius:6px; background:${isCurMonth ? 'var(--brand-soft, rgba(31, 122, 92, 0.15))' : 'transparent'};"
                   data-tooltip="${tip}">
                <div style="display:flex; align-items:flex-end; gap:4px; width:100%; justify-content:center;">
                  <div style="width:10px; height:${hReal}px; background:var(--brand, #1F7A5C); border-radius:3px 3px 0 0;" title="Real: ${currency(d.realTotalExp)}"></div>
                  <div style="width:10px; height:${hSim}px; background:${d.isSimDeficit ? 'var(--danger, #EF4444)' : 'var(--warning, #D97706)'}; border-radius:3px 3px 0 0;" title="Simulado: ${currency(d.simTotalExp)}"></div>
                </div>
                <small style="font-size:0.72rem; color:${d.isSimDeficit ? 'var(--danger, #EF4444)' : (isCurMonth ? 'var(--brand, #1F7A5C)' : 'var(--muted, #6B7280)')}; font-weight:${isCurMonth || d.isSimDeficit ? '800' : '600'}; margin-top:4px;">
                  ${MONTH_ABBR[d.month - 1]}
                </small>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // 3. PAINEL DUPLO: COLUNA ESQUERDA (DESPESAS REAIS DO MÊS)
    const realListEl = document.getElementById('simRealList');
    const realTotalEl = document.getElementById('simRealTotal');
    if (realTotalEl) realTotalEl.textContent = currency(curMData.realTotalExp);

    if (realListEl) {
      const curTarget = curYear * 12 + curMonth;
      const activeFixed = (state.fixed || []).filter(f => {
        if (f.endedFrom && curTarget >= (f.endedFrom.year * 12 + f.endedFrom.month)) return false;
        return true;
      });
      const activeVar = (state.variable || []).filter(v => {
        const sTarget = (v.startYear || curYear) * 12 + (v.startMonth || 1);
        const eTarget = v.endYear && v.endMonth ? (v.endYear * 12 + v.endMonth) : (sTarget + (v.installments || 1) - 1);
        return curTarget >= sTarget && curTarget <= eTarget;
      });

      if (activeFixed.length === 0 && activeVar.length === 0) {
        realListEl.innerHTML = `<div class="empty" style="padding:20px; color:var(--muted); text-align:center;">Nenhuma despesa real vigente neste mês.</div>`;
      } else {
        let html = '';
        activeFixed.forEach(f => {
          const versions = [...(f.versions || [{ amount: f.amount, year: f.startYear, month: f.startMonth }])].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
          let activeV = null;
          for (const v of versions) {
            if ((v.year * 12 + v.month) <= curTarget) activeV = v; else break;
          }
          const amt = activeV ? Number(activeV.amount || 0) : f.amount;
          html += `
            <div class="entry-item" style="border-left:3px solid var(--c-fixed, #10B981); cursor:default; padding:8px 10px; margin-bottom:6px; background:var(--surface-2, rgba(0,0,0,0.02)); border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
              <div class="entry-main">
                <span class="entry-title" style="font-weight:700;">${escapeHtml(f.name)}</span>
                <div class="entry-meta" style="font-size:0.75rem; color:var(--muted); margin-top:2px;">
                  <span class="tag" style="background:var(--c-fixed-soft, rgba(16,185,129,0.15)); color:var(--c-fixed, #10B981); font-weight:700;">Fixa</span>
                  <span class="tag">${escapeHtml(f.group || 'Gerais')}</span>
                  <span>${escapeHtml(f.destination || 'Gerais')}</span>
                </div>
              </div>
              <div class="entry-right">
                <span class="entry-amount num negative" style="font-weight:800;">${currency(amt)}</span>
              </div>
            </div>
          `;
        });

        activeVar.forEach(v => {
          const sTarget = (v.startYear || curYear) * 12 + (v.startMonth || 1);
          const curInst = (curTarget - sTarget) + 1;
          html += `
            <div class="entry-item" style="border-left:3px solid var(--c-variable, #3B82F6); cursor:default; padding:8px 10px; margin-bottom:6px; background:var(--surface-2, rgba(0,0,0,0.02)); border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
              <div class="entry-main">
                <span class="entry-title" style="font-weight:700;">${escapeHtml(v.name)}</span>
                <div class="entry-meta" style="font-size:0.75rem; color:var(--muted); margin-top:2px;">
                  <span class="tag" style="background:var(--c-variable-soft, rgba(59,130,246,0.15)); color:var(--c-variable, #3B82F6); font-weight:700;">${curInst}/${v.installments || 1}x</span>
                  <span class="tag">${escapeHtml(v.group || 'Gerais')}</span>
                  <span>${escapeHtml(v.destination || 'Gerais')}</span>
                </div>
              </div>
              <div class="entry-right">
                <span class="entry-amount num negative" style="font-weight:800;">${currency(v.amount)}</span>
              </div>
            </div>
          `;
        });

        realListEl.innerHTML = html;
      }
    }

    // 4. PAINEL DUPLO: COLUNA DIREITA (DESPESAS SIMULADAS)
    const injectedListEl = document.getElementById('simInjectedList');
    const injectedTotalEl = document.getElementById('simInjectedTotal');
    if (injectedTotalEl) injectedTotalEl.textContent = `+${currency(curMData.simExtraExp)}`;

    if (injectedListEl) {
      const curTarget = curYear * 12 + curMonth;
      const activeSim = simulatedExpenses.filter(sim => {
        const sTarget = (sim.startYear || curYear) * 12 + (sim.startMonth || 1);
        const eTarget = sTarget + (sim.installments || 1) - 1;
        return curTarget >= sTarget && curTarget <= eTarget;
      });

      if (simulatedExpenses.length === 0) {
        injectedListEl.innerHTML = `
          <div class="empty" style="padding:28px; text-align:center; color:var(--muted);">
            <p style="margin-bottom:10px; font-weight:600;">Nenhum gasto simulado injetado ainda.</p>
            <button type="button" class="btn primary small" id="emptySimAddBtn" style="margin:0 auto;">
              + Adicionar Gasto Simulado
            </button>
          </div>
        `;
        document.getElementById('emptySimAddBtn')?.addEventListener('click', () => openSimDialog('new'));
      } else if (activeSim.length === 0) {
        injectedListEl.innerHTML = `
          <div class="empty" style="padding:20px; text-align:center; color:var(--muted);">
            <p>Nenhuma despesa simulada vigente neste mês específico (${MONTH_NAMES[curMonth - 1] || 'Mês'}).</p>
            <small style="color:var(--muted);">Existem ${simulatedExpenses.length} simulação(ões) ativas em outros meses de ${curYear}.</small>
          </div>
        `;
      } else {
        injectedListEl.innerHTML = activeSim.map(sim => {
          const sTarget = (sim.startYear || curYear) * 12 + (sim.startMonth || 1);
          const curInst = (curTarget - sTarget) + 1;
          const totalCost = Number(sim.amount) * Number(sim.installments || 1);

          return `
            <div class="entry-item" style="border-left:3px solid var(--warning, #D97706); padding:8px 10px; margin-bottom:6px; background:var(--surface-2, rgba(0,0,0,0.02)); border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
              <div class="entry-main">
                <span class="entry-title" style="font-weight:700;">${escapeHtml(sim.name)}</span>
                <div class="entry-meta" style="font-size:0.75rem; color:var(--muted); margin-top:2px;">
                  <span class="tag" style="background:var(--warning-soft, rgba(217,119,6,0.15)); color:var(--warning, #D97706); font-weight:800;">Simulado ${curInst}/${sim.installments}x</span>
                  <span class="tag">${escapeHtml(sim.group || 'Gerais')}</span>
                  <span>${escapeHtml(sim.destination || 'Gerais')}</span>
                  <span title="Total do Contrato">Total: ${currency(totalCost)}</span>
                </div>
              </div>
              <div class="entry-right" style="display:flex; align-items:center; gap:8px;">
                <span class="entry-amount num negative" style="font-weight:800;">${currency(sim.amount)}</span>
                <button type="button" class="icon-btn small edit-sim-btn" data-id="${sim.id}" data-tooltip="Editar Simulação" aria-label="Editar Simulação">
                  <svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button type="button" class="icon-btn small del-sim-btn" data-id="${sim.id}" data-tooltip="Excluir Simulação" aria-label="Excluir Simulação" style="color:var(--danger, #EF4444);">
                  <svg class="svg-icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
          `;
        }).join('');

        injectedListEl.querySelectorAll('.edit-sim-btn').forEach(b => {
          b.addEventListener('click', () => openSimDialog('edit', b.getAttribute('data-id')));
        });
        injectedListEl.querySelectorAll('.del-sim-btn').forEach(b => {
          b.addEventListener('click', () => deleteSimExpense(b.getAttribute('data-id')));
        });
      }
    }
  }

  function initSimulationEvents() {
    const barsContainer = document.getElementById('simMonthlyBarsContainer');
    if (barsContainer && !barsContainer.dataset.clickInit) {
      barsContainer.dataset.clickInit = 'true';
      barsContainer.addEventListener('click', (e) => {
        const itemEl = e.target.closest('[data-month]');
        if (itemEl) {
          const m = Number(itemEl.getAttribute('data-month'));
          if (m >= 1 && m <= 12) {
            if (window.state) { window.state.month = m; }
            if (typeof window.render === 'function') {
              window.render();
            } else {
              window.initSimulation();
            }
          }
        }
      });
    }

    const simForm = document.getElementById('simForm');
    if (simForm && !simForm.dataset.simulationInit) {
      simForm.dataset.simulationInit = 'true';

      document.getElementById('simFormAmount')?.addEventListener('input', updateSimBadge);
      document.getElementById('simFormInstallments')?.addEventListener('input', updateSimBadge);

      simForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const state = getState();
        const name = (document.getElementById('simFormName')?.value || '').trim();
        const amount = Number(document.getElementById('simFormAmount')?.value) || 0;
        const installments = Number(document.getElementById('simFormInstallments')?.value) || 1;
        const startMonth = Number(document.getElementById('simFormStartMonth')?.value) || state.month;
        const startYear = Number(document.getElementById('simFormStartYear')?.value) || state.year;
        const group = document.getElementById('simFormCategory')?.value || 'Gerais';
        const destination = document.getElementById('simFormDestination')?.value || 'Nubank';
        const note = (document.getElementById('simFormNote')?.value || '').trim();

        if (!name || amount <= 0) {
          notify('Por favor, informe a descrição e o valor da parcela.', 'error');
          return;
        }

        if (simDlgId) {
          const item = simulatedExpenses.find(x => x.id === simDlgId);
          if (item) {
            item.name = name;
            item.amount = amount;
            item.installments = installments;
            item.startMonth = startMonth;
            item.startYear = startYear;
            item.group = group;
            item.destination = destination;
            item.note = note;
          }
        } else {
          simulatedExpenses.push({
            id: uid(),
            name,
            amount,
            installments,
            startMonth,
            startYear,
            group,
            destination,
            note
          });
        }

        const simDlg = document.getElementById('simDialog');
        if (simDlg && simDlg.open) simDlg.close();

        renderSimulationTab();
        notify(`Simulação "${name}" injetada no cenário com sucesso!`, 'success');
      });
    }

    const delBtn = document.getElementById('simFormDeleteBtn');
    if (delBtn && !delBtn.dataset.simulationInit) {
      delBtn.dataset.simulationInit = 'true';
      delBtn.addEventListener('click', () => {
        if (simDlgId) deleteSimExpense(simDlgId);
      });
    }

    const addBtn = document.getElementById('simAddBtn');
    if (addBtn && !addBtn.dataset.simulationInit) {
      addBtn.dataset.simulationInit = 'true';
      addBtn.addEventListener('click', () => openSimDialog('new'));
    }

    const resetBtn = document.getElementById('simResetBtn');
    if (resetBtn && !resetBtn.dataset.simulationInit) {
      resetBtn.dataset.simulationInit = 'true';
      resetBtn.addEventListener('click', () => {
        if (simulatedExpenses.length === 0) {
          notify('O sandbox já está sem despesas simuladas.', 'info');
          return;
        }
        simulatedExpenses = [];
        renderSimulationTab();
        notify('Simulação resetada! O cenário reflete exatamente seus dados oficiais.', 'info');
      });
    }
  }

  function setupRibbonHider() {
    const ribbonCard = document.querySelector('.ribbon-card') || document.getElementById('ribbonSection');
    if (!ribbonCard) return;

    // Se já estava oculto nesta sessão, esconde direto
    if (sessionStorage.getItem('hide_months_ribbon') === 'true') {
      ribbonCard.style.display = 'none';
      return;
    }

    if (!ribbonCard.dataset.hiddenListener) {
      ribbonCard.dataset.hiddenListener = 'true';
      ribbonCard.style.cursor = 'pointer';
      ribbonCard.title = 'Clique para ocultar esta barra de meses até o próximo reload';
      ribbonCard.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        sessionStorage.setItem('hide_months_ribbon', 'true');
        ribbonCard.style.transition = 'opacity 0.3s ease';
        ribbonCard.style.opacity = '0';
        setTimeout(() => {
          ribbonCard.style.display = 'none';
        }, 300);
      });
    }
  }

  // Expor globalmente
  window.initSimulation = function () {
    setupRibbonHider();
    initSimulationEvents();
    renderSimulationTab();
  };

  window.renderSimulationTab = renderSimulationTab;
  window.openSimDialog = openSimDialog;
  window.deleteSimExpense = deleteSimExpense;
  window.calculateSimProjection = calculateSimProjection;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.initSimulation();
    });
  } else {
    window.initSimulation();
  }
})();
