const MONTH_NAMES = (typeof window !== 'undefined' && window.MONTH_NAMES) || ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTH_ABBR = (typeof window !== 'undefined' && window.MONTH_ABBR) || ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/* ==========================================================================
   MÓDULO DE SIMULAÇÃO DE DESPESAS (SANDBOX - 100% EM MEMÓRIA)
   ========================================================================== */
let simulatedExpenses = [];
let simDlgId = null;
let simulationToggles = {
  includeExtras: false,
  includeDebtors: false
};

function getSimulationToggles() {
  return simulationToggles;
}

function setSimulationToggles(toggles) {
  simulationToggles = Object.assign(simulationToggles, toggles);
  renderSimulationTab();
}
const simDlg = $('#simDialog');

function fillSimSelects() {
  const state = getState();
        const startMonthSel = $('#simFormStartMonth');
        const startYearSel = $('#simFormStartYear');
        const catSel = $('#simFormCategory');
        const destSel = $('#simFormDestination');

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
          catSel.innerHTML = (state.categories || DEFAULT_CATEGORIES).map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
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
        fillSimSelects();
        $('#simForm')?.reset();
        simDlgId = id || null;
        const delBtn = $('#simFormDeleteBtn');
        if (delBtn) delBtn.hidden = !id;

        if (mode === 'new') {
          $('#simDialogTitle').textContent = 'Adicionar Gasto Simulado';
          $('#simFormStartMonth').value = state.month;
          $('#simFormStartYear').value = state.year;
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
          $('#simFormStartMonth').value = item.startMonth || state.month;
          $('#simFormStartYear').value = item.startYear || state.year;
          $('#simFormCategory').value = item.group || '';
          $('#simFormDestination').value = item.destination || '';
          $('#simFormNote').value = item.note || '';
        }
        updateSimBadge();
        if (simDlg) simDlg.showModal();
      
}

function deleteSimExpense(id) {
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
  e.preventDefault();
  const name = $('#simFormName').value.trim();
  const amount = Number($('#simFormAmount').value) || 0;
  const installments = Number($('#simFormInstallments').value) || 1;
  const startMonth = Number($('#simFormStartMonth').value) || state.month;
  const startYear = Number($('#simFormStartYear').value) || state.year;
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

  if (simDlg) simDlg.close();
  renderSimulationTab();
  notify(`Simulação "${name}" injetada no cenário com sucesso!`, 'success');
});

$('#simAddBtn')?.addEventListener('click', () => openSimDialog('new'));
$('#simResetBtn')?.addEventListener('click', () => {
  const hadSim = simulatedExpenses.length > 0 || simulationToggles.includeExtras || simulationToggles.includeDebtors;
  simulatedExpenses = [];
  simulationToggles.includeExtras = false;
  simulationToggles.includeDebtors = false;
  if ($('#simIncludeExtras')) $('#simIncludeExtras').checked = false;
  if ($('#simIncludeDebtors')) $('#simIncludeDebtors').checked = false;
  renderSimulationTab();
  if (hadSim) {
    notify('Simulação resetada! O cenário reflete exatamente seus dados oficiais.', 'info');
  } else {
    notify('O sandbox já está sem despesas simuladas.', 'info');
  }
});

$('#simIncludeExtras')?.addEventListener('change', (e) => {
  simulationToggles.includeExtras = !!e.target.checked;
  renderSimulationTab();
});

$('#simIncludeDebtors')?.addEventListener('change', (e) => {
  simulationToggles.includeDebtors = !!e.target.checked;
  renderSimulationTab();
});

function calculateSimProjection() {
  const state = getState();
        const curYear = state.year;
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

          // Extra Incomes & Debtors (Respeitando toggles globais da simulação, includeInSimulation individual e vigência)
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
        const yearLabel = $('#simYearLabel');
        if (yearLabel) yearLabel.textContent = state.year;

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
              <div class="label">Meses em Risco de Déficit (${state.year})</div>
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
                saveState();
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
          const curTarget = state.year * 12 + state.month;
          const activeFixed = (state.fixed || []).filter(f => {
            if (f.endedFrom && curTarget >= (f.endedFrom.year * 12 + f.endedFrom.month)) return false;
            return true;
          });
          const activeVar = (state.variable || []).filter(v => {
            const sTarget = (v.startYear || state.year) * 12 + (v.startMonth || 1);
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
              const amt = activeV ? Number(activeV.amount || 0) : f.amount;
              const destMeta = f.destination ? getDestMeta(f.destination) : null;
              const destIconSvg = destMeta ? (DEST_SVG_ICONS[destMeta.icon] || DEST_SVG_ICONS.card) : '';
              const destPillHtml = (f.destination && f.destination !== 'Renda Extra') ? `
                <span class="tag dest" style="background:${destMeta.color}22; color:${destMeta.color}; border:1px solid ${destMeta.color}44;">
                  ${destIconSvg} ${escapeHtml(f.destination)}
                </span>` : '';

              html += `
                <div class="entry-row" style="border-left:3px solid var(--c-fixed); cursor:default;">
                  <div class="entry-info">
                    <div class="entry-title">${escapeHtml(f.name)}</div>
                    <div class="entry-meta">
                      <span class="tag" style="background:var(--c-fixed-soft); color:var(--c-fixed);">Fixa</span>
                      <span class="tag">${escapeHtml(f.group || 'Gerais')}</span>
                      ${destPillHtml}
                    </div>
                  </div>
                  <div class="entry-amount num negative">${currency(amt)}</div>
                </div>
              `;
            });

            activeVar.forEach(v => {
              const sTarget = (v.startYear || state.year) * 12 + (v.startMonth || 1);
              const curInst = (curTarget - sTarget) + 1;
              const destMeta = v.destination ? getDestMeta(v.destination) : null;
              const destIconSvg = destMeta ? (DEST_SVG_ICONS[destMeta.icon] || DEST_SVG_ICONS.card) : '';
              const destPillHtml = (v.destination && v.destination !== 'Renda Extra') ? `
                <span class="tag dest" style="background:${destMeta.color}22; color:${destMeta.color}; border:1px solid ${destMeta.color}44;">
                  ${destIconSvg} ${escapeHtml(v.destination)}
                </span>` : '';

              html += `
                <div class="entry-row" style="border-left:3px solid var(--c-variable); cursor:default;">
                  <div class="entry-info">
                    <div class="entry-title">${escapeHtml(v.name)}</div>
                    <div class="entry-meta">
                      <span class="tag" style="background:var(--c-variable-soft); color:var(--c-variable);">${curInst}/${v.installments || 1}x</span>
                      <span class="tag">${escapeHtml(v.group || 'Gerais')}</span>
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
          const curTarget = state.year * 12 + state.month;
          const activeSim = simulatedExpenses.filter(sim => {
            const sTarget = (sim.startYear || state.year) * 12 + (sim.startMonth || 1);
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
                <small style="color:var(--muted);">Existem ${simulatedExpenses.length} simulação(ões) ativas em outros meses de ${state.year}.</small>
              </div>
            `;
          } else {
            injectedListEl.innerHTML = activeSim.map(sim => {
              const sTarget = (sim.startYear || state.year) * 12 + (sim.startMonth || 1);
              const curInst = (curTarget - sTarget) + 1;
              const totalCost = Number(sim.amount) * Number(sim.installments || 1);
              const destMeta = sim.destination ? getDestMeta(sim.destination) : null;
              const destIconSvg = destMeta ? (DEST_SVG_ICONS[destMeta.icon] || DEST_SVG_ICONS.card) : '';
              const destPillHtml = (sim.destination && sim.destination !== 'Renda Extra') ? `
                <span class="tag dest" style="background:${destMeta.color}22; color:${destMeta.color}; border:1px solid ${destMeta.color}44;">
                  ${destIconSvg} ${escapeHtml(sim.destination)}
                </span>` : '';

              return `
                <div class="entry-row" style="border-left:3px solid var(--warning, #D97706); cursor:default;">
                  <div class="entry-info">
                    <div class="entry-title">${escapeHtml(sim.name)}</div>
                    <div class="entry-meta">
                      <span class="tag" style="background:var(--warning-soft); color:var(--warning); font-weight:800;">Simulado ${curInst}/${sim.installments}x</span>
                      <span class="tag">${escapeHtml(sim.group || 'Gerais')}</span>
                      ${destPillHtml}
                      <span class="tag" title="Total do Contrato">Total: ${currency(totalCost)}</span>
                    </div>
                  </div>
                  <div class="entry-amount num negative" style="font-weight:800;">${currency(sim.amount)}</div>
                  <div class="entry-actions">
                    <button type="button" class="icon-btn small edit-sim-btn" data-id="${sim.id}" title="Editar Simulação">
                      <svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                    <button type="button" class="icon-btn small del-sim-btn" data-id="${sim.id}" title="Excluir Simulação" style="color:var(--danger);">
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
      
};


window.renderSimulationTab = renderSimulationTab;
window.getSimulationToggles = getSimulationToggles;
window.setSimulationToggles = setSimulationToggles;
window.calculateSimProjection = calculateSimProjection;
window.openSimDialog = openSimDialog;
window.deleteSimExpense = deleteSimExpense;
