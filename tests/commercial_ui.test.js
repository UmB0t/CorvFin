/**
 * ==============================================================================
 * Testes Automatizados da Interface Comercial (Fase 5H)
 * Validação de UX Comercial, Comparativo de Planos, Plano Atual no Perfil,
 * Consumo de IA em Tempo Real, Estados de Limite e Fail-Closed.
 * ==============================================================================
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const plansModalJsCode = fs.readFileSync(path.join(__dirname, '../public/js/modules/commercialPlansModal.js'), 'utf8');
const profileJsCode = fs.readFileSync(path.join(__dirname, '../public/js/modules/profile.js'), 'utf8');
const aiAssistantJsCode = fs.readFileSync(path.join(__dirname, '../public/js/modules/aiAssistant.js'), 'utf8');
const appJsCode = fs.readFileSync(path.join(__dirname, '../public/js/core/app.js'), 'utf8');
const uiShellJsCode = fs.readFileSync(path.join(__dirname, '../public/js/core/uiShell.js'), 'utf8');
const indexHtmlContent = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const componentsCssContent = fs.readFileSync(path.join(__dirname, '../public/css/components.css'), 'utf8');
const mobileCssContent = fs.readFileSync(path.join(__dirname, '../public/css/mobile.css'), 'utf8');
const apiJsCode = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');

describe('Fase 5H — UX Comercial & Comparativo de Planos', () => {

  test('1. index.html deve declarar os dialogs plansModal e resourceLimitModal e script de planos', () => {
    assert.ok(indexHtmlContent.includes('id="plansModal"'), 'index.html deve conter dialog com id="plansModal"');
    assert.ok(indexHtmlContent.includes('id="resourceLimitModal"'), 'index.html deve conter dialog com id="resourceLimitModal"');
    assert.ok(indexHtmlContent.includes('id="profilePlanCard"'), 'index.html deve conter card id="profilePlanCard"');
    assert.ok(indexHtmlContent.includes('src="js/modules/commercialPlansModal.js"'), 'index.html deve incluir commercialPlansModal.js');
  });

  test('2. commercialPlansModal.js deve exportar funções públicas e formatar moeda e intervalos', () => {
    const sandbox = {
      window: {},
      document: {
        readyState: 'complete',
        querySelectorAll: () => [],
        getElementById: () => null,
        addEventListener: () => {}
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);

    assert.equal(typeof sandbox.window.openCommercialPlansModal, 'function');
    assert.equal(typeof sandbox.window.showResourceLimitModal, 'function');
    assert.equal(typeof sandbox.window.formatCentsToCurrency, 'function');
    assert.equal(typeof sandbox.window.formatBillingInterval, 'function');

    // Validação monetária sem ponto flutuante
    assert.equal(sandbox.window.formatCentsToCurrency(0), 'R$ 0,00');
    assert.ok(sandbox.window.formatCentsToCurrency(2990).includes('29,90'));
    assert.ok(sandbox.window.formatCentsToCurrency(9900).includes('99,00'));

    // Validação de intervalo de faturamento
    assert.equal(sandbox.window.formatBillingInterval('monthly'), '/mês');
    assert.equal(sandbox.window.formatBillingInterval('yearly'), '/ano');
    assert.equal(sandbox.window.formatBillingInterval('lifetime'), ' (pagamento único)');
  });

  test('3. profile.js deve implementar renderProfilePlanCard com distinção Plan vs RBAC', () => {
    assert.ok(profileJsCode.includes('function renderProfilePlanCard'), 'profile.js deve definir renderProfilePlanCard');
    assert.ok(profileJsCode.includes('PLAN_REFERENCE_INVALID'), 'profile.js deve tratar erro de referência inválida fail-closed');
    assert.ok(profileJsCode.includes('btnProfileOpenPlansModal'), 'profile.js deve incluir botão Ver Planos no card do plano atual');
    assert.ok(profileJsCode.includes('rbacRestricted'), 'profile.js deve checar restrições individuais RBAC separadamente do plano');
  });

  test('4. aiAssistant.js deve integrar aiCreditsBadge, refreshAiCredits e card de cota esgotada (429)', () => {
    assert.ok(aiAssistantJsCode.includes('aiCreditsBadge'), 'aiAssistant.js deve incluir elemento aiCreditsBadge no header');
    assert.ok(aiAssistantJsCode.includes('refreshAiCredits'), 'aiAssistant.js deve implementar refreshAiCredits');
    assert.ok(aiAssistantJsCode.includes('ai-quota-card'), 'aiAssistant.js deve renderizar ai-quota-card para erro 429');
    assert.ok(aiAssistantJsCode.includes('openCommercialPlansModal'), 'aiAssistant.js deve linkar para openCommercialPlansModal no card de cota esgotada');
  });

  test('5. app.js deve capturar 403 RESOURCE_LIMIT_REACHED e acionar showResourceLimitModal', () => {
    assert.ok(appJsCode.includes('RESOURCE_LIMIT_REACHED'), 'app.js deve tratar RESOURCE_LIMIT_REACHED');
    assert.ok(appJsCode.includes('showResourceLimitModal'), 'app.js deve invocar showResourceLimitModal');
    assert.ok(appJsCode.includes('revalidateStateFromServer'), 'app.js deve revalidar estado do servidor para evitar inconsistência otimista');
  });

  test('6. uiShell.js deve exportar getModuleCommercialAccess preservando hasTabPermission e getFirstAllowedTab', () => {
    assert.ok(uiShellJsCode.includes('function getModuleCommercialAccess'), 'uiShell.js deve implementar getModuleCommercialAccess');
    assert.ok(uiShellJsCode.includes('window.getModuleCommercialAccess = getModuleCommercialAccess'), 'uiShell.js deve exportar getModuleCommercialAccess');
    assert.ok(uiShellJsCode.includes('function hasTabPermission'), 'uiShell.js deve manter hasTabPermission');
    assert.ok(uiShellJsCode.includes('function getFirstAllowedTab'), 'uiShell.js deve manter getFirstAllowedTab');
    assert.ok(uiShellJsCode.includes('getFirstAllowedRouteForUser'), 'uiShell.js deve manter getFirstAllowedRouteForUser');
  });

  test('7. components.css e mobile.css devem conter estilos dedicados da Fase 5H', () => {
    assert.ok(componentsCssContent.includes('.ai-credits-badge'), 'components.css deve estilizar .ai-credits-badge');
    assert.ok(componentsCssContent.includes('.ai-quota-card'), 'components.css deve estilizar .ai-quota-card');
    assert.ok(componentsCssContent.includes('.plans-grid'), 'components.css deve estilizar .plans-grid');
    assert.ok(componentsCssContent.includes('.plan-card'), 'components.css deve estilizar .plan-card');
    assert.ok(componentsCssContent.includes('.plan-card--current'), 'components.css deve destacar .plan-card--current');

    assert.ok(mobileCssContent.includes('.plans-grid'), 'mobile.css deve conter regras responsivas para .plans-grid');
    assert.ok(mobileCssContent.includes('.ai-credits-badge'), 'mobile.css deve conter regras responsivas para .ai-credits-badge');
  });

  test('8. commercialPlansModal CTA informativo não deve sugerir alteração concluída ou self-service', () => {
    assert.ok(plansModalJsCode.includes('Assinaturas online em breve'), 'commercialPlansModal.js deve usar texto informativo aprovado');
    assert.ok(!plansModalJsCode.includes('/api/checkout'), 'commercialPlansModal.js não deve chamar endpoints de checkout inexistentes');
    assert.ok(!plansModalJsCode.includes('/api/subscription'), 'commercialPlansModal.js não deve simular contratação self-service');
  });

});

describe('Auditoria Final 5H — Bloqueio Real de Módulos & Catálogo de Planos Legados', () => {

  function createMockElement(tagName, id = '') {
    let _className = '';
    const classList = {
      _classes: new Set(),
      add(c) { this._classes.add(c); _className = Array.from(this._classes).join(' '); },
      remove(c) { this._classes.delete(c); _className = Array.from(this._classes).join(' '); },
      contains(c) { return this._classes.has(c); },
      toggle(c, force) {
        if (force !== undefined) {
          if (force) this.add(c); else this.remove(c);
          return force;
        }
        if (this.contains(c)) { this.remove(c); return false; }
        this.add(c); return true;
      }
    };

    const el = {
      tagName: tagName.toUpperCase(),
      id,
      get className() { return _className; },
      set className(val) {
        _className = String(val || '');
        classList._classes.clear();
        _className.split(/\s+/).filter(Boolean).forEach(c => classList._classes.add(c));
      },
      classList,
      style: {},
      hidden: false,
      attributes: {},
      children: [],
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k] || null; },
      removeAttribute(k) { delete this.attributes[k]; },
      appendChild(child) {
        if (!this.children.includes(child)) this.children.push(child);
        return child;
      },
      querySelector(sel) {
        if (sel.startsWith('.')) {
          const cls = sel.slice(1);
          return this.children.find(c => c.classList && c.classList.contains(cls)) || null;
        }
        if (sel.startsWith('#')) {
          const i = sel.slice(1);
          return this.children.find(c => c.id === i) || null;
        }
        return null;
      },
      querySelectorAll(sel) {
        if (sel.startsWith('.')) {
          const cls = sel.slice(1);
          return this.children.filter(c => c.classList && c.classList.contains(cls));
        }
        return [];
      },
      addEventListener() {},
      _innerHTML: '',
      set innerHTML(val) { this._innerHTML = String(val); },
      get innerHTML() { return this._innerHTML; }
    };
    return el;
  }

  function setupUiShellSandbox(user, commercialContext) {
    const elements = {};
    function getOrCreate(id, tag = 'div') {
      if (!elements[id]) {
        elements[id] = createMockElement(tag, id);
      }
      return elements[id];
    }

    const sandbox = {
      window: {
        addEventListener: () => {},
        removeEventListener: () => {},
        location: { pathname: '/dashboard' },
        history: { pushState: () => {}, replaceState: () => {} },
        _cachedCommercialContext: commercialContext
      },
      document: {
        readyState: 'complete',
        createElement: (tag) => createMockElement(tag),
        addEventListener: () => {},
        getElementById: (id) => getOrCreate(id),
        querySelector: (sel) => {
          if (sel.startsWith('#')) return getOrCreate(sel.slice(1));
          return null;
        },
        querySelectorAll: () => []
      },
      $: (sel) => {
        if (sel.startsWith('#')) return getOrCreate(sel.slice(1));
        return null;
      },
      $$: () => [],
      localStorage: {
        getItem: (k) => (k === 'user_data' ? JSON.stringify(user) : null),
        setItem: () => {}
      },
      getState: () => ({ theme: 'dark', preferences: {} }),
      saveState: () => Promise.resolve(true),
      API: {
        getUser: () => user,
        getCommercialContext: () => Promise.resolve({ success: true, data: commercialContext }),
        getBasePath: () => ''
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = Object.assign(sandbox.window, sandbox);

    vm.createContext(sandbox);
    vm.runInContext(uiShellJsCode, sandbox);
    return sandbox;
  }

  test('1. planAllowed=false + permissionAllowed=true => PLAN_DENIED + CTA Ver Planos', () => {
    const user = { id: 'u_user', is_admin: false, permissions: { investimentos: true } };
    const commercialContext = {
      access: {
        investimentos: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false }
      }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);

    // Cria o container da aba com um filho interno de conteúdo
    const container = sandbox.$('#tab-investments');
    const childEl = createMockElement('div', 'investmentsRealContent');
    container.appendChild(childEl);

    const access = sandbox.window.getModuleCommercialAccess('tab-investments', user);
    assert.equal(access.planAllowed, false, 'planAllowed deve ser false');
    assert.equal(access.permissionAllowed, true, 'permissionAllowed deve ser true');
    assert.equal(access.effectiveAllowed, false, 'effectiveAllowed deve ser false');

    const check = sandbox.window.checkModuleAccess('tab-investments');
    assert.equal(check.allowed, false, 'checkModuleAccess deve retornar allowed: false');
    assert.equal(check.reason, 'PLAN_DENIED', 'reason deve ser PLAN_DENIED');

    // Filho real deve ser ocultado para não vazar conteúdo
    assert.equal(childEl.getAttribute('data-access-hidden'), 'true');
    assert.equal(childEl.style.display, 'none');

    // Overlay deve conter mensagem e CTA "Ver Planos"
    const overlay = container.querySelector('.access-denied-screen-overlay');
    assert.ok(overlay, 'Overlay de acesso negado deve ter sido injetado');
    assert.ok(overlay.classList.contains('plan-denied'), 'Overlay deve possuir classe plan-denied');
    assert.ok(overlay.innerHTML.includes('Este recurso não está disponível no seu plano.'), 'Deve exibir mensagem amigável de plano');
    assert.ok(overlay.innerHTML.includes('Ver Planos'), 'Deve exibir CTA Ver Planos');
  });

  test('2. planAllowed=true + permissionAllowed=false => RBAC_DENIED => sem CTA comercial', () => {
    const user = { id: 'u_restricted', is_admin: false, permissions: { investimentos: false } };
    const commercialContext = {
      access: {
        investimentos: { planAllowed: true, permissionAllowed: false, effectiveAllowed: false }
      }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);

    const container = sandbox.$('#tab-investments');
    const childEl = createMockElement('div', 'investmentsRealContent');
    container.appendChild(childEl);

    const access = sandbox.window.getModuleCommercialAccess('tab-investments', user);
    assert.equal(access.planAllowed, true, 'planAllowed deve ser true');
    assert.equal(access.permissionAllowed, false, 'permissionAllowed deve ser false');
    assert.equal(access.effectiveAllowed, false, 'effectiveAllowed deve ser false');

    const check = sandbox.window.checkModuleAccess('tab-investments');
    assert.equal(check.allowed, false, 'checkModuleAccess deve retornar allowed: false');
    assert.equal(check.reason, 'RBAC_DENIED', 'reason deve ser RBAC_DENIED');

    assert.equal(childEl.getAttribute('data-access-hidden'), 'true');
    assert.equal(childEl.style.display, 'none');

    const overlay = container.querySelector('.access-denied-screen-overlay');
    assert.ok(overlay, 'Overlay de acesso negado deve existir');
    assert.ok(overlay.classList.contains('rbac-denied'), 'Overlay deve possuir classe rbac-denied');
    assert.ok(overlay.innerHTML.includes('Seu acesso a este recurso está restrito.'), 'Deve exibir mensagem restrita neutra');
    assert.ok(!overlay.innerHTML.includes('Ver Planos'), 'NÃO deve exibir CTA comercial');
    assert.ok(!overlay.innerHTML.includes('upgrade'), 'NÃO deve sugerir upgrade de plano');
  });

  test('3. admin + planAllowed=false => continua PLAN_DENIED (admin sem bypass comercial)', () => {
    const adminUser = { id: 'u_admin', is_admin: true, permissions: {} };
    const commercialContext = {
      access: {
        investimentos: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false }
      }
    };
    const sandbox = setupUiShellSandbox(adminUser, commercialContext);

    const container = sandbox.$('#tab-investments');
    const childEl = createMockElement('div', 'investmentsRealContent');
    container.appendChild(childEl);

    const access = sandbox.window.getModuleCommercialAccess('tab-investments', adminUser);
    assert.equal(access.planAllowed, false, 'Admin continua sujeito a planAllowed false');
    assert.equal(access.permissionAllowed, true, 'Admin possui permissão administrativa');
    assert.equal(access.effectiveAllowed, false, 'Admin NÃO possui bypass comercial');

    const check = sandbox.window.checkModuleAccess('tab-investments');
    assert.equal(check.allowed, false, 'checkModuleAccess deve bloquear o admin');
    assert.equal(check.reason, 'PLAN_DENIED', 'Admin deve receber PLAN_DENIED');

    const overlay = container.querySelector('.access-denied-screen-overlay');
    assert.ok(overlay.innerHTML.includes('Este recurso não está disponível no seu plano.'), 'Admin deve visualizar mensagem de plano');
    assert.ok(overlay.innerHTML.includes('Ver Planos'), 'Admin deve visualizar CTA Ver Planos');
  });

  test('4. acesso direto a rota/hash de módulo negado => não contorna bloqueio', () => {
    const user = { id: 'u_user', is_admin: false, permissions: { investimentos: true } };
    const commercialContext = {
      access: {
        investimentos: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false }
      }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);

    const container = sandbox.$('#tab-investments');
    const childEl = createMockElement('div', 'investmentsRealContent');
    container.appendChild(childEl);

    // Simula navegação direta via activateTab('tab-investments')
    sandbox.window.activateTab('tab-investments', false);

    // Conteúdo protegido não foi exposto
    assert.equal(childEl.getAttribute('data-access-hidden'), 'true');
    assert.equal(childEl.style.display, 'none');

    // Overlay está ativo e visível no container da aba
    const overlay = container.querySelector('.access-denied-screen-overlay');
    assert.ok(overlay, 'Overlay de acesso negado deve estar presente');
    assert.equal(overlay.style.display !== 'none', true, 'Overlay deve estar visível');
  });

  test('5. plano atual inactive => modal identifica como legado e catálogo não oferece para contratação', async () => {
    const currentLegacyPlan = {
      id: 'plan_corvfin_legacy',
      slug: 'corvfin-legacy',
      name: 'CorvFin Legacy',
      description: 'Plano original de fundadores',
      status: 'inactive'
    };
    const activeCatalog = [
      { id: 'plan_starter', slug: 'starter', name: 'Starter', pricing: { cents: 1990, billingInterval: 'monthly' } },
      { id: 'plan_pro', slug: 'pro', name: 'Pro', pricing: { cents: 4990, billingInterval: 'monthly' } }
    ];

    const elements = {};
    function getEl(id, tag = 'div') {
      if (!elements[id]) elements[id] = createMockElement(tag, id);
      return elements[id];
    }

    const sandbox = {
      window: {},
      document: {
        readyState: 'complete',
        getElementById: (id) => getEl(id),
        querySelectorAll: () => []
      },
      API: {
        getCommercialContext: () => Promise.resolve({
          success: true,
          data: { plan: currentLegacyPlan, access: {} }
        }),
        getActivePlans: () => Promise.resolve({
          success: true,
          data: activeCatalog
        })
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);

    await sandbox.window.openCommercialPlansModal();

    const banner = getEl('currentLegacyPlanBanner');
    const grid = getEl('plansGridContainer');

    // Banner de plano legado deve estar ativo
    assert.equal(banner.style.display, 'block', 'Banner de plano legado deve estar visível');
    assert.ok(banner.innerHTML.includes('CorvFin Legacy'), 'Banner deve citar nome do plano CorvFin Legacy');
    assert.ok(banner.innerHTML.includes('Legado / Não disponível para novas assinaturas'), 'Banner deve destacar badge de plano legado');

    // Grid deve listar somente planos ativos do catálogo
    assert.ok(grid.innerHTML.includes('Starter'), 'Catálogo ativo deve conter Starter');
    assert.ok(grid.innerHTML.includes('Pro'), 'Catálogo ativo deve conter Pro');
    assert.ok(!grid.innerHTML.includes('CorvFin Legacy'), 'Catálogo de contratação NÃO deve incluir o plano inactive');
    assert.ok(!grid.innerHTML.includes('plan-card--current'), 'Nenhum plano ativo deve ser marcado como plano atual quando usuário for legado');
  });

  test('6. plano atual archived => mesmo princípio de legado', async () => {
    const currentArchivedPlan = {
      id: 'plan_v1_archived',
      slug: 'v1-archived',
      name: 'CorvFin Vintage 2024',
      description: 'Plano descontinuado',
      status: 'archived'
    };
    const activeCatalog = [
      { id: 'plan_pro', slug: 'pro', name: 'Pro', pricing: { cents: 4990, billingInterval: 'monthly' } }
    ];

    const elements = {};
    function getEl(id, tag = 'div') {
      if (!elements[id]) elements[id] = createMockElement(tag, id);
      return elements[id];
    }

    const sandbox = {
      window: {},
      document: {
        readyState: 'complete',
        getElementById: (id) => getEl(id),
        querySelectorAll: () => []
      },
      API: {
        getCommercialContext: () => Promise.resolve({
          success: true,
          data: { plan: currentArchivedPlan, access: {} }
        }),
        getActivePlans: () => Promise.resolve({
          success: true,
          data: activeCatalog
        })
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);

    await sandbox.window.openCommercialPlansModal();

    const banner = getEl('currentLegacyPlanBanner');
    const grid = getEl('plansGridContainer');

    assert.equal(banner.style.display, 'block', 'Banner de plano archived deve estar visível');
    assert.ok(banner.innerHTML.includes('CorvFin Vintage 2024'), 'Banner deve citar nome do plano arquivado');
    assert.ok(banner.innerHTML.includes('Legado / Não disponível para novas assinaturas'), 'Banner deve ter aviso de legado');
    assert.ok(!grid.innerHTML.includes('CorvFin Vintage 2024'), 'Catálogo não deve conter o plano arquivado');
  });

  test('7. plano active atual => continua destacado normalmente no catálogo ativo', async () => {
    const currentActivePlan = {
      id: 'plan_pro',
      slug: 'pro',
      name: 'Pro',
      description: 'Plano Profissional',
      status: 'active'
    };
    const activeCatalog = [
      { id: 'plan_starter', slug: 'starter', name: 'Starter', pricing: { cents: 1990, billingInterval: 'monthly' } },
      { id: 'plan_pro', slug: 'pro', name: 'Pro', pricing: { cents: 4990, billingInterval: 'monthly' } }
    ];

    const elements = {};
    function getEl(id, tag = 'div') {
      if (!elements[id]) elements[id] = createMockElement(tag, id);
      return elements[id];
    }

    const sandbox = {
      window: {},
      document: {
        readyState: 'complete',
        getElementById: (id) => getEl(id),
        querySelectorAll: () => []
      },
      API: {
        getCommercialContext: () => Promise.resolve({
          success: true,
          data: { plan: currentActivePlan, access: {} }
        }),
        getActivePlans: () => Promise.resolve({
          success: true,
          data: activeCatalog
        })
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);

    await sandbox.window.openCommercialPlansModal();

    const banner = getEl('currentLegacyPlanBanner');
    const grid = getEl('plansGridContainer');

    assert.equal(banner.style.display, 'none', 'Banner de legado deve estar oculto para plano active');
    assert.ok(grid.innerHTML.includes('plan-card--current'), 'Plano ativo atual deve ter classe de destaque');
    assert.ok(grid.innerHTML.includes('Seu Plano Atual'), 'Plano ativo atual deve conter badge Seu Plano Atual');
    assert.ok(grid.innerHTML.includes('disabled') && grid.innerHTML.includes('Plano Atual'), 'Botão do plano atual deve ser desabilitado');
  });

});

describe('Fase 5H — Correção Profile Plan Card & Deduplicação de Requests', () => {

  function createProfileMockElement(tag, id = '') {
    return {
      tagName: tag.toUpperCase(),
      id,
      innerHTML: '',
      textContent: '',
      style: {},
      hidden: false,
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = v; },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this.attributes[k]; },
      hasAttribute(k) { return k in this.attributes; },
      listeners: {},
      addEventListener(evt, cb) {
        this.listeners[evt] = this.listeners[evt] || [];
        this.listeners[evt].push(cb);
      },
      click() {
        if (this.listeners['click']) {
          this.listeners['click'].forEach(cb => cb({ preventDefault: () => {} }));
        }
      },
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); }
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      closest: () => null
    };
  }

  function setupProfileTestSandbox(commercialContextResponse, options = {}) {
    const elements = {};
    function getOrCreateEl(id, tag = 'div') {
      if (!elements[id]) {
        elements[id] = createProfileMockElement(tag, id);
      }
      return elements[id];
    }

    const planCard = getOrCreateEl('profilePlanCard');

    const sandbox = {
      window: {},
      document: {
        readyState: 'complete',
        getElementById: (id) => getOrCreateEl(id),
        querySelector: (sel) => {
          if (sel && sel.startsWith('#')) return getOrCreateEl(sel.slice(1));
          return null;
        },
        querySelectorAll: () => [],
        addEventListener: () => {}
      },
      $: (sel) => {
        if (sel && sel.startsWith('#')) return getOrCreateEl(sel.slice(1));
        return null;
      },
      $$: () => [],
      escapeHtml: (s) => (s ? String(s).replace(/[&<>"']/g, '') : ''),
      getState: () => ({
        profile: { name: 'Usuário Ultra' },
        categories: [],
        destinations: [],
        budgets: {},
        fixed: [],
        variable: [],
        extras: [],
        assets: []
      }),
      isStateHydrated: () => true,
      API: {
        getCommercialContext: (opts) => {
          if (options.onGetCommercialContext) {
            return options.onGetCommercialContext(opts);
          }
          if (commercialContextResponse instanceof Error) {
            return Promise.reject(commercialContextResponse);
          }
          return Promise.resolve(commercialContextResponse);
        }
      },
      notify: () => {},
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = Object.assign(sandbox.window, sandbox);

    vm.createContext(sandbox);
    vm.runInContext(profileJsCode, sandbox);
    return { sandbox, planCard };
  }

  // 1. profile.js realmente executa renderProfilePlanCard ao abrir Perfil
  test('1. profile.js realmente executa renderProfilePlanCard ao abrir Perfil', async () => {
    const payload = {
      success: true,
      plan: {
        id: 'plan_df367e0b3f0daa15',
        name: 'CorvFin Ultra - Per Year',
        slug: 'corvfin-ultra-per-year',
        status: 'active',
        pricing: { amountCents: 19990, currency: 'BRL', interval: 'year' }
      }
    };
    const { sandbox, planCard } = setupProfileTestSandbox(payload);

    assert.equal(typeof sandbox.window.renderProfilePlanCard, 'function', 'renderProfilePlanCard deve ser exportada no window');
    assert.equal(typeof sandbox.window.renderProfile, 'function', 'renderProfile deve ser exportada no window');

    // Executa renderProfile (chamada que a UI faz ao abrir /perfil)
    sandbox.window.renderProfile();
    await new Promise(resolve => setTimeout(resolve, 50));

    assert.ok(!planCard.innerHTML.includes('Carregando informações do seu plano...'), 'Loading deve ser removido após renderProfile');
    assert.ok(planCard.innerHTML.includes('CorvFin Ultra - Per Year'), 'Card deve renderizar nome do plano');
  });

  // 2. commercial-context 200: remove loading e renderiza nome real do plano, status e preço
  test('2. commercial-context 200 => remove loading e renderiza nome real, status e preço R$ 199,90 / ano', async () => {
    const realPayload = {
      success: true,
      plan: {
        id: 'plan_df367e0b3f0daa15',
        name: 'CorvFin Ultra - Per Year',
        slug: 'corvfin-ultra-per-year',
        status: 'active',
        pricing: {
          amountCents: 19990,
          currency: 'BRL',
          interval: 'year'
        }
      },
      access: {
        compras: { planAllowed: true, permissionAllowed: false, effectiveAllowed: false },
        simulacao: { planAllowed: true, permissionAllowed: false, effectiveAllowed: false }
      },
      usage: {
        ai: {
          enabled: true,
          limit: null,
          used: 0,
          remaining: null,
          unlimited: true
        }
      }
    };
    const { sandbox, planCard } = setupProfileTestSandbox(realPayload);

    await sandbox.window.renderProfilePlanCard();

    assert.ok(!planCard.innerHTML.includes('Carregando informações do seu plano...'), 'Loading não deve permanecer');
    assert.ok(planCard.innerHTML.includes('CorvFin Ultra - Per Year'), 'Deve conter nome exato do plano');
    assert.ok(planCard.innerHTML.includes('Ativo'), 'Status deve ser Ativo');
    assert.ok(planCard.innerHTML.includes('R$ 199,90'), 'Preço deve ser formatado para R$ 199,90');
    assert.ok(planCard.innerHTML.includes('/ ano'), 'Intervalo deve ser / ano');
    assert.ok(planCard.innerHTML.includes('Nota sobre Permissões'), 'Deve exibir nota informativa sobre restrições administrativas RBAC');
  });

  // 3. plano unlimited: mostra "IA ilimitada"
  test('3. plano unlimited => mostra "IA ilimitada"', async () => {
    const payload = {
      success: true,
      plan: {
        id: 'plan_ultra',
        name: 'CorvFin Ultra',
        status: 'active',
        pricing: { amountCents: 19990, interval: 'year' }
      },
      usage: {
        ai: { enabled: true, unlimited: true }
      }
    };
    const { sandbox, planCard } = setupProfileTestSandbox(payload);

    await sandbox.window.renderProfilePlanCard();

    assert.ok(planCard.innerHTML.includes('IA ilimitada'), 'Deve exibir texto "IA ilimitada" para quota unlimited');
  });

  // 4. erro na API: loading é removido e estado de erro amigável aparece
  test('4. erro na API => loading é removido e estado de erro amigável aparece com retry', async () => {
    const { sandbox, planCard } = setupProfileTestSandbox(new Error('Network error 500'));

    await sandbox.window.renderProfilePlanCard();

    assert.ok(!planCard.innerHTML.includes('Carregando informações do seu plano...'), 'Loading deve ser removido');
    assert.ok(planCard.innerHTML.includes('Erro ao carregar plano') || planCard.innerHTML.includes('Não foi possível carregar as informações do plano.'), 'Deve exibir erro amigável');
    assert.ok(planCard.innerHTML.includes('btnRetryProfilePlan'), 'Deve conter botão de retry para o usuário');
  });

  // 5. PLAN_REFERENCE_INVALID: estado específico, não loading eterno
  test('5. PLAN_REFERENCE_INVALID => estado específico fail-closed, não loading eterno', async () => {
    const invalidPlanPayload = {
      success: false,
      error: 'PLAN_REFERENCE_INVALID',
      message: 'O plano vinculado à sua conta não foi encontrado no sistema.'
    };
    const { sandbox, planCard } = setupProfileTestSandbox(invalidPlanPayload);

    await sandbox.window.renderProfilePlanCard();

    assert.ok(!planCard.innerHTML.includes('Carregando informações do seu plano...'), 'Loading não deve permanecer');
    assert.ok(planCard.innerHTML.includes('Plano — Referência Inválida'), 'Deve exibir título de referência inválida');
    assert.ok(planCard.innerHTML.includes('regularizar seu cadastro comercial'), 'Deve orientar a regularização');
  });

  // 6. duas chamadas simultâneas para contexto comercial: reutilizam a mesma Promise/request
  test('6. duas chamadas simultâneas para contexto comercial => reutilizam a mesma Promise/request', async () => {
    let rawFetchCalls = 0;
    const fakeFetch = () => {
      rawFetchCalls++;
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({
              success: true,
              data: { plan: { id: 'p1', name: 'Plano 1' } }
            })
          });
        }, 15);
      });
    };

    const sandbox = {
      window: {},
      document: {
        querySelector: () => null
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      fetch: fakeFetch,
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(apiJsCode, sandbox);

    // Dispara duas chamadas simultâneas
    const [res1, res2] = await Promise.all([
      sandbox.window.API.getCommercialContext(),
      sandbox.window.API.getCommercialContext()
    ]);

    assert.equal(rawFetchCalls, 1, 'Deve realizar exatamente 1 chamada HTTP para requisições concorrentes');
    assert.equal(res1, res2, 'Ambas as chamadas devem resolver com a mesma resposta');
    assert.equal(res1.success, true);
  });

  // 7. abrir Perfil após contexto já carregado: não gera request redundante desnecessária
  test('7. abrir Perfil após contexto já carregado => não gera request redundante desnecessária', async () => {
    let rawFetchCalls = 0;
    const fakeFetch = () => {
      rawFetchCalls++;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: { plan: { id: 'p1', name: 'CorvFin Cached' } }
        })
      });
    };

    const sandbox = {
      window: {},
      document: {
        querySelector: () => null
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      fetch: fakeFetch,
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(apiJsCode, sandbox);

    // Primeira chamada (boot/cache)
    await sandbox.window.API.getCommercialContext();
    assert.equal(rawFetchCalls, 1, 'Primeira chamada realiza fetch');

    // Segunda chamada ao navegar para /perfil
    const secondRes = await sandbox.window.API.getCommercialContext();
    assert.equal(rawFetchCalls, 1, 'Segunda chamada deve reutilizar cache sem novo fetch');
    assert.equal(secondRes.success, true);
  });

  // 8. forceRefresh após operação tarifável: executa nova request e atualiza saldo
  test('8. forceRefresh após operação tarifável => executa nova request e atualiza saldo', async () => {
    let rawFetchCalls = 0;
    let creditsRemaining = 10;
    const fakeFetch = () => {
      rawFetchCalls++;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          success: true,
          data: {
            plan: { id: 'p1', name: 'Pro' },
            usage: { ai: { enabled: true, remaining: creditsRemaining, limit: 10 } }
          }
        })
      });
    };

    const sandbox = {
      window: {},
      document: {
        querySelector: () => null
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      fetch: fakeFetch,
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(apiJsCode, sandbox);

    const first = await sandbox.window.API.getCommercialContext();
    assert.equal(first.data.usage.ai.remaining, 10);
    assert.equal(rawFetchCalls, 1);

    // Simula consumo de crédito em operação tarifável
    creditsRemaining = 9;

    // Chamada com forceRefresh: true
    const refreshed = await sandbox.window.API.getCommercialContext({ forceRefresh: true });
    assert.equal(rawFetchCalls, 2, 'forceRefresh: true deve disparar nova requisição');
    assert.equal(refreshed.data.usage.ai.remaining, 9, 'Saldo retornado deve ser atualizado');
  });

  // 9. Modal "Ver Planos" continua funcionando
  test('9. Modal "Ver Planos" continua funcionando e formata preços com amountCents', async () => {
    const catalog = [
      { id: 'p_free', name: 'Free', pricing: { amountCents: 0, interval: 'month' } },
      { id: 'p_ultra', name: 'CorvFin Ultra', pricing: { amountCents: 19990, interval: 'year' } }
    ];

    const elements = {};
    function getEl(id, tag = 'div') {
      if (!elements[id]) elements[id] = createProfileMockElement(tag, id);
      return elements[id];
    }

    const sandbox = {
      window: {},
      document: {
        readyState: 'complete',
        getElementById: (id) => getEl(id),
        querySelectorAll: () => []
      },
      API: {
        getCommercialContext: () => Promise.resolve({
          success: true,
          data: { plan: catalog[1], access: {} }
        }),
        getActivePlans: () => Promise.resolve({
          success: true,
          data: catalog
        })
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);

    await sandbox.window.openCommercialPlansModal();

    const grid = getEl('plansGridContainer');
    assert.ok(grid.innerHTML.includes('CorvFin Ultra'), 'Modal deve renderizar catálogo');
    assert.ok(grid.innerHTML.includes('199,90'), 'Modal deve formatar amountCents');
    assert.ok(grid.innerHTML.includes('/ano'), 'Modal deve formatar intervalo year');
  });

  // 10. badge do Assistente continua funcionando
  test('10. badge do Assistente continua funcionando e renderiza quota corretamente', async () => {
    const badgeEl = createProfileMockElement('span', 'aiCreditsBadge');
    const panelEl = createProfileMockElement('div', 'aiAssistantPanel');

    const sandbox = {
      window: {},
      document: {
        readyState: 'complete',
        getElementById: (id) => {
          if (id === 'aiCreditsBadge') return badgeEl;
          if (id === 'aiAssistantPanel') return panelEl;
          return createProfileMockElement('div', id);
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {}
      },
      setTimeout,
      clearTimeout,
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      API: {
        getCommercialContext: () => Promise.resolve({
          success: true,
          data: {
            usage: {
              ai: { enabled: true, limit: 20, remaining: 15, used: 5 }
            }
          }
        })
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(aiAssistantJsCode, sandbox);

    await sandbox.window.refreshAiCredits();

    assert.ok(badgeEl.textContent.includes('15/20 hoje'), 'Badge deve mostrar saldo restante/limite');
  });

});


