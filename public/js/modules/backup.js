/* ==========================================================================
   MÓDULO DE BACKUP E RESTAURAÇÃO DE DADOS (backup.js)
   OmniFin - Vanilla JS Architecture
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

  async function persistImportedState(parsedJson) {
    if (typeof window.isStateHydrated === 'function' && !window.isStateHydrated()) {
      notify('Aguarde a sincronização inicial antes de importar dados.', 'warning');
      return false;
    }

    const state = getState();
    const activeRevision = Number(state.revision || 0);
    const rawData = parsedJson.data || parsedJson;

    // Remover identificadores de usuário ou metadados de documento antigo
    if (rawData._id) delete rawData._id;
    if (rawData.userId) delete rawData.userId;
    if (rawData.id) delete rawData.id;

    // Migrar schema preservando a revisão atual do servidor
    const nextState = migrateState(rawData);
    nextState.revision = activeRevision;

    const payload = Object.assign({}, nextState, {
      expectedRevision: activeRevision
    });

    try {
      let response;
      if (window.API && typeof API.saveFinances === 'function') {
        response = await API.saveFinances(payload);
      } else {
        const token = (window.API && typeof API.getToken === 'function')
          ? API.getToken()
          : (typeof localStorage !== 'undefined' ? (localStorage.getItem('auth_token') || localStorage.getItem('token') || localStorage.getItem('financas_pro_jwt_token')) : null);

        if (!token) {
          // Se não há token nem API (ambiente mock/offline), aplica no state local
          response = { success: true, revision: activeRevision + 1 };
        } else {
          const endpoint = (window.API && typeof API.resolveUrl === 'function') ? API.resolveUrl('/api/finances') : '/api/finances';
          const res = await fetch(endpoint, {
            method: 'PUT',
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          if (res.status === 409) {
            const conflictData = await res.json();
            if (typeof handleConcurrencyConflict === 'function') {
              await handleConcurrencyConflict(conflictData);
            }
            notify('Conflito de versão detectado. Sincronize com o servidor e tente novamente.', 'warning');
            return false;
          }
          response = await res.json();
        }
      }

      if (response && response.conflict) {
        if (typeof handleConcurrencyConflict === 'function') {
          await handleConcurrencyConflict(response);
        }
        notify('Conflito de versão detectado. Sincronize com o servidor e tente novamente.', 'warning');
        return false;
      }

      if (response && response.success) {
        // Atualiza a revisão confirmada pelo MongoDB
        if (typeof response.revision === 'number') {
          nextState.revision = response.revision;
        } else if (response.data && typeof response.data.revision === 'number') {
          nextState.revision = response.data.revision;
        } else {
          nextState.revision = activeRevision + 1;
        }

        // Somente após o 200 do backend, substitui o state em memória
        Object.keys(state).forEach(k => delete state[k]);
        Object.assign(state, nextState);

        if (typeof saveLocalState === 'function') {
          saveLocalState();
        }
        $('#backupDialog')?.close();
        render();
        notify('Backup importado e salvo com sucesso no servidor!', 'success');
        return true;
      } else {
        notify('Erro ao salvar backup no servidor: ' + ((response && response.message) || 'Falha na gravação.'), 'error');
        return false;
      }
    } catch (err) {
      console.error('Erro na persistência do backup:', err);
      notify('Erro de conexão ao enviar backup para o servidor.', 'error');
      return false;
    }
  }

  $('#importBtn')?.addEventListener('click', () => $('#importFile').click());

  $('#importFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!confirm('Substituir todos os dados atuais pelo backup selecionado?')) return;
      await persistImportedState(parsed);
    } catch (err) {
      console.error('Falha ao processar arquivo de backup:', err);
      notify('Arquivo de backup inválido.', 'error');
    } finally {
      e.target.value = '';
    }
  });

  // APIs públicas do Módulo de Backup
  window.openBackup = openBackup;
  window.persistImportedState = persistImportedState;

})();
