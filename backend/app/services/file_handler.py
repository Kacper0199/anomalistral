from pathlib import Path
from uuid import uuid4

import aiofiles
import pandas as pd
from fastapi import UploadFile


async def save_upload(file: UploadFile, upload_dir: str) -> tuple[str, str, int]:
    target_dir = Path(upload_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    original_name = Path(file.filename or "upload").name
    filename = f"{uuid4().hex}_{original_name}"
    filepath = target_dir / filename
    size = 0

    async with aiofiles.open(filepath, "wb") as destination:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            await destination.write(chunk)

    await file.close()
    return filename, str(filepath), size


def validate_upload(filepath: str) -> dict:
    path = Path(filepath)
    suffix = path.suffix.lower()

    if suffix == ".csv":
        frame = pd.read_csv(path)
    elif suffix == ".json":
        frame = pd.read_json(path)
    else:
        raise ValueError("Unsupported file format. Only CSV and JSON are allowed")

    if frame.empty:
        raise ValueError("Uploaded dataset is empty")

    columns = [str(column) for column in frame.columns]
    dtypes = {str(column): str(dtype) for column, dtype in frame.dtypes.items()}
    null_counts = {str(column): int(count) for column, count in frame.isnull().sum().to_dict().items()}

    return {
        "rows": int(len(frame)),
        "columns": columns,
        "dtypes": dtypes,
        "null_counts": null_counts,
    }
