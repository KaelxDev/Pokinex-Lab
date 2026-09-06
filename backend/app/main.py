"""Pokinex application entrypoint and HTTP configuration."""

from contextlib import asynccontextmanager
import os
from pathlib import Path

from anyio import to_thread
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.infrastructure.database import close_db_pool, init_db_pool, initialize_database
from app.routes.auth import router as auth_router
from app.routes.messages import router as messages_router
from app.security import ALLOWED_ORIGINS
from app.websocket.chat import manager
from app.websocket.endpoint import websocket_endpoint

APP_DIR = Path(__file__).resolve().parent
MEDIA_DIR = APP_DIR / "uploads"
AVATAR_DIR = MEDIA_DIR / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await to_thread.run_sync(init_db_pool)
    await to_thread.run_sync(initialize_database)
    try:
        yield
    finally:
        await to_thread.run_sync(close_db_pool)


app = FastAPI(title="Pokinex API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")
app.include_router(auth_router)
app.include_router(messages_router)
app.websocket("/ws")(websocket_endpoint)


@app.get("/")
async def root():
    return {"message": "Pokinex API", "status": "online"}


@app.post("/__e2e__/disconnect/{user_id}", include_in_schema=False)
async def e2e_disconnect(user_id: int):
    if os.getenv("POKINEX_E2E") != "1":
        raise HTTPException(status_code=404, detail="Not found")

    closed = await manager.disconnect_user(
        user_id,
        code=1001,
        reason="E2E reconnect test",
    )
    return {"closed": closed}
