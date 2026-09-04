from fastapi import APIRouter, Header, HTTPException, Query, Request

from app.auth import get_user_by_id
from app.message_history import get_message_history
from app.routes.auth import require_user
from app.websocket.direct_message_features import get_direct_message_history

router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.get("")
def messages(
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
    before: str | None = Query(default=None, max_length=64),
    authorization: str | None = Header(default=None),
):
    require_user(request, authorization)
    return get_message_history(limit=limit, before=before)


@router.get("/direct/{user_id}")
def direct_messages(
    user_id: int,
    request: Request,
    limit: int = Query(default=50, ge=1, le=100),
    before: str | None = Query(default=None, max_length=64),
    authorization: str | None = Header(default=None),
):
    _, current_user = require_user(request, authorization)
    if int(current_user["id"]) == int(user_id):
        raise HTTPException(status_code=400, detail="Não é possível abrir uma conversa privada consigo mesmo.")
    target = get_user_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return get_direct_message_history(
        user_id=int(current_user["id"]),
        other_user_id=int(user_id),
        limit=limit,
        before=before,
    )
