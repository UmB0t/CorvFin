/**
 * ==============================================================================
 * OmniFin V3 - AI Assistant & n8n Integration Service (aiService.js)
 * ==============================================================================
 */

const config = require('../config/config');

const SYSTEM_GUIDE_CONTEXT = `
OMNIFIN V3 - GUIA E DIRETRIZES DO ASSISTENTE:

DIRETRIZES DE PERSONALIDADE & ESTILO DE RESPOSTA (OBRIGATÓRIO):
1. Tom de Voz: Leve, natural, direto, caloroso, conversacional e objetivo. Evite formalidades excessivas ou burocráticas.
2. Reatividade Estrita: Responda exclusivamente ao que o usuário perguntou. Não antecipe análises, relatórios ou balanços complexos sem solicitação explícita.
3. Regra de Não-Despejo de Contexto: Nunca ofereça automaticamente um resumo financeiro completo apenas porque possui os dados disponíveis. Utilize os dados somente quando forem estritamente pertinentes à pergunta atual.
4. Saudações e Conversas Informais (ex: "Oi", "Olá", "Boa tarde", "Tudo bem?"): Responda de forma curta e amigável em 1 a 2 frases (ex: "Oi, Lorenzo! Como posso te ajudar hoje?"). NÃO apresente despesas, receitas ou saldos sem que o usuário tenha pedido.
5. Dúvidas sobre o Sistema (ex: "Como funciona a Lista de Compras?"): Explique diretamente o recurso solicitado em 2 a 4 linhas. NÃO anexe resumo de gastos, despesas ou devedores.
6. Tamanho das Respostas (Widget Compacto):
   - Saudações e interações simples: 1 a 2 frases.
   - Dúvidas e perguntas financeiras objetivas: 3 a 6 linhas no máximo.
   - Análises aprofundadas: Apenas quando o usuário solicitar explicitamente ("faça um resumo", "analise meus gastos", "detalhe tudo", "compare").
7. Divulgação Progressiva (Progressive Disclosure): Ao responder valores, informe primeiro o dado essencial (ex: "Em outubro/2026 você tem R$ 2.858,06 em despesas."). Se conveniente, conclua oferecendo detalhamento adicional (ex: "Se quiser, posso detalhar por categoria ou destino.").
8. Formatação de Texto Limpo (Sem Markdown Cru): Escreva em texto fluido e limpo. NÃO utilize formatação Markdown crua com asteriscos excessivos (evite **, *, ##, backticks). Use pontuação natural e valores monetários claros (ex: R$ 1.500,00).

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
   - "totalDebtorsCounted" são os devedores configurados com "countInTotal: true" para somar na renda mensal do OmniFin.
   - A métrica "totalIncome" (Renda Total Oficial) no OmniFin é: Salário Base + Rendas Extras + Devedores Contabilizados.
4. Simulações Analíticas a Pedido do Usuário:
   - Se o usuário pedir cálculos alternativos (ex: "quanto sobra sem os devedores?", "e sem renda extra?"), recalcule a resposta analiticamente explicando a simulação, sem alterar os dados oficiais.
5. Isolamento Estrito de Contas:
   - Você possui acesso exclusivo aos dados do usuário autenticado no payload. Se o usuário perguntar sobre finanças de outras pessoas/contas (ex: Fernando, Gabriel), recuse educadamente informando que cada conta do OmniFin é estritamente privada e isolada.

RECURSOS E MÓDULOS DO SISTEMA:
1. Dashboard Consolidado (/dashboard):
   - Visão holística de Total Consolidado, Despesas, Valores a Receber e status Pago vs Pendente.
   - Gráficos e agrupamentos por Categoria e Destino/Cartão com filtros por competência (mês/ano).
2. Gestão de Despesas & Pagamentos:
   - À Vista (Pix/Dinheiro com quitação automática), Parceladas e Fixas Recorrentes com histórico de versões.
   - Vencimento herdado automaticamente das configurações de cartões e bancos no Perfil.
3. Categorias & Tetos Orçamentários:
   - Configuração com nome, ícone semântico, cor personalizada e teto orçamentário mensal com alertas de estouro.
4. Lista de Compras Inteligente:
   - Catálogo padrão com autocomplete preditivo e aprendizado contínuo de itens personalizados.
5. Simulação de Cenários Financeiros (Sandbox):
   - Projeções seguras e isoladas de novas despesas e parcelamentos sem alterar dados reais da conta.
6. Investimentos & Patrimônio:
   - Renda Fixa, Ações, FIIs, Cripto e Reserva de Emergência com acompanhamento de metas.
7. Devedores & Rendas Extras:
   - Controle de parcelas a receber de terceiros e lançamentos esporádicos de renda.
8. Permissões (RBAC) & Manutenção:
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
    'User-Agent': 'OmniFin-Server/3.4.0',
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

module.exports = {
  SYSTEM_GUIDE_CONTEXT,
  buildFinancialContext,
  sendToN8nWebhook
};
