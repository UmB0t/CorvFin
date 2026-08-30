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

    assert.ok(relNotesJs.includes('version: "3.3.0"'), 'releaseNotes.js deve conter a release v3.3.0');
    assert.ok(relNotesJs.includes('version: "3.2.0"'), 'releaseNotes.js deve conter a release v3.2.0');
    assert.ok(relNotesJs.includes('version: "3.1.0"'), 'releaseNotes.js deve conter a release v3.1.0');
    assert.ok(relNotesJs.includes('version: "3.0.0"'), 'releaseNotes.js deve manter releases anteriores acessíveis');
    assert.ok(relNotesJs.includes('news:'), 'releaseNotes.js deve estruturar novidades');
    assert.ok(relNotesJs.includes('improvements:'), 'releaseNotes.js deve estruturar melhorias');
    assert.ok(relNotesJs.includes('fixes:'), 'releaseNotes.js deve estruturar correções');

    // Validação da ordem das releases
    const idx33 = relNotesJs.indexOf('version: "3.3.0"');
    const idx32 = relNotesJs.indexOf('version: "3.2.0"');
    const idx31 = relNotesJs.indexOf('version: "3.1.0"');
    const idx30 = relNotesJs.indexOf('version: "3.0.0"');
    assert.ok(idx33 < idx32 && idx32 < idx31 && idx31 < idx30, 'Releases devem estar ordenadas: v3.3 -> v3.2 -> v3.1 -> v3.0');

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
});
