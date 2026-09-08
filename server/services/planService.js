/**
 * PlanService — Serviço de Gestão do Catálogo de Planos Comerciais (CorvFin V2)
 *
 * Responsabilidades:
 * - Validação estrita de contratos de planos e entitlements;
 * - Normalização e garantia de imutabilidade de slug;
 * - Gestão de ciclo de vida (status: active | inactive | archived);
 * - Invariantes estritos de plano default em duas camadas;
 * - Transição controlada e recuperável de default (setDefaultPlan);
 * - Seed idempotente cobrindo a matriz formal de Casos A a F;
 * - Cache em memória simples e invalidável;
 * - Preservação estrita da compatibilidade e isolamento (zero users/enforcement neste lote).
 */

const crypto = require('crypto');
const storageService = require('./storageService');
const {
  ENTITLEMENT_REGISTRY,
  validatePlanEntitlements,
  getCompatibilityEntitlements,
  normalizePlanEntitlements
} = require('../config/entitlementRegistry');

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_STATUSES = ['active', 'inactive', 'archived'];
const ALLOWED_INTERVALS = ['month', 'year', 'lifetime'];

// Cache em memória simples
let cacheById = new Map();
let cacheBySlug = new Map();
let cacheDefaultPlan = null;
let cacheAllPlans = null;

function clearCache() {
  cacheById.clear();
  cacheBySlug.clear();
  cacheDefaultPlan = null;
  cacheAllPlans = null;
}

function invalidateCache() {
  clearCache();
}

function deepClone(obj) {
  if (!obj) return obj;
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Normaliza um documento de plano, garantindo evolução de schema controlada
 * para limites novos do registry canônico sem sobrescrever configurações existentes.
 */
function normalizePlanDoc(planDoc) {
  if (!planDoc || typeof planDoc !== 'object') return planDoc;
  if (planDoc.entitlements) {
    normalizePlanEntitlements(planDoc.entitlements);
  }
  return planDoc;
}

/**
 * Gera um ID estável para plano em formato string.
 */
function generatePlanId() {
  return 'plan_' + crypto.randomBytes(8).toString('hex');
}

/**
 * Normaliza e valida a regra de formato de slug.
 */
function normalizeSlug(rawSlug) {
  if (typeof rawSlug !== 'string') {
    throw new Error('Slug must be a string');
  }
  const clean = rawSlug.trim().toLowerCase();
  if (!clean || clean.length > 50) {
    throw new Error('Slug must be between 1 and 50 characters');
  }
  if (!SLUG_REGEX.test(clean)) {
    throw new Error(`Invalid slug format: "${clean}". Must contain only lowercase alphanumeric characters separated by single hyphens.`);
  }
  return clean;
}

/**
 * Validação rigorosa dos dados de precificação.
 */
function validatePricing(pricing) {
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) {
    throw new Error('Pricing must be a valid object');
  }

  const { amountCents, currency, interval } = pricing;

  // 1. amountCents: integer >= 0, sem decimais, sem string numérica
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error(`Pricing amountCents must be an integer >= 0, received: ${amountCents}`);
  }

  // 2. currency: MVP BRL
  if (typeof currency !== 'string' || currency.trim().toUpperCase() !== 'BRL') {
    throw new Error(`Pricing currency must be "BRL", received: "${currency}"`);
  }

  // 3. interval: month, year, lifetime
  if (typeof interval !== 'string' || !ALLOWED_INTERVALS.includes(interval.trim().toLowerCase())) {
    throw new Error(`Pricing interval must be one of [${ALLOWED_INTERVALS.join(', ')}], received: "${interval}"`);
  }

  return {
    amountCents,
    currency: currency.trim().toUpperCase(),
    interval: interval.trim().toLowerCase()
  };
}

/**
 * Validação dos metadados auxiliares.
 */
function validateMetadata(metadata = {}) {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Metadata must be an object');
  }

  const displayOrder = metadata.displayOrder !== undefined ? metadata.displayOrder : 0;
  if (typeof displayOrder !== 'number' || !Number.isInteger(displayOrder) || displayOrder < 0) {
    throw new Error('metadata.displayOrder must be an integer >= 0');
  }

  const featuresSummary = metadata.featuresSummary !== undefined ? metadata.featuresSummary : [];
  if (!Array.isArray(featuresSummary) || !featuresSummary.every(item => typeof item === 'string')) {
    throw new Error('metadata.featuresSummary must be an array of strings');
  }

  return {
    displayOrder,
    featuresSummary
  };
}

/**
 * Retorna todos os planos cadastrados, opcionalmente filtrados.
 */
async function getAllPlans(options = {}) {
  if (cacheAllPlans && !options.status && !options.skipCache) {
    return deepClone(cacheAllPlans);
  }

  const plans = await storageService.getPlans(options);
  const normalizedPlans = plans.map(normalizePlanDoc);
  if (!options.status) {
    cacheAllPlans = deepClone(normalizedPlans);
    for (const p of cacheAllPlans) {
      cacheById.set(p._id, p);
      cacheBySlug.set(p.slug, p);
      if (p.isDefault) cacheDefaultPlan = p;
    }
  }
  return deepClone(normalizedPlans);
}

/**
 * Consulta plano por ID.
 */
async function getPlanById(id) {
  if (!id) return null;
  if (cacheById.has(id)) {
    return deepClone(cacheById.get(id));
  }

  const plan = await storageService.getPlanById(id);
  if (plan) {
    const normalized = normalizePlanDoc(plan);
    const cloned = deepClone(normalized);
    cacheById.set(cloned._id, cloned);
    cacheBySlug.set(cloned.slug, cloned);
    if (cloned.isDefault) cacheDefaultPlan = cloned;
    return deepClone(cloned);
  }
  return null;
}

/**
 * Consulta plano por slug.
 */
async function getPlanBySlug(rawSlug) {
  if (!rawSlug) return null;
  const slug = rawSlug.trim().toLowerCase();
  if (cacheBySlug.has(slug)) {
    return deepClone(cacheBySlug.get(slug));
  }

  const plan = await storageService.getPlanBySlug(slug);
  if (plan) {
    const normalized = normalizePlanDoc(plan);
    const cloned = deepClone(normalized);
    cacheById.set(cloned._id, cloned);
    cacheBySlug.set(cloned.slug, cloned);
    if (cloned.isDefault) cacheDefaultPlan = cloned;
    return deepClone(cloned);
  }
  return null;
}

/**
 * Retorna o plano padrão atual do sistema.
 */
async function getDefaultPlan() {
  if (cacheDefaultPlan) {
    return deepClone(cacheDefaultPlan);
  }

  const plan = await storageService.getDefaultPlan();
  if (plan) {
    const normalized = normalizePlanDoc(plan);
    const cloned = deepClone(normalized);
    cacheDefaultPlan = cloned;
    cacheById.set(cloned._id, cloned);
    cacheBySlug.set(cloned.slug, cloned);
    return deepClone(cloned);
  }
  return null;
}

/**
 * Cria um novo plano no catálogo.
 */
async function createPlan(planData) {
  if (!planData || typeof planData !== 'object') {
    throw new Error('Plan data must be an object');
  }

  // 1. Validação de Name
  const rawName = planData.name;
  if (typeof rawName !== 'string' || !rawName.trim() || rawName.trim().length > 100) {
    throw new Error('Plan name is required and must be between 1 and 100 characters');
  }
  const name = rawName.trim();

  // 2. Validação e normalização de Slug
  const slug = normalizeSlug(planData.slug);
  const existingWithSlug = await getPlanBySlug(slug);
  if (existingWithSlug) {
    const err = new Error(`A plan with slug "${slug}" already exists`);
    err.code = 'SLUG_DUPLICATE';
    throw err;
  }

  // 3. Validação de Description
  let description = '';
  if (planData.description !== undefined && planData.description !== null) {
    if (typeof planData.description !== 'string' || planData.description.length > 500) {
      throw new Error('Plan description must be a string up to 500 characters');
    }
    description = planData.description.trim();
  }

  // 4. Validação de Status
  const status = planData.status ? planData.status.trim().toLowerCase() : 'active';
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new Error(`Plan status must be one of [${ALLOWED_STATUSES.join(', ')}], received: "${planData.status}"`);
  }

  // 5. Invariante de isDefault
  const isDefault = planData.isDefault === true;
  if (isDefault) {
    if (status !== 'active') {
      throw new Error('A default plan must have status "active"');
    }
    const currentDefault = await getDefaultPlan();
    if (currentDefault) {
      throw new Error(`A default plan already exists ("${currentDefault.name}"). Use setDefaultPlan to change the default plan.`);
    }
  }

  // 6. Validação de Pricing
  const pricing = validatePricing(planData.pricing);

  // 7. Validação estrita de Entitlements (exige todos os 10 recursos MVP)
  normalizePlanEntitlements(planData.entitlements);
  validatePlanEntitlements(planData.entitlements, true);
  const entitlements = planData.entitlements;

  // 8. Validação de Metadata
  const metadata = validateMetadata(planData.metadata);

  // 9. Construção do documento
  const planId = planData._id || generatePlanId();
  const now = new Date().toISOString();

  const planDoc = {
    _id: planId,
    name,
    slug,
    description,
    status,
    isDefault,
    pricing,
    entitlements,
    metadata,
    createdAt: now,
    updatedAt: now
  };

  const saved = await storageService.savePlan(planDoc);
  invalidateCache();
  return saved;
}

/**
 * Atualiza campos de um plano existente.
 * O slug é estritamente imutável após a criação.
 */
async function updatePlan(planId, updateData) {
  if (!planId) throw new Error('Plan ID is required');
  if (!updateData || typeof updateData !== 'object') {
    throw new Error('Update data must be an object');
  }

  const existing = await getPlanById(planId);
  if (!existing) {
    throw new Error(`Plan not found: "${planId}"`);
  }

  // 1. Garantia de IMUTABILIDADE do Slug
  if (updateData.slug !== undefined) {
    const normalizedNewSlug = normalizeSlug(updateData.slug);
    if (normalizedNewSlug !== existing.slug) {
      const err = new Error(`Slug is immutable and cannot be changed from "${existing.slug}" to "${normalizedNewSlug}"`);
      err.code = 'SLUG_IMMUTABLE';
      throw err;
    }
  }

  const payload = {};

  // 2. Name
  if (updateData.name !== undefined) {
    if (typeof updateData.name !== 'string' || !updateData.name.trim() || updateData.name.trim().length > 100) {
      throw new Error('Plan name must be between 1 and 100 characters');
    }
    payload.name = updateData.name.trim();
  }

  // 3. Description
  if (updateData.description !== undefined) {
    if (typeof updateData.description !== 'string' || updateData.description.length > 500) {
      throw new Error('Plan description must be a string up to 500 characters');
    }
    payload.description = updateData.description.trim();
  }

  // 4. Status
  if (updateData.status !== undefined) {
    const status = updateData.status.trim().toLowerCase();
    if (!ALLOWED_STATUSES.includes(status)) {
      throw new Error(`Plan status must be one of [${ALLOWED_STATUSES.join(', ')}]`);
    }
    // Invariante: plano default não pode virar inativo ou arquivado
    if (existing.isDefault && status !== 'active') {
      throw new Error(`Cannot set default plan status to "${status}". The default plan must remain active.`);
    }
    payload.status = status;
  }

  // 5. isDefault: proibido manipular via update genérico
  if (updateData.isDefault !== undefined && updateData.isDefault !== existing.isDefault) {
    throw new Error('Cannot change isDefault via generic update. Changing the default plan must be done exclusively through setDefaultPlan().');
  }

  // 6. Pricing
  if (updateData.pricing !== undefined) {
    payload.pricing = validatePricing(updateData.pricing);
  }

  // 7. Entitlements
  if (updateData.entitlements !== undefined) {
    validatePlanEntitlements(updateData.entitlements, false);
    payload.entitlements = Object.assign({}, existing.entitlements, updateData.entitlements);
    normalizePlanEntitlements(payload.entitlements);
    // Valida o conjunto final combinado para garantir integridade completa
    validatePlanEntitlements(payload.entitlements, true);
  }

  // 8. Metadata
  if (updateData.metadata !== undefined) {
    payload.metadata = validateMetadata(updateData.metadata);
  }

  const updated = await storageService.updatePlan(planId, payload);
  invalidateCache();
  return updated;
}

/**
 * Altera o status de um plano (active | inactive | archived).
 * Impede que o plano default ativo seja inativado ou arquivado.
 */
async function setPlanStatus(planId, rawStatus) {
  if (!planId) throw new Error('Plan ID is required');
  if (typeof rawStatus !== 'string') {
    throw new Error('Status must be a string');
  }

  const status = rawStatus.trim().toLowerCase();
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new Error(`Plan status must be one of [${ALLOWED_STATUSES.join(', ')}], received: "${rawStatus}"`);
  }

  const existing = await getPlanById(planId);
  if (!existing) {
    throw new Error(`Plan not found: "${planId}"`);
  }

  if (existing.isDefault && status !== 'active') {
    throw new Error(`Cannot change status of default plan to "${status}". The system default plan must remain active.`);
  }

  const updated = await storageService.updatePlan(planId, { status });
  invalidateCache();
  return updated;
}

/**
 * Define o plano padrão do sistema de forma controlada e recuperável.
 * 1. Valida existência e status active do alvo;
 * 2. Se já for o default atual, é no-op idempotente;
 * 3. Executa transição no storage com mecanismo de rollback caso a promoção falhe;
 * 4. Invalida cache incondicionalmente.
 */
async function setDefaultPlan(targetPlanId) {
  if (!targetPlanId) {
    throw new Error('Target plan ID is required');
  }

  const target = await getPlanById(targetPlanId);
  if (!target) {
    throw new Error(`Plan not found: "${targetPlanId}"`);
  }

  if (target.status !== 'active') {
    throw new Error(`Cannot set plan with status "${target.status}" as default. Only active plans can be default.`);
  }

  const currentDefault = await getDefaultPlan();
  if (currentDefault && (currentDefault._id === targetPlanId || currentDefault.id === targetPlanId)) {
    return target; // No-op idempotente
  }

  try {
    const updated = await storageService.setDefaultPlan(targetPlanId);
    invalidateCache();
    return updated;
  } catch (err) {
    invalidateCache();
    throw err;
  }
}

/**
 * Seed Idempotente do Plano Default de Compatibilidade.
 * Implementa estritamente a matriz formal de Casos A a F.
 */
async function ensureDefaultPlan() {
  const currentDefault = await getDefaultPlan();
  const freePlan = await getPlanBySlug('free');

  // CASO F: free é o default existente => no-op
  if (currentDefault && freePlan && (currentDefault._id === freePlan._id || currentDefault.id === freePlan.id)) {
    return currentDefault;
  }

  // CASO E: default existe e free existe (mas são distintos) => preserva configuração sem overwrite
  if (currentDefault && freePlan) {
    return currentDefault;
  }

  // CASO D: default existe e free NÃO existe => cria free como active + isDefault=false
  if (currentDefault && !freePlan) {
    const freeCompatDoc = {
      _id: 'plan_free_default',
      name: 'Plano Gratuito',
      slug: 'free',
      description: 'Plano gratuito básico do sistema.',
      status: 'active',
      isDefault: false,
      pricing: {
        amountCents: 0,
        currency: 'BRL',
        interval: 'month'
      },
      entitlements: getCompatibilityEntitlements(),
      metadata: {
        displayOrder: 0,
        featuresSummary: ['Acesso a todos os recursos iniciais']
      }
    };
    await storageService.savePlan(freeCompatDoc);
    invalidateCache();
    return currentDefault;
  }

  // CASO C: default NÃO existe e free existe com status inactive ou archived => FAIL CLOSED
  if (!currentDefault && freePlan && freePlan.status !== 'active') {
    const err = new Error(
      `DEFAULT_PLAN_SEED_CONFLICT: O plano "free" existe com status "${freePlan.status}", mas nenhum plano default ativo está configurado. O sistema recusa reativar silenciosamente uma configuração administrativa.`
    );
    err.code = 'DEFAULT_PLAN_SEED_CONFLICT';
    throw err;
  }

  // CASO B: default NÃO existe e free existe com status active => promove free a default sem sobrescrever customizações
  if (!currentDefault && freePlan && freePlan.status === 'active') {
    return await setDefaultPlan(freePlan._id);
  }

  // CASO A: default NÃO existe e free NÃO existe => cria free com active + isDefault=true e entitlements de compatibilidade
  if (!currentDefault && !freePlan) {
    const freeCompatDoc = {
      _id: 'plan_free_default',
      name: 'Plano Gratuito',
      slug: 'free',
      description: 'Plano padrão com acesso completo a todos os módulos sem limites prévios.',
      status: 'active',
      isDefault: true,
      pricing: {
        amountCents: 0,
        currency: 'BRL',
        interval: 'month'
      },
      entitlements: getCompatibilityEntitlements(),
      metadata: {
        displayOrder: 0,
        featuresSummary: ['Módulos liberados para compatibilidade total']
      }
    };

    const saved = await storageService.savePlan(freeCompatDoc);
    invalidateCache();
    return saved;
  }

  return currentDefault;
}

module.exports = {
  getAllPlans,
  getPlanById,
  getPlanBySlug,
  getDefaultPlan,
  createPlan,
  updatePlan,
  setPlanStatus,
  setDefaultPlan,
  ensureDefaultPlan,
  clearCache,
  invalidateCache,
  generatePlanId,
  normalizeSlug,
  validatePricing,
  validateMetadata,
  normalizePlanDoc
};
