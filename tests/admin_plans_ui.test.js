/**
 * Testes Unitários e Contratuais da Interface Administrativa (Lote 5E)
 * Validação do Catálogo de Planos, Atribuição a Usuários, Semântica de Limites,
 * Conversão Monetária (amountCents), Prevenção de N+1 e Regressões.
 */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const adminJsCode = fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8');
const apiJsCode = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');

function createAdminSandbox(overrides = {}) {
  const elements = {};
  const eventListeners = {};

  function createElementMock(tagName, id = '') {
    const el = {
      tagName: tagName.toUpperCase(),
      id,
      className: '',
      value: '',
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false,
        toggle: () => {}
      },
      style: {},
      hidden: false,
      attributes: {},
      children: [],
      innerHTMLValue: '',
      set innerHTML(html) {
        this.innerHTMLValue = html;
      },
      get innerHTML() {
        return this.innerHTMLValue;
      },
      setAttribute(name, val) {
        this.attributes[name] = String(val);
      },
      getAttribute(name) {
        return this.attributes[name] !== undefined ? this.attributes[name] : null;
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      addEventListener(event, fn) {
        if (!eventListeners[this.id || tagName]) eventListeners[this.id || tagName] = {};
        if (!eventListeners[this.id || tagName][event]) eventListeners[this.id || tagName][event] = [];
        eventListeners[this.id || tagName][event].push(fn);
      },
      querySelector(sel) {
        return null;
      },
      querySelectorAll(sel) {
        return [];
      },
      showModal() {},
      close() {}
    };
    return el;
  }

  const documentMock = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: (id) => {
      if (!elements[id]) {
        elements[id] = createElementMock('div', id);
      }
      return elements[id];
    },
    createElement: (tag) => {
      return createElementMock(tag);
    },
    querySelector: (sel) => null,
    querySelectorAll: (sel) => [],
    body: createElementMock('body', 'body')
  };

  const sandbox = {
    window: {},
    document: documentMock,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    confirm: () => true,
    alert: () => {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: () => {},
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    }
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(apiJsCode, sandbox);
  vm.runInContext(adminJsCode, sandbox);

  // Evita efeitos colaterais de toast/DOM assíncrono em testes
  sandbox.window.showToast = () => {};
  sandbox.window.notify = () => {};
  sandbox.showToast = () => {};
  sandbox.notify = () => {};

  if (overrides.API) {
    Object.assign(sandbox.API, overrides.API);
  }
  Object.assign(sandbox, overrides);

  return { sandbox, elements, eventListeners };
}

describe('Lote 5E — Helpers Monetários e Conversão de amountCents', () => {
  const { sandbox } = createAdminSandbox();
  const Admin = sandbox.AdminModule;

  test('parseCurrencyToCents converte valores monetários com precisão exata', () => {
    assert.equal(Admin.parseCurrencyToCents('R$ 0,00'), 0);
    assert.equal(Admin.parseCurrencyToCents('0'), 0);
    assert.equal(Admin.parseCurrencyToCents(0), 0);
    assert.equal(Admin.parseCurrencyToCents('R$ 29,90'), 2990);
    assert.equal(Admin.parseCurrencyToCents('29,90'), 2990);
    assert.equal(Admin.parseCurrencyToCents('29.90'), 2990);
    assert.equal(Admin.parseCurrencyToCents('R$ 100,00'), 10000);
    assert.equal(Admin.parseCurrencyToCents('100'), 10000);
    assert.equal(Admin.parseCurrencyToCents('1.250,50'), 125050);
  });

  test('parseCurrencyToCents rejeita valores monetários inválidos ou negativos', () => {
    assert.equal(Admin.parseCurrencyToCents('invalido'), null);
    assert.equal(Admin.parseCurrencyToCents('-10,00'), null);
    assert.equal(Admin.parseCurrencyToCents(-50), null);
    assert.equal(Admin.parseCurrencyToCents('abc29,90'), null);
  });

  test('formatCentsToCurrency formata centavos inteiros para exibição sem perda', () => {
    assert.equal(Admin.formatCentsToCurrency(0), '0,00');
    assert.equal(Admin.formatCentsToCurrency(2990), '29,90');
    assert.equal(Admin.formatCentsToCurrency(10000), '100,00');
    assert.equal(Admin.formatCentsToCurrency(125050), '1.250,50');
  });

  test('Ida e volta monetária não perde centavos', () => {
    const testCases = [0, 1, 99, 100, 2990, 4990, 9999, 100000];
    for (const cents of testCases) {
      const formatted = Admin.formatCentsToCurrency(cents);
      const parsed = Admin.parseCurrencyToCents(formatted);
      assert.equal(parsed, cents, `Falha de ida e volta para ${cents} centavos`);
    }
  });

  test('slugify gera sugestão canônica em formato kebab-case compatível com backend (5E.1)', () => {
    // Exemplos obrigatórios do contrato
    assert.equal(Admin.slugify('CorvFin Pro'), 'corvfin-pro');
    assert.equal(Admin.slugify('Plano Básico'), 'plano-basico');
    assert.equal(Admin.slugify('Premium Mensal'), 'premium-mensal');
    assert.equal(Admin.slugify('Plano 2026'), 'plano-2026');

    // Casos de robustez
    assert.equal(Admin.slugify('Plano   Múltiplos    Espaços'), 'plano-multiplos-espacos');
    assert.equal(Admin.slugify('  Ação & Teste  '), 'acao-teste');
    assert.equal(Admin.slugify('Plano Família 2.0!'), 'plano-familia-2-0');
    assert.equal(Admin.slugify('plano_com_underscore'), 'plano-com-underscore');
    assert.equal(Admin.slugify('---hifen-inicio-e-fim---'), 'hifen-inicio-e-fim');
    assert.equal(Admin.slugify('plano--duplo---hifen'), 'plano-duplo-hifen');

    // Invariantes estritos: nenhum underscore, nenhum hífen nas pontas, nenhum hífen duplicado
    const sampleOutputs = [
      Admin.slugify('CorvFin Pro Per Month'),
      Admin.slugify('Plano Básico 2026!'),
      Admin.slugify('_plan_underscore_')
    ];
    for (const slug of sampleOutputs) {
      assert.doesNotMatch(slug, /_/, `Slug "${slug}" não pode conter underscore`);
      assert.doesNotMatch(slug, /^-|-$/, `Slug "${slug}" não pode começar nem terminar com hífen`);
      assert.doesNotMatch(slug, /--/, `Slug "${slug}" não pode conter hífens duplicados`);
    }
  });
});

describe('Lote 5E — Ausência de N+1 e Semântica de planId na Tabela de Usuários', () => {
  test('Renderização de usuários correlaciona planId localmente com ZERO chamadas N+1', async () => {
    const mockPlans = [
      { _id: 'plan_free_default', name: 'Plano Gratuito', status: 'active', isDefault: true },
      { _id: 'plan_pro', name: 'Plano Pro', status: 'active', isDefault: false },
      { _id: 'plan_legacy_inact', name: 'Plano Legado Inativo', status: 'inactive', isDefault: false },
      { _id: 'plan_arch', name: 'Plano Descontinuado', status: 'archived', isDefault: false }
    ];

    const mockUsers = [
      { id: 'usr_1', nome: 'Carlos Padrão', login: 'carlos', email: 'carlos@corvfin.com', planId: null }, // legado
      { id: 'usr_2', nome: 'Maria Pro', login: 'maria', email: 'maria@corvfin.com', planId: 'plan_pro' }, // ativo
      { id: 'usr_3', nome: 'João Inativo', login: 'joao', email: 'joao@corvfin.com', planId: 'plan_legacy_inact' }, // inativo
      { id: 'usr_4', nome: 'Pedro Arquivado', login: 'pedro', email: 'pedro@corvfin.com', planId: 'plan_arch' }, // arquivado
      { id: 'usr_5', nome: 'Ana Quebrado', login: 'ana', email: 'ana@corvfin.com', planId: 'plan_non_existent' } // quebrado
    ];

    let getUserPlanCalls = 0;
    let getUsersCalls = 0;
    let getPlansCalls = 0;

    const { sandbox, elements } = createAdminSandbox({
      API: {
        getUser: () => ({ id: 'admin_1', is_admin: true }),
        getUsers: async () => {
          getUsersCalls++;
          return { success: true, users: mockUsers };
        },
        getPlans: async () => {
          getPlansCalls++;
          return { success: true, plans: mockPlans };
        },
        getPlansRegistry: async () => ({ success: true, resources: [] }),
        getUserPlan: async (userId) => {
          getUserPlanCalls++;
          return { success: true };
        },
        getDefaultPermissions: async () => ({ success: true, permissions: {} }),
        getMaintenanceConfig: async () => ({ success: true, maintenance: {} }),
        getEmailSettings: async () => ({ success: true, settings: {} })
      }
    });

    const Admin = sandbox.AdminModule;
    await Admin.render();

    // Verificação de N+1 estrita
    assert.equal(getUsersCalls, 1, 'getUsers deve ser chamado exatamente 1 vez');
    assert.equal(getPlansCalls, 1, 'getPlans deve ser chamado exatamente 1 vez');
    assert.equal(getUserPlanCalls, 0, 'getUserPlan NÃO pode ser chamado durante a listagem (eliminação de N+1)');

    const tableHtml = elements.adminUsersTableBody.innerHTML;

    // 1. Usuário sem planId -> exibido como Herdado do Padrão
    assert.match(tableHtml, /Plano Gratuito \(Herdado\)/, 'Usuário sem planId deve herdar o nome do default com tag Herdado');
    assert.match(tableHtml, /badge neutral/, 'Usuário sem planId deve ter badge neutral');

    // 2. planId válido ativo -> vínculo explícito
    assert.match(tableHtml, /badge success">Plano Pro<\/span>/, 'Plano ativo deve ter badge success');

    // 3. planId válido inativo -> vínculo visível com tag Inativo
    assert.match(tableHtml, /badge warning[^>]*>Plano Legado Inativo \(Inativo\)<\/span>/, 'Plano inativo deve ter badge warning');

    // 4. planId válido arquivado -> vínculo visível com tag Arquivado
    assert.match(tableHtml, /badge danger[^>]*>Plano Descontinuado \(Arquivado\)<\/span>/, 'Plano arquivado deve ter badge danger');

    // 5. planId quebrado -> Inválido sem mascaramento nem fallback!
    assert.match(tableHtml, /Inválido \(plan_non_existent\)/, 'Referência quebrada deve exibir o planId com tag Inválido');
    assert.doesNotMatch(tableHtml, /plan_non_existent.*Herdado/, 'Referência quebrada NÃO pode exibir como herdado');
  });

  test('renderUserPlanBadge preserva estritamente a semântica isolada', () => {
    const { sandbox } = createAdminSandbox();
    const Admin = sandbox.AdminModule;

    Admin.setPlansList([
      { _id: 'plan_free', name: 'Free', status: 'active', isDefault: true },
      { _id: 'plan_pro', name: 'Pro', status: 'active', isDefault: false },
      { _id: 'plan_inact', name: 'Old', status: 'inactive', isDefault: false }
    ]);

    // Legado sem planId
    const badgeNull = Admin.renderUserPlanBadge({ id: 'u1', planId: null });
    assert.match(badgeNull, /Free \(Herdado\)/);
    assert.match(badgeNull, /badge neutral/);

    const badgeUndef = Admin.renderUserPlanBadge({ id: 'u2' });
    assert.match(badgeUndef, /Free \(Herdado\)/);

    // Ativo
    const badgeActive = Admin.renderUserPlanBadge({ id: 'u3', planId: 'plan_pro' });
    assert.match(badgeActive, /badge success">Pro<\/span>/);

    // Inativo
    const badgeInactive = Admin.renderUserPlanBadge({ id: 'u4', planId: 'plan_inact' });
    assert.match(badgeInactive, /badge warning[^>]*>Old \(Inativo\)<\/span>/);

    // Inválido (inexistente)
    const badgeInvalid = Admin.renderUserPlanBadge({ id: 'u5', planId: 'ghost_plan_999' });
    assert.match(badgeInvalid, /badge danger[^>]*>Inválido \(ghost_plan_999\)<\/span>/);
    assert.doesNotMatch(badgeInvalid, /Free/);
    assert.doesNotMatch(badgeInvalid, /Herdado/);
  });
});

describe('Lote 5E — Subabas e Catálogo de Planos Comerciais', () => {
  test('switchSubTab alterna corretamente entre Usuários e Planos', () => {
    const { sandbox, elements } = createAdminSandbox();
    const Admin = sandbox.AdminModule;

    Admin.switchSubTab('plans');
    assert.equal(Admin.getCurrentSubTab(), 'plans');
    assert.equal(elements.adminViewUsers.hidden, true);
    assert.equal(elements.adminViewPlans.hidden, false);
    assert.equal(elements.adminUsersSubTabBtn.className, 'btn small soft');
    assert.equal(elements.adminPlansSubTabBtn.className, 'btn small primary');

    Admin.switchSubTab('users');
    assert.equal(Admin.getCurrentSubTab(), 'users');
    assert.equal(elements.adminViewUsers.hidden, false);
    assert.equal(elements.adminViewPlans.hidden, true);
    assert.equal(elements.adminUsersSubTabBtn.className, 'btn small primary');
    assert.equal(elements.adminPlansSubTabBtn.className, 'btn small soft');
  });

  test('renderPlansTable renderiza linhas com preços, status e limites notáveis', () => {
    const { sandbox, elements } = createAdminSandbox();
    const Admin = sandbox.AdminModule;

    Admin.setPlansRegistry({
      resources: [
        { key: 'dashboard', label: 'Dashboard' },
        { key: 'despesas', label: 'Despesas' },
        { key: 'devedores', label: 'Devedores', availableLimits: [{ key: 'maxItems', label: 'Máx Devedores' }] },
        { key: 'ai', label: 'Assistente IA', availableLimits: [{ key: 'questionsPerDay', label: 'Perguntas/dia' }] }
      ]
    });

    Admin.setPlansList([
      {
        _id: 'plan_free',
        name: 'Plano Free',
        slug: 'plan_free',
        status: 'active',
        isDefault: true,
        pricing: { amountCents: 0, interval: 'month' },
        entitlements: {
          dashboard: { enabled: true },
          devedores: { enabled: true, limits: { maxItems: 5 } },
          ai: { enabled: false }
        }
      },
      {
        _id: 'plan_pro',
        name: 'Plano Pro Master',
        slug: 'plan_pro_master',
        status: 'active',
        isDefault: false,
        pricing: { amountCents: 4990, interval: 'month' },
        entitlements: {
          dashboard: { enabled: true },
          devedores: { enabled: true, limits: { maxItems: null } }, // ilimitado
          ai: { enabled: true, limits: { questionsPerDay: 100 } }
        }
      }
    ]);

    Admin.renderPlansTable();

    const tableHtml = elements.adminPlansTableBody.innerHTML;
    assert.match(tableHtml, /Plano Free/);
    assert.match(tableHtml, /R\$ 0,00 \/ mês/);
    assert.match(tableHtml, /Plano Pro Master/);
    assert.match(tableHtml, /R\$ 49,90 \/ mês/);
    assert.match(tableHtml, /Devedores: 5/);
    assert.match(tableHtml, /Devedores: Ilimitado/);
    assert.match(tableHtml, /IA: 100\/dia/);
  });
});

describe('Lote 5E — Métodos da API Client (public/js/api.js)', () => {
  test('API Client expõe os 9 endpoints administrativos de planos e usuários', () => {
    const { sandbox } = createAdminSandbox();
    const API = sandbox.API;

    assert.equal(typeof API.getPlansRegistry, 'function');
    assert.equal(typeof API.getPlans, 'function');
    assert.equal(typeof API.getPlanById, 'function');
    assert.equal(typeof API.createPlan, 'function');
    assert.equal(typeof API.updatePlan, 'function');
    assert.equal(typeof API.setPlanStatus, 'function');
    assert.equal(typeof API.setDefaultPlan, 'function');
    assert.equal(typeof API.assignUserPlan, 'function');
    assert.equal(typeof API.getUserPlan, 'function');
  });
});

describe('Lote 5E — Regressão da Gestão Existente de Usuários', () => {
  test('Paginação e gerenciamento de permissões RBAC continuam funcionais', () => {
    const { sandbox } = createAdminSandbox();
    const Admin = sandbox.AdminModule;

    const fakeUsers = [];
    for (let i = 1; i <= 25; i++) {
      fakeUsers.push({
        id: `u_${i}`,
        nome: `Usuário ${i}`,
        login: `user${i}`,
        email: `u${i}@corvfin.com`,
        is_admin: false,
        permissions: { dashboard: true, despesas: true }
      });
    }

    Admin.setUsersList(fakeUsers);
    assert.equal(Admin.getTotalPages(), 3);
    assert.equal(Admin.getCurrentPage(), 1);

    Admin.nextPage();
    assert.equal(Admin.getCurrentPage(), 2);

    Admin.nextPage();
    assert.equal(Admin.getCurrentPage(), 3);

    Admin.nextPage(); // não pode passar de 3
    assert.equal(Admin.getCurrentPage(), 3);

    Admin.prevPage();
    assert.equal(Admin.getCurrentPage(), 2);

    Admin.goToPage(1);
    assert.equal(Admin.getCurrentPage(), 1);
  });
});

describe('Lote 5E — Ações de Planos (Lifecycle, Default, Atribuição e Restrições de PUT)', () => {
  test('handleSetDefaultPlan aciona POST e rejeita planos que não sejam active', async () => {
    let setDefaultPlanCalledWith = null;

    const { sandbox } = createAdminSandbox({
      API: {
        setDefaultPlan: async (planId) => {
          setDefaultPlanCalledWith = planId;
          return { success: true, plan: { _id: planId, isDefault: true } };
        },
        getPlans: async () => ({ success: true, plans: [] })
      },
      confirm: () => true
    });

    const Admin = sandbox.AdminModule;
    Admin.setPlansList([
      { _id: 'plan_active_1', name: 'Plano Ativo 1', status: 'active', isDefault: false },
      { _id: 'plan_inact_1', name: 'Plano Inativo 1', status: 'inactive', isDefault: false }
    ]);

    // Tentativa em plano inativo -> não dispara API
    await Admin.handleSetDefaultPlan('plan_inact_1');
    assert.equal(setDefaultPlanCalledWith, null, 'Não deve chamar setDefaultPlan para plano inativo');

    // Tentativa em plano ativo -> dispara API
    await Admin.handleSetDefaultPlan('plan_active_1');
    assert.equal(setDefaultPlanCalledWith, 'plan_active_1', 'Deve chamar setDefaultPlan com planId ativo');
  });

  test('openAssignPlanModal disponibiliza apenas planos active para nova atribuição', () => {
    const { sandbox, elements } = createAdminSandbox();
    const Admin = sandbox.AdminModule;

    Admin.setPlansList([
      { _id: 'plan_free', name: 'Plano Free', status: 'active', isDefault: true },
      { _id: 'plan_pro', name: 'Plano Pro', status: 'active', isDefault: false },
      { _id: 'plan_old', name: 'Plano Antigo', status: 'inactive', isDefault: false },
      { _id: 'plan_disc', name: 'Plano Descontinuado', status: 'archived', isDefault: false }
    ]);

    Admin.setUsersList([
      { id: 'usr_inact', nome: 'Usuário Com Inativo', login: 'user_inact', email: 'inact@corvfin.com', planId: 'plan_old' }
    ]);

    Admin.openAssignPlanModal('usr_inact');

    const modalHtml = elements.adminAssignPlanDialog.innerHTML;

    // Plano atual inativo deve aparecer disabled/selecionado como atual
    assert.match(modalHtml, /Plano Antigo \(Inativo - Atual\)/, 'Plano inativo atual deve ser exibido como atual');
    assert.match(modalHtml, /disabled selected/, 'Plano atual inativo deve estar desabilitado para seleção');

    // Somente planos ativos como opções selecionáveis
    assert.match(modalHtml, /value="plan_free"/);
    assert.match(modalHtml, /value="plan_pro"/);
    // Plano arquivado NÃO pode aparecer como opção selecionável
    assert.doesNotMatch(modalHtml, /value="plan_disc"/, 'Plano arquivado não deve aparecer como nova opção');
  });

  test('Edição de plano não permite mutação de slug, status ou isDefault (omissão do PUT)', async () => {
    let updatePlanPayload = null;

    const { sandbox, elements } = createAdminSandbox({
      API: {
        updatePlan: async (planId, payload) => {
          updatePlanPayload = payload;
          return { success: true, plan: { _id: planId, ...payload } };
        },
        getPlansRegistry: async () => ({
          success: true,
          resources: [{ key: 'dashboard', label: 'Dashboard' }]
        }),
        getPlans: async () => ({ success: true, plans: [] })
      }
    });

    const Admin = sandbox.AdminModule;
    Admin.setPlansList([
      {
        _id: 'plan_pro',
        name: 'Pro',
        slug: 'plan_pro',
        status: 'active',
        isDefault: false,
        pricing: { amountCents: 2990, currency: 'BRL', interval: 'month' },
        entitlements: { dashboard: { enabled: true } },
        metadata: { displayOrder: 1 }
      }
    ]);

    await Admin.openEditPlanModal('plan_pro');

    const formHtml = elements.adminPlanEditDialog.innerHTML;
    assert.match(formHtml, /disabled readonly/, 'Slug deve ser renderizado como disabled/readonly na edição');
    assert.match(formHtml, /Imutável/, 'Slug deve ter aviso visual de imutável');

    // Dispara o submit do formulário de edição
    const form = elements.adminPlanEditDialog.children[0];
    const submitHandler = elements['adminPlanEditDialog']?.submit || elements['adminPlanEditDialog']?.['formAdminEditPlan']?.submit;

    // Verificação de contrato direto no formulário:
    // Whitelist estrita do PUT: name, description, pricing, entitlements, metadata.
    // Garantir que slug, status, isDefault NÃO façam parte dos campos do PUT.
    assert.doesNotMatch(formHtml, /name="slug"/);
    assert.doesNotMatch(formHtml, /name="status"/);
    assert.doesNotMatch(formHtml, /name="isDefault"/);
  });

  test('Registry canônico dirige dinamicamente a UI sem catálogo fixo frontend', () => {
    const { sandbox } = createAdminSandbox();
    const Admin = sandbox.AdminModule;

    // Injeta um registry customizado/arbitrário que não corresponde aos 10 módulos padrão
    Admin.setPlansRegistry({
      resources: [
        {
          key: 'custom_service_x',
          label: 'Serviço Customizado X',
          description: 'Recurso dinâmico injetado via API',
          supportsAccessToggle: true,
          availableLimits: [
            { key: 'maxConcurrent', label: 'Concorrência Máxima', min: 0 }
          ]
        },
        {
          key: 'custom_service_y',
          label: 'Serviço Customizado Y',
          description: 'Recurso sem toggle de acesso',
          supportsAccessToggle: false,
          availableLimits: []
        }
      ]
    });

    const html = Admin.buildDynamicEntitlementsHtml({
      custom_service_x: { enabled: true, limits: { maxConcurrent: 10 } },
      custom_service_y: { enabled: true }
    });

    assert.match(html, /Serviço Customizado X/);
    assert.match(html, /Concorrência Máxima/);
    assert.match(html, /Serviço Customizado Y/);
    assert.match(html, /Sempre Ativo/);
  });

  test('extractEntitlementsFromForm preserva estritamente limites null (ilimitado) e 0 (zero)', () => {
    const { sandbox } = createAdminSandbox();
    const Admin = sandbox.AdminModule;

    Admin.setPlansRegistry({
      resources: [
        {
          key: 'resource_a',
          label: 'Recurso A',
          supportsAccessToggle: true,
          availableLimits: [
            { key: 'limitZero', label: 'Limite Zero', min: 0 },
            { key: 'limitUnlimited', label: 'Limite Ilimitado', min: 0 },
            { key: 'limitPositive', label: 'Limite Positivo', min: 0 }
          ]
        }
      ]
    });

    // Mock container with inputs
    const mockContainer = {
      querySelector: (selector) => {
        if (selector.includes('.plan-res-toggle')) {
          return { checked: true };
        }
        if (selector.includes('.plan-limit-unlimited')) {
          if (selector.includes('limitUnlimited')) {
            return { checked: true }; // Ilimitado marcado
          }
          return { checked: false }; // Ilimitado desmarcado
        }
        if (selector.includes('.plan-limit-input')) {
          if (selector.includes('limitZero')) {
            return { value: '0' }; // Valor 0 explícito
          }
          if (selector.includes('limitPositive')) {
            return { value: '42' }; // Valor 42
          }
          return { value: '' };
        }
        return null;
      },
      querySelectorAll: () => []
    };

    const extracted = Admin.extractEntitlementsFromForm(mockContainer);

    assert.equal(extracted.resource_a.enabled, true);
    assert.strictEqual(extracted.resource_a.limits.limitUnlimited, null, 'Limite ilimitado deve ser null');
    assert.strictEqual(extracted.resource_a.limits.limitZero, 0, 'Limite zero deve ser preservado como 0 numérico');
    assert.strictEqual(extracted.resource_a.limits.limitPositive, 42, 'Limite positivo deve ser número');
  });
});

describe('Lote 5E.1 — Sugestão e Envio de Slug no Modal de Criação de Planos', () => {
  test('Digitação do nome do plano sugere slug kebab-case sem prefixo forçado e sem underscore', async () => {
    let createPlanPayload = null;

    const { sandbox, elements, eventListeners } = createAdminSandbox({
      API: {
        createPlan: async (payload) => {
          createPlanPayload = payload;
          return { success: true, plan: { _id: 'plan_new', ...payload } };
        }
      }
    });
    const Admin = sandbox.AdminModule;

    await Admin.openCreatePlanModal();

    const nameInput = elements.adminCreatePlanName;
    const slugInput = elements.adminCreatePlanSlug;

    assert.ok(nameInput, 'Input de nome deve existir');
    assert.ok(slugInput, 'Input de slug deve existir');

    // 1. Digita "CorvFin Pro Per Month" no nome -> sugestão automática compatível
    nameInput.value = 'CorvFin Pro Per Month';
    const nameInputListeners = eventListeners['adminCreatePlanName']?.['input'] || [];
    assert.ok(nameInputListeners.length > 0, 'Deve haver listener de input no nameInput');
    nameInputListeners.forEach(fn => fn());

    assert.equal(slugInput.value, 'corvfin-pro-per-month', 'Slug deve ser corvfin-pro-per-month sem prefixo plan_ e sem underscore');
    assert.doesNotMatch(slugInput.value, /_/, 'Slug não pode conter underscore');

    // 2. Submissão do formulário envia o slug correto no payload
    const formListeners = eventListeners['formAdminCreatePlan']?.['submit'] || [];
    assert.ok(formListeners.length > 0, 'Deve haver listener de submit no formulário');

    let defaultPrevented = false;
    await formListeners[0]({ preventDefault: () => { defaultPrevented = true; } });

    assert.ok(defaultPrevented, 'preventDefault deve ter sido chamado');
    assert.ok(createPlanPayload, 'API.createPlan deve ter sido chamado');
    assert.equal(createPlanPayload.name, 'CorvFin Pro Per Month');
    assert.equal(createPlanPayload.slug, 'corvfin-pro-per-month');
    assert.doesNotMatch(createPlanPayload.slug, /_/, 'Payload final não pode conter underscore');
  });

  test('Edição manual do campo slug preserva personalização e não é sobrescrita pelo nome', async () => {
    let createPlanPayload = null;

    const { sandbox, elements, eventListeners } = createAdminSandbox({
      API: {
        createPlan: async (payload) => {
          createPlanPayload = payload;
          return { success: true, plan: { _id: 'plan_new', ...payload } };
        }
      }
    });
    const Admin = sandbox.AdminModule;

    await Admin.openCreatePlanModal();

    const nameInput = elements.adminCreatePlanName;
    const slugInput = elements.adminCreatePlanSlug;

    // Usuário digita slug manual
    slugInput.value = 'meu-slug-customizado';
    const slugInputListeners = eventListeners['adminCreatePlanSlug']?.['input'] || [];
    slugInputListeners.forEach(fn => fn());

    // Agora altera o nome
    nameInput.value = 'Outro Nome Qualquer';
    const nameInputListeners = eventListeners['adminCreatePlanName']?.['input'] || [];
    nameInputListeners.forEach(fn => fn());

    // O slug não deve ter sido sobrescrito
    assert.equal(slugInput.value, 'meu-slug-customizado');

    // Submete
    const formListeners = eventListeners['formAdminCreatePlan']?.['submit'] || [];
    await formListeners[0]({ preventDefault: () => {} });

    assert.equal(createPlanPayload.slug, 'meu-slug-customizado');
  });
});


