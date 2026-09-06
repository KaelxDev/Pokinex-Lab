

def test_public_bot_commands_have_a_dedicated_service():
    bot_service = BACKEND_APP / "services" / "bot_commands.py"
    moderation_service = BACKEND_APP / "services" / "moderation_commands.py"

    assert bot_service.exists()
    bot_source = bot_service.read_text(encoding="utf-8")
    moderation_source = moderation_service.read_text(encoding="utf-8")

    assert "async def send_bot_message" in bot_source
    assert "async def handle_public_bot_command" in bot_source
    assert "async def send_bot_message" not in moderation_source
    assert "def online_user_count" not in moderation_source


def test_frontend_has_one_canonical_application_shell():
    main_source = (FRONTEND_SRC / "main.jsx").read_text(encoding="utf-8")

    assert 'from "./App.jsx"' in main_source
    assert 'from "./AppEdit.jsx"' not in main_source
    assert not (FRONTEND_SRC / "AppEdit.jsx").exists()


def test_frontend_user_directory_has_replaced_legacy_profile_hook():
    assert (FRONTEND_SRC / "hooks" / "useUserDirectory.ts").exists()
    assert not (FRONTEND_SRC / "hooks" / "useUserProfiles.js").exists()


def test_runtime_moderation_compatibility_layer_is_gone():
    assert not (BACKEND_APP / "services" / "moderation_compat.py").exists()


def test_legacy_direct_message_module_is_removed():
    assert not (BACKEND_APP / "direct_messages.py").exists()
    assert not (BACKEND_APP / "websocket" / "direct_messages.py").exists()
