# Pokinex Lab

Communication Platform.

## Architecture

- `frontend/`: web client
- `backend/`: FastAPI backend, authentication, moderation, persistence and WebSocket services

## Quality gates

GitHub Actions validates every pull request and push to `main` with:

- Backend: Python 3.12, Ruff and pytest
- Frontend: Node 22, lint and production build
