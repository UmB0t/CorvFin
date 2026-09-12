/* ==========================================================================
   MOTOR DE CONSULTAS & CÁLCULOS FINANCEIROS (financeQueries.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  function getExpensePaymentInfo(item, year, month, explicitAmount) {
    const key = (typeof ymKey === 'function') ? ymKey(year, month) : `${year}-${String(month).padStart(2, '0')}`;
    let totalAmount = explicitAmount !== undefined
      ? Number(explicitAmount)
      : (typeof resolveInstallmentAmounts === 'function' ? resolveInstallmentAmounts(item, year, month).currentInstallmentAmount : Number(item?.amount || 0));
    if (isNaN(totalAmount) || totalAmount < 0) totalAmount = 0;

    const hist = (typeof getPaidHistoryEntry === 'function')
      ? getPaidHistoryEntry(item && item.paidHistory, year, month)
      : ((item && item.paidHistory) ? (item.paidHistory[key] !== undefined ? item.paidHistory[key] : item.paidHistory[`${year}-${parseInt(month, 10)}`]) : undefined);
    let paidAmount = 0;

    if (hist === true) {
      paidAmount = totalAmount;
    } else if (typeof hist === 'number') {
      paidAmount = Math.max(0, Math.min(totalAmount, hist));
    } else if (typeof hist === 'object' && hist !== null) {
      const rawPaid = hist.paidAmount !== undefined ? Number(hist.paidAmount) : (hist.amount !== undefined ? Number(hist.amount) : 0);
      paidAmount = Math.max(0, Math.min(totalAmount, isNaN(rawPaid) ? 0 : rawPaid));
    } else if (hist === undefined && (item?.status === 'pago' || item?.status === 'recebido') && (!item.paidHistory || Object.keys(item.paidHistory).length === 0)) {
      // Retrocompatibilidade: registros legados com status binário pago/recebido sem chave de competência
      paidAmount = totalAmount;
    } else {
      paidAmount = 0;
    }

    paidAmount = Math.round(paidAmount * 100) / 100;
    const remainingAmount = Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100);

    let status = 'pendente';
    if (totalAmount > 0 && paidAmount >= totalAmount) {
      status = 'pago';
    } else if (paidAmount > 0) {
      status = 'parcial';
    } else if (totalAmount === 0 && hist === true) {
      status = 'pago';
    }

    return {
      totalAmount,
      paidAmount,
      remainingAmount,
      status,
      isPaid: status === 'pago',
      isPartial: status === 'parcial',
      isPending: status === 'pendente'
    };
  }

  function setExpensePayment(item, year, month, newPaidAmount, explicitTotalAmount) {
    if (!item) return;
    const key = (typeof ymKey === 'function') ? ymKey(year, month) : `${year}-${String(month).padStart(2, '0')}`;
    let totalAmount = explicitTotalAmount !== undefined
      ? Number(explicitTotalAmount)
      : (typeof resolveInstallmentAmounts === 'function' ? resolveInstallmentAmounts(item, year, month).currentInstallmentAmount : Number(item.amount || 0));
    if (isNaN(totalAmount) || totalAmount < 0) totalAmount = 0;

    item.paidHistory = item.paidHistory || {};

    let targetPaid = 0;
    if (newPaidAmount === true) {
      targetPaid = totalAmount;
    } else if (newPaidAmount === false) {
      targetPaid = 0;
    } else {
      targetPaid = Number(newPaidAmount || 0);
    }
    if (isNaN(targetPaid) || targetPaid < 0) targetPaid = 0;
    if (targetPaid > totalAmount) targetPaid = totalAmount;
    targetPaid = Math.round(targetPaid * 100) / 100;

    // Formato canônico único para todas as novas escritas
    item.paidHistory[key] = {
      paidAmount: targetPaid,
      updatedAt: new Date().toISOString()
    };
    // Limpeza de chave legada YYYY-M para evitar split-brain
    const legacyKey = `${year}-${parseInt(month, 10)}`;
    if (legacyKey !== key && item.paidHistory[legacyKey] !== undefined) {
      delete item.paidHistory[legacyKey];
    }

    return getExpensePaymentInfo(item, year, month, totalAmount);
  }


  /**
   * Resolve a semântica e os valores canônicos de parcelamento para qualquer despesa (V2 ou legada).
   *
   * @param {Object} expense - Objeto de despesa
   * @param {number} [targetYear] - Ano da competência específica (opcional)
   * @param {number} [targetMonth] - Mês da competência específica (opcional)
   * @returns {Object} { totalAmount, installmentAmount, currentInstallmentAmount, installments, amountInputMode, schedule }
   */
  /**
   * Calcula o cronograma determinístico de parcelas garantindo centavos inteiros,
   * congelamento estrito de competências já quitadas e redistribuição exata do saldo remanescente.
   *
   * @param {Object} expense - Objeto de despesa (com paidHistory e/ou installmentSchedule)
   * @param {number} [newTotalAmount] - Novo valor total (se em edição)
   * @param {number} [newCount] - Novo número de parcelas (se em edição)
   * @param {number} [sYear] - Ano inicial da despesa
   * @param {number} [sMonth] - Mês inicial da despesa
   * @returns {Object} { schedule, keys, totalCents, sumScheduleCents, actuallyPaidCents, remainingCents, paidKeys, openKeys }
   */
  function calculateInstallmentSchedule(expense, newTotalAmount, newCount, sYear, sMonth, isRevision) {
    if (!expense || typeof expense !== 'object') {
      return { schedule: {}, keys: [], totalCents: 0, sumScheduleCents: 0, actuallyPaidCents: 0, remainingCents: 0, paidKeys: [], openKeys: [] };
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

    const startY = Number(sYear || expense.startYear || (typeof getState === 'function' ? getState()?.year : 2026) || 2026);
    const startM = Number(sMonth || expense.startMonth || (typeof getState === 'function' ? getState()?.month : 1) || 1);

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

    const paidHistory = expense.paidHistory || {};
    const previousSchedule = expense.installmentSchedule || stdSchedule;

    let actuallyPaidCents = 0;
    const openKeys = [];
    const paidKeys = [];
    const partialPaidMap = {};
    let hasQuitadaDivergente = false;

    keys.forEach((k) => {
      const [kY, kM] = k.split('-').map(Number);
      const hist = (typeof getPaidHistoryEntry === 'function')
        ? getPaidHistoryEntry(paidHistory, kY, kM)
        : (paidHistory[k] !== undefined ? paidHistory[k] : paidHistory[`${kY}-${kM}`]);
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
      const [kY, kM] = k.split('-').map(Number);
      const hist = (typeof getPaidHistoryEntry === 'function')
        ? getPaidHistoryEntry(paidHistory, kY, kM)
        : (paidHistory[k] !== undefined ? paidHistory[k] : paidHistory[`${kY}-${kM}`]);
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
   * @param {number} [targetYear] - Ano da competência específica (opcional)
   * @param {number} [targetMonth] - Mês da competência específica (opcional)
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
      const amt = Number(expense.totalAmount !== undefined ? expense.totalAmount : (expense.amount || 0));
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

    const sYear = Number(expense.startYear) || (targetYear || (typeof getState === 'function' ? getState()?.year : 2026) || 2026);
    const sMonth = Number(expense.startMonth) || (targetMonth || (typeof getState === 'function' ? getState()?.month : 1) || 1);

    // Consulta de leitura: não é revisão explícita de contrato
    const calculated = calculateInstallmentSchedule(expense, undefined, undefined, sYear, sMonth, false);
    const schedule = calculated.schedule;

    const firstKey = calculated.keys[0] || `${sYear}-${String(sMonth).padStart(2, '0')}`;
    let currentInstallmentAmount = (schedule[firstKey] !== undefined) ? schedule[firstKey] : installmentAmount;
    if (targetYear && targetMonth) {
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

  function activeFixedForMonth(year, month) {
    const state = getState();
    const target = mk(year, month);
    const out = [];
    state.fixed.forEach(f => {
      if (f.endedFrom && target >= mk(f.endedFrom.year, f.endedFrom.month)) return;
      const versions = [...f.versions].sort((a, b) => mk(a.year, a.month) - mk(b.year, b.month));
      let active = null;
      for (const v of versions) {
        if (mk(v.year, v.month) <= target) active = v; else break;
      }
      if (!active) return;
      const payInfo = getExpensePaymentInfo(f, year, month, active.amount);
      out.push({
        fixedId: f.id, versionId: active.id, name: f.name, group: f.group || 'Gerais', note: f.note,
        amount: active.amount, effYear: active.year, effMonth: active.month,
        dueDay: f.dueDay || null, destination: f.destination || 'Nubank',
        payee: f.payee || null,
        payment: f.payment || null,
        temporal: f.temporal || null,
        status: payInfo.status,
        paidAmount: payInfo.paidAmount,
        remainingAmount: payInfo.remainingAmount
      });
    });
    return out;
  }

  function activeVariableForMonth(year, month) {
    const state = getState();
    const target = mk(year, month);
    return state.variable.filter(v => target >= mk(v.startYear, v.startMonth) && target <= mk(v.endYear, v.endMonth))
      .map(v => {
        const total = mk(v.endYear, v.endMonth) - mk(v.startYear, v.startMonth) + 1;
        const idx = target - mk(v.startYear, v.startMonth) + 1;
        const resolved = resolveInstallmentAmounts(v, year, month);
        const monthlyAmount = resolved.currentInstallmentAmount;
        const payInfo = getExpensePaymentInfo(v, year, month, monthlyAmount);
        return Object.assign({}, v, {
          amount: monthlyAmount,
          totalAmount: resolved.totalAmount,
          installmentAmount: resolved.installmentAmount,
          amountInputMode: resolved.amountInputMode,
          group: v.group || 'Gerais',
          installmentIndex: idx, installmentTotal: total,
          dueDay: v.dueDay || null, destination: v.destination || 'Nubank',
          status: payInfo.status,
          paidAmount: payInfo.paidAmount,
          remainingAmount: payInfo.remainingAmount
        });
      });
  }

  function monthTotals(year, month) {
    const state = getState();
    const fixed = activeFixedForMonth(year, month);
    const variable = activeVariableForMonth(year, month);
    const extras = (typeof activeExtrasForMonth === 'function') ? activeExtrasForMonth(year, month) : [];
    const debtors = (typeof activeDebtorsForMonth === 'function') ? activeDebtorsForMonth(year, month) : [];

    const sumFixed = fixed.reduce((s, e) => s + Number(e.amount), 0);
    const sumVar = variable.reduce((s, e) => s + Number(e.amount), 0);
    const sumExt = extras.reduce((s, e) => s + Number(e.amount), 0);
    const sumDeb = debtors.reduce((s, e) => s + Number(e.amount), 0);
    const sumDebtorCounted = debtors.filter(d => d.countInTotal === true).reduce((s, d) => s + Number(d.amount), 0);

    const totalExpenses = sumFixed + sumVar;
    const allExpenses = [...fixed, ...variable];
    const paidExpenses = allExpenses.reduce((s, e) => s + Number(e.paidAmount !== undefined ? e.paidAmount : (e.status === 'pago' ? e.amount : 0)), 0);
    const pendingExpenses = Math.max(0, totalExpenses - paidExpenses);

    const customIncome = (state.incomes && typeof state.incomes === 'object' && !Array.isArray(state.incomes)) ? state.incomes[`${year}-${month}`] : undefined;
    const baseSalary = customIncome !== undefined ? Number(customIncome) : Number(state.profile?.baseSalary || 0);
    const totalIncome = baseSalary + sumExt + sumDebtorCounted;
    const balance = totalIncome - totalExpenses;

    const receivedExt = extras.reduce((s, e) => s + Number(e.paidAmount !== undefined ? e.paidAmount : (e.status === 'pago' ? e.amount : 0)), 0);
    const pendingExt = Math.max(0, sumExt - receivedExt);

    const receivedDeb = debtors.reduce((s, d) => s + Number(d.paidAmount !== undefined ? d.paidAmount : (d.status === 'pago' ? d.amount : 0)), 0);
    const pendingDeb = Math.max(0, sumDeb - receivedDeb);

    return {
      baseSalary, sumExt, sumDebtorCounted, totalIncome, sumFixed, sumVar, totalExpenses,
      paidExpenses, pendingExpenses, sumDeb, allExpenses, balance,
      receivedExt, pendingExt, receivedDeb, pendingDeb
    };
  }

  const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

  // APIs públicas do Core
  globalScope.getExpensePaymentInfo = getExpensePaymentInfo;
  globalScope.getDebtorPaymentInfo = getExpensePaymentInfo;
  globalScope.getExtraPaymentInfo = getExpensePaymentInfo;
  globalScope.getItemPaymentInfo = getExpensePaymentInfo;
  globalScope.getPaymentInfo = getExpensePaymentInfo;

  globalScope.setExpensePayment = setExpensePayment;
  globalScope.setDebtorPayment = setExpensePayment;
  globalScope.setExtraPayment = setExpensePayment;
  globalScope.setItemPayment = setExpensePayment;
  globalScope.setPayment = setExpensePayment;

  globalScope.activeFixedForMonth = activeFixedForMonth;
  globalScope.calculateInstallmentSchedule = calculateInstallmentSchedule;
  globalScope.resolveInstallmentAmounts = resolveInstallmentAmounts;
  globalScope.activeVariableForMonth = activeVariableForMonth;
  globalScope.monthTotals = monthTotals;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      getExpensePaymentInfo,
      getDebtorPaymentInfo,
      getExtraPaymentInfo,
      getItemPaymentInfo,
      getPaymentInfo,
      setExpensePayment,
      setDebtorPayment,
      setExtraPayment,
      setItemPayment,
      setPayment,
      activeFixedForMonth,
      calculateInstallmentSchedule,
      resolveInstallmentAmounts,
      activeVariableForMonth,
      monthTotals
    };
  }

})();
