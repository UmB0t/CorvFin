/* ==========================================================================
   MÓDULO DE GUIA DO SISTEMA / ONBOARDING (welcomeTour.js)
   CorvFin V3 - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  function shouldShowWelcomeTour() {
    // Modal só deve aparecer após hidratação completa dos dados
    if (typeof window.isStateHydrated === 'function' && !window.isStateHydrated()) {
      return false;
    }
    const state = (typeof getState === 'function') ? getState() : null;
    if (!state) return false;

    // Apenas novos usuários com onboarding.welcomeSeen === false recebem o modal
    // Usuários legados (sem a flag) ou usuários que já concluíram não são interrompidos
    if (state.onboarding && state.onboarding.welcomeSeen === false) {
      return true;
    }
    return false;
  }

  function checkWelcomeTour() {
    const overlay = document.getElementById('welcome-tour-popover') || document.getElementById('onboardingPopover');
    if (!overlay) return;

    if (shouldShowWelcomeTour()) {
      overlay.hidden = false;
      overlay.removeAttribute('hidden');
      overlay.removeAttribute('aria-hidden');
      overlay.classList.remove('hidden');
      overlay.classList.add('open');
      overlay.style.removeProperty('display');
      overlay.style.setProperty('display', 'flex', 'important');
    } else {
      overlay.hidden = true;
      overlay.setAttribute('hidden', '');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.add('hidden');
      overlay.classList.remove('open');
      overlay.style.setProperty('display', 'none', 'important');
    }
  }

  function dismissWelcomeTour(openGuide = false) {
    const state = (typeof getState === 'function') ? getState() : null;
    if (state) {
      if (!state.onboarding) state.onboarding = {};
      state.onboarding.welcomeSeen = true;
      if (typeof saveState === 'function') {
        saveState('onboarding_completed');
      }
    }

    const overlay = document.getElementById('welcome-tour-popover') || document.getElementById('onboardingPopover');
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('hidden', '');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.add('hidden');
      overlay.classList.remove('open');
      overlay.style.setProperty('display', 'none', 'important');
    }

    if (openGuide) {
      const infoDlg = document.getElementById('infoDialog');
      if (infoDlg && typeof infoDlg.showModal === 'function') {
        try {
          infoDlg.showModal();
        } catch (_) {}
      }
    }
  }

  // Registra listeners de clique
  document.addEventListener('click', (e) => {
    if (!e.target) return;
    if (e.target.closest('#btnDismissOnboarding')) {
      e.preventDefault();
      dismissWelcomeTour(false);
      return;
    }
    if (e.target.closest('#btnExploreGuideOnboarding') || e.target.closest('#btnOpenGuideFromWelcome')) {
      e.preventDefault();
      dismissWelcomeTour(true);
      return;
    }
    if (e.target.closest('#welcomeTourCloseBtn')) {
      e.preventDefault();
      dismissWelcomeTour(false);
      return;
    }
    const overlay = document.getElementById('welcome-tour-popover');
    if (overlay && e.target === overlay) {
      dismissWelcomeTour(false);
    }
  });

  // Fechamento com tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('welcome-tour-popover');
      if (overlay && !overlay.hidden && overlay.classList.contains('open')) {
        dismissWelcomeTour(false);
      }
    }
  });

  // APIs públicas do Módulo de Onboarding
  window.shouldShowWelcomeTour = shouldShowWelcomeTour;
  window.checkWelcomeTour = checkWelcomeTour;
  window.dismissWelcomeTour = dismissWelcomeTour;
  window.checkOnboarding = checkWelcomeTour;
  window.dismissOnboarding = dismissWelcomeTour;

})();
