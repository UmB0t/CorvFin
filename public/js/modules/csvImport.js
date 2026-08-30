/* ==========================================================================
   MODULO DE IMPORTACAO CSV EM MASSA (csvImport.js)
   Financas Pro - Vanilla JS Architecture
   ========================================================================== */

(function() {
  'use strict';

let parsedCsvItems = [];

      function cleanHeader(h) {
        return String(h || '').trim().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9_]/g, '');
      }

      function parseCsvText(text) {
    const state = getState();
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) return [];

        const firstLine = lines[0];
        const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

        const rawHeaders = firstLine.split(delimiter).map(cleanHeader);
        const items = [];

        for (let i = 1; i < lines.length; i++) {
          let line = lines[i].trim();
          if (!line) continue;

          const row = [];
          let inQuotes = false;
          let curCell = '';
          for (let ch of line) {
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === delimiter && !inQuotes) { row.push(curCell.trim().replace(/^"|"$/g, '')); curCell = ''; }
            else { curCell += ch; }
          }
          row.push(curCell.trim().replace(/^"|"$/g, ''));
          if (row.length === 0 || row.every(c => c === '')) continue;

          const rowObj = {};
          rawHeaders.forEach((h, idx) => { rowObj[h] = row[idx] !== undefined ? row[idx] : ''; });

          let typeRaw = cleanHeader(rowObj.tipo || rowObj.type || '');
          let type = 'fixed';
          if (typeRaw.includes('ben') || typeRaw.includes('vale') || typeRaw === 'vr' || typeRaw === 'va') {
            type = 'benefit';
          } else if (typeRaw.includes('inv') || typeRaw.includes('ativ') || typeRaw.includes('asset')) {
            type = 'investment';
          } else if (typeRaw.includes('var') || typeRaw.includes('parc')) {
            type = 'variable';
          } else if (typeRaw.includes('ext') || typeRaw.includes('renda')) {
            type = 'extra';
          } else if (typeRaw.includes('dev') || typeRaw.includes('rec') || typeRaw.includes('emprest')) {
            type = 'debtor';
          } else if (typeRaw.includes('fix')) {
            type = 'fixed';
          }

          const name = rowObj.descricao || rowObj.title || rowObj.nome || rowObj.item || 'Item Importado';
          let amountRaw = (rowObj.valor || rowObj.amount || '0').replace('R$', '').replace(/\s/g, '');
          if (amountRaw.includes(',') && amountRaw.includes('.')) { amountRaw = amountRaw.replace(/\./g, '').replace(',', '.'); }
          else if (amountRaw.includes(',')) { amountRaw = amountRaw.replace(',', '.'); }
          const amount = Math.abs(Number(amountRaw)) || 0;

          if (amount <= 0) continue;

          let goalAmount = 0;
          let goalRaw = (rowObj.meta || rowObj.goal || rowObj.metavalor || rowObj.meta_valor || '').replace('R$', '').replace(/\s/g, '');
          if (goalRaw) {
            if (goalRaw.includes(',') && goalRaw.includes('.')) goalRaw = goalRaw.replace(/\./g, '').replace(',', '.');
            else if (goalRaw.includes(',')) goalRaw = goalRaw.replace(',', '.');
            goalAmount = Math.abs(Number(goalRaw)) || 0;
          }

          const group = rowObj.categoria || rowObj.group || (type === 'benefit' ? 'VA' : (type === 'investment' ? 'Renda Fixa' : 'Gerais'));
          const destination = rowObj.destino || rowObj.destination || (type === 'investment' ? 'XP Investimentos' : (type === 'benefit' ? 'Flash Benefícios' : 'Nubank'));
          const status = (rowObj.status || '').toLowerCase().includes('pag') ? 'pago' : 'pendente';
          const note = rowObj.observacao || rowObj.note || '';

          const sMonth = Number(rowObj.mes_inicio || rowObj.mesinicio || rowObj.startmonth || rowObj.mes || rowObj.month) || state.month;
          const sYear = Number(rowObj.ano_inicio || rowObj.anoinicio || rowObj.startyear || rowObj.ano || rowObj.year) || state.year;
          const dueDay = Number(rowObj.dia_vencimento || rowObj.diavencimento || rowObj.dia || rowObj.dueday) || null;
          const senderDebtor = rowObj.remetente_devedor || rowObj.remetentedevedor || rowObj.remetente || rowObj.devedor || rowObj.sender || rowObj.debtor || 'Não informado';

          // Flexibility for installments / dates
          const parcelasRaw = String(rowObj.parcelas || rowObj.parcela || rowObj.installments || rowObj.qtd_parcelas || rowObj.qtdparcelas || rowObj.num_parcelas || rowObj.numparcelas || '').trim();
          let installments = 0;
          if (parcelasRaw) {
            const match = parcelasRaw.match(/\d+/);
            if (match) installments = parseInt(match[0], 10);
          }

          let eMonth = Number(rowObj.mes_fim || rowObj.mesfim || rowObj.endmonth);
          let eYear = Number(rowObj.ano_fim || rowObj.anofim || rowObj.endyear);

          if (installments > 0) {
            const totalMonths = (sYear * 12 + (sMonth - 1)) + (installments - 1);
            eYear = Math.floor(totalMonths / 12);
            eMonth = (totalMonths % 12) + 1;
          } else {
            if (!eMonth) eMonth = sMonth;
            if (!eYear) eYear = sYear;
          }

          items.push({
            type, name, amount, group, destination, status, note, dueDay,
            startMonth: sMonth, startYear: sYear, endMonth: eMonth, endYear: eYear,
            senderDebtor, goalAmount, installments: installments || ((eYear - sYear) * 12 + (eMonth - sMonth) + 1)
          });
        }

        return items;
      }

      function initCsvDialog() {
        const dialog = $('#csvDialog');

        const openModal = () => { $('#csvGuideTabBtn').click(); dialog.showModal(); };
        $('#csvBtn').addEventListener('click', openModal);

        $('#csvGuideTabBtn').addEventListener('click', () => {
          $('#csvGuideTabBtn').className = 'btn small primary'; $('#csvUploadTabBtn').className = 'btn small soft';
          $('#csvGuideTab').hidden = false; $('#csvUploadTab').hidden = true;
        });

        $('#csvUploadTabBtn').addEventListener('click', () => {
          $('#csvUploadTabBtn').className = 'btn small primary'; $('#csvGuideTabBtn').className = 'btn small soft';
          $('#csvGuideTab').hidden = true; $('#csvUploadTab').hidden = false;
        });

        $('#downloadCsvTemplateBtn').addEventListener('click', () => {
          const templateContent = `tipo,descricao,valor,categoria,destino,status,dia_vencimento,mes_inicio,ano_inicio,parcelas,mes_fim,ano_fim,remetente_devedor,observacao\n` +
            `fixa,INTERNET FIBRA,"120,00",Moradia,Nubank,pendente,10,1,2026,,,,Vencimento todo dia 10\n` +
            `variavel,ENERGIA SOLAR,"1.445,41",Moradia,Nubank,pendente,15,3,2026,11,,,PAGAR AO FERNANDO\n` +
            `extra,Projeto Freelance Web,"1.200,00",Consultoria,Pix,pago,,1,2026,1,,,Empresa ACME,Pagamento via Pix\n` +
            `devedor,Empréstimo Celular,"250,00",Outros,Neon,pendente,5,1,2026,4,,,Carlos Silva,Acordo em 4 parcelas\n` +
            `beneficio,Supermercado Mensal,"450,00",VA,Flash Benefícios,pago,5,3,2026,1,,,Alimentação Família,Compras do mês no cartão VA\n` +
            `investimento,Tesouro Selic 2029,"5.000,00",Renda Fixa,XP Investimentos,,,1,2026,,,,Reserva de emergência com liquidez diária`;

          const blob = new Blob(['\uFEFF' + templateContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `modelo-importacao-minhas-financas.csv`; a.click();
          URL.revokeObjectURL(url);
          notify('Modelo CSV baixado com sucesso!');
        });

        const dropZone = $('#dropZone');
        const fileInput = $('#csvFileInput');

        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--brand)'; });
        dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--line)'; });
        dropZone.addEventListener('drop', (e) => {
          e.preventDefault(); dropZone.style.borderColor = 'var(--line)';
          if (e.dataTransfer.files.length) handleCsvFile(e.dataTransfer.files[0]);
        });

        fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleCsvFile(e.target.files[0]); });

        function getCsvTypeBadge(type) {
          switch (type) {
            case 'fixed': return '<span class="tag" style="background:var(--c-fixed-soft); color:var(--c-fixed); font-weight:700;">FIXA</span>';
            case 'variable': return '<span class="tag" style="background:var(--c-variable-soft); color:var(--c-variable); font-weight:700;">VARIÁVEL</span>';
            case 'extra': return '<span class="tag" style="background:var(--c-extra-soft); color:var(--c-extra); font-weight:700;">EXTRA</span>';
            case 'debtor': return '<span class="tag" style="background:var(--c-debt-soft); color:var(--c-debt); font-weight:700;">DEVEDOR</span>';
            case 'benefit': return '<span class="tag" style="background:var(--warning-soft); color:var(--warning); font-weight:700;">BENEFÍCIO</span>';
            case 'investment': return '<span class="tag" style="background:var(--brand-soft); color:var(--brand); font-weight:700;">INVESTIMENTO</span>';
            default: return `<span class="tag">${escapeHtml(type.toUpperCase())}</span>`;
          }
        }

        function handleCsvFile(file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            parsedCsvItems = parseCsvText(e.target.result);
            if (parsedCsvItems.length === 0) { notify('Nenhum item válido encontrado.'); return; }
            $('#csvPreviewCount').textContent = parsedCsvItems.length;
            $('#csvPreviewBody').innerHTML = parsedCsvItems.slice(0, 15).map(item => `
          <tr>
            <td>${getCsvTypeBadge(item.type)}</td>
            <td><strong>${escapeHtml(item.name)}</strong></td>
            <td class="num">${currency(item.amount)}</td>
            <td>${escapeHtml(item.destination)}</td>
            <td><span class="badge ${item.type === 'investment' ? 'info' : (item.status === 'pago' ? 'success' : 'warning')}">${item.type === 'investment' ? 'Ativo' : item.status}</span></td>
          </tr>
        `).join('') + (parsedCsvItems.length > 15 ? `<tr><td colspan="5" style="text-align:center; color:var(--muted)">+ ${parsedCsvItems.length - 15} outros itens...</td></tr>` : '');

            $('#csvPreviewContainer').hidden = false;
            $('#confirmCsvImportBtn').hidden = false;
            $('#confirmCsvImportBtn').textContent = `Confirmar e Importar ${parsedCsvItems.length} Itens`;
            notify(`${parsedCsvItems.length} itens lidos da planilha!`);
          };
          reader.readAsText(file);
        }

        $('#confirmCsvImportBtn').addEventListener('click', () => {
          if (parsedCsvItems.length === 0) return;
          const state = getState();
          const key = ymKey(state.year, state.month);

          parsedCsvItems.forEach(item => {
            if (item.destination && !state.destinations.some(d => d.name === item.destination)) {
              state.destinations.push({ name: item.destination, color: '#1F7A5C', icon: item.type === 'investment' ? 'bank' : 'card' });
            }
            if (item.group && item.type !== 'benefit' && item.type !== 'investment') {
              const hasGroup = (state.categories || []).some(c => ((typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name)) === item.group);
              if (!hasGroup) {
                const icon = (typeof DEFAULT_CATEGORY_ICONS_MAP !== 'undefined' && DEFAULT_CATEGORY_ICONS_MAP[item.group]) ? DEFAULT_CATEGORY_ICONS_MAP[item.group] : 'tag';
                state.categories.push({ name: item.group, icon });
              }
            }

            if (item.type === 'fixed') {
              const f = { id: uid(), name: item.name, group: item.group || 'Gerais', note: item.note, dueDay: item.dueDay, destination: item.destination || 'Nubank', versions: [{ id: uid(), year: item.startYear, month: item.startMonth, amount: item.amount }], endedFrom: null, paidHistory: {} };
              f.paidHistory[key] = item.status === 'pago'; state.fixed.push(f);
            } else if (item.type === 'variable') {
              const v = { id: uid(), name: item.name, group: item.group || 'Gerais', note: item.note, dueDay: item.dueDay, amount: item.amount, destination: item.destination || 'Nubank', startMonth: item.startMonth, startYear: item.startYear, endMonth: item.endMonth, endYear: item.endYear, paidHistory: {} };
              v.paidHistory[key] = item.status === 'pago'; state.variable.push(v);
            } else if (item.type === 'extra') {
              const e = { id: uid(), title: item.name, source: item.group || 'Gerais', amount: item.amount, sender: item.senderDebtor, description: item.note, startMonth: item.startMonth, startYear: item.startYear, endMonth: item.endMonth, endYear: item.endYear, paidHistory: {} };
              e.paidHistory[key] = item.status === 'pago'; state.extras.push(e);
            } else if (item.type === 'debtor') {
              const d = { id: uid(), title: item.name, debtorName: item.senderDebtor, amount: item.amount, destination: item.destination || 'Nubank', description: item.note, startMonth: item.startMonth, startYear: item.startYear, endMonth: item.endMonth, endYear: item.endYear, paidHistory: {} };
              d.paidHistory[key] = item.status === 'pago'; state.debtors.push(d);
            } else if (item.type === 'benefit') {
              state.benefitTransactions = state.benefitTransactions || [];
              const rawCat = cleanHeader(item.group || item.destination || item.name || '');
              let bType = 'va';
              if (rawCat.includes('refei') || rawCat === 'vr') bType = 'vr';
              else if (rawCat.includes('aliment') || rawCat === 'va') bType = 'va';
              else if (rawCat.includes('saud') || rawCat.includes('med') || rawCat.includes('odont')) bType = 'saude';
              else if (rawCat.includes('transp') || rawCat === 'vt' || rawCat.includes('combust') || rawCat.includes('uber')) bType = 'transporte';
              else if (rawCat.includes('educ') || rawCat.includes('curso') || rawCat.includes('faculd')) bType = 'educacao';
              else if (rawCat.includes('cult') || rawCat.includes('lazer') || rawCat.includes('cinema') || rawCat.includes('livr')) bType = 'cultura';
              else if (rawCat.includes('farm') || rawCat.includes('medic') || rawCat.includes('drog')) bType = 'farmacia';
              else if (typeof BENEFIT_TYPES_MAP !== 'undefined' && BENEFIT_TYPES_MAP[rawCat]) bType = rawCat;

              let curY = item.startYear;
              let curM = item.startMonth;
              while (curY < item.endYear || (curY === item.endYear && curM <= item.endMonth)) {
                state.benefitTransactions.push({
                  id: uid(),
                  description: item.name,
                  type: bType,
                  amount: item.amount,
                  day: item.dueDay || new Date().getDate(),
                  month: curM,
                  year: curY,
                  note: item.note
                });
                curM++;
                if (curM > 12) { curM = 1; curY++; }
              }
            } else if (item.type === 'investment') {
              state.assets = state.assets || [];
              let cat = item.group || 'Renda Fixa';
              const catLower = cleanHeader(cat);
              if (catLower.includes('fixa') || catLower.includes('tesouro') || catLower.includes('cdb') || catLower.includes('lci') || catLower.includes('lca')) cat = 'Renda Fixa';
              else if (catLower.includes('acao') || catLower.includes('acoes') || catLower.includes('stock') || catLower.includes('etf')) cat = 'Ações';
              else if (catLower.includes('fii') || catLower.includes('imob')) cat = 'FIIs';
              else if (catLower.includes('cripto') || catLower.includes('btc') || catLower.includes('bitcoin') || catLower.includes('eth')) cat = 'Cripto';
              else if (catLower.includes('reserva') || catLower.includes('emerg')) cat = 'Reserva de Emergência';
              else if (catLower.includes('outro')) cat = 'Outros';

              const a = {
                id: uid(),
                name: item.name,
                category: cat,
                currentAmount: item.amount,
                goalAmount: item.goalAmount || 0,
                destination: item.destination || 'XP Investimentos',
                note: item.note || ''
              };
              state.assets.push(a);
            }
          });

          saveState(); dialog.close(); render();
          notify(`Importação concluída! ${parsedCsvItems.length} itens salvos.`);
        });
      }

  // Inicializacao sincrona do modulo (DOM ja carregado no momento do script)
  try {
    initCsvDialog();
  } catch (err) {
    console.error('Erro ao inicializar csvImport:', err);
  }
})();
