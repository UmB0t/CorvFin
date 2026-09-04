/**
 * CorvFin — Suíte de Testes de Autenticação e Ciclo de Conta (Security 6B)
 * Executa contra a API Express, storageService (MongoDB HML e JSON) e mock do MailService.
 */

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../server/config/config');
const app = require('../server/server');
const storageService = require('../server/services/storageService');
const { connectDB, getDB, closeDB } = require('../server/config/db');
const {
  validatePasswordPolicy,
  generateSecurityToken,
  hashSecurityToken,
  hashPassword,
  comparePassword
} = require('../server/services/authService');
const mailService = require('../server/services/mailService');

describe('Security 6B — Ciclo de Conta, Confirmação de E-mail & Reset de Senha', () => {
  let server;
  let baseUrl;
  let sentEmails = [];
  let originalSendMail;

  const testSuffix = 's6b_' + Date.now();
  const createdUserIds = [];

  before(async () => {
    // Conecta ao banco de homologação se driver for MongoDB
    if (config.STORAGE_DRIVER === 'mongodb') {
      await connectDB();
    }

    // Intercepta e mocka o transporte de e-mail do MailService
    originalSendMail = mailService.sendMail;
    mailService.sendMail = async (mailOptions) => {
      sentEmails.push({ ...mailOptions, sentAt: new Date() });
      return { success: true, messageId: `mock_s6b_${Date.now()}` };
    };

    // Inicia servidor em porta efêmera
    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Restaura o transporte original do MailService
    if (originalSendMail) {
      mailService.sendMail = originalSendMail;
    }

    // Cleanup de usuários e security_tokens criados
    try {
      if (config.STORAGE_DRIVER === 'mongodb') {
        const db = getDB();
        for (const uid of createdUserIds) {
          await db.collection('users').deleteOne({ $or: [{ _id: uid }, { id: uid }] });
          await db.collection('permissions').deleteOne({ $or: [{ _id: uid }, { userId: uid }] });
          await db.collection('finances').deleteOne({ $or: [{ _id: uid }, { userId: uid }] });
          await db.collection('security_tokens').deleteMany({ userId: uid });
        }
      }
    } catch (e) {
      console.warn('Erro no cleanup do Security 6B:', e.message);
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (config.STORAGE_DRIVER === 'mongodb') {
      await closeDB();
    }
  });

  beforeEach(() => {
    sentEmails = [];
  });

  /* ========================================================================
     1. POLÍTICA CENTRALIZADA DE SENHA (8 a 128 caracteres)
     ======================================================================== */
  describe('1. Política Centralizada de Senha', () => {
    test('1.1 Senha válida com complexidade atende à política', () => {
      const res = validatePasswordPolicy('CorvFin@2026!');
      assert.strictEqual(res.valid, true);
    });

    test('1.2 Senha com menos de 8 caracteres é rejeitada', () => {
      const res = validatePasswordPolicy('Ab1!xyz');
      assert.strictEqual(res.valid, false);
      assert.ok(res.message.includes('mínimo 8 caracteres'));
    });

    test('1.3 Senha com mais de 128 caracteres é rejeitada por limite defensivo', () => {
      const longPass = 'A1!' + 'a'.repeat(130);
      const res = validatePasswordPolicy(longPass);
      assert.strictEqual(res.valid, false);
      assert.ok(res.message.includes('128 caracteres'));
    });

    test('1.4 Senha sem maiúscula é rejeitada', () => {
      const res = validatePasswordPolicy('corvfin@2026!');
      assert.strictEqual(res.valid, false);
      assert.ok(res.message.includes('maiúscula'));
    });

    test('1.5 Senha sem minúscula é rejeitada', () => {
      const res = validatePasswordPolicy('CORVFIN@2026!');
      assert.strictEqual(res.valid, false);
      assert.ok(res.message.includes('minúscula'));
    });

    test('1.6 Senha sem número é rejeitada', () => {
      const res = validatePasswordPolicy('CorvFin@Special!');
      assert.strictEqual(res.valid, false);
      assert.ok(res.message.includes('número'));
    });

    test('1.7 Senha sem caractere especial é rejeitada', () => {
      const res = validatePasswordPolicy('CorvFin2026Pass');
      assert.strictEqual(res.valid, false);
      assert.ok(res.message.includes('caractere especial'));
    });
  });

  /* ========================================================================
     2. GERAÇÃO E PERSISTÊNCIA DE TOKENS DE SEGURANÇA
     ======================================================================== */
  describe('2. Entropia e Hashing de Tokens de Segurança', () => {
    test('2.1 Token gerado possui 256 bits de entropia (64 hex)', () => {
      const token1 = generateSecurityToken();
      const token2 = generateSecurityToken();
      assert.strictEqual(token1.length, 64);
      assert.strictEqual(token2.length, 64);
      assert.notStrictEqual(token1, token2);
      assert.ok(/^[0-9a-f]{64}$/.test(token1));
    });

    test('2.2 Hash SHA-256 do token é determinístico e raw token não é salvo', async () => {
      const rawToken = generateSecurityToken();
      const hash1 = hashSecurityToken(rawToken);
      const hash2 = hashSecurityToken(rawToken);
      assert.strictEqual(hash1, hash2);
      assert.strictEqual(hash1.length, 64);

      const savedToken = await storageService.createSecurityToken({
        userId: 'test_usr_entropy',
        type: 'email_verification',
        tokenHash: hash1,
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      });

      assert.strictEqual(savedToken.tokenHash, hash1);
      assert.strictEqual(savedToken.rawToken, undefined, 'Raw token nunca deve existir no objeto salvo');
    });
  });

  /* ========================================================================
     3. CADASTRO DE NOVA CONTA, CONFIRMAÇÃO E BLOQUEIO DE NÃO CONFIRMADO
     ======================================================================== */
  describe('3. Cadastro Público, Confirmação de E-mail e Bloqueio de Acesso', () => {
    const regLogin = `user_unver_${testSuffix}`;
    const regEmail = `${regLogin}@corvfin.test`;
    const regPassword = 'Password@2026!';
    let registeredUserId;
    let extractedVerificationToken;

    test('3.1 POST /api/auth/register cria conta com emailVerified: false e sem sessão imediata', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: 'Usuário Não Verificado',
          login: regLogin,
          email: regEmail,
          senha: regPassword
        })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 201);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.requiresVerification, true);
      assert.ok(data.message.includes('Confirme seu endereço'));
      assert.strictEqual(data.user.emailVerified, false);

      registeredUserId = data.user.id;
      createdUserIds.push(registeredUserId);

      // Garante que NENHUM cookie de sessão foi emitido no cadastro
      const setCookie = res.headers.get('set-cookie') || '';
      assert.strictEqual(setCookie.includes('omnifin_session='), false, 'Não deve emitir cookie de sessão para conta não verificada');

      // Verifica se o e-mail de confirmação foi despachado via mock
      assert.strictEqual(sentEmails.length, 1);
      assert.strictEqual(sentEmails[0].to, regEmail);
      assert.ok(sentEmails[0].subject.includes('Confirme seu endereço'));

      // Extrai o token do link gerado no e-mail
      const match = (sentEmails[0].text || '').match(/token=([a-f0-9]+)/);
      assert.ok(match && match[1], 'Deve conter token de verificação no link');
      extractedVerificationToken = match[1];
    });

    test('3.2 POST /api/auth/login recusa conta com emailVerified: false retornando 403', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: regLogin, senha: regPassword })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 403);
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.code, 'EMAIL_NOT_VERIFIED');
      assert.ok(data.message.includes('confirme seu endereço de e-mail'));
    });

    test('3.3 POST /api/auth/verify-email com token inválido retorna 400', async () => {
      const res = await fetch(`${baseUrl}/api/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid_token_1234567890' })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert.strictEqual(data.success, false);
    });

    test('3.4 POST /api/auth/verify-email com token válido confirma e-mail', async () => {
      const res = await fetch(`${baseUrl}/api/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: extractedVerificationToken })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(data.message.includes('E-mail confirmado com sucesso'));

      // Verifica status do usuário no banco
      const userInDb = await storageService.getUserById(registeredUserId);
      assert.strictEqual(userInDb.emailVerified, true);
      assert.ok(userInDb.emailVerifiedAt);
    });

    test('3.5 POST /api/auth/verify-email é single-use: segunda chamada falha com 400', async () => {
      const res = await fetch(`${baseUrl}/api/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: extractedVerificationToken })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert.strictEqual(data.success, false);
    });

    test('3.6 Concorrência no verify-email: duas chamadas simultâneas permitem apenas um sucesso', async () => {
      // Cria usuário com token novo para teste de concorrência
      const concUser = {
        id: `usr_conc_${Date.now()}`,
        nome: 'Concorrência Teste',
        login: `conc_${Date.now()}`,
        email: `conc_${Date.now()}@corvfin.test`,
        senha: await hashPassword('Password@2026!'),
        emailVerified: false,
        emailVerifiedAt: null,
        tokenVersion: 0
      };
      createdUserIds.push(concUser.id);
      const allUsers = await storageService.getUsers();
      allUsers.push(concUser);
      await storageService.saveUsers(allUsers);

      const rawConcToken = generateSecurityToken();
      const tokenHash = hashSecurityToken(rawConcToken);
      await storageService.createSecurityToken({
        userId: concUser.id,
        type: 'email_verification',
        tokenHash,
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      });

      // Dispara 2 chamadas simultâneas com o mesmo token
      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/api/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: rawConcToken })
        }),
        fetch(`${baseUrl}/api/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: rawConcToken })
        })
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert.deepStrictEqual(statuses, [200, 400], 'Exatamente uma chamada deve ter status 200 e a outra 400');
    });

    test('3.7 Após confirmação, login do usuário funciona normalmente com 200 e cookie HttpOnly', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: regLogin, senha: regPassword })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.user.emailVerified, true);
      const setCookie = res.headers.get('set-cookie') || '';
      assert.ok(setCookie.includes('omnifin_session='));
    });

    test('3.8 Rollback de token quando update do usuário falha (retorna de claiming para active)', async () => {
      const orphanToken = generateSecurityToken();
      const orphanHash = hashSecurityToken(orphanToken);
      const orphanUserId = `usr_nonexistent_${Date.now()}`;
      await storageService.createSecurityToken({
        userId: orphanUserId,
        type: 'email_verification',
        tokenHash: orphanHash,
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      });

      const res = await storageService.verifyEmailWithToken(orphanHash);
      assert.strictEqual(res.success, false);

      let tokenAfter;
      if (config.STORAGE_DRIVER === 'mongodb') {
        const db = getDB();
        tokenAfter = await db.collection('security_tokens').findOne({ tokenHash: orphanHash });
      } else {
        const jsonStorage = require('../server/services/jsonStorage');
        tokenAfter = jsonStorage.getSecurityTokens().find(t => t.tokenHash === orphanHash);
      }

      assert.ok(tokenAfter, 'Token deve existir no banco');
      assert.strictEqual(tokenAfter.status, 'active', 'Token deve sofrer rollback para active');
      assert.strictEqual(tokenAfter.claimedAt, null, 'claimedAt deve ser resetado para null');
    });

    test('3.9 Token não volta para active se finalização falhar após confirmação do usuário (fail-safe)', async () => {
      const failSafeUser = {
        id: `usr_failsafe_${Date.now()}`,
        nome: 'Failsafe Teste',
        login: `fs_${Date.now()}`,
        email: `fs_${Date.now()}@corvfin.test`,
        senha: await hashPassword('Password@2026!'),
        emailVerified: false,
        emailVerifiedAt: null,
        tokenVersion: 0
      };
      createdUserIds.push(failSafeUser.id);
      const allUsers = await storageService.getUsers();
      allUsers.push(failSafeUser);
      await storageService.saveUsers(allUsers);

      const rawFsToken = generateSecurityToken();
      const fsTokenHash = hashSecurityToken(rawFsToken);
      await storageService.createSecurityToken({
        userId: failSafeUser.id,
        type: 'email_verification',
        tokenHash: fsTokenHash,
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      });

      if (config.STORAGE_DRIVER === 'mongodb') {
        const db = getDB();
        const origCollection = db.collection.bind(db);
        let intercepted = false;
        db.collection = function (name, options) {
          const col = origCollection(name, options);
          if (name === 'security_tokens') {
            const origUpdateOne = col.updateOne.bind(col);
            col.updateOne = async function (filter, update, opts) {
              if (update && update.$set && update.$set.status === 'used') {
                intercepted = true;
                throw new Error('Simulated DB failure during token finalization');
              }
              return origUpdateOne(filter, update, opts);
            };
          }
          return col;
        };

        try {
          const res = await storageService.verifyEmailWithToken(fsTokenHash);
          assert.strictEqual(res.success, true, 'Confirmação deve continuar sendo considerada concluída');
          assert.strictEqual(intercepted, true, 'Finalização deve ter sido interceptada com falha simulada');

          // Verifica que o usuário FOI confirmado
          const updatedUser = await storageService.getUserById(failSafeUser.id);
          assert.strictEqual(updatedUser.emailVerified, true);

          // Verifica que o token NÃO voltou para active, permaneceu claiming
          const tokenDoc = await origCollection('security_tokens').findOne({ tokenHash: fsTokenHash });
          assert.strictEqual(tokenDoc.status, 'claiming', 'Token não deve voltar para active após confirmação do usuário');

          // Tenta reutilizar o token -> deve falhar porque status !== active
          const secondAttempt = await storageService.verifyEmailWithToken(fsTokenHash);
          assert.strictEqual(secondAttempt.success, false, 'Futuras tentativas não devem passar pelo filtro status: active');
        } finally {
          db.collection = origCollection;
        }
      } else {
        const res = await storageService.verifyEmailWithToken(fsTokenHash);
        assert.strictEqual(res.success, true);
        const jsonStorage = require('../server/services/jsonStorage');
        const tokenDoc = jsonStorage.getSecurityTokens().find(t => t.tokenHash === fsTokenHash);
        assert.notStrictEqual(tokenDoc.status, 'active', 'Token não volta para active após confirmação');
      }
    });
  });

  /* ========================================================================
     4. REENVIO DE CONFIRMAÇÃO & ANTI-ENUMERAÇÃO
     ======================================================================== */
  describe('4. Reenvio de Confirmação e Anti-Enumeração', () => {
    test('4.1 Resposta é neutra para e-mail existente não verificado', async () => {
      const unvLogin = `unv_resend_${Date.now()}`;
      const unvEmail = `${unvLogin}@corvfin.test`;
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: 'Reenvio Teste',
          login: unvLogin,
          email: unvEmail,
          senha: 'Password@2026!'
        })
      });
      const regData = await regRes.json();
      createdUserIds.push(regData.user.id);

      sentEmails = []; // Limpa envio inicial do cadastro

      const res = await fetch(`${baseUrl}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: unvEmail })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(data.message.includes('Se houver uma conta elegível'));
      assert.strictEqual(sentEmails.length, 1);
      assert.strictEqual(sentEmails[0].to, unvEmail);
    });

    test('4.2 Resposta é idêntica/neutra para e-mail inexistente (anti-enumeração)', async () => {
      sentEmails = [];
      const res = await fetch(`${baseUrl}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'inexistente_123456@corvfin.test' })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(data.message.includes('Se houver uma conta elegível'));
      assert.strictEqual(sentEmails.length, 0, 'Nenhum e-mail deve ser enviado para e-mail inexistente');
    });

    test('4.3 Resposta é idêntica/neutra para e-mail já confirmado (sem novo envio)', async () => {
      sentEmails = [];
      // Cria usuário já verificado
      const verifiedUser = {
        id: `usr_ver_${Date.now()}`,
        nome: 'Usuário Verificado',
        login: `ver_${Date.now()}`,
        email: `ver_${Date.now()}@corvfin.test`,
        senha: await hashPassword('Password@2026!'),
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        tokenVersion: 0
      };
      createdUserIds.push(verifiedUser.id);
      const users = await storageService.getUsers();
      users.push(verifiedUser);
      await storageService.saveUsers(users);

      const res = await fetch(`${baseUrl}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifiedUser.email })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(data.message.includes('Se houver uma conta elegível'));
      assert.strictEqual(sentEmails.length, 0, 'Não deve reenviar se o e-mail já está confirmado');
    });
  });

  /* ========================================================================
     5. ESQUECI MINHA SENHA (FORGOT PASSWORD)
     ======================================================================== */
  describe('5. Esqueci Minha Senha (Anti-Enumeração & Geração de Token)', () => {
    let testUserEmail;
    let testUserIdForReset;

    before(async () => {
      const user = {
        id: `usr_forgot_${Date.now()}`,
        nome: 'Usuário Forgot',
        login: `forgot_${Date.now()}`,
        email: `forgot_${Date.now()}@corvfin.test`,
        senha: await hashPassword('Password@2026!'),
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        tokenVersion: 0
      };
      testUserIdForReset = user.id;
      testUserEmail = user.email;
      createdUserIds.push(user.id);
      const users = await storageService.getUsers();
      users.push(user);
      await storageService.saveUsers(users);
    });

    test('5.1 Resposta neutra para e-mail existente (HTTP 200)', async () => {
      sentEmails = [];
      const res = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUserEmail })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(data.message.includes('Se existir uma conta'));
      assert.strictEqual(sentEmails.length, 1);
      assert.strictEqual(sentEmails[0].to, testUserEmail);
      assert.ok(sentEmails[0].subject.includes('Redefinição de senha'));
    });

    test('5.2 Resposta idêntica/neutra para e-mail inexistente (HTTP 200)', async () => {
      sentEmails = [];
      const res = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent@corvfin.test' })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(data.message.includes('Se existir uma conta'));
      assert.strictEqual(sentEmails.length, 0);
    });

    test('5.3 Novo token de reset invalida o anterior', async () => {
      sentEmails = [];
      // Primeira solicitação
      await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUserEmail })
      });
      const firstTokenMatch = (sentEmails[0].text || '').match(/token=([a-f0-9]+)/);
      const firstToken = firstTokenMatch[1];

      // Segunda solicitação
      await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUserEmail })
      });
      const secondTokenMatch = (sentEmails[1].text || '').match(/token=([a-f0-9]+)/);
      const secondToken = secondTokenMatch[1];

      assert.notStrictEqual(firstToken, secondToken);

      // O primeiro token deve ser rejeitado no reset porque foi invalidado
      const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: firstToken, newPassword: 'NewPassword@999!' })
      });
      assert.strictEqual(resetRes.status, 400);

      // O segundo token deve funcionar
      const validResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: secondToken, newPassword: 'NewPassword@999!' })
      });
      assert.strictEqual(validResetRes.status, 200);
    });

    test('5.4 Token de password_reset é emitido com TTL de exatamente 30 minutos (1.800.000 ms)', async () => {
      sentEmails = [];
      const beforeReq = Date.now();
      const res = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testUserEmail })
      });
      const afterReq = Date.now();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(sentEmails.length, 1);

      const tokenMatch = (sentEmails[0].text || '').match(/token=([a-f0-9]+)/);
      assert.ok(tokenMatch, 'E-mail deve conter o token de reset');
      const rawToken = tokenMatch[1];
      const tokenHash = hashSecurityToken(rawToken);

      let tokenDoc;
      if (config.STORAGE_DRIVER === 'mongodb') {
        const db = getDB();
        tokenDoc = await db.collection('security_tokens').findOne({ tokenHash });
      } else {
        const jsonStorage = require('../server/services/jsonStorage');
        tokenDoc = jsonStorage.getSecurityTokens().find(t => t.tokenHash === tokenHash);
      }

      assert.ok(tokenDoc, 'Token deve existir no storage');
      assert.strictEqual(tokenDoc.type, 'password_reset');
      assert.strictEqual(tokenDoc.status, 'active');

      const expiresAtMs = new Date(tokenDoc.expiresAt).getTime();
      const expectedTtlMs = 30 * 60 * 1000; // 1.800.000 ms (30 minutos)

      // Margem de tolerância de 5 segundos
      assert.ok(
        expiresAtMs >= beforeReq + expectedTtlMs - 5000,
        `expiresAt (${tokenDoc.expiresAt}) deve ser >= ${new Date(beforeReq + expectedTtlMs - 5000).toISOString()}`
      );
      assert.ok(
        expiresAtMs <= afterReq + expectedTtlMs + 5000,
        `expiresAt (${tokenDoc.expiresAt}) deve ser <= ${new Date(afterReq + expectedTtlMs + 5000).toISOString()}`
      );

      // Validação explícita: TTL NÃO pode ser de 1 hora (3.600.000 ms)
      const oneHourMs = 60 * 60 * 1000;
      assert.ok(
        expiresAtMs < beforeReq + oneHourMs - 60000,
        'O TTL de password_reset deve ser de 30 minutos e não de 1 hora'
      );
    });
  });

  /* ========================================================================
     6. RESET DE SENHA (TWO-PHASE CLAIM & INVALIDAÇÃO DE SESSÕES)
     ======================================================================== */
  describe('6. Redefinição de Senha por Token', () => {
    let resetUserEmail;
    let resetUserId;
    let rawResetToken;

    beforeEach(async () => {
      const user = {
        id: `usr_rst_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        nome: 'Usuário Reset Test',
        login: `rst_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        email: `rst_${Date.now()}@corvfin.test`,
        senha: await hashPassword('OldPassword@123!'),
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        tokenVersion: 1
      };
      resetUserId = user.id;
      resetUserEmail = user.email;
      createdUserIds.push(user.id);
      const users = await storageService.getUsers();
      users.push(user);
      await storageService.saveUsers(users);

      rawResetToken = generateSecurityToken();
      const tokenHash = hashSecurityToken(rawResetToken);
      await storageService.createSecurityToken({
        userId: user.id,
        type: 'password_reset',
        tokenHash,
        expiresAt: new Date(Date.now() + 1800000).toISOString() // 30 min
      });
    });

    test('6.1 Reset com senha fraca é rejeitado (400) e token NÃO é consumido', async () => {
      const res = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawResetToken, newPassword: 'weak' })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert.strictEqual(data.success, false);

      // Como a validação barrou antes, o token ainda deve estar utilizável com senha válida
      const retryRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawResetToken, newPassword: 'StrongPassword@2026!' })
      });
      assert.strictEqual(retryRes.status, 200);
    });

    test('6.2 Reset com token válido atualiza senha, incrementa tokenVersion e envia notificação', async () => {
      sentEmails = [];
      const newPassword = 'BrandNewPassword@2026!';
      const res = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawResetToken, newPassword })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);

      // Valida atualização no banco
      const updatedUser = await storageService.getUserById(resetUserId);
      assert.strictEqual(updatedUser.tokenVersion, 2, 'tokenVersion deve ser incrementado');
      const pwdMatches = await comparePassword(newPassword, updatedUser.senha);
      assert.strictEqual(pwdMatches, true, 'Nova senha deve conferir com o hash');

      // Verifica disparo do e-mail informativo "Senha alterada"
      assert.strictEqual(sentEmails.length, 1);
      assert.strictEqual(sentEmails[0].to, resetUserEmail);
      assert.ok(sentEmails[0].subject.includes('senha foi alterada'));
      assert.strictEqual(sentEmails[0].text.includes(newPassword), false, 'Senha nunca deve constar no e-mail');
    });

    test('6.3 Token de reset é single-use: reutilização falha com 400', async () => {
      const newPassword = 'BrandNewPassword@2026!';
      // Primeira chamada (sucesso)
      const res1 = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawResetToken, newPassword })
      });
      assert.strictEqual(res1.status, 200);

      // Segunda chamada com mesmo token (falha)
      const res2 = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: rawResetToken, newPassword: 'AnotherPassword@999!' })
      });
      assert.strictEqual(res2.status, 400);
    });

    test('6.4 Token de reset expirado é rejeitado', async () => {
      const expiredRawToken = generateSecurityToken();
      const expiredHash = hashSecurityToken(expiredRawToken);
      await storageService.createSecurityToken({
        userId: resetUserId,
        type: 'password_reset',
        tokenHash: expiredHash,
        expiresAt: new Date(Date.now() - 10000).toISOString() // Já expirado
      });

      const res = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: expiredRawToken, newPassword: 'ValidPassword@2026!' })
      });

      assert.strictEqual(res.status, 400);
    });

    test('6.5 Validação estrita do contrato de 30 minutos: token vencido há 1s é rejeitado e dentro de 30m é aceito', async () => {
      // Token gerado como se tivesse sido emitido há 31 minutos (expirado há 1 minuto)
      const expiredRaw = generateSecurityToken();
      const expiredHash = hashSecurityToken(expiredRaw);
      await storageService.createSecurityToken({
        userId: resetUserId,
        type: 'password_reset',
        tokenHash: expiredHash,
        expiresAt: new Date(Date.now() - 60000).toISOString()
      });

      const resExpired = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: expiredRaw, newPassword: 'ValidPassword@2026!' })
      });
      assert.strictEqual(resExpired.status, 400);

      // Token válido dentro da janela de 30 minutos (ex: 29 minutos restantes)
      const validRaw = generateSecurityToken();
      const validHash = hashSecurityToken(validRaw);
      await storageService.createSecurityToken({
        userId: resetUserId,
        type: 'password_reset',
        tokenHash: validHash,
        expiresAt: new Date(Date.now() + 29 * 60 * 1000).toISOString()
      });

      const resValid = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: validRaw, newPassword: 'ValidPassword@2026!' })
      });
      assert.strictEqual(resValid.status, 200);
    });
  });

  /* ========================================================================
     7. ALTERAÇÃO DE SENHA POR USUÁRIO AUTENTICADO (CHANGE-PASSWORD)
     ======================================================================== */
  describe('7. Alteração de Senha por Usuário Autenticado', () => {
    let changeUser;
    let sessionCookie;
    const currentPassword = 'CurrentPassword@2026!';

    beforeEach(async () => {
      changeUser = {
        id: `usr_chg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        nome: 'Usuário Change',
        login: `chg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        email: `chg_${Date.now()}@corvfin.test`,
        senha: await hashPassword(currentPassword),
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        tokenVersion: 0
      };
      createdUserIds.push(changeUser.id);
      const users = await storageService.getUsers();
      users.push(changeUser);
      await storageService.saveUsers(users);

      // Faz login para obter cookie de sessão
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: changeUser.login, senha: currentPassword })
      });
      const cookieHeader = loginRes.headers.get('set-cookie') || '';
      const match = cookieHeader.match(/omnifin_session=([^;]+)/);
      sessionCookie = match ? match[1] : '';
    });

    test('7.1 Requer autenticação (sem cookie retorna 401)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ senhaAtual: currentPassword, novaSenha: 'NewPassword@2026!' })
      });
      assert.strictEqual(res.status, 401);
    });

    test('7.2 Requer CSRF (com cookie de sessão mas sem X-Requested-With retorna 403)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `omnifin_session=${sessionCookie}`
        },
        body: JSON.stringify({ senhaAtual: currentPassword, novaSenha: 'NewPassword@2026!' })
      });
      assert.strictEqual(res.status, 403);
    });

    test('7.3 Senha atual errada é rejeitada (400)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `omnifin_session=${sessionCookie}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ senhaAtual: 'WrongPass@123!', novaSenha: 'NewPassword@2026!' })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.message.includes('incorreta'));
    });

    test('7.4 Nova senha idêntica à atual é rejeitada (400)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `omnifin_session=${sessionCookie}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ senhaAtual: currentPassword, novaSenha: currentPassword })
      });
      assert.strictEqual(res.status, 400);
    });

    test('7.6 Nova senha que viola a política de complexidade é rejeitada com HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `omnifin_session=${sessionCookie}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ senhaAtual: currentPassword, novaSenha: 'NoSpecialChar123' })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes('caractere especial'));
    });

    test('7.7 Alerta de alteração é enviado em best-effort e falha no transporte não impede a troca', async () => {
      // Cria usuário dedicado para teste de falha no transporte de e-mail
      const beUser = {
        id: `usr_be_${Date.now()}`,
        nome: 'Best Effort User',
        login: `be_${Date.now()}`,
        email: `be_${Date.now()}@corvfin.test`,
        senha: await hashPassword('InitialPass@2026!'),
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        tokenVersion: 0
      };
      createdUserIds.push(beUser.id);
      const users = await storageService.getUsers();
      users.push(beUser);
      await storageService.saveUsers(users);

      const loginBeRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: beUser.login, senha: 'InitialPass@2026!' })
      });
      const beCookie = loginBeRes.headers.get('set-cookie')?.match(/omnifin_session=([^;]+)/)?.[1];

      // Simula falha temporária no transporte de e-mail
      const origSend = mailService.sendMail;
      mailService.sendMail = async () => {
        throw new Error('Simulated SMTP connection timeout');
      };

      try {
        const res = await fetch(`${baseUrl}/api/auth/change-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `omnifin_session=${beCookie}`,
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({ senhaAtual: 'InitialPass@2026!', novaSenha: 'NewBestEffort@2026!' })
        });
        assert.strictEqual(res.status, 200, 'Falha no transporte não pode impedir a troca da senha');
        const data = await res.json();
        assert.strictEqual(data.success, true);
      } finally {
        mailService.sendMail = origSend;
      }
    });

    test('7.5 Troca bem-sucedida atualiza senha, incrementa tokenVersion e encerra sessão', async () => {
      sentEmails = [];
      const newPass = 'UpdatedPassword@2026!';
      const res = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `omnifin_session=${sessionCookie}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ senhaAtual: currentPassword, novaSenha: newPass })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);

      // Valida que a sessão antiga não funciona mais
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { 'Cookie': `omnifin_session=${sessionCookie}` }
      });
      assert.strictEqual(meRes.status, 401, 'Sessão anterior deve ser rejeitada após incremento de tokenVersion');

      // Valida novo login com a nova senha
      const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: changeUser.login, senha: newPass })
      });
      assert.strictEqual(newLoginRes.status, 200);

      // Verifica envio de e-mail de alerta
      assert.strictEqual(sentEmails.length, 1);
      assert.strictEqual(sentEmails[0].to, changeUser.email);
    });
  });

  /* ========================================================================
     8. COMPATIBILIDADE COM USUÁRIOS LEGADOS E CRIADOS POR ADMIN
     ======================================================================== */
  describe('8. Compatibilidade e Regras de Negócio', () => {
    test('8.1 Usuário legado (sem campo emailVerified) continua acessando com sucesso', async () => {
      const legacyUser = {
        id: `usr_legacy_${Date.now()}`,
        nome: 'Usuário Legado',
        login: `legacy_${Date.now()}`,
        email: `legacy_${Date.now()}@corvfin.test`,
        senha: await hashPassword('LegacyPass@2026!'),
        tokenVersion: 0
        // emailVerified omitido intencionalmente
      };
      createdUserIds.push(legacyUser.id);
      const users = await storageService.getUsers();
      users.push(legacyUser);
      await storageService.saveUsers(users);

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: legacyUser.login, senha: 'LegacyPass@2026!' })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200, 'Usuário legado não deve ser bloqueado');
      assert.strictEqual(data.success, true);
    });

    test('8.2 Usuário criado por ADMIN nasce com emailVerified: true e pode logar imediatamente', async () => {
      // 1. Cria admin para chamar o endpoint
      const adminPass = 'AdminPass@2026!';
      const adminUser = {
        id: `usr_admin_${Date.now()}`,
        nome: 'Admin Master',
        login: `adm_${Date.now()}`,
        email: `adm_${Date.now()}@corvfin.test`,
        senha: await hashPassword(adminPass),
        is_admin: true,
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        tokenVersion: 0
      };
      createdUserIds.push(adminUser.id);
      const users = await storageService.getUsers();
      users.push(adminUser);
      await storageService.saveUsers(users);

      const loginAdmRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: adminUser.login, senha: adminPass })
      });
      const admCookieHeader = loginAdmRes.headers.get('set-cookie') || '';
      const admMatch = admCookieHeader.match(/omnifin_session=([^;]+)/);
      const admCookie = admMatch ? admMatch[1] : '';

      // 2. Admin cria novo usuário via POST /api/admin/users
      const targetLogin = `corp_usr_${Date.now()}`;
      const targetPass = 'CorpPass@2026!';
      const createRes = await fetch(`${baseUrl}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `omnifin_session=${admCookie}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          nome: 'Usuário Criado por Admin',
          login: targetLogin,
          email: `${targetLogin}@corvfin.test`,
          senha: targetPass
        })
      });

      const createData = await createRes.json();
      assert.strictEqual(createRes.status, 201);
      assert.strictEqual(createData.user.emailVerified, true);
      createdUserIds.push(createData.user.id);

      // 3. Usuário criado por admin pode logar imediatamente sem precisar confirmar
      const userLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: targetLogin, senha: targetPass })
      });
      assert.strictEqual(userLoginRes.status, 200, 'Usuário criado por admin pode logar de imediato');
    });
  });

  /* ========================================================================
     9. REDEFINIÇÃO ADMINISTRATIVA DE SENHA
     ======================================================================== */
  describe('9. Redefinição Administrativa de Senha', () => {
    let adminCookie;
    let targetUser;
    let targetSessionCookie;

    beforeEach(async () => {
      // 1. Cria admin autenticado
      const adminPass = 'AdminSecurityPass@2026!';
      const admin = {
        id: `usr_adm_pwd_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        nome: 'Admin Master Password',
        login: `adm_pwd_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        email: `adm_pwd_${Date.now()}@corvfin.test`,
        senha: await hashPassword(adminPass),
        is_admin: true,
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        tokenVersion: 0
      };
      createdUserIds.push(admin.id);
      const allUsers = await storageService.getUsers();
      allUsers.push(admin);
      await storageService.saveUsers(allUsers);

      const loginAdmRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: admin.login, senha: adminPass })
      });
      const admCookieHeader = loginAdmRes.headers.get('set-cookie') || '';
      adminCookie = admCookieHeader.match(/omnifin_session=([^;]+)/)?.[1] || '';

      // 2. Cria usuário comum alvo
      const initialTargetPass = 'TargetUserPass@2026!';
      targetUser = {
        id: `usr_target_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        nome: 'Usuário Alvo Redefinição',
        login: `target_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        email: `target_${Date.now()}@corvfin.test`,
        senha: await hashPassword(initialTargetPass),
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        tokenVersion: 1
      };
      createdUserIds.push(targetUser.id);
      const currentUsers = await storageService.getUsers();
      currentUsers.push(targetUser);
      await storageService.saveUsers(currentUsers);

      // 3. Usuário alvo faz login para ter uma sessão ativa
      const loginTargetRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: targetUser.login, senha: initialTargetPass })
      });
      const targetCookieHeader = loginTargetRes.headers.get('set-cookie') || '';
      targetSessionCookie = targetCookieHeader.match(/omnifin_session=([^;]+)/)?.[1] || '';

      // Garante que a sessão inicial está válida
      const checkMe = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { 'Cookie': `omnifin_session=${targetSessionCookie}` }
      });
      assert.strictEqual(checkMe.status, 200, 'Sessão inicial do usuário alvo deve estar ativa');
    });

    test('9.1 Endpoint administrativo rejeita senha fora da política (HTTP 400)', async () => {
      // Tenta redefinir com senha fraca (sem número e sem caractere especial)
      const res = await fetch(`${baseUrl}/api/admin/users/${targetUser.id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `omnifin_session=${adminCookie}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ novaSenha: 'Fraca' })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes('8 caracteres') || data.message.includes('política'));

      // Tenta também via PUT /api/admin/users/:userId com senha sem maiúscula
      const resEdit = await fetch(`${baseUrl}/api/admin/users/${targetUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `omnifin_session=${adminCookie}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ novaSenha: 'alllowercase123!' })
      });

      const dataEdit = await resEdit.json();
      assert.strictEqual(resEdit.status, 400);
      assert.strictEqual(dataEdit.success, false);
    });

    test('9.2 Senha administrativa válida é aceita, incrementa tokenVersion e invalida sessão anterior do alvo', async () => {
      const adminNewPass = 'AdminNewPassword@2026!';
      const res = await fetch(`${baseUrl}/api/admin/users/${targetUser.id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `omnifin_session=${adminCookie}`,
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ novaSenha: adminNewPass })
      });

      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);

      // 1. Verifica incremento de tokenVersion no banco
      const updatedUser = await storageService.getUserById(targetUser.id);
      assert.strictEqual(updatedUser.tokenVersion, 2, 'tokenVersion deve ser incrementado de 1 para 2');

      // 2. A sessão anterior do usuário alvo deve estar invalidada imediatamente
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { 'Cookie': `omnifin_session=${targetSessionCookie}` }
      });
      assert.strictEqual(meRes.status, 401, 'Sessão anterior do usuário alvo deve ser rejeitada após reset pelo admin');

      // 3. Usuário alvo pode logar com a nova senha definida pelo admin
      const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: targetUser.login, senha: adminNewPass })
      });
      assert.strictEqual(newLoginRes.status, 200, 'Usuário alvo deve conseguir logar com a nova senha');
    });
  });

  /* ========================================================================
     10. CONTRATOS ESTÁTICOS DE UX E SEGURANÇA DE CREDENCIAIS
     ======================================================================== */
  describe('10. Contratos Estáticos de UX e Segurança de Credenciais', () => {
    test('10.1 Confirmação de nova senha e checklist de política existem no fluxo do usuário', () => {
      const indexPath = path.resolve(__dirname, '../public/index.html');
      const indexHtml = fs.readFileSync(indexPath, 'utf-8');

      // Verifica campos do formulário de troca de senha do usuário
      assert.ok(indexHtml.includes('id="changePasswordForm"'), 'Deve conter changePasswordForm');
      assert.ok(indexHtml.includes('id="currentPasswordInput"'), 'Deve conter campo Senha Atual');
      assert.ok(indexHtml.includes('id="newPasswordInput"'), 'Deve conter campo Nova Senha');
      assert.ok(indexHtml.includes('id="confirmPasswordInput"'), 'Deve conter campo Confirmar Nova Senha');
      assert.ok(indexHtml.includes('id="userPassChecklistBox"'), 'Deve conter checklist visual de política');
      assert.ok(indexHtml.includes('id="btnChangePasswordSubmit"'), 'Deve conter botão de envio');

      // Verifica script profile.js para regras de UX
      const profilePath = path.resolve(__dirname, '../public/js/modules/profile.js');
      const profileJs = fs.readFileSync(profilePath, 'utf-8');
      assert.ok(profileJs.includes('initChangePasswordForm'), 'profile.js deve inicializar o form de senha');
      assert.ok(profileJs.includes('API.changePassword'), 'profile.js deve chamar API.changePassword');
      assert.ok(profileJs.includes('PasswordPolicy.checkCriteria') || profileJs.includes('checkCriteria'), 'Deve validar critérios em tempo real');
    });

    test('10.2 Confirmação de nova senha e checklist de política existem no fluxo administrativo', () => {
      const adminPath = path.resolve(__dirname, '../public/js/admin.js');
      const adminJs = fs.readFileSync(adminPath, 'utf-8');

      // Modal de criação de usuário
      assert.ok(adminJs.includes('adminCreateSenha'), 'Admin criação deve ter campo senha');
      assert.ok(adminJs.includes('adminCreateConfirmSenha'), 'Admin criação deve ter confirmação de senha');
      assert.ok(adminJs.includes('adminCreatePassChecklistBox'), 'Admin criação deve ter checklist visual');

      // Modal de edição/redefinição de usuário
      assert.ok(adminJs.includes('adminEditNovaSenha'), 'Admin edição deve ter campo nova senha');
      assert.ok(adminJs.includes('adminEditConfirmSenha'), 'Admin edição deve ter confirmação de nova senha');
      assert.ok(adminJs.includes('adminEditPassChecklistBox'), 'Admin edição deve ter checklist visual');

      // Confirma desabilitação do botão até confirmação coincidente e válida
      assert.ok(adminJs.includes('validateAdminCreatePassword'), 'Deve validar senha e confirmação na criação');
      assert.ok(adminJs.includes('validateAdminEditPassword'), 'Deve validar senha e confirmação na edição');
    });

    test('10.3 Nenhum inline handler foi introduzido nas UIs de credenciais (CSP estrita)', () => {
      const indexPath = path.resolve(__dirname, '../public/index.html');
      const indexHtml = fs.readFileSync(indexPath, 'utf-8');

      // Extrai bloco do profileSecurityCard
      const cardMatch = indexHtml.match(/<div class="card section-card" id="profileSecurityCard">([\s\S]*?)<\/div>\s*<div class="card section-card/);
      assert.ok(cardMatch, 'Card profileSecurityCard deve ser localizado no index.html');
      const cardHtml = cardMatch[1];

      assert.strictEqual(/on(click|submit|input|change|keyup|keydown)=/i.test(cardHtml), false, 'Nenhum inline handler permitido no card de senha');
    });

    test('10.4 Nenhuma senha é persistida em localStorage ou sessionStorage', () => {
      const profilePath = path.resolve(__dirname, '../public/js/modules/profile.js');
      const profileJs = fs.readFileSync(profilePath, 'utf-8');
      const adminPath = path.resolve(__dirname, '../public/js/admin.js');
      const adminJs = fs.readFileSync(adminPath, 'utf-8');
      const apiPath = path.resolve(__dirname, '../public/js/api.js');
      const apiJs = fs.readFileSync(apiPath, 'utf-8');

      const passStorageRegex = /(localStorage|sessionStorage)\.setItem\([^)]*(senha|password|novaSenha|currentPass|newPass)/i;

      assert.strictEqual(passStorageRegex.test(profileJs), false, 'profile.js não deve persistir senhas');
      assert.strictEqual(passStorageRegex.test(adminJs), false, 'admin.js não deve persistir senhas');
      assert.strictEqual(passStorageRegex.test(apiJs), false, 'api.js não deve persistir senhas');
    });
  });
});

