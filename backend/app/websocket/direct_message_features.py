from anyio import to_thread

from app.auth import get_user_by_id
from app.database import _persistent_avatar_reference, get_connection, using_postgres

MAX_HISTORY_LIMIT = 100
REACTIONS = ("❤️", "😂", "😮", "😢", "😡", "👍")


def _pair_users(manager, sender_id, recipient_id):
    participants = {int(sender_id), int(recipient_id)}
    return [
        (websocket, current)
        for websocket, current in list(manager.active_connections.items())
        if int(current["id"]) in participants
    ]


def _placeholders(count):
    return ", ".join(["%s"] * count) if using_postgres() else ", ".join(["?"] * count)


def _reaction_map(connection, message_ids):
    if not message_ids:
        return {}
    p = _placeholders(len(message_ids))
    rows = connection.execute(
        f"SELECT message_id, reaction, COUNT(*) AS count FROM direct_message_reactions WHERE message_id IN ({p}) GROUP BY message_id, reaction",
        tuple(message_ids),
    ).fetchall()
    result = {}
    for row in rows:
        result.setdefault(row["message_id"], {})[row["reaction"]] = int(row["count"])
    return result


def get_direct_message_history(user_id, other_user_id, limit=50, before=None):
    limit = max(1, min(int(limit), MAX_HISTORY_LIMIT))
    connection = get_connection()
    try:
        p = "%s" if using_postgres() else "?"
        before_clause = f" AND dm.created_at < {p}" if before else ""
        query = f"""
            SELECT dm.message_id, dm.sender_id, dm.recipient_id, dm.message,
                   dm.created_at, dm.edited_at, dm.deleted_at, dm.reply_to_message_id,
                   su.username AS sender_username, su.display_name AS sender_display_name, su.avatar AS sender_avatar,
                   ru.username AS recipient_username, ru.display_name AS recipient_display_name, ru.avatar AS recipient_avatar,
                   rm.message AS reply_message, rm.deleted_at AS reply_deleted_at,
                   rsu.id AS reply_user_id, rsu.username AS reply_username, rsu.display_name AS reply_display_name, rsu.avatar AS reply_avatar
            FROM direct_messages dm
            JOIN users su ON su.id = dm.sender_id
            JOIN users ru ON ru.id = dm.recipient_id
            LEFT JOIN direct_messages rm ON rm.message_id = dm.reply_to_message_id
            LEFT JOIN users rsu ON rsu.id = rm.sender_id
            WHERE ((dm.sender_id = {p} AND dm.recipient_id = {p}) OR (dm.sender_id = {p} AND dm.recipient_id = {p}))
            {before_clause}
            ORDER BY dm.created_at DESC, dm.message_id DESC
            LIMIT {p}
        """
        params = [user_id, other_user_id, other_user_id, user_id]
        if before:
            params.append(before)
        params.append(limit + 1)
        rows = connection.execute(query, tuple(params)).fetchall()
        has_more = len(rows) > limit
        rows = rows[:limit]
        reactions = _reaction_map(connection, [row["message_id"] for row in rows])
        messages = []
        for row in reversed(rows):
            sender_avatar = _persistent_avatar_reference(connection, row["sender_id"], row["sender_avatar"])
            recipient_avatar = _persistent_avatar_reference(connection, row["recipient_id"], row["recipient_avatar"])
            item = {
                "type": "direct_message", "messageId": row["message_id"],
                "senderId": row["sender_id"], "recipientId": row["recipient_id"], "userId": row["sender_id"],
                "username": row["sender_username"], "displayName": row["sender_display_name"], "avatar": sender_avatar,
                "recipientUsername": row["recipient_username"], "recipientDisplayName": row["recipient_display_name"], "recipientAvatar": recipient_avatar,
                "message": "Esta mensagem foi excluída" if row["deleted_at"] else row["message"],
                "timestamp": row["created_at"], "edited": bool(row["edited_at"]), "editedAt": row["edited_at"],
                "deleted": bool(row["deleted_at"]), "deletedAt": row["deleted_at"],
                "reactions": reactions.get(row["message_id"], {}), "deliveryStatus": "sent", "offline": False,
            }
            if row["reply_to_message_id"] and row["reply_username"]:
                item["replyTo"] = {
                    "messageId": row["reply_to_message_id"], "userId": row["reply_user_id"], "username": row["reply_username"], "displayName": row["reply_display_name"],
                    "avatar": _persistent_avatar_reference(connection, row["reply_user_id"], row["reply_avatar"]),
                    "message": "Esta mensagem foi excluída" if row["reply_deleted_at"] else row["reply_message"],
                    "deleted": bool(row["reply_deleted_at"]),
                }
            messages.append(item)
        return {"messages": messages, "hasMore": has_more, "nextBefore": messages[0]["timestamp"] if has_more else None}
    finally:
        connection.close()


def _save_direct_message(message_id, sender_id, recipient_id, message, created_at, reply_to_message_id=None):
    connection = get_connection()
    try:
        query = ("INSERT INTO direct_messages (message_id, sender_id, recipient_id, message, created_at, reply_to_message_id) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (message_id) DO NOTHING" if using_postgres() else "INSERT OR IGNORE INTO direct_messages (message_id, sender_id, recipient_id, message, created_at, reply_to_message_id) VALUES (?, ?, ?, ?, ?, ?)")
        connection.execute(query, (message_id, sender_id, recipient_id, message, created_at, reply_to_message_id))
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _direct_message_payload(message_id):
    connection = get_connection()
    try:
        p = "%s" if using_postgres() else "?"
        row = connection.execute(f"SELECT dm.message_id, dm.sender_id, dm.recipient_id, dm.message, dm.created_at, dm.edited_at, dm.deleted_at, su.username AS sender_username, su.display_name AS sender_display_name, su.avatar AS sender_avatar, ru.username AS recipient_username, ru.display_name AS recipient_display_name, ru.avatar AS recipient_avatar FROM direct_messages dm JOIN users su ON su.id = dm.sender_id JOIN users ru ON ru.id = dm.recipient_id WHERE dm.message_id = {p}", (message_id,)).fetchone()
        if not row:
            return None
        return {
            "messageId": row["message_id"], "senderId": row["sender_id"], "recipientId": row["recipient_id"], "userId": row["sender_id"],
            "username": row["sender_username"], "displayName": row["sender_display_name"], "avatar": _persistent_avatar_reference(connection, row["sender_id"], row["sender_avatar"]),
            "recipientUsername": row["recipient_username"], "recipientDisplayName": row["recipient_display_name"], "recipientAvatar": _persistent_avatar_reference(connection, row["recipient_id"], row["recipient_avatar"]),
            "message": "Esta mensagem foi excluída" if row["deleted_at"] else row["message"], "timestamp": row["created_at"],
            "edited": bool(row["edited_at"]), "editedAt": row["edited_at"], "deleted": bool(row["deleted_at"]), "deletedAt": row["deleted_at"],
            "reactions": _reaction_map(connection, [row["message_id"]]).get(row["message_id"], {}), "deliveryStatus": "sent", "offline": False,
        }
    finally:
        connection.close()


async def send_direct_message(manager, sender_user, recipient_id, message, message_id, sender, reply_to_message_id=None):
    recipient_id = int(recipient_id)
    if recipient_id == int(sender_user["id"]):
        await sender.send_json({"type": "error", "action": "direct_message", "message": "Você não pode iniciar uma conversa privada consigo mesmo."})
        return
    recipient_user = await to_thread.run_sync(get_user_by_id, recipient_id)
    if not recipient_user:
        await sender.send_json({"type": "error", "action": "direct_message", "message": "Usuário não encontrado."})
        return
    timestamp = manager.get_timestamp()
    if message_id:
        try:
            await to_thread.run_sync(_save_direct_message, message_id, sender_user["id"], recipient_id, message, timestamp, reply_to_message_id)
        except Exception:
            await sender.send_json({"type": "error", "action": "direct_message", "message": "Não foi possível salvar a mensagem privada."})
            return
    event = {"type":"direct_message","messageId":message_id,"senderId":sender_user["id"],"recipientId":recipient_id,"userId":sender_user["id"],"username":sender_user["username"],"displayName":sender_user["displayName"],"avatar":sender_user.get("avatar", ""),"recipientUsername":recipient_user["username"],"recipientDisplayName":recipient_user["displayName"],"recipientAvatar":recipient_user.get("avatar", ""),"message":message,"timestamp":timestamp,"deliveryStatus":"sent","offline":False,"edited":False,"deleted":False,"reactions":{}}
    if reply_to_message_id:
        reply = await to_thread.run_sync(_direct_message_payload, reply_to_message_id)
        if reply:
            event["replyTo"] = {"messageId":reply["messageId"],"userId":reply["senderId"],"username":reply["username"],"displayName":reply["displayName"],"avatar":reply["avatar"],"message":reply["message"],"deleted":reply["deleted"]}
    for websocket, current in _pair_users(manager, sender_user["id"], recipient_id):
        try:
            await websocket.send_json({**event, "notifyRecipient": int(current["id"]) == recipient_id})
        except Exception:
            manager.active_connections.pop(websocket, None)
    if sender and message_id:
        await sender.send_json({"type":"direct_ack","messageId":message_id})


async def _send_to_pair(manager, data, sender_id, recipient_id):
    for websocket, _current in _pair_users(manager, sender_id, recipient_id):
        try:
            await websocket.send_json(data)
        except Exception:
            manager.active_connections.pop(websocket, None)


async def edit_direct(manager, user, message_id, message, sender):
    connection = get_connection()
    try:
        p = "%s" if using_postgres() else "?"
        target = connection.execute(f"SELECT sender_id, recipient_id FROM direct_messages WHERE message_id = {p}", (message_id,)).fetchone()
        if not target or int(target["sender_id"]) != int(user["id"]):
            await sender.send_json({"type":"error","action":"direct_message_edit","messageId":message_id,"message":"Mensagem privada não encontrada ou você não é o autor."})
            return
        edited_at = manager.get_timestamp()
        connection.execute(f"UPDATE direct_messages SET message = {p}, edited_at = {p}, deleted_at = NULL WHERE message_id = {p} AND sender_id = {p}", (message, edited_at, message_id, user["id"]))
        connection.commit()
        sender_id, recipient_id = int(target["sender_id"]), int(target["recipient_id"])
    finally:
        connection.close()
    event = {"type":"direct_message_edited", **(await to_thread.run_sync(_direct_message_payload, message_id))}
    await _send_to_pair(manager, event, sender_id, recipient_id)


async def delete_direct(manager, user, message_id, sender):
    connection = get_connection()
    try:
        p = "%s" if using_postgres() else "?"
        target = connection.execute(f"SELECT sender_id, recipient_id FROM direct_messages WHERE message_id = {p}", (message_id,)).fetchone()
        if not target or int(target["sender_id"]) != int(user["id"]):
            await sender.send_json({"type":"error","action":"direct_message_delete","messageId":message_id,"message":"Mensagem privada não encontrada ou você não é o autor."})
            return
        deleted_at = manager.get_timestamp()
        connection.execute(f"UPDATE direct_messages SET deleted_at = {p} WHERE message_id = {p} AND sender_id = {p}", (deleted_at, message_id, user["id"]))
        connection.commit()
        sender_id, recipient_id = int(target["sender_id"]), int(target["recipient_id"])
    finally:
        connection.close()
    event = {"type":"direct_message_deleted", **(await to_thread.run_sync(_direct_message_payload, message_id))}
    await _send_to_pair(manager, event, sender_id, recipient_id)


async def react_direct(manager, user, message_id, reaction, sender):
    if reaction not in REACTIONS:
        await sender.send_json({"type":"error","action":"direct_message_reaction","messageId":message_id,"message":"Reação não permitida."})
        return
    payload = await to_thread.run_sync(_direct_message_payload, message_id)
    if not payload:
        await sender.send_json({"type":"error","action":"direct_message_reaction","messageId":message_id,"message":"Mensagem privada não encontrada."})
        return
    if payload["deleted"]:
        await sender.send_json({"type":"error","action":"direct_message_reaction","messageId":message_id,"message":"Não é possível reagir a uma mensagem excluída."})
        return
    connection = get_connection()
    try:
        p = "%s" if using_postgres() else "?"
        existing = connection.execute(f"SELECT 1 FROM direct_message_reactions WHERE message_id = {p} AND user_id = {p} AND reaction = {p}", (message_id, user["id"], reaction)).fetchone()
        if existing:
            connection.execute(f"DELETE FROM direct_message_reactions WHERE message_id = {p} AND user_id = {p} AND reaction = {p}", (message_id, user["id"], reaction))
            active = False
        else:
            values_p = ", ".join([p] * 4)
            connection.execute((f"INSERT INTO direct_message_reactions (message_id, user_id, reaction, created_at) VALUES ({values_p})" if using_postgres() else f"INSERT OR IGNORE INTO direct_message_reactions (message_id, user_id, reaction, created_at) VALUES ({values_p})"), (message_id, user["id"], reaction, manager.get_timestamp()))
            active = True
        connection.commit()
        reactions = _reaction_map(connection, [message_id]).get(message_id, {})
    finally:
        connection.close()
    await _send_to_pair(manager, {"type":"direct_message_reaction","messageId":message_id,"reaction":reaction,"userId":user["id"],"active":active,"reactions":reactions}, payload["senderId"], payload["recipientId"])
