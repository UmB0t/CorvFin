/**
 * CorvFin - Suíte de Testes do Checkpoint Security 6A
 * Valida a infraestrutura de e-mail transacional, criptografia AES-256-GCM (64 hex),
 * abstração MailService, endpoints administrativos, RBAC, anti-CSRF, anti-SSRF,
 * invalidação de cache de transporter, rate limiting e sanitização de payload.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');

// Chave oficial de teste: exatamente 64 caracteres hexadecimais (256 bits gerados via openssl rand -hex 32)
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.MAIL_CONFIG_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
process.env.STORAGE_DRIVER = 'json';

const config = require('../server/config/config');
config.MAIL_CONFIG_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

const app = require('../server/server');
const cryptoService = require('../server/services/cryptoService');
const storageService = require('../server/services/storageService');
const mailService = require('../server/services/mailService');
const { generateToken } = require('../server/services/authService');

describe('Security 6A — Infraestrutura de E-mail Transacional & SMTP Nativo', () => {
  let server;
  let baseUrl;
  let adminToken;
  let userToken;
  let originalCreateTransport;
  let lastMockEmail = null;
  let mockTransportCalls = 0;

  // Preservação de arquivos em server/data para garantia de zero artefatos residuais
  const usersFilePath = path.join(__dirname, '..', 'server', 'data', 'users.json');
  const emailSettingsFilePath = config.EMAIL_SETTINGS_FILE;
  const defaultPermsFilePath = path.join(__dirname, '..', 'server', 'data', 'default_permissions.json');
  const permsFilePath = path.join(__dirname, '..', 'server', 'data', 'permissions.json');

  let originalUsersContent = null;
  let originalEmailSettingsContent = null;
  let hadDefaultPerms = false;
  let hadPerms = false;

  const testAdmin = {
    id: 'admin_sec6a_' + Date.now(),
    login: 'admin_sec6a',
    nome: 'Administrador Teste Sec6A',
    email: 'admin.sec6a@corvfin.com.br',
    is_admin: true,
    tokenVersion: 1
  };

  const testUser = {
    id: 'user_sec6a_' + Date.now(),
    login: 'user_sec6a',
    nome: 'Usuário Comum Sec6A',
    email: 'user.sec6a@corvfin.com.br',
    is_admin: false,
    tokenVersion: 1
  };

  before(async () => {
    // 1. Backup de arquivos pré-existentes em server/data
    if (fs.existsSync(usersFilePath)) {
      originalUsersContent = fs.readFileSync(usersFilePath, 'utf8');
    }
    if (fs.existsSync(emailSettingsFilePath)) {
      originalEmailSettingsContent = fs.readFileSync(emailSettingsFilePath, 'utf8');
    }
    hadDefaultPerms = fs.existsSync(defaultPermsFilePath);
    hadPerms = fs.existsSync(permsFilePath);

    // 2. Inicializa usuários de teste no driver json
    await storageService.saveUsers([testAdmin, testUser]);

    // 3. Emite tokens JWT legítimos
    adminToken = generateToken(testAdmin);
    userToken = generateToken(testUser);

    // 4. Stub do Nodemailer para isolamento total contra chamadas de rede externas
    originalCreateTransport = nodemailer.createTransport;
    nodemailer.createTransport = function (opts) {
      mockTransportCalls++;
      return {
        verify: async () => {
          if (opts && opts.auth && opts.auth.pass === 'invalid_password') {
            const err = new Error('Invalid login - 535 Authentication failed');
            err.code = 'EAUTH';
            throw err;
          }
          return true;
        },
        sendMail: async (mailOptions) => {
          lastMockEmail = mailOptions;
          return {
            messageId: '<mock-' + Date.now() + '@corvfin.com.br>',
            response: '250 OK'
          };
        },
        close: () => {}
      };
    };

    // 5. Inicia servidor Express em porta efêmera
    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Restaura o mock do nodemailer
    if (originalCreateTransport) {
      nodemailer.createTransport = originalCreateTransport;
    }

    // Fecha o servidor HTTP
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    // Restaura estado original de server/data com precisão cirúrgica (zero artefatos persistentes)
    try {
      if (originalUsersContent !== null) {
        fs.writeFileSync(usersFilePath, originalUsersContent, 'utf8');
      } else if (fs.existsSync(usersFilePath)) {
        fs.unlinkSync(usersFilePath);
      }

      if (originalEmailSettingsContent !== null) {
        fs.writeFileSync(emailSettingsFilePath, originalEmailSettingsContent, 'utf8');
      } else if (fs.existsSync(emailSettingsFilePath)) {
        fs.unlinkSync(emailSettingsFilePath);
      }

      if (!hadDefaultPerms && fs.existsSync(defaultPermsFilePath)) {
        fs.unlinkSync(defaultPermsFilePath);
      }

      if (!hadPerms && fs.existsSync(permsFilePath)) {
        fs.unlinkSync(permsFilePath);
      }
    } catch (_) {}
  });

  // ============================================================================
  // CRIPTOGRAFIA AUTENTICADA (AES-256-GCM COM 64 HEX)
  // ============================================================================

  test('1. CryptoService criptografa com AES-256-GCM gerando iv, tag e ciphertext', () => {
    const plain = 'MinhaSenhaSuperSecreta@Hostinger2026';
    const encrypted = cryptoService.encrypt(plain, TEST_ENCRYPTION_KEY);

    assert.ok(encrypted.iv, 'Deve conter IV');
    assert.ok(encrypted.tag, 'Deve conter Auth Tag');
    assert.ok(encrypted.ciphertext, 'Deve conter ciphertext');
    assert.strictEqual(typeof encrypted.iv, 'string');
    assert.strictEqual(typeof encrypted.tag, 'string');
    assert.strictEqual(typeof encrypted.ciphertext, 'string');
    assert.strictEqual(encrypted.ciphertext.includes(plain), false, 'Ciphertext não pode conter texto claro');
  });

  test('2. CryptoService descriptografa com sucesso usando a chave correta de 64 hex', () => {
    const plain = 'HostingerSmtpPassword#123';
    const encrypted = cryptoService.encrypt(plain, TEST_ENCRYPTION_KEY);
    const recovered = cryptoService.decrypt(encrypted, TEST_ENCRYPTION_KEY);

    assert.strictEqual(recovered, plain, 'Texto descriptografado deve ser idêntico ao original');
  });

  test('3. CryptoService falha de forma segura com chave incorreta ou tag adulterada (Auth Tag)', () => {
    const plain = 'SegredoConfidencial';
    const encrypted = cryptoService.encrypt(plain, TEST_ENCRYPTION_KEY);

    // Chave diferente de 64 hex
    const anotherKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    assert.throws(
      () => cryptoService.decrypt(encrypted, anotherKey),
      /Falha na autenticação da credencial SMTP/
    );

    // Tag adulterada
    const tampered = { ...encrypted, tag: '00112233445566778899aabbccddeeff' };
    assert.throws(
      () => cryptoService.decrypt(tampered, TEST_ENCRYPTION_KEY),
      /Falha na autenticação da credencial SMTP/
    );
  });

  test('4. Ausência de MAIL_CONFIG_ENCRYPTION_KEY falha de forma segura em operação criptográfica', () => {
    assert.throws(
      () => cryptoService.resolveKeyBuffer(''),
      /MAIL_CONFIG_ENCRYPTION_KEY não configurada/
    );
    assert.throws(
      () => cryptoService.encrypt('texto', ''),
      /MAIL_CONFIG_ENCRYPTION_KEY não configurada/
    );
    assert.throws(
      () => cryptoService.decrypt({ iv: '00', tag: '00', ciphertext: '00' }, ''),
      /MAIL_CONFIG_ENCRYPTION_KEY não configurada/
    );
    assert.strictEqual(cryptoService.isEncryptionConfigured(''), false);
  });

  test('5. Chave fora do formato oficial de 64 hex é rejeitada fail-closed', () => {
    // 32 caracteres comuns (não-hex 64)
    assert.throws(
      () => cryptoService.resolveKeyBuffer('minha_chave_32_caracteres_mas_nao_hex!'),
      /formato oficial exige exatamente 64 caracteres hexadecimais/
    );

    // 63 hex (incompleta)
    assert.throws(
      () => cryptoService.resolveKeyBuffer('a'.repeat(63)),
      /formato oficial exige exatamente 64 caracteres hexadecimais/
    );

    // 65 hex (excessiva)
    assert.throws(
      () => cryptoService.resolveKeyBuffer('a'.repeat(65)),
      /formato oficial exige exatamente 64 caracteres hexadecimais/
    );

    // 64 caracteres contendo letras não-hexadecimais
    assert.throws(
      () => cryptoService.resolveKeyBuffer('z'.repeat(64)),
      /formato oficial exige exatamente 64 caracteres hexadecimais/
    );

    assert.strictEqual(cryptoService.isEncryptionConfigured('chave_invalida'), false);

    // Chave válida de 64 hex
    const validBuf = cryptoService.resolveKeyBuffer(TEST_ENCRYPTION_KEY);
    assert.strictEqual(Buffer.isBuffer(validBuf), true);
    assert.strictEqual(validBuf.length, 32, 'Deve ter exatamente 32 bytes (256 bits)');
  });

  // ============================================================================
  // RBAC & SEGURANÇA DAS ROTAS ADMINISTRATIVAS
  // ============================================================================

  test('6. GET /api/admin/email-settings sem autenticação retorna 401', async () => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings`);
    assert.strictEqual(res.status, 401, 'Deve exigir autenticação');
  });

  test('7. GET /api/admin/email-settings com usuário comum retorna 403', async () => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    assert.strictEqual(res.status, 403, 'Usuário comum deve receber 403 Forbidden');
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('Apenas administradores'));
  });

  test('8. passwordConfigured é false sem credencial e GET nunca expõe encryptedPassword', async () => {
    // Garante que o arquivo de settings comece limpo sem senha
    await storageService.saveEmailSettings({
      enabled: false,
      host: '',
      port: 465,
      secure: true,
      username: '',
      encryptedPassword: null,
      fromName: 'CorvFin',
      fromEmail: 'noreply@corvfin.com.br'
    });

    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.settings, 'Deve retornar objeto settings');

    // Validações contratuais obrigatórias
    assert.strictEqual(data.settings.passwordConfigured, false, 'passwordConfigured deve ser false quando não há senha');
    assert.strictEqual(data.settings.password, undefined, 'GET nunca deve retornar campo password');
    assert.strictEqual(data.settings.encryptedPassword, undefined, 'GET nunca deve retornar encryptedPassword');
    assert.strictEqual('encryptedPassword' in data.settings, false, 'Chave encryptedPassword não deve constar no objeto');
    assert.strictEqual('password' in data.settings, false, 'Chave password não deve constar no objeto');
  });

  // ============================================================================
  // VALIDAÇÕES DE PAYLOAD & ANTI-SSRF
  // ============================================================================

  test('9. PUT /api/admin/email-settings rejeita host com esquema de protocolo (SSRF)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        enabled: true,
        host: 'https://smtp.hostinger.com',
        port: 465,
        secure: true,
        username: 'no-reply@corvfin.com.br',
        fromName: 'CorvFin',
        fromEmail: 'no-reply@corvfin.com.br'
      })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('Host SMTP inválido'));
  });

  test('10. PUT /api/admin/email-settings rejeita porta fora da faixa 1..65535', async () => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        enabled: true,
        host: 'smtp.hostinger.com',
        port: 70000,
        secure: true,
        username: 'no-reply@corvfin.com.br',
        fromName: 'CorvFin',
        fromEmail: 'no-reply@corvfin.com.br'
      })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.message.includes('port'));
  });

  test('11. PUT /api/admin/email-settings rejeita fromEmail com formato inválido', async () => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        enabled: true,
        host: 'smtp.hostinger.com',
        port: 465,
        secure: true,
        username: 'no-reply@corvfin.com.br',
        fromName: 'CorvFin',
        fromEmail: 'email-invalido-sem-arroba'
      })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.message.includes('E-mail do remetente inválido'));
  });

  // ============================================================================
  // PERSISTÊNCIA, PASSWORD CONFIGURED TRUE & CAMPOS INESPERADOS
  // ============================================================================

  test('12. PUT com senha criptografa, ativa passwordConfigured true e nunca expõe segredos no GET', async () => {
    const testPass = 'SegredoSMTP@2026';

    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        enabled: true,
        host: 'smtp.hostinger.com',
        port: 465,
        secure: true,
        username: 'no-reply@corvfin.com.br',
        password: testPass,
        fromName: 'CorvFin',
        fromEmail: 'no-reply@corvfin.com.br'
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.settings.passwordConfigured, true, 'passwordConfigured deve ser true com credencial salva');
    assert.strictEqual(data.settings.password, undefined);
    assert.strictEqual(data.settings.encryptedPassword, undefined);

    // Consulta subsequente via GET
    const getRes = await fetch(`${baseUrl}/api/admin/email-settings`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.settings.passwordConfigured, true);
    assert.strictEqual(getData.settings.password, undefined);
    assert.strictEqual(getData.settings.encryptedPassword, undefined);
    assert.strictEqual('encryptedPassword' in getData.settings, false);

    // Inspeciona diretamente a camada de storage para validar criptografia
    const persisted = await storageService.getEmailSettings();
    assert.ok(persisted.encryptedPassword, 'Deve possuir encryptedPassword no storage');
    assert.strictEqual(typeof persisted.encryptedPassword.ciphertext, 'string');
    assert.strictEqual(persisted.password, undefined, 'Storage não pode conter campo password em plaintext');

    // Valida que a senha descriptografada corresponde à original
    const recovered = cryptoService.decrypt(persisted.encryptedPassword, TEST_ENCRYPTION_KEY);
    assert.strictEqual(recovered, testPass);
  });

  test('13. PUT subsequente sem campo password preserva a credencial criptografada existente', async () => {
    const beforeUpdate = await storageService.getEmailSettings();
    assert.ok(beforeUpdate.encryptedPassword);

    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        enabled: true,
        host: 'smtp.hostinger.com',
        port: 465,
        secure: true,
        username: 'no-reply@corvfin.com.br',
        fromName: 'CorvFin Oficial',
        fromEmail: 'no-reply@corvfin.com.br'
        // password omitido
      })
    });

    assert.strictEqual(res.status, 200);
    const afterUpdate = await storageService.getEmailSettings();
    assert.strictEqual(afterUpdate.fromName, 'CorvFin Oficial');
    assert.deepStrictEqual(afterUpdate.encryptedPassword, beforeUpdate.encryptedPassword, 'Credencial deve ser preservada');
  });

  test('14. Payload com campos inesperados é higienizado e não corrompe documento', async () => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        enabled: true,
        host: 'smtp.hostinger.com',
        port: 465,
        secure: true,
        username: 'no-reply@corvfin.com.br',
        fromName: 'CorvFin',
        fromEmail: 'no-reply@corvfin.com.br',
        // Campos inesperados
        maliciousField: 'exploit_value',
        injectedRole: 'superadmin',
        extraMetadata: { deep: true }
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.settings.maliciousField, undefined);
    assert.strictEqual(data.settings.injectedRole, undefined);

    const persisted = await storageService.getEmailSettings();
    assert.strictEqual(persisted.maliciousField, undefined, 'Campos inesperados não podem ser persistidos');
    assert.strictEqual(persisted.injectedRole, undefined, 'Campos inesperados não podem ser persistidos');
  });

  // ============================================================================
  // INVALIDAÇÃO DE TRANSPORTER/CACHE EM MEMÓRIA
  // ============================================================================

  test('15. Alteração de configuração invalida o transporter/cache existente', async () => {
    // Inicializa conexão para popular cache
    await mailService.verifyConnection();
    assert.strictEqual(mailService.hasCachedTransporter(), true, 'Cache deve estar preenchido');

    // Executa PUT alterando porta
    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        enabled: true,
        host: 'smtp.hostinger.com',
        port: 587,
        secure: false,
        username: 'no-reply@corvfin.com.br',
        fromName: 'CorvFin',
        fromEmail: 'no-reply@corvfin.com.br'
      })
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(mailService.hasCachedTransporter(), false, 'Transporter em cache deve ter sido invalidado');
  });

  test('16. Alteração de senha invalida o transporter/cache existente', async () => {
    // Restaura e popula cache
    await mailService.verifyConnection();
    assert.strictEqual(mailService.hasCachedTransporter(), true, 'Cache deve estar preenchido');

    // Executa PUT alterando senha
    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        enabled: true,
        host: 'smtp.hostinger.com',
        port: 465,
        secure: true,
        username: 'no-reply@corvfin.com.br',
        password: 'NovaSenhaConfigurada@2026',
        fromName: 'CorvFin',
        fromEmail: 'no-reply@corvfin.com.br'
      })
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(mailService.hasCachedTransporter(), false, 'Transporter em cache deve ter sido invalidado na troca de senha');
  });

  // ============================================================================
  // TESTES DE CONEXÃO & ENVIO CONTROLADO
  // ============================================================================

  test('17. POST /api/admin/email-settings/test com action verify testa com sucesso', async () => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ action: 'verify' })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.message.includes('sucesso'));
  });

  test('18. POST /api/admin/email-settings/test com action send envia estritamente para o admin', async () => {
    lastMockEmail = null;

    const res = await fetch(`${baseUrl}/api/admin/email-settings/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ action: 'send' })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.message.includes(testAdmin.email));
    assert.ok(lastMockEmail, 'E-mail mock deve ter sido capturado');
    assert.strictEqual(lastMockEmail.to, testAdmin.email, 'Destinatário deve ser estritamente o e-mail do admin logado');
    assert.ok(lastMockEmail.subject.includes('CorvFin'));
  });

  test('19. POST /api/admin/email-settings/test exige privilégio ADMIN', async () => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ action: 'verify' })
    });

    assert.strictEqual(res.status, 403, 'Usuário comum deve ser rejeitado');
  });

  test('20. enabled=false impede envio sem tentativa de conexão SMTP', async () => {
    // Desativa serviço
    await storageService.saveEmailSettings({ enabled: false });
    mailService.invalidateTransporter();

    const previousCalls = mockTransportCalls;

    // Tentativa direta via MailService
    await assert.rejects(
      async () => {
        await mailService.sendMail({
          to: 'alguem@corvfin.com.br',
          subject: 'Teste',
          text: 'Mensagem'
        });
      },
      /Serviço de e-mail está desativado nas configurações do sistema/
    );

    // Tentativa via endpoint de teste
    const res = await fetch(`${baseUrl}/api/admin/email-settings/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ action: 'send' })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('desativado'));

    // Assegura que createTransport não foi chamado durante as tentativas com enabled=false
    assert.strictEqual(mockTransportCalls, previousCalls, 'createTransport NÃO deve ser acionado quando enabled=false');

    // Reativa serviço
    await storageService.saveEmailSettings({ enabled: true });
    mailService.invalidateTransporter();
  });

  test('21. Sanitização de erros SMTP impede vazamento de senhas em falhas de autenticação', () => {
    const authErr = new Error('Invalid login user=foo password=super_secret_password_123');
    authErr.code = 'EAUTH';

    const normalized = mailService.normalizeMailError(authErr);
    assert.strictEqual(normalized.message.includes('super_secret_password_123'), false, 'Não pode conter senha no erro normalizado');
    assert.strictEqual(normalized.message.includes('Falha na autenticação SMTP'), true);
  });

  // ============================================================================
  // RATE LIMITING CONTRATUAL DO ENDPOINT /test (5 tentativas / 15 minutos / IP)
  // ============================================================================

  test('22. Rate limit do endpoint /test realmente retorna 429 após exceder o limite contratual', async () => {
    // O rate limit configurado é de 5 tentativas por janela.
    // Executa requisições até esgotar a cota e confirma que a seguinte retorna 429.
    let hit429 = false;
    let rateLimitResponse = null;

    for (let i = 0; i < 7; i++) {
      const res = await fetch(`${baseUrl}/api/admin/email-settings/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ action: 'verify' })
      });

      if (res.status === 429) {
        hit429 = true;
        rateLimitResponse = await res.json();
        break;
      }
    }

    assert.strictEqual(hit429, true, 'Deve atingir HTTP 429 após exceder a cota máxima permitida');
    assert.strictEqual(rateLimitResponse.success, false);
    assert.strictEqual(rateLimitResponse.error, 'TOO_MANY_REQUESTS');
    assert.ok(rateLimitResponse.message.includes('15 minutos') || rateLimitResponse.message.includes('tentativas'));
  });
});
