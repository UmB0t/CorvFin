/* ==========================================================================
   MODULO DE DASHBOARD CONSOLIDADO & VISUALIZACOES (consolidatedDashboard.js)
   OmniFin V3 - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  // Estado Local de Filtros (somente leitura / visual, sem chamar saveState)
  const localFilters = {
    search: '',
    status: 'all',       // 'all' | 'pago' | 'pendente'
    category: 'all',     // 'all' | categoryName
    destination: 'all',  // 'all' | destinationName
    sourceType: 'all'    // 'all' | 'expenses' | 'debtors'
  };

  // Estado Local de Drill-Down Accordion (IDs de categoria/destino expandidos)
  const expandedAccordions = {
    categories: {},
    destinations: {}
  };


  /**
   * Constrói o dataset consolidado normalizado para a competência financeira (year, month).
   * Função pura e segura em runtime.
   */
  function buildConsolidatedDataset(stateInput, yearInput, monthInput) {
    let state = stateInput;
    let resolvedYear = yearInput;
    let resolvedMonth = monthInput;

    if (!state || (typeof state === 'object' && state.fixed === undefined && state.variable === undefined && typeof getState === 'function')) {
      if (state && typeof state === 'object') {
        if (state.year !== undefined) resolvedYear = state.year;
        if (state.month !== undefined) resolvedMonth = state.month;
      }
      state = (typeof getState === 'function') ? getState() : (state || {});
    }

    if (!state) return [];
    const y = Number(resolvedYear) || state.year || 2026;
    const m = Number(resolvedMonth) || state.month || 1;

    const dataset = [];

    const target = (typeof mk === 'function') ? mk(y, m) : (y * 12 + m);
    const key = (typeof ymKey === 'function') ? ymKey(y, m) : `${y}-${m}`;

    // 1. Despesas Fixas da competência
    const fixedList = state.fixed || [];
    fixedList.forEach(f => {
      if (f.endedFrom) {
        const endTarget = (typeof mk === 'function') ? mk(f.endedFrom.year, f.endedFrom.month) : (f.endedFrom.year * 12 + f.endedFrom.month);
        if (target >= endTarget) return;
      }

      const versions = [...(f.versions || [])].sort((a, b) => {
        const ma = (typeof mk === 'function') ? mk(a.year, a.month) : (a.year * 12 + a.month);
        const mb = (typeof mk === 'function') ? mk(b.year, b.month) : (b.year * 12 + b.month);
        return ma - mb;
      });

      let active = null;
      for (const v of versions) {
        const mv = (typeof mk === 'function') ? mk(v.year, v.month) : (v.year * 12 + v.month);
        if (mv <= target) active = v; else break;
      }
      if (!active) return;

      const payInfo = (typeof getExpensePaymentInfo === 'function')
        ? getExpensePaymentInfo(f, y, m, active.amount)
        : { status: (f.paidHistory && f.paidHistory[key] === true) ? 'pago' : 'pendente', paidAmount: (f.paidHistory && f.paidHistory[key] === true) ? Number(active.amount) : 0, remainingAmount: (f.paidHistory && f.paidHistory[key] === true) ? 0 : Number(active.amount) };

      const catName = typeof getCategoryName === 'function' ? getCategoryName(f.group) : (f.group || 'Gerais');

      dataset.push({
        id: `fixed_${f.id || f.fixedId}_${y}_${m}`,
        rawId: f.id || f.fixedId,
        sourceType: 'fixed',
        sourceTypeLabel: 'Fixa',
        description: f.name || 'Despesa Fixa',
        category: catName || 'Gerais',
        destination: f.destination || 'Nubank',
        amount: Number(active.amount || 0),
        status: payInfo.status,
        paidAmount: payInfo.paidAmount,
        remainingAmount: payInfo.remainingAmount,
        dueDay: f.dueDay || null,
        note: f.note || '',
        isExpense: true,
        isDebtor: false,
        month: m,
        year: y
      });
    });

    // 2. Despesas Variáveis / Parceladas da competência
    const varList = state.variable || [];
    varList.forEach(v => {
      const sTarget = (typeof mk === 'function') ? mk(v.startYear, v.startMonth) : (v.startYear * 12 + v.startMonth);
      const eTarget = (typeof mk === 'function') ? mk(v.endYear, v.endMonth) : (v.endYear * 12 + v.endMonth);
      if (target < sTarget || target > eTarget) return;

      const total = eTarget - sTarget + 1;
      const idx = target - sTarget + 1;
      const payInfo = (typeof getExpensePaymentInfo === 'function')
        ? getExpensePaymentInfo(v, y, m, v.amount)
        : { status: (v.paidHistory && v.paidHistory[key] === true) ? 'pago' : 'pendente', paidAmount: (v.paidHistory && v.paidHistory[key] === true) ? Number(v.amount) : 0, remainingAmount: (v.paidHistory && v.paidHistory[key] === true) ? 0 : Number(v.amount) };

      const catName = typeof getCategoryName === 'function' ? getCategoryName(v.group) : (v.group || 'Gerais');

      dataset.push({
        id: `var_${v.id}_${y}_${m}`,
        rawId: v.id,
        sourceType: 'variable',
        sourceTypeLabel: total > 1 ? `Parcelada (${idx}/${total})` : 'Variável',
        description: v.name || 'Despesa Variável',
        category: catName || 'Gerais',
        destination: v.destination || 'Nubank',
        amount: Number(v.amount || 0),
        status: payInfo.status,
        paidAmount: payInfo.paidAmount,
        remainingAmount: payInfo.remainingAmount,
        dueDay: v.dueDay || null,
        installmentIndex: idx,
        installmentTotal: total,
        note: v.note || '',
        isExpense: true,
        isDebtor: false,
        month: m,
        year: y
      });
    });

    // 3. Devedores / Valores a Receber da competência
    const debtorsList = state.debtors || [];
    debtorsList.forEach(d => {
      const sTarget = (typeof mk === 'function') ? mk(d.startYear, d.startMonth) : (d.startYear * 12 + d.startMonth);
      const eTarget = (typeof mk === 'function') ? mk(d.endYear, d.endMonth) : (d.endYear * 12 + d.endMonth);
      if (target < sTarget || target > eTarget) return;

      const total = eTarget - sTarget + 1;
      const idx = target - sTarget + 1;
      const payInfo = (typeof getExpensePaymentInfo === 'function')
        ? getExpensePaymentInfo(d, y, m, d.amount)
        : { status: (d.paidHistory && d.paidHistory[key] === true) ? 'pago' : 'pendente', paidAmount: (d.paidHistory && d.paidHistory[key] === true) ? Number(d.amount) : 0, remainingAmount: (d.paidHistory && d.paidHistory[key] === true) ? 0 : Number(d.amount) };
      const debtorName = d.debtorName || d.name || 'Devedor';
      const title = d.title || 'Cobrança';
      const catName = d.category ? (typeof getCategoryName === 'function' ? getCategoryName(d.category) : d.category) : 'Devedores';

      dataset.push({
        id: `deb_${d.id}_${y}_${m}`,
        rawId: d.id,
        sourceType: 'debtor',
        sourceTypeLabel: 'Devedor / Recebível',
        description: `${debtorName} — ${title}`,
        category: catName || 'Devedores',
        destination: d.destination || 'Nubank',
        amount: Number(d.amount || 0),
        status: payInfo.status,
        paidAmount: payInfo.paidAmount,
        remainingAmount: payInfo.remainingAmount,
        installmentIndex: idx,
        installmentTotal: total,
        countInTotal: (typeof window !== 'undefined' && window.FinanceDomain && typeof window.FinanceDomain.isDebtorCountedInTotal === 'function')
          ? window.FinanceDomain.isDebtorCountedInTotal(d)
          : (d && d.countInTotal === true),
        isExpense: false,
        isDebtor: true,
        month: m,
        year: y
      });
    });

    return dataset;
  }

  /**
   * Aplica filtros locais ao dataset consolidado
   */
  function filterConsolidatedDataset(dataset, filters) {
    if (!Array.isArray(dataset)) return [];
    const f = filters || localFilters;

    return dataset.filter(item => {
      // 1. Busca por texto
      if (f.search && f.search.trim()) {
        const q = f.search.toLowerCase().trim();
        const desc = (item.description || '').toLowerCase();
        const cat = (item.category || '').toLowerCase();
        const dest = (item.destination || '').toLowerCase();
        if (!desc.includes(q) && !cat.includes(q) && !dest.includes(q)) return false;
      }

      // 2. Status
      if (f.status && f.status !== 'all') {
        if (item.status !== f.status) return false;
      }

      // 3. Categoria
      if (f.category && f.category !== 'all') {
        if (item.category !== f.category) return false;
      }

      // 4. Destino
      if (f.destination && f.destination !== 'all') {
        if (item.destination !== f.destination) return false;
      }

      // 5. Origem / Tipo
      if (f.sourceType && f.sourceType !== 'all') {
        if (f.sourceType === 'expenses' && !item.isExpense) return false;
        if (f.sourceType === 'debtors' && !item.isDebtor) return false;
      }

      return true;
    });
  }

  /**
   * Agregação por Categoria
   */
  function aggregateByCategory(filteredDataset, totalReference) {
    const map = {};
    const ref = totalReference > 0 ? totalReference : 1;

    filteredDataset.forEach(item => {
      const cat = item.category || 'Gerais';
      if (!map[cat]) {
        map[cat] = {
          name: cat,
          meta: (typeof getCategoryMeta === 'function') ? getCategoryMeta(cat) : { name: cat, icon: 'tag' },
          total: 0,
          paidTotal: 0,
          pendingTotal: 0,
          count: 0,
          items: []
        };
      }
      map[cat].total += item.amount;
      const itemPaid = item.paidAmount !== undefined ? item.paidAmount : (item.status === 'pago' ? item.amount : 0);
      const itemPending = item.remainingAmount !== undefined ? item.remainingAmount : (item.status === 'pago' ? 0 : item.amount);
      map[cat].paidTotal += itemPaid;
      map[cat].pendingTotal += itemPending;
      map[cat].count += 1;
      map[cat].items.push(item);
    });

    return Object.values(map)
      .map(entry => ({
        ...entry,
        pct: totalReference > 0 ? Math.min(100, Math.round((entry.total / ref) * 100)) : 0
      }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Agregação por Destino
   */
  function aggregateByDestination(filteredDataset, totalReference) {
    const map = {};
    const ref = totalReference > 0 ? totalReference : 1;

    filteredDataset.forEach(item => {
      const dest = item.destination || 'Nubank';
      if (!map[dest]) {
        map[dest] = {
          name: dest,
          meta: (typeof getDestMeta === 'function') ? getDestMeta(dest) : { name: dest, color: '#1F7A5C', icon: 'card' },
          total: 0,
          paidTotal: 0,
          pendingTotal: 0,
          count: 0,
          items: []
        };
      }
      map[dest].total += item.amount;
      const itemPaid = item.paidAmount !== undefined ? item.paidAmount : (item.status === 'pago' ? item.amount : 0);
      const itemPending = item.remainingAmount !== undefined ? item.remainingAmount : (item.status === 'pago' ? 0 : item.amount);
      map[dest].paidTotal += itemPaid;
      map[dest].pendingTotal += itemPending;
      map[dest].count += 1;
      map[dest].items.push(item);
    });

    return Object.values(map)
      .map(entry => ({
        ...entry,
        pct: totalReference > 0 ? Math.min(100, Math.round((entry.total / ref) * 100)) : 0
      }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Constrói Matriz Categoria × Destino
   */
  function buildCategoryDestinationMatrix(filteredDataset) {
    const matrix = {};
    const catTotals = {};
    const destTotals = {};
    let grandTotal = 0;

    filteredDataset.forEach(item => {
      const cat = item.category || 'Gerais';
      const dest = item.destination || 'Nubank';
      const amt = item.amount;

      if (!matrix[cat]) matrix[cat] = {};
      matrix[cat][dest] = (matrix[cat][dest] || 0) + amt;
      catTotals[cat] = (catTotals[cat] || 0) + amt;
      destTotals[dest] = (destTotals[dest] || 0) + amt;
      grandTotal += amt;
    });

    const categories = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
    const destinations = Object.keys(destTotals).sort((a, b) => destTotals[b] - destTotals[a]);

    return {
      matrix,
      categories,
      destinations,
      catTotals,
      destTotals,
      grandTotal
    };
  }

  /**
   * Formata moeda de forma segura
   */
  function formatMoney(val) {
    if (typeof currency === 'function') return currency(val || 0);
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Sanitiza HTML para prevenção de XSS
   */
  function escapeHtml(str) {
    if (typeof window !== 'undefined' && typeof window.escapeHtml === 'function') {
      return window.escapeHtml(str);
    }
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Labels amigáveis para apresentação dos tipos de eventos do calendário
  const SOURCE_TYPE_LABELS = {
    fixed_expense: 'Despesa fixa',
    variable_expense: 'Despesa variável',
    extra_income: 'Renda extra',
    debtor_receivable: 'Valor a receber',
    salary: 'Salário',
    benefit_transaction: 'Benefício',
    benefit_credit: 'Crédito benefício'
  };

  function getCalendarSourceTypeLabel(sourceType) {
    if (!sourceType || typeof sourceType !== 'string') return 'Movimentação';
    return SOURCE_TYPE_LABELS[sourceType] || 'Movimentação';
  }

  // Estado Local de Projeção Temporal Canônica do Dashboard (UX2 - Nível 1 & Próximos Movimentos)
  let currentProjectionData = null;
  let projectionLoading = false;
  let projectionError = false;
  let projectionYear = null;
  let projectionMonth = null;
  let activeProjectionRequestId = 0;

  /**
   * Helper puro de apresentação: constrói a lista HTML de eventos mais próximos (máximo 5).
   * Semântica temporal:
   * A) Mês civil atual: date >= hoje ("Próximos movimentos")
   * B) Mês futuro: a partir do início da competência ("Próximos movimentos")
   * C) Mês passado: histórico da competência ("Movimentações do período")
   * Exclusivo: projection.events (ignora undated e benefícios)
   */
  function buildUpcomingEventsHtml(projection, year, month) {
    if (!projection || !Array.isArray(projection.events)) {
      if (projectionLoading) {
        return '<div class="dash-upcoming-empty">Carregando movimentações...</div>';
      }
      return '<div class="dash-upcoming-empty">Nenhuma movimentação disponível.</div>';
    }

    const now = (typeof todayYM === 'function') ? todayYM() : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
    const todayDay = new Date().getDate();
    const todayStr = (typeof window.getTodayCivilDate === 'function')
      ? window.getTodayCivilDate()
      : `${now.year}-${String(now.month).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`;

    const isCurrent = (year === now.year && month === now.month);
    const monthAbbrList = (typeof MONTH_ABBR !== 'undefined' && Array.isArray(MONTH_ABBR) && MONTH_ABBR.length === 12)
      ? MONTH_ABBR
      : ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    // 1. Filtrar somente eventos datados válidos (projection.events já exclui undated e benefits)
    const datedEvents = projection.events.filter(e => e && e.date && typeof e.date === 'string');

    // 2. Ordenar por data ASC
    const sorted = [...datedEvents].sort((a, b) => a.date.localeCompare(b.date));

    // 3. Semântica temporal
    let filtered;
    if (isCurrent) {
      filtered = sorted.filter(e => e.date >= todayStr);
    } else {
      filtered = sorted;
    }

    // 4. Limite estrito: máximo 5 ocorrências
    const list = filtered.slice(0, 5);

    if (list.length === 0) {
      const emptyMsg = isCurrent
        ? 'Nenhuma movimentação prevista a partir de hoje neste mês.'
        : 'Nenhuma movimentação datada registrada nesta competência.';
      return `<div class="dash-upcoming-empty">${escapeHtml(emptyMsg)}</div>`;
    }

    return list.map(ev => {
      const parts = String(ev.date).split('-');
      const day = parts[2] || '01';
      const mNum = parseInt(parts[1] || '1', 10);
      const mAbbr = monthAbbrList[mNum - 1] || 'Mês';
      const dateDisplay = `${day} ${mAbbr}`;

      const desc = ev.description || ev.name || 'Movimentação';
      const sourceTypeLabel = getCalendarSourceTypeLabel(ev.sourceType);
      const isOutflow = (ev.direction === 'outflow');
      const amountPrefix = isOutflow ? '- ' : '+ ';
      const amountClass = isOutflow ? 'dash-upcoming-amount--outflow' : 'dash-upcoming-amount--inflow';

      return `
        <div class="dash-upcoming-item">
          <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
            <span class="dash-upcoming-date-pill">${escapeHtml(dateDisplay)}</span>
            <div style="min-width:0; flex:1;">
              <div class="dash-upcoming-desc">${escapeHtml(desc)}</div>
              <div class="dash-upcoming-source">${escapeHtml(sourceTypeLabel)}</div>
            </div>
          </div>
          <div class="dash-upcoming-amount ${amountClass}">
            ${amountPrefix}${formatMoney(ev.amount)}
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Atualiza a UI da projeção de forma cirúrgica (sem causar flicker nem re-render do restante)
   */
  function updateDashboardProjectionUI(res, year, month) {
    const netEl = document.getElementById('dashNetResultValue');
    const netSubEl = document.getElementById('dashNetResultSub');
    const inEl = document.getElementById('dashInflowValue');
    const outEl = document.getElementById('dashOutflowValue');
    const upcomingListEl = document.getElementById('dashUpcomingList');

    const heroCardEl = document.getElementById('dashHeroCard');

    if (netEl && res && res.summary) {
      const net = Number(res.summary.net || 0);
      netEl.textContent = formatMoney(net);
      const nClass = net > 0 ? 'dash-hero-net--positive' : (net === 0 ? 'dash-hero-net--neutral' : 'dash-hero-net--negative');
      const cClass = net > 0 ? 'metric-positive' : (net === 0 ? 'metric-neutral' : 'metric-negative');
      netEl.className = `dash-hero-net ${nClass}`;
      if (heroCardEl) {
        heroCardEl.classList.remove('metric-positive', 'metric-neutral', 'metric-negative');
        heroCardEl.classList.add(cClass);
      }
      if (netSubEl) {
        netSubEl.textContent = (net > 0 ? 'Superávit previsto no período' : (net === 0 ? 'Equilíbrio previsto no período' : 'Déficit previsto no período'));
      }
    }
    if (inEl && res && res.summary) {
      inEl.textContent = formatMoney(res.summary.inflow || 0);
    }
    if (outEl && res && res.summary) {
      outEl.textContent = formatMoney(res.summary.outflow || 0);
    }
    if (upcomingListEl && res) {
      upcomingListEl.innerHTML = buildUpcomingEventsHtml(res, year, month);
    }
  }

  function updateDashboardProjectionError() {
    const netEl = document.getElementById('dashNetResultValue');
    const netSubEl = document.getElementById('dashNetResultSub');
    const inEl = document.getElementById('dashInflowValue');
    const outEl = document.getElementById('dashOutflowValue');
    const upcomingListEl = document.getElementById('dashUpcomingList');

    const heroCardEl = document.getElementById('dashHeroCard');
    if (heroCardEl) {
      heroCardEl.classList.remove('metric-positive', 'metric-neutral', 'metric-negative');
    }

    if (netEl) {
      netEl.textContent = '—';
      netEl.className = 'dash-hero-net';
    }
    if (netSubEl) netSubEl.textContent = 'Não foi possível carregar o resultado previsto.';
    if (inEl) inEl.textContent = '—';
    if (outEl) outEl.textContent = '—';
    if (upcomingListEl) {
      upcomingListEl.innerHTML = '<div class="dash-upcoming-empty">Erro ao carregar movimentações do calendário.</div>';
    }
  }

  /**
   * Carrega os dados canônicos da Calendar Projection API para a competência solicitada
   */
  async function loadDashboardProjection(year, month) {
    const reqId = ++activeProjectionRequestId;
    projectionLoading = true;
    projectionError = false;

    try {
      let res = null;
      if (typeof window !== 'undefined' && window.__MOCK_CALENDAR_PROJECTION__) {
        res = window.__MOCK_CALENDAR_PROJECTION__;
      } else if (window.API && typeof window.API.getCalendarProjection === 'function') {
        res = await window.API.getCalendarProjection(year, month);
      } else if (window.API && typeof window.API.get === 'function') {
        res = await window.API.get(`/api/finances/calendar?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`);
      } else if (typeof fetch === 'function') {
        const fetchUrl = (window.API && typeof window.API.resolveUrl === 'function')
          ? window.API.resolveUrl(`/api/finances/calendar?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`)
          : `/api/finances/calendar?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`;
        const r = await fetch(fetchUrl, { credentials: 'same-origin' });
        res = await r.json();
      }

      if (reqId !== activeProjectionRequestId) return;

      if (res && res.summary) {
        currentProjectionData = res;
        projectionYear = year;
        projectionMonth = month;
        projectionLoading = false;
        projectionError = false;
        updateDashboardProjectionUI(res, year, month);
      } else {
        projectionLoading = false;
        projectionError = true;
        updateDashboardProjectionError();
      }
    } catch (err) {
      if (reqId !== activeProjectionRequestId) return;
      projectionLoading = false;
      projectionError = true;
      updateDashboardProjectionError();
    }
  }

  /**
   * Renderizador Principal da Aba Dashboard Consolidado (UX2: Hierarquia de Informação em 3 Níveis)
   */
  function renderConsolidatedDashboardTab() {
    const container = document.getElementById('dashboardViewWrap') || document.getElementById('expensesConsolidatedViewWrap') || (typeof $ === 'function' ? ($('#dashboardViewWrap') || $('#expensesConsolidatedViewWrap')) : null);
    if (!container) return;

    const state = (typeof getState === 'function') ? getState() : (window.state || {});
    const year = Number(state.year) || 2026;
    const month = Number(state.month) || 1;
    const monthName = (typeof MONTH_NAMES !== 'undefined' && MONTH_NAMES[month - 1]) ? MONTH_NAMES[month - 1] : `Mês ${month}`;
    const now = (typeof todayYM === 'function') ? todayYM() : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
    const isCurrentCompetence = (year === now.year && month === now.month);
    const isPastCompetence = (year < now.year || (year === now.year && month < now.month));

    // 1. Constrói dataset bruto da competência
    const rawDataset = buildConsolidatedDataset(state, year, month);

    // Opções dinâmicas para os filtros ordenadas alfabeticamente
    const distinctCategories = [...new Set(rawDataset.map(i => i.category))].sort((a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' }));
    const distinctDestinations = [...new Set(rawDataset.map(i => i.destination))].sort((a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR', { sensitivity: 'base' }));

    // 2. Aplica filtros locais
    const dataset = filterConsolidatedDataset(rawDataset, localFilters);

    // 3. Cálculos de totalizadores de contexto (Nível 2)
    const expensesItems = dataset.filter(i => i.isExpense);
    const debtorItems = dataset.filter(i => i.isDebtor);

    const totalExpenses = expensesItems.reduce((s, i) => s + i.amount, 0);
    const totalDebtors = debtorItems.reduce((s, i) => s + i.amount, 0);
    const totalFiltered = dataset.reduce((s, i) => s + i.amount, 0);

    const totalPaid = dataset.reduce((s, i) => s + (i.paidAmount !== undefined ? i.paidAmount : (i.status === 'pago' ? i.amount : 0)), 0);
    const totalPending = dataset.reduce((s, i) => s + (i.remainingAmount !== undefined ? i.remainingAmount : (i.status === 'pago' ? 0 : i.amount)), 0);

    const pctPaid = totalFiltered > 0 ? Math.min(100, Math.round((totalPaid / totalFiltered) * 100)) : 0;

    // 4. Agregações para análises internas (Nível 3)
    const catAgg = aggregateByCategory(dataset, totalFiltered);
    const destAgg = aggregateByDestination(dataset, totalFiltered);
    const matrixData = buildCategoryDestinationMatrix(dataset);

    // ==========================================
    // MARKUP: FILTROS COMPACTOS REORGANIZADOS
    // ==========================================
    const hasActiveFilters = (localFilters.search || localFilters.status !== 'all' || localFilters.category !== 'all' || localFilters.destination !== 'all' || localFilters.sourceType !== 'all');
    const filtersHtml = `
      <div class="dash-filters-bar" id="dashFiltersBar">
        <div style="display:flex; align-items:center; gap:8px;">
          <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:16px; height:16px;"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          <span style="font-weight:800; font-size:0.86rem;" title="Filtros da Visão Consolidada">Filtros</span>
          <span class="badge info" id="dashCompetenceBadge" style="font-size:0.72rem;">${escapeHtml(monthName)}/${year}</span>
        </div>

        <div class="dash-filters-controls">
          <input type="text" id="consolidatedSearchInput" placeholder="Buscar lançamentos..." value="${escapeHtml(localFilters.search)}"
            style="padding:6px 12px; border-radius:999px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.80rem; min-width:160px; max-width:200px;">

          <select id="consolidatedStatusFilter" style="padding:6px 10px; border-radius:999px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.80rem;">
            <option value="all" ${localFilters.status === 'all' ? 'selected' : ''}>Todos os Status</option>
            <option value="pago" ${localFilters.status === 'pago' ? 'selected' : ''}>Pago / Liquidado</option>
            <option value="parcial" ${localFilters.status === 'parcial' ? 'selected' : ''}>Parcialmente Pago</option>
            <option value="pendente" ${localFilters.status === 'pendente' ? 'selected' : ''}>Pendente</option>
          </select>

          <select id="consolidatedCategoryFilter" style="padding:6px 10px; border-radius:999px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.80rem;">
            <option value="all" ${localFilters.category === 'all' ? 'selected' : ''}>Todas as Categorias</option>
            ${distinctCategories.map(c => `<option value="${escapeHtml(c)}" ${localFilters.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select>

          <select id="consolidatedDestFilter" style="padding:6px 10px; border-radius:999px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.80rem;">
            <option value="all" ${localFilters.destination === 'all' ? 'selected' : ''}>Todos os Destinos</option>
            ${distinctDestinations.map(d => `<option value="${escapeHtml(d)}" ${localFilters.destination === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
          </select>

          <select id="consolidatedSourceFilter" style="padding:6px 10px; border-radius:999px; border:1px solid var(--line); background:var(--surface-2); color:var(--text); font-size:0.80rem;">
            <option value="all" ${localFilters.sourceType === 'all' ? 'selected' : ''}>Todas as Origens</option>
            <option value="expenses" ${localFilters.sourceType === 'expenses' ? 'selected' : ''}>Apenas Despesas</option>
            <option value="debtors" ${localFilters.sourceType === 'debtors' ? 'selected' : ''}>Apenas Devedores</option>
          </select>

          ${hasActiveFilters ? `
            <button type="button" id="consolidatedClearFiltersBtn" class="btn small soft" style="border-radius:999px; font-size:0.74rem; padding:5px 10px;">
              Limpar
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // ==========================================
    // NÍVEL 1: VISÃO DO MÊS (HERO CARD)
    // ==========================================
    const hasProjection = (currentProjectionData && projectionYear === year && projectionMonth === month && !projectionLoading);
    const netVal = hasProjection ? currentProjectionData.summary.net : null;
    const inflowVal = hasProjection ? currentProjectionData.summary.inflow : null;
    const outflowVal = hasProjection ? currentProjectionData.summary.outflow : null;

    const netClass = (netVal !== null)
      ? (netVal > 0 ? 'dash-hero-net--positive' : (netVal === 0 ? 'dash-hero-net--neutral' : 'dash-hero-net--negative'))
      : '';
    const heroCardClass = (netVal !== null)
      ? (netVal > 0 ? 'metric-positive' : (netVal === 0 ? 'metric-neutral' : 'metric-negative'))
      : '';
    const netStatusText = (netVal !== null)
      ? (netVal > 0 ? 'Superávit previsto no período' : (netVal === 0 ? 'Equilíbrio previsto no período' : 'Déficit previsto no período'))
      : 'Calculando projeção canônica...';

    const heroHtml = `
      <div class="dash-hero-card ${heroCardClass}" id="dashHeroCard" data-legacy="TOTAL CONSOLIDADO">
        <div class="dash-hero-grid">
          <!-- Bloco Principal: RESULTADO PREVISTO -->
          <div class="dash-hero-main">
            <div class="dash-hero-label">
              <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:16px; height:16px;">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span>Resultado Previsto</span>
            </div>
            <div class="dash-hero-net ${netClass}" id="dashNetResultValue">
              ${netVal !== null ? formatMoney(netVal) : '<span class="dash-skeleton-val"></span>'}
            </div>
            <div class="dash-hero-sub" id="dashNetResultSub">
              ${escapeHtml(netStatusText)}
            </div>
          </div>

          <!-- Apoio 1: ENTRADAS PREVISTAS -->
          <div class="dash-hero-sub-card metric-income">
            <div class="dash-hero-sub-label">
              <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:14px; height:14px;">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
              <span>Entradas Previstas</span>
            </div>
            <div class="dash-hero-sub-val dash-hero-sub-val--inflow num" id="dashInflowValue">
              ${inflowVal !== null ? formatMoney(inflowVal) : '<span class="dash-skeleton-sm"></span>'}
            </div>
          </div>

          <!-- Apoio 2: SAÍDAS PREVISTAS -->
          <div class="dash-hero-sub-card metric-expense">
            <div class="dash-hero-sub-label">
              <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--danger, #EF4444); width:14px; height:14px;">
                <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                <polyline points="17 18 23 18 23 12" />
              </svg>
              <span>Saídas Previstas</span>
            </div>
            <div class="dash-hero-sub-val dash-hero-sub-val--outflow num" id="dashOutflowValue">
              ${outflowVal !== null ? formatMoney(outflowVal) : '<span class="dash-skeleton-sm"></span>'}
            </div>
          </div>
        </div>
      </div>
    `;

    // ==========================================
    // NÍVEL 2: CONTEXTO E PRÓXIMOS MOVIMENTOS
    // ==========================================
    const upcomingTitle = isPastCompetence ? 'Movimentações do período' : 'Próximos movimentos';
    const upcomingBadgeText = isPastCompetence ? 'Histórico do período' : (isCurrentCompetence ? 'A partir de hoje' : `Competência ${monthName}`);
    const upcomingEventsHtml = buildUpcomingEventsHtml(currentProjectionData, year, month);

    const contextHtml = `
      <div class="dash-context-grid">
        <!-- COLUNA ESQUERDA: CONTEXTO CONSOLIDADO (3 CARDS COMPACTOS) -->
        <div class="dash-context-cards">
          <!-- Card 1: Despesas -->
          <div class="dash-context-item metric-expense">
            <div class="dash-context-item-left">
              <div class="dash-context-icon">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:20px; height:20px;">
                  <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
                  <polyline points="17 18 23 18 23 12"/>
                </svg>
              </div>
              <div>
                <div class="dash-context-title">Despesas Operacionais</div>
                <div class="dash-context-sub">${expensesItems.length} despesas na competência</div>
              </div>
            </div>
            <div class="dash-context-item-right">
              <div class="dash-context-val num">${formatMoney(totalExpenses)}</div>
            </div>
          </div>

          <!-- Card 2: Devedores / A Receber -->
          <div class="dash-context-item metric-pending">
            <div class="dash-context-item-left">
              <div class="dash-context-icon">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:20px; height:20px;">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div>
                <div class="dash-context-title">Cobranças a Receber</div>
                <div class="dash-context-sub">${debtorItems.length} registros ativos</div>
              </div>
            </div>
            <div class="dash-context-item-right">
              <div class="dash-context-val num">${formatMoney(totalDebtors)}</div>
            </div>
          </div>

          <!-- Card 3: Pendências / Quitação -->
          <div class="dash-context-item metric-pending">
            <div class="dash-context-item-left">
              <div class="dash-context-icon">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:20px; height:20px;">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div>
                <div class="dash-context-title">Pendências em Aberto</div>
                <div class="dash-context-sub">${pctPaid}% liquidado (${formatMoney(totalPaid)})</div>
              </div>
            </div>
            <div class="dash-context-item-right">
              <div class="dash-context-val num">${formatMoney(totalPending)}</div>
            </div>
          </div>
        </div>

        <!-- COLUNA DIREITA: PRÓXIMOS MOVIMENTOS (CALENDAR PROJECTION API) -->
        <div class="dash-upcoming-card" id="dashUpcomingCard">
          <div>
            <div class="dash-upcoming-header">
              <h3 class="dash-upcoming-title" id="dashUpcomingTitle">
                <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:18px; height:18px;">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span id="dashUpcomingTitleText">${escapeHtml(upcomingTitle)}</span>
              </h3>
              <span class="badge info" id="dashUpcomingBadge" style="font-size:0.70rem;">${escapeHtml(upcomingBadgeText)}</span>
            </div>

            <div class="dash-upcoming-list" id="dashUpcomingList">
              ${upcomingEventsHtml}
            </div>
          </div>

          <div class="dash-upcoming-footer">
            <button type="button" class="btn small soft dash-upcoming-cta-btn" id="dashGoToCalendarBtn">
              Ver calendário →
            </button>
          </div>
        </div>
      </div>
    `;

    // ==========================================
    // NÍVEL 3: ANÁLISES INTERNAS (PROGRESSIVE DISCLOSURE)
    // ==========================================
    const categoryCardsHtml = catAgg.map(cat => {
      const isExpanded = !!expandedAccordions.categories[cat.name];
      const iconSvg = (typeof getCategoryIconSvg === 'function') ? getCategoryIconSvg(cat.meta?.icon || cat.name) : (window.CATEGORY_SVG_ICONS?.tag || '');
      const catColor = cat.meta?.color || (typeof getCategoryColor === 'function' ? getCategoryColor(cat.name) : '#1F7A5C');

      return `
        <div class="card" style="padding:12px 16px; border-radius:12px; background:var(--surface); border:1px solid var(--line); margin-bottom:10px;">
          <div class="consolidated-accordion-header" data-toggle-cat="${escapeHtml(cat.name)}" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
              <div style="width:34px; height:34px; border-radius:10px; background:${catColor}18; display:grid; place-items:center; flex-shrink:0; color:${catColor};">
                ${iconSvg}
              </div>
              <div>
                <div style="font-weight:800; font-size:0.90rem; color:var(--text);">${escapeHtml(cat.name)}</div>
                <div style="font-size:0.75rem; color:var(--muted);">${cat.count} ${cat.count === 1 ? 'lançamento' : 'lançamentos'}</div>
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
              <div style="text-align:right;">
                <div class="num" style="font-weight:850; font-size:0.95rem;">${formatMoney(cat.total)}</div>
                <span class="badge info" style="font-size:0.68rem; padding:2px 6px;">${cat.pct}% do total</span>
              </div>
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:16px; height:16px; stroke:var(--muted); transition:transform 0.2s ease; transform:${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>

          <div style="margin-top:8px; height:4px; border-radius:2px; background:var(--surface-2); overflow:hidden;">
            <div style="width:${cat.pct}%; height:100%; background:${catColor}; border-radius:2px;"></div>
          </div>

          ${isExpanded ? `
            <div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--line); display:flex; flex-direction:column; gap:6px;">
              ${cat.items.map(item => `
                <div class="consolidated-drilldown-item">
                  <div style="overflow:hidden; display:flex; flex-direction:column; gap:2px;">
                    <div style="font-weight:750; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.description)}</div>
                    <div style="display:flex; align-items:center; gap:6px; font-size:0.72rem; color:var(--muted);">
                      <span class="badge ${item.isDebtor ? 'warning' : 'info'}" style="font-size:0.65rem; padding:1px 5px;">${escapeHtml(item.sourceTypeLabel)}</span>
                      <span>Destino: <strong>${escapeHtml(item.destination)}</strong></span>
                      ${item.installmentIndex && item.installmentTotal ? `<span>(${item.installmentIndex}/${item.installmentTotal})</span>` : ''}
                    </div>
                  </div>
                  <div style="text-align:right; flex-shrink:0;">
                    <div class="num" style="font-weight:800;">${formatMoney(item.amount)}</div>
                    ${item.status === 'pago' ? `<span class="badge success" style="font-size:0.65rem; padding:1px 5px;">Pago</span>` : (item.status === 'parcial' ? `<span class="badge warning" style="font-size:0.65rem; padding:1px 5px; background:rgba(245,158,11,0.15); color:#f59e0b;">Parcial (${formatMoney(item.paidAmount)})</span>` : `<span class="badge warning" style="font-size:0.65rem; padding:1px 5px;">Pendente</span>`)}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    const destinationCardsHtml = destAgg.map(dest => {
      const isExpanded = !!expandedAccordions.destinations[dest.name];
      const destIconSvg = (typeof DEST_SVG_ICONS !== 'undefined' && DEST_SVG_ICONS[dest.meta?.icon]) ? DEST_SVG_ICONS[dest.meta.icon] : (window.DEST_SVG_ICONS?.card || '');
      const color = dest.meta?.color || 'var(--brand)';

      return `
        <div class="card" style="padding:12px 16px; border-radius:12px; background:var(--surface); border:1px solid var(--line); margin-bottom:10px;">
          <div class="consolidated-accordion-header" data-toggle-dest="${escapeHtml(dest.name)}" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
              <div style="width:34px; height:34px; border-radius:10px; background:var(--surface-2); display:grid; place-items:center; flex-shrink:0; color:${color};">
                ${destIconSvg}
              </div>
              <div>
                <div style="font-weight:800; font-size:0.90rem; color:var(--text);">${escapeHtml(dest.name)}</div>
                <div style="font-size:0.75rem; color:var(--muted);">${dest.count} ${dest.count === 1 ? 'lançamento' : 'lançamentos'}</div>
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
              <div style="text-align:right;">
                <div class="num" style="font-weight:850; font-size:0.95rem;">${formatMoney(dest.total)}</div>
                <span class="badge info" style="font-size:0.68rem; padding:2px 6px;">${dest.pct}% do total</span>
              </div>
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:16px; height:16px; stroke:var(--muted); transition:transform 0.2s ease; transform:${isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>

          <div style="margin-top:8px; height:4px; border-radius:2px; background:var(--surface-2); overflow:hidden;">
            <div style="width:${dest.pct}%; height:100%; background:${color}; border-radius:2px;"></div>
          </div>

          ${isExpanded ? `
            <div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--line); display:flex; flex-direction:column; gap:6px;">
              ${dest.items.map(item => `
                <div class="consolidated-drilldown-item">
                  <div style="overflow:hidden; display:flex; flex-direction:column; gap:2px;">
                    <div style="font-weight:750; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(item.description)}</div>
                    <div style="display:flex; align-items:center; gap:6px; font-size:0.72rem; color:var(--muted);">
                      <span class="badge ${item.isDebtor ? 'warning' : 'info'}" style="font-size:0.65rem; padding:1px 5px;">${escapeHtml(item.sourceTypeLabel)}</span>
                      <span>Cat: <strong>${escapeHtml(item.category)}</strong></span>
                      ${item.installmentIndex && item.installmentTotal ? `<span>(${item.installmentIndex}/${item.installmentTotal})</span>` : ''}
                    </div>
                  </div>
                  <div style="text-align:right; flex-shrink:0;">
                    <div class="num" style="font-weight:800;">${formatMoney(item.amount)}</div>
                    ${item.status === 'pago' ? `<span class="badge success" style="font-size:0.65rem; padding:1px 5px;">Pago</span>` : (item.status === 'parcial' ? `<span class="badge warning" style="font-size:0.65rem; padding:1px 5px; background:rgba(245,158,11,0.15); color:#f59e0b;">Parcial (${formatMoney(item.paidAmount)})</span>` : `<span class="badge warning" style="font-size:0.65rem; padding:1px 5px;">Pendente</span>`)}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Matriz Categoria × Destino
    let maxCellVal = 1;
    matrixData.categories.forEach(c => {
      matrixData.destinations.forEach(d => {
        const val = matrixData.matrix[c]?.[d] || 0;
        if (val > maxCellVal) maxCellVal = val;
      });
    });

    const matrixHeaderCols = matrixData.destinations.map(d => {
      const destMeta = (typeof getDestMeta === 'function') ? getDestMeta(d) : { color: 'var(--brand)', icon: 'card' };
      return `<th style="text-align:right; min-width:110px;"><span style="color:${destMeta.color}; font-weight:800;">●</span> ${escapeHtml(d)}</th>`;
    }).join('');

    const matrixBodyRows = matrixData.categories.map(c => {
      const catMeta = (typeof getCategoryMeta === 'function') ? getCategoryMeta(c) : { icon: 'tag' };
      const catIcon = (typeof getCategoryIconSvg === 'function') ? getCategoryIconSvg(catMeta?.icon || c) : '';
      const rowTotal = matrixData.catTotals[c] || 0;

      const cells = matrixData.destinations.map(d => {
        const cellVal = matrixData.matrix[c]?.[d] || 0;
        const isNonZero = cellVal > 0;
        const isStrong = cellVal > (maxCellVal * 0.4);
        return `
          <td class="${isNonZero ? (isStrong ? 'cell-highlight' : '') : ''}" style="${isNonZero ? 'font-weight:750;' : 'color:var(--muted);'}">
            ${isNonZero ? formatMoney(cellVal) : '—'}
          </td>
        `;
      }).join('');

      return `
        <tr>
          <td class="cat-col" style="display:flex; align-items:center; gap:8px;">
            <span style="width:16px; height:16px; color:var(--brand); display:inline-flex;">${catIcon}</span>
            <span>${escapeHtml(c)}</span>
          </td>
          ${cells}
          <td class="total-col">${formatMoney(rowTotal)}</td>
        </tr>
      `;
    }).join('');

    const matrixFooterCells = matrixData.destinations.map(d => {
      const totalDest = matrixData.destTotals[d] || 0;
      return `<td style="font-weight:850;">${formatMoney(totalDest)}</td>`;
    }).join('');

    const matrixTableHtml = `
      <div class="consolidated-matrix-table-wrap">
        <table class="consolidated-matrix-table">
          <thead>
            <tr>
              <th class="cat-col">Categoria \\ Destino</th>
              ${matrixHeaderCols}
              <th class="total-col" style="min-width:130px; text-align:right;">Total Categoria</th>
            </tr>
          </thead>
          <tbody>
            ${matrixBodyRows}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td class="cat-col" style="font-weight:850;">Total do Destino</td>
              ${matrixFooterCells}
              <td class="total-col" style="font-weight:900; color:var(--brand-strong);">${formatMoney(matrixData.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    // Seções Expansíveis de Nível 3 (iniciam COLLAPSED por padrão)
    const analysisSectionsHtml = `
      <div class="dash-analysis-sections" id="dashAnalysisSections">
        <div class="dash-analysis-grid">
          <!-- SEÇÃO 1: POR CATEGORIA (COLLAPSIBLE) -->
          <div class="card expandable-section is-collapsed" id="dashCategorySection" data-expandable-section>
            <div class="expandable-section__header" id="dashCategoryHeader" aria-expanded="false" aria-controls="dashCategoryContent">
              <div class="expandable-section__title-group">
                <div class="expandable-section__titles">
                  <h3 class="expandable-section__title">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:16px; height:16px;">
                      <path d="M21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>
                    </svg>
                    Por Categoria
                  </h3>
                  <span class="expandable-section__desc">${catAgg.length} categorias • ${formatMoney(totalFiltered)}</span>
                </div>
              </div>
              <div class="expandable-section__meta">
                <span class="badge info" style="font-size:0.72rem;">${catAgg.length} categorias</span>
                <span class="expandable-section__chevron" aria-hidden="true">
                  <svg class="svg-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
              </div>
            </div>
            <div class="expandable-section__content" id="dashCategoryContent" hidden>
              <div style="display:flex; flex-direction:column; padding-top:6px;">
                ${categoryCardsHtml}
              </div>
            </div>
          </div>

          <!-- SEÇÃO 2: POR DESTINO / CARTÃO (COLLAPSIBLE) -->
          <div class="card expandable-section is-collapsed" id="dashDestinationSection" data-expandable-section>
            <div class="expandable-section__header" id="dashDestinationHeader" aria-expanded="false" aria-controls="dashDestinationContent">
              <div class="expandable-section__title-group">
                <div class="expandable-section__titles">
                  <h3 class="expandable-section__title">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:16px; height:16px;">
                      <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
                    </svg>
                    Por Destino / Cartão
                  </h3>
                  <span class="expandable-section__desc">${destAgg.length} destinos • ${formatMoney(totalFiltered)}</span>
                </div>
              </div>
              <div class="expandable-section__meta">
                <span class="badge info" style="font-size:0.72rem;">${destAgg.length} destinos</span>
                <span class="expandable-section__chevron" aria-hidden="true">
                  <svg class="svg-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </span>
              </div>
            </div>
            <div class="expandable-section__content" id="dashDestinationContent" hidden>
              <div style="display:flex; flex-direction:column; padding-top:6px;">
                ${destinationCardsHtml}
              </div>
            </div>
          </div>
        </div>

        <!-- SEÇÃO 3: MATRIZ CRUZADA (COLLAPSIBLE) -->
        <div class="card expandable-section is-collapsed full-width" id="dashMatrixSection" data-expandable-section>
          <div class="expandable-section__header" id="dashMatrixHeader" aria-expanded="false" aria-controls="dashMatrixContent">
            <div class="expandable-section__title-group">
              <div class="expandable-section__titles">
                <h3 class="expandable-section__title">
                  <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:16px; height:16px;">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
                  </svg>
                  Matriz Cruzada: Categoria × Destino
                </h3>
                <span class="expandable-section__desc">${matrixData.categories.length} categorias × ${matrixData.destinations.length} destinos</span>
              </div>
            </div>
            <div class="expandable-section__meta">
              <span class="badge info" style="font-size:0.72rem;">${matrixData.categories.length} × ${matrixData.destinations.length}</span>
              <span class="expandable-section__chevron" aria-hidden="true">
                <svg class="svg-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
              </span>
            </div>
          </div>
          <div class="expandable-section__content" id="dashMatrixContent" hidden style="padding:0;">
            ${matrixTableHtml}
          </div>
        </div>
      </div>
    `;

    // Empty state se dataset filtrado não contiver nada
    if (dataset.length === 0) {
      container.innerHTML = `
        <div class="consolidated-dashboard-view" id="consolidatedDashboardView">
          ${filtersHtml}
          ${heroHtml}
          ${contextHtml}
          <div class="card section-card full-width" style="padding:48px 20px; text-align:center; border-radius:14px; margin-bottom:22px;">
            <div style="display:inline-flex; align-items:center; justify-content:center; width:54px; height:54px; border-radius:50%; background:var(--surface-2); margin-bottom:14px;">
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:28px; height:28px; stroke:var(--muted);"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </div>
            <h3 style="font-size:1.1rem; font-weight:800; margin:0 0 6px;">Nenhum lançamento encontrado</h3>
            <p style="color:var(--muted); font-size:0.86rem; max-width:440px; margin:0 auto 16px;">
              Não há lançamentos de despesas ou cobranças correspondentes para <strong>${escapeHtml(monthName)}/${year}</strong> com os filtros aplicados.
            </p>
            ${hasActiveFilters ? `
              <button type="button" id="consolidatedEmptyResetBtn" class="btn primary small" style="border-radius:999px;">Limpar Filtros</button>
            ` : ''}
          </div>
        </div>
      `;
    } else {
      // Montagem completa do Dashboard V2 em 3 Níveis
      container.innerHTML = `
        <div class="consolidated-dashboard-view" id="consolidatedDashboardView">
          ${filtersHtml}
          ${heroHtml}
          ${contextHtml}
          ${analysisSectionsHtml}
        </div>
      `;
    }

    // Inicialização das seções expansíveis de Nível 3 (iniciam collapsed, SEM storageKey)
    if (typeof window.initExpandableSection === 'function') {
      const catSec = container.querySelector('#dashCategorySection');
      const destSec = container.querySelector('#dashDestinationSection');
      const matrixSec = container.querySelector('#dashMatrixSection');
      if (catSec) window.initExpandableSection(catSec, { defaultExpanded: false });
      if (destSec) window.initExpandableSection(destSec, { defaultExpanded: false });
      if (matrixSec) window.initExpandableSection(matrixSec, { defaultExpanded: false });
    }

    // Se a projeção da competência atual ainda não estiver carregada, busca via Calendar API
    if (!currentProjectionData || projectionYear !== year || projectionMonth !== month) {
      loadDashboardProjection(year, month);
    }

    attachConsolidatedListeners(container);
  }

  /**
   * Navega para o mês anterior tratando mudança de ano
   */
  function prevMonth() {
    currentProjectionData = null;
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
      render('tab-dashboard');
    } else {
      renderConsolidatedDashboardTab();
    }
  }

  /**
   * Navega para o próximo mês tratando mudança de ano
   */
  function nextMonth() {
    currentProjectionData = null;
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
      render('tab-dashboard');
    } else {
      renderConsolidatedDashboardTab();
    }
  }

  /**
   * Retorna para a competência do mês e ano atuais
   */
  function goToCurrentMonth() {
    currentProjectionData = null;
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
      render('tab-dashboard');
    } else {
      renderConsolidatedDashboardTab();
    }
  }

  /**
   * Vincula listeners dos controles locais (filtros, navegação e drill-down)
   */
  function attachConsolidatedListeners(container) {
    // Busca rápida
    const searchInput = container.querySelector('#consolidatedSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        localFilters.search = searchInput.value;
        renderConsolidatedDashboardTab();
      });
    }

    // Filtro de Status
    const statusSelect = container.querySelector('#consolidatedStatusFilter');
    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        localFilters.status = statusSelect.value;
        renderConsolidatedDashboardTab();
      });
    }

    // Filtro de Categoria
    const catSelect = container.querySelector('#consolidatedCategoryFilter');
    if (catSelect) {
      catSelect.addEventListener('change', () => {
        localFilters.category = catSelect.value;
        renderConsolidatedDashboardTab();
      });
    }

    // Filtro de Destino
    const destSelect = container.querySelector('#consolidatedDestFilter');
    if (destSelect) {
      destSelect.addEventListener('change', () => {
        localFilters.destination = destSelect.value;
        renderConsolidatedDashboardTab();
      });
    }

    // Filtro de Origem
    const sourceSelect = container.querySelector('#consolidatedSourceFilter');
    if (sourceSelect) {
      sourceSelect.addEventListener('change', () => {
        localFilters.sourceType = sourceSelect.value;
        renderConsolidatedDashboardTab();
      });
    }

    // Limpar Filtros
    const clearBtn = container.querySelector('#consolidatedClearFiltersBtn') || container.querySelector('#consolidatedEmptyResetBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        localFilters.search = '';
        localFilters.status = 'all';
        localFilters.category = 'all';
        localFilters.destination = 'all';
        localFilters.sourceType = 'all';
        renderConsolidatedDashboardTab();
      });
    }

    // Accordions de Categoria
    container.querySelectorAll('[data-toggle-cat]').forEach(el => {
      el.addEventListener('click', () => {
        const catName = el.getAttribute('data-toggle-cat');
        if (catName) {
          expandedAccordions.categories[catName] = !expandedAccordions.categories[catName];
          renderConsolidatedDashboardTab();
        }
      });
    });

    // Accordions de Destino
    container.querySelectorAll('[data-toggle-dest]').forEach(el => {
      el.addEventListener('click', () => {
        const destName = el.getAttribute('data-toggle-dest');
        if (destName) {
          expandedAccordions.destinations[destName] = !expandedAccordions.destinations[destName];
          renderConsolidatedDashboardTab();
        }
      });
    });

    // CTA: Ver calendário
    const calBtn = container.querySelector('#dashGoToCalendarBtn');
    if (calBtn) {
      calBtn.addEventListener('click', () => {
        if (typeof window.activateTab === 'function') {
          window.activateTab('tab-calendar', true);
        } else if (typeof window.uiShell?.activateTab === 'function') {
          window.uiShell.activateTab('tab-calendar', true);
        }
      });
    }
  }

  // APIs Públicas do Módulo de Dashboard Consolidado
  window.ConsolidatedDashboardModule = {
    buildConsolidatedDataset,
    filterConsolidatedDataset,
    aggregateByCategory,
    aggregateByDestination,
    buildCategoryDestinationMatrix,
    renderConsolidatedDashboardTab,
    prevMonth,
    nextMonth,
    goToCurrentMonth,
    getLocalFilters: () => Object.assign({}, localFilters),
    setLocalFilters: (newFilters) => { Object.assign(localFilters, newFilters); }
  };

  window.buildConsolidatedDataset = buildConsolidatedDataset;
  window.filterConsolidatedDataset = filterConsolidatedDataset;
  window.aggregateByCategory = aggregateByCategory;
  window.aggregateByDestination = aggregateByDestination;
  window.buildCategoryDestinationMatrix = buildCategoryDestinationMatrix;
  window.renderConsolidatedDashboardTab = renderConsolidatedDashboardTab;

})();
