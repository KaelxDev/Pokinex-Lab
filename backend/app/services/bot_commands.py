"""Public PokiBot command and response transport services."""

from app.moderation_bot import BOT_USER, moderation_bot
from app.services.public_identity import public_user_payload
from app.websocket.chat import manager


async def send_bot_message(message: str) -> None:
    """Broadcast a non-persistent PokiBot response to connected clients."""
    manager.sequence += 1
    bot_message_id = f"bot-{manager.sequence}-{manager.get_timestamp()}"
    await manager.broadcast(
        {
            "type": "message",
            "messageId": bot_message_id,
            **public_user_payload(BOT_USER),
            "message": message,
            "timestamp": manager.get_timestamp(),
            "sequence": manager.sequence,
        }
    )


def online_user_count() -> int:
    """Return the number of connected human users."""
    return len(
        {
            str(user.get("id"))
            for user in manager.active_connections.values()
            if user.get("id") != BOT_USER["id"]
        }
    )


async def handle_public_bot_command(
    message: str,
    user_id: int | None = None,
) -> bool:
    """Handle public PokiBot commands and return whether the command was consumed."""
    public_response = moderation_bot.public_command(
        message,
        online_count=online_user_count(),
        user_id=user_id,
    )
    if not public_response:
        return False

    await send_bot_message(public_response)
    return True
