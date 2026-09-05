# Pokinex Architecture Cleanup

Registro incremental das refatorações estruturais aplicadas sem alterar o contrato funcional do chat.

## Frontend

- `App.jsx` é o shell canônico.
- `useChatActions` concentra ações de mensagem.
- `useChatMessageEvents` concentra eventos recebidos pelo WebSocket.
- `useProfileEditor` concentra edição de perfil e avatar.
- `useUserDirectory` concentra presença, perfis e identidade.
- estilos foram consolidados em `styles/` e o legado foi isolado.

## Backend

- `main.py` mantém configuração HTTP e composição da aplicação.
- `websocket/endpoint.py` mantém transporte, autenticação e ciclo de conexão.
- `websocket/router.py` valida e despacha eventos.
- `services/public_messages.py` concentra operações de mensagens públicas.
- `services/message_runtime.py` concentra estado volátil de deduplicação/cache.
- `services/moderation.py` concentra moderação automática.
- `services/moderation_commands.py` concentra comandos públicos e administrativos.
- `services/public_identity.py` concentra o payload público de identidade.
- `repositories/` concentra persistência por entidade.
- `infrastructure/database.py` concentra infraestrutura de banco.

## Regra de segurança

O frontend pode controlar apresentação e UX, mas autorização de moderadores e operações administrativas permanece no backend.

## Direção futura

As próximas mudanças devem reduzir acoplamento e duplicação, mantendo refatorações pequenas, testáveis e reversíveis. Evitar reescritas amplas enquanto o fluxo atual estiver estável.
