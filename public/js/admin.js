/**
 * Finanças Pro - Módulo Administrativo & Controle Granular de Permissões RBAC
 */
const AdminModule = (() => {
  const USERS_PER_PAGE = 10;
  let currentUsersPage = 1;
  let usersList = [];

  const ALL_MODULES_CONFIG = [
    {
      key: 'dashboard',
      name: 'Dashboard',
      desc: 'Visão consolidada, totalizadores, matriz e drill-down analítico',
      iconSvg: `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`
    },
    {
      key: 'despesas',
      name: 'Despesas',
      desc: 'Gestão de despesas fixas, variáveis, parcelamentos e orçamentos',
      iconSvg: `<svg class="svg-icon" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`
    },
    {
      key: 'extras',
      name: 'Rendas Extras',
      desc: 'Gestão de receitas adicionais, freelances e bonificações',
      iconSvg: `<svg class="svg-icon" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`
    },
    {
      key: 'devedores',
      name: 'Devedores',
      desc: 'Controle de valores a receber, cobranças e parcelas de terceiros',
      iconSvg: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
    },
    {
      key: 'investimentos',
      name: 'Investimentos',
      desc: 'Acompanhamento patrimonial, aportes e metas financeiras',
      iconSvg: `<svg class="svg-icon" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`
    },
    {
      key: 'beneficios',
      name: 'Benefícios',
      desc: 'Controle de benefícios corporativos (VA, VR, Saúde, etc.)',
      iconSvg: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="6" x2="6" y2="4"/><line x1="10" y1="6" x2="10" y2="4"/><line x1="14" y1="6" x2="14" y2="4"/></svg>`
    },
    {
      key: 'compras',
      name: 'Lista de Compras',
      desc: 'Planejamento e controle de compras com catálogo e autocomplete',
      iconSvg: `<svg class="svg-icon" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`
    },
    {
      key: 'simulacao',
      name: 'Simulação',
      desc: 'Simulador de novos gastos e parcelamentos em sandbox seguro',
      iconSvg: `<svg class="svg-icon" viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`
    }
  ];

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // Toast / Feedback Helper
  function showFeedback(msg, type = 'success') {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else if (typeof notify === 'function') {
      notify(msg, type);
    }
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

  // Open Manage Modules Modal for a specific user
  function openManageModulesModal(userId) {
    const user = usersList.find(u => u.id === userId);
    if (!user) return;

    let modal = document.getElementById('adminManageModulesDialog');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'adminManageModulesDialog';
      modal.style.cssText = 'max-width: 620px; width: 95%; border: none; border-radius: 20px; background: var(--surface); color: var(--text); padding: 0; box-shadow: 0 20px 40px rgba(0,0,0,0.3);';
      document.body.appendChild(modal);
    }

    const perms = user.permissions || {};

    modal.innerHTML = `
      <form id="formAdminManageModules" style="padding: 24px; display: grid; gap: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:14px;">
          <div>
            <h3 style="margin:0; font-size:1.2rem; font-weight:850; color:var(--text); display:flex; align-items:center; gap:8px;">
              <svg class="svg-icon" viewBox="0 0 24 24" style="stroke:var(--brand); width:20px; height:20px;">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              Gerenciar Módulos
            </h3>
            <p style="margin:3px 0 0; color:var(--muted); font-size:0.82rem; font-weight:600;">
              Permissões de <strong>${escapeHtml(user.nome)}</strong> (@${escapeHtml(user.login)})
            </p>
          </div>
          <button type="button" class="icon-btn small" id="btnCloseManageModules" style="display:flex; align-items:center; justify-content:center;" aria-label="Fechar">
            <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px; stroke-width:2.5;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style="max-height: calc(75vh - 140px); overflow-y: auto; padding-right: 4px;">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:10px;">
            ${ALL_MODULES_CONFIG.map(m => {
              const isEnabled = perms[m.key] !== false;
              return `
                <div class="module-perm-card" style="background:var(--surface-2); padding:12px 14px; border-radius:12px; border:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; transition:all 0.15s ease;">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:32px; height:32px; border-radius:8px; background:var(--brand-soft); color:var(--brand-strong); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                      ${m.iconSvg}
                    </div>
                    <div>
                      <div style="font-weight:750; font-size:0.88rem; color:var(--text);">${escapeHtml(m.name)}</div>
                      <span id="perm-status-badge-${m.key}" class="badge ${isEnabled ? 'success' : 'soft'}" style="font-size:0.68rem; margin-top:2px; display:inline-block;">
                        ${isEnabled ? 'Liberado' : 'Bloqueado'}
                      </span>
                    </div>
                  </div>
                  <label for="managePerm_${m.key}" style="position:relative; display:inline-block; width:44px; height:24px; cursor:pointer; margin:0;">
                    <input type="checkbox" id="managePerm_${m.key}" data-manage-module="${m.key}" ${isEnabled ? 'checked' : ''} style="opacity:0; width:0; height:0; position:absolute;">
                    <span class="maint-slider" style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:${isEnabled ? 'var(--brand)' : 'var(--surface-3, #d1d5db)'}; transition:0.3s; border-radius:24px; display:flex; align-items:center;">
                      <span style="position:absolute; content:''; height:18px; width:18px; left:${isEnabled ? '22px' : '3px'}; bottom:3px; background:white; transition:0.3s; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,0.3);"></span>
                    </span>
                  </label>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid var(--line); padding-top:14px; margin-top:2px;">
          <button type="button" class="btn soft" id="btnCancelManageModules">Cancelar</button>
          <button type="submit" class="btn primary" id="btnSaveManageModules" style="font-weight:800;">Salvar Permissões</button>
        </div>
      </form>
    `;

    // Interactive slider & badge visual toggles inside modal
    modal.querySelectorAll('[data-manage-module]').forEach(chk => {
      chk.addEventListener('change', () => {
        const key = chk.getAttribute('data-manage-module');
        const badge = document.getElementById(`perm-status-badge-${key}`);
        const slider = chk.nextElementSibling;
        const knob = slider ? slider.firstElementChild : null;
        const isChecked = chk.checked;

        if (badge) {
          badge.className = `badge ${isChecked ? 'success' : 'soft'}`;
          badge.textContent = isChecked ? 'Liberado' : 'Bloqueado';
        }
        if (slider) {
          slider.style.background = isChecked ? 'var(--brand)' : 'var(--surface-3, #d1d5db)';
        }
        if (knob) {
          knob.style.left = isChecked ? '22px' : '3px';
        }
      });
    });

    document.getElementById('btnCloseManageModules')?.addEventListener('click', () => modal.close());
    document.getElementById('btnCancelManageModules')?.addEventListener('click', () => modal.close());

    document.getElementById('formAdminManageModules')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btnSaveManageModules');
      const originalText = saveBtn ? saveBtn.innerHTML : 'Salvar Permissões';

      const payload = {};
      ALL_MODULES_CONFIG.forEach(m => {
        const chk = modal.querySelector(`[data-manage-module="${m.key}"]`);
        payload[m.key] = chk ? chk.checked : true;
      });

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';
      }

      try {
        const res = await API.updatePermissions(userId, payload);
        if (res && res.success) {
          user.permissions = res.permissions || payload;
          modal.close();
          showFeedback(`Permissões de "${user.nome}" atualizadas com sucesso!`, 'success');
          renderUsersTable();
        } else {
          showFeedback(res?.message || 'Erro ao salvar permissões.', 'error');
        }
      } catch (err) {
        showFeedback('Erro de conexão ao salvar permissões.', 'error');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalText;
        }
      }
    });

    modal.showModal();
  }

  // Open Create User Modal
  async function openCreateUserModal() {
    let defaultPerms = {
      dashboard: true,
      despesas: true,
      extras: true,
      devedores: true,
      investimentos: true,
      beneficios: true,
      compras: true,
      simulacao: true
    };
    try {
      if (typeof API !== 'undefined' && API.getDefaultPermissions) {
        const res = await API.getDefaultPermissions();
        if (res && res.success && res.permissions) {
          defaultPerms = res.permissions;
        }
      }
    } catch (err) {
      console.error('Erro ao buscar permissões padrão para modal:', err);
    }

    let modal = document.getElementById('adminUserCreateDialog');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'adminUserCreateDialog';
      modal.style.cssText = 'max-width: 520px; width: 95%; border: none; border-radius: 16px; background: var(--surface); color: var(--text); padding: 0; box-shadow: 0 20px 40px rgba(0,0,0,0.25);';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <form id="formAdminCreateUser" style="padding: 24px; display: grid; gap: 14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:12px;">
          <h3 style="margin:0; font-size:1.15rem; font-weight:800; color:var(--text);">+ Cadastrar Novo Usuário</h3>
          <button type="button" class="icon-btn small" id="btnCloseCreateUser" style="display:flex; align-items:center; justify-content:center;" aria-label="Fechar">
            <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px; stroke-width:2.5;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
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
          <input type="checkbox" id="adminCreateIsAdmin" style="width:16px; height:16px; accent-color:var(--brand); cursor:pointer;">
          <label for="adminCreateIsAdmin" style="font-size:0.85rem; font-weight:700; cursor:pointer;">Conceder perfil de Administrador</label>
        </div>

        <div style="border-top:1px solid var(--line); padding-top:12px; margin-top:2px;">
          <label style="font-size:0.8rem; font-weight:700; color:var(--muted); display:block; margin-bottom:8px;">Módulos com Acesso Liberado (Herdados do Padrão)</label>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:8px; font-size:0.78rem; background:var(--surface-2); padding:10px; border-radius:10px; border:1px solid var(--line);">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600;">
              <input type="checkbox" id="adminCreatePerm_dashboard" ${defaultPerms.dashboard !== false ? 'checked' : ''} style="accent-color:var(--brand);"> Dashboard
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600;">
              <input type="checkbox" id="adminCreatePerm_despesas" ${defaultPerms.despesas !== false ? 'checked' : ''} style="accent-color:var(--brand);"> Despesas
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600;">
              <input type="checkbox" id="adminCreatePerm_extras" ${defaultPerms.extras !== false ? 'checked' : ''} style="accent-color:var(--brand);"> Rendas Extras
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600;">
              <input type="checkbox" id="adminCreatePerm_devedores" ${defaultPerms.devedores !== false ? 'checked' : ''} style="accent-color:var(--brand);"> Devedores
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600;">
              <input type="checkbox" id="adminCreatePerm_investimentos" ${defaultPerms.investimentos !== false ? 'checked' : ''} style="accent-color:var(--brand);"> Investimentos
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600;">
              <input type="checkbox" id="adminCreatePerm_beneficios" ${defaultPerms.beneficios !== false ? 'checked' : ''} style="accent-color:var(--brand);"> Benefícios
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600;">
              <input type="checkbox" id="adminCreatePerm_compras" ${defaultPerms.compras !== false ? 'checked' : ''} style="accent-color:var(--brand);"> Compras
            </label>
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600;">
              <input type="checkbox" id="adminCreatePerm_simulacao" ${defaultPerms.simulacao !== false ? 'checked' : ''} style="accent-color:var(--brand);"> Simulação
            </label>
          </div>
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
        showFeedback('Informe um e-mail válido.', 'error');
        return;
      }

      const permissions = {
        dashboard: !!document.getElementById('adminCreatePerm_dashboard')?.checked,
        despesas: !!document.getElementById('adminCreatePerm_despesas')?.checked,
        extras: !!document.getElementById('adminCreatePerm_extras')?.checked,
        devedores: !!document.getElementById('adminCreatePerm_devedores')?.checked,
        investimentos: !!document.getElementById('adminCreatePerm_investimentos')?.checked,
        beneficios: !!document.getElementById('adminCreatePerm_beneficios')?.checked,
        compras: !!document.getElementById('adminCreatePerm_compras')?.checked,
        simulacao: !!document.getElementById('adminCreatePerm_simulacao')?.checked
      };

      try {
        const res = await API.createUser({ nome, login, email, senha, is_admin, permissions });
        if (res && res.success) {
          modal.close();
          showFeedback(res.message || 'Usuário criado com sucesso!', 'success');
          await loadUsers();
          renderUsersTable();
        } else {
          showFeedback(res.message || 'Erro ao criar usuário.', 'error');
        }
      } catch (err) {
        showFeedback('Erro de conexão.', 'error');
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
          <button type="button" class="icon-btn small" id="btnCloseEditUser" style="display:flex; align-items:center; justify-content:center;" aria-label="Fechar">
            <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px; stroke-width:2.5;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
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
          <input type="checkbox" id="adminEditIsAdmin" ${user.is_admin ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--brand); cursor:pointer;">
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
        showFeedback('Informe um e-mail válido.', 'error');
        return;
      }

      try {
        const payload = { nome, login, email, is_admin };
        if (novaSenha && novaSenha.trim()) payload.novaSenha = novaSenha.trim();

        const res = await API.updateUser(userId, payload);
        if (res && res.success) {
          modal.close();
          showFeedback(res.message || 'Dados do usuário atualizados com sucesso!', 'success');
          await loadUsers();
          renderUsersTable();
        } else {
          showFeedback(res.message || 'Erro ao atualizar usuário.', 'error');
        }
      } catch (err) {
        showFeedback('Erro de conexão.', 'error');
      }
    });

    modal.showModal();
  }

  // Helper for compact page numbers
  function getPageNumbers(current, total) {
    if (total <= 7) {
      const pages = [];
      for (let i = 1; i <= total; i++) pages.push(i);
      return pages;
    }
    if (current <= 4) {
      return [1, 2, 3, 4, 5, '...', total];
    }
    if (current >= total - 3) {
      return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    }
    return [1, '...', current - 1, current, current + 1, '...', total];
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
          const totalPages = Math.max(1, Math.ceil(usersList.length / USERS_PER_PAGE));
          if (currentUsersPage > totalPages) currentUsersPage = totalPages;
          if (currentUsersPage < 1) currentUsersPage = 1;
          renderUsersTable();
          showFeedback('Usuário e dados excluídos com sucesso!', 'success');
        } else {
          showFeedback(res.message || 'Erro ao excluir usuário.', 'error');
        }
      } catch (err) {
        showFeedback('Erro de conexão.', 'error');
      }
    }
  }

  // Render Paginated Users Table and Pagination Controls
  function renderUsersTable() {
    const loggedUser = (typeof API !== 'undefined' && API.getUser) ? API.getUser() : null;
    const tableBody = document.getElementById('adminUsersTableBody');
    const paginationContainer = document.getElementById('adminUsersPagination');

    const totalUsers = usersList.length;
    const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PER_PAGE));

    if (currentUsersPage > totalPages) currentUsersPage = totalPages;
    if (currentUsersPage < 1) currentUsersPage = 1;

    const startIdx = (currentUsersPage - 1) * USERS_PER_PAGE;
    const endIdx = Math.min(startIdx + USERS_PER_PAGE, totalUsers);
    const pagedUsers = usersList.slice(startIdx, endIdx);

    if (tableBody) {
      if (pagedUsers.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" style="padding:36px 16px; text-align:center; color:var(--muted);">
              <div style="font-weight:700; font-size:0.95rem;">Nenhum usuário cadastrado.</div>
            </td>
          </tr>
        `;
      } else {
        tableBody.innerHTML = pagedUsers.map(u => {
          const perms = u.permissions || {};
          const activeCount = ALL_MODULES_CONFIG.filter(m => perms[m.key] !== false).length;
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
                <span class="tag" style="background:${u.is_admin ? 'var(--brand-soft)' : 'var(--surface-2)'}; color:${u.is_admin ? 'var(--brand)' : 'var(--muted)'}; font-weight:800; font-size:0.75rem; padding:4px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                  ${u.is_admin
                    ? '<svg class="svg-icon" viewBox="0 0 24 24" style="width:13px; height:13px; stroke-width:2.2;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Admin'
                    : '<svg class="svg-icon" viewBox="0 0 24 24" style="width:13px; height:13px; stroke-width:2.2;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Usuário'}
                </span>
              </td>
              <td style="padding:14px 16px; text-align:center;">
                ${u.is_admin ? `
                  <span class="tag" style="background:var(--brand-soft); color:var(--brand-strong); font-weight:800; font-size:0.75rem; padding:4px 10px; border-radius:6px; display:inline-flex; align-items:center; gap:5px;">
                    <svg class="svg-icon" viewBox="0 0 24 24" style="width:13px; height:13px; stroke-width:2.2;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Admin — Acesso Total
                  </span>
                ` : `
                  <div style="display:inline-flex; align-items:center; gap:8px;">
                    <span class="badge ${activeCount > 0 ? 'info' : 'soft'}" style="font-weight:800; font-size:0.78rem;">
                      ${activeCount} de ${ALL_MODULES_CONFIG.length} liberados
                    </span>
                    <button type="button" class="btn small soft" data-manage-modules="${u.id}" style="border-radius:8px; font-weight:750; font-size:0.75rem; padding:4px 8px; display:inline-flex; align-items:center; gap:4px;" data-tooltip="Gerenciar permissões de módulos deste usuário" aria-label="Gerenciar Módulos">
                      <svg class="svg-icon" viewBox="0 0 24 24" style="width:12px; height:12px; stroke-width:2.2;"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                      Gerenciar
                    </button>
                  </div>
                `}
              </td>
              <td style="padding:14px 16px; text-align:right; white-space:nowrap;">
                <button type="button" class="btn soft small" data-edit-user="${u.id}" style="margin-right:4px; display:inline-flex; align-items:center; gap:4px;" data-tooltip="Editar Usuário" aria-label="Editar Usuário">
                  <svg class="svg-icon" viewBox="0 0 24 24" style="width:13px; height:13px; stroke-width:2.2;"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                  Editar
                </button>
                <button type="button" class="btn danger small" data-del-user="${u.id}" ${isSelf ? 'disabled style="opacity:0.3;"' : ''} data-tooltip="${isSelf ? 'Você não pode excluir sua própria conta' : 'Excluir Usuário'}" aria-label="${isSelf ? 'Você não pode excluir sua própria conta' : 'Excluir Usuário'}" style="display:inline-flex; align-items:center; justify-content:center;">
                  <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px; stroke-width:2.2;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </td>
            </tr>
          `;
        }).join('');

        // Wire events in table
        tableBody.querySelectorAll('[data-manage-modules]').forEach(btn => {
          btn.addEventListener('click', () => {
            const userId = btn.getAttribute('data-manage-modules');
            openManageModulesModal(userId);
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
    }

    if (paginationContainer) {
      if (totalUsers === 0) {
        paginationContainer.innerHTML = '';
        paginationContainer.style.display = 'none';
      } else if (totalPages <= 1) {
        paginationContainer.style.display = 'flex';
        paginationContainer.innerHTML = `
          <span class="admin-users-summary" style="font-size:0.84rem; color:var(--muted); font-weight:600;">
            Mostrando 1–${totalUsers} de ${totalUsers} usuários
          </span>
        `;
      } else {
        paginationContainer.style.display = 'flex';
        const pageNumbers = getPageNumbers(currentUsersPage, totalPages);
        const pageNumbersHtml = pageNumbers.map(p => {
          if (p === '...') {
            return `<span class="admin-page-ellipsis">…</span>`;
          }
          if (p === currentUsersPage) {
            return `<button type="button" class="btn small primary admin-page-num active" aria-current="page" aria-label="Página ${p}">${p}</button>`;
          }
          return `<button type="button" class="btn small soft admin-page-num" data-page="${p}" aria-label="Ir para página ${p}">${p}</button>`;
        }).join('');

        paginationContainer.innerHTML = `
          <span class="admin-users-summary" style="font-size:0.84rem; color:var(--muted); font-weight:600;">
            Mostrando ${startIdx + 1}–${endIdx} de ${totalUsers} usuários
          </span>
          <div class="admin-pagination-controls" style="display:flex; align-items:center; gap:4px;">
            <button type="button" class="btn small soft admin-page-btn" id="btnAdminUsersPrev" ${currentUsersPage === 1 ? 'disabled' : ''} aria-label="Página anterior">
              ‹ Anterior
            </button>
            <div class="admin-page-numbers" style="display:flex; align-items:center; gap:4px;">
              ${pageNumbersHtml}
            </div>
            <button type="button" class="btn small soft admin-page-btn" id="btnAdminUsersNext" ${currentUsersPage === totalPages ? 'disabled' : ''} aria-label="Próxima página">
              Próxima ›
            </button>
          </div>
        `;

        const prevBtn = paginationContainer.querySelector('#btnAdminUsersPrev');
        if (prevBtn) {
          prevBtn.addEventListener('click', () => {
            if (currentUsersPage > 1) {
              currentUsersPage--;
              renderUsersTable();
            }
          });
        }

        const nextBtn = paginationContainer.querySelector('#btnAdminUsersNext');
        if (nextBtn) {
          nextBtn.addEventListener('click', () => {
            if (currentUsersPage < totalPages) {
              currentUsersPage++;
              renderUsersTable();
            }
          });
        }

        paginationContainer.querySelectorAll('.admin-page-num[data-page]').forEach(btn => {
          btn.addEventListener('click', () => {
            const pageNum = parseInt(btn.getAttribute('data-page'), 10);
            if (pageNum && pageNum >= 1 && pageNum <= totalPages) {
              currentUsersPage = pageNum;
              renderUsersTable();
            }
          });
        });
      }
    }
  }

  // Render Table in specified container
  async function render() {
    const loggedUser = (typeof API !== 'undefined' && API.getUser) ? API.getUser() : null;
    const isAdmin = !!loggedUser?.is_admin;

    // Support both tab-admin and view-config containers
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
    renderUsersTable();

    const btnNew = document.getElementById('btnAdminNewUser');
    if (btnNew) {
      btnNew.onclick = (e) => {
        if (e) e.preventDefault();
        openCreateUserModal();
      };
    }

    const btnSaveDefault = document.getElementById('btn-save-default-perms');
    if (btnSaveDefault) {
      btnSaveDefault.onclick = (e) => saveDefaultPermissions(e);
    }

    const btnSaveMaint = document.getElementById('btn-save-maintenance');
    if (btnSaveMaint) {
      btnSaveMaint.onclick = (e) => saveMaintenanceConfig(e);
    }

    await loadDefaultPermissions();
    await loadMaintenanceConfig();
  }

  // Load Default Permissions for new users
  async function loadDefaultPermissions() {
    try {
      let perms = null;
      if (typeof API !== 'undefined' && API.getDefaultPermissions) {
        const res = await API.getDefaultPermissions();
        if (res && res.success && res.permissions) {
          perms = res.permissions;
        }
      } else {
        const token = localStorage.getItem('token') || localStorage.getItem('fp_token');
        const endpoint = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/api/admin/default-permissions') : '/api/admin/default-permissions';
        const res = await fetch(endpoint, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data && data.success && data.permissions) {
          perms = data.permissions;
        }
      }

      if (perms) {
        const modules = ['dashboard', 'despesas', 'extras', 'devedores', 'investimentos', 'beneficios', 'compras', 'simulacao'];
        modules.forEach(m => {
          const el = document.getElementById(`default-perm-${m}`) || document.querySelector(`[data-default-module="${m}"]`);
          if (el) {
            el.checked = perms[m] !== false;
          }
        });
      }
    } catch (err) {
      console.error('Erro ao carregar permissões padrão:', err);
    }
  }

  // Save Default Permissions for new users
  async function saveDefaultPermissions(e) {
    if (e) {
      e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }

    const btn = document.getElementById('btn-save-default-perms');
    const originalText = btn ? btn.innerHTML : 'Salvar Permissões Padrão';

    const permissions = {
      dashboard: !!(document.getElementById('default-perm-dashboard') || document.querySelector('[data-default-module="dashboard"]'))?.checked,
      despesas: !!(document.getElementById('default-perm-despesas') || document.querySelector('[data-default-module="despesas"]'))?.checked,
      extras: !!(document.getElementById('default-perm-extras') || document.querySelector('[data-default-module="extras"]'))?.checked,
      devedores: !!(document.getElementById('default-perm-devedores') || document.querySelector('[data-default-module="devedores"]'))?.checked,
      investimentos: !!(document.getElementById('default-perm-investimentos') || document.querySelector('[data-default-module="investimentos"]'))?.checked,
      beneficios: !!(document.getElementById('default-perm-beneficios') || document.querySelector('[data-default-module="beneficios"]'))?.checked,
      compras: !!(document.getElementById('default-perm-compras') || document.querySelector('[data-default-module="compras"]'))?.checked,
      simulacao: !!(document.getElementById('default-perm-simulacao') || document.querySelector('[data-default-module="simulacao"]'))?.checked
    };

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Salvando...';
    }

    try {
      let res;
      if (typeof API !== 'undefined' && API.saveDefaultPermissions) {
        res = await API.saveDefaultPermissions(permissions);
      } else {
        const token = localStorage.getItem('token') || localStorage.getItem('fp_token');
        const endpoint = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/api/admin/default-permissions') : '/api/admin/default-permissions';
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ permissions })
        });
        res = await resp.json();
      }

      if (res && res.success) {
        showFeedback(res.message || "Permissões padrão salvas com sucesso!", "success");
      } else {
        showFeedback(res?.message || "Erro ao salvar permissões padrão.", "error");
      }
    } catch (err) {
      console.error('Erro ao salvar permissões padrão:', err);
      showFeedback('Erro de conexão ao salvar permissões padrão.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  }

  // Maintenance Configuration State
  let currentMaintenanceConfig = {};

  function normalizeMaintenanceConfig(rawConfig) {
    const normalized = {};
    ALL_MODULES_CONFIG.forEach(mod => {
      const key = mod.key;
      const raw = (rawConfig && typeof rawConfig === 'object') ? rawConfig[key] : null;
      let isMaint = false;
      let name = mod.name;

      if (typeof raw === 'boolean') {
        isMaint = raw === true;
      } else if (raw && typeof raw === 'object') {
        if (typeof raw.maintenance === 'boolean') {
          isMaint = raw.maintenance === true;
        }
        if (raw.name) {
          name = raw.name;
        }
      }

      normalized[key] = {
        name: name,
        maintenance: isMaint
      };
    });
    return normalized;
  }

  // Load Maintenance Configuration
  async function loadMaintenanceConfig() {
    const grid = document.getElementById('adminMaintenanceGrid');
    const saveBtn = document.getElementById('btn-save-maintenance');
    if (!grid) return;

    grid.innerHTML = '<div style="grid-column: 1 / -1; padding: 16px; color: var(--muted); text-align: center; font-size: 0.88rem;">Carregando status de manutenção...</div>';
    if (saveBtn) saveBtn.disabled = true;

    try {
      let data = null;
      if (typeof API !== 'undefined' && API.getMaintenanceConfig) {
        const res = await API.getMaintenanceConfig();
        if (res && res.success && res.maintenance) {
          data = res.maintenance;
        } else if (res && !res.success) {
          showFeedback(res.message || 'Erro ao buscar status de manutenção.', 'error');
        }
      } else {
        const token = localStorage.getItem('token') || localStorage.getItem('fp_token');
        const endpoint = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/api/admin/maintenance') : '/api/admin/maintenance';
        const resp = await fetch(endpoint, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const res = await resp.json();
        if (res && res.success && res.maintenance) {
          data = res.maintenance;
        }
      }

      currentMaintenanceConfig = normalizeMaintenanceConfig(data);
      renderMaintenanceGrid();
    } catch (err) {
      console.error('Erro ao carregar manutenção:', err);
      currentMaintenanceConfig = normalizeMaintenanceConfig(null);
      renderMaintenanceGrid();
      showFeedback('Falha de conexão com o servidor.', 'error');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function renderMaintenanceGrid() {
    const grid = document.getElementById('adminMaintenanceGrid');
    if (!grid) return;

    const normalizedConfig = normalizeMaintenanceConfig(currentMaintenanceConfig);

    grid.innerHTML = ALL_MODULES_CONFIG.map(modConfig => {
      const key = modConfig.key;
      const mod = normalizedConfig[key];
      const isMaint = mod.maintenance === true;
      const modName = mod.name || modConfig.name;

      return `
        <div style="background:var(--surface-2); padding:14px 16px; border-radius:12px; border:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; transition:border-color 0.2s ease;">
          <div>
            <div style="font-weight:700; font-size:0.92rem; color:var(--text);">${escapeHtml(modName)}</div>
            <div id="maintenance-status-badge-${key}" style="font-size:0.75rem; font-weight:800; margin-top:3px; display:inline-flex; align-items:center; gap:4px; color:${isMaint ? 'var(--warning, #f59e0b)' : 'var(--success, #10b981)'};">
              <span style="width:6px; height:6px; border-radius:50%; background:${isMaint ? 'var(--warning, #f59e0b)' : 'var(--success, #10b981)'};"></span>
              ${isMaint ? 'Em Manutenção' : 'Operacional'}
            </div>
          </div>
          <label style="position:relative; display:inline-block; width:44px; height:24px; cursor:pointer;">
            <input type="checkbox" id="maint-toggle-${key}" data-maintenance-module="${key}" ${isMaint ? 'checked' : ''} style="opacity:0; width:0; height:0; position:absolute;">
            <span class="maint-slider" style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:${isMaint ? 'var(--warning, #f59e0b)' : 'var(--surface-3, #d1d5db)'}; transition:0.3s; border-radius:24px; display:flex; align-items:center;">
              <span style="position:absolute; content:''; height:18px; width:18px; left:${isMaint ? '22px' : '3px'}; bottom:3px; background:white; transition:0.3s; border-radius:50%; box-shadow:0 1px 3px rgba(0,0,0,0.3);"></span>
            </span>
          </label>
        </div>
      `;
    }).join('');

    // Listener para feedback visual imediato ao alternar o toggle
    grid.querySelectorAll('[data-maintenance-module]').forEach(chk => {
      chk.addEventListener('change', () => {
        const key = chk.getAttribute('data-maintenance-module');
        const badge = document.getElementById(`maintenance-status-badge-${key}`);
        const slider = chk.nextElementSibling;
        const knob = slider ? slider.firstElementChild : null;
        const isChecked = chk.checked;

        if (badge) {
          badge.style.color = isChecked ? 'var(--warning, #f59e0b)' : 'var(--success, #10b981)';
          badge.innerHTML = `<span style="width:6px; height:6px; border-radius:50%; background:${isChecked ? 'var(--warning, #f59e0b)' : 'var(--success, #10b981)'};"></span> ${isChecked ? 'Em Manutenção' : 'Operacional'}`;
        }
        if (slider) {
          slider.style.background = isChecked ? 'var(--warning, #f59e0b)' : 'var(--surface-3, #d1d5db)';
        }
        if (knob) {
          knob.style.left = isChecked ? '22px' : '3px';
        }
      });
    });
  }

  // Save Maintenance Configuration
  async function saveMaintenanceConfig(e) {
    if (e) {
      e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }

    const btn = document.getElementById('btn-save-maintenance');
    const originalText = btn ? btn.innerHTML : 'Salvar Configurações';

    const grid = document.getElementById('adminMaintenanceGrid');
    if (!grid) return;

    const payload = {};
    grid.querySelectorAll('[data-maintenance-module]').forEach(chk => {
      const key = chk.getAttribute('data-maintenance-module');
      payload[key] = chk.checked === true;
    });

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner" style="width:14px; height:14px; border:2px solid currentColor; border-top-color:transparent; border-radius:50%; display:inline-block; animation:spin 0.6s linear infinite; margin-right:6px;"></span> Salvando...';
    }

    try {
      let res = null;
      if (typeof API !== 'undefined' && API.saveMaintenanceConfig) {
        res = await API.saveMaintenanceConfig(payload);
      } else {
        const token = localStorage.getItem('token') || localStorage.getItem('fp_token');
        const endpoint = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/api/admin/maintenance') : '/api/admin/maintenance';
        const resp = await fetch(endpoint, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ maintenance: payload })
        });
        res = await resp.json();
      }

      if (res && res.success) {
        if (res.maintenance) {
          currentMaintenanceConfig = normalizeMaintenanceConfig(res.maintenance);
          renderMaintenanceGrid();
        }
        showFeedback(res.message || 'Configurações de manutenção atualizadas com sucesso!', 'success');
      } else {
        showFeedback(res?.message || 'Erro ao salvar configurações de manutenção.', 'error');
      }
    } catch (err) {
      console.error('Erro ao salvar manutenção:', err);
      showFeedback('Erro de conexão ao salvar configurações.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  }

  document.addEventListener('tabChanged', (e) => {
    if (e.detail && (e.detail.tabId === 'tab-admin' || e.detail.tabId === 'tab-config')) {
      render();
    }
  });

  return {
    render,
    renderUsersTable,
    loadDefaultPermissions,
    saveDefaultPermissions,
    loadMaintenanceConfig,
    saveMaintenanceConfig,
    openCreateUserModal,
    openEditUserModal,
    openManageModulesModal,
    handleDeleteUser,
    loadUsers,
    getCurrentPage: () => currentUsersPage,
    setCurrentPage: (p) => {
      const totalPages = Math.max(1, Math.ceil(usersList.length / USERS_PER_PAGE));
      currentUsersPage = Math.max(1, Math.min(p, totalPages));
      renderUsersTable();
    },
    getUsersPerPage: () => USERS_PER_PAGE,
    getTotalPages: () => Math.max(1, Math.ceil(usersList.length / USERS_PER_PAGE)),
    getUsersList: () => usersList,
    setUsersList: (list) => {
      usersList = Array.isArray(list) ? list : [];
      const totalPages = Math.max(1, Math.ceil(usersList.length / USERS_PER_PAGE));
      if (currentUsersPage > totalPages) currentUsersPage = totalPages;
      if (currentUsersPage < 1) currentUsersPage = 1;
    },
    prevPage: () => {
      if (currentUsersPage > 1) {
        currentUsersPage--;
        renderUsersTable();
      }
    },
    nextPage: () => {
      const totalPages = Math.max(1, Math.ceil(usersList.length / USERS_PER_PAGE));
      if (currentUsersPage < totalPages) {
        currentUsersPage++;
        renderUsersTable();
      }
    },
    goToPage: (p) => {
      const totalPages = Math.max(1, Math.ceil(usersList.length / USERS_PER_PAGE));
      if (p >= 1 && p <= totalPages) {
        currentUsersPage = p;
        renderUsersTable();
      }
    }
  };
})();

// Global registration
window.AdminModule = AdminModule;
