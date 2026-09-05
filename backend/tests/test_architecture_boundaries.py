import ast
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_APP = REPO_ROOT / "backend" / "app"
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"


def _imports_database_facade(path: Path) -> bool:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(alias.name == "app.database" for alias in node.names):
                return True
        if isinstance(node, ast.ImportFrom) and node.module == "app.database":
            return True
    return False


def _imports_websocket_package(path: Path) -> bool:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(alias.name.startswith("app.websocket") for alias in node.names):
                return True
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("app.websocket"):
            return True
    return False


def _imports_route_package(path: Path) -> bool:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(alias.name.startswith("app.routes") for alias in node.names):
                return True
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("app.routes"):
            return True
    return False


def test_production_code_does_not_import_database_compatibility_facade():
    offenders = []
    for path in BACKEND_APP.rglob("*.py"):
        if _imports_database_facade(path):
            offenders.append(path.relative_to(REPO_ROOT).as_posix())

    assert offenders == []


def test_legacy_database_compatibility_facade_is_removed():
    assert not (BACKEND_APP / "database.py").exists()


def test_message_routes_do_not_depend_on_websocket_persistence():
    routes_file = BACKEND_APP / "routes" / "messages.py"
    assert not _imports_websocket_package(routes_file)


def test_message_routes_do_not_depend_on_other_http_routes():
    routes_file = BACKEND_APP / "routes" / "messages.py"
    assert not _imports_route_package(routes_file)


def test_http_auth_dependency_does_not_depend_on_route_modules():
    dependency_file = BACKEND_APP / "dependencies.py"
    assert dependency_file.exists()
    assert not _imports_route_package(dependency_file)


def test_auth_service_uses_repository_boundaries():
    auth_file = BACKEND_APP / "auth.py"
    source = auth_file.read_text(encoding="utf-8")
    assert "app.repositories" in source
    assert "app.infrastructure.database" not in source


def test_direct_message_persistence_has_a_repository_boundary():
    repository = BACKEND_APP / "repositories" / "direct_message_repository.py"
    feature = BACKEND_APP / "websocket" / "direct_message_features.py"

    assert repository.exists()
    assert "from app.infrastructure.database" in repository.read_text(encoding="utf-8")
    assert "get_connection" not in feature.read_text(encoding="utf-8")
    assert "using_postgres" not in feature.read_text(encoding="utf-8")


def test_websocket_endpoint_remains_transport_only():
    endpoint = (BACKEND_APP / "websocket" / "endpoint.py").read_text(encoding="utf-8")

    assert "dispatch_event" in endpoint
    assert "if event_type ==" not in endpoint
    assert "ChatMessageEvent" not in endpoint
    assert "DirectMessageEvent" not in endpoint
    assert "handle_public_message" not in endpoint


def test_connection_manager_does_not_own_public_message_operations():
    chat_source = (BACKEND_APP / "websocket" / "chat.py").read_text(encoding="utf-8")

    assert "app.services.public_messages" not in chat_source
    assert "async def send_message" not in chat_source
    assert "async def edit_message" not in chat_source
    assert "async def delete_message" not in chat_source
    assert "async def toggle_reaction" not in chat_source
    assert "resolve_message_owner" not in chat_source


def test_public_message_service_owns_message_operations():
    service = BACKEND_APP / "services" / "public_messages.py"

    for function_name in (
        "async def send_message",
        "async def edit_message",
        "async def delete_message",
        "async def toggle_reaction",
    ):
        assert function_name in service.read_text(encoding="utf-8")


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
    assert (FRONTEND_SRC / "hooks" / "useUserDirectory.js").exists()
    assert not (FRONTEND_SRC / "hooks" / "useUserProfiles.js").exists()


def test_runtime_moderation_compatibility_layer_is_gone():
    assert not (BACKEND_APP / "services" / "moderation_compat.py").exists()


def test_legacy_direct_message_module_is_removed():
    assert not (BACKEND_APP / "direct_messages.py").exists()
    assert not (BACKEND_APP / "websocket" / "direct_messages.py").exists()
