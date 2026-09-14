/* ==========================================================================
   CENTRAL DE RELEASE NOTES / ATUALIZAÇÕES (releaseNotes.js)
   CorvFin - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  // Catálogo Central Estático de Releases do CorvFin
  // Histórico pré-lançamento resetado para início oficial a partir do lançamento
  const RELEASES_CATALOG = [];

  function getReleaseNotesCatalog() {
    return RELEASES_CATALOG;
  }

  function getLatestReleaseVersion() {
    return RELEASES_CATALOG.length > 0 ? RELEASES_CATALOG[0].version : null;
  }

  function hasUnreadReleaseNotes() {
    const catalog = getReleaseNotesCatalog();
    if (!catalog || catalog.length === 0) return false;
    const latestVersion = getLatestReleaseVersion();
    if (!latestVersion) return false;
    if (typeof getState !== 'function') return false;
    const state = getState();
    const readList = Array.isArray(state.readReleases) ? state.readReleases : [];
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
    const targetVersion = version || getLatestReleaseVersion();
    if (!targetVersion) {
      updateReleaseNotesBadge();
      return;
    }
    if (typeof getState !== 'function') return;
    const state = getState();
    state.readReleases = Array.isArray(state.readReleases) ? state.readReleases : [];

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
    if (!catalog || catalog.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="text-align:center; padding:36px 16px; color:var(--muted);">
          <div style="font-size:2.2rem; margin-bottom:12px; opacity:0.85;">✨</div>
          <h3 style="font-size:1.15rem; font-weight:800; color:var(--text); margin:0 0 8px 0;">Novidades em breve</h3>
          <p style="font-size:0.88rem; color:var(--muted); margin:0; line-height:1.5;">O histórico de atualizações estará disponível aqui a partir do lançamento oficial do CorvFin.</p>
        </div>
      `;
      return;
    }

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
