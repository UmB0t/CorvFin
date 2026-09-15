const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const dashboardJs = fs.readFileSync(path.join(rootDir, 'public/js/modules/dashboard.js'), 'utf-8');
const dashboardCss = fs.readFileSync(path.join(rootDir, 'public/css/dashboard.css'), 'utf-8');
const mobileCss = fs.readFileSync(path.join(rootDir, 'public/css/mobile.css'), 'utf-8');

describe('CORVFIN — UX3.4: Uniformização Visual dos Cards de Despesas', () => {

  describe('1. Estrutura Canônica das Zonas (Header, Value, Footer)', () => {
    test('1.1 Todos os 4 cards secundários possuem wrapper estrutural .metric-footer', () => {
      assert.ok(dashboardJs.includes('<div class="metric-footer">'), 'dashboard.js deve declarar .metric-footer');
      // Contar ocorrências de .metric-footer dentro dos cards secundários
      const occurrences = (dashboardJs.match(/<div class="metric-footer">/g) || []).length;
      assert.equal(occurrences, 4, 'Exatamente os 4 cards secundários devem possuir .metric-footer');
    });

    test('1.2 Card 1 (Total Despesas) mantém .bar e não inventa copy financeira artificial', () => {
      assert.ok(dashboardJs.includes('<div class="bar"><span style="width:${pctGasto}%;"></span></div>'), 'Card 1 preserva a barra de progresso');
      assert.ok(!dashboardJs.includes('Compromete ${pctGasto}% da renda'), 'Não adiciona copy artificial');
      assert.ok(!dashboardJs.includes('Compromisso do orçamento'), 'Não adiciona métrica não solicitada');
    });

    test('1.3 Cards 2, 3 e 4 preservam textos originais dentro de .metric-footer', () => {
      assert.ok(dashboardJs.includes('Total de despesas quitadas'), 'Card 2 preserva texto de despesas quitadas');
      assert.ok(dashboardJs.includes('Aguardando pagamento'), 'Card 3 preserva texto de aguardando pagamento');
      assert.ok(dashboardJs.includes('${sobraSub}'), 'Card 4 preserva interpolação de sobraSub');
    });

    test('1.4 Labels dos 4 cards secundários e do Hero preservam nomenclaturas canônicas', () => {
      assert.ok(dashboardJs.includes('Total do Mês'), 'Hero possui Total do Mês');
      assert.ok(dashboardJs.includes('Total de Despesas'), 'Card 1 possui Total de Despesas');
      assert.ok(dashboardJs.includes('Valor Pago'), 'Card 2 possui Valor Pago');
      assert.ok(dashboardJs.includes('Pendente de Pagamento'), 'Card 3 possui Pendente de Pagamento');
      assert.ok(dashboardJs.includes('Sobra do Valor'), 'Card 4 possui Sobra do Valor');
    });
  });

  describe('2. Regras de Layout e Alinhamento Estrutural no CSS (dashboard.css)', () => {
    test('2.1 #dashboardMetrics.metrics é escopado para display: block sem afetar .metrics global', () => {
      assert.ok(dashboardCss.includes('#dashboardMetrics.metrics'), 'Deve conter seletor escopado #dashboardMetrics.metrics');
      assert.ok(dashboardCss.includes('.metrics {'), 'Preserva regra global .metrics');
      assert.ok(dashboardCss.includes('grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));'), 'Preserva grid global');
    });

    test('2.2 .secondary-metric adota flex column com align-items: stretch no grid', () => {
      assert.ok(dashboardCss.includes('.expenses-metrics-secondary'), 'Declara .expenses-metrics-secondary');
      assert.ok(dashboardCss.includes('align-items: stretch;'), 'Alinha itens ao esticar altura da linha');
      assert.ok(dashboardCss.includes('.secondary-metric {'), 'Declara .secondary-metric');
      assert.ok(dashboardCss.includes('display: flex;'), 'Declara display: flex');
      assert.ok(dashboardCss.includes('flex-direction: column;'), 'Declara flex-direction: column');
    });

    test('2.3 Header (.label) equaliza altura via min-height flexível e align-items: flex-start', () => {
      assert.ok(dashboardCss.includes('.secondary-metric .label {'), 'Declara regra para label');
      assert.ok(dashboardCss.includes('min-height: 1.95rem;'), 'Header reserva altura mínima de 1.95rem');
      assert.ok(dashboardCss.includes('align-items: flex-start;'), 'Alinha primeira linha do texto no topo');
      assert.ok(dashboardCss.includes('.secondary-metric .label .badge'), 'Controla badge sem quebrar');
    });

    test('2.4 .metric-footer usa margin-top: auto para ancoragem na base sem números mágicos', () => {
      assert.ok(dashboardCss.includes('.secondary-metric .metric-footer {'), 'Declara regra para .metric-footer');
      assert.ok(dashboardCss.includes('margin-top: auto;'), 'Ancora footer na base do card');
    });
  });

  describe('3. Responsividade Mobile (mobile.css)', () => {
    test('3.1 Grid 2x2 e largura integral preservados em telas menores', () => {
      assert.ok(mobileCss.includes('.expenses-metrics-secondary {'), 'Declara .expenses-metrics-secondary em mobile');
      assert.ok(mobileCss.includes('grid-template-columns: repeat(2, 1fr);'), 'Grid 2x2 preservado');
    });

    test('3.2 .secondary-metric em mobile usa flex column e min-height no label', () => {
      assert.ok(mobileCss.includes('.expenses-metrics-secondary .secondary-metric {'), 'mobile.css declara .secondary-metric');
      assert.ok(mobileCss.includes('.expenses-metrics-secondary .secondary-metric .label {'), 'mobile.css declara label');
      assert.ok(mobileCss.includes('min-height: 2.1rem;'), 'Reserva altura mínima no mobile');
    });

    test('3.3 Textos secundários quebram naturalmente no mobile', () => {
      assert.ok(mobileCss.includes('white-space: normal;'), 'Permite quebra natural');
      assert.ok(mobileCss.includes('overflow-wrap: break-word;'), 'Quebra palavras longas');
    });
  });

  describe('4. Semântica Financeira e Cores Intactas', () => {
    test('4.1 Classes semânticas permanecem declaradas e inalteradas', () => {
      assert.ok(dashboardCss.includes('.secondary-metric.metric-expense'), 'metric-expense intacto');
      assert.ok(dashboardCss.includes('.secondary-metric.metric-paid'), 'metric-paid intacto');
      assert.ok(dashboardCss.includes('.secondary-metric.metric-pending'), 'metric-pending intacto');
      assert.ok(dashboardCss.includes('.secondary-metric.metric-sobra'), 'metric-sobra intacto');
      assert.ok(dashboardCss.includes('.secondary-metric.metric-sobra.metric-positive'), 'sobra positiva intacta');
      assert.ok(dashboardCss.includes('.secondary-metric.metric-sobra.metric-neutral'), 'sobra neutra intacta');
      assert.ok(dashboardCss.includes('.secondary-metric.metric-sobra.metric-negative'), 'sobra negativa intacta');
    });
  });

  describe('5. Hierarquia Informacional UX3.4.2 (Hero & Secundários)', () => {
    test('5.1 Hero remove duplicidade textual de Extra e Devedor no footer', () => {
      assert.ok(dashboardJs.includes('let subIncome = `Base: ${currency(t.baseSalary)}`;'), 'Footer do Hero exibe exclusivamente a base');
      assert.ok(!dashboardJs.includes('subIncome += ` (${parts.join(\', \')})`'), 'Não duplica Extra e Devedor no texto de rodapé do Hero');
    });

    test('5.2 Hero ganha protagonismo tipográfico refinado (~28–29px no desktop)', () => {
      assert.ok(dashboardCss.includes('font-size: clamp(1.60rem, 1.3rem + 0.55vw, 1.80rem);'), 'Hero value com tipografia refinada clamp 28-29px');
    });

    test('5.3 Cards secundários possuem min-height de segurança (114px)', () => {
      assert.ok(dashboardCss.includes('min-height: 114px;'), 'Cards secundários possuem min-height: 114px no sweet spot');
    });

    test('5.4 Protagonismo dos valores secundários ampliado (~23–24px no desktop)', () => {
      assert.ok(dashboardCss.includes('font-size: clamp(1.15rem, 0.95rem + 0.55vw, 1.45rem);'), 'Valores secundários com destaque ampliado clamp 23-24px');
    });

    test('5.5 UX3.4.3: Equalização externa no desktop via align-items: stretch no layout principal', () => {
      assert.ok(dashboardCss.includes('.expenses-metrics-layout {'), 'Declara layout');
      assert.ok(dashboardCss.includes('align-items: stretch;'), 'Alinha e equaliza a altura externa de todos os 5 cards no desktop');
    });

    test('5.6 UX3.4.4: Badges de Extra e Devedor empilhados verticalmente no Hero', () => {
      assert.ok(dashboardJs.includes('hero-badges'), 'Hero empacota badges em .hero-badges');
      assert.ok(dashboardCss.includes('.expenses-metric-hero .hero-badges {'), 'dashboard.css declara .hero-badges');
      assert.ok(dashboardCss.includes('flex-direction: column;'), 'Badges empilhados verticalmente');
    });
  });
});
