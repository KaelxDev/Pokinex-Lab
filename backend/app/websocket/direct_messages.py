from anyio import to_thread

from app.auth import get_user_by_id
from app.direct_messages import save_direct_message


async def send_direct_message(
    manager,
    sender_user,
    recipient_id: int,
    message: str,
    message_id: str | None,
    sender,
):
    recipient_id = int(recipient_id)
    if recipient_id == int(sender_user["id"]):
        await sender.send_json(
            {
                "type": "error",
                "action": "direct_message",
                "message": "Você não pode iniciar uma conversa privada consigo mesmo.",
            }
        )
        return

    recipient_user = await to_thread.run_sync(get_user_by_id, recipient_id)
    if not recipient_user:
        await sender.send_json(
            {
                "type": "error",
                "action": "direct_message",
                "message": "Usuário não encontrado.",
            }
        )
        return

    timestamp = manager.get_timestamp()
    if message_id:
        try:
            await to_thread.run_sync(
                save_direct_message,
                message_id,
                sender_user["id"],
                recipient_id,
                message,
                timestamp,
            )
        except Exception:
            await sender.send_json(
                {
                    "type": "error",
                    "action": "direct_message",
                    "message": "Não foi possível salvar a mensagem privada.",
                }
            )
            return

    base_event = {
        "type": "direct_message",
        "messageId": message_id,
        "senderId": sender_user["id"],
        "recipientId": recipient_id,
        "userId": sender_user["id"],
        "username": sender_user["username"],
        "displayName": sender_user["displayName"],
        "avatar": sender_user["avatar"],
        "recipientUsername": recipient_user["username"],
        "recipientDisplayName": recipient_user["displayName"],
        "recipientAvatar": recipient_user.get("avatar", ""),
        "message": message,
        "timestamp": timestamp,
        "deliveryStatus": "sent",
        "offline": False,
    }

    sender_id = int(sender_user["id"])
    recipient_id = int(recipient_id)

    for websocket, current_user in list(manager.active_connections.items()):
        current_id = int(current_user["id"])
        if current_id == recipient_id:
            event = {**base_event, "notifyRecipient": True}
        elif current_id == sender_id:
            event = {**base_event, "notifyRecipient": False}
        else:
            continue

        try:
            await websocket.send_json(event)
        except Exception:
            manager.active_connections.pop(websocket, None)

    if sender and message_id:
        await sender.send_json({"type": "direct_ack", "messageId": message_id})
