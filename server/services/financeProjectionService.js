/**
 * CorvFin V2 — Canonical Financial Projection Service (financeProjectionService.js)
 *
 * Motor canônico puro e determinístico de projeção temporal de competências.
 * Transforma o documento financeiro persistido do usuário em ocorrências
 * normalizadas para determinada competência (ano e mês).
 *
 * Princípios Arquiteturais:
 * 1. Independente de Express, DOM, browser, MongoDB e storageService;
 * 2. Imutabilidade estrita: NÃO muta o objeto `finances` recebido;
 * 3. Determinismo total: mesma entrada gera exatamente a mesma saída e chaves estáveis;
 * 4. Regra "Sem Data Definida": se não há informação temporal suficiente, date: null -> undated;
 * 5. Data nominal sem compensação bancária ou deslocamento de finais de semana;
 * 6. Benefícios estritamente segregados do fluxo bancário (summary bancário não é afetado).
 */

'use strict';

const {
  resolveOccurrenceDate,
  resolveTemporalRule,
  normalizeCompetenceKey,
  parseCanonicalDate,
  isValidCanonicalDateString,
  getPaidHistoryEntry,
  resolveNominalCivilDate,
  resolveApplicableClosingDate,
  resolveInvoiceDueDate,
  resolveCreditCardBillingCycle
} = require('./temporalUtils');

const FinanceDomain = require('../../shared/financeDomain');

/**
 * Localiza de forma determinística o destination associado a uma despesa.
 * Precedência estrita:
 * 1. destinationId explícito conferido contra finances.destinations;
 * 2. Fallback textual por nome SOMENTE se houver correspondência inequívoca (exatamente 1 match).
 * Se houver ambiguidade (mais de 1 com o mesmo nome) ou nenhum match, retorna null (fail-closed).
 *
 * @param {Object} finances
 * @param {string|null} destinationId
 * @param {string|null} destinationName
 * @returns {Object|null}
 */
function findDestination(finances, destinationId, destinationName) {
  if (!finances || !Array.isArray(finances.destinations)) return null;

  if (destinationId && typeof destinationId === 'string' && destinationId.trim()) {
    const cleanId = destinationId.trim();
    const byId = finances.destinations.find(d => d && d.id === cleanId);
    if (byId) return byId;
  }

  if (destinationName && typeof destinationName === 'string' && destinationName.trim()) {
    const cleanName = destinationName.trim().toLowerCase();
    const matches = finances.destinations.filter(d => d && String(d.name || '').trim().toLowerCase() === cleanName);
    if (matches.length === 1) {
      return matches[0];
    }
  }

  return null;
}

/**
 * Verifica se um destination é um cartão de crédito estruturado com ciclo configurado.
 *
 * @param {Object|null} dest
 * @returns {boolean}
 */
function isConfiguredCreditCard(dest) {
  if (!dest || typeof dest !== 'object') return false;
  if (dest.type !== 'credit_card') return false;
  const cDay = Number(dest.closingDay);
  const dDay = Number(dest.dueDay);
  return Number.isInteger(cDay) && cDay >= 1 && cDay <= 31 &&
         Number.isInteger(dDay) && dDay >= 1 && dDay <= 31;
}

/**
 * Determina se uma despesa é elegível à semântica de fatura de cartão de crédito.
 * Respeita estritamente a precedência de payment.method sobre o destination.
 *
 * @param {Object} v - Registro de despesa
 * @param {Object|null} dest - Destination resolvido
 * @returns {boolean}
 */
function isCreditCardInvoiceEligible(v, dest) {
  if (!v || typeof v !== 'object') return false;

  const rawMethod = v.payment?.method || v.paymentMethod;
  if (rawMethod && typeof rawMethod === 'string' && rawMethod.trim()) {
    const m = rawMethod.trim().toLowerCase();
    // 1. Método incompatível explícito: PREVALECE e impede fatura de cartão
    if (['pix', 'dinheiro', 'cartao_debito', 'transferencia', 'debito_automatico', 'boleto'].includes(m)) {
      return false;
    }
    // 2. Crédito explícito: exige destination estruturado
    if (m === 'cartao_credito') {
      return isConfiguredCreditCard(dest);
    }
  }

  // 3. Método ausente/null: consulta destination estruturado
  return isConfiguredCreditCard(dest);
}

/**
 * Sanitiza valores monetários para números finitos não-negativos arredondados em 2 casas.
 * Garante ausência total de NaN na saída.
 *
 * @param {*} val
 * @returns {number}
 */
function sanitizeAmount(val) {
  const n = Number(val);
  if (!Number.isFinite(n) || isNaN(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Mapeia status de pagamento legado/canônico para o vocabulário oficial normalizado:
 * 'paid', 'partial', 'pending'.
 *
 * @param {string} status
 * @returns {'paid'|'partial'|'pending'}
 */
function mapPaymentStatus(status) {
  if (status === 'pago' || status === 'recebido' || status === 'paid') return 'paid';
  if (status === 'parcial' || status === 'partial') return 'partial';
  return 'pending';
}

/**
 * Resolve o status de pagamento e quitação de um item financeiro para determinada competência,
 * combinando a leitura dual canônica de paidHistory (temporalUtils) e a matemática pura de liquidação (FinanceDomain).
 *
 * @param {Object} item
 * @param {number} year
 * @param {number} month
 * @param {number} amount
 * @returns {Object}
 */
function resolveItemPaymentInfo(item, year, month, amount) {
  const totalAmount = sanitizeAmount(amount);
  const hist = getPaidHistoryEntry(item && item.paidHistory, year, month);
  let paidAmount = 0;
  let isMarkedPaid = false;

  if (hist === true) {
    paidAmount = totalAmount;
    isMarkedPaid = true;
  } else if (typeof hist === 'number') {
    paidAmount = Math.max(0, Math.min(totalAmount, hist));
  } else if (typeof hist === 'object' && hist !== null) {
    const rawPaid = hist.paidAmount !== undefined ? Number(hist.paidAmount) : (hist.amount !== undefined ? Number(hist.amount) : 0);
    paidAmount = Math.max(0, Math.min(totalAmount, isNaN(rawPaid) ? 0 : rawPaid));
  } else if (hist === undefined && (item?.status === 'pago' || item?.status === 'recebido') && (!item.paidHistory || Object.keys(item.paidHistory).length === 0)) {
    // Retrocompatibilidade: registros legados com status binário pago/recebido sem chave de competência
    paidAmount = totalAmount;
    isMarkedPaid = true;
  } else {
    paidAmount = 0;
  }

  return FinanceDomain.calculatePaymentSettlement(totalAmount, paidAmount, { isMarkedPaid });
}

/**
 * Valida os parâmetros de competência ano e mês. Fail-closed se inválidos.
 *
 * @param {*} year
 * @param {*} month
 */
function validatePeriod(year, month) {
  const y = Number(year);
  const m = Number(month);

  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    const err = new Error(`INVALID_PROJECTION_PERIOD: ano inválido (${year}). Deve ser um inteiro entre 2000 e 2100.`);
    err.status = 400;
    err.code = 'INVALID_PROJECTION_PERIOD';
    throw err;
  }

  if (!Number.isInteger(m) || m < 1 || m > 12) {
    const err = new Error(`INVALID_PROJECTION_PERIOD: mês inválido (${month}). Deve ser um inteiro entre 1 e 12.`);
    err.status = 400;
    err.code = 'INVALID_PROJECTION_PERIOD';
    throw err;
  }

  return { year: y, month: m };
}

/**
 * Projeta o salário da competência a partir de `profile.baseSalary` e override em `incomes`.
 *
 * @param {Object} finances - Documento financeiro do usuário
 * @param {number} year - Ano
 * @param {number} month - Mês
 * @returns {Object|null}
 */
function projectSalary(finances, year, month) {
  if (!finances || typeof finances !== 'object') return null;

  const canonicalKey = normalizeCompetenceKey(year, month);
  const legacyKey = `${year}-${parseInt(month, 10)}`;

  let salaryValue = undefined;
  if (finances.incomes && typeof finances.incomes === 'object' && !Array.isArray(finances.incomes)) {
    if (finances.incomes[canonicalKey] !== undefined) {
      salaryValue = finances.incomes[canonicalKey];
    } else if (finances.incomes[legacyKey] !== undefined) {
      salaryValue = finances.incomes[legacyKey];
    }
  }

  if (salaryValue === undefined) {
    salaryValue = finances.profile?.baseSalary;
  }

  const amount = sanitizeAmount(salaryValue);
  if (amount <= 0) return null;

  let date = null;
  let nominalDay = null;
  let wasClamped = false;
  let wasAdjusted = false;
  let competenceKept = true;
  let temporalRuleType = null;
  let weekendAdjustment = null;

  const sp = finances.profile?.salaryPayment;
  if (sp && typeof sp === 'object' && !Array.isArray(sp)) {
    const res = resolveTemporalRule(sp, year, month);
    if (res && res.date) {
      date = res.date;
      nominalDay = res.nominalDay;
      wasClamped = res.wasClamped;
      wasAdjusted = res.wasAdjusted;
      competenceKept = res.competenceKept;
      temporalRuleType = res.type;
      weekendAdjustment = res.weekendAdjustment || null;
    }
  }

  const occurrenceKey = `salary_${canonicalKey}`;
  return {
    id: occurrenceKey,
    sourceId: 'profile',
    sourceType: 'salary',
    eventKind: 'income',
    direction: 'inflow',
    affectsCashflow: true,
    date,
    nominalDay,
    wasClamped,
    wasAdjusted,
    competenceKept,
    temporalRuleType,
    weekendAdjustment,
    competence: canonicalKey,
    amount,
    status: null,
    description: 'Salário',
    occurrenceKey
  };
}

/**
 * Projeta as despesas fixas ativas para a competência.
 *
 * @param {Object} finances
 * @param {number} year
 * @param {number} month
 * @returns {Array<Object>}
 */
function projectFixedExpenses(finances, year, month) {
  if (!finances || !Array.isArray(finances.fixed)) return [];

  const target = year * 12 + month;
  const canonicalKey = normalizeCompetenceKey(year, month);
  const out = [];

  for (let i = 0; i < finances.fixed.length; i++) {
    const f = finances.fixed[i];
    if (!f || typeof f !== 'object') continue;

    // 1. Encerramento explícito
    if (f.endedFrom && typeof f.endedFrom === 'object') {
      const endTarget = Number(f.endedFrom.year) * 12 + Number(f.endedFrom.month);
      if (target >= endTarget) continue;
    }

    // 2. Recorrência estruturada
    if (f.temporal?.recurrence && typeof f.temporal.recurrence === 'object') {
      const rec = f.temporal.recurrence;
      if (rec.type === 'date' && rec.endYear && rec.endMonth) {
        const dateEndTarget = Number(rec.endYear) * 12 + Number(rec.endMonth);
        if (target > dateEndTarget) continue;
      } else if (rec.type === 'count' && rec.count) {
        const firstVersion = (Array.isArray(f.versions) && f.versions.length > 0) ? f.versions[0] : null;
        const startY = Number(firstVersion?.year || f.startYear || year);
        const startM = Number(firstVersion?.month || f.startMonth || 1);
        const count = Math.max(1, parseInt(rec.count, 10) || 1);
        const maxActiveTarget = (startY * 12 + startM) + count - 1;
        if (target > maxActiveTarget) continue;
      }
    }

    // 3. Resolução de versão ativa e valor
    let activeVersion = null;
    let activeAmount = Number(f.amount || 0);

    if (Array.isArray(f.versions) && f.versions.length > 0) {
      const sorted = [...f.versions].sort((a, b) => (Number(a.year) * 12 + Number(a.month)) - (Number(b.year) * 12 + Number(b.month)));
      for (const v of sorted) {
        if ((Number(v.year) * 12 + Number(v.month)) <= target) {
          activeVersion = v;
        } else {
          break;
        }
      }
      if (!activeVersion) continue; // Ainda não iniciou nesta competência
      activeAmount = Number(activeVersion.amount || 0);
    } else {
      // Legado sem versions
      if (f.startYear && f.startMonth) {
        const sTarget = Number(f.startYear) * 12 + Number(f.startMonth);
        if (target < sTarget) continue;
      }
    }

    const amount = sanitizeAmount(activeAmount);

    // 4. Resolução de data civil a partir de dueDay
    let date = null;
    let nominalDay = null;
    let wasClamped = false;

    if (f.dueDay !== null && f.dueDay !== undefined && f.dueDay !== '') {
      const dueDayNum = Number(f.dueDay);
      if (Number.isInteger(dueDayNum) && dueDayNum >= 1 && dueDayNum <= 31) {
        const occ = resolveOccurrenceDate(year, month, dueDayNum);
        if (occ) {
          date = occ.date;
          nominalDay = occ.nominalDay;
          wasClamped = occ.wasClamped;
        }
      }
    }

    // 5. Status e paidHistory
    const payInfo = resolveItemPaymentInfo(f, year, month, amount);
    const sourceId = f.id != null ? String(f.id) : `fix_${i}`;
    const occurrenceKey = `fixed_${sourceId}_${canonicalKey}`;

    out.push({
      id: occurrenceKey,
      sourceId,
      sourceType: 'fixed_expense',
      eventKind: 'cashflow',
      direction: 'outflow',
      affectsCashflow: true,
      date,
      nominalDay,
      wasClamped,
      competence: canonicalKey,
      amount,
      status: mapPaymentStatus(payInfo.status),
      paidAmount: sanitizeAmount(payInfo.paidAmount),
      remainingAmount: sanitizeAmount(payInfo.remainingAmount),
      description: f.name || 'Despesa Fixa',
      dueDay: f.dueDay != null && f.dueDay !== '' ? Number(f.dueDay) : null,
      paymentMethod: f.payment?.method || null,
      category: f.group || null,
      destination: f.payment?.account || f.destination || null,
      occurrenceKey
    });
  }

  return out;
}

/**
 * Projeta as despesas variáveis e parceladas para a competência.
 *
 * @param {Object} finances
 * @param {number} year
 * @param {number} month
 * @returns {Array<Object>}
 */
/**
 * Resolve determinística e canonicamente a competência inicial de uma despesa variável,
 * utilizando ESTRITAMENTE evidências confiáveis e persistidas no registro.
 *
 * Precedência:
 * 1. startYear e startMonth explícitos e válidos (2000..2100 e 1..12).
 * 2. transactionDate canônica no formato YYYY-MM-DD (extrai year e month da compra/transação civil).
 * 3. year e month legados explícitos e válidos (2000..2100 e 1..12).
 * 4. Incerteza preservada: se nenhuma das evidências confiáveis acima estiver presente,
 *    retorna null.
 *
 * REGRAS CANÔNICAS (FAIL-CLOSED):
 * - NUNCA assume janeiro (sMonth = 1).
 * - NUNCA assume o mês consultado.
 * - NUNCA usa dueDay como transactionDate ou como mês de compra.
 * - NUNCA usa createdAt indiscriminadamente.
 *
 * @param {Object} v Registro de despesa variável
 * @returns {{ startYear: number, startMonth: number } | null}
 */
function resolveVariableStartCompetence(v) {
  if (!v || typeof v !== 'object') return null;

  // 1. startYear e startMonth estruturados
  if (v.startYear !== undefined && v.startYear !== null && v.startMonth !== undefined && v.startMonth !== null) {
    const sy = Number(v.startYear);
    const sm = Number(v.startMonth);
    if (Number.isInteger(sy) && sy >= 2000 && sy <= 2100 && Number.isInteger(sm) && sm >= 1 && sm <= 12) {
      return { startYear: sy, startMonth: sm };
    }
  }

  // 2. transactionDate canônica válida (YYYY-MM-DD)
  if (v.transactionDate && typeof v.transactionDate === 'string' && isValidCanonicalDateString(v.transactionDate)) {
    const parsed = parseCanonicalDate(v.transactionDate);
    if (parsed && Number.isInteger(parsed.year) && parsed.year >= 2000 && parsed.year <= 2100 && Number.isInteger(parsed.month) && parsed.month >= 1 && parsed.month <= 12) {
      return { startYear: parsed.year, startMonth: parsed.month };
    }
  }

  // 3. year e month legados V1 comprovados
  if (v.year !== undefined && v.year !== null && v.month !== undefined && v.month !== null) {
    const ly = Number(v.year);
    const lm = Number(v.month);
    if (Number.isInteger(ly) && ly >= 2000 && ly <= 2100 && Number.isInteger(lm) && lm >= 1 && lm <= 12) {
      return { startYear: ly, startMonth: lm };
    }
  }

  // 4. Sem evidência temporal determinística: preserva incerteza (retorna null)
  return null;
}

function projectVariableExpenses(finances, year, month) {
  if (!finances || !Array.isArray(finances.variable)) return [];

  const target = year * 12 + month;
  const canonicalKey = normalizeCompetenceKey(year, month);
  const out = [];

  for (let i = 0; i < finances.variable.length; i++) {
    const v = finances.variable[i];
    if (!v || typeof v !== 'object') continue;

    const sourceId = v.id != null ? String(v.id) : `var_${i}`;
    const dest = findDestination(finances, v.destinationId, v.payment?.account || v.destination);
    const invoiceEligible = isCreditCardInvoiceEligible(v, dest);

    let count = 1;
    if (v.installments !== undefined && v.installments !== null) {
      count = Math.max(1, parseInt(v.installments, 10) || 1);
    } else if (v.endYear && v.endMonth && v.startYear && v.startMonth) {
      count = Math.max(1, (Number(v.endYear) * 12 + Number(v.endMonth)) - (Number(v.startYear) * 12 + Number(v.startMonth)) + 1);
    }

    // 1. TRANSACTION EVENT (No dia civil real da compra)
    // Aparece visualmente no dia da compra para cartões de crédito configurados (affectsCashflow = false)
    if (v.transactionDate && isValidCanonicalDateString(v.transactionDate)) {
      const parsedTx = parseCanonicalDate(v.transactionDate);
      if (parsedTx && parsedTx.year === year && parsedTx.month === month) {
        // Se for elegível à fatura ou for cartão de crédito estruturado
        if (invoiceEligible || isConfiguredCreditCard(dest)) {
          let totalPurchaseAmount = sanitizeAmount(v.totalAmount !== undefined ? v.totalAmount : (v.amountInputMode === 'total' ? v.amount : (Number(v.amount || 0) * count)));
          if (totalPurchaseAmount <= 0 && v.amount) totalPurchaseAmount = sanitizeAmount(v.amount);
          const instAmount = sanitizeAmount(v.installmentAmount !== undefined ? v.installmentAmount : (count > 1 ? (totalPurchaseAmount / count) : totalPurchaseAmount));
          const txOccurrenceKey = `tx_${sourceId}_${v.transactionDate}`;

          out.push({
            id: txOccurrenceKey,
            sourceId,
            sourceType: 'variable_expense',
            eventKind: 'transaction',
            direction: 'outflow',
            affectsCashflow: false,
            date: v.transactionDate,
            nominalDay: parsedTx.day,
            competence: canonicalKey,
            amount: (count > 1 && totalPurchaseAmount > 0) ? totalPurchaseAmount : (totalPurchaseAmount || sanitizeAmount(v.amount)),
            purchaseAmount: (count > 1 && totalPurchaseAmount > 0) ? totalPurchaseAmount : (totalPurchaseAmount || sanitizeAmount(v.amount)),
            installmentAmount: count > 1 ? instAmount : null,
            installmentIndex: 1,
            installmentTotal: count,
            status: null,
            description: v.name || v.description || 'Compra no Cartão',
            dueDay: v.dueDay != null && v.dueDay !== '' ? Number(v.dueDay) : null,
            transactionDate: v.transactionDate,
            paymentMethod: v.payment?.method || v.paymentMethod || 'cartao_credito',
            category: v.group || v.category || null,
            destination: dest ? dest.name : (v.payment?.account || v.destination || null),
            destinationId: dest ? dest.id : (v.destinationId || null),
            destinationType: dest?.type || 'credit_card',
            occurrenceKey: txOccurrenceKey
          });
        }
      }
    }

    // Se a despesa é elegível à fatura de cartão de crédito, seu cashflow é projetado
    // EXCLUSIVAMENTE via projectCreditCardInvoices no dia do vencimento da fatura (Zero Dupla Contabilização!)
    if (invoiceEligible) {
      continue;
    }

    // 2. CASHFLOW REGULAR / LEGADO (Para despesas sem fatura agregada: dinheiro, pix, débito, boleto, legacy)
    const startComp = resolveVariableStartCompetence(v);
    if (!startComp) {
      continue;
    }

    const { startYear: sYear, startMonth: sMonth } = startComp;
    const sTarget = sYear * 12 + sMonth;
    const eTarget = sTarget + count - 1;
    if (target < sTarget || target > eTarget) continue;

    const installmentIndex = target - sTarget + 1;
    const installmentTotal = count;

    const resolvedAmounts = FinanceDomain.resolveInstallmentAmounts(v, year, month);
    const amount = sanitizeAmount(resolvedAmounts.currentInstallmentAmount);

    let date = null;
    let nominalDay = null;
    let wasClamped = false;

    if (v.dueDay !== null && v.dueDay !== undefined && v.dueDay !== '') {
      const dueDayNum = Number(v.dueDay);
      if (Number.isInteger(dueDayNum) && dueDayNum >= 1 && dueDayNum <= 31) {
        const occ = resolveOccurrenceDate(year, month, dueDayNum);
        if (occ) {
          date = occ.date;
          nominalDay = occ.nominalDay;
          wasClamped = occ.wasClamped;
        }
      }
    } else if (installmentTotal <= 1 && v.transactionDate) {
      const parsedTx = parseCanonicalDate(v.transactionDate);
      if (parsedTx && parsedTx.year === year && parsedTx.month === month) {
        date = v.transactionDate;
        nominalDay = parsedTx.day;
      }
    }

    const payInfo = resolveItemPaymentInfo(v, year, month, amount);
    const occurrenceKey = `var_${sourceId}_inst_${installmentIndex}_${canonicalKey}`;

    out.push({
      id: occurrenceKey,
      sourceId,
      sourceType: 'variable_expense',
      eventKind: 'cashflow',
      direction: 'outflow',
      affectsCashflow: true,
      date,
      nominalDay,
      wasClamped,
      competence: canonicalKey,
      amount,
      status: mapPaymentStatus(payInfo.status),
      paidAmount: sanitizeAmount(payInfo.paidAmount),
      remainingAmount: sanitizeAmount(payInfo.remainingAmount),
      description: v.name || v.description || 'Despesa Variável',
      installmentIndex,
      installmentTotal,
      dueDay: v.dueDay != null && v.dueDay !== '' ? Number(v.dueDay) : null,
      transactionDate: v.transactionDate || null,
      paymentMethod: v.payment?.method || v.paymentMethod || null,
      category: v.group || v.category || null,
      destination: v.payment?.account || v.destination || null,
      occurrenceKey
    });
  }

  return out;
}

/**
 * Projeta as faturas agregadas de cartão de crédito para a competência (ano, mês).
 * Consolida compras únicas e parcelas que vencem no período civil consultado.
 *
 * Precedência estrita de obrigações (Ajuste 1):
 * 1. installmentSchedule persistido quando válido e completo;
 * 2. Novo billing cycle derivado de transactionDate + destination estruturado;
 * 3. Fail-closed se inconclusivo.
 *
 * Agregação e Identidade (Ajuste 3):
 * - Com destinationId: `${dest.id}_${dueDate}`
 * - Sem destinationId: `${cleanSlug}_${dueDate}` SOMENTE com match inequívoco.
 * - Ambiguidade: fail-closed para agregação.
 *
 * @param {Object} finances
 * @param {number} year
 * @param {number} month
 * @returns {Array<Object>}
 */
function projectCreditCardInvoices(finances, year, month) {
  if (!finances || !Array.isArray(finances.variable)) return [];

  const canonicalKey = normalizeCompetenceKey(year, month);
  const invoicesMap = new Map();

  for (let i = 0; i < finances.variable.length; i++) {
    const v = finances.variable[i];
    if (!v || typeof v !== 'object') continue;

    const dest = findDestination(finances, v.destinationId, v.payment?.account || v.destination);
    if (!isCreditCardInvoiceEligible(v, dest)) {
      continue;
    }

    const sourceId = v.id != null ? String(v.id) : `var_${i}`;
    const destId = dest.id || dest.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const cDay = Number(dest.closingDay);
    const dDay = Number(dest.dueDay);

    let count = 1;
    if (v.installments !== undefined && v.installments !== null) {
      count = Math.max(1, parseInt(v.installments, 10) || 1);
    } else if (v.endYear && v.endMonth && v.startYear && v.startMonth) {
      count = Math.max(1, (Number(v.endYear) * 12 + Number(v.endMonth)) - (Number(v.startYear) * 12 + Number(v.startMonth)) + 1);
    }

    const hasSchedule = (v.installmentSchedule && typeof v.installmentSchedule === 'object' && !Array.isArray(v.installmentSchedule));
    const schedKeys = hasSchedule ? Object.keys(v.installmentSchedule).sort() : [];

    if (hasSchedule && schedKeys.length > 0) {
      // PRECEDÊNCIA 1: installmentSchedule persistido como autoridade primária
      // Cada chave YYYY-MM do schedule define a competência da fatura
      for (let idx = 0; idx < schedKeys.length; idx++) {
        const compKey = schedKeys[idx];
        const [kYear, kMonth] = compKey.split('-').map(Number);
        if (!Number.isInteger(kYear) || !Number.isInteger(kMonth) || kMonth < 1 || kMonth > 12) continue;

        // O vencimento nominal da fatura dessa competência ocorre no dueDay do cartão no respectivo mês
        const occ = resolveNominalCivilDate(kYear, kMonth, dDay);
        if (!occ) continue;

        if (occ.year === year && occ.month === month) {
          const rawSchedAmt = Number(v.installmentSchedule[compKey]);
          const itemAmt = sanitizeAmount(Number.isFinite(rawSchedAmt) ? rawSchedAmt : (v.amount || 0));
          if (itemAmt <= 0) continue;

          const invoiceKey = `${destId}_${occ.date}`;
          if (!invoicesMap.has(invoiceKey)) {
            invoicesMap.set(invoiceKey, {
              dest,
              date: occ.date,
              nominalDay: occ.day,
              items: []
            });
          }

          invoicesMap.get(invoiceKey).items.push({
            sourceId,
            description: v.name || v.description || 'Item de Fatura',
            amount: itemAmt,
            installmentIndex: idx + 1,
            installmentTotal: schedKeys.length,
            transactionDate: v.transactionDate || null,
            category: v.group || v.category || null
          });
        }
      }
    } else if (v.transactionDate && isValidCanonicalDateString(v.transactionDate)) {
      // PRECEDÊNCIA 2: Novo billing cycle civil a partir de transactionDate + closingDay + dueDay
      const cycle1 = resolveCreditCardBillingCycle(v.transactionDate, cDay, dDay);
      if (!cycle1) continue;

      if (count <= 1) {
        // Compra única à vista no crédito
        if (cycle1.dueYear === year && cycle1.dueMonth === month) {
          const itemAmt = sanitizeAmount(v.amount);
          if (itemAmt > 0) {
            const invoiceKey = `${destId}_${cycle1.invoiceDueDate}`;
            if (!invoicesMap.has(invoiceKey)) {
              invoicesMap.set(invoiceKey, {
                dest,
                date: cycle1.invoiceDueDate,
                nominalDay: cycle1.dueDay,
                items: []
              });
            }
            invoicesMap.get(invoiceKey).items.push({
              sourceId,
              description: v.name || v.description || 'Compra no Cartão',
              amount: itemAmt,
              installmentIndex: 1,
              installmentTotal: 1,
              transactionDate: v.transactionDate,
              category: v.group || v.category || null
            });
          }
        }
      } else {
        // Compra parcelada sem schedule pré-gravado: deriva cada ciclo k
        for (let k = 1; k <= count; k++) {
          let kDueDateObj = null;
          if (k === 1) {
            kDueDateObj = {
              date: cycle1.invoiceDueDate,
              year: cycle1.dueYear,
              month: cycle1.dueMonth,
              day: cycle1.dueDay
            };
          } else {
            const cMonthIdx = (cycle1.closingMonth - 1) + (k - 1);
            const kClosingYear = cycle1.closingYear + Math.floor(cMonthIdx / 12);
            const kClosingMonth = (cMonthIdx % 12) + 1;
            const kClosingDate = resolveNominalCivilDate(kClosingYear, kClosingMonth, cDay);
            if (kClosingDate) {
              kDueDateObj = resolveInvoiceDueDate(kClosingDate.date, dDay);
            }
          }

          if (kDueDateObj && kDueDateObj.year === year && kDueDateObj.month === month) {
            const resolvedAmounts = FinanceDomain.resolveInstallmentAmounts(v, kDueDateObj.year, kDueDateObj.month);
            const itemAmt = sanitizeAmount(resolvedAmounts.currentInstallmentAmount);
            if (itemAmt > 0) {
              const invoiceKey = `${destId}_${kDueDateObj.date}`;
              if (!invoicesMap.has(invoiceKey)) {
                invoicesMap.set(invoiceKey, {
                  dest,
                  date: kDueDateObj.date,
                  nominalDay: kDueDateObj.day,
                  items: []
                });
              }
              invoicesMap.get(invoiceKey).items.push({
                sourceId,
                description: v.name || v.description || 'Compra Parcelada',
                amount: itemAmt,
                installmentIndex: k,
                installmentTotal: count,
                transactionDate: v.transactionDate,
                category: v.group || v.category || null
              });
            }
          }
        }
      }
    }
    // PRECEDÊNCIA 3: Se não possui schedule nem transactionDate confiável -> Fail-Closed (não fabrica invoice)
  }

  // GERAÇÃO DOS EVENTOS CONSOLIDADOS DE FATURA
  const out = [];
  for (const [invoiceKey, group] of invoicesMap.entries()) {
    const totalAmount = sanitizeAmount(group.items.reduce((s, it) => s + it.amount, 0));
    if (totalAmount <= 0) continue;

    const eventId = `inv_${invoiceKey}`;
    const occurrenceKey = `invoice_${invoiceKey}`;

    out.push({
      id: eventId,
      sourceId: group.dest.id || group.dest.name,
      sourceType: 'credit_card_invoice',
      eventKind: 'invoice',
      direction: 'outflow',
      affectsCashflow: true,
      date: group.date,
      nominalDay: group.nominalDay,
      competence: canonicalKey,
      amount: totalAmount,
      description: `Fatura ${group.dest.name}`,
      destination: group.dest.name,
      destinationId: group.dest.id || null,
      destinationType: 'credit_card',
      itemCount: group.items.length,
      sourceItems: group.items,
      status: 'pending',
      occurrenceKey
    });
  }

  return out;
}

/**
 * Projeta as rendas extras ativas para a competência.
 *
 * @param {Object} finances
 * @param {number} year
 * @param {number} month
 * @returns {Array<Object>}
 */
function projectExtras(finances, year, month) {
  if (!finances || !Array.isArray(finances.extras)) return [];

  const target = year * 12 + month;
  const canonicalKey = normalizeCompetenceKey(year, month);
  const out = [];

  for (let i = 0; i < finances.extras.length; i++) {
    const e = finances.extras[i];
    if (!e || typeof e !== 'object') continue;

    let sYear, sMonth, eYear, eMonth;
    if (e.startYear !== undefined && e.startMonth !== undefined) {
      sYear = Number(e.startYear);
      sMonth = Number(e.startMonth);
      eYear = e.endYear !== undefined ? Number(e.endYear) : sYear;
      eMonth = e.endMonth !== undefined ? Number(e.endMonth) : sMonth;
    } else if (e.receiveDate) {
      const parsed = parseCanonicalDate(e.receiveDate);
      if (parsed) {
        sYear = parsed.year;
        sMonth = parsed.month;
        eYear = parsed.year;
        eMonth = parsed.month;
      }
    } else if (e.year !== undefined && e.month !== undefined) {
      sYear = Number(e.year);
      sMonth = Number(e.month);
      eYear = sYear;
      eMonth = sMonth;
    } else if (e.date) {
      const parsed = parseCanonicalDate(e.date);
      if (parsed) {
        sYear = parsed.year;
        sMonth = parsed.month;
        eYear = parsed.year;
        eMonth = parsed.month;
      }
    }

    if (sYear === undefined || sMonth === undefined) continue;

    const sTarget = sYear * 12 + sMonth;
    const eTarget = eYear * 12 + eMonth;
    if (target < sTarget || target > eTarget) continue;

    const amount = sanitizeAmount(e.amount);

    let date = null;
    let nominalDay = null;
    let wasClamped = false;

    if (e.receiveDate) {
      const parsed = parseCanonicalDate(e.receiveDate);
      if (parsed && parsed.year === year && parsed.month === month) {
        date = e.receiveDate;
        nominalDay = parsed.day;
      }
    } else if (e.receiveDay !== undefined && e.receiveDay !== null && e.receiveDay !== '') {
      const rDayNum = Number(e.receiveDay);
      if (Number.isInteger(rDayNum) && rDayNum >= 1 && rDayNum <= 31) {
        const occ = resolveOccurrenceDate(year, month, rDayNum);
        if (occ) {
          date = occ.date;
          nominalDay = occ.nominalDay;
          wasClamped = occ.wasClamped;
        }
      }
    }

    const payInfo = resolveItemPaymentInfo(e, year, month, amount);
    const sourceId = e.id != null ? String(e.id) : `ext_${i}`;
    const occurrenceKey = `extra_${sourceId}_${canonicalKey}`;

    out.push({
      id: occurrenceKey,
      sourceId,
      sourceType: 'extra_income',
      eventKind: 'income',
      direction: 'inflow',
      affectsCashflow: true,
      date,
      nominalDay,
      wasClamped,
      competence: canonicalKey,
      amount,
      status: mapPaymentStatus(payInfo.status),
      paidAmount: sanitizeAmount(payInfo.paidAmount),
      remainingAmount: sanitizeAmount(payInfo.remainingAmount),
      description: e.title || e.description || e.name || 'Renda Extra',
      source: e.source || e.sender || null,
      occurrenceKey
    });
  }

  return out;
}

/**
 * Projeta os recebíveis de devedores ativos para a competência.
 *
 * @param {Object} finances
 * @param {number} year
 * @param {number} month
 * @returns {Array<Object>}
 */
function projectDebtors(finances, year, month) {
  if (!finances || !Array.isArray(finances.debtors)) return [];

  const target = year * 12 + month;
  const canonicalKey = normalizeCompetenceKey(year, month);
  const out = [];

  for (let i = 0; i < finances.debtors.length; i++) {
    const d = finances.debtors[i];
    if (!d || typeof d !== 'object') continue;

    const sYear = Number(d.startYear || year);
    const sMonth = Number(d.startMonth || 1);
    const sTarget = sYear * 12 + sMonth;

    let count = 1;
    if (d.installments !== undefined && d.installments !== null) {
      count = Math.max(1, parseInt(d.installments, 10) || 1);
    } else if (d.startYear && d.endYear && d.startMonth && d.endMonth) {
      count = Math.max(1, (Number(d.endYear) * 12 + Number(d.endMonth)) - sTarget + 1);
    }

    const eTarget = sTarget + count - 1;
    if (target < sTarget || target > eTarget) continue;

    const installmentIndex = target - sTarget + 1;
    const installmentTotal = count;
    const amount = sanitizeAmount(d.amount);

    let date = null;
    let nominalDay = null;
    let wasClamped = false;

    if (d.receiveDay !== undefined && d.receiveDay !== null && d.receiveDay !== '') {
      const rDayNum = Number(d.receiveDay);
      if (Number.isInteger(rDayNum) && rDayNum >= 1 && rDayNum <= 31) {
        const occ = resolveOccurrenceDate(year, month, rDayNum);
        if (occ) {
          date = occ.date;
          nominalDay = occ.nominalDay;
          wasClamped = occ.wasClamped;
        }
      }
    }

    const payInfo = resolveItemPaymentInfo(d, year, month, amount);
    const sourceId = d.id != null ? String(d.id) : `deb_${i}`;
    const occurrenceKey = `debtor_${sourceId}_${canonicalKey}`;

    const debtorDisplayName = d.debtorName || d.name || 'Devedor';
    const description = d.title ? `${debtorDisplayName} • ${d.title}` : debtorDisplayName;

    out.push({
      id: occurrenceKey,
      sourceId,
      sourceType: 'debtor_receivable',
      eventKind: 'income',
      direction: 'inflow',
      affectsCashflow: true,
      date,
      nominalDay,
      wasClamped,
      competence: canonicalKey,
      amount,
      status: mapPaymentStatus(payInfo.status),
      paidAmount: sanitizeAmount(payInfo.paidAmount),
      remainingAmount: sanitizeAmount(payInfo.remainingAmount),
      description,
      debtorName: debtorDisplayName,
      installmentIndex,
      installmentTotal,
      countInTotal: FinanceDomain.isDebtorCountedInTotal(d),
      destination: d.destination || null,
      occurrenceKey
    });
  }

  return out;
}

/**
 * Projeta o domínio separado de benefícios (VA / VR).
 * Não contamina o resumo bancário do período.
 *
 * @param {Object} finances
 * @param {number} year
 * @param {number} month
 * @returns {Object} { events: [], undated: [], summary: { inflow, outflow, net } }
 */
function projectBenefits(finances, year, month) {
  const canonicalKey = normalizeCompetenceKey(year, month);
  const events = [];
  const undated = [];

  if (finances && Array.isArray(finances.benefitTransactions)) {
    for (let i = 0; i < finances.benefitTransactions.length; i++) {
      const bt = finances.benefitTransactions[i];
      if (!bt || typeof bt !== 'object') continue;
      if (Number(bt.year) !== year || Number(bt.month) !== month) continue;

      const amount = sanitizeAmount(bt.amount);
      if (amount <= 0) continue;

      let date = null;
      let nominalDay = null;
      let wasClamped = false;

      if (bt.day !== undefined && bt.day !== null && bt.day !== '') {
        const dayNum = Number(bt.day);
        if (Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31) {
          const occ = resolveOccurrenceDate(year, month, dayNum);
          if (occ) {
            date = occ.date;
            nominalDay = occ.nominalDay;
            wasClamped = occ.wasClamped;
          }
        }
      }

      const sourceId = bt.id != null ? String(bt.id) : `bt_${i}`;
      const occurrenceKey = `benefit_${sourceId}_${canonicalKey}`;

      const item = {
        id: occurrenceKey,
        sourceId,
        sourceType: 'benefit_transaction',
        direction: 'outflow',
        date,
        nominalDay,
        wasClamped,
        competence: canonicalKey,
        amount,
        status: 'paid',
        description: bt.description || 'Gasto Benefício',
        benefitCategory: bt.category || bt.type || null,
        occurrenceKey
      };

      if (date) {
        events.push(item);
      } else {
        undated.push(item);
      }
    }
  }

  // Se houver recarga/base mensal de benefício configurada
  if (finances && finances.benefitsConfig && typeof finances.benefitsConfig === 'object') {
    const rawCredit = finances.benefitsConfig.amount != null
      ? finances.benefitsConfig.amount
      : (Number(finances.benefitsConfig.va || 0) + Number(finances.benefitsConfig.vr || 0));
    const creditAmount = sanitizeAmount(rawCredit);

    if (creditAmount > 0) {
      const occurrenceKey = `benefit_credit_${canonicalKey}`;
      let date = null;
      let nominalDay = null;
      let wasClamped = false;
      let wasAdjusted = false;
      let competenceKept = true;
      let temporalRuleType = null;
      let weekendAdjustment = null;

      const cr = finances.benefitsConfig.creditRule;
      if (cr && typeof cr === 'object' && !Array.isArray(cr)) {
        const res = resolveTemporalRule(cr, year, month);
        if (res && res.date) {
          date = res.date;
          nominalDay = res.nominalDay;
          wasClamped = res.wasClamped;
          wasAdjusted = res.wasAdjusted;
          competenceKept = res.competenceKept;
          temporalRuleType = res.type;
          weekendAdjustment = res.weekendAdjustment || null;
        }
      }

      const creditItem = {
        id: occurrenceKey,
        sourceId: 'benefitsConfig',
        sourceType: 'benefit_credit',
        direction: 'inflow',
        date,
        nominalDay,
        wasClamped,
        wasAdjusted,
        competenceKept,
        temporalRuleType,
        weekendAdjustment,
        competence: canonicalKey,
        amount: creditAmount,
        status: null,
        description: 'Crédito Benefício (VA/VR)',
        occurrenceKey
      };

      if (date) {
        events.push(creditItem);
      } else {
        undated.push(creditItem);
      }
    }
  }

  // Ordenação determinística de benefícios
  events.sort((a, b) => a.date.localeCompare(b.date) || a.occurrenceKey.localeCompare(b.occurrenceKey));
  undated.sort((a, b) => {
    const dirA = a.direction === 'inflow' ? 0 : 1;
    const dirB = b.direction === 'inflow' ? 0 : 1;
    if (dirA !== dirB) return dirA - dirB;
    return a.occurrenceKey.localeCompare(b.occurrenceKey);
  });

  const allBenefits = [...events, ...undated];
  const inflow = sanitizeAmount(allBenefits.filter(b => b.direction === 'inflow').reduce((s, b) => s + b.amount, 0));
  const outflow = sanitizeAmount(allBenefits.filter(b => b.direction === 'outflow').reduce((s, b) => s + b.amount, 0));
  const net = Math.round((inflow - outflow) * 100) / 100;

  return {
    events,
    undated,
    summary: {
      inflow,
      outflow,
      net
    }
  };
}

/**
 * Função de ordenação determinística para eventos bancários datados.
 */
const SOURCE_TYPE_ORDER = {
  salary: 1,
  extra_income: 2,
  debtor_receivable: 3,
  fixed_expense: 4,
  variable_expense: 5,
  credit_card_invoice: 6
};

function compareEvents(a, b) {
  // 1. Data crescente
  const dateDiff = a.date.localeCompare(b.date);
  if (dateDiff !== 0) return dateDiff;

  // 2. Direção: Inflow (entradas) antes de Outflow (saídas)
  const dirA = a.direction === 'inflow' ? 0 : 1;
  const dirB = b.direction === 'inflow' ? 0 : 1;
  if (dirA !== dirB) return dirA - dirB;

  // 3. Ordem estrutural de tipo
  const orderA = SOURCE_TYPE_ORDER[a.sourceType] || 99;
  const orderB = SOURCE_TYPE_ORDER[b.sourceType] || 99;
  if (orderA !== orderB) return orderA - orderB;

  // 4. Critério final estável de desempate
  return a.occurrenceKey.localeCompare(b.occurrenceKey);
}

function compareUndated(a, b) {
  const dirA = a.direction === 'inflow' ? 0 : 1;
  const dirB = b.direction === 'inflow' ? 0 : 1;
  if (dirA !== dirB) return dirA - dirB;

  const orderA = SOURCE_TYPE_ORDER[a.sourceType] || 99;
  const orderB = SOURCE_TYPE_ORDER[b.sourceType] || 99;
  if (orderA !== orderB) return orderA - orderB;

  return a.occurrenceKey.localeCompare(b.occurrenceKey);
}

/**
 * Motor Canônico de Projeção Financeira Mensal (Lote A2).
 *
 * Recebe o documento financeiro já carregado e retorna todas as ocorrências
 * da competência organizadas em:
 * - events: ocorrências datadas reais/resolvidas;
 * - undated: ocorrências sem data civil definida (legado ou sem dia configurado);
 * - summary: resultado financeiro bancário previsto/registrado do período (inflow, outflow, net);
 * - benefits: agrupamento segregado de benefícios.
 *
 * @param {Object} finances - Documento financeiro do usuário (NÃO mutado)
 * @param {number|string} year - Ano da competência (2000..2100)
 * @param {number|string} month - Mês da competência (1..12)
 * @returns {Object} Estrutura normalizada de projeção temporal
 */
function projectFinancialMonth(finances, year, month) {
  const { year: y, month: m } = validatePeriod(year, month);
  const competence = normalizeCompetenceKey(y, m);

  const rawSalary = projectSalary(finances, y, m);
  const rawFixed = projectFixedExpenses(finances, y, m);
  const rawVariable = projectVariableExpenses(finances, y, m);
  const rawInvoices = projectCreditCardInvoices(finances, y, m);
  const rawExtras = projectExtras(finances, y, m);
  const rawDebtors = projectDebtors(finances, y, m);

  const allOccurrences = [];
  if (rawSalary) allOccurrences.push(rawSalary);
  allOccurrences.push(...rawFixed);
  allOccurrences.push(...rawVariable);
  allOccurrences.push(...rawInvoices);
  allOccurrences.push(...rawExtras);
  allOccurrences.push(...rawDebtors);

  const events = [];
  const undated = [];

  for (const occ of allOccurrences) {
    if (occ.date && typeof occ.date === 'string' && isValidCanonicalDateString(occ.date)) {
      events.push(occ);
    } else {
      occ.date = null;
      undated.push(occ);
    }
  }

  events.sort(compareEvents);
  undated.sort(compareUndated);

  // Summary bancário considera TODAS as ocorrências bancárias que afetam cashflow da competência
  const allBanking = [...events, ...undated];
  const bankingInflows = allBanking.filter(o => {
    if (o.direction !== 'inflow') return false;
    if (o.sourceType === 'debtor_receivable') {
      return FinanceDomain.isDebtorCountedInTotal(o);
    }
    return true;
  });
  const inflow = sanitizeAmount(bankingInflows.reduce((s, o) => s + o.amount, 0));
  const outflow = sanitizeAmount(allBanking.filter(o => o.direction === 'outflow' && o.affectsCashflow !== false).reduce((s, o) => s + o.amount, 0));
  const net = Math.round((inflow - outflow) * 100) / 100;

  // Domínio separado de benefícios
  const benefits = projectBenefits(finances, y, m);

  return {
    year: y,
    month: m,
    competence,
    events,
    undated,
    summary: {
      inflow,
      outflow,
      net
    },
    benefits
  };
}

module.exports = {
  projectFinancialMonth,
  projectSalary,
  projectFixedExpenses,
  projectVariableExpenses,
  projectCreditCardInvoices,
  projectExtras,
  projectDebtors,
  projectBenefits,
  resolveVariableStartCompetence,
  findDestination,
  isConfiguredCreditCard,
  isCreditCardInvoiceEligible,
  validatePeriod,
  sanitizeAmount,
  mapPaymentStatus
};
