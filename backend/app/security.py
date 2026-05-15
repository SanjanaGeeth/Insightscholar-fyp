from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

from .config import SECRET_KEY, TOKEN_TTL_SECONDS


def hash_password(password: str, salt: str | None = None) -> str:
    chosen_salt = salt or os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        chosen_salt.encode("utf-8"),
        120_000,
    ).hex()
    return f"{chosen_salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    salt, expected_digest = stored_hash.split("$", 1)
    calculated = hash_password(password, salt).split("$", 1)[1]
    return hmac.compare_digest(calculated, expected_digest)


def _b64url_encode(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).decode("utf-8").rstrip("=")


def _b64url_decode(payload: str) -> bytes:
    padding = "=" * (-len(payload) % 4)
    return base64.urlsafe_b64decode(f"{payload}{padding}")


def create_access_token(user: dict[str, Any]) -> str:
    body = {
        "sub": user["id"],
        "username": user["username"],
        "email": user["email"],
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }
    serialized = json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(SECRET_KEY.encode("utf-8"), serialized, hashlib.sha256).digest()
    return f"{_b64url_encode(serialized)}.{_b64url_encode(signature)}"


def decode_access_token(token: str) -> dict[str, Any] | None:
    if "." not in token:
        return None
    payload_part, signature_part = token.split(".", 1)
    try:
        payload = _b64url_decode(payload_part)
        provided_signature = _b64url_decode(signature_part)
    except Exception:
        return None
    expected_signature = hmac.new(SECRET_KEY.encode("utf-8"), payload, hashlib.sha256).digest()
    if not hmac.compare_digest(provided_signature, expected_signature):
        return None
    data = json.loads(payload.decode("utf-8"))
    if data.get("exp", 0) < int(time.time()):
        return None
    return data
