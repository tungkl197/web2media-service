from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


def parse_bool(value: str | None, default: bool) -> bool:
    if value is None or value == "":
        return default
    return value.strip().lower() not in {"0", "false", "off", "no", "disabled"}


def parse_int(value: str | None, default: int) -> int:
    try:
        return int(value) if value not in (None, "") else default
    except ValueError:
        return default


def parse_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


APP_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = Path(__file__).resolve().parents[2]

load_dotenv(PROJECT_DIR / ".env")


BG_PRESETS = [
    {"index": 0, "label": "Rung"},
    {"index": 1, "label": "Dem"},
    {"index": 2, "label": "Hoang hon"},
    {"index": 3, "label": "Ao ho"},
    {"index": 4, "label": "Nui"},
    {"index": 5, "label": "Lua"},
    {"index": 6, "label": "Bien"},
    {"index": 7, "label": "Tim"},
]

COLOR_PRESETS = [
    {"index": 0, "name": "Xanh la", "hex": "#5fdf47"},
    {"index": 1, "name": "Vang", "hex": "#f5e94a"},
    {"index": 2, "name": "Xanh lam", "hex": "#4dc8f0"},
    {"index": 3, "name": "Cam", "hex": "#f5b44a"},
    {"index": 4, "name": "Trang", "hex": "#e6e6e6"},
    {"index": 5, "name": "Hong", "hex": "#ef8ad6"},
]

DIRECTIONS = [
    "up",
    "down",
    "left",
    "right",
    "up-left",
    "up-right",
    "down-left",
    "down-right",
    "random",
]

GLOW_LEVELS = ["low", "mid", "high"]


@dataclass(frozen=True)
class ServerConfig:
    port: int = parse_int(os.getenv("PORT"), 3000)
    temp_dir: Path = PROJECT_DIR / "temp"
    public_dir: Path = PROJECT_DIR / "public"
    max_concurrent: int = parse_int(os.getenv("MAX_CONCURRENT"), 3)
    max_duration: int = 120
    audio_download_timeout: int = parse_int(os.getenv("AUDIO_DOWNLOAD_TIMEOUT"), 30000)
    max_audio_bytes: int = parse_int(os.getenv("MAX_AUDIO_BYTES"), 100 * 1024 * 1024)
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    runtime_configs_table: str = os.getenv("RUNTIME_CONFIGS_TABLE", "runtime_configs")
    runtime_config_cache_ttl_ms: int = parse_int(os.getenv("RUNTIME_CONFIG_CACHE_TTL_MS"), 60000)
    r2_upload_part_size: int = parse_int(os.getenv("R2_UPLOAD_PART_SIZE"), 16 * 1024 * 1024)
    r2_upload_queue_size: int = parse_int(os.getenv("R2_UPLOAD_QUEUE_SIZE"), 3)
    job_queue_concurrency: int = parse_int(
        os.getenv("JOB_QUEUE_CONCURRENCY"),
        parse_int(os.getenv("MAX_CONCURRENT"), 3),
    )
    job_retention_ms: int = parse_int(os.getenv("JOB_RETENTION_MS"), 24 * 60 * 60 * 1000)
    browser_gpu_enabled: bool = parse_bool(os.getenv("BROWSER_GPU_ENABLED"), True)
    browser_gpu_fallback: bool = parse_bool(os.getenv("BROWSER_GPU_FALLBACK"), True)
    browser_gpu_extra_args: list[str] = None  # type: ignore[assignment]
    ffmpeg_path: str = os.getenv("FFMPEG_PATH", "")
    ffmpeg_video_encoder: str = os.getenv("FFMPEG_VIDEO_ENCODER", "auto")
    ffmpeg_hwaccel: str = os.getenv("FFMPEG_HWACCEL", "auto")
    ffmpeg_hardware_fallback: bool = parse_bool(os.getenv("FFMPEG_HARDWARE_FALLBACK"), True)

    def __post_init__(self) -> None:
        object.__setattr__(self, "browser_gpu_extra_args", parse_list(os.getenv("BROWSER_GPU_EXTRA_ARGS")))


SERVER_CONFIG = ServerConfig()
