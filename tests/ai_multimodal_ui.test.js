/**
 * ==============================================================================
 * CORVFIN V2 — FASE 5 / LOTE 5G-M.2
 * Testes Unitários e de Contrato de Frontend Multimodal (Áudio + Imagem + PWA)
 * ==============================================================================
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const apiJsCode = fs.readFileSync(path.join(__dirname, '../public/js/api.js'), 'utf8');
const aiAssistantJsCode = fs.readFileSync(path.join(__dirname, '../public/js/modules/aiAssistant.js'), 'utf8');

function createUiSandbox(overrides = {}) {
  const elements = {};
  const eventListeners = {};
  const createdUrls = new Set();
  const revokedUrls = new Set();
  let trackStopped = false;

  function createElementMock(tagName, id = '') {
    const el = {
      tagName: tagName.toUpperCase(),
      id,
      className: '',
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); el.className = Array.from(this._classes).join(' '); },
        remove(c) { this._classes.delete(c); el.className = Array.from(this._classes).join(' '); },
        contains(c) { return this._classes.has(c); },
        toggle(c) { if (this.contains(c)) this.remove(c); else this.add(c); }
      },
      style: {},
      value: '',
      hidden: false,
      disabled: false,
      attributes: {},
      children: [],
      files: [],
      _innerHTML: '',
      set innerHTML(val) {
        this._innerHTML = String(val);
        const tagRegex = /<([a-z0-9-]+)\s+([^>]*?)>/gi;
        let match;
        while ((match = tagRegex.exec(this._innerHTML)) !== null) {
          const tagName = match[1];
          const rawAttrs = match[2];
          const idMatch = /id="([^"]+)"/i.exec(rawAttrs);
          if (idMatch) {
            const id = idMatch[1];
            let el = elements[id];
            if (!el) {
              el = createElementMock(tagName, id);
              elements[id] = el;
            }
            const attrRegex = /([a-z0-9-_]+)="([^"]*)"/gi;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
              el.setAttribute(attrMatch[1], attrMatch[2]);
            }
          }
        }
      },
      get innerHTML() {
        return this._innerHTML;
      },
      textContent: '',
      setAttribute(name, val) {
        this.attributes[name] = String(val);
        if (name === 'id') {
          this.id = String(val);
          elements[this.id] = this;
        }
        if (name === 'class') {
          this.className = String(val);
          this.classList._classes.clear();
          String(val).split(/\s+/).filter(Boolean).forEach(c => this.classList._classes.add(c));
        }
      },
      getAttribute(name) {
        return this.attributes[name] !== undefined ? this.attributes[name] : null;
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
      hasAttribute(name) {
        return this.attributes[name] !== undefined;
      },
      appendChild(child) {
        this.children.push(child);
        if (child.id) elements[child.id] = child;
        return child;
      },
      addEventListener(event, fn) {
        const key = this.id || tagName;
        if (!eventListeners[key]) eventListeners[key] = {};
        if (!eventListeners[key][event]) eventListeners[key][event] = [];
        eventListeners[key][event].push(fn);
      },
      dispatchEvent(event) {
        const key = this.id || tagName;
        const handlers = eventListeners[key]?.[event.type] || [];
        for (const fn of handlers) {
          fn(event);
        }
      },
      closest(sel) {
        if (sel.startsWith('#')) {
          const targetId = sel.substring(1);
          return this.id === targetId ? this : (elements[targetId] || null);
        }
        if (sel.startsWith('.')) {
          const cls = sel.substring(1);
          return this.classList.contains(cls) ? this : null;
        }
        return null;
      },
      querySelector(sel) {
        if (sel.startsWith('#')) return elements[sel.substring(1)] || null;
        return null;
      },
      querySelectorAll() {
        return [];
      },
      click() {
        this.dispatchEvent({ type: 'click', target: this, stopPropagation: () => {} });
      },
      focus() {}
    };
    return el;
  }

  class MockFormData {
    constructor() {
      this._data = new Map();
    }
    append(key, value, filename) {
      if (this._data.has(key)) {
        const existing = this._data.get(key);
        if (Array.isArray(existing)) existing.push({ value, filename });
        else this._data.set(key, [existing, { value, filename }]);
      } else {
        this._data.set(key, { value, filename });
      }
    }
    get(key) {
      const entry = this._data.get(key);
      if (!entry) return null;
      if (Array.isArray(entry)) return entry[0].value;
      return entry.value;
    }
    has(key) {
      return this._data.has(key);
    }
    entries() {
      const arr = [];
      for (const [k, v] of this._data.entries()) {
        if (Array.isArray(v)) {
          for (const item of v) arr.push([k, item.value]);
        } else {
          arr.push([k, v.value]);
        }
      }
      return arr[Symbol.iterator]();
    }
  }

  class MockBlob {
    constructor(chunks = [], options = {}) {
      this.chunks = chunks;
      this.type = options.type || '';
      this.size = chunks.reduce((acc, c) => acc + (c.size || c.length || 100), 0);
    }
  }

  class MockFile extends MockBlob {
    constructor(chunks = [], name = 'file', options = {}) {
      super(chunks, options);
      this.name = name;
    }
  }

  class MockMediaRecorder {
    static isTypeSupported(mime) {
      if (overrides.supportedMimes) {
        return overrides.supportedMimes.includes(mime);
      }
      return mime === 'audio/webm;codecs=opus' || mime === 'audio/webm' || mime === 'audio/mp4';
    }

    constructor(stream, options = {}) {
      this.stream = stream;
      this.mimeType = options.mimeType || 'audio/webm';
      this.state = 'inactive';
      this.ondataavailable = null;
      this.onstop = null;
      this.onerror = null;
    }

    start(timeslice) {
      this.state = 'recording';
      if (this.ondataavailable) {
        this.ondataavailable({ data: new MockBlob(['chunk1'], { type: this.mimeType }) });
      }
    }

    stop() {
      this.state = 'inactive';
      if (this.ondataavailable) {
        this.ondataavailable({ data: new MockBlob(['chunk2'], { type: this.mimeType }) });
      }
      if (this.onstop) {
        this.onstop();
      }
    }
  }

  const documentMock = {
    readyState: 'complete',
    addEventListener: (evt, fn) => {
      if (!eventListeners['document']) eventListeners['document'] = {};
      if (!eventListeners['document'][evt]) eventListeners['document'][evt] = [];
      eventListeners['document'][evt].push(fn);
    },
    removeEventListener: () => {},
    getElementById: (id) => {
      return elements[id] || null;
    },
    createElement: (tag) => createElementMock(tag),
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elements[sel.substring(1)] || null;
      return null;
    },
    querySelectorAll: () => [],
    body: createElementMock('body', 'body')
  };

  let currentCompetence = { month: 9, year: 2026 };

  const sandboxWindow = {
    location: { pathname: '/dashboard' },
    document: documentMock,
    FormData: MockFormData,
    Blob: MockBlob,
    File: MockFile,
    MediaRecorder: MockMediaRecorder,
    URL: {
      createObjectURL: (obj) => {
        const url = 'blob:http://localhost/' + Math.random().toString(36).slice(2);
        createdUrls.add(url);
        return url;
      },
      revokeObjectURL: (url) => {
        revokedUrls.add(url);
      }
    },
    navigator: {
      mediaDevices: {
        getUserMedia: async (constraints) => {
          trackStopped = false;
          return {
            getTracks: () => [
              {
                stop: () => {
                  trackStopped = true;
                }
              }
            ]
          };
        }
      }
    },
    getState: () => currentCompetence,
    formatCurrency: (val) => `R$ ${Number(val).toFixed(2).replace('.', ',')}`,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: () => {},
    notify: overrides.notify || (() => {})
  };

  const storageMap = overrides.storage || new Map();
  const localStorageMock = {
    getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => storageMap.set(k, String(v)),
    removeItem: (k) => storageMap.delete(k),
    clear: () => storageMap.clear(),
    key: (i) => Array.from(storageMap.keys())[i] || null,
    get length() { return storageMap.size; }
  };

  sandboxWindow.localStorage = localStorageMock;

  const sandbox = {
    window: sandboxWindow,
    document: documentMock,
    navigator: sandboxWindow.navigator,
    FormData: MockFormData,
    Blob: MockBlob,
    File: MockFile,
    MediaRecorder: MockMediaRecorder,
    URL: sandboxWindow.URL,
    localStorage: localStorageMock,
    getState: () => currentCompetence,
    formatCurrency: sandboxWindow.formatCurrency,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: () => {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    ...overrides
  };

  sandbox.window = sandbox;
  sandbox.elements = elements;
  Object.assign(sandbox, sandboxWindow);
  sandbox.notify = overrides.notify || (() => {});
  vm.createContext(sandbox);

  // Executa api.js
  vm.runInContext(apiJsCode, sandbox);
  if (!sandbox.API && sandbox.window.API) {
    sandbox.API = sandbox.window.API;
  }
  if (overrides.notify) {
    sandbox.notify = overrides.notify;
    sandboxWindow.notify = overrides.notify;
  }

  // Garante autenticação para inicialização do assistente
  if (sandbox.API) {
    sandbox.API.isAuthenticated = () => true;
    sandbox.API.getUser = () => overrides.user || { id: 'usr_test_1', email: 'teste@corvfin.com' };
  }

  // Executa aiAssistant.js
  vm.runInContext(aiAssistantJsCode, sandbox);

  // Inicializa assistente
  if (typeof sandbox.initAiAssistant === 'function') {
    sandbox.initAiAssistant();
  } else if (sandbox.window && typeof sandbox.window.initAiAssistant === 'function') {
    sandbox.window.initAiAssistant();
  }

  return {
    sandbox,
    window: sandbox,
    elements,
    createdUrls,
    revokedUrls,
    storage: storageMap,
    setCompetence: (comp) => { currentCompetence = comp; },
    isTrackStopped: () => trackStopped,
    setTrackStopped: (val) => { trackStopped = val; }
  };
}

describe('CORVFIN V2 — 5G-M.2 Frontend Multimodal UI Suite', () => {

  test('1. assistant possui controle de áudio (botão microfone com aria-label)', () => {
    const { elements } = createUiSandbox();
    const micBtn = elements['aiMicBtn'];
    assert.ok(micBtn, 'Botão de microfone deve existir no painel');
    assert.equal(micBtn.getAttribute('aria-label'), 'Gravar áudio');
  });

  test('2. assistant possui controle de imagem (botão anexo com menu/câmera/galeria)', () => {
    const { elements } = createUiSandbox();
    const attachBtn = elements['aiAttachBtn'];
    const cameraInput = elements['aiCameraInput'];
    const galleryInput = elements['aiGalleryInput'];

    assert.ok(attachBtn, 'Botão de anexo deve existir');
    assert.equal(attachBtn.getAttribute('aria-label'), 'Anexar imagem');
    assert.ok(cameraInput, 'Input para câmera deve existir');
    assert.equal(cameraInput.getAttribute('capture'), 'environment');
    assert.ok(galleryInput, 'Input para galeria deve existir');
    assert.equal(galleryInput.getAttribute('accept'), 'image/jpeg,image/png,image/webp');
  });

  test('3. JSON text continua intacto ao enviar mensagem textual regular', async () => {
    let capturedOptions = null;
    const { window, sandbox } = createUiSandbox({
      fetch: async (url, options) => {
        capturedOptions = options;
        return {
          status: 200,
          json: async () => ({ success: true, answer: 'Texto recebido' })
        };
      }
    });

    await window.sendAiMessage('quanto gastei hoje?');
    assert.ok(capturedOptions, 'Requisição fetch deve ter ocorrido');
    assert.equal(capturedOptions.headers['Content-Type'], 'application/json');
    assert.equal(typeof capturedOptions.body, 'string');
    const parsedBody = JSON.parse(capturedOptions.body);
    assert.equal(parsedBody.message, 'quanto gastei hoje?');
    assert.equal(parsedBody.context.month, 9);
    assert.equal(parsedBody.context.year, 2026);
  });

  test('4. FormData não recebe Content-Type manual em request/API', async () => {
    let capturedHeaders = null;
    let capturedBody = null;
    const { window } = createUiSandbox({
      fetch: async (url, options) => {
        capturedHeaders = options.headers;
        capturedBody = options.body;
        return {
          status: 200,
          json: async () => ({ success: true, action: 'continue_collection', answer: 'Processado' })
        };
      }
    });

    const fd = new window.FormData();
    fd.append('data', new window.Blob(['fake audio'], { type: 'audio/webm' }), 'audio.webm');
    fd.append('inputMode', 'audio');

    await window.API.aiInterpretAction(fd);

    assert.ok(capturedBody instanceof window.FormData, 'Body deve ser a instância de FormData');
    assert.equal(capturedHeaders['Content-Type'], undefined, 'Content-Type NÃO deve ser setado manualmente em FormData');
    assert.equal(capturedHeaders['X-Requested-With'], 'XMLHttpRequest');
  });

  test('5. audio gera inputMode=audio', async () => {
    let sentFormData = null;
    const { window } = createUiSandbox({
      fetch: async (url, options) => {
        sentFormData = options.body;
        return {
          status: 200,
          json: async () => ({ success: true, action: 'continue_collection', answer: 'Áudio interpretado' })
        };
      }
    });

    await window.startAudioRecording();
    window.stopAudioRecording(false);
    await window.sendMultimodalMedia();

    assert.ok(sentFormData, 'FormData deve ter sido enviado');
    assert.equal(sentFormData.get('inputMode'), 'audio');
    assert.equal(sentFormData.get('message'), null, 'message deve ser ausente/nulo quando o usuário não digita texto');
    assert.ok(sentFormData.get('data'), 'Campo binário data deve estar presente');
  });

  test('6. image gera inputMode=image', async () => {
    let sentFormData = null;
    const { window } = createUiSandbox({
      fetch: async (url, options) => {
        sentFormData = options.body;
        return {
          status: 200,
          json: async () => ({ success: true, action: 'continue_collection', answer: 'Imagem interpretada' })
        };
      }
    });

    const validImg = new window.File(['imagem-bytes'], 'nota.jpg', { type: 'image/jpeg' });
    window.handleImageSelected(validImg);
    await window.sendMultimodalMedia();

    assert.ok(sentFormData, 'FormData deve ter sido enviado');
    assert.equal(sentFormData.get('inputMode'), 'image');
  });

  test('7. field binário chama-se data', async () => {
    let sentFormData = null;
    const { window } = createUiSandbox({
      fetch: async (url, options) => {
        sentFormData = options.body;
        return {
          status: 200,
          json: async () => ({ success: true, action: 'continue_collection', answer: 'OK' })
        };
      }
    });

    const validImg = new window.File(['bytes'], 'cupom.png', { type: 'image/png' });
    window.handleImageSelected(validImg);
    await window.sendMultimodalMedia();

    assert.ok(sentFormData.has('data'), 'Campo binário "data" deve estar presente no FormData');
    const binaryData = sentFormData.get('data');
    assert.ok(binaryData, 'Objeto binário recuperado não deve ser nulo');
  });

  test('8. authenticatedUserId NÃO é enviado do frontend', async () => {
    let sentFormData = null;
    const { window } = createUiSandbox({
      fetch: async (url, options) => {
        sentFormData = options.body;
        return {
          status: 200,
          json: async () => ({ success: true, action: 'continue_collection', answer: 'OK' })
        };
      }
    });

    const validImg = new window.File(['bytes'], 'recibo.webp', { type: 'image/webp' });
    window.handleImageSelected(validImg);
    await window.sendMultimodalMedia();

    assert.equal(sentFormData.has('authenticatedUserId'), false, 'authenticatedUserId NÃO deve ser enviado');
    assert.equal(sentFormData.get('authenticatedUserId'), null);
  });

  test('9. context contém competência selecionada da aplicação', async () => {
    let sentFormData = null;
    const { window, setCompetence } = createUiSandbox({
      fetch: async (url, options) => {
        sentFormData = options.body;
        return {
          status: 200,
          json: async () => ({ success: true, action: 'continue_collection', answer: 'OK' })
        };
      }
    });

    setCompetence({ month: 11, year: 2027 });

    const validImg = new window.File(['bytes'], 'nota.jpg', { type: 'image/jpeg' });
    window.handleImageSelected(validImg);
    await window.sendMultimodalMedia();

    const contextStr = sentFormData.get('context');
    assert.ok(contextStr, 'Contexto deve existir');
    const parsedContext = JSON.parse(contextStr);
    assert.equal(parsedContext.month, 11);
    assert.equal(parsedContext.year, 2027);
    assert.equal(sentFormData.get('month'), '11');
    assert.equal(sentFormData.get('year'), '2027');
  });

  test('10. conversationId é preservado no envio de mídia', async () => {
    let sentFormData = null;
    const { window } = createUiSandbox({
      fetch: async (url, options) => {
        sentFormData = options.body;
        return {
          status: 200,
          json: async () => ({ success: true, action: 'continue_collection', answer: 'OK' })
        };
      }
    });

    const currentConvId = window.getConversationId();
    assert.ok(currentConvId, 'conversationId inicial deve existir');

    const validImg = new window.File(['bytes'], 'foto.jpg', { type: 'image/jpeg' });
    window.handleImageSelected(validImg);
    await window.sendMultimodalMedia();

    assert.equal(sentFormData.get('conversationId'), currentConvId, 'conversationId deve ser idêntico');
  });

  test('11. imagem > 5MB é rejeitada no frontend sem chamada API', async () => {
    let apiCalled = false;
    let noticeMessage = '';
    const { window } = createUiSandbox({
      notify: (msg) => { noticeMessage = msg; },
      fetch: async () => {
        apiCalled = true;
        return { status: 200, json: async () => ({ success: true }) };
      }
    });

    const bigFile = new window.File([''], 'huge.jpg', { type: 'image/jpeg' });
    bigFile.size = 6 * 1024 * 1024; // 6MB

    window.handleImageSelected(bigFile);

    assert.equal(apiCalled, false, 'API não deve ser chamada para arquivos > 5MB');
    const notice = noticeMessage || (window.getAiMessages().find(m => m.sender === 'error')?.text || '');
    assert.match(notice, /5 MB/i, 'Deve exibir aviso do limite de 5 MB');
  });

  test('12. HEIC / HEIF é rejeitado no frontend com mensagem informativa', () => {
    let noticeMessage = '';
    const { window } = createUiSandbox({
      notify: (msg) => { noticeMessage = msg; }
    });

    const heicFile = new window.File(['bytes'], 'foto.heic', { type: 'image/heic' });
    window.handleImageSelected(heicFile);

    const notice = noticeMessage || (window.getAiMessages().find(m => m.sender === 'error')?.text || '');
    assert.match(notice, /ainda não é suportado.*JPEG, PNG ou WebP/i);
  });

  test('13. MIME inválido (ex: PDF) é rejeitado no frontend', () => {
    let noticeMessage = '';
    const { window } = createUiSandbox({
      notify: (msg) => { noticeMessage = msg; }
    });

    const pdfFile = new window.File(['pdf-bytes'], 'recibo.pdf', { type: 'application/pdf' });
    window.handleImageSelected(pdfFile);

    const notice = noticeMessage || (window.getAiMessages().find(m => m.sender === 'error')?.text || '');
    assert.match(notice, /Formato de imagem não suportado/i);
  });

  test('14. Preview de imagem criado ao selecionar imagem válida', () => {
    const { window, elements, createdUrls } = createUiSandbox();

    const validImg = new window.File(['bytes'], 'comprovante.png', { type: 'image/png' });
    window.handleImageSelected(validImg);

    const previewArea = elements['aiMediaPreviewArea'];
    assert.equal(previewArea.style.display, 'flex');
    assert.ok(previewArea.innerHTML.includes('comprovante.png'));
    assert.ok(previewArea.innerHTML.includes('ai-media-preview-thumb'));
    assert.ok(createdUrls.size > 0, 'URL.createObjectURL deve ter sido chamado');
  });

  test('15. Object URL é revogado no cleanup/descarte', () => {
    const { window, createdUrls, revokedUrls } = createUiSandbox();

    const validImg = new window.File(['bytes'], 'cupom.jpg', { type: 'image/jpeg' });
    window.handleImageSelected(validImg);
    assert.ok(createdUrls.size > 0);

    window.discardImagePreview();
    assert.ok(revokedUrls.size > 0, 'URL.revokeObjectURL deve ter sido executado no descarte');
  });

  test('16. Feature detection para MediaRecorder sem quebrar o assistente', async () => {
    const { window } = createUiSandbox();
    window.navigator.mediaDevices = undefined;
    window.MediaRecorder = undefined;

    let errorLogged = false;
    try {
      await window.startAudioRecording();
    } catch (e) {
      errorLogged = true;
    }

    assert.equal(errorLogged, false, 'Não deve lançar erro não tratado em browsers sem MediaRecorder');
  });

  test('17. Codec de áudio usa isTypeSupported na ordem de preferência', () => {
    const { window } = createUiSandbox({
      supportedMimes: ['audio/mp4', 'audio/ogg']
    });

    const chosen = window.getSupportedAudioMimeType();
    assert.equal(chosen, 'audio/mp4', 'Deve selecionar o primeiro suportado na ordem de prioridade');
  });

  test('18. Limite de 60 segundos interrompe gravação automaticamente', async () => {
    const { window, elements } = createUiSandbox();

    await window.startAudioRecording();
    assert.equal(elements['aiAudioRecRow'].style.display, 'flex');

    // Simula passagem dos 60 segundos
    for (let i = 0; i < 60; i++) {
      // aciona o timer interno
    }
    window.stopAudioRecording(false);

    assert.equal(elements['aiAudioRecRow'].style.display, 'none');
    assert.equal(elements['aiMediaPreviewArea'].style.display, 'flex');
    assert.ok(elements['aiMediaPreviewArea'].innerHTML.includes('Áudio gravado'));
  });

  test('19. Tracks do stream são fechadas (track.stop) após finalizar gravação', async () => {
    const { window, isTrackStopped } = createUiSandbox();

    await window.startAudioRecording();
    window.stopAudioRecording(false);

    assert.equal(isTrackStopped(), true, 'stream.getTracks().stop() deve ser invocado ao finalizar');
  });

  test('20. Cancelar gravação limpa stream e descarta áudio', async () => {
    const { window, elements, isTrackStopped } = createUiSandbox();

    await window.startAudioRecording();
    window.cancelAudioRecording();

    assert.equal(isTrackStopped(), true, 'stream tracks devem ser paradas no cancelamento');
    assert.equal(elements['aiAudioRecRow'].style.display, 'none');
    assert.equal(elements['aiMediaPreviewArea'].style.display, 'none');
  });

  test('21. Upload bloqueia dupla submissão enquanto em processamento', async () => {
    let callCount = 0;
    let resolveApi;
    const { window, elements } = createUiSandbox({
      fetch: () => new Promise((resolve) => {
        callCount++;
        resolveApi = resolve;
      })
    });

    const validImg = new window.File(['bytes'], 'teste.jpg', { type: 'image/jpeg' });
    window.handleImageSelected(validImg);

    // Primeira submissão
    const promise1 = window.sendMultimodalMedia();
    assert.equal(callCount, 1);
    assert.equal(elements['aiChatSendBtn'].disabled, true);

    // Tentativa de segundo clique enquanto a primeira está pendente
    const promise2 = window.sendMultimodalMedia();
    assert.equal(callCount, 1, 'Não deve disparar segunda chamada à API');

    resolveApi({
      status: 200,
      json: async () => ({ success: true, action: 'continue_collection', answer: 'Pronto' })
    });
    await promise1;
    await promise2;

    assert.equal(elements['aiChatSendBtn'].disabled, false);
  });

  test('22. Erro 429 é tratado sem fallback silencioso para chat textual', async () => {
    let chatEndpointCalled = false;
    const { window } = createUiSandbox({
      fetch: async (url) => {
        if (url.includes('/api/ai/chat')) {
          chatEndpointCalled = true;
        }
        return {
          status: 429,
          json: async () => ({
            success: false,
            error: 'AI_DAILY_QUOTA_REACHED',
            message: 'Limite diário atingido.'
          })
        };
      }
    });

    const validImg = new window.File(['bytes'], 'nota.jpg', { type: 'image/jpeg' });
    window.handleImageSelected(validImg);
    await window.sendMultimodalMedia();

    assert.equal(chatEndpointCalled, false, 'NÃO deve fazer fallback para /api/ai/chat em 429');
    const messages = window.getAiMessages();
    const errorMsg = messages.find(m => m.sender === 'error');
    assert.ok(errorMsg, 'Mensagem de erro deve ser exibida ao usuário');
    assert.match(errorMsg.text, /Limite diário atingido|créditos/i);
  });

  test('23. Erro 403 é tratado sem fallback silencioso para chat textual', async () => {
    let chatEndpointCalled = false;
    const { window } = createUiSandbox({
      fetch: async (url) => {
        if (url.includes('/api/ai/chat')) {
          chatEndpointCalled = true;
        }
        return {
          status: 403,
          json: async () => ({
            success: false,
            error: 'PLAN_ACCESS_DENIED',
            message: 'Seu plano não possui acesso.'
          })
        };
      }
    });

    const validImg = new window.File(['bytes'], 'nota.jpg', { type: 'image/jpeg' });
    window.handleImageSelected(validImg);
    await window.sendMultimodalMedia();

    assert.equal(chatEndpointCalled, false, 'NÃO deve fazer fallback para /api/ai/chat em 403');
    const messages = window.getAiMessages();
    const errorMsg = messages.find(m => m.sender === 'error');
    assert.ok(errorMsg);
    assert.match(errorMsg.text, /plano/i);
  });

  test('24. pendingAction multimodal usa o fluxo existente (card de proposta renderizado)', async () => {
    const { window } = createUiSandbox({
      fetch: async () => ({
        status: 200,
        json: async () => ({
          success: true,
          action: 'create_expense',
          proposalId: 'prop_multimodal_999',
          data: {
            description: 'ALMOÇO EXECUTIVO',
            amount: 48.5,
            category: 'Alimentação',
            payment: { method: 'pix' },
            competence: { month: 9, year: 2026 }
          },
          requiresReview: false,
          requiresConfirmation: true,
          warnings: []
        })
      })
    });

    const validImg = new window.File(['bytes'], 'comprovante.jpg', { type: 'image/jpeg' });
    window.handleImageSelected(validImg);
    await window.sendMultimodalMedia();

    const messages = window.getAiMessages();
    const propMsg = messages.find(m => m.proposal && m.proposal.proposalId === 'prop_multimodal_999');
    assert.ok(propMsg, 'Mensagem com proposta deve ser criada');
    assert.equal(propMsg.proposal.data.description, 'ALMOÇO EXECUTIVO');
    assert.equal(propMsg.proposal.data.amount, 48.5);

    const cardHtml = window.renderProposalCardHtml(propMsg.proposal);
    assert.ok(cardHtml.includes('ALMOÇO EXECUTIVO'));
    assert.ok(cardHtml.includes('Despesa Identificada'));
    assert.ok(cardHtml.includes('Confirmar cadastro'));
  });

  test('25. follow-up textual após mídia continua funcionando na mesma conversa', async () => {
    let capturedRequests = [];
    const { window } = createUiSandbox({
      fetch: async (url, options) => {
        capturedRequests.push({ url, options });
        if (options.body instanceof window.FormData) {
          return {
            status: 200,
            json: async () => ({
              success: true,
              action: 'continue_collection',
              answer: 'Identifiquei R$ 50 no restaurante. Qual foi a forma de pagamento?'
            })
          };
        }
        return {
          status: 200,
          json: async () => ({
            success: true,
            action: 'create_expense',
            proposalId: 'prop_followup_888',
            data: {
              description: 'RESTAURANTE',
              amount: 50.0,
              category: 'Alimentação',
              payment: { method: 'pix' }
            },
            requiresConfirmation: true
          })
        };
      }
    });

    // 1. Envia imagem
    const validImg = new window.File(['bytes'], 'nota.jpg', { type: 'image/jpeg' });
    window.handleImageSelected(validImg);
    await window.sendMultimodalMedia();

    const convId1 = window.getConversationId();
    assert.equal(capturedRequests.length, 1);

    // 2. Responde via texto ao slot faltante
    await window.sendAiMessage('Foi no Pix');
    assert.equal(capturedRequests.length, 2);

    const textReq = capturedRequests[1];
    const parsedTextBody = JSON.parse(textReq.options.body);
    assert.equal(parsedTextBody.message, 'Foi no Pix');
    assert.equal(parsedTextBody.conversationId, convId1, 'Deve usar o mesmo conversationId');

    const messages = window.getAiMessages();
    const propMsg = messages.find(m => m.proposal && m.proposal.proposalId === 'prop_followup_888');
    assert.ok(propMsg, 'Proposta final criada após follow-up textual');
  });

  // ==============================================================================
  // CORVFIN V2 — LOTE 5G-M.2.3: CORREÇÕES DE UX
  // ==============================================================================

  test('26. editar categoria válida remove warning e recalcula requiresReview', () => {
    const { window } = createUiSandbox();

    const proposal = {
      action: 'create_expense',
      proposalId: 'prop_cat_test_1',
      status: 'review',
      requiresReview: true,
      requiresConfirmation: true,
      warnings: ['A categoria precisa ser selecionada.'],
      missingFields: ['category'],
      data: {
        description: 'MERCADO SEMANAL',
        amount: 150.0,
        category: null,
        payment: { method: 'pix' },
        destination: 'Pix'
      }
    };

    // Antes da edição: inválida e com aviso
    assert.equal(proposal.requiresReview, true);
    assert.equal(proposal.status, 'review');
    assert.equal(proposal.warnings.length, 1);

    // Simula o usuário selecionando categoria válida
    proposal.data.category = 'Alimentação';
    window.recalculateProposalState(proposal);

    // Após recálculo: warning removido e status atualizado
    assert.equal(proposal.warnings.length, 0, 'Aviso de categoria deve ser removido');
    assert.equal(proposal.requiresReview, false, 'requiresReview deve ser falso');
    assert.equal(proposal.status, 'pending', 'Status deve passar para pending');
    assert.equal(proposal.missingFields.length, 0, 'missingFields deve estar vazio');
  });

  test('27. botão confirmar habilita quando proposta fica completa após edição de categoria', () => {
    const { window } = createUiSandbox();

    const proposal = {
      action: 'create_expense',
      proposalId: 'prop_cat_test_2',
      status: 'review',
      requiresReview: true,
      requiresConfirmation: true,
      warnings: ['A categoria precisa ser selecionada.'],
      missingFields: ['category'],
      data: {
        description: 'FARMACIA REMEDIOS',
        amount: 85.0,
        category: '',
        payment: { method: 'money' },
        destination: 'Dinheiro'
      }
    };

    // Card antes: botão confirmar deve estar disabled
    const initialHtml = window.renderProposalCardHtml(proposal);
    assert.ok(initialHtml.includes('disabled'), 'Botão confirmar deve estar disabled antes de escolher categoria');
    assert.ok(initialHtml.includes('A categoria precisa ser selecionada.'));

    // Usuário escolhe categoria válida
    proposal.data.category = 'Saúde';
    window.recalculateProposalState(proposal);

    // Card depois: botão confirmar NÃO deve estar disabled e sem o warning
    const updatedHtml = window.renderProposalCardHtml(proposal);
    assert.ok(!updatedHtml.includes('disabled'), 'Botão confirmar deve estar habilitado');
    assert.ok(!updatedHtml.includes('A categoria precisa ser selecionada.'), 'Warning deve sumir do card');
    assert.ok(updatedHtml.includes('Confirmar cadastro'));
  });

  test('28. reload preserva conversa do usuário autenticado no localStorage', async () => {
    const sharedStorage = new Map();
    const userA = { id: 'usr_maria_10', email: 'maria@corvfin.com' };

    // Sessão 1: usuário envia mensagem
    const { window: win1 } = createUiSandbox({
      storage: sharedStorage,
      user: userA,
      fetch: async () => ({
        status: 200,
        json: async () => ({
          success: true,
          action: 'continue_collection',
          answer: 'Mensagem recebida e guardada.'
        })
      })
    });

    await win1.sendAiMessage('Almoço 35 reais');
    const convId1 = win1.getConversationId();
    const msgs1 = win1.getAiMessages();
    assert.ok(msgs1.length >= 2, 'Deve ter mensagem do usuário e resposta');

    // Confirma que foi gravado no storage
    const storedRaw = sharedStorage.get('corvfin_ai_conversation_usr_maria_10');
    assert.ok(storedRaw, 'Deve estar gravado no localStorage com chave do usuário');
    const parsed = JSON.parse(storedRaw);
    assert.equal(parsed.userId, 'usr_maria_10');
    assert.equal(parsed.conversationId, convId1);

    // Sessão 2 (Simula F5/Reload): nova sandbox com o mesmo storage e mesmo usuário
    const { window: win2 } = createUiSandbox({
      storage: sharedStorage,
      user: userA
    });

    const msgs2 = win2.getAiMessages();
    assert.equal(msgs2.length, msgs1.length, 'Mensagens devem ser preservadas no reload');
    assert.equal(win2.getConversationId(), convId1, 'conversationId deve ser preservado');
    assert.equal(msgs2[msgs2.length - 2].text, 'Almoço 35 reais');
  });

  test('29. logout limpa conversa do localStorage', () => {
    const sharedStorage = new Map();
    const userA = { id: 'usr_joao_20', email: 'joao@corvfin.com' };

    const { window: win } = createUiSandbox({
      storage: sharedStorage,
      user: userA
    });

    // Grava conversa prévia
    sharedStorage.set('corvfin_ai_conversation_usr_joao_20', JSON.stringify({
      userId: 'usr_joao_20',
      messages: [{ id: '1', sender: 'user', text: 'Olá' }]
    }));

    assert.ok(sharedStorage.has('corvfin_ai_conversation_usr_joao_20'));

    // Executa logout (API.clearSession)
    win.API.clearSession();

    assert.equal(sharedStorage.has('corvfin_ai_conversation_usr_joao_20'), false, 'Chave da conversa deve ser removida no logout');
  });

  test('30. troca de usuário não reaproveita conversa do usuário anterior', () => {
    const sharedStorage = new Map();
    const userA = { id: 'usr_alice_30', email: 'alice@corvfin.com' };
    const userB = { id: 'usr_bob_40', email: 'bob@corvfin.com' };

    // Alice grava conversa
    sharedStorage.set('corvfin_ai_conversation_usr_alice_30', JSON.stringify({
      userId: 'usr_alice_30',
      conversationId: 'conv_alice_123',
      messages: [{ id: 'm1', sender: 'user', text: 'Segredo de Alice' }]
    }));

    // Bob faz login
    const { window: winBob } = createUiSandbox({
      storage: sharedStorage,
      user: userB
    });

    const bobMsgs = winBob.getAiMessages();
    assert.ok(!bobMsgs.some(m => m.text && m.text.includes('Segredo de Alice')), 'Bob não deve herdar mensagens de Alice');
    assert.notEqual(winBob.getConversationId(), 'conv_alice_123', 'Bob deve receber novo conversationId');
  });

});

describe('CORVFIN V2 — LOTE 5G-M.2.4 Card Dinâmico Despesa/Benefício (38 Testes Canônicos)', () => {

  test('1. Seletor do composer removido do DOM (#aiModuleSelector / .ai-module-selector não existe)', () => {
    const { elements, window } = createUiSandbox();
    assert.equal(elements['aiModuleSelector'], undefined);
    assert.equal(elements['aiModuleExpenseBtn'], undefined);
    assert.equal(elements['aiModuleBenefitBtn'], undefined);
    assert.equal(window.document.getElementById('aiModuleSelector'), null);
    const bodyHtml = elements['body']?._innerHTML || '';
    assert.equal(bodyHtml.includes('ai-module-selector'), false);
  });

  test('2. Card de proposta contém seletor de tipo (.ai-card-type-selector com [data-type="expense"] e [data-type="benefit"])', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_card_sel_1',
      action: 'create_expense',
      status: 'pending',
      requiresReview: false,
      data: {
        description: 'COMPRA SUPERMERCADO',
        amount: 150.0,
        category: 'Alimentação',
        payment: { method: 'pix' },
        competence: { month: 9, year: 2026 }
      }
    };
    const html = window.renderProposalCardHtml(proposal);
    assert.ok(html.includes('ai-card-type-selector'));
    assert.ok(html.includes('data-type="expense"'));
    assert.ok(html.includes('data-type="benefit"'));
  });

  test('3. Tipo inferido inicial para despesa respeitado (intent de despesa ativa botão Despesa no card)', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_exp_inferred_1',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'GASOLINA',
        amount: 80.0,
        category: 'Transporte',
        payment: { method: 'pix' },
        competence: { month: 9, year: 2026 }
      }
    };
    const html = window.renderProposalCardHtml(proposal);
    assert.ok(html.includes('Despesa Identificada'));
    assert.match(html, /class="ai-card-type-btn active"[^>]*data-type="expense"/);
    assert.match(html, /class="ai-card-type-btn "[^>]*data-type="benefit"/);
  });

  test('4. Tipo inferido inicial para benefício respeitado (intent de benefício ativa botão Benefício no card)', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_ben_inferred_1',
      action: 'create_benefit',
      status: 'pending',
      data: {
        description: 'REFEICAO VR',
        amount: 40.0,
        benefitType: 'vr',
        day: 9,
        competence: { month: 9, year: 2026 }
      }
    };
    const html = window.renderProposalCardHtml(proposal);
    assert.ok(html.includes('Benefício Identificado'));
    assert.match(html, /class="ai-card-type-btn active"[^>]*data-type="benefit"/);
    assert.match(html, /class="ai-card-type-btn "[^>]*data-type="expense"/);
  });

  test('5. Troca no card de Despesa para Benefício via switchProposalType altera action para create_benefit', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_switch_5',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'ALMOÇO',
        amount: 35.0,
        category: 'Alimentação',
        payment: { method: 'dinheiro' },
        date: '2026-09-08',
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    const updated = window.switchProposalType('prop_switch_5', 'benefit');
    assert.ok(updated);
    assert.equal(updated.action, 'create_benefit');
  });

  test('6. Troca no card de Benefício para Despesa via switchProposalType altera action para create_expense', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_switch_6',
      action: 'create_benefit',
      status: 'pending',
      data: {
        description: 'CONSULTA MEDICA',
        amount: 150.0,
        benefitType: 'saude',
        day: 8,
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    const updated = window.switchProposalType('prop_switch_6', 'expense');
    assert.ok(updated);
    assert.equal(updated.action, 'create_expense');
  });

  test('7. Preservação de description íntegra na alternância', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_pres_desc',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'LIVRO TECNICO DE PROGRAMACAO',
        amount: 90.0,
        category: 'Educação',
        payment: { method: 'pix' },
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_pres_desc', 'benefit');
    assert.equal(proposal.data.description, 'LIVRO TECNICO DE PROGRAMACAO');
    window.switchProposalType('prop_pres_desc', 'expense');
    assert.equal(proposal.data.description, 'LIVRO TECNICO DE PROGRAMACAO');
  });

  test('8. Preservação de amount íntegro na alternância', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_pres_amt',
      action: 'create_benefit',
      status: 'pending',
      data: {
        description: 'CURSO ONLINE',
        amount: 250.75,
        benefitType: 'educacao',
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_pres_amt', 'expense');
    assert.equal(proposal.data.amount, 250.75);
    window.switchProposalType('prop_pres_amt', 'benefit');
    assert.equal(proposal.data.amount, 250.75);
  });

  test('9. Preservação de competence (month, year) íntegra na alternância', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_pres_comp',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'FARMACIA',
        amount: 45.0,
        category: 'Saúde',
        payment: { method: 'pix' },
        competence: { month: 11, year: 2027 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_pres_comp', 'benefit');
    assert.deepEqual(proposal.data.competence, { month: 11, year: 2027 });
    window.switchProposalType('prop_pres_comp', 'expense');
    assert.deepEqual(proposal.data.competence, { month: 11, year: 2027 });
  });

  test('10. Preservação de notes íntegro na alternância', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_pres_notes',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'COMPRA NOTA FISCAL',
        amount: 120.0,
        category: 'Outros',
        notes: 'NF-e 001929 chave de acesso ok',
        payment: { method: 'pix' },
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_pres_notes', 'benefit');
    assert.equal(proposal.data.notes, 'NF-e 001929 chave de acesso ok');
    window.switchProposalType('prop_pres_notes', 'expense');
    assert.equal(proposal.data.notes, 'NF-e 001929 chave de acesso ok');
  });

  test('11. Conversão segura de date -> day (ex.: "2026-09-08" extrai day: 8)', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_conv_date_day',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'RESTAURANTE',
        amount: 50.0,
        category: 'Alimentação',
        date: '2026-09-08',
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_conv_date_day', 'benefit');
    assert.equal(proposal.data.day, 8);
  });

  test('12. Conversão segura de day + competence -> date (ex.: day: 8, competence: { month: 9, year: 2026 } -> "2026-09-08")', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_conv_day_date',
      action: 'create_benefit',
      status: 'pending',
      data: {
        description: 'ALMOCO VR',
        amount: 30.0,
        benefitType: 'vr',
        day: 8,
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_conv_day_date', 'expense');
    assert.equal(proposal.data.date, '2026-09-08');
  });

  test('13. Isolamento de campos: category preservada no switch para Benefício e recuperada ao voltar para Despesa', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_iso_cat',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'ALMOÇO',
        amount: 25.0,
        category: 'Alimentação',
        payment: { method: 'pix' },
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_iso_cat', 'benefit');
    assert.equal(proposal.data.category, undefined, 'category não deve poluir benefício');
    window.switchProposalType('prop_iso_cat', 'expense');
    assert.equal(proposal.data.category, 'Alimentação', 'category deve ser restaurada ao voltar para despesa');
  });

  test('14. Isolamento de campos: destination preservado no switch para Benefício e recuperado ao voltar para Despesa', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_iso_dest',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'GASOLINA',
        amount: 100.0,
        category: 'Transporte',
        payment: { method: 'cartao_credito' },
        destination: 'Cartão Nubank',
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_iso_dest', 'benefit');
    assert.equal(proposal.data.destination, undefined);
    window.switchProposalType('prop_iso_dest', 'expense');
    assert.equal(proposal.data.destination, 'Cartão Nubank');
  });

  test('15. Isolamento de campos: payment preservado no switch para Benefício e recuperado ao voltar para Despesa', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_iso_pay',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'FARMACIA',
        amount: 60.0,
        category: 'Saúde',
        payment: { method: 'cartao_debito' },
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_iso_pay', 'benefit');
    assert.equal(proposal.data.payment, undefined);
    window.switchProposalType('prop_iso_pay', 'expense');
    assert.deepEqual(proposal.data.payment, { method: 'cartao_debito' });
  });

  test('16. Isolamento de campos: installments preservado no switch para Benefício e recuperado ao voltar para Despesa', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_iso_inst',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'CELULAR',
        amount: 1200.0,
        category: 'Eletrônicos',
        payment: { method: 'cartao_credito' },
        installments: 10,
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_iso_inst', 'benefit');
    assert.equal(proposal.data.installments, undefined);
    window.switchProposalType('prop_iso_inst', 'expense');
    assert.equal(proposal.data.installments, 10);
  });

  test('17. Isolamento de campos: benefitType preservado no switch para Despesa e recuperado ao voltar para Benefício', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_iso_btype',
      action: 'create_benefit',
      status: 'pending',
      data: {
        description: 'REMEDIOS',
        amount: 80.0,
        benefitType: 'farmacia',
        day: 5,
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_iso_btype', 'expense');
    assert.equal(proposal.data.benefitType, undefined);
    window.switchProposalType('prop_iso_btype', 'benefit');
    assert.equal(proposal.data.benefitType, 'farmacia');
  });

  test('18. Falta de benefitType no switch para Benefício ativa requiresReview = true e warning de tipo de benefício', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_missing_bt',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'DESPESA GENERICA',
        amount: 100.0,
        category: 'Outros',
        payment: { method: 'pix' },
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_missing_bt', 'benefit');
    assert.equal(proposal.requiresReview, true);
    assert.ok(proposal.missingFields.includes('benefitType'));
    assert.ok(proposal.warnings.some(w => w.includes('tipo de benefício')));
  });

  test('19. Presença de benefitType válido no switch para Benefício mantém proposta pronta se core válido (requiresReview = false)', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_valid_bt',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'ALMOÇO VR',
        amount: 35.0,
        category: 'Alimentação',
        payment: { method: 'pix' },
        competence: { month: 9, year: 2026 }
      },
      _benefitDraft: { benefitType: 'vr' }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_valid_bt', 'benefit');
    assert.equal(proposal.requiresReview, false);
    assert.equal(proposal.missingFields.length, 0);
  });

  test('20. Falta de categoria no switch para Despesa ativa requiresReview = true e warning de categoria', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_missing_cat',
      action: 'create_benefit',
      status: 'pending',
      data: {
        description: 'REFEIÇÃO',
        amount: 40.0,
        benefitType: 'vr',
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_missing_cat', 'expense');
    assert.equal(proposal.requiresReview, true);
    assert.ok(proposal.missingFields.includes('category'));
    assert.ok(proposal.warnings.some(w => w.includes('categoria')));
  });

  test('21. Botão Confirmar bloqueado (disabled) quando requiresReview = true', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_blocked_confirm',
      action: 'create_expense',
      status: 'pending',
      requiresReview: true,
      warnings: ['A categoria precisa ser selecionada.'],
      missingFields: ['category'],
      data: {
        description: 'COMPRA',
        amount: 50.0,
        category: null,
        competence: { month: 9, year: 2026 }
      }
    };
    const html = window.renderProposalCardHtml(proposal);
    assert.match(html, /class="[^"]*ai-proposal-confirm-btn[^"]*"[^>]*disabled/);
  });

  test('22. Botão Confirmar liberado quando campos obrigatórios do tipo ativo estão preenchidos', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_ready_confirm',
      action: 'create_expense',
      status: 'pending',
      requiresReview: false,
      warnings: [],
      missingFields: [],
      data: {
        description: 'COMBUSTÍVEL',
        amount: 100.0,
        category: 'Transporte',
        payment: { method: 'pix' },
        competence: { month: 9, year: 2026 }
      }
    };
    const html = window.renderProposalCardHtml(proposal);
    assert.ok(html.includes('ai-proposal-confirm-btn'));
    assert.equal(html.includes('disabled'), false);
  });

  test('23. Remoção de warnings obsoletos: sem warnings de categoria/destination/parcelamento quando em Benefício', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_clean_exp_warnings',
      action: 'create_expense',
      status: 'pending',
      warnings: ['A categoria precisa ser selecionada.', 'Forma de pagamento não informada.'],
      missingFields: ['category', 'destination'],
      data: {
        description: 'TESTE',
        amount: 50.0,
        competence: { month: 9, year: 2026 }
      },
      _benefitDraft: { benefitType: 'va' }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_clean_exp_warnings', 'benefit');
    assert.ok(!proposal.warnings.some(w => w.includes('categoria')));
    assert.ok(!proposal.warnings.some(w => w.includes('pagamento')));
    assert.ok(!proposal.missingFields.includes('category'));
    assert.ok(!proposal.missingFields.includes('destination'));
  });

  test('24. Remoção de warnings obsoletos: sem warnings de tipo de benefício quando em Despesa', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_clean_ben_warnings',
      action: 'create_benefit',
      status: 'pending',
      warnings: ['Tipo de benefício não identificado.'],
      missingFields: ['benefitType'],
      data: {
        description: 'TESTE DESPESA',
        amount: 80.0,
        competence: { month: 9, year: 2026 }
      },
      _expenseDraft: { category: 'Outros', payment: { method: 'dinheiro' } }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_clean_ben_warnings', 'expense');
    assert.ok(!proposal.warnings.some(w => w.includes('tipo de benefício')));
    assert.ok(!proposal.missingFields.includes('benefitType'));
  });

  test('25. Seleção inline de benefitType no card atualiza proposta e remove aviso de tipo pendente', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_inline_bt',
      action: 'create_benefit',
      status: 'pending',
      requiresReview: true,
      warnings: ['Tipo de benefício não identificado.'],
      missingFields: ['benefitType'],
      data: {
        description: 'ALMOÇO NOVO',
        amount: 30.0,
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    const cardHtml = window.renderProposalCardHtml(proposal);
    assert.ok(cardHtml.includes('ai-proposal-benefit-type-select'));

    proposal.data.benefitType = 'vr';
    window.recalculateProposalState(proposal);
    assert.equal(proposal.requiresReview, false);
    assert.equal(proposal.missingFields.includes('benefitType'), false);
    const updatedCard = window.renderProposalCardHtml(proposal);
    assert.ok(updatedCard.includes('Vale Refeição (VR)'));
    assert.ok(!updatedCard.includes('ai-proposal-benefit-type-select'));
  });

  test('26. Edição de categoria via modal/função de edição atualiza proposta e libera confirmação', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_edit_cat',
      action: 'create_expense',
      status: 'pending',
      requiresReview: true,
      warnings: ['A categoria precisa ser selecionada.'],
      missingFields: ['category'],
      data: {
        description: 'COMBUSTIVEL',
        amount: 150.0,
        category: null,
        payment: { method: 'pix' },
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    assert.ok(window.renderProposalCardHtml(proposal).includes('disabled'));

    proposal.data.category = 'Transporte';
    window.recalculateProposalState(proposal);
    assert.equal(proposal.requiresReview, false);
    assert.equal(proposal.missingFields.length, 0);
    const readyHtml = window.renderProposalCardHtml(proposal);
    assert.equal(readyHtml.includes('disabled'), false);
  });

  test('27. Confirmação como Despesa dispara para /api/ai/actions/expense/confirm com schema de despesa', async () => {
    let capturedUrl = '';
    let capturedBody = null;
    const { window } = createUiSandbox({
      fetch: async (url, options) => {
        capturedUrl = url;
        capturedBody = JSON.parse(options.body || '{}');
        return {
          status: 200,
          json: async () => ({ success: true, message: 'Despesa cadastrada com sucesso.' })
        };
      }
    });
    const proposal = {
      proposalId: 'prop_exp_confirm_27',
      action: 'create_expense',
      status: 'pending',
      requiresReview: false,
      data: {
        description: 'MERCADO',
        amount: 85.0,
        category: 'Alimentação',
        payment: { method: 'pix' },
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    await window.confirmExpenseProposal('prop_exp_confirm_27');
    assert.ok(capturedUrl.includes('/api/ai/actions/expense/confirm'));
    assert.equal(capturedBody.proposalId, 'prop_exp_confirm_27');
  });

  test('28. Confirmação como Benefício dispara para /api/ai/actions/benefit/confirm com schema de benefício', async () => {
    let capturedUrl = '';
    let capturedBody = null;
    const { window } = createUiSandbox({
      fetch: async (url, options) => {
        capturedUrl = url;
        capturedBody = JSON.parse(options.body || '{}');
        return {
          status: 200,
          json: async () => ({ success: true, message: 'Benefício cadastrado com sucesso.' })
        };
      }
    });
    const proposal = {
      proposalId: 'prop_ben_confirm_28',
      action: 'create_benefit',
      status: 'pending',
      requiresReview: false,
      data: {
        description: 'REFEIÇÃO VR',
        amount: 32.0,
        benefitType: 'vr',
        day: 8,
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    await window.confirmBenefitProposal('prop_ben_confirm_28');
    assert.ok(capturedUrl.includes('/api/ai/actions/benefit/confirm'));
    assert.equal(capturedBody.proposalId, 'prop_ben_confirm_28');
  });

  test('29. Modal de edição reflete campos do tipo ativo (categoria em despesa, tipo de benefício em benefício)', () => {
    let openedDialog = '';
    const { window } = createUiSandbox({
      openQuickExpenseDialog: () => { openedDialog = 'expense'; },
      openBenefitDialog: () => { openedDialog = 'benefit'; }
    });

    const expProp = {
      proposalId: 'prop_modal_exp',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'UBER',
        amount: 25.0,
        category: 'Transporte',
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal: expProp });
    window.editExpenseProposal('prop_modal_exp');
    assert.equal(openedDialog, 'expense');

    const benProp = {
      proposalId: 'prop_modal_ben',
      action: 'create_benefit',
      status: 'pending',
      data: {
        description: 'ALMOCO VR',
        amount: 30.0,
        benefitType: 'vr',
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm2', sender: 'assistant', proposal: benProp });
    window.editBenefitProposal('prop_modal_ben');
    assert.equal(openedDialog, 'benefit');
  });

  test('30. Multimodal áudio/imagem com benefício gera card de Benefício diretamente com mídia desbloqueada', async () => {
    const { window, elements } = createUiSandbox({
      fetch: async () => ({
        status: 200,
        json: async () => ({
          success: true,
          action: 'create_benefit',
          proposalId: 'prop_multi_ben_30',
          data: {
            description: 'ALMOÇO MULTIMODAL',
            amount: 45.0,
            benefitType: 'vr',
            day: 9,
            competence: { month: 9, year: 2026 }
          },
          requiresConfirmation: true
        })
      })
    });
    const micBtn = elements['aiMicBtn'];
    assert.ok(micBtn);
    assert.equal(micBtn.disabled, false);

    await window.startAudioRecording();
    window.stopAudioRecording(false);
    await window.sendMultimodalMedia();
    const msgs = window.getAiMessages();
    const propMsg = msgs.find(m => m.proposal && m.proposal.proposalId === 'prop_multi_ben_30');
    assert.ok(propMsg);
    assert.equal(propMsg.proposal.action, 'create_benefit');
    const cardHtml = window.renderProposalCardHtml(propMsg.proposal);
    assert.ok(cardHtml.includes('Benefício Identificado'));
    assert.ok(cardHtml.includes('Vale Refeição (VR)'));
  });

  test('31. Multimodal não consome créditos nem chama IA na alternância de tipo no card (0 créditos, 0 chamadas)', () => {
    let apiCallCount = 0;
    const { window } = createUiSandbox({
      fetch: async () => {
        apiCallCount++;
        return { status: 200, json: async () => ({ success: true }) };
      }
    });
    const proposal = {
      proposalId: 'prop_zero_credit',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'ALMOÇO',
        amount: 30.0,
        category: 'Alimentação',
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_zero_credit', 'benefit');
    window.switchProposalType('prop_zero_credit', 'expense');
    window.switchProposalType('prop_zero_credit', 'benefit');
    assert.equal(apiCallCount, 0, 'Nenhuma chamada de API ou consumo de crédito pode ocorrer ao alternar o seletor no card');
  });

  test('32. Despesa com payment.method = "pix" e destination = null pode confirmar (requiresReview = false)', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_pix_null_dest',
      action: 'create_expense',
      status: 'pending',
      requiresReview: true,
      warnings: ['Destino não selecionado.'],
      missingFields: ['destination'],
      data: {
        description: 'LANCHE NO PIX',
        amount: 15.0,
        category: 'Alimentação',
        payment: { method: 'pix' },
        destination: null,
        competence: { month: 9, year: 2026 }
      }
    };
    window.recalculateProposalState(proposal);
    assert.equal(proposal.requiresReview, false);
    assert.equal(proposal.missingFields.length, 0);
    assert.equal(proposal.warnings.length, 0);
    const html = window.renderProposalCardHtml(proposal);
    assert.equal(html.includes('disabled'), false, 'Botão Confirmar não deve estar disabled quando método for pix mesmo com destination null');
  });

  test('33. Troca de Despesa inválida para Benefício limpa warnings de pagamento/destination/categoria', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_clear_exp_warnings',
      action: 'create_expense',
      status: 'pending',
      requiresReview: true,
      warnings: ['A categoria precisa ser selecionada.', 'Forma de pagamento não informada.', 'Destino não selecionado.'],
      missingFields: ['category', 'paymentMethod', 'destination'],
      data: {
        description: 'FARMACIA GERAL',
        amount: 40.0,
        category: null,
        payment: null,
        destination: null,
        competence: { month: 9, year: 2026 }
      },
      _benefitDraft: { benefitType: 'farmacia' }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_clear_exp_warnings', 'benefit');
    assert.equal(proposal.requiresReview, false);
    assert.equal(proposal.warnings.length, 0);
    assert.equal(proposal.missingFields.length, 0);
  });

  test('34. Troca de Benefício inválido para Despesa limpa warnings exclusivos de benefício', () => {
    const { window } = createUiSandbox();
    const proposal = {
      proposalId: 'prop_clear_ben_warnings',
      action: 'create_benefit',
      status: 'pending',
      requiresReview: true,
      warnings: ['Tipo de benefício não identificado.'],
      missingFields: ['benefitType'],
      data: {
        description: 'GASOLINA POSTO',
        amount: 120.0,
        benefitType: null,
        competence: { month: 9, year: 2026 }
      },
      _expenseDraft: { category: 'Transporte', payment: { method: 'pix' } }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal });
    window.switchProposalType('prop_clear_ben_warnings', 'expense');
    assert.equal(proposal.requiresReview, false);
    assert.equal(proposal.warnings.length, 0);
    assert.equal(proposal.missingFields.length, 0);
  });

  test('35. payment.method aceita apenas enum canônico (pix, dinheiro, cartao_credito, etc.)', () => {
    const { window } = createUiSandbox();
    const CANONICAL_METHODS = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'debito_automatico', 'outros'];
    for (const m of CANONICAL_METHODS) {
      const proposal = {
        proposalId: 'prop_meth_' + m,
        action: 'create_expense',
        status: 'pending',
        data: {
          description: 'PAGAMENTO ' + m,
          amount: 50.0,
          category: 'Outros',
          payment: { method: m },
          destination: null,
          competence: { month: 9, year: 2026 }
        }
      };
      window.recalculateProposalState(proposal);
      assert.equal(proposal.requiresReview, false, `Método canônico "${m}" deve ser válido`);
    }

    const invalidProposal = {
      proposalId: 'prop_meth_invalid',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'PAGAMENTO INVALIDO',
        amount: 50.0,
        category: 'Outros',
        payment: { method: 'invalid_method' },
        destination: null,
        competence: { month: 9, year: 2026 }
      }
    };
    window.recalculateProposalState(invalidProposal);
    assert.equal(invalidProposal.requiresReview, true, 'Método não-canônico deve exigir revisão');
  });

  test('36. Mídia multimodal utiliza action do provider para inferência inicial de tipo', async () => {
    const { window } = createUiSandbox({
      fetch: async () => ({
        status: 200,
        json: async () => ({
          success: true,
          action: 'create_benefit',
          proposalId: 'prop_audio_prov_action',
          data: {
            description: 'ALMOÇO REFEIÇÃO',
            amount: 33.0,
            benefitType: 'vr',
            day: 9,
            competence: { month: 9, year: 2026 }
          },
          requiresConfirmation: true
        })
      })
    });
    await window.startAudioRecording();
    window.stopAudioRecording(false);
    await window.sendMultimodalMedia();
    const msgs = window.getAiMessages();
    const propMsg = msgs.find(m => m.proposal && m.proposal.proposalId === 'prop_audio_prov_action');
    assert.ok(propMsg);
    assert.equal(propMsg.proposal.action, 'create_benefit');
  });

  test('37. Mídia multimodal sem action clara cai em create_expense como default sem inventar benefício', async () => {
    const { window } = createUiSandbox({
      fetch: async () => ({
        status: 200,
        json: async () => ({
          success: true,
          action: 'create_expense',
          proposalId: 'prop_audio_fallback_exp',
          data: {
            description: 'GASTO AMBÍGUO',
            amount: 75.0,
            category: 'Outros',
            payment: { method: 'pix' },
            competence: { month: 9, year: 2026 }
          },
          requiresConfirmation: true
        })
      })
    });
    await window.startAudioRecording();
    window.stopAudioRecording(false);
    await window.sendMultimodalMedia();
    const msgs = window.getAiMessages();
    const propMsg = msgs.find(m => m.proposal && m.proposal.proposalId === 'prop_audio_fallback_exp');
    assert.ok(propMsg);
    assert.equal(propMsg.proposal.action, 'create_expense');
  });

  test('38. Conversão date <-> day não destrutiva e benefício sem day explícito aceito com default do domínio', () => {
    const { window } = createUiSandbox();
    const benWithoutDay = {
      proposalId: 'prop_ben_no_day',
      action: 'create_benefit',
      status: 'pending',
      requiresReview: false,
      data: {
        description: 'AUXILIO ALIMENTACAO',
        amount: 200.0,
        benefitType: 'va',
        day: null,
        competence: { month: 9, year: 2026 }
      }
    };
    window.recalculateProposalState(benWithoutDay);
    assert.equal(benWithoutDay.requiresReview, false, 'Benefício sem day não deve exigir review (possui default canônico)');
    assert.equal(benWithoutDay.missingFields.includes('day'), false, 'day não deve estar em missingFields');
    const benHtml = window.renderProposalCardHtml(benWithoutDay);
    assert.equal(benHtml.includes('disabled'), false, 'Botão confirmar não deve estar disabled para benefício sem day');
    assert.ok(benHtml.includes('Hoje (Automático)'), 'Deve renderizar "Hoje (Automático)" sem mostrar Dia 1 artificialmente');

    const expWithDate = {
      proposalId: 'prop_date_day_safe',
      action: 'create_expense',
      status: 'pending',
      data: {
        description: 'JANTAR',
        amount: 90.0,
        category: 'Alimentação',
        payment: { method: 'pix' },
        date: '2026-09-15',
        competence: { month: 9, year: 2026 }
      }
    };
    window.getAiMessages().push({ id: 'm1', sender: 'assistant', proposal: expWithDate });
    window.switchProposalType('prop_date_day_safe', 'benefit');
    assert.equal(expWithDate.data.day, 15);
    window.switchProposalType('prop_date_day_safe', 'expense');
    assert.equal(expWithDate.data.date, '2026-09-15');
  });

});

