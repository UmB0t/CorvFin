/**
 * Finanças Pro - Módulo Sandbox de Simulação de Despesas
 * Isolamento total: executa 100% em memória sem persistir dados no servidor
 */
const SimulationModule = (() => {
  let simulatedExpenses = [];
  let simDlgId = null;

  function uid() { return 'sim_' + Math.random().toString(36).slice(2, 10); }
  function currency(val) { return window.currency ? window.currency(val) : (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  // Deep clone real financial state for simulation
  function getClonedBaseState() {
    try {
      return JSON.parse(JSON.stringify(window.FP_STATE || window.state || {}));
    } catch (_) {
      return {};
    }
  }

  // Calculate Monthly Projection with and without simulated expenses
  function calculateComparativeScenario() {
    const baseState = getClonedBaseState();
    const curYear = baseState.year || new Date().getFullYear();
    const baseSalary = Number(baseState.profile?.baseSalary || 0);

    const months = [];

    for (let m = 1; m <= 12; m++) {
      const target = curYear * 12 + m;

      // 1. Real Expenses
      let realFixed = 0;
      (baseState.fixed || []).forEach(f => {
        if (f.endedFrom && target >= (f.endedFrom.year * 12 + f.endedFrom.month)) return;
        const versions = [...(f.versions || [{ amount: f.amount, year: f.startYear, month: f.startMonth }])].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
        let active = null;
        for (const v of versions) {
          if ((v.year * 12 + v.month) <= target) active = v; else break;
        }
        if (active) realFixed += Number(active.amount || 0);
      });

      let realVar = 0;
      (baseState.variable || []).forEach(v => {
        const sTarget = (v.startYear || curYear) * 12 + (v.startMonth || 1);
        const eTarget = v.endYear && v.endMonth ? (v.endYear * 12 + v.endMonth) : (sTarget + (v.installments || 1) - 1);
        if (target >= sTarget && target <= eTarget) {
          realVar += Number(v.amount || 0);
        }
      });

      // Extra Income & Debtors
      let realExtra = 0;
      (baseState.extras || []).forEach(e => {
        if (Number(e.year) === curYear && Number(e.month) === m) {
          realExtra += Number(e.amount || 0);
        }
      });
      (baseState.debtors || []).forEach(d => {
        if (d.countInTotal) {
          const sTarget = (d.startYear || curYear) * 12 + (d.startMonth || 1);
          const eTarget = (d.endYear || curYear) * 12 + (d.endMonth || 12);
          if (target >= sTarget && target <= eTarget) {
            realExtra += Number(d.amount || 0);
          }
        }
      });

      const realTotalExp = realFixed + realVar;
      const totalIncome = baseSalary + realExtra;
      const realSobra = totalIncome - realTotalExp;

      // 2. Simulated Injections
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

      months.push({
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

    return months;
  }

  // Render Comparator Cards and Projection
  function render() {
    const baseState = getClonedBaseState();
    const curYear = baseState.year || new Date().getFullYear();
    const curMonth = baseState.month || (new Date().getMonth() + 1);

    const yearLabel = document.getElementById('simYearLabel');
    if (yearLabel) yearLabel.textContent = curYear;

    const projection = calculateComparativeScenario();
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
            ${curMData.simExtraExp > 0 ? `<span style="color:var(--danger); font-weight:750;">-${currency(curMData.simExtraExp)}/mês no orçamento</span>` : 'Nenhum acréscimo neste mês'}
          </div>
        </div>

        <div class="metric">
          <div class="label">Total de Despesas no Mês (${window.MONTH_NAMES ? window.MONTH_NAMES[curMonth - 1] : 'Mês'})</div>
          <div class="value num negative">${currency(curMData.simTotalExp)}</div>
          <div class="sub">Real: ${currency(curMData.realTotalExp)} ${curMData.simExtraExp > 0 ? `+ Simulado: <span style="color:var(--warning); font-weight:750;">+${currency(curMData.simExtraExp)}</span>` : ''}</div>
        </div>

        <div class="metric">
          <div class="label">Meses em Risco de Déficit (${curYear})</div>
          <div class="value num ${monthsInRisk.length > 0 ? 'negative' : 'positive'}">
            ${monthsInRisk.length} de 12 meses
          </div>
          <div class="sub">
            ${newlyDeficitMonths.length > 0
              ? `<span style="color:var(--danger); font-weight:800;">⚠️ ${newlyDeficitMonths.map(d => (window.MONTH_ABBR ? window.MONTH_ABBR[d.month - 1] : d.month)).join(', ')} entram no vermelho!</span>`
              : (monthsInRisk.length === 0 ? '<span style="color:var(--brand); font-weight:750;">✓ Orçamento 100% positivo no ano</span>' : 'Déficits já existentes')}
          </div>
        </div>
      `;
    }

    // 2. GRÁFICO COMPARATIVO MENSAL (12 MESES)
    const barsContainer = document.getElementById('simMonthlyBarsContainer');
    if (barsContainer) {
      const maxVal = Math.max(...projection.map(x => Math.max(x.realTotalExp, x.simTotalExp, x.totalIncome)), 100);

      barsContainer.innerHTML = `
        <div style="display:flex; align-items:flex-end; gap:8px; height:160px; border-bottom:1px solid var(--line); padding-bottom:8px; overflow-x:auto;">
          ${projection.map(d => {
            const hReal = Math.max(6, Math.round((d.realTotalExp / maxVal) * 120));
            const hSim = Math.max(6, Math.round((d.simTotalExp / maxVal) * 120));
            const isCurMonth = d.month === curMonth;
            const monthName = window.MONTH_NAMES ? window.MONTH_NAMES[d.month - 1] : `Mês ${d.month}`;
            const monthAbbr = window.MONTH_ABBR ? window.MONTH_ABBR[d.month - 1] : `M${d.month}`;

            const tip = `${monthName}: Despesas Reais ${currency(d.realTotalExp)} -> Com Simulação ${currency(d.simTotalExp)} | Sobra: ${currency(d.simSobra)}`;

            return `
              <div style="flex:1; min-width:34px; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end; cursor:pointer; padding:2px; border-radius:6px; background:${isCurMonth ? 'var(--brand-soft)' : 'transparent'};"
                   data-tooltip="${tip}">
                <div style="display:flex; align-items:flex-end; gap:4px; width:100%; justify-content:center;">
                  <div style="width:10px; height:${hReal}px; background:var(--brand); border-radius:3px 3px 0 0;" title="Real: ${currency(d.realTotalExp)}"></div>
                  <div style="width:10px; height:${hSim}px; background:${d.isSimDeficit ? 'var(--danger)' : 'var(--warning, #D97706)'}; border-radius:3px 3px 0 0;" title="Simulado: ${currency(d.simTotalExp)}"></div>
                </div>
                <small style="font-size:0.72rem; color:${d.isSimDeficit ? 'var(--danger)' : (isCurMonth ? 'var(--brand)' : 'var(--muted)')}; font-weight:${isCurMonth || d.isSimDeficit ? '800' : '600'}; margin-top:4px;">
                  ${monthAbbr}
                </small>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
  }

  return {
    render,
    reset: () => { simulatedExpenses = []; render(); },
    getSimulated: () => [...simulatedExpenses],
    addSimulated: (item) => { simulatedExpenses.push(Object.assign({ id: uid() }, item)); render(); }
  };
})();
