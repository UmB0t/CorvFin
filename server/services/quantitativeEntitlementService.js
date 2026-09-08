/**
 * QuantitativeEntitlementService — Serviço Centralizado de Enforcement Quantitativo (CorvFin V2 - Lote 5F)
 *
 * Responsabilidades:
 * 1. Mapeamento e contagem exata das entidades comerciais por domínio;
 * 2. Avaliação estrita delta-based (nextCount = currentCount + delta);
 * 3. Preservação de usuários over-limit:
 *    - delta <= 0: sempre permitido (leitura, edição in-place, quitação, exclusão ou redução);
 *    - delta > 0: permitido se e somente se nextCount <= limit (onde limit !== null);
 * 4. Semântica estrita:
 *    - null: ilimitado;
 *    - 0: zero itens permitidos (nenhum item novo pode ser criado);
 *    - N > 0: teto quantitativo máximo permitido;
 *    - ausente / inválido: fail-closed via EntitlementService (PLAN_CONFIGURATION_INVALID);
 * 5. Lançamento do erro canônico padronizado RESOURCE_LIMIT_REACHED (HTTP 403);
 * 6. Suporte a PUT agregado sem bloquear recursos inalterados / reduzidos.
 */

'use strict';

const entitlementService = require('./entitlementService');

const QUANTITATIVE_RESOURCES = [
  'despesas',
  'extras',
  'devedores',
  'investimentos',
  'beneficios',
  'compras'
];

/**
 * Erro de domínio canônico para limite comercial atingido.
 */
class ResourceLimitReachedError extends Error {
  constructor({ resource, limitKey, limit, currentCount, nextCount, message }) {
    const msg = message || `[RESOURCE_LIMIT_REACHED] Limite comercial de itens atingido para "${resource}". Máximo permitido: ${limit}, quantidade resultante: ${nextCount}.`;
    super(msg);
    this.name = 'ResourceLimitReachedError';
    this.code = 'RESOURCE_LIMIT_REACHED';
    this.status = 403;
    this.resource = resource;
    this.limitKey = limitKey;
    this.limit = limit;
    this.currentCount = currentCount;
    this.nextCount = nextCount;
  }
}

/**
 * Contabiliza as entidades comerciais lógicas cadastradas em um documento de finanças.
 *
 * Regras congeladas:
 * - despesas: finances.fixed.length + finances.variable.length (parceladas e recorrentes contam como 1 item cada)
 * - extras: finances.extras.length
 * - devedores: finances.debtors.length
 * - investimentos: finances.assets.length (aportes em aportes[] NÃO contam como novos ativos)
 * - beneficios: finances.benefitTransactions.length (benefitsConfig NÃO conta)
 * - compras: finances.shoppingLists.length (itens dentro de shoppingLists[].items NÃO contam)
 */
function countDomainItems(financesDoc, resourceKey) {
  if (!financesDoc || typeof financesDoc !== 'object') {
    return 0;
  }

  switch (resourceKey) {
    case 'despesas': {
      const fixedCount = Array.isArray(financesDoc.fixed) ? financesDoc.fixed.length : 0;
      const varCount = Array.isArray(financesDoc.variable) ? financesDoc.variable.length : 0;
      return fixedCount + varCount;
    }
    case 'extras': {
      return Array.isArray(financesDoc.extras) ? financesDoc.extras.length : 0;
    }
    case 'devedores': {
      return Array.isArray(financesDoc.debtors) ? financesDoc.debtors.length : 0;
    }
    case 'investimentos': {
      return Array.isArray(financesDoc.assets) ? financesDoc.assets.length : 0;
    }
    case 'beneficios': {
      return Array.isArray(financesDoc.benefitTransactions) ? financesDoc.benefitTransactions.length : 0;
    }
    case 'compras': {
      return Array.isArray(financesDoc.shoppingLists) ? financesDoc.shoppingLists.length : 0;
    }
    default:
      return 0;
  }
}

/**
 * Avalia e assegura que a operação está dentro do limite quantitativo do recurso.
 *
 * @param {Object} params
 * @param {Object} params.user Usuário autenticado
 * @param {string} params.resourceKey Recurso canônico
 * @param {string} [params.limitKey='maxItems'] Chave de limite
 * @param {Object} params.currentFinances Documento financeiro atual
 * @param {Object} [params.incomingFinances] Documento financeiro resultante proposto
 * @param {number} [params.explicitDelta] Delta explícito quando incomingFinances não for fornecido
 * @returns {Promise<Object>} { allowed: boolean, limit, currentCount, nextCount, delta }
 */
async function assertWithinItemLimit({
  user,
  resourceKey,
  limitKey = 'maxItems',
  currentFinances,
  incomingFinances,
  explicitDelta
}) {
  if (!QUANTITATIVE_RESOURCES.includes(resourceKey)) {
    return { allowed: true, limit: null, delta: 0 };
  }

  // Valida a existência e integridade do vínculo de plano do usuário (fail-closed).
  // Se user.planId for inválido ou inexistente no catálogo comercial, lança PLAN_REFERENCE_INVALID (403),
  // mesmo para operações com delta = 0 ou delta < 0.
  // Nota: isso valida a integridade do plano sem avaliar permissões ou assertAccess do recurso específico.
  await entitlementService.getPlanForUser(user);

  const currentCount = countDomainItems(currentFinances, resourceKey);
  let nextCount;

  if (incomingFinances && typeof incomingFinances === 'object') {
    nextCount = countDomainItems(incomingFinances, resourceKey);
  } else if (explicitDelta !== undefined && explicitDelta !== null) {
    nextCount = currentCount + Number(explicitDelta);
  } else {
    nextCount = currentCount;
  }

  const delta = nextCount - currentCount;

  // REGRA DE OURO DELTA-BASED:
  // Se delta <= 0, a operação não aumenta a quantidade lógica.
  // Usuários over-limit podem consultar, editar, quitar e excluir normalmente.
  // Recursos sem crescimento em um PUT agregado NÃO são avaliados nem bloqueados.
  if (delta <= 0) {
    return {
      allowed: true,
      currentCount,
      nextCount,
      delta
    };
  }

  // Se delta > 0, o usuário está tentando expandir a quantidade de itens.
  // 1. Verifica se o plano/permissão permite acesso comercial ao recurso
  await entitlementService.assertAccess(user, resourceKey);

  // 2. Resolve o limite canônico do plano
  const limit = await entitlementService.getLimit(user, resourceKey, limitKey);

  // Se limite for explicitamente nulo (null), o recurso é ilimitado
  if (limit === null) {
    return {
      allowed: true,
      limit: null,
      currentCount,
      nextCount,
      delta
    };
  }

  // Se nextCount ultrapassar o limite (inclusive quando limit === 0), bloqueia imediatamente
  if (nextCount > limit) {
    throw new ResourceLimitReachedError({
      resource: resourceKey,
      limitKey,
      limit,
      currentCount,
      nextCount
    });
  }

  return {
    allowed: true,
    limit,
    currentCount,
    nextCount,
    delta
  };
}

/**
 * Avalia todos os 6 recursos quantitativos para uma requisição de PUT /api/finances.
 *
 * Avaliação estritamente isolada por domínio:
 * Recursos com delta <= 0 não bloqueiam o documento agregado, mesmo que outros recursos
 * estejam inativos ou no limite. Apenas domínios com delta > 0 sofrem enforcement.
 */
async function assertAllItemLimits({ user, currentFinances, incomingFinances }) {
  for (const resourceKey of QUANTITATIVE_RESOURCES) {
    await assertWithinItemLimit({
      user,
      resourceKey,
      limitKey: 'maxItems',
      currentFinances,
      incomingFinances
    });
  }
}

module.exports = {
  QUANTITATIVE_RESOURCES,
  ResourceLimitReachedError,
  countDomainItems,
  assertWithinItemLimit,
  assertAllItemLimits
};
