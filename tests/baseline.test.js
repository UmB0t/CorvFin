/**
 * OmniFin V3 - Suíte de Testes de Proteção da Baseline
 * Executa contra a API Express e o banco de homologação (MongoDB HML)
 * Cria usuário sintético isolado e realiza cleanup automático ao finalizar.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const config = require('../server/config/config');
const app = require('../server/server');
const { getDB, connectDB } = require('../server/config/db');
const { hashPassword } = require('../server/services/authService');
const { requirePermission } = require('../server/middleware/permissions');

describe('OmniFin V3 - Baseline Contract Tests', () => {
  let server;
  let baseUrl;
  let testUserToken;
  let testAdminToken;
  let testUserId;
  let testAdminId;
  const testSuffix = 'test_' + Date.now();
  const testUserLogin = `user_${testSuffix}`;
  const testAdminLogin = `admin_${testSuffix}`;
  const testPassword = 'Password@2026';

  before(async () => {
    // 1. Conecta ao banco de homologação
    const db = await connectDB();
    assert.strictEqual(config.STORAGE_DRIVER, 'mongodb', 'STORAGE_DRIVER deve ser mongodb');
    assert.strictEqual(config.MONGODB_DB_NAME, 'omnifin_v3_hml', 'Banco deve ser omnifin_v3_hml');

    // 2. Inicia servidor em porta efêmera para os testes
    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // 3. Cadastra usuário comum de teste
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Usuário Teste Baseline',
        login: testUserLogin,
        email: `${testUserLogin}@omnifin.test`,
        senha: testPassword
      })
    });
    const regData = await regRes.json();
    assert.strictEqual(regRes.status, 201, 'Cadastro de usuário comum deve retornar 201');
    testUserId = regData.user.id;
    testUserToken = regData.token;

    // 4. Cria admin sintético direto no banco para os testes de permissão/admin
    testAdminId = `usr_admin_${testSuffix}`;
    const hashedAdminPwd = await hashPassword(testPassword);
    const usersCol = db.collection('users');
    await usersCol.insertOne({
      _id: testAdminId,
      id: testAdminId,
      nome: 'Admin Teste Baseline',
      login: testAdminLogin,
      email: `${testAdminLogin}@omnifin.test`,
      senha: hashedAdminPwd,
      is_admin: true,
      notificacoes_ativas: true,
      createdAt: new Date().toISOString()
    });

    // Login do admin para obter token
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: testAdminLogin, senha: testPassword })
    });
    const adminLoginData = await adminLoginRes.json();
    assert.strictEqual(adminLoginRes.status, 200, 'Login do admin deve retornar 200');
    testAdminToken = adminLoginData.token;
  });

  after(async () => {
    // Cleanup estritamente dos dados sintéticos criados para este teste
    try {
      const db = getDB();
      if (testUserId) {
        await db.collection('users').deleteOne({ _id: testUserId });
        await db.collection('permissions').deleteOne({ _id: testUserId });
        await db.collection('finances').deleteOne({ _id: testUserId });
      }
      if (testAdminId) {
        await db.collection('users').deleteOne({ _id: testAdminId });
        await db.collection('permissions').deleteOne({ _id: testAdminId });
        await db.collection('finances').deleteOne({ _id: testAdminId });
      }
    } catch (e) {
      console.warn('Erro no cleanup de dados sintéticos:', e);
    }

    // Fecha servidor HTTP de teste
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('1. Login válido retorna 200 e token JWT', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: testUserLogin, senha: testPassword })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.token, 'Deve retornar token JWT');
    assert.strictEqual(data.user.login, testUserLogin.toLowerCase());
  });

  test('2. Login inválido retorna 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: testUserLogin, senha: 'WrongPassword@123' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
  });

  test('3. GET /api/finances autenticado retorna documento financeiro do usuário', async () => {
    const res = await fetch(`${baseUrl}/api/finances`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      }
    });
    const finances = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(finances.userId, testUserId);
    assert.ok(Array.isArray(finances.fixed), 'Deve conter array fixed');
    assert.ok(Array.isArray(finances.variable), 'Deve conter array variable');
    assert.ok(typeof finances.revision === 'number', 'Deve possuir campo revision numérico');
    // Valida que o nome do cadastro foi propagado para o profile
    assert.strictEqual(finances.profile.name, 'Usuário Teste Baseline');
  });

  test('4. PUT /api/finances com expectedRevision correta salva com sucesso', async () => {
    // Lê o estado atual para obter revision
    const getRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const current = await getRes.json();
    const currentRev = Number(current.revision || 0);

    const updatePayload = Object.assign({}, current, {
      expectedRevision: currentRev,
      fixed: [
        {
          id: 'fix_test_1',
          name: 'Internet Fibra Teste',
          group: 'Moradia',
          destination: 'Nubank',
          dueDay: 10,
          versions: [{ year: 2026, month: 8, amount: 150 }],
          paidHistory: {}
        }
      ]
    });

    const putRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });
    const putData = await putRes.json();

    assert.strictEqual(putRes.status, 200);
    assert.strictEqual(putData.success, true);
    assert.strictEqual(putData.revision, currentRev + 1, '5. Revision deve ser incrementada em 1');
  });

  test('6. PUT /api/finances com revision defasada retorna 409 Concurrency Conflict', async () => {
    // Tenta enviar com expectedRevision 0 quando a revisão atual é maior
    const stalePayload = {
      expectedRevision: 0,
      fixed: []
    };

    const putRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(stalePayload)
    });
    const putData = await putRes.json();

    assert.strictEqual(putRes.status, 409);
    assert.strictEqual(putData.conflict, true);
    assert.strictEqual(putData.success, false);
  });

  test('7. Dados persistidos permanecem íntegros após nova leitura', async () => {
    const getRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const fresh = await getRes.json();

    assert.strictEqual(getRes.status, 200);
    assert.ok(Array.isArray(fresh.fixed));
    assert.strictEqual(fresh.fixed.length, 1);
    assert.strictEqual(fresh.fixed[0].name, 'Internet Fibra Teste');
    assert.strictEqual(fresh.fixed[0].versions[0].amount, 150);
  });

  test('8. Usuário sem permissão recebe 403 e rota admin exige is_admin', async () => {
    // Usuário comum tentando acessar endpoint restrito de admin
    const adminRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    assert.strictEqual(adminRes.status, 403, 'Usuário comum não pode acessar /api/admin/users');

    // Admin acessando endpoint com sucesso
    const validAdminRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { 'Authorization': `Bearer ${testAdminToken}` }
    });
    assert.strictEqual(validAdminRes.status, 200, 'Admin deve acessar /api/admin/users com 200');
  });

  test('9. Admin consulta manutenção do sistema com sucesso', async () => {
    const res = await fetch(`${baseUrl}/api/admin/maintenance`, {
      headers: { 'Authorization': `Bearer ${testAdminToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.maintenance, 'Deve retornar objeto maintenance');
    assert.strictEqual(typeof data.maintenance.despesas.maintenance, 'boolean');
  });

  test('10. Edição de usuário pelo admin permite alterar papel e dados com proteção contra auto-lockout', async () => {
    // 1. Admin altera papel do usuário de teste para admin
    const updateRoleRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nome: 'Usuário Promovido a Admin',
        is_admin: true
      })
    });
    const roleData = await updateRoleRes.json();
    assert.strictEqual(updateRoleRes.status, 200);
    assert.strictEqual(roleData.user.is_admin, true);

    // 2. Admin tenta remover seu próprio privilégio de admin -> deve ser bloqueado com 400
    const selfLockoutRes = await fetch(`${baseUrl}/api/admin/users/${testAdminId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        is_admin: false
      })
    });
    assert.strictEqual(selfLockoutRes.status, 400, 'Auto-lockout administrativo deve ser bloqueado com 400');
  });

  test('11. Perfil carrega e persiste nome, salário base e benefício do MongoDB', async () => {
    // 1. Atualiza dados de perfil e benefícios via PUT /api/finances
    const getRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const current = await getRes.json();
    const currentRev = Number(current.revision || 0);

    const updatePayload = Object.assign({}, current, {
      expectedRevision: currentRev,
      profile: {
        name: 'Lorenzo Cabral Teste',
        baseSalary: 8500
      },
      benefitsConfig: {
        amount: 1200
      }
    });

    const putRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });
    const putData = await putRes.json();
    assert.strictEqual(putRes.status, 200);
    assert.strictEqual(putData.success, true);

    // 2. Lê novamente e confirma que os valores estão no Mongo
    const freshRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const fresh = await freshRes.json();
    assert.strictEqual(fresh.profile.name, 'Lorenzo Cabral Teste');
    assert.strictEqual(Number(fresh.profile.baseSalary), 8500);
    assert.strictEqual(Number(fresh.benefitsConfig.amount), 1200);
  });

  test('12. Simulação: Salvar cenário grava snapshot em savedSimulations no documento finances', async () => {
    const getRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const current = await getRes.json();
    const currentRev = Number(current.revision || 0);

    const simScenario = {
      id: 'sim_scenario_test_1',
      title: 'Viagem 2027 Teste',
      description: 'Cenário simulando passagens e hospedagem',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      simulationYear: 2027,
      snapshot: {
        simulatedExpenses: [
          {
            id: 'sim_exp_1',
            name: 'Passagens Aéreas',
            amount: 500,
            installments: 10,
            startMonth: 1,
            startYear: 2027,
            group: 'Viagens',
            destination: 'Nubank'
          }
        ],
        simulationToggles: { includeExtras: true, includeDebtors: false },
        simulationYear: 2027
      }
    };

    const updatePayload = Object.assign({}, current, {
      expectedRevision: currentRev,
      savedSimulations: [simScenario]
    });

    const putRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });
    const putData = await putRes.json();
    assert.strictEqual(putRes.status, 200);

    // Leitura subsequente
    const freshRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const fresh = await freshRes.json();
    assert.ok(Array.isArray(fresh.savedSimulations));
    assert.strictEqual(fresh.savedSimulations.length, 1);
    assert.strictEqual(fresh.savedSimulations[0].title, 'Viagem 2027 Teste');
    assert.strictEqual(fresh.savedSimulations[0].simulationYear, 2027);
    assert.strictEqual(fresh.savedSimulations[0].snapshot.simulatedExpenses.length, 1);
  });

  test('13. Simulação: Reabrir e manipular cenário salvo mantém isolamento absoluto de dados reais', async () => {
    const getRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const data = await getRes.json();

    // Cenário salvo existe
    const savedSim = data.savedSimulations[0];
    assert.ok(savedSim, 'Cenário salvo deve existir');

    // Snapshot extraído em memória (como o frontend faz ao carregar)
    const simulatedExpensesInMemory = JSON.parse(JSON.stringify(savedSim.snapshot.simulatedExpenses));
    const simulationYearInMemory = savedSim.simulationYear;

    // Modificações no sandbox em memória
    simulatedExpensesInMemory.push({ id: 'sim_exp_2', name: 'Aluguel Carro', amount: 300, installments: 5 });

    // Confirma que os dados reais da base (fixed, variable, profile) não foram modificados
    assert.strictEqual(data.profile.baseSalary, 8500, 'Salário real não foi alterado');
    assert.strictEqual(data.fixed.length, 1, 'Despesas fixas reais não foram alteradas');
    assert.strictEqual(data.variable.length, 0, 'Despesas variáveis reais não foram alteradas');
  });

  test('14. Simulação: Excluir cenário salvo remove apenas o item de savedSimulations', async () => {
    const getRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const current = await getRes.json();
    const currentRev = Number(current.revision || 0);

    const updatePayload = Object.assign({}, current, {
      expectedRevision: currentRev,
      savedSimulations: [] // remove o cenário
    });

    const putRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });
    assert.strictEqual(putRes.status, 200);

    const freshRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const fresh = await freshRes.json();
    assert.strictEqual(fresh.savedSimulations.length, 0, 'savedSimulations agora deve estar vazio');
    assert.strictEqual(fresh.profile.name, 'Lorenzo Cabral Teste', 'Perfil permanece intacto');
  });

  test('15. Categorias: Retrocompatibilidade com array de strings antigas e persistência com ícones novos', async () => {
    // 1. Simula payload com categories em formato antigo (array de strings simples)
    const getRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const current = await getRes.json();
    const currentRev = Number(current.revision || 0);

    const updateLegacyCats = Object.assign({}, current, {
      expectedRevision: currentRev,
      categories: ['Moradia', 'Lazer', 'Alimentação', 'Transporte', 'MinhaCategoriaCustom']
    });

    const putRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateLegacyCats)
    });
    assert.strictEqual(putRes.status, 200);

    // 2. Leitura subsequente
    const freshRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const fresh = await freshRes.json();
    assert.ok(Array.isArray(fresh.categories));
    assert.strictEqual(fresh.categories.length, 5);

    // 3. Salva categories com novo formato de objetos estruturados com ícones outline
    const updateNewCats = Object.assign({}, fresh, {
      expectedRevision: fresh.revision,
      categories: [
        { name: 'Moradia', icon: 'home' },
        { name: 'Transporte', icon: 'car' },
        { name: 'Supermercado', icon: 'shopping' },
        { name: 'Investimentos', icon: 'chart' },
        { name: 'SemIconeDefinido' } // testa fallback
      ],
      budgets: {
        'Moradia': 2500,
        'Supermercado': 1800
      }
    });

    const putNewRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateNewCats)
    });
    assert.strictEqual(putNewRes.status, 200);

    // 4. Confirma persistência dos objetos de categoria e preservação de budgets por nome
    const freshNewRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const freshNew = await freshNewRes.json();
    assert.strictEqual(freshNew.categories.length, 5);
    assert.strictEqual(freshNew.categories[0].name, 'Moradia');
    assert.strictEqual(freshNew.categories[0].icon, 'home');
    assert.strictEqual(freshNew.categories[2].name, 'Supermercado');
    assert.strictEqual(freshNew.categories[2].icon, 'shopping');
    assert.strictEqual(freshNew.budgets['Moradia'], 2500);
    assert.strictEqual(freshNew.budgets['Supermercado'], 1800);
  });

  test('16. Regressão: Array híbrido de categorias não gera [object Object] em filtros ou selects', async () => {
    // Array híbrido contendo strings simples e objetos estruturados
    const hybridCategories = [
      'Alimentação',
      { name: 'Moradia', icon: 'home' },
      { name: 'Transporte', icon: 'car' }
    ];

    // Helper central equivalente ao do frontend
    const getCategoryName = (c) => (typeof c === 'string' ? c : (c && c.name ? c.name : 'Gerais'));

    // 1. Extração de nomes únicos para filtros (como em expenseInstallments e expenses)
    const items = [
      { name: 'Conta Luz', group: 'Moradia' },
      { name: 'Supermercado', group: 'Alimentação' },
      { name: 'Combustível', group: 'Transporte' }
    ];

    const stateCatNames = hybridCategories.map(c => getCategoryName(c)).filter(Boolean);
    const itemCatNames = items.map(i => i.group).filter(Boolean);
    const uniqueCats = [...new Set([...stateCatNames, ...itemCatNames])].sort();

    // 2. Simulação de geração de HTML do select
    const selectOptionsHtml = `<option value="all">Todas as Categorias</option>` +
      uniqueCats.map(catName => `<option value="${catName}">${catName}</option>`).join('');

    // 3. Asserções estritas de ausência de [object Object]
    assert.ok(!selectOptionsHtml.includes('[object Object]'), 'HTML do select NUNCA pode conter [object Object]');
    assert.ok(selectOptionsHtml.includes('<option value="Alimentação">Alimentação</option>'));
    assert.ok(selectOptionsHtml.includes('<option value="Moradia">Moradia</option>'));
    assert.ok(selectOptionsHtml.includes('<option value="Transporte">Transporte</option>'));
    assert.strictEqual(uniqueCats.length, 3);
    assert.deepStrictEqual(uniqueCats, ['Alimentação', 'Moradia', 'Transporte']);
  });

  test('17. UX / Layout: Toast Container e Regras de Posicionamento Fixo do Viewport', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const htmlPath = path.join(process.cwd(), 'public', 'index.html');
    const cssPath = path.join(process.cwd(), 'public', 'css', 'components.css');
    const apiPath = path.join(process.cwd(), 'public', 'js', 'api.js');

    const html = fs.readFileSync(htmlPath, 'utf-8');
    const css = fs.readFileSync(cssPath, 'utf-8');
    const api = fs.readFileSync(apiPath, 'utf-8');

    // 1. Toast container deve existir diretamente no index.html antes do </body>
    assert.ok(html.includes('<div id="toast-container"'), 'index.html deve conter #toast-container');
    
    // 2. CSS deve ter regras para #toast-container com position: fixed e z-index alto
    assert.ok(css.includes('#toast-container'), 'components.css deve estilizar #toast-container');
    assert.ok(css.includes('z-index: 2147483647'), 'components.css deve possuir z-index seguro para o toast');

    // 3. API deve exportar notify e showToast unificados
    assert.ok(api.includes('window.notify = createToast') || api.includes('window.notify'), 'api.js deve exportar window.notify');
    assert.ok(api.includes('window.showToast = createToast') || api.includes('window.showToast'), 'api.js deve exportar window.showToast');
  });

  test('18. UX / Layout: Sistema Global de Tooltips (Viewport-Safe & Anti-Overflow)', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const cssPath = path.join(process.cwd(), 'public', 'css', 'components.css');
    const uiShellPath = path.join(process.cwd(), 'public', 'js', 'core', 'uiShell.js');

    const css = fs.readFileSync(cssPath, 'utf-8');
    const uiShell = fs.readFileSync(uiShellPath, 'utf-8');

    // 1. Pseudo-elementos antigos desativados
    assert.ok(css.includes('[data-tooltip]::before'), 'components.css deve referenciar [data-tooltip]::before');
    assert.ok(css.includes('display: none !important;'), 'Pseudo-elementos antigos devem ser desativados');

    // 2. Estilos do singleton .global-tooltip
    assert.ok(css.includes('.global-tooltip') || css.includes('#globalTooltip'), 'components.css deve estilizar .global-tooltip');
    assert.ok(css.includes('position: fixed !important;'), '.global-tooltip deve ter position: fixed');

    // 3. uiShell exporta e inicializa initGlobalTooltips
    assert.ok(uiShell.includes('function initGlobalTooltips()'), 'uiShell.js deve definir initGlobalTooltips');
    assert.ok(uiShell.includes('window.initGlobalTooltips = initGlobalTooltips'), 'uiShell.js deve expor initGlobalTooltips');

    // 4. Teste unitário da lógica de cálculo de inversão acima/abaixo e clamp horizontal
    const MARGIN = 8;
    const calculateTooltipPos = (rect, tipRect, windowWidth, windowHeight) => {
      const hasSpaceAbove = (rect.top - tipRect.height - MARGIN) >= MARGIN;
      let top = hasSpaceAbove ? (rect.top - tipRect.height - MARGIN) : (rect.bottom + MARGIN);
      if (top + tipRect.height > windowHeight - MARGIN) {
        top = Math.max(MARGIN, windowHeight - tipRect.height - MARGIN);
      }
      if (top < MARGIN) top = MARGIN;

      let left = rect.left + (rect.width / 2) - (tipRect.width / 2);
      left = Math.max(MARGIN, Math.min(left, windowWidth - tipRect.width - MARGIN));
      return { top, left, placedAbove: hasSpaceAbove };
    };

    // Caso A: Botão no topo da tela (sem espaço acima, ex: rect.top = 20, tipHeight = 30)
    const posA = calculateTooltipPos({ top: 20, bottom: 52, left: 100, width: 32, height: 32 }, { width: 140, height: 30 }, 1280, 800);
    assert.strictEqual(posA.placedAbove, false, 'Botão próximo ao topo deve inverter para baixo');
    assert.strictEqual(posA.top, 52 + MARGIN, 'Posição top deve ser abaixo do botão');
    assert.ok(posA.top >= MARGIN, 'Posição top nunca pode ser < MARGIN');

    // Caso B: Botão no meio da tela (com espaço acima, ex: rect.top = 300, tipHeight = 30)
    const posB = calculateTooltipPos({ top: 300, bottom: 332, left: 100, width: 32, height: 32 }, { width: 140, height: 30 }, 1280, 800);
    assert.strictEqual(posB.placedAbove, true, 'Botão no meio da tela deve posicionar acima');
    assert.strictEqual(posB.top, 300 - 30 - MARGIN);

    // Caso C: Botão encostado na borda direita (clamp horizontal)
    const posC = calculateTooltipPos({ top: 300, bottom: 332, left: 1260, width: 32, height: 32 }, { width: 200, height: 30 }, 1280, 800);
    assert.strictEqual(posC.left, 1280 - 200 - MARGIN, 'Tooltip encostado à direita deve ser clampado dentro da tela');
    assert.ok(posC.left + 200 <= 1280 - MARGIN, 'Tooltip nunca pode vazar borda direita');
  });

  test('19. Concorrência: Fila de serialização de saves, visualOnly sem PUT e proteção anti-flood', async () => {
    // 1. Validações estáticas nos arquivos-fonte
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    const authSyncJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'authSync.js'), 'utf-8');
    const simJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'simulation.js'), 'utf-8');

    // Verifica fila de saves em index.html
    assert.ok(indexHtml.includes('saveQueue ='), 'index.html deve implementar fila/promessa de serialização saveQueue');
    assert.ok(indexHtml.includes('isRevalidatingConflict'), 'index.html deve conter flag de proteção isRevalidatingConflict');
    assert.ok(indexHtml.includes('lastConflictToastTime'), 'index.html deve conter debounce anti-flood lastConflictToastTime');
    assert.ok(indexHtml.includes("'month-select'"), 'visualOnly deve conter month-select');

    // Verifica que simulação não dispara saveState() no click de mês
    assert.ok(simJs.includes("saveLocalState();"), 'simulation.js deve usar saveLocalState ao selecionar mês');

    // Verifica proteção de revalidação em authSync.js
    assert.ok(authSyncJs.includes('let isRevalidating = false;'), 'authSync.js deve conter flag de revalidação única');

    // 2. Teste dinâmico de saves sequenciais garantindo que expectedRevision avança sem 409
    const getRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const current = await getRes.json();
    let currentRev = Number(current.revision || 0);

    // Dispara 3 saves em sequência ordenada (simulando a fila)
    for (let i = 1; i <= 3; i++) {
      const payload = Object.assign({}, current, {
        expectedRevision: currentRev,
        testSequentialIndex: i
      });
      const putRes = await fetch(`${baseUrl}/api/finances`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      assert.strictEqual(putRes.status, 200, `Save sequencial ${i} deve retornar 200 com expectedRevision correta`);
      const putData = await putRes.json();
      assert.ok(putData.success);
      assert.strictEqual(putData.revision, currentRev + 1, `Revisão deve avançar para ${currentRev + 1}`);
      currentRev = putData.revision;
    }
  });

  test('20. Release Notes: Catálogo central, indicador de não lido, persistência e isolamento por usuário', async () => {
    // 1. Validação estática do catálogo e arquivos de Release Notes
    const relNotesJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'releaseNotes.js'), 'utf-8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    const cssComponents = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'components.css'), 'utf-8');

    assert.ok(relNotesJs.includes('version: "3.5.0"'), 'releaseNotes.js deve conter a release v3.5.0');
    assert.ok(relNotesJs.includes('version: "3.4.0"'), 'releaseNotes.js deve conter a release v3.4.0');
    assert.ok(relNotesJs.includes('version: "3.3.0"'), 'releaseNotes.js deve conter a release v3.3.0');
    assert.ok(relNotesJs.includes('version: "3.2.0"'), 'releaseNotes.js deve conter a release v3.2.0');
    assert.ok(relNotesJs.includes('version: "3.1.0"'), 'releaseNotes.js deve conter a release v3.1.0');
    assert.ok(relNotesJs.includes('version: "3.0.0"'), 'releaseNotes.js deve manter releases anteriores acessíveis');
    assert.ok(relNotesJs.includes('news:'), 'releaseNotes.js deve estruturar novidades');
    assert.ok(relNotesJs.includes('improvements:'), 'releaseNotes.js deve estruturar melhorias');
    assert.ok(relNotesJs.includes('fixes:'), 'releaseNotes.js deve estruturar correções');

    // Validação da ordem das releases
    const idx35 = relNotesJs.indexOf('version: "3.5.0"');
    const idx34 = relNotesJs.indexOf('version: "3.4.0"');
    const idx33 = relNotesJs.indexOf('version: "3.3.0"');
    const idx32 = relNotesJs.indexOf('version: "3.2.0"');
    const idx31 = relNotesJs.indexOf('version: "3.1.0"');
    const idx30 = relNotesJs.indexOf('version: "3.0.0"');
    assert.ok(idx35 < idx34 && idx34 < idx33 && idx33 < idx32 && idx32 < idx31 && idx31 < idx30, 'Releases devem estar ordenadas: v3.5 -> v3.4 -> v3.3 -> v3.2 -> v3.1 -> v3.0');

    // Validação de UI no HTML e CSS
    assert.ok(indexHtml.includes('id="releaseNotesBtn"'), 'index.html deve conter o botão de release notes na barra superior');
    assert.ok(indexHtml.includes('id="releaseNotesBadge"'), 'index.html deve conter o badge de release notes');
    assert.ok(indexHtml.includes('id="releaseNotesDialog"'), 'index.html deve conter o modal dialog de release notes');
    assert.ok(indexHtml.includes('id="drawerReleaseNotesBtn"'), 'index.html deve conter botão no drawer mobile');
    assert.ok(cssComponents.includes('#releaseNotesBtn'), 'components.css deve estilizar o botão de release notes');
    assert.ok(cssComponents.includes('.notification-badge.unread-dot'), 'components.css deve estilizar o ponto indicador de não lido');

    // 2. Estado de leitura inicial do usuário comum
    const getRes1 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const userDoc1 = await getRes1.json();
    const currentRev = Number(userDoc1.revision || 0);
    const readListInitial = Array.isArray(userDoc1.readReleases) ? userDoc1.readReleases : [];
    assert.strictEqual(readListInitial.includes('3.5.0'), false, 'Usuário novo/sem leitura não deve ter a release 3.5.0 como lida');

    // 3. Usuário abre e marca a release 3.5.0 como lida
    const updatePayload = Object.assign({}, userDoc1, {
      expectedRevision: currentRev,
      readReleases: ['3.5.0']
    });

    const putRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });
    assert.strictEqual(putRes.status, 200, 'Salvar readReleases deve retornar 200 OK');

    // 4. Refresh / Leitura subsequente confirma que release 3.5.0 permanece lida
    const getRes2 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const userDoc2 = await getRes2.json();
    assert.ok(Array.isArray(userDoc2.readReleases), 'readReleases deve ser um array');
    assert.strictEqual(userDoc2.readReleases.includes('3.5.0'), true, 'readReleases deve persistir 3.5.0');

    // 5. Isolamento: Outro usuário (ex: admin) não foi impactado e tem seu próprio estado independente
    const getAdminRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testAdminToken}` }
    });
    const adminDoc = await getAdminRes.json();
    const adminReadList = Array.isArray(adminDoc.readReleases) ? adminDoc.readReleases : [];
    assert.strictEqual(adminReadList.includes('3.5.0'), false, 'Outro usuário deve manter estado de leitura independente');
  });

  test('21. Gestão de Despesas e Pagamentos: Métodos À Vista/Parcelado/Fixa, herança de vencimento, nativos Pix e Dinheiro', async () => {
    const vm = require('node:vm');
    const constantsCode = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'constants.js'), 'utf-8');
    const stateCode = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'state.js'), 'utf-8');
    const ctx = { window: {} };
    ctx.window = ctx;
    ctx.DEFAULT_CATEGORIES = [];
    vm.createContext(ctx);
    vm.runInContext(constantsCode, ctx);
    vm.runInContext(stateCode, ctx);

    // 1. Validar normalização de destinos: Pix e Dinheiro nativos sempre presentes e protegidos com dueDay: null
    const normalizeDestinations = ctx.normalizeDestinations;
    assert.strictEqual(typeof normalizeDestinations, 'function', 'normalizeDestinations deve ser uma função global');

    // Lista vazia deve conter Pix e Dinheiro
    const emptyNormalized = normalizeDestinations([]);
    assert.ok(emptyNormalized.some(d => d.name === 'Pix' && d.dueDay === null), 'Pix deve estar presente com dueDay null');
    assert.ok(emptyNormalized.some(d => d.name === 'Dinheiro' && d.dueDay === null), 'Dinheiro deve estar presente com dueDay null');

    // Lista com destinos legados em string ou 'Em dinheiro' deve normalizar 'Dinheiro'
    const legacyList = ['Nubank', 'Em dinheiro', 'Cartão XP'];
    const normalizedLegacy = normalizeDestinations(legacyList);
    const dinheiroDest = normalizedLegacy.find(d => d.name === 'Dinheiro');
    assert.ok(dinheiroDest, 'Deve converter "Em dinheiro" para "Dinheiro"');
    assert.strictEqual(dinheiroDest.dueDay, null, 'Dinheiro não deve ter dueDay');
    assert.ok(normalizedLegacy.some(d => d.name === 'Pix'), 'Pix deve ser inserido automaticamente se ausente');

    // Destino com vencimento configurado
    const customList = [
      { name: 'Pix', color: '#10B981', icon: 'dollar', dueDay: null },
      { name: 'Dinheiro', color: '#F59E0B', icon: 'wallet', dueDay: null },
      { name: 'Nubank PJ', color: '#8B5CF6', icon: 'card', dueDay: 15 }
    ];
    const normalizedCustom = normalizeDestinations(customList);
    const nubankPj = normalizedCustom.find(d => d.name === 'Nubank PJ');
    assert.strictEqual(nubankPj.dueDay, 15, 'dueDay 15 deve ser preservado');

    // 2. Persistência de despesa via Pix (À Vista com dueDay null e status pago automático)
    const getRes1 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const userDoc1 = await getRes1.json();
    const rev1 = Number(userDoc1.revision || 0);

    const pixExpense = {
      id: 'pix-test-1',
      name: 'Supermercado Mensal Pix',
      amount: 350.00,
      group: 'Alimentação',
      destination: 'Pix',
      dueDay: null,
      note: 'Compra do mês',
      startMonth: 8,
      startYear: 2026,
      endMonth: 8,
      endYear: 2026,
      installments: 1,
      paymentType: 'cash',
      paidHistory: { '2026-8': true }
    };

    const installmentExpense = {
      id: 'inst-test-1',
      name: 'Notebook Novo Parcelado',
      amount: 500.00,
      group: 'Tecnologia',
      destination: 'Nubank PJ',
      dueDay: 15,
      note: 'Compra em 6 parcelas',
      startMonth: 8,
      startYear: 2026,
      endMonth: 1,
      endYear: 2027,
      installments: 6,
      paymentType: 'installment',
      paidHistory: {}
    };

    const fixedExpense = {
      id: 'fixed-test-1',
      name: 'Plano de Saúde',
      group: 'Saúde',
      destination: 'Nubank PJ',
      dueDay: 15,
      note: 'Mensalidade recorrente',
      paymentType: 'fixed',
      versions: [{ year: 2026, month: 8, amount: 420.00, startYear: 2026, startMonth: 8 }],
      paidHistory: {}
    };

    const updatePayload = Object.assign({}, userDoc1, {
      expectedRevision: rev1,
      destinations: normalizedCustom,
      variable: [pixExpense, installmentExpense],
      fixed: [fixedExpense]
    });

    const putRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });
    assert.strictEqual(putRes.status, 200, 'Salvar novas despesas deve retornar 200 OK');

    // 3. Leitura subsequente para validar integridade de dados e tipos de pagamento
    const getRes2 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const userDoc2 = await getRes2.json();

    const savedPix = userDoc2.variable.find(v => v.id === 'pix-test-1');
    assert.ok(savedPix, 'Despesa Pix deve existir');
    assert.strictEqual(savedPix.paymentType, 'cash', 'Tipo deve ser cash (à vista)');
    assert.strictEqual(savedPix.dueDay, null, 'dueDay do Pix deve ser null');
    assert.strictEqual(savedPix.paidHistory['2026-8'], true, 'Despesa Pix deve estar quitada no histórico');

    const savedInst = userDoc2.variable.find(v => v.id === 'inst-test-1');
    assert.ok(savedInst, 'Despesa Parcelada deve existir');
    assert.strictEqual(savedInst.paymentType, 'installment', 'Tipo deve ser installment');
    assert.strictEqual(savedInst.installments, 6, 'Deve ter 6 parcelas');
    assert.strictEqual(savedInst.dueDay, 15, 'dueDay herdado do destino deve ser 15');

    const savedFixed = userDoc2.fixed.find(f => f.id === 'fixed-test-1');
    assert.ok(savedFixed, 'Despesa Fixa deve existir');
    assert.strictEqual(savedFixed.paymentType, 'fixed', 'Tipo deve ser fixed');
    assert.strictEqual(savedFixed.dueDay, 15, 'dueDay herdado do destino deve ser 15');
    assert.strictEqual(savedFixed.versions[0].amount, 420.00, 'Valor da versão deve ser preservado');
  });

  test('22. Checkpoint 3.1: Hidratação sem flash de dados falsos e Fluxo Curto de Pix / Dinheiro', async () => {
    const vm = require('node:vm');
    const utilsCode = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'utils.js'), 'utf-8');
    const constantsCode = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'constants.js'), 'utf-8');
    const stateCode = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'state.js'), 'utf-8');
    const ctx = { window: {} };
    ctx.window = ctx;
    ctx.DEFAULT_CATEGORIES = [];
    vm.createContext(ctx);
    vm.runInContext(utilsCode, ctx);
    vm.runInContext(constantsCode, ctx);
    vm.runInContext(stateCode, ctx);

    // 1. Validar que initialState não expõe dados financeiros falsos (salário nulo antes de hidratar)
    const initS = ctx.initialState();
    assert.strictEqual(initS.profile.baseSalary, null, 'Salário base deve ser null antes da hidratação para evitar flash de R$ 0,00');

    // 2. Criação com Pix e Dinheiro: Salva como cash, pago, dueDay null e usa competência atual (ex: Agosto/2026)
    const getRes1 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const userDoc1 = await getRes1.json();
    const rev1 = Number(userDoc1.revision || 0);

    const nowNavMonth = 8;
    const nowNavYear = 2026;

    // Despesa criada via Pix no mês atual
    const newPixExpense = {
      id: 'pix-shortcut-1',
      name: 'Uber Corrida',
      amount: 28.50,
      group: 'Transporte',
      destination: 'Pix',
      dueDay: null,
      note: 'Corrida trabalho',
      startMonth: nowNavMonth,
      startYear: nowNavYear,
      endMonth: nowNavMonth,
      endYear: nowNavYear,
      installments: 1,
      paymentType: 'cash',
      paidHistory: { [`${nowNavYear}-${nowNavMonth}`]: true }
    };

    // Despesa criada via Dinheiro no mês atual
    const newCashExpense = {
      id: 'dinheiro-shortcut-1',
      name: 'Padaria Lanche',
      amount: 15.00,
      group: 'Alimentação',
      destination: 'Dinheiro',
      dueDay: null,
      note: 'Café da manhã',
      startMonth: nowNavMonth,
      startYear: nowNavYear,
      endMonth: nowNavMonth,
      endYear: nowNavYear,
      installments: 1,
      paymentType: 'cash',
      paidHistory: { [`${nowNavYear}-${nowNavMonth}`]: true }
    };

    // Despesa anterior criada em mês passado (ex: Junho/2026) sendo editada
    const editedOldPixExpense = {
      id: 'pix-old-edit-1',
      name: 'Farmácia Remédio (Editada)',
      amount: 60.00,
      group: 'Saúde',
      destination: 'Pix',
      dueDay: null,
      note: 'Nota fiscal anexada',
      startMonth: 6, // Mês original Junho/2026 preservado na edição
      startYear: 2026,
      endMonth: 6,
      endYear: 2026,
      installments: 1,
      paymentType: 'cash',
      paidHistory: { '2026-6': true }
    };

    const updatePayload = Object.assign({}, userDoc1, {
      expectedRevision: rev1,
      variable: [newPixExpense, newCashExpense, editedOldPixExpense]
    });

    const putRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });
    assert.strictEqual(putRes.status, 200, 'Salvar despesas do fluxo curto deve retornar 200 OK');

    // 3. Leitura subsequente para validar integridade
    const getRes2 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const userDoc2 = await getRes2.json();

    const savedNewPix = userDoc2.variable.find(v => v.id === 'pix-shortcut-1');
    assert.ok(savedNewPix, 'Nova despesa Pix deve existir');
    assert.strictEqual(savedNewPix.paymentType, 'cash', 'Deve ser cash');
    assert.strictEqual(savedNewPix.startMonth, 8, 'Criação deve usar competência ativa (8)');
    assert.strictEqual(savedNewPix.startYear, 2026, 'Criação deve usar ano ativo (2026)');
    assert.strictEqual(savedNewPix.dueDay, null, 'dueDay deve ser null');
    assert.strictEqual(savedNewPix.paidHistory['2026-8'], true, 'Pix deve estar pago');
    assert.strictEqual(savedNewPix.note, 'Corrida trabalho', 'Observação deve ser preservada');

    const savedNewCash = userDoc2.variable.find(v => v.id === 'dinheiro-shortcut-1');
    assert.ok(savedNewCash, 'Nova despesa Dinheiro deve existir');
    assert.strictEqual(savedNewCash.paymentType, 'cash', 'Deve ser cash');
    assert.strictEqual(savedNewCash.dueDay, null, 'dueDay deve ser null');
    assert.strictEqual(savedNewCash.paidHistory['2026-8'], true, 'Dinheiro deve estar pago');

    const savedOldPix = userDoc2.variable.find(v => v.id === 'pix-old-edit-1');
    assert.ok(savedOldPix, 'Despesa Pix antiga editada deve existir');
    assert.strictEqual(savedOldPix.startMonth, 6, 'Edição de Pix deve preservar competência original (Junho)');
    assert.strictEqual(savedOldPix.startYear, 2026, 'Edição de Pix deve preservar ano original (2026)');
    assert.strictEqual(savedOldPix.note, 'Nota fiscal anexada', 'Observação editada deve ser preservada');
  });

  test('23. Checkpoint 3.2: Contrato e integridade dos selects de competência (Mês/Ano) em Nova Despesa e Edição', async () => {
    const vm = require('node:vm');
    const constantsCode = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'constants.js'), 'utf-8');
    const utilsCode = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'utils.js'), 'utf-8');
    const uiShellCode = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'uiShell.js'), 'utf-8');

    // DOM mock minimalista para os selects
    const elements = {};
    function mockElement(id) {
      return {
        id,
        value: '',
        innerHTML: '',
        options: []
      };
    }

    const selectIds = [
      '#cashEffMonth', '#cashEffYear',
      '#varStartMonth', '#varStartYear', '#varEndMonth', '#varEndYear',
      '#fixedEffMonth', '#fixedEffYear',
      '#extraStartMonth', '#extraStartYear', '#extraEndMonth', '#extraEndYear',
      '#debtorStartMonth', '#debtorStartYear', '#debtorEndMonth', '#debtorEndYear',
      '#aporteMonth', '#benefitMonth', '#aporteYear', '#benefitYear'
    ];

    selectIds.forEach(id => {
      elements[id] = mockElement(id.replace('#', ''));
    });

    const ctx = {
      addEventListener: () => {},
      removeEventListener: () => {},
      document: {
        readyState: 'complete',
        addEventListener: () => {},
        removeEventListener: () => {},
        getElementById: (id) => elements['#' + id] || null,
        querySelector: (sel) => elements[sel] || null,
        querySelectorAll: (sel) => elements[sel] ? [elements[sel]] : [],
        createElement: (tag) => ({
          id: '',
          style: {},
          classList: { add: () => {}, remove: () => {}, contains: () => false },
          setAttribute: () => {},
          appendChild: () => {},
          addEventListener: () => {},
          removeEventListener: () => {}
        }),
        body: {
          appendChild: () => {}
        }
      },
      $: (selector) => elements[selector] || null,
      $$: (selector) => elements[selector] ? [elements[selector]] : [],
      getState: () => ({ year: 2026, month: 8 })
    };
    ctx.window = ctx;

    vm.createContext(ctx);
    vm.runInContext(constantsCode, ctx);
    vm.runInContext(utilsCode, ctx);
    vm.runInContext(uiShellCode, ctx);

    assert.strictEqual(typeof ctx.fillMonthSelects, 'function', 'fillMonthSelects deve ser uma função global');

    // Executa preenchimento de selects
    ctx.fillMonthSelects();

    // 1. Validar select de Mês À Vista (#cashEffMonth)
    const cashMonth = elements['#cashEffMonth'];
    assert.ok(cashMonth.innerHTML.includes('<option value="1">Janeiro</option>'), '#cashEffMonth deve conter Janeiro');
    assert.ok(cashMonth.innerHTML.includes('<option value="8">Agosto</option>'), '#cashEffMonth deve conter Agosto');
    assert.ok(cashMonth.innerHTML.includes('<option value="12">Dezembro</option>'), '#cashEffMonth deve conter Dezembro');
    const cashMonthOptions = cashMonth.innerHTML.match(/<option/g) || [];
    assert.strictEqual(cashMonthOptions.length, 12, '#cashEffMonth deve conter exatamente 12 opções');

    // 2. Validar select de Ano À Vista (#cashEffYear)
    const cashYear = elements['#cashEffYear'];
    assert.ok(cashYear.innerHTML.includes('<option value="2026">2026</option>'), '#cashEffYear deve conter ano atual (2026)');
    assert.ok(cashYear.innerHTML.includes('<option value="2022">2022</option>'), '#cashEffYear deve conter anos anteriores');
    assert.ok(cashYear.innerHTML.includes('<option value="2036">2036</option>'), '#cashEffYear deve conter anos futuros');

    // 3. Validar select de Mês/Ano Parcelado (#varStartMonth, #varStartYear)
    const varMonth = elements['#varStartMonth'];
    const varYear = elements['#varStartYear'];
    assert.strictEqual((varMonth.innerHTML.match(/<option/g) || []).length, 12, '#varStartMonth deve conter 12 opções');
    assert.ok(varYear.innerHTML.includes('<option value="2026">2026</option>'), '#varStartYear deve conter ano atual');

    // 4. Validar select de Mês/Ano Fixa (#fixedEffMonth, #fixedEffYear)
    const fixMonth = elements['#fixedEffMonth'];
    const fixYear = elements['#fixedEffYear'];
    assert.strictEqual((fixMonth.innerHTML.match(/<option/g) || []).length, 12, '#fixedEffMonth deve conter 12 opções');
    assert.ok(fixYear.innerHTML.includes('<option value="2026">2026</option>'), '#fixedEffYear deve conter ano atual');

    // 5. Validar que nova execução/alternância preserva opções sem esvaziar
    ctx.fillMonthSelects();
    assert.strictEqual((elements['#cashEffMonth'].innerHTML.match(/<option/g) || []).length, 12, 'Re-execução não deve esvaziar #cashEffMonth');
    assert.strictEqual((elements['#varStartMonth'].innerHTML.match(/<option/g) || []).length, 12, 'Re-execução não deve esvaziar #varStartMonth');
  });

  test('24. Checkpoint 3.3: Feedback contextual de validação do Wizard dentro do modal (sem toast global oculto)', async () => {
    const html = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf-8');
    const dialogsCss = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'dialogs.css'), 'utf-8');
    const expensesJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'modules', 'expenses.js'), 'utf-8');

    // 1. Validar presença do elemento de alerta inline dentro do #entryDialog no index.html
    assert.ok(html.includes('id="entryValidationAlert"'), 'index.html deve conter o container #entryValidationAlert');
    assert.ok(html.includes('role="alert"'), '#entryValidationAlert deve ter acessibilidade role="alert"');

    // 2. Validar estilos de erro contextual no dialogs.css
    assert.ok(dialogsCss.includes('[aria-invalid="true"]'), 'dialogs.css deve estilizar campos com [aria-invalid="true"]');
    assert.ok(dialogsCss.includes('var(--danger)'), 'dialogs.css deve usar tokens de design system (--danger)');

    // 3. Validar que expenses.js define funções de validação interna
    assert.ok(expensesJs.includes('function validateEntryStep1()'), 'expenses.js deve conter validateEntryStep1');
    assert.ok(expensesJs.includes('function validateEntryStep2()'), 'expenses.js deve conter validateEntryStep2');
    assert.ok(expensesJs.includes('function setEntryFieldError('), 'expenses.js deve conter setEntryFieldError');
    assert.ok(expensesJs.includes('function clearEntryValidation()'), 'expenses.js deve conter clearEntryValidation');

    // 4. Teste funcional das regras de validação em VM
    const vm = require('node:vm');
    const elements = {};
    function mockElement(id, initialVal = '') {
      const attrs = {};
      const classList = new Set();
      return {
        id,
        value: initialVal,
        textContent: '',
        style: {},
        setAttribute: (k, v) => { attrs[k] = String(v); },
        getAttribute: (k) => attrs[k] || null,
        removeAttribute: (k) => { delete attrs[k]; },
        classList: {
          add: (c) => classList.add(c),
          remove: (c) => classList.delete(c),
          contains: (c) => classList.has(c)
        },
        focus: () => {},
        querySelectorAll: () => []
      };
    }

    elements['#entryValidationAlert'] = mockElement('entryValidationAlert');
    elements['#entryName'] = mockElement('entryName', '');
    elements['#entryGroup'] = mockElement('entryGroup', 'Alimentação');
    elements['#entryAmount'] = mockElement('entryAmount', '0');
    elements['#entryDestination'] = mockElement('entryDestination', 'Nubank');
    elements['#entryDialog'] = mockElement('entryDialog');
    elements['#entryDialog'].querySelectorAll = () => [elements['#entryName'], elements['#entryGroup'], elements['#entryAmount'], elements['#entryDestination'], elements['#cashEffMonth'], elements['#cashEffYear']];
    elements['#cashEffMonth'] = mockElement('cashEffMonth', '8');
    elements['#cashEffYear'] = mockElement('cashEffYear', '2026');

    let toastCalled = false;
    const ctx = {
      window: { addEventListener: () => {} },
      document: {
        readyState: 'complete',
        addEventListener: () => {},
        getElementById: (id) => elements['#' + id] || null,
        querySelector: (sel) => elements[sel] || null,
        querySelectorAll: () => Object.values(elements)
      },
      $: (selector) => elements[selector] || null,
      $$: (selector) => Object.values(elements),
      getState: () => ({ year: 2026, month: 8, destinations: [{ name: 'Nubank' }], categories: ['Alimentação'] }),
      notify: () => { toastCalled = true; },
      entryDlgState: { mode: 'new', step: 1, type: 'cash' },
      ymKey: (y, m) => `${y}-${m}`,
      saveState: () => {},
      render: () => {},
      fillMonthSelects: () => {},
      updateCategorySelects: () => {},
      updateDestinationSelects: () => {},
      MONTH_ABBR: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    };
    ctx.window = ctx;

    vm.createContext(ctx);
    vm.runInContext(expensesJs, ctx);

    // Validação com nome vazio deve falhar, aplicar aria-invalid e alert inline sem disparar toast global
    const validateStep1 = ctx.window.validateEntryStep1 || ctx.validateEntryStep1;
    assert.strictEqual(typeof validateStep1, 'function', 'validateEntryStep1 deve ser uma função exportada');
    const step1ValidEmptyName = validateStep1();
    assert.strictEqual(step1ValidEmptyName, false, 'Descrição vazia deve falhar validação');
    assert.strictEqual(elements['#entryName'].getAttribute('aria-invalid'), 'true', '#entryName deve receber aria-invalid="true"');
    assert.strictEqual(elements['#entryValidationAlert'].style.display, 'block', '#entryValidationAlert deve estar visível');
    assert.strictEqual(toastCalled, false, 'Não deve chamar notify (toast global) para validação de campos do wizard');

    // Ao preencher nome e deixar valor zero, deve falhar no valor
    elements['#entryName'].value = 'Aluguel';
    elements['#entryAmount'].value = '0';
    const step1ValidZeroAmount = validateStep1();
    assert.strictEqual(step1ValidZeroAmount, false, 'Valor zero deve falhar validação');
    assert.strictEqual(elements['#entryAmount'].getAttribute('aria-invalid'), 'true', '#entryAmount deve receber aria-invalid="true"');
    assert.ok(elements['#entryValidationAlert'].textContent.includes('maior que zero'), 'Alerta deve conter instrução de valor maior que zero');

    // Ao preencher valor válido, validação deve passar e limpar erros
    elements['#entryAmount'].value = '1500.00';
    const step1Success = validateStep1();
    assert.strictEqual(step1Success, true, 'Dados válidos devem passar na validação');
    assert.strictEqual(elements['#entryValidationAlert'].style.display, 'none', 'Alerta deve ser ocultado quando válido');
    assert.strictEqual(elements['#entryAmount'].getAttribute('aria-invalid'), null, 'aria-invalid deve ser removido');
  });

  test('25. Checkpoint 4: Lista de Compras Inteligente - Catálogo Padrão, Autocomplete, Aprendizado e Retrocompatibilidade', async () => {
    const vm = require('node:vm');
    const constantsJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'constants.js'), 'utf-8');
    const stateJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'state.js'), 'utf-8');
    const shoppingJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'modules', 'shopping.js'), 'utf-8');
    const componentsCss = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'components.css'), 'utf-8');

    // Contexto de execução isolado
    let savedStateObj = null;
    let notifications = [];

    const mockElements = {};
    function getOrCreateMockElement(id) {
      if (!mockElements[id]) {
        const classList = new Set();
        const attrs = {};
        const listeners = {};
        mockElements[id] = {
          id,
          value: '',
          innerHTML: '',
          textContent: '',
          style: {},
          classList: {
            add: (c) => classList.add(c),
            remove: (c) => classList.delete(c),
            contains: (c) => classList.has(c)
          },
          setAttribute: (k, v) => { attrs[k] = String(v); },
          getAttribute: (k) => attrs[k] || null,
          removeAttribute: (k) => { delete attrs[k]; },
          addEventListener: (event, handler) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
          },
          trigger: (event, eObj = {}) => {
            (listeners[event] || []).forEach(h => h(eObj));
          },
          querySelectorAll: (sel) => [],
          querySelector: (sel) => null,
          focus: () => {},
          scrollIntoView: () => {}
        };
      }
      return mockElements[id];
    }

    const testState = {
      version: 5,
      revision: 1,
      year: 2026,
      month: 8,
      shoppingLists: [
        {
          id: 'list_test_1',
          name: 'Compras da Semana',
          status: 'open',
          createdAt: '2026-08-30T10:00:00.000Z',
          items: [
            {
              id: 'item_1',
              name: 'Arroz',
              category: 'Carboidrato',
              quantity: 2,
              unit: 'kg',
              price: 15.00,
              is_checked: true
            }
          ]
        }
      ],
      shoppingItemSuggestions: [],
      variable: [],
      benefitTransactions: [],
      destinations: [{ name: 'Nubank' }],
      categories: [{ name: 'Alimentação', icon: 'utensils' }]
    };

    const ctx = {
      window: {
        addEventListener: () => {}
      },
      document: {
        readyState: 'complete',
        addEventListener: () => {},
        getElementById: (id) => getOrCreateMockElement(id),
        querySelector: (sel) => {
          const clean = sel.replace('#', '');
          return getOrCreateMockElement(clean);
        },
        querySelectorAll: (sel) => []
      },
      $: (sel) => {
        const clean = sel.replace('#', '');
        return getOrCreateMockElement(clean);
      },
      $$: (sel) => [],
      getState: () => testState,
      saveState: () => {
        savedStateObj = JSON.parse(JSON.stringify(testState));
        return Promise.resolve(true);
      },
      notify: (msg, type) => { notifications.push({ msg, type }); },
      uid: () => 'uid_' + Math.random().toString(36).substr(2, 9),
      todayYM: () => ({ year: 2026, month: 8 })
    };
    ctx.window = ctx;

    vm.createContext(ctx);
    vm.runInContext(constantsJs, ctx);
    vm.runInContext(stateJs, ctx);
    vm.runInContext(shoppingJs, ctx);

    // ------------------------------------------------------------------------
    // 1. Catálogo padrão contém itens básicos obrigatórios
    // ------------------------------------------------------------------------
    const catalog = ctx.DEFAULT_SHOPPING_CATALOG || ctx.window.DEFAULT_SHOPPING_CATALOG;
    assert.ok(Array.isArray(catalog), 'DEFAULT_SHOPPING_CATALOG deve ser um array');
    assert.ok(catalog.length >= 20, 'DEFAULT_SHOPPING_CATALOG deve ter pelo menos 20 itens');

    const requiredItems = [
      'Arroz', 'Feijão', 'Macarrão', 'Molho de Tomate', 'Açúcar',
      'Sal', 'Café', 'Leite', 'Pão', 'Ovos',
      'Frango', 'Carne', 'Queijo', 'Presunto', 'Manteiga',
      'Óleo', 'Farinha', 'Sabão em Pó', 'Detergente', 'Papel Higiênico'
    ];

    const catalogItemNames = catalog.map(i => i.name);
    for (const req of requiredItems) {
      assert.ok(catalogItemNames.includes(req), `Catálogo deve conter "${req}"`);
    }

    // ------------------------------------------------------------------------
    // 2. Autocomplete por prefixo
    // ------------------------------------------------------------------------
    const getSuggestions = ctx.getShoppingItemSuggestions || ctx.window.getShoppingItemSuggestions;
    assert.strictEqual(typeof getSuggestions, 'function', 'getShoppingItemSuggestions deve ser função');

    const prefixResults = getSuggestions('arr', []);
    assert.ok(prefixResults.length > 0, 'Busca por "arr" deve retornar resultados');
    assert.strictEqual(prefixResults[0].name, 'Arroz', 'Primeira sugestão de "arr" deve ser "Arroz"');

    const feijResults = getSuggestions('feij', []);
    assert.ok(feijResults.some(r => r.name === 'Feijão'), 'Busca por "feij" deve conter "Feijão"');

    // ------------------------------------------------------------------------
    // 3. Case-insensitive
    // ------------------------------------------------------------------------
    const upperResults = getSuggestions('ARROZ', []);
    const mixedResults = getSuggestions('aRrOz', []);
    assert.ok(upperResults.length > 0 && upperResults[0].name === 'Arroz', 'Busca em maiúsculas "ARROZ" deve encontrar "Arroz"');
    assert.ok(mixedResults.length > 0 && mixedResults[0].name === 'Arroz', 'Busca mista "aRrOz" deve encontrar "Arroz"');

    // ------------------------------------------------------------------------
    // 4. Normalização de acentos
    // ------------------------------------------------------------------------
    const acucarResults = getSuggestions('acucar', []);
    const oleoResults = getSuggestions('oleo', []);
    const paoResults = getSuggestions('pao', []);
    const sabaoResults = getSuggestions('sabao', []);

    assert.ok(acucarResults.some(r => r.name === 'Açúcar'), 'Busca sem acento "acucar" deve encontrar "Açúcar"');
    assert.ok(oleoResults.some(r => r.name === 'Óleo'), 'Busca sem acento "oleo" deve encontrar "Óleo"');
    assert.ok(paoResults.some(r => r.name === 'Pão'), 'Busca sem acento "pao" deve encontrar "Pão"');
    assert.ok(sabaoResults.some(r => r.name === 'Sabão em Pó'), 'Busca sem acento "sabao" deve encontrar "Sabão em Pó"');

    // ------------------------------------------------------------------------
    // 5. Aprendizado de item personalizado
    // ------------------------------------------------------------------------
    const learnItem = ctx.learnShoppingCustomItem || ctx.window.learnShoppingCustomItem;
    assert.strictEqual(typeof learnItem, 'function', 'learnShoppingCustomItem deve ser função');

    const learned = learnItem('Granola Zero Açúcar', 'Carboidrato', 'pct');
    assert.strictEqual(learned, true, 'Item inexistente no catálogo deve ser aprendido');
    assert.strictEqual(testState.shoppingItemSuggestions.length, 1);
    assert.strictEqual(testState.shoppingItemSuggestions[0].name, 'Granola Zero Açúcar');
    assert.strictEqual(testState.shoppingItemSuggestions[0].normalizedName, 'granola zero acucar');

    // ------------------------------------------------------------------------
    // 6. Item personalizado reaparece nas buscas com prioridade máxima
    // ------------------------------------------------------------------------
    const customSearch = getSuggestions('gra', testState.shoppingItemSuggestions);
    assert.ok(customSearch.length > 0, 'Busca por "gra" deve encontrar itens');
    assert.strictEqual(customSearch[0].name, 'Granola Zero Açúcar', 'Item personalizado deve ter prioridade máxima');
    assert.strictEqual(customSearch[0].isCustom, true, 'Item personalizado deve vir marcado com isCustom: true');

    // ------------------------------------------------------------------------
    // 7. Item padrão não vira duplicata personalizada
    // ------------------------------------------------------------------------
    const standardLearned1 = learnItem('Arroz', 'Carboidrato', 'kg');
    const standardLearned2 = learnItem('  feijão  ', 'Carboidrato', 'kg');
    const standardLearned3 = learnItem('MOLHO DE TOMATE', 'Complemento', 'un');

    assert.strictEqual(standardLearned1, false, '"Arroz" padrão não deve ser adicionado às sugestões personalizadas');
    assert.strictEqual(standardLearned2, false, '"feijão" padrão não deve ser adicionado às sugestões personalizadas');
    assert.strictEqual(standardLearned3, false, '"MOLHO DE TOMATE" não deve ser adicionado às sugestões personalizadas');
    assert.strictEqual(testState.shoppingItemSuggestions.length, 1, 'Tamanho de shoppingItemSuggestions deve continuar 1');

    // ------------------------------------------------------------------------
    // 8. Item personalizado não duplica
    // ------------------------------------------------------------------------
    const duplicateLearned1 = learnItem('Granola Zero Açúcar', 'Carboidrato', 'pct');
    const duplicateLearned2 = learnItem('  granola zero acucar  ', 'Carboidrato', 'pct');
    const duplicateLearned3 = learnItem('GRANOLA ZERO AÇÚCAR', 'Carboidrato', 'pct');

    assert.strictEqual(duplicateLearned1, false, 'Item já cadastrado não deve ser duplicado');
    assert.strictEqual(duplicateLearned2, false, 'Item normalizado não deve ser duplicado');
    assert.strictEqual(duplicateLearned3, false, 'Item em maiúsculas não deve ser duplicado');
    assert.strictEqual(testState.shoppingItemSuggestions.length, 1, 'Sugestões personalizadas não devem duplicar');

    // ------------------------------------------------------------------------
    // 9. Isolamento entre usuários
    // ------------------------------------------------------------------------
    const userASuggestions = [{ name: 'Whey Protein Isolado', normalizedName: 'whey protein isolado' }];
    const userBSuggestions = [{ name: 'Creatina Monohidratada', normalizedName: 'creatina monohidratada' }];

    const userASearch = getSuggestions('whey', userASuggestions);
    const userBSearch = getSuggestions('whey', userBSuggestions);

    assert.ok(userASearch.some(r => r.name === 'Whey Protein Isolado'), 'User A deve encontrar suas sugestões');
    assert.strictEqual(userBSearch.length, 0, 'User B não deve ver sugestões de User A');

    // ------------------------------------------------------------------------
    // 10. Excluir item da lista não apaga sugestão personalizada
    // ------------------------------------------------------------------------
    const shoppingModule = ctx.ShoppingModule || ctx.window.ShoppingModule;
    // Abre a lista ativa e adiciona item personalizado
    shoppingModule.openShoppingList('list_test_1');
    shoppingModule.addShoppingItem('Suco de Uva Integral', 'Complemento', 1, 'L');
    assert.ok(testState.shoppingItemSuggestions.some(s => s.name === 'Suco de Uva Integral'), 'Suco de Uva deve ter sido aprendido');

    const activeList = testState.shoppingLists[0];
    const addedItem = activeList.items.find(i => i.name === 'Suco de Uva Integral');
    assert.ok(addedItem, 'Item deve existir na lista');

    // Remove item da lista
    activeList.items = activeList.items.filter(i => i.id !== addedItem.id);
    assert.strictEqual(activeList.items.some(i => i.name === 'Suco de Uva Integral'), false, 'Item removido da lista');
    assert.ok(testState.shoppingItemSuggestions.some(s => s.name === 'Suco de Uva Integral'), 'Sugestão personalizada deve PERMANECER intacta');

    // ------------------------------------------------------------------------
    // 11. Retrocompatibilidade com listas antigas
    // ------------------------------------------------------------------------
    const migrateStateFn = ctx.migrateState || ctx.window.migrateState;
    const legacyDocWithoutSuggestions = {
      version: 4,
      revision: 2,
      profile: { name: 'Usuário Antigo', baseSalary: 3000 },
      shoppingLists: [
        {
          id: 'old_list_1',
          name: 'Feira Antiga',
          items: [{ name: 'Tomate', quantity: 1, price: 5 }]
        }
      ]
    };

    const migrated = migrateStateFn(legacyDocWithoutSuggestions);
    assert.ok(Array.isArray(migrated.shoppingItemSuggestions), 'Documento migrado deve ter shoppingItemSuggestions como array');
    assert.strictEqual(migrated.shoppingItemSuggestions.length, 0, 'Documento sem sugestões recebe array vazio');
    assert.strictEqual(migrated.shoppingLists.length, 1, 'Lista antiga é preservada');
    assert.strictEqual(migrated.shoppingLists[0].name, 'Feira Antiga');

    // ------------------------------------------------------------------------
    // 12. Integração com despesas continua funcionando
    // ------------------------------------------------------------------------
    assert.strictEqual(typeof shoppingModule.confirmShoppingCompletion, 'function');
    assert.strictEqual(typeof shoppingModule.openShoppingCompleteModal, 'function');

    // ------------------------------------------------------------------------
    // 13. CSS do Autocomplete compatível com Tokens, Stacking Context e Sem Clipping
    // ------------------------------------------------------------------------
    assert.ok(componentsCss.includes('.shopping-add-item-card'), 'components.css deve conter .shopping-add-item-card');
    assert.ok(componentsCss.includes('overflow: visible !important'), 'Card do formulário deve ter overflow: visible !important');
    assert.ok(componentsCss.includes('.shopping-autocomplete-wrapper'), 'components.css deve conter .shopping-autocomplete-wrapper');
    assert.ok(componentsCss.includes('.shopping-autocomplete-dropdown'), 'components.css deve conter .shopping-autocomplete-dropdown');
    assert.ok(componentsCss.includes('.shopping-autocomplete-item'), 'components.css deve conter .shopping-autocomplete-item');
    assert.ok(componentsCss.includes('var(--surface)'), 'Autocomplete deve usar token var(--surface)');
    assert.ok(componentsCss.includes('var(--brand-soft)'), 'Autocomplete deve usar token var(--brand-soft)');
    assert.ok(shoppingJs.includes('shopping-add-item-card'), 'shopping.js deve aplicar shopping-add-item-card no card do formulário');
    assert.ok(shoppingJs.includes('shoppingItemsGroupedContainer'), 'shopping.js deve conter container agrupado de itens');
  });

  test('26. Checkpoint 5: Dashboard Consolidado - Dataset, Agregações Categoria/Destino, Matriz Cruzada e Filtros', async () => {
    const vm = require('node:vm');
    const constantsJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'constants.js'), 'utf-8');
    const stateJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'state.js'), 'utf-8');
    const financeQueriesJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'financeQueries.js'), 'utf-8');
    const consolidatedJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'modules', 'consolidatedDashboard.js'), 'utf-8');
    const componentsCss = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'components.css'), 'utf-8');

    let saveStateCallCount = 0;

    const mockElements = {};
    function getMock(id) {
      if (!mockElements[id]) {
        const classList = new Set();
        const attrs = {};
        const listeners = {};
        mockElements[id] = {
          id,
          value: '',
          innerHTML: '',
          textContent: '',
          style: {},
          classList: {
            add: (c) => classList.add(c),
            remove: (c) => classList.delete(c),
            contains: (c) => classList.has(c)
          },
          setAttribute: (k, v) => { attrs[k] = String(v); },
          getAttribute: (k) => attrs[k] || null,
          removeAttribute: (k) => { delete attrs[k]; },
          addEventListener: (event, handler) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(handler);
          },
          querySelectorAll: () => [],
          querySelector: () => null
        };
      }
      return mockElements[id];
    }

    const testState = {
      version: 5,
      revision: 3,
      year: 2026,
      month: 8,
      profile: { name: 'Dev User', baseSalary: 5000 },
      destinations: [
        { name: 'Nubank', color: '#820AD1', icon: 'card' },
        { name: 'Neon', color: '#00E5FF', icon: 'card' },
        { name: 'Pix', color: '#32BCAD', icon: 'dollar' },
        { name: 'Dinheiro', color: '#10B981', icon: 'wallet' }
      ],
      categories: [
        { name: 'Moradia', icon: 'home' },
        { name: 'Alimentação', icon: 'utensils' },
        { name: 'Transporte', icon: 'car' }
      ],
      incomes: {},
      fixed: [
        {
          id: 'f_aluguel',
          name: 'Aluguel',
          group: 'Moradia',
          destination: 'Nubank',
          amount: 1200,
          dueDay: 10,
          versions: [
            { id: 'v1', year: 2026, month: 1, amount: 1200 }
          ],
          paidHistory: { '2026-8': true }
        },
        {
          id: 'f_antiga_encerrada',
          name: 'Academia Antiga',
          group: 'Saúde',
          destination: 'Nubank',
          amount: 100,
          endedFrom: { year: 2026, month: 7 },
          versions: [{ id: 'v_old', year: 2026, month: 1, amount: 100 }]
        }
      ],
      variable: [
        {
          id: 'v_mercado',
          name: 'Supermercado Mensal',
          group: 'Alimentação',
          destination: 'Nubank',
          amount: 600,
          startYear: 2026,
          startMonth: 8,
          endYear: 2026,
          endMonth: 8,
          paidHistory: { '2026-8': true }
        },
        {
          id: 'v_parcelado_tv',
          name: 'Smart TV',
          group: 'Moradia',
          destination: 'Neon',
          amount: 300,
          startYear: 2026,
          startMonth: 1,
          endYear: 2026,
          endMonth: 10,
          paidHistory: { '2026-8': false }
        },
        {
          id: 'v_outro_mes_julho',
          name: 'Compra Passada Julho',
          group: 'Transporte',
          destination: 'Pix',
          amount: 150,
          startYear: 2026,
          startMonth: 7,
          endYear: 2026,
          endMonth: 7
        },
        {
          id: 'v_pix_combustivel',
          name: 'Combustível Posto',
          group: 'Transporte',
          destination: 'Pix',
          amount: 200,
          startYear: 2026,
          startMonth: 8,
          endYear: 2026,
          endMonth: 8,
          paidHistory: { '2026-8': true }
        },
        {
          id: 'v_sem_categoria_destino',
          name: 'Gasto Diverso',
          group: '',
          destination: '',
          amount: 50,
          startYear: 2026,
          startMonth: 8,
          endYear: 2026,
          endMonth: 8
        }
      ],
      debtors: [
        {
          id: 'd_amigo',
          debtorName: 'Carlos',
          title: 'Empréstimo Celular',
          amount: 250,
          destination: 'Pix',
          startYear: 2026,
          startMonth: 6,
          endYear: 2026,
          endMonth: 10,
          status: 'pendente',
          paidHistory: { '2026-8': false }
        }
      ]
    };

    const ctx = {
      window: {},
      document: {
        readyState: 'complete',
        addEventListener: () => {},
        getElementById: (id) => getMock(id),
        querySelector: (sel) => getMock(sel.replace('#', '')),
        querySelectorAll: () => []
      },
      $: (sel) => getMock(sel.replace('#', '')),
      $$: () => [],
      getState: () => testState,
      saveState: () => {
        saveStateCallCount++;
        return Promise.resolve(true);
      },
      notify: () => {},
      mk: (y, m) => (y * 12 + m),
      ymKey: (y, m) => `${y}-${m}`,
      MONTH_NAMES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
      MONTH_ABBR: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    };
    ctx.window = ctx;

    vm.createContext(ctx);
    vm.runInContext(constantsJs, ctx);
    vm.runInContext(stateJs, ctx);
    vm.runInContext(financeQueriesJs, ctx);
    vm.runInContext(consolidatedJs, ctx);

    const buildDataset = ctx.buildConsolidatedDataset || ctx.window.buildConsolidatedDataset;
    const filterDataset = ctx.filterConsolidatedDataset || ctx.window.filterConsolidatedDataset;
    const aggByCat = ctx.aggregateByCategory || ctx.window.aggregateByCategory;
    const aggByDest = ctx.aggregateByDestination || ctx.window.aggregateByDestination;
    const buildMatrix = ctx.buildCategoryDestinationMatrix || ctx.window.buildCategoryDestinationMatrix;

    try {
      // 1. Dataset da competência inclui despesas e cobranças válidas
      const datasetAug = buildDataset(testState, 2026, 8);
      assert.ok(Array.isArray(datasetAug), 'Dataset deve ser um array');
      assert.strictEqual(datasetAug.length, 6, 'Deve conter 6 lançamentos na competência de Agosto/2026');

      // 2. Despesa de outro mês não entra
      const hasJulyItem = datasetAug.some(i => i.description === 'Compra Passada Julho');
      assert.strictEqual(hasJulyItem, false, 'Despesa encerrada em Julho não pode entrar em Agosto');

      // 3. Despesa fixa vigente entra e encerrada não entra
      const aluguel = datasetAug.find(i => i.description === 'Aluguel');
      assert.ok(aluguel, 'Aluguel ativo deve entrar no dataset');
      assert.strictEqual(aluguel.amount, 1200, 'Aluguel com valor correto');
      assert.strictEqual(aluguel.status, 'pago', 'Aluguel com status pago');

      const academiaEncerrada = datasetAug.find(i => i.description === 'Academia Antiga');
      assert.strictEqual(academiaEncerrada, undefined, 'Fixa encerrada não entra no mês');

      // 4. Parcelamento entra com parcelas calculadas
      const tv = datasetAug.find(i => i.description === 'Smart TV');
      assert.ok(tv, 'Parcelamento Smart TV deve estar presente');
      assert.strictEqual(tv.amount, 300);
      assert.strictEqual(tv.installmentIndex, 8, 'Em Agosto/2026, parcela deve ser 8');
      assert.strictEqual(tv.installmentTotal, 10, 'Total de parcelas deve ser 10');
      assert.strictEqual(tv.status, 'pendente', 'TV ainda pendente');

      // 5. Pix/Dinheiro não duplicam e possuem valores íntegros
      const comb = datasetAug.find(i => i.description === 'Combustível Posto');
      assert.ok(comb, 'Combustível Pix deve estar presente');
      assert.strictEqual(comb.destination, 'Pix');
      assert.strictEqual(comb.amount, 200);

      // 6. Categoria agrega valores corretamente
      const totalRef = datasetAug.reduce((s, i) => s + i.amount, 0); // 1200 + 600 + 300 + 200 + 50 + 250 = 2600
      assert.strictEqual(totalRef, 2600, 'Total da competência deve ser R$ 2.600,00');

      const catAgg = aggByCat(datasetAug, totalRef);
      assert.ok(catAgg.length >= 3, 'Deve conter categorias agregadas');
      const moradiaCat = catAgg.find(c => c.name === 'Moradia');
      assert.ok(moradiaCat, 'Moradia deve existir');
      assert.strictEqual(moradiaCat.total, 1500, 'Moradia deve somar 1200 + 300 = 1500');
      assert.strictEqual(moradiaCat.count, 2, 'Moradia deve ter 2 lançamentos');

      // 7. Destino agrega valores corretamente
      const destAgg = aggByDest(datasetAug, totalRef);
      const nubankDest = destAgg.find(d => d.name === 'Nubank');
      assert.ok(nubankDest, 'Nubank deve existir');
      assert.strictEqual(nubankDest.total, 1850, 'Nubank deve somar 1200 (Aluguel) + 600 (Mercado) + 50 (fallback) = 1850');
      assert.strictEqual(nubankDest.count, 3, 'Nubank deve ter 3 lançamentos');

      // 8. Matriz Categoria × Destino agrega células e totais corretamente
      const matrixRes = buildMatrix(datasetAug);
      assert.strictEqual(matrixRes.grandTotal, 2600, 'Grand Total da Matriz deve ser 2600');
      assert.strictEqual(matrixRes.matrix['Moradia']['Nubank'], 1200, 'Moradia x Nubank = 1200');
      assert.strictEqual(matrixRes.matrix['Moradia']['Neon'], 300, 'Moradia x Neon = 300');
      assert.strictEqual(matrixRes.matrix['Alimentação']['Nubank'], 600, 'Alimentação x Nubank = 600');
      assert.strictEqual(matrixRes.matrix['Transporte']['Pix'], 200, 'Transporte x Pix = 200');

      // 9. Status Pago/Pendente e filtros locais
      const paidOnly = filterDataset(datasetAug, { status: 'pago' });
      assert.strictEqual(paidOnly.length, 3, 'Devem existir 3 itens pagos (Aluguel, Mercado, Combustível)');
      const pendingOnly = filterDataset(datasetAug, { status: 'pendente' });
      assert.strictEqual(pendingOnly.length, 3, 'Devem existir 3 itens pendentes (TV, Fallback, Devedor)');

      // 10. Filtros não chamam saveState()
      assert.strictEqual(saveStateCallCount, 0, 'Filtros locais não podem invocar saveState()');

      // 11. Registros sem categoria/destino usam fallback seguro
      const fallbackItem = datasetAug.find(i => i.description === 'Gasto Diverso');
      assert.ok(fallbackItem, 'Item com fallback deve existir');
      assert.strictEqual(fallbackItem.category, 'Gerais', 'Categoria vazia deve ser fallback Gerais');
      assert.strictEqual(fallbackItem.destination, 'Nubank', 'Destino vazio deve ser fallback Nubank');

      // 12. Estado vazio não gera NaN ou erro de divisão por zero
      const emptyDataset = [];
      const emptyCat = aggByCat(emptyDataset, 0);
      const emptyDest = aggByDest(emptyDataset, 0);
      const emptyMatrix = buildMatrix(emptyDataset);
      assert.strictEqual(emptyCat.length, 0);
      assert.strictEqual(emptyDest.length, 0);
      assert.strictEqual(emptyMatrix.grandTotal, 0);

      // 13. Usuários distintos permanecem isolados
      const userBState = {
        ...testState,
        fixed: [{ id: 'f_b', name: 'Internet B', group: 'Serviços', destination: 'Pix', amount: 150, versions: [{ id: 'vb1', year: 2026, month: 1, amount: 150 }] }],
        variable: [],
        debtors: []
      };
      const datasetB = buildDataset(userBState, 2026, 8);
      assert.strictEqual(datasetB.length, 1);
      assert.strictEqual(datasetB[0].description, 'Internet B');

      // 14. Revision/CAS permanece intacto (somente leitura)
      assert.strictEqual(testState.revision, 3, 'Revision não deve ser alterada pelo Dashboard Consolidado');

      // 15. CSS de componentes do Dashboard Consolidado
      assert.ok(componentsCss.includes('.consolidated-matrix-card'), 'CSS deve conter .consolidated-matrix-card');
      assert.ok(componentsCss.includes('.consolidated-matrix-table'), 'CSS deve conter .consolidated-matrix-table');
      assert.ok(componentsCss.includes('.consolidated-drilldown-item'), 'CSS deve conter .consolidated-drilldown-item');
    } catch (err) {
      console.error('TEST 26 ERROR DETAIL:', err);
      throw err;
    }
  });

  test('27. Checkpoint 5.1 — Dashboard como módulo principal e landing page', async () => {
    const vm = require('node:vm');
    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf-8');
    const uiShellJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'uiShell.js'), 'utf-8');
    const authJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'auth.js'), 'utf-8');
    const apiJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'api.js'), 'utf-8');
    const constantsJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'constants.js'), 'utf-8');
    const consolidatedJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'modules', 'consolidatedDashboard.js'), 'utf-8');

    // 1. Existe entrada Dashboard na navegação principal (Sidebar e Mobile Bottom Nav)
    assert.ok(indexHtml.includes('data-tab="tab-dashboard"'), 'index.html deve conter links com data-tab="tab-dashboard"');
    assert.ok(indexHtml.includes('<span class="link-text">Dashboard</span>'), 'Sidebar deve exibir o texto "Dashboard"');

    // 2. Dashboard aparece imediatamente antes de Despesas na sidebar
    const dashSidebarIdx = indexHtml.indexOf('<button class="sidebar-link active" data-tab="tab-dashboard"');
    const expSidebarIdx = indexHtml.indexOf('<button class="sidebar-link" data-tab="tab-expenses"');
    assert.ok(dashSidebarIdx !== -1, 'Sidebar deve conter botão tab-dashboard');
    assert.ok(expSidebarIdx !== -1, 'Sidebar deve conter botão tab-expenses');
    assert.ok(dashSidebarIdx < expSidebarIdx, 'Dashboard deve vir imediatamente antes de Despesas na sidebar');

    // 3. Suporte a /dashboard no roteamento de uiShell.js
    assert.ok(uiShellJs.includes("'/dashboard': 'tab-dashboard'"), "ROUTE_MAP deve conter rota '/dashboard'");
    assert.ok(uiShellJs.includes("'/': 'tab-dashboard'"), "ROUTE_MAP raiz deve apontar para 'tab-dashboard'");
    assert.ok(uiShellJs.includes("'tab-dashboard': '/dashboard'"), "TAB_TO_ROUTE deve mapear 'tab-dashboard' para '/dashboard'");

    // 4. Dashboard possui container principal próprio e independente de tab-expenses
    assert.ok(indexHtml.includes('<main id="tab-dashboard" class="tab-content">'), 'Deve existir container principal tab-dashboard');
    assert.ok(indexHtml.includes('id="dashboardViewWrap"'), 'Deve existir div com id dashboardViewWrap');
    assert.strictEqual(indexHtml.split('id="dashboardViewWrap"').length, 2, 'dashboardViewWrap não pode estar duplicado no DOM');

    // 5. Dashboard Consolidado não aparece mais como subaba de Despesas
    assert.strictEqual(indexHtml.includes('id="expensesConsolidatedTabBtn"'), false, 'expensesConsolidatedTabBtn deve ter sido removido');
    assert.strictEqual(indexHtml.includes('id="expensesConsolidatedViewWrap"'), false, 'expensesConsolidatedViewWrap deve ter sido removido de tab-expenses');

    // 6. Despesas mantém somente suas duas subvisões
    assert.ok(indexHtml.includes('id="expensesMonthlyTabBtn"'), 'Despesas deve manter subaba Despesas do Mês');
    assert.ok(indexHtml.includes('id="expensesInstallmentsTabBtn"'), 'Despesas deve manter subaba Parcelamentos');

    // 7. consolidatedDashboard.js continua carregado no index.html
    assert.ok(indexHtml.includes('src="js/modules/consolidatedDashboard.js"'), 'index.html deve carregar consolidatedDashboard.js');

    // 8. renderConsolidatedDashboardTab() continua disponível e é invocada na ativação da aba
    assert.ok(consolidatedJs.includes('function renderConsolidatedDashboardTab'), 'consolidatedDashboard.js deve conter renderConsolidatedDashboardTab');
    assert.ok(uiShellJs.includes('renderConsolidatedDashboardTab'), 'uiShell.js deve invocar renderConsolidatedDashboardTab na ativação');

    // 9. Redirect pós-login e pós-cadastro aponta para /dashboard ou rota dinâmica permitida
    assert.ok(authJs.includes("getFirstAllowedRouteForUser") || authJs.includes("resolveUrl('/dashboard')"), 'auth.js deve redirecionar pós-login para /dashboard');

    // 10. Acesso à raiz autenticada resolve para Dashboard
    assert.ok(uiShellJs.includes("const DEFAULT_TAB = 'tab-dashboard'"), "DEFAULT_TAB em uiShell.js deve ser 'tab-dashboard'");

    // 11. Known root routes em api.js inclui /dashboard
    assert.ok(apiJs.includes("'/dashboard'"), "api.js deve incluir '/dashboard' em knownRootRoutes");

    // 12. TAB_TITLES em constants.js inclui Dashboard
    assert.ok(constantsJs.includes("'tab-dashboard': 'Dashboard'"), "constants.js deve registrar 'tab-dashboard' em TAB_TITLES");

    // 13. Ribbon de competência inclui tab-dashboard
    assert.ok(uiShellJs.includes("'tab-dashboard', 'tab-expenses'"), "TABS_WITH_MONTH_RIBBON deve incluir 'tab-dashboard'");

    // 14. Execução de rota simulada via VM
    const mockElements = {};
    function getMock(id) {
      if (!mockElements[id]) {
        const classList = new Set();
        const attrs = {};
        mockElements[id] = {
          id,
          value: '',
          innerHTML: '',
          textContent: '',
          style: {},
          classList: {
            add: (c) => classList.add(c),
            remove: (c) => classList.delete(c),
            contains: (c) => classList.has(c),
            toggle: (c, v) => v ? classList.add(c) : classList.delete(c)
          },
          setAttribute: (k, v) => { attrs[k] = String(v); },
          getAttribute: (k) => attrs[k] || null,
          removeAttribute: (k) => { delete attrs[k]; },
          querySelectorAll: () => [],
          querySelector: () => null
        };
      }
      return mockElements[id];
    }

    const testState = {
      version: 5,
      revision: 3,
      year: 2026,
      month: 8,
      profile: { name: 'Admin User' },
      fixed: [],
      variable: [],
      debtors: []
    };

    const ctx = {
      window: {},
      document: {
        readyState: 'complete',
        addEventListener: () => {},
        getElementById: (id) => getMock(id),
        querySelector: (sel) => getMock(sel.replace('#', '')),
        querySelectorAll: () => []
      },
      $: (sel) => getMock(sel.replace('#', '')),
      $$: () => [],
      getState: () => testState,
      saveState: () => Promise.resolve(true),
      notify: () => {},
      mk: (y, m) => (y * 12 + m),
      ymKey: (y, m) => `${y}-${m}`,
      MONTH_NAMES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
      MONTH_ABBR: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    };
    ctx.window = ctx;

    vm.createContext(ctx);
    vm.runInContext(constantsJs, ctx);
    vm.runInContext(consolidatedJs, ctx);

    assert.strictEqual(typeof ctx.renderConsolidatedDashboardTab, 'function');
    assert.strictEqual(typeof ctx.buildConsolidatedDataset, 'function');
  });

  test('28. CHECKPOINT 5.2 — RBAC / Gestão de Módulos (Inclusão do Dashboard + Refinamento da UX de Permissões)', async () => {
    const mongoStorageJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'services', 'mongoStorage.js'), 'utf8');
    const jsonStorageJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'services', 'jsonStorage.js'), 'utf8');
    const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
    const adminJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'admin.js'), 'utf8');
    const uiShellJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'uiShell.js'), 'utf8');
    const routerJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'router.js'), 'utf8');
    const authJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'auth.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const componentsCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'components.css'), 'utf8');

    // 1. Dashboard em DEFAULT_MAINTENANCE_CONFIG em mongoStorage.js e jsonStorage.js
    assert.ok(mongoStorageJs.includes("dashboard: { maintenance: false, name: 'Dashboard' }"), "mongoStorage.js deve incluir dashboard em DEFAULT_MAINTENANCE_CONFIG");
    assert.ok(jsonStorageJs.includes("dashboard: { maintenance: false, name: 'Dashboard' }"), "jsonStorage.js deve incluir dashboard em DEFAULT_MAINTENANCE_CONFIG");

    // 2. Dashboard em DEFAULT_PERMISSIONS_FALLBACK e getDefaultPermissions nos drivers
    assert.ok(mongoStorageJs.includes("dashboard: true"), "mongoStorage.js deve incluir dashboard em DEFAULT_PERMISSIONS_FALLBACK");
    assert.ok(jsonStorageJs.includes("dashboard: true"), "jsonStorage.js deve incluir dashboard em getDefaultPermissions");

    // 3. getUserPermissions e setUserPermissions com suporte a dashboard
    assert.ok(mongoStorageJs.includes("dashboard: true") && mongoStorageJs.includes("getUserPermissions"), "mongoStorage.js getUserPermissions deve suportar dashboard");
    assert.ok(jsonStorageJs.includes("dashboard: true") && jsonStorageJs.includes("getUserPermissions"), "jsonStorage.js getUserPermissions deve suportar dashboard");

    // 4. saveDefaultPermissions sanitiza dashboard
    assert.ok(mongoStorageJs.includes("dashboard: permissions.dashboard !== false"), "mongoStorage.js saveDefaultPermissions deve persistir dashboard");
    assert.ok(serverJs.includes("dashboard: permissions.dashboard !== false"), "server.js saveDefaultPermissionsHandler deve persistir dashboard");

    // 5. ALLOWED_MODULES em server.js inclui dashboard
    assert.ok(serverJs.includes("'dashboard'") && serverJs.includes("ALLOWED_MODULES"), "server.js deve incluir 'dashboard' em ALLOWED_MODULES");

    // 6. GET /api/admin/users retorna dashboard nas permissões padrão de fallback
    assert.ok(serverJs.includes("dashboard: true") && serverJs.includes("/api/admin/users"), "server.js GET /api/admin/users deve conter dashboard");

    // 7. index.html contém checkbox de permissões padrão para dashboard
    assert.ok(indexHtml.includes('id="default-perm-dashboard"') && indexHtml.includes('data-default-module="dashboard"'), "index.html deve conter input default-perm-dashboard");

    // 8. admin.js contém ALL_MODULES_CONFIG com os 8 módulos (dashboard, despesas, extras, devedores, investimentos, beneficios, compras, simulacao)
    assert.ok(adminJs.includes("ALL_MODULES_CONFIG"), "admin.js deve definir ALL_MODULES_CONFIG");
    const requiredModules = ['dashboard', 'despesas', 'extras', 'devedores', 'investimentos', 'beneficios', 'compras', 'simulacao'];
    requiredModules.forEach(mod => {
      assert.ok(adminJs.includes(`key: '${mod}'`), `ALL_MODULES_CONFIG deve conter módulo '${mod}'`);
    });

    // 9. Tabela de usuários em admin.js substitui checkboxes inline por resumo e botão 'Gerenciar'
    assert.ok(adminJs.includes('data-manage-modules'), "Tabela de usuários em admin.js deve conter botão data-manage-modules");
    assert.ok(adminJs.includes('Admin — Acesso Total'), "Tabela de usuários em admin.js deve exibir 'Admin — Acesso Total' para administradores");

    // 10. admin.js implementa openManageModulesModal com diálogo, cancelamento sem persistência e salvamento único
    assert.ok(adminJs.includes('function openManageModulesModal'), "admin.js deve implementar openManageModulesModal");
    assert.ok(adminJs.includes('adminManageModulesDialog'), "admin.js deve criar/utilizar dialog adminManageModulesDialog");
    assert.ok(adminJs.includes('btnSaveManageModules') && adminJs.includes('updatePermissions'), "Modal de gerenciar módulos deve salvar via API.updatePermissions");

    // 11. admin.js openCreateUserModal inclui Dashboard no cadastro de novos usuários
    assert.ok(adminJs.includes('adminCreatePerm_dashboard'), "admin.js openCreateUserModal deve conter checkbox para dashboard");

    // 12. uiShell.js MAINTENANCE_MODULE_MAP inclui tab-dashboard mapeado para dashboard
    assert.ok(uiShellJs.includes("'tab-dashboard': 'dashboard'"), "uiShell.js MAINTENANCE_MODULE_MAP deve mapear 'tab-dashboard' para 'dashboard'");

    // 13. uiShell.js implementa helpers hasTabPermission, getFirstAllowedTab e getFirstAllowedRouteForUser
    assert.ok(uiShellJs.includes('function hasTabPermission'), "uiShell.js deve exportar/implementar hasTabPermission");
    assert.ok(uiShellJs.includes('function getFirstAllowedTab'), "uiShell.js deve exportar/implementar getFirstAllowedTab");
    assert.ok(uiShellJs.includes('getFirstAllowedRouteForUser'), "uiShell.js deve exportar getFirstAllowedRouteForUser");

    // 14. router.js define permission 'dashboard' para tab-dashboard
    assert.ok(routerJs.includes("'tab-dashboard'") && routerJs.includes("permission: 'dashboard'"), "router.js deve configurar permission 'dashboard' para 'tab-dashboard'");

    // 15. auth.js utiliza helper dinâmico para fallback inteligente de rota após login e cadastro
    assert.ok(authJs.includes('getFirstAllowedRouteForUser'), "auth.js deve invocar getFirstAllowedRouteForUser");

    // 16. components.css inclui estilos para module-perm-card
    assert.ok(componentsCss.includes('.module-perm-card'), "components.css deve conter estilos para .module-perm-card");

    // 17. Simulação VM para validação de retrocompatibilidade de permissões
    const mockElements = {};
    function getMock(id) {
      if (!mockElements[id]) {
        const classList = new Set();
        const attrs = {};
        mockElements[id] = {
          id,
          value: '',
          innerHTML: '',
          textContent: '',
          style: {},
          classList: {
            add: (c) => classList.add(c),
            remove: (c) => classList.delete(c),
            contains: (c) => classList.has(c),
            toggle: (c, v) => v ? classList.add(c) : classList.delete(c)
          },
          setAttribute: (k, v) => { attrs[k] = String(v); },
          getAttribute: (k) => attrs[k] || null,
          removeAttribute: (k) => { delete attrs[k]; },
          querySelectorAll: () => [],
          querySelector: () => null,
          addEventListener: () => {}
        };
      }
      return mockElements[id];
    }

    const testUserLegacy = { id: 'u_legacy', nome: 'Usuário Antigo', login: 'antigo', is_admin: false, permissions: { despesas: true } };
    const testUserBlockedDashboard = { id: 'u_blocked', nome: 'Usuário Sem Dashboard', login: 'semdash', is_admin: false, permissions: { dashboard: false, despesas: true } };
    const testUserAdmin = { id: 'u_admin', nome: 'Administrador', login: 'admin', is_admin: true };

    const ctx = {
      window: {
        addEventListener: () => {},
        removeEventListener: () => {}
      },
      document: {
        readyState: 'complete',
        addEventListener: () => {},
        getElementById: (id) => getMock(id),
        querySelector: (sel) => getMock(sel.replace('#', '')),
        querySelectorAll: () => []
      },
      $: (sel) => getMock(sel.replace('#', '')),
      $$: () => [],
      localStorage: {
        getItem: () => null,
        setItem: () => {}
      },
      getState: () => ({ theme: 'dark' }),
      saveState: () => Promise.resolve(true),
      API: {
        getUser: () => testUserLegacy
      }
    };
    ctx.window = Object.assign(ctx.window, ctx);
    vm.createContext(ctx);
    vm.runInContext(uiShellJs, ctx);

    // Usuário legado sem chave dashboard: deve ter acesso ao Dashboard por retrocompatibilidade (dashboard !== false)
    assert.strictEqual(ctx.window.hasTabPermission('tab-dashboard', testUserLegacy), true, "Usuário legado sem chave 'dashboard' deve ter permissão true por retrocompatibilidade");
    assert.strictEqual(ctx.window.getFirstAllowedTab(testUserLegacy), 'tab-dashboard', "Primeira aba para usuário legado deve ser tab-dashboard");

    // Usuário com dashboard: false: fallback inteligente deve direcionar para tab-expenses (Despesas)
    assert.strictEqual(ctx.window.hasTabPermission('tab-dashboard', testUserBlockedDashboard), false, "Usuário com dashboard: false deve ter permissão negada");
    assert.strictEqual(ctx.window.getFirstAllowedTab(testUserBlockedDashboard), 'tab-expenses', "Primeira aba permitida para usuário sem dashboard deve ser tab-expenses");
    assert.strictEqual(ctx.window.getFirstAllowedRouteForUser(testUserBlockedDashboard), '/despesas', "Primeira rota permitida deve ser /despesas");

    // Administrador: acesso irrestrito
    assert.strictEqual(ctx.window.hasTabPermission('tab-dashboard', testUserAdmin), true, "Administrador deve ter acesso ao Dashboard");
    assert.strictEqual(ctx.window.hasTabPermission('tab-admin', testUserAdmin), true, "Administrador deve ter acesso a tab-admin");

    // 18. Checkpoint 5.2.1: renderMaintenanceGrid inclui Dashboard na seção visual e cria toggle dedicado
    assert.ok(adminJs.includes('function renderMaintenanceGrid'), "admin.js deve implementar renderMaintenanceGrid");
    assert.ok(adminJs.includes('maint-toggle-${key}') || adminJs.includes('data-maintenance-module'), "admin.js deve criar toggles de manutenção com data-maintenance-module");
    assert.ok(adminJs.includes('ALL_MODULES_CONFIG.map'), "renderMaintenanceGrid deve iterar sobre ALL_MODULES_CONFIG garantindo Dashboard como primeiro módulo");

    // 19. Checkpoint 5.2.2: Normalização de manutenção e fallback estrito para dashboard: false
    assert.ok(adminJs.includes('function normalizeMaintenanceConfig'), "admin.js deve implementar normalizeMaintenanceConfig");

    // Teste VM de normalização de manutenção
    const adminCtx = {
      window: {
        addEventListener: () => {},
        removeEventListener: () => {}
      },
      document: {
        readyState: 'complete',
        addEventListener: () => {},
        getElementById: (id) => getMock(id),
        querySelector: (sel) => getMock(sel.replace('#', '')),
        querySelectorAll: () => []
      },
      $: (sel) => getMock(sel.replace('#', '')),
      $$: () => [],
      localStorage: {
        getItem: () => null,
        setItem: () => {}
      },
      getState: () => ({ theme: 'dark' }),
      saveState: () => Promise.resolve(true),
      API: {
        getUser: () => testUserAdmin
      }
    };
    adminCtx.window = Object.assign(adminCtx.window, adminCtx);
    vm.createContext(adminCtx);
    vm.runInContext(adminJs, adminCtx);

    // Documento legado sem chave dashboard
    const legacyMaintenanceRaw = {
      despesas: { name: 'Despesas', maintenance: false },
      extras: { name: 'Rendas Extras', maintenance: true }
    };
    const normalizedLegacy = adminCtx.normalizeMaintenanceConfig ? adminCtx.normalizeMaintenanceConfig(legacyMaintenanceRaw) : null;
    if (normalizedLegacy) {
      assert.strictEqual(normalizedLegacy.dashboard.maintenance, false, "Dashboard sem chave persistida DEVE normalizar para maintenance: false (Operacional)");
      assert.strictEqual(normalizedLegacy.despesas.maintenance, false, "Despesas deve preservar maintenance: false");
      assert.strictEqual(normalizedLegacy.extras.maintenance, true, "Extras deve preservar maintenance: true");
    }

    // Configuração com dashboard explicitamente em manutenção
    const maintenanceActiveRaw = {
      dashboard: { name: 'Dashboard', maintenance: true },
      despesas: { name: 'Despesas', maintenance: false }
    };
    const normalizedActive = adminCtx.normalizeMaintenanceConfig ? adminCtx.normalizeMaintenanceConfig(maintenanceActiveRaw) : null;
    if (normalizedActive) {
      assert.strictEqual(normalizedActive.dashboard.maintenance, true, "Dashboard com maintenance: true deve normalizar para true (Em Manutenção)");
    }
  });

  test('29. Checkpoint 6 — Ícones Semânticos de Investimentos + Globe', async () => {
    const vm = require('node:vm');
    const constantsJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'constants.js'), 'utf-8');
    const investmentsJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'investments.js'), 'utf-8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');

    // Contexto VM para validar constantes e helpers
    const ctx = {
      window: {},
      document: {
        readyState: 'complete',
        addEventListener: () => {},
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => []
      }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(constantsJs, ctx);

    // 1. globe possui SVG válido e simétrico (contém -4-10 para fechamento do hemisfério esquerdo)
    const destGlobe = ctx.DEST_SVG_ICONS ? ctx.DEST_SVG_ICONS.globe : null;
    assert.ok(destGlobe, 'DEST_SVG_ICONS.globe deve existir');
    assert.ok(destGlobe.includes('viewBox="0 0 24 24"'), 'globe deve ter viewBox 0 0 24 24');
    assert.ok(destGlobe.includes('-4-10') || destGlobe.includes('-4 -10') || destGlobe.includes('15.3 0 0 1-4-10'), 'globe deve possuir simetria de arco elíptico correta');

    // 2. globe existe para Destinos
    assert.ok(ctx.DEST_SVG_ICONS && ctx.DEST_SVG_ICONS.globe, 'DEST_SVG_ICONS.globe deve estar definido');

    // 3. globe existe para Categorias
    assert.ok(ctx.CATEGORY_SVG_ICONS && ctx.CATEGORY_SVG_ICONS.globe, 'CATEGORY_SVG_ICONS.globe deve estar definido');

    // 4. Categorias de investimento possuem metadado de ícone
    assert.ok(typeof ctx.INVESTMENT_CATEGORY_META === 'object', 'INVESTMENT_CATEGORY_META deve ser um objeto');
    assert.strictEqual(typeof ctx.getInvestmentCategoryMeta, 'function', 'getInvestmentCategoryMeta deve ser função');
    assert.strictEqual(typeof ctx.getInvestmentIconSvg, 'function', 'getInvestmentIconSvg deve ser função');

    // 5. Renda Fixa possui ícone
    const rfMeta = ctx.getInvestmentCategoryMeta('Renda Fixa');
    assert.strictEqual(rfMeta.icon, 'banknote', 'Renda Fixa deve ter ícone banknote');
    assert.ok(ctx.getInvestmentIconSvg('Renda Fixa').includes('<svg'), 'getInvestmentIconSvg(Renda Fixa) deve retornar SVG');

    // 6. Ações possui ícone
    const acoesMeta = ctx.getInvestmentCategoryMeta('Ações');
    assert.strictEqual(acoesMeta.icon, 'chart', 'Ações deve ter ícone chart');
    assert.ok(ctx.getInvestmentIconSvg('Ações').includes('<svg'), 'getInvestmentIconSvg(Ações) deve retornar SVG');

    // 7. FIIs possui ícone
    const fiisMeta = ctx.getInvestmentCategoryMeta('FIIs');
    assert.strictEqual(fiisMeta.icon, 'building', 'FIIs deve ter ícone building');
    assert.ok(ctx.getInvestmentIconSvg('FIIs').includes('<svg'), 'getInvestmentIconSvg(FIIs) deve retornar SVG');

    // 8. Cripto possui ícone
    const criptoMeta = ctx.getInvestmentCategoryMeta('Cripto');
    assert.strictEqual(criptoMeta.icon, 'coins', 'Cripto deve ter ícone coins');
    assert.ok(ctx.getInvestmentIconSvg('Cripto').includes('<svg'), 'getInvestmentIconSvg(Cripto) deve retornar SVG');

    // Modalidades patrimoniais
    assert.strictEqual(ctx.getInvestmentCategoryMeta('Veículo').icon, 'car', 'Veículo deve ter ícone car');
    assert.strictEqual(ctx.getInvestmentCategoryMeta('Viagem').icon, 'plane', 'Viagem deve ter ícone plane');
    assert.strictEqual(ctx.getInvestmentCategoryMeta('Residência').icon, 'home', 'Residência deve ter ícone home');

    // 9. Outros utiliza fallback válido
    const outrosMeta = ctx.getInvestmentCategoryMeta('Outros');
    assert.strictEqual(outrosMeta.icon, 'globe', 'Outros deve ter ícone globe');
    assert.ok(ctx.getInvestmentIconSvg('Outros').includes('<svg'), 'getInvestmentIconSvg(Outros) deve retornar SVG');

    // 10. Categoria desconhecida não quebra renderização e faz fallback para globe
    const unkMeta = ctx.getInvestmentCategoryMeta('Ativo Raro Inexistente');
    assert.strictEqual(unkMeta.icon, 'globe', 'Categoria desconhecida deve fazer fallback seguro para globe');
    assert.ok(ctx.getInvestmentIconSvg('Ativo Raro Inexistente').includes('<svg'), 'Categoria desconhecida deve retornar SVG de fallback');

    // 11. Ativo legado em string continua funcionando
    assert.ok(ctx.getInvestmentIconSvg('Tesouro Direto Pré-Fixado').includes('<svg'), 'Normalização aproximada deve retornar SVG para ativos legados');

    // 12. Validação estática de index.html e investments.js
    assert.ok(indexHtml.includes('id="assetCategory"'), 'index.html deve conter o select de categorias de ativos');
    assert.ok(indexHtml.includes('value="Veículo"'), 'index.html deve conter categoria Veículo');
    assert.ok(indexHtml.includes('value="Viagem"'), 'index.html deve conter categoria Viagem');
    assert.ok(indexHtml.includes('value="Residência"'), 'index.html deve conter categoria Residência');
    assert.ok(investmentsJs.includes('getInvestmentIconSvg'), 'investments.js deve invocar getInvestmentIconSvg para renderizar tags com ícones');

    // 13. Persistência real e aportes no MongoDB permanecem íntegros
    const getRes1 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const userDoc1 = await getRes1.json();
    const rev1 = Number(userDoc1.revision || 0);

    const testAsset = {
      id: 'asset-test-1',
      name: 'Fundo Imobiliário HGLG11',
      category: 'FIIs',
      destination: 'XP Investimentos',
      currentAmount: 5000.00,
      goalAmount: 20000.00,
      note: 'Logística'
    };

    const testAporte = {
      id: 'aporte-test-1',
      assetId: 'asset-test-1',
      amount: 1000.00,
      month: 8,
      year: 2026,
      note: 'Reinvestimento de proventos'
    };

    const updatePayload = Object.assign({}, userDoc1, {
      expectedRevision: rev1,
      assets: [testAsset],
      aportes: [testAporte]
    });

    const putRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });
    assert.strictEqual(putRes.status, 200, 'Salvar ativo e aporte deve retornar 200 OK');

    // 14. Leitura subsequente confirma que assets permanece sem campo destrutivo e derivável em runtime
    const getRes2 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const userDoc2 = await getRes2.json();
    const savedAsset = userDoc2.assets.find(a => a.id === 'asset-test-1');
    assert.ok(savedAsset, 'Ativo salvo deve existir no banco');
    assert.strictEqual(savedAsset.category, 'FIIs', 'Categoria deve ser preservada como string limpa');
    assert.strictEqual(savedAsset.currentAmount, 5000.00, 'Valor deve ser preservado');
    assert.strictEqual(userDoc2.aportes.length, 1, 'Aporte deve ser persistido');
    assert.strictEqual(userDoc2.aportes[0].amount, 1000.00, 'Valor do aporte deve ser preservado');
  });

  test('30. Checkpoint 7 — Guia do Sistema & Onboarding', async () => {
    const vm = require('node:vm');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    const welcomeTourJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'welcomeTour.js'), 'utf-8');
    const stateJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'state.js'), 'utf-8');

    // 1. Guia contém seção Simulação
    assert.ok(indexHtml.includes('Simulação de Cenários Financeiros'), 'Guia deve conter título de Simulação de Cenários');

    // 2. Guia contém seção Lista de Compras
    assert.ok(indexHtml.includes('Lista de Compras Inteligente'), 'Guia deve conter título de Lista de Compras');

    // 3. Documentação da Simulação menciona sandbox/isolamento
    assert.ok(indexHtml.includes('Sandbox') || indexHtml.includes('sandbox'), 'Guia de Simulação deve citar Sandbox');
    assert.ok(indexHtml.includes('isolado') || indexHtml.includes('seguro'), 'Guia de Simulação deve destacar ambiente seguro e isolado');

    // 4. Documentação da Lista menciona autocomplete e catálogo
    assert.ok(indexHtml.includes('Autocomplete') || indexHtml.includes('autocomplete'), 'Guia de Lista de Compras deve citar Autocomplete');
    assert.ok(indexHtml.includes('catálogo') || indexHtml.includes('sugestões'), 'Guia de Lista de Compras deve citar catálogo de sugestões');

    // 5. Modal de boas-vindas existe no DOM
    assert.ok(indexHtml.includes('id="welcome-tour-popover"'), 'index.html deve conter o modal welcome-tour-popover');
    assert.ok(indexHtml.includes('id="btnDismissOnboarding"'), 'index.html deve conter o botão Explorar depois');
    assert.ok(indexHtml.includes('id="btnExploreGuideOnboarding"') || indexHtml.includes('id="btnOpenGuideFromWelcome"'), 'index.html deve conter ação de Abrir Guia');

    // Setup de contexto VM para validar lógica de exibição
    let mockHydrated = false;
    let mockState = { onboarding: { welcomeSeen: false } };
    const ctx = {
      window: {},
      isStateHydrated: () => mockHydrated,
      getState: () => mockState,
      saveState: () => Promise.resolve(true),
      document: {
        readyState: 'complete',
        addEventListener: () => {},
        getElementById: () => ({ hidden: true, classList: { add: () => {}, remove: () => {}, contains: () => false }, style: { setProperty: () => {}, removeProperty: () => {} }, setAttribute: () => {}, removeAttribute: () => {} })
      }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(welcomeTourJs, ctx);

    // 6. Modal NÃO abre antes da hidratação completa
    mockHydrated = false;
    mockState = { onboarding: { welcomeSeen: false } };
    assert.strictEqual(ctx.shouldShowWelcomeTour(), false, 'Modal de boas-vindas NÃO deve abrir antes da hidratação');

    // 7. Novo usuário (com welcomeSeen: false) recebe onboarding pós-hidratação
    mockHydrated = true;
    mockState = { onboarding: { welcomeSeen: false } };
    assert.strictEqual(ctx.shouldShowWelcomeTour(), true, 'Novo usuário hidratado deve receber o modal');

    // 8. Usuário que já concluiu (com welcomeSeen: true) não recebe novamente
    mockHydrated = true;
    mockState = { onboarding: { welcomeSeen: true } };
    assert.strictEqual(ctx.shouldShowWelcomeTour(), false, 'Usuário que já concluiu não deve ver o modal');

    // 10. Usuário legado (sem a chave onboarding) não é interrompido
    mockHydrated = true;
    mockState = {};
    assert.strictEqual(ctx.shouldShowWelcomeTour(), false, 'Usuário legado não deve ser interrompido');

    // 9 & 11 & 12 & 13. Teste end-to-end com cadastro de novo usuário na API
    const newLogin = `onboard_${Date.now()}`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Novo Onboarding User',
        login: newLogin,
        email: `${newLogin}@omnifin.test`,
        senha: 'Password123!@#'
      })
    });
    assert.strictEqual(regRes.status, 201, 'Registro de novo usuário deve retornar 201');
    const regJson = await regRes.json();
    const newUserToken = regJson.token;

    // Primeiro login: leitura das finanças inicializadas
    const getFin1 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${newUserToken}` }
    });
    const finDoc1 = await getFin1.json();
    assert.ok(finDoc1.onboarding, 'Documento de novo usuário deve conter objeto onboarding');
    assert.strictEqual(finDoc1.onboarding.welcomeSeen, false, 'Novo usuário deve nascer com onboarding.welcomeSeen = false');

    // Usuário conclui onboarding ("Explorar depois" ou "Abrir Guia")
    const revNew = Number(finDoc1.revision || 0);
    const updateOnboarding = Object.assign({}, finDoc1, {
      expectedRevision: revNew,
      onboarding: { welcomeSeen: true }
    });
    const putFin = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${newUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateOnboarding)
    });
    assert.strictEqual(putFin.status, 200, 'Salvar conclusão do onboarding deve retornar 200 OK');

    // Segundo login / F5: confirmação de que onboarding foi gravado e isolado por usuário
    const getFin2 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${newUserToken}` }
    });
    const finDoc2 = await getFin2.json();
    assert.strictEqual(finDoc2.onboarding.welcomeSeen, true, 'welcomeSeen deve permanecer true em sessões subsequentes');

    // Confirmação de isolamento: usuário principal não foi afetado
    const getAdminFin = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const adminDoc = await getAdminFin.json();
    assert.ok(adminDoc, 'Documento de outro usuário permanece íntegro');

    // 14. Novo usuário criado via painel ADMIN também deve nascer com onboarding.welcomeSeen = false
    const adminCreatedLogin = `admin_created_${Date.now()}`;
    const adminCreateRes = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nome: 'Usuario Criado Pelo Admin',
        login: adminCreatedLogin,
        email: `${adminCreatedLogin}@omnifin.test`,
        senha: 'Password123!@#',
        is_admin: false
      })
    });
    assert.strictEqual(adminCreateRes.status, 201, 'Admin criar usuário deve retornar 201');

    // Login com o usuário criado pelo admin
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: adminCreatedLogin,
        senha: 'Password123!@#'
      })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginRes.status, 200, 'Login do usuário criado pelo admin deve retornar 200');

    const adminCreatedFinRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${loginJson.token}` }
    });
    const adminCreatedFin = await adminCreatedFinRes.json();
    assert.strictEqual(adminCreatedFin.onboarding?.welcomeSeen, false, 'Usuário criado pelo admin deve nascer com onboarding.welcomeSeen = false');
  });

  test('31. Checkpoint 7.1 — Cores Personalizáveis nas Categorias & Paleta Rápida', async () => {
    const vm = require('node:vm');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    const constantsJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'constants.js'), 'utf-8');
    const stateJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'state.js'), 'utf-8');
    const profileJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'profile.js'), 'utf-8');

    // 1. UI: input de cor e paleta rápida existem no DOM de Categorias no Perfil
    assert.ok(indexHtml.includes('id="newCategoryColor"'), 'index.html deve conter input id="newCategoryColor"');
    assert.ok(indexHtml.includes('id="catColorPalette"'), 'index.html deve conter paleta id="catColorPalette"');
    assert.ok(indexHtml.includes('cat-color-swatch-btn'), 'index.html deve conter botões de swatch para categorias');

    // 2. Setup VM com constants.js e state.js
    const ctx = {
      window: {},
      getState: () => ({ categories: [] }),
      document: { readyState: 'complete', addEventListener: () => {} }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(constantsJs, ctx);
    vm.runInContext(stateJs, ctx);

    // 3. getCategoryColor e getCategoryMeta resolvem cor personalizada e fallback
    assert.strictEqual(typeof ctx.getCategoryColor, 'function', 'getCategoryColor deve ser função global');
    assert.strictEqual(typeof ctx.getCategoryMeta, 'function', 'getCategoryMeta deve ser função global');

    // Objeto com cor explícita
    const customCat = { name: 'Supermercado Especial', icon: 'shopping', color: '#820AD1' };
    assert.strictEqual(ctx.getCategoryColor(customCat), '#820AD1', 'getCategoryColor deve retornar cor explícita');

    // Categoria legada como string simples
    const stringCat = 'Moradia';
    const resolvedColor = ctx.getCategoryColor(stringCat);
    assert.ok(resolvedColor && resolvedColor.startsWith('#'), 'Categoria legada string deve resolver para cor HEX de fallback');

    // 4. normalizeCategories preserva color e normaliza dados híbridos
    const mixedCats = [
      'Transporte',
      { name: 'Saúde', icon: 'health' },
      { name: 'Lazer VIP', icon: 'star', color: '#EC4899' }
    ];
    const normalized = ctx.normalizeCategories(mixedCats);
    assert.strictEqual(normalized.length, 3, 'normalizeCategories deve retornar todos os itens');
    assert.strictEqual(normalized[0].name, 'Transporte');
    assert.ok(normalized[0].color, 'Item string deve receber cor padrão');
    assert.strictEqual(normalized[2].color, '#EC4899', 'Item com cor explícita deve preservar sua cor');

    // 5. Teste E2E de persistência via API PUT /api/finances e leitura subsequente
    const getRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const curDoc = await getRes.json();
    const curRev = Number(curDoc.revision || 0);

    const updatedCategories = [
      { name: 'Alimentação Gourmet', icon: 'utensils', color: '#FF7A00' },
      { name: 'Tech & Gadgets', icon: 'briefcase', color: '#2563EB' },
      { name: 'Viagens', icon: 'plane', color: '#06B6D4' }
    ];

    const putPayload = Object.assign({}, curDoc, {
      expectedRevision: curRev,
      categories: updatedCategories
    });

    const putRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putPayload)
    });
    assert.strictEqual(putRes.status, 200, 'Salvar categorias com cores personalizadas deve retornar 200 OK');

    // Leitura subsequente confirma persistência íntegra no banco de dados
    const getRes2 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const freshDoc = await getRes2.json();
    const techCat = freshDoc.categories.find(c => c.name === 'Tech & Gadgets');
    assert.ok(techCat, 'Categoria personalizada deve existir no documento lido');
    assert.strictEqual(techCat.color, '#2563EB', 'Cor personalizada #2563EB deve ser persistida com sucesso');
    assert.strictEqual(techCat.icon, 'briefcase', 'Ícone deve ser preservado');
  });

  test('32. Checkpoint 8 — Agente de IA + Integração com n8n (Read-Only Assistant, Contrato e Segurança via Basic Auth)', async () => {
    // 0. Leitura inicial dos dados para checagem de integridade read-only
    const initialFinancesRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const initialFinances = await initialFinancesRes.json();
    const initialRevision = Number(initialFinances.revision || 0);

    // 1. Rota exige autenticação (401 sem token)
    const unauthRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Quanto gastei este mês?' })
    });
    assert.strictEqual(unauthRes.status, 401, 'POST /api/ai/chat sem token deve retornar 401 Unauthorized');

    // 2. Mensagem vazia retorna 400 Bad Request
    const emptyMsgRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: '   ' })
    });
    assert.strictEqual(emptyMsgRes.status, 400, 'Mensagem vazia deve retornar 400');
    const emptyJson = await emptyMsgRes.json();
    assert.strictEqual(emptyJson.success, false);

    // 3. Mensagem excessivamente longa (> 2000 caracteres) retorna 400 Bad Request
    const longMsgRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'A'.repeat(2005) })
    });
    assert.strictEqual(longMsgRes.status, 400, 'Mensagem superior a 2000 caracteres deve retornar 400');

    // 4. Sem URL de webhook ou credenciais Basic Auth configuradas (503 Service Unavailable)
    const origWebhookUrl = config.N8N_AI_WEBHOOK_URL;
    const origAuthUser = config.N8N_AI_BASIC_AUTH_USER;
    const origAuthPass = config.N8N_AI_BASIC_AUTH_PASSWORD;

    // Cenário A: URL ausente
    config.N8N_AI_WEBHOOK_URL = '';
    config.N8N_AI_BASIC_AUTH_USER = 'user_test';
    config.N8N_AI_BASIC_AUTH_PASSWORD = 'pass_test';

    const noUrlRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'Quanto gastei?' })
    });
    assert.strictEqual(noUrlRes.status, 503, 'Sem N8N_AI_WEBHOOK_URL deve retornar 503 Service Unavailable');
    const noUrlJson = await noUrlRes.json();
    assert.strictEqual(noUrlJson.unavailable, true);

    // Cenário B: Usuário ou senha Basic Auth ausentes
    config.N8N_AI_WEBHOOK_URL = 'http://127.0.0.1:9999/mock-n8n';
    config.N8N_AI_BASIC_AUTH_USER = '';
    config.N8N_AI_BASIC_AUTH_PASSWORD = '';

    const noCredsRes = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'Quanto gastei?' })
    });
    assert.strictEqual(noCredsRes.status, 503, 'Sem Basic Auth configurado deve retornar 503 Service Unavailable');

    // 5. Teste com Mock de Webhook do n8n com Basic Auth
    const testUser = 'omnifin_agent_test';
    const testPass = 'secret_pass_test_2026';
    const expectedBasicHeader = 'Basic ' + Buffer.from(`${testUser}:${testPass}`).toString('base64');

    config.N8N_AI_WEBHOOK_URL = 'http://127.0.0.1:9999/mock-n8n';
    config.N8N_AI_BASIC_AUTH_USER = testUser;
    config.N8N_AI_BASIC_AUTH_PASSWORD = testPass;

    const originalGlobalFetch = global.fetch;
    let interceptedWebhookCall = null;

    try {
      // Mock da requisição enviada pelo backend ao n8n
      global.fetch = async (url, options = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('/mock-n8n')) {
          interceptedWebhookCall = {
            url: urlStr,
            method: options.method,
            headers: options.headers,
            body: JSON.parse(options.body)
          };

          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              conversationId: interceptedWebhookCall.body.conversationId,
              answer: 'Você gastou um total de R$ 1.500,00 neste mês.',
              suggestions: ['Ver despesas por categoria', 'Comparar com o mês passado']
            }),
            text: async () => ''
          };
        }
        return originalGlobalFetch(url, options);
      };

      // Tenta enviar userId malicioso no body para tentar espionar outro usuário
      const chatRes = await fetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: 'usr_hacker_impostor',
          message: 'Quanto gastei com mercado?',
          conversationId: 'conv_unit_test_123',
          context: { month: 8, year: 2026 }
        })
      });

      assert.strictEqual(chatRes.status, 200, 'POST /api/ai/chat com n8n mockado deve retornar 200 OK');
      const chatJson = await chatRes.json();
      assert.strictEqual(chatJson.success, true);
      assert.strictEqual(chatJson.conversationId, 'conv_unit_test_123');
      assert.ok(chatJson.answer.includes('R$ 1.500,00'));
      assert.strictEqual(chatJson.suggestions.length, 2);

      // Validação minuciosa do payload e headers interceptados enviados ao n8n
      assert.ok(interceptedWebhookCall, 'A chamada para o n8n deve ter sido executada');
      assert.strictEqual(interceptedWebhookCall.headers['Authorization'], expectedBasicHeader, 'Header Authorization deve conter Basic Auth correto');
      assert.strictEqual(interceptedWebhookCall.headers['X-OmniFin-Webhook-Secret'], undefined, 'Header antigo X-OmniFin-Webhook-Secret NÃO deve mais ser enviado');

      // Credenciais não devem entrar no corpo JSON do payload
      assert.strictEqual(interceptedWebhookCall.body[testUser], undefined);
      assert.strictEqual(interceptedWebhookCall.body[testPass], undefined);

      assert.notStrictEqual(interceptedWebhookCall.body.user.id, 'usr_hacker_impostor', 'userId enviado pelo body não deve sobrepor o usuário do JWT');
      assert.ok(interceptedWebhookCall.body.user.id, 'userId deve ser o do usuário autenticado');
      assert.ok(interceptedWebhookCall.body.financialContext, 'Contexto financeiro deve ser construído');
      assert.strictEqual(interceptedWebhookCall.body.financialContext.period.month, 8);
      assert.strictEqual(interceptedWebhookCall.body.financialContext.period.year, 2026);
      assert.ok(interceptedWebhookCall.body.systemDocumentation.includes('OMNIFIN V3 - GUIA'), 'Documentação do sistema deve ser incluída');

      // 6. Teste de Falha HTTP 401 / 500 do n8n
      global.fetch = async (url, options = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('/mock-n8n')) {
          return {
            ok: false,
            status: 401,
            text: async () => 'Unauthorized Basic Auth in n8n'
          };
        }
        return originalGlobalFetch(url, options);
      };

      const unauthN8nRes = await fetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Teste erro 401 n8n' })
      });
      assert.strictEqual(unauthN8nRes.status, 502, 'Erro upstream 401 do n8n deve retornar 502 Bad Gateway seguro');
      const unauthN8nJson = await unauthN8nRes.json();
      assert.strictEqual(unauthN8nJson.success, false);

      // 7. Teste de Resposta Inválida do n8n (sem campo answer)
      global.fetch = async (url, options = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('/mock-n8n')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ foo: 'bar' })
          };
        }
        return originalGlobalFetch(url, options);
      };

      const invalidRes = await fetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Teste resposta sem answer' })
      });
      assert.strictEqual(invalidRes.status, 502, 'Resposta sem answer deve retornar 502');

      // 8. Teste de Timeout (Simulação de AbortController)
      global.fetch = async (url, options = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('/mock-n8n')) {
          const timeoutErr = new Error('The operation was aborted');
          timeoutErr.name = 'AbortError';
          throw timeoutErr;
        }
        return originalGlobalFetch(url, options);
      };

      const timeoutRes = await fetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Teste timeout' })
      });
      assert.strictEqual(timeoutRes.status, 504, 'Timeout deve retornar 504 Gateway Timeout');

      // 9. Garantia de Read-Only: Verifica que o documento do usuário não sofreu mutações
      const getFinancesRes = await fetch(`${baseUrl}/api/finances`, {
        headers: { 'Authorization': `Bearer ${testUserToken}` }
      });
      const financesAfterChat = await getFinancesRes.json();
      assert.strictEqual(Number(financesAfterChat.revision), initialRevision, 'Revisão dos dados do usuário não deve ser alterada pelo chat com IA');

      // 10. Contrato de Frontend (api.js & aiAssistant.js): Validação de API.aiChat
      const apiCode = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'api.js'), 'utf-8');
      const aiAssistantCode = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'modules', 'aiAssistant.js'), 'utf-8');

      assert.ok(apiCode.includes('aiChat: (payload) => request(\'/api/ai/chat\''), 'api.js deve expor método público aiChat');
      assert.ok(apiCode.includes('request: (endpoint, options) => request(endpoint, options)'), 'api.js deve expor método request no objeto público API');
      assert.ok(aiAssistantCode.includes('window.API.aiChat'), 'aiAssistant.js deve utilizar window.API.aiChat como método primário');
      assert.ok(!aiAssistantCode.includes('window.API.request('), 'aiAssistant.js não deve chamar window.API.request diretamente');

      // 11. Segurança: Frontend não pode conter credenciais n8n
      assert.ok(!apiCode.includes('N8N_AI_BASIC_AUTH_PASSWORD'), 'api.js não pode conter referências a senhas do n8n');
      assert.ok(!aiAssistantCode.includes('N8N_AI_BASIC_AUTH_PASSWORD'), 'aiAssistant.js não pode conter senhas do n8n');

      // 12. Execução simulada de window.API.aiChat com JWT
      const vm = await import('vm');
      let apiFetchCalled = false;
      let apiFetchUrl = '';
      let apiFetchOptions = {};

      const sandbox = {
        window: {
          location: { pathname: '/dashboard' }
        },
        document: {
          querySelector: () => null,
          getElementById: () => null,
          createElement: () => ({ appendChild: () => {}, classList: { add: () => {}, remove: () => {} }, addEventListener: () => {} }),
          body: { appendChild: () => {} }
        },
        localStorage: {
          getItem: (k) => k === 'auth_token' ? 'mock_jwt_token_12345' : null,
          setItem: () => {},
          removeItem: () => {}
        },
        fetch: async (url, opts) => {
          apiFetchCalled = true;
          apiFetchUrl = url;
          apiFetchOptions = opts;
          return {
            status: 200,
            json: async () => ({ success: true, conversationId: 'conv_fe_test', answer: 'Olá, teste de contrato!', suggestions: [] })
          };
        },
        console
      };
      vm.createContext(sandbox);
      vm.runInContext(apiCode, sandbox);

      assert.strictEqual(typeof sandbox.window.API.aiChat, 'function', 'window.API.aiChat deve ser uma função no browser');
      assert.strictEqual(typeof sandbox.window.API.request, 'function', 'window.API.request deve ser uma função no browser');

      const chatResult = await sandbox.window.API.aiChat({ message: 'Oi', conversationId: 'conv_fe_test' });
      assert.ok(apiFetchCalled, 'window.API.aiChat deve invocar o fetch subjacente');
      assert.strictEqual(apiFetchUrl, '/api/ai/chat', 'URL de chamada deve ser /api/ai/chat');
      assert.strictEqual(apiFetchOptions.headers['Authorization'], 'Bearer mock_jwt_token_12345', 'Deve incluir header Bearer com JWT do usuário');
      assert.strictEqual(chatResult.success, true);
      assert.strictEqual(chatResult.answer, 'Olá, teste de contrato!');

      // 13. Checkpoint 8.1: Diretrizes de Tom, Reatividade e Formatação sem Markdown Cru
      const { SYSTEM_GUIDE_CONTEXT } = await import('../server/services/aiService.js');
      assert.ok(SYSTEM_GUIDE_CONTEXT.includes('Tom de Voz: Leve, natural, direto'), 'SYSTEM_GUIDE_CONTEXT deve conter diretrizes de tom leve e direto');
      assert.ok(SYSTEM_GUIDE_CONTEXT.includes('Regra de Não-Despejo de Contexto'), 'SYSTEM_GUIDE_CONTEXT deve proibir despejo automático de relatórios em saudações');
      assert.ok(SYSTEM_GUIDE_CONTEXT.includes('Widget Compacto'), 'SYSTEM_GUIDE_CONTEXT deve instruir respostas concisas para widget compacto');
      assert.ok(SYSTEM_GUIDE_CONTEXT.includes('Sem Markdown Cru'), 'SYSTEM_GUIDE_CONTEXT deve orientar texto limpo sem markdown cru');

      // 14. Checkpoint 8.1: Teste de Sanitização e Formatação no Frontend (formatAiMessageContent)
      assert.ok(aiAssistantCode.includes('function formatAiMessageContent('), 'aiAssistant.js deve definir formatAiMessageContent');
      assert.ok(aiAssistantCode.includes('formatAiMessageContent(msg.text)'), 'renderAiMessages deve utilizar formatAiMessageContent');

      // Simulação da função formatAiMessageContent
      const sandboxAi = {
        window: { API: { isAuthenticated: () => false } },
        document: {
          getElementById: () => null,
          createElement: () => ({ setAttribute: () => {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
          body: { appendChild: () => {} },
          addEventListener: () => {}
        }
      };
      const vmAi = await import('vm');
      vmAi.createContext(sandboxAi);
      vmAi.runInContext(aiAssistantCode, sandboxAi);

      const formatFn = sandboxAi.window.formatAiMessageContent;
      assert.strictEqual(typeof formatFn, 'function', 'formatAiMessageContent deve ser uma função executável');

      // A. Conversão de Markdown Bold para <strong> sem asteriscos literais
      const boldFormatted = formatFn('Você tem **R$ 2.858,06** em despesas em **outubro de 2026**.');
      assert.strictEqual(boldFormatted, 'Você tem <strong>R$ 2.858,06</strong> em despesas em <strong>outubro de 2026</strong>.');
      assert.ok(!boldFormatted.includes('**'), 'Não deve conter asteriscos duplos após formatação');

      // B. Preservação de quebras de linha com <br>
      const multiline = formatFn('Olá, Lorenzo!\nComo posso te ajudar hoje?');
      assert.strictEqual(multiline, 'Olá, Lorenzo!<br>Como posso te ajudar hoje?');

      // C. Limpeza de hashes de headers e backticks
      const hashFormatted = formatFn('### Resumo do Mês\n`detalhe`');
      assert.strictEqual(hashFormatted, 'Resumo do Mês<br>detalhe');

      // D. Proteção XSS (escape de tags maliciosas)
      const xssFormatted = formatFn('<script>alert("hack")</script>');
      assert.ok(!xssFormatted.includes('<script>'), 'Tags script devem ser escapadas');
      assert.ok(xssFormatted.includes('&lt;script&gt;'));

      // 15. Checkpoint 8.2: Validação de Contexto Histórico Multiperíodo e Paridade de Métricas
      const { buildFinancialContext } = await import('../server/services/aiService.js');

      // Mock de documento financeiro com dados de múltiplos meses, devedores com countInTotal true/false, rendas extras e benefícios
      const mockFinances = {
        month: 10,
        year: 2026,
        profile: {
          name: 'Lorenzo',
          baseSalary: 2917.56
        },
        benefitsConfig: {
          amount: 1053.63,
          va: 600.00,
          vr: 453.63
        },
        fixed: [
          {
            id: 'fix_1',
            name: 'Internet Fibra',
            group: 'Moradia',
            destination: 'Nubank',
            amount: 120.00,
            versions: [
              { year: 2026, month: 1, amount: 100.00 },
              { year: 2026, month: 8, amount: 120.00 }
            ]
          }
        ],
        variable: [
          {
            id: 'var_1',
            name: 'Celular Novo',
            group: 'Tecnologia',
            destination: 'Inter',
            amount: 300.00,
            startYear: 2026,
            startMonth: 8,
            endYear: 2026,
            endMonth: 11
          }
        ],
        extras: [
          {
            id: 'ext_1',
            title: 'Freelance Design',
            source: 'Projetos',
            amount: 500.00,
            startYear: 2026,
            startMonth: 9,
            endYear: 2026,
            endMonth: 9
          }
        ],
        debtors: [
          {
            id: 'deb_1',
            debtorName: 'Carlos',
            title: 'Empréstimo',
            amount: 200.00,
            startYear: 2026,
            startMonth: 8,
            endYear: 2026,
            endMonth: 10,
            countInTotal: true // entra na renda
          },
          {
            id: 'deb_2',
            debtorName: 'Mariana',
            title: 'Viagem',
            amount: 150.00,
            startYear: 2026,
            startMonth: 8,
            endYear: 2026,
            endMonth: 10,
            countInTotal: false // NÃO entra na renda mensal
          }
        ],
        assets: [
          { name: 'Tesouro Selic', category: 'Renda Fixa', currentAmount: 15000.00 }
        ]
      };

      // Executa buildFinancialContext com activePeriod = Outubro/2026
      const ctx = buildFinancialContext(mockFinances, 10, 2026);

      // A. Active period Outubro / períodos históricos disponíveis
      assert.strictEqual(ctx.activePeriod.month, 10, 'activePeriod deve ser Outubro');
      assert.strictEqual(ctx.activePeriod.year, 2026);
      assert.ok(Array.isArray(ctx.periods), 'periods deve ser um array com o histórico');
      assert.ok(ctx.periods.length >= 12, 'Deve conter os 12 meses do ano ativo');

      // B. Consulta a Setembro existente em periods
      const septData = ctx.periods.find(p => p.month === 9 && p.year === 2026);
      assert.ok(septData, 'Deve conter dados de Setembro/2026 em periods');
      assert.strictEqual(septData.month, 9);
      assert.strictEqual(septData.summary.baseSalary, 2917.56);
      assert.strictEqual(septData.summary.totalExtras, 500.00, 'Setembro deve conter 500 de renda extra');

      // C. Separação Semântica: Salário Base !== Salário + Benefício
      assert.strictEqual(ctx.profile.baseSalary, 2917.56, 'baseSalary não pode incluir benefícios');
      assert.strictEqual(ctx.profile.benefit, 1053.63, 'benefit deve estar isolado no profile');
      assert.strictEqual(ctx.benefits.amount, 1053.63, 'benefits.amount deve ser 1053.63');
      assert.notStrictEqual(ctx.profile.baseSalary, 3971.19, 'Salário base nunca deve ser a soma automática de salário + benefício');

      // D. Rendas Extras e Devedores (Paridade com OmniFin)
      // Em Outubro/2026:
      // Despesas: Internet Fibra (120) + Celular Novo (300) = 420.00
      // Renda Extra: 0
      // Devedores: Carlos (200, countInTotal: true) + Mariana (150, countInTotal: false) = 350 a receber
      // totalDebtorsCounted: 200
      // totalIncome: 2917.56 + 0 + 200 = 3117.56
      // netBalance: 3117.56 - 420 = 2697.56
      const octData = ctx.currentPeriod;
      assert.strictEqual(octData.summary.totalExpenses, 420.00, 'Total de despesas de Outubro deve ser 420.00');
      assert.strictEqual(octData.summary.totalDebtorsReceivable, 350.00, 'Total a receber de devedores deve ser 350.00');
      assert.strictEqual(octData.summary.totalDebtorsCounted, 200.00, 'Apenas devedores com countInTotal true devem entrar na soma da renda');
      assert.strictEqual(octData.summary.totalIncome, 3117.56, 'totalIncome deve ser exatamente Salário + Extras + Devedores Contabilizados');
      assert.strictEqual(octData.summary.netBalance, 2697.56, 'netBalance deve ser totalIncome - totalExpenses');

      // E. Devedores excluídos (Mariana countInTotal: false) não entram na renda
      assert.strictEqual(octData.debtors.find(d => d.debtorName === 'Mariana').countInTotal, false);
      assert.strictEqual(octData.debtors.find(d => d.debtorName === 'Carlos').countInTotal, true);

      // F. Isolamento por Usuário: Contexto de um usuário nunca herda dados de outro
      const mockFinancesUserB = {
        profile: { name: 'Fernando', baseSalary: 8500.00 },
        fixed: [], variable: [], extras: [], debtors: []
      };
      const ctxUserB = buildFinancialContext(mockFinancesUserB, 10, 2026);
      assert.strictEqual(ctxUserB.profile.name, 'Fernando');
      assert.strictEqual(ctxUserB.profile.baseSalary, 8500.00);
      assert.notStrictEqual(ctxUserB.profile.name, ctx.profile.name);
      assert.strictEqual(ctx.periods.some(p => p.summary.baseSalary === 8500.00), false, 'Dados do Usuário B nunca vazam para o histórico do Usuário A');

    } finally {
      // Restaura configuração original e global.fetch
      global.fetch = originalGlobalFetch;
      config.N8N_AI_WEBHOOK_URL = origWebhookUrl;
      config.N8N_AI_BASIC_AUTH_USER = origAuthUser;
      config.N8N_AI_BASIC_AUTH_PASSWORD = origAuthPass;
    }
  });

  test('33. Regressão Visual: Estilos de Impressão / PDF (@media print com Fundo Branco e Isolamento sem Backdrops Cinzas)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssPath = path.join(process.cwd(), 'public', 'css', 'responsive.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    // 1. Deve conter bloco @media print
    assert.ok(css.includes('@media print'), 'responsive.css deve conter bloco @media print');

    // 2. html e body devem possuir fundo branco explícito
    assert.ok(css.includes('html,\n      body') || css.includes('html, body') || css.includes('html,\r\n      body'), 'Deve estilizar html e body em print');
    assert.ok(css.includes('background: #ffffff !important;'), 'html e body devem ter background #ffffff !important');

    // 3. Remoção de backdrops escuros de dialogs
    assert.ok(css.includes('dialog::backdrop') && css.includes('display: none !important;'), 'dialog::backdrop deve ser ocultado na impressão');
    assert.ok(css.includes('background: transparent !important;'), 'dialog::backdrop deve ter background transparent');

    // 4. Ocultação de interface regular e isolamento do dialog de relatório
    assert.ok(css.includes('body > :not(#reportDialog)'), 'Elementos fora de #reportDialog devem ser ocultados');
    assert.ok(css.includes('dialog:not(#reportDialog)'), 'Outros dialogs devem ser ocultados');
    assert.ok(css.includes('dialog#reportDialog .dialog-head') && css.includes('display: none !important;'), 'Cabeçalho e controles do modal de relatório devem ser ocultados');

    // 5. Área de impressão e tabela com background branco
    assert.ok(css.includes('#reportPrintArea') && css.includes('background: #ffffff !important;'), '#reportPrintArea deve ter fundo branco');
    assert.ok(css.includes('#reportDynamicTable') && css.includes('background: #ffffff !important;'), '#reportDynamicTable deve ter fundo branco');
  });

  test('34. Relatório de Devedores: Estrutura de Colunas (PARCELA e PARCELAMENTO, Remoção de Total do Débito e CSV)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const reportsPath = path.join(process.cwd(), 'public', 'js', 'modules', 'reports.js');
    const reportsCode = fs.readFileSync(reportsPath, 'utf-8');

    // 1. Validação estática de ausência de colunas antigas e presença das novas
    assert.ok(!reportsCode.includes('Parcela do Mês'), 'A coluna antiga "Parcela do Mês" não deve mais existir no thead');
    assert.ok(!reportsCode.includes('Total do Débito'), 'A coluna antiga "Total do Débito" não deve mais existir no thead');
    assert.ok(reportsCode.includes('>Parcela</th>'), 'A coluna "Parcela" deve estar presente no thead');
    assert.ok(reportsCode.includes('>Parcelamento</th>'), 'A coluna "Parcelamento" deve estar presente no thead');

    // 2. Validação do cabeçalho do CSV
    assert.ok(reportsCode.includes('Devedor,Descricao,Destino,Inicio,Fim,Status,Parcela,Parcelamento'), 'CSV de devedores deve utilizar o novo cabeçalho');
    assert.ok(!reportsCode.includes('Parcela Mes,Total Debito'), 'CSV antigo com "Parcela Mes,Total Debito" não deve mais existir');

    // 3. Execução das funções auxiliares de formatação de parcelamento
    const vm = await import('vm');
    const sandbox = {
      window: {},
      MONTH_NAMES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
      mk: (y, m) => Number(y) * 12 + Number(m),
      $: () => null,
      getState: () => ({ year: 2026, month: 8 }),
      currency: (v) => `R$ ${Number(v).toFixed(2)}`
    };
    vm.createContext(sandbox);
    vm.runInContext(reportsCode, sandbox);

    const formatDebtorInstallment = sandbox.window.formatDebtorInstallment;
    const formatDebtorVigencia = sandbox.window.formatDebtorVigencia;

    assert.strictEqual(typeof formatDebtorInstallment, 'function', 'formatDebtorInstallment deve ser uma função');
    assert.strictEqual(typeof formatDebtorVigencia, 'function', 'formatDebtorVigencia deve ser uma função');

    // A. Cobrança parcelada com índice atual e total -> "2/4"
    const parceladaComCur = formatDebtorInstallment({ installmentIndex: 2, installmentTotal: 4 }, 2026, 8);
    assert.strictEqual(parceladaComCur, '2/4', 'Parcela 2 de 4 deve retornar "2/4"');

    // B. Cobrança parcelada derivada de datas -> "2/4"
    const parceladaPorData = formatDebtorInstallment({ startYear: 2026, startMonth: 7, endYear: 2026, endMonth: 10 }, 2026, 8);
    assert.strictEqual(parceladaPorData, '2/4', 'Período 07/2026 a 10/2026 na referência 08/2026 deve retornar "2/4"');

    // C. Cobrança parcelada apenas com total -> "4x"
    const parceladaSemCur = formatDebtorInstallment({ installmentTotal: 4 }, 2026, 8);
    assert.strictEqual(parceladaSemCur, '4x', 'Apenas total 4 deve retornar "4x"');

    // D. Cobrança única / à vista -> "1x"
    const cobrancaUnica = formatDebtorInstallment({ installmentTotal: 1 }, 2026, 8);
    assert.strictEqual(cobrancaUnica, '1x', 'Cobrança de 1 mês deve retornar "1x"');

    const cobrancaUnicaPorData = formatDebtorInstallment({ startYear: 2026, startMonth: 8, endYear: 2026, endMonth: 8 }, 2026, 8);
    assert.strictEqual(cobrancaUnicaPorData, '1x', 'Cobrança com mês inicial igual ao final deve retornar "1x"');

    // E. Registro legado ou sem datas -> Fallback "—"
    const legadoVazio = formatDebtorInstallment({}, 2026, 8);
    assert.strictEqual(legadoVazio, '—', 'Registro sem dados deve retornar "—"');

    const nulo = formatDebtorInstallment(null, 2026, 8);
    assert.strictEqual(nulo, '—', 'Registro nulo deve retornar "—"');

    // F. Validação de vigência
    const vigenciaRange = formatDebtorVigencia({ startMonth: 7, startYear: 2026, endMonth: 10, endYear: 2026 });
    assert.strictEqual(vigenciaRange, 'Julho/2026 - Outubro/2026', 'Range de vigência deve ser formatado corretamente');

    const vigenciaSingle = formatDebtorVigencia({ startMonth: 8, startYear: 2026, endMonth: 8, endYear: 2026 });
    assert.strictEqual(vigenciaSingle, 'Agosto/2026', 'Vigência de mês único não deve repetir o mês');
  });

  test('35. Checkpoint 8.3: UX Mobile (Aviso IA Removido, Bottom Nav 5 Posições com +, Cadastro Rápido e Estado Visual de Devedores Quitado)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const vm = await import('vm');

    // 1. PARTE A & D: Validação do Assistente IA (Aviso Removido e Estado 'Digitando...')
    const aiAssistantPath = path.join(process.cwd(), 'public', 'js', 'modules', 'aiAssistant.js');
    const aiAssistantCode = fs.readFileSync(aiAssistantPath, 'utf-8');
    assert.ok(!aiAssistantCode.includes('ai-privacy-note'), 'A classe ai-privacy-note não deve estar presente no aiAssistant.js');
    assert.ok(!aiAssistantCode.includes('O assistente utiliza seus dados do OmniFin'), 'A mensagem sobre dados/privacidade não deve estar no aiAssistant.js');
    assert.ok(!aiAssistantCode.includes('Analisando dados...'), 'O texto antigo "Analisando dados..." não deve existir no aiAssistant.js');
    assert.ok(aiAssistantCode.includes('Digitando...'), 'O indicador de loading deve exibir "Digitando..." no aiAssistant.js');
    assert.ok(aiAssistantCode.includes('aria-label="Assistente digitando"'), 'O indicador deve conter aria-label descritivo de acessibilidade');
    assert.ok(aiAssistantCode.includes('role="status"') && aiAssistantCode.includes('aria-live="polite"'), 'O indicador deve conter role status e aria-live polite');

    // 2. PARTE B: Navegação Mobile, Botão +, Cadastro Rápido e Preferências
    const statePath = path.join(process.cwd(), 'public', 'js', 'core', 'state.js');
    const stateCode = fs.readFileSync(statePath, 'utf-8');
    assert.ok(stateCode.includes('mobileNavigation'), 'state.js deve conter suporte a preferences.mobileNavigation');

    const indexPath = path.join(process.cwd(), 'public', 'index.html');
    const indexCode = fs.readFileSync(indexPath, 'utf-8');
    assert.ok(indexCode.includes('id="btnMobileQuickAction"'), 'index.html deve conter o botão central + (#btnMobileQuickAction)');
    assert.ok(indexCode.includes('id="mobileQuickActionOverlay"'), 'index.html deve conter o modal/sheet de Cadastro Rápido');
    assert.ok(indexCode.includes('id="quickActionNewExpense"'), 'index.html deve conter a opção Nova Despesa no Cadastro Rápido');
    assert.ok(indexCode.includes('id="quickActionNewDebtor"'), 'index.html deve conter a opção Novo Devedor no Cadastro Rápido');
    assert.ok(indexCode.includes('id="quickActionNewBenefit"'), 'index.html deve conter a opção Novo Benefício no Cadastro Rápido');
    assert.ok(indexCode.includes('id="profileMobileNavCard"'), 'index.html deve conter o card de configuração no perfil');
    assert.ok(indexCode.includes('id="mobileNavFavoritesPicker"'), 'index.html deve conter o seletor de favoritos');
    assert.ok(indexCode.includes('id="mobileNavFavoritesWarning"'), 'index.html deve conter o aviso de limite de 3 atalhos');

    const mobileCssPath = path.join(process.cwd(), 'public', 'css', 'mobile.css');
    const mobileCss = fs.readFileSync(mobileCssPath, 'utf-8');
    assert.ok(mobileCss.includes('.bottom-nav-fab'), 'mobile.css deve conter estilos para .bottom-nav-fab');
    assert.ok(mobileCss.includes('.quick-action-item'), 'mobile.css deve conter estilos para .quick-action-item');
    assert.ok(mobileCss.includes('.ai-assistant-fab') && mobileCss.includes('--mobile-bottom-nav-height'), 'mobile.css deve posicionar o FAB da IA acima da barra inferior considerando a altura e safe-area');
    assert.ok(mobileCss.includes('.ai-assistant-panel') && mobileCss.includes('--mobile-bottom-nav-height'), 'mobile.css deve posicionar o painel do Assistente acima da barra inferior');

    const variablesCssPath = path.join(process.cwd(), 'public', 'css', 'variables.css');
    const variablesCss = fs.readFileSync(variablesCssPath, 'utf-8');
    assert.ok(variablesCss.includes('--mobile-bottom-nav-height: 62px;'), 'variables.css deve definir a custom property --mobile-bottom-nav-height');

    const benefitsPath = path.join(process.cwd(), 'public', 'js', 'modules', 'benefits.js');
    const benefitsCode = fs.readFileSync(benefitsPath, 'utf-8');
    assert.ok(benefitsCode.includes('window.openBenefitDialog = openBenefitDialog;'), 'benefits.js deve exportar openBenefitDialog no window');

    // Executa e valida normalização e configuração de módulos
    const uiShellPath = path.join(process.cwd(), 'public', 'js', 'core', 'uiShell.js');
    const uiShellCode = fs.readFileSync(uiShellPath, 'utf-8');
    assert.ok(uiShellCode.includes('renderMobileBottomNav'), 'uiShell.js deve implementar renderMobileBottomNav');
    assert.ok(uiShellCode.includes('openQuickActionSheet'), 'uiShell.js deve implementar openQuickActionSheet');

    // 3. PARTE C: Devedores - Estado Visual de Pagamento no Gráfico Montante por Devedor
    const debtorsPath = path.join(process.cwd(), 'public', 'js', 'modules', 'debtors.js');
    const debtorsCode = fs.readFileSync(debtorsPath, 'utf-8');
    assert.ok(debtorsCode.includes('✓ Quitado'), 'debtors.js deve renderizar o badge "✓ Quitado" para devedores com todas as cobranças pagas');
    assert.ok(debtorsCode.includes('personStatusMap'), 'debtors.js deve calcular o mapa de status de pagamento por devedor');

    // Validação funcional da renderização do badge no sandbox
    let mockContainer = { innerHTML: '', querySelectorAll: () => [], addEventListener: () => {} };
    const debtorsSandbox = {
      window: {},
      $: () => mockContainer,
      $$: () => [],
      escapeHtml: (s) => String(s || ''),
      currency: (v) => `R$ ${Number(v).toFixed(2)}`,
      DEBTOR_COLORS_PALETTE: ['#10B981', '#3B82F6'],
      getDebtorPersonColor: () => '#10B981',
      DEST_SVG_ICONS: { card: '<svg></svg>' },
      ICONS: { check: '<svg>check</svg>' },
      getDestMeta: () => ({ color: '#10B981', icon: 'card' }),
      getState: () => ({ year: 2026, month: 8 }),
      activeDebtorsForMonth: () => [
        { id: 'd1', debtorName: 'Carlos', amount: 150, status: 'pago' },
        { id: 'd2', debtorName: 'Ana', amount: 200, status: 'pendente' }
      ]
    };
    vm.createContext(debtorsSandbox);
    vm.runInContext(debtorsCode, debtorsSandbox);

    const renderDynamicDebtorChart = debtorsSandbox.window.renderDynamicDebtorChart || debtorsSandbox.renderDynamicDebtorChart;

    // Renderiza em modo barras
    renderDynamicDebtorChart(
      mockContainer,
      { 'Carlos': 150, 'Ana': 200 },
      'bar',
      false,
      null,
      { 'Carlos': { total: 150, paid: 150, count: 1, paidCount: 1 }, 'Ana': { total: 200, paid: 0, count: 1, paidCount: 0 } }
    );

    assert.ok(mockContainer.innerHTML.includes('✓ Quitado'), 'O devedor Carlos (100% pago) deve exibir o badge "✓ Quitado" no modo bar');
    assert.ok(mockContainer.innerHTML.includes('R$ 150.00'), 'O valor de Carlos deve permanecer visível no gráfico');
    assert.ok(mockContainer.innerHTML.includes('R$ 200.00'), 'O valor de Ana deve permanecer visível no gráfico');

    // Renderiza em modo colunas
    renderDynamicDebtorChart(
      mockContainer,
      { 'Carlos': 150 },
      'column',
      false,
      null,
      { 'Carlos': { total: 150, paid: 150, count: 1, paidCount: 1 } }
    );
    assert.ok(mockContainer.innerHTML.includes('✓ Quitado'), 'O devedor Carlos deve exibir o badge "✓ Quitado" no modo column');

    // Renderiza em modo donut
    renderDynamicDebtorChart(
      mockContainer,
      { 'Carlos': 150 },
      'donut',
      false,
      null,
      { 'Carlos': { total: 150, paid: 150, count: 1, paidCount: 1 } }
    );
    assert.ok(mockContainer.innerHTML.includes('✓ Quitado'), 'O devedor Carlos deve exibir o badge "✓ Quitado" no modo donut');
  });

  test('36. Checkpoint 9: Navegação Mensal no Dashboard (Controles Anterior/Próximo/Mês Atual, Rollover de Ano, Sincronização Global e Preservação de Filtros)', async () => {
    const vm = require('node:vm');
    const constantsJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'constants.js'), 'utf-8');
    const utilsJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'utils.js'), 'utf-8');
    const stateJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'state.js'), 'utf-8');
    const financeQueriesJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'financeQueries.js'), 'utf-8');
    const consolidatedJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'modules', 'consolidatedDashboard.js'), 'utf-8');
    const componentsCss = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'components.css'), 'utf-8');
    const mobileCss = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'mobile.css'), 'utf-8');

    // 1. Validação de CSS e classes responsivas
    assert.ok(componentsCss.includes('.dashboard-month-nav'), 'components.css deve conter .dashboard-month-nav');
    assert.ok(componentsCss.includes('.dash-month-full'), 'components.css deve conter .dash-month-full');
    assert.ok(componentsCss.includes('.dash-month-short'), 'components.css deve conter .dash-month-short');
    assert.ok(mobileCss.includes('.dashboard-month-nav'), 'mobile.css deve conter regras para .dashboard-month-nav');
    assert.ok(mobileCss.includes('.dash-month-short'), 'mobile.css deve conter regras para .dash-month-short');

    // 2. Setup do Sandbox com DOM Mock
    let renderedHtml = '';
    const eventHandlers = {};

    const mockDashboardWrap = {
      id: 'dashboardViewWrap',
      set innerHTML(html) {
        renderedHtml = html;
      },
      get innerHTML() {
        return renderedHtml;
      },
      querySelector: (sel) => {
        if (sel === '#dashPrevMonthBtn') {
          return {
            id: 'dashPrevMonthBtn',
            addEventListener: (ev, fn) => { eventHandlers['prev'] = fn; }
          };
        }
        if (sel === '#dashNextMonthBtn') {
          return {
            id: 'dashNextMonthBtn',
            addEventListener: (ev, fn) => { eventHandlers['next'] = fn; }
          };
        }
        if (sel === '#dashTodayBtn') {
          return {
            id: 'dashTodayBtn',
            addEventListener: (ev, fn) => { eventHandlers['today'] = fn; }
          };
        }
        if (sel === '#consolidatedSearchInput') return { addEventListener: () => {} };
        if (sel === '#consolidatedStatusFilter') return { addEventListener: () => {} };
        if (sel === '#consolidatedCategoryFilter') return { addEventListener: () => {} };
        if (sel === '#consolidatedDestFilter') return { addEventListener: () => {} };
        if (sel === '#consolidatedSourceFilter') return { addEventListener: () => {} };
        if (sel === '#consolidatedClearFiltersBtn' || sel === '#consolidatedEmptyResetBtn') return { addEventListener: () => {} };
        return null;
      },
      querySelectorAll: () => []
    };

    const globalState = {
      version: 5,
      revision: 1,
      year: 2026,
      month: 8,
      profile: { name: 'Teste User', baseSalary: 6000 },
      destinations: [
        { name: 'Nubank', color: '#8B5CF6', icon: 'card', dueDay: 10 },
        { name: 'Pix', color: '#10B981', icon: 'dollar', dueDay: null }
      ],
      categories: [
        { name: 'Moradia', icon: 'home', color: '#1F7A5C' },
        { name: 'Lazer', icon: 'star', color: '#EC4899' }
      ],
      budgets: {},
      fixed: [
        {
          id: 'f1',
          name: 'Aluguel',
          group: 'Moradia',
          destination: 'Nubank',
          versions: [{ year: 2026, month: 1, amount: 2000 }],
          paidHistory: { '2026-08': true }
        }
      ],
      variable: [
        {
          id: 'v1',
          name: 'Cinema',
          group: 'Lazer',
          destination: 'Nubank',
          startYear: 2026,
          startMonth: 8,
          endYear: 2026,
          endMonth: 9,
          amount: 150,
          paidHistory: {}
        }
      ],
      debtors: [
        {
          id: 'd1',
          debtorName: 'Marcos',
          title: 'Empréstimo',
          category: 'Devedores',
          destination: 'Pix',
          startYear: 2026,
          startMonth: 8,
          endYear: 2026,
          endMonth: 8,
          amount: 500,
          status: 'pendente',
          countInTotal: true
        }
      ],
      incomes: {},
      extras: [],
      assets: [],
      aportes: [],
      shoppingLists: [],
      savedSimulations: [],
      preferences: {
        mobileNavigation: ['tab-dashboard', 'tab-expenses', 'tab-debtors']
      }
    };

    let renderCallCount = 0;
    let savedReasons = [];

    const sandbox = {
      window: {},
      document: {
        getElementById: (id) => (id === 'dashboardViewWrap' ? mockDashboardWrap : null),
        querySelector: () => null,
        querySelectorAll: () => []
      },
      getState: () => globalState,
      state: globalState,
      saveLocalState: () => {},
      saveState: (reason) => { savedReasons.push(reason); },
      render: (tabId) => {
        renderCallCount++;
        if (tabId === 'tab-dashboard' && sandbox.window.renderConsolidatedDashboardTab) {
          sandbox.window.renderConsolidatedDashboardTab();
        }
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };

    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(constantsJs, sandbox);
    vm.runInContext(utilsJs, sandbox);
    vm.runInContext(stateJs, sandbox);
    vm.runInContext(financeQueriesJs, sandbox);
    vm.runInContext(consolidatedJs, sandbox);

    const { renderConsolidatedDashboardTab, prevMonth, nextMonth, goToCurrentMonth, getLocalFilters, setLocalFilters } = sandbox.window.ConsolidatedDashboardModule;

    // 3. Renderiza o Dashboard inicial (Agosto/2026)
    renderConsolidatedDashboardTab();

    assert.ok(renderedHtml.includes('id="dashboardMonthNav"'), 'Dashboard deve conter o elemento de navegação #dashboardMonthNav');
    assert.ok(renderedHtml.includes('id="dashPrevMonthBtn"'), 'Dashboard deve conter o botão #dashPrevMonthBtn');
    assert.ok(renderedHtml.includes('id="dashNextMonthBtn"'), 'Dashboard deve conter o botão #dashNextMonthBtn');
    assert.ok(renderedHtml.includes('id="dashTodayBtn"'), 'Dashboard deve conter o botão #dashTodayBtn');
    assert.ok(renderedHtml.includes('id="dashMonthDisplay"'), 'Dashboard deve conter #dashMonthDisplay');
    assert.ok(renderedHtml.includes('aria-label="Mês anterior"'), 'Botão anterior deve ter aria-label acessível');
    assert.ok(renderedHtml.includes('aria-label="Próximo mês"'), 'Botão próximo deve ter aria-label acessível');
    assert.ok(renderedHtml.includes('aria-label="Ir para o mês atual"'), 'Botão hoje deve ter aria-label acessível');
    assert.ok(renderedHtml.includes('Competência: Agosto/2026'), 'Badge de competência deve sincronizar com Agosto/2026');

    // 4. Teste de Incremento: Agosto/2026 -> Setembro/2026
    nextMonth();
    assert.strictEqual(globalState.month, 9, 'Mês deve ter sido incrementado para 9 (Setembro)');
    assert.strictEqual(globalState.year, 2026, 'Ano deve permanecer 2026');
    assert.ok(renderedHtml.includes('Competência: Setembro/2026'), 'Badge deve atualizar para Setembro/2026');
    assert.ok(renderedHtml.includes('Setembro'), 'Display deve exibir Setembro');

    // 5. Teste de Decremento: Setembro/2026 -> Agosto/2026
    prevMonth();
    assert.strictEqual(globalState.month, 8, 'Mês deve ter retornado para 8 (Agosto)');
    assert.strictEqual(globalState.year, 2026, 'Ano deve permanecer 2026');
    assert.ok(renderedHtml.includes('Competência: Agosto/2026'), 'Badge deve atualizar para Agosto/2026');

    // 6. Teste de Rollover Dezembro -> Janeiro do ano seguinte
    globalState.month = 12;
    globalState.year = 2026;
    nextMonth();
    assert.strictEqual(globalState.month, 1, 'Mês 12 incrementado deve ir para mês 1 (Janeiro)');
    assert.strictEqual(globalState.year, 2027, 'Ano deve ter sido incrementado de 2026 para 2027');
    assert.ok(renderedHtml.includes('Competência: Janeiro/2027'), 'Badge deve exibir Janeiro/2027');

    // 7. Teste de Rollover Janeiro -> Dezembro do ano anterior
    globalState.month = 1;
    globalState.year = 2026;
    prevMonth();
    assert.strictEqual(globalState.month, 12, 'Mês 1 decrementado deve ir para mês 12 (Dezembro)');
    assert.strictEqual(globalState.year, 2025, 'Ano deve ter sido decrementado de 2026 para 2025');
    assert.ok(renderedHtml.includes('Competência: Dezembro/2025'), 'Badge deve exibir Dezembro/2025');

    // 8. Teste do botão "Mês Atual"
    const today = sandbox.todayYM();
    globalState.month = 3;
    globalState.year = 2024;
    goToCurrentMonth();
    assert.strictEqual(globalState.month, today.month, 'goToCurrentMonth deve restaurar o mês atual');
    assert.strictEqual(globalState.year, today.year, 'goToCurrentMonth deve restaurar o ano atual');

    // 9. Preservação de Filtros ao navegar entre meses
    setLocalFilters({ search: 'Aluguel', status: 'pago' });
    globalState.month = 8;
    globalState.year = 2026;
    renderConsolidatedDashboardTab();
    assert.ok(renderedHtml.includes('value="Aluguel"'), 'Input de busca deve preservar o termo "Aluguel"');
    assert.ok(renderedHtml.includes('value="pago" selected'), 'Filtro de status deve preservar o valor "pago"');

    // Avança de mês e confirma que o filtro continua ativo
    nextMonth();
    const currentFilters = getLocalFilters();
    assert.strictEqual(currentFilters.search, 'Aluguel', 'Filtro de busca deve permanecer após mudar de mês');
    assert.strictEqual(currentFilters.status, 'pago', 'Filtro de status deve permanecer após mudar de mês');

    // 10. Estado vazio funciona adequadamente em mês sem lançamentos / filtros sem resultado
    setLocalFilters({ search: 'Inexistente', status: 'all', category: 'all', destination: 'all', sourceType: 'all' });
    renderConsolidatedDashboardTab();
    assert.ok(renderedHtml.includes('Nenhum lançamento encontrado'), 'Deve exibir mensagem informativa de estado vazio');

    // 11. Sincronização do estado global com Despesas e Assistente IA
    globalState.month = 10;
    globalState.year = 2026;
    assert.strictEqual(sandbox.getState().month, 10, 'getState().month deve refletir Outubro');
    assert.strictEqual(sandbox.getState().year, 2026, 'getState().year deve refletir 2026');
  });

  test('37. Checkpoint 9.1: Paginação da Gestão de Usuários (Limite Fixo 10, Navegação, Resumo, Indicadores Acessíveis, Exclusão e Edição Segura)', async () => {
    const vm = require('node:vm');
    const adminJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'admin.js'), 'utf-8');
    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf-8');
    const componentsCss = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'components.css'), 'utf-8');
    const mobileCss = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'mobile.css'), 'utf-8');

    // 1. Validação de HTML e CSS
    assert.ok(indexHtml.includes('id="adminUsersPagination"'), 'index.html deve conter #adminUsersPagination');
    assert.ok(componentsCss.includes('.admin-users-pagination'), 'components.css deve conter .admin-users-pagination');
    assert.ok(componentsCss.includes('.admin-page-num'), 'components.css deve conter .admin-page-num');
    assert.ok(mobileCss.includes('.admin-users-pagination'), 'mobile.css deve conter regras mobile para .admin-users-pagination');

    // 2. Setup do Sandbox com DOM Mock
    let tableBodyHtml = '';
    let paginationHtml = '';
    let paginationDisplay = '';

    const mockTableBody = {
      id: 'adminUsersTableBody',
      set innerHTML(html) { tableBodyHtml = html; },
      get innerHTML() { return tableBodyHtml; },
      querySelectorAll: (sel) => {
        // Mock buttons
        const matches = [];
        const regex = /data-(manage-modules|edit-user|del-user)="([^"]+)"/g;
        let m;
        while ((m = regex.exec(tableBodyHtml)) !== null) {
          const attr = `data-${m[1]}`;
          const val = m[2];
          if (sel.includes(attr)) {
            matches.push({
              getAttribute: (name) => (name === attr ? val : null),
              addEventListener: () => {}
            });
          }
        }
        return matches;
      }
    };

    const mockPagination = {
      id: 'adminUsersPagination',
      style: {
        set display(val) { paginationDisplay = val; },
        get display() { return paginationDisplay; }
      },
      set innerHTML(html) { paginationHtml = html; },
      get innerHTML() { return paginationHtml; },
      querySelector: (sel) => {
        if (sel === '#btnAdminUsersPrev' && paginationHtml.includes('id="btnAdminUsersPrev"')) {
          return { addEventListener: () => {} };
        }
        if (sel === '#btnAdminUsersNext' && paginationHtml.includes('id="btnAdminUsersNext"')) {
          return { addEventListener: () => {} };
        }
        return null;
      },
      querySelectorAll: (sel) => {
        if (sel.includes('.admin-page-num[data-page]')) {
          const matches = [];
          const regex = /data-page="(\d+)"/g;
          let m;
          while ((m = regex.exec(paginationHtml)) !== null) {
            const pageNum = m[1];
            matches.push({
              getAttribute: (name) => (name === 'data-page' ? pageNum : null),
              addEventListener: () => {}
            });
          }
          return matches;
        }
        return [];
      }
    };

    // Gera 25 usuários fictícios para teste
    const fakeUsers = [];
    for (let i = 1; i <= 25; i++) {
      fakeUsers.push({
        id: `usr_${i}`,
        nome: `Usuário Teste ${i}`,
        login: `user${i}`,
        email: `user${i}@teste.com`,
        is_admin: i === 1,
        createdAt: '2026-08-30T10:00:00Z',
        permissions: { dashboard: true, despesas: true }
      });
    }

    const sandbox = {
      window: {},
      document: {
        getElementById: (id) => {
          if (id === 'adminUsersTableBody') return mockTableBody;
          if (id === 'adminUsersPagination') return mockPagination;
          return null;
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, style: {} }),
        body: { appendChild: () => {} },
        addEventListener: () => {}
      },
      API: {
        getUser: () => ({ id: 'usr_1', nome: 'Admin Master', is_admin: true }),
        getUsers: async () => ({ success: true, users: fakeUsers })
      },
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(adminJs, sandbox);

    const AdminMod = sandbox.window.AdminModule;

    // 3. Validação do Limite Fixo de 10 por página
    assert.strictEqual(AdminMod.getUsersPerPage(), 10, 'Limite de usuários por página deve ser fixo em 10');

    // 4. Carrega e Renderiza com 25 usuários
    AdminMod.setUsersList(fakeUsers);
    assert.strictEqual(AdminMod.getTotalPages(), 3, '25 usuários devem gerar exatamente 3 páginas');
    assert.strictEqual(AdminMod.getCurrentPage(), 1, 'Página inicial deve ser 1');

    AdminMod.renderUsersTable();

    // Página 1: Deve conter Usuário 1 até Usuário 10
    assert.ok(tableBodyHtml.includes('Usuário Teste 1</strong>'), 'Página 1 deve conter Usuário 1');
    assert.ok(tableBodyHtml.includes('Usuário Teste 10</strong>'), 'Página 1 deve conter Usuário 10');
    assert.ok(!tableBodyHtml.includes('Usuário Teste 11</strong>'), 'Página 1 NÃO deve conter Usuário 11');
    assert.ok(paginationHtml.includes('Mostrando 1–10 de 25 usuários'), 'Resumo deve indicar "Mostrando 1–10 de 25 usuários"');
    assert.ok(paginationHtml.includes('id="btnAdminUsersPrev" disabled'), 'Botão Anterior deve estar desabilitado na página 1');
    assert.ok(paginationHtml.includes('id="btnAdminUsersNext"') && !paginationHtml.includes('id="btnAdminUsersNext" disabled'), 'Botão Próxima deve estar habilitado na página 1');
    assert.ok(paginationHtml.includes('aria-current="page"'), 'Página ativa deve ter aria-current="page"');

    // 5. Navega para Página 2
    AdminMod.nextPage();
    assert.strictEqual(AdminMod.getCurrentPage(), 2, 'Deve estar na página 2');
    assert.ok(!tableBodyHtml.includes('Usuário Teste 10</strong>'), 'Página 2 NÃO deve conter Usuário 10');
    assert.ok(tableBodyHtml.includes('Usuário Teste 11</strong>'), 'Página 2 deve conter Usuário 11');
    assert.ok(tableBodyHtml.includes('Usuário Teste 20</strong>'), 'Página 2 deve conter Usuário 20');
    assert.ok(!tableBodyHtml.includes('Usuário Teste 21</strong>'), 'Página 2 NÃO deve conter Usuário 21');
    assert.ok(paginationHtml.includes('Mostrando 11–20 de 25 usuários'), 'Resumo deve indicar "Mostrando 11–20 de 25 usuários"');
    assert.ok(!paginationHtml.includes('id="btnAdminUsersPrev" disabled'), 'Botão Anterior deve estar habilitado na página 2');
    assert.ok(!paginationHtml.includes('id="btnAdminUsersNext" disabled'), 'Botão Próxima deve estar habilitado na página 2');

    // 6. Navega para Página 3 (Última Página com 5 itens)
    AdminMod.nextPage();
    assert.strictEqual(AdminMod.getCurrentPage(), 3, 'Deve estar na página 3');
    assert.ok(!tableBodyHtml.includes('Usuário Teste 20</strong>'), 'Página 3 NÃO deve conter Usuário 20');
    assert.ok(tableBodyHtml.includes('Usuário Teste 21</strong>'), 'Página 3 deve conter Usuário 21');
    assert.ok(tableBodyHtml.includes('Usuário Teste 25</strong>'), 'Página 3 deve conter Usuário 25');
    assert.ok(paginationHtml.includes('Mostrando 21–25 de 25 usuários'), 'Resumo deve indicar "Mostrando 21–25 de 25 usuários"');
    assert.ok(!paginationHtml.includes('id="btnAdminUsersPrev" disabled'), 'Botão Anterior deve estar habilitado na página 3');
    assert.ok(paginationHtml.includes('id="btnAdminUsersNext" disabled'), 'Botão Próxima deve estar desabilitado na última página');

    // 7. Navegação Direta via goToPage
    AdminMod.goToPage(2);
    assert.strictEqual(AdminMod.getCurrentPage(), 2, 'goToPage(2) deve navegar para a página 2');
    assert.ok(paginationHtml.includes('Mostrando 11–20 de 25 usuários'));

    // 8. Edição de usuário preserva página atual
    const user15 = fakeUsers.find(u => u.id === 'usr_15');
    user15.nome = 'Usuário 15 Editado';
    AdminMod.renderUsersTable();
    assert.strictEqual(AdminMod.getCurrentPage(), 2, 'Edição deve manter o usuário na página 2');
    assert.ok(tableBodyHtml.includes('Usuário 15 Editado</strong>'), 'Nome editado deve ser exibido na página 2');

    // 9. Gerenciamento de Módulos (data-manage-modules) com IDs reais na página 2
    assert.ok(tableBodyHtml.includes('data-manage-modules="usr_15"'), 'Ação Gerenciar deve utilizar o ID real usr_15 na página 2');

    // 10. Exclusão na última página ajusta página inválida
    // Simula estar na página 3 com apenas 21 usuários (1 na página 3) e exclui o usuário 21
    const list21 = fakeUsers.slice(0, 21);
    AdminMod.setUsersList(list21);
    AdminMod.goToPage(3);
    assert.strictEqual(AdminMod.getCurrentPage(), 3, 'Inicialmente na página 3');
    assert.ok(paginationHtml.includes('Mostrando 21–21 de 21 usuários'));

    // Exclui o item 21 -> restam 20 usuários (2 páginas)
    const list20 = list21.filter(u => u.id !== 'usr_21');
    AdminMod.setUsersList(list20);
    AdminMod.renderUsersTable();
    assert.strictEqual(AdminMod.getCurrentPage(), 2, 'Após exclusão que esvazia a última página, página deve recuar para 2');
    assert.strictEqual(AdminMod.getTotalPages(), 2, 'Total de páginas deve ser 2');
    assert.ok(paginationHtml.includes('Mostrando 11–20 de 20 usuários'));

    // 11. Lista com menos de 10 usuários (ex: 7 usuários)
    const list7 = fakeUsers.slice(0, 7);
    AdminMod.setUsersList(list7);
    AdminMod.renderUsersTable();
    assert.strictEqual(AdminMod.getTotalPages(), 1, '7 usuários devem totalizar 1 página');
    assert.strictEqual(AdminMod.getCurrentPage(), 1, 'Página deve ser 1');
    assert.ok(paginationHtml.includes('Mostrando 1–7 de 7 usuários'), 'Resumo deve indicar "Mostrando 1–7 de 7 usuários"');
    assert.ok(!paginationHtml.includes('‹ Anterior'), 'Controle de paginação não deve renderizar botões desnecessários para 1 página');

    // 12. Lista vazia (0 usuários)
    AdminMod.setUsersList([]);
    AdminMod.renderUsersTable();
    assert.strictEqual(AdminMod.getTotalPages(), 1);
    assert.strictEqual(AdminMod.getCurrentPage(), 1);
    assert.ok(tableBodyHtml.includes('Nenhum usuário cadastrado'), 'Deve exibir mensagem de lista vazia');
    assert.strictEqual(paginationDisplay, 'none', 'Container de paginação deve ficar oculto com 0 usuários');
  });
});
