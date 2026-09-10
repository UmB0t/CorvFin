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

    // Filho real deve ser mantido no DOM como preview seguro (sem display: none, com inert e aria-hidden)
    assert.equal(container.classList.contains('tab-content--plan-locked'), true, 'Container deve receber classe tab-content--plan-locked');
    assert.equal(childEl.style.display !== 'none', true, 'Filho deve permanecer visível como preview');
    assert.equal(childEl.getAttribute('aria-hidden'), 'true', 'Filho deve possuir aria-hidden');
    assert.equal(childEl.getAttribute('inert'), '', 'Filho deve possuir inert');

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

    // Conteúdo protegido sob locked preview
    assert.equal(container.classList.contains('tab-content--plan-locked'), true, 'Container deve receber classe tab-content--plan-locked');
    assert.equal(childEl.getAttribute('aria-hidden'), 'true');
    assert.equal(childEl.getAttribute('inert'), '');

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

describe('CORVFIN V2 — Fase 5H.1: Locked Module Experience', () => {

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

  // 4. clique no item PLAN_DENIED: abre a view bloqueada correta
  test('4. clique no item PLAN_DENIED: abre a view bloqueada correta', () => {
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
    const overlay = container.querySelector('.access-denied-screen-overlay');
    assert.ok(overlay, 'Overlay de acesso bloqueado deve ter sido injetado');
    assert.ok(overlay.classList.contains('plan-denied'), 'Overlay deve ser da classe plan-denied');
  });

  // 5. preview estrutural aparece por trás do overlay
  test('5. preview estrutural aparece por trás do overlay', () => {
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
    assert.equal(grid.style.display !== 'none', true, 'Grid de seções deve permanecer no DOM');
    const overlay = container.querySelector('.access-denied-screen-overlay.plan-denied');
    assert.ok(overlay, 'Overlay deve estar posicionado sobre o preview');
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

  // 7. preview não permite pointer interaction
  test('7. preview não permite pointer interaction', () => {
    assert.ok(componentsCssContent.includes('.tab-content.tab-content--plan-locked > *:not(.access-denied-screen-overlay)'), 'components.css deve definir regra para filhos do preview');
    assert.ok(componentsCssContent.includes('pointer-events: none !important;'), 'Preview deve ter pointer-events: none !important');
    assert.ok(componentsCssContent.includes('user-select: none !important;'), 'Preview deve ter user-select: none');
  });

  // 8. preview não permite foco/keyboard nos controles internos
  test('8. preview não permite foco/keyboard nos controles internos', () => {
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
  });

  // 9. CTA "Ver Planos" funciona
  test('9. CTA "Ver Planos" funciona', () => {
    let modalOpened = false;
    const user = { id: 'u1', is_admin: false, permissions: { extras: true } };
    const commercialContext = {
      access: { extras: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);
    sandbox.window.openCommercialPlansModal = () => { modalOpened = true; };

    const container = sandbox.$('#tab-extras');
    sandbox.window.checkModuleAccess('tab-extras');

    const overlay = container.querySelector('.access-denied-screen-overlay');
    assert.ok(overlay);
    const upgradeBtn = overlay.querySelector('#btnAccessDeniedUpgrade');
    assert.ok(upgradeBtn, 'Card deve conter #btnAccessDeniedUpgrade');
    upgradeBtn.click();

    assert.equal(modalOpened, true, 'Clique no botão deve invocar openCommercialPlansModal');
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
  });

  // 12. acesso direto por rota/hash continua bloqueado
  test('12. acesso direto por rota/hash continua bloqueado', () => {
    const user = { id: 'u1', is_admin: false, permissions: { extras: true } };
    const commercialContext = {
      access: { extras: { planAllowed: false, permissionAllowed: true, effectiveAllowed: false } }
    };
    const sandbox = setupUiShellSandbox(user, commercialContext);
    sandbox.window.location.pathname = '/extras';

    sandbox.window.syncRouteFromLocation();

    const container = sandbox.$('#tab-extras');
    assert.ok(container.classList.contains('tab-content--plan-locked'));
    const overlay = container.querySelector('.access-denied-screen-overlay.plan-denied');
    assert.ok(overlay);
    assert.equal(overlay.style.display !== 'none', true);
  });

  // 13. mobile 360/390/430 sem overflow
  test('13. mobile 360/390/430 sem overflow', () => {
    assert.ok(mobileCssContent.includes('.module-locked-card'), 'mobile.css deve conter estilos para .module-locked-card');
    assert.ok(mobileCssContent.includes('max-width: 100% !important;'), 'Card no mobile deve ter max-width 100%');
    assert.ok(componentsCssContent.includes('overflow-x: hidden;'), 'Container bloqueado deve ter overflow-x: hidden');
    assert.ok(mobileCssContent.includes('@media (max-width: 360px)'), 'mobile.css deve cobrir 360px');
    assert.ok(mobileCssContent.includes('@media (max-width: 390px)'), 'mobile.css deve cobrir 390px');
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

    const overlay = container.querySelector('.access-denied-screen-overlay');
    const html = overlay.innerHTML;

    assert.ok(!html.includes('Plano Starter'), 'Não deve conter nome fixo Starter');
    assert.ok(!html.includes('Plano Pro'), 'Não deve conter nome fixo Pro');
    assert.ok(!html.includes('Plano Ultra'), 'Não deve conter nome fixo Ultra');
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

    // ASSERT 2: shell/skeleton seguro permanece
    const skeletonRows = listFixed.querySelectorAll('.module-locked-skeleton-row');
    assert.ok(skeletonRows.length > 0, 'Skeletons neutros devem ter sido inseridos em listFixed');
    assert.equal(sumFixed.textContent, 'R$ 0,00', 'Total sumFixed deve ter sido resetado para R$ 0,00');
    assert.equal(metricVal.textContent, 'R$ 0,00', 'Métrica metricVal deve ter sido resetada para R$ 0,00');

    // ASSERT 3: overlay PLAN_DENIED existe e contém CTA Ver Planos
    const overlay = container.querySelector('.access-denied-screen-overlay.plan-denied');
    assert.ok(overlay, 'Overlay plan-denied deve existir');
    const ctaBtn = overlay.querySelector('#btnAccessDeniedUpgrade');
    assert.ok(ctaBtn, 'CTA #btnAccessDeniedUpgrade deve existir');

    // ASSERT 4: conteúdo subjacente está inerte
    assert.equal(listFixed.getAttribute('inert'), '', 'Elemento listFixed deve ter inert');
    assert.equal(listFixed.getAttribute('aria-hidden'), 'true', 'Elemento listFixed deve ter aria-hidden true');

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

    // Overlay deve estar oculto
    const overlay = container.querySelector('.access-denied-screen-overlay');
    assert.equal(overlay.style.display, 'none', 'Overlay deve estar display: none');

    // Interatividade deve estar restaurada
    assert.equal(listFixed.getAttribute('inert'), null, 'inert deve ser removido');
    assert.equal(listFixed.getAttribute('aria-hidden'), null, 'aria-hidden deve ser removido');

    // Renderer normal executou e dados autorizados foram reconstruídos
    assert.equal(reRendered, true, 'renderTabContent deve ter sido chamado para reconstruir dados');
    assert.ok(container.textContent.includes('DESPESA_AUTORIZADA_RECUPERADA'), 'Dados reconstruídos devem estar no DOM');
    assert.equal(container.querySelectorAll('.module-locked-skeleton-row').length, 0, 'Nenhum skeleton deve permanecer preso no DOM');
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
    assert.ok(grid.innerHTML.includes('CorvFin Ultra - Per Year'), 'Grid deve renderizar o plano quando backend envia { plans }');
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
    assert.ok(grid.innerHTML.includes('CorvFin Ultra - Per Year'), 'Grid deve renderizar plano quando backend envia { data }');
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

  test('HF-6. CSS do preview bloqueado não possui min-height artificial de 480px e possui overlay translúcido suave', () => {
    const cssContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'components.css'), 'utf-8');

    // Verifica que não há min-height: 480px em .tab-content--plan-locked
    const planLockedBlock = cssContent.match(/\.tab-content\.tab-content--plan-locked\s*\{([^}]+)\}/);
    assert.ok(planLockedBlock, 'Deve existir bloco .tab-content.tab-content--plan-locked');
    assert.ok(!planLockedBlock[1].includes('min-height: 480px'), 'Não deve ter min-height fixa de 480px');
    assert.ok(planLockedBlock[1].includes('min-height: 100%'), 'Deve ter min-height: 100%');

    // Verifica opacidade e blur do preview de fundo
    const previewBlock = cssContent.match(/\.tab-content\.tab-content--plan-locked\s*>\s*\*:not\(\.access-denied-screen-overlay\)\s*\{([^}]+)\}/);
    assert.ok(previewBlock, 'Deve existir bloco de preview de fundo');
    assert.ok(previewBlock[1].includes('opacity: 0.52'), 'Opacidade deve ser suave (0.52)');
    assert.ok(previewBlock[1].includes('filter: blur(2px)'), 'Blur deve ser sutil (2px)');

    // Verifica overlay translúcido sem backdrop-filter duplicado
    const overlayBlock = cssContent.match(/\.access-denied-screen-overlay\.plan-denied\.module-locked-overlay\s*\{([^}]+)\}/);
    assert.ok(overlayBlock, 'Deve existir bloco .module-locked-overlay');
    assert.ok(overlayBlock[1].includes('background: rgba(15, 23, 42, 0.08)'), 'Overlay deve usar camada translúcida leve');
    assert.ok(!overlayBlock[1].includes('backdrop-filter: blur(3px)'), 'Não deve duplicar blur com backdrop-filter pesado no overlay');
  });

});

