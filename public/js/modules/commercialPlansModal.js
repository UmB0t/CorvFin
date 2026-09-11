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

  /**
   * Formata a copy da duração da promoção comercial de acordo com o período e o ciclo de cobrança.
   *
   * @param {number|string} periods - Quantidade de períodos/ciclos da promoção (ex: 1, 2, 12).
   * @param {string} billingInterval - Intervalo de faturamento ('monthly' | 'yearly').
   * @returns {string} Copy formatada (ex: "primeiro mês", "primeiros 2 meses", "primeiro ano", "primeiros 3 anos").
   */
  function formatPromotionDuration(periods, billingInterval) {
    const num = parseInt(periods, 10);
    const p = (!isNaN(num) && num > 0) ? num : 1;
    const isYearly = String(billingInterval || '').toLowerCase() === 'yearly' || String(billingInterval || '').toLowerCase() === 'year';
    if (isYearly) {
      return p === 1 ? 'primeiro ano' : `primeiros ${p} anos`;
    }
    return p === 1 ? 'primeiro mês' : `primeiros ${p} meses`;
  }

  function formatLimitValue(val) {
    if (val === null) return 'Ilimitado';
    if (typeof val === 'number') {
      return val.toLocaleString('pt-BR');
    }
    return '—';
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

  let activeInterval = 'monthly';
  let lastRenderedPlans = [];
  let lastCurrentPlanId = null;
  let lastIsLegacy = false;

  function formatDatePtBr(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  /**
   * Normalizador cliente resiliente: tolera dados legados (amountCents / interval)
   * e converte para canonical offers sem requerer re-fetch.
   */
  function normalizeClientPricing(rawPricing) {
    if (!rawPricing || typeof rawPricing !== 'object') {
      return {
        currency: 'BRL',
        offers: {
          monthly: { regularPriceCents: 0 }
        }
      };
    }

    if (rawPricing.offers && typeof rawPricing.offers === 'object') {
      return {
        currency: rawPricing.currency || 'BRL',
        offers: { ...rawPricing.offers }
      };
    }

    const legacyCents = typeof rawPricing.amountCents === 'number'
      ? rawPricing.amountCents
      : (typeof rawPricing.cents === 'number' ? rawPricing.cents : 0);
    const legacyInterval = String(rawPricing.interval || rawPricing.billingInterval || 'month').toLowerCase();
    const isYearly = legacyInterval.includes('year');

    return {
      currency: rawPricing.currency || 'BRL',
      isLegacy: true,
      legacyInterval: isYearly ? 'yearly' : 'monthly',
      offers: isYearly
        ? { yearly: { regularPriceCents: legacyCents } }
        : { monthly: { regularPriceCents: legacyCents } }
    };
  }

  /**
   * Computa a economia máxima anual em porcentagem
   */
  function calculateMaxAnnualSavings(plans) {
    if (!Array.isArray(plans) || plans.length === 0) return 0;
    let maxPct = 0;
    for (const plan of plans) {
      const normalized = normalizeClientPricing(plan.pricing);
      const monthly = normalized.offers?.monthly;
      const yearly = normalized.offers?.yearly;
      if (monthly && yearly && typeof monthly.regularPriceCents === 'number' && typeof yearly.regularPriceCents === 'number') {
        const monthlyCents = monthly.regularPriceCents;
        const yearlyCents = yearly.regularPriceCents;
        if (monthlyCents > 0 && yearlyCents > 0) {
          const annualized = monthlyCents * 12;
          const diff = annualized - yearlyCents;
          if (diff > 0) {
            const pct = Math.round((diff / annualized) * 100);
            if (pct > maxPct) maxPct = pct;
          }
        }
      }
    }
    return maxPct;
  }

  /**
   * Atualiza a visibilidade e estado dos controles do carrossel único
   */
  function updateCarouselControls() {
    const viewport = document.getElementById('plansCarouselViewport');
    const btnPrev = document.getElementById('btnPlansPrev');
    const btnNext = document.getElementById('btnPlansNext');
    if (!viewport || !btnPrev || !btnNext) return;

    const scrollWidth = viewport.scrollWidth;
    const clientWidth = viewport.clientWidth;
    const hasOverflow = scrollWidth > clientWidth + 8;

    if (!hasOverflow) {
      btnPrev.style.display = 'none';
      btnNext.style.display = 'none';
      return;
    }

    btnPrev.style.display = 'flex';
    btnNext.style.display = 'flex';

    const scrollLeft = viewport.scrollLeft;
    btnPrev.disabled = scrollLeft <= 4;
    btnPrev.style.opacity = btnPrev.disabled ? '0.35' : '1';
    btnPrev.style.cursor = btnPrev.disabled ? 'default' : 'pointer';

    btnNext.disabled = (scrollLeft + clientWidth) >= (scrollWidth - 6);
    btnNext.style.opacity = btnNext.disabled ? '0.35' : '1';
    btnNext.style.cursor = btnNext.disabled ? 'default' : 'pointer';
  }

  /**
   * Filtra planos ativos que incluem determinado recurso
   */
  function filterPlansByResource(plans, resourceKey) {
    if (!Array.isArray(plans)) return [];
    if (!resourceKey) return plans;
    return plans.filter(p => {
      // 1. Autoridade primária: entitlements
      if (p.entitlements && typeof p.entitlements === 'object' && p.entitlements[resourceKey] !== undefined) {
        return p.entitlements[resourceKey]?.enabled === true;
      }
      // 2. Fallback para incluídos legados
      if (Array.isArray(p.includedResources)) {
        return p.includedResources.includes(resourceKey);
      }
      return false;
    });
  }

  /**
   * Obtém limite de recurso do plano preservando semântica canônica (null=ilimitado, int>=0=limite, undefined=ausente)
   */
  function getPlanResourceLimit(plan, resourceKey, limitKey) {
    if (!plan) return undefined;
    if (plan.entitlements && plan.entitlements[resourceKey]) {
      const ent = plan.entitlements[resourceKey];
      if (ent.enabled === false) return 0;
      if (ent.limits && Object.prototype.hasOwnProperty.call(ent.limits, limitKey)) {
        return ent.limits[limitKey];
      }
    }
    if (plan.limits) {
      if (resourceKey === 'despesas' && (limitKey === 'maxItems' || limitKey === 'maxExpensesPerMonth')) {
        return plan.limits.maxExpensesPerMonth ?? plan.limits.maxExpenses;
      }
      if (resourceKey === 'extras' && (limitKey === 'maxItems' || limitKey === 'maxExtras')) {
        return plan.limits.maxExtras;
      }
      if (resourceKey === 'devedores' && (limitKey === 'maxItems' || limitKey === 'maxActiveDebtors')) {
        return plan.limits.maxActiveDebtors ?? plan.limits.maxDebtors;
      }
      if (resourceKey === 'ai' && (limitKey === 'creditsPerDay' || limitKey === 'aiCreditsDaily')) {
        return plan.limits.aiCreditsDaily ?? plan.limits.aiDailyCredits;
      }
      if (resourceKey === 'investimentos' && limitKey === 'maxItems') {
        return plan.limits.maxInvestments;
      }
      if (resourceKey === 'beneficios' && limitKey === 'maxItems') {
        return plan.limits.maxBenefits;
      }
      if (resourceKey === 'compras' && limitKey === 'maxItems') {
        return plan.limits.maxShoppingLists;
      }
    }
    return undefined;
  }

  /**
   * Remove sufixos técnicos (ex.: "- Per Month", "- Per Year", "- Mensal", etc.)
   * apenas para exibição na UI comercial. Preserva o nome original no objeto do plano.
   */
  function formatCommercialPlanName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
      .replace(/\s*-\s*Per\s+(?:Month|Year|Mês|Ano)\b/gi, '')
      .replace(/\s*\((?:Per\s+)?(?:Month|Year|Mês|Ano)\)\s*/gi, '')
      .replace(/\s*-\s*(?:Mensal|Anual)\b/gi, '')
      .trim();
  }

  /**
   * Formata highlight para um recurso respeitando estritamente a semântica canônica:
   * limit === null => "ilimitado"
   * limit > 0 => "Até X ..."
   * limit === 0 => "0 ..." (sem capacidade quantitativa, nunca "ilimitado")
   * limit undefined => não é ilimitado
   */
  function formatResourceHighlight(resourceKey, limit, isEnabled) {
    if (isEnabled === false) return null;

    switch (resourceKey) {
      case 'ai': {
        if (limit === null) return 'IA ilimitada';
        if (Number.isInteger(limit) && limit > 0) {
          return `${limit} ${limit === 1 ? 'crédito' : 'créditos'} de IA por dia`;
        }
        if (limit === 0) return '0 créditos de IA por dia';
        return null;
      }
      case 'despesas': {
        if (limit === null) return 'Despesas ilimitadas';
        if (Number.isInteger(limit) && limit > 0) return `Até ${limit} despesas cadastradas`;
        if (limit === 0) return '0 despesas cadastradas';
        return null;
      }
      case 'extras': {
        if (limit === null) return 'Rendas Extras ilimitadas';
        if (Number.isInteger(limit) && limit > 0) return `Até ${limit} rendas extras cadastradas`;
        if (limit === 0) return '0 rendas extras cadastradas';
        return null;
      }
      case 'devedores': {
        if (limit === null) return 'Devedores ativos ilimitados';
        if (Number.isInteger(limit) && limit > 0) return `Até ${limit} devedores ativos`;
        if (limit === 0) return '0 devedores ativos';
        return null;
      }
      case 'investimentos': {
        if (limit === null) return 'Investimentos ilimitados';
        if (Number.isInteger(limit) && limit > 0) return `Até ${limit} investimentos cadastrados`;
        if (limit === 0) return '0 investimentos cadastrados';
        return null;
      }
      case 'beneficios': {
        if (limit === null) return 'Transações de benefícios ilimitadas';
        if (Number.isInteger(limit) && limit > 0) return `Até ${limit} transações de benefícios`;
        if (limit === 0) return '0 transações de benefícios';
        return null;
      }
      case 'compras': {
        if (limit === null) return 'Listas de compras ilimitadas';
        if (Number.isInteger(limit) && limit > 0) return `Até ${limit} listas de compras`;
        if (limit === 0) return '0 listas de compras';
        return null;
      }
      case 'simulacao':
        return 'Simulação Financeira inclusa';
      case 'relatorios':
        return 'Relatórios Financeiros inclusos';
      case 'dashboard':
        return 'Dashboard Financeiro completo';
      default:
        return null;
    }
  }

  /**
   * Constrói a lista canônica de destaques do plano a partir dos entitlements e limites autoritativos.
   * Em contexto (contextualKey), o recurso motivador é destacado obrigatoriamente na 1ª posição (#0).
   * Depois do recurso contextual, os demais benefícios seguem a ordem canônica do registry.
   */
  function buildPlanFeatureHighlights(plan, contextualKey = null) {
    if (!plan) return [];
    const highlights = [];

    const getResHighlight = (resKey) => {
      let isEnabled = false;
      if (plan.entitlements && plan.entitlements[resKey] !== undefined) {
        isEnabled = plan.entitlements[resKey]?.enabled === true;
      } else if (Array.isArray(plan.includedResources)) {
        isEnabled = plan.includedResources.includes(resKey);
      }
      if (!isEnabled) return null;

      const limKey = resKey === 'ai' ? 'creditsPerDay' : 'maxItems';
      const limit = getPlanResourceLimit(plan, resKey, limKey);
      return formatResourceHighlight(resKey, limit, isEnabled);
    };

    // 1. Recurso motivador da tela contextual na posição 0
    if (contextualKey) {
      const targetH = getResHighlight(contextualKey);
      if (targetH) {
        highlights.push(targetH);
      } else if (Array.isArray(plan.featureHighlights)) {
        const found = plan.featureHighlights.find(h => {
          const lower = String(h).toLowerCase();
          if (contextualKey === 'extras') return lower.includes('renda');
          if (contextualKey === 'despesas') return lower.includes('despesa');
          if (contextualKey === 'devedores') return lower.includes('devedor');
          if (contextualKey === 'investimentos') return lower.includes('investimento');
          if (contextualKey === 'beneficios') return lower.includes('benefício') || lower.includes('beneficio');
          if (contextualKey === 'compras') return lower.includes('compra');
          if (contextualKey === 'ai') return lower.includes('ia') || lower.includes('crédito');
          return false;
        });
        if (found) highlights.push(found);
      }
    }

    // 2. Demais recursos habilitados na ordem canônica do registry
    const candidateKeys = ['despesas', 'extras', 'ai', 'devedores', 'investimentos', 'beneficios', 'compras', 'simulacao', 'relatorios', 'dashboard'];
    for (const key of candidateKeys) {
      if (key === contextualKey) continue;
      const h = getResHighlight(key);
      if (h && !highlights.includes(h)) {
        highlights.push(h);
      }
    }

    // Se highlights estiver vazio mas plan.featureHighlights vier pré-calculado do backend
    if (highlights.length === 0 && Array.isArray(plan.featureHighlights) && plan.featureHighlights.length > 0) {
      if (contextualKey) {
        const contextualItem = plan.featureHighlights.find(h => {
          const lower = String(h).toLowerCase();
          if (contextualKey === 'extras') return lower.includes('renda');
          if (contextualKey === 'despesas') return lower.includes('despesa');
          if (contextualKey === 'devedores') return lower.includes('devedor');
          if (contextualKey === 'investimentos') return lower.includes('investimento');
          if (contextualKey === 'beneficios') return lower.includes('benefício') || lower.includes('beneficio');
          if (contextualKey === 'compras') return lower.includes('compra');
          if (contextualKey === 'ai') return lower.includes('ia') || lower.includes('crédito');
          return false;
        });
        if (contextualItem) highlights.push(contextualItem);
        for (const it of plan.featureHighlights) {
          if (it !== contextualItem && !highlights.includes(it)) highlights.push(it);
        }
      } else {
        highlights.push(...plan.featureHighlights);
      }
    }

    return highlights;
  }

  /**
   * Renderiza a marcação HTML de um card comercial de plano
   */
  function renderCommercialPlanCardHtml(plan, options = {}) {
    const activeInt = options.activeInterval || activeInterval || 'monthly';
    const isCurrent = !options.isLegacyCurrentPlan && !!options.currentPlanId && (plan.id === options.currentPlanId || (plan.slug && plan.slug === options.currentPlanId));
    const normalizedPricing = normalizeClientPricing(plan.pricing);
    let offer = normalizedPricing.offers?.[activeInt];
    let displayInterval = activeInt;

    if (!offer && normalizedPricing.isLegacy) {
      offer = normalizedPricing.offers?.[normalizedPricing.legacyInterval];
      displayInterval = normalizedPricing.legacyInterval;
    }
    const hasOffer = !!(offer && offer.enabled !== false && (offer.enabled === true || offer.regularPriceCents !== undefined));

    let priceFormatted = 'Indisponível';
    let originalPriceFormatted = '';
    let promoBadgeHtml = '';
    let equivMonthlyHtml = '';
    let intervalFormatted = '';
    let isFree = false;

    if (hasOffer) {
      const regularCents = typeof offer.regularPriceCents === 'number' ? offer.regularPriceCents : 0;
      let effectiveCents = regularCents;
      isFree = (regularCents === 0);

      // Verifica promoções ativas (intro vs campaign)
      if (offer.intro?.enabled) {
        const promoCents = offer.intro.promotionalPriceCents ?? offer.intro.priceCents;
        const cycles = offer.intro.cycles || 1;
        effectiveCents = promoCents;
        originalPriceFormatted = formatCentsToCurrency(regularCents);
        priceFormatted = formatCentsToCurrency(promoCents);
        const durationText = formatPromotionDuration(cycles, displayInterval);
        promoBadgeHtml = `<span class="badge info plan-promo-badge">Promoção: ${durationText}</span>`;
      } else if (offer.campaign?.enabled && (offer.campaign.active || offer.campaign.status === 'active')) {
        const promoCents = offer.campaign.promotionalPriceCents ?? offer.campaign.priceCents;
        effectiveCents = promoCents;
        originalPriceFormatted = formatCentsToCurrency(regularCents);
        priceFormatted = formatCentsToCurrency(promoCents);
        const validUntilFmt = offer.campaign.validUntil ? formatDatePtBr(offer.campaign.validUntil) : '';
        const validTxt = validUntilFmt ? ` até ${validUntilFmt}` : '';
        promoBadgeHtml = `<span class="badge warning plan-promo-badge">Campanha limitada${validTxt}</span>`;
      } else {
        priceFormatted = isFree ? 'Gratuito' : formatCentsToCurrency(regularCents);
      }

      intervalFormatted = isFree ? '' : (displayInterval === 'yearly' ? '/ano' : '/mês');

      if (activeInt === 'yearly' && !isFree && effectiveCents > 0) {
        const equivCents = Math.round(effectiveCents / 12);
        const equivFmt = formatCentsToCurrency(equivCents);
        equivMonthlyHtml = `
          <div class="plan-price-equivalent">
            <span class="plan-price-equivalent-main">Equivalente a ${equivFmt}/mês</span>
            <span class="plan-price-equivalent-sub">Faturado anualmente</span>
          </div>
        `;
      }
    }

    const isContextual = (options.mode === 'contextual');
    const targetResource = options.resourceKey || null;

    const canonicalHighlights = buildPlanFeatureHighlights(plan, targetResource);

    let features = [];
    if (canonicalHighlights.length > 0) {
      features = [...canonicalHighlights];
      // Adiciona itens editoriais complementares de metadata.featuresSummary que não contradizem nem duplicam limites canônicos
      if (Array.isArray(plan.metadata?.featuresSummary)) {
        for (const item of plan.metadata.featuresSummary) {
          const str = String(item || '').trim();
          if (!str) continue;
          const lower = str.toLowerCase();
          if (lower.includes('despesa') || lower.includes('renda') || lower.includes('devedor') || lower.includes('ia') || lower.includes('crédito') || lower.includes('consulta') || lower.includes('investimento') || lower.includes('benefício') || lower.includes('compra')) {
            continue;
          }
          if (!features.includes(str)) {
            features.push(str);
          }
        }
      }
    } else if (Array.isArray(plan.metadata?.featuresSummary) && plan.metadata.featuresSummary.length > 0) {
      features = [...plan.metadata.featuresSummary];
    } else {
      features = ['Acesso aos recursos inclusos no plano'];
    }

    const commercialPlanName = formatCommercialPlanName(plan.name);

    return `
      <div class="plan-card ${isCurrent ? 'plan-card--current' : ''} ${!hasOffer ? 'plan-card--unavailable' : ''} ${isContextual ? 'plan-card--contextual' : ''}">
        ${isCurrent ? '<div class="plan-card-badge">Seu Plano Atual</div>' : ''}
        ${promoBadgeHtml ? `<div class="plan-promo-wrapper">${promoBadgeHtml}</div>` : ''}

        <div class="plan-card-header">
          <h4 class="plan-card-title">${escapeHtml(commercialPlanName)}</h4>
          <p class="plan-card-desc">${escapeHtml(plan.description || '')}</p>
        </div>

        <div class="plan-card-pricing">
          ${originalPriceFormatted ? `
            <div class="plan-price-original-wrap">
              <span class="plan-price-original">${originalPriceFormatted}</span>
            </div>
          ` : ''}

          <div class="plan-price-primary">
            <span class="plan-price-value">${priceFormatted}</span>
            ${intervalFormatted ? `<span class="plan-price-interval">${intervalFormatted}</span>` : ''}
          </div>

          ${equivMonthlyHtml}

          ${!hasOffer ? `
            <div class="plan-price-unavailable-notice">
              Oferta indisponível para cobrança ${activeInt === 'yearly' ? 'anual' : 'mensal'}
            </div>
          ` : ''}
        </div>

        <div class="plan-card-divider"></div>

        <div class="plan-card-section-title">O que inclui:</div>
        <ul class="plan-features-list">
          ${features.map(f => `
            <li class="plan-feature-item">
              <span class="plan-feature-icon" style="color:var(--brand);">✓</span>
              <span>${escapeHtml(f)}</span>
            </li>
          `).join('')}
        </ul>

        ${isContextual ? '' : `
          <div class="plan-card-divider"></div>

          <div class="plan-card-limits">
            <div class="plan-limit-row">
              <span class="plan-limit-name">Despesas cadastradas</span>
              <span class="plan-limit-val">${formatLimitValue(getPlanResourceLimit(plan, 'despesas', 'maxItems'))}</span>
            </div>
            <div class="plan-limit-row">
              <span class="plan-limit-name">Rendas extras</span>
              <span class="plan-limit-val">${formatLimitValue(getPlanResourceLimit(plan, 'extras', 'maxItems'))}</span>
            </div>
            <div class="plan-limit-row">
              <span class="plan-limit-name">Devedores ativos</span>
              <span class="plan-limit-val">${formatLimitValue(getPlanResourceLimit(plan, 'devedores', 'maxItems'))}</span>
            </div>
            <div class="plan-limit-row">
              <span class="plan-limit-name">Créditos de IA / dia</span>
              <span class="plan-limit-val">${formatLimitValue(getPlanResourceLimit(plan, 'ai', 'creditsPerDay'))}</span>
            </div>
          </div>
        `}

        <div class="plan-card-actions">
          ${isCurrent ? `
            <button type="button" class="btn secondary full-width" disabled style="opacity:0.85; cursor:default; font-weight:750;">
              Plano Atual
            </button>
          ` : !hasOffer ? `
            <button type="button" class="btn soft full-width" disabled style="opacity:0.6; cursor:not-allowed;">
              Indisponível no ${activeInt === 'yearly' ? 'Anual' : 'Mensal'}
            </button>
          ` : `
            <button type="button" class="btn primary full-width btn-plan-interest" data-plan-id="${escapeHtml(plan.id)}" data-plan-name="${escapeHtml(commercialPlanName)}" data-interval="${escapeHtml(activeInt)}">
              Assinaturas online em breve
            </button>
          `}
        </div>
      </div>
    `;
  }

  /**
   * Renderiza a visão completa de planos (modal ou contextual)
   */
  function renderCommercialPlansView(container, plans, options = {}) {
    if (!container) return;
    const mode = options.mode || 'modal';
    const isContextual = (mode === 'contextual');
    const activeInt = options.activeInterval || activeInterval || 'monthly';
    const currentPlanId = options.currentPlanId !== undefined ? options.currentPlanId : lastCurrentPlanId;
    const isLegacyCurrentPlan = options.isLegacyCurrentPlan !== undefined ? options.isLegacyCurrentPlan : lastIsLegacy;

    if (!Array.isArray(plans) || plans.length === 0) {
      if (isContextual) {
        container.innerHTML = `
          <div class="contextual-plans-empty" style="text-align:center; padding:32px 16px; color:var(--muted); width:100%;">
            <p style="font-weight:700; font-size:0.95rem; color:var(--text); margin-bottom:12px;">Este recurso não está disponível nos planos oferecidos atualmente.</p>
            <button type="button" class="btn soft small btn-contextual-view-all" id="btnContextualViewAllPlans">Ver todos os planos</button>
          </div>
        `;
        const viewAllBtn = container.querySelector('.btn-contextual-view-all');
        viewAllBtn?.addEventListener('click', () => {
          if (typeof window.openCommercialPlansModal === 'function') {
            window.openCommercialPlansModal();
          }
        });
      } else {
        container.innerHTML = `
          <div class="plans-empty-state" style="text-align:center; padding:32px 16px; color:var(--muted); width:100%;">
            <p style="font-weight:700; font-size:0.95rem;">Nenhum plano disponível para contratação no momento.</p>
          </div>
        `;
      }
      if (options.updateCarousel !== false) {
        updateCarouselControls(options.viewport, options.btnPrev, options.btnNext);
      }
      return;
    }

    container.innerHTML = plans.map(p => renderCommercialPlanCardHtml(p, {
      activeInterval: activeInt,
      currentPlanId,
      isLegacyCurrentPlan,
      mode: options.mode,
      resourceKey: options.resourceKey
    })).join('');

    container.querySelectorAll('.btn-plan-interest').forEach(btn => {
      btn.addEventListener('click', () => {
        const planName = btn.getAttribute('data-plan-name') || 'selecionado';
        const intervalLabel = activeInt === 'yearly' ? 'anual' : 'mensal';
        const msg = `As assinaturas online do plano "${planName}" (${intervalLabel}) estarão disponíveis em breve. Para contratar antecipadamente, contate o suporte.`;
        if (typeof window.notify === 'function') {
          window.notify(msg, 'info');
        } else {
          alert(msg);
        }
      });
    });

    if (options.updateCarousel !== false) {
      updateCarouselControls(options.viewport, options.btnPrev, options.btnNext);
    }
  }

  /**
   * Renderiza a grade de planos dentro do modal
   */
  function renderPlansGrid(plans, currentPlanId, isLegacyCurrentPlan = false) {
    lastRenderedPlans = plans || [];
    lastCurrentPlanId = currentPlanId;
    lastIsLegacy = isLegacyCurrentPlan;

    const container = document.getElementById('plansGridContainer');
    if (!container) return;

    // Atualiza badge de economia anual no toggle
    const savingsBadge = document.getElementById('plansYearlySavingsBadge');
    if (savingsBadge) {
      const maxSavings = calculateMaxAnnualSavings(plans);
      if (maxSavings > 0) {
        savingsBadge.style.display = 'inline-block';
        savingsBadge.textContent = `Economize até ${maxSavings}%`;
      } else {
        savingsBadge.style.display = 'none';
        savingsBadge.textContent = '';
      }
    }

    renderCommercialPlansView(container, plans, {
      mode: 'modal',
      currentPlanId,
      isLegacyCurrentPlan,
      activeInterval
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

  function initPlansModalInteractions() {
    initModalDismissals();

    const btnMonthly = document.getElementById('btnIntervalMonthly');
    const btnYearly = document.getElementById('btnIntervalYearly');

    if (btnMonthly && btnYearly) {
      btnMonthly.addEventListener('click', () => {
        if (activeInterval === 'monthly') return;
        activeInterval = 'monthly';
        btnMonthly.classList.add('active');
        btnMonthly.setAttribute('aria-pressed', 'true');
        btnYearly.classList.remove('active');
        btnYearly.setAttribute('aria-pressed', 'false');
        if (lastRenderedPlans && lastRenderedPlans.length > 0) {
          renderPlansGrid(lastRenderedPlans, lastCurrentPlanId, lastIsLegacy);
        }
      });

      btnYearly.addEventListener('click', () => {
        if (activeInterval === 'yearly') return;
        activeInterval = 'yearly';
        btnYearly.classList.add('active');
        btnYearly.setAttribute('aria-pressed', 'true');
        btnMonthly.classList.remove('active');
        btnMonthly.setAttribute('aria-pressed', 'false');
        if (lastRenderedPlans && lastRenderedPlans.length > 0) {
          renderPlansGrid(lastRenderedPlans, lastCurrentPlanId, lastIsLegacy);
        }
      });
    }

    const viewport = document.getElementById('plansCarouselViewport');
    const btnPrev = document.getElementById('btnPlansPrev');
    const btnNext = document.getElementById('btnPlansNext');

    if (btnPrev && viewport) {
      btnPrev.addEventListener('click', () => {
        viewport.scrollBy({ left: -320, behavior: 'smooth' });
      });
    }

    if (btnNext && viewport) {
      btnNext.addEventListener('click', () => {
        viewport.scrollBy({ left: 320, behavior: 'smooth' });
      });
    }

    if (viewport) {
      viewport.addEventListener('scroll', updateCarouselControls, { passive: true });
    }

    if (typeof window.addEventListener === 'function') {
      window.addEventListener('resize', updateCarouselControls, { passive: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlansModalInteractions);
  } else {
    initPlansModalInteractions();
  }

  // Bridges públicas autorizadas
  window.openCommercialPlansModal = openCommercialPlansModal;
  window.showResourceLimitModal = showResourceLimitModal;
  window.fetchCommercialContext = fetchCommercialContext;
  window.fetchActivePlans = fetchActivePlans;
  window.formatCentsToCurrency = formatCentsToCurrency;
  window.formatBillingInterval = formatBillingInterval;
  window.getActiveInterval = () => activeInterval;
  window.setActiveInterval = (interval) => {
    if (interval === 'monthly' || interval === 'yearly') {
      activeInterval = interval;
      const btnMonthly = document.getElementById('btnIntervalMonthly');
      const btnYearly = document.getElementById('btnIntervalYearly');
      if (btnMonthly && btnYearly) {
        if (interval === 'monthly') {
          btnMonthly.classList.add('active');
          btnMonthly.setAttribute('aria-pressed', 'true');
          btnYearly.classList.remove('active');
          btnYearly.setAttribute('aria-pressed', 'false');
        } else {
          btnYearly.classList.add('active');
          btnYearly.setAttribute('aria-pressed', 'true');
          btnMonthly.classList.remove('active');
          btnMonthly.setAttribute('aria-pressed', 'false');
        }
      }
      if (lastRenderedPlans && lastRenderedPlans.length > 0) {
        renderPlansGrid(lastRenderedPlans, lastCurrentPlanId, lastIsLegacy);
      }
    }
  };
  window.updateCarouselControls = updateCarouselControls;
  window.normalizeClientPricing = normalizeClientPricing;
  window.calculateMaxAnnualSavings = calculateMaxAnnualSavings;
  window.renderPlansGrid = renderPlansGrid;
  window.renderCommercialPlanCardHtml = renderCommercialPlanCardHtml;
  window.renderCommercialPlansView = renderCommercialPlansView;
  window.filterPlansByResource = filterPlansByResource;
  window.getPlanResourceLimit = getPlanResourceLimit;
  window.formatResourceHighlight = formatResourceHighlight;
  window.buildPlanFeatureHighlights = buildPlanFeatureHighlights;
  window.formatLimitValue = formatLimitValue;
  window.formatCommercialPlanName = formatCommercialPlanName;
  window.formatPromotionDuration = formatPromotionDuration;
})();
