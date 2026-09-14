/**
 * Módulo de Benefícios (VA, VR, Saúde, Transporte, Educação, Cultura, Farmácia)
 * Finanças Pro
 */

(function () {
  const BENEFIT_TYPES_MAP = {
    saude: { label: 'Saúde', short: 'SAÚDE', color: 'var(--danger, #EF4444)', bg: 'var(--danger-soft, rgba(239, 68, 68, 0.15))' },
    vr: { label: 'Vale Refeição (VR)', short: 'VR', color: 'var(--warning, #F59E0B)', bg: 'var(--warning-soft, rgba(245, 158, 11, 0.15))' },
    va: { label: 'Vale Alimentação (VA)', short: 'VA', color: 'var(--success, #10B981)', bg: 'var(--success-soft, rgba(16, 185, 129, 0.15))' },
    transporte: { label: 'Transporte', short: 'TRANS', color: 'var(--info, #3B82F6)', bg: 'var(--info-soft, rgba(59, 130, 246, 0.15))' },
    educacao: { label: 'Educação', short: 'EDUC', color: 'var(--c-fixed, #8B5CF6)', bg: 'var(--c-fixed-soft, rgba(139, 92, 246, 0.15))' },
    cultura: { label: 'Cultura', short: 'CULT', color: 'var(--c-extra, #EC4899)', bg: 'var(--c-extra-soft, rgba(236, 72, 153, 0.15))' },
    farmacia: { label: 'Farmácia', short: 'FARM', color: '#EC4899', bg: '#FCE7F3' }
  };

  const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  function getState() {
    return window.state || window.FP_STATE || {};
  }

  function saveState() {
    if (typeof window.saveState === 'function') {
      window.saveState();
    } else if (typeof window.saveFinanceState === 'function') {
      window.saveFinanceState();
    }
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
    return 'ben_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function getBenefitTypeInfo(typeKey) {
    if (BENEFIT_TYPES_MAP[typeKey]) return BENEFIT_TYPES_MAP[typeKey];
    return {
      label: typeKey || 'Outro',
      short: (typeKey || 'BEN').toUpperCase().slice(0, 5),
      color: 'var(--brand, #1F7A5C)',
      bg: 'var(--brand-soft, rgba(31, 122, 92, 0.15))'
    };
  }

  function monthBenefitsTotals(year, month) {
    const state = getState();
    const config = state.benefitsConfig || { amount: 0 };
    const baseTotal = config.amount != null
      ? Number(config.amount || 0)
      : (Number(config.va || 0) + Number(config.vr || 0));

    const txs = (state.benefitTransactions || []).filter(t => Number(t.year) === Number(year) && Number(t.month) === Number(month));
    const spentTotal = txs.reduce((s, t) => s + Number(t.amount || 0), 0);
    const remTotal = baseTotal - spentTotal;

    const spentByType = {};
    Object.keys(BENEFIT_TYPES_MAP).forEach(k => { spentByType[k] = 0; });
    txs.forEach(t => {
      const k = t.type || 'va';
      spentByType[k] = (spentByType[k] || 0) + Number(t.amount || 0);
    });

    return { baseTotal, spentTotal, remTotal, txs, spentByType };
  }

  function renderBenefitsCharts(bt) {
    const state = getState();
    const grid = document.getElementById('benefitsChartsGrid');
    const toggleBtn = document.getElementById('toggleBenefitsChartsBtn');
    const isHidden = state.collapsedSections?.benefitsCharts === true;

    if (toggleBtn) toggleBtn.classList.toggle('active', !isHidden);
    if (grid) {
      grid.style.display = isHidden ? 'none' : 'grid';
      if (isHidden) return;
    }

    const typeContainer = document.getElementById('benefitTypeBars');
    const typeBadge = document.getElementById('benefitTypeTotalBadge');
    const dailyContainer = document.getElementById('benefitDailyBars');
    const remBadge = document.getElementById('benefitRemainingBadge');
    const spentSumText = document.getElementById('benefitSpentSummaryText');
    const baseSumText = document.getElementById('benefitBaseSummaryText');

    if (typeBadge) typeBadge.textContent = currency(bt.spentTotal);
    if (spentSumText) spentSumText.textContent = currency(bt.spentTotal);
    if (baseSumText) baseSumText.textContent = currency(bt.baseTotal);
    if (remBadge) {
      remBadge.className = `badge ${bt.remTotal >= 0 ? 'positive' : 'danger'}`;
      remBadge.textContent = `Saldo: ${currency(bt.remTotal)}`;
    }

    // 1. Gráfico por Tipo de Benefício
    if (typeContainer) {
      const typeEntries = Object.entries(bt.spentByType)
        .filter(([_, val]) => val > 0)
        .sort((a, b) => b[1] - a[1]);

      if (typeEntries.length === 0) {
        typeContainer.innerHTML = `<div class="empty" style="padding:20px; color:var(--muted);">Sem lançamentos de benefícios neste mês (${MONTH_ABBR[(state.month || 1) - 1]}/${state.year || ''}).</div>`;
      } else {
        const maxVal = typeEntries[0][1] || 1;
        typeContainer.innerHTML = typeEntries.map(([typeKey, val]) => {
          const info = getBenefitTypeInfo(typeKey);
          const pctOfSpent = bt.spentTotal > 0 ? Math.round((val / bt.spentTotal) * 100) : 0;
          const barWidth = Math.round((val / maxVal) * 100);
          return `
            <div class="dest-bar-item" data-tooltip="${info.label}: ${currency(val)} (${pctOfSpent}% dos gastos)" style="cursor:default; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
              <div style="display:flex; align-items:center; gap:6px; min-width:110px;">
                <span style="display:inline-block; width:10px; height:10px; border-radius:3px; background:${info.color}; flex-shrink:0;"></span>
                <span class="dest-name" style="font-size:.78rem;"><strong>${info.label}</strong></span>
              </div>
              <div class="dest-track" style="flex:1; height:8px; background:var(--surface-2, rgba(0,0,0,0.06)); border-radius:999px; overflow:hidden;">
                <div class="dest-fill" style="width:${barWidth}%; background:${info.color}; height:100%; border-radius:999px; transition:width .3s ease;"></div>
              </div>
              <span class="dest-val num" style="font-size:.82rem; font-weight:800;">${currency(val)} <small style="font-size:.68rem; color:var(--muted); font-weight:700;">(${pctOfSpent}%)</small></span>
            </div>
          `;
        }).join('');
      }
    }

    // 2. Gráfico de Evolução Diária & Saldo
    if (dailyContainer) {
      if (bt.txs.length === 0) {
        dailyContainer.innerHTML = `<div class="empty" style="width:100%; padding:20px; align-self:center; color:var(--muted); text-align:center;">Nenhuma movimentação diária para exibir.</div>`;
      } else {
        const daysMap = {};
        for (let d = 1; d <= 31; d++) daysMap[d] = 0;
        bt.txs.forEach(t => {
          const d = Math.max(1, Math.min(31, Number(t.day) || 1));
          daysMap[d] += Number(t.amount || 0);
        });

        const maxDayInMonth = Math.max(...bt.txs.map(t => Number(t.day) || 1), 15);
        const activeDays = [];
        for (let d = 1; d <= maxDayInMonth; d++) {
          activeDays.push({ day: d, amount: daysMap[d] });
        }

        const maxDaily = Math.max(...activeDays.map(x => x.amount), 50);
        let runningSpent = 0;

        dailyContainer.innerHTML = activeDays.map(item => {
          runningSpent += item.amount;
          const runningRem = bt.baseTotal - runningSpent;
          const h = item.amount > 0 ? Math.max(10, Math.round((item.amount / maxDaily) * 85)) : 3;
          const isSpentDay = item.amount > 0;
          const barColor = isSpentDay ? 'var(--brand, #1F7A5C)' : 'var(--line, rgba(0,0,0,0.1))';
          const tip = `Dia ${String(item.day).padStart(2, '0')}/${MONTH_ABBR[(state.month || 1) - 1]}: ${currency(item.amount)} | Acumulado: ${currency(runningSpent)} | Saldo: ${currency(runningRem)}`;

          return `
            <div style="display:flex; flex-direction:column; align-items:center; flex:1; min-width:20px; height:100%; justify-content:flex-end;" data-tooltip="${tip}">
              ${isSpentDay ? `<span style="font-size:.62rem; font-weight:800; color:var(--brand, #1F7A5C); margin-bottom:2px;" class="num">${Math.round(item.amount)}</span>` : ''}
              <div style="width:100%; max-width:18px; height:${h}px; border-radius:4px 4px 0 0; background:${barColor}; transition:height .2s ease;"></div>
              <span style="font-size:.65rem; color:var(--muted); font-weight:700; margin-top:4px;">${item.day}</span>
            </div>
          `;
        }).join('');
      }
    }
  }

  let benefitDlgId = null;

  function openBenefitDialog(mode, id) {
    const state = getState();
    const benefitDlg = document.getElementById('benefitDialog');
    const benefitForm = document.getElementById('benefitForm');
    if (benefitForm) benefitForm.reset();
    benefitDlgId = id || null;

    const delBtn = document.getElementById('deleteBenefitBtn');
    if (delBtn) delBtn.hidden = !id;

    // Popula selects de mês se estiverem vazios
    const monthSelect = document.getElementById('benefitMonth');
    if (monthSelect && monthSelect.options.length === 0) {
      monthSelect.innerHTML = MONTH_NAMES.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');
    }

    if (mode === 'new') {
      const titleEl = document.getElementById('benefitDialogTitle');
      if (titleEl) titleEl.textContent = 'Lançar Gasto com Benefício';
      const now = new Date();
      const dayEl = document.getElementById('benefitDay');
      const monthEl = document.getElementById('benefitMonth');
      const yearEl = document.getElementById('benefitYear');
      const typeEl = document.getElementById('benefitType');

      if (dayEl) dayEl.value = now.getDate();
      if (monthEl) monthEl.value = state.month || (now.getMonth() + 1);
      if (yearEl) yearEl.value = state.year || now.getFullYear();
      if (typeEl) typeEl.value = 'va';
    } else {
      const item = (state.benefitTransactions || []).find(t => t.id === id);
      if (!item) return;
      const titleEl = document.getElementById('benefitDialogTitle');
      if (titleEl) titleEl.textContent = 'Editar Gasto com Benefício';

      const descEl = document.getElementById('benefitDescription');
      const typeEl = document.getElementById('benefitType');
      const amtEl = document.getElementById('benefitAmount');
      const dayEl = document.getElementById('benefitDay');
      const monthEl = document.getElementById('benefitMonth');
      const yearEl = document.getElementById('benefitYear');
      const noteEl = document.getElementById('benefitNote');

      if (descEl) descEl.value = item.description || '';
      if (typeEl) typeEl.value = item.type || 'va';
      if (amtEl) amtEl.value = item.amount || '';
      if (dayEl) dayEl.value = item.day || 1;
      if (monthEl) monthEl.value = item.month || state.month;
      if (yearEl) yearEl.value = item.year || state.year;
      if (noteEl) noteEl.value = item.note || '';
    }

    if (benefitDlg && typeof benefitDlg.showModal === 'function') {
      benefitDlg.showModal();
    }
  }

  function deleteBenefit(id) {
    if (!confirm('Excluir este lançamento de benefício?')) return;
    const state = getState();
    state.benefitTransactions = (state.benefitTransactions || []).filter(t => t.id !== id);
    saveState();

    const benefitDlg = document.getElementById('benefitDialog');
    if (benefitDlg && benefitDlg.open) benefitDlg.close();

    if (typeof window.render === 'function') {
      window.render();
    } else {
      renderBenefitsTab();
    }
    notify('Lançamento de benefício excluído!', 'info');
  }

  function renderBenefitsTab() {
    const state = getState();
    const y = Number(state.year) || new Date().getFullYear();
    const m = Number(state.month) || (new Date().getMonth() + 1);
    const bt = monthBenefitsTotals(y, m);

    const pctGasto = bt.baseTotal > 0 ? Math.min(100, Math.round((bt.spentTotal / bt.baseTotal) * 100)) : 0;

    const containerMetrics = document.getElementById('benefitMetrics');
    if (containerMetrics) {
      containerMetrics.innerHTML = `
        <div class="metric">
          <div class="label">Crédito Base Mensal</div>
          <div class="value num positive">${currency(bt.baseTotal)}</div>
          <div class="sub">Vale Benefício concedido no mês (Perfil)</div>
        </div>
        <div class="metric">
          <div class="label">Total Gasto no Mês <span class="badge ${pctGasto > 90 ? 'danger' : 'info'}">${pctGasto}%</span></div>
          <div class="value num negative">${currency(bt.spentTotal)}</div>
          <div class="sub">${currency(bt.spentTotal)} de ${currency(bt.baseTotal)} consumidos</div>
          <div class="bar"><span style="width:${pctGasto}%; background:${pctGasto > 100 ? 'var(--danger, #EF4444)' : 'var(--brand, #1F7A5C)'}"></span></div>
        </div>
        <div class="metric">
          <div class="label">Saldo Restante Disponível</div>
          <div class="value num ${bt.remTotal >= 0 ? 'positive' : 'negative'}">${currency(bt.remTotal)}</div>
          <div class="sub">${bt.remTotal >= 0 ? 'Disponível para compras compartilhadas' : 'Excedeu o valor do benefício'}</div>
        </div>
        <div class="metric">
          <div class="label">Lançamentos no Mês</div>
          <div class="value num">${bt.txs.length} <small style="font-size:.8rem; color:var(--muted)">registros</small></div>
          <div class="sub">Transações registradas no período</div>
        </div>
      `;
    }

    renderBenefitsCharts(bt);

    const query = (document.getElementById('benefitsSearchInput')?.value || '').toLowerCase().trim();
    const typeFilter = document.getElementById('benefitsTypeFilter')?.value || 'all';
    const sortFilter = document.getElementById('benefitsSortFilter')?.value || 'date-desc';

    let filtered = bt.txs.filter(t => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (query) {
        const typeInfo = getBenefitTypeInfo(t.type);
        const text = `${t.description} ${t.note || ''} ${t.type || ''} ${typeInfo.label}`.toLowerCase();
        if (!text.includes(query)) return false;
      }
      return true;
    });

    if (sortFilter === 'custom') {
      // Mantém ordem
    } else if (sortFilter === 'amount-desc') {
      filtered.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
    } else if (sortFilter === 'amount-asc') {
      filtered.sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
    } else if (sortFilter === 'date-asc') {
      filtered.sort((a, b) => Number(a.day || 1) - Number(b.day || 1));
    } else {
      filtered.sort((a, b) => Number(b.day || 1) - Number(a.day || 1));
    }

    const sumFiltered = filtered.reduce((s, t) => s + Number(t.amount || 0), 0);
    const sumEl = document.getElementById('sumBenefits');
    if (sumEl) sumEl.textContent = currency(sumFiltered);

    const listEl = document.getElementById('listBenefits');
    if (listEl) {
      listEl.innerHTML = '';
      if (filtered.length === 0) {
        listEl.innerHTML = `<div class="empty" style="text-align:center; padding:24px; color:var(--muted);">Nenhum gasto com benefício encontrado para os filtros selecionados.</div>`;
      } else {
        filtered.forEach(item => {
          const typeInfo = getBenefitTypeInfo(item.type);
          const badgeHtml = `
            <div style="width:36px; height:36px; border-radius:10px; background:${typeInfo.bg}; color:${typeInfo.color}; display:grid; place-items:center; font-weight:800; font-size:.7rem; flex-shrink:0; letter-spacing:-.02em;">
              ${typeInfo.short}
            </div>`;

          if (typeof window.buildEntryRow === 'function') {
            const row = window.buildEntryRow({
              id: item.id,
              type: 'benefit',
              title: item.description,
              tags: [
                typeInfo.label,
                `Dia ${item.day || 1}/${MONTH_ABBR[(item.month || 1) - 1]}`,
                item.note || ''
              ].filter(Boolean),
              amount: item.amount,
              customLeftBadge: badgeHtml,
              onClickEdit: () => openBenefitDialog('edit', item.id),
              onDelete: () => deleteBenefit(item.id)
            });
            listEl.appendChild(row);
          } else {
            const row = document.createElement('div');
            row.className = 'entry-row';
            row.innerHTML = `
              ${badgeHtml}
              <div class="entry-info">
                <div class="entry-title">${escapeHtml(item.description)}</div>
                <div class="entry-meta">
                  <span class="tag">${typeInfo.label}</span>
                  <span class="tag">Dia ${item.day || 1}/${MONTH_ABBR[(item.month || 1) - 1]}</span>
                  ${item.note ? `<span class="tag">${escapeHtml(item.note)}</span>` : ''}
                </div>
              </div>
              <div class="entry-amount num negative">${currency(item.amount)}</div>
              <div class="entry-actions">
                <button type="button" class="icon-btn small edit-btn" title="Editar Lançamento">✎</button>
                <button type="button" class="icon-btn small delete-btn" title="Excluir Lançamento" style="color:var(--danger, #EF4444);">✕</button>
              </div>
            `;
            row.querySelector('.edit-btn')?.addEventListener('click', () => openBenefitDialog('edit', item.id));
            row.querySelector('.delete-btn')?.addEventListener('click', () => deleteBenefit(item.id));
            listEl.appendChild(row);
          }
        });
      }
    }
  }

  function initBenefitsEvents() {
    const form = document.getElementById('benefitForm');
    if (form && !form.dataset.benefitsInit) {
      form.dataset.benefitsInit = 'true';
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const description = (document.getElementById('benefitDescription')?.value || '').trim();
        const type = document.getElementById('benefitType')?.value || 'va';
        const amount = Number(document.getElementById('benefitAmount')?.value) || 0;
        const day = Number(document.getElementById('benefitDay')?.value) || 1;
        const month = Number(document.getElementById('benefitMonth')?.value) || getState().month;
        const year = Number(document.getElementById('benefitYear')?.value) || getState().year;
        const note = (document.getElementById('benefitNote')?.value || '').trim();

        if (!description || !Number.isFinite(amount) || amount <= 0) {
          notify('Preencha a descrição e um valor válido.', 'error');
          return;
        }

        const state = getState();
        state.benefitTransactions = state.benefitTransactions || [];

        if (benefitDlgId) {
          const t = state.benefitTransactions.find(x => x.id === benefitDlgId);
          if (t) {
            t.description = description;
            t.type = type;
            t.amount = amount;
            t.day = day;
            t.month = month;
            t.year = year;
            t.note = note;
          }
        } else {
          state.benefitTransactions.push({
            id: uid(),
            description,
            type,
            amount,
            day,
            month,
            year,
            note
          });
        }

        saveState();
        const benefitDlg = document.getElementById('benefitDialog');
        if (benefitDlg && benefitDlg.open) benefitDlg.close();

        if (typeof window.render === 'function') {
          window.render();
        } else {
          renderBenefitsTab();
        }
        notify('Gasto com benefício salvo com sucesso!', 'success');
      });
    }

    const delBtn = document.getElementById('deleteBenefitBtn');
    if (delBtn && !delBtn.dataset.benefitsInit) {
      delBtn.dataset.benefitsInit = 'true';
      delBtn.addEventListener('click', () => {
        if (benefitDlgId) deleteBenefit(benefitDlgId);
      });
    }

    const newBenefitBtn = document.getElementById('newBenefitBtn');
    if (newBenefitBtn && !newBenefitBtn.dataset.benefitsInit) {
      newBenefitBtn.dataset.benefitsInit = 'true';
      newBenefitBtn.addEventListener('click', () => openBenefitDialog('new'));
    }

    const searchInput = document.getElementById('benefitsSearchInput');
    if (searchInput && !searchInput.dataset.benefitsInit) {
      searchInput.dataset.benefitsInit = 'true';
      searchInput.addEventListener('input', renderBenefitsTab);
    }

    const typeFilter = document.getElementById('benefitsTypeFilter');
    if (typeFilter && !typeFilter.dataset.benefitsInit) {
      typeFilter.dataset.benefitsInit = 'true';
      typeFilter.addEventListener('change', renderBenefitsTab);
    }

    const sortFilter = document.getElementById('benefitsSortFilter');
    if (sortFilter && !sortFilter.dataset.benefitsInit) {
      sortFilter.dataset.benefitsInit = 'true';
      sortFilter.addEventListener('change', renderBenefitsTab);
    }

    const toggleChartsBtn = document.getElementById('toggleBenefitsChartsBtn');
    if (toggleChartsBtn && !toggleChartsBtn.dataset.benefitsInit) {
      toggleChartsBtn.dataset.benefitsInit = 'true';
      toggleChartsBtn.addEventListener('click', () => {
        const state = getState();
        state.collapsedSections = state.collapsedSections || {};
        state.collapsedSections.benefitsCharts = !state.collapsedSections.benefitsCharts;
        saveState();
        const bt = monthBenefitsTotals(state.year, state.month);
        renderBenefitsCharts(bt);
      });
    }
  }

  function setupRibbonHider() {
    // Substituído no UX1 pelo padrão oficial de expandable-section
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('hide_months_ribbon');
      }
    } catch (_) {}
  }

  // Expor globalmente
  window.initBenefits = function () {
    setupRibbonHider();
    initBenefitsEvents();
    renderBenefitsTab();
  };

  window.renderBenefitsTab = renderBenefitsTab;
  window.openBenefitDialog = openBenefitDialog;
  window.deleteBenefit = deleteBenefit;
  window.monthBenefitsTotals = monthBenefitsTotals;
  window.getBenefitTypeInfo = getBenefitTypeInfo;
  window.BENEFIT_TYPES_MAP = BENEFIT_TYPES_MAP;

  // Auto-inicializar se DOM já carregado
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.initBenefits();
    });
  } else {
    window.initBenefits();
  }
})();
