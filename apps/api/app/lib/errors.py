from fastapi import HTTPException, status


def api_error(code: str, message: str, status_code: int = status.HTTP_400_BAD_REQUEST) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": {"code": code, "message": message}})
