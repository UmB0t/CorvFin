# Integração OmniFin V3 com Agente de IA no n8n

Este documento descreve a arquitetura, o fluxo de dados, a configuração de segurança e o System Prompt recomendado para o **Agente de IA do OmniFin V3 via n8n**.

---

## 1. Arquitetura da Integração

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│                 │  JWT  │                 │ Header│                 │       │   LLM / Model   │
│  Frontend       ├──────►│  Backend        ├──────►│  Webhook n8n    ├──────►│ (GPT-4o, Claude,│
│  (OmniFin V3)   │       │  (Node.js/Exp)  │ Secret│  (Workflow)     │       │  Groq, etc.)    │
│                 │◄──────┤                 │◄──────┤                 │◄──────┤                 │
└─────────────────┘       └─────────────────┘       └─────────────────┘       └─────────────────┘
```

### Princípios de Segurança e Isolamento:
1. **Frontend Desacoplado**: O navegador **nunca** fala diretamente com o n8n ou provedores de IA. Não há chaves, tokens de LLM ou URLs de webhook expostas no cliente.
2. **Autenticação Dupla**:
   - Cliente ➔ Backend: Autenticado via **JWT Bearer Token** (`Authorization: Bearer <jwt>`).
   - Backend ➔ n8n: Autenticado via **HTTP Basic Auth** (`Authorization: Basic <base64(user:password)>`).
3. **Escopo Estritamente Read-Only**: O agente **não** realiza mutações (não cria, não edita, não deleta e não marca despesas como pagas).
4. **Isolamento de Dados**: O backend extrai a identidade do usuário a partir do token JWT autenticado (`req.user.id`) e monta o resumo contextual exclusivamente para a conta do usuário.

---

## 2. Variáveis de Ambiente (.env)

No arquivo `.env` do backend OmniFin, configure:

```bash
# URL do Webhook configurado no n8n
N8N_AI_WEBHOOK_URL=http://localhost:5678/webhook/omnifin-ai

# Credenciais HTTP Basic Auth configuradas no Webhook do n8n
N8N_AI_BASIC_AUTH_USER=omnifin_agent
N8N_AI_BASIC_AUTH_PASSWORD=CHANGE_ME_STRONG_PASSWORD_2026

# Timeout da requisição ao n8n em milissegundos (padrão: 30000ms / 30s)
AI_REQUEST_TIMEOUT_MS=30000
```

> **Dica Docker**: Se o OmniFin e o n8n estiverem rodando no mesmo host em containers Docker, use o nome do serviço do n8n (ex: `http://n8n:5678/webhook/omnifin-ai`) ou o IP da rede interna Docker.

---

## 3. Contrato da Requisição (Backend ➔ n8n)

O backend OmniFin envia uma requisição `POST` com `Content-Type: application/json` e o header `Authorization: Basic <base64(user:password)>`.

### Exemplo do Payload Enviado:

```json
{
  "requestId": "req_a1b2c3d_1725000000",
  "conversationId": "conv_usr_123_1725000000",
  "user": {
    "id": "usr_123",
    "name": "Maria Silva"
  },
  "query": {
    "message": "Quanto gastei com alimentação este mês?",
    "month": 8,
    "year": 2026
  },
  "financialContext": {
    "activePeriod": {
      "month": 10,
      "year": 2026
    },
    "period": {
      "month": 10,
      "year": 2026
    },
    "profile": {
      "name": "Maria Silva",
      "baseSalary": 5000,
      "benefit": 800
    },
    "benefits": {
      "amount": 800,
      "va": 500,
      "vr": 300
    },
    "currentPeriod": {
      "month": 10,
      "year": 2026,
      "label": "Outubro/2026",
      "summary": {
        "baseSalary": 5000,
        "benefit": 800,
        "totalExtras": 0,
        "totalDebtorsReceivable": 400,
        "totalDebtorsCounted": 400,
        "totalIncome": 5400,
        "totalExpenses": 3200,
        "totalPaidExpenses": 2000,
        "totalPendingExpenses": 1200,
        "netBalance": 2200
      },
      "expenses": [
        {
          "name": "Supermercado Mensal",
          "group": "Alimentação",
          "destination": "Nubank",
          "amount": 650,
          "status": "pago",
          "type": "variavel"
        },
        {
          "name": "Aluguel",
          "group": "Moradia",
          "destination": "Nubank",
          "amount": 1500,
          "status": "pago",
          "type": "fixa"
        }
      ],
      "categoryBreakdown": [
        {
          "category": "Moradia",
          "totalSpent": 1500,
          "budgetLimit": 2000,
          "isOverBudget": false,
          "pctBudget": 75
        }
      ],
      "destinationBreakdown": [
        { "destination": "Nubank", "total": 2150 }
      ],
      "extras": [],
      "debtors": [
        {
          "debtorName": "Carlos",
          "title": "Empréstimo",
          "amount": 400,
          "destination": "Nubank",
          "status": "pendente",
          "countInTotal": true
        }
      ]
    },
    "periods": [
      {
        "month": 9,
        "year": 2026,
        "label": "Setembro/2026",
        "summary": { "baseSalary": 5000, "benefit": 800, "totalIncome": 5500, "totalExpenses": 3100, "netBalance": 2400 },
        "expenses": [],
        "extras": [],
        "debtors": []
      },
      {
        "month": 10,
        "year": 2026,
        "label": "Outubro/2026",
        "summary": { "baseSalary": 5000, "benefit": 800, "totalIncome": 5400, "totalExpenses": 3200, "netBalance": 2200 },
        "expenses": [],
        "extras": [],
        "debtors": []
      }
    ],
    "investments": {
      "totalInvested": 15000,
      "assets": [
        { "name": "Tesouro Selic", "category": "Renda Fixa", "currentAmount": 10000 },
        { "name": "HGLG11", "category": "FIIs", "currentAmount": 5000 }
      ]
    },
    "shoppingSummary": {
      "totalLists": 1,
      "lists": [{ "name": "Feira Semanal", "totalItems": 8, "pendingItems": 3 }]
    }
  },
  "systemDocumentation": "OMNIFIN V3 - GUIA E DIRETRIZES DO ASSISTENTE...",
  "metadata": {
    "appVersion": "3.4.0",
    "timezone": "America/Sao_Paulo",
    "sentAt": "2026-08-30T13:30:00.000Z"
  }
}
```

---

## 4. Contrato da Resposta Esperada (n8n ➔ Backend)

O nó **Respond to Webhook** do n8n deve retornar `200 OK` com `Content-Type: application/json`:

```json
{
  "success": true,
  "conversationId": "conv_usr_123_1725000000",
  "answer": "Neste mês de Agosto de 2026, você gastou um total de R$ 650,00 com Alimentação (Supermercado Mensal). Note que esse valor ultrapassou o seu teto orçamentário configurado de R$ 600,00 em 8%.",
  "suggestions": [
    "Ver detalhes das despesas de Alimentação",
    "Consultar saldo previsto do mês",
    "Como ajustar o teto da categoria?"
  ]
}
```

---

## 5. System Prompt Recomendado para o LLM

No nó de LLM / AI Agent do n8n, utilize o seguinte prompt do sistema:

```text
Você é o Assistente Inteligente do OmniFin V3, um sistema financeiro pessoal moderno e seguro.

Seu objetivo é ajudar o usuário a compreender seus dados financeiros e esclarecer dúvidas sobre os recursos do sistema.

DIRETRIZES DE PERSONALIDADE, ESTILO E SEGURANÇA (OBRIGATÓRIO):
1. TOM DE VOZ LEVE E NATURAL: Seja caloroso, direto, conciso, conversacional e prestativo. Evite burocracia ou formalidade excessiva.
2. REATIVIDADE E RESPOSTA DIRETA: Responda estritamente ao que o usuário perguntou. Não antecipe relatórios ou análises amplas sem solicitação.
3. REGRA DE NÃO-DESPEJO DE CONTEXTO: Nunca ofereça automaticamente um resumo financeiro completo apenas porque possui os dados disponíveis. Utilize os dados financeiros somente quando forem pertinentes à pergunta atual.
4. SAUDAÇÕES ("Oi", "Olá", "Boa tarde", etc.): Responda com uma saudação curta e amigável em 1 a 2 frases (ex: "Oi, Lorenzo! Como posso te ajudar hoje?"). NÃO despeje despesas, receitas ou saldos sem solicitação.
5. DÚVIDAS DE RECURSOS: Se o usuário perguntar como funciona um módulo (ex: Lista de Compras, Simulação), explique exclusivamente aquele recurso em poucas linhas. NÃO inclua resumo financeiro.
6. TAMANHO DAS RESPOSTAS:
   - Saudações e interações simples: 1 a 2 frases.
   - Dúvidas e perguntas financeiras objetivas: 3 a 6 linhas no máximo.
   - Relatórios e análises aprofundadas: Apenas quando explicitamente solicitado ("faça um resumo", "analise meus gastos", "detalhe tudo", "compare").
7. DIVULGAÇÃO PROGRESSIVA (PROGRESSIVE DISCLOSURE): Ao responder sobre despesas ou saldos, informe primeiro o valor essencial (ex: "Em outubro/2026 você tem R$ 2.858,06 em despesas."). Se conveniente, ofereça detalhamento opcional (ex: "Se quiser, posso detalhar por categoria ou destino.").
8. FORMATAÇÃO LIMPA (SEM MARKDOWN CRU): Escreva em texto corrido e limpo. NÃO utilize formatação Markdown crua com asteriscos excessivos (evite **, *, ##, backticks). Use pontuação natural e valores monetários claros (ex: R$ 1.250,00).
9. OPERAÇÃO READ-ONLY: Você tem acesso estritamente de leitura aos dados. Você NÃO pode executar cadastros, edições, exclusões ou mutações.
10. DADOS VERÍDICOS: Baseie-se estritamente nas informações fornecidas no contexto. Nunca invente transações, valores ou saldos.
```

---

## 6. Exemplo de Teste Manual via cURL

```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SEU_JWT_TOKEN>" \
  -d '{
    "message": "Qual é o meu saldo previsto para este mês?",
    "context": {
      "month": 8,
      "year": 2026
    }
  }'
```
