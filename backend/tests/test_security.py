import asyncio

from starlette.requests import Request
from starlette.responses import Response

from app.main import _validate_websocket_origin, _websocket_token
from app.routes.auth import set_session_cookie
from app.security import is_allowed_origin


class DummyWebSocket:
    def __init__(self, origin=None, cookies=None, query_params=None):
        self.headers = {}
        if origin is not None:
            self.headers["origin"] = origin
        self.cookies = cookies or {}
        self.query_params = query_params or {}
        self.closed = False
        self.close_code = None
        self.close_reason = None

    async def close(self, code=None, reason=None):
        self.closed = True
        self.close_code = code
        self.close_reason = reason


def make_request(scheme="https", headers=None):
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": scheme,
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()],
        "server": ("nexchat-backend-2cyf.onrender.com", 443 if scheme == "https" else 80),
        "client": ("127.0.0.1", 12345),
        "root_path": "",
    }
    return Request(scope)


def test_allowed_origins_are_exact():
    assert is_allowed_origin("https://nexchat-chat.vercel.app")
    assert is_allowed_origin("https://nex-chat-one-eta.vercel.app")
    assert is_allowed_origin("http://localhost:5173")
    assert not is_allowed_origin("https://evil.vercel.app")
    assert not is_allowed_origin("https://nexchat-chat.vercel.app.evil.example")
    assert is_allowed_origin(None)


def test_session_cookie_uses_secure_cross_site_settings():
    request = make_request("https")
    response = Response()

    set_session_cookie(response, request, "test-token")

    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "Secure" in cookie
    assert "SameSite=none" in cookie
    assert "Max-Age=2592000" in cookie
    assert "Path=/" in cookie


def test_session_cookie_is_usable_on_local_http():
    request = make_request("http")
    response = Response()

    set_session_cookie(response, request, "test-token")

    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Secure" not in cookie


def test_websocket_origin_is_rejected_for_unknown_origin():
    websocket = DummyWebSocket(origin="https://evil.example")

    allowed = asyncio.run(_validate_websocket_origin(websocket))

    assert allowed is False
    assert websocket.closed is True
    assert websocket.close_code == 1008


def test_websocket_uses_cookie_only():
    cookie_socket = DummyWebSocket(
        cookies={"session": "cookie-token"},
        query_params={"token": "legacy-token"},
    )
    legacy_socket = DummyWebSocket(query_params={"token": "legacy-token"})

    assert _websocket_token(cookie_socket) == "cookie-token"
    assert _websocket_token(legacy_socket) is None
