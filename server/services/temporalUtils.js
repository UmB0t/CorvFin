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
const TemporalDomain = require('../../shared/temporalDomain');

const APP_TIMEZONE = (config && config.APP_TIMEZONE) ? config.APP_TIMEZONE : 'America/Fortaleza';

/**
 * Retorna a data civil corrente ("YYYY-MM-DD") no fuso canônico de referência (America/Fortaleza).
 *
 * @param {Date} [referenceDate] - Data de referência (default: now)
 * @param {string} [timeZone] - Timezone IANA (default: America/Fortaleza)
 * @returns {string} String no formato "YYYY-MM-DD"
 */
function getTodayCivilDate(referenceDate = new Date(), timeZone = APP_TIMEZONE) {
  return TemporalDomain.getTodayCivilDate(referenceDate, timeZone);
}

module.exports = {
  APP_TIMEZONE,
  isLeapYear: TemporalDomain.isLeapYear,
  getDaysInMonth: TemporalDomain.getDaysInMonth,
  clampDayToMonth: TemporalDomain.clampDayToMonth,
  isValidCanonicalDateString: TemporalDomain.isValidCanonicalDateString,
  parseCanonicalDate: TemporalDomain.parseCanonicalDate,
  formatCanonicalDate: TemporalDomain.formatCanonicalDate,
  resolveOccurrenceDate: TemporalDomain.resolveOccurrenceDate,
  getTodayCivilDate,
  normalizeCompetenceKey: TemporalDomain.normalizeCompetenceKey,
  getPaidHistoryEntry: TemporalDomain.getPaidHistoryEntry,
  // Métodos canônicos V2 re-exportados
  getDayOfWeek: TemporalDomain.getDayOfWeek,
  getNextCivilDate: TemporalDomain.getNextCivilDate,
  getPrevCivilDate: TemporalDomain.getPrevCivilDate,
  isBusinessDay: TemporalDomain.isBusinessDay,
  getNextBusinessDay: TemporalDomain.getNextBusinessDay,
  getPrevBusinessDay: TemporalDomain.getPrevBusinessDay,
  resolveTemporalRule: TemporalDomain.resolveTemporalRule
};
