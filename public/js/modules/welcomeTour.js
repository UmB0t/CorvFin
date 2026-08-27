/* ==========================================================================
   MÓDULO DE ONBOARDING & WELCOME TOUR (welcomeTour.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  function checkWelcomeTour() {
    const tourCompleted = localStorage.getItem('tour_manual_completed');
    const overlay = document.getElementById('welcome-tour-popover') || document.getElementById('onboardingPopover');
    if (!overlay) return;

    if (tourCompleted === 'true') {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.add('hidden');
      overlay.classList.remove('open');
      overlay.style.setProperty('display', 'none', 'important');
    } else {
      overlay.hidden = false;
      overlay.removeAttribute('aria-hidden');
      overlay.classList.remove('hidden');
      overlay.classList.add('open');
      overlay.style.removeProperty('display');
      overlay.style.setProperty('display', 'flex', 'important');
    }
  }

  function dismissWelcomeTour(e) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    try {
      localStorage.setItem('tour_manual_completed', 'true');
    } catch (_) {}

    const overlay = document.getElementById('welcome-tour-popover') || document.getElementById('onboardingPopover');
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.add('hidden');
      overlay.classList.remove('open');
      overlay.style.setProperty('display', 'none', 'important');
    }
  }

  // Registra listener direto e por delegação para máxima compatibilidade mobile
  document.addEventListener('click', (e) => {
    if (!e.target) return;
    const btn = e.target.id === 'btnDismissOnboarding' ? e.target : e.target.closest('#btnDismissOnboarding');
    if (btn) {
      dismissWelcomeTour(e);
      return;
    }
    const overlay = document.getElementById('welcome-tour-popover');
    if (overlay && e.target === overlay) {
      dismissWelcomeTour(e);
    }
  });

  const attachDirectListener = () => {
    const btn = document.getElementById('btnDismissOnboarding');
    if (btn && !btn._hasTourListener) {
      btn._hasTourListener = true;
      btn.addEventListener('click', dismissWelcomeTour);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachDirectListener);
  } else {
    attachDirectListener();
  }

  // APIs públicas do Módulo de Onboarding
  window.checkWelcomeTour = checkWelcomeTour;
  window.dismissWelcomeTour = dismissWelcomeTour;
  window.checkOnboarding = checkWelcomeTour;
  window.dismissOnboarding = dismissWelcomeTour;

})();
