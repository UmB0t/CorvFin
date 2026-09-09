/**
 * CorvFin V2 — Suíte de Testes do Lote 5G-M.1: Backend Multimodal (Áudio / Imagem / Multipart / n8n)
 *
 * Cobertura Obrigatória (30 Casos - Seção 23 do Prompt):
 * 1. text JSON continua funcionando
 * 2. multipart audio válido
 * 3. multipart image JPEG válido
 * 4. multipart PNG válido
 * 5. multipart WebP válido
 * 6. arquivo ausente
 * 7. arquivo vazio
 * 8. arquivo >5MB
 * 9. MIME inválido
 * 10. MIME spoof em imagem
 * 11. invalid context JSON
 * 12. audio custa 2 créditos
 * 13. image custa 3 créditos
 * 14. quota insuficiente audio
 * 15. quota insuficiente image
 * 16. unlimited audio
 * 17. unlimited image
 * 18. provider timeout audio -> refund 2
 * 19. provider timeout image -> refund 3
 * 20. provider contract invalid -> refund
 * 21. local persistence error -> refund sem providerFailure
 * 22. success -> finalize
 * 23. providerCalls somente após fetch
 * 24. mídia não aparece em ai_usage_daily
 * 25. mídia não aparece em pendingAction
 * 26. mídia não aparece em proposal
 * 27. binary field despachado ao n8n chama-se data
 * 28. authenticatedUserId usado no n8n vem de req.user, não do cliente
 * 29. text continua custando 1
 * 30. confirm continua custando 0
 * 31. multipart context={month:9,year:2026} permite acesso semântico a month===9 e year===2026
 * 32. multipart com escalares month=9 e year=2026 resolve competência e despacha ao n8n
 */

'use strict';

const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const config = require('../server/config/config');
const app = require('../server/server');
const storageService = require('../server/services/storageService');
const jsonStorage = require('../server/services/jsonStorage');
const aiQuotaService = require('../server/services/aiQuotaService');
const entitlementService = require('../server/services/entitlementService');
const { getCompatibilityEntitlements } = require('../server/config/entitlementRegistry');
const { generateToken } = require('../server/services/authService');
const { closeDB } = require('../server/config/db');

// Diretório isolado para testes com JSON storage
const TEST_DATA_DIR = path.resolve(__dirname, '..', 'data', 'test_multimodal_data');
config.DATA_DIR = TEST_DATA_DIR;
config.STORAGE_DRIVER = 'json';
config.AI_USAGE_DAILY_FILE = path.join(TEST_DATA_DIR, 'ai_usage_daily.json');
config.PLANS_FILE = path.join(TEST_DATA_DIR, 'plans.json');
config.USERS_FILE = path.join(TEST_DATA_DIR, 'users.json');
config.FINANCES_FILE = path.join(TEST_DATA_DIR, 'finances_data.json');
config.AI_PROPOSALS_FILE = path.join(TEST_DATA_DIR, 'ai_proposals.json');
config.AI_PENDING_ACTIONS_FILE = path.join(TEST_DATA_DIR, 'ai_pending_actions.json');
config.PERMISSIONS_FILE = path.join(TEST_DATA_DIR, 'permissions.json');
config.DEFAULT_PERMISSIONS_FILE = path.join(TEST_DATA_DIR, 'default_permissions.json');
config.MAINTENANCE_FILE = path.join(TEST_DATA_DIR, 'maintenance.json');

// Buffers de teste com assinaturas válidas (Magic Bytes)
const VALID_JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
const VALID_PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
const VALID_WEBP = Buffer.concat([
  Buffer.from([0x52, 0x49, 0x46, 0x46]), // 'RIFF'
  Buffer.alloc(4),
  Buffer.from([0x57, 0x45, 0x42, 0x50]), // 'WEBP'
  Buffer.alloc(8)
]);
const VALID_WEBM_AUDIO = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81, 0x01, 0x42]);
const VALID_MP4_AUDIO = Buffer.concat([
  Buffer.alloc(4),
  Buffer.from([0x66, 0x74, 0x79, 0x70]), // 'ftyp'
  Buffer.alloc(8)
]);
const SPOOFED_JPEG = Buffer.from('ESTE_NAO_E_UM_JPEG_VALIDO_HEADER_TEXTO');
const EMPTY_BUFFER = Buffer.alloc(0);
const OVERSIZED_BUFFER = Buffer.alloc(5 * 1024 * 1024 + 1024); // 5MB + 1KB

describe('Lote 5G-M.1 — Backend Multimodal (Áudio / Imagem / Multipart / n8n)', { concurrency: 1 }, () => {
  let corvfinServer;
  let corvfinUrl;
  let n8nMockServer;
  let n8nMockUrl;

  // Estado capturado pelo mock n8n a cada chamada
  let lastN8nRequest = null;
  let mockN8nHandler = null;

  // Usuário de teste
  const testUser = {
    id: 'usr_multimodal_tester',
    nome: 'Tester Multimodal',
    email: 'multimodal@corvfin.com.br',
    login: 'multimodal_tester',
    role: 'user',
    planId: 'plan_pro_tester'
  };
  let authToken;

  function resetTestDataDir() {
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
    const fullEntitlements = getCompatibilityEntitlements();
    fullEntitlements.ai = { enabled: true, limits: { creditsPerDay: 20 } };

    try {
      fs.writeFileSync(config.AI_USAGE_DAILY_FILE, '{}', 'utf8');
      fs.writeFileSync(config.PLANS_FILE, JSON.stringify([{
        id: testUser.planId,
        slug: 'pro-tester',
        name: 'Plano Pro Tester',
        status: 'active',
        isDefault: true,
        entitlements: fullEntitlements
      }]), 'utf8');
      fs.writeFileSync(config.USERS_FILE, JSON.stringify([testUser]), 'utf8');
    } catch (_) {}
  }

  before(async () => {
    resetTestDataDir();

    authToken = generateToken({
      id: testUser.id,
      nome: testUser.nome,
      email: testUser.email,
      login: testUser.login,
      role: testUser.role
    });

    // 1. Inicia Mock Server do n8n em porta efêmera
    await new Promise((resolve) => {
      const mockMulter = multer({ storage: multer.memoryStorage() }).single('data');

      n8nMockServer = http.createServer((req, res) => {
        const isMultipart = Boolean(req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data'));

        if (isMultipart) {
          mockMulter(req, res, (err) => {
            lastN8nRequest = {
              method: req.method,
              headers: req.headers,
              body: req.body,
              file: req.file,
              isMultipart: true
            };
            if (mockN8nHandler) {
              return mockN8nHandler(req, res, lastN8nRequest);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([{
              success: true,
              action: 'create_expense',
              requiresConfirmation: true,
              requiresReview: false,
              source: req.body.type || 'image',
              data: {
                description: 'ALMOÇO EXECUTIVO',
                merchant: 'Restaurante Central',
                amount: 45.5,
                category: 'Alimentação',
                destination: 'Pix',
                date: '2026-09-08',
                competence: { month: 9, year: 2026 },
                installments: 1
              },
              confidence: { description: 0.95, amount: 0.99 },
              warnings: []
            }]));
          });
        } else {
          // JSON request
          let rawData = '';
          req.on('data', (chunk) => { rawData += chunk; });
          req.on('end', () => {
            let jsonBody = {};
            try { jsonBody = JSON.parse(rawData); } catch (_) {}
            lastN8nRequest = {
              method: req.method,
              headers: req.headers,
              body: jsonBody,
              file: null,
              isMultipart: false
            };
            if (mockN8nHandler) {
              return mockN8nHandler(req, res, lastN8nRequest);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([{
              success: true,
              action: 'create_expense',
              requiresConfirmation: true,
              requiresReview: false,
              source: 'text',
              data: {
                description: 'ALMOÇO EXECUTIVO',
                amount: 35.0,
                category: 'Alimentação',
                destination: 'Pix',
                date: '2026-09-08',
                competence: { month: 9, year: 2026 },
                installments: 1
              },
              confidence: { description: 0.9, amount: 0.9 },
              warnings: []
            }]));
          });
        }
      }).listen(0, () => {
        const port = n8nMockServer.address().port;
        n8nMockUrl = `http://127.0.0.1:${port}/webhook/corvfin-actions`;
        config.N8N_AI_ACTION_WEBHOOK_URL = n8nMockUrl;
        config.N8N_AI_ACTION_BASIC_AUTH_USER = 'test_user';
        config.N8N_AI_ACTION_BASIC_AUTH_PASSWORD = 'test_password';
        resolve();
      });
    });

    // 2. Inicia Servidor CorvFin em porta efêmera
    await new Promise((resolve) => {
      corvfinServer = http.createServer(app).listen(0, () => {
        const port = corvfinServer.address().port;
        corvfinUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Mock das categorias do usuário para convergência com Expense Domain
    const currentFin = await storageService.getUserFinances(testUser.id, testUser.nome);
    await storageService.saveUserFinances(testUser.id, {
      ...currentFin,
      revision: currentFin.revision,
      expectedRevision: currentFin.revision,
      categories: ['Alimentação', 'Transporte', 'Moradia', 'Lazer'],
      destinations: ['Pix', 'Dinheiro', 'Cartão Nubank']
    }, testUser.nome);
  });

  after(async () => {
    if (corvfinServer) {
      corvfinServer.closeAllConnections?.();
      await new Promise(r => corvfinServer.close(r));
    }
    if (n8nMockServer) {
      n8nMockServer.closeAllConnections?.();
      await new Promise(r => n8nMockServer.close(r));
    }
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    try { await closeDB(); } catch (_) {}
  });

  beforeEach(() => {
    lastN8nRequest = null;
    mockN8nHandler = null;
    resetTestDataDir();

    // Mock de quota padrão: 20 créditos por dia
    entitlementService.getLimit = async () => 20;
    entitlementService.assertAccess = async () => true;
  });

  // --------------------------------------------------------------------------
  // TESTE 1: text JSON continua funcionando
  // --------------------------------------------------------------------------
  test('1. text JSON continua funcionando (100% preservado)', async () => {
    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        message: 'Almoço 35 no pix',
        inputMode: 'text'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_expense');
    assert.ok(data.proposalId);
    assert.equal(lastN8nRequest.isMultipart, false);
    assert.equal(lastN8nRequest.body.type, 'text');
  });

  // --------------------------------------------------------------------------
  // TESTE 1b: text JSON sem message é rejeitado com 400
  // --------------------------------------------------------------------------
  test('1b. text JSON sem message é rejeitado com 400', async () => {
    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        inputMode: 'text'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.success, false);
    assert.equal(data.message, 'A mensagem do usuário é obrigatória para gerar uma proposta de lançamento.');
  });

  // --------------------------------------------------------------------------
  // TESTE 2: multipart audio válido (com message opcional)
  // --------------------------------------------------------------------------
  test('2. multipart audio válido (WebM com message opcional)', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([VALID_WEBM_AUDIO], { type: 'audio/webm' }), 'recording.webm');
    formData.append('inputMode', 'audio');
    formData.append('message', 'Comprovante em áudio');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_expense');
    assert.equal(lastN8nRequest.isMultipart, true);
    assert.equal(lastN8nRequest.body.type, 'audio');
    assert.ok(lastN8nRequest.file);
    assert.equal(lastN8nRequest.file.fieldname, 'data');
    assert.equal(lastN8nRequest.body.message, 'Comprovante em áudio');
  });

  // --------------------------------------------------------------------------
  // TESTE 2b: multipart audio válido com message AUSENTE (reprodução real 5G-M.2.1)
  // --------------------------------------------------------------------------
  test('2b. multipart audio válido (WebM) com message AUSENTE (reprodução real 5G-M.2.1)', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([VALID_WEBM_AUDIO], { type: 'audio/webm' }), 'recording.webm');
    formData.append('inputMode', 'audio');
    // message estritamente ausente/omitida

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.notEqual(data.message, 'A mensagem do usuário é obrigatória para gerar uma proposta de lançamento.');
    assert.equal(data.action, 'create_expense');
    assert.equal(lastN8nRequest.isMultipart, true);
    assert.equal(lastN8nRequest.body.type, 'audio');
    assert.ok(lastN8nRequest.file);
    assert.equal(lastN8nRequest.file.fieldname, 'data');
    assert.equal(lastN8nRequest.body.message, undefined);
  });

  // --------------------------------------------------------------------------
  // TESTE 3: multipart image JPEG válido (message ausente)
  // --------------------------------------------------------------------------
  test('3. multipart image JPEG válido (message ausente)', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'cupom.jpg');
    formData.append('inputMode', 'image');
    // message estritamente ausente/omitida

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_expense');
    assert.equal(lastN8nRequest.isMultipart, true);
    assert.equal(lastN8nRequest.body.type, 'image');
    assert.equal(lastN8nRequest.file.fieldname, 'data');
    assert.equal(lastN8nRequest.body.message, undefined);
  });

  // --------------------------------------------------------------------------
  // TESTE 4: multipart PNG válido
  // --------------------------------------------------------------------------
  test('4. multipart PNG válido', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([VALID_PNG], { type: 'image/png' }), 'nota.png');
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_expense');
  });

  // --------------------------------------------------------------------------
  // TESTE 5: multipart WebP válido
  // --------------------------------------------------------------------------
  test('5. multipart WebP válido', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([VALID_WEBP], { type: 'image/webp' }), 'comprovante.webp');
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_expense');
  });

  // --------------------------------------------------------------------------
  // TESTE 6: arquivo ausente
  // --------------------------------------------------------------------------
  test('6. arquivo ausente -> 400 AI_MEDIA_REQUIRED', async () => {
    const formData = new FormData();
    formData.append('inputMode', 'image');
    formData.append('message', 'Tentei enviar sem anexo');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.code, 'AI_MEDIA_REQUIRED');
    assert.equal(lastN8nRequest, null, 'Zero chamada ao provedor quando arquivo ausente');
  });

  // --------------------------------------------------------------------------
  // TESTE 7: arquivo vazio
  // --------------------------------------------------------------------------
  test('7. arquivo vazio (0 bytes) -> 400 AI_MEDIA_EMPTY', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([EMPTY_BUFFER], { type: 'image/jpeg' }), 'empty.jpg');
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.code, 'AI_MEDIA_EMPTY');
    assert.equal(lastN8nRequest, null, 'Zero chamada ao provedor');
  });

  // --------------------------------------------------------------------------
  // TESTE 8: arquivo > 5MB
  // --------------------------------------------------------------------------
  test('8. arquivo > 5MB -> 413 AI_MEDIA_TOO_LARGE', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([OVERSIZED_BUFFER], { type: 'image/jpeg' }), 'large.jpg');
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 413);
    assert.equal(data.code, 'AI_MEDIA_TOO_LARGE');
    assert.equal(lastN8nRequest, null, 'Zero chamada ao provedor quando excede tamanho');
  });

  // --------------------------------------------------------------------------
  // TESTE 9: MIME inválido
  // --------------------------------------------------------------------------
  test('9. MIME inválido -> 400 AI_MEDIA_TYPE_UNSUPPORTED', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([Buffer.from('%PDF-1.4 file content')], { type: 'application/pdf' }), 'doc.pdf');
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.code, 'AI_MEDIA_TYPE_UNSUPPORTED');
    assert.equal(lastN8nRequest, null, 'Zero chamada ao provedor');
  });

  // --------------------------------------------------------------------------
  // TESTE 10: MIME spoof em imagem
  // --------------------------------------------------------------------------
  test('10. MIME spoof em imagem (mimetype=image/jpeg sem magic bytes) -> 400 AI_MEDIA_TYPE_UNSUPPORTED', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([SPOOFED_JPEG], { type: 'image/jpeg' }), 'fake.jpg');
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.code, 'AI_MEDIA_TYPE_UNSUPPORTED');
    assert.equal(lastN8nRequest, null, 'Zero chamada ao provedor sob MIME spoofing');
  });

  // --------------------------------------------------------------------------
  // TESTE 11: invalid context JSON
  // --------------------------------------------------------------------------
  test('11. invalid context JSON -> 400 INVALID_AI_CONTEXT', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'recibo.jpg');
    formData.append('inputMode', 'image');
    formData.append('context', '{invalid_json_format');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.code, 'INVALID_AI_CONTEXT');
    assert.equal(lastN8nRequest, null, 'Zero reserva e zero chamada ao provider quando context é inválido');
  });

  // --------------------------------------------------------------------------
  // TESTE 12: audio custa 2 créditos
  // --------------------------------------------------------------------------
  test('12. audio custa 2 créditos', async () => {
    const dateKey = aiQuotaService.getDateKey();

    const formData = new FormData();
    formData.append('data', new Blob([VALID_WEBM_AUDIO], { type: 'audio/webm' }), 'rec.webm');
    formData.append('inputMode', 'audio');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });
    assert.equal(res.status, 200);

    const usage = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
    assert.equal(usage.creditsUsed, 2, 'Áudio deve consumir exatamente 2 créditos');
  });

  // --------------------------------------------------------------------------
  // TESTE 13: image custa 3 créditos
  // --------------------------------------------------------------------------
  test('13. image custa 3 créditos', async () => {
    const dateKey = aiQuotaService.getDateKey();

    const formData = new FormData();
    formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'cupom.jpg');
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });
    assert.equal(res.status, 200);

    const usage = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
    assert.equal(usage.creditsUsed, 3, 'Imagem deve consumir exatamente 3 créditos');
  });

  // --------------------------------------------------------------------------
  // TESTE 14: quota insuficiente audio
  // --------------------------------------------------------------------------
  test('14. quota insuficiente audio (1 restante, áudio exige 2) -> 429 sem provider call', async () => {
    // Mock de limite: apenas 1 crédito disponível
    entitlementService.getLimit = async () => 1;

    const formData = new FormData();
    formData.append('data', new Blob([VALID_WEBM_AUDIO], { type: 'audio/webm' }), 'rec.webm');
    formData.append('inputMode', 'audio');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 429);
    assert.equal(data.code, 'AI_DAILY_QUOTA_REACHED');
    assert.equal(data.required, 2);
    assert.equal(lastN8nRequest, null, 'Zero provider call quando quota é insuficiente');
  });

  // --------------------------------------------------------------------------
  // TESTE 15: quota insuficiente image
  // --------------------------------------------------------------------------
  test('15. quota insuficiente image (2 restantes, imagem exige 3) -> 429 sem provider call', async () => {
    // Mock de limite: apenas 2 créditos disponíveis
    entitlementService.getLimit = async () => 2;

    const formData = new FormData();
    formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'img.jpg');
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 429);
    assert.equal(data.code, 'AI_DAILY_QUOTA_REACHED');
    assert.equal(data.required, 3);
    assert.equal(lastN8nRequest, null, 'Zero provider call quando quota é insuficiente');
  });

  // --------------------------------------------------------------------------
  // TESTE 16: unlimited audio
  // --------------------------------------------------------------------------
  test('16. unlimited audio -> sucesso e registro de telemetria', async () => {
    entitlementService.getLimit = async () => null; // null = unlimited

    const formData = new FormData();
    formData.append('data', new Blob([VALID_WEBM_AUDIO], { type: 'audio/webm' }), 'rec.webm');
    formData.append('inputMode', 'audio');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });
    assert.equal(res.status, 200);

    const dateKey = aiQuotaService.getDateKey();
    const usage = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
    assert.equal(usage.creditsUsed, 2);
    assert.equal(usage.providerCalls, 1);
  });

  // --------------------------------------------------------------------------
  // TESTE 17: unlimited image
  // --------------------------------------------------------------------------
  test('17. unlimited image -> sucesso e registro de telemetria', async () => {
    entitlementService.getLimit = async () => null;

    const formData = new FormData();
    formData.append('data', new Blob([VALID_PNG], { type: 'image/png' }), 'doc.png');
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });
    assert.equal(res.status, 200);

    const dateKey = aiQuotaService.getDateKey();
    const usage = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
    assert.equal(usage.creditsUsed, 3);
    assert.equal(usage.providerCalls, 1);
  });

  // --------------------------------------------------------------------------
  // TESTE 18: provider timeout audio -> refund 2
  // --------------------------------------------------------------------------
  test('18. provider timeout audio -> refund 2 créditos e providerFailures + 1', async () => {
    const origTimeout = config.AI_ACTION_REQUEST_TIMEOUT_MS;
    config.AI_ACTION_REQUEST_TIMEOUT_MS = 200; // Timeout de 200ms para teste

    // Mock n8n atrasa a resposta propositalmente
    mockN8nHandler = (req, res) => {
      setTimeout(() => {
        if (!res.headersSent) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([{ success: true }]));
        }
      }, 500);
    };

    try {
      const formData = new FormData();
      formData.append('data', new Blob([VALID_WEBM_AUDIO], { type: 'audio/webm' }), 'rec.webm');
      formData.append('inputMode', 'audio');

      const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData
      });

      assert.equal(res.status, 504);

      const dateKey = aiQuotaService.getDateKey();
      const usage = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
      assert.equal(usage.creditsUsed, 0, '2 créditos de áudio devem ser estornados');
      assert.equal(usage.providerCalls, 1);
      assert.equal(usage.providerFailures, 1);
    } finally {
      config.AI_ACTION_REQUEST_TIMEOUT_MS = origTimeout;
    }
  });

  // --------------------------------------------------------------------------
  // TESTE 19: provider timeout image -> refund 3
  // --------------------------------------------------------------------------
  test('19. provider timeout image -> refund 3 créditos e providerFailures + 1', async () => {
    const origTimeout = config.AI_ACTION_REQUEST_TIMEOUT_MS;
    config.AI_ACTION_REQUEST_TIMEOUT_MS = 200;

    mockN8nHandler = (req, res) => {
      setTimeout(() => {
        if (!res.headersSent) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([{ success: true }]));
        }
      }, 500);
    };

    try {
      const formData = new FormData();
      formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'img.jpg');
      formData.append('inputMode', 'image');

      const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData
      });

      assert.equal(res.status, 504);

      const dateKey = aiQuotaService.getDateKey();
      const usage = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
      assert.equal(usage.creditsUsed, 0, '3 créditos de imagem devem ser estornados');
      assert.equal(usage.providerCalls, 1);
      assert.equal(usage.providerFailures, 1);
    } finally {
      config.AI_ACTION_REQUEST_TIMEOUT_MS = origTimeout;
    }
  });

  // --------------------------------------------------------------------------
  // TESTE 20: provider contract invalid -> refund
  // --------------------------------------------------------------------------
  test('20. provider contract invalid -> refund de créditos e providerFailures + 1', async () => {
    // Provedor responde HTTP 200 mas com corpo inválido sem action/data
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ unexpected: 'structure_without_contract' }]));
    };

    const formData = new FormData();
    formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'img.jpg');
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    assert.equal(res.status, 502);

    const dateKey = aiQuotaService.getDateKey();
    const usage = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
    assert.equal(usage.creditsUsed, 0, 'Créditos devem ser estornados');
    assert.equal(usage.providerCalls, 1);
    assert.equal(usage.providerFailures, 1);
  });

  // --------------------------------------------------------------------------
  // TESTE 21: local persistence error -> refund sem providerFailure
  // --------------------------------------------------------------------------
  test('21. local persistence error -> refund SEM incrementar providerFailure', async () => {
    // Simula erro no saveAiProposal após o provider ter respondido com contrato 100% válido
    const origSave = storageService.saveAiProposal;
    storageService.saveAiProposal = async () => {
      throw new Error('Falha simulada de banco local ao gravar proposta');
    };

    try {
      const formData = new FormData();
      formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'img.jpg');
      formData.append('inputMode', 'image');

      const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData
      });

      assert.equal(res.status, 500);

      const dateKey = aiQuotaService.getDateKey();
      const usage = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
      assert.equal(usage.creditsUsed, 0, 'Créditos estornados ao usuário');
      assert.equal(usage.providerCalls, 1, 'Provider foi chamado');
      assert.equal(usage.providerFailures, 0, 'Provider respondeu certo, logo providerFailures NÃO incrementa');
    } finally {
      storageService.saveAiProposal = origSave;
    }
  });

  // --------------------------------------------------------------------------
  // TESTE 22: success -> finalize
  // --------------------------------------------------------------------------
  test('22. success -> finalize (reserva limpa e operations incrementado)', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'img.jpg');
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    assert.equal(res.status, 200);

    const dateKey = aiQuotaService.getDateKey();
    const usage = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
    assert.equal(usage.creditsUsed, 3);
    assert.equal(usage.operations.expense_interpretation, 1);
    assert.equal(Object.keys(usage.pendingReservations || {}).length, 0, 'pendingReservations deve estar vazio após finalize');
  });

  // --------------------------------------------------------------------------
  // TESTE 23: providerCalls somente após fetch
  // --------------------------------------------------------------------------
  test('23. providerCalls somente após fetch (erros preliminares não contam providerCalls)', async () => {
    // Envia arquivo sem data -> erro 400 AI_MEDIA_REQUIRED
    const formData = new FormData();
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });
    assert.equal(res.status, 400);

    const dateKey = aiQuotaService.getDateKey();
    const usage = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
    assert.equal(usage ? usage.providerCalls : 0, 0, 'Zero providerCalls quando erro ocorre antes do fetch');
  });

  // --------------------------------------------------------------------------
  // TESTE 24: mídia não aparece em ai_usage_daily
  // --------------------------------------------------------------------------
  test('24. mídia não aparece em ai_usage_daily', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'cupom.jpg');
    formData.append('inputMode', 'image');

    await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const dateKey = aiQuotaService.getDateKey();
    const usage = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
    const serialized = JSON.stringify(usage);

    assert.equal(serialized.includes('Buffer'), false);
    assert.equal(serialized.includes('base64'), false);
    assert.equal(serialized.includes('JFIF'), false);
    assert.equal(serialized.includes('VALID_JPEG'), false);
  });

  // --------------------------------------------------------------------------
  // TESTE 25: mídia não aparece em pendingAction
  // --------------------------------------------------------------------------
  test('25. mídia não aparece em pendingAction', async () => {
    // Força o mock a retornar dados incompletos (sem destino) para gerar continue_collection
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_expense',
        requiresConfirmation: true,
        requiresReview: false,
        source: 'audio',
        data: {
          description: 'GASOLINA',
          amount: 150,
          category: 'Transporte',
          destination: null // falta destino!
        }
      }]));
    };

    const convId = 'conv_multimodal_multi_turn_25';
    const formData = new FormData();
    formData.append('data', new Blob([VALID_WEBM_AUDIO], { type: 'audio/webm' }), 'audio.webm');
    formData.append('inputMode', 'audio');
    formData.append('conversationId', convId);

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.action, 'continue_collection');

    const pending = await storageService.getAiPendingAction(testUser.id, convId);
    assert.ok(pending);
    assert.equal(pending.source, 'audio');

    const serialized = JSON.stringify(pending);
    assert.equal(serialized.includes('buffer'), false);
    assert.equal(serialized.includes('base64'), false);
  });

  // --------------------------------------------------------------------------
  // TESTE 26: mídia não aparece em proposal
  // --------------------------------------------------------------------------
  test('26. mídia não aparece em proposal', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'cupom.jpg');
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.proposalId);

    const proposal = await storageService.getAiProposal(data.proposalId);
    assert.ok(proposal);
    assert.equal(proposal.source, 'image');

    const serialized = JSON.stringify(proposal);
    assert.equal(serialized.includes('buffer'), false);
    assert.equal(serialized.includes('base64'), false);
  });

  // --------------------------------------------------------------------------
  // TESTE 27: binary field despachado ao n8n chama-se data
  // --------------------------------------------------------------------------
  test('27. binary field despachado ao n8n chama-se "data"', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'cupom.jpg');
    formData.append('inputMode', 'image');

    await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    assert.ok(lastN8nRequest);
    assert.ok(lastN8nRequest.file, 'Arquivo deve ter sido recebido pelo n8n mock');
    assert.equal(lastN8nRequest.file.fieldname, 'data', 'Nome do campo binário deve ser estritamente "data"');
  });

  // --------------------------------------------------------------------------
  // TESTE 28: authenticatedUserId usado no n8n vem de req.user, não do cliente
  // --------------------------------------------------------------------------
  test('28. authenticatedUserId no n8n é derivado de req.user.id, ignorando spoof do cliente', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'cupom.jpg');
    formData.append('inputMode', 'image');
    formData.append('authenticatedUserId', 'hacker_user_999'); // Tentativa de spoofing

    await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    assert.ok(lastN8nRequest);
    assert.equal(
      lastN8nRequest.body.authenticatedUserId,
      testUser.id,
      'authenticatedUserId enviado ao n8n DEVE ser req.user.id e NUNCA o do cliente'
    );
  });

  // --------------------------------------------------------------------------
  // TESTE 29: text continua custando 1
  // --------------------------------------------------------------------------
  test('29. text continua custando 1 crédito', async () => {
    const dateKey = aiQuotaService.getDateKey();

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        message: 'Farmácia 80 no cartão',
        inputMode: 'text'
      })
    });
    assert.equal(res.status, 200);

    const usage = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
    assert.equal(usage.creditsUsed, 1, 'Texto consome exatamente 1 crédito');
  });

  // --------------------------------------------------------------------------
  // TESTE 30: confirm continua custando 0
  // --------------------------------------------------------------------------
  test('30. confirm continua custando 0 créditos', async () => {
    // 1. Gera proposta a partir de imagem (consome 3 créditos)
    const formData = new FormData();
    formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'cupom.jpg');
    formData.append('inputMode', 'image');

    const resInterpret = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });
    const interpretData = await resInterpret.json();
    assert.equal(resInterpret.status, 200);
    const proposalId = interpretData.proposalId;

    const dateKey = aiQuotaService.getDateKey();
    const usageBeforeConfirm = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
    assert.equal(usageBeforeConfirm.creditsUsed, 3);

    // 2. Confirma a proposta (POST /api/ai/actions/expense/confirm)
    const resConfirm = await fetch(`${corvfinUrl}/api/ai/actions/expense/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        proposalId,
        data: interpretData.data
      })
    });

    const confirmData = await resConfirm.json();
    assert.equal(resConfirm.status, 200);
    assert.equal(confirmData.success, true);
    assert.ok(confirmData.expense);

    // 3. Verifica que créditos continuam exatamente 3 (confirmação consome 0)
    const usageAfterConfirm = await jsonStorage.getAiDailyUsage(testUser.id, dateKey);
    assert.equal(usageAfterConfirm.creditsUsed, 3, 'Confirmar proposta custa 0 créditos adicionais');
  });

  // --------------------------------------------------------------------------
  // TESTE 31: multipart image com context={month:9,year:2026}
  // Prova semântica: payload recebido pelo contrato equivalente ao n8n permite
  // acessar context.month === 9 e context.year === 2026
  // --------------------------------------------------------------------------
  test('31. multipart context={month:9,year:2026} permite acesso semântico a month===9 e year===2026', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'cupom_context.jpg');
    formData.append('inputMode', 'image');
    formData.append('context', JSON.stringify({ month: 9, year: 2026 }));

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.ok(lastN8nRequest, 'n8n mock deve ter recebido a requisição');
    assert.equal(lastN8nRequest.isMultipart, true);
    assert.equal(lastN8nRequest.body.type, 'image');

    // 1. Prova que context textual enviado é parseável e expõe month e year
    assert.ok(lastN8nRequest.body.context, 'body.context deve estar presente');
    const parsedContext = typeof lastN8nRequest.body.context === 'string'
      ? JSON.parse(lastN8nRequest.body.context)
      : lastN8nRequest.body.context;
    assert.equal(parsedContext.month, 9, 'context.month deve ser semanticamente 9');
    assert.equal(parsedContext.year, 2026, 'context.year deve ser semanticamente 2026');

    // 2. Prova que campos escalares month e year também foram despachados no multipart
    assert.equal(lastN8nRequest.body.month, '9', 'body.month escalar deve ser "9"');
    assert.equal(lastN8nRequest.body.year, '2026', 'body.year escalar deve ser "2026"');

    // 3. Prova que a lógica do normalizador do n8n resolve a competência corretamente
    function validMonth(v) {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
    }
    function validYear(v) {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1900 && n <= 2200 ? n : null;
    }

    let reqContext = lastN8nRequest.body.context;
    if (typeof reqContext === 'string') {
      try { reqContext = JSON.parse(reqContext); } catch { reqContext = null; }
    }
    const resolvedMonth = validMonth(reqContext?.month ?? lastN8nRequest.body.month);
    const resolvedYear = validYear(reqContext?.year ?? lastN8nRequest.body.year);

    assert.equal(resolvedMonth, 9, 'Normalizador n8n resolve month===9');
    assert.equal(resolvedYear, 2026, 'Normalizador n8n resolve year===2026');
  });

  // --------------------------------------------------------------------------
  // TESTE 32: multipart image com campos escalares month=9, year=2026
  // Prova que server.js aceita escalares no multipart e repassa ao n8n
  // --------------------------------------------------------------------------
  test('32. multipart com escalares month=9 e year=2026 resolve competência e despacha ao n8n', async () => {
    const formData = new FormData();
    formData.append('data', new Blob([VALID_PNG], { type: 'image/png' }), 'recibo_escalar.png');
    formData.append('inputMode', 'image');
    formData.append('month', '9');
    formData.append('year', '2026');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.ok(lastN8nRequest, 'n8n mock deve ter recebido a requisição');

    const parsedContext = typeof lastN8nRequest.body.context === 'string'
      ? JSON.parse(lastN8nRequest.body.context)
      : lastN8nRequest.body.context;
    assert.equal(parsedContext.month, 9);
    assert.equal(parsedContext.year, 2026);
    assert.equal(lastN8nRequest.body.month, '9');
    assert.equal(lastN8nRequest.body.year, '2026');
  });

  // --------------------------------------------------------------------------
  // TESTE 33: Caso Real 5G-M.2.2 — Áudio "fardo de Heineken por 10 reais no Pix"
  // n8n devolve destination: null e notes: "pago no Pix"
  // Esperado: NÃO perguntar "E pagou como?", gerar proposta com pix e persistir pago
  // --------------------------------------------------------------------------
  test('33. Caso Real 5G-M.2.2: Áudio no Pix com destination: null e notes: "pago no Pix"', async () => {
    mockN8nHandler = (req, res, lastReq) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_expense',
        requiresConfirmation: true,
        requiresReview: false,
        source: 'audio',
        data: {
          description: 'FARDO DE HEINEKEN',
          amount: 10,
          category: 'Alimentação',
          destination: null,
          date: '2026-09-08',
          competence: { month: 9, year: 2026 },
          installments: 1,
          notes: 'pago no Pix'
        },
        confidence: { description: 0.95, amount: 0.99 },
        warnings: []
      }]));
    };

    const formData = new FormData();
    formData.append('data', new Blob([VALID_WEBM_AUDIO], { type: 'audio/webm' }), 'heineken.webm');
    formData.append('inputMode', 'audio');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_expense', 'Deve gerar create_expense diretamente sem cair em continue_collection');
    assert.ok(data.proposalId, 'Deve gerar proposalId');
    assert.notEqual(data.answer, 'E pagou como?', 'NÃO deve perguntar "E pagou como?"');

    // Validações semânticas da proposta
    assert.equal(data.data.amount, 10);
    assert.equal(data.data.payment?.method, 'pix', 'payment.method deve ser pix');
    assert.equal(data.data.destination, 'Pix', 'destination legado deve ser Pix');

    // Confirmação e persistência
    const confirmRes = await fetch(`${corvfinUrl}/api/ai/actions/expense/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ proposalId: data.proposalId })
    });

    const confirmData = await confirmRes.json();
    assert.equal(confirmRes.status, 200);
    assert.equal(confirmData.success, true);
    assert.equal(confirmData.expense.payment?.method, 'pix');
    assert.equal(confirmData.expense.destination, 'Pix');
    assert.equal(confirmData.expense.status, 'pago', 'Pix deve quitar despesa como pago');
  });

  // --------------------------------------------------------------------------
  // TESTE 34: Caso Real — "paguei em dinheiro" com destination: null e notes: "pago em dinheiro"
  // Esperado: payment.method = dinheiro, destination = Dinheiro, sem pergunta extra
  // --------------------------------------------------------------------------
  test('34. Caso Real: Áudio em dinheiro com destination: null e notes: "pago em dinheiro"', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_expense',
        requiresConfirmation: true,
        requiresReview: false,
        source: 'audio',
        data: {
          description: 'PÃO DE QUEIJO',
          amount: 8,
          category: 'Alimentação',
          destination: null,
          date: '2026-09-08',
          competence: { month: 9, year: 2026 },
          installments: 1,
          notes: 'pago em dinheiro'
        },
        confidence: { description: 0.95, amount: 0.99 },
        warnings: []
      }]));
    };

    const formData = new FormData();
    formData.append('data', new Blob([VALID_WEBM_AUDIO], { type: 'audio/webm' }), 'lanche.webm');
    formData.append('inputMode', 'audio');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_expense');
    assert.equal(data.data.payment?.method, 'dinheiro');
    assert.equal(data.data.destination, 'Dinheiro');
    assert.notEqual(data.answer, 'E pagou como?');
  });

  // --------------------------------------------------------------------------
  // TESTE 35: Caso Real — "paguei no cartão de crédito"
  // Esperado: payment.method = cartao_credito, sem pergunta extra
  // --------------------------------------------------------------------------
  test('35. Caso Real: Imagem no crédito com destination: null e notes: "cartão de crédito"', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_expense',
        requiresConfirmation: true,
        requiresReview: false,
        source: 'image',
        data: {
          description: 'LIVRO TECNICO',
          amount: 120,
          category: 'Educação',
          destination: null,
          date: '2026-09-08',
          competence: { month: 9, year: 2026 },
          installments: 1,
          notes: 'comprovante cartão de crédito'
        },
        confidence: { description: 0.95, amount: 0.99 },
        warnings: []
      }]));
    };

    const formData = new FormData();
    formData.append('data', new Blob([VALID_JPEG], { type: 'image/jpeg' }), 'cupom.jpg');
    formData.append('inputMode', 'image');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_expense');
    assert.equal(data.data.payment?.method, 'cartao_credito');
    assert.notEqual(data.answer, 'E pagou como?');
  });

  // --------------------------------------------------------------------------
  // TESTE 36: Caso Real — "paguei no débito"
  // Esperado: payment.method = cartao_debito, sem pergunta extra
  // --------------------------------------------------------------------------
  test('36. Caso Real: Áudio no débito com destination: null e paymentMethod: "cartao_debito"', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_expense',
        requiresConfirmation: true,
        requiresReview: false,
        source: 'audio',
        data: {
          description: 'FARMACIA REMEDIOS',
          amount: 55,
          category: 'Saúde',
          destination: null,
          paymentMethod: 'cartao_debito',
          date: '2026-09-08',
          competence: { month: 9, year: 2026 },
          installments: 1,
          notes: 'remédios'
        },
        confidence: { description: 0.95, amount: 0.99 },
        warnings: []
      }]));
    };

    const formData = new FormData();
    formData.append('data', new Blob([VALID_WEBM_AUDIO], { type: 'audio/webm' }), 'farmacia.webm');
    formData.append('inputMode', 'audio');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_expense');
    assert.equal(data.data.payment?.method, 'cartao_debito');
    assert.notEqual(data.answer, 'E pagou como?');
  });

  // --------------------------------------------------------------------------
  // TESTE 37: Sem método informado -> continua perguntando "E pagou como?"
  // Esperado: action = continue_collection, missingFields = ['destination'], answer = 'E pagou como?'
  // --------------------------------------------------------------------------
  test('37. Sem método informado: destination ausente deve perguntar "E pagou como?"', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_expense',
        requiresConfirmation: true,
        requiresReview: false,
        source: 'audio',
        data: {
          description: 'COMPRA SEM METODO',
          amount: 50,
          category: 'Alimentação',
          destination: null,
          paymentMethod: null,
          date: '2026-09-08',
          competence: { month: 9, year: 2026 },
          installments: 1,
          notes: null
        },
        confidence: { description: 0.95, amount: 0.99 },
        warnings: []
      }]));
    };

    const formData = new FormData();
    formData.append('data', new Blob([VALID_WEBM_AUDIO], { type: 'audio/webm' }), 'sem_metodo.webm');
    formData.append('inputMode', 'audio');
    formData.append('conversationId', 'conv_multimodal_sem_metodo_37');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'continue_collection', 'Deve entrar em continue_collection');
    assert.ok(data.missingFields.includes('destination'), 'missingFields deve conter destination');
    assert.equal(data.answer, 'E pagou como?', 'Deve perguntar "E pagou como?"');
  });

  test('38. multipart com benefício é aceito e processado com sucesso (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_benefit',
        requiresConfirmation: true,
        requiresReview: false,
        source: 'audio',
        data: {
          description: 'ALMOÇO VR RESTAURANTE',
          amount: 35.0,
          benefitType: 'vr',
          day: 8,
          competence: { month: 9, year: 2026 }
        },
        warnings: []
      }]));
    };

    const formData = new FormData();
    formData.append('data', new Blob([VALID_WEBM_AUDIO], { type: 'audio/webm' }), 'audio_beneficio.webm');
    formData.append('inputMode', 'audio');
    formData.append('targetModule', 'beneficios');
    formData.append('conversationId', 'conv_beneficio_multimodal_accept');

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_benefit');
    assert.ok(data.proposalId);
    assert.equal(data.data.benefitType, 'vr');
  });

  // --------------------------------------------------------------------------
  // LOTE 5G-M.2.4: TESTES EXPLÍCITOS DE SEMÂNTICA DESPESA VS BENEFÍCIO
  // --------------------------------------------------------------------------

  test('39. "Uber de 10 reais no vale transporte" => create_benefit / transporte (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        data: {}
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Uber de 10 reais no vale transporte',
        conversationId: 'conv_uber_vt_39'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_benefit');
    assert.equal(data.data.benefitType, 'transporte');
    assert.equal(data.data.amount, 10);
  });

  test('40. "Gastei 35 no almoço usando VA" => create_benefit / va (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        data: {}
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Gastei 35 no almoço usando VA',
        conversationId: 'conv_almoco_va_40'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_benefit');
    assert.equal(data.data.benefitType, 'va');
    assert.equal(data.data.amount, 35);
  });

  test('41. "Comprei almoço no VR" => create_benefit / vr (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        data: {}
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Comprei almoço no VR',
        conversationId: 'conv_almoco_vr_41'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'continue_collection');
    assert.equal(data.intent, 'create_benefit');
    assert.equal(data.slots.benefitType, 'vr');
  });

  test('42. "Gastei 35 no almoço e paguei no Pix" => create_expense (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        data: {}
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Gastei 35 no almoço e paguei no Pix',
        conversationId: 'conv_almoco_pix_42'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_expense');
    assert.equal(data.data.amount, 35);
    assert.equal(data.data.payment?.method, 'pix');
  });

  test('43. "Comprei por 200 no cartão de crédito" => create_expense (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        data: {}
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Comprei por 200 no cartão de crédito',
        conversationId: 'conv_compra_cartao_43'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_expense');
    assert.equal(data.data.amount, 200);
    assert.equal(data.data.payment?.method, 'cartao_credito');
  });

  test('44. "Tenho VA, mas paguei o almoço no Pix" => create_expense (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        data: {}
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Tenho VA, mas paguei o almoço no Pix',
        conversationId: 'conv_va_pix_44'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'continue_collection');
    assert.equal(data.intent, 'create_expense');
    assert.equal(data.slots.destination, 'Pix');
  });

  test('45. Caso ambíguo "almoço 35 vr pix" não produz decisão silenciosa insegura (requiresReview = true com warning) (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        data: {}
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'almoço 35 vr pix',
        conversationId: 'conv_ambiguo_45'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.requiresReview, true, 'Deve exigir revisão humana no caso ambíguo');
    assert.ok(data.warnings.some(w => /ambiguidade/i.test(w)), 'Deve conter warning explícito de ambiguidade');
  });

  test('46. Suporte a contexto multipart: objeto, string JSON e fallback escalar sem quebrar em JSON inválido (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_expense',
        data: {
          description: 'TESTE CONTEXTO',
          amount: 50,
          category: 'Outros',
          paymentMethod: 'pix'
        }
      }]));
    };

    // Caso A: context como objeto
    const resA = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Almoço 50 no Pix',
        conversationId: 'conv_ctx_obj_46a',
        context: { month: 11, year: 2026 }
      })
    });
    const dataA = await resA.json();
    assert.equal(resA.status, 200);
    assert.equal(dataA.data.competence.month, 11);

    // Caso B: context como JSON string
    const resB = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Almoço 50 no Pix',
        conversationId: 'conv_ctx_str_46b',
        context: JSON.stringify({ month: 12, year: 2026 })
      })
    });
    const dataB = await resB.json();
    assert.equal(resB.status, 200);
    assert.equal(dataB.data.competence.month, 12);

    // Caso C: context como JSON inválido com escalares month/year de fallback -> NÃO QUEBRA (200 OK)
    const formData = new FormData();
    formData.append('data', new Blob([VALID_WEBM_AUDIO], { type: 'audio/webm' }), 'audio_invalid_ctx.webm');
    formData.append('inputMode', 'audio');
    formData.append('conversationId', 'conv_ctx_fallback_46c');
    formData.append('context', '{ invalid_json_here: ');
    formData.append('month', '10');
    formData.append('year', '2026');

    const resC = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });
    const dataC = await resC.json();
    assert.equal(resC.status, 200);
    assert.equal(dataC.success, true);
    assert.equal(dataC.data.competence.month, 10);
  });

  test('47. Ação explícita válida do provedor é soberana sobre benefitTypeHint (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_expense',
        data: {
          description: 'ALMOÇO EXECUTIVO',
          amount: 45,
          category: 'Alimentação',
          paymentMethod: 'pix',
          benefitTypeHint: 'vr'
        }
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Almoço executivo 45 reais no Pix',
        conversationId: 'conv_action_sovereign_47'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'create_expense', 'Action explícita válida create_expense deve prevalecer sobre benefitTypeHint');
  });

  // --------------------------------------------------------------------------
  // LOTE 5G-M.2.4 — AJUSTES CONTRATUAIS N8N
  // --------------------------------------------------------------------------

  test('48. Validação contratual dos 3 prompts n8n (TEXTO, ÁUDIO, IMAGEM): padronização de day, date, requiresReview e warnings sem depender de context.month/year (Lote 5G-M.2.4)', () => {
    const { TEXT_PROMPT, AUDIO_PROMPT, IMAGE_PROMPT, NORMALIZER_CODE } = require('../server/config/n8nContracts');

    const prompts = [
      { name: 'TEXTO', text: TEXT_PROMPT },
      { name: 'ÁUDIO', text: AUDIO_PROMPT },
      { name: 'IMAGEM', text: IMAGE_PROMPT }
    ];

    for (const p of prompts) {
      assert.ok(p.text.includes('"day": null'), `${p.name} deve conter "day": null no contrato`);
      assert.ok(p.text.includes('"date": null'), `${p.name} deve conter "date": null no contrato`);
      assert.ok(p.text.includes('"requiresReview": false'), `${p.name} deve conter "requiresReview": false no contrato`);
      assert.ok(p.text.includes('"warnings": []'), `${p.name} deve conter "warnings": [] no contrato`);
      assert.ok(p.text.includes('{{ $json.body.month }}'), `${p.name} deve usar preferencialmente {{ $json.body.month }}`);
      assert.ok(p.text.includes('{{ $json.body.year }}'), `${p.name} deve usar preferencialmente {{ $json.body.year }}`);
      assert.ok(!p.text.includes('$json.body.context?.month'), `${p.name} NÃO deve depender de $json.body.context?.month`);
      assert.ok(!p.text.includes('$json.body.context?.year'), `${p.name} NÃO deve depender de $json.body.context?.year`);
      assert.ok(!p.text.includes('$json.body.context.month'), `${p.name} NÃO deve depender de $json.body.context.month`);
      assert.ok(!p.text.includes('$json.body.context.year'), `${p.name} NÃO deve depender de $json.body.context.year`);
    }

    // Validações essenciais do NORMALIZER_CODE
    assert.ok(NORMALIZER_CODE.includes('validDay('), 'NORMALIZER deve padronizar day');
    assert.ok(NORMALIZER_CODE.includes('canonicalAccount'), 'NORMALIZER deve canonicalizar payment.account');
    assert.ok(NORMALIZER_CODE.includes('ai?.requiresReview === true'), 'NORMALIZER deve incorporar requiresReview');
    assert.ok(NORMALIZER_CODE.includes('localRequiresReview'), 'NORMALIZER deve manter soberania da validação local');
  });

  test('49. Canonicalização de payment.account rejeita conta inexistente/inventada pelo provider e não a torna destino canônico (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_expense',
        data: {
          description: 'ALMOÇO DE DOMINGO',
          amount: 75,
          category: 'Alimentação',
          payment: {
            method: 'cartao_credito',
            account: 'Banco Fantasma Inventado'
          }
        }
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Almoço 75',
        conversationId: 'conv_canonical_acc_49'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.data.payment.account, null, 'Conta inventada/não cadastrada deve ser rejeitada como null');
    assert.notEqual(data.data.destination, 'Banco Fantasma Inventado', 'Conta inexistente não pode virar destino');
    assert.equal(data.data.destination, 'Cartão', 'Destino deve cair no fallback canônico do método');
  });

  test('50. Ambiguidade estruturada: provider com requiresReview=true e warnings propaga para o card de proposta (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_expense',
        requiresReview: true,
        warnings: ['Ambiguidade detectada entre benefício corporativo e pagamento convencional.'],
        data: {
          description: 'ALMOÇO EXECUTIVO',
          amount: 35,
          category: 'Alimentação',
          payment: {
            method: 'pix',
            account: null
          }
        }
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Almoço executivo 35 no pix',
        conversationId: 'conv_ambiguity_prop_50'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.requiresReview, true, 'Deve propagar requiresReview=true retornado pelo provider');
    assert.ok(data.warnings.some(w => /ambiguidade/i.test(w)), 'Deve conter warning de ambiguidade retornado pelo provider');
  });

  test('51. Soberania da validação local: provider com requiresReview=false NÃO sobrescreve revisão exigida localmente (categoria ausente) (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_expense',
        requiresReview: false,
        warnings: [],
        data: {
          description: 'COMPRA SEM CATEGORIA VÁLIDA',
          amount: 120,
          category: 'Categoria Inexistente No Perfil',
          payment: {
            method: 'pix',
            account: null
          }
        }
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Compra genérica 120 no pix',
        conversationId: 'conv_local_sovereignty_51'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.requiresReview, true, 'Validação local é soberana: categoria não identificada exige revisão humana mesmo se provider disse false');
    assert.ok(data.warnings.some(w => /categoria/i.test(w)), 'Deve conter warning de categoria não encontrada');
  });

  const { NORMALIZER_CODE } = require('../server/config/n8nContracts');
  const vm = require('vm');

  function runNormalizer(geminiJson, contextBody = { type: 'text', month: 9, year: 2026 }, allowedCategories = ['Alimentação', 'Transporte'], allowedDestinations = ['Nubank', 'Itaú', 'Dinheiro', 'Pix']) {
    const sandbox = {
      $: () => ({
        first: () => ({
          json: {
            body: contextBody,
            allowedCategories,
            allowedDestinations
          }
        })
      }),
      $json: geminiJson
    };

    const script = new vm.Script(`(function() {\n${NORMALIZER_CODE}\n})()`);
    const context = vm.createContext(sandbox);
    return script.runInContext(context);
  }

  test('52. Teste isolado do NORMALIZA E VALIDA LANÇAMENTO com suporte a escalares, JSON string, conta canônica e soberania local (Lote 5G-M.2.4)', () => {
    // Caso A: month/year escalares em body e conta inexistente rejeitada
    const resA = runNormalizer(
      {
        action: 'create_expense',
        description: 'Almoço Teste',
        amount: 50,
        categoryHint: 'Alimentação',
        payment: { method: 'cartao_credito', account: 'Banco Inexistente' },
        day: 15,
        requiresReview: false,
        warnings: []
      },
      { type: 'text', month: 11, year: 2026 }
    );
    assert.equal(resA[0].json.success, true);
    assert.equal(resA[0].json.data.competence.month, 11);
    assert.equal(resA[0].json.data.competence.year, 2026);
    assert.equal(resA[0].json.data.payment.account, null, 'Conta inexistente deve ser null');
    assert.ok(resA[0].json.warnings.some(w => w.includes('não existe entre as contas')), 'Deve gerar warning para conta inexistente');

    // Caso B: context como JSON string
    const resB = runNormalizer(
      {
        action: 'create_expense',
        description: 'Almoço Teste B',
        amount: 30,
        categoryHint: 'Alimentação',
        day: 10
      },
      { type: 'text', context: JSON.stringify({ month: 8, year: 2026 }) }
    );
    assert.equal(resB[0].json.data.competence.month, 8);
    assert.equal(resB[0].json.data.competence.year, 2026);

    // Caso C: Soberania local: categoria ausente força requiresReview=true mesmo se provider disse requiresReview=false
    const resC = runNormalizer(
      {
        action: 'create_expense',
        description: 'Almoço Teste C',
        amount: 40,
        categoryHint: 'Categoria Desconhecida',
        day: 5,
        requiresReview: false,
        warnings: []
      },
      { type: 'text', month: 5, year: 2026 }
    );
    assert.equal(resC[0].json.requiresReview, true, 'Soberania local deve forçar requiresReview=true quando categoria não é encontrada');

    // Caso D: Benefício com day ausente na entrada é aceito sem erro e sem requiresReview
    const resD = runNormalizer(
      {
        action: 'create_benefit',
        description: 'Almoço VR',
        amount: 25,
        benefitTypeHint: 'vr',
        day: null
      },
      { type: 'text', month: 9, year: 2026 }
    );
    assert.equal(resD[0].json.action, 'create_benefit');
    assert.equal(resD[0].json.data.day, null);
    assert.equal(resD[0].json.data.benefitType, 'vr');
    assert.equal(resD[0].json.requiresReview, false, 'Benefício sem day NÃO deve exigir revisão no normalizador');

    // Caso E: Despesa com payment.method=pix e destination=null é válida (requiresReview=false)
    const resE = runNormalizer(
      {
        action: 'create_expense',
        description: 'Café Pix',
        amount: 10,
        categoryHint: 'Alimentação',
        payment: { method: 'pix', account: null },
        destinationHint: null
      },
      { type: 'text', month: 9, year: 2026 }
    );
    assert.equal(resE[0].json.requiresReview, false, 'Despesa com método Pix e destino null deve ser válida');

    // Caso F: Despesa sem payment.method e sem destination exige revisão (requiresReview=true)
    const resF = runNormalizer(
      {
        action: 'create_expense',
        description: 'Café Sem Pagamento',
        amount: 10,
        categoryHint: 'Alimentação',
        payment: { method: null, account: null },
        destinationHint: null
      },
      { type: 'text', month: 9, year: 2026 }
    );
    assert.equal(resF[0].json.requiresReview, true, 'Despesa sem método e sem destino deve exigir revisão');
    assert.ok(resF[0].json.warnings.some(w => /pagamento|destino/i.test(w)), 'Deve conter warning de pagamento ausente');

    // Caso G: benefitType inventado (combustivel) fail-closed
    const resG = runNormalizer(
      {
        action: 'create_benefit',
        description: 'Posto',
        amount: 100,
        benefitTypeHint: 'combustivel'
      },
      { type: 'text', month: 9, year: 2026 }
    );
    assert.equal(resG[0].json.data.benefitType, null, 'benefitType inventado deve virar null');
    assert.equal(resG[0].json.requiresReview, true, 'benefitType inventado deve exigir revisão');
    assert.ok(resG[0].json.warnings.some(w => /combustivel/i.test(w)), 'Deve conter warning sobre combustivel inválido');
  });

  test('53. Benefício sem day na entrada é aceito sem requiresReview e é confirmável com fallback canônico (Lote 5G-M.2.4)', async () => {
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_benefit',
        requiresReview: false,
        warnings: [],
        data: {
          description: 'ALMOÇO VR SEM DIA',
          amount: 32,
          benefitTypeHint: 'vr',
          day: null,
          date: null
        }
      }]));
    };

    const resInterp = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Almoço 32 no VR',
        conversationId: 'conv_benefit_no_day_53'
      })
    });

    const interpData = await resInterp.json();
    assert.equal(resInterp.status, 200);
    assert.equal(interpData.success, true);
    assert.equal(interpData.action, 'create_benefit');
    assert.equal(interpData.requiresReview, false, 'Benefício sem day não deve exigir revisão');
    assert.ok(!interpData.warnings.some(w => /dia/i.test(w)), 'Não deve conter warning por ausência de day');

    // Confirmação sem day no payload de edição -> deve confirmar com sucesso e usar fallback canônico
    const resConfirm = await fetch(`${corvfinUrl}/api/ai/actions/benefit/confirm`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposalId: interpData.proposalId,
        data: {}
      })
    });

    const confirmData = await resConfirm.json();
    assert.equal(resConfirm.status, 200);
    assert.equal(confirmData.success, true);
    assert.ok(Number.isInteger(confirmData.benefit?.day) && confirmData.benefit.day >= 1 && confirmData.benefit.day <= 31, 'Deve preencher day com fallback canônico');
  });

  test('54. Despesa com payment.method="pix" e destination=null é válida (requiresReview=false) (Lote 5G-M.2.4)', async () => {
    // 1. Normalizador n8n
    const normResult = runNormalizer({
      action: 'create_expense',
      description: 'CAFÉ NO PIX',
      amount: 8,
      category: 'Alimentação',
      destination: null,
      payment: {
        method: 'pix',
        account: null
      }
    })[0].json;
    assert.equal(normResult.requiresReview, false, 'Despesa com método Pix e destination=null não deve exigir revisão');
    assert.ok(!normResult.warnings.some(w => /forma de pagamento|pagamento|destino/i.test(w)), 'Não deve conter warning de pagamento ausente');

    // 2. Endpoint interpret
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_expense',
        requiresReview: false,
        warnings: [],
        data: {
          description: 'CAFÉ NO PIX',
          amount: 8,
          category: 'Alimentação',
          payment: {
            method: 'pix',
            account: null
          },
          destination: null
        }
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Café 8 no pix',
        conversationId: 'conv_expense_pix_nodest_54'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.requiresReview, false, 'Despesa com método Pix e sem destination não deve exigir revisão');
    assert.ok(!data.warnings.some(w => /forma de pagamento|pagamento|destino/i.test(w)), 'Não deve conter warning de pagamento ausente');
  });

  test('55. Despesa com payment.method=null e destination=null é inválida (requiresReview=true com warning) (Lote 5G-M.2.4)', async () => {
    // 1. Validação no Normalizador n8n (rejeição local estrita com requiresReview=true)
    const normResult = runNormalizer({
      action: 'create_expense',
      description: 'COMPRA SEM FORMA DE PAGAMENTO',
      amount: 55,
      category: 'Alimentação',
      payment: {
        method: null,
        account: null
      },
      destination: null
    })[0].json;
    assert.equal(normResult.requiresReview, true, 'Despesa sem método e sem destination/conta deve exigir revisão no normalizador');
    assert.ok(normResult.warnings.some(w => /pagamento|destino|conta/i.test(w)), 'Normalizador deve conter warning de forma de pagamento ausente');

    // 2. Validação no multi-turn backend (exige pagamento antes de propor)
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_expense',
        requiresReview: false,
        warnings: [],
        data: {
          description: 'COMPRA SEM FORMA DE PAGAMENTO',
          amount: 55,
          category: 'Alimentação',
          payment: {
            method: null,
            account: null
          },
          destination: null
        }
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Compra 55',
        conversationId: 'conv_expense_no_payment_55'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'continue_collection', 'Backend deve manter coleta se faltar pagamento');
    assert.ok(data.missingFields.includes('destination'), 'Deve acusar destination/pagamento pendente');
  });

  test('56. benefitType fail-closed: valor inventado ("combustivel") resulta em benefitType=null, warning e requiresReview=true (Lote 5G-M.2.4)', async () => {
    // 1. Validação no Normalizador n8n (rejeição fail-closed de valores arbitrários)
    const normResult = runNormalizer({
      action: 'create_benefit',
      description: 'ABASTECIMENTO POSTO',
      amount: 150,
      benefitType: 'combustivel'
    })[0].json;
    assert.equal(normResult.data.benefitType, null, 'Tipo de benefício inventado "combustivel" deve ser normalizado para null');
    assert.equal(normResult.requiresReview, true, 'Deve exigir revisão humana quando o tipo de benefício for inválido');
    assert.ok(normResult.warnings.some(w => /combustivel|não é válido|selecionado/i.test(w)), 'Deve conter warning sobre tipo de benefício inválido');

    // 2. Validação no multi-turn backend (rejeição fail-closed)
    mockN8nHandler = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        success: true,
        action: 'create_benefit',
        requiresReview: false,
        warnings: [],
        data: {
          description: 'ABASTECIMENTO POSTO',
          amount: 150,
          benefitType: 'combustivel'
        }
      }]));
    };

    const res = await fetch(`${corvfinUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Abastecimento 150 no benefício combustivel',
        conversationId: 'conv_invalid_ben_type_56'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.action, 'continue_collection', 'Backend deve manter em coleta se o benefício for inventado');
    assert.equal(data.slots.benefitType, null, 'Slot de benefício não pode aceitar combustivel');
    assert.ok(data.missingFields.includes('benefitType'), 'Deve listar benefitType como pendente');
  });
});

