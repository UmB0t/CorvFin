/**
 * AI Credit Policy — Catálogo Canônico de Custos Comerciais de IA (CorvFin V2 - Lote 5G)
 *
 * Princípios:
 * 1. Os valores representam CRÉDITOS COMERCIAIS apresentados e debitados do usuário, NÃO tokens de LLM.
 * 2. Operações com custo 0 são estritamente locais (sem chamada ao n8n/provider).
 * 3. Chave canônica: `${operationType}:${inputMode}`.
 * 4. Modalidades 'audio' e 'image' estão registradas no catálogo para o futuro (5G-M), mas inativas no runtime atual.
 */

'use strict';

const AI_CREDIT_POLICY = {
  // Operações Gratuitas (0 créditos) - Resolvidas estritamente no Node.js
  'casual_conversation:text': 0,
  'product_help:text': 0,
  'capabilities_help:text': 0,

  // Consultas e Análises Conversacionais (/api/ai/chat)
  'financial_query:text': 1,
  'financial_analysis:text': 3,

  // Ações Transacionais (/api/ai/actions/interpret)
  'expense_interpretation:text': 1,
  'benefit_interpretation:text': 1,

  // Catálogo preparado para o futuro (5G-M — Multimodal Input), inativo no runtime atual:
  'expense_interpretation:audio': 2,
  'expense_interpretation:image': 3,
  'benefit_interpretation:audio': 2,
  'benefit_interpretation:image': 3
};

const ALL_SUPPORTED_INPUT_MODES = ['text', 'audio', 'image'];
const CHAT_SUPPORTED_MODES = ['text'];
const SUPPORTED_INPUT_MODES = ALL_SUPPORTED_INPUT_MODES;

function getCreditCost(operationType, inputMode = 'text') {
  const key = `${operationType}:${inputMode}`;
  if (key in AI_CREDIT_POLICY) {
    return AI_CREDIT_POLICY[key];
  }
  return null;
}

function isInputModeSupported(inputMode, endpoint = 'chat') {
  if (endpoint === 'interpret' || endpoint === 'actions') {
    return ALL_SUPPORTED_INPUT_MODES.includes(inputMode);
  }
  return CHAT_SUPPORTED_MODES.includes(inputMode);
}

module.exports = {
  AI_CREDIT_POLICY,
  SUPPORTED_INPUT_MODES,
  getCreditCost,
  isInputModeSupported
};
