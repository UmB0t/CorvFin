/**
 * ==============================================================================
 * OmniFin V3 - AI Assistant & n8n Integration Service (aiService.js)
 * ==============================================================================
 */

const config = require('../config/config');
const storageService = require('./storageService');

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
  str = str.replace(/^(?:usei|passei|gastei)\s+(?:meu|minha|o|a|com|no|na|em)?\s*(?:vr|va|vale(?:\s+refeicao|\s+refeição|\s+alimentacao|\s+alimentação)?)\s+(?:no|na|em|com|para)?\s*/i, '');
  // Remove triggers de ação no início
  str = str.replace(/^(comprei|gastei com|gastei no|gastei na|gastei em|gastei|paguei|assinei|fiz uma compra de|fiz uma compra|usei meu \w+ no|usei meu \w+ na|usei meu \w+ em|usei \w+ no|usei \w+ na|usei \w+ em|usei|passei no|passei na|passei|foi no|foi na|foi em|no|na)\s+/i, '');
  // Remove valor numérico que esteja no início após o verbo (ex: "Usei 50 reais no almoço" -> "almoço")
  str = str.replace(/^(?:de|por|com)?\s*(?:r\$\s*|rs\s*|\$)?\s*\d+(?:[.,]\d+)?\s*(?:reais|real|conto|pila|mil|k)?\s+(?:no|na|em|com|para|de|num|numa)?\s*/i, '');
  // Remove sufixos de preço / forma de pagamento / datas no final
  str = str.replace(/\s+(?:por|de|com)\s+(?:r\$\s*|\$)?\d+.*$/i, '');
  str = str.replace(/\s+(?:no|na|pelo|pela|via|com o|com a|com meu|com minha|com)\s+(?:pix|dinheiro|cartao|cartão|nubank|vr|va|vale|beneficio|benefício).*$/i, '');
  str = str.replace(/\s+(?:hoje|ontem|em abril|em maio|em junho|em julho|em agosto|em setembro|em outubro|em novembro|em dezembro|mes passado|mês passado).*$/i, '');
  str = str.replace(/[!?,.]+$/g, '').trim();
  // Remove artigos iniciais
  str = str.replace(/^(um|uma|uns|umas|o|a|os|as)\s+/i, '');
  // Remove expressões informais soltas
  str = str.replace(/\b(mesmo|tambem|também|pae|cara|amigo)\b/gi, '').trim();

  const lowerDesc = normalizeSearchStr(str);
  if (['pix', 'dinheiro', 'cartao', 'cartão', 'debito', 'débito', 'credito', 'crédito', 'nubank', 'vr', 'va', 'vale', 'despesa', 'gasto', 'compra', 'beneficio', 'verdade', 'meu vr', 'meu va', 'no vr', 'no va', 'com vr', 'com va'].includes(lowerDesc)) {
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
  if (/\b(vr|vale refeicao|vale refeição|refeicao|refeição|almoco|almoço|jantar|lanche|restaurante)\b/i.test(lower)) {
    return 'vr';
  }
  if (/\b(va|vale alimentacao|vale alimentação|alimentacao|alimentação|mercado|supermercado|compras)\b/i.test(lower)) {
    return 'va';
  }
  if (/\b(saude|saúde|medico|médico|consulta|exame|dentista|hospital|clinica)\b/i.test(lower)) {
    return 'saude';
  }
  if (/\b(farmacia|farmácia|drogaria|remedio|remédio)\b/i.test(lower)) {
    return 'farmacia';
  }
  if (/\b(transporte|vt|vale transporte|passagem|onibus|ônibus|metro|metrô)\b/i.test(lower)) {
    return 'transporte';
  }
  if (/\b(educacao|educação|curso|escola|faculdade|livro)\b/i.test(lower)) {
    return 'educacao';
  }
  if (/\b(cultura|cinema|teatro|show)\b/i.test(lower)) {
    return 'cultura';
  }
  return null;
}

/**
 * Envia uma mensagem estruturada para o webhook de Ações do n8n com suporte a Memória Transacional Multi-Turno.
 * Gerencia o ciclo de vida do pendingAction (collecting -> ready -> proposed -> confirmed/cancelled/expired),
 * faz merge incremental seguro de slots e gera a proposta com proposalId quando todos os dados estiverem prontos.
 */
async function interpretExpenseAction({ message, userId, userName, conversationId: reqConvId, context, type = 'text' }) {
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

  const cleanMessage = safeTrim(message);
  if (!cleanMessage) {
    const error = new Error('Mensagem obrigatória para interpretação de despesa.');
    error.status = 400;
    throw error;
  }

  const conversationId = safeTrim(reqConvId || context?.conversationId) || ('conv_' + userId);
  const lowerMessage = normalizeSearchStr(cleanMessage);

  // Data atual real do sistema no formato ISO YYYY-MM-DD
  const now = new Date();
  const currentDateIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const targetMonth = Number(context?.month) || (now.getMonth() + 1);
  const targetYear = Number(context?.year) || now.getFullYear();
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
    let queryAnswer = 'Você pode consultar seus saldos e extratos no painel.';
    try {
      if (config.N8N_AI_ACTION_WEBHOOK_URL) {
        const payload = {
          message: cleanMessage,
          userId,
          context: { month: targetMonth, year: targetYear, currentDate: currentDateIso }
        };
        const qRes = await fetch(config.N8N_AI_ACTION_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (qRes.ok) {
          const qJson = await qRes.json().catch(() => ({}));
          const actionObj = Array.isArray(qJson) ? qJson[0] : qJson;
          queryAnswer = actionObj.answer || actionObj.message || queryAnswer;
        }
      } else if (config.N8N_AI_WEBHOOK_URL) {
        const chatRes = await sendToN8nWebhook(
          { id: userId, nome: userName },
          cleanMessage,
          conversationId,
          { month: targetMonth, year: targetYear, currentDate: currentDateIso }
        );
        queryAnswer = chatRes.answer || chatRes.response || queryAnswer;
      }
    } catch (errQ) {
      console.warn('[AI ACTION] query webhook error:', errQ.message);
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
    const queryRes = await sendToN8nWebhook(
      { id: userId, nome: userName },
      cleanMessage,
      conversationId,
      { month: targetMonth, year: targetYear, currentDate: currentDateIso }
    );
    return {
      success: true,
      action: 'chat',
      answer: queryRes.answer || 'Aqui estão seus dados financeiros.',
      suggestions: Array.isArray(queryRes.suggestions) ? queryRes.suggestions : [],
      duration: Date.now() - startTime
    };
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

  // 7. Chamada ao Webhook do n8n com contexto e pendingAction
  const webhookPayload = {
    type: type || 'text',
    message: cleanMessage,
    authenticatedUserId: userId,
    conversationId,
    currentDate: currentDateIso,
    context: {
      month: targetMonth,
      year: targetYear,
      currentDate: currentDateIso
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
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'CorvFin-Server/3.8.0',
    'Authorization': `Basic ${credentials}`
  };

  console.log(`[AI ACTION] interpret request user=${userId} conv=${conversationId}`);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(webhookPayload),
      signal: controller.signal
    });

    clearTimeout(timer);
    const duration = Date.now() - startTime;
    console.log(`[AI ACTION] n8n status=${response.status} duration=${duration}ms`);

    if (!response.ok) {
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
    const actionResult = Array.isArray(json) ? (json[0] || {}) : (json || {});

    // Carrega dados financeiros do usuário para validação e cruzamento
    const finances = await storageService.getUserFinances(userId, userName);
    const userCategories = (finances.categories || []).map(c => typeof c === 'string' ? c : (c?.name || '')).filter(Boolean);
    const userDestinations = (finances.destinations || []).map(d => typeof d === 'string' ? d : (d?.name || '')).filter(Boolean);

    if (actionResult.action === 'unsupported_action') {
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

    // 8. Resolução de Intenção Ativa e Correções de Tipo
    const existingSlots = pendingAction?.slots || {};
    let activeIntent = pendingAction?.intent || (actionResult.action === 'create_benefit' ? 'create_benefit' : 'create_expense');

    const isBenefitText = /\b(vr|va|vale refeicao|vale refeição|vale alimentacao|vale alimentação|beneficio|benefício|vale transporte)\b/i.test(lowerMessage);
    const isExpenseCorrection = /\b(pix|cartao|cartão|nubank|dinheiro|debito|débito|credito|crédito)\b/i.test(lowerMessage) && (lowerMessage.includes('nao') || lowerMessage.includes('não') || lowerMessage.includes('foi no') || lowerMessage.includes('no ') || lowerMessage.includes('via '));

    if (isExpenseCorrection) {
      activeIntent = 'create_expense';
    } else if (isBenefitText || actionResult.action === 'create_benefit') {
      activeIntent = 'create_benefit';
    }

    // 9. Extração e Merge Incremental de Slots
    const rawData = actionResult.data || {};

    // Extração de Descrição
    let mergedDesc = null;
    const isGenericMsg = isGenericIntentPhrase(cleanMessage);
    const rawN8nDesc = safeTrim(rawData.description);
    const n8nDesc = (typeof rawN8nDesc === 'string' && rawN8nDesc.length <= 150) ? rawN8nDesc : (rawN8nDesc ? rawN8nDesc.slice(0, 150) : '');
    const isN8nDescGeneric = !n8nDesc || isGenericIntentPhrase(n8nDesc) || ['despesa', 'gasto', 'compra', 'beneficio', 'benefício', 'lancamento', 'lançamento'].includes(normalizeSearchStr(n8nDesc));
    const msgDesc = extractDescriptionFromMessage(cleanMessage);
    const isMsgDescGeneric = !msgDesc || isGenericIntentPhrase(msgDesc) || ['despesa', 'gasto', 'compra', 'beneficio', 'benefício'].includes(normalizeSearchStr(msgDesc));

    if (!isN8nDescGeneric && !isGenericMsg) {
      mergedDesc = n8nDesc.toLocaleUpperCase('pt-BR');
    } else if (!isMsgDescGeneric && !isGenericMsg && !/^\d+/.test(msgDesc)) {
      mergedDesc = msgDesc.toLocaleUpperCase('pt-BR');
    } else if (existingSlots.description && !isGenericIntentPhrase(existingSlots.description)) {
      mergedDesc = existingSlots.description;
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

    // Extração de Destino (para Despesa)
    let mergedDestination = null;
    const msgDest = extractDestinationFromMessage(cleanMessage, userDestinations);
    const n8nDest = safeTrim(rawData.destination);
    if (n8nDest) {
      const match = userDestinations.find(d => normalizeSearchStr(typeof d === 'string' ? d : d?.name) === normalizeSearchStr(n8nDest));
      mergedDestination = match ? (typeof match === 'string' ? match : match.name) : n8nDest;
    } else if (msgDest) {
      mergedDestination = msgDest;
    } else if (existingSlots.destination && activeIntent === 'create_expense') {
      mergedDestination = existingSlots.destination;
    }

    // Extração de Tipo de Benefício (para Benefício)
    let mergedBenefitType = null;
    const msgBenType = extractBenefitTypeFromMessage(cleanMessage);
    const n8nBenType = safeTrim(rawData.benefitType || rawData.type);
    if (n8nBenType) {
      mergedBenefitType = n8nBenType.toLowerCase();
    } else if (msgBenType) {
      mergedBenefitType = msgBenType;
    } else if (existingSlots.benefitType && activeIntent === 'create_benefit') {
      mergedBenefitType = existingSlots.benefitType;
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
      if (!mergedDestination) missingFields.push('destination');
    } else if (activeIntent === 'create_benefit') {
      if (!mergedBenefitType) missingFields.push('benefitType');
    }

    const mergedSlots = {
      description: mergedDesc,
      amount: mergedAmount,
      category: safeTrim(rawData.category) || existingSlots.category || null,
      destination: activeIntent === 'create_expense' ? mergedDestination : null,
      benefitType: activeIntent === 'create_benefit' ? mergedBenefitType : null,
      competence: { month: compMonth, year: compYear },
      day: Math.max(1, Math.min(31, Number(rawData.day) || existingSlots.day || now.getDate())),
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
        source: actionResult.source || type || 'text',
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
    let rawWarnings = Array.isArray(actionResult.warnings) ? [...actionResult.warnings] : [];

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

    let requiresReview = false;

    // Geração de proposalId único
    const proposalId = 'prop_' + crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutos

    if (activeIntent === 'create_benefit') {
      const proposalDoc = {
        _id: proposalId,
        userId,
        conversationId: conversationId || null,
        action: 'create_benefit',
        status: 'pending',
        source: actionResult.source || type || 'text',
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

    // Resolução de Categoria Canônica para Despesas
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
      const SEMANTIC_CATEGORY_MAP = [
        { keywords: ['almoco', 'almoço', 'jantar', 'lanche', 'pizza', 'restaurante', 'mercado', 'comida', 'alimentacao', 'alimentação', 'supermercado', 'ifood', 'ubereats', 'padaria', 'cafe', 'café', 'mcdonalds', 'burger'], targets: ['alimentacao', 'alimentação', 'refeicao', 'refeição', 'restaurante', 'mercado'] },
        { keywords: ['netflix', 'spotify', 'gemini', 'chatgpt', 'prime', 'youtube', 'assinatura', 'software', 'nuvem', 'hosting', 'mensalidade', 'apple', 'icloud', 'claude', 'disney', 'hbo', 'max'], targets: ['assinatura', 'assinaturas', 'servicos', 'serviços', 'software'] },
        { keywords: ['farmacia', 'farmácia', 'remedio', 'remédio', 'medico', 'médico', 'consulta', 'exame', 'academia', 'dentista', 'hospital', 'saude', 'saúde', 'suplemento', 'drogaria'], targets: ['saude', 'saúde', 'farmacia', 'farmácia', 'academia'] },
        { keywords: ['uber', '99', 'gasolina', 'combustivel', 'combustível', 'estacionamento', 'onibus', 'ônibus', 'metro', 'metrô', 'pedagio', 'pedágio', 'transporte', 'passagem', 'abastecimento'], targets: ['transporte', 'transportes', 'combustivel', 'combustível', 'veiculo', 'veículo'] },
        { keywords: ['aluguel', 'condominio', 'condomínio', 'luz', 'agua', 'água', 'energia', 'gas', 'gás', 'internet', 'iptu', 'moradia', 'casa'], targets: ['moradia', 'habitacao', 'habitação', 'casa', 'contas fixas'] },
        { keywords: ['cinema', 'viagem', 'hotel', 'passeio', 'show', 'livro', 'jogo', 'game', 'bolsa', 'roupa', 'shopping', 'lazer', 'presente', 'balada', 'festa', 'steam'], targets: ['lazer', 'lazer & entretenimento', 'compras', 'vestuario', 'vestuário', 'pessoal'] },
        { keywords: ['investimento', 'tesouro', 'cdb', 'acoes', 'ações', 'fii', 'cripto', 'poupanca', 'poupança', 'aporte'], targets: ['investimento', 'investimentos', 'aplicacao', 'aplicação'] }
      ];

      for (const sem of SEMANTIC_CATEGORY_MAP) {
        const matchesKeyword = sem.keywords.some(k => descLower.includes(k) || (catInput && normalizeSearchStr(catInput).includes(k)));
        if (matchesKeyword) {
          const found = userCategories.find(c => sem.targets.some(t => normalizeSearchStr(c) === t || normalizeSearchStr(c).includes(t)));
          if (found) {
            matchedCategory = found;
            break;
          }
        }
      }
    }

    if (!matchedCategory) {
      const geraisCat = userCategories.find(c => {
        const norm = normalizeSearchStr(c);
        return norm === 'gerais' || norm === 'geral' || norm === 'outros' || norm === 'diversos';
      });
      if (geraisCat) {
        matchedCategory = geraisCat;
      }
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

    // requiresReview deve refletir o estado real das pendências
    requiresReview = !matchedCategory || rawWarnings.length > 0;

    // Resolução de Destino Canônico
    let finalDestination = mergedDestination;
    if (finalDestination) {
      const match = userDestinations.find(d => normalizeSearchStr(typeof d === 'string' ? d : d?.name) === normalizeSearchStr(finalDestination));
      if (match) {
        finalDestination = typeof match === 'string' ? match : match.name;
      }
    }

    const proposalDoc = {
      _id: proposalId,
      userId,
      conversationId: conversationId || null,
      action: 'create_expense',
      status: 'pending',
      source: actionResult.source || type || 'text',
      proposal: {
        description: mergedDesc,
        amount: mergedAmount,
        category: matchedCategory,
        destination: finalDestination,
        competence: { month: compMonth, year: compYear },
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
 * Valida os dados da proposta (incluindo edições permitidas do usuário),
 * cria a despesa através do motor oficial do OmniFin com regras de Pix/Dinheiro/dueDay,
 * persiste no storage com optimistic locking (CAS/revision) e marca o proposalId como consumido.
 */
async function confirmExpenseProposal({ userId, proposalId, data: userEdits = {} }) {
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

  // Validação de Destino no cadastro do próprio usuário (Null-safe)
  const userDestinations = (finances.destinations || []).filter(Boolean);
  const normDest = normalizeSearchStr(destination);
  const matchedDestObj = userDestinations.find(d => {
    const dName = typeof d === 'string' ? d : (d?.name || '');
    const cleanDName = safeTrim(dName).toLowerCase();
    return cleanDName === destination.toLowerCase()
      || normalizeSearchStr(dName) === normDest
      || ((normDest === 'em dinheiro' || normDest === 'dinheiro' || normDest === 'cash') && normalizeSearchStr(dName) === 'dinheiro')
      || (normDest === 'pix' && normalizeSearchStr(dName) === 'pix');
  });

  if (!matchedDestObj) {
    const err = new Error(`O destino "${destination || 'Não informado'}" não existe no seu cadastro.`);
    err.status = 400;
    err.code = 'INVALID_DESTINATION';
    throw err;
  }
  const matchedDestName = typeof matchedDestObj === 'string' ? matchedDestObj : matchedDestObj.name;

  // Aplicação do Motor Oficial de Despesas (Mesma lógica de Cadastro Rápido & Wizard)
  const isPixOrCash = (matchedDestName.toLowerCase() === 'pix' || matchedDestName.toLowerCase() === 'dinheiro');
  const dueDay = isPixOrCash ? null : (matchedDestObj.dueDay || null);
  const periodKey = `${compYear}-${String(compMonth).padStart(2, '0')}`;

  const paidHistory = {};
  let status = 'pendente';
  if (isPixOrCash) {
    status = 'pago';
    paidHistory[periodKey] = {
      paidAmount: amount,
      updatedAt: new Date().toISOString()
    };
  }

  const newExpenseId = 'exp_' + crypto.randomBytes(8).toString('hex') + Date.now().toString(36);
  const newExpense = {
    id: newExpenseId,
    name: description,
    amount,
    group: matchedCat,
    destination: matchedDestName,
    dueDay,
    note: notes || '',
    startMonth: compMonth,
    startYear: compYear,
    endMonth: compMonth,
    endYear: compYear,
    installments,
    paymentType: 'cash',
    status,
    paidHistory
  };

  finances.variable.push(newExpense);
  const saved = await storageService.saveUserFinances(userId, finances);

  // Marca a proposta como consumida/confirmada
  await storageService.updateAiProposalStatus(proposalId, 'confirmed', {
    consumedAt: new Date(),
    createdExpenseId: newExpense.id
  });

  if (proposal.conversationId) {
    await storageService.updateAiPendingAction(userId, proposal.conversationId, {
      status: 'confirmed',
      updatedAt: new Date()
    }).catch(() => null);
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
    await storageService.updateAiPendingAction(userId, proposal.conversationId, {
      status: 'confirmed',
      updatedAt: new Date()
    }).catch(() => null);
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
  confirmBenefitProposal,
  cancelExpenseProposal
};
