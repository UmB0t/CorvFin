function requirePermission(moduleName) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    }

    // Admins bypass module restrictions
    if (req.user.is_admin) {
      return next();
    }

    const permissions = req.user.permissions || {};
    if (permissions[moduleName] === true) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Você não possui permissão para acessar o módulo: ${moduleName}.`
    });
  };
}

module.exports = {
  requirePermission
};
