from datetime import datetime, timezone
from functools import partial
import time

from anyio import to_thread
from fastapi import APIRouter, File, Header, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, Field

from app.auth import (
    SESSION_DAYS,
    authenticate,
    create_session,
    create_user,
    delete_session,
    get_user_by_id,
    get_user_from_token,
    update_profile,
)
from app.avatar_storage import get_avatar, store_avatar
from app.security import is_allowed_origin
from app.websocket.chat import manager

router = APIRouter(prefix="/api/auth", tags=["auth"])
SESSION_COOKIE_NAME = "session"
SESSION_COOKIE_MAX_AGE = SESSION_DAYS * 24 * 60 * 60
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
    avatar: str = Field(default="", max_length=500)
    status: str = Field(default="", max_length=60)


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    return token or None


def require_user(
    request: Request,
    authorization: str | None,
    *,
    require_origin: bool = False,
):
    cookie_token = request.cookies.get(SESSION_COOKIE_NAME)
    bearer_token = _bearer_token(authorization)

    candidates = []
    if cookie_token:
        candidates.append((cookie_token, True))
    if bearer_token and bearer_token != cookie_token:
        candidates.append((bearer_token, False))

    for token, is_cookie_auth in candidates:
        if is_cookie_auth and require_origin:
            origin = request.headers.get("origin")
            if not is_allowed_origin(origin):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Origem não autorizada.",
                )

        user = get_user_from_token(token)
        if user:
            return token, user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sessão inválida ou expirada.",
    )


def set_session_cookie(response: Response, request: Request, token: str) -> None:
    secure = request.url.scheme == "https"
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_COOKIE_MAX_AGE,
        httponly=True,
        secure=secure,
        samesite="none" if secure else "lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


def _set_cookie_from_legacy_bearer(response: Response, request: Request, token: str) -> None:
    if request.cookies.get(SESSION_COOKIE_NAME) is None:
        set_session_cookie(response, request, token)


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(
    data: Credentials,
    request: Request,
    response: Response,
):
    try:
        user = create_user(data.username, data.password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    token = create_session(user["id"])
    set_session_cookie(response, request, token)
    return {"token": token, "user": user}


@router.post("/login")
def login(
    data: Credentials,
    request: Request,
    response: Response,
):
    user = authenticate(data.username, data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username ou senha inválidos.",
        )

    token = create_session(user["id"])
    set_session_cookie(response, request, token)
    return {"token": token, "user": user}


@router.get("/me")
def me(
    request: Request,
    response: Response,
    authorization: str | None = Header(default=None),
):
    token, user = require_user(request, authorization)
    _set_cookie_from_legacy_bearer(response, request, token)
    return {"user": user}


@router.get("/users/{user_id}")
def public_user(
    user_id: int,
    request: Request,
    authorization: str | None = Header(default=None),
):
    require_user(request, authorization)
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )
    return {"user": user}


@router.get("/avatar/{user_id}")
def avatar(user_id: int):
    stored = get_avatar(user_id)
    if stored:
        content, content_type = stored
        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Cache-Control": "private, no-cache, must-revalidate",
            },
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Avatar não encontrado.",
    )


@router.post("/avatar")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    _, user = await to_thread.run_sync(
        partial(
            require_user,
            request,
            authorization,
            require_origin=True,
        ),
    )

    content_type = file.content_type or ""
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de imagem não suportado.",
        )

    content = await file.read(MAX_AVATAR_SIZE + 1)
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A imagem deve ter no máximo 2 MB.",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A imagem está vazia.",
        )

    avatar_path = await to_thread.run_sync(
        store_avatar,
        user["id"],
        content,
        content_type,
    )
    version = int(time.time() * 1000)
    return {"avatar": f"{avatar_path}?v={version}"}


@router.patch("/profile")
async def profile(
    data: ProfileUpdate,
    request: Request,
    authorization: str | None = Header(default=None),
):
    _, user = await to_thread.run_sync(
        partial(
            require_user,
            request,
            authorization,
            require_origin=True,
        ),
    )
    try:
        updated = await to_thread.run_sync(
            update_profile,
            user["id"],
            data.username,
            data.displayName,
            data.avatar,
            data.status,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Perfil inválido.",
        )

    was_online = manager.update_user(updated)
    if was_online:
        await manager.broadcast_profile_update(updated)

    return {"user": updated}


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    authorization: str | None = Header(default=None),
):
    token, _ = require_user(request, authorization, require_origin=True)
    delete_session(token)
    clear_session_cookie(response)
    return {"message": "Sessão encerrada."}
