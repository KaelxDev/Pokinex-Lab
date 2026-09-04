# Arquitetura do Pokinex

## Visão geral

O Pokinex é dividido em duas aplicações independentes que se comunicam por HTTP e WebSocket:

```text
┌──────────────────────┐
│      React/Vite      │
│        frontend      │
└──────────┬───────────┘
           │
     HTTP / WebSocket
           │
┌──────────▼───────────┐
│       FastAPI        │
│        backend       │
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│ PostgreSQL / SQLite  │
└──────────────────────┘
```

## Frontend

A entrada principal é `frontend/src/main.jsx`. A inicialização visual agora concentra os estilos globais em `frontend/src/styles/index.css`, deixando o entrypoint responsável somente pela composição da aplicação.

```text
src/
├── components/     UI reutilizável e componentes de domínio
├── config/         configuração de execução da aplicação
├── hooks/          estado e efeitos reutilizáveis
├── services/       comunicação HTTP/WebSocket
├── styles/         ponto único de entrada para estilos globais
└── utils/          funções auxiliares sem estado
```

### Fluxo de chat

```text
MessageComposer
      ↓
WebSocket service
      ↓
FastAPI /ws
      ↓
ConnectionManager
      ↓
Database / moderation
      ↓
broadcast para clientes
```

O estado de autenticação é centralizado em `useAuthSession`. O cargo retornado pelo backend é tratado como fonte de verdade; o frontend não deve decidir permissões administrativas por username ou ID.

## Backend

O backend mantém responsabilidades separadas por domínio e transporte:

```text
app/
├── routes/                 endpoints HTTP
├── websocket/              transporte realtime
├── auth.py                 autenticação e sessão
├── database.py             acesso/configuração de banco
├── migrations.py           evolução do schema
├── moderation_bot.py       regras de moderação automática
├── moderation_store.py     operações administrativas de mensagens
├── roles.py                autoridade de cargos
└── security.py             origem/CORS e proteção de transporte
```

### Regra de autorização

O backend é a autoridade para cargos e ações administrativas.

```text
sessão autenticada
      ↓
roles.py
      ↓
role = owner | moderator | member | bot
      ↓
rotas / WebSocket
      ↓
autoriza ou rejeita
```

A UI pode ocultar comandos para melhorar a experiência, mas não deve ser usada como mecanismo de segurança.

## Persistência

O schema é versionado por migrações. Mensagens, reações, sessões, avatares e mensagens privadas possuem armazenamento persistente.

Desenvolvimento local pode usar SQLite; produção usa PostgreSQL. As consultas ainda preservam compatibilidade entre os dois mecanismos.

## WebSocket

Os eventos devem continuar tipados por `type` e validados pelos modelos de `backend/app/websocket/schemas.py`.

Exemplos:

```text
message
message_edited
message_deleted
message_reaction
users
profile_updated
direct_message
moderation
chat_reset
```

Novos eventos devem ser adicionados ao schema e ao dispatcher correspondente antes de chegar aos componentes de interface.

## Diretrizes de manutenção

1. Evite colocar lógica de domínio em `main.py` ou em componentes React.
2. Não duplique regras de autorização no frontend.
3. Prefira módulos pequenos por responsabilidade a arquivos `Fix`, `Patch` ou `Final`.
4. Toda mudança no protocolo WebSocket deve possuir teste correspondente.
5. Operações otimistas do frontend devem possuir tratamento de sucesso e rollback em caso de falha.
6. Dados de sessão devem continuar em cookie HttpOnly; não recriar armazenamento de token no `localStorage`.
7. Novas configurações de URL devem ser adicionadas a `frontend/src/config/runtime.js`.
8. Mudanças de schema devem entrar por migração versionada.
