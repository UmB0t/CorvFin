/**
 * AI Quota Service — Gestão de Quota Diária Ponderada e Créditos de IA (CorvFin V2 - Lote 5G)
 *
 * Responsabilidades:
 * 1. Resolução do timezone comercial (config.APP_TIMEZONE = America/Fortaleza);
 * 2. Cálculo determinístico de dateKey (YYYY-MM-DD) e resetsAt (meia-noite local);
 * 3. Validação comercial de acesso (assertAccess) e leitura de creditsPerDay (getLimit);
 * 4. Orquestração atômica de reserva ponderada e estorno de créditos;
 * 5. Emissão do erro padronizado machine-readable HTTP 429 (AI_DAILY_QUOTA_REACHED).
 */

'use strict';

const crypto = require('crypto');
const config = require('../config/config');
const entitlementService = require('./entitlementService');
const storageService = require('./storageService');

/**
 * Retorna o identificador de data civil no fuso horário canônico (YYYY-MM-DD).
 */
function getDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const timeZone = config.APP_TIMEZONE || 'America/Fortaleza';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/**
 * Retorna o timestamp ISO da próxima meia-noite civil no fuso canônico (America/Fortaleza = UTC-3).
 */
function getResetsAt(date = new Date()) {
  const todayKey = getDateKey(date);
  const [year, month, day] = todayKey.split('-').map(Number);
  // America/Fortaleza é UTC-3 fixo sem DST -> Meia-noite local equivale a 03:00 UTC do dia seguinte
  const nextMidnightUtc = new Date(Date.UTC(year, month - 1, day + 1, 3, 0, 0, 0));
  return nextMidnightUtc.toISOString();
}

/**
 * Constrói o erro canônico HTTP 429 de quota diária de IA atingida.
 */
class AiDailyQuotaError extends Error {
  constructor({ limit, used, required, remaining, dateKey, resetsAt }) {
    const msg = remaining === 0
      ? `Você atingiu o limite diário de ${limit} créditos de IA para hoje. Seu limite será renovado à meia-noite.`
      : `Você não possui créditos de IA suficientes para esta operação hoje. Créditos necessários: ${required}, restantes: ${remaining}.`;
    super(msg);
    this.name = 'AiDailyQuotaError';
    this.code = 'AI_DAILY_QUOTA_REACHED';
    this.error = 'AI_DAILY_QUOTA_REACHED';
    this.status = 429;
    this.resource = 'ai';
    this.limitKey = 'creditsPerDay';
    this.limit = limit;
    this.used = used;
    this.required = required;
    this.remaining = remaining;
    this.dateKey = dateKey;
    this.resetsAt = resetsAt;
  }
}

/**
 * Valida acesso comercial ao módulo de IA.
 * Bloqueia se ai.enabled === false (HTTP 403 PLAN_ACCESS_DENIED).
 */
async function assertAiAccess(user) {
  return entitlementService.assertAccess(user, 'ai');
}

/**
 * Obtém o limite diário de créditos configurado para o plano do usuário.
 */
async function getAiCreditLimit(user) {
  return entitlementService.getLimit(user, 'ai', 'creditsPerDay');
}

/**
 * Executa a reserva ponderada de créditos antes da chamada ao provedor.
 * Registra a reservation com reservationId único em pendingReservations.
 *
 * @param {Object} params
 * @param {Object} params.user Usuário autenticado
 * @param {string} params.operationType Tipo da operação canônica
 * @param {string} [params.inputMode='text'] Modalidade
 * @param {number} params.credits Quantidade de créditos exigida
 * @returns {Promise<Object>} Resultado da reserva com identificador estruturado para estorno/finalização
 */
async function reserve({ user, operationType, inputMode = 'text', credits = 1 }) {
  // 1. Assegura que o módulo de IA está habilitado no plano (Fail-closed se desativado)
  await assertAiAccess(user);

  const dateKey = getDateKey();
  const resetsAt = getResetsAt();

  // 2. Operações gratuitas (0 créditos): permitidas sem debitar nem consultar teto
  if (credits === 0) {
    return {
      allowed: true,
      credits: 0,
      limit: null,
      used: 0,
      remaining: null,
      dateKey,
      resetsAt,
      reservation: null
    };
  }

  // 3. Resolve o limite comercial de créditos diários do plano
  const limit = await getAiCreditLimit(user);

  // 4. Proteção obrigatória: se a operação exige mais créditos do que o limite total diário do plano
  if (limit !== null && credits > limit) {
    const currentUsage = await storageService.getAiDailyUsage(user.id, dateKey);
    const currentUsed = currentUsage ? (currentUsage.creditsUsed || 0) : 0;
    const remaining = Math.max(0, limit - currentUsed);
    throw new AiDailyQuotaError({
      limit,
      used: currentUsed,
      required: credits,
      remaining,
      dateKey,
      resetsAt
    });
  }

  // 5. Gera identificador único de reserva sem caracteres proibidos no Mongo (UUID RFC4122)
  const reservationId = crypto.randomUUID();

  // 6. Reserva atômica via Storage Abstraction
  const res = await storageService.reserveAiDailyCredits({
    userId: user.id,
    dateKey,
    limit,
    credits,
    operationType,
    reservationId
  });

  if (!res.allowed) {
    throw new AiDailyQuotaError({
      limit,
      used: res.creditsUsed,
      required: credits,
      remaining: res.remaining,
      dateKey,
      resetsAt
    });
  }

  return {
    allowed: true,
    credits,
    limit,
    used: res.creditsUsed,
    remaining: res.remaining,
    dateKey,
    resetsAt,
    reservation: {
      reservationId,
      userId: user.id,
      dateKey,
      credits,
      operationType,
      providerStarted: false
    }
  };
}

/**
 * Registra o início efetivo da chamada externa HTTP ao provedor (n8n/LLM).
 * Incrementa providerCalls exatamente uma vez por tentativa externa.
 *
 * @param {Object} reservation Objeto de reserva retornado por reserve()
 */
async function markProviderStarted(reservation) {
  if (!reservation || !reservation.reservationId) {
    return { success: false, providerCalls: 0 };
  }
  reservation.providerStarted = true;
  return storageService.markAiProviderStarted({
    userId: reservation.userId,
    dateKey: reservation.dateKey,
    reservationId: reservation.reservationId
  });
}

/**
 * Conclui a reserva com sucesso após retorno válido do provedor.
 * Remove a reserva de pendingReservations e incrementa operations.<operationType>.
 * IDEMPOTENTE: chamadas subsequentes com o mesmo reservationId são NO-OP.
 *
 * @param {Object} reservation Objeto de reserva retornado por reserve()
 */
async function finalize(reservation) {
  if (!reservation || !reservation.reservationId) {
    return { success: false, noop: true };
  }
  return storageService.finalizeAiDailyCredits({
    userId: reservation.userId,
    dateKey: reservation.dateKey,
    reservationId: reservation.reservationId,
    operationType: reservation.operationType
  });
}

/**
 * Estorna os créditos debitados em caso de falha antes ou durante a chamada ao provedor.
 * Remove a reserva de pendingReservations e devolve creditsUsed.
 * Se o provedor já havia sido iniciado, contabiliza providerFailures += 1.
 * IDEMPOTENTE: chamadas subsequentes com o mesmo reservationId são NO-OP.
 *
 * @param {Object} reservation Objeto de reserva retornado por reserve()
 * @param {Object} [options={}] Opções de estorno (ex: providerStarted)
 */
async function release(reservation, options = {}) {
  if (!reservation || !reservation.reservationId) {
    return { success: true, noop: true, creditsUsed: 0 };
  }

  let wasFailed;
  if (options.providerFailed !== undefined) {
    wasFailed = Boolean(options.providerFailed);
  } else if (options.providerStarted !== undefined) {
    wasFailed = Boolean(options.providerStarted);
  } else {
    wasFailed = Boolean(reservation.providerStarted);
  }

  return storageService.releaseAiDailyCredits({
    userId: reservation.userId,
    dateKey: reservation.dateKey,
    reservationId: reservation.reservationId,
    credits: reservation.credits,
    operationType: reservation.operationType,
    providerStarted: wasFailed,
    providerFailed: wasFailed
  });
}

module.exports = {
  getDateKey,
  getResetsAt,
  AiDailyQuotaError,
  assertAiAccess,
  getAiCreditLimit,
  reserve,
  finalize,
  release,
  markProviderStarted,
  // Aliases canônicos conforme especificação 5G.1
  reserveAiDailyCredits: reserve,
  finalizeAiDailyCredits: finalize,
  releaseAiDailyCredits: release,
  markAiProviderStarted: markProviderStarted
};
