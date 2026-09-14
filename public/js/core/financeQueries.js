/* ==========================================================================
   MOTOR DE CONSULTAS & CÁLCULOS FINANCEIROS (financeQueries.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  const globalScope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

  let FinanceDomain = (typeof globalScope !== 'undefined' && globalScope.FinanceDomain)
    || (typeof globalThis !== 'undefined' && globalThis.FinanceDomain)
    || (typeof global !== 'undefined' && global.FinanceDomain)
    || (typeof window !== 'undefined' && window.FinanceDomain);

  if (!FinanceDomain && typeof require === 'function') {
    try {
      FinanceDomain = require('../../../shared/financeDomain');
    } catch (_) {
      try {
        FinanceDomain = require('../../shared/financeDomain');
      } catch (__) {
        try {
          FinanceDomain = require('./shared/financeDomain');
        } catch (___) {}
      }
    }
  }

  if (!FinanceDomain) {
    throw new Error('FinanceDomain is required but not loaded. Ensure shared/financeDomain.js is included before financeQueries.js.');
  }

  /**
   * Adapta o mapa de paidHistory para chaves canônicas (YYYY-MM),
   * garantindo que chaves legadas (YYYY-M) sejam normalizadas antes de invocar o domínio puro.
   */
  function normalizePaidHistoryForDomain(paidHistory) {
    if (!paidHistory || typeof paidHistory !== 'object' || Array.isArray(paidHistory)) return {};
    const normalized = {};
    for (const [key, val] of Object.entries(paidHistory)) {
      const match = key.match(/^(\d{4})-(\d{1,2})$/);
      if (match) {
        const canonicalKey = `${match[1]}-${match[2].padStart(2, '0')}`;
        // Chave canônica YYYY-MM tem precedência caso ambas existam no mesmo objeto
        if (normalized[canonicalKey] === undefined || key.length === 7) {
          normalized[canonicalKey] = val;
        }
      } else {
        normalized[key] = val;
      }
    }
    return normalized;
  }

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

    return FinanceDomain.calculatePaymentSettlement(totalAmount, paidAmount, { isMarkedPaid, hist });
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
   * Wrapper/Adapter para calculateInstallmentSchedule do Domínio Financeiro Compartilhado.
   * Obtém fallback do estado frontend (getState) quando sYear/sMonth não forem passados
   * e adapta paidHistory para chaves canônicas antes de delegar.
   */
  function calculateInstallmentSchedule(expense, newTotalAmount, newCount, sYear, sMonth, isRevision) {
    let startY = sYear;
    let startM = sMonth;
    if (startY === undefined || startY === null) {
      startY = expense?.startYear !== undefined ? expense.startYear : (typeof getState === 'function' ? getState()?.year : undefined);
    }
    if (startM === undefined || startM === null) {
      startM = expense?.startMonth !== undefined ? expense.startMonth : (typeof getState === 'function' ? getState()?.month : undefined);
    }

    let adaptedExpense = expense;
    if (expense && expense.paidHistory) {
      adaptedExpense = Object.assign({}, expense, {
        paidHistory: normalizePaidHistoryForDomain(expense.paidHistory)
      });
    }

    return FinanceDomain.calculateInstallmentSchedule(adaptedExpense, newTotalAmount, newCount, startY, startM, isRevision);
  }

  /**
   * Wrapper/Adapter para resolveInstallmentAmounts do Domínio Financeiro Compartilhado.
   * Obtém ano/mês do estado frontend (getState) se não fornecidos pelo chamador
   * e adapta paidHistory para chaves canônicas antes de delegar.
   */
  function resolveInstallmentAmounts(expense, targetYear, targetMonth) {
    let y = targetYear;
    let m = targetMonth;
    if (y === undefined || y === null) {
      y = expense?.startYear !== undefined ? expense.startYear : (typeof getState === 'function' ? getState()?.year : undefined);
    }
    if (m === undefined || m === null) {
      m = expense?.startMonth !== undefined ? expense.startMonth : (typeof getState === 'function' ? getState()?.month : undefined);
    }

    let adaptedExpense = expense;
    if (expense && expense.paidHistory) {
      adaptedExpense = Object.assign({}, expense, {
        paidHistory: normalizePaidHistoryForDomain(expense.paidHistory)
      });
    }

    return FinanceDomain.resolveInstallmentAmounts(adaptedExpense, y, m);
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
    const isDebtorCounted = (FinanceDomain && typeof FinanceDomain.isDebtorCountedInTotal === 'function')
      ? FinanceDomain.isDebtorCountedInTotal
      : (d => d && d.countInTotal === true);
    const sumDebtorCounted = debtors.filter(isDebtorCounted).reduce((s, d) => s + Number(d.amount), 0);

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
