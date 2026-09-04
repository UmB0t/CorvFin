const crypto = require('node:crypto');
const config = require('../config/config');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96 bits recomendado para GCM
const HEX_KEY_REGEX = /^[0-9a-fA-F]{64}$/;

/**
 * Resolve a chave de 32 bytes garantindo o formato oficial de 64 caracteres hexadecimais e fail-closed.
 */
function resolveKeyBuffer(customKey) {
  const rawKey = typeof customKey === 'string' ? customKey.trim() : (config.MAIL_CONFIG_ENCRYPTION_KEY || '').trim();

  if (!rawKey) {
    throw new Error('[Security Error] MAIL_CONFIG_ENCRYPTION_KEY não configurada no ambiente.');
  }

  if (!HEX_KEY_REGEX.test(rawKey)) {
    throw new Error(
      '[Security Error] MAIL_CONFIG_ENCRYPTION_KEY inválida: formato oficial exige exatamente 64 caracteres hexadecimais (256 bits gerados via "openssl rand -hex 32").'
    );
  }

  return Buffer.from(rawKey, 'hex');
}

/**
 * Verifica se a chave de criptografia está devidamente configurada no formato oficial de 64 caracteres hexadecimais.
 */
function isEncryptionConfigured(customKey) {
  const rawKey = typeof customKey === 'string' ? customKey.trim() : (config.MAIL_CONFIG_ENCRYPTION_KEY || '').trim();
  return typeof rawKey === 'string' && HEX_KEY_REGEX.test(rawKey);
}

/**
 * Criptografa uma string usando AES-256-GCM.
 * Retorna objeto contendo iv, tag e ciphertext em formato hexadecimal.
 */
function encrypt(plaintext, customKey) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Texto para criptografia inválido ou vazio.');
  }

  const keyBuffer = resolveKeyBuffer(customKey);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertext.toString('hex')
  };
}

/**
 * Descriptografa um objeto { iv, tag, ciphertext } previamente cifrado com AES-256-GCM.
 * Lança erro seguro se houver falha de autenticação (chave errada, tag adulterada ou dado corrompido).
 */
function decrypt(encryptedData, customKey) {
  if (!encryptedData || typeof encryptedData !== 'object') {
    throw new Error('Dados criptografados inválidos.');
  }

  const { iv, tag, ciphertext } = encryptedData;
  if (!iv || !tag || !ciphertext) {
    throw new Error('Estrutura de dados criptografados incompleta.');
  }

  const keyBuffer = resolveKeyBuffer(customKey);

  try {
    const ivBuffer = Buffer.from(iv, 'hex');
    const tagBuffer = Buffer.from(tag, 'hex');
    const ciphertextBuffer = Buffer.from(ciphertext, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, ivBuffer);
    decipher.setAuthTag(tagBuffer);

    const decrypted = Buffer.concat([
      decipher.update(ciphertextBuffer),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error('Falha na autenticação da credencial SMTP (chave incorreta ou dado corrompido).');
  }
}

module.exports = {
  encrypt,
  decrypt,
  isEncryptionConfigured,
  resolveKeyBuffer,
  HEX_KEY_REGEX
};
