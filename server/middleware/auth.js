const { verifyToken } = require('../services/authService');
const { getUserById, getUserPermissions } = require('../services/storageService');
const config = require('../config/config');

async function authMiddleware(req, res, next) {
  try {
    let token = null;

    // 1. Procurar cookie HttpOnly omnifin_session (preferência primária)
    if (req.cookies && req.cookies[config.COOKIE_NAME || 'omnifin_session']) {
      token = req.cookies[config.COOKIE_NAME || 'omnifin_session'];
      req.authType = 'cookie';
    }

    // 2. Período de compatibilidade temporária: se cookie ausente, aceita Authorization: Bearer
    // [NOTA DE DEPRECATION]: Manter apenas durante transição de clientes antigos. Será removido em versão futura.
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
        req.authType = 'bearer';
      }
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Acesso não autorizado. Faça login para continuar.' });
    }

    // 3. Validar integridade e assinatura do JWT
    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ success: false, message: 'Sessão expirada ou token inválido.' });
    }

    // 4 & 5. Buscar usuário atual individualmente no banco via getUserById (evita carregar coleção inteira)
    const user = await getUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Usuário não encontrado ou inativo.' });
    }

    // 6. Validar tokenVersion contra o banco de dados (retrocompatibilidade: se ausente, trata como 0)
    const currentTokenVersion = typeof user.tokenVersion === 'number' ? user.tokenVersion : 0;
    const tokenVersionInJwt = typeof decoded.tokenVersion === 'number' ? decoded.tokenVersion : 0;

    if (tokenVersionInJwt !== currentTokenVersion) {
      return res.status(401).json({
        success: false,
        error: 'SESSION_INVALIDATED',
        message: 'Sessão invalidada por alteração de credenciais. Faça login novamente.'
      });
    }

    // 7. Buscar permissões atuais em tempo real do banco de dados (RBAC dinâmico)
    const permissions = await getUserPermissions(user.id);

    // 8. Preencher req.user com o estado atual do banco
    req.user = {
      id: user.id,
      login: user.login,
      nome: user.nome,
      email: user.email,
      is_admin: !!user.is_admin,
      notificacoes_ativas: typeof user.notificacoes_ativas === 'boolean' ? user.notificacoes_ativas : true,
      tokenVersion: currentTokenVersion,
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
