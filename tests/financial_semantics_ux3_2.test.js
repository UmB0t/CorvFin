/**
 * CORVFIN — UX3.2
 * SUÍTE DE TESTES: tests/financial_semantics_ux3_2.test.js
 * PROPAGAÇÃO DA SEMÂNTICA FINANCEIRA GLOBAL
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Leitura dos arquivos fonte
const dashboardCss = fs.readFileSync(path.join(__dirname, '../public/css/dashboard.css'), 'utf8');
const dashboardJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/dashboard.js'), 'utf8');
const extrasJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/extras.js'), 'utf8');
const debtorsJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/debtors.js'), 'utf8');
const benefitsJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/benefits.js'), 'utf8');
const beneficiosJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/beneficios.js'), 'utf8');
const consolidatedDashboardJs = fs.readFileSync(path.join(__dirname, '../public/js/modules/consolidatedDashboard.js'), 'utf8');

describe('CORVFIN — UX3.2: SEMÂNTICA FINANCEIRA GLOBAL', () => {

  describe('1. Tokens e Regras no CSS (public/css/dashboard.css)', () => {
    test('1.1 Contém classes semânticas para Despesas, Contexto e Dashboard Hero', () => {
      assert.ok(dashboardCss.includes('.metric.metric-income'), 'Deve conter .metric.metric-income');
      assert.ok(dashboardCss.includes('.metric.metric-expense'), 'Deve conter .metric.metric-expense');
      assert.ok(dashboardCss.includes('.metric.metric-paid'), 'Deve conter .metric.metric-paid');
      assert.ok(dashboardCss.includes('.metric.metric-pending'), 'Deve conter .metric.metric-pending');
      assert.ok(dashboardCss.includes('.dash-context-item.metric-expense'), 'Deve conter .dash-context-item.metric-expense');
      assert.ok(dashboardCss.includes('.dash-context-item.metric-pending'), 'Deve conter .dash-context-item.metric-pending');
      assert.ok(dashboardCss.includes('.dash-hero-card.metric-positive'), 'Deve conter .dash-hero-card.metric-positive');
      assert.ok(dashboardCss.includes('.dash-hero-card.metric-neutral'), 'Deve conter .dash-hero-card.metric-neutral');
      assert.ok(dashboardCss.includes('.dash-hero-card.metric-negative'), 'Deve conter .dash-hero-card.metric-negative');
    });

    test('1.2 Acentos laterais de 3px usam tokens semânticos e não fundos saturados', () => {
      assert.ok(dashboardCss.includes('border-left: 3px solid var(--danger);'), 'metric-expense deve usar var(--danger)');
      assert.ok(dashboardCss.includes('border-left: 3px solid var(--success);'), 'metric-paid deve usar var(--success)');
      assert.ok(dashboardCss.includes('border-left: 3px solid var(--warning);'), 'metric-pending deve usar var(--warning)');
      assert.ok(dashboardCss.includes('border-left: 3px solid var(--brand);'), 'metric-income deve usar var(--brand)');
    });

    test('1.3 .dash-hero-net--neutral está definido para resultado zero', () => {
      assert.ok(dashboardCss.includes('.dash-hero-net--neutral'), 'Deve definir .dash-hero-net--neutral');
    });

    test('1.4 Ícones do dash-context-item utilizam cores suaves semânticas', () => {
      assert.ok(dashboardCss.includes('.dash-context-item.metric-expense .dash-context-icon'), 'Deve estilizar ícone expense');
      assert.ok(dashboardCss.includes('.dash-context-item.metric-pending .dash-context-icon'), 'Deve estilizar ícone pending');
      assert.ok(dashboardCss.includes('background: var(--danger-soft);'), 'Ícone expense deve ter fundo soft');
      assert.ok(dashboardCss.includes('background: var(--warning-soft);'), 'Ícone pending deve ter fundo soft');
    });
  });

  describe('2. Rendas Extras (public/js/modules/extras.js)', () => {
    test('2.1 Indicador Renda Extra Total (Mês) mapeado para metric-income', () => {
      assert.ok(extrasJs.includes('metric metric-income'), 'Renda Extra Total deve conter metric-income');
    });

    test('2.2 Indicador Valores Recebidos mapeado para metric-paid (verde)', () => {
      assert.ok(extrasJs.includes('metric metric-paid'), 'Valores Recebidos deve conter metric-paid');
    });

    test('2.3 Indicador Valores a Receber mapeado para metric-pending (âmbar)', () => {
      assert.ok(extrasJs.includes('metric metric-pending'), 'Valores a Receber deve conter metric-pending');
    });

    test('2.4 Labels originais preservados', () => {
      assert.ok(extrasJs.includes('Renda Extra Total (Mês)'), 'Deve manter label Renda Extra Total (Mês)');
      assert.ok(extrasJs.includes('Valores Recebidos'), 'Deve manter label Valores Recebidos');
      assert.ok(extrasJs.includes('Valores a Receber'), 'Deve manter label Valores a Receber');
    });
  });

  describe('3. Devedores & Cobranças (public/js/modules/debtors.js)', () => {
    test('3.1 Montante Total em Dívidas mapeado para metric-expense (vermelho de exposição)', () => {
      assert.ok(debtorsJs.includes('metric metric-expense'), 'Montante Total em Dívidas deve conter metric-expense');
    });

    test('3.2 Total Já Recebido mapeado para metric-paid (verde realizado)', () => {
      assert.ok(debtorsJs.includes('metric metric-paid'), 'Total Já Recebido deve conter metric-paid');
    });

    test('3.3 Restam a Receber e A Receber no Mês Atual mapeados para metric-pending (âmbar)', () => {
      const pendingMatches = debtorsJs.match(/metric metric-pending/g);
      assert.ok(pendingMatches && pendingMatches.length >= 2, 'Deve ter pelo menos 2 cards com metric-pending');
    });

    test('3.4 Labels originais preservados em Devedores', () => {
      assert.ok(debtorsJs.includes('Montante Total em Dívidas'), 'Deve manter label Montante Total em Dívidas');
      assert.ok(debtorsJs.includes('Total Já Recebido'), 'Deve manter label Total Já Recebido');
      assert.ok(debtorsJs.includes('Restam a Receber'), 'Deve manter label Restam a Receber');
      assert.ok(debtorsJs.includes('A Receber no Mês Atual'), 'Deve manter label A Receber no Mês Atual');
    });
  });

  describe('4. Benefícios (public/js/modules/benefits.js & beneficios.js)', () => {
    test('4.1 Crédito Base Mensal mapeado para metric-income', () => {
      assert.ok(benefitsJs.includes('metric metric-income'), 'benefits.js deve conter metric-income');
      assert.ok(beneficiosJs.includes('metric metric-income'), 'beneficios.js deve conter metric-income');
    });

    test('4.2 Total Gasto no Mês mapeado para metric-expense', () => {
      assert.ok(benefitsJs.includes('metric metric-expense'), 'benefits.js deve conter metric-expense');
      assert.ok(beneficiosJs.includes('metric metric-expense'), 'beneficios.js deve conter metric-expense');
    });

    test('4.3 Saldo Restante Disponível usa classe dinâmica positive/neutral/negative', () => {
      assert.ok(benefitsJs.includes('metric ${remClass}'), 'benefits.js deve interpolar remClass');
      assert.ok(benefitsJs.includes("remClass = 'metric-positive'"), 'benefits.js deve definir remClass positive');
      assert.ok(benefitsJs.includes("remClass = 'metric-negative'"), 'benefits.js deve definir remClass negative');
      assert.ok(beneficiosJs.includes('metric ${remClass}'), 'beneficios.js deve interpolar remClass');
      assert.ok(beneficiosJs.includes("remClass = 'metric-positive'"), 'beneficios.js deve definir remClass positive');
      assert.ok(beneficiosJs.includes("remClass = 'metric-negative'"), 'beneficios.js deve definir remClass negative');
    });

    test('4.4 Lançamentos no Mês mapeado para metric-neutral', () => {
      assert.ok(benefitsJs.includes('metric metric-neutral'), 'benefits.js deve conter metric-neutral');
      assert.ok(beneficiosJs.includes('metric metric-neutral'), 'beneficios.js deve conter metric-neutral');
    });
  });

  describe('5. Dashboard V2 (public/js/modules/consolidatedDashboard.js)', () => {
    test('5.1 Hero card possui classe dinâmica (metric-positive / metric-neutral / metric-negative)', () => {
      assert.ok(consolidatedDashboardJs.includes('${heroCardClass}'), 'dashHeroCard deve usar heroCardClass');
      assert.ok(consolidatedDashboardJs.includes("netVal > 0 ? 'metric-positive' : (netVal === 0 ? 'metric-neutral' : 'metric-negative')"), 'Deve calcular heroCardClass com 3 estados');
    });

    test('5.2 Sub-cards do Hero mapeados para metric-income e metric-expense', () => {
      assert.ok(consolidatedDashboardJs.includes('dash-hero-sub-card metric-income'), 'Entradas Previstas deve conter metric-income');
      assert.ok(consolidatedDashboardJs.includes('dash-hero-sub-card metric-expense'), 'Saídas Previstas deve conter metric-expense');
    });

    test('5.3 Context items usam classes semânticas sem inline colors arbitrárias', () => {
      assert.ok(consolidatedDashboardJs.includes('dash-context-item metric-expense'), 'Despesas Operacionais deve conter metric-expense');
      assert.ok(consolidatedDashboardJs.includes('dash-context-item metric-pending'), 'Cobranças / Pendências deve conter metric-pending');
      assert.ok(!consolidatedDashboardJs.includes('style="background:rgba(16, 185, 129, 0.12); color:var(--c-fixed, #10B981);"'), 'Despesas context não deve ter inline color arbitrário');
      assert.ok(!consolidatedDashboardJs.includes('style="color:var(--c-debt, #F59E0B);"'), 'Cobranças val não deve ter inline color arbitrário');
    });

    test('5.4 updateDashboardProjectionUI sincroniza as classes do Hero Card dinamicamente', () => {
      assert.ok(consolidatedDashboardJs.includes("net > 0 ? 'metric-positive' : (net === 0 ? 'metric-neutral' : 'metric-negative')"), 'updateDashboardProjectionUI deve sincronizar classe do Hero');
      assert.ok(consolidatedDashboardJs.includes("heroCardEl.classList.add(cClass)"), 'updateDashboardProjectionUI deve aplicar cClass ao heroCardEl');
    });
  });

  describe('6. Despesas (public/js/modules/dashboard.js)', () => {
    test('6.1 Quatro indicadores de Despesas preservam a semântica UX3.1', () => {
      assert.ok(dashboardJs.includes('secondary-metric metric-expense'), 'Total Despesas deve ser metric-expense');
      assert.ok(dashboardJs.includes('secondary-metric metric-paid'), 'Despesas Pagas deve ser metric-paid');
      assert.ok(dashboardJs.includes('secondary-metric metric-pending'), 'Despesas Pendentes deve ser metric-pending');
      assert.ok(dashboardJs.includes('secondary-metric metric-sobra'), 'Sobra Prevista deve ser metric-sobra');
    });

    test('6.2 Sobra calculada dinamicamente com positive, neutral e negative', () => {
      assert.ok(dashboardJs.includes("sobraClass = 'metric-positive'"), 'Sobra deve definir sobraClass positive');
      assert.ok(dashboardJs.includes("sobraClass = 'metric-negative'"), 'Sobra deve definir sobraClass negative');
      assert.ok(dashboardJs.includes("sobraClass = 'metric-neutral'"), 'Sobra deve definir sobraClass neutral');
    });
  });

  describe('7. Não-violação e Integridade', () => {
    test('7.1 Nenhuma alteração em regras de negócio ou de domínio', () => {
      assert.ok(consolidatedDashboardJs.includes('currentProjectionData.summary.net'), 'Mantém projeção canônica no Dashboard');
      assert.ok(debtorsJs.includes('grandTotalDebt - grandPaidDebt'), 'Mantém cálculo canônico em Devedores');
      assert.ok(extrasJs.includes('receivedExtra'), 'Mantém cálculo canônico em Extras');
    });
  });

});
