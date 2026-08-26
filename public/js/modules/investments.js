/* ==========================================================================
   MODULO DE INVESTIMENTOS & SIMULADOR (investments.js)
   Financas Pro - Vanilla JS Architecture
   ========================================================================== */

(function() {
  'use strict';

  let assetDlgId = null;

  function openAssetDialog(mode, id) {
    const state = getState();
    const assetDlg = $('#assetDialog');
    $('#assetForm').reset();
    assetDlgId = id || null;
    $('#deleteAssetBtn').hidden = !id;

    if (mode === 'new') {
      $('#assetDialogTitle').textContent = 'Novo Investimento';
      $('#assetType').value = 'renda-fixa';
      $('#assetColor').value = '#1F7A5C';
    } else {
      const a = (state.assets || []).find(x => x.id === id);
      if (!a) return;
      $('#assetDialogTitle').textContent = 'Editar Investimento';
      $('#assetName').value = a.name;
      $('#assetType').value = a.type || 'renda-fixa';
      $('#assetCurrent').value = currency(a.currentAmount);
      $('#assetGoal').value = a.goalAmount ? currency(a.goalAmount) : '';
      $('#assetColor').value = a.color || '#1F7A5C';
    }
    if (assetDlg) assetDlg.showModal();
  }

  function openAporteDialog(assetId) {
    const state = getState();
    const aporteDlg = $('#aporteDialog');
    if (state.assets.length === 0) {
      notify('Crie primeiro um ativo em "+ Criar Novo Investimento".', 'warning');
      return;
    }
    $('#aporteForm').reset();
    $('#aporteMonth').value = state.month;
    $('#aporteYear').value = state.year;
    if (assetId) $('#aporteAsset').value = assetId;
    if (aporteDlg) aporteDlg.showModal();
  }

  function initSimulator() {
    const state = getState();
    const totalInvested = (state.assets || []).reduce((s, a) => s + Number(a.currentAmount || 0), 0);
    const monthlyAportes = (state.aportes || []).filter(ap => ap.month === state.month && ap.year === state.year).reduce((s, ap) => s + Number(ap.amount || 0), 0);

    const initInput = $('#simInitial');
    const monthlyInput = $('#simMonthly');

    if (initInput && (!initInput.value || initInput.value === '1000')) {
      initInput.value = totalInvested > 0 ? totalInvested : 1000;
    }
    if (monthlyInput && (!monthlyInput.value || monthlyInput.value === '200')) {
      monthlyInput.value = monthlyAportes > 0 ? monthlyAportes : 200;
    }

    $('#simCalcBtn')?.addEventListener('click', runSimulation);
    $('#simUnit')?.addEventListener('change', runSimulation);
    ['#simInitial', '#simMonthly', '#simRate', '#simPeriod'].forEach(id => {
      $(id)?.addEventListener('input', runSimulation);
    });

    $('#toggleInvestSimulatorBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const state = getState();
      state.collapsedSections.investSimulator = !state.collapsedSections.investSimulator;
      saveState();
      renderInvestmentsTab();
    });

    $('#toggleInvestSimulatorHeader')?.addEventListener('click', () => {
      const state = getState();
      state.collapsedSections.investSimulator = !state.collapsedSections.investSimulator;
      saveState();
      renderInvestmentsTab();
    });

    $('#toggleInvestChartsBtn')?.addEventListener('click', () => {
      const state = getState();
      state.collapsedSections.investCharts = !state.collapsedSections.investCharts;
      saveState();
      renderInvestmentsTab();
    });

    runSimulation();
  }

function reorderAssets(sourceId, targetId) {
  const state = getState();
        if (sourceId === targetId) return;
        const sIdx = state.assets.findIndex(a => a.id === sourceId);
        const tIdx = state.assets.findIndex(a => a.id === targetId);
        if (sIdx !== -1 && tIdx !== -1) {
          const [moved] = state.assets.splice(sIdx, 1);
          state.assets.splice(tIdx, 0, moved);
          saveState();
          render();
          notify('Ordem dos investimentos atualizada!');
        }
      
};

function moveAssetToEnd(sourceId) {
  const state = getState();
        const sIdx = state.assets.findIndex(a => a.id === sourceId);
        if (sIdx !== -1) {
          const [moved] = state.assets.splice(sIdx, 1);
          state.assets.push(moved);
          saveState();
          render();
          notify('Ordem dos investimentos atualizada!');
        }
      
};

function runSimulation() {
        const p = Number($('#simInitial')?.value) || 0;
        const pmt = Number($('#simMonthly')?.value) || 0;
        const rateAnual = Number($('#simRate')?.value) || 0;
        const periodVal = Number($('#simPeriod')?.value) || 1;
        const unit = $('#simUnit')?.value || 'anos';

        const nMonths = unit === 'anos' ? periodVal * 12 : periodVal;
        const taxaMensal = Math.pow(1 + (rateAnual / 100), 1 / 12) - 1;

        const container = $('#simResultsContainer');
        if (!container) return;

        let balance = p;
        let totalContributed = p;

        for (let i = 1; i <= nMonths; i++) {
          balance = balance * (1 + taxaMensal) + pmt;
          totalContributed += pmt;
        }

        const totalInterest = Math.max(0, balance - totalContributed);
        const labelPeriod = unit === 'anos' ? `${periodVal} ano(s)` : `${periodVal} mês(es)`;
        const pctInvested = balance > 0 ? Math.min(100, Math.round((totalContributed / balance) * 100)) : 100;
        const pctInterest = 100 - pctInvested;

        container.innerHTML = `
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:14px; align-items:start;">
            <div style="background:var(--surface); padding:12px 14px; border-radius:10px; border:1px solid var(--line);">
              <div style="font-size:.72rem; color:var(--muted); font-weight:800; text-transform:uppercase; letter-spacing:0.03em;">Valor Bruto Final (${labelPeriod})</div>
              <div class="num positive" style="font-size:1.35rem; font-weight:800; margin-top:2px;">${currency(balance)}</div>
              <div style="font-size:.72rem; color:var(--muted); font-weight:600; margin-top:2px;">Taxa Efetiva: ~${(taxaMensal * 100).toFixed(2)}% ao mês</div>
            </div>
            <div style="background:var(--surface); padding:12px 14px; border-radius:10px; border:1px solid var(--line);">
              <div style="font-size:.72rem; color:var(--muted); font-weight:800; text-transform:uppercase; letter-spacing:0.03em;">Total Investido (Aportes)</div>
              <div class="num" style="font-size:1.2rem; font-weight:800; margin-top:2px;">${currency(totalContributed)}</div>
              <div style="font-size:.72rem; color:var(--muted); font-weight:600; margin-top:2px;">${pctInvested}% do montante final</div>
            </div>
            <div style="background:var(--surface); padding:12px 14px; border-radius:10px; border:1px solid var(--line);">
              <div style="font-size:.72rem; color:var(--muted); font-weight:800; text-transform:uppercase; letter-spacing:0.03em;">Total Ganho em Juros</div>
              <div class="num" style="font-size:1.2rem; font-weight:800; color:var(--info); margin-top:2px;">${currency(totalInterest)}</div>
              <div style="font-size:.72rem; color:var(--muted); font-weight:600; margin-top:2px;">${pctInterest}% do montante final</div>
            </div>
          </div>
          <div style="margin-top:6px;">
            <div style="display:flex; justify-content:space-between; font-size:.72rem; color:var(--muted); font-weight:700; margin-bottom:4px;">
              <span>Investido: ${pctInvested}%</span>
              <span>Juros Compostos: ${pctInterest}%</span>
            </div>
            <div style="height:8px; border-radius:999px; background:var(--surface-3); overflow:hidden; display:flex;">
              <div style="width:${pctInvested}%; background:var(--brand); height:100%; transition:width .3s ease;"></div>
              <div style="width:${pctInterest}%; background:var(--info); height:100%; transition:width .3s ease;"></div>
            </div>
          </div>
        `;
      };

window.renderSimpleBarChart = function renderSimpleBarChart(containerSel, mapData, color) {
        const container = $(containerSel);
        const items = Object.entries(mapData).sort((a, b) => b[1] - a[1]);
        if (items.length === 0) {
          container.innerHTML = `<div class="empty">Sem dados registrados.</div>`;
          return;
        }
        const maxVal = items[0][1] || 1;
        container.innerHTML = items.map(([name, val]) => {
          const pct = Math.round((val / maxVal) * 100);
          return `
        <div class="dest-bar-item">
          <span class="dest-name" title="${name}"><strong>${name}</strong></span>
          <div class="dest-track">
            <div class="dest-fill" style="width:${pct}%; background:${color};"></div>
          </div>
          <span class="dest-val num">${currency(val)}</span>
        </div>
      `;
        }).join('');
      };

function renderInvestmentsTab() {
  const state = getState();
        const y = state.year, m = state.month;

        const simBody = $('#investSimulatorBody');
        const isSimHidden = state.collapsedSections?.investSimulator === true;
        const simChevron = $('#simChevronIcon');
        if (simBody) {
          simBody.style.display = isSimHidden ? 'none' : 'block';
        }
        if (simChevron) {
          simChevron.style.transform = isSimHidden ? 'rotate(-180deg)' : 'rotate(0deg)';
        }

        const totalInvested = state.assets.reduce((s, a) => s + Number(a.currentAmount || 0), 0);
        const totalGoals = state.assets.reduce((s, a) => s + Number(a.goalAmount || 0), 0);

        const monthlyAportes = state.aportes.filter(ap => ap.month === m && ap.year === y).reduce((s, ap) => s + Number(ap.amount || 0), 0);

        const goalPct = totalGoals > 0 ? Math.min(100, Math.round((totalInvested / totalGoals) * 100)) : 0;

        $('#investMetrics').innerHTML = `
      <div class="metric">
        <div class="label">Patrimônio Investido</div>
        <div class="value num positive">${currency(totalInvested)}</div>
        <div class="sub">Total acumulado em ativos</div>
      </div>
      <div class="metric">
        <div class="label">Aportes do Mês</div>
        <div class="value num positive">${currency(monthlyAportes)}</div>
        <div class="sub">Adicionado em ${MONTH_ABBR[m - 1]}/${y}</div>
      </div>
      <div class="metric">
        <div class="label">Metas Globais Atingidas</div>
        <div class="value num info">${goalPct}%</div>
        <div class="bar"><span style="width:${goalPct}%; background:var(--brand)"></span></div>
      </div>
    `;

        const chartsGrid = $('#investChartsGrid');
        const toggleChartsBtn = $('#toggleInvestChartsBtn');
        const isChartsHidden = state.collapsedSections?.investCharts === true;
        if (toggleChartsBtn) toggleChartsBtn.classList.toggle('active', !isChartsHidden);
        if (chartsGrid) {
          chartsGrid.style.display = isChartsHidden ? 'none' : 'grid';
        }

        const catMap = {};
        const destMap = {};
        state.assets.forEach(a => {
          const c = a.category || 'Outros';
          const d = a.destination || 'XP Investimentos';
          catMap[c] = (catMap[c] || 0) + Number(a.currentAmount || 0);
          destMap[d] = (destMap[d] || 0) + Number(a.currentAmount || 0);
        });

        renderSimpleBarChart('#investCategoryBars', catMap, 'var(--brand)');
        renderSimpleBarChart('#investDestBars', destMap, 'var(--c-fixed)');

        const container = $('#assetGridList');
        container.innerHTML = '';

        if (state.assets.length === 0) {
          container.innerHTML = `<div class="empty full-width">Nenhum investimento cadastrado ainda. Clique em "Criar Novo Investimento" para começar.</div>`;
          return;
        }

        state.assets.forEach(asset => {
          const current = Number(asset.currentAmount || 0);
          const goal = Number(asset.goalAmount || 0);
          const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;

          const card = document.createElement('div');
          card.className = 'asset-card';
          card.setAttribute('draggable', 'true');
          card.dataset.assetId = asset.id;
          card.innerHTML = `
        <div class="asset-head">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="drag-handle" title="Arraste para reordenar este investimento">
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px;"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
            </span>
            <div>
              <h4 class="asset-name" style="margin:0;">${escapeHtml(asset.name)}</h4>
              <div style="display:flex; gap:6px; margin-top:4px; flex-wrap:wrap;">
                <span class="tag">${escapeHtml(asset.category || 'Investimento')}</span>
                <span class="tag dest">${ICONS.bank} ${escapeHtml(asset.destination || 'XP')}</span>
              </div>
            </div>
          </div>
          <div class="entry-actions">
            <button type="button" class="icon-btn small edit-asset-btn" title="Editar Investimento">${ICONS.edit}</button>
          </div>
        </div>
        <div>
          <div class="asset-amount num positive">${currency(current)}</div>
          ${goal > 0 ? `<div style="font-size:.78rem; color:var(--muted); font-weight:700; margin-top:2px;">Meta: ${currency(goal)} (${pct}%)</div>` : ''}
        </div>
        ${goal > 0 ? `<div class="asset-progress"><div class="metric" style="padding:0; border:none; box-shadow:none;"><div class="bar"><span style="width:${pct}%; background:var(--brand)"></span></div></div></div>` : ''}
        <button type="button" class="btn soft small aporte-btn" style="width:100%; justify-center; margin-top:4px;">
          Aportar neste Ativo
        </button>
      `;

          card.querySelector('.edit-asset-btn').addEventListener('click', () => openAssetDialog('edit', asset.id));
          card.querySelector('.aporte-btn').addEventListener('click', () => openAporteDialog(asset.id));

          // Drag and drop events for asset card
          card.addEventListener('dragstart', (e) => {
            currentDragItem = { type: 'asset', id: asset.id, itemKey: asset.id };
            e.dataTransfer.setData('text/plain', asset.id);
            e.dataTransfer.effectAllowed = 'move';
            card.classList.add('dragging');
          });

          card.addEventListener('dragend', () => {
            currentDragItem = null;
            card.classList.remove('dragging');
            $$('.asset-card').forEach(c => c.classList.remove('drag-over'));
            const grid = $('#assetGridList');
            if (grid) grid.classList.remove('drag-container-over');
          });

          card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            if (currentDragItem && currentDragItem.type === 'asset' && currentDragItem.id !== asset.id) {
              card.classList.add('drag-over');
            }
          });

          card.addEventListener('dragleave', () => {
            card.classList.remove('drag-over');
          });

          card.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            card.classList.remove('drag-over');
            const grid = $('#assetGridList');
            if (grid) grid.classList.remove('drag-container-over');
            if (currentDragItem && currentDragItem.type === 'asset' && currentDragItem.id !== asset.id) {
              reorderAssets(currentDragItem.id, asset.id);
            }
          });

          container.appendChild(card);
        });
      
};

  function initInvestmentsListeners() {
    const newAssetBtn = $('#newAssetBtn');
    if (newAssetBtn) newAssetBtn.addEventListener('click', () => openAssetDialog('new'));

    $('#assetForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const state = getState();
      const assetDlg = $('#assetDialog');
      const name = $('#assetName').value.trim();
      const type = $('#assetType').value;
      const currentAmount = Number(String($('#assetCurrent').value).replace(/[^0-9,-]/g, '').replace(',', '.')) || 0;
      const goalRaw = $('#assetGoal').value;
      const goalAmount = goalRaw ? (Number(String(goalRaw).replace(/[^0-9,-]/g, '').replace(',', '.')) || 0) : null;
      const color = $('#assetColor').value || '#1F7A5C';

      if (!name) {
        notify('Informe o nome do investimento.', 'error');
        return;
      }

      state.assets = state.assets || [];

      if (assetDlgId) {
        const a = state.assets.find(x => x.id === assetDlgId);
        if (a) {
          a.name = name;
          a.type = type;
          a.currentAmount = currentAmount;
          a.goalAmount = goalAmount;
          a.color = color;
        }
      } else {
        state.assets.push({
          id: uid(),
          name,
          type,
          currentAmount,
          goalAmount,
          color
        });
      }

      saveState();
      if (assetDlg) assetDlg.close();
      render();
      notify('Investimento salvo!', 'success');
    });

    $('#deleteAssetBtn')?.addEventListener('click', () => {
      const state = getState();
      const assetDlg = $('#assetDialog');
      if (!assetDlgId) return;
      if (!confirm('Excluir este investimento e seus aportes vinculados?')) return;
      state.assets = (state.assets || []).filter(x => x.id !== assetDlgId);
      state.aportes = (state.aportes || []).filter(ap => ap.assetId !== assetDlgId);
      saveState();
      if (assetDlg) assetDlg.close();
      render();
      notify('Investimento excluído!', 'info');
    });

    const newAporteBtn = $('#newAporteBtn');
    if (newAporteBtn) newAporteBtn.addEventListener('click', () => openAporteDialog());

    $('#aporteForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const state = getState();
      const aporteDlg = $('#aporteDialog');
      const assetId = $('#aporteAsset').value;
      const amount = Number(String($('#aporteAmount').value).replace(/[^0-9,-]/g, '').replace(',', '.')) || 0;
      const month = Number($('#aporteMonth').value) || state.month;
      const year = Number($('#aporteYear').value) || state.year;
      const note = $('#aporteNote').value.trim();

      if (!assetId || amount <= 0) {
        notify('Selecione o ativo e informe um valor válido para o aporte.', 'error');
        return;
      }

      state.aportes = state.aportes || [];
      state.aportes.push({
        id: uid(),
        assetId,
        amount,
        month,
        year,
        note
      });

      const asset = (state.assets || []).find(a => a.id === assetId);
      if (asset) {
        asset.currentAmount = (Number(asset.currentAmount) || 0) + amount;
      }

      saveState();
      if (aporteDlg) aporteDlg.close();
      render();
      notify('Aporte registrado com sucesso!', 'success');
    });
  }

  // Bridges publicas autorizadas
  window.reorderAssets = reorderAssets;
  window.moveAssetToEnd = moveAssetToEnd;
  window.runSimulation = runSimulation;
  window.renderInvestmentsTab = renderInvestmentsTab;
  window.initInvestmentsModule = initSimulator;

  // Inicializacao sincrona dos listeners de investimentos
  try {
    initInvestmentsListeners();
  } catch (err) {
    console.error('Erro ao inicializar listeners de investimentos:', err);
  }
})();
