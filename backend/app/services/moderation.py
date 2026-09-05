"""Application services used by the realtime moderation flow."""

from app.moderation_bot import BOT_USER, moderation_bot
from app.roles import has_moderator_access
from app.services.moderation_commands import (
    handle_moderation_command,
    online_user_count,
    send_bot_message,
)
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

    if not has_moderator_access(user) and moderation_bot.is_muted(user["id"]):
        await websocket.send_json(
            {
                "type": "moderation",
                "action": "muted",
                "message": "Você está silenciado no #geral no momento.",
            }
        )
        return True

    moderation = moderation_bot.moderate(message, user["id"])
    if not moderation.allowed:
        mute_minutes = moderation.mute_minutes
        if mute_minutes > 0 and not has_moderator_access(user):
            moderation_bot.mute(user["id"], mute_minutes)

        moderation_message = (
            moderation.reason
            or "Mensagem bloqueada pela moderação automática."
        )
        if mute_minutes > 0:
            moderation_message += f" Você foi silenciado por {mute_minutes} minuto(s)."

        await websocket.send_json(
            {
                "type": "moderation",
                "action": moderation.action or "blocked",
                "category": moderation.category,
                "severity": moderation.severity,
                "muteMinutes": mute_minutes,
                "message": moderation_message,
            }
        )
        if moderation.bot_message:
            await send_bot_message(moderation.bot_message)
        if event.messageId:
            await websocket.send_json(
                {"type": "ack", "messageId": event.messageId}
            )
        return True

    await manager.send_message(
        user,
        message,
        event.messageId,
        websocket,
        event.replyTo,
    )

    bot_reply = moderation_bot.conversational_response(
        message,
        user["id"],
        online_count=online_user_count(),
    )
    if bot_reply:
        await send_bot_message(bot_reply)
    return True
