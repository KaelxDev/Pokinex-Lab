"""Business operations for public chat messages."""

from anyio import to_thread

from app.database import (
    delete_message as delete_message_record,
    get_message,
    get_message_owner,
    save_message,
    toggle_reaction as toggle_reaction_record,
    update_message as update_message_record,
)
from app.roles import get_user_role

REACTIONS = ("❤️", "😂", "😮", "😢", "😡", "👍")


def public_user_payload(user, *, online: bool | None = None) -> dict:
    payload = {
        "id": user["id"],
        "username": user["username"],
        "displayName": user["displayName"],
        "avatar": user["avatar"],
        "status": user["status"],
        "role": user.get("role") or get_user_role(user),
    }
    if online is not None:
        payload["online"] = online
    return payload


async def send_message(
    manager,
    user,
    message,
    message_id=None,
    sender=None,
    reply_to_message_id=None,
):
    user = manager.get_user(sender) if sender else user
    if not user:
        return

    if message_id and message_id in manager.processed_message_ids:
        if sender:
            await sender.send_json({"type": "ack", "messageId": message_id})
        return

    reply = None
    if reply_to_message_id:
        original = await to_thread.run_sync(get_message, reply_to_message_id)
        if original:
            reply = {
                "messageId": original["message_id"],
                "userId": original["user_id"],
                "username": original["username"],
                "displayName": original["display_name"],
                "avatar": original["avatar"],
                "message": (
                    "Esta mensagem foi excluída"
                    if original["deleted_at"]
                    else original["message"]
                ),
                "deleted": bool(original["deleted_at"]),
            }

    timestamp = manager.get_timestamp()
    if message_id:
        manager.remember_processed_message(message_id)
        try:
            inserted = await to_thread.run_sync(
                save_message,
                message_id,
                user["id"],
                message,
                timestamp,
                reply_to_message_id,
            )
            if inserted is False:
                manager.forget_processed_message(message_id)
                if sender:
                    await sender.send_json({"type": "ack", "messageId": message_id})
                return
        except Exception:
            manager.forget_processed_message(message_id)
            manager.forget_message_owner(message_id)
            raise
        manager.cache_message_owner(message_id, user["id"])

    manager.sequence += 1
    event = {
        "type": "message",
        "messageId": message_id,
        **public_user_payload(user),
        "message": message,
        "timestamp": timestamp,
        "sequence": manager.sequence,
    }
    if reply:
        event["replyTo"] = reply

    await manager.broadcast(event)
    if sender and message_id:
        await sender.send_json({"type": "ack", "messageId": message_id})


async def toggle_reaction(manager, user, message_id, reaction, sender):
    if reaction not in REACTIONS:
        await sender.send_json(
            {
                "type": "error",
                "action": "reaction",
                "messageId": message_id,
                "message": "Reação não permitida.",
            }
        )
        return

    original = await to_thread.run_sync(get_message, message_id)
    if not original:
        await sender.send_json(
            {
                "type": "error",
                "action": "reaction",
                "messageId": message_id,
                "message": "Mensagem não encontrada.",
            }
        )
        return

    if original["deleted_at"]:
        await sender.send_json(
            {
                "type": "error",
                "action": "reaction",
                "messageId": message_id,
                "message": "Não é possível reagir a uma mensagem excluída.",
            }
        )
        return

    active, reactions = await to_thread.run_sync(
        toggle_reaction_record,
        message_id,
        user["id"],
        reaction,
        manager.get_timestamp(),
    )
    manager.sequence += 1
    await manager.broadcast(
        {
            "type": "message_reaction",
            "messageId": message_id,
            "reaction": reaction,
            "userId": user["id"],
            "active": active,
            "reactions": reactions,
            "sequence": manager.sequence,
        }
    )


async def edit_message(manager, user, message_id, message, sender):
    owner_id = await manager.resolve_message_owner(message_id)
    if owner_id is None:
        await sender.send_json(
            {
                "type": "error",
                "action": "edit_message",
                "messageId": message_id,
                "message": "Mensagem não encontrada no servidor.",
            }
        )
        return

    if owner_id != user["id"]:
        await sender.send_json(
            {
                "type": "error",
                "action": "edit_message",
                "messageId": message_id,
                "message": "Você só pode editar suas próprias mensagens.",
            }
        )
        return

    edited_at = manager.get_timestamp()
    updated = await to_thread.run_sync(
        update_message_record,
        message_id,
        user["id"],
        message,
        edited_at,
    )
    if not updated:
        await sender.send_json(
            {
                "type": "error",
                "action": "edit_message",
                "messageId": message_id,
                "message": "Não foi possível editar a mensagem.",
            }
        )
        return

    manager.sequence += 1
    event = {
        "messageId": message_id,
        **public_user_payload(user),
        "message": message,
        "editedAt": edited_at,
        "edited": True,
        "sequence": manager.sequence,
    }
    await manager.broadcast({"type": "message_edited", **event})
    await manager.broadcast({"type": "message", **event})
    await sender.send_json({"type": "edit_ack", "messageId": message_id})


async def delete_message(manager, user, message_id, sender):
    owner_id = await manager.resolve_message_owner(message_id)
    if owner_id is None:
        await sender.send_json(
            {
                "type": "error",
                "action": "delete_message",
                "messageId": message_id,
                "message": "Mensagem não encontrada no servidor.",
            }
        )
        return

    if owner_id != user["id"]:
        await sender.send_json(
            {
                "type": "error",
                "action": "delete_message",
                "messageId": message_id,
                "message": "Você só pode excluir suas próprias mensagens.",
            }
        )
        return

    deleted_at = manager.get_timestamp()
    deleted = await to_thread.run_sync(
        delete_message_record,
        message_id,
        user["id"],
        deleted_at,
    )
    if not deleted:
        await sender.send_json(
            {
                "type": "error",
                "action": "delete_message",
                "messageId": message_id,
                "message": "Não foi possível excluir a mensagem.",
            }
        )
        return

    manager.forget_message_owner(message_id)
    manager.sequence += 1
    await manager.broadcast(
        {
            "type": "message_deleted",
            "messageId": message_id,
            "userId": user["id"],
            "deletedAt": deleted_at,
            "deleted": True,
            "sequence": manager.sequence,
        }
    )
    await sender.send_json({"type": "delete_ack", "messageId": message_id})
