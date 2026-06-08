from __future__ import annotations

from typing import Any

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


def verify_google_id_token(raw_token: str, client_id: str) -> dict[str, Any]:
    """Verify a Google Identity Services ID token and return JWT claims."""
    return id_token.verify_oauth2_token(raw_token, google_requests.Request(), client_id)
