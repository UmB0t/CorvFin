/* ==========================================================================
   MÓDULO DE UI SHELL, NAVEGAÇÃO & MODAIS BASE (uiShell.js)
   Finanças Pro - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  function applyTheme() {
    const state = getState();
    document.documentElement.setAttribute('data-theme', state.theme);
    $('#themeBtn').innerHTML = state.theme === 'dark' ? ICONS.sun : ICONS.moon;
  }

  function applySidebarState() {
    const state = getState();
    const sidebar = $('#sidebar');
    if (!sidebar) return;
    const btn = $('#toggleSidebarBtn');
    if (state.sidebarCollapsed) {
      sidebar.classList.add('collapsed');
      if (btn) {
        btn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`;
        btn.setAttribute('data-tooltip', 'Expandir Menu');
        btn.removeAttribute('title');
      }
    } else {
      sidebar.classList.remove('collapsed');
      if (btn) {
        btn.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>`;
        btn.setAttribute('data-tooltip', 'Recolher Menu');
        btn.removeAttribute('title');
      }
    }
  }

  function fillMonthSelects() {
    const state = getState();
    const optionsHtml = MONTH_NAMES.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');
    ['#fixedEffMonth', '#varStartMonth', '#varEndMonth', '#extraStartMonth', '#extraEndMonth', '#debtorStartMonth', '#debtorEndMonth', '#aporteMonth', '#benefitMonth', '#convertVarStartMonth', '#convertVarEndMonth'].forEach(id => {
      const el = $(id);
      if (el) {
        const cur = el.value;
        el.innerHTML = optionsHtml;
        if (cur) el.value = cur;
      }
    });

    const baseYear = state.year || new Date().getFullYear();
    const years = [];
    for (let y = baseYear - 4; y <= baseYear + 10; y++) {
      years.push(y);
    }
    const yearOpts = years.map(y => `<option value="${y}">${y}</option>`).join('');
    ['#fixedEffYear', '#varStartYear', '#varEndYear', '#extraStartYear', '#extraEndYear', '#debtorStartYear', '#debtorEndYear', '#aporteYear', '#benefitYear', '#convertVarStartYear', '#convertVarEndYear'].forEach(id => {
      const el = $(id);
      if (el) {
        const cur = el.value;
        el.innerHTML = yearOpts;
        if (cur) el.value = cur;
      }
    });
  }

  function initTabs() {
    const toggleBtn = $('#toggleSidebarBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const state = getState();
        state.sidebarCollapsed = !state.sidebarCollapsed;
        saveState();
        applySidebarState();
      });
    }

    const user = JSON.parse(localStorage.getItem('user_data') || localStorage.getItem('user') || '{}');
    const isAdmin = !!user.is_admin;
    const sidebarAdminLink = $('#sidebarAdminLink');
    if (sidebarAdminLink) {
      sidebarAdminLink.style.display = isAdmin ? 'flex' : 'none';
    }

    const titleMap = {
      'tab-expenses': 'Despesas',
      'tab-extras': 'Rendas Extras',
      'tab-debtors': 'Devedores & Cobranças',
      'tab-investments': 'Investimentos & Metas',
      'tab-benefits': 'Benefícios',
      'tab-simulation': 'Simulador de Cenários & Novas Despesas',
      'tab-profile': 'Perfil & Categorias',
      'tab-admin': 'Painel Administrativo'
    };
    const subMap = {
      'tab-expenses': 'Gestão financeira pessoal com devedores e rendas extras',
      'tab-extras': 'Gerenciamento de fontes adicionais de receita e trabalhos pontuais',
      'tab-debtors': 'Controle de valores a receber, parcelas e cobranças de terceiros',
      'tab-investments': 'Acompanhamento de patrimônio, aportes e metas financeiras',
      'tab-benefits': 'Controle de benefícios corporativos e gastos compartilhados',
      'tab-simulation': 'Projete o impacto de novos gastos e parcelamentos sem alterar seus dados reais',
      'tab-profile': 'Configuração de perfil, salário base, categorias e destinos',
      'tab-admin': 'Gerenciamento de usuários e permissões do sistema'
    };

    const navLinks = $$('.sidebar-link[data-tab]');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = link.getAttribute('data-tab') || link.dataset.tab;
        if (!tabId) return;

        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const tabContents = $$('.tab-content');
        tabContents.forEach(c => {
          const isTarget = (c.id === tabId);
          c.hidden = !isTarget;
          c.style.display = isTarget ? 'block' : 'none';
        });

        const titleEl = $('#pageTitle');
        const subEl = $('.page-sub') || $('#pageSub');
        if (titleEl) titleEl.textContent = titleMap[tabId] || (typeof TAB_TITLES !== 'undefined' && TAB_TITLES[tabId]) || 'Finanças Pro';
        if (subEl && subMap[tabId]) subEl.textContent = subMap[tabId];

        render();
      });
    });
  }

  function initDialogs() {
    $$('dialog').forEach(d => {
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
      d.addEventListener('close', () => {
        const t = $('#toast');
        if (t && t.parentElement === d) {
          try { document.body.appendChild(t); } catch (_) { }
        }
      });
    });
    $$('[data-close]').forEach(b => b.addEventListener('click', () => {
      const targetDlg = $(`#${b.dataset.close}`);
      if (targetDlg && typeof targetDlg.close === 'function') targetDlg.close();
    }));
  }

  function openInfo() {
    dismissWelcomeTour();
    $('#infoDialog').showModal();
  }

  // Listener exclusivo de abertura do diálogo institucional
  $('#infoBtn')?.addEventListener('click', openInfo);

  // APIs públicas do Módulo de UI Shell
  window.applyTheme = applyTheme;
  window.applySidebarState = applySidebarState;
  window.fillMonthSelects = fillMonthSelects;
  window.initTabs = initTabs;
  window.initDialogs = initDialogs;

})();
