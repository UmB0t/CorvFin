/**
 * CorvFin V2 - Temporal Foundation Utilities (temporalUtils.js)
 *
 * Helpers canônicos para manipulação, validação e resolução de datas civis,
 * dias de vencimento, competências e leitura/escrita compatível de paidHistory.
 *
 * Princípios:
 * 1. Data civil sem horário e sem conversão para timestamp UTC;
 * 2. Imunidade estrita a deslocamentos de timezone;
 * 3. Formato canônico YYYY-MM-DD para datas e YYYY-MM para competências;
 * 4. Tolerância a chaves legadas YYYY-M em leituras de paidHistory.
 */

'use strict';

const config = require('../config/config');

const APP_TIMEZONE = (config && config.APP_TIMEZONE) ? config.APP_TIMEZONE : 'America/Fortaleza';

/**
 * Determina se um ano é bissexto no calendário gregoriano.
 * @param {number|string} year - Ano com 4 dígitos (ex: 2024, 2026)
 * @returns {boolean}
 */
function isLeapYear(year) {
  const y = Number(year);
  if (!Number.isInteger(y)) return false;
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

/**
 * Retorna a quantidade exata de dias de um determinado mês em determinado ano.
 * @param {number|string} year - Ano (ex: 2026)
 * @param {number|string} month - Mês (1..12)
 * @returns {number} Quantidade de dias (28, 29, 30 ou 31), ou 0 se inválido.
 */
function getDaysInMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return 0;
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  if (m === 4 || m === 6 || m === 9 || m === 11) return 30;
  return 31;
}

/**
 * Limita (clamp) um dia nominal ao último dia válido do mês/ano informado.
 * Ex: clampDayToMonth(2026, 4, 31) => 30
 * Ex: clampDayToMonth(2026, 2, 31) => 28
 * Ex: clampDayToMonth(2024, 2, 31) => 29
 *
 * @param {number|string} year - Ano
 * @param {number|string} month - Mês (1..12)
 * @param {number|string} day - Dia nominal desejado
 * @returns {number} Dia válido no mês (1..maxDays)
 */
function clampDayToMonth(year, month, day) {
  const maxDays = getDaysInMonth(year, month);
  if (maxDays === 0) return 1;
  const d = Number(day);
  if (!Number.isFinite(d) || d < 1) return 1;
  return Math.min(Math.floor(d), maxDays);
}

/**
 * Valida se uma string representa uma data civil real no formato canônico YYYY-MM-DD.
 * Rejeita:
 * - Formatos divergentes (ex: DD/MM/YYYY, YYYY-M-D)
 * - Anos fora do intervalo suportado (2000..2100)
 * - Dias inexistentes (ex: 31 de abril, 29 de fevereiro em ano não bissexto)
 *
 * @param {string} dateStr - String de data (ex: "2026-09-11")
 * @returns {boolean}
 */
function isValidCanonicalDateString(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(trimmed);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 2000 || y > 2100) return false;
  const maxDays = getDaysInMonth(y, m);
  return d >= 1 && d <= maxDays;
}

/**
 * Realiza o parsing de uma data civil canônica YYYY-MM-DD em componentes inteiros { year, month, day }.
 * Retorna null se a string for inválida.
 *
 * @param {string} dateStr - String de data civil (ex: "2026-09-11")
 * @returns {{ year: number, month: number, day: number } | null}
 */
function parseCanonicalDate(dateStr) {
  if (!isValidCanonicalDateString(dateStr)) return null;
  const [y, m, d] = dateStr.trim().split('-').map(Number);
  return { year: y, month: m, day: d };
}

/**
 * Formata componentes numéricos de ano, mês e dia no formato canônico YYYY-MM-DD.
 *
 * @param {number|string} year - Ano
 * @param {number|string} month - Mês (1..12)
 * @param {number|string} day - Dia (1..31)
 * @returns {string} String formatada "YYYY-MM-DD"
 */
function formatCanonicalDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Resolve a data civil de uma ocorrência baseada em ano, mês e dia de vencimento (dueDay).
 * Aplica clamp transparente para meses menores sem alterar o dueDay original persistido.
 *
 * Ex: resolveOccurrenceDate(2026, 4, 31) => { date: "2026-04-30", year: 2026, month: 4, day: 30, nominalDay: 31, wasClamped: true }
 * Ex: resolveOccurrenceDate(2026, 5, 10) => { date: "2026-05-10", year: 2026, month: 5, day: 10, nominalDay: 10, wasClamped: false }
 * Ex: resolveOccurrenceDate(2026, 5, null) => null
 *
 * @param {number|string} year - Ano da competência
 * @param {number|string} month - Mês da competência (1..12)
 * @param {number|string|null} dueDay - Dia nominal configurado (1..31 ou null)
 * @returns {Object|null}
 */
function resolveOccurrenceDate(year, month, dueDay) {
  if (dueDay === null || dueDay === undefined || dueDay === '') return null;
  const numDay = Number(dueDay);
  if (!Number.isInteger(numDay) || numDay < 1 || numDay > 31) return null;
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;

  const clampedDay = clampDayToMonth(y, m, numDay);
  const isClamped = clampedDay !== numDay;
  return {
    date: formatCanonicalDate(y, m, clampedDay),
    year: y,
    month: m,
    day: clampedDay,
    nominalDay: numDay,
    originalDay: numDay,
    wasClamped: isClamped,
    clamped: isClamped
  };
}

/**
 * Retorna a data civil corrente ("YYYY-MM-DD") no fuso canônico de referência (America/Fortaleza).
 *
 * @param {Date} [referenceDate] - Data de referência (default: now)
 * @param {string} [timeZone] - Timezone IANA (default: America/Fortaleza)
 * @returns {string} String no formato "YYYY-MM-DD"
 */
function getTodayCivilDate(referenceDate = new Date(), timeZone = APP_TIMEZONE) {
  const d = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/**
 * Normaliza ano e mês para a chave canônica de competência "YYYY-MM".
 *
 * @param {number|string} year - Ano
 * @param {number|string} month - Mês (1..12)
 * @returns {string|null} Chave canônica "YYYY-MM" ou null se inválido
 */
function normalizeCompetenceKey(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || isNaN(y) || isNaN(m) || m < 1 || m > 12) return null;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Lê o histórico de pagamento de uma competência tolerando formato canônico ("YYYY-MM")
 * e formato legado ("YYYY-M") sem alterar o objeto em memória.
 *
 * @param {Object} paidHistory - Mapa de histórico do item
 * @param {number|string} year - Ano
 * @param {number|string} month - Mês
 * @returns {*} Valor registrado no paidHistory ou undefined se ausente
 */
function getPaidHistoryEntry(paidHistory, year, month) {
  if (!paidHistory || typeof paidHistory !== 'object' || Array.isArray(paidHistory)) return undefined;
  const canonicalKey = normalizeCompetenceKey(year, month);
  if (paidHistory[canonicalKey] !== undefined) return paidHistory[canonicalKey];
  const legacyKey = `${Number(year)}-${Number(month)}`;
  if (paidHistory[legacyKey] !== undefined) return paidHistory[legacyKey];
  return undefined;
}

module.exports = {
  APP_TIMEZONE,
  isLeapYear,
  getDaysInMonth,
  clampDayToMonth,
  isValidCanonicalDateString,
  parseCanonicalDate,
  formatCanonicalDate,
  resolveOccurrenceDate,
  getTodayCivilDate,
  normalizeCompetenceKey,
  getPaidHistoryEntry
};
