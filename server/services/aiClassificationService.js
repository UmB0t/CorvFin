/**
 * AI Classification Service — Classificador Determinístico de Operações de IA (CorvFin V2 - Lote 5G)
 *
 * Responsabilidades:
 * 1. Classificação rápida e determinística da mensagem ANTES da chamada ao n8n/provider;
 * 2. Determinação de custo comercial (creditCost) baseado em aiCreditPolicy;
 * 3. Resolução estritamente local de saudações e dúvidas do sistema (creditCost = 0, sem chamar provider);
 * 4. Princípio Fail-Safe Comercial: mensagens ambíguas NUNCA são promovidas para gratuitas.
 */

'use strict';

const { getCreditCost, isInputModeSupported } = require('../config/aiCreditPolicy');

/**
 * Normaliza string removendo acentos, pontuações excedentes e espaços múltiplos.
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[!?,;.:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Respostas locais determinísticas para operações gratuitas (creditCost = 0).
 */
const LOCAL_RESPONSES = {
  casual_conversation: {
    answer: 'Olá! Sou o Assistente Inteligente do CorvFin. Como posso ajudar com suas finanças hoje?',
    suggestions: [
      'Quanto gastei este mês?',
      'Qual meu saldo previsto?',
      'Lançar despesa de almoço'
    ]
  },
  capabilities_help: {
    answer: 'Eu posso te ajudar a consultar seus saldos e despesas, analisar categorias de gastos e cadastrar despesas e benefícios diretamente pelo chat! Por exemplo, você pode perguntar "Quanto gastei este mês?" ou dizer "Gastei 50 no almoço no Pix".',
    suggestions: [
      'Quanto gastei com alimentação?',
      'Qual meu saldo atual?',
      'Quais categorias mais pesam no mês?'
    ]
  },
  password_help: {
    answer: 'Para alterar sua senha, acesse o menu Perfil no canto superior direito e utilize a seção "Segurança e Senha".',
    suggestions: [
      'O que mais posso fazer no Perfil?',
      'Voltar ao resumo financeiro'
    ]
  },
  bug_support_help: {
    answer: 'Para reportar um problema ou falar com o suporte, entre em contato pelo e-mail suporte@corvfin.com.br ou abra um chamado pelo nosso canal de atendimento.',
    suggestions: [
      'Como funciona o suporte?',
      'Consultar minhas finanças'
    ]
  },
  module_help: {
    answer: 'O CorvFin possui módulos dedicados para Despesas, Rendas Extras, Devedores, Investimentos, Benefícios (VA/VR), Lista de Compras e Simulação Financeira. Você pode navegar pelo menu lateral para acessar cada recurso.',
    suggestions: [
      'Como funciona a Simulação?',
      'Como funciona a Lista de Compras?'
    ]
  }
};

/**
 * Palavras-chave fortes para detecção de análise financeira aprofundada (3 créditos).
 */
const FINANCIAL_ANALYSIS_SIGNALS = [
  'analise',
  'compare',
  'comparacao',
  'projecao',
  'projete',
  'tendencia',
  'onde posso economizar',
  'onde posso cortar',
  'quais despesas sao menos necessarias',
  'qual gasto mais pesa',
  'evolucao',
  'ranking',
  'ao longo do ano'
];

/**
 * Classifica a operação de IA antes da execução.
 *
 * @param {Object} params
 * @param {'chat' | 'interpret'} params.endpoint Rota de origem
 * @param {string} params.message Mensagem enviada pelo usuário
 * @param {string} [params.inputMode='text'] Modalidade ('text', 'audio', 'image')
 * @param {Object} [params.pendingAction] Ação multi-turno ativa em cache, se houver
 * @returns {Object} { operationType, inputMode, creditCost, requiresFinancialContext, localResponse, providerRequired, unsupported, errorMessage }
 */
function classifyAiOperation({ endpoint = 'chat', message = '', inputMode = 'text', pendingAction = null }) {
  const cleanMode = (inputMode || 'text').trim().toLowerCase();

  // 1. Validação de Modalidade de Entrada (5G-M preparação)
  if (!isInputModeSupported(cleanMode, endpoint)) {
    return {
      operationType: 'unsupported',
      inputMode: cleanMode,
      creditCost: 0,
      requiresFinancialContext: false,
      localResponse: null,
      providerRequired: false,
      unsupported: true,
      errorMessage: `A modalidade de entrada "${cleanMode}" ainda não é suportada neste ambiente. Utilize entrada em texto.`
    };
  }

  // 2. Rota Transacional (/api/ai/actions/interpret)
  if (endpoint === 'interpret') {
    const norm = normalizeText(message);
    const isBenefit = cleanMode === 'text' && (
      /\b(vr|va|vt|vale\s+refei[çc][ãa]o|vale\s+alimenta[çc][ãa]o|vale\s+transporte|benef[ií]cio|plano\s+de\s+sa[uú]de)\b/i.test(norm)
      && !/(?:mas|porem|porém|so que|só que)\s+.*?\b(?:pix|dinheiro|cart[aã]o|cr[eé]dito|d[eé]bito|boleto)\b|\bpaguei\b.*?\b(?:no|na|em|via|com)\b.*?\b(?:pix|dinheiro|cart[aã]o|cr[eé]dito|d[eé]bito|boleto)\b/i.test(norm)
    );
    const operationType = isBenefit ? 'benefit_interpretation' : 'expense_interpretation';
    const creditCost = getCreditCost(operationType, cleanMode) ?? (cleanMode === 'image' ? 3 : (cleanMode === 'audio' ? 2 : 1));

    return {
      operationType,
      inputMode: cleanMode,
      creditCost,
      requiresFinancialContext: true,
      localResponse: null,
      providerRequired: true,
      unsupported: false,
      errorMessage: null
    };
  }

  // 3. Rota Conversacional (/api/ai/chat)
  const norm = normalizeText(message);

  // A) Saudações triviais / Conversa casual (0 créditos, local)
  const isGreeting = /^(oi|ola|bom dia|boa tarde|boa noite|e ai|e aew|opa|fala|tudo bem|tudo bom|obrigado|obrigada|valeu|tks|thanks)$/i.test(norm)
    || /^(oi|ola|opa)\s+(tudo bem|tudo bom|como vai)$/i.test(norm);

  if (isGreeting) {
    return {
      operationType: 'casual_conversation',
      inputMode: cleanMode,
      creditCost: 0,
      requiresFinancialContext: false,
      localResponse: LOCAL_RESPONSES.casual_conversation,
      providerRequired: false,
      unsupported: false,
      errorMessage: null
    };
  }

  // B) Capacidades do assistente (0 créditos, local)
  const isCapabilities = /^(o que voce (sabe|pode) fazer|o que você (sabe|pode) fazer|como voce pode me ajudar|como você pode me ajudar|quais comandos|quais sao suas funcoes|quais são suas funções|ajuda|comandos)$/i.test(norm);

  if (isCapabilities) {
    return {
      operationType: 'capabilities_help',
      inputMode: cleanMode,
      creditCost: 0,
      requiresFinancialContext: false,
      localResponse: LOCAL_RESPONSES.capabilities_help,
      providerRequired: false,
      unsupported: false,
      errorMessage: null
    };
  }

  // C) Ajuda de Senha (0 créditos, local)
  const isPassword = /^(onde|como) (altero|mudo|troco|redefino) (a |minha )?senha$|^esqueci minha senha$|^trocar senha$|^alterar senha$/i.test(norm);
  if (isPassword) {
    return {
      operationType: 'product_help',
      inputMode: cleanMode,
      creditCost: 0,
      requiresFinancialContext: false,
      localResponse: LOCAL_RESPONSES.password_help,
      providerRequired: false,
      unsupported: false,
      errorMessage: null
    };
  }

  // D) Ajuda de Suporte / Bug (0 créditos, local)
  const isBugOrSupport = /^(como )?(reporto|relato|informo) (um )?bug$|^como (falo|falar|entro em contato|entrar em contato) com (o )?suporte$|^(contato com|falar com|suporte|canais de atendimento)( o suporte)?$/i.test(norm);
  if (isBugOrSupport) {
    return {
      operationType: 'product_help',
      inputMode: cleanMode,
      creditCost: 0,
      requiresFinancialContext: false,
      localResponse: LOCAL_RESPONSES.bug_support_help,
      providerRequired: false,
      unsupported: false,
      errorMessage: null
    };
  }

  // E) Ajuda Geral de Módulos (0 créditos, local)
  const isModuleHelp = /^como funciona (o sistema|a plataforma|o app)$/i.test(norm);
  if (isModuleHelp) {
    return {
      operationType: 'product_help',
      inputMode: cleanMode,
      creditCost: 0,
      requiresFinancialContext: false,
      localResponse: LOCAL_RESPONSES.module_help,
      providerRequired: false,
      unsupported: false,
      errorMessage: null
    };
  }

  // F) Análise Financeira Profunda (3 créditos, n8n)
  const hasAnalysisSignal = FINANCIAL_ANALYSIS_SIGNALS.some(signal => norm.includes(signal));
  if (hasAnalysisSignal) {
    return {
      operationType: 'financial_analysis',
      inputMode: cleanMode,
      creditCost: getCreditCost('financial_analysis', cleanMode) ?? 3,
      requiresFinancialContext: true,
      localResponse: null,
      providerRequired: true,
      unsupported: false,
      errorMessage: null
    };
  }

  // G) Fallback Padrão: Consulta Financeira Objetiva (1 crédito, n8n)
  return {
    operationType: 'financial_query',
    inputMode: cleanMode,
    creditCost: getCreditCost('financial_query', cleanMode) ?? 1,
    requiresFinancialContext: true,
    localResponse: null,
    providerRequired: true,
    unsupported: false,
    errorMessage: null
  };
}

module.exports = {
  normalizeText,
  classifyAiOperation,
  LOCAL_RESPONSES
};
