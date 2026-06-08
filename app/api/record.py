from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body
from pydantic import ValidationError
from starlette.background import BackgroundTask
from starlette.responses import FileResponse, JSONResponse

from app.config import BG_PRESETS, COLOR_PRESETS, DIRECTIONS, GLOW_LEVELS
from app.schemas import RecordRequest, format_record_errors
from app.services.converter import convert, get_mime_type
from app.services.renderer import get_active_count, render_video


router = APIRouter(prefix="/api")


def _cleanup_file(path: Path) -> None:
    path.unlink(missing_ok=True)


@router.post("/record")
async def record_video(payload: dict[str, Any] | None = Body(default_factory=dict)):
    try:
        params = RecordRequest.model_validate(payload or {})
    except ValidationError as exc:
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": "Tham số không hợp lệ",
                "details": format_record_errors(exc),
            },
        )

    webm_path: Path | None = None
    output_path: Path | None = None

    try:
        webm_path = await render_video(params)
        output_path = await convert(
            webm_path,
            params.format,
            bitrate=params.bitrate,
            fps=params.fps,
            width=params.width,
        )
        filename = f"{params.filename}.{params.format}"
        return FileResponse(
            output_path,
            media_type=get_mime_type(params.format),
            filename=filename,
            background=BackgroundTask(_cleanup_file, output_path),
        )
    except Exception as exc:
        if output_path:
            output_path.unlink(missing_ok=True)
        elif webm_path:
            webm_path.unlink(missing_ok=True)

        error = str(exc) or "Lỗi không xác định khi tạo video"
        status_code = 429 if "giới hạn" in error else 500
        return JSONResponse(status_code=status_code, content={"success": False, "error": error})


@router.get("/presets")
async def get_presets():
    return {
        "success": True,
        "data": {
            "backgrounds": [{"index": item["index"], "label": item["label"]} for item in BG_PRESETS],
            "colors": [
                {"index": item["index"], "name": item["name"], "hex": item["hex"]}
                for item in COLOR_PRESETS
            ],
            "directions": DIRECTIONS,
            "glowLevels": GLOW_LEVELS,
            "fpsOptions": [24, 30, 60],
            "formatOptions": ["webm", "mp4", "gif"],
        },
    }


@router.get("/health")
async def health_check():
    from datetime import datetime, timezone

    return {
        "success": True,
        "status": "ok",
        "version": "1.0.0",
        "activeRecordings": get_active_count(),
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
