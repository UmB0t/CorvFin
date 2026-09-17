/**
 * CorvFin — Suíte de Testes de Regressão do Fix de Manutenção do Calendário
 *
 * Cobre estritamente os 8 critérios de regressão do Lote A3.4.2 / Fix de Manutenção:
 * 1. 'calendario' é um maintenance module válido no servidor e nos storages.
 * 2. Configuração com 'calendario' pode ser persistida via endpoint administrativo PUT.
 * 3. Leitura (GET /api/admin/maintenance e GET /api/system/maintenance) preserva o estado.
 * 4. Usuário comum é bloqueado conforme a arquitetura (403 no admin e módulo em manutenção no uiShell).
 * 5. Comportamento administrativo existente permanece preservado (GET e PUT com permissão admin).
 * 6. Outros módulos conhecidos permanecem funcionais e independentes.
 * 7. IDs realmente desconhecidos e tipos inválidos continuam estritamente rejeitados (Fail-Closed).
 * 8. Fallback legado de entitlement de 'calendario' não foi generalizado para outros recursos.
 */

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const config = require('../server/config/config');
const app = require('../server/server');
const jsonStorage = require('../server/services/jsonStorage');
const mongoStorage = require('../server/services/mongoStorage');
const { generateToken } = require('../server/services/authService');
const {
  ENTITLEMENT_REGISTRY,
  normalizePlanEntitlements,
  validatePlanEntitlements
} = require('../server/config/entitlementRegistry');

describe('CorvFin — Regressão e Validação Canônica do Fix de Manutenção do Calendário', () => {
  let server;
  let baseUrl;
  let adminToken;
  let normalUserToken;
  let tempTestDir;

  const originalStorageDriver = config.STORAGE_DRIVER;
  const originalUsersFile = config.USERS_FILE;
  const originalMaintenanceFile = config.MAINTENANCE_FILE;

  const adminUser = {
    id: 'usr_test_admin_maint',
    login: 'admin_maint',
    nome: 'Admin Manutenção',
    is_admin: true,
    tokenVersion: 0
  };

  const normalUser = {
    id: 'usr_test_normal_maint',
    login: 'user_maint',
    nome: 'Usuário Comum',
    is_admin: false,
    tokenVersion: 0
  };

  before(async () => {
    tempTestDir = path.join(os.tmpdir(), `corvfin_maint_test_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempTestDir, { recursive: true });

    config.STORAGE_DRIVER = 'json';
    config.USERS_FILE = path.join(tempTestDir, 'users.json');
    config.MAINTENANCE_FILE = path.join(tempTestDir, 'maintenance.json');

    // Inicializa usuários isolados no arquivo temporário
    jsonStorage.saveUsers([adminUser, normalUser]);

    // Tokens JWT válidos
    adminToken = generateToken(adminUser);
    normalUserToken = generateToken(normalUser);

    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    config.STORAGE_DRIVER = originalStorageDriver;
    config.USERS_FILE = originalUsersFile;
    config.MAINTENANCE_FILE = originalMaintenanceFile;

    if (tempTestDir && fs.existsSync(tempTestDir)) {
      try {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  // --------------------------------------------------------------------------
  // 1. 'calendario' é um maintenance module válido
  // --------------------------------------------------------------------------
  test('1.1 server.js declara ALLOWED_MODULES contendo "calendario"', () => {
    const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
    assert.ok(serverJs.includes('ALLOWED_MODULES'), 'server.js deve conter ALLOWED_MODULES');
    assert.ok(serverJs.includes("'calendario'"), "server.js deve conter 'calendario' na lista ALLOWED_MODULES");
  });

  test('1.2 jsonStorage e mongoStorage incluem "calendario" em DEFAULT_MAINTENANCE_CONFIG', () => {
    assert.ok(jsonStorage.DEFAULT_MAINTENANCE_CONFIG.calendario, 'jsonStorage deve conter calendario');
    assert.strictEqual(jsonStorage.DEFAULT_MAINTENANCE_CONFIG.calendario.name, 'Calendário');
    assert.strictEqual(jsonStorage.DEFAULT_MAINTENANCE_CONFIG.calendario.maintenance, false);

    assert.ok(mongoStorage.DEFAULT_MAINTENANCE_CONFIG.calendario, 'mongoStorage deve conter calendario');
    assert.strictEqual(mongoStorage.DEFAULT_MAINTENANCE_CONFIG.calendario.name, 'Calendário');
    assert.strictEqual(mongoStorage.DEFAULT_MAINTENANCE_CONFIG.calendario.maintenance, false);
  });

  test('1.3 scripts/migrate-json-to-mongodb.js inclui "calendario" em ALLOWED_MODULES', () => {
    const scriptContent = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'migrate-json-to-mongodb.js'), 'utf8');
    assert.ok(scriptContent.includes('ALLOWED_MODULES'), 'migrate script deve conter ALLOWED_MODULES');
    assert.ok(scriptContent.includes("'calendario'"), "migrate script deve conter 'calendario' na lista ALLOWED_MODULES");
  });

  // --------------------------------------------------------------------------
  // 2. Configuração com calendario pode ser persistida via endpoint PUT
  // --------------------------------------------------------------------------
  test('2.1 Admin salva manutenção ativando "calendario": true sem erro 400', async () => {
    const res = await fetch(`${baseUrl}/api/admin/maintenance`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        maintenance: {
          calendario: true
        }
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200, `Esperado 200, recebido ${res.status}: ${JSON.stringify(data)}`);
    assert.strictEqual(data.success, true);
    assert.ok(data.maintenance, 'Resposta deve conter objeto maintenance');
    assert.strictEqual(data.maintenance.calendario.maintenance, true, 'calendario deve estar em manutenção');
  });

  // --------------------------------------------------------------------------
  // 3. Leitura preserva estado (GET /api/admin/maintenance e GET /api/system/maintenance)
  // --------------------------------------------------------------------------
  test('3.1 GET /api/admin/maintenance reflete estado persistido de "calendario": true', async () => {
    const res = await fetch(`${baseUrl}/api/admin/maintenance`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.maintenance.calendario.maintenance, true);
    assert.strictEqual(data.maintenance.calendario.name, 'Calendário');
  });

  test('3.2 GET /api/system/maintenance para usuário autenticado retorna "calendario": true', async () => {
    const res = await fetch(`${baseUrl}/api/system/maintenance`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${normalUserToken}`
      }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.maintenance.calendario.maintenance, true);
  });

  test('3.3 Admin desativa manutenção de "calendario" para false e persistência preserva', async () => {
    const putRes = await fetch(`${baseUrl}/api/admin/maintenance`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        maintenance: {
          calendario: false
        }
      })
    });

    const putData = await putRes.json();
    assert.strictEqual(putRes.status, 200);
    assert.strictEqual(putData.maintenance.calendario.maintenance, false);

    // Confirma via GET
    const getRes = await fetch(`${baseUrl}/api/admin/maintenance`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const getData = await getRes.json();
    assert.strictEqual(getData.maintenance.calendario.maintenance, false);
  });

  // --------------------------------------------------------------------------
  // 4. Usuário comum é bloqueado conforme arquitetura existente
  // --------------------------------------------------------------------------
  test('4.1 Usuário comum recebe 403 ao tentar PUT /api/admin/maintenance', async () => {
    const res = await fetch(`${baseUrl}/api/admin/maintenance`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${normalUserToken}`
      },
      body: JSON.stringify({
        maintenance: {
          calendario: true
        }
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 403);
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('Apenas administradores'));
  });

  test('4.2 Requisição não autenticada recebe 401 em /api/admin/maintenance', async () => {
    const res = await fetch(`${baseUrl}/api/admin/maintenance`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maintenance: { calendario: true } })
    });

    assert.strictEqual(res.status, 401);
  });

  test('4.3 uiShell.js vincula tab-calendar a calendario para bloqueio de tela', () => {
    const uiShellContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'uiShell.js'), 'utf8');
    assert.ok(
      uiShellContent.includes("'tab-calendar': 'calendario'"),
      'uiShell.js deve mapear tab-calendar para a chave de manutenção canônica calendario'
    );
  });

  // --------------------------------------------------------------------------
  // 5. Comportamento administrativo existente permanece
  // --------------------------------------------------------------------------
  test('5.1 Admin envia payload completo estilo admin.js com todos os módulos e obtém 200', async () => {
    const fullPayload = {
      dashboard: false,
      calendario: true,
      despesas: false,
      extras: false,
      devedores: false,
      investimentos: false,
      beneficios: false,
      compras: false,
      simulacao: false
    };

    const res = await fetch(`${baseUrl}/api/admin/maintenance`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ maintenance: fullPayload })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.maintenance.calendario.maintenance, true);
    assert.strictEqual(data.maintenance.dashboard.maintenance, false);
    assert.strictEqual(data.maintenance.despesas.maintenance, false);
  });

  // --------------------------------------------------------------------------
  // 6. Outro módulo conhecido permanece funcional
  // --------------------------------------------------------------------------
  test('6.1 Outro módulo conhecido (despesas) pode ser colocado em manutenção sem afetar outros', async () => {
    const res = await fetch(`${baseUrl}/api/admin/maintenance`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        maintenance: {
          despesas: true,
          calendario: false
        }
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.maintenance.despesas.maintenance, true);
    assert.strictEqual(data.maintenance.calendario.maintenance, false);
  });

  // --------------------------------------------------------------------------
  // 7. IDs realmente desconhecidos continuam rejeitados (Fail-Closed)
  // --------------------------------------------------------------------------
  test('7.1 Módulo desconhecido é estritamente rejeitado com status 400', async () => {
    const res = await fetch(`${baseUrl}/api/admin/maintenance`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        maintenance: {
          modulo_inexistente_x: true
        }
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('Módulo(s) inválido(s) ou desconhecido(s)'));
    assert.ok(data.message.includes('modulo_inexistente_x'));
  });

  test('7.2 Valor não booleano para módulo é rejeitado com status 400', async () => {
    const res = await fetch(`${baseUrl}/api/admin/maintenance`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        maintenance: {
          calendario: 'sim'
        }
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('deve ser estritamente booleano'));
  });

  // --------------------------------------------------------------------------
  // 8. Fallback legado de entitlement de 'calendario' não foi generalizado
  // --------------------------------------------------------------------------
  test('8.1 Fallback de plano legado é EXCLUSIVO de "calendario"', () => {
    const legacyEntitlements = {};
    for (const key of Object.keys(ENTITLEMENT_REGISTRY)) {
      legacyEntitlements[key] = { enabled: true, limits: {} };
    }
    // Remove calendario e também despesas
    delete legacyEntitlements.calendario;
    delete legacyEntitlements.despesas;

    const normalized = normalizePlanEntitlements(legacyEntitlements);

    // calendario recebe fallback exclusivo em planos legados
    assert.ok(normalized.calendario, 'calendario deve receber compatibilidade legada');
    assert.strictEqual(normalized.calendario.enabled, true);

    // despesas NÃO recebe fallback e permanece ausente
    assert.strictEqual('despesas' in normalized, false, 'despesas NÃO deve receber fallback genérico');
  });

  test('8.2 Novo plano submetido sem calendario continua falhando validação estrita (Fail-Closed)', () => {
    const invalidPlanEntitlements = {};
    for (const key of Object.keys(ENTITLEMENT_REGISTRY)) {
      invalidPlanEntitlements[key] = { enabled: true, limits: {} };
    }
    delete invalidPlanEntitlements.calendario;

    assert.throws(() => {
      validatePlanEntitlements(invalidPlanEntitlements, true);
    }, (err) => {
      return err.message.includes('calendario');
    }, 'Novo plano sem calendario deve falhar validação estrita');
  });
});
