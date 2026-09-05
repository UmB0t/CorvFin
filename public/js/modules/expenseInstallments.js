/* ==========================================================================
   MODULO DE PARCELAMENTOS, CONTRATOS, TIMELINE & CONVERSAO DE DESPESAS (expenseInstallments.js)
   Financas Pro - Vanilla JS Architecture
   ========================================================================== */

(function() {
  'use strict';

  // Estado privado do modulo de parcelamentos e conversao
  let convertingFixedId = null;
  let expensesTableSort = { key: 'total', asc: false };

function convertVariableToFixed(varId) {
    const state = getState();
        const v = state.variable.find(x => x.id === varId);
        if (!v) return;

        const key = ymKey(state.year, state.month);
        const isPaidThisMonth = v.paidHistory && v.paidHistory[key] === true;

        const newFixed = {
          id: uid(),
          name: v.name,
          group: v.group || 'Gerais',
          note: v.note || '',
          dueDay: v.dueDay || null,
          destination: v.destination || 'Nubank',
          versions: [{
            id: uid(),
            year: state.year,
            month: state.month,
            amount: Number(v.amount) || 0
          }],
          endedFrom: null,
          paidHistory: Object.assign({}, v.paidHistory || {})
        };
        newFixed.paidHistory[key] = isPaidThisMonth;

        state.fixed.push(newFixed);
        state.variable = state.variable.filter(x => x.id !== varId);

        saveState();
        render();
        notify(`Despesa "${v.name}" convertida para Fixa com sucesso!`);
      }

      function openConvertFixedToVarDialog(fixedId) {
    const state = getState();
        const fixed = state.fixed.find(f => f.id === fixedId);
        if (!fixed) return;

        const activeList = activeFixedForMonth(state.year, state.month);
        const active = activeList.find(a => a.fixedId === fixed.id)
          || [...fixed.versions].sort((a, b) => mk(a.year, a.month) - mk(b.year, b.month))[0];

        convertingFixedId = fixedId;

        $('#convertVarName').value = fixed.name;
        $('#convertVarAmount').value = currency(active.amount);
        $('#convertVarDest').value = fixed.destination || 'Nubank';
        $('#convertVarStartDisplay').value = `${MONTH_NAMES[state.month - 1]} / ${state.year}`;

        const monthsCountInput = $('#convertVarMonthsCount');
        monthsCountInput.value = 6;

        updateConvertVarEndSelectors(6);

        const dlg = $('#convertFixedToVarDialog');
        if (dlg) dlg.showModal();
      }

      function updateConvertVarEndSelectors(monthsCount) {
    const state = getState();
        const count = Math.max(1, Number(monthsCount) || 1);
        const endD = new Date(state.year, state.month - 1 + count - 1, 1);
        const targetEndMonth = endD.getMonth() + 1;
        const targetEndYear = endD.getFullYear();

        const monthSelect = $('#convertVarEndMonth');
        const yearSelect = $('#convertVarEndYear');

        if (monthSelect) {
          monthSelect.innerHTML = MONTH_NAMES.map((name, i) => `<option value="${i + 1}" ${i + 1 === targetEndMonth ? 'selected' : ''}>${name}</option>`).join('');
        }

        const startY = Math.min(state.year, targetEndYear);
        const years = [];
        for (let y = startY; y <= startY + 10; y++) {
          years.push(y);
        }
        if (yearSelect) {
          yearSelect.innerHTML = years.map(y => `<option value="${y}" ${y === targetEndYear ? 'selected' : ''}>${y}</option>`).join('');
        }

        const fixed = state.fixed.find(f => f.id === convertingFixedId);
        let amount = 0;
        if (fixed) {
          const active = activeFixedForMonth(state.year, state.month).find(a => a.fixedId === fixed.id)
            || fixed.versions[0];
          if (active) amount = Number(active.amount) || 0;
        }

        const badge = $('#convertVarSummaryBadge');
        if (badge) {
          badge.classList.remove('invalid', 'error');
          badge.innerHTML = `${ICONS.box} Quantidade: ${count} parcela(s) • Total Previsto: ${currency(amount * count)}`;
        }
      }

      function initConvertFixedToVarDialog() {
    const state = getState();
        const form = $('#convertFixedToVarForm');
        if (!form) return;

        $('#convertVarMonthsCount')?.addEventListener('input', (e) => {
          updateConvertVarEndSelectors(Number(e.target.value) || 1);
        });

        $('#convertVarEndMonth')?.addEventListener('change', () => {
          const em = Number($('#convertVarEndMonth').value);
          const ey = Number($('#convertVarEndYear').value);
          const diff = mk(ey, em) - mk(state.year, state.month) + 1;
          if (diff >= 1) {
            $('#convertVarMonthsCount').value = diff;
            updateConvertVarEndSelectors(diff);
          } else {
            const badge = $('#convertVarSummaryBadge');
            if (badge) {
              badge.classList.add('invalid', 'error');
              badge.innerHTML = `⚠️ Data Inválida: Mês final precisa ser igual ou posterior ao atual!`;
            }
          }
        });

        $('#convertVarEndYear')?.addEventListener('change', () => {
          const em = Number($('#convertVarEndMonth').value);
          const ey = Number($('#convertVarEndYear').value);
          const diff = mk(ey, em) - mk(state.year, state.month) + 1;
          if (diff >= 1) {
            $('#convertVarMonthsCount').value = diff;
            updateConvertVarEndSelectors(diff);
          } else {
            const badge = $('#convertVarSummaryBadge');
            if (badge) {
              badge.classList.add('invalid', 'error');
              badge.innerHTML = `⚠️ Data Inválida: Mês final precisa ser igual ou posterior ao atual!`;
            }
          }
        });

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (!convertingFixedId) return;

          const endMonth = Number($('#convertVarEndMonth').value);
          const endYear = Number($('#convertVarEndYear').value);

          if (mk(endYear, endMonth) < mk(state.year, state.month)) {
            notify('O mês/ano final deve ser igual ou posterior ao mês atual.', 'error');
            return;
          }

          const fixed = state.fixed.find(f => f.id === convertingFixedId);
          if (!fixed) return;

          const active = activeFixedForMonth(state.year, state.month).find(a => a.fixedId === fixed.id)
            || [...fixed.versions].sort((a, b) => mk(a.year, a.month) - mk(b.year, b.month))[0];
          const amount = Number(active.amount) || 0;

          const key = ymKey(state.year, state.month);
          const isPaidThisMonth = fixed.paidHistory && fixed.paidHistory[key] === true;

          const newVar = {
            id: uid(),
            name: fixed.name,
            group: fixed.group || 'Gerais',
            note: fixed.note || '',
            dueDay: fixed.dueDay || null,
            amount: amount,
            destination: fixed.destination || 'Nubank',
            startMonth: state.month,
            startYear: state.year,
            endMonth: endMonth,
            endYear: endYear,
            paidHistory: Object.assign({}, fixed.paidHistory || {})
          };
          newVar.paidHistory[key] = isPaidThisMonth;

          state.variable.push(newVar);

          const hasOlderVersions = (fixed.versions || []).some(v => mk(v.year, v.month) < mk(state.year, state.month));
          if (hasOlderVersions) {
            fixed.endedFrom = { year: state.year, month: state.month };
          } else {
            state.fixed = state.fixed.filter(x => x.id !== convertingFixedId);
          }

          convertingFixedId = null;
          const dlg = $('#convertFixedToVarDialog');
          if (dlg && dlg.open) dlg.close();

          saveState();
          render();
          notify(`Despesa "${fixed.name}" convertida para Variável (${mk(endYear, endMonth) - mk(state.year, state.month) + 1}x) com sucesso!`);
        });
      }

function buildExpenseAnalysisSummaryHtml(item, type, state) {
  if (!item) return '';

  const y = (state && state.year) || new Date().getFullYear();
  const m = (state && state.month) || (new Date().getMonth() + 1);

  // 1. Resolucao de Dimensoes V2 com Fallback Canonico V1 (constants.js helpers)
  const category = item.group || 'Gerais';
  const payee = (typeof resolveExpensePayee === 'function')
    ? resolveExpensePayee(item)
    : (item.payee && String(item.payee).trim() ? String(item.payee).trim() : null);

  const methodId = (typeof resolveExpensePaymentMethod === 'function')
    ? resolveExpensePaymentMethod(item)
    : (item.payment?.method || null);

  const methodName = (window.PAYMENT_METHOD_NAMES_MAP && window.PAYMENT_METHOD_NAMES_MAP[methodId])
    ? window.PAYMENT_METHOD_NAMES_MAP[methodId]
    : (methodId && methodId !== 'outros' ? methodId.toUpperCase() : (methodId === 'outros' ? 'Outro' : null));

  const account = (typeof resolveExpenseAccount === 'function')
    ? resolveExpenseAccount(item)
    : (item.payment?.account && String(item.payment.account).trim() ? String(item.payment.account).trim() : null);

  const temporal = (typeof resolveExpenseTemporal === 'function')
    ? resolveExpenseTemporal(item)
    : (item.temporal || {});

  // 2. Determinacao da Natureza da Obrigacao (Unica, Parcelada, Recorrente)
  const isFixedType = (type === 'fixed') || (item.paymentType === 'fixed') || Boolean(item.versions);
  let nature = 'Única';
  if (isFixedType || temporal.type === 'recurring' || temporal.type === 'fixed') {
    nature = 'Recorrente';
  } else if (temporal.type === 'installment' || (item.installments && item.installments > 1) || (item.startYear && item.endYear && (mk(item.endYear, item.endMonth) - mk(item.startYear, item.startMonth) + 1) > 1)) {
    nature = 'Parcelada';
  } else {
    nature = 'Única';
  }

  // 3. Informacoes Financeiras e de Pagamento da Competencia Atual
  let activeAmount = 0;
  if (nature === 'Recorrente') {
    const versions = [...(item.versions || [{ year: y, month: m, amount: item.amount }])].sort((a, b) => mk(a.year, a.month) - mk(b.year, b.month));
    let activeVer = null;
    const target = mk(y, m);
    for (const v of versions) {
      if (mk(v.year, v.month) <= target) activeVer = v; else break;
    }
    activeAmount = activeVer ? Number(activeVer.amount) : Number(item.amount || 0);
  } else {
    activeAmount = Number(item.amount || 0);
  }

  const payInfo = (typeof getExpensePaymentInfo === 'function')
    ? getExpensePaymentInfo(item, y, m, activeAmount)
    : { totalAmount: activeAmount, paidAmount: (item.status === 'pago' ? activeAmount : 0), remainingAmount: (item.status === 'pago' ? 0 : activeAmount), status: item.status || 'pendente' };

  // 4. Campos Estruturados do Grid (omitindo ausentes, sem "Destino")
  const gridFields = [];

  gridFields.push({ label: 'Categoria', val: escapeHtml(category) });

  if (payee) {
    gridFields.push({ label: 'Favorecido', val: escapeHtml(payee) });
  }

  if (methodName) {
    gridFields.push({ label: 'Método', val: escapeHtml(methodName) });
  }

  if (account) {
    gridFields.push({ label: 'Conta / Cartão', val: escapeHtml(account) });
  }

  gridFields.push({ label: 'Natureza', val: escapeHtml(nature) });

  if (nature === 'Única') {
    const compMonth = item.startMonth || m;
    const compYear = item.startYear || y;
    const compFormatted = `${MONTH_ABBR[compMonth - 1]}/${compYear}`;
    gridFields.push({ label: 'Competência', val: compFormatted });
  } else if (nature === 'Parcelada') {
    const startM = item.startMonth || m;
    const startY = item.startYear || y;
    const endM = item.endMonth || m;
    const endY = item.endYear || y;
    const totalContractMonths = Math.max(1, mk(endY, endM) - mk(startY, startM) + 1);
    const installmentsCount = item.installments || totalContractMonths;

    const currentTarget = mk(y, m);
    let installmentText = '';
    if (currentTarget >= mk(startY, startM) && currentTarget <= mk(endY, endM)) {
      const currentIdx = currentTarget - mk(startY, startM) + 1;
      installmentText = `${currentIdx} de ${installmentsCount}`;
    } else if (currentTarget < mk(startY, startM)) {
      installmentText = `1 de ${installmentsCount} (inicia em ${MONTH_ABBR[startM - 1]}/${startY})`;
    } else {
      installmentText = `Concluída (${installmentsCount} de ${installmentsCount})`;
    }

    gridFields.push({ label: 'Parcelamento', val: installmentText });
    gridFields.push({ label: 'Valor da parcela', val: currency(activeAmount) });

    const totalContractAmount = activeAmount * installmentsCount;
    gridFields.push({ label: 'Valor total', val: currency(totalContractAmount), highlight: true });

    gridFields.push({ label: 'Competência inicial', val: `${MONTH_ABBR[startM - 1]}/${startY}` });
    gridFields.push({ label: 'Competência final', val: `${MONTH_ABBR[endM - 1]}/${endY}` });
  } else if (nature === 'Recorrente') {
    gridFields.push({ label: 'Frequência', val: 'Mensal' });
    gridFields.push({ label: 'Valor por ocorrência', val: currency(activeAmount) });

    const versions = [...(item.versions || [])].sort((a, b) => mk(a.year, a.month) - mk(b.year, b.month));
    const firstVer = versions[0];
    const startM = firstVer ? (firstVer.startMonth || firstVer.month) : 1;
    const startY = firstVer ? (firstVer.startYear || firstVer.year) : y;
    gridFields.push({ label: 'Início', val: `${MONTH_ABBR[startM - 1]}/${startY}` });

    const rec = temporal.recurrence || {};
    const endedFrom = item.endedFrom;

    if (!endedFrom && rec.type !== 'date' && rec.type !== 'count') {
      gridFields.push({ label: 'Término', val: 'Sem data final' });
    } else if (rec.type === 'count' && rec.count) {
      gridFields.push({ label: 'Duração', val: `${rec.count} ocorrências` });
      if (endedFrom) {
        const lastActiveM = endedFrom.month === 1 ? 12 : endedFrom.month - 1;
        const lastActiveY = endedFrom.month === 1 ? endedFrom.year - 1 : endedFrom.year;
        gridFields.push({ label: 'Término', val: `${MONTH_ABBR[lastActiveM - 1]}/${lastActiveY}` });
      } else if (typeof calculateRecurrenceEndFrom === 'function') {
        const ef = calculateRecurrenceEndFrom(startY, startM, rec.count);
        const lastActiveM = ef.month === 1 ? 12 : ef.month - 1;
        const lastActiveY = ef.month === 1 ? ef.year - 1 : ef.year;
        gridFields.push({ label: 'Término', val: `${MONTH_ABBR[lastActiveM - 1]}/${lastActiveY}` });
      }
    } else if (endedFrom) {
      const lastActiveM = endedFrom.month === 1 ? 12 : endedFrom.month - 1;
      const lastActiveY = endedFrom.month === 1 ? endedFrom.year - 1 : endedFrom.year;
      gridFields.push({ label: 'Término', val: `${MONTH_ABBR[lastActiveM - 1]}/${lastActiveY}` });
    } else if (rec.endMonth && rec.endYear) {
      gridFields.push({ label: 'Término', val: `${MONTH_ABBR[rec.endMonth - 1]}/${rec.endYear}` });
    } else {
      gridFields.push({ label: 'Término', val: 'Sem data final' });
    }
  }

  // 5. Situacao Financeira / Pagamento da Competencia Atual
  let statusBadgeHtml = '';
  const situationItems = [];
  const currentCompLabel = `${MONTH_ABBR[m - 1]}/${y}`;

  let isCurrentActive = true;
  if (nature === 'Recorrente' && item.endedFrom && mk(y, m) >= mk(item.endedFrom.year, item.endedFrom.month)) {
    isCurrentActive = false;
  } else if (nature === 'Parcelada') {
    const sM = item.startMonth || m, sY = item.startYear || y;
    const eM = item.endMonth || m, eY = item.endYear || y;
    isCurrentActive = mk(y, m) >= mk(sY, sM) && mk(y, m) <= mk(eY, eM);
  }

  if (!isCurrentActive) {
    statusBadgeHtml = '<span class="badge">Inativo</span>';
    situationItems.push({ label: `Situação (${currentCompLabel})`, val: 'Fora do período de vigência' });
  } else if (payInfo.status === 'pago') {
    statusBadgeHtml = '<span class="badge success">Pago</span>';
    situationItems.push({ label: `Status (${currentCompLabel})`, val: statusBadgeHtml });
    situationItems.push({ label: 'Valor Quitado', val: currency(payInfo.totalAmount) });
  } else if (payInfo.status === 'parcial') {
    statusBadgeHtml = '<span class="badge warning">Parcialmente pago</span>';
    situationItems.push({ label: `Status (${currentCompLabel})`, val: statusBadgeHtml });
    situationItems.push({ label: 'Valor da Competência', val: currency(payInfo.totalAmount) });
    situationItems.push({ label: 'Valor Pago', val: currency(payInfo.paidAmount) });
    situationItems.push({ label: 'Restante a Pagar', val: currency(payInfo.remainingAmount) });
  } else {
    statusBadgeHtml = '<span class="badge warning">Pendente</span>';
    situationItems.push({ label: `Status (${currentCompLabel})`, val: statusBadgeHtml });
    situationItems.push({ label: 'Valor Pendente', val: currency(payInfo.totalAmount) });
  }

  return `
    <div class="expense-analysis-header">
      <h4 class="expense-analysis-heading">Resumo da Obrigação</h4>
      ${statusBadgeHtml}
    </div>

    <div class="expense-analysis-grid">
      ${gridFields.map(f => `
        <div class="expense-analysis-field">
          <span class="expense-analysis-label">${escapeHtml(f.label)}</span>
          <span class="expense-analysis-val${f.highlight ? ' highlight' : ''}">${f.val}</span>
        </div>
      `).join('')}
    </div>

    <div class="expense-analysis-situation-card">
      ${situationItems.map(s => `
        <div class="sit-field">
          <span class="sit-label">${escapeHtml(s.label)}</span>
          <span class="sit-val">${s.val}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function openExpenseTimeline(opts) {
  const state = getState();
  const { type, id, fixedId } = opts || {};
  const timelineDlg = $('#timelineDialog');
  if (!timelineDlg) return;

  let currentItem = opts?.item || null;
  if (!currentItem) {
    if (type === 'fixed') {
      currentItem = state.fixed.find(f => f.id === fixedId);
    } else if (type === 'variable') {
      currentItem = state.variable.find(x => x.id === id);
    }
  }
  if (!currentItem) return;

  const itemTitle = currentItem.name || '';
  const itemGroup = currentItem.group || 'Gerais';
  const itemNote = currentItem.note || '';

  const monthsStatus = [];
  let annualPlanned = 0;
  let annualPaid = 0;
  let paidMonthsCount = 0;
  let activeMonthsCount = 0;
  const targetY = state.year;

  if (type === 'fixed' || currentItem.paymentType === 'fixed' || Boolean(currentItem.versions)) {
    const fixed = currentItem;
    let runningPaid = 0;

    for (let m = 1; m <= 12; m++) {
      const target = mk(targetY, m);

      let isActive = true;
      if (fixed.endedFrom && target >= mk(fixed.endedFrom.year, fixed.endedFrom.month)) {
        isActive = false;
      }

      const versions = [...(fixed.versions || [])].sort((a, b) => mk(a.year, a.month) - mk(b.year, b.month));
      let activeVer = null;
      for (const v of versions) {
        if (mk(v.year, v.month) <= target) activeVer = v; else break;
      }

      if (!activeVer) isActive = false;

      const amount = isActive && activeVer ? Number(activeVer.amount) : 0;
      const payInfo = (typeof getExpensePaymentInfo === 'function')
        ? getExpensePaymentInfo(fixed, targetY, m, amount)
        : { totalAmount: amount, paidAmount: (fixed.paidHistory && fixed.paidHistory[ymKey(targetY, m)] === true ? amount : 0), status: (fixed.paidHistory && fixed.paidHistory[ymKey(targetY, m)] === true ? 'pago' : 'pendente') };

      const isPaid = isActive && payInfo.status === 'pago';
      const paidThisMonth = isActive ? payInfo.paidAmount : 0;

      if (isActive) {
        annualPlanned += amount;
        activeMonthsCount++;
        annualPaid += paidThisMonth;
        runningPaid += paidThisMonth;
        if (isPaid) {
          paidMonthsCount++;
        }
      }

      monthsStatus.push({
        month: m,
        year: targetY,
        isActive,
        amount,
        isPaid,
        status: payInfo.status,
        paidAmount: paidThisMonth,
        remainingAmount: payInfo.remainingAmount,
        runningPaid,
        vigenciaText: isActive ? `Fixa (desde ${MONTH_ABBR[(activeVer.month || 1) - 1]}/${activeVer.year})` : 'Inativo / Encerrado'
      });
    }
  } else {
    const v = currentItem;
    const startM = v.startMonth || 1, startY = v.startYear || targetY;
    const endM = v.endMonth || startM, endY = v.endYear || startY;
    const totalContractMonths = Math.max(1, mk(endY, endM) - mk(startY, startM) + 1);
    let runningPaid = 0;

    for (let m = 1; m <= 12; m++) {
      const target = mk(targetY, m);
      const isActive = target >= mk(startY, startM) && target <= mk(endY, endM);
      const idx = isActive ? (target - mk(startY, startM) + 1) : 0;
      const amount = isActive ? Number(v.amount) : 0;

      const payInfo = (typeof getExpensePaymentInfo === 'function')
        ? getExpensePaymentInfo(v, targetY, m, amount)
        : { totalAmount: amount, paidAmount: (v.paidHistory && v.paidHistory[ymKey(targetY, m)] === true ? amount : 0), status: (v.paidHistory && v.paidHistory[ymKey(targetY, m)] === true ? 'pago' : 'pendente') };

      const isPaid = isActive && payInfo.status === 'pago';
      const paidThisMonth = isActive ? payInfo.paidAmount : 0;

      if (isActive) {
        annualPlanned += amount;
        activeMonthsCount++;
        annualPaid += paidThisMonth;
        runningPaid += paidThisMonth;
        if (isPaid) {
          paidMonthsCount++;
        }
      }

      monthsStatus.push({
        month: m,
        year: targetY,
        isActive,
        amount,
        isPaid,
        status: payInfo.status,
        paidAmount: paidThisMonth,
        remainingAmount: payInfo.remainingAmount,
        runningPaid,
        vigenciaText: isActive ? (totalContractMonths > 1 ? `Parcela ${idx} de ${totalContractMonths}` : 'Única') : (target < mk(startY, startM) ? 'Antes do Início' : 'Após o Término')
      });
    }
  }

  const pctAnnualPaid = annualPlanned > 0 ? Math.min(100, Math.round((annualPaid / annualPlanned) * 100)) : 0;
  const remainingAnnual = Math.max(0, annualPlanned - annualPaid);

  // 1. Cabecalho
  const titleEl = $('#timelineTitle');
  if (titleEl) {
    titleEl.innerHTML = `${escapeHtml(itemTitle)} <span class="tag">${escapeHtml(itemGroup)}</span>`;
  }
  const subEl = $('#timelineSub');
  if (subEl) {
    subEl.textContent = `Ano de Análise: ${state.year}${itemNote ? ` • Obs: ${itemNote}` : ''}`;
  }

  // 2. Resumo Estruturado V2
  const summaryEl = $('#expenseAnalysisSummary');
  if (summaryEl) {
    summaryEl.innerHTML = buildExpenseAnalysisSummaryHtml(currentItem, type, state);
  }

  // 3. Subtitulo de Historico
  const histSub = $('#timelineHistorySub');
  if (histSub) {
    histSub.textContent = `Competências de ${state.year}`;
  }

  // 4. Metricas Anuais
  const metricsEl = $('#timelineMetrics');
  if (metricsEl) {
    metricsEl.innerHTML = `
      <div class="metric">
        <div class="label">Total Previsto (${state.year})</div>
        <div class="value num negative">${currency(annualPlanned)}</div>
        <div class="sub">${activeMonthsCount} mês(es) vigente(s)</div>
      </div>
      <div class="metric">
        <div class="label">Total Pago (${state.year})</div>
        <div class="value num positive">${currency(annualPaid)}</div>
        <div class="sub">${paidMonthsCount} de ${activeMonthsCount} quitados</div>
      </div>
      <div class="metric">
        <div class="label">Pendente (${state.year})</div>
        <div class="value num warning">${currency(remainingAnnual)}</div>
        <div class="sub">${Math.max(0, activeMonthsCount - paidMonthsCount)} mês(es) a pagar</div>
      </div>
    `;
  }

  // 5. Barra de Progresso
  const progBar = $('#timelineProgressBar');
  if (progBar) progBar.style.width = `${pctAnnualPaid}%`;
  const progText = $('#timelineProgressText');
  if (progText) progText.textContent = `${pctAnnualPaid}% quitado no ano (${currency(annualPaid)} de ${currency(annualPlanned)})`;

  // 6. Tabela das 12 Competencias
  const tbody = $('#timelineTableBody');
  if (tbody) {
    tbody.innerHTML = monthsStatus.map(st => {
      const isCurrentMonth = st.month === state.month;
      let statusBadge = '<span class="tag">Inativo</span>';
      if (st.isActive) {
        if (st.status === 'pago') {
          statusBadge = '<span class="badge success">Pago</span>';
        } else if (st.status === 'parcial') {
          statusBadge = `<span class="badge warning">Parcial (${currency(st.paidAmount)})</span>`;
        } else {
          statusBadge = '<span class="badge warning">Pendente</span>';
        }
      }

      return `
        <tr class="${isCurrentMonth ? 'current-month-row' : ''}">
          <td>
            <strong>${MONTH_NAMES[st.month - 1]} / ${st.year}</strong>
            ${isCurrentMonth ? '<span class="tag tag-current-month">Mês Atual</span>' : ''}
          </td>
          <td class="text-muted">${st.vigenciaText}</td>
          <td class="num">${st.isActive ? currency(st.amount) : '—'}</td>
          <td>${statusBadge}</td>
          <td class="num positive text-right">${st.isActive && st.runningPaid > 0 ? currency(st.runningPaid) : '—'}</td>
        </tr>
      `;
    }).join('');
  }

  if (typeof timelineDlg.showModal === 'function') {
    timelineDlg.showModal();
  }
}

      /* ---------- PARCELAMENTOS & VALOR TOTAL (DESPESAS) ---------- */
      // expensesTableSort declarada no topo do modulo

      function updateExpensesSortIcons() {
        const keys = ['name', 'group', 'amount', 'months', 'total', 'paid', 'remaining', 'progress', 'period'];
        keys.forEach(k => {
          const iconEl = $(`#sortIconExp_${k}`);
          const thEl = iconEl ? iconEl.closest('.sortable-th') : null;
          if (iconEl) {
            if (expensesTableSort.key === k) {
              iconEl.textContent = expensesTableSort.asc ? '▲' : '▼';
              if (thEl) thEl.classList.add('active-sort');
            } else {
              iconEl.textContent = '↕';
              if (thEl) thEl.classList.remove('active-sort');
            }
          }
        });
      }

      function renderExpensesInstallmentsTab() {
    const state = getState();
        let grandContractTotal = 0;
        let grandPaidTotal = 0;
        let grandRemainingTotal = 0;
        let activePlansCount = 0;

        const items = [];

        // Variable / Installment expenses
        state.variable.forEach(v => {
          const totalMonths = mk(v.endYear, v.endMonth) - mk(v.startYear, v.startMonth) + 1;
          const totalContract = Number(v.amount) * totalMonths;
          grandContractTotal += totalContract;

          let paidMonthsCount = 0;
          if (v.paidHistory) {
            Object.values(v.paidHistory).forEach(p => { if (p === true) paidMonthsCount++; });
          }

          const paidAmount = paidMonthsCount * Number(v.amount);
          const remainingAmount = Math.max(0, totalContract - paidAmount);
          grandPaidTotal += paidAmount;
          grandRemainingTotal += remainingAmount;

          const isCompleted = paidMonthsCount >= totalMonths;
          if (!isCompleted) activePlansCount++;

          const pctPaid = totalContract > 0 ? Math.min(100, Math.round((paidAmount / totalContract) * 100)) : 0;

          items.push({
            id: v.id,
            name: v.name,
            group: v.group || 'Gerais',
            destination: v.destination || 'Nubank',
            amount: Number(v.amount),
            type: 'variable',
            typeLabel: 'Variável / Parcelada',
            totalMonths,
            paidMonthsCount,
            totalContract,
            paidAmount,
            remainingAmount,
            isCompleted,
            pctPaid,
            startMonth: v.startMonth,
            startYear: v.startYear,
            endMonth: v.endMonth,
            endYear: v.endYear
          });
        });

        // Fixed expenses (annualized reference)
        state.fixed.forEach(f => {
          const activeVersions = f.versions || [{ year: state.year, month: state.month, amount: f.amount }];
          const baseAmount = Number(activeVersions[0]?.amount || f.amount || 0);
          const totalMonths = 12;
          const totalContract = baseAmount * 12;
          grandContractTotal += totalContract;

          let paidMonthsCount = 0;
          if (f.paidHistory) {
            for (let m = 1; m <= 12; m++) {
              if (f.paidHistory[ymKey(state.year, m)] === true) paidMonthsCount++;
            }
          }

          const paidAmount = paidMonthsCount * baseAmount;
          const remainingAmount = Math.max(0, totalContract - paidAmount);
          grandPaidTotal += paidAmount;
          grandRemainingTotal += remainingAmount;

          const isCompleted = paidMonthsCount >= 12;
          if (!isCompleted) activePlansCount++;

          const pctPaid = totalContract > 0 ? Math.min(100, Math.round((paidAmount / totalContract) * 100)) : 0;

          items.push({
            id: f.id,
            name: f.name,
            group: f.group || 'Gerais',
            destination: f.destination || 'Nubank',
            amount: baseAmount,
            type: 'fixed',
            typeLabel: 'Fixa (Anual)',
            totalMonths: 12,
            paidMonthsCount,
            totalContract,
            paidAmount,
            remainingAmount,
            isCompleted,
            pctPaid,
            startMonth: 1,
            startYear: state.year,
            endMonth: 12,
            endYear: state.year
          });
        });

        $('#expensesInstallmentsMetrics').innerHTML = `
      <div class="metric">
        <div class="label">Total em Gastos e Compras</div>
        <div class="value num negative">${currency(grandContractTotal)}</div>
        <div class="sub">Valor acumulado de contratos</div>
      </div>
      <div class="metric">
        <div class="label">Total Já Pago</div>
        <div class="value num positive">${currency(grandPaidTotal)}</div>
        <div class="sub">Parcelas quitadas no período</div>
      </div>
      <div class="metric">
        <div class="label">Saldo Restante a Pagar</div>
        <div class="value num warning">${currency(grandRemainingTotal)}</div>
        <div class="sub">Total de parcelas futuras</div>
      </div>
      <div class="metric">
        <div class="label">Contratos Ativos</div>
        <div class="value num info">${activePlansCount} <small style="font-size:.8rem; color:var(--muted)">de ${items.length}</small></div>
        <div class="sub">Lançamentos em andamento</div>
      </div>
    `;

        // Populate top filter bar selects while preserving selection
        const catSel = $('#installmentsCategoryFilter');
        if (catSel) {
          const currentVal = catSel.value || 'all';
          const stateCatNames = (state.categories || []).map(c => (typeof getCategoryName === 'function' ? getCategoryName(c) : (typeof c === 'string' ? c : c.name))).filter(Boolean);
          const itemCatNames = items.map(i => i.group).filter(Boolean);
          const uniqueCats = [...new Set([...stateCatNames, ...itemCatNames])].sort();
          catSel.innerHTML = `<option value="all">Todas as Categorias</option>` + uniqueCats.map(catName => `<option value="${escapeHtml(catName)}">${escapeHtml(catName)}</option>`).join('');
          catSel.value = uniqueCats.includes(currentVal) ? currentVal : 'all';
        }

        const destSel = $('#installmentsDestFilter');
        if (destSel) {
          const currentVal = destSel.value || 'all';
          const uniqueDests = [...new Set((state.destinations || []).map(d => d.name).concat(items.map(i => i.destination)).filter(Boolean))].sort();
          destSel.innerHTML = `<option value="all">Todos os Destinos</option>` + uniqueDests.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
          destSel.value = uniqueDests.includes(currentVal) ? currentVal : 'all';
        }

        const query = ($('#installmentsSearchInput')?.value || '').toLowerCase().trim();
        const categoryFilter = $('#installmentsCategoryFilter')?.value || 'all';
        const destFilter = $('#installmentsDestFilter')?.value || 'all';
        const typeFilter = $('#installmentsTypeFilter')?.value || 'all';
        const statusFilter = $('#installmentsStatusFilter')?.value || 'all';

        const filtered = items.filter(item => {
          if (categoryFilter !== 'all' && item.group !== categoryFilter) return false;
          if (destFilter !== 'all' && item.destination !== destFilter) return false;
          if (typeFilter !== 'all' && item.type !== typeFilter) return false;
          if (statusFilter === 'active' && item.isCompleted) return false;
          if (statusFilter === 'completed' && !item.isCompleted) return false;
          if (query) {
            const text = `${item.name} ${item.group} ${item.destination}`.toLowerCase();
            if (!text.includes(query)) return false;
          }
          return true;
        });

        // Apply interactive column sort
        const dir = expensesTableSort.asc ? 1 : -1;
        filtered.sort((a, b) => {
          let diff = 0;
          switch (expensesTableSort.key) {
            case 'name':
              diff = a.name.localeCompare(b.name);
              break;
            case 'group':
              diff = (a.group || '').localeCompare(b.group || '') || (a.destination || '').localeCompare(b.destination || '');
              break;
            case 'amount':
              diff = a.amount - b.amount;
              break;
            case 'months':
              diff = a.totalMonths - b.totalMonths || a.paidMonthsCount - b.paidMonthsCount;
              break;
            case 'total':
              diff = a.totalContract - b.totalContract;
              break;
            case 'paid':
              diff = a.paidAmount - b.paidAmount;
              break;
            case 'remaining':
              diff = a.remainingAmount - b.remainingAmount;
              break;
            case 'progress':
              diff = a.pctPaid - b.pctPaid;
              break;
            case 'period':
              diff = mk(a.startYear, a.startMonth) - mk(b.startYear, b.startMonth);
              break;
            default:
              diff = a.totalContract - b.totalContract;
          }
          return diff * dir;
        });

        updateExpensesSortIcons();

        const sumFiltered = filtered.reduce((s, i) => s + i.totalContract, 0);
        $('#sumInstallmentsTotal').textContent = `Total: ${currency(sumFiltered)}`;

        const tbody = $('#installmentsTableBody');
        if (!tbody) return;

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:24px; color:var(--muted)">Nenhum lançamento encontrado para os filtros selecionados.</td></tr>`;
          return;
        }

        tbody.innerHTML = filtered.map(item => {
          const destMeta = getDestMeta(item.destination);
          const iconSvg = DEST_SVG_ICONS[destMeta.icon] || DEST_SVG_ICONS.card;
          return `
        <tr>
          <td>
            <strong>${escapeHtml(item.name)}</strong>
            <div style="margin-top:2px;"><span class="tag" style="font-size:.7rem;">${escapeHtml(item.typeLabel)}</span></div>
          </td>
          <td>
            <span class="tag" style="margin-right:4px;">${escapeHtml(item.group)}</span>
            <span class="tag dest" style="background:${destMeta.color}22; color:${destMeta.color}; border:1px solid ${destMeta.color}44;">
              ${iconSvg} ${escapeHtml(item.destination)}
            </span>
          </td>
          <td class="num">${currency(item.amount)}</td>
          <td><span class="tag">${item.paidMonthsCount} de ${item.totalMonths}x</span></td>
          <td><strong class="num negative">${currency(item.totalContract)}</strong></td>
          <td class="num positive">${currency(item.paidAmount)}</td>
          <td class="num warning">${currency(item.remainingAmount)}</td>
          <td style="min-width:120px;">
            <div class="dest-track" style="margin-bottom:2px;">
              <div class="dest-fill" style="width:${item.pctPaid}%; background:${item.isCompleted ? 'var(--success)' : 'var(--brand)'};"></div>
            </div>
            <small style="font-weight:800; color:var(--muted);">${item.pctPaid}% ${item.isCompleted ? '(Quitado)' : ''}</small>
          </td>
          <td><small>${MONTH_ABBR[(item.startMonth || 1) - 1]}/${item.startYear} a ${MONTH_ABBR[(item.endMonth || 1) - 1]}/${item.endYear}</small></td>
          <td>
            <button type="button" class="icon-btn small edit-plan-btn" data-plan-id="${item.id}" data-plan-type="${item.type}" data-tooltip="Editar Lançamento" aria-label="Editar Lançamento">${ICONS.edit}</button>
          </td>
        </tr>
      `;
        }).join('');

        $$('.edit-plan-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-plan-id');
            const type = btn.getAttribute('data-plan-type') || 'variable';
            if (id) {
              if (type === 'fixed') {
                openEntryDialog({ mode: 'edit', type: 'fixed', fixedId: id });
              } else {
                openEntryDialog({ mode: 'edit', type: 'variable', id });
              }
            }
          });
        });
      }

      $$('.sortable-th[data-sort-table="expenses"]').forEach(th => {
        th.addEventListener('click', () => {
          const key = th.getAttribute('data-sort-key');
          if (!key) return;
          if (expensesTableSort.key === key) {
            expensesTableSort.asc = !expensesTableSort.asc;
          } else {
            expensesTableSort.key = key;
            expensesTableSort.asc = (key === 'name' || key === 'group');
          }
          renderExpensesInstallmentsTab();
        });
      });

      $('#installmentsSearchInput')?.addEventListener('input', renderExpensesInstallmentsTab);
      $('#installmentsCategoryFilter')?.addEventListener('change', renderExpensesInstallmentsTab);
      $('#installmentsDestFilter')?.addEventListener('change', renderExpensesInstallmentsTab);
      $('#installmentsTypeFilter')?.addEventListener('change', renderExpensesInstallmentsTab);
      $('#installmentsStatusFilter')?.addEventListener('change', renderExpensesInstallmentsTab);

  // Inicializacao dos listeners estaticos do modulo
  function initInstallmentsListeners() {
    const expMonthlyBtn = $('#expensesMonthlyTabBtn');
      if (expMonthlyBtn) {
        expMonthlyBtn.addEventListener('click', () => {
          const state = getState();
          state.expensesSubView = 'monthly';
          saveState(); render();
        });
      }

      const expInstBtn = $('#expensesInstallmentsTabBtn');
      if (expInstBtn) {
        expInstBtn.addEventListener('click', () => {
          const state = getState();
          state.expensesSubView = 'installments';
          saveState(); render();
        });
      }
  }

  // Bridges publicas autorizadas do modulo (consumidas por render() central, DND e cards)
  window.renderExpensesInstallmentsTab = renderExpensesInstallmentsTab;
  window.openExpenseTimeline = openExpenseTimeline;
  window.buildExpenseAnalysisSummaryHtml = buildExpenseAnalysisSummaryHtml;
  window.convertVariableToFixed = convertVariableToFixed;
  window.openConvertFixedToVarDialog = openConvertFixedToVarDialog;
  window.initExpenseInstallmentsModule = initConvertFixedToVarDialog;

  // Inicializacao sincrona dos listeners estaticos do modulo
  try {
    initInstallmentsListeners();
  } catch (err) {
    console.error('Erro ao inicializar expenseInstallments listeners:', err);
  }
})();
