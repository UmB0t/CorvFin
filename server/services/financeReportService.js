/**
 * CorvFin V2 — Canonical Financial Report Service (financeReportService.js)
 *
 * Motor analítico de relatórios puro, determinístico e independente de Express/DOM.
 * Consome o domínio financeiro canônico para gerar relatórios financeiros estruturados
 * suportando duas perspectivas ontológicas rigorosamente separadas:
 *
 * 1. CASHFLOW (Caixa Bancário):
 *    - Ocorrências no momento em que o dinheiro efetivamente entra ou sai da conta bancária;
 *    - Cartão de crédito entra pelo evento de fatura consolidada (affectsCashflow: true);
 *    - Compra informativa no cartão não afeta o fluxo de caixa (affectsCashflow: false);
 *    - Reconcilia estritamente com Calendar e Hero Card do Dashboard V2.
 *
 * 2. COMPETENCE (Competência Orçamentária):
 *    - Ocorrências no período a que pertencem contabilmente/orçamentariamente;
 *    - Despesas fixas ativas e parcelas de despesas variáveis da competência;
 *    - Utiliza `resolveInstallmentAmounts()` para centavos e parcelamentos canônicos;
 *    - Não duplica nem agrega faturas de cartão separadamente;
 *    - Reconcilia com a semântica de Despesas / Dashboard Nível 2.
 *
 * Invariantes Gerais:
 * - Determinismo estrito: sem efeitos colaterais, sem mutação dos dados recebidos;
 * - Limite V1: mínimo 1 e máximo 12 competências contínuas (suporta virada de ano);
 * - Taxa de Poupança: ((inflow - outflow) / inflow) * 100; sem clamp a 0% (déficit negativo);
 *   retorna `null` se totalInflow === 0;
 * - Devedores: apenas `countInTotal === true` entra em totalInflow/netResult/savingsRate;
 * - Benefícios: estritamente segregados do caixa bancário (não entram em inflow/outflow).
 */

'use strict';

const FinanceDomain = require('../../shared/financeDomain');
const {
  projectFinancialMonth,
  findDestination,
  sanitizeAmount,
  mapPaymentStatus,
  resolveVariableStartCompetence
} = require('./financeProjectionService');
const {
  normalizeCompetenceKey,
  parseCanonicalDate,
  isValidCanonicalDateString,
  getPaidHistoryEntry
} = require('./temporalUtils');

/**
 * Valida as opções de consulta do relatório.
 * Lança exceções estruturadas com código e status HTTP compatível.
 *
 * @param {Object} options
 * @returns {{ startYear: number, startMonth: number, endYear: number, endMonth: number, perspective: 'cashflow'|'competence', monthCount: number, monthsList: Array<{year: number, month: number, competence: string}> }}
 */
function validateReportOptions(options) {
  if (!options || typeof options !== 'object') {
    const err = new Error('Parâmetros de opções são obrigatórios.');
    err.code = 'INVALID_REPORT_PERIOD';
    err.status = 400;
    throw err;
  }

  const { startYear, startMonth, endYear, endMonth, perspective: rawPerspective } = options;

  // 1. Validação de presença e integridade numérica escalar
  const syStr = String(startYear != null ? startYear : '').trim();
  const smStr = String(startMonth != null ? startMonth : '').trim();
  const eyStr = String(endYear != null ? endYear : '').trim();
  const emStr = String(endMonth != null ? endMonth : '').trim();

  if (!syStr || !smStr || !eyStr || !emStr ||
      !/^\d+$/.test(syStr) || !/^\d+$/.test(smStr) ||
      !/^\d+$/.test(eyStr) || !/^\d+$/.test(emStr)) {
    const err = new Error('INVALID_REPORT_PERIOD: startYear, startMonth, endYear e endMonth são obrigatórios e devem ser inteiros válidos.');
    err.code = 'INVALID_REPORT_PERIOD';
    err.status = 400;
    throw err;
  }

  const sy = parseInt(syStr, 10);
  const sm = parseInt(smStr, 10);
  const ey = parseInt(eyStr, 10);
  const em = parseInt(emStr, 10);

  // 2. Faixa válida (anos entre 2000 e 2100, meses entre 1 e 12)
  if (sy < 2000 || sy > 2100 || ey < 2000 || ey > 2100) {
    const err = new Error(`INVALID_REPORT_PERIOD: ano deve estar entre 2000 e 2100. Recebido startYear=${sy}, endYear=${ey}.`);
    err.code = 'INVALID_REPORT_PERIOD';
    err.status = 400;
    throw err;
  }

  if (sm < 1 || sm > 12 || em < 1 || em > 12) {
    const err = new Error(`INVALID_REPORT_PERIOD: mês deve estar entre 1 e 12. Recebido startMonth=${sm}, endMonth=${em}.`);
    err.code = 'INVALID_REPORT_PERIOD';
    err.status = 400;
    throw err;
  }

  // 3. Ordem cronológica e tamanho do intervalo
  const startTotal = sy * 12 + sm;
  const endTotal = ey * 12 + em;

  if (startTotal > endTotal) {
    const err = new Error(`INVALID_REPORT_PERIOD: competência inicial (${sy}-${String(sm).padStart(2, '0')}) não pode ser posterior à competência final (${ey}-${String(em).padStart(2, '0')}).`);
    err.code = 'INVALID_REPORT_PERIOD';
    err.status = 400;
    throw err;
  }

  const monthCount = endTotal - startTotal + 1;
  if (monthCount > 12) {
    const err = new Error(`REPORT_PERIOD_TOO_LARGE: O intervalo de relatório não pode exceder 12 competências. Solicitado: ${monthCount} meses.`);
    err.code = 'REPORT_PERIOD_TOO_LARGE';
    err.status = 400;
    throw err;
  }

  // 4. Perspectiva
  let perspective = 'cashflow';
  if (rawPerspective !== undefined && rawPerspective !== null && rawPerspective !== '') {
    if (typeof rawPerspective !== 'string') {
      const err = new Error('INVALID_REPORT_PERSPECTIVE: Perspectiva de relatório inválida. Escolha "cashflow" ou "competence".');
      err.code = 'INVALID_REPORT_PERSPECTIVE';
      err.status = 400;
      throw err;
    }
    const cleanP = rawPerspective.trim().toLowerCase();
    if (cleanP !== 'cashflow' && cleanP !== 'competence') {
      const err = new Error(`INVALID_REPORT_PERSPECTIVE: Perspectiva de relatório inválida: "${rawPerspective}". Escolha "cashflow" ou "competence".`);
      err.code = 'INVALID_REPORT_PERSPECTIVE';
      err.status = 400;
      throw err;
    }
    perspective = cleanP;
  }

  // 5. Construção da lista contínua de competências
  const monthsList = [];
  for (let idx = 0; idx < monthCount; idx++) {
    const currentTotal = (sy * 12 + (sm - 1)) + idx;
    const y = Math.floor(currentTotal / 12);
    const m = (currentTotal % 12) + 1;
    monthsList.push({
      year: y,
      month: m,
      competence: normalizeCompetenceKey(y, m)
    });
  }

  return {
    startYear: sy,
    startMonth: sm,
    endYear: ey,
    endMonth: em,
    perspective,
    monthCount,
    monthsList
  };
}

/**
 * Calcula a taxa de poupança (savingsRate) canônica:
 * savingsRate = ((inflow - outflow) / inflow) * 100
 *
 * Regras:
 * - Se inflow === 0, retorna null (não zero, não NaN, não Infinity).
 * - Se déficit (outflow > inflow), permanece NEGATIVO (sem clamp a 0%).
 * - Arredondado a 2 casas decimais.
 *
 * @param {number} inflow
 * @param {number} outflow
 * @returns {number|null}
 */
function calculateSavingsRate(inflow, outflow) {
  const inf = sanitizeAmount(inflow);
  const out = sanitizeAmount(outflow);
  if (inf <= 0) return null;
  return Math.round(((inf - out) / inf) * 10000) / 100;
}

/**
 * Resolve informações de quitação e status de pagamento usando paidHistory e FinanceDomain.
 *
 * @param {Object} item
 * @param {number} year
 * @param {number} month
 * @param {number} amount
 * @returns {Object}
 */
function resolveItemPayment(item, year, month, amount) {
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
    // Retrocompatibilidade para registros legados com status binário sem competência
    paidAmount = totalAmount;
    isMarkedPaid = true;
  } else {
    paidAmount = 0;
  }

  return FinanceDomain.calculatePaymentSettlement(totalAmount, paidAmount, { isMarkedPaid });
}

/**
 * Projeta uma competência sob a perspectiva COMPETENCE (Competência Orçamentária pura).
 * Reproduz as regras econômicas do produto sem dependência de DOM ou queries de frontend.
 *
 * @param {Object} finances - Documento financeiro do usuário
 * @param {number} year - Ano
 * @param {number} month - Mês
 * @returns {Object} { year, month, competence, inflow, outflow, netResult, paid, pending, savingsRate, items }
 */
function projectCompetenceMonth(finances, year, month) {
  const canonicalKey = normalizeCompetenceKey(year, month);
  const legacyKey = `${year}-${parseInt(month, 10)}`;
  const target = year * 12 + month;

  const items = [];

  // 1. SALÁRIO (COMPETÊNCIA)
  let salaryValue = undefined;
  if (finances?.incomes && typeof finances.incomes === 'object' && !Array.isArray(finances.incomes)) {
    if (finances.incomes[canonicalKey] !== undefined) {
      salaryValue = finances.incomes[canonicalKey];
    } else if (finances.incomes[legacyKey] !== undefined) {
      salaryValue = finances.incomes[legacyKey];
    }
  }
  if (salaryValue === undefined) {
    salaryValue = finances?.profile?.baseSalary;
  }

  const salaryAmount = sanitizeAmount(salaryValue);
  if (salaryAmount > 0) {
    items.push({
      id: `comp_salary_${canonicalKey}`,
      sourceId: 'profile',
      sourceType: 'salary',
      name: 'Salário',
      amount: salaryAmount,
      competence: canonicalKey,
      civilDate: null,
      direction: 'inflow',
      category: 'Salário',
      destinationId: null,
      destinationName: null,
      paymentMethod: null,
      paidAmount: salaryAmount,
      remainingAmount: 0,
      status: 'paid',
      eventKind: 'income',
      affectsCashflow: true,
      costType: null,
      countInTotal: true,
      installmentIndex: null,
      installmentTotal: null
    });
  }

  // 2. RENDAS EXTRAS (COMPETÊNCIA)
  if (Array.isArray(finances?.extras)) {
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
      if (amount <= 0) continue;

      const payInfo = resolveItemPayment(e, year, month, amount);
      const sourceId = e.id != null ? String(e.id) : `ext_${i}`;

      let civilDate = null;
      if (e.receiveDate && isValidCanonicalDateString(e.receiveDate)) {
        const parsed = parseCanonicalDate(e.receiveDate);
        if (parsed && parsed.year === year && parsed.month === month) {
          civilDate = e.receiveDate;
        }
      }

      items.push({
        id: `comp_extra_${sourceId}_${canonicalKey}`,
        sourceId,
        sourceType: 'extra_income',
        name: e.title || e.description || e.name || 'Renda Extra',
        amount,
        competence: canonicalKey,
        civilDate,
        direction: 'inflow',
        category: e.source || e.sender || 'Renda Extra',
        destinationId: null,
        destinationName: null,
        paymentMethod: null,
        paidAmount: sanitizeAmount(payInfo.paidAmount),
        remainingAmount: sanitizeAmount(payInfo.remainingAmount),
        status: mapPaymentStatus(payInfo.status),
        eventKind: 'income',
        affectsCashflow: true,
        costType: null,
        countInTotal: true,
        installmentIndex: null,
        installmentTotal: null
      });
    }
  }

  // 3. DEVEDORES / RECEBÍVEIS (COMPETÊNCIA)
  if (Array.isArray(finances?.debtors)) {
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
      if (amount <= 0) continue;

      const payInfo = resolveItemPayment(d, year, month, amount);
      const sourceId = d.id != null ? String(d.id) : `deb_${i}`;
      const isCounted = FinanceDomain.isDebtorCountedInTotal(d);

      const debtorDisplayName = d.debtorName || d.name || 'Devedor';
      const name = d.title ? `${debtorDisplayName} • ${d.title}` : debtorDisplayName;

      items.push({
        id: `comp_debtor_${sourceId}_inst_${installmentIndex}_${canonicalKey}`,
        sourceId,
        sourceType: 'debtor_receivable',
        name,
        amount,
        competence: canonicalKey,
        civilDate: null,
        direction: 'inflow',
        category: 'Devedores',
        destinationId: null,
        destinationName: d.destination || null,
        paymentMethod: null,
        paidAmount: sanitizeAmount(payInfo.paidAmount),
        remainingAmount: sanitizeAmount(payInfo.remainingAmount),
        status: mapPaymentStatus(payInfo.status),
        eventKind: 'income',
        affectsCashflow: true,
        costType: null,
        countInTotal: isCounted,
        installmentIndex,
        installmentTotal
      });
    }
  }

  // 4. DESPESAS FIXAS (COMPETÊNCIA)
  if (Array.isArray(finances?.fixed)) {
    for (let i = 0; i < finances.fixed.length; i++) {
      const f = finances.fixed[i];
      if (!f || typeof f !== 'object') continue;

      // 4.1 Encerramento explícito
      if (f.endedFrom && typeof f.endedFrom === 'object') {
        const endTarget = Number(f.endedFrom.year) * 12 + Number(f.endedFrom.month);
        if (target >= endTarget) continue;
      }

      // 4.2 Recorrência estruturada
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

      // 4.3 Resolução de versão ativa
      let activeAmount = Number(f.amount || 0);
      if (Array.isArray(f.versions) && f.versions.length > 0) {
        const sorted = [...f.versions].sort((a, b) => (Number(a.year) * 12 + Number(a.month)) - (Number(b.year) * 12 + Number(b.month)));
        let activeVersion = null;
        for (const v of sorted) {
          if ((Number(v.year) * 12 + Number(v.month)) <= target) {
            activeVersion = v;
          } else {
            break;
          }
        }
        if (!activeVersion) continue; // Vigência não iniciada
        activeAmount = Number(activeVersion.amount || 0);
      } else {
        if (f.startYear && f.startMonth) {
          const sTarget = Number(f.startYear) * 12 + Number(f.startMonth);
          if (target < sTarget) continue;
        }
      }

      const amount = sanitizeAmount(activeAmount);
      if (amount <= 0) continue;

      const payInfo = resolveItemPayment(f, year, month, amount);
      const sourceId = f.id != null ? String(f.id) : `fix_${i}`;
      const dest = findDestination(finances, f.destinationId, f.payment?.account || f.destination);

      items.push({
        id: `comp_fixed_${sourceId}_${canonicalKey}`,
        sourceId,
        sourceType: 'fixed_expense',
        name: f.name || 'Despesa Fixa',
        amount,
        competence: canonicalKey,
        civilDate: null, // Proibido fabricar civilDate ou usar dueDay como data de transação
        direction: 'outflow',
        category: f.group || 'Gerais',
        destinationId: dest ? dest.id : (f.destinationId || null),
        destinationName: dest ? dest.name : (f.destination || f.payment?.account || null),
        paymentMethod: f.payment?.method || null,
        paidAmount: sanitizeAmount(payInfo.paidAmount),
        remainingAmount: sanitizeAmount(payInfo.remainingAmount),
        status: mapPaymentStatus(payInfo.status),
        eventKind: 'cashflow',
        affectsCashflow: true,
        costType: 'fixed',
        countInTotal: null,
        installmentIndex: null,
        installmentTotal: null
      });
    }
  }

  // 5. DESPESAS VARIÁVEIS / PARCELADAS (COMPETÊNCIA)
  if (Array.isArray(finances?.variable)) {
    for (let i = 0; i < finances.variable.length; i++) {
      const v = finances.variable[i];
      if (!v || typeof v !== 'object') continue;

      const startComp = resolveVariableStartCompetence(v);
      if (!startComp) continue;

      let count = 1;
      if (v.installments !== undefined && v.installments !== null) {
        count = Math.max(1, parseInt(v.installments, 10) || 1);
      } else if (v.endYear && v.endMonth && v.startYear && v.startMonth) {
        count = Math.max(1, (Number(v.endYear) * 12 + Number(v.endMonth)) - (Number(v.startYear) * 12 + Number(v.startMonth)) + 1);
      }

      const sTarget = startComp.startYear * 12 + startComp.startMonth;
      const eTarget = sTarget + count - 1;
      if (target < sTarget || target > eTarget) continue;

      const installmentIndex = target - sTarget + 1;
      const installmentTotal = count;

      // Resolução canônica de parcelamentos via FinanceDomain
      const resolvedAmounts = FinanceDomain.resolveInstallmentAmounts(v, year, month);
      const amount = sanitizeAmount(resolvedAmounts.currentInstallmentAmount);
      if (amount <= 0) continue;

      const payInfo = resolveItemPayment(v, year, month, amount);
      const sourceId = v.id != null ? String(v.id) : `var_${i}`;
      const dest = findDestination(finances, v.destinationId, v.payment?.account || v.destination);

      let civilDate = null;
      if (installmentTotal <= 1 && v.transactionDate && isValidCanonicalDateString(v.transactionDate)) {
        const parsed = parseCanonicalDate(v.transactionDate);
        if (parsed && parsed.year === year && parsed.month === month) {
          civilDate = v.transactionDate;
        }
      }

      items.push({
        id: `comp_var_${sourceId}_inst_${installmentIndex}_${canonicalKey}`,
        sourceId,
        sourceType: 'variable_expense',
        name: v.name || v.description || 'Despesa Variável',
        amount,
        totalAmount: resolvedAmounts.totalAmount,
        installmentAmount: resolvedAmounts.installmentAmount,
        competence: canonicalKey,
        civilDate,
        transactionDate: v.transactionDate || null,
        direction: 'outflow',
        category: v.group || v.category || 'Gerais',
        destinationId: dest ? dest.id : (v.destinationId || null),
        destinationName: dest ? dest.name : (v.destination || v.payment?.account || null),
        paymentMethod: v.payment?.method || v.paymentMethod || (dest?.type === 'credit_card' ? 'cartao_credito' : null),
        paidAmount: sanitizeAmount(payInfo.paidAmount),
        remainingAmount: sanitizeAmount(payInfo.remainingAmount),
        status: mapPaymentStatus(payInfo.status),
        eventKind: 'cashflow',
        affectsCashflow: true,
        costType: 'variable',
        countInTotal: null,
        installmentIndex,
        installmentTotal
      });
    }
  }

  // 6. CÁLCULO DOS TOTAIS DA COMPETÊNCIA
  const inflowItems = items.filter(it => it.direction === 'inflow' && (it.sourceType !== 'debtor_receivable' || it.countInTotal === true));
  const outflowItems = items.filter(it => it.direction === 'outflow');

  const inflow = sanitizeAmount(inflowItems.reduce((acc, it) => acc + it.amount, 0));
  const outflow = sanitizeAmount(outflowItems.reduce((acc, it) => acc + it.amount, 0));
  const netResult = Math.round((inflow - outflow) * 100) / 100;
  const paid = sanitizeAmount(outflowItems.reduce((acc, it) => acc + (it.paidAmount || 0), 0));
  const pending = sanitizeAmount(outflowItems.reduce((acc, it) => acc + (it.remainingAmount || 0), 0));
  const savingsRate = calculateSavingsRate(inflow, outflow);

  return {
    year,
    month,
    competence: canonicalKey,
    inflow,
    outflow,
    netResult,
    paid,
    pending,
    savingsRate,
    items
  };
}

/**
 * Projeta uma competência sob a perspectiva CASHFLOW (Caixa Bancário puro).
 * Reutiliza estritamente `financeProjectionService.projectFinancialMonth()`.
 *
 * @param {Object} finances - Documento financeiro do usuário
 * @param {number} year - Ano
 * @param {number} month - Mês
 * @returns {Object} { year, month, competence, inflow, outflow, netResult, paid, pending, savingsRate, items }
 */
function projectCashflowMonth(finances, year, month) {
  const canonicalKey = normalizeCompetenceKey(year, month);
  const projection = projectFinancialMonth(finances, year, month);

  const rawOccurrences = [...(projection.events || []), ...(projection.undated || [])];

  const items = [];
  for (const occ of rawOccurrences) {
    const isOutflow = occ.direction === 'outflow';
    const isInflow = occ.direction === 'inflow';
    const affectsCashflow = occ.affectsCashflow !== false;

    // Converte status de pagamento e saldos
    let paidAmount = 0;
    let remainingAmount = 0;
    if (occ.paidAmount !== undefined && occ.remainingAmount !== undefined) {
      paidAmount = sanitizeAmount(occ.paidAmount);
      remainingAmount = sanitizeAmount(occ.remainingAmount);
    } else if (occ.status === 'paid') {
      paidAmount = sanitizeAmount(occ.amount);
      remainingAmount = 0;
    } else {
      paidAmount = 0;
      remainingAmount = sanitizeAmount(occ.amount);
    }

    const costType = occ.sourceType === 'fixed_expense'
      ? 'fixed'
      : (occ.sourceType === 'variable_expense' || occ.sourceType === 'credit_card_invoice' ? 'variable' : null);

    items.push({
      id: occ.id || occ.occurrenceKey || `cash_${Math.random()}`,
      sourceId: occ.sourceId != null ? String(occ.sourceId) : null,
      sourceType: occ.sourceType || 'unknown',
      name: occ.description || occ.name || 'Lançamento',
      amount: sanitizeAmount(occ.amount),
      competence: occ.competence || canonicalKey,
      civilDate: (occ.date && isValidCanonicalDateString(occ.date)) ? occ.date : null,
      direction: occ.direction || 'outflow',
      category: occ.category || (occ.sourceType === 'salary' ? 'Salário' : (occ.sourceType === 'debtor_receivable' ? 'Devedores' : (occ.sourceType === 'credit_card_invoice' ? 'Fatura Cartão' : 'Gerais'))),
      destinationId: occ.destinationId || null,
      destinationName: occ.destination || occ.destinationName || null,
      paymentMethod: occ.paymentMethod || (occ.sourceType === 'credit_card_invoice' ? 'cartao_credito' : null),
      paidAmount,
      remainingAmount,
      status: occ.status || (isOutflow ? 'pending' : 'paid'),
      eventKind: occ.eventKind || 'cashflow',
      affectsCashflow,
      costType,
      countInTotal: occ.sourceType === 'debtor_receivable' ? Boolean(occ.countInTotal) : null,
      installmentIndex: occ.installmentIndex || null,
      installmentTotal: occ.installmentTotal || null,
      sourceItems: Array.isArray(occ.sourceItems) ? occ.sourceItems : null
    });
  }

  // Reconciliação idêntica com o summary bancário do motor de projeção
  const inflow = projection.summary.inflow;
  const outflow = projection.summary.outflow;
  const netResult = projection.summary.net;

  // Pagos e pendentes de saídas que afetam o caixa bancário
  const cashflowOutflows = items.filter(it => it.direction === 'outflow' && it.affectsCashflow !== false);
  const paid = sanitizeAmount(cashflowOutflows.reduce((acc, it) => acc + (it.paidAmount || 0), 0));
  const pending = sanitizeAmount(cashflowOutflows.reduce((acc, it) => acc + (it.remainingAmount || 0), 0));
  const savingsRate = calculateSavingsRate(inflow, outflow);

  return {
    year,
    month,
    competence: canonicalKey,
    inflow,
    outflow,
    netResult,
    paid,
    pending,
    savingsRate,
    items
  };
}

/**
 * Agrega saídas por categoria a partir do dataset analítico da perspectiva.
 *
 * @param {Array<Object>} outflowItems
 * @param {number} totalOutflow
 * @returns {Array<{ category: string, amount: number, percentage: number, count: number }>}
 */
function aggregateCategories(outflowItems, totalOutflow) {
  const map = new Map();
  for (const it of outflowItems) {
    const rawCat = (it.category || '').trim();
    const cat = rawCat || 'Outros';
    const amt = sanitizeAmount(it.amount);

    if (!map.has(cat)) {
      map.set(cat, { category: cat, amount: 0, count: 0 });
    }
    const entry = map.get(cat);
    entry.amount = sanitizeAmount(entry.amount + amt);
    entry.count += 1;
  }

  const list = Array.from(map.values()).map(e => ({
    category: e.category,
    amount: e.amount,
    percentage: totalOutflow > 0 ? Math.round((e.amount / totalOutflow) * 10000) / 100 : 0,
    count: e.count
  }));

  list.sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
  return list;
}

/**
 * Agrega saídas por destino/conta a partir do dataset analítico da perspectiva.
 *
 * @param {Array<Object>} outflowItems
 * @param {number} totalOutflow
 * @returns {Array<{ destinationId: string|null, destinationName: string, amount: number, percentage: number, count: number }>}
 */
function aggregateDestinations(outflowItems, totalOutflow) {
  const map = new Map();
  for (const it of outflowItems) {
    const rawDest = (it.destinationName || '').trim();
    const destName = rawDest || 'Não Definido';
    const destId = it.destinationId || null;
    const key = destId ? `id:${destId}` : `name:${destName.toLowerCase()}`;
    const amt = sanitizeAmount(it.amount);

    if (!map.has(key)) {
      map.set(key, { destinationId: destId, destinationName: destName, amount: 0, count: 0 });
    }
    const entry = map.get(key);
    entry.amount = sanitizeAmount(entry.amount + amt);
    entry.count += 1;
  }

  const list = Array.from(map.values()).map(e => ({
    destinationId: e.destinationId,
    destinationName: e.destinationName,
    amount: e.amount,
    percentage: totalOutflow > 0 ? Math.round((e.amount / totalOutflow) * 10000) / 100 : 0,
    count: e.count
  }));

  list.sort((a, b) => b.amount - a.amount || a.destinationName.localeCompare(b.destinationName));
  return list;
}

/**
 * Agrega saídas por forma de pagamento a partir do dataset analítico da perspectiva.
 *
 * @param {Array<Object>} outflowItems
 * @param {number} totalOutflow
 * @returns {Array<{ method: string, amount: number, percentage: number, count: number }>}
 */
function aggregatePaymentMethods(outflowItems, totalOutflow) {
  const map = new Map();
  for (const it of outflowItems) {
    const rawMethod = (it.paymentMethod || '').trim().toLowerCase();
    const method = rawMethod || 'nao_informado';
    const amt = sanitizeAmount(it.amount);

    if (!map.has(method)) {
      map.set(method, { method, amount: 0, count: 0 });
    }
    const entry = map.get(method);
    entry.amount = sanitizeAmount(entry.amount + amt);
    entry.count += 1;
  }

  const list = Array.from(map.values()).map(e => ({
    method: e.method,
    amount: e.amount,
    percentage: totalOutflow > 0 ? Math.round((e.amount / totalOutflow) * 10000) / 100 : 0,
    count: e.count
  }));

  list.sort((a, b) => b.amount - a.amount || a.method.localeCompare(b.method));
  return list;
}

/**
 * Agrega saídas por tipo de custo (fixo vs variável).
 *
 * @param {Array<Object>} outflowItems
 * @param {number} totalOutflow
 * @returns {{ fixed: { amount: number, percentage: number, count: number }, variable: { amount: number, percentage: number, count: number } }}
 */
function aggregateCostTypes(outflowItems, totalOutflow) {
  let fixedAmount = 0;
  let fixedCount = 0;
  let variableAmount = 0;
  let variableCount = 0;

  for (const it of outflowItems) {
    const amt = sanitizeAmount(it.amount);
    if (it.costType === 'fixed') {
      fixedAmount = sanitizeAmount(fixedAmount + amt);
      fixedCount += 1;
    } else {
      // Itens variáveis, faturas de cartão e despesas operacionais
      variableAmount = sanitizeAmount(variableAmount + amt);
      variableCount += 1;
    }
  }

  return {
    fixed: {
      amount: fixedAmount,
      percentage: totalOutflow > 0 ? Math.round((fixedAmount / totalOutflow) * 10000) / 100 : 0,
      count: fixedCount
    },
    variable: {
      amount: variableAmount,
      percentage: totalOutflow > 0 ? Math.round((variableAmount / totalOutflow) * 10000) / 100 : 0,
      count: variableCount
    }
  };
}

/**
 * Consolida o panorama de parcelamentos ativos no período consultado.
 *
 * @param {Object} finances
 * @param {number} startYear
 * @param {number} startMonth
 * @param {number} endYear
 * @param {number} endMonth
 * @returns {{ activeCount: number, totalContractedAmount: number, periodAmount: number, futureRemainingAmount: number }}
 */
function aggregateInstallmentsOverview(finances, startYear, startMonth, endYear, endMonth) {
  if (!finances || !Array.isArray(finances.variable)) {
    return {
      activeCount: 0,
      totalContractedAmount: 0,
      periodAmount: 0,
      futureRemainingAmount: 0
    };
  }

  const queryStart = startYear * 12 + startMonth;
  const queryEnd = endYear * 12 + endMonth;

  let activeCount = 0;
  let totalContractedAmount = 0;
  let periodAmount = 0;
  let futureRemainingAmount = 0;

  for (let i = 0; i < finances.variable.length; i++) {
    const v = finances.variable[i];
    if (!v || typeof v !== 'object') continue;

    const startComp = resolveVariableStartCompetence(v);
    if (!startComp) continue;

    let count = 1;
    if (v.installments !== undefined && v.installments !== null) {
      count = Math.max(1, parseInt(v.installments, 10) || 1);
    } else if (v.endYear && v.endMonth && v.startYear && v.startMonth) {
      count = Math.max(1, (Number(v.endYear) * 12 + Number(v.endMonth)) - (Number(v.startYear) * 12 + Number(v.startMonth)) + 1);
    }

    if (count <= 1) continue; // Não é parcelamento

    const sTarget = startComp.startYear * 12 + startComp.startMonth;
    const eTarget = sTarget + count - 1;

    // Verifica sobreposição com a janela consultada [queryStart, queryEnd]
    if (eTarget < queryStart || sTarget > queryEnd) continue;

    const resolved = FinanceDomain.resolveInstallmentAmounts(v, startYear, startMonth);
    const schedule = resolved.schedule || {};

    activeCount += 1;
    totalContractedAmount = sanitizeAmount(totalContractedAmount + resolved.totalAmount);

    // Itera pelas parcelas do plano
    for (let k = 0; k < count; k++) {
      const curMonthIdx = (startComp.startMonth - 1) + k;
      const curY = startComp.startYear + Math.floor(curMonthIdx / 12);
      const curM = (curMonthIdx % 12) + 1;
      const curTarget = curY * 12 + curM;
      const curKey = `${curY}-${String(curM).padStart(2, '0')}`;

      const instAmt = sanitizeAmount(schedule[curKey] !== undefined ? schedule[curKey] : resolved.installmentAmount);

      if (curTarget >= queryStart && curTarget <= queryEnd) {
        periodAmount = sanitizeAmount(periodAmount + instAmt);
      } else if (curTarget > queryEnd) {
        futureRemainingAmount = sanitizeAmount(futureRemainingAmount + instAmt);
      }
    }
  }

  return {
    activeCount,
    totalContractedAmount: sanitizeAmount(totalContractedAmount),
    periodAmount: sanitizeAmount(periodAmount),
    futureRemainingAmount: sanitizeAmount(futureRemainingAmount)
  };
}

/**
 * Gera o relatório financeiro consolidado canônico para o período e perspectiva informados.
 *
 * @param {Object} finances - Documento financeiro bruto do usuário
 * @param {Object} options - { startYear, startMonth, endYear, endMonth, perspective }
 * @returns {Object} Relatório financeiro estruturado
 */
function generateFinancialReport(finances, options) {
  const validated = validateReportOptions(options);
  const { startYear, startMonth, endYear, endMonth, perspective, monthCount, monthsList } = validated;

  const monthlyTimeline = [];
  const allItems = [];

  let accumulatedInflow = 0;
  let accumulatedOutflow = 0;
  let accumulatedPaid = 0;
  let accumulatedPending = 0;

  for (const mObj of monthsList) {
    const monthResult = perspective === 'cashflow'
      ? projectCashflowMonth(finances, mObj.year, mObj.month)
      : projectCompetenceMonth(finances, mObj.year, mObj.month);

    monthlyTimeline.push({
      competence: monthResult.competence,
      year: monthResult.year,
      month: monthResult.month,
      inflow: monthResult.inflow,
      outflow: monthResult.outflow,
      netResult: monthResult.netResult,
      savingsRate: monthResult.savingsRate,
      paid: monthResult.paid,
      pending: monthResult.pending
    });

    accumulatedInflow = sanitizeAmount(accumulatedInflow + monthResult.inflow);
    accumulatedOutflow = sanitizeAmount(accumulatedOutflow + monthResult.outflow);
    accumulatedPaid = sanitizeAmount(accumulatedPaid + monthResult.paid);
    accumulatedPending = sanitizeAmount(accumulatedPending + monthResult.pending);

    allItems.push(...monthResult.items);
  }

  const netResult = Math.round((accumulatedInflow - accumulatedOutflow) * 100) / 100;
  const savingsRate = calculateSavingsRate(accumulatedInflow, accumulatedOutflow);

  // Saídas ativas para agregação analítica:
  // Em cashflow, exclui compras informativas no cartão (affectsCashflow === false) para coincidir com o totalOutflow do KPI
  const aggregatedOutflows = allItems.filter(it => it.direction === 'outflow' && it.affectsCashflow !== false);

  const categories = aggregateCategories(aggregatedOutflows, accumulatedOutflow);
  const destinations = aggregateDestinations(aggregatedOutflows, accumulatedOutflow);
  const paymentMethods = aggregatePaymentMethods(aggregatedOutflows, accumulatedOutflow);
  const costTypes = aggregateCostTypes(aggregatedOutflows, accumulatedOutflow);
  const installmentsOverview = aggregateInstallmentsOverview(finances, startYear, startMonth, endYear, endMonth);

  return {
    period: {
      start: normalizeCompetenceKey(startYear, startMonth),
      end: normalizeCompetenceKey(endYear, endMonth),
      months: monthCount
    },
    perspective,
    kpis: {
      totalInflow: accumulatedInflow,
      totalOutflow: accumulatedOutflow,
      netResult,
      savingsRate,
      totalPaid: accumulatedPaid,
      totalPending: accumulatedPending
    },
    monthlyTimeline,
    categories,
    destinations,
    paymentMethods,
    costTypes,
    installmentsOverview,
    items: allItems
  };
}

module.exports = {
  generateFinancialReport,
  validateReportOptions,
  calculateSavingsRate,
  projectCompetenceMonth,
  projectCashflowMonth,
  aggregateCategories,
  aggregateDestinations,
  aggregatePaymentMethods,
  aggregateCostTypes,
  aggregateInstallmentsOverview,
  resolveItemPayment
};
