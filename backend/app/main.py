from contextlib import asynccontextmanager
from pathlib import Path
import json

from anyio import to_thread
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from app.auth import get_user_from_token
from app.database import close_db_pool, init_db_pool, initialize_database
from app.moderation_bot import BOT_USER, is_moderator, moderation_bot
from app.moderation_store import clear_recent_messages
from app.routes.auth import router as auth_router
from app.routes.messages import router as messages_router
from app.security import ALLOWED_ORIGINS, is_allowed_origin
from app.websocket.chat import manager
from app.websocket.direct_message_features import (
    delete_direct,
    edit_direct,
    react_direct,
    send_direct_message,
)
from app.websocket.schemas import (
    ChatMessageEvent,
    DeleteMessageEvent,
    DirectMessageDeleteEvent,
    DirectMessageEditEvent,
    DirectMessageEvent,
    DirectMessageReactionEvent,
    EditMessageEvent,
    ReactionEvent,
)

APP_DIR = Path(__file__).resolve().parent
MEDIA_DIR = APP_DIR / "uploads"
AVATAR_DIR = MEDIA_DIR / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
MAX_WEBSOCKET_PAYLOAD = 16 * 1024


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await to_thread.run_sync(init_db_pool)
    await to_thread.run_sync(initialize_database)
    try:
        yield
    finally:
        await to_thread.run_sync(close_db_pool)


app = FastAPI(title="NexChat API", version="2.0.0", lifespan=lifespan)
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


@app.get("/")
async def root():
    return {"message": "NexChat API", "status": "online"}


def _websocket_token(websocket: WebSocket) -> str | None:
    return websocket.cookies.get("session")


async def _validate_websocket_origin(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    if is_allowed_origin(origin):
        return True
    await websocket.close(code=1008, reason="Origin not allowed")
    return False


async def _send_validation_error(websocket: WebSocket, action: str, error: ValidationError) -> None:
    first_error = error.errors()[0] if error.errors() else {}
    messages = {
        "string_too_long": "Um dos campos excedeu o limite permitido.",
        "string_too_short": "Um dos campos é muito curto.",
        "literal_error": "Valor não permitido.",
        "missing": "Campo obrigatório ausente.",
        "string_type": "Campo de texto inválido.",
        "greater_than": "Identificador inválido.",
    }
    await websocket.send_json({
        "type": "error",
        "action": action,
        "message": messages.get(first_error.get("type"), "Dados do evento inválidos."),
    })


async def _send_users_with_bot():
    users = [{
        "id": BOT_USER["id"],
        "username": BOT_USER["username"],
        "displayName": BOT_USER["displayName"],
        "avatar": BOT_USER["avatar"],
        "status": BOT_USER["status"],
        "online": True,
        "role": "bot",
    }]
    seen = {BOT_USER["id"]}

    for user in manager.active_connections.values():
        if user["id"] in seen:
            continue
        seen.add(user["id"])
        users.append({
            "id": user["id"],
            "username": user["username"],
            "displayName": user["displayName"],
            "avatar": user["avatar"],
            "status": user["status"],
            "online": True,
            "role": "moderator" if is_moderator(user) else "member",
        })

    await manager.broadcast({
        "type": "users",
        "users": users,
        "timestamp": manager.get_timestamp(),
    })


async def _send_bot_message(message: str):
    manager.sequence += 1
    bot_message_id = f"bot-{manager.sequence}-{manager.get_timestamp()}"
    await manager.broadcast({
        "type": "message",
        "messageId": bot_message_id,
        "userId": BOT_USER["id"],
        "username": BOT_USER["username"],
        "displayName": BOT_USER["displayName"],
        "avatar": BOT_USER["avatar"],
        "status": BOT_USER["status"],
        "role": "bot",
        "message": message,
        "timestamp": manager.get_timestamp(),
        "sequence": manager.sequence,
    })


def _find_online_user(username: str):
    normalized = username.casefold()
    for user in manager.active_connections.values():
        if str(user.get("username", "")).casefold() == normalized:
            return user
    return None


def _command_args(message: str):
    return message.strip().split()


async def _moderation_command(websocket: WebSocket, user, message: str) -> bool:
    if not message.startswith("!"):
        return False

    command = moderation_bot.command_name(message)
    public_response = moderation_bot.public_command(message)
    if public_response:
        await _send_bot_message(public_response)
        return True

    moderator = is_moderator(user)
    if command == "!mod":
        if not moderator:
            await _send_bot_message("🔒 O modo moderador está disponível apenas para a equipe autorizada.")
            return True
        args = _command_args(message)
        if len(args) > 1 and args[1].casefold() == "help":
            await websocket.send_json({"type": "moderator_session", "enabled": True})
            await _send_bot_message(moderation_bot.MOD_HELP)
        else:
            await websocket.send_json({"type": "moderator_session", "enabled": True})
            await _send_bot_message("🛡️ Modo moderador ativo. Use !mod help para ver os comandos administrativos.")
        return True

    if not moderator:
        await _send_bot_message("❌ Comando não reconhecido. Use !help para ver os comandos públicos.")
        return True

    args = _command_args(message)

    if command == "!clear":
        amount = 50
        if len(args) > 1:
            try:
                amount = int(args[1])
            except ValueError:
                await _send_bot_message("🧹 Use: !clear [1-100].")
                return True
        if amount < 1 or amount > 100:
            await _send_bot_message("🧹 O limite do comando !clear é de 1 a 100 mensagens.")
            return True
        message_ids = await to_thread.run_sync(clear_recent_messages, amount)
        await manager.broadcast({
            "type": "messages_cleared",
            "messageIds": message_ids,
            "count": len(message_ids),
            "moderator": user["username"],
            "timestamp": manager.get_timestamp(),
        })
        await _send_bot_message(f"🧹 {len(message_ids)} mensagem(ns) removida(s) do #geral.")
        return True

    if command in {"!warn", "!mute", "!unmute", "!kick"}:
        if len(args) < 2:
            await _send_bot_message(f"Use: {command} @usuário ...")
            return True

        target_username = args[1].lstrip("@").casefold()
        target = _find_online_user(target_username)
        if not target:
            await _send_bot_message(f"❌ Usuário @{target_username} não está online.")
            return True
        if target["id"] == user["id"]:
            await _send_bot_message("❌ Essa ação não pode ser aplicada a você mesmo.")
            return True
        if target["id"] == BOT_USER["id"]:
            await _send_bot_message("🤖 O PokiBot não pode ser moderado.")
            return True

        if is_moderator(target):
            await _send_bot_message("🛡️ Moderadores não podem ser punidos por este conjunto de comandos.")
            return True

        if command == "!warn":
            reason = " ".join(args[2:]).strip() or "Comportamento fora das regras do canal."
            await _send_bot_message(f"⚠️ @{target['username']} recebeu um aviso: {reason}")
            return True

        if command == "!mute":
            if len(args) < 3:
                await _send_bot_message("🔇 Use: !mute @usuário [minutos].")
                return True
            try:
                minutes = int(args[2])
            except ValueError:
                await _send_bot_message("🔇 Os minutos precisam ser um número.")
                return True
            if minutes < 1 or minutes > 1440:
                await _send_bot_message("🔇 O mute pode durar de 1 a 1440 minutos.")
                return True
            moderation_bot.mute(target["id"], minutes)
            await _send_bot_message(f"🔇 @{target['username']} foi silenciado por {minutes} minuto(s).")
            return True

        if command == "!unmute":
            moderation_bot.unmute(target["id"])
            await _send_bot_message(f"🔊 @{target['username']} foi dessilenciado.")
            return True

        if command == "!kick":
            await _send_bot_message(f"👢 @{target['username']} foi removido do #geral por um moderador.")
            for target_socket, current in list(manager.active_connections.items()):
                if current["id"] == target["id"]:
                    try:
                        await target_socket.close(code=4003, reason="Removido por um moderador")
                    except Exception:
                        pass
                    manager.active_connections.pop(target_socket, None)
            await manager.send_users()
            return True

    await _send_bot_message(moderation_bot.MOD_HELP)
    return True


manager.send_users = _send_users_with_bot


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    if not await _validate_websocket_origin(websocket):
        return

    user = await to_thread.run_sync(get_user_from_token, _websocket_token(websocket))
    if not user:
        await websocket.close(code=1008, reason="Authentication required")
        return

    await manager.connect(websocket, user)
    await websocket.send_json({"type": "moderator_session", "enabled": is_moderator(user)})
    try:
        while True:
            raw_data = await websocket.receive_text()
            if len(raw_data.encode("utf-8")) > MAX_WEBSOCKET_PAYLOAD:
                await websocket.send_json({"type": "error", "action": "payload", "message": "Evento muito grande."})
                continue
            try:
                data = json.loads(raw_data)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "action": "payload", "message": "JSON inválido."})
                continue
            if not isinstance(data, dict):
                await websocket.send_json({"type": "error", "action": "payload", "message": "O evento deve ser um objeto JSON."})
                continue

            event_type = data.get("type", "message")
            if event_type == "message":
                try:
                    event = ChatMessageEvent.model_validate(data)
                except ValidationError as error:
                    await _send_validation_error(websocket, "message", error)
                    continue
                message = event.message.strip()
                if message:
                    if await _moderation_command(websocket, user, message):
                        continue
                    if not is_moderator(user) and moderation_bot.is_muted(user["id"]):
                        await websocket.send_json({
                            "type": "moderation",
                            "action": "muted",
                            "message": "Você está silenciado no #geral no momento.",
                        })
                        continue
                    moderation = moderation_bot.moderate(message)
                    if not moderation.allowed:
                        await websocket.send_json({
                            "type": "moderation",
                            "action": "blocked",
                            "message": moderation.reason,
                        })
                        if moderation.bot_message:
                            await _send_bot_message(moderation.bot_message)
                        if event.messageId:
                            await websocket.send_json({"type": "ack", "messageId": event.messageId})
                        continue

                    await manager.send_message(user, message, event.messageId, websocket, event.replyTo)
                continue

            if event_type == "direct_message":
                try:
                    event = DirectMessageEvent.model_validate(data)
                except ValidationError as error:
                    await _send_validation_error(websocket, "direct_message", error)
                    continue
                message = event.message.strip()
                if message:
                    await send_direct_message(manager, user, event.recipientId, message, event.messageId, websocket, event.replyTo)
                continue

            if event_type == "direct_message_edit":
                try:
                    event = DirectMessageEditEvent.model_validate(data)
                except ValidationError as error:
                    await _send_validation_error(websocket, "direct_message_edit", error)
                    continue
                message = event.message.strip()
                if message:
                    await edit_direct(manager, user, event.messageId, message, websocket)
                continue

            if event_type == "direct_message_delete":
                try:
                    event = DirectMessageDeleteEvent.model_validate(data)
                except ValidationError as error:
                    await _send_validation_error(websocket, "direct_message_delete", error)
                    continue
                await delete_direct(manager, user, event.messageId, websocket)
                continue

            if event_type == "direct_message_reaction":
                try:
                    event = DirectMessageReactionEvent.model_validate(data)
                except ValidationError as error:
                    await _send_validation_error(websocket, "direct_message_reaction", error)
                    continue
                await react_direct(manager, user, event.messageId, event.reaction, websocket)
                continue

            if event_type == "edit_message":
                try:
                    event = EditMessageEvent.model_validate(data)
                except ValidationError as error:
                    await _send_validation_error(websocket, "edit_message", error)
                    continue
                message = event.message.strip()
                if not message:
                    await websocket.send_json({"type": "error", "action": "edit_message", "messageId": event.messageId, "message": "A mensagem não pode ficar vazia."})
                    continue
                await manager.edit_message(user, event.messageId, message, websocket)
                continue

            if event_type == "delete_message":
                try:
                    event = DeleteMessageEvent.model_validate(data)
                except ValidationError as error:
                    await _send_validation_error(websocket, "delete_message", error)
                    continue
                await manager.delete_message(user, event.messageId, websocket)
                continue

            if event_type == "reaction":
                try:
                    event = ReactionEvent.model_validate(data)
                except ValidationError as error:
                    await _send_validation_error(websocket, "reaction", error)
                    continue
                await manager.toggle_reaction(user, event.messageId, event.reaction, websocket)
                continue

            await websocket.send_json({"type": "error", "action": "unknown_event", "message": "Tipo de evento não suportado."})

    except WebSocketDisconnect:
        disconnected_user = manager.disconnect(websocket)
        if disconnected_user:
            await manager.broadcast({
                "type": "system",
                "event": "user_left",
                "userId": disconnected_user["id"],
                "username": disconnected_user["username"],
                "displayName": disconnected_user["displayName"],
                "avatar": disconnected_user["avatar"],
                "message": f"{disconnected_user['username']} saiu do chat.",
                "timestamp": manager.get_timestamp(),
            })
            await manager.send_users()
