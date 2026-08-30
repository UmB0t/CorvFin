const express = require('express');
const path = require('path');
const cors = require('cors');
const config = require('./config/config');
const {
  validateStrongPassword,
  validateEmail,
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
  getMaintenanceConfig,
  saveMaintenanceConfig,
  getUserPermissions,
  setUserPermissions,
  getUserFinances,
  saveUserFinances,
  getAllFinances,
  saveAllFinances
} = require('./services/storageService');
const { authMiddleware, adminOnlyMiddleware } = require('./middleware/auth');

const app = express();

// Middlewares Globais
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Endpoint para fornecer BASE_PATH ao frontend dinamicamente
app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.__BASE_PATH__ = ${JSON.stringify(config.BASE_PATH || '')};`);
});

app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    basePath: config.BASE_PATH || ''
  });
});

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ==========================================================================
   HELPERS & REGRAS DE NEGÓCIO
   ========================================================================== */
function generateUserId() {
  return 'usr_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function sanitizeUser(user) {
  if (!user) return null;
  const { senha, ...safe } = user;
  return safe;
}

/* ==========================================================================
   AUTH ROUTES
   ========================================================================== */

// POST /api/auth/register - Cadastro público
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nome, login, email, senha } = req.body;

    if (!nome || !login || !email || !senha) {
      return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios.' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Formato de e-mail inválido.' });
    }

    const pwdCheck = validateStrongPassword(senha);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, message: pwdCheck.message });
    }

    const users = await getUsers();
    const cleanLogin = login.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (users.some(u => u.login.toLowerCase() === cleanLogin)) {
      return res.status(409).json({ success: false, message: 'Este nome de usuário (login) já está em uso.' });
    }

    if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ success: false, message: 'Este e-mail já está cadastrado.' });
    }

    const hashedPassword = await hashPassword(senha);
    const isFirstUser = users.length === 0;

    const newUser = {
      id: generateUserId(),
      nome: nome.trim(),
      login: cleanLogin,
      email: cleanEmail,
      senha: hashedPassword,
      is_admin: isFirstUser, // Primeiro usuário vira admin automaticamente
      notificacoes_ativas: true,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    await saveUsers(users);

    // Carrega e aplica as permissões padrão configuradas no sistema
    const defaultPerms = await getDefaultPermissions();
    const finalPerms = Object.assign({}, defaultPerms, {
      configuracoes: newUser.is_admin
    });

    const permissions = await setUserPermissions(newUser.id, finalPerms);

    // Inicializa template de finanças para novo usuário (com onboarding.welcomeSeen = false)
    await getUserFinances(newUser.id, newUser.nome, 0, true);

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'Conta criada com sucesso!',
      token,
      user: {
        id: newUser.id,
        login: newUser.login,
        nome: newUser.nome,
        email: newUser.email,
        is_admin: newUser.is_admin,
        notificacoes_ativas: newUser.notificacoes_ativas,
        permissions
      }
    });
  } catch (err) {
    console.error('Erro no registro:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao criar conta.' });
  }
});

// POST /api/auth/login - Autenticação
app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, senha } = req.body;

    if (!login || !senha) {
      return res.status(400).json({ success: false, message: 'Usuário/E-mail e senha são obrigatórios.' });
    }

    const users = await getUsers();
    const cleanLogin = login.trim().toLowerCase();

    // Permite login tanto por 'login' quanto por 'email'
    const user = users.find(u => u.login.toLowerCase() === cleanLogin || u.email.toLowerCase() === cleanLogin);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Credenciais inválidas. Verifique seu usuário e senha.' });
    }

    const passwordMatch = await comparePassword(senha, user.senha);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Credenciais inválidas. Verifique seu usuário e senha.' });
    }

    const token = generateToken(user);
    const permissions = await getUserPermissions(user.id);

    return res.json({
      success: true,
      message: 'Login realizado com sucesso!',
      token,
      user: {
        id: user.id,
        login: user.login,
        nome: user.nome,
        email: user.email,
        is_admin: !!user.is_admin,
        notificacoes_ativas: !!user.notificacoes_ativas,
        permissions
      }
    });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao realizar login.' });
  }
});

// GET /api/auth/me - Obter dados do usuário logado
app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

// PUT /api/auth/profile - Atualizar perfil do usuário logado
app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  try {
    const { nome, email, notificacoes_ativas, senhaAtual, novaSenha } = req.body;
    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === req.user.id);

    if (userIndex === -1) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const user = users[userIndex];

    // Se informou nova senha, valida e atualiza
    if (novaSenha) {
      if (!senhaAtual) {
        return res.status(400).json({ success: false, message: 'Informe sua senha atual para definir uma nova.' });
      }
      const match = await comparePassword(senhaAtual, user.senha);
      if (!match) {
        return res.status(400).json({ success: false, message: 'Senha atual incorreta.' });
      }
      const pwdCheck = validateStrongPassword(novaSenha);
      if (!pwdCheck.valid) {
        return res.status(400).json({ success: false, message: pwdCheck.message });
      }
      user.senha = await hashPassword(novaSenha);
    }

    if (nome && nome.trim()) user.nome = nome.trim();
    if (email && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      if (!validateEmail(cleanEmail)) {
        return res.status(400).json({ success: false, message: 'Formato de e-mail inválido.' });
      }
      // Verifica duplicidade de e-mail com outros usuários
      if (users.some(u => u.id !== req.user.id && u.email.toLowerCase() === cleanEmail)) {
        return res.status(409).json({ success: false, message: 'Este e-mail já está sendo utilizado por outra conta.' });
      }
      user.email = cleanEmail;
    }

    if (typeof notificacoes_ativas === 'boolean') {
      user.notificacoes_ativas = notificacoes_ativas;
    }

    users[userIndex] = user;
    await saveUsers(users);

    const token = generateToken(user);

    return res.json({
      success: true,
      message: 'Perfil atualizado com sucesso!',
      token,
      user: {
        id: user.id,
        login: user.login,
        nome: user.nome,
        email: user.email,
        is_admin: !!user.is_admin,
        notificacoes_ativas: !!user.notificacoes_ativas,
        permissions: await getUserPermissions(user.id)
      }
    });
  } catch (err) {
    console.error('Erro ao atualizar perfil:', err);
    return res.status(500).json({ success: false, message: 'Erro ao atualizar perfil.' });
  }
});

/* ==========================================================================
   FINANCES DATA ROUTES
   ========================================================================== */

// GET /api/finances - Obter dados financeiros do usuário logado
app.get('/api/finances', authMiddleware, async (req, res) => {
  try {
    const finances = await getUserFinances(req.user.id, req.user.nome);
    return res.json(finances);
  } catch (err) {
    console.error('Erro ao obter finanças:', err);
    return res.status(500).json({ success: false, message: 'Erro ao carregar dados financeiros.' });
  }
});

// PUT /api/finances - Salvar dados financeiros do usuário logado
app.put('/api/finances', authMiddleware, async (req, res) => {
  try {
    const updatedData = req.body;
    if (!updatedData || typeof updatedData !== 'object') {
      return res.status(400).json({ success: false, message: 'Payload inválido.' });
    }

    const saved = await saveUserFinances(req.user.id, updatedData);
    return res.json({
      success: true,
      message: 'Dados salvos com sucesso!',
      revision: saved.revision,
      lastModified: saved.lastModified,
      data: saved
    });
  } catch (err) {
    if (err.status === 409 || err.code === 'CONCURRENCY_CONFLICT') {
      return res.status(409).json({
        success: false,
        conflict: true,
        message: 'Conflito de concorrência: os dados foram atualizados em outro dispositivo.',
        currentRevision: err.currentRevision,
        expectedRevision: err.expectedRevision
      });
    }
    console.error('Erro ao salvar finanças:', err);
    return res.status(500).json({ success: false, message: 'Erro ao salvar dados financeiros.' });
  }
});

/* ==========================================================================
   ADMIN MANAGEMENT ROUTES
   ========================================================================== */

// GET /api/admin/users - Listar todos os usuários com suas permissões
app.get('/api/admin/users', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const users = await getUsers();
    const permissions = await getPermissions();

    const safeUsers = users.map(u => {
      const { senha, ...safe } = u;
      return {
        ...safe,
        is_admin: !!safe.is_admin,
        notificacoes_ativas: !!safe.notificacoes_ativas,
        permissions: permissions[u.id] || {
          dashboard: true,
          despesas: true,
          extras: true,
          devedores: true,
          investimentos: true,
          beneficios: true,
          compras: true,
          simulacao: true,
          configuracoes: !!safe.is_admin
        }
      };
    });

    return res.json({ success: true, users: safeUsers });
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    return res.status(500).json({ success: false, message: 'Erro ao carregar lista de usuários.' });
  }
});

// POST /api/admin/users - Criar novo usuário pelo painel admin
app.post('/api/admin/users', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const { nome, login, email, senha, is_admin, notificacoes_ativas, permissions } = req.body;

    if (!nome || !login || !email || !senha) {
      return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios.' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Formato de e-mail inválido.' });
    }

    const pwdCheck = validateStrongPassword(senha);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, message: pwdCheck.message });
    }

    const users = await getUsers();
    const cleanLogin = login.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (users.some(u => u.login.toLowerCase() === cleanLogin)) {
      return res.status(409).json({ success: false, message: 'Este login já está em uso.' });
    }

    if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ success: false, message: 'Este e-mail já está cadastrado.' });
    }

    const hashedPassword = await hashPassword(senha);

    const newUser = {
      id: generateUserId(),
      nome: nome.trim(),
      login: cleanLogin,
      email: cleanEmail,
      senha: hashedPassword,
      is_admin: !!is_admin,
      notificacoes_ativas: typeof notificacoes_ativas === 'boolean' ? notificacoes_ativas : true,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    await saveUsers(users);

    const defaultPerms = await getDefaultPermissions();
    const finalPerms = Object.assign({}, defaultPerms, permissions || {}, {
      configuracoes: newUser.is_admin
    });

    const userPerms = await setUserPermissions(newUser.id, finalPerms);
    // Inicializa template de finanças para novo usuário criado via admin (onboarding.welcomeSeen = false)
    await getUserFinances(newUser.id, newUser.nome, 0, true);

    return res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso!',
      user: {
        ...sanitizeUser(newUser),
        permissions: userPerms
      }
    });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    return res.status(500).json({ success: false, message: 'Erro ao criar usuário.' });
  }
});

// PUT /api/admin/users/:userId - Editar usuário pelo painel admin
app.put('/api/admin/users/:userId', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { nome, email, notificacoes_ativas, is_admin, novaSenha } = req.body;

    const users = await getUsers();
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const user = users[userIndex];

    // Proteção contra auto-lockout administrativo
    if (typeof is_admin === 'boolean') {
      if (userId === req.user.id && !is_admin) {
        return res.status(400).json({ success: false, message: 'Você não pode remover seus próprios privilégios de administrador.' });
      }
      user.is_admin = is_admin;
    }

    // Redefinição de senha se fornecida
    if (novaSenha && String(novaSenha).trim()) {
      const pwdCheck = validateStrongPassword(novaSenha);
      if (!pwdCheck.valid) {
        return res.status(400).json({ success: false, message: pwdCheck.message });
      }
      user.senha = await hashPassword(novaSenha);
    }

    if (nome && nome.trim()) user.nome = nome.trim();
    if (email && email.trim()) {
      const cleanEmail = email.trim().toLowerCase();
      if (!validateEmail(cleanEmail)) {
        return res.status(400).json({ success: false, message: 'Formato de e-mail inválido.' });
      }
      if (users.some(u => u.id !== userId && u.email.toLowerCase() === cleanEmail)) {
        return res.status(409).json({ success: false, message: 'E-mail já está sendo utilizado por outro usuário.' });
      }
      user.email = cleanEmail;
    }

    if (typeof notificacoes_ativas === 'boolean') {
      user.notificacoes_ativas = notificacoes_ativas;
    }

    users[userIndex] = user;
    await saveUsers(users);

    return res.json({
      success: true,
      message: 'Usuário atualizado com sucesso!',
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error('Erro ao editar usuário:', err);
    return res.status(500).json({ success: false, message: 'Erro ao atualizar usuário.' });
  }
});

// PUT /api/admin/users/:userId/role - Alterar privilégio de administrador
app.put('/api/admin/users/:userId/role', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_admin } = req.body;

    if (typeof is_admin !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Parâmetro is_admin deve ser booleano.' });
    }

    if (userId === req.user.id && !is_admin) {
      return res.status(400).json({ success: false, message: 'Você não pode remover seus próprios privilégios de administrador.' });
    }

    const users = await getUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    user.is_admin = is_admin;
    await saveUsers(users);

    return res.json({
      success: true,
      message: `Privilégios de "${user.nome}" atualizados para ${is_admin ? 'Administrador' : 'Usuário Comum'}.`,
      user: sanitizeUser(user)
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro ao atualizar perfil do usuário.' });
  }
});

// PUT /api/admin/users/:userId/password - Redefinir senha de um usuário
app.put('/api/admin/users/:userId/password', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { novaSenha } = req.body;

    const pwdCheck = validateStrongPassword(novaSenha);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, message: pwdCheck.message });
    }

    const users = await getUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    user.senha = await hashPassword(novaSenha);
    await saveUsers(users);

    return res.json({ success: true, message: `Senha do usuário "${user.nome}" redefinida com sucesso.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro ao redefinir senha.' });
  }
});

// DELETE /api/admin/users/:userId
app.delete('/api/admin/users/:userId', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Você não pode excluir sua própria conta de administrador.' });
    }

    let users = await getUsers();
    users = users.filter(u => u.id !== userId);
    await saveUsers(users);

    const permissions = await getPermissions();
    delete permissions[userId];
    await savePermissions(permissions);

    const allFinances = await getAllFinances();
    delete allFinances[userId];
    await saveAllFinances(allFinances);

    return res.json({ success: true, message: 'Usuário e dados removidos com sucesso.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro ao excluir usuário.' });
  }
});

// PUT /api/admin/permissions/:userId
app.put('/api/admin/permissions/:userId', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ success: false, message: 'Objeto de permissões inválido.' });
    }

    const updated = await setUserPermissions(userId, permissions);
    return res.json({ success: true, message: 'Permissões atualizadas com sucesso.', permissions: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erro ao salvar permissões.' });
  }
});

// GET /api/admin/default-permissions
app.get('/api/admin/default-permissions', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const permissions = await getDefaultPermissions();
    return res.json({ success: true, permissions });
  } catch (err) {
    console.error('Erro ao buscar permissões padrão:', err);
    return res.status(500).json({ success: false, message: 'Erro ao buscar permissões padrão.' });
  }
});

// POST & PUT /api/admin/default-permissions
const saveDefaultPermissionsHandler = async (req, res) => {
  try {
    const permissions = req.body.permissions || req.body;
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ success: false, message: 'Objeto de permissões inválido.' });
    }

    const permsToSave = {
      dashboard: permissions.dashboard !== false,
      despesas: permissions.despesas !== false,
      extras: permissions.extras !== false,
      devedores: permissions.devedores !== false,
      investimentos: permissions.investimentos !== false,
      beneficios: permissions.beneficios !== false,
      compras: permissions.compras !== false,
      simulacao: permissions.simulacao !== false
    };

    await saveDefaultPermissions(permsToSave);
    return res.json({ success: true, message: 'Permissões padrão salvas com sucesso!', permissions: permsToSave });
  } catch (err) {
    console.error('Erro ao salvar permissões padrão:', err);
    return res.status(500).json({ success: false, message: 'Erro ao salvar permissões padrão.' });
  }
};

app.post('/api/admin/default-permissions', authMiddleware, adminOnlyMiddleware, saveDefaultPermissionsHandler);
app.put('/api/admin/default-permissions', authMiddleware, adminOnlyMiddleware, saveDefaultPermissionsHandler);

/* ==========================================================================
   SYSTEM & MAINTENANCE ROUTES
   ========================================================================== */

// GET /api/system/maintenance - Consulta de manutenção para usuários autenticados
app.get('/api/system/maintenance', authMiddleware, async (req, res) => {
  try {
    const maintenance = await getMaintenanceConfig();
    return res.json({ success: true, maintenance });
  } catch (err) {
    console.error('Erro ao consultar manutenção do sistema:', err);
    return res.status(500).json({ success: false, message: 'Erro ao consultar status de manutenção.' });
  }
});

// GET /api/admin/maintenance - Consulta administrativa de manutenção
app.get('/api/admin/maintenance', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const maintenance = await getMaintenanceConfig();
    return res.json({ success: true, maintenance });
  } catch (err) {
    console.error('Erro ao buscar configuração de manutenção:', err);
    return res.status(500).json({ success: false, message: 'Erro ao buscar configuração de manutenção.' });
  }
});

// PUT /api/admin/maintenance - Atualização administrativa de manutenção
app.put('/api/admin/maintenance', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const rawMaintenance = req.body.maintenance || req.body;
    if (!rawMaintenance || typeof rawMaintenance !== 'object' || Array.isArray(rawMaintenance)) {
      return res.status(400).json({
        success: false,
        message: 'Payload inválido. Esperado um objeto com as configurações de manutenção.'
      });
    }

    const ALLOWED_MODULES = ['dashboard', 'despesas', 'extras', 'devedores', 'investimentos', 'beneficios', 'compras', 'simulacao'];
    const submittedKeys = Object.keys(rawMaintenance);

    // Validação de chaves desconhecidas
    const unknownKeys = submittedKeys.filter(k => !ALLOWED_MODULES.includes(k));
    if (unknownKeys.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Módulo(s) inválido(s) ou desconhecido(s): ${unknownKeys.join(', ')}.`
      });
    }

    // Validação estrita de tipo boolean
    const updatePayload = {};
    for (const key of submittedKeys) {
      const item = rawMaintenance[key];
      let isMaint;
      if (typeof item === 'boolean') {
        isMaint = item;
      } else if (item && typeof item === 'object' && typeof item.maintenance === 'boolean') {
        isMaint = item.maintenance;
      } else {
        return res.status(400).json({
          success: false,
          message: `O valor de manutenção para o módulo "${key}" deve ser estritamente booleano (true/false).`
        });
      }
      updatePayload[key] = isMaint;
    }

    const updated = await saveMaintenanceConfig(updatePayload);
    return res.json({
      success: true,
      message: 'Configuração de manutenção atualizada com sucesso!',
      maintenance: updated
    });
  } catch (err) {
    console.error('Erro ao salvar configuração de manutenção:', err);
    return res.status(500).json({ success: false, message: 'Erro ao salvar configuração de manutenção.' });
  }
});

/* ==========================================================================
   STATIC & FALLBACK ROUTES
   ========================================================================== */
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start Server conditionally
if (require.main === module) {
  app.listen(config.PORT, () => {
    console.log(`====================================================`);
    console.log(`  Finanças Pro Server rodando na porta: ${config.PORT}`);
    console.log(`  Acesse: http://localhost:${config.PORT}`);
    console.log(`====================================================`);
  });
}

module.exports = app;
