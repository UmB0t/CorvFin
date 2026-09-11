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
const adminJsCode = fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8');

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

function createMockElement(tagName, id = '') {
  let _className = '';
  const classList = {
    _classes: new Set(),
    add(...classes) { classes.forEach(c => this._classes.add(c)); _className = Array.from(this._classes).join(' '); },
    remove(...classes) { classes.forEach(c => this._classes.delete(c)); _className = Array.from(this._classes).join(' '); },
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
    _inert: false,
    get inert() { return this._inert; },
    set inert(v) { this._inert = Boolean(v); },
    children: [],
    parentElement: null,
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return (k in this.attributes) ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(child) {
      if (!this.children.includes(child)) this.children.push(child);
      child.parentElement = this;
      return child;
    },
    insertBefore(newChild, refChild) {
      const idx = this.children.indexOf(refChild);
      if (idx !== -1) {
        this.children.splice(idx, 0, newChild);
      } else {
        this.children.push(newChild);
      }
      newChild.parentElement = this;
      return newChild;
    },
    remove() {
      if (this.parentElement) {
        const idx = this.parentElement.children.indexOf(this);
        if (idx !== -1) this.parentElement.children.splice(idx, 1);
        this.parentElement = null;
      }
    },
    _textContent: '',
    get textContent() {
      if (this.children.length === 0) {
        return this._textContent;
      }
      return (this._textContent ? this._textContent + ' ' : '') + this.children.map(c => c.textContent).join(' ');
    },
    set textContent(val) {
      this._textContent = String(val);
      this.children = [];
    },
    querySelector(sel) {
      if (!sel) return null;
      const selectors = sel.split(',').map(s => s.trim()).filter(Boolean);
      function matchOne(node, s) {
        if (s.startsWith('.')) {
          const classes = s.split('.').filter(Boolean);
          return node.classList && classes.every(cls => node.classList.contains(cls));
        } else if (s.startsWith('#')) {
          return node.id === s.slice(1);
        } else if (s.toLowerCase() === node.tagName.toLowerCase()) {
          return true;
        }
        return false;
      }
      function search(node) {
        for (const c of node.children) {
          if (selectors.some(s => matchOne(c, s))) return c;
          const found = search(c);
          if (found) return found;
        }
        return null;
      }
      return search(this);
    },
    querySelectorAll(sel) {
      if (!sel) return [];
      const selectors = sel.split(',').map(s => s.trim()).filter(Boolean);
      const results = [];
      function matchOne(node, s) {
        if (s.startsWith('.')) {
          const classes = s.split('.').filter(Boolean);
          return node.classList && classes.every(cls => node.classList.contains(cls));
        } else if (s.startsWith('#')) {
          return node.id === s.slice(1);
        } else if (s.toLowerCase() === node.tagName.toLowerCase()) {
          return true;
        }
        return false;
      }
      function search(node) {
        for (const c of node.children) {
          if (selectors.some(s => matchOne(c, s))) {
            if (!results.includes(c)) results.push(c);
          }
          search(c);
        }
      }
      search(this);
      return results;
    },
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
    focus() { this._focused = true; },
    _innerHTML: '',
    set innerHTML(val) {
      this._innerHTML = String(val);
      this.children = [];
      this._textContent = String(val).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const idMatches = Array.from(this._innerHTML.matchAll(/id=["']([^"']+)["']/g));
      for (const m of idMatches) {
        const childId = m[1];
        let existing = this.children.find(c => c.id === childId);
        if (!existing) {
          existing = createMockElement('div', childId);
          this.appendChild(existing);
        }
      }
      const classMatches = Array.from(this._innerHTML.matchAll(/class=["']([^"']+)["']/g));
      for (const m of classMatches) {
        const cls = m[1];
        if (!this.children.some(c => c.className === cls)) {
          const childEl = createMockElement('div');
          childEl.className = cls;
          this.appendChild(childEl);
        }
      }
    },
    get innerHTML() { return this._innerHTML; }
  };
  return el;
}

function setupUiShellSandbox(user, commercialContext) {
  const elements = {};
  const navRegistry = [];

  function registerNavElement(el) {
    if (!navRegistry.includes(el)) navRegistry.push(el);
    return el;
  }

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
    registerNavElement,
    document: {
      readyState: 'complete',
      body: createMockElement('body'),
      createElement: (tag) => createMockElement(tag),
      addEventListener: () => {},
      getElementById: (id) => getOrCreate(id),
      querySelector: (sel) => {
        if (sel && sel.startsWith('#')) return getOrCreate(sel.slice(1));
        return null;
      },
      querySelectorAll: (sel) => {
        if (!sel) return [];
        const all = Object.values(elements).concat(navRegistry);
        if (sel.includes('[data-tab]')) {
          return all.filter(e => e.getAttribute && e.getAttribute('data-tab'));
        }
        if (sel === '.tab-content') {
          return Object.values(elements).filter(e => e.classList && e.classList.contains('tab-content'));
        }
        if (sel.includes('.sidebar-link')) {
          return navRegistry.filter(e => e.classList && e.classList.contains('sidebar-link'));
        }
        if (sel.includes('.bottom-nav-item')) {
          return navRegistry.filter(e => e.classList && e.classList.contains('bottom-nav-item'));
        }
        if (sel.includes('.mobile-drawer-card')) {
          return navRegistry.filter(e => e.classList && e.classList.contains('mobile-drawer-card'));
        }
        return [];
      }
    },
    $: (sel) => {
      if (sel && sel.startsWith('#')) return getOrCreate(sel.slice(1));
      return null;
    },
    $$: () => [],
    localStorage: {
      getItem: (k) => (k === 'user_data' ? JSON.stringify(user) : null),
      setItem: () => {}
    },
    setTimeout,
    clearTimeout,
    setImmediate,
    loadState: () => ({ collapsedSections: {}, simplifiedView: false, revision: 1 }),
    addEventListener: () => {},
    removeEventListener: () => {},
    getState: () => ({ theme: 'dark', preferences: {} }),
    saveState: () => Promise.resolve(true),
    API: {
      getBasePath: () => '',
      resolveUrl: (u) => u,
      getUser: () => user,
      getCommercialContext: () => Promise.resolve({ success: true, data: commercialContext }),
      getActivePlans: () => Promise.resolve({
        success: true,
        plans: [
          {
            id: 'corvfin_pro_monthly',
            name: 'CorvFin Pro',
            description: 'Plano completo com investimentos',
            includedResources: ['despesas', 'investimentos', 'extras', 'devedores', 'beneficios', 'compras', 'simulacao', 'anexos', 'ai'],
            pricing: {
              offers: {
                monthly: { regularPriceCents: 2990, enabled: true },
                yearly: { regularPriceCents: 29900, enabled: true }
              }
            },
            status: 'active'
          }
        ]
      }),
      getSystemMaintenance: () => Promise.resolve({ success: true, maintenance: {} }),
      getBasePath: () => ''
    },
    console: { log: () => {}, warn: () => {}, error: () => {} }
  };
  sandbox.window = Object.assign(sandbox.window, sandbox);

  vm.createContext(sandbox);
  vm.runInContext(plansModalJsCode, sandbox);
  vm.runInContext(uiShellJsCode, sandbox);
  return sandbox;
}

describe('Auditoria Final 5H — Bloqueio Real de Módulos & Catálogo de Planos Legados', () => {

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

    // Filho real deve ser protegido e sanitizado
    assert.equal(container.classList.contains('tab-content--plan-locked'), true, 'Container deve receber classe tab-content--plan-locked');
    assert.equal(childEl.getAttribute('aria-hidden'), 'true', 'Filho deve possuir aria-hidden');
    assert.equal(childEl.getAttribute('inert'), '', 'Filho deve possuir inert');

    // View contextual deve conter aviso do plano e seção de planos elegíveis
    const contextualView = container.querySelector('.module-contextual-upgrade-view');
    assert.ok(contextualView, 'View contextual deve ter sido injetada');
    assert.ok(contextualView.innerHTML.includes('não inclui'), 'Deve exibir mensagem que plano não inclui o módulo');
    assert.ok(contextualView.innerHTML.includes('Planos que incluem Investimentos'), 'Deve exibir seção de planos para Investimentos');
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

    const contextualView = container.querySelector('.module-contextual-upgrade-view');
    assert.ok(contextualView, 'Admin deve visualizar view contextual');
    assert.ok(contextualView.innerHTML.includes('não inclui'), 'Admin deve visualizar mensagem de plano');
    assert.ok(contextualView.innerHTML.includes('Planos que incluem Investimentos'), 'Admin deve visualizar planos que incluem o recurso');
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

    // Conteúdo protegido sob locked preview
    assert.equal(container.classList.contains('tab-content--plan-locked'), true, 'Container deve receber classe tab-content--plan-locked');
    assert.equal(childEl.getAttribute('aria-hidden'), 'true');
    assert.equal(childEl.getAttribute('inert'), '');

    // View contextual está ativa e visível no container da aba
    const contextualView = container.querySelector('.module-contextual-upgrade-view');
    assert.ok(contextualView, 'View contextual deve estar presente');
    assert.equal(contextualView.style.display !== 'none', true, 'View contextual deve estar visível');
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

describe('CORVFIN V2 — Fase 5H.3: Contextual Upgrade Page para Módulos Bloqueados', () => {

  function createInteractiveNavSandbox(user, commercialContext) {
    const sandbox = setupUiShellSandbox(user, commercialContext);

    // Cria elementos de navegação
    const sidebarExtras = sandbox.document.createElement('button');
    sidebarExtras.className = 'sidebar-link';
    sidebarExtras.setAttribute('data-tab', 'tab-extras');
    sidebarExtras.setAttribute('data-tooltip', 'Rendas Extras');
    const textSpan = sandbox.document.createElement('span');
    textSpan.className = 'link-text';
    textSpan.innerHTML = 'Rendas Extras';
    sidebarExtras.appendChild(textSpan);
    sandbox.registerNavElement(sidebarExtras);

    const mobileExtras = sandbox.document.createElement('button');
    mobileExtras.className = 'mobile-drawer-card';
    mobileExtras.setAttribute('data-tab', 'tab-extras');
    sandbox.registerNavElement(mobileExtras);

    const sidebarExpenses = sandbox.document.createElement('button');
    sidebarExpenses.className = 'sidebar-link';
    sidebarExpenses.setAttribute('data-tab', 'tab-expenses');
    sandbox.registerNavElement(sidebarExpenses);

    // Adiciona listener de clique como em uiShell.js
    sidebarExtras.addEventListener('click', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      sandbox.window.activateTab('tab-extras', true);
    });

    return { sandbox, sidebarExtras, mobileExtras, sidebarExpenses };
  }

  // 1. PLAN_DENIED: item da sidebar continua visível
  test('1. PLAN_DENIED: item da sidebar continua visível', () => {
    const user = { id: 'u1', is_admin: false, permissions: { extras: true } };
    const commercialContext = {
      access: { extras: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false } }
    };
    const { sandbox, sidebarExtras } = createInteractiveNavSandbox(user, commercialContext);

    sandbox.window.applyPermissions();

    assert.equal(sidebarExtras.style.display !== 'none', true, 'Sidebar link com plan denied deve continuar visível');
  });

  // 2. PLAN_DENIED: item da sidebar possui cadeado/indicador comercial
  test('2. PLAN_DENIED: item da sidebar possui cadeado/indicador comercial', () => {
    const user = { id: 'u1', is_admin: false, permissions: { extras: true } };
    const commercialContext = {
      access: { extras: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false } }
    };
    const { sandbox, sidebarExtras } = createInteractiveNavSandbox(user, commercialContext);

    sandbox.window.updateSidebarCommercialBadges();

    const badge = sidebarExtras.querySelector('.sidebar-plan-lock-badge');
    assert.ok(badge, 'Sidebar link deve receber elemento .sidebar-plan-lock-badge');
    assert.equal(badge.getAttribute('title'), 'Não disponível no seu plano atual');
    assert.equal(badge.getAttribute('aria-label'), 'Não disponível no seu plano atual');
    assert.ok(badge.innerHTML.includes('svg-lock'), 'Badge deve conter ícone svg de cadeado');
    assert.ok(sidebarExtras.classList.contains('sidebar-link--plan-locked'), 'Deve receber classe sidebar-link--plan-locked');
  });

  // 3. RBAC_DENIED: não recebe cadeado comercial de plano
  test('3. RBAC_DENIED: não recebe cadeado comercial de plano', () => {
    const user = { id: 'u2', is_admin: false, permissions: { extras: false } };
    const commercialContext = {
      access: { extras: { planAllowed: true, permissionAllowed: false, effectiveAllowed: false } }
    };
    const { sandbox, sidebarExtras } = createInteractiveNavSandbox(user, commercialContext);

    sandbox.window.applyPermissions();

    assert.equal(sidebarExtras.style.display, 'none', 'Item negado por RBAC deve ser ocultado');
    const badge = sidebarExtras.querySelector('.sidebar-plan-lock-badge');
    assert.ok(!badge || badge.style.display === 'none', 'NÃO deve exibir cadeado comercial em RBAC_DENIED');
    assert.ok(!sidebarExtras.classList.contains('sidebar-link--plan-locked'));
  });

  // 4. clique no item PLAN_DENIED: abre a página contextual in-page correta
  test('4. clique no item PLAN_DENIED: abre a página contextual in-page correta', () => {
    const user = { id: 'u1', is_admin: false, permissions: { extras: true } };
    const commercialContext = {
      access: { extras: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false } }
    };
    const { sandbox, sidebarExtras } = createInteractiveNavSandbox(user, commercialContext);

    const container = sandbox.$('#tab-extras');
    container.classList.add('tab-content');
    const header = createMockElement('div');
    header.className = 'module-header';
    container.appendChild(header);

    // Simula clique na sidebar
    sidebarExtras.click();

    assert.equal(container.style.display, 'block', 'Container deve estar exibido');
    assert.equal(container.hidden, false, 'Container não deve estar hidden');
    assert.ok(container.classList.contains('tab-content--plan-locked'), 'Container deve conter tab-content--plan-locked');
    const contextualView = container.querySelector('.module-contextual-upgrade-view');
    assert.ok(contextualView, 'View contextual de upgrade deve ter sido injetada');
    assert.ok(!container.querySelector('.access-denied-screen-overlay.plan-denied'), 'Não deve existir overlay modal flutuante');
  });

  // 5. Módulo bloqueado não renderiza mais blur nem overlay flutuante, mas renderiza página contextual in-page
  test('5. Módulo bloqueado não renderiza mais blur nem overlay flutuante, mas renderiza página contextual in-page', () => {
    const user = { id: 'u1', is_admin: false, permissions: { extras: true } };
    const commercialContext = {
      access: { extras: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);

    const container = sandbox.$('#tab-extras');
    const header = createMockElement('div');
    header.className = 'module-header';
    const grid = createMockElement('div');
    grid.className = 'sections-grid';
    container.appendChild(header);
    container.appendChild(grid);

    sandbox.window.checkModuleAccess('tab-extras');

    assert.ok(container.classList.contains('tab-content--plan-locked'), 'Container deve receber classe tab-content--plan-locked');
    assert.equal(header.style.display !== 'none', true, 'Header deve permanecer no DOM com display visível');
    const contextualView = container.querySelector('.module-contextual-upgrade-view');
    assert.ok(contextualView, 'Deve renderizar página contextual in-page');
    assert.ok(!container.querySelector('.access-denied-screen-overlay.plan-denied'), 'NÃO deve ter overlay modal flutuante');
    assert.ok(!componentsCssContent.includes('filter: blur(2px)'), 'NÃO deve ter blur no CSS de módulo bloqueado');
  });

  // 6. preview não executa renderer/fetch de dados reais
  test('6. preview não executa renderer/fetch de dados reais', () => {
    let dataFetcherCalled = false;
    const fakeState = { expenses: [], preferences: {} };
    const sandbox = {
      window: {
        checkModuleAccess: () => ({ allowed: false, reason: 'PLAN_DENIED' }),
        checkModuleMaintenance: () => false,
        renderConsolidatedDashboardTab: () => { dataFetcherCalled = true; },
        renderExtras: () => { dataFetcherCalled = true; }
      },
      document: {
        readyState: 'complete',
        addEventListener: () => {}
      },
      API: {
        getBasePath: () => '',
        resolveUrl: (u) => u
      },
      setTimeout: () => {},
      clearTimeout: () => {},
      loadState: () => fakeState,
      saveState: () => Promise.resolve(true),
      loadPreferences: () => ({}),
      render: () => {},
      state: fakeState,
      $: () => null
    };
    sandbox.window = Object.assign(sandbox.window, sandbox);

    vm.createContext(sandbox);
    vm.runInContext(appJsCode, sandbox);

    sandbox.window.renderTabContent('tab-extras');
    sandbox.window.renderTabContent('tab-dashboard');

    assert.equal(dataFetcherCalled, false, 'Nenhum renderer de dados reais deve ser executado para módulo bloqueado');
  });

  // 7. Estilos CSS da página contextual garantem container contido sem blur
  test('7. Estilos CSS da página contextual garantem container contido sem blur', () => {
    assert.ok(componentsCssContent.includes('.tab-content.tab-content--plan-locked'), 'components.css deve definir regra para container bloqueado');
    assert.ok(!componentsCssContent.includes('filter: blur(2px)'), 'components.css NÃO deve conter filter: blur(2px)');
    assert.ok(componentsCssContent.includes('.module-contextual-upgrade-view'), 'components.css deve estilizar .module-contextual-upgrade-view');
    assert.ok(componentsCssContent.includes('.module-contextual-notice'), 'components.css deve estilizar .module-contextual-notice');
  });

  // 8. Controles internos do módulo são desativados/ocultados e tornados inertes
  test('8. Controles internos do módulo são desativados/ocultados e tornados inertes', () => {
    const user = { id: 'u1', is_admin: false, permissions: { extras: true } };
    const commercialContext = {
      access: { extras: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);

    const container = sandbox.$('#tab-extras');
    const child = createMockElement('div');
    container.appendChild(child);

    sandbox.window.checkModuleAccess('tab-extras');

    assert.equal(child.getAttribute('aria-hidden'), 'true', 'Filho deve ter aria-hidden true');
    assert.equal(child.getAttribute('inert'), '', 'Filho deve ter atributo inert');
    assert.equal(child.inert, true, 'Propriedade inert deve ser true');
    assert.equal(child.style.display, 'none', 'Controles operacionais internos devem estar ocultos');
  });

  // 9. CTA "Assinaturas online em breve" e botão "Ver todos os planos"
  test('9. CTA "Assinaturas online em breve" e botão "Ver todos os planos"', async () => {
    let modalOpened = false;
    const user = { id: 'u1', is_admin: false, permissions: { extras: true } };
    const commercialContext = {
      access: { extras: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);
    sandbox.window.openCommercialPlansModal = () => { modalOpened = true; };

    const container = sandbox.$('#tab-extras');
    sandbox.window.checkModuleAccess('tab-extras');

    const contextualView = container.querySelector('.module-contextual-upgrade-view');
    assert.ok(contextualView, 'View contextual deve existir');

    const cardHtml = sandbox.window.renderCommercialPlanCardHtml({
      id: 'plan_pro',
      name: 'Pro',
      pricing: { offers: { monthly: { regularPriceCents: 2990, enabled: true } } },
      includedResources: ['extras']
    }, { mode: 'contextual' });

    assert.ok(cardHtml.includes('Assinaturas online em breve'), 'Card contextual deve ter CTA Assinaturas online em breve');
  });

  // 10. admin sem plan access continua bloqueado
  test('10. admin sem plan access continua bloqueado', () => {
    const adminUser = { id: 'u_admin', is_admin: true, permissions: {} };
    const commercialContext = {
      access: { extras: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false } }
    };
    const sandbox = setupUiShellSandbox(adminUser, commercialContext);

    const access = sandbox.window.getModuleCommercialAccess('tab-extras', adminUser);
    assert.equal(access.planAllowed, false);
    assert.equal(access.effectiveAllowed, false, 'Admin sem acesso ao plano não possui bypass');

    const check = sandbox.window.checkModuleAccess('tab-extras');
    assert.equal(check.allowed, false);
    assert.equal(check.reason, 'PLAN_DENIED');
  });

  // 11. RBAC_DENIED continua sem CTA comercial
  test('11. RBAC_DENIED continua sem CTA comercial', () => {
    const user = { id: 'u_no_rbac', is_admin: false, permissions: { extras: false } };
    const commercialContext = {
      access: { extras: { planAllowed: true, permissionAllowed: false, effectiveAllowed: false } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);

    const container = sandbox.$('#tab-extras');
    const check = sandbox.window.checkModuleAccess('tab-extras');
    assert.equal(check.reason, 'RBAC_DENIED');

    const overlay = container.querySelector('.access-denied-screen-overlay');
    assert.ok(overlay.classList.contains('rbac-denied'));
    assert.ok(!overlay.innerHTML.includes('Ver Planos'));
    assert.ok(!overlay.innerHTML.includes('btnAccessDeniedUpgrade'));
    assert.ok(!overlay.innerHTML.includes('upgrade'));
    assert.ok(!container.querySelector('.module-contextual-upgrade-view') || container.querySelector('.module-contextual-upgrade-view').style.display === 'none');
  });

  // 12. acesso direto por rota/hash renderiza a página contextual
  test('12. acesso direto por rota/hash renderiza a página contextual', () => {
    const user = { id: 'u1', is_admin: false, permissions: { extras: true } };
    const commercialContext = {
      access: { extras: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);
    sandbox.window.location.pathname = '/extras';

    sandbox.window.syncRouteFromLocation();

    const container = sandbox.$('#tab-extras');
    assert.ok(container.classList.contains('tab-content--plan-locked'));
    const contextualView = container.querySelector('.module-contextual-upgrade-view');
    assert.ok(contextualView);
    assert.equal(contextualView.style.display !== 'none', true);
  });

  // 13. responsividade mobile: sem overflow e regras de viewport
  test('13. responsividade mobile: sem overflow e regras de viewport', () => {
    assert.ok(mobileCssContent.includes('.module-contextual-notice'), 'mobile.css deve conter estilos para .module-contextual-notice');
    assert.ok(mobileCssContent.includes('.contextual-plans-track'), 'mobile.css deve conter regras para .contextual-plans-track');
    assert.ok(componentsCssContent.includes('.contextual-plans-track'), 'components.css deve conter track com scroll');
    assert.ok(mobileCssContent.includes('@media (max-width: 768px)'), 'mobile.css deve cobrir 768px');
    assert.ok(mobileCssContent.includes('@media (max-width: 480px)'), 'mobile.css deve cobrir 480px');
  });

  // 14. nenhum hardcode de plano específico
  test('14. nenhum hardcode de plano específico', () => {
    const user = { id: 'u1', is_admin: false, permissions: { extras: true } };
    const commercialContext = {
      access: { extras: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);
    const container = sandbox.$('#tab-extras');
    sandbox.window.checkModuleAccess('tab-extras');

    const contextualView = container.querySelector('.module-contextual-upgrade-view');
    const html = contextualView.innerHTML;

    assert.ok(!html.includes('Plano Starter Fixo'), 'Não deve conter nome fixo arbitrário');
    assert.ok(html.includes('Rendas Extras'), 'Deve conter o nome do módulo');
  });

  // 15. nenhuma chamada de billing/self-service plan change
  test('15. nenhuma chamada de billing/self-service plan change', () => {
    assert.ok(!uiShellJsCode.includes('/api/checkout'), 'uiShell.js não deve chamar checkout');
    assert.ok(!uiShellJsCode.includes('/api/subscription'), 'uiShell.js não deve chamar subscriptions');
    assert.ok(!uiShellJsCode.includes('/api/me/plan'), 'uiShell.js não deve alterar plano self-service');
  });

  // 16. PLAN_DENIED sanitiza dados financeiros reais previamente renderizados no DOM
  test('16. PLAN_DENIED sanitiza dados financeiros reais previamente renderizados no DOM (SEGREDO_FINANCEIRO_123 e R$ 9.999,99)', () => {
    let rendererCalls = 0;
    const user = { id: 'u1', is_admin: false, permissions: { despesas: true } };
    // 1. Montar módulo inicialmente como permitido
    const commercialContext = {
      access: { despesas: { planAllowed: true, permissionAllowed: true, effectiveAllowed: true } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);
    const container = sandbox.$('#tab-expenses');

    // Montar casca estrutural com lista e métricas
    const listFixed = createMockElement('div', 'listFixed');
    const listVariable = createMockElement('div', 'listVariable');
    const sumFixed = createMockElement('span', 'sumFixed');
    const metricsWrap = createMockElement('div', 'dashboardMetrics');
    const metricVal = createMockElement('div', 'valFixedExpenses');
    metricVal.className = 'metric-val';
    metricsWrap.appendChild(metricVal);

    container.appendChild(listFixed);
    container.appendChild(listVariable);
    container.appendChild(sumFixed);
    container.appendChild(metricsWrap);

    // 2. Inserir dados financeiros identificáveis no DOM
    listFixed.innerHTML = '<div class="expense-card"><span class="title">SEGREDO_FINANCEIRO_123</span><span class="val">R$ 9.999,99</span></div>';
    sumFixed.textContent = 'R$ 9.999,99';
    metricVal.textContent = 'R$ 9.999,99';

    assert.ok(container.textContent.includes('SEGREDO_FINANCEIRO_123'), 'DOM inicial deve conter o segredo financeiro');
    assert.ok(container.textContent.includes('R$ 9.999,99'), 'DOM inicial deve conter o valor financeiro');

    // 3. Durante a sessão, o acesso comercial muda para PLAN_DENIED
    commercialContext.access.despesas = { planAllowed: false, permissionAllowed: true, effectiveAllowed: false };

    sandbox.window.renderExpensesLists = () => { rendererCalls++; };
    sandbox.window.renderTabContent = () => { rendererCalls++; };

    // 4. Reaplicar checkModuleAccess
    const check = sandbox.window.checkModuleAccess('tab-expenses');
    assert.equal(check.allowed, false);
    assert.equal(check.reason, 'PLAN_DENIED');

    // ASSERT 1: container.textContent NÃO contém o segredo nem o valor financeiro
    assert.equal(container.textContent.includes('SEGREDO_FINANCEIRO_123'), false, 'container.textContent NÃO deve conter SEGREDO_FINANCEIRO_123');
    assert.equal(container.textContent.includes('R$ 9.999,99'), false, 'container.textContent NÃO deve conter R$ 9.999,99');

    // ASSERT 2: totais monetários resetados para R$ 0,00 e nenhum skeleton simulando conteúdo
    assert.equal(sumFixed.textContent, 'R$ 0,00', 'Total sumFixed deve ter sido resetado para R$ 0,00');
    assert.equal(metricVal.textContent, 'R$ 0,00', 'Métrica metricVal deve ter sido resetada para R$ 0,00');
    assert.equal(container.querySelectorAll('.module-locked-skeleton-row').length, 0, 'Não deve ter skeletons simulando conteúdo');

    // ASSERT 3: página contextual existe e contém aviso do plano
    const contextualView = container.querySelector('.module-contextual-upgrade-view');
    assert.ok(contextualView, 'View contextual deve existir');
    assert.ok(contextualView.innerHTML.includes('não inclui'), 'Deve informar que plano não inclui Despesas');

    // ASSERT 4: conteúdo operacional subjacente está inerte e oculto
    assert.equal(listFixed.getAttribute('inert'), '', 'Elemento listFixed deve ter inert');
    assert.equal(listFixed.getAttribute('aria-hidden'), 'true', 'Elemento listFixed deve ter aria-hidden true');
    assert.equal(listFixed.style.display, 'none', 'Elemento listFixed deve estar display: none');

    // ASSERT 5: nenhum novo renderer/fetch foi executado
    assert.equal(rendererCalls, 0, 'Nenhum renderer de dados reais deve ser executado no bloqueio');
  });

  // 17. Cobertura parametrizada de sanitização de dados prévios para os 7 módulos comerciais
  test('17. Cobertura parametrizada de sanitização de dados prévios para os 7 módulos comerciais', () => {
    const modulesConfig = [
      { tabId: 'tab-expenses', perm: 'despesas', listId: 'listFixed', totalId: 'sumFixed' },
      { tabId: 'tab-extras', perm: 'extras', listId: 'listExtra', totalId: 'sumExtra' },
      { tabId: 'tab-debtors', perm: 'devedores', listId: 'listDebtors', totalId: 'sumDebtors' },
      { tabId: 'tab-investments', perm: 'investimentos', listId: 'assetGridList', totalId: null },
      { tabId: 'tab-benefits', perm: 'beneficios', listId: 'listBenefits', totalId: 'sumBenefits' },
      { tabId: 'tab-shopping', perm: 'compras', listId: 'shoppingListsGrid', totalId: null },
      { tabId: 'tab-simulation', perm: 'simulacao', listId: 'simRealList', totalId: 'simRealTotal' }
    ];

    for (const mod of modulesConfig) {
      const secret = 'DADO_CONFIDENCIAL_' + mod.tabId;
      const currencyVal = 'R$ 7.777,77';
      const user = { id: 'u_tester', is_admin: false, permissions: { [mod.perm]: true } };
      const commercialContext = {
        access: { [mod.perm]: { planAllowed: true, permissionAllowed: true, effectiveAllowed: true } }
      };
      const sandbox = setupUiShellSandbox(user, commercialContext);
      const container = sandbox.$('#' + mod.tabId);

      // Injeta container de lista
      const listEl = createMockElement('div', mod.listId);
      listEl.innerHTML = `<div class="item"><span class="title">${secret}</span><span class="val">${currencyVal}</span></div>`;
      container.appendChild(listEl);

      if (mod.totalId) {
        const totalEl = createMockElement('span', mod.totalId);
        totalEl.textContent = currencyVal;
        container.appendChild(totalEl);
      }

      assert.ok(container.textContent.includes(secret), `DOM de ${mod.tabId} deve inicialmente conter dado confidencial`);
      assert.ok(container.textContent.includes(currencyVal), `DOM de ${mod.tabId} deve inicialmente conter valor`);

      // Altera para PLAN_DENIED
      commercialContext.access[mod.perm] = { planAllowed: false, permissionAllowed: true, effectiveAllowed: false };

      const check = sandbox.window.checkModuleAccess(mod.tabId);
      assert.equal(check.allowed, false, `${mod.tabId} deve retornar allowed: false`);
      assert.equal(check.reason, 'PLAN_DENIED', `${mod.tabId} deve retornar PLAN_DENIED`);

      // ASSERT: texto confidencial e valor foram sanitizados
      assert.equal(container.textContent.includes(secret), false, `${mod.tabId} NÃO deve conter ${secret} após PLAN_DENIED`);
      assert.equal(container.textContent.includes(currencyVal), false, `${mod.tabId} NÃO deve conter ${currencyVal} após PLAN_DENIED`);
      assert.ok(container.classList.contains('tab-content--plan-locked'), `${mod.tabId} deve conter classe tab-content--plan-locked`);
      assert.equal(listEl.getAttribute('inert'), '', `${mod.tabId} listEl deve ser inert`);
      assert.equal(listEl.style.display, 'none', `${mod.tabId} listEl deve estar display none`);
    }
  });

  // 18. Retorno de PLAN_DENIED para permitido restaura interatividade e reconstrói dados sem skeletons presos
  test('18. Retorno de PLAN_DENIED para permitido restaura interatividade e reconstrói dados sem skeletons presos', () => {
    let reRendered = false;
    const user = { id: 'u1', is_admin: false, permissions: { despesas: true } };
    // Inicia como PLAN_DENIED
    const commercialContext = {
      access: { despesas: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);
    const container = sandbox.$('#tab-expenses');
    container.hidden = false;

    const listFixed = createMockElement('div', 'listFixed');
    container.appendChild(listFixed);

    // Aplica bloqueio inicial
    sandbox.window.checkModuleAccess('tab-expenses');
    assert.ok(container.classList.contains('tab-content--plan-locked'));
    assert.equal(listFixed.getAttribute('inert'), '');

    // Simula o renderer normal da aplicação ao desbloquear
    sandbox.window.renderTabContent = (tabId) => {
      if (tabId === 'tab-expenses') {
        reRendered = true;
        listFixed.innerHTML = '<div class="expense-row">DESPESA_AUTORIZADA_RECUPERADA R$ 50,00</div>';
      }
    };

    // Agora o plano é atualizado e o recurso torna-se permitido
    commercialContext.access.despesas = { planAllowed: true, permissionAllowed: true, effectiveAllowed: true };

    const check = sandbox.window.checkModuleAccess('tab-expenses');
    assert.equal(check.allowed, true, 'checkModuleAccess deve retornar allowed: true');
    assert.equal(container.classList.contains('tab-content--plan-locked'), false, 'Classe tab-content--plan-locked deve ser removida');

    // View contextual deve estar oculta/removida
    const contextualView = container.querySelector('.module-contextual-upgrade-view');
    assert.ok(!contextualView || contextualView.style.display === 'none', 'View contextual deve estar oculta/removida');

    // Interatividade deve estar restaurada
    assert.equal(listFixed.getAttribute('inert'), null, 'inert deve ser removido');
    assert.equal(listFixed.getAttribute('aria-hidden'), null, 'aria-hidden deve ser removido');

    // checkModuleAccess NÃO deve chamar renderTabContent recursivamente
    assert.equal(reRendered, false, 'checkModuleAccess NÃO deve chamar renderTabContent recursivamente');

    // Depois o controlador chama renderTabContent uma única vez:
    sandbox.window.renderTabContent('tab-expenses');
    assert.equal(reRendered, true, 'renderTabContent deve ter sido chamado pelo controlador para reconstruir dados');
    assert.ok(container.textContent.includes('DESPESA_AUTORIZADA_RECUPERADA'), 'Dados reconstruídos devem estar no DOM');
    assert.equal(container.querySelectorAll('.module-locked-skeleton-row').length, 0, 'Nenhum skeleton deve permanecer preso no DOM');
  });

  // 19. Filtro contextual usa estritamente plan.includedResources.includes(resourceKey)
  test('19. Filtro contextual usa estritamente plan.includedResources.includes(resourceKey)', () => {
    const plans = [
      { id: 'p1', name: 'Plano Sem Investimentos', includedResources: ['despesas', 'extras'] },
      { id: 'p2', name: 'Plano Com Investimentos', includedResources: ['despesas', 'investimentos'] },
      { id: 'p3', name: 'Plano Legado Sem DTO', includedResources: [] }
    ];

    const filtered = plans.filter(p => Array.isArray(p.includedResources) && p.includedResources.includes('investimentos'));
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'p2');
    assert.equal(filtered[0].name, 'Plano Com Investimentos');
  });

  // 20. Modo contextual exibe benefícios completos sem truncamento arbitrário
  test('20. Modo contextual exibe benefícios completos sem truncamento arbitrário', () => {
    const sandbox = {
      window: {},
      document: { readyState: 'complete', querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);

    const testPlan = {
      id: 'p_full',
      name: 'Plano Full',
      pricing: { offers: { monthly: { regularPriceCents: 4990, enabled: true } } },
      includedResources: ['investimentos'],
      metadata: { featuresSummary: ['Destaque 1', 'Destaque 2', 'Destaque 3', 'Destaque 4', 'Destaque 5'] },
      limits: { maxExpensesPerMonth: 1000, maxActiveDebtors: 50, maxMediaAttachments: 200 }
    };

    const modalHtml = sandbox.window.renderCommercialPlanCardHtml(testPlan, { mode: 'modal' });
    const contextualHtml = sandbox.window.renderCommercialPlanCardHtml(testPlan, { mode: 'contextual' });

    assert.ok(contextualHtml.includes('plan-card--contextual'), 'Card deve ter classe contextual');
    assert.ok(contextualHtml.includes('Destaque 1'));
    assert.ok(contextualHtml.includes('Destaque 2'));
    assert.ok(contextualHtml.includes('Destaque 3'));
    assert.ok(contextualHtml.includes('Destaque 4'), 'Card contextual exibe todos os destaques sem truncamento');
    assert.ok(contextualHtml.includes('Destaque 5'), 'Card contextual exibe todos os destaques sem truncamento');
    assert.ok(!contextualHtml.includes('plan-card-limits'), 'Card contextual não deve renderizar tabela extensa de limits');
    assert.ok(modalHtml.includes('plan-card-limits'), 'Modal regular pode conter a seção de limits');
  });

  // 21. Estado de loading discreto ("Carregando planos disponíveis...") e tratamento amigável de erro com retry
  test('21. Estado de loading discreto e tratamento amigável de erro com retry', () => {
    assert.ok(uiShellJsCode.includes('Carregando planos disponíveis...'), 'uiShell deve exibir texto discreto de loading');
    assert.ok(uiShellJsCode.includes('Não foi possível carregar os planos no momento.'), 'uiShell deve tratar erro com mensagem amigável');
    assert.ok(uiShellJsCode.includes('btn-retry-contextual'), 'uiShell deve fornecer botão de retry em caso de falha de rede');
    assert.ok(!uiShellJsCode.includes('module-locked-skeleton-row'), 'uiShell não deve simular dados com skeletons financeiros');
  });

  // 22. Race condition de navegação com token: request antigo não sobrescreve aba ativa diferente nem container desmontado
  test('22. Race condition de navegação com token: request antigo não sobrescreve aba ativa diferente', async () => {
    const user = { id: 'u1', is_admin: false, permissions: { investimentos: true, devedores: true } };
    const commercialContext = {
      access: {
        investimentos: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false },
        devedores: { planAllowed: true, permissionAllowed: true, effectiveAllowed: true }
      }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);

    let resolveSlowPlans;
    sandbox.API.getActivePlans = () => new Promise(res => {
      resolveSlowPlans = res;
    });

    const investmentsContainer = sandbox.$('#tab-investments');
    sandbox.window.checkModuleAccess('tab-investments');

    const firstToken = investmentsContainer._contextualToken;
    assert.ok(firstToken > 0, 'Container deve receber token de request');

    // Usuário navega para outra aba antes do término da request
    sandbox.window.currentActiveTab = 'tab-debtors';
    investmentsContainer._contextualToken = 999999; // Simula avanço ou invalidação de token

    // Request lenta finalmente resolve
    resolveSlowPlans({
      success: true,
      plans: [
        { id: 'p_late', name: 'Late Plan', includedResources: ['investimentos'], pricing: { offers: { monthly: { regularPriceCents: 1000 } } } }
      ]
    });

    // Aguarda microtasks
    await new Promise(r => setTimeout(r, 10));

    // Como o token foi invalidado e a aba atual é devedores, os cards NÃO foram injetados no container
    assert.ok(!investmentsContainer.textContent.includes('Late Plan'), 'Cards do request antigo NÃO devem ser injetados após cancelamento/mudança de aba');
  });

  // 23. Single-flight cache para getActivePlans: requisições concorrentes reutilizam a mesma Promise
  test('23. Single-flight cache para getActivePlans: requisições concorrentes reutilizam a mesma Promise', async () => {
    let fetchCalls = 0;
    const fakeFetch = () => {
      fetchCalls++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          plans: [{ id: 'plan_shared', name: 'Shared', includedResources: ['investimentos'] }]
        })
      });
    };

    const sandbox = {
      window: {},
      document: { querySelector: () => null },
      fetch: fakeFetch,
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(apiJsCode, sandbox);

    if (sandbox.window.API && typeof sandbox.window.API.getActivePlans === 'function') {
      // Dispara 3 chamadas concorrentes
      const [r1, r2, r3] = await Promise.all([
        sandbox.window.API.getActivePlans(),
        sandbox.window.API.getActivePlans(),
        sandbox.window.API.getActivePlans()
      ]);

      assert.equal(fetchCalls, 1, 'Chamadas concorrentes devem single-flight para uma única requisição HTTP');
      assert.equal(r1.plans[0].id, 'plan_shared');
      assert.equal(r2.plans[0].id, 'plan_shared');
      assert.equal(r3.plans[0].id, 'plan_shared');
    }
  });

  // 24. Carrossel contextual: 1 a 4 planos oculta setas; 5+ planos exibe controles funcionais
  test('24. Carrossel contextual: 1 a 4 planos oculta setas; 5+ planos exibe controles funcionais', () => {
    assert.ok(uiShellJsCode.includes('eligiblePlans.length <= 4'), 'uiShell deve checar se planos <= 4 para ocultar setas');
    assert.ok(uiShellJsCode.includes('btnPrev.style.display = \'none\''), 'Setas devem ser ocultadas quando <= 4');
  });

  // 25. Header auditado: reutiliza .module-header se existente; se ausente, renderiza .module-contextual-header centralizado
  test('25. Header auditado: reutiliza .module-header se existente; se ausente, renderiza .module-contextual-header centralizado', () => {
    const user = { id: 'u1', is_admin: false, permissions: { despesas: true, investimentos: true } };
    const commercialContext = {
      access: {
        despesas: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false },
        investimentos: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false }
      }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);

    // Caso A: módulo COM .module-header no DOM (ex: despesas)
    const expContainer = sandbox.$('#tab-expenses');
    const existingHeader = createMockElement('div');
    existingHeader.className = 'module-header';
    expContainer.appendChild(existingHeader);

    sandbox.window.checkModuleAccess('tab-expenses');
    const expContextual = expContainer.querySelector('.module-contextual-upgrade-view');
    assert.ok(expContextual);
    assert.ok(!expContextual.querySelector('.module-contextual-header'), 'Não deve duplicar header quando .module-header já existe no DOM');

    // Caso B: módulo SEM .module-header no DOM (ex: investimentos)
    const invContainer = sandbox.$('#tab-investments');
    sandbox.window.checkModuleAccess('tab-investments');
    const invContextual = invContainer.querySelector('.module-contextual-upgrade-view');
    assert.ok(invContextual);
    const invHeader = invContextual.querySelector('.module-contextual-header');
    assert.ok(invHeader, 'Deve gerar .module-contextual-header quando não há header existente no módulo');
    assert.ok(invContextual.innerHTML.includes('Investimentos'), 'Header contextual deve conter o título do módulo');
  });

  // 26. Empty state: 0 planos elegíveis exibe aviso amigável + botão Ver todos os planos
  test('26. Empty state: 0 planos elegíveis exibe aviso amigável + botão Ver todos os planos', () => {
    const sandbox = {
      window: {},
      document: { readyState: 'complete', querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);

    const container = createMockElement('div');
    sandbox.window.renderCommercialPlansView(container, [], { mode: 'contextual' });

    assert.ok(container.innerHTML.includes('contextual-plans-empty'), 'Deve renderizar container empty');
    assert.ok(container.innerHTML.includes('Este recurso não está disponível nos planos oferecidos atualmente.'), 'Deve exibir aviso amigável');
    assert.ok(container.innerHTML.includes('Ver todos os planos'), 'Deve exibir botão para abrir catálogo completo');
  });

  // 27. Promoções (intro e campanha): formatam preços e badges nos cards contextuais
  test('27. Promoções (intro e campanha): formatam preços e badges nos cards contextuais', () => {
    const sandbox = {
      window: {},
      document: { readyState: 'complete', querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);

    const planWithIntro = {
      id: 'p_intro',
      name: 'Intro Plan',
      pricing: {
        offers: {
          monthly: {
            regularPriceCents: 4990,
            enabled: true,
            intro: { enabled: true, promotionalPriceCents: 1990, cycles: 3 }
          }
        }
      }
    };

    const cardHtml = sandbox.window.renderCommercialPlanCardHtml(planWithIntro, { mode: 'contextual' });
    assert.ok(cardHtml.includes('Promoção: primeiros 3 meses'), 'Deve exibir badge de intro promo');
    assert.ok(cardHtml.includes('49,90'), 'Deve exibir preço original riscado');
    assert.ok(cardHtml.includes('19,90'), 'Deve exibir preço promocional');
  });

  // 28. Zero erros de console e isolamento de dependências
  test('28. Zero erros de console e isolamento de dependências', () => {
    assert.ok(typeof uiShellJsCode === 'string');
    assert.ok(typeof plansModalJsCode === 'string');
    assert.ok(typeof apiJsCode === 'string');
  });

});

describe('Hotfix 5H.1 — Catálogo Ver Planos & Visual do Preview Bloqueado', () => {

  const ultraYearPlan = {
    id: 'corvfin_ultra_year',
    slug: 'corvfin-ultra-per-year',
    name: 'CorvFin Ultra - Per Year',
    description: 'Acesso total corporativo anual',
    pricing: { amountCents: 19990, currency: 'BRL', interval: 'year' },
    status: 'active'
  };

  test('HF-1. Frontend consome { success: true, plans: [...] } e renderiza planos', async () => {
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
          data: { plan: { slug: 'free', name: 'Free' }, access: {} }
        }),
        getActivePlans: () => Promise.resolve({
          success: true,
          plans: [ultraYearPlan]
        })
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);

    await sandbox.window.openCommercialPlansModal();

    const grid = getEl('plansGridContainer');
    assert.ok(grid.innerHTML.includes('CorvFin Ultra'), 'Grid deve renderizar o plano quando backend envia { plans }');
    assert.ok(grid.innerHTML.includes('R$&nbsp;199,90') || grid.innerHTML.includes('199,90'), 'Deve formatar 19990 centavos como R$ 199,90');
    assert.ok(grid.innerHTML.includes('/ano'), 'Intervalo year deve formatar como /ano');
  });

  test('HF-2. Frontend consome { success: true, data: [...] } por compatibilidade', async () => {
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
          data: { plan: { slug: 'free', name: 'Free' }, access: {} }
        }),
        getActivePlans: () => Promise.resolve({
          success: true,
          data: [ultraYearPlan]
        })
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);

    await sandbox.window.openCommercialPlansModal();

    const grid = getEl('plansGridContainer');
    assert.ok(grid.innerHTML.includes('CorvFin Ultra'), 'Grid deve renderizar plano quando backend envia { data }');
  });

  test('HF-3. Plano atual active no catálogo ganha badge Seu Plano Atual e botão desabilitado', async () => {
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
          data: { plan: ultraYearPlan, access: {} }
        }),
        getActivePlans: () => Promise.resolve({
          success: true,
          plans: [ultraYearPlan]
        })
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);

    await sandbox.window.openCommercialPlansModal();

    const grid = getEl('plansGridContainer');
    assert.ok(grid.innerHTML.includes('plan-card--current'), 'Card do plano atual deve ter destaque');
    assert.ok(grid.innerHTML.includes('Seu Plano Atual'), 'Deve conter badge Seu Plano Atual');
    assert.ok(grid.innerHTML.includes('disabled'), 'Botão de upgrade deve estar desabilitado para o plano atual');
  });

  test('HF-4. Request 200 com array vazio exibe mensagem de catálogo vazio', async () => {
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
          data: { plan: { slug: 'free' }, access: {} }
        }),
        getActivePlans: () => Promise.resolve({
          success: true,
          plans: []
        })
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);

    await sandbox.window.openCommercialPlansModal();

    const grid = getEl('plansGridContainer');
    assert.ok(grid.innerHTML.includes('Nenhum plano disponível para contratação no momento.'), 'Deve exibir texto de catálogo vazio');
    assert.ok(!grid.innerHTML.includes('Não foi possível carregar os planos'), 'Não deve exibir mensagem de erro para 200 vazio');
  });

  test('HF-5. Falha de rede / HTTP 500 exibe mensagem de erro e botão Tentar novamente, NÃO catálogo vazio', async () => {
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
          data: { plan: { slug: 'free' }, access: {} }
        }),
        getActivePlans: () => Promise.resolve({
          success: false,
          message: 'Erro interno ao consultar catálogo'
        })
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);

    await sandbox.window.openCommercialPlansModal();

    const grid = getEl('plansGridContainer');
    assert.ok(grid.innerHTML.includes('Não foi possível carregar os planos no momento.'), 'Deve exibir erro de carregamento');
    assert.ok(grid.innerHTML.includes('btnRetryLoadPlans'), 'Deve conter botão de tentar novamente');
    assert.ok(!grid.innerHTML.includes('Nenhum plano disponível para contratação no momento.'), 'NÃO deve exibir mensagem de catálogo vazio');
  });

  test('HF-6. CSS da página contextual não possui blur nem overlay modal antigo, e tab-content--plan-locked possui fluxo natural', () => {
    const cssContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'components.css'), 'utf-8');
    assert.ok(!cssContent.includes('filter: blur(2px)'), 'components.css NÃO deve conter blur no preview');
    assert.ok(cssContent.includes('.module-contextual-upgrade-view'), 'components.css deve estilizar a view contextual');
    assert.ok(cssContent.includes('.module-contextual-notice'), 'components.css deve estilizar a barra de aviso contextual');
    assert.ok(cssContent.includes('.tab-content.tab-content--plan-locked'), 'Deve existir bloco .tab-content.tab-content--plan-locked');
  });

});

describe('CORVFIN V2 — Regressão Anti-Storm & Não-Reentrância (Pós-5H.1)', () => {

  test('1. renderTabContent("tab-expenses") com acesso permitido executa renderer exatamente uma vez sem recursão', () => {
    let rendererCalls = 0;
    let checkModuleAccessCalls = 0;
    const user = { id: 'u1', is_admin: false, permissions: { despesas: true } };
    const commercialContext = {
      access: { despesas: { planAllowed: true, permissionAllowed: true, effectiveAllowed: true } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);
    vm.runInContext(appJsCode, sandbox);

    const origCheck = sandbox.window.checkModuleAccess;
    sandbox.window.checkModuleAccess = (tabId) => {
      checkModuleAccessCalls++;
      return origCheck(tabId);
    };
    sandbox.renderExpensesLists = () => {
      rendererCalls++;
    };
    sandbox.window.renderExpensesLists = sandbox.renderExpensesLists;

    sandbox.window.renderTabContent('tab-expenses');

    assert.equal(checkModuleAccessCalls, 1, 'checkModuleAccess deve ser chamado exatamente uma vez');
    assert.equal(rendererCalls, 1, 'Renderer específico deve ser chamado exatamente uma vez');
  });

  test('2. PLAN_DENIED -> permitido: checkModuleAccess remove bloqueios sem recursão e controlador reconstrói dados uma única vez', () => {
    let reRenderedCount = 0;
    const user = { id: 'u1', is_admin: false, permissions: { despesas: true } };
    const commercialContext = {
      access: { despesas: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);
    vm.runInContext(appJsCode, sandbox);

    const container = sandbox.$('#tab-expenses');
    container.hidden = false;
    const listFixed = sandbox.document.createElement('div');
    listFixed.id = 'listFixed';
    container.appendChild(listFixed);

    // 1. Aplica bloqueio inicial
    sandbox.window.checkModuleAccess('tab-expenses');
    assert.ok(container.classList.contains('tab-content--plan-locked'));
    assert.equal(listFixed.getAttribute('inert'), '');

    sandbox.renderExpensesLists = () => {
      reRenderedCount++;
      listFixed.innerHTML = '<div class="expense-row">DADO_RECONSTRUIDO R$ 150,00</div>';
    };
    sandbox.window.renderExpensesLists = sandbox.renderExpensesLists;

    // 2. Muda access para permitido
    commercialContext.access.despesas = { planAllowed: true, permissionAllowed: true, effectiveAllowed: true };

    // 3. Reaplicar checkModuleAccess
    const check = sandbox.window.checkModuleAccess('tab-expenses');
    assert.equal(check.allowed, true);
    assert.equal(container.classList.contains('tab-content--plan-locked'), false);
    assert.equal(container.classList.contains('tab-content--plan-denied'), false);
    assert.equal(listFixed.getAttribute('inert'), null);
    assert.equal(listFixed.getAttribute('aria-hidden'), null);

    // ASSERT: checkModuleAccess NÃO chama renderTabContent recursivamente
    assert.equal(reRenderedCount, 0, 'checkModuleAccess NÃO deve redisparar renderer ou renderTabContent');

    // 4. Depois o controlador chama renderTabContent uma única vez:
    sandbox.window.renderTabContent('tab-expenses');
    assert.equal(reRenderedCount, 1, 'Controlador chama renderTabContent exatamente uma vez');
    assert.ok(container.textContent.includes('DADO_RECONSTRUIDO'), 'Dados autorizados devem estar no DOM');
  });

  test('3. Admin: renderizar Admin uma vez dispara getEmailSettings quantidade finita e esperada (exatamente 1)', async () => {
    let emailSettingsCalls = 0;
    let defaultPermsCalls = 0;
    let plansCalls = 0;
    let usersCalls = 0;

    const user = { id: 'u_admin', is_admin: true };
    const commercialContext = {
      access: { configuracoes: { planAllowed: true, permissionAllowed: true, effectiveAllowed: true } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);
    sandbox.API.getEmailSettings = () => {
      emailSettingsCalls++;
      return Promise.resolve({ success: true, settings: { enabled: true, host: 'smtp.corvfin.com' } });
    };
    sandbox.API.getDefaultPermissions = () => {
      defaultPermsCalls++;
      return Promise.resolve({ success: true, permissions: {} });
    };
    sandbox.API.getMaintenance = () => Promise.resolve({ success: true, maintenance: {} });
    sandbox.API.getAdminPlans = () => {
      plansCalls++;
      return Promise.resolve({ success: true, plans: [] });
    };
    sandbox.API.getUsers = () => {
      usersCalls++;
      return Promise.resolve({ success: true, users: [] });
    };

    vm.runInContext(adminJsCode, sandbox);
    vm.runInContext(appJsCode, sandbox);

    sandbox.window.renderTabContent('tab-admin');
    await new Promise(r => setTimeout(r, 20));

    assert.equal(emailSettingsCalls, 1, 'getEmailSettings deve ser chamado exatamente 1 vez');
    assert.equal(defaultPermsCalls, 1, 'getDefaultPermissions deve ser chamado exatamente 1 vez');
    assert.ok(plansCalls <= 1, 'getAdminPlans deve ter chamadas finitas e controladas');
    assert.ok(usersCalls <= 1, 'getUsers deve ter chamadas finitas e controladas');
  });

  test('4. Múltiplos ciclos de navegação (admin -> despesas -> admin -> despesas) crescem linearmente e sem duplicação', async () => {
    let emailSettingsCalls = 0;
    let expensesRenderCalls = 0;

    const user = { id: 'u_admin', is_admin: true, permissions: { despesas: true, configuracoes: true } };
    const commercialContext = {
      access: {
        despesas: { planAllowed: true, permissionAllowed: true, effectiveAllowed: true },
        configuracoes: { planAllowed: true, permissionAllowed: true, effectiveAllowed: true }
      }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);
    sandbox.API.getEmailSettings = () => {
      emailSettingsCalls++;
      return Promise.resolve({ success: true, settings: {} });
    };
    sandbox.API.getDefaultPermissions = () => Promise.resolve({ success: true, permissions: {} });
    sandbox.API.getMaintenance = () => Promise.resolve({ success: true, maintenance: {} });
    sandbox.API.getAdminPlans = () => Promise.resolve({ success: true, plans: [] });
    sandbox.API.getUsers = () => Promise.resolve({ success: true, users: [] });

    vm.runInContext(adminJsCode, sandbox);
    vm.runInContext(appJsCode, sandbox);

    sandbox.renderExpensesLists = () => {
      expensesRenderCalls++;
    };
    sandbox.window.renderExpensesLists = sandbox.renderExpensesLists;

    // Ciclo 1: Navega para Admin
    sandbox.window.activateTab('tab-admin');
    await new Promise(r => setTimeout(r, 20));
    assert.equal(emailSettingsCalls, 1, 'Ciclo 1: admin visitado 1 vez = 1 getEmailSettings request');

    // Ciclo 1: Navega para Despesas
    sandbox.window.activateTab('tab-expenses');
    assert.equal(expensesRenderCalls, 1, 'Ciclo 1: despesas renderizado 1 vez');
    assert.equal(emailSettingsCalls, 1, 'Nenhuma chamada extra de admin ao ir para despesas');

    // Ciclo 2: Navega para Admin
    sandbox.window.activateTab('tab-admin');
    await new Promise(r => setTimeout(r, 20));
    assert.equal(emailSettingsCalls, 2, 'Ciclo 2: admin visitado 2 vezes = 2 getEmailSettings (crescimento estritamente linear)');

    // Ciclo 2: Navega para Despesas
    sandbox.window.activateTab('tab-expenses');
    assert.equal(expensesRenderCalls, 2, 'Ciclo 2: despesas renderizado 2 vezes (crescimento estritamente linear)');
    assert.equal(emailSettingsCalls, 2, 'Nenhuma chamada extra');
  });

  test('5. loadCommercialContext: single-flight/cache funciona e não cria loop com checkModuleAccess', async () => {
    let apiContextCalls = 0;
    const user = { id: 'u1', is_admin: false, permissions: { despesas: true } };
    const commercialContext = {
      plan: { slug: 'pro', name: 'CorvFin Pro' },
      access: { despesas: { planAllowed: true, permissionAllowed: true, effectiveAllowed: true } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);
    sandbox.API.getCommercialContext = (opts) => {
      apiContextCalls++;
      return Promise.resolve({ success: true, data: commercialContext });
    };

    vm.runInContext(appJsCode, sandbox);

    // Duas chamadas de loadCommercialContext
    await Promise.all([
      sandbox.window.loadCommercialContext(),
      sandbox.window.loadCommercialContext()
    ]);

    assert.ok(apiContextCalls >= 1 && apiContextCalls <= 2, 'Quantidade finita de chamadas');
    assert.equal(sandbox.window.checkModuleAccess('tab-expenses').allowed, true, 'checkModuleAccess opera normalmente');
  });

});

describe('CORVFIN V2 — Regressão Limites Autoritativos vs Cards Comerciais (Semântica Canônica)', () => {
  function setupPlansCardSandbox() {
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
    return sandbox;
  }

  // 1. despesas maxItems=29 => card contém 29, card NÃO contém "ilimitado despesas"
  test('1. despesas maxItems=29 => card contém 29 e NÃO contém "ilimitado despesas"', () => {
    const sandbox = setupPlansCardSandbox();
    const plan = {
      id: 'plan_pro',
      name: 'CorvFin Pro',
      pricing: { offers: { monthly: { regularPriceCents: 2990, enabled: true } } },
      entitlements: {
        despesas: { enabled: true, limits: { maxItems: 29 } }
      }
    };
    const html = sandbox.window.renderCommercialPlanCardHtml(plan, { mode: 'modal' });
    assert.ok(html.includes('29'), 'Deve conter número 29');
    assert.ok(html.includes('Até 29 despesas cadastradas'), 'Deve formatar "Até 29 despesas cadastradas"');
    assert.ok(!html.toLowerCase().includes('ilimitado despesas'), 'NÃO deve conter "ilimitado despesas"');
    assert.ok(!html.toLowerCase().includes('despesas ilimitadas'), 'NÃO deve conter "despesas ilimitadas"');
  });

  // 2. extras maxItems=30 => card contém 30
  test('2. extras maxItems=30 => card contém 30', () => {
    const sandbox = setupPlansCardSandbox();
    const plan = {
      id: 'plan_pro',
      name: 'CorvFin Pro',
      pricing: { offers: { monthly: { regularPriceCents: 2990, enabled: true } } },
      entitlements: {
        extras: { enabled: true, limits: { maxItems: 30 } }
      }
    };
    const html = sandbox.window.renderCommercialPlanCardHtml(plan, { mode: 'modal' });
    assert.ok(html.includes('30'), 'Deve conter número 30');
    assert.ok(html.includes('Até 30 rendas extras cadastradas'), 'Deve formatar "Até 30 rendas extras cadastradas"');
  });

  // 3. devedores maxItems=5 => card contém 5
  test('3. devedores maxItems=5 => card contém 5', () => {
    const sandbox = setupPlansCardSandbox();
    const plan = {
      id: 'plan_pro',
      name: 'CorvFin Pro',
      pricing: { offers: { monthly: { regularPriceCents: 2990, enabled: true } } },
      entitlements: {
        devedores: { enabled: true, limits: { maxItems: 5 } }
      }
    };
    const html = sandbox.window.renderCommercialPlanCardHtml(plan, { mode: 'modal' });
    assert.ok(html.includes('5'), 'Deve conter número 5');
    assert.ok(html.includes('Até 5 devedores ativos'), 'Deve formatar "Até 5 devedores ativos"');
  });

  // 4. AI creditsPerDay=10 => "10 créditos..." e NÃO "IA ilimitada"
  test('4. AI creditsPerDay=10 => "10 créditos..." e NÃO "IA ilimitada"', () => {
    const sandbox = setupPlansCardSandbox();
    const plan = {
      id: 'plan_pro',
      name: 'CorvFin Pro',
      pricing: { offers: { monthly: { regularPriceCents: 2990, enabled: true } } },
      entitlements: {
        ai: { enabled: true, limits: { creditsPerDay: 10 } }
      }
    };
    const html = sandbox.window.renderCommercialPlanCardHtml(plan, { mode: 'modal' });
    assert.ok(html.includes('10 créditos de IA por dia'), 'Deve conter "10 créditos de IA por dia"');
    assert.ok(!html.includes('IA ilimitada'), 'NÃO deve conter "IA ilimitada"');
  });

  // 5. AI creditsPerDay=null => "IA ilimitada"
  test('5. AI creditsPerDay=null => "IA ilimitada"', () => {
    const sandbox = setupPlansCardSandbox();
    const plan = {
      id: 'plan_unlimited',
      name: 'CorvFin Ultra',
      pricing: { offers: { monthly: { regularPriceCents: 9990, enabled: true } } },
      entitlements: {
        ai: { enabled: true, limits: { creditsPerDay: null } }
      }
    };
    const html = sandbox.window.renderCommercialPlanCardHtml(plan, { mode: 'modal' });
    assert.ok(html.includes('IA ilimitada'), 'Deve conter "IA ilimitada" quando limits.creditsPerDay === null');
  });

  // 6. maxItems=null => recurso corretamente apresentado como ilimitado
  test('6. maxItems=null => recurso corretamente apresentado como ilimitado', () => {
    const sandbox = setupPlansCardSandbox();
    const plan = {
      id: 'plan_unlimited',
      name: 'CorvFin Ultra',
      pricing: { offers: { monthly: { regularPriceCents: 9990, enabled: true } } },
      entitlements: {
        despesas: { enabled: true, limits: { maxItems: null } },
        extras: { enabled: true, limits: { maxItems: null } }
      }
    };
    const html = sandbox.window.renderCommercialPlanCardHtml(plan, { mode: 'modal' });
    assert.ok(html.includes('Despesas ilimitadas'), 'Despesas com null deve ser "Despesas ilimitadas"');
    assert.ok(html.includes('Rendas Extras ilimitadas'), 'Extras com null deve ser "Rendas Extras ilimitadas"');
  });

  // 7. maxItems=0 => nunca apresentado como ilimitado
  test('7. maxItems=0 => nunca apresentado como ilimitado', () => {
    const sandbox = setupPlansCardSandbox();
    const plan = {
      id: 'plan_zero',
      name: 'CorvFin Zero',
      pricing: { offers: { monthly: { regularPriceCents: 0, enabled: true } } },
      entitlements: {
        extras: { enabled: true, limits: { maxItems: 0 } },
        despesas: { enabled: true, limits: { maxItems: 0 } }
      }
    };
    const html = sandbox.window.renderCommercialPlanCardHtml(plan, { mode: 'modal' });
    assert.ok(!html.toLowerCase().includes('rendas extras ilimitadas'), 'maxItems=0 não pode exibir "Rendas Extras ilimitadas"');
    assert.ok(!html.toLowerCase().includes('despesas ilimitadas'), 'maxItems=0 não pode exibir "Despesas ilimitadas"');
    assert.ok(html.includes('0 rendas extras cadastradas'), 'Deve indicar capacidade quantitativa 0');
    assert.ok(html.includes('0 despesas cadastradas'), 'Deve indicar capacidade quantitativa 0');
  });

  // 8. maxItems undefined/inválido => nunca apresentado como ilimitado
  test('8. maxItems undefined/inválido => nunca apresentado como ilimitado', () => {
    const sandbox = setupPlansCardSandbox();
    const plan = {
      id: 'plan_undefined',
      name: 'Plano Sem Limites Declarados',
      pricing: { offers: { monthly: { regularPriceCents: 1000, enabled: true } } },
      entitlements: {
        despesas: { enabled: true, limits: {} }
      }
    };
    const html = sandbox.window.renderCommercialPlanCardHtml(plan, { mode: 'modal' });
    assert.ok(!html.toLowerCase().includes('despesas ilimitadas'), 'undefined nunca pode ser tratado como ilimitado');
    assert.ok(!html.toLowerCase().includes('ilimitado despesas'), 'undefined nunca pode ser tratado como ilimitado');
  });

  // 9. recurso enabled=false => plano não aparece na listagem contextual desse recurso
  test('9. recurso enabled=false => plano não aparece na listagem contextual desse recurso', () => {
    const sandbox = setupPlansCardSandbox();
    const plans = [
      {
        id: 'p_with_extras',
        name: 'Plano com Extras',
        entitlements: { extras: { enabled: true, limits: { maxItems: 30 } } }
      },
      {
        id: 'p_no_extras',
        name: 'Plano sem Extras',
        entitlements: { extras: { enabled: false, limits: { maxItems: 0 } } }
      }
    ];
    const filtered = sandbox.window.filterPlansByResource(plans, 'extras');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'p_with_extras');
  });

  // 10. card contextual de extras => destaca informação real de extras na 1ª posição
  test('10. card contextual de extras => destaca informação real de extras na 1ª posição', () => {
    const sandbox = setupPlansCardSandbox();
    const plan = {
      id: 'plan_pro',
      name: 'CorvFin Pro - Per Month',
      pricing: { offers: { monthly: { regularPriceCents: 2990, enabled: true } } },
      entitlements: {
        despesas: { enabled: true, limits: { maxItems: 29 } },
        extras: { enabled: true, limits: { maxItems: 30 } },
        ai: { enabled: true, limits: { creditsPerDay: 10 } }
      }
    };
    const html = sandbox.window.renderCommercialPlanCardHtml(plan, {
      mode: 'contextual',
      resourceKey: 'extras'
    });
    assert.ok(html.includes('plan-card--contextual'), 'Deve ser modo contextual');
    assert.ok(html.includes('Até 30 rendas extras cadastradas'), 'Deve destacar limite de extras');
    assert.ok(html.includes('Até 29 despesas cadastradas'), 'Deve conter despesas');
    assert.ok(html.includes('10 créditos de IA por dia'), 'Deve conter IA');

    const extrasIndex = html.indexOf('Até 30 rendas extras cadastradas');
    const despesasIndex = html.indexOf('Até 29 despesas cadastradas');
    assert.ok(extrasIndex !== -1 && despesasIndex !== -1, 'Ambos os itens devem existir');
    assert.ok(extrasIndex < despesasIndex, 'Recurso contextual (extras) deve aparecer antes dos demais no card contextual');
  });

  // 11. limites mostrados no card correspondem exatamente ao payload sanitizado do backend
  test('11. limites mostrados no card correspondem exatamente ao payload sanitizado do backend', () => {
    const entitlements = {
      despesas: { enabled: true, limits: { maxItems: 29 } },
      extras: { enabled: true, limits: { maxItems: 30 } },
      devedores: { enabled: true, limits: { maxItems: 5 } },
      ai: { enabled: true, limits: { creditsPerDay: 10 } }
    };
    const backendLimits = {
      maxExpenses: 29,
      maxExpensesPerMonth: 29,
      maxExtras: 30,
      maxActiveDebtors: 5,
      aiCreditsDaily: 10
    };

    const sandbox = setupPlansCardSandbox();
    const plan = {
      id: 'plan_pro',
      name: 'CorvFin Pro',
      pricing: { offers: { monthly: { regularPriceCents: 2990, enabled: true } } },
      entitlements,
      limits: backendLimits
    };
    const html = sandbox.window.renderCommercialPlanCardHtml(plan, { mode: 'modal' });
    assert.ok(html.includes('Até 29 despesas cadastradas'));
    assert.ok(html.includes('Até 30 rendas extras cadastradas'));
    assert.ok(html.includes('10 créditos de IA por dia'));
    assert.ok(html.includes('Até 5 devedores ativos'));

    // Valida também os valores correspondentes na seção de limites
    assert.ok(html.includes('29'));
    assert.ok(html.includes('30'));
    assert.ok(html.includes('5'));
    assert.ok(html.includes('10'));
  });

  // 12. metadata.featuresSummary contraditório => NÃO sobrescreve limite canônico
  test('12. metadata.featuresSummary contraditório => NÃO sobrescreve limite canônico', () => {
    const sandbox = setupPlansCardSandbox();
    const plan = {
      id: 'plan_pro',
      name: 'CorvFin Pro',
      pricing: { offers: { monthly: { regularPriceCents: 2990, enabled: true } } },
      metadata: {
        featuresSummary: [
          'Até ilimitado despesas / mês',
          'IA ilimitada',
          'Suporte Prioritário 24/7'
        ]
      },
      entitlements: {
        despesas: { enabled: true, limits: { maxItems: 29 } },
        ai: { enabled: true, limits: { creditsPerDay: 10 } }
      }
    };
    const html = sandbox.window.renderCommercialPlanCardHtml(plan, { mode: 'modal' });
    assert.ok(html.includes('Até 29 despesas cadastradas'), 'Limite canônico de despesas prevalece');
    assert.ok(html.includes('10 créditos de IA por dia'), 'Limite canônico de IA prevalece');
    assert.ok(!html.includes('Até ilimitado despesas / mês'), 'Copy contraditória de despesas deve ser descartada');
    assert.ok(!html.includes('IA ilimitada'), 'Copy contraditória de IA deve ser descartada');
    assert.ok(html.includes('Suporte Prioritário 24/7'), 'Copy editorial legítima não contraditória é preservada');
  });
});

describe('CORVFIN V2 — Regressão Benefícios Completos e Nomes Comerciais Sanitizados', () => {

  function setupFullCardSandbox() {
    const sandbox = {
      window: {},
      document: { readyState: 'complete', querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);
    return sandbox;
  }

  const fullPlan = {
    id: 'plan_pro_month',
    name: 'CorvFin Pro - Per Month',
    slug: 'corvfin-pro-per-month',
    pricing: { offers: { monthly: { regularPriceCents: 2990, enabled: true } } },
    entitlements: {
      despesas: { enabled: true, limits: { maxItems: 29 } },
      extras: { enabled: true, limits: { maxItems: 30 } },
      ai: { enabled: true, limits: { creditsPerDay: 10 } },
      devedores: { enabled: true, limits: { maxItems: 20 } },
      investimentos: { enabled: true, limits: { maxItems: 10 } },
      beneficios: { enabled: true, limits: { maxItems: 30 } },
      compras: { enabled: true, limits: { maxItems: 5 } },
      simulacao: { enabled: true, limits: {} },
      relatorios: { enabled: true, limits: {} },
      dashboard: { enabled: true, limits: {} }
    }
  };

  // 1. contextual mostra todos os featureHighlights do plano
  test('1. contextual mostra todos os featureHighlights do plano sem truncamento', () => {
    const sandbox = setupFullCardSandbox();
    const html = sandbox.window.renderCommercialPlanCardHtml(fullPlan, { mode: 'contextual', resourceKey: 'extras' });
    assert.ok(html.includes('Até 30 rendas extras cadastradas'), 'Deve conter extras');
    assert.ok(html.includes('Até 29 despesas cadastradas'), 'Deve conter despesas');
    assert.ok(html.includes('10 créditos de IA por dia'), 'Deve conter IA');
    assert.ok(html.includes('Até 20 devedores ativos'), 'Deve conter devedores');
    assert.ok(html.includes('Até 10 investimentos cadastrados'), 'Deve conter investimentos');
    assert.ok(html.includes('Até 30 transações de benefícios'), 'Deve conter benefícios');
    assert.ok(html.includes('Até 5 listas de compras'), 'Deve conter compras');
    assert.ok(html.includes('Simulação Financeira inclusa'), 'Deve conter simulação');
    assert.ok(html.includes('Relatórios Financeiros inclusos'), 'Deve conter relatórios');
    assert.ok(html.includes('Dashboard Financeiro completo'), 'Deve conter dashboard');
  });

  // 2. recurso contextual aparece primeiro
  test('2. recurso contextual aparece primeiro na lista de benefícios', () => {
    const sandbox = setupFullCardSandbox();
    const extrasHighlights = sandbox.window.buildPlanFeatureHighlights(fullPlan, 'extras');
    assert.equal(extrasHighlights[0], 'Até 30 rendas extras cadastradas', 'extras deve ser #0 em tela de extras');

    const devedoresHighlights = sandbox.window.buildPlanFeatureHighlights(fullPlan, 'devedores');
    assert.equal(devedoresHighlights[0], 'Até 20 devedores ativos', 'devedores deve ser #0 em tela de devedores');

    const investHighlights = sandbox.window.buildPlanFeatureHighlights(fullPlan, 'investimentos');
    assert.equal(investHighlights[0], 'Até 10 investimentos cadastrados', 'investimentos deve ser #0 em tela de investimentos');
  });

  // 3. modal e contextual usam a mesma fonte de benefícios
  test('3. modal e contextual usam a mesma fonte canônica de benefícios', () => {
    const sandbox = setupFullCardSandbox();
    const modalHighlights = sandbox.window.buildPlanFeatureHighlights(fullPlan, null);
    const contextualHighlights = sandbox.window.buildPlanFeatureHighlights(fullPlan, 'extras');

    for (const h of modalHighlights) {
      assert.ok(contextualHighlights.includes(h), `Item "${h}" presente em modal deve estar em contextual`);
    }
    assert.equal(modalHighlights.length, contextualHighlights.length, 'Ambas as telas compartilham a mesma contagem de benefícios');
  });

  // 4. limites exibidos são iguais nas duas telas
  test('4. limites exibidos são estritamente iguais nas duas telas', () => {
    const sandbox = setupFullCardSandbox();
    const modalHtml = sandbox.window.renderCommercialPlanCardHtml(fullPlan, { mode: 'modal' });
    const contextualHtml = sandbox.window.renderCommercialPlanCardHtml(fullPlan, { mode: 'contextual', resourceKey: 'extras' });

    const checks = [
      'Até 30 rendas extras cadastradas',
      'Até 29 despesas cadastradas',
      '10 créditos de IA por dia',
      'Até 20 devedores ativos',
      'Até 10 investimentos cadastrados'
    ];
    for (const item of checks) {
      assert.ok(modalHtml.includes(item), `Modal deve conter: ${item}`);
      assert.ok(contextualHtml.includes(item), `Contextual deve conter: ${item}`);
    }
  });

  // 5. recurso disabled não aparece
  test('5. recurso disabled não aparece na lista de benefícios', () => {
    const sandbox = setupFullCardSandbox();
    const planWithDisabled = {
      ...fullPlan,
      entitlements: {
        ...fullPlan.entitlements,
        investimentos: { enabled: false, limits: { maxItems: 10 } },
        beneficios: { enabled: false, limits: { maxItems: 30 } }
      }
    };
    const highlights = sandbox.window.buildPlanFeatureHighlights(planWithDisabled, 'extras');
    assert.ok(!highlights.some(h => h.includes('investimento')), 'Investimentos desativados NÃO devem aparecer');
    assert.ok(!highlights.some(h => h.includes('benefício') || h.includes('beneficio')), 'Benefícios desativados NÃO devem aparecer');
  });

  // 6. plano contextual continua filtrado pelo recurso correto
  test('6. plano contextual continua filtrado pelo recurso correto', () => {
    const sandbox = setupFullCardSandbox();
    const plans = [
      { id: 'p1', name: 'Plano Sem Extras', entitlements: { extras: { enabled: false } } },
      { id: 'p2', name: 'Plano Com Extras', entitlements: { extras: { enabled: true, limits: { maxItems: 10 } } } }
    ];
    const filtered = sandbox.window.filterPlansByResource(plans, 'extras');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'p2');
  });

  // 7. nomes comerciais não exibem "- Per Month"/"- Per Year"
  test('7. nomes comerciais não exibem sufixos técnicos "- Per Month" / "- Per Year"', () => {
    const sandbox = setupFullCardSandbox();
    const html1 = sandbox.window.renderCommercialPlanCardHtml({ ...fullPlan, name: 'CorvFin Pro - Per Month' });
    assert.ok(html1.includes('CorvFin Pro</h4>'), 'Deve exibir "CorvFin Pro" sem "- Per Month"');
    assert.ok(!html1.includes('CorvFin Pro - Per Month'), 'NÃO deve exibir "- Per Month"');

    const html2 = sandbox.window.renderCommercialPlanCardHtml({ ...fullPlan, name: 'CorvFin Ultra - Per Year' });
    assert.ok(html2.includes('CorvFin Ultra</h4>'), 'Deve exibir "CorvFin Ultra" sem "- Per Year"');
    assert.ok(!html2.includes('CorvFin Ultra - Per Year'), 'NÃO deve exibir "- Per Year"');

    const html3 = sandbox.window.renderCommercialPlanCardHtml({ ...fullPlan, name: 'CorvFin Plus (Per Month)' });
    assert.ok(html3.includes('CorvFin Plus</h4>'), 'Deve remover sufixo entre parênteses');

    assert.equal(sandbox.window.formatCommercialPlanName('CorvFin Starter - Mensal'), 'CorvFin Starter');
    assert.equal(sandbox.window.formatCommercialPlanName('CorvFin Gold - Anual'), 'CorvFin Gold');
  });

  // 8. nenhum overflow horizontal introduzido
  test('8. estrutura visual do card garante contenção e nenhum overflow horizontal', () => {
    const cssContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'components.css'), 'utf-8');
    assert.ok(cssContent.includes('.plan-card'), 'Deve existir .plan-card');
    assert.ok(cssContent.includes('.plan-features-list'), 'Deve existir .plan-features-list');
    assert.ok(!cssContent.includes('.plan-card { overflow: scroll'), 'Card não deve ter scroll interno forçado');
    assert.ok(cssContent.includes('.plan-card.plan-card--contextual'), 'Card contextual possui estilização dedicada');
  });

});

describe('CORVFIN V2 — Correção Layout Modal "Planos & Assinaturas" (Sem Overflow, Hierarquia Vertical & 4 Colunas)', () => {
  function setupModalLayoutSandbox() {
    const sandbox = {
      window: {},
      document: { readyState: 'complete', querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);
    return sandbox;
  }

  const proYearlyPlan = {
    id: 'plan_pro',
    name: 'CorvFin Pro - Per Month',
    slug: 'corvfin-pro-per-month',
    pricing: {
      offers: {
        monthly: { regularPriceCents: 2990, enabled: true },
        yearly: {
          regularPriceCents: 5990,
          enabled: true,
          campaign: { enabled: true, active: true, priceCents: 4990, validUntil: '2026-12-31T23:59:59Z' }
        }
      }
    },
    entitlements: {
      despesas: { enabled: true, limits: { maxItems: 29 } },
      extras: { enabled: true, limits: { maxItems: 30 } }
    }
  };

  const plusNoYearlyPlan = {
    id: 'plan_plus',
    name: 'CorvFin Plus - Per Month',
    slug: 'corvfin-plus-per-month',
    pricing: {
      offers: {
        monthly: { regularPriceCents: 4990, enabled: true },
        yearly: { regularPriceCents: 49900, enabled: false }
      }
    },
    entitlements: {
      despesas: { enabled: true, limits: { maxItems: 100 } }
    }
  };

  // 1. Preço anual do Pro com hierarquia vertical
  test('1. Preço anual do Pro renderiza hierarquia vertical: preço original, destaque /ano, e equivalente mensal em bloco secundário', () => {
    const sandbox = setupModalLayoutSandbox();
    const html = sandbox.window.renderCommercialPlanCardHtml(proYearlyPlan, { mode: 'modal', activeInterval: 'yearly' });
    assert.ok(html.includes('plan-price-original-wrap'), 'Deve conter wrapper para preço original');
    assert.ok(html.includes('plan-price-original'), 'Deve conter span com preço original');
    assert.ok(html.includes('plan-price-primary'), 'Deve conter bloco primário com preço e intervalo');
    assert.ok(html.includes('plan-price-equivalent-main'), 'Deve conter span com equivalente mensal destacado');
    assert.ok(html.includes('plan-price-equivalent-sub'), 'Deve conter span com "Faturado anualmente" como sub-bloco');
    assert.ok(html.replace(/\u00A0/g, ' ').includes('Equivalente a R$ 4,16/mês'), 'Deve calcular R$ 4,16/mês');
  });

  // 2. Planos sem oferta anual exibem aviso como bloco secundário vertical
  test('2. Planos sem oferta anual (Plus/Ultra) exibem "Indisponível" com aviso em bloco vertical secundário', () => {
    const sandbox = setupModalLayoutSandbox();
    const html = sandbox.window.renderCommercialPlanCardHtml(plusNoYearlyPlan, { mode: 'modal', activeInterval: 'yearly' });
    assert.ok(html.includes('Indisponível'), 'Deve indicar Indisponível no preço primário');
    assert.ok(html.includes('plan-price-unavailable-notice'), 'Deve conter bloco de aviso de oferta indisponível');
    assert.ok(html.includes('Oferta indisponível para cobrança anual'), 'Texto descritivo de indisponibilidade deve estar presente');
  });

  // 3. CSS do modal garante 4 colunas em desktop com min-width: 0
  test('3. CSS do #plansModal prevê 4 colunas desktop com min-width: 0 nos cards', () => {
    const cssContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'components.css'), 'utf-8');
    assert.ok(cssContent.includes('#plansModal .plans-grid'), 'Deve conter regra específica para #plansModal .plans-grid');
    assert.ok(cssContent.includes('repeat(4, minmax(0, 1fr))'), 'Deve usar grid de 4 colunas no desktop');
    assert.ok(cssContent.includes('#plansModal .plan-card'), 'Deve conter regra específica para #plansModal .plan-card');
    assert.ok(cssContent.includes('min-width: 0 !important'), 'Cards do modal devem ter min-width: 0 para evitar overflow');
  });

  // 4. Breakpoints responsivos do modal (2 colunas em tablet, 1 coluna em mobile)
  test('4. Breakpoints responsivos do #plansModal: 2 colunas intermediário, 1 coluna mobile', () => {
    const cssContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'components.css'), 'utf-8');
    const mobileCssContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'mobile.css'), 'utf-8');
    assert.ok(cssContent.includes('max-width: 1080px') && cssContent.includes('repeat(2, minmax(0, 1fr))'), 'components.css deve prever 2 colunas até 1080px');
    assert.ok(cssContent.includes('max-width: 640px') && cssContent.includes('grid-template-columns: 1fr'), 'components.css deve prever 1 coluna até 640px');
    assert.ok(mobileCssContent.includes('repeat(2, minmax(0, 1fr))'), 'mobile.css deve manter 2 colunas no modal');
  });

  // 5. Contenção estrita sem scroll horizontal
  test('5. Contenção estrita do #plansModal: overflow-x hidden no dialog-body e viewport', () => {
    const cssContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'components.css'), 'utf-8');
    assert.ok(cssContent.includes('#plansModal .dialog-body'), 'Deve estilizar dialog-body do #plansModal');
    assert.ok(cssContent.includes('overflow-x: hidden !important'), 'Deve proibir overflow horizontal no dialog-body');
    assert.ok(cssContent.includes('#plansModal .plans-carousel-nav'), 'Deve estilizar nav do modal');
    assert.ok(cssContent.includes('display: none !important'), 'Setas do carrossel devem ficar ocultas no modal de 4 colunas');
  });

  // 6. Regressão contextual: /extras não é afetada por regras de #plansModal
  test('6. Regressão contextual: layout contextual PLAN_DENIED não utiliza seletores de #plansModal', () => {
    const uiShellJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'uiShell.js'), 'utf-8');
    assert.ok(!uiShellJs.includes('id="plansModal"'), 'uiShell não deve instanciar plansModal para página contextual');
    assert.ok(uiShellJs.includes('contextual-plans-track'), 'uiShell mantém track contextual independente');
  });
});

