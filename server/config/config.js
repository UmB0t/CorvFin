const path = require('path');
require('dotenv').config();

const ALLOWED_STORAGE_DRIVERS = ['json', 'mongodb'];
const rawStorageDriver = (process.env.STORAGE_DRIVER || 'json').trim().toLowerCase();

if (!ALLOWED_STORAGE_DRIVERS.includes(rawStorageDriver)) {
  throw new Error(
    `[Config Error] STORAGE_DRIVER inválido: "${process.env.STORAGE_DRIVER}". Valores permitidos: ${ALLOWED_STORAGE_DRIVERS.map(d => `'${d}'`).join(', ')}.`
  );
}

module.exports = {
  PORT: process.env.PORT || 3000,
  BASE_PATH: (process.env.BASE_PATH || '').trim().replace(/\/+$/, ''),
  JWT_SECRET: process.env.JWT_SECRET || 'financas_pro_secret_key_jwt_2026_super_safe',
  JWT_EXPIRES_IN: '7d',
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
