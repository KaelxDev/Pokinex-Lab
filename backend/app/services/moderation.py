"""Application services used by the realtime moderation flow."""

from app.moderation_bot import BOT_USER, moderation_bot
from app.roles import has_moderator_access
from app.services.bot_commands import online_user_count, send_bot_message
from app.services.moderation_commands import handle_moderation_command
from app.services.moderation_engine import moderation_engine
from app.services.public_messages import delete_message, send_message
from app.websocket.chat import manager
from app.websocket.schemas import ChatMessageEvent


def register_system_users() -> None:
    """Register non-persistent users that should appear in online presence."""
    manager.register_presence_user(BOT_USER)


async def handle_public_message(websocket, user, event: ChatMessageEvent) -> bool:
    """Apply automatic moderation and pass allowed messages to the public chat."""
    message = event.message.strip()
    if not message:
        return True

    if await handle_moderation_command(websocket, user, message, event.messageId):
        return True

    is_staff = has_moderator_access(user)
    user_id = user["id"]

    if not is_staff and moderation_engine.is_muted(user_id):
        remaining = moderation_engine.remaining_mute_seconds(user_id)
        await websocket.send_json(
            {
                "type": "moderation",
                "action": "muted",
                "message": "Você está silenciado no #geral no momento.",
                "muteRemainingSeconds": remaining,
            }
        )
        return True

    decision = moderation_engine.moderate(
        message,
        user_id,
        event.messageId,
    )
    moderation = decision.result
    if not moderation.allowed:
        mute_minutes = moderation.mute_minutes
        if mute_minutes > 0 and not is_staff:
            moderation_engine.mute(user_id, mute_minutes)

        moderation_message = (
            moderation.reason
            or "Mensagem bloqueada pela moderação automática."
        )
        if mute_minutes > 0:
            moderation_message += f" Você foi silenciado por {mute_minutes} minuto(s)."

        remaining = moderation_engine.remaining_mute_seconds(user_id)
        payload = {
            "type": "moderation",
            "action": moderation.action or "blocked",
            "category": moderation.category,
            "severity": moderation.severity,
            "muteMinutes": mute_minutes,
            "message": moderation_message,
            "muteRemainingSeconds": remaining,
        }
        if decision.cleanup_message_ids:
            payload["removeMessageIds"] = list(decision.cleanup_message_ids)
            payload["cleanupCount"] = len(decision.cleanup_message_ids)

        await websocket.send_json(payload)

        for message_id in decision.cleanup_message_ids:
            await delete_message(manager, user, message_id, websocket)

        if moderation.bot_message:
            await send_bot_message(moderation.bot_message)
        if event.messageId:
            await websocket.send_json(
                {"type": "ack", "messageId": event.messageId}
            )
        return True

    await send_message(
        manager,
        user,
        message,
        event.messageId,
        websocket,
        event.replyTo,
    )

    bot_reply = moderation_bot.conversational_response(
        message,
        user_id,
        online_count=online_user_count(),
    )
    if bot_reply:
        await send_bot_message(bot_reply)
    return True
