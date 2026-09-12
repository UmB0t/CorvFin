/**
 * CorvFin V2 — Suíte de Testes da Calendar Projection API (Lote B)
 *
 * Cobertura mandatória:
 * 1. Autenticação obrigatória (sem token -> 401)
 * 2. Request válida retorna 200
 * 3. year/month numéricos válidos
 * 4. year ausente -> 400
 * 5. month ausente -> 400
 * 6. month 0 -> 400
 * 7. month 13 -> 400
 * 8. year fora do range (1999 ou 2101) -> 400
 * 9. month decimal (ex: 9.5) -> 400
 * 10. year decimal (ex: 2026.5) -> 400
 * 11. Valores não numéricos -> 400
 * 12. Query array (ex: year[]=2026) -> 400
 * 13. Mês vazio -> 200 com arrays vazios e summary zerado
 * 14. Fixed datado aparece em events
 * 15. Undated permanece em undated com date null
 * 16. Summary corresponde ao motor canônico
 * 17. Benefits continuam estritamente segregados
 * 18. Rota não permite selecionar outro userId (ignora query/body e isola dados)
 * 19. Erro interno é tratado sem vazar stack trace
 * 20. Response mantém competence canonical YYYY-MM
 * 21. Integração comprovada com projectFinancialMonth (respeita clamping temporal do motor)
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const config = require('../server/config/config');
const app = require('../server/server');
const storageService = require('../server/services/storageService');
const planService = require('../server/services/planService');
const { generateToken } = require('../server/services/authService');
const {
  setupIsolatedTestMongo,
  teardownIsolatedTestMongo
} = require('./helpers/testDbIsolation');

describe('CORVFIN V2 — LOTE B — CALENDAR PROJECTION API (GET /api/finances/calendar)', () => {
  let server;
  let baseUrl;
  const isMongo = config.STORAGE_DRIVER === 'mongodb';
  let testDbInfo = null;

  const tempTestDir = path.join(os.tmpdir(), `corvfin_test_cal_b_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const originalPlansFile = config.PLANS_FILE;
  const originalUsersFile = config.USERS_FILE;

  const testUserA = {
    id: 'usr_cal_tester_a',
    nome: 'Tester Calendário A',
    email: 'tester_a_cal@corvfin.com.br',
    login: 'tester_a_cal',
    role: 'user',
    is_admin: false,
    emailVerified: true
  };

  const testUserB = {
    id: 'usr_cal_tester_b',
    nome: 'Tester Calendário B',
    email: 'tester_b_cal@corvfin.com.br',
    login: 'tester_b_cal',
    role: 'user',
    is_admin: false,
    emailVerified: true
  };

  let tokenA;
  let tokenB;

  const financesUserA = {
    profile: {
      baseSalary: 5000,
      salaryPayment: { type: 'fixed_day', day: 5 }
    },
    fixed: [
      {
        id: 'fix_aluguel',
        name: 'Aluguel',
        amount: 1500,
        dueDay: 10,
        payment: { method: 'pix', account: 'Nubank' },
        temporal: { type: 'fixed' }
      },
      {
        id: 'fix_undated',
        name: 'Assinatura Sem Dia',
        amount: 50,
        dueDay: null,
        temporal: { type: 'fixed' }
      },
      {
        id: 'fix_clamp',
        name: 'Serviço Dia 31',
        amount: 200,
        dueDay: 31, // Em setembro (30 dias) deve sofrer clamp para 2026-09-30
        temporal: { type: 'fixed' }
      }
    ],
    variable: [
      {
        id: 'var_tv',
        name: 'Smart TV',
        totalAmount: 1200,
        amount: 400,
        installmentAmount: 400,
        installments: 3,
        amountInputMode: 'total',
        startYear: 2026,
        startMonth: 8,
        dueDay: 15
      }
    ],
    extras: [
      {
        id: 'ext_freela',
        title: 'Freela Design',
        amount: 800,
        receiveDate: '2026-09-20'
      }
    ],
    debtors: [
      {
        id: 'deb_joao',
        debtorName: 'João Silva',
        amount: 300,
        startYear: 2026,
        startMonth: 9,
        receiveDay: 25,
        countInTotal: true
      }
    ],
    benefitsConfig: {
      amount: 600
    },
    benefitTransactions: [
      {
        id: 'bt_mercado',
        description: 'Supermercado',
        amount: 120,
        year: 2026,
        month: 9,
        day: 12
      }
    ]
  };

  before(async () => {
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true });
    }
    config.PLANS_FILE = path.join(tempTestDir, 'plans.json');
    config.USERS_FILE = path.join(tempTestDir, 'users.json');

    if (isMongo) {
      testDbInfo = await setupIsolatedTestMongo('calendar_api_b');
    }

    await planService.ensureDefaultPlan();

    // Persiste usuários de teste no banco isolado
    await storageService.saveUsers([testUserA, testUserB]);

    // Persiste dados financeiros do Usuário A
    await storageService.saveUserFinances(testUserA.id, financesUserA);

    // Inicializa servidor HTTP em porta efêmera (0)
    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}`;
        resolve();
      });
    });

    tokenA = generateToken(testUserA);
    tokenB = generateToken(testUserB);
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (isMongo && testDbInfo) {
      await teardownIsolatedTestMongo(testDbInfo.testDbName);
    }
    config.PLANS_FILE = originalPlansFile;
    config.USERS_FILE = originalUsersFile;
  });

  test('1. Autenticação obrigatória: sem token retorna 401', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=9`);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(data.message.includes('não autorizado'));
  });

  test('2. Request válida autenticada retorna HTTP 200 com payload estruturado', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=9`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.year, 2026);
    assert.equal(data.month, 9);
    assert.equal(data.competence, '2026-09');
    assert.ok(Array.isArray(data.events));
    assert.ok(Array.isArray(data.undated));
    assert.ok(typeof data.summary === 'object');
    assert.ok(typeof data.benefits === 'object');
  });

  test('3. year e month numéricos válidos são processados com sucesso', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2025&month=12`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.year, 2025);
    assert.equal(data.month, 12);
    assert.equal(data.competence, '2025-12');
  });

  test('4. year ausente retorna 400 (INVALID_QUERY_PARAMS)', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?month=9`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.error, 'INVALID_QUERY_PARAMS');
  });

  test('5. month ausente retorna 400 (INVALID_QUERY_PARAMS)', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.error, 'INVALID_QUERY_PARAMS');
  });

  test('6. month 0 retorna 400 (INVALID_PROJECTION_PERIOD)', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=0`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.error, 'INVALID_PROJECTION_PERIOD');
  });

  test('7. month 13 retorna 400 (INVALID_PROJECTION_PERIOD)', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=13`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.error, 'INVALID_PROJECTION_PERIOD');
  });

  test('8. year fora do range aceito (1999 ou 2101) retorna 400', async () => {
    const resLow = await fetch(`${baseUrl}/api/finances/calendar?year=1999&month=5`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(resLow.status, 400);
    const dataLow = await resLow.json();
    assert.equal(dataLow.error, 'INVALID_PROJECTION_PERIOD');

    const resHigh = await fetch(`${baseUrl}/api/finances/calendar?year=2101&month=5`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(resHigh.status, 400);
    const dataHigh = await resHigh.json();
    assert.equal(dataHigh.error, 'INVALID_PROJECTION_PERIOD');
  });

  test('9. month decimal retorna 400 (INVALID_PROJECTION_PERIOD)', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=9.5`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.error, 'INVALID_PROJECTION_PERIOD');
  });

  test('10. year decimal retorna 400 (INVALID_PROJECTION_PERIOD)', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026.5&month=9`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.error, 'INVALID_PROJECTION_PERIOD');
  });

  test('11. Valores não numéricos retornam 400', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=dois_mil&month=setembro`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.error, 'INVALID_PROJECTION_PERIOD');
  });

  test('12. Query com formato array (year[]=2026) retorna 400', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year[]=2026&month=9`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.error, 'INVALID_QUERY_PARAMS');
  });

  test('13. Mês vazio retorna HTTP 200 com arrays vazios e summary zerado', async () => {
    // Competência em 2029 onde não há nenhuma ocorrência cadastrada
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2029&month=1`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.year, 2029);
    assert.equal(data.month, 1);
    assert.equal(data.competence, '2029-01');
    assert.deepEqual(data.events, []);
    assert.deepEqual(data.undated, []);
    assert.deepEqual(data.summary, { inflow: 0, outflow: 0, net: 0 });
    assert.deepEqual(data.benefits.events, []);
    assert.deepEqual(data.benefits.undated, []);
    assert.deepEqual(data.benefits.summary, { inflow: 0, outflow: 0, net: 0 });
  });

  test('14. Fixed datado aparece em events com data civil e direção outflow', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=9`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    const aluguel = data.events.find(e => e.sourceId === 'fix_aluguel');
    assert.ok(aluguel, 'fix_aluguel deve estar presente em events');
    assert.equal(aluguel.date, '2026-09-10');
    assert.equal(aluguel.direction, 'outflow');
    assert.equal(aluguel.amount, 1500);
  });

  test('15. Undated permanece em undated com date null', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=9`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    const undatedItem = data.undated.find(u => u.sourceId === 'fix_undated');
    assert.ok(undatedItem, 'fix_undated deve estar presente em undated');
    assert.equal(undatedItem.date, null);
    assert.equal(undatedItem.amount, 50);
  });

  test('16. Summary corresponde exatamente aos valores calculados pelo motor', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=9`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    // Inflow: Salário (5000) + Freela (800) + Devedor (300) = 6100
    assert.equal(data.summary.inflow, 6100);
    // Outflow: Aluguel (1500) + Undated (50) + Clamp (200) + TV parcela 2 (400) = 2150
    assert.equal(data.summary.outflow, 2150);
    // Net: 6100 - 2150 = 3950
    assert.equal(data.summary.net, 3950);
  });

  test('17. Benefits continuam estritamente segregados e não afetam summary bancário', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=9`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.benefits.events.length, 1);
    assert.equal(data.benefits.events[0].sourceId, 'bt_mercado');
    assert.equal(data.benefits.events[0].amount, 120);

    assert.equal(data.benefits.undated.length, 1);
    assert.equal(data.benefits.undated[0].sourceId, 'benefitsConfig');
    assert.equal(data.benefits.undated[0].amount, 600);

    assert.equal(data.benefits.summary.inflow, 600);
    assert.equal(data.benefits.summary.outflow, 120);
    assert.equal(data.benefits.summary.net, 480);
  });

  test('18. Rota não permite selecionar outro userId (ignora query/body e isola dados)', async () => {
    // Usuário B tenta passar userId de A na query string
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=9&userId=${testUserA.id}`, {
      headers: { 'Authorization': `Bearer ${tokenB}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    // Deve retornar dados vazios do Usuário B, NUNCA os dados do Usuário A
    assert.equal(data.events.length, 0);
    assert.equal(data.undated.length, 0);
    assert.equal(data.summary.inflow, 0);
    assert.equal(data.summary.outflow, 0);
  });

  test('19. Erro interno é tratado sem vazar stack trace nem caminhos internos', async () => {
    // Simula uma chamada onde activeStorage falha
    const activeStorage = config.STORAGE_DRIVER === 'mongodb'
      ? require('../server/services/mongoStorage')
      : require('../server/services/jsonStorage');
    const origGetUserFinances = activeStorage.getUserFinances;
    activeStorage.getUserFinances = async () => {
      throw new Error('SIMULATED_DB_FAILURE_SECRET_PATH_/var/data/mongo');
    };

    try {
      const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=9`, {
        headers: { 'Authorization': `Bearer ${tokenA}` }
      });
      assert.equal(res.status, 500);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.message, 'Erro interno ao gerar projeção do calendário financeiro.');
      assert.equal(data.stack, undefined);
      assert.equal(JSON.stringify(data).includes('SECRET_PATH'), false);
    } finally {
      activeStorage.getUserFinances = origGetUserFinances;
    }
  });

  test('20. Response mantém competence canonical YYYY-MM para todos os meses', async () => {
    const resSingleDigit = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=3`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const dataSingle = await resSingleDigit.json();
    assert.equal(dataSingle.competence, '2026-03');

    const resDoubleDigit = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=11`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    const dataDouble = await resDoubleDigit.json();
    assert.equal(dataDouble.competence, '2026-11');
  });

  test('21. Integração comprovada com projectFinancialMonth: respeita clamping temporal de dia 31 em setembro', async () => {
    const res = await fetch(`${baseUrl}/api/finances/calendar?year=2026&month=9`, {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    // fix_clamp possui dueDay: 31. Como setembro possui 30 dias, deve sofrer clamp para 2026-09-30
    const clampedItem = data.events.find(e => e.sourceId === 'fix_clamp');
    assert.ok(clampedItem, 'Item clamped deve estar presente');
    assert.equal(clampedItem.date, '2026-09-30');
    assert.equal(clampedItem.nominalDay, 31);
    assert.equal(clampedItem.wasClamped, true);
  });

});
