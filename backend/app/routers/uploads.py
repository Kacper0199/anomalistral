from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.config import get_settings
from app.models.schemas import UploadResponse
from app.services.file_handler import save_upload, validate_upload

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(file: UploadFile = File(...)) -> UploadResponse:
    settings = get_settings()
    filename, path, size = await save_upload(file, settings.UPLOAD_DIR)

    try:
        validate_upload(path)
    except Exception as exc:
        Path(path).unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return UploadResponse(filename=filename, path=path, size=size)
