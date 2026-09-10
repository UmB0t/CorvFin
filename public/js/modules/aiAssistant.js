/**
 * ==============================================================================
 * CorvFin V3 - AI Assistant Frontend Module (aiAssistant.js)
 * ==============================================================================
 */

(function () {
  'use strict';

  let messages = [];
  let conversationId = null;
  let isOpen = false;
  let isLoading = false;
  let initialized = false;
  let currentModule = 'expense'; // 'expense' | 'benefit'
  const STORAGE_KEY_PREFIX = 'corvfin_ai_conversation_';

  function getCurrentUserId() {
    try {
      const u = (typeof window.API !== 'undefined' && typeof window.API.getUser === 'function')
        ? window.API.getUser()
        : null;
      return u ? (u.id || u._id || u.email || 'anonymous') : null;
    } catch (_) {
      return null;
    }
  }

  const CANONICAL_BENEFIT_TYPES = ['saude', 'vr', 'va', 'transporte', 'educacao', 'cultura', 'farmacia'];
  const CANONICAL_PAYMENT_METHODS = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'debito_automatico', 'outros'];

  function recalculateProposalState(proposal) {
    if (!proposal) return;
    const d = proposal.data || {};
    const isBenefit = proposal.action === 'create_benefit';

    const hasValidDesc = Boolean(d.description && String(d.description).trim().length > 0);
    const hasValidAmt = Boolean(d.amount && !isNaN(Number(d.amount)) && Number(d.amount) > 0);

    let warnings = Array.isArray(proposal.warnings) ? [...proposal.warnings] : [];

    if (hasValidDesc) {
      warnings = warnings.filter(w => !/descrição|descricao/i.test(w));
    }
    if (hasValidAmt) {
      warnings = warnings.filter(w => !/valor|quantia/i.test(w));
    }

    const missingFields = [];
    if (!hasValidDesc) missingFields.push('description');
    if (!hasValidAmt) missingFields.push('amount');

    if (isBenefit) {
      // 1. Limpa avisos irrelevantes de despesa (categoria, pagamento, destino)
      warnings = warnings.filter(w => !/categoria|método|metodo|pagou como|forma de pagamento|destino|parcela/i.test(w));

      // 2. Valida tipo de benefício canônico
      const hasValidType = Boolean(d.benefitType && CANONICAL_BENEFIT_TYPES.includes(String(d.benefitType).toLowerCase().trim()));
      if (hasValidType) {
        warnings = warnings.filter(w => !/tipo de benefício|tipo de beneficio|benef[ií]cio/i.test(w));
      } else {
        missingFields.push('benefitType');
        if (!warnings.some(w => /tipo de benefício|tipo de beneficio/i.test(w))) {
          warnings.push('O tipo de benefício precisa ser selecionado.');
        }
      }

      // Nota: day possui default canônico (base.day || 1), portanto não bloqueia confirmação
    } else {
      // 1. Limpa avisos irrelevantes de benefício
      warnings = warnings.filter(w => !/tipo de benefício|tipo de beneficio|benef[ií]cio/i.test(w));

      // 2. Valida categoria
      const hasValidCat = Boolean(d.category && String(d.category).trim().length > 0);
      if (hasValidCat) {
        warnings = warnings.filter(w => !/categoria/i.test(w));
      } else {
        missingFields.push('category');
        if (!warnings.some(w => /categoria/i.test(w))) {
          warnings.push('A categoria precisa ser selecionada.');
        }
      }

      // 3. Valida forma de pagamento: payment.method OU destination OU payment.account
      // Destination NÃO é obrigatório quando payment.method já é conhecido e canônico (ex: pix)
      const rawMethod = d.payment?.method || (typeof window.resolveExpensePaymentMethod === 'function' ? window.resolveExpensePaymentMethod(d) : null);
      const isMethodValid = rawMethod ? CANONICAL_PAYMENT_METHODS.includes(String(rawMethod).toLowerCase().trim()) : false;
      const hasValidPayment = Boolean(
        isMethodValid ||
        d.destination ||
        d.payment?.account
      );

      if (hasValidPayment) {
        warnings = warnings.filter(w => !/método|metodo|pagou como|forma de pagamento|destino/i.test(w));
      } else {
        missingFields.push('payment');
        if (!warnings.some(w => /forma de pagamento|pagou como|método/i.test(w))) {
          warnings.push('Forma de pagamento não informada.');
        }
      }
    }

    const isReviewRequired = (missingFields.length > 0) || (warnings.length > 0);

    proposal.warnings = warnings;
    proposal.missingFields = missingFields;
    proposal.requiresReview = isReviewRequired;
    if (proposal.data) {
      proposal.data.warnings = warnings;
      proposal.data.missingFields = missingFields;
      proposal.data.requiresReview = isReviewRequired;
    }
    if (proposal.status === 'review' && !isReviewRequired) {
      proposal.status = 'pending';
    } else if (proposal.status === 'pending' && isReviewRequired) {
      proposal.status = 'review';
    }
  }

  function switchProposalType(proposalId, targetType) {
    if (!proposalId || (targetType !== 'expense' && targetType !== 'benefit')) return;
    const msg = messages.find(m => m.proposal && m.proposal.proposalId === proposalId);
    if (!msg || !msg.proposal) return;

    const prop = msg.proposal;
    const d = prop.data = prop.data || {};

    if (targetType === 'benefit') {
      if (prop.action === 'create_benefit') return prop;
      prop.action = 'create_benefit';

      // Salva draft exclusivo de despesa para restauração
      prop._expenseDraft = {
        category: d.category !== undefined ? d.category : prop._expenseDraft?.category,
        destination: d.destination !== undefined ? d.destination : prop._expenseDraft?.destination,
        payment: d.payment !== undefined ? d.payment : prop._expenseDraft?.payment,
        installments: d.installments !== undefined ? d.installments : prop._expenseDraft?.installments
      };

      // Deriva day de date apenas se existir data ISO válida (YYYY-MM-DD) sem inferência ambígua
      if (d.date && typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date.trim())) {
        const parts = d.date.trim().split('-');
        const parsedDay = parseInt(parts[2], 10);
        if (parsedDay >= 1 && parsedDay <= 31) {
          d.day = parsedDay;
        }
      }

      // Restaura benefício prévio se existir draft
      if (prop._benefitDraft?.benefitType && !d.benefitType) {
        d.benefitType = prop._benefitDraft.benefitType;
      }

      // Preserva núcleo comum: description, amount, competence, notes, day
      // Limpa campos específicos de despesa (não contamina benefício)
      delete d.category;
      delete d.destination;
      delete d.payment;
      delete d.paymentMethod;
      delete d.paymentAccount;
      delete d.account;
      delete d.payee;
      delete d.installments;
      delete d.temporal;
      delete d.paymentType;
      delete prop._inlineEditingCategory;

      // Limpa warnings de despesa
      if (Array.isArray(prop.warnings)) {
        prop.warnings = prop.warnings.filter(w => !/categoria|método|metodo|pagou como|forma de pagamento|destino|parcela/i.test(w));
      }
    } else {
      if (prop.action === 'create_expense') return prop;
      prop.action = 'create_expense';

      // Salva draft exclusivo de benefício para restauração
      prop._benefitDraft = {
        benefitType: d.benefitType !== undefined ? d.benefitType : prop._benefitDraft?.benefitType
      };

      // Constrói date a partir de day e competence SOMENTE se contexto suficiente existir (sem inventar data)
      if (d.day && Number.isInteger(Number(d.day)) && Number(d.day) >= 1 && Number(d.day) <= 31 && d.competence?.month && d.competence?.year) {
        d.date = `${d.competence.year}-${String(d.competence.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
      } else {
        d.date = null;
      }

      // Restaura despesa prévia se existir draft
      if (prop._expenseDraft) {
        if (prop._expenseDraft.category !== undefined && d.category === undefined) d.category = prop._expenseDraft.category;
        if (prop._expenseDraft.destination !== undefined && d.destination === undefined) d.destination = prop._expenseDraft.destination;
        if (prop._expenseDraft.payment !== undefined && d.payment === undefined) d.payment = prop._expenseDraft.payment;
        if (prop._expenseDraft.installments !== undefined && d.installments === undefined) d.installments = prop._expenseDraft.installments;
      }

      // Limpa campos específicos de benefício (não contamina despesa)
      delete d.benefitType;
      delete d.type;

      // Limpa warnings de benefício
      if (Array.isArray(prop.warnings)) {
        prop.warnings = prop.warnings.filter(w => !/tipo de benefício|tipo de beneficio|benef[ií]cio/i.test(w));
      }
    }

    recalculateProposalState(prop);
    renderAiMessages();
    saveConversationState();
    return prop;
  }

  function saveConversationState() {
    const userId = getCurrentUserId();
    if (!userId) return;
    try {
      const safeMessages = messages.map(m => {
        const copy = {
          id: m.id,
          sender: m.sender,
          text: m.text,
          time: m.time,
          suggestions: m.suggestions || []
        };
        if (m.proposal) {
          copy.proposal = {
            proposalId: m.proposal.proposalId,
            action: m.proposal.action,
            source: m.proposal.source,
            status: m.proposal.status,
            requiresConfirmation: m.proposal.requiresConfirmation,
            requiresReview: m.proposal.requiresReview,
            warnings: m.proposal.warnings || [],
            missingFields: m.proposal.missingFields || [],
            errorMessage: m.proposal.errorMessage,
            data: m.proposal.data ? {
              description: m.proposal.data.description,
              amount: m.proposal.data.amount,
              category: m.proposal.data.category,
              destination: m.proposal.data.destination,
              payment: m.proposal.data.payment,
              payee: m.proposal.data.payee,
              benefitType: m.proposal.data.benefitType,
              day: m.proposal.data.day,
              competence: m.proposal.data.competence,
              installments: m.proposal.data.installments,
              notes: m.proposal.data.notes,
              warnings: m.proposal.data.warnings
            } : {}
          };
        }
        return copy;
      });

      const state = {
        userId,
        conversationId,
        selectedModule: currentModule,
        messages: safeMessages,
        updatedAt: Date.now()
      };
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(state));
    } catch (err) {
      console.warn('[AI Assistant] Erro ao salvar estado da conversa:', err);
    }
  }

  function loadConversationState() {
    const userId = getCurrentUserId();
    if (!userId) return false;
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.userId !== userId || !Array.isArray(parsed.messages) || parsed.messages.length === 0) {
        return false;
      }
      conversationId = parsed.conversationId || ('conv_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36));
      messages = parsed.messages;
      if (parsed.selectedModule === 'benefit' || parsed.selectedModule === 'expense') {
        currentModule = parsed.selectedModule;
      }
      return true;
    } catch (err) {
      console.warn('[AI Assistant] Erro ao restaurar conversa:', err);
      return false;
    }
  }

  function generateConversationId() {
    return 'conv_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }

  function resetConversation() {
    conversationId = generateConversationId();
    messages = [
      {
        id: 'msg_welcome',
        sender: 'assistant',
        text: 'Olá! Eu sou o assistente inteligente do CorvFin. Como posso ajudar com suas finanças hoje?',
        suggestions: QUICK_PROMPTS.slice(0, 3),
        time: formatTime()
      }
    ];
    const userId = getCurrentUserId();
    if (userId && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${userId}`);
      } catch (_) {}
    }
    renderAiMessages();
  }

  function setSelectedModule(mod) {
    currentModule = mod === 'benefit' ? 'benefit' : 'expense';
    const expBtn = document.getElementById('aiModuleExpenseBtn');
    const benBtn = document.getElementById('aiModuleBenefitBtn');
    const input = document.getElementById('aiChatInput');

    if (expBtn) {
      const isExp = currentModule === 'expense';
      expBtn.classList.toggle('active', isExp);
      expBtn.setAttribute('aria-checked', isExp ? 'true' : 'false');
      expBtn.setAttribute('aria-pressed', isExp ? 'true' : 'false');
    }
    if (benBtn) {
      const isBen = currentModule === 'benefit';
      benBtn.classList.toggle('active', isBen);
      benBtn.setAttribute('aria-checked', isBen ? 'true' : 'false');
      benBtn.setAttribute('aria-pressed', isBen ? 'true' : 'false');
    }
    if (input) {
      input.placeholder = currentModule === 'benefit'
        ? 'Ex: VR 45 reais no almoço...'
        : 'Pergunte algo sobre suas finanças...';
    }
    saveConversationState();
  }

  // Estado multimodal (Áudio e Imagem)
  let mediaRecorder = null;
  let audioStream = null;
  let audioChunks = [];
  let recordingTimer = null;
  let recordingSeconds = 0;
  let isRecording = false;
  let isRecordingCancelled = false;
  let pendingAudioBlob = null;
  let pendingAudioDuration = 0;
  let pendingImageFile = null;
  let pendingImageUrl = null;

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

  function getMicIconSvg() {
    return `<svg class="svg-icon" viewBox="0 0 24 24">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>`;
  }

  function getImageIconSvg() {
    return `<svg class="svg-icon" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>`;
  }

  function getCameraIconSvg() {
    return `<svg class="svg-icon" viewBox="0 0 24 24">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>`;
  }

  function getFolderIconSvg() {
    return `<svg class="svg-icon" viewBox="0 0 24 24">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>`;
  }

  function getStopIconSvg() {
    return `<svg class="svg-icon" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
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
    const restored = loadConversationState();
    if (!restored) {
      resetConversation();
    } else {
      setSelectedModule(currentModule);
      renderAiMessages();
    }
    initialized = true;
  }

  function createAiWidgetElements() {
    if (document.getElementById('aiAssistantFloatingBtn')) return;

    // Botão Flutuante
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'aiAssistantFloatingBtn';
    fab.className = 'ai-assistant-fab';
    fab.setAttribute('data-tooltip', 'Assistente CorvFin');
    fab.setAttribute('aria-label', 'Abrir Assistente CorvFin');
    fab.innerHTML = getAiIconSvg();
    document.body.appendChild(fab);

    // Painel do Chat
    const panel = document.createElement('div');
    panel.id = 'aiAssistantPanel';
    panel.className = 'ai-assistant-panel hidden';
    panel.setAttribute('hidden', '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'Painel do Assistente CorvFin');

    panel.innerHTML = `
      <div class="ai-chat-header">
        <div style="overflow:hidden;">
          <div class="ai-chat-header-title">
            <span style="display:inline-flex; color:var(--brand);">${getAiIconSvg()}</span>
            <span>Assistente CorvFin</span>
            <span class="ai-badge">IA</span>
            <span class="ai-credits-badge" id="aiCreditsBadge" style="display:none;" title="Créditos diários de IA"></span>
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

      <div class="ai-chat-footer" id="aiChatFooter">
        <div class="ai-media-preview-area hidden" id="aiMediaPreviewArea" style="display:none;"></div>

        <div class="ai-audio-rec-row hidden" id="aiAudioRecRow" style="display:none;" role="region" aria-label="Gravador de áudio">
          <div class="ai-audio-rec-indicator">
            <span class="ai-rec-dot"></span>
            <span class="ai-rec-label">REC</span>
            <span class="ai-rec-timer" id="aiRecTimer">00:00</span>
            <span class="ai-rec-limit">/ 01:00</span>
          </div>
          <div class="ai-audio-rec-actions">
            <button type="button" class="icon-btn small ai-audio-cancel-btn" id="aiCancelRecBtn" data-tooltip="Cancelar gravação" aria-label="Cancelar gravação">
              ${getTrashIconSvg()}
            </button>
            <button type="button" class="icon-btn small ai-audio-stop-btn" id="aiStopRecBtn" data-tooltip="Parar gravação" aria-label="Parar gravação">
              ${getStopIconSvg()}
            </button>
          </div>
        </div>

        <div class="ai-chat-input-row" id="aiChatInputRow">
          <div class="ai-attach-wrapper" style="position:relative;">
            <button type="button" class="ai-chat-media-btn" id="aiAttachBtn" data-tooltip="Anexar imagem" aria-label="Anexar imagem" aria-haspopup="true" aria-expanded="false">
              ${getImageIconSvg()}
            </button>
            <div class="ai-attach-menu hidden" id="aiAttachMenu" style="display:none;" role="menu">
              <button type="button" class="ai-attach-menu-item" id="aiAttachCameraBtn" role="menuitem">
                ${getCameraIconSvg()}
                <span>Tirar foto</span>
              </button>
              <button type="button" class="ai-attach-menu-item" id="aiAttachGalleryBtn" role="menuitem">
                ${getFolderIconSvg()}
                <span>Escolher da galeria</span>
              </button>
            </div>
            <input type="file" id="aiCameraInput" accept="image/jpeg,image/png,image/webp" capture="environment" style="display:none;" aria-hidden="true" tabindex="-1">
            <input type="file" id="aiGalleryInput" accept="image/jpeg,image/png,image/webp" style="display:none;" aria-hidden="true" tabindex="-1">
          </div>

          <textarea id="aiChatInput" class="ai-chat-input" rows="1" placeholder="Pergunte algo sobre suas finanças..." maxlength="2000"></textarea>

          <button type="button" class="ai-chat-media-btn" id="aiMicBtn" data-tooltip="Gravar áudio" aria-label="Gravar áudio">
            ${getMicIconSvg()}
          </button>

          <button type="button" class="ai-chat-send-btn" id="aiChatSendBtn" data-tooltip="Enviar mensagem" aria-label="Enviar mensagem">
            ${getSendIconSvg()}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
  }

  function escapeHtmlText(str) {
    if (str === null || str === undefined) return '';
    if (typeof str === 'object') {
      if (typeof str.message === 'string') {
        str = str.message;
      } else if (typeof str.warning === 'string') {
        str = str.warning;
      } else if (typeof str.text === 'string') {
        str = str.text;
      } else {
        try {
          str = JSON.stringify(str);
        } catch (_) {
          str = '';
        }
      }
    }
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatAiMessageContent(str) {
    if (str === null || str === undefined) return '';
    if (typeof str === 'object') {
      if (typeof str.message === 'string') str = str.message;
      else if (typeof str.text === 'string') str = str.text;
      else {
        try { str = JSON.stringify(str); } catch (_) { str = ''; }
      }
    }
    // 1. Escapa tags HTML para garantir segurança absoluta contra XSS
    let clean = String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

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
    if (str === null || str === undefined) return '';
    if (typeof str === 'object') {
      try { str = JSON.stringify(str); } catch (_) { str = ''; }
    }
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function attachAiEventListeners() {
    const fab = document.getElementById('aiAssistantFloatingBtn');
    const closeBtn = document.getElementById('aiClosePanelBtn');
    const clearBtn = document.getElementById('aiClearHistoryBtn');
    const sendBtn = document.getElementById('aiChatSendBtn');
    const micBtn = document.getElementById('aiMicBtn');
    const attachBtn = document.getElementById('aiAttachBtn');
    const cameraBtn = document.getElementById('aiAttachCameraBtn');
    const galleryBtn = document.getElementById('aiAttachGalleryBtn');
    const cameraInput = document.getElementById('aiCameraInput');
    const galleryInput = document.getElementById('aiGalleryInput');
    const stopRecBtn = document.getElementById('aiStopRecBtn');
    const cancelRecBtn = document.getElementById('aiCancelRecBtn');
    const previewArea = document.getElementById('aiMediaPreviewArea');
    const input = document.getElementById('aiChatInput');
    const body = document.getElementById('aiChatBody');

    fab?.addEventListener('click', () => toggleAiAssistant());
    closeBtn?.addEventListener('click', () => closeAiAssistant());
    clearBtn?.addEventListener('click', () => resetConversation());

    // Controles de áudio
    micBtn?.addEventListener('click', () => {
      if (isRecording) stopAudioRecording(false);
      else startAudioRecording();
    });
    stopRecBtn?.addEventListener('click', () => stopAudioRecording(false));
    cancelRecBtn?.addEventListener('click', () => cancelAudioRecording());

    // Menu de anexo (Câmera / Galeria)
    attachBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('aiAttachMenu');
      if (!menu) return;
      const isHidden = menu.classList.contains('hidden') || menu.style.display === 'none';
      if (isHidden) {
        menu.classList.remove('hidden');
        menu.style.display = 'flex';
        attachBtn.setAttribute('aria-expanded', 'true');
      } else {
        menu.classList.add('hidden');
        menu.style.display = 'none';
        attachBtn.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('click', (e) => {
      const menu = document.getElementById('aiAttachMenu');
      const attachBtnEl = document.getElementById('aiAttachBtn');
      if (menu && !menu.contains(e.target) && e.target !== attachBtnEl && !attachBtnEl?.contains(e.target)) {
        menu.classList.add('hidden');
        menu.style.display = 'none';
        attachBtnEl?.setAttribute('aria-expanded', 'false');
      }
    });

    cameraBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAttachMenu();
      document.getElementById('aiCameraInput')?.click();
    });

    galleryBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAttachMenu();
      document.getElementById('aiGalleryInput')?.click();
    });

    cameraInput?.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleImageSelected(file);
    });

    galleryInput?.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleImageSelected(file);
    });

    // Descarte de preview de mídia
    previewArea?.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('#aiRemoveMediaBtn');
      if (removeBtn) {
        if (pendingImageFile) discardImagePreview();
        if (pendingAudioBlob) discardAudioPreview();
      }
    });

    // Envio (Texto ou Multimodal)
    sendBtn?.addEventListener('click', () => {
      if (pendingAudioBlob || pendingImageFile) {
        sendMultimodalMedia();
      } else if (input) {
        const text = input.value.trim();
        if (text) sendAiMessage(text);
      }
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (pendingAudioBlob || pendingImageFile) {
          sendMultimodalMedia();
        } else {
          const text = input.value.trim();
          if (text) sendAiMessage(text);
        }
      }
    });

    // Auto-resize do textarea
    input?.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    // Event delegation para chips de sugestões e ações de propostas
    body?.addEventListener('click', (e) => {
      const chip = e.target.closest('.ai-prompt-chip');
      if (chip && !isLoading) {
        const prompt = chip.getAttribute('data-prompt');
        if (prompt) {
          sendAiMessage(prompt);
        }
        return;
      }

      // Ações de Proposta (Despesa / Benefício)
      const confirmBtn = e.target.closest('.ai-proposal-confirm-btn');
      if (confirmBtn) {
        if (confirmBtn.disabled || confirmBtn.hasAttribute('disabled') || confirmBtn.getAttribute('aria-disabled') === 'true') {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const propId = confirmBtn.getAttribute('data-proposal-id');
        if (propId) {
          const msg = messages.find(m => m.proposal && m.proposal.proposalId === propId);
          if (msg && msg.proposal && msg.proposal.action === 'create_benefit') {
            confirmBenefitProposal(propId);
          } else {
            confirmExpenseProposal(propId);
          }
        }
        return;
      }

      const cancelBtn = e.target.closest('.ai-proposal-cancel-btn');
      if (cancelBtn) {
        const propId = cancelBtn.getAttribute('data-proposal-id');
        if (propId) cancelExpenseProposal(propId);
        return;
      }

      const editBtn = e.target.closest('.ai-proposal-edit-btn');
      if (editBtn) {
        const propId = editBtn.getAttribute('data-proposal-id');
        if (propId) {
          const msg = messages.find(m => m.proposal && m.proposal.proposalId === propId);
          if (msg && msg.proposal && msg.proposal.action === 'create_benefit') {
            editBenefitProposal(propId);
          } else {
            editExpenseProposal(propId);
          }
        }
        return;
      }

      // Alternância de tipo no Card de Proposta (Despesa / Benefício)
      const typeBtn = e.target.closest('.ai-card-type-btn');
      if (typeBtn) {
        if (typeBtn.disabled || typeBtn.hasAttribute('disabled') || typeBtn.getAttribute('aria-disabled') === 'true') {
          return;
        }
        const propId = typeBtn.getAttribute('data-proposal-id');
        const targetType = typeBtn.getAttribute('data-target-type');
        if (propId && targetType) {
          switchProposalType(propId, targetType);
        }
        return;
      }

      const retryBtn = e.target.closest('.ai-proposal-retry-btn');
      if (retryBtn) {
        const propId = retryBtn.getAttribute('data-proposal-id');
        if (propId) {
          const msg = messages.find(m => m.proposal && m.proposal.proposalId === propId);
          if (msg && msg.proposal && msg.proposal.action === 'create_benefit') {
            confirmBenefitProposal(propId);
          } else {
            confirmExpenseProposal(propId);
          }
        }
        return;
      }
    });

    // Listener para seleção de categoria e tipo de benefício real na proposta
    body?.addEventListener('change', (e) => {
      const catSelect = e.target.closest('.ai-proposal-cat-select');
      if (catSelect) {
        const propId = catSelect.getAttribute('data-proposal-id');
        const chosen = catSelect.value;
        const msg = messages.find(m => m.proposal && m.proposal.proposalId === propId);
        if (msg && msg.proposal) {
          msg.proposal.data = msg.proposal.data || {};
          msg.proposal.data.category = chosen ? chosen.trim() : null;
          msg.proposal._inlineEditingCategory = false;
          recalculateProposalState(msg.proposal);
          renderAiMessages();
          saveConversationState();
        }
        return;
      }

      const benSelect = e.target.closest('.ai-proposal-benefit-type-select');
      if (benSelect) {
        const propId = benSelect.getAttribute('data-proposal-id');
        const chosen = benSelect.value;
        const msg = messages.find(m => m.proposal && m.proposal.proposalId === propId);
        if (msg && msg.proposal) {
          msg.proposal.data = msg.proposal.data || {};
          msg.proposal.data.benefitType = chosen ? chosen.trim().toLowerCase() : null;
          recalculateProposalState(msg.proposal);
          renderAiMessages();
          saveConversationState();
        }
        return;
      }
    });

    // Listener global para sincronizar confirmação de proposta ao salvar pelos modais de edição
    document.getElementById('quickExpenseForm')?.addEventListener('submit', () => {
      if (activeEditingProposalId) {
        const msg = messages.find(m => m.proposal && m.proposal.proposalId === activeEditingProposalId);
        if (msg && msg.proposal) {
          msg.proposal.status = 'confirmed';
        }
        activeEditingProposalId = null;
        renderAiMessages();
      }
    });

    document.getElementById('entryForm')?.addEventListener('submit', () => {
      if (activeEditingProposalId) {
        const msg = messages.find(m => m.proposal && m.proposal.proposalId === activeEditingProposalId);
        if (msg && msg.proposal) {
          msg.proposal.status = 'confirmed';
        }
        activeEditingProposalId = null;
        renderAiMessages();
      }
    });

    document.getElementById('benefitForm')?.addEventListener('submit', () => {
      if (activeEditingProposalId) {
        const msg = messages.find(m => m.proposal && m.proposal.proposalId === activeEditingProposalId);
        if (msg && msg.proposal) {
          msg.proposal.status = 'confirmed';
        }
        activeEditingProposalId = null;
        renderAiMessages();
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

    refreshAiCredits();

    const input = document.getElementById('aiChatInput');
    if (input) {
      setTimeout(() => input.focus(), 100);
    }
    scrollAiToBottom();
  }

  function closeAiAssistant() {
    const panel = document.getElementById('aiAssistantPanel');
    if (!panel) return;

    if (isRecording) {
      cancelAudioRecording();
    }

    panel.classList.remove('open');
    panel.classList.add('hidden');
    panel.hidden = true;
    panel.setAttribute('hidden', '');
    isOpen = false;
  }

  function resetConversation() {
    if (isRecording) {
      cancelAudioRecording();
    }
    discardAudioPreview();
    discardImagePreview();

    conversationId = 'conv_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    messages = [
      {
        id: 'msg_welcome',
        sender: 'assistant',
        text: 'Olá! Sou o Assistente CorvFin. Como posso ajudar você hoje com seus gastos, benefícios, orçamentos ou recursos do sistema?',
        time: formatTime()
      }
    ];
    renderAiMessages();
  }

  // ==============================================================================
  // CONTROLE MULTIMODAL: ÁUDIO, CÂMERA, GALERIA E PREVIEWS (5G-M.2)
  // ==============================================================================

  function formatTimer(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const mins = String(Math.floor(s / 60)).padStart(2, '0');
    const secs = String(s % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function updateRecTimerDisplay(seconds) {
    const timerEl = document.getElementById('aiRecTimer');
    if (timerEl) {
      timerEl.textContent = formatTimer(seconds);
    }
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function showAssistantNotice(text, type = 'warning') {
    if (typeof notify === 'function') {
      try { notify(text, type); } catch (_) {}
    } else if (typeof window !== 'undefined' && typeof window.notify === 'function') {
      try { window.notify(text, type); } catch (_) {}
    }
    messages.push({
      id: 'msg_notif_' + Date.now(),
      sender: 'error',
      text,
      time: formatTime()
    });
    renderAiMessages();
  }

  function showAudioRecordingUI() {
    const recRow = document.getElementById('aiAudioRecRow');
    const inputRow = document.getElementById('aiChatInputRow');
    if (recRow) {
      recRow.classList.remove('hidden');
      recRow.style.display = 'flex';
    }
    if (inputRow) {
      inputRow.classList.add('hidden');
      inputRow.style.display = 'none';
    }
  }

  function cleanupAudioRecordingUI() {
    const recRow = document.getElementById('aiAudioRecRow');
    const inputRow = document.getElementById('aiChatInputRow');
    if (recRow) {
      recRow.classList.add('hidden');
      recRow.style.display = 'none';
    }
    if (inputRow) {
      inputRow.classList.remove('hidden');
      inputRow.style.display = 'flex';
    }
    closeAttachMenu();
  }

  function closeAttachMenu() {
    const menu = document.getElementById('aiAttachMenu');
    const btn = document.getElementById('aiAttachBtn');
    if (menu) {
      menu.classList.add('hidden');
      menu.style.display = 'none';
    }
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  function getSupportedAudioMimeType() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return '';
    }
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];
    for (let i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(candidates[i])) {
        return candidates[i];
      }
    }
    return '';
  }

  function stopStreamTracks(stream) {
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (_) {}
      });
    }
  }

  async function startAudioRecording() {
    const hasMediaDevices = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasMediaRecorder = typeof window !== 'undefined' && typeof window.MediaRecorder === 'function';

    if (!hasMediaDevices || !hasMediaRecorder) {
      showAssistantNotice('Seu navegador não suporta gravação de áudio no momento.', 'error');
      return;
    }

    if (isRecording || isLoading) return;

    discardImagePreview();
    discardAudioPreview();

    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn('[CorvFin AI] getUserMedia error:', err?.name, err?.message);
      let friendly = 'Não foi possível acessar o microfone. Verifique as permissões do navegador.';
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        friendly = 'Permissão de acesso ao microfone foi negada pelo navegador.';
      } else if (err && err.name === 'NotFoundError') {
        friendly = 'Nenhum dispositivo de microfone foi encontrado.';
      } else if (err && err.name === 'NotReadableError') {
        friendly = 'O microfone já está em uso por outro aplicativo.';
      } else if (err && err.name === 'AbortError') {
        friendly = 'A captura de áudio foi interrompida.';
      }
      showAssistantNotice(friendly, 'error');
      return;
    }

    try {
      audioChunks = [];
      const mimeType = getSupportedAudioMimeType();
      const recorderOptions = mimeType ? { mimeType } : undefined;
      mediaRecorder = new MediaRecorder(audioStream, recorderOptions);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        stopStreamTracks(audioStream);
        audioStream = null;

        if (isRecordingCancelled) {
          audioChunks = [];
          isRecordingCancelled = false;
          return;
        }

        const effectiveMime = (mediaRecorder && mediaRecorder.mimeType) || mimeType || 'audio/webm';
        const blob = new Blob(audioChunks, { type: effectiveMime });
        audioChunks = [];

        if (blob.size > 5 * 1024 * 1024) {
          showAssistantNotice('A imagem/áudio deve ter no máximo 5 MB.', 'warning');
          discardAudioPreview();
          return;
        }

        pendingAudioBlob = blob;
        pendingAudioDuration = recordingSeconds;
        renderMediaPreview();
      };

      mediaRecorder.onerror = (recErr) => {
        console.warn('[CorvFin AI] MediaRecorder error:', recErr);
        stopStreamTracks(audioStream);
        audioStream = null;
        cleanupAudioRecordingUI();
        showAssistantNotice('Ocorreu uma falha durante a gravação do áudio.', 'error');
      };

      isRecording = true;
      isRecordingCancelled = false;
      recordingSeconds = 0;
      updateRecTimerDisplay(0);
      showAudioRecordingUI();

      mediaRecorder.start(250);

      recordingTimer = setInterval(() => {
        recordingSeconds++;
        updateRecTimerDisplay(recordingSeconds);
        if (recordingSeconds >= 60) {
          stopAudioRecording(false);
        }
      }, 1000);
    } catch (startErr) {
      console.warn('[CorvFin AI] MediaRecorder init error:', startErr);
      stopStreamTracks(audioStream);
      audioStream = null;
      cleanupAudioRecordingUI();
      showAssistantNotice('Não foi possível inicializar a gravação de áudio.', 'error');
    }
  }

  function stopAudioRecording(cancelled = false) {
    if (!isRecording) return;

    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }

    isRecording = false;
    isRecordingCancelled = cancelled;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (_) {}
    } else {
      stopStreamTracks(audioStream);
      audioStream = null;
      audioChunks = [];
    }

    cleanupAudioRecordingUI();
  }

  function cancelAudioRecording() {
    stopAudioRecording(true);
    discardAudioPreview();
  }

  function handleImageSelected(file) {
    if (!file) return;

    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || /\.hei[cf]$/i.test(file.name || '');
    if (isHeic) {
      showAssistantNotice('Este formato de imagem ainda não é suportado. Use JPEG, PNG ou WebP.', 'warning');
      resetFileInputs();
      return;
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.type)) {
      showAssistantNotice('Formato de imagem não suportado. Use JPEG, PNG ou WebP.', 'warning');
      resetFileInputs();
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showAssistantNotice('A imagem/áudio deve ter no máximo 5 MB.', 'warning');
      resetFileInputs();
      return;
    }

    discardAudioPreview();
    discardImagePreview();

    pendingImageFile = file;
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      pendingImageUrl = URL.createObjectURL(file);
    }
    renderMediaPreview();
  }

  function discardImagePreview() {
    if (pendingImageUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(pendingImageUrl);
      } catch (_) {}
    }
    pendingImageUrl = null;
    pendingImageFile = null;
    resetFileInputs();
    renderMediaPreview();
  }

  function discardAudioPreview() {
    pendingAudioBlob = null;
    pendingAudioDuration = 0;
    renderMediaPreview();
  }

  function resetFileInputs() {
    const cam = document.getElementById('aiCameraInput');
    if (cam) cam.value = '';
    const gal = document.getElementById('aiGalleryInput');
    if (gal) gal.value = '';
  }

  function renderMediaPreview() {
    const previewArea = document.getElementById('aiMediaPreviewArea');
    if (!previewArea) return;

    if (pendingImageFile) {
      previewArea.style.display = 'flex';
      previewArea.classList.remove('hidden');
      previewArea.innerHTML = `
        <div class="ai-media-preview-card">
          ${pendingImageUrl ? `<img src="${pendingImageUrl}" alt="Preview da imagem" class="ai-media-preview-thumb">` : ''}
          <div class="ai-media-preview-info">
            <span class="ai-media-preview-name">${escapeHtmlText(pendingImageFile.name || 'Imagem selecionada')}</span>
            <span class="ai-media-preview-size">${formatFileSize(pendingImageFile.size)}</span>
          </div>
          <button type="button" class="ai-media-preview-remove-btn" id="aiRemoveMediaBtn" aria-label="Remover imagem" title="Remover imagem">
            ${getCloseIconSvg()}
          </button>
        </div>
      `;
    } else if (pendingAudioBlob) {
      previewArea.style.display = 'flex';
      previewArea.classList.remove('hidden');
      previewArea.innerHTML = `
        <div class="ai-media-preview-card audio">
          <div class="ai-media-preview-icon">
            ${getMicIconSvg()}
          </div>
          <div class="ai-media-preview-info">
            <span class="ai-media-preview-name">Áudio gravado — ${formatTimer(pendingAudioDuration)}</span>
            <span class="ai-media-preview-size">${formatFileSize(pendingAudioBlob.size)}</span>
          </div>
          <button type="button" class="ai-media-preview-remove-btn" id="aiRemoveMediaBtn" aria-label="Descartar áudio" title="Descartar áudio">
            ${getTrashIconSvg()}
          </button>
        </div>
      `;
    } else {
      previewArea.innerHTML = '';
      previewArea.style.display = 'none';
      previewArea.classList.add('hidden');
    }
  }

  async function sendMultimodalMedia() {
    if (isLoading) return;
    if (!pendingAudioBlob && !pendingImageFile) return;

    const isAudio = Boolean(pendingAudioBlob);
    const mediaObj = isAudio ? pendingAudioBlob : pendingImageFile;

    if (mediaObj.size > 5 * 1024 * 1024) {
      showAssistantNotice('A imagem/áudio deve ter no máximo 5 MB.', 'warning');
      return;
    }

    const input = document.getElementById('aiChatInput');
    const sendBtn = document.getElementById('aiChatSendBtn');
    const micBtn = document.getElementById('aiMicBtn');
    const attachBtn = document.getElementById('aiAttachBtn');

    const optionalText = input ? input.value.trim() : '';
    if (input) {
      input.value = '';
      input.style.height = 'auto';
    }

    isLoading = true;
    if (sendBtn) sendBtn.disabled = true;
    if (micBtn) micBtn.disabled = true;
    if (attachBtn) attachBtn.disabled = true;
    if (input) input.disabled = true;

    const audioDur = pendingAudioDuration;
    const mediaName = mediaObj.name || (isAudio ? 'áudio' : 'foto');

    const userMsgText = isAudio
      ? `🎤 Áudio enviado — ${formatTimer(audioDur)}${optionalText ? '\n' + optionalText : ''}`
      : `📷 Imagem enviada — ${mediaName}${optionalText ? '\n' + optionalText : ''}`;

    messages.push({
      id: 'msg_' + Date.now(),
      sender: 'user',
      text: userMsgText,
      time: formatTime()
    });

    const formData = new FormData();
    let filename = mediaObj.name;
    if (!filename) {
      if (isAudio) {
        const t = mediaObj.type || '';
        filename = t.includes('mp4') ? 'gravacao.mp4' : (t.includes('ogg') ? 'gravacao.ogg' : 'gravacao.webm');
      } else {
        filename = 'imagem.jpg';
      }
    }
    formData.append('data', mediaObj, filename);
    formData.append('inputMode', isAudio ? 'audio' : 'image');
    formData.append('conversationId', conversationId);

    const state = (typeof getState === 'function') ? getState() : {};
    const currentMonth = state.month || (new Date().getMonth() + 1);
    const currentYear = state.year || new Date().getFullYear();
    const now = new Date();
    const currentDateIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    formData.append('context', JSON.stringify({
      month: currentMonth,
      year: currentYear,
      currentDate: currentDateIso
    }));
    formData.append('month', String(currentMonth));
    formData.append('year', String(currentYear));
    if (optionalText) {
      formData.append('message', optionalText);
      const isBenCandidate = /\b(vr|va|vale refeicao|vale refeição|vale alimentacao|vale alimentação|beneficio|benefício|vale transporte)\b/i.test(optionalText);
      if (isBenCandidate) {
        formData.append('targetModule', 'beneficios');
        formData.append('intent', 'create_benefit');
      }
    }

    // Limpa referências locais de mídia imediatamente (privacidade e liberação de memória)
    discardImagePreview();
    discardAudioPreview();

    renderAiMessages();

    try {
      const res = await window.API.aiInterpretAction(formData);

      if (res && res.success) {
        if ((res.action === 'create_expense' || res.action === 'create_benefit') && res.proposalId && res.data) {
          messages.push({
            id: 'msg_prop_' + Date.now(),
            sender: 'assistant',
            text: '',
            proposal: {
              action: res.action,
              proposalId: res.proposalId,
              data: res.data,
              requiresReview: res.requiresReview,
              requiresConfirmation: res.requiresConfirmation,
              warnings: res.warnings,
              status: res.requiresReview ? 'review' : 'pending'
            },
            time: formatTime()
          });
        } else if (res.action === 'continue_collection' || res.answer || res.action === 'unsupported_action' || res.action === 'insufficient_data' || res.action === 'chat') {
          if (res.confirmed && res.proposalId) {
            const targetMsg = messages.find(m => m.proposal && m.proposal.proposalId === res.proposalId);
            if (targetMsg) targetMsg.proposal.status = 'confirmed';
          }
          messages.push({
            id: 'msg_' + Date.now(),
            sender: 'assistant',
            text: res.answer || 'Como posso ajudar com seus lançamentos?',
            suggestions: Array.isArray(res.suggestions) ? res.suggestions : [],
            time: formatTime()
          });
        }
      } else {
        let friendlyError = res?.message || 'Não consegui processar a mídia agora. Tente novamente em instantes.';
        if (res?.status === 429 || res?.error === 'AI_DAILY_QUOTA_REACHED' || res?.code === 'AI_DAILY_QUOTA_REACHED') {
          friendlyError = res.message || 'Você não possui créditos de IA suficientes para esta operação hoje.';
        } else if (res?.status === 403 || res?.error === 'PLAN_ACCESS_DENIED' || res?.code === 'PLAN_ACCESS_DENIED') {
          friendlyError = res.message || 'Seu plano atual não possui acesso ao Assistente de IA.';
        } else if (res?.error === 'AI_MEDIA_TOO_LARGE') {
          friendlyError = 'A imagem/áudio deve ter no máximo 5 MB.';
        } else if (res?.error === 'AI_MEDIA_TYPE_UNSUPPORTED') {
          friendlyError = 'Formato de mídia não suportado pelo assistente.';
        } else if (res?.error === 'AI_MEDIA_EMPTY') {
          friendlyError = 'Arquivo de mídia vazio ou corrompido.';
        } else if (res?.error === 'AI_MEDIA_REQUIRED') {
          friendlyError = 'Nenhum arquivo de mídia foi detectado no envio.';
        } else if (res?.error === 'INVALID_AI_CONTEXT') {
          friendlyError = 'Contexto da competência inválido.';
        } else if (res?.error === 'UNSUPPORTED_INPUT_MODE') {
          friendlyError = 'Modo de entrada de mídia não suportado.';
        } else if (res?.status === 503) {
          friendlyError = 'O Assistente de IA não está ativado no servidor no momento.';
        } else if (res?.status === 504) {
          friendlyError = 'O assistente demorou muito para responder (timeout). Tente novamente.';
        }

        messages.push({
          id: 'msg_err_' + Date.now(),
          sender: 'error',
          text: friendlyError,
          time: formatTime()
        });
      }
    } catch (err) {
      console.error('[CorvFin AI Multimodal Error]', err);
      let friendlyError = 'Não foi possível enviar a mídia para análise. Verifique sua conexão e tente novamente.';
      const isQuotaErr = Boolean(err && (err.status === 429 || err.code === 'AI_DAILY_QUOTA_REACHED' || err.error === 'AI_DAILY_QUOTA_REACHED'));
      if (isQuotaErr) {
        friendlyError = err.message || 'Você não possui créditos de IA suficientes para esta operação hoje. Seus créditos renovam à meia-noite.';
        const qLimit = err.limit || err.data?.limit || 0;
        messages.push({
          id: 'msg_quota_' + Date.now(),
          sender: 'assistant',
          isQuotaExceeded: true,
          quotaInfo: {
            limit: qLimit,
            used: err.used || err.data?.used,
            resetsAt: err.resetsAt || err.data?.resetsAt
          },
          text: friendlyError,
          time: formatTime()
        });
        updateAiBadge({ enabled: true, remaining: 0, limit: qLimit });
      } else {
        if (err && (err.status === 403 || err.code === 'PLAN_ACCESS_DENIED')) {
          friendlyError = err.message || 'Seu plano atual não possui acesso ao Assistente de IA.';
        }
        messages.push({
          id: 'msg_err_' + Date.now(),
          sender: 'error',
          text: friendlyError,
          time: formatTime()
        });
      }
    } finally {
      isLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      if (micBtn) micBtn.disabled = false;
      if (attachBtn) attachBtn.disabled = false;
      if (input) {
        input.disabled = false;
        input.focus();
      }
      renderAiMessages();
      saveConversationState();
    }
  }

  const MONTH_NAMES_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const BENEFIT_LABELS = {
    saude: 'Saúde',
    vr: 'Vale Refeição (VR)',
    va: 'Vale Alimentação (VA)',
    transporte: 'Transporte',
    educacao: 'Educação',
    cultura: 'Cultura',
    farmacia: 'Farmácia'
  };

  function renderProposalCardHtml(proposal) {
    if (!proposal || !proposal.data) return '';
    recalculateProposalState(proposal);
    const d = proposal.data;
    const propId = proposal.proposalId || '';
    const status = proposal.status || 'pending';
    const isBenefit = proposal.action === 'create_benefit';

    const descFormatted = String(d.description || (isBenefit ? 'NOVO BENEFÍCIO' : 'NOVA DESPESA')).trim().toLocaleUpperCase('pt-BR');

    const amtFormatted = (typeof formatCurrency === 'function' && d.amount)
      ? formatCurrency(d.amount)
      : ('R$ ' + Number(d.amount || 0).toFixed(2).replace('.', ','));

    const monthName = (d.competence && d.competence.month >= 1 && d.competence.month <= 12)
      ? MONTH_NAMES_PT[d.competence.month - 1]
      : '';
    const competenceFormatted = monthName ? `${monthName}/${d.competence.year || new Date().getFullYear()}` : 'Competência atual';

    const isReviewRequired = Boolean(proposal.requiresReview);
    const activeWarnings = Array.isArray(proposal.warnings) ? proposal.warnings : [];

    let statusContent = '';
    if (status === 'confirming') {
      statusContent = `
        <div style="display:flex; align-items:center; gap:6px; font-size:0.80rem; color:var(--brand); font-weight:750;">
          <span class="ai-typing-dot" style="width:6px; height:6px;"></span>
          <span>${isBenefit ? 'Gravando benefício...' : 'Gravando despesa...'}</span>
        </div>
      `;
    } else if (status === 'confirmed') {
      statusContent = `
        <div class="ai-proposal-status success">
          <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px; stroke-width:3;"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>${isBenefit ? 'Benefício cadastrado' : 'Despesa cadastrada'}</span>
        </div>
      `;
    } else if (status === 'cancelled') {
      statusContent = `
        <div class="ai-proposal-status cancelled">
          <svg class="svg-icon" viewBox="0 0 24 24" style="width:14px; height:14px; stroke-width:2.5;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          <span>Cadastro cancelado</span>
        </div>
      `;
    } else if (status === 'error') {
      statusContent = `
        <div style="display:flex; flex-direction:column; gap:6px; width:100%;">
          <div class="ai-proposal-status error">
            <span>⚠ ${escapeHtmlText(proposal.errorMessage || (isBenefit ? 'Falha ao salvar benefício.' : 'Falha ao salvar despesa.'))}</span>
          </div>
          <div class="ai-proposal-actions">
            <button type="button" class="btn primary small ai-proposal-retry-btn" data-proposal-id="${escapeHtmlAttr(propId)}">Tentar novamente</button>
            <button type="button" class="btn soft small ai-proposal-edit-btn" data-proposal-id="${escapeHtmlAttr(propId)}">Editar</button>
            <button type="button" class="btn ghost small ai-proposal-cancel-btn" data-proposal-id="${escapeHtmlAttr(propId)}">Cancelar</button>
          </div>
        </div>
      `;
    } else {
      // Status 'pending' ou 'review'
      let alertHtml = '';
      if (activeWarnings.length > 0) {
        alertHtml = `
          <div class="ai-proposal-alert">
            ${activeWarnings.map(w => escapeHtmlText(w)).filter(Boolean).join('<br>')}
          </div>
        `;
      }

      const buttonTitle = isReviewRequired
        ? (activeWarnings[0] || 'Preencha os campos obrigatórios antes de confirmar')
        : 'Confirmar e cadastrar lançamento';

      statusContent = `
        ${alertHtml}
        <div class="ai-proposal-actions">
          <button type="button" class="btn primary small ai-proposal-confirm-btn" data-proposal-id="${escapeHtmlAttr(propId)}" ${isReviewRequired ? `disabled aria-disabled="true" title="${escapeHtmlAttr(buttonTitle)}"` : ''}>
            Confirmar cadastro
          </button>
          <button type="button" class="btn soft small ai-proposal-edit-btn" data-proposal-id="${escapeHtmlAttr(propId)}">
            Editar
          </button>
          <button type="button" class="btn ghost small ai-proposal-cancel-btn" data-proposal-id="${escapeHtmlAttr(propId)}">
            Cancelar
          </button>
        </div>
      `;
    }

    const typeSelectorHtml = `
      <div class="ai-card-type-selector" role="radiogroup" aria-label="Tipo de lançamento">
        <button type="button" class="ai-card-type-btn ${!isBenefit ? 'active' : ''}" data-proposal-id="${escapeHtmlAttr(propId)}" data-target-type="expense" data-type="expense" role="radio" aria-checked="${!isBenefit}" aria-pressed="${!isBenefit}" ${status === 'confirmed' || status === 'confirming' || status === 'cancelled' ? 'disabled' : ''}>
          <svg class="svg-icon" viewBox="0 0 24 24" style="width:11px; height:11px;"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          <span>Despesa</span>
        </button>
        <button type="button" class="ai-card-type-btn ${isBenefit ? 'active' : ''}" data-proposal-id="${escapeHtmlAttr(propId)}" data-target-type="benefit" data-type="benefit" role="radio" aria-checked="${isBenefit}" aria-pressed="${isBenefit}" ${status === 'confirmed' || status === 'confirming' || status === 'cancelled' ? 'disabled' : ''}>
          <svg class="svg-icon" viewBox="0 0 24 24" style="width:11px; height:11px;"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
          <span>Benefício</span>
        </button>
      </div>
    `;

    if (isBenefit) {
      const typeLabel = BENEFIT_LABELS[d.benefitType] || d.benefitType || null;
      return `
        <div class="ai-proposal-card">
          <div class="ai-proposal-header">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="ai-proposal-tag">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:12px; height:12px;"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                Benefício Identificado
              </span>
              ${typeSelectorHtml}
            </div>
            <span style="font-size:0.72rem; color:var(--muted); font-weight:700;">Requer confirmação</span>
          </div>

          <div class="ai-proposal-main">
            <div class="ai-proposal-desc" title="${escapeHtmlAttr(descFormatted)}">${escapeHtmlText(descFormatted)}</div>
            <div class="ai-proposal-amount">${escapeHtmlText(amtFormatted)}</div>
          </div>

          <div class="ai-proposal-grid">
            <div class="ai-proposal-item">
              <span class="ai-proposal-item-label">Tipo</span>
              ${d.benefitType ? `
                <span class="ai-proposal-item-val" title="${escapeHtmlAttr(typeLabel)}" style="color:var(--text); font-weight:700;">
                  ${escapeHtmlText(typeLabel)}
                </span>
              ` : `
                <div style="display:flex; flex-direction:column; gap:4px; margin-top:2px;">
                  <select class="ai-proposal-benefit-type-select" data-proposal-id="${escapeHtmlAttr(propId)}" style="font-size:0.78rem; padding:4px 6px; border-radius:6px; border:1px solid var(--warning, #f59e0b); background:var(--surface); color:var(--text); max-width:180px;">
                    <option value="">Selecione tipo...</option>
                    ${CANONICAL_BENEFIT_TYPES.map(bt => `<option value="${escapeHtmlAttr(bt)}" ${d.benefitType === bt ? 'selected' : ''}>${escapeHtmlText(BENEFIT_LABELS[bt] || bt)}</option>`).join('')}
                  </select>
                </div>
              `}
            </div>
            <div class="ai-proposal-item">
              <span class="ai-proposal-item-label">Dia</span>
              <span class="ai-proposal-item-val" title="${d.day ? 'Dia ' + escapeHtmlAttr(d.day) : 'Hoje (Automático)'}">${d.day ? 'Dia ' + escapeHtmlText(d.day) : 'Hoje (Automático)'}</span>
            </div>
            <div class="ai-proposal-item">
              <span class="ai-proposal-item-label">Competência</span>
              <span class="ai-proposal-item-val" title="${escapeHtmlAttr(competenceFormatted)}">${escapeHtmlText(competenceFormatted)}</span>
            </div>
            <div class="ai-proposal-item">
              <span class="ai-proposal-item-label">Observação</span>
              <span class="ai-proposal-item-val" title="${escapeHtmlAttr(d.notes || 'Nenhuma')}">${escapeHtmlText(d.notes || 'Nenhuma')}</span>
            </div>
          </div>

          ${statusContent}
        </div>
      `;
    }

    const methodId = d.payment?.method || (typeof window.resolveExpensePaymentMethod === 'function' ? window.resolveExpensePaymentMethod(d) : 'outros');
    const methodName = (window.PAYMENT_METHOD_NAMES_MAP && window.PAYMENT_METHOD_NAMES_MAP[methodId]) || methodId;
    const payeeVal = d.payee || (typeof window.resolveExpensePayee === 'function' ? window.resolveExpensePayee(d) : null);
    const accountVal = d.payment?.account || (typeof window.resolveExpenseAccount === 'function' ? window.resolveExpenseAccount(d) : null);

    let temporalFormatted = 'À vista';
    if (d.temporal?.type === 'fixed' || d.isRecurring || d.paymentType === 'fixed') {
      temporalFormatted = 'Fixa';
    } else if (d.temporal?.type === 'installment' || (d.installments && d.installments > 1)) {
      temporalFormatted = `Parcelada (${d.installments}x)`;
    }

    const state = (typeof getState === 'function') ? getState() : (window.FP_STATE || {});
    const realCategories = (state.categories || []).map(c => typeof c === 'string' ? c : (c?.name || '')).filter(Boolean);

    return `
      <div class="ai-proposal-card">
        <div class="ai-proposal-header">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="ai-proposal-tag">
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:12px; height:12px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              Despesa Identificada
            </span>
            ${typeSelectorHtml}
          </div>
          <span style="font-size:0.72rem; color:var(--muted); font-weight:700;">Requer confirmação</span>
        </div>

        <div class="ai-proposal-main">
          <div class="ai-proposal-desc" title="${escapeHtmlAttr(descFormatted)}">${escapeHtmlText(descFormatted)}</div>
          <div class="ai-proposal-amount">${escapeHtmlText(amtFormatted)}</div>
        </div>

        <div class="ai-proposal-grid">
          <div class="ai-proposal-item">
            <span class="ai-proposal-item-label">Método</span>
            <span class="ai-proposal-item-val" title="${escapeHtmlAttr(methodName)}">${escapeHtmlText(methodName)}</span>
          </div>
          ${payeeVal ? `
            <div class="ai-proposal-item">
              <span class="ai-proposal-item-label">Favorecido</span>
              <span class="ai-proposal-item-val" title="${escapeHtmlAttr(payeeVal)}">${escapeHtmlText(payeeVal)}</span>
            </div>
          ` : ''}
          ${accountVal ? `
            <div class="ai-proposal-item">
              <span class="ai-proposal-item-label">Conta / Cartão</span>
              <span class="ai-proposal-item-val" title="${escapeHtmlAttr(accountVal)}">${escapeHtmlText(accountVal)}</span>
            </div>
          ` : ''}
          <div class="ai-proposal-item">
            <span class="ai-proposal-item-label">Categoria</span>
            ${(d.category && !proposal._inlineEditingCategory) ? `
              <span class="ai-proposal-item-val" title="${escapeHtmlAttr(d.category)}" style="color:var(--text); font-weight:700;">${escapeHtmlText(d.category)}</span>
            ` : `
              <div style="display:flex; flex-direction:column; gap:4px; margin-top:2px;">
                <select class="ai-proposal-cat-select" data-proposal-id="${escapeHtmlAttr(propId)}" style="font-size:0.78rem; padding:4px 6px; border-radius:6px; border:1px solid var(--warning, #f59e0b); background:var(--surface); color:var(--text); max-width:180px;">
                  <option value="">Selecione categoria...</option>
                  ${realCategories.map(c => `<option value="${escapeHtmlAttr(c)}" ${d.category === c ? 'selected' : ''}>${escapeHtmlText(c)}</option>`).join('')}
                </select>
              </div>
            `}
          </div>
          <div class="ai-proposal-item">
            <span class="ai-proposal-item-label">Competência</span>
            <span class="ai-proposal-item-val" title="${escapeHtmlAttr(competenceFormatted)}">${escapeHtmlText(competenceFormatted)}</span>
          </div>
          <div class="ai-proposal-item">
            <span class="ai-proposal-item-label">Temporalidade</span>
            <span class="ai-proposal-item-val" title="${escapeHtmlAttr(temporalFormatted)}">${escapeHtmlText(temporalFormatted)}</span>
          </div>
          ${d.notes ? `
            <div class="ai-proposal-item">
              <span class="ai-proposal-item-label">Observação</span>
              <span class="ai-proposal-item-val" title="${escapeHtmlAttr(d.notes)}">${escapeHtmlText(d.notes)}</span>
            </div>
          ` : ''}
        </div>

        ${statusContent}
      </div>
    `;
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

      let proposalHtml = '';
      if (msg.proposal) {
        proposalHtml = renderProposalCardHtml(msg.proposal);
      }

      if (msg.isQuotaExceeded) {
        return `
          <div class="ai-msg assistant">
            <div class="ai-quota-card">
              <div class="ai-quota-card-header">
                <svg class="svg-icon" viewBox="0 0 24 24" style="width:18px; height:18px; stroke:var(--warning); flex-shrink:0;">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <strong style="font-size:0.88rem; color:var(--text);">Limite Diário de IA Atingido</strong>
              </div>
              <p class="ai-quota-card-text" style="margin:6px 0 10px 0; font-size:0.82rem; color:var(--muted); line-height:1.45;">
                ${escapeHtmlText(msg.text)}
              </p>
              <div class="ai-quota-card-actions">
                <button type="button" class="btn primary small" onclick="if (typeof window.openCommercialPlansModal === 'function') window.openCommercialPlansModal();" style="font-size:0.8rem; font-weight:750; padding:6px 12px;">
                  Ver Planos
                </button>
              </div>
            </div>
            <div class="ai-msg-time">${escapeHtmlText(msg.time)}</div>
          </div>
        `;
      }

      return `
        <div class="ai-msg ${bubbleClass}">
          ${msg.text ? `<div class="ai-msg-bubble">${formatAiMessageContent(msg.text)}</div>` : ''}
          ${proposalHtml}
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

  let activeEditingProposalId = null;

  async function confirmExpenseProposal(proposalId) {
    const msg = messages.find(m => m.proposal && m.proposal.proposalId === proposalId);
    if (!msg || !msg.proposal) return;

    if (!msg.proposal.data?.category) {
      if (typeof notify === 'function') {
        notify('Selecione uma categoria antes de confirmar a despesa.', 'warning');
      }
      return;
    }

    if (msg.proposal.status === 'confirmed' || msg.proposal.status === 'confirming') {
      return;
    }

    console.log(`[AI ACTION UI] confirm expense proposal=${proposalId}`);
    msg.proposal.status = 'confirming';
    renderAiMessages();

    try {
      const res = (window.API && typeof window.API.aiConfirmExpense === 'function')
        ? await window.API.aiConfirmExpense({ proposalId, data: msg.proposal.data })
        : await window.API.post('/api/ai/actions/expense/confirm', { proposalId, data: msg.proposal.data });

      if (res && res.success) {
        msg.proposal.status = 'confirmed';

        // Atualiza o estado local do CorvFin de forma reativa sem F5
        if (res.data && typeof window.migrateState === 'function') {
          window.FP_STATE = window.migrateState(res.data);
        } else if (res.expense) {
          const state = (typeof getState === 'function') ? getState() : (window.FP_STATE || {});
          state.variable = state.variable || [];
          if (!state.variable.some(v => v.id === res.expense.id)) {
            state.variable.push(res.expense);
          }
          if (typeof res.revision === 'number') state.revision = res.revision;
        }

        // Re-renderização dos módulos da aplicação
        if (typeof window.render === 'function') window.render();
        if (typeof window.renderExpensesLists === 'function') window.renderExpensesLists();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (typeof window.renderConsolidatedDashboard === 'function') window.renderConsolidatedDashboard();
        if (typeof window.renderMetrics === 'function') window.renderMetrics();
        if (typeof window.renderRibbon === 'function') window.renderRibbon();

        const desc = (res.expense && res.expense.name)
          ? res.expense.name
          : String(msg.proposal.data?.description || 'Despesa').toLocaleUpperCase('pt-BR');

        const amtVal = (res.expense && res.expense.amount) || msg.proposal.data?.amount;
        const amtFormatted = (typeof formatCurrency === 'function' && amtVal)
          ? formatCurrency(amtVal)
          : ('R$ ' + Number(amtVal || 0).toFixed(2).replace('.', ','));

        messages.push({
          id: 'msg_conf_' + Date.now(),
          sender: 'assistant',
          text: `Despesa cadastrada: ${desc} — ${amtFormatted}`,
          time: formatTime()
        });

        if (typeof notify === 'function') {
          notify('Despesa cadastrada com sucesso!', 'success');
        }
      } else {
        msg.proposal.status = 'error';
        msg.proposal.errorMessage = res?.message || 'Erro ao cadastrar despesa.';
      }
    } catch (err) {
      msg.proposal.status = 'error';
      msg.proposal.errorMessage = err?.message || 'Erro ao cadastrar despesa.';
    } finally {
      renderAiMessages();
      saveConversationState();
    }
  }

  async function confirmBenefitProposal(proposalId) {
    const msg = messages.find(m => m.proposal && m.proposal.proposalId === proposalId);
    if (!msg || !msg.proposal) return;

    if (msg.proposal.status === 'confirmed' || msg.proposal.status === 'confirming') {
      return;
    }

    console.log(`[AI ACTION UI] confirm benefit proposal=${proposalId}`);
    msg.proposal.status = 'confirming';
    renderAiMessages();

    try {
      const res = (window.API && typeof window.API.aiConfirmBenefit === 'function')
        ? await window.API.aiConfirmBenefit({ proposalId, data: msg.proposal.data })
        : await window.API.post('/api/ai/actions/benefit/confirm', { proposalId, data: msg.proposal.data });

      if (res && res.success) {
        msg.proposal.status = 'confirmed';

        if (res.benefit) {
          const state = (typeof getState === 'function') ? getState() : (window.FP_STATE || {});
          state.benefitTransactions = state.benefitTransactions || [];
          if (!state.benefitTransactions.some(b => b.id === res.benefit.id)) {
            state.benefitTransactions.push(res.benefit);
          }
          if (typeof res.revision === 'number') state.revision = res.revision;
        }

        // Re-renderização dos módulos de Benefícios e Dashboard
        if (typeof window.render === 'function') window.render();
        if (typeof window.renderBenefitsTab === 'function') window.renderBenefitsTab();
        if (typeof window.updateBenefitCharts === 'function') window.updateBenefitCharts();
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (typeof window.renderConsolidatedDashboard === 'function') window.renderConsolidatedDashboard();

        const desc = (res.benefit && res.benefit.description)
          ? res.benefit.description
          : String(msg.proposal.data?.description || 'Benefício').toLocaleUpperCase('pt-BR');

        const amtVal = (res.benefit && res.benefit.amount) || msg.proposal.data?.amount;
        const amtFormatted = (typeof formatCurrency === 'function' && amtVal)
          ? formatCurrency(amtVal)
          : ('R$ ' + Number(amtVal || 0).toFixed(2).replace('.', ','));

        messages.push({
          id: 'msg_conf_' + Date.now(),
          sender: 'assistant',
          text: `Benefício cadastrado: ${desc} — ${amtFormatted}`,
          time: formatTime()
        });

        if (typeof notify === 'function') {
          notify('Gasto com benefício cadastrado com sucesso!', 'success');
        }
      } else {
        msg.proposal.status = 'error';
        msg.proposal.errorMessage = res?.message || 'Erro ao cadastrar benefício.';
      }
    } catch (err) {
      msg.proposal.status = 'error';
      msg.proposal.errorMessage = err?.message || 'Erro ao cadastrar benefício.';
    } finally {
      renderAiMessages();
      saveConversationState();
    }
  }

  function editExpenseProposal(proposalId) {
    const msg = messages.find(m => m.proposal && m.proposal.proposalId === proposalId);
    if (!msg || !msg.proposal) return;

    activeEditingProposalId = proposalId;
    const pData = msg.proposal.data || {};
    const descUpper = String(pData.description || '').trim().toLocaleUpperCase('pt-BR');

    // Foca o seletor inline de categoria se presente no card
    const catSelectEl = document.querySelector(`.ai-proposal-cat-select[data-proposal-id="${proposalId}"]`);
    if (catSelectEl) {
      catSelectEl.focus();
      return;
    }

    // Se a categoria já estava preenchida mas o usuário clicou em Editar, ativa modo inline no card
    if (!msg.proposal._inlineEditingCategory) {
      msg.proposal._inlineEditingCategory = true;
      renderAiMessages();
      const updatedSelect = document.querySelector(`.ai-proposal-cat-select[data-proposal-id="${proposalId}"]`);
      if (updatedSelect) {
        updatedSelect.focus();
        return;
      }
    }

    if (typeof window.openQuickExpenseDialog === 'function') {
      window.openQuickExpenseDialog();
      if (document.getElementById('quickExpenseName')) {
        document.getElementById('quickExpenseName').value = descUpper;
      }
      if (pData.amount && document.getElementById('quickExpenseAmount')) {
        document.getElementById('quickExpenseAmount').value = pData.amount;
      }
      if (pData.category && document.getElementById('quickExpenseGroup')) {
        document.getElementById('quickExpenseGroup').value = pData.category;
      }
      if (document.getElementById('quickExpenseDestination')) {
        const destVal = pData.destination || pData.payment?.account || (pData.payment?.method === 'pix' ? 'Pix' : 'Dinheiro');
        if (destVal) {
          document.getElementById('quickExpenseDestination').value = destVal;
          if (typeof syncQuickExpenseDestHint === 'function') syncQuickExpenseDestHint();
        }
      }
      if (pData.notes && document.getElementById('quickExpenseNote')) {
        document.getElementById('quickExpenseNote').value = pData.notes;
      }
    } else if (typeof window.openEntryDialog === 'function') {
      window.openEntryDialog({ mode: 'new', type: 'cash' });
      if (document.getElementById('entryName')) {
        document.getElementById('entryName').value = descUpper;
      }
      if (pData.amount && document.getElementById('entryAmount')) {
        document.getElementById('entryAmount').value = pData.amount;
      }
      if (pData.category && document.getElementById('entryGroup')) {
        document.getElementById('entryGroup').value = pData.category;
      }
      if (document.getElementById('entryDestination')) {
        const destVal = pData.destination || pData.payment?.account || (pData.payment?.method === 'pix' ? 'Pix' : 'Dinheiro');
        if (destVal) {
          document.getElementById('entryDestination').value = destVal;
          if (typeof syncDestinationRules === 'function') syncDestinationRules();
        }
      }
      if (pData.payee && document.getElementById('entryPayee')) {
        document.getElementById('entryPayee').value = pData.payee;
      }
      if (pData.payment?.method && document.getElementById('entryPaymentMethod')) {
        document.getElementById('entryPaymentMethod').value = pData.payment.method;
      }
      if (pData.payment?.account && document.getElementById('entryAccount')) {
        document.getElementById('entryAccount').value = pData.payment.account;
      }
    }
  }

  function editBenefitProposal(proposalId) {
    const msg = messages.find(m => m.proposal && m.proposal.proposalId === proposalId);
    if (!msg || !msg.proposal) return;

    activeEditingProposalId = proposalId;
    const pData = msg.proposal.data || {};
    const descUpper = String(pData.description || '').trim().toLocaleUpperCase('pt-BR');

    if (typeof window.openBenefitDialog === 'function') {
      window.openBenefitDialog('new');
      if (document.getElementById('benefitDescription')) {
        document.getElementById('benefitDescription').value = descUpper;
      }
      if (pData.amount && document.getElementById('benefitAmount')) {
        document.getElementById('benefitAmount').value = pData.amount;
      }
      if (pData.benefitType && document.getElementById('benefitType')) {
        document.getElementById('benefitType').value = pData.benefitType;
      }
      if (pData.day && document.getElementById('benefitDay')) {
        document.getElementById('benefitDay').value = pData.day;
      }
      if (pData.competence?.month && document.getElementById('benefitMonth')) {
        document.getElementById('benefitMonth').value = pData.competence.month;
      }
      if (pData.competence?.year && document.getElementById('benefitYear')) {
        document.getElementById('benefitYear').value = pData.competence.year;
      }
      if (pData.notes && document.getElementById('benefitNote')) {
        document.getElementById('benefitNote').value = pData.notes;
      }
    }
  }

  async function cancelExpenseProposal(proposalId) {
    const msg = messages.find(m => m.proposal && m.proposal.proposalId === proposalId);
    if (!msg || !msg.proposal) return;

    if (activeEditingProposalId === proposalId) {
      activeEditingProposalId = null;
    }

    msg.proposal.status = 'cancelled';
    renderAiMessages();

    try {
      if (window.API && typeof window.API.aiCancelExpense === 'function') {
        await window.API.aiCancelExpense({ proposalId });
      }
    } catch (_) {}

    messages.push({
      id: 'msg_canc_' + Date.now(),
      sender: 'assistant',
      text: 'Cadastro cancelado.',
      time: formatTime()
    });
    renderAiMessages();
    saveConversationState();
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
    saveConversationState();

    // Obtém competência ativa da aplicação
    const state = (typeof getState === 'function') ? getState() : {};
    const currentMonth = state.month || (new Date().getMonth() + 1);
    const currentYear = state.year || new Date().getFullYear();

    // Classificação de intenções e detecção multi-turno
    const ACTION_KEYWORDS = /\b(gastei|paguei|comprei|despesa|beneficio|benefício|vr|va|vale|cadastra|cadastre|cadastrar|adicione|adiciona|adicionar|lança|lance|lançar|anota|anote|anotar|gasto|usei|passei|foi)\b/i;
    const UNSUPPORTED_KEYWORDS = /\b(devedor|devedores|me deve|está me devendo|esta me devendo|emprestei|cobrar fulano|fulano me deve|renda extra|rendas extras|freela|freelance|recebi um extra|ganhei um extra|bico|investi|investimento|investimentos|aportei|cdb|tesouro direto|lci|lca|fii|ações|acoes|cripto|bitcoin)\b/i;
    const MULTI_TURN_REPLIES = /\b(no pix|pix|dinheiro|no dinheiro|em dinheiro|no cartao|no cartão|cartao|cartão|credito|crédito|no credito|no crédito|debito|débito|no debito|no débito|boleto|transferencia|transferência|nubank|vr|no vr|va|no va|vt|no vt|vale transporte|vale refeicao|vale refeição|vale alimentacao|vale alimentação|almoco|almoço|jantar|mercado|farmacia|farmácia|sim|confirma|confirmar|pode cadastrar|manda|pode salvar|salva|grava|deixa pra la|deixa pra lá|cancela|cancelar|esquece)\b/i;
    const hasNumbersOrCurrency = /\d+([.,]\d+)?|\b(mil|k|reais|real|conto|pila)\b/i.test(text);
    const isGenericQuestion = /^(como|o que|qual|quanto|você|pode|consegue|ajuda|onde|por que|porque)\b/i.test(text.trim());
    const isActionIntent = (currentModule === 'benefit' || ACTION_KEYWORDS.test(text) || UNSUPPORTED_KEYWORDS.test(text) || MULTI_TURN_REPLIES.test(text) || hasNumbersOrCurrency) && !isGenericQuestion;

    // ISO currentDate
    const now = new Date();
    const currentDateIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    try {
      const payload = {
        message: text,
        conversationId,
        context: {
          month: currentMonth,
          year: currentYear,
          currentDate: currentDateIso
        }
      };

      let actionHandled = false;

      // Se identificar intenção de ação ou resposta multi-turno, consulta o endpoint estruturado
      if (isActionIntent && window.API && typeof window.API.aiInterpretAction === 'function') {
        try {
          const actionRes = await window.API.aiInterpretAction(payload);
          if (actionRes && actionRes.success) {
            if ((actionRes.action === 'create_expense' || actionRes.action === 'create_benefit') && actionRes.proposalId && actionRes.data) {
              actionHandled = true;
              messages.push({
                id: 'msg_prop_' + Date.now(),
                sender: 'assistant',
                text: '',
                proposal: {
                  action: actionRes.action,
                  proposalId: actionRes.proposalId,
                  data: actionRes.data,
                  requiresReview: actionRes.requiresReview,
                  requiresConfirmation: actionRes.requiresConfirmation,
                  warnings: actionRes.warnings,
                  status: actionRes.requiresReview ? 'review' : 'pending'
                },
                time: formatTime()
              });
            } else if (actionRes.action === 'continue_collection' || actionRes.answer || actionRes.action === 'unsupported_action' || actionRes.action === 'insufficient_data' || actionRes.action === 'chat') {
              actionHandled = true;

              // Se a resposta textual confirmou uma proposta pendente, sincroniza o card correspondente
              if (actionRes.confirmed && actionRes.proposalId) {
                const targetMsg = messages.find(m => m.proposal && m.proposal.proposalId === actionRes.proposalId);
                if (targetMsg) {
                  targetMsg.proposal.status = 'confirmed';
                }
              }

              messages.push({
                id: 'msg_' + Date.now(),
                sender: 'assistant',
                text: actionRes.answer || 'Como posso ajudar com seus lançamentos?',
                suggestions: Array.isArray(actionRes.suggestions) ? actionRes.suggestions : [],
                time: formatTime()
              });
            }
          } else if (actionRes && !actionRes.success) {
            const isTerminalStatus = actionRes && [403, 429, 503, 504].includes(actionRes.status);
            const terminalCodes = ['PLAN_ACCESS_DENIED', 'PLAN_REFERENCE_INVALID', 'PLAN_CONFIGURATION_INVALID', 'AI_DAILY_QUOTA_REACHED'];
            const isTerminalCode = actionRes && (terminalCodes.includes(actionRes.code) || terminalCodes.includes(actionRes.error));

            if (isTerminalStatus || isTerminalCode) {
              throw actionRes;
            }
          }
        } catch (actionErr) {
          const isTerminalStatus = actionErr && [403, 429, 503, 504].includes(actionErr.status);
          const terminalCodes = ['PLAN_ACCESS_DENIED', 'PLAN_REFERENCE_INVALID', 'PLAN_CONFIGURATION_INVALID', 'AI_DAILY_QUOTA_REACHED'];
          const isTerminalCode = actionErr && (terminalCodes.includes(actionErr.code) || terminalCodes.includes(actionErr.error));

          if (isTerminalStatus || isTerminalCode) {
            throw actionErr;
          }

          console.warn('[CorvFin AI] Action interpretation fallback to conversational chat:', actionErr?.message);
        }
      }

      if (!actionHandled) {
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
          const errorMsg = response?.message || 'Não consegui processar sua pergunta agora. Tente novamente em instantes.';
          messages.push({
            id: 'msg_err_' + Date.now(),
            sender: 'error',
            text: errorMsg,
            time: formatTime()
          });
        }
      }
    } catch (err) {
      console.error('[CorvFin AI]', {
        status: err?.status,
        code: err?.code || err?.error,
        message: err?.message
      });
      let friendlyError = 'Não foi possível conectar ao Assistente de IA. Verifique sua conexão ou tente novamente.';
      const isQuotaErr = Boolean(err && (err.status === 429 || err.code === 'AI_DAILY_QUOTA_REACHED' || err.error === 'AI_DAILY_QUOTA_REACHED'));
      if (isQuotaErr) {
        friendlyError = err.message || 'Você não possui créditos de IA suficientes para esta operação hoje. Seus créditos renovam à meia-noite.';
        const qLimit = err.limit || err.data?.limit || 0;
        messages.push({
          id: 'msg_quota_' + Date.now(),
          sender: 'assistant',
          isQuotaExceeded: true,
          quotaInfo: {
            limit: qLimit,
            used: err.used || err.data?.used,
            resetsAt: err.resetsAt || err.data?.resetsAt
          },
          text: friendlyError,
          time: formatTime()
        });
        updateAiBadge({ enabled: true, remaining: 0, limit: qLimit });
      } else {
        if (err && (err.status === 403 || err.code === 'PLAN_ACCESS_DENIED' || err.code === 'PLAN_REFERENCE_INVALID')) {
          friendlyError = err.message || 'Seu plano atual não possui acesso ao Assistente de IA.';
        } else if (err && err.status === 503) {
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
      }
    } finally {
      isLoading = false;
      if (sendBtn) sendBtn.disabled = false;
      renderAiMessages();
      saveConversationState();
      if (input) input.focus();
    }
  }

  function updateAiBadge(aiUsage) {
    const badge = document.getElementById('aiCreditsBadge');
    if (!badge || !aiUsage) return;
    badge.style.display = 'inline-flex';
    if (aiUsage.unlimited) {
      badge.textContent = '✨ IA: Ilimitada';
      badge.title = 'Créditos de IA diários ilimitados no seu plano atual';
      badge.classList.remove('ai-credits-badge--empty');
    } else if (aiUsage.enabled !== false) {
      const remaining = Number(aiUsage.remaining != null ? aiUsage.remaining : (aiUsage.limit - (aiUsage.used || 0)));
      const limit = Number(aiUsage.limit || 0);
      if (remaining <= 0) {
        badge.classList.add('ai-credits-badge--empty');
        badge.textContent = `⚠️ 0/${limit} hoje`;
        badge.title = `Créditos diários de IA esgotados. Renovam às 00:00.`;
      } else {
        badge.classList.remove('ai-credits-badge--empty');
        badge.textContent = `✨ ${remaining}/${limit} hoje`;
        badge.title = `Créditos diários de IA (${remaining} de ${limit} restantes). Renovam às 00:00.`;
      }
    } else {
      badge.textContent = 'IA Indisponível';
      badge.classList.add('ai-credits-badge--empty');
    }
  }

  async function refreshAiCredits(options = {}) {
    const badge = document.getElementById('aiCreditsBadge');
    if (!badge) return;

    try {
      const forceRefresh = Boolean(options && (options.forceRefresh || options.refresh));
      let ctx = (window.API && typeof window.API.getCommercialContext === 'function')
        ? await window.API.getCommercialContext({ forceRefresh })
        : null;

      const ai = ctx?.data?.usage?.ai || ctx?.usage?.ai;
      if (ai) {
        updateAiBadge(ai);
      } else {
        badge.style.display = 'none';
      }
    } catch (_) {}
  }
  window.refreshAiCredits = refreshAiCredits;
  window.updateAiBadge = updateAiBadge;

  // Bridges públicas autorizadas
  window.initAiAssistant = initAiAssistant;
  window.openAiAssistant = openAiAssistant;
  window.closeAiAssistant = closeAiAssistant;
  window.toggleAiAssistant = toggleAiAssistant;
  window.sendAiMessage = sendAiMessage;
  window.formatAiMessageContent = formatAiMessageContent;
  window.renderProposalCardHtml = renderProposalCardHtml;
  window.escapeHtmlText = escapeHtmlText;
  window.escapeHtmlAttr = escapeHtmlAttr;
  window.confirmExpenseProposal = confirmExpenseProposal;
  window.confirmBenefitProposal = confirmBenefitProposal;
  window.cancelExpenseProposal = cancelExpenseProposal;
  window.editExpenseProposal = editExpenseProposal;
  window.editBenefitProposal = editBenefitProposal;
  window.startAudioRecording = startAudioRecording;
  window.stopAudioRecording = stopAudioRecording;
  window.cancelAudioRecording = cancelAudioRecording;
  window.handleImageSelected = handleImageSelected;
  window.sendMultimodalMedia = sendMultimodalMedia;
  window.getSupportedAudioMimeType = getSupportedAudioMimeType;
  window.discardAudioPreview = discardAudioPreview;
  window.discardImagePreview = discardImagePreview;
  window.getConversationId = () => conversationId;
  window.getAiMessages = () => messages;
  window.recalculateProposalState = recalculateProposalState;
  window.switchProposalType = switchProposalType;
  window.saveConversationState = saveConversationState;
  window.loadConversationState = loadConversationState;
  window.setSelectedModule = setSelectedModule;
  window.getCurrentModule = () => currentModule;
  window.clearAiConversationStorage = (userId) => {
    const targetUserId = userId || getCurrentUserId();
    if (typeof localStorage !== 'undefined' && targetUserId) {
      try {
        localStorage.removeItem(STORAGE_KEY_PREFIX + targetUserId);
      } catch (_) {}
    }
    resetConversation();
  };

  // Auto-boot quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAiAssistant);
  } else {
    initAiAssistant();
  }
})();
