/* ==========================================================================
   MODULO DE DASHBOARD, INSIGHTS, RIBBON & GRAFICOS (dashboard.js)
   Financas Pro - Vanilla JS Architecture
   ========================================================================== */

(function() {
  function renderRibbon(explicitTabId) {
    const state = getState();
    const ribbonSection = document.getElementById('ribbonSection') || (typeof $ === 'function' ? $('#ribbonSection') : null);
    if (!ribbonSection) return;

    let activeTab = explicitTabId;
    if (!activeTab) {
      const activeEl = document.querySelector('[data-tab].active');
      activeTab = activeEl ? (typeof activeEl.getAttribute === 'function' ? (activeEl.getAttribute('data-tab') || activeEl.dataset?.tab) : (activeEl.dataset ? activeEl.dataset.tab : null)) : null;
    }
    if (!activeTab) {
      const visibleContent = document.querySelector('.tab-content:not([hidden])');
      activeTab = visibleContent ? visibleContent.id : 'tab-dashboard';
    }

    const TABS_WITH_MONTH_RIBBON = ['tab-dashboard', 'tab-expenses', 'tab-extras', 'tab-debtors', 'tab-benefits'];
    const shouldShow = TABS_WITH_MONTH_RIBBON.includes(activeTab);

    // Se a aba não usa ribbon, encerra sem alterar visibilidade de container (autoridade exclusiva de activateTab)
    if (!shouldShow) {
      return;
    }

    // Hydration guard: aguarda estado oficial do servidor
    if (typeof window.isStateHydrated === 'function' && !window.isStateHydrated()) {
      return;
    }

    // Inicialização defensiva do expandable caso ainda não inicializado
    if (!ribbonSection._expandableApi && typeof window.initExpandableSection === 'function') {
      window.initExpandableSection(ribbonSection, { defaultExpanded: true });
    }

    const titleMap = {
      'tab-dashboard': 'Visão Consolidada',
      'tab-expenses': 'Evolução das despesas no ano',
      'tab-extras': 'Evolução das rendas extras no ano',
      'tab-debtors': 'Evolução das cobranças a receber no ano',
      'tab-benefits': 'Evolução dos benefícios no ano'
    };
    const descMap = {
      'tab-dashboard': 'Navegação mensal e indicadores consolidados',
      'tab-expenses': 'Visão anual consolidada e histórico mês a mês',
      'tab-extras': 'Visão anual de receitas e rendas extras',
      'tab-debtors': 'Visão anual de cobranças e recebíveis',
      'tab-benefits': 'Visão anual de utilização de benefícios'
    };
    const titleEl = document.getElementById('ribbonSectionTitle');
    if (titleEl) titleEl.textContent = titleMap[activeTab] || 'Visão Consolidada';
    const descEl = document.getElementById('ribbonSectionDesc');
    if (descEl) descEl.textContent = descMap[activeTab] || 'Visão anual e navegação de competências';
    const yearBadge = document.getElementById('ribbonYearBadge');
    if (yearBadge) yearBadge.textContent = state.year;

    // Sincronização da navegação compacta (UX1.1)
    const monthList = (typeof MONTH_NAMES !== 'undefined' && Array.isArray(MONTH_NAMES) && MONTH_NAMES.length === 12)
      ? MONTH_NAMES
      : (window.MONTH_NAMES || ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']);
    const monthName = monthList[state.month - 1] || 'Mês';
    const compactDisplayEl = document.getElementById('ribbonCompactMonthDisplay');
    if (compactDisplayEl) {
      compactDisplayEl.textContent = `${monthName}/${state.year}`;
    }
    const currentCivil = (typeof todayYM === 'function') ? todayYM() : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
    const isCurrentCivilMonth = (state.year === currentCivil.year && state.month === currentCivil.month);
    const compactTodayBtn = document.getElementById('ribbonCompactTodayBtn');
    if (compactTodayBtn) {
      compactTodayBtn.classList.toggle('primary', isCurrentCivilMonth);
      compactTodayBtn.classList.toggle('soft', !isCurrentCivilMonth);
    }

    const loggedUser = (typeof window !== 'undefined' && window.API && typeof API.getUser === 'function') ? API.getUser() : null;
    const displayName = state.profile?.name || loggedUser?.nome || '';
    $('#yearLabel').textContent = state.year;
    $('#userAvatar').textContent = displayName ? displayName.charAt(0).toUpperCase() : 'U';
    $('#userNameLabel').textContent = displayName || 'Usuário';
    $('#userSalaryLabel').textContent = state.profile?.baseSalary != null ? `Salário: ${currency(state.profile.baseSalary)}` : '';

        const legendContainer = $('#ribbonLegend');
        const monthsData = [];
        let max = 1;

        for (let m = 1; m <= 12; m++) {
          if (activeTab === 'tab-expenses' || activeTab === 'tab-dashboard') {
            const t = monthTotals(state.year, m);
            const sobra = t.totalIncome - t.totalExpenses;
            const hasDeficit = sobra < 0;
            monthsData.push({
              month: m,
              total: t.totalExpenses,
              sobra,
              hasDeficit,
              segs: [{ v: t.sumFixed, c: 'var(--c-fixed)' }, { v: t.sumVar, c: 'var(--c-variable)' }]
            });
            if (t.totalExpenses > max) max = t.totalExpenses;
          } else if (activeTab === 'tab-extras') {
            const extras = activeExtrasForMonth(state.year, m);
            const sumExt = extras.reduce((s, e) => s + Number(e.amount), 0);
            monthsData.push({ month: m, total: sumExt, segs: [{ v: sumExt, c: 'var(--c-extra)' }] });
            if (sumExt > max) max = sumExt;
          } else if (activeTab === 'tab-debtors') {
            const debtors = activeDebtorsForMonth(state.year, m);
            const sumDeb = debtors.reduce((s, d) => s + Number(d.amount), 0);
            monthsData.push({ month: m, total: sumDeb, segs: [{ v: sumDeb, c: 'var(--c-debt)' }] });
            if (sumDeb > max) max = sumDeb;
          } else if (activeTab === 'tab-benefits') {
            const bt = monthBenefitsTotals(state.year, m);
            monthsData.push({ month: m, total: bt.spentTotal, segs: [{ v: bt.spentTotal, c: 'var(--brand)' }] });
            if (bt.spentTotal > max) max = bt.spentTotal;
          }
        }

        if (activeTab === 'tab-expenses' || activeTab === 'tab-dashboard') {
          legendContainer.innerHTML = `
        <span><i style="background:var(--c-fixed)"></i>Despesas Fixas</span>
        <span><i style="background:var(--c-variable)"></i>Despesas Variáveis</span>
        <span><i style="background:var(--danger); border-radius:50%; width:8px; height:8px; display:inline-block;"></i>Mês em Déficit</span>`;
        } else if (activeTab === 'tab-extras') {
          legendContainer.innerHTML = `<span><i style="background:var(--c-extra)"></i>Rendas Extras do Mês</span>`;
        } else if (activeTab === 'tab-debtors') {
          legendContainer.innerHTML = `<span><i style="background:var(--c-debt)"></i>Cobranças a Receber</span>`;
        } else if (activeTab === 'tab-benefits') {
          legendContainer.innerHTML = `
        <span><i style="background:var(--brand)"></i>Gastos com Benefício</span>`;
        }

        const ribbon = $('#ribbon');
        ribbon.innerHTML = '';

        monthsData.forEach((item, i) => {
          const month = item.month;
          const isActive = month === state.month;
          const col = document.createElement('button');
          col.type = 'button';
          col.dataset.month = month;
          col.className = 'ribbon-col' + (isActive ? ' active' : '') + (item.hasDeficit ? ' has-deficit' : '');

          let inner = '';
          item.segs.forEach(seg => {
            if (seg.v <= 0) return;
            const h = Math.max(3, Math.round((seg.v / max) * 72));
            inner += `<span style="height:${h}px; background:${seg.c}"></span>`;
          });
          col.innerHTML = `<div class="ribbon-bar">${inner}</div><small>${MONTH_ABBR[i]}</small>`;
          let tip = `${MONTH_NAMES[i]}/${state.year} • Total: ${currency(item.total)}`;
          if (item.hasDeficit) {
            tip += ` ⚠️ DÉFICIT: Sobra negativa de ${currency(item.sobra)}`;
          }
          col.title = tip;
          col.addEventListener('click', () => { state.month = month; saveState(); render(); });
          ribbon.appendChild(col);
        });
      }

      function renderDashboardMetrics() {
    const state = getState();
        const t = monthTotals(state.year, state.month);
        const sobra = t.totalIncome - t.totalExpenses;
        const isDeficit = sobra < 0;
        const pctGasto = t.totalIncome > 0 ? Math.min(100, Math.round((t.totalExpenses / t.totalIncome) * 100)) : 0;
        const pctPago = t.totalExpenses > 0 ? Math.round((t.paidExpenses / t.totalExpenses) * 100) : 100;

        let extraBadges = '';
        if (t.sumExt > 0) {
          extraBadges += ` <span class="badge success" style="padding:2px 6px;">+${currency(t.sumExt)} EXTRA</span>`;
        }
        if (t.sumDebtorCounted > 0) {
          extraBadges += ` <span class="badge info" style="padding:2px 6px;" title="Cobranças de devedores somadas ao total do mês">+${currency(t.sumDebtorCounted)} DEVEDOR</span>`;
        }


        let subIncome = `Base: ${currency(t.baseSalary)}`;
        if (t.sumExt > 0 || t.sumDebtorCounted > 0) {
          const parts = [];
          if (t.sumExt > 0) parts.push(`Extra: +${currency(t.sumExt)}`);
          if (t.sumDebtorCounted > 0) parts.push(`Devedor: +${currency(t.sumDebtorCounted)}`);
          subIncome += ` (${parts.join(', ')})`;
        }

        const deficitBanner = $('#deficitAlertBanner');
        const deficitText = $('#deficitAlertText');
        if (deficitBanner) {
          if (isDeficit) {
            deficitBanner.hidden = false;
            if (deficitText) deficitText.innerHTML = `<strong>Atenção ao Orçamento:</strong> Suas despesas em <strong>${MONTH_NAMES[state.month - 1]}/${state.year}</strong> superam a renda total em <strong>${currency(Math.abs(sobra))}</strong> (Déficit / Sobra Negativa).`;
          } else {
            deficitBanner.hidden = true;
          }
        }

        $('#dashboardMetrics').innerHTML = `
      <div class="metric">
        <div class="label" style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">Total do Mês${extraBadges}</div>
        <div class="value num positive">${currency(t.totalIncome)}</div>
        <div class="sub">${subIncome}</div>
      </div>
      <div class="metric">
        <div class="label">Total de Despesas</div>
        <div class="value num negative">${currency(t.totalExpenses)}</div>
        <div class="bar"><span style="width:${pctGasto}%; background:${isDeficit ? 'var(--danger)' : 'var(--brand)'}"></span></div>
      </div>
      <div class="metric">
        <div class="label">Valor Pago <span class="badge success">${pctPago}%</span></div>
        <div class="value num positive">${currency(t.paidExpenses)}</div>
        <div class="sub">Total de despesas quitadas</div>
      </div>
      <div class="metric">
        <div class="label">Pendente de Pagamento</div>
        <div class="value num warning">${currency(t.pendingExpenses)}</div>
        <div class="sub">Aguardando pagamento</div>
      </div>
      <div class="metric">
        <div class="label">Sobra do Valor ${isDeficit ? '<span class="badge danger" style="padding:2px 6px;">DÉFICIT</span>' : ''}</div>
        <div class="value num ${!isDeficit ? 'positive' : 'negative'}">${currency(sobra)}</div>
        <div class="sub">${isDeficit ? `<span style="color:var(--danger); font-weight:700;">Déficit de ${currency(Math.abs(sobra))}</span>` : 'Renda líquida após despesas'}</div>
      </div>
    `;
      }


      function renderInsightsSection() {
    const state = getState();
        const container = $('#insightsContainer');
        const t = monthTotals(state.year, state.month);

        let prevY = state.year, prevM = state.month - 1;
        if (prevM < 1) { prevM = 12; prevY--; }
        const prevT = monthTotals(prevY, prevM);

        const expenseChangePct = prevT.totalExpenses > 0
          ? Math.round(((t.totalExpenses - prevT.totalExpenses) / prevT.totalExpenses) * 100)
          : 0;

        const incomeCommitment = t.totalIncome > 0 ? Math.round((t.totalExpenses / t.totalIncome) * 100) : 0;
        const savingsPct = t.totalIncome > 0 ? Math.max(0, Math.round(((t.totalIncome - t.totalExpenses) / t.totalIncome) * 100)) : 0;

        const catMap = {};
        t.allExpenses.forEach(e => {
          const c = e.group || 'Gerais';
          catMap[c] = (catMap[c] || 0) + Number(e.amount);
        });

        const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
        const topCat = sortedCats[0];

        let healthBadgeClass = 'success', healthTitle = 'Excelente Saúde Financeira', healthDesc = `Sua renda cobre confortavelmente todas as despesas do mês!`;
        if (incomeCommitment > 100) {
          healthBadgeClass = 'danger'; healthTitle = 'Alerta: Orçamento Estourado'; healthDesc = `Suas despesas superam sua renda em ${currency(t.totalExpenses - t.totalIncome)}.`;
        } else if (incomeCommitment > 80) {
          healthBadgeClass = 'warning'; healthTitle = 'Atenção: Alta Taxa de Gastos'; healthDesc = `Você está comprometendo ${incomeCommitment}% da sua renda total neste mês.`;
        }

        let topCatDesc = 'Nenhuma despesa cadastrada neste mês.';
        if (topCat) {
          const topCatPct = t.totalExpenses > 0 ? Math.round((topCat[1] / t.totalExpenses) * 100) : 0;
          topCatDesc = `Sua maior despesa é <strong>${topCat[0]}</strong> (${currency(topCat[1])} — ${topCatPct}% dos custos totais).`;
        }

        let momTitle = 'Comparativo Mensal';
        let momDesc = `Gastos equilibrados em relação ao mês anterior.`;
        if (expenseChangePct > 0) {
          momDesc = `Seus gastos subiram <strong>+${expenseChangePct}%</strong> em relação a ${MONTH_ABBR[prevM - 1]}/${prevY}.`;
        } else if (expenseChangePct < 0) {
          momDesc = `Parabéns! Seus gastos caíram <strong>${expenseChangePct}%</strong> comparado a ${MONTH_ABBR[prevM - 1]}/${prevY}.`;
        }

        container.innerHTML = `
      <div class="insight-card">
        <div class="insight-icon" style="background:var(--brand-soft); color:var(--brand-strong);">${ICONS.bank}</div>
        <div>
          <div style="font-weight:800; font-size:.88rem;">${healthTitle} <span class="badge ${healthBadgeClass}">${incomeCommitment}% Renda</span></div>
          <div style="font-size:.78rem; color:var(--muted); margin-top:2px;">${healthDesc} Taxa de poupança: <strong>${savingsPct}%</strong>.</div>
        </div>
      </div>

      <div class="insight-card">
        <div class="insight-icon" style="background:var(--c-fixed-soft); color:var(--c-fixed);">${ICONS.box}</div>
        <div>
          <div style="font-weight:800; font-size:.88rem;">Maior Custo do Mês</div>
          <div style="font-size:.78rem; color:var(--muted); margin-top:2px;">${topCatDesc}</div>
        </div>
      </div>

      <div class="insight-card">
        <div class="insight-icon" style="background:var(--info-soft); color:var(--info);">${ICONS.clock}</div>
        <div>
          <div style="font-weight:800; font-size:.88rem;">${momTitle}</div>
          <div style="font-size:.78rem; color:var(--muted); margin-top:2px;">${momDesc}</div>
        </div>
      </div>
    `;
      }

      /* =============================================================
         GRÁFICO UNIFICADO: DISTRIBUIÇÃO & LIMITES POR CATEGORIA
         ============================================================= */

      function renderCategoryBarView(items, totalIncome, totalSpent) {
        return `
      <div class="dest-bars" style="display:grid; gap:12px;">
        ${items.map(item => {
          let barColor = item.color;
          let alertBadges = [];

          if (item.isOverBudget) {
            barColor = 'var(--danger)';
            alertBadges.push(`<span class="badge danger" title="Gasto superou o teto definido!">⚠️ Estourou Teto (+${currency(item.spent - item.budget)})</span>`);
          } else if (item.isNearBudget) {
            alertBadges.push(`<span class="badge warning" title="Próximo ao teto (${item.pctBudget.toFixed(0)}%)">${item.pctBudget.toFixed(0)}% do Teto</span>`);
          }

          if (item.isOver30Income) {
            barColor = 'var(--danger)';
            alertBadges.push(`<span class="badge danger" title="Categoria consome mais de 30% da sua renda total!">🚨 &gt;30% da Renda (${item.pctIncome.toFixed(1)}%)</span>`);
          } else if (item.pctIncome >= 20) {
            alertBadges.push(`<span class="badge warning">${item.pctIncome.toFixed(1)}% da renda</span>`);
          } else if (totalIncome > 0 && item.spent > 0) {
            alertBadges.push(`<span class="badge success">${item.pctIncome.toFixed(1)}% da renda</span>`);
          }

          const barWidth = totalIncome > 0 ? Math.min(100, Math.round(item.pctIncome)) : (totalSpent > 0 ? Math.min(100, Math.round((item.spent / totalSpent) * 100)) : 0);
          const iconSvg = (typeof getCategoryIconSvg === 'function') ? getCategoryIconSvg(item.cat) : '';

          return `
            <div class="dest-bar-item" style="grid-template-columns: 140px 1fr auto auto; gap: 12px; align-items: center;">
              <div style="display:flex; align-items:center; gap:6px; overflow:hidden;">
                <span style="display:inline-flex; color:${item.color}; flex-shrink:0;">${iconSvg}</span>
                <span class="dest-name" title="${escapeHtml(item.cat)}"><strong>${escapeHtml(item.cat)}</strong></span>
              </div>
              <div class="dest-track" style="height:12px; background:var(--surface-2); border-radius:999px; position:relative; overflow:hidden;">
                <div class="dest-fill" style="width:${barWidth}%; background:${barColor}; border-radius:999px; height:100%; transition:width .3s ease;"></div>
              </div>
              <div class="dest-val num" style="font-size:.82rem; white-space:nowrap; text-align:right;">
                <strong>${currency(item.spent)}</strong>
                ${item.budget > 0 ? `<span style="color:var(--muted); font-size:.76rem;"> / ${currency(item.budget)}</span>` : ''}
              </div>
              <div style="display:flex; gap:5px; flex-wrap:wrap; justify-content:flex-end;">
                ${alertBadges.join(' ')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
      }

      function renderCategoryColumnView(items, totalIncome, totalSpent) {
        const displayItems = items.filter(i => i.spent > 0).slice(0, 12);
        if (displayItems.length === 0) {
          return `<div class="empty">Nenhum gasto registrado em categorias neste mês.</div>`;
        }
        const maxVal = Math.max(...displayItems.map(i => Math.max(i.spent, i.budget || 0)), totalIncome * 0.35, 100);
        const chartHeight = 220;

        return `
      <div style="padding:10px 0;">
        <div style="position:relative; height:${chartHeight}px; display:flex; align-items:flex-end; gap:16px; border-bottom:2px solid var(--line); padding:0 10px 10px; margin-bottom:14px; overflow-x:auto;">
          ${totalIncome > 0 ? `
            <div style="position:absolute; left:0; right:0; bottom:${Math.min(chartHeight - 20, Math.max(25, Math.round((totalIncome * 0.3 / maxVal) * (chartHeight - 40)) + 10))}px; border-top:2px dashed var(--danger); z-index:1; pointer-events:none; display:flex; justify-content:flex-end;">
              <span style="background:var(--danger); color:#fff; font-size:.68rem; font-weight:800; padding:1px 6px; border-radius:4px; transform:translateY(-50%);">Alerta 30% da Renda (${currency(totalIncome * 0.3)})</span>
            </div>
          ` : ''}
          ${displayItems.map(item => {
          const colHeight = Math.max(14, Math.round((item.spent / maxVal) * (chartHeight - 45)));
          let colColor = item.color;
          if (item.isOverBudget || item.isOver30Income) colColor = 'var(--danger)';
          else if (item.isNearBudget || item.pctIncome >= 20) colColor = 'var(--warning)';

          return `
              <div style="flex:1; min-width:65px; max-width:110px; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end; z-index:2;">
                <div class="num" style="font-size:.72rem; font-weight:800; margin-bottom:4px; text-align:center; color:${item.isOver30Income || item.isOverBudget ? 'var(--danger)' : 'var(--text)'};">
                  ${currency(item.spent)}
                  <div style="font-size:.65rem; color:var(--muted);">${item.pctIncome.toFixed(0)}%</div>
                </div>
                <div style="width:100%; height:${colHeight}px; background:${colColor}; border-radius:8px 8px 0 0; transition:height .3s ease; box-shadow:0 2px 6px rgba(0,0,0,0.1);" title="${escapeHtml(item.cat)}: ${currency(item.spent)} (${item.pctIncome.toFixed(1)}% renda)"></div>
                <div style="margin-top:8px; font-size:.74rem; font-weight:750; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;" title="${escapeHtml(item.cat)}">
                  ${escapeHtml(item.cat)}
                </div>
              </div>
            `;
        }).join('')}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:8px;">
          ${displayItems.map(i => `
            <div style="display:inline-flex; align-items:center; gap:6px; background:var(--surface-2); padding:4px 9px; border-radius:8px; font-size:.74rem;">
              <span style="width:8px; height:8px; border-radius:50%; background:${i.color};"></span>
              <strong>${escapeHtml(i.cat)}:</strong>
              <span class="num">${currency(i.spent)}</span>
              ${i.isOverBudget ? `<span class="badge danger" style="padding:1px 5px; font-size:.65rem;">Teto Estourado</span>` : (i.isOver30Income ? `<span class="badge danger" style="padding:1px 5px; font-size:.65rem;">&gt;30% Renda</span>` : '')}
            </div>
          `).join('')}
        </div>
      </div>
    `;
      }

      function renderCategoryDonutView(items, totalIncome, totalSpent) {
        const displayItems = items.filter(i => i.spent > 0);
        if (displayItems.length === 0 || totalSpent <= 0) {
          return `<div class="empty">Nenhum gasto registrado em categorias neste mês.</div>`;
        }

        const size = 200;
        const strokeWidth = 32;
        const radius = (size - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        let accumulatedPct = 0;

        const slicesSvg = displayItems.map((item) => {
          const pct = item.spent / totalSpent;
          const strokeDasharray = `${pct * circumference} ${circumference}`;
          const strokeDashoffset = -accumulatedPct * circumference;
          accumulatedPct += pct;
          let sliceColor = item.color;
          if (item.isOverBudget || item.isOver30Income) sliceColor = 'var(--danger)';

          return `
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}"
          fill="transparent"
          stroke="${sliceColor}"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${strokeDasharray}"
          stroke-dashoffset="${strokeDashoffset}"
          transform="rotate(-90 ${size / 2} ${size / 2})"
          style="transition: stroke-dasharray .4s ease, stroke-dashoffset .4s ease;">
          <title>${escapeHtml(item.cat)}: ${currency(item.spent)} (${(pct * 100).toFixed(1)}%)</title>
        </circle>
      `;
        }).join('');

        return `
      <div style="display:flex; align-items:center; justify-content:space-around; flex-wrap:wrap; gap:24px; padding:10px 0;">
        <div style="position:relative; width:${size}px; height:${size}px; flex-shrink:0;">
          <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
            ${slicesSvg}
          </svg>
          <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; pointer-events:none;">
            <span style="font-size:.72rem; color:var(--muted); font-weight:700;">Total Gastos</span>
            <span class="num" style="font-size:1.05rem; font-weight:800;">${currency(totalSpent)}</span>
            ${totalIncome > 0 ? `<span style="font-size:.68rem; color:var(--muted);">${((totalSpent / totalIncome) * 100).toFixed(0)}% da renda</span>` : ''}
          </div>
        </div>
        <div style="flex:1; min-width:260px; display:grid; gap:8px; max-height:260px; overflow-y:auto;">
          ${displayItems.map(item => {
          const pctOfSpent = (item.spent / totalSpent) * 100;
          return `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:var(--surface-2); border-radius:10px; font-size:.8rem; gap:10px;">
                <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                  <span style="width:10px; height:10px; border-radius:50%; background:${item.color}; flex-shrink:0;"></span>
                  <span style="font-weight:750; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.cat)}</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                  <span class="num" style="font-weight:800;">${currency(item.spent)}</span>
                  <span class="badge ${item.isOver30Income || item.isOverBudget ? 'danger' : 'info'}" style="font-size:.7rem;">${pctOfSpent.toFixed(1)}%</span>
                  ${item.isOverBudget ? `<span class="badge danger" title="Teto estourado">Teto!</span>` : ''}
                  ${item.isOver30Income ? `<span class="badge danger" title=">30% da renda">&gt;30%</span>` : ''}
                </div>
              </div>
            `;
        }).join('')}
        </div>
      </div>
    `;
      }

      function renderCategoryLineView(items, totalIncome, totalSpent) {
        const displayItems = items.filter(i => i.spent > 0);
        if (displayItems.length === 0 || totalSpent <= 0) {
          return `<div class="empty">Nenhum gasto registrado em categorias neste mês.</div>`;
        }

        const svgWidth = 600;
        const svgHeight = 220;
        const padX = 50;
        const padY = 30;
        const plotW = svgWidth - 2 * padX;
        const plotH = svgHeight - 2 * padY;

        const maxVal = Math.max(...displayItems.map(i => i.spent), totalIncome * 0.35, 100);
        const n = displayItems.length;
        const stepX = n > 1 ? plotW / (n - 1) : plotW / 2;

        const points = displayItems.map((item, idx) => {
          const x = n > 1 ? padX + idx * stepX : svgWidth / 2;
          const y = svgHeight - padY - (item.spent / maxVal) * plotH;
          return { x, y, item, idx };
        });

        const polyPoints = points.map(p => `${p.x},${p.y}`).join(' ');
        const areaPoints = `${points[0].x},${svgHeight - padY} ${polyPoints} ${points[points.length - 1].x},${svgHeight - padY}`;

        const threshold30Y = totalIncome > 0 ? svgHeight - padY - (totalIncome * 0.3 / maxVal) * plotH : null;

        return `
      <div style="padding:10px 0; overflow-x:auto;">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" style="width:100%; max-height:240px; overflow:visible;">
          <defs>
            <linearGradient id="catLineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.35"/>
              <stop offset="100%" stop-color="var(--brand)" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          <!-- Grid Lines -->
          <line x1="${padX}" y1="${svgHeight - padY}" x2="${svgWidth - padX}" y2="${svgHeight - padY}" stroke="var(--line)" stroke-width="1.5"/>
          <line x1="${padX}" y1="${svgHeight - padY - plotH / 2}" x2="${svgWidth - padX}" y2="${svgHeight - padY - plotH / 2}" stroke="var(--line)" stroke-width="1" stroke-dasharray="4 4"/>
          <line x1="${padX}" y1="${padY}" x2="${svgWidth - padX}" y2="${padY}" stroke="var(--line)" stroke-width="1" stroke-dasharray="4 4"/>

          <!-- 30% Threshold Line -->
          ${threshold30Y && threshold30Y >= padY && threshold30Y <= svgHeight - padY ? `
            <line x1="${padX}" y1="${threshold30Y}" x2="${svgWidth - padX}" y2="${threshold30Y}" stroke="var(--danger)" stroke-width="1.5" stroke-dasharray="5 5"/>
            <text x="${svgWidth - padX - 4}" y="${threshold30Y - 5}" fill="var(--danger)" font-size="10" font-weight="800" text-anchor="end">30% Renda (${currency(totalIncome * 0.3)})</text>
          ` : ''}

          <!-- Area Under Curve -->
          <polygon points="${areaPoints}" fill="url(#catLineGradient)"/>

          <!-- Path Line -->
          <polyline points="${polyPoints}" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>

          <!-- Data Points & Labels -->
          ${points.map(p => {
          const isDanger = p.item.isOver30Income || p.item.isOverBudget;
          const ptColor = isDanger ? 'var(--danger)' : 'var(--brand)';
          return `
              <g>
                <circle cx="${p.x}" cy="${p.y}" r="${isDanger ? 6 : 4.5}" fill="${ptColor}" stroke="var(--surface)" stroke-width="2">
                  <title>${escapeHtml(p.item.cat)}: ${currency(p.item.spent)} (${p.item.pctIncome.toFixed(1)}% renda)</title>
                </circle>
                <text x="${p.x}" y="${p.y - 10}" text-anchor="middle" font-size="10" font-weight="800" fill="${isDanger ? 'var(--danger)' : 'var(--text)'}" font-family="'JetBrains Mono', monospace">
                  ${currency(p.item.spent)}
                </text>
                <text x="${p.x}" y="${svgHeight - padY + 16}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--muted)">
                  ${escapeHtml(p.item.cat.length > 8 ? p.item.cat.slice(0, 7) + '…' : p.item.cat)}
                </text>
              </g>
            `;
        }).join('')}
        </svg>
        <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:14px;">
          ${displayItems.map(i => `
            <div style="display:inline-flex; align-items:center; gap:6px; background:var(--surface-2); padding:4px 9px; border-radius:8px; font-size:.74rem;">
              <span style="width:8px; height:8px; border-radius:50%; background:${i.color};"></span>
              <strong>${escapeHtml(i.cat)}:</strong>
              <span class="num">${currency(i.spent)} (${i.pctIncome.toFixed(1)}% renda)</span>
              ${i.isOverBudget ? `<span class="badge danger" style="padding:1px 5px; font-size:.65rem;">Teto</span>` : (i.isOver30Income ? `<span class="badge danger" style="padding:1px 5px; font-size:.65rem;">&gt;30%</span>` : '')}
            </div>
          `).join('')}
        </div>
      </div>
    `;
      }

      function renderCategoryDistributionChart() {
    const state = getState();
        const container = $('#categoryUnifiedChartContent');
        if (!container) return;

        const t = monthTotals(state.year, state.month);
        const totalIncome = Number(t.totalIncome || 0);

        const totalBadge = $('#categoryChartTotalIncome');
        if (totalBadge) {
          totalBadge.textContent = `Renda Líquida Total: ${currency(totalIncome)}`;
        }

        const isMobile = (typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth <= 767);
        const curType = resolveEffectiveChartType(state.chartViewType || 'bar', isMobile);
        $$('.chart-type-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.chartType === curType);
        });

        const catSpent = {};
        t.allExpenses.forEach(e => {
          const c = (e.group || 'Gerais').trim();
          catSpent[c] = (catSpent[c] || 0) + Number(e.amount || 0);
        });

        const catNames = (state.categories || []).map(c => (typeof getCategoryName === 'function' ? getCategoryName(c) : (typeof c === 'string' ? c : c.name)));
        const allCategories = Array.from(new Set([...catNames, ...Object.keys(catSpent)]));

        const items = allCategories.map((cat, idx) => {
          const spent = catSpent[cat] || 0;
          const budget = Number(state.budgets[cat] || 0);
          const pctIncome = totalIncome > 0 ? (spent / totalIncome) * 100 : 0;
          const pctBudget = budget > 0 ? (spent / budget) * 100 : 0;
          const isOver30Income = totalIncome > 0 && pctIncome > 30;
          const isOverBudget = budget > 0 && spent > budget;
          const isNearBudget = budget > 0 && spent <= budget && pctBudget >= 80;
          const color = (typeof getCategoryColor === 'function') ? getCategoryColor(cat) : CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
          return {
            cat,
            spent,
            budget,
            pctIncome,
            pctBudget,
            isOver30Income,
            isOverBudget,
            isNearBudget,
            color
          };
        }).sort((a, b) => b.spent - a.spent);

        const activeItems = items.filter(it => it.spent > 0 || it.budget > 0);
        const totalSpent = items.reduce((s, it) => s + it.spent, 0);

        if (activeItems.length === 0 && totalSpent === 0) {
          container.innerHTML = `<div class="empty">Nenhuma despesa ou orçamento configurado para as categorias neste mês.</div>`;
          return;
        }

        if (curType === 'column') {
          container.innerHTML = renderCategoryColumnView(activeItems, totalIncome, totalSpent);
        } else if (curType === 'donut') {
          container.innerHTML = renderCategoryDonutView(activeItems, totalIncome, totalSpent);
        } else if (curType === 'line') {
          container.innerHTML = renderCategoryLineView(activeItems, totalIncome, totalSpent);
        } else {
          container.innerHTML = renderCategoryBarView(activeItems, totalIncome, totalSpent);
        }
      }

      const toggleCategoryChart = () => {
        const state = getState();
    state.collapsedSections.categoryChart = !state.collapsedSections.categoryChart;
        if (typeof saveLocalState === 'function') { saveLocalState(); } else { saveState('chart-toggle'); }
        render();
      };
      const toggleCategoryBtn = $('#toggleCategoryChartBtn');
      if (toggleCategoryBtn) toggleCategoryBtn.addEventListener('click', toggleCategoryChart);
      const closeCategoryBtn = $('#closeCategoryChartBtn');
      if (closeCategoryBtn) closeCategoryBtn.addEventListener('click', toggleCategoryChart);

      $$('.chart-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.chartType;
          if (type) {
            const state = getState();
            state.chartViewType = type;
            if (typeof saveLocalState === 'function') { saveLocalState(); } else { saveState('chart-toggle'); }
            renderCategoryDistributionChart();
          }
        });
      });

      const toggleInsights = () => {
        const state = getState();
    state.collapsedSections.insights = !state.collapsedSections.insights;
        if (typeof saveLocalState === 'function') { saveLocalState(); } else { saveState('chart-toggle'); }
        render();
      };
      const toggleInsightsBtn = $('#toggleInsightsBtn');
      if (toggleInsightsBtn) toggleInsightsBtn.addEventListener('click', toggleInsights);
      const closeInsightsBtn = $('#closeInsightsBtn');
      if (closeInsightsBtn) closeInsightsBtn.addEventListener('click', toggleInsights);

      function markDestinationPaid(destName) {
    const state = getState();
        const y = state.year, m = state.month;
        const key = ymKey(y, m);
        let count = 0;

        activeFixedForMonth(y, m).forEach(f => {
          const itemAcc = (typeof resolveExpenseAccount === 'function') ? resolveExpenseAccount(f) : (f.payment?.account || null);
          const isMatch = (itemAcc === destName) || (f.destination === destName);
          if (isMatch && f.status !== 'pago') {
            const item = state.fixed.find(x => x.id === f.fixedId);
            if (item) { item.paidHistory = item.paidHistory || {}; item.paidHistory[key] = true; count++; }
          }
        });

        activeVariableForMonth(y, m).forEach(v => {
          const itemAcc = (typeof resolveExpenseAccount === 'function') ? resolveExpenseAccount(v) : (v.payment?.account || null);
          const isMatch = (itemAcc === destName) || (v.destination === destName);
          if (isMatch && v.status !== 'pago') {
            const item = state.variable.find(x => x.id === v.id);
            if (item) { item.paidHistory = item.paidHistory || {}; item.paidHistory[key] = true; count++; }
          }
        });

        if (count > 0) {
          saveState(); render();
          notify(`Fatura quitada! ${count} despesa(s) de "${destName}" marcadas como PAGAS.`, 'success');
        } else {
          notify(`Todas as despesas de "${destName}" neste mês já estão pagas!`, 'info');
        }
      }

      /* =============================================================
         GRÁFICO DE DESTINOS DE COBRANÇA (BARRAS, COLUNAS, PIZZA/ROSCA)
         ============================================================= */

      function renderDestBarView(items, totalAll) {
        return `
          <div class="dest-bars" style="display:grid; gap:10px;">
            ${items.map(item => `
              <div class="dest-bar-item" style="grid-template-columns: 130px 1fr auto auto; gap: 12px; align-items: center;">
                <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                  <span style="width:20px; height:20px; border-radius:6px; background:${item.destMeta.color}22; color:${item.destMeta.color}; display:grid; place-items:center; flex-shrink:0;">
                    ${DEST_SVG_ICONS[item.destMeta.icon] || DEST_SVG_ICONS.card}
                  </span>
                  <span class="dest-name" title="${escapeHtml(item.name)}"><strong>${escapeHtml(item.name)}</strong></span>
                </div>
                <div class="dest-track" style="height:12px; background:var(--surface-2); border-radius:999px; overflow:hidden;">
                  <div class="dest-fill" style="width:${item.pct}%; background:${item.destMeta.color}; border-radius:999px; height:100%; transition:width .3s ease;"></div>
                </div>
                <span class="dest-val num" style="font-size:.84rem;"><strong>${currency(item.val)}</strong> <small style="color:var(--muted)">(${item.pct}%)</small></span>
                <button type="button" class="icon-btn small pay-dest-btn" data-pay-dest="${escapeHtml(item.name)}" data-tooltip="Quitar Fatura: Marcar todas as despesas de '${escapeHtml(item.name)}' no mês como PAGAS" aria-label="Quitar Fatura: Marcar todas as despesas de '${escapeHtml(item.name)}' no mês como PAGAS">
                  ${ICONS.check}
                </button>
              </div>
            `).join('')}
          </div>
        `;
      }

      function renderDestColumnView(items, totalAll) {
        if (items.length === 0) {
          return `<div class="empty">Nenhuma despesa registrada neste mês para gerar o gráfico por destino.</div>`;
        }
        const maxVal = Math.max(...items.map(i => i.val), 100);
        const chartHeight = 200;

        return `
          <div style="padding:10px 0;">
            <div style="position:relative; height:${chartHeight}px; display:flex; align-items:flex-end; gap:16px; border-bottom:2px solid var(--line); padding:0 10px 10px; margin-bottom:14px; overflow-x:auto;">
              ${items.map(item => {
                const colHeight = Math.max(16, Math.round((item.val / maxVal) * (chartHeight - 45)));
                return `
                  <div style="flex:1; min-width:70px; max-width:110px; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end;">
                    <div class="num" style="font-size:.72rem; font-weight:800; margin-bottom:4px; text-align:center;">
                      ${currency(item.val)}
                      <div style="font-size:.65rem; color:var(--muted);">${item.pct}%</div>
                    </div>
                    <div style="width:100%; height:${colHeight}px; background:${item.destMeta.color}; border-radius:8px 8px 0 0; transition:height .3s ease; box-shadow:0 2px 6px rgba(0,0,0,0.1);" title="${escapeHtml(item.name)}: ${currency(item.val)} (${item.pct}%)"></div>
                    <div style="margin-top:8px; font-size:.74rem; font-weight:750; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; display:flex; align-items:center; justify-content:center; gap:4px;" title="${escapeHtml(item.name)}">
                      <span style="color:${item.destMeta.color}; display:inline-flex;">${DEST_SVG_ICONS[item.destMeta.icon] || DEST_SVG_ICONS.card}</span>
                      <span>${escapeHtml(item.name)}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:8px;">
              ${items.map(item => `
                <div style="display:inline-flex; align-items:center; gap:8px; background:var(--surface-2); padding:5px 10px; border-radius:10px; font-size:.76rem; border:1px solid var(--line);">
                  <span style="width:10px; height:10px; border-radius:50%; background:${item.destMeta.color};"></span>
                  <strong>${escapeHtml(item.name)}:</strong>
                  <span class="num">${currency(item.val)} (${item.pct}%)</span>
                  <button type="button" class="icon-btn small pay-dest-btn" style="width:24px; height:24px; font-size:.75rem; margin-left:4px;" data-pay-dest="${escapeHtml(item.name)}" data-tooltip="Quitar Fatura: Marcar todas as despesas de '${escapeHtml(item.name)}' no mês como PAGAS" aria-label="Quitar Fatura: Marcar todas as despesas de '${escapeHtml(item.name)}' no mês como PAGAS">
                    ${ICONS.check}
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      function renderDestDonutView(items, totalAll) {
        if (items.length === 0 || totalAll <= 0) {
          return `<div class="empty">Nenhuma despesa registrada neste mês para gerar o gráfico por destino.</div>`;
        }

        const size = 200;
        const strokeWidth = 32;
        const radius = (size - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        let accumulatedPct = 0;

        const slicesSvg = items.map((item) => {
          const ratio = item.val / totalAll;
          const strokeDasharray = `${ratio * circumference} ${circumference}`;
          const strokeDashoffset = -accumulatedPct * circumference;
          accumulatedPct += ratio;

          return `
            <circle cx="${size / 2}" cy="${size / 2}" r="${radius}"
              fill="transparent"
              stroke="${item.destMeta.color}"
              stroke-width="${strokeWidth}"
              stroke-dasharray="${strokeDasharray}"
              stroke-dashoffset="${strokeDashoffset}"
              transform="rotate(-90 ${size / 2} ${size / 2})"
              style="transition: stroke-dasharray .4s ease, stroke-dashoffset .4s ease;">
              <title>${escapeHtml(item.name)}: ${currency(item.val)} (${item.pct}%)</title>
            </circle>
          `;
        }).join('');

        return `
          <div style="display:flex; align-items:center; justify-content:space-around; flex-wrap:wrap; gap:24px; padding:10px 0;">
            <div style="position:relative; width:${size}px; height:${size}px; flex-shrink:0;">
              <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                ${slicesSvg}
              </svg>
              <div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; pointer-events:none;">
                <span style="font-size:.72rem; color:var(--muted); font-weight:700;">Total Faturas</span>
                <span class="num" style="font-size:1.05rem; font-weight:800;">${currency(totalAll)}</span>
                <span style="font-size:.68rem; color:var(--muted);">${items.length} destinos</span>
              </div>
            </div>
            <div style="flex:1; min-width:260px; display:grid; gap:8px; max-height:260px; overflow-y:auto;">
              ${items.map(item => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:var(--surface-2); border-radius:10px; font-size:.8rem; gap:10px; border:1px solid var(--line);">
                  <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                    <span style="width:10px; height:10px; border-radius:50%; background:${item.destMeta.color}; flex-shrink:0;"></span>
                    <span style="color:${item.destMeta.color}; display:inline-flex;">${DEST_SVG_ICONS[item.destMeta.icon] || DEST_SVG_ICONS.card}</span>
                    <span style="font-weight:750; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.name)}</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                    <span class="num" style="font-weight:800;">${currency(item.val)}</span>
                    <span class="badge info" style="font-size:.7rem;">${item.pct}%</span>
                    <button type="button" class="icon-btn small pay-dest-btn" style="width:26px; height:26px; font-size:.78rem;" data-pay-dest="${escapeHtml(item.name)}" data-tooltip="Quitar Fatura: Marcar todas as despesas de '${escapeHtml(item.name)}' no mês como PAGAS" aria-label="Quitar Fatura: Marcar todas as despesas de '${escapeHtml(item.name)}' no mês como PAGAS">
                      ${ICONS.check}
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      function renderDestinationChart() {
    const state = getState();
        const container = $('#destUnifiedChartContent') || $('#destChartBars');
        if (!container) return;

        const t = monthTotals(state.year, state.month);
        const destMap = {};

        t.allExpenses.forEach(e => {
          const itemAcc = (typeof resolveExpenseAccount === 'function') ? resolveExpenseAccount(e) : (e.payment?.account || null);
          const d = (itemAcc || e.destination || 'Gerais').trim();
          destMap[d] = (destMap[d] || 0) + Number(e.amount || 0);
        });

        const rawItems = Object.entries(destMap).sort((a, b) => b[1] - a[1]);
        const totalAll = rawItems.reduce((s, i) => s + i[1], 0);

        const totalBadge = $('#destChartTotal');
        if (totalBadge) totalBadge.textContent = `Total: ${currency(totalAll)}`;

        const isMobile = (typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth <= 767);
        const curType = resolveEffectiveChartType(state.destChartViewType || 'bar', isMobile);
        $$('.dest-chart-type-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.destChartType === curType);
        });

        if (rawItems.length === 0 || totalAll <= 0) {
          container.innerHTML = `<div class="empty">Nenhuma despesa registrada neste mês para gerar o gráfico por destino.</div>`;
          return;
        }

        const items = rawItems.map(([name, val]) => {
          const pct = Math.round((val / (totalAll || 1)) * 100);
          const destMeta = getDestMeta(name);
          return { name, val, pct, destMeta };
        });

        if (curType === 'column') {
          container.innerHTML = renderDestColumnView(items, totalAll);
        } else if (curType === 'donut') {
          container.innerHTML = renderDestDonutView(items, totalAll);
        } else {
          container.innerHTML = renderDestBarView(items, totalAll);
        }

        $$('.pay-dest-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const dest = btn.getAttribute('data-pay-dest');
            if (dest) markDestinationPaid(dest);
          });
        });
      }

      const toggleDestChart = () => {
        const state = getState();
    state.collapsedSections.destChart = !state.collapsedSections.destChart;
        if (typeof saveLocalState === 'function') { saveLocalState(); } else { saveState('chart-toggle'); }
        render();
      };
      const toggleDestBtn = $('#toggleDestChartBtn');
      if (toggleDestBtn) toggleDestBtn.addEventListener('click', toggleDestChart);
      const closeDestBtn = $('#closeDestChartBtn');
      if (closeDestBtn) closeDestBtn.addEventListener('click', toggleDestChart);

      $$('.dest-chart-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.destChartType;
          if (type) {
            const state = getState();
            state.destChartViewType = type;
            if (typeof saveLocalState === 'function') { saveLocalState(); } else { saveState('chart-toggle'); }
            renderDestinationChart();
          }
        });
      });

  // Handlers da navegação compacta mensal (UX1.1)
  function ribbonPrevMonth() {
    const s = (typeof getState === 'function') ? getState() : (window.state || {});
    let m = Number(s.month) || (new Date().getMonth() + 1);
    let y = Number(s.year) || new Date().getFullYear();
    if (m === 1) {
      m = 12;
      y--;
    } else {
      m--;
    }
    s.month = m;
    s.year = y;
    if (typeof saveLocalState === 'function') {
      saveLocalState();
    } else if (typeof saveState === 'function') {
      saveState('month-select');
    }
    if (typeof render === 'function') {
      render();
    }
  }

  function ribbonNextMonth() {
    const s = (typeof getState === 'function') ? getState() : (window.state || {});
    let m = Number(s.month) || (new Date().getMonth() + 1);
    let y = Number(s.year) || new Date().getFullYear();
    if (m === 12) {
      m = 1;
      y++;
    } else {
      m++;
    }
    s.month = m;
    s.year = y;
    if (typeof saveLocalState === 'function') {
      saveLocalState();
    } else if (typeof saveState === 'function') {
      saveState('month-select');
    }
    if (typeof render === 'function') {
      render();
    }
  }

  function ribbonGoToCurrentMonth() {
    const s = (typeof getState === 'function') ? getState() : (window.state || {});
    const now = (typeof todayYM === 'function') ? todayYM() : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
    s.month = now.month;
    s.year = now.year;
    if (typeof saveLocalState === 'function') {
      saveLocalState();
    } else if (typeof saveState === 'function') {
      saveState('month-select');
    }
    if (typeof render === 'function') {
      render();
    }
  }

  // Inicializacao dos listeners estaticos do cabecalho e ribbon
  function initDashboardListeners() {
    $('#prevYear')?.addEventListener('click', () => { const state = getState(); state.year--; if (typeof saveLocalState === 'function') { saveLocalState(); } else { saveState('chart-toggle'); } render(); });
    $('#nextYear')?.addEventListener('click', () => { const state = getState(); state.year++; if (typeof saveLocalState === 'function') { saveLocalState(); } else { saveState('chart-toggle'); } render(); });
    $('#todayBtn')?.addEventListener('click', () => { const state = getState(); const t = todayYM(); state.year = t.year; state.month = t.month; if (typeof saveLocalState === 'function') { saveLocalState(); } else { saveState('chart-toggle'); } render(); });

    $('#ribbonPrevMonthBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      ribbonPrevMonth();
    });
    $('#ribbonNextMonthBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      ribbonNextMonth();
    });
    $('#ribbonCompactTodayBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      ribbonGoToCurrentMonth();
    });
  }

  // Resolve o tipo efetivo de gráfico respeitando fallback automático para mobile
  function resolveEffectiveChartType(savedType, isMobileView) {
    if (isMobileView && savedType === 'column') {
      return 'bar';
    }
    return savedType || 'bar';
  }

  // Bridges publicas autorizadas (consumidas pelo render() central)
  window.renderRibbon = renderRibbon;
  window.renderDashboardMetrics = renderDashboardMetrics;
  window.renderInsightsSection = renderInsightsSection;
  window.renderCategoryDistributionChart = renderCategoryDistributionChart;
  window.renderDestinationChart = renderDestinationChart;
  window.resolveEffectiveChartType = resolveEffectiveChartType;
  window.ribbonPrevMonth = ribbonPrevMonth;
  window.ribbonNextMonth = ribbonNextMonth;
  window.ribbonGoToCurrentMonth = ribbonGoToCurrentMonth;

  // Execucao da inicializacao sincrona dos listeners
  try {
    initDashboardListeners();
  } catch (err) {
    console.error('Erro ao inicializar dashboard listeners:', err);
  }
})();
