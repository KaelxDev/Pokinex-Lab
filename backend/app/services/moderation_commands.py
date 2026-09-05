"""Administrative moderation command handling."""

from anyio import to_thread

from app.moderation_bot import BOT_USER, moderation_bot
from app.moderation_store import (
    clear_all_messages,
    clear_recent_messages,
    clear_user_messages,
    delete_single_message,
    get_user_by_username,
)
from app.roles import has_moderator_access
from app.services.bot_commands import handle_public_bot_command, online_user_count, send_bot_message
from app.services.public_identity import public_user_payload
from app.websocket.chat import manager


def find_online_user(username: str):
    normalized = username.casefold()
    for user in manager.active_connections.values():
        if str(user.get("username", "")).casefold() == normalized:
            return user
    return None


def command_args(message: str) -> list[str]:
    return message.strip().split()


def parse_clear_limit(value: str | None) -> int | None:
    if value is None or value.casefold() == "all":
        return None
    try:
        amount = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("A quantidade precisa ser um número ou 'all'.") from exc
    if amount < 1 or amount > 100:
        raise ValueError("A quantidade deve ficar entre 1 e 100 mensagens.")
    return amount


async def broadcast_messages_cleared(
    message_ids: list[str],
    moderator_username: str,
    moderator_role: str | None = None,
) -> None:
    if not message_ids:
        return
    await manager.broadcast(
        {
            "type": "messages_cleared",
            "messageIds": message_ids,
            "count": len(message_ids),
            "moderator": moderator_username,
            "moderatorRole": moderator_role or "moderator",
            "timestamp": manager.get_timestamp(),
        }
    )


async def broadcast_chat_reset(command_message: dict) -> None:
    await manager.broadcast(
        {
            "type": "chat_reset",
            "commandMessage": command_message,
            "timestamp": manager.get_timestamp(),
        }
    )


async def handle_moderation_command(
    websocket,
    user,
    message: str,
    message_id: str | None = None,
) -> bool:
    """Handle public bot commands and staff moderation commands."""
    if not message.startswith("!"):
        return False

    command = moderation_bot.command_name(message)
    if await handle_public_bot_command(message, user_id=user["id"]):
        return True

    moderator = has_moderator_access(user)
    if command == "!mod":
        if not moderator:
            await send_bot_message(
                "🔒 O modo moderador está disponível apenas para a equipe autorizada."
            )
            return True

        args = command_args(message)
        await websocket.send_json({"type": "moderator_session", "enabled": True})
        if len(args) > 1 and args[1].casefold() == "help":
            await send_bot_message(moderation_bot.MOD_HELP)
        else:
            await send_bot_message(
                "🛡️ Modo moderador ativo. Use !mod help para ver os comandos administrativos."
            )
        return True

    if not moderator:
        await send_bot_message("❌ Comando não reconhecido. Use !help para ver os comandos públicos.")
        return True

    args = command_args(message)
    moderator_role = public_user_payload(user).get("role")

    if command in {"!clear", "!purge"}:
        try:
            target = args[1] if len(args) > 1 else None

            if target and target.startswith("@"):
                target_username = target[1:].strip().casefold()
                if not target_username:
                    await send_bot_message("🧹 Use: !clear @usuário [quantidade|all].")
                    return True

                target_user = get_user_by_username(target_username)
                if not target_user:
                    await send_bot_message(f"❌ Usuário @{target_username} não encontrado.")
                    return True

                limit = parse_clear_limit(args[2] if len(args) > 2 else "all")
                message_ids = await to_thread.run_sync(
                    clear_user_messages,
                    target_user["id"],
                    limit,
                )
                await broadcast_messages_cleared(
                    message_ids,
                    user["username"],
                    moderator_role,
                )
                if limit is not None:
                    await send_bot_message(
                        f"🧹 {len(message_ids)} mensagem(ns) removida(s) de @{target_user['username']}."
                    )
                else:
                    await send_bot_message(
                        f"🧹 Todas as mensagens de @{target_user['username']} foram removidas ({len(message_ids)})."
                    )
                return True

            if target and target.casefold() == "all":
                message_ids = await to_thread.run_sync(clear_all_messages)
                command_message = {
                    "type": "message",
                    "messageId": message_id
                    or f"modcmd-{manager.sequence + 1}-{manager.get_timestamp()}",
                    **public_user_payload(user),
                    "message": message,
                    "timestamp": manager.get_timestamp(),
                    "ephemeral": True,
                    "deliveryStatus": "sent",
                    "offline": False,
                }
                await broadcast_chat_reset(command_message)
                await send_bot_message(
                    f"Histórico do #geral apagado. {len(message_ids)} mensagem(ns) removida(s)."
                )
                return True

            limit = parse_clear_limit(target or "50")
            message_ids = await to_thread.run_sync(clear_recent_messages, limit)
            await broadcast_messages_cleared(
                message_ids,
                user["username"],
                moderator_role,
            )
            await send_bot_message(
                f"🧹 {len(message_ids)} mensagem(ns) recente(s) removida(s) do #geral."
            )
            return True
        except ValueError as exc:
            await send_bot_message(f"🧹 {exc}")
            return True

    if command in {"!delete", "!del"}:
        if len(args) < 2:
            await send_bot_message("🗑️ Use: !delete <message_id>.")
            return True
        target_message_id = args[1].strip()
        if not target_message_id or target_message_id.startswith("@"):
            await send_bot_message(
                "🗑️ O alvo precisa ser o ID exato da mensagem. Para um usuário, use !clear @usuário."
            )
            return True

        deleted = await to_thread.run_sync(delete_single_message, target_message_id)
        if not deleted:
            await send_bot_message(
                f"❌ Mensagem `{target_message_id}` não encontrada ou já removida."
            )
            return True

        await broadcast_messages_cleared(
            [target_message_id],
            user["username"],
            moderator_role,
        )
        await send_bot_message(f"🗑️ Mensagem `{target_message_id}` removida.")
        return True

    if command in {"!warn", "!mute", "!unmute", "!kick"}:
        if len(args) < 2:
            await send_bot_message(f"Use: {command} @usuário ...")
            return True

        target_username = args[1].lstrip("@").casefold()
        target = find_online_user(target_username)
        if not target:
            await send_bot_message(f"❌ Usuário @{target_username} não está online.")
            return True
        if target["id"] == user["id"]:
            await send_bot_message("❌ Essa ação não pode ser aplicada a você mesmo.")
            return True
        if target["id"] == BOT_USER["id"]:
            await send_bot_message("🤖 O PokiBot não pode ser moderado.")
            return True
        if has_moderator_access(target):
            await send_bot_message("🛡️ Moderadores não podem ser punidos por este conjunto de comandos.")
            return True

        if command == "!warn":
            reason = " ".join(args[2:]).strip() or "Comportamento fora das regras do canal."
            await send_bot_message(f"⚠️ @{target['username']} recebeu um aviso: {reason}")
            return True

        if command == "!mute":
            if len(args) < 3:
                await send_bot_message("🔇 Use: !mute @usuário [minutos].")
                return True
            try:
                minutes = int(args[2])
            except ValueError:
                await send_bot_message("🔇 Os minutos precisam ser um número.")
                return True
            if minutes < 1 or minutes > 1440:
                await send_bot_message("🔇 O mute pode durar de 1 a 1440 minutos.")
                return True
            moderation_bot.mute(target["id"], minutes)
            await send_bot_message(
                f"🔇 @{target['username']} foi silenciado por {minutes} minuto(s)."
            )
            return True

        if command == "!unmute":
            moderation_bot.unmute(target["id"])
            await send_bot_message(f"🔊 @{target['username']} foi dessilenciado.")
            return True

        if command == "!kick":
            await send_bot_message(
                f"👢 @{target['username']} foi removido do #geral por um moderador."
            )
            for target_socket, current in list(manager.active_connections.items()):
                if current["id"] == target["id"]:
                    try:
                        await target_socket.close(
                            code=4003,
                            reason="Removido por um moderador",
                        )
                    except Exception:
                        pass
                    manager.active_connections.pop(target_socket, None)
            await manager.send_users()
            return True

    await send_bot_message(moderation_bot.MOD_HELP)
    return True
