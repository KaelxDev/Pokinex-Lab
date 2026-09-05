from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_APP = REPO_ROOT / "backend" / "app"
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"


def test_production_code_does_not_use_database_compatibility_facade():
    offenders = []
    for path in BACKEND_APP.rglob("*.py"):
        if path.name == "database.py":
            continue
        text = path.read_text(encoding="utf-8")
        if "app.database" in text:
            offenders.append(path.relative_to(REPO_ROOT).as_posix())

    assert offenders == []


def test_websocket_endpoint_remains_transport_only():
    endpoint = (BACKEND_APP / "websocket" / "endpoint.py").read_text(encoding="utf-8")

    assert "dispatch_event" in endpoint
    assert "if event_type ==" not in endpoint
    assert "ChatMessageEvent" not in endpoint
    assert "DirectMessageEvent" not in endpoint
    assert "handle_public_message" not in endpoint


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
