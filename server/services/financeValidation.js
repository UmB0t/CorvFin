/**
 * OmniFin V3 - Central Finance Validation & RBAC Preservation Service
 * Regras puras de sanitização estrutural, allowlist top-level e preservação de módulos.
 */

'use strict';

const { isValidCanonicalDateString, parseCanonicalDate } = require('./temporalUtils');

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

const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 1000;
const MAX_INSTALLMENTS = 240;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const STRING_LIMITS = {
  NAME_MAX: 150,
  DESCRIPTION_MAX: 500,
  NOTES_MAX: 2000,
  GENERIC_STRING_MAX: 4000
};

const TRACKED_ARRAY_COLLECTIONS = [
  'fixed',
  'variable',
  'extras',
  'debtors',
  'benefitTransactions',
  'assets',
  'aportes',
  'shoppingLists',
  'shoppingItemSuggestions',
  'savedSimulations',
  'readNotifications',
  'readReleases',
  'customExpensesOrder',
  'destinations',
  'categories'
];

/**
 * Varre recursivamente um objeto ou array procurando chaves perigosas:
 * - __proto__, constructor, prototype
 * - Chaves que iniciam com $ (operadores de injeção MongoDB)
 * - Chaves contendo . (injeção de path/dot-notation)
 * E rejeita profundidade excessiva (> MAX_DEPTH) para mitigar DoS de recursão.
 */
function hasDangerousKeys(value, depth = 0) {
  if (depth > MAX_DEPTH) {
    const err = new Error('INVALID_FINANCE_PAYLOAD: profundidade de dados excessiva.');
    err.status = 400;
    err.code = 'INVALID_FINANCE_PAYLOAD';
    throw err;
  }

  if (value === null || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (hasDangerousKeys(value[i], depth + 1)) {
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
    if (hasDangerousKeys(value[k], depth + 1)) {
      return true;
    }
  }

  return false;
}

/**
 * Validação semântica e limites de recursos para dados financeiros (Checkpoint Security 5B):
 * - Limites de contagem de coleções (max 1000 itens)
 * - Unicidade de IDs dentro da mesma coleção
 * - Rejeição de números não finitos (NaN, Infinity, -Infinity)
 * - Validação de competências e anos (1..12 e 2000..2100)
 * - Validação de parcelas (1..240)
 * - Validação de dueDay (1..31 ou null)
 * - Limites de comprimento de strings (nomes, descrições, notas)
 * - Tolerância legada completa para formatos históricos de paidHistory
 */
function validateFinanceSemantics(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return;
  }

  function checkString(str, maxLen, fieldName) {
    if (typeof str === 'string' && str.length > maxLen) {
      const err = new Error(`INVALID_FINANCE_PAYLOAD: o campo "${fieldName}" excede o limite de ${maxLen} caracteres.`);
      err.status = 400;
      err.code = 'INVALID_FINANCE_PAYLOAD';
      throw err;
    }
  }

  function checkFiniteNumber(num, fieldName, mustBePositive = false, allowZero = true) {
    if (num === undefined || num === null) return;
    if (typeof num === 'number') {
      if (!Number.isFinite(num)) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: valor numérico não finito detectado em "${fieldName}".`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }
      if (mustBePositive) {
        if (allowZero ? num < 0 : num <= 0) {
          const err = new Error(`INVALID_FINANCE_PAYLOAD: o valor de "${fieldName}" deve ser ${allowZero ? 'não negativo' : 'maior que zero'}.`);
          err.status = 400;
          err.code = 'INVALID_FINANCE_PAYLOAD';
          throw err;
        }
      }
    } else if (typeof num === 'string') {
      const parsed = Number(num);
      if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: valor numérico inválido em "${fieldName}".`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }
    }
  }

  function checkMonth(m, fieldName) {
    if (m === undefined || m === null) return;
    const num = Number(m);
    if (!Number.isInteger(num) || num < 1 || num > 12) {
      const err = new Error(`INVALID_FINANCE_PAYLOAD: mês inválido (${m}) em "${fieldName}". Deve ser um inteiro entre 1 e 12.`);
      err.status = 400;
      err.code = 'INVALID_FINANCE_PAYLOAD';
      throw err;
    }
  }

  function checkYear(y, fieldName) {
    if (y === undefined || y === null) return;
    const num = Number(y);
    if (!Number.isInteger(num) || num < MIN_YEAR || num > MAX_YEAR) {
      const err = new Error(`INVALID_FINANCE_PAYLOAD: ano inválido (${y}) em "${fieldName}". Deve estar entre ${MIN_YEAR} e ${MAX_YEAR}.`);
      err.status = 400;
      err.code = 'INVALID_FINANCE_PAYLOAD';
      throw err;
    }
  }

  function checkDueDay(d, fieldName) {
    if (d === undefined || d === null) return;
    const num = Number(d);
    if (!Number.isInteger(num) || num < 1 || num > 31) {
      const err = new Error(`INVALID_FINANCE_PAYLOAD: dia de vencimento inválido (${d}) em "${fieldName}". Deve estar entre 1 e 31 ou ser nulo.`);
      err.status = 400;
      err.code = 'INVALID_FINANCE_PAYLOAD';
      throw err;
    }
  }

  function checkCanonicalDateString(dateStr, fieldName) {
    if (dateStr === undefined || dateStr === null) return;
    if (typeof dateStr !== 'string' || !isValidCanonicalDateString(dateStr)) {
      const err = new Error(`INVALID_FINANCE_PAYLOAD: data civil inválida (${dateStr}) em "${fieldName}". Deve ser uma data real no formato YYYY-MM-DD entre 2000 e 2100.`);
      err.status = 400;
      err.code = 'INVALID_FINANCE_PAYLOAD';
      throw err;
    }
  }

  function checkPaidHistory(hist, parentName) {
    if (!hist || typeof hist !== 'object' || Array.isArray(hist)) return;
    const ymRegex = /^\d{4}-(0?[1-9]|1[0-2])$/;
    for (const k of Object.keys(hist)) {
      if (k.length > 50) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: chave de competência inválida em "${parentName}.paidHistory".`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }
      if (!ymRegex.test(k)) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: formato de competência inválido "${k}" em "${parentName}.paidHistory". Esperado YYYY-MM.`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }
      const val = hist[k];
      if (val === true || val === false) {
        // Formato legado booleano (A) - permitido
        continue;
      }
      if (typeof val === 'number') {
        // Formato legado numérico (B) - permitido se finito e >= 0
        checkFiniteNumber(val, `${parentName}.paidHistory[${k}]`, true, true);
      } else if (typeof val === 'object' && val !== null) {
        // Formato canônico (C)
        if (val.paidAmount !== undefined) {
          checkFiniteNumber(val.paidAmount, `${parentName}.paidHistory[${k}].paidAmount`, true, true);
        }
        if (val.amount !== undefined) {
          checkFiniteNumber(val.amount, `${parentName}.paidHistory[${k}].amount`, true, true);
        }
      }
    }
  }

  function checkInstallmentSchedule(sched, parentName) {
    if (!sched || typeof sched !== 'object' || Array.isArray(sched)) {
      const err = new Error(`INVALID_FINANCE_PAYLOAD: "${parentName}.installmentSchedule" deve ser um objeto.`);
      err.status = 400;
      err.code = 'INVALID_FINANCE_PAYLOAD';
      throw err;
    }
    const ymRegex = /^\d{4}-(0?[1-9]|1[0-2])$/;
    const keys = Object.keys(sched);
    if (keys.length > MAX_INSTALLMENTS) {
      const err = new Error(`INVALID_FINANCE_PAYLOAD: "${parentName}.installmentSchedule" excede o limite de ${MAX_INSTALLMENTS} competências.`);
      err.status = 400;
      err.code = 'INVALID_FINANCE_PAYLOAD';
      throw err;
    }
    for (const k of keys) {
      if (!ymRegex.test(k)) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: formato de competência inválido "${k}" em "${parentName}.installmentSchedule". Esperado YYYY-MM.`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }
      checkFiniteNumber(sched[k], `${parentName}.installmentSchedule[${k}]`, true, true);
    }
  }

  function checkTemporalRule(rule, parentName) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      const err = new Error(`INVALID_FINANCE_PAYLOAD: "${parentName}" deve ser um objeto.`);
      err.status = 400;
      err.code = 'INVALID_FINANCE_PAYLOAD';
      throw err;
    }
    checkString(rule.type, 50, `${parentName}.type`);
    if (rule.type === 'fixed_day') {
      if (rule.ordinal !== undefined) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: "ordinal" não é permitido em "${parentName}" do tipo "fixed_day".`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }
      const d = rule.day;
      const num = Number(d);
      if (d === undefined || d === null || !Number.isInteger(num) || num < 1 || num > 31) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: dia inválido (${d}) em "${parentName}.day". Deve ser um inteiro entre 1 e 31.`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }
      if (rule.weekendAdjustment !== undefined && rule.weekendAdjustment !== null) {
        checkString(rule.weekendAdjustment, 50, `${parentName}.weekendAdjustment`);
        if (!['none', 'previous_business_day', 'next_business_day'].includes(rule.weekendAdjustment)) {
          const err = new Error(`INVALID_FINANCE_PAYLOAD: ajuste de fim de semana inválido ("${rule.weekendAdjustment}") em "${parentName}.weekendAdjustment". Esperado 'none', 'previous_business_day' ou 'next_business_day'.`);
          err.status = 400;
          err.code = 'INVALID_FINANCE_PAYLOAD';
          throw err;
        }
      }
    } else if (rule.type === 'nth_business_day') {
      if (rule.day !== undefined) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: "day" não é permitido em "${parentName}" do tipo "nth_business_day".`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }
      if (rule.weekendAdjustment !== undefined) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: "weekendAdjustment" não é permitido em "${parentName}" do tipo "nth_business_day".`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }
      if (rule.ordinal === undefined || rule.ordinal === null) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: ordinal obrigatório em "${parentName}.ordinal".`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }
      const ord = Number(rule.ordinal);
      if (!Number.isInteger(ord) || (ord !== -1 && (ord < 1 || ord > 23))) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: ordinal inválido (${rule.ordinal}) em "${parentName}.ordinal". Deve ser um inteiro entre 1 e 23 ou -1 (último dia útil).`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }
    } else {
      const err = new Error(`INVALID_FINANCE_PAYLOAD: tipo de regra temporal inválido ("${rule.type}") em "${parentName}.type". Esperado 'fixed_day' ou 'nth_business_day'.`);
      err.status = 400;
      err.code = 'INVALID_FINANCE_PAYLOAD';
      throw err;
    }
  }

  // 1. Validação de coleções de arrays e unicidade de IDs por coleção
  for (const colName of TRACKED_ARRAY_COLLECTIONS) {
    const arr = payload[colName];
    if (arr !== undefined && arr !== null) {
      if (!Array.isArray(arr)) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: "${colName}" deve ser um array.`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }
      if (arr.length > MAX_ARRAY_ITEMS) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: a coleção "${colName}" excede o limite máximo de ${MAX_ARRAY_ITEMS} itens.`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }

      // Checagem de ID duplicado dentro da MESMA coleção
      const seenIds = new Set();
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          if (item.id != null) {
            const idStr = String(item.id).trim();
            if (idStr !== '') {
              if (seenIds.has(idStr)) {
                const err = new Error(`INVALID_FINANCE_PAYLOAD: ID duplicado "${idStr}" detectado na coleção "${colName}".`);
                err.status = 400;
                err.code = 'INVALID_FINANCE_PAYLOAD';
                throw err;
              }
              seenIds.add(idStr);
            }
          }
        }
      }
    }
  }

  // 2. Validação semântica de fixed
  if (Array.isArray(payload.fixed)) {
    for (const f of payload.fixed) {
      if (!f || typeof f !== 'object') continue;
      checkString(f.name, STRING_LIMITS.NAME_MAX, 'fixed.name');
      checkString(f.note, STRING_LIMITS.NOTES_MAX, 'fixed.note');
      checkDueDay(f.dueDay, 'fixed.dueDay');
      checkPaidHistory(f.paidHistory, 'fixed');

      checkString(f.payee, STRING_LIMITS.NAME_MAX, 'fixed.payee');
      if (f.payment && typeof f.payment === 'object') {
        checkString(f.payment.method, 50, 'fixed.payment.method');
        checkString(f.payment.account, STRING_LIMITS.NAME_MAX, 'fixed.payment.account');
      }
      if (f.temporal && typeof f.temporal === 'object') {
        checkString(f.temporal.type, 50, 'fixed.temporal.type');
        if (f.temporal.recurrence && typeof f.temporal.recurrence === 'object') {
          checkString(f.temporal.recurrence.frequency, 50, 'fixed.temporal.recurrence.frequency');
          checkString(f.temporal.recurrence.endType, 50, 'fixed.temporal.recurrence.endType');
          if (f.temporal.recurrence.count !== undefined && f.temporal.recurrence.count !== null) {
            const count = Number(f.temporal.recurrence.count);
            if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) {
              const err = new Error(`INVALID_FINANCE_PAYLOAD: count de recorrência inválido (${f.temporal.recurrence.count}).`);
              err.status = 400;
              err.code = 'INVALID_FINANCE_PAYLOAD';
              throw err;
            }
          }
          checkMonth(f.temporal.recurrence.endMonth, 'fixed.temporal.recurrence.endMonth');
          checkYear(f.temporal.recurrence.endYear, 'fixed.temporal.recurrence.endYear');
        }
      }
      if (f.endedFrom && typeof f.endedFrom === 'object') {
        checkMonth(f.endedFrom.month, 'fixed.endedFrom.month');
        checkYear(f.endedFrom.year, 'fixed.endedFrom.year');
      }

      if (Array.isArray(f.versions)) {
        if (f.versions.length > MAX_ARRAY_ITEMS) {
          const err = new Error(`INVALID_FINANCE_PAYLOAD: fixed.versions excede o limite de ${MAX_ARRAY_ITEMS} itens.`);
          err.status = 400;
          err.code = 'INVALID_FINANCE_PAYLOAD';
          throw err;
        }
        for (const v of f.versions) {
          if (!v || typeof v !== 'object') continue;
          checkMonth(v.month, 'fixed.versions.month');
          checkMonth(v.startMonth, 'fixed.versions.startMonth');
          checkYear(v.year, 'fixed.versions.year');
          checkYear(v.startYear, 'fixed.versions.startYear');
          checkFiniteNumber(v.amount, 'fixed.versions.amount', true, true);
        }
      }
    }
  }

  // 3. Validação semântica de variable
  if (Array.isArray(payload.variable)) {
    for (const v of payload.variable) {
      if (!v || typeof v !== 'object') continue;
      checkString(v.name, STRING_LIMITS.NAME_MAX, 'variable.name');
      checkString(v.note, STRING_LIMITS.NOTES_MAX, 'variable.note');
      checkString(v.payee, STRING_LIMITS.NAME_MAX, 'variable.payee');
      if (v.payment && typeof v.payment === 'object') {
        checkString(v.payment.method, 50, 'variable.payment.method');
        checkString(v.payment.account, STRING_LIMITS.NAME_MAX, 'variable.payment.account');
      }
      if (v.temporal && typeof v.temporal === 'object') {
        checkString(v.temporal.type, 50, 'variable.temporal.type');
      }
      checkDueDay(v.dueDay, 'variable.dueDay');
      if (v.transactionDate !== undefined && v.transactionDate !== null) {
        checkCanonicalDateString(v.transactionDate, 'variable.transactionDate');
      }
      checkFiniteNumber(v.amount, 'variable.amount', true, true);
      checkMonth(v.startMonth, 'variable.startMonth');
      checkMonth(v.endMonth, 'variable.endMonth');
      checkYear(v.startYear, 'variable.startYear');
      checkYear(v.endYear, 'variable.endYear');
      checkPaidHistory(v.paidHistory, 'variable');

      if (v.installments !== undefined && v.installments !== null) {
        const inst = Number(v.installments);
        if (!Number.isInteger(inst) || inst < 1 || inst > MAX_INSTALLMENTS) {
          const err = new Error(`INVALID_FINANCE_PAYLOAD: número de parcelas inválido (${v.installments}). Deve ser um inteiro entre 1 e ${MAX_INSTALLMENTS}.`);
          err.status = 400;
          err.code = 'INVALID_FINANCE_PAYLOAD';
          throw err;
        }
      }

      if (v.totalAmount !== undefined && v.totalAmount !== null) {
        checkFiniteNumber(v.totalAmount, 'variable.totalAmount', true, false);
      }
      if (v.installmentAmount !== undefined && v.installmentAmount !== null) {
        checkFiniteNumber(v.installmentAmount, 'variable.installmentAmount', true, false);
      }
      if (v.amountInputMode !== undefined && v.amountInputMode !== null) {
        checkString(v.amountInputMode, 20, 'variable.amountInputMode');
        if (v.amountInputMode !== 'total' && v.amountInputMode !== 'installment') {
          const err = new Error(`INVALID_FINANCE_PAYLOAD: amountInputMode inválido (${v.amountInputMode}). Deve ser 'total' ou 'installment'.`);
          err.status = 400;
          err.code = 'INVALID_FINANCE_PAYLOAD';
          throw err;
        }
      }

      if (v.installmentSchedule !== undefined && v.installmentSchedule !== null) {
        checkInstallmentSchedule(v.installmentSchedule, 'variable');
      }
    }
  }

  // 4. Validação semântica de debtors
  if (Array.isArray(payload.debtors)) {
    for (const d of payload.debtors) {
      if (!d || typeof d !== 'object') continue;
      checkString(d.title, STRING_LIMITS.NAME_MAX, 'debtors.title');
      checkString(d.debtorName || d.name, STRING_LIMITS.NAME_MAX, 'debtors.debtorName');
      checkString(d.description, STRING_LIMITS.DESCRIPTION_MAX, 'debtors.description');
      if (d.receiveDay !== undefined && d.receiveDay !== null && d.receiveDay !== '') {
        checkDueDay(d.receiveDay, 'debtors.receiveDay');
      }
      checkFiniteNumber(d.amount, 'debtors.amount', true, true);
      checkMonth(d.startMonth, 'debtors.startMonth');
      checkMonth(d.endMonth, 'debtors.endMonth');
      checkYear(d.startYear, 'debtors.startYear');
      checkYear(d.endYear, 'debtors.endYear');
      checkPaidHistory(d.paidHistory, 'debtors');
    }
  }

  // 5. Validação semântica de extras
  if (Array.isArray(payload.extras)) {
    for (const e of payload.extras) {
      if (!e || typeof e !== 'object') continue;
      checkString(e.title, STRING_LIMITS.NAME_MAX, 'extras.title');
      checkString(e.source || e.sender, STRING_LIMITS.NAME_MAX, 'extras.source');
      checkString(e.description, STRING_LIMITS.DESCRIPTION_MAX, 'extras.description');
      const isMultiMonth = (() => {
        if (e.installments && Number(e.installments) > 1) return true;
        if (e.startYear !== undefined && e.endYear !== undefined) {
          const sy = Number(e.startYear);
          const ey = Number(e.endYear);
          const sm = Number(e.startMonth || 1);
          const em = Number(e.endMonth || 1);
          if (ey > sy || (ey === sy && em > sm)) return true;
        }
        return false;
      })();

      const hasReceiveDay = e.receiveDay !== undefined && e.receiveDay !== null && e.receiveDay !== '';
      const hasReceiveDate = e.receiveDate !== undefined && e.receiveDate !== null && e.receiveDate !== '';

      if (hasReceiveDay && hasReceiveDate) {
        const err = new Error('INVALID_FINANCE_PAYLOAD: "receiveDay" e "receiveDate" são mutuamente exclusivos em extras.');
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }

      if (hasReceiveDay) {
        checkDueDay(e.receiveDay, 'extras.receiveDay');
      }

      if (hasReceiveDate) {
        checkCanonicalDateString(e.receiveDate, 'extras.receiveDate');
        const parsed = parseCanonicalDate(e.receiveDate);
        if (parsed) {
          if (e.startYear !== undefined && e.startMonth !== undefined) {
            if (parsed.year !== Number(e.startYear) || parsed.month !== Number(e.startMonth)) {
              const err = new Error(`INVALID_FINANCE_PAYLOAD: "receiveDate" (${e.receiveDate}) diverge da competência do extra (${e.startYear}-${String(e.startMonth).padStart(2, '0')}).`);
              err.status = 400;
              err.code = 'INVALID_FINANCE_PAYLOAD';
              throw err;
            }
          }
        }
      }
      checkFiniteNumber(e.amount, 'extras.amount', true, true);
      checkMonth(e.startMonth, 'extras.startMonth');
      checkMonth(e.endMonth, 'extras.endMonth');
      checkYear(e.startYear, 'extras.startYear');
      checkYear(e.endYear, 'extras.endYear');
    }
  }

  // 6. Validação semântica de benefitsConfig e benefitTransactions
  if (payload.benefitsConfig && typeof payload.benefitsConfig === 'object') {
    checkFiniteNumber(payload.benefitsConfig.amount, 'benefitsConfig.amount', true, true);
    checkFiniteNumber(payload.benefitsConfig.va, 'benefitsConfig.va', true, true);
    checkFiniteNumber(payload.benefitsConfig.vr, 'benefitsConfig.vr', true, true);
    if (payload.benefitsConfig.creditRule !== undefined && payload.benefitsConfig.creditRule !== null) {
      checkTemporalRule(payload.benefitsConfig.creditRule, 'benefitsConfig.creditRule');
    }
  }

  if (Array.isArray(payload.benefitTransactions)) {
    for (const b of payload.benefitTransactions) {
      if (!b || typeof b !== 'object') continue;
      checkString(b.description, STRING_LIMITS.DESCRIPTION_MAX, 'benefitTransactions.description');
      checkString(b.note, STRING_LIMITS.NOTES_MAX, 'benefitTransactions.note');
      checkDueDay(b.day, 'benefitTransactions.day');
      checkMonth(b.month, 'benefitTransactions.month');
      checkYear(b.year, 'benefitTransactions.year');
      // Cada nova transação de gasto deve ter valor positivo finito > 0
      checkFiniteNumber(b.amount, 'benefitTransactions.amount', true, false);
    }
  }

  // 7. Validação semântica de assets e aportes
  if (Array.isArray(payload.assets)) {
    for (const a of payload.assets) {
      if (!a || typeof a !== 'object') continue;
      checkString(a.name, STRING_LIMITS.NAME_MAX, 'assets.name');
      checkString(a.note, STRING_LIMITS.NOTES_MAX, 'assets.note');
      checkFiniteNumber(a.currentAmount, 'assets.currentAmount');
      checkFiniteNumber(a.goalAmount, 'assets.goalAmount', true, true);
    }
  }

  if (Array.isArray(payload.aportes)) {
    for (const ap of payload.aportes) {
      if (!ap || typeof ap !== 'object') continue;
      checkString(ap.note, STRING_LIMITS.NOTES_MAX, 'aportes.note');
      checkMonth(ap.month, 'aportes.month');
      checkYear(ap.year, 'aportes.year');
      checkFiniteNumber(ap.amount, 'aportes.amount', true, false);
    }
  }

  // 8. Validação de escalares de topo
  checkMonth(payload.month, 'month');
  checkYear(payload.year, 'year');

  if (payload.profile && typeof payload.profile === 'object') {
    checkString(payload.profile.name, STRING_LIMITS.NAME_MAX, 'profile.name');
    checkString(payload.profile.theme, 50, 'profile.theme');
    if (payload.profile.baseSalary !== undefined && payload.profile.baseSalary !== null) {
      checkFiniteNumber(payload.profile.baseSalary, 'profile.baseSalary', true, true);
    }
    if (payload.profile.salaryPayment !== undefined && payload.profile.salaryPayment !== null) {
      checkTemporalRule(payload.profile.salaryPayment, 'profile.salaryPayment');
    }
  }

  if (payload.incomes && typeof payload.incomes === 'object' && !Array.isArray(payload.incomes)) {
    const ymRegex = /^\d{4}-(0?[1-9]|1[0-2])$/;
    for (const k of Object.keys(payload.incomes)) {
      if (!ymRegex.test(k)) {
        const err = new Error(`INVALID_FINANCE_PAYLOAD: competência inválida "${k}" em incomes.`);
        err.status = 400;
        err.code = 'INVALID_FINANCE_PAYLOAD';
        throw err;
      }
      checkFiniteNumber(payload.incomes[k], `incomes[${k}]`, true, true);
    }
  }
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
 * - Rejeita profundidade excessiva > 8 com 400 (Anti-DoS)
 * - Valida semântica de coleções, números finitos, competências, parcelas e unicidade de IDs (Security 5B)
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

  if (hasDangerousKeys(payload, 0)) {
    const err = new Error('INVALID_FINANCE_PAYLOAD: chaves não permitidas ou formato inválido.');
    err.status = 400;
    err.code = 'INVALID_FINANCE_PAYLOAD';
    throw err;
  }

  validateFinanceSemantics(payload);

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
  MAX_DEPTH,
  MAX_ARRAY_ITEMS,
  STRING_LIMITS,
  hasDangerousKeys,
  filterAllowedFields,
  validateFinanceSemantics,
  sanitizeFinancePayload,
  applyRbacModulePreservation
};
