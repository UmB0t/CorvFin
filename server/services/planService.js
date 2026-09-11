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
 * Normaliza dados de precificação tolerando formatos legados (amountCents / interval)
 * e convertendo-os em tempo de execução para a estrutura canônica de ofertas (offers).
 * NÃO realiza mutação destrutiva nem grava em banco por efeito colateral.
 */
function normalizePricingDoc(pricing) {
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) {
    return {
      currency: 'BRL',
      offers: {
        monthly: {
          enabled: true,
          interval: 'month',
          intervalCount: 1,
          regularPriceCents: 0,
          intro: { enabled: false, promotionalPriceCents: null, priceCents: null, cycles: null },
          campaign: null
        },
        yearly: { enabled: false }
      }
    };
  }

  // Se já possui formato canônico com "offers", normaliza seus campos internos
  if (pricing.offers && typeof pricing.offers === 'object') {
    const currency = (typeof pricing.currency === 'string' && pricing.currency.trim())
      ? pricing.currency.trim().toUpperCase()
      : 'BRL';

    const monthlyRaw = pricing.offers.monthly || {};
    const yearlyRaw = pricing.offers.yearly || {};

    const getPromoPrice = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      const val = obj.promotionalPriceCents !== undefined ? obj.promotionalPriceCents : obj.priceCents;
      return (typeof val === 'number' && Number.isInteger(val) && val >= 0) ? val : null;
    };

    const monthly = {
      enabled: monthlyRaw.enabled === true,
      interval: 'month',
      intervalCount: (typeof monthlyRaw.intervalCount === 'number' && Number.isInteger(monthlyRaw.intervalCount) && monthlyRaw.intervalCount >= 1)
        ? monthlyRaw.intervalCount
        : 1,
      regularPriceCents: (typeof monthlyRaw.regularPriceCents === 'number' && Number.isInteger(monthlyRaw.regularPriceCents) && monthlyRaw.regularPriceCents >= 0)
        ? monthlyRaw.regularPriceCents
        : 0,
      intro: (monthlyRaw.intro && typeof monthlyRaw.intro === 'object' && monthlyRaw.intro.enabled === true) ? {
        enabled: true,
        promotionalPriceCents: getPromoPrice(monthlyRaw.intro),
        priceCents: getPromoPrice(monthlyRaw.intro),
        cycles: (typeof monthlyRaw.intro.cycles === 'number' && Number.isInteger(monthlyRaw.intro.cycles) && monthlyRaw.intro.cycles >= 1)
          ? monthlyRaw.intro.cycles
          : null
      } : { enabled: false, promotionalPriceCents: null, priceCents: null, cycles: null },
      campaign: (monthlyRaw.campaign && typeof monthlyRaw.campaign === 'object' && monthlyRaw.campaign.enabled === true) ? {
        enabled: true,
        promotionalPriceCents: getPromoPrice(monthlyRaw.campaign),
        priceCents: getPromoPrice(monthlyRaw.campaign),
        validFrom: monthlyRaw.campaign.validFrom ? String(monthlyRaw.campaign.validFrom).slice(0, 10) : null,
        validUntil: monthlyRaw.campaign.validUntil ? String(monthlyRaw.campaign.validUntil).slice(0, 10) : null
      } : null
    };

    const yearly = {
      enabled: yearlyRaw.enabled === true,
      interval: 'year',
      intervalCount: (typeof yearlyRaw.intervalCount === 'number' && Number.isInteger(yearlyRaw.intervalCount) && yearlyRaw.intervalCount >= 1)
        ? yearlyRaw.intervalCount
        : 1,
      regularPriceCents: (typeof yearlyRaw.regularPriceCents === 'number' && Number.isInteger(yearlyRaw.regularPriceCents) && yearlyRaw.regularPriceCents >= 0)
        ? yearlyRaw.regularPriceCents
        : 0,
      intro: (yearlyRaw.intro && typeof yearlyRaw.intro === 'object' && yearlyRaw.intro.enabled === true) ? {
        enabled: true,
        promotionalPriceCents: getPromoPrice(yearlyRaw.intro),
        priceCents: getPromoPrice(yearlyRaw.intro),
        cycles: (typeof yearlyRaw.intro.cycles === 'number' && Number.isInteger(yearlyRaw.intro.cycles) && yearlyRaw.intro.cycles >= 1)
          ? yearlyRaw.intro.cycles
          : null
      } : { enabled: false, promotionalPriceCents: null, priceCents: null, cycles: null },
      campaign: (yearlyRaw.campaign && typeof yearlyRaw.campaign === 'object' && yearlyRaw.campaign.enabled === true) ? {
        enabled: true,
        promotionalPriceCents: getPromoPrice(yearlyRaw.campaign),
        priceCents: getPromoPrice(yearlyRaw.campaign),
        validFrom: yearlyRaw.campaign.validFrom ? String(yearlyRaw.campaign.validFrom).slice(0, 10) : null,
        validUntil: yearlyRaw.campaign.validUntil ? String(yearlyRaw.campaign.validUntil).slice(0, 10) : null
      } : null
    };

    return {
      currency,
      offers: {
        monthly,
        yearly
      }
    };
  }

  // Caso contrário, é um registro legado (amountCents / interval)
  const rawAmount = pricing.amountCents ?? pricing.cents ?? 0;
  const regularPriceCents = (typeof rawAmount === 'number' && Number.isInteger(rawAmount) && rawAmount >= 0)
    ? rawAmount
    : 0;
  const rawInterval = String(pricing.interval || pricing.billingInterval || 'month').trim().toLowerCase();
  const isYearly = (rawInterval === 'year' || rawInterval === 'yearly');

  return {
    currency: 'BRL',
    offers: {
      monthly: {
        enabled: !isYearly,
        interval: 'month',
        intervalCount: 1,
        regularPriceCents: isYearly ? 0 : regularPriceCents,
        intro: { enabled: false, promotionalPriceCents: null, priceCents: null, cycles: null },
        campaign: null
      },
      yearly: {
        enabled: isYearly,
        interval: 'year',
        intervalCount: 1,
        regularPriceCents: isYearly ? regularPriceCents : 0,
        intro: { enabled: false, promotionalPriceCents: null, priceCents: null, cycles: null },
        campaign: null
      }
    }
  };
}

/**
 * Normaliza um documento de plano, garantindo evolução de schema controlada
 * para limites novos e estrutura canônica de ofertas comerciais em tempo de execução.
 */
function normalizePlanDoc(planDoc) {
  if (!planDoc || typeof planDoc !== 'object') return planDoc;
  if (planDoc.entitlements) {
    normalizePlanEntitlements(planDoc.entitlements);
  }
  if (planDoc.pricing) {
    planDoc.pricing = normalizePricingDoc(planDoc.pricing);
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
 * Validação rigorosa dos dados de precificação recebidos por POST/PUT Admin (Fail-Closed).
 * Rejeita explicitamente o formato legado (amountCents/interval) em novas escritas.
 */
function validatePricingInput(pricing) {
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) {
    const err = new Error('Pricing deve ser um objeto válido');
    err.code = 'INVALID_PRICING_STRUCTURE';
    throw err;
  }

  // 1. Rejeição explícita de campos legados no nível raiz (Leitura != Escrita)
  if ('amountCents' in pricing || 'cents' in pricing || 'interval' in pricing || 'billingInterval' in pricing) {
    const err = new Error('Pricing legado (amountCents/interval) não é aceito na criação/edição. Utilize o schema canônico com "offers".');
    err.code = 'LEGACY_PRICING_NOT_ACCEPTED';
    throw err;
  }

  // 2. Whitelist estrita de chaves de pricing
  const allowedRootKeys = ['currency', 'offers'];
  const rootKeys = Object.keys(pricing);
  const unknownRootKeys = rootKeys.filter(k => !allowedRootKeys.includes(k));
  if (unknownRootKeys.length > 0) {
    const err = new Error(`Campos não permitidos em pricing: ${unknownRootKeys.join(', ')}`);
    err.code = 'UNKNOWN_PRICING_FIELD';
    throw err;
  }

  // 3. Currency: BRL
  const currency = pricing.currency;
  if (typeof currency !== 'string' || currency.trim().toUpperCase() !== 'BRL') {
    const err = new Error(`Pricing currency deve ser "BRL", recebido: "${currency}"`);
    err.code = 'INVALID_CURRENCY';
    throw err;
  }

  // 4. Offers
  const offers = pricing.offers;
  if (!offers || typeof offers !== 'object' || Array.isArray(offers)) {
    const err = new Error('Pricing.offers deve ser um objeto contendo a configuração de ofertas');
    err.code = 'INVALID_OFFERS_STRUCTURE';
    throw err;
  }

  const allowedOfferTypes = ['monthly', 'yearly'];
  const offerKeys = Object.keys(offers);
  const unknownOfferTypes = offerKeys.filter(k => !allowedOfferTypes.includes(k));
  if (unknownOfferTypes.length > 0) {
    const err = new Error(`Tipos de oferta não permitidos em pricing.offers: ${unknownOfferTypes.join(', ')}`);
    err.code = 'UNKNOWN_OFFER_TYPE';
    throw err;
  }

  const validatedOffers = {};

  for (const offerType of ['monthly', 'yearly']) {
    const rawOffer = offers[offerType];
    const expectedInterval = (offerType === 'monthly') ? 'month' : 'year';

    if (rawOffer === undefined) {
      validatedOffers[offerType] = {
        enabled: false,
        interval: expectedInterval,
        intervalCount: 1,
        regularPriceCents: 0,
        intro: { enabled: false, promotionalPriceCents: null, priceCents: null, cycles: null },
        campaign: null
      };
      continue;
    }

    if (!rawOffer || typeof rawOffer !== 'object' || Array.isArray(rawOffer)) {
      const err = new Error(`Oferta "${offerType}" deve ser um objeto`);
      err.code = 'INVALID_OFFER_STRUCTURE';
      throw err;
    }

    const allowedOfferKeys = ['enabled', 'interval', 'intervalCount', 'regularPriceCents', 'intro', 'campaign'];
    const unknownOfferKeys = Object.keys(rawOffer).filter(k => !allowedOfferKeys.includes(k));
    if (unknownOfferKeys.length > 0) {
      const err = new Error(`Campos não permitidos na oferta "${offerType}": ${unknownOfferKeys.join(', ')}`);
      err.code = 'UNKNOWN_OFFER_FIELD';
      throw err;
    }

    // Se enabled não foi informado, mas regularPriceCents foi passado, infere enabled: true
    let isOfferEnabled = rawOffer.enabled;
    if (isOfferEnabled === undefined) {
      if (typeof rawOffer.regularPriceCents === 'number') {
        isOfferEnabled = true;
      } else {
        isOfferEnabled = false;
      }
    } else if (typeof isOfferEnabled !== 'boolean') {
      const err = new Error(`Campo "enabled" da oferta "${offerType}" deve ser booleano`);
      err.code = 'INVALID_OFFER_ENABLED';
      throw err;
    }

    if (!isOfferEnabled) {
      validatedOffers[offerType] = {
        enabled: false,
        interval: expectedInterval,
        intervalCount: 1,
        regularPriceCents: 0,
        intro: { enabled: false, promotionalPriceCents: null, priceCents: null, cycles: null },
        campaign: null
      };
      continue;
    }

    const interval = rawOffer.interval ? String(rawOffer.interval).trim().toLowerCase() : expectedInterval;
    if (interval !== expectedInterval) {
      const err = new Error(`Oferta "${offerType}" deve ter interval "${expectedInterval}", recebido: "${rawOffer.interval}"`);
      err.code = 'INVALID_OFFER_INTERVAL';
      throw err;
    }

    const intervalCount = rawOffer.intervalCount !== undefined ? rawOffer.intervalCount : 1;
    if (typeof intervalCount !== 'number' || !Number.isInteger(intervalCount) || intervalCount < 1) {
      const err = new Error(`intervalCount da oferta "${offerType}" deve ser um inteiro >= 1`);
      err.code = 'INVALID_INTERVAL_COUNT';
      throw err;
    }

    const regularPriceCents = rawOffer.regularPriceCents;
    if (typeof regularPriceCents !== 'number' || !Number.isInteger(regularPriceCents) || regularPriceCents < 0) {
      const err = new Error(`regularPriceCents da oferta "${offerType}" deve ser um inteiro >= 0 (centavos inteiros)`);
      err.code = 'INVALID_PRICE_CENTS';
      throw err;
    }

    // Validação de Promoção Introdutória (intro)
    let validatedIntro = { enabled: false, promotionalPriceCents: null, priceCents: null, cycles: null };
    if (rawOffer.intro !== undefined && rawOffer.intro !== null) {
      if (typeof rawOffer.intro !== 'object' || Array.isArray(rawOffer.intro)) {
        const err = new Error(`intro da oferta "${offerType}" deve ser um objeto`);
        err.code = 'INVALID_INTRO_STRUCTURE';
        throw err;
      }

      const allowedIntroKeys = ['enabled', 'promotionalPriceCents', 'priceCents', 'cycles'];
      const unknownIntroKeys = Object.keys(rawOffer.intro).filter(k => !allowedIntroKeys.includes(k));
      if (unknownIntroKeys.length > 0) {
        const err = new Error(`Campos não permitidos em intro da oferta "${offerType}": ${unknownIntroKeys.join(', ')}`);
        err.code = 'UNKNOWN_INTRO_FIELD';
        throw err;
      }

      let isIntroEnabled = rawOffer.intro.enabled;
      if (isIntroEnabled === undefined) {
        if (rawOffer.intro.promotionalPriceCents !== undefined || rawOffer.intro.priceCents !== undefined) {
          isIntroEnabled = true;
        } else {
          isIntroEnabled = false;
        }
      } else if (typeof isIntroEnabled !== 'boolean') {
        const err = new Error(`intro.enabled da oferta "${offerType}" deve ser booleano`);
        err.code = 'INVALID_INTRO_ENABLED';
        throw err;
      }

      if (isIntroEnabled) {
        const iPrice = rawOffer.intro.promotionalPriceCents !== undefined
          ? rawOffer.intro.promotionalPriceCents
          : rawOffer.intro.priceCents;
        if (typeof iPrice !== 'number' || !Number.isInteger(iPrice) || iPrice < 0) {
          const err = new Error(`intro.promotionalPriceCents da oferta "${offerType}" deve ser um inteiro >= 0`);
          err.code = 'INVALID_INTRO_PRICE';
          throw err;
        }

        const iCycles = rawOffer.intro.cycles;
        if (typeof iCycles !== 'number' || !Number.isInteger(iCycles) || iCycles < 1) {
          const err = new Error(`intro.cycles da oferta "${offerType}" deve ser um inteiro >= 1`);
          err.code = 'INVALID_INTRO_CYCLES';
          throw err;
        }

        validatedIntro = {
          enabled: true,
          promotionalPriceCents: iPrice,
          priceCents: iPrice,
          cycles: iCycles
        };
      }
    }

    // Validação de Promoção por Campanha (campaign)
    let validatedCampaign = null;
    if (rawOffer.campaign !== undefined && rawOffer.campaign !== null) {
      if (typeof rawOffer.campaign !== 'object' || Array.isArray(rawOffer.campaign)) {
        const err = new Error(`campaign da oferta "${offerType}" deve ser um objeto ou null`);
        err.code = 'INVALID_CAMPAIGN_STRUCTURE';
        throw err;
      }

      const allowedCampaignKeys = ['enabled', 'promotionalPriceCents', 'priceCents', 'validFrom', 'validUntil'];
      const unknownCampaignKeys = Object.keys(rawOffer.campaign).filter(k => !allowedCampaignKeys.includes(k));
      if (unknownCampaignKeys.length > 0) {
        const err = new Error(`Campos não permitidos em campaign da oferta "${offerType}": ${unknownCampaignKeys.join(', ')}`);
        err.code = 'UNKNOWN_CAMPAIGN_FIELD';
        throw err;
      }

      let isCampaignEnabled = rawOffer.campaign.enabled;
      if (isCampaignEnabled === undefined) {
        if (rawOffer.campaign.promotionalPriceCents !== undefined || rawOffer.campaign.priceCents !== undefined) {
          isCampaignEnabled = true;
        } else {
          isCampaignEnabled = false;
        }
      } else if (typeof isCampaignEnabled !== 'boolean') {
        const err = new Error(`campaign.enabled da oferta "${offerType}" deve ser booleano`);
        err.code = 'INVALID_CAMPAIGN_ENABLED';
        throw err;
      }

      if (isCampaignEnabled) {
        const cPrice = rawOffer.campaign.promotionalPriceCents !== undefined
          ? rawOffer.campaign.promotionalPriceCents
          : rawOffer.campaign.priceCents;
        if (typeof cPrice !== 'number' || !Number.isInteger(cPrice) || cPrice < 0) {
          const err = new Error(`campaign.promotionalPriceCents da oferta "${offerType}" deve ser um inteiro >= 0`);
          err.code = 'INVALID_CAMPAIGN_PRICE';
          throw err;
        }

        const validFrom = rawOffer.campaign.validFrom;
        const validUntil = rawOffer.campaign.validUntil;

        if (typeof validFrom !== 'string' || !validFrom.trim()) {
          const err = new Error(`campaign.validFrom da oferta "${offerType}" deve ser uma data válida`);
          err.code = 'INVALID_CAMPAIGN_DATE';
          throw err;
        }
        if (typeof validUntil !== 'string' || !validUntil.trim()) {
          const err = new Error(`campaign.validUntil da oferta "${offerType}" deve ser uma data válida`);
          err.code = 'INVALID_CAMPAIGN_DATE';
          throw err;
        }

        const fromDate = new Date(validFrom);
        const untilDate = new Date(validUntil);
        if (isNaN(fromDate.getTime()) || isNaN(untilDate.getTime())) {
          const err = new Error(`campaign dates da oferta "${offerType}" são inválidas`);
          err.code = 'INVALID_CAMPAIGN_DATE';
          throw err;
        }

        const fromIso = validFrom.slice(0, 10);
        const untilIso = validUntil.slice(0, 10);
        if (untilIso < fromIso) {
          const err = new Error(`campaign.validUntil ("${untilIso}") não pode ser anterior a validFrom ("${fromIso}")`);
          err.code = 'INVALID_CAMPAIGN_RANGE';
          throw err;
        }

        validatedCampaign = {
          enabled: true,
          promotionalPriceCents: cPrice,
          priceCents: cPrice,
          validFrom: fromIso,
          validUntil: untilIso
        };
      }
    }

    // REGRA 3: Não permitir duas promoções concorrentes na mesma oferta
    if (validatedIntro.enabled && validatedCampaign && validatedCampaign.enabled) {
      const err = new Error(`A oferta "${offerType}" não pode habilitar promoção introdutória e promoção por campanha simultaneamente.`);
      err.code = 'CONCURRENT_PROMOTIONS_NOT_ALLOWED';
      throw err;
    }

    validatedOffers[offerType] = {
      enabled: true,
      interval: expectedInterval,
      intervalCount,
      regularPriceCents,
      intro: validatedIntro,
      campaign: validatedCampaign
    };
  }

  return {
    currency: 'BRL',
    offers: validatedOffers
  };
}

/**
 * Validação de precificação para chamadas internas e criação programática de planos.
 * Se pricing possuir offers, executa validação canônica estrita via validatePricingInput.
 * Se for legado programmatic (amountCents / interval), normaliza para offers antes de retornar.
 */
function validatePricing(pricing) {
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) {
    throw new Error('Pricing must be a valid object');
  }

  // Se já possui offers, valida estritamente
  if (pricing.offers && typeof pricing.offers === 'object') {
    return validatePricingInput(pricing);
  }

  // Se é chamada interna programática legada: valida amountCents e normaliza para offers
  const { amountCents, currency, interval } = pricing;
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error(`Pricing amountCents must be an integer >= 0, received: ${amountCents}`);
  }
  if (typeof currency !== 'string' || currency.trim().toUpperCase() !== 'BRL') {
    throw new Error(`Pricing currency must be "BRL", received: "${currency}"`);
  }
  if (typeof interval !== 'string' || !ALLOWED_INTERVALS.includes(interval.trim().toLowerCase())) {
    throw new Error(`Pricing interval must be one of [${ALLOWED_INTERVALS.join(', ')}], received: "${interval}"`);
  }

  return normalizePricingDoc(pricing);
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
        currency: 'BRL',
        offers: {
          monthly: {
            enabled: true,
            interval: 'month',
            intervalCount: 1,
            regularPriceCents: 0,
            intro: { enabled: false, priceCents: null, cycles: null },
            campaign: null
          },
          yearly: {
            enabled: false
          }
        }
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
        currency: 'BRL',
        offers: {
          monthly: {
            enabled: true,
            interval: 'month',
            intervalCount: 1,
            regularPriceCents: 0,
            intro: { enabled: false, priceCents: null, cycles: null },
            campaign: null
          },
          yearly: {
            enabled: false
          }
        }
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
  validatePricingInput,
  normalizePricingDoc,
  validateMetadata,
  normalizePlanDoc
};
