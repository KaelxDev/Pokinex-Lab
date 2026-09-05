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

A entrada principal é `frontend/src/main.jsx`. A inicialização visual concentra os estilos globais em `frontend/src/styles/index.css`.

```text
src/
├── components/     UI reutilizável e componentes de domínio
├── config/         configuração de execução da aplicação
├── hooks/          estado e efeitos reutilizáveis
├── services/       comunicação HTTP/WebSocket
├── styles/         estilos organizados por domínio
└── utils/          funções auxiliares sem estado
```

Os principais hooks de domínio são:

```text
useAuthSession       sessão autenticada
useUserDirectory     presença, usuários e perfis
useChatHistory       histórico e fila offline
useChatActions       envio/edição/exclusão/reação/reply
useChatMessageEvents eventos recebidos pelo WebSocket
useProfileEditor     edição de perfil/avatar
useChatConnection    ciclo de vida da conexão realtime
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
WebSocket router
      ↓
Service layer / ConnectionManager
      ↓
Database / moderation
      ↓
broadcast para clientes
```

O estado de autenticação é centralizado em `useAuthSession`. O cargo retornado pelo backend é tratado como fonte de verdade; o frontend não deve decidir permissões administrativas por username ou ID.

## Backend

O backend mantém responsabilidades separadas por domínio, aplicação, persistência e transporte:

```text
app/
├── dependencies.py          autenticação HTTP e cookies de sessão
├── routes/                  endpoints HTTP finos
│   ├── auth.py              transporte da autenticação/perfil/avatar
│   └── messages.py          transporte do histórico e DMs
├── services/                regras de aplicação/orquestração
│   ├── public_messages.py   operações do chat público
│   ├── message_history.py   leitura do histórico
│   ├── bot_commands.py      comandos públicos do PokiBot
│   └── moderation*.py       moderação e comandos administrativos
├── repositories/            persistência por agregado/domínio
│   ├── user_repository.py
│   ├── session_repository.py
│   ├── message_repository.py
│   └── direct_message_repository.py
├── infrastructure/          conexão e abstrações de banco
│   └── database.py
├── websocket/               transporte realtime
│   ├── endpoint.py           conexão, origem e autenticação
│   ├── router.py             validação e roteamento dos eventos
│   ├── chat.py               presença e estado das conexões
│   └── schemas.py            contratos dos eventos
├── auth.py                  serviço de autenticação e sessão
├── avatar_storage.py        armazenamento de avatares
├── migrations.py            evolução do schema
├── moderation_bot.py        regras de moderação automática
├── moderation_store.py      operações administrativas de mensagens
├── roles.py                 autoridade de cargos
└── security.py              origem/CORS e proteção de transporte
```

`main.py` permanece como composition root: configura o FastAPI, middleware, arquivos estáticos, routers e lifespan. A lógica de domínio não deve ser recolocada nele.

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

### Fronteira de autenticação HTTP

`dependencies.py` é o único lugar responsável por resolver uma sessão HTTP a partir de cookie ou do bearer legado e por aplicar a checagem de origem quando necessária. As rotas não devem importar umas às outras.

`auth.py` é responsável pela orquestração da autenticação e delega SQL aos repositories. Os repositories são responsáveis por abrir/fechar conexões e executar persistência; não devem conhecer FastAPI.

## Persistência

O schema é versionado por migrações. Mensagens, reações, sessões, avatares e mensagens privadas possuem armazenamento persistente.

Desenvolvimento local pode usar SQLite; produção usa PostgreSQL. A compatibilidade entre os dois mecanismos fica concentrada na camada de infraestrutura/repository, e não nas rotas ou componentes de transporte.

## WebSocket

O transporte e o roteamento são separados:

- `endpoint.py` cuida da origem, autenticação, leitura do socket e limite de payload.
- `router.py` identifica o tipo, valida o payload uma única vez e chama o handler correto.
- `schemas.py` define os contratos Pydantic.
- `chat.py` mantém estado de conexão/presença.
- `services/` concentra regras de aplicação que não pertencem ao transporte.
- `repositories/` concentram operações persistentes.

O contrato detalhado está em [`docs/WEBSOCKET.md`](./WEBSOCKET.md).

## Diretrizes de manutenção

1. Evite colocar lógica de domínio em `main.py`, `endpoint.py` ou componentes React.
2. Use `services/` para orquestração que combina múltiplos módulos e `repositories/` para persistência.
3. Não faça uma rota HTTP importar outra rota HTTP.
4. Não duplique regras de autorização no frontend.
5. Prefira módulos pequenos por responsabilidade a arquivos `Fix`, `Patch` ou `Final`.
6. Toda mudança no protocolo WebSocket deve possuir teste correspondente.
7. Operações otimistas do frontend devem possuir tratamento de sucesso e rollback em caso de falha.
8. Dados de sessão devem continuar em cookie HttpOnly; não recriar armazenamento de token no `localStorage`.
9. Novas configurações de URL devem ser adicionadas a `frontend/src/config/runtime.js`.
10. Mudanças de schema devem entrar por migração versionada.
11. Ao extrair lógica de um módulo legado, preserve o protocolo público e remova a duplicação somente depois de a nova camada estar coberta por teste.
12. O endpoint WebSocket deve permanecer fino; novos eventos devem entrar pelo dispatcher.
