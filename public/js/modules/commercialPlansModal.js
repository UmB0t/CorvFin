/**
 * ==============================================================================
 * CorvFin V3 - Módulo Comercial: Comparativo de Planos & Limites (commercialPlansModal.js)
 * Fase 5H: UX Comercial, Plano Atual, Consumo de IA e Estados de Upgrade
 * ==============================================================================
 */

(function () {
  'use strict';

  let cachedPlans = null;
  let cachedContext = null;
  let isFetching = false;

  const RESOURCE_LABELS = {
    despesas: 'Despesas Cadastradas',
    devedores: 'Devedores Ativos',
    rendasExtras: 'Rendas Extras',
    investimentos: 'Investimentos',
    beneficios: 'Lançamentos de Benefícios',
    compras: 'Itens na Lista de Compras',
    anexos: 'Anexos de Mídia (Comprovantes)',
    ai: 'Créditos Diários de IA'
  };

  function formatCentsToCurrency(cents) {
    if (typeof cents !== 'number' || isNaN(cents) || cents === 0) {
      return 'R$ 0,00';
    }
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatBillingInterval(interval) {
    switch (interval) {
      case 'yearly':
      case 'year':
        return '/ano';
      case 'lifetime':
        return ' (pagamento único)';
      case 'monthly':
      case 'month':
      default:
        return '/mês';
    }
  }

  function formatLimitValue(val) {
    if (val === null || val === undefined) return 'Ilimitado';
    if (typeof val === 'number') {
      return val.toLocaleString('pt-BR');
    }
    return String(val);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Obtém o contexto comercial do usuário com cache suave
   */
  async function fetchCommercialContext(forceRefresh = false) {
    if (!forceRefresh && cachedContext) {
      return cachedContext;
    }
    if (window.API && typeof window.API.getCommercialContext === 'function') {
      const res = await window.API.getCommercialContext({ forceRefresh });
      if (res && res.success) {
        const data = (res.data && res.data.plan) ? res.data : (res.plan ? res : res.data);
        cachedContext = data;
        window._cachedCommercialContext = data;
        return data;
      }
      return res;
    }
    return null;
  }

  /**
   * Obtém lista de planos ativos (status === active)
   */
  async function fetchActivePlans(forceRefresh = false) {
    if (!forceRefresh && cachedPlans) {
      return cachedPlans;
    }
    if (window.API && typeof window.API.getActivePlans === 'function') {
      const res = await window.API.getActivePlans();
      if (res && res.success) {
        const rawList = Array.isArray(res.plans) ? res.plans : (Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []));
        cachedPlans = rawList;
        return rawList;
      }
      const err = new Error(res?.message || 'Erro ao carregar catálogo de planos.');
      err.status = res?.status || 500;
      throw err;
    }
    throw new Error('API getActivePlans indisponível.');
  }

  /**
   * Renderiza a grade de planos dentro do modal
   */
  function renderPlansGrid(plans, currentPlanId, isLegacyCurrentPlan = false) {
    const container = document.getElementById('plansGridContainer');
    if (!container) return;

    if (!Array.isArray(plans) || plans.length === 0) {
      container.innerHTML = `
        <div class="plans-empty-state" style="text-align:center; padding:32px 16px; color:var(--muted); grid-column:1/-1;">
          <p style="font-weight:700; font-size:0.95rem;">Nenhum plano disponível para contratação no momento.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = plans.map(plan => {
      const isCurrent = !isLegacyCurrentPlan && (plan.id === currentPlanId || plan.slug === currentPlanId);
      const cents = plan.pricing?.amountCents ?? plan.pricing?.cents ?? 0;
      const interval = plan.pricing?.interval || plan.pricing?.billingInterval;
      const isFree = (cents === 0);
      const priceFormatted = isFree ? 'Gratuito' : formatCentsToCurrency(cents);
      const intervalFormatted = isFree ? '' : formatBillingInterval(interval);

      // Limite de IA
      const aiLimit = plan.limits?.aiCreditsDaily;
      let aiText = 'Sem créditos de IA';
      if (aiLimit === null || aiLimit === undefined) {
        aiText = 'IA ilimitada';
      } else if (aiLimit > 0) {
        aiText = `${aiLimit} consultas de IA / dia`;
      }

      // Lista de features
      const features = Array.isArray(plan.metadata?.featuresSummary) && plan.metadata.featuresSummary.length > 0
        ? plan.metadata.featuresSummary
        : [
            aiText,
            `Até ${formatLimitValue(plan.limits?.maxExpensesPerMonth)} despesas / mês`,
            `Até ${formatLimitValue(plan.limits?.maxActiveDebtors)} devedores ativos`,
            `Até ${formatLimitValue(plan.limits?.maxMediaAttachments)} comprovantes / anexos`
          ];

      return `
        <div class="plan-card ${isCurrent ? 'plan-card--current' : ''}">
          ${isCurrent ? '<div class="plan-card-badge">Seu Plano Atual</div>' : ''}
          
          <div class="plan-card-header">
            <h4 class="plan-card-title">${escapeHtml(plan.name)}</h4>
            <p class="plan-card-desc">${escapeHtml(plan.description || '')}</p>
          </div>

          <div class="plan-card-pricing">
            <span class="plan-price-value">${priceFormatted}</span>
            <span class="plan-price-interval">${intervalFormatted}</span>
          </div>

          <div class="plan-card-divider"></div>

          <div class="plan-card-section-title">O que inclui:</div>
          <ul class="plan-features-list">
            <li class="plan-feature-item">
              <span class="plan-feature-icon" style="color:var(--brand);">✓</span>
              <strong>${escapeHtml(aiText)}</strong>
            </li>
            ${features.filter(f => f !== aiText).map(f => `
              <li class="plan-feature-item">
                <span class="plan-feature-icon" style="color:var(--brand);">✓</span>
                <span>${escapeHtml(f)}</span>
              </li>
            `).join('')}
          </ul>

          <div class="plan-card-divider"></div>

          <div class="plan-card-limits">
            <div class="plan-limit-row">
              <span class="plan-limit-name">Despesas / mês</span>
              <span class="plan-limit-val">${formatLimitValue(plan.limits?.maxExpensesPerMonth)}</span>
            </div>
            <div class="plan-limit-row">
              <span class="plan-limit-name">Devedores ativos</span>
              <span class="plan-limit-val">${formatLimitValue(plan.limits?.maxActiveDebtors)}</span>
            </div>
            <div class="plan-limit-row">
              <span class="plan-limit-name">Anexos / mídia</span>
              <span class="plan-limit-val">${formatLimitValue(plan.limits?.maxMediaAttachments)}</span>
            </div>
          </div>

          <div class="plan-card-actions">
            ${isCurrent ? `
              <button type="button" class="btn secondary full-width" disabled style="opacity:0.85; cursor:default; font-weight:750;">
                Plano Atual
              </button>
            ` : `
              <button type="button" class="btn primary full-width btn-plan-interest" data-plan-id="${escapeHtml(plan.id)}" data-plan-name="${escapeHtml(plan.name)}">
                Assinaturas online em breve
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');

    // Listener para o botão informativo (Ajuste 4: sem self-service/falso checkout)
    container.querySelectorAll('.btn-plan-interest').forEach(btn => {
      btn.addEventListener('click', () => {
        const planName = btn.getAttribute('data-plan-name') || 'selecionado';
        if (typeof window.notify === 'function') {
          window.notify(`As assinaturas online do plano "${planName}" estarão disponíveis em breve. Para contratar antecipadamente, contate o suporte.`, 'info');
        } else {
          alert(`As assinaturas online do plano "${planName}" estarão disponíveis em breve. Para contratar antecipadamente, contate o suporte.`);
        }
      });
    });
  }

  /**
   * Abre o modal comparativo de planos
   */
  async function openCommercialPlansModal() {
    const modal = document.getElementById('plansModal');
    if (!modal) return;

    if (typeof modal.showModal === 'function') {
      try {
        if (!modal.open) modal.showModal();
      } catch (_) {
        modal.setAttribute('open', '');
      }
    } else {
      modal.setAttribute('open', '');
    }

    const container = document.getElementById('plansGridContainer');
    if (container && (!cachedPlans || !cachedContext)) {
      container.innerHTML = `
        <div style="text-align:center; padding:40px 16px; color:var(--muted); grid-column:1/-1;">
          <div class="spinner" style="margin:0 auto 12px auto;"></div>
          <p style="font-weight:700; font-size:0.9rem;">Carregando planos disponíveis...</p>
        </div>
      `;
    }

    try {
      const [context, plans] = await Promise.all([
        fetchCommercialContext(),
        fetchActivePlans()
      ]);

      const currentPlan = context?.plan;
      const isLegacy = currentPlan && (currentPlan.status === 'inactive' || currentPlan.status === 'archived');
      const currentPlanId = currentPlan?.id || currentPlan?.slug || 'free';

      const legacyBanner = document.getElementById('currentLegacyPlanBanner');
      if (legacyBanner) {
        if (isLegacy) {
          legacyBanner.style.display = 'block';
          legacyBanner.innerHTML = `
            <div style="background:var(--surface-2); border:1px solid var(--line); border-left:4px solid var(--warning); border-radius:12px; padding:14px 18px; margin-bottom:18px;">
              <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                <div>
                  <div style="font-size:0.72rem; font-weight:800; text-transform:uppercase; color:var(--muted); letter-spacing:0.5px;">Seu Plano Atual</div>
                  <h4 style="margin:2px 0 0 0; font-size:1.15rem; font-weight:850; color:var(--text);">${escapeHtml(currentPlan.name)}</h4>
                  <p style="margin:2px 0 0 0; font-size:0.82rem; color:var(--muted);">${escapeHtml(currentPlan.description || '')}</p>
                </div>
                <span class="badge warning" style="font-size:0.75rem; text-transform:uppercase; font-weight:800; padding:4px 8px;">
                  Legado / Não disponível para novas assinaturas
                </span>
              </div>
            </div>
            <div style="margin-bottom:12px; font-size:0.86rem; font-weight:800; color:var(--text); text-transform:uppercase; letter-spacing:0.4px;">
              Planos Disponíveis para Migração
            </div>
          `;
        } else {
          legacyBanner.style.display = 'none';
          legacyBanner.innerHTML = '';
        }
      }

      renderPlansGrid(plans, currentPlanId, isLegacy);
    } catch (err) {
      console.error('[CommercialPlansModal] Falha ao carregar planos:', err);
      if (container) {
        container.innerHTML = `
          <div style="text-align:center; padding:32px 16px; color:var(--danger); grid-column:1/-1;">
            <p style="font-weight:750;">Não foi possível carregar os planos no momento.</p>
            <button type="button" class="btn soft small" id="btnRetryLoadPlans" style="margin-top:10px;">Tentar novamente</button>
          </div>
        `;
        document.getElementById('btnRetryLoadPlans')?.addEventListener('click', () => {
          openCommercialPlansModal();
        });
      }
    }
  }

  /**
   * Exibe o modal amigável quando um limite quantitativo de recurso for atingido (HTTP 403 RESOURCE_LIMIT_REACHED)
   */
  function showResourceLimitModal(limitData = {}) {
    const modal = document.getElementById('resourceLimitModal');
    if (!modal) {
      if (typeof window.notify === 'function') {
        window.notify(limitData.message || 'Limite do seu plano atingido.', 'warning');
      }
      return;
    }

    const resourceKey = limitData.resource || '';
    const resourceLabel = RESOURCE_LABELS[resourceKey] || resourceKey || 'Itens';
    const limit = limitData.limit;
    const currentCount = limitData.currentCount;

    const titleEl = document.getElementById('resourceLimitTitle');
    const msgEl = document.getElementById('resourceLimitMessage');
    const detailsEl = document.getElementById('resourceLimitDetails');

    if (titleEl) {
      titleEl.textContent = `Limite de ${resourceLabel} Atingido`;
    }

    if (msgEl) {
      msgEl.textContent = limitData.message || `Você atingiu o teto permitido para ${resourceLabel.toLowerCase()} no seu plano atual.`;
    }

    if (detailsEl) {
      let detailsHtml = `<strong>Cota do plano:</strong> ${formatLimitValue(limit)}`;
      if (currentCount != null) {
        detailsHtml += ` • <strong>Uso atual:</strong> ${currentCount}`;
      }
      detailsEl.innerHTML = detailsHtml;
    }

    const upgradeBtn = document.getElementById('btnResourceLimitUpgrade');
    if (upgradeBtn) {
      upgradeBtn.onclick = () => {
        if (typeof modal.close === 'function') modal.close();
        else modal.removeAttribute('open');
        openCommercialPlansModal();
      };
    }

    if (typeof modal.showModal === 'function') {
      try {
        if (!modal.open) modal.showModal();
      } catch (_) {
        modal.setAttribute('open', '');
      }
    } else {
      modal.setAttribute('open', '');
    }
  }

  // Inicialização de fechamento de modais com data-close
  function initModalDismissals() {
    document.querySelectorAll('#plansModal [data-close], #resourceLimitModal [data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dialog = btn.closest('dialog');
        if (dialog) {
          if (typeof dialog.close === 'function') dialog.close();
          else dialog.removeAttribute('open');
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModalDismissals);
  } else {
    initModalDismissals();
  }

  // Bridges públicas autorizadas
  window.openCommercialPlansModal = openCommercialPlansModal;
  window.showResourceLimitModal = showResourceLimitModal;
  window.fetchCommercialContext = fetchCommercialContext;
  window.fetchActivePlans = fetchActivePlans;
  window.formatCentsToCurrency = formatCentsToCurrency;
  window.formatBillingInterval = formatBillingInterval;
})();
