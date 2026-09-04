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

O backend mantém responsabilidades separadas por domínio e transporte:

```text
app/
├── routes/                 endpoints HTTP
├── services/              regras de aplicação/orquestração
│   └── moderation.py       comandos e fluxo de moderação
├── websocket/              transporte realtime
│   ├── endpoint.py         conexão, origem e autenticação
│   ├── router.py           validação e roteamento dos eventos
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

O transporte e o roteamento são separados:

- `endpoint.py` cuida da origem, autenticação, leitura do socket e limite de payload.
- `router.py` identifica o tipo, valida o payload uma única vez e chama o handler correto.
- `schemas.py` define os contratos Pydantic.
- `chat.py` mantém estado de conexão/presença e operações de mensagem.
- `services/` concentra regras de aplicação que não pertencem ao transporte.

O contrato detalhado está em [`docs/WEBSOCKET.md`](./WEBSOCKET.md).

## Diretrizes de manutenção

1. Evite colocar lógica de domínio em `main.py`, `endpoint.py` ou componentes React.
2. Use `services/` para orquestração que combina múltiplos módulos e stores/repositories para persistência.
3. Não duplique regras de autorização no frontend.
4. Prefira módulos pequenos por responsabilidade a arquivos `Fix`, `Patch` ou `Final`.
5. Toda mudança no protocolo WebSocket deve possuir teste correspondente.
6. Operações otimistas do frontend devem possuir tratamento de sucesso e rollback em caso de falha.
7. Dados de sessão devem continuar em cookie HttpOnly; não recriar armazenamento de token no `localStorage`.
8. Novas configurações de URL devem ser adicionadas a `frontend/src/config/runtime.js`.
9. Mudanças de schema devem entrar por migração versionada.
10. Ao extrair lógica de um módulo legado, preserve o protocolo público e remova a duplicação somente depois de a nova camada estar coberta por teste.
11. O endpoint WebSocket deve permanecer fino; novos eventos devem entrar pelo dispatcher.
