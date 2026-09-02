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
        text: 'Olá! Sou o Assistente OmniFin. Como posso ajudar você hoje com seus gastos, benefícios, orçamentos ou recursos do sistema?',
        time: formatTime()
      }
    ];
    renderAiMessages();
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
    const d = proposal.data;
    const propId = proposal.proposalId || '';
    const status = proposal.status || 'pending';
    const isBenefit = proposal.action === 'create_benefit' || Boolean(d.benefitType);

    const descFormatted = String(d.description || (isBenefit ? 'NOVO BENEFÍCIO' : 'NOVA DESPESA')).trim().toLocaleUpperCase('pt-BR');

    const amtFormatted = (typeof formatCurrency === 'function' && d.amount)
      ? formatCurrency(d.amount)
      : ('R$ ' + Number(d.amount || 0).toFixed(2).replace('.', ','));

    const monthName = (d.competence && d.competence.month >= 1 && d.competence.month <= 12)
      ? MONTH_NAMES_PT[d.competence.month - 1]
      : '';
    const competenceFormatted = monthName ? `${monthName}/${d.competence.year || new Date().getFullYear()}` : 'Competência atual';

    // Checagem rigorosa de campos obrigatórios e review
    const hasValidDesc = Boolean(d.description && String(d.description).trim().length > 0);
    const hasValidAmt = Boolean(d.amount && !isNaN(Number(d.amount)) && Number(d.amount) > 0);
    const hasValidCat = isBenefit ? true : Boolean(d.category && String(d.category).trim().length > 0);
    const hasValidDest = isBenefit ? true : Boolean(d.destination && String(d.destination).trim().length > 0);
    const hasValidType = isBenefit ? Boolean(d.benefitType && ['saude', 'vr', 'va', 'transporte', 'educacao', 'cultura', 'farmacia'].includes(d.benefitType)) : true;

    const isReviewRequired = Boolean(
      proposal.requiresReview ||
      proposal.status === 'review' ||
      !hasValidDesc ||
      !hasValidAmt ||
      !hasValidCat ||
      !hasValidDest ||
      !hasValidType
    );

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
            <button type="button" class="btn btn-primary small ai-proposal-retry-btn" data-proposal-id="${escapeHtmlAttr(propId)}">Tentar novamente</button>
            <button type="button" class="btn soft small ai-proposal-edit-btn" data-proposal-id="${escapeHtmlAttr(propId)}">Editar</button>
            <button type="button" class="btn ghost small ai-proposal-cancel-btn" data-proposal-id="${escapeHtmlAttr(propId)}">Cancelar</button>
          </div>
        </div>
      `;
    } else {
      // Status 'pending' ou 'review'
      let alertHtml = '';
      if (isReviewRequired || (Array.isArray(proposal.warnings) && proposal.warnings.length > 0)) {
        const warningsList = Array.isArray(proposal.warnings) && proposal.warnings.length > 0 ? [...proposal.warnings] : [];
        if (!isBenefit && !hasValidCat && !warningsList.some(w => w.toLowerCase().includes('categoria'))) {
          warningsList.push('Informe ou selecione uma categoria válida.');
        }
        if (!isBenefit && !hasValidDest && !warningsList.some(w => w.toLowerCase().includes('destino') || w.toLowerCase().includes('conta'))) {
          warningsList.push('Informe ou selecione um destino de pagamento.');
        }
        if (isBenefit && !hasValidType && !warningsList.some(w => w.toLowerCase().includes('tipo'))) {
          warningsList.push('Selecione um tipo de benefício válido (VR, VA, Saúde, etc.).');
        }
        alertHtml = `
          <div class="ai-proposal-alert">
            ${warningsList.join('<br>')}
          </div>
        `;
      }

      statusContent = `
        ${alertHtml}
        <div class="ai-proposal-actions">
          <button type="button" class="btn btn-primary small ai-proposal-confirm-btn" data-proposal-id="${escapeHtmlAttr(propId)}" ${isReviewRequired ? 'disabled aria-disabled="true" title="Complete os campos antes de confirmar"' : ''}>
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

    if (isBenefit) {
      const typeLabel = BENEFIT_LABELS[d.benefitType] || d.benefitType || 'Não informado';
      return `
        <div class="ai-proposal-card">
          <div class="ai-proposal-header">
            <span class="ai-proposal-tag">
              <svg class="svg-icon" viewBox="0 0 24 24" style="width:12px; height:12px;"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              Benefício Identificado
            </span>
            <span style="font-size:0.72rem; color:var(--muted); font-weight:700;">Requer confirmação</span>
          </div>

          <div class="ai-proposal-main">
            <div class="ai-proposal-desc">${escapeHtmlText(descFormatted)}</div>
            <div class="ai-proposal-amount">${escapeHtmlText(amtFormatted)}</div>
          </div>

          <div class="ai-proposal-grid">
            <div class="ai-proposal-item">
              <span class="ai-proposal-item-label">Tipo</span>
              <span class="ai-proposal-item-val" style="color:${d.benefitType ? 'var(--text)' : 'var(--warning, #f59e0b)'};">
                ${escapeHtmlText(typeLabel)}
              </span>
            </div>
            <div class="ai-proposal-item">
              <span class="ai-proposal-item-label">Dia</span>
              <span class="ai-proposal-item-val">Dia ${escapeHtmlText(d.day || 1)}</span>
            </div>
            <div class="ai-proposal-item">
              <span class="ai-proposal-item-label">Competência</span>
              <span class="ai-proposal-item-val">${escapeHtmlText(competenceFormatted)}</span>
            </div>
            <div class="ai-proposal-item">
              <span class="ai-proposal-item-label">Observação</span>
              <span class="ai-proposal-item-val">${escapeHtmlText(d.notes || 'Nenhuma')}</span>
            </div>
          </div>

          ${statusContent}
        </div>
      `;
    }

    return `
      <div class="ai-proposal-card">
        <div class="ai-proposal-header">
          <span class="ai-proposal-tag">
            <svg class="svg-icon" viewBox="0 0 24 24" style="width:12px; height:12px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
            Despesa Identificada
          </span>
          <span style="font-size:0.72rem; color:var(--muted); font-weight:700;">Requer confirmação</span>
        </div>

        <div class="ai-proposal-main">
          <div class="ai-proposal-desc">${escapeHtmlText(descFormatted)}</div>
          <div class="ai-proposal-amount">${escapeHtmlText(amtFormatted)}</div>
        </div>

        <div class="ai-proposal-grid">
          <div class="ai-proposal-item">
            <span class="ai-proposal-item-label">Categoria</span>
            <span class="ai-proposal-item-val" style="color:${d.category ? 'var(--text)' : 'var(--warning, #f59e0b)'};">
              ${escapeHtmlText(d.category || 'Não identificada')}
            </span>
          </div>
          <div class="ai-proposal-item">
            <span class="ai-proposal-item-label">Destino</span>
            <span class="ai-proposal-item-val" style="color:${d.destination ? 'var(--text)' : 'var(--warning, #f59e0b)'};">
              ${escapeHtmlText(d.destination || 'Não identificado')}
            </span>
          </div>
          <div class="ai-proposal-item">
            <span class="ai-proposal-item-label">Competência</span>
            <span class="ai-proposal-item-val">${escapeHtmlText(competenceFormatted)}</span>
          </div>
          <div class="ai-proposal-item">
            <span class="ai-proposal-item-label">Parcelas</span>
            <span class="ai-proposal-item-val">${escapeHtmlText(d.installments && d.installments > 1 ? `${d.installments}x` : 'À vista (1x)')}</span>
          </div>
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

        // Atualiza o estado local do OmniFin de forma reativa sem F5
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
    }
  }

  function editExpenseProposal(proposalId) {
    const msg = messages.find(m => m.proposal && m.proposal.proposalId === proposalId);
    if (!msg || !msg.proposal) return;

    activeEditingProposalId = proposalId;
    const pData = msg.proposal.data || {};
    const descUpper = String(pData.description || '').trim().toLocaleUpperCase('pt-BR');

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
      if (pData.destination && document.getElementById('quickExpenseDestination')) {
        document.getElementById('quickExpenseDestination').value = pData.destination;
        if (typeof syncQuickExpenseDestHint === 'function') syncQuickExpenseDestHint();
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
      if (pData.destination && document.getElementById('entryDestination')) {
        document.getElementById('entryDestination').value = pData.destination;
        if (typeof syncDestinationRules === 'function') syncDestinationRules();
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

    // Classificação de intenções e detecção multi-turno
    const ACTION_KEYWORDS = /\b(gastei|paguei|comprei|despesa|beneficio|benefício|vr|va|vale|cadastra|cadastre|cadastrar|adicione|adiciona|adicionar|lança|lance|lançar|anota|anote|anotar|gasto|usei|passei|foi)\b/i;
    const UNSUPPORTED_KEYWORDS = /\b(devedor|devedores|me deve|está me devendo|esta me devendo|emprestei|cobrar fulano|fulano me deve|renda extra|rendas extras|freela|freelance|recebi um extra|ganhei um extra|bico|investi|investimento|investimentos|aportei|cdb|tesouro direto|lci|lca|fii|ações|acoes|cripto|bitcoin)\b/i;
    const MULTI_TURN_REPLIES = /\b(no pix|pix|dinheiro|no dinheiro|no cartao|no cartão|nubank|vr|va|vale refeicao|vale refeição|vale alimentacao|vale alimentação|almoco|almoço|jantar|mercado|farmacia|farmácia|sim|confirma|confirmar|pode cadastrar|manda|pode salvar|salva|grava|deixa pra la|deixa pra lá|cancela|cancelar|esquece)\b/i;
    const hasNumbersOrCurrency = /\d+([.,]\d+)?|\b(mil|k|reais|real|conto|pila)\b/i.test(text);
    const isGenericQuestion = /^(como|o que|qual|quanto|você|pode|consegue|ajuda|onde|por que|porque)\b/i.test(text.trim());
    const isActionIntent = (ACTION_KEYWORDS.test(text) || UNSUPPORTED_KEYWORDS.test(text) || MULTI_TURN_REPLIES.test(text) || hasNumbersOrCurrency) && !isGenericQuestion;

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
          }
        } catch (actionErr) {
          if (actionErr && actionErr.status !== 503 && actionErr.status !== 504) {
            console.warn('[OmniFin AI] Action interpretation fallback to conversational chat:', actionErr.message);
          } else {
            throw actionErr;
          }
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
  window.confirmExpenseProposal = confirmExpenseProposal;
  window.confirmBenefitProposal = confirmBenefitProposal;
  window.cancelExpenseProposal = cancelExpenseProposal;
  window.editExpenseProposal = editExpenseProposal;
  window.editBenefitProposal = editBenefitProposal;

  // Auto-boot quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAiAssistant);
  } else {
    initAiAssistant();
  }
})();
