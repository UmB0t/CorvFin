/* ==========================================================================
   MOTOR DE CONSULTAS & CÁLCULOS FINANCEIROS (financeQueries.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  function getExpensePaymentInfo(item, year, month, explicitAmount) {
    const key = (typeof ymKey === 'function') ? ymKey(year, month) : `${year}-${String(month).padStart(2, '0')}`;
    let totalAmount = explicitAmount !== undefined ? Number(explicitAmount) : Number(item?.amount || 0);
    if (isNaN(totalAmount) || totalAmount < 0) totalAmount = 0;

    const hist = (item && item.paidHistory) ? item.paidHistory[key] : undefined;
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
    let totalAmount = explicitTotalAmount !== undefined ? Number(explicitTotalAmount) : Number(item.amount || 0);
    if (isNaN(totalAmount) || totalAmount < 0) totalAmount = 0;

    item.paidHistory = item.paidHistory || {};

    let targetPaid = Number(newPaidAmount || 0);
    if (isNaN(targetPaid) || targetPaid < 0) targetPaid = 0;
    if (targetPaid > totalAmount) targetPaid = totalAmount;
    targetPaid = Math.round(targetPaid * 100) / 100;

    // Formato canônico único para todas as novas escritas
    item.paidHistory[key] = {
      paidAmount: targetPaid,
      updatedAt: new Date().toISOString()
    };

    return getExpensePaymentInfo(item, year, month, totalAmount);
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
        const payInfo = getExpensePaymentInfo(v, year, month, v.amount);
        return Object.assign({}, v, {
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

  // APIs públicas do Core
  window.getExpensePaymentInfo = getExpensePaymentInfo;
  window.getDebtorPaymentInfo = getExpensePaymentInfo;
  window.getExtraPaymentInfo = getExpensePaymentInfo;
  window.getItemPaymentInfo = getExpensePaymentInfo;
  window.getPaymentInfo = getExpensePaymentInfo;

  window.setExpensePayment = setExpensePayment;
  window.setDebtorPayment = setExpensePayment;
  window.setExtraPayment = setExpensePayment;
  window.setItemPayment = setExpensePayment;
  window.setPayment = setExpensePayment;

  window.activeFixedForMonth = activeFixedForMonth;
  window.activeVariableForMonth = activeVariableForMonth;
  window.monthTotals = monthTotals;

})();
