/* ==========================================================================
   MÓDULO DE BACKUP E RESTAURAÇÃO DE DADOS (backup.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  function openBackup() {
    $('#backupDialog').showModal();
  }

  // Listeners do domínio de Backup
  $('#backupBtn')?.addEventListener('click', openBackup);

  $('#exportBtn')?.addEventListener('click', () => {
    const state = getState();
    const blob = new Blob([JSON.stringify({ app: 'OmniFin', exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnifin-backup-${state.year}-${String(state.month).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Backup baixado com sucesso!', 'success');
  });

  $('#importBtn')?.addEventListener('click', () => $('#importFile').click());

  $('#importFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!confirm('Substituir todos os dados atuais pelo backup selecionado?')) return;
      const nextState = migrateState(parsed.data || parsed);
      const state = getState();
      Object.keys(state).forEach(k => delete state[k]);
      Object.assign(state, nextState);
      saveState();
      $('#backupDialog').close();
      render();
      notify('Backup importado com sucesso!', 'success');
    } catch (_) {
      notify('Arquivo de backup inválido.', 'error');
    } finally {
      e.target.value = '';
    }
  });

  const resetBtn = $('#resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('ATENÇÃO: Tem certeza de que deseja apagar TODOS os dados do aplicativo? Esta ação é irreversível e resetará o sistema para as configurações iniciais.')) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(OLD_STORAGE_KEY_3);
      localStorage.removeItem(OLD_STORAGE_KEY_2);
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('minhas-financas')) {
            localStorage.removeItem(key);
          }
        });
      } catch (_) { }
      const fresh = initialState();
      const state = getState();
      Object.keys(state).forEach(k => delete state[k]);
      Object.assign(state, fresh);
      saveState();
      const backupDlg = $('#backupDialog');
      if (backupDlg && backupDlg.open) backupDlg.close();
      render();
      notify('Todos os dados foram apagados com sucesso!');
    });
  }

  // APIs públicas do Módulo de Backup
  window.openBackup = openBackup;

})();
