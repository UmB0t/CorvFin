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
  calendario: {
    label: 'Calendário',
    supportsAccessToggle: true,
    availableLimits: []
  },
  despesas: {
    label: 'Despesas',
    supportsAccessToggle: true,
    availableLimits: [
      {
        key: 'maxItems',
        label: 'Limite de Despesas Cadastradas',
        type: 'integer',
        min: 0,
        allowUnlimited: true
      }
    ]
  },
  extras: {
    label: 'Rendas Extras',
    supportsAccessToggle: true,
    availableLimits: [
      {
        key: 'maxItems',
        label: 'Limite de Rendas Extras Cadastradas',
        type: 'integer',
        min: 0,
        allowUnlimited: true
      }
    ]
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
    availableLimits: [
      {
        key: 'maxItems',
        label: 'Limite de Transações de Benefícios',
        type: 'integer',
        min: 0,
        allowUnlimited: true
      }
    ]
  },
  compras: {
    label: 'Lista de Compras',
    supportsAccessToggle: true,
    availableLimits: [
      {
        key: 'maxItems',
        label: 'Limite de Listas de Compras',
        type: 'integer',
        min: 0,
        allowUnlimited: true
      }
    ]
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
        key: 'creditsPerDay',
        label: 'Créditos por Dia',
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
        const isLegacyAiKey = resourceKey === 'ai' && limitKey === 'questionsPerDay';
        const limitDef = availableLimits.find(l => l.key === limitKey) || (isLegacyAiKey ? { key: 'questionsPerDay', type: 'integer', min: 0, allowUnlimited: true } : null);
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

/**
 * Tabela canônica de Evoluções de Schema de Entitlements Versionadas.
 * Cada lote declara explicitamente os pares [resourceKey, limitKey] introduzidos
 * que são elegíveis a preenchimento retrocompatível com `null` (unlimited) caso ausentes.
 *
 * Limites anteriores (ex: devedores.maxItems, investimentos.maxItems)
 * NÃO estão nesta lista e portanto permanecem estritamente fail-closed caso ausentes em um plano.
 */
const PLAN_ENTITLEMENT_SCHEMA_EVOLUTIONS = {
  '5F': [
    ['despesas', 'maxItems'],
    ['extras', 'maxItems'],
    ['beneficios', 'maxItems'],
    ['compras', 'maxItems']
  ],
  '5G': [
    ['ai', 'questionsPerDay', 'creditsPerDay']
  ]
};

/**
 * Evolui e normaliza os entitlements de um plano aplicando exclusivamente as migrações
 * de schema versionadas e permitidas (allowlist).
 *
 * Invariantes:
 * 1. Apenas os 4 limites introduzidos no Lote 5F recebem compatibilidade automática (null) se ausentes;
 * 2. Limites pré-existentes ausentes (ex: devedores.maxItems, investimentos.maxItems)
 *    permanecem AUSENTES, garantindo fail-closed no runtime getLimit();
 * 3. Qualquer valor já configurado (0, N positivo, null) é estritamente PRESERVADO sem sobrescrita;
 * 4. Lote 5G: Se plano histórico possui ai.questionsPerDay = X e NÃO possui creditsPerDay,
 *    migra creditsPerDay = X (onde X pode ser null, 0 ou N positivo). Se ambos ausentes, permanece fail-closed.
 */
function normalizePlanEntitlements(entitlements) {
  if (!entitlements || typeof entitlements !== 'object' || Array.isArray(entitlements)) {
    return entitlements;
  }

  // 1. Evoluções 5F (maxItems)
  const evolutions5F = PLAN_ENTITLEMENT_SCHEMA_EVOLUTIONS['5F'] || [];

  for (const [resourceKey, limitKey] of evolutions5F) {
    const resource = entitlements[resourceKey];
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
      continue;
    }

    if (!resource.limits || typeof resource.limits !== 'object' || Array.isArray(resource.limits)) {
      resource.limits = {};
    }

    // Somente preenche se a chave da allowlist 5F estiver estritamente ausente
    if (!(limitKey in resource.limits)) {
      resource.limits[limitKey] = null;
    }
  }

  // 2. Evolução 5G: ai.questionsPerDay -> ai.creditsPerDay
  if (entitlements.ai && typeof entitlements.ai === 'object') {
    if (!entitlements.ai.limits || typeof entitlements.ai.limits !== 'object' || Array.isArray(entitlements.ai.limits)) {
      entitlements.ai.limits = {};
    }
    const aiLimits = entitlements.ai.limits;
    // Se possui questionsPerDay e não possui creditsPerDay, migra preservando valor
    if ('questionsPerDay' in aiLimits && !('creditsPerDay' in aiLimits)) {
      aiLimits.creditsPerDay = aiLimits.questionsPerDay;
    }
  }

  // 3. Evolução Lote A3.4.2: compatibilidade em runtime para o novo entitlement 'calendario' em planos legados
  // Se o plano legado não possui a chave 'calendario', concede enabled: true em memória
  // Preserva estritamente se já estiver definido (true ou false) e não afeta os demais recursos fail-closed
  if (!('calendario' in entitlements)) {
    entitlements.calendario = {
      enabled: true,
      limits: {}
    };
  }

  return entitlements;
}

module.exports = {
  ENTITLEMENT_REGISTRY,
  PLAN_ENTITLEMENT_SCHEMA_EVOLUTIONS,
  validatePlanEntitlements,
  getCompatibilityEntitlements,
  normalizePlanEntitlements
};
