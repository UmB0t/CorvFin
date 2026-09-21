/* ==========================================================================
   MÓDULO DE RELATÓRIOS FINANCEIROS V2 — SHELL DE VISUALIZAÇÃO (reportsView.js)
   Finanças Pro - Vanilla JS Architecture
   Fase R3: Module Shell, Navigation & Access Integration
   ========================================================================== */

(function () {
  'use strict';

  let _initialized = false;

  /**
   * Inicialização do módulo de relatórios (executada uma única vez).
   */
  function initReportsView() {
    if (_initialized) return;
    _initialized = true;
  }

  /**
   * Renderizador oficial da aba tab-reports.
   * Na Fase R3, o shell visual estático reside no container #tab-reports do index.html.
   * Esta função é estritamente idempotente, não provoca fetches prematuros nem side-effects destrutivos.
   */
  function renderReportsTab() {
    initReportsView();

    const container = document.getElementById('tab-reports');
    if (!container) return;

    // Se o shell interno não estiver presente (ex.: após reset de container), garante sua integridade
    const shellCard = container.querySelector('.reports-shell-card');
    if (!shellCard) {
      container.innerHTML = `
        <div class="reports-shell-container" style="max-width: 1200px; margin: 0 auto; padding: 24px 16px;">
          <div class="card section-card full-width reports-shell-card" style="padding: 48px 24px; text-align: center; border-radius: 16px; background: var(--surface);">
            <div style="width: 72px; height: 72px; border-radius: 50%; background: var(--brand-soft); color: var(--brand); display: inline-flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
              <svg class="svg-icon" viewBox="0 0 24 24" style="width: 36px; height: 36px; stroke-width: 2;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text); margin: 0 0 8px;">Relatórios Financeiros</h2>
            <p style="font-size: 0.95rem; color: var(--muted); max-width: 520px; margin: 0 auto 16px; line-height: 1.6;">
              Analise sua evolução financeira e entenda para onde seu dinheiro está indo.
            </p>
            <div class="reports-shell-status" style="display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--line); font-size: 0.84rem; color: var(--muted); font-weight: 600;">
              <span>Seus relatórios financeiros consolidados serão exibidos aqui.</span>
            </div>
          </div>
        </div>
      `;
    }
  }

  // Exportação canônica para o ciclo de vida global
  window.renderReportsTab = renderReportsTab;
})();
