/**
 * Registry Canônico de Entitlements e Capacidades Comerciais (CorvFin V2)
 *
 * Este registry atua estritamente como declaração e contrato de capacidades válidas para
 * planos comerciais. Ele NÃO é motor de autorização e NÃO concede bypass comercial a admins.
 *
 * Recursos MVP (auditados):
 * - dashboard, despesas, extras, devedores, investimentos, beneficios, compras, simulacao, relatorios, ai
 *
 * Recursos explicitamente NÃO incluídos como entitlements comerciais no MVP:
 * - perfil, configuracoes
 *
 * Semântica de Limites:
 * - null: explicitamente ilimitado (permitido apenas se allowUnlimited === true)
 * - 0: zero itens permitidos
 * - inteiro > 0: teto quantitativo máximo
 * - chave ausente / undefined / tipo inválido: CONFIGURAÇÃO INVÁLIDA (fail-closed)
 */

const ENTITLEMENT_REGISTRY = {
  dashboard: {
    label: 'Dashboard',
    supportsAccessToggle: true,
    availableLimits: []
  },
  despesas: {
    label: 'Despesas',
    supportsAccessToggle: true,
    availableLimits: []
  },
  extras: {
    label: 'Rendas Extras',
    supportsAccessToggle: true,
    availableLimits: []
  },
  devedores: {
    label: 'Devedores e Cobranças',
    supportsAccessToggle: true,
    availableLimits: [
      {
        key: 'maxItems',
        label: 'Limite de Devedores Cadastrados',
        type: 'integer',
        min: 0,
        allowUnlimited: true
      }
    ]
  },
  investimentos: {
    label: 'Investimentos',
    supportsAccessToggle: true,
    availableLimits: [
      {
        key: 'maxItems',
        label: 'Limite de Investimentos Cadastrados',
        type: 'integer',
        min: 0,
        allowUnlimited: true
      }
    ]
  },
  beneficios: {
    label: 'Benefícios',
    supportsAccessToggle: true,
    availableLimits: []
  },
  compras: {
    label: 'Lista de Compras',
    supportsAccessToggle: true,
    availableLimits: []
  },
  simulacao: {
    label: 'Simulação Financeira',
    supportsAccessToggle: true,
    availableLimits: []
  },
  relatorios: {
    label: 'Relatórios Financeiros',
    supportsAccessToggle: true,
    availableLimits: []
  },
  ai: {
    label: 'Assistente de Inteligência Artificial',
    supportsAccessToggle: true,
    availableLimits: [
      {
        key: 'questionsPerDay',
        label: 'Perguntas por Dia',
        type: 'integer',
        min: 0,
        allowUnlimited: true
      }
    ]
  }
};

/**
 * Validação estrita de um objeto de entitlements contra o registry canônico.
 * Lança erro com código descritivo caso a estrutura viole o contrato.
 */
function validatePlanEntitlements(entitlements, requireAllResources = false) {
  if (!entitlements || typeof entitlements !== 'object' || Array.isArray(entitlements)) {
    throw new Error('Entitlements must be a non-null object');
  }

  const registryKeys = Object.keys(ENTITLEMENT_REGISTRY);

  // 1. Rejeita qualquer chave de recurso desconhecida
  for (const resourceKey of Object.keys(entitlements)) {
    if (!ENTITLEMENT_REGISTRY[resourceKey]) {
      const err = new Error(`Unknown resource in entitlements: "${resourceKey}"`);
      err.code = 'UNKNOWN_RESOURCE';
      throw err;
    }
  }

  // Se requireAllResources for true (ex: criação de plano completo), exige todos os 10
  if (requireAllResources) {
    for (const key of registryKeys) {
      if (!entitlements[key]) {
        throw new Error(`Missing required resource in entitlements: "${key}"`);
      }
    }
  }

  // 2. Valida cada recurso presente no payload
  for (const [resourceKey, resourceConfig] of Object.entries(entitlements)) {
    if (!resourceConfig || typeof resourceConfig !== 'object' || Array.isArray(resourceConfig)) {
      throw new Error(`Invalid configuration for resource "${resourceKey}": must be an object`);
    }

    // Apenas 'enabled' e 'limits' são propriedades permitidas no objeto do recurso
    const allowedProps = ['enabled', 'limits'];
    for (const prop of Object.keys(resourceConfig)) {
      if (!allowedProps.includes(prop)) {
        throw new Error(`Unrecognized property "${prop}" in resource "${resourceKey}"`);
      }
    }

    if (typeof resourceConfig.enabled !== 'boolean') {
      throw new Error(`Property "enabled" in resource "${resourceKey}" must be a boolean`);
    }

    const registryDef = ENTITLEMENT_REGISTRY[resourceKey];
    const availableLimits = registryDef.availableLimits || [];
    const availableKeys = availableLimits.map(l => l.key);

    if (resourceConfig.limits !== undefined && resourceConfig.limits !== null) {
      if (typeof resourceConfig.limits !== 'object' || Array.isArray(resourceConfig.limits)) {
        throw new Error(`Property "limits" in resource "${resourceKey}" must be a valid object`);
      }

      // Se o recurso não suporta limits, o objeto de limits deve ser vazio
      if (availableLimits.length === 0 && Object.keys(resourceConfig.limits).length > 0) {
        throw new Error(`Resource "${resourceKey}" does not support limits`);
      }

      // Valida cada chave de limite presente
      for (const [limitKey, limitValue] of Object.entries(resourceConfig.limits)) {
        const limitDef = availableLimits.find(l => l.key === limitKey);
        if (!limitDef) {
          const err = new Error(`Unknown limit key "${limitKey}" for resource "${resourceKey}"`);
          err.code = 'UNKNOWN_LIMIT';
          throw err;
        }

        if (limitValue === null) {
          if (!limitDef.allowUnlimited) {
            throw new Error(`Unlimited (null) is not permitted for "${resourceKey}.${limitKey}"`);
          }
        } else if (typeof limitValue === 'number') {
          if (!Number.isInteger(limitValue)) {
            throw new Error(`Limit "${resourceKey}.${limitKey}" must be an integer, received decimal: ${limitValue}`);
          }
          if (limitValue < (limitDef.min ?? 0)) {
            throw new Error(`Limit "${resourceKey}.${limitKey}" cannot be negative, received: ${limitValue}`);
          }
        } else {
          // Rejeita strings numéricas, undefined explícito, booleanos, etc.
          throw new Error(`Invalid type for limit "${resourceKey}.${limitKey}": received ${typeof limitValue}`);
        }
      }
    }
  }

  return true;
}

/**
 * Retorna os entitlements canônicos completos do plano de compatibilidade.
 * Todos os 10 módulos com enabled: true e limites nulos (ilimitado) para zero regressão.
 */
function getCompatibilityEntitlements() {
  const result = {};
  for (const [key, def] of Object.entries(ENTITLEMENT_REGISTRY)) {
    const limits = {};
    for (const lim of def.availableLimits) {
      limits[lim.key] = null;
    }
    result[key] = {
      enabled: true,
      limits
    };
  }
  return result;
}

module.exports = {
  ENTITLEMENT_REGISTRY,
  validatePlanEntitlements,
  getCompatibilityEntitlements
};
