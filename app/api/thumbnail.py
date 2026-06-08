from __future__ import annotations

import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Body
from jinja2 import Environment, FileSystemLoader
from pydantic import ValidationError
from starlette.responses import JSONResponse

from app.config import SERVER_CONFIG
from app.schemas import ThumbnailRequest, format_thumbnail_errors
from app.services.renderer import get_active_count, render_thumbnail
from app.utils.file_helper import buffer_to_base64_uri, file_to_base64_uri
from app.utils.text_parser import parse_colored_text


router = APIRouter(prefix="/api")

template_env = Environment(
    loader=FileSystemLoader(str(SERVER_CONFIG.thumbnail_template_dir)),
    autoescape=False,
)
_cached_background_base64: str | None = None


def get_background_base64() -> str:
    global _cached_background_base64

    if _cached_background_base64 is None:
        if SERVER_CONFIG.background_path.exists():
            _cached_background_base64 = file_to_base64_uri(SERVER_CONFIG.background_path)
        else:
            print(f"[Thumbnail] Background image not found at {SERVER_CONFIG.background_path}")
            return ""

    return _cached_background_base64


async def download_image_as_base64(url: str) -> str:
    async with httpx.AsyncClient(timeout=SERVER_CONFIG.download_timeout / 1000) as client:
        response = await client.get(url)
        response.raise_for_status()
        mime_type = response.headers.get("content-type", "image/jpeg")
        return buffer_to_base64_uri(response.content, mime_type)


@router.post("/generate-thumbnail")
async def generate_thumbnail(payload: dict[str, Any] | None = Body(default=None)):
    try:
        params = ThumbnailRequest.model_validate(payload or {})
    except ValidationError as exc:
        return JSONResponse(
            status_code=422,
            content={
                "error": "Validation failed",
                "details": format_thumbnail_errors(exc),
            },
        )

    if get_active_count() >= SERVER_CONFIG.max_concurrent:
        return JSONResponse(
            status_code=429,
            content={
                "success": False,
                "error": f"Đã đạt giới hạn {SERVER_CONFIG.max_concurrent} tiến trình đồng thời. Vui lòng thử lại sau.",
            },
        )

    try:
        girl_base64 = await download_image_as_base64(params.r2_url)
        text_html = parse_colored_text(params.text)
        html_content = template_env.get_template("thumbnail.html").render(
            girl_image=girl_base64,
            background_image=get_background_base64(),
            text_html=text_html,
        )

        png_buffer = await render_thumbnail(html_content)
        upload_endpoint = f"{params.upload_url.rstrip('/')}/api/public/v1/upload"
        files = {
            "file": (
                f"{uuid.uuid4()}.png",
                png_buffer,
                "image/png",
            )
        }

        async with httpx.AsyncClient(timeout=SERVER_CONFIG.upload_timeout / 1000) as client:
            upload_response = await client.post(
                upload_endpoint,
                files=files,
                headers={"Authorization": params.api_key},
            )
            upload_response.raise_for_status()

        try:
            content = upload_response.json()
        except ValueError:
            content = {"data": upload_response.text}

        return JSONResponse(status_code=upload_response.status_code, content=content)
    except httpx.HTTPStatusError as exc:
        request_url = str(exc.request.url)
        if request_url.endswith("/api/public/v1/upload"):
            try:
                detail = exc.response.json()
            except ValueError:
                detail = exc.response.text
            return JSONResponse(
                status_code=502,
                content={
                    "error": f"Upload API returned error: {exc.response.status_code}",
                    "detail": detail,
                },
            )

        return JSONResponse(
            status_code=400,
            content={"error": f"Failed to download image from R2: {exc.response.status_code}"},
        )
    except httpx.HTTPError as exc:
        return JSONResponse(status_code=400, content={"error": f"Request failed: {exc}"})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"error": str(exc)})
