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
  FINANCES_FILE: path.join(__dirname, '..', 'data', 'finances_data.json')
};
