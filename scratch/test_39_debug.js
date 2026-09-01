const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const vm = require('node:vm');

const constantsJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'constants.js'), 'utf-8');
const utilsJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'utils.js'), 'utf-8');
const uiShellJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'uiShell.js'), 'utf-8');

// DOM Mocks
let bottomNavHtml = '';
let drawerGridHtml = '';

const mockBottomNav = {
  id: 'mobileBottomNav',
  set innerHTML(val) { bottomNavHtml = val; },
  get innerHTML() { return bottomNavHtml; },
  querySelectorAll: (sel) => {
    const matches = [];
    const regex = /data-tab="([^"]+)"/g;
    let match;
    while ((match = regex.exec(bottomNavHtml)) !== null) {
      matches.push({
        getAttribute: () => match[1],
        addEventListener: () => {}
      });
    }
    return matches;
  },
  querySelector: (sel) => ({ addEventListener: () => {} })
};

const mockDrawerGrid = {
  className: 'mobile-drawer-grid',
  set innerHTML(val) { drawerGridHtml = val; },
  get innerHTML() { return drawerGridHtml; },
  querySelectorAll: (sel) => {
    const matches = [];
    const regex = /data-tab="([^"]+)"/g;
    let match;
    while ((match = regex.exec(drawerGridHtml)) !== null) {
      matches.push({
        getAttribute: () => match[1],
        addEventListener: () => {}
      });
    }
    return matches;
  }
};

const mockElements = {
  '#mobileBottomNav': mockBottomNav,
  'mobileBottomNav': mockBottomNav,
  '.mobile-drawer-grid': mockDrawerGrid,
  '#btnMobileMore': { addEventListener: () => {} },
  '#mobileDrawerOverlay': { classList: { add: () => {}, remove: () => {} }, addEventListener: () => {} },
  '#mobileQuickActionOverlay': { classList: { add: () => {}, remove: () => {} } }
};

let userState = {
  preferences: {
    mobileNavigation: ['tab-dashboard', 'tab-expenses', 'tab-debtors']
  }
};

let currentUser = {
  id: 'usr_test_1',
  is_admin: false,
  permissions: {
    dashboard: true,
    despesas: true,
    extras: true,
    devedores: true,
    investimentos: true,
    beneficios: true,
    compras: true,
    simulacao: true,
    configuracoes: false
  }
};

let maintenanceConfig = {
  dashboard: { maintenance: false },
  despesas: { maintenance: false },
  extras: { maintenance: false },
  devedores: { maintenance: false },
  investimentos: { maintenance: false },
  beneficios: { maintenance: false },
  compras: { maintenance: false },
  simulacao: { maintenance: false }
};

const sandbox = {
  window: {
    addEventListener: () => {}
  },
  API: {
    getUser: () => currentUser,
    resolveUrl: (u) => u,
    getSystemMaintenance: async () => ({ success: true, maintenance: maintenanceConfig })
  },
  addEventListener: () => {},
  document: {
    readyState: 'complete',
    body: { appendChild: () => {} },
    addEventListener: () => {},
    createElement: () => ({
      id: '',
      style: {},
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      setAttribute: () => {},
      appendChild: () => {},
      addEventListener: () => {}
    }),
    getElementById: (id) => mockElements['#' + id] || mockElements[id] || null,
    querySelector: (sel) => mockElements[sel] || (sel === '.mobile-drawer-grid' ? mockDrawerGrid : null),
    querySelectorAll: (sel) => []
  },
  $: (sel) => mockElements[sel] || (sel === '.mobile-drawer-grid' ? mockDrawerGrid : null),
  $$: () => [],
  getState: () => userState,
  updateSidebarMaintenanceBadges: () => {},
  openQuickActionSheet: () => {},
  activateTab: () => {}
};
sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(constantsJs, sandbox);
vm.runInContext(utilsJs, sandbox);
vm.runInContext(uiShellJs, sandbox);

async function runTests() {
  await sandbox.loadSystemMaintenance();

  function getBottomNavTabs() {
    const tabs = [];
    const regex = /data-tab="([^"]+)"/g;
    let match;
    while ((match = regex.exec(bottomNavHtml)) !== null) {
      tabs.push(match[1]);
    }
    return tabs;
  }

  function getDrawerTabs() {
    const tabs = [];
    const regex = /data-tab="([^"]+)"/g;
    let match;
    while ((match = regex.exec(drawerGridHtml)) !== null) {
      tabs.push(match[1]);
    }
    return tabs;
  }

  // 1. Cenário A: Favoritos padrão [Dashboard, Despesas, Devedores]
  sandbox.renderMobileBottomNav();

  let bTabs = getBottomNavTabs();
  let dTabs = getDrawerTabs();

  // 1. Módulos favoritos aparecem na bottom nav
  assert.deepStrictEqual(bTabs, ['tab-dashboard', 'tab-expenses', 'tab-debtors']);
  assert.strictEqual(bTabs.length, 3, 'Bottom nav deve ter no máximo 3 favoritos');

  // 2. Módulos permitidos não-favoritos aparecem em "Mais"
  assert.ok(dTabs.includes('tab-extras'), 'Extras deve estar em Mais');
  assert.ok(dTabs.includes('tab-investments'), 'Investimentos deve estar em Mais');
  assert.ok(dTabs.includes('tab-benefits'), 'Benefícios deve estar em Mais');
  assert.ok(dTabs.includes('tab-shopping'), 'Compras deve estar em Mais');
  assert.ok(dTabs.includes('tab-simulation'), 'Simulação deve estar em Mais');

  // 3. Nenhum módulo permitido fica invisível (União completa: availableModules = favoriteModules ∪ moreModules)
  const allowedTabs = ['tab-dashboard', 'tab-expenses', 'tab-extras', 'tab-debtors', 'tab-investments', 'tab-benefits', 'tab-shopping', 'tab-simulation', 'tab-profile'];
  const allVisible = [...bTabs, ...dTabs];
  for (const t of allowedTabs) {
    assert.ok(allVisible.includes(t), `Módulo permitido ${t} deve estar na bottom nav OU em Mais`);
  }

  // 7. Interseção vazia (sem duplicatas)
  const duplicates = bTabs.filter(t => dTabs.includes(t));
  assert.strictEqual(duplicates.length, 0, 'Nenhum módulo deve aparecer duplicado em Bottom Nav e Mais');

  // 6. Cenário B: Trocar favoritos para [Dashboard, Investimentos, Compras]
  userState.preferences.mobileNavigation = ['tab-dashboard', 'tab-investments', 'tab-shopping'];
  sandbox.renderMobileBottomNav();

  bTabs = getBottomNavTabs();
  dTabs = getDrawerTabs();

  assert.deepStrictEqual(bTabs, ['tab-dashboard', 'tab-investments', 'tab-shopping']);
  // Despesas e Devedores devem ter retornado automaticamente ao menu Mais!
  assert.ok(dTabs.includes('tab-expenses'), 'Despesas deve retornar a Mais quando desfavoritado');
  assert.ok(dTabs.includes('tab-debtors'), 'Devedores deve retornar a Mais quando desfavoritado');
  assert.ok(dTabs.includes('tab-extras'), 'Extras deve continuar em Mais');
  assert.ok(dTabs.includes('tab-benefits'), 'Benefícios deve continuar em Mais');
  assert.ok(dTabs.includes('tab-simulation'), 'Simulação deve continuar em Mais');
  assert.ok(!dTabs.includes('tab-investments'), 'Investimentos não deve estar em Mais pois é favorito');
  assert.ok(!dTabs.includes('tab-shopping'), 'Compras não deve estar em Mais pois é favorito');

  // 4. Cenário C: Remover permissão RBAC de Investimentos
  currentUser.permissions.investimentos = false;
  sandbox.renderMobileBottomNav();

  bTabs = getBottomNavTabs();
  dTabs = getDrawerTabs();

  assert.ok(!bTabs.includes('tab-investments'), 'Módulo sem permissão não deve aparecer na bottom nav');
  assert.ok(!dTabs.includes('tab-investments'), 'Módulo sem permissão não deve aparecer em Mais');

  // 5. Cenário D: Módulo em manutenção
  currentUser.permissions.investimentos = true;
  maintenanceConfig.simulacao.maintenance = true;
  await sandbox.loadSystemMaintenance();
  sandbox.renderMobileBottomNav();

  dTabs = getDrawerTabs();
  assert.ok(!dTabs.includes('tab-simulation'), 'Módulo em manutenção não deve aparecer em Mais');

  console.log('All tests in test_39_debug passed successfully!');
}

runTests();
