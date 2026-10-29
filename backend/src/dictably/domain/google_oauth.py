from __future__ import annotations

import base64
import hashlib
import json
import re
import secrets
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
from joserfc import jwt
from joserfc.jwk import KeySet
from joserfc.jwt import JWTClaimsRegistry

from dictably.core.config import Settings

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"

DEFAULT_NEXT_PATH = "/app/"

# Internal app/admin paths only (T-037 return-after-login). No open redirects.
_SAFE_NEXT = re.compile(r"^/(?:uk/)?(?:app(?:/[\w./-]*)?|admin/?)$")
_SAFE_QUERY = re.compile(r"^[\w%=&.,+-]+$")


@dataclass(frozen=True)
class OAuthPending:
    state: str
    code_verifier: str
    next_path: str


def sanitize_next_path(raw: str | None) -> str:
    if not raw or not raw.startswith("/") or raw.startswith("//"):
        return DEFAULT_NEXT_PATH
    if "://" in raw or ".." in raw or "\\" in raw or "\n" in raw or "\r" in raw:
        return DEFAULT_NEXT_PATH
    path, _, query = raw.partition("?")
    if not _SAFE_NEXT.fullmatch(path):
        return DEFAULT_NEXT_PATH
    if query and not _SAFE_QUERY.fullmatch(query):
        return DEFAULT_NEXT_PATH
    return f"{path}?{query}" if query else path


def new_oauth_state() -> str:
    return secrets.token_urlsafe(24)


def new_code_verifier() -> str:
    return secrets.token_urlsafe(64)


def code_challenge_s256(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def pack_oauth_cookie(pending: OAuthPending) -> str:
    payload = {
        "s": pending.state,
        "v": pending.code_verifier,
        "n": pending.next_path,
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


def unpack_oauth_cookie(raw: str | None) -> OAuthPending | None:
    if not raw:
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(raw.encode("ascii")))
        state = data["s"]
        verifier = data["v"]
        next_path = sanitize_next_path(data.get("n"))
        if not isinstance(state, str) or not isinstance(verifier, str):
            return None
        return OAuthPending(state=state, code_verifier=verifier, next_path=next_path)
    except (KeyError, ValueError, json.JSONDecodeError, TypeError):
        return None


def build_google_authorize_url(
    settings: Settings,
    *,
    state: str,
    code_challenge: str,
) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_id_token(
    settings: Settings,
    code: str,
    *,
    code_verifier: str,
) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        token_res = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            },
        )
        token_res.raise_for_status()
        tokens = token_res.json()
        id_token = tokens.get("id_token")
        if not id_token:
            raise ValueError("Google token response missing id_token")

        jwks_res = await client.get(GOOGLE_JWKS_URL)
        jwks_res.raise_for_status()
        key_set = KeySet.import_key_set(jwks_res.json())

    token = jwt.decode(id_token, key_set)
    claims_requests = JWTClaimsRegistry(
        exp={"essential": True},
        iss={
            "essential": True,
            "values": ["https://accounts.google.com", "accounts.google.com"],
        },
        aud={"essential": True, "value": settings.google_client_id},
    )
    claims_requests.validate(token.claims)
    return dict(token.claims)
