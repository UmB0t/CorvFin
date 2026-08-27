/* ==========================================================================
   MÓDULO DE BACKUP, FILE SYSTEM & SINCRONIZAÇÃO LOCAL (backup.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  let localFileHandle = null;

  async function linkPhysicalFile() {
    if ('showSaveFilePicker' in window) {
      try {
        localFileHandle = await window.showSaveFilePicker({
          suggestedName: 'minhas-financas-dados.json',
          types: [{ description: 'Arquivo de Dados Minhas Finanças', accept: { 'application/json': ['.json'] } }]
        });
        await saveToPhysicalFile();
        updateSyncBadge(true);
        notify('Arquivo físico no PC vinculado! Alterações salvas nele.');
      } catch (err) {
        if (err.name !== 'AbortError') notify('Não foi possível vincular o arquivo.');
      }
    } else {
      notify('Navegador sem suporte a salvamento físico direto. Use Backup.');
    }
  }

  async function saveToPhysicalFile() {
    if (localFileHandle) {
      try {
        const state = getState();
        const writable = await localFileHandle.createWritable();
        await writable.write(JSON.stringify({ app: 'Minhas Finanças Pro', savedAt: new Date().toISOString(), data: state }, null, 2));
        await writable.close();
      } catch (err) {
        console.warn('Erro arquivo físico:', err);
      }
    }
  }

  function updateSyncBadge(isLinked) {
    const container = $('#footerMsgContainer');
    const dialogBtnLabel = $('#dialogSyncBtnLabel');

    if (isLinked) {
      if (container) container.innerHTML = `<span style="color:var(--success); font-weight:800;">🟢 Seus dados estão sendo salvos automaticamente no arquivo do seu computador.</span>`;
      if (dialogBtnLabel) dialogBtnLabel.textContent = '🟢 Arquivo Vinculado e Salvando no PC';
    } else {
      if (container) {
        container.innerHTML = `<span>Minhas Finanças Pro • Todos os dados podem ser salvos em arquivo permanente no PC. <button type="button" id="footerLearnMoreBtn" style="background:none; border:none; color:var(--brand); font-weight:800; cursor:pointer; text-decoration:underline; padding:0;">Saber mais</button>.</span>`;
        const btn = $('#footerLearnMoreBtn');
        if (btn) btn.addEventListener('click', openBackup);
      }
      if (dialogBtnLabel) dialogBtnLabel.textContent = 'Vincular Arquivo Permanente no PC (.json)';
    }
  }

  function openBackup() {
    $('#backupDialog').showModal();
  }

  function isPhysicalFileLinked() {
    return localFileHandle !== null;
  }

  // Listeners do domínio de Backup
  $('#backupBtn')?.addEventListener('click', openBackup);
  $('#linkLocalFileBtn')?.addEventListener('click', linkPhysicalFile);

  $('#exportBtn')?.addEventListener('click', () => {
    const state = getState();
    const blob = new Blob([JSON.stringify({ app: 'Minhas Finanças Pro', exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `minhas-financas-backup-${state.year}-${String(state.month).padStart(2, '0')}.json`;
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
  window.saveToPhysicalFile = saveToPhysicalFile;
  window.updateSyncBadge = updateSyncBadge;
  window.isPhysicalFileLinked = isPhysicalFileLinked;

})();
