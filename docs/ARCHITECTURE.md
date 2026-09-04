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

A entrada principal é `frontend/src/main.jsx`. A inicialização visual concentra os estilos globais em `frontend/src/styles/index.css`, deixando o entrypoint responsável somente pela composição da aplicação.

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
WebSocket endpoint
      ↓
Service layer / ConnectionManager
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
├── services/              regras de aplicação/orquestração
│   └── moderation.py       comandos e fluxo de moderação
├── websocket/              transporte realtime
│   ├── endpoint.py         dispatcher WebSocket
│   ├── chat.py             presença, mensagens e reações
│   └── schemas.py          contratos dos eventos
├── auth.py                 autenticação e sessão
├── database.py             acesso/configuração de banco
├── migrations.py           evolução do schema
├── moderation_bot.py       regras de moderação automática
├── moderation_store.py     operações administrativas de mensagens
├── roles.py                autoridade de cargos
└── security.py             origem/CORS e proteção de transporte
```

`main.py` deve permanecer como composition root: configura o FastAPI, middleware, arquivos estáticos, routers e lifespan. A lógica de domínio não deve ser recolocada nele.

### Regra de autorização

O backend é a autoridade para cargos e ações administrativas.

```text
sessão autenticada
      ↓
roles.py
      ↓
role = owner | moderator | member | bot
      ↓
services / routes / WebSocket
      ↓
autoriza ou rejeita
```

A UI pode ocultar comandos para melhorar a experiência, mas não deve ser usada como mecanismo de segurança.

## Persistência

O schema é versionado por migrações. Mensagens, reações, sessões, avatares e mensagens privadas possuem armazenamento persistente.

Desenvolvimento local pode usar SQLite; produção usa PostgreSQL. As consultas ainda preservam compatibilidade entre os dois mecanismos.

## WebSocket

O transporte está separado do fluxo de aplicação. `backend/app/websocket/endpoint.py` valida a conexão, autentica a sessão, desserializa eventos e encaminha cada tipo para seu handler. Regras de moderação ficam em `services/moderation.py`; estado de conexões e operações de mensagens ficam em `websocket/chat.py`.

Os eventos continuam tipados por `type` e validados pelos modelos de `backend/app/websocket/schemas.py`.

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
2. Use `services/` para orquestração que combina múltiplos módulos e `database.py`/stores para persistência.
3. Não duplique regras de autorização no frontend.
4. Prefira módulos pequenos por responsabilidade a arquivos `Fix`, `Patch` ou `Final`.
5. Toda mudança no protocolo WebSocket deve possuir teste correspondente.
6. Operações otimistas do frontend devem possuir tratamento de sucesso e rollback em caso de falha.
7. Dados de sessão devem continuar em cookie HttpOnly; não recriar armazenamento de token no `localStorage`.
8. Novas configurações de URL devem ser adicionadas a `frontend/src/config/runtime.js`.
9. Mudanças de schema devem entrar por migração versionada.
10. Ao extrair lógica de um módulo legado, preserve o protocolo público e remova a duplicação somente depois de a nova camada estar coberta por teste.
