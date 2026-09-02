const path = require('path');
require('dotenv').config();

const ALLOWED_STORAGE_DRIVERS = ['json', 'mongodb'];
const rawStorageDriver = (process.env.STORAGE_DRIVER || 'json').trim().toLowerCase();

if (!ALLOWED_STORAGE_DRIVERS.includes(rawStorageDriver)) {
  throw new Error(
    `[Config Error] STORAGE_DRIVER inválido: "${process.env.STORAGE_DRIVER}". Valores permitidos: ${ALLOWED_STORAGE_DRIVERS.map(d => `'${d}'`).join(', ')}.`
  );
}

const INSECURE_FALLBACK_JWT_SECRET = 'financas_pro_secret_key_jwt_2026_super_safe';

/**
 * Valida JWT_SECRET com comportamento Fail-Closed para produção.
 * Em produção: recusa iniciar se ausente, vazio, padrão fraco ou menor que 32 caracteres.
 * Em desenvolvimento/testes: permite fallback com emissão de warning.
 */
function resolveAndValidateJwtSecret(secret, nodeEnv) {
  const env = (nodeEnv || process.env.NODE_ENV || 'development').trim().toLowerCase();
  const rawSecret = secret !== undefined ? secret : process.env.JWT_SECRET;
  const cleanSecret = typeof rawSecret === 'string' ? rawSecret.trim() : '';

  if (env === 'production') {
    if (!cleanSecret) {
      throw new Error(
        '[Security Config Error] JWT_SECRET obrigatório não configurado para ambiente de produção. O servidor se recusa a iniciar.'
      );
    }
    if (cleanSecret === INSECURE_FALLBACK_JWT_SECRET || cleanSecret.toLowerCase().includes('change_me')) {
      throw new Error(
        '[Security Config Error] JWT_SECRET inseguro/default detectado em produção. O servidor se recusa a iniciar.'
      );
    }
    if (cleanSecret.length < 32) {
      throw new Error(
        `[Security Config Error] JWT_SECRET possui entropia insuficiente (${cleanSecret.length} caracteres). Em produção o secret deve ter no mínimo 32 caracteres.`
      );
    }
    return cleanSecret;
  }

  if (cleanSecret) {
    return cleanSecret;
  }

  console.warn('[SECURITY WARNING] Usando JWT_SECRET padrão de desenvolvimento. Defina um JWT_SECRET seguro antes de publicar em produção.');
  return INSECURE_FALLBACK_JWT_SECRET;
}

const activeJwtSecret = resolveAndValidateJwtSecret();

module.exports = {
  NODE_ENV: (process.env.NODE_ENV || 'development').trim(),
  PORT: process.env.PORT || 3000,
  BASE_PATH: (process.env.BASE_PATH || '').trim().replace(/\/+$/, ''),
  JWT_SECRET: activeJwtSecret,
  JWT_EXPIRES_IN: '7d',
  COOKIE_NAME: 'omnifin_session',
  COOKIE_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 7 dias
  resolveAndValidateJwtSecret,
  INSECURE_FALLBACK_JWT_SECRET,

  // Configurações de Rede, Proxy e CORS
  TRUST_PROXY: process.env.TRUST_PROXY || (process.env.NODE_ENV === 'production' ? '1' : 'loopback'),
  CORS_ALLOWED_ORIGINS: (process.env.CORS_ALLOWED_ORIGINS || '').trim(),

  // Limite de Payload (Padrão conservador de 5MB)
  BODY_LIMIT: (process.env.BODY_LIMIT || '5mb').trim(),

  // Configurações de Rate Limiting
  AUTH_RATE_LIMIT_WINDOW_MS: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || (15 * 60 * 1000), // 15 min
  AUTH_RATE_LIMIT_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 15,
  AI_RATE_LIMIT_WINDOW_MS: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 10) || (60 * 1000), // 1 min
  AI_RATE_LIMIT_MAX: parseInt(process.env.AI_RATE_LIMIT_MAX, 10) || (process.env.NODE_ENV === 'production' ? 30 : 200),
  API_RATE_LIMIT_WINDOW_MS: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS, 10) || (15 * 60 * 1000), // 15 min
  API_RATE_LIMIT_MAX: parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 300,

  STORAGE_DRIVER: rawStorageDriver,
  MONGODB_URI: process.env.MONGODB_URI || '',
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || 'financas_pro',
  DATA_DIR: path.join(__dirname, '..', 'data'),
  USERS_FILE: path.join(__dirname, '..', 'data', 'users.json'),
  PERMISSIONS_FILE: path.join(__dirname, '..', 'data', 'permissions.json'),
  DEFAULT_PERMISSIONS_FILE: path.join(__dirname, '..', 'data', 'default_permissions.json'),
  MAINTENANCE_FILE: path.join(__dirname, '..', 'data', 'maintenance.json'),
  FINANCES_FILE: path.join(__dirname, '..', 'data', 'finances_data.json'),
  AI_PROPOSALS_FILE: path.join(__dirname, '..', 'data', 'ai_proposals.json'),
  AI_PENDING_ACTIONS_FILE: path.join(__dirname, '..', 'data', 'ai_pending_actions.json'),
  AI_PENDING_ACTION_TTL_MS: parseInt(process.env.AI_PENDING_ACTION_TTL_MS, 10) || (30 * 60 * 1000), // 30 minutos
  // n8n AI Agent Integration (Conversational Read-Only - Basic Auth)
  N8N_AI_WEBHOOK_URL: (process.env.N8N_AI_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL || process.env.N8N_AI_URL || '').trim(),
  N8N_AI_BASIC_AUTH_USER: (process.env.N8N_AI_BASIC_AUTH_USER || process.env.N8N_BASIC_AUTH_USER || process.env.N8N_AUTH_USER || process.env.N8N_USER || '').trim(),
  N8N_AI_BASIC_AUTH_PASSWORD: (process.env.N8N_AI_BASIC_AUTH_PASSWORD || process.env.N8N_BASIC_AUTH_PASSWORD || process.env.N8N_AUTH_PASSWORD || process.env.N8N_AI_BASIC_AUTH_PASS || process.env.N8N_BASIC_AUTH_PASS || process.env.N8N_PASSWORD || '').trim(),
  AI_REQUEST_TIMEOUT_MS: parseInt(process.env.AI_REQUEST_TIMEOUT_MS, 10) || 30000,
  // n8n AI Actions Webhook Integration (Controlled Transactional Actions - Basic Auth)
  N8N_AI_ACTION_WEBHOOK_URL: (process.env.N8N_AI_ACTION_WEBHOOK_URL || process.env.N8N_ACTION_WEBHOOK_URL || process.env.N8N_AI_ACTION_URL || '').trim(),
  N8N_AI_ACTION_BASIC_AUTH_USER: (process.env.N8N_AI_ACTION_BASIC_AUTH_USER || process.env.N8N_ACTION_BASIC_AUTH_USER || process.env.N8N_AI_BASIC_AUTH_USER || process.env.N8N_BASIC_AUTH_USER || '').trim(),
  N8N_AI_ACTION_BASIC_AUTH_PASSWORD: (process.env.N8N_AI_ACTION_BASIC_AUTH_PASSWORD || process.env.N8N_ACTION_BASIC_AUTH_PASSWORD || process.env.N8N_AI_BASIC_AUTH_PASSWORD || process.env.N8N_BASIC_AUTH_PASSWORD || '').trim(),
  AI_ACTION_REQUEST_TIMEOUT_MS: parseInt(process.env.AI_ACTION_REQUEST_TIMEOUT_MS || process.env.AI_REQUEST_TIMEOUT_MS, 10) || 30000
};
