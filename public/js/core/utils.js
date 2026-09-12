window.uid = function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
};

window.mk = function mk(year, month) {
  return Number(year) * 12 + Number(month);
};

window.currency = function currency(val) {
  return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

window.todayYM = function todayYM() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

window.ymKey = function ymKey(y, m) {
  return `${y}-${String(m).padStart(2, '0')}`;
};

window.escapeHtml = function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
};

window.APP_TIMEZONE = (window.__CORVFIN_CONFIG__ && window.__CORVFIN_CONFIG__.APP_TIMEZONE) || 'America/Fortaleza';

window.isLeapYear = function isLeapYear(year) {
  const y = Number(year);
  if (!Number.isInteger(y)) return false;
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
};

window.getDaysInMonth = function getDaysInMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return 0;
  if (m === 2) return window.isLeapYear(y) ? 29 : 28;
  if (m === 4 || m === 6 || m === 9 || m === 11) return 30;
  return 31;
};

window.clampDayToMonth = function clampDayToMonth(year, month, day) {
  const maxDays = window.getDaysInMonth(year, month);
  if (maxDays === 0) return 1;
  const d = Number(day);
  if (!Number.isFinite(d) || d < 1) return 1;
  return Math.min(Math.floor(d), maxDays);
};

window.isValidCanonicalDateString = function isValidCanonicalDateString(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(trimmed);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 2000 || y > 2100) return false;
  const maxDays = window.getDaysInMonth(y, m);
  return d >= 1 && d <= maxDays;
};

window.parseCanonicalDate = function parseCanonicalDate(dateStr) {
  if (!window.isValidCanonicalDateString(dateStr)) return null;
  const [y, m, d] = dateStr.trim().split('-').map(Number);
  return { year: y, month: m, day: d };
};

window.formatCanonicalDate = function formatCanonicalDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

window.resolveOccurrenceDate = function resolveOccurrenceDate(year, month, dueDay) {
  if (dueDay === null || dueDay === undefined || dueDay === '') return null;
  const numDay = Number(dueDay);
  if (!Number.isInteger(numDay) || numDay < 1 || numDay > 31) return null;
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;

  const clampedDay = window.clampDayToMonth(y, m, numDay);
  const isClamped = clampedDay !== numDay;
  return {
    date: window.formatCanonicalDate(y, m, clampedDay),
    year: y,
    month: m,
    day: clampedDay,
    nominalDay: numDay,
    originalDay: numDay,
    wasClamped: isClamped,
    clamped: isClamped
  };
};

window.getTodayCivilDate = function getTodayCivilDate(referenceDate = new Date(), timeZone = window.APP_TIMEZONE) {
  const d = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
};

window.normalizeCompetenceKey = function normalizeCompetenceKey(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || isNaN(y) || isNaN(m) || m < 1 || m > 12) return null;
  return `${y}-${String(m).padStart(2, '0')}`;
};

window.getPaidHistoryEntry = function getPaidHistoryEntry(paidHistory, year, month) {
  if (!paidHistory || typeof paidHistory !== 'object' || Array.isArray(paidHistory)) return undefined;
  const canonicalKey = window.normalizeCompetenceKey(year, month);
  if (paidHistory[canonicalKey] !== undefined) return paidHistory[canonicalKey];
  const legacyKey = `${Number(year)}-${Number(month)}`;
  if (paidHistory[legacyKey] !== undefined) return paidHistory[legacyKey];
  return undefined;
};
