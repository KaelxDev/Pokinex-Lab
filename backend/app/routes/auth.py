from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import authenticate, create_session, create_user, delete_session, get_user_from_token, update_profile

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=20)
    password: str = Field(min_length=8, max_length=128)


class ProfileUpdate(BaseModel):
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


@router.patch("/profile")
def profile(data: ProfileUpdate, authorization: str | None = Header(default=None)):
    _, user = require_user(authorization)
    updated = update_profile(user["id"], data.displayName, data.avatar, data.status)
    if not updated:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Perfil inválido.")
    return {"user": updated}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    token, _ = require_user(authorization)
    delete_session(token)
    return {"message": "Sessão encerrada."}
