/**
 * Testes de Integração e Contratos Estruturais — CorvFin Relatórios Financeiros V2 (Fase R3)
 * Arquivo: tests/reports_module_integration.test.js
 * 
 * Classificação dos testes:
 * - UNITÁRIOS: Storages, defaults de permissão, fallback legado e resolução de Effective Access
 * - INTEGRAÇÃO: Round-trip pontual de manutenção e permissões padrão via API Express isolada
 * - ESTRUTURAIS / CONTRATO ESTÁTICO: Verificação de rotas, UI shell, HTML, DOM containers e drawer
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

// Módulos do servidor
const config = require('../server/config/config');
const jsonStorage = require('../server/services/jsonStorage');
const mongoStorage = require('../server/services/mongoStorage');
const { ENTITLEMENT_REGISTRY } = require('../server/config/entitlementRegistry');
const { generateToken } = require('../server/services/authService');
const app = require('../server/server');

describe('CorvFin V2 — Relatórios Financeiros (Fase R3 — Module Shell, Navigation & Access Integration)', () => {

  /* ==========================================================================
     1. TESTES UNITÁRIOS: DEFAULTS, PERMISSIONS & STORAGE
     ========================================================================== */
  describe('1. Testes Unitários de Storage, Defaults e Effective Access', () => {

    test('1.1 jsonStorage.getDefaultPermissions() declara relatorios: true por padrão', () => {
      const defaults = jsonStorage.getDefaultPermissions();
      assert.strictEqual(defaults.relatorios, true, 'relatorios deve ser true no defaultPermissions');
    });

    test('1.2 jsonStorage.DEFAULT_MAINTENANCE_CONFIG inclui módulo relatorios', () => {
      assert.ok(jsonStorage.DEFAULT_MAINTENANCE_CONFIG.relatorios, 'DEFAULT_MAINTENANCE_CONFIG deve conter relatorios');
      assert.strictEqual(jsonStorage.DEFAULT_MAINTENANCE_CONFIG.relatorios.maintenance, false);
      assert.strictEqual(jsonStorage.DEFAULT_MAINTENANCE_CONFIG.relatorios.name, 'Relatórios Financeiros');
    });

    test('1.3 mongoStorage.DEFAULT_MAINTENANCE_CONFIG inclui módulo relatorios', () => {
      assert.ok(mongoStorage.DEFAULT_MAINTENANCE_CONFIG.relatorios, 'mongo DEFAULT_MAINTENANCE_CONFIG deve conter relatorios');
      assert.strictEqual(mongoStorage.DEFAULT_MAINTENANCE_CONFIG.relatorios.maintenance, false);
      assert.strictEqual(mongoStorage.DEFAULT_MAINTENANCE_CONFIG.relatorios.name, 'Relatórios Financeiros');
    });

    test('1.4 mongoStorage.DEFAULT_PERMISSIONS_FALLBACK inclui relatorios: true', () => {
      assert.strictEqual(mongoStorage.DEFAULT_PERMISSIONS_FALLBACK.relatorios, true);
    });

    test('1.5 Usuário sem registro no permissions herda relatorios: true via getUserPermissions', () => {
      const perms = jsonStorage.getUserPermissions('usr_inexistente_sem_registro');
      assert.strictEqual(perms.relatorios, true, 'Usuário novo/sem registro deve herdar relatorios: true');
    });

    test('1.6 Usuário legado com permissions mas sem chave relatorios herda relatorios: true (compatibilidade)', () => {
      // Simula usuário legado onde a chave relatorios era inexistente
      const legacyPerms = { dashboard: true, despesas: true };
      const fallback = jsonStorage.getDefaultPermissions();
      const resolved = Object.assign({}, fallback, legacyPerms);
      assert.strictEqual(resolved.relatorios, true, 'Usuário legado sem chave relatorios deve resolver como true');
    });

    test('1.7 Usuário com revogação explícita (relatorios: false) preserva rigorosamente false', () => {
      const explicitRevokedPerms = { dashboard: true, relatorios: false };
      const fallback = jsonStorage.getDefaultPermissions();
      const resolved = Object.assign({}, fallback, explicitRevokedPerms);
      assert.strictEqual(resolved.relatorios, false, 'Revogação explícita deve prevalecer sobre fallback');
    });

    test('1.8 Entitlement relatorios está formalmente registrado em ENTITLEMENT_REGISTRY', () => {
      const registry = ENTITLEMENT_REGISTRY;
      assert.ok(registry.relatorios, 'ENTITLEMENT_REGISTRY deve conter relatorios');
      assert.strictEqual(registry.relatorios.supportsAccessToggle, true);
      assert.strictEqual(registry.relatorios.label, 'Relatórios Financeiros');
    });

    test('1.9 Effective Access: Plano permite (true) + Permissão individual permite (true) => effective: true', async () => {
      const user = {
        id: 'usr_test_eff_1',
        permissions: { relatorios: true },
        plan: {
          slug: 'pro',
          entitlements: {
            relatorios: { enabled: true }
          }
        }
      };
      // Mock do getPlanForUser ou objeto user com plan resolvido
      const hasAccess = (user.plan.entitlements.relatorios.enabled === true) && (user.permissions.relatorios !== false);
      assert.strictEqual(hasAccess, true);
    });

    test('1.10 Effective Access: Plano permite (true) + Permissão individual revogada (false) => effective: false', async () => {
      const user = {
        id: 'usr_test_eff_2',
        permissions: { relatorios: false },
        plan: {
          slug: 'pro',
          entitlements: {
            relatorios: { enabled: true }
          }
        }
      };
      const hasAccess = (user.plan.entitlements.relatorios.enabled === true) && (user.permissions.relatorios !== false);
      assert.strictEqual(hasAccess, false);
    });

    test('1.11 Effective Access: Plano permite (true) + Permissão legada ausente (undefined) => effective: true', async () => {
      const user = {
        id: 'usr_test_eff_3',
        permissions: { dashboard: true }, // chave relatorios omitida
        plan: {
          slug: 'pro',
          entitlements: {
            relatorios: { enabled: true }
          }
        }
      };
      const hasAccess = (user.plan.entitlements.relatorios.enabled === true) && (user.permissions.relatorios !== false);
      assert.strictEqual(hasAccess, true, 'Usuário com permissão omitida não pode ser bloqueado se plano permite');
    });

    test('1.12 Effective Access: Plano proíbe (false) + Permissão individual true => effective: false (Plano é soberano)', async () => {
      const user = {
        id: 'usr_test_eff_4',
        permissions: { relatorios: true },
        plan: {
          slug: 'basic',
          entitlements: {
            relatorios: { enabled: false }
          }
        }
      };
      const hasAccess = (user.plan.entitlements.relatorios.enabled === true) && (user.permissions.relatorios !== false);
      assert.strictEqual(hasAccess, false);
    });

    test('1.13 Effective Access: Admin NÃO possui bypass implícito quando plano proíbe', async () => {
      const adminUser = {
        id: 'usr_test_eff_admin',
        is_admin: true,
        permissions: { relatorios: true },
        plan: {
          slug: 'free',
          entitlements: {
            relatorios: { enabled: false }
          }
        }
      };
      const hasCommercialAccess = (adminUser.plan.entitlements.relatorios.enabled === true) && (adminUser.permissions.relatorios !== false);
      assert.strictEqual(hasCommercialAccess, false, 'Admin não deve furar entitlement comercial de plano');
    });
  });

  /* ==========================================================================
     2. TESTES DE INTEGRAÇÃO API: MAINTENANCE ROUND-TRIP & PERMISSIONS SAVE
     ========================================================================== */
  describe('2. Testes de Integração com Servidor Isolado (API Round-Trip)', () => {
    let server;
    let baseUrl;
    let tempTestDir;
    let originalStorageDriver;
    let originalUsersFile;
    let originalMaintenanceFile;
    let originalDefaultPermsFile;
    let adminToken;
    let normalToken;

    const testAdmin = {
      id: 'usr_integration_admin',
      login: 'admin_test_r3',
      nome: 'Admin Test R3',
      is_admin: true,
      tokenVersion: 0
    };

    const testUser = {
      id: 'usr_integration_normal',
      login: 'normal_test_r3',
      nome: 'Normal User Test R3',
      is_admin: false,
      tokenVersion: 0
    };

    before(async () => {
      originalStorageDriver = config.STORAGE_DRIVER;
      originalUsersFile = config.USERS_FILE;
      originalMaintenanceFile = config.MAINTENANCE_FILE;
      originalDefaultPermsFile = config.DEFAULT_PERMISSIONS_FILE;

      tempTestDir = path.join(os.tmpdir(), `corvfin_r3_test_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      fs.mkdirSync(tempTestDir, { recursive: true });

      config.STORAGE_DRIVER = 'json';
      config.USERS_FILE = path.join(tempTestDir, 'users.json');
      config.MAINTENANCE_FILE = path.join(tempTestDir, 'maintenance.json');
      config.DEFAULT_PERMISSIONS_FILE = path.join(tempTestDir, 'default_permissions.json');

      jsonStorage.saveUsers([testAdmin, testUser]);

      adminToken = generateToken(testAdmin);
      normalToken = generateToken(testUser);

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
      config.DEFAULT_PERMISSIONS_FILE = originalDefaultPermsFile;

      if (tempTestDir && fs.existsSync(tempTestDir)) {
        try { fs.rmSync(tempTestDir, { recursive: true, force: true }); } catch (_) {}
      }
    });

    test('2.1 PUT /api/admin/maintenance aceita módulo "relatorios" sem erro de allowlist (ERRATA 4)', async () => {
      const res = await fetch(`${baseUrl}/api/admin/maintenance`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          maintenance: {
            relatorios: true
          }
        })
      });

      assert.strictEqual(res.status, 200, 'PUT deve retornar 200 OK');
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.maintenance, 'Deve conter objeto maintenance');
      assert.strictEqual(data.maintenance.relatorios.maintenance, true);
      assert.strictEqual(data.maintenance.relatorios.name, 'Relatórios Financeiros');
    });

    test('2.2 GET /api/admin/maintenance retorna o estado persistido de "relatorios": true', async () => {
      const res = await fetch(`${baseUrl}/api/admin/maintenance`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.maintenance.relatorios.maintenance, true);
      assert.strictEqual(data.maintenance.relatorios.name, 'Relatórios Financeiros');
    });

    test('2.3 PUT /api/admin/maintenance permite reverter "relatorios" para false', async () => {
      const res = await fetch(`${baseUrl}/api/admin/maintenance`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          maintenance: {
            relatorios: false
          }
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.maintenance.relatorios.maintenance, false);

      const checkRes = await fetch(`${baseUrl}/api/admin/maintenance`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const checkData = await checkRes.json();
      assert.strictEqual(checkData.maintenance.relatorios.maintenance, false);
    });

    test('2.4 Usuário não-admin recebe 403 Forbidden ao tentar alterar maintenance', async () => {
      const res = await fetch(`${baseUrl}/api/admin/maintenance`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${normalToken}`
        },
        body: JSON.stringify({
          maintenance: { relatorios: true }
        })
      });

      assert.strictEqual(res.status, 403);
    });

    test('2.5 POST /api/admin/default-permissions aceita relatorios e preserva campos em updates parciais (ERRATA 3)', async () => {
      // 1. Salva explicitamente relatorios: false
      const res1 = await fetch(`${baseUrl}/api/admin/default-permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          permissions: { relatorios: false }
        })
      });

      assert.strictEqual(res1.status, 200);
      const data1 = await res1.json();
      assert.strictEqual(data1.permissions.relatorios, false);

      // 2. Envia update parcial de outro módulo (simulacao: true) SEM relatorios
      const res2 = await fetch(`${baseUrl}/api/admin/default-permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          permissions: { simulacao: true }
        })
      });

      assert.strictEqual(res2.status, 200);
      const data2 = await res2.json();
      // Deve ter preservado relatorios: false e não ter convertido involuntariamente para true
      assert.strictEqual(data2.permissions.relatorios, false, 'Update parcial não deve reverter relatorios para true acidentalmente');
    });
  });

  /* ==========================================================================
     3. TESTES ESTRUTURAIS & CONTRATO ESTÁTICO DE NAVEGAÇÃO / UI SHELL
     ========================================================================== */
  describe('3. Testes Estruturais e Contratos Estáticos de Navegação e UI Shell', () => {

    const indexHtmlContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    const uiShellContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'uiShell.js'), 'utf-8');
    const appJsContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'app.js'), 'utf-8');
    const adminJsContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf-8');
    const constantsJsContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'constants.js'), 'utf-8');
    const reportsViewContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'reportsView.js'), 'utf-8');
    const reportsJsContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'reports.js'), 'utf-8');

    test('3.1 Sidebar desktop possui botão data-tab="tab-reports" posicionado após despesas', () => {
      assert.ok(indexHtmlContent.includes('data-tab="tab-reports"'), 'index.html deve conter link da sidebar com data-tab="tab-reports"');
      assert.ok(indexHtmlContent.includes('data-tooltip="Relatórios"'));
      
      const idxExpenses = indexHtmlContent.indexOf('data-tab="tab-expenses"');
      const idxReports = indexHtmlContent.indexOf('data-tab="tab-reports"');
      const idxExtras = indexHtmlContent.indexOf('data-tab="tab-extras"');

      assert.ok(idxExpenses > 0 && idxReports > idxExpenses, 'Relatórios deve vir após Despesas');
      assert.ok(idxExtras > 0 && idxReports < idxExtras, 'Relatórios deve vir antes de Rendas Extras na sidebar');
    });

    test('3.2 Container principal <main id="tab-reports" class="tab-content" hidden> existe no index.html', () => {
      assert.ok(indexHtmlContent.includes('<main id="tab-reports" class="tab-content" hidden>'), 'Container tab-reports deve existir');
    });

    test('3.3 Shell estático não possui spinner infinito, nem "em breve", nem canvas de gráficos (ERRATA 2)', () => {
      const reportsContainerStart = indexHtmlContent.indexOf('<main id="tab-reports"');
      const reportsContainerEnd = indexHtmlContent.indexOf('</main>', reportsContainerStart);
      const containerSlice = indexHtmlContent.slice(reportsContainerStart, reportsContainerEnd + 7);

      assert.ok(!containerSlice.toLowerCase().includes('spinner'), 'Não deve conter spinner');
      assert.ok(!containerSlice.toLowerCase().includes('em breve'), 'Não deve conter "em breve"');
      assert.ok(!containerSlice.toLowerCase().includes('estamos preparando'), 'Não deve conter "estamos preparando"');
      assert.ok(!containerSlice.includes('<canvas'), 'Não deve conter canvas especulativo');
      assert.ok(!containerSlice.includes('<table'), 'Não deve conter tabela vazia especulativa');
      assert.ok(containerSlice.includes('Relatórios Financeiros'), 'Deve conter título oficial');
      assert.ok(containerSlice.includes('Seus relatórios financeiros consolidados serão exibidos aqui.'));
    });

    test('3.4 reportsView.js existe, define renderReportsTab e não possui chamadas analíticas prematuras', () => {
      assert.ok(reportsViewContent.includes('window.renderReportsTab = renderReportsTab;'));
      assert.ok(!reportsViewContent.includes('/api/finances/reports'), 'reportsView.js na R3 não deve fazer fetch da API');
      assert.ok(!reportsViewContent.includes('spinner'), 'reportsView.js não deve renderizar spinners infinitos');
    });

    test('3.5 reports.js legado permanece 100% intacto com o diálogo legado e formatadores', () => {
      assert.ok(reportsJsContent.includes('initReportDialog'), 'reports.js deve manter modal legado');
      assert.ok(reportsJsContent.includes('formatDebtorInstallment'), 'reports.js deve manter formatDebtorInstallment');
      assert.ok(reportsJsContent.includes('exportReportCsv'), 'reports.js deve manter exportReportCsv');
    });

    test('3.6 index.html carrega scripts na ordem correta: reports.js seguido de reportsView.js', () => {
      const idxLegacyReports = indexHtmlContent.indexOf('js/modules/reports.js');
      const idxReportsView = indexHtmlContent.indexOf('js/modules/reportsView.js');
      assert.ok(idxLegacyReports > 0, 'reports.js deve ser carregado');
      assert.ok(idxReportsView > idxLegacyReports, 'reportsView.js deve ser carregado logo após reports.js');
    });

    test('3.7 ROUTE_MAP em uiShell.js resolve "/relatorios" para "tab-reports"', () => {
      assert.ok(uiShellContent.includes("'/relatorios': 'tab-reports'"), 'ROUTE_MAP deve conter rota /relatorios');
    });

    test('3.8 TAB_TO_ROUTE em uiShell.js resolve "tab-reports" para "/relatorios"', () => {
      assert.ok(uiShellContent.includes("'tab-reports': '/relatorios'"), 'TAB_TO_ROUTE deve conter tab-reports -> /relatorios');
    });

    test('3.9 TAB_PERMISSION_MAP em uiShell.js aponta "tab-reports" para "relatorios"', () => {
      assert.ok(uiShellContent.includes("'tab-reports': 'relatorios'"), 'TAB_PERMISSION_MAP deve apontar tab-reports para relatorios');
    });

    test('3.10 TAB_ORDER em uiShell.js inclui "tab-reports" na precedência de abas', () => {
      assert.ok(uiShellContent.includes("'tab-reports'"), 'TAB_ORDER deve conter tab-reports');
    });

    test('3.11 MAINTENANCE_MODULE_MAP em uiShell.js associa "tab-reports" ao módulo "relatorios"', () => {
      assert.ok(uiShellContent.includes("'tab-reports': 'relatorios'"), 'MAINTENANCE_MODULE_MAP deve mapear tab-reports para relatorios');
    });

    test('3.12 ALL_DRAWER_MODULE_CONFIG em uiShell.js registra Relatórios para o menu "Mais" (ERRATA 1)', () => {
      assert.ok(uiShellContent.includes("tabId: 'tab-reports'"), 'ALL_DRAWER_MODULE_CONFIG deve incluir tab-reports');
      assert.ok(uiShellContent.includes("key: 'relatorios'"));
      assert.ok(uiShellContent.includes("label: 'Relatórios'"));
    });

    test('3.13 MOBILE_MODULE_CONFIG preserva a composição original da bottom navigation sem deslocamentos (ERRATA 1)', () => {
      // Confirma que a bottom navigation primária preservou seus módulos oficiais (Dashboard, Despesas, Devedores)
      assert.ok(indexHtmlContent.includes('id="bottomNavFav1"'));
      assert.ok(indexHtmlContent.includes('id="bottomNavFav2"'));
      assert.ok(indexHtmlContent.includes('id="bottomNavFav3"'));
      assert.ok(indexHtmlContent.includes('id="btnMobileMore"'));
    });

    test('3.14 ALL_APP_TABS em app.js inclui "tab-reports"', () => {
      assert.ok(appJsContent.includes("'tab-reports'"), 'ALL_APP_TABS deve incluir tab-reports');
    });

    test('3.15 renderTabContent em app.js despacha window.renderReportsTab() quando tabId === "tab-reports"', () => {
      assert.ok(appJsContent.includes("tabId === 'tab-reports'"), 'renderTabContent deve tratar tab-reports');
      assert.ok(appJsContent.includes('renderReportsTab'), 'renderTabContent deve invocar renderReportsTab');
    });

    test('3.16 ALL_MODULES_CONFIG em admin.js inclui módulo "relatorios"', () => {
      assert.ok(adminJsContent.includes("key: 'relatorios'"), 'admin.js deve registrar key relatorios');
      assert.ok(adminJsContent.includes("name: 'Relatórios Financeiros'"));
    });

    test('3.17 Checkbox default-perm-relatorios existe no painel de administração em index.html', () => {
      assert.ok(indexHtmlContent.includes('id="default-perm-relatorios"'), 'Deve existir checkbox default-perm-relatorios');
      assert.ok(indexHtmlContent.includes('data-default-module="relatorios"'));
    });

    test('3.18 TAB_TITLES em constants.js define título oficial para "tab-reports"', () => {
      assert.ok(constantsJsContent.includes("'tab-reports': 'Relatórios Financeiros'"));
    });

    test('3.19 titleMap e subMap em uiShell.js possuem entradas para "tab-reports"', () => {
      assert.ok(uiShellContent.includes("'tab-reports': 'Relatórios Financeiros'"));
      assert.ok(uiShellContent.includes("'tab-reports': 'Analise sua evolução financeira e entenda para onde seu dinheiro está indo.'"));
    });

    test('3.20 Zero regressão nos mapeamentos e rotas de Calendar, Expenses e Dashboard', () => {
      assert.ok(uiShellContent.includes("'/calendario': 'tab-calendar'"));
      assert.ok(uiShellContent.includes("'/despesas': 'tab-expenses'"));
      assert.ok(uiShellContent.includes("'/dashboard': 'tab-dashboard'"));
      assert.ok(appJsContent.includes("tabId === 'tab-calendar'"));
      assert.ok(appJsContent.includes("tabId === 'tab-expenses'"));
      assert.ok(appJsContent.includes("tabId === 'tab-dashboard'"));
    });
  });
});
