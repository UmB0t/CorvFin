/**
 * n8nContracts.js — Contratos Oficiais e Prompts do n8n / Gemini (CorvFin V2 - Lote 5G-M.2.4)
 *
 * Padronização dos contratos de TEXTO, ÁUDIO, IMAGEM e NORMALIZADOR:
 * 1. Usa escalares {{ $json.body.month }} e {{ $json.body.year }} (não depende de $json.body.context?.month/year);
 * 2. Padroniza "day": null e "date": null nos 3 contratos de entrada;
 * 3. Padroniza "requiresReview": false e "warnings": [] nos 3 contratos, ativando requiresReview=true em ambiguidade real;
 * 4. Normalizador aceita context objeto, context JSON string e month/year escalares;
 * 5. Canonicaliza payment.account contra allowedDestinations (não aceita contas inventadas);
 * 6. Preserva a soberania da validação local (requiresReview=false do provider não sobrescreve falha local).
 */

'use strict';

const TEXT_PROMPT = `Você é o interpretador de lançamentos financeiros do CorvFin.

Sua única função é extrair informações financeiras da mensagem enviada pelo usuário e propor uma ação estruturada (Despesa convencional ou Gasto com Benefício corporativo).

Mensagem:
{{ $json.body.message }}

Competência de referência informada pelo CorvFin:
Mês: {{ $json.body.month }}
Ano: {{ $json.body.year }}

Extraia somente informações explicitamente presentes ou que possam ser inferidas com alta segurança.

Retorne SOMENTE JSON válido, sem Markdown (sem \`\`\`json), sem explicações e sem texto antes ou depois.

Formato obrigatório de resposta:

{
  "action": "create_expense",
  "description": null,
  "amount": null,
  "categoryHint": null,
  "destinationHint": null,
  "payment": {
    "method": null,
    "account": null
  },
  "benefitTypeHint": null,
  "day": null,
  "date": null,
  "competence": {
    "month": null,
    "year": null
  },
  "installments": 1,
  "totalAmount": null,
  "installmentAmount": null,
  "amountInputMode": "total",
  "notes": null,
  "requiresReview": false,
  "warnings": [],
  "confidence": {
    "description": 0,
    "amount": 0,
    "category": 0,
    "destination": 0,
    "date": 0
  }
}

Regras Fundamentais:

1. AÇÃO (action):
   - Use "create_benefit" SOMENTE se o usuário indicar explicitamente que o gasto/compra foi realizado utilizando um benefício corporativo (ex.: "no VT", "vale transporte", "no VA", "vale alimentação", "no VR", "vale refeição", "usei meu benefício farmácia", "benefício saúde", "cartão de benefícios").
     Preencha "benefitTypeHint" com o tipo canônico correspondente ("transporte", "va", "vr", "saude", "farmacia", "educacao", "cultura").
   - NUNCA trate palavras genéricas isoladas de consumo ou estabelecimento (como "refeição", "almoço", "farmácia", "remédio", "transporte", "uber", "ônibus") automaticamente como benefício se o pagamento foi pessoal/convencional ou sem menção expressa ao uso de benefício corporativo.
     Exemplos:
     "gastei 30 com refeição" => create_expense (não inferir VR apenas pela palavra refeição)
     "comprei remédio na farmácia" => create_expense (não inferir benefício farmácia automaticamente)
     "paguei no VR" => create_benefit / vr
     "usei meu benefício farmácia" => create_benefit / farmacia
   - Use "create_expense" para compras, pagamentos e gastos pessoais convencionais (Pix, dinheiro, cartão de crédito, cartão de débito, boleto, etc.).
   - Se houver pagamento pessoal convencional explícito (ex.: "no Pix", "no cartão", "no dinheiro"), use "create_expense".

2. AMBIGUIDADE ESTRUTURADA:
   - Se houver conflito real ou ambiguidade entre meio de pagamento convencional e benefício corporativo (por exemplo, "almoço 35 vr pix" ou dúvida genuína entre create_expense e create_benefit):
     Defina "requiresReview": true e adicione em "warnings" uma breve explicação (ex.: ["Ambiguidade detectada entre benefício corporativo e pagamento convencional."]).
   - Se não houver ambiguidade, mantenha "requiresReview": false e "warnings": [].

3. VALORES E PARCELAS:
   - "amount" deve ser número estrito, sem "R$" e com ponto decimal (ex.: 35.50). Nunca invente valores. Se ausente, retorne null.
   - "installments" deve ser número inteiro >= 1.
   - Para despesa parcelada (installments > 1):
     * Regra padrão: "amountInputMode" = "total", "totalAmount" = valor total da compra informado pelo usuário.
     * Se o usuário indicar expressamente o valor por parcela (ex.: "10 parcelas de 300"): preencha "amountInputMode" = "installment", "installmentAmount" = 300, "totalAmount" = 3000.
     * Se houver menção consistente de ambos ("3000 em 10x de 300"): "amountInputMode" = "total", "totalAmount" = 3000, "installmentAmount" = 300.
     * Se houver divergência entre o total e a soma das parcelas ("3000 em 10x de 350"): preencha "requiresReview" = true e adicione aviso explicativo em "warnings".

4. DATAS E COMPETÊNCIA:
   - "day": número inteiro do dia do mês (1 a 31), especialmente relevante quando for benefício ("create_benefit") ou quando apenas o dia for mencionado.
   - "date": data completa no formato "YYYY-MM-DD", se identificada. Se ausente, retorne null.
   - "competence": mês (1-12) e ano (YYYY). Se o usuário não mencionar outro período, use a competência de referência informada acima (Mês: {{ $json.body.month }}, Ano: {{ $json.body.year }}).

5. FORMAS DE PAGAMENTO (para Despesas):
   - "payment.method" deve usar estritamente um dos seguintes valores canônicos:
     "pix", "dinheiro", "cartao_credito", "cartao_debito", "boleto", "transferencia", "debito_automatico", "outros".
   - "payment.account" e "destinationHint": conta/banco ou destino utilizado (ex.: "Nubank", "Itaú").

6. RESTRIÇÕES DE DESTINO E CATEGORIA:
   - CATEGORIAS DISPONÍVEIS:
{{ JSON.stringify($json.allowedCategories) }}
   - DESTINOS DISPONÍVEIS:
{{ JSON.stringify($json.allowedDestinations) }}
   - "categoryHint" só pode ser um valor exatamente presente na lista de categorias disponíveis. Nunca invente categorias. Se não houver correspondência segura, retorne null.
   - "destinationHint" e "payment.account" só podem ser valores presentes na lista de destinos disponíveis. Nunca invente contas ou destinos. Se a conta não existir na lista, retorne null.

7. RETORNO:
   - Retorne estritamente o objeto JSON único.`;

const AUDIO_PROMPT = `Analise o áudio enviado pelo usuário e extraia as informações necessárias para propor um lançamento financeiro no CorvFin (Despesa convencional ou Gasto com Benefício corporativo).

Competência de referência informada pelo CorvFin:
Mês: {{ $json.body.month }}
Ano: {{ $json.body.year }}

Identifique:
- descrição do lançamento;
- valor total;
- se foi gasto convencional ou gasto com benefício corporativo (VT, VA, VR, Saúde, Farmácia);
- categoria provável (apenas se compatível com as do usuário);
- forma de pagamento e conta/destino;
- dia e/ou data;
- quantidade de parcelas, se mencionada;
- notas e observações relevantes.

Retorne SOMENTE JSON válido, sem Markdown (sem \`\`\`json), sem explicações adicionais:

{
  "action": "create_expense",
  "description": null,
  "amount": null,
  "categoryHint": null,
  "destinationHint": null,
  "payment": {
    "method": null,
    "account": null
  },
  "benefitTypeHint": null,
  "day": null,
  "date": null,
  "competence": {
    "month": null,
    "year": null
  },
  "installments": 1,
  "notes": null,
  "requiresReview": false,
  "warnings": [],
  "confidence": {
    "description": 0,
    "amount": 0,
    "category": 0,
    "destination": 0,
    "date": 0
  }
}

Regras Fundamentais:

1. AÇÃO (action):
   - Use "create_benefit" SOMENTE se o áudio indicar explicitamente que o gasto foi realizado utilizando um benefício corporativo (ex.: vale transporte, VT, vale alimentação, VA, vale refeição, VR, benefício farmácia, etc.). Preencha "benefitTypeHint" com o tipo canônico correspondente ("transporte", "va", "vr", "saude", "farmacia", "educacao", "cultura").
   - NUNCA trate termos genéricos isolados como "refeição" ou "farmácia" como benefício corporativo se o pagamento foi convencional ou não houver menção expressa a benefício corporativo.
   - Use "create_expense" para despesas e pagamentos pessoais convencionais (Pix, dinheiro, cartão, boleto, etc.).
   - Pagamento pessoal convencional explícito tem precedência para "create_expense".

2. AMBIGUIDADE ESTRUTURADA:
   - Se houver ambiguidade real ou conflito de classificação entre benefício corporativo e pagamento convencional no áudio:
     Defina "requiresReview": true e adicione em "warnings" uma breve explicação (ex.: ["Ambiguidade detectada entre benefício corporativo e pagamento convencional."]).
   - Caso contrário, mantenha "requiresReview": false e "warnings": [].

3. VALORES E PARCELAS:
   - "amount" deve ser número (ex.: 45.00). Nunca invente valores. Se ausente, utilize null.
   - "installments" deve ser número inteiro >= 1.

4. DATAS:
   - "day": número do dia do mês (1 a 31).
   - "date": data no formato "YYYY-MM-DD".
   - "competence": se o usuário não indicar outro período, use mês: {{ $json.body.month }} e ano: {{ $json.body.year }}.

5. FORMAS DE PAGAMENTO:
   - "payment.method" deve ser um dos valores canônicos: "pix", "dinheiro", "cartao_credito", "cartao_debito", "boleto", "transferencia", "debito_automatico", "outros".

6. LISTAS PERMITIDAS DO USUÁRIO:
CATEGORIAS VÁLIDAS:
{{ JSON.stringify($json.allowedCategories) }}

DESTINOS VÁLIDOS:
{{ JSON.stringify($json.allowedDestinations) }}

- "categoryHint" só pode utilizar valores da lista de categorias válidas.
- "destinationHint" e "payment.account" só podem utilizar valores da lista de destinos válidos.
- Se o usuário disser algo ambíguo como "paguei no Nubank" e existirem "Nubank" e "Nubank PJ", não invente: retorne null em "payment.account" e "destinationHint".
- Nunca invente categorias ou contas inexistentes.

7. RETORNO:
- Não execute nenhuma gravação, não afirme que o lançamento foi cadastrado. Retorne exclusivamente o objeto JSON.`;

const IMAGE_PROMPT = `Analise esta imagem como um documento relacionado a uma despesa ou comprovante de gasto financeiro no CorvFin.

A imagem pode ser:
- nota fiscal / cupom fiscal / NFC-e;
- recibo ou comprovante de compra;
- comprovante Pix, transferência ou boleto;
- fatura ou extrato de cartão / benefício;
- fotografia de preço, serviço ou produto.

Competência de referência informada pelo CorvFin:
Mês: {{ $json.body.month }}
Ano: {{ $json.body.year }}

Extraia apenas informações que estejam visíveis ou possam ser inferidas com alta segurança.
Priorize: estabelecimento (merchant), descrição da compra, valor TOTAL efetivamente pago, data/dia, forma de pagamento e parcelas.
IMPORTANTE: Não confunda subtotal, desconto, troco, impostos ou valor unitário com o valor total.

Retorne SOMENTE JSON válido, sem Markdown (sem \`\`\`json), sem explicações:

{
  "action": "create_expense",
  "description": null,
  "merchant": null,
  "amount": null,
  "categoryHint": null,
  "destinationHint": null,
  "payment": {
    "method": null,
    "account": null
  },
  "benefitTypeHint": null,
  "day": null,
  "date": null,
  "competence": {
    "month": null,
    "year": null
  },
  "installments": 1,
  "documentType": null,
  "notes": null,
  "requiresReview": false,
  "warnings": [],
  "confidence": {
    "description": 0,
    "amount": 0,
    "category": 0,
    "destination": 0,
    "date": 0
  }
}

Regras Fundamentais:

1. AÇÃO (action):
   - Use "create_benefit" se o documento for comprovante ou fatura emitido explicitamente por cartão/operadora de benefício corporativo (ex.: Alelo Refeição/Alimentação, Sodexo, Pluxee, VR Benefícios, Ticket Restaurante/Alimentação, Flash Benefícios, Swile, Caju, cartão de transporte metropolitano). Preencha "benefitTypeHint" com o tipo ("transporte", "va", "vr", "saude", "farmacia", "educacao", "cultura").
   - NUNCA trate cupons ou notas fiscais de restaurantes, padarias ou farmácias automaticamente como benefício quando o pagamento tiver sido feito por meios convencionais (cartão bancário pessoal, Pix, dinheiro). Nesses casos, use "create_expense".
   - Use "create_expense" para notas fiscais, cupons, comprovantes de Pix, cartões bancários convencionais e recibos gerais.

2. AMBIGUIDADE ESTRUTURADA:
   - Se o documento apresentar menções conflitantes ou ambíguas entre pagamento pessoal e benefício corporativo, defina "requiresReview": true e informe o motivo resumido em "warnings" (ex.: ["Comprovante apresenta múltiplos meios de pagamento ou ambiguidade com benefício corporativo."]).
   - Caso contrário, mantenha "requiresReview": false e "warnings": [].

3. VALORES E DATAS:
   - "amount": número decimal positivo correspondente ao total efetivamente pago.
   - "day": número do dia (1 a 31).
   - "date": data no formato "YYYY-MM-DD".
   - "competence": se a data não estiver visível, use mês: {{ $json.body.month }} e ano: {{ $json.body.year }}.

4. FORMA DE PAGAMENTO:
   - "payment.method" deve ser um dos valores canônicos: "pix", "dinheiro", "cartao_credito", "cartao_debito", "boleto", "transferencia", "debito_automatico", "outros".

5. RESTRIÇÕES DE CATEGORIAS E DESTINOS DO USUÁRIO:
CATEGORIAS VÁLIDAS DO USUÁRIO:
{{ JSON.stringify($json.allowedCategories) }}

DESTINOS VÁLIDOS DO USUÁRIO:
{{ JSON.stringify($json.allowedDestinations) }}

- "categoryHint" deve ser exclusivamente um valor da lista de categorias válidas.
- "destinationHint" e "payment.account" devem ser exclusivamente valores da lista de destinos válidos.
- Se o documento mostrar "Pix" e "Pix" existir nos destinos, pode utilizar "Pix".
- Se aparecer apenas "cartão" sem identificação clara da bandeira/banco cadastrado pelo usuário, mantenha "payment.account" e "destinationHint" como null.
- Nunca invente bancos, cartões ou contas inexistentes.

6. RETORNO:
- Retorne estritamente o objeto JSON único.`;

const NORMALIZER_CODE = `// ============================================================
// CorvFin - Normalização e Validação de Lançamento (Despesa / Benefício)
// Lote 5G-M.2.4 — Contrato Unificado com Suporte Multimodal e Multi-Turno
// ============================================================

// Contexto preservado antes do Gemini
const contextItem = $('MERGE CONTEXTO DO USUÁRIO').first();
const context = contextItem?.json || {};

const body = context.body || {};

const source = ['text', 'image', 'audio'].includes(body.type)
  ? body.type
  : 'unknown';

const allowedCategories = Array.isArray(context.allowedCategories)
  ? context.allowedCategories.filter(Boolean)
  : [];

const allowedDestinations = Array.isArray(context.allowedDestinations)
  ? context.allowedDestinations.filter(Boolean)
  : [];

const warnings = [];

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function normalizeString(value) {
  if (value === null || value === undefined) return '';

  return String(value)
    .trim()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function findCanonicalValue(value, allowedValues) {
  if (!value) return null;

  // Primeiro tenta match exato
  const exact = allowedValues.find(item => item === value);
  if (exact) return exact;

  // Depois match normalizado, retornando o nome canônico salvo no CorvFin
  const normalized = normalizeString(value);

  const match = allowedValues.find(
    item => normalizeString(item) === normalized
  );

  return match || null;
}

function parseMoney(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (value === null || value === undefined || value === '') {
    return null;
  }

  let str = String(value)
    .trim()
    .replace(/[R$\\s]/g, '')
    .replace(/[^\\d,.-]/g, '');

  if (!str) return null;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (hasComma) {
    str = str.replace(',', '.');
  }

  const number = Number(str);
  return Number.isFinite(number) ? number : null;
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function validMonth(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 12 ? number : null;
}

function validYear(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1900 && number <= 2200 ? number : null;
}

function validDay(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 31 ? number : null;
}

function validInstallments(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  const parsed = Math.trunc(number);
  return parsed >= 1 ? parsed : 1;
}

// ------------------------------------------------------------
// Localiza o conteúdo devolvido pelo Gemini
// ------------------------------------------------------------

function extractGeminiContent(json) {
  if (
    json &&
    typeof json === 'object' &&
    (
      json.action ||
      json.description ||
      json.amount ||
      json.categoryHint ||
      json.benefitTypeHint
    )
  ) {
    return json;
  }

  const candidates = [
    json?.text,
    json?.output,
    json?.response,
    json?.answer,
    json?.content?.parts?.[0]?.text,
    json?.candidate?.content?.parts?.[0]?.text,
    json?.candidates?.[0]?.content?.parts?.[0]?.text,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (candidate && typeof candidate === 'object') {
      return candidate;
    }
  }

  return null;
}

// ------------------------------------------------------------
// Parse seguro da resposta
// ------------------------------------------------------------

const rawResponse = extractGeminiContent($json);
let ai = null;

if (rawResponse && typeof rawResponse === 'object') {
  ai = rawResponse;
} else if (typeof rawResponse === 'string') {
  let clean = rawResponse.trim();
  clean = clean
    .replace(/^[\\x60]{3}json\\s*/i, '')
    .replace(/^[\\x60]{3}\\s*/i, '')
    .replace(/\\s*[\\x60]{3}$/i, '')
    .trim();

  try {
    ai = JSON.parse(clean);
  } catch (error) {
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        ai = JSON.parse(clean.slice(firstBrace, lastBrace + 1));
      } catch {
        ai = null;
      }
    }
  }
}

// ------------------------------------------------------------
// Gemini não retornou JSON utilizável
// ------------------------------------------------------------

if (!ai || typeof ai !== 'object') {
  return [{
    json: {
      success: false,
      code: 'AI_INVALID_RESPONSE',
      message: 'Não foi possível interpretar a resposta da IA.',
      action: 'create_expense',
      requiresConfirmation: false,
      requiresReview: true,
      source,
      data: null,
      confidence: {},
      warnings: [
        'A resposta da IA não pôde ser convertida em um lançamento válido.'
      ]
    }
  }];
}

// ------------------------------------------------------------
// Normalização de Ação (create_expense vs create_benefit)
// ------------------------------------------------------------

let action = ai.action === 'create_benefit' ? 'create_benefit' : 'create_expense';

const description =
  typeof ai.description === 'string' && ai.description.trim()
    ? ai.description.trim()
    : (
        typeof ai.merchant === 'string' && ai.merchant.trim()
          ? ai.merchant.trim()
          : null
      );

const merchant =
  typeof ai.merchant === 'string' && ai.merchant.trim()
    ? ai.merchant.trim()
    : null;

const amount = parseMoney(ai.amount);

if (amount === null || amount <= 0) {
  warnings.push('O valor do lançamento precisa ser informado ou revisado.');
}

// ------------------------------------------------------------
// Categoria (aplicável a Despesa)
// ------------------------------------------------------------

const rawCategoryCandidate = ai.categoryHint || ai.category;
const category = findCanonicalValue(
  rawCategoryCandidate,
  allowedCategories
);

if (action === 'create_expense') {
  if (rawCategoryCandidate && !category) {
    warnings.push('A categoria sugerida pela IA não existe entre as categorias deste usuário.');
  }
  if (!category) {
    warnings.push('A categoria precisa ser selecionada.');
  }
}

// ------------------------------------------------------------
// Destino e Conta de Pagamento (Canonicalização Segura)
// ------------------------------------------------------------

// Canonicaliza payment.account estritamente contra allowedDestinations
const rawAccountCandidate = ai.payment?.account || ai.paymentAccount || ai.account;
const canonicalAccount = findCanonicalValue(rawAccountCandidate, allowedDestinations);

if (rawAccountCandidate && !canonicalAccount) {
  warnings.push('A conta informada pela IA não existe entre as contas cadastradas do usuário.');
}

const rawDestCandidate = ai.destinationHint || ai.destination || canonicalAccount;
const destination = findCanonicalValue(rawDestCandidate, allowedDestinations);

if (ai.destinationHint && !destination) {
  warnings.push('O destino sugerido pela IA não existe entre os destinos deste usuário.');
}

const CANONICAL_METHODS = new Set([
  'pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'debito_automatico', 'outros'
]);

let canonicalMethod = null;
const rawMethod = String(ai.payment?.method || ai.paymentMethod || '').trim().toLowerCase();
if (CANONICAL_METHODS.has(rawMethod)) {
  canonicalMethod = rawMethod;
}

const hasPaymentInfo = Boolean(canonicalMethod || destination || canonicalAccount);
if (action === 'create_expense' && !hasPaymentInfo) {
  warnings.push('A forma de pagamento ou conta/destino precisa ser informada.');
}

// ------------------------------------------------------------
// Tipo de Benefício (aplicável a Benefício — Fail-Closed)
// ------------------------------------------------------------

let rawBenType = String(ai.benefitTypeHint || ai.benefitType || '').trim().toLowerCase();
if (!rawBenType && ai.notes) {
  const notesStr = String(ai.notes).toLowerCase();
  if (/\\b(vale\\s+refei[çc][ãa]o|vr)\\b/.test(notesStr)) rawBenType = 'vr';
  else if (/\\b(vale\\s+alimenta[çc][ãa]o|va)\\b/.test(notesStr)) rawBenType = 'va';
  else if (/\\b(vale\\s+transporte|vt)\\b/.test(notesStr)) rawBenType = 'transporte';
  else if (/\\b(benef[ií]cio\\s+farm[aá]cia|vale\\s+farm[aá]cia)\\b/.test(notesStr)) rawBenType = 'farmacia';
  else if (/\\b(benef[ií]cio\\s+sa[uú]de|plano\\s+de\\s+sa[uú]de)\\b/.test(notesStr)) rawBenType = 'saude';
  else if (/\\b(benef[ií]cio\\s+educa[çc][ãa]o|vale\\s+educa[çc][ãa]o)\\b/.test(notesStr)) rawBenType = 'educacao';
  else if (/\\b(benef[ií]cio\\s+cultura|vale\\s+cultura)\\b/.test(notesStr)) rawBenType = 'cultura';
}
if (!rawBenType && body.message) {
  const msgStr = String(body.message).toLowerCase();
  if (/\\b(vale\\s+refei[çc][ãa]o|vr)\\b/.test(msgStr)) rawBenType = 'vr';
  else if (/\\b(vale\\s+alimenta[çc][ãa]o|va)\\b/.test(msgStr)) rawBenType = 'va';
  else if (/\\b(vale\\s+transporte|vt)\\b/.test(msgStr)) rawBenType = 'transporte';
}

let benefitType = null;

if (['transporte', 'vt', 'transporte_publico', 'transporte publico', 'vale_transporte', 'vale transporte'].includes(rawBenType)) {
  benefitType = 'transporte';
} else if (['va', 'alimentacao', 'alimentação', 'vale_alimentacao', 'vale_alimentação', 'vale alimentacao', 'vale alimentação'].includes(rawBenType)) {
  benefitType = 'va';
} else if (['vr', 'refeicao', 'refeição', 'vale_refeicao', 'vale_refeição', 'vale refeicao', 'vale refeição'].includes(rawBenType)) {
  benefitType = 'vr';
} else if (['saude', 'saúde', 'plano_saude', 'plano_de_saude', 'plano de saude', 'plano de saúde', 'medico', 'médico'].includes(rawBenType)) {
  benefitType = 'saude';
} else if (['farmacia', 'farmácia', 'drogaria', 'medicamento', 'medicamentos'].includes(rawBenType)) {
  benefitType = 'farmacia';
} else if (['educacao', 'educação', 'escola', 'faculdade', 'curso'].includes(rawBenType)) {
  benefitType = 'educacao';
} else if (['cultura', 'vale_cultura', 'vale cultura', 'livro', 'livros'].includes(rawBenType)) {
  benefitType = 'cultura';
}

// Se o provedor marcou create_expense mas identificou benefício corporativo explícito sem meio convencional de pagamento:
if (action === 'create_expense' && benefitType && !canonicalMethod && !destination) {
  action = 'create_benefit';
  const payWarnIdx = warnings.indexOf('A forma de pagamento ou conta/destino precisa ser informada.');
  if (payWarnIdx >= 0) warnings.splice(payWarnIdx, 1);
}

if (action === 'create_benefit') {
  if (rawBenType && !benefitType) {
    warnings.push('O tipo de benefício "' + rawBenType + '" não é válido no CorvFin. Escolha entre: transporte, va, vr, saude, farmacia, educacao ou cultura.');
  }
  if (!benefitType) {
    warnings.push('O tipo de benefício precisa ser selecionado.');
  }
}

// ------------------------------------------------------------
// Dia e Data (Padronização Contratual)
// ------------------------------------------------------------

const rawDay = validDay(ai.day);
const rawDateStr = typeof ai.date === 'string' && ai.date.trim() ? ai.date.trim() : null;
const parsedDayFromDate = rawDateStr ? validDay(rawDateStr.split('-')[2]) : null;

const day = rawDay || parsedDayFromDate || null;
const date = rawDateStr;
// Nota: day é opcional na entrada, com fallback canônico preservado na confirmação

// ------------------------------------------------------------
// Competência (Suporte a context objeto, context JSON string e month/year escalares)
// ------------------------------------------------------------

let ctxObj = null;
if (body.context && typeof body.context === 'object') {
  ctxObj = body.context;
} else if (typeof body.context === 'string') {
  try {
    ctxObj = JSON.parse(body.context);
  } catch (_) {
    ctxObj = null;
  }
}

const requestMonth = validMonth(body.month) || validMonth(ctxObj?.month) || validMonth(context.month);
const requestYear = validYear(body.year) || validYear(ctxObj?.year) || validYear(context.year);

const aiMonth = validMonth(ai?.competence?.month);
const aiYear = validYear(ai?.competence?.year);

const competence = {
  month: aiMonth || requestMonth,
  year: aiYear || requestYear
};

if (!competence.month || !competence.year) {
  warnings.push('A competência do lançamento precisa ser revisada.');
}

// ------------------------------------------------------------
// Parcelas e Confiança
// ------------------------------------------------------------

const installments = validInstallments(ai.installments);

const confidence = {
  description: clampConfidence(ai?.confidence?.description),
  amount: clampConfidence(ai?.confidence?.amount),
  category: clampConfidence(ai?.confidence?.category),
  destination: clampConfidence(ai?.confidence?.destination),
  date: clampConfidence(ai?.confidence?.date)
};

// ------------------------------------------------------------
// Ambiguidade Estruturada e Warnings do Provider
// ------------------------------------------------------------

if (Array.isArray(ai.warnings)) {
  for (const w of ai.warnings) {
    if (typeof w === 'string' && w.trim().length > 0) {
      warnings.push(w.trim());
    }
  }
}

const aiRequiresReview = ai?.requiresReview === true;

// ------------------------------------------------------------
// Soberania da Validação Local
// ------------------------------------------------------------

let localRequiresReview = false;
if (action === 'create_benefit') {
  localRequiresReview =
    !description ||
    amount === null ||
    amount <= 0 ||
    !benefitType ||
    !competence.month ||
    !competence.year;
} else {
  localRequiresReview =
    !description ||
    amount === null ||
    amount <= 0 ||
    !category ||
    (!destination && !canonicalMethod && !canonicalAccount) ||
    !competence.month ||
    !competence.year;
}

// requiresReview=false do provider NUNCA cancela uma revisão exigida localmente
const requiresReview = localRequiresReview || aiRequiresReview || warnings.length > 0;

// ------------------------------------------------------------
// Contrato Final CorvFin
// ------------------------------------------------------------

return [{
  json: {
    success: true,
    action,
    requiresConfirmation: true,
    requiresReview,
    source,
    data: {
      description,
      merchant,
      amount: amount && amount > 0 ? amount : null,
      totalAmount: (ai.totalAmount !== undefined && ai.totalAmount !== null) ? parseMoney(ai.totalAmount) : (amount && amount > 0 ? amount : null),
      installmentAmount: (ai.installmentAmount !== undefined && ai.installmentAmount !== null) ? parseMoney(ai.installmentAmount) : null,
      amountInputMode: (ai.amountInputMode === 'installment') ? 'installment' : 'total',
      category: action === 'create_expense' ? category : null,
      destination: action === 'create_expense' ? destination : null,
      payment: action === 'create_expense' ? {
        method: canonicalMethod,
        account: canonicalAccount || null
      } : null,
      benefitType: action === 'create_benefit' ? benefitType : null,
      day,
      date,
      competence,
      installments,
      documentType:
        typeof ai.documentType === 'string' && ai.documentType.trim()
          ? ai.documentType.trim()
          : null,
      notes:
        typeof ai.notes === 'string' && ai.notes.trim()
          ? ai.notes.trim()
          : null
    },
    confidence,
    warnings: [...new Set(warnings)]
  }
}];`;

module.exports = {
  TEXT_PROMPT,
  AUDIO_PROMPT,
  IMAGE_PROMPT,
  NORMALIZER_CODE
};
