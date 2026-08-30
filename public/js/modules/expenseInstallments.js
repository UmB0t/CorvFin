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

function openExpenseTimeline(opts) {
    const state = getState();
        const { type, id, fixedId } = opts;
        const timelineDlg = $('#timelineDialog');
        if (!timelineDlg) return;

        let itemTitle = '', itemGroup = '', itemDest = '', itemNote = '';
        const monthsStatus = [];
        let annualPlanned = 0;
        let annualPaid = 0;
        let paidMonthsCount = 0;
        let activeMonthsCount = 0;

        if (type === 'fixed') {
          const fixed = state.fixed.find(f => f.id === fixedId);
          if (!fixed) return;
          itemTitle = fixed.name;
          itemGroup = fixed.group || 'Gerais';
          itemDest = fixed.destination || 'Nubank';
          itemNote = fixed.note || '';

          const targetY = state.year;
          let runningPaid = 0;

          for (let m = 1; m <= 12; m++) {
            const target = mk(targetY, m);
            const key = ymKey(targetY, m);

            let isActive = true;
            if (fixed.endedFrom && target >= mk(fixed.endedFrom.year, fixed.endedFrom.month)) {
              isActive = false;
            }

            const versions = [...fixed.versions].sort((a, b) => mk(a.year, a.month) - mk(b.year, b.month));
            let activeVer = null;
            for (const v of versions) {
              if (mk(v.year, v.month) <= target) activeVer = v; else break;
            }

            if (!activeVer) isActive = false;

            const amount = isActive && activeVer ? Number(activeVer.amount) : 0;
            const isPaid = isActive && fixed.paidHistory && fixed.paidHistory[key] === true;

            if (isActive) {
              annualPlanned += amount;
              activeMonthsCount++;
              if (isPaid) {
                annualPaid += amount;
                runningPaid += amount;
                paidMonthsCount++;
              }
            }

            monthsStatus.push({
              month: m,
              year: targetY,
              isActive,
              amount,
              isPaid,
              runningPaid,
              vigenciaText: isActive ? `Fixa (desde ${MONTH_ABBR[(activeVer.month || 1) - 1]}/${activeVer.year})` : 'Inativo / Encerrado'
            });
          }
        } else if (type === 'variable') {
          const v = state.variable.find(x => x.id === id);
          if (!v) return;
          itemTitle = v.name;
          itemGroup = v.group || 'Gerais';
          itemDest = v.destination || 'Nubank';
          itemNote = v.note || '';

          const targetY = state.year;
          const totalContractMonths = mk(v.endYear, v.endMonth) - mk(v.startYear, v.startMonth) + 1;
          let runningPaid = 0;

          for (let m = 1; m <= 12; m++) {
            const target = mk(targetY, m);
            const key = ymKey(targetY, m);
            const isActive = target >= mk(v.startYear, v.startMonth) && target <= mk(v.endYear, v.endMonth);
            const idx = isActive ? (target - mk(v.startYear, v.startMonth) + 1) : 0;
            const isPaid = isActive && v.paidHistory && v.paidHistory[key] === true;
            const amount = isActive ? Number(v.amount) : 0;

            if (isActive) {
              annualPlanned += amount;
              activeMonthsCount++;
              if (isPaid) {
                annualPaid += amount;
                runningPaid += amount;
                paidMonthsCount++;
              }
            }

            monthsStatus.push({
              month: m,
              year: targetY,
              isActive,
              amount,
              isPaid,
              runningPaid,
              vigenciaText: isActive ? `Parcela ${idx} de ${totalContractMonths}` : (target < mk(v.startYear, v.startMonth) ? 'Antes do Início' : 'Após o Término')
            });
          }
        }

        const pctAnnualPaid = annualPlanned > 0 ? Math.min(100, Math.round((annualPaid / annualPlanned) * 100)) : 0;
        const remainingAnnual = Math.max(0, annualPlanned - annualPaid);

        $('#timelineTitle').innerHTML = `${escapeHtml(itemTitle)} <span class="tag" style="margin-left:8px;">${escapeHtml(itemGroup)}</span>`;
        $('#timelineSub').textContent = `Destino: ${itemDest} • Ano de Análise: ${state.year}${itemNote ? ` • Obs: ${itemNote}` : ''}`;

        $('#timelineMetrics').innerHTML = `
      <div class="metric" style="padding:12px 14px;">
        <div class="label">Total Previsto (${state.year})</div>
        <div class="value num negative" style="font-size:1.25rem;">${currency(annualPlanned)}</div>
        <div class="sub">${activeMonthsCount} mês(es) vigente(s)</div>
      </div>
      <div class="metric" style="padding:12px 14px;">
        <div class="label">Total Pago (${state.year})</div>
        <div class="value num positive" style="font-size:1.25rem;">${currency(annualPaid)}</div>
        <div class="sub">${paidMonthsCount} de ${activeMonthsCount} quitados</div>
      </div>
      <div class="metric" style="padding:12px 14px;">
        <div class="label">Pendente (${state.year})</div>
        <div class="value num warning" style="font-size:1.25rem;">${currency(remainingAnnual)}</div>
        <div class="sub">${activeMonthsCount - paidMonthsCount} mês(es) a pagar</div>
      </div>
    `;

        const progBar = $('#timelineProgressBar');
        if (progBar) progBar.style.width = `${pctAnnualPaid}%`;
        const progText = $('#timelineProgressText');
        if (progText) progText.textContent = `${pctAnnualPaid}% quitado no ano (${currency(annualPaid)} de ${currency(annualPlanned)})`;

        const tbody = $('#timelineTableBody');
        if (tbody) {
          tbody.innerHTML = monthsStatus.map(st => {
            const isCurrentMonth = st.month === state.month;
            let statusBadge = '<span class="tag" style="opacity:0.6;">Inativo</span>';
            if (st.isActive) {
              statusBadge = st.isPaid
                ? '<span class="badge success">Pago</span>'
                : '<span class="badge warning">Pendente</span>';
            }

            return `
          <tr style="${isCurrentMonth ? 'background:var(--brand-soft); font-weight:700;' : ''} border-bottom:1px solid var(--line);">
            <td style="padding:10px 12px;">
              <strong>${MONTH_NAMES[st.month - 1]} / ${st.year}</strong>
              ${isCurrentMonth ? '<span class="tag" style="margin-left:6px; font-size:.7rem; background:var(--brand-strong); color:#fff;">Mês Atual</span>' : ''}
            </td>
            <td style="padding:10px 12px; color:var(--muted);">${st.vigenciaText}</td>
            <td style="padding:10px 12px;" class="num">${st.isActive ? currency(st.amount) : '—'}</td>
            <td style="padding:10px 12px;">${statusBadge}</td>
            <td style="padding:10px 12px; text-align:right;" class="num positive">${st.isActive && st.runningPaid > 0 ? currency(st.runningPaid) : '—'}</td>
          </tr>
        `;
          }).join('');
        }

        timelineDlg.showModal();
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
