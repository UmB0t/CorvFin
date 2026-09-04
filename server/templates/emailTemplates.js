/**
 * CorvFin — Templates Transacionais de E-mail
 * Checkpoint Security 6A/6B
 * 
 * Fornece templates HTML estilizados e versões em texto plano (fallback)
 * com a logo oficial do CorvFin, layout canônico unificado e formatação
 * de data/hora no timezone explícito da aplicação (America/Fortaleza).
 */

const config = require('../config/config');

const DEFAULT_EMAIL_TIMEZONE = (config.APP_TIMEZONE || 'America/Fortaleza').trim();

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formata data e hora para exibição em e-mails com timezone explícito (America/Fortaleza).
 * Entrada: Date, timestamp numérico ou ISO string UTC (ex: 2026-09-04T20:10:01Z).
 * Saída: '04/09/2026 17:10:01'.
 */
function formatDateTimeForEmail(date, timeZone = DEFAULT_EMAIL_TIMEZONE) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(d);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  return `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}:${map.second}`;
}

/**
 * Retorna a URL pública canônica HTTPS para o asset oficial da logo horizontal do CorvFin.
 * Garante que a URL seja sempre pública HTTPS e nunca file:// ou localhost.
 */
function getPublicLogoUrl(customBaseUrl) {
  const base = (customBaseUrl || config.APP_PUBLIC_URL || 'https://app.corvfin.com.br').trim().replace(/\/+$/, '');
  if (!base || base.startsWith('http://localhost') || base.startsWith('http://127.0.0.1')) {
    return 'https://app.corvfin.com.br/icons/corvfin-logo-horizontal.png';
  }
  return `${base}/icons/corvfin-logo-horizontal.png`;
}

/**
 * Layout base reutilizável para todos os e-mails transacionais do CorvFin.
 * Inclui cabeçalho canônico com a logo oficial, fallback textual resiliente
 * para bloqueio de imagens e design system escuro profissional.
 */
function getBaseLayout({ title, heading, contentHtml, footerNote, appPublicUrl }) {
  const logoUrl = getPublicLogoUrl(appPublicUrl);
  const siteUrl = (appPublicUrl && !appPublicUrl.startsWith('http://localhost'))
    ? appPublicUrl
    : (config.APP_PUBLIC_URL && !config.APP_PUBLIC_URL.startsWith('http://localhost') ? config.APP_PUBLIC_URL : 'https://app.corvfin.com.br');
  const currentYear = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f17; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f17; min-height: 100vh; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 540px; background-color: #131b2e; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header com Logo Oficial CorvFin -->
          <tr>
            <td style="padding: 28px 32px 22px 32px; text-align: center; border-bottom: 1px solid #1e293b; background: linear-gradient(180deg, #162036 0%, #131b2e 100%);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(siteUrl)}" target="_blank" style="display: inline-block; text-decoration: none;">
                      <img src="${escapeHtml(logoUrl)}" alt="CorvFin" width="200" height="55" style="display: block; width: 200px; height: 55px; max-width: 100%; border: 0; outline: none; text-decoration: none; margin: 0 auto; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;" />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 6px;">
                    <div style="font-size: 12px; color: #94a3b8; letter-spacing: 0.5px; text-transform: uppercase; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                      Inteligência para suas finanças
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 36px 32px;">
              <h1 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 700; color: #f8fafc; text-align: left;">
                ${escapeHtml(heading)}
              </h1>
              <div style="font-size: 15px; color: #cbd5e1; margin-bottom: 24px;">
                ${contentHtml}
              </div>
              ${footerNote ? `<div style="font-size: 12px; color: #64748b; border-top: 1px solid #1e293b; padding-top: 18px; margin-top: 24px;">${footerNote}</div>` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0d1322; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #1e293b;">
              &copy; ${currentYear} CorvFin. Todos os direitos reservados.<br>
              Este é um e-mail transacional automático de segurança. Não responda a esta mensagem.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Template para teste de configuração SMTP (Painel Administrativo)
 */
function getSmtpTestEmailTemplate({ adminName, recipientEmail, testDate = new Date(), appPublicUrl }) {
  const safeAdmin = escapeHtml(adminName || 'Administrador');
  const safeRecipient = escapeHtml(recipientEmail);
  const formattedDate = formatDateTimeForEmail(testDate);

  const subject = 'CorvFin — Teste de Configuração SMTP';

  const html = getBaseLayout({
    title: subject,
    heading: 'Conexão SMTP Estabelecida com Sucesso!',
    contentHtml: `
      <p style="margin: 0 0 16px 0;">Olá, <strong>${safeAdmin}</strong>!</p>
      <p style="margin: 0 0 20px 0;">Este é um e-mail de teste transacional gerado pelo painel administrativo para validar a conectividade e o envio seguro de mensagens do <strong>CorvFin</strong>.</p>
      <div style="background-color: #172033; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; margin: 24px 0; font-size: 13px; color: #94a3b8;">
        <div style="margin-bottom: 8px;"><strong style="color: #f8fafc;">Data do teste:</strong> ${formattedDate}</div>
        <div><strong style="color: #f8fafc;">Destinatário validado:</strong> ${safeRecipient}</div>
      </div>
      <p style="margin: 0; font-size: 13px; color: #10b981;">
        &#10003; A infraestrutura de envio está ativa, autenticada e operacional.
      </p>
    `,
    footerNote: 'Este é um teste transacional restrito a administradores do CorvFin.',
    appPublicUrl
  });

  const text = `Olá, ${adminName || 'Administrador'}!\n\nEste é um e-mail de teste transacional confirmando que a infraestrutura SMTP do CorvFin está operacional e devidamente autenticada.\n\nData do teste: ${formattedDate}\nDestinatário validado: ${recipientEmail}\n\nCorvFin — Inteligência para suas finanças.\nhttps://app.corvfin.com.br`;

  return { subject, html, text };
}

/**
 * Template para confirmação de e-mail (novas contas ou reenvio)
 */
function getVerificationEmailTemplate({ nome, verificationUrl, appPublicUrl }) {
  const safeName = escapeHtml(nome || 'Usuário');
  const safeUrl = escapeHtml(verificationUrl);

  const subject = 'Confirme seu endereço de e-mail — CorvFin';

  const html = getBaseLayout({
    title: subject,
    heading: `Olá, ${safeName}!`,
    contentHtml: `
      <p style="margin: 0 0 16px 0;">Obrigado por criar sua conta no <strong>CorvFin</strong>. Para garantir a segurança dos seus dados e ativar seu acesso completo, confirme seu endereço de e-mail clicando no botão abaixo:</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${safeUrl}" target="_blank" style="display: inline-block; background-color: #10b981; color: #ffffff; font-weight: 600; font-size: 15px; padding: 14px 28px; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
          Confirmar Meu E-mail
        </a>
      </div>
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #94a3b8;">Se o botão não funcionar, copie e cole o link a seguir no seu navegador:</p>
      <p style="margin: 0; word-break: break-all; font-size: 12px; color: #38bdf8;">${safeUrl}</p>
    `,
    footerNote: 'Este link é válido por <strong>24 horas</strong> e pode ser utilizado apenas uma vez. Se você não solicitou este cadastro, desconsidere esta mensagem.',
    appPublicUrl
  });

  const text = `Olá, ${nome || 'Usuário'}!\n\nObrigado por criar sua conta no CorvFin. Para confirmar seu endereço de e-mail e ativar seu acesso, utilize o link abaixo:\n\n${verificationUrl}\n\nEste link é válido por 24 horas e é de uso único.\nSe você não realizou este cadastro, desconsidere esta mensagem.\n\n--\nCorvFin — Inteligência para suas finanças\nhttps://app.corvfin.com.br`;

  return { subject, html, text };
}

/**
 * Template para redefinição de senha (esqueci minha senha)
 */
function getPasswordResetEmailTemplate({ nome, resetUrl, appPublicUrl }) {
  const safeName = escapeHtml(nome || 'Usuário');
  const safeUrl = escapeHtml(resetUrl);

  const subject = 'Redefinição de senha — CorvFin';

  const html = getBaseLayout({
    title: subject,
    heading: `Olá, ${safeName}`,
    contentHtml: `
      <p style="margin: 0 0 16px 0;">Recebemos uma solicitação para redefinir a senha da sua conta no <strong>CorvFin</strong>.</p>
      <p style="margin: 0 0 24px 0;">Para definir uma nova senha segura, clique no botão abaixo:</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${safeUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 600; font-size: 15px; padding: 14px 28px; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
          Redefinir Minha Senha
        </a>
      </div>
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #94a3b8;">Ou copie e cole o link a seguir no seu navegador:</p>
      <p style="margin: 0; word-break: break-all; font-size: 12px; color: #38bdf8;">${safeUrl}</p>
    `,
    footerNote: 'Este link expira em <strong>30 minutos</strong> e só pode ser utilizado uma única vez. Se você não solicitou a redefinição de senha, nenhuma ação é necessária e sua senha permanece segura.',
    appPublicUrl
  });

  const text = `Olá, ${nome || 'Usuário'}!\n\nRecebemos uma solicitação para redefinir a senha do seu acesso ao CorvFin.\nPara definir uma nova senha, utilize o link abaixo:\n\n${resetUrl}\n\nEste link expira em 30 minutos e é de uso único.\nSe você não solicitou esta redefinição, desconsidere esta mensagem. Sua senha atual permanece inalterada.\n\n--\nCorvFin — Inteligência para suas finanças\nhttps://app.corvfin.com.br`;

  return { subject, html, text };
}

/**
 * Template para notificação de senha alterada
 */
function getPasswordChangedEmailTemplate({ nome, changedAt = new Date(), appPublicUrl }) {
  const safeName = escapeHtml(nome || 'Usuário');
  const formattedDate = formatDateTimeForEmail(changedAt);

  const subject = 'Segurança: Sua senha foi alterada — CorvFin';

  const html = getBaseLayout({
    title: subject,
    heading: `Aviso de Segurança`,
    contentHtml: `
      <p style="margin: 0 0 16px 0;">Olá, <strong>${safeName}</strong>.</p>
      <div style="background-color: rgba(16, 185, 129, 0.1); border-left: 4px solid #10b981; padding: 14px 16px; border-radius: 4px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 14px; color: #e2e8f0;">
          A senha da sua conta CorvFin foi alterada com sucesso recentemente em <strong>${formattedDate}</strong>.
        </p>
      </div>
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #cbd5e1;">
        Todas as sessões ativas foram desconectadas para garantir a proteção dos seus dados. Você precisará fazer login com sua nova credencial.
      </p>
      <p style="margin: 0; font-size: 14px; color: #f87171;">
        <strong>Atenção:</strong> Se você <em>não</em> realizou esta alteração, entre em contato imediatamente com o administrador do sistema para proteger sua conta.
      </p>
    `,
    footerNote: 'Este é um aviso automático de segurança gerado sempre que suas credenciais de acesso são atualizadas.',
    appPublicUrl
  });

  const text = `Aviso de Segurança — CorvFin\n\nOlá, ${nome || 'Usuário'}.\n\nA senha da sua conta no CorvFin foi alterada com sucesso em ${formattedDate}.\nTodas as sessões ativas foram desconectadas e um novo login com sua nova senha será necessário.\n\nIMPORTANTE: Se você NÃO realizou esta alteração, entre em contato imediatamente com o administrador do sistema.\n\n--\nCorvFin — Inteligência para suas finanças\nhttps://app.corvfin.com.br`;

  return { subject, html, text };
}

module.exports = {
  getVerificationEmailTemplate,
  getPasswordResetEmailTemplate,
  getPasswordChangedEmailTemplate,
  getSmtpTestEmailTemplate,
  formatDateTimeForEmail,
  getPublicLogoUrl,
  getBaseLayout,
  DEFAULT_EMAIL_TIMEZONE
};
