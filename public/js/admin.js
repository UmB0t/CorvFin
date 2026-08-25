/**
 * Finanças Pro - Módulo Administrativo & Controle Granular de Permissões RBAC
 */
const AdminModule = (() => {
  let usersList = [];

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // Load registered users from API
  async function loadUsers() {
    if (typeof API === 'undefined' || !API.getUsers) return [];
    try {
      const res = await API.getUsers();
      if (res && res.success && Array.isArray(res.users)) {
        usersList = res.users;
      }
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
    }
    return usersList;
  }

  // Update granular permission for a user
  async function togglePermission(userId, moduleKey, isChecked) {
    const user = usersList.find(u => u.id === userId);
    if (!user) return;

    user.permissions = user.permissions || {};
    user.permissions[moduleKey] = isChecked;

    try {
      const res = await API.updatePermissions(userId, user.permissions);
      if (res && res.success) {
        notify(`Permissão de "${moduleKey}" atualizada para ${user.nome}!`, 'success');
      } else {
        notify(res.message || 'Erro ao salvar permissão.', 'error');
      }
    } catch (err) {
      notify('Falha na comunicação com o servidor.', 'error');
    }
  }

  // Open Create User Modal
  function openCreateUserModal() {
    let modal = document.getElementById('adminUserCreateDialog');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'adminUserCreateDialog';
      modal.style.cssText = 'max-width: 500px; width: 95%; border: none; border-radius: 16px; background: var(--surface); color: var(--text); padding: 0; box-shadow: 0 20px 40px rgba(0,0,0,0.25);';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <form id="formAdminCreateUser" style="padding: 24px; display: grid; gap: 14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:12px;">
          <h3 style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text);">+ Cadastrar Novo Usuário</h3>
          <button type="button" class="icon-btn small" id="btnCloseCreateUser">✕</button>
        </div>

        <div class="field">
          <label style="font-size:0.8rem; font-weight:700; color:var(--muted);">Nome Completo</label>
          <input type="text" id="adminCreateNome" required placeholder="Ex: Carlos Silva" style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text);">
        </div>

        <div class="field">
          <label style="font-size:0.8rem; font-weight:700; color:var(--muted);">Login / Nome de Usuário</label>
          <input type="text" id="adminCreateLogin" required placeholder="Ex: carlossilva" style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text);">
        </div>

        <div class="field">
          <label style="font-size:0.8rem; font-weight:700; color:var(--muted);">E-mail</label>
          <input type="email" id="adminCreateEmail" required placeholder="carlos@empresa.com" style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text);">
        </div>

        <div class="field">
          <label style="font-size:0.8rem; font-weight:700; color:var(--muted);">Senha Provisória (Mín. 8 caracteres, maiúsc, minúsc, num e símb)</label>
          <input type="password" id="adminCreateSenha" required placeholder="••••••••" style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text);">
        </div>

        <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
          <input type="checkbox" id="adminCreateIsAdmin" style="width:16px; height:16px;">
          <label for="adminCreateIsAdmin" style="font-size:0.85rem; font-weight:700; cursor:pointer;">Conceder perfil de Administrador</label>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
          <button type="button" class="btn soft" id="btnCancelCreateUser">Cancelar</button>
          <button type="submit" class="btn primary">Criar Usuário</button>
        </div>
      </form>
    `;

    document.getElementById('btnCloseCreateUser')?.addEventListener('click', () => modal.close());
    document.getElementById('btnCancelCreateUser')?.addEventListener('click', () => modal.close());

    document.getElementById('formAdminCreateUser')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('adminCreateNome').value.trim();
      const login = document.getElementById('adminCreateLogin').value.trim();
      const email = document.getElementById('adminCreateEmail').value.trim();
      const senha = document.getElementById('adminCreateSenha').value;
      const is_admin = document.getElementById('adminCreateIsAdmin').checked;

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        notify('Informe um e-mail válido.', 'error');
        return;
      }

      try {
        const res = await API.createUser({ nome, login, email, senha, is_admin });
        if (res && res.success) {
          modal.close();
          notify(res.message || 'Usuário criado com sucesso!', 'success');
          render();
        } else {
          notify(res.message || 'Erro ao criar usuário.', 'error');
        }
      } catch (err) {
        notify('Erro de conexão.', 'error');
      }
    });

    modal.showModal();
  }

  // Open Edit User Modal
  function openEditUserModal(userId) {
    const user = usersList.find(u => u.id === userId);
    if (!user) return;

    let modal = document.getElementById('adminUserEditDialog');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'adminUserEditDialog';
      modal.style.cssText = 'max-width: 500px; width: 95%; border: none; border-radius: 16px; background: var(--surface); color: var(--text); padding: 0; box-shadow: 0 20px 40px rgba(0,0,0,0.25);';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <form id="formAdminEditUser" style="padding: 24px; display: grid; gap: 14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:12px;">
          <h3 style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text);">Editar Usuário</h3>
          <button type="button" class="icon-btn small" id="btnCloseEditUser">✕</button>
        </div>

        <div class="field">
          <label style="font-size:0.8rem; font-weight:700; color:var(--muted);">Nome Completo</label>
          <input type="text" id="adminEditNome" value="${escapeHtml(user.nome)}" required style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text);">
        </div>

        <div class="field">
          <label style="font-size:0.8rem; font-weight:700; color:var(--muted);">Login / Nome de Usuário</label>
          <input type="text" id="adminEditLogin" value="${escapeHtml(user.login)}" required style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text);">
        </div>

        <div class="field">
          <label style="font-size:0.8rem; font-weight:700; color:var(--muted);">E-mail</label>
          <input type="email" id="adminEditEmail" value="${escapeHtml(user.email)}" required style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text);">
        </div>

        <div class="field">
          <label style="font-size:0.8rem; font-weight:700; color:var(--muted);">Redefinir Senha (opcional, deixe em branco para manter)</label>
          <input type="password" id="adminEditNovaSenha" placeholder="Deixe em branco para não alterar" style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text);">
        </div>

        <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
          <input type="checkbox" id="adminEditIsAdmin" ${user.is_admin ? 'checked' : ''} style="width:16px; height:16px;">
          <label for="adminEditIsAdmin" style="font-size:0.85rem; font-weight:700; cursor:pointer;">Perfil de Administrador</label>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
          <button type="button" class="btn soft" id="btnCancelEditUser">Cancelar</button>
          <button type="submit" class="btn primary">Salvar Alterações</button>
        </div>
      </form>
    `;

    document.getElementById('btnCloseEditUser')?.addEventListener('click', () => modal.close());
    document.getElementById('btnCancelEditUser')?.addEventListener('click', () => modal.close());

    document.getElementById('formAdminEditUser')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('adminEditNome').value.trim();
      const login = document.getElementById('adminEditLogin').value.trim();
      const email = document.getElementById('adminEditEmail').value.trim();
      const is_admin = document.getElementById('adminEditIsAdmin').checked;
      const novaSenha = document.getElementById('adminEditNovaSenha').value;

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        notify('Informe um e-mail válido.', 'error');
        return;
      }

      try {
        const payload = { nome, login, email, is_admin };
        if (novaSenha && novaSenha.trim()) payload.novaSenha = novaSenha.trim();

        const res = await API.updateUser(userId, payload);
        if (res && res.success) {
          modal.close();
          notify(res.message || 'Dados do usuário atualizados com sucesso!', 'success');
          render();
        } else {
          notify(res.message || 'Erro ao atualizar usuário.', 'error');
        }
      } catch (err) {
        notify('Erro de conexão.', 'error');
      }
    });

    modal.showModal();
  }

  // Delete User
  async function handleDeleteUser(userId) {
    const user = usersList.find(u => u.id === userId);
    if (!user) return;

    if (confirm(`Atenção: Deseja realmente excluir permanentemente a conta de "${user.nome}" e todos os seus dados associados? Esta ação é irreversível.`)) {
      try {
        const res = await API.deleteUser(userId);
        if (res && res.success) {
          usersList = usersList.filter(u => u.id !== userId);
          render();
          notify('Usuário e dados excluídos com sucesso!', 'success');
        } else {
          notify(res.message || 'Erro ao excluir usuário.', 'error');
        }
      } catch (err) {
        notify('Erro de conexão.', 'error');
      }
    }
  }

  // Render Table in specified container
  async function render() {
    const loggedUser = API.getUser();
    const isAdmin = !!loggedUser?.is_admin;

    // Support both tab-admin and view-config containers
    const tableBody = document.getElementById('adminUsersTableBody');
    const adminTab = document.getElementById('tab-admin');
    const sidebarAdminLink = document.getElementById('sidebarAdminLink');

    if (sidebarAdminLink) {
      sidebarAdminLink.style.display = isAdmin ? 'flex' : 'none';
    }

    if (!isAdmin) {
      if (adminTab) {
        adminTab.innerHTML = `
          <div class="card" style="padding:32px; text-align:center; color:var(--muted);">
            <h3 style="font-size:1.15rem; color:var(--text); margin-bottom:8px;">Acesso Restrito</h3>
            <p>O módulo de gestão de usuários e controle de permissões é exclusivo para administradores.</p>
          </div>
        `;
      }
      return;
    }

    await loadUsers();

    if (tableBody) {
      tableBody.innerHTML = usersList.map(u => {
        const perms = u.permissions || { despesas: true, extras: true, devedores: true, investimentos: true, beneficios: true, simulacao: true, configuracoes: false };
        const isSelf = u.id === loggedUser?.id;

        return `
          <tr style="border-bottom:1px solid var(--line); transition:background 0.15s ease;">
            <td style="padding:14px 16px;">
              <strong style="color:var(--text); font-size:0.92rem;">${escapeHtml(u.nome)}</strong>
              <div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">Criado em: ${u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : 'N/A'}</div>
            </td>
            <td style="padding:14px 16px; font-family:monospace; color:var(--brand-strong); font-weight:700;">
              @${escapeHtml(u.login)}
            </td>
            <td style="padding:14px 16px; color:var(--muted); font-size:0.85rem;">
              ${escapeHtml(u.email)}
            </td>
            <td style="padding:14px 16px; text-align:center;">
              <span class="tag" style="background:${u.is_admin ? 'var(--brand-soft)' : 'var(--surface-2)'}; color:${u.is_admin ? 'var(--brand)' : 'var(--muted)'}; font-weight:800; font-size:0.75rem; padding:4px 8px; border-radius:6px;">
                ${u.is_admin ? '👑 Admin' : '👤 Usuário'}
              </span>
            </td>
            <td style="padding:14px 16px; text-align:center;">
              <div style="display:inline-flex; gap:6px; flex-wrap:wrap; justify-content:center;">
                <label class="tag" style="background:var(--surface-2); font-size:0.7rem; cursor:pointer; display:flex; align-items:center; gap:4px; padding:3px 6px;">
                  <input type="checkbox" data-perm-toggle="${u.id}" data-module="despesas" ${perms.despesas !== false ? 'checked' : ''} ${u.is_admin ? 'disabled' : ''}> Desp
                </label>
                <label class="tag" style="background:var(--surface-2); font-size:0.7rem; cursor:pointer; display:flex; align-items:center; gap:4px; padding:3px 6px;">
                  <input type="checkbox" data-perm-toggle="${u.id}" data-module="extras" ${perms.extras !== false ? 'checked' : ''} ${u.is_admin ? 'disabled' : ''}> Extra
                </label>
                <label class="tag" style="background:var(--surface-2); font-size:0.7rem; cursor:pointer; display:flex; align-items:center; gap:4px; padding:3px 6px;">
                  <input type="checkbox" data-perm-toggle="${u.id}" data-module="devedores" ${perms.devedores !== false ? 'checked' : ''} ${u.is_admin ? 'disabled' : ''}> Dev
                </label>
                <label class="tag" style="background:var(--surface-2); font-size:0.7rem; cursor:pointer; display:flex; align-items:center; gap:4px; padding:3px 6px;">
                  <input type="checkbox" data-perm-toggle="${u.id}" data-module="investimentos" ${perms.investimentos !== false ? 'checked' : ''} ${u.is_admin ? 'disabled' : ''}> Invest
                </label>
                <label class="tag" style="background:var(--surface-2); font-size:0.7rem; cursor:pointer; display:flex; align-items:center; gap:4px; padding:3px 6px;">
                  <input type="checkbox" data-perm-toggle="${u.id}" data-module="beneficios" ${perms.beneficios !== false ? 'checked' : ''} ${u.is_admin ? 'disabled' : ''}> Benef
                </label>
                <label class="tag" style="background:var(--surface-2); font-size:0.7rem; cursor:pointer; display:flex; align-items:center; gap:4px; padding:3px 6px;">
                  <input type="checkbox" data-perm-toggle="${u.id}" data-module="simulacao" ${perms.simulacao !== false ? 'checked' : ''} ${u.is_admin ? 'disabled' : ''}> Simul
                </label>
              </div>
            </td>
            <td style="padding:14px 16px; text-align:right; white-space:nowrap;">
              <button type="button" class="btn soft small" data-edit-user="${u.id}" style="margin-right:4px;">✏️ Editar</button>
              <button type="button" class="btn danger small" data-del-user="${u.id}" ${isSelf ? 'disabled style="opacity:0.3;"' : ''} title="${isSelf ? 'Você não pode excluir sua própria conta' : 'Excluir Usuário'}">🗑️</button>
            </td>
          </tr>
        `;
      }).join('');

      // Wire events in table
      tableBody.querySelectorAll('[data-perm-toggle]').forEach(chk => {
        chk.addEventListener('change', () => {
          const userId = chk.getAttribute('data-perm-toggle');
          const moduleKey = chk.getAttribute('data-module');
          togglePermission(userId, moduleKey, chk.checked);
        });
      });

      tableBody.querySelectorAll('[data-edit-user]').forEach(btn => {
        btn.addEventListener('click', () => {
          const userId = btn.getAttribute('data-edit-user');
          openEditUserModal(userId);
        });
      });

      tableBody.querySelectorAll('[data-del-user]').forEach(btn => {
        btn.addEventListener('click', () => {
          const userId = btn.getAttribute('data-del-user');
          handleDeleteUser(userId);
        });
      });
    }

    const btnNew = document.getElementById('btnAdminNewUser');
    if (btnNew) {
      btnNew.onclick = openCreateUserModal;
    }
  }

  document.addEventListener('tabChanged', (e) => {
    if (e.detail && (e.detail.tabId === 'tab-admin' || e.detail.tabId === 'tab-config')) {
      render();
    }
  });

  return {
    render,
    openCreateUserModal,
    openEditUserModal,
    handleDeleteUser,
    loadUsers
  };
})();

// Global registration
window.AdminModule = AdminModule;
