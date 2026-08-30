/**
 * Finanças Pro - Módulo de Despesas Fixas e Variáveis
 */
const ExpensesModule = (() => {
  // Global State Bridge
  if (!window.FP_STATE) {
    window.FP_STATE = {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      profile: { name: 'Usuário', baseSalary: 0 },
      destinations: [
        { name: 'XP Investimentos', color: '#1F7A5C', icon: 'bank' },
        { name: 'BTG Pactual', color: '#2563EB', icon: 'bank' },
        { name: 'Nubank', color: '#8B5CF6', icon: 'card' },
        { name: 'Neon', color: '#06B6D4', icon: 'card' },
        { name: 'Pix', color: '#10B981', icon: 'dollar' },
        { name: 'Em dinheiro', color: '#F59E0B', icon: 'wallet' }
      ],
      categories: ['Moradia', 'Lazer', 'Alimentação', 'Cartão', 'Transporte', 'Saúde', 'Educação', 'Gerais', 'Outros'],
      budgets: {},
      collapsedSections: { insights: false, destChart: false, categoryChart: false },
      incomes: {},
      fixed: [],
      variable: [],
      extras: [],
      debtors: [],
      assets: [],
      aportes: [],
      benefitTransactions: []
    };
  }

  // Utilities
  const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const CATEGORY_COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#06B6D4', '#6366F1', '#F97316', '#14B8A6', '#84CC16', '#E11D48'];

  function uid() { return 'exp_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function mk(year, month) { return Number(year) * 12 + Number(month); }
  function ymKey(year, month) { return `${year}-${String(month).padStart(2, '0')}`; }
  function currency(val) { return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

  // Expose helpers globally
  window.MONTH_NAMES = MONTH_NAMES;
  window.MONTH_ABBR = MONTH_ABBR;
  window.currency = currency;
  window.ymKey = ymKey;
  window.mk = mk;
  window.uid = uid;

  // Persist State Helper
  async function persist() {
    // Financial data is strictly in-memory and synced via API
    if (typeof API !== 'undefined' && API.saveFinances && API.isAuthenticated()) {
      try {
        await API.saveFinances(window.FP_STATE);
      } catch (err) {
        console.warn('Erro ao sincronizar com o servidor:', err);
      }
    }
  }
  window.saveFinanceState = persist;

  // Active Expenses Calculations
  function activeFixedForMonth(year, month) {
    const target = mk(year, month);
    const key = ymKey(year, month);
    const out = [];

    (window.FP_STATE.fixed || []).forEach(f => {
      if (f.endedFrom && target >= mk(f.endedFrom.year, f.endedFrom.month)) return;
      const versions = [...(f.versions || [{ id: f.id, year: f.startYear || 2026, month: f.startMonth || 1, amount: f.amount }])]
        .sort((a, b) => mk(a.year, a.month) - mk(b.year, b.month));
      let active = null;
      for (const v of versions) {
        if (mk(v.year, v.month) <= target) active = v; else break;
      }
      if (!active) return;
      const isPaid = f.paidHistory && f.paidHistory[key] === true;
      out.push({
        id: f.id, fixedId: f.id, versionId: active.id, name: f.name, group: f.group || 'Gerais', note: f.note || '',
        amount: Number(active.amount) || 0, effYear: active.year, effMonth: active.month,
        dueDay: f.dueDay || null, destination: f.destination || 'Nubank', status: isPaid ? 'pago' : 'pendente',
        type: 'fixed'
      });
    });
    return out;
  }

  function activeVariableForMonth(year, month) {
    const target = mk(year, month);
    const key = ymKey(year, month);
    return (window.FP_STATE.variable || [])
      .filter(v => target >= mk(v.startYear, v.startMonth) && target <= mk(v.endYear || (v.startYear + Math.floor((v.startMonth + v.installments - 2) / 12)), v.endMonth || ((v.startMonth + v.installments - 2) % 12 + 1)))
      .map(v => {
        const total = v.installments || (mk(v.endYear, v.endMonth) - mk(v.startYear, v.startMonth) + 1);
        const idx = (target - mk(v.startYear, v.startMonth)) + (v.installmentNumber || 1);
        const isPaid = v.paidHistory && v.paidHistory[key] === true;
        return Object.assign({}, v, {
          id: v.id, group: v.group || 'Gerais',
          installmentIndex: idx, installmentTotal: total,
          dueDay: v.dueDay || null, destination: v.destination || 'Nubank', status: isPaid ? 'pago' : 'pendente',
          type: 'variable'
        });
      });
  }

  function getMonthTotals(year, month) {
    const fixed = activeFixedForMonth(year, month);
    const variable = activeVariableForMonth(year, month);
    const extras = (window.FP_STATE.extras || []).filter(e => e.year === year && e.month === month);
    const debtors = (window.FP_STATE.debtors || []).filter(d => {
      const target = mk(year, month);
      return target >= mk(d.startYear, d.startMonth) && target <= mk(d.endYear, d.endMonth);
    });

    const sumFixed = fixed.reduce((s, e) => s + Number(e.amount), 0);
    const sumVar = variable.reduce((s, e) => s + Number(e.amount), 0);
    const sumExt = extras.reduce((s, e) => s + Number(e.amount), 0);
    const sumDebtorCounted = debtors.filter(d => d.countInTotal === true).reduce((s, d) => s + Number(d.amount), 0);

    const totalExpenses = sumFixed + sumVar;
    const allExpenses = [...fixed, ...variable];
    const paidExpenses = allExpenses.filter(e => e.status === 'pago').reduce((s, e) => s + Number(e.amount), 0);
    const pendingExpenses = totalExpenses - paidExpenses;

    const customIncome = window.FP_STATE.incomes[`${year}-${month}`];
    const baseSalary = customIncome !== undefined ? Number(customIncome) : Number(window.FP_STATE.profile?.baseSalary || 3000);
    const totalIncome = baseSalary + sumExt + sumDebtorCounted;
    const sobra = totalIncome - totalExpenses;

    return {
      baseSalary, sumExt, sumDebtorCounted, totalIncome, sumFixed, sumVar,
      totalExpenses, paidExpenses, pendingExpenses, sobra, allExpenses
    };
  }

  // Render Ribbon (Year/Month Bar)
  function renderRibbon() {
    const ribbonContainer = document.getElementById('expensesRibbon');
    if (!ribbonContainer) return;

    const curYear = window.FP_STATE.year;
    const curMonth = window.FP_STATE.month;

    let maxExp = 1;
    const monthsData = [];

    for (let m = 1; m <= 12; m++) {
      const t = getMonthTotals(curYear, m);
      if (t.totalExpenses > maxExp) maxExp = t.totalExpenses;
      monthsData.push({ month: m, total: t.totalExpenses, sobra: t.sobra, isDeficit: t.sobra < 0, fixed: t.sumFixed, var: t.sumVar });
    }

    ribbonContainer.innerHTML = `
      <div class="ribbon-card">
        <div class="ribbon-head">
          <div class="year-nav">
            <button type="button" id="prevYearBtn" title="Ano anterior">◀</button>
            <span id="currentYearLabel">${curYear}</span>
            <button type="button" id="nextYearBtn" title="Próximo ano">▶</button>
            <button type="button" class="btn soft small" id="btnCurrentMonth">Mês Atual</button>
          </div>
          <div class="legend">
            <span><i style="background:var(--c-fixed)"></i> Fixas</span>
            <span><i style="background:var(--c-variable)"></i> Variáveis</span>
            <span><i style="background:var(--danger)"></i> Déficit</span>
          </div>
        </div>
        <div class="ribbon">
          ${monthsData.map((d, idx) => {
            const isActive = d.month === curMonth;
            const hFixed = maxExp > 0 ? Math.max(3, Math.round((d.fixed / maxExp) * 60)) : 0;
            const hVar = maxExp > 0 ? Math.max(3, Math.round((d.var / maxExp) * 60)) : 0;
            return `
              <div class="ribbon-col ${isActive ? 'active' : ''} ${d.isDeficit ? 'has-deficit' : ''}" data-month="${d.month}" title="${MONTH_NAMES[idx]}/${curYear} - Despesas: ${currency(d.total)} | Sobra: ${currency(d.sobra)}">
                <div class="ribbon-bar">
                  ${d.var > 0 ? `<span style="height:${hVar}px; background:var(--c-variable);"></span>` : ''}
                  ${d.fixed > 0 ? `<span style="height:${hFixed}px; background:var(--c-fixed);"></span>` : ''}
                </div>
                <small>${MONTH_ABBR[idx]}</small>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    document.getElementById('prevYearBtn')?.addEventListener('click', () => { window.FP_STATE.year--; persist(); render(); });
    document.getElementById('nextYearBtn')?.addEventListener('click', () => { window.FP_STATE.year++; persist(); render(); });
    document.getElementById('btnCurrentMonth')?.addEventListener('click', () => {
      const now = new Date();
      window.FP_STATE.year = now.getFullYear();
      window.FP_STATE.month = now.getMonth() + 1;
      persist();
      render();
    });

    ribbonContainer.querySelectorAll('.ribbon-col').forEach(col => {
      col.addEventListener('click', () => {
        window.FP_STATE.month = Number(col.getAttribute('data-month'));
        persist();
        render();
      });
    });
  }

  // Render KPI Cards
  function renderMetrics() {
    const metricsContainer = document.getElementById('expensesMetrics');
    if (!metricsContainer) return;

    const t = getMonthTotals(window.FP_STATE.year, window.FP_STATE.month);
    const isDeficit = t.sobra < 0;
    const pctGasto = t.totalIncome > 0 ? Math.min(100, Math.round((t.totalExpenses / t.totalIncome) * 100)) : 0;
    const pctPago = t.totalExpenses > 0 ? Math.round((t.paidExpenses / t.totalExpenses) * 100) : 100;

    metricsContainer.innerHTML = `
      <div class="metrics">
        <div class="metric">
          <div class="label">Total do Mês</div>
          <div class="value num positive">${currency(t.totalIncome)}</div>
          <div class="sub">Base: ${currency(t.baseSalary)} ${t.sumExt > 0 ? `(+${currency(t.sumExt)} extras)` : ''}</div>
        </div>
        <div class="metric">
          <div class="label">Total de Despesas</div>
          <div class="value num negative">${currency(t.totalExpenses)}</div>
          <div class="sub">${pctGasto}% da renda comprometida</div>
        </div>
        <div class="metric">
          <div class="label">Valor Pago <span class="badge success">${pctPago}%</span></div>
          <div class="value num positive">${currency(t.paidExpenses)}</div>
          <div class="sub">Despesas já quitadas</div>
        </div>
        <div class="metric">
          <div class="label">Pendente</div>
          <div class="value num warning">${currency(t.pendingExpenses)}</div>
          <div class="sub">Aguardando pagamento</div>
        </div>
        <div class="metric">
          <div class="label">Sobra do Valor ${isDeficit ? '<span class="badge danger">DÉFICIT</span>' : ''}</div>
          <div class="value num ${!isDeficit ? 'positive' : 'negative'}">${currency(t.sobra)}</div>
          <div class="sub">${isDeficit ? `Déficit de ${currency(Math.abs(t.sobra))}` : 'Saldo líquido após despesas'}</div>
        </div>
      </div>
    `;
  }

  // Render Expenses Table
  function renderExpensesList() {
    const listContainer = document.getElementById('expensesListContainer');
    if (!listContainer) return;

    const y = window.FP_STATE.year;
    const m = window.FP_STATE.month;
    const fixed = activeFixedForMonth(y, m);
    const variable = activeVariableForMonth(y, m);
    const all = [...fixed, ...variable];

    if (all.length === 0) {
      listContainer.innerHTML = `
        <div class="card" style="text-align:center; padding:32px; color:var(--muted);">
          <p>Nenhuma despesa cadastrada para <strong>${MONTH_NAMES[m - 1]}/${y}</strong>.</p>
          <button type="button" class="btn primary small" id="btnAddExpenseEmpty" style="margin-top:12px;">+ Adicionar Primeira Despesa</button>
        </div>
      `;
      document.getElementById('btnAddExpenseEmpty')?.addEventListener('click', openExpenseModal);
      return;
    }

    listContainer.innerHTML = `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
          <h3 style="font-size:1.1rem; font-weight:800;">Lançamentos de ${MONTH_NAMES[m - 1]}/${y} (${all.length})</h3>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn primary small" id="btnAddExpenseTop">+ Nova Despesa</button>
            <button type="button" class="btn soft small" id="btnExportCsvExpenses">Exportar CSV</button>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.88rem;">
            <thead>
              <tr style="border-bottom:1px solid var(--line); color:var(--muted); font-size:0.75rem; text-transform:uppercase;">
                <th style="padding:10px 8px;">Status</th>
                <th style="padding:10px 8px;">Tipo</th>
                <th style="padding:10px 8px;">Descrição</th>
                <th style="padding:10px 8px;">Categoria</th>
                <th style="padding:10px 8px;">Destino / Cartão</th>
                <th style="padding:10px 8px;">Vencimento</th>
                <th style="padding:10px 8px; text-align:right;">Valor</th>
                <th style="padding:10px 8px; text-align:center;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${all.map(item => {
                const isPaid = item.status === 'pago';
                const typeLabel = item.type === 'fixed' ? 'Fixa' : `Parc. ${item.installmentIndex}/${item.installmentTotal}`;
                return `
                  <tr style="border-bottom:1px solid var(--line);">
                    <td style="padding:10px 8px;">
                      <button type="button" class="btn small ${isPaid ? 'primary' : 'soft'}" data-toggle-paid="${item.id}" data-type="${item.type}" style="padding:4px 8px; font-size:0.75rem;">
                        ${isPaid ? '✓ Pago' : 'Pendente'}
                      </button>
                    </td>
                    <td style="padding:10px 8px;"><span class="badge ${item.type === 'fixed' ? 'info' : 'warning'}">${typeLabel}</span></td>
                    <td style="padding:10px 8px; font-weight:700;">${escapeHtml(item.name)}</td>
                    <td style="padding:10px 8px;"><span class="tag">${escapeHtml(item.group)}</span></td>
                    <td style="padding:10px 8px;">${escapeHtml(item.destination)}</td>
                    <td style="padding:10px 8px;">${item.dueDay ? `Dia ${item.dueDay}` : '-'}</td>
                    <td style="padding:10px 8px; text-align:right; font-weight:800;" class="num">${currency(item.amount)}</td>
                    <td style="padding:10px 8px; text-align:center;">
                      <button type="button" class="icon-btn small" data-edit-expense="${item.id}" data-type="${item.type}" title="Editar">✎</button>
                      <button type="button" class="icon-btn small" data-del-expense="${item.id}" data-type="${item.type}" title="Excluir" style="color:var(--danger);">✕</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btnAddExpenseTop')?.addEventListener('click', openExpenseModal);
    document.getElementById('btnExportCsvExpenses')?.addEventListener('click', exportCSV);

    // Toggle Paid Handler
    listContainer.querySelectorAll('[data-toggle-paid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-toggle-paid');
        const type = btn.getAttribute('data-type');
        const key = ymKey(y, m);

        if (type === 'fixed') {
          const item = window.FP_STATE.fixed.find(f => f.id === id);
          if (item) {
            item.paidHistory = item.paidHistory || {};
            item.paidHistory[key] = !item.paidHistory[key];
          }
        } else {
          const item = window.FP_STATE.variable.find(v => v.id === id);
          if (item) {
            item.paidHistory = item.paidHistory || {};
            item.paidHistory[key] = !item.paidHistory[key];
          }
        }
        persist();
        render();
        notify('Status de pagamento atualizado!');
      });
    });

    // Delete Handler
    listContainer.querySelectorAll('[data-del-expense]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-del-expense');
        const type = btn.getAttribute('data-type');
        if (confirm('Deseja realmente excluir esta despesa?')) {
          if (type === 'fixed') {
            window.FP_STATE.fixed = window.FP_STATE.fixed.filter(f => f.id !== id);
          } else {
            window.FP_STATE.variable = window.FP_STATE.variable.filter(v => v.id !== id);
          }
          persist();
          render();
          notify('Despesa removida com sucesso!');
        }
      });
    });
  }

  // Modal Dialog for Add/Edit Expense
  function openExpenseModal(editingId = null, editingType = 'fixed') {
    let modal = document.getElementById('expenseDialog');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'expenseDialog';
      modal.className = 'dialog-card';
      document.body.appendChild(modal);
    }

    const isEdit = !!editingId;
    let currentItem = null;
    if (isEdit) {
      currentItem = editingType === 'fixed'
        ? window.FP_STATE.fixed.find(f => f.id === editingId)
        : window.FP_STATE.variable.find(v => v.id === editingId);
    }

    modal.innerHTML = `
      <form id="formExpenseModal" style="padding:20px; min-width:320px; max-width:480px;">
        <h3 style="margin-bottom:16px; font-weight:800;">${isEdit ? 'Editar Despesa' : 'Nova Despesa'}</h3>
        
        <div class="field" style="margin-bottom:12px;">
          <label>Tipo de Despesa</label>
          <select id="modalExpType" ${isEdit ? 'disabled' : ''} style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
            <option value="fixed" ${editingType === 'fixed' ? 'selected' : ''}>Despesa Fixa (Recorrente Mensal)</option>
            <option value="variable" ${editingType === 'variable' ? 'selected' : ''}>Despesa Variável / Parcelada</option>
          </select>
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Nome / Descrição</label>
          <input type="text" id="modalExpName" value="${currentItem ? escapeHtml(currentItem.name) : ''}" placeholder="Ex: Aluguel, Supermercado" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Valor (R$)</label>
          <input type="number" step="0.01" min="0" id="modalExpAmount" value="${currentItem ? currentItem.amount : ''}" placeholder="0,00" required style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Categoria</label>
          <select id="modalExpCategory" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
            ${(window.FP_STATE.categories || []).map(c => {
              const name = (typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : (c.name || 'Gerais'));
              return `<option value="${escapeHtml(name)}" ${currentItem && currentItem.group === name ? 'selected' : ''}>${escapeHtml(name)}</option>`;
            }).join('')}
          </select>
        </div>

        <div class="field" style="margin-bottom:12px;">
          <label>Destino / Cartão</label>
          <select id="modalExpDest" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
            ${(window.FP_STATE.destinations || []).map(d => `<option value="${escapeHtml(d.name)}" ${currentItem && currentItem.destination === d.name ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
          </select>
        </div>

        <div class="field" style="margin-bottom:16px;">
          <label>Dia do Vencimento</label>
          <input type="number" min="1" max="31" id="modalExpDueDay" value="${currentItem ? (currentItem.dueDay || 10) : 10}" placeholder="Ex: 10" style="width:100%; padding:9px; border-radius:8px; background:var(--surface); color:var(--text); border:1px solid var(--line);">
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn soft" id="btnCancelExpenseModal">Cancelar</button>
          <button type="submit" class="btn primary">Salvar</button>
        </div>
      </form>
    `;

    document.getElementById('btnCancelExpenseModal')?.addEventListener('click', () => modal.close());

    document.getElementById('formExpenseModal')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const type = document.getElementById('modalExpType').value;
      const name = document.getElementById('modalExpName').value.trim();
      const amount = Number(document.getElementById('modalExpAmount').value) || 0;
      const group = document.getElementById('modalExpCategory').value;
      const destination = document.getElementById('modalExpDest').value;
      const dueDay = Number(document.getElementById('modalExpDueDay').value) || 10;

      if (!name || amount <= 0) {
        notify('Preencha os campos obrigatórios.', 'error');
        return;
      }

      if (isEdit) {
        if (editingType === 'fixed') {
          const item = window.FP_STATE.fixed.find(f => f.id === editingId);
          if (item) {
            item.name = name;
            item.amount = amount;
            item.group = group;
            item.destination = destination;
            item.dueDay = dueDay;
          }
        } else {
          const item = window.FP_STATE.variable.find(v => v.id === editingId);
          if (item) {
            item.name = name;
            item.amount = amount;
            item.group = group;
            item.destination = destination;
            item.dueDay = dueDay;
          }
        }
      } else {
        if (type === 'fixed') {
          window.FP_STATE.fixed.push({
            id: uid(),
            name,
            amount,
            group,
            destination,
            dueDay,
            startMonth: window.FP_STATE.month,
            startYear: window.FP_STATE.year,
            paidHistory: {}
          });
        } else {
          window.FP_STATE.variable.push({
            id: uid(),
            name,
            amount,
            group,
            destination,
            dueDay,
            startMonth: window.FP_STATE.month,
            startYear: window.FP_STATE.year,
            installments: 1,
            installmentNumber: 1,
            paidHistory: {}
          });
        }
      }

      persist();
      modal.close();
      render();
      notify('Despesa salva com sucesso!', 'success');
    });

    modal.showModal();
  }

  // Export CSV
  function exportCSV() {
    const y = window.FP_STATE.year;
    const m = window.FP_STATE.month;
    const all = [...activeFixedForMonth(y, m), ...activeVariableForMonth(y, m)];

    let csv = 'Tipo;Descricao;Valor;Categoria;Destino;Vencimento;Status\n';
    all.forEach(item => {
      csv += `${item.type};${item.name};${item.amount};${item.group};${item.destination};${item.dueDay || ''};${item.status}\n`;
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `despesas_${y}_${m}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Relatório CSV exportado com sucesso!');
  }

  // Master Render
  function render() {
    const container = document.getElementById('view-expenses');
    if (!container) return;

    if (!container.querySelector('#expensesRibbon')) {
      container.innerHTML = `
        <div id="expensesRibbon" style="margin-bottom:16px;"></div>
        <div id="expensesMetrics" style="margin-bottom:16px;"></div>
        <div id="expensesListContainer"></div>
      `;
    }

    renderRibbon();
    renderMetrics();
    renderExpensesList();
  }

  // Initialize
  async function init() {
    if (typeof API !== 'undefined' && API.getFinances && API.isAuthenticated()) {
      try {
        const res = await API.getFinances();
        if (res && res.success && res.data) {
          window.FP_STATE = Object.assign({}, window.FP_STATE, res.data);
        }
      } catch (err) {
        console.warn('Erro ao carregar finanças do servidor:', err);
      }
    }
    render();
  }

  document.addEventListener('tabChanged', (e) => {
    if (e.detail && e.detail.tabId === 'tab-expenses') {
      render();
    }
  });

  return {
    init,
    render,
    getMonthTotals,
    activeFixedForMonth,
    activeVariableForMonth,
    openExpenseModal
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  ExpensesModule.init();
});
