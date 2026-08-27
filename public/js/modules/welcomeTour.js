/* ==========================================================================
   MÓDULO DE ONBOARDING & WELCOME TOUR (welcomeTour.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  function checkWelcomeTour() {
    const tourCompleted = localStorage.getItem('tour_manual_completed');
    const popover = document.getElementById('welcome-tour-popover') || document.getElementById('onboardingPopover');
    if (!popover) return;

    if (tourCompleted === 'true') {
      popover.style.display = 'none';
    } else {
      popover.style.display = 'block';
    }
  }

  function dismissWelcomeTour() {
    localStorage.setItem('tour_manual_completed', 'true');
    const popover = document.getElementById('welcome-tour-popover') || document.getElementById('onboardingPopover');
    if (popover) {
      popover.style.display = 'none';
    }
  }

  // Listener estático de dispensa do onboarding
  $('#btnDismissOnboarding')?.addEventListener('click', dismissWelcomeTour);

  // APIs públicas do Módulo de Onboarding
  window.checkWelcomeTour = checkWelcomeTour;
  window.dismissWelcomeTour = dismissWelcomeTour;
  window.checkOnboarding = checkWelcomeTour;
  window.dismissOnboarding = dismissWelcomeTour;

})();
