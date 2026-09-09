/**
 * ==============================================================================
 * OmniFin V3 - AI Assistant & n8n Integration Service (aiService.js)
 * ==============================================================================
 */

const config = require('../config/config');
const storageService = require('./storageService');
const aiQuotaService = require('./aiQuotaService');
const { getCreditCost } = require('../config/aiCreditPolicy');
const { validateMediaFile, getBaseMimeType } = require('../middleware/mediaUpload');

function getNormalizedFilename(baseMime, cleanMode) {
  if (cleanMode === 'image') {
    if (baseMime === 'image/jpeg') return 'image.jpg';
    if (baseMime === 'image/png') return 'image.png';
    if (baseMime === 'image/webp') return 'image.webp';
    return 'image.jpg';
  }
  if (cleanMode === 'audio') {
    if (baseMime === 'audio/webm') return 'audio.webm';
    if (baseMime === 'audio/ogg') return 'audio.ogg';
    if (baseMime === 'audio/mpeg') return 'audio.mp3';
    if (baseMime === 'audio/mp4' || baseMime === 'audio/m4a' || baseMime === 'audio/x-m4a' || baseMime === 'audio/aac') return 'audio.mp4';
    return 'audio.webm';
  }
  return 'media.bin';
}

const SYSTEM_GUIDE_CONTEXT = `
CORVFIN V3 - GUIA E DIRETRIZES DO ASSISTENTE:

DIRETRIZES DE PERSONALIDADE & ESTILO DE RESPOSTA (OBRIGATÓRIO):
1. Tom de Voz: Leve, natural, direto, caloroso, conversacional e objetivo. Evite formalidades excessivas ou burocráticas.
2. Reatividade Estrita: Responda exclusivamente ao que o usuário perguntou. Não antecipe análises, relatórios ou balanços complexos sem solicitação explícita.
3. Regra de Não-Despejo de Contexto: Nunca ofereça automaticamente um resumo financeiro completo apenas porque possui os dados disponíveis. Utilize os dados somente quando forem estritamente pertinentes à pergunta atual.
4. Saudações e Conversas Informais (ex: "Oi", "Olá", "Boa tarde", "Tudo bem?"): Responda de forma curta e amigável em 1 a 2 frases (ex: "Oi! Como posso te ajudar hoje?"). NÃO apresente despesas, receitas ou saldos sem que o usuário tenha pedido.
5. Dúvidas sobre o Sistema (ex: "Como funciona a Lista de Compras?"): Explique diretamente o recurso solicitado em 2 a 4 linhas. NÃO anexe resumo de gastos, despesas ou devedores.
6. Tamanho das Respostas (Widget Compacto):
   - Saudações e interações simples: 1 a 2 frases.
   - Dúvidas e perguntas financeiras objetivas: 3 a 6 linhas no máximo.
   - Análises aprofundadas: Apenas quando o usuário solicitar explicitamente ("faça um resumo", "analise meus gastos", "detalhe tudo", "compare").
7. Divulgação Progressiva (Progressive Disclosure): Ao responder valores, informe primeiro o dado essencial (ex: "Em outubro/2026 você tem R$ 2.858,06 em despesas."). Se conveniente, conclua oferecendo detalhamento adicional (ex: "Se quiser, posso detalhar por categoria ou destino.").
8. Formatação de Texto Limpo (Sem Markdown Cru): Escreva em texto fluido e limpo. NÃO utilize formatação Markdown crua com asteriscos excessivos (evite **, *, ##, backticks). Use pontuação natural e valores monetários claros (ex: R$ 1.500,00).

CAPACIDADES OFICIAIS E AÇÕES CONTROLADAS DO ASSISTENTE:
1. Leitura e Análise:
   - Consultar e analisar os dados financeiros do próprio usuário (despesas, orçamento, devedores, rendas extras, benefícios, investimentos, categorias, destinos).
2. Ações Transacionais Controladas (Write via Proposta + Confirmação):
   - O Assistente PODE propor e cadastrar DESPESAS diretamente mediante confirmação do usuário (create_expense).
   - O Assistente PODE propor e cadastrar BENEFÍCIOS diretamente mediante confirmação do usuário (create_benefit).
   - Ao receber solicitações de despesas ou benefícios com descrição e valor, o assistente gera uma proposta estruturada para o usuário revisar e confirmar.
   - Suporte a Memória Transacional Multi-Turno e Slot Filling: Se faltarem dados essenciais (ex: "Comprei uma bolsa", "Usei meu VR"), o assistente inicia a coleta natural (continue_collection) e pergunta apenas o próximo dado necessário ("Massa! Quanto foi?", "E pagou como?").
   - Quando todos os dados necessários forem reunidos ao longo da conversa, o assistente gera o card de proposta com proposalId para confirmação explícita.
3. Módulos com Cadastro Exclusivo na Interface (NÃO cadastrados diretamente pelo chat):
   - Devedores: Quando o usuário pedir para registrar ou mencionar devedores ("Fulano está me devendo 100 reais"), oriente: "Posso te orientar, mas o cadastro de devedores ainda precisa ser feito no módulo Devedores."
   - Rendas Extras: Quando o usuário mencionar renda extra ou recebimento de freela ("Recebi 500 reais de freela"), oriente: "Esse lançamento deve ser feito em Rendas Extras."
   - Investimentos: Quando o usuário mencionar investimentos ("Investi 300 reais em CDB"), oriente: "Esse registro deve ser feito no módulo Investimentos."
4. Regra de Verdade sobre Capacidades:
   - NUNCA afirme que você é "somente leitura" ou que "não possui ferramenta para cadastrar despesas/benefícios". Você possui capacidade de propor e cadastrar despesas e benefícios mediante confirmação.

REGRAS DE CONTEXTO FINANCEIRO, HISTÓRICO E PARIDADE DE MÉTRICAS:
1. Navegação Histórica (activePeriod vs periods):
   - "activePeriod" é a competência selecionada na tela pelo usuário (ex: Outubro/2026). Utilize-a como padrão para perguntas sem mês especificado (ex: "quanto tenho pendente?").
   - "periods" contém o histórico de competências disponíveis do mesmo usuário (ex: Janeiro a Dezembro). Quando o usuário perguntar de outro mês (ex: "E setembro?", "Compare agosto e setembro"), consulte os dados do mês correspondente no array "periods".
2. Separação Semântica: Salário Base vs Benefício (VA/VR):
   - "baseSalary" (Salário Base) é a remuneração salarial principal do usuário.
   - "benefit" (Benefício VA/VR) é uma métrica separada de auxílio alimentação/refeição.
   - NUNCA some automaticamente Benefício ao Salário para formar "renda" ou "salário". Se o usuário perguntar "qual meu salário?", informe apenas o Salário Base. Se perguntar "quanto tenho de benefício?", informe apenas o Benefício. Realize a soma apenas se o usuário pedir explicitamente ("some salário e benefício").
3. Rendas Extras e Devedores (Valores a Receber):
   - "totalExtras" são rendas adicionais cadastradas para a competência.
   - "totalDebtorsReceivable" é o total de cobranças/devedores a receber no mês.
   - "totalDebtorsCounted" são os devedores configurados com "countInTotal: true" para somar na renda mensal do CorvFin.
   - A métrica "totalIncome" (Renda Total Oficial) no CorvFin é: Salário Base + Rendas Extras + Devedores Contabilizados.
4. Simulações Analíticas a Pedido do Usuário:
   - Se o usuário pedir cálculos alternativos (ex: "quanto sobra sem os devedores?", "e sem renda extra?"), recalcule a resposta analiticamente explicando a simulação, sem alterar os dados oficiais.
5. Isolamento Estrito de Contas:
   - Você possui acesso exclusivo aos dados do usuário autenticado no payload. Se o usuário perguntar sobre finanças de outras pessoas/contas (ex: Fernando, Gabriel), recuse educadamente informando que cada conta do CorvFin é estritamente privada e isolada.

RECURSOS E MÓDULOS DO SISTEMA:
1. Dashboard Consolidado (/dashboard):
   - Visão holística de Total Consolidado, Despesas, Valores a Receber e status Pago vs Pendente.
   - Gráficos e agrupamentos por Categoria e Destino/Cartão com filtros por competência (mês/ano).
2. Gestão de Despesas & Pagamentos:
   - À Vista (Pix/Dinheiro com quitação automática), Parceladas e Fixas Recorrentes com histórico de versões.
   - Vencimento herdado automaticamente das configurações de cartões e bancos no Perfil.
3. Benefícios (VR / VA / Saúde / Transporte / Educação / Cultura / Farmácia):
   - Lançamentos com desconto sobre o crédito base mensal e controle de saldo compartilhado.
4. Categorias & Tetos Orçamentários:
   - Configuração com nome, ícone semântico, cor personalizada e teto orçamentário mensal com alertas de estouro.
5. Lista de Compras Inteligente:
   - Catálogo padrão com autocomplete preditivo e aprendizado contínuo de itens personalizados.
6. Simulação de Cenários Financeiros (Sandbox):
   - Projeções seguras e isoladas de novas despesas e parcelamentos sem alterar dados reais da conta.
7. Investimentos & Patrimônio:
   - Renda Fixa, Ações, FIIs, Cripto e Reserva de Emergência com acompanhamento de metas.
8. Devedores & Rendas Extras:
   - Controle de parcelas a receber de terceiros e lançamentos esporádicos de renda.
9. Permissões (RBAC) & Manutenção:
   - Perfis de usuário comum e administrador com controle modular de acesso.
`.trim();

/**
 * Constrói um contexto financeiro seguro, resumido e sanitizado
 * para a competência solicitada (mês/ano).
 * 
 * @param {Object} finances - Documento financeiro do usuário
 * @param {number} queryMonth - Mês (1-12)
 * @param {number} queryYear - Ano (ex: 2026)
 * @returns {Object} Contexto financeiro estruturado
 */
const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Constrói os dados e métricas de uma competência específica (mês/ano)
 * com 100% de paridade com o motor de cálculo do OmniFin (financeQueries.js / dashboard.js).
 */
function buildPeriodData(finances, y, m) {
  const periodKey = `${y}-${m}`;
  const target = y * 12 + m;

  // 1. Salário Base e Benefício (Estritamente Separados)
  const customIncome = finances.incomes && finances.incomes[periodKey];
  const baseSalary = customIncome !== undefined ? Number(customIncome) : Number(finances.profile?.baseSalary || 0);
  const benefit = Number(
    finances.benefitsConfig?.amount != null
      ? finances.benefitsConfig.amount
      : (Number(finances.benefitsConfig?.va || 0) + Number(finances.benefitsConfig?.vr || 0))
  );

  // 2. Despesas Fixas ativas na competência
  const fixedActive = (finances.fixed || []).filter(f => {
    if (f.endedFrom && target >= (f.endedFrom.year * 12 + f.endedFrom.month)) return false;
    const versions = [...(f.versions || [])].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
    if (versions.length === 0) {
      const sY = f.startYear != null ? f.startYear : y;
      const sM = f.startMonth != null ? f.startMonth : 1;
      return target >= (sY * 12 + sM);
    }
    let activeVer = null;
    for (const v of versions) {
      if ((v.year * 12 + v.month) <= target) activeVer = v;
      else break;
    }
    return activeVer !== null;
  }).map(f => {
    const isPaid = !!(f.paidHistory && f.paidHistory[periodKey]);
    let amt = Number(f.amount || 0);
    const versions = [...(f.versions || [])].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
    for (const v of versions) {
      if ((v.year * 12 + v.month) <= target) amt = Number(v.amount || 0);
      else break;
    }
    return {
      name: f.name,
      group: f.group || 'Gerais',
      destination: f.destination || 'Outros',
      amount: amt,
      dueDay: f.dueDay || null,
      status: isPaid ? 'pago' : 'pendente',
      type: 'fixa'
    };
  });

  // 3. Despesas Variáveis ativas na competência
  const variableActive = (finances.variable || []).filter(v => {
    const sTarget = (v.startYear || y) * 12 + (v.startMonth || 1);
    const eTarget = (v.endYear || v.startYear || y) * 12 + (v.endMonth || v.startMonth || 12);
    return target >= sTarget && target <= eTarget;
  }).map(v => {
    const sTarget = (v.startYear || y) * 12 + (v.startMonth || 1);
    const eTarget = (v.endYear || v.startYear || y) * 12 + (v.endMonth || v.startMonth || 12);
    const total = eTarget - sTarget + 1;
    const cur = target - sTarget + 1;
    const isPaid = !!(v.paidHistory && v.paidHistory[periodKey]);

    return {
      name: v.name,
      group: v.group || 'Gerais',
      destination: v.destination || 'Outros',
      amount: Number(v.amount || 0),
      installmentsTotal: total,
      currentInstallment: Math.min(Math.max(cur, 1), total),
      dueDay: v.dueDay || null,
      status: isPaid ? 'pago' : 'pendente',
      paymentType: v.paymentType || 'cash',
      type: 'variavel'
    };
  });

  // 4. Rendas Extras da competência
  const extrasActive = (finances.extras || []).filter(e => {
    if (e.startYear && e.startMonth && e.endYear && e.endMonth) {
      const sTarget = e.startYear * 12 + e.startMonth;
      const eTarget = e.endYear * 12 + e.endMonth;
      return target >= sTarget && target <= eTarget;
    }
    const ym = (e.date || '').substring(0, 7);
    if (ym === `${y}-${String(m).padStart(2, '0')}`) return true;
    if (e.year === y && e.month === m) return true;
    return false;
  }).map(e => {
    const isPaid = e.paidHistory ? e.paidHistory[periodKey] === true : (e.status === 'pago' || e.received === true);
    return {
      title: e.title || e.name || 'Renda Extra',
      source: e.source || 'Gerais',
      amount: Number(e.amount || 0),
      status: isPaid ? 'pago' : 'pendente'
    };
  });

  // 5. Devedores / Cobranças da competência
  const debtorsActive = (finances.debtors || []).filter(d => {
    const sTarget = (d.startYear || y) * 12 + (d.startMonth || 1);
    const eTarget = (d.endYear || d.startYear || y) * 12 + (d.endMonth || d.startMonth || 1);
    return target >= sTarget && target <= eTarget;
  }).map(d => {
    const sTarget = (d.startYear || y) * 12 + (d.startMonth || 1);
    const eTarget = (d.endYear || d.startYear || y) * 12 + (d.endMonth || d.startMonth || 1);
    const total = eTarget - sTarget + 1;
    const cur = target - sTarget + 1;
    const isPaid = !!(d.paidHistory && d.paidHistory[periodKey]) || (d.status === 'pago');
    const isCounted = d.countInTotal === true;
    return {
      debtorName: d.debtorName || d.name || 'Devedor',
      title: d.title || 'Cobrança',
      amount: Number(d.amount || 0),
      destination: d.destination || 'Outros',
      installmentIndex: cur,
      installmentTotal: total,
      status: isPaid ? 'pago' : 'pendente',
      countInTotal: isCounted
    };
  });

  // 6. Totais e Métricas Oficiais da Competência (Paridade Absoluta com o OmniFin)
  const sumFixed = fixedActive.reduce((acc, curr) => acc + curr.amount, 0);
  const sumVar = variableActive.reduce((acc, curr) => acc + curr.amount, 0);
  const totalExpenses = sumFixed + sumVar;

  const allExpenses = [...fixedActive, ...variableActive];
  const totalPaidExpenses = allExpenses.filter(e => e.status === 'pago').reduce((acc, curr) => acc + curr.amount, 0);
  const totalPendingExpenses = totalExpenses - totalPaidExpenses;

  const totalExtras = extrasActive.reduce((acc, curr) => acc + curr.amount, 0);
  const totalDebtorsReceivable = debtorsActive.reduce((acc, curr) => acc + curr.amount, 0);
  const totalDebtorsCounted = debtorsActive.filter(d => d.countInTotal).reduce((acc, curr) => acc + curr.amount, 0);

  // Total Income oficial do OmniFin: baseSalary + totalExtras + totalDebtorsCounted (benefício NÃO entra no salário)
  const totalIncome = baseSalary + totalExtras + totalDebtorsCounted;
  const netBalance = totalIncome - totalExpenses;

  // Breakdown por Categoria com Teto/Budget
  const budgets = finances.budgets || {};
  const categoryTotals = {};
  allExpenses.forEach(e => {
    categoryTotals[e.group] = (categoryTotals[e.group] || 0) + e.amount;
  });

  const categoryBreakdown = Object.keys(categoryTotals).map(cat => {
    const spent = categoryTotals[cat];
    const budget = Number(budgets[cat] || 0);
    return {
      category: cat,
      totalSpent: spent,
      budgetLimit: budget,
      isOverBudget: budget > 0 && spent > budget,
      pctBudget: budget > 0 ? Math.round((spent / budget) * 100) : null
    };
  }).sort((a, b) => b.totalSpent - a.totalSpent);

  // Breakdown por Destino
  const destinationTotals = {};
  allExpenses.forEach(e => {
    destinationTotals[e.destination] = (destinationTotals[e.destination] || 0) + e.amount;
  });
  const destinationBreakdown = Object.entries(destinationTotals).map(([dest, total]) => ({
    destination: dest,
    total
  })).sort((a, b) => b.total - a.total);

  return {
    month: m,
    year: y,
    label: `${MONTH_NAMES_PT[m - 1]}/${y}`,
    summary: {
      baseSalary,
      benefit,
      totalExtras,
      totalDebtorsReceivable,
      totalDebtorsCounted,
      totalIncome,
      totalExpenses,
      totalPaidExpenses,
      totalPendingExpenses,
      netBalance
    },
    expenses: allExpenses,
    categoryBreakdown,
    destinationBreakdown,
    extras: extrasActive,
    debtors: debtorsActive
  };
}

/**
 * Constrói um contexto financeiro histórico multiperíodo, seguro e compacto,
 * garantindo disponibilidade para consultas sobre meses anteriores/futuros do mesmo usuário.
 * 
 * @param {Object} finances - Documento financeiro do usuário autenticado
 * @param {number} queryMonth - Mês ativo na tela (1-12)
 * @param {number} queryYear - Ano ativo na tela (ex: 2026)
 * @returns {Object} Contexto financeiro multiperíodo estruturado
 */
function buildFinancialContext(finances, queryMonth, queryYear) {
  if (!finances || typeof finances !== 'object') {
    return {
      activePeriod: { month: queryMonth || 8, year: queryYear || 2026 },
      period: { month: queryMonth || 8, year: queryYear || 2026 },
      note: 'Nenhum dado financeiro registrado para este usuário.'
    };
  }

  const activeMonth = Number(queryMonth) || finances.month || (new Date().getMonth() + 1);
  const activeYear = Number(queryYear) || finances.year || new Date().getFullYear();

  // 1. Identificação de todos os períodos relevantes para o histórico do usuário
  const periodSet = new Set();

  // Inclui todos os 12 meses do ano ativo
  for (let m = 1; m <= 12; m++) {
    periodSet.add(`${activeYear}-${m}`);
  }

  // Identifica meses com movimentações em anos adjacentes (ano anterior e posterior)
  const checkPeriod = (y, m) => {
    if (y && m && y >= (activeYear - 1) && y <= (activeYear + 1)) {
      periodSet.add(`${y}-${m}`);
    }
  };

  (finances.variable || []).forEach(v => {
    checkPeriod(v.startYear, v.startMonth);
    checkPeriod(v.endYear, v.endMonth);
  });

  (finances.fixed || []).forEach(f => {
    (f.versions || []).forEach(ver => checkPeriod(ver.year, ver.month));
  });

  (finances.extras || []).forEach(e => {
    checkPeriod(e.startYear, e.startMonth);
    checkPeriod(e.endYear, e.endMonth);
    checkPeriod(e.year, e.month);
  });

  (finances.debtors || []).forEach(d => {
    checkPeriod(d.startYear, d.startMonth);
    checkPeriod(d.endYear, d.endMonth);
  });

  if (finances.incomes && typeof finances.incomes === 'object') {
    Object.keys(finances.incomes).forEach(k => {
      const [yStr, mStr] = k.split('-');
      checkPeriod(Number(yStr), Number(mStr));
    });
  }

  // Ordena cronologicamente os períodos identificados
  const sortedPeriodKeys = Array.from(periodSet).map(k => {
    const [y, m] = k.split('-').map(Number);
    return { year: y, month: m, sortKey: y * 12 + m };
  }).sort((a, b) => a.sortKey - b.sortKey);

  // Constrói o dataset para cada período
  const periods = sortedPeriodKeys.map(p => buildPeriodData(finances, p.year, p.month));

  // Dados da competência ativa selecionada na interface
  const currentPeriod = buildPeriodData(finances, activeYear, activeMonth);

  // 2. Perfil e Benefícios
  const benefitVal = Number(
    finances.benefitsConfig?.amount != null
      ? finances.benefitsConfig.amount
      : (Number(finances.benefitsConfig?.va || 0) + Number(finances.benefitsConfig?.vr || 0))
  );

  const profile = {
    name: finances.profile?.name || '',
    baseSalary: Number(finances.profile?.baseSalary || 0),
    benefit: benefitVal
  };

  const benefitsConfig = {
    amount: benefitVal,
    va: Number(finances.benefitsConfig?.va || 0),
    vr: Number(finances.benefitsConfig?.vr || 0)
  };

  // 3. Investimentos / Ativos
  const assets = (finances.assets || []).map(a => ({
    name: a.name || a.title || 'Ativo',
    category: a.category || 'Outros',
    currentAmount: Number(a.currentAmount || a.amount || 0)
  }));
  const totalInvested = assets.reduce((acc, curr) => acc + curr.currentAmount, 0);

  // 4. Lista de Compras
  const shoppingLists = (finances.shoppingLists || []).map(l => ({
    name: l.name,
    totalItems: (l.items || []).length,
    pendingItems: (l.items || []).filter(i => !i.checked).length
  }));

  // 5. Configurações Globais
  const categories = (finances.categories || []).map(c => typeof c === 'string' ? { name: c } : { name: c.name, icon: c.icon, color: c.color });
  const destinations = (finances.destinations || []).map(d => ({ name: d.name, dueDay: d.dueDay, icon: d.icon, color: d.color }));

  return {
    activePeriod: { month: activeMonth, year: activeYear },
    period: { month: activeMonth, year: activeYear }, // Retrocompatibilidade
    profile,
    benefits: benefitsConfig,
    currentPeriod,
    summary: currentPeriod.summary, // Retrocompatibilidade direta
    expenses: currentPeriod.expenses,
    categoryBreakdown: currentPeriod.categoryBreakdown,
    destinationBreakdown: currentPeriod.destinationBreakdown,
    extras: currentPeriod.extras,
    debtors: currentPeriod.debtors,
    periods, // Contexto histórico completo de períodos do usuário
    investments: {
      totalInvested,
      assets
    },
    shoppingSummary: {
      totalLists: shoppingLists.length,
      lists: shoppingLists
    },
    categories,
    destinations
  };
}

/**
 * Envia payload estruturado para o webhook do n8n com timeout e autenticação.
 * 
 * @param {Object} payload - Dados estruturados para o n8n
 * @returns {Promise<Object>} Resposta validada do n8n
 */
async function sendToN8nWebhook(payload) {
  const webhookUrl = config.N8N_AI_WEBHOOK_URL;
  const authUser = config.N8N_AI_BASIC_AUTH_USER;
  const authPass = config.N8N_AI_BASIC_AUTH_PASSWORD;

  if (!webhookUrl || !authUser || !authPass) {
    const error = new Error('Assistente de IA não configurado no servidor.');
    error.status = 503;
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }

  const timeoutMs = config.AI_REQUEST_TIMEOUT_MS || 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const credentials = Buffer.from(`${authUser}:${authPass}`).toString('base64');
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'CorvFin-Server/3.8.0',
    'Authorization': `Basic ${credentials}`
  };

  const startTime = Date.now();
  console.log(`[AI] calling n8n (requestId=${payload.requestId})`);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timer);
    const duration = Date.now() - startTime;
    console.log(`[AI] n8n status=${response.status} duration=${duration}ms`);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[AI] n8n upstream returned HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      const err = new Error(`n8n webhook respondeu com HTTP ${response.status}`);
      err.status = 502;
      err.code = 'N8N_UPSTREAM_ERROR';
      err.upstreamStatus = response.status;
      err.details = errorText.substring(0, 300);
      err.duration = duration;
      throw err;
    }

    const json = await response.json().catch(() => null);
    if (!json || typeof json !== 'object') {
      console.error('[AI] n8n response is not valid JSON');
      const err = new Error('Resposta do n8n não é um JSON válido.');
      err.status = 502;
      err.code = 'N8N_INVALID_RESPONSE';
      throw err;
    }

    // Suporte tanto para { answer: "..." } quanto para retorno em array [{ answer: "..." }]
    const data = Array.isArray(json) ? (json[0] || {}) : json;

    if (typeof data.answer !== 'string' || !data.answer.trim()) {
      console.error('[AI] n8n response is missing required "answer" field');
      const err = new Error('Resposta do n8n não contém o campo "answer" esperado.');
      err.status = 502;
      err.code = 'N8N_MISSING_ANSWER';
      throw err;
    }

    console.log(`[AI] valid response received from n8n for conversation=${data.conversationId || payload.conversationId}`);
    return {
      success: true,
      conversationId: data.conversationId || payload.conversationId,
      answer: String(data.answer).trim(),
      suggestions: Array.isArray(data.suggestions) ? data.suggestions.filter(s => typeof s === 'string') : [],
      duration
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError' || err.code === 20) {
      console.error(`[AI] n8n timeout after ${config.AI_REQUEST_TIMEOUT_MS || 30000}ms`);
      const timeoutErr = new Error('Tempo limite de resposta do assistente excedido (timeout).');
      timeoutErr.status = 504;
      timeoutErr.code = 'AI_TIMEOUT';
      throw timeoutErr;
    }
    console.error(`[AI] n8n request error: status=${err.status || 502} code=${err.code || 'UNKNOWN'} message="${err.message}"`);
    throw err;
  }
}

const crypto = require('crypto');

function safeTrim(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  return String(val).trim();
}

function normalizeSearchStr(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function isGenericIntentPhrase(text) {
  if (!text) return false;
  const raw = safeTrim(text);
  if (!raw) return false;
  const norm = normalizeSearchStr(raw).replace(/[!?,.]+/g, ' ').replace(/\s+/g, ' ').trim();
  const stripped = norm.replace(/^(?:blz|beleza|opa|oi|ola|ok|show|massa|fala|fala ai|e ai|e|aqui|por favor|pfv|valeu|partiu)\s+/, '');
  const genericRegex = /^(?:quero|gostaria de|bora|vamos|partiu|preciso|tenho que|desejo|favor|bora la|vamos la)?\s*(?:cadastrar|registrar|lancar|anotar|adicionar|criar|fazer|novo|nova)\s+(?:uma\s+|um\s+|nova\s+|novo\s+)?(?:despesa|gasto|compra|lancamento|saida|beneficio)?(?:\s+(?:nova|novo|aqui|ai|pro mes|de hoje|rapida|rapido))?$/;
  if (genericRegex.test(norm) || genericRegex.test(stripped)) return true;
  if (/^(?:cadastrar|registrar|lancar|anotar|adicionar|nova|novo)?\s*(?:despesa|gasto|compra|beneficio)\s*(?:nova|novo|aqui|ai)?$/.test(norm) ||
      /^(?:cadastrar|registrar|lancar|anotar|adicionar)\s*(?:nova|novo)?$/.test(norm)) {
    return true;
  }
  return false;
}

function extractDescriptionFromMessage(text) {
  if (!text) return '';
  let str = safeTrim(text);
  if (isGenericIntentPhrase(str)) {
    return '';
  }
  // Se for apenas comando genérico de cadastro, não é nome de item
  if (/^(quero cadastrar|gostaria de cadastrar|quero registrar|quero lançar|quero lancar|quero anotar|cadastrar|registrar|lançar|lancar|adicionar)\s+(?:uma\s+|um\s+)?(?:despesa|gasto|compra|beneficio|benefício)\b/i.test(str)) {
    return '';
  }
  // Remove expressões de correção
  if (/\b(na verdade|corrigindo|errei|ops|opa|digo|alias|aliás|queria dizer|quis dizer)\b/i.test(str)) {
    str = str.replace(/\b(na verdade|corrigindo|errei|ops|opa|digo|alias|aliás|queria dizer|quis dizer)\b/gi, '').trim();
  }
  // Se a mensagem for puramente indicação de forma de pagamento / benefício / destino
  if (/^(?:no|na|pelo|pela|via|com|em|de|o|a|meu|minha|usei\s+meu|usei\s+minha|usei|passei\s+meu|passei\s+minha|passei)?\s*(?:pix|dinheiro|cartao|cartão|debito|débito|credito|crédito|nubank|vr|va|vale(?:\s+refeicao|\s+refeição|\s+alimentacao|\s+alimentação)?)(?:\s+mesmo|\s+por\s+favor|\s+tbm|\s+tambem|\s+também)?\.?$/i.test(str)) {
    return '';
  }
  // Se a mensagem for puramente confirmação ou cancelamento
  if (/^(?:sim|nao|não|pode|confirma|confirmar|manda|salva|grava|deixa|cancela|esquece)\b/i.test(str)) {
    return '';
  }
  // Se a mensagem for puramente valor numérico ou "foi X" / "era X"
  if (/^(?:foi\s+|era\s+|de\s+|por\s+)?(?:r\$\s*|rs\s*|\$)?\s*\d+(?:[.,]\d+)?\s*(?:reais|real|conto|pila|mil|k)?(?:\s*,?\s*(?:pae|cara|amigo|mesmo|por\s+favor))?\.?$/i.test(str)) {
    return '';
  }
  // Remove triggers de benefício e forma de pagamento no início
  str = str.replace(/^(?:tenho\s+\w+,\s*mas\s+paguei|tenho\s+\w+\s+mas\s+paguei|ia\s+pagar\s+no\s+\w+\s+mas\s+paguei)\s+(?:o|a|com|no|na|em)?\s*/i, '');
  str = str.replace(/^(?:usei|passei|gastei)\s+(?:meu|minha|o|a|com|no|na|em)?\s*(?:vr|va|vale(?:\s+refeicao|\s+refeição|\s+alimentacao|\s+alimentação)?)\s+(?:no|na|em|com|para)?\s*/i, '');
  // Remove triggers de ação no início
  str = str.replace(/^(comprei|gastei com|gastei no|gastei na|gastei em|gastei|paguei|assinei|fiz uma compra de|fiz uma compra|usei meu \w+ no|usei meu \w+ na|usei meu \w+ em|usei \w+ no|usei \w+ na|usei \w+ em|usei|passei no|passei na|passei|foi no|foi na|foi em|no|na)\s+/i, '');
  // Remove valor numérico que esteja no início após o verbo (ex: "Usei 50 reais no almoço" -> "almoço")
  str = str.replace(/^(?:de|por|com)?\s*(?:r\$\s*|rs\s*|\$)?\s*\d+(?:[.,]\d+)?\s*(?:reais|real|conto|pila|mil|k)?\s+(?:no|na|em|com|para|de|num|numa)?\s*/i, '');
  // Remove sufixos de preço / forma de pagamento / datas no final
  str = str.replace(/\s+(?:por|de|com)\s+(?:r\$\s*|\$)?\d+.*$/i, '');
  str = str.replace(/\s+(?:e\s+paguei|mas\s+paguei|paguei|usando|com|via|no|na|em|pelo|pela)\s+(?:no|na|em|via|com|pelo|pela)?\s*(?:o\s+|a\s+|meu\s+|minha\s+)?(?:pix|dinheiro|cartao|cartão|debito|débito|credito|crédito|nubank|vr|va|vale transporte|vale refeicao|vale refeição|vale alimentacao|vale alimentação|vale|beneficio|benefício).*$/i, '');
  str = str.replace(/\s+(?:hoje|ontem|em abril|em maio|em junho|em julho|em agosto|em setembro|em outubro|em novembro|em dezembro|mes passado|mês passado).*$/i, '');
  str = str.replace(/[!?,.]+$/g, '').trim();
  // Remove artigos iniciais
  str = str.replace(/^(um|uma|uns|umas|o|a|os|as)\s+/i, '');
  // Remove expressões informais soltas
  str = str.replace(/\b(mesmo|tambem|também|pae|cara|amigo)\b/gi, '').trim();

  const lowerDesc = normalizeSearchStr(str);
  if (['pix', 'dinheiro', 'cartao', 'cartão', 'debito', 'débito', 'credito', 'crédito', 'cartao de credito', 'cartão de crédito', 'cartao de debito', 'cartão de débito', 'nubank', 'vr', 'va', 'vale', 'despesa', 'gasto', 'compra', 'beneficio', 'verdade', 'meu vr', 'meu va', 'no vr', 'no va', 'com vr', 'com va'].includes(lowerDesc)) {
    return '';
  }

  return str.trim();
}

function extractAmountFromMessage(text) {
  if (!text) return null;
  const str = safeTrim(text);
  // 10k ou 10 mil
  const kMatch = str.match(/\b(\d+(?:[.,]\d+)?)\s*(?:k|mil)\b/i);
  if (kMatch) {
    const n = parseFloat(kMatch[1].replace(',', '.'));
    if (!isNaN(n) && n > 0) return n * 1000;
  }
  // Padrão numérico monetário: R$ 300, 300, 35,50, 23.99, "300, pae", "foi 350", "era 300"
  const allNumMatches = [...str.matchAll(/(?:R\$\s*|RS\s*|\$)?\b(\d+(?:[.,]\d{1,2})?|\d+)\b(?:\s*(?:reais|real|conto|pila))?/gi)];
  if (allNumMatches && allNumMatches.length > 0) {
    // Se houver múltiplos números, prioriza o que não for dia ("dia 15") ou ano ("2026", "2025")
    for (let i = allNumMatches.length - 1; i >= 0; i--) {
      const match = allNumMatches[i];
      const valStr = match[1].replace(',', '.');
      const n = parseFloat(valStr);
      if (!isNaN(n) && n > 0 && n !== 2026 && n !== 2025) {
        // Verifica se não é "dia X"
        const isDayMatch = new RegExp(`\\bdia\\s+${match[1]}\\b`, 'i').test(str);
        if (!isDayMatch) {
          return n;
        }
      }
    }
  }
  return null;
}

function extractDestinationFromMessage(text, userDestinations = []) {
  if (!text) return null;
  const lower = normalizeSearchStr(text);
  // Correspondência com destinos cadastrados do usuário
  for (const d of userDestinations) {
    const destName = typeof d === 'string' ? d : d?.name;
    if (destName && lower.includes(normalizeSearchStr(destName))) {
      return destName;
    }
  }
  // Correspondência com formas canônicas
  if (/\bpix\b/i.test(lower)) {
    const found = userDestinations.find(d => normalizeSearchStr(typeof d === 'string' ? d : d?.name).includes('pix'));
    return found ? (typeof found === 'string' ? found : found.name) : 'Pix';
  }
  if (/\bdinheiro\b/i.test(lower)) {
    const found = userDestinations.find(d => normalizeSearchStr(typeof d === 'string' ? d : d?.name).includes('dinheiro'));
    return found ? (typeof found === 'string' ? found : found.name) : 'Dinheiro';
  }
  if (/\bnubank\b/i.test(lower)) {
    const found = userDestinations.find(d => normalizeSearchStr(typeof d === 'string' ? d : d?.name).includes('nubank'));
    return found ? (typeof found === 'string' ? found : found.name) : 'Nubank PJ';
  }
  return null;
}

function extractBenefitTypeFromMessage(text) {
  if (!text) return null;
  const lower = normalizeSearchStr(text);
  // 1. Siglas e termos explícitos de benefício corporativo (Lote 5G-M.2.4 / 5G-M)
  if (/\b(vale\s+transporte|vt|cart[aã]o\s+(?:de\s+)?transporte)\b/i.test(lower)) {
    return 'transporte';
  }
  if (/\b(va|vale\s+alimenta[çc][ãa]o)\b/i.test(lower)) {
    return 'va';
  }
  if (/\b(vr|vale\s+refei[çc][ãa]o)\b/i.test(lower)) {
    return 'vr';
  }
  if (/\b(plano\s+de\s+sa[uú]de|benef[ií]cio\s+sa[uú]de)\b/i.test(lower)) {
    return 'saude';
  }
  if (/\b(benef[ií]cio\s+farm[aá]cia|vale\s+farm[aá]cia)\b/i.test(lower)) {
    return 'farmacia';
  }
  if (/\b(benef[ií]cio\s+educa[çc][ãa]o|vale\s+educa[çc][ãa]o)\b/i.test(lower)) {
    return 'educacao';
  }
  if (/\b(benef[ií]cio\s+cultura|vale\s+cultura)\b/i.test(lower)) {
    return 'cultura';
  }
  return null;
}

/**
 * Detecta resposta de follow-up curto do usuário informando forma de pagamento convencional
 * ou tipo de benefício corporativo (Lote 5G-M).
 * Apenas tokens curtos e inequívocos são correspondidos.
 */
function detectPaymentOrBenefitFollowUp(message, validAccounts = [], userDestinations = []) {
  if (!message || typeof message !== 'string') return null;
  const raw = message.trim();
  if (raw.length > 80) return null;
  if (/\b(comprei|gastei|paguei\s+\d|lan[çc]ar|adicionar|outra\s+compra)\b/i.test(raw)) return null;
  if (/\b\d+([.,]\d+)?\s*(reais|real|conto|pila)\b/i.test(raw) || /R\$\s*\d+/i.test(raw)) return null;

  const norm = normalizeSearchStr(raw);

  // 1. Benefício corporativo explícito
  if (/^(?:no\s+|paguei\s+no\s+|via\s+|foi\s+no\s+|com\s+|pelo\s+|usei\s+o\s+|usei\s+meu\s+)?(?:vr|vale\s+refei[çc][ãa]o)$/i.test(norm) ||
      norm === 'vr' || norm === 'vale refeicao' || norm === 'vale refeição') {
    return { kind: 'benefit', benefitType: 'vr' };
  }
  if (/^(?:no\s+|paguei\s+no\s+|via\s+|foi\s+no\s+|com\s+|pelo\s+|usei\s+o\s+|usei\s+meu\s+)?(?:va|vale\s+alimenta[çc][ãa]o)$/i.test(norm) ||
      norm === 'va' || norm === 'vale alimentacao' || norm === 'vale alimentação') {
    return { kind: 'benefit', benefitType: 'va' };
  }
  if (/^(?:no\s+|paguei\s+no\s+|via\s+|foi\s+no\s+|com\s+|pelo\s+|usei\s+o\s+|usei\s+meu\s+)?(?:vt|vale\s+transporte|cart[aã]o\s+(?:de\s+)?transporte)$/i.test(norm) ||
      norm === 'vt' || norm === 'vale transporte') {
    return { kind: 'benefit', benefitType: 'transporte' };
  }
  if (/^(?:no\s+|paguei\s+no\s+|via\s+|com\s+|usei\s+meu\s+)?(?:benef[ií]cio\s+farm[aá]cia|vale\s+farm[aá]cia)$/i.test(norm)) {
    return { kind: 'benefit', benefitType: 'farmacia' };
  }
  if (/^(?:no\s+|paguei\s+no\s+|via\s+|com\s+|usei\s+meu\s+)?(?:benef[ií]cio\s+sa[uú]de|plano\s+de\s+sa[uú]de)$/i.test(norm)) {
    return { kind: 'benefit', benefitType: 'saude' };
  }
  if (/^(?:no\s+|paguei\s+no\s+|via\s+|com\s+|usei\s+meu\s+)?(?:benef[ií]cio\s+educa[çc][ãa]o|vale\s+educa[çc][ãa]o)$/i.test(norm)) {
    return { kind: 'benefit', benefitType: 'educacao' };
  }
  if (/^(?:no\s+|paguei\s+no\s+|via\s+|com\s+|usei\s+meu\s+)?(?:benef[ií]cio\s+cultura|vale\s+cultura)$/i.test(norm)) {
    return { kind: 'benefit', benefitType: 'cultura' };
  }

  // 2. Meio de pagamento convencional
  if (/^(?:no\s+|paguei\s+no\s+|via\s+|foi\s+no\s+|com\s+|pelo\s+)?pix$/i.test(norm)) {
    return { kind: 'payment', method: 'pix', destination: null, account: null };
  }
  if (/^(?:no\s+|paguei\s+no\s+|em\s+|paguei\s+em\s+|via\s+|foi\s+no\s+|com\s+|pelo\s+)?(?:dinheiro|cash)$/i.test(norm)) {
    return { kind: 'payment', method: 'dinheiro', destination: 'Dinheiro', account: null };
  }
  if (/^(?:no\s+|paguei\s+no\s+|via\s+|com\s+|pelo\s+)?(?:cr[eé]dito|cart[aã]o\s+de\s+cr[eé]dito|no\s+cart[aã]o|cart[aã]o)$/i.test(norm)) {
    return { kind: 'payment', method: 'cartao_credito', destination: 'Cartão', account: null };
  }
  if (/^(?:no\s+|paguei\s+no\s+|via\s+|com\s+|pelo\s+)?(?:d[eé]bito|cart[aã]o\s+de\s+d[eé]bito)$/i.test(norm)) {
    return { kind: 'payment', method: 'cartao_debito', destination: 'Cartão', account: null };
  }
  if (/^(?:no\s+|paguei\s+no\s+|via\s+|com\s+|pelo\s+)?boleto$/i.test(norm)) {
    return { kind: 'payment', method: 'boleto', destination: 'Boleto', account: null };
  }
  if (/^(?:no\s+|paguei\s+no\s+|via\s+|com\s+|pelo\s+)?(?:transfer[eê]ncia|ted|doc)$/i.test(norm)) {
    return { kind: 'payment', method: 'transferencia', destination: 'Transferência', account: null };
  }
  if (/^(?:no\s+|paguei\s+no\s+|via\s+|com\s+|pelo\s+)?(?:d[eé]bito\s+autom[aá]tico|debito\s+automatico)$/i.test(norm)) {
    return { kind: 'payment', method: 'debito_automatico', destination: 'Débito Automático', account: null };
  }

  // 3. Match com conta/cartão específico do usuário
  if (Array.isArray(validAccounts) && validAccounts.length > 0) {
    const matchedAccount = validAccounts.find(acc => {
      const accNorm = normalizeSearchStr(acc);
      return norm === accNorm || norm === `no ${accNorm}` || norm === `na ${accNorm}` || norm === `pelo ${accNorm}` || norm === `pela ${accNorm}` || norm === `cartao ${accNorm}` || norm === `cartão ${accNorm}`;
    });
    if (matchedAccount) {
      return { kind: 'payment', method: 'cartao_credito', destination: matchedAccount, account: matchedAccount };
    }
  }

  return null;
}

function matchSemanticCategory(description, userCategories = []) {
  if (!description || !Array.isArray(userCategories) || userCategories.length === 0) return null;
  const descLower = normalizeSearchStr(description);
  const SEMANTIC_CATEGORY_MAP = [
    { keywords: ['almoco', 'almoço', 'jantar', 'lanche', 'pizza', 'restaurante', 'mercado', 'comida', 'alimentacao', 'alimentação', 'supermercado', 'ifood', 'ubereats', 'padaria', 'cafe', 'café', 'mcdonalds', 'burger', 'mentos', 'bala', 'doce', 'chocolate'], targets: ['alimentacao', 'alimentação', 'refeicao', 'refeição', 'restaurante', 'mercado'] },
    { keywords: ['netflix', 'spotify', 'gemini', 'chatgpt', 'prime', 'youtube', 'assinatura', 'software', 'nuvem', 'hosting', 'mensalidade', 'apple', 'icloud', 'claude', 'disney', 'hbo', 'max'], targets: ['assinatura', 'assinaturas', 'servicos', 'serviços', 'software'] },
    { keywords: ['farmacia', 'farmácia', 'remedio', 'remédio', 'medico', 'médico', 'consulta', 'exame', 'academia', 'dentista', 'hospital', 'saude', 'saúde', 'suplemento', 'drogaria'], targets: ['saude', 'saúde', 'farmacia', 'farmácia', 'academia'] },
    { keywords: ['uber', '99', 'gasolina', 'combustivel', 'combustível', 'estacionamento', 'onibus', 'ônibus', 'metro', 'metrô', 'pedagio', 'pedágio', 'transporte', 'passagem', 'abastecimento'], targets: ['transporte', 'transportes', 'combustivel', 'combustível', 'veiculo', 'veículo'] },
    { keywords: ['aluguel', 'condominio', 'condomínio', 'luz', 'agua', 'água', 'energia', 'gas', 'gás', 'internet', 'iptu', 'moradia', 'casa'], targets: ['moradia', 'habitacao', 'habitação', 'casa', 'contas fixas'] },
    { keywords: ['cinema', 'viagem', 'hotel', 'passeio', 'show', 'livro', 'jogo', 'game', 'bolsa', 'roupa', 'shopping', 'lazer', 'presente', 'balada', 'festa', 'steam'], targets: ['lazer', 'lazer & entretenimento', 'compras', 'vestuario', 'vestuário', 'pessoal'] },
    { keywords: ['investimento', 'tesouro', 'cdb', 'acoes', 'ações', 'fii', 'cripto', 'poupanca', 'poupança', 'aporte'], targets: ['investimento', 'investimentos', 'aplicacao', 'aplicação'] }
  ];

  for (const sem of SEMANTIC_CATEGORY_MAP) {
    const matchesKeyword = sem.keywords.some(k => descLower.includes(k));
    if (matchesKeyword) {
      const found = userCategories.find(c => sem.targets.some(t => normalizeSearchStr(c) === t || normalizeSearchStr(c).includes(t)));
      if (found) return found;
    }
  }
  return null;
}

const CANONICAL_BENEFIT_TYPES = new Set(['saude', 'vr', 'va', 'transporte', 'educacao', 'cultura', 'farmacia']);

function normalizeBenefitType(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (['transporte', 'vt', 'transporte_publico', 'transporte publico', 'vale_transporte', 'vale transporte'].includes(s)) return 'transporte';
  if (['va', 'alimentacao', 'alimentação', 'vale_alimentacao', 'vale_alimentação', 'vale alimentacao', 'vale alimentação'].includes(s)) return 'va';
  if (['vr', 'refeicao', 'refeição', 'vale_refeicao', 'vale_refeição', 'vale refeicao', 'vale refeição'].includes(s)) return 'vr';
  if (['saude', 'saúde', 'plano_saude', 'plano_de_saude', 'plano de saude', 'plano de saúde', 'medico', 'médico'].includes(s)) return 'saude';
  if (['farmacia', 'farmácia', 'drogaria', 'medicamento', 'medicamentos'].includes(s)) return 'farmacia';
  if (['educacao', 'educação', 'escola', 'faculdade', 'curso'].includes(s)) return 'educacao';
  if (['cultura', 'vale_cultura', 'vale cultura', 'livro', 'livros'].includes(s)) return 'cultura';
  return null;
}

/**
 * Analisa a semântica de intenção entre Despesa convencional e Benefício corporativo (Lote 5G-M.2.4).
 * Regras:
 * 1. Benefício corporativo explícito sem forma de pagamento convencional efetiva -> create_benefit
 * 2. Forma de pagamento convencional explícita representando meio efetivamente utilizado -> create_expense
 * 3. Ambiguidade genuína entre ambos -> requiresReview / proposta corrigível pelo usuário
 */
function analyzeExpenseVsBenefitIntent(message) {
  if (!message || typeof message !== 'string') {
    return { intent: 'create_expense', isAmbiguous: false };
  }
  const lower = normalizeSearchStr(message);

  const hasBenefitWord = /\b(vr|va|vt|vale\s+refei[çc][ãa]o|vale\s+alimenta[çc][ãa]o|vale\s+transporte|benef[ií]cio(?:s)?|plano\s+de\s+sa[uú]de)\b/i.test(lower);
  const hasConventionalPayment = /\b(pix|dinheiro|cart[aã]o|cr[eé]dito|d[eé]bito|boleto|transfer[eê]ncia|ted|doc|d[eé]bito\s+autom[aá]tico|nubank)\b/i.test(lower);

  // Se nenhum dos dois foi citado
  if (!hasBenefitWord && !hasConventionalPayment) {
    return { intent: 'create_expense', isAmbiguous: false };
  }

  // Apenas benefício corporativo citado
  if (hasBenefitWord && !hasConventionalPayment) {
    return { intent: 'create_benefit', isAmbiguous: false };
  }

  // Apenas pagamento convencional citado
  if (!hasBenefitWord && hasConventionalPayment) {
    return { intent: 'create_expense', isAmbiguous: false };
  }

  // Ambos citados: interpretar qual foi efetivamente o meio utilizado
  // 1. Padrões onde pagamento convencional foi o efetivo:
  // "tenho VA, mas paguei no Pix", "ia pagar no VR mas foi no debito", "paguei o almoço no Pix", "e paguei no Pix"
  const convEffectiveRegex = /(?:mas|porem|porém|contudo|so que|só que|na verdade|embora|apesar de)\s+.*?\b(?:pix|dinheiro|cart[aã]o|cr[eé]dito|d[eé]bito|boleto|transfer[eê]ncia|ted|doc|nubank)\b|\b(?:paguei|passei|foi|quitei)\b.*?\b(?:no|na|em|via|com|pelo|pela)\b.*?\b(?:pix|dinheiro|cart[aã]o|cr[eé]dito|d[eé]bito|boleto|transfer[eê]ncia|ted|doc|nubank)\b/i;

  // 2. Padrões onde benefício foi o efetivo:
  // "ia pagar no pix mas usei o VR", "tinha dinheiro mas paguei no VA", "e paguei no VR", "mas usei meu VR"
  const benefitEffectiveRegex = /(?:mas|porem|porém|contudo|so que|só que|na verdade|embora|apesar de)\s+.*?\b(?:vr|va|vt|vale|benef[ií]cio|plano\s+de\s+sa[uú]de)\b|\b(?:paguei|passei|foi|quitei|usei)\b.*?\b(?:no|na|em|via|com|pelo|pela)\b.*?\b(?:vr|va|vt|vale|benef[ií]cio)\b/i;

  const convEffective = convEffectiveRegex.test(lower);
  const benefitEffective = benefitEffectiveRegex.test(lower);

  if (convEffective && !benefitEffective) {
    return { intent: 'create_expense', isAmbiguous: false };
  }
  if (benefitEffective && !convEffective) {
    return { intent: 'create_benefit', isAmbiguous: false };
  }

  // Caso realmente ambíguo (ambos presentes sem indicador seguro de meio efetivo, ex: "almoço 35 vr pix")
  return { intent: 'create_expense', isAmbiguous: true };
}

/**
 * Resolve a forma de pagamento V2 a partir dos múltiplos sinais do provider, notes ou mensagem.
 */
function resolveExpensePaymentMethodFromData({ rawData = {}, cleanMessage = '', existingSlots = {}, userDestinations = [] }) {
  // 1. Método explícito no retorno estruturado do n8n/provider
  const rawMethod = safeTrim(rawData.payment?.method || rawData.paymentMethod || rawData.method || rawData.paymentMethodHint);
  if (rawMethod) {
    const norm = normalizeSearchStr(rawMethod);
    if (norm.includes('pix')) return 'pix';
    if (norm.includes('dinheiro') || norm.includes('cash')) return 'dinheiro';
    if (norm.includes('debito') || norm.includes('débito')) return 'cartao_debito';
    if (norm.includes('credito') || norm.includes('crédito') || norm.includes('cartao') || norm.includes('cartão')) return 'cartao_credito';
    if (norm.includes('boleto')) return 'boleto';
    if (norm.includes('transferencia') || norm.includes('transferência') || norm.includes('ted') || norm.includes('doc')) return 'transferencia';
    if (norm.includes('automatico') || norm.includes('automático')) return 'debito_automatico';
    if (['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'debito_automatico', 'outros'].includes(norm)) return norm;
  }

  // 2. Destino canônico no n8n (ex: destination === 'Pix' ou 'Dinheiro')
  const destStr = safeTrim(rawData.destination);
  if (destStr) {
    const normDest = normalizeSearchStr(destStr);
    if (normDest === 'pix') return 'pix';
    if (normDest === 'dinheiro' || normDest === 'em dinheiro' || normDest === 'cash') return 'dinheiro';
  }

  // 3. Menção explícita em rawData.notes (ex: "pago no Pix", "paguei no Pix", "via Pix", "em dinheiro")
  const rawNotes = safeTrim(rawData.notes);
  if (rawNotes) {
    const normNotes = normalizeSearchStr(rawNotes);
    if (/\b(pix|no pix|via pix|pelo pix|pago no pix|paguei no pix)\b/i.test(normNotes)) return 'pix';
    if (/\b(dinheiro|em dinheiro|no dinheiro|pago em dinheiro|paguei em dinheiro|cash)\b/i.test(normNotes)) return 'dinheiro';
    if (/\b(cartao de debito|cartão de débito|no debito|no débito|debito|débito)\b/i.test(normNotes)) return 'cartao_debito';
    if (/\b(cartao de credito|cartão de crédito|no credito|no crédito|credito|crédito)\b/i.test(normNotes)) return 'cartao_credito';
    if (/\b(boleto|no boleto)\b/i.test(normNotes)) return 'boleto';
    if (/\b(transferencia|transferência|ted|doc)\b/i.test(normNotes)) return 'transferencia';
    if (/\b(debito automatico|débito automático)\b/i.test(normNotes)) return 'debito_automatico';
  }

  // 4. Mensagem textual do usuário (se houver texto)
  if (cleanMessage) {
    const normMsg = normalizeSearchStr(cleanMessage);
    if (/\b(pix|no pix|via pix|pelo pix)\b/i.test(normMsg)) return 'pix';
    if (/\b(dinheiro|em dinheiro|no dinheiro|cash)\b/i.test(normMsg)) return 'dinheiro';
    if (/\b(cartao de debito|cartão de débito|no debito|no débito)\b/i.test(normMsg)) return 'cartao_debito';
    if (/\b(cartao de credito|cartão de crédito|no credito|no crédito)\b/i.test(normMsg)) return 'cartao_credito';
    if (/\b(boleto|no boleto)\b/i.test(normMsg)) return 'boleto';
    if (/\b(transferencia|transferência|ted|doc)\b/i.test(normMsg)) return 'transferencia';
    if (/\b(debito automatico|débito automático)\b/i.test(normMsg)) return 'debito_automatico';
  }

  // 5. Slots multi-turno existentes em pendingAction
  if (existingSlots.paymentMethod || existingSlots.payment?.method) {
    return existingSlots.paymentMethod || existingSlots.payment?.method;
  }
  if (existingSlots.destination) {
    const normExist = normalizeSearchStr(existingSlots.destination);
    if (normExist === 'pix') return 'pix';
    if (normExist === 'dinheiro' || normExist === 'em dinheiro') return 'dinheiro';
  }

  return null;
}

/**
 * Envia uma mensagem estruturada para o webhook de Ações do n8n com suporte a Memória Transacional Multi-Turno.
 * Gerencia o ciclo de vida do pendingAction (collecting -> ready -> proposed -> confirmed/cancelled/expired),
 * faz merge incremental seguro de slots e gera a proposta com proposalId quando todos os dados estiverem prontos.
 */
async function interpretExpenseAction({ message, userId, userName, user = null, conversationId: reqConvId, context, type = 'text', inputMode = null, file = null, targetModule = null, intent = null }) {
  const webhookUrl = config.N8N_AI_ACTION_WEBHOOK_URL;
  const authUser = config.N8N_AI_ACTION_BASIC_AUTH_USER;
  const authPass = config.N8N_AI_ACTION_BASIC_AUTH_PASSWORD;

  if (!webhookUrl || !authUser || !authPass) {
    console.warn('[AI ACTION] action webhook is not configured in server environment');
    const error = new Error('O serviço de Ações do Assistente não está configurado no servidor.');
    error.status = 503;
    error.code = 'AI_ACTIONS_NOT_CONFIGURED';
    throw error;
  }

  const cleanMode = (inputMode || type || 'text').trim().toLowerCase();
  const isMultimodal = cleanMode === 'audio' || cleanMode === 'image';

  if (cleanMode !== 'text' && cleanMode !== 'audio' && cleanMode !== 'image') {
    const error = new Error(`A modalidade de entrada "${cleanMode}" ainda não é suportada neste ambiente. Utilize entrada em texto.`);
    error.status = 400;
    error.code = 'UNSUPPORTED_INPUT_MODE';
    throw error;
  }

  if (isMultimodal) {
    if (!file) {
      const error = new Error('Nenhum arquivo de mídia foi enviado para a interpretação multimodal.');
      error.status = 400;
      error.code = 'AI_MEDIA_REQUIRED';
      throw error;
    }
    const mediaVal = validateMediaFile(file, cleanMode);
    if (!mediaVal.valid) {
      const error = new Error(mediaVal.message);
      error.status = mediaVal.code === 'AI_MEDIA_TOO_LARGE' ? 413 : 400;
      error.code = mediaVal.code;
      throw error;
    }
  }

  const cleanMessage = safeTrim(message);
  if (!isMultimodal && !cleanMessage) {
    const error = new Error('Mensagem obrigatória para interpretação de despesa.');
    error.status = 400;
    throw error;
  }

  if (cleanMessage && cleanMessage.length > 2000) {
    const error = new Error('A mensagem excede o limite máximo permitido de 2000 caracteres.');
    error.status = 400;
    throw error;
  }

  let parsedContext = context;
  if (typeof parsedContext === 'string') {
    try {
      parsedContext = JSON.parse(parsedContext);
    } catch {
      parsedContext = null;
    }
  }
  if (!parsedContext || typeof parsedContext !== 'object' || Array.isArray(parsedContext)) {
    parsedContext = null;
  }

  const conversationId = safeTrim(reqConvId || parsedContext?.conversationId) || ('conv_' + userId);
  const lowerMessage = cleanMessage ? normalizeSearchStr(cleanMessage) : '';

  // Data atual real do sistema no formato ISO YYYY-MM-DD
  const now = new Date();
  const currentDateIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const targetMonth = Number(parsedContext?.month) || (now.getMonth() + 1);
  const targetYear = Number(parsedContext?.year) || now.getFullYear();
  const startTime = Date.now();

  // 1. Carrega pendingAction ativa para (userId, conversationId)
  let pendingAction = await storageService.getAiPendingAction(userId, conversationId);
  if (pendingAction && ['confirmed', 'cancelled', 'expired'].includes(pendingAction.status)) {
    pendingAction = null;
  }

  // 2. Detecção de Cancelamento Natural
  const isCancellation = /\b(deixa pra la|deixa pra lá|cancela|cancelar|nao precisa|não precisa|esquece isso|esquece|nao quero cadastrar|não quero cadastrar|deixa quieto)\b/i.test(lowerMessage);
  if (isCancellation) {
    if (pendingAction) {
      await storageService.updateAiPendingAction(userId, conversationId, { status: 'cancelled' });
      console.log(`[AI ACTION] pending cancelled id=${pendingAction._id} user=${userId}`);
    }
    return {
      success: true,
      action: 'chat',
      answer: 'Beleza, cancelei.',
      status: 'cancelled',
      duration: Date.now() - startTime
    };
  }

  // 3. Detecção de Confirmação Textual de Proposta Ativa (quando status === 'proposed')
  const isTextConfirmation = /\b(sim|pode cadastrar|confirma|confirmar|manda|pode salvar|salva|grava|pode confirmar)\b/i.test(lowerMessage);
  if (isTextConfirmation && pendingAction && pendingAction.status === 'proposed' && pendingAction.proposalId) {
    console.log(`[AI ACTION] text confirmation for proposal=${pendingAction.proposalId} user=${userId}`);
    if (pendingAction.intent === 'create_benefit') {
      const confirmRes = await confirmBenefitProposal({ userId, proposalId: pendingAction.proposalId });
      await storageService.updateAiPendingAction(userId, conversationId, { status: 'confirmed' });
      return {
        success: true,
        action: 'chat',
        answer: 'Benefício cadastrado com sucesso!',
        confirmed: true,
        proposalId: pendingAction.proposalId,
        benefit: confirmRes.benefit,
        duration: Date.now() - startTime
      };
    } else {
      const confirmRes = await confirmExpenseProposal({ userId, proposalId: pendingAction.proposalId });
      await storageService.updateAiPendingAction(userId, conversationId, { status: 'confirmed' });
      return {
        success: true,
        action: 'chat',
        answer: 'Despesa cadastrada com sucesso!',
        confirmed: true,
        proposalId: pendingAction.proposalId,
        expense: confirmRes.expense,
        duration: Date.now() - startTime
      };
    }
  }

  // 4. Detecção de Consulta Analítica / Read-Only (Não contamina slots da pendingAction)
  const isReadOnlyQuery = /\b(quanto gastei|qual o saldo|qual meu saldo|quanto tenho|quem esta me devendo|quem está me devendo|quanto recebi|minha maior categoria|quanto sobrou|extrato|relatorio|relatório|saldo no|gastei de|gastei em)\b/i.test(lowerMessage)
    && !/\b(comprei|gastei \d|paguei \d|usei \d)\b/i.test(lowerMessage);

  if (isReadOnlyQuery && pendingAction && pendingAction.status === 'collecting') {
    console.log(`[AI ACTION] read-only query detected during multi-turn flow: "${cleanMessage}" -> bypassing slot update`);
    let roReservation = null;
    let roProviderStarted = false;
    let roProviderFailed = false;
    if (user) {
      const quotaRes = await aiQuotaService.reserve({
        user,
        operationType: 'financial_query',
        inputMode: type || 'text',
        credits: 1
      });
      roReservation = quotaRes.reservation;
    }
    let queryAnswer = 'Você pode consultar seus saldos e extratos no painel.';
    try {
      if (config.N8N_AI_ACTION_WEBHOOK_URL) {
        const payload = {
          message: cleanMessage,
          userId,
          context: { month: targetMonth, year: targetYear, currentDate: currentDateIso }
        };
        if (roReservation) {
          await aiQuotaService.markProviderStarted(roReservation);
          roProviderStarted = true;
        }
        let qRes;
        try {
          qRes = await fetch(config.N8N_AI_ACTION_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } catch (fetchQErr) {
          roProviderFailed = true;
          throw fetchQErr;
        }
        if (qRes.ok) {
          const qJson = await qRes.json().catch(() => ({}));
          const actionObj = Array.isArray(qJson) ? qJson[0] : qJson;
          queryAnswer = actionObj.answer || actionObj.message || queryAnswer;
        } else {
          roProviderFailed = true;
          throw new Error(`n8n action webhook status ${qRes.status}`);
        }
      } else if (config.N8N_AI_WEBHOOK_URL) {
        if (roReservation) {
          await aiQuotaService.markProviderStarted(roReservation);
          roProviderStarted = true;
        }
        let chatRes;
        try {
          chatRes = await sendToN8nWebhook(
            { id: userId, nome: userName },
            cleanMessage,
            conversationId,
            { month: targetMonth, year: targetYear, currentDate: currentDateIso }
          );
        } catch (chatQErr) {
          roProviderFailed = true;
          throw chatQErr;
        }
        queryAnswer = chatRes.answer || chatRes.response || queryAnswer;
      }
      if (roReservation) {
        await aiQuotaService.finalize(roReservation);
        roReservation = null;
      }
    } catch (errQ) {
      console.warn('[AI ACTION] query webhook error:', errQ.message);
      if (roReservation) {
        await aiQuotaService.release(roReservation, { providerStarted: roProviderFailed, providerFailed: roProviderFailed }).catch(relErr => console.error('[AI ACTION] release error:', relErr));
      }
    }
    return {
      success: true,
      action: 'chat',
      answer: queryAnswer,
      slots: pendingAction.slots,
      missingFields: pendingAction.missingFields,
      duration: Date.now() - startTime
    };
  }

  if (isReadOnlyQuery) {
    console.log(`[AI ACTION] read-only query detected during multi-turn flow: "${cleanMessage}" -> bypassing slot update`);
    let roReservation = null;
    let roProviderStarted = false;
    let roProviderFailed = false;
    if (user) {
      const quotaRes = await aiQuotaService.reserve({
        user,
        operationType: 'financial_query',
        inputMode: type || 'text',
        credits: 1
      });
      roReservation = quotaRes.reservation;
    }
    try {
      if (roReservation) {
        await aiQuotaService.markProviderStarted(roReservation);
        roProviderStarted = true;
      }
      let queryRes;
      try {
        queryRes = await sendToN8nWebhook(
          { id: userId, nome: userName },
          cleanMessage,
          conversationId,
          { month: targetMonth, year: targetYear, currentDate: currentDateIso }
        );
      } catch (sendQErr) {
        roProviderFailed = true;
        throw sendQErr;
      }
      if (roReservation) {
        await aiQuotaService.finalize(roReservation);
        roReservation = null;
      }
      return {
        success: true,
        action: 'chat',
        answer: queryRes.answer || 'Aqui estão seus dados financeiros.',
        suggestions: Array.isArray(queryRes.suggestions) ? queryRes.suggestions : [],
        duration: Date.now() - startTime
      };
    } catch (errQ) {
      if (roReservation) {
        await aiQuotaService.release(roReservation, { providerStarted: roProviderFailed, providerFailed: roProviderFailed }).catch(relErr => console.error('[AI ACTION] release error:', relErr));
      }
      throw errQ;
    }
  }

  // 5. Detecção de Colisão com Nova Transação
  const isNewTransaction = /\b(tambem comprei|também comprei|outra compra|comprei tambem|comprei também|alem disso comprei|além disso comprei|comprei um outro|comprei uma outra)\b/i.test(lowerMessage);
  if (isNewTransaction && pendingAction && pendingAction.status === 'collecting' && pendingAction.slots?.description) {
    return {
      success: true,
      action: 'chat',
      answer: `Você ainda tem a compra da ${pendingAction.slots.description} em andamento. Quer concluir ela primeiro ou prefere cadastrar esse novo lançamento?`,
      duration: Date.now() - startTime
    };
  }

  // 6. Roteamento de Módulos Não Suportados (Devedores, Rendas Extras, Investimentos)
  if (/\b(devedor|devedores|me deve|está me devendo|esta me devendo|emprestei|cobrar fulano|fulano me deve)\b/i.test(lowerMessage)) {
    return {
      success: true,
      action: 'unsupported_action',
      targetModule: 'devedores',
      requiresConfirmation: false,
      requiresReview: false,
      answer: 'Posso te orientar, mas o cadastro de devedores ainda precisa ser feito no módulo Devedores.',
      duration: Date.now() - startTime
    };
  }

  if (/\b(renda extra|rendas extras|freela|freelance|recebi um extra|ganhei um extra|bico)\b/i.test(lowerMessage)) {
    return {
      success: true,
      action: 'unsupported_action',
      targetModule: 'extras',
      requiresConfirmation: false,
      requiresReview: false,
      answer: 'Esse lançamento deve ser feito em Rendas Extras.',
      duration: Date.now() - startTime
    };
  }

  if (/\b(investi|investimento|investimentos|aportei|cdb|tesouro direto|lci|lca|fii|ações|acoes|cripto|bitcoin)\b/i.test(lowerMessage)) {
    return {
      success: true,
      action: 'unsupported_action',
      targetModule: 'investimentos',
      requiresConfirmation: false,
      requiresReview: false,
      answer: 'Esse registro deve ser feito no módulo Investimentos.',
      duration: Date.now() - startTime
    };
  }

  // Limpa pendingAction anterior se a mensagem atual for uma iniciação genérica explícita (ex: "Quero cadastrar uma despesa")
  const isGenericInitiation = isGenericIntentPhrase(cleanMessage) || /^(quero cadastrar|gostaria de cadastrar|quero registrar|quero lançar|quero lancar|quero anotar|cadastrar|registrar|lançar|lancar|adicionar)\s+(?:uma\s+|um\s+)?(?:despesa|gasto|compra|beneficio|benefício)\b/i.test(cleanMessage);
  if (isGenericInitiation && pendingAction) {
    await storageService.clearAiPendingAction(userId, conversationId).catch(() => null);
    pendingAction = null;
  }

  // Carrega dados financeiros do usuário para contexto semântico V2 e validação
  const finances = await storageService.getUserFinances(userId, userName);
  const userCategories = (finances.categories || []).map(c => typeof c === 'string' ? c : (c?.name || '')).filter(Boolean);
  const rawUserDestinations = (finances.destinations || []).map(d => typeof d === 'string' ? d : (d?.name || '')).filter(Boolean);
  const userDestinations = rawUserDestinations;

  const NATIVE_METHODS = new Set(['pix', 'dinheiro', 'em dinheiro', 'cash', 'gerais', 'outros']);
  const validAccounts = rawUserDestinations.filter(d => !NATIVE_METHODS.has(normalizeSearchStr(d)));
  const canonicalPaymentMethods = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'debito_automatico', 'outros'];

  // 6.5. Resolução Determinística de Follow-up Curto de Pagamento / Benefício (0 créditos, 0 LLM)
  // Quando existir uma proposta/pendingAction esperando especificamente informação de pagamento/tipo de benefício,
  // uma resposta curta (ex.: "VR", "VA", "Pix", "dinheiro", "crédito") completa a proposta pendente sem nova chamada externa.
  const hasCompatiblePending = pendingAction &&
    (pendingAction.status === 'collecting' || pendingAction.status === 'proposed') &&
    pendingAction.slots?.description &&
    pendingAction.slots?.amount > 0;

  const followUp = !isMultimodal && hasCompatiblePending
    ? detectPaymentOrBenefitFollowUp(cleanMessage, validAccounts, userDestinations)
    : null;

  if (followUp) {
    console.log(`[AI ACTION] deterministic follow-up resolved: kind=${followUp.kind} user=${userId}`);
    const proposalId = pendingAction.proposalId || ('prop_' + crypto.randomBytes(16).toString('hex'));
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

    const compMonth = pendingAction.slots.competence?.month || targetMonth;
    const compYear = pendingAction.slots.competence?.year || targetYear;
    const compDay = pendingAction.slots.day || null;
    const notes = pendingAction.slots.notes || null;

    if (followUp.kind === 'benefit') {
      const benefitProposalDoc = {
        _id: proposalId,
        userId,
        conversationId: conversationId || null,
        action: 'create_benefit',
        status: 'pending',
        source: pendingAction.source || 'text',
        proposal: {
          description: pendingAction.slots.description,
          amount: pendingAction.slots.amount,
          benefitType: followUp.benefitType,
          category: null,
          destination: null,
          payment: null,
          day: compDay,
          competence: { month: compMonth, year: compYear },
          notes,
          requiresReview: false,
          requiresConfirmation: true,
          warnings: [],
          confidence: {}
        },
        createdAt: now,
        expiresAt,
        consumedAt: null
      };

      await storageService.saveAiProposal(benefitProposalDoc);
      await storageService.saveAiPendingAction({
        _id: pendingAction._id || `pa_${userId}_${conversationId}`,
        userId,
        conversationId,
        intent: 'create_benefit',
        status: 'proposed',
        proposalId,
        slots: {
          description: pendingAction.slots.description,
          amount: pendingAction.slots.amount,
          benefitType: followUp.benefitType,
          day: compDay,
          competence: { month: compMonth, year: compYear },
          notes
        },
        missingFields: [],
        createdAt: pendingAction.createdAt || now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + (config.AI_PENDING_ACTION_TTL_MS || 1800000))
      });

      return {
        success: true,
        proposalId,
        action: 'create_benefit',
        targetModule: 'beneficios',
        intent: 'create_benefit',
        requiresConfirmation: true,
        requiresReview: false,
        source: benefitProposalDoc.source,
        data: benefitProposalDoc.proposal,
        warnings: [],
        confidence: {},
        duration: Date.now() - startTime
      };
    } else if (followUp.kind === 'payment') {
      let matchedCategory = null;
      if (pendingAction.slots.category) {
        const catNorm = normalizeSearchStr(pendingAction.slots.category);
        matchedCategory = userCategories.find(c => normalizeSearchStr(c) === catNorm) || null;
      }
      if (!matchedCategory && pendingAction.slots.description) {
        matchedCategory = matchSemanticCategory(pendingAction.slots.description, userCategories);
      }

      const rawWarnings = [];
      if (!matchedCategory) {
        rawWarnings.push('Categoria não identificada.');
      }

      const resolvedMethod = followUp.method;
      const resolvedAccount = followUp.account
        || (pendingAction.slots.payment && pendingAction.slots.payment.account)
        || (pendingAction.slots.paymentAccount)
        || null;

      // Preservar destino/conta anterior válida se existir, mas NUNCA fabricar "Pix" como destination/account
      let legacyDestination = null;
      if (resolvedAccount) {
        legacyDestination = resolvedAccount;
      } else if (pendingAction.slots.destination && normalizeSearchStr(pendingAction.slots.destination) !== 'pix') {
        legacyDestination = pendingAction.slots.destination;
      } else if (followUp.destination && normalizeSearchStr(followUp.destination) !== 'pix') {
        legacyDestination = followUp.destination;
      } else if (resolvedMethod === 'dinheiro') {
        legacyDestination = 'Dinheiro';
      }

      const expenseProposalDoc = {
        _id: proposalId,
        userId,
        conversationId: conversationId || null,
        action: 'create_expense',
        status: 'pending',
        source: pendingAction.source || 'text',
        proposal: {
          description: pendingAction.slots.description,
          amount: pendingAction.slots.amount,
          category: matchedCategory,
          destination: legacyDestination,
          paymentMethod: resolvedMethod,
          paymentAccount: resolvedAccount,
          payee: pendingAction.slots.payee || null,
          payment: {
            method: resolvedMethod,
            account: resolvedAccount
          },
          temporal: {
            date: null,
            day: compDay,
            competence: `${compYear}-${String(compMonth).padStart(2, '0')}`,
            type: 'single'
          },
          competence: { month: compMonth, year: compYear },
          benefitType: null,
          installments: 1,
          notes,
          requiresReview: Boolean(rawWarnings.length > 0),
          requiresConfirmation: true,
          warnings: rawWarnings,
          confidence: {}
        },
        createdAt: now,
        expiresAt,
        consumedAt: null
      };

      await storageService.saveAiProposal(expenseProposalDoc);
      await storageService.saveAiPendingAction({
        _id: pendingAction._id || `pa_${userId}_${conversationId}`,
        userId,
        conversationId,
        intent: 'create_expense',
        status: 'proposed',
        proposalId,
        slots: {
          description: pendingAction.slots.description,
          amount: pendingAction.slots.amount,
          category: matchedCategory,
          destination: legacyDestination,
          paymentMethod: resolvedMethod,
          paymentAccount: resolvedAccount,
          payment: { method: resolvedMethod, account: resolvedAccount },
          day: compDay,
          competence: { month: compMonth, year: compYear },
          notes
        },
        missingFields: [],
        createdAt: pendingAction.createdAt || now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + (config.AI_PENDING_ACTION_TTL_MS || 1800000))
      });

      return {
        success: true,
        proposalId,
        action: 'create_expense',
        targetModule: 'despesas',
        intent: 'create_expense',
        requiresConfirmation: true,
        requiresReview: Boolean(rawWarnings.length > 0),
        source: expenseProposalDoc.source,
        data: expenseProposalDoc.proposal,
        warnings: rawWarnings,
        confidence: {},
        duration: Date.now() - startTime
      };
    }
  }

  // 7. Chamada ao Webhook do n8n com contexto V2 explícito e pendingAction
  const webhookPayload = {
    type: type || 'text',
    message: cleanMessage,
    authenticatedUserId: userId,
    conversationId,
    currentDate: currentDateIso,
    validCategories: userCategories,
    paymentMethods: canonicalPaymentMethods,
    validAccounts,
    userDestinations: rawUserDestinations, // Campo LEGADO para compatibilidade n8n
    month: targetMonth,
    year: targetYear,
    context: {
      month: targetMonth,
      year: targetYear,
      currentDate: currentDateIso,
      validCategories: userCategories,
      paymentMethods: canonicalPaymentMethods,
      validAccounts,
      userDestinations: rawUserDestinations
    },
    pendingAction: pendingAction ? {
      id: pendingAction._id,
      intent: pendingAction.intent,
      status: pendingAction.status,
      slots: pendingAction.slots,
      missingFields: pendingAction.missingFields
    } : null
  };

  const timeoutMs = config.AI_ACTION_REQUEST_TIMEOUT_MS || 30000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const credentials = Buffer.from(`${authUser}:${authPass}`).toString('base64');
  console.log(`[AI ACTION] interpret request user=${userId} conv=${conversationId} mode=${cleanMode}`);

  const rawTarget = String(targetModule || intent || parsedContext?.targetModule || parsedContext?.intent || '').toLowerCase();
  const explicitIsBenefit = rawTarget.includes('benefic') || rawTarget === 'create_benefit';
  const explicitIsExpense = rawTarget.includes('despes') || rawTarget === 'create_expense';

  let isBenefit = explicitIsBenefit;
  if (!isBenefit && !explicitIsExpense && !isMultimodal) {
    if (pendingAction?.intent === 'create_benefit') {
      isBenefit = true;
    } else {
      const intentAnalysis = analyzeExpenseVsBenefitIntent(cleanMessage);
      isBenefit = intentAnalysis.intent === 'create_benefit';
    }
  }
  const operationType = isBenefit ? 'benefit_interpretation' : 'expense_interpretation';
  const requiredCredits = getCreditCost(operationType, cleanMode) ?? (cleanMode === 'image' ? 3 : (cleanMode === 'audio' ? 2 : 1));

  let reservation = null;
  let providerStarted = false;
  let providerFailed = false;
  if (user) {
    const quotaRes = await aiQuotaService.reserve({
      user,
      operationType,
      inputMode: cleanMode,
      credits: requiredCredits
    });
    reservation = quotaRes.reservation;
  }

  // Preparação de Headers e Body (JSON ou Multipart FormData nativo)
  let requestBody;
  const requestHeaders = {
    'User-Agent': 'CorvFin-Server/3.8.0',
    'Authorization': `Basic ${credentials}`
  };

  if (isMultimodal && file && file.buffer) {
    const baseMime = getBaseMimeType(file.mimetype);
    const filename = getNormalizedFilename(baseMime, cleanMode);
    const fileBlob = new Blob([file.buffer], { type: baseMime });

    const formData = new FormData();
    formData.append('data', fileBlob, filename);
    formData.append('type', cleanMode);
    formData.append('authenticatedUserId', String(userId));
    formData.append('conversationId', conversationId);
    formData.append('currentDate', currentDateIso);
    formData.append('context', JSON.stringify({
      month: targetMonth,
      year: targetYear
    }));
    formData.append('month', String(targetMonth));
    formData.append('year', String(targetYear));
    if (cleanMessage) {
      formData.append('message', cleanMessage);
    }
    requestBody = formData;
  } else {
    requestHeaders['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(webhookPayload);
  }

  try {
    if (reservation) {
      await aiQuotaService.markProviderStarted(reservation);
      providerStarted = true;
    }

    let response;
    try {
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: requestBody,
        signal: controller.signal
      });
    } catch (fetchErr) {
      providerFailed = true;
      throw fetchErr;
    }

    clearTimeout(timer);
    const duration = Date.now() - startTime;
    console.log(`[AI ACTION] n8n status=${response.status} duration=${duration}ms`);

    if (!response.ok) {
      providerFailed = true;
      const errorText = await response.text().catch(() => '');
      console.error(`[AI ACTION] n8n action upstream returned HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      const err = new Error(`n8n action webhook respondeu com HTTP ${response.status}`);
      err.status = response.status === 404 ? 404 : 502;
      err.code = response.status === 404 ? 'FINANCIAL_CONTEXT_NOT_FOUND' : 'N8N_UPSTREAM_ERROR';
      err.upstreamStatus = response.status;
      err.duration = duration;
      throw err;
    }

    const json = await response.json().catch(() => null);
    if (!json || (typeof json !== 'object' && !Array.isArray(json))) {
      providerFailed = true;
      const parseErr = new Error('Resposta inválida do assistente de IA.');
      parseErr.status = 502;
      parseErr.code = 'N8N_INVALID_RESPONSE';
      throw parseErr;
    }

    const actionResult = Array.isArray(json) ? (json[0] || {}) : (json || {});

    // Validação Semântica do Contrato do Provedor
    if (actionResult.success === false && (!actionResult.data || actionResult.code === 'AI_INVALID_RESPONSE')) {
      providerFailed = true;
      const failErr = new Error(actionResult.message || 'Falha ao interpretar.');
      failErr.status = 502;
      failErr.code = actionResult.code || 'N8N_INVALID_RESPONSE';
      throw failErr;
    }

    const hasContract = Boolean(
      actionResult.action ||
      (actionResult.data && typeof actionResult.data === 'object') ||
      actionResult.answer ||
      actionResult.message
    );
    if (!hasContract) {
      providerFailed = true;
      const contractErr = new Error('Resposta do provedor não atende ao contrato esperado.');
      contractErr.status = 502;
      contractErr.code = 'N8N_INVALID_CONTRACT';
      throw contractErr;
    }

    if (actionResult.action === 'unsupported_action') {
      if (reservation) {
        await aiQuotaService.finalize(reservation);
        reservation = null;
      }
      return {
        success: true,
        action: 'unsupported_action',
        targetModule: actionResult.targetModule || 'outros',
        requiresConfirmation: false,
        requiresReview: false,
        answer: actionResult.answer || actionResult.message || 'Esse cadastro deve ser feito no módulo correspondente.',
        duration: Date.now() - startTime
      };
    }

    // 8. Resolução de Intenção Ativa e Correções de Tipo (Lote 5G-M.2.4)
    const rawData = actionResult.data || {};
    const isCollecting = pendingAction && pendingAction.status === 'collecting';
    const isProposed = pendingAction && pendingAction.status === 'proposed';

    const isExpenseCorrection = !isMultimodal && Boolean(cleanMessage) && /\b(pix|cartao|cartão|nubank|dinheiro|debito|débito|credito|crédito)\b/i.test(lowerMessage) && (lowerMessage.includes('nao') || lowerMessage.includes('não') || lowerMessage.includes('foi no') || lowerMessage.includes('no ') || lowerMessage.includes('via '));

    const existingSlots = (isCollecting || (isProposed && isExpenseCorrection)) ? (pendingAction?.slots || {}) : {};

    let activeIntent = 'create_expense';
    let isAmbiguousClassification = false;

    if (explicitIsBenefit) {
      activeIntent = 'create_benefit';
    } else if (explicitIsExpense) {
      activeIntent = 'create_expense';
    } else if (actionResult.action === 'create_benefit') {
      // 6-A: Ação explícita válida do provedor é soberana
      activeIntent = 'create_benefit';
    } else if (actionResult.action === 'create_expense') {
      // 6-A: Ação do provedor com salvaguarda: se não houver pagamento convencional e
      // houver menção inequívoca a benefício corporativo em notes ou message, normaliza para create_benefit
      const msgOrNotes = [rawData.notes, cleanMessage].filter(Boolean).join(' ');
      const explicitBenefitType = extractBenefitTypeFromMessage(msgOrNotes);
      const hasConvPayment = Boolean(
        rawData.payment?.method ||
        rawData.destination ||
        resolveExpensePaymentMethodFromData({ rawData, cleanMessage, existingSlots, userDestinations })
      );
      if (explicitBenefitType && !hasConvPayment) {
        activeIntent = 'create_benefit';
      } else {
        activeIntent = 'create_expense';
      }
    } else if (isMultimodal) {
      // ÁUDIO / IMAGEM sem ação explícita:
      // Fallback backend só ocorre se houver evidência estruturada suficiente (ex: benefitType canônico)
      const VALID_BENEFIT_TYPES = ['saude', 'vr', 'va', 'transporte', 'educacao', 'cultura', 'farmacia'];
      const returnedType = safeTrim(rawData.benefitType || rawData.benefitTypeHint || rawData.type || '').toLowerCase();
      if (VALID_BENEFIT_TYPES.includes(returnedType)) {
        activeIntent = 'create_benefit';
      } else {
        activeIntent = 'create_expense';
      }
    } else {
      // TEXTO sem ação explícita do provedor:
      if (isExpenseCorrection) {
        activeIntent = 'create_expense';
      } else if (isCollecting || isProposed) {
        activeIntent = pendingAction?.intent || 'create_expense';
      } else {
        const textAnalysis = analyzeExpenseVsBenefitIntent(cleanMessage);
        activeIntent = textAnalysis.intent;
        isAmbiguousClassification = textAnalysis.isAmbiguous;
      }
    }

    // 9. Extração e Merge Incremental de Slots
    // Extração de Descrição
    let mergedDesc = null;
    const isGenericMsg = isGenericIntentPhrase(cleanMessage);
    const rawN8nDesc = safeTrim(rawData.description || rawData.merchant);
    const n8nDesc = (typeof rawN8nDesc === 'string' && rawN8nDesc.length <= 150) ? rawN8nDesc : (rawN8nDesc ? rawN8nDesc.slice(0, 150) : '');
    const isN8nDescGeneric = !n8nDesc || isGenericIntentPhrase(n8nDesc) || ['despesa', 'gasto', 'compra', 'beneficio', 'benefício', 'lancamento', 'lançamento'].includes(normalizeSearchStr(n8nDesc));
    const msgDesc = extractDescriptionFromMessage(cleanMessage);
    const isMsgDescGeneric = !msgDesc || isGenericIntentPhrase(msgDesc) || ['despesa', 'gasto', 'compra', 'beneficio', 'benefício'].includes(normalizeSearchStr(msgDesc));

    if (!isN8nDescGeneric && (!isGenericMsg || isMultimodal)) {
      mergedDesc = n8nDesc.toLocaleUpperCase('pt-BR');
    } else if (!isMsgDescGeneric && !isGenericMsg && !/^\d+/.test(msgDesc)) {
      mergedDesc = msgDesc.toLocaleUpperCase('pt-BR');
    } else if (existingSlots.description && !isGenericIntentPhrase(existingSlots.description)) {
      mergedDesc = existingSlots.description;
    }

    if (!mergedDesc) {
      if (cleanMessage && /\b(comprei|compra)\b/i.test(cleanMessage)) {
        mergedDesc = 'COMPRA';
      } else if (cleanMessage && /\b(gastei|despesa)\b/i.test(cleanMessage)) {
        mergedDesc = 'DESPESA';
      }
    }

    // Extração de Valor (Amount)
    let mergedAmount = null;
    const msgAmount = extractAmountFromMessage(cleanMessage);
    const n8nAmount = Number(rawData.amount);
    if (Number.isFinite(n8nAmount) && n8nAmount > 0 && n8nAmount <= 100000000) {
      mergedAmount = n8nAmount;
    } else if (msgAmount && Number.isFinite(msgAmount) && msgAmount > 0) {
      mergedAmount = msgAmount;
    } else if (existingSlots.amount && Number.isFinite(existingSlots.amount) && existingSlots.amount > 0) {
      mergedAmount = existingSlots.amount;
    }

    // Se n8n respondeu chat/insufficient_data e não há slots coletados nem pendingAction, retorna chat diretamente
    if ((actionResult.action === 'chat' || actionResult.action === 'insufficient_data' || (actionResult.answer && !actionResult.data)) && !pendingAction && !mergedDesc && !mergedAmount) {
      if (reservation) {
        await aiQuotaService.finalize(reservation);
        reservation = null;
      }
      return {
        success: true,
        action: actionResult.action || 'chat',
        requiresConfirmation: false,
        requiresReview: false,
        answer: actionResult.answer || actionResult.message || 'Como posso ajudar você com seus lançamentos?',
        suggestions: Array.isArray(actionResult.suggestions) ? actionResult.suggestions : [],
        duration: Date.now() - startTime
      };
    }

    // Resolução de Dimensões de Pagamento e Favorecido V2
    const mergedMethod = resolveExpensePaymentMethodFromData({
      rawData,
      cleanMessage,
      existingSlots,
      userDestinations
    });

    const rawPayee = safeTrim(rawData.payee || rawData.merchant || rawData.establishment || rawData.recipient || existingSlots.payee || null);
    let mergedPayee = rawPayee || null;
    if (!mergedPayee && cleanMessage) {
      const payeeMatch = cleanMessage.match(/\b(?:na|no|em|para|pelo|pela)\s+([A-Za-zÀ-ÿ0-9\s&'-]+?)(?:\s+(?:no valor|por|de|com|via|em|pelo|dia|parcelad)|$)/i);
      if (payeeMatch) {
        const candidate = safeTrim(payeeMatch[1]);
        const candNorm = normalizeSearchStr(candidate);
        if (candidate && candidate.length >= 2 && candidate.length <= 50
            && !NATIVE_METHODS.has(candNorm)
            && !userCategories.some(c => normalizeSearchStr(c) === candNorm)
            && !validAccounts.some(a => normalizeSearchStr(a) === candNorm)) {
          mergedPayee = candidate;
        }
      }
    }

    const rawAcc = safeTrim(rawData.payment?.account || rawData.paymentAccount || rawData.account || existingSlots.paymentAccount || existingSlots.payment?.account || null);
    let mergedAccount = null;
    if (rawAcc) {
      const match = validAccounts.find(a => normalizeSearchStr(a) === normalizeSearchStr(rawAcc));
      mergedAccount = match ? (typeof match === 'string' ? match : match.name) : null;
    }

    // Extração de Destino (para Despesa)
    let mergedDestination = null;
    const msgDest = extractDestinationFromMessage(cleanMessage, userDestinations);
    const n8nDest = safeTrim(rawData.destination);
    if (n8nDest) {
      const match = userDestinations.find(d => normalizeSearchStr(typeof d === 'string' ? d : d?.name) === normalizeSearchStr(n8nDest));
      mergedDestination = match ? (typeof match === 'string' ? match : match.name) : null;
    } else if (msgDest) {
      mergedDestination = msgDest;
    } else if (existingSlots.destination && activeIntent === 'create_expense') {
      mergedDestination = existingSlots.destination;
    } else if (mergedAccount) {
      mergedDestination = mergedAccount;
    } else if (mergedMethod === 'pix') {
      const foundPix = userDestinations.find(d => normalizeSearchStr(typeof d === 'string' ? d : d?.name).includes('pix'));
      mergedDestination = foundPix ? (typeof foundPix === 'string' ? foundPix : foundPix.name) : 'Pix';
    } else if (mergedMethod === 'dinheiro') {
      const foundCash = userDestinations.find(d => normalizeSearchStr(typeof d === 'string' ? d : d?.name).includes('dinheiro'));
      mergedDestination = foundCash ? (typeof foundCash === 'string' ? foundCash : foundCash.name) : 'Dinheiro';
    } else if (mergedMethod === 'cartao_credito' || mergedMethod === 'cartao_debito') {
      mergedDestination = 'Cartão';
    } else if (mergedMethod === 'boleto') {
      mergedDestination = 'Boleto';
    } else if (mergedMethod === 'transferencia') {
      mergedDestination = 'Transferência';
    } else if (mergedMethod === 'debito_automatico') {
      mergedDestination = 'Débito Automático';
    }

    // Extração de Tipo de Benefício (para Benefício — Fail-Closed)
    let mergedBenefitType = null;
    const msgBenType = extractBenefitTypeFromMessage([cleanMessage, rawData.notes].filter(Boolean).join(' '));
    const n8nBenType = safeTrim(rawData.benefitType || rawData.benefitTypeHint || rawData.type);
    if (n8nBenType) {
      mergedBenefitType = normalizeBenefitType(n8nBenType);
    } else if (msgBenType) {
      mergedBenefitType = normalizeBenefitType(msgBenType);
    } else if (existingSlots.benefitType && activeIntent === 'create_benefit') {
      mergedBenefitType = normalizeBenefitType(existingSlots.benefitType);
    }

    // Resolução de Competência Temporal (3 Prioridades)
    const [currY, currM] = currentDateIso.split('-').map(Number);
    const currentSystemMonth = !isNaN(currM) && currM >= 1 && currM <= 12 ? currM : (now.getMonth() + 1);
    const currentSystemYear = !isNaN(currY) && currY >= 2000 ? currY : now.getFullYear();

    let compMonth = null;
    let compYear = null;

    const MONTH_DICT = [
      { name: 'janeiro', m: 1 }, { name: 'fevereiro', m: 2 }, { name: 'marco', m: 3 }, { name: 'março', m: 3 },
      { name: 'abril', m: 4 }, { name: 'maio', m: 5 }, { name: 'junho', m: 6 },
      { name: 'julho', m: 7 }, { name: 'agosto', m: 8 }, { name: 'setembro', m: 9 },
      { name: 'outubro', m: 10 }, { name: 'novembro', m: 11 }, { name: 'dezembro', m: 12 }
    ];

    const explicitMonthMatch = MONTH_DICT.find(item => {
      const reg = new RegExp(`\\b(em|de|no mês de|mes de)\\s+${item.name}\\b|\\b${item.name}\\b`, 'i');
      return reg.test(lowerMessage);
    });

    if (explicitMonthMatch) {
      compMonth = explicitMonthMatch.m;
      compYear = currentSystemYear;
    } else if (/\b(mes passado|mês passado)\b/i.test(lowerMessage)) {
      compMonth = currentSystemMonth === 1 ? 12 : (currentSystemMonth - 1);
      compYear = currentSystemMonth === 1 ? (currentSystemYear - 1) : currentSystemYear;
    } else if (/\b(mes que vem|mês que vem|proximo mes|próximo mês)\b/i.test(lowerMessage)) {
      compMonth = currentSystemMonth === 12 ? 1 : (currentSystemMonth + 1);
      compYear = currentSystemMonth === 12 ? (currentSystemYear + 1) : currentSystemYear;
    } else if (/\b(hoje|ontem|esse mes|esse mês|neste mes|neste mês|agora)\b/i.test(lowerMessage) || /\b(comprei|gastei|paguei|assinei|usei)\b/i.test(lowerMessage)) {
      compMonth = currentSystemMonth;
      compYear = currentSystemYear;
    } else if (existingSlots.competence?.month) {
      compMonth = existingSlots.competence.month;
      compYear = existingSlots.competence.year || currentSystemYear;
    } else if (rawData.competence?.month) {
      compMonth = Number(rawData.competence.month);
      compYear = Number(rawData.competence.year) || currentSystemYear;
    } else {
      compMonth = targetMonth;
      compYear = targetYear;
    }

    // Avaliação de Slots Faltantes
    const missingFields = [];
    if (!mergedDesc) missingFields.push('description');
    if (!mergedAmount || mergedAmount <= 0) missingFields.push('amount');

    if (activeIntent === 'create_expense') {
      // Destino / Forma de pagamento só é ausente se NENHUM método, conta ou destino foi identificado
      if (!mergedDestination && !mergedMethod && !mergedAccount) {
        missingFields.push('destination');
      }
    } else if (activeIntent === 'create_benefit') {
      if (!mergedBenefitType) missingFields.push('benefitType');
    }

    const mergedSlots = {
      description: mergedDesc,
      amount: mergedAmount,
      category: safeTrim(rawData.category) || existingSlots.category || null,
      destination: activeIntent === 'create_expense' ? mergedDestination : null,
      paymentMethod: activeIntent === 'create_expense' ? (mergedMethod || null) : null,
      paymentAccount: activeIntent === 'create_expense' ? (mergedAccount || null) : null,
      payee: activeIntent === 'create_expense' ? (mergedPayee || null) : null,
      payment: activeIntent === 'create_expense' && (mergedMethod || mergedAccount) ? {
        method: mergedMethod || 'outros',
        account: mergedAccount || null
      } : (existingSlots.payment || null),
      benefitType: activeIntent === 'create_benefit' ? mergedBenefitType : null,
      competence: { month: compMonth, year: compYear },
      day: Math.max(1, Math.min(31, Number(rawData.day) || (rawData.date ? parseInt(String(rawData.date).split('-')[2], 10) : 0) || existingSlots.day || now.getDate())),
      installments: Math.max(1, parseInt(rawData.installments, 10) || existingSlots.installments || 1),
      notes: safeTrim(rawData.notes) || existingSlots.notes || null
    };

    // 10. FLUXO A: AÇÃO AINDA INCOMPLETA (continue_collection)
    if (missingFields.length > 0) {
      const pendingDoc = {
        _id: pendingAction?._id || `pa_${userId}_${conversationId}`,
        userId,
        conversationId,
        intent: activeIntent,
        status: 'collecting',
        slots: mergedSlots,
        missingFields,
        source: actionResult.source || cleanMode || 'text',
        createdAt: pendingAction?.createdAt || now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + (config.AI_PENDING_ACTION_TTL_MS || 1800000))
      };

      await storageService.saveAiPendingAction(pendingDoc);
      console.log(`[AI ACTION] pending updated id=${pendingDoc._id} intent=${activeIntent} missing=[${missingFields.join(',')}]`);

      // Formulação de Pergunta Natural para o próximo slot que falta (Ordem: description -> amount -> destination)
      let questionAnswer = '';
      if (missingFields.includes('description')) {
        questionAnswer = activeIntent === 'create_benefit'
          ? 'Claro! O que você comprou com o benefício?'
          : 'Claro. O que você comprou?';
      } else if (missingFields.includes('amount')) {
        questionAnswer = 'Quanto foi?';
      } else if (missingFields.includes('destination')) {
        questionAnswer = 'E pagou como?';
      } else if (missingFields.includes('benefitType')) {
        questionAnswer = 'Foi no VR, VA ou outro benefício?';
      } else {
        questionAnswer = 'Me informe os dados que faltam para cadastrar.';
      }

      const finalAnswer = (missingFields.includes('description') || !actionResult.answer)
        ? questionAnswer
        : actionResult.answer;

      if (reservation) {
        await aiQuotaService.finalize(reservation);
        reservation = null;
      }

      return {
        success: true,
        action: 'continue_collection',
        intent: activeIntent,
        slots: mergedSlots,
        missingFields,
        answer: finalAnswer,
        duration: Date.now() - startTime
      };
    }

    // 11. FLUXO B: AÇÃO COMPLETA -> GERA PROPOSTA ESTRUTURADA (status: 'proposed')
    let rawWarnings = Array.isArray(actionResult.warnings)
      ? actionResult.warnings.filter(w => typeof w === 'string' && w.trim().length > 0).map(w => w.trim())
      : [];

    // Limpa warnings de campos que já estão preenchidos e válidos no estado final
    if (mergedAmount && mergedAmount > 0) {
      rawWarnings = rawWarnings.filter(w => !/valor.*(informado|revisado|precisa|zerado)|sem valor/i.test(w));
    }
    if (mergedDesc) {
      rawWarnings = rawWarnings.filter(w => !/descri[cç][aã]o.*(informada|revisada|precisa)|sem descri[cç][aã]o/i.test(w));
    }
    if (mergedDestination) {
      rawWarnings = rawWarnings.filter(w => !/(destino|pagamento).*(informad|revisad|precisa)/i.test(w));
    }
    if (mergedBenefitType) {
      rawWarnings = rawWarnings.filter(w => !/(benef[ií]cio|tipo).*(informad|revisad|precisa)/i.test(w));
    }

    if (isAmbiguousClassification) {
      rawWarnings.push('Ambiguidade detectada entre forma de pagamento convencional e benefício corporativo. Verifique o tipo do lançamento.');
    }

    const providerRequiresReview = actionResult.requiresReview === true;

    // Geração de proposalId único
    const proposalId = 'prop_' + crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutos

    if (activeIntent === 'create_benefit') {
      const n8nBenType = safeTrim(rawData.benefitType || rawData.benefitTypeHint || rawData.type);
      if (n8nBenType && !mergedBenefitType) {
        rawWarnings.push(`O tipo de benefício "${n8nBenType}" não é válido no CorvFin. Escolha entre: transporte, va, vr, saude, farmacia, educacao ou cultura.`);
      }
      if (!mergedBenefitType) {
        rawWarnings.push('O tipo de benefício precisa ser selecionado.');
      }

      const localBenefitRequiresReview =
        !mergedDesc ||
        !mergedAmount ||
        mergedAmount <= 0 ||
        !mergedBenefitType ||
        !compMonth ||
        !compYear;

      const requiresReview = localBenefitRequiresReview || isAmbiguousClassification || providerRequiresReview || rawWarnings.length > 0;

      const proposalDoc = {
        _id: proposalId,
        userId,
        conversationId: conversationId || null,
        action: 'create_benefit',
        status: 'pending',
        source: actionResult.source || cleanMode || 'text',
        proposal: {
          description: mergedDesc,
          amount: mergedAmount,
          benefitType: mergedBenefitType,
          day: mergedSlots.day,
          competence: { month: compMonth, year: compYear },
          notes: mergedSlots.notes,
          requiresReview,
          requiresConfirmation: true,
          warnings: rawWarnings,
          confidence: actionResult.confidence || {}
        },
        createdAt: now,
        expiresAt,
        consumedAt: null
      };

      await storageService.saveAiProposal(proposalDoc);
      await storageService.saveAiPendingAction({
        _id: pendingAction?._id || `pa_${userId}_${conversationId}`,
        userId,
        conversationId,
        intent: 'create_benefit',
        status: 'proposed',
        proposalId,
        slots: mergedSlots,
        missingFields: [],
        createdAt: pendingAction?.createdAt || now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + (config.AI_PENDING_ACTION_TTL_MS || 1800000))
      });

      console.log(`[AI ACTION] benefit proposal created id=${proposalId} from multi-turn`);

      if (reservation) {
        await aiQuotaService.finalize(reservation);
        reservation = null;
      }

      return {
        success: true,
        proposalId,
        action: 'create_benefit',
        requiresConfirmation: true,
        requiresReview,
        source: proposalDoc.source,
        data: proposalDoc.proposal,
        warnings: rawWarnings,
        confidence: actionResult.confidence || {},
        duration: Date.now() - startTime
      };
    }

    // Resolução de Categoria Canônica para Despesas (Match estrito contra categorias reais do usuário)
    let matchedCategory = null;
    const catInput = safeTrim(mergedSlots.category);
    const descLower = normalizeSearchStr(mergedDesc);

    if (catInput) {
      const targetCat = catInput.toLowerCase();
      const normTarget = normalizeSearchStr(catInput);
      matchedCategory = userCategories.find(c => safeTrim(c).toLowerCase() === targetCat)
        || userCategories.find(c => normalizeSearchStr(c) === normTarget)
        || null;
    }

    if (!matchedCategory && mergedDesc) {
      matchedCategory = matchSemanticCategory(mergedDesc, userCategories)
        || (catInput ? matchSemanticCategory(catInput, userCategories) : null);
    }

    if (!matchedCategory) {
      if (catInput) {
        rawWarnings.push(`Categoria "${catInput}" não foi encontrada nas suas categorias.`);
      } else {
        rawWarnings.push('Categoria não identificada.');
      }
    } else {
      rawWarnings = rawWarnings.filter(w => !/categoria.*(n[aã]o identificada|n[aã]o encontrada|revisada)/i.test(w));
    }

    const hasPaymentInfo = Boolean(mergedDestination || mergedMethod || mergedAccount);
    if (!hasPaymentInfo) {
      if (!rawWarnings.some(w => /pagamento|destino|conta/i.test(w))) {
        rawWarnings.push('A forma de pagamento ou conta/destino precisa ser informada.');
      }
    }

    // requiresReview deve refletir o estado real das pendências com soberania da validação local
    const localExpenseRequiresReview =
      !matchedCategory ||
      !mergedDesc ||
      !mergedAmount ||
      mergedAmount <= 0 ||
      !hasPaymentInfo ||
      !compMonth ||
      !compYear;

    requiresReview = localExpenseRequiresReview || isAmbiguousClassification || providerRequiresReview || rawWarnings.length > 0;

    // Resolução de Dimensões V2
    // 1. Favorecido
    let resolvedPayee = mergedPayee || safeTrim(rawData.payee || rawData.establishment || rawData.recipient || rawData.merchant || existingSlots.payee || null) || null;
    if (!resolvedPayee && cleanMessage) {
      const payeeMatch = cleanMessage.match(/\b(?:na|no|em|para|pelo|pela)\s+([A-Za-zÀ-ÿ0-9\s&'-]+?)(?:\s+(?:no valor|por|de|com|via|em|pelo|dia|parcelad)|$)/i);
      if (payeeMatch) {
        const candidate = safeTrim(payeeMatch[1]);
        const candNorm = normalizeSearchStr(candidate);
        if (candidate && candidate.length >= 2 && candidate.length <= 50
            && !NATIVE_METHODS.has(candNorm)
            && !userCategories.some(c => normalizeSearchStr(c) === candNorm)
            && !validAccounts.some(a => normalizeSearchStr(a) === candNorm)) {
          resolvedPayee = candidate;
        }
      }
    }

    // 2. Método de Pagamento V2
    let rawMethod = safeTrim(rawData.payment?.method || rawData.paymentMethod || rawData.method);
    let resolvedMethod = mergedMethod || null;
    if (!resolvedMethod && rawMethod) {
      const normRawMethod = normalizeSearchStr(rawMethod);
      if (normRawMethod.includes('pix')) resolvedMethod = 'pix';
      else if (normRawMethod.includes('dinheiro') || normRawMethod.includes('cash')) resolvedMethod = 'dinheiro';
      else if (normRawMethod.includes('debito') || normRawMethod.includes('débito')) resolvedMethod = 'cartao_debito';
      else if (normRawMethod.includes('credito') || normRawMethod.includes('crédito')) resolvedMethod = 'cartao_credito';
      else if (normRawMethod.includes('cartao') || normRawMethod.includes('cartão')) resolvedMethod = 'cartao_credito';
      else if (normRawMethod.includes('boleto')) resolvedMethod = 'boleto';
      else if (normRawMethod.includes('transferencia') || normRawMethod.includes('transferência') || normRawMethod.includes('ted') || normRawMethod.includes('doc')) resolvedMethod = 'transferencia';
      else if (normRawMethod.includes('automatico') || normRawMethod.includes('automático')) resolvedMethod = 'debito_automatico';
      else if (canonicalPaymentMethods.includes(normRawMethod)) resolvedMethod = normRawMethod;
    }

    if (!resolvedMethod) {
      if (/\bpix\b/i.test(lowerMessage)) resolvedMethod = 'pix';
      else if (/\b(dinheiro|em dinheiro|cash)\b/i.test(lowerMessage)) resolvedMethod = 'dinheiro';
      else if (/\b(debito|débito)\b/i.test(lowerMessage)) resolvedMethod = 'cartao_debito';
      else if (/\b(boleto)\b/i.test(lowerMessage)) resolvedMethod = 'boleto';
      else if (/\b(transferencia|transferência|ted|doc)\b/i.test(lowerMessage)) resolvedMethod = 'transferencia';
      else if (/\b(debito automatico|débito automático)\b/i.test(lowerMessage)) resolvedMethod = 'debito_automatico';
      else if (mergedDestination && normalizeSearchStr(mergedDestination) === 'pix') resolvedMethod = 'pix';
      else if (mergedDestination && (normalizeSearchStr(mergedDestination) === 'dinheiro' || normalizeSearchStr(mergedDestination) === 'em dinheiro')) resolvedMethod = 'dinheiro';
      else if (mergedSlots.installments > 1) resolvedMethod = 'cartao_credito';
      else if (mergedDestination && validAccounts.some(a => normalizeSearchStr(a) === normalizeSearchStr(mergedDestination))) resolvedMethod = 'cartao_credito';
      else resolvedMethod = 'outros';
    }

    // 3. Conta / Cartão V2 (Canonicalização estrita contra allowedDestinations / validAccounts)
    let resolvedAccount = mergedAccount || null;
    if (!resolvedAccount) {
      const matchAcc = validAccounts.find(acc => {
        const accNorm = normalizeSearchStr(acc);
        return (mergedDestination && normalizeSearchStr(mergedDestination) === accNorm)
          || normalizeSearchStr(cleanMessage).includes(accNorm);
      });
      if (matchAcc) resolvedAccount = matchAcc;
    }
    if (resolvedAccount) {
      const isCanonical = validAccounts.some(a => normalizeSearchStr(a) === normalizeSearchStr(resolvedAccount));
      if (!isCanonical || NATIVE_METHODS.has(normalizeSearchStr(resolvedAccount))) {
        resolvedAccount = null;
      }
    }

    // 4. Temporalidade V2
    const isRecurring = Boolean(rawData.isRecurring || rawData.temporal?.type === 'fixed' || /\b(todo mes|todo mês|mensal|mensalmente|assinatura|recorrente)\b/i.test(lowerMessage));
    const parsedInstallments = Math.max(1, parseInt(rawData.installments || mergedSlots.installments || 1, 10));
    let resolvedTemporal = { type: 'cash' };
    if (isRecurring) {
      resolvedTemporal = {
        type: 'fixed',
        recurrence: { frequency: 'monthly', type: 'never' }
      };
    } else if (parsedInstallments > 1) {
      resolvedTemporal = {
        type: 'installment'
      };
    }

    // 5. Bridge Legada Destination
    let legacyDestination = mergedDestination;
    if (!legacyDestination) {
      if (resolvedAccount) {
        legacyDestination = resolvedAccount;
      } else if (resolvedMethod === 'pix') {
        legacyDestination = 'Pix';
      } else if (resolvedMethod === 'dinheiro') {
        legacyDestination = 'Dinheiro';
      } else {
        legacyDestination = 'Outros';
      }
    } else {
      const match = userDestinations.find(d => normalizeSearchStr(typeof d === 'string' ? d : d?.name) === normalizeSearchStr(legacyDestination));
      if (match) {
        legacyDestination = typeof match === 'string' ? match : match.name;
      }
    }

    const proposalDoc = {
      _id: proposalId,
      userId,
      conversationId: conversationId || null,
      action: 'create_expense',
      status: 'pending',
      source: actionResult.source || cleanMode || 'text',
      proposal: {
        description: mergedDesc,
        amount: mergedAmount,
        category: matchedCategory,
        destination: legacyDestination,
        payee: resolvedPayee,
        payment: {
          method: resolvedMethod,
          account: resolvedAccount
        },
        temporal: resolvedTemporal,
        competence: { month: compMonth, year: compYear },
        benefitType: null,
        installments: mergedSlots.installments,
        notes: mergedSlots.notes,
        requiresReview,
        requiresConfirmation: true,
        warnings: rawWarnings,
        confidence: actionResult.confidence || {}
      },
      createdAt: now,
      expiresAt,
      consumedAt: null
    };

    await storageService.saveAiProposal(proposalDoc);
    await storageService.saveAiPendingAction({
      _id: pendingAction?._id || `pa_${userId}_${conversationId}`,
      userId,
      conversationId,
      intent: 'create_expense',
      status: 'proposed',
      proposalId,
      slots: mergedSlots,
      missingFields: [],
      createdAt: pendingAction?.createdAt || now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + (config.AI_PENDING_ACTION_TTL_MS || 1800000))
    });

    console.log(`[AI ACTION] expense proposal created id=${proposalId} from multi-turn`);

    if (reservation) {
      await aiQuotaService.finalize(reservation);
      reservation = null;
    }

    return {
      success: true,
      proposalId,
      action: 'create_expense',
      requiresConfirmation: true,
      requiresReview,
      source: proposalDoc.source,
      data: proposalDoc.proposal,
      warnings: rawWarnings,
      confidence: actionResult.confidence || {},
      duration: Date.now() - startTime
    };
  } catch (err) {
    clearTimeout(timer);
    if (reservation) {
      await aiQuotaService.release(reservation, { providerStarted: providerFailed, providerFailed }).catch(relErr => console.error('[AI ACTION] release error:', relErr));
    }
    if (err.name === 'AbortError' || err.code === 20) {
      console.error(`[AI ACTION] n8n action timeout after ${timeoutMs}ms`);
      const timeoutErr = new Error('Tempo limite de resposta do assistente excedido (timeout).');
      timeoutErr.status = 504;
      timeoutErr.code = 'AI_TIMEOUT';
      throw timeoutErr;
    }
    console.error(`[AI ACTION] error: status=${err.status || 502} message="${err.message}"`);
    throw err;
  }
}

/**
 * Constrói o registro de despesa no formato V2 garantindo paridade entre IA, wizard e cadastro rápido,
 * com compatibilidade legada V1 (destination bridge).
 */
function buildAiExpenseRecord({
  base = {},
  userEdits = {},
  matchedCat = null,
  matchedDestObj = null,
  compMonth = null,
  compYear = null,
  name,
  description,
  amount,
  group,
  category,
  destination,
  payee,
  payment,
  paymentMethod,
  account,
  isRecurring,
  installments,
  notes,
  note,
  status
} = {}) {
  const effectiveBase = { ...base };
  if (name !== undefined) effectiveBase.description = name;
  if (description !== undefined) effectiveBase.description = description;
  if (amount !== undefined) effectiveBase.amount = amount;
  if (group !== undefined) effectiveBase.category = group;
  if (category !== undefined) effectiveBase.category = category;
  if (destination !== undefined) effectiveBase.destination = destination;
  if (payee !== undefined) effectiveBase.payee = payee;
  if (payment !== undefined) {
    effectiveBase.paymentMethod = payment?.method;
    effectiveBase.account = payment?.account;
  }
  if (paymentMethod !== undefined) effectiveBase.paymentMethod = paymentMethod;
  if (account !== undefined) effectiveBase.account = account;
  if (isRecurring !== undefined) effectiveBase.isRecurring = Boolean(isRecurring);
  if (installments !== undefined) effectiveBase.installments = installments;
  if (notes !== undefined) effectiveBase.notes = notes;
  if (note !== undefined) effectiveBase.notes = note;
  if (status !== undefined) effectiveBase.status = status;

  const rawDesc = userEdits.description !== undefined ? userEdits.description : (effectiveBase.description || effectiveBase.name || '');
  const resolvedDesc = safeTrim(rawDesc).toLocaleUpperCase('pt-BR');
  const resolvedAmount = Number(userEdits.amount !== undefined ? userEdits.amount : effectiveBase.amount) || 0;

  const resolvedCat = safeTrim(matchedCat || userEdits.category || effectiveBase.category || effectiveBase.group);
  if (!resolvedCat) {
    const err = new Error('Categoria é obrigatória para a criação da despesa.');
    err.code = 'CATEGORY_REQUIRED';
    err.status = 400;
    throw err;
  }

  const matchedDestName = typeof matchedDestObj === 'string' ? matchedDestObj : (matchedDestObj?.name || userEdits.destination || effectiveBase.destination || '');
  const normDest = normalizeSearchStr(matchedDestName);

  const explicitMethod = userEdits.paymentMethod || effectiveBase.paymentMethod;
  const explicitAccount = userEdits.account || effectiveBase.account;
  const explicitPayee = userEdits.payee || effectiveBase.payee || null;

  let resolvedMethod = 'outros';
  if (explicitMethod) {
    resolvedMethod = safeTrim(explicitMethod).toLowerCase();
  } else if (normDest === 'pix') {
    resolvedMethod = 'pix';
  } else if (normDest === 'dinheiro' || normDest === 'em dinheiro' || normDest === 'cash') {
    resolvedMethod = 'dinheiro';
  } else if (normDest) {
    resolvedMethod = 'cartao_credito';
  } else {
    resolvedMethod = 'pix';
  }

  let resolvedAccount = null;
  if (explicitAccount) {
    resolvedAccount = safeTrim(explicitAccount);
  } else if (resolvedMethod !== 'pix' && resolvedMethod !== 'dinheiro') {
    resolvedAccount = matchedDestName || null;
  }

  // Legacy bridge destination
  let legacyDestination = matchedDestName;
  if (!legacyDestination) {
    if (resolvedAccount) {
      legacyDestination = resolvedAccount;
    } else if (resolvedMethod === 'pix') {
      legacyDestination = 'Pix';
    } else if (resolvedMethod === 'dinheiro') {
      legacyDestination = 'Dinheiro';
    } else {
      legacyDestination = 'Outros';
    }
  }

  const isPixOrCash = (resolvedMethod === 'pix' || resolvedMethod === 'dinheiro');
  const dueDay = isPixOrCash ? null : (matchedDestObj?.dueDay || null);

  const now = new Date();
  const cMonth = compMonth || (effectiveBase.competence?.month) || (now.getMonth() + 1);
  const cYear = compYear || (effectiveBase.competence?.year) || now.getFullYear();
  const periodKey = `${cYear}-${String(cMonth).padStart(2, '0')}`;

  const isRecurringExpense = Boolean(effectiveBase.isRecurring || userEdits.isRecurring);
  const rawInstallments = userEdits.installments !== undefined ? userEdits.installments : (effectiveBase.installments || 1);
  const parsedInstallments = Math.max(1, parseInt(rawInstallments, 10) || 1);
  const isInstallment = !isRecurringExpense && (parsedInstallments > 1);

  // Status handling: respeita status explícito se fornecido; fallback inteligente de quitação para Pix/Dinheiro
  let statusResolved = 'pendente';
  if (userEdits.status) {
    statusResolved = (userEdits.status === 'pago') ? 'pago' : 'pendente';
  } else if (effectiveBase.status) {
    statusResolved = (effectiveBase.status === 'pago') ? 'pago' : 'pendente';
  } else if (isPixOrCash) {
    statusResolved = 'pago';
  }

  const paidHistory = {};
  if (statusResolved === 'pago') {
    paidHistory[periodKey] = {
      paidAmount: resolvedAmount,
      updatedAt: new Date().toISOString()
    };
  }

  const newExpenseId = 'exp_' + crypto.randomBytes(8).toString('hex') + Date.now().toString(36);
  const rawNotes = userEdits.notes !== undefined ? userEdits.notes : (effectiveBase.notes || '');
  const noteStr = safeTrim(rawNotes);

  if (isRecurringExpense) {
    return {
      id: newExpenseId,
      name: resolvedDesc,
      group: resolvedCat,
      destination: legacyDestination,
      payee: explicitPayee ? String(explicitPayee).trim().slice(0, 150) : null,
      payment: {
        method: resolvedMethod,
        account: resolvedAccount ? String(resolvedAccount).trim().slice(0, 150) : null
      },
      temporal: {
        type: 'fixed',
        recurrence: { frequency: 'monthly', type: 'never' }
      },
      dueDay,
      note: noteStr,
      paymentType: 'fixed',
      versions: [
        {
          year: cYear,
          month: cMonth,
          startYear: cYear,
          startMonth: cMonth,
          amount: resolvedAmount
        }
      ],
      paidHistory
    };
  }

  return {
    id: newExpenseId,
    name: resolvedDesc,
    amount: resolvedAmount,
    group: resolvedCat,
    destination: legacyDestination,
    payee: explicitPayee ? String(explicitPayee).trim().slice(0, 150) : null,
    payment: {
      method: resolvedMethod,
      account: resolvedAccount ? String(resolvedAccount).trim().slice(0, 150) : null
    },
    temporal: {
      type: isInstallment ? 'installment' : 'cash'
    },
    dueDay,
    note: noteStr,
    startMonth: cMonth,
    startYear: cYear,
    endMonth: isInstallment ? (((cMonth - 1 + parsedInstallments - 1) % 12) + 1) : cMonth,
    endYear: isInstallment ? (cYear + Math.floor((cMonth - 1 + parsedInstallments - 1) / 12)) : cYear,
    installments: parsedInstallments,
    paymentType: isInstallment ? 'installment' : 'cash',
    status: statusResolved,
    paidHistory
  };
}

/**
 * Valida os dados da proposta (incluindo edições permitidas do usuário),
 * cria a despesa através do motor oficial do OmniFin com regras de Pix/Dinheiro/dueDay,
 * persiste no storage com optimistic locking (CAS/revision) e marca o proposalId como consumido.
 */
async function confirmExpenseProposalAsync({ userId, proposalId, data: userEdits = {} }) {
  if (!proposalId || typeof proposalId !== 'string') {
    const err = new Error('ID de proposta obrigatório.');
    err.status = 400;
    throw err;
  }

  const cleanProposalId = safeTrim(proposalId);
  const proposal = await storageService.getAiProposal(cleanProposalId);
  if (!proposal) {
    const err = new Error('Proposta não encontrada ou expirada. Solicite uma nova despesa.');
    err.status = 404;
    err.code = 'PROPOSAL_NOT_FOUND_OR_EXPIRED';
    throw err;
  }

  if (proposal.userId !== userId) {
    const err = new Error('Você não tem permissão para confirmar esta proposta.');
    err.status = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  if (proposal.action !== 'create_expense') {
    const err = new Error('Esta proposta não é de despesa.');
    err.status = 400;
    err.code = 'INVALID_PROPOSAL_TYPE';
    throw err;
  }

  // Idempotência: Se já foi confirmada anteriormente, retorna sucesso sem duplicar
  if (proposal.status === 'confirmed' || proposal.status === 'consumed') {
    return {
      success: true,
      message: 'Proposta já processada.',
      alreadyProcessed: true
    };
  }

  if (proposal.status === 'cancelled') {
    const err = new Error('Esta proposta foi cancelada.');
    err.status = 400;
    err.code = 'PROPOSAL_ALREADY_CANCELLED';
    throw err;
  }

  // Verificação de RBAC (Permissão modular de despesas)
  const perms = await storageService.getUserPermissions(userId);
  if (perms && perms.despesas === false) {
    const err = new Error('Você não possui permissão para cadastrar despesas.');
    err.status = 403;
    err.code = 'MODULE_FORBIDDEN';
    throw err;
  }

  // Verificação de Manutenção
  const maint = await storageService.getMaintenanceConfig();
  if (maint && maint.despesas && maint.despesas.maintenance) {
    const err = new Error('O módulo de Despesas está temporariamente em manutenção.');
    err.status = 503;
    err.code = 'MODULE_MAINTENANCE';
    throw err;
  }

  console.log(`[AI ACTION] confirm request proposal=${cleanProposalId} user=${userId}`);

  // Extração estrita e higienização SOMENTE dos campos editáveis permitidos (Anti-Tampering & 100% Null-Safe)
  const base = proposal.proposal || {};
  const rawDesc = userEdits.description !== undefined ? userEdits.description : (base.description || '');
  const description = safeTrim(rawDesc).toLocaleUpperCase('pt-BR');
  const amount = Number(userEdits.amount !== undefined ? userEdits.amount : base.amount);
  const rawCategory = userEdits.category !== undefined ? userEdits.category : (base.category || '');
  const category = safeTrim(rawCategory);
  const rawDest = userEdits.destination !== undefined ? userEdits.destination : (base.destination || '');
  const destination = safeTrim(rawDest);
  const editComp = userEdits.competence || base.competence || {};
  const compMonth = Number(editComp.month) || (new Date().getMonth() + 1);
  const compYear = Number(editComp.year) || new Date().getFullYear();
  const installments = Math.max(1, parseInt(userEdits.installments !== undefined ? userEdits.installments : (base.installments || 1), 10) || 1);
  const rawNotes = userEdits.notes !== undefined ? userEdits.notes : (base.notes || '');
  const notes = safeTrim(rawNotes);

  if (!description) {
    const err = new Error('Informe uma descrição válida para a despesa.');
    err.status = 400;
    throw err;
  }
  if (description.length > 150) {
    const err = new Error('A descrição da despesa excede o limite de 150 caracteres.');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
    const err = new Error('O valor da despesa deve ser um número positivo maior que zero.');
    err.status = 400;
    throw err;
  }
  if (notes && notes.length > 2000) {
    const err = new Error('As observações da despesa excedem o limite de 2000 caracteres.');
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(installments) || installments < 1 || installments > 240) {
    const err = new Error('O número de parcelas deve ser um inteiro entre 1 e 240.');
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(compMonth) || compMonth < 1 || compMonth > 12 || !Number.isInteger(compYear) || compYear < 2000 || compYear > 2100) {
    const err = new Error('Competência (mês/ano) inválida.');
    err.status = 400;
    throw err;
  }

  // Busca o documento finances atual do usuário
  const finances = await storageService.getUserFinances(userId);
  finances.variable = finances.variable || [];
  finances.fixed = finances.fixed || [];

  const normalizeSearchStr = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  // Validação de Categoria no cadastro do próprio usuário (Null-safe)
  const userCategories = (finances.categories || []).map(c => typeof c === 'string' ? c : (c?.name || '')).filter(Boolean);
  const normCategory = normalizeSearchStr(category);
  const matchedCat = userCategories.find(c => safeTrim(c).toLowerCase() === category.toLowerCase())
    || userCategories.find(c => normalizeSearchStr(c) === normCategory);

  if (!matchedCat) {
    const err = new Error(`A categoria "${category || 'Não informada'}" não existe no seu cadastro.`);
    err.status = 400;
    err.code = 'INVALID_CATEGORY';
    throw err;
  }

  // Validação de Destino no cadastro do próprio usuário (Null-safe com suporte a V2)
  const userDestinations = (finances.destinations || []).filter(Boolean);
  let resolvedDestName = destination;
  if (!resolvedDestName) {
    if (userEdits.account || base.payment?.account) {
      resolvedDestName = userEdits.account || base.payment?.account;
    } else if (userEdits.paymentMethod === 'pix' || base.payment?.method === 'pix') {
      resolvedDestName = 'Pix';
    } else if (userEdits.paymentMethod === 'dinheiro' || base.payment?.method === 'dinheiro') {
      resolvedDestName = 'Dinheiro';
    } else {
      resolvedDestName = 'Outros';
    }
  }
  const normDest = normalizeSearchStr(resolvedDestName);
  let matchedDestObj = userDestinations.find(d => {
    const dName = typeof d === 'string' ? d : (d?.name || '');
    const cleanDName = safeTrim(dName).toLowerCase();
    return cleanDName === resolvedDestName.toLowerCase()
      || normalizeSearchStr(dName) === normDest
      || ((normDest === 'em dinheiro' || normDest === 'dinheiro' || normDest === 'cash') && normalizeSearchStr(dName) === 'dinheiro')
      || (normDest === 'pix' && normalizeSearchStr(dName) === 'pix');
  });

  if (!matchedDestObj) {
    if (normDest === 'pix' || normDest === 'dinheiro') {
      matchedDestObj = { name: normDest === 'pix' ? 'Pix' : 'Dinheiro' };
    } else if (normDest === 'outros') {
      matchedDestObj = { name: 'Outros' };
    } else {
      const err = new Error(`O destino "${resolvedDestName || 'Não informado'}" não existe no seu cadastro.`);
      err.status = 400;
      err.code = 'INVALID_DESTINATION';
      throw err;
    }
  }

  const newExpense = buildAiExpenseRecord({
    base,
    userEdits,
    matchedCat,
    matchedDestObj,
    compMonth,
    compYear
  });

  if (newExpense.paymentType === 'fixed' || newExpense.temporal?.type === 'fixed') {
    finances.fixed.push(newExpense);
  } else {
    finances.variable.push(newExpense);
  }

  const saved = await storageService.saveUserFinances(userId, finances);

  // Marca a proposta como consumida/confirmada
  await storageService.updateAiProposalStatus(proposalId, 'confirmed', {
    consumedAt: new Date(),
    createdExpenseId: newExpense.id
  });

  if (proposal.conversationId) {
    try {
      await storageService.updateAiPendingAction(userId, proposal.conversationId, {
        status: 'confirmed',
        updatedAt: new Date()
      });
    } catch (_) {}
  }

  console.log(`[AI ACTION] expense confirmed proposal=${proposalId}`);
  console.log(`[AI ACTION] expense persisted revision=${saved.revision}`);

  return {
    success: true,
    message: 'Despesa cadastrada.',
    expense: newExpense,
    revision: saved.revision,
    data: saved
  };
}

function confirmExpenseProposal(arg1, arg2, arg3) {
  if (arg1 && typeof arg1 === 'object' && ('userId' in arg1 || 'proposalId' in arg1)) {
    return confirmExpenseProposalAsync(arg1);
  }
  const finances = arg1 || { fixed: [], variable: [] };
  finances.fixed = finances.fixed || [];
  finances.variable = finances.variable || [];
  const proposal = arg2 || {};
  const userEdits = arg3 || {};

  const record = buildAiExpenseRecord({ ...proposal, userEdits });
  if (record.paymentType === 'fixed' || record.temporal?.type === 'fixed') {
    finances.fixed.push(record);
  } else {
    finances.variable.push(record);
  }
  return finances;
}

/**
 * Valida e confirma uma proposta de gasto com BENEFÍCIO,
 * utilizando o motor oficial de benefícios do OmniFin e persistindo em benefitTransactions.
 */
async function confirmBenefitProposal({ userId, proposalId, data: userEdits = {} }) {
  if (!proposalId || typeof proposalId !== 'string') {
    const err = new Error('ID de proposta obrigatório.');
    err.status = 400;
    throw err;
  }

  const cleanProposalId = safeTrim(proposalId);
  const proposal = await storageService.getAiProposal(cleanProposalId);
  if (!proposal) {
    const err = new Error('Proposta não encontrada ou expirada. Solicite uma nova ação.');
    err.status = 404;
    err.code = 'PROPOSAL_NOT_FOUND_OR_EXPIRED';
    throw err;
  }

  if (proposal.userId !== userId) {
    const err = new Error('Você não tem permissão para confirmar esta proposta.');
    err.status = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  if (proposal.action !== 'create_benefit') {
    const err = new Error('Esta proposta não é de benefício.');
    err.status = 400;
    err.code = 'INVALID_PROPOSAL_TYPE';
    throw err;
  }

  // Idempotência
  if (proposal.status === 'confirmed' || proposal.status === 'consumed') {
    return {
      success: true,
      message: 'Proposta de benefício já processada.',
      alreadyProcessed: true
    };
  }

  if (proposal.status === 'cancelled') {
    const err = new Error('Esta proposta foi cancelada.');
    err.status = 400;
    err.code = 'PROPOSAL_ALREADY_CANCELLED';
    throw err;
  }

  // RBAC
  const perms = await storageService.getUserPermissions(userId);
  if (perms && (perms.benefits === false || perms.beneficios === false)) {
    const err = new Error('Você não possui permissão para acessar o módulo de Benefícios.');
    err.status = 403;
    err.code = 'MODULE_FORBIDDEN';
    throw err;
  }

  // Manutenção
  const maint = await storageService.getMaintenanceConfig();
  if (maint && (maint.benefits?.maintenance || maint.beneficios?.maintenance)) {
    const err = new Error('O módulo de Benefícios está temporariamente em manutenção.');
    err.status = 503;
    err.code = 'MODULE_MAINTENANCE';
    throw err;
  }

  console.log(`[AI ACTION] confirm benefit request proposal=${cleanProposalId} user=${userId}`);

  const base = proposal.proposal || {};
  const rawDesc = userEdits.description !== undefined ? userEdits.description : (base.description || '');
  const description = safeTrim(rawDesc).toLocaleUpperCase('pt-BR');
  const amount = Number(userEdits.amount !== undefined ? userEdits.amount : base.amount);
  const rawType = userEdits.benefitType !== undefined ? userEdits.benefitType : (userEdits.type !== undefined ? userEdits.type : (base.benefitType || 'va'));
  const benefitType = safeTrim(rawType).toLowerCase();
  const editComp = userEdits.competence || base.competence || {};
  const compMonth = Number(editComp.month) || (new Date().getMonth() + 1);
  const compYear = Number(editComp.year) || new Date().getFullYear();
  const rawDay = userEdits.day !== undefined ? userEdits.day : (base.day || new Date().getDate());
  const day = Math.max(1, Math.min(31, parseInt(rawDay, 10) || 1));
  const rawNotes = userEdits.notes !== undefined ? userEdits.notes : (base.notes || '');
  const notes = safeTrim(rawNotes);

  if (!description) {
    const err = new Error('Informe uma descrição válida para o benefício.');
    err.status = 400;
    throw err;
  }
  if (description.length > 150) {
    const err = new Error('A descrição do benefício excede o limite de 150 caracteres.');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
    const err = new Error('O valor do benefício deve ser um número positivo maior que zero.');
    err.status = 400;
    throw err;
  }
  if (notes && notes.length > 2000) {
    const err = new Error('As observações do benefício excedem o limite de 2000 caracteres.');
    err.status = 400;
    throw err;
  }
  const VALID_BENEFIT_TYPES = ['saude', 'vr', 'va', 'transporte', 'educacao', 'cultura', 'farmacia'];
  if (!VALID_BENEFIT_TYPES.includes(benefitType)) {
    const err = new Error(`Tipo de benefício "${benefitType || 'Não informado'}" é inválido.`);
    err.status = 400;
    err.code = 'INVALID_BENEFIT_TYPE';
    throw err;
  }
  if (!Number.isInteger(compMonth) || compMonth < 1 || compMonth > 12 || !Number.isInteger(compYear) || compYear < 2000 || compYear > 2100) {
    const err = new Error('Competência (mês/ano) inválida.');
    err.status = 400;
    throw err;
  }

  // Carrega e atualiza finances
  const finances = await storageService.getUserFinances(userId);
  finances.benefitTransactions = finances.benefitTransactions || [];

  const newBenefitId = 'ben_' + crypto.randomBytes(8).toString('hex') + Date.now().toString(36);
  const newBenefit = {
    id: newBenefitId,
    description,
    type: benefitType,
    amount,
    day,
    month: compMonth,
    year: compYear,
    note: notes || ''
  };

  finances.benefitTransactions.push(newBenefit);

  const expectedRev = Number(finances.revision || 0);
  const saved = await storageService.saveUserFinances(userId, finances, expectedRev);

  // Marca proposta como confirmada
  await storageService.updateAiProposalStatus(cleanProposalId, 'confirmed', {
    consumedAt: new Date(),
    createdBenefitId: newBenefitId
  });

  if (proposal.conversationId) {
    try {
      await storageService.updateAiPendingAction(userId, proposal.conversationId, {
        status: 'confirmed',
        updatedAt: new Date()
      });
    } catch (_) {}
  }

  console.log(`[AI ACTION] benefit confirmed proposal=${cleanProposalId} id=${newBenefitId}`);

  return {
    success: true,
    message: 'Gasto com benefício cadastrado com sucesso!',
    benefit: newBenefit,
    proposalId: cleanProposalId,
    revision: saved?.revision
  };
}

/**
 * Cancela uma proposta gerada sem persistir nenhuma alteração financeira.
 */
async function cancelExpenseProposal({ userId, proposalId }) {
  if (!proposalId) {
    const err = new Error('ID de proposta obrigatório.');
    err.status = 400;
    throw err;
  }

  const cleanProposalId = safeTrim(proposalId);
  const proposal = await storageService.getAiProposal(cleanProposalId);
  if (!proposal) {
    return { success: true, message: 'Cadastro cancelado.' };
  }

  if (proposal.userId !== userId) {
    const err = new Error('Você não tem permissão para cancelar esta proposta.');
    err.status = 403;
    throw err;
  }

  await storageService.updateAiProposalStatus(cleanProposalId, 'cancelled', {
    cancelledAt: new Date()
  });

  console.log(`[AI ACTION] proposal cancelled id=${cleanProposalId} user=${userId}`);
  return { success: true, message: 'Cadastro cancelado.' };
}

module.exports = {
  SYSTEM_GUIDE_CONTEXT,
  buildFinancialContext,
  sendToN8nWebhook,
  interpretExpenseAction,
  confirmExpenseProposal,
  buildAiExpenseRecord,
  confirmBenefitProposal,
  cancelExpenseProposal
};
