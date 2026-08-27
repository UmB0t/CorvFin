const { verifyToken } = require('../services/authService');
const { getUsers, getUserPermissions } = require('../services/storageService');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Acesso não autorizado. Faça login para continuar.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Sessão expirada ou token inválido.' });
    }

    const users = await getUsers();
    const user = users.find(u => u.id === decoded.userId);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const permissions = await getUserPermissions(user.id);

    req.user = {
      id: user.id,
      login: user.login,
      nome: user.nome,
      email: user.email,
      is_admin: !!user.is_admin,
      notificacoes_ativas: !!user.notificacoes_ativas,
      permissions
    };

    next();
  } catch (err) {
    console.error('Erro no authMiddleware:', err);
    return res.status(500).json({ success: false, message: 'Erro interno de autenticação.' });
  }
}

function adminOnlyMiddleware(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ success: false, message: 'Acesso negado. Apenas administradores podem executar esta ação.' });
  }
  next();
}

module.exports = {
  authMiddleware,
  adminOnlyMiddleware
};
