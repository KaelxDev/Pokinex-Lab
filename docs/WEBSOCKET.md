# Contrato WebSocket

O endpoint realtime do Pokinex é `/ws`. A conexão é autenticada pela sessão enviada em cookie HttpOnly. O transporte é responsável por conexão, autenticação, limite de payload e ciclo de vida; o roteamento dos eventos fica em `backend/app/websocket/router.py`.

## Fluxo

```text
Cliente React
    │
    ▼
services/websocket.js
    │
    ▼
/ws
    │
    ├── autenticação/origem
    │
    └── router.dispatch_event()
             │
             ├── chat público
             ├── mensagens privadas
             ├── edição/exclusão
             └── reações
```

## Eventos enviados pelo cliente

| Tipo | Finalidade | Campos principais |
|---|---|---|
| `message` | Enviar mensagem pública | `messageId`, `message`, `replyTo` |
| `edit_message` | Editar mensagem própria | `messageId`, `message` |
| `delete_message` | Excluir mensagem própria | `messageId` |
| `reaction` | Alternar reação | `messageId`, `reaction` |
| `direct_message` | Enviar DM | `messageId`, `recipientId`, `message`, `replyTo` |
| `direct_message_edit` | Editar DM própria | `messageId`, `message` |
| `direct_message_delete` | Excluir DM própria | `messageId` |
| `direct_message_reaction` | Alternar reação em DM | `messageId`, `reaction` |

Todos os eventos são validados pelos modelos Pydantic em `backend/app/websocket/schemas.py` antes do handler ser executado.

## Eventos recebidos pelo cliente

Os eventos de entrada mais importantes são:

- `message`
- `message_edited`
- `message_deleted`
- `message_reaction`
- `users`
- `profile_updated`
- `direct_message`
- `moderation`
- `moderation_lock`
- `chat_reset`
- `messages_cleared`
- `ack`
- `edit_ack`
- `delete_ack`
- `error`

Eventos de sistema podem carregar dados adicionais de presença, como `user_joined` e `user_left`.

## Regras de validação

O payload máximo do WebSocket é `16 KiB`. Eventos desconhecidos são rejeitados com `type=error`. Campos textuais possuem limites definidos nos schemas; identificadores numéricos também são validados.

O cliente não deve confiar em campos de identidade enviados pela interface para autorização. Cargo e permissões administrativas são resolvidos no backend.

## Regras para novas funcionalidades

Uma nova funcionalidade realtime deve seguir esta ordem:

1. criar ou alterar o schema do evento;
2. registrar o evento em `router.py`;
3. implementar o handler na camada de serviço adequada;
4. adicionar testes do dispatcher e do comportamento;
5. atualizar o consumidor React;
6. documentar o evento neste arquivo.

Não coloque novos `if/elif` de domínio diretamente em `endpoint.py`. O endpoint deve permanecer focado no transporte.
