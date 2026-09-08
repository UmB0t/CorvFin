/**
 * EntitlementService — Serviço de Resolução e Verificação de Entitlements (CorvFin V2)
 *
 * Responsabilidades (Lote 5C):
 * 1. Resolução do plano efetivo do usuário (getPlanForUser):
 *    - user.planId ausente/null => fallback de compatibilidade para o plano default
 *    - user.planId presente e válido => retorna o plano referenciado
 *    - user.planId presente e inválido/inexistente => FAIL-CLOSED (PLAN_REFERENCE_INVALID)
 *    - Plano vinculado com status inactive/archived continua resolvendo normalmente
 * 2. Resolução de entitlements efetivos (getEffectiveEntitlements):
 *    - effective = (planEntitlement.enabled === true) && (userPermission !== false)
 *    - Admin NÃO possui bypass comercial (is_admin não altera resultado)
 * 3. Verificação de acesso e limites:
 *    - canAccess(user, resourceKey)
 *    - assertAccess(user, resourceKey) => lança 403 PLAN_ACCESS_DENIED
 *    - getLimit(user, resourceKey, limitKey) => semântica estrita (null=unlimited, 0=zero, >0=teto, missing=erro)
 * 4. Recursos não comerciais (perfil, configuracoes) são rejeitados pelo serviço comercial
 */

const planService = require('./planService');
const storageService = require('./storageService');
const { ENTITLEMENT_REGISTRY } = require('../config/entitlementRegistry');

/**
 * Resolve o documento de plano aplicável para o usuário.
 * Suporta cache dentro da mesma request via user._resolvedPlan.
 */
async function getPlanForUser(user) {
  if (!user || typeof user !== 'object') {
    throw new Error('User object is required to resolve plan');
  }

  // Otimização intra-request: evita múltiplas consultas na mesma requisição
  if (user._resolvedPlan && typeof user._resolvedPlan === 'object') {
    return user._resolvedPlan;
  }

  // Helper para gravar cache intra-request de forma não enumerável (não vaza em JSON, JWT ou storage)
  function setResolvedPlanCache(targetUser, planDoc) {
    try {
      Object.defineProperty(targetUser, '_resolvedPlan', {
        value: planDoc,
        writable: true,
        configurable: true,
        enumerable: false
      });
    } catch (e) {
      targetUser._resolvedPlan = planDoc;
    }
  }

  // ESTADO A: planId ausente ou nulo (usuário legado / transição de rollout)
  // Fallback de compatibilidade temporária para o plano default
  if (user.planId === undefined || user.planId === null) {
    const defaultPlan = await planService.getDefaultPlan();
    if (!defaultPlan) {
      const err = new Error('No default plan configured in system');
      err.code = 'DEFAULT_PLAN_NOT_FOUND';
      err.status = 500;
      throw err;
    }
    setResolvedPlanCache(user, defaultPlan);
    return defaultPlan;
  }

  // ESTADO B & C: planId presente
  if (typeof user.planId !== 'string' || !user.planId.trim()) {
    const err = new Error(`Invalid planId type or empty value: "${user.planId}"`);
    err.code = 'PLAN_REFERENCE_INVALID';
    err.status = 403;
    throw err;
  }

  const plan = await planService.getPlanById(user.planId.trim());

  // ESTADO C: planId presente, mas não encontrado no catálogo => FAIL-CLOSED
  if (!plan) {
    const err = new Error(`User references an invalid or non-existent plan: "${user.planId}"`);
    err.code = 'PLAN_REFERENCE_INVALID';
    err.status = 403;
    throw err;
  }

  // ESTADO B: planId presente e válido.
  // Notar: status inactive ou archived NÃO corta o vínculo de um usuário já existente.
  setResolvedPlanCache(user, plan);
  return plan;
}

/**
 * Retorna o mapa completo de entitlements efetivos combinando o plano e as permissões individuais.
 *
 * Regra definitiva:
 * effectiveAccess = (planEntitlement.enabled === true) && (userPermission !== false)
 * Admin NÃO possui bypass comercial.
 */
async function getEffectiveEntitlements(user) {
  const plan = await getPlanForUser(user);

  // Obtém as permissões reais do usuário (usa permissions já em user ou busca do storage)
  let permissions = user.permissions;
  if (!permissions && user.id) {
    permissions = await storageService.getUserPermissions(user.id);
  }
  permissions = permissions || {};

  const effective = {};

  for (const resourceKey of Object.keys(ENTITLEMENT_REGISTRY)) {
    const planEntitlement = plan.entitlements?.[resourceKey];

    // Se o plano não possui o recurso declarado no registry canônico => FAIL-CLOSED
    if (!planEntitlement || typeof planEntitlement !== 'object' || typeof planEntitlement.enabled !== 'boolean') {
      const err = new Error(`Plan "${plan.slug || plan._id}" has invalid or missing configuration for resource "${resourceKey}"`);
      err.code = 'PLAN_CONFIGURATION_INVALID';
      err.status = 500;
      throw err;
    }

    // Permissão individual do usuário (se ausente, segue a resolução padrão; se false, bloqueia)
    const userPermVal = permissions[resourceKey];
    const isPermittedByUser = userPermVal !== false;

    // Regra combinada (Admin NÃO bypassa)
    const effectiveEnabled = (planEntitlement.enabled === true) && isPermittedByUser;

    effective[resourceKey] = {
      enabled: effectiveEnabled,
      limits: { ...(planEntitlement.limits || {}) }
    };
  }

  return effective;
}

/**
 * Verifica se o usuário possui acesso comercial e de permissão ao recurso.
 * Rejeita recursos fora do registry canônico (ex: perfil, configuracoes).
 */
async function canAccess(user, resourceKey) {
  if (!resourceKey || typeof resourceKey !== 'string') {
    throw new Error('Resource key is required');
  }

  // Rejeita recursos não comerciais
  if (!ENTITLEMENT_REGISTRY[resourceKey]) {
    const err = new Error(`Resource "${resourceKey}" is not a valid commercial entitlement resource`);
    err.code = 'UNKNOWN_RESOURCE';
    err.status = 400;
    throw err;
  }

  const effectiveEntitlements = await getEffectiveEntitlements(user);
  return effectiveEntitlements[resourceKey]?.enabled === true;
}

/**
 * Assegura que o usuário tem acesso ao recurso. Lança erro comercial 403 caso negado.
 */
async function assertAccess(user, resourceKey) {
  const allowed = await canAccess(user, resourceKey);
  if (!allowed) {
    const err = new Error(`[PLAN_ACCESS_DENIED] Commercial access to resource "${resourceKey}" is not permitted for your current plan or permissions.`);
    err.status = 403;
    err.code = 'PLAN_ACCESS_DENIED';
    err.resource = resourceKey;
    throw err;
  }
  return true;
}

/**
 * Retorna o limite configurado para um determinado recurso no plano do usuário.
 *
 * Semântica:
 * - null: ilimitado
 * - 0: zero permitido
 * - integer > 0: teto quantitativo
 * - missing / tipo incorreto: FAIL-CLOSED (PLAN_CONFIGURATION_INVALID)
 */
async function getLimit(user, resourceKey, limitKey) {
  if (!resourceKey || typeof resourceKey !== 'string') {
    throw new Error('Resource key is required');
  }
  if (!limitKey || typeof limitKey !== 'string') {
    throw new Error('Limit key is required');
  }

  const resourceDef = ENTITLEMENT_REGISTRY[resourceKey];
  if (!resourceDef) {
    const err = new Error(`Resource "${resourceKey}" is not a valid commercial entitlement resource`);
    err.code = 'UNKNOWN_RESOURCE';
    err.status = 400;
    throw err;
  }

  // Suporte transparente de retrocompatibilidade para leitura do limite legado questionsPerDay
  let effectiveLimitKey = limitKey;
  if (resourceKey === 'ai' && limitKey === 'questionsPerDay') {
    effectiveLimitKey = 'creditsPerDay';
  }

  const limitDef = resourceDef.availableLimits?.find(l => l.key === effectiveLimitKey);
  if (!limitDef) {
    const err = new Error(`Limit key "${limitKey}" is not declared for resource "${resourceKey}"`);
    err.code = 'UNKNOWN_LIMIT_KEY';
    err.status = 400;
    throw err;
  }

  const plan = await getPlanForUser(user);
  const planEntitlement = plan.entitlements?.[resourceKey];

  if (!planEntitlement || !planEntitlement.limits || planEntitlement.limits[effectiveLimitKey] === undefined) {
    const err = new Error(`Plan "${plan.slug || plan._id}" is missing configuration for limit "${resourceKey}.${limitKey}"`);
    err.code = 'PLAN_CONFIGURATION_INVALID';
    err.status = 500;
    throw err;
  }

  const limitValue = planEntitlement.limits[effectiveLimitKey];

  if (limitValue === null) {
    if (!limitDef.allowUnlimited) {
      const err = new Error(`Plan configuration error: unlimited is not allowed for "${resourceKey}.${limitKey}"`);
      err.code = 'PLAN_CONFIGURATION_INVALID';
      err.status = 500;
      throw err;
    }
    return null; // Ilimitado explícito
  }

  if (typeof limitValue === 'number' && Number.isInteger(limitValue) && limitValue >= (limitDef.min ?? 0)) {
    return limitValue;
  }

  const err = new Error(`Plan "${plan.slug || plan._id}" has invalid limit value for "${resourceKey}.${limitKey}": ${limitValue}`);
  err.code = 'PLAN_CONFIGURATION_INVALID';
  err.status = 500;
  throw err;
}

module.exports = {
  getPlanForUser,
  getEffectiveEntitlements,
  canAccess,
  assertAccess,
  getLimit
};
