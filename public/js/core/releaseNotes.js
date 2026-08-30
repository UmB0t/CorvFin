/* ==========================================================================
   CENTRAL DE RELEASE NOTES / ATUALIZAÇÕES (releaseNotes.js)
   OmniFin V3 - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  // Catálogo Central Estático de Releases do OmniFin
  const RELEASES_CATALOG = [
    {
      version: "3.1.0",
      date: "30/08/2026",
      tag: "Mais Recente",
      isLatest: true,
      title: "Perfil, Simulações e melhorias de experiência",
      summary: "Nova central de personalização de categorias, simulações salvas para projeções financeiras isoladas e refinamentos visuais no design system.",
      news: [
        "Ícones outline configuráveis para Categorias (transporte, moradia, alimentação, saúde, etc.).",
        "Simulações Salvas: salve e recupere múltiplos cenários de gastos sem impactar seus dados reais.",
        "Seleção de Ano em Simulação: navegue e projete cenários futuros ano a ano com facilidade.",
        "Central de Atualizações / Release Notes integrada na barra superior."
      ],
      improvements: [
        "Carregamento e sincronização instantânea de dados do Perfil e Benefícios do MongoDB.",
        "Tooltips inteligentes: balões informativos com proteção de viewport e suporte a foco/teclado.",
        "Aprimoramento visual e proteção contra duplo clique no botão 'Pagar Tudo'."
      ],
      fixes: [
        "Fila linear de persistência de dados prevenindo falsos alertas de concorrência.",
        "Ajustes de responsividade e renderização consistente em dispositivos móveis e desktop."
      ]
    },
    {
      version: "3.0.0",
      date: "15/08/2026",
      tag: "Versão Base",
      isLatest: false,
      title: "Lançamento da Plataforma OmniFin V3",
      summary: "Nova arquitetura modular com MongoDB, alta performance, controle de concorrência e design system refinado.",
      news: [
        "Nova interface com suporte a tema claro e escuro (tokens HSL dinâmicos).",
        "Controle unificado de Despesas Fixas, Variáveis, Parcelamentos e Devedores.",
        "Gestão de Rendas Extras, Investimentos com metas e Lista de Compras interativa."
      ],
      improvements: [
        "Painel administrativo integrado para gestão de usuários, papéis e manutenção.",
        "Arquitetura SPA leve em Vanilla JS sem dependências pesadas."
      ],
      fixes: [
        "Migração definitiva do armazenamento legado de arquivos JSON locais para nuvem."
      ]
    }
  ];

  function getReleaseNotesCatalog() {
    return RELEASES_CATALOG;
  }

  function getLatestReleaseVersion() {
    return RELEASES_CATALOG.length > 0 ? RELEASES_CATALOG[0].version : "3.0.0";
  }

  function hasUnreadReleaseNotes() {
    if (typeof getState !== 'function') return false;
    const state = getState();
    const readList = Array.isArray(state.readReleases) ? state.readReleases : [];
    const latestVersion = getLatestReleaseVersion();
    return !readList.includes(latestVersion);
  }

  function updateReleaseNotesBadge() {
    const unread = hasUnreadReleaseNotes();
    const badgeTop = document.getElementById('releaseNotesBadge');
    const badgeDrawer = document.getElementById('drawerReleaseNotesBadge');
    const btnTop = document.getElementById('releaseNotesBtn');

    if (badgeTop) {
      badgeTop.hidden = !unread;
      badgeTop.style.display = unread ? 'inline-block' : 'none';
    }
    if (badgeDrawer) {
      badgeDrawer.hidden = !unread;
      badgeDrawer.style.display = unread ? 'inline-block' : 'none';
    }
    if (btnTop) {
      btnTop.classList.toggle('has-unread', unread);
    }
  }

  async function markReleaseNotesAsRead(version = null) {
    if (typeof getState !== 'function') return;
    const state = getState();
    state.readReleases = Array.isArray(state.readReleases) ? state.readReleases : [];

    const targetVersion = version || getLatestReleaseVersion();
    if (!state.readReleases.includes(targetVersion)) {
      state.readReleases.push(targetVersion);
      updateReleaseNotesBadge();
      if (typeof saveState === 'function') {
        saveState('release-notes-read');
      }
    } else {
      updateReleaseNotesBadge();
    }
  }

  function renderReleaseNotesContent() {
    const container = document.getElementById('releaseNotesList');
    if (!container) return;

    const catalog = getReleaseNotesCatalog();
    const state = (typeof getState === 'function') ? getState() : { readReleases: [] };
    const readList = Array.isArray(state.readReleases) ? state.readReleases : [];

    container.innerHTML = catalog.map((rel) => {
      const isRead = readList.includes(rel.version);

      const renderSection = (title, items, badgeClass, iconSvg) => {
        if (!items || items.length === 0) return '';
        return `
          <div class="release-sub-section" style="margin-top:12px;">
            <div style="display:flex; align-items:center; gap:6px; font-weight:800; font-size:.84rem; color:var(--text); margin-bottom:6px;">
              <span class="badge ${badgeClass}" style="font-size:.7rem; padding:2px 8px; border-radius:6px; text-transform:uppercase;">
                ${title}
              </span>
            </div>
            <ul style="margin:0; padding-left:18px; font-size:.85rem; color:var(--text); line-height:1.5;">
              ${items.map(it => `<li style="margin-bottom:4px;">${escapeHtml(it)}</li>`).join('')}
            </ul>
          </div>
        `;
      };

      return `
        <article class="release-card ${rel.isLatest ? 'is-latest' : ''}" style="background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:18px; margin-bottom:16px; box-shadow:0 2px 8px rgba(0,0,0,0.04); position:relative;">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:8px; border-bottom:1px solid var(--line); padding-bottom:12px; margin-bottom:12px;">
            <div>
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span class="tag" style="background:var(--brand); color:#ffffff; font-weight:850; font-size:.85rem; padding:4px 10px; border-radius:8px;">
                  v${escapeHtml(rel.version)}
                </span>
                <span style="font-size:.8rem; color:var(--muted); font-weight:700;">
                  📅 ${escapeHtml(rel.date)}
                </span>
                ${rel.isLatest ? `
                  <span class="badge success" style="font-size:.72rem; padding:3px 8px; border-radius:999px; font-weight:800;">
                    ${escapeHtml(rel.tag || 'Mais Recente')}
                  </span>
                ` : ''}
                ${!isRead ? `
                  <span class="badge warning" style="font-size:.7rem; padding:2px 6px; border-radius:999px;">
                    Novo
                  </span>
                ` : ''}
              </div>
              <h3 style="margin:8px 0 4px 0; font-size:1.15rem; font-weight:850; color:var(--text);">
                ${escapeHtml(rel.title)}
              </h3>
              <p style="margin:0; font-size:.86rem; color:var(--muted); line-height:1.4;">
                ${escapeHtml(rel.summary)}
              </p>
            </div>
          </div>

          ${renderSection('Novidades', rel.news, 'success')}
          ${renderSection('Melhorias', rel.improvements, 'info')}
          ${renderSection('Correções', rel.fixes, 'warning')}
        </article>
      `;
    }).join('');
  }

  function openReleaseNotesCenter() {
    renderReleaseNotesContent();
    const dialog = document.getElementById('releaseNotesDialog');
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
      // Marca a versão mais recente como lida ao abrir a central
      markReleaseNotesAsRead();
    }
  }

  function initReleaseNotesModule() {
    const btnTop = document.getElementById('releaseNotesBtn');
    if (btnTop && !btnTop.dataset.relBound) {
      btnTop.dataset.relBound = 'true';
      btnTop.addEventListener('click', (e) => {
        e.preventDefault();
        openReleaseNotesCenter();
      });
    }

    const btnDrawer = document.getElementById('drawerReleaseNotesBtn');
    if (btnDrawer && !btnDrawer.dataset.relBound) {
      btnDrawer.dataset.relBound = 'true';
      btnDrawer.addEventListener('click', (e) => {
        e.preventDefault();
        const drawerOverlay = document.getElementById('mobileDrawerOverlay');
        if (drawerOverlay) drawerOverlay.classList.remove('open');
        openReleaseNotesCenter();
      });
    }

    const closeBtn = document.getElementById('closeReleaseNotesBtn');
    if (closeBtn && !closeBtn.dataset.relBound) {
      closeBtn.dataset.relBound = 'true';
      closeBtn.addEventListener('click', () => {
        const dialog = document.getElementById('releaseNotesDialog');
        if (dialog) dialog.close();
      });
    }

    updateReleaseNotesBadge();
  }

  // Bridges públicas autorizadas
  window.getReleaseNotesCatalog = getReleaseNotesCatalog;
  window.getLatestReleaseVersion = getLatestReleaseVersion;
  window.hasUnreadReleaseNotes = hasUnreadReleaseNotes;
  window.updateReleaseNotesBadge = updateReleaseNotesBadge;
  window.markReleaseNotesAsRead = markReleaseNotesAsRead;
  window.openReleaseNotesCenter = openReleaseNotesCenter;
  window.renderReleaseNotesContent = renderReleaseNotesContent;
  window.initReleaseNotesModule = initReleaseNotesModule;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReleaseNotesModule);
  } else {
    initReleaseNotesModule();
  }
})();
