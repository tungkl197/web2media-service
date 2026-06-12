from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.core.config import BG_PRESETS, COLOR_PRESETS, DIRECTIONS, GLOW_LEVELS
from app.schemas.firefly import normalize_firefly_request, validation_error_response
from app.services.jobs import JobStatus, job_queue
from app.services.renderer import get_active_firefly_video_record_count


router = APIRouter()


async def read_json_body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}


@router.post("/firefly-video-record")
async def create_firefly_video_record(request: Request) -> JSONResponse:
    payload = await read_json_body(request)
    try:
        params = normalize_firefly_request(payload)
    except ValidationError as err:
        return JSONResponse(status_code=400, content=validation_error_response(err))

    has_audio = bool(params["audioUrls"])
    if has_audio and params["format"] == "gif":
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": 'Khong the ghep audio voi GIF. Vui long chon format "mp4" hoac "webm".',
            },
        )

    job = await job_queue.create_job(params)
    status_url = f"/api/firefly-video-record/status/{job['jobId']}"
    print(f"[API] Firefly video job queued: {job['jobId']}")

    return JSONResponse(
        status_code=202,
        content={
            "success": True,
            "jobId": job["jobId"],
            "status": job["status"],
            "statusUrl": status_url,
            "data": {**job, "statusUrl": status_url},
        },
    )


async def send_firefly_video_job_status(job_id: str) -> JSONResponse:
    job = await job_queue.get_job(job_id)
    if not job:
        return JSONResponse(
            status_code=404,
            content={
                "success": False,
                "error": "Khong tim thay job",
                "jobId": job_id,
            },
        )

    return JSONResponse(
        content={
            "success": job["status"] != JobStatus.FAILED,
            **job,
        }
    )


@router.get("/firefly-video-record/status/{job_id}")
async def get_firefly_video_job_status(job_id: str) -> JSONResponse:
    return await send_firefly_video_job_status(job_id)


@router.get("/firefly-video-record/{job_id}/status")
async def get_firefly_video_job_status_alias(job_id: str) -> JSONResponse:
    return await send_firefly_video_job_status(job_id)


@router.get("/firefly-video-record/{job_id}")
async def get_firefly_video_job_status_short(job_id: str) -> JSONResponse:
    return await send_firefly_video_job_status(job_id)


@router.get("/presets")
async def get_presets() -> dict[str, Any]:
    return {
        "success": True,
        "data": {
            "backgrounds": [{"index": item["index"], "label": item["label"]} for item in BG_PRESETS],
            "colors": [{"index": item["index"], "name": item["name"], "hex": item["hex"]} for item in COLOR_PRESETS],
            "directions": DIRECTIONS,
            "glowLevels": GLOW_LEVELS,
            "fpsOptions": [24, 30, 60],
            "formatOptions": ["webm", "mp4", "gif"],
        },
    }


@router.get("/health")
async def health() -> dict[str, Any]:
    return {
        "success": True,
        "status": "ok",
        "version": "1.0.0",
        "activeFireflyVideoRecords": get_active_firefly_video_record_count(),
        "fireflyVideoJobs": await job_queue.get_stats(),
    }
