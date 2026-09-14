/**
 * CORVFIN — PRE-LAUNCH HOUSEKEEPING
 * SUÍTE DE TESTES: tests/release_notes_prelaunch.test.js
 * RESET DE RELEASE NOTES PARA LANÇAMENTO OFICIAL
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const releaseNotesJs = fs.readFileSync(path.join(__dirname, '../public/js/core/releaseNotes.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

// Mock DOM element para testes unitários em vm
class MockElement {
  constructor(tagName, id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.style = {};
    this.hidden = false;
    this.innerHTML = '';
    this.textContent = '';
    this.dataset = {};
    this._listeners = {};
  }

  getAttribute(name) { return this.attributes[name] ?? null; }
  setAttribute(name, val) { this.attributes[name] = String(val); }
  removeAttribute(name) { delete this.attributes[name]; }

  get classList() {
    const self = this;
    return {
      add(...classes) {
        const set = new Set((self.className || '').split(/\s+/).filter(Boolean));
        classes.forEach(c => set.add(c));
        self.className = Array.from(set).join(' ');
      },
      remove(...classes) {
        const set = new Set((self.className || '').split(/\s+/).filter(Boolean));
        classes.forEach(c => set.delete(c));
        self.className = Array.from(set).join(' ');
      },
      toggle(c, force) {
        const set = new Set((self.className || '').split(/\s+/).filter(Boolean));
        let res;
        if (force !== undefined) {
          if (force) set.add(c); else set.delete(c);
          res = force;
        } else {
          if (set.has(c)) { set.delete(c); res = false; }
          else { set.add(c); res = true; }
        }
        self.className = Array.from(set).join(' ');
        return res;
      },
      contains(c) {
        return (self.className || '').split(/\s+/).filter(Boolean).includes(c);
      }
    };
  }

  addEventListener(evt, fn) {
    if (!this._listeners[evt]) this._listeners[evt] = [];
    this._listeners[evt].push(fn);
  }

  dispatchEvent(evt) {
    const type = typeof evt === 'string' ? evt : evt.type;
    const fns = this._listeners[type] || [];
    fns.forEach(fn => fn.call(this, { target: this, preventDefault: () => {} }));
  }

  click() {
    this.dispatchEvent('click');
  }

  showModal() {
    this._modalOpen = true;
  }

  close() {
    this._modalOpen = false;
  }
}

describe('CORVFIN — PRE-LAUNCH HOUSEKEEPING: RESET DE RELEASE NOTES', () => {

  describe('1. Catálogo Estático e Ausência de Histórico Pré-Lançamento', () => {
    test('1.1 RELEASES_CATALOG é estritamente um array vazio', () => {
      assert.ok(releaseNotesJs.includes('const RELEASES_CATALOG = [];'), 'RELEASES_CATALOG deve ser inicializado como []');
    });

    test('1.2 Nenhum release pré-lançamento (3.0 a 3.7) permanece no código', () => {
      const forbiddenVersions = ['"3.7.0"', '"3.6.0"', '"3.5.0"', '"3.4.0"', '"3.3.0"', '"3.2.0"', '"3.1.0"', '"3.0.0"'];
      for (const v of forbiddenVersions) {
        assert.strictEqual(releaseNotesJs.includes(`version: ${v}`), false, `Não deve conter release pré-lançamento ${v}`);
      }
    });

    test('1.3 Nenhuma menção a OmniFin permanece no arquivo', () => {
      assert.strictEqual(releaseNotesJs.includes('OmniFin'), false, 'Não deve conter termos legados OmniFin');
    });
  });

  describe('2. Comportamento e Inicialização em Runtime (VM)', () => {
    let context;
    let badgeTop, badgeDrawer, btnTop, dialog, listContainer, closeBtn;

    beforeEach(() => {
      badgeTop = new MockElement('SPAN', 'releaseNotesBadge');
      badgeDrawer = new MockElement('SPAN', 'drawerReleaseNotesBadge');
      btnTop = new MockElement('BUTTON', 'releaseNotesBtn');
      dialog = new MockElement('DIALOG', 'releaseNotesDialog');
      listContainer = new MockElement('DIV', 'releaseNotesList');
      closeBtn = new MockElement('BUTTON', 'closeReleaseNotesBtn');

      const elements = {
        releaseNotesBadge: badgeTop,
        drawerReleaseNotesBadge: badgeDrawer,
        releaseNotesBtn: btnTop,
        releaseNotesDialog: dialog,
        releaseNotesList: listContainer,
        closeReleaseNotesBtn: closeBtn
      };

      const mockDoc = {
        readyState: 'complete',
        getElementById: (id) => elements[id] || null,
        addEventListener: () => {}
      };

      const mockState = {
        readReleases: []
      };

      context = {
        window: {},
        document: mockDoc,
        getState: () => mockState,
        saveState: () => {},
        escapeHtml: (s) => String(s || '')
      };
      context.window = context;

      vm.createContext(context);
      vm.runInContext(releaseNotesJs, context);
    });

    test('2.1 getReleaseNotesCatalog retorna array vazio', () => {
      const cat = context.getReleaseNotesCatalog();
      assert.ok(Array.isArray(cat), 'Deve ser array');
      assert.strictEqual(cat.length, 0, 'Deve ter length 0');
    });

    test('2.2 getLatestReleaseVersion retorna null e não inventa versão legada', () => {
      const v = context.getLatestReleaseVersion();
      assert.strictEqual(v, null, 'Versão mais recente deve ser null sem releases');
    });

    test('2.3 hasUnreadReleaseNotes retorna false (sem badges fantasmas)', () => {
      const unread = context.hasUnreadReleaseNotes();
      assert.strictEqual(unread, false, 'hasUnreadReleaseNotes deve retornar false com catálogo vazio');
    });

    test('2.4 updateReleaseNotesBadge esconde os badges de notificação', () => {
      context.updateReleaseNotesBadge();
      assert.strictEqual(badgeTop.hidden, true, 'badgeTop deve estar hidden');
      assert.strictEqual(badgeTop.style.display, 'none', 'badgeTop display deve ser none');
      assert.strictEqual(badgeDrawer.hidden, true, 'badgeDrawer deve estar hidden');
      assert.strictEqual(badgeDrawer.style.display, 'none', 'badgeDrawer display deve ser none');
      assert.strictEqual(btnTop.classList.contains('has-unread'), false, 'btnTop não deve ter classe has-unread');
    });

    test('2.5 renderReleaseNotesContent exibe mensagem de novidades em breve sem lançar erro', () => {
      context.renderReleaseNotesContent();
      assert.ok(listContainer.innerHTML.includes('Novidades em breve'), 'Deve exibir empty state Novidades em breve');
      assert.ok(listContainer.innerHTML.includes('CorvFin'), 'Deve mencionar CorvFin');
      assert.strictEqual(listContainer.innerHTML.includes('undefined'), false, 'Não deve conter undefined');
    });

    test('2.6 openReleaseNotesCenter abre modal e executa de forma limpa', () => {
      context.openReleaseNotesCenter();
      assert.strictEqual(dialog._modalOpen, true, 'Modal deve abrir ao chamar openReleaseNotesCenter');
      assert.ok(listContainer.innerHTML.includes('Novidades em breve'), 'Conteúdo do modal deve ter Novidades em breve');
    });

    test('2.7 markReleaseNotesAsRead não falha nem insere null quando não há releases', () => {
      context.markReleaseNotesAsRead();
      const state = context.getState();
      assert.strictEqual(state.readReleases.length, 0, 'Não deve adicionar entradas null no state');
    });
  });

  describe('3. Integridade dos Elementos no Shell (index.html)', () => {
    test('3.1 Botões e modais de Release Notes permanecem preservados no HTML', () => {
      assert.ok(indexHtml.includes('id="releaseNotesBtn"'), 'Deve conter #releaseNotesBtn');
      assert.ok(indexHtml.includes('id="releaseNotesBadge"'), 'Deve conter #releaseNotesBadge');
      assert.ok(indexHtml.includes('id="releaseNotesDialog"'), 'Deve conter #releaseNotesDialog');
      assert.ok(indexHtml.includes('id="drawerReleaseNotesBtn"'), 'Deve conter #drawerReleaseNotesBtn');
      assert.ok(indexHtml.includes('id="closeReleaseNotesBtn"'), 'Deve conter #closeReleaseNotesBtn');
      assert.ok(indexHtml.includes('id="releaseNotesList"'), 'Deve conter #releaseNotesList');
    });
  });

});
