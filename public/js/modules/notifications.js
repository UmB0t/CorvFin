/* ==========================================================================
   MÓDULO DE NOTIFICAÇÕES DO SISTEMA (notifications.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  function generateSystemNotifications() {
    const notifs = [];
    const state = getState();
    const t = monthTotals(state.year, state.month);

    const overdueCount = t.allExpenses.filter(e => {
      if (e.status === 'pago' || !e.dueDay) return false;
      const now = new Date();
      return state.year === now.getFullYear() && state.month === (now.getMonth() + 1) && Number(e.dueDay) < now.getDate();
    }).length;

    if (overdueCount > 0) {
      notifs.push({ id: 'overdue', type: 'danger', title: 'Contas Vencidas no Mês', desc: `Você possui ${overdueCount} conta(s) em atraso neste mês.` });
    }

    const unbudgetedCount = state.categories.filter(c => !state.budgets[c] || state.budgets[c] <= 0).length;
    if (unbudgetedCount > 0) {
      notifs.push({ id: 'unbudgeted', type: 'warning', title: 'Categorias sem Teto', desc: `${unbudgetedCount} categoria(s) não possuem limite mensal configurado.` });
    }

    const isLinked = typeof isPhysicalFileLinked === 'function'
      ? isPhysicalFileLinked()
      : (typeof window.isPhysicalFileLinked === 'function' ? window.isPhysicalFileLinked() : false);

    if (!isLinked) {
      notifs.push({ id: 'backup', type: 'info', title: 'Arquivo no PC Não Vinculado', desc: 'Vincule um arquivo .json no seu computador para salvamento automático permanente.' });
    } else {
      notifs.push({ id: 'backup-ok', type: 'success', title: 'Salvamento Automático Ativo', desc: 'Seus dados estão sendo sincronizados com o arquivo do seu PC.' });
    }

    return notifs;
  }

  function updateNotificationBell() {
    const state = getState();
    const allNotifs = generateSystemNotifications();
    const unread = allNotifs.filter(n => !state.readNotifications.includes(n.id));

    const badge = $('#notifBadge');
    if (unread.length > 0) {
      badge.textContent = unread.length;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function openNotificationsCenter() {
    const notifDlg = $('#notificationsDialog');
    const container = $('#notifListContainer');
    const state = getState();

    const notifs = generateSystemNotifications();
    if (notifs.length === 0) {
      container.innerHTML = `<div class="empty">Nenhuma notificação recente. Seu sistema está 100% atualizado!</div>`;
    } else {
      container.innerHTML = notifs.map(n => {
        const isRead = state.readNotifications.includes(n.id);
        let badgeClass = 'info';
        if (n.type === 'danger') badgeClass = 'danger';
        else if (n.type === 'warning') badgeClass = 'warning';
        else if (n.type === 'success') badgeClass = 'success';

        return `
          <div class="insight-card" style="${isRead ? 'opacity:0.6;' : ''}">
            <div class="insight-icon" style="background:var(--${badgeClass}-soft); color:var(--${badgeClass});">${ICONS.alert}</div>
            <div>
              <div style="font-weight:800; font-size:.88rem;">${n.title} <span class="badge ${badgeClass}">${n.type.toUpperCase()}</span></div>
              <div style="font-size:.78rem; color:var(--muted); margin-top:2px;">${n.desc}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    notifDlg.showModal();
  }

  // Listeners exclusivos do domínio de Notificações
  $('#notifBellBtn')?.addEventListener('click', openNotificationsCenter);
  $('#clearNotifsBtn')?.addEventListener('click', () => {
    const state = getState();
    const notifs = generateSystemNotifications();
    state.readNotifications = notifs.map(n => n.id);
    saveState();
    updateNotificationBell();
    $('#notificationsDialog').close();
    notify('Notificações marcadas como lidas.');
  });

  // API pública do Módulo de Notificações
  window.updateNotificationBell = updateNotificationBell;

})();
