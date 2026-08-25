# Finanças Pro - Sistema Modular de Gestão Financeira

Aplicação moderna, escalável e modular para gestão financeira pessoal, controle de despesas, devedores, rendas extras, benefícios corporativos, investimentos e simulação sandbox de cenários.

---

## 🚀 Estrutura do Projeto

```
financas-pro-app/
├── server/
│   ├── server.js               # Entry point Node.js / Express
│   ├── config/                 # Configurações de porta, JWT e caminhos
│   ├── middleware/
│   │   ├── auth.js             # Validação de sessão / JWT
│   │   └── permissions.js      # Validador de permissão por módulo (RBAC)
│   ├── services/
│   │   ├── storageService.js   # Leitura/Escrita segura dos JSONs
│   │   └── authService.js      # Hash de senha com bcryptjs e JWT
│   └── data/
│       ├── users.json          # Cadastros, emails, hashes e flags de notificação
│       ├── permissions.json    # Matriz de acesso granular por módulo/usuário
│       └── finances_data.json  # Despesas, Devedores, Extras, Benefícios e Investimentos
├── public/
│   ├── css/
│   │   ├── style.css           # Design system desktop (dark/light, cards, glassmorphism)
│   │   ├── mobile.css          # Media queries específicas e Bottom Navigation Bar
│   │   └── auth.css            # Telas elegantes de Login e Cadastro
│   ├── js/
│   │   ├── api.js              # Fetch client centralizado com interceptor de token
│   │   ├── auth.js             # Gerenciamento de token/login e força de senha
│   │   ├── router.js           # Controle de exibição de módulos conforme permissão
│   │   ├── expenses.js         # Lançamentos fixos/variáveis, ribbon e filtros
│   │   ├── simulation.js       # Novo módulo: Sandbox de despesas isolado
│   │   ├── debtors.js          # Devedores e cobranças com gráficos
│   │   ├── extraIncome.js      # Rendas extras e fontes
│   │   ├── benefits.js         # Controle de benefícios e saldo compartilhado
│   │   ├── investments.js      # Ativos, metas e simulador de juros
│   │   └── admin.js            # Painel admin: gestão de usuários e permissões
│   ├── index.html              # Shell da aplicação (SPA modularizada)
│   └── login.html              # Tela de autenticação e criação de conta
├── package.json
└── README.md
```

---

## 💻 Como Executar

1. **Instalar dependências:**
   ```bash
   cd financas-pro-app
   npm install
   ```

2. **Iniciar o Servidor:**
   ```bash
   npm start
   ```

3. **Acessar a Aplicação:**
   - Acesse `http://localhost:3000` no seu navegador.
   - O primeiro usuário cadastrado automaticamente recebe o papel de Administrador (`is_admin: true`), ou você pode se cadastrar pela tela de login.

---

## 🔒 Recursos de Segurança e Permissões
- **Autenticação JWT:** Tokens seguros com expiração e verificação por requisição.
- **Criptografia Bcrypt:** Senhas com salt e validação de complexidade forte em tempo real.
- **RBAC Granular:** Acesso customizável por módulo (`despesas`, `extras`, `devedores`, `investimentos`, `beneficios`, `configuracoes`).
- **Sandbox Financeiro:** Simulações isoladas sem risco de corrupção dos dados reais.
