/**
 * CorvFin V2 — Media Upload Middleware (Lote 5G-M.1)
 *
 * Responsabilidades:
 * 1. Parser condicional para multipart/form-data em memória (multer.memoryStorage);
 * 2. Limite rígido de 5MB e máximo de 1 arquivo por requisição;
 * 3. Validação de MIME types permitidos para áudio e imagem;
 * 4. Validação de magic bytes (file signatures) para mitigação de MIME spoofing;
 * 5. Zero escrita em disco e zero persistência de mídia.
 */

'use strict';

const multer = require('multer');

// Limite máximo de arquivo: 5MB
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// MIME types permitidos para Áudio
const ALLOWED_AUDIO_MIMES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/m4a',
  'audio/aac',
  'audio/x-m4a'
];

// MIME types permitidos para Imagem
const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

const ALL_ALLOWED_MIMES = [...ALLOWED_IMAGE_MIMES, ...ALLOWED_AUDIO_MIMES];

/**
 * Normaliza o MIME type removendo parâmetros opcionais (ex: audio/webm;codecs=opus -> audio/webm).
 */
function getBaseMimeType(mime) {
  if (!mime || typeof mime !== 'string') return '';
  return mime.split(';')[0].trim().toLowerCase();
}

/**
 * Validação de Magic Bytes (Assinaturas Binárias)
 */
function checkMagicBytes(buffer, mimeType) {
  if (!buffer || buffer.length < 4) return false;

  const baseMime = getBaseMimeType(mimeType);

  // JPEG: FF D8 FF
  if (baseMime === 'image/jpeg') {
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (baseMime === 'image/png') {
    if (buffer.length < 8) return false;
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 && // P
      buffer[2] === 0x4E && // N
      buffer[3] === 0x47 && // G
      buffer[4] === 0x0D &&
      buffer[5] === 0x0A &&
      buffer[6] === 0x1A &&
      buffer[7] === 0x0A
    );
  }

  // WebP: RIFF (bytes 0-3) e WEBP (bytes 8-11)
  if (baseMime === 'image/webp') {
    if (buffer.length < 12) return false;
    const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    return isRiff && isWebp;
  }

  // WebM / Matroska: 1A 45 DF A3
  if (baseMime === 'audio/webm') {
    return buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;
  }

  // OGG: 4F 67 67 53 ("OggS")
  if (baseMime === 'audio/ogg') {
    return buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53;
  }

  // MP4 / M4A / AAC: bytes 4-7 igual a "ftyp" (66 74 79 70) OU ADTS sync (FF F1 / FF F9)
  if (baseMime === 'audio/mp4' || baseMime === 'audio/m4a' || baseMime === 'audio/aac' || baseMime === 'audio/x-m4a') {
    if (buffer.length >= 8) {
      const isFtyp = buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70;
      if (isFtyp) return true;
    }
    // ADTS AAC
    if ((buffer[0] === 0xFF && (buffer[1] & 0xF0) === 0xF0)) {
      return true;
    }
    return false;
  }

  // MP3: ID3 tag (49 44 33) ou Frame Sync (FF FB / FF F3 / FF F2 / FF E3)
  if (baseMime === 'audio/mpeg') {
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
      return true; // ID3v2
    }
    if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
      return true; // MPEG Audio Frame Header
    }
    return false;
  }

  return false;
}

/**
 * Validação técnica profunda do arquivo antes de quota ou chamada ao provedor.
 *
 * @param {Object} file Objeto req.file do multer
 * @param {'audio' | 'image'} expectedMode Modalidade esperada
 * @returns {{ valid: boolean, code?: string, message?: string, baseMime?: string }}
 */
function validateMediaFile(file, expectedMode) {
  if (!file) {
    return {
      valid: false,
      code: 'AI_MEDIA_REQUIRED',
      message: 'Nenhum arquivo de mídia foi enviado para a interpretação multimodal.'
    };
  }

  if (!file.buffer || file.buffer.length === 0 || file.size === 0) {
    return {
      valid: false,
      code: 'AI_MEDIA_EMPTY',
      message: 'O arquivo enviado está vazio (0 bytes).'
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES || file.buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      code: 'AI_MEDIA_TOO_LARGE',
      message: 'O arquivo enviado excede o limite máximo permitido de 5MB.'
    };
  }

  const baseMime = getBaseMimeType(file.mimetype);

  if (expectedMode === 'image') {
    if (!ALLOWED_IMAGE_MIMES.includes(baseMime)) {
      return {
        valid: false,
        code: 'AI_MEDIA_TYPE_UNSUPPORTED',
        message: `Formato de imagem "${baseMime || 'desconhecido'}" não suportado. Formatos aceitos: JPEG, PNG e WebP.`
      };
    }
  } else if (expectedMode === 'audio') {
    if (!ALLOWED_AUDIO_MIMES.includes(baseMime)) {
      return {
        valid: false,
        code: 'AI_MEDIA_TYPE_UNSUPPORTED',
        message: `Formato de áudio "${baseMime || 'desconhecido'}" não suportado. Formatos aceitos: WebM, OGG, MP4/AAC e MP3.`
      };
    }
  } else {
    if (!ALL_ALLOWED_MIMES.includes(baseMime)) {
      return {
        valid: false,
        code: 'AI_MEDIA_TYPE_UNSUPPORTED',
        message: `Formato de arquivo "${baseMime || 'desconhecido'}" não suportado.`
      };
    }
  }

  // Verificação de Magic Bytes
  const magicValid = checkMagicBytes(file.buffer, baseMime);
  if (!magicValid) {
    return {
      valid: false,
      code: 'AI_MEDIA_TYPE_UNSUPPORTED',
      message: `O conteúdo do arquivo não corresponde ao formato declarado (${baseMime}).`
    };
  }

  return {
    valid: true,
    baseMime
  };
}

// Configuração do Multer com memoryStorage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Permite qualquer campo com name='data' (ou fallback 'file') e valida MIME básico
    const baseMime = getBaseMimeType(file.mimetype);
    if (!ALL_ALLOWED_MIMES.includes(baseMime)) {
      const err = new Error(`Formato de mídia "${baseMime}" não suportado.`);
      err.code = 'AI_MEDIA_TYPE_UNSUPPORTED';
      return cb(err);
    }
    cb(null, true);
  }
});

/**
 * Middleware condicional para upload de mídia.
 * Aplica upload.single('data') somente quando a requisição for multipart/form-data.
 * Requisições application/json seguem sem interferência.
 */
function conditionalMediaUpload(req, res, next) {
  const isMultipart = Boolean(req.is && req.is('multipart/form-data'));

  if (!isMultipart) {
    return next();
  }

  // O campo congelado de upload é 'data'
  const uploadHandler = upload.single('data');

  uploadHandler(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'AI_MEDIA_TOO_LARGE',
          code: 'AI_MEDIA_TOO_LARGE',
          message: 'O arquivo enviado excede o limite máximo permitido de 5MB.'
        });
      }
      if (err.code === 'AI_MEDIA_TYPE_UNSUPPORTED') {
        return res.status(400).json({
          success: false,
          error: 'AI_MEDIA_TYPE_UNSUPPORTED',
          code: 'AI_MEDIA_TYPE_UNSUPPORTED',
          message: err.message || 'Formato de mídia não suportado.'
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
          success: false,
          error: 'AI_MEDIA_REQUIRED',
          code: 'AI_MEDIA_REQUIRED',
          message: 'Campo de arquivo inesperado. O arquivo deve ser enviado no campo "data".'
        });
      }
      return res.status(400).json({
        success: false,
        error: err.code || 'AI_MEDIA_UPLOAD_ERROR',
        code: err.code || 'AI_MEDIA_UPLOAD_ERROR',
        message: err.message || 'Falha ao processar arquivo de mídia.'
      });
    }
    next();
  });
}

module.exports = {
  conditionalMediaUpload,
  validateMediaFile,
  checkMagicBytes,
  getBaseMimeType,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_AUDIO_MIMES,
  ALLOWED_IMAGE_MIMES
};
