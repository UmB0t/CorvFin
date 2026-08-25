const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config/config');
const {
  validateEmail,
  validateStrongPassword,
  hashPassword,
  comparePassword,
  generateToken
} = require('./services/authService');
const {
  getUsers,
  saveUsers,
  getPermissions,
  savePermissions,
  getDefaultPermissions,
  saveDefaultPermissions,
  getUserPermissions,
  setUserPermissions,
  getUserFinances,
  saveUserFinances,
  getAllFinances,
  saveAllFinances
} = require('./services/storageService');
const { authMiddleware, adminOnlyMiddleware } = require('./middleware/auth');
const { requirePermission } = require('./middleware/permissions');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ==========================================================================
   AUTH ROUTES
   ========================================================================== */

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nome, login, email, senha, notificacoes_ativas } = req.body;

    if (!nome || !login || !email || !senha) {
      return res.status(400).json({
        success: false,
        message: 'Todos os campos (nome, login, email e senha) são obrigatórios.'
      });
    }

    const cleanLogin = login.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    // Validate email format
    const emailCheck = validateEmail(cleanEmail);
    if (!emailCheck.valid) {
      return res.status(400).json({ success: false, message: emailCheck.message });
    }

    // Check password strength
    const pwdCheck = validateStrongPassword(senha);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, message: pwdCheck.message });
    }

    const users = getUsers();

    if (users.some(u => u.login === cleanLogin)) {
      return res.status(400).json({ success: false, message: 'Este login já está em uso por outro usuário.' });
    }

    if (users.some(u => u.email === cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Este e-mail já está cadastrado.' });
    }

    const hashedPassword = await hashPassword(senha);
    const isFirstUser = users.length === 0;

    const newUser = {
      id: 'usr_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      nome: nome.trim(),
      login: cleanLogin,
      email: cleanEmail,
      senha: hashedPassword,
      is_admin: isFirstUser,
      notificacoes_ativas: !!notificacoes_ativas,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    // Initial permissions based on defaults
    const defaultPerms = getDefaultPermissions();
    const permissions = setUserPermissions(newUser.id, Object.assign({}, defaultPerms, {
      configuracoes: isFirstUser
    }));

    // Create initial finances 100% clean and zeroed
    getUserFinances(newUser.id, newUser.nome, 0);

    const token = generateToken(newUser, permissions);

    return res.status(201).json({
      success: true,
      message: isFirstUser
        ? 'Conta de Administrador criada com sucesso!'
        : 'Cadastro realizado com sucesso!',
      token,
      user: {
        id: newUser.id,
        nome: newUser.nome,
        login: newUser.login,
        email: newUser.email,
        is_admin: newUser.is_admin,
        notificacoes_ativas: newUser.notificacoes_ativas,
        permissions
      }
    });
  } catch (err) {
    console.error('Erro no registro:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao cadastrar usuário.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, senha } = req.body;

    if (!login || !senha) {
      return res.status(400).json({ success: false, message: 'Informe o login/e-mail e a senha.' });
    }

    const cleanInput = login.trim().toLowerCase();
    const users = getUsers();
    const user = users.find(u => u.login === cleanInput || u.email === cleanInput);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Credenciais inválidas. Verifique os dados.' });
    }

    const isMatch = await comparePassword(senha, user.senha);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Credenciais inválidas. Verifique os dados.' });
    }

    const permissions = getUserPermissions(user.id);
    const token = generateToken(user, permissions);

    return res.json({
      success: true,
      message: `Bem-vindo de volta, ${user.nome}!`,
      token,
      user: {
        id: user.id,
        nome: user.nome,
        login: user.login,
        email: user.email,
        is_admin: !!user.is_admin,
        notificacoes_ativas: !!user.notificacoes_ativas,
        permissions
      }
    });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao autenticar.' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

// PUT /api/auth/profile
app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  try {
    const { nome, email, notificacoes_ativas, novaSenha } = req.body;
    const users = getUsers();
    const user = users.find(u => u.id === req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    if (nome) user.nome = nome.trim();
    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      if (users.some(u => u.id !== user.id && u.email === cleanEmail)) {
        return res.status(400).json({ success: false, message: 'Este e-mail já está em uso por outro usuário.' });
      }
      user.email = cleanEmail;
    }
    if (typeof notificacoes_ativas === 'boolean') {
      user.notificacoes_ativas = notificacoes_ativas;
    }
    if (novaSenha) {
      const pwdCheck = validateStrongPassword(novaSenha);
      if (!pwdCheck.valid) {
        return res.status(400).json({ success: false, message: pwdCheck.message });
      }
      user.senha = await hashPassword(novaSenha);
    }

    saveUsers(users);

    return res.json({
      success: true,
      message: 'Perfil atualizado com sucesso!',
      user: {
        id: user.id,
        nome: user.nome,
        login: user.login,
        email: user.email,
        is_admin: user.is_admin,
        notificacoes_ativas: user.notificacoes_ativas,
        permissions: getUserPermissions(user.id)
      }
    });
  } catch (err) {
    console.error('Erro ao atualizar perfil:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao atualizar perfil.' });
  }
});

/* ==========================================================================
   FINANCES ROUTES (PER-USER DATA)
   ========================================================================== */

// GET /api/finances
app.get('/api/finances', authMiddleware, (req, res) => {
  try {
    const finances = getUserFinances(req.user.id, req.user.nome);
    return res.json({ success: true, data: finances });
  } catch (err) {
    console.error('Erro buscando finanças:', err);
    return res.status(500).json({ success: false, message: 'Erro ao buscar dados financeiros.' });
  }
});

// PUT /api/finances
app.put('/api/finances', authMiddleware, (req, res) => {
  try {
    const updatedData = req.body;
    const saved = saveUserFinances(req.user.id, updatedData);
    return res.json({ success: true, message: 'Dados financeiros salvos com sucesso.', data: saved });
  } catch (err) {
    console.error('Erro salvando finanças:', err);
    return res.status(500).json({ success: false, message: 'Erro ao salvar dados financeiros.' });
  }
});

/* ==========================================================================
   ADMIN ROUTES (USERS & RBAC PERMISSIONS)
   ========================================================================== */

// GET /api/admin/users
app.get('/api/admin/users', authMiddleware, adminOnlyMiddleware, (req, res) => {
  try {
    const users = getUsers();
    const permissions = getPermissions();
    const safeUsers = users.map(u => ({
      id: u.id,
      nome: u.nome,
      login: u.login,
      email: u.email,
      is_admin: !!u.is_admin,
      notificacoes_ativas: !!u.notificacoes_ativas,
      createdAt: u.createdAt,
      permissions: permissions[u.id] || getUserPermissions(u.id)
    }));
    return res.json({ success: true, users: safeUsers });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro ao listar usuários.' });
  }
});

// POST /api/admin/users - Criar usuário via painel admin
app.post('/api/admin/users', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const { nome, login, email, senha, is_admin, notificacoes_ativas } = req.body;

    if (!nome || !login || !email || !senha) {
      return res.status(400).json({ success: false, message: 'Preencha todos os campos obrigatórios.' });
    }

    const cleanLogin = login.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    const emailCheck = validateEmail(cleanEmail);
    if (!emailCheck.valid) {
      return res.status(400).json({ success: false, message: emailCheck.message });
    }

    const pwdCheck = validateStrongPassword(senha);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, message: pwdCheck.message });
    }

    const users = getUsers();
    if (users.some(u => u.login === cleanLogin)) {
      return res.status(400).json({ success: false, message: 'Este login já está em uso.' });
    }
    if (users.some(u => u.email === cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Este e-mail já está cadastrado.' });
    }

    const hashedPassword = await hashPassword(senha);
    const newUser = {
      id: 'usr_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      nome: nome.trim(),
      login: cleanLogin,
      email: cleanEmail,
      senha: hashedPassword,
      is_admin: !!is_admin,
      notificacoes_ativas: typeof notificacoes_ativas === 'boolean' ? notificacoes_ativas : true,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    const defaultPerms = getDefaultPermissions();
    setUserPermissions(newUser.id, Object.assign({}, defaultPerms, {
      configuracoes: !!is_admin
    }));

    getUserFinances(newUser.id, newUser.nome, 0);

    return res.status(201).json({
      success: true,
      message: `Usuário "${newUser.nome}" criado com sucesso!`,
      user: {
        id: newUser.id,
        nome: newUser.nome,
        login: newUser.login,
        email: newUser.email,
        is_admin: newUser.is_admin,
        notificacoes_ativas: newUser.notificacoes_ativas
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro ao cadastrar novo usuário.' });
  }
});

// PUT /api/admin/users/:userId - Editar usuário via painel admin
app.put('/api/admin/users/:userId', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { nome, login, email, is_admin, notificacoes_ativas, novaSenha } = req.body;
    const users = getUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    if (nome) user.nome = nome.trim();
    if (login) {
      const cleanLogin = login.trim().toLowerCase();
      if (users.some(u => u.id !== userId && u.login === cleanLogin)) {
        return res.status(400).json({ success: false, message: 'Este login já está em uso por outro usuário.' });
      }
      user.login = cleanLogin;
    }
    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const emailCheck = validateEmail(cleanEmail);
      if (!emailCheck.valid) {
        return res.status(400).json({ success: false, message: emailCheck.message });
      }
      if (users.some(u => u.id !== userId && u.email === cleanEmail)) {
        return res.status(400).json({ success: false, message: 'Este e-mail já está em uso por outro usuário.' });
      }
      user.email = cleanEmail;
    }
    if (typeof is_admin === 'boolean') {
      user.is_admin = is_admin;
    }
    if (typeof notificacoes_ativas === 'boolean') {
      user.notificacoes_ativas = notificacoes_ativas;
    }
    if (novaSenha && novaSenha.trim()) {
      const pwdCheck = validateStrongPassword(novaSenha);
      if (!pwdCheck.valid) {
        return res.status(400).json({ success: false, message: pwdCheck.message });
      }
      user.senha = await hashPassword(novaSenha);
    }

    saveUsers(users);
    return res.json({ success: true, message: `Dados do usuário "${user.nome}" atualizados com sucesso!` });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro ao atualizar dados do usuário.' });
  }
});

// PUT /api/admin/users/:userId/role
app.put('/api/admin/users/:userId/role', authMiddleware, adminOnlyMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const { is_admin } = req.body;
    const users = getUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    user.is_admin = !!is_admin;
    saveUsers(users);

    return res.json({ success: true, message: `Papel do usuário "${user.nome}" atualizado.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro ao alterar papel do usuário.' });
  }
});

// PUT /api/admin/users/:userId/password
app.put('/api/admin/users/:userId/password', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { novaSenha } = req.body;

    const pwdCheck = validateStrongPassword(novaSenha);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, message: pwdCheck.message });
    }

    const users = getUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    user.senha = await hashPassword(novaSenha);
    saveUsers(users);

    return res.json({ success: true, message: `Senha do usuário "${user.nome}" redefinida com sucesso.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro ao redefinir senha.' });
  }
});

// DELETE /api/admin/users/:userId
app.delete('/api/admin/users/:userId', authMiddleware, adminOnlyMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Você não pode excluir sua própria conta de administrador.' });
    }

    let users = getUsers();
    users = users.filter(u => u.id !== userId);
    saveUsers(users);

    const permissions = getPermissions();
    delete permissions[userId];
    savePermissions(permissions);

    const allFinances = getAllFinances();
    delete allFinances[userId];
    saveAllFinances(allFinances);

    return res.json({ success: true, message: 'Usuário e dados removidos com sucesso.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro ao excluir usuário.' });
  }
});

// PUT /api/admin/permissions/:userId
app.put('/api/admin/permissions/:userId', authMiddleware, adminOnlyMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ success: false, message: 'Objeto de permissões inválido.' });
    }

    const updated = setUserPermissions(userId, permissions);
    return res.json({ success: true, message: 'Permissões atualizadas com sucesso.', permissions: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro ao salvar permissões.' });
  }
});

// GET /api/admin/default-permissions
app.get('/api/admin/default-permissions', authMiddleware, adminOnlyMiddleware, (req, res) => {
  try {
    const permissions = getDefaultPermissions();
    return res.json({ success: true, permissions });
  } catch (err) {
    console.error('Erro ao buscar permissões padrão:', err);
    return res.status(500).json({ success: false, message: 'Erro ao buscar permissões padrão.' });
  }
});

// POST & PUT /api/admin/default-permissions
const saveDefaultPermissionsHandler = (req, res) => {
  try {
    const permissions = req.body.permissions || req.body;
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ success: false, message: 'Objeto de permissões inválido.' });
    }

    const permsToSave = {
      despesas: permissions.despesas !== false,
      extras: permissions.extras !== false,
      devedores: permissions.devedores !== false,
      investimentos: permissions.investimentos !== false,
      beneficios: permissions.beneficios !== false,
      compras: permissions.compras !== false,
      simulacao: permissions.simulacao !== false
    };

    saveDefaultPermissions(permsToSave);
    return res.json({ success: true, message: 'Permissões padrão salvas com sucesso!', permissions: permsToSave });
  } catch (err) {
    console.error('Erro ao salvar permissões padrão:', err);
    return res.status(500).json({ success: false, message: 'Erro ao salvar permissões padrão.' });
  }
};

app.post('/api/admin/default-permissions', authMiddleware, adminOnlyMiddleware, saveDefaultPermissionsHandler);
app.put('/api/admin/default-permissions', authMiddleware, adminOnlyMiddleware, saveDefaultPermissionsHandler);

/* ==========================================================================
   STATIC & FALLBACK ROUTES
   ========================================================================== */
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start Server
app.listen(config.PORT, () => {
  console.log(`====================================================`);
  console.log(`  Finanças Pro Server rodando na porta: ${config.PORT}`);
  console.log(`  Acesse: http://localhost:${config.PORT}`);
  console.log(`====================================================`);
});
