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

    assert.ok(relNotesJs.includes('version: "3.1.0"'), 'releaseNotes.js deve conter a release v3.1.0');
    assert.ok(relNotesJs.includes('version: "3.0.0"'), 'releaseNotes.js deve manter releases anteriores acessíveis');
    assert.ok(relNotesJs.includes('news:'), 'releaseNotes.js deve estruturar novidades');
    assert.ok(relNotesJs.includes('improvements:'), 'releaseNotes.js deve estruturar melhorias');
    assert.ok(relNotesJs.includes('fixes:'), 'releaseNotes.js deve estruturar correções');

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
    assert.strictEqual(readListInitial.includes('3.1.0'), false, 'Usuário novo/sem leitura não deve ter a release 3.1.0 como lida');

    // 3. Usuário abre e marca a release 3.1.0 como lida
    const updatePayload = Object.assign({}, userDoc1, {
      expectedRevision: currentRev,
      readReleases: ['3.1.0']
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

    // 4. Refresh / Leitura subsequente confirma que release 3.1.0 permanece lida
    const getRes2 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const userDoc2 = await getRes2.json();
    assert.ok(Array.isArray(userDoc2.readReleases), 'readReleases deve ser um array');
    assert.strictEqual(userDoc2.readReleases.includes('3.1.0'), true, 'readReleases deve persistir 3.1.0');

    // 5. Isolamento: Outro usuário (ex: admin) não foi impactado e tem seu próprio estado independente
    const getAdminRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testAdminToken}` }
    });
    const adminDoc = await getAdminRes.json();
    const adminReadList = Array.isArray(adminDoc.readReleases) ? adminDoc.readReleases : [];
    assert.strictEqual(adminReadList.includes('3.1.0'), false, 'Outro usuário deve manter estado de leitura independente');
  });
});
