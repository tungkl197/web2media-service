from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import JSONResponse

from app.api.record import router as record_router
from app.api.thumbnail import router as thumbnail_router
from app.config import SERVER_CONFIG
from app.openapi import build_custom_openapi
from app.services.renderer import close_browser


@asynccontextmanager
async def lifespan(app: FastAPI):
    SERVER_CONFIG.temp_dir.mkdir(parents=True, exist_ok=True)
    try:
        yield
    finally:
        await close_browser()
        cleaned = 0
        for path in SERVER_CONFIG.temp_dir.iterdir():
            if path.is_file():
                path.unlink(missing_ok=True)
                cleaned += 1
        print(f"[Server] Cleaned up {cleaned} temp files.")


app = FastAPI(
    title="Web2Media Service",
    version="1.0.0",
    description="Server-side API để tạo video animation và thumbnail.",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logger(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - started) * 1000)
    icon = "->" if response.status_code < 400 else "x"
    print(f"{icon} {request.method} {request.url.path} - {response.status_code} ({duration_ms}ms)")
    return response


@app.exception_handler(RequestValidationError)
async def request_validation_handler(request: Request, exc: RequestValidationError):
    if any(error.get("type") == "json_invalid" for error in exc.errors()):
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": "JSON không hợp lệ. Kiểm tra lại cú pháp (dấu phẩy thừa, thiếu ngoặc kép...).",
            },
        )

    return JSONResponse(status_code=422, content={"detail": exc.errors()})


app.mount("/public", StaticFiles(directory=str(SERVER_CONFIG.public_dir)), name="public")
app.include_router(record_router)
app.include_router(thumbnail_router)


def custom_openapi():
    return build_custom_openapi(app)


app.openapi = custom_openapi


@app.get("/")
async def root():
    return {
        "name": "Web2Media Service",
        "version": "1.0.0",
        "description": "Server-side API để tạo video animation và thumbnail",
        "documentation": f"http://localhost:{SERVER_CONFIG.port}/docs",
        "endpoints": {
            "POST /api/record": "Tạo video với cấu hình tùy chỉnh",
            "POST /api/generate-thumbnail": "Tạo thumbnail PNG và upload",
            "GET /api/presets": "Danh sách preset có sẵn",
            "GET /api/health": "Kiểm tra trạng thái server",
            "GET /docs": "Swagger UI - Interactive API documentation",
        },
    }


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={"success": False, "error": f"Không tìm thấy: {request.method} {request.url.path}"},
    )
