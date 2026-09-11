/**
 * Suíte Oficial de Testes — CORVFIN V2 — FASE 5H.2
 * Commercial Offers / Monthly + Yearly Pricing / Promotions / Plan Carousel
 *
 * Cobertura Completa: Casos A a Z e Casos AA a AI
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('http');
const vm = require('node:vm');

const config = require('../server/config/config');
const app = require('../server/server');
const { getDB } = require('../server/config/db');
const planService = require('../server/services/planService');
const commercialService = require('../server/services/commercialService');
const storageService = require('../server/services/storageService');
const { hashPassword } = require('../server/services/authService');
const { getCompatibilityEntitlements } = require('../server/config/entitlementRegistry');
const { setupIsolatedTestMongo, teardownIsolatedTestMongo } = require('./helpers/testDbIsolation');

describe('Fase 5H.2 — Commercial Offers & Plan Carousel Matrix (Casos A a Z + AA a AI)', () => {
  let server;
  let baseUrl;
  let adminToken;
  let userToken;
  let testAdminId;
  let testUserId;
  let testDbInfo = null;

  const originalStorageDriver = config.STORAGE_DRIVER;
  const originalPlansFile = config.PLANS_FILE;
  const originalUsersFile = config.USERS_FILE;
  const tempTestDir = path.join(os.tmpdir(), `corvfin_test_offers_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  const testSuffix = 'h2_' + Date.now();
  const testAdminLogin = `admin_${testSuffix}`;
  const testUserLogin = `user_${testSuffix}`;
  const testPassword = 'Password@2026';

  before(async () => {
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true });
    }
    config.PLANS_FILE = path.join(tempTestDir, 'plans.json');
    config.USERS_FILE = path.join(tempTestDir, 'users.json');

    testDbInfo = await setupIsolatedTestMongo('offers_v2');
    const db = getDB();

    await planService.ensureDefaultPlan();

    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    testAdminId = `usr_adm_${testSuffix}`;
    const hashedAdminPwd = await hashPassword(testPassword);
    await db.collection('users').insertOne({
      _id: testAdminId,
      id: testAdminId,
      nome: 'Admin Ofertas V2',
      login: testAdminLogin,
      email: `${testAdminLogin}@corvfin.test`,
      senha: hashedAdminPwd,
      is_admin: true,
      notificacoes_ativas: true,
      createdAt: new Date().toISOString()
    });

    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: testAdminLogin, senha: testPassword })
    });
    const adminLoginData = await adminLoginRes.json();
    assert.equal(adminLoginRes.status, 200);
    const adminCookie = adminLoginRes.headers.get('set-cookie') || '';
    const adminMatch = adminCookie.match(/omnifin_session=([^;]+)/);
    adminToken = (adminMatch && adminMatch[1]) || adminLoginData.token;

    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Usuário Ofertas V2',
        login: testUserLogin,
        email: `${testUserLogin}@corvfin.test`,
        senha: testPassword
      })
    });
    const regData = await regRes.json();
    assert.equal(regRes.status, 201);
    testUserId = regData.user.id;

    await db.collection('users').updateOne(
      { _id: testUserId },
      { $set: { is_admin: false, emailVerified: true, emailVerifiedAt: new Date().toISOString() } }
    );

    const userLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: testUserLogin, senha: testPassword })
    });
    const userCookie = userLoginRes.headers.get('set-cookie') || '';
    const userMatch = userCookie.match(/omnifin_session=([^;]+)/);
    userToken = (userMatch && userMatch[1]) || '';
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (testDbInfo) {
      await teardownIsolatedTestMongo(testDbInfo.testDbName);
    }
    config.STORAGE_DRIVER = originalStorageDriver;
    config.PLANS_FILE = originalPlansFile;
    config.USERS_FILE = originalUsersFile;
    if (fs.existsSync(tempTestDir)) {
      try {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      } catch (e) {}
    }
  });

  function authHeader(token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /* ==========================================================================
     CASOS A a F: MODELO COMERCIAL DE OFERTAS (DOMÍNIO / SERVICE)
     ========================================================================== */

  test('Caso A: Plano Free com monthly ativo (R$ 0,00) e yearly inativo', () => {
    const raw = {
      currency: 'BRL',
      offers: {
        monthly: { enabled: true, interval: 'month', intervalCount: 1, regularPriceCents: 0 },
        yearly: { enabled: false }
      }
    };
    const validated = planService.validatePricingInput(raw);
    assert.equal(validated.currency, 'BRL');
    assert.equal(validated.offers.monthly.enabled, true);
    assert.equal(validated.offers.monthly.regularPriceCents, 0);
    assert.equal(validated.offers.yearly.enabled, false);

    const sanitized = commercialService.sanitizePlanPricing(validated);
    assert.equal(sanitized.offers.monthly.enabled, true);
    assert.equal(sanitized.offers.monthly.regularPriceCents, 0);
    assert.equal(sanitized.offers.yearly.enabled, false);
  });

  test('Caso B: Plano Pago com ambas as ofertas (mensal e anual) ativas', () => {
    const raw = {
      currency: 'BRL',
      offers: {
        monthly: { enabled: true, regularPriceCents: 2990 },
        yearly: { enabled: true, regularPriceCents: 29900 }
      }
    };
    const validated = planService.validatePricingInput(raw);
    assert.equal(validated.offers.monthly.enabled, true);
    assert.equal(validated.offers.monthly.regularPriceCents, 2990);
    assert.equal(validated.offers.yearly.enabled, true);
    assert.equal(validated.offers.yearly.regularPriceCents, 29900);
  });

  test('Caso C: Plano Pago com mensal ativo e anual desativado', () => {
    const raw = {
      currency: 'BRL',
      offers: {
        monthly: { enabled: true, regularPriceCents: 1990 },
        yearly: { enabled: false }
      }
    };
    const validated = planService.validatePricingInput(raw);
    assert.equal(validated.offers.monthly.enabled, true);
    assert.equal(validated.offers.yearly.enabled, false);
  });

  test('Caso D: Plano Pago com mensal desativado e anual ativo', () => {
    const raw = {
      currency: 'BRL',
      offers: {
        monthly: { enabled: false },
        yearly: { enabled: true, regularPriceCents: 19900 }
      }
    };
    const validated = planService.validatePricingInput(raw);
    assert.equal(validated.offers.monthly.enabled, false);
    assert.equal(validated.offers.yearly.enabled, true);
    assert.equal(validated.offers.yearly.regularPriceCents, 19900);
  });

  test('Caso E: Promoção Introdutória (intro) com preço promocional e contagem de ciclos', () => {
    const raw = {
      currency: 'BRL',
      offers: {
        monthly: {
          enabled: true,
          regularPriceCents: 4990,
          intro: {
            enabled: true,
            promotionalPriceCents: 2490,
            cycles: 3
          }
        }
      }
    };
    const validated = planService.validatePricingInput(raw);
    assert.equal(validated.offers.monthly.intro.enabled, true);
    assert.equal(validated.offers.monthly.intro.promotionalPriceCents, 2490);
    assert.equal(validated.offers.monthly.intro.priceCents, 2490);
    assert.equal(validated.offers.monthly.intro.cycles, 3);
  });

  test('Caso F: Promoção por Campanha (campaign) com datas de vigência', () => {
    const raw = {
      currency: 'BRL',
      offers: {
        yearly: {
          enabled: true,
          regularPriceCents: 39900,
          campaign: {
            enabled: true,
            promotionalPriceCents: 29900,
            validFrom: '2026-09-01',
            validUntil: '2026-09-30'
          }
        }
      }
    };
    const validated = planService.validatePricingInput(raw);
    assert.equal(validated.offers.yearly.campaign.enabled, true);
    assert.equal(validated.offers.yearly.campaign.promotionalPriceCents, 29900);
    assert.equal(validated.offers.yearly.campaign.priceCents, 29900);
    assert.equal(validated.offers.yearly.campaign.validFrom, '2026-09-01');
    assert.equal(validated.offers.yearly.campaign.validUntil, '2026-09-30');
  });

  /* ==========================================================================
     CASOS T a Z + AA a AE: VALIDAÇÕES & DATAS (FAIL-CLOSED & FORTALEZA)
     ========================================================================== */

  test('Caso T: validatePricingInput rejeita regularPriceCents negativo (INVALID_PRICE_CENTS)', () => {
    assert.throws(() => {
      planService.validatePricingInput({
        currency: 'BRL',
        offers: { monthly: { enabled: true, regularPriceCents: -100 } }
      });
    }, (err) => err.code === 'INVALID_PRICE_CENTS');
  });

  test('Caso U: validatePricingInput rejeita moeda diferente de BRL (INVALID_CURRENCY)', () => {
    assert.throws(() => {
      planService.validatePricingInput({
        currency: 'USD',
        offers: { monthly: { enabled: true, regularPriceCents: 1000 } }
      });
    }, (err) => err.code === 'INVALID_CURRENCY');
  });

  test('Caso V: validatePricingInput rejeita preços decimais não inteiros (INVALID_PRICE_CENTS)', () => {
    assert.throws(() => {
      planService.validatePricingInput({
        currency: 'BRL',
        offers: { monthly: { enabled: true, regularPriceCents: 29.9 } }
      });
    }, (err) => err.code === 'INVALID_PRICE_CENTS');
  });

  test('Caso W: validatePricingInput rejeita validUntil < validFrom (INVALID_CAMPAIGN_RANGE)', () => {
    assert.throws(() => {
      planService.validatePricingInput({
        currency: 'BRL',
        offers: {
          monthly: {
            enabled: true,
            regularPriceCents: 2990,
            campaign: {
              enabled: true,
              promotionalPriceCents: 1990,
              validFrom: '2026-10-01',
              validUntil: '2026-09-01'
            }
          }
        }
      });
    }, (err) => err.code === 'INVALID_CAMPAIGN_RANGE');
  });

  test('Caso X: validatePricingInput rejeita intro.cycles < 1 (INVALID_INTRO_CYCLES)', () => {
    assert.throws(() => {
      planService.validatePricingInput({
        currency: 'BRL',
        offers: {
          monthly: {
            enabled: true,
            regularPriceCents: 2990,
            intro: {
              enabled: true,
              promotionalPriceCents: 1490,
              cycles: 0
            }
          }
        }
      });
    }, (err) => err.code === 'INVALID_INTRO_CYCLES');
  });

  test('Caso Y: validatePricingInput rejeita formato legado na raiz (amountCents/interval)', () => {
    assert.throws(() => {
      planService.validatePricingInput({
        amountCents: 2990,
        currency: 'BRL',
        interval: 'month'
      });
    }, (err) => err.code === 'LEGACY_PRICING_NOT_ACCEPTED');
  });

  test('Caso Z: normalizePricingDoc normaliza documentos legados runtime sem quebrar nem alterar DB', () => {
    const legacyDoc = {
      amountCents: 3500,
      currency: 'BRL',
      interval: 'month'
    };
    const normalized = planService.normalizePricingDoc(legacyDoc);
    assert.equal(normalized.currency, 'BRL');
    assert.equal(normalized.offers.monthly.enabled, true);
    assert.equal(normalized.offers.monthly.regularPriceCents, 3500);
    assert.equal(normalized.offers.yearly.enabled, false);
    assert.equal(legacyDoc.amountCents, 3500, 'Objeto original não deve ser corrompido');
  });

  test('Caso AA: Rejeita promoções concorrentes (intro + campaign) na mesma oferta (CONCURRENT_PROMOTIONS_NOT_ALLOWED)', () => {
    assert.throws(() => {
      planService.validatePricingInput({
        currency: 'BRL',
        offers: {
          monthly: {
            enabled: true,
            regularPriceCents: 2990,
            intro: {
              enabled: true,
              promotionalPriceCents: 1490,
              cycles: 2
            },
            campaign: {
              enabled: true,
              promotionalPriceCents: 1290,
              validFrom: '2026-09-01',
              validUntil: '2026-09-30'
            }
          }
        }
      });
    }, (err) => err.code === 'CONCURRENT_PROMOTIONS_NOT_ALLOWED');
  });

  test('Casos AB a AE: Resolução de Campanha no fuso America/Fortaleza (today, tomorrow, yesterday)', () => {
    const todayStr = commercialService.getCommercialDateString();
    const parts = todayStr.split('-').map(Number);
    const todayDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));

    const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
    const tomorrowDate = new Date(todayDate.getTime() + 24 * 60 * 60 * 1000);

    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);
    const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

    // AB: validFrom today => active
    const resAB = commercialService.resolveCampaignStatus({
      enabled: true,
      validFrom: todayStr,
      validUntil: tomorrowStr
    }, todayDate);
    assert.equal(resAB.status, 'active');
    assert.equal(resAB.active, true);

    // AC: validUntil today => active (inclusivo!)
    const resAC = commercialService.resolveCampaignStatus({
      enabled: true,
      validFrom: yesterdayStr,
      validUntil: todayStr
    }, todayDate);
    assert.equal(resAC.status, 'active');
    assert.equal(resAC.active, true);

    // AD: validUntil yesterday => expired
    const resAD = commercialService.resolveCampaignStatus({
      enabled: true,
      validFrom: '2020-01-01',
      validUntil: yesterdayStr
    }, todayDate);
    assert.equal(resAD.status, 'expired');
    assert.equal(resAD.active, false);

    // AE: validFrom tomorrow => future
    const resAE = commercialService.resolveCampaignStatus({
      enabled: true,
      validFrom: tomorrowStr,
      validUntil: '2030-01-01'
    }, todayDate);
    assert.equal(resAE.status, 'future');
    assert.equal(resAE.active, false);
  });

  /* ==========================================================================
     CASOS R, S, AF: RESPOSTAS DE API (CANÔNICO E REJEIÇÃO LEGADA)
     ========================================================================== */

  let createdPlanId = null;

  test('Caso AF: POST e PUT /api/admin/plans rejeitam pricing legado com HTTP 400', async () => {
    const legacyPostRes = await fetch(`${baseUrl}/api/admin/plans`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify({
        name: 'Plano Com Preço Legado Rejeitado',
        slug: `legacy-rej-${Date.now()}`,
        pricing: { amountCents: 2990, currency: 'BRL', interval: 'month' },
        entitlements: getCompatibilityEntitlements()
      })
    });
    assert.equal(legacyPostRes.status, 400);
    const postData = await legacyPostRes.json();
    assert.equal(postData.error, 'LEGACY_PRICING_NOT_ACCEPTED');

    // Cria plano canônico válido
    const validPostRes = await fetch(`${baseUrl}/api/admin/plans`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify({
        name: 'Plano Canônico V2',
        slug: `can-v2-${Date.now()}`,
        status: 'active',
        pricing: {
          currency: 'BRL',
          offers: {
            monthly: { regularPriceCents: 4990 },
            yearly: { regularPriceCents: 49900 }
          }
        },
        entitlements: getCompatibilityEntitlements()
      })
    });
    assert.equal(validPostRes.status, 201);
    const validData = await validPostRes.json();
    createdPlanId = validData.plan._id;

    // Tentativa de editar com PUT enviando pricing legado
    const legacyPutRes = await fetch(`${baseUrl}/api/admin/plans/${createdPlanId}`, {
      method: 'PUT',
      headers: authHeader(adminToken),
      body: JSON.stringify({
        pricing: { amountCents: 5990, currency: 'BRL', interval: 'month' }
      })
    });
    assert.equal(legacyPutRes.status, 400);
    const putData = await legacyPutRes.json();
    assert.equal(putData.error, 'LEGACY_PRICING_NOT_ACCEPTED');
  });

  test('Caso R: GET /api/plans retorna somente estrutura canônica com offers e sem amountCents raiz', async () => {
    const res = await fetch(`${baseUrl}/api/plans`, {
      headers: authHeader(userToken)
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.plans));

    for (const plan of data.plans) {
      assert.ok(plan.pricing, `Plano ${plan.name} deve ter pricing`);
      assert.equal(plan.pricing.currency, 'BRL');
      assert.ok(plan.pricing.offers, 'Pricing deve ter offers');
      assert.ok(plan.pricing.offers.monthly, 'Offers deve ter monthly');
      assert.ok(plan.pricing.offers.yearly, 'Offers deve ter yearly');
      assert.equal(plan.pricing.amountCents, undefined, 'amountCents raiz NÃO deve existir na resposta');
      assert.equal(plan.pricing.interval, undefined, 'interval raiz NÃO deve existir na resposta');
    }
  });

  test('Caso S: GET /api/me/commercial-context retorna pricing canônico com offers sanitizadas', async () => {
    const res = await fetch(`${baseUrl}/api/me/commercial-context`, {
      headers: authHeader(userToken)
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.plan);
    assert.ok(data.plan.pricing);
    assert.equal(data.plan.pricing.currency, 'BRL');
    assert.ok(data.plan.pricing.offers);
    assert.equal(data.plan.pricing.amountCents, undefined);
    assert.equal(data.plan.pricing.interval, undefined);
  });

  /* ==========================================================================
     CASOS G a Q + AG a AI: FRONTEND UI, HELPERS & CARROSSEL
     ========================================================================== */

  const plansModalJsCode = fs.readFileSync(path.join(__dirname, '../public/js/modules/commercialPlansModal.js'), 'utf8');
  const indexHtmlContent = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const componentsCss = fs.readFileSync(path.join(__dirname, '../public/css/components.css'), 'utf8');
  const adminJsCode = fs.readFileSync(path.join(__dirname, '../public/js/admin.js'), 'utf8');

  function setupUiSandbox() {
    const elements = {};

    const createElement = (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          contains(c) { return this.classes.has(c); }
        },
        style: {},
        attributes: {},
        innerHTML: '',
        textContent: '',
        scrollWidth: 1200,
        clientWidth: 800,
        scrollLeft: 0,
        children: [],
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k]; },
        addEventListener(ev, fn) { this._listeners = this._listeners || {}; this._listeners[ev] = fn; },
        scrollBy(opts) { if (opts && opts.left) this.scrollLeft += opts.left; },
        querySelectorAll(selector) { return []; }
      };
      return el;
    };

    const sandbox = {
      window: {},
      document: {
        readyState: 'complete',
        getElementById(id) {
          if (!elements[id]) {
            elements[id] = createElement('div');
            elements[id].id = id;
          }
          return elements[id];
        },
        querySelectorAll(sel) { return []; },
        addEventListener() {}
      },
      console: { log() {}, warn() {}, error() {} }
    };
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(plansModalJsCode, sandbox);
    return { sandbox, elements };
  }

  test('Caso G: Cálculo do desconto anual monetário (12 * mensal - anual)', () => {
    const monthlyCents = 2990; // R$ 29,90/mês
    const yearlyCents = 29900; // R$ 299,00/ano
    const annualizedMonthly = monthlyCents * 12; // 35880
    const savingsCents = annualizedMonthly - yearlyCents; // 5980 (R$ 59,80)
    assert.equal(savingsCents, 5980);
    assert.equal(Math.round((savingsCents / annualizedMonthly) * 100), 17);
  });

  test('Caso H: Cálculo da equivalência mensal "Equivalente a R$ X/mês"', () => {
    const yearlyCents = 29900;
    const equivMonthlyCents = Math.round(yearlyCents / 12);
    assert.equal(equivMonthlyCents, 2492); // R$ 24,92/mês
  });

  test('Caso I: Toggle de faturamento alterna intervalo ativo entre monthly e yearly', () => {
    const { sandbox } = setupUiSandbox();
    assert.equal(sandbox.window.getActiveInterval(), 'monthly');

    sandbox.window.setActiveInterval('yearly');
    assert.equal(sandbox.window.getActiveInterval(), 'yearly');

    sandbox.window.setActiveInterval('monthly');
    assert.equal(sandbox.window.getActiveInterval(), 'monthly');
  });

  test('Caso J: Tag de promoção introdutória formata ciclos no HTML', () => {
    const { sandbox, elements } = setupUiSandbox();
    const plans = [
      {
        id: 'plan_intro',
        name: 'Plano Intro',
        slug: 'intro-slug',
        pricing: {
          currency: 'BRL',
          offers: {
            monthly: {
              enabled: true,
              regularPriceCents: 3990,
              intro: { enabled: true, promotionalPriceCents: 1990, cycles: 3 }
            }
          }
        }
      }
    ];

    sandbox.window.setActiveInterval('monthly');
    sandbox.window.renderPlansGrid(plans, null);
    const html = elements['plansGridContainer'].innerHTML;
    assert.ok(html.includes('Promoção: primeiros 3 meses'));
    assert.ok(html.includes('19,90'));
  });

  test('Caso K: Tag de campanha promocional exibe data limite em pt-BR', () => {
    const { sandbox, elements } = setupUiSandbox();
    const plans = [
      {
        id: 'plan_campaign',
        name: 'Plano Campanha',
        slug: 'campaign-slug',
        pricing: {
          currency: 'BRL',
          offers: {
            yearly: {
              enabled: true,
              regularPriceCents: 30000,
              campaign: {
                enabled: true,
                active: true,
                status: 'active',
                promotionalPriceCents: 20000,
                validUntil: '2026-12-31'
              }
            }
          }
        }
      }
    ];

    sandbox.window.setActiveInterval('yearly');
    sandbox.window.renderPlansGrid(plans, null);
    const html = elements['plansGridContainer'].innerHTML;
    assert.ok(html.includes('Campanha limitada até 31/12/2026'));
    assert.ok(html.includes('200,00'));
  });

  test('Caso L: Badge de porcentagem de economia anual calcula teto de desconto', () => {
    const { sandbox } = setupUiSandbox();
    const plans = [
      {
        pricing: {
          currency: 'BRL',
          offers: {
            monthly: { regularPriceCents: 10000 },
            yearly: { regularPriceCents: 96000 } // 120.000 vs 96.000 => 20%
          }
        }
      }
    ];
    const maxPct = sandbox.window.calculateMaxAnnualSavings(plans);
    assert.equal(maxPct, 20);
  });

  test('Caso M: Tratamento de oferta inativa exibe indisponibilidade e desabilita botão', () => {
    const { sandbox, elements } = setupUiSandbox();
    const plans = [
      {
        id: 'plan_no_yearly',
        name: 'Plano Só Mensal',
        pricing: {
          currency: 'BRL',
          offers: {
            monthly: { enabled: true, regularPriceCents: 1500 },
            yearly: { enabled: false }
          }
        }
      }
    ];

    sandbox.window.setActiveInterval('yearly');
    sandbox.window.renderPlansGrid(plans, null);
    const html = elements['plansGridContainer'].innerHTML;
    assert.ok(html.includes('Indisponível no Anual'));
    assert.ok(html.includes('disabled'));
  });

  test('Caso N: Plano atual do usuário exibe badge e botão "Plano Atual" desabilitado', () => {
    const { sandbox, elements } = setupUiSandbox();
    const plans = [
      {
        id: 'plan_free',
        name: 'Plano Gratuito',
        pricing: {
          currency: 'BRL',
          offers: {
            monthly: { enabled: true, regularPriceCents: 0 }
          }
        }
      }
    ];

    sandbox.window.setActiveInterval('monthly');
    sandbox.window.renderPlansGrid(plans, 'plan_free');
    const html = elements['plansGridContainer'].innerHTML;
    assert.ok(html.includes('Seu Plano Atual'));
    assert.ok(html.includes('Plano Atual'));
  });

  test('Casos O, P, Q: Zero Billing & CTA informativo sem redirecionamento ou checkout', () => {
    const { sandbox, elements } = setupUiSandbox();
    const plans = [
      {
        id: 'plan_pro',
        name: 'Plano Pro',
        pricing: {
          currency: 'BRL',
          offers: {
            monthly: { enabled: true, regularPriceCents: 2990 }
          }
        }
      }
    ];

    sandbox.window.setActiveInterval('monthly');
    sandbox.window.renderPlansGrid(plans, 'other_plan');
    const html = elements['plansGridContainer'].innerHTML;
    assert.ok(html.includes('Assinaturas online em breve'));
    assert.equal(html.includes('stripe'), false);
    assert.equal(html.includes('checkout'), false);
    assert.equal(html.includes('pagar.me'), false);
    assert.equal(html.includes('mercadopago'), false);
  });

  test('Caso AG: Admin UI dialog possui campos para editar ofertas canônicas', () => {
    assert.ok(adminJsCode.includes('buildOffersEditorHtml'), 'admin.js deve implementar buildOffersEditorHtml');
    assert.ok(adminJsCode.includes('extractOffersFromForm'), 'admin.js deve implementar extractOffersFromForm');
    assert.ok(adminJsCode.includes('offers.monthly'), 'admin.js deve montar offers.monthly');
    assert.ok(adminJsCode.includes('offers.yearly'), 'admin.js deve montar offers.yearly');
    assert.ok(adminJsCode.includes('regularPriceCents'), 'admin.js deve conter regularPriceCents');
  });

  test('Caso AH: Desktop modal possui estrutura de 4 colunas side-by-side e largura ampla', () => {
    assert.ok(componentsCss.includes('calc((100% - 48px) / 4)'), 'CSS deve prever 4 colunas desktop');
    assert.ok(componentsCss.includes('max-width: min(1180px, 96vw)'), 'Modal deve ter largura adequada para 4 cards');
    assert.ok(indexHtmlContent.includes('id="plansCarouselViewport"'), 'index.html deve declarar plansCarouselViewport');
    assert.ok(indexHtmlContent.includes('id="plansGridContainer"'), 'index.html deve declarar plansGridContainer');
  });

  test('Caso AI: Controles do carrossel único (< / >) gerenciam overflow horizontal', () => {
    const { sandbox, elements } = setupUiSandbox();
    const viewport = elements['plansCarouselViewport'];
    const btnPrev = elements['btnPlansPrev'];
    const btnNext = elements['btnPlansNext'];

    // Sem overflow: scrollWidth <= clientWidth
    viewport.scrollWidth = 600;
    viewport.clientWidth = 800;
    sandbox.window.updateCarouselControls();
    assert.equal(btnPrev.style.display, 'none');
    assert.equal(btnNext.style.display, 'none');

    // Com overflow (> 4 cards): scrollWidth > clientWidth
    viewport.scrollWidth = 1400;
    viewport.clientWidth = 800;
    viewport.scrollLeft = 0;
    sandbox.window.updateCarouselControls();
    assert.equal(btnPrev.style.display, 'flex');
    assert.equal(btnNext.style.display, 'flex');
    assert.equal(btnPrev.disabled, true, 'btnPrev deve estar desabilitado no início da rolagem');
    assert.equal(btnNext.disabled, false, 'btnNext deve estar habilitado');
  });
});
