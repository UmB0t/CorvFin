/**
 * CorvFin — Templates Transacionais de E-mail
 * Checkpoint Security 6B
 * 
 * Fornece templates HTML estilizados e versões em texto plano (fallback)
 * para os fluxos de confirmação de conta, recuperação e alteração de credencial.
 */

function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getBaseLayout({ title, heading, contentHtml, footerNote }) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f17; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b0f17; min-height: 100vh; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 540px; background-color: #131b2e; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #1e293b; background: linear-gradient(180deg, #162036 0%, #131b2e 100%);">
              <div style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff;">
                Corv<span style="color: #10b981;">Fin</span>
              </div>
              <div style="font-size: 12px; color: #94a3b8; margin-top: 4px; letter-spacing: 0.5px; text-transform: uppercase;">
                Inteligência para suas finanças
              </div>
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
              &copy; ${new Date().getFullYear()} CorvFin. Todos os direitos reservados.<br>
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
 * Template para confirmação de e-mail (novas contas ou reenvio)
 */
function getVerificationEmailTemplate({ nome, verificationUrl }) {
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
    footerNote: 'Este link é válido por <strong>24 horas</strong> e pode ser utilizado apenas uma vez. Se você não solicitou este cadastro, desconsidere esta mensagem.'
  });

  const text = `Olá, ${nome || 'Usuário'}!

Obrigado por criar sua conta no CorvFin. Para confirmar seu endereço de e-mail e ativar seu acesso, utilize o link abaixo:

${verificationUrl}

Este link é válido por 24 horas e é de uso único.
Se você não realizou este cadastro, desconsidere esta mensagem.

--
CorvFin — Inteligência para suas finanças
https://app.corvfin.com.br`;

  return { subject, html, text };
}

/**
 * Template para redefinição de senha (esqueci minha senha)
 */
function getPasswordResetEmailTemplate({ nome, resetUrl }) {
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
    footerNote: 'Este link expira em <strong>30 minutos</strong> e só pode ser utilizado uma única vez. Se você não solicitou a redefinição de senha, nenhuma ação é necessária e sua senha permanece segura.'
  });

  const text = `Olá, ${nome || 'Usuário'}!

Recebemos uma solicitação para redefinir a senha do seu acesso ao CorvFin.
Para definir uma nova senha, utilize o link abaixo:

${resetUrl}

Este link expira em 30 minutos e é de uso único.
Se você não solicitou esta redefinição, desconsidere esta mensagem. Sua senha atual permanece inalterada.

--
CorvFin — Inteligência para suas finanças
https://app.corvfin.com.br`;

  return { subject, html, text };
}

/**
 * Template para notificação de senha alterada
 */
function getPasswordChangedEmailTemplate({ nome }) {
  const safeName = escapeHtml(nome || 'Usuário');

  const subject = 'Segurança: Sua senha foi alterada — CorvFin';

  const html = getBaseLayout({
    title: subject,
    heading: `Aviso de Segurança`,
    contentHtml: `
      <p style="margin: 0 0 16px 0;">Olá, <strong>${safeName}</strong>.</p>
      <div style="background-color: rgba(16, 185, 129, 0.1); border-left: 4px solid #10b981; padding: 14px 16px; border-radius: 4px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 14px; color: #e2e8f0;">
          A senha da sua conta CorvFin foi alterada com sucesso recentemente.
        </p>
      </div>
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #cbd5e1;">
        Todas as sessões ativas foram desconectadas para garantir a proteção dos seus dados. Você precisará fazer login com sua nova credencial.
      </p>
      <p style="margin: 0; font-size: 14px; color: #f87171;">
        <strong>Atenção:</strong> Se você <em>não</em> realizou esta alteração, entre em contato imediatamente com o administrador do sistema para proteger sua conta.
      </p>
    `,
    footerNote: 'Este é um aviso automático de segurança gerado sempre que suas credenciais de acesso são atualizadas.'
  });

  const text = `Aviso de Segurança — CorvFin

Olá, ${nome || 'Usuário'}.

A senha da sua conta no CorvFin foi alterada com sucesso.
Todas as sessões ativas foram desconectadas e um novo login com sua nova senha será necessário.

IMPORTANTE: Se você NÃO realizou esta alteração, entre em contato imediatamente com o administrador do sistema.

--
CorvFin — Inteligência para suas finanças
https://app.corvfin.com.br`;

  return { subject, html, text };
}

module.exports = {
  getVerificationEmailTemplate,
  getPasswordResetEmailTemplate,
  getPasswordChangedEmailTemplate
};
