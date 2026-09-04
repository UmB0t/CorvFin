const nodemailer = require('nodemailer');
const config = require('../config/config');
const storageService = require('./storageService');
const cryptoService = require('./cryptoService');
const {
  getVerificationEmailTemplate,
  getPasswordResetEmailTemplate,
  getPasswordChangedEmailTemplate
} = require('../templates/emailTemplates');

let cachedTransporter = null;

/**
 * Invalida o transporter em memória para forçar recarregamento na próxima chamada.
 */
function invalidateTransporter() {
  if (cachedTransporter && typeof cachedTransporter.close === 'function') {
    try {
      cachedTransporter.close();
    } catch (_) {}
  }
  cachedTransporter = null;
}

/**
 * Sanitiza e normaliza erros gerados pela biblioteca SMTP/Nodemailer.
 * Impede vazamento de senhas, credenciais e stack traces para as camadas superiores.
 */
function normalizeMailError(err) {
  if (!err) return new Error('Erro desconhecido ao processar e-mail.');

  const code = (err.code || '').toUpperCase();
  const rawMsg = err.message || '';

  // Sanitiza qualquer fragmento que possa conter credenciais ou senhas
  const safeMsg = rawMsg
    .replace(/\/\/[^@]+@/, '//***:***@')
    .replace(/pass=[^& \n]+/gi, 'pass=***')
    .replace(/password=[^& \n]+/gi, 'password=***');

  let userFriendly = safeMsg;

  if (code === 'ECONNREFUSED') {
    userFriendly = 'Não foi possível conectar ao servidor SMTP (conexão recusada no host/porta informados).';
  } else if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
    userFriendly = 'Tempo limite esgotado ao estabelecer conexão com o servidor SMTP.';
  } else if (code === 'EAUTH') {
    userFriendly = 'Falha na autenticação SMTP. Verifique o usuário e a senha configurados.';
  } else if (code === 'ENOTFOUND') {
    userFriendly = 'Servidor SMTP não encontrado. Verifique o nome do host.';
  } else if (code === 'ESOCKET' || code === 'EENVELOPE') {
    userFriendly = 'Erro na negociação SSL/TLS ou envelope com o servidor SMTP.';
  }

  const normalized = new Error(userFriendly);
  normalized.code = code || 'EMAIL_ERROR';
  return normalized;
}

/**
 * Obtém ou inicializa o transporter SMTP ativo com timeouts seguros e fail-closed.
 */
async function getTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const settings = await storageService.getEmailSettings();
  if (!settings.enabled) {
    const disabledErr = new Error('Serviço de e-mail está desativado nas configurações do sistema.');
    disabledErr.code = 'EMAIL_DISABLED';
    throw disabledErr;
  }

  if (!settings.host || !settings.port) {
    const invalidErr = new Error('Configuração SMTP incompleta (host ou porta ausentes).');
    invalidErr.code = 'SMTP_CONFIG_INCOMPLETE';
    throw invalidErr;
  }

  if (!settings.encryptedPassword) {
    const noPassErr = new Error('Senha SMTP não configurada no sistema.');
    noPassErr.code = 'SMTP_PASSWORD_MISSING';
    throw noPassErr;
  }

  let decryptedPassword;
  try {
    decryptedPassword = cryptoService.decrypt(settings.encryptedPassword);
  } catch (cryptErr) {
    const err = new Error(cryptErr.message || 'Falha ao descriptografar credencial SMTP.');
    err.code = 'CRYPTO_ERROR';
    throw err;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: Number(settings.port),
      secure: Boolean(settings.secure),
      auth: {
        user: settings.username,
        pass: decryptedPassword
      },
      connectionTimeout: 10000, // 10 segundos para handshake TCP/TLS
      greetingTimeout: 10000,   // 10 segundos para banner SMTP inicial
      socketTimeout: 15000       // 15 segundos para socket inativo
    });

    cachedTransporter = transporter;
    return cachedTransporter;
  } catch (initErr) {
    throw normalizeMailError(initErr);
  }
}

/**
 * Testa a conectividade e autenticação com o servidor SMTP configurado.
 */
async function verifyConnection() {
  try {
    const transporter = await getTransporter();
    const ok = await transporter.verify();
    return { success: true, verified: ok };
  } catch (err) {
    throw normalizeMailError(err);
  }
}

/**
 * Envia um e-mail transacional via servidor SMTP configurado.
 */
async function sendMail({ to, subject, text, html }) {
  if (!to || typeof to !== 'string') {
    throw new Error('Destinatário (to) inválido ou não fornecido.');
  }
  if (!subject || typeof subject !== 'string') {
    throw new Error('Assunto (subject) inválido ou não fornecido.');
  }
  if (!text && !html) {
    throw new Error('Conteúdo da mensagem (text ou html) não fornecido.');
  }

  const settings = await storageService.getEmailSettings();
  const transporter = await getTransporter();

  const fromAddress = settings.fromName
    ? `"${settings.fromName.replace(/"/g, '')}" <${settings.fromEmail}>`
    : settings.fromEmail;

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: to.trim(),
      subject: subject.trim(),
      text,
      html
    });

    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
  } catch (err) {
    throw normalizeMailError(err);
  }
}

/**
 * Envia um e-mail de teste controlado com mensagem institucional do CorvFin.
 */
async function sendTestEmail(recipientEmail, adminName) {
  const subject = 'CorvFin — Teste de Configuração SMTP';
  const text = `Olá, ${adminName || 'Administrador'}!\n\nEste é um e-mail de teste transacional confirmando que a infraestrutura SMTP do CorvFin está operacional e devidamente autenticada.\n\nData do teste: ${new Date().toLocaleString('pt-BR')}\n\nCorvFin — Inteligência para suas finanças.`;
  const html = `
    <div style="font-family:'Manrope',sans-serif,Arial; max-width:560px; margin:0 auto; padding:28px; background:#111315; color:#F1F3F2; border-radius:16px; border:1px solid #2B3134;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:20px;">
        <div style="width:36px; height:36px; border-radius:10px; background:#1F7A5C; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px; color:#fff;">C</div>
        <h2 style="margin:0; font-size:20px; color:#F1F3F2;">CorvFin</h2>
      </div>
      <h3 style="margin-top:0; color:#10B981;">Conexão SMTP Estabelecida com Sucesso!</h3>
      <p style="color:#AAB2AE; font-size:14px; line-height:1.6;">
        Olá, <strong>${adminName || 'Administrador'}</strong>!<br><br>
        Este é um e-mail de teste gerado pelo painel administrativo para validar a conectividade e o envio seguro de mensagens transacionais.
      </p>
      <div style="background:#171A1C; border:1px solid #2B3134; border-radius:10px; padding:14px; margin:20px 0; font-size:13px; color:#7F8984;">
        <span style="color:#F1F3F2; font-weight:700;">Data do teste:</span> ${new Date().toLocaleString('pt-BR')}<br>
        <span style="color:#F1F3F2; font-weight:700;">Destinatário validado:</span> ${recipientEmail}
      </div>
      <p style="color:#7F8984; font-size:12px; margin-top:24px; border-top:1px solid #2B3134; padding-top:14px;">
        CorvFin • Inteligência para suas finanças.
      </p>
    </div>
  `;

  return sendMail({
    to: recipientEmail,
    subject,
    text,
    html
  });
}

function hasCachedTransporter() {
  return cachedTransporter !== null;
}

/**
 * Envia e-mail de confirmação de endereço para nova conta ou reenvio.
 */
async function sendVerificationEmail({ to, nome, token }) {
  const baseUrl = config.APP_PUBLIC_URL || 'https://app.corvfin.com.br';
  const verificationUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const template = getVerificationEmailTemplate({ nome, verificationUrl });
  return module.exports.sendMail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html
  });
}

/**
 * Envia e-mail de recuperação de senha com link contendo o token temporário.
 */
async function sendPasswordResetEmail({ to, nome, token }) {
  const baseUrl = config.APP_PUBLIC_URL || 'https://app.corvfin.com.br';
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const template = getPasswordResetEmailTemplate({ nome, resetUrl });
  return module.exports.sendMail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html
  });
}

/**
 * Envia notificação de segurança avisando que a senha do usuário foi alterada.
 */
async function sendPasswordChangedAlert({ to, nome }) {
  const template = getPasswordChangedEmailTemplate({ nome });
  return module.exports.sendMail({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html
  });
}

module.exports = {
  getTransporter,
  verifyConnection,
  sendMail,
  sendTestEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedAlert,
  invalidateTransporter,
  hasCachedTransporter,
  normalizeMailError
};
