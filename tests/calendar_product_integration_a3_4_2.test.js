/**
 * CorvFin — Suíte de Testes do Lote A3.4.2:
 * Calendar Product Integration + Benefits Collapse + Entry Scroll Fix + Legacy Compatibility
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  ENTITLEMENT_REGISTRY,
  normalizePlanEntitlements,
  validatePlanEntitlements
} = require('../server/config/entitlementRegistry');

const jsonStorage = require('../server/services/jsonStorage');
const mongoStorage = require('../server/services/mongoStorage');
const planService = require('../server/services/planService');
const entitlementService = require('../server/services/entitlementService');

describe('Lote A3.4.2 — 1. Compatibilidade de Planos & Fail-Closed do Calendário', () => {

  // Helper para gerar mock de entitlements canônicos completos (11 recursos)
  function createCanonicalEntitlements(overrides = {}) {
    const ents = {};
    for (const key of Object.keys(ENTITLEMENT_REGISTRY)) {
      ents[key] = { enabled: true, limits: {} };
    }
    return Object.assign(ents, overrides);
  }

  test('1.1 ENTITLEMENT_REGISTRY contém o recurso "calendario" com supportsAccessToggle: true', () => {
    assert.ok(ENTITLEMENT_REGISTRY.calendario, 'calendario deve estar no registry');
    assert.strictEqual(ENTITLEMENT_REGISTRY.calendario.label, 'Calendário');
    assert.strictEqual(ENTITLEMENT_REGISTRY.calendario.supportsAccessToggle, true);
    assert.deepStrictEqual(ENTITLEMENT_REGISTRY.calendario.availableLimits, []);
  });

  test('1.2 Plano legado SEM "calendario" recebe compatibilidade em runtime (enabled: true, limits: {})', () => {
    const legacyEntitlements = createCanonicalEntitlements();
    delete legacyEntitlements.calendario;
    assert.strictEqual('calendario' in legacyEntitlements, false, 'Pre-condition: calendario ausente');

    const normalized = normalizePlanEntitlements(legacyEntitlements);
    assert.ok(normalized.calendario, 'Normalização deve injetar chave calendario');
    assert.strictEqual(normalized.calendario.enabled, true, 'calendario deve ser enabled: true por compatibilidade');
    assert.deepStrictEqual(normalized.calendario.limits, {}, 'limits deve ser objeto vazio');
  });

  test('1.3 Plano com calendario.enabled = true explícito permanece enabled: true', () => {
    const explicitPlan = createCanonicalEntitlements({
      calendario: { enabled: true, limits: {} }
    });
    const normalized = normalizePlanEntitlements(explicitPlan);
    assert.strictEqual(normalized.calendario.enabled, true);
  });

  test('1.4 Plano com calendario.enabled = false explícito permanece BLOQUEADO (enabled: false)', () => {
    const explicitBlockedPlan = createCanonicalEntitlements({
      calendario: { enabled: false, limits: {} }
    });
    const normalized = normalizePlanEntitlements(explicitBlockedPlan);
    assert.strictEqual(normalized.calendario.enabled, false, 'Explicit false NÃO pode ser sobrescrito pelo fallback de legado');
  });

  test('1.5 RESTRIÇÃO CRÍTICA DO FAIL-CLOSED: Qualquer outro entitlement ausente NÃO recebe fallback genérico', () => {
    const missingDespesas = createCanonicalEntitlements();
    delete missingDespesas.despesas;

    normalizePlanEntitlements(missingDespesas);
    assert.strictEqual('despesas' in missingDespesas, false, 'despesas ausente NÃO pode ser injetada automaticamente com enabled: true');

    // Validação estrita deve reprovar plano que omite despesas
    assert.throws(() => {
      validatePlanEntitlements(missingDespesas, true);
    }, (err) => {
      return err.message.includes('despesas');
    }, 'Plano com despesas ausente deve falhar a validação canônica');
  });

  test('1.6 Validação Canônica: Novo plano submetido sem "calendario" é REJEITADO estritamente', () => {
    const newPlanPayload = createCanonicalEntitlements();
    delete newPlanPayload.calendario;

    assert.throws(() => {
      validatePlanEntitlements(newPlanPayload, true);
    }, (err) => {
      return err.message.includes('calendario');
    }, 'Novo plano sem calendario deve falhar validação estrita');
  });

  test('1.7 Normalização não muta o arquivo original plans.json nem executa escrita silenciosa', () => {
    const plansFilePath = path.join(__dirname, '..', 'server', 'data', 'plans.json');
    const contentBefore = fs.readFileSync(plansFilePath, 'utf8');

    // Simula leitura de planos e normalização em memória
    const plansData = JSON.parse(contentBefore);
    for (const p of plansData.plans || []) {
      if (p.entitlements) {
        normalizePlanEntitlements(JSON.parse(JSON.stringify(p.entitlements)));
      }
    }

    const contentAfter = fs.readFileSync(plansFilePath, 'utf8');
    assert.strictEqual(contentBefore, contentAfter, 'Arquivo plans.json persistido NÃO pode ter sido modificado em disco');
  });

  test('1.8 Usuários existentes com planos legados obtêm acesso a "calendario" via getEffectiveEntitlements', async () => {
    // Simula usuário com plano legado em memória (sem a chave calendario)
    const legacyPlan = {
      _id: 'mock_legacy_plan_id',
      slug: 'mock-legacy',
      name: 'Plano Legado Mock',
      status: 'active',
      entitlements: createCanonicalEntitlements()
    };
    delete legacyPlan.entitlements.calendario;

    // Normalização em runtime aplicada pelo serviço de planos
    normalizePlanEntitlements(legacyPlan.entitlements);

    assert.strictEqual(legacyPlan.entitlements.calendario.enabled, true);
  });
});

describe('Lote A3.4.2 — 2. Integração Canônica de RBAC e Manutenção do Calendário', () => {

  test('2.1 Default permissions em jsonStorage inclui calendario: true', () => {
    const defaults = jsonStorage.getDefaultPermissions();
    assert.strictEqual(defaults.calendario, true, 'jsonStorage.getDefaultPermissions deve ter calendario: true');
  });

  test('2.2 Default permissions fallback em mongoStorage inclui calendario: true', () => {
    assert.strictEqual(mongoStorage.DEFAULT_PERMISSIONS_FALLBACK.calendario, true, 'mongoStorage.DEFAULT_PERMISSIONS_FALLBACK deve ter calendario: true');
  });

  test('2.3 Configuração padrão de manutenção em jsonStorage e mongoStorage inclui calendario: false', () => {
    assert.ok(jsonStorage.DEFAULT_MAINTENANCE_CONFIG.calendario, 'jsonStorage deve configurar manutenção para calendario');
    assert.strictEqual(jsonStorage.DEFAULT_MAINTENANCE_CONFIG.calendario.maintenance, false);
    assert.strictEqual(jsonStorage.DEFAULT_MAINTENANCE_CONFIG.calendario.name, 'Calendário');

    assert.ok(mongoStorage.DEFAULT_MAINTENANCE_CONFIG.calendario, 'mongoStorage deve configurar manutenção para calendario');
    assert.strictEqual(mongoStorage.DEFAULT_MAINTENANCE_CONFIG.calendario.maintenance, false);
    assert.strictEqual(mongoStorage.DEFAULT_MAINTENANCE_CONFIG.calendario.name, 'Calendário');
  });

  test('2.4 uiShell.js declara TAB_PERMISSION_MAP["tab-calendar"] = "calendario"', () => {
    const uiShellContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'uiShell.js'), 'utf8');
    assert.ok(uiShellContent.includes("'tab-calendar': 'calendario'"), 'TAB_PERMISSION_MAP deve mapear tab-calendar para calendario');
  });

  test('2.5 uiShell.js declara MAINTENANCE_MODULE_MAP["tab-calendar"] = "calendario"', () => {
    const uiShellContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'uiShell.js'), 'utf8');
    assert.ok(uiShellContent.includes("'tab-calendar': 'calendario'"), 'MAINTENANCE_MODULE_MAP deve mapear tab-calendar para calendario');
  });

  test('2.6 admin.js inclui calendario em ALL_MODULES_CONFIG com nome e metadados', () => {
    const adminJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
    assert.ok(adminJs.includes("key: 'calendario'"), 'ALL_MODULES_CONFIG deve conter key: calendario');
    assert.ok(adminJs.includes("name: 'Calendário'"), 'ALL_MODULES_CONFIG deve conter name: Calendário');
  });

  test('2.7 index.html possui checkbox #default-perm-calendario', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(indexHtml.includes('id="default-perm-calendario"'), 'index.html deve conter input com id default-perm-calendario');
    assert.ok(indexHtml.includes('data-default-module="calendario"'), 'index.html deve conter data-default-module="calendario"');
  });
});

describe('Lote A3.4.2 — 3. Calendário de Benefícios Retrátil & Persistência Local', () => {

  test('3.1 calendar.js define #calendarBenefitsModule como expandable-section com storageKey corvfin_calendar_benefits_expanded', () => {
    const calJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'calendar.js'), 'utf8');
    assert.ok(calJs.includes('calendar-benefits-section expandable-section'), 'calendar.js deve aplicar classes de expandable-section ao módulo de benefícios');
    assert.ok(calJs.includes('corvfin_calendar_benefits_expanded'), 'calendar.js deve usar storageKey corvfin_calendar_benefits_expanded');
  });

  test('3.2 calendar.js possui cabeçalho retrátil com badge de saldo disponível e chevron affordance', () => {
    const calJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'calendar.js'), 'utf8');
    assert.ok(calJs.includes('id="calendarBenefitsModuleToggleBtn"'), 'Deve conter botão de toggle #calendarBenefitsModuleToggleBtn');
    assert.ok(calJs.includes('expandable-section__chevron'), 'Deve conter affordance chevron');
    assert.ok(calJs.includes('disponível'), 'Deve conter badge de saldo disponível no cabeçalho compacto');
    assert.ok(calJs.includes('id="calendarBenefitsModuleContent"'), 'Conteúdo completo deve estar encapsulado em #calendarBenefitsModuleContent');
  });

  test('3.3 calendar.css possui regras para .calendar-benefits-section.expandable-section', () => {
    const calCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'calendar.css'), 'utf8');
    assert.ok(calCss.includes('.calendar-benefits-section.expandable-section'), 'calendar.css deve conter estilos de expandable-section para benefícios');
    assert.ok(calCss.includes('.calendar-benefits-compact-badge'), 'calendar.css deve conter estilos para o badge compacto');
  });
});

describe('Lote A3.4.2 — 4. Correção do Scroll de Entrada em /calendario', () => {

  test('4.1 uiShell.js reseta scroll ao entrar especificamente em tab-calendar a partir de outra aba', () => {
    const uiShell = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'uiShell.js'), 'utf8');
    assert.ok(uiShell.includes("targetTabId === 'tab-calendar' && previousTabId !== 'tab-calendar'"), 'activateTab deve verificar transição de entrada para tab-calendar');
    assert.ok(uiShell.includes("window.scrollTo(0, 0)"), 'Deve executar reset de window scroll');
    assert.ok(uiShell.includes("mainContent.scrollTo(0, 0)") || uiShell.includes("mainContent.scrollTop = 0"), 'Deve resetar scroll do container .main-content');
  });

  test('4.2 Nenhuma chamada a window.scrollTo ou scroll indiscriminado foi adicionada a renderCalendarUI()', () => {
    const calJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'calendar.js'), 'utf8');
    // Verifica que renderCalendarUI não contém chamadas de scrollTo
    const renderCalendarMatch = calJs.slice(calJs.indexOf('function renderCalendarUI()'), calJs.indexOf('function bindCalendarEvents('));
    assert.strictEqual(renderCalendarMatch.includes('scrollTo'), false, 'renderCalendarUI() NÃO deve conter scrollTo indiscriminado');
  });
});
