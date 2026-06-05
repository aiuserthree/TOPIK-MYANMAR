from fastapi import APIRouter, status

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status", status_code=status.HTTP_200_OK)
async def auth_status() -> dict[str, str]:
    return {"status": "placeholder", "message": "Auth migration is not implemented yet."}
