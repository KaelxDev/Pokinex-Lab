# Pokinex

Plataforma de comunicação em tempo real com chat público, mensagens privadas e moderação integrada.

## Stack

### Frontend

- React 19
- Vite 8
- CSS modular por área
- WebSocket para comunicação em tempo real

### Backend

- FastAPI
- Uvicorn
- Pydantic
- WebSocket
- PostgreSQL em produção
- SQLite para desenvolvimento/local

## Principais recursos

- Autenticação e sessões persistentes
- Chat público em tempo real
- Mensagens privadas
- Responder, editar, excluir e reagir a mensagens
- Histórico persistente com paginação
- Cache e fila offline no cliente
- Reconexão automática do WebSocket
- Avatares persistentes
- Cargos `OWNER`, `ADMIN`, `STAFF` e `BOT`
- Moderação automática contra flood, spam, duplicação e conteúdo suspeito
- Comandos administrativos restritos à equipe

## Estrutura

```text
Pokinex-Lab/
├── backend/
│   ├── app/
│   │   ├── routes/
│   │   ├── websocket/
│   │   ├── auth.py
│   │   ├── database.py
│   │   ├── migrations.py
│   │   ├── moderation_bot.py
│   │   ├── moderation_store.py
│   │   ├── roles.py
│   │   └── security.py
│   └── tests/
├── frontend/
│   └── src/
│       ├── components/
│       ├── config/
│       ├── hooks/
│       ├── services/
│       ├── styles/
│       └── utils/
└── docs/
```

Consulte [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para a visão detalhada dos fluxos.

## Desenvolvimento local

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

O frontend local usa automaticamente `http://localhost:8000` para a API e o WebSocket quando as variáveis `VITE_API_URL` e `VITE_WS_URL` não estiverem definidas.

## Testes e qualidade

```powershell
cd backend
pytest
ruff check .
```

O frontend possui scripts de desenvolvimento, build e lint. A cobertura de testes de interface deve acompanhar a evolução das funcionalidades de chat, DM e reconexão.

## Configuração

As variáveis sensíveis não são versionadas. Consulte:

- `backend/.env.example`
- `frontend/.env.example`

Nunca coloque credenciais, tokens de sessão ou chaves privadas no frontend.

## Segurança

As sessões usam cookies HttpOnly e o backend valida a origem das conexões WebSocket. A autorização de cargos é feita no servidor; a interface apenas apresenta o papel recebido.

## Status

Projeto em evolução contínua no ambiente de laboratório. Mudanças estruturais devem priorizar compatibilidade com o protocolo WebSocket e com o histórico persistente.