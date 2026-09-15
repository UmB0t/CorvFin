/**
 * CorvFin V2 — Shared Temporal Domain (shared/temporalDomain.js)
 *
 * Módulo temporal canônico puro e neutro compartilhado entre Backend e Frontend.
 *
 * Princípios Arquiteturais Estritos:
 * 1. PUREZA MATEMÁTICA: Mesma entrada = mesma saída. Sem efeitos colaterais nem I/O.
 * 2. INDEPENDÊNCIA DE TIMEZONE: Cálculos civis estritamente sem Date.parse / new Date("YYYY-MM-DD").
 * 3. PADRÃO CANÔNICO: "YYYY-MM-DD" para datas civis e "YYYY-MM" para competências.
 * 4. COMPATIBILIDADE DUAL (UMD): Funciona via require/module.exports no Node.js e globalThis.TemporalDomain no browser.
 * 5. TOLERÂNCIA E FAIL-SAFE: Validação estrita de limites com fallback seguro (null) sem throw.
 */

(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    // Node.js / CommonJS
    const domain = factory();
    module.exports = domain;
    if (root && !root.TemporalDomain) root.TemporalDomain = domain;
  } else {
    // Browser / Global
    root.TemporalDomain = factory();
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

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
   * Retorna a data civil corrente ("YYYY-MM-DD") no fuso canônico de referência.
   * @param {Date} [referenceDate] - Data de referência (default: now)
   * @param {string} [timeZone] - Timezone IANA (default: America/Fortaleza)
   * @returns {string} String no formato "YYYY-MM-DD"
   */
  function getTodayCivilDate(referenceDate = new Date(), timeZone = 'America/Fortaleza') {
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

  /**
   * Helper interno para normalizar argumentos que podem vir como (year, month, day) ou "YYYY-MM-DD".
   * @private
   */
  function extractYearMonthDay(arg1, arg2, arg3) {
    if (typeof arg1 === 'string' && isValidCanonicalDateString(arg1)) {
      return parseCanonicalDate(arg1);
    }
    const y = Number(arg1);
    const m = Number(arg2);
    const d = Number(arg3);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
    if (m < 1 || m > 12) return null;
    const maxDays = getDaysInMonth(y, m);
    if (d < 1 || d > maxDays) return null;
    return { year: y, month: m, day: d };
  }

  /**
   * Calcula o dia da semana no calendário civil gregoriano de forma 100% determinística.
   * Utiliza a congruência de Sakamoto, imune a timezones, horário de verão e Date parsing.
   *
   * @param {number|string} year - Ano civil (ou string "YYYY-MM-DD")
   * @param {number|string} [month] - Mês (1..12)
   * @param {number|string} [day] - Dia (1..maxDays)
   * @returns {number} 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado, ou -1 se inválido
   */
  function getDayOfWeek(year, month, day) {
    const parts = extractYearMonthDay(year, month, day);
    if (!parts) return -1;
    const { year: y, month: m, day: d } = parts;
    const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    const adjY = m < 3 ? y - 1 : y;
    return (adjY + Math.floor(adjY / 4) - Math.floor(adjY / 100) + Math.floor(adjY / 400) + t[m - 1] + d) % 7;
  }

  /**
   * Retorna o dia civil imediatamente subsequente, suportando mudança de mês,
   * mudança de ano, fevereiro e anos bissextos.
   *
   * @param {number|string} year - Ano ou string "YYYY-MM-DD"
   * @param {number|string} [month] - Mês (1..12)
   * @param {number|string} [day] - Dia
   * @returns {{ date: string, year: number, month: number, day: number, dayOfWeek: number } | null}
   */
  function getNextCivilDate(year, month, day) {
    const parts = extractYearMonthDay(year, month, day);
    if (!parts) return null;
    const { year: y, month: m, day: d } = parts;
    const maxDays = getDaysInMonth(y, m);
    let nextY = y;
    let nextM = m;
    let nextD = d + 1;
    if (nextD > maxDays) {
      nextD = 1;
      if (nextM === 12) {
        nextM = 1;
        nextY = y + 1;
      } else {
        nextM = m + 1;
      }
    }
    const dateStr = formatCanonicalDate(nextY, nextM, nextD);
    return {
      date: dateStr,
      year: nextY,
      month: nextM,
      day: nextD,
      dayOfWeek: getDayOfWeek(nextY, nextM, nextD)
    };
  }

  /**
   * Retorna o dia civil imediatamente anterior, suportando mudança de mês,
   * mudança de ano, fevereiro e anos bissextos.
   *
   * @param {number|string} year - Ano ou string "YYYY-MM-DD"
   * @param {number|string} [month] - Mês (1..12)
   * @param {number|string} [day] - Dia
   * @returns {{ date: string, year: number, month: number, day: number, dayOfWeek: number } | null}
   */
  function getPrevCivilDate(year, month, day) {
    const parts = extractYearMonthDay(year, month, day);
    if (!parts) return null;
    const { year: y, month: m, day: d } = parts;
    let prevY = y;
    let prevM = m;
    let prevD = d - 1;
    if (prevD < 1) {
      if (prevM === 1) {
        prevM = 12;
        prevY = y - 1;
      } else {
        prevM = m - 1;
      }
      prevD = getDaysInMonth(prevY, prevM);
    }
    const dateStr = formatCanonicalDate(prevY, prevM, prevD);
    return {
      date: dateStr,
      year: prevY,
      month: prevM,
      day: prevD,
      dayOfWeek: getDayOfWeek(prevY, prevM, prevD)
    };
  }

  /**
   * Determina se uma data civil é um dia útil.
   * No Nível 1, considera segunda a sexta-feira como dias úteis.
   * Possui boundary extensível para contexto/holidayProvider sem acoplamento a I/O.
   *
   * @param {number|string} year - Ano ou string "YYYY-MM-DD"
   * @param {number|string} [month] - Mês
   * @param {number|string} [day] - Dia
   * @param {Object} [context] - Contexto opcional contendo provider de feriados
   * @returns {boolean}
   */
  function isBusinessDay(year, month, day, context) {
    // Normaliza quando primeiro argumento for date string e segundo for context
    let ctx = context;
    if (typeof year === 'string' && isValidCanonicalDateString(year) && typeof month === 'object' && month !== null) {
      ctx = month;
    }

    const parts = extractYearMonthDay(year, month, day);
    if (!parts) return false;
    const { year: y, month: m, day: d } = parts;

    // Extensibilidade futura de calendário de feriados (sem I/O nem chamadas assíncronas)
    if (ctx && typeof ctx === 'object') {
      if (typeof ctx.isBusinessDay === 'function') {
        return Boolean(ctx.isBusinessDay(y, m, d, ctx));
      }
      if (typeof ctx.isHoliday === 'function') {
        const dow = getDayOfWeek(y, m, d);
        if (dow === 0 || dow === 6) return false;
        return !Boolean(ctx.isHoliday(y, m, d, ctx));
      }
    }

    // Nível 1: Segunda (1) a Sexta (5) são úteis. Sábado (6) e Domingo (0) não são úteis.
    const dow = getDayOfWeek(y, m, d);
    return dow >= 1 && dow <= 5;
  }

  /**
   * Navega para o próximo dia útil estritamente subsequente à data informada.
   * @param {number|string} year - Ano ou "YYYY-MM-DD"
   * @param {number|string} [month] - Mês
   * @param {number|string} [day] - Dia
   * @param {Object} [context] - Contexto opcional
   * @returns {{ date: string, year: number, month: number, day: number, dayOfWeek: number } | null}
   */
  function getNextBusinessDay(year, month, day, context) {
    let ctx = context;
    if (typeof year === 'string' && isValidCanonicalDateString(year) && typeof month === 'object' && month !== null) {
      ctx = month;
    }
    let cur = getNextCivilDate(year, month, day);
    if (!cur) return null;
    let safety = 0;
    while (!isBusinessDay(cur.year, cur.month, cur.day, ctx) && safety < 14) {
      cur = getNextCivilDate(cur.year, cur.month, cur.day);
      if (!cur) return null;
      safety++;
    }
    return cur;
  }

  /**
   * Navega para o dia útil imediatamente anterior à data informada.
   * @param {number|string} year - Ano ou "YYYY-MM-DD"
   * @param {number|string} [month] - Mês
   * @param {number|string} [day] - Dia
   * @param {Object} [context] - Contexto opcional
   * @returns {{ date: string, year: number, month: number, day: number, dayOfWeek: number } | null}
   */
  function getPrevBusinessDay(year, month, day, context) {
    let ctx = context;
    if (typeof year === 'string' && isValidCanonicalDateString(year) && typeof month === 'object' && month !== null) {
      ctx = month;
    }
    let cur = getPrevCivilDate(year, month, day);
    if (!cur) return null;
    let safety = 0;
    while (!isBusinessDay(cur.year, cur.month, cur.day, ctx) && safety < 14) {
      cur = getPrevCivilDate(cur.year, cur.month, cur.day);
      if (!cur) return null;
      safety++;
    }
    return cur;
  }

  /**
   * Resolve uma TemporalRule para uma data civil canônica e determinística.
   * Suporta tipos:
   * - "fixed_day": dia nominal no mês, com ajuste opcional de final de semana
   *   ("none" | "previous_business_day" | "next_business_day").
   * - "nth_business_day": enésimo dia útil do mês (ordinal >= 1) ou último dia útil do mês (-1).
   *
   * Comportamento Canônico Cross-Month:
   * A resolução respeita a data civil real calculada. Se um ajuste de fim de semana
   * cruzar a fronteira mensal ou anual, a data resultante DEVE cruzar, mantendo o
   * metadado competenceKept = false (sem clamp artificial à competência solicitada).
   *
   * Falha segura: Retorna null caso a regra, ano, mês ou parâmetros sejam inválidos.
   *
   * @param {Object} rule - Configuração da regra temporal
   * @param {number|string} year - Ano da competência solicitada
   * @param {number|string} month - Mês da competência solicitada (1..12)
   * @param {Object} [context] - Contexto opcional (ex: holiday provider)
   * @returns {Object|null}
   */
  function resolveTemporalRule(rule, year, month, context) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return null;

    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || !Number.isInteger(m) || y < 2000 || y > 2100 || m < 1 || m > 12) {
      return null;
    }

    const type = rule.type;

    // --------------------------------------------------------------------------
    // A. Regra: fixed_day
    // --------------------------------------------------------------------------
    if (type === 'fixed_day') {
      const rawDay = rule.day;
      if (rawDay === undefined || rawDay === null || rawDay === '') return null;
      const numDay = Number(rawDay);
      if (!Number.isInteger(numDay) || numDay < 1 || numDay > 31) return null;

      const adjustment = rule.weekendAdjustment || 'none';
      if (adjustment !== 'none' && adjustment !== 'previous_business_day' && adjustment !== 'next_business_day') {
        return null;
      }

      const clampedDay = clampDayToMonth(y, m, numDay);
      const wasClamped = clampedDay !== numDay;

      let resY = y;
      let resM = m;
      let resD = clampedDay;
      let wasAdjusted = false;

      if (adjustment !== 'none' && !isBusinessDay(y, m, clampedDay, context)) {
        if (adjustment === 'previous_business_day') {
          const prevBiz = getPrevBusinessDay(y, m, clampedDay, context);
          if (prevBiz) {
            resY = prevBiz.year;
            resM = prevBiz.month;
            resD = prevBiz.day;
            wasAdjusted = true;
          }
        } else if (adjustment === 'next_business_day') {
          const nextBiz = getNextBusinessDay(y, m, clampedDay, context);
          if (nextBiz) {
            resY = nextBiz.year;
            resM = nextBiz.month;
            resD = nextBiz.day;
            wasAdjusted = true;
          }
        }
      }

      const competenceKept = (resY === y && resM === m);
      const dayOfWeek = getDayOfWeek(resY, resM, resD);
      const dateStr = formatCanonicalDate(resY, resM, resD);

      return {
        date: dateStr,
        year: resY,
        month: resM,
        day: resD,
        nominalDay: numDay,
        type: 'fixed_day',
        weekendAdjustment: adjustment,
        wasClamped,
        wasAdjusted,
        competenceKept,
        dayOfWeek
      };
    }

    // --------------------------------------------------------------------------
    // B. Regra: nth_business_day
    // --------------------------------------------------------------------------
    if (type === 'nth_business_day') {
      const rawOrdinal = rule.ordinal;
      if (rawOrdinal === undefined || rawOrdinal === null || rawOrdinal === '') return null;
      const numOrdinal = Number(rawOrdinal);
      if (!Number.isInteger(numOrdinal) || (numOrdinal !== -1 && numOrdinal < 1)) return null;

      const maxDays = getDaysInMonth(y, m);
      const bizDays = [];
      for (let d = 1; d <= maxDays; d++) {
        if (isBusinessDay(y, m, d, context)) {
          bizDays.push(d);
        }
      }

      if (bizDays.length === 0) return null;

      let chosenDay;
      if (numOrdinal === -1) {
        chosenDay = bizDays[bizDays.length - 1];
      } else {
        if (numOrdinal > bizDays.length) {
          // Ordinal excede a quantidade de dias úteis existentes no mês
          return null;
        }
        chosenDay = bizDays[numOrdinal - 1];
      }

      const dayOfWeek = getDayOfWeek(y, m, chosenDay);
      const dateStr = formatCanonicalDate(y, m, chosenDay);

      return {
        date: dateStr,
        year: y,
        month: m,
        day: chosenDay,
        nominalDay: chosenDay,
        ordinal: numOrdinal,
        type: 'nth_business_day',
        wasClamped: false,
        wasAdjusted: false,
        competenceKept: true,
        dayOfWeek
      };
    }

    // Tipo de regra desconhecido
    return null;
  }

  return {
    isLeapYear,
    getDaysInMonth,
    clampDayToMonth,
    isValidCanonicalDateString,
    parseCanonicalDate,
    formatCanonicalDate,
    resolveOccurrenceDate,
    getTodayCivilDate,
    normalizeCompetenceKey,
    getPaidHistoryEntry,
    // V2
    getDayOfWeek,
    getNextCivilDate,
    getPrevCivilDate,
    isBusinessDay,
    getNextBusinessDay,
    getPrevBusinessDay,
    resolveTemporalRule
  };
});
