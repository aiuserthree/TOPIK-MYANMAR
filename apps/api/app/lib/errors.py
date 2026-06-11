from fastapi import HTTPException, status

from app.lib.fo_messages import fo_message


def api_error(code: str, message: str, status_code: int = status.HTTP_400_BAD_REQUEST) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": {"code": code, "message": message}})


def fo_api_error(
    code: str,
    msg_key: str,
    lang: str | None = None,
    status_code: int = status.HTTP_400_BAD_REQUEST,
    **params: str | int,
) -> HTTPException:
    return api_error(code, fo_message(msg_key, lang, **params), status_code)
