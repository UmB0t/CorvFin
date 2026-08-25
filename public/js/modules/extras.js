
/**
 * Módulo de Rendas Extras
 * Finanças Pro
 */

function getState() { return window.state || window.FP_STATE || {}; }
function saveState() { if (typeof window.saveState === 'function') window.saveState(); }
function notify(msg, type = 'info') { if (typeof window.notify === 'function') window.notify(msg, type); }
function currency(val) { return typeof window.currency === 'function' ? window.currency(val) : Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function escapeHtml(str) { return typeof window.escapeHtml === 'function' ? window.escapeHtml(str) : String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function uid() { return typeof window.uid === 'function' ? window.uid() : Math.random().toString(36).slice(2, 10); }
function $(sel) { return document.querySelector(sel); }
function activeExtrasForMonth(year, month) { return window.activeExtrasForMonth ? window.activeExtrasForMonth(year, month) : []; }
function buildEntryRow(props) { return window.buildEntryRow ? window.buildEntryRow(props) : ''; }
function renderSection(a, b, c, d) { if (typeof window.renderSection === 'function') window.renderSection(a, b, c, d); }
function toggleExpenseStatus(type, id, status) { if (typeof window.toggleExpenseStatus === 'function') window.toggleExpenseStatus(type, id, status); }
function ymKey(y, m) { return typeof window.ymKey === 'function' ? window.ymKey(y, m) : `${y}-${String(m).padStart(2, '0')}`; }
function mk(y, m) { return typeof window.mk === 'function' ? window.mk(y, m) : (y * 12 + m); }
const CATEGORY_COLORS = window.CATEGORY_COLORS || ['#1F7A5C', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];
const MONTH_NAMES = window.MONTH_NAMES || ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTH_ABBR = window.MONTH_ABBR || ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

let extraDlgId = null;
let extraDlg = null;
const state = getState();

      function renderExtraIncomeCharts() {
        const grid = $('#extrasChartsGrid');
        const toggleBtn = $('#toggleExtrasChartsBtn');
        const isHidden = state.collapsedSections?.extrasCharts === true;

        if (toggleBtn) toggleBtn.classList.toggle('active', !isHidden);
        if (grid) {
          grid.style.display = isHidden ? 'none' : 'grid';
          if (isHidden) return;
        }

        const originContainer = $('#extrasOriginBars');
        const originBadge = $('#extrasOriginTotalBadge');
        const yearContainer = $('#extrasYearBars');
        const yearBadge = $('#extrasYearTotalBadge');
        const avgSummaryText = $('#extrasAvgSummaryText');
        const totalYearSummaryText = $('#extrasTotalYearSummaryText');

        const curExtras = activeExtrasForMonth(state.year, state.month);
        const curTotal = curExtras.reduce((s, e) => s + Number(e.amount || 0), 0);
        if (originBadge) originBadge.textContent = `Total Mês: ${currency(curTotal)}`;

        // 1. Gráfico por Origem / Remetente
        if (originContainer) {
          const originMap = {};
          curExtras.forEach(e => {
            const org = (e.sender || e.source || e.title || 'Outros').trim();
            originMap[org] = (originMap[org] || 0) + Number(e.amount || 0);
          });

          const originEntries = Object.entries(originMap).sort((a, b) => b[1] - a[1]);
          if (originEntries.length === 0) {
            originContainer.innerHTML = `<div class="empty" style="padding:20px;">Sem rendas extras cadastradas neste mês (${MONTH_ABBR[state.month - 1]}/${state.year}).</div>`;
          } else {
            const maxVal = originEntries[0][1] || 1;
            originContainer.innerHTML = originEntries.map(([org, val], idx) => {
              const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
              const pct = curTotal > 0 ? Math.round((val / curTotal) * 100) : 0;
              const barWidth = Math.round((val / maxVal) * 100);
              return `
                <div class="dest-bar-item" data-tooltip="${escapeHtml(org)}: ${currency(val)} (${pct}%)" style="cursor:default; margin-bottom:6px;">
                  <div style="display:flex; align-items:center; gap:6px; min-width:110px;">
                    <span style="display:inline-block; width:10px; height:10px; border-radius:3px; background:${color}; flex-shrink:0;"></span>
                    <span class="dest-name" style="font-size:.78rem;"><strong>${escapeHtml(org)}</strong></span>
                  </div>
                  <div class="dest-track" style="flex:1;">
                    <div class="dest-fill" style="width:${barWidth}%; background:${color};"></div>
                  </div>
                  <span class="dest-val num" style="font-size:.82rem; font-weight:800;">${currency(val)} <small style="font-size:.68rem; color:var(--muted); font-weight:700;">(${pct}%)</small></span>
                </div>
              `;
            }).join('');
          }
        }

        // 2. Gráfico de Evolução Anual
        if (yearContainer) {
          let yearTotal = 0;
          const monthsData = [];
          for (let m = 1; m <= 12; m++) {
            const mExt = activeExtrasForMonth(state.year, m);
            const mSum = mExt.reduce((s, e) => s + Number(e.amount || 0), 0);
            yearTotal += mSum;
            monthsData.push({ month: m, total: mSum });
          }

          const avg = yearTotal / 12;
          if (yearBadge) yearBadge.textContent = `Total ${state.year}: ${currency(yearTotal)}`;
          if (avgSummaryText) avgSummaryText.textContent = currency(avg);
          if (totalYearSummaryText) totalYearSummaryText.textContent = currency(yearTotal);

          const maxM = Math.max(...monthsData.map(x => x.total), 100);
          yearContainer.innerHTML = monthsData.map(item => {
            const isCur = item.month === state.month;
            const h = item.total > 0 ? Math.max(10, Math.round((item.total / maxM) * 85)) : 4;
            const barColor = isCur ? 'var(--c-extra)' : (item.total > 0 ? 'var(--brand)' : 'var(--line)');
            const tip = `${MONTH_NAMES[item.month - 1]}/${state.year}: ${currency(item.total)}`;
            return `
              <div style="display:flex; flex-direction:column; align-items:center; flex:1; min-width:20px; height:100%; justify-content:flex-end; cursor:pointer;" data-tooltip="${tip}" onclick="window.__selectMonth && window.__selectMonth(${item.month})">
                ${item.total > 0 ? `<span style="font-size:.62rem; font-weight:800; color:var(--brand); margin-bottom:2px;" class="num">${Math.round(item.total)}</span>` : ''}
                <div style="width:100%; max-width:18px; height:${h}px; border-radius:4px 4px 0 0; background:${barColor}; transition:height .2s ease; ${isCur ? 'box-shadow: 0 0 8px var(--c-extra);' : ''}"></div>
                <span style="font-size:.65rem; color:${isCur ? 'var(--brand-strong)' : 'var(--muted)'}; font-weight:${isCur ? '800' : '700'}; margin-top:4px;">${MONTH_ABBR[item.month - 1]}</span>
              </div>
            `;
          }).join('');
        }
      }

      window.__selectMonth = function(m) {
        state.month = m;
        saveState();
        render();
      };

      function updateExtraIncomeCharts() {
        renderExtraIncomeCharts();
      }

      function renderExtrasTab() {
        const y = state.year, m = state.month;
        const rawExtras = activeExtrasForMonth(y, m);
        const totalExtra = rawExtras.reduce((s, e) => s + Number(e.amount), 0);
        const receivedExtra = rawExtras.filter(e => e.status === 'pago').reduce((s, e) => s + Number(e.amount), 0);
        const pendingExtra = totalExtra - receivedExtra;

        $('#extraMetrics').innerHTML = `
      <div class="metric">
        <div class="label">Renda Extra Total (Mês)</div>
        <div class="value num positive">${currency(totalExtra)}</div>
        <div class="sub">Adiciona ao seu salário</div>
      </div>
      <div class="metric">
        <div class="label">Valores Recebidos</div>
        <div class="value num positive">${currency(receivedExtra)}</div>
        <div class="sub">Já pagos pelos remetentes</div>
      </div>
      <div class="metric">
        <div class="label">Valores a Receber</div>
        <div class="value num warning">${currency(pendingExtra)}</div>
        <div class="sub">Pendentes neste mês</div>
      </div>
    `;

        renderExtraIncomeCharts();

        const query = ($('#extrasSearchInput').value || '').toLowerCase().trim();
        const statusFilter = $('#extrasStatusFilter').value;

        const extras = rawExtras.filter(e => {
          if (statusFilter !== 'all' && e.status !== statusFilter) return false;
          if (query) {
            const text = `${e.title} ${e.source} ${e.sender} ${e.description || ''}`.toLowerCase();
            if (!text.includes(query)) return false;
          }
          return true;
        });

        const rows = extras.map(e => buildEntryRow({
          id: e.id, type: 'extra', title: e.title,
          tags: [`Origem: ${e.source}`, `Envia: ${e.sender}`],
          amount: e.amount, status: e.status, destination: 'Renda Extra',
          onClickToggleStatus: () => toggleExpenseStatus('extra', e.id, e.status),
          onClickEdit: () => openExtraDialog('edit', e.id)
        }));

        renderSection('#listExtra', '#sumExtra', rows, extras.reduce((s, e) => s + Number(e.amount), 0));
      }

      $('#extrasSearchInput').addEventListener('input', renderExtrasTab);
      $('#extrasStatusFilter').addEventListener('change', renderExtrasTab);

      const toggleExtrasChartsBtn = $('#toggleExtrasChartsBtn');
      if (toggleExtrasChartsBtn) {
        toggleExtrasChartsBtn.addEventListener('click', () => {
          state.collapsedSections.extrasCharts = !state.collapsedSections.extrasCharts;
          saveState();
          renderExtraIncomeCharts();
        });
      }

      function openExtraDialog(mode, id) {
        $('#extraForm').reset();
        extraDlgId = id || null;
        $('#deleteExtraBtn').hidden = !id;

        if (mode === 'new') {
          $('#extraDialogTitle').textContent = 'Nova Renda Extra';
          const now = new Date();
          const curMonth = state.month || (now.getMonth() + 1);
          const curYear = state.year || now.getFullYear();
          $('#extraStartMonth').value = curMonth; $('#extraStartYear').value = curYear;
          $('#extraEndMonth').value = curMonth; $('#extraEndYear').value = curYear;
          updateExtraInstallments();
        } else {
          const item = state.extras.find(e => e.id === id);
          if (!item) return;
          $('#extraDialogTitle').textContent = 'Editar Renda Extra';
          $('#extraTitle').value = item.title;
          $('#extraSource').value = item.source;
          $('#extraAmount').value = item.amount;
          $('#extraSender').value = item.sender;
          $('#extraDescription').value = item.description || '';
          $('#extraStartMonth').value = item.startMonth; $('#extraStartYear').value = item.startYear;
          $('#extraEndMonth').value = item.endMonth; $('#extraEndYear').value = item.endYear;

          const key = ymKey(state.year, state.month);
          const isPaid = item.paidHistory ? item.paidHistory[key] === true : item.status === 'pago';
          $('#extraStatus').value = isPaid ? 'pago' : 'pendente';
          updateExtraInstallments();
        }
        extraDlg.showModal();
      }

      $('#newExtraBtn').addEventListener('click', () => openExtraDialog('new'));

      $('#extraForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const title = $('#extraTitle').value.trim();
        const source = $('#extraSource').value.trim() || 'Gerais';
        const amount = Number($('#extraAmount').value);
        const sender = $('#extraSender').value.trim();
        const description = $('#extraDescription').value.trim();
        const sMonth = Number($('#extraStartMonth').value), sYear = Number($('#extraStartYear').value);
        const eMonth = Number($('#extraEndMonth').value), eYear = Number($('#extraEndYear').value);
        const status = $('#extraStatus').value;
        const key = ymKey(state.year, state.month);

        if (!title || !Number.isFinite(amount) || amount <= 0) {
          notify('Preencha a descrição e um valor válido.', 'error');
          return;
        }

        if (mk(eYear, eMonth) < mk(sYear, sMonth)) {
          notify('O mês final precisa ser igual ou posterior ao inicial.', 'error');
          return;
        }

        let extra = extraDlgId ? state.extras.find(e => e.id === extraDlgId) : null;
        if (!extra) {
          extra = { id: uid(), title, source, amount, sender, description, startMonth: sMonth, startYear: sYear, endMonth: eMonth, endYear: eYear, paidHistory: {} };
          state.extras.push(extra);
        } else {
          extra.title = title; extra.source = source; extra.amount = amount; extra.sender = sender;
          extra.description = description; extra.startMonth = sMonth; extra.startYear = sYear;
          extra.endMonth = eMonth; extra.endYear = eYear;
        }

        extra.paidHistory = extra.paidHistory || {};
        extra.paidHistory[key] = status === 'pago';

        saveState(); extraDlg.close(); render();
        notify('Renda extra salva com sucesso!', 'success');
      });

      $('#deleteExtraBtn').addEventListener('click', () => {
        if (!confirm('Excluir esta renda extra?')) return;
        state.extras = state.extras.filter(e => e.id !== extraDlgId);
        saveState(); extraDlg.close(); render();
        notify('Renda extra excluída.', 'info');
      });

function initExtrasEvents() {
  extraDlg = document.getElementById('extraDialog');
  
  const searchInput = document.getElementById('extrasSearchInput');
  if (searchInput && !searchInput.dataset.extrasInit) {
    searchInput.dataset.extrasInit = 'true';
    searchInput.addEventListener('input', renderExtrasTab);
  }

  const statusFilter = document.getElementById('extrasStatusFilter');
  if (statusFilter && !statusFilter.dataset.extrasInit) {
    statusFilter.dataset.extrasInit = 'true';
    statusFilter.addEventListener('change', renderExtrasTab);
  }

  const toggleChartsBtn = document.getElementById('toggleExtrasChartsBtn');
  if (toggleChartsBtn && !toggleChartsBtn.dataset.extrasInit) {
    toggleChartsBtn.dataset.extrasInit = 'true';
    toggleChartsBtn.addEventListener('click', () => {
      const st = getState();
      st.collapsedSections = st.collapsedSections || {};
      st.collapsedSections.extrasCharts = !st.collapsedSections.extrasCharts;
      saveState();
      renderExtraIncomeCharts();
    });
  }
}

export function initExtras() {
  const st = getState();
  // Ribbon de meses: ocultar ao clicar e persistir na sessão
  if (sessionStorage.getItem('hide_months_ribbon') === 'true') {
    const ribbonCard = document.querySelector('.ribbon-card') || document.getElementById('ribbonSection');
    if (ribbonCard) ribbonCard.style.display = 'none';
  }

  initExtrasEvents();
  renderExtrasTab();
}

window.initExtras = initExtras;
window.renderExtrasTab = renderExtrasTab;
window.openExtraDialog = openExtraDialog;
window.updateExtraIncomeCharts = updateExtraIncomeCharts;
