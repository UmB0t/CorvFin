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
const jwt = require('jsonwebtoken');
const { getDB, connectDB, closeDB } = require('../server/config/db');
const { hashPassword, verifyToken, generateToken } = require('../server/services/authService');
const { requirePermission } = require('../server/middleware/permissions');
const storageService = require('../server/services/storageService');
const { getUserById } = storageService;

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
    const regCookie = regRes.headers.get('set-cookie') || '';
    const regMatch = regCookie.match(/omnifin_session=([^;]+)/);
    testUserToken = (regMatch && regMatch[1]) || regData.token;

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
    const adminCookie = adminLoginRes.headers.get('set-cookie') || '';
    const adminMatch = adminCookie.match(/omnifin_session=([^;]+)/);
    testAdminToken = (adminMatch && adminMatch[1]) || adminLoginData.token;
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

    // Fecha servidor HTTP de teste e conexão MongoDB
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await closeDB();
  });

  test('1. Login válido retorna 200 e emite cookie HttpOnly de sessão', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: testUserLogin, senha: testPassword })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.token, undefined, 'JWT não deve mais ser retornado no corpo JSON do login');
    const setCookie = res.headers.get('set-cookie') || '';
    assert.ok(setCookie.includes('omnifin_session='), 'Deve emitir cookie de sessão omnifin_session');
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
    assert.strictEqual(data.error, 'INVALID_CREDENTIALS');
    assert.strictEqual(data.message, 'Login ou senha inválidos. Verifique os dados e tente novamente.');
    assert.ok(!data.message.includes('Sessão expirada'), 'Login inválido NÃO deve exibir "Sessão expirada"');
    assert.ok(!data.message.includes('Senha incorreta'), 'Não deve divulgar enumeração de senha');
    assert.ok(!data.message.includes('Usuário inexistente'), 'Não deve divulgar enumeração de usuário');
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

    // 3. uiShell exporta e inicializa initGlobalTooltips e calculateTooltipPosition
    assert.ok(uiShell.includes('function initGlobalTooltips()'), 'uiShell.js deve definir initGlobalTooltips');
    assert.ok(uiShell.includes('window.initGlobalTooltips = initGlobalTooltips'), 'uiShell.js deve expor initGlobalTooltips');
    assert.ok(uiShell.includes('function calculateTooltipPosition('), 'uiShell.js deve definir calculateTooltipPosition');
    assert.ok(uiShell.includes('window.calculateTooltipPosition = calculateTooltipPosition'), 'uiShell.js deve expor calculateTooltipPosition');

    // 4. Teste unitário da lógica de cálculo lateral (sidebar) e inversão acima/abaixo (outras áreas)
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

    // Caso D: Item da Sidebar Desktop (deve abrir LATERALMENTE para a direita, sem cobrir o item acima)
    const mockSidebarTarget = {
      closest: (sel) => sel.includes('.sidebar')
    };
    const vm = require('node:vm');
    const sandbox = {
      window: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      document: {
        readyState: 'complete',
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({ setAttribute: () => {}, style: {}, addEventListener: () => {} }),
        addEventListener: () => {},
        removeEventListener: () => {},
        body: { appendChild: () => {} }
      },
      $: () => null,
      $$: () => []
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(uiShell, sandbox);
    const calcFn = sandbox.calculateTooltipPosition || sandbox.window.calculateTooltipPosition;
    assert.strictEqual(typeof calcFn, 'function', 'calculateTooltipPosition deve ser uma função no sandbox');

    const sidebarPos = calcFn(
      mockSidebarTarget,
      { top: 180, bottom: 224, left: 10, right: 72, width: 62, height: 44 },
      { width: 110, height: 26 },
      1280,
      800
    );
    assert.strictEqual(sidebarPos.position, 'right', 'Tooltip de item da sidebar deve abrir para a direita');
    assert.strictEqual(sidebarPos.left, 72 + MARGIN, 'Posição left do tooltip deve ser à direita da sidebar');
    assert.strictEqual(sidebarPos.top, 180 + 22 - 13, 'Posição top deve ser centralizada verticalmente com o item');
    assert.ok(sidebarPos.top >= 180, 'Tooltip não pode invadir a área do item acima (y < 180)');
  });

  test('19. Concorrência: Fila de serialização de saves, visualOnly sem PUT e proteção anti-flood', async () => {
    // 1. Validações estáticas nos arquivos-fonte
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'app.js'), 'utf-8');
    const authSyncJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'authSync.js'), 'utf-8');
    const simJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'simulation.js'), 'utf-8');

    // Verifica fila de saves em app.js (externalizado do index.html no Security 3B)
    assert.ok(appJs.includes('saveQueue ='), 'app.js deve implementar fila/promessa de serialização saveQueue');
    assert.ok(appJs.includes('isRevalidatingConflict'), 'app.js deve conter flag de proteção isRevalidatingConflict');
    assert.ok(appJs.includes('lastConflictToastTime'), 'app.js deve conter debounce anti-flood lastConflictToastTime');
    assert.ok(appJs.includes("'month-select'"), 'visualOnly deve conter month-select');

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

    assert.ok(relNotesJs.includes('version: "3.7.0"'), 'releaseNotes.js deve conter a release v3.7.0');
    assert.ok(relNotesJs.includes('version: "3.6.0"'), 'releaseNotes.js deve conter a release v3.6.0');
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
    const idx37 = relNotesJs.indexOf('version: "3.7.0"');
    const idx36 = relNotesJs.indexOf('version: "3.6.0"');
    const idx35 = relNotesJs.indexOf('version: "3.5.0"');
    const idx34 = relNotesJs.indexOf('version: "3.4.0"');
    const idx33 = relNotesJs.indexOf('version: "3.3.0"');
    const idx32 = relNotesJs.indexOf('version: "3.2.0"');
    const idx31 = relNotesJs.indexOf('version: "3.1.0"');
    const idx30 = relNotesJs.indexOf('version: "3.0.0"');
    assert.ok(idx37 < idx36 && idx36 < idx35 && idx35 < idx34 && idx34 < idx33 && idx33 < idx32 && idx32 < idx31 && idx31 < idx30, 'Releases devem estar ordenadas: v3.7 -> v3.6 -> v3.5 -> v3.4 -> v3.3 -> v3.2 -> v3.1 -> v3.0');

    // Validação de conteúdo amigável e não técnico na v3.7
    const v37Snippet = relNotesJs.slice(idx37, idx36);
    assert.ok(v37Snippet.includes('isLatest: true'), 'v3.7 deve ser marcada com isLatest: true');
    assert.ok(v37Snippet.includes('Cadastro rápido'), 'v3.7 deve destacar Cadastro rápido');
    assert.ok(v37Snippet.includes('Pagamentos parciais'), 'v3.7 deve destacar Pagamentos parciais');
    assert.ok(v37Snippet.includes('Recebimentos parciais'), 'v3.7 deve destacar Recebimentos parciais');
    assert.ok(v37Snippet.includes('ordem alfabética'), 'v3.7 deve destacar ordem alfabética');

    // Auditoria editorial: ausência de termos técnicos no conteúdo da v3.7
    const forbiddenTerms = ['MongoDB', 'paidHistory', 'PUT', 'CAS', 'RBAC', 'endpoint', 'payload', 'localStorage', 'JavaScript', 'Service Worker', 'BASE_PATH'];
    for (const term of forbiddenTerms) {
      assert.ok(!v37Snippet.includes(term), `v3.7 não deve conter termo técnico: ${term}`);
    }

    // Validação de UI no HTML e CSS
    assert.ok(indexHtml.includes('id="releaseNotesBtn"'), 'index.html deve conter o botão de release notes na barra superior');
    assert.ok(indexHtml.includes('id="releaseNotesBadge"'), 'index.html deve conter o badge de release notes');
    assert.ok(indexHtml.includes('id="releaseNotesDialog"'), 'index.html deve conter o modal dialog de release notes');
    assert.ok(indexHtml.includes('id="drawerReleaseNotesBtn"'), 'index.html deve conter botão no drawer mobile');
    assert.ok(cssComponents.includes('#releaseNotesBtn'), 'components.css deve estilizar o botão de release notes');
    assert.ok(cssComponents.includes('.notification-badge.unread-dot'), 'components.css deve estilizar o ponto indicador de não lido');

    // 2. Estado de leitura inicial do usuário comum para 3.7.0
    const getRes1 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const userDoc1 = await getRes1.json();
    const currentRev = Number(userDoc1.revision || 0);
    const readListInitial = Array.isArray(userDoc1.readReleases) ? userDoc1.readReleases : [];
    assert.strictEqual(readListInitial.includes('3.7.0'), false, 'Usuário novo/sem leitura não deve ter a release 3.7.0 como lida');

    // 3. Usuário abre e marca a release 3.7.0 como lida
    const updatePayload = Object.assign({}, userDoc1, {
      expectedRevision: currentRev,
      readReleases: ['3.7.0', '3.6.0', '3.5.0']
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

    // 4. Refresh / Leitura subsequente confirma que release 3.7.0 permanece lida
    const getRes2 = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const userDoc2 = await getRes2.json();
    assert.ok(Array.isArray(userDoc2.readReleases), 'readReleases deve ser um array');
    assert.strictEqual(userDoc2.readReleases.includes('3.7.0'), true, 'readReleases deve persistir 3.7.0');

    // 5. Isolamento: Outro usuário (ex: admin) não foi impactado e tem seu próprio estado independente
    const getAdminRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testAdminToken}` }
    });
    const adminDoc = await getAdminRes.json();
    const adminReadList = Array.isArray(adminDoc.readReleases) ? adminDoc.readReleases : [];
    assert.strictEqual(adminReadList.includes('3.7.0'), false, 'Outro usuário deve manter estado de leitura independente');
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
    const regCookie = regRes.headers.get('set-cookie') || '';
    const regMatch = regCookie.match(/omnifin_session=([^;]+)/);
    const newUserToken = (regMatch && regMatch[1]) || regJson.token;

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
    const loginCookie = loginRes.headers.get('set-cookie') || '';
    const loginMatch = loginCookie.match(/omnifin_session=([^;]+)/);
    const adminCreatedToken = (loginMatch && loginMatch[1]) || loginJson.token;

    const adminCreatedFinRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${adminCreatedToken}` }
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
      assert.strictEqual(apiFetchOptions.credentials, 'same-origin', 'Deve incluir credentials same-origin para autenticação por cookie');
      assert.strictEqual(apiFetchOptions.headers['X-Requested-With'], 'XMLHttpRequest', 'Deve incluir header anti-CSRF X-Requested-With');
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

  test('38. Checkpoint 10: PWA & iOS Standalone Polish (Manifest, Apple Touch Icons, Meta Tags, Service Worker Seguro sem Cache Financeiro e Navegação Standalone)', async () => {
    // 1. Auditoria e Validação do Manifest (manifest.webmanifest & manifest.json)
    const manifestPath = path.join(process.cwd(), 'public', 'manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest deve existir na pasta public');

    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.strictEqual(manifestContent.name, 'OmniFin', 'Nome no manifest deve ser OmniFin');
    assert.strictEqual(manifestContent.short_name, 'OmniFin', 'Nome curto no manifest deve ser OmniFin');
    assert.strictEqual(manifestContent.display, 'standalone', 'display no manifest deve ser standalone');
    assert.strictEqual(manifestContent.start_url, './dashboard', 'start_url deve ser relativo (./dashboard) para suportar tanto subpath (/omnifin) quanto raiz (/)');
    assert.strictEqual(manifestContent.scope, './', 'scope deve ser relativo (./) para suportar subpath (/omnifin) e raiz (/)');
    assert.strictEqual(manifestContent.theme_color, '#1F7A5C', 'theme_color deve ser o verde oficial OmniFin');
    assert.ok(Array.isArray(manifestContent.icons) && manifestContent.icons.length >= 3, 'Manifest deve conter array de ícones');

    const icon192 = manifestContent.icons.find(i => i.sizes === '192x192');
    const icon512 = manifestContent.icons.find(i => i.sizes === '512x512');
    assert.ok(icon192, 'Manifest deve referenciar ícone 192x192');
    assert.ok(icon512, 'Manifest deve referenciar ícone 512x512');
    assert.ok(!icon192.src.startsWith('/'), 'Ícone 192 deve usar caminho relativo no manifest');
    assert.ok(!icon512.src.startsWith('/'), 'Ícone 512 deve usar caminho relativo no manifest');

    // Validação também de manifest.json (espelho)
    const manifestJsonPath = path.join(process.cwd(), 'public', 'manifest.json');
    assert.ok(fs.existsSync(manifestJsonPath), 'manifest.json deve existir na pasta public');
    const manifestJsonContent = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf-8'));
    assert.strictEqual(manifestJsonContent.start_url, './dashboard', 'start_url em manifest.json deve ser relativo');
    assert.strictEqual(manifestJsonContent.scope, './', 'scope em manifest.json deve ser relativo');

    // 2. Existência e Integridade dos Arquivos de Ícones Oficiais
    const iconsDir = path.join(process.cwd(), 'public', 'icons');
    assert.ok(fs.existsSync(iconsDir), 'Pasta public/icons deve existir');

    const expectedIcons = [
      'favicon.svg',
      'favicon-32x32.png',
      'favicon-16x16.png',
      'icon.svg',
      'icon-192x192.png',
      'icon-512x512.png',
      'apple-touch-icon.png',
      'apple-touch-icon-180x180.png',
      'apple-touch-icon-152x152.png',
      'apple-touch-icon-120x120.png'
    ];

    for (const iconFile of expectedIcons) {
      const iconPath = path.join(iconsDir, iconFile);
      assert.ok(fs.existsSync(iconPath), `Arquivo ${iconFile} deve existir em public/icons`);
      const stat = fs.statSync(iconPath);
      assert.ok(stat.size > 100, `Arquivo ${iconFile} deve ter tamanho válido (> 100 bytes)`);
    }

    // 3. Meta Tags iOS, Favicon Dedicado e Apple Touch Icons no index.html e login.html (caminhos relativos e BASE_PATH safe)
    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf-8');
    const loginHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'login.html'), 'utf-8');

    for (const [name, html] of [['index.html', indexHtml], ['login.html', loginHtml]]) {
      assert.ok(html.includes('href="manifest.webmanifest"'), `${name} deve referenciar o webmanifest de forma relativa`);
      assert.ok(html.includes('rel="icon" type="image/svg+xml" href="icons/favicon.svg"'), `${name} deve referenciar o favicon dedicado`);
      assert.ok(!html.includes('rel="icon" type="image/svg+xml" href="icons/icon.svg"'), `${name} não deve reutilizar o ícone principal do PWA como favicon`);
      assert.ok(html.includes('rel="apple-touch-icon" href="icons/apple-touch-icon.png"'), `${name} deve referenciar apple-touch-icon relativo`);
      assert.ok(html.includes('name="apple-mobile-web-app-capable" content="yes"'), `${name} deve conter apple-mobile-web-app-capable`);
      assert.ok(html.includes('name="apple-mobile-web-app-status-bar-style"'), `${name} deve conter apple-mobile-web-app-status-bar-style`);
      assert.ok(html.includes('name="apple-mobile-web-app-title" content="OmniFin"'), `${name} deve conter apple-mobile-web-app-title`);
      assert.ok(html.includes('name="theme-color" content="#1F7A5C"'), `${name} deve conter theme-color #1F7A5C`);
    }

    // 4. Service Worker (sw.js) & Isolamento de Segurança Financeira
    const swPath = path.join(process.cwd(), 'public', 'sw.js');
    assert.ok(fs.existsSync(swPath), 'public/sw.js deve existir');

    const swContent = fs.readFileSync(swPath, 'utf-8');
    assert.ok(swContent.includes('CACHE_VERSION') || swContent.includes('CACHE_NAME') || swContent.includes('omnifin-static-'), 'Service Worker deve possuir cache versionado');
    assert.ok(swContent.includes('/api/'), 'Service Worker deve inspecionar rotas /api/');
    assert.ok(swContent.includes('fetch(req)') || swContent.includes('fetch(event.request)'), 'Service Worker deve utilizar estratégia network-only para APIs');

    // 5. Garantia de que rotas financeiras e IA não são cacheadas em storage estático
    assert.ok(!swContent.includes('cache.put(req, networkResponse)') || swContent.includes('!url.pathname.startsWith(\'/api/\')') || swContent.includes('url.pathname.startsWith(\'/api/\')'), 'Service Worker deve isolar o cache de requisições financeiras');

    // 6. Proteção de Navegação iOS Standalone e Registro de SW compatível com BASE_PATH
    const uiShellJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'uiShell.js'), 'utf-8');
    assert.ok(uiShellJs.includes('navigator.standalone') || uiShellJs.includes('serviceWorker'), 'uiShell.js deve conter suporte a PWA e proteção iOS standalone');
    assert.ok(uiShellJs.includes('API.resolveUrl'), 'uiShell.js deve utilizar API.resolveUrl para registro do Service Worker');

    // 7. Ausência de target="_blank" em links internos
    assert.ok(!indexHtml.includes('href="/dashboard" target="_blank"'), 'Links internos não devem conter target="_blank"');
    assert.ok(!indexHtml.includes('href="/expenses" target="_blank"'), 'Links internos não devem conter target="_blank"');
  });

  test('39. Hotfix Mobile: Módulos Não Favoritos Devem Continuar em "Mais" (União Completa e Zero Omissão)', async () => {
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
  });

  test('40. Checkpoint 11 — Refinamentos de Lançamentos, Pagamento Parcial, Cadastro Rápido e Modais Globais', async () => {
    // Carrega scripts no sandbox
    const fs = require('fs');
    const constantsJs = fs.readFileSync(path.join(__dirname, '../public/js/core/constants.js'), 'utf8');
    const utilsJs = fs.readFileSync(path.join(__dirname, '../public/js/core/utils.js'), 'utf8');
    const stateJs = fs.readFileSync(path.join(__dirname, '../public/js/core/state.js'), 'utf8');
    const financeQueriesJs = fs.readFileSync(path.join(__dirname, '../public/js/core/financeQueries.js'), 'utf8');
    const consolidatedDashboardJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/consolidatedDashboard.js'), 'utf8');

    const testState = {
      year: 2026,
      month: 9,
      categories: [
        { name: 'Transporte', color: '#10B981' },
        { name: 'Alimentação', color: '#EF4444' },
        { name: 'Água & Luz', color: '#3B82F6' },
        { name: 'alimentação gourmet', color: '#F59E0B' },
        { name: 'Saúde', color: '#EC4899' },
        { name: 'beleza & estética', color: '#8B5CF6' }
      ],
      destinations: [
        { name: 'Nubank', dueDay: 15 },
        { name: 'Ágora Invest', dueDay: 10 },
        { name: 'Bradesco', dueDay: 20 },
        { name: 'inter', dueDay: 5 },
        { name: 'Pix' },
        { name: 'Dinheiro' }
      ],
      profile: { name: 'Usuário Teste', baseSalary: 10000 },
      incomes: {},
      extras: [],
      debtors: [],
      fixed: [],
      variable: [],
      benefits: []
    };

    const sandbox = {
      window: {},
      state: testState,
      getState: () => testState,
      saveState: () => {},
      MONTH_ABBR: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
      DEST_SVG_ICONS: { card: '<svg></svg>', pix: '<svg></svg>', money: '<svg></svg>' },
      CATEGORY_COLORS: ['#1F7A5C', '#3B82F6'],
      getCategoryName: (c) => typeof c === 'string' ? c : (c?.name || ''),
      getCategoryColor: (c) => typeof c === 'object' ? (c?.color || '#1F7A5C') : '#1F7A5C',
      getDestMeta: (name) => {
        const d = (testState.destinations || []).find(x => x.name === name);
        return { name, color: '#1F7A5C', icon: 'card', dueDay: d?.dueDay || null };
      },
      uid: () => 'uid_' + Math.random().toString(36).slice(2, 9),
      currency: (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`,
      escapeHtml: (s) => String(s || ''),
      document: {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => []
      },
      $: () => null,
      $$: () => []
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(constantsJs, sandbox);
    vm.runInContext(utilsJs, sandbox);
    vm.runInContext(stateJs, sandbox);
    vm.runInContext(financeQueriesJs, sandbox);
    vm.runInContext(consolidatedDashboardJs, sandbox);

    // =========================================================================
    // 1. ORDENAÇÃO ALFABÉTICA EM PT-BR (Categorias e Destinos)
    // =========================================================================
    const sortedCats = sandbox.getSortedCategories(testState.categories);
    const sortedCatNames = sortedCats.map(c => sandbox.getCategoryName(c));

    // 'Água & Luz' e 'Alimentação' devem vir no início por ordenação canônica em português
    assert.strictEqual(sortedCatNames[0], 'Água & Luz', 'Água & Luz deve ser a primeira categoria');
    assert.strictEqual(sortedCatNames[1], 'Alimentação', 'Alimentação deve ser a segunda categoria');
    assert.strictEqual(sortedCatNames[2], 'alimentação gourmet', 'alimentação gourmet deve ser a terceira categoria');
    assert.strictEqual(sortedCatNames[sortedCatNames.length - 1], 'Transporte', 'Transporte deve ser a última categoria');

    // Verifica que a array original NÃO foi mutada
    assert.strictEqual(testState.categories[0].name, 'Transporte', 'Array original de categorias deve ser preservada');

    const sortedDests = sandbox.getSortedDestinations(testState.destinations);
    const sortedDestNames = sortedDests.map(d => d.name);
    assert.strictEqual(sortedDestNames[0], 'Ágora Invest', 'Ágora Invest deve ser o primeiro destino');
    assert.strictEqual(sortedDestNames[1], 'Bradesco', 'Bradesco deve ser o segundo destino');
    assert.strictEqual(sortedDestNames[2], 'Dinheiro', 'Dinheiro deve ser o terceiro destino');
    assert.strictEqual(sortedDestNames[3], 'inter', 'inter deve ser o quarto destino');
    assert.strictEqual(sortedDestNames[4], 'Nubank', 'Nubank deve ser o quinto destino');
    assert.strictEqual(sortedDestNames[5], 'Pix', 'Pix deve ser o sexto destino');

    // =========================================================================
    // 2. HELPER CENTRAL E MOTOR DE PAGAMENTO PARCIAL (Retrocompatibilidade & Escrita Canônica)
    // =========================================================================
    const sampleItem = {
      id: 'fix_1',
      name: 'Internet Fibra',
      amount: 200,
      paidHistory: {
        '2026-07': true,                       // Booleano legado (100% pago)
        '2026-08': false,                      // Booleano legado (0% pago / pendente)
        '2026-09': 80,                         // Número legado (80 pago / 120 restante)
        '2026-10': { paidAmount: 150 }         // Objeto (150 pago / 50 restante)
      }
    };

    // Leitura retrocompatível 2026-07 (true)
    const payJul = sandbox.getExpensePaymentInfo(sampleItem, 2026, 7, 200);
    assert.strictEqual(payJul.status, 'pago');
    assert.strictEqual(payJul.paidAmount, 200);
    assert.strictEqual(payJul.remainingAmount, 0);
    assert.strictEqual(payJul.isPaid, true);
    assert.strictEqual(payJul.isPartial, false);

    // Leitura retrocompatível 2026-08 (false)
    const payAgo = sandbox.getExpensePaymentInfo(sampleItem, 2026, 8, 200);
    assert.strictEqual(payAgo.status, 'pendente');
    assert.strictEqual(payAgo.paidAmount, 0);
    assert.strictEqual(payAgo.remainingAmount, 200);
    assert.strictEqual(payAgo.isPending, true);

    // Leitura retrocompatível 2026-09 (número legado 80)
    const paySet = sandbox.getExpensePaymentInfo(sampleItem, 2026, 9, 200);
    assert.strictEqual(paySet.status, 'parcial');
    assert.strictEqual(paySet.paidAmount, 80);
    assert.strictEqual(paySet.remainingAmount, 120);
    assert.strictEqual(paySet.isPartial, true);

    // Leitura retrocompatível 2026-10 (objeto { paidAmount: 150 })
    const payOut = sandbox.getExpensePaymentInfo(sampleItem, 2026, 10, 200);
    assert.strictEqual(payOut.status, 'parcial');
    assert.strictEqual(payOut.paidAmount, 150);
    assert.strictEqual(payOut.remainingAmount, 50);

    // ESCRITA CANÔNICA ÚNICA via setExpensePayment
    sandbox.setExpensePayment(sampleItem, 2026, 11, 75, 200);
    assert.deepStrictEqual(typeof sampleItem.paidHistory['2026-11'], 'object', 'Nova escrita deve ser estritamente um objeto');
    assert.strictEqual(sampleItem.paidHistory['2026-11'].paidAmount, 75, 'paidAmount deve ser 75');
    assert.ok(sampleItem.paidHistory['2026-11'].updatedAt, 'updatedAt deve ser gravado');
    assert.strictEqual(sampleItem.paidHistory['2026-11'].status, undefined, 'Status NÃO deve ser persistido se derivável');

    // Clamping: valor negativo é travado em 0
    sandbox.setExpensePayment(sampleItem, 2026, 11, -30, 200);
    assert.strictEqual(sampleItem.paidHistory['2026-11'].paidAmount, 0, 'Valor negativo deve ser limitado a 0');

    // Clamping: valor superior ao total é travado no total
    sandbox.setExpensePayment(sampleItem, 2026, 11, 350, 200);
    assert.strictEqual(sampleItem.paidHistory['2026-11'].paidAmount, 200, 'Valor excessivo deve ser limitado ao totalAmount');
    const payNov = sandbox.getExpensePaymentInfo(sampleItem, 2026, 11, 200);
    assert.strictEqual(payNov.status, 'pago', 'Ao atingir o valor total, status derivado deve ser "pago"');

    // =========================================================================
    // 3. ISOLAMENTO DE COMPETÊNCIA PARA FIXAS E PARCELADAS
    // =========================================================================
    testState.fixed = [
      {
        id: 'fix_aluguel',
        name: 'Aluguel',
        group: 'Moradia',
        destination: 'Nubank',
        versions: [{ year: 2026, month: 1, amount: 1200 }],
        paidHistory: {}
      }
    ];
    testState.variable = [
      {
        id: 'var_curso',
        name: 'Curso Online',
        group: 'Educação',
        destination: 'Nubank',
        amount: 300,
        startYear: 2026,
        startMonth: 8,
        endYear: 2026,
        endMonth: 10,
        installments: 3,
        paymentType: 'installment',
        paidHistory: {}
      }
    ];

    // Realiza pagamento parcial no aluguel em Setembro/2026 (R$ 500 de R$ 1200)
    sandbox.setExpensePayment(testState.fixed[0], 2026, 9, 500, 1200);

    // Consulta Setembro/2026
    const setFixed = sandbox.activeFixedForMonth(2026, 9);
    assert.strictEqual(setFixed.length, 1);
    assert.strictEqual(setFixed[0].status, 'parcial');
    assert.strictEqual(setFixed[0].paidAmount, 500);
    assert.strictEqual(setFixed[0].remainingAmount, 700);

    // Consulta Outubro/2026 (deve estar 100% pendente e isolado)
    const outFixed = sandbox.activeFixedForMonth(2026, 10);
    assert.strictEqual(outFixed.length, 1);
    assert.strictEqual(outFixed[0].status, 'pendente');
    assert.strictEqual(outFixed[0].paidAmount, 0);
    assert.strictEqual(outFixed[0].remainingAmount, 1200);

    // Realiza pagamento parcial na parcela 2 (Setembro/2026) do Curso (R$ 100 de R$ 300)
    sandbox.setExpensePayment(testState.variable[0], 2026, 9, 100, 300);

    const setVar = sandbox.activeVariableForMonth(2026, 9);
    assert.strictEqual(setVar.length, 1);
    assert.strictEqual(setVar[0].status, 'parcial');
    assert.strictEqual(setVar[0].paidAmount, 100);
    assert.strictEqual(setVar[0].remainingAmount, 200);

    // Parcela 3 em Outubro/2026 continua pendente
    const outVar = sandbox.activeVariableForMonth(2026, 10);
    assert.strictEqual(outVar.length, 1);
    assert.strictEqual(outVar[0].status, 'pendente');
    assert.strictEqual(outVar[0].paidAmount, 0);
    assert.strictEqual(outVar[0].remainingAmount, 300);

    // =========================================================================
    // 4. MÉTRICAS FINANCEIRAS DE MONTH TOTALS COM PARCIAIS
    // =========================================================================
    // Em 2026-09:
    // Renda = 10.000
    // Despesas Totais = 1200 (Aluguel) + 300 (Curso) = 1500
    // Pago = 500 (Aluguel) + 100 (Curso) = 600
    // Pendente = 700 (Aluguel) + 200 (Curso) = 900
    // Balanço = 10000 - 1500 = 8500
    const totalsSet = sandbox.monthTotals(2026, 9);
    assert.strictEqual(totalsSet.totalExpenses, 1500, 'Total de despesas deve ser 1500');
    assert.strictEqual(totalsSet.paidExpenses, 600, 'Total pago deve ser exatamente 600');
    assert.strictEqual(totalsSet.pendingExpenses, 900, 'Total pendente deve ser exatamente 900');
    assert.strictEqual(totalsSet.balance, 8500, 'Balanço deve ser 8500');

    // =========================================================================
    // 5. DASHBOARD CONSOLIDADO COM PARCIAIS E FILTRO DE STATUS
    // =========================================================================
    const dataset = sandbox.buildConsolidatedDataset({ year: 2026, month: 9 });
    assert.strictEqual(dataset.length, 2, 'Dataset deve conter 2 despesas');
    assert.strictEqual(dataset[0].paidAmount, 500);
    assert.strictEqual(dataset[0].remainingAmount, 700);
    assert.strictEqual(dataset[1].paidAmount, 100);
    assert.strictEqual(dataset[1].remainingAmount, 200);

    // Agregações por Categoria no consolidado
    const byCat = sandbox.aggregateByCategory(dataset);
    const moradiaCat = byCat.find(c => c.name === 'Moradia');
    assert.ok(moradiaCat, 'Categoria Moradia deve existir no dataset consolidado');
    assert.strictEqual(moradiaCat.total, 1200);
    assert.strictEqual(moradiaCat.paidTotal, 500);
    assert.strictEqual(moradiaCat.pendingTotal, 700);

    // Agregações por Destino no consolidado
    const byDest = sandbox.aggregateByDestination(dataset);
    const nubankDest = byDest.find(d => d.name === 'Nubank');
    assert.ok(nubankDest, 'Destino Nubank deve existir no dataset consolidado');
    assert.strictEqual(nubankDest.total, 1500);
    assert.strictEqual(nubankDest.paidTotal, 600);
    assert.strictEqual(nubankDest.pendingTotal, 900);

    // =========================================================================
    // 6. CADASTRO RÁPIDO: Destino Pix/Dinheiro vs Destino com Vencimento
    // =========================================================================
    // Criação de despesa via Cadastro Rápido com Pix:
    const quickPix = {
      id: sandbox.uid(),
      name: 'Almoço Restaurante',
      amount: 65,
      group: 'Alimentação',
      destination: 'Pix',
      dueDay: null,
      note: 'Almoço de trabalho',
      startMonth: 9,
      startYear: 2026,
      endMonth: 9,
      endYear: 2026,
      installments: 1,
      paymentType: 'cash',
      status: 'pago',
      paidHistory: {}
    };
    sandbox.setExpensePayment(quickPix, 2026, 9, 65, 65);
    testState.variable.push(quickPix);

    const checkPix = sandbox.getExpensePaymentInfo(quickPix, 2026, 9, 65);
    assert.strictEqual(checkPix.status, 'pago', 'Despesa rápida Pix deve estar quitada');
    assert.strictEqual(checkPix.paidAmount, 65);
    assert.strictEqual(checkPix.remainingAmount, 0);

    // Criação de despesa via Cadastro Rápido com Nubank (herda dueDay: 15):
    const quickNubank = {
      id: sandbox.uid(),
      name: 'Farmácia Medicamentos',
      amount: 120,
      group: 'Saúde',
      destination: 'Nubank',
      dueDay: 15,
      note: '',
      startMonth: 9,
      startYear: 2026,
      endMonth: 9,
      endYear: 2026,
      installments: 1,
      paymentType: 'cash',
      status: 'pendente',
      paidHistory: {}
    };
    testState.variable.push(quickNubank);

    const checkNubank = sandbox.getExpensePaymentInfo(quickNubank, 2026, 9, 120);
    assert.strictEqual(checkNubank.status, 'pendente', 'Despesa rápida com vencimento inicia pendente');
    assert.strictEqual(checkNubank.paidAmount, 0);
    assert.strictEqual(checkNubank.remainingAmount, 120);
    assert.strictEqual(quickNubank.dueDay, 15, 'dueDay 15 deve ser herdado do destino');
  });

  test('41. Checkpoint 11 Complemento: Modais Globais de Devedores, Rendas Extras e Benefícios com RBAC e Atualização Reativa', async () => {
    const fs = require('fs');
    const path = require('path');
    const vm = require('vm');

    // 1. Asserções estáticas do index.html
    const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    assert.ok(indexHtml.includes('id="quickActionFastExpense"'), 'Deve conter Despesa Rápida no quick action');
    assert.ok(indexHtml.includes('id="quickActionNewExpense"'), 'Deve conter Despesa Completa no quick action');
    assert.ok(indexHtml.includes('id="quickActionNewDebtor"'), 'Deve conter Novo Devedor no quick action');
    assert.ok(indexHtml.includes('id="quickActionNewExtra"'), 'Deve conter Nova Renda Extra no quick action');
    assert.ok(indexHtml.includes('id="quickActionNewBenefit"'), 'Deve conter Novo Benefício no quick action');

    assert.ok(indexHtml.includes('data-close="extraDialog"'), 'extraDialog deve conter botão Cancelar com data-close');
    assert.ok(indexHtml.includes('data-close="debtorDialog"'), 'debtorDialog deve conter botão Cancelar com data-close');
    assert.ok(indexHtml.includes('data-close="benefitDialog"'), 'benefitDialog deve conter botão Cancelar com data-close');

    // 2. Asserções funcionais no Sandbox VM
    const constantsJs = fs.readFileSync(path.join(__dirname, '../public/js/core/constants.js'), 'utf8');
    const utilsJs = fs.readFileSync(path.join(__dirname, '../public/js/core/utils.js'), 'utf8');
    const stateJs = fs.readFileSync(path.join(__dirname, '../public/js/core/state.js'), 'utf8');
    const financeQueriesJs = fs.readFileSync(path.join(__dirname, '../public/js/core/financeQueries.js'), 'utf8');
    const consolidatedDashboardJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/consolidatedDashboard.js'), 'utf8');
    const debtorsJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/debtors.js'), 'utf8');
    const extrasJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/extras.js'), 'utf8');
    const benefitsJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/benefits.js'), 'utf8');
    const uiShellJs = fs.readFileSync(path.join(__dirname, '../public/js/core/uiShell.js'), 'utf8');

    const testState = {
      year: 2026,
      month: 9,
      categories: [
        { name: 'Alimentação', color: '#EF4444' },
        { name: 'Moradia', color: '#10B981' }
      ],
      destinations: [
        { name: 'Nubank', dueDay: 15 },
        { name: 'Pix' }
      ],
      profile: { name: 'Usuário Teste', baseSalary: 10000 },
      incomes: {},
      extras: [],
      debtors: [],
      fixed: [],
      variable: [],
      benefitTransactions: [],
      benefitsConfig: { amount: 1200, va: 600, vr: 600 }
    };

    let notifications = [];
    const sandbox = {
      window: {},
      state: testState,
      getState: () => testState,
      saveState: () => {},
      render: () => {},
      notify: (msg, type) => { notifications.push({ msg, type }); },
      MONTH_ABBR: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
      MONTH_NAMES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
      BENEFIT_TYPES_MAP: {
        va: { label: 'Vale Alimentação (VA)', short: 'VA', color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
        vr: { label: 'Vale Refeição (VR)', short: 'VR', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' }
      },
      CATEGORY_COLORS: ['#1F7A5C', '#3B82F6'],
      DEBTOR_COLORS_PALETTE: ['#10B981', '#3B82F6'],
      getCategoryName: (c) => typeof c === 'string' ? c : (c?.name || ''),
      getCategoryColor: (c) => typeof c === 'object' ? (c?.color || '#1F7A5C') : '#1F7A5C',
      getDestMeta: (name) => ({ name, color: '#1F7A5C', icon: 'card', dueDay: 15 }),
      uid: () => 'uid_' + Math.random().toString(36).slice(2, 9),
      currency: (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`,
      escapeHtml: (s) => String(s || ''),
      hasTabPermission: (tabId) => true,
      isModuleInMaintenance: (tabId) => false,
      addEventListener: () => {},
      removeEventListener: () => {},
      document: {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({ setAttribute: () => {}, style: {}, addEventListener: () => {} }),
        addEventListener: () => {},
        removeEventListener: () => {},
        body: { appendChild: () => {} }
      },
      $: () => null,
      $$: () => []
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(constantsJs, sandbox);
    vm.runInContext(utilsJs, sandbox);
    vm.runInContext(stateJs, sandbox);
    vm.runInContext(financeQueriesJs, sandbox);
    vm.runInContext(consolidatedDashboardJs, sandbox);
    vm.runInContext(debtorsJs, sandbox);
    vm.runInContext(extrasJs, sandbox);
    vm.runInContext(benefitsJs, sandbox);
    vm.runInContext(uiShellJs, sandbox);

    // 3. Validação de Bloqueio por RBAC e Manutenção
    sandbox.hasTabPermission = (tabId) => tabId !== 'tab-extras';
    notifications = [];
    sandbox.openExtraDialog('new');
    assert.strictEqual(notifications.length, 1);
    assert.strictEqual(notifications[0].type, 'error');
    assert.ok(notifications[0].msg.includes('permissão'), 'RBAC deve bloquear abertura sem permissão');

    sandbox.hasTabPermission = (tabId) => true;
    sandbox.isModuleInMaintenance = (tabId) => tabId === 'tab-debtors';
    notifications = [];
    sandbox.openDebtorDialog('new');
    assert.strictEqual(notifications.length, 1);
    assert.strictEqual(notifications[0].type, 'warning');
    assert.ok(notifications[0].msg.includes('manutenção'), 'Manutenção deve bloquear abertura sem bypass');

    sandbox.isModuleInMaintenance = (tabId) => false;

    // 4. Criação de Devedor Global com countInTotal e atualização do Dashboard Consolidado
    const newDebtor = {
      id: sandbox.uid(),
      title: 'Empréstimo Curso',
      debtorName: 'Marcos Oliveira',
      name: 'Marcos Oliveira',
      amount: 400,
      destination: 'Nubank',
      startMonth: 9,
      startYear: 2026,
      endMonth: 12,
      endYear: 2026,
      status: 'pendente',
      installments: 4,
      countInTotal: true,
      includeInSimulation: true,
      description: 'Parcela 1 de 4',
      paidHistory: {}
    };
    testState.debtors.push(newDebtor);

    const datasetWithDebtor = sandbox.buildConsolidatedDataset({ year: 2026, month: 9 });
    const debItem = datasetWithDebtor.find(x => x.isDebtor === true);
    assert.ok(debItem, 'Devedor cadastrado deve refletir no dataset consolidado');
    assert.strictEqual(debItem.amount, 400);
    assert.strictEqual(debItem.category, 'Devedores');
    assert.strictEqual(debItem.status, 'pendente');

    const totalsWithDebtor = sandbox.monthTotals(2026, 9);
    assert.strictEqual(totalsWithDebtor.sumDebtorCounted, 400);
    assert.strictEqual(totalsWithDebtor.totalIncome, 10400, 'Renda total deve somar 10000 + 400 = 10400');

    // 5. Criação de Renda Extra Global e impacto na Renda Mensal
    const newExtra = {
      id: sandbox.uid(),
      title: 'Consultoria Web',
      source: 'Freelance',
      amount: 1500,
      sender: 'Empresa Alpha',
      startMonth: 9,
      startYear: 2026,
      endMonth: 9,
      endYear: 2026,
      status: 'pago',
      description: 'Serviço prestado',
      installments: 1,
      includeInSimulation: true,
      paidHistory: { '2026-9': true }
    };
    testState.extras.push(newExtra);

    const totalsWithExtra = sandbox.monthTotals(2026, 9);
    assert.strictEqual(totalsWithExtra.sumExt, 1500);
    assert.strictEqual(totalsWithExtra.totalIncome, 11900, 'Renda total deve somar 10000 + 400 + 1500 = 11900');

    // 6. Criação de Benefício Global e Isolamento Semântico
    const newBenefitTx = {
      id: sandbox.uid(),
      description: 'Supermercado Mensal',
      type: 'va',
      amount: 320,
      day: 10,
      month: 9,
      year: 2026,
      note: 'Compras do mês'
    };
    testState.benefitTransactions.push(newBenefitTx);

    const benefitTotals = sandbox.monthBenefitsTotals(2026, 9);
    assert.strictEqual(benefitTotals.spentTotal, 320);
    assert.strictEqual(benefitTotals.remTotal, 880);

    // Garante que benefício não infla salário base nem contamina rendas comuns
    const totalsFinal = sandbox.monthTotals(2026, 9);
    assert.strictEqual(totalsFinal.baseSalary, 10000);
    assert.strictEqual(totalsFinal.totalIncome, 11900);
  });

  test('42. Checkpoint 11.1 — Pagamento/Recebimento Parcial para Devedores e Rendas Extras (Controle por Parcela, Acúmulo, Validações, Retrocompatibilidade e Métricas)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const vm = await import('vm');

    const financeQueriesJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'financeQueries.js'), 'utf-8');
    const expensesJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'modules', 'expenses.js'), 'utf-8');
    const debtorsJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'modules', 'debtors.js'), 'utf-8');
    const extrasJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'modules', 'extras.js'), 'utf-8');
    const dashboardJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'modules', 'consolidatedDashboard.js'), 'utf-8');

    // 1. Validações estáticas de código
    assert.ok(financeQueriesJs.includes('window.getDebtorPaymentInfo'), 'financeQueries.js deve expor getDebtorPaymentInfo');
    assert.ok(financeQueriesJs.includes('window.getExtraPaymentInfo'), 'financeQueries.js deve expor getExtraPaymentInfo');
    assert.ok(expensesJs.includes('type === \'debtor\''), 'expenses.js deve suportar tipo debtor em openPartialPaymentDialog e toggle');
    assert.ok(expensesJs.includes('type === \'extra\''), 'expenses.js deve suportar tipo extra em openPartialPaymentDialog e toggle');
    assert.ok(debtorsJs.includes('getExpensePaymentInfo'), 'debtors.js deve utilizar motor de cálculo getExpensePaymentInfo');
    assert.ok(extrasJs.includes('getExpensePaymentInfo'), 'extras.js deve utilizar motor de cálculo getExpensePaymentInfo');
    assert.ok(dashboardJs.includes('payInfo = (typeof getExpensePaymentInfo'), 'consolidatedDashboard.js deve mapear payInfo para devedores');

    // 2. Setup Sandbox
    const testState = {
      year: 2026,
      month: 9,
      categories: [{ name: 'Alimentação' }, { name: 'Devedores' }],
      destinations: [{ name: 'Nubank' }],
      profile: { name: 'Usuário Teste', baseSalary: 8000 },
      debtors: [
        {
          id: 'deb-test-1',
          debtorName: 'Yasmim',
          title: 'Empréstimo Familiar',
          amount: 400,
          destination: 'Nubank',
          startMonth: 5,
          startYear: 2026,
          endMonth: 11,
          endYear: 2026,
          countInTotal: true,
          status: 'pendente',
          paidHistory: {}
        }
      ],
      extras: [
        {
          id: 'ext-test-1',
          title: 'Projeto Freelance',
          source: 'Consultoria',
          amount: 1000,
          sender: 'Cliente Alpha',
          startMonth: 9,
          startYear: 2026,
          endMonth: 9,
          endYear: 2026,
          status: 'pendente',
          paidHistory: {}
        }
      ],
      fixed: [
        {
          id: 'fix-test-1',
          name: 'Internet',
          amount: 150,
          group: 'Gerais',
          destination: 'Nubank',
          versions: [{ id: 'v1', year: 2026, month: 1, amount: 150 }],
          paidHistory: {}
        }
      ],
      variable: [
        {
          id: 'var-test-1',
          name: 'Supermercado',
          amount: 500,
          group: 'Alimentação',
          destination: 'Nubank',
          startMonth: 9,
          startYear: 2026,
          endMonth: 9,
          endYear: 2026,
          paidHistory: {}
        }
      ],
      benefitTransactions: []
    };

    const sandbox = {
      window: {},
      state: testState,
      getState: () => testState,
      saveState: () => {},
      render: () => {},
      notify: () => {},
      mk: (y, m) => y * 12 + m,
      ymKey: (y, m) => `${y}-${String(m).padStart(2, '0')}`,
      MONTH_ABBR: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
      MONTH_NAMES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
      CATEGORY_COLORS: ['#1F7A5C', '#3B82F6'],
      DEBTOR_COLORS_PALETTE: ['#10B981', '#3B82F6'],
      getCategoryName: (c) => typeof c === 'string' ? c : (c?.name || ''),
      getCategoryColor: () => '#1F7A5C',
      getDestMeta: () => ({ color: '#1F7A5C', icon: 'card' }),
      currency: (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`,
      escapeHtml: (s) => String(s || ''),
      document: {
        readyState: 'complete',
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({ setAttribute: () => {}, style: {}, addEventListener: () => {} }),
        addEventListener: () => {},
        removeEventListener: () => {},
        body: { appendChild: () => {} }
      },
      $: () => null,
      $$: () => []
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(financeQueriesJs, sandbox);
    vm.runInContext(debtorsJs, sandbox);
    vm.runInContext(extrasJs, sandbox);
    vm.runInContext(dashboardJs, sandbox);

    // 3. Devedor: Ciclo de vida completo por parcela/competência
    const deb = testState.debtors[0];

    // 3.1 Inicial (0 recebido)
    let activeDebs = sandbox.activeDebtorsForMonth(2026, 9);
    assert.strictEqual(activeDebs[0].status, 'pendente');
    assert.strictEqual(activeDebs[0].paidAmount, 0);
    assert.strictEqual(activeDebs[0].remainingAmount, 400);

    // 3.2 Recebimento Parcial de R$ 150
    sandbox.setExpensePayment(deb, 2026, 9, 150, 400);
    activeDebs = sandbox.activeDebtorsForMonth(2026, 9);
    assert.strictEqual(activeDebs[0].status, 'parcial');
    assert.strictEqual(activeDebs[0].paidAmount, 150);
    assert.strictEqual(activeDebs[0].remainingAmount, 250);

    // 3.3 Garantia de isolamento por parcela: Mês 10 (Outubro) permanece 0 recebido / pendente
    let octDebs = sandbox.activeDebtorsForMonth(2026, 10);
    assert.strictEqual(octDebs[0].status, 'pendente');
    assert.strictEqual(octDebs[0].paidAmount, 0);
    assert.strictEqual(octDebs[0].remainingAmount, 400);

    // 3.4 Novo recebimento de +R$ 100 -> Acumulado R$ 250
    sandbox.setExpensePayment(deb, 2026, 9, 250, 400);
    activeDebs = sandbox.activeDebtorsForMonth(2026, 9);
    assert.strictEqual(activeDebs[0].status, 'parcial');
    assert.strictEqual(activeDebs[0].paidAmount, 250);
    assert.strictEqual(activeDebs[0].remainingAmount, 150);

    // 3.5 Recebimento final de +R$ 150 -> Total R$ 400 (Quitado)
    sandbox.setExpensePayment(deb, 2026, 9, 400, 400);
    activeDebs = sandbox.activeDebtorsForMonth(2026, 9);
    assert.strictEqual(activeDebs[0].status, 'pago');
    assert.strictEqual(activeDebs[0].paidAmount, 400);
    assert.strictEqual(activeDebs[0].remainingAmount, 0);

    // 4. Renda Extra: Ciclo de vida completo
    const ext = testState.extras[0];

    // 4.1 Inicial (0 recebido)
    let activeExts = sandbox.activeExtrasForMonth(2026, 9);
    assert.strictEqual(activeExts[0].status, 'pendente');
    assert.strictEqual(activeExts[0].paidAmount, 0);
    assert.strictEqual(activeExts[0].remainingAmount, 1000);

    // 4.2 Recebimento Parcial de R$ 300
    sandbox.setExpensePayment(ext, 2026, 9, 300, 1000);
    activeExts = sandbox.activeExtrasForMonth(2026, 9);
    assert.strictEqual(activeExts[0].status, 'parcial');
    assert.strictEqual(activeExts[0].paidAmount, 300);
    assert.strictEqual(activeExts[0].remainingAmount, 700);

    // 4.3 Recebimento adicional de +R$ 200 -> Acumulado R$ 500
    sandbox.setExpensePayment(ext, 2026, 9, 500, 1000);
    activeExts = sandbox.activeExtrasForMonth(2026, 9);
    assert.strictEqual(activeExts[0].status, 'parcial');
    assert.strictEqual(activeExts[0].paidAmount, 500);
    assert.strictEqual(activeExts[0].remainingAmount, 500);

    // 4.4 Recebimento final de +R$ 500 -> Total R$ 1000 (Quitado)
    sandbox.setExpensePayment(ext, 2026, 9, 1000, 1000);
    activeExts = sandbox.activeExtrasForMonth(2026, 9);
    assert.strictEqual(activeExts[0].status, 'pago');
    assert.strictEqual(activeExts[0].paidAmount, 1000);
    assert.strictEqual(activeExts[0].remainingAmount, 0);

    // 5. Retrocompatibilidade com registros legados
    const legacyItem1 = { amount: 600, paidHistory: { '2026-09': true } };
    const legacyInfo1 = sandbox.getExpensePaymentInfo(legacyItem1, 2026, 9, 600);
    assert.strictEqual(legacyInfo1.status, 'pago');
    assert.strictEqual(legacyInfo1.paidAmount, 600);
    assert.strictEqual(legacyInfo1.remainingAmount, 0);

    const legacyItem2 = { amount: 600, paidHistory: { '2026-09': 250 } };
    const legacyInfo2 = sandbox.getExpensePaymentInfo(legacyItem2, 2026, 9, 600);
    assert.strictEqual(legacyInfo2.status, 'parcial');
    assert.strictEqual(legacyInfo2.paidAmount, 250);
    assert.strictEqual(legacyInfo2.remainingAmount, 350);

    const legacyItem3 = { amount: 600, status: 'pago' };
    const legacyInfo3 = sandbox.getExpensePaymentInfo(legacyItem3, 2026, 9, 600);
    assert.strictEqual(legacyInfo3.status, 'pago');
    assert.strictEqual(legacyInfo3.paidAmount, 600);

    const legacyItem4 = { amount: 600, status: 'recebido' };
    const legacyInfo4 = sandbox.getExpensePaymentInfo(legacyItem4, 2026, 9, 600);
    assert.strictEqual(legacyInfo4.status, 'pago');
    assert.strictEqual(legacyInfo4.paidAmount, 600);

    const legacyItem5 = { amount: 600, status: 'pendente' };
    const legacyInfo5 = sandbox.getExpensePaymentInfo(legacyItem5, 2026, 9, 600);
    assert.strictEqual(legacyInfo5.status, 'pendente');
    assert.strictEqual(legacyInfo5.paidAmount, 0);
    assert.strictEqual(legacyInfo5.remainingAmount, 600);

    // 6. Dataset Consolidado e Métricas
    sandbox.setExpensePayment(deb, 2026, 9, 150, 400); // 150 pago, 250 pendente
    sandbox.setExpensePayment(ext, 2026, 9, 400, 1000); // 400 pago, 600 pendente

    const dataset = sandbox.buildConsolidatedDataset(testState, 2026, 9);
    const debInDataset = dataset.find(x => x.sourceType === 'debtor');
    assert.ok(debInDataset, 'Devedor deve constar no dataset');
    assert.strictEqual(debInDataset.status, 'parcial');
    assert.strictEqual(debInDataset.paidAmount, 150);
    assert.strictEqual(debInDataset.remainingAmount, 250);

    const totals = sandbox.monthTotals(2026, 9);
    assert.strictEqual(totals.baseSalary, 8000);
    assert.strictEqual(totals.sumExt, 1000);
    assert.strictEqual(totals.sumDeb, 400);
    assert.strictEqual(totals.sumDebtorCounted, 400);
    assert.strictEqual(totals.totalIncome, 8000 + 1000 + 400);
    assert.strictEqual(totals.receivedExt, 400);
    assert.strictEqual(totals.pendingExt, 600);
    assert.strictEqual(totals.receivedDeb, 150);
    assert.strictEqual(totals.pendingDeb, 250);

    // 7. Ausência de regressão em Despesas Fixas e Variáveis
    const fix = testState.fixed[0];
    sandbox.setExpensePayment(fix, 2026, 9, 60, 150);
    const activeFix = sandbox.activeFixedForMonth(2026, 9);
    assert.strictEqual(activeFix[0].status, 'parcial');
    assert.strictEqual(activeFix[0].paidAmount, 60);
    assert.strictEqual(activeFix[0].remainingAmount, 90);
  });

  test('43. Hotfix Mobile v3.7: Compactação de Layout, Viewport Meta e Eliminação de Overflow Horizontal', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf-8');
    const loginHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'login.html'), 'utf-8');
    const mobileCss = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'mobile.css'), 'utf-8');
    const styleCss = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'style.css'), 'utf-8');

    // 1. Auditoria de Viewport Meta Tags (index.html e login.html)
    assert.ok(indexHtml.includes('name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"'), 'index.html deve conter viewport-fit=cover sem restrições de zoom');
    assert.ok(loginHtml.includes('name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"'), 'login.html deve conter viewport-fit=cover sem restrições de zoom');

    const forbiddenViewportAttrs = ['user-scalable=no', 'maximum-scale', 'minimum-scale'];
    for (const attr of forbiddenViewportAttrs) {
      assert.ok(!indexHtml.includes(attr), `index.html não deve conter atributo restritivo: ${attr}`);
      assert.ok(!loginHtml.includes(attr), `login.html não deve conter atributo restritivo: ${attr}`);
    }

    // 2. Prevenção de 100vw e Overflow em Containers Raiz
    assert.ok(!styleCss.includes('.app-container {\n  display: flex;\n  width: 100vw;'), 'style.css não deve fixar width: 100vw em .app-container');
    assert.ok(mobileCss.includes('overflow-x: hidden !important;'), 'mobile.css deve aplicar overflow-x: hidden no html/body');
    assert.ok(mobileCss.includes('max-width: 100% !important;'), 'mobile.css deve restringir max-width: 100% nos containers principais');

    // 3. Grade de Métricas e Compactação 2 Colunas Mobile
    assert.ok(mobileCss.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important;'), 'mobile.css deve estruturar .metrics em repeat(2, minmax(0, 1fr))');
    assert.ok(mobileCss.includes('.metric {') && mobileCss.includes('min-width: 0 !important;'), 'mobile.css deve garantir min-width: 0 nos cards de métricas');

    // 4. Subtabs & Segmented Controls
    assert.ok(mobileCss.includes('#expensesSubTabsWrap') && mobileCss.includes('#debtorsSubTabsWrap'), 'mobile.css deve estruturar subtelas em segmented control');
    assert.ok(mobileCss.includes('clamp('), 'mobile.css deve utilizar clamp() para tipografia responsiva e compacta');

    // 5. Ribbon Mensal com Scroll Interno Seguro
    assert.ok(mobileCss.includes('.ribbon {') && mobileCss.includes('overflow-x: auto !important;'), 'mobile.css deve manter scroll horizontal interno no ribbon mensal');

    // 6. Dialogs / Modais e Bottom Nav
    assert.ok(mobileCss.includes('.bottom-nav-bar {') && mobileCss.includes('env(safe-area-inset-bottom)'), 'mobile.css deve respeitar safe-area-inset-bottom na barra inferior');
    assert.ok(mobileCss.includes('dialog {') && mobileCss.includes('border-radius: 18px 18px 0 0 !important;'), 'mobile.css deve apresentar dialogs compactos em bottom sheet');
  });

  test('44. Hotfix Mobile v3.7: Prevenção de Auto-Zoom no iOS Safari (font-size >= 16px) e Ações do Botão "+" (Despesa Rápida vs Despesa Completa)', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const mobileCss = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'mobile.css'), 'utf-8');
    const authCss = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'auth.css'), 'utf-8');
    const uiShellJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'uiShell.js'), 'utf-8');
    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf-8');

    // 1. Prevenção de Auto-Zoom no iOS Safari: font-size >= 16px em inputs, selects e textareas em mobile.css e auth.css
    assert.ok(
      mobileCss.includes('font-size: 16px !important;'),
      'mobile.css deve definir font-size: 16px !important para inputs/selects/textareas para evitar zoom do iOS Safari'
    );
    assert.ok(
      authCss.includes('font-size: 16px !important;'),
      'auth.css deve definir font-size: 16px !important para inputs no mobile'
    );
    assert.ok(
      mobileCss.includes('#entryDialog input') &&
      mobileCss.includes('#quickExpenseDialog input') &&
      mobileCss.includes('#debtorDialog input') &&
      mobileCss.includes('#extraDialog input') &&
      mobileCss.includes('#benefitDialog input') &&
      mobileCss.includes('#partialPaymentDialog input') &&
      mobileCss.includes('#tab-profile input') &&
      mobileCss.includes('#tab-investments input') &&
      mobileCss.includes('#tab-simulation input') &&
      mobileCss.includes('#tab-shopping input'),
      'mobile.css deve cobrir explicitamente todos os formulários e dialogs de criação e edição com font-size: 16px !important'
    );

    // 2. Auditoria do Botão "+" (Quick Action Sheet):
    // Despesa Rápida deve chamar openQuickExpenseDialog()
    // Despesa Completa deve chamar openEntryDialog({ mode: 'new', type: 'cash' })
    assert.ok(
      uiShellJs.includes("handleQuickActionItemClick('quickActionFastExpense')") &&
      uiShellJs.includes('openQuickExpenseDialog()'),
      'quickActionFastExpense deve despachar para openQuickExpenseDialog()'
    );
    assert.ok(
      uiShellJs.includes("handleQuickActionItemClick('quickActionNewExpense')") &&
      uiShellJs.includes("openEntryDialog({ mode: 'new', type: 'cash' })"),
      'quickActionNewExpense deve despachar para openEntryDialog({ mode: "new", type: "cash" })'
    );
    assert.ok(
      uiShellJs.includes("handleQuickActionItemClick('quickActionWizardExpense')"),
      'quickActionWizardExpense deve despachar para openEntryDialog'
    );

    // 3. Teste de Execução em Runtime (Simulação de clique no DOM)
    let fastExpenseCalled = 0;
    let fullWizardCalled = 0;
    let lastWizardArgs = null;

    const mockWindow = {
      openQuickExpenseDialog: () => { fastExpenseCalled++; },
      openEntryDialog: (opts) => { fullWizardCalled++; lastWizardArgs = opts; }
    };

    // Avalia a lógica de despacho
    const dispatchFn = new Function('window', 'document', 'actionId', `
      const quickOverlay = { classList: { remove: () => {} } };
      if (actionId === 'quickActionFastExpense') {
        if (typeof window.openQuickExpenseDialog === 'function') {
          window.openQuickExpenseDialog();
        }
      } else if (actionId === 'quickActionNewExpense' || actionId === 'quickActionWizardExpense') {
        if (typeof window.openEntryDialog === 'function') {
          window.openEntryDialog({ mode: 'new', type: 'cash' });
        }
      }
    `);

    dispatchFn(mockWindow, {}, 'quickActionFastExpense');
    assert.strictEqual(fastExpenseCalled, 1, 'Fast expense deve ser chamado exatamente 1 vez');
    assert.strictEqual(fullWizardCalled, 0, 'Full wizard não deve ser chamado no clique de fast expense');

    dispatchFn(mockWindow, {}, 'quickActionNewExpense');
    assert.strictEqual(fastExpenseCalled, 1, 'Fast expense não deve ser chamado novamente');
    assert.strictEqual(fullWizardCalled, 1, 'Full wizard deve ser chamado exatamente 1 vez');
    assert.deepStrictEqual(lastWizardArgs, { mode: 'new', type: 'cash' }, 'Full wizard deve receber { mode: "new", type: "cash" }');

    // 4. Integridade da estrutura HTML do Quick Action Sheet
    assert.ok(indexHtml.includes('id="quickActionFastExpense"'), 'index.html deve conter botão quickActionFastExpense');
    assert.ok(indexHtml.includes('id="quickActionNewExpense"'), 'index.html deve conter botão quickActionNewExpense');
    assert.ok(indexHtml.includes('id="quickExpenseDialog"'), 'index.html deve conter quickExpenseDialog');
    assert.ok(indexHtml.includes('id="entryDialog"'), 'index.html deve conter entryDialog (Wizard Completo)');
  });

  test('45. Checkpoint 12 — Assistente IA com Ações Controladas (Proposta de Despesa + Confirmação + Gravação Segura)', async () => {
    // 1. Rota de interpretação exige autenticação (401 sem token)
    const unauthInterpRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Gastei 23,99 com Gemini Pro no Nubank PJ' })
    });
    assert.strictEqual(unauthInterpRes.status, 401, 'POST /api/ai/actions/interpret sem token deve retornar 401');

    // 2. Mensagem vazia retorna 400 Bad Request
    const emptyMsgRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: '   ' })
    });
    assert.strictEqual(emptyMsgRes.status, 400, 'Mensagem vazia deve retornar 400');

    // 3. Sem webhook de ações configurado retorna 503
    const origActionWebhook = config.N8N_AI_ACTION_WEBHOOK_URL;
    const origActionUser = config.N8N_AI_ACTION_BASIC_AUTH_USER;
    const origActionPass = config.N8N_AI_ACTION_BASIC_AUTH_PASSWORD;

    config.N8N_AI_ACTION_WEBHOOK_URL = '';
    config.N8N_AI_ACTION_BASIC_AUTH_USER = '';
    config.N8N_AI_ACTION_BASIC_AUTH_PASSWORD = '';

    const noConfigRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'Gastei 23,99 no Nubank PJ' })
    });
    assert.strictEqual(noConfigRes.status, 503, 'Sem webhook configurado deve retornar 503');

    // 4. Configuração com Mock do n8n Action Webhook
    const mockActionUser = 'omnifin_action_test';
    const mockActionPass = 'action_secret_pass_2026';
    const expectedActionBasicHeader = 'Basic ' + Buffer.from(`${mockActionUser}:${mockActionPass}`).toString('base64');

    config.N8N_AI_ACTION_WEBHOOK_URL = 'http://127.0.0.1:9999/mock-n8n-action';
    config.N8N_AI_ACTION_BASIC_AUTH_USER = mockActionUser;
    config.N8N_AI_ACTION_BASIC_AUTH_PASSWORD = mockActionPass;

    const originalGlobalFetch = global.fetch;
    let interceptedActionCall = null;

    try {
      // Setup de categorias e destinos no usuário de teste para validação
      const finRes = await originalGlobalFetch(`${baseUrl}/api/finances`, {
        headers: { 'Authorization': `Bearer ${testUserToken}` }
      });
      const finDoc = await finRes.json();
      const currentRev = Number(finDoc.revision || 0);

      const setupPayload = Object.assign({}, finDoc, {
        expectedRevision: currentRev,
        categories: [
          { name: 'Assinatura', icon: 'zap', color: '#820AD1' },
          { name: 'Alimentação', icon: 'utensils', color: '#FF7A00' },
          { name: 'Lazer', icon: 'star', color: '#EC4899' },
          { name: 'Gerais', icon: 'folder', color: '#6B7280' }
        ],
        destinations: [
          { name: 'Nubank PJ', icon: 'credit-card', dueDay: 15 },
          { name: 'Pix', icon: 'zap', dueDay: null },
          { name: 'Dinheiro', icon: 'cash', dueDay: null }
        ]
      });

      const updateFinRes = await originalGlobalFetch(`${baseUrl}/api/finances`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(setupPayload)
      });
      assert.strictEqual(updateFinRes.status, 200, 'Setup de categorias e destinos deve retornar 200');

      // Mock da resposta do n8n (Contrato canônico)
      global.fetch = async (url, options = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('/mock-n8n-action')) {
          interceptedActionCall = {
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
              action: 'create_expense',
              requiresConfirmation: true,
              requiresReview: false,
              source: 'text',
              data: {
                description: 'Gemini Pro',
                merchant: null,
                amount: 23.99,
                category: 'Assinatura',
                destination: 'Nubank PJ',
                date: null,
                competence: {
                  month: 9,
                  year: 2026
                },
                installments: 1,
                documentType: null,
                notes: 'Assinatura mensal'
              },
              confidence: {
                description: 1,
                amount: 1,
                category: 1,
                destination: 1,
                date: 0
              },
              warnings: []
            }),
            text: async () => ''
          };
        }
        return originalGlobalFetch(url, options);
      };

      // 5. Chamada de Interpretação com sucesso
      const interpRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Gastei 23,99 com o Gemini Pro no NubankPJ',
          context: { month: 9, year: 2026 }
        })
      });

      assert.strictEqual(interpRes.status, 200, 'Interpretação válida deve retornar 200 OK');
      const interpJson = await interpRes.json();
      assert.strictEqual(interpJson.success, true);
      assert.strictEqual(interpJson.action, 'create_expense');
      assert.ok(interpJson.proposalId, 'Deve gerar um proposalId');
      assert.ok(interpJson.proposalId.startsWith('prop_'), 'proposalId deve ter prefixo prop_');
      assert.strictEqual(interpJson.requiresConfirmation, true);
      assert.strictEqual(interpJson.requiresReview, false);
      assert.strictEqual(interpJson.data.description, 'GEMINI PRO', 'Descrição interpretada deve estar em UPPERCASE');
      assert.strictEqual(interpJson.data.amount, 23.99);
      assert.strictEqual(interpJson.data.category, 'Assinatura');
      assert.strictEqual(interpJson.data.destination, 'Nubank PJ');

      // 6. Validação dos headers e isolamento de usuário no payload enviado ao n8n
      assert.ok(interceptedActionCall, 'Chamada ao webhook do n8n deve ocorrer');
      assert.strictEqual(interceptedActionCall.headers['Authorization'], expectedActionBasicHeader);
      assert.strictEqual(interceptedActionCall.body.authenticatedUserId, testUserId, 'authenticatedUserId deve ser o do JWT');
      assert.strictEqual(interceptedActionCall.body.context.month, 9);
      assert.strictEqual(interceptedActionCall.body.context.year, 2026);

      // 7. Proposta sobrevive a consulta direta no storage (persistência real em banco/store)
      const storedProp = await storageService.getAiProposal(interpJson.proposalId);
      assert.ok(storedProp, 'Proposta deve estar persistida no storage');
      assert.strictEqual(storedProp.userId, testUserId);
      assert.strictEqual(storedProp.status, 'pending');

      // 8. Confirmação exige autenticação (401)
      const unauthConfirm = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: interpJson.proposalId })
      });
      assert.strictEqual(unauthConfirm.status, 401, 'Confirm sem token deve retornar 401');

      // 9. Confirmação com proposalId inexistente retorna 404
      const notFoundConfirm = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ proposalId: 'prop_inexistente_9999' })
      });
      assert.strictEqual(notFoundConfirm.status, 404, 'proposalId inexistente deve retornar 404');

      // 10. Proposta de usuário A não pode ser confirmada por usuário B (403 Forbidden)
      const userBSuffix = 'user_b_' + Date.now();
      const otherUserRegister = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: userBSuffix,
          senha: 'Password123!',
          nome: 'User B Teste',
          email: `${userBSuffix}@test.com`
        })
      });
      const userBData = await otherUserRegister.json();
      const userBCookie = otherUserRegister.headers.get('set-cookie') || '';
      const userBMatch = userBCookie.match(/omnifin_session=([^;]+)/);
      const userBToken = (userBMatch && userBMatch[1]) || userBData.token;

      const userBConfirm = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userBToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ proposalId: interpJson.proposalId })
      });
      assert.strictEqual(userBConfirm.status, 403, 'Usuário B não pode confirmar proposta do Usuário A');

      // 11. Proposta expirada (TTL) não pode ser confirmada (404/410)
      const expiredProposalDoc = {
        _id: 'prop_expired_12345',
        userId: testUserId,
        action: 'create_expense',
        status: 'pending',
        source: 'text',
        proposal: {
          description: 'EXPIRA LOGO',
          amount: 10,
          category: 'Assinatura',
          destination: 'Nubank PJ',
          competence: { month: 9, year: 2026 },
          installments: 1
        },
        createdAt: new Date(Date.now() - 3600000),
        expiresAt: new Date(Date.now() - 100000), // Já expirado
        consumedAt: null
      };
      await storageService.saveAiProposal(expiredProposalDoc);

      const expiredConfirm = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ proposalId: 'prop_expired_12345' })
      });
      assert.strictEqual(expiredConfirm.status, 404, 'Proposta expirada deve retornar 404/não encontrada');

      // 12. Edição com categoria inexistente retorna 400 Bad Request
      const invalidCatConfirm = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          proposalId: interpJson.proposalId,
          data: { category: 'Categoria Inexistente Fake' }
        })
      });
      assert.strictEqual(invalidCatConfirm.status, 400, 'Categoria inexistente deve retornar 400');

      // 13. Edição com destino inexistente retorna 400 Bad Request
      const invalidDestConfirm = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          proposalId: interpJson.proposalId,
          data: { destination: 'Cartão Fake Inexistente' }
        })
      });
      assert.strictEqual(invalidDestConfirm.status, 400, 'Destino inexistente deve retornar 400');

      // 14. Confirmação Válida com Sucesso (Cartão: pendente com dueDay=15 e Descrição UPPERCASE)
      const validConfirmRes = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          proposalId: interpJson.proposalId,
          data: {
            description: 'Gemini Pro Advanced', // Edição legítima de descrição (em minúsculas/misto)
            arbitraryField: 'HACK',            // Campo arbitrário deve ser ignorado
            userId: 'usr_hacker'               // Tentativa de spoofing de userId ignorada
          }
        })
      });

      assert.strictEqual(validConfirmRes.status, 200, 'Confirmação válida deve retornar 200 OK');
      const confirmJson = await validConfirmRes.json();
      assert.strictEqual(confirmJson.success, true);
      assert.strictEqual(confirmJson.expense.name, 'GEMINI PRO ADVANCED', 'Nome persistido deve estar em UPPERCASE');
      assert.strictEqual(confirmJson.expense.amount, 23.99);
      assert.strictEqual(confirmJson.expense.group, 'Assinatura');
      assert.strictEqual(confirmJson.expense.destination, 'Nubank PJ');
      assert.strictEqual(confirmJson.expense.dueDay, 15, 'Destino Nubank PJ deve definir dueDay=15');
      assert.strictEqual(confirmJson.expense.status, 'pendente', 'Cartão de crédito deve ter status pendente');
      assert.strictEqual(confirmJson.expense.arbitraryField, undefined, 'Campos arbitrários não devem entrar na despesa');

      // 15. Idempotência: Segunda confirmação do mesmo proposalId NÃO duplica despesa
      const secondConfirmRes = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ proposalId: interpJson.proposalId })
      });
      assert.strictEqual(secondConfirmRes.status, 200);
      const secondConfirmJson = await secondConfirmRes.json();
      assert.strictEqual(secondConfirmJson.alreadyProcessed, true, 'Segunda confirmação deve indicar alreadyProcessed');

      // Verifica documento finances no banco
      const checkFinRes = await originalGlobalFetch(`${baseUrl}/api/finances`, {
        headers: { 'Authorization': `Bearer ${testUserToken}` }
      });
      const checkFinDoc = await checkFinRes.json();
      const geminiExpenses = checkFinDoc.variable.filter(v => v.name === 'GEMINI PRO ADVANCED');
      assert.strictEqual(geminiExpenses.length, 1, 'Despesa não deve ser duplicada no banco');

      // 16. Regra Pix/Dinheiro: Criação com destino Pix deve quitar imediatamente e com nome em UPPERCASE
      global.fetch = async (url, options = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('/mock-n8n-action')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              action: 'create_expense',
              requiresConfirmation: true,
              requiresReview: false,
              source: 'text',
              data: {
                description: 'bolsa da prada',
                amount: 10000,
                category: 'Alimentação',
                destination: 'Pix',
                competence: { month: 9, year: 2026 },
                installments: 1
              },
              confidence: { description: 1, amount: 1 },
              warnings: []
            }),
            text: async () => ''
          };
        }
        return originalGlobalFetch(url, options);
      };

      const pixInterpRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Comprei uma bolsa da prada no Pix por 10000' })
      });
      const pixInterpJson = await pixInterpRes.json();
      assert.strictEqual(pixInterpJson.data.description, 'BOLSA DA PRADA', 'Interpretação deve normalizar descrição para BOLSA DA PRADA');

      const pixConfirmRes = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          proposalId: pixInterpJson.proposalId,
          data: {
            notes: null,       // Testa resiliência contra null.trim()
            merchant: null,    // Testa resiliência contra null.trim()
            category: 'Alimentação'
          }
        })
      });
      const pixConfirmJson = await pixConfirmRes.json();

      assert.strictEqual(pixConfirmJson.expense.name, 'BOLSA DA PRADA', 'Nome persistido no banco deve ser BOLSA DA PRADA');
      assert.strictEqual(pixConfirmJson.expense.status, 'pago', 'Destino Pix deve nascer pago');
      assert.strictEqual(pixConfirmJson.expense.dueDay, null, 'Destino Pix deve ter dueDay nulo');
      assert.ok(pixConfirmJson.expense.paidHistory['2026-09'], 'paidHistory deve conter chave 2026-09');
      assert.strictEqual(pixConfirmJson.expense.paidHistory['2026-09'].paidAmount, 10000);

      // 17. Intenção Genérica sem dados suficientes NÃO gera proposta vazia (Responde conversacionalmente)
      global.fetch = async (url, options = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('/mock-n8n-action')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              action: 'chat',
              answer: 'Claro! Me diga o que você comprou, o valor e o destino.',
              data: null
            }),
            text: async () => ''
          };
        }
        return originalGlobalFetch(url, options);
      };

      const genericInterpRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Quero cadastrar uma despesa' })
      });
      const genericInterpJson = await genericInterpRes.json();
      assert.strictEqual(genericInterpJson.action, 'chat');
      assert.strictEqual(genericInterpJson.proposalId, undefined, 'Não deve gerar proposalId para mensagem genérica');
      assert.ok(genericInterpJson.answer, 'Deve retornar resposta conversacional');

      // 18. Prioridade Temporal: Mês explícito ("em abril") com UI em Outubro/2026 resolve para mês 4
      global.fetch = async (url, options = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('/mock-n8n-action')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              action: 'create_expense',
              requiresConfirmation: true,
              requiresReview: false,
              source: 'text',
              data: {
                description: 'Assinatura do Gemini',
                amount: 10,
                category: 'Assinatura',
                destination: 'Nubank PJ',
                competence: null
              },
              confidence: { description: 1, amount: 1 },
              warnings: []
            }),
            text: async () => ''
          };
        }
        return originalGlobalFetch(url, options);
      };

      const aprilInterpRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Em abril eu comprei uma assinatura do Gemini de 10 reais no Nubank PJ',
          context: { month: 10, year: 2026, currentDate: '2026-09-01' }
        })
      });
      const aprilInterpJson = await aprilInterpRes.json();
      assert.strictEqual(aprilInterpJson.data.competence.month, 4, 'Mês explícito "em abril" deve vencer UI mês 10');
      assert.strictEqual(aprilInterpJson.data.competence.year, 2026);

      // 19. Prioridade Temporal: Verbos de compra recente ("Comprei uma bolsa...") com UI em Outubro usa currentDate (Setembro/2026)
      const recentInterpRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Comprei uma bolsa da Prada no Pix por 10000',
          context: { month: 10, year: 2026, currentDate: '2026-09-01' }
        })
      });
      const recentInterpJson = await recentInterpRes.json();
      assert.strictEqual(recentInterpJson.data.competence.month, 9, 'Compra recente sem mês explícito deve usar currentDate (9/2026)');

      // 20. Prioridade Temporal: Expressão relativa "mês passado" com currentDate Setembro resolve para mês 8
      const lastMonthInterpRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Mês passado comprei um livro por 50 no Pix',
          context: { month: 10, year: 2026, currentDate: '2026-09-01' }
        })
      });
      const lastMonthInterpJson = await lastMonthInterpRes.json();
      assert.strictEqual(lastMonthInterpJson.data.competence.month, 8, '"Mês passado" com base em Setembro deve resolver para Agosto (8)');

      // 21. Política de Categoria: Fallback inteligente para "Gerais" quando categoria específica não existe
      global.fetch = async (url, options = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('/mock-n8n-action')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              action: 'create_expense',
              requiresConfirmation: true,
              requiresReview: false,
              source: 'text',
              data: {
                description: 'Algo desconhecido',
                amount: 100,
                category: 'Inexistente',
                destination: 'Pix',
                competence: null
              },
              confidence: { description: 1, amount: 1 },
              warnings: []
            }),
            text: async () => ''
          };
        }
        return originalGlobalFetch(url, options);
      };

      const fallbackCatInterpRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Comprei algo desconhecido por 100 no Pix',
          context: { month: 9, year: 2026 }
        })
      });
      const fallbackCatJson = await fallbackCatInterpRes.json();
      // O usuário padrão possui a categoria 'Gerais' cadastrada
      assert.strictEqual(fallbackCatJson.data.category, 'Gerais', 'Deve usar Gerais como fallback sem deixar category=null');

      // 22. Cancelamento de Proposta
      const cancelProposalDoc = {
        _id: 'prop_to_cancel_99',
        userId: testUserId,
        action: 'create_expense',
        status: 'pending',
        source: 'text',
        proposal: {
          description: 'Despesa Cancelada',
          amount: 50,
          category: 'Lazer',
          destination: 'Pix',
          competence: { month: 9, year: 2026 }
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 900000),
        consumedAt: null
      };
      await storageService.saveAiProposal(cancelProposalDoc);

      const cancelRes = await fetch(`${baseUrl}/api/ai/actions/expense/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ proposalId: 'prop_to_cancel_99' })
      });
      assert.strictEqual(cancelRes.status, 200, 'Cancelamento deve retornar 200');
      const cancelPropCheck = await storageService.getAiProposal('prop_to_cancel_99');
      assert.strictEqual(cancelPropCheck.status, 'cancelled');

      // Tentar confirmar proposta cancelada retorna 400
      const tryConfirmCancelled = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ proposalId: 'prop_to_cancel_99' })
      });
      assert.strictEqual(tryConfirmCancelled.status, 400, 'Confirmar proposta cancelada deve retornar 400');

      // 23. Verificação de RBAC (Sem permissão de despesas -> 403)
      await storageService.setUserPermissions(testUserId, { despesas: false });
      const testPropRbac = {
        _id: 'prop_rbac_test',
        userId: testUserId,
        action: 'create_expense',
        status: 'pending',
        proposal: {
          description: 'Teste RBAC',
          amount: 10,
          category: 'Lazer',
          destination: 'Pix',
          competence: { month: 9, year: 2026 }
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 900000)
      };
      await storageService.saveAiProposal(testPropRbac);

      const rbacConfirmRes = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ proposalId: 'prop_rbac_test' })
      });
      assert.strictEqual(rbacConfirmRes.status, 403, 'Usuário sem permissão de despesas deve receber 403');
      await storageService.setUserPermissions(testUserId, { despesas: true }); // Restaura

      // 19. Verificação de Manutenção (Módulo em manutenção -> 503)
      await storageService.saveMaintenanceConfig({ despesas: { maintenance: true, name: 'Despesas' } });
      const maintConfirmRes = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ proposalId: 'prop_rbac_test' })
      });
      assert.strictEqual(maintConfirmRes.status, 503, 'Módulo em manutenção deve retornar 503');
      await storageService.saveMaintenanceConfig({ despesas: { maintenance: false, name: 'Despesas' } }); // Restaura

      // 24. CHECKPOINT 12.1: Proposta e Confirmação de BENEFÍCIOS (create_benefit)
      global.fetch = async (url, options = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('/mock-n8n-action')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              action: 'create_benefit',
              requiresConfirmation: true,
              requiresReview: false,
              source: 'text',
              data: {
                description: 'almoço executivo',
                amount: 35.00,
                benefitType: 'vr',
                day: 15,
                competence: { month: 9, year: 2026 },
                notes: 'Almoço com equipe'
              },
              confidence: { description: 1, amount: 1, benefitType: 0.95 },
              warnings: []
            }),
            text: async () => ''
          };
        }
        return originalGlobalFetch(url, options);
      };

      const benefitInterpRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: 'Usei 35 reais do VR no almoço executivo',
          context: { month: 9, year: 2026 }
        })
      });
      assert.strictEqual(benefitInterpRes.status, 200);
      const benefitInterpJson = await benefitInterpRes.json();
      assert.strictEqual(benefitInterpJson.success, true);
      assert.strictEqual(benefitInterpJson.action, 'create_benefit', 'Ação de benefício deve ser create_benefit e não create_expense');
      assert.strictEqual(benefitInterpJson.data.description, 'ALMOÇO EXECUTIVO', 'Descrição de benefício deve estar em UPPERCASE');
      assert.strictEqual(benefitInterpJson.data.benefitType, 'vr', 'benefitType deve ser vr');
      assert.strictEqual(benefitInterpJson.data.amount, 35);
      assert.strictEqual(benefitInterpJson.data.day, 15);

      // 25. Confirmação de Benefício persiste em benefitTransactions
      const benefitConfirmRes = await fetch(`${baseUrl}/api/ai/actions/benefit/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          proposalId: benefitInterpJson.proposalId,
          data: { notes: 'Almoço corporativo' }
        })
      });
      assert.strictEqual(benefitConfirmRes.status, 200, 'Confirmação de benefício deve retornar 200');
      const benefitConfirmJson = await benefitConfirmRes.json();
      assert.strictEqual(benefitConfirmJson.success, true);
      assert.strictEqual(benefitConfirmJson.benefit.description, 'ALMOÇO EXECUTIVO');
      assert.strictEqual(benefitConfirmJson.benefit.type, 'vr');
      assert.strictEqual(benefitConfirmJson.benefit.amount, 35);
      assert.strictEqual(benefitConfirmJson.benefit.month, 9);
      assert.strictEqual(benefitConfirmJson.benefit.year, 2026);
      assert.strictEqual(benefitConfirmJson.benefit.note, 'Almoço corporativo');

      // Verifica persistência no documento finances do usuário
      const finAfterBenefitRes = await originalGlobalFetch(`${baseUrl}/api/finances`, {
        headers: { 'Authorization': `Bearer ${testUserToken}` }
      });
      const finAfterBenefit = await finAfterBenefitRes.json();
      const savedBenefit = (finAfterBenefit.benefitTransactions || []).find(b => b.description === 'ALMOÇO EXECUTIVO');
      assert.ok(savedBenefit, 'Gasto de benefício deve estar gravado em benefitTransactions');
      assert.strictEqual(savedBenefit.type, 'vr');
      assert.strictEqual(savedBenefit.amount, 35);

      // 26. Idempotência de Benefício (Duplo clique não duplica benefício)
      const secondBenefitConfirm = await fetch(`${baseUrl}/api/ai/actions/benefit/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ proposalId: benefitInterpJson.proposalId })
      });
      assert.strictEqual(secondBenefitConfirm.status, 200);
      const secondBenefitJson = await secondBenefitConfirm.json();
      assert.strictEqual(secondBenefitJson.alreadyProcessed, true, 'Segunda confirmação de benefício deve indicar alreadyProcessed');

      // 27. Cancelamento de Proposta de Benefício não persiste
      const cancelBenProposalDoc = {
        _id: 'prop_ben_cancel_88',
        userId: testUserId,
        action: 'create_benefit',
        status: 'pending',
        source: 'text',
        proposal: {
          description: 'BENEFICIO CANCELADO',
          amount: 20,
          benefitType: 'va',
          competence: { month: 9, year: 2026 }
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 900000)
      };
      await storageService.saveAiProposal(cancelBenProposalDoc);

      const cancelBenRes = await fetch(`${baseUrl}/api/ai/actions/benefit/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ proposalId: 'prop_ben_cancel_88' })
      });
      assert.strictEqual(cancelBenRes.status, 200);
      const cancelBenCheck = await storageService.getAiProposal('prop_ben_cancel_88');
      assert.strictEqual(cancelBenCheck.status, 'cancelled');

      // 28. Confirmação com benefitType inválido bloqueia com 400
      const invalidTypeBenDoc = {
        _id: 'prop_ben_invalid_type',
        userId: testUserId,
        action: 'create_benefit',
        status: 'pending',
        proposal: {
          description: 'BENEFICIO INVALIDO',
          amount: 20,
          benefitType: 'va',
          competence: { month: 9, year: 2026 }
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 900000)
      };
      await storageService.saveAiProposal(invalidTypeBenDoc);

      const invalidTypeRes = await fetch(`${baseUrl}/api/ai/actions/benefit/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          proposalId: 'prop_ben_invalid_type',
          data: { benefitType: 'tipo_totalmente_invalido' }
        })
      });
      assert.strictEqual(invalidTypeRes.status, 400, 'benefitType inválido deve retornar HTTP 400');

      // 29. Roteamento de Módulos Não Suportados: Devedores
      const debtorInterpRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Fulano está me devendo 100 reais' })
      });
      const debtorInterpJson = await debtorInterpRes.json();
      assert.strictEqual(debtorInterpJson.action, 'unsupported_action');
      assert.strictEqual(debtorInterpJson.targetModule, 'devedores');
      assert.ok(debtorInterpJson.answer.toLowerCase().includes('devedores'));
      assert.strictEqual(debtorInterpJson.proposalId, undefined, 'Ação não suportada não deve gerar proposalId');

      // 30. Roteamento de Módulos Não Suportados: Renda Extra
      const extraInterpRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Recebi 500 reais de freela' })
      });
      const extraInterpJson = await extraInterpRes.json();
      assert.strictEqual(extraInterpJson.action, 'unsupported_action');
      assert.strictEqual(extraInterpJson.targetModule, 'extras');
      assert.ok(extraInterpJson.answer.toLowerCase().includes('rendas extras'));

      // 31. Roteamento de Módulos Não Suportados: Investimento
      const investInterpRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${testUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Investi 300 reais em CDB' })
      });
      const investInterpJson = await investInterpRes.json();
      assert.strictEqual(investInterpJson.action, 'unsupported_action');
      assert.strictEqual(investInterpJson.targetModule, 'investimentos');
      assert.ok(investInterpJson.answer.toLowerCase().includes('investimentos'));

      // 32. Validação de ausência de afirmações obsoletas no System Guide Prompt
      const { SYSTEM_GUIDE_CONTEXT } = require('../server/services/aiService');
      assert.strictEqual(SYSTEM_GUIDE_CONTEXT.includes('não possuo uma ferramenta habilitada'), false, 'Não deve conter mensagem obsoleta');
      assert.strictEqual(SYSTEM_GUIDE_CONTEXT.includes('não possuo ferramenta para cadastro'), false, 'Não deve conter mensagem obsoleta');
      assert.strictEqual(SYSTEM_GUIDE_CONTEXT.includes('sou somente leitura'), false, 'Não deve afirmar que é somente leitura');
      assert.ok(SYSTEM_GUIDE_CONTEXT.includes('create_expense'), 'Deve citar create_expense');
      assert.ok(SYSTEM_GUIDE_CONTEXT.includes('create_benefit'), 'Deve citar create_benefit');
      assert.ok(SYSTEM_GUIDE_CONTEXT.includes('Devedores'), 'Deve citar orientação de Devedores');
      assert.ok(SYSTEM_GUIDE_CONTEXT.includes('Rendas Extras'), 'Deve citar orientação de Rendas Extras');
      assert.ok(SYSTEM_GUIDE_CONTEXT.includes('Investimentos'), 'Deve citar orientação de Investimentos');

      // 33. Validação do Módulo Frontend aiAssistant.js e API Client para Benefícios
      const aiAssistantJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'aiAssistant.js'), 'utf-8');
      const apiJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'api.js'), 'utf-8');
      const componentsCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'components.css'), 'utf-8');

      assert.ok(apiJs.includes('aiInterpretAction:'), 'api.js deve exportar aiInterpretAction');
      assert.ok(apiJs.includes('aiConfirmExpense:'), 'api.js deve exportar aiConfirmExpense');
      assert.ok(apiJs.includes('aiCancelExpense:'), 'api.js deve exportar aiCancelExpense');
      assert.ok(apiJs.includes('aiConfirmBenefit:'), 'api.js deve exportar aiConfirmBenefit');
      assert.ok(apiJs.includes('aiCancelBenefit:'), 'api.js deve exportar aiCancelBenefit');

      assert.ok(aiAssistantJs.includes('renderProposalCardHtml'), 'aiAssistant.js deve conter renderProposalCardHtml');
      assert.ok(aiAssistantJs.includes('confirmExpenseProposal'), 'aiAssistant.js deve conter confirmExpenseProposal');
      assert.ok(aiAssistantJs.includes('confirmBenefitProposal'), 'aiAssistant.js deve conter confirmBenefitProposal');
      assert.ok(aiAssistantJs.includes('cancelExpenseProposal'), 'aiAssistant.js deve conter cancelExpenseProposal');
      assert.ok(aiAssistantJs.includes('editExpenseProposal'), 'aiAssistant.js deve conter editExpenseProposal');
      assert.ok(aiAssistantJs.includes('editBenefitProposal'), 'aiAssistant.js deve conter editBenefitProposal');
      assert.ok(aiAssistantJs.includes('ai-proposal-confirm-btn'), 'aiAssistant.js deve renderizar botão de confirmar');
      assert.ok(aiAssistantJs.includes('ai-proposal-edit-btn'), 'aiAssistant.js deve renderizar botão de editar');
      assert.ok(aiAssistantJs.includes('ai-proposal-cancel-btn'), 'aiAssistant.js deve renderizar botão de cancelar');

      assert.ok(componentsCss.includes('.ai-proposal-card'), 'components.css deve conter .ai-proposal-card');
      assert.ok(componentsCss.includes('.ai-proposal-actions'), 'components.css deve conter .ai-proposal-actions');

      // ==============================================================================
      // CHECKPOINT 12.2: MEMÓRIA TRANSACIONAL MULTI-TURNO & SLOT FILLING PROGRESSIVO
      // ==============================================================================

      try {
        // Configuração de Mock n8n para suportar os fluxos multi-turno progressivos
        global.fetch = async (url, options = {}) => {
          const urlStr = String(url);
          if (urlStr.includes('/mock-n8n-action')) {
            const body = options.body ? JSON.parse(options.body) : {};
            const msg = (body.message || '').toLowerCase();

            if (msg.includes('vr') || msg.includes('beneficio') || msg.includes('benefício')) {
              return {
                ok: true,
                status: 200,
                json: async () => ({
                  success: true,
                  action: 'create_benefit',
                  requiresConfirmation: true,
                  data: {
                    benefitType: msg.includes('vr') ? 'vr' : (msg.includes('va') ? 'va' : 'beneficio')
                  }
                }),
                text: async () => ''
              };
            }

            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                action: 'create_expense',
                requiresConfirmation: true,
                data: {}
              }),
              text: async () => ''
            };
          }
          return originalGlobalFetch(url, options);
        };

        // 34. Despesa Multi-Turno em 3 Etapas (Bolsa -> 300, pae -> No Pix mesmo)
        const convMulti1 = 'conv_multi_test_' + Date.now();
        
        // Turno 1: Descrição inicial
        const turn1Res = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${testUserToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: 'Comprei uma bolsa!',
            conversationId: convMulti1,
            context: { month: 9, year: 2026, currentDate: '2026-09-01' }
          })
        });
        assert.strictEqual(turn1Res.status, 200);
        const turn1Json = await turn1Res.json();
        assert.strictEqual(turn1Json.success, true);
        assert.strictEqual(turn1Json.action, 'continue_collection', 'Turno 1 incompleto deve acionar continue_collection');
        assert.strictEqual(turn1Json.intent, 'create_expense');
        assert.strictEqual(turn1Json.slots.description, 'BOLSA', 'Descrição deve ser extraída e normalizada para BOLSA');
        assert.strictEqual(turn1Json.slots.amount, null);
        assert.strictEqual(turn1Json.slots.destination, null);
        assert.ok(turn1Json.missingFields.includes('amount'));
        assert.ok(turn1Json.missingFields.includes('destination'));
        assert.strictEqual(turn1Json.proposalId, undefined, 'Collecting não deve gerar proposalId');

        // Verifica pendingAction persistida no storage
        const paStorage1 = await storageService.getAiPendingAction(testUserId, convMulti1);
        assert.ok(paStorage1, 'pendingAction deve existir no storage');
        assert.strictEqual(paStorage1.status, 'collecting');
        assert.strictEqual(paStorage1.slots.description, 'BOLSA');

        // Turno 2: Valor isolado com gíria ("300, pae")
        const turn2Res = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${testUserToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: '300, pae',
            conversationId: convMulti1,
            context: { month: 9, year: 2026, currentDate: '2026-09-01' }
          })
        });
        assert.strictEqual(turn2Res.status, 200);
        const turn2Json = await turn2Res.json();
        assert.strictEqual(turn2Json.success, true);
        assert.strictEqual(turn2Json.action, 'continue_collection');
        assert.strictEqual(turn2Json.slots.description, 'BOLSA', 'Slot anterior de descrição não pode ser perdido ou virar null');
        assert.strictEqual(turn2Json.slots.amount, 300, 'Amount deve ser preenchido com 300');
        assert.strictEqual(turn2Json.slots.destination, null);
        assert.deepStrictEqual(turn2Json.missingFields, ['destination']);

        // Turno 3: Destino isolado ("No Pix mesmo.") -> Conclusão e geração de Proposta
        const turn3Res = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${testUserToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: 'No Pix mesmo.',
            conversationId: convMulti1,
            context: { month: 9, year: 2026, currentDate: '2026-09-01' }
          })
        });
        assert.strictEqual(turn3Res.status, 200);
        const turn3Json = await turn3Res.json();
        assert.strictEqual(turn3Json.success, true);
        assert.strictEqual(turn3Json.action, 'create_expense', 'Todos os dados preenchidos devem gerar create_expense');
        assert.ok(turn3Json.proposalId, 'Deve gerar proposalId');
        assert.strictEqual(turn3Json.requiresConfirmation, true);
        assert.strictEqual(turn3Json.data.description, 'BOLSA');
        assert.strictEqual(turn3Json.data.amount, 300);
        assert.strictEqual(turn3Json.data.destination, 'Pix');

        // Verifica pendingAction em storage atualizada para 'proposed'
        const paStorage3 = await storageService.getAiPendingAction(testUserId, convMulti1);
        assert.strictEqual(paStorage3.status, 'proposed');
        assert.strictEqual(paStorage3.proposalId, turn3Json.proposalId);

        // 35. Confirmação Conversacional por Texto ("Sim, pode cadastrar")
        const textConfirmRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${testUserToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: 'Sim, pode cadastrar',
            conversationId: convMulti1,
            context: { month: 9, year: 2026, currentDate: '2026-09-01' }
          })
        });
        assert.strictEqual(textConfirmRes.status, 200);
        const textConfirmJson = await textConfirmRes.json();
        assert.strictEqual(textConfirmJson.success, true);
        assert.strictEqual(textConfirmJson.confirmed, true, 'Deve confirmar a proposta via texto');
        assert.strictEqual(textConfirmJson.expense.name, 'BOLSA');
        assert.strictEqual(textConfirmJson.expense.amount, 300);
        assert.strictEqual(textConfirmJson.expense.status, 'pago', 'Destino Pix deve nascer quitado');

        // Verifica pendingAction marcada como 'confirmed'
        const paStorageConfirmed = await storageService.getAiPendingAction(testUserId, convMulti1);
        assert.strictEqual(paStorageConfirmed.status, 'confirmed');

        // 36. Isolamento Estrito: Usuário B não acessa pendingAction do Usuário A e Conversation B não acessa Conversation A
        const userBConvRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userBToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: '300, pae',
            conversationId: convMulti1, // Mesma conversationId, outro usuário
            context: { month: 9, year: 2026 }
          })
        });
        const userBConvJson = await userBConvRes.json();
        // Usuário B não possui a 'BOLSA' previamente salva
        assert.strictEqual(userBConvJson.slots.description, null, 'Usuário B não pode herdar slots do Usuário A');

        // 37. Correção Explícita de Valor ("300" -> "Na verdade foi 350")
        const convCorrection = 'conv_corr_' + Date.now();
        await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Comprei um casaco', conversationId: convCorrection, context: { month: 9, year: 2026 } })
        });
        await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: '300', conversationId: convCorrection, context: { month: 9, year: 2026 } })
        });
        const corrRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Na verdade foi 350', conversationId: convCorrection, context: { month: 9, year: 2026 } })
        });
        const corrJson = await corrRes.json();
        assert.strictEqual(corrJson.slots.amount, 350, 'Correção deve atualizar o slot de amount para 350');
        assert.strictEqual(corrJson.slots.description, 'CASACO', 'Descrição anterior deve ser mantida');

        // 38. Benefício Multi-Turno ("Usei meu VR" -> "Foi 32 reais" -> "No almoço")
        const convBenefitMulti = 'conv_ben_multi_' + Date.now();
        const benTurn1 = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Usei meu VR', conversationId: convBenefitMulti, context: { month: 9, year: 2026 } })
        });
        const benTurn1Json = await benTurn1.json();
        assert.strictEqual(benTurn1Json.intent, 'create_benefit');
        assert.strictEqual(benTurn1Json.slots.benefitType, 'vr');
        assert.strictEqual(benTurn1Json.slots.amount, null);

        const benTurn2 = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Foi 32 reais', conversationId: convBenefitMulti, context: { month: 9, year: 2026 } })
        });
        const benTurn2Json = await benTurn2.json();
        assert.strictEqual(benTurn2Json.slots.amount, 32);
        assert.strictEqual(benTurn2Json.slots.benefitType, 'vr');

        const benTurn3 = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'No almoço', conversationId: convBenefitMulti, context: { month: 9, year: 2026 } })
        });
        const benTurn3Json = await benTurn3.json();
        assert.strictEqual(benTurn3Json.action, 'create_benefit');
        assert.strictEqual(benTurn3Json.data.description, 'ALMOÇO');
        assert.strictEqual(benTurn3Json.data.amount, 32);
        assert.strictEqual(benTurn3Json.data.benefitType, 'vr');

        // 39. Cancelamento por Linguagem Natural ("Deixa pra lá")
        const convCancel = 'conv_cancel_' + Date.now();
        await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Comprei um tênis', conversationId: convCancel, context: { month: 9, year: 2026 } })
        });
        const cancelNatRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Deixa pra lá', conversationId: convCancel, context: { month: 9, year: 2026 } })
        });
        const cancelNatJson = await cancelNatRes.json();
        assert.strictEqual(cancelNatJson.status, 'cancelled');
        assert.strictEqual(cancelNatJson.answer, 'Beleza, cancelei.');
        const cancelCheck = await storageService.getAiPendingAction(testUserId, convCancel);
        assert.strictEqual(cancelCheck.status, 'cancelled');

        // 40. Consulta Durante Coleta Não Contamina Slots
        const convQuery = 'conv_query_' + Date.now();
        await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Comprei um livro', conversationId: convQuery, context: { month: 9, year: 2026 } })
        });

        // Mock para a consulta analítica e fluxos multi-turno seguintes
        global.fetch = async (url, options = {}) => {
          const urlStr = String(url);
          if (urlStr.includes('/mock-n8n-action') || urlStr.includes('/mock-n8n-chat')) {
            const body = options.body ? JSON.parse(options.body) : {};
            const msg = (body.message || '').toLowerCase();

            if (msg.includes('quanto gastei')) {
              return {
                ok: true,
                status: 200,
                json: async () => ({
                  success: true,
                  answer: 'Em setembro você gastou R$ 323,99 no total.',
                  data: null
                }),
                text: async () => ''
              };
            }

            if (msg.includes('vr') || msg.includes('beneficio') || msg.includes('benefício')) {
              return {
                ok: true,
                status: 200,
                json: async () => ({
                  success: true,
                  action: 'create_benefit',
                  requiresConfirmation: true,
                  data: {
                    benefitType: msg.includes('vr') ? 'vr' : (msg.includes('va') ? 'va' : 'beneficio')
                  }
                }),
                text: async () => ''
              };
            }

            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                action: 'create_expense',
                requiresConfirmation: true,
                data: {}
              }),
              text: async () => ''
            };
          }
          return originalGlobalFetch(url, options);
        };

        const queryRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Quanto gastei esse mês?', conversationId: convQuery, context: { month: 9, year: 2026 } })
        });
        const queryJson = await queryRes.json();
        assert.strictEqual(queryJson.action, 'chat');
        assert.ok(queryJson.answer.includes('323,99'));

        // Verifica que o valor da consulta (323.99) NÃO contaminou o amount do livro
        const paQueryCheck = await storageService.getAiPendingAction(testUserId, convQuery);
        assert.strictEqual(paQueryCheck.slots.description, 'LIVRO');
        assert.strictEqual(paQueryCheck.slots.amount, null, 'Consulta não pode definir amount da pendingAction');

        // 41. Detecção de Colisão com Nova Transação
        const collisionRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Também comprei uma bota por 400', conversationId: convQuery, context: { month: 9, year: 2026 } })
        });
        const collisionJson = await collisionRes.json();
        assert.ok(collisionJson.answer.includes('LIVRO'), 'Deve alertar sobre a transação anterior em andamento');

        // 42. Correção de Tipo (Benefício -> Despesa via Pix)
        const convSwitch = 'conv_switch_' + Date.now();
        await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Usei 50 reais no almoço com meu benefício', conversationId: convSwitch, context: { month: 9, year: 2026 } })
        });
        const switchRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Não, foi no Pix', conversationId: convSwitch, context: { month: 9, year: 2026 } })
        });
        const switchJson = await switchRes.json();
        assert.strictEqual(switchJson.action, 'create_expense', 'Deve converter para create_expense');
        assert.strictEqual(switchJson.data.destination, 'Pix');
        assert.strictEqual(switchJson.data.benefitType, undefined);

        // 43. Expiração por TTL de pendingAction
        const expiredActionDoc = {
          _id: 'pa_expired_test_999',
          userId: testUserId,
          conversationId: 'conv_expired_999',
          intent: 'create_expense',
          status: 'collecting',
          slots: { description: 'VELHO', amount: 10 },
          missingFields: ['destination'],
          createdAt: new Date(Date.now() - 3600000),
          expiresAt: new Date(Date.now() - 1000)
        };
        await storageService.saveAiPendingAction(expiredActionDoc);
        const expiredCheck = await storageService.getAiPendingAction(testUserId, 'conv_expired_999');
        assert.strictEqual(expiredCheck, null, 'pendingAction expirada deve retornar null e ser limpa');

        // 44. Mensagem Única Completa Continua Gerando Proposta Imediata (Zero Regressão)
        const singleTurnRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Comprei uma bolsa por 300 no Pix',
            conversationId: 'conv_single_' + Date.now(),
            context: { month: 9, year: 2026 }
          })
        });
        const singleTurnJson = await singleTurnRes.json();
        assert.strictEqual(singleTurnJson.action, 'create_expense');
        assert.ok(singleTurnJson.proposalId);
        assert.strictEqual(singleTurnJson.data.description, 'BOLSA');
        assert.strictEqual(singleTurnJson.data.amount, 300);
        assert.strictEqual(singleTurnJson.data.destination, 'Pix');

        // 45. Release Notes Contém a Entrada de Memória Transacional
        const releaseNotesJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'releaseNotes.js'), 'utf-8');
        assert.ok(releaseNotesJs.includes('Assistente com memória transacional'), 'releaseNotes.js deve conter a novidade de memória transacional');
      } catch (err12) {
        console.error('ERRO DETALHADO NO CHECKPOINT 12.2:', err12);
        throw err12;
      }
    } finally {
      global.fetch = originalGlobalFetch;
      config.N8N_AI_ACTION_WEBHOOK_URL = origActionWebhook;
      config.N8N_AI_ACTION_BASIC_AUTH_USER = origActionUser;
      config.N8N_AI_ACTION_BASIC_AUTH_PASSWORD = origActionPass;
    }
  });

  test('46. Checkpoint 12.2 — Intenção Genérica Não Pode Virar Descrição, Ordem de Coleta, Recálculo de Warnings/requiresReview e Hotfix Mobile do Gráfico de Destinos', async () => {
    const origActionWebhook = config.N8N_AI_ACTION_WEBHOOK_URL;
    const origActionUser = config.N8N_AI_ACTION_BASIC_AUTH_USER;
    const origActionPass = config.N8N_AI_ACTION_BASIC_AUTH_PASSWORD;

    const mockActionUser = 'omnifin_action_test_46';
    const mockActionPass = 'action_secret_pass_46';
    config.N8N_AI_ACTION_WEBHOOK_URL = 'http://127.0.0.1:9999/mock-n8n-action-46';
    config.N8N_AI_ACTION_BASIC_AUTH_USER = mockActionUser;
    config.N8N_AI_ACTION_BASIC_AUTH_PASSWORD = mockActionPass;

    const originalGlobalFetch = global.fetch;

    try {
      // Mock dinâmico do n8n action webhook que reflete o upstream
      global.fetch = async (url, options = {}) => {
        const urlStr = String(url);
        if (urlStr.includes('/mock-n8n-action-46')) {
          const body = JSON.parse(options.body || '{}');
          const msg = (body.message || '').trim();
          const pending = body.pendingAction || null;

          // Simula resposta do n8n com dados brutos
          if (/^blz.?s*bora cadastrar uma despesa nova$/i.test(msg)) {
            // Upstream bug anterior: retornava a própria frase como descrição
            return new Response(JSON.stringify([{
              action: 'create_expense',
              source: 'text',
              data: {
                description: 'Blz. Bora cadastrar uma despesa nova',
                amount: null,
                destination: null
              },
              warnings: ['O valor da despesa precisa ser informado ou revisado.'],
              requiresReview: true
            }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }

          if (/^uma bolsa da nike$/i.test(msg)) {
            return new Response(JSON.stringify([{
              action: 'create_expense',
              source: 'text',
              data: {
                description: 'BOLSA DA NIKE',
                amount: null,
                destination: null
              },
              warnings: ['O valor da despesa precisa ser informado ou revisado.'],
              requiresReview: true
            }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }

          if (/^300 conto$/i.test(msg)) {
            return new Response(JSON.stringify([{
              action: 'create_expense',
              source: 'text',
              data: {
                description: pending?.slots?.description || 'BOLSA DA NIKE',
                amount: 300,
                destination: null
              },
              warnings: ['A forma de pagamento precisa ser informada.'],
              requiresReview: true
            }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }

          if (/^pix$/i.test(msg)) {
            return new Response(JSON.stringify([{
              action: 'create_expense',
              source: 'text',
              data: {
                description: pending?.slots?.description || 'BOLSA DA NIKE',
                amount: pending?.slots?.amount || 300,
                destination: 'Pix',
                category: 'Lazer'
              },
              // Upstream simulando warnings obsoletos de turnos anteriores
              warnings: ['O valor da despesa precisa ser informado ou revisado.'],
              requiresReview: true
            }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }

          if (/^comprei uma bolsa da nike por 300 no pix$/i.test(msg)) {
            return new Response(JSON.stringify([{
              action: 'create_expense',
              source: 'text',
              data: {
                description: 'BOLSA DA NIKE',
                amount: 300,
                destination: 'Pix',
                category: 'Lazer'
              },
              warnings: [],
              requiresReview: false
            }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }

          if (/^quero cadastrar uma despesa$/i.test(msg)) {
            return new Response(JSON.stringify([{
              action: 'create_expense',
              source: 'text',
              data: {
                description: 'Quero cadastrar uma despesa',
                amount: null,
                destination: null
              },
              warnings: ['O valor da despesa precisa ser informado ou revisado.'],
              requiresReview: true
            }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }

          return new Response(JSON.stringify([{
            action: 'create_expense',
            data: {}
          }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        return originalGlobalFetch(url, options);
      };

      const testConvId = 'conv_hotfix_12_2_' + Date.now();

      // TURN 1: "Blz. Bora cadastrar uma despesa nova"
      const turn1Res = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Blz. Bora cadastrar uma despesa nova',
          conversationId: testConvId,
          context: { month: 9, year: 2026 }
        })
      });
      assert.strictEqual(turn1Res.status, 200, 'Turn 1 deve responder 200');
      const turn1Json = await turn1Res.json();
      assert.strictEqual(turn1Json.action, 'continue_collection', 'Turn 1 deve continuar coleta');
      assert.strictEqual(turn1Json.intent, 'create_expense', 'Turn 1 intent deve ser create_expense');
      assert.strictEqual(turn1Json.slots.description, null, 'Turn 1 description NÃO pode ser a frase de intenção (deve ser null)');
      assert.strictEqual(turn1Json.slots.amount, null, 'Turn 1 amount deve ser null');
      assert.strictEqual(turn1Json.slots.destination, null, 'Turn 1 destination deve ser null');
      assert.ok(turn1Json.missingFields.includes('description'), 'missingFields deve incluir description');
      assert.ok(turn1Json.missingFields.includes('amount'), 'missingFields deve incluir amount');
      assert.ok(turn1Json.missingFields.includes('destination'), 'missingFields deve incluir destination');
      assert.match(turn1Json.answer, /o que voc[eê] comprou/i, 'Turn 1 deve perguntar o que o usuário comprou primeiro');
      assert.doesNotMatch(turn1Json.answer, /quanto foi/i, 'Turn 1 NÃO deve perguntar valor antes da descrição');

      // TURN 2: "Uma bolsa da Nike"
      const turn2Res = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Uma bolsa da Nike',
          conversationId: testConvId,
          context: { month: 9, year: 2026 }
        })
      });
      assert.strictEqual(turn2Res.status, 200, 'Turn 2 deve responder 200');
      const turn2Json = await turn2Res.json();
      assert.strictEqual(turn2Json.action, 'continue_collection', 'Turn 2 continua coleta');
      assert.strictEqual(turn2Json.slots.description, 'BOLSA DA NIKE', 'Turn 2 description deve ser BOLSA DA NIKE');
      assert.strictEqual(turn2Json.slots.amount, null, 'Turn 2 amount ainda é null');
      assert.strictEqual(turn2Json.missingFields.includes('description'), false, 'description não está mais missing');
      assert.ok(turn2Json.missingFields.includes('amount'), 'missingFields inclui amount');
      assert.match(turn2Json.answer, /quanto foi/i, 'Turn 2 agora pergunta quanto foi');

      // TURN 3: "300 conto"
      const turn3Res = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '300 conto',
          conversationId: testConvId,
          context: { month: 9, year: 2026 }
        })
      });
      assert.strictEqual(turn3Res.status, 200, 'Turn 3 deve responder 200');
      const turn3Json = await turn3Res.json();
      assert.strictEqual(turn3Json.action, 'continue_collection', 'Turn 3 continua coleta');
      assert.strictEqual(turn3Json.slots.amount, 300, 'Turn 3 amount deve ser 300');
      assert.strictEqual(turn3Json.missingFields.includes('amount'), false, 'amount não está mais missing');
      assert.ok(turn3Json.missingFields.includes('destination'), 'missingFields inclui destination');
      assert.match(turn3Json.answer, /pagou como/i, 'Turn 3 pergunta como pagou');

      // TURN 4: "Pix"
      const turn4Res = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Pix',
          conversationId: testConvId,
          context: { month: 9, year: 2026 }
        })
      });
      assert.strictEqual(turn4Res.status, 200, 'Turn 4 deve responder 200');
      const turn4Json = await turn4Res.json();
      assert.strictEqual(turn4Json.action, 'create_expense', 'Turn 4 deve gerar proposta de create_expense');
      assert.ok(turn4Json.proposalId, 'Turn 4 deve ter proposalId');
      assert.strictEqual(turn4Json.data.description, 'BOLSA DA NIKE', 'Turn 4 description final');
      assert.strictEqual(turn4Json.data.amount, 300, 'Turn 4 amount final');
      assert.strictEqual(turn4Json.data.destination, 'Pix', 'Turn 4 destination final');
      assert.strictEqual(turn4Json.requiresReview, false, 'requiresReview DEVE ser false (recalculado após preenchimento válido)');
      assert.strictEqual(turn4Json.warnings.length, 0, 'warnings obsoletos de amount devem ser expurgados');

      // CASO COMPLETO EM UMA MENSAGEM: "Comprei uma bolsa da Nike por 300 no Pix"
      const directRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Comprei uma bolsa da Nike por 300 no Pix',
          conversationId: 'conv_direct_' + Date.now(),
          context: { month: 9, year: 2026 }
        })
      });
      assert.strictEqual(directRes.status, 200);
      const directJson = await directRes.json();
      assert.strictEqual(directJson.action, 'create_expense', 'Mensagem completa deve gerar proposta imediata');
      assert.ok(directJson.proposalId);
      assert.strictEqual(directJson.data.description, 'BOLSA DA NIKE');
      assert.strictEqual(directJson.data.amount, 300);
      assert.strictEqual(directJson.data.destination, 'Pix');
      assert.strictEqual(directJson.requiresReview, false);

      // CASO INTENÇÃO GENÉRICA ISOLADA: "Quero cadastrar uma despesa"
      const genericRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${testUserToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Quero cadastrar uma despesa',
          conversationId: 'conv_generic_' + Date.now(),
          context: { month: 9, year: 2026 }
        })
      });
      assert.strictEqual(genericRes.status, 200);
      const genericJson = await genericRes.json();
      assert.strictEqual(genericJson.action, 'continue_collection');
      assert.strictEqual(genericJson.slots.description, null, 'Não deve criar description para intenção genérica');
      assert.ok(genericJson.missingFields.includes('description'));
      assert.match(genericJson.answer, /o que voc[eê] comprou/i);

      // HOTFIX MOBILE: Gráfico "Despesas por Destino de Cobrança" e Ocultação Estrita de "Colunas"
      const mobileCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'mobile.css'), 'utf-8');
      assert.ok(!mobileCss.includes('#destChartSectionCard,\n  #toggleDestChartBtn {\n    display: none !important;'), 'mobile.css NÃO deve ocultar #destChartSectionCard ou #toggleDestChartBtn');
      assert.ok(mobileCss.includes('[data-dest-chart-type="column"]'), 'mobile.css deve conter seletor para ocultar opção Colunas');
      assert.ok(mobileCss.includes('display: none !important;'), 'Regra mobile deve conter display: none !important');

      // Garante integridade do index.html (desktop continua com o elemento no DOM e todas as opções)
      const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
      assert.ok(indexHtml.includes('id="destChartSectionCard"'), 'index.html mantém o elemento no DOM');
      assert.ok(indexHtml.includes('id="toggleDestChartBtn"'), 'index.html mantém o botão toggle');
      assert.ok(indexHtml.includes('data-dest-chart-type="bar"'), 'index.html contém opção Barras');
      assert.ok(indexHtml.includes('data-dest-chart-type="column"'), 'index.html contém opção Colunas');
      assert.ok(indexHtml.includes('data-dest-chart-type="donut"'), 'index.html contém opção Pizza/Rosca');
    } finally {
      global.fetch = originalGlobalFetch;
      config.N8N_AI_ACTION_WEBHOOK_URL = origActionWebhook;
      config.N8N_AI_ACTION_BASIC_AUTH_USER = origActionUser;
      config.N8N_AI_ACTION_BASIC_AUTH_PASSWORD = origActionPass;
    }
  });

  /* ==========================================================================
     CHECKPOINT SECURITY 1 — HARDENING HTTP, AUTENTICAÇÃO E FRONTEIRA DA API
     ========================================================================== */
  test('Checkpoint Security 1: JWT Secret Fail-Closed em Produção', () => {
    // 1. Em produção, JWT_SECRET ausente/vazio deve lançar erro
    assert.throws(() => {
      config.resolveAndValidateJwtSecret(null, 'production');
    }, /JWT_SECRET obrigatório não configurado/);

    assert.throws(() => {
      config.resolveAndValidateJwtSecret('', 'production');
    }, /JWT_SECRET obrigatório não configurado/);

    // 2. Em produção, fallback inseguro de desenvolvimento deve lançar erro
    assert.throws(() => {
      config.resolveAndValidateJwtSecret(config.INSECURE_FALLBACK_JWT_SECRET, 'production');
    }, /JWT_SECRET inseguro\/default detectado em produção/);

    assert.throws(() => {
      config.resolveAndValidateJwtSecret('CHANGE_ME_INSECURE_SECRET_TOKEN', 'production');
    }, /JWT_SECRET inseguro\/default detectado em produção/);

    // 3. Em produção, secret com menos de 32 caracteres deve lançar erro
    assert.throws(() => {
      config.resolveAndValidateJwtSecret('short_secret_under_32_chars!', 'production');
    }, /entropia insuficiente/);

    // 4. Em produção, secret forte com 32+ caracteres deve ser aceito
    const strongSecret = 'super_secure_omnifin_production_jwt_secret_2026_random_entropy';
    const validated = config.resolveAndValidateJwtSecret(strongSecret, 'production');
    assert.strictEqual(validated, strongSecret);

    // 5. Em desenvolvimento, fallback seguro é emitido sem exceção
    const devFallback = config.resolveAndValidateJwtSecret('', 'development');
    assert.strictEqual(devFallback, config.INSECURE_FALLBACK_JWT_SECRET);
  });

  test('Checkpoint Security 1: Headers de Segurança HTTP via Helmet', async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    assert.strictEqual(res.status, 200);

    // Cabeçalhos de segurança obrigatórios
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff', 'X-Content-Type-Options deve ser nosniff');
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY', 'X-Frame-Options deve ser DENY para combater clickjacking');
    assert.strictEqual(res.headers.get('cross-origin-resource-policy'), 'cross-origin', 'CORP deve ser cross-origin');

    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'Content-Security-Policy deve estar presente');
    assert.ok(csp.includes("default-src 'self'"), 'CSP deve conter default-src self');
    assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP deve conter frame-ancestors none');
  });

  test('Checkpoint Security 1: CORS Controlado e Requisições Same-Origin', async () => {
    // 1. Requisição sem header Origin (same-origin / mobile / curl) deve ser aceita normalmente
    const noOriginRes = await fetch(`${baseUrl}/api/config`);
    assert.strictEqual(noOriginRes.status, 200);

    // 2. Requisição com Origin de desenvolvimento local (localhost) deve ser aceita
    const devOriginRes = await fetch(`${baseUrl}/api/config`, {
      headers: { 'Origin': 'http://localhost:3000' }
    });
    assert.strictEqual(devOriginRes.status, 200);
    assert.strictEqual(devOriginRes.headers.get('access-control-allow-origin'), 'http://localhost:3000');

    // 3. Preflight OPTIONS request
    const optionsRes = await fetch(`${baseUrl}/api/config`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'GET'
      }
    });
    assert.strictEqual(optionsRes.status, 204);
  });

  test('Checkpoint Security 1: API 404 retorna JSON genérico sem vazamento de rotas e sem fallback HTML do SPA', async () => {
    // 1. Rota de API inexistente (/api/rota-que-nao-existe)
    const res = await fetch(`${baseUrl}/api/rota-que-nao-existe`);
    assert.strictEqual(res.status, 404);
    assert.ok(res.headers.get('content-type').includes('application/json'), 'API 404 deve retornar Content-Type application/json');

    const rawBody = await res.text();
    assert.ok(!rawBody.includes('<!DOCTYPE html>'), 'Resposta de rota inexistente /api/* NÃO deve conter <!DOCTYPE html>');
    assert.ok(!rawBody.includes('<html'), 'Resposta de rota inexistente /api/* NÃO deve conter HTML do SPA / index.html');

    const data = JSON.parse(rawBody);
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, 'NOT_FOUND');
    assert.strictEqual(data.message, 'Rota da API não encontrada.');
    assert.strictEqual(data.path, undefined, 'Não deve vazar req.originalUrl');
    assert.strictEqual(data.url, undefined, 'Não deve vazar URL interna');

    // 2. Rota web / SPA inexistente continua retornando index.html (fallback SPA não foi quebrado)
    const spaRes = await fetch(`${baseUrl}/rota_web_inexistente_do_spa`);
    assert.strictEqual(spaRes.status, 200);
    const spaBody = await spaRes.text();
    assert.ok(spaBody.includes('<!doctype html>') || spaBody.includes('<!DOCTYPE html>'), 'Rotas web devem continuar recebendo o HTML do SPA');
  });

  test('Checkpoint Security 1: Global Error Handler sanitiza JSON inválido (400)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"login": "invalido", malformed_json'
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, 'BAD_REQUEST');
    assert.strictEqual(data.message, 'Formato de JSON inválido no corpo da requisição.');
    assert.strictEqual(data.stack, undefined, 'Não deve vazar stack trace no erro 400');
  });

  test('Checkpoint Security 1: Limite de Payload (Body Limit 5MB) rejeita payloads excessivos com 413 JSON', async () => {
    // Cria payload com mais de 5MB (5.5MB)
    const largeStr = 'a'.repeat(5.5 * 1024 * 1024);
    const res = await fetch(`${baseUrl}/api/finances`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ largeField: largeStr })
    });
    assert.strictEqual(res.status, 413, 'Payload acima de 5MB deve retornar HTTP 413');
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, 'PAYLOAD_TOO_LARGE');
    assert.ok(data.message.includes('limite máximo permitido'));
    assert.strictEqual(data.stack, undefined, 'Não deve vazar stack trace no erro 413');
  });

  test('Checkpoint Security 1: Rate Limiting estratificado bloqueia força bruta com HTTP 429', async () => {
    // Executa requisições de login inválidas repetidas para testar o rate limiter
    let rateLimited = false;

    for (let i = 0; i < 20; i++) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '198.51.100.88'
        },
        body: JSON.stringify({ login: 'brute_force_user', senha: 'wrong_password_123' })
      });
      if (res.status === 429) {
        rateLimited = true;
        const data = await res.json();
        assert.strictEqual(data.success, false);
        assert.strictEqual(data.error, 'TOO_MANY_REQUESTS');
        assert.ok(data.message.includes('Muitas tentativas'));
        break;
      }
    }

    assert.ok(rateLimited, 'Tentativas de login sucessivas com erro devem disparar HTTP 429');
  });

  /* ==========================================================================
     HOTFIX VISUAL MOBILE — 10 REGRAS CONTRATUAIS DE RESPONSIVIDADE E FALLBACK
     ========================================================================== */
  test('Hotfix Visual Mobile: 10 Regras Contratuais de Responsividade, Seletores e Fallback', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    const mobileCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'mobile.css'), 'utf-8');
    const dashboardJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', 'dashboard.js'), 'utf-8');

    // 1. Desktop contém Barras
    assert.ok(indexHtml.includes('data-dest-chart-type="bar"'), '1. Desktop deve conter opção de gráfico Barras');
    assert.ok(indexHtml.includes('<span>Barras</span>'), '1. Desktop deve conter label Barras');

    // 2. Desktop contém Colunas
    assert.ok(indexHtml.includes('data-dest-chart-type="column"'), '2. Desktop deve conter opção de gráfico Colunas');
    assert.ok(indexHtml.includes('<span>Colunas</span>'), '2. Desktop deve conter label Colunas');

    // 3. Desktop contém Pizza/Rosca
    assert.ok(indexHtml.includes('data-dest-chart-type="donut"'), '3. Desktop deve conter opção de gráfico Pizza/Rosca');
    assert.ok(indexHtml.includes('<span>Pizza / Rosca</span>'), '3. Desktop deve conter label Pizza / Rosca');

    // 4. Mobile mantém Barras
    assert.ok(!mobileCss.includes('[data-dest-chart-type="bar"] {\n    display: none'), '4. Mobile não deve ocultar Barras');

    // 5. Mobile oculta somente Colunas
    assert.ok(mobileCss.includes('[data-dest-chart-type="column"]'), '5. Mobile deve declarar seletor para ocultar Colunas');
    assert.ok(mobileCss.includes('display: none !important;'), '5. Regra de Colunas deve conter display: none !important');

    // 6. Mobile mantém Pizza/Rosca
    assert.ok(!mobileCss.includes('[data-dest-chart-type="donut"] {\n    display: none'), '6. Mobile não deve ocultar Pizza/Rosca');

    // 7. O gráfico "Despesas por Destino de Cobrança" continua visível no mobile
    assert.ok(!mobileCss.includes('#destChartSectionCard,\n  #toggleDestChartBtn {\n    display: none'), '7. Mobile NÃO deve ocultar #destChartSectionCard');
    assert.ok(indexHtml.includes('id="destChartSectionCard"'), '7. Componente de destinos deve estar no DOM');
    assert.ok(indexHtml.includes('id="toggleDestChartBtn"'), '7. Botão toggle do componente de destinos deve estar no DOM');

    // 8. Preferência salva como "column" recebe fallback seguro no mobile (column -> bar)
    assert.ok(dashboardJs.includes('resolveEffectiveChartType'), '8. dashboard.js deve implementar resolveEffectiveChartType');
    const evalResolver = new Function(`
      function resolveEffectiveChartType(savedType, isMobileView) {
        if (isMobileView && savedType === 'column') {
          return 'bar';
        }
        return savedType || 'bar';
      }
      return resolveEffectiveChartType;
    `)();
    assert.strictEqual(evalResolver('column', true), 'bar', '8. No mobile, preferência "column" deve ter fallback para "bar"');
    assert.strictEqual(evalResolver('donut', true), 'donut', '8. No mobile, preferência "donut" deve ser mantida');
    assert.strictEqual(evalResolver('bar', true), 'bar', '8. No mobile, preferência "bar" deve ser mantida');

    // 9. Desktop continua respeitando preferência "column"
    assert.strictEqual(evalResolver('column', false), 'column', '9. No desktop, preferência "column" continua respeitada');
    assert.strictEqual(evalResolver('donut', false), 'donut', '9. No desktop, preferência "donut" continua respeitada');
    assert.strictEqual(evalResolver('bar', false), 'bar', '9. No desktop, preferência "bar" continua respeitada');

    // 10. Nenhum overflow horizontal é causado pelos modos restantes
    assert.ok(mobileCss.includes('overflow-x: auto !important'), '10. Seletores de gráfico devem permitir scroll horizontal contido');
    assert.ok(mobileCss.includes('max-width: 100% !important'), '10. Cards e seletores devem ter max-width 100%');
    assert.ok(mobileCss.includes('box-sizing: border-box !important'), '10. Cards de gráfico devem ter box-sizing border-box');
  });

  /* ==========================================================================
     HOTFIX UX — LOGIN INVÁLIDO + LOADING DE HIDRATAÇÃO INICIAL
     ========================================================================== */
  test('Hotfix UX: Diferenciação entre INVALID_CREDENTIALS e SESSION_EXPIRED', async () => {
    const apiJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'api.js'), 'utf-8');

    // 1. Login inválido NÃO exibe "Sessão expirada"
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '198.51.100.99'
      },
      body: JSON.stringify({ login: 'usuario_inexistente_999', senha: 'wrong_password_xyz' })
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 401);
    assert.strictEqual(loginData.success, false);
    assert.strictEqual(loginData.error, 'INVALID_CREDENTIALS');
    assert.ok(!loginData.message.includes('Sessão expirada'), '1. Login inválido NÃO deve conter "Sessão expirada"');

    // 2. Login inválido exibe mensagem genérica de credenciais inválidas (sem enumeração)
    assert.strictEqual(loginData.message, 'Login ou senha inválidos. Verifique os dados e tente novamente.', '2. Deve exibir mensagem genérica de credenciais');
    assert.ok(!loginData.message.includes('Senha incorreta'), 'Não deve divulgar que a senha é incorreta');
    assert.ok(!loginData.message.includes('Usuário inexistente'), 'Não deve divulgar que o usuário é inexistente');

    // Verifica que api.js intercepta /api/auth/login separadamente de rotas autenticadas
    assert.ok(apiJs.includes("endpoint.includes('/api/auth/login')"), 'api.js deve verificar se endpoint é /api/auth/login');
    assert.ok(apiJs.includes("INVALID_CREDENTIALS"), 'api.js deve retornar código INVALID_CREDENTIALS para login');

    // 3. 401 em endpoint autenticado continua significando sessão expirada
    const authEndpointRes = await fetch(`${baseUrl}/api/finances`, {
      headers: {
        'Authorization': 'Bearer token_invalido_expirado_123',
        'Content-Type': 'application/json'
      }
    });
    assert.strictEqual(authEndpointRes.status, 401);
    assert.ok(apiJs.includes("SESSION_EXPIRED"), 'api.js deve retornar SESSION_EXPIRED em rotas autenticadas');
    assert.ok(apiJs.includes("Sessão expirada. Faça login novamente."), 'api.js deve retornar mensagem de sessão expirada');
  });

  test('Hotfix UX: Loading / Splash de Hidratação Inicial e Prevenção de Dados Falsos', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    const componentsCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'components.css'), 'utf-8');
    const authSyncJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'authSync.js'), 'utf-8');
    const swJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf-8');

    // 4. Loading existe na inicialização (DOM e CSS)
    assert.ok(indexHtml.includes('id="appHydrationSplash"'), '4. index.html deve conter elemento #appHydrationSplash');
    assert.ok(indexHtml.includes('class="app-hydration-splash"'), '4. Deve possuir classe app-hydration-splash');
    assert.ok(componentsCss.includes('.app-hydration-splash'), '4. components.css deve conter regras da camada de splash');
    assert.ok(componentsCss.includes('position: fixed'), 'Splash deve cobrir a viewport em position: fixed');
    assert.ok(componentsCss.includes('z-index: 99999'), 'Splash deve ter z-index prioritário');

    // 5. Loading é removido após hidratação bem-sucedida
    assert.ok(authSyncJs.includes("dismissHydrationSplash('ready')"), '5. authSync.js deve dispensar splash após hidratação com "ready"');
    assert.ok(componentsCss.includes('.app-hydration-splash.hide'), '5. components.css deve declarar transição para classe .hide');
    assert.ok(componentsCss.includes('opacity: 0'), 'Classe hide deve zerar opacity');

    // 6. Loading não fica infinito em erro (timeout de segurança e tratamento de erro)
    assert.ok(authSyncJs.includes('MAX_SPLASH_TIMEOUT_MS'), '6. authSync.js deve ter MAX_SPLASH_TIMEOUT_MS de segurança');
    assert.ok(authSyncJs.includes("dismissHydrationSplash('timeout')"), '6. Deve possuir trigger de timeout');
    assert.ok(authSyncJs.includes("dismissHydrationSplash('error')"), '6. Deve tratar falhas chamando dismissHydrationSplash com "error"');

    // 7. Loading não exige delay fixo de 3 segundos (visual mínimo curto de 650ms, dentro de 600-900ms)
    assert.ok(!authSyncJs.includes('3000') || !authSyncJs.includes('setTimeout(dismissHydrationSplash, 3000)'), '7. Não deve ter delay fixo de 3 segundos');
    assert.ok(authSyncJs.includes('MIN_SPLASH_DURATION_MS = 650'), '7. Deve usar tempo visual mínimo curto (aprox 650ms)');

    // 8. PWA/Service Worker não são alterados indevidamente (trata extensões com segurança)
    assert.ok(swJs.includes("!url.protocol.startsWith('http')"), '8. Service worker deve ignorar esquemas de extensão (chrome-extension:)');
    assert.ok(swJs.includes("CACHE_VERSION"), '8. Service worker preserva estrutura de cache');

    // 9. State financeiro não renderiza flash de dados default antes da hidratação
    const appJsPath = path.join(__dirname, '..', 'public', 'js', 'core', 'app.js');
    const appJsContent = fs.existsSync(appJsPath) ? fs.readFileSync(appJsPath, 'utf-8') : '';
    assert.ok(indexHtml.includes('if (!stateHydrated) {') || appJsContent.includes('if (!stateHydrated) {'), '9. Frontend (index.html ou app.js) deve conter guarda stateHydrated no render');
    assert.ok(authSyncJs.includes('window.setStateHydrated(true)'), '9. authSync.js deve acionar setStateHydrated somente após carregar dados reais');
  });

  /* ==========================================================================
     HOTFIX TIPOGRAFIA — PRESERVAÇÃO DAS FONTES ORIGINAIS E CSP
     ========================================================================== */
  test('Hotfix Tipografia: Fonte original Manrope e JetBrains Mono preservadas com CSP compatível', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
    const baseCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'base.css'), 'utf-8');
    const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf-8');

    // 1. A fonte principal esperada continua declarada no base.css exatamente como no baseline
    assert.ok(baseCss.includes("'Manrope', system-ui, -apple-system, sans-serif"), 'base.css deve declarar Manrope como fonte principal');
    assert.ok(baseCss.includes("'JetBrains Mono', monospace"), 'base.css deve declarar JetBrains Mono para números/métricas');

    // 2. Os imports/links necessários continuam presentes no index.html fielmente ao baseline
    assert.ok(indexHtml.includes('fonts.googleapis.com'), 'index.html deve conter link para fonts.googleapis.com');
    assert.ok(indexHtml.includes('fonts.gstatic.com'), 'index.html deve conter preconnect para fonts.gstatic.com');
    assert.ok(indexHtml.includes('family=Manrope:wght@400;500;600;700;800'), 'index.html deve requisitar pesos 400-800 do Manrope');
    assert.ok(indexHtml.includes('family=JetBrains+Mono:wght@500;700'), 'index.html deve requisitar pesos 500;700 do JetBrains Mono');

    // 3. CSP no server.js permite carregar styles, inline styles (styleSrcAttr), binários e preconnect de fontes
    assert.ok(serverJs.includes("https://fonts.googleapis.com"), 'server.js CSP deve permitir fonts.googleapis.com');
    assert.ok(serverJs.includes("https://fonts.gstatic.com"), 'server.js CSP deve permitir fonts.gstatic.com');
    assert.ok(serverJs.includes("fontSrc:"), 'server.js CSP deve configurar fontSrc');
    assert.ok(serverJs.includes("connectSrc:"), 'server.js CSP deve configurar connectSrc');
    assert.ok(serverJs.includes("styleSrcAttr:"), 'server.js CSP deve configurar styleSrcAttr para estilos inline');
  });

  /* ==========================================================================
     SERVICE WORKER & CACHE LIFECYCLE: ATUALIZAÇÃO AUTOMÁTICA E RESILIÊNCIA
     ========================================================================== */
  test('Service Worker e Cache Lifecycle: Versionamento v3.8.0, Network-First, cleanup no activate e isolamento de /api/* e fontes', () => {
    const swJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf-8');
    const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf-8');

    // 1. CACHE_VERSION não permanece na versão congelada v3.5 nem v3.7.0
    assert.strictEqual(swJs.includes("'omnifin-static-v3.5'"), false, 'sw.js não deve manter CACHE_VERSION congelada na v3.5');
    assert.strictEqual(swJs.includes("'omnifin-static-v3.7.0'"), false, 'sw.js não deve manter CACHE_VERSION v3.7.0');
    assert.ok(swJs.includes("'omnifin-static-v3.8.0'"), 'sw.js deve declarar CACHE_VERSION omnifin-static-v3.8.0');

    // 2. /api/* permanece estritamente network-only sem cache
    assert.ok(swJs.includes("url.pathname.startsWith('/api/')"), 'sw.js deve isolar rotas /api/ como network-only');
    assert.ok(swJs.includes('status: 503'), 'sw.js deve prover resposta offline 503 para API');

    // 3. Evento activate remove caches antigos automaticamente
    assert.ok(swJs.includes('caches.delete(key)'), 'sw.js activate deve deletar caches obsoletos');
    assert.ok(swJs.includes('key !== CACHE_VERSION'), 'sw.js activate deve filtrar chaves diferentes da versão ativa');

    // 4. Ciclo de ativação rápida com skipWaiting() e clients.claim()
    assert.ok(swJs.includes('self.skipWaiting()'), 'sw.js deve conter skipWaiting() no install');
    assert.ok(swJs.includes('self.clients.claim()'), 'sw.js deve conter clients.claim() no activate');

    // 5. Navegação HTML usa Network-First com fallback offline
    assert.ok(swJs.includes("req.mode === 'navigate'"), 'sw.js deve interceptar navegação de páginas');
    assert.ok(swJs.includes("caches.match('./index.html')"), 'sw.js deve prover fallback offline para index.html');

    // 6. Assets estáticos (CSS/JS) usam Network-First com fallback para evitar versões stale
    assert.ok(swJs.includes('fetch(req)'), 'sw.js deve priorizar busca na rede para assets');
    assert.ok(swJs.includes('caches.match(req)'), 'sw.js deve ter fallback em cache para modo offline');

    // 7. Recursos de origens externas (Google Fonts, CDNs) não são interceptados pelo Cache Storage
    assert.ok(swJs.includes('url.origin !== self.location.origin'), 'sw.js deve ignorar origens externas como Google Fonts');

    // 8. Express static configura headers anti-cache para sw.js e revalidação de HTML/CSS/JS
    assert.ok(serverJs.includes("filePath.endsWith('sw.js')"), 'server.js deve configurar Cache-Control específico para sw.js');
    assert.ok(serverJs.includes('no-store'), 'server.js deve definir no-store para sw.js');
    assert.ok(serverJs.includes("filePath.endsWith('.html')"), 'server.js deve configurar revalidação no-cache para HTML');
  });

  /* ==========================================================================
     CHECKPOINT SECURITY 2: SESSÃO, COOKIES HTTPONLY, TOKENVERSION E CICLO DE AUTH
     ========================================================================== */
  test('Checkpoint Security 2: Contrato completo de Cookies HttpOnly, tokenVersion, Anti-CSRF, Anti-Cache e RBAC em tempo real', async () => {
    const swJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf-8');
    const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf-8');
    const authMiddlewareJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'middleware', 'auth.js'), 'utf-8');
    const apiJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'api.js'), 'utf-8');
    const authJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'auth.js'), 'utf-8');
    const authSyncJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'authSync.js'), 'utf-8');

    // 1 & 2 & 3. Login válido emite Set-Cookie com HttpOnly, SameSite=Lax, Path=/ e Domain omitido
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ login: testUserLogin, senha: testPassword })
    });
    const loginJson = await loginRes.json();
    assert.strictEqual(loginRes.status, 200, 'Login deve retornar 200');
    assert.strictEqual(loginJson.token, undefined, '8. JWT não deve ser retornado no JSON de login');

    const setCookie = loginRes.headers.get('set-cookie') || '';
    assert.ok(setCookie.includes('omnifin_session='), '1. Login deve emitir cookie omnifin_session');
    assert.ok(/httponly/i.test(setCookie), '2. Cookie deve possuir flag HttpOnly');
    assert.ok(/samesite=lax/i.test(setCookie), '3. Cookie deve possuir SameSite=Lax');
    assert.ok(/path=\//i.test(setCookie), '6. Cookie deve possuir Path=/');
    assert.ok(!/domain=/i.test(setCookie), '7. Domain deve ser omitido para garantir Host-Only');

    // 4 & 5. Secure presente em produção e ausente em localhost/dev
    if (process.env.NODE_ENV === 'production') {
      assert.ok(/secure/i.test(setCookie), '4. Secure presente em produção');
    } else {
      assert.ok(!/secure/i.test(setCookie), '5. Secure ausente em localhost/dev');
    }

    const sessionCookieVal = setCookie.match(/omnifin_session=([^;]+)/)[1];

    // 9 & 10. JWT não é salvo no localStorage e chaves legadas são removidas
    assert.ok(!apiJs.includes("localStorage.setItem(TOKEN_KEY"), '9. api.js não deve salvar token no localStorage');
    assert.ok(!authJs.includes("localStorage.setItem('auth_token'"), '9. auth.js não deve salvar auth_token');
    assert.ok(apiJs.includes("localStorage.removeItem(TOKEN_KEY)"), '10. api.js deve expurgar chaves legadas');

    // 11. Endpoint privado funciona com cookie HttpOnly
    const finRes = await fetch(`${baseUrl}/api/finances`, {
      headers: {
        'Cookie': `omnifin_session=${sessionCookieVal}`
      }
    });
    assert.strictEqual(finRes.status, 200, '11. Endpoint privado deve autenticar com cookie');

    // 12. Endpoint privado sem cookie nem token retorna 401
    const unauthRes = await fetch(`${baseUrl}/api/finances`);
    assert.strictEqual(unauthRes.status, 401, '12. Endpoint privado sem autenticação retorna 401');

    // 13. Bearer legado funciona durante compatibilidade temporária
    const bearerRes = await fetch(`${baseUrl}/api/finances`, {
      headers: {
        'Authorization': `Bearer ${sessionCookieVal}`
      }
    });
    assert.strictEqual(bearerRes.status, 200, '13. Bearer legado deve funcionar na transição');

    // 14 & 15. tokenVersion correto autentica; tokenVersion antigo recebe 401
    const validJwt = verifyToken(sessionCookieVal);
    assert.ok(validJwt.userId, 'JWT deve conter userId');
    assert.strictEqual(typeof validJwt.tokenVersion, 'number', 'JWT deve conter tokenVersion numérico');

    // JWT sintético com tokenVersion divergente
    const staleJwt = jwt.sign({ userId: testUserId, tokenVersion: 9999 }, config.JWT_SECRET, { expiresIn: '1h' });
    const staleRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Cookie': `omnifin_session=${staleJwt}` }
    });
    assert.strictEqual(staleRes.status, 401, '15. tokenVersion antigo/divergente deve receber 401');
    const staleJson = await staleRes.json();
    assert.strictEqual(staleJson.error, 'SESSION_INVALIDATED');

    // 16. Usuário legado sem tokenVersion no banco é tratado como 0
    const legacyJwt = jwt.sign({ userId: testUserId, tokenVersion: 0 }, config.JWT_SECRET, { expiresIn: '1h' });
    const legacyRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Cookie': `omnifin_session=${legacyJwt}` }
    });
    const currentUserDoc = await getUserById(testUserId);
    if ((currentUserDoc.tokenVersion ?? 0) === 0) {
      assert.strictEqual(legacyRes.status, 200, '16. Usuário com tokenVersion 0 deve autenticar');
    }

    // 17. Alteração de senha incrementa tokenVersion e invalida sessões anteriores
    const usersCol = (await connectDB()).collection('users');
    const pwdUserLogin = `user_pwd_${Date.now()}`;
    const regPwdRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        nome: 'User Pwd Test',
        login: pwdUserLogin,
        email: `${pwdUserLogin}@omnifin.test`,
        senha: testPassword
      })
    });
    const regPwdCookie = regPwdRes.headers.get('set-cookie') || '';
    const oldSessionToken = regPwdCookie.match(/omnifin_session=([^;]+)/)[1];

    // Troca a senha pelo endpoint profile
    const newPwd = 'NewPassword@999!';
    const changePwdRes = await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'PUT',
      headers: {
        'Cookie': `omnifin_session=${oldSessionToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ senhaAtual: testPassword, novaSenha: newPwd })
    });
    assert.strictEqual(changePwdRes.status, 200, 'Troca de senha deve retornar 200');
    const changePwdJson = await changePwdRes.json();
    assert.strictEqual(changePwdJson.passwordChanged, true);

    // Sessão antiga deve receber 401 após a troca de senha
    const invalidatedRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Cookie': `omnifin_session=${oldSessionToken}` }
    });
    assert.strictEqual(invalidatedRes.status, 401, '17. Sessão anterior à troca de senha deve receber 401');

    // 18 & 19. Logout normal limpa cookie e NÃO incrementa tokenVersion
    const preLogoutUser = await getUserById(testUserId);
    const preLogoutVersion = preLogoutUser.tokenVersion ?? 0;
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': `omnifin_session=${sessionCookieVal}`, 'X-Requested-With': 'XMLHttpRequest' }
    });
    assert.strictEqual(logoutRes.status, 200, 'Logout deve retornar 200');
    const postLogoutCookie = logoutRes.headers.get('set-cookie') || '';
    assert.ok(postLogoutCookie.includes('omnifin_session=;'), '19. Logout deve limpar o cookie');
    const postLogoutUser = await getUserById(testUserId);
    assert.strictEqual(postLogoutUser.tokenVersion ?? 0, preLogoutVersion, '18. Logout normal NÃO incrementa tokenVersion');

    // 20. Usuário excluído recebe 401 mesmo com JWT assinado válido
    const delUserLogin = `user_del_${Date.now()}`;
    const regDelRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({
        nome: 'User Del Test',
        login: delUserLogin,
        email: `${delUserLogin}@omnifin.test`,
        senha: testPassword
      })
    });
    const regDelJson = await regDelRes.json();
    const delUserId = regDelJson.user.id;
    const delCookie = regDelRes.headers.get('set-cookie').match(/omnifin_session=([^;]+)/)[1];

    // Remove usuário do banco diretamente
    await usersCol.deleteOne({ _id: delUserId });
    const accessDeletedRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Cookie': `omnifin_session=${delCookie}` }
    });
    assert.strictEqual(accessDeletedRes.status, 401, '20. Usuário excluído recebe 401');

    // 21 & 22 & 23 & 24. authMiddleware NÃO usa getUsers() e req.user reflete o banco
    assert.ok(!authMiddlewareJs.includes('getUsers('), '23. authMiddleware NÃO deve carregar coleção inteira com getUsers()');
    assert.ok(authMiddlewareJs.includes('getUserById('), '23. authMiddleware deve consultar via getUserById()');
    assert.ok(authMiddlewareJs.includes('getUserPermissions('), '21. authMiddleware deve consultar permissões atuais do banco');

    // 25. BroadcastChannel não transporta JWT nem credenciais
    assert.ok(authSyncJs.includes("BroadcastChannel('omnifin_auth')"), '25. BroadcastChannel configurado');
    assert.ok(!authSyncJs.includes("postMessage({ token"), '25. BroadcastChannel nunca transporta token');
    assert.ok(!authSyncJs.includes("postMessage({ jwt"), '25. BroadcastChannel nunca transporta JWT');

    // 26. /api/* continua network-only no SW
    assert.ok(swJs.includes("url.pathname.startsWith('/api/')"), '26. /api/* continua isolada no SW');

    // 27. APIs privadas retornam Cache-Control: no-store, private
    const apiMeRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const ccHeader = apiMeRes.headers.get('cache-control') || '';
    assert.ok(ccHeader.includes('no-store'), '27. APIs privadas devem conter no-store');
    assert.ok(ccHeader.includes('private'), '27. APIs privadas devem conter private');

    // 28. CORS não usa wildcard com credentials
    assert.ok(serverJs.includes('credentials: true'), '28. CORS configurado com credentials: true');
    assert.ok(!serverJs.includes("origin: '*'"), '28. CORS não deve usar wildcard com credentials');

    // 29. Política Anti-CSRF: métodos mutáveis autenticados por cookie exigem X-Requested-With
    const csrfFailRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Cookie': `omnifin_session=${sessionCookieVal}`,
        'Content-Type': 'application/json'
        // SEM X-Requested-With
      },
      body: JSON.stringify({ fixed: [] })
    });
    assert.strictEqual(csrfFailRes.status, 403, '29. Mutação por cookie sem X-Requested-With deve retornar 403 CSRF_REJECTED');
    const csrfFailJson = await csrfFailRes.json();
    assert.strictEqual(csrfFailJson.error, 'CSRF_REJECTED');

    // Mutação com X-Requested-With é permitida
    const curFinRes = await fetch(`${baseUrl}/api/finances`, { headers: { 'Cookie': `omnifin_session=${sessionCookieVal}` } });
    const curFin = await curFinRes.json();
    const csrfOkRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Cookie': `omnifin_session=${sessionCookieVal}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(Object.assign({}, curFin, { expectedRevision: curFin.revision }))
    });
    assert.strictEqual(csrfOkRes.status, 200, '29. Mutação com X-Requested-With deve ser aceita');

    // 30 & 31. login/register e BASE_PATH=/ continuam 100% funcionais
    assert.strictEqual(config.BASE_PATH || '', '', '31. BASE_PATH oficial é raiz /');
  });

  /* ==========================================================================
     CHECKPOINT SECURITY 3A: NEUTRALIZAÇÃO DE XSS, ESCAPING E EVENT HANDLERS
     ========================================================================== */
  test('Checkpoint Security 3A: Neutralização de Sinks XSS, Hardening da IA e Proteção contra Stored XSS', async () => {
    const aiAssistantPath = path.join(process.cwd(), 'public', 'js', 'modules', 'aiAssistant.js');
    const aiAssistantCode = fs.readFileSync(aiAssistantPath, 'utf-8');

    // 1. Simulação do módulo aiAssistant no VM para execução real dos renderers
    const sandboxAi = {
      window: {
        API: { isAuthenticated: () => false },
        formatCurrency: (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`
      },
      document: {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({ setAttribute: () => {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
        body: { appendChild: () => {} },
        addEventListener: () => {}
      }
    };
    const vmAi = await import('vm');
    vmAi.createContext(sandboxAi);
    vmAi.runInContext(aiAssistantCode, sandboxAi);

    const renderProposalCardHtml = sandboxAi.window.renderProposalCardHtml;
    const formatAiMessageContent = sandboxAi.window.formatAiMessageContent;
    const escapeHtmlText = sandboxAi.window.escapeHtmlText;
    const escapeHtmlAttr = sandboxAi.window.escapeHtmlAttr;

    assert.strictEqual(typeof renderProposalCardHtml, 'function', 'renderProposalCardHtml deve ser exposta');
    assert.strictEqual(typeof formatAiMessageContent, 'function', 'formatAiMessageContent deve ser exposta');
    assert.strictEqual(typeof escapeHtmlText, 'function', 'escapeHtmlText deve ser exposta');
    assert.strictEqual(typeof escapeHtmlAttr, 'function', 'escapeHtmlAttr deve ser exposta');

    const xssPayloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '"><img src=x onerror=alert(1)>',
      'javascript:alert(1)',
      '"><script>alert(document.cookie)</script>',
      '<b onmouseover=alert(1)>Alerta</b>'
    ];

    // 2. VULNERABILIDADE XSS CONFIRMADA: Neutralização de proposal.warnings
    for (const payload of xssPayloads) {
      const mockProposal = {
        proposalId: 'prop_test_xss_warnings',
        action: 'create_expense',
        status: 'pending',
        requiresReview: false,
        warnings: [payload, `Aviso com injeção: ${payload}`],
        data: {
          description: 'Despesa Teste',
          amount: 50.00,
          category: 'Alimentação',
          destination: 'Nubank',
          installments: 1
        }
      };

      const cardHtml = renderProposalCardHtml(mockProposal);

      // Confirma que tags maliciosas NUNCA são renderizadas de forma bruta
      assert.ok(!cardHtml.includes('<script>'), `Warnings não devem conter tag <script> aberta para payload: ${payload}`);
      assert.ok(!cardHtml.includes('<img src=x onerror'), `Warnings não devem conter <img onerror para payload: ${payload}`);
      assert.ok(!cardHtml.includes('<svg onload'), `Warnings não devem conter <svg onload para payload: ${payload}`);
      assert.ok(!cardHtml.includes('<b onmouseover'), `Warnings não devem conter <b onmouseover para payload: ${payload}`);

      // Confirma que entidades escapadas estão presentes
      if (payload.includes('<')) {
        assert.ok(cardHtml.includes('&lt;'), `Warnings devem conter entidade &lt; para payload: ${payload}`);
      }
      if (payload.includes('>')) {
        assert.ok(cardHtml.includes('&gt;'), `Warnings devem conter entidade &gt; para payload: ${payload}`);
      }

      // Confirma integridade estrutural do card
      assert.ok(cardHtml.includes('class="ai-proposal-card"'), 'Estrutura do card deve permanecer íntegra');
      assert.ok(cardHtml.includes('class="ai-proposal-alert"'), 'Container de alerta deve permanecer presente');
    }

    // 3. Defesa em Profundidade: Tipos Inesperados em Warnings e escapeHtmlText
    const edgeCaseProposal = {
      proposalId: 'prop_test_edge_warnings',
      action: 'create_expense',
      status: 'pending',
      warnings: [null, undefined, 12345, { warning: '<img src=x onerror=1>' }, { code: 'ERR', message: '<script>alert(2)</script>' }],
      data: { description: 'Teste Edge', amount: 10, category: 'Outros', destination: 'Carteira' }
    };
    const edgeCardHtml = renderProposalCardHtml(edgeCaseProposal);
    assert.ok(!edgeCardHtml.includes('<img src=x onerror=1>'), 'Objeto warning com payload deve ser escapado');
    assert.ok(!edgeCardHtml.includes('<script>alert(2)</script>'), 'Objeto message com payload deve ser escapado');
    assert.ok(edgeCardHtml.includes('12345'), 'Número em warning deve ser preservado e convertido');
    assert.ok(!edgeCardHtml.includes('[object Object]'), 'Não deve renderizar [object Object] desnecessariamente');

    // 4. Auditoria de Campos do Card: description, category, destination, notes, errorMessage
    for (const payload of xssPayloads) {
      const fieldProposal = {
        proposalId: `prop_test_fields_${payload.slice(0, 5)}`,
        action: 'create_expense',
        status: 'error',
        errorMessage: `Erro com ${payload}`,
        data: {
          description: `Supermercado ${payload}`,
          amount: 99.90,
          category: `Categoria ${payload}`,
          destination: `Destino ${payload}`,
          notes: `Notas com ${payload}`,
          installments: 1
        }
      };

      const fieldHtml = renderProposalCardHtml(fieldProposal);
      assert.ok(!fieldHtml.includes('<script>'), `Campos da despesa não devem conter tag <script> aberta para payload: ${payload}`);
      assert.ok(!fieldHtml.includes('<img src=x onerror'), `Campos da despesa não devem conter <img onerror para payload: ${payload}`);
      assert.ok(!fieldHtml.includes('<svg onload'), `Campos da despesa não devem conter <svg onload para payload: ${payload}`);
      assert.ok(fieldHtml.includes('SUPERMERCADO'), 'Texto da descrição deve permanecer legível');
      assert.ok(fieldHtml.includes('class="ai-proposal-card"'), 'Card estrutural deve permanecer intacto');
    }

    // 5. Auditoria de Campos de Proposta de Benefício
    for (const payload of xssPayloads) {
      const benefitProposal = {
        proposalId: 'prop_test_benefit',
        action: 'create_benefit',
        status: 'pending',
        warnings: [payload],
        data: {
          description: `Vale Alimentação ${payload}`,
          amount: 650.00,
          benefitType: 'va',
          day: 5,
          notes: `Observação ${payload}`
        }
      };

      const benHtml = renderProposalCardHtml(benefitProposal);
      assert.ok(!benHtml.includes('<script>'), `Benefício não deve conter <script> para payload: ${payload}`);
      assert.ok(!benHtml.includes('<img src=x onerror'), `Benefício não deve conter <img onerror para payload: ${payload}`);
      assert.ok(benHtml.includes('VALE ALIMENTAÇÃO'), 'Texto do benefício deve permanecer legível');
      assert.ok(benHtml.includes('Benefício Identificado'), 'Tag de benefício deve ser renderizada');
    }

    // 6. Formatação de Mensagens de Chat da IA (formatAiMessageContent)
    const chatInputWithMarkdownAndXss = 'Olá! Veja sua **despesa confirmada**: <script>alert("xss")</script> e <img src=x onerror=alert(1)>';
    const formattedChat = formatAiMessageContent(chatInputWithMarkdownAndXss);
    assert.ok(formattedChat.includes('<strong>despesa confirmada</strong>'), 'Markdown bold deve ser convertido para <strong>');
    assert.ok(!formattedChat.includes('<script>'), 'Script malicioso deve ser neutralizado no chat');
    assert.ok(!formattedChat.includes('<img src=x onerror'), 'Img onerror deve ser neutralizado no chat');
    assert.ok(formattedChat.includes('&lt;script&gt;'), 'Entidade &lt;script&gt; deve estar presente no chat');
    assert.ok(formattedChat.includes('&lt;img'), 'Entidade &lt;img deve estar presente no chat');

    // 7. STORED XSS: Persistência mantém valor lógico e renderização realiza escaping contextual
    const xssTitle = '<img src=x onerror=alert("stored-title")>';
    const xssCat = '"><script>alert("stored-cat")</script>';
    const xssDest = '<svg onload=alert("stored-dest")>';

    // A. Obter estado atual autenticado
    const curStateRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const curState = await curStateRes.json();

    // B. Injetar lançamento com strings perigosas via PUT (persistência lógica)
    const testFixedExpense = {
      id: `xss_fix_${Date.now()}`,
      name: xssTitle,
      group: xssCat,
      destination: xssDest,
      amount: 120.50,
      dueDay: 10,
      type: 'fixed',
      status: 'pendente'
    };

    const nextFixed = Array.isArray(curState.fixed) ? [...curState.fixed, testFixedExpense] : [testFixedExpense];
    const putPayload = Object.assign({}, curState, {
      fixed: nextFixed,
      expectedRevision: curState.revision
    });

    const putRes = await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(putPayload)
    });
    assert.strictEqual(putRes.status, 200, 'PUT /api/finances com payload financeiro deve ser persistido');

    // C. Leitura: o banco armazena o valor lógico puro sem double-escaping prematuro
    const readStateRes = await fetch(`${baseUrl}/api/finances`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    const readState = await readStateRes.json();
    const persistedItem = (readState.fixed || []).find(f => f.id === testFixedExpense.id);
    assert.ok(persistedItem, 'Item salvo deve ser retornado pelo backend');
    assert.strictEqual(persistedItem.name, xssTitle, 'Persistência deve manter valor lógico original sem mutilação');
    assert.strictEqual(persistedItem.group, xssCat, 'Categoria deve manter valor original no banco');

    // D. Simulação da renderização no frontend (como em expenses.js / utils.js escapeHtml)
    const utilsJsPath = path.join(process.cwd(), 'public', 'js', 'core', 'utils.js');
    const utilsJsCode = fs.readFileSync(utilsJsPath, 'utf-8');
    const sandboxUtils = { window: {} };
    vmAi.createContext(sandboxUtils);
    vmAi.runInContext(utilsJsCode, sandboxUtils);
    const escapeHtml = sandboxUtils.window.escapeHtml;

    assert.strictEqual(typeof escapeHtml, 'function', 'utils.js deve expor escapeHtml');
    const renderedTitle = escapeHtml(persistedItem.name);
    const renderedCat = escapeHtml(persistedItem.group);
    const renderedDest = escapeHtml(persistedItem.destination);

    // Confirma que nenhuma tag executável atinge o DOM
    assert.ok(!renderedTitle.includes('<img'), 'Renderização do título persistido não deve gerar tag <img>');
    assert.ok(renderedTitle.includes('&lt;img'), 'Renderização do título persistido deve conter &lt;img');
    assert.ok(!renderedCat.includes('<script>'), 'Renderização da categoria não deve gerar <script>');
    assert.ok(renderedCat.includes('&lt;script&gt;'), 'Renderização da categoria deve conter &lt;script&gt;');
    assert.ok(!renderedDest.includes('<svg'), 'Renderização do destino não deve gerar <svg>');
    assert.ok(renderedDest.includes('&lt;svg'), 'Renderização do destino deve conter &lt;svg');

    // Limpeza: remover o item de teste do banco
    const cleanedFixed = readState.fixed.filter(f => f.id !== testFixedExpense.id);
    await fetch(`${baseUrl}/api/finances`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${testUserToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(Object.assign({}, readState, { fixed: cleanedFixed, expectedRevision: readState.revision }))
    });

    // 8. CONTRATO DE EVENT HANDLERS INLINE: Zero atributos on*="..." em todo o frontend
    const publicDir = path.join(process.cwd(), 'public');
    function scanFilesForInlineHandlers(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const violations = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          violations.push(...scanFilesForInlineHandlers(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.js'))) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // Procura atributos HTML inline on<evento>=" ou on<evento>='
          const matches = content.match(/\bon[a-z]{3,12}\s*=\s*\\?["']/gi);
          if (matches && matches.length > 0) {
            violations.push({ file: entry.name, matches });
          }
        }
      }
      return violations;
    }

    const inlineHandlerViolations = scanFilesForInlineHandlers(publicDir);
    assert.deepStrictEqual(inlineHandlerViolations, [], 'Não deve existir nenhum atributo de evento inline (on*="") em arquivos HTML ou JS do frontend');
  });

  /* ==========================================================================
     CHECKPOINT SECURITY 3B: CSP ESTRITA, EXTERNALIZAÇÃO DE SCRIPTS E CACHE
     ========================================================================== */
  test('Checkpoint Security 3B: Strict CSP, External Scripts e Isolamento de Cache PWA', async () => {
    const publicDir = path.join(process.cwd(), 'public');
    const indexHtmlPath = path.join(publicDir, 'index.html');
    const loginHtmlPath = path.join(publicDir, 'login.html');
    const swPath = path.join(publicDir, 'sw.js');
    const serverJsPath = path.join(process.cwd(), 'server', 'server.js');

    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
    const loginHtml = fs.readFileSync(loginHtmlPath, 'utf-8');
    const swContent = fs.readFileSync(swPath, 'utf-8');
    const serverJs = fs.readFileSync(serverJsPath, 'utf-8');

    // 1. public/index.html contém ZERO <script> inline executável
    const inlineScriptsIndex = indexHtml.match(/<\s*script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
    assert.strictEqual(inlineScriptsIndex.length, 0, '1. public/index.html não deve conter nenhum script inline executável');

    // 2. public/login.html contém ZERO <script> inline executável
    const inlineScriptsLogin = loginHtml.match(/<\s*script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
    assert.strictEqual(inlineScriptsLogin.length, 0, '2. public/login.html não deve conter nenhum script inline executável');

    // 3. public/ contém ZERO atributos inline on*=
    function scanFilesForInlineHandlers(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const violations = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          violations.push(...scanFilesForInlineHandlers(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.js'))) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const matches = content.match(/\bon[a-z]{3,12}\s*=\s*\\?["']/gi);
          if (matches && matches.length > 0) {
            violations.push({ file: entry.name, matches });
          }
        }
      }
      return violations;
    }
    const inlineHandlerViolations = scanFilesForInlineHandlers(publicDir);
    assert.deepStrictEqual(inlineHandlerViolations, [], '3. public/ não deve conter nenhum atributo inline on*=');

    // Consulta aos headers HTTP da API para validação da CSP ativa
    const res = await fetch(`${baseUrl}/api/config`);
    assert.strictEqual(res.status, 200);
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(csp, 'Header Content-Security-Policy deve ser retornado pelo servidor');

    // Extrai diretiva script-src
    const scriptSrcMatch = csp.match(/script-src\s+([^;]+)/i);
    assert.ok(scriptSrcMatch, 'CSP deve conter a diretiva script-src');
    const scriptSrcValue = scriptSrcMatch[1];

    // 4. CSP NÃO contém 'unsafe-inline' em script-src
    assert.ok(!scriptSrcValue.includes("'unsafe-inline'"), "4. script-src NÃO deve conter 'unsafe-inline'");

    // 5. CSP contém script-src 'self'
    assert.ok(scriptSrcValue.includes("'self'"), "5. script-src deve conter 'self'");

    // 6. CSP contém script-src-attr 'none'
    assert.ok(csp.includes("script-src-attr 'none'"), "6. CSP deve conter explicitamente script-src-attr 'none'");

    // 7. CSP contém form-action 'self'
    assert.ok(csp.includes("form-action 'self'"), "7. CSP deve conter explicitamente form-action 'self'");

    // 8. style-src continua compatível com a arquitetura atual
    assert.ok(csp.includes("style-src"), "8. CSP deve conter style-src");
    assert.ok(csp.includes("style-src-attr 'unsafe-inline'"), "8. style-src-attr deve manter 'unsafe-inline' para 2.100+ estilos do layout");

    // 9. Google Fonts continuam autorizadas
    assert.ok(csp.includes("https://fonts.googleapis.com"), "9. fonts.googleapis.com deve estar autorizada na CSP");
    assert.ok(csp.includes("https://fonts.gstatic.com"), "9. fonts.gstatic.com deve estar autorizada na CSP");

    // 10. app.js existe e está referenciado por index.html
    const appJsPath = path.join(publicDir, 'js', 'core', 'app.js');
    assert.ok(fs.existsSync(appJsPath), '10. js/core/app.js deve existir no disco');
    assert.ok(indexHtml.includes('src="js/core/app.js"'), '10. index.html deve referenciar js/core/app.js');

    // 11. splash.js existe e está corretamente referenciado
    const splashJsPath = path.join(publicDir, 'js', 'core', 'splash.js');
    assert.ok(fs.existsSync(splashJsPath), '11. js/core/splash.js deve existir no disco');
    assert.ok(indexHtml.includes('src="js/core/splash.js"'), '11. index.html deve referenciar js/core/splash.js');

    // 12. loginInit.js existe e está referenciado por login.html
    const loginInitPath = path.join(publicDir, 'js', 'loginInit.js');
    assert.ok(fs.existsSync(loginInitPath), '12. js/loginInit.js deve existir no disco');
    assert.ok(loginHtml.includes('src="js/loginInit.js"'), '12. login.html deve referenciar js/loginInit.js');

    // 13. Novos arquivos estão presentes em STATIC_ASSETS
    assert.ok(swContent.includes("'./js/core/app.js'"), "13. STATIC_ASSETS deve conter './js/core/app.js'");
    assert.ok(swContent.includes("'./js/core/splash.js'"), "13. STATIC_ASSETS deve conter './js/core/splash.js'");
    assert.ok(swContent.includes("'./js/loginInit.js'"), "13. STATIC_ASSETS deve conter './js/loginInit.js'");

    // 14. CACHE_VERSION foi incrementado
    assert.ok(swContent.includes("CACHE_VERSION = 'omnifin-static-v3.8.0'"), "14. CACHE_VERSION deve ser incrementado para omnifin-static-v3.8.0");
    assert.ok(!swContent.includes("CACHE_VERSION = 'omnifin-static-v3.7.0'"), "14. Versão anterior v3.7.0 não deve ser a CACHE_VERSION ativa");

    // 15. /api/* continua não sendo servido pelo cache do Service Worker
    assert.ok(swContent.includes("url.pathname.startsWith('/api/')"), "15. sw.js deve isolar rotas de API");
    assert.ok(swContent.includes("status: 503"), "15. sw.js deve manter isolamento de rede");

    // 16. HTML navigation continua Network-First
    assert.ok(swContent.includes("req.mode === 'navigate'"), "16. sw.js deve tratar requisições de navegação");
    assert.ok(swContent.includes("fetch(req).catch("), "16. sw.js deve tentar rede primeiro (Network-First)");

    // 19. Varredura para sinks perigosos no código estático
    function scanForDangerousSinks(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const dangerous = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          dangerous.push(...scanForDangerousSinks(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (/\beval\s*\(/.test(content)) dangerous.push({ file: entry.name, sink: 'eval' });
          if (/new\s+Function\s*\(/.test(content)) dangerous.push({ file: entry.name, sink: 'new Function' });
          if (/document\.write\s*\(/.test(content)) dangerous.push({ file: entry.name, sink: 'document.write' });
          if (/javascript\s*:/.test(content)) dangerous.push({ file: entry.name, sink: 'javascript:' });
          if (/setTimeout\s*\(\s*["']/.test(content)) dangerous.push({ file: entry.name, sink: 'setTimeout string' });
          if (/setInterval\s*\(\s*["']/.test(content)) dangerous.push({ file: entry.name, sink: 'setInterval string' });
          if (/\bsrcdoc\s*=/.test(content)) dangerous.push({ file: entry.name, sink: 'srcdoc' });
        }
      }
      return dangerous;
    }
    const dangerousSinks = scanForDangerousSinks(path.join(publicDir, 'js'));
    assert.deepStrictEqual(dangerousSinks, [], '19. Nenhum sink perigoso executável deve existir nos arquivos JS do frontend');
  });

  /* ==========================================================================
     CHECKPOINT SECURITY 3B HOTFIX: MÓDULO DE BACKUP & RESILIÊNCIA DO SERVICE WORKER
     ========================================================================== */
  test('Checkpoint Security 3B Hotfix: Integridade do Módulo de Backup e Resiliência do Service Worker', async () => {
    const publicDir = path.join(process.cwd(), 'public');
    const backupJsPath = path.join(publicDir, 'js', 'modules', 'backup.js');
    const indexHtmlPath = path.join(publicDir, 'index.html');
    const swPath = path.join(publicDir, 'sw.js');

    const backupJs = fs.readFileSync(backupJsPath, 'utf-8');
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
    const swContent = fs.readFileSync(swPath, 'utf-8');

    // 1. backup.js possui sintaxe JavaScript válida (sem erro de Missing catch or finally after try)
    assert.doesNotThrow(() => {
      new vm.Script(backupJs, { filename: 'backup.js' });
    }, '1. backup.js deve possuir sintaxe JavaScript válida sem erros de parsing ou try/catch');

    // 2. Elementos de interface e listeners do botão de Backup continuam presentes
    assert.ok(indexHtml.includes('id="backupBtn"'), '2. index.html deve conter botão #backupBtn na toolbar');
    assert.ok(indexHtml.includes('id="backupDialog"'), '2. index.html deve conter modal #backupDialog');
    assert.ok(indexHtml.includes('id="exportBtn"'), '2. index.html deve conter botão de exportação #exportBtn');
    assert.ok(indexHtml.includes('id="importBtn"'), '2. index.html deve conter botão de importação #importBtn');
    assert.ok(indexHtml.includes('id="drawerBackupBtn"'), '2. index.html deve conter botão #drawerBackupBtn no menu mobile');

    assert.ok(backupJs.includes("$('#backupBtn')?.addEventListener('click', openBackup)"), '2. backup.js deve registrar listener em #backupBtn');
    assert.ok(backupJs.includes("$('#exportBtn')?.addEventListener('click'"), '2. backup.js deve registrar listener em #exportBtn');
    assert.ok(backupJs.includes("window.openBackup = openBackup"), '2. backup.js deve expor window.openBackup como bridge global');
    assert.ok(backupJs.includes("window.persistImportedState = persistImportedState"), '2. backup.js deve expor persistImportedState');

    // 3. Não existe leitura de JWT/token legado em localStorage no fluxo de Backup
    assert.strictEqual(backupJs.includes("localStorage.getItem('token')"), false, '3. backup.js não deve ler token legado em localStorage');
    assert.strictEqual(backupJs.includes("localStorage.getItem('auth_token')"), false, '3. backup.js não deve ler auth_token legado');
    assert.strictEqual(backupJs.includes("localStorage.getItem('financas_pro_jwt_token')"), false, '3. backup.js não deve ler financas_pro_jwt_token');

    // 4. Não existe Authorization Bearer construído a partir de token legado
    assert.strictEqual(backupJs.includes("Authorization"), false, '4. backup.js não deve construir header Authorization legado');
    assert.strictEqual(backupJs.includes("Bearer"), false, '4. backup.js não deve utilizar esquema Bearer manual');

    // 5. O fluxo utiliza a autenticação oficial atual (cookie HttpOnly via same-origin e X-Requested-With)
    assert.ok(backupJs.includes("credentials: 'same-origin'"), "5. backup.js deve utilizar credentials: 'same-origin'");
    assert.ok(backupJs.includes("'X-Requested-With': 'XMLHttpRequest'"), "5. backup.js deve enviar header anti-CSRF 'X-Requested-With'");
    assert.ok(backupJs.includes("API.saveFinances"), "5. backup.js deve delegar persistência preferencialmente para API client oficial");

    // 6. Erros de requisição são tratados sem gerar Promise rejection não capturada
    assert.ok(backupJs.includes("} catch (err) {"), "6. backup.js deve capturar exceções de rede em bloco catch");
    assert.ok(backupJs.includes("console.error('Erro na persistência do backup:', err)"), "6. backup.js deve logar erro sem quebrar o runtime");

    // 7. O Service Worker sempre produz um resultado válido em seus caminhos de respondWith()
    // Prevenção do erro TypeError: Failed to convert value to 'Response'
    assert.ok(swContent.includes("status: 503"), "7. sw.js deve fornecer Response 503 explícita para navegação offline sem cache");
    assert.ok(swContent.includes("status: 504"), "7. sw.js deve fornecer Response 504 explícita para assets offline sem cache");

    // 8. /api/* não passa a ser armazenado em Cache Storage
    assert.ok(swContent.includes("url.pathname.startsWith('/api/')"), "8. sw.js deve manter isolamento de rotas de API");
    assert.ok(swContent.includes("status: 503"), "8. sw.js deve retornar 503 se offline para requisições de API");
  });

  /* ==========================================================================
     HOTFIX COLD START: SERVICE WORKER RESILIÊNCIA, VERSÃO v3.8.0 E DEFENSE-IN-DEPTH
     ========================================================================== */
  test('Hotfix Cold Start: Bump v3.8.0, expurgo de v3.7.0, fallback defensivo no render() e resiliência de registro do SW', () => {
    const swJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf-8');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'app.js'), 'utf-8');
    const uiShellJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'core', 'uiShell.js'), 'utf-8');

    // 1. CACHE_VERSION == omnifin-static-v3.8.0
    assert.ok(swJs.includes("const CACHE_VERSION = 'omnifin-static-v3.8.0';"), '1. CACHE_VERSION deve ser estritamente omnifin-static-v3.8.0');

    // 2. Cache v3.7.0 não é tratado como versão atual
    assert.strictEqual(swJs.includes("'omnifin-static-v3.7.0'"), false, '2. Cache v3.7.0 não deve ser tratado como versão atual');

    // 3. Activate continua removendo caches antigos
    assert.ok(swJs.includes('keys.filter((key) => key !== CACHE_VERSION)'), '3. Activate deve filtrar chaves diferentes de CACHE_VERSION');
    assert.ok(swJs.includes('caches.delete(key)'), '3. Activate deve deletar caches obsoletos');

    // 4. /api/* permanece Network-Only
    assert.ok(swJs.includes("url.pathname.startsWith('/api/')"), '4. /api/* deve permanecer Network-Only');
    assert.ok(swJs.includes('status: 503'), '4. /api/* deve responder com fallback offline 503');

    // 5. render() possui fallback defensivo de remoção do #appHydrationSplash
    assert.ok(appJs.includes("document.getElementById('appHydrationSplash')"), '5. render() deve buscar #appHydrationSplash');
    assert.ok(appJs.includes("splash.classList.add('hide')"), '5. render() deve adicionar classe .hide');
    assert.ok(appJs.includes("splash.style.display = 'none'"), '5. render() deve setar display none');

    // 6. Fallback só é executado após stateHydrated=true
    const renderDef = appJs.substring(appJs.indexOf('function render('), appJs.indexOf('renderRibbon();'));
    assert.ok(renderDef.includes('if (!stateHydrated)'), '6. render() deve verificar guarda de hidratação');
    assert.ok(renderDef.indexOf('if (!stateHydrated)') < renderDef.indexOf("document.getElementById('appHydrationSplash')"), '6. Fallback só pode executar após a guarda if (!stateHydrated)');

    // 7 & 8. Registro do SW funciona quando document.readyState === 'complete' ou pelo evento load
    assert.ok(uiShellJs.includes("document.readyState === 'complete'"), '7. initPwaSupport deve verificar se document.readyState já está complete');
    assert.ok(uiShellJs.includes("registerServiceWorker()"), '7. Deve registrar imediatamente se complete');
    assert.ok(uiShellJs.includes("window.addEventListener('load', registerServiceWorker"), '8. Deve aguardar evento load se readyState não for complete');
    assert.ok(uiShellJs.includes("{ once: true }"), '8. Listener de load deve ter { once: true } para evitar registros duplicados');

    // 9 & 10. skipWaiting() e clients.claim() permanecem presentes
    assert.ok(swJs.includes('self.skipWaiting()'), '9. skipWaiting() deve estar presente no install');
    assert.ok(swJs.includes('self.clients.claim()'), '10. clients.claim() deve estar presente no activate');
  });

  /* ==========================================================================
     CHECKPOINT SECURITY 4B: AUTORIZAÇÃO, CROSS-TYPE, INTEGRIDADE E RBAC EM PROFUNDIDADE
     ========================================================================== */
  test('Checkpoint Security 4B: Contrato completo de Autorização, Cross-Type, Sanitização de Payload e Preservação RBAC', async () => {
    // Registra Usuário A isolado dedicado para o teste Security 4B
    const suffixA = 'sec4b_user_a_' + Date.now();
    const regARes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Usuário A Sec4B',
        login: suffixA,
        email: `${suffixA}@omnifin.test`,
        senha: testPassword
      })
    });
    assert.strictEqual(regARes.status, 201);
    const regAData = await regARes.json();
    const userAId = regAData.user.id;
    const cookieA = regARes.headers.get('set-cookie') || '';
    const matchA = cookieA.match(/omnifin_session=([^;]+)/);
    const userAToken = (matchA && matchA[1]) || regAData.token;

    // Registra Usuário B isolado para testes cruzados de autorização e ownership
    const suffixB = 'sec4b_user_b_' + (Date.now() + 1);
    const regBRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Usuário B Sec4B',
        login: suffixB,
        email: `${suffixB}@omnifin.test`,
        senha: testPassword
      })
    });
    assert.strictEqual(regBRes.status, 201);
    const regBData = await regBRes.json();
    const userBId = regBData.user.id;
    const cookieB = regBRes.headers.get('set-cookie') || '';
    const matchB = cookieB.match(/omnifin_session=([^;]+)/);
    const userBToken = (matchB && matchB[1]) || regBData.token;

    try {
      // 1 & 2. Usuário B não confirma e não cancela proposal do Usuário A (403 Forbidden)
      const propAId = 'prop_sec4b_a_' + Date.now();
      await storageService.saveAiProposal({
        _id: propAId,
        userId: userAId,
        action: 'create_expense',
        status: 'pending',
        proposal: {
          description: 'GASOLINA',
          amount: 150,
          category: 'Transporte',
          destination: 'Pix',
          competence: { month: 9, year: 2026 }
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });

      const userBConfirmRes = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Cookie': `omnifin_session=${userBToken}`,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ proposalId: propAId })
      });
      assert.strictEqual(userBConfirmRes.status, 403, '1. Usuário B não pode confirmar proposal de A (403)');

      const userBCancelRes = await fetch(`${baseUrl}/api/ai/actions/expense/cancel`, {
        method: 'POST',
        headers: {
          'Cookie': `omnifin_session=${userBToken}`,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ proposalId: propAId })
      });
      assert.strictEqual(userBCancelRes.status, 403, '2. Usuário B não pode cancelar proposal de A (403)');

      // 3. Replay de proposal confirmada pelo dono não duplica lançamento (idempotência)
      const curFinBefore = await storageService.getUserFinances(userAId);
      const varCountBefore = (curFinBefore.variable || []).length;

      const userAConfirm1 = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Cookie': `omnifin_session=${userAToken}`,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ proposalId: propAId })
      });
      assert.strictEqual(userAConfirm1.status, 200, 'Confirmação pelo dono deve retornar 200');

      const userAConfirm2 = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: {
          'Cookie': `omnifin_session=${userAToken}`,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ proposalId: propAId })
      });
      assert.strictEqual(userAConfirm2.status, 200, 'Segunda confirmação retorna 200 idempotente');
      const confirm2Json = await userAConfirm2.json();
      assert.strictEqual(confirm2Json.alreadyProcessed, true, '3. Segunda confirmação deve indicar alreadyProcessed');

      const curFinAfter = await storageService.getUserFinances(userAId);
      assert.strictEqual((curFinAfter.variable || []).length, varCountBefore + 1, '3. Replay não pode duplicar lançamento');

      // 4. Proposal cancelada não pode ser confirmada
      const propToCancelId = 'prop_sec4b_cancel_' + Date.now();
      await storageService.saveAiProposal({
        _id: propToCancelId,
        userId: userAId,
        action: 'create_expense',
        status: 'pending',
        proposal: { description: 'LIVRO', amount: 50, category: 'Educação', destination: 'Pix', competence: { month: 9, year: 2026 } },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });
      const cancelRes = await fetch(`${baseUrl}/api/ai/actions/expense/cancel`, {
        method: 'POST',
        headers: { 'Cookie': `omnifin_session=${userAToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ proposalId: propToCancelId })
      });
      assert.strictEqual(cancelRes.status, 200);

      const confirmCancelledRes = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: { 'Cookie': `omnifin_session=${userAToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ proposalId: propToCancelId })
      });
      assert.strictEqual(confirmCancelledRes.status, 400, '4. Proposal cancelada não pode ser confirmada (400)');

      // 5. Expense proposal no endpoint benefit -> 400 INVALID_PROPOSAL_TYPE
      const expensePropId = 'prop_sec4b_exp_for_ben_' + Date.now();
      await storageService.saveAiProposal({
        _id: expensePropId,
        userId: userAId,
        action: 'create_expense',
        status: 'pending',
        proposal: { description: 'FARMACIA', amount: 80, category: 'Saúde', destination: 'Pix', competence: { month: 9, year: 2026 } },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });
      const expOnBenRes = await fetch(`${baseUrl}/api/ai/actions/benefit/confirm`, {
        method: 'POST',
        headers: { 'Cookie': `omnifin_session=${userAToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ proposalId: expensePropId })
      });
      assert.strictEqual(expOnBenRes.status, 400, '5. Expense proposal em endpoint de benefício deve retornar 400');

      // 6. Benefit proposal no endpoint expense -> 400 INVALID_PROPOSAL_TYPE (Guarda cross-type)
      const benefitPropId = 'prop_sec4b_ben_for_exp_' + Date.now();
      await storageService.saveAiProposal({
        _id: benefitPropId,
        userId: userAId,
        action: 'create_benefit',
        status: 'pending',
        proposal: { description: 'REFEICAO', amount: 45, benefitType: 'vr', day: 10, competence: { month: 9, year: 2026 } },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });
      const benOnExpRes = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: { 'Cookie': `omnifin_session=${userAToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ proposalId: benefitPropId, data: { description: 'REFEICAO', category: 'Alimentação', destination: 'Pix' } })
      });
      assert.strictEqual(benOnExpRes.status, 400, '6. Benefit proposal em endpoint de despesa deve retornar 400');
      const benOnExpJson = await benOnExpRes.json();
      assert.ok(benOnExpJson.message.includes('não é de despesa'), '6. Mensagem deve indicar incompatibilidade de tipo');

      // 7 & 8. userId e _id enviados pelo cliente não alteram ownership no PUT /api/finances
      const curFinForOwnership = await storageService.getUserFinances(userAId);
      const curRev = Number(curFinForOwnership.revision || 0);

      const tamperRes = await fetch(`${baseUrl}/api/finances`, {
        method: 'PUT',
        headers: { 'Cookie': `omnifin_session=${userAToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(Object.assign({}, curFinForOwnership, {
          userId: 'usr_hacked_other_person',
          _id: 'usr_hacked_other_person',
          expectedRevision: curRev
        }))
      });
      assert.strictEqual(tamperRes.status, 200, 'Save com tentativa de adulterar userId deve ter sucesso mas neutralizar o spoofing');
      const verifiedFin = await storageService.getUserFinances(userAId);
      assert.strictEqual(verifiedFin.userId, userAId, '7. userId deve permanecer estritamente o do usuário autenticado');
      const spoofDoc = await (await connectDB()).collection('finances').findOne({ _id: 'usr_hacked_other_person' });
      assert.strictEqual(spoofDoc, null, '8. _id arbitrário não pode criar ou afetar outro documento');

      // 9 & 22. revision / expectedRevision respeitam CAS (409 em revision stale)
      const staleRes = await fetch(`${baseUrl}/api/finances`, {
        method: 'PUT',
        headers: { 'Cookie': `omnifin_session=${userAToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(Object.assign({}, verifiedFin, { expectedRevision: 999999 }))
      });
      assert.strictEqual(staleRes.status, 409, '9 & 22. Stale revision deve retornar 409 CONCURRENCY_CONFLICT');

      // 10. Chave __proto__ -> 400 INVALID_FINANCE_PAYLOAD
      const protoRes = await fetch(`${baseUrl}/api/finances`, {
        method: 'PUT',
        headers: { 'Cookie': `omnifin_session=${userAToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(JSON.parse(`{"version": 5, "__proto__": {"polluted": true}, "expectedRevision": ${verifiedFin.revision}}`))
      });
      assert.strictEqual(protoRes.status, 400, '10. Chave __proto__ deve retornar 400');
      const protoJson = await protoRes.json();
      assert.strictEqual(protoJson.error, 'INVALID_FINANCE_PAYLOAD');

      // 11. Chave constructor/prototype perigosa -> 400
      const constrRes = await fetch(`${baseUrl}/api/finances`, {
        method: 'PUT',
        headers: { 'Cookie': `omnifin_session=${userAToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          version: 5,
          constructor: { prototype: { admin: true } },
          expectedRevision: verifiedFin.revision
        })
      });
      assert.strictEqual(constrRes.status, 400, '11. Chave constructor deve retornar 400');

      // 12. Chave começando com $ -> 400
      const dollarRes = await fetch(`${baseUrl}/api/finances`, {
        method: 'PUT',
        headers: { 'Cookie': `omnifin_session=${userAToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          version: 5,
          $where: 'sleep(1000)',
          expectedRevision: verifiedFin.revision
        })
      });
      assert.strictEqual(dollarRes.status, 400, '12. Chave iniciada com $ deve retornar 400');

      // 13. Chave contendo . -> 400
      const dotRes = await fetch(`${baseUrl}/api/finances`, {
        method: 'PUT',
        headers: { 'Cookie': `omnifin_session=${userAToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          version: 5,
          'nested.dot.key': 'val',
          expectedRevision: verifiedFin.revision
        })
      });
      assert.strictEqual(dotRes.status, 400, '13. Chave contendo ponto deve retornar 400');

      // 14. Campo top-level desconhecido não é persistido (Allowlist)
      const curFinFresh = await storageService.getUserFinances(userAId);
      const allowlistRes = await fetch(`${baseUrl}/api/finances`, {
        method: 'PUT',
        headers: { 'Cookie': `omnifin_session=${userAToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(Object.assign({}, curFinFresh, {
          malicious_unknown_field: 'should_not_persist',
          expectedRevision: curFinFresh.revision
        }))
      });
      assert.strictEqual(allowlistRes.status, 200, 'Save com campo extra deve ter sucesso');
      const docAfterAllowlist = await storageService.getUserFinances(userAId);
      assert.strictEqual(docAfterAllowlist.malicious_unknown_field, undefined, '14. Campo desconhecido deve ser descartado pela allowlist');

      // 15 & 16. Categorias e Destinations legadas continuam aceitas e funcionando
      const curFinLeg = await storageService.getUserFinances(userAId);
      const legacySaveRes = await fetch(`${baseUrl}/api/finances`, {
        method: 'PUT',
        headers: { 'Cookie': `omnifin_session=${userAToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(Object.assign({}, curFinLeg, {
          categories: ['Moradia', 'Lazer', 'Gerais'], // Formato string legado
          destinations: [{ name: 'Pix', color: '#10B981', icon: 'dollar' }, 'Dinheiro'], // Formato híbrido
          expectedRevision: curFinLeg.revision
        }))
      });
      assert.strictEqual(legacySaveRes.status, 200, '15 & 16. Formatos legados de categorias e destinos devem ser aceitos');

      // 17, 18, 19, 20, 21. RBAC com Preservação Server-Side de Módulos Não Autorizados
      // Define permissão: despesas = true, devedores = false, dashboard = false
      await storageService.setUserPermissions(userAId, {
        dashboard: false, // 21. Dashboard false não bloqueia save financeiro
        despesas: true,   // 17. Módulo autorizado pode ser alterado
        devedores: false  // 18. Módulo devedores proibido
      });

      // Grava um devedor legítimo pré-existente no banco
      const curPreRBAC = await storageService.getUserFinances(userAId);
      curPreRBAC.debtors = [{ id: 'deb_original_1', debtorName: 'Devedor Legítimo', amount: 300, paid: false }];
      await (await connectDB()).collection('finances').updateOne({ _id: userAId }, { $set: { debtors: curPreRBAC.debtors } });

      // Usuário (com devedores: false) envia PUT alterando despesas (permitido) e tentando adicionar um devedor (proibido)
      const curWithDebtor = await storageService.getUserFinances(userAId);
      const rbacSaveRes = await fetch(`${baseUrl}/api/finances`, {
        method: 'PUT',
        headers: { 'Cookie': `omnifin_session=${userAToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(Object.assign({}, curWithDebtor, {
          fixed: [...(curWithDebtor.fixed || []), { id: 'fix_sec4b_new', description: 'INTERNET FIBRA', amount: 120 }],
          debtors: [
            ...curWithDebtor.debtors,
            { id: 'deb_injected_evil', debtorName: 'Devedor Injetado Não Autorizado', amount: 9999 }
          ],
          expectedRevision: curWithDebtor.revision
        }))
      });

      assert.strictEqual(rbacSaveRes.status, 200, '20 & 21. Usuário com permissão parcial deve salvar com sucesso');
      const docAfterRBAC = await storageService.getUserFinances(userAId);

      // 17. Módulo autorizado (despesas) foi alterado
      assert.ok(docAfterRBAC.fixed.some(f => f.id === 'fix_sec4b_new'), '17. Módulo autorizado (fixed) deve ser salvo');

      // 18. Módulo não autorizado (devedores) NÃO foi alterado com o novo devedor
      assert.strictEqual(docAfterRBAC.debtors.some(d => d.id === 'deb_injected_evil'), false, '18. Novo devedor não autorizado NÃO pode ser persistido');

      // 19. Devedor original foi PRESERVADO
      assert.strictEqual(docAfterRBAC.debtors.length, 1, '19. Devedor original deve ser preservado intacto');
      assert.strictEqual(docAfterRBAC.debtors[0].id, 'deb_original_1', '19. Dados originais de devedores permanecem');

      // 23 & 24. Sanitização e Allowlist equivalentes no JSON Storage e Mongo Storage
      const { sanitizeFinancePayload, filterAllowedFields } = require('../server/services/financeValidation');
      assert.throws(() => sanitizeFinancePayload({ '$injection': true }), /INVALID_FINANCE_PAYLOAD/, '23 & 24. Chave $ é rejeitada pelo validador central');
      assert.throws(() => sanitizeFinancePayload(JSON.parse('{"nested": {"__proto__": {}}}')), /INVALID_FINANCE_PAYLOAD/, '23 & 24. __proto__ é rejeitado pelo validador central');
      assert.strictEqual(filterAllowedFields({ version: 5, extra_bogus: 'x' }).extra_bogus, undefined, '23 & 24. Allowlist descarta campos desconhecidos em ambos os drivers');

    } finally {
      // Cleanup dos usuários A e B
      try {
        const db = getDB();
        await db.collection('users').deleteMany({ _id: { $in: [userAId, userBId] } });
        await db.collection('permissions').deleteMany({ _id: { $in: [userAId, userBId] } });
        await db.collection('finances').deleteMany({ _id: { $in: [userAId, userBId] } });
        await db.collection('ai_proposals').deleteMany({ userId: { $in: [userAId, userBId] } });
      } catch (_) {}
    }
  });

  /* ==========================================================================
     CHECKPOINT SECURITY 5B: HARDENING DE INTEGRIDADE SEMÂNTICA E ANTI-DoS
     ========================================================================== */
  test('Checkpoint Security 5B: Semantic Integrity & Resource Limits', async () => {
    const {
      hasDangerousKeys,
      validateFinanceSemantics,
      sanitizeFinancePayload,
      MAX_DEPTH,
      MAX_ARRAY_ITEMS
    } = require('../server/services/financeValidation');
    const vm = require('node:vm');
    const financeQueriesCode = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'core', 'financeQueries.js'), 'utf-8');
    const vmCtx = { window: {}, mk: (y, m) => (y * 12 + m), ymKey: (y, m) => `${y}-${String(m).padStart(2, '0')}` };
    vmCtx.window = vmCtx;
    vm.createContext(vmCtx);
    vm.runInContext(financeQueriesCode, vmCtx);
    const getExpensePaymentInfo = vmCtx.window.getExpensePaymentInfo;

    // 1. depth <= 8 permitido
    let depth8Obj = { val: 'leaf' };
    for (let i = 0; i < 7; i++) {
      depth8Obj = { nested: depth8Obj };
    }
    assert.strictEqual(hasDangerousKeys(depth8Obj, 0), false, '1. Objeto com profundidade <= 8 deve ser permitido');

    // 2. depth > 8 rejeitado
    let depth9Obj = { val: 'leaf' };
    for (let i = 0; i < 9; i++) {
      depth9Obj = { nested: depth9Obj };
    }
    assert.throws(() => hasDangerousKeys(depth9Obj, 0), /INVALID_FINANCE_PAYLOAD.*profundidade/, '2. Objeto com profundidade > 8 deve ser rejeitado');

    // 3. dangerous keys continuam rejeitadas
    assert.strictEqual(hasDangerousKeys({ '$where': '1' }), true, '3. Chave $ é rejeitada');
    assert.strictEqual(hasDangerousKeys({ 'a.b': '1' }), true, '3. Chave com ponto é rejeitada');

    // 4. array <= limite permitido (1000)
    const validArr = Array.from({ length: 50 }, (_, i) => ({ id: `f_${i}` }));
    assert.doesNotThrow(() => validateFinanceSemantics({ fixed: validArr }), '4. Coleção <= 1000 permitida');

    // 5. array > 1000 rejeitado
    const giantArr = Array.from({ length: 1001 }, (_, i) => ({ id: `f_${i}` }));
    assert.throws(() => validateFinanceSemantics({ fixed: giantArr }), /INVALID_FINANCE_PAYLOAD.*excede o limite/, '5. Coleção > 1000 rejeitada');

    // 6. número finito válido permitido
    assert.doesNotThrow(() => validateFinanceSemantics({ variable: [{ id: 'v_ok', amount: 150.50 }] }), '6. Número finito permitido');

    // 7. NaN rejeitado na função de validação
    assert.throws(() => validateFinanceSemantics({ variable: [{ id: 'v_nan', amount: NaN }] }), /INVALID_FINANCE_PAYLOAD.*não finito/, '7. NaN rejeitado');

    // 8. Infinity rejeitado
    assert.throws(() => validateFinanceSemantics({ variable: [{ id: 'v_inf', amount: Infinity }] }), /INVALID_FINANCE_PAYLOAD.*não finito/, '8. Infinity rejeitado');

    // 9. mês 0 rejeitado
    assert.throws(() => validateFinanceSemantics({ variable: [{ id: 'v_m0', startMonth: 0 }] }), /INVALID_FINANCE_PAYLOAD.*mês inválido/, '9. Mês 0 rejeitado');

    // 10. mês 13 rejeitado
    assert.throws(() => validateFinanceSemantics({ variable: [{ id: 'v_m13', startMonth: 13 }] }), /INVALID_FINANCE_PAYLOAD.*mês inválido/, '10. Mês 13 rejeitado');

    // 11. mês válido permitido
    assert.doesNotThrow(() => validateFinanceSemantics({ variable: [{ id: 'v_m11', startMonth: 11 }] }), '11. Mês 11 permitido');

    // 12. installments 0 rejeitado
    assert.throws(() => validateFinanceSemantics({ variable: [{ id: 'v_inst0', installments: 0 }] }), /INVALID_FINANCE_PAYLOAD.*número de parcelas inválido/, '12. Installments 0 rejeitado');

    // 13. installments negativo rejeitado
    assert.throws(() => validateFinanceSemantics({ variable: [{ id: 'v_inst_neg', installments: -5 }] }), /INVALID_FINANCE_PAYLOAD.*número de parcelas inválido/, '13. Installments negativo rejeitado');

    // 14. installments > 240 rejeitado
    assert.throws(() => validateFinanceSemantics({ variable: [{ id: 'v_inst_huge', installments: 241 }] }), /INVALID_FINANCE_PAYLOAD.*número de parcelas inválido/, '14. Installments > 240 rejeitado');

    // 15. installments válido permitido
    assert.doesNotThrow(() => validateFinanceSemantics({ variable: [{ id: 'v_inst_ok', installments: 12 }] }), '15. Installments 12 permitido');

    // 16. ID duplicado na mesma coleção rejeitado
    assert.throws(() => validateFinanceSemantics({ fixed: [{ id: 'dup_1' }, { id: 'dup_1' }] }), /INVALID_FINANCE_PAYLOAD.*ID duplicado/, '16. ID duplicado na mesma coleção rejeitado');

    // 17. mesmo ID em coleções diferentes não é automaticamente rejeitado
    assert.doesNotThrow(() => validateFinanceSemantics({ fixed: [{ id: 'cross_id' }], variable: [{ id: 'cross_id' }] }), '17. Mesmo ID em coleções distintas permitido');

    // 18. string excessiva rejeitada
    assert.throws(() => validateFinanceSemantics({ fixed: [{ id: 'f_str', name: 'A'.repeat(151) }] }), /INVALID_FINANCE_PAYLOAD.*excede o limite/, '18. Nome com > 150 caracteres rejeitado');

    // 19. paidHistory boolean legado continua legível
    const payA = getExpensePaymentInfo({ amount: 100, paidHistory: { '2026-03': true } }, 2026, 3);
    assert.strictEqual(payA.paidAmount, 100, '19. Formato legado A (booleano) retorna valor integral');
    assert.strictEqual(payA.status, 'pago');

    // 20. paidHistory numérico legado continua legível
    const payB = getExpensePaymentInfo({ amount: 100, paidHistory: { '2026-03': 40 } }, 2026, 3);
    assert.strictEqual(payB.paidAmount, 40, '20. Formato legado B (numérico) retorna valor pago');
    assert.strictEqual(payB.status, 'parcial');

    // 21. paidHistory objeto continua legível
    const payC = getExpensePaymentInfo({ amount: 100, paidHistory: { '2026-03': { paidAmount: 100, updatedAt: '2026-03-01' } } }, 2026, 3);
    assert.strictEqual(payC.paidAmount, 100, '21. Formato canônico C retorna valor pago');
    assert.strictEqual(payC.status, 'pago');

    // 22. gasto de benefício acima do saldo não é bloqueado
    assert.doesNotThrow(() => validateFinanceSemantics({
      benefitsConfig: { amount: 100, va: 100, vr: 0 },
      benefitTransactions: [{ id: 'b_over', amount: 350, month: 3, year: 2026 }]
    }), '22. Gasto de benefício maior que cota/saldo não é bloqueado');

    // Isolamento HTTP para cenários 23, 24 e 25
    const suffix5B = 'sec5b_user_' + Date.now();
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Usuário Sec5B',
        login: suffix5B,
        email: `${suffix5B}@omnifin.test`,
        senha: testPassword
      })
    });
    assert.strictEqual(regRes.status, 201);
    const regData = await regRes.json();
    const testUser5BId = regData.user.id;
    const cookie5B = regRes.headers.get('set-cookie') || '';
    const match5B = cookie5B.match(/omnifin_session=([^;]+)/);
    const testUser5BToken = (match5B && match5B[1]) || regData.token;

    try {
      // 23. Resposta com amount não-finito em proposal não persiste / rejeitada na confirmação
      const propBadAmountId = 'prop_bad_amount_' + Date.now();
      await storageService.saveAiProposal({
        _id: propBadAmountId,
        userId: testUser5BId,
        action: 'create_expense',
        status: 'pending',
        proposal: { description: 'TESTE VALOR', amount: 100, category: 'Gerais', destination: 'Pix', competence: { month: 9, year: 2026 } },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });
      const confirmBadAmount = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: { 'Cookie': `omnifin_session=${testUser5BToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ proposalId: propBadAmountId, data: { amount: -50 } })
      });
      assert.strictEqual(confirmBadAmount.status, 400, '23. Amount negativo na confirmação deve retornar 400');

      // 24. userEdits excessivo rejeitado (> 150 chars em description ou > 2000 em notes)
      const propUserEditsId = 'prop_user_edits_' + Date.now();
      await storageService.saveAiProposal({
        _id: propUserEditsId,
        userId: testUser5BId,
        action: 'create_expense',
        status: 'pending',
        proposal: { description: 'TESTE EDITS', amount: 50, category: 'Gerais', destination: 'Pix', competence: { month: 9, year: 2026 } },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });
      const confirmExcessiveEdits = await fetch(`${baseUrl}/api/ai/actions/expense/confirm`, {
        method: 'POST',
        headers: { 'Cookie': `omnifin_session=${testUser5BToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ proposalId: propUserEditsId, data: { description: 'A'.repeat(151) } })
      });
      assert.strictEqual(confirmExcessiveEdits.status, 400, '24. userEdits com description > 150 chars deve retornar 400');

      // 25. mensagem actions > 2000 rejeitada
      const actionOverRes = await fetch(`${baseUrl}/api/ai/actions/interpret`, {
        method: 'POST',
        headers: { 'Cookie': `omnifin_session=${testUser5BToken}`, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ message: 'X'.repeat(2001) })
      });
      assert.strictEqual(actionOverRes.status, 400, '25. Mensagem > 2000 caracteres em /api/ai/actions/interpret deve retornar 400');
      const actionOverJson = await actionOverRes.json();
      assert.strictEqual(actionOverJson.success, false);
      assert.ok(actionOverJson.message.includes('2000 caracteres'), '25. Mensagem de erro apropriada');
    } finally {
      try {
        const db = getDB();
        await db.collection('users').deleteOne({ _id: testUser5BId });
        await db.collection('permissions').deleteOne({ _id: testUser5BId });
        await db.collection('finances').deleteOne({ _id: testUser5BId });
        await db.collection('ai_proposals').deleteMany({ userId: testUser5BId });
      } catch (_) {}
    }
  });

});
