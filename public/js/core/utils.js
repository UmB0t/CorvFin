window.uid = function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
};

window.mk = function mk(year, month) {
  return Number(year) * 12 + Number(month);
};

window.currency = function currency(val) {
  return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

window.todayYM = function todayYM() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

window.ymKey = function ymKey(y, m) {
  return `${y}-${String(m).padStart(2, '0')}`;
};

window.escapeHtml = function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
};
