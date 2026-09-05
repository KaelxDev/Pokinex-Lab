"""HTTP authentication dependencies and session-cookie helpers."""

from fastapi import Header, HTTPException, Request, Response, status

from app.auth import SESSION_DAYS, get_user_from_token
from app.security import is_allowed_origin

SESSION_COOKIE_NAME = "session"
SESSION_COOKIE_MAX_AGE = SESSION_DAYS * 24 * 60 * 60


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    return token or None


def require_user(
    request: Request,
    authorization: str | None = Header(default=None),
    *,
    require_origin: bool = False,
):
    """Resolve the authenticated user from cookie auth or legacy bearer auth."""
    cookie_token = request.cookies.get(SESSION_COOKIE_NAME)
    bearer_token = _bearer_token(authorization)

    candidates: list[tuple[str, bool]] = []
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


def set_cookie_from_legacy_bearer(
    response: Response,
    request: Request,
    token: str,
) -> None:
    """Upgrade a legacy bearer-authenticated request to cookie auth once."""
    if request.cookies.get(SESSION_COOKIE_NAME) is None:
        set_session_cookie(response, request, token)
