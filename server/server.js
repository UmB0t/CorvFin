const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const config = require('./config/config');
const {
  validateStrongPassword,
  validatePasswordPolicy,
  validateEmail,
  normalizeEmail,
  hashPassword,
  comparePassword,
  generateToken,
  generateSecurityToken,
  hashSecurityToken
} = require('./services/authService');
const {
  getUsers,
  getUserById,
  getUserByEmail,
  saveUsers,
  updateUserPassword,
  updateUserPlan,
  getPermissions,
  savePermissions,
  getDefaultPermissions,
  saveDefaultPermissions,
  getMaintenanceConfig,
  saveMaintenanceConfig,
  getEmailSettings,
  saveEmailSettings,
  getUserPermissions,
  setUserPermissions,
  getUserFinances,
  saveUserFinances,
  getAllFinances,
  saveAllFinances,
  createSecurityToken,
  invalidateSecurityTokensForUser,
  verifyEmailWithToken,
  resetPasswordWithToken,
  cleanExpiredSecurityTokens
} = require('./services/storageService');
const { authMiddleware, adminOnlyMiddleware } = require('./middleware/auth');
const { conditionalMediaUpload, validateMediaFile, getBaseMimeType } = require('./middleware/mediaUpload');
const { sanitizeFinancePayload, applyRbacModulePreservation } = require('./services/financeValidation');
const planService = require('./services/planService');
const entitlementService = require('./services/entitlementService');
const quantitativeEntitlementService = require('./services/quantitativeEntitlementService');
const { ENTITLEMENT_REGISTRY } = require('./config/entitlementRegistry');
const cryptoService = require('./services/cryptoService');
const mailService = require('./services/mailService');
const {
  buildFinancialContext,
  SYSTEM_GUIDE_CONTEXT,
  sendToN8nWebhook,
  interpretExpenseAction,
  confirmExpenseProposal,
  confirmBenefitProposal,
  cancelExpenseProposal
} = require('./services/aiService');
const aiQuotaService = require('./services/aiQuotaService');
const { classifyAiOperation } = require('./services/aiClassificationService');
const commercialService = require('./services/commercialService');
const {
  projectFinancialMonth,
  validatePeriod
} = require('./services/financeProjectionService');
const financeReportService = require('./services/financeReportService');

const app = express();

// Configuração de Trust Proxy (Topologia Nginx reverso: 1 hop de proxy confiável)
const rawTrustProxy = config.TRUST_PROXY;
const resolvedTrustProxy = !isNaN(Number(rawTrustProxy)) ? Number(rawTrustProxy) : rawTrustProxy;
app.set('trust proxy', resolvedTrustProxy);

// Middlewares Globais de Segurança HTTP (Helmet com CSP compatível com Vanilla JS / PWA)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcElem: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      styleSrcElem: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://fonts.googleapis.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: (config.NODE_ENV === 'production') ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  xContentTypeOptions: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xFrameOptions: { action: 'deny' },
  hsts: (config.NODE_ENV === 'production') ? {
    maxAge: 15552000,
    includeSubDomains: false,
    preload: false
  } : false
}));

// Configuração Controlada de CORS (Allowlist em produção, permissão same-origin e dev)
const allowedOriginsList = config.CORS_ALLOWED_ORIGINS
  ? config.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean)
  : [];

const corsOptions = {
  origin: (origin, callback) => {
    // Permite requisições sem header Origin (same-origin, mobile apps, PWA interna, curl, healthcheck)
    if (!origin) {
      return callback(null, true);
    }
    const cleanOrigin = origin.trim().replace(/\/+$/, '');

    // Em desenvolvimento/testes: aceita localhost, 127.0.0.1 e allowlist
    if (config.NODE_ENV !== 'production') {
      if (cleanOrigin.startsWith('http://localhost') || cleanOrigin.startsWith('http://127.0.0.1')) {
        return callback(null, true);
      }
    }

    if (allowedOriginsList.length === 0) {
      if (config.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(new Error('Origem não permitida pela política de CORS.'));
    }

    if (allowedOriginsList.includes(cleanOrigin) || allowedOriginsList.includes('*')) {
      return callback(null, true);
    }

    return callback(new Error('Origem não permitida pela política de CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400
};

app.use(cors(corsOptions));

// Limites de Payload para proteção contra estouro de memória (5MB conservador)
app.use(express.json({ limit: config.BODY_LIMIT || '5mb' }));
app.use(express.urlencoded({ extended: true, limit: config.BODY_LIMIT || '5mb' }));

// Middleware seguro de parsing de cookies sem dependência externa
app.use((req, res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader && typeof cookieHeader === 'string') {
    const pairs = cookieHeader.split(';');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const key = pair.substring(0, idx).trim();
        const val = pair.substring(idx + 1).trim();
        try {
          req.cookies[key] = decodeURIComponent(val);
        } catch (_) {
          req.cookies[key] = val;
        }
      }
    }
  }
  next();
});

// Middleware Anti-Cache para APIs Privadas e Dados Sensíveis
app.use('/api', (req, res, next) => {
  if (req.path === '/config') {
    return next();
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Middleware de Proteção Anti-CSRF em Profundidade para Métodos de Mutação
app.use('/api', (req, res, next) => {
  const method = req.method.toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  if (!isMutation) {
    return next();
  }

  // Rotas públicas de autenticação inicial são tratadas compatibilizadas
  const urlPath = req.originalUrl || req.url || '';
  if (
    urlPath.includes('/auth/login') ||
    urlPath.includes('/auth/register') ||
    urlPath.includes('/auth/logout') ||
    urlPath.includes('/auth/forgot-password') ||
    urlPath.includes('/auth/reset-password') ||
    urlPath.includes('/auth/verify-email') ||
    urlPath.includes('/auth/resend-verification')
  ) {
    return next();
  }

  // Se a requisição está autenticada via cookie de sessão, exige o cabeçalho X-Requested-With
  const sessionCookie = req.cookies && req.cookies[config.COOKIE_NAME || 'omnifin_session'];
  if (sessionCookie) {
    const xRequestedWith = req.headers['x-requested-with'];
    if (!xRequestedWith || xRequestedWith.toLowerCase() !== 'xmlhttprequest') {
      return res.status(403).json({
        success: false,
        error: 'CSRF_REJECTED',
        message: 'Requisição rejeitada por política de segurança (cabeçalho anti-CSRF ausente).'
      });
    }
  }

  next();
});

// Limitador Geral da API (/api/*)
const apiLimiter = rateLimit({
  windowMs: config.API_RATE_LIMIT_WINDOW_MS,
  max: config.API_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Muitas requisições enviadas à API. Tente novamente mais tarde.'
  }
});
app.use('/api/', apiLimiter);

// Limitador de Login (skipSuccessfulRequests: true evita consumo em logins legítimos)
const authLoginLimiter = rateLimit({
  windowMs: config.AUTH_RATE_LIMIT_WINDOW_MS,
  max: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Muitas tentativas de login com erro. Tente novamente em alguns minutos.'
  }
});

// Limitador de Registro Público
const authRegisterLimiter = rateLimit({
  windowMs: config.AUTH_RATE_LIMIT_WINDOW_MS,
  max: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Muitas tentativas de cadastro. Tente novamente em alguns minutos.'
  }
});

// Limitador de IA (/api/ai/*) - Chave principal: req.user.id autenticado
const aiLimiter = rateLimit({
  windowMs: config.AI_RATE_LIMIT_WINDOW_MS,
  max: config.AI_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => (req.user && req.user.id) ? req.user.id : (req.ip || '127.0.0.1'),
  message: {
    success: false,
    error: 'AI_RATE_LIMIT_EXCEEDED',
    message: 'Muitas mensagens enviadas ao assistente de IA. Aguarde um instante antes de nova consulta.'
  }
});

// Limitador de Testes SMTP (/api/admin/email-settings/test)
const emailTestLimiter = rateLimit({
  windowMs: config.EMAIL_TEST_RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000),
  max: config.EMAIL_TEST_RATE_LIMIT_MAX || 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Muitas tentativas de teste de e-mail. Aguarde 15 minutos antes de tentar novamente.'
  }
});

// Limitadores Dedicados de Ciclo de Conta e Credenciais (Security 6B)
const forgotPasswordLimiter = rateLimit({
  windowMs: config.FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000),
  max: config.FORGOT_PASSWORD_RATE_LIMIT_MAX || 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Muitas solicitações de recuperação de senha. Tente novamente em alguns minutos.'
  }
});

const resendVerificationLimiter = rateLimit({
  windowMs: config.RESEND_VERIFICATION_RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000),
  max: config.RESEND_VERIFICATION_RATE_LIMIT_MAX || 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Muitas tentativas de reenvio de confirmação. Tente novamente em alguns minutos.'
  }
});

const verifyEmailLimiter = rateLimit({
  windowMs: config.VERIFY_EMAIL_RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000),
  max: config.VERIFY_EMAIL_RATE_LIMIT_MAX || 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Muitas tentativas de verificação de e-mail. Tente novamente em alguns minutos.'
  }
});

const resetPasswordLimiter = rateLimit({
  windowMs: config.RESET_PASSWORD_RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000),
  max: config.RESET_PASSWORD_RATE_LIMIT_MAX || 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Muitas tentativas de redefinição de senha. Tente novamente em alguns minutos.'
  }
});

const changePasswordLimiter = rateLimit({
  windowMs: config.CHANGE_PASSWORD_RATE_LIMIT_WINDOW_MS || (15 * 60 * 1000),
  max: config.CHANGE_PASSWORD_RATE_LIMIT_MAX || 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Muitas tentativas de alteração de senha. Tente novamente em alguns minutos.'
  }
});

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

if (config.BASE_PATH) {
  app.get(`${config.BASE_PATH}/config.js`, (req, res) => {
    res.type('application/javascript');
    res.send(`window.__BASE_PATH__ = ${JSON.stringify(config.BASE_PATH || '')};`);
  });
  app.get(`${config.BASE_PATH}/api/config`, (req, res) => {
    res.json({
      success: true,
      basePath: config.BASE_PATH || ''
    });
  });
}

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

// Helpers seguros de Cookie HttpOnly para Sessão
function setAuthSessionCookie(res, token) {
  const isProd = config.NODE_ENV === 'production';
  res.cookie(config.COOKIE_NAME || 'omnifin_session', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'Lax',
    path: config.BASE_PATH || '/',
    maxAge: config.COOKIE_MAX_AGE_MS || (7 * 24 * 60 * 60 * 1000)
  });
}

function clearAuthSessionCookie(res) {
  const isProd = config.NODE_ENV === 'production';
  res.clearCookie(config.COOKIE_NAME || 'omnifin_session', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'Lax',
    path: config.BASE_PATH || '/'
  });
}

/* ==========================================================================
   AUTH ROUTES
   ========================================================================== */

// POST /api/auth/register - Cadastro público com rate limit
app.post('/api/auth/register', authRegisterLimiter, async (req, res) => {
  try {
    const { nome, login, email, senha } = req.body;

    if (!nome || !login || !email || !senha) {
      return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios.' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Formato de e-mail inválido.' });
    }

    const pwdCheck = validatePasswordPolicy(senha);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, message: pwdCheck.message });
    }

    const users = await getUsers();
    const cleanLogin = login.trim().toLowerCase();
    const cleanEmail = normalizeEmail(email);

    if (users.some(u => u.login.toLowerCase() === cleanLogin)) {
      return res.status(409).json({ success: false, message: 'Este nome de usuário (login) já está em uso.' });
    }

    if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ success: false, message: 'Este e-mail já está cadastrado.' });
    }

    const hashedPassword = await hashPassword(senha);
    const isFirstUser = users.length === 0;
    const nowISO = new Date().toISOString();

    // Obter plano default obrigatório para novos usuários (Lote 5C)
    const defaultPlan = await planService.getDefaultPlan();
    if (!defaultPlan || !defaultPlan._id) {
      return res.status(500).json({
        success: false,
        error: 'DEFAULT_PLAN_NOT_FOUND',
        message: 'Nenhum plano padrão configurado no sistema. Contate o administrador.'
      });
    }

    const newUser = {
      id: generateUserId(),
      nome: nome.trim(),
      login: cleanLogin,
      email: cleanEmail,
      senha: hashedPassword,
      is_admin: isFirstUser, // Primeiro usuário vira admin automaticamente
      notificacoes_ativas: true,
      tokenVersion: 0,
      emailVerified: false,
      emailVerifiedAt: null,
      planId: defaultPlan._id,
      createdAt: nowISO
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

    // Emite token de confirmação de e-mail (24 horas)
    const rawToken = generateSecurityToken();
    const tokenHash = hashSecurityToken(rawToken);
    const expiresAt = new Date(Date.now() + (config.EMAIL_VERIFICATION_TOKEN_TTL_MS || 24 * 60 * 60 * 1000)).toISOString(); // 24 horas (86.400.000 ms)

    await createSecurityToken({
      userId: newUser.id,
      type: 'email_verification',
      tokenHash,
      expiresAt
    });

    // Despacho de e-mail com desacoplamento de transporte (falha de SMTP não aborta nem corrompe a conta)
    try {
      await mailService.sendVerificationEmail({
        to: newUser.email,
        nome: newUser.nome,
        token: rawToken
      });
    } catch (mailErr) {
      console.warn('[AUTH_REGISTER] Aviso: Falha ao enviar e-mail de confirmação (transporte indisponível):', mailErr.message);
    }

    // Security 6B: NÃO emite cookie de sessão imediato para contas não confirmadas
    return res.status(201).json({
      success: true,
      requiresVerification: true,
      message: 'Conta criada com sucesso. Confirme seu endereço de e-mail antes de fazer login. Caso não receba a mensagem, utilize a opção de reenviar confirmação.',
      user: {
        id: newUser.id,
        login: newUser.login,
        nome: newUser.nome,
        email: newUser.email,
        emailVerified: false
      }
    });
  } catch (err) {
    console.error('Erro no registro:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao criar conta.' });
  }
});

// POST /api/auth/login - Autenticação com rate limit (skipSuccessfulRequests)
app.post('/api/auth/login', authLoginLimiter, async (req, res) => {
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
      return res.status(401).json({ success: false, error: 'INVALID_CREDENTIALS', message: 'Login ou senha inválidos. Verifique os dados e tente novamente.' });
    }

    const passwordMatch = await comparePassword(senha, user.senha);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'INVALID_CREDENTIALS', message: 'Login ou senha inválidos. Verifique os dados e tente novamente.' });
    }

    // Security 6B: Bloqueio de novas contas não verificadas
    // Usuários legados sem emailVerified continuam grandfathered (emailVerified !== false)
    if (user.emailVerified === false) {
      return res.status(403).json({
        success: false,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Por favor, confirme seu endereço de e-mail antes de acessar o sistema.',
        email: user.email
      });
    }

    const token = generateToken(user);
    const permissions = await getUserPermissions(user.id);
    setAuthSessionCookie(res, token);

    return res.json({
      success: true,
      message: 'Login realizado com sucesso!',
      user: {
        id: user.id,
        login: user.login,
        nome: user.nome,
        email: user.email,
        is_admin: !!user.is_admin,
        notificacoes_ativas: !!user.notificacoes_ativas,
        emailVerified: user.emailVerified !== false,
        permissions
      }
    });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao realizar login.' });
  }
});

// POST /api/auth/logout - Encerramento de sessão
app.post('/api/auth/logout', (req, res) => {
  clearAuthSessionCookie(res);
  return res.json({
    success: true,
    message: 'Logout realizado com sucesso.'
  });
});

// POST /api/auth/verify-email - Confirmação de e-mail com consumo atômico (Two-Phase Claim)
app.post('/api/auth/verify-email', verifyEmailLimiter, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Token de confirmação inválido ou ausente.'
      });
    }

    const tokenHash = hashSecurityToken(token.trim());
    const result = await verifyEmailWithToken(tokenHash);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Token de confirmação inválido ou expirado.'
      });
    }

    console.log('[AUDIT] EMAIL_VERIFIED:', { userId: result.userId, timestamp: new Date().toISOString() });

    return res.json({
      success: true,
      message: 'E-mail confirmado com sucesso! Você já pode realizar o login.'
    });
  } catch (err) {
    console.error('Erro na confirmação de e-mail:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao confirmar e-mail.' });
  }
});

// POST /api/auth/resend-verification - Reenvio de confirmação com anti-enumeração
app.post('/api/auth/resend-verification', resendVerificationLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = normalizeEmail(email);

    // Resposta sempre neutra (anti-enumeração)
    const neutralResponse = {
      success: true,
      message: 'Se houver uma conta elegível para este endereço, enviaremos novas instruções.'
    };

    if (!cleanEmail || !validateEmail(cleanEmail).valid) {
      return res.json(neutralResponse);
    }

    const user = await getUserByEmail(cleanEmail);

    // Reenvia apenas se a conta existir e ainda não estiver verificada
    if (user && user.emailVerified === false) {
      const rawToken = generateSecurityToken();
      const tokenHash = hashSecurityToken(rawToken);
      const expiresAt = new Date(Date.now() + (config.EMAIL_VERIFICATION_TOKEN_TTL_MS || 24 * 60 * 60 * 1000)).toISOString(); // 24 horas (86.400.000 ms)

      await createSecurityToken({
        userId: user.id,
        type: 'email_verification',
        tokenHash,
        expiresAt
      });

      console.log('[AUDIT] EMAIL_VERIFICATION_REQUESTED:', { userId: user.id, timestamp: new Date().toISOString() });

      try {
        await mailService.sendVerificationEmail({
          to: user.email,
          nome: user.nome,
          token: rawToken
        });
      } catch (mailErr) {
        console.warn('[AUTH_RESEND] Aviso: Falha ao enviar e-mail de confirmação:', mailErr.message);
      }
    }

    return res.json(neutralResponse);
  } catch (err) {
    console.error('Erro no reenvio de confirmação:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao processar reenvio.' });
  }
});

// POST /api/auth/forgot-password - Solicitação de redefinição de senha com anti-enumeração
app.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = normalizeEmail(email);

    // Resposta externa SEMPRE neutra
    const neutralResponse = {
      success: true,
      message: 'Se existir uma conta associada a este e-mail, enviaremos instruções para redefinição da senha.'
    };

    if (!cleanEmail || !validateEmail(cleanEmail).valid) {
      return res.json(neutralResponse);
    }

    const user = await getUserByEmail(cleanEmail);

    if (user) {
      const rawToken = generateSecurityToken();
      const tokenHash = hashSecurityToken(rawToken);
      const expiresAt = new Date(Date.now() + (config.PASSWORD_RESET_TOKEN_TTL_MS || 30 * 60 * 1000)).toISOString(); // 30 minutos (1.800.000 ms)

      await createSecurityToken({
        userId: user.id,
        type: 'password_reset',
        tokenHash,
        expiresAt
      });

      console.log('[AUDIT] PASSWORD_RESET_REQUESTED:', { userId: user.id, timestamp: new Date().toISOString() });

      try {
        await mailService.sendPasswordResetEmail({
          to: user.email,
          nome: user.nome,
          token: rawToken
        });
      } catch (mailErr) {
        console.warn('[AUTH_FORGOT_PWD] Aviso: Falha ao enviar e-mail de recuperação:', mailErr.message);
        await invalidateSecurityTokensForUser(user.id, 'password_reset').catch(() => {});
      }
    }

    return res.json(neutralResponse);
  } catch (err) {
    console.error('Erro na solicitação de recuperação de senha:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao processar recuperação de senha.' });
  }
});

// POST /api/auth/reset-password - Redefinição de senha com Two-Phase Claim e Fail-Safe
app.post('/api/auth/reset-password', resetPasswordLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Token de redefinição inválido ou ausente.'
      });
    }

    const policyCheck = validatePasswordPolicy(newPassword);
    if (!policyCheck.valid) {
      return res.status(400).json({
        success: false,
        message: policyCheck.message
      });
    }

    const hashedPassword = await hashPassword(newPassword);
    const tokenHash = hashSecurityToken(token.trim());

    const result = await resetPasswordWithToken(tokenHash, hashedPassword);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Token de redefinição inválido ou expirado.'
      });
    }

    clearAuthSessionCookie(res);

    console.log('[AUDIT] PASSWORD_RESET_COMPLETED:', { userId: result.userId, timestamp: new Date().toISOString() });

    if (result.email) {
      mailService.sendPasswordChangedAlert({
        to: result.email,
        nome: result.nome
      }).catch(mailErr => {
        console.warn('[AUTH_RESET_PWD] Aviso: Falha ao enviar aviso de senha alterada:', mailErr.message);
      });
    }

    return res.json({
      success: true,
      message: 'Senha redefinida com sucesso! Faça login com sua nova senha.'
    });
  } catch (err) {
    console.error('Erro na redefinição de senha:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao redefinir senha.' });
  }
});

// POST /api/auth/change-password - Alteração de senha por usuário autenticado
app.post('/api/auth/change-password', authMiddleware, changePasswordLimiter, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;

    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({
        success: false,
        message: 'Senha atual e nova senha são obrigatórias.'
      });
    }

    const policyCheck = validatePasswordPolicy(novaSenha);
    if (!policyCheck.valid) {
      return res.status(400).json({
        success: false,
        message: policyCheck.message
      });
    }

    if (senhaAtual === novaSenha) {
      return res.status(400).json({
        success: false,
        message: 'A nova senha não pode ser idêntica à senha atual.'
      });
    }

    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const passwordMatch = await comparePassword(senhaAtual, user.senha);
    if (!passwordMatch) {
      return res.status(400).json({ success: false, message: 'Senha atual incorreta.' });
    }

    const newHashedPassword = await hashPassword(novaSenha);
    await updateUserPassword(user.id, newHashedPassword);

    clearAuthSessionCookie(res);

    console.log('[AUDIT] PASSWORD_CHANGED:', { userId: user.id, timestamp: new Date().toISOString() });

    if (user.email) {
      mailService.sendPasswordChangedAlert({
        to: user.email,
        nome: user.nome
      }).catch(mailErr => {
        console.warn('[AUTH_CHANGE_PWD] Aviso: Falha ao enviar aviso de senha alterada:', mailErr.message);
      });
    }

    return res.json({
      success: true,
      message: 'Senha alterada com sucesso! Faça login novamente com sua nova senha.'
    });
  } catch (err) {
    console.error('Erro na alteração de senha autenticada:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao alterar senha.' });
  }
});

// GET /api/auth/me - Obter dados do usuário logado
app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

// GET /api/me/commercial-context - Contexto comercial e quotas de IA do usuário autenticado (Lote 5H.1)
app.get('/api/me/commercial-context', authMiddleware, async (req, res) => {
  try {
    const context = await commercialService.getCommercialContext(req.user);
    return res.json({
      success: true,
      data: context,
      ...context
    });
  } catch (err) {
    if (err.code === 'PLAN_REFERENCE_INVALID' || err.status === 403) {
      return res.status(403).json({
        success: false,
        error: 'PLAN_REFERENCE_INVALID',
        code: 'PLAN_REFERENCE_INVALID',
        message: 'O plano vinculado ao usuário é inválido ou inexistente.'
      });
    }
    console.error('Erro ao obter contexto comercial:', err);
    return res.status(err.status || 500).json({
      success: false,
      error: err.code || 'COMMERCIAL_CONTEXT_ERROR',
      message: err.message || 'Erro ao carregar informações comerciais.'
    });
  }
});

// GET /api/plans - Catálogo autenticado de planos ativos para consulta e comparação de upgrades (Lote 5H.7)
app.get('/api/plans', authMiddleware, async (req, res) => {
  try {
    const plans = await commercialService.getActivePlans();
    return res.json({
      success: true,
      plans,
      data: plans
    });
  } catch (err) {
    console.error('Erro ao obter planos ativos:', err);
    return res.status(500).json({
      success: false,
      message: 'Erro ao carregar catálogo de planos.'
    });
  }
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
    let passwordChanged = false;

    // Se informou nova senha, valida e atualiza
    if (novaSenha) {
      if (!senhaAtual) {
        return res.status(400).json({ success: false, message: 'Informe sua senha atual para definir uma nova.' });
      }
      const match = await comparePassword(senhaAtual, user.senha);
      if (!match) {
        return res.status(400).json({ success: false, message: 'Senha atual incorreta.' });
      }
      const pwdCheck = validatePasswordPolicy(novaSenha);
      if (!pwdCheck.valid) {
        return res.status(400).json({ success: false, message: pwdCheck.message });
      }
      user.senha = await hashPassword(novaSenha);
      user.tokenVersion = (typeof user.tokenVersion === 'number' ? user.tokenVersion : 0) + 1;
      passwordChanged = true;
    }

    if (nome && nome.trim()) user.nome = nome.trim();
    if (email && email.trim()) {
      const cleanEmail = normalizeEmail(email);
      if (!validateEmail(cleanEmail).valid) {
        return res.status(400).json({ success: false, message: 'Formato de e-mail inválido.' });
      }
      // Verifica duplicidade de e-mail com outros usuários
      if (users.some(u => u.id !== req.user.id && (u.email || '').toLowerCase() === cleanEmail)) {
        return res.status(409).json({ success: false, message: 'Este e-mail já está sendo utilizado por outra conta.' });
      }
      user.email = cleanEmail;
    }

    if (typeof notificacoes_ativas === 'boolean') {
      user.notificacoes_ativas = notificacoes_ativas;
    }

    users[userIndex] = user;
    await saveUsers(users);

    if (passwordChanged) {
      clearAuthSessionCookie(res);
      console.log('[AUDIT] PASSWORD_CHANGED:', { userId: user.id, timestamp: new Date().toISOString() });
      if (user.email) {
        mailService.sendPasswordChangedAlert({
          to: user.email,
          nome: user.nome
        }).catch(mailErr => {
          console.warn('[AUTH_PROFILE] Aviso: Falha ao enviar aviso de senha alterada:', mailErr.message);
        });
      }
      return res.json({
        success: true,
        passwordChanged: true,
        message: 'Senha alterada com sucesso! Faça login novamente com sua nova senha.'
      });
    }

    const token = generateToken(user);
    setAuthSessionCookie(res, token);

    return res.json({
      success: true,
      message: 'Perfil atualizado com sucesso!',
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

// GET /api/finances/calendar - Projeção canônica temporal mensal para calendário (Lote B)
app.get('/api/finances/calendar', authMiddleware, async (req, res) => {
  try {
    const rawYear = req.query.year;
    const rawMonth = req.query.month;

    // 1. Validação de presença e tipo escalar
    if (typeof rawYear !== 'string' || typeof rawMonth !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_QUERY_PARAMS',
        message: 'Parâmetros "year" e "month" são obrigatórios e devem ser valores escalares.'
      });
    }

    const trimmedYear = rawYear.trim();
    const trimmedMonth = rawMonth.trim();

    if (!trimmedYear || !trimmedMonth) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_QUERY_PARAMS',
        message: 'Parâmetros "year" e "month" não podem ser vazios.'
      });
    }

    // 2. Rejeição estrita de decimais ou valores não inteiros
    if (!/^\d+$/.test(trimmedYear) || !/^\d+$/.test(trimmedMonth)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PROJECTION_PERIOD',
        message: 'Parâmetros "year" e "month" devem ser números inteiros válidos.'
      });
    }

    const y = parseInt(trimmedYear, 10);
    const m = parseInt(trimmedMonth, 10);

    // 3. Validação canônica de período do motor (range 2000..2100 e mês 1..12)
    try {
      validatePeriod(y, m);
    } catch (valErr) {
      return res.status(400).json({
        success: false,
        error: valErr.code || 'INVALID_PROJECTION_PERIOD',
        message: valErr.message
      });
    }

    // 4. Carregamento do documento financeiro do usuário autenticado (sempre próprio usuário)
    const finances = await getUserFinances(req.user.id, req.user.nome);

    // 5. Execução do motor canônico de projeção temporal
    const projection = projectFinancialMonth(finances, y, m);

    return res.json(projection);
  } catch (err) {
    console.error('Erro ao projetar calendário financeiro:', err);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao gerar projeção do calendário financeiro.'
    });
  }
});

// GET /api/finances/reports - Relatórios Financeiros V2 (Lote R2: Domain & API Foundation)
app.get('/api/finances/reports', authMiddleware, async (req, res) => {
  try {
    // 1. Verificação comercial e de permissões de módulo (RBAC + Entitlements populados pelo authMiddleware)
    const hasPlanAccess = req.user?.entitlements?.relatorios?.enabled !== false;
    const hasUserPerm = req.user?.permissions?.relatorios !== false;
    if (!hasPlanAccess || !hasUserPerm) {
      return res.status(403).json({
        success: false,
        error: 'PLAN_ACCESS_DENIED',
        message: 'Acesso ao recurso "relatorios" não é permitido para o seu plano ou permissões atuais.'
      });
    }

    // 2. Verificação de manutenção do módulo (fail-safe se storage indisponível)
    try {
      const maintenance = await getMaintenanceConfig();
      if (maintenance && maintenance.relatorios && maintenance.relatorios.maintenance) {
        return res.status(503).json({
          success: false,
          error: 'MODULE_MAINTENANCE',
          message: 'O módulo de relatórios está temporariamente em manutenção.'
        });
      }
    } catch (_) {}

    // 3. Rejeição explícita de identificadores forjados na query (isolamento estrito req.user)
    if (req.query.userId || req.query.ownerId || req.query.documentId) {
      return res.status(400).json({
        success: false,
        error: 'FORBIDDEN_USER_QUERY',
        message: 'A consulta de relatórios opera exclusivamente sobre o usuário autenticado.'
      });
    }

    // 4. Extração e validação estrita fail-fast das opções de relatório
    let validatedOptions;
    try {
      validatedOptions = financeReportService.validateReportOptions({
        startYear: req.query.startYear,
        startMonth: req.query.startMonth,
        endYear: req.query.endYear,
        endMonth: req.query.endMonth,
        perspective: req.query.perspective
      });
    } catch (valErr) {
      return res.status(valErr.status || 400).json({
        success: false,
        error: valErr.code || 'INVALID_REPORT_PERIOD',
        message: valErr.message
      });
    }

    // 5. Carregamento do documento financeiro exclusivo do usuário autenticado
    const finances = await getUserFinances(req.user.id, req.user.nome);

    // 6. Geração determinística do relatório consolidado
    const report = financeReportService.generateFinancialReport(finances, validatedOptions);

    return res.json(report);
  } catch (err) {
    if (err.code === 'INVALID_REPORT_PERIOD' ||
        err.code === 'INVALID_REPORT_PERSPECTIVE' ||
        err.code === 'REPORT_PERIOD_TOO_LARGE') {
      return res.status(err.status || 400).json({
        success: false,
        error: err.code,
        message: err.message
      });
    }

    console.error('Erro ao gerar relatório financeiro:', err);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao gerar relatório financeiro.'
    });
  }
});

// PUT /api/finances - Salvar dados financeiros do usuário logado com validação e preservação RBAC
app.put('/api/finances', authMiddleware, async (req, res) => {
  try {
    const rawData = req.body;
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_FINANCE_PAYLOAD',
        message: 'Payload financeiro inválido: esperado um objeto JSON.'
      });
    }

    // 1. Extração da expectedRevision para CAS antes da sanitização
    const expectedRevision = Number(rawData.expectedRevision ?? rawData.revision ?? 0);

    // 2. Sanitização estrutural central (Allowlist e detecção recursiva de chaves perigosas)
    const sanitized = sanitizeFinancePayload(rawData);

    // 3. Carregamento do estado atual e permissões para preservação server-side de módulos
    const currentFinances = await getUserFinances(req.user.id);
    const userPerms = req.user.permissions || (await getUserPermissions(req.user.id));

    // 4. Aplicação de RBAC com preservação de módulos não autorizados
    const finalData = applyRbacModulePreservation(sanitized, currentFinances, userPerms);

    // 5. Enforcement quantitativo de planos comerciais (Lote 5F)
    await quantitativeEntitlementService.assertAllItemLimits({
      user: req.user,
      currentFinances,
      incomingFinances: finalData
    });

    // 6. Restaura expectedRevision no payload para garantir o CAS no storage
    finalData.expectedRevision = expectedRevision;

    const saved = await saveUserFinances(req.user.id, finalData);
    return res.json({
      success: true,
      message: 'Dados salvos com sucesso!',
      revision: saved.revision,
      lastModified: saved.lastModified,
      data: saved
    });
  } catch (err) {
    if (err.code === 'RESOURCE_LIMIT_REACHED' || err.status === 403) {
      return res.status(err.status || 403).json({
        success: false,
        error: err.code || 'PLAN_ACCESS_DENIED',
        code: err.code || 'PLAN_ACCESS_DENIED',
        resource: err.resource,
        limitKey: err.limitKey,
        limit: err.limit,
        currentCount: err.currentCount,
        nextCount: err.nextCount,
        message: err.message
      });
    }
    if (err.status === 400 || err.code === 'INVALID_FINANCE_PAYLOAD') {
      return res.status(400).json({
        success: false,
        error: err.code || 'INVALID_FINANCE_PAYLOAD',
        message: err.message || 'Payload financeiro inválido.'
      });
    }
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
   AI ASSISTANT & N8N INTEGRATION ROUTES
   ========================================================================== */

// Middleware de Rate Limiting para rotas de IA (aplica aiLimiter a todas as rotas /api/ai/*)
app.use('/api/ai/', aiLimiter);

// POST /api/ai/chat - Processar mensagem do usuário com o Agente de IA via n8n
app.post('/api/ai/chat', authMiddleware, async (req, res) => {
  let reservation = null;
  let providerStarted = false;
  let providerFailed = false;
  try {
    const { message, conversationId, context, inputMode } = req.body || {};
    const cleanMode = (inputMode || 'text').trim().toLowerCase();

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A mensagem do usuário é obrigatória e deve ser um texto válido.'
      });
    }

    const cleanMessage = message.trim();
    if (cleanMessage.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'A mensagem excede o limite máximo permitido de 2000 caracteres.'
      });
    }

    // Classificação determinística da operação (zero LLM)
    const classification = classifyAiOperation({
      endpoint: 'chat',
      message: cleanMessage,
      inputMode: cleanMode
    });

    if (classification.unsupported) {
      return res.status(400).json({
        success: false,
        error: 'UNSUPPORTED_INPUT_MODE',
        message: classification.errorMessage
      });
    }

    // Asserção comercial de acesso ao módulo de IA (ai.enabled === true)
    await aiQuotaService.assertAiAccess(req.user);

    const convId = conversationId && typeof conversationId === 'string'
      ? conversationId.trim()
      : ('conv_' + req.user.id + '_' + Date.now().toString(36));

    // Zero credit = Zero provider call (resolução estritamente local)
    if (classification.localResponse) {
      console.log(`[AI] local intent resolved (0 credits): type=${classification.operationType} user=${req.user.id}`);
      return res.json({
        success: true,
        conversationId: convId,
        answer: classification.localResponse.answer,
        suggestions: classification.localResponse.suggestions || [],
        duration: 0
      });
    }

    // Operação tarifada: validação de infraestrutura n8n
    if (!config.N8N_AI_WEBHOOK_URL || !config.N8N_AI_BASIC_AUTH_USER || !config.N8N_AI_BASIC_AUTH_PASSWORD) {
      console.warn('[AI] request received but n8n integration is not fully configured in environment');
      return res.status(503).json({
        success: false,
        unavailable: true,
        message: 'O Assistente de IA não está configurado no servidor.'
      });
    }

    // Reserva atômica de quota antes de carregar contexto financeiro ou chamar n8n
    const reserveResult = await aiQuotaService.reserve({
      user: req.user,
      operationType: classification.operationType,
      inputMode: classification.inputMode,
      credits: classification.creditCost
    });
    reservation = reserveResult.reservation;

    console.log(`[AI] quota reserved: user=${req.user.id} op=${classification.operationType} credits=${classification.creditCost} reservationId=${reservation?.reservationId} conversation=${convId}`);

    // Carrega dados financeiros estritamente do usuário autenticado após autorização comercial
    const finances = await getUserFinances(req.user.id, req.user.nome);

    const targetMonth = Number(context?.month) || (new Date().getMonth() + 1);
    const targetYear = Number(context?.year) || new Date().getFullYear();

    const financialContext = buildFinancialContext(finances, targetMonth, targetYear);

    const requestId = 'req_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

    const webhookPayload = {
      requestId,
      conversationId: convId,
      user: {
        id: req.user.id,
        name: req.user.nome
      },
      query: {
        message: cleanMessage,
        month: targetMonth,
        year: targetYear
      },
      financialContext,
      systemDocumentation: SYSTEM_GUIDE_CONTEXT,
      metadata: {
        appVersion: '3.4.0',
        timezone: 'America/Sao_Paulo',
        sentAt: new Date().toISOString()
      }
    };

    // Telemetria: registra início da chamada externa HTTP imediatamente antes do fetch
    if (reservation) {
      await aiQuotaService.markProviderStarted(reservation);
      providerStarted = true;
    }

    let aiResponse;
    try {
      aiResponse = await sendToN8nWebhook(webhookPayload);
    } catch (n8nErr) {
      providerFailed = true;
      throw n8nErr;
    }

    console.log(`[AI] response sent to client: conversation=${convId} duration=${aiResponse.duration || 0}ms`);

    // Sucesso da operação: finaliza reserva e contabiliza operação concluída
    if (reservation) {
      await aiQuotaService.finalize(reservation);
      reservation = null;
    }

    return res.json(aiResponse);
  } catch (err) {
    if (reservation) {
      try {
        await aiQuotaService.release(reservation, { providerStarted: providerFailed });
        console.log(`[AI] quota released after failure: user=${reservation.userId} credits=${reservation.credits} providerFailed=${providerFailed}`);
      } catch (releaseErr) {
        console.error('[AI] error releasing quota reservation:', releaseErr);
      }
    }

    if (err.status === 429 || err.code === 'AI_DAILY_QUOTA_REACHED') {
      return res.status(429).json({
        success: false,
        error: 'AI_DAILY_QUOTA_REACHED',
        code: 'AI_DAILY_QUOTA_REACHED',
        resource: 'ai',
        limitKey: 'creditsPerDay',
        limit: err.limit,
        used: err.used,
        required: err.required,
        remaining: err.remaining,
        dateKey: err.dateKey,
        resetsAt: err.resetsAt,
        message: err.message
      });
    }
    if (err.code === 'PLAN_ACCESS_DENIED' || (err.status === 403 && err.resource === 'ai')) {
      return res.status(403).json({
        success: false,
        error: err.code || 'PLAN_ACCESS_DENIED',
        code: err.code || 'PLAN_ACCESS_DENIED',
        message: err.message
      });
    }
    if (err.code === 'PLAN_REFERENCE_INVALID') {
      return res.status(403).json({
        success: false,
        error: 'PLAN_REFERENCE_INVALID',
        code: 'PLAN_REFERENCE_INVALID',
        message: err.message
      });
    }
    if (err.code === 'PLAN_CONFIGURATION_INVALID') {
      return res.status(500).json({
        success: false,
        error: 'PLAN_CONFIGURATION_INVALID',
        code: 'PLAN_CONFIGURATION_INVALID',
        message: err.message
      });
    }
    if (err.status === 503) {
      console.warn(`[AI] chat failed: 503 Service Unavailable (${err.message})`);
      return res.status(503).json({
        success: false,
        unavailable: true,
        message: 'O Assistente de IA não está configurado no servidor.'
      });
    }
    if (err.status === 504 || err.code === 'AI_TIMEOUT') {
      console.error(`[AI] chat failed: 504 Timeout (${err.message})`);
      return res.status(504).json({
        success: false,
        message: 'Tempo limite esgotado ao consultar o Assistente de IA. Tente novamente em instantes.'
      });
    }
    if (err.status === 502) {
      console.error(`[AI] chat failed: 502 Bad Gateway (${err.message})`);
      return res.status(502).json({
        success: false,
        message: 'O serviço do Assistente de IA encontrou uma instabilidade temporária. Tente novamente em instantes.'
      });
    }
    console.error('[AI] chat internal error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao processar pergunta com o assistente.'
    });
  }
});

// POST /api/ai/actions/interpret - Interpretar intenção de despesa via n8n e gerar proposta segura
app.post('/api/ai/actions/interpret', authMiddleware, conditionalMediaUpload, async (req, res) => {
  try {
    const rawMode = req.body?.inputMode || req.body?.type || (req.file ? (getBaseMimeType(req.file.mimetype).startsWith('audio/') ? 'audio' : 'image') : 'text');
    const mode = typeof rawMode === 'string' ? rawMode.trim().toLowerCase() : 'text';

    if (mode !== 'text' && mode !== 'audio' && mode !== 'image') {
      return res.status(400).json({
        success: false,
        error: 'UNSUPPORTED_INPUT_MODE',
        code: 'UNSUPPORTED_INPUT_MODE',
        message: `A modalidade de entrada "${mode}" ainda não é suportada neste ambiente. Utilize entrada em texto.`
      });
    }

    const isMultimodal = mode === 'audio' || mode === 'image';

    if (isMultimodal) {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'AI_MEDIA_REQUIRED',
          code: 'AI_MEDIA_REQUIRED',
          message: 'Nenhum arquivo de mídia foi enviado para a interpretação multimodal.'
        });
      }
      const mediaVal = validateMediaFile(req.file, mode);
      if (!mediaVal.valid) {
        const statusCode = mediaVal.code === 'AI_MEDIA_TOO_LARGE' ? 413 : 400;
        return res.status(statusCode).json({
          success: false,
          error: mediaVal.code,
          code: mediaVal.code,
          message: mediaVal.message
        });
      }
    }

    const rawMessage = req.body?.message;
    const cleanMessage = typeof rawMessage === 'string' ? rawMessage.trim() : '';

    if (!isMultimodal && !cleanMessage) {
      return res.status(400).json({
        success: false,
        message: 'A mensagem do usuário é obrigatória para gerar uma proposta de lançamento.'
      });
    }

    if (cleanMessage.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'A mensagem excede o limite máximo permitido de 2000 caracteres.'
      });
    }

    // Parse seguro de context (objeto, JSON string ou fallback escalar)
    let parsedContext = req.body?.context;
    let contextJsonInvalid = false;
    if (typeof parsedContext === 'string') {
      const trimmedCtx = parsedContext.trim();
      if (trimmedCtx) {
        try {
          parsedContext = JSON.parse(trimmedCtx);
        } catch (e) {
          contextJsonInvalid = true;
          parsedContext = null;
        }
      } else {
        parsedContext = null;
      }
    }

    if (contextJsonInvalid) {
      const hasScalarFallback = req.body?.month !== undefined || req.body?.year !== undefined;
      if (!hasScalarFallback) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_AI_CONTEXT',
          code: 'INVALID_AI_CONTEXT',
          message: 'O campo context enviado é inválido (formato JSON incorreto).'
        });
      }
    }

    if (parsedContext !== null && parsedContext !== undefined && (typeof parsedContext !== 'object' || Array.isArray(parsedContext))) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_AI_CONTEXT',
        code: 'INVALID_AI_CONTEXT',
        message: 'O campo context deve ser um objeto JSON válido.'
      });
    }

    const effectiveMonth = parsedContext?.month ?? req.body?.month;
    const effectiveYear = parsedContext?.year ?? req.body?.year;
    const effectiveConvId = parsedContext?.conversationId ?? req.body?.conversationId;

    const safeContext = (parsedContext || req.body?.month !== undefined || req.body?.year !== undefined) ? {
      month: Number.isInteger(Number(effectiveMonth)) && Number(effectiveMonth) >= 1 && Number(effectiveMonth) <= 12 ? Number(effectiveMonth) : undefined,
      year: Number.isInteger(Number(effectiveYear)) && Number(effectiveYear) >= 1900 && Number(effectiveYear) <= 2200 ? Number(effectiveYear) : undefined,
      conversationId: typeof effectiveConvId === 'string' ? effectiveConvId.trim() : undefined
    } : undefined;

    const rawTargetModule = String(req.body?.targetModule || req.body?.intent || parsedContext?.targetModule || '').toLowerCase();
    const isBenefitTarget = rawTargetModule.includes('benefic') || rawTargetModule === 'create_benefit';
    const isExpenseTarget = rawTargetModule.includes('despes') || rawTargetModule === 'create_expense';

    // Asserção comercial de acesso ao módulo de IA (ai.enabled === true)
    await aiQuotaService.assertAiAccess(req.user);

    const proposalResult = await interpretExpenseAction({
      message: cleanMessage,
      userId: req.user.id,
      userName: req.user.nome,
      user: req.user,
      conversationId: req.body?.conversationId,
      context: safeContext,
      type: mode,
      inputMode: mode,
      file: req.file,
      targetModule: isBenefitTarget ? 'beneficios' : (isExpenseTarget ? 'despesas' : undefined),
      intent: isBenefitTarget ? 'create_benefit' : (isExpenseTarget ? 'create_expense' : undefined)
    });

    return res.json(proposalResult);
  } catch (err) {
    if (err.status === 429 || err.code === 'AI_DAILY_QUOTA_REACHED') {
      return res.status(429).json({
        success: false,
        error: 'AI_DAILY_QUOTA_REACHED',
        code: 'AI_DAILY_QUOTA_REACHED',
        resource: 'ai',
        limitKey: 'creditsPerDay',
        limit: err.limit,
        used: err.used,
        required: err.required,
        remaining: err.remaining,
        dateKey: err.dateKey,
        resetsAt: err.resetsAt,
        message: err.message
      });
    }
    if (err.code === 'PLAN_ACCESS_DENIED' || (err.status === 403 && err.resource === 'ai')) {
      return res.status(403).json({
        success: false,
        error: err.code || 'PLAN_ACCESS_DENIED',
        code: err.code || 'PLAN_ACCESS_DENIED',
        message: err.message
      });
    }
    if (err.code === 'PLAN_REFERENCE_INVALID') {
      return res.status(403).json({
        success: false,
        error: 'PLAN_REFERENCE_INVALID',
        code: 'PLAN_REFERENCE_INVALID',
        message: err.message
      });
    }
    if (err.code === 'PLAN_CONFIGURATION_INVALID') {
      return res.status(500).json({
        success: false,
        error: 'PLAN_CONFIGURATION_INVALID',
        code: 'PLAN_CONFIGURATION_INVALID',
        message: err.message
      });
    }
    if (err.status === 503) {
      return res.status(503).json({
        success: false,
        unavailable: true,
        message: 'O serviço de Ações do Assistente não está configurado no servidor.'
      });
    }
    if (err.status === 504 || err.code === 'AI_TIMEOUT') {
      return res.status(504).json({
        success: false,
        message: 'Tempo limite esgotado ao interpretar a despesa. Tente novamente em instantes.'
      });
    }
    if (err.status === 404 || err.code === 'FINANCIAL_CONTEXT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        message: 'Contexto financeiro não encontrado no servidor para esta ação.'
      });
    }
    if (err.status === 502 || err.code === 'N8N_UPSTREAM_ERROR' || err.code === 'N8N_INVALID_RESPONSE' || err.code === 'N8N_INVALID_CONTRACT') {
      return res.status(502).json({
        success: false,
        message: 'O serviço de interpretação encontrou uma instabilidade temporária. Tente novamente.'
      });
    }
    if (err.status === 422 || err.code === 'UNSUPPORTED_ACTION') {
      return res.status(422).json({
        success: false,
        message: err.message || 'Ação não suportada pelo assistente.'
      });
    }
    if (err.status === 413 || err.code === 'AI_MEDIA_TOO_LARGE') {
      return res.status(413).json({
        success: false,
        error: 'AI_MEDIA_TOO_LARGE',
        code: 'AI_MEDIA_TOO_LARGE',
        message: err.message || 'O arquivo enviado excede o limite máximo permitido de 5MB.'
      });
    }
    if (err.status === 400 || err.code === 'INVALID_AI_CONTEXT' || err.code === 'AI_MEDIA_REQUIRED' || err.code === 'AI_MEDIA_EMPTY' || err.code === 'AI_MEDIA_TYPE_UNSUPPORTED' || err.code === 'UNSUPPORTED_INPUT_MODE') {
      return res.status(400).json({
        success: false,
        error: err.code || 'BAD_REQUEST',
        code: err.code || 'BAD_REQUEST',
        message: err.message
      });
    }

    console.error('[AI ACTION] interpret error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao processar proposta de lançamento.'
    });
  } finally {
    if (req.file) {
      if (req.file.buffer) {
        req.file.buffer = null;
      }
      req.file = null;
    }
  }
});

// POST /api/ai/actions/expense/confirm - Confirmar e persistir proposta de despesa
app.post('/api/ai/actions/expense/confirm', authMiddleware, async (req, res) => {
  try {
    const { proposalId, data } = req.body || {};

    if (!proposalId || typeof proposalId !== 'string' || !proposalId.trim()) {
      return res.status(400).json({
        success: false,
        message: 'ID de proposta (proposalId) obrigatório.'
      });
    }

    // Enforcement quantitativo de despesas (Lote 5F)
    const finances = await getUserFinances(req.user.id);
    await quantitativeEntitlementService.assertWithinItemLimit({
      user: req.user,
      resourceKey: 'despesas',
      limitKey: 'maxItems',
      currentFinances: finances,
      explicitDelta: 1
    });

    const confirmResult = await confirmExpenseProposal({
      userId: req.user.id,
      proposalId: proposalId.trim(),
      data: (data && typeof data === 'object') ? data : {}
    });

    return res.json(confirmResult);
  } catch (err) {
    if (err.code === 'RESOURCE_LIMIT_REACHED') {
      return res.status(403).json({
        success: false,
        error: err.code,
        code: err.code,
        resource: err.resource,
        limitKey: err.limitKey,
        limit: err.limit,
        currentCount: err.currentCount,
        nextCount: err.nextCount,
        message: err.message
      });
    }
    if (err.status === 404 || err.code === 'PROPOSAL_NOT_FOUND_OR_EXPIRED') {
      return res.status(404).json({
        success: false,
        message: err.message || 'Proposta não encontrada ou expirada.'
      });
    }
    if (err.status === 403 || err.code === 'FORBIDDEN_PROPOSAL' || err.code === 'MODULE_FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: err.message || 'Acesso negado para confirmar este lançamento.'
      });
    }
    if (err.status === 503 || err.code === 'MODULE_MAINTENANCE') {
      return res.status(503).json({
        success: false,
        message: err.message || 'O módulo de Despesas está temporariamente em manutenção.'
      });
    }
    if (err.status === 409 || err.code === 'CONCURRENCY_CONFLICT') {
      return res.status(409).json({
        success: false,
        conflict: true,
        message: 'Conflito de concorrência ao salvar despesa. Tente novamente.'
      });
    }
    if (err.status === 400 || err.code === 'INVALID_CATEGORY' || err.code === 'INVALID_DESTINATION' || err.code === 'PROPOSAL_ALREADY_CANCELLED') {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    console.error('[AI ACTION] confirm error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao confirmar despesa.'
    });
  }
});

// POST /api/ai/actions/expense/cancel - Cancelar proposta de despesa
app.post('/api/ai/actions/expense/cancel', authMiddleware, async (req, res) => {
  try {
    const { proposalId } = req.body || {};

    if (!proposalId || typeof proposalId !== 'string' || !proposalId.trim()) {
      return res.status(400).json({
        success: false,
        message: 'ID de proposta (proposalId) obrigatório.'
      });
    }

    const cancelResult = await cancelExpenseProposal({
      userId: req.user.id,
      proposalId: proposalId.trim()
    });

    return res.json(cancelResult);
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({
        success: false,
        message: err.message || 'Acesso negado.'
      });
    }
    console.error('[AI ACTION] cancel error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao cancelar proposta.'
    });
  }
});

// POST /api/ai/actions/benefit/confirm - Confirmar e persistir proposta de benefício
app.post('/api/ai/actions/benefit/confirm', authMiddleware, async (req, res) => {
  try {
    const { proposalId, data } = req.body || {};

    if (!proposalId || typeof proposalId !== 'string' || !proposalId.trim()) {
      return res.status(400).json({
        success: false,
        message: 'ID de proposta (proposalId) obrigatório.'
      });
    }

    // Enforcement quantitativo de benefícios (Lote 5F)
    const finances = await getUserFinances(req.user.id);
    await quantitativeEntitlementService.assertWithinItemLimit({
      user: req.user,
      resourceKey: 'beneficios',
      limitKey: 'maxItems',
      currentFinances: finances,
      explicitDelta: 1
    });

    const confirmResult = await confirmBenefitProposal({
      userId: req.user.id,
      proposalId: proposalId.trim(),
      data: (data && typeof data === 'object') ? data : {}
    });

    return res.json(confirmResult);
  } catch (err) {
    if (err.code === 'RESOURCE_LIMIT_REACHED') {
      return res.status(403).json({
        success: false,
        error: err.code,
        code: err.code,
        resource: err.resource,
        limitKey: err.limitKey,
        limit: err.limit,
        currentCount: err.currentCount,
        nextCount: err.nextCount,
        message: err.message
      });
    }
    if (err.status === 404 || err.code === 'PROPOSAL_NOT_FOUND_OR_EXPIRED') {
      return res.status(404).json({
        success: false,
        message: err.message || 'Proposta não encontrada ou expirada.'
      });
    }
    if (err.status === 403 || err.code === 'FORBIDDEN_PROPOSAL' || err.code === 'MODULE_FORBIDDEN') {
      return res.status(403).json({
        success: false,
        message: err.message || 'Acesso negado para confirmar este lançamento.'
      });
    }
    if (err.status === 503 || err.code === 'MODULE_MAINTENANCE') {
      return res.status(503).json({
        success: false,
        message: err.message || 'O módulo de Benefícios está temporariamente em manutenção.'
      });
    }
    if (err.status === 409 || err.code === 'CONCURRENCY_CONFLICT') {
      return res.status(409).json({
        success: false,
        conflict: true,
        message: 'Conflito de concorrência ao salvar benefício. Tente novamente.'
      });
    }
    if (err.status === 400 || err.code === 'INVALID_BENEFIT_TYPE' || err.code === 'INVALID_PROPOSAL_TYPE' || err.code === 'PROPOSAL_ALREADY_CANCELLED') {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    console.error('[AI ACTION] confirm benefit error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao confirmar benefício.'
    });
  }
});

// POST /api/ai/actions/benefit/cancel - Cancelar proposta de benefício
app.post('/api/ai/actions/benefit/cancel', authMiddleware, async (req, res) => {
  try {
    const { proposalId } = req.body || {};

    if (!proposalId || typeof proposalId !== 'string' || !proposalId.trim()) {
      return res.status(400).json({
        success: false,
        message: 'ID de proposta (proposalId) obrigatório.'
      });
    }

    const cancelResult = await cancelExpenseProposal({
      userId: req.user.id,
      proposalId: proposalId.trim()
    });

    return res.json(cancelResult);
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({
        success: false,
        message: err.message || 'Acesso negado.'
      });
    }
    console.error('[AI ACTION] cancel benefit error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao cancelar proposta de benefício.'
    });
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

    const pwdCheck = validatePasswordPolicy(senha);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, message: pwdCheck.message });
    }

    const users = await getUsers();
    const cleanLogin = login.trim().toLowerCase();
    const cleanEmail = normalizeEmail(email);

    if (users.some(u => u.login.toLowerCase() === cleanLogin)) {
      return res.status(409).json({ success: false, message: 'Este login já está em uso.' });
    }

    if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ success: false, message: 'Este e-mail já está cadastrado.' });
    }

    const hashedPassword = await hashPassword(senha);
    const nowISO = new Date().toISOString();

    // Obter plano default obrigatório para novos usuários via admin (Lote 5C)
    const defaultPlan = await planService.getDefaultPlan();
    if (!defaultPlan || !defaultPlan._id) {
      return res.status(500).json({
        success: false,
        error: 'DEFAULT_PLAN_NOT_FOUND',
        message: 'Nenhum plano padrão configurado no sistema.'
      });
    }

    const newUser = {
      id: generateUserId(),
      nome: nome.trim(),
      login: cleanLogin,
      email: cleanEmail,
      senha: hashedPassword,
      is_admin: !!is_admin,
      notificacoes_ativas: typeof notificacoes_ativas === 'boolean' ? notificacoes_ativas : true,
      tokenVersion: 0,
      emailVerified: true,
      emailVerifiedAt: nowISO,
      planId: defaultPlan._id,
      createdAt: nowISO
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
      const pwdCheck = validatePasswordPolicy(novaSenha);
      if (!pwdCheck.valid) {
        return res.status(400).json({ success: false, message: pwdCheck.message });
      }
      user.senha = await hashPassword(novaSenha);
      user.tokenVersion = (typeof user.tokenVersion === 'number' ? user.tokenVersion : 0) + 1;
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

    const pwdCheck = validatePasswordPolicy(novaSenha);
    if (!pwdCheck.valid) {
      return res.status(400).json({ success: false, message: pwdCheck.message });
    }

    const users = await getUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    user.senha = await hashPassword(novaSenha);
    user.tokenVersion = (typeof user.tokenVersion === 'number' ? user.tokenVersion : 0) + 1;
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
      calendario: permissions.calendario !== false,
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
   ADMIN ROUTES: PLANS & ENTITLEMENTS (LOTE 5D)
   ========================================================================== */

// 1. GET /api/admin/plans/registry - Metadados do registry comercial canônico
app.get('/api/admin/plans/registry', authMiddleware, adminOnlyMiddleware, (req, res) => {
  const resources = Object.entries(ENTITLEMENT_REGISTRY).map(([key, def]) => ({
    key,
    label: def.label || key,
    description: def.description || def.label || key,
    supportsAccessToggle: !!def.supportsAccessToggle,
    availableLimits: Array.isArray(def.availableLimits)
      ? def.availableLimits.map(lim => ({
          key: lim.key,
          label: lim.label || lim.key,
          description: lim.description || lim.label || lim.key,
          type: lim.type || 'integer',
          min: typeof lim.min === 'number' ? lim.min : 0,
          allowUnlimited: !!lim.allowUnlimited
        }))
      : []
  }));

  return res.json({ success: true, resources });
});

// 2. GET /api/admin/plans - Listar planos com filtros estritos e ordenação
app.get('/api/admin/plans', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const { status, isDefault } = req.query;

    if (status !== undefined) {
      if (!['active', 'inactive', 'archived'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PLAN_STATUS',
          message: 'Filtro status inválido. Valores aceitos: active, inactive, archived.'
        });
      }
    }

    if (isDefault !== undefined) {
      if (isDefault !== 'true' && isDefault !== 'false') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_REQUEST_FIELD',
          message: 'Filtro isDefault inválido. Valores aceitos: true, false.'
        });
      }
    }

    const allPlans = await planService.getAllPlans();
    let filteredPlans = allPlans;

    if (status !== undefined) {
      filteredPlans = filteredPlans.filter(p => p.status === status);
    }

    if (isDefault !== undefined) {
      const targetIsDefault = isDefault === 'true';
      filteredPlans = filteredPlans.filter(p => p.isDefault === targetIsDefault);
    }

    filteredPlans.sort((a, b) => {
      const orderA = (a.metadata && typeof a.metadata.displayOrder === 'number') ? a.metadata.displayOrder : 0;
      const orderB = (b.metadata && typeof b.metadata.displayOrder === 'number') ? b.metadata.displayOrder : 0;
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '');
    });

    return res.json({ success: true, plans: filteredPlans });
  } catch (err) {
    console.error('Erro ao listar planos:', err);
    return res.status(500).json({ success: false, message: 'Erro ao listar planos.' });
  }
});

// 3. GET /api/admin/plans/:planId - Consultar plano por _id exato
app.get('/api/admin/plans/:planId', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const plan = await planService.getPlanById(req.params.planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'PLAN_NOT_FOUND',
        message: `Plano "${req.params.planId}" não encontrado.`
      });
    }
    return res.json({ success: true, plan });
  } catch (err) {
    console.error('Erro ao consultar plano:', err);
    return res.status(500).json({ success: false, message: 'Erro ao consultar plano.' });
  }
});

// 4. POST /api/admin/plans - Criar novo plano com whitelist estrita
app.post('/api/admin/plans', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    const bodyKeys = Object.keys(body);

    if (bodyKeys.includes('isDefault')) {
      return res.status(400).json({
        success: false,
        error: 'PLAN_DEFAULT_CHANGE_REQUIRES_EXPLICIT_ENDPOINT',
        message: 'A definição de plano padrão não é permitida na criação genérica. Utilize o endpoint explícito de troca de default.'
      });
    }

    const allowedKeys = ['name', 'slug', 'description', 'status', 'pricing', 'entitlements', 'metadata'];
    const unknownKeys = bodyKeys.filter(k => !allowedKeys.includes(k));
    if (unknownKeys.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST_FIELD',
        message: `Campos não permitidos na criação de plano: ${unknownKeys.join(', ')}`
      });
    }

    if (body.status !== undefined && !['active', 'inactive', 'archived'].includes(body.status)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PLAN_STATUS',
        message: 'Status do plano inválido. Valores aceitos: active, inactive, archived.'
      });
    }

    if (body.pricing !== undefined) {
      body.pricing = planService.validatePricingInput(body.pricing);
    }

    const created = await planService.createPlan(body);
    return res.status(201).json({ success: true, plan: created });
  } catch (err) {
    if (err.code === 'SLUG_DUPLICATE') {
      return res.status(400).json({
        success: false,
        error: 'SLUG_DUPLICATE',
        message: err.message
      });
    }
    if (err.code === 'UNKNOWN_RESOURCE' || err.code === 'UNKNOWN_LIMIT') {
      return res.status(400).json({
        success: false,
        error: err.code,
        message: err.message
      });
    }
    return res.status(400).json({
      success: false,
      error: err.code || 'PLAN_VALIDATION_ERROR',
      message: err.message || 'Erro de validação ao criar plano.'
    });
  }
});

// 5. PUT /api/admin/plans/:planId - Editar plano com whitelist estrita
app.put('/api/admin/plans/:planId', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const planId = req.params.planId;
    const existing = await planService.getPlanById(planId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'PLAN_NOT_FOUND',
        message: `Plano "${planId}" não encontrado.`
      });
    }

    const body = req.body || {};
    const bodyKeys = Object.keys(body);

    if (bodyKeys.includes('slug')) {
      return res.status(400).json({
        success: false,
        error: 'PLAN_SLUG_IMMUTABLE',
        message: 'O slug do plano é estritamente imutável após a criação.'
      });
    }

    if (bodyKeys.includes('isDefault')) {
      return res.status(400).json({
        success: false,
        error: 'PLAN_DEFAULT_CHANGE_REQUIRES_EXPLICIT_ENDPOINT',
        message: 'A alteração de plano padrão requer o endpoint explícito de troca de default.'
      });
    }

    if (bodyKeys.includes('status')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST_FIELD',
        message: 'A alteração de status deve utilizar exclusivamente o endpoint PATCH /api/admin/plans/:planId/status.'
      });
    }

    const allowedKeys = ['name', 'description', 'pricing', 'entitlements', 'metadata'];
    const unknownKeys = bodyKeys.filter(k => !allowedKeys.includes(k));
    if (unknownKeys.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST_FIELD',
        message: `Campos não permitidos na edição de plano: ${unknownKeys.join(', ')}`
      });
    }

    if (body.pricing !== undefined) {
      body.pricing = planService.validatePricingInput(body.pricing);
    }

    const updated = await planService.updatePlan(planId, body);
    return res.json({ success: true, plan: updated });
  } catch (err) {
    if (err.code === 'SLUG_IMMUTABLE') {
      return res.status(400).json({
        success: false,
        error: 'PLAN_SLUG_IMMUTABLE',
        message: err.message
      });
    }
    if (err.code === 'UNKNOWN_RESOURCE' || err.code === 'UNKNOWN_LIMIT') {
      return res.status(400).json({
        success: false,
        error: err.code,
        message: err.message
      });
    }
    return res.status(400).json({
      success: false,
      error: err.code || 'PLAN_VALIDATION_ERROR',
      message: err.message || 'Erro de validação ao editar plano.'
    });
  }
});

// 6. PATCH /api/admin/plans/:planId/status - Lifecycle de plano
app.patch('/api/admin/plans/:planId/status', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const planId = req.params.planId;
    const existing = await planService.getPlanById(planId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'PLAN_NOT_FOUND',
        message: `Plano "${planId}" não encontrado.`
      });
    }

    const body = req.body || {};
    const bodyKeys = Object.keys(body);

    if (!bodyKeys.includes('status')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PLAN_STATUS',
        message: 'Campo "status" é obrigatório no payload.'
      });
    }

    const extraKeys = bodyKeys.filter(k => k !== 'status');
    if (extraKeys.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST_FIELD',
        message: `Campos não permitidos no endpoint de status: ${extraKeys.join(', ')}`
      });
    }

    const { status } = body;
    if (!['active', 'inactive', 'archived'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PLAN_STATUS',
        message: 'Status inválido. Valores aceitos: active, inactive, archived.'
      });
    }

    if (existing.isDefault && status !== 'active') {
      return res.status(409).json({
        success: false,
        error: 'DEFAULT_PLAN_MUST_BE_ACTIVE',
        message: `Não é permitido alterar o status do plano padrão para "${status}". O plano padrão deve permanecer ativo.`
      });
    }

    const updated = await planService.setPlanStatus(planId, status);
    return res.json({ success: true, plan: updated });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.code || 'PLAN_VALIDATION_ERROR',
      message: err.message || 'Erro ao alterar status do plano.'
    });
  }
});

// 7. POST /api/admin/plans/:planId/set-default - Troca explícita de default
const setDefaultPlanHandler = async (req, res) => {
  try {
    const planId = req.params.planId;
    const target = await planService.getPlanById(planId);
    if (!target) {
      return res.status(404).json({
        success: false,
        error: 'PLAN_NOT_FOUND',
        message: `Plano "${planId}" não encontrado.`
      });
    }

    if (target.status !== 'active') {
      return res.status(409).json({
        success: false,
        error: 'DEFAULT_PLAN_MUST_BE_ACTIVE',
        message: `Plano com status "${target.status}" não pode ser definido como padrão. Apenas planos com status "active" podem ser default.`
      });
    }

    if (target.isDefault) {
      return res.json({
        success: true,
        plan: target,
        message: 'Plano já é o padrão do sistema.'
      });
    }

    const updated = await planService.setDefaultPlan(planId);
    return res.json({ success: true, plan: updated });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.code || 'PLAN_DEFAULT_SWITCH_FAILED',
      message: err.message || 'Erro ao definir plano padrão.'
    });
  }
};

app.post('/api/admin/plans/:planId/set-default', authMiddleware, adminOnlyMiddleware, setDefaultPlanHandler);

// 8. PATCH /api/admin/users/:userId/plan - Atribuir plano a usuário
app.patch('/api/admin/users/:userId/plan', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    const body = req.body || {};
    const bodyKeys = Object.keys(body);

    if (!bodyKeys.includes('planId')) {
      return res.status(400).json({
        success: false,
        error: 'PLAN_VALIDATION_ERROR',
        message: 'Campo "planId" é obrigatório no payload.'
      });
    }

    const extraKeys = bodyKeys.filter(k => k !== 'planId');
    if (extraKeys.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST_FIELD',
        message: `Campos não permitidos na atribuição de plano: ${extraKeys.join(', ')}`
      });
    }

    const { planId } = body;
    if (!planId || typeof planId !== 'string' || !planId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'PLAN_VALIDATION_ERROR',
        message: 'Campo "planId" deve ser uma string não vazia.'
      });
    }

    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: `Usuário "${userId}" não encontrado.`
      });
    }

    const targetPlan = await planService.getPlanById(planId);
    if (!targetPlan) {
      return res.status(404).json({
        success: false,
        error: 'PLAN_NOT_FOUND',
        message: `Plano "${planId}" não encontrado.`
      });
    }

    // Se o usuário já estiver vinculado exatamente a esse plano: no-op idempotente (sem escrita no banco)
    if (user.planId === planId) {
      return res.json({
        success: true,
        userId: user.id || userId,
        planId,
        unchanged: true,
        message: 'Usuário já está vinculado a este plano.'
      });
    }

    // Para novas atribuições, o plano precisa estar estritamente "active"
    if (targetPlan.status !== 'active') {
      return res.status(409).json({
        success: false,
        error: 'PLAN_NOT_ASSIGNABLE',
        message: `Planos com status "${targetPlan.status}" não podem receber novas atribuições.`
      });
    }

    const updatedUser = await updateUserPlan(userId, planId);
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: `Usuário "${userId}" não encontrado.`
      });
    }

    return res.json({
      success: true,
      userId: updatedUser.id || userId,
      planId: updatedUser.planId,
      message: 'Plano do usuário atualizado com sucesso.'
    });
  } catch (err) {
    console.error('Erro ao atribuir plano a usuário:', err);
    return res.status(500).json({ success: false, message: 'Erro ao atribuir plano a usuário.' });
  }
});

// 9. GET /api/admin/users/:userId/plan - Consultar plano e entitlements efetivos do usuário
app.get('/api/admin/users/:userId/plan', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: `Usuário "${userId}" não encontrado.`
      });
    }

    let effectivePlan = null;
    let inheritedFromDefault = false;

    if (!user.planId) {
      effectivePlan = await planService.getDefaultPlan();
      if (!effectivePlan) {
        return res.status(500).json({
          success: false,
          error: 'DEFAULT_PLAN_NOT_FOUND',
          message: 'Nenhum plano padrão configurado no sistema.'
        });
      }
      inheritedFromDefault = true;
    } else {
      effectivePlan = await planService.getPlanById(user.planId);
      if (!effectivePlan) {
        return res.status(409).json({
          success: false,
          error: 'PLAN_REFERENCE_INVALID',
          message: `O plano vinculado ao usuário ("${user.planId}") não existe no catálogo.`
        });
      }
      inheritedFromDefault = false;
    }

    let effectiveEntitlements = null;
    try {
      effectiveEntitlements = await entitlementService.getEffectiveEntitlements(user);
    } catch (entErr) {
      if (entErr.code === 'PLAN_REFERENCE_INVALID') {
        return res.status(409).json({
          success: false,
          error: 'PLAN_REFERENCE_INVALID',
          message: `O plano vinculado ao usuário ("${user.planId}") não existe no catálogo.`
        });
      }
      throw entErr;
    }

    return res.json({
      success: true,
      userId: user.id || userId,
      planId: user.planId || null,
      inheritedFromDefault,
      plan: {
        id: effectivePlan._id,
        _id: effectivePlan._id,
        name: effectivePlan.name,
        slug: effectivePlan.slug,
        status: effectivePlan.status,
        isDefault: effectivePlan.isDefault,
        pricing: effectivePlan.pricing
      },
      effectiveEntitlements
    });
  } catch (err) {
    console.error('Erro ao consultar plano de usuário:', err);
    return res.status(500).json({ success: false, message: 'Erro ao consultar plano de usuário.' });
  }
});

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

    const ALLOWED_MODULES = ['dashboard', 'calendario', 'despesas', 'extras', 'devedores', 'investimentos', 'beneficios', 'compras', 'simulacao'];
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
   ADMIN EMAIL & SMTP SETTINGS (Checkpoint Security 6A)
   ========================================================================== */

// GET /api/admin/email-settings - Consulta configuração SMTP sanitizada (sem senha)
app.get('/api/admin/email-settings', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const settings = await getEmailSettings();
    return res.json({
      success: true,
      settings: {
        enabled: Boolean(settings.enabled),
        host: settings.host || '',
        port: Number(settings.port) || 465,
        secure: Boolean(settings.secure),
        username: settings.username || '',
        passwordConfigured: Boolean(settings.encryptedPassword),
        fromName: settings.fromName || '',
        fromEmail: settings.fromEmail || '',
        updatedAt: settings.updatedAt || null
      }
    });
  } catch (err) {
    console.error('Erro ao consultar configurações de e-mail:', err);
    return res.status(500).json({ success: false, message: 'Erro ao consultar configurações de e-mail.' });
  }
});

// PUT /api/admin/email-settings - Atualiza configuração SMTP com validação estrita e criptografia
app.put('/api/admin/email-settings', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const { enabled, host, port, secure, username, password, fromName, fromEmail } = req.body || {};

    // 1. Validação de campos obrigatórios básicos
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Campo "enabled" deve ser booleano.' });
    }

    if (typeof host !== 'string' || !host.trim() || host.trim().length > 255) {
      return res.status(400).json({ success: false, message: 'Campo "host" é obrigatório e deve ter até 255 caracteres.' });
    }

    const cleanHost = host.trim();

    // 2. Validação Anti-SSRF e Higienização de Host
    // Bloqueia esquemas de protocolo (http://, https://, smtp://, etc.), barras, caracteres de controle e espaços
    if (cleanHost.includes('://') || cleanHost.includes('/') || cleanHost.includes('\\') || cleanHost.includes('@') || cleanHost.includes(' ') || /[\r\n\t]/.test(cleanHost)) {
      return res.status(400).json({
        success: false,
        message: 'Host SMTP inválido. Informe apenas o hostname ou endereço IP, sem protocolos (http://, smtp://), barras ou espaços.'
      });
    }

    // Valida formato de hostname/FQDN ou IP (caracteres alfanuméricos, pontos e hífens)
    if (!/^[a-zA-Z0-9.-]+$/.test(cleanHost)) {
      return res.status(400).json({
        success: false,
        message: 'Host SMTP contém caracteres inválidos.'
      });
    }

    // Em produção: proteção explícita contra SSRF para loopback e metadata AWS
    if (config.NODE_ENV === 'production') {
      const lowerHost = cleanHost.toLowerCase();
      if (
        lowerHost === 'localhost' ||
        lowerHost === '127.0.0.1' ||
        lowerHost === '0.0.0.0' ||
        lowerHost.startsWith('127.') ||
        lowerHost === '169.254.169.254'
      ) {
        return res.status(400).json({
          success: false,
          message: 'Host SMTP não pode apontar para endereços de loopback ou metadados em ambiente de produção.'
        });
      }
    }

    // 3. Validação de Porta
    const parsedPort = parseInt(port, 10);
    if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      return res.status(400).json({ success: false, message: 'Campo "port" deve ser um número inteiro entre 1 e 65535.' });
    }

    // 4. Validação de Conexão Segura
    if (typeof secure !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Campo "secure" deve ser booleano.' });
    }

    // 5. Validação de Usuário
    if (typeof username !== 'string' || !username.trim() || username.trim().length > 255) {
      return res.status(400).json({ success: false, message: 'Campo "username" é obrigatório e deve ter até 255 caracteres.' });
    }

    // 6. Validação de Nome e E-mail do Remetente
    const cleanFromName = (typeof fromName === 'string' ? fromName.trim() : 'CorvFin').slice(0, 100);
    if (/[\r\n]/.test(cleanFromName)) {
      return res.status(400).json({ success: false, message: 'Nome do remetente não pode conter quebras de linha.' });
    }

    const cleanFromEmail = typeof fromEmail === 'string' ? fromEmail.trim() : '';
    const fromEmailCheck = validateEmail(cleanFromEmail);
    if (!cleanFromEmail || !fromEmailCheck.valid) {
      return res.status(400).json({ success: false, message: 'E-mail do remetente inválido.' });
    }

    // 7. Gerenciamento Seguro da Senha SMTP
    const currentSettings = await getEmailSettings();
    let encryptedPassword = currentSettings.encryptedPassword;

    // Se nova senha foi fornecida (não vazia)
    if (password !== undefined && password !== null && String(password).trim().length > 0) {
      const cleanPassword = String(password).trim();
      if (cleanPassword.length > 500) {
        return res.status(400).json({ success: false, message: 'Senha SMTP excede o limite máximo permitido (500 caracteres).' });
      }

      if (!cryptoService.isEncryptionConfigured()) {
        return res.status(500).json({
          success: false,
          message: 'Não é possível criptografar a senha SMTP: MAIL_CONFIG_ENCRYPTION_KEY não configurada no ambiente do servidor.'
        });
      }

      encryptedPassword = cryptoService.encrypt(cleanPassword);
    }

    // Se ativado, exige que uma senha esteja configurada
    if (enabled && !encryptedPassword) {
      return res.status(400).json({
        success: false,
        message: 'Senha SMTP é obrigatória para ativar o serviço de e-mails.'
      });
    }

    // 8. Salvar Configuração
    const saved = await saveEmailSettings({
      enabled,
      host: cleanHost,
      port: parsedPort,
      secure,
      username: username.trim(),
      encryptedPassword,
      fromName: cleanFromName,
      fromEmail: cleanFromEmail,
      updatedBy: req.user.id
    });

    // Invalida transporter em memória imediatamente para aplicar novas configurações
    mailService.invalidateTransporter();

    console.log(`[Audit] SMTP_CONFIG_UPDATED: Configuração de e-mail atualizada por admin "${req.user.login}" (${req.user.id}). Status: ${enabled ? 'Ativado' : 'Desativado'}.`);

    return res.json({
      success: true,
      message: 'Configurações de e-mail atualizadas com sucesso!',
      settings: {
        enabled: Boolean(saved.enabled),
        host: saved.host,
        port: saved.port,
        secure: Boolean(saved.secure),
        username: saved.username,
        passwordConfigured: Boolean(saved.encryptedPassword),
        fromName: saved.fromName,
        fromEmail: saved.fromEmail,
        updatedAt: saved.updatedAt
      }
    });
  } catch (err) {
    console.error('Erro ao salvar configurações de e-mail:', err);
    return res.status(500).json({ success: false, message: 'Erro interno ao salvar configurações de e-mail.' });
  }
});

// POST /api/admin/email-settings/test - Teste controlado de conectividade ou envio
app.post('/api/admin/email-settings/test', authMiddleware, adminOnlyMiddleware, emailTestLimiter, async (req, res) => {
  try {
    const { action } = req.body || {};
    const effectiveAction = (typeof action === 'string' ? action.trim().toLowerCase() : 'verify');

    if (!['verify', 'send'].includes(effectiveAction)) {
      return res.status(400).json({
        success: false,
        message: 'Ação de teste inválida. Use "verify" para testar conexão ou "send" para enviar e-mail de teste.'
      });
    }

    if (effectiveAction === 'verify') {
      await mailService.verifyConnection();
      console.log(`[Audit] SMTP_CONNECTION_TESTED: Conexão testada com sucesso por admin "${req.user.login}" (${req.user.id}).`);
      return res.json({
        success: true,
        message: 'Conexão e autenticação com o servidor SMTP estabelecidas com sucesso!'
      });
    }

    // effectiveAction === 'send'
    // O envio de teste é restrito estritamente ao e-mail cadastrado do administrador autenticado
    const recipientEmail = (req.user.email || '').trim();
    const recipientCheck = validateEmail(recipientEmail);
    if (!recipientEmail || !recipientCheck.valid) {
      return res.status(400).json({
        success: false,
        message: 'O administrador autenticado não possui um e-mail válido cadastrado para receber o teste.'
      });
    }

    const result = await mailService.sendTestEmail(recipientEmail, req.user.nome);
    console.log(`[Audit] SMTP_TEST_EMAIL_SENT: E-mail de teste enviado para "${recipientEmail}" por admin "${req.user.login}" (${req.user.id}). MessageId: ${result.messageId}`);

    return res.json({
      success: true,
      message: `E-mail de teste enviado com sucesso para ${recipientEmail}!`,
      messageId: result.messageId
    });
  } catch (err) {
    console.error('[Audit] SMTP_TEST_FAILED: Falha no teste SMTP executado por admin:', err.message);
    return res.status(400).json({
      success: false,
      error: err.code || 'SMTP_TEST_FAILED',
      message: err.message || 'Falha ao executar teste SMTP.'
    });
  }
});

/* ==========================================================================
   3. HANDLER 404 EXCLUSIVO DA API
   ========================================================================== */

// Intercepta qualquer requisição sob /api que não correspondeu a uma rota real
app.use((req, res, next) => {
  const urlPath = req.originalUrl || req.url || '';
  const isApiRoute = urlPath.startsWith('/api') || urlPath.includes('/api/') || urlPath.endsWith('/api');
  if (isApiRoute) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'Rota da API não encontrada.'
    });
  }
  next();
});

/* ==========================================================================
   4. ARQUIVOS ESTÁTICOS (PWA, CSS, JS, ASSETS)
   ========================================================================== */
const staticOptions = {
  setHeaders: (res, filePath) => {
    // Service Worker: NUNCA deve ser cacheado pelo navegador para permitir ciclo de update
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return;
    }
    // HTML: sempre revalidar (Network-first / ETag)
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
      return;
    }
    // CSS e JS:
    if (config.NODE_ENV === 'production') {
      // Em produção, permite revalidação condicional (ETag / 304)
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    } else {
      // Em desenvolvimento, revalidação imediata
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
};

if (config.BASE_PATH) {
  app.use(`${config.BASE_PATH}/shared`, express.static(path.join(__dirname, '..', 'shared'), staticOptions));
  app.use(config.BASE_PATH, express.static(path.join(__dirname, '..', 'public'), staticOptions));
}
app.use('/shared', express.static(path.join(__dirname, '..', 'shared'), staticOptions));
app.use(express.static(path.join(__dirname, '..', 'public'), staticOptions));

/* ==========================================================================
   5. FALLBACK SPA (HTML)
   ========================================================================== */
const sendLoginPage = (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
};
const sendIndexPage = (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
};

if (config.BASE_PATH) {
  app.get(`${config.BASE_PATH}/login`, sendLoginPage);
  app.get(`${config.BASE_PATH}/verify-email`, sendLoginPage);
  app.get(`${config.BASE_PATH}/reset-password`, sendLoginPage);
  app.get(`${config.BASE_PATH}/*`, sendIndexPage);
}

app.get('/login', sendLoginPage);
app.get('/verify-email', sendLoginPage);
app.get('/reset-password', sendLoginPage);
app.get('*', sendIndexPage);

// Middleware Global Terminal de Tratamento e Sanitização de Erros
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // 1. Erro de Payload Too Large (Express body-parser 413)
  if (err.status === 413 || err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'PAYLOAD_TOO_LARGE',
      message: `O tamanho da requisição excede o limite máximo permitido (${config.BODY_LIMIT || '5mb'}).`
    });
  }

  // 2. Erro de sintaxe JSON no body da requisição
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'Formato de JSON inválido no corpo da requisição.'
    });
  }

  // 3. Erro de política de CORS
  if (err && err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      success: false,
      error: 'CORS_ERROR',
      message: 'Acesso rejeitado por política de CORS.'
    });
  }

  // 4. Erros internos não capturados (500)
  const safeMsg = (err && err.message) ? String(err.message).replace(/\/\/[^@]+@/, '//***:***@') : 'Erro interno';
  console.error('[Global Error Handler]', safeMsg);

  return res.status(err.status || 500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'Ocorreu um erro interno ao processar a solicitação.'
  });
});

// Bootstrap explícito de domínio para inicialização e seed
async function initDomainBootstrap() {
  if (config.STORAGE_DRIVER === 'mongodb') {
    const { connectDB } = require('./config/db');
    await connectDB();
  }
  return await planService.ensureDefaultPlan();
}

// Start Server conditionally
if (require.main === module) {
  (async () => {
    try {
      await initDomainBootstrap();
    } catch (err) {
      console.error('[Bootstrap Error] Falha ao inicializar domínio e plano default:', err);
      process.exit(1);
    }
    app.listen(config.PORT, () => {
      console.log(`====================================================`);
      console.log(`  Finanças Pro Server rodando na porta: ${config.PORT}`);
      console.log(`  Acesse: http://localhost:${config.PORT}`);
      console.log(`====================================================`);
    });
  })();
}

app.initDomainBootstrap = initDomainBootstrap;
module.exports = app;
