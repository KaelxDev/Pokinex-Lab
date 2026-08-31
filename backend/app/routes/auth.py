from pathlib import Path
import secrets

from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field

from app.auth import authenticate, create_session, create_user, delete_session, get_user_by_id, get_user_from_token, update_profile
from app.websocket.chat import manager

router = APIRouter(prefix="/api/auth", tags=["auth"])
AVATAR_DIR = Path(__file__).resolve().parent.parent / "uploads" / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
MAX_AVATAR_SIZE = 2 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=20)
    password: str = Field(min_length=8, max_length=128)


class ProfileUpdate(BaseModel):
    username: str = Field(min_length=3, max_length=20)
    displayName: str = Field(min_length=1, max_length=30)
    avatar: str = ""
    status: str = Field(default="", max_length=60)


def require_user(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão não encontrada.")
    token = authorization.removeprefix("Bearer ").strip()
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida ou expirada.")
    return token, user


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(data: Credentials):
    try:
        user = create_user(data.username, data.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return {"token": create_session(user["id"]), "user": user}


@router.post("/login")
def login(data: Credentials):
    user = authenticate(data.username, data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Username ou senha inválidos.")
    return {"token": create_session(user["id"]), "user": user}


@router.get("/me")
def me(authorization: str | None = Header(default=None)):
    _, user = require_user(authorization)
    return {"user": user}


@router.get("/users/{user_id}")
def public_user(user_id: int, authorization: str | None = Header(default=None)):
    require_user(authorization)
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")
    return {"user": user}


@router.post("/avatar")
async def upload_avatar(request: Request, file: UploadFile = File(...), authorization: str | None = Header(default=None)):
    _, user = require_user(authorization)

    extension = ALLOWED_IMAGE_TYPES.get(file.content_type or "")
    if not extension:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de imagem não suportado.")

    content = await file.read(MAX_AVATAR_SIZE + 1)
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A imagem deve ter no máximo 2 MB.")
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A imagem está vazia.")

    filename = f"{user['id']}-{secrets.token_hex(8)}{extension}"
    destination = AVATAR_DIR / filename
    destination.write_bytes(content)

    avatar_url = str(request.base_url).rstrip("/") + f"/media/avatars/{filename}"
    return {"avatar": avatar_url}


@router.patch("/profile")
async def profile(data: ProfileUpdate, authorization: str | None = Header(default=None)):
    _, user = require_user(authorization)
    try:
        updated = update_profile(user["id"], data.username, data.displayName, data.avatar, data.status)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Perfil inválido.")

    was_online = manager.update_user(updated)
    if was_online:
        await manager.broadcast_profile_update(updated)

    return {"user": updated}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    token, _ = require_user(authorization)
    delete_session(token)
    return {"message": "Sessão encerrada."}
