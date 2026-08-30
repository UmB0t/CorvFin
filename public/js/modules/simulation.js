const MONTH_NAMES = (typeof window !== 'undefined' && window.MONTH_NAMES) || ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTH_ABBR = (typeof window !== 'undefined' && window.MONTH_ABBR) || ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/* ==========================================================================
   MÓDULO DE SIMULAÇÃO DE DESPESAS (SANDBOX - 100% EM MEMÓRIA COM PERSISTÊNCIA DE CENÁRIOS)
   ========================================================================== */
let simulatedExpenses = [];
let simDlgId = null;
let simulationToggles = {
  includeExtras: false,
  includeDebtors: false
};
let simulationYear = null;

function getSimulationYear() {
  const state = getState();
  return simulationYear || state?.year || new Date().getFullYear();
}

function setSimulationYear(year) {
  const y = Number(year);
  if (y > 1900 && y < 2200) {
    simulationYear = y;
    renderSimulationTab();
  }
}

function getSimulationToggles() {
  return simulationToggles;
}

function setSimulationToggles(toggles) {
  simulationToggles = Object.assign(simulationToggles, toggles);
  renderSimulationTab();
}

function fillSimSelects() {
  const state = getState();
  const startMonthSel = $('#simFormStartMonth');
  const startYearSel = $('#simFormStartYear');
  const catSel = $('#simFormCategory');
  const destSel = $('#simFormDestination');

  if (startMonthSel && startMonthSel.options.length === 0) {
    startMonthSel.innerHTML = MONTH_NAMES.map((name, idx) => `<option value="${idx + 1}">${name}</option>`).join('');
  }
  if (startYearSel) {
    const curY = getSimulationYear();
    let opts = '';
    for (let y = curY - 2; y <= curY + 6; y++) {
      opts += `<option value="${y}" ${y === curY ? 'selected' : ''}>${y}</option>`;
    }
    startYearSel.innerHTML = opts;
  }
  if (catSel) {
    const cats = (state.categories && state.categories.length) ? state.categories : (window.DEFAULT_CATEGORIES || []);
    catSel.innerHTML = cats.map(c => {
      const name = (typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : (c.name || 'Gerais'));
      return `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
    }).join('');
  }
  if (destSel) {
    destSel.innerHTML = (state.destinations || DEFAULT_DESTINATIONS).map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
  }
}

function updateSimBadge() {
  const amt = Number($('#simFormAmount')?.value) || 0;
  const inst = Number($('#simFormInstallments')?.value) || 1;
  const total = amt * inst;
  const badge = $('#simFormTotalBadge');
  if (badge) {
    badge.textContent = `Total do Contrato: ${currency(total)} (${inst}x de ${currency(amt)})`;
  }
}

$('#simFormAmount')?.addEventListener('input', updateSimBadge);
$('#simFormInstallments')?.addEventListener('input', updateSimBadge);

function openSimDialog(mode, id) {
  const state = getState();
  const simDlg = $('#simDialog');
  fillSimSelects();
  $('#simForm')?.reset();
  simDlgId = id || null;
  const delBtn = $('#simFormDeleteBtn');
  if (delBtn) delBtn.hidden = !id;

  const activeYear = getSimulationYear();

  if (mode === 'new') {
    $('#simDialogTitle').textContent = 'Adicionar Gasto Simulado';
    $('#simFormStartMonth').value = state.month || 1;
    $('#simFormStartYear').value = activeYear;
    $('#simFormInstallments').value = 12;
    $('#simFormAmount').value = '';
    $('#simFormName').value = '';
    $('#simFormNote').value = '';
  } else {
    const item = simulatedExpenses.find(x => x.id === id);
    if (!item) return;
    $('#simDialogTitle').textContent = 'Editar Gasto Simulado';
    $('#simFormName').value = item.name || '';
    $('#simFormAmount').value = item.amount || '';
    $('#simFormInstallments').value = item.installments || 1;
    $('#simFormStartMonth').value = item.startMonth || state.month || 1;
    $('#simFormStartYear').value = item.startYear || activeYear;
    $('#simFormCategory').value = item.group || '';
    $('#simFormDestination').value = item.destination || '';
    $('#simFormNote').value = item.note || '';
  }
  updateSimBadge();
  if (simDlg) simDlg.showModal();
}

function deleteSimExpense(id) {
  const simDlg = $('#simDialog');
  simulatedExpenses = simulatedExpenses.filter(x => x.id !== id);
  if (simDlg && simDlg.open) simDlg.close();
  renderSimulationTab();
  notify('Despesa simulada removida do sandbox!', 'info');
}

$('#simFormDeleteBtn')?.addEventListener('click', () => {
  if (simDlgId) deleteSimExpense(simDlgId);
});

$('#simForm')?.addEventListener('submit', (e) => {
  const state = getState();
  const simDlg = $('#simDialog');
  e.preventDefault();
  const name = $('#simFormName').value.trim();
  const amount = Number($('#simFormAmount').value) || 0;
  const installments = Number($('#simFormInstallments').value) || 1;
  const startMonth = Number($('#simFormStartMonth').value) || state.month || 1;
  const startYear = Number($('#simFormStartYear').value) || getSimulationYear();
  const group = $('#simFormCategory').value;
  const destination = $('#simFormDestination').value;
  const note = $('#simFormNote').value.trim();

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
      id: (typeof uid === 'function' ? uid() : 'sim_' + Math.random().toString(36).substr(2, 9)),
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

  if (simDlg) simDlg.close();
  renderSimulationTab();
  notify(`Simulação "${name}" injetada no cenário com sucesso!`, 'success');
});

$('#simAddBtn')?.addEventListener('click', () => openSimDialog('new'));

$('#simResetBtn')?.addEventListener('click', () => {
  const state = getState();
  const hadSim = simulatedExpenses.length > 0 || simulationToggles.includeExtras || simulationToggles.includeDebtors || (simulationYear !== null && simulationYear !== state.year);
  simulatedExpenses = [];
  simulationToggles.includeExtras = false;
  simulationToggles.includeDebtors = false;
  simulationYear = state.year;
  if ($('#simIncludeExtras')) $('#simIncludeExtras').checked = false;
  if ($('#simIncludeDebtors')) $('#simIncludeDebtors').checked = false;
  renderSimulationTab();
  if (hadSim) {
    notify('Simulação resetada! O cenário reflete exatamente seus dados oficiais.', 'info');
  } else {
    notify('O sandbox já está sem despesas simuladas.', 'info');
  }
});

// Controles de Navegação de Ano da Simulação
$('#simPrevYearBtn')?.addEventListener('click', () => {
  const activeYear = getSimulationYear();
  simulationYear = activeYear - 1;
  renderSimulationTab();
});

$('#simNextYearBtn')?.addEventListener('click', () => {
  const activeYear = getSimulationYear();
  simulationYear = activeYear + 1;
  renderSimulationTab();
});

$('#simIncludeExtras')?.addEventListener('change', (e) => {
  simulationToggles.includeExtras = !!e.target.checked;
  renderSimulationTab();
});

$('#simIncludeDebtors')?.addEventListener('change', (e) => {
  simulationToggles.includeDebtors = !!e.target.checked;
  renderSimulationTab();
});

// Diálogo de Salvar Cenário de Simulação
$('#simSaveBtn')?.addEventListener('click', () => {
  const saveDlg = $('#saveSimulationDialog');
  if (!saveDlg) return;
  const activeYear = getSimulationYear();
  const simCount = simulatedExpenses.length;
  $('#saveSimTitle').value = '';
  $('#saveSimDesc').value = '';
  const hintEl = $('#saveSimSummaryHint');
  if (hintEl) {
    hintEl.textContent = `Ano Base: ${activeYear} • ${simCount} gasto(s) simulado(s) • Entradas extras: ${simulationToggles.includeExtras ? 'Sim' : 'Não'} • Devedores: ${simulationToggles.includeDebtors ? 'Sim' : 'Não'}.`;
  }
  saveDlg.showModal();
});

$('#saveSimForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#saveSimTitle')?.value.trim();
  const description = $('#saveSimDesc')?.value.trim() || '';
  if (!title) {
    notify('Informe um título para salvar a simulação.', 'error');
    return;
  }

  const state = getState();
  const activeYear = getSimulationYear();
  const newSimScenario = {
    id: (typeof uid === 'function' ? uid() : 'saved_sim_' + Date.now()),
    title,
    description,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    simulationYear: activeYear,
    snapshot: {
      simulatedExpenses: JSON.parse(JSON.stringify(simulatedExpenses)),
      simulationToggles: Object.assign({}, simulationToggles),
      simulationYear: activeYear
    }
  };

  state.savedSimulations = state.savedSimulations || [];
  state.savedSimulations.unshift(newSimScenario);
  saveState();

  const saveDlg = $('#saveSimulationDialog');
  if (saveDlg && saveDlg.open) saveDlg.close();

  renderSimulationTab();
  notify(`Simulação "${title}" salva com sucesso!`, 'success');
});

function loadSavedSimulation(simId) {
  const state = getState();
  const found = (state.savedSimulations || []).find(s => s.id === simId);
  if (!found) {
    notify('Simulação salva não encontrada.', 'error');
    return;
  }

  const snap = found.snapshot || {};
  simulatedExpenses = JSON.parse(JSON.stringify(snap.simulatedExpenses || []));
  simulationToggles = Object.assign({ includeExtras: false, includeDebtors: false }, snap.simulationToggles || {});
  simulationYear = found.simulationYear || snap.simulationYear || state.year;

  if ($('#simIncludeExtras')) $('#simIncludeExtras').checked = !!simulationToggles.includeExtras;
  if ($('#simIncludeDebtors')) $('#simIncludeDebtors').checked = !!simulationToggles.includeDebtors;

  renderSimulationTab();
  notify(`Cenário "${found.title}" carregado na simulação!`, 'success');
}

function deleteSavedSimulation(simId) {
  const state = getState();
  const target = (state.savedSimulations || []).find(s => s.id === simId);
  const targetTitle = target ? target.title : '';
  state.savedSimulations = (state.savedSimulations || []).filter(s => s.id !== simId);
  saveState();
  renderSimulationTab();
  notify(`Cenário "${targetTitle || 'selecionado'}" excluído.`, 'info');
}

function calculateSimProjection() {
  const state = getState();
  const curYear = getSimulationYear();
  const baseSalary = Number(state.profile?.baseSalary || 0);
  const monthsData = [];

  for (let m = 1; m <= 12; m++) {
    const target = curYear * 12 + m;

    // 1. Real Expenses
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

    let realVar = 0;
    (state.variable || []).forEach(v => {
      const sTarget = (v.startYear || curYear) * 12 + (v.startMonth || 1);
      const eTarget = v.endYear && v.endMonth ? (v.endYear * 12 + v.endMonth) : (sTarget + (v.installments || 1) - 1);
      if (target >= sTarget && target <= eTarget) {
        realVar += Number(v.amount || 0);
      }
    });

    // Extra Incomes & Debtors
    let realExtra = 0;
    if (simulationToggles.includeExtras) {
      (state.extras || []).forEach(e => {
        if (e.includeInSimulation !== false) {
          const sTarget = (Number(e.startYear) || curYear) * 12 + (Number(e.startMonth) || 1);
          const eTarget = (Number(e.endYear) || curYear) * 12 + (Number(e.endMonth) || 12);
          if (target >= sTarget && target <= eTarget) {
            realExtra += Number(e.amount || 0);
          }
        }
      });
    }
    if (simulationToggles.includeDebtors) {
      (state.debtors || []).forEach(d => {
        if (d.includeInSimulation !== false) {
          const sTarget = (Number(d.startYear) || curYear) * 12 + (Number(d.startMonth) || 1);
          const eTarget = (Number(d.endYear) || curYear) * 12 + (Number(d.endMonth) || 12);
          if (target >= sTarget && target <= eTarget) {
            realExtra += Number(d.amount || 0);
          }
        }
      });
    }

    const realTotalExp = realFixed + realVar;
    const totalIncome = baseSalary + realExtra;
    const realSobra = totalIncome - realTotalExp;

    // 2. Simulated Injected Expenses
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
  const activeYear = getSimulationYear();

  const yearLabel = $('#simYearLabel');
  if (yearLabel) yearLabel.textContent = activeYear;

  const yearDisplay = $('#simSelectedYearDisplay');
  if (yearDisplay) yearDisplay.textContent = activeYear;

  const projection = calculateSimProjection();
  const curMData = projection[state.month - 1] || projection[0];

  // 1. CARDS COMPARATIVOS DE IMPACTO (KPIS)
  const metricsContainer = $('#simMetrics');
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
        <div class="label">Total de Despesas no Mês (${MONTH_NAMES[state.month - 1]})</div>
        <div class="value num negative">${currency(curMData.simTotalExp)}</div>
        <div class="sub">Real: ${currency(curMData.realTotalExp)} ${curMData.simExtraExp > 0 ? `+ Simulado: <span style="color:var(--warning); font-weight:750;">+${currency(curMData.simExtraExp)}</span>` : ''}</div>
      </div>

      <div class="metric">
        <div class="label">Meses em Risco de Déficit (${activeYear})</div>
        <div class="value num ${monthsInRisk.length > 0 ? 'negative' : 'positive'}">
          ${monthsInRisk.length} de 12 meses
        </div>
        <div class="sub">
          ${newlyDeficitMonths.length > 0
            ? `<span style="color:var(--danger); font-weight:800;">⚠️ ${newlyDeficitMonths.map(d => MONTH_ABBR[d.month - 1]).join(', ')} entram no vermelho!</span>`
            : (monthsInRisk.length === 0 ? '<span style="color:var(--brand); font-weight:750;">✓ Orçamento 100% positivo no ano</span>' : 'Déficits já existentes')}
        </div>
      </div>
    `;
  }

  // 2. GRÁFICO COMPARATIVO MENSAL (12 MESES) COM PADRÃO RIBBON
  const barsContainer = $('#simMonthlyBarsContainer');
  if (barsContainer) {
    const maxVal = Math.max(...projection.map(x => Math.max(x.realTotalExp, x.simTotalExp, x.totalIncome)), 100);

    barsContainer.innerHTML = `
      <div class="ribbon" style="padding: 4px 0;">
        ${projection.map(d => {
          const hReal = Math.max(6, Math.round((d.realTotalExp / maxVal) * 64));
          const hSim = Math.max(6, Math.round((d.simTotalExp / maxVal) * 64));
          const isCurMonth = d.month === state.month;
          const colClass = `ribbon-col ${isCurMonth ? 'active' : ''} ${d.isSimDeficit ? 'has-deficit' : ''}`;
          const tip = `${MONTH_NAMES[d.month - 1]}: Despesas Reais ${currency(d.realTotalExp)} -> Com Simulação ${currency(d.simTotalExp)} | Sobra Resultante: ${currency(d.simSobra)}`;

          return `
            <button type="button" class="${colClass}" data-tooltip="${tip}" data-month="${d.month}">
              <div class="ribbon-bar" style="flex-direction: row; align-items: flex-end; justify-content: center; gap: 3px; padding: 0 2px;">
                <span style="width: 10px; height: ${hReal}px; background: var(--brand); border-radius: 3px 3px 0 0;" title="Real: ${currency(d.realTotalExp)}"></span>
                <span style="width: 10px; height: ${hSim}px; background: ${d.isSimDeficit ? 'var(--danger)' : 'var(--warning, #D97706)'}; border-radius: 3px 3px 0 0;" title="Simulado: ${currency(d.simTotalExp)}"></span>
              </div>
              <small>${MONTH_ABBR[d.month - 1]}</small>
            </button>
          `;
        }).join('')}
      </div>
    `;

    barsContainer.querySelectorAll('.ribbon-col').forEach(col => {
      col.addEventListener('click', () => {
        const m = Number(col.getAttribute('data-month'));
        if (m) {
          state.month = m;
          if (typeof saveLocalState === 'function') { saveLocalState(); } else if (typeof saveState === 'function') { saveState('month-select'); }
          render();
        }
      });
    });
  }

  // 3. PAINEL DUPLO: COLUNA ESQUERDA (DESPESAS REAIS DO MÊS - SOMENTE LEITURA COM DESIGN SYSTEM)
  const realListEl = $('#simRealList');
  const realTotalEl = $('#simRealTotal');
  if (realTotalEl) realTotalEl.textContent = currency(curMData.realTotalExp);

  if (realListEl) {
    const curTarget = activeYear * 12 + state.month;
    const activeFixed = (state.fixed || []).filter(f => {
      if (f.endedFrom && curTarget >= (f.endedFrom.year * 12 + f.endedFrom.month)) return false;
      return true;
    });
    const activeVar = (state.variable || []).filter(v => {
      const sTarget = (v.startYear || activeYear) * 12 + (v.startMonth || 1);
      const eTarget = v.endYear && v.endMonth ? (v.endYear * 12 + v.endMonth) : (sTarget + (v.installments || 1) - 1);
      return curTarget >= sTarget && curTarget <= eTarget;
    });

    if (activeFixed.length === 0 && activeVar.length === 0) {
      realListEl.innerHTML = `<div class="empty" style="padding:20px;">Nenhuma despesa real vigente neste mês.</div>`;
    } else {
      let html = '';
      activeFixed.forEach(f => {
        const versions = [...(f.versions || [{ amount: f.amount, year: f.startYear, month: f.startMonth }])].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
        let activeV = null;
        for (const v of versions) {
          if ((v.year * 12 + v.month) <= curTarget) activeV = v; else break;
        }
        const catMeta = (typeof getCategoryMeta === 'function') ? getCategoryMeta(f.group || 'Gerais') : { name: f.group || 'Gerais', icon: 'tag', color: '#1F7A5C' };
        const catIconSvg = (typeof getCategoryIconSvg === 'function') ? getCategoryIconSvg(catMeta.icon) : '';
        const amt = activeV ? Number(activeV.amount || 0) : f.amount;
        const destMeta = f.destination ? getDestMeta(f.destination) : null;
        const destIconSvg = destMeta ? (DEST_SVG_ICONS[destMeta.icon] || DEST_SVG_ICONS.card) : '';
        const destPillHtml = (f.destination && f.destination !== 'Renda Extra') ? `
          <span class="tag dest" style="background:${destMeta.color}22; color:${destMeta.color}; border:1px solid ${destMeta.color}44;">
            ${destIconSvg} ${escapeHtml(f.destination)}
          </span>` : '';
        const catColor = catMeta.color || '#1F7A5C';

        html += `
          <div class="entry-row" style="border-left:3px solid var(--c-fixed); cursor:default;">
            <div class="entry-info">
              <div class="entry-title">${escapeHtml(f.name)}</div>
              <div class="entry-meta">
                <span class="tag" style="background:var(--c-fixed-soft); color:var(--c-fixed);">Fixa</span>
                <span class="tag" style="display:inline-flex; align-items:center; gap:4px; background:${catColor}18; color:var(--text); border:1px solid ${catColor}44;"><span style="color:${catColor}; display:inline-flex;">${catIconSvg}</span> ${escapeHtml(f.group || 'Gerais')}</span>
                ${destPillHtml}
              </div>
            </div>
            <div class="entry-amount num negative">${currency(amt)}</div>
          </div>
        `;
      });

      activeVar.forEach(v => {
        const sTarget = (v.startYear || activeYear) * 12 + (v.startMonth || 1);
        const curInst = (curTarget - sTarget) + 1;
        const catMeta = (typeof getCategoryMeta === 'function') ? getCategoryMeta(v.group || 'Gerais') : { name: v.group || 'Gerais', icon: 'tag', color: '#1F7A5C' };
        const catIconSvg = (typeof getCategoryIconSvg === 'function') ? getCategoryIconSvg(catMeta.icon) : '';
        const destMeta = v.destination ? getDestMeta(v.destination) : null;
        const destIconSvg = destMeta ? (DEST_SVG_ICONS[destMeta.icon] || DEST_SVG_ICONS.card) : '';
        const destPillHtml = (v.destination && v.destination !== 'Renda Extra') ? `
          <span class="tag dest" style="background:${destMeta.color}22; color:${destMeta.color}; border:1px solid ${destMeta.color}44;">
            ${destIconSvg} ${escapeHtml(v.destination)}
          </span>` : '';
        const catColor = catMeta.color || '#1F7A5C';

        html += `
          <div class="entry-row" style="border-left:3px solid var(--c-variable); cursor:default;">
            <div class="entry-info">
              <div class="entry-title">${escapeHtml(v.name)}</div>
              <div class="entry-meta">
                <span class="tag" style="background:var(--c-variable-soft); color:var(--c-variable);">${curInst}/${v.installments || 1}x</span>
                <span class="tag" style="display:inline-flex; align-items:center; gap:4px; background:${catColor}18; color:var(--text); border:1px solid ${catColor}44;"><span style="color:${catColor}; display:inline-flex;">${catIconSvg}</span> ${escapeHtml(v.group || 'Gerais')}</span>
                ${destPillHtml}
              </div>
            </div>
            <div class="entry-amount num negative">${currency(v.amount)}</div>
          </div>
        `;
      });

      realListEl.innerHTML = html;
    }
  }

  // 4. PAINEL DUPLO: COLUNA DIREITA (DESPESAS SIMULADAS COM DESIGN SYSTEM)
  const injectedListEl = $('#simInjectedList');
  const injectedTotalEl = $('#simInjectedTotal');
  if (injectedTotalEl) injectedTotalEl.textContent = `+${currency(curMData.simExtraExp)}`;

  if (injectedListEl) {
    const curTarget = activeYear * 12 + state.month;
    const activeSim = simulatedExpenses.filter(sim => {
      const sTarget = (sim.startYear || activeYear) * 12 + (sim.startMonth || 1);
      const eTarget = sTarget + (sim.installments || 1) - 1;
      return curTarget >= sTarget && curTarget <= eTarget;
    });

    if (simulatedExpenses.length === 0) {
      injectedListEl.innerHTML = `
        <div class="empty" style="padding:28px; text-align:center;">
          <p style="margin-bottom:10px; font-weight:600;">Nenhum gasto simulado injetado ainda.</p>
          <button type="button" class="btn primary small" id="emptySimAddBtn" style="margin:0 auto;">
            + Adicionar Gasto Simulado
          </button>
        </div>
      `;
      $('#emptySimAddBtn')?.addEventListener('click', () => openSimDialog('new'));
    } else if (activeSim.length === 0) {
      injectedListEl.innerHTML = `
        <div class="empty" style="padding:20px; text-align:center;">
          <p>Nenhuma despesa simulada vigente neste mês específico (${MONTH_NAMES[state.month - 1]}).</p>
          <small style="color:var(--muted);">Existem ${simulatedExpenses.length} simulação(ões) ativas em outros meses de ${activeYear}.</small>
        </div>
      `;
    } else {
      injectedListEl.innerHTML = activeSim.map(sim => {
        const sTarget = (sim.startYear || activeYear) * 12 + (sim.startMonth || 1);
        const curInst = (curTarget - sTarget) + 1;
        const totalCost = Number(sim.amount) * Number(sim.installments || 1);
        const catMeta = (typeof getCategoryMeta === 'function') ? getCategoryMeta(sim.group || 'Gerais') : { name: sim.group || 'Gerais', icon: 'tag', color: '#1F7A5C' };
        const catIconSvg = (typeof getCategoryIconSvg === 'function') ? getCategoryIconSvg(catMeta.icon) : '';
        const destMeta = sim.destination ? getDestMeta(sim.destination) : null;
        const destIconSvg = destMeta ? (DEST_SVG_ICONS[destMeta.icon] || DEST_SVG_ICONS.card) : '';
        const destPillHtml = (sim.destination && sim.destination !== 'Renda Extra') ? `
          <span class="tag dest" style="background:${destMeta.color}22; color:${destMeta.color}; border:1px solid ${destMeta.color}44;">
            ${destIconSvg} ${escapeHtml(sim.destination)}
          </span>` : '';
        const catColor = catMeta.color || '#1F7A5C';

        return `
          <div class="entry-row" style="border-left:3px solid var(--warning, #D97706); cursor:default;">
            <div class="entry-info">
              <div class="entry-title">${escapeHtml(sim.name)}</div>
              <div class="entry-meta">
                <span class="tag" style="background:var(--warning-soft); color:var(--warning); font-weight:800;">Simulado ${curInst}/${sim.installments}x</span>
                <span class="tag" style="display:inline-flex; align-items:center; gap:4px; background:${catColor}18; color:var(--text); border:1px solid ${catColor}44;"><span style="color:${catColor}; display:inline-flex;">${catIconSvg}</span> ${escapeHtml(sim.group || 'Gerais')}</span>
                ${destPillHtml}
                <span class="tag" title="Total do Contrato">Total: ${currency(totalCost)}</span>
              </div>
            </div>
            <div class="entry-amount num negative" style="font-weight:800;">${currency(sim.amount)}</div>
            <div class="entry-actions">
              <button type="button" class="icon-btn small edit-sim-btn" data-id="${sim.id}" data-tooltip="Editar Simulação" aria-label="Editar Simulação">
                <svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
              <button type="button" class="icon-btn small del-sim-btn" data-id="${sim.id}" data-tooltip="Excluir Simulação" aria-label="Excluir Simulação" style="color:var(--danger);">
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

  // 5. SEÇÃO: SIMULAÇÕES SALVAS (CENÁRIOS SALVOS)
  const savedContainer = $('#savedSimulationsList');
  const countBadge = $('#savedSimulationsCountBadge');
  const savedList = state.savedSimulations || [];

  if (countBadge) {
    countBadge.textContent = `${savedList.length} cenário(s) salvo(s)`;
  }

  if (savedContainer) {
    if (savedList.length === 0) {
      savedContainer.innerHTML = `
        <div class="empty" style="grid-column: 1 / -1; padding: 24px; text-align: center;">
          <svg class="svg-icon" viewBox="0 0 24 24" style="width:32px; height:32px; stroke:var(--muted); margin-bottom:8px;">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <p style="margin:0; font-weight:600;">Nenhum cenário salvo até o momento.</p>
          <small style="color:var(--muted);">Clique no botão "Salvar Simulação" acima para gravar o cenário atual.</small>
        </div>
      `;
    } else {
      savedContainer.innerHTML = savedList.map(item => {
        const snap = item.snapshot || {};
        const expensesCount = (snap.simulatedExpenses || []).length;
        const totalSimAmt = (snap.simulatedExpenses || []).reduce((acc, curr) => acc + (Number(curr.amount) * Number(curr.installments || 1)), 0);
        const simY = item.simulationYear || snap.simulationYear || state.year;
        const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-BR') : '';

        return `
          <div class="card" style="padding:14px 16px; border:1px solid var(--line); border-radius:14px; background:var(--surface); display:flex; flex-direction:column; justify-content:space-between; gap:12px;">
            <div>
              <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <svg class="svg-icon" viewBox="0 0 24 24" style="width:18px; height:18px; stroke:var(--brand); flex-shrink:0;">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <h4 style="margin:0; font-size:.92rem; font-weight:800; color:var(--text);">${escapeHtml(item.title)}</h4>
                </div>
                <span class="tag" style="background:var(--brand-soft); color:var(--brand); font-weight:800; font-size:.72rem;">${simY}</span>
              </div>
              ${item.description ? `<p style="margin:6px 0 0 26px; font-size:.78rem; color:var(--muted); line-height:1.4;">${escapeHtml(item.description)}</p>` : ''}
              <div style="display:flex; gap:6px; flex-wrap:wrap; margin:10px 0 0 26px; font-size:.74rem;">
                <span class="tag">${expensesCount} gasto(s) simulado(s)</span>
                ${totalSimAmt > 0 ? `<span class="tag" style="color:var(--warning);">Total: ${currency(totalSimAmt)}</span>` : ''}
                ${dateStr ? `<span class="tag" style="color:var(--muted);">${dateStr}</span>` : ''}
              </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; border-top:1px solid var(--line); padding-top:10px;">
              <button type="button" class="btn soft small load-saved-sim-btn" data-id="${item.id}" style="font-weight:800; border-radius:8px; display:inline-flex; align-items:center; gap:6px;">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px;"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                Abrir Cenário
              </button>
              <button type="button" class="icon-btn small del-saved-sim-btn" data-id="${item.id}" data-tooltip="Excluir este Cenário Salvo" aria-label="Excluir este Cenário Salvo" style="color:var(--danger);">
                <svg class="svg-icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        `;
      }).join('');

      savedContainer.querySelectorAll('.load-saved-sim-btn').forEach(btn => {
        btn.addEventListener('click', () => loadSavedSimulation(btn.getAttribute('data-id')));
      });

      savedContainer.querySelectorAll('.del-saved-sim-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteSavedSimulation(btn.getAttribute('data-id')));
      });
    }
  }
}

window.renderSimulationTab = renderSimulationTab;
window.getSimulationToggles = getSimulationToggles;
window.setSimulationToggles = setSimulationToggles;
window.getSimulationYear = getSimulationYear;
window.setSimulationYear = setSimulationYear;
window.calculateSimProjection = calculateSimProjection;
window.openSimDialog = openSimDialog;
window.deleteSimExpense = deleteSimExpense;
window.loadSavedSimulation = loadSavedSimulation;
window.deleteSavedSimulation = deleteSavedSimulation;
