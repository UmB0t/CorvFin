const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/config');

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, message: 'O e-mail é obrigatório.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { valid: false, message: 'Formato de e-mail inválido. Utilize o formato nome@dominio.com.' };
  }
  return { valid: true };
}

function validatePasswordPolicy(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'A senha é obrigatória.' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'A senha deve conter no mínimo 8 caracteres.' };
  }
  if (password.length > 128) {
    return { valid: false, message: 'A senha não pode exceder 128 caracteres.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'A senha deve conter ao menos uma letra maiúscula.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'A senha deve conter ao menos uma letra minúscula.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'A senha deve conter ao menos um número.' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, message: 'A senha deve conter ao menos um caractere especial (!@#$%...).' };
  }
  return { valid: true };
}

// Alias para retrocompatibilidade
const validateStrongPassword = validatePasswordPolicy;

async function hashPassword(plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
}

async function comparePassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

function generateToken(user) {
  const tokenVersion = typeof user.tokenVersion === 'number' ? user.tokenVersion : 0;
  const payload = {
    userId: user.id,
    tokenVersion
  };
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Gera um token criptográfico de alta entropia (256 bits / 64 caracteres hexadecimais).
 */
function generateSecurityToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Gera o hash SHA-256 do token em hexadecimal para persistência segura no storage.
 */
function hashSecurityToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return '';
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

module.exports = {
  normalizeEmail,
  validateEmail,
  validatePasswordPolicy,
  validateStrongPassword,
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  generateSecurityToken,
  hashSecurityToken
};
