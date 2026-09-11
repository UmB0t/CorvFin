/**
 * CommercialService — Serviço de Contexto Comercial do Usuário e Catálogo Ativo (CorvFin V2 - Fase 5H)
 *
 * Responsabilidades:
 * 1. Agregação segura do contexto comercial do usuário autenticado (getCommercialContext):
 *    - Dados do plano ativo (id, name, slug, status, pricing, description, metadata.featuresSummary)
 *    - Mapa sanitizado de acesso por recurso (planAllowed, permissionAllowed, effectiveAllowed, limits)
 *    - Estado de consumo de créditos de IA em tempo real (enabled, limit, used, remaining, unlimited, resetsAt, dateKey)
 *    - Preservação estrita de FAIL-CLOSED (repassa PLAN_REFERENCE_INVALID sem converter para default)
 *    - Proteção estrita contra vazamento de segredos, internals de idempotência, reservas ou metadados administrativos
 * 2. Catálogo sanitizado de planos ativos para comparação/upgrade (getActivePlans):
 *    - Apenas planos com status === 'active'
 *    - Sem planos archived ou inactive para novas contratações
 *    - Sem IDs internos de banco ou campos confidenciais
 */

'use strict';

const planService = require('./planService');
const entitlementService = require('./entitlementService');
const aiQuotaService = require('./aiQuotaService');
const storageService = require('./storageService');
const { ENTITLEMENT_REGISTRY } = require('../config/entitlementRegistry');

const APP_TIMEZONE = 'America/Fortaleza';

/**
 * Retorna a data comercial atual (YYYY-MM-DD) no fuso de referência do CorvFin (America/Fortaleza).
 */
function getCommercialDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Avalia o status canônico de uma campanha comercial com semântica inclusiva (validFrom <= hoje <= validUntil).
 * Estados: 'active' | 'future' | 'expired' | 'none'.
 */
function resolveCampaignStatus(campaign, referenceDate = new Date()) {
  if (!campaign || !campaign.enabled) {
    return { status: 'none', active: false };
  }
  const todayStr = getCommercialDateString(referenceDate);
  const fromStr = (campaign.validFrom ? String(campaign.validFrom) : '').slice(0, 10);
  const untilStr = (campaign.validUntil ? String(campaign.validUntil) : '').slice(0, 10);

  if (!fromStr || !untilStr) {
    return { status: 'none', active: false };
  }

  if (todayStr < fromStr) {
    return { status: 'future', active: false, validFrom: fromStr, validUntil: untilStr };
  }
  if (todayStr > untilStr) {
    return { status: 'expired', active: false, validFrom: fromStr, validUntil: untilStr };
  }
  return { status: 'active', active: true, validFrom: fromStr, validUntil: untilStr };
}

/**
 * Sanitiza o contrato de pricing de um plano para consumo público, retornando
 * estritamente a estrutura canônica (currency + offers) com metadados de campanha resolvidos.
 */
function sanitizePlanPricing(rawPricing, referenceDate = new Date()) {
  const norm = planService.normalizePricingDoc(rawPricing);
  if (!norm || !norm.offers) return null;

  const sanitizeOffer = (offer) => {
    if (!offer || !offer.enabled) {
      return { enabled: false };
    }
    const campaignStatus = resolveCampaignStatus(offer.campaign, referenceDate);
    return {
      enabled: true,
      interval: offer.interval,
      intervalCount: offer.intervalCount || 1,
      regularPriceCents: offer.regularPriceCents,
      intro: (offer.intro && offer.intro.enabled) ? {
        enabled: true,
        promotionalPriceCents: offer.intro.promotionalPriceCents ?? offer.intro.priceCents,
        priceCents: offer.intro.priceCents ?? offer.intro.promotionalPriceCents,
        cycles: offer.intro.cycles
      } : { enabled: false, promotionalPriceCents: null, priceCents: null, cycles: null },
      campaign: (offer.campaign && offer.campaign.enabled) ? {
        enabled: true,
        promotionalPriceCents: offer.campaign.promotionalPriceCents ?? offer.campaign.priceCents,
        priceCents: offer.campaign.priceCents ?? offer.campaign.promotionalPriceCents,
        validFrom: offer.campaign.validFrom,
        validUntil: offer.campaign.validUntil,
        status: campaignStatus.status,
        active: campaignStatus.active
      } : null
    };
  };

  return {
    currency: norm.currency || 'BRL',
    offers: {
      monthly: sanitizeOffer(norm.offers.monthly),
      yearly: sanitizeOffer(norm.offers.yearly)
    }
  };
}

/**
 * Retorna o contexto comercial consolidado para o usuário autenticado.
 *
 * @param {Object} user Usuário autenticado (populado pelo authMiddleware)
 * @returns {Promise<Object>} Contexto comercial sanitizado { plan, access, usage }
 */
async function getCommercialContext(user) {
  if (!user || typeof user !== 'object') {
    const err = new Error('User is required to resolve commercial context');
    err.status = 401;
    throw err;
  }

  // 1. Resolve o documento de plano do usuário (Fail-closed se planId for inválido/inexistente)
  const plan = await entitlementService.getPlanForUser(user);

  // 2. Sanitiza os dados do plano (sem expor campos internos)
  const sanitizedPlan = {
    id: plan._id,
    name: plan.name,
    slug: plan.slug,
    status: plan.status,
    description: plan.description || '',
    pricing: sanitizePlanPricing(plan.pricing),
    metadata: {
      featuresSummary: Array.isArray(plan.metadata?.featuresSummary) ? plan.metadata.featuresSummary : []
    },
    includedResources: plan.entitlements ? Object.keys(ENTITLEMENT_REGISTRY).filter(key => plan.entitlements[key]?.enabled === true) : [],
    entitlements: plan.entitlements ? Object.keys(ENTITLEMENT_REGISTRY).reduce((acc, key) => {
      const ent = plan.entitlements[key];
      if (ent) {
        acc[key] = {
          enabled: ent.enabled === true,
          limits: { ...(ent.limits || {}) }
        };
      }
      return acc;
    }, {}) : {},
    limits: extractCanonicalLimits(plan.entitlements),
    featureHighlights: buildCanonicalPlanFeatureHighlights(plan.entitlements)
  };

  // 3. Resolve permissões individuais reais do usuário
  let permissions = user.permissions;
  if (!permissions && user.id) {
    permissions = await storageService.getUserPermissions(user.id);
  }
  permissions = permissions || {};

  // 4. Mapeia acesso detalhado discriminando Plano vs RBAC
  const access = {};

  for (const resourceKey of Object.keys(ENTITLEMENT_REGISTRY)) {
    const planEntitlement = plan.entitlements?.[resourceKey];

    // Se o plano não declara o recurso no registry, fail-closed
    if (!planEntitlement || typeof planEntitlement !== 'object') {
      access[resourceKey] = {
        planAllowed: false,
        permissionAllowed: false,
        effectiveAllowed: false,
        limits: {}
      };
      continue;
    }

    const planAllowed = planEntitlement.enabled === true;
    const userPermVal = permissions[resourceKey];
    // Se a permissão do usuário não for explicitamente false, ela é permitida
    const permissionAllowed = userPermVal !== false;
    const effectiveAllowed = planAllowed && permissionAllowed;

    access[resourceKey] = {
      planAllowed,
      permissionAllowed,
      effectiveAllowed,
      limits: { ...(planEntitlement.limits || {}) }
    };
  }

  // 5. Calcula estado de consumo de IA diária em tempo real
  const dateKey = aiQuotaService.getDateKey();
  const resetsAt = aiQuotaService.getResetsAt();
  let aiLimit = null;
  let aiUsed = 0;

  try {
    aiLimit = await aiQuotaService.getAiCreditLimit(user);
  } catch (_) {
    aiLimit = 0;
  }

  if (user.id) {
    const dailyUsageDoc = await storageService.getAiDailyUsage(user.id, dateKey);
    if (dailyUsageDoc && typeof dailyUsageDoc.creditsUsed === 'number') {
      aiUsed = dailyUsageDoc.creditsUsed;
    }
  }

  const isUnlimited = (aiLimit === null);
  const remainingCredits = isUnlimited ? null : Math.max(0, (aiLimit || 0) - aiUsed);

  const usage = {
    ai: {
      enabled: access.ai ? access.ai.effectiveAllowed : false,
      limit: aiLimit,
      used: aiUsed,
      remaining: remainingCredits,
      unlimited: isUnlimited,
      resetsAt,
      dateKey
    }
  };

  return {
    plan: sanitizedPlan,
    access,
    usage
  };
}

/**
 * Formata um destaque textual canônico para um entitlement de recurso específico.
 * Semântica estrita:
 * - null: ilimitado
 * - inteiro > 0: limite real
 * - 0: sem capacidade / 0 itens
 * - undefined / inválido: fail-closed (não exibe ilimitado)
 */
function formatCanonicalEntitlementHighlight(resourceKey, entitlement) {
  if (!entitlement || entitlement.enabled !== true) return null;
  const limits = entitlement.limits || {};

  switch (resourceKey) {
    case 'ai': {
      const creds = limits.creditsPerDay;
      if (creds === null) return 'IA ilimitada';
      if (Number.isInteger(creds) && creds > 0) {
        return `${creds} ${creds === 1 ? 'crédito' : 'créditos'} de IA por dia`;
      }
      if (creds === 0) return 'Sem créditos de IA';
      return null;
    }
    case 'despesas': {
      const max = limits.maxItems;
      if (max === null) return 'Despesas ilimitadas';
      if (Number.isInteger(max) && max > 0) return `Até ${max} despesas cadastradas`;
      if (max === 0) return '0 despesas cadastradas';
      return null;
    }
    case 'extras': {
      const max = limits.maxItems;
      if (max === null) return 'Rendas Extras ilimitadas';
      if (Number.isInteger(max) && max > 0) return `Até ${max} rendas extras cadastradas`;
      if (max === 0) return '0 rendas extras cadastradas';
      return null;
    }
    case 'devedores': {
      const max = limits.maxItems;
      if (max === null) return 'Devedores ativos ilimitados';
      if (Number.isInteger(max) && max > 0) return `Até ${max} devedores ativos`;
      if (max === 0) return '0 devedores ativos';
      return null;
    }
    case 'investimentos': {
      const max = limits.maxItems;
      if (max === null) return 'Investimentos ilimitados';
      if (Number.isInteger(max) && max > 0) return `Até ${max} investimentos cadastrados`;
      if (max === 0) return '0 investimentos cadastrados';
      return null;
    }
    case 'beneficios': {
      const max = limits.maxItems;
      if (max === null) return 'Transações de benefícios ilimitadas';
      if (Number.isInteger(max) && max > 0) return `Até ${max} transações de benefícios`;
      if (max === 0) return '0 transações de benefícios';
      return null;
    }
    case 'compras': {
      const max = limits.maxItems;
      if (max === null) return 'Listas de compras ilimitadas';
      if (Number.isInteger(max) && max > 0) return `Até ${max} listas de compras`;
      if (max === 0) return '0 listas de compras';
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
 * Constrói lista ordenada de destaques canônicos de um plano a partir de seus entitlements.
 */
function buildCanonicalPlanFeatureHighlights(entitlements, contextualKey = null) {
  if (!entitlements || typeof entitlements !== 'object') return [];
  const highlights = [];

  // Se houver um recurso contextual e ele estiver habilitado, ele é prioritário (#0)
  if (contextualKey && entitlements[contextualKey]?.enabled === true) {
    const h = formatCanonicalEntitlementHighlight(contextualKey, entitlements[contextualKey]);
    if (h) highlights.push(h);
  }

  // Ordem prioritária padrão de recursos a destacar
  const priorityOrder = ['despesas', 'extras', 'ai', 'devedores', 'investimentos', 'beneficios', 'compras', 'simulacao', 'relatorios', 'dashboard'];
  for (const key of priorityOrder) {
    if (key === contextualKey) continue;
    if (entitlements[key]?.enabled === true) {
      const h = formatCanonicalEntitlementHighlight(key, entitlements[key]);
      if (h && !highlights.includes(h)) {
        highlights.push(h);
      }
    }
  }

  return highlights;
}

/**
 * Extrai mapa canônico de limites do plano.
 */
function extractCanonicalLimits(entitlements) {
  if (!entitlements || typeof entitlements !== 'object') return {};
  const getLim = (resKey, limKey) => {
    const ent = entitlements[resKey];
    if (!ent || ent.enabled !== true) return 0;
    if (ent.limits && Object.prototype.hasOwnProperty.call(ent.limits, limKey)) {
      return ent.limits[limKey];
    }
    return undefined;
  };

  return {
    maxExpenses: getLim('despesas', 'maxItems'),
    maxExpensesPerMonth: getLim('despesas', 'maxItems'),
    maxExtras: getLim('extras', 'maxItems'),
    maxActiveDebtors: getLim('devedores', 'maxItems'),
    aiCreditsDaily: getLim('ai', 'creditsPerDay')
  };
}

/**
 * Retorna todos os planos com status 'active' ordenados por displayOrder.
 *
 * @returns {Promise<Array<Object>>} Lista de planos ativos ordenados por displayOrder
 */
async function getActivePlans() {
  const allPlans = await planService.getAllPlans({ status: 'active' });
  const activePlans = allPlans
    .filter(p => p.status === 'active')
    .sort((a, b) => {
      const orderA = a.metadata?.displayOrder ?? 0;
      const orderB = b.metadata?.displayOrder ?? 0;
      return orderA - orderB;
    });

  return activePlans.map(p => {
    const includedResources = p.entitlements ? Object.keys(ENTITLEMENT_REGISTRY).filter(key => p.entitlements[key]?.enabled === true) : [];
    const entitlements = p.entitlements ? Object.keys(ENTITLEMENT_REGISTRY).reduce((acc, key) => {
      const ent = p.entitlements[key];
      if (ent) {
        acc[key] = {
          enabled: ent.enabled === true,
          limits: { ...(ent.limits || {}) }
        };
      }
      return acc;
    }, {}) : {};

    return {
      id: p._id,
      name: p.name,
      slug: p.slug,
      description: p.description || '',
      pricing: sanitizePlanPricing(p.pricing),
      isDefault: !!p.isDefault,
      metadata: {
        displayOrder: p.metadata?.displayOrder ?? 0,
        featuresSummary: Array.isArray(p.metadata?.featuresSummary) ? p.metadata.featuresSummary : []
      },
      includedResources,
      entitlements,
      limits: extractCanonicalLimits(entitlements),
      featureHighlights: buildCanonicalPlanFeatureHighlights(entitlements)
    };
  });
}

module.exports = {
  getCommercialContext,
  getActivePlans,
  resolveCampaignStatus,
  getCommercialDateString,
  sanitizePlanPricing,
  formatCanonicalEntitlementHighlight,
  buildCanonicalPlanFeatureHighlights,
  extractCanonicalLimits
};
