"""WebSocket-facing operations for direct messages."""

from anyio import to_thread

from app.auth import get_user_by_id
from app.repositories.direct_message_repository import (
    delete_direct_message,
    get_direct_message,
    save_direct_message,
    toggle_direct_reaction,
    update_direct_message,
)

REACTIONS = ("❤️", "😂", "😮", "😢", "😡", "👍")


def _pair_users(manager, sender_id, recipient_id):
    participants = {int(sender_id), int(recipient_id)}
    return [
        (websocket, current)
        for websocket, current in list(manager.active_connections.items())
        if int(current["id"]) in participants
    ]


async def send_direct_message(
    manager,
    sender_user,
    recipient_id,
    message,
    message_id,
    sender,
    reply_to_message_id=None,
):
    recipient_id = int(recipient_id)
    sender_id = int(sender_user["id"])

    if recipient_id == sender_id:
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
    if not message_id:
        await sender.send_json(
            {
                "type": "error",
                "action": "direct_message",
                "message": "Identificador da mensagem ausente.",
            }
        )
        return

    inserted = await to_thread.run_sync(
        save_direct_message,
        message_id,
        sender_id,
        recipient_id,
        message,
        timestamp,
        reply_to_message_id,
    )
    if not inserted:
        await sender.send_json({"type": "direct_ack", "messageId": message_id})
        return

    event = {
        "type": "direct_message",
        "messageId": message_id,
        "senderId": sender_id,
        "recipientId": recipient_id,
        "userId": sender_id,
        "username": sender_user["username"],
        "displayName": sender_user["displayName"],
        "avatar": sender_user.get("avatar", ""),
        "recipientUsername": recipient_user["username"],
        "recipientDisplayName": recipient_user["displayName"],
        "recipientAvatar": recipient_user.get("avatar", ""),
        "message": message,
        "timestamp": timestamp,
        "deliveryStatus": "sent",
        "offline": False,
        "edited": False,
        "deleted": False,
        "reactions": {},
    }

    if reply_to_message_id:
        reply = await to_thread.run_sync(get_direct_message, reply_to_message_id)
        if reply:
            event["replyTo"] = {
                "messageId": reply["messageId"],
                "userId": reply["senderId"],
                "username": reply["username"],
                "displayName": reply["displayName"],
                "avatar": reply["avatar"],
                "message": reply["message"],
                "deleted": reply["deleted"],
            }

    for websocket, current in _pair_users(manager, sender_id, recipient_id):
        try:
            await websocket.send_json(
                {
                    **event,
                    "notifyRecipient": int(current["id"]) == recipient_id,
                }
            )
        except Exception:
            manager.active_connections.pop(websocket, None)

    await sender.send_json({"type": "direct_ack", "messageId": message_id})


async def _send_to_pair(manager, data, sender_id, recipient_id):
    for websocket, _current in _pair_users(manager, sender_id, recipient_id):
        try:
            await websocket.send_json(data)
        except Exception:
            manager.active_connections.pop(websocket, None)


async def edit_direct(manager, user, message_id, message, sender):
    target = await to_thread.run_sync(get_direct_message, message_id)
    if not target or int(target["senderId"]) != int(user["id"]):
        await sender.send_json(
            {
                "type": "error",
                "action": "direct_message_edit",
                "messageId": message_id,
                "message": "Mensagem privada não encontrada ou você não é o autor.",
            }
        )
        return

    edited_at = manager.get_timestamp()
    updated = await to_thread.run_sync(
        update_direct_message,
        message_id,
        user["id"],
        message,
        edited_at,
    )
    if not updated:
        await sender.send_json(
            {
                "type": "error",
                "action": "direct_message_edit",
                "messageId": message_id,
                "message": "Não foi possível editar a mensagem privada.",
            }
        )
        return

    event = await to_thread.run_sync(get_direct_message, message_id)
    await _send_to_pair(
        manager,
        {"type": "direct_message_edited", **event},
        int(target["senderId"]),
        int(target["recipientId"]),
    )
    await sender.send_json({"type": "direct_edit_ack", "messageId": message_id})


async def delete_direct(manager, user, message_id, sender):
    target = await to_thread.run_sync(get_direct_message, message_id)
    if not target or int(target["senderId"]) != int(user["id"]):
        await sender.send_json(
            {
                "type": "error",
                "action": "direct_message_delete",
                "messageId": message_id,
                "message": "Mensagem privada não encontrada ou você não é o autor.",
            }
        )
        return

    deleted_at = manager.get_timestamp()
    deleted = await to_thread.run_sync(
        delete_direct_message,
        message_id,
        user["id"],
        deleted_at,
    )
    if not deleted:
        await sender.send_json(
            {
                "type": "error",
                "action": "direct_message_delete",
                "messageId": message_id,
                "message": "Não foi possível excluir a mensagem privada.",
            }
        )
        return

    event = await to_thread.run_sync(get_direct_message, message_id)
    await _send_to_pair(
        manager,
        {"type": "direct_message_deleted", **event},
        int(target["senderId"]),
        int(target["recipientId"]),
    )
    await sender.send_json({"type": "direct_delete_ack", "messageId": message_id})


async def react_direct(manager, user, message_id, reaction, sender):
    if reaction not in REACTIONS:
        await sender.send_json(
            {
                "type": "error",
                "action": "direct_message_reaction",
                "messageId": message_id,
                "message": "Reação não permitida.",
            }
        )
        return

    payload = await to_thread.run_sync(get_direct_message, message_id)
    if not payload:
        await sender.send_json(
            {
                "type": "error",
                "action": "direct_message_reaction",
                "messageId": message_id,
                "message": "Mensagem privada não encontrada.",
            }
        )
        return

    if payload["deleted"]:
        await sender.send_json(
            {
                "type": "error",
                "action": "direct_message_reaction",
                "messageId": message_id,
                "message": "Não é possível reagir a uma mensagem excluída.",
            }
        )
        return

    active, reactions = await to_thread.run_sync(
        toggle_direct_reaction,
        message_id,
        user["id"],
        reaction,
        manager.get_timestamp(),
    )

    await _send_to_pair(
        manager,
        {
            "type": "direct_message_reaction",
            "messageId": message_id,
            "reaction": reaction,
            "userId": user["id"],
            "active": active,
            "reactions": reactions,
        },
        int(payload["senderId"]),
        int(payload["recipientId"]),
    )
