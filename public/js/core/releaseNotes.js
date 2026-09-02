/* ==========================================================================
   CENTRAL DE RELEASE NOTES / ATUALIZAÇÕES (releaseNotes.js)
   OmniFin V3 - Vanilla JS Architecture
   ========================================================================== */

(function () {
  "use strict";

  // Catálogo Central Estático de Releases do OmniFin
  const RELEASES_CATALOG = [
    {
      version: "3.7.0",
      date: "01/09/2026",
      tag: "Mais Recente",
      isLatest: true,
      title: "v3.7 — Lançamentos mais rápidos e flexíveis",
      summary: "Esta atualização deixa o dia a dia no OmniFin mais rápido, organizado e preciso, principalmente na hora de cadastrar lançamentos e acompanhar pagamentos e recebimentos.",
      news: [
        "Assistente com memória transacional: agora é possível informar uma compra ou benefício naturalmente ao longo da conversa. O OmniFin mantém o contexto, pergunta apenas os dados que faltam e monta o lançamento para confirmação.",
        "Cadastro rápido de despesas: agora é possível registrar uma despesa de forma simplificada, utilizando apenas as informações essenciais. O cadastro completo continua disponível quando forem necessários mais detalhes.",
        "Pagamentos parciais: despesas podem ser pagas parcialmente, e o OmniFin passa a acompanhar o valor já pago e o saldo restante até a quitação.",
        "Recebimentos parciais: valores de Devedores e Rendas Extras podem ser recebidos parcialmente, com acompanhamento de quanto já foi recebido e quanto ainda está pendente. No caso de cobranças parceladas de devedores, cada parcela mantém seu próprio acompanhamento.",
        "Cadastros rápidos e globais: novos atalhos na interface permitem iniciar lançamentos de Despesas, Devedores, Rendas Extras e Benefícios de forma mais prática e a partir de qualquer tela.",
        "Organização alfabética: categorias e destinos agora são apresentados em ordem alfabética nos campos de seleção, facilitando a localização."
      ],
      improvements: [
        "Indicadores financeiros: totais pagos, recebidos e pendentes passam a representar corretamente pagamentos e recebimentos parciais.",
        "Dashboard atualizado: indicadores e informações financeiras são atualizados após novos lançamentos e movimentações, mantendo a visão consolidada sincronizada.",
        "Parcelas de devedores: o acompanhamento das cobranças parceladas foi aprimorado para que pagamentos e recebimentos sejam associados corretamente às respectivas parcelas.",
        "Experiência de cadastro: fluxos de lançamento foram aprimorados para reduzir etapas em operações simples sem remover as opções avançadas do cadastro completo.",
        "Experiência mobile: os novos atalhos e fluxos de cadastro foram adaptados para facilitar lançamentos pelo celular.",
        "Navegação e interface: pequenos refinamentos de navegação e apresentação para melhorar a leitura e o uso dos atalhos do sistema.",
        "Compatibilidade total: os novos controles de pagamentos e recebimentos mantêm compatibilidade com lançamentos cadastrados anteriormente."
      ],
      fixes: [
        "Ajustes no cálculo e exibição de saldos restantes ao registrar pagamentos e recebimentos parciais.",
        "Refinamentos no alinhamento visual de dicas e atalhos na barra lateral e painéis de controle."
      ]
    },
    {
      version: "3.6.0",
      date: "01/09/2026",
      tag: "",
      isLatest: false,
      title: "Navegação mais prática e OmniFin no seu celular",
      summary: "Navegação mensal direta no Dashboard, novo atalho para o mês atual, paginação de 10 usuários por página na gestão de usuários, experiência otimizada ao adicionar o OmniFin à Tela de Início do celular e aprimoramentos na navegação mobile.",
      news: [
        "Agora é possível navegar entre diferentes meses diretamente pelo Dashboard.",
        "Novo atalho \"Mês Atual\" permite retornar rapidamente à competência atual.",
        "O OmniFin agora está preparado para ser adicionado à Tela de Início do celular, oferecendo uma experiência mais próxima de um aplicativo.",
        "Nova identidade de instalação mobile com nome e ícone próprios do OmniFin."
      ],
      improvements: [
        "A competência selecionada permanece sincronizada entre Dashboard, Despesas e Assistente OmniFin.",
        "A Gestão de Usuários agora possui paginação, exibindo até 10 usuários por página para facilitar a leitura e administração.",
        "Navegação mobile aprimorada com acesso rápido aos módulos favoritos.",
        "Os módulos que não estiverem entre os favoritos continuam disponíveis através do menu \"Mais\".",
        "Melhor integração visual do OmniFin com dispositivos móveis quando adicionado à Tela de Início.",
        "Melhor aproveitamento da área útil da tela em dispositivos móveis."
      ],
      fixes: [
        "Correção de situações em que módulos não selecionados como favoritos podiam ficar inacessíveis na navegação mobile.",
        "Ajustes na navegação mobile para garantir que todos os módulos disponíveis continuem acessíveis pelo menu \"Mais\".",
        "Ajustes de compatibilidade da experiência instalada em ambientes onde o OmniFin é disponibilizado em um endereço interno do domínio."
      ]
    },
    {
      version: "3.5.0",
      date: "31/08/2026",
      tag: "",
      isLatest: false,
      title: "Assistente OmniFin com IA e nova experiência mobile",
      summary: "Novo Assistente OmniFin integrado ao n8n e Gemini para consultas financeiras inteligentes, com contexto histórico por usuário, memória de conversa, nova navegação mobile personalizável e melhorias em relatórios.",
      news: [
        "Novo Assistente OmniFin com Inteligência Artificial integrado diretamente ao sistema.",
        "Consultas financeiras em linguagem natural sobre despesas, categorias, destinos, devedores, investimentos, rendas extras e demais informações do usuário.",
        "Integração do Assistente com n8n e Gemini.",
        "Contexto financeiro isolado por usuário autenticado.",
        "Memória de conversa para maior continuidade entre mensagens.",
        "Suporte a consultas sobre diferentes competências sem necessidade de alterar manualmente o mês na tela.",
        "Perguntas sobre meses anteriores e comparação entre períodos.",
        "Assistente também responde dúvidas sobre o funcionamento do OmniFin.",
        "Nova navegação mobile personalizável.",
        "Escolha de até 3 módulos favoritos na barra inferior do celular.",
        "Novo botão central '+' para Cadastro Rápido no mobile.",
        "Cadastro rápido de Despesa, Devedor e Benefício pelo celular."
      ],
      improvements: [
        "Assistente passou a responder de forma mais curta, natural, reativa e conversacional.",
        "Saudações simples não disparam mais resumos financeiros automaticamente.",
        "Respostas agora possuem melhor formatação e leitura no widget de conversa.",
        "Indicador de processamento do Assistente alterado para 'Digitando...'.",
        "Competência selecionada passa a ser referência padrão, sem limitar o Assistente ao mês atual.",
        "Benefício passou a ser tratado separadamente do salário base.",
        "Métricas financeiras utilizadas pelo Assistente foram alinhadas às regras oficiais do módulo de Despesas e Dashboard.",
        "Rendas Extras e Devedores respeitam as mesmas regras de composição utilizadas no OmniFin.",
        "Devedores com contagem no total passam a compor corretamente a renda mensal quando aplicável.",
        "Navegação mobile agora respeita favoritos individuais por usuário.",
        "Favoritos mobile continuam respeitando as permissões de acesso do usuário.",
        "Menu 'Mais' mantém acesso aos módulos restantes.",
        "Melhor adaptação da barra inferior para área segura (safe-area) em iPhone e dispositivos móveis.",
        "Visualização de Devedores aprimorada para identificar rapidamente cobranças já quitadas/pagas com badge acessível.",
        "Estado de quitação passa a ficar visível sem necessidade de clique.",
        "Relatório de Devedores agora utiliza as colunas 'Parcela' e 'Parcelamento'.",
        "Removida a coluna redundante 'Total do Débito' do relatório.",
        "Exportação CSV acompanha a nova estrutura do relatório.",
        "Impressão e exportação PDF aprimoradas para fundo totalmente branco sem áreas cinzas residuais.",
        "Segurança e Privacidade: o Assistente é estritamente de consulta (somente leitura), acessando exclusivamente os dados da conta autenticada com isolamento absoluto."
      ],
      fixes: [
        "Maior estabilidade na comunicação com o Assistente OmniFin.",
        "Correções no carregamento e envio de mensagens para a Inteligência Artificial.",
        "Melhor tratamento de indisponibilidades e falhas de conexão do Assistente.",
        "Correções na interpretação das respostas geradas pela IA.",
        "Ajustes nas consultas financeiras de diferentes meses e períodos.",
        "Correção na diferenciação entre salário base e benefícios nos cálculos apresentados pelo Assistente.",
        "Melhorias na consistência das informações financeiras apresentadas durante as conversas.",
        "Correção do bloco cinza exibido após o término do conteúdo na impressão / Salvar como PDF.",
        "Correção de redundância visual no Relatório de Devedores.",
        "Correções de posicionamento do Assistente OmniFin na navegação mobile.",
        "Ajustes de responsividade e experiência de uso em dispositivos móveis."
      ]
    },
    {
      version: "3.4.0",
      date: "30/08/2026",
      tag: "",
      isLatest: false,
      title: "Personalização, onboarding e melhorias em Investimentos",
      summary: "Novas opções de personalização visual, ícones semânticos em Investimentos, Guia do Sistema ampliado e uma experiência de boas-vindas para novos usuários.",
      news: [
        "Categorias de gastos agora possuem cores personalizáveis.",
        "Nova paleta rápida de cores para categorias.",
        "Suporte a qualquer cor personalizada através do seletor de cor.",
        "Novos ícones semânticos na área de Investimentos.",
        "Novas representações visuais para categorias como Renda Fixa, Ações, FIIs, Cripto, Reserva de Emergência, Veículo, Viagem, Residência e Outros.",
        "Guia do Sistema expandido com documentação da Lista de Compras Inteligente.",
        "Guia do Sistema expandido com documentação completa da Simulação e seus cenários sandbox.",
        "Novo modal de boas-vindas para novos usuários.",
        "Acesso direto ao Guia do Sistema através do onboarding inicial."
      ],
      improvements: [
        "Cores personalizadas das categorias agora são refletidas no Perfil, Dashboard, Dashboard Consolidado e Simulação.",
        "Categorias antigas continuam recebendo cores padrão automaticamente quando não possuem personalização própria.",
        "Melhor consistência visual entre categorias, gráficos, chips e indicadores.",
        "Onboarding agora é persistido individualmente por usuário.",
        "Novos usuários recebem orientação inicial apenas no primeiro acesso.",
        "Usuários existentes continuam utilizando o sistema normalmente sem interrupção pelo novo onboarding.",
        "Guia do Sistema reorganizado para contemplar os recursos mais recentes da plataforma.",
        "Ícones de Investimentos passaram a seguir o mesmo padrão outline do restante do OmniFin."
      ],
      fixes: [
        "Correção do ícone \"Outros\", que apresentava deformação visual no desenho do globo.",
        "Correção da abertura do onboarding após a hidratação dos dados do usuário.",
        "Correção do onboarding para usuários criados através do painel administrativo.",
        "Correção da persistência do estado de conclusão do onboarding após F5, logout e novo login.",
        "Ajustes de compatibilidade para categorias antigas que ainda não possuem campo de cor."
      ]
    },
    {
      version: "3.3.0",
      date: "30/08/2026",
      tag: "",
      isLatest: false,
      title: "Dashboard Consolidado e nova gestão de permissões",
      summary: "Visão financeira consolidada com métricas por categoria e destino, nova página inicial /dashboard e gestão simplificada de permissões dos usuários.",
      news: [
        "Novo módulo Dashboard com visão consolidada das informações financeiras do usuário.",
        "Dashboard agora possui URL própria: /dashboard e passa a ser a página inicial após o login.",
        "Indicadores de Total Consolidado, Despesas, Valores a Receber, Pago/Recebido e Pendente.",
        "Consolidação financeira detalhada por Categoria e por Destino / Cartão.",
        "Filtros específicos para exploração dos dados consolidados.",
        "Dashboard integrado ao sistema de permissões (RBAC) e de manutenção dos módulos."
      ],
      improvements: [
        "Dashboard removido da área interna de Despesas e transformado em módulo independente.",
        "Dashboard posicionado acima de Despesas na navegação lateral.",
        "Gestão de permissões dos usuários reorganizada para evitar excesso de controles diretamente na tabela.",
        "Usuários comuns passam a possuir uma ação dedicada 'Gerenciar' para configuração dos módulos liberados.",
        "Administradores continuam identificados com acesso total.",
        "Configuração de Permissões Padrão e Manutenção dos Módulos atualizadas para contemplar Dashboard.",
        "Padronização da lista canônica de módulos entre interface administrativa e aplicação."
      ],
      fixes: [
        "Correção da ausência do Dashboard na grade de Manutenção dos Módulos.",
        "Compatibilidade com configurações antigas de manutenção que ainda não possuíam a chave 'dashboard'.",
        "Correções de integração do Dashboard com roteamento, autenticação e permissões.",
        "Correção da validação administrativa para aceitar Dashboard como módulo válido."
      ]
    },
    {
      version: "3.2.0",
      date: "30/08/2026",
      tag: "",
      isLatest: false,
      title: "Lista de Compras Inteligente e melhorias nos lançamentos",
      summary: "Nova Lista de Compras Inteligente com catálogo padrão e autocomplete com aprendizado, novo wizard de despesas em etapas e suporte completo a Pix e Dinheiro.",
      news: [
        "Nova Lista de Compras Inteligente.",
        "Catálogo padrão de produtos para agilizar o cadastro de itens.",
        "Autocomplete durante a digitação dos produtos.",
        "Aprendizado de novos itens personalizados adicionados pelo usuário.",
        "Organização dos itens da lista por categorias.",
        "Suporte à quantidade e unidade dos produtos.",
        "Melhorias no fluxo de criação e gerenciamento das listas.",
        "Novo fluxo de cadastro de despesas em etapas.",
        "Métodos de pagamento À Vista, Parcelado e Fixa (Mensal).",
        "Destinos Pix e Dinheiro com fluxo simplificado e quitação automática.",
        "Vencimento padrão configurável por destino de pagamento."
      ],
      improvements: [
        "Herança automática do vencimento cadastrado no destino.",
        "Fluxo simplificado para despesas pagas via Pix ou Dinheiro.",
        "Melhor organização e resumo das informações durante o cadastro de despesas.",
        "Autocomplete da Lista de Compras com suporte a teclado e mouse.",
        "Dropdown de sugestões protegido contra cortes e sobreposição de outros cards.",
        "Melhor compatibilidade com despesas antigas já cadastradas."
      ],
      fixes: [
        "Correção do carregamento inicial que podia exibir temporariamente dados fictícios antes da sincronização.",
        "Correção dos seletores de mês e ano de competência no cadastro de despesas.",
        "Correção do posicionamento das mensagens de validação dentro do Wizard de despesas.",
        "Correção visual do dropdown de autocomplete da Lista de Compras."
      ]
    },
    {
      version: "3.1.0",
      date: "30/08/2026",
      tag: "",
      isLatest: false,
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
