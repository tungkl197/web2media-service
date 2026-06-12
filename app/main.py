from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.firefly_video_record import router as firefly_router
from app.core.config import SERVER_CONFIG
from app.services.renderer import close_browser


@asynccontextmanager
async def lifespan(app: FastAPI):
    SERVER_CONFIG.temp_dir.mkdir(parents=True, exist_ok=True)
    yield
    await close_browser()


app = FastAPI(
    title="Web2Media Service",
    version="1.0.0",
    description="Python service for async firefly video rendering, audio merge, and R2 upload.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/public", StaticFiles(directory=str(SERVER_CONFIG.public_dir)), name="public")


@app.middleware("http")
async def request_logger(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000)
    icon = "->" if response.status_code < 400 else "x"
    print(f"{icon} {request.method} {request.url.path} - {response.status_code} ({duration_ms}ms)")
    return response


app.include_router(firefly_router, prefix="/api")


@app.get("/")
async def root() -> dict[str, Any]:
    return {
        "name": "Web2Media Service",
        "version": "1.0.0",
        "description": "Server-side API tao video firefly",
        "documentation": f"http://localhost:{SERVER_CONFIG.port}/docs",
        "endpoints": {
            "POST /api/firefly-video-record": "Tao job video firefly va tra ve jobId",
            "GET /api/firefly-video-record/status/:jobId": "Kiem tra status job, status done se co R2 URL",
            "GET /api/presets": "Danh sach preset co san",
            "GET /api/health": "Kiem tra trang thai server",
            "GET /docs": "Swagger UI",
        },
    }


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    print(f"[Server] Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": str(exc) or "Loi server noi bo",
        },
    )
