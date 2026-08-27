const path = require('path');
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'financas_pro_secret_key_jwt_2026_super_safe',
  JWT_EXPIRES_IN: '7d',
  DATA_DIR: path.join(__dirname, '..', 'data'),
  USERS_FILE: path.join(__dirname, '..', 'data', 'users.json'),
  PERMISSIONS_FILE: path.join(__dirname, '..', 'data', 'permissions.json'),
  DEFAULT_PERMISSIONS_FILE: path.join(__dirname, '..', 'data', 'default_permissions.json'),
  MAINTENANCE_FILE: path.join(__dirname, '..', 'data', 'maintenance.json'),
  FINANCES_FILE: path.join(__dirname, '..', 'data', 'finances_data.json')
};
