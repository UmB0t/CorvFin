/**
 * CorvFin - Autenticação, Ciclo de Conta & Validações
 * Checkpoint Security 6B
 */
document.addEventListener('DOMContentLoaded', () => {
  // Elements - Main Navigation & Forms
  const tabsContainer = document.querySelector('.auth-tabs');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const formForgot = document.getElementById('form-forgot');
  const formReset = document.getElementById('form-reset');
  const panelVerify = document.getElementById('panel-verify');
  const authSub = document.getElementById('auth-sub');

  // Forgot & Reset Elements
  const linkForgotPassword = document.getElementById('link-forgot-password');
  const btnForgotBack = document.getElementById('btn-forgot-back');
  const btnResetBack = document.getElementById('btn-reset-back');
  const btnVerifyToLogin = document.getElementById('btn-verify-to-login');
  const forgotEmailInput = document.getElementById('forgot-email');
  const forgotMsg = document.getElementById('forgot-msg');
  const unverifiedBanner = document.getElementById('unverified-banner');
  const unverifiedText = document.getElementById('unverified-text');
  const btnResendVerification = document.getElementById('btn-resend-verification');

  // Register Password Elements
  const regPassInput = document.getElementById('reg-pass');
  const regConfirmInput = document.getElementById('reg-pass-confirm');
  const strengthFill = document.getElementById('strength-bar-fill');
  const critLen = document.getElementById('crit-len');
  const critUpper = document.getElementById('crit-upper');
  const critLower = document.getElementById('crit-lower');
  const critNum = document.getElementById('crit-num');
  const critSpec = document.getElementById('crit-spec');

  // Reset Password Elements
  const resetPassInput = document.getElementById('reset-pass');
  const resetConfirmInput = document.getElementById('reset-pass-confirm');
  const resetStrengthFill = document.getElementById('reset-strength-bar-fill');
  const resetCritLen = document.getElementById('reset-crit-len');
  const resetCritUpper = document.getElementById('reset-crit-upper');
  const resetCritLower = document.getElementById('reset-crit-lower');
  const resetCritNum = document.getElementById('reset-crit-num');
  const resetCritSpec = document.getElementById('reset-crit-spec');

  const toastEl = document.getElementById('auth-toast');
  let toastTimer = null;
  let currentResetToken = null;
  let lastUnverifiedEmail = null;

  // Show Toast Feedback
  function showToast(message, isError = false) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.className = `auth-toast ${isError ? 'error' : ''}`;
    toastEl.style.display = 'block';

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.style.display = 'none';
    }, 4500);
  }

  function resolveApiUrl(path) {
    if (typeof API !== 'undefined' && typeof API.resolveUrl === 'function') {
      return API.resolveUrl(path);
    }
    const base = (window.__BASE_PATH__ || '').replace(/\/+$/, '');
    return `${base}${path}`;
  }

  // Switch Views
  function showView(viewName) {
    // Hide all forms/panels
    if (formLogin) formLogin.style.display = 'none';
    if (formRegister) formRegister.style.display = 'none';
    if (formForgot) formForgot.style.display = 'none';
    if (formReset) formReset.style.display = 'none';
    if (panelVerify) panelVerify.style.display = 'none';

    if (viewName === 'login') {
      document.body.classList.remove('register-mode');
      document.body.classList.add('login-mode');
      if (tabsContainer) tabsContainer.style.display = 'flex';
      if (tabLogin) { tabLogin.classList.add('active'); tabLogin.setAttribute('aria-selected', 'true'); }
      if (tabRegister) { tabRegister.classList.remove('active'); tabRegister.setAttribute('aria-selected', 'false'); }
      if (formLogin) formLogin.style.display = 'flex';
      if (authSub) authSub.textContent = 'Acesse sua conta para continuar';
    } else if (viewName === 'register') {
      document.body.classList.remove('login-mode');
      document.body.classList.add('register-mode');
      if (tabsContainer) tabsContainer.style.display = 'flex';
      if (tabRegister) { tabRegister.classList.add('active'); tabRegister.setAttribute('aria-selected', 'true'); }
      if (tabLogin) { tabLogin.classList.remove('active'); tabLogin.setAttribute('aria-selected', 'false'); }
      if (formRegister) formRegister.style.display = 'flex';
      if (authSub) authSub.textContent = 'Crie sua conta para gerenciar suas finanças';
    } else if (viewName === 'forgot') {
      if (tabsContainer) tabsContainer.style.display = 'none';
      if (formForgot) formForgot.style.display = 'flex';
      if (authSub) authSub.textContent = 'Recupere o acesso à sua conta';
      if (forgotMsg) forgotMsg.style.display = 'none';
    } else if (viewName === 'reset') {
      if (tabsContainer) tabsContainer.style.display = 'none';
      if (formReset) formReset.style.display = 'flex';
      if (authSub) authSub.textContent = 'Defina uma nova senha para sua conta';
    } else if (viewName === 'verify') {
      if (tabsContainer) tabsContainer.style.display = 'none';
      if (panelVerify) panelVerify.style.display = 'block';
      if (authSub) authSub.textContent = 'Confirmação de endereço de e-mail';
    }
  }

  if (tabLogin) tabLogin.addEventListener('click', () => showView('login'));
  if (tabRegister) tabRegister.addEventListener('click', () => showView('register'));
  if (linkForgotPassword) linkForgotPassword.addEventListener('click', () => showView('forgot'));
  if (btnForgotBack) btnForgotBack.addEventListener('click', () => showView('login'));
  if (btnResetBack) btnResetBack.addEventListener('click', () => showView('login'));
  if (btnVerifyToLogin) btnVerifyToLogin.addEventListener('click', () => showView('login'));

  // Password Requirements Validation
  function checkPasswordCriteria(password) {
    return {
      hasLen: password.length >= 8 && password.length <= 128,
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasNum: /[0-9]/.test(password),
      hasSpec: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };
  }

  function updateCritItem(el, isValid) {
    if (!el) return;
    const icon = el.querySelector('.crit-icon');
    if (isValid) {
      el.classList.add('valid');
      el.classList.remove('invalid');
      if (icon) icon.textContent = '✓';
    } else {
      el.classList.remove('valid');
      el.classList.add('invalid');
      if (icon) icon.textContent = '✕';
    }
  }

  function evaluateStrength(password, fillEl, critMap) {
    const { hasLen, hasUpper, hasLower, hasNum, hasSpec } = checkPasswordCriteria(password);

    if (critMap) {
      updateCritItem(critMap.len, hasLen);
      updateCritItem(critMap.upper, hasUpper);
      updateCritItem(critMap.lower, hasLower);
      updateCritItem(critMap.num, hasNum);
      updateCritItem(critMap.spec, hasSpec);
    }

    const score = [hasLen, hasUpper, hasLower, hasNum, hasSpec].filter(Boolean).length;
    const percentage = (score / 5) * 100;

    if (fillEl) {
      fillEl.style.width = `${percentage}%`;
      if (score <= 2) {
        fillEl.style.backgroundColor = 'var(--danger, #ef4444)';
      } else if (score <= 4) {
        fillEl.style.backgroundColor = 'var(--warning, #f59e0b)';
      } else {
        fillEl.style.backgroundColor = 'var(--brand, #1F7A5C)';
      }
    }

    return score === 5;
  }

  if (regPassInput) {
    regPassInput.addEventListener('input', () => {
      evaluateStrength(regPassInput.value || '', strengthFill, {
        len: critLen,
        upper: critUpper,
        lower: critLower,
        num: critNum,
        spec: critSpec
      });
    });
  }

  if (resetPassInput) {
    resetPassInput.addEventListener('input', () => {
      evaluateStrength(resetPassInput.value || '', resetStrengthFill, {
        len: resetCritLen,
        upper: resetCritUpper,
        lower: resetCritLower,
        num: resetCritNum,
        spec: resetCritSpec
      });
    });
  }

  // Handle Login Submission
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const login = document.getElementById('login-user').value.trim();
      const senha = document.getElementById('login-pass').value;
      const btnSubmit = document.getElementById('btn-login');

      if (!login || !senha) {
        showToast('Por favor, informe seu login/e-mail e senha.', true);
        return;
      }

      btnSubmit.disabled = true;
      const originalText = btnSubmit.innerHTML;
      btnSubmit.innerHTML = '<span>Entrando...</span>';

      try {
        const endpoint = resolveApiUrl('/api/auth/login');
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login, senha })
        });
        const result = await response.json();

        if (response.status === 403 && result.code === 'EMAIL_NOT_VERIFIED') {
          // Bloqueio por e-mail não confirmado com opção de reenvio
          lastUnverifiedEmail = result.email || login;
          if (unverifiedBanner) unverifiedBanner.style.display = 'block';
          if (unverifiedText) unverifiedText.textContent = result.message || 'Por favor, confirme seu endereço de e-mail antes de acessar o sistema.';
          showToast(result.message || 'E-mail não verificado.', true);
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = originalText;
          return;
        }

        if (result && result.success) {
          if (unverifiedBanner) unverifiedBanner.style.display = 'none';

          if (typeof API !== 'undefined' && API.setSession) {
            API.setSession(result.user);
          } else {
            localStorage.setItem('user_data', JSON.stringify(result.user));
            localStorage.setItem('user', JSON.stringify(result.user));
          }

          if (typeof window.notifyAuthChange === 'function') {
            window.notifyAuthChange('LOGIN');
          }

          showToast(result.message || 'Login efetuado com sucesso!');
          setTimeout(() => {
            const user = result.user;
            const allowedRel = (window.getFirstAllowedRouteForUser && typeof window.getFirstAllowedRouteForUser === 'function')
              ? window.getFirstAllowedRouteForUser(user)
              : (user && user.permissions && user.permissions.dashboard === false ? '/despesas' : '/dashboard');
            const redirectPath = (window.API && typeof API.resolveUrl === 'function')
              ? API.resolveUrl(allowedRel)
              : (typeof window.withBasePath === 'function' ? window.withBasePath(allowedRel) : allowedRel);
            window.location.href = redirectPath;
          }, 500);
        } else {
          showToast(result.message || 'Login ou senha inválidos. Verifique os dados e tente novamente.', true);
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = originalText;
        }
      } catch (err) {
        console.error('Erro na autenticação:', err);
        showToast('Falha na comunicação com o servidor.', true);
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = originalText;
      }
    });
  }

  // Handle Reenviar Confirmação
  if (btnResendVerification) {
    btnResendVerification.addEventListener('click', async () => {
      const email = lastUnverifiedEmail || document.getElementById('login-user').value.trim();
      if (!email) {
        showToast('Informe o seu e-mail no campo de login.', true);
        return;
      }

      btnResendVerification.disabled = true;
      btnResendVerification.textContent = 'Enviando...';

      try {
        const endpoint = resolveApiUrl('/api/auth/resend-verification');
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        showToast(data.message || 'Se houver uma conta elegível, enviamos as instruções.');
        btnResendVerification.textContent = 'Instruções enviadas!';
        setTimeout(() => {
          btnResendVerification.disabled = false;
          btnResendVerification.textContent = 'Reenviar e-mail de confirmação';
        }, 5000);
      } catch (err) {
        showToast('Erro ao solicitar reenvio. Tente novamente.', true);
        btnResendVerification.disabled = false;
        btnResendVerification.textContent = 'Reenviar e-mail de confirmação';
      }
    });
  }

  // Handle Register Submission
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('reg-nome').value.trim();
      const login = document.getElementById('reg-login').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const senha = document.getElementById('reg-pass').value;
      const confirmaSenha = regConfirmInput ? regConfirmInput.value : '';
      const notifyCheckbox = document.getElementById('reg-notify');
      const notificacoes_ativas = notifyCheckbox ? notifyCheckbox.checked : true;
      const btnSubmit = document.getElementById('btn-register');

      if (!nome || !login || !email || !senha || !confirmaSenha) {
        showToast('Preencha todos os campos obrigatórios.', true);
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showToast('Informe um e-mail válido no formato nome@dominio.com.', true);
        return;
      }

      const isStrong = evaluateStrength(senha, strengthFill, {
        len: critLen,
        upper: critUpper,
        lower: critLower,
        num: critNum,
        spec: critSpec
      });
      if (!isStrong) {
        showToast('A senha não atende a todos os requisitos de segurança.', true);
        return;
      }

      if (senha !== confirmaSenha) {
        showToast('As senhas digitadas não coincidem. Verifique e tente novamente.', true);
        return;
      }

      btnSubmit.disabled = true;
      const originalText = btnSubmit.innerHTML;
      btnSubmit.innerHTML = '<span>Cadastrando...</span>';

      const payload = {
        nome,
        login,
        email,
        senha,
        notificacoes_ativas
      };

      try {
        const endpoint = resolveApiUrl('/api/auth/register');
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (result && result.success) {
          // Conta criada com sucesso (pendente de confirmação)
          showToast(result.message || 'Conta criada com sucesso! Confirme seu e-mail antes de fazer login.');

          // Preenche o formulário de login com o usuário criado e direciona para a aba de login
          const loginUserInput = document.getElementById('login-user');
          if (loginUserInput) loginUserInput.value = email;
          lastUnverifiedEmail = email;

          if (unverifiedBanner) {
            unverifiedBanner.style.display = 'block';
            if (unverifiedText) {
              unverifiedText.textContent = 'Conta criada com sucesso! Enviamos um link de confirmação para o seu e-mail. Confirme seu endereço para ativar o login.';
            }
          }

          showView('login');
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = originalText;
        } else {
          showToast(result.message || 'Erro ao realizar cadastro.', true);
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = originalText;
        }
      } catch (err) {
        console.error('Erro no cadastro:', err);
        showToast('Falha na comunicação com o servidor.', true);
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = originalText;
      }
    });
  }

  // Handle Forgot Password Submission
  if (formForgot) {
    formForgot.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (forgotEmailInput ? forgotEmailInput.value : '').trim();
      const btnSubmit = document.getElementById('btn-forgot-submit');

      if (!email) {
        showToast('Por favor, informe seu e-mail cadastrado.', true);
        return;
      }

      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span>Enviando...</span>';

      try {
        const endpoint = resolveApiUrl('/api/auth/forgot-password');
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const result = await response.json();

        if (forgotMsg) {
          forgotMsg.style.display = 'block';
          forgotMsg.textContent = result.message || 'Se existir uma conta associada a este e-mail, enviaremos instruções para redefinição da senha.';
        }
        showToast(result.message || 'Instruções enviadas se a conta existir.');
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span>Instruções Enviadas</span>';
      } catch (err) {
        console.error('Erro em forgot-password:', err);
        showToast('Falha na comunicação com o servidor.', true);
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span>Enviar Instruções</span>';
      }
    });
  }

  // Handle Reset Password Submission
  if (formReset) {
    formReset.addEventListener('submit', async (e) => {
      e.preventDefault();
      const novaSenha = resetPassInput ? resetPassInput.value : '';
      const confirmaNovaSenha = resetConfirmInput ? resetConfirmInput.value : '';
      const btnSubmit = document.getElementById('btn-reset-submit');

      if (!currentResetToken) {
        showToast('Token de redefinição não encontrado ou expirado. Solicite um novo link.', true);
        return;
      }

      if (!novaSenha || !confirmaNovaSenha) {
        showToast('Preencha e confirme a nova senha.', true);
        return;
      }

      const isStrong = evaluateStrength(novaSenha, resetStrengthFill, {
        len: resetCritLen,
        upper: resetCritUpper,
        lower: resetCritLower,
        num: resetCritNum,
        spec: resetCritSpec
      });
      if (!isStrong) {
        showToast('A nova senha não atende a todos os critérios de segurança.', true);
        return;
      }

      if (novaSenha !== confirmaNovaSenha) {
        showToast('As senhas não coincidem. Verifique e tente novamente.', true);
        return;
      }

      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span>Salvando...</span>';

      try {
        const endpoint = resolveApiUrl('/api/auth/reset-password');
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: currentResetToken, newPassword: novaSenha })
        });
        const result = await response.json();

        if (result && result.success) {
          showToast(result.message || 'Senha redefinida com sucesso! Faça login com a nova senha.');
          currentResetToken = null;
          setTimeout(() => {
            showView('login');
          }, 1000);
        } else {
          showToast(result.message || 'Token de redefinição inválido ou expirado.', true);
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = '<span>Salvar Nova Senha</span>';
        }
      } catch (err) {
        console.error('Erro no reset de senha:', err);
        showToast('Falha na comunicação com o servidor.', true);
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span>Salvar Nova Senha</span>';
      }
    });
  }

  // Detecção e Tratamento Automático de Tokens na URL (verify-email ou reset-password)
  const urlParams = new URLSearchParams(window.location.search);
  const rawToken = urlParams.get('token');
  const actionParam = urlParams.get('action');
  const pathname = window.location.pathname;

  const isVerifyEmail = pathname.endsWith('/verify-email') || actionParam === 'verify' || (rawToken && !actionParam && !pathname.endsWith('/reset-password'));
  const isResetPassword = pathname.endsWith('/reset-password') || actionParam === 'reset';

  if (rawToken && isResetPassword) {
    // Redefinição de senha solicitada via link de e-mail
    currentResetToken = rawToken;
    // Remove o token da URL para não permanecer exposto no histórico
    const cleanUrl = resolveApiUrl('/login');
    window.history.replaceState({}, document.title, cleanUrl);
    showView('reset');
  } else if (rawToken && isVerifyEmail) {
    // Confirmação de e-mail solicitada via link de e-mail
    const tokenToVerify = rawToken;
    const cleanUrl = resolveApiUrl('/login');
    window.history.replaceState({}, document.title, cleanUrl);
    showView('verify');

    // Executa chamada de validação do token
    (async () => {
      const iconEl = document.getElementById('verify-status-icon');
      const titleEl = document.getElementById('verify-status-title');
      const descEl = document.getElementById('verify-status-desc');

      try {
        const endpoint = resolveApiUrl('/api/auth/verify-email');
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenToVerify })
        });
        const result = await response.json();

        if (result && result.success) {
          if (iconEl) iconEl.textContent = '✅';
          if (titleEl) titleEl.textContent = 'E-mail Confirmado!';
          if (descEl) descEl.textContent = result.message || 'Seu endereço de e-mail foi verificado com sucesso. Você já pode fazer login.';
          if (btnVerifyToLogin) btnVerifyToLogin.style.display = 'block';
        } else {
          if (iconEl) iconEl.textContent = '❌';
          if (titleEl) titleEl.textContent = 'Falha na Confirmação';
          if (descEl) descEl.textContent = result.message || 'O link de confirmação é inválido ou já expirou. Solicite um novo reenvio.';
          if (btnVerifyToLogin) btnVerifyToLogin.style.display = 'block';
        }
      } catch (err) {
        if (iconEl) iconEl.textContent = '⚠️';
        if (titleEl) titleEl.textContent = 'Erro de Comunicação';
        if (descEl) descEl.textContent = 'Não foi possível validar o token no momento. Verifique sua conexão e tente novamente.';
        if (btnVerifyToLogin) btnVerifyToLogin.style.display = 'block';
      }
    })();
  } else {
    // Rota padrão: Exibe tela de login
    showView('login');
  }

  // Limpeza preventiva de chaves legadas de autenticação no cliente
  try {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('token');
    localStorage.removeItem('financas_pro_jwt_token');
  } catch (_) {}
});
