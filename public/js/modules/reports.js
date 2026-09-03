/* ==========================================================================
   MÓDULO DE RELATÓRIOS FINANCEIROS (reports.js)
   Exportação, visualização anual/mensal consolidada, devedores e benefícios
   ========================================================================== */

(function () {
  'use strict';

        function initReportDialog() {
        $('#reportTypeFilter')?.addEventListener('change', () => {
          const type = $('#reportTypeFilter').value;
          const monthWrap = $('#reportMonthWrap');
          const debtorWrap = $('#reportDebtorWrap');
          const statusWrap = $('#reportStatusWrap');

          if (monthWrap) monthWrap.hidden = (type === 'consolidated_annual');
          if (debtorWrap) debtorWrap.hidden = (type !== 'debtors_report');
          if (statusWrap) statusWrap.hidden = (type === 'benefits_report');

          updateReportPreview();
        });

        $('#reportYearInput')?.addEventListener('input', updateReportPreview);
        $('#reportMonthSelect')?.addEventListener('change', updateReportPreview);
        $('#reportDebtorSelect')?.addEventListener('change', updateReportPreview);
        $('#reportStatusFilter')?.addEventListener('change', updateReportPreview);

        $('#printReportBtn')?.addEventListener('click', () => {
          window.print();
        });

        $('#exportReportCsvBtn')?.addEventListener('click', exportReportCsv);
      }

      function openReportDialog() {
    const state = getState();
        const reportDlg = $('#reportDialog');
        if (!reportDlg) return;

        const yearInput = $('#reportYearInput');
        if (yearInput) yearInput.value = state.year;

        const monthSel = $('#reportMonthSelect');
        if (monthSel) {
          monthSel.innerHTML = MONTH_NAMES.map((name, idx) => `<option value="${idx + 1}" ${idx + 1 === state.month ? 'selected' : ''}>${name}</option>`).join('');
        }

        const debtorSel = $('#reportDebtorSelect');
        if (debtorSel) {
          const uniqueDebtors = [...new Set((state.debtors || []).map(d => d.debtorName).filter(Boolean))];
          debtorSel.innerHTML = `<option value="all" selected>Todos os Devedores</option>` + uniqueDebtors.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
        }

        const type = $('#reportTypeFilter')?.value || 'consolidated_annual';
        if ($('#reportMonthWrap')) $('#reportMonthWrap').hidden = (type === 'consolidated_annual');
        if ($('#reportDebtorWrap')) $('#reportDebtorWrap').hidden = (type !== 'debtors_report');
        if ($('#reportStatusWrap')) $('#reportStatusWrap').hidden = (type === 'benefits_report');

        updateReportPreview();
        reportDlg.showModal();
      }

  function formatDebtorInstallment(d, year, month) {
    if (!d) return '—';
    let cur = d.installmentIndex || d.currentInstallmentIndex;
    let total = d.installmentTotal || d.installmentsCount || d.totalMonths;

    if ((!total || !cur) && d.startYear && d.startMonth && d.endYear && d.endMonth) {
      if (typeof mk === 'function') {
        total = mk(d.endYear, d.endMonth) - mk(d.startYear, d.startMonth) + 1;
        if (year && month) {
          cur = mk(year, month) - mk(d.startYear, d.startMonth) + 1;
        }
      } else {
        total = (d.endYear - d.startYear) * 12 + (d.endMonth - d.startMonth) + 1;
        if (year && month) {
          cur = (year - d.startYear) * 12 + (month - d.startMonth) + 1;
        }
      }
    }

    if (typeof total === 'number' && !isNaN(total) && total > 0) {
      if (total === 1) return '1x';
      if (typeof cur === 'number' && !isNaN(cur) && cur > 0) {
        return `${cur}/${total}`;
      }
      return `${total}x`;
    }
    return '—';
  }

  function formatDebtorVigencia(d) {
    if (!d || !d.startMonth || !d.startYear) return '—';
    const startStr = `${MONTH_NAMES[d.startMonth - 1] || d.startMonth}/${d.startYear}`;
    if (!d.endMonth || !d.endYear || (d.startYear === d.endYear && d.startMonth === d.endMonth)) {
      return startStr;
    }
    const endStr = `${MONTH_NAMES[d.endMonth - 1] || d.endMonth}/${d.endYear}`;
    return `${startStr} - ${endStr}`;
  }

  window.formatDebtorInstallment = formatDebtorInstallment;
  window.formatDebtorVigencia = formatDebtorVigencia;

      function updateReportPreview() {
    const state = getState();
        const type = $('#reportTypeFilter')?.value || 'consolidated_annual';
        const year = Number($('#reportYearInput')?.value) || state.year;
        const month = Number($('#reportMonthSelect')?.value) || state.month;
        const debtorFilter = $('#reportDebtorSelect')?.value || 'all';
        const statusFilter = $('#reportStatusFilter')?.value || 'all';

        const titleEl = $('#reportPreviewTitle');
        const subtitleEl = $('#reportPreviewSubtitle');
        const summaryCards = $('#reportSummaryCards');
        const thead = $('#reportDynamicThead');
        const tbody = $('#reportDynamicTbody');
        const tfoot = $('#reportDynamicTfoot');

        const now = new Date();
        const genDateStr = `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

        if (type === 'consolidated_annual') {
          if (titleEl) titleEl.textContent = `CorvFin • Relatório Consolidado Anual`;
          if (subtitleEl) subtitleEl.textContent = `Ano Base: ${year} • Gerado em ${genDateStr}`;

          if (thead) {
            thead.innerHTML = `
              <tr>
                <th>Mês</th>
                <th style="text-align:right;">Salário Base</th>
                <th style="text-align:right;">Renda Extra</th>
                <th style="text-align:right;">Despesas Fixas</th>
                <th style="text-align:right;">Despesas Var.</th>
                <th style="text-align:right;">Total Gastos</th>
                <th style="text-align:right;">Sobra Líquida</th>
              </tr>
            `;
          }

          let totSal = 0, totExt = 0, totFix = 0, totVar = 0, totExp = 0, totSob = 0;
          let rowsHtml = '';

          for (let m = 1; m <= 12; m++) {
            const t = monthTotals(year, m);
            const sobra = t.totalIncome - t.totalExpenses;
            totSal += t.baseSalary;
            totExt += t.sumExt;
            totFix += t.sumFixed;
            totVar += t.sumVar;
            totExp += t.totalExpenses;
            totSob += sobra;

            rowsHtml += `
              <tr>
                <td><strong>${MONTH_NAMES[m - 1]}</strong></td>
                <td class="num" style="text-align:right;">${currency(t.baseSalary)}</td>
                <td class="num positive" style="text-align:right;">${currency(t.sumExt)}</td>
                <td class="num" style="text-align:right;">${currency(t.sumFixed)}</td>
                <td class="num" style="text-align:right;">${currency(t.sumVar)}</td>
                <td class="num negative" style="text-align:right;">${currency(t.totalExpenses)}</td>
                <td class="num ${sobra >= 0 ? 'positive' : 'negative'}" style="text-align:right; font-weight:750;">${currency(sobra)}</td>
              </tr>
            `;
          }

          if (tbody) tbody.innerHTML = rowsHtml;

          if (tfoot) {
            tfoot.innerHTML = `
              <tr>
                <td>TOTAL ANUAL (${year})</td>
                <td class="num" style="text-align:right;">${currency(totSal)}</td>
                <td class="num positive" style="text-align:right;">${currency(totExt)}</td>
                <td class="num" style="text-align:right;">${currency(totFix)}</td>
                <td class="num" style="text-align:right;">${currency(totVar)}</td>
                <td class="num negative" style="text-align:right;">${currency(totExp)}</td>
                <td class="num ${totSob >= 0 ? 'positive' : 'negative'}" style="text-align:right; font-weight:800;">${currency(totSob)}</td>
              </tr>
            `;
          }

          if (summaryCards) {
            summaryCards.innerHTML = `
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">RECEITA TOTAL ANUAL</div>
                <div class="num positive" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${currency(totSal + totExt)}</div>
              </div>
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">DESPESAS TOTAIS</div>
                <div class="num negative" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${currency(totExp)}</div>
              </div>
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">SOBRA LÍQUIDA ACUMULADA</div>
                <div class="num ${totSob >= 0 ? 'positive' : 'negative'}" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${currency(totSob)}</div>
              </div>
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">MÉDIA MENSAL DE GASTOS</div>
                <div class="num" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${currency(totExp / 12)}</div>
              </div>
            `;
          }
        } else if (type === 'detailed_monthly') {
          const monthName = MONTH_NAMES[month - 1] || `Mês ${month}`;
          if (titleEl) titleEl.textContent = `CorvFin • Relatório Detalhado de ${monthName}/${year}`;
          if (subtitleEl) subtitleEl.textContent = `Mês de Referência: ${monthName} de ${year} • Status: ${statusFilter === 'all' ? 'Todos' : (statusFilter === 'pago' ? 'Quitados' : 'Pendentes')} • Gerado em ${genDateStr}`;

          if (thead) {
            thead.innerHTML = `
              <tr>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Categoria / Fonte</th>
                <th>Destino</th>
                <th>Vencimento / Dia</th>
                <th>Status</th>
                <th style="text-align:right;">Valor (R$)</th>
              </tr>
            `;
          }

          const fixedActive = activeFixedForMonth(year, month);
          const varActive = activeVariableForMonth(year, month);
          const extraActive = activeExtrasForMonth(year, month);

          const items = [];

          fixedActive.forEach(f => {
            const isPaid = f.status === 'pago';
            if (statusFilter === 'all' || (statusFilter === 'pago' && isPaid) || (statusFilter === 'pendente' && !isPaid)) {
              items.push({
                type: 'Despesa Fixa',
                name: f.name,
                category: f.group || 'Gerais',
                destination: f.destination || 'Nubank',
                due: f.dueDay ? `Dia ${f.dueDay}` : '—',
                status: isPaid ? 'Pago' : 'Pendente',
                isPaid,
                isIncome: false,
                amount: f.amount
              });
            }
          });

          varActive.forEach(v => {
            const isPaid = v.status === 'pago';
            if (statusFilter === 'all' || (statusFilter === 'pago' && isPaid) || (statusFilter === 'pendente' && !isPaid)) {
              items.push({
                type: 'Despesa Variável',
                name: v.name,
                category: v.group || 'Gerais',
                destination: v.destination || 'Nubank',
                due: v.dueDay ? `Dia ${v.dueDay}` : '—',
                status: isPaid ? 'Pago' : 'Pendente',
                isPaid,
                isIncome: false,
                amount: v.amount
              });
            }
          });

          extraActive.forEach(e => {
            const isPaid = e.status === 'pago';
            if (statusFilter === 'all' || (statusFilter === 'pago' && isPaid) || (statusFilter === 'pendente' && !isPaid)) {
              items.push({
                type: 'Renda Extra',
                name: e.title,
                category: e.source || 'Extra',
                destination: e.sender || '—',
                due: '—',
                status: isPaid ? 'Recebido' : 'Pendente',
                isPaid,
                isIncome: true,
                amount: e.amount
              });
            }
          });

          let totExpenses = 0, totIncomes = 0, totPaid = 0, totPending = 0;
          let rowsHtml = '';

          items.forEach(it => {
            if (it.isIncome) {
              totIncomes += it.amount;
            } else {
              totExpenses += it.amount;
              if (it.isPaid) totPaid += it.amount;
              else totPending += it.amount;
            }

            rowsHtml += `
              <tr>
                <td><span class="tag" style="font-size:.72rem;">${escapeHtml(it.type)}</span></td>
                <td><strong>${escapeHtml(it.name)}</strong></td>
                <td>${escapeHtml(it.category)}</td>
                <td>${escapeHtml(it.destination)}</td>
                <td>${escapeHtml(it.due)}</td>
                <td><span class="status-badge ${it.isPaid ? 'paid' : 'pending'}" style="font-size:.72rem;">${it.status}</span></td>
                <td class="num ${it.isIncome ? 'positive' : 'negative'}" style="text-align:right;">${currency(it.amount)}</td>
              </tr>
            `;
          });

          if (items.length === 0) {
            rowsHtml = `<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:18px;">Nenhum lançamento encontrado para os filtros selecionados.</td></tr>`;
          }

          if (tbody) tbody.innerHTML = rowsHtml;

          const baseSal = Number(state.profile.baseSalary) || 0;
          const totalIncWithSalary = baseSal + totIncomes;
          const netMonth = totalIncWithSalary - totExpenses;

          if (tfoot) {
            tfoot.innerHTML = `
              <tr>
                <td colspan="6">TOTAL GERAL DE DESPESAS NO MÊS</td>
                <td class="num negative" style="text-align:right; font-weight:800;">${currency(totExpenses)}</td>
              </tr>
            `;
          }

          if (summaryCards) {
            summaryCards.innerHTML = `
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">RECEITA TOTAL (SALÁRIO + EXTRAS)</div>
                <div class="num positive" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${currency(totalIncWithSalary)}</div>
              </div>
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">TOTAL DESPESAS</div>
                <div class="num negative" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${currency(totExpenses)}</div>
              </div>
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">TOTAL PAGO / PENDENTE</div>
                <div style="font-size:.85rem; font-weight:750; margin-top:2px;">
                  <span class="num positive">${currency(totPaid)}</span> / <span class="num warning">${currency(totPending)}</span>
                </div>
              </div>
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">SALDO LÍQUIDO DO MÊS</div>
                <div class="num ${netMonth >= 0 ? 'positive' : 'negative'}" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${currency(netMonth)}</div>
              </div>
            `;
          }
        } else if (type === 'debtors_report') {
          const monthName = MONTH_NAMES[month - 1];
          if (titleEl) titleEl.textContent = `CorvFin • Relatório de Devedores`;
          if (subtitleEl) subtitleEl.textContent = `Referência: ${monthName}/${year} • Filtro: ${debtorFilter === 'all' ? 'Todos os Devedores' : debtorFilter} • Gerado em ${genDateStr}`;

          if (thead) {
            thead.innerHTML = `
              <tr>
                <th>Devedor</th>
                <th>Descrição / Cobrança</th>
                <th>Destino</th>
                <th>Vigência</th>
                <th>Status no Mês</th>
                <th style="text-align:right;">Parcela</th>
                <th style="text-align:center;">Parcelamento</th>
              </tr>
            `;
          }

          const activeDebtors = activeDebtorsForMonth(year, month);
          let filtered = activeDebtors;
          if (debtorFilter !== 'all') {
            filtered = filtered.filter(d => d.debtorName === debtorFilter);
          }
          if (statusFilter !== 'all') {
            filtered = filtered.filter(d => d.status === statusFilter);
          }

          let totParcela = 0, totPaid = 0, totPending = 0;
          let rowsHtml = '';

          filtered.forEach(d => {
            totParcela += d.amount;
            if (d.status === 'pago') totPaid += d.amount;
            else totPending += d.amount;

            rowsHtml += `
              <tr>
                <td><strong>${escapeHtml(d.debtorName)}</strong></td>
                <td>${escapeHtml(d.title)}</td>
                <td>${escapeHtml(d.destination || 'Nubank')}</td>
                <td>${formatDebtorVigencia(d)}</td>
                <td><span class="status-badge ${d.status === 'pago' ? 'paid' : 'pending'}" style="font-size:.72rem;">${d.status === 'pago' ? 'Quitado' : 'Pendente'}</span></td>
                <td class="num" style="text-align:right; font-weight:750;">${currency(d.amount)}</td>
                <td style="text-align:center; font-weight:700;">${formatDebtorInstallment(d, year, month)}</td>
              </tr>
            `;
          });

          if (filtered.length === 0) {
            rowsHtml = `<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:18px;">Nenhum devedor encontrado para os filtros selecionados.</td></tr>`;
          }

          if (tbody) tbody.innerHTML = rowsHtml;

          if (tfoot) {
            tfoot.innerHTML = `
              <tr>
                <td colspan="5">TOTAIS DE COBRANÇAS</td>
                <td class="num" style="text-align:right; font-weight:800;">${currency(totParcela)}</td>
                <td style="text-align:center; color:var(--muted); font-weight:700;">—</td>
              </tr>
            `;
          }

          if (summaryCards) {
            summaryCards.innerHTML = `
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">TOTAL A COBRAR NO MÊS</div>
                <div class="num" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${currency(totParcela)}</div>
              </div>
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">TOTAL QUITADO / PAGO</div>
                <div class="num positive" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${currency(totPaid)}</div>
              </div>
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">TOTAL PENDENTE</div>
                <div class="num warning" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${currency(totPending)}</div>
              </div>
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">DEVEDORES ENCONTRADOS</div>
                <div class="num" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${filtered.length} registro(s)</div>
              </div>
            `;
          }
        } else if (type === 'benefits_report') {
          const monthName = MONTH_NAMES[month - 1];
          if (titleEl) titleEl.textContent = `CorvFin • Relatório de Benefícios`;
          if (subtitleEl) subtitleEl.textContent = `Período: ${monthName} de ${year} • Gastos com VA, VR, Saúde, Transporte e Outros • Gerado em ${genDateStr}`;

          if (thead) {
            thead.innerHTML = `
              <tr>
                <th>Data</th>
                <th>Tipo de Benefício</th>
                <th>Descrição do Gasto</th>
                <th>Observação</th>
                <th style="text-align:right;">Valor Utilizado (R$)</th>
              </tr>
            `;
          }

          const txs = (state.benefitTransactions || []).filter(t => t.year === year && t.month === month);
          let totSpent = 0;
          let rowsHtml = '';

          txs.forEach(t => {
            totSpent += Number(t.amount || 0);
            const typeLabel = BENEFIT_TYPES[t.type]?.label || t.type?.toUpperCase() || 'Benefício';
            const dayStr = String(t.day || 1).padStart(2, '0');
            const dateStr = `${dayStr}/${String(month).padStart(2, '0')}/${year}`;

            rowsHtml += `
              <tr>
                <td>${dateStr}</td>
                <td><span class="tag" style="font-size:.72rem;">${escapeHtml(typeLabel)}</span></td>
                <td><strong>${escapeHtml(t.description)}</strong></td>
                <td>${escapeHtml(t.note || '—')}</td>
                <td class="num negative" style="text-align:right; font-weight:750;">${currency(t.amount)}</td>
              </tr>
            `;
          });

          if (txs.length === 0) {
            rowsHtml = `<tr><td colspan="5" style="text-align:center; color:var(--muted); padding:18px;">Nenhum gasto de benefício registrado em ${monthName}/${year}.</td></tr>`;
          }

          if (tbody) tbody.innerHTML = rowsHtml;

          const limit = Number(state.benefitsConfig?.amount) || (Number(state.benefitsConfig?.va || 0) + Number(state.benefitsConfig?.vr || 0));
          const remaining = Math.max(0, limit - totSpent);

          if (tfoot) {
            tfoot.innerHTML = `
              <tr>
                <td colspan="4">TOTAL GASTO COM BENEFÍCIOS NO MÊS</td>
                <td class="num negative" style="text-align:right; font-weight:800;">${currency(totSpent)}</td>
              </tr>
            `;
          }

          if (summaryCards) {
            summaryCards.innerHTML = `
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">TETO MENSAL DO VALE</div>
                <div class="num" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${currency(limit)}</div>
              </div>
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">TOTAL GASTO</div>
                <div class="num negative" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${currency(totSpent)}</div>
              </div>
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">SALDO RESTANTE</div>
                <div class="num ${remaining > 0 ? 'positive' : 'warning'}" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${currency(remaining)}</div>
              </div>
              <div style="background:var(--surface-2); padding:10px 12px; border-radius:10px; border:1px solid var(--line);">
                <div class="card-label" style="font-size:.72rem; color:var(--muted); font-weight:800; white-space:normal; line-height:1.2;">TRANSAÇÕES NO MÊS</div>
                <div class="num" style="font-size:1.15rem; font-weight:800; margin-top:2px;">${txs.length} registro(s)</div>
              </div>
            `;
          }
        }
      }

      function exportReportCsv() {
    const state = getState();
        const type = $('#reportTypeFilter')?.value || 'consolidated_annual';
        const year = Number($('#reportYearInput')?.value) || state.year;
        const month = Number($('#reportMonthSelect')?.value) || state.month;
        const debtorFilter = $('#reportDebtorSelect')?.value || 'all';
        const statusFilter = $('#reportStatusFilter')?.value || 'all';

        let csv = '';
        let filename = '';

        if (type === 'consolidated_annual') {
          csv = `Mes,Salario Base,Renda Extra,Despesas Fixas,Despesas Variaveis,Total Gastos,Sobra Liquida\n`;
          for (let m = 1; m <= 12; m++) {
            const t = monthTotals(year, m);
            csv += `"${MONTH_NAMES[m - 1]}",${t.baseSalary.toFixed(2)},${t.sumExt.toFixed(2)},${t.sumFixed.toFixed(2)},${t.sumVar.toFixed(2)},${t.totalExpenses.toFixed(2)},${(t.totalIncome - t.totalExpenses).toFixed(2)}\n`;
          }
          filename = `corvfin-relatorio-anual-${year}.csv`;
        } else if (type === 'detailed_monthly') {
          csv = `Tipo,Descricao,Categoria,Destino,Vencimento,Status,Valor\n`;
          const fixedActive = activeFixedForMonth(year, month);
          const varActive = activeVariableForMonth(year, month);
          const extraActive = activeExtrasForMonth(year, month);

          fixedActive.forEach(f => {
            const isPaid = f.status === 'pago';
            if (statusFilter === 'all' || (statusFilter === 'pago' && isPaid) || (statusFilter === 'pendente' && !isPaid)) {
              csv += `"Despesa Fixa","${f.name}","${f.group || ''}","${f.destination || ''}","${f.dueDay || ''}","${isPaid ? 'Pago' : 'Pendente'}",${f.amount.toFixed(2)}\n`;
            }
          });
          varActive.forEach(v => {
            const isPaid = v.status === 'pago';
            if (statusFilter === 'all' || (statusFilter === 'pago' && isPaid) || (statusFilter === 'pendente' && !isPaid)) {
              csv += `"Despesa Variavel","${v.name}","${v.group || ''}","${v.destination || ''}","${v.dueDay || ''}","${isPaid ? 'Pago' : 'Pendente'}",${v.amount.toFixed(2)}\n`;
            }
          });
          extraActive.forEach(e => {
            const isPaid = e.status === 'pago';
            if (statusFilter === 'all' || (statusFilter === 'pago' && isPaid) || (statusFilter === 'pendente' && !isPaid)) {
              csv += `"Renda Extra","${e.title}","${e.source || ''}","${e.sender || ''}","","${isPaid ? 'Recebido' : 'Pendente'}",${e.amount.toFixed(2)}\n`;
            }
          });
          filename = `corvfin-relatorio-detalhado-${year}-${String(month).padStart(2, '0')}.csv`;
        } else if (type === 'debtors_report') {
          csv = `Devedor,Descricao,Destino,Inicio,Fim,Status,Parcela,Parcelamento\n`;
          const activeDebtors = activeDebtorsForMonth(year, month);
          let filtered = activeDebtors;
          if (debtorFilter !== 'all') filtered = filtered.filter(d => d.debtorName === debtorFilter);
          if (statusFilter !== 'all') filtered = filtered.filter(d => d.status === statusFilter);

          filtered.forEach(d => {
            const parcelamento = formatDebtorInstallment(d, year, month);
            const startStr = `${MONTH_NAMES[d.startMonth - 1] || d.startMonth}/${d.startYear}`;
            const endStr = d.endMonth && d.endYear ? `${MONTH_NAMES[d.endMonth - 1] || d.endMonth}/${d.endYear}` : startStr;
            csv += `"${d.debtorName}","${d.title}","${d.destination || ''}","${startStr}","${endStr}","${d.status === 'pago' ? 'Quitado' : 'Pendente'}",${Number(d.amount || 0).toFixed(2)},"${parcelamento}"\n`;
          });
          filename = `corvfin-relatorio-devedores-${year}-${String(month).padStart(2, '0')}.csv`;
        } else if (type === 'benefits_report') {
          csv = `Data,Tipo,Descricao,Observacao,Valor\n`;
          const txs = (state.benefitTransactions || []).filter(t => t.year === year && t.month === month);
          txs.forEach(t => {
            csv += `"${String(t.day || 1).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}","${t.type}","${t.description}","${t.note || ''}",${Number(t.amount || 0).toFixed(2)}\n`;
          });
          filename = `corvfin-relatorio-beneficios-${year}-${String(month).padStart(2, '0')}.csv`;
        }

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        notify('Planilha exportada com sucesso!', 'success');
      }

      $('#reportBtn')?.addEventListener('click', openReportDialog);

  // Inicializa o diálogo e registra os listeners de interface
  initReportDialog();

})();
