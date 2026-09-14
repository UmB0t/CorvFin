/**
 * CorvFin V2 — Shared Finance Domain (shared/financeDomain.js)
 *
 * Módulo financeiro canônico puro e neutro compartilhado entre Backend e Frontend.
 *
 * Princípios Arquiteturais Estritos:
 * 1. PUREZA ABSOLUTA: Mesma entrada = mesma saída. Sem efeitos colaterais.
 * 2. INDEPENDÊNCIA: Sem acesso a DOM, window, document, getState, storage, banco ou APIs HTTP.
 * 3. ZERO COGUMELOS TEMPORAIS: Não depende de data/hora atual (Date.now() proibido) nem ano hardcoded.
 * 4. IMUTABILIDADE: Não altera os objetos recebidos como argumento.
 * 5. COMPATIBILIDADE DUAL: Funciona via require/module.exports no Node.js e globalThis.FinanceDomain no browser.
 */

(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) {
    // Node.js / CommonJS
    const domain = factory();
    module.exports = domain;
    if (root && !root.FinanceDomain) root.FinanceDomain = domain;
  } else {
    // Browser / Global
    root.FinanceDomain = factory();
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  /**
   * Calcula o cronograma determinístico de parcelas garantindo centavos inteiros,
   * congelamento estrito de competências já quitadas e redistribuição exata do saldo remanescente.
   *
   * @param {Object} expense - Objeto de despesa (com paidHistory e/ou installmentSchedule)
   * @param {number} [newTotalAmount] - Novo valor total (se em edição)
   * @param {number} [newCount] - Novo número de parcelas (se em edição)
   * @param {number} sYear - Ano inicial da despesa (obrigatório do chamador se ausente no item)
   * @param {number} sMonth - Mês inicial da despesa (obrigatório do chamador se ausente no item)
   * @param {boolean} [isRevision] - Flag indicando se é revisão explícita
   * @returns {Object} { schedule, keys, totalCents, sumScheduleCents, actuallyPaidCents, remainingCents, paidKeys, openKeys }
   */
  function calculateInstallmentSchedule(expense, newTotalAmount, newCount, sYear, sMonth, isRevision) {
    if (!expense || typeof expense !== 'object') {
      return {
        schedule: {},
        keys: [],
        totalCents: 0,
        sumScheduleCents: 0,
        actuallyPaidCents: 0,
        remainingCents: 0,
        paidKeys: [],
        openKeys: []
      };
    }

    const hasNewTotal = (newTotalAmount !== undefined && newTotalAmount !== null);
    const hasNewCount = (newCount !== undefined && newCount !== null);
    const isExplicitRevision = Boolean(isRevision || (hasNewTotal && newTotalAmount !== expense.totalAmount) || (hasNewCount && newCount !== expense.installments));

    let count = 1;
    if (hasNewCount) {
      count = Math.max(1, parseInt(newCount, 10) || 1);
    } else if (expense.installments !== undefined && expense.installments !== null) {
      count = Math.max(1, parseInt(expense.installments, 10) || 1);
    } else if (expense.startYear && expense.endYear && expense.startMonth && expense.endMonth) {
      count = Math.max(1, (Number(expense.endYear) * 12 + Number(expense.endMonth)) - (Number(expense.startYear) * 12 + Number(expense.startMonth)) + 1);
    }

    let totalAmount = 0;
    if (hasNewTotal) {
      totalAmount = Math.max(0, Number(newTotalAmount) || 0);
    } else if (expense.totalAmount !== undefined && expense.totalAmount !== null) {
      totalAmount = Math.max(0, Number(expense.totalAmount) || 0);
    } else if (expense.amountInputMode === 'total') {
      totalAmount = Math.max(0, Number(expense.amount || 0));
    } else {
      const instAmt = Math.max(0, Number(expense.amount || 0));
      totalAmount = Math.round(instAmt * count * 100) / 100;
    }
    const totalCents = Math.round(totalAmount * 100);

    const startY = Number(sYear !== undefined && sYear !== null ? sYear : (expense.startYear !== undefined ? expense.startYear : 0));
    const startM = Number(sMonth !== undefined && sMonth !== null ? sMonth : (expense.startMonth !== undefined ? expense.startMonth : 1));

    const keys = [];
    for (let i = 0; i < count; i++) {
      const curMonthIdx = (startM - 1) + i;
      const curY = startY + Math.floor(curMonthIdx / 12);
      const curM = (curMonthIdx % 12) + 1;
      keys.push(`${curY}-${String(curM).padStart(2, '0')}`);
    }

    // Se já possui installmentSchedule consistente gravado e não é revisão explícita de total/count:
    if (!isExplicitRevision && expense.installmentSchedule && typeof expense.installmentSchedule === 'object' && !Array.isArray(expense.installmentSchedule)) {
      const existingKeys = Object.keys(expense.installmentSchedule);
      if (existingKeys.length === count && keys.every(k => expense.installmentSchedule[k] !== undefined)) {
        const sumExisting = existingKeys.reduce((acc, k) => acc + Math.round(Number(expense.installmentSchedule[k] || 0) * 100), 0);
        if (Math.abs(sumExisting - totalCents) <= 1) {
          return {
            schedule: Object.assign({}, expense.installmentSchedule),
            keys,
            totalCents,
            sumScheduleCents: sumExisting,
            actuallyPaidCents: 0,
            remainingCents: totalCents,
            paidKeys: [],
            openKeys: [...keys]
          };
        }
      }
    }

    // Schedule padrão uniforme
    const stdSchedule = {};
    const baseStdCents = Math.floor(totalCents / count);
    const remStdCents = totalCents - (baseStdCents * count);
    keys.forEach((k, idx) => {
      const cents = (idx === 0) ? (baseStdCents + remStdCents) : baseStdCents;
      stdSchedule[k] = Math.round(cents) / 100;
    });

    const paidHistory = (expense.paidHistory && typeof expense.paidHistory === 'object') ? expense.paidHistory : {};
    const previousSchedule = (expense.installmentSchedule && typeof expense.installmentSchedule === 'object') ? expense.installmentSchedule : stdSchedule;

    let actuallyPaidCents = 0;
    const openKeys = [];
    const paidKeys = [];
    const partialPaidMap = {};
    let hasQuitadaDivergente = false;

    keys.forEach((k) => {
      const hist = paidHistory[k];
      let paidAmt = 0;
      let isFullyPaid = false;
      let isPartial = false;

      const prevExpected = (previousSchedule[k] !== undefined)
        ? Number(previousSchedule[k])
        : (expense.installmentAmount !== undefined ? Number(expense.installmentAmount) : (expense.amount || (totalAmount / count)));

      if (hist === true) {
        isFullyPaid = true;
        paidAmt = prevExpected;
      } else if (typeof hist === 'number') {
        paidAmt = Math.max(0, hist);
        if (paidAmt > 0) {
          if (paidAmt >= prevExpected - 0.01) {
            isFullyPaid = true;
          } else {
            isPartial = true;
          }
        }
      } else if (typeof hist === 'object' && hist !== null) {
        const raw = hist.paidAmount !== undefined ? Number(hist.paidAmount) : (hist.amount !== undefined ? Number(hist.amount) : 0);
        paidAmt = Math.max(0, isNaN(raw) ? 0 : raw);
        if (paidAmt > 0) {
          if (hist.status === 'pago' || paidAmt >= prevExpected - 0.01) {
            isFullyPaid = true;
          } else {
            isPartial = true;
          }
        }
      }

      if (isFullyPaid) {
        paidKeys.push(k);
        actuallyPaidCents += Math.round(paidAmt * 100);
        if (Math.abs(paidAmt - stdSchedule[k]) > 0.01) {
          hasQuitadaDivergente = true;
        }
      } else if (isPartial) {
        openKeys.push(k);
        partialPaidMap[k] = paidAmt;
        actuallyPaidCents += Math.round(paidAmt * 100);
      } else {
        openKeys.push(k);
      }
    });

    // Se não é revisão explícita e não viola competências quitadas:
    if (!isExplicitRevision && !hasQuitadaDivergente) {
      return {
        schedule: stdSchedule,
        keys,
        totalCents,
        sumScheduleCents: totalCents,
        actuallyPaidCents,
        remainingCents: Math.max(0, totalCents - actuallyPaidCents),
        paidKeys,
        openKeys
      };
    }

    // REPACTUAÇÃO / REDISTRIBUIÇÃO
    const remainingCents = Math.max(0, totalCents - actuallyPaidCents);
    const schedule = {};

    paidKeys.forEach(k => {
      const hist = paidHistory[k];
      const prevExpected = (previousSchedule[k] !== undefined)
        ? Number(previousSchedule[k])
        : (expense.installmentAmount !== undefined ? Number(expense.installmentAmount) : (expense.amount || (totalAmount / count)));

      let paidAmt = 0;
      if (hist === true) paidAmt = prevExpected;
      else if (typeof hist === 'number') paidAmt = hist;
      else if (typeof hist === 'object' && hist !== null) paidAmt = Number(hist.paidAmount !== undefined ? hist.paidAmount : (hist.amount || 0));
      schedule[k] = Math.round(paidAmt * 100) / 100;
    });

    const openCount = openKeys.length;
    if (openCount > 0) {
      const baseShareCents = Math.floor(remainingCents / openCount);
      const remCents = remainingCents - (baseShareCents * openCount);

      openKeys.forEach((k, idx) => {
        const shareCents = (idx < remCents) ? (baseShareCents + 1) : baseShareCents;
        const partialPaid = partialPaidMap[k] || 0;
        const dueCents = Math.round(partialPaid * 100) + shareCents;
        schedule[k] = Math.round(dueCents) / 100;
      });
    }

    const sumScheduleCents = Object.values(schedule).reduce((acc, v) => acc + Math.round(v * 100), 0);
    return {
      schedule,
      keys,
      totalCents,
      sumScheduleCents,
      actuallyPaidCents,
      remainingCents,
      paidKeys,
      openKeys
    };
  }

  /**
   * Resolve a semântica e os valores canônicos de parcelamento para qualquer despesa (V2 ou legada).
   *
   * @param {Object} expense - Objeto de despesa
   * @param {number} targetYear - Ano da competência específica
   * @param {number} targetMonth - Mês da competência específica
   * @returns {Object} { totalAmount, installmentAmount, currentInstallmentAmount, installments, amountInputMode, schedule }
   */
  function resolveInstallmentAmounts(expense, targetYear, targetMonth) {
    if (!expense || typeof expense !== 'object') {
      return {
        totalAmount: 0,
        installmentAmount: 0,
        currentInstallmentAmount: 0,
        installments: 1,
        amountInputMode: 'total',
        schedule: {}
      };
    }

    const isFixed = Boolean(expense.versions || expense.temporal?.type === 'fixed' || expense.paymentType === 'fixed');
    if (isFixed) {
      const amt = Number(expense.amount || 0);
      return {
        totalAmount: amt,
        installmentAmount: amt,
        currentInstallmentAmount: amt,
        installments: 1,
        amountInputMode: 'total',
        schedule: {}
      };
    }

    let count = 1;
    if (expense.installments !== undefined && expense.installments !== null) {
      count = Math.max(1, parseInt(expense.installments, 10) || 1);
    } else if (expense.startYear && expense.endYear && expense.startMonth && expense.endMonth) {
      count = Math.max(1, (Number(expense.endYear) * 12 + Number(expense.endMonth)) - (Number(expense.startYear) * 12 + Number(expense.startMonth)) + 1);
    }

    if (count <= 1) {
      const amt = Number(expense.totalAmount !== undefined && expense.totalAmount !== null ? expense.totalAmount : (expense.amount || 0));
      return {
        totalAmount: amt,
        installmentAmount: amt,
        currentInstallmentAmount: amt,
        installments: 1,
        amountInputMode: 'total',
        schedule: {}
      };
    }

    let totalAmount = 0;
    let installmentAmount = 0;
    let amountInputMode = expense.amountInputMode;

    if (expense.totalAmount !== undefined && expense.totalAmount !== null) {
      totalAmount = Math.max(0, Number(expense.totalAmount) || 0);
      amountInputMode = amountInputMode || 'total';
      installmentAmount = expense.installmentAmount !== undefined
        ? Number(expense.installmentAmount)
        : (expense.amount !== undefined ? Number(expense.amount) : Math.round((totalAmount / count) * 100) / 100);
    } else if (amountInputMode === 'total') {
      totalAmount = Math.max(0, Number(expense.amount || 0));
      installmentAmount = Math.round((totalAmount / count) * 100) / 100;
    } else {
      // REGISTRO LEGADO: sem amountInputMode e sem totalAmount => amount é a parcela
      amountInputMode = 'installment';
      installmentAmount = Math.max(0, Number(expense.amount || 0));
      totalAmount = Math.round(installmentAmount * count * 100) / 100;
    }

    const sYear = Number(expense.startYear) || (targetYear !== undefined ? Number(targetYear) : 0);
    const sMonth = Number(expense.startMonth) || (targetMonth !== undefined ? Number(targetMonth) : 1);

    // Consulta de leitura: não é revisão explícita de contrato
    const calculated = calculateInstallmentSchedule(expense, undefined, undefined, sYear, sMonth, false);
    const schedule = calculated.schedule;

    const firstKey = calculated.keys[0] || `${sYear}-${String(sMonth).padStart(2, '0')}`;
    let currentInstallmentAmount = (schedule[firstKey] !== undefined) ? schedule[firstKey] : installmentAmount;
    if (targetYear !== undefined && targetMonth !== undefined) {
      const key = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
      if (schedule[key] !== undefined) {
        currentInstallmentAmount = schedule[key];
      }
    }

    return {
      totalAmount,
      installmentAmount,
      currentInstallmentAmount,
      installments: count,
      amountInputMode,
      schedule
    };
  }

  /**
   * Realiza a matemática pura de liquidação financeira.
   *
   * @param {number} totalAmount - Valor total devido
   * @param {number} paidAmount - Valor pago acumulado
   * @param {Object} [options] - Opções puras ({ isMarkedPaid: boolean })
   * @returns {Object} { totalAmount, paidAmount, remainingAmount, status, isPaid, isPartial, isPending }
   */
  function calculatePaymentSettlement(totalAmount, paidAmount, options) {
    const rawTotal = Number(totalAmount);
    const total = (Number.isFinite(rawTotal) && rawTotal > 0) ? Math.round(rawTotal * 100) / 100 : 0;

    const rawPaid = Number(paidAmount);
    const paid = (Number.isFinite(rawPaid) && rawPaid > 0) ? Math.round(rawPaid * 100) / 100 : 0;

    const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);

    const isExplicitPaid = Boolean(options && (options.isMarkedPaid || options.hist === true));

    let status = 'pendente';
    if (total > 0 && paid >= total) {
      status = 'pago';
    } else if (paid > 0) {
      status = 'parcial';
    } else if (total === 0 && isExplicitPaid) {
      status = 'pago';
    }

    return {
      totalAmount: total,
      paidAmount: paid,
      remainingAmount: remaining,
      status,
      isPaid: status === 'pago',
      isPartial: status === 'parcial',
      isPending: status === 'pendente'
    };
  }

  /**
   * Determina canonicamente se um devedor/recebível participa do planejamento
   * financeiro (renda/orçamento/entradas previstas da competência).
   *
   * Semântica estrita: apenas countInTotal === true é contabilizado.
   * Valores ausentes, nulos, strings ou false não entram no orçamento (fail-safe).
   *
   * @param {Object} debtor - Objeto de devedor ou ocorrência
   * @returns {boolean}
   */
  function isDebtorCountedInTotal(debtor) {
    if (!debtor || typeof debtor !== 'object') return false;
    return debtor.countInTotal === true;
  }

  return {
    calculateInstallmentSchedule,
    resolveInstallmentAmounts,
    calculatePaymentSettlement,
    isDebtorCountedInTotal
  };
});
