/**
 * Finanças Pro - Autenticação & Validações
 */
document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const authSub = document.getElementById('auth-sub');

  const regPassInput = document.getElementById('reg-pass');
  const regConfirmInput = document.getElementById('reg-pass-confirm');
  const strengthFill = document.getElementById('strength-bar-fill');

  const critLen = document.getElementById('crit-len');
  const critUpper = document.getElementById('crit-upper');
  const critLower = document.getElementById('crit-lower');
  const critNum = document.getElementById('crit-num');
  const critSpec = document.getElementById('crit-spec');

  const toastEl = document.getElementById('auth-toast');
  let toastTimer = null;

  // Show Toast Feedback
  function showToast(message, isError = false) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.className = `auth-toast ${isError ? 'error' : ''}`;
    toastEl.style.display = 'block';

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.style.display = 'none';
    }, 4000);
  }

  // Switch Tab View
  function switchTab(target) {
    if (target === 'register') {
      document.body.classList.remove('login-mode');
      document.body.classList.add('register-mode');

      tabLogin.classList.remove('active');
      tabLogin.setAttribute('aria-selected', 'false');
      tabRegister.classList.add('active');
      tabRegister.setAttribute('aria-selected', 'true');

      formLogin.style.display = 'none';
      formRegister.style.display = 'flex';
      authSub.textContent = 'Crie sua conta para gerenciar suas finanças';
    } else {
      document.body.classList.remove('register-mode');
      document.body.classList.add('login-mode');

      tabRegister.classList.remove('active');
      tabRegister.setAttribute('aria-selected', 'false');
      tabLogin.classList.add('active');
      tabLogin.setAttribute('aria-selected', 'true');

      formRegister.style.display = 'none';
      formLogin.style.display = 'flex';
      authSub.textContent = 'Acesse sua conta para continuar';
    }
  }

  if (tabLogin) tabLogin.addEventListener('click', () => switchTab('login'));
  if (tabRegister) tabRegister.addEventListener('click', () => switchTab('register'));

  // Password Requirements Validation
  function checkPasswordCriteria(password) {
    return {
      hasLen: password.length >= 8,
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

  function evaluatePasswordStrength() {
    if (!regPassInput) return false;
    const password = regPassInput.value || '';
    const { hasLen, hasUpper, hasLower, hasNum, hasSpec } = checkPasswordCriteria(password);

    updateCritItem(critLen, hasLen);
    updateCritItem(critUpper, hasUpper);
    updateCritItem(critLower, hasLower);
    updateCritItem(critNum, hasNum);
    updateCritItem(critSpec, hasSpec);

    const score = [hasLen, hasUpper, hasLower, hasNum, hasSpec].filter(Boolean).length;
    const percentage = (score / 5) * 100;

    if (strengthFill) {
      strengthFill.style.width = `${percentage}%`;
      if (score <= 2) {
        strengthFill.style.backgroundColor = 'var(--danger, #ef4444)';
      } else if (score <= 4) {
        strengthFill.style.backgroundColor = 'var(--warning, #f59e0b)';
      } else {
        strengthFill.style.backgroundColor = 'var(--brand, #1F7A5C)';
      }
    }

    return score === 5;
  }

  if (regPassInput) {
    regPassInput.addEventListener('input', evaluatePasswordStrength);
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
        let result;
        if (typeof API !== 'undefined' && API.login) {
          result = await API.login(login, senha);
        } else {
          const endpoint = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/api/auth/login') : '/api/auth/login';
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, senha })
          });
          result = await response.json();
        }

        if (result && result.success && result.token) {
          // Unified Session Storage
          if (typeof API !== 'undefined' && API.setSession) {
            API.setSession(result.token, result.user);
          } else {
            localStorage.setItem('auth_token', result.token);
            localStorage.setItem('token', result.token);
            localStorage.setItem('user_data', JSON.stringify(result.user));
            localStorage.setItem('user', JSON.stringify(result.user));
          }

          showToast(result.message || 'Login efetuado com sucesso!');
          setTimeout(() => {
            const redirectPath = (window.API && typeof API.resolveUrl === 'function')
              ? API.resolveUrl('/despesas')
              : (typeof window.withBasePath === 'function' ? window.withBasePath('/despesas') : '/despesas');
            window.location.href = redirectPath;
          }, 500);
        } else {
          showToast(result.message || 'Credenciais inválidas. Verifique os dados.', true);
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

      if (!evaluatePasswordStrength()) {
        showToast('A senha não atende a todos os requisitos de segurança.', true);
        return;
      }

      if (senha !== confirmaSenha) {
        showToast('A confirmação de senha não confere.', true);
        return;
      }

      btnSubmit.disabled = true;
      const originalText = btnSubmit.innerHTML;
      btnSubmit.innerHTML = '<span>Criando conta...</span>';

      try {
        const payload = { nome, login, email, senha, notificacoes_ativas };
        let result;
        if (typeof API !== 'undefined' && API.register) {
          result = await API.register(payload);
        } else {
          const endpoint = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/api/auth/register') : '/api/auth/register';
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          result = await response.json();
        }

        if (result && result.success && result.token) {
          // Unified Session Storage
          if (typeof API !== 'undefined' && API.setSession) {
            API.setSession(result.token, result.user);
          } else {
            localStorage.setItem('auth_token', result.token);
            localStorage.setItem('token', result.token);
            localStorage.setItem('user_data', JSON.stringify(result.user));
            localStorage.setItem('user', JSON.stringify(result.user));
          }

          showToast(result.message || 'Cadastro realizado com sucesso!');
          setTimeout(() => {
            const redirectPath = (typeof API !== 'undefined' && API.resolveUrl) ? API.resolveUrl('/despesas') : '/';
            window.location.href = redirectPath;
          }, 600);
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

  // If already authenticated with valid token, redirect to app
  const currentToken = localStorage.getItem('auth_token') || localStorage.getItem('token');
  if (currentToken && currentToken.length > 20) {
    // Optionally check if token is valid or let user re-authenticate
  }
});
