/* ==========================================================================
   MOTOR DE CONSULTAS & CÁLCULOS FINANCEIROS (financeQueries.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  function activeFixedForMonth(year, month) {
    const state = getState();
    const target = mk(year, month);
    const key = ymKey(year, month);
    const out = [];
    state.fixed.forEach(f => {
      if (f.endedFrom && target >= mk(f.endedFrom.year, f.endedFrom.month)) return;
      const versions = [...f.versions].sort((a, b) => mk(a.year, a.month) - mk(b.year, b.month));
      let active = null;
      for (const v of versions) {
        if (mk(v.year, v.month) <= target) active = v; else break;
      }
      if (!active) return;
      const isPaid = f.paidHistory && f.paidHistory[key] === true;
      out.push({
        fixedId: f.id, versionId: active.id, name: f.name, group: f.group || 'Gerais', note: f.note,
        amount: active.amount, effYear: active.year, effMonth: active.month,
        dueDay: f.dueDay || null, destination: f.destination || 'Nubank', status: isPaid ? 'pago' : 'pendente'
      });
    });
    return out;
  }

  function activeVariableForMonth(year, month) {
    const state = getState();
    const target = mk(year, month);
    const key = ymKey(year, month);
    return state.variable.filter(v => target >= mk(v.startYear, v.startMonth) && target <= mk(v.endYear, v.endMonth))
      .map(v => {
        const total = mk(v.endYear, v.endMonth) - mk(v.startYear, v.startMonth) + 1;
        const idx = target - mk(v.startYear, v.startMonth) + 1;
        const isPaid = v.paidHistory && v.paidHistory[key] === true;
        return Object.assign({}, v, {
          group: v.group || 'Gerais',
          installmentIndex: idx, installmentTotal: total,
          dueDay: v.dueDay || null, destination: v.destination || 'Nubank', status: isPaid ? 'pago' : 'pendente'
        });
      });
  }

  function monthTotals(year, month) {
    const state = getState();
    const fixed = activeFixedForMonth(year, month);
    const variable = activeVariableForMonth(year, month);
    const extras = activeExtrasForMonth(year, month);
    const debtors = activeDebtorsForMonth(year, month);

    const sumFixed = fixed.reduce((s, e) => s + Number(e.amount), 0);
    const sumVar = variable.reduce((s, e) => s + Number(e.amount), 0);
    const sumExt = extras.reduce((s, e) => s + Number(e.amount), 0);
    const sumDeb = debtors.reduce((s, e) => s + Number(e.amount), 0);
    const sumDebtorCounted = debtors.filter(d => d.countInTotal === true).reduce((s, d) => s + Number(d.amount), 0);

    const totalExpenses = sumFixed + sumVar;
    const allExpenses = [...fixed, ...variable];
    const paidExpenses = allExpenses.filter(e => e.status === 'pago').reduce((s, e) => s + Number(e.amount), 0);
    const pendingExpenses = totalExpenses - paidExpenses;

    const customIncome = state.incomes[`${year}-${month}`];
    const baseSalary = customIncome !== undefined ? Number(customIncome) : Number(state.profile.baseSalary || 0);
    const totalIncome = baseSalary + sumExt + sumDebtorCounted;

    return {
      baseSalary, sumExt, sumDebtorCounted, totalIncome, sumFixed, sumVar, totalExpenses,
      paidExpenses, pendingExpenses, sumDeb, allExpenses
    };
  }

  // APIs públicas do Core
  window.activeFixedForMonth = activeFixedForMonth;
  window.activeVariableForMonth = activeVariableForMonth;
  window.monthTotals = monthTotals;

})();
