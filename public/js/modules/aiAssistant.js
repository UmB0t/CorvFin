/**
 * ==============================================================================
 * OmniFin V3 - AI Assistant Frontend Module (aiAssistant.js)
 * ==============================================================================
 */

(function () {
  'use strict';

  let messages = [];
  let conversationId = null;
  let isOpen = false;
  let isLoading = false;
  let initialized = false;

  const QUICK_PROMPTS = [
    'Resumo do mês',
    'Onde estou gastando mais?',
    'Categorias acima do teto',
    'Como funciona a Simulação?'
  ];

  function getAiIconSvg() {
    return `<svg class="svg-icon" viewBox="0 0 24 24">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
      <circle cx="12" cy="12" r="4"/>
    </svg>`;
  }

  function getSendIconSvg() {
    return `<svg class="svg-icon" viewBox="0 0 24 24">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>`;
  }

  function getCloseIconSvg() {
    return `<svg class="svg-icon" viewBox="0 0 24 24">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`;
  }

  function getTrashIconSvg() {
    return `<svg class="svg-icon" viewBox="0 0 24 24">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>`;
  }

  function formatTime(date = new Date()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function initAiAssistant() {
    if (initialized) return;

    // Apenas renderiza se o usuário estiver autenticado e não estiver na tela de login
    if (typeof window.API !== 'undefined' && typeof window.API.isAuthenticated === 'function') {
      if (!window.API.isAuthenticated()) return;
    }

    createAiWidgetElements();
    attachAiEventListeners();
    resetConversation();
    initialized = true;
  }

  function createAiWidgetElements() {
    if (document.getElementById('aiAssistantFloatingBtn')) return;

    // Botão Flutuante
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'aiAssistantFloatingBtn';
    fab.className = 'ai-assistant-fab';
    fab.setAttribute('data-tooltip', 'Assistente OmniFin');
    fab.setAttribute('aria-label', 'Abrir Assistente OmniFin');
    fab.innerHTML = getAiIconSvg();
    document.body.appendChild(fab);

    // Painel do Chat
    const panel = document.createElement('div');
    panel.id = 'aiAssistantPanel';
    panel.className = 'ai-assistant-panel hidden';
    panel.setAttribute('hidden', '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'Painel do Assistente OmniFin');

    panel.innerHTML = `
      <div class="ai-chat-header">
        <div style="overflow:hidden;">
          <div class="ai-chat-header-title">
            <span style="display:inline-flex; color:var(--brand);">${getAiIconSvg()}</span>
            <span>Assistente OmniFin</span>
            <span class="ai-badge">IA</span>
          </div>
          <div class="ai-chat-header-sub">Pergunte sobre suas finanças ou sobre o sistema.</div>
        </div>
        <div class="ai-chat-header-actions">
          <button type="button" class="icon-btn small" id="aiClearHistoryBtn" data-tooltip="Limpar conversa" aria-label="Limpar conversa">
            ${getTrashIconSvg()}
          </button>
          <button type="button" class="icon-btn small" id="aiClosePanelBtn" data-tooltip="Fechar" aria-label="Fechar">
            ${getCloseIconSvg()}
          </button>
        </div>
      </div>

      <div class="ai-chat-body" id="aiChatBody">
        <div style="font-size:0.78rem; font-weight:750; color:var(--muted); margin-top:2px;">
          Sugestões rápidas:
        </div>

        <div class="ai-quick-prompts" id="aiQuickPrompts">
          ${QUICK_PROMPTS.map(p => `<button type="button" class="ai-prompt-chip" data-prompt="${escapeHtmlAttr(p)}">✨ ${escapeHtmlText(p)}</button>`).join('')}
        </div>

        <div id="aiMessagesList" style="display:flex; flex-direction:column; gap:10px; margin-top:8px;"></div>
      </div>

      <div class="ai-chat-footer">
        <div class="ai-chat-input-row">
          <textarea id="aiChatInput" class="ai-chat-input" rows="1" placeholder="Pergunte algo sobre suas finanças..." maxlength="2000"></textarea>
          <button type="button" class="ai-chat-send-btn" id="aiChatSendBtn" data-tooltip="Enviar mensagem" aria-label="Enviar mensagem">
            ${getSendIconSvg()}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
  }

  function escapeHtmlText(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatAiMessageContent(str) {
    if (!str) return '';
    // 1. Escapa tags HTML para garantir segurança absoluta contra XSS
    let clean = String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 2. Converte negrito Markdown (**texto** ou __texto__) em <strong>texto</strong>
    clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    clean = clean.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // 3. Converte itálico simples (*texto* ou _texto_)
    clean = clean.replace(/(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');

    // 4. Remove caracteres residuais de markdown como hashes, asteriscos soltos e crases
    clean = clean.replace(/`{1,3}/g, '');
    clean = clean.replace(/^\s*#{1,6}\s+/gm, '');

    // 5. Normaliza listas simples (* item ou - item) para bullets elegantes
    clean = clean.replace(/^\s*[\*\-]\s+/gm, '• ');

    // 6. Converte quebras de linha em <br> para leitura agradável
    clean = clean.replace(/\r\n|\n|\r/g, '<br>');

    return clean;
  }

  function escapeHtmlAttr(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function attachAiEventListeners() {
    const fab = document.getElementById('aiAssistantFloatingBtn');
    const closeBtn = document.getElementById('aiClosePanelBtn');
    const clearBtn = document.getElementById('aiClearHistoryBtn');
    const sendBtn = document.getElementById('aiChatSendBtn');
    const input = document.getElementById('aiChatInput');
    const body = document.getElementById('aiChatBody');

    fab?.addEventListener('click', () => toggleAiAssistant());
    closeBtn?.addEventListener('click', () => closeAiAssistant());
    clearBtn?.addEventListener('click', () => resetConversation());

    sendBtn?.addEventListener('click', () => {
      if (input) {
        const text = input.value.trim();
        if (text) sendAiMessage(text);
      }
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.value.trim();
        if (text) sendAiMessage(text);
      }
    });

    // Auto-resize do textarea
    input?.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    // Event delegation para chips de sugestões
    body?.addEventListener('click', (e) => {
      const chip = e.target.closest('.ai-prompt-chip');
      if (chip && !isLoading) {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt) {
          sendAiMessage(prompt);
        }
      }
    });

    // Fechar no Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        closeAiAssistant();
      }
    });
  }

  function toggleAiAssistant() {
    if (isOpen) closeAiAssistant();
    else openAiAssistant();
  }

  function openAiAssistant() {
    const panel = document.getElementById('aiAssistantPanel');
    if (!panel) return;

    panel.hidden = false;
    panel.removeAttribute('hidden');
    panel.classList.remove('hidden');
    panel.classList.add('open');
    isOpen = true;

    const input = document.getElementById('aiChatInput');
    if (input) {
      setTimeout(() => input.focus(), 100);
    }
    scrollAiToBottom();
  }

  function closeAiAssistant() {
    const panel = document.getElementById('aiAssistantPanel');
    if (!panel) return;

    panel.classList.remove('open');
    panel.classList.add('hidden');
    panel.hidden = true;
    panel.setAttribute('hidden', '');
    isOpen = false;
  }

  function resetConversation() {
    conversationId = 'conv_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    messages = [
      {
        id: 'msg_welcome',
        sender: 'assistant',
        text: 'Olá! Sou o Assistente OmniFin. Como posso ajudar você hoje com seus gastos, orçamentos, metas ou recursos do sistema?',
        time: formatTime()
      }
    ];
    renderAiMessages();
  }

  function renderAiMessages() {
    const list = document.getElementById('aiMessagesList');
    if (!list) return;

    list.innerHTML = messages.map(msg => {
      const isUser = msg.sender === 'user';
      const isError = msg.sender === 'error';
      const bubbleClass = isUser ? 'user' : (isError ? 'assistant error' : 'assistant');

      let suggestionsHtml = '';
      if (!isUser && Array.isArray(msg.suggestions) && msg.suggestions.length > 0) {
        suggestionsHtml = `
          <div class="ai-quick-prompts" style="margin-top:6px;">
            ${msg.suggestions.map(s => `<button type="button" class="ai-prompt-chip" data-prompt="${escapeHtmlAttr(s)}">💡 ${escapeHtmlText(s)}</button>`).join('')}
          </div>
        `;
      }

      return `
        <div class="ai-msg ${bubbleClass}">
          <div class="ai-msg-bubble">${formatAiMessageContent(msg.text)}</div>
          ${suggestionsHtml}
          <div class="ai-msg-time">${escapeHtmlText(msg.time)}</div>
        </div>
      `;
    }).join('');

    if (isLoading) {
      const loadingEl = document.createElement('div');
      loadingEl.className = 'ai-msg assistant';
      loadingEl.innerHTML = `
        <div class="ai-typing-indicator" role="status" aria-live="polite" aria-label="Assistente digitando">
          <span class="ai-typing-dot"></span>
          <span class="ai-typing-dot"></span>
          <span class="ai-typing-dot"></span>
          <span style="margin-left:4px;">Digitando...</span>
        </div>
      `;
      list.appendChild(loadingEl);
    }

    scrollAiToBottom();
  }

  function scrollAiToBottom() {
    const body = document.getElementById('aiChatBody');
    if (body) {
      setTimeout(() => {
        body.scrollTop = body.scrollHeight;
      }, 30);
    }
  }

  async function sendAiMessage(text) {
    if (!text || isLoading) return;

    const input = document.getElementById('aiChatInput');
    const sendBtn = document.getElementById('aiChatSendBtn');

    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }

    // Adiciona mensagem do usuário ao histórico em memória
    messages.push({
      id: 'msg_' + Date.now(),
      sender: 'user',
      text,
      time: formatTime()
    });

    isLoading = true;
    if (sendBtn) sendBtn.disabled = true;
    renderAiMessages();

    // Obtém competência ativa da aplicação
    const state = (typeof getState === 'function') ? getState() : {};
    const currentMonth = state.month || (new Date().getMonth() + 1);
    const currentYear = state.year || new Date().getFullYear();

    try {
      const payload = {
        message: text,
        conversationId,
        context: {
          month: currentMonth,
          year: currentYear
        }
      };

      const response = (window.API && typeof window.API.aiChat === 'function')
        ? await window.API.aiChat(payload)
        : await window.API.post('/api/ai/chat', payload);

      if (response && response.success && response.answer) {
        messages.push({
          id: 'msg_' + Date.now(),
          sender: 'assistant',
          text: response.answer,
          suggestions: Array.isArray(response.suggestions) ? response.suggestions : [],
          time: formatTime()
        });
      } else {
        const status = response?.status || 0;
        const errorMsg = response?.message || 'Não consegui processar sua pergunta agora. Tente novamente em instantes.';
        console.error('[OmniFin AI]', {
          status,
          success: response?.success,
          message: errorMsg,
          unavailable: response?.unavailable
        });
        messages.push({
          id: 'msg_err_' + Date.now(),
          sender: 'error',
          text: errorMsg,
          time: formatTime()
        });
      }
    } catch (err) {
      console.error('[OmniFin AI]', {
        status: err?.status,
        message: err?.message
      });
      let friendlyError = 'Não foi possível conectar ao Assistente de IA. Verifique sua conexão ou tente novamente.';
      if (err && err.status === 503) {
        friendlyError = 'O Assistente de IA não está ativado no servidor no momento.';
      } else if (err && err.status === 504) {
        friendlyError = 'O assistente demorou muito para responder (timeout). Tente uma pergunta mais específica.';
      } else if (err && err.status === 502) {
        friendlyError = 'O serviço do Assistente de IA encontrou uma instabilidade temporária. Tente novamente em instantes.';
      }
      messages.push({
        id: 'msg_err_' + Date.now(),
        sender: 'error',
        text: friendlyError,
        time: formatTime()
      });
    } finally {
      isLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      renderAiMessages();
      if (input) input.focus();
    }
  }

  // Bridges públicas autorizadas
  window.initAiAssistant = initAiAssistant;
  window.openAiAssistant = openAiAssistant;
  window.closeAiAssistant = closeAiAssistant;
  window.toggleAiAssistant = toggleAiAssistant;
  window.sendAiMessage = sendAiMessage;
  window.formatAiMessageContent = formatAiMessageContent;

  // Auto-boot quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAiAssistant);
  } else {
    initAiAssistant();
  }
})();
