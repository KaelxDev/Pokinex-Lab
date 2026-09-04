import os
import re

DEFAULT_ALLOWED_ORIGINS = frozenset(
    {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://nex-chat-one-eta.vercel.app",
        "https://nexchat-chat.vercel.app",
        "https://pokinex.vercel.app",
        "https://pokinex-chat.vercel.app",
    }
)

# Vercel creates unique preview URLs for branches/deployments. Keep the
# allowlist scoped to the Pokinex project instead of accepting every Vercel app.
POKINEX_VERCEL_ORIGIN = re.compile(
    r"^https://(?:pokinex|pokinex-chat)(?:-git-[a-z0-9][a-z0-9-]*-kael-xd-ev)?\.vercel\.app$"
)


def _load_allowed_origins() -> frozenset[str]:
    configured = os.getenv("ALLOWED_ORIGINS", "")
    if not configured.strip():
        return DEFAULT_ALLOWED_ORIGINS

    origins = {
        origin.strip().rstrip("/")
        for origin in configured.split(",")
        if origin.strip()
    }
    return frozenset(origins)


ALLOWED_ORIGINS = _load_allowed_origins()


def is_allowed_origin(origin: str | None) -> bool:
    if not origin:
        return True

    normalized = origin.rstrip("/")
    return normalized in ALLOWED_ORIGINS or bool(POKINEX_VERCEL_ORIGIN.fullmatch(normalized))
