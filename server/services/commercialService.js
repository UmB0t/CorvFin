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
    pricing: plan.pricing ? {
      amountCents: plan.pricing.amountCents,
      currency: plan.pricing.currency || 'BRL',
      interval: plan.pricing.interval || 'month'
    } : null,
    metadata: {
      featuresSummary: Array.isArray(plan.metadata?.featuresSummary) ? plan.metadata.featuresSummary : []
    }
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
 * Retorna a lista sanitizada de planos comerciais ativos disponíveis para consulta e comparação.
 * Exclui planos archived e inactive.
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

  return activePlans.map(p => ({
    id: p._id,
    name: p.name,
    slug: p.slug,
    description: p.description || '',
    pricing: p.pricing ? {
      amountCents: p.pricing.amountCents,
      currency: p.pricing.currency || 'BRL',
      interval: p.pricing.interval || 'month'
    } : null,
    isDefault: !!p.isDefault,
    metadata: {
      displayOrder: p.metadata?.displayOrder ?? 0,
      featuresSummary: Array.isArray(p.metadata?.featuresSummary) ? p.metadata.featuresSummary : []
    },
    entitlements: p.entitlements ? Object.keys(ENTITLEMENT_REGISTRY).reduce((acc, key) => {
      const ent = p.entitlements[key];
      if (ent) {
        acc[key] = {
          enabled: ent.enabled === true,
          limits: { ...(ent.limits || {}) }
        };
      }
      return acc;
    }, {}) : {}
  }));
}

module.exports = {
  getCommercialContext,
  getActivePlans
};
