/* ==========================================================================
   CALENDÁRIO FINANCEIRO — MÓDULO WEB (calendar.js)
   Fundação Web / Lote C1
   ========================================================================== */

(function () {
  'use strict';

  const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Estado Local Explícito do Calendário
  let selectedYear = null;
  let selectedMonth = null;
  let selectedDate = undefined; // Data civil selecionada YYYY-MM-DD
  let currentProjection = null;
  let isLoading = false;
  let hasError = false;
  let errorMessage = '';
  let activeRequestId = 0;
  let activeAbortController = null;
  let isEventsBound = false;

  // Estado Local de Seções Secundárias Expansíveis do Calendário (UX1.4)
  let calendarExpandableState = {
    undatedExpanded: true,
    benefitsExpanded: true
  };

  const SOURCE_TYPE_LABELS = {
    fixed_expense: 'Despesa fixa',
    variable_expense: 'Despesa variável',
    extra_income: 'Renda extra',
    debtor_receivable: 'Valor a receber',
    salary: 'Salário',
    benefit_transaction: 'Movimentação de benefício',
    benefit_credit: 'Crédito de benefício'
  };

  /**
   * Helper puro de apresentação: mapeia o sourceType técnico da API
   * para uma descrição amigável ao usuário.
   * Fail-safe: se desconhecido ou não mapeado, retorna "Movimentação" e nunca vaza a chave técnica.
   *
   * @param {string} sourceType
   * @returns {string}
   */
  function getCalendarSourceTypeLabel(sourceType) {
    if (!sourceType || typeof sourceType !== 'string') {
      return 'Movimentação';
    }
    return SOURCE_TYPE_LABELS[sourceType] || 'Movimentação';
  }

  /**
   * Retorna os dias do mês civil considerando anos bissextos.
   */
  function getDaysInMonthCivil(year, month) {
    if (typeof window.getDaysInMonth === 'function') {
      return window.getDaysInMonth(year, month);
    }
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInMonths = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return daysInMonths[month] || 30;
  }

  /**
   * Formata data civil canônica (YYYY-MM-DD).
   */
  function formatCivilDate(year, month, day) {
    if (typeof window.formatCanonicalDate === 'function') {
      return window.formatCanonicalDate(year, month, day);
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /**
   * Calcula o próximo dia civil a partir de YYYY-MM-DD.
   */
  function computeNextCivilDate(dateStr) {
    const parts = String(dateStr || '').trim().split('-');
    let y = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10);
    let d = parseInt(parts[2], 10);

    const maxDays = getDaysInMonthCivil(y, m);
    if (d < maxDays) {
      d += 1;
    } else {
      if (m === 12) {
        y += 1;
        m = 1;
        d = 1;
      } else {
        m += 1;
        d = 1;
      }
    }
    return { date: formatCivilDate(y, m, d), year: y, month: m, day: d };
  }

  /**
   * Calcula o dia civil anterior a partir de YYYY-MM-DD.
   */
  function computePrevCivilDate(dateStr) {
    const parts = String(dateStr || '').trim().split('-');
    let y = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10);
    let d = parseInt(parts[2], 10);

    if (d > 1) {
      d -= 1;
    } else {
      if (m === 1) {
        y -= 1;
        m = 12;
        d = 31;
      } else {
        m -= 1;
        d = getDaysInMonthCivil(y, m);
      }
    }
    return { date: formatCivilDate(y, m, d), year: y, month: m, day: d };
  }

  /**
   * Formata a data selecionada para exibição amigável (ex: "12 de setembro de 2026").
   */
  function formatFriendlyDate(dateStr) {
    if (!dateStr) return '';
    const parts = String(dateStr).trim().split('-');
    if (parts.length !== 3) return dateStr;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const monthName = MONTH_NAMES[m - 1] ? MONTH_NAMES[m - 1].toLowerCase() : '';
    return `${d} de ${monthName} de ${y}`;
  }

  /**
   * Formata a data com mês em maiúsculo (ex: "8 de Setembro de 2026") para títulos (UX1.4).
   */
  function formatFriendlyDateCapitalized(dateStr) {
    if (!dateStr) return '';
    const parts = String(dateStr).trim().split('-');
    if (parts.length !== 3) return dateStr;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const monthName = MONTH_NAMES[m - 1] || '';
    return `${d} de ${monthName} de ${y}`;
  }

  /**
   * Inicializa o estado com o mês/ano civil atual se ainda não estiver definido,
   * e define selectedDate para hoje se estiver visualizando o mês civil atual.
   */
  function initCalendarState() {
    const now = (typeof window.todayYM === 'function')
      ? window.todayYM()
      : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };

    if (selectedYear == null || selectedMonth == null) {
      selectedYear = now.year;
      selectedMonth = now.month;
    }

    if (selectedDate === undefined) {
      const todayStr = (typeof window.getTodayCivilDate === 'function')
        ? window.getTodayCivilDate()
        : new Date().toISOString().slice(0, 10);
      if (selectedYear === now.year && selectedMonth === now.month) {
        selectedDate = todayStr;
      } else {
        selectedDate = null;
      }
    }
  }

  /**
   * Helper puro de apresentação: agrupa os eventos da projeção por data civil (YYYY-MM-DD).
   * Ocorrências sem data (undated) NÃO são incluídas neste agrupamento.
   * Benefícios NÃO são misturados.
   *
   * @param {Array<Object>} events
   * @returns {Object} { [dateString]: { events: [], inflow: number, outflow: number, hasInflow: boolean, hasOutflow: boolean } }
   */
  function groupCalendarEventsByDate(events) {
    const grouped = {};
    if (!Array.isArray(events)) return grouped;

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev || !ev.date) continue;
      const d = String(ev.date).trim();
      if (!grouped[d]) {
        grouped[d] = {
          events: [],
          inflow: 0,
          outflow: 0,
          hasInflow: false,
          hasOutflow: false
        };
      }
      grouped[d].events.push(ev);
      const amt = Number(ev.amount) || 0;
      if (ev.direction === 'inflow') {
        grouped[d].inflow += amt;
        grouped[d].hasInflow = true;
      } else if (ev.direction === 'outflow') {
        grouped[d].outflow += amt;
        grouped[d].hasOutflow = true;
      }
    }
    return grouped;
  }

  /**
   * Formatação de moeda com fallback resiliente.
   */
  function formatCurrency(val) {
    if (typeof window.currency === 'function') {
      return window.currency(val);
    }
    return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Escape HTML defensivo.
   */
  function escapeStr(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  /**
   * Navegação: mês anterior.
   * Se o novo mês não contiver a data selecionada, desmarca (selectedDate = null).
   */
  function previousMonth() {
    initCalendarState();
    if (selectedMonth === 1) {
      selectedMonth = 12;
      selectedYear -= 1;
    } else {
      selectedMonth -= 1;
    }
    if (selectedDate) {
      const parts = selectedDate.split('-');
      const sY = parseInt(parts[0], 10);
      const sM = parseInt(parts[1], 10);
      if (sY !== selectedYear || sM !== selectedMonth) {
        selectedDate = null;
      }
    }
    loadCalendarData();
  }

  /**
   * Navegação: próximo mês.
   * Se o novo mês não contiver a data selecionada, desmarca (selectedDate = null).
   */
  function nextMonth() {
    initCalendarState();
    if (selectedMonth === 12) {
      selectedMonth = 1;
      selectedYear += 1;
    } else {
      selectedMonth += 1;
    }
    if (selectedDate) {
      const parts = selectedDate.split('-');
      const sY = parseInt(parts[0], 10);
      const sM = parseInt(parts[1], 10);
      if (sY !== selectedYear || sM !== selectedMonth) {
        selectedDate = null;
      }
    }
    loadCalendarData();
  }

  /**
   * Ação: "Hoje" (retorna para a competência civil atual e seleciona a data civil de hoje).
   */
  function goToToday() {
    const now = (typeof window.todayYM === 'function')
      ? window.todayYM()
      : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
    selectedYear = now.year;
    selectedMonth = now.month;
    const todayStr = (typeof window.getTodayCivilDate === 'function')
      ? window.getTodayCivilDate()
      : new Date().toISOString().slice(0, 10);
    selectedDate = todayStr;
    loadCalendarData();
  }

  /**
   * Seleciona uma data civil específica no formato YYYY-MM-DD.
   */
  function selectDate(dateStr) {
    if (!dateStr) return;
    const cleanStr = String(dateStr).trim();
    selectedDate = cleanStr;

    // Se a data selecionada for de outro mês/ano, atualiza e carrega a projeção
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (y !== selectedYear || m !== selectedMonth) {
        selectedYear = y;
        selectedMonth = m;
        loadCalendarData();
        return;
      }
    }

    renderCalendarUI();
  }

  /**
   * Navega para o dia anterior usando data civil. Atravessa competências chamando a API se o mês mudar.
   */
  function previousDay() {
    initCalendarState();
    const baseDate = selectedDate || formatCivilDate(selectedYear, selectedMonth, 1);
    const target = computePrevCivilDate(baseDate);
    selectedDate = target.date;

    if (target.year !== selectedYear || target.month !== selectedMonth) {
      selectedYear = target.year;
      selectedMonth = target.month;
      loadCalendarData();
    } else {
      renderCalendarUI();
    }
  }

  /**
   * Navega para o próximo dia usando data civil. Atravessa competências chamando a API se o mês mudar.
   */
  function nextDay() {
    initCalendarState();
    const baseDate = selectedDate || formatCivilDate(selectedYear, selectedMonth, 1);
    const target = computeNextCivilDate(baseDate);
    selectedDate = target.date;

    if (target.year !== selectedYear || target.month !== selectedMonth) {
      selectedYear = target.year;
      selectedMonth = target.month;
      loadCalendarData();
    } else {
      renderCalendarUI();
    }
  }

  /**
   * Carrega os dados da API com proteção contra concorrência e respostas fora de ordem (stale requests).
   */
  async function loadCalendarData() {
    initCalendarState();
    const reqId = ++activeRequestId;

    if (activeAbortController) {
      try { activeAbortController.abort(); } catch (_) {}
    }
    activeAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;

    isLoading = true;
    hasError = false;
    errorMessage = '';
    currentProjection = null; // Não preserva dados do mês anterior durante nova requisição
    renderCalendarUI();

    try {
      const yearParam = selectedYear;
      const monthParam = selectedMonth;
      let res = null;

      if (window.API && typeof window.API.getCalendarProjection === 'function') {
        res = await window.API.getCalendarProjection(yearParam, monthParam, { signal: activeAbortController?.signal });
      } else if (window.API && typeof window.API.get === 'function') {
        res = await window.API.get(`/api/finances/calendar?year=${encodeURIComponent(yearParam)}&month=${encodeURIComponent(monthParam)}`, { signal: activeAbortController?.signal });
      } else {
        const fetchUrl = (window.API && typeof window.API.resolveUrl === 'function')
          ? window.API.resolveUrl(`/api/finances/calendar?year=${encodeURIComponent(yearParam)}&month=${encodeURIComponent(monthParam)}`)
          : `/api/finances/calendar?year=${encodeURIComponent(yearParam)}&month=${encodeURIComponent(monthParam)}`;
        const r = await fetch(fetchUrl, { credentials: 'same-origin', signal: activeAbortController?.signal });
        res = await r.json();
      }

      // Se outra requisição foi disparada depois desta, descarta esta resposta antiga
      if (reqId !== activeRequestId) {
        return;
      }

      if (!res || res.success === false || res.error) {
        hasError = true;
        errorMessage = res?.message || 'Não foi possível carregar o calendário financeiro.';
        currentProjection = null;
      } else {
        currentProjection = res;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (reqId !== activeRequestId) return;
      hasError = true;
      errorMessage = 'Erro de comunicação ao carregar a projeção do calendário.';
      currentProjection = null;
    } finally {
      if (reqId === activeRequestId) {
        isLoading = false;
        renderCalendarUI();
      }
    }
  }

  /**
   * Renderização local e controlada da interface do Calendário.
   */
  function renderCalendarUI() {
    const container = document.getElementById('tab-calendar');
    if (!container) return;

    initCalendarState();

    const monthLabel = MONTH_NAMES[(selectedMonth || 1) - 1] || 'Mês';
    const periodTitle = `${monthLabel} de ${selectedYear}`;

    // 1. Resumo financeiro do mês (usando payload oficial summary da API)
    const summary = currentProjection?.summary || { inflow: 0, outflow: 0, net: 0 };
    const netClass = summary.net > 0 ? 'calendar-summary-value--net-pos' : (summary.net < 0 ? 'calendar-summary-value--net-neg' : '');

    // 2. Estado de Conteúdo do Calendário (Loading, Error, Grid)
    let bodyHtml = '';

    if (isLoading) {
      bodyHtml = `
        <div class="calendar-state-box" role="status" aria-busy="true" aria-live="polite">
          <div class="calendar-spinner"></div>
          <h3 class="calendar-state-title">Carregando Calendário...</h3>
          <p class="calendar-state-desc">Obtendo projeção financeira de ${escapeStr(periodTitle)}.</p>
        </div>
      `;
    } else if (hasError) {
      bodyHtml = `
        <div class="calendar-state-box" role="alert">
          <div class="calendar-state-icon" style="color:var(--danger); background:var(--danger-soft);">
            <svg class="svg-icon" viewBox="0 0 24 24" style="width:24px;height:24px;stroke:currentColor;fill:none;stroke-width:2;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h3 class="calendar-state-title">Erro ao carregar calendário</h3>
          <p class="calendar-state-desc">${escapeStr(errorMessage)}</p>
          <button type="button" class="btn primary small" id="calendarRetryBtn">Tentar novamente</button>
        </div>
      `;
    } else {
      // Montagem da grade mensal civil
      const events = currentProjection?.events || [];
      const undated = currentProjection?.undated || [];
      const eventsByDate = groupCalendarEventsByDate(events);

      const totalDays = (typeof window.getDaysInMonth === 'function')
        ? window.getDaysInMonth(selectedYear, selectedMonth)
        : new Date(selectedYear, selectedMonth, 0).getDate();

      const firstDayWeekday = new Date(selectedYear, selectedMonth - 1, 1).getDay(); // 0 = Domingo, 6 = Sábado
      const todayStr = (typeof window.getTodayCivilDate === 'function')
        ? window.getTodayCivilDate()
        : new Date().toISOString().slice(0, 10);

      let weekdaysHeaderHtml = '<div class="calendar-weekdays-row">';
      for (const wd of WEEKDAY_NAMES) {
        weekdaysHeaderHtml += `<div class="calendar-weekday-cell">${wd}</div>`;
      }
      weekdaysHeaderHtml += '</div>';

      let daysGridHtml = '<div class="calendar-days-grid">';

      // Células em branco anteriores ao dia 1
      for (let i = 0; i < firstDayWeekday; i++) {
        daysGridHtml += '<div class="calendar-day-cell calendar-day-cell--empty" aria-hidden="true"></div>';
      }

      // Células dos dias do mês (1..totalDays)
      for (let d = 1; d <= totalDays; d++) {
        const dateStr = formatCivilDate(selectedYear, selectedMonth, d);

        const isToday = (dateStr === todayStr);
        const isSelected = (dateStr === selectedDate);
        const dayData = eventsByDate[dateStr];
        const hasInflow = !!(dayData && dayData.hasInflow);
        const hasOutflow = !!(dayData && dayData.hasOutflow);

        let mobileIndHtml = '';
        if (hasInflow && hasOutflow) {
          mobileIndHtml = '<span class="calendar-day-mobile-indicator calendar-day-mobile-indicator--both" aria-hidden="true">+-</span>';
        } else if (hasInflow) {
          mobileIndHtml = '<span class="calendar-day-mobile-indicator calendar-day-mobile-indicator--inflow" aria-hidden="true">+</span>';
        } else if (hasOutflow) {
          mobileIndHtml = '<span class="calendar-day-mobile-indicator calendar-day-mobile-indicator--outflow" aria-hidden="true">-</span>';
        }

        let movementsHtml = '';
        if (hasInflow || hasOutflow) {
          movementsHtml = '<div class="calendar-day-movements">';
          if (hasInflow) {
            movementsHtml += `<span class="calendar-day-amt calendar-day-amt--inflow">+ ${formatCurrency(dayData.inflow)}</span>`;
          }
          if (hasOutflow) {
            movementsHtml += `<span class="calendar-day-amt calendar-day-amt--outflow">- ${formatCurrency(dayData.outflow)}</span>`;
          }
          movementsHtml += '</div>';
        }

        const ariaLabel = `Dia ${d} de ${monthLabel}, ${hasInflow ? 'entradas previstas, ' : ''}${hasOutflow ? 'saídas previstas' : 'sem movimentações agendadas'}`;
        const selectedClasses = isSelected ? 'calendar-day--selected calendar-day-cell--selected' : '';

        daysGridHtml += `
          <button type="button" class="calendar-day-cell ${isToday ? 'calendar-day-cell--today' : ''} ${selectedClasses} ${hasInflow ? 'has-inflow' : ''} ${hasOutflow ? 'has-outflow' : ''}" id="calendar-day-${dateStr}" data-date="${dateStr}" aria-selected="${isSelected ? 'true' : 'false'}" aria-label="${ariaLabel}">
            <div class="calendar-day-header">
              <span class="calendar-day-number">${d}</span>
            </div>
            ${movementsHtml}
            ${mobileIndHtml}
          </button>
        `;
      }

      // Células em branco posteriores para completar a grade de 7 colunas
      const trailingCount = (7 - ((firstDayWeekday + totalDays) % 7)) % 7;
      for (let i = 0; i < trailingCount; i++) {
        daysGridHtml += '<div class="calendar-day-cell calendar-day-cell--empty" aria-hidden="true"></div>';
      }

      daysGridHtml += '</div>';

      // Painel simples de detalhes/resumo do dia selecionado (C1.1)
      let selectedDayPanelHtml = '';
      if (selectedDate) {
        const dayData = eventsByDate[selectedDate] || {
          events: [],
          inflow: 0,
          outflow: 0,
          hasInflow: false,
          hasOutflow: false
        };
        const dayInflow = dayData.inflow || 0;
        const dayOutflow = dayData.outflow || 0;
        const dayNet = Math.round((dayInflow - dayOutflow) * 100) / 100;
        const dayNetClass = dayNet > 0 ? 'calendar-summary-value--net-pos' : (dayNet < 0 ? 'calendar-summary-value--net-neg' : '');

        let dayOccurrencesHtml = '';
        if (dayData.events && dayData.events.length > 0) {
          const totalEventsCount = dayData.events.length;
          const previewEvents = dayData.events.slice(0, 5);
          let itemsHtml = '';
          for (const ev of previewEvents) {
            const evDesc = ev.description || 'Movimentação';
            const evSourceTypeLabel = getCalendarSourceTypeLabel(ev.sourceType);
            const evAmount = formatCurrency(ev.amount);
            const evDirClass = ev.direction === 'inflow' ? 'calendar-summary-value--inflow' : 'calendar-summary-value--outflow';
            const evDirSign = ev.direction === 'inflow' ? '+' : '-';
            const statusBadge = ev.status
              ? `<span class="tag ${ev.status === 'paid' ? 'success' : (ev.status === 'partial' ? 'partial' : 'due')}">${ev.status === 'paid' ? 'Pago' : (ev.status === 'partial' ? 'Parcial' : 'Pendente')}</span>`
              : '';

            itemsHtml += `
              <div class="calendar-day-detail-item">
                <div class="calendar-day-detail-info">
                  <span class="calendar-day-detail-desc">${escapeStr(evDesc)}</span>
                  <span class="calendar-day-detail-meta">${escapeStr(evSourceTypeLabel)}</span>
                </div>
                <div class="calendar-day-detail-value-wrap">
                  ${statusBadge}
                  <span class="calendar-day-detail-amt ${evDirClass}">${evDirSign} ${evAmount}</span>
                </div>
              </div>
            `;
          }

          let ctaHtml = '';
          if (totalEventsCount > 5) {
            ctaHtml = `
              <div class="calendar-day-preview-footer">
                <button type="button" class="btn soft small full-width" id="calendarOpenDayDetailsBtn" data-date="${selectedDate}" aria-label="Ver todas as ${totalEventsCount} movimentações" style="width:100%; font-weight:750; font-size:0.82rem; padding:8px 12px; border-radius:10px; display:flex; align-items:center; justify-content:center; gap:6px;">
                  Ver todas as ${totalEventsCount} movimentações
                </button>
              </div>
            `;
          }

          dayOccurrencesHtml = `
            <div class="calendar-selected-day-list-header" style="display:flex; align-items:center; justify-content:space-between; margin:14px 0 8px;">
              <span style="font-size:0.78rem; font-weight:800; color:var(--text); text-transform:uppercase; letter-spacing:0.04em;">Movimentações</span>
              <span class="badge info" style="font-size:0.70rem; padding:2px 7px;">${totalEventsCount}</span>
            </div>
            <div class="calendar-selected-day-list">${itemsHtml}</div>
            ${ctaHtml}
          `;
        } else {
          dayOccurrencesHtml = `
            <div class="calendar-selected-day-empty">
              <p class="calendar-state-desc">Nenhuma movimentação financeira prevista para este dia.</p>
            </div>
          `;
        }

        selectedDayPanelHtml = `
          <section class="calendar-selected-day-panel" aria-labelledby="calendarSelectedDayTitle" id="calendarSelectedDayPanel">
            <div class="calendar-selected-day-header">
              <div class="calendar-selected-day-title-wrap">
                <h3 class="calendar-selected-day-title" id="calendarSelectedDayTitle">${escapeStr(formatFriendlyDate(selectedDate))}</h3>
              </div>
              <div class="calendar-selected-day-nav">
                <button type="button" class="calendar-day-nav-btn" id="calendarPrevDayBtn" aria-label="Dia anterior">
                  <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5;"><polyline points="15 18 9 12 15 6"/></svg>
                  Dia anterior
                </button>
                <button type="button" class="calendar-day-nav-btn" id="calendarNextDayBtn" aria-label="Próximo dia">
                  Próximo dia
                  <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5;"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>

            <div class="calendar-selected-day-summary">
              <div class="calendar-day-summary-card">
                <span class="calendar-day-summary-label">Entradas previstas</span>
                <span class="calendar-day-summary-val calendar-summary-value--inflow">${formatCurrency(dayInflow)}</span>
              </div>
              <div class="calendar-day-summary-card">
                <span class="calendar-day-summary-label">Saídas previstas</span>
                <span class="calendar-day-summary-val calendar-summary-value--outflow">${formatCurrency(dayOutflow)}</span>
              </div>
              <div class="calendar-day-summary-card">
                <span class="calendar-day-summary-label">Resultado do dia</span>
                <span class="calendar-day-summary-val ${dayNetClass}">${formatCurrency(dayNet)}</span>
              </div>
            </div>

            ${dayOccurrencesHtml}
          </section>
        `;
      } else {
        selectedDayPanelHtml = `
          <section class="calendar-selected-day-panel calendar-selected-day-panel--unselected" id="calendarSelectedDayPanel">
            <div class="calendar-selected-day-placeholder">
              <p class="calendar-state-desc">Selecione um dia no calendário para ver o resumo e as movimentações.</p>
            </div>
          </section>
        `;
      }

      // Empty state discreto se não houver ocorrências nem undated no mês
      let emptyNoteHtml = '';
      if (events.length === 0 && undated.length === 0) {
        emptyNoteHtml = `
          <div class="calendar-state-box" style="margin-top:16px; padding:24px 16px;">
            <p class="calendar-state-desc">Nenhuma movimentação financeira prevista para ${escapeStr(periodTitle)}.</p>
          </div>
        `;
      }

      // Seção "Sem data definida" (undated) — com labels amigáveis e padrão expansível (UX1)
      let undatedSectionHtml = '';
      if (undated && undated.length > 0) {
        let undatedItemsHtml = '<div class="calendar-undated-list">';
        for (const u of undated) {
          const uAmount = formatCurrency(u.amount);
          const uDirectionClass = u.direction === 'inflow' ? 'calendar-summary-value--inflow' : 'calendar-summary-value--outflow';
          const uDirectionSign = u.direction === 'inflow' ? '+' : '-';
          const uDesc = u.description || u.name || 'Lançamento sem data';
          const statusBadge = u.status
            ? `<span class="tag ${u.status === 'paid' ? 'success' : (u.status === 'partial' ? 'partial' : 'due')}">${u.status === 'paid' ? 'Pago' : (u.status === 'partial' ? 'Parcial' : 'Pendente')}</span>`
            : '';

          undatedItemsHtml += `
            <div class="calendar-undated-item">
              <div class="calendar-undated-info">
                <span class="calendar-undated-desc">${escapeStr(uDesc)}</span>
                <span class="calendar-undated-meta">${escapeStr(getCalendarSourceTypeLabel(u.sourceType))}</span>
              </div>
              <div class="calendar-undated-value-wrap">
                ${statusBadge}
                <span class="calendar-undated-amt ${uDirectionClass}">${uDirectionSign} ${uAmount}</span>
              </div>
            </div>
          `;
        }
        undatedItemsHtml += '</div>';

        const isUndatedOpen = !!calendarExpandableState.undatedExpanded;

        undatedSectionHtml = `
          <section class="calendar-undated-section expandable-section ${isUndatedOpen ? 'is-expanded' : 'is-collapsed'}" id="calendarUndatedSection" data-expandable aria-labelledby="calendarUndatedTitle">
            <button type="button" class="expandable-section__header" id="calendarUndatedToggleBtn" aria-expanded="${isUndatedOpen ? 'true' : 'false'}" aria-controls="calendarUndatedContent">
              <div class="expandable-section__title-group">
                <span class="expandable-section__chevron" aria-hidden="true">
                  <svg class="svg-icon" viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;"><polyline points="9 18 15 12 9 6"/></svg>
                </span>
                <div class="expandable-section__titles">
                  <h3 class="calendar-section-title expandable-section__title" id="calendarUndatedTitle">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="width:18px;height:18px;stroke:var(--warning);fill:none;stroke-width:2;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
                    Sem data definida
                  </h3>
                </div>
              </div>
              <div class="expandable-section__meta">
                <span class="badge warning" id="calendarUndatedCountBadge" style="font-size:0.78rem; font-weight:800; padding:2px 8px;">${undated.length}</span>
              </div>
            </button>
            <div class="expandable-section__content expandable-section__content--scrollable" id="calendarUndatedContent" ${isUndatedOpen ? '' : 'hidden'}>
              ${undatedItemsHtml}
            </div>
          </section>
        `;
      }

      // Seção de Benefícios (estritamente segregada do fluxo bancário e com padrão expansível UX1)
      let benefitsSectionHtml = '';
      const bSummary = currentProjection?.benefits?.summary || { inflow: 0, outflow: 0, net: 0 };
      const bEvents = currentProjection?.benefits?.events || [];
      const bUndated = currentProjection?.benefits?.undated || [];
      const hasBenefitsData = bSummary.inflow > 0 || bSummary.outflow > 0 || bEvents.length > 0 || bUndated.length > 0;

      if (hasBenefitsData) {
        let bEventsHtml = '';
        if (bEvents.length > 0 || bUndated.length > 0) {
          bEventsHtml = '<div class="calendar-benefits-list" style="margin-top:10px;">';
          for (const be of bEvents) {
            bEventsHtml += `
              <div class="calendar-benefits-item">
                <span>${escapeStr(be.description || 'Gasto Benefício')} <small style="color:var(--text-muted);">(${be.date || 'datado'})</small></span>
                <strong style="color:var(--danger);">- ${formatCurrency(be.amount)}</strong>
              </div>
            `;
          }
          for (const bu of bUndated) {
            bEventsHtml += `
              <div class="calendar-benefits-item">
                <span>${escapeStr(bu.name || bu.description || 'Crédito Benefício')} <small style="color:var(--text-muted);">(mensal)</small></span>
                <strong style="color:var(--success);">+ ${formatCurrency(bu.amount)}</strong>
              </div>
            `;
          }
          bEventsHtml += '</div>';
        }

        const isBenefitsOpen = !!calendarExpandableState.benefitsExpanded;

        benefitsSectionHtml = `
          <section class="calendar-benefits-section expandable-section ${isBenefitsOpen ? 'is-expanded' : 'is-collapsed'}" id="calendarBenefitsSection" data-expandable aria-labelledby="calendarBenefitsTitle">
            <button type="button" class="expandable-section__header" id="calendarBenefitsToggleBtn" aria-expanded="${isBenefitsOpen ? 'true' : 'false'}" aria-controls="calendarBenefitsContent">
              <div class="expandable-section__title-group">
                <span class="expandable-section__chevron" aria-hidden="true">
                  <svg class="svg-icon" viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;"><polyline points="9 18 15 12 9 6"/></svg>
                </span>
                <div class="expandable-section__titles">
                  <h3 class="calendar-section-title expandable-section__title" id="calendarBenefitsTitle">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="width:18px;height:18px;stroke:var(--warning);fill:none;stroke-width:2;"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>
                    Benefícios do mês (Segregados)
                  </h3>
                </div>
              </div>
              <div class="expandable-section__meta">
                <span class="badge soft" id="calendarBenefitsNetBadge" style="font-size:0.78rem; font-weight:700;">${formatCurrency(bSummary.net)}</span>
              </div>
            </button>
            <div class="expandable-section__content expandable-section__content--scrollable" id="calendarBenefitsContent" ${isBenefitsOpen ? '' : 'hidden'}>
              <div class="calendar-benefits-grid">
                <div class="calendar-benefits-card">
                  <div class="calendar-summary-label">Entrada Benefícios</div>
                  <div class="calendar-summary-value calendar-summary-value--inflow">${formatCurrency(bSummary.inflow)}</div>
                </div>
                <div class="calendar-benefits-card">
                  <div class="calendar-summary-label">Saída Benefícios</div>
                  <div class="calendar-summary-value calendar-summary-value--outflow">${formatCurrency(bSummary.outflow)}</div>
                </div>
                <div class="calendar-benefits-card">
                  <div class="calendar-summary-label">Resultado Benefícios</div>
                  <div class="calendar-summary-value">${formatCurrency(bSummary.net)}</div>
                </div>
              </div>
              ${bEventsHtml}
            </div>
          </section>
        `;
      }

      bodyHtml = `
        <div class="calendar-main-layout">
          <div class="calendar-month-section">
            <div class="calendar-grid-card">
              ${weekdaysHeaderHtml}
              ${daysGridHtml}
            </div>
            ${emptyNoteHtml}
          </div>
          <aside class="calendar-day-panel" aria-label="Painel do dia selecionado">
            ${selectedDayPanelHtml}
          </aside>
        </div>
        ${undatedSectionHtml}
        ${benefitsSectionHtml}
      `;
    }

    container.innerHTML = `
      <div class="calendar-page-container">
        <!-- BARRA SUPERIOR DE NAVEGAÇÃO TEMPORAL -->
        <header class="calendar-top-bar" role="toolbar" aria-label="Navegação do Calendário">
          <div class="calendar-period-display">
            <h2 class="calendar-period-title" id="calendarPeriodTitle">${escapeStr(periodTitle)}</h2>
          </div>
          <div class="calendar-nav-controls">
            <button type="button" class="calendar-nav-btn" id="calendarPrevMonthBtn" aria-label="Mês anterior" data-tooltip="Mês anterior">
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.5;"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button type="button" class="calendar-today-btn" id="calendarTodayBtn" aria-label="Ir para o mês civil atual">
              Hoje
            </button>
            <button type="button" class="calendar-nav-btn" id="calendarNextMonthBtn" aria-label="Próximo mês" data-tooltip="Próximo mês">
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.5;"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </header>

        <!-- RESUMO MENSAL OFICIAL DA PROJEÇÃO -->
        <section class="calendar-summary-cards" aria-label="Resumo do mês">
          <div class="calendar-summary-card">
            <span class="calendar-summary-label">Resultado do mês</span>
            <span class="calendar-summary-value ${netClass}">${formatCurrency(summary.net)}</span>
          </div>
          <div class="calendar-summary-card">
            <span class="calendar-summary-label">Entradas previstas</span>
            <span class="calendar-summary-value calendar-summary-value--inflow">${formatCurrency(summary.inflow)}</span>
          </div>
          <div class="calendar-summary-card">
            <span class="calendar-summary-label">Saídas previstas</span>
            <span class="calendar-summary-value calendar-summary-value--outflow">${formatCurrency(summary.outflow)}</span>
          </div>
        </section>

        <!-- CORPO DO CALENDÁRIO (LOADING / ERRO / GRADE) -->
        ${bodyHtml}
      </div>
    `;

    bindCalendarEvents(container);
  }

  /**
   * Vincula ouvintes de eventos da interface do calendário.
   */
  function bindCalendarEvents(container) {
    const prevBtn = container.querySelector('#calendarPrevMonthBtn');
    if (prevBtn) {
      prevBtn.onclick = (e) => {
        e.preventDefault();
        previousMonth();
      };
    }

    const nextBtn = container.querySelector('#calendarNextMonthBtn');
    if (nextBtn) {
      nextBtn.onclick = (e) => {
        e.preventDefault();
        nextMonth();
      };
    }

    const todayBtn = container.querySelector('#calendarTodayBtn');
    if (todayBtn) {
      todayBtn.onclick = (e) => {
        e.preventDefault();
        goToToday();
      };
    }

    const retryBtn = container.querySelector('#calendarRetryBtn');
    if (retryBtn) {
      retryBtn.onclick = (e) => {
        e.preventDefault();
        loadCalendarData();
      };
    }

    const prevDayBtn = container.querySelector('#calendarPrevDayBtn');
    if (prevDayBtn) {
      prevDayBtn.onclick = (e) => {
        e.preventDefault();
        previousDay();
      };
    }

    const nextDayBtn = container.querySelector('#calendarNextDayBtn');
    if (nextDayBtn) {
      nextDayBtn.onclick = (e) => {
        e.preventDefault();
        nextDay();
      };
    }

    // Vincula cliques nas células de dias por querySelectorAll ou IDs diretos
    const dayBtns = container.querySelectorAll('.calendar-day-cell[data-date]');
    if (dayBtns && dayBtns.length > 0) {
      for (let i = 0; i < dayBtns.length; i++) {
        const btn = dayBtns[i];
        btn.onclick = (e) => {
          e.preventDefault();
          const d = btn.getAttribute('data-date');
          if (d) selectDate(d);
        };
      }
    }

    // Suporte complementar para mock DOMs que resolvem apenas por ID
    const totalDays = getDaysInMonthCivil(selectedYear || 2026, selectedMonth || 9);
    for (let d = 1; d <= totalDays; d++) {
      const dStr = formatCivilDate(selectedYear || 2026, selectedMonth || 9, d);
      const cell = container.querySelector(`#calendar-day-${dStr}`);
      if (cell && !cell.onclick) {
        cell.onclick = (e) => {
          e?.preventDefault?.();
          selectDate(dStr);
        };
      }
    }

    // Botão CTA para abrir modal de detalhes completos do dia (UX1.4)
    const openDayDetailsBtn = container.querySelector('#calendarOpenDayDetailsBtn');
    if (openDayDetailsBtn) {
      openDayDetailsBtn.onclick = (e) => {
        e.preventDefault();
        const d = openDayDetailsBtn.getAttribute('data-date') || selectedDate;
        openDayDetailsModal(d);
      };
    }

    // Inicialização idempotente das seções secundárias expansíveis do Calendário (UX1)
    if (typeof window.initExpandableSection === 'function') {
      const undatedSec = container.querySelector('#calendarUndatedSection');
      if (undatedSec) {
        window.initExpandableSection(undatedSec, {
          defaultExpanded: calendarExpandableState.undatedExpanded,
          onToggle: (exp) => { calendarExpandableState.undatedExpanded = exp; }
        });
      }
      const benefitsSec = container.querySelector('#calendarBenefitsSection');
      if (benefitsSec) {
        window.initExpandableSection(benefitsSec, {
          defaultExpanded: calendarExpandableState.benefitsExpanded,
          onToggle: (exp) => { calendarExpandableState.benefitsExpanded = exp; }
        });
      }
    }
  }

  /**
   * Abre o modal com detalhamento completo das ocorrências do dia (UX1.4).
   * Reutiliza o agrupamento canônico e não recalcula o domínio financeiro.
   *
   * @param {string} [dateStr]
   */
  function openDayDetailsModal(dateStr) {
    const targetDate = dateStr || selectedDate;
    if (!targetDate) return;

    const dialog = document.getElementById('calendarDayDetailsDialog');
    if (!dialog) return;

    const events = currentProjection?.events || [];
    const eventsByDate = groupCalendarEventsByDate(events);
    const dayData = eventsByDate[targetDate] || {
      events: [],
      inflow: 0,
      outflow: 0
    };

    const dayInflow = dayData.inflow || 0;
    const dayOutflow = dayData.outflow || 0;
    const dayNet = Math.round((dayInflow - dayOutflow) * 100) / 100;
    const dayNetClass = dayNet > 0 ? 'calendar-summary-value--net-pos' : (dayNet < 0 ? 'calendar-summary-value--net-neg' : '');

    // Título do modal: "Movimentações de 8 de Setembro de 2026"
    const titleEl = document.getElementById('calendarDayDetailsTitle');
    if (titleEl) {
      titleEl.textContent = `Movimentações de ${formatFriendlyDateCapitalized(targetDate)}`;
    }

    // Resumo: Entradas, Saídas, Resultado
    const summaryEl = document.getElementById('calendarDayDetailsSummary');
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="calendar-day-summary-card">
          <span class="calendar-day-summary-label">Entradas</span>
          <span class="calendar-day-summary-val calendar-summary-value--inflow">${formatCurrency(dayInflow)}</span>
        </div>
        <div class="calendar-day-summary-card">
          <span class="calendar-day-summary-label">Saídas</span>
          <span class="calendar-day-summary-val calendar-summary-value--outflow">${formatCurrency(dayOutflow)}</span>
        </div>
        <div class="calendar-day-summary-card">
          <span class="calendar-day-summary-label">Resultado</span>
          <span class="calendar-day-summary-val ${dayNetClass}">${formatCurrency(dayNet)}</span>
        </div>
      `;
    }

    // Lista completa de todas as N movimentações do dia
    const listEl = document.getElementById('calendarDayDetailsList');
    if (listEl) {
      if (dayData.events && dayData.events.length > 0) {
        let itemsHtml = '';
        for (const ev of dayData.events) {
          const evDesc = ev.description || 'Movimentação';
          const evSourceTypeLabel = getCalendarSourceTypeLabel(ev.sourceType);
          const evAmount = formatCurrency(ev.amount);
          const evDirClass = ev.direction === 'inflow' ? 'calendar-summary-value--inflow' : 'calendar-summary-value--outflow';
          const evDirSign = ev.direction === 'inflow' ? '+' : '-';
          const statusBadge = ev.status
            ? `<span class="tag ${ev.status === 'paid' ? 'success' : (ev.status === 'partial' ? 'partial' : 'due')}">${ev.status === 'paid' ? 'Pago' : (ev.status === 'partial' ? 'Parcial' : 'Pendente')}</span>`
            : '';

          itemsHtml += `
            <div class="calendar-day-detail-item">
              <div class="calendar-day-detail-info">
                <span class="calendar-day-detail-desc">${escapeStr(evDesc)}</span>
                <span class="calendar-day-detail-meta">${escapeStr(evSourceTypeLabel)}</span>
              </div>
              <div class="calendar-day-detail-value-wrap">
                ${statusBadge}
                <span class="calendar-day-detail-amt ${evDirClass}">${evDirSign} ${evAmount}</span>
              </div>
            </div>
          `;
        }
        listEl.innerHTML = itemsHtml;
      } else {
        listEl.innerHTML = `
          <div class="calendar-selected-day-empty">
            <p class="calendar-state-desc">Nenhuma movimentação para esta data.</p>
          </div>
        `;
      }
    }

    const countEl = document.getElementById('calendarDayDetailsCount');
    if (countEl) {
      const total = dayData.events ? dayData.events.length : 0;
      countEl.textContent = `Total: ${total} ${total === 1 ? 'movimentação' : 'movimentações'}`;
    }

    if (typeof dialog.showModal === 'function') {
      try {
        dialog.showModal();
      } catch (e) {
        dialog.setAttribute('open', '');
      }
    } else {
      dialog.setAttribute('open', '');
    }
  }

  /**
   * Fecha o modal de detalhes do dia.
   */
  function closeDayDetailsModal() {
    const dialog = document.getElementById('calendarDayDetailsDialog');
    if (!dialog) return;
    if (typeof dialog.close === 'function') {
      try {
        dialog.close();
      } catch (e) {
        dialog.removeAttribute('open');
      }
    } else {
      dialog.removeAttribute('open');
    }
  }


  /**
   * Ponto de entrada chamado quando a aba do calendário é renderizada / ativada.
   */
  function renderCalendarTab() {
    initCalendarState();
    if (!currentProjection && !isLoading) {
      loadCalendarData();
    } else {
      renderCalendarUI();
    }
  }

  // API pública do módulo
  const CalendarModule = {
    render: renderCalendarTab,
    previousMonth,
    nextMonth,
    goToToday,
    loadCalendarData,
    groupCalendarEventsByDate,
    getCalendarSourceTypeLabel,
    selectDate,
    previousDay,
    nextDay,
    openDayDetailsModal,
    closeDayDetailsModal,
    formatFriendlyDateCapitalized,
    getExpandableState: () => ({ ...calendarExpandableState }),
    setExpandableState: (s = {}) => { Object.assign(calendarExpandableState, s); },
    getState: () => ({
      selectedYear,
      selectedMonth,
      selectedDate,
      currentProjection,
      isLoading,
      hasError,
      errorMessage,
      activeRequestId
    }),
    setState: (newState = {}) => {
      if (newState.selectedYear !== undefined) selectedYear = newState.selectedYear;
      if (newState.selectedMonth !== undefined) selectedMonth = newState.selectedMonth;
      if (newState.selectedDate !== undefined) selectedDate = newState.selectedDate;
      if (newState.currentProjection !== undefined) currentProjection = newState.currentProjection;
      if (newState.isLoading !== undefined) isLoading = newState.isLoading;
      if (newState.hasError !== undefined) hasError = newState.hasError;
      if (newState.errorMessage !== undefined) errorMessage = newState.errorMessage;
    }
  };

  window.CalendarModule = CalendarModule;
  window.renderCalendarTab = renderCalendarTab;
  window.getCalendarSourceTypeLabel = getCalendarSourceTypeLabel;
})();
