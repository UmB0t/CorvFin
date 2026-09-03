/**
 * OmniFin V3 - Central Finance Validation & RBAC Preservation Service
 * Regras puras de sanitização estrutural, allowlist top-level e preservação de módulos.
 */

'use strict';

// 1. Allowlist estrita de campos persistíveis derivados do schema real do OmniFin
const ALLOWED_TOP_LEVEL_FIELDS = new Set([
  'version',
  'firstLogin',
  'onboarding',
  'sidebarCollapsed',
  'simplifiedView',
  'chartViewType',
  'destChartViewType',
  'debtorPersonChartType',
  'debtorDestChartType',
  'expensesSubView',
  'debtorsSubView',
  'theme',
  'year',
  'month',
  'profile',
  'destinations',
  'categories',
  'budgets',
  'collapsedSections',
  'benefitsConfig',
  'benefitTransactions',
  'readNotifications',
  'readReleases',
  'incomes',
  'fixed',
  'variable',
  'customExpensesOrder',
  'extras',
  'debtors',
  'assets',
  'aportes',
  'shoppingLists',
  'shoppingItemSuggestions',
  'savedSimulations'
]);

// 2. Campos gerados ou controlados estritamente pelo servidor (nunca aceitos do cliente como dados persistíveis)
const SERVER_CONTROLLED_FIELDS = new Set([
  '_id',
  'userId',
  'revision',
  'lastModified',
  'createdAt'
]);

// 3. Mapeamento formal de Permissions -> Campos proprietários do documento financeiro
const PERMISSION_MODULE_FIELDS_MAP = {
  despesas: ['fixed', 'variable', 'customExpensesOrder'],
  extras: ['extras'],
  devedores: ['debtors'],
  investimentos: ['assets', 'aportes'],
  beneficios: ['benefitsConfig', 'benefitTransactions'],
  compras: ['shoppingLists', 'shoppingItemSuggestions']
};

/**
 * Varre recursivamente um objeto ou array procurando chaves perigosas:
 * - __proto__, constructor, prototype
 * - Chaves que iniciam com $ (operadores de injeção MongoDB)
 * - Chaves contendo . (injeção de path/dot-notation)
 */
function hasDangerousKeys(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (hasDangerousKeys(value[i])) {
        return true;
      }
    }
    return false;
  }

  // Obter todas as chaves próprias (cobrindo __proto__, constructor, prototype injetados no JSON)
  const keys = Object.getOwnPropertyNames(value);
  for (const k of keys) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
      return true;
    }
    if (k.startsWith('$')) {
      return true;
    }
    if (k.includes('.')) {
      return true;
    }
    if (hasDangerousKeys(value[k])) {
      return true;
    }
  }

  return false;
}

/**
 * Filtra puramente as chaves de topo permitidas pela Allowlist e remove campos controlados pelo servidor.
 * Utilizado para persistência interna segura sem lançar erros em objetos do runtime.
 */
function filterAllowedFields(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  const clean = {};
  for (const key of Object.keys(payload)) {
    if (SERVER_CONTROLLED_FIELDS.has(key)) {
      continue;
    }
    if (ALLOWED_TOP_LEVEL_FIELDS.has(key)) {
      clean[key] = payload[key];
    }
  }
  return clean;
}

/**
 * Sanitiza estruturalmente o payload financeiro recebido do cliente na fronteira HTTP:
 * - Rejeita payloads inválidos ou não-objetos (400)
 * - Rejeita recursivamente chaves maliciosas (__proto__, constructor, prototype, $, .) com 400
 * - Filtra campos top-level pela allowlist oficial
 * - Remove campos controlados pelo servidor (_id, userId, revision, etc.)
 */
function sanitizeFinancePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const err = new Error('INVALID_FINANCE_PAYLOAD: esperado um objeto JSON.');
    err.status = 400;
    err.code = 'INVALID_FINANCE_PAYLOAD';
    throw err;
  }

  if (hasDangerousKeys(payload)) {
    const err = new Error('INVALID_FINANCE_PAYLOAD: chaves não permitidas ou formato inválido.');
    err.status = 400;
    err.code = 'INVALID_FINANCE_PAYLOAD';
    throw err;
  }

  return filterAllowedFields(payload);
}

/**
 * Aplica a política de preservação de dados para módulos sem permissão:
 * Como o frontend envia o snapshot agregado completo em cada save, se o usuário tiver
 * permissão desativada para um módulo (ex: beneficios = false), o backend restaura o valor
 * original do banco para os campos daquele módulo, impedindo tanto a adulteração não autorizada
 * quanto a perda acidental de dados.
 */
function applyRbacModulePreservation(sanitizedPayload, currentFinances, userPermissions) {
  if (!userPermissions || typeof userPermissions !== 'object') {
    return sanitizedPayload;
  }

  const result = Object.assign({}, sanitizedPayload);

  for (const [permKey, fields] of Object.entries(PERMISSION_MODULE_FIELDS_MAP)) {
    // Se a permissão for explicitamente false para este módulo
    if (userPermissions[permKey] === false) {
      for (const field of fields) {
        if (currentFinances && currentFinances[field] !== undefined) {
          result[field] = currentFinances[field];
        } else {
          delete result[field];
        }
      }
    }
  }

  return result;
}

module.exports = {
  ALLOWED_TOP_LEVEL_FIELDS,
  SERVER_CONTROLLED_FIELDS,
  PERMISSION_MODULE_FIELDS_MAP,
  hasDangerousKeys,
  filterAllowedFields,
  sanitizeFinancePayload,
  applyRbacModulePreservation
};
