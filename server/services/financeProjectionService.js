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
  getPaidHistoryEntry
} = require('./temporalUtils');

const FinanceDomain = require('../../shared/financeDomain');

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
    direction: 'inflow',
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
      direction: 'outflow',
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
function projectVariableExpenses(finances, year, month) {
  if (!finances || !Array.isArray(finances.variable)) return [];

  const target = year * 12 + month;
  const canonicalKey = normalizeCompetenceKey(year, month);
  const out = [];

  for (let i = 0; i < finances.variable.length; i++) {
    const v = finances.variable[i];
    if (!v || typeof v !== 'object') continue;

    const sYear = Number(v.startYear || year);
    const sMonth = Number(v.startMonth || 1);
    const sTarget = sYear * 12 + sMonth;

    let count = 1;
    if (v.installments !== undefined && v.installments !== null) {
      count = Math.max(1, parseInt(v.installments, 10) || 1);
    } else if (v.startYear && v.endYear && v.startMonth && v.endMonth) {
      count = Math.max(1, (Number(v.endYear) * 12 + Number(v.endMonth)) - sTarget + 1);
    }

    const eTarget = sTarget + count - 1;
    if (target < sTarget || target > eTarget) continue;

    const installmentIndex = target - sTarget + 1;
    const installmentTotal = count;

    // Resolução determinística de centavos preservando repactuação e cronograma oficial
    const resolvedAmounts = FinanceDomain.resolveInstallmentAmounts(v, year, month);
    const amount = sanitizeAmount(resolvedAmounts.currentInstallmentAmount);

    // Resolução temporal: dueDay tem precedência para vencimento financeiro;
    // transactionDate representa a data civil da compra/transação e é usada para despesa única à vista quando no mesmo mês.
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
    const sourceId = v.id != null ? String(v.id) : `var_${i}`;
    const occurrenceKey = `var_${sourceId}_inst_${installmentIndex}_${canonicalKey}`;

    out.push({
      id: occurrenceKey,
      sourceId,
      sourceType: 'variable_expense',
      direction: 'outflow',
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
      direction: 'inflow',
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
      direction: 'inflow',
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
  variable_expense: 5
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
  const rawExtras = projectExtras(finances, y, m);
  const rawDebtors = projectDebtors(finances, y, m);

  const allOccurrences = [];
  if (rawSalary) allOccurrences.push(rawSalary);
  allOccurrences.push(...rawFixed);
  allOccurrences.push(...rawVariable);
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

  // Summary bancário considera TODAS as ocorrências bancárias que participam da capacidade financeira da competência
  const allBanking = [...events, ...undated];
  const bankingInflows = allBanking.filter(o => {
    if (o.direction !== 'inflow') return false;
    if (o.sourceType === 'debtor_receivable') {
      return FinanceDomain.isDebtorCountedInTotal(o);
    }
    return true;
  });
  const inflow = sanitizeAmount(bankingInflows.reduce((s, o) => s + o.amount, 0));
  const outflow = sanitizeAmount(allBanking.filter(o => o.direction === 'outflow').reduce((s, o) => s + o.amount, 0));
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
  projectExtras,
  projectDebtors,
  projectBenefits,
  validatePeriod,
  sanitizeAmount,
  mapPaymentStatus
};
