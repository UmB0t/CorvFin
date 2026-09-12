/* ==========================================================================
   MODULO DE PERFIL, CATEGORIAS, DESTINOS & ORCAMENTOS (profile.js)
/* ==========================================================================
   MODULO DE PERFIL, CATEGORIAS, DESTINOS & ORCAMENTOS (profile.js)
   Financas Pro - Vanilla JS Architecture
   ========================================================================== */

(function() {
  'use strict';

  function updateCategorySelects() {
    const state = getState();
    const groupSelect = $('#entryGroup');
    const rawCats = Array.isArray(state.categories) ? state.categories : [];
    const cats = (typeof getSortedCategories === 'function') ? getSortedCategories(rawCats) : rawCats;
    if (groupSelect) {
      const curVal = groupSelect.value;
      let opts = cats.map((c, idx) => {
        const name = (typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name);
        const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
        return `<option value="${escapeHtml(name)}" data-color="${color}">${escapeHtml(name)}</option>`;
      }).join('');
      groupSelect.innerHTML = opts;
      const hasCur = cats.some(c => ((typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name)) === curVal);
      if (curVal && hasCur) {
        groupSelect.value = curVal;
      } else if (cats.length > 0) {
        groupSelect.value = (typeof getCategoryName === 'function') ? getCategoryName(cats[0]) : (typeof cats[0] === 'string' ? cats[0] : cats[0].name);
      }
    }

    const fsCat = $('#fsCategoryFilter');
    if (fsCat) {
      const prev = fsCat.value;
      fsCat.innerHTML = `<option value="all">Todas as Categorias</option>` + cats.map(c => {
        const name = (typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name);
        return `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`;
      }).join('');
      if (prev) fsCat.value = prev;
    }
  }

  function getDestMeta(destName) {
    const state = getState();
    const found = state.destinations.find(d => d.name === destName);
    if (found) return found;
    return { name: destName || 'Gerais', color: '#1F7A5C', icon: 'card' };
  }

  function countUsage(type, name) {
    const state = getState();
    let count = 0;
    if (type === 'dest') {
      state.fixed.forEach(f => { if (f.destination === name) count++; });
      state.variable.forEach(v => { if (v.destination === name) count++; });
      state.debtors.forEach(d => { if (d.destination === name) count++; });
      state.assets.forEach(a => { if (a.destination === name) count++; });
    } else if (type === 'cat') {
      state.fixed.forEach(f => { if (f.group === name) count++; });
      state.variable.forEach(v => { if (v.group === name) count++; });
      state.extras.forEach(e => { if (e.source === name) count++; });
      state.assets.forEach(a => { if (a.category === name) count++; });
    }
    return count;
  }

  function updateDestinationSelects() {
    const state = getState();
    const sortedDests = (typeof getSortedDestinations === 'function') ? getSortedDestinations(state.destinations) : (state.destinations || []);
    const opts = sortedDests.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
    if ($('#entryDestination')) $('#entryDestination').innerHTML = opts;
    if ($('#debtorDestination')) $('#debtorDestination').innerHTML = opts;
    if ($('#assetDestination')) $('#assetDestination').innerHTML = opts;

    const destFilterSelect = $('#expensesDestFilter');
    if (destFilterSelect) {
      const methods = (window.PAYMENT_METHODS && window.PAYMENT_METHODS.length) ? window.PAYMENT_METHODS : [
        { id: 'pix', name: 'PIX' },
        { id: 'dinheiro', name: 'Dinheiro' },
        { id: 'cartao_credito', name: 'Cartão de Crédito' },
        { id: 'cartao_debito', name: 'Cartão de Débito' },
        { id: 'boleto', name: 'Boleto' },
        { id: 'transferencia', name: 'Transferência' },
        { id: 'debito_automatico', name: 'Débito Automático' },
        { id: 'outros', name: 'Outros' }
      ];
      const curVal = destFilterSelect.value || 'all';
      destFilterSelect.innerHTML = `<option value="all">Todos os Métodos</option>` + methods.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join('');
      if (curVal && destFilterSelect.querySelector(`option[value="${curVal}"]`)) {
        destFilterSelect.value = curVal;
      }
    }

    const tagsContainer = $('#destTagsList');
    if (tagsContainer) {
      tagsContainer.innerHTML = sortedDests.map(d => {
        const iconSvg = DEST_SVG_ICONS[d.icon] || DEST_SVG_ICONS.card;
        const usage = countUsage('dest', d.name);
        const isNative = (d.name.toLowerCase() === 'pix' || d.name.toLowerCase() === 'dinheiro');
        const dueText = d.dueDay ? `<small style="font-weight:800; opacity:0.85;">(Venc. dia ${d.dueDay})</small>` : (isNative ? `<small style="font-weight:800; opacity:0.75;">(À Vista)</small>` : '');
        const delTip = isNative ? 'Destino nativo protegido' : (usage > 0 ? `Em uso por ${usage} lançamento(s)` : 'Remover Destino');
        return `
          <span class="tag dest" style="border-radius:999px; padding:5px 12px; font-size:.78rem; font-weight:750; display:inline-flex; align-items:center; gap:6px; background:${d.color}22; color:${d.color}; border:1px solid ${d.color}55;">
            ${iconSvg} <strong>${escapeHtml(d.name)}</strong> ${dueText}
            <button type="button" data-edit-dest="${escapeHtml(d.name)}" data-tooltip="Editar Destino" aria-label="Editar Destino" style="background:transparent; border:none; color:inherit; cursor:pointer; font-weight:800; padding:0 2px; display:inline-flex; align-items:center; opacity:0.75;">
              ${ICONS.edit}
            </button>
            ${!isNative ? `
              <button type="button" data-del-dest="${escapeHtml(d.name)}" data-tooltip="${delTip}" aria-label="${delTip}" style="background:transparent; border:none; color:inherit; cursor:pointer; font-weight:800; padding:0 2px; display:inline-flex; align-items:center; opacity:0.75;">
                ${ICONS.close}
              </button>
            ` : ''}
          </span>
        `;
      }).join('');

      $$('[data-edit-dest]').forEach(b => {
        b.addEventListener('click', () => {
          const name = b.getAttribute('data-edit-dest');
          const dest = state.destinations.find(x => x.name === name);
          if (!dest) return;
          $('#newDestInput').value = dest.name;
          if ($('#newDestDueDay')) $('#newDestDueDay').value = dest.dueDay || '';
          $('#newDestColor').value = dest.color || '#1F7A5C';
          $('#newDestIcon').value = dest.icon || 'card';
          $('#editingDestOriginalName').value = dest.name;
          $('#addDestBtn').textContent = 'Salvar Alterações';
          notify(`Editando destino "${dest.name}". Altere os campos e clique em Salvar Alterações.`);
        });
      });

      $$('[data-del-dest]').forEach(b => {
        b.addEventListener('click', () => {
          const name = b.getAttribute('data-del-dest');
          if (!name) return;
          if (name.toLowerCase() === 'pix' || name.toLowerCase() === 'dinheiro' || name.toLowerCase() === 'em dinheiro') {
            notify('Destinos nativos (Pix e Dinheiro) são protegidos e não podem ser removidos.', 'warning');
            return;
          }
          const usage = countUsage('dest', name);
          if (usage > 0) {
            notify(`Não é possível excluir "${name}": este destino está em uso por ${usage} lançamento(s).`, 'warning');
            return;
          }
          state.destinations = state.destinations.filter(x => x.name !== name);
          saveState(); updateDestinationSelects(); render();
          notify(`Destino "${name}" removido.`, 'info');
        });
      });
    }

    const groupDatalist = $('#groupSuggestions');
    if (groupDatalist) {
      const rawCats = Array.isArray(state.categories) ? state.categories : [];
      const cats = (typeof getSortedCategories === 'function') ? getSortedCategories(rawCats) : rawCats;
      groupDatalist.innerHTML = cats.map(c => `<option value="${escapeHtml((typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name))}">`).join('');
    }
  }

  function updateCategoryTagsList() {
    const state = getState();
    const container = $('#categoryTagsList');
    if (!container) return;

    let unbudgetedCount = 0;
    const rawCats = Array.isArray(state.categories) ? state.categories : [];
    const cats = (typeof getSortedCategories === 'function') ? getSortedCategories(rawCats) : rawCats;

    container.innerHTML = cats.map((c, idx) => {
      const name = (typeof getCategoryName === 'function') ? getCategoryName(c) : (typeof c === 'string' ? c : c.name);
      const iconKey = (typeof c === 'object' && c.icon) ? c.icon : (window.DEFAULT_CATEGORY_ICONS_MAP[name] || 'tag');
      const iconSvg = window.CATEGORY_SVG_ICONS[iconKey] || window.CATEGORY_SVG_ICONS.tag;
      const color = (typeof getCategoryColor === 'function') ? getCategoryColor(c) : (c.color || CATEGORY_COLORS[idx % CATEGORY_COLORS.length]);
      const budget = state.budgets[name] || 0;
      if (budget === 0) unbudgetedCount++;
      const usage = countUsage('cat', name);
      const delCatTip = usage > 0 ? `Em uso por ${usage} lançamento(s)` : 'Remover Categoria';

      return `
        <span class="tag" style="border-radius:999px; padding:5px 12px; font-size:.78rem; font-weight:750; display:inline-flex; align-items:center; gap:6px; background:${color}18; color:var(--text); border:1px solid ${color}44;">
          <span style="display:inline-flex; color:${color};">${iconSvg}</span>
          <strong>${escapeHtml(name)}</strong> ${budget > 0 ? `<small style="color:var(--brand); font-weight:800;">(${currency(budget)})</small>` : `<small style="color:var(--warning); font-weight:700;">(Sem Teto)</small>`}
          <button type="button" data-edit-cat="${escapeHtml(name)}" data-tooltip="Editar Categoria / Teto / Ícone / Cor" aria-label="Editar Categoria / Teto / Ícone / Cor" style="background:transparent; border:none; color:inherit; cursor:pointer; font-weight:800; padding:0 2px; display:inline-flex; align-items:center; opacity:0.75;">
            ${ICONS.edit}
          </button>
          <button type="button" data-del-cat="${escapeHtml(name)}" data-tooltip="${delCatTip}" aria-label="${delCatTip}" style="background:transparent; border:none; color:inherit; cursor:pointer; font-weight:800; padding:0 2px; display:inline-flex; align-items:center; opacity:0.75;">
            ${ICONS.close}
          </button>
        </span>
      `;
    }).join('');

    const alertBanner = $('#unbudgetedCategoriesAlert');
    if (alertBanner) {
      if (unbudgetedCount > 0) {
        $('#unbudgetedCategoriesText').innerHTML = `Você possui <strong>${unbudgetedCount} categoria(s)</strong> sem teto de gastos configurado! Defina um valor limite acima.`;
        alertBanner.hidden = false;
      } else {
        alertBanner.hidden = true;
      }
    }

    $$('[data-edit-cat]').forEach(b => {
      b.addEventListener('click', () => {
        const catName = b.getAttribute('data-edit-cat');
        const catObj = (state.categories || []).find(x => ((typeof getCategoryName === 'function') ? getCategoryName(x) : (typeof x === 'string' ? x : x.name)) === catName);
        $('#newCategoryInput').value = catName;
        if ($('#newCategoryIcon')) {
          $('#newCategoryIcon').value = (typeof catObj === 'object' && catObj.icon) ? catObj.icon : (window.DEFAULT_CATEGORY_ICONS_MAP[catName] || 'tag');
        }
        if ($('#newCategoryColor')) {
          const resolvedColor = (typeof getCategoryColor === 'function') ? getCategoryColor(catObj || catName) : (catObj?.color || '#10B981');
          $('#newCategoryColor').value = resolvedColor;
        }
        $('#newCategoryBudgetInput').value = state.budgets[catName] || '';
        $('#editingCategoryOriginalName').value = catName;
        $('#addCategoryBtn').textContent = 'Salvar Categoria';
        notify(`Editando categoria "${catName}". Altere o ícone, cor, teto ou nome e clique em Salvar Categoria.`);
      });
    });

    $$('[data-del-cat]').forEach(b => {
      b.addEventListener('click', () => {
        const catName = b.getAttribute('data-del-cat');
        if (!catName) return;
        const usage = countUsage('cat', catName);
        if (usage > 0) {
          notify(`Não é possível excluir "${catName}": ela está em uso por ${usage} lançamento(s).`, 'warning');
          return;
        }
        state.categories = (state.categories || []).filter(x => ((typeof getCategoryName === 'function') ? getCategoryName(x) : (typeof x === 'string' ? x : x.name)) !== catName);
        delete state.budgets[catName];
        saveState(); updateDestinationSelects(); updateCategorySelects(); updateCategoryTagsList(); render();
        notify(`Categoria "${catName}" removida.`, 'info');
      });
    });
  }

  function formatCentsToCurrency(cents) {
    if (typeof cents !== 'number' || isNaN(cents) || cents === 0) {
      return 'R$ 0,00';
    }
    const val = (cents / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `R$ ${val}`;
  }

  function formatBillingInterval(interval) {
    switch (interval) {
      case 'yearly':
      case 'year':
        return '/ ano';
      case 'lifetime':
        return ' (pagamento único)';
      case 'monthly':
      case 'month':
      default:
        return '/ mês';
    }
  }

  async function renderProfilePlanCard(options = {}) {
    const card = document.getElementById('profilePlanCard');
    if (!card) return;

    if (options?.loading !== false && (!card.innerHTML || card.innerHTML.trim() === '' || options?.forceRefresh)) {
      card.innerHTML = `
        <div style="padding:24px; text-align:center; color:var(--muted);">
          <div class="spinner" style="margin:0 auto 10px auto;"></div>
          <p style="font-size:0.88rem; font-weight:600;">Carregando informações do seu plano...</p>
        </div>
      `;
    }

    try {
      const forceRefresh = Boolean(options && (options.forceRefresh || options.refresh));
      let ctx = null;

      if (window.API && typeof window.API.getCommercialContext === 'function') {
        try {
          const res = await window.API.getCommercialContext({ forceRefresh });
          if (res && res.success) {
            ctx = (res.data && res.data.plan) ? res.data : (res.plan ? res : res.data);
            window._cachedCommercialContext = ctx;
          } else if (res && (res.error === 'PLAN_REFERENCE_INVALID' || res.code === 'PLAN_REFERENCE_INVALID' || res.status === 403)) {
            ctx = { error: 'PLAN_REFERENCE_INVALID', message: res.message || 'O plano vinculado à sua conta não foi encontrado no sistema.' };
          } else if (res && !res.success) {
            ctx = { error: res.error || 'SERVER_ERROR', message: res.message || 'Não foi possível carregar as informações do plano.' };
          }
        } catch (fetchErr) {
          console.warn('[Profile] Erro ao buscar contexto comercial:', fetchErr);
          ctx = { error: 'NETWORK_ERROR', message: 'Não foi possível carregar as informações do plano.' };
        }
      }

      // Fail-closed para plano com referência inválida
      if (ctx && ctx.error === 'PLAN_REFERENCE_INVALID') {
        card.innerHTML = `
          <div class="section-head">
            <div class="section-title" style="color:var(--danger);">
              <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--danger);">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              Plano — Referência Inválida
            </div>
          </div>
          <div style="padding:18px;">
            <p style="color:var(--danger); font-size:0.9rem; font-weight:700; margin:0 0 8px 0;">
              ${escapeHtml(ctx.message || 'O plano vinculado à sua conta não foi encontrado no sistema.')}
            </p>
            <p style="color:var(--muted); font-size:0.82rem; margin:0;">
              Por favor, entre em contato com o suporte ou administrador para regularizar seu cadastro comercial.
            </p>
          </div>
        `;
        return;
      }

      // Estado de erro genérico / 500 / rede (remove loading infinito)
      if (!ctx || ctx.error) {
        card.innerHTML = `
          <div class="section-head">
            <div class="section-title" style="color:var(--danger);">
              <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--danger);">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              Erro ao carregar plano
            </div>
          </div>
          <div style="padding:18px;">
            <p style="color:var(--danger); font-size:0.9rem; font-weight:600; margin:0 0 12px 0;">
              ${escapeHtml(ctx?.message || 'Não foi possível carregar as informações do plano.')}
            </p>
            <button type="button" class="btn soft small" id="btnRetryProfilePlan" style="font-weight:700;">
              Tentar novamente
            </button>
          </div>
        `;
        document.getElementById('btnRetryProfilePlan')?.addEventListener('click', () => {
          renderProfilePlanCard({ forceRefresh: true });
        });
        return;
      }

      const plan = ctx.plan || {};
      let cents = 0;
      let interval = 'monthly';

      if (plan.pricing?.offers && typeof plan.pricing.offers === 'object') {
        if (plan.pricing.offers.yearly?.enabled) {
          cents = plan.pricing.offers.yearly.regularPriceCents ?? 0;
          interval = 'year';
        } else if (plan.pricing.offers.monthly?.enabled) {
          cents = plan.pricing.offers.monthly.regularPriceCents ?? 0;
          interval = 'month';
        }
      } else {
        cents = plan.pricing?.amountCents ?? plan.pricing?.cents ?? 0;
        interval = plan.pricing?.interval || plan.pricing?.billingInterval || 'monthly';
      }
      const isFree = (cents === 0);
      const priceFormatted = isFree
        ? 'Gratuito'
        : ((typeof window.formatCentsToCurrency === 'function')
            ? window.formatCentsToCurrency(cents)
            : formatCentsToCurrency(cents));
      const intervalFormatted = isFree
        ? ''
        : ((typeof window.formatBillingInterval === 'function')
            ? window.formatBillingInterval(interval)
            : formatBillingInterval(interval));

      // AI credits info
      const aiUsage = ctx.usage?.ai || {};
      let aiCreditsText = 'Sem créditos de IA';
      if (aiUsage.unlimited) {
        aiCreditsText = 'IA ilimitada';
      } else if (aiUsage.enabled) {
        aiCreditsText = `${aiUsage.remaining} de ${aiUsage.limit} créditos diários restantes hoje`;
      }

      // Verificação de restrições administrativas individuais (Ajuste 1 e 2)
      const rbacRestricted = [];
      if (ctx.access) {
        Object.entries(ctx.access).forEach(([capKey, capData]) => {
          if (capData && capData.planAllowed === true && capData.permissionAllowed === false) {
            rbacRestricted.push(capKey);
          }
        });
      }

      const getLimitFmt = (resKey, limKey, label) => {
        let val;
        if (plan.entitlements && plan.entitlements[resKey]) {
          const ent = plan.entitlements[resKey];
          if (ent.enabled === false) return null;
          val = ent.limits?.[limKey];
        } else if (plan.limits) {
          val = plan.limits[limKey];
        }
        if (val === null) return `${label} ilimitadas`;
        if (Number.isInteger(val) && val > 0) return `Até ${val} ${label.toLowerCase()} cadastradas`;
        if (val === 0) return `0 ${label.toLowerCase()} cadastradas`;
        return null;
      };

      const despesasFmt = getLimitFmt('despesas', 'maxItems', 'Despesas') || (plan.limits?.maxExpensesPerMonth === null ? 'Despesas ilimitadas' : (Number.isInteger(plan.limits?.maxExpensesPerMonth) ? `Até ${plan.limits.maxExpensesPerMonth} despesas / mês` : null));
      const devedoresFmt = getLimitFmt('devedores', 'maxItems', 'Devedores ativos') || (plan.limits?.maxActiveDebtors === null ? 'Devedores ativos ilimitados' : (Number.isInteger(plan.limits?.maxActiveDebtors) ? `Até ${plan.limits.maxActiveDebtors} devedores ativos` : null));
      const extrasFmt = getLimitFmt('extras', 'maxItems', 'Rendas Extras') || (plan.limits?.maxExtras === null ? 'Rendas Extras ilimitadas' : (Number.isInteger(plan.limits?.maxExtras) ? `Até ${plan.limits.maxExtras} rendas extras cadastradas` : null));

      const canonicalList = [
        aiCreditsText,
        despesasFmt,
        extrasFmt,
        devedoresFmt
      ].filter(Boolean);

      const features = Array.isArray(plan.metadata?.featuresSummary) && plan.metadata.featuresSummary.length > 0
        ? plan.metadata.featuresSummary
        : (canonicalList.length > 0 ? canonicalList : ['Acesso aos recursos inclusos no plano']);

      card.innerHTML = `
        <div class="section-head" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div class="section-title">
            <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand);">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            Seu Plano Atual: <span style="color:var(--brand); margin-left:4px;">${escapeHtml(plan.name || 'CorvFin')}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge ${plan.status === 'active' ? 'success' : 'warning'}" style="font-size:0.75rem; text-transform:uppercase;">
              ${plan.status === 'active' ? 'Ativo' : 'Legado'}
            </span>
            <button type="button" class="btn soft small" id="btnProfileOpenPlansModal" style="font-weight:750; font-size:0.8rem; padding:6px 12px;">
              Ver Planos
            </button>
          </div>
        </div>

        <div style="padding: 18px; display: grid; gap: 14px;">
          <div style="display:flex; align-items:baseline; gap:6px;">
            <span style="font-size:1.5rem; font-weight:850; color:var(--text);">${priceFormatted}</span>
            <span style="font-size:0.85rem; font-weight:600; color:var(--muted);">${intervalFormatted}</span>
          </div>

          <p style="margin:0; font-size:0.88rem; color:var(--muted); line-height:1.45;">
            ${escapeHtml(plan.description || 'Configuração padrão de recursos e capacidades.')}
          </p>

          <div style="background:var(--surface-2); border:1px solid var(--line); border-radius:12px; padding:12px 14px;">
            <div style="font-size:0.8rem; font-weight:800; color:var(--text); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.4px;">
              Recursos & Limites do Plano
            </div>
            <ul style="list-style:none; padding:0; margin:0; display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:8px; font-size:0.84rem;">
              <li style="display:flex; align-items:center; gap:6px; color:var(--text);">
                <span style="color:var(--brand); font-weight:800;">✓</span>
                <span>${escapeHtml(aiCreditsText)}</span>
              </li>
              ${features.filter(f => f !== aiCreditsText).map(f => `
                <li style="display:flex; align-items:center; gap:6px; color:var(--text);">
                  <span style="color:var(--brand); font-weight:800;">✓</span>
                  <span>${escapeHtml(f)}</span>
                </li>
              `).join('')}
            </ul>
          </div>

          ${rbacRestricted.length > 0 ? `
            <div style="background:var(--warning-soft); border:1px solid var(--warning); border-radius:10px; padding:10px 12px; font-size:0.82rem; color:var(--warning-strong, #b45309);">
              <strong>Nota sobre Permissões:</strong> Seu plano comercial inclui acesso aos recursos (${rbacRestricted.join(', ')}), mas seu perfil de usuário possui uma restrição administrativa individual definida pelo gestor da conta.
            </div>
          ` : ''}
        </div>
      `;

      document.getElementById('btnProfileOpenPlansModal')?.addEventListener('click', () => {
        if (typeof window.openCommercialPlansModal === 'function') {
          window.openCommercialPlansModal();
        }
      });
    } catch (err) {
      console.warn('[Profile] Falha ao renderizar card de plano:', err);
      card.innerHTML = `
        <div class="section-head">
          <div class="section-title" style="color:var(--danger);">
            <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--danger);">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            Erro ao carregar plano
          </div>
        </div>
        <div style="padding:18px;">
          <p style="color:var(--danger); font-size:0.9rem; font-weight:600; margin:0 0 12px 0;">
            Não foi possível carregar as informações do plano.
          </p>
          <button type="button" class="btn soft small" id="btnRetryProfilePlan" style="font-weight:700;">
            Tentar novamente
          </button>
        </div>
      `;
      document.getElementById('btnRetryProfilePlan')?.addEventListener('click', () => {
        renderProfilePlanCard({ forceRefresh: true });
      });
    }
  }

  function renderProfile() {
    renderProfilePlanCard();

    if (typeof window.isStateHydrated === 'function' && !window.isStateHydrated()) return;
    const state = getState();
    if (!state) return;
    const profName = $('#profName');
    const profSalary = $('#profSalary');
    const profSalaryDay = $('#profSalaryDay');
    const profBen = $('#profBenefit');

    if (profName && document.activeElement !== profName) {
      profName.value = state.profile?.name || '';
    }
    if (profSalary && document.activeElement !== profSalary) {
      profSalary.value = state.profile?.baseSalary != null ? state.profile.baseSalary : '';
    }
    if (profSalaryDay && document.activeElement !== profSalaryDay) {
      const salDay = state.profile?.salaryPayment?.day != null
        ? state.profile.salaryPayment.day
        : (state.profile?.salaryDay != null ? state.profile.salaryDay : '');
      profSalaryDay.value = salDay;
    }
    if (profBen && document.activeElement !== profBen) {
      profBen.value = state.benefitsConfig?.amount != null
        ? state.benefitsConfig.amount
        : (Number(state.benefitsConfig?.va || 0) + Number(state.benefitsConfig?.vr || 0));
    }

    renderMobileNavPreferences();
    if (typeof window.validateChangePasswordForm === 'function') {
      window.validateChangePasswordForm();
    }
  }

  function renderMobileNavPreferences() {
    const container = $('#mobileNavFavoritesPicker');
    if (!container) return;

    const state = getState();
    if (!state) return;

    state.preferences = state.preferences || {};
    const rawFavs = (Array.isArray(state.preferences.mobileNavigation) && state.preferences.mobileNavigation.length > 0)
      ? state.preferences.mobileNavigation
      : ['tab-dashboard', 'tab-expenses', 'tab-debtors'];

    const normalize = (typeof window.normalizeTabId === 'function')
      ? window.normalizeTabId
      : (t) => (t && t.startsWith('tab-') ? t : 'tab-' + t);

    const currentFavs = rawFavs.map(normalize);
    const modules = window.MOBILE_MODULE_CONFIG || [
      { tabId: 'tab-dashboard', key: 'dashboard', label: 'Dashboard' },
      { tabId: 'tab-expenses', key: 'despesas', label: 'Despesas' },
      { tabId: 'tab-debtors', key: 'devedores', label: 'Devedores' },
      { tabId: 'tab-extras', key: 'extras', label: 'Extras' },
      { tabId: 'tab-investments', key: 'investimentos', label: 'Investir' },
      { tabId: 'tab-benefits', key: 'beneficios', label: 'Benefícios' },
      { tabId: 'tab-shopping', key: 'compras', label: 'Compras' },
      { tabId: 'tab-simulation', key: 'simulacao', label: 'Simulação' }
    ];

    // Filtra módulos permitidos por RBAC
    const allowedModules = modules.filter(m => (typeof window.hasTabPermission === 'function' ? window.hasTabPermission(m.tabId) : true));

    // Ordena para exibir selecionados no topo de acordo com a ordem de currentFavs, seguidos pelos não selecionados
    const sortedModules = [...allowedModules].sort((a, b) => {
      const idxA = currentFavs.indexOf(a.tabId);
      const idxB = currentFavs.indexOf(b.tabId);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });

    container.innerHTML = sortedModules.map((m) => {
      const isSelected = currentFavs.includes(m.tabId);
      const favIndex = currentFavs.indexOf(m.tabId);
      const canMoveUp = isSelected && favIndex > 0;
      const canMoveDown = isSelected && favIndex < currentFavs.length - 1;

      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:var(--surface-2); border:1px solid var(--line); border-radius:10px; gap:8px;">
          <label style="display:flex; align-items:center; gap:10px; cursor:pointer; flex:1; margin:0; user-select:none;">
            <input type="checkbox" class="mobile-nav-fav-check" data-tab-id="${m.tabId}" ${isSelected ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer; accent-color:var(--brand);">
            <div style="display:flex; align-items:center; gap:8px; font-weight:750; font-size:0.9rem; color:var(--text);">
              ${m.iconSvg || ''}
              <span>${m.label}</span>
            </div>
          </label>
          ${isSelected ? `
            <div style="display:flex; align-items:center; gap:4px;">
              <span class="badge info" style="font-size:0.7rem; padding:2px 6px;">Posição #${favIndex + 1}</span>
              <button type="button" class="icon-btn small move-fav-up-btn" data-tab-id="${m.tabId}" ${!canMoveUp ? 'disabled style="opacity:0.35;"' : ''} data-tooltip="Mover para cima" aria-label="Mover para cima">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px;"><polyline points="18 15 12 9 6 15"></polyline></svg>
              </button>
              <button type="button" class="icon-btn small move-fav-down-btn" data-tab-id="${m.tabId}" ${!canMoveDown ? 'disabled style="opacity:0.35;"' : ''} data-tooltip="Mover para baixo" aria-label="Mover para baixo">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px;"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    const warningEl = $('#mobileNavFavoritesWarning');

    // Listeners de checkboxes
    container.querySelectorAll('.mobile-nav-fav-check').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const tabId = chk.getAttribute('data-tab-id');
        let favs = [...currentFavs];
        if (chk.checked) {
          if (favs.length >= 3) {
            e.preventDefault();
            chk.checked = false;
            if (warningEl) {
              warningEl.style.display = 'flex';
            }
            if (typeof notify === 'function') {
              notify('Você pode escolher até 3 atalhos.', 'warning');
            }
            return;
          }
          if (!favs.includes(tabId)) {
            favs.push(tabId);
          }
        } else {
          favs = favs.filter(t => t !== tabId);
          if (warningEl) warningEl.style.display = 'none';
        }

        state.preferences.mobileNavigation = favs;
        saveState();
        if (typeof window.renderMobileBottomNav === 'function') {
          window.renderMobileBottomNav();
        }
        renderMobileNavPreferences();
      });
    });

    // Listeners de Reordenação
    container.querySelectorAll('.move-fav-up-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab-id');
        const idx = currentFavs.indexOf(tabId);
        if (idx > 0) {
          const favs = [...currentFavs];
          const temp = favs[idx - 1];
          favs[idx - 1] = favs[idx];
          favs[idx] = temp;
          state.preferences.mobileNavigation = favs;
          saveState();
          if (typeof window.renderMobileBottomNav === 'function') {
            window.renderMobileBottomNav();
          }
          renderMobileNavPreferences();
        }
      });
    });

    container.querySelectorAll('.move-fav-down-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab-id');
        const idx = currentFavs.indexOf(tabId);
        if (idx !== -1 && idx < currentFavs.length - 1) {
          const favs = [...currentFavs];
          const temp = favs[idx + 1];
          favs[idx + 1] = favs[idx];
          favs[idx] = temp;
          state.preferences.mobileNavigation = favs;
          saveState();
          if (typeof window.renderMobileBottomNav === 'function') {
            window.renderMobileBottomNav();
          }
          renderMobileNavPreferences();
        }
      });
    });
  }
  window.renderMobileNavPreferences = renderMobileNavPreferences;

  function initChangePasswordForm() {
    const form = $('#changePasswordForm');
    if (!form) return;

    const currentPassInput = $('#currentPasswordInput');
    const newPassInput = $('#newPasswordInput');
    const confirmPassInput = $('#confirmPasswordInput');
    const submitBtn = $('#btnChangePasswordSubmit');
    const feedbackBox = $('#changePasswordFeedback');

    const checklistElements = {
      len: $('#userCritLen'),
      upper: $('#userCritUpper'),
      lower: $('#userCritLower'),
      num: $('#userCritNum'),
      spec: $('#userCritSpec'),
      match: $('#userCritMatch')
    };

    function validateFormState() {
      const currentPass = currentPassInput ? currentPassInput.value : '';
      const newPass = newPassInput ? newPassInput.value : '';
      const confirmPass = confirmPassInput ? confirmPassInput.value : '';

      const criteria = (window.PasswordPolicy && typeof window.PasswordPolicy.checkCriteria === 'function')
        ? window.PasswordPolicy.checkCriteria(newPass, confirmPass)
        : {
            hasLen: newPass.length >= 8 && newPass.length <= 128,
            hasUpper: /[A-Z]/.test(newPass),
            hasLower: /[a-z]/.test(newPass),
            hasNum: /[0-9]/.test(newPass),
            hasSpec: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPass),
            isValid: newPass.length >= 8 && newPass.length <= 128 && /[A-Z]/.test(newPass) && /[a-z]/.test(newPass) && /[0-9]/.test(newPass) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPass),
            hasMatch: Boolean(newPass && confirmPass && newPass === confirmPass)
          };

      if (window.PasswordPolicy && typeof window.PasswordPolicy.updateChecklist === 'function') {
        window.PasswordPolicy.updateChecklist(checklistElements, criteria);
      }

      const canSubmit = Boolean(
        currentPass.length > 0 &&
        criteria.isValid &&
        newPass.length <= 128 &&
        confirmPass.length > 0 &&
        criteria.hasMatch
      );

      if (submitBtn) {
        submitBtn.disabled = !canSubmit;
      }

      return canSubmit;
    }

    ['input', 'change', 'keyup'].forEach(evt => {
      currentPassInput?.addEventListener(evt, validateFormState);
      newPassInput?.addEventListener(evt, validateFormState);
      confirmPassInput?.addEventListener(evt, validateFormState);
    });

    // Garante validação integral e estado disabled imediatamente na inicialização
    validateFormState();
    window.validateChangePasswordForm = validateFormState;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateFormState()) return;

      const currentPass = currentPassInput.value;
      const newPass = newPassInput.value;

      submitBtn.disabled = true;
      const origText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span>Alterando senha...</span>';
      if (feedbackBox) {
        feedbackBox.style.display = 'none';
        feedbackBox.textContent = '';
      }

      try {
        const res = await API.changePassword(currentPass, newPass);

        if (res && res.success) {
          // Limpa imediatamente credenciais dos inputs
          currentPassInput.value = '';
          newPassInput.value = '';
          confirmPassInput.value = '';
          validateFormState();

          if (feedbackBox) {
            feedbackBox.style.display = 'block';
            feedbackBox.style.background = 'var(--brand-soft)';
            feedbackBox.style.color = 'var(--brand-strong)';
            feedbackBox.style.border = '1px solid var(--brand)';
            feedbackBox.textContent = 'Senha alterada com sucesso! Você será desconectado e precisará entrar novamente.';
          }

          if (typeof notify === 'function') {
            notify('Senha alterada com sucesso! Redirecionando...', 'success');
          }

          if (typeof API.clearSession === 'function') {
            API.clearSession();
          }

          setTimeout(() => {
            const loginUrl = (window.withBasePath && typeof window.withBasePath === 'function')
              ? window.withBasePath('/login.html')
              : '/login.html';
            window.location.href = loginUrl;
          }, 1800);
        } else {
          submitBtn.innerHTML = origText;
          validateFormState();
          const msg = res && res.message ? res.message : 'Falha ao alterar senha. Verifique os dados informados.';

          if (feedbackBox) {
            feedbackBox.style.display = 'block';
            feedbackBox.style.background = 'var(--danger-soft)';
            feedbackBox.style.color = 'var(--danger)';
            feedbackBox.style.border = '1px solid var(--danger)';
            feedbackBox.textContent = msg;
          }

          if (typeof notify === 'function') {
            notify(msg, 'error');
          }
        }
      } catch (err) {
        submitBtn.innerHTML = origText;
        validateFormState();
        const errMsg = 'Erro de conexão ao tentar alterar a senha.';

        if (feedbackBox) {
          feedbackBox.style.display = 'block';
          feedbackBox.style.background = 'var(--danger-soft)';
          feedbackBox.style.color = 'var(--danger)';
          feedbackBox.style.border = '1px solid var(--danger)';
          feedbackBox.textContent = errMsg;
        }

        if (typeof notify === 'function') {
          notify(errMsg, 'error');
        }
      }
    });
  }

  function initProfileForm() {
    renderProfile();
    initChangePasswordForm();

    $('#profileForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const state = getState();
      state.profile.name = $('#profName').value.trim();
      state.profile.baseSalary = Number($('#profSalary').value) || 0;
      const rawSalDay = $('#profSalaryDay')?.value;
      if (rawSalDay !== undefined && rawSalDay !== '' && !isNaN(Number(rawSalDay))) {
        const numDay = Math.min(31, Math.max(1, parseInt(rawSalDay, 10)));
        state.profile.salaryPayment = { type: 'fixed_day', day: numDay };
      } else {
        delete state.profile.salaryPayment;
      }
      state.benefitsConfig = state.benefitsConfig || { amount: 0 };
      const benVal = Number($('#profBenefit')?.value) || 0;
      state.benefitsConfig.amount = benVal;
      saveState(); render();
      notify('Perfil e Benefícios atualizados com sucesso!', 'success');
    });

    $$('.color-swatch-btn:not(.cat-color-swatch-btn)').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = btn.getAttribute('data-color');
        if (c && $('#newDestColor')) {
          $('#newDestColor').value = c;
        }
      });
    });

    $$('.cat-color-swatch-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = btn.getAttribute('data-color');
        if (c && $('#newCategoryColor')) {
          $('#newCategoryColor').value = c;
        }
      });
    });

    $('#addDestBtn')?.addEventListener('click', () => {
      const state = getState();
      const val = $('#newDestInput').value.trim();
      const dueDayInput = $('#newDestDueDay')?.value;
      const dueDayNum = Number(dueDayInput);
      const isNative = (val.toLowerCase() === 'pix' || val.toLowerCase() === 'dinheiro');
      const dueDay = (!isNative && dueDayInput !== '' && dueDayNum >= 1 && dueDayNum <= 31) ? dueDayNum : null;
      const color = $('#newDestColor').value || '#1F7A5C';
      const icon = $('#newDestIcon').value || (val.toLowerCase() === 'pix' ? 'dollar' : (val.toLowerCase() === 'dinheiro' ? 'wallet' : 'card'));
      const origName = $('#editingDestOriginalName').value;

      if (!val) { notify('Informe o nome do destino.', 'error'); return; }

      if (origName) {
        const idx = state.destinations.findIndex(d => d.name === origName);
        if (idx >= 0) state.destinations[idx] = { name: val, color, icon, dueDay };
        if (origName !== val) {
          state.fixed.forEach(f => { if (f.destination === origName) f.destination = val; });
          state.variable.forEach(v => { if (v.destination === origName) v.destination = val; });
          state.debtors.forEach(d => { if (d.destination === origName) d.destination = val; });
          state.assets.forEach(a => { if (a.destination === origName) a.destination = val; });
        }
        $('#editingDestOriginalName').value = '';
        $('#addDestBtn').textContent = 'Adicionar';
        notify(`Destino "${val}" atualizado com sucesso!`, 'success');
      } else {
        const existingIdx = state.destinations.findIndex(d => d.name === val);
        if (existingIdx >= 0) { state.destinations[existingIdx] = { name: val, color, icon, dueDay }; }
        else { state.destinations.push({ name: val, color, icon, dueDay }); }
        notify(`Destino "${val}" adicionado com sucesso!`, 'success');
      }

      $('#newDestInput').value = '';
      if ($('#newDestDueDay')) $('#newDestDueDay').value = '';
      saveState(); updateDestinationSelects(); render();
    });

    $('#addCategoryBtn')?.addEventListener('click', () => {
      const state = getState();
      const catName = $('#newCategoryInput').value.trim();
      const icon = $('#newCategoryIcon')?.value || 'tag';
      const color = $('#newCategoryColor')?.value || '#10B981';
      const budgetVal = Number($('#newCategoryBudgetInput').value) || 0;
      const origCat = $('#editingCategoryOriginalName').value;

      if (!catName) { notify('Informe o nome da categoria.', 'error'); return; }

      state.categories = Array.isArray(state.categories) ? state.categories : [];

      if (origCat) {
        const idx = state.categories.findIndex(x => ((typeof getCategoryName === 'function') ? getCategoryName(x) : (typeof x === 'string' ? x : x.name)) === origCat);
        if (idx >= 0) state.categories[idx] = { name: catName, icon, color };
        delete state.budgets[origCat];
        if (budgetVal > 0) state.budgets[catName] = budgetVal;

        if (origCat !== catName) {
          state.fixed.forEach(f => { if (f.group === origCat) f.group = catName; });
          state.variable.forEach(v => { if (v.group === origCat) v.group = catName; });
          state.extras.forEach(e => { if (e.source === origCat) e.source = catName; });
          state.assets.forEach(a => { if (a.category === origCat) a.category = catName; });
        }
        $('#editingCategoryOriginalName').value = '';
        $('#addCategoryBtn').textContent = 'Adicionar Categoria';
        notify(`Categoria "${catName}" atualizada com sucesso!`, 'success');
      } else {
        const existingIdx = state.categories.findIndex(x => ((typeof getCategoryName === 'function') ? getCategoryName(x) : (typeof x === 'string' ? x : x.name)) === catName);
        if (existingIdx >= 0) {
          state.categories[existingIdx] = { name: catName, icon, color };
        } else {
          state.categories.push({ name: catName, icon, color });
        }
        if (budgetVal > 0) state.budgets[catName] = budgetVal;
        else delete state.budgets[catName];
        notify(`Categoria "${catName}" cadastrada com sucesso!`, 'success');
      }

      $('#newCategoryInput').value = '';
      if ($('#newCategoryIcon')) $('#newCategoryIcon').value = 'tag';
      if ($('#newCategoryColor')) $('#newCategoryColor').value = '#10B981';
      $('#newCategoryBudgetInput').value = '';

      saveState(); updateDestinationSelects(); updateCategorySelects(); updateCategoryTagsList(); render();
    });
  }

  // Bridges publicas autorizadas
  window.updateCategorySelects = updateCategorySelects;
  window.updateDestinationSelects = updateDestinationSelects;
  window.updateCategoryTagsList = updateCategoryTagsList;
  window.getDestMeta = getDestMeta;
  window.renderProfile = renderProfile;
  window.renderProfileTab = renderProfile;
  window.renderProfilePlanCard = renderProfilePlanCard;
  window.initProfileModule = initProfileForm;
})();
